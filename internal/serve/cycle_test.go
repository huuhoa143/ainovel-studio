package serve

import (
	"testing"
	"time"

	"github.com/huuhoa143/ainovel-studio/internal/domain"
)

func cp(seq int64, chapter int, step string, at time.Time) domain.Checkpoint {
	return domain.Checkpoint{
		Seq:        seq,
		Scope:      domain.ChapterScope(chapter),
		Step:       step,
		OccurredAt: at,
	}
}

var t0 = time.Date(2026, 7, 30, 10, 0, 0, 0, time.UTC)

func TestLatestChapterCycles_ChuKyDon(t *testing.T) {
	cps := []domain.Checkpoint{
		cp(1, 47, "plan", t0),
		cp(2, 47, "draft", t0.Add(80*time.Second)),
		cp(3, 47, "consistency_check", t0.Add(100*time.Second)),
		cp(4, 47, "commit", t0.Add(2*time.Minute)),
	}
	got := latestChapterCycles(cps)
	c, ok := got[47]
	if !ok {
		t.Fatal("thiếu chương 47")
	}
	if !c.Measurable {
		t.Error("chu kỳ 4 checkpoint phải đo được")
	}
	if want := 2 * time.Minute; c.Duration() != want {
		t.Errorf("thời lượng = %v, muốn %v", c.Duration(), want)
	}
}

// Đây là ca chính của cả file: chương bị trả về viết lại sau nhiều giờ. Đo
// max-min sẽ ra ~6 giờ (gồm cả thời gian nằm chờ trong hàng đợi); chỉ chu kỳ
// cuối mới là thời lượng sản xuất thật.
func TestLatestChapterCycles_ChiDoChuKyCuoiKhiVietLai(t *testing.T) {
	cps := []domain.Checkpoint{
		cp(1, 41, "plan", t0),
		cp(2, 41, "draft", t0.Add(1*time.Minute)),
		cp(3, 41, "commit", t0.Add(3*time.Minute)),
		// ...chương nằm chờ trong hàng đợi viết lại 6 giờ...
		cp(9, 41, "plan", t0.Add(6*time.Hour)),
		cp(10, 41, "draft", t0.Add(6*time.Hour+90*time.Second)),
		cp(11, 41, "commit", t0.Add(6*time.Hour+4*time.Minute)),
	}
	c := latestChapterCycles(cps)[41]
	if want := 4 * time.Minute; c.Duration() != want {
		t.Errorf("thời lượng = %v, muốn %v (không được tính khoảng nằm chờ)", c.Duration(), want)
	}
	if len(c.Steps) != 3 {
		t.Errorf("chu kỳ cuối phải có 3 bước, được %v", c.Steps)
	}
}

func TestLatestChapterCycles_MotCheckpointThiKhongDoDuoc(t *testing.T) {
	// Chương chỉ mới commit (ví dụ nhập từ nguồn ngoài, không qua plan/draft):
	// không biết lúc nào bắt đầu, nên phải nói "không đo được" thay vì báo 0s.
	c := latestChapterCycles([]domain.Checkpoint{cp(1, 12, "commit", t0)})[12]
	if c.Measurable {
		t.Error("một checkpoint đơn lẻ không được coi là đo được")
	}
	if c.Duration() != 0 {
		t.Errorf("không đo được thì Duration phải là 0, được %v", c.Duration())
	}
}

func TestLatestChapterCycles_BoQuaScopeKhongPhaiChuong(t *testing.T) {
	cps := []domain.Checkpoint{
		{Seq: 1, Scope: domain.GlobalScope(), Step: "premise", OccurredAt: t0},
		{Seq: 2, Scope: domain.ArcScope(3, 2), Step: "arc_summary", OccurredAt: t0.Add(time.Minute)},
		{Seq: 3, Scope: domain.VolumeScope(3), Step: "volume_summary", OccurredAt: t0.Add(2 * time.Minute)},
		cp(4, 47, "plan", t0.Add(3*time.Minute)),
		cp(5, 47, "commit", t0.Add(5*time.Minute)),
	}
	got := latestChapterCycles(cps)
	if len(got) != 1 {
		t.Fatalf("chỉ chương 47 được tính, được %d mục: %v", len(got), got)
	}
	if _, ok := got[0]; ok {
		t.Error("scope global/arc/volume không được tạo mục chương 0")
	}
}

// All() trả về theo thứ tự ghi, nhưng đó là hợp đồng ngầm. Đưa danh sách xáo
// trộn vào để chốt rằng hàm tự sắp theo Seq.
func TestLatestChapterCycles_TuSapTheoSeq(t *testing.T) {
	cps := []domain.Checkpoint{
		cp(11, 41, "commit", t0.Add(6*time.Hour+4*time.Minute)),
		cp(1, 41, "plan", t0),
		cp(9, 41, "plan", t0.Add(6*time.Hour)),
		cp(3, 41, "commit", t0.Add(3*time.Minute)),
		cp(10, 41, "draft", t0.Add(6*time.Hour+90*time.Second)),
		cp(2, 41, "draft", t0.Add(1*time.Minute)),
	}
	if want, got := 4*time.Minute, latestChapterCycles(cps)[41].Duration(); got != want {
		t.Errorf("thời lượng = %v, muốn %v — danh sách xáo trộn phải được sắp lại", got, want)
	}
}

func TestRunSpan(t *testing.T) {
	_, _, ok := runSpan(nil)
	if ok {
		t.Error("danh sách rỗng phải trả ok=false")
	}

	cps := []domain.Checkpoint{
		cp(2, 47, "draft", t0.Add(2*time.Hour)),
		cp(1, 47, "plan", t0),
		{Seq: 3, Scope: domain.GlobalScope(), Step: "compass"}, // OccurredAt zero → bỏ qua
	}
	first, last, ok := runSpan(cps)
	if !ok {
		t.Fatal("phải trả ok=true")
	}
	if !first.Equal(t0) || !last.Equal(t0.Add(2*time.Hour)) {
		t.Errorf("span = %v..%v, muốn %v..%v", first, last, t0, t0.Add(2*time.Hour))
	}
}

func TestThroughput(t *testing.T) {
	cases := []struct {
		name      string
		completed int
		span      time.Duration
		wantOK    bool
		want      float64
	}{
		{"bình thường", 47, 6*time.Hour + 12*time.Minute, true, 47 / 6.2},
		{"chưa xong chương nào", 0, 3 * time.Hour, false, 0},
		{"phiên quá ngắn thì con số vô nghĩa", 2, 20 * time.Second, false, 0},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, ok := throughput(c.completed, c.span)
			if ok != c.wantOK {
				t.Fatalf("ok = %v, muốn %v", ok, c.wantOK)
			}
			if ok && (got < c.want-0.05 || got > c.want+0.05) {
				t.Errorf("năng suất = %.3f, muốn ~%.3f", got, c.want)
			}
		})
	}
}
