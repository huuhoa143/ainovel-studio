package tui

import (
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/charmbracelet/bubbles/textarea"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/x/ansi"
	"github.com/huuhoa143/ainovel-studio/internal/bootstrap"
	"github.com/huuhoa143/ainovel-studio/internal/host"
	"github.com/huuhoa143/ainovel-studio/internal/i18n"
)

// Cả file này chốt các bất biến bố cục mà tiếng Việt phá còn tiếng Trung thì không:
// nhãn tiếng Việt dài hơn nhãn Hán tương ứng, nên mọi hằng số cột "vừa đủ cho chữ
// Hán" đều vỡ. Test chạy ở locale mặc định (vi) — xem locale_policy_test.go.

// lipgloss.Style.Width(n) là bề rộng TỐI THIỂU khi nhãn ngắn, nhưng khi nhãn DÀI
// hơn n thì lipgloss XUỐNG DÒNG nhãn. Nhãn Hán không bao giờ chạm ngưỡng nên lỗi
// ngủ yên; "Trạng thái chạy" (15 cột) thì bị xé thành "Trạng thái" / "chạy" và
// giá trị rơi xuống dòng dưới, dính vào phần đuôi nhãn.
func TestNhanTruongKhongBaoGioXuongDong(t *testing.T) {
	for _, label := range []string{
		"Trạng thái chạy",
		"Độ mạnh suy luận",
		"运行态",
		"Luồng",
	} {
		got := renderFieldLabel(label)
		if strings.Contains(got, "\n") {
			t.Errorf("renderFieldLabel(%q) xuống dòng — nhãn bị xé, giá trị rơi dòng dưới:\n%q",
				label, ansi.Strip(got))
		}
		if !strings.Contains(ansi.Strip(got), label) {
			t.Errorf("renderFieldLabel(%q) làm mất chữ trong nhãn: %q", label, ansi.Strip(got))
		}
	}
}

// Cột giá trị phải thẳng hàng giữa các trường. Bản cũ đệm bằng Width(10) rồi chỉ
// thêm khoảng trắng khi THIẾU, nên nhãn ≤9 cột cho giá trị ở cột 10 còn nhãn đúng
// 10 cột ("Đẩy chương") đẩy giá trị sang cột 11 → lệch một cột, thấy rõ trên màn.
func TestCotGiaTriThangHangGiuaCacTruong(t *testing.T) {
	labels := []string{"Luồng", "Giai đoạn", "Đẩy chương", "运行态", "Số từ"}
	want := lipgloss.Width(renderFieldLabel(labels[0]))
	for _, label := range labels[1:] {
		if got := lipgloss.Width(renderFieldLabel(label)); got != want {
			t.Errorf("cột giá trị lệch: nhãn %q chiếm %d cột, nhãn %q chiếm %d cột",
				labels[0], want, label, got)
		}
	}
}

// Nhãn dài hơn cột vẫn phải còn đúng một khoảng trắng phân cách, không dính giá trị.
func TestNhanDaiVanConKhoangTrangPhanCach(t *testing.T) {
	got := ansi.Strip(renderField("Trạng thái chạy", "Đã tạm dừng"))
	if !strings.Contains(got, "Trạng thái chạy Đã tạm dừng") {
		t.Errorf("nhãn dài dính giá trị hoặc mất khoảng trắng: %q", got)
	}
}

// Thẻ trong sidebar tự thêm viền trái + đệm trái = 2 cột, nên thân dài đúng
// `width` sẽ làm thẻ rộng `width+2` — vượt chỗ viewport có, và viewport cắt cứng
// phần dôi KHÔNG có dấu hiệu gì. Trên màn thật: "2 / 300 chương" hiện thành
// "2 / 300 chươn", người dùng đọc ra một từ không tồn tại.
func TestTheSidebarKhongVuotBeRongDuocCap(t *testing.T) {
	const width = 26
	body := renderField("Trạng thái chạy", "Đã tạm dừng") +
		renderField(i18n.F("进度"), "2 / 300 chương") +
		renderField("Đang viết", "Chương 3")
	out := renderSidebarSection("Tổng quan", body, width)
	for i, line := range strings.Split(out, "\n") {
		if w := lipgloss.Width(line); w > width {
			t.Errorf("dòng %d rộng %d cột > %d được cấp — viewport sẽ cắt cứng:\n  %q",
				i, w, width, ansi.Strip(line))
		}
	}
}

