package stylestat

import (
	"strings"
	"testing"

	"github.com/huuhoa143/ainovel-studio/internal/i18n"
)

func withLocale(t *testing.T, loc i18n.Locale) {
	t.Helper()
	prev := i18n.Active()
	if err := i18n.SetLocale(loc); err != nil {
		t.Fatalf("SetLocale(%s): %v", loc, err)
	}
	t.Cleanup(func() { _ = i18n.SetLocale(prev) })
}

func viChapters(n int, body string) []string {
	out := make([]string, n)
	for i := range out {
		out[i] = "# Chương 1 Bến cũ\n" + body
	}
	return out
}

// TestVietnamesePatternsDetected là test hồi quy cho chính con bug: với văn tiếng
// Việt, cả 8 regex tiếng Trung khớp 0 lần, nên Patterns rỗng và hệ thống báo
// "sạch" trong khi văn bản đặc kín giọng AI. Đoạn dưới cố tình nhồi mỗi lớp tật
// đúng một lần mỗi chương.
func TestVietnamesePatternsDetected(t *testing.T) {
	withLocale(t, i18n.Vietnamese)

	// Mỗi dòng khởi đúng MỘT lớp, không dòng nào khởi hai lớp — nhờ vậy mới chốt
	// được "total = 6" và bắt luôn regex nào khớp lan.
	body := "Hắn không phải tức giận, mà là sợ hãi.\n" + // câu chỉnh nghĩa
		"Trong nháy mắt, cả gian phòng tối sầm.\n" + // lượng từ thời gian
		"Ngọn đèn hắt xuống tựa như vệt máu.\n" + // so sánh sáo
		"Nàng im lặng.\n" + // nhịp im lặng
		"Khóe miệng nàng khẽ nhếch.\n" + // mẫu thần thái
		"Tim hắn thắt lại.\n" + // phản ứng cơ thể
		"Hắn cảm thấy mọi thứ đã trôi qua.\n" + // đánh dấu suy nghĩ
		"Một cảm giác khó tả dâng lên.\n" + // sáo trừu tượng
		"Nàng nhìn hắn một cách lạnh lùng.\n" + // trạng ngữ dịch máy
		"Ánh mắt của hắn tối lại.\n" + // sở hữu dịch máy
		"Tuy nhiên, mọi thứ đã muộn.\n" // liên từ nghị luận mở câu

	s := Compute(Input{Chapters: viChapters(6, body)})
	if s == nil {
		t.Fatal("muốn có stats")
	}
	if len(s.Patterns) == 0 {
		t.Fatal("Patterns rỗng — bộ mẫu tiếng Việt chưa hoạt động")
	}

	got := make(map[string]int, len(s.Patterns))
	for _, p := range s.Patterns {
		got[p.Name] = p.Total
	}
	// Mỗi lớp phải khớp ĐÚNG 6 lần (1 lần/chương × 6 chương). Chốt con số thay vì
	// chỉ ">0" để một regex quá rộng (khớp lan sang câu khác) cũng bị phát hiện.
	for name, total := range got {
		if total != 6 {
			t.Errorf("lớp %q: total = %d, muốn 6 (1 lần mỗi chương)", name, total)
		}
	}
	// Tối thiểu phải bắt được các lớp tương ứng với 8 lớp của tiếng Trung.
	if len(got) < 8 {
		t.Errorf("chỉ bắt được %d lớp mẫu, muốn ≥8: %v", len(got), got)
	}
	for _, p := range s.Patterns {
		if p.PerChapter != 1.0 {
			t.Errorf("lớp %q: per_chapter = %v, muốn 1.0", p.Name, p.PerChapter)
		}
	}
}

// TestVietnamesePatternsQuietOnCleanProse chặn kiểu regex "khớp mọi thứ": văn
// tiếng Việt bình thường, không tật, phải cho ra rất ít lớp. Không có test này
// thì một regex `.` cũng làm TestVietnamesePatternsDetected xanh.
func TestVietnamesePatternsQuietOnCleanProse(t *testing.T) {
	withLocale(t, i18n.Vietnamese)

	body := "Mưa gõ trên mái tôn suốt buổi trưa.\n" +
		"Bà cụ bán bánh đúc dọn hàng sớm, gánh nặng trĩu một bên vai.\n" +
		"Thằng bé con nhà bên chạy qua sân, chân đất, tay cầm que kem đã chảy.\n" +
		"Ngoài cổng, xe tải chở cát rú ga rồi tắt lịm.\n"

	s := Compute(Input{Chapters: viChapters(6, body)})
	if s == nil {
		t.Fatal("muốn có stats")
	}
	if len(s.Patterns) > 2 {
		t.Errorf("văn sạch mà bắt %d lớp mẫu — regex quá rộng: %+v", len(s.Patterns), s.Patterns)
	}
}

