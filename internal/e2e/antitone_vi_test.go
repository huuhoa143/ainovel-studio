package e2e

// Bộ kiểm cho MÁY CHỐNG GIỌNG-AI trên văn tiếng Việt, chạy qua đúng những tool
// mà engine gọi (draft_chapter → commit_chapter → novel_context), trên store thật.
//
// # Vì sao không đi qua engine như book_vi_test.go
//
// book_vi_test.go đã chứng minh engine phái worker đúng thứ tự và worker gọi đúng
// các tool này. Cái CÒN THIẾU là câu hỏi khác: khi văn đi qua tool thật, bộ kiểm
// có thật sự bắt được tật giọng-AI tiếng Việt, và có im lặng trước văn sạch không.
// Câu đó trả lời được ở tầng tool, và trả lời ở đây thì mỗi ca chạy hết trong vài
// chục milli-giây thay vì vài giây, nên đủ rẻ để nhồi nhiều ca đối chứng — mà đối
// chứng mới là chỗ có giá trị: một bộ bắt mọi thứ cũng bắt hết văn hay.
//
// Tổng thể hai tệp bù nhau: book_vi_test.go kiểm ĐƯỜNG ĐI, tệp này kiểm PHÁN QUYẾT.
//
// # Điều tệp này KHÔNG kiểm được
//
// Chất lượng văn. Mọi đoạn văn ở đây do người viết. Test chứng minh bộ kiểm phân
// biệt được văn-nhồi-tật với văn-sạch trên hai mẫu ĐÃ BIẾT TRƯỚC đáp án; nó không
// nói gì về việc mô hình thật viết ra loại nào. Xem phần B của
// docs/audit/e2e-report.md.

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"unicode"
	"unicode/utf8"

	"github.com/huuhoa143/ainovel-studio/assets"
	"github.com/huuhoa143/ainovel-studio/internal/domain"
	"github.com/huuhoa143/ainovel-studio/internal/host/exp"
	"github.com/huuhoa143/ainovel-studio/internal/i18n"
	"github.com/huuhoa143/ainovel-studio/internal/rules"
	storepkg "github.com/huuhoa143/ainovel-studio/internal/store"
	"github.com/huuhoa143/ainovel-studio/internal/tools"
)

// ── Dựng sẵn ──

// toneStore dựng một store đang ở giai đoạn viết, dàn ý đủ tong chương.
// Tên hàm mang tiền tố tone* để không đụng helper của book_vi_test.go — hai tệp
// do hai lượt khác nhau viết và cùng nằm trong một package.
func toneStore(t *testing.T, tong int) (*storepkg.Store, string) {
	t.Helper()
	dir := t.TempDir()
	st := storepkg.NewStore(dir)
	if err := st.Init(); err != nil {
		t.Fatal(err)
	}
	if err := st.Progress.Init("Người gác cầu đá", tong); err != nil {
		t.Fatal(err)
	}
	if err := st.Progress.UpdatePhase(domain.PhaseWriting); err != nil {
		t.Fatal(err)
	}
	dan := make([]domain.OutlineEntry, 0, tong)
	for i := range tong {
		dan = append(dan, domain.OutlineEntry{
			Chapter:   i + 1,
			Title:     toneTen(i),
			CoreEvent: fmt.Sprintf("Sự kiện chính của chương %d", i+1),
			Hook:      "bỏ lửng",
		})
	}
	if err := st.Outline.SaveOutline(dan); err != nil {
		t.Fatal(err)
	}
	return st, dir
}

// toneTen trả tên chương thứ i, vòng lại khi vượt số tên có sẵn trong corpus.
func toneTen(i int) string {
	if i < len(tenChuong) {
		return tenChuong[i]
	}
	return fmt.Sprintf("Chương phụ %d", i+1)
}

