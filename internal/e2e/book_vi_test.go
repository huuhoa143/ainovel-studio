package e2e

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/huuhoa143/ainovel-studio/assets"
	"github.com/huuhoa143/ainovel-studio/internal/bootstrap"
	"github.com/huuhoa143/ainovel-studio/internal/domain"
	"github.com/huuhoa143/ainovel-studio/internal/host"
	"github.com/huuhoa143/ainovel-studio/internal/host/exp"
	"github.com/huuhoa143/ainovel-studio/internal/i18n"
	storepkg "github.com/huuhoa143/ainovel-studio/internal/store"
)

// soChuong = 6: xem chú thích của chuongSach về lý do không phải 3 và không phải 5.
const soChuong = 6

// tenSach cố tình có dấu và có khoảng trắng: nó đi vào tên file bản xuất qua
// sanitizeFileName, và đi vào dòng đầu bản .txt.
const tenSach = "Người gác cầu đá"

// ── Tiện ích ──

// regexTuMsgid dựng regex bóc số từ một msgid có %d, lấy đúng bản dịch đang
// hoạt động. KHÔNG viết cứng "Viết chương (\d+)": chuỗi ấy nằm trong catalog và
// biên tập viên có quyền sửa nó; viết cứng ở đây thì mỗi lần sửa lời là một lần
// test đỏ oan, mà đỏ oan lâu ngày thì test bị tắt.
func regexTuMsgid(t *testing.T, msgid string) *regexp.Regexp {
	t.Helper()
	dich := i18n.F(msgid)
	if dich == msgid {
		t.Fatalf("catalog chưa dịch %q — test này đang kiểm đường tiếng Việt nên phải có bản dịch", msgid)
	}
	phan := strings.Split(dich, "%d")
	if len(phan) != 2 {
		t.Fatalf("msgid %q phải có đúng một %%d, bản dịch là %q", msgid, dich)
	}
	return regexp.MustCompile(regexp.QuoteMeta(phan[0]) + `(\d+)` + regexp.QuoteMeta(phan[1]))
}

func soChuongTuTask(t *testing.T, re *regexp.Regexp, task string) int {
	t.Helper()
	m := re.FindStringSubmatch(task)
	if m == nil {
		t.Fatalf("không bóc được số chương từ task Engine phái xuống: %q (regex %s)", task, re)
	}
	n, err := strconv.Atoi(m[1])
	if err != nil {
		t.Fatalf("số chương không hợp lệ trong %q: %v", task, err)
	}
	return n
}

func coChuHanTrong(s string) bool {
	for _, r := range s {
		if unicode.Is(unicode.Han, r) {
			return true
		}
	}
	return false
}

// viTriChuHan trả một đoạn ngắn quanh chữ Hán đầu tiên, để lỗi chỉ ra được chỗ rò.
func viTriChuHan(s string) string {
	runes := []rune(s)
	for i, r := range runes {
		if unicode.Is(unicode.Han, r) {
			from := max(i-40, 0)
			to := min(i+40, len(runes))
			return string(runes[from:to])
		}
	}
	return ""
}

// dauCJKDauTien trả dấu câu CJK đầu tiên gặp được. Hai khối: CJK Symbols and
// Punctuation (U+3000-U+303F: 《》「」、。〈〉) và Halfwidth/Fullwidth Forms
// (U+FF00-U+FFEF: ，；：？！（）).
func dauCJKDauTien(s string) (rune, bool) {
	for _, r := range s {
		if (r >= 0x3000 && r <= 0x303F) || (r >= 0xFF00 && r <= 0xFFEF) {
			return r, true
		}
	}
	return 0, false
}