// Và cắt cứng là mất chữ: giá trị quá dài phải xuống dòng chứ không bốc hơi.
func TestGiaTriDaiTrongSidebarXuongDongChuKhongMatChu(t *testing.T) {
	out := renderSidebarSection("Tổng quan", renderField("Tiến độ", "2 / 300 chương"), 26)
	flat := strings.Join(strings.Fields(ansi.Strip(out)), " ")
	if !strings.Contains(flat, "chương") {
		t.Errorf("chữ 'chương' bị cắt mất trong sidebar, còn lại:\n%q", flat)
	}
}

// Các dòng con của khối "Nhân vật đang chạy" thụt vào 2 khoảng. Ngân sách cắt của
// chúng phải trừ CẢ 2 cột viền+đệm của thẻ LẪN 2 cột thụt, nếu không dòng dôi ra và
// bị xuống dòng — phần xuống dòng mất thụt nên trông như một trường mới.
func TestDongConCuaNhanVatKhongBiXuongDong(t *testing.T) {
	const width = 26
	snap := host.UISnapshot{
		RuntimeState: "running",
		IsRunning:    true,
		Agents: []host.AgentSnapshot{{
			Name:     "writer",
			State:    "running",
			TaskKind: "write_chapter",
			Summary:  "engine → writer (Viết chương 3 của Trấn Yêu Ký)",
		}},
	}
	// Đo TRỰC TIẾP renderAgentLine, không đo đầu ra cuối của thẻ: fitSidebarBody là
	// lưới an toàn, nó sẽ xuống dòng giúp nên đo đầu ra cuối thì bề rộng luôn hợp lệ
	// và lỗi bị che. Điều cần chốt là renderAgentLine tự sinh dòng ĐÃ vừa, để lưới
	// an toàn không phải can thiệp và phần thụt không bị mất.
	limit := sidebarBodyWidth(width)
	for i, line := range strings.Split(renderAgentLine(snap.Agents[0], width), "\n") {
		if w := lipgloss.Width(line); w > limit {
			t.Errorf("dòng %d rộng %d > %d cột thân thẻ — sẽ phải xuống dòng và mất thụt 2 khoảng:\n  %q",
				i, w, limit, ansi.Strip(line))
		}
	}
}

// /model dựng khung bằng tay: mỗi phần tử `lines` được coi là MỘT dòng. Nhãn
// "Độ mạnh suy luận:" (17 cột) bị Width(12) xé thành 2 dòng, và vòng dựng khung
// đệm một lần cho cả cụm → viền phải rơi sai cột, viền trái mất hẳn ở dòng thứ 2.
func TestKhungModelSwitchKhongVoVoiNhanTiengViet(t *testing.T) {
	state := &modelSwitchState{}
	out := renderModelSwitchBar(120, state)
	if out == "" {
		t.Fatal("renderModelSwitchBar trả về rỗng")
	}
	lines := strings.Split(out, "\n")
	want := lipgloss.Width(lines[0])
	for i, line := range lines {
		plain := ansi.Strip(line)
		if w := lipgloss.Width(line); w != want {
			t.Errorf("dòng %d rộng %d, khác dòng đầu %d — khung vỡ:\n  %q", i, w, want, plain)
		}
		if i > 0 && i < len(lines)-1 {
			if !strings.HasPrefix(plain, "│") || !strings.HasSuffix(plain, "│") {
				t.Errorf("dòng %d thiếu viền trái/phải — khung vỡ:\n  %q", i, plain)
			}
		}
	}
}

