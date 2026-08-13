package tui

import (
	"os"
	"strings"
	"testing"

	"github.com/huuhoa143/ainovel-studio/internal/i18n"
)

// Package này CỐ Ý chạy ở locale mặc định (tiếng Việt), khác với các package tầng
// engine đã ghim locale=zh qua i18n_locale_pin_test.go.
//
// Lý do: đây là tầng giao diện, và bề rộng cột phụ thuộc ngôn ngữ. Ghim về zh sẽ
// bỏ mất đúng loại lỗi mà chỉ tầng này có. Đã xảy ra thật: cột "上下文窗口" chiếm
// 10 cột hiển thị nên hằng số 14 vừa đủ, nhưng bản dịch "Cửa sổ ngữ cảnh" chiếm
// 15 cột và bị cắt thành "Cửa sổ ngữ cản". Lỗi đó CHỈ lộ ra vì test chạy ở locale
// vi; ghim zh thì nó ra tới người dùng.
//
// Cách đúng để test ở đây bền với bản dịch: assert qua i18n.F("<msgid>") thay vì
// hardcode chuỗi. Test khi đó kiểm "giao diện có hiện đúng nhãn ấy" chứ không
// kiểm "nhãn ấy viết bằng chữ gì".
func TestPackageNayKhongDuocGhimLocaleVeZh(t *testing.T) {
	entries, err := os.ReadDir(".")
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if e.Name() == "i18n_locale_pin_test.go" {
			t.Fatalf("không được ghim locale=zh cho package giao diện: %s\n"+
				"ghim sẽ che mất lỗi bề rộng cột phụ thuộc ngôn ngữ (xem comment đầu file này).\n"+
				"cách đúng: sửa assert sang i18n.F(\"<msgid>\").", e.Name())
		}
	}

	// Và locale hiệu lực phải là tiếng Việt, không phải zh.
	if got := i18n.Active(); got != i18n.Vietnamese {
		t.Errorf("locale hiệu lực = %q, phải là %q để test bắt được lỗi bề rộng cột",
			got, i18n.Vietnamese)
	}
}

// Nhãn cột trong bảng model phải vừa cột ở MỌI ngôn ngữ. Test này chốt trực tiếp
// vào bất biến đó thay vì dựa vào việc một test khác tình cờ phát hiện.
func TestNhanCotBangModelVuaBeRong(t *testing.T) {
	t.Cleanup(func() { _ = i18n.SetLocale(i18n.DefaultLocale) })

	for _, loc := range []i18n.Locale{i18n.Vietnamese, i18n.Chinese} {
		if err := i18n.SetLocale(loc); err != nil {
			t.Fatalf("SetLocale(%s): %v", loc, err)
		}
		state := &modelConfigState{}
		lines := renderModelConfigRows(state, 78)
		if len(lines) == 0 {
			t.Fatalf("[%s] không render được dòng nào", loc)
		}

		header := lines[0]
		for _, label := range []string{i18n.F("模型 ID"), i18n.F("上下文窗口"), i18n.F("引用")} {
			if !strings.Contains(header, label) {
				t.Errorf("[%s] nhãn cột %q bị cắt hoặc thiếu trong header:\n  %s", loc, label, header)
			}
		}
	}
}
