package serve

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"github.com/huuhoa143/ainovel-studio/internal/host"
	"github.com/huuhoa143/ainovel-studio/internal/store"
)

// Nhóm route GHI: chỗ studio thôi chỉ-đọc.
//
// Mọi handler ở đây đi qua `raoGhi`, và cả nhóm chỉ được mắc vào mux khi địa chỉ lắng
// nghe là loopback (xem routes()). Hai điều kiện đó độc lập nhau: hàng rào addr chặn
// người ở xa, hàng rào header chặn trang web độc trên chính máy này.

// tenSachHopLe giới hạn tên thư mục tác phẩm do người dùng đặt.
//
// Chặt hơn `bookDir` một cách có chủ ý: `bookDir` phòng thoát-thư-mục cho tên ĐÃ TỒN TẠI,
// còn đây là lúc TẠO mới nên đặt luôn quy ước sạch. Cho phép chữ, số, gạch ngang, gạch
// dưới — không dấu tiếng Việt, vì tên này thành đường dẫn trên đĩa và tên tệp có dấu gây
// khác biệt chuẩn hóa NFC/NFD giữa macOS và Linux (cùng một tên hiện ra là hai thư mục).
var tenSachHopLe = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,63}$`)

// docThan giải mã thân JSON của yêu cầu ghi.
//
// Giới hạn 1 MiB: câu yêu cầu truyện dài nhất cũng chỉ vài KB, và không giới hạn thì một
// yêu cầu duy nhất có thể ăn hết RAM của process đang giữ cả engine.
func docThan(r *http.Request, v any) error {
	dec := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 1<<20))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return fmt.Errorf("thân yêu cầu không hợp lệ: %w", err)
	}
	return nil
}

// handleTaoSach — POST /api/books
func (s *server) handleTaoSach(w http.ResponseWriter, r *http.Request) {
	var than struct {
		ID     string `json:"id"`
		YeuCau string `json:"prompt"`
	}
	if err := docThan(r, &than); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	than.ID = strings.TrimSpace(than.ID)
	if !tenSachHopLe.MatchString(than.ID) {
		writeErr(w, http.StatusBadRequest, fmt.Errorf(
			"tên tác phẩm %q không hợp lệ: dùng chữ thường không dấu, số, - hoặc _, tối đa 64 ký tự",
			than.ID))
		return
	}
	// Không cho tạo đè lên cuốn đã có. `Host.refuseNewBookOverExisting` cũng chặn, nhưng
	// nó chặn SAU khi đã mở engine và lấy khóa — báo sớm ở đây thì thông báo nói đúng
	// việc người dùng vừa làm ("tên này đã có") thay vì một lỗi từ tầng dưới.
	if _, err := s.openBook(than.ID); err == nil {
		writeErr(w, http.StatusConflict, fmt.Errorf(
			"tác phẩm %q đã tồn tại — chọn tên khác, hoặc mở nó rồi bấm chạy tiếp", than.ID))
		return
	}

	p, err := s.may.tao(than.ID, than.YeuCau)
	if err != nil {
		writeErr(w, maLoi(err), err)
		return
	}
	writeJSON(w, map[string]any{
		"book":  than.ID,
		"dir":   p.eng.Dir(),
		"state": "running",
	})
}

// handleMoMay — POST /api/books/{book}/open
//
// Mở engine mà KHÔNG chạy.
//
// # Vì sao cần route riêng
//
// Bản đầu chỉ có `/run`, và nó gộp hai việc: gắn engine vào cuốn sách, rồi khôi phục
// lượt chạy. Hệ quả đo được: muốn đổi model theo vai (đòi engine đang mở) thì phải bấm
// Chạy — tức tiêu tiền API để sửa một ô cấu hình. Với cuốn đang đứng ở biên cung, "chạy
// tiếp" còn nghĩa là mở cả một cung 68 chương.
//
// Gắn engine tự nó không gọi LLM lần nào: `host.New` chỉ dựng model set, đọc store và
// lấy khóa tệp. Nên hai việc tách được, và phải tách.
func (s *server) handleMoMay(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("book")
	p, err := s.may.mo(id)
	if err != nil {
		writeErr(w, maLoi(err), err)
		return
	}
	writeJSON(w, map[string]any{"book": id, "dir": p.eng.Dir(), "running": p.eng.Snapshot().IsRunning})
}

// handleChay — POST /api/books/{book}/run
func (s *server) handleChay(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("book")
	nhan, err := s.may.chay(id)
	if err != nil {
		writeErr(w, maLoi(err), err)
		return
	}
	writeJSON(w, map[string]any{"book": id, "resumed": nhan, "state": "running"})
}

// handleCanThiep — POST /api/books/{book}/steer
//
// Một route cho cả ba việc của ô nhập TUI (can thiệp khi chạy / đánh thức khi dừng / yêu
// cầu sau khi xong) vì TUI cũng dùng một ô cho cả ba. Trả về `applied` để giao diện nói
// đúng việc đã xảy ra, thay vì đoán.
func (s *server) handleCanThiep(w http.ResponseWriter, r *http.Request) {
	var than struct {
		Chu string `json:"text"`
	}
	if err := docThan(r, &than); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	kieu, err := s.may.canThiep(r.PathValue("book"), than.Chu)
	if err != nil {
		writeErr(w, maLoi(err), err)
		return
	}
	writeJSON(w, map[string]any{"applied": kieu})
}

// handleDung — POST /api/books/{book}/abort
func (s *server) handleDung(w http.ResponseWriter, r *http.Request) {
	daDung, err := s.may.dung(r.PathValue("book"))
	if err != nil {
		writeErr(w, maLoi(err), err)
		return
	}
	// 200 kèm aborted=false, không phải lỗi: "không có gì đang chạy để dừng" là một câu
	// trả lời đúng cho câu hỏi "hãy dừng", và giao diện cần phân biệt nó với thất bại.
	writeJSON(w, map[string]any{"aborted": daDung})
}

// handleDongMay — POST /api/books/{book}/close
//
// Cần route riêng vì hạn mức là MỘT engine mỗi lần: không có chỗ nhả thì người dùng mở
// cuốn A rồi không bao giờ mở được cuốn B mà không tắt cả studio.
func (s *server) handleDongMay(w http.ResponseWriter, r *http.Request) {
	if err := s.may.dong(r.PathValue("book")); err != nil {
		writeErr(w, maLoi(err), err)
		return
	}
	writeJSON(w, map[string]any{"closed": true})
}

// handleSong — GET /api/books/{book}/live
//
// Trả thẳng `Host.Snapshot()`. Đây là điểm khác biệt lớn nhất mà engine in-process mang
// lại: trước đây studio DỰNG LẠI trạng thái từ store nên nó có thể nói khác engine (chênh
// số từ 2.532/2.527 là đúng lớp lỗi đó). Giờ nó hỏi thẳng nguồn sự thật.
//
// Tên trường giữ nguyên kiểu Go (hoa đầu) chứ không đổi thành snake_case, để KHỚP với
// `PayloadEvent` mà `web/lib/useStudio.ts` đã khai cho SSE. Đổi ở đây sẽ tạo ra hai quy
// ước đặt tên trong cùng một giao diện.
func (s *server) handleSong(w http.ResponseWriter, r *http.Request) {
	// Engine CHƯA MỞ trả 200 kèm `open: false`, KHÔNG trả 409.
	//
	// "Engine có đang mở không" là một câu hỏi có câu trả lời phủ định hợp lệ, nên nó không
	// phải lỗi. Bản đầu trả 409 và hệ quả đo được: giao diện dò `/live` mỗi 2 giây để biết
	// engine có đang hỏi gì không, nên console đầy "Failed to load resource: 409" — 16 lần
	// trong một lượt xem. Trình duyệt ghi log đó ở tầng mạng, giao diện không tắt được;
	// cách duy nhất là đừng trả lỗi cho một câu hỏi không sai.
	//
	// Trường `Open` đã có từ bản đầu và luôn bằng true — tức nó là một trường chết. Giờ nó
	// mang đúng nghĩa mà tên nó nói.
	//
	// 409 vẫn đúng cho các route HÀNH ĐỘNG (steer/abort/advance trên một engine đã đóng là
	// xung đột thật), nên `maLoi` không đổi.
	p, err := s.may.dangMo(r.PathValue("book"))
	if err != nil {
		if errors.Is(err, errChuaMoMay) {
			writeJSON(w, map[string]any{"open": false})
			return
		}
		writeErr(w, maLoi(err), err)
		return
	}
	loi, dung := p.tinhTrang()
	out := struct {
		Open    bool   `json:"open"`
		Stopped bool   `json:"stopped"`
		LastErr string `json:"last_error,omitempty"`
		// Asking khác nil nghĩa là engine ĐANG CHẶN chờ người dùng. Đi kèm /live chứ không
		// có endpoint riêng: giao diện đã dò /live để biết engine còn chạy, và hai vòng dò
		// lệch nhịp sẽ có lúc nói "đang chạy" trong khi nó đứng chờ chính người đang xem.
		Asking   *hoiRa          `json:"asking,omitempty"`
		Snapshot host.UISnapshot `json:"snapshot"`
	}{Open: true, Stopped: dung, Asking: hoiRaTu(p.hoi.dangCho()), Snapshot: p.eng.Snapshot()}
	if loi != nil {
		out.LastErr = loi.Error()
	}
	writeJSON(w, out)
}

// handleMay — GET /api/engine
//
// Giao diện cần biết cuốn nào đang giữ engine TRƯỚC khi hiện nút chạy, nếu không nút sẽ
// hứa một việc rồi thất bại vì hạn mức.
func (s *server) handleMay(w http.ResponseWriter, r *http.Request) {
	s.may.mu.Lock()
	mo := make([]map[string]any, 0, len(s.may.dang))
	for id, p := range s.may.dang {
		loi, dung := p.tinhTrang()
		m := map[string]any{"book": id, "opened_at": p.moLuc, "stopped": dung}
		if loi != nil {
			m["last_error"] = loi.Error()
		}
		mo = append(mo, m)
	}
	soToiDa := s.may.soToiDa
	s.may.mu.Unlock()

	writeJSON(w, map[string]any{"open": mo, "max": soToiDa, "writable": true})
}

// maLoi dịch lỗi nghiệp vụ thành mã HTTP.
//
// Giữ ở một chỗ để mọi route ghi trả cùng một mã cho cùng một loại lỗi. Mặc định là 400
// chứ không 500: phần lớn lỗi ở đây là "yêu cầu không hợp lý ở trạng thái này" (chưa mở
// máy, đã có máy khác, không có gì khôi phục), tức lỗi của bên gọi.
func maLoi(err error) int {
	switch {
	case errors.Is(err, errChuaMoMay):
		return http.StatusConflict
	case errors.Is(err, errQuaNhieuMay):
		return http.StatusConflict
	case errors.Is(err, store.ErrDangBiKhoa):
		return http.StatusConflict
	case errors.Is(err, errNotInitialized):
		return http.StatusNotFound
	case errors.Is(err, errDangTat):
		return http.StatusServiceUnavailable
	default:
		return http.StatusBadRequest
	}
}
