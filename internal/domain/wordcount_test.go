package domain

import (
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/huuhoa143/ainovel-studio/internal/i18n"
)

// withLocale đổi ngôn ngữ trong phạm vi một test rồi phục hồi. Locale là biến
// toàn cục nên chỉ an toàn khi test không gọi t.Parallel().
func withLocale(t *testing.T, loc i18n.Locale) {
	t.Helper()
	prev := i18n.Active()
	if err := i18n.SetLocale(loc); err != nil {
		t.Fatalf("set locale %s: %v", loc, err)
	}
	t.Cleanup(func() { _ = i18n.SetLocale(prev) })
}

func TestWordCountVietnameseCountsSyllablesNotCharacters(t *testing.T) {
	withLocale(t, i18n.Vietnamese)

	cases := []struct {
		text string
		want int
	}{
		// Câu trần thuật thường: dấu phẩy và dấu chấm không phải là chữ.
		{"Hắn không nói gì, chỉ lặng lẽ nhìn ra cửa sổ.", 11},
		// Thoại có gạch đầu dòng, ngoặc kép và dấu hỏi — tất cả đều là dấu ngắt.
		{`— "Anh đi đâu?" hắn hỏi.`, 5},
		// Số thập phân kiểu Việt (dấu phẩy) và số có dấu phân nhóm là MỘT chữ,
		// không phải hai: "3,5" bị cắt đôi là lỗi đếm điển hình của FieldsFunc thô.
		{"Năm 1945, giá gạo tăng 3,5 lần.", 7},
		{"Cả thảy 1.000 người.", 4},
		// Từ vay mượn phiên âm bằng gạch nối là một chữ.
		{"Chiếc ra-đi-ô cũ kêu rè rè.", 6},
		// Xuống dòng và nhiều dấu cách liền nhau không sinh chữ rỗng.
		{"Trời tối.\n\n  Gió lên.  ", 4},
		// Chỉ có dấu câu thì không có chữ nào.
		{"… —— !?,.", 0},
		{"", 0},
	}
	for _, c := range cases {
		if got := WordCount(c.text); got != c.want {
			t.Errorf("WordCount(%q) = %d, muốn %d", c.text, got, c.want)
		}
	}
}

// TestWordCountVietnameseIgnoresNormalization khóa bất biến NFC/NFD: "ế" là 1
// rune ở NFC và 3 rune ở NFD. Nếu dấu tổ hợp không được tính là ký tự trong từ,
// bản NFD sẽ bị cắt thành nhiều chữ và số đếm phụ thuộc vào chuẩn hóa của file.
func TestWordCountVietnameseIgnoresNormalization(t *testing.T) {
	withLocale(t, i18n.Vietnamese)

	const nfc = "Chuyện đã kết thúc rồi, tiếng nấc cuối cũng tắt."
	nfd := strings.NewReplacer(
		"ế", "ế", // ê + dấu sắc
		"ệ", "ệ", // ê + dấu nặng
		"ố", "ố",
		"ũ", "ũ",
		"ề", "ề",
	).Replace(nfc)

	if nfd == nfc {
		t.Fatal("dữ liệu test sai: bản NFD phải khác bản NFC")
	}
	if utf8.RuneCountInString(nfd) <= utf8.RuneCountInString(nfc) {
		t.Fatal("dữ liệu test sai: bản NFD phải có nhiều rune hơn")
	}
	if got, want := WordCount(nfd), WordCount(nfc); got != want {
		t.Errorf("WordCount(NFD) = %d, WordCount(NFC) = %d — chuẩn hóa không được ảnh hưởng số đếm", got, want)
	}
}

// TestWordCountVietnameseMixedHan giữ tên riêng chữ Hán lẫn trong văn Việt đếm
// rời từng chữ: chữ Hán viết liền không có dấu cách, gộp cả cụm thành 1 chữ sẽ
// làm hụt số đo ở đúng những chương có nhiều tên riêng.
func TestWordCountVietnameseMixedHan(t *testing.T) {
	withLocale(t, i18n.Vietnamese)

	if got, want := WordCount("Hắn tên là 陆九渊."), 6; got != want {
		t.Errorf("WordCount = %d, muốn %d", got, want)
	}
}

// TestWordCountChineseKeepsUpstreamRuneCount chốt nhánh zh KHÔNG đổi hành vi:
// mọi ngưỡng độ dài của upstream được hiệu chỉnh trên chính con số này, đổi nó
// là đổi ngầm mọi quality gate của các cuốn zh đang viết dở.
func TestWordCountChineseKeepsUpstreamRuneCount(t *testing.T) {
	withLocale(t, i18n.Chinese)

	const zh = "他不是愤怒，而是恐惧。沉默了几息，她眼中闪过慌乱。"
	if got, want := WordCount(zh), utf8.RuneCountInString(zh); got != want {
		t.Errorf("WordCount(zh) = %d, muốn %d (đúng bằng số rune như upstream)", got, want)
	}
}

// TestWordCountVietnameseChapterIsNotInflatedByRunes là test hồi quy cho chính
// con bug: một chương tiếng Việt ~3000 rune chỉ chứa khoảng 700 chữ. Đếm rune
// làm mọi chỉ tiêu "3000 chữ/chương" được thỏa mãn bởi chương ngắn 4-5 lần, và
// không gate nào báo động vì tất cả đều đọc cùng con số đã phồng.
func TestWordCountVietnameseChapterIsNotInflatedByRunes(t *testing.T) {
	withLocale(t, i18n.Vietnamese)

	para := "Trời đã ngả về chiều, gió từ mặt sông thổi lên mang theo mùi bùn tanh nồng. " +
		"Hắn ngồi bệt xuống bậc đá, nhìn đám thuyền chài lục tục kéo lưới về bến. " +
		"Có tiếng ai gọi con ở phía sau rặng tre, khàn đặc và mệt mỏi.\n\n"
	chapter := strings.Repeat(para, 15)

	runes := utf8.RuneCountInString(chapter)
	words := WordCount(chapter)
	if runes < 3000 {
		t.Fatalf("dữ liệu test sai: cần ≥3000 rune, có %d", runes)
	}
	if words >= runes/3 {
		t.Errorf("words=%d runes=%d — văn Việt phải có số chữ dưới 1/3 số rune, "+
			"nếu không thì WordCount vẫn đang đếm ký tự", words, runes)
	}
	// Tỉ lệ rune/chữ của văn Việt thực tế nằm quanh 4,0-4,6 (âm tiết ~3 chữ cái
	// + 1 dấu cách). Chặn hai đầu để phát hiện cả kiểu đếm quá tay (cắt vụn từ).
	ratio := float64(runes) / float64(words)
	if ratio < 3.5 || ratio > 5.5 {
		t.Errorf("tỉ lệ rune/chữ = %.2f, ngoài khoảng hợp lý 3,5-5,5 (runes=%d words=%d)", ratio, runes, words)
	}
}
