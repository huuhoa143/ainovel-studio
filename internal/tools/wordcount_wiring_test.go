package tools

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/huuhoa143/ainovel-studio/internal/domain"
	"github.com/huuhoa143/ainovel-studio/internal/i18n"
	"github.com/huuhoa143/ainovel-studio/internal/store"
)

// Package này ghim locale=zh (xem i18n_locale_pin_test.go), nên test nào cần
// kiểm đường tiếng Việt phải tự đổi locale rồi phục hồi. Locale là biến toàn cục
// nên chỉ an toàn khi không gọi t.Parallel().
func withVietnamese(t *testing.T) {
	t.Helper()
	prev := i18n.Active()
	if err := i18n.SetLocale(i18n.Vietnamese); err != nil {
		t.Fatalf("SetLocale(vi): %v", err)
	}
	t.Cleanup(func() { _ = i18n.SetLocale(prev) })
}

// vietnameseChapter là văn kể tiếng Việt thật, dài cỡ một đoạn mở chương.
const vietnameseChapter = `Trời đã ngả về chiều, gió từ mặt sông thổi lên mang theo mùi bùn tanh nồng.
Hắn ngồi bệt xuống bậc đá, nhìn đám thuyền chài lục tục kéo lưới về bến.

Có tiếng ai gọi con ở phía sau rặng tre, khàn đặc và mệt mỏi. Hắn không đáp,
chỉ khẽ nhíu mắt trông theo vệt nắng cuối cùng tắt dần trên nóc miếu.`

// TestDraftChapterWordCountIsWordsNotRunes chốt việc ĐÃ NỐI DÂY, không chỉ là
// hàm đếm đúng: draft_chapter trả word_count cho model và cho quality gate đọc.
// Nếu chỗ này còn đếm rune thì hàm đếm đúng cũng vô nghĩa.
func TestDraftChapterWordCountIsWordsNotRunes(t *testing.T) {
	withVietnamese(t)

	s := store.NewStore(t.TempDir())
	if err := s.Init(); err != nil {
		t.Fatalf("Init: %v", err)
	}
	if err := s.Progress.Init("test", 5); err != nil {
		t.Fatalf("Progress.Init: %v", err)
	}
	if err := s.Progress.UpdatePhase(domain.PhaseWriting); err != nil {
		t.Fatalf("UpdatePhase: %v", err)
	}

	args, err := json.Marshal(map[string]any{
		"chapter": 1,
		"content": vietnameseChapter,
		"mode":    "write",
	})
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	raw, err := tryDraft(t, s, args)
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}

	var out struct {
		WordCount int `json:"word_count"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}

	runes := utf8.RuneCountInString(vietnameseChapter)
	if out.WordCount == runes {
		t.Fatalf("word_count = %d, đúng bằng số rune — vẫn đang đếm ký tự", out.WordCount)
	}
	if out.WordCount >= runes/3 {
		t.Errorf("word_count=%d runes=%d — số chữ tiếng Việt phải dưới 1/3 số rune", out.WordCount, runes)
	}
	// Đếm tay từng dòng: 17 + 16 + 18 + 15 = 66 chữ. Chốt con số tuyệt đối để một
	// thay đổi âm thầm ở hàm đếm (ví dụ tính dấu câu là chữ) không lọt qua chỉ
	// nhờ hai chặn tỉ lệ ở trên.
	if out.WordCount != 66 {
		t.Errorf("word_count = %d, muốn 66 (đếm tay)", out.WordCount)
	}
}

// TestReadChapterRangeBudgetScalesWithLanguage chốt ngân sách cắt chuỗi của
// read_chapter(from,to) được quy đổi: với tiếng Việt, 2000 rune chỉ chở ~1/5 nội
// dung, model đọc liên tục trước sau sẽ chỉ nhận 20% đầu mỗi chương mà không có
// dấu hiệu nào cho biết đã bị cắt.
func TestReadChapterRangeBudgetScalesWithLanguage(t *testing.T) {
	withVietnamese(t)

	s := store.NewStore(t.TempDir())
	if err := s.Init(); err != nil {
		t.Fatalf("Init: %v", err)
	}
	// Chương dài ~6000 rune: quá ngưỡng cũ (2000) nhưng dưới ngưỡng đã quy đổi (9500).
	long := strings.Repeat(vietnameseChapter+"\n\n", 20)
	if utf8.RuneCountInString(long) <= 2000 {
		t.Fatalf("dữ liệu test sai: cần >2000 rune, có %d", utf8.RuneCountInString(long))
	}
	if err := s.Drafts.SaveFinalChapter(1, long); err != nil {
		t.Fatalf("SaveFinalChapter: %v", err)
	}

	args, err := json.Marshal(map[string]any{"from": 1, "to": 1, "source": "final"})
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	raw, err := NewReadChapterTool(s).Execute(context.Background(), args)
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	var out struct {
		Chapters map[string]string `json:"chapters"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	got := out.Chapters["1"]
	if strings.HasSuffix(got, "...") {
		t.Errorf("chương %d rune bị cắt ở ngân sách chưa quy đổi — model nhận thiếu nội dung",
			utf8.RuneCountInString(long))
	}
}

// tryDraft gọi draft_chapter và bỏ qua trạng thái tiền đề mà tool đòi hỏi:
// test này chỉ quan tâm word_count trong kết quả trả về.
func tryDraft(t *testing.T, s *store.Store, args json.RawMessage) (json.RawMessage, error) {
	t.Helper()
	return NewDraftChapterTool(s).Execute(context.Background(), args)
}
