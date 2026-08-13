package serve

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/huuhoa143/ainovel-studio/internal/domain"
	"github.com/huuhoa143/ainovel-studio/internal/host"
	"github.com/huuhoa143/ainovel-studio/internal/store"
)

// buildSnapshot đọc store và dựng payload cho bề mặt studio.
//
// Chỉ dùng phương thức đọc công khai của store. Không sửa gì, không gọi engine.
// Nhờ vậy `ainovel serve` chạy song song với engine (TUI hoặc headless) mà không
// tranh chấp, và fork này không phải chạm vào core — điều quan trọng vì upstream
// vẫn đang phát triển nhanh và mỗi dòng sửa ở core là một xung đột rebase.
func buildSnapshot(st *store.Store, id string, selected int) (*Snapshot, error) {
	progress, err := st.Progress.Load()
	if err != nil {
		return nil, fmt.Errorf("đọc progress: %w", err)
	}
	if progress == nil {
		return nil, errNotInitialized
	}

	cps := st.Checkpoints.All()
	cycles := latestChapterCycles(cps)
	timeline := buildTimeline(st, progress)

	// Ba cờ dưới suy từ CHÍNH builder mà ba endpoint kia dùng, không từ một phép
	// kiểm riêng — xem ghi chú ở Capabilities. Lỗi đọc ở đây KHÔNG làm sập
	// snapshot: bề mặt studio không phụ thuộc ba nguồn này, và một usage.json
	// hỏng không đáng làm trắng cả dòng sản xuất. Cờ false là câu trả lời đúng
	// cho "không có dữ liệu để vẽ", bất kể vì chưa ghi hay vì đọc không được;
	// endpoint tương ứng mới là chỗ nói ra ca nào.
	styleDoc, _ := buildStyle(st)
	costDoc, _ := buildCost(st)
	settingsDoc, _ := buildSettings(st)

	snap := &Snapshot{
		Book:     bookFrom(st, id, progress, cps),
		Timeline: timeline,
		Chapters: buildChapterRows(st, progress, cycles),
		Capabilities: Capabilities{
			PerChapterDuration: true,
			PerChapterCost:     false, // UsageState chỉ cộng theo agent/model
			// Suy từ DỮ LIỆU thật, không từ cờ progress.Layered. Cờ đó do engine
			// đặt ở một đường riêng và có thể còn false trong khi
			// layered_outline.json đã có nội dung — khi đó giao diện sẽ ẩn hai
			// lane trên dù có đủ dữ liệu để vẽ. Đã gặp thật lúc thử với dữ liệu
			// thật: payload có 2 tập, 2 cung, mà capability báo false.
			LayeredOutline: len(timeline.Volumes) > 0,
			// Steer do handleStudio đặt: nó phụ thuộc server (có mắc route ghi không), không
			// phụ thuộc store. Để false ở đây là giá trị khởi tạo, không phải kết luận.
			Steer:         false,
			StyleRules:    coVanPhong(styleDoc),
			CostBreakdown: coChiPhiChiTiet(costDoc),
			RunSettings:   coCaiDat(settingsDoc),
		},
		Transport: buildTransport(st, progress, cps),
		Decisions: buildDecisions(st),
		Warnings:  storeWarnings(st),
	}

	if selected > 0 {
		snap.Selected = buildSelection(st, selected)
	}
	if items, err := st.Runtime.LoadQueue(); err == nil && len(items) > 0 {
		snap.QueueSeq = items[len(items)-1].Seq
	}
	return snap, nil
}

func bookFrom(st *store.Store, id string, p *domain.Progress, cps []domain.Checkpoint) Book {
	b := Book{
		ID:       id,
		Name:     p.NovelName,
		Phase:    string(p.Phase),
		Flow:     string(p.Flow),
		Done:     len(p.CompletedChapters),
		Total:    p.TotalChapters,
		Words:    p.TotalWordCount,
		Activity: activityOf(p, cps),
	}
	if _, last, ok := runSpan(cps); ok {
		b.UpdatedAt = last.UTC().Format(time.RFC3339)
	}
	// Dùng CHÍNH builder mà /studio dùng cho Transport, không suy lại riêng — xem ghi chú ở
	// Book. CostPerChapter/ChaptersPerHour là con trỏ bên Transport (nil = chưa đo được);
	// Book muốn khóa luôn có mặt nên ngã về 0 khi chưa đo được, xem ghi chú ở Book.
	tr := buildTransport(st, p, cps)
	b.CostUSD = tr.CostUSD
	if tr.CostPerChapter != nil {
		b.CostPerChapter = *tr.CostPerChapter
	}
	if tr.ChaptersPerHour != nil {
		b.ChaptersPerHour = *tr.ChaptersPerHour
	}
	return b
}