// /help ngắt dòng nội dung MỘT LẦN lúc mở panel. Bản cũ khi cửa sổ đổi cỡ chỉ đổi
// viewport.Width mà không ngắt lại, nên nội dung vẫn giữ cách ngắt của bề rộng CŨ rồi
// khung modal cắt cứng từng dòng theo bề rộng MỚI. Hậu quả không phải mất đuôi mà là
// MẤT CHỮ GIỮA CÂU: ở 100 cột, mô tả /import mất nguyên cụm "xong; --guide dù".
func TestHelpNgatDongLaiKhiDoiBeRong(t *testing.T) {
	const (
		openW   = 160 // mở panel ở khung rộng
		resizeW = 100 // rồi thu cửa sổ lại
	)

	// Mở rộng rồi thu nhỏ phải cho ra ĐÚNG những gì mở thẳng ở khung nhỏ. Bất biến này
	// bắt trực tiếp lỗi "không ngắt lại" mà không phải đoán từ nào bị mất, và không
	// phụ thuộc vào lệnh nào đang trong tầm cuộn.
	resized := ansi.Strip(renderHelpModal(resizeW, 40, newHelpState(openW, 40)))
	fresh := ansi.Strip(renderHelpModal(resizeW, 40, newHelpState(resizeW, 40)))
	if resized != fresh {
		t.Errorf("mở ở %d rồi thu về %d cho kết quả KHÁC với mở thẳng ở %d — nội dung không được ngắt lại\n"+
			"--- sau khi thu (nội dung vẫn ngắt theo bề rộng cũ, bị khung cắt cứng) ---\n%s\n"+
			"--- mở thẳng ở %d (đúng) ---\n%s",
			openW, resizeW, resizeW, resized, resizeW, fresh)
	}

	// Và bản đúng đó không được mất chữ nào của mô tả dài nhất.
	var longest string
	for _, spec := range commandSpecs() {
		if lipgloss.Width(spec.Description) > lipgloss.Width(longest) {
			longest = spec.Description
		}
	}
	if longest == "" {
		t.Fatal("không tìm được mô tả lệnh nào")
	}
	// Ghép liền, bỏ mọi khoảng trắng/xuống dòng: bài kiểm này chỉ hỏi "có mất chữ
	// không", nên nó cố ý KHÔNG phụ thuộc chỗ ngắt.
	//
	// Trước đây wrapText ngắt theo ký tự nên còn xé GIỮA từ ("dùng" → "dù" + "ng");
	// giờ đã ngắt ở biên từ, và chính bất biến đó do TestWrapTextKhongXeGiuaTu canh.
	body := strings.Join(strings.Fields(renderHelpText(paddedModalContentWidth(
		func() int { w, _ := reportModalSize(resizeW, 40); return w }()))), "")
	for _, word := range strings.Fields(longest) {
		if !strings.Contains(body, word) {
			t.Errorf("nội dung /help ngắt ở bề rộng %d làm MẤT chữ %q của mô tả dài nhất",
				resizeW, word)
			return
		}
	}
}

