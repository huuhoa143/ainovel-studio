package serve

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/huuhoa143/ainovel-studio/internal/domain"
	"github.com/huuhoa143/ainovel-studio/internal/store"
)

// pollInterval là nhịp hỏi lại runtime queue.
//
// Đây là polling, không phải push, vì engine ở process khác — không có kênh
// thông báo liên tiến-trình. 700ms đủ để cảm giác "đang sống" mà không nghiền
// đĩa: mỗi lượt là một lần đọc tệp JSONL.
const pollInterval = 700 * time.Millisecond

// heartbeatInterval giữ kết nối sống qua proxy hay trình duyệt hay tự ngắt kết
// nối rảnh. Comment SSE (dòng bắt đầu bằng ':') không sinh sự kiện phía client.
const heartbeatInterval = 20 * time.Second

// sseEvent là một sự kiện đẩy xuống giao diện.
type sseEvent struct {
	Seq      int64  `json:"seq"`
	Time     string `json:"time"`
	Kind     string `json:"kind"`
	Category string `json:"category,omitempty"`
	Agent    string `json:"agent,omitempty"`
	Summary  string `json:"summary,omitempty"`
	Payload  any    `json:"payload,omitempty"`
}

func (s *server) handleEvents(w http.ResponseWriter, r *http.Request) {
	st, err := s.openBook(r.PathValue("book"))
	if err != nil {
		writeErr(w, http.StatusNotFound, err)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeErr(w, http.StatusInternalServerError, fmt.Errorf("kết nối này không hỗ trợ đẩy dữ liệu theo dòng"))
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Connection", "keep-alive")
	// Tắt đệm của proxy ngược: nginx sẽ giữ lại nội dung SSE cho đủ buffer rồi
	// mới nhả, làm dòng sự kiện đến muộn hàng chục giây.
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	lastSeq := resumeSeq(r)

	// Đẩy ngay các sự kiện đã có sau lastSeq trước khi vào vòng chờ, để client
	// kết nối lại không phải đợi hết một nhịp poll mới thấy phần đã bỏ lỡ.
	lastSeq = pump(w, flusher, st, lastSeq)

	// Bộ đệm văn sống của phiên engine, nếu cuốn này đang mở engine.
	//
	// `s.may == nil` là chế độ chỉ đọc (không có bộ giám sát) và `dangMo` lỗi là engine chưa
	// mở. Cả hai KHÔNG phải lỗi của yêu cầu này: dòng sự kiện vẫn chạy, chỉ là không có văn
	// sống nào để phát.
	var van *dongVan
	if s.may != nil {
		if p, err := s.may.dangMo(r.PathValue("book")); err == nil {
			van = p.van
		}
	}
	var mocVan int64
	if van != nil {
		// Người mới nối phải thấy CẢ đoạn đang chảy, không phải nửa cuối một câu. Gửi lệnh
		// xóa trước để giao diện không dán đoạn này vào phần cũ của nó.
		vong, moc := van.vongHienTai()
		mocVan = moc
		if vong != "" {
			writeSSEKhongID(w, "stream_clear", struct{}{})
			writeSSEKhongID(w, "stream_delta", map[string]string{"text": vong})
			flusher.Flush()
		}
	}

	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()
	beat := time.NewTicker(heartbeatInterval)
	defer beat.Stop()

	ctx := r.Context()
	for {
		// Đăng ký TRƯỚC khi đọc: mẩu đến giữa hai bước sẽ không đánh thức ai nếu làm ngược,
		// và kết nối treo tới nhịp sau — chữ đứng im dù engine đang phát.
		var choVan <-chan struct{}
		if van != nil {
			choVan = van.doi()
			if moi := bomVan(w, flusher, van, mocVan); moi != mocVan {
				mocVan = moi
				continue // còn mẩu thì vòng lại ngay, đừng chờ
			}
		}

		select {
		case <-ctx.Done():
			return
		case <-choVan:
			// vòng lại để bơm; `choVan` nil thì nhánh này không bao giờ chọn được
		case <-beat.C:
			fmt.Fprint(w, ": nhịp\n\n")
			flusher.Flush()
		case <-ticker.C:
			lastSeq = pump(w, flusher, st, lastSeq)
		}
	}
}

// resumeSeq lấy điểm tiếp tục: ưu tiên Last-Event-ID do trình duyệt tự gửi khi
// tự kết nối lại, sau đó tới tham số ?after do client chủ động đưa (giao diện
// lấy nó từ Snapshot.QueueSeq để không bỏ sót sự kiện phát ra giữa lúc tải
// trang và lúc mở stream).
func resumeSeq(r *http.Request) int64 {
	if v := r.Header.Get("Last-Event-ID"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n >= 0 {
			return n
		}
	}
	if n, err := strconv.ParseInt(r.URL.Query().Get("after"), 10, 64); err == nil && n >= 0 {
		return n
	}
	return 0
}

// pump đẩy mọi mục mới sau afterSeq và trả về seq cuối đã đẩy.
func pump(w http.ResponseWriter, flusher http.Flusher, st *store.Store, afterSeq int64) int64 {
	items, err := st.Runtime.LoadQueueAfter(afterSeq)
	if err != nil || len(items) == 0 {
		return afterSeq
	}

	last := afterSeq
	for _, it := range items {
		if it.Seq <= afterSeq {
			continue
		}
		if !writeSSE(w, toSSE(it)) {
			// Ghi lỗi nghĩa là client đã đi; trả seq hiện tại rồi để vòng ngoài
			// kết thúc qua ctx.Done().
			return last
		}
		last = it.Seq
	}
	flusher.Flush()
	return last
}

func toSSE(it domain.RuntimeQueueItem) sseEvent {
	return sseEvent{
		Seq:      it.Seq,
		Time:     it.Time.UTC().Format(time.RFC3339Nano),
		Kind:     string(it.Kind),
		Category: it.Category,
		Agent:    it.Agent,
		Summary:  it.Summary,
		Payload:  it.Payload,
	}
}

// writeSSE ghi một sự kiện theo đúng khung text/event-stream.
//
// id: mang Seq để trình duyệt tự gửi lại qua Last-Event-ID khi mất kết nối.
// Dữ liệu phải là MỘT dòng: ký tự xuống dòng trong JSON sẽ bị hiểu là ranh giới
// trường của SSE và làm hỏng khung. json.Marshal không sinh newline thô trong
// chuỗi (nó thoát thành \n) nên một dòng data là an toàn.
func writeSSE(w http.ResponseWriter, ev sseEvent) bool {
	data, err := json.Marshal(ev)
	if err != nil {
		return true // bỏ qua mục lỗi, không giết cả stream
	}
	if _, err := fmt.Fprintf(w, "id: %d\nevent: %s\ndata: %s\n\n", ev.Seq, ev.Kind, data); err != nil {
		return false
	}
	return true
}

// writeSSEKhongID ghi một sự kiện KHÔNG mang `id:`.
//
// Dùng cho văn sống. `id:` là mốc mà trình duyệt gửi lại qua `Last-Event-ID` khi nối lại, và
// `resumeSeq` đọc nó làm mốc hàng đợi ui_event — hai chuỗi seq khác nhau dùng chung một ô thì
// mốc của bên này thành mốc sai của bên kia.
func writeSSEKhongID(w http.ResponseWriter, ten string, than any) bool {
	data, err := json.Marshal(than)
	if err != nil {
		return true // bỏ qua mục lỗi, không giết cả stream
	}
	_, err = fmt.Fprintf(w, "event: %s\ndata: %s\n\n", ten, data)
	return err == nil
}

// bomVan đẩy mọi mẩu văn mới sau mocVan và trả mốc cuối đã đẩy.
func bomVan(w http.ResponseWriter, flusher http.Flusher, van *dongVan, mocVan int64) int64 {
	manh, _ := van.sau(mocVan)
	if len(manh) == 0 {
		return mocVan
	}
	cuoi := mocVan
	for _, m := range manh {
		ok := true
		if m.Xoa {
			ok = writeSSEKhongID(w, "stream_clear", struct{}{})
		} else {
			ok = writeSSEKhongID(w, "stream_delta", map[string]string{"text": m.Chu})
		}
		if !ok {
			return cuoi
		}
		cuoi = m.Seq
	}
	flusher.Flush()
	return cuoi
}
