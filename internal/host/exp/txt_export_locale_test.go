package exp

import (
	"fmt"
	"strings"
	"testing"
	"unicode"

	"github.com/huuhoa143/ainovel-studio/internal/i18n"
)

// Nhóm test này giữ vòng khứ hồi của bản .txt xuất ra: dòng tiêu đề mà renderTXT
// TỰ SINH phải được chính bộ nhận dạng của package này nhận lại.
//
// Vì sao đây là chỗ dễ vỡ nhất mà không ai thấy: writer rất hay viết lại tiêu đề
// chương vào dòng đầu thân bài, nên renderTXT gọi stripChapterTitleHeader để bỏ
// dòng trùng. Hai bên phải khớp nhau, nhưng chúng nằm ở hai lớp khác nhau —
// một bên là chuỗi trong catalog dịch, một bên là regex trong code. Dịch tiêu đề
// xuất bản sang dạng regex không bắt ("Hồi 5", "Chương thứ 5") thì bản xuất lặp
// tiêu đề ở MỌI chương, còn regex nới quá tay thì ăn mất đoạn mở đầu của tác giả.
// Cả hai đều không báo lỗi, không có log.
//
// Các test dưới đây cố tình KHÔNG viết cứng chuỗi tiếng Việt: chúng dựng tiêu đề
// từ đúng msgid mà renderTXT dùng. Nhờ vậy đổi bản dịch trong catalog vẫn được
// kiểm, thay vì test khoá cứng một bản dịch rồi đỏ oan khi biên tập lại từ ngữ.

// msgid của ba dòng tiêu đề mà renderTXT sinh ra. Phải khớp từng byte với chuỗi
// trong renderTXT, kể cả 11 dấu cách căn giữa của dòng tập.
const (
	msgidTieuDeTap            = "           第 %d 卷  %s\n"
	msgidTieuDeChuongCoTen    = "第 %d 章  %s\n\n"
	msgidTieuDeChuongKhongTen = "第 %d 章\n\n"
	// Dòng tên sách ở đầu bản xuất. Trước đây viết cứng "《"+name+"》" nên nó không
	// đi qua catalog và tiếng Việt in ra 《Tên sách》.
	msgidTieuDeSach = "《%s》\n\n"
)

// dauToanPhanCJK là dấu câu toàn phần — KHÁC chữ Hán, và đó là điểm mù đã để lỗi
// lọt: 《》 là U+300A/U+300B thuộc khối CJK Symbols and Punctuation, nên
// unicode.Is(unicode.Han, r) trả false. Bài kiểm "không còn dấu vết tiếng Trung"
// bên dưới vì thế từng xanh trong khi dòng đầu bản xuất vẫn là 《Tên sách》.
//
// Không gồm … và · : hai dấu đó dùng hợp lệ trong chữ Việt.
const dauToanPhanCJK = "，。、：；（）！？【】「」『』《》"

func datLocaleXuat(t *testing.T, loc i18n.Locale) {
	t.Helper()
	if err := i18n.SetLocale(loc); err != nil {
		t.Fatalf("SetLocale(%s): %v", loc, err)
	}
	// Trả lại ghim của package (i18n_locale_pin_test.go), không phải DefaultLocale.
	t.Cleanup(func() { _ = i18n.SetLocale(i18n.Chinese) })
}

func coChuHan(s string) bool {
	for _, r := range s {
		if unicode.Is(unicode.Han, r) {
			return true
		}
	}
	return false
}

// TestTieuDeXuatBanDuocNhanLaiOMoiNgonNgu là bài kiểm vòng khứ hồi cốt lõi: lấy
// dòng tiêu đề do renderTXT sinh, đưa lại vào dạng markdown như writer hay viết,
// rồi đòi isChapterTitleLine nhận ra.
func TestTieuDeXuatBanDuocNhanLaiOMoiNgonNgu(t *testing.T) {
	for _, loc := range []i18n.Locale{i18n.Chinese, i18n.Vietnamese} {
		t.Run(string(loc), func(t *testing.T) {
			datLocaleXuat(t, loc)

			coTen := strings.TrimRight(fmt.Sprintf(i18n.F(msgidTieuDeChuongCoTen), 5, "Bến cũ"), "\n")
			khongTen := strings.TrimRight(fmt.Sprintf(i18n.F(msgidTieuDeChuongKhongTen), 5), "\n")

			for _, c := range []struct {
				ten  string
				dong string
			}{
				{"có tên chương", coTen},
				{"không tên chương", khongTen},
			} {
				md := "# " + c.dong
				if !isChapterTitleLine(md, "Bến cũ") {
					t.Errorf("%s: bộ nhận dạng KHÔNG nhận lại tiêu đề do chính renderTXT sinh: %q\n"+
						"→ bản xuất sẽ lặp tiêu đề ở mọi chương", c.ten, md)
				}
			}
		})
	}
}