// TestVietnameseRepeatedSentences chốt việc CẮT ĐƯỢC CÂU tiếng Việt. Với
// sentenceSplit=[。！？\n] thì dấu . ! ? Latin không phải ranh giới câu, cả
// chương thành một "câu" khổng lồ và mọi thống kê nhịp/lặp câu vỡ lặng lẽ.
func TestVietnameseRepeatedSentences(t *testing.T) {
	withLocale(t, i18n.Vietnamese)

	motto := "Cả đời này ta không đi được, mong ngươi thay ta nhìn núi non biển cả."
	chapters := make([]string, 6)
	for i := range chapters {
		// Hai câu ngăn nhau bằng dấu chấm trên CÙNG một dòng: nếu chỉ tách theo
		// \n thì câu lặp không bao giờ được tách ra để so.
		body := "Ngày thường chẳng có gì lặp lại. Trời vẫn xanh như mọi khi.\n"
		if i%2 == 0 {
			body += "Gió đổi chiều. " + motto + " Rồi tất cả im lìm.\n"
		}
		chapters[i] = "# Chương 1\n" + body
	}

	s := Compute(Input{Chapters: chapters})
	if s == nil {
		t.Fatal("muốn có stats")
	}
	if len(s.RepeatedSentences) == 0 {
		t.Fatal("không phát hiện câu lặp — chưa cắt được câu tiếng Việt")
	}
	got := s.RepeatedSentences[0]
	if got.Chapters != 3 || got.Count != 3 {
		t.Errorf("câu lặp: %+v, muốn Chapters=3 Count=3", got)
	}
	if !strings.HasPrefix(got.Text, "Cả đời này") {
		t.Errorf("text = %q, muốn bắt đầu bằng %q", got.Text, "Cả đời này")
	}
}

// TestVietnameseDecimalIsNotSentenceBoundary giữ dấu chấm/phẩy trong số không bị
// coi là kết câu — nếu không, "1.000 lượng" cắt thành hai câu vụn và cả hai đều
// dưới ngưỡng độ dài nên biến mất khỏi thống kê.
func TestVietnameseDecimalIsNotSentenceBoundary(t *testing.T) {
	withLocale(t, i18n.Vietnamese)

	sent := "Hắn đếm đúng 1.000 lượng bạc rồi đẩy cả túi qua mặt bàn gỗ mun"
	chapters := make([]string, 6)
	for i := range chapters {
		body := "Câu mở đầu khác nhau ở mỗi chương số " + string(rune('a'+i)) + ".\n"
		if i < 3 {
			// Kẹp giữa hai câu khác trên CÙNG một dòng: buộc phải cắt theo dấu chấm
			// mới lấy ra được câu này, và dấu chấm trong "1.000" không được cắt.
			body += "Trời đã tối. " + sent + ". Xong việc.\n"
		}
		chapters[i] = "# Chương 1\n" + body
	}

	s := Compute(Input{Chapters: chapters})
	if s == nil {
		t.Fatal("muốn có stats")
	}
	if len(s.RepeatedSentences) == 0 {
		t.Fatal("câu chứa số thập phân không được nhận là một câu")
	}
	got := s.RepeatedSentences[0].Text
	// Phải cắt ĐÚNG một câu: không dính câu trước ("Trời đã tối"), không dính câu
	// sau ("Xong việc"), và không bị chẻ ở dấu chấm bên trong "1.000".
	if !strings.HasPrefix(got, "Hắn đếm đúng 1.000 lượng") {
		t.Errorf("câu lấy ra = %q, muốn bắt đầu bằng %q", got, "Hắn đếm đúng 1.000 lượng")
	}
	if strings.Contains(got, "Trời đã tối") || strings.Contains(got, "Xong việc") {
		t.Errorf("câu lấy ra dính câu bên cạnh — chưa cắt theo dấu chấm Latin: %q", got)
	}
}

// TestVietnameseTopPhrasesMined chốt đường đào cụm lặp còn sống. validGram cũ
// đòi mọi rune nằm trong khối chữ Hán, nên với tiếng Việt TopPhrases LUÔN rỗng:
// cơ chế "tránh khẩu ngữ hiện tại" của writer tắt hoàn toàn mà vẫn báo sạch.
func TestVietnameseTopPhrasesMined(t *testing.T) {
	withLocale(t, i18n.Vietnamese)

	line := "Mọi người ngước nhìn đỉnh Thanh Vân, Lục Cửu Uyên chắp tay đứng đó.\n"
	chapters := make([]string, 10)
	for i := range chapters {
		chapters[i] = "# Chương 1\n" + strings.Repeat(line, 3)
	}

	s := Compute(Input{Chapters: chapters, Stopwords: []string{"Lục Cửu Uyên"}})
	if s == nil {
		t.Fatal("muốn có stats")
	}
	if len(s.TopPhrases) == 0 {
		t.Fatal("TopPhrases rỗng — đào cụm lặp tiếng Việt chưa hoạt động")
	}

	var hasPlace, hasName bool
	for _, p := range s.TopPhrases {
		if strings.Contains(p.Text, "đỉnh Thanh Vân") || strings.Contains(p.Text, "Thanh Vân") {
			hasPlace = true
		}
		if strings.Contains(p.Text, "Cửu Uyên") || strings.Contains(p.Text, "Lục Cửu") {
			hasName = true
		}
	}
	if !hasPlace {
		t.Errorf("phải đào được cụm địa danh lặp, có %+v", s.TopPhrases)
	}
	if hasName {
		t.Errorf("tên nhân vật phải bị lọc, có %+v", s.TopPhrases)
	}
}