// activityIdleAfter là ngưỡng coi một phiên là đã nguội. Không có cờ "engine
// đang chạy" trong store — engine là process khác — nên trạng thái được suy ra
// từ độ mới của checkpoint cuối. Đây là suy đoán, và ngưỡng phải đủ rộng để
// không gán "nguội" cho một bước draft dài đang chạy bình thường.
const activityIdleAfter = 10 * time.Minute

func activityOf(p *domain.Progress, cps []domain.Checkpoint) string {
	if p.Phase == domain.PhaseComplete {
		return "complete"
	}
	_, last, ok := runSpan(cps)
	if !ok || time.Since(last) > activityIdleAfter {
		return "idle"
	}
	return "running"
}

// buildTimeline dựng trục ba tầng: tập → cung của tập hiện tại → chương.
func buildTimeline(st *store.Store, p *domain.Progress) Timeline {
	tl := Timeline{Chapters: buildChapterMarks(p)}

	volumes, err := st.Outline.LoadLayeredOutline()
	if err != nil || len(volumes) == 0 {
		// Truyện ngắn/vừa: không có cấu trúc phân tầng. Trả lane chương thôi,
		// giao diện tự ẩn hai lane trên — đây là dạng hợp lệ, không phải lỗi.
		return tl
	}

	for i := range volumes {
		v := &volumes[i]
		tl.Volumes = append(tl.Volumes, volumeBlock(v, p))
	}
	for i := range volumes {
		v := &volumes[i]
		if v.Index != p.CurrentVolume {
			continue
		}
		for j := range v.Arcs {
			tl.Arcs = append(tl.Arcs, arcBlock(&v.Arcs[j], v.Index, p))
		}
	}
	return tl
}

func volumeBlock(v *domain.VolumeOutline, p *domain.Progress) LaneBlock {
	b := LaneBlock{Index: v.Index, Title: v.Title, Final: v.Final}

	if !v.IsExpanded() {
		b.State = "unplanned"
		b.Estimated = true
		return b
	}

	from, to := 0, 0
	estimated := false
	for i := range v.Arcs {
		arc := &v.Arcs[i]
		if !arc.IsExpanded() {
			b.Chapters += arc.EstimatedChapters
			estimated = true
			continue
		}
		for _, ch := range arc.Chapters {
			b.Chapters++
			if from == 0 || ch.Chapter < from {
				from = ch.Chapter
			}
			if ch.Chapter > to {
				to = ch.Chapter
			}
		}
	}
	b.From, b.To, b.Estimated = from, to, estimated

	switch {
	case v.Index == p.CurrentVolume:
		b.State = "running"
	case to > 0 && allCompleted(p, from, to):
		b.State = "done"
	case v.Index < p.CurrentVolume:
		b.State = "done"
	default:
		b.State = "planned"
	}
	return b
}

func arcBlock(a *domain.ArcOutline, volume int, p *domain.Progress) LaneBlock {
	b := LaneBlock{Index: a.Index, Title: a.Title}

	if !a.IsExpanded() {
		// Cung骨架: chưa có chương chi tiết, Architect sẽ mở khi viết tới.
		b.State = "unplanned"
		b.Chapters = a.EstimatedChapters
		b.Estimated = true
		return b
	}

	from, to := 0, 0
	for _, ch := range a.Chapters {
		b.Chapters++
		if from == 0 || ch.Chapter < from {
			from = ch.Chapter
		}
		if ch.Chapter > to {
			to = ch.Chapter
		}
	}
	b.From, b.To = from, to

	next := p.NextChapter()
	switch {
	case allCompleted(p, from, to):
		b.State = "done"
	case volume == p.CurrentVolume && a.Index == p.CurrentArc:
		b.State = "running"
	case next >= from && next <= to:
		b.State = "running"
	default:
		b.State = "planned"
	}
	return b
}