// Luồng sự kiện phải được dựng LẠI khi cửa sổ đổi cỡ. Bản cũ chỉ đổi cỡ viewport nên
// nội dung giữ nguyên cách cắt của bề rộng cũ: nới cửa sổ ra thì dòng vẫn cụt "..." ở
// mốc hẹp, thu vào thì dòng dôi ra và bị khung cắt cứng. Câu tiếng Việt dài hơn tiếng
// Trung nên chạm ngưỡng cắt sớm hơn nhiều, lỗi vì thế lộ rõ ở bản Việt.
func TestLuongSuKienDungLaiKhiDoiCoCuaSo(t *testing.T) {
	long := "Không dùng được phán quyết thất bại, đã tạm dừng chờ người can thiệp xử lý"
	events := []host.Event{{
		Time:     time.Now(),
		Category: "SYSTEM",
		Agent:    "engine",
		Summary:  long,
	}}

	// atWidth dựng model ở bề rộng w rồi nạp sự kiện — mô phỏng sự kiện tới trong lúc
	// cửa sổ đang rộng w.
	atWidth := func(w int) Model {
		m := Model{mode: modeRunning, textarea: textarea.New(), events: events}
		next, _ := m.Update(tea.WindowSizeMsg{Width: w, Height: 40})
		m = next.(Model)
		m.refreshEventViewport()
		return m
	}
	// Chỉ so PHẦN CÓ CHỮ: số dòng trắng đệm ở đuôi phụ thuộc chiều cao textarea nên
	// khác nhau một cách vô hại, còn lỗi cần bắt nằm ở nội dung.
	content := func(m Model) string {
		return strings.TrimRight(ansi.Strip(m.viewport.View()), " \n")
	}

	// Sự kiện tới lúc cửa sổ rộng 100, rồi người dùng nới lên 160: phải ra đúng những gì
	// nhận được nếu sự kiện tới khi đã ở 160. So với bản "mở thẳng" thay vì tự đoán câu
	// có vừa 160 cột hay không — khung giữa chỉ chiếm một phần bề rộng terminal nên câu
	// dài vẫn có thể bị cắt một cách hợp lệ ở 160.
	resized, _ := atWidth(100).Update(tea.WindowSizeMsg{Width: 160, Height: 40})
	got := content(resized.(Model))
	want := content(atWidth(160))

	if got != want {
		t.Errorf("nới 100 → 160 cho kết quả KHÁC với sự kiện tới sẵn ở 160 — luồng sự kiện chưa dựng lại\n"+
			"--- sau khi nới (vẫn cắt theo mốc 100) ---\n%s\n--- ở 160 (đúng) ---\n%s",
			got, want)
	}
}

// Gợi ý phím nằm trong viền dưới của modal. Bản cũ cắt cứng theo cột nên tiếng
// Việt dài hơn thành "Esc quay lạ" — mất chữ cuối, không dấu hiệu gì. Gợi ý là
// danh sách mục phân tách " · ", nên phải bỏ theo MỤC, không cắt giữa chữ.
func TestGoiYModalKhongBiCatGiuaChu(t *testing.T) {
	hint := "↑↓ dòng · ←→ trường · Enter sửa · Delete xóa · Esc quay lại"
	want := strings.Split(hint, " · ")

	// Quét nhiều bề rộng: mỗi ngưỡng làm rơi một mục khác nhau, và có ngưỡng cắt đúng
	// giữa chữ cuối — đúng cái đã thấy trên màn ("Esc quay lạ").
	for _, maxW := range []int{58, 55, 50, 45, 40, 30, 20} {
		fitted := fitHintToWidth(hint, maxW)
		if w := lipgloss.Width(fitted); w > maxW {
			t.Errorf("maxW=%d: gợi ý vẫn rộng %d cột: %q", maxW, w, fitted)
			continue
		}
		if strings.HasSuffix(fitted, "...") {
			continue // mục cuối cũng không vừa: cắt nhưng có dấu hiệu, chấp nhận
		}
		// Mục cuối là lối thoát ("Esc quay lại") — phải còn, nếu không người dùng bí
		// trong modal mà không thấy cách ra.
		if !strings.HasSuffix(fitted, want[len(want)-1]) {
			t.Errorf("maxW=%d: mất lối thoát %q khỏi gợi ý: %q",
				maxW, want[len(want)-1], fitted)
		}
		for _, item := range strings.Split(fitted, " · ") {
			// So KHỚP HẲN với mục gốc, không phải "chứa": bản cắt cứng cho ra
			// "Esc quay lạ" — vẫn là tiền tố của "Esc quay lại" nên phép "chứa"
			// bỏ qua đúng cái lỗi cần bắt.
			if !slices.Contains(want, item) {
				t.Errorf("maxW=%d: mục %q bị cắt giữa chữ (không khớp hẳn mục gốc nào)\n  đã fit: %q",
					maxW, item, fitted)
			}
		}
	}
}

