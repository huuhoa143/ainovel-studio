package domain

import (
	"fmt"
	"github.com/huuhoa143/ainovel-studio/internal/i18n"
	"unicode"
	"unicode/utf8"
)

// ReviewInterval 全局审阅间隔（每 N 章触发一次）。
const ReviewInterval = 5

// ShouldReview 根据已完成章节数判断是否需要全局审阅（短篇/中篇模式）。
func ShouldReview(completedCount int) (bool, string) {
	if completedCount > 0 && completedCount%ReviewInterval == 0 {
		return true, fmt.Sprintf(i18n.F("已完成 %d 章，触发全局审阅"), completedCount)
	}
	return false, ""
}

// ShouldArcReview 长篇模式下判断是否需要弧级/卷级评审。
func ShouldArcReview(isArcEnd, isVolumeEnd bool, volume, arc int) (bool, string) {
	if isVolumeEnd {
		return true, fmt.Sprintf(i18n.F("第 %d 卷第 %d 弧结束（卷结束），触发弧级+卷级评审"), volume, arc)
	}
	if isArcEnd {
		return true, fmt.Sprintf(i18n.F("第 %d 卷第 %d 弧结束，触发弧级评审"), volume, arc)
	}
	return false, ""
}

// WordCount đếm số "chữ" của một đoạn văn theo đơn vị của ngôn ngữ đang hoạt động.
//
// Vì sao phải phân nhánh: mọi chỉ tiêu độ dài trong repo này (chỉ tiêu chữ/chương
// trong assets/references, ngân sách token, quality gate, diag.WordCountAnomaly)
// đều được upstream hiệu chỉnh trên tiếng Trung, nơi 1 rune = 1 chữ Hán = 1 âm
// tiết. Tiếng Việt cũng đơn âm nhưng viết rời: 1 âm tiết ≈ 4 rune (khoảng 3 chữ
// cái cộng 1 dấu cách). Đếm rune cho văn Việt vì thế thổi phồng số đo 4-5 lần —
// chương "3000 chữ" thật ra chỉ khoảng 700 âm tiết, tức ngắn hơn chỉ tiêu 4-5
// lần — và không gate nào báo động, vì tất cả đều đọc cùng một con số đã phồng.
//
// Hệ số quy đổi chữ Hán → chữ Việt là ~1,0, nên các ngưỡng tính bằng "字" của
// upstream dùng lại được NGUYÊN SI sau khi đổi sang cách đếm này — không phải
// nhân chia gì thêm. Căn cứ đo trên chính translation memory zh→vi của repo
// (internal/i18n/locales/vi.json, 399 cặp có ≥8 chữ Hán): tổng 7260 chữ Hán ứng
// với 7433 chữ Việt, tỉ lệ 1,024, trung vị 1,000, p10-p90 = 0,82-1,30. Lý do
// tỉ lệ xấp xỉ 1: cả hai ngôn ngữ đều đơn âm, 1 chữ Hán ≈ 1 âm tiết ≈ 1 "chữ"
// tiếng Việt viết rời. Cùng bộ dữ liệu cho rune/chữ của văn Việt = 4,75, tức
// đúng cái hệ số 4-5 lần mà cách đếm rune đã thổi phồng.
//
// Giới hạn của phép đo phải nói rõ: TM là chuỗi giao diện, không phải văn kể.
// Văn kể có thể lệch ít nhiều, nhưng lệch quanh 1,0 chứ không quanh 4,75 — sai
// số này nhỏ hơn hai bậc so với bug đang sửa.
//
// Nhánh zh giữ đúng utf8.RuneCountInString, không phải vì đó là cách đếm hay
// nhất mà vì phải bằng đúng upstream: đổi nó là đổi ngầm ngưỡng của mọi cuốn
// tiếng Trung đang viết dở.
func WordCount(content string) int {
	if i18n.Active() == i18n.Chinese {
		return utf8.RuneCountInString(content)
	}
	return countSpacedWords(content)
}