func allCompleted(p *domain.Progress, from, to int) bool {
	if from <= 0 || to < from {
		return false
	}
	done := make(map[int]bool, len(p.CompletedChapters))
	for _, c := range p.CompletedChapters {
		done[c] = true
	}
	for c := from; c <= to; c++ {
		if !done[c] {
			return false
		}
	}
	return true
}

func buildChapterMarks(p *domain.Progress) []ChapterMark {
	total := p.TotalChapters
	if total <= 0 {
		total = p.LatestCompleted()
	}
	if total <= 0 {
		return nil
	}

	done := make(map[int]bool, len(p.CompletedChapters))
	for _, c := range p.CompletedChapters {
		done[c] = true
	}
	rewrite := make(map[int]bool, len(p.PendingRewrites))
	for _, c := range p.PendingRewrites {
		rewrite[c] = true
	}

	marks := make([]ChapterMark, 0, total)
	for c := 1; c <= total; c++ {
		marks = append(marks, ChapterMark{Chapter: c, State: chapterState(c, p, done, rewrite)})
	}
	return marks
}

// chapterState quyết định trạng thái một chương. Thứ tự xét quan trọng: chương
// đang viết lại vẫn nằm trong CompletedChapters (bản终稿 cũ còn đó), nên phải
// xét hàng đợi viết lại TRƯỚC khi xét đã xong, nếu không trạng thái "trả về
// viết lại" sẽ không bao giờ hiện ra.
func chapterState(c int, p *domain.Progress, done, rewrite map[int]bool) string {
	switch {
	case rewrite[c]:
		return "rewrite"
	case c == p.InProgressChapter:
		return "running"
	case done[c]:
		return "done"
	default:
		return "pending"
	}
}

func buildChapterRows(st *store.Store, p *domain.Progress, cycles map[int]chapterCycle) []ChapterRow {
	done := make(map[int]bool, len(p.CompletedChapters))
	for _, c := range p.CompletedChapters {
		done[c] = true
	}
	rewrite := make(map[int]bool, len(p.PendingRewrites))
	for _, c := range p.PendingRewrites {
		rewrite[c] = true
	}

	// Chỉ trả các chương đã có dấu vết sản xuất, cộng chương kế tiếp. Trả cả 300
	// hàng rỗng cho một cuốn mới bắt đầu là rác, không phải dữ liệu.
	wanted := map[int]bool{}
	for c := range done {
		wanted[c] = true
	}
	for c := range rewrite {
		wanted[c] = true
	}
	for c := range cycles {
		wanted[c] = true
	}
	if p.InProgressChapter > 0 {
		wanted[p.InProgressChapter] = true
	}
	if next := p.NextChapter(); next > 0 && (p.TotalChapters == 0 || next <= p.TotalChapters) {
		wanted[next] = true
	}

	chapters := make([]int, 0, len(wanted))
	for c := range wanted {
		chapters = append(chapters, c)
	}
	sort.Ints(chapters)

	rows := make([]ChapterRow, 0, len(chapters))
	for _, c := range chapters {
		row := ChapterRow{
			Chapter: c,
			Title:   chapterTitle(st, c),
			Stage:   rowStage(c, p, done, rewrite),
			Words:   p.ChapterWordCounts[c],
		}
		if cyc, ok := cycles[c]; ok {
			if cyc.Measurable {
				ms := cyc.Duration().Milliseconds()
				row.DurationMs = &ms
			}
			row.Owner = ownersFromSteps(cyc.Steps)
		}
		rows = append(rows, row)
	}
	return rows
}

func rowStage(c int, p *domain.Progress, done, rewrite map[int]bool) string {
	switch {
	case rewrite[c]:
		return "rewrite"
	case c == p.InProgressChapter:
		return "drafting"
	case done[c]:
		return "done"
	default:
		return "pending"
	}
}

