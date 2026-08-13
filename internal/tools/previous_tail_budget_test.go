package tools

import (
	"strings"
	"testing"

	"github.com/huuhoa143/ainovel-studio/internal/domain"
	"github.com/huuhoa143/ainovel-studio/internal/i18n"
	"github.com/huuhoa143/ainovel-studio/internal/store"
)

// previous_tail là mỏ neo liền mạch của writer: phần đuôi chương trước, để chương
// mới nối vào không bị gãy giọng/gãy cảnh. Ngân sách 800 được upstream chọn theo
// đơn vị chữ Hán, tức ~800 chữ nội dung. Cắt 800 RUNE văn Việt chỉ chở ~168 chữ,
// nên writer nối chương chỉ còn thấy một hai câu cuối — văn gãy mạch mà không có
// lỗi nào, không cảnh báo nào, chỉ là chất lượng tụt.
//
// Test chạy trên CẢ hai locale vì package này ghim zh (xem i18n_locale_pin_test.go):
// nếu chỉ kiểm dưới zh thì mọi con số đều bằng rune và bug này vô hình.
func TestPreviousTailGiuDungNganSachNoiDung(t *testing.T) {
	// Câu văn Việt thật, lặp lại cho đủ dài hơn ngân sách.
	viLine := "Hắn đứng lặng bên bờ nước, nhìn con thuyền cuối cùng rời bến trong sương. "
	zhLine := "他站在水边，望着最后一条船在雾里离岸。"

	cases := []struct {
		name   string
		locale i18n.Locale
		body   string
	}{
		{"tiếng Việt", i18n.Vietnamese, strings.Repeat(viLine, 200)},
		{"tiếng Trung", i18n.Chinese, strings.Repeat(zhLine, 200)},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			prev := i18n.Active()
			if err := i18n.SetLocale(c.locale); err != nil {
				t.Fatalf("SetLocale: %v", err)
			}
			t.Cleanup(func() { _ = i18n.SetLocale(prev) })

			dir := t.TempDir()
			s := store.NewStore(dir)
			if err := s.Init(); err != nil {
				t.Fatalf("Init: %v", err)
			}
			if err := s.Drafts.SaveFinalChapter(1, c.body); err != nil {
				t.Fatalf("SaveFinalChapter: %v", err)
			}

			tool := NewContextTool(s, References{}, "")
			env := &chapterContextEnvelope{Working: map[string]any{}, Episodic: map[string]any{},
				References: map[string]any{}, Selected: map[string]any{}}
			tool.buildChapterWorkingMemory(env, contextBuildState{chapter: 2}, func(string, error) {})

			tail, ok := env.Working["previous_tail"].(string)
			if !ok {
				t.Fatalf("thiếu previous_tail trong Working: %v", env.Working)
			}

			// Ngân sách phải đo bằng cùng đơn vị mà cả repo dùng để nói "chữ".
			got := domain.WordCount(tail)
			if got < 700 || got > 900 {
				t.Errorf("previous_tail chở %d chữ, muốn ~800 (±100). Cắt theo rune sẽ ra ~%d chữ.",
					got, domain.WordCount(string([]rune(c.body)[len([]rune(c.body))-800:])))
			}
		})
	}
}
