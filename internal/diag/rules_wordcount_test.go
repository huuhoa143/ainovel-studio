package diag

import (
	"strings"
	"testing"

	"github.com/huuhoa143/ainovel-studio/internal/domain"
)

// TestWordCountAnomalyUsesMedianNotMean chốt lý do đổi mốc so sánh sang trung vị.
//
// Kịch bản: một cuốn viết dở qua thời điểm đổi cách đếm chữ. Bốn chương cũ còn
// giữ số đếm bằng rune (~4,75 lần phồng), bốn chương mới đếm bằng chữ. Lấy trung
// bình thì mốc bị chính mấy chương phồng kéo lên, và toàn bộ chương ĐÚNG bị báo
// là "quá ngắn" — quy tắc chỉ đúng ngón tay vào nhóm lành. Trung vị bám nhóm đa
// số nên chỉ những chương thật sự lệch bị nêu.
func TestWordCountAnomalyUsesMedianNotMean(t *testing.T) {
	snap := &Snapshot{Progress: &domain.Progress{
		ChapterWordCounts: map[int]int{
			1: 3000, 2: 3100, 3: 2900, 4: 3050, 5: 2950, // nhóm đa số, đếm bằng chữ
			6: 14000, 7: 14500, // chương cũ còn đếm bằng rune
		},
	}}

	findings := WordCountAnomaly(snap)
	if len(findings) != 1 {
		t.Fatalf("muốn 1 finding, có %d: %+v", len(findings), findings)
	}
	ev := findings[0].Evidence
	for _, ch := range []string{"ch6", "ch7"} {
		if !strings.Contains(ev, ch) {
			t.Errorf("chương phồng %s phải bị nêu, evidence=%q", ch, ev)
		}
	}
	for _, ch := range []string{"ch1", "ch2", "ch3", "ch4", "ch5"} {
		if strings.Contains(ev, ch) {
			t.Errorf("chương bình thường %s KHÔNG được nêu, evidence=%q", ch, ev)
		}
	}
	// Mốc trong tiêu đề phải là trung vị của nhóm đa số (3050 — phần tử giữa của
	// 2900/2950/3000/3050/3100/14000/14500), không phải trung bình (6214) đã bị
	// hai chương phồng kéo lên.
	if !strings.Contains(findings[0].Title, "3050") {
		t.Errorf("tiêu đề phải nêu mốc trung vị 3050, có %q", findings[0].Title)
	}
}

// TestWordCountAnomalyStillCatchesTruncation giữ đúng công dụng gốc của quy tắc:
// chương bị cắt vì hết token vẫn phải bị nêu.
func TestWordCountAnomalyStillCatchesTruncation(t *testing.T) {
	snap := &Snapshot{Progress: &domain.Progress{
		ChapterWordCounts: map[int]int{
			1: 3000, 2: 3100, 3: 2900, 4: 3050, 5: 400, // ch5 bị cắt giữa chừng
		},
	}}

	findings := WordCountAnomaly(snap)
	if len(findings) != 1 {
		t.Fatalf("muốn 1 finding, có %d", len(findings))
	}
	if !strings.Contains(findings[0].Evidence, "ch5") {
		t.Errorf("chương bị cắt phải bị nêu, evidence=%q", findings[0].Evidence)
	}
}

func TestWordCountAnomalyQuietWhenUniform(t *testing.T) {
	snap := &Snapshot{Progress: &domain.Progress{
		ChapterWordCounts: map[int]int{1: 3000, 2: 3100, 3: 2900, 4: 3050},
	}}
	if findings := WordCountAnomaly(snap); len(findings) != 0 {
		t.Errorf("chương đều nhau không được báo gì, có %+v", findings)
	}
}
