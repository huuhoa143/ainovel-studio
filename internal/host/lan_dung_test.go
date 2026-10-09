package host

import "testing"

// Engine tự dừng sau một chuỗi lỗi model: lần dừng phải mang theo lỗi gốc, không chỉ câu bế tắc
// của Điều phối. Khởi động lại thì xóa sạch — lượt mới không mang lý do của lượt cũ.
func TestLanDung_GiuLoiGocVaXoaKhiChayLai(t *testing.T) {
	h := &Host{lifecycle: lifecycleRunning, observer: &observer{}, engine: &engine{}, events: make(chan Event, 8)}
	h.emitEvent(Event{Category: "ERROR", Agent: "writer", Summary: "writer thất bại: routing_exhausted: All mo...",
		Detail: "routing_exhausted: All models exhausted"})
	h.emitEvent(Event{Category: "SYSTEM", Summary: "không phải lỗi"})
	if !h.abortWithEvent("Phán quyết bế tắc: lặp lại 3 lần", "warn", DungTuKet) {
		t.Fatal("đang chạy mà abort trả false")
	}
	n := h.LanDung()
	if n == nil || n.Kind != DungTuKet || n.LastError != "routing_exhausted: All models exhausted" || n.LastErrorAgent != "writer" {
		t.Fatalf("lần dừng sai: %+v", n)
	}
	if h.abortWithEvent("bấm lần nữa", "warn", DungNguoiDung) {
		t.Fatal("đã dừng rồi mà abort vẫn nhận")
	}
	if got := h.LanDung(); got.Kind != DungTuKet {
		t.Fatalf("lần bấm thừa ghi đè lý do thật: %+v", got)
	}
	h.xoaLanDung()
	if h.LanDung() != nil {
		t.Fatal("chạy lại mà lần dừng cũ còn")
	}
}

// Sự kiện báo dừng mang LOẠI dừng theo dữ liệu, để mỗi mặt tự nói câu của nó.
//
// Câu Summary của cửa duyệt dạy cú pháp TUI ("dùng /next để sinh"); web không có lệnh đó.
// Thiếu Kind thì web chỉ còn cách dò lại chữ đã dịch — vỡ ngay khi bản dịch đổi.
func TestLanDung_SuKienMangLoaiDung(t *testing.T) {
	h := &Host{lifecycle: lifecycleRunning, observer: &observer{}, engine: &engine{}, events: make(chan Event, 8)}
	h.abortWithEvent("chờ duyệt chương 3; dùng /next", "info", DungCuaDuyet)
	var ev Event
	for len(h.events) > 0 {
		if e := <-h.events; e.Category == "SYSTEM" {
			ev = e
		}
	}
	if ev.Kind != "stop_gate" {
		t.Fatalf("sự kiện dừng ở cửa duyệt phải mang Kind=stop_gate, có %q", ev.Kind)
	}
	if KindDung("") != "" {
		t.Error("không có loại dừng thì không được bịa một Kind")
	}
}
