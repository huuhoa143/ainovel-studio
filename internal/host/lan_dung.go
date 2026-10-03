package host

import (
	"fmt"
	"sync"
	"time"

	"github.com/huuhoa143/ainovel-studio/internal/i18n"
)

// Ai (hoặc cái gì) đã dừng engine lần gần nhất.
const (
	DungNguoiDung = "user"   // người dùng bấm dừng, hoặc tự chuyển sang cùng dựng
	DungCuaDuyet  = "gate"   // chế độ từng chương: dừng chờ duyệt — ca thường, không phải lỗi
	DungNganSach  = "budget" // chạm trần ngân sách
	DungTuKet     = "stuck"  // engine tự dừng: bế tắc, phán quyết hỏng, vòng chạy tự kết thúc
)

// StopNote là lần dừng gần nhất của phiên: vì sao, và lỗi model cuối cùng trước lúc đó.
//
// Có nó vì "tạm dừng" một mình không trả lời được câu người dùng hỏi: tôi bấm Tiếp tục viết,
// một lúc sau nó lại dừng — tại sao? Lý do chỉ có trong một sự kiện, và sự kiện thì mất khi tải
// lại trang. Đo được trên truyện thật: cổng model hết tuyến (429) suốt ba lượt viết, Điều phối
// phán bế tắc và dừng, còn màn hình nói "Tạm dừng · Bấm Viết tiếp" — đúng nút sẽ đâm lại vào
// đúng bức tường ấy.
type StopNote struct {
	At     time.Time
	Kind   string
	Reason string
	// LastError là lỗi gần nhất (sự kiện ERROR) trong lượt chạy vừa dừng. Lý do bế tắc của
	// Điều phối không nói ra lỗi gốc ("lặp lại 3 lần không tiến triển"), còn lỗi gốc mới là thứ
	// người dùng sửa được (đổi model, chờ hết giới hạn).
	LastError string
	// LastErrorAgent là vai gặp lỗi đó ("writer") — để lời khuyên gọi đúng vai cần đổi model.
	LastErrorAgent string
}

type lanDungState struct {
	mu      sync.Mutex
	note    *StopNote
	loiCuoi string
	vaiLoi  string
}

func summaryDung(completed int) string {
	return fmt.Sprintf(i18n.F("引擎停止 (已完成 %d 章)"), completed)
}

// ghiLanDung chỉ khóa `lanDung.mu`, nên gọi được cả khi đang giữ `h.mu`.
func (h *Host) ghiLanDung(kind, reason string) {
	h.lanDung.mu.Lock()
	defer h.lanDung.mu.Unlock()
	h.lanDung.note = &StopNote{At: time.Now(), Kind: kind, Reason: reason, LastError: h.lanDung.loiCuoi, LastErrorAgent: h.lanDung.vaiLoi}
}

// xoaLanDung: engine vừa khởi động lại — lần dừng cũ và lỗi cũ không còn nói gì về lượt mới.
func (h *Host) xoaLanDung() {
	h.lanDung.mu.Lock()
	defer h.lanDung.mu.Unlock()
	h.lanDung.note, h.lanDung.loiCuoi, h.lanDung.vaiLoi = nil, "", ""
}

// nhoLoi giữ lỗi gần nhất của lượt đang chạy. Gọi từ emitEvent — phễu duy nhất của mọi sự kiện.
func (h *Host) nhoLoi(ev Event) {
	if ev.Category != "ERROR" || ev.Summary == "" {
		return
	}
	// Summary của observer bị cắt ("118 prompt t..."), Detail mới mang nguyên lỗi — mà phần bị
	// cắt lại đúng là phần nói VÌ SAO hết tuyến. Trần 2000 ký tự: đủ cho mọi lỗi nhà cung cấp
	// đã gặp, không đủ để một trang HTML lỗi phình snapshot.
	loi := ev.Summary
	if ev.Detail != "" {
		loi = ev.Detail
	}
	if r := []rune(loi); len(r) > 2000 {
		loi = string(r[:2000])
	}
	h.lanDung.mu.Lock()
	defer h.lanDung.mu.Unlock()
	h.lanDung.loiCuoi, h.lanDung.vaiLoi = loi, ev.Agent
}

// LanDung trả bản sao lần dừng gần nhất; nil khi chưa dừng lần nào từ lúc khởi động gần nhất.
func (h *Host) LanDung() *StopNote {
	h.lanDung.mu.Lock()
	defer h.lanDung.mu.Unlock()
	if h.lanDung.note == nil {
		return nil
	}
	n := *h.lanDung.note
	return &n
}

// KindDung là Event.Kind của sự kiện báo một lần dừng: "stop_" + loại dừng.
//
// Câu Summary của lần dừng do engine viết cho MỌI mặt cùng lúc, và có câu dạy cú pháp
// lệnh của TUI — cửa duyệt nói "dùng /next để sinh", trong khi web không có lệnh nào
// như thế mà có dải duyệt với nút bấm. Mang loại dừng theo sự kiện thì mỗi mặt tự nói
// câu của nó dựa trên DỮ LIỆU, không phải dò lại chữ đã dịch (dò chữ thì vỡ ngay khi ai
// đó sửa một bản dịch). Tiền tố "stop_" để không trùng các mã lỗi cũng đi qua Kind
// (stream_idle…).
func KindDung(kind string) string {
	if kind == "" {
		return ""
	}
	return "stop_" + kind
}
