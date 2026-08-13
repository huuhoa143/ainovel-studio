package tools

import (
	"strings"
	"testing"

	"github.com/huuhoa143/ainovel-studio/internal/domain"
	"github.com/huuhoa143/ainovel-studio/internal/i18n"
)

// Các dòng recall phục bút cắt mô tả bằng truncateRunes(desc, 30) — 30 theo đơn
// vị chữ Hán là một mệnh đề đọc được. Với tiếng Việt, 30 rune chỉ còn ~6 chữ, tức
// dòng nhắc phục bút gửi cho writer bị chặt thành mảnh vô nghĩa ("Thanh kiếm mà
// cha nàn…").
// Writer vẫn nhận đủ số dòng nhắc nên không có gì trông như lỗi — chỉ là mấy dòng
// đó không còn nói lên điều gì.
func TestRecallSnippetGiuDuMoTa(t *testing.T) {
	// Mô tả phục bút dài, tiếng Việt thật.
	const desc = "Thanh kiếm mà cha nàng để lại vốn là vật của Thanh Vân môn, " +
		"trên vỏ có khắc dấu hiệu chỉ trưởng môn mới được mang."

	cases := []struct {
		name      string
		locale    i18n.Locale
		wantWords int // số chữ tối thiểu phải giữ được trong dòng nhắc
	}{
		// zh: 30 chữ Hán = 30 rune, giữ nguyên hành vi upstream.
		{"tiếng Trung", i18n.Chinese, 0},
		// vi: phải giữ ~30 chữ; cắt theo rune chỉ còn ~6.
		{"tiếng Việt", i18n.Vietnamese, 20},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			prev := i18n.Active()
			if err := i18n.SetLocale(c.locale); err != nil {
				t.Fatalf("SetLocale: %v", err)
			}
			t.Cleanup(func() { _ = i18n.SetLocale(prev) })

			// Đủ số phục bút để vượt ngưỡng bật recall, và mô tả khớp focus term.
			foreshadow := make([]domain.ForeshadowEntry, 0, storyThreadRecallThreshold)
			for i := 0; i < storyThreadRecallThreshold; i++ {
				foreshadow = append(foreshadow, domain.ForeshadowEntry{
					ID:          "fs" + string(rune('A'+i)),
					Description: desc,
					PlantedAt:   1,
				})
			}

			tool := &ContextTool{}
			items := tool.selectStoryThreads(contextBuildState{
				chapter:      9,
				currentEntry: &domain.OutlineEntry{Chapter: 9, Title: "Thanh kiếm", CoreEvent: "Thanh Vân môn"},
				foreshadow:   foreshadow,
			})
			if len(items) == 0 {
				t.Fatal("không có dòng recall nào: ca test rỗng, phải dựng lại state")
			}

			// Phần mô tả nằm sau dấu hai chấm cuối cùng của dòng nhắc.
			sum := items[0].Summary
			idx := strings.LastIndex(sum, "：")
			if idx < 0 {
				idx = strings.LastIndex(sum, ":")
			}
			if idx < 0 {
				t.Fatalf("không tách được phần mô tả khỏi dòng nhắc: %q", sum)
			}
			snippet := strings.TrimSpace(sum[idx+len("："):])

			if c.wantWords > 0 {
				if got := domain.WordCount(snippet); got < c.wantWords {
					t.Errorf("mô tả bị cắt còn %d chữ (muốn ≥%d): %q", got, c.wantWords, snippet)
				}
			}
			// Bất biến cho cả hai ngôn ngữ: không được cắt tới mức mất nghĩa.
			if strings.Count(snippet, " ") == 0 && domain.WordCount(snippet) <= 1 {
				t.Errorf("mô tả bị cắt tới mức vô nghĩa: %q", snippet)
			}
		})
	}
}