// toneVietChuong chạy đúng cặp tool mà writer thật dùng để đưa một chương vào
// store: draft_chapter ghi bản nháp, commit_chapter chốt terminal. Trả về nguyên
// văn JSON mà commit_chapter đáp — đó chính là chữ mà mô hình đọc được, nên mọi
// khẳng định về "bộ kiểm có báo cho mô hình biết không" phải đặt trên nó.
func toneVietChuong(t *testing.T, st *storepkg.Store, ch int, than string) []byte {
	t.Helper()
	ctx := context.Background()

	draft := tools.NewDraftChapterTool(st)
	if _, err := draft.Execute(ctx, toneArgs(t, map[string]any{
		"chapter": ch, "mode": "write", "content": than,
	})); err != nil {
		t.Fatalf("draft_chapter chương %d: %v", ch, err)
	}

	commit := tools.NewCommitChapterTool(st)
	out, err := commit.Execute(ctx, toneArgs(t, map[string]any{
		"chapter": ch, "title": toneTen(ch - 1),
		"summary":              fmt.Sprintf("Chương %d đi thêm một bước", ch),
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
	}))
	if err != nil {
		t.Fatalf("commit_chapter chương %d: %v", ch, err)
	}
	return out
}

func toneArgs(t *testing.T, m map[string]any) json.RawMessage {
	t.Helper()
	b, err := json.Marshal(m)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

// toneViPham bóc danh sách violation từ đáp của commit_chapter.
func toneViPham(t *testing.T, out []byte) []rules.Violation {
	t.Helper()
	var wrap struct {
		RuleViolations []rules.Violation `json:"rule_violations"`
	}
	if err := json.Unmarshal(out, &wrap); err != nil {
		t.Fatalf("đọc rule_violations từ đáp commit_chapter: %v\n%s", err, out)
	}
	return wrap.RuleViolations
}

// toneLoc lọc violation theo tên rule.
func toneLoc(vs []rules.Violation, rule string) []rules.Violation {
	var out []rules.Violation
	for _, v := range vs {
		if v.Rule == rule {
			out = append(out, v)
		}
	}
	return out
}

func toneMoTa(vs []rules.Violation) string {
	if len(vs) == 0 {
		return "(rỗng)"
	}
	parts := make([]string, 0, len(vs))
	for _, v := range vs {
		// Limit và Actual đều là any (Limit nil với rule không có ngưỡng, và số đi
		// qua JSON về thành float64), nên phải %v — %d in ra "%!d(float64=3)".
		parts = append(parts, fmt.Sprintf("%s{%q limit=%v actual=%v}", v.Rule, v.Target, v.Limit, v.Actual))
	}
	return strings.Join(parts, " ")
}

// ── 1. Bắt được tật, và không báo bừa ──

// TestToneKiemCoHocPhanBietVanSachVoiVanNhoiTat là ca đối chứng trung tâm:
// cùng một bộ kiểm, cùng một đường tool, hai loại văn, hai phán quyết khác nhau.
//
// Không tách thành hai test rời: giá trị nằm ở chỗ SO SÁNH. Một bộ kiểm hỏng theo
// kiểu "báo mọi thứ" vẫn qua được ca "bắt được tật" nếu ca ấy đứng một mình.
func TestToneKiemCoHocPhanBietVanSachVoiVanNhoiTat(t *testing.T) {
	if err := i18n.SetLocale(i18n.Vietnamese); err != nil {
		t.Fatal(err)
	}
	st, _ := toneStore(t, len(chuongSach)+1)

	// Năm chương văn sạch.
	for i, than := range chuongSach {
		ch := i + 1
		vs := toneViPham(t, toneVietChuong(t, st, ch, than))
		if n := toneLoc(vs, "fatigue_words"); len(n) > 0 {
			t.Errorf("chương %d là văn kể sạch mà bị báo từ gây mỏi: %s\n"+
				"báo bừa trên văn sạch còn tệ hơn bỏ sót: editor sẽ học rằng chương nào cũng có tật",
				ch, toneMoTa(n))
		}
		if n := toneLoc(vs, "forbidden_phrases"); len(n) > 0 {
			t.Errorf("chương %d văn sạch bị báo cụm cấm: %s", ch, toneMoTa(n))
		}
	}

	// Chương cuối: văn nhồi tật.
	chNhoi := len(chuongSach) + 1
	outNhoi := toneVietChuong(t, st, chNhoi, vanNhoiTat)
	vsNhoi := toneViPham(t, outNhoi)
	moi := toneLoc(vsNhoi, "fatigue_words")
	if len(moi) == 0 {
		t.Fatalf("văn nhồi tật KHÔNG bị bắt một lỗi từ gây mỏi nào — bảng từ tiếng Việt "+
			"của rules.SystemDefaults đang chết lặng trên văn tiếng Việt.\n"+
			"toàn bộ violation nhận được: %s", toneMoTa(vsNhoi))
	}
	t.Logf("văn nhồi tật bị bắt %d lỗi từ gây mỏi: %s", len(moi), toneMoTa(moi))

	// Phán quyết phải ĐẾN ĐƯỢC ổ đĩa: editor đọc lại qua novel_context, không đọc
	// đáp của commit_chapter (writer hard-stop ngay sau commit, đáp không ai đọc).
	luu := st.World.LoadRuleViolations(chNhoi)
	if len(toneLoc(luu, "fatigue_words")) == 0 {
		t.Errorf("violation của chương nhồi tật không xuống ổ đĩa: đọc lại được %s\n"+
			"đáp của commit_chapter chỉ là bản sao — mất bản ghi này thì editor không bao giờ thấy tật",
			toneMoTa(luu))
	}
}

// ── 2. Thống kê giọng-AI toàn sách phải vào được ngữ cảnh mô hình ──

// TestToneThongKeToanSachVaoNguCanh kiểm cơ chế thứ hai của máy chống giọng-AI:
// stylestat đếm tật trên TOÀN SÁCH rồi novel_context tiêm số đó vào prompt để
// writer tự tránh. Đây là đường duy nhất số liệu ấy tới tay mô hình.
//
// Ngưỡng 5 chương không phải số tùy ý: stylestat.minChapters = 5. Dưới đó
// Compute trả nil và cả cơ chế im lặng — nên ca này phải có đủ 5 chương, và ca
// "4 chương thì chưa có" cũng phải kiểm, vì im lặng đúng lúc mới chứng minh con
// số 5 là có thật chứ không phải tình cờ.
func TestToneThongKeToanSachVaoNguCanh(t *testing.T) {
	if err := i18n.SetLocale(i18n.Vietnamese); err != nil {
		t.Fatal(err)
	}
	refs := assets.Load("default", assets.LoadOptions{}).References

	mauCua := func(st *storepkg.Store, ch int) (map[string]float64, bool) {
		t.Helper()
		out, err := tools.NewContextTool(st, refs, "default").
			Execute(context.Background(), toneArgs(t, map[string]any{"chapter": ch}))
		if err != nil {
			t.Fatalf("novel_context(chapter=%d): %v", ch, err)
		}
		return toneMauPhongCach(t, out)
	}

	// (a) Sách nhồi tật: stylestat phải gọi tên được các mẫu tật tiếng Việt.
	stNhoi, _ := toneStore(t, 10)
	for ch := 1; ch <= 5; ch++ {
		toneVietChuong(t, stNhoi, ch, vanNhoiTat)
	}
	nhoi, co := mauCua(stNhoi, 6)
	if !co {
		t.Fatal("đủ 5 chương mà episodic_memory.style_stats không được tiêm — " +
			"thống kê giọng-AI toàn sách chưa hề tới tay mô hình")
	}
	// Gọi tên mẫu chứ không chỉ kiểm có khối: khối rỗng vẫn là một khối. Ba mẫu
	// này là ba lớp tật khác nhau nên bắt được cả ba mới chứng minh bộ mẫu tiếng
	// Việt đang chạy, không phải một regex may mắn.
	for _, ten := range []string{"So sánh sáo", "Mẫu thần thái", "Đánh dấu suy nghĩ"} {
		if !toneCoMau(nhoi, ten) {
			t.Errorf("style_stats của sách nhồi tật không gọi tên mẫu %q; các mẫu bắt được: %v",
				ten, toneTenMau(nhoi))
		}
	}

	// (b) Sách văn sạch: khối vẫn phải có (nó là báo cáo, không phải báo động),
	// nhưng KHÔNG được dựng cờ trên các mẫu tật nặng.
	//
	// Khẳng định đặt trên JSON đã bóc, KHÔNG dùng strings.Contains trên cả tài
	// liệu: novel_context còn tiêm nguyên văn assets/references/anti-ai-tone.md,
	// mà bản hướng dẫn ấy GỌI TÊN đủ mọi mẫu để dạy mô hình tránh. Tìm chuỗi trên
	// cả tài liệu thì mẫu nào cũng "có mặt" — chính lỗi đã làm hai ca dưới đỏ oan
	// ở lượt viết đầu.
	stSach, _ := toneStore(t, 10)
	for i, than := range chuongSach {
		toneVietChuong(t, stSach, i+1, than)
	}
	sach, co := mauCua(stSach, len(chuongSach)+1)
	if !co {
		t.Fatal("sách văn sạch cũng phải có style_stats (là báo cáo, không phải báo động)")
	}
	for _, ten := range []string{"Mẫu thần thái", "Phản ứng cơ thể", "Sáo trừu tượng", "So sánh sáo"} {
		if toneCoMau(sach, ten) {
			t.Errorf("văn kể sạch bị style_stats dựng cờ mẫu %q — báo bừa; các mẫu bắt được: %v",
				ten, toneTenMau(sach))
		}
	}

	// (c) Bốn chương: chưa đủ mẫu, phải im lặng. Con số 5 (stylestat.minChapters)
	// chỉ có thật nếu 4 chương KHÔNG ra thống kê.
	stThieu, _ := toneStore(t, 10)
	for i := range 4 {
		toneVietChuong(t, stThieu, i+1, chuongSach[i])
	}
	if _, co := mauCua(stThieu, 5); co {
		t.Errorf("mới 4 chương (< stylestat.minChapters=5) mà đã tiêm style_stats — " +
			"thống kê trên mẫu quá nhỏ là số đúng dẫn tới kết luận sai")
	}
}

// toneNguCanh là hình JSON tối thiểu của đáp novel_context mà test cần.
type toneNguCanh struct {
	Episodic struct {
		StyleStats *struct {
			Chapters int `json:"chapters"`
			Patterns []struct {
				Name       string  `json:"name"`
				Total      int     `json:"total"`
				PerChapter float64 `json:"per_chapter"`
			} `json:"patterns"`
		} `json:"style_stats"`
	} `json:"episodic_memory"`
}

// toneMauPhongCach bóc episodic_memory.style_stats.patterns thành map tên → lần/chương.
// Trả co=false khi khối style_stats không được tiêm.
func toneMauPhongCach(t *testing.T, doc []byte) (map[string]float64, bool) {
	t.Helper()
	var ng toneNguCanh
	if err := json.Unmarshal(doc, &ng); err != nil {
		t.Fatalf("bóc episodic_memory.style_stats từ đáp novel_context: %v\n%s",
			err, toneDau(string(doc), 600))
	}
	if ng.Episodic.StyleStats == nil {
		return nil, false
	}
	out := make(map[string]float64, len(ng.Episodic.StyleStats.Patterns))
	for _, p := range ng.Episodic.StyleStats.Patterns {
		out[p.Name] = p.PerChapter
	}
	return out, true
}

// toneCoMau khớp theo tiền tố: tên mẫu đầy đủ còn kèm ví dụ trong ngoặc『…』, mà
// phần ví dụ là chỗ biên tập viên có quyền sửa lời.
func toneCoMau(mau map[string]float64, tenNgan string) bool {
	for ten := range mau {
		if strings.HasPrefix(ten, tenNgan) {
			return true
		}
	}
	return false
}

func toneTenMau(mau map[string]float64) []string {
	out := make([]string, 0, len(mau))
	for ten, n := range mau {
		out = append(out, fmt.Sprintf("%s=%.1f", ten, n))
	}
	slices.Sort(out)
	return out
}

func toneDau(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}

// ── 3. Hệ số chữ Hán ↔ từ tiếng Việt ──

// TestToneHeSoChuHanSangTuViet phát biểu thành khẳng định chạy được cái lý do
// khiến MỌI ngưỡng số của upstream được giữ nguyên trong bản việt hóa: một chữ
// Hán đổi sang tiếng Việt ra khoảng một TỪ, không phải một chữ cái.
//
// Vì sao phải có test này chứ không chỉ ghi vào chú thích: hệ số ~1,0 là giả định
// nền cho ngưỡng từ gây mỏi (rules), chỉ tiêu chữ mỗi chương, và cửa sổ
// stylestat. Nếu một hôm domain.WordCount đổi cách đếm (đếm rune, hay gộp cụm),
// hệ số trượt và mọi ngưỡng lệch theo mà không một test nào đỏ — sai lặng lẽ đúng
// kiểu tệ nhất.
func TestToneHeSoChuHanSangTuViet(t *testing.T) {
	if err := i18n.SetLocale(i18n.Vietnamese); err != nil {
		t.Fatal(err)
	}
	// Đo trên chính corpus: đây là văn kể tiếng Việt cỡ một chương thật.
	for i, than := range chuongSach {
		tu := domain.WordCount(than)
		runes := utf8.RuneCountInString(than)
		if tu <= 0 {
			t.Fatalf("chương %d: WordCount = %d", i+1, tu)
		}
		// Một chương ~400 từ tiếng Việt chiếm ~1800 rune. Nếu WordCount đếm rune
		// thì tu ≈ runes và tỉ lệ tụt về ~1,0 — chặn dưới 3,0 bắt đúng lỗi đó.
		// Chặn trên 6,0 bắt lỗi ngược: gộp nhiều từ thành một.
		if r := float64(runes) / float64(tu); r < 3.0 || r > 6.0 {
			t.Errorf("chương %d: rune/từ = %.2f ngoài khoảng 3,0-6,0 (runes=%d từ=%d) — "+
				"domain.WordCount không còn đếm theo đơn vị TỪ", i+1, r, runes, tu)
		}
	}

	// Phần cốt lõi: cùng một nội dung, chữ Hán đếm rời từng chữ, và số đó xấp xỉ
	// số TỪ của bản tiếng Việt tương đương. Dùng cặp câu dịch sát nghĩa, đếm tay.
	//
	//	"他站在桥头，望着河水。"       → 10 chữ Hán (không kể dấu câu)
	//	"Hắn đứng ở đầu cầu, nhìn dòng nước." → 8 từ
	const han = "他站在桥头望着河水"
	const viet = "Hắn đứng ở đầu cầu nhìn dòng nước"

	soHan := 0
	for _, r := range han {
		if unicode.Is(unicode.Han, r) {
			soHan++
		}
	}
	soViet := domain.WordCount(viet)
	if soHan != 9 {
		t.Fatalf("mẫu chữ Hán đếm tay ra 9 chữ, hàm đếm ra %d — sửa mẫu, không sửa ngưỡng", soHan)
	}
	// WordCount ở locale vi phải đếm chữ Hán RỜI TỪNG CHỮ (xem countSpacedWords):
	// nhờ vậy văn lẫn hai thứ tiếng vẫn ra số đo cùng đơn vị.
	if got := domain.WordCount(han); got != soHan {
		t.Errorf("WordCount(%q) = %d, phải = %d: chữ Hán trong văn tiếng Việt vẫn phải "+
			"đếm rời từng chữ, nếu không thì chương lẫn tiếng Trung bị hụt số đo", han, got, soHan)
	}
	// Hệ số: 9 chữ Hán ↔ 8 từ Việt = 0,89. Khoảng 0,7-1,4 nói được "cùng bậc
	// độ lớn, ngưỡng dùng chung được", mà không giả vờ chính xác hơn thực tế.
	he := float64(soViet) / float64(soHan)
	if he < 0.7 || he > 1.4 {
		t.Errorf("hệ số chữ Hán → từ Việt = %.2f (%d từ / %d chữ) ngoài khoảng 0,7-1,4.\n"+
			"Ngưỡng của upstream (từ gây mỏi, chỉ tiêu chữ/chương) được giữ NGUYÊN "+
			"dựa trên giả định hệ số ~1,0; hệ số trượt thì phải xem lại toàn bộ ngưỡng, "+
			"không phải sửa test này", he, soViet, soHan)
	}
	t.Logf("ĐO ĐƯỢC hệ số: %d chữ Hán ↔ %d từ Việt = %.2f", soHan, soViet, he)
}

// ── 4. Bẫy tiêu đề chương, qua đường xuất bản thật ──

// TestToneXuatBanKhongAnMatDongMoDau chạy exp.Run — đúng hàm mà host.Export gọi —
// để chắc rằng bộ nhận-dòng-tiêu-đề tiếng Việt không xóa oan chữ của tác giả.
//
// Mức hàm đã có test ở internal/host/exp/txt_chapter_title_test.go. Ca này khác:
// nó kiểm qua TRỌN đường xuất bản (đọc store → lắp tiêu đề → ghi file), vì lỗi
// kiểu này không báo gì cả — nó chỉ lặng lẽ làm mất một dòng trong bản thảo, và
// chỉ lộ ra khi có người đọc bản xuất.
func TestToneXuatBanKhongAnMatDongMoDau(t *testing.T) {
	if err := i18n.SetLocale(i18n.Vietnamese); err != nil {
		t.Fatal(err)
	}
	st, dir := toneStore(t, 3)

	// Chương 1: dòng đầu là chữ của tác giả, chỉ TRÙNG hình dạng tiêu đề chương.
	// "Ba Đào" là tên đất, không phải số ba. Ăn mất dòng này là mất mở đầu chương.
	const moDau = "# Chương Ba Đào"
	toneVietChuong(t, st, 1, moDau+"\n\nBến đá nằm ở khúc sông gấp, nơi nước đổi màu.\n\nÔng Thản ra sớm.")
	// Chương 2: dòng đầu ĐÚNG là tiêu đề chương có số — phải bị bóc, vì bộ xuất
	// bản tự lắp dòng tiêu đề, giữ lại là lặp hai lần.
	toneVietChuong(t, st, 2, "# Chương 2\n\nXóm Trại nằm sau rặng tre già.")
	// Chương 3: không có dòng tiêu đề nào.
	toneVietChuong(t, st, 3, "Đêm ấy Khang ngủ trong lều canh ngô.")

	out := filepath.Join(dir, "ban-thao.txt")
	res, err := exp.Run(context.Background(), exp.Deps{Store: st}, exp.Options{
		OutPath: out, Overwrite: true,
	})
	if err != nil {
		t.Fatalf("exp.Run: %v", err)
	}
	if res.Chapters != 3 {
		t.Fatalf("bản xuất có %d chương, phải 3 (Skipped=%v)", res.Chapters, res.Skipped)
	}
	b, err := os.ReadFile(out)
	if err != nil {
		t.Fatal(err)
	}
	banThao := string(b)

	if !strings.Contains(banThao, moDau) {
		t.Errorf("bản xuất ĂN MẤT dòng mở đầu %q của chương 1.\n"+
			"chapterHeaderViRe (internal/host/exp/txt.go) đang đọc «Ba Đào» thành số chương "+
			"và xóa cả dòng — mất chữ mà không một cảnh báo nào.\nbản xuất:\n%s",
			moDau, toneDau(banThao, 700))
	}
	// Đối chứng: dòng tiêu đề THẬT phải bị bóc, nếu không thì test trên chỉ chứng
	// minh regex khớp-không-gì, tức là đã tắt hẳn cơ chế.
	if strings.Contains(banThao, "# Chương 2") {
		t.Errorf("dòng tiêu đề thật «# Chương 2» phải được bóc để không lặp với dòng "+
			"tiêu đề do bộ xuất bản lắp:\n%s", toneDau(banThao, 700))
	}
	if !strings.Contains(banThao, "Xóm Trại nằm sau rặng tre già.") {
		t.Errorf("bóc tiêu đề chương 2 đã ăn luôn cả thân bài:\n%s", toneDau(banThao, 700))
	}
}

// ── 5. Hai lỗi thật, đang ĐỎ có chủ ý ──
//
// Hai test dưới đây khẳng định hành vi ĐÚNG, và hiện chúng đỏ vì code trong
// internal/rules/ có lỗi thật. Chúng KHÔNG được sửa thành khẳng định hành vi hiện
// tại: làm vậy là đóng băng lỗi thành đặc tả. Chi tiết + cách sửa đề xuất ở
// docs/audit/e2e-report.md phần A.4.

// TestToneLintKhongBaoBuaTrenVanTiengViet — non_cjk_fragments báo trên MỌI chương
// tiếng Việt vì cả thân bài là chữ Latin.
func TestToneLintKhongBaoBuaTrenVanTiengViet(t *testing.T) {
	if err := i18n.SetLocale(i18n.Vietnamese); err != nil {
		t.Fatal(err)
	}
	for i, than := range chuongSach {
		vs := toneLoc(rules.Lint(than), "non_cjk_fragments")
		if len(vs) > 0 {
			t.Errorf("chương %d là văn tiếng Việt sạch mà non_cjk_fragments báo %s.\n"+
				"internal/rules/lint.go:57 — latinFragmentRe = `[A-Za-z]{2,}` sinh ra để bắt "+
				"mô hình lẫn tiếng Anh vào văn tiếng TRUNG; ở locale vi thì cả thân bài là chữ "+
				"Latin nên nó báo 100%% số chương.\n"+
				"Sửa: chọn bảng theo i18n.Active() như domain.WordCount đã làm — zh giữ "+
				"`[A-Za-z]{2,}`, vi đảo chiều thành bắt chữ Hán còn sót (`\\p{Han}`), vì lẫn "+
				"tiếng Trung mới là lỗi ngôn ngữ của bản việt hóa.", i+1, toneMoTa(vs))
		}
	}
}

// TestToneTuGayMoiBatCaKhiVietHoaDauCau — bảng từ gây mỏi so khớp chuỗi con phân
// biệt hoa thường, nên các liên từ mở câu (bản chất luôn viết hoa) không bao giờ
// bị bắt.
func TestToneTuGayMoiBatCaKhiVietHoaDauCau(t *testing.T) {
	if err := i18n.SetLocale(i18n.Vietnamese); err != nil {
		t.Fatal(err)
	}
	structured := rules.SystemDefaults().Structured
	if structured.FatigueWords["tuy nhiên"] != 2 {
		t.Fatalf("test này ghim vào ngưỡng «tuy nhiên»=2, bảng hiện tại là %v — "+
			"cập nhật test theo bảng", structured.FatigueWords["tuy nhiên"])
	}

	// Bốn lần "Tuy nhiên," mở câu: quá ngưỡng 2 gấp đôi. Đây là cách một liên từ
	// tiếng Việt thực sự xuất hiện trong văn — ở đầu câu, nên viết hoa.
	than := strings.Join([]string{
		"Hắn bước lên cầu.",
		"Tuy nhiên, nước đã lên quá bậc thứ tư.",
		"Ông Thản gánh nước đi qua.",
		"Tuy nhiên, người áo nâu vẫn đứng đó.",
		"Khang bám vào hõm đá.",
		"Tuy nhiên, tay phải anh đã tê.",
		"Bà cụ ngồi bên bờ mương.",
		"Tuy nhiên, bà không giải thích một lời.",
	}, "\n\n")

	vs := toneLoc(rules.Check(than, structured), "fatigue_words")
	if len(vs) == 0 {
		t.Errorf("«Tuy nhiên,» mở câu 4 lần (ngưỡng 2) mà không bị bắt.\n" +
			"internal/rules/checker.go:77 — appendFatigueWords dùng strings.Count, phân biệt " +
			"hoa thường, còn bảng ở internal/rules/snapshot.go:220 toàn chữ thường. Các liên từ " +
			"«ngoài ra» «tuy nhiên» «thế nhưng» «bên cạnh đó» BẢN CHẤT là từ mở câu nên trong " +
			"văn thật chúng luôn viết hoa → bốn ngưỡng ấy chết lặng.\n" +
			"Lỗi này riêng của bản việt hóa: tiếng Trung không có chữ hoa nên upstream không gặp.\n" +
			"Sửa: so khớp không phân biệt hoa thường (strings.ToLower cả hai phía, hoặc regex " +
			"(?i) như stylestat đã dùng ở internal/stylestat/stylestat.go:114-124). Chú thích ở " +
			"snapshot.go:221 đã tự đặt yêu cầu «phải khớp với bộ mẫu của stylestat» — stylestat " +
			"dùng (?i), checker thì không.")
	}
}