// countSpacedWords đếm chữ cho văn bản viết rời (tiếng Việt và mọi thứ không
// phải chữ Hán), tính cả chữ Hán lẫn trong đó theo lối viết liền của nó.
//
// Bốn quyết định đáng ghi lại, vì làm sai chỗ nào cũng lệch số đo mà không lỗi:
//
//   - Dấu tổ hợp (unicode.M) là ký tự trong từ. "ế" là 1 rune ở NFC nhưng 3 rune
//     ở NFD; coi dấu là ranh giới thì cùng một chương cho hai số đếm khác nhau
//     chỉ vì file được chuẩn hóa khác — số đo phụ thuộc encoding là số đo vô nghĩa.
//   - Chữ Hán đếm rời từng chữ: chữ Hán không có dấu cách, gộp cả cụm tên riêng
//     thành 1 chữ sẽ làm hụt số đo ở đúng những chương nhiều tên riêng.
//   - Dấu câu không bao giờ là chữ. Văn thoại tiếng Việt dày gạch đầu dòng và
//     ngoặc kép; tính chúng vào là cộng khống vài phần trăm mỗi chương.
//   - Dấu nối trong từ ("ra-đi-ô") và dấu thập phân ("3,5") không được cắt từ.
func countSpacedWords(s string) int {
	words := 0
	inWord := false
	var prev rune
	for i, r := range s {
		switch {
		case unicode.Is(unicode.Han, r):
			words++
			inWord = false
		case isWordRune(r):
			if !inWord {
				words++
				inWord = true
			}
		case inWord && isWordJoiner(r, prev, nextRune(s, i+utf8.RuneLen(r))):
			// Vẫn nằm trong cùng một chữ; không đổi trạng thái.
		default:
			inWord = false
		}
		prev = r
	}
	return words
}

func isWordRune(r rune) bool {
	return unicode.IsLetter(r) || unicode.IsNumber(r) || unicode.Is(unicode.M, r)
}

// isWordJoiner cho biết r có phải dấu nối bên trong một chữ, xét cả rune trước
// và rune sau. Dấu đứng cuối chữ (trước dấu cách) luôn là dấu câu, không phải nối.
func isWordJoiner(r, prev, next rune) bool {
	if !isWordRune(next) {
		return false
	}
	switch r {
	case '-', '_', '\'', '’': // ra-đi-ô, l'amour; U+2019 hay bị dùng làm dấu lược
		return true
	case '.', ',':
		// "3,5" và "1.000" là một số; còn "hết câu. Câu sau" là hai câu — chỉ
		// nhận dấu nối khi cả hai bên đều là chữ số.
		return unicode.IsDigit(prev) && unicode.IsDigit(next)
	}
	return false
}

func nextRune(s string, i int) rune {
	if i >= len(s) {
		return 0
	}
	r, _ := utf8.DecodeRuneInString(s[i:])
	return r
}

// runesPerWordVI là số rune trung bình của một chữ tiếng Việt, đo trên
// translation memory zh→vi của repo (xem chú thích [WordCount]). Chỉ dùng để quy
// đổi NGÂN SÁCH đo bằng rune, không dùng để đếm — đếm thì luôn dùng [WordCount].
const runesPerWordVI = 4.75

// RuneBudgetForWords quy đổi một ngân sách viết theo đơn vị của upstream (1 chữ
// Hán = 1 rune) sang số rune cần thiết để chở đúng lượng NỘI DUNG đó ở ngôn ngữ
// đang hoạt động.
//
// Vì sao cần: các hằng số cắt chuỗi kiểu "2000 rune" được chọn để tải khoảng
// 2000 âm tiết nội dung. Cùng 2000 rune văn Việt chỉ chở ~420 chữ, tức ~1/5 nội
// dung — chỗ nào dùng nó để nạp ngữ cảnh liên tục cho model thì model nhận được
// 20% đầu mỗi chương và vẫn tưởng đã đọc đủ. Đây là lỗi thầm lặng đúng nghĩa:
// không cảnh báo, chỉ là chất lượng tụt.
func RuneBudgetForWords(words int) int {
	if words <= 0 {
		return words
	}
	if i18n.Active() == i18n.Chinese {
		return words
	}
	return int(float64(words) * runesPerWordVI)
}