// ── Dựng sẵn store ──
//
// Vì sao bỏ qua giai đoạn lập dàn ý: dàn ý do architect sinh, mà mọi thứ
// architect sinh đều là chữ do LLM giả bịa ra — kiểm nó chỉ là kiểm chính test.
// Phần đáng kiểm là ĐƯỜNG: Route đọc sự thật trong store rồi phái worker, worker
// gọi tool thật, tool ghi store thật. Dựng sẵn phần dàn ý đưa test vào đúng chỗ
// đó, và cũng là đúng đường mà `Resume` của người dùng đi (khôi phục từ sự thật
// đã ghi, không diễn lại phán quyết cũ).
func dungSanStore(t *testing.T, dir string) *storepkg.Store {
	t.Helper()
	st := storepkg.NewStore(dir)
	if err := st.Init(); err != nil {
		t.Fatal(err)
	}
	if err := st.Progress.Init(tenSach, soChuong); err != nil {
		t.Fatal(err)
	}
	if err := st.Progress.UpdatePhase(domain.PhaseWriting); err != nil {
		t.Fatal(err)
	}
	dan := make([]domain.OutlineEntry, 0, soChuong)
	for i := range soChuong {
		dan = append(dan, domain.OutlineEntry{
			Chapter:   i + 1,
			Title:     tenChuong[i],
			CoreEvent: fmt.Sprintf("Sự kiện chính của chương %d", i+1),
			Hook:      "bỏ lửng",
		})
	}
	if err := st.Outline.SaveOutline(dan); err != nil {
		t.Fatal(err)
	}
	// Nhân vật có mặt để bộ lọc tên riêng của stylestat được chạy thật:
	// styleStopwords đọc chính hai store này, thiếu nó thì "Ông Thản" leo lên đầu
	// danh sách khẩu ngữ và cơ chế báo cáo tật thành báo cáo tên nhân vật.
	if err := st.Characters.Save([]domain.Character{
		{Name: "Thản", Aliases: []string{"Ông Thản", "người gác cầu"}, Role: "chính", Tier: "core"},
		{Name: "Khang", Aliases: []string{"người lạ"}, Role: "chính", Tier: "core"},
		{Name: "Lư", Aliases: []string{"bà cụ Lư"}, Role: "phụ", Tier: "important"},
	}); err != nil {
		t.Fatal(err)
	}
	return st
}

func cauHinh(t *testing.T, dir, baseURL string) bootstrap.Config {
	t.Helper()
	tat := false
	return bootstrap.Config{
		OutputDir: dir,
		Provider:  "openrouter", // provider OpenAI-compatible; base_url trỏ về server giả
		ModelName: "fake-vi",
		Providers: map[string]bootstrap.ProviderConfig{
			"openrouter": {APIKey: "sk-fake-e2e", BaseURL: baseURL},
		},
		Style: "default",
		// Tắt thông báo: kênh mặc định gọi lệnh hệ thống (osascript trên macOS) —
		// test không được phép bật thông báo trên máy người chạy.
		Notify: bootstrap.NotifyConfig{Enabled: &tat},
	}
}

// ── Script LLM giả cho trọn vòng đời ──

type kichBan struct {
	t        *testing.T
	reChuong *regexp.Regexp

	mu            sync.Mutex
	arbiter       []string // mọi lượt gọi Arbiter: happy path không được có lượt nào
	chuongViet    []int
	soLanDuyet    int
	soLanKienTruc int
	// promptWriter / nguCanhWriter giữ lại chữ THẬT mà writer nhận ở lượt cuối:
	// system prompt do assets sinh, và kết quả novel_context do tool trả về.
	promptWriter  string
	nguCanhWriter []string
	// noiDungChuong quyết định văn của từng chương. nil = dùng văn sạch trong
	// chuongSach. Tách thành hàm để bài kiểm chống giọng-AI dùng lại đúng harness
	// này với văn nhồi tật — hai bài kiểm phải đi CÙNG một đường, nếu không thì
	// "bắt được tật" và "không báo oan" đo trên hai đường khác nhau.
	noiDungChuong func(ch int) string
}

func (k *kichBan) vanChuong(ch int) string {
	if k.noiDungChuong != nil {
		return k.noiDungChuong(ch)
	}
	return chuongSach[ch-1]
}

func (k *kichBan) chay(c call) reply {
	switch c.Role {
	case "writer":
		return k.writer(c)
	case "editor":
		return k.editor(c)
	case "architect":
		return k.architect(c)
	default:
		k.mu.Lock()
		k.arbiter = append(k.arbiter, c.LastUser)
		k.mu.Unlock()
		// Trả abort để engine dừng ngay: happy path không được gọi Arbiter, và
		// "dừng ngay + có bản ghi" cho lỗi đọc được, khác hẳn với treo hết timeout.
		return textReply(`{"action":"abort","dispatch":null,"reason":"e2e: happy path không được gọi Arbiter"}`)
	}
}

