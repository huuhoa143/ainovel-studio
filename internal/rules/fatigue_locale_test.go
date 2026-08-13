package rules

import (
	"strings"
	"testing"

	"github.com/huuhoa143/ainovel-studio/internal/i18n"
)

// Bảng từ gây mỏi và cụm bị cấm được checker so khớp CHUỖI CON LITERAL với văn
// bản do mô hình sinh ra. Nên bảng tiếng Trung khớp 0 lần trong văn tiếng Việt và
// cả cơ chế chết lặng: không lỗi, không log, mọi chương đều báo "sạch".
//
// Đây là lỗi thật đã xảy ra: ForbiddenPhrases (slice) từng được bọc i18n.F nên
// sang tiếng Việt và hoạt động, còn FatigueWords (khóa map) bị bỏ qua đúng luật
// "khóa map là dữ liệu" — một nửa cơ chế sống, một nửa chết. Test kiểm HÀNH VI
// (có bắt được vi phạm trong văn Việt không), không kiểm bảng có bao nhiêu mục.
func TestKiemTuGayMoiHoatDongOVanTiengViet(t *testing.T) {
	// Phục hồi về locale ĐANG hiệu lực, không phải DefaultLocale: package này ghim
	// zh qua i18n_locale_pin_test.go, nên phục hồi về DefaultLocale (=vi) sẽ rò
	// locale sang mọi test chạy sau trong cùng package và làm chúng đỏ oan.
	truoc := i18n.Active()
	t.Cleanup(func() { _ = i18n.SetLocale(truoc) })
	if err := i18n.SetLocale(i18n.Vietnamese); err != nil {
		t.Fatalf("SetLocale: %v", err)
	}

	// Văn tiếng Việt cố tình lạm dụng từ gây mỏi, mỗi cụm vượt ngưỡng.
	vanCoTat := strings.Repeat(
		"Hắn không khỏi thở dài. Tuy nhiên nàng vẫn im lặng. "+
			"Ngoài ra còn một thoáng nghi ngờ. Nàng tựa như sương khói. ", 4)

	s := SystemDefaults().Structured
	violations := Check(vanCoTat, s)

	if len(violations) == 0 {
		t.Fatalf("bộ kiểm không bắt được vi phạm nào trong văn tiếng Việt lạm dụng từ gây mỏi.\n"+
			"Bảng đang dùng có %d từ gây mỏi, %d cụm bị cấm — nếu chúng còn là tiếng Trung thì\n"+
			"cơ chế đã chết lặng.", len(s.FatigueWords), len(s.ForbiddenPhrases))
	}
	t.Logf("bắt được %d vi phạm", len(violations))

	// Và văn sạch không được báo oan — nếu không thì test trên vô nghĩa.
	vanSach := "Mưa ngớt vào canh tư. Lâm Thanh đếm tiếng chuông: một, hai. " +
		"Bậc thứ chín kêu khô khốc dưới bước chân người lạ."
	if v := Check(vanSach, s); len(v) > 0 {
		t.Errorf("văn sạch bị báo oan %d vi phạm: %+v", len(v), v)
	}
}

// Đường tiếng Trung phải giữ nguyên bảng của upstream: đổi nó là đổi ngầm ngưỡng
// của mọi cuốn tiếng Trung đang viết dở.
func TestBangTiengTrungGiuNguyenChoSachCu(t *testing.T) {
	truoc := i18n.Active()
	t.Cleanup(func() { _ = i18n.SetLocale(truoc) })
	if err := i18n.SetLocale(i18n.Chinese); err != nil {
		t.Fatalf("SetLocale: %v", err)
	}

	s := SystemDefaults().Structured
	for _, want := range []string{"不禁", "竟然", "仿佛", "然而"} {
		if _, ok := s.FatigueWords[want]; !ok {
			t.Errorf("bảng zh thiếu %q — sách tiếng Trung đang viết dở sẽ đổi ngưỡng ngầm", want)
		}
	}
	if v := Check(strings.Repeat("他不禁竟然仿佛然而。", 5), s); len(v) == 0 {
		t.Error("đường tiếng Trung không còn bắt được vi phạm")
	}
}