// TestRenderTXTKhongLapTieuDeKhiThanBaiDaCo: vòng khứ hồi ở mức renderTXT — thân
// bài mở đầu bằng chính dòng tiêu đề của bản xuất thì tiêu đề chỉ được xuất hiện
// một lần.
func TestRenderTXTKhongLapTieuDeKhiThanBaiDaCo(t *testing.T) {
	for _, loc := range []i18n.Locale{i18n.Chinese, i18n.Vietnamese} {
		t.Run(string(loc), func(t *testing.T) {
			datLocaleXuat(t, loc)

			const title = "Bến cũ"
			header := strings.TrimRight(fmt.Sprintf(i18n.F(msgidTieuDeChuongCoTen), 5, title), "\n")
			got := renderTXT("", []int{5}, chapterTitleIndex{5: title}, nil,
				map[int]string{5: "# " + header + "\n\nHắn đứng lặng bên bến."})

			if n := strings.Count(got, header); n != 1 {
				t.Errorf("tiêu đề %q xuất hiện %d lần, phải đúng 1 lần:\n%s", header, n, got)
			}
			if !strings.Contains(got, "Hắn đứng lặng bên bến.") {
				t.Errorf("mất thân bài khi bỏ dòng tiêu đề trùng:\n%s", got)
			}
		})
	}
}

// TestBanXuatTiengVietKhongConDauVetTiengTrung: với dữ liệu vào toàn tiếng Việt,
// bản .txt xuất ra không được còn một chữ Hán nào.
//
// Đây là bài kiểm trực diện cho lỗi đã ghi trong báo cáo soát (mục 7): ba dòng
// tiêu đề của txt.go là chữ mà NGƯỜI ĐỌC CUỐI thấy trong bản xuất, sót tiếng
// Trung ở đó là lỗi hiển nhiên nhất của cả sản phẩm.
func TestBanXuatTiengVietKhongConDauVetTiengTrung(t *testing.T) {
	datLocaleXuat(t, i18n.Vietnamese)

	locs := map[int]chapterLocation{
		1: {VolumeIdx: 1, VolumeTitle: "Khởi nguyên", IsFirstOfVolume: true},
		2: {VolumeIdx: 1, VolumeTitle: "Khởi nguyên"},
	}
	got := renderTXT("Vệt sáng", []int{1, 2},
		chapterTitleIndex{1: "Bến cũ"}, // chương 2 cố tình thiếu tên → đi nhánh dự phòng
		locs,
		map[int]string{1: "Trời chưa sáng.", 2: "Nàng đẩy cửa."})

	if coChuHan(got) {
		t.Errorf("bản xuất tiếng Việt còn chữ Hán:\n%s", got)
	}
	// Dấu câu toàn phần cũng là dấu vết tiếng Trung, và phép kiểm chữ Hán ở trên
	// KHÔNG thấy chúng. Bỏ nhánh này thì dòng tên sách 《…》 lại lọt như trước.
	for _, r := range dauToanPhanCJK {
		if strings.ContainsRune(got, r) {
			t.Errorf("bản xuất tiếng Việt còn dấu toàn phần %q:\n%s", string(r), got)
		}
	}
	// Tên sách phải có mặt, và ở dạng của tiếng Việt.
	if !strings.Contains(got, strings.TrimRight(fmt.Sprintf(i18n.F(msgidTieuDeSach), "Vệt sáng"), "\n")) {
		t.Errorf("bản xuất thiếu dòng tên sách:\n%s", got)
	}
	// Không vacuous: cả ba dòng tiêu đề phải thực sự có mặt trong bản xuất, nếu
	// không thì "sạch chữ Hán" chỉ vì chẳng kết xuất được gì.
	for _, phai := range []string{
		strings.TrimRight(fmt.Sprintf(i18n.F(msgidTieuDeTap), 1, "Khởi nguyên"), "\n"),
		strings.TrimRight(fmt.Sprintf(i18n.F(msgidTieuDeChuongCoTen), 1, "Bến cũ"), "\n"),
		strings.TrimRight(fmt.Sprintf(i18n.F(msgidTieuDeChuongKhongTen), 2), "\n"),
	} {
		if !strings.Contains(got, phai) {
			t.Errorf("bản xuất thiếu dòng tiêu đề %q:\n%s", phai, got)
		}
	}
}

// TestMsgidTieuDeXuatBanConTrongCatalog: ba msgid trên phải tra được ở catalog vi.
// Thiếu một cái là dòng đó âm thầm rơi về tiếng Trung giữa bản xuất tiếng Việt —
// đúng cách lỗi cũ đã lọt qua cả một vòng việt hóa.
func TestMsgidTieuDeXuatBanConTrongCatalog(t *testing.T) {
	datLocaleXuat(t, i18n.Vietnamese)
	for _, msgid := range []string{msgidTieuDeTap, msgidTieuDeChuongCoTen, msgidTieuDeChuongKhongTen, msgidTieuDeSach} {
		if got := i18n.F(msgid); got == msgid {
			t.Errorf("catalog vi chưa dịch %q — dòng tiêu đề bản xuất vẫn là tiếng Trung", msgid)
		}
	}
}