// Mô tả lệnh trong bảng lệnh bị cắt bằng truncateWidth (không có "..."), nên hiện ra
// "...đồng sáng tác lên kế hoạch cho " — người dùng không biết còn chữ phía sau.
// Test đi qua ĐÚNG hàm dựng bảng lệnh thật, không kiểm truncate cho riêng nó.
func TestMoTaLenhBiCatPhaiCoDauHieu(t *testing.T) {
	items := builtinCommandItems()
	if len(items) == 0 {
		t.Fatal("không có lệnh nào để kiểm")
	}
	// Đưa con trỏ tới lệnh có mô tả DÀI NHẤT, vì chỉ nó mới chắc chắn bị cắt.
	cursor := 0
	for i, item := range items {
		if lipgloss.Width(item.Description) > lipgloss.Width(items[cursor].Description) {
			cursor = i
		}
	}
	out := ansi.Strip(renderCommandPalette(120, items, cursor))
	if out == "" {
		t.Fatal("renderCommandPalette trả về rỗng")
	}

	// Bảng chỉ hiện một cửa sổ 5 lệnh; các lệnh ngoài cửa sổ vắng mặt là đúng, không
	// phải bị cắt. Chỉ xét đúng những lệnh đang hiện.
	start, end := commandPaletteWindow(len(items), cursor, 5)
	var sawTruncated bool
	for _, spec := range items[start:end] {
		if spec.Description == "" {
			continue
		}
		// Xét ĐÚNG dòng của lệnh đó, không xét cả bảng: dòng "Usage:" phía dưới cũng
		// bị cắt và cũng có "..." nên kiểm cả bảng thì lỗi ở dòng mô tả bị che.
		var line string
		for _, l := range strings.Split(out, "\n") {
			if strings.Contains(l, " "+spec.Name+" ") {
				line = l
				break
			}
		}
		if line == "" {
			t.Fatalf("không tìm được dòng của lệnh %q trong bảng:\n%s", spec.Name, out)
		}
		if strings.Contains(line, spec.Description) {
			continue // hiện đủ, không bị cắt
		}
		sawTruncated = true
		// Bị cắt: phải có "..." để người dùng biết còn chữ phía sau.
		if !strings.Contains(line, "...") {
			t.Errorf("mô tả của /%s bị cắt mà không có dấu hiệu '...'\n  mô tả đủ: %q\n  trên màn: %q",
				spec.Name, spec.Description, strings.TrimSpace(line))
		}
	}
	if !sawTruncated {
		t.Skip("ở bề rộng này không mô tả nào bị cắt — test không kết luận được")
	}
}

// Các trường trong form Provider của /config phải thẳng cột. Bản cũ dùng
// pad = max(1, 10-w) nên nhãn "Test kết nối" (12 cột) đẩy giá trị sang cột 13 còn
// "API Key" để ở cột 10 → lệch 3 cột, mắt thấy ngay trên màn.
func TestFormProviderConfigThangCot(t *testing.T) {
	st := &modelConfigState{
		step:         configStepHub,
		provider:     "openrouter",
		editModelIdx: -1,
		baseURL:      "https://openrouter.ai/api/v1",
		models:       []bootstrap.ModelConfig{{Name: "google/gemini-2.5-flash", ContextWindow: 1000000}},
	}
	lines := renderProviderHubFields(st, 70)
	if len(lines) < 2 {
		t.Fatalf("form chỉ có %d dòng", len(lines))
	}

	// Cột giá trị = vị trí bắt đầu giá trị. Lấy nhãn thật từ hubFields rồi đo phần
	// đứng trước giá trị trên từng dòng đã render.
	fields := st.hubFields()
	col := -1
	for i, f := range fields {
		if f.value == "" || i >= len(lines) {
			continue
		}
		plain := ansi.Strip(lines[i])
		idx := strings.Index(plain, f.value)
		if idx < 0 {
			continue // giá trị bị cắt ở bề rộng này, không đo được
		}
		got := lipgloss.Width(plain[:idx])
		if col == -1 {
			col = got
			continue
		}
		if got != col {
			t.Errorf("cột giá trị lệch: nhãn %q để giá trị ở cột %d, các nhãn trước ở cột %d\n  %q",
				f.label, got, col, plain)
		}
	}
	if col == -1 {
		t.Fatal("không đo được cột giá trị nào")
	}
}