// writer diễn đúng trình tự mà prompt writer thật yêu cầu:
// novel_context → plan_chapter → draft_chapter → check_consistency → commit_chapter.
//
// Bước novel_context không phải để cho đủ lệ: nó là đường DUY NHẤT mà user_rules
// (bảng từ gây mỏi) và style_stats (thống kê giọng-AI toàn sách) đi vào ngữ cảnh
// của mô hình. Bỏ nó thì test vẫn xanh mà hai cơ chế ấy chưa hề được chạy.
func (k *kichBan) writer(c call) reply {
	ch := soChuongTuTask(k.t, k.reChuong, c.LastUser)
	k.mu.Lock()
	k.promptWriter = c.System
	if len(c.ToolTexts) > 0 {
		k.nguCanhWriter = c.ToolTexts
	}
	k.mu.Unlock()

	switch c.ToolResults {
	case 0:
		return toolReply("novel_context", map[string]any{"chapter": ch})
	case 1:
		return toolReply("plan_chapter", map[string]any{
			"chapter":  ch,
			"title":    tenChuong[ch-1],
			"goal":     "Đẩy mạch chính tiến thêm một bước",
			"conflict": "Nhân vật gặp trở lực",
			"hook":     "Kết chương bỏ lửng",
		})
	case 2:
		return toolReply("draft_chapter", map[string]any{
			"chapter": ch, "mode": "write", "content": k.vanChuong(ch),
		})
	case 3:
		return toolReply("check_consistency", map[string]any{"chapter": ch})
	default:
		k.mu.Lock()
		k.chuongViet = append(k.chuongViet, ch)
		k.mu.Unlock()
		return toolReply("commit_chapter", map[string]any{
			"chapter": ch, "title": tenChuong[ch-1],
			"summary":              fmt.Sprintf("Chương %d: %s", ch, tenChuong[ch-1]),
			"characters":           []string{"Thản", "Khang"},
			"key_events":           []string{"Mạch chính tiến một bước"},
			"timeline_events":      []any{},
			"foreshadow_updates":   []any{},
			"relationship_changes": []any{},
			"state_changes":        []any{},
			"cast_intros":          []any{},
			"hook_type":            "crisis",
			"dominant_strand":      "quest",
			"feedback":             nil,
		})
	}
}

// reChuongDuyet bắt số chương trong task duyệt toàn cục ("save_review scope=global, chapter=N").
var reChuongDuyet = regexp.MustCompile(`chapter=(\d+)`)

func (k *kichBan) editor(c call) reply {
	k.mu.Lock()
	k.soLanDuyet++
	k.mu.Unlock()
	// Chương được duyệt lấy từ chính task mà Route phái xuống ("… chapter=N)"): sách 6
	// chương có HAI lượt duyệt — mốc ReviewInterval (chương 5) và lượt chấm cuối trước khi
	// kết truyện (chương 6). Cắm cứng chương 5 thì lượt cuối không bao giờ được ghi nhận.
	chuongDuyet := domain.ReviewInterval
	if m := reChuongDuyet.FindStringSubmatch(c.LastUser); m != nil {
		fmt.Sscanf(m[1], "%d", &chuongDuyet)
	}
	chieu := func(ten string, diem int, loi string) map[string]any {
		return map[string]any{"dimension": ten, "score": diem, "comment": loi}
	}
	return toolReply("save_review", map[string]any{
		"chapter": chuongDuyet, "scope": "global",
		"dimensions": []map[string]any{
			chieu("consistency", 86, "Mạch nhân quả liền (dẫn: chương 3 giải thích hõm đá)"),
			chieu("character", 84, "Giọng ông Thản giữ nguyên (dẫn: thoại chương 1 và 5)"),
			chieu("pacing", 82, "Nhịp dồn ở chương 4 (dẫn: đoạn nước xuống)"),
			chieu("continuity", 85, "Không thấy lệch mốc thời gian"),
			chieu("foreshadow", 83, "Phiến đá thứ tư được thu hồi ở chương 5"),
			chieu("hook", 81, "Kết chương đều bỏ lửng bằng thoại"),
			chieu("aesthetic", 80, "Văn giữ được lối kể mộc"),
		},
		"issues":          []map[string]any{},
		"contract_status": "met", "contract_misses": []string{}, "contract_notes": nil,
		"verdict": "accept", "summary": "Năm chương đầu đạt yêu cầu, không cần trả về viết lại",
	})
}

