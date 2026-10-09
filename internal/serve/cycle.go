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

// Checkpoint ghi lúc CÔNG CỤ chạy xong, không phải lúc model bắt đầu nghĩ. Nhiều model viết
// trọn một chương trong MỘT lượt trả lời rồi phát cả bốn lời gọi plan → draft → check →
// commit cùng lúc, nên bốn checkpoint cách nhau vài chục mili giây và chu kỳ đo ra "0,1s" —
// trong khi chương mất cả phút để viết. ĐO ĐƯỢC trên truyện thật (dong-ho-qua-lac, chương 1):
// bốn checkpoint trong 0,12s, còn checkpoint ngay trước đó (soát nền truyện) sớm hơn 86s.
//
// Nên: chu kỳ nào các bước trải ra thật (≥ chuKyDonToiThieu) thì đo như cũ. Chu kỳ bị DỒN
// thì đo từ mốc ngay trước nó — checkpoint liền trước (bất kỳ cấp nào), hoặc lúc mở phiên
// nếu mở phiên muộn hơn — miễn mốc đó không xa quá khoangNghiToiDa (xa hơn là đã có một
// khoảng nghỉ chen vào). Không có mốc tin được thì KHÔNG đo được, chứ không báo 0,1s.
const (
	chuKyDonToiThieu = 2 * time.Second
	khoangNghiToiDa  = 30 * time.Minute
)

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
//
// phienBatDau là lúc mở phiên engine gần nhất (meta/run.json); zero = không biết.
func latestChapterCycles(cps []domain.Checkpoint, phienBatDau time.Time) map[int]chapterCycle {
	tatCa := make([]domain.Checkpoint, 0, len(cps))
	for _, cp := range cps {
		if !cp.OccurredAt.IsZero() {
			tatCa = append(tatCa, cp)
		}
	}
	sort.Slice(tatCa, func(i, j int) bool { return tatCa[i].Seq < tatCa[j].Seq })
	// moc trả về mốc đáng tin ngay trước checkpoint mang Seq `seq` (xem ghi chú đầu tệp).
	moc := func(seq int64, dau time.Time) (time.Time, bool) {
		var truoc time.Time
		for _, cp := range tatCa {
			if cp.Seq >= seq {
				break
			}
			truoc = cp.OccurredAt
		}
		if !phienBatDau.IsZero() && phienBatDau.Before(dau) && phienBatDau.After(truoc) {
			truoc = phienBatDau
		}
		if truoc.IsZero() || dau.Sub(truoc) > khoangNghiToiDa || truoc.After(dau) {
			return time.Time{}, false
		}
		return truoc, true
	}

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
		c := chapterCycle{
			Chapter:    chapter,
			Start:      cycle[0].OccurredAt,
			End:        cycle[len(cycle)-1].OccurredAt,
			Steps:      steps,
			Measurable: len(cycle) > 1,
		}
		// Chu kỳ không mở bằng `plan` cũng thiếu phần đầu: model nghĩ (ĐO ĐƯỢC: hai phút ở
		// chương 3) rồi mới phát `draft`, nên checkpoint đầu tiên đã trễ.
		don := c.End.Sub(c.Start) < chuKyDonToiThieu
		if don || cycle[0].Step != stepCycleStart {
			// Mốc liền trước cũng có thể chỉ sớm hơn vài mili giây (chương nhập từ truyện có
			// sẵn được chốt liền nhau) — khi đó vẫn là không đo được.
			if m, ok := moc(cycle[0].Seq, c.Start); ok && c.End.Sub(m) >= chuKyDonToiThieu {
				c.Start, c.Measurable = m, true
			} else if don {
				c.Measurable = false
			}
		}
		out[chapter] = c
	}
	return out
}

// runSpan trả về checkpoint đầu tiên và cuối cùng ở mọi cấp scope — tức MỐC
// hoạt động gần nhất. KHÔNG dùng hiệu hai mốc này làm thời gian làm việc: nó gộp
// cả lúc máy nghỉ. Thời gian làm việc là thoiGianLam.
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

// khoangNghi: khoảng giữa hai checkpoint liền nhau dài hơn mức này là máy NGHỈ
// (chờ duyệt, tạm dừng, tắt máy qua đêm), không phải một bước đang chạy.
//
// ĐO ĐƯỢC trên truyện thật trước khi chọn số:
//   - truyện 700 chương: p50 một bước 0,5 phút, p99 16 phút; các khoảng nghỉ thì
//     từ 33 phút trở lên (lớn nhất 20 giờ).
//   - truyện 3 chương: một khoảng 55 phút — đúng lúc chương 2 nằm chờ duyệt.
//   - một bước thật dài nhất thấy được ở truyện ngắn: 12 phút.
//
// 30 phút nằm giữa bước chậm nhất có thật và khoảng nghỉ ngắn nhất.
const khoangNghi = 30 * time.Minute

// thoiGianLam là thời gian máy THỰC SỰ làm: tổng các khoảng giữa checkpoint liền
// nhau, bỏ những khoảng dài hơn khoangNghi.
//
// Không dùng runSpan (đầu → cuối) cho số này. Nó gộp cả lúc truyện nằm chờ bạn
// duyệt, và sai theo thời gian thực chứ không theo công việc: ĐO ĐƯỢC "thời gian
// viết 1:11:32" cho một truyện máy chỉ làm 16 phút; truyện 700 chương ra 96 giờ
// thay vì ~40. Bỏ máy qua một tuần rồi viết tiếp thì con số thành một tuần.
// Năng suất chia cho số này cũng sai theo — nên cả hai đọc chung một hàm.
func thoiGianLam(cps []domain.Checkpoint) (time.Duration, bool) {
	ts := make([]time.Time, 0, len(cps))
	for _, cp := range cps {
		if !cp.OccurredAt.IsZero() {
			ts = append(ts, cp.OccurredAt)
		}
	}
	if len(ts) == 0 {
		return 0, false
	}
	sort.Slice(ts, func(i, j int) bool { return ts[i].Before(ts[j]) })
	var tong time.Duration
	for i := 1; i < len(ts); i++ {
		if g := ts[i].Sub(ts[i-1]); g <= khoangNghi {
			tong += g
		}
	}
	return tong, true
}

// throughput tính năng suất chương/giờ từ số chương đã xong và khoảng phiên.
// Trả ok=false khi khoảng quá ngắn để con số có nghĩa — chia cho vài giây sẽ ra
// "540 chương/giờ", đúng về số học và vô nghĩa về vận hành. Cũng vậy khi mới
// xong một hai chương: khoảng phiên lúc đó gồm cả lên dàn ý và thời gian chờ
// duyệt, nên "3,9 chương/giờ" sau chương 1 là con số ngẫu nhiên, không phải nhịp.
func throughput(completed int, span time.Duration) (perHour float64, ok bool) {
	const minSpan = 2 * time.Minute
	const minChapters = 3
	if completed < minChapters || span < minSpan {
		return 0, false
	}
	return float64(completed) / span.Hours(), true
}
