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
	got := latestChapterCycles(cps, time.Time{})
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
	c := latestChapterCycles(cps, time.Time{})[41]
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
	c := latestChapterCycles([]domain.Checkpoint{cp(1, 12, "commit", t0)}, time.Time{})[12]
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
	got := latestChapterCycles(cps, time.Time{})
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
	if want, got := 4*time.Minute, latestChapterCycles(cps, time.Time{})[41].Duration(); got != want {
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
		{"phiên quá ngắn thì con số vô nghĩa", 5, 20 * time.Second, false, 0},
		{"mới một hai chương thì chưa phải nhịp", 2, time.Hour, false, 0},
		{"đủ ba chương thì đo", 3, time.Hour, true, 3},
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

// Số đo THẬT của truyện dong-ho-qua-lac (2026-10-02): model viết trọn chương trong một lượt
// rồi phát cả bốn lời gọi cùng lúc, nên bốn checkpoint của chương 1 nằm trong 0,12s. Bảng
// chương từng ghi "0,1s" cho một chương mất 86s.
func TestLatestChapterCycles_ChuKyDonDoTuMocTruoc(t *testing.T) {
	at := func(s string) time.Time {
		v, err := time.Parse(time.RFC3339Nano, s)
		if err != nil {
			t.Fatal(err)
		}
		return v
	}
	glob := func(seq int64, step, s string) domain.Checkpoint {
		return domain.Checkpoint{Seq: seq, Scope: domain.Scope{Kind: domain.ScopeGlobal}, Step: step, OccurredAt: at(s)}
	}
	cps := []domain.Checkpoint{
		glob(4, "world_rules", "2026-10-02T11:37:43.362+07:00"),
		glob(5, "foundation_audit", "2026-10-02T11:37:50.991+07:00"),
		cp(6, 1, "plan", at("2026-10-02T11:39:16.572+07:00")),
		cp(7, 1, "draft", at("2026-10-02T11:39:16.594+07:00")),
		cp(8, 1, "consistency_check", at("2026-10-02T11:39:16.609+07:00")),
		cp(9, 1, "commit", at("2026-10-02T11:39:16.686+07:00")),
		cp(10, 2, "plan", at("2026-10-02T11:39:50.186+07:00")),
		cp(11, 2, "draft", at("2026-10-02T11:39:50.209+07:00")),
		cp(12, 2, "consistency_check", at("2026-10-02T11:39:50.223+07:00")),
		cp(13, 2, "commit", at("2026-10-02T11:39:50.300+07:00")),
		cp(14, 3, "draft", at("2026-10-02T11:41:58.964+07:00")),
		cp(15, 3, "consistency_check", at("2026-10-02T11:42:04.114+07:00")),
		cp(16, 3, "commit", at("2026-10-02T11:42:10.292+07:00")),
	}
	got := latestChapterCycles(cps, at("2026-10-02T11:37:16+07:00"))
	muon := map[int]time.Duration{1: 85 * time.Second, 2: 33 * time.Second, 3: 139 * time.Second}
	for ch, m := range muon {
		c := got[ch]
		if !c.Measurable {
			t.Errorf("chương %d phải đo được", ch)
			continue
		}
		if d := c.Duration().Truncate(time.Second); d != m {
			t.Errorf("chương %d = %v, muốn %v", ch, d, m)
		}
	}
}

// Mốc trước xa hơn khoảng nghỉ tối đa (phiên đã dừng giữa chừng) → không đo được, không bịa.
func TestLatestChapterCycles_ChuKyDonMocQuaXaThiKhongDo(t *testing.T) {
	cps := []domain.Checkpoint{
		cp(1, 4, "commit", t0),
		cp(2, 5, "plan", t0.Add(3*time.Hour)),
		cp(3, 5, "commit", t0.Add(3*time.Hour+50*time.Millisecond)),
	}
	if c := latestChapterCycles(cps, time.Time{})[5]; c.Measurable {
		t.Errorf("mốc cách 3 giờ phải là không đo được, được %v", c.Duration())
	}
}

// Mở phiên MUỘN hơn checkpoint trước → đo từ lúc mở phiên, không cộng thời gian máy tắt.
func TestLatestChapterCycles_ChuKyDonDoTuLucMoPhien(t *testing.T) {
	cps := []domain.Checkpoint{
		cp(1, 4, "commit", t0),
		cp(2, 5, "plan", t0.Add(20*time.Minute)),
		cp(3, 5, "commit", t0.Add(20*time.Minute+50*time.Millisecond)),
	}
	c := latestChapterCycles(cps, t0.Add(19*time.Minute))[5]
	if !c.Measurable || c.Duration().Truncate(time.Second) != time.Minute {
		t.Errorf("phải đo từ lúc mở phiên (1 phút), được %v measurable=%v", c.Duration(), c.Measurable)
	}
}

// Chương nhập từ truyện có sẵn: chốt liền nhau cách vài mili giây → vẫn không đo được.
func TestLatestChapterCycles_ChuongNhapLienNhauKhongDo(t *testing.T) {
	cps := []domain.Checkpoint{
		cp(1, 1, "commit", t0),
		cp(2, 2, "commit", t0.Add(5*time.Millisecond)),
	}
	if c := latestChapterCycles(cps, time.Time{})[2]; c.Measurable {
		t.Errorf("hai lần chốt cách 5ms không phải là thời lượng viết, được %v", c.Duration())
	}
}

// Thời gian viết là thời gian máy LÀM, không phải đầu → cuối.
//
// Ca thật đã đo: ba bước liền nhau vài phút, rồi chương nằm chờ duyệt 55 phút,
// rồi viết tiếp. runSpan nói 1 giờ 11 phút; máy chỉ làm khoảng 16 phút.
func TestThoiGianLamBoKhoangNghi(t *testing.T) {
	t0 := time.Date(2026, 10, 3, 9, 54, 0, 0, time.UTC)
	at := func(m float64) domain.Checkpoint {
		return domain.Checkpoint{OccurredAt: t0.Add(time.Duration(m * float64(time.Minute)))}
	}
	// Không theo thứ tự: hàm phải tự xếp, store không hứa thứ tự.
	cps := []domain.Checkpoint{at(6), at(0), at(3), at(61), at(63), at(70)}

	lam, ok := thoiGianLam(cps)
	if !ok {
		t.Fatal("phải đo được")
	}
	// 0→3→6 = 6 phút; 6→61 là chờ duyệt (bỏ); 61→63→70 = 9 phút.
	if lam != 15*time.Minute {
		t.Errorf("thời gian làm = %v, muốn 15m (khoảng chờ duyệt 55 phút phải bị bỏ)", lam)
	}

	// Một bước dài nhưng có thật (25 phút < ngưỡng nghỉ) vẫn được tính.
	if lam, _ := thoiGianLam([]domain.Checkpoint{at(0), at(25)}); lam != 25*time.Minute {
		t.Errorf("bước 25 phút bị coi là nghỉ: %v", lam)
	}

	if _, ok := thoiGianLam(nil); ok {
		t.Error("không có checkpoint thì không đo được")
	}
}