// ownersFromSteps suy ra vai nào đã tham gia chu kỳ, dựa vào bước checkpoint.
// Ánh xạ này khớp với các tool ghi checkpoint trong internal/tools.
func ownersFromSteps(steps []string) []string {
	var writer, editor bool
	for _, s := range steps {
		switch s {
		case "plan", "draft", "consistency_check", "commit", "edit":
			writer = true
		case "review", "arc_summary", "volume_summary":
			editor = true
		}
	}
	var out []string
	if writer {
		out = append(out, "writer")
	}
	if editor {
		out = append(out, "editor")
	}
	return out
}

func chapterTitle(st *store.Store, chapter int) string {
	if e, err := st.Outline.GetChapterOutline(chapter); err == nil && e != nil && e.Title != "" {
		return e.Title
	}
	if e, err := st.Outline.GetChapterFromLayered(chapter); err == nil && e != nil {
		return e.Title
	}
	return ""
}

func buildTransport(st *store.Store, p *domain.Progress, cps []domain.Checkpoint) Transport {
	tr := Transport{State: activityOf(p, cps)}

	if meta, err := st.RunMeta.Load(); err == nil && meta != nil {
		tr.Model = meta.Model
	}
	if usage, err := st.Usage.Load(); err == nil && usage != nil {
		tr.CostUSD = usage.Overall.Cost
		if n := len(p.CompletedChapters); n > 0 && usage.Overall.Cost > 0 {
			per := usage.Overall.Cost / float64(n)
			tr.CostPerChapter = &per
		}
	}

	if first, last, ok := runSpan(cps); ok {
		span := last.Sub(first)
		ms := span.Milliseconds()
		tr.ElapsedMs = &ms
		if perHour, ok := throughput(len(p.CompletedChapters), span); ok {
			tr.ChaptersPerHour = &perHour
		}
	}

	// Bước vừa HOÀN THÀNH, không phải bước đang chạy — store chỉ ghi checkpoint
	// khi một bước thành công. Xem ghi chú ở Transport.LastStep về việc tên
	// field cũ ("step") từng làm giao diện hiện sai công đoạn.
	if cp := st.Checkpoints.LatestGlobal(); cp != nil {
		tr.LastStep = cp.Step
		// Vai suy từ CHÍNH bước đó, cùng bảng mà ChapterRow.Owner dùng — một bảng
		// cho hai chỗ, nên không thể có chuyện thanh dưới và bảng chương gọi tên
		// hai vai khác nhau cho cùng một bước.
		//
		// Trường này TỪNG được khai mà không ai gán, và cái lỗ đó trúng đúng ca
		// chính: giao diện đọc `song?.vai ?? transport.agent`, mà `song` chỉ có khi
		// SSE đang chảy — tức khi engine đang chạy VÀ trang đang mở. Mở studio sau
		// khi engine đã dừng thì ô `tổ` chỉ còn tên model, mất vai. Đó đúng là ca
		// mà PRODUCT.md đặt làm ca chính ("mở studio sau 6 giờ đi vắng").
		//
		// Lỗ này sống lâu được vì seed-demo có gieo `Agent` vào sự kiện runtime, nên
		// mọi lượt kiểm bằng fixture đều thấy vai hiện ra bình thường. Fixture giàu
		// hơn đường thật là chỗ ẩn lỗi tốt nhất.
		if owners := ownersFromSteps([]string{cp.Step}); len(owners) > 0 {
			tr.Agent = owners[0]
		}
	}
	return tr
}

func buildDecisions(st *store.Store) []Decision {
	const recent = 20
	recs, err := st.Decisions.Recent(recent)
	if err != nil {
		return nil
	}
	out := make([]Decision, 0, len(recs))
	for _, r := range recs {
		d := Decision{
			ID:         r.ID,
			At:         r.At,
			Kind:       r.Kind,
			Decider:    r.Decider,
			Reason:     r.Reason,
			Input:      r.Input,
			Model:      r.Model,
			DurationMs: r.DurationMs,
			Error:      r.Error,
		}
		if len(r.Decision) > 0 {
			d.Decision = rawJSON(r.Decision)
		}
		out = append(out, d)
	}
	// Mới nhất lên đầu: nhật ký được đọc từ trên xuống.
	sort.SliceStable(out, func(i, j int) bool { return out[i].At > out[j].At })
	return out
}