// architect được gọi ở sách KHÔNG phân tầng khi dàn ý đã cạn: commit chương cuối
// KHÔNG tự chốt hoàn thành nữa mà đợi lượt chấm cuối, rồi Route quy tắc 12 giao cho
// Kiến trúc sư kết truyện bằng save_foundation(complete_book).
func (k *kichBan) architect(_ call) reply {
	k.mu.Lock()
	k.soLanKienTruc++
	k.mu.Unlock()
	return toolReply("save_foundation", map[string]any{
		"type": "complete_book", "content": map[string]any{},
		"reason": "Dàn ý đã viết hết, tuyến truyện đã thu về sổ ghi lời chứng",
	})
}

// ── Chạy engine thật ──

// chayEngine gọi host.New + Resume thật rồi hút sự kiện như headless làm, trả về
// mọi sự kiện và mọi mẩu stream. Timeout đủ dài cho 5 chương ×4 lượt tool, nhưng
// không vô hạn: treo là một cách hỏng, và phải hỏng thành lỗi đọc được.
func chayEngine(t *testing.T, h *host.Host) ([]host.Event, []string) {
	t.Helper()
	var events []host.Event
	var stream []string
	deadline := time.After(120 * time.Second)
	for {
		select {
		case ev, ok := <-h.Events():
			if ok {
				events = append(events, ev)
			}
		case d, ok := <-h.Stream():
			if ok {
				stream = append(stream, d)
			}
		case <-h.Done():
			// Hút nốt phần còn trong buffer rồi trả về (giống headless.drainPending).
			for {
				select {
				case ev := <-h.Events():
					events = append(events, ev)
				case d := <-h.Stream():
					stream = append(stream, d)
				default:
					return events, stream
				}
			}
		case <-deadline:
			t.Fatalf("engine không dừng trong 120s; đã nhận %d sự kiện, sự kiện cuối: %+v",
				len(events), cuoiCung(events))
			return events, stream
		}
	}
}

func cuoiCung(events []host.Event) host.Event {
	if len(events) == 0 {
		return host.Event{}
	}
	return events[len(events)-1]
}

// TestVongDoiSachTiengViet là bài kiểm chính: engine THẬT viết trọn một truyện
// ngắn 6 chương ở locale tiếng Việt, rồi xuất bản thảo.
//
// Chuỗi này do flow.Route quyết định, KHÔNG do test dàn xếp:
//
//	writer ×5 (mỗi chương: novel_context → plan → draft → check → commit)
//	→ editor (duyệt toàn cục: domain.ShouldReview mở cửa ở chương thứ 5)
//	→ writer ×1 (chương 6)
//	→ commit_chapter tự chốt hoàn thành (sách không phân tầng viết hết số chương
//	  đã hẹn thì applyCompletion đặt Phase=Complete; architect KHÔNG được gọi)
//	→ engine tự dừng
//
// lanChay là kết quả một lần chạy engine thật trọn vòng đời.
type lanChay struct {
	dir     string
	store   *storepkg.Store
	host    *host.Host
	kichBan *kichBan
	events  []host.Event
}

// chayMotSach chạy trọn một cuốn qua engine THẬT. noiDung nil = văn sạch.
//
// Tách ra để bài kiểm vòng đời và bài kiểm chống giọng-AI dùng CHUNG một đường:
// nếu mỗi bài tự dựng đường riêng thì "bắt được tật" và "không báo oan" đo trên
// hai đường khác nhau, và kết luận so sánh giữa chúng mất giá trị.
func chayMotSach(t *testing.T, noiDung func(ch int) string) *lanChay {
	t.Helper()
	if err := i18n.SetLocale(i18n.Vietnamese); err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	st := dungSanStore(t, dir)

	kb := &kichBan{t: t, reChuong: regexTuMsgid(t, "写第 %d 章"), noiDungChuong: noiDung}
	f := newFakeLLM(t, kb.chay)

	h, err := host.New(cauHinh(t, dir, f.baseURL()), assets.Load("default", assets.LoadOptions{}))
	if err != nil {
		t.Fatalf("host.New: %v", err)
	}
	t.Cleanup(h.Close)

	label, err := h.Resume()
	if err != nil {
		t.Fatalf("Resume: %v", err)
	}
	if label == "" {
		t.Fatal("Resume trả nhãn rỗng — store dựng sẵn không được nhận là có thể khôi phục")
	}
	if coChuHanTrong(label) {
		t.Errorf("nhãn khôi phục còn chữ Hán: %q", label)
	}

	events, _ := chayEngine(t, h)
	if len(kb.arbiter) > 0 {
		t.Errorf("happy path đã phải gọi Arbiter %d lần (nghĩa là có worker thất bại hoặc bế tắc): %q",
			len(kb.arbiter), kb.arbiter)
	}
	return &lanChay{dir: dir, store: st, host: h, kichBan: kb, events: events}
}