// TestVietnameseEndingShapeNotPinnedAtOne chốt đơn vị đo hình dạng câu cuối.
// Ngưỡng 30 hiểu theo rune thì với tiếng Việt gần như MỌI dòng kết đều "ngắn"
// (30 rune ≈ 7 chữ) — ShortRatio kẹt ở 1.0, tín hiệu "cả sách kết cùng một kiểu"
// mất hết khả năng phân biệt.
func TestVietnameseEndingShapeNotPinnedAtOne(t *testing.T) {
	withLocale(t, i18n.Vietnamese)

	// Dòng kết "ngắn" ở đây là một câu tiếng Việt bình thường 14 chữ / 66 rune:
	// theo đơn vị chữ thì NGẮN (14 ≤ 30), theo đơn vị rune thì DÀI (66 > 30). Dữ
	// liệu chọn đúng vào khoảng phân biệt được hai cách đo — nếu ngưỡng vẫn hiểu
	// theo rune thì short_ratio ra 0 chứ không phải 0,6.
	shortEnd := "Hắn đứng lên, phủi bụi trên vạt áo rồi bước ra khỏi sân gạch."
	longEnd := "Đêm ấy hắn ngồi rất lâu bên bậc cửa, nghe tiếng chó sủa xa dần về phía " +
		"cuối làng, và nghĩ rằng có lẽ mình sẽ không bao giờ quay lại con đường đất " +
		"này nữa, cũng không còn ai ở đó chờ mình về nữa."

	short := "# Chương 1\nMột đoạn thân bài bình thường.\n" + shortEnd
	long := "# Chương 2\nMột đoạn thân bài bình thường.\n" + longEnd
	chapters := []string{short, short, short, long, long}

	s := Compute(Input{Chapters: chapters})
	if s == nil {
		t.Fatal("muốn có stats")
	}
	if s.Ending.ShortRatio != 0.6 {
		t.Errorf("short_ratio = %v, muốn 0.6 (3 ngắn / 5 chương)", s.Ending.ShortRatio)
	}
}

// TestVietnameseTitlePrefix nhận các dạng tiêu đề tiếng Việt thực tế.
func TestVietnameseTitlePrefix(t *testing.T) {
	withLocale(t, i18n.Vietnamese)

	chapters := viChapters(5, "Thân bài.\n")

	withPrefix := []string{
		"Chương 47 Gió nổi",
		"CHƯƠNG 47 Gió nổi",
		"# Chương 47",
		"## Chương 3: Mây cuộn",
		"Chương bốn mươi bảy",
		"第47章 风起", // sách nhập từ nguồn tiếng Trung vẫn phải nhận ra
	}
	for _, title := range withPrefix {
		s := Compute(Input{Chapters: chapters, Titles: []string{title, "Mây cuộn"}})
		if s.TitleFormats == nil || s.TitleFormats.WithPrefix != 1 || s.TitleFormats.WithoutPrefix != 1 {
			t.Errorf("tiêu đề %q phải được nhận là có tiền tố, có %+v", title, s.TitleFormats)
		}
	}

	// Tiêu đề thường KHÔNG được nhận nhầm là có tiền tố. Hai ca cuối là bẫy thật:
	// "Ba" và "Mười Hai" vừa là từ số vừa là chữ trong tên chương, nên nếu chỉ đòi
	// "chương + một từ số" thì tên chương bị đọc thành số thứ tự.
	noPrefix := []string{
		"Gió nổi", "Chương trình của lão thầy", "Bến cũ",
		"Chương Ba Đào", "Chương Mười Hai Bến Nước",
	}
	s := Compute(Input{Chapters: chapters, Titles: noPrefix})
	if s.TitleFormats != nil {
		t.Errorf("toàn bộ tiêu đề đều không tiền tố nên không được báo, có %+v", s.TitleFormats)
	}
}

// TestVietnameseOpeningTimeRate chốt mẫu "mở chương bằng mốc thời gian" — tật
// rất phổ biến của LLM (chương nào cũng bắt đầu bằng trời sáng/đêm xuống).
func TestVietnameseOpeningTimeRate(t *testing.T) {
	withLocale(t, i18n.Vietnamese)

	timed := "# Chương 1\nRạng đông, sương còn đọng trên lá.\nThân bài.\n"
	plain := "# Chương 2\nHắn đẩy cửa bước vào quán.\nThân bài.\n"
	s := Compute(Input{Chapters: []string{timed, timed, timed, plain, plain}})
	if s == nil {
		t.Fatal("muốn có stats")
	}
	if s.OpeningTimeRate != 0.6 {
		t.Errorf("opening_time_rate = %v, muốn 0.6", s.OpeningTimeRate)
	}
}