// Mọi chuỗi hiện lên màn phải đi qua i18n.F. Mấy nhãn trong sidebar lọt sổ: chúng
// là chuỗi THÔ trong code (renderField("进度", ...)) nên hiện chữ Hán bất kể locale
// — trên màn thật đọc được "进度      2 / 300 chương".
//
// Test này đi qua ĐÚNG đường render thật thay vì kiểm bảng msgid, nên nó bắt cả
// những chuỗi thô mới lọt vào sau này. Chỉ tính nhãn ĐÃ có bản dịch vi; msgid chưa
// dịch rơi về zh là đúng hợp đồng và được bỏ qua.
func TestSidebarKhongConChuHanKhiLocaleVi(t *testing.T) {
	t.Cleanup(func() { _ = i18n.SetLocale(i18n.DefaultLocale) })
	if err := i18n.SetLocale(i18n.Vietnamese); err != nil {
		t.Fatal(err)
	}

	snap := host.UISnapshot{
		RuntimeState:        "paused",
		Phase:               "writing",
		Flow:                "write",
		AdvanceMode:         "auto",
		TotalChapters:       300,
		CompletedCount:      2,
		TotalWordCount:      5803,
		ContextSummaryCount: 3,
	}

	for _, raw := range []string{"进度", "已完成", "已规划", "摘要"} {
		if i18n.F(raw) == raw {
			continue // chưa dịch — không kết luận được từ đây
		}
		out := ansi.Strip(renderStateContent(snap, 40))
		if strings.Contains(out, raw) {
			t.Errorf("sidebar còn chữ Hán thô %q (bản dịch vi có sẵn: %q) — nhãn chưa bọc i18n.F\n%s",
				raw, i18n.F(raw), out)
		}
	}
}

// TestWrapTextKhongXeGiuaTu chốt bất biến: wrapText ngắt Ở BIÊN TỪ, không giữa từ.
//
// Lớp lỗi này đo được trên màn thật trước khi sửa: khung /help ở 120 cột hiện
// "[--guide=<hướng dẫn cắt chư" / "ơng>]" và "--guide dù" / "ng lời văn tự nhiên" —
// "chương" xé thành "chư"+"ơng", "dùng" xé thành "dù"+"ng". Cả hai nửa đều đọc được
// (và "dù" là một từ tiếng Việt thật) nên người dùng báo là LỖI CHÍNH TẢ, không ai
// nghĩ tới layout. Tiếng Trung không gặp: mỗi chữ Hán là một đơn vị đứng riêng.
//
// Bất biến chọn là "dãy từ được bảo toàn" chứ không phải "so từng dòng": nó bắt được
// mọi kiểu xé (thêm mảnh, mất mảnh) mà không phụ thuộc chỗ ngắt cụ thể.
func TestWrapTextKhongXeGiuaTu(t *testing.T) {
	// Đúng hai chuỗi đã hỏng trên màn, lấy từ mô tả lệnh thật.
	inputs := []string{
		"Nhập truyện ngoài theo ngữ nghĩa (không tham số thì khôi phục lần nhập chưa xong; --guide dùng lời văn tự nhiên để chỉnh cách cắt)",
		"Mở lại sách đã hoàn thành để sáng tác tiếp (hướng được phán quyết nạp vào trước, rồi tự chạy tiếp)",
		"Không dùng được phán quyết thất bại, đã tạm dừng chờ người can thiệp xử lý",
	}
	for _, in := range inputs {
		want := strings.Fields(in)
		for _, w := range []int{20, 33, 47, 61, 76, 94} {
			got := strings.Fields(wrapText(in, w))
			if !slices.Equal(got, want) {
				t.Errorf("wrapText(%d) xé giữa từ — dãy từ đổi\n input: %q\n   got: %q\n  want: %q",
					w, in, got, want)
				break
			}
			for i, line := range strings.Split(wrapText(in, w), "\n") {
				if lw := lipgloss.Width(line); lw > w {
					t.Errorf("wrapText(%d) dòng %d rộng %d — vượt bề rộng, viewport sẽ cắt cứng: %q", w, i, lw, line)
				}
			}
		}
	}
}

