package serve

import (
	"sort"
	"time"

	"github.com/huuhoa143/ainovel-studio/internal/domain"
)

// Thời lượng sản xuất một chương được suy ra từ checkpoint, không phải từ một
// trường có sẵn trong store — store không lưu thời lượng chương.
//
// Chu kỳ sản xuất một chương là: plan → draft → consistency_check → commit
// (xem internal/tools/{plan,draft,check_consistency,commit}_chapter.go). Mỗi
// bước thành công ghi một checkpoint mang cùng Scope{Kind:chapter, Chapter:N}.
//
// Điểm tinh tế: chuỗi này LẶP LẠI khi chương bị trả về viết lại. Lấy
// max(OccurredAt) - min(OccurredAt) sẽ cộng luôn khoảng thời gian chương nằm
// chờ trong hàng đợi giữa hai lần viết — có thể hàng giờ — và báo ra một con số
// vô nghĩa. Nên ở đây chỉ đo CHU KỲ CUỐI: cắt danh sách tại lần xuất hiện cuối
// của bước mở đầu, rồi đo từ đó tới checkpoint cuối.

// stepCycleStart là bước mở đầu một chu kỳ sản xuất chương.
const stepCycleStart = "plan"

// chapterCycle là một chu kỳ sản xuất của một chương.
type chapterCycle struct {
	Chapter int
	Start   time.Time
	End     time.Time
	Steps   []string
	// Measurable = false khi chu kỳ chỉ có đúng một checkpoint: khi đó thời điểm
	// bắt đầu thật sự không biết được, và trả 0s sẽ là bịa một con số chính xác
	// từ chỗ không có dữ liệu.
	Measurable bool
}

// Duration trả về thời lượng chu kỳ; 0 khi không đo được.
func (c chapterCycle) Duration() time.Duration {
	if !c.Measurable {
		return 0
	}
	return c.End.Sub(c.Start)
}

// latestChapterCycles nhóm checkpoint theo chương và trả về chu kỳ sản xuất gần
// nhất của từng chương. Chỉ xét Scope.Kind == chapter; checkpoint cấp
// arc/volume/global không thuộc chu kỳ chương nào.
func latestChapterCycles(cps []domain.Checkpoint) map[int]chapterCycle {
	byChapter := make(map[int][]domain.Checkpoint)
	for _, cp := range cps {
		if cp.Scope.Kind != domain.ScopeChapter || cp.Scope.Chapter <= 0 {
			continue
		}
		byChapter[cp.Scope.Chapter] = append(byChapter[cp.Scope.Chapter], cp)
	}

	out := make(map[int]chapterCycle, len(byChapter))
	for chapter, list := range byChapter {
		// Sắp theo Seq cho chắc: All() trả bản sao của cache theo thứ tự ghi,
		// nhưng thứ tự đó là hợp đồng ngầm, không phải cam kết của API.
		sort.Slice(list, func(i, j int) bool { return list[i].Seq < list[j].Seq })

		from := 0
		for i, cp := range list {
			if cp.Step == stepCycleStart {
				from = i
			}
		}
		cycle := list[from:]

		steps := make([]string, 0, len(cycle))
		for _, cp := range cycle {
			steps = append(steps, cp.Step)
		}
		out[chapter] = chapterCycle{
			Chapter:    chapter,
			Start:      cycle[0].OccurredAt,
			End:        cycle[len(cycle)-1].OccurredAt,
			Steps:      steps,
			Measurable: len(cycle) > 1,
		}
	}
	return out
}

// runSpan trả về khoảng thời gian toàn phiên sản xuất: checkpoint đầu tiên tới
// checkpoint cuối cùng ở mọi cấp scope. Dùng cho ô "đã chạy" ở transport.
func runSpan(cps []domain.Checkpoint) (first, last time.Time, ok bool) {
	for _, cp := range cps {
		if cp.OccurredAt.IsZero() {
			continue
		}
		if !ok {
			first, last, ok = cp.OccurredAt, cp.OccurredAt, true
			continue
		}
		if cp.OccurredAt.Before(first) {
			first = cp.OccurredAt
		}
		if cp.OccurredAt.After(last) {
			last = cp.OccurredAt
		}
	}
	return first, last, ok
}

// throughput tính năng suất chương/giờ từ số chương đã xong và khoảng phiên.
// Trả ok=false khi khoảng quá ngắn để con số có nghĩa — chia cho vài giây sẽ ra
// "540 chương/giờ", đúng về số học và vô nghĩa về vận hành.
func throughput(completed int, span time.Duration) (perHour float64, ok bool) {
	const minSpan = 2 * time.Minute
	if completed <= 0 || span < minSpan {
		return 0, false
	}
	return float64(completed) / span.Hours(), true
}
