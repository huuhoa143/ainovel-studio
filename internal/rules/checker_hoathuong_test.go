package rules

import (
	"strings"
	"testing"

	"github.com/huuhoa143/ainovel-studio/internal/i18n"
)

// Bộ kiểm cơ học so khớp CHUỖI CON LITERAL, mà bảng ở snapshot.go toàn chữ thường.
// Các cụm tiếng Việt trong bảng bản chất là từ MỞ CÂU ("Tuy nhiên,", "Ngoài ra,",
// "Đáng chú ý là") nên trong văn thật luôn viết hoa → trước sửa này chúng không
// bao giờ bị bắt, và cả nhóm ngưỡng đó chết lặng: không lỗi, không log.
//
// Lỗi riêng của bản việt hóa; tiếng Trung không có chữ hoa nên upstream không gặp.
// Test canh cả hai luật vì chúng dùng hai đường khác nhau (fatigue_words có ngưỡng,
// forbidden_phrases là ≥1 lần và ở mức error).
func TestKiemCoHocKhongPhanBietHoaThuong(t *testing.T) {
	truoc := i18n.Active()
	t.Cleanup(func() { _ = i18n.SetLocale(truoc) })
	if err := i18n.SetLocale(i18n.Vietnamese); err != nil {
		t.Fatalf("SetLocale: %v", err)
	}

	s := SystemDefaults().Structured

	timLuat := func(vs []Violation, rule, target string) *Violation {
		for i := range vs {
			if vs[i].Rule == rule && vs[i].Target == target {
				return &vs[i]
			}
		}
		return nil
	}

	t.Run("fatigue_words bắt được cụm viết hoa đầu câu", func(t *testing.T) {
		nguong, ok := s.FatigueWords["tuy nhiên"]
		if !ok {
			t.Skip("bảng không còn mục «tuy nhiên» — test này ghim vào bảng, cập nhật theo bảng")
		}
		// Vượt ngưỡng, và MỌI lần đều viết hoa như trong văn thật.
		van := strings.Repeat("Tuy nhiên, nàng vẫn không đáp lời hắn. ", nguong+2)

		v := timLuat(Check(van, s), "fatigue_words", "tuy nhiên")
		if v == nil {
			t.Fatalf("«Tuy nhiên,» mở câu %d lần (ngưỡng %d) mà không bị bắt — "+
				"so khớp vẫn phân biệt hoa thường", nguong+2, nguong)
		}
		if n, _ := v.Actual.(int); n != nguong+2 {
			t.Errorf("đếm được %v, chờ %d", v.Actual, nguong+2)
		}
		// Target phải là dạng nguyên văn của bảng, không phải dạng đã hạ chữ của
		// văn bản: nó được ghi xuống rule_violations.jsonl và đối chiếu với ngưỡng.
		if v.Target != "tuy nhiên" {
			t.Errorf("Target = %q, phải giữ nguyên văn bảng %q", v.Target, "tuy nhiên")
		}
	})

	t.Run("forbidden_phrases bắt được cụm viết hoa đầu câu", func(t *testing.T) {
		if len(s.ForbiddenPhrases) == 0 {
			t.Skip("không có cụm bị cấm nào")
		}
		cum := s.ForbiddenPhrases[0]
		// Viết hoa chữ đầu, đúng như khi cụm đó mở câu. Phải cắt theo RUNE: chữ đầu
		// của cụm tiếng Việt hay là chữ nhiều byte ("ở"), cắt theo byte thì tạo ra
		// chuỗi UTF-8 hỏng và test đỏ oan — chính lỗi đã xảy ra ở bản đầu test này.
		r := []rune(cum)
		hoa := strings.ToUpper(string(r[0])) + string(r[1:])
		van := "Bến đá vắng người. " + hoa + " mọi thứ vẫn như cũ."

		if v := timLuat(Check(van, s), "forbidden_phrases", cum); v == nil {
			t.Errorf("cụm bị cấm %q viết hoa thành %q mà không bị bắt — "+
				"luật này ở mức error nên lọt là nặng", cum, hoa)
		}
	})

	t.Run("nhánh zh không đổi hành vi", func(t *testing.T) {
		if err := i18n.SetLocale(i18n.Chinese); err != nil {
			t.Fatal(err)
		}
		zh := SystemDefaults().Structured
		// strings.ToLower không đổi chữ Hán, nên bảng zh phải bắt y như trước.
		van := strings.Repeat("他不禁叹了口气，然而她仍旧沉默了。", 4)
		if len(Check(van, zh)) == 0 {
			t.Error("bảng tiếng Trung không bắt được gì trong văn tiếng Trung lạm dụng — " +
				"việc hạ chữ đã làm hỏng nhánh zh")
		}
	})
}