func TestVongDoiSachTiengViet(t *testing.T) {
	lan := chayMotSach(t, nil)
	dir, st, kb, events := lan.dir, lan.store, lan.kichBan, lan.events

	// ── 1. Vòng đời đi hết ──
	progress, err := st.Progress.Load()
	if err != nil || progress == nil {
		t.Fatalf("đọc progress: %v", err)
	}
	if progress.Phase != domain.PhaseComplete {
		t.Fatalf("viết hết dàn ý phải hoàn thành: phase=%s completed=%v", progress.Phase, progress.CompletedChapters)
	}
	if len(progress.CompletedChapters) != soChuong {
		t.Fatalf("phải hoàn thành %d chương, thực tế %v", soChuong, progress.CompletedChapters)
	}
	// Hai lượt duyệt: mốc ReviewInterval (chương 5) và lượt chấm cuối (chương 6) trước khi
	// kết truyện. 1 = lượt cuối không chạy (truyện đóng mà chưa chấm); >2 = duyệt lặp vì
	// HasGlobalReview không được ghi nhận.
	if kb.soLanDuyet != 2 {
		t.Errorf("phải có đúng 2 lượt duyệt toàn cục (chương %d và lượt chấm cuối chương %d), thực tế %d lần",
			domain.ReviewInterval, soChuong, kb.soLanDuyet)
	}
	// Chấm xong thì dàn ý đã cạn: Route quy tắc 12 giao Kiến trúc sư kết truyện, đúng 1 lần.
	if kb.soLanKienTruc != 1 {
		t.Errorf("sau lượt chấm cuối, Kiến trúc sư phải được phái đúng 1 lần để kết truyện; thực tế %d lần", kb.soLanKienTruc)
	}
	// Cửa duyệt phải nằm ĐÚNG giữa chương 5 và chương 6. Nếu nó mở sau khi sách
	// đã hoàn thành thì con số soLanDuyet vẫn bằng 1 mà cơ chế thực chất đã chết.
	if len(kb.chuongViet) != soChuong {
		t.Errorf("số lần commit = %d, phải bằng %d: %v", len(kb.chuongViet), soChuong, kb.chuongViet)
	}
	// commit_chapter phải ghi một bản ghi kiểm cơ học cho MỌI chương, kể cả khi
	// không có vi phạm nào (danh sách rỗng vẫn phải ghi — đó là bằng chứng "đã
	// kiểm", khác hẳn với "chưa kiểm"). Đọc thẳng tệp thay vì
	// World.LoadRuleViolations vì hàm đó trả nil cho cả hai ca, nên không phân biệt
	// được "sạch" với "chưa chạy" — đúng cái bài kiểm này cần phân biệt.
	nhatKyViPham, err := os.ReadFile(filepath.Join(dir, "meta", "rule_violations.jsonl"))
	if err != nil {
		t.Fatalf("commit_chapter không ghi nhật ký kiểm cơ học: %v", err)
	}
	for ch := 1; ch <= soChuong; ch++ {
		if !strings.Contains(string(nhatKyViPham), fmt.Sprintf("\"chapter\":%d", ch)) {
			t.Errorf("chương %d không có bản ghi trong meta/rule_violations.jsonl — "+
				"commit_chapter chưa chạy kiểm cơ học cho chương đó", ch)
		}
	}

	// ── 2. Store ghi ra đúng ──
	for ch := 1; ch <= soChuong; ch++ {
		text, err := st.Drafts.LoadChapterText(ch)
		if err != nil {
			t.Fatalf("đọc chapters/%02d.md: %v", ch, err)
		}
		if strings.TrimSpace(text) == "" {
			t.Fatalf("chapters/%02d.md rỗng — commit_chapter không ghi terminal", ch)
		}
		if !strings.Contains(text, "Thản") && !strings.Contains(text, "Khang") {
			t.Errorf("chapters/%02d.md không chứa nhân vật nào — nội dung không phải văn đã gửi", ch)
		}
		if coChuHanTrong(text) {
			t.Errorf("chapters/%02d.md rò chữ Hán: %q", ch, viTriChuHan(text))
		}
	}

	// ── 3. Đếm chữ đúng đơn vị (điểm kiểm quan trọng nhất) ──
	//
	// Từng chương ~370-420 chữ. Nếu WordCount lại đếm rune thì con số sẽ là
	// ~1700-1900 — chặn trên 800 bắt đúng lỗi đó, mà vẫn nới đủ để biên tập lại
	// văn mẫu không làm test đỏ.
	tongMong := 0
	for ch := 1; ch <= soChuong; ch++ {
		text, _ := st.Drafts.LoadChapterText(ch)
		mong := domain.WordCount(text)
		tongMong += mong
		got := progress.ChapterWordCounts[ch]
		if got != mong {
			t.Errorf("chương %d: progress ghi word_count=%d, đếm lại trên chính terminal ra %d", ch, got, mong)
		}
		runes := utf8.RuneCountInString(text)
		if got >= 800 {
			t.Errorf("chương %d: word_count=%d (runes=%d) — quá cao cho một chương ~400 chữ, "+
				"dấu hiệu WordCount đang đếm rune", ch, got, runes)
		}
		if got < 200 {
			t.Errorf("chương %d: word_count=%d quá thấp, dấu hiệu đếm bị cắt vụn", ch, got)
		}
		// Tỉ lệ rune/chữ của văn Việt nằm quanh 4,0-4,8. Chặn hai đầu bắt cả kiểu
		// đếm quá tay (cắt vụn từ) lẫn kiểu gộp cả câu thành một chữ.
		if r := float64(runes) / float64(got); r < 3.5 || r > 5.5 {
			t.Errorf("chương %d: tỉ lệ rune/chữ = %.2f ngoài khoảng 3,5-5,5 (runes=%d words=%d)",
				ch, r, runes, got)
		}
	}
	if progress.TotalWordCount != tongMong {
		t.Errorf("total_word_count=%d, tổng từng chương=%d", progress.TotalWordCount, tongMong)
	}
	if progress.TotalWordCount < soChuong*250 || progress.TotalWordCount > soChuong*600 {
		t.Errorf("total_word_count=%d ngoài khoảng hợp lý cho %d chương ~400 chữ",
			progress.TotalWordCount, soChuong)
	}
	t.Logf("ĐO ĐƯỢC: %d chương, total_word_count=%d, trung bình %d chữ/chương",
		len(progress.CompletedChapters), progress.TotalWordCount, progress.TotalWordCount/soChuong)

	// ── 4. Xuất bản thảo ──
	out := filepath.Join(dir, "ban-thao.txt")
	res, err := exp.Run(context.Background(), exp.Deps{Store: st}, exp.Options{OutPath: out, Overwrite: true})
	if err != nil {
		t.Fatalf("Export: %v", err)
	}
	if res.Chapters != soChuong {
		t.Errorf("bản xuất có %d chương, phải có %d", res.Chapters, soChuong)
	}
	dataBytes, err := readFile(out)
	if err != nil {
		t.Fatal(err)
	}
	banThao := string(dataBytes)

	// Dòng tiêu đề phải là tiếng Việt. Dựng chuỗi mong đợi từ chính msgid của
	// txt.go thay vì viết cứng "Chương 1", để đổi bản dịch vẫn kiểm được.
	for ch := 1; ch <= soChuong; ch++ {
		tieuDe := strings.TrimRight(fmt.Sprintf(i18n.F("第 %d 章  %s\n\n"), ch, tenChuong[ch-1]), "\n")
		if !strings.Contains(banThao, tieuDe) {
			t.Errorf("bản xuất thiếu dòng tiêu đề %q", tieuDe)
		}
	}
	if strings.Contains(banThao, "第") || strings.Contains(banThao, "章") {
		t.Errorf("bản xuất còn tiêu đề chương tiếng Trung:\n%s", dauDong(banThao, 12))
	}

	// ── 5. Không một chữ Hán nào rò vào bản thảo ──
	if coChuHanTrong(banThao) {
		t.Errorf("bản xuất tiếng Việt còn chữ Hán quanh: %q", viTriChuHan(banThao))
	}
	// Dấu câu CJK cũng là rò, và là kiểu rò mà phép kiểm "có chữ Hán không" KHÔNG
	// thấy: 《》「」、。（） đều nằm ngoài khối Han. Đây là đúng cách ngoặc sách
	// 《》 ở exp/txt.go từng lọt qua cả bộ kiểm độ sạch của chính package exp.
	//
	// Phép kiểm này từng phải tha riêng cặp 《》. Nay `exp/txt.go` đã cho dòng tên
	// sách đi qua msgid và catalog vi trả về `"%s"`, nên không còn ngoại lệ nào —
	// khẳng định lại thành tuyệt đối. Đừng thêm ngoại lệ mới vào đây: chỗ để chốt
	// một ca đã biết là loi_da_biet_test.go, nơi test sẽ ĐỎ khi ca đó được sửa.
	if r, co := dauCJKDauTien(banThao); co {
		t.Errorf("bản xuất còn dấu câu CJK %q — dấu CJK không thuộc khối Han nên "+
			"phép kiểm chữ Hán ở trên không bắt được nó", string(r))
	}
	if !strings.Contains(banThao, tenSach) {
		t.Errorf("bản xuất thiếu tên sách %q", tenSach)
	}

	// ── 6. Sự kiện hiển thị cho người dùng cũng phải sạch ──
	var soDispatch int
	for _, ev := range events {
		if ev.Category == "DISPATCH" {
			soDispatch++
		}
		if coChuHanTrong(ev.Summary) {
			t.Errorf("sự kiện %s rò chữ Hán: %q", ev.Category, ev.Summary)
		}
	}
	if soDispatch < soChuong {
		t.Errorf("phải có ít nhất %d sự kiện DISPATCH (mỗi chương một lần), thực tế %d", soChuong, soDispatch)
	}

	// ── 7. Chữ ĐẾN TAY MÔ HÌNH phải là tiếng Việt ──
	//
	// Đây là phần không test nào khác trong repo kiểm được, và cũng là phần quyết
	// định chất lượng đầu ra thật: prompt còn tiếng Trung thì mô hình sẽ viết
	// tiếng Trung, dù mọi chuỗi giao diện đã dịch xong.
	if strings.TrimSpace(kb.promptWriter) == "" {
		t.Fatal("không chụp được system prompt của writer")
	}
	if coChuHanTrong(kb.promptWriter) {
		t.Errorf("system prompt của writer còn chữ Hán quanh: %q", viTriChuHan(kb.promptWriter))
	}
	if len(kb.nguCanhWriter) == 0 {
		t.Fatal("writer chưa nhận kết quả novel_context nào — ngữ cảnh (user_rules, style_stats) chưa hề được tiêm")
	}
	nguCanh := strings.Join(kb.nguCanhWriter, "\n")
	for i, tt := range kb.nguCanhWriter {
		if sach := boLoRoDaBiet(tt); coChuHanTrong(sach) {
			t.Errorf("kết quả tool #%d tiêm cho writer rò chữ Hán MỚI (ngoài danh sách lỗi đã biết ở "+
				"TestLoiDaBiet_ToolRoTiengTrungVaoNguCanhModel) quanh: %q", i+1, viTriChuHan(sach))
		}
	}
	// style_stats chỉ có mặt từ chương thứ 6 trở đi (5 chương đã xong ≥ minChapters).
	// Không có nó nghĩa là cả cơ chế "writer tự tránh tật đang lặp" chưa chạy.
	if !strings.Contains(nguCanh, "style_stats") {
		t.Errorf("ngữ cảnh chương cuối thiếu style_stats — thống kê giọng-AI toàn sách chưa vào prompt:\n%s",
			dauDong(nguCanh, 6))
	}
	if !strings.Contains(nguCanh, "user_rules") {
		t.Errorf("ngữ cảnh thiếu user_rules — bảng từ gây mỏi chưa vào prompt")
	}
}

// dauDong trả n dòng đầu của s, dùng cho thông báo lỗi khỏi in cả bản thảo.
func dauDong(s string, n int) string {
	lines := strings.SplitN(s, "\n", n+1)
	if len(lines) > n {
		lines = lines[:n]
	}
	return strings.Join(lines, "\n")
}

// readFile tách riêng để lỗi đọc bản xuất có thông báo gọn.
func readFile(path string) ([]byte, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("đọc bản xuất %s: %w", path, err)
	}
	return b, nil
}
