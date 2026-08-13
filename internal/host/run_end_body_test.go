package host

import (
	"strings"
	"testing"

	"github.com/huuhoa143/ainovel-studio/internal/domain"
	storepkg "github.com/huuhoa143/ainovel-studio/internal/store"
)

// TestThongBaoHoanThanhKhongLapTenSach chốt bản sửa một lỗi CỦA UPSTREAM.
//
// runEndBody bản gốc nhận novelName rồi luôn chèn vào đầu, nhưng một bên gọi
// truyền vào summary của completionSummary — mà summary đó đã mở đầu bằng chính
// tên sách. Kết quả là thông báo hoàn thành in tên hai lần.
//
// Lỗi có ở CẢ hai locale nên nó không do việc việt hóa sinh ra. Gói này ghim
// locale zh (i18n_locale_pin_test.go), và khẳng định ở zh còn tốt hơn: nó chứng
// minh bản sửa không phải một mẹo riêng cho tiếng Việt.
//
// Kiểm bằng phép ĐẾM chứ không bằng so chuỗi cứng: đếm số lần tên sách xuất hiện
// bắt được đúng lớp lỗi (lặp) mà không vỡ khi ai đó đổi câu chữ quanh nó.
func TestThongBaoHoanThanhKhongLapTenSach(t *testing.T) {
	const ten = "Vệt sáng trên mặt nước"

	st := storepkg.NewStore(t.TempDir())
	if err := st.Init(); err != nil {
		t.Fatal(err)
	}
	if err := st.Progress.Save(&domain.Progress{
		NovelName:         ten,
		Phase:             domain.PhaseComplete,
		CompletedChapters: []int{1, 2, 3},
		TotalWordCount:    4200,
	}); err != nil {
		t.Fatal(err)
	}

	h := &Host{store: st, usage: NewUsageTracker(nil, st), events: make(chan Event, 4)}

	summary := completionSummary(st)
	if n := strings.Count(summary, ten); n != 1 {
		t.Fatalf("completionSummary phải nêu tên sách đúng 1 lần, được %d: %q", n, summary)
	}

	body := h.runEndBody(summary)
	if n := strings.Count(body, ten); n != 1 {
		t.Errorf("thân thông báo hoàn thành nêu tên sách %d lần, phải đúng 1:\n  %q\n"+
			"Nếu là 2 thì runEndBody đã chèn lại tên mà summary vốn đã có — chính lỗi upstream này.",
			n, body)
	}
	// Thân phải GIỮ được summary, không chỉ là không lặp: một bản "sửa" bằng cách
	// bỏ luôn tên khỏi cả hai chỗ cũng làm phép đếm trên xanh.
	if !strings.Contains(body, summary) {
		t.Errorf("thân thông báo mất nội dung summary:\n  summary: %q\n  thân:    %q", summary, body)
	}
}

// TestThongBaoDungGiuaChungCoTenSach là mặt còn lại của cùng bản sửa.
//
// Sau khi bỏ việc chèn tên trong runEndBody, trách nhiệm chèn chuyển sang bên gọi.
// Nhánh "engine dừng giữa chừng" có summary KHÔNG chứa tên, nên nếu ai đó dọn dẹp
// bằng cách bỏ luôn đoạn chèn ở đó thì thông báo sẽ không nói dừng cuốn nào —
// vô dụng khi chạy nhiều cuốn, và phép đếm ở bài kiểm trên không bắt được.
//
// Gọi được trực tiếp vì đoạn chèn đã tách thành bocTenSach — đó chính là lý do
// tách: nằm trong thân handleEngineStopped thì bất biến này chỉ kiểm được bằng
// cách dựng cả engine.
func TestThongBaoDungGiuaChungCoTenSach(t *testing.T) {
	const ten = "Vệt sáng trên mặt nước"

	st := storepkg.NewStore(t.TempDir())
	if err := st.Init(); err != nil {
		t.Fatal(err)
	}
	h := &Host{store: st, usage: NewUsageTracker(nil, st), events: make(chan Event, 4)}

	// Dựng lại đúng phép ghép mà nhánh dừng-giữa-chừng dùng.
	summary := "engine đã dừng"
	body := h.runEndBody(bocTenSach(ten, summary))
	if !strings.Contains(body, ten) {
		t.Errorf("thông báo dừng giữa chừng không nêu tên sách: %q", body)
	}
	if n := strings.Count(body, ten); n != 1 {
		t.Errorf("nêu tên sách %d lần, phải đúng 1: %q", n, body)
	}
}