func buildSelection(st *store.Store, chapter int) *Selection {
	sel := &Selection{Chapter: chapter, Title: chapterTitle(st, chapter)}

	if e, err := st.Outline.GetChapterOutline(chapter); err == nil && e != nil {
		sel.Contract = &Contract{
			Chapter:   chapter,
			Title:     e.Title,
			CoreEvent: e.CoreEvent,
			Hook:      e.Hook,
			Scenes:    e.Scenes,
		}
	}
	if r, err := st.World.LoadReview(chapter); err == nil && r != nil {
		sel.Review = reviewFrom(r)
	} else if r, err := st.World.LoadLastReview(chapter); err == nil && r != nil {
		sel.Review = reviewFrom(r)
	}
	// Cùng lý lẽ với handleChapter: chương đã nghiệm thu không còn tệp nháp, nên
	// đọc thẳng LoadChapterContent làm số từ và đoạn trích của nó rỗng theo.
	if nd, err := noiDungChuong(st, chapter); err == nil {
		sel.Words = nd.Words
		sel.Excerpt = excerpt(nd.Text, 320)
	}
	return sel
}

func reviewFrom(r *domain.ReviewEntry) *Review {
	out := &Review{
		Chapter:        r.Chapter,
		Scope:          r.Scope,
		Verdict:        r.Verdict,
		Summary:        r.Summary,
		ContractStatus: r.ContractStatus,
		ContractMisses: r.ContractMisses,
	}
	for _, d := range r.Dimensions {
		out.Dimensions = append(out.Dimensions, Dimension{
			Name: d.Dimension, Score: d.Score, Verdict: d.Verdict, Comment: d.Comment,
		})
	}
	for _, i := range r.Issues {
		out.Issues = append(out.Issues, Issue{
			Type: i.Type, Severity: i.Severity, Description: i.Description,
			Evidence: i.Evidence, Suggestion: i.Suggestion,
			Chapters: i.Chapters, NeedsChange: i.RequiresChange,
		})
	}
	return out
}

// excerpt cắt theo RANH GIỚI TỪ, không theo số rune. Cắt giữa từ tiếng Việt tạo
// ra chữ vô nghĩa ("chuô…"), và cắt giữa một cụm ký tự tổ hợp có thể làm rơi
// dấu. Cắt ở khoảng trắng gần nhất trước hạn mức là đủ và luôn đọc được.
func excerpt(text string, maxRunes int) string {
	text = strings.TrimSpace(text)
	if text == "" {
		return ""
	}
	runes := []rune(text)
	if len(runes) <= maxRunes {
		return text
	}
	cut := string(runes[:maxRunes])
	if i := strings.LastIndexAny(cut, " \n\t"); i > maxRunes/2 {
		cut = cut[:i]
	}
	return strings.TrimRight(cut, " \n\t,.;:—-") + "…"
}

func storeWarnings(st *store.Store) []string { return st.CheckConsistency() }

// anhXaVai chiếu danh sách tác tử của engine thành hai danh sách của giao diện: đang chạy
// và tên vai đang chờ.
//
// Luật phân loại lấy từ TUI (internal/entry/tui/panels_sidebar.go: sidebarAgents +
// sidebarIdleAgents) — nhưng KHÔNG phải "State == working thì đang chạy" như một bản kế
// hoạch trước đó giả định. Luật thật của TUI so `State == "idle"`: bất kỳ vai nào KHÔNG idle
// (kể cả một giá trị lạ chưa từng gặp) đều được coi là đang chạy. Engine hôm nay chỉ từng gán
// "working" hoặc "idle" (internal/host/observer.go), nên hai cách so cho cùng kết quả VỚI DỮ
// LIỆU HÔM NAY — nhưng nếu mai engine thêm một trạng thái mới mà không ai sửa chỗ này, so
// "== working" sẽ âm thầm đẩy trạng thái đó sang "chờ" trong khi TUI vẫn vẽ nó là "đang
// chạy". Không suy lại theo cách khác: hai bề mặt nói khác nhau về "ai đang chạy" là lớp lỗi
// không tự lộ ra, vì cả hai đều trông đáng tin.
//
// Cố ý KHÔNG lặp lại nhánh "không ai đang chạy thì gộp hết vào danh sách đang chạy" của
// `sidebarAgents`: đó là mẹo trình bày để sidebar TUI không hiện một khối rỗng, không phải
// một sự thật về ai đang chạy — bề mặt JSON không cần né một khối rỗng theo cách đó.
// truongSong là phần payload chỉ có nghĩa khi engine đang mở.
//
// Gom thành một hàm chiếu để có đúng MỘT chỗ quyết định "trường nào đến từ đâu". Rải phép
// gán ra nhiều chỗ là cách mà một trường bị suy lại ở chỗ thứ hai mà không ai thấy — đúng
// điều PRODUCT.md cấm: studio không được nhân bản logic của engine.
type truongSong struct {
	Agents            []Vai
	IdleAgents        []string
	PendingSteer      string
	RewriteReason     string
	Recovery          string
	InProgressChapter *int
	Advance           *TienDo
	Context           *NguCanh
	Runtime           string
}