// TestWrapTextVanNgatCungChuHan giữ đường tiếng Trung: một mạch chữ Hán KHÔNG có
// khoảng trắng nào thì ngắt theo biên từ là bất khả, phải ngắt cứng. Nếu bản sửa
// "ưu tiên biên từ" làm chuỗi Hán không còn ngắt nữa thì nó dôi ra và bị cắt cứng.
func TestWrapTextVanNgatCungChuHan(t *testing.T) {
	in := strings.Repeat("宽", 30) // 60 cột, không có khoảng trắng
	out := wrapText(in, 20)
	lines := strings.Split(out, "\n")
	if len(lines) < 2 {
		t.Fatalf("chuỗi Hán 60 cột ở bề rộng 20 phải ngắt thành nhiều dòng, được %d: %q", len(lines), out)
	}
	for i, line := range lines {
		if lw := lipgloss.Width(line); lw > 20 {
			t.Errorf("dòng %d rộng %d vượt 20: %q", i, lw, line)
		}
	}
	if n := strings.Count(ansi.Strip(out), "宽"); n != 30 {
		t.Errorf("ngắt cứng làm mất chữ: còn %d/30 chữ 宽", n)
	}
}

// TestSidebarDongTiepPhaiThutVao chốt §8: khi một trường sidebar phải xuống dòng,
// dòng tiếp phải THỤT VÀO. Không thụt thì nó bắt đầu ở đúng cột của NHÃN, nên trên
// màn thật "Trạng thái chạy Đã tạm dừng" hiện thành "Trạng thái chạy Đã" / "tạm dừng"
// và "tạm dừng" đọc ra như một nhãn mới.
//
// Đo được 9/27 nhãn sidebar vượt cột nhãn 10 khi dịch sang tiếng Việt (nhãn Hán chỉ
// 4–8 cột, bản Việt tới 19), nên đây là lớp lỗi chung của sidebar.
func TestSidebarDongTiepPhaiThutVao(t *testing.T) {
	const width = 27
	body := renderFieldLabel("Trạng thái") + "Đã tạm dừng giữa chừng chờ người can thiệp"
	out := fitSidebarBody(strings.TrimRight(body, "\n"), width)
	lines := strings.Split(out, "\n")
	if len(lines) < 2 {
		t.Fatalf("giá trị dài phải xuống dòng ở bề rộng %d, được %d dòng: %q", width, len(lines), out)
	}
	limit := sidebarBodyWidth(width)
	for i, line := range lines {
		if lw := lipgloss.Width(line); lw > limit {
			t.Errorf("dòng %d rộng %d vượt thân thẻ %d — viewport cắt cứng, mất chữ: %q", i, lw, limit, line)
		}
		if i > 0 && !strings.HasPrefix(ansi.Strip(line), sidebarContIndent) {
			t.Errorf("dòng tiếp %d không thụt vào nên đọc ra như NHÃN: %q", i, line)
		}
	}
	// Và không được mất chữ nào.
	if got, want := strings.Fields(ansi.Strip(out)), strings.Fields(ansi.Strip(body)); !slices.Equal(got, want) {
		t.Errorf("xuống dòng làm đổi dãy từ\n got: %q\nwant: %q", got, want)
	}
}
