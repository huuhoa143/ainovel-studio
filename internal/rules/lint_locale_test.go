package rules

import (
	"strings"
	"testing"

	"github.com/huuhoa143/ainovel-studio/internal/i18n"
)

// non_cjk_fragments là luật "thân bài lẫn chữ của ngôn ngữ khác". Judgment của nó
// PHẢI đảo chiều theo ngôn ngữ nền, vì vật lạ ở mỗi nền là một hệ chữ khác nhau:
// nền chữ Hán thì vật lạ là chữ Latin, nền chữ Việt thì vật lạ là chữ Hán.
//
// Trước khi sửa, nhánh vi dùng nguyên `[A-Za-z]{2,}` của bản gốc nên khớp mọi từ
// của mọi chương — đo trên corpus tiếng Việt là 202–231 lần mỗi chương, 100% số
// chương. Nó không dừng ở tiếng ồn: Violation được SaveRuleViolations ghi xuống
// rule_violations.jsonl rồi editor đọc lại qua novel_context, nên nó DẠY editor
// rằng chương nào cũng có tật cơ học.
//
// Test kiểm cả BỐN hướng chứ không chỉ hướng vừa sửa. Chỉ kiểm nhánh vi thì lần
// sau ai đó "gọn hóa" thành một regex duy nhất sẽ giết nhánh zh mà không ai biết.
func TestNonCJKFragmentsDaoChieuTheoNgonNgu(t *testing.T) {
	// Phục hồi về locale ĐANG hiệu lực, không phải DefaultLocale: package này ghim
	// zh trong i18n_locale_pin_test.go, nên phục hồi về vi sẽ rò locale sang các
	// test chạy sau cùng package.
	truoc := i18n.Active()
	t.Cleanup(func() { _ = i18n.SetLocale(truoc) })

	// Văn tiếng Việt sạch, giữ đúng giọng văn xuôi của corpus (dấu thanh đầy đủ,
	// gạch đầu dòng thoại) để không tự cho mình một mẫu dễ hơn thực tế.
	const vanVietSach = `Bến đá nằm ở khúc sông gấp, nơi dòng nước đổi màu từ xanh sang nâu đục.
Ông Thản gác cầu ở đó ba mươi năm, đủ lâu để đếm từng viên đá đã lở.

— Cầu này còn qua được không, bác?

— Qua được. Nhưng bước theo lối tôi đi, đừng đặt chân lên phiến thứ tư.`

	// Cùng đoạn trên, lẫn đúng hai chỗ chữ Hán — lỗi thật của bản việt hóa.
	const vanVietLanHan = `Bến đá nằm ở khúc sông gấp, nơi dòng nước 的 đổi màu.
Ông Thản gác cầu ở đó ba mươi năm 年.`

	const vanTrungSach = `青石渡口在河湾处，水色由青转浊。
守桥人在那里三十年，久到能数清每一块塌落的石头。`

	const vanTrungLanLatin = `青石渡口在河湾处，水色由青转浊。
守桥人看着那个 pattern，心里觉得不对。`

	// Actual là `any` (fatigue_words dùng int, forbidden_* để trống), nên phải
	// khẳng định kiểu — và khẳng định luôn là int để nếu ai đó đổi sang string thì
	// test đỏ ngay thay vì so sai âm thầm.
	dem := func(text string) (int, string) {
		t.Helper()
		for _, v := range Lint(text) {
			if v.Rule != "non_cjk_fragments" {
				continue
			}
			n, ok := v.Actual.(int)
			if !ok {
				t.Fatalf("Actual của non_cjk_fragments là %T, chờ int", v.Actual)
			}
			return n, v.Target
		}
		return 0, ""
	}

	t.Run("vi/văn sạch không báo", func(t *testing.T) {
		if err := i18n.SetLocale(i18n.Vietnamese); err != nil {
			t.Fatal(err)
		}
		if n, target := dem(vanVietSach); n != 0 {
			t.Errorf("văn tiếng Việt sạch mà báo %d lần (ví dụ %q) — "+
				"bộ nhận vẫn đang bắt chữ Latin ở nhánh vi", n, target)
		}
	})

	t.Run("vi/lẫn chữ Hán thì báo", func(t *testing.T) {
		if err := i18n.SetLocale(i18n.Vietnamese); err != nil {
			t.Fatal(err)
		}
		n, target := dem(vanVietLanHan)
		if n == 0 {
			t.Fatal("văn tiếng Việt lẫn chữ Hán mà không báo — luật chết lặng ở nhánh vi")
		}
		// Đúng 2 chữ Hán, và ví dụ phải là chính chữ Hán đó chứ không phải mảnh
		// âm tiết Việt: Target đi thẳng vào novel_context cho editor đọc.
		if n != 2 {
			t.Errorf("đếm được %d, chờ 2 (chữ 的 và 年)", n)
		}
		for _, mong := range []string{"的", "年"} {
			if !strings.Contains(target, mong) {
				t.Errorf("Target %q thiếu %q — ví dụ đưa cho editor phải là chữ lẫn thật", target, mong)
			}
		}
	})

	t.Run("zh/văn sạch không báo", func(t *testing.T) {
		if err := i18n.SetLocale(i18n.Chinese); err != nil {
			t.Fatal(err)
		}
		if n, target := dem(vanTrungSach); n != 0 {
			t.Errorf("văn tiếng Trung sạch mà báo %d lần (ví dụ %q)", n, target)
		}
	})

	t.Run("zh/lẫn chữ Latin thì báo — chống hồi quy nhánh gốc", func(t *testing.T) {
		if err := i18n.SetLocale(i18n.Chinese); err != nil {
			t.Fatal(err)
		}
		n, target := dem(vanTrungLanLatin)
		if n == 0 {
			t.Fatal("văn tiếng Trung lẫn chữ Latin mà không báo — đã làm chết nhánh zh")
		}
		if !strings.Contains(target, "pattern") {
			t.Errorf("Target %q phải nêu %q", target, "pattern")
		}
	})
}