// chieuTruongSong chiếu host.UISnapshot (trạng thái sống của engine đang mở) thành phần
// payload tương ứng. Mọi trường ở đây đến THẲNG từ UISnapshot — không tính lại, không suy
// từ store — vì engine đã tính đúng những giá trị này một lần rồi.
func chieuTruongSong(snap host.UISnapshot) truongSong {
	dang, cho := anhXaVai(snap.Agents)
	ra := truongSong{
		Agents:        dang,
		IdleAgents:    cho,
		PendingSteer:  snap.PendingSteer,
		RewriteReason: snap.RewriteReason,
		Recovery:      snap.RecoveryLabel,
		// idle / running / pausing / paused / completed — sự thật engine tự khẳng định.
		//
		// Đây là trường phân biệt "engine đang viết" với "engine đã dừng, chờ bạn cấp phép
		// chương sau". Không suy từ `agents == []`: danh sách vai rỗng cũng xảy ra trong một
		// nhịp chuyển giữa hai bước, nên suy từ nó là đoán.
		Runtime: snap.RuntimeState,
		Advance: &TienDo{
			Mode:          snap.AdvanceMode,
			PermitChapter: snap.AdvancePermitChapter,
			Hold:          snap.HasAdvanceHold,
			HoldReason:    snap.AdvanceHoldReason,
		},
	}
	if snap.InProgressChapter > 0 {
		n := snap.InProgressChapter
		ra.InProgressChapter = &n
	}
	// Ngữ cảnh chỉ có nghĩa khi biết cửa sổ. `Window == 0` là chưa đo được, không phải cửa
	// sổ bằng không — nên để `nil` thay vì trả một tỉ lệ chia cho 0.
	if snap.ContextWindow > 0 {
		ra.Context = &NguCanh{
			Tokens:   snap.ContextTokens,
			Window:   snap.ContextWindow,
			Percent:  snap.ContextPercent,
			Scope:    snap.ContextScope,
			Strategy: snap.ContextStrategy,
		}
	}
	return ra
}

func anhXaVai(vao []host.AgentSnapshot) (dang []Vai, cho []string) {
	// Khởi tạo RỖNG chứ không để `nil`. Slice nil của Go marshal thành `null`, và `null` ở
	// hợp đồng này có nghĩa riêng: "engine đóng nên KHÔNG ĐO ĐƯỢC". Hàm này chỉ chạy khi
	// engine ĐANG MỞ, nên mọi kết quả của nó đều là đã-đo-được — kể cả kết quả bằng không.
	//
	// ĐO ĐƯỢC lúc E2E kế hoạch 2/4: engine đang viết chương 3, `agents` có một vai chạy,
	// `idle_agents` là `null`, và dải trạng thái hiện "chờ: không đo được" ngay cạnh vai
	// đang làm việc đó. Hai câu ấy không thể cùng đúng.
	dang, cho = []Vai{}, []string{}
	for _, a := range vao {
		if a.State == "idle" {
			cho = append(cho, a.Name)
			continue
		}
		dang = append(dang, Vai{
			Role:  a.Name,
			State: a.State,
			Tool:  a.Tool,
			Turn:  a.Turn,
			Task:  a.Summary,
			Depth: 0,
		})
	}
	return dang, cho
}
