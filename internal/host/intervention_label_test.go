package host

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/huuhoa143/ainovel-studio/internal/i18n"
)

// Nhãn "can thiệp gốc" do interventionDispatchTask sinh ra là HỢP ĐỒNG giữa code
// Go và assets/prompts/editor.md: prompt dặn editor coi phần sau nhãn là nguồn
// thẩm quyền duy nhất cho lần sửa, và chỉ được sửa trong phạm vi đó.
//
// Hai đầu hợp đồng nằm ở hai vùng khác nhau — một trong code, một trong tệp
// prompt — nên khi việt hóa rất dễ dịch lệch pha. Và nếu lệch thì editor không
// nhận ra ranh giới, tự mở rộng một can thiệp hẹp thành viết lại diện rộng. Không
// lỗi, không log, không test nào khác bắt được: prompt vẫn hợp lệ, code vẫn chạy,
// chỉ là chúng nói hai thứ khác nhau.
//
// Test này CỐ Ý tự đặt locale sang tiếng Việt, ghi đè i18n_locale_pin_test.go của
// package. Ghim zh ở đây là hợp lý cho các test chốt văn bản thông báo, nhưng
// đúng bất biến này thì chỉ có nghĩa ở locale mà người dùng thật đang chạy.
func TestNhanCanThiepKhopVoiPrompt(t *testing.T) {
	t.Cleanup(func() { _ = i18n.SetLocale(i18n.Chinese) }) // trả lại ghim của package
	if err := i18n.SetLocale(i18n.Vietnamese); err != nil {
		t.Fatalf("SetLocale: %v", err)
	}

	const msgid = "用户原始干预（本次修改授权的唯一来源；上下文只用于理解，不得扩大目标或范围）："
	label := i18n.F(msgid)
	if label == msgid {
		t.Skipf("nhãn chưa có bản dịch tiếng Việt trong catalog — hợp đồng chưa kiểm được.\n" +
			"Cần thêm msgid này vào internal/i18n/locales/vi.json, và bản dịch PHẢI chứa\n" +
			"cụm mà assets/prompts/editor.md đang dặn editor tìm.")
	}

	promptPath := filepath.Join("..", "..", "assets", "prompts", "editor.md")
	raw, err := os.ReadFile(promptPath)
	if err != nil {
		t.Fatalf("đọc %s: %v", promptPath, err)
	}
	prompt := string(raw)

	// Lấy phần đầu nhãn trước dấu ngoặc mở: prompt trích dẫn tên nhãn, không trích
	// cả câu giải thích trong ngoặc.
	head := label
	for _, sep := range []string{"（", "(", ":", "："} {
		if i := strings.Index(head, sep); i > 0 {
			head = head[:i]
		}
	}
	head = strings.TrimSpace(head)
	if head == "" {
		t.Fatalf("không tách được tên nhãn từ %q", label)
	}

	if !strings.Contains(prompt, head) {
		t.Errorf("LỆCH HỢP ĐỒNG: engine sinh nhãn %q nhưng %s không nhắc tới cụm đó.\n"+
			"Editor sẽ không nhận ra ranh giới phạm vi sửa và có thể tự mở rộng can thiệp.\n"+
			"Sửa MỘT trong hai đầu để chúng khớp:\n"+
			"  - bản dịch của msgid trong internal/i18n/locales/vi.json, hoặc\n"+
			"  - cụm được trích trong assets/prompts/editor.md",
			head, promptPath)
	}
}

// Nội dung can thiệp của người dùng phải được giữ NGUYÊN VĂN, không diễn đạt lại,
// ở mọi ngôn ngữ. Đây là lý do tồn tại của interventionDispatchTask.
func TestCanThiepGocGiuNguyenVanOMoiNgonNgu(t *testing.T) {
	t.Cleanup(func() { _ = i18n.SetLocale(i18n.Chinese) })

	const original = "Lâm Thanh nên do dự lâu hơn trước khi rút kiếm"
	for _, loc := range []i18n.Locale{i18n.Vietnamese, i18n.Chinese} {
		if err := i18n.SetLocale(loc); err != nil {
			t.Fatalf("SetLocale(%s): %v", loc, err)
		}
		got := interventionDispatchTask("viết lại chương 41", original)
		if !strings.Contains(got, original) {
			t.Errorf("[%s] mất nguyên văn can thiệp:\n%s", loc, got)
		}
	}
}
