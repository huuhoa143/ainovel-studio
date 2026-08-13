package imp

import (
	"errors"
	"strings"
	"testing"
	"unicode/utf8"

	"golang.org/x/text/encoding/simplifiedchinese"

	"github.com/huuhoa143/ainovel-studio/internal/i18n"
)

const zhSourceSample = "第三章 风起青云\n\n他不是愤怒，而是恐惧。沉默了几息，她眼中闪过慌乱，心头一紧。" +
	"夜色沉沉，远处传来钟声。少年握紧手中长剑，一步步走向山门深处。"

// viLegacySource là file tiếng Việt bảng mã 8-bit (Windows-1258/TCVN3).
func viLegacySource() []byte {
	return []byte("Ch\xf0\xf4ng 3: Gi\xf3 n\xf5i Thanh V\xe2n\r\n\r\n" +
		"H\xe1n kh\xf4ng ph\xe3i t\xf9c gi\xe2n, m\xe0 l\xe0 s\xf5 h\xe3i. " +
		"Trong nh\xe1y m\xe1t, c\xe3 gian ph\xf2ng t\xf4i s\xe2m. " +
		"\xd0\xeam \xe2y h\xe1n ng\xf2i r\xe2t l\xe2u b\xean b\xe2c c\xf5a. ")
}

// zeroFFFDSource là ca mà hàng rào U+FFFD hiện tại MÙ HOÀN TOÀN: GB18030 giải mã
// không sinh một U+FFFD nào, kết quả là UTF-8 hợp lệ, nhưng nội dung là rác
// (hanRatio = 0,023). Đây là lý do phải đổi tiêu chí từ "có U+FFFD không" sang
// "kết quả có thật sự giống tiếng Trung không".
const zeroFFFDSource = "pcyk hyr byr blcf ctx xdbf yvbf\xd3n lmcyh kbp gmmnd gbrgy"

func TestDecodeSourceAcceptsRealGB18030(t *testing.T) {
	gbk, err := simplifiedchinese.GB18030.NewEncoder().Bytes([]byte(zhSourceSample))
	if err != nil {
		t.Fatalf("encode: %v", err)
	}
	dec, err := decodeSource(gbk)
	if err != nil {
		t.Fatalf("truyện Trung GBK thật phải nhập được, lại lỗi: %v", err)
	}
	if dec.encoding != encodingGB18030 {
		t.Errorf("encoding = %q, muốn %q", dec.encoding, encodingGB18030)
	}
	if dec.text != zhSourceSample {
		t.Errorf("nội dung sai:\ncó   %q\nmuốn %q", dec.text, zhSourceSample)
	}
}

// TestDecodeSourceRejectsVietnameseLegacyEncoding chốt hành vi mới: file tiếng
// Việt sai bảng mã phải FAIL RÕ RÀNG, không được "decode thành công" ra chữ Hán
// vô nghĩa rồi đi tiếp vào pipeline phân tích/segment.
func TestDecodeSourceRejectsVietnameseLegacyEncoding(t *testing.T) {
	_, err := decodeSource(viLegacySource())
	if err == nil {
		t.Fatal("file tiếng Việt sai bảng mã phải bị từ chối, không được nhận lặng lẽ")
	}
	if !errors.Is(err, ErrEncodingUnreliable) {
		t.Errorf("lỗi phải bọc ErrEncodingUnreliable để chỗ gọi phân loại được, có %v", err)
	}
}

// TestThongBaoSaiBangMaDichTronVen chốt rằng thông báo dài nhất của decodeSource
// được dịch TRỌN VẸN, không còn mảnh tiếng Trung nào.
//
// Ca này sinh ra từ một lỗi thật: ba mảnh của thông báo được nối TRƯỚC rồi mới
// bọc một lần bằng i18n.F ở ngoài cùng. Đối số của F khi đó là chuỗi ghép lúc
// chạy (mảnh đầu tiếng Trung + hai mảnh đã dịch), nên khóa tra cứu không thể có
// trong catalog, F trả nguyên đối số, và người dùng nhận một câu nửa Trung nửa
// Việt. Cả ba msgid đều đã có bản dịch — nên mọi phép đo dựa trên catalog đều báo
// "đã phủ". Chỉ khẳng định trên CHUỖI ĐẦU RA mới thấy được lớp lỗi này.
//
// Kiểm trên toàn dải chữ Hán thay vì so đúng một câu: so nguyên văn thì mỗi lần
// biên tập lại bản dịch là một lần phải sửa test, và test hay bị sửa thành test bị tắt.
func TestThongBaoSaiBangMaDichTronVen(t *testing.T) {
	// Hoàn nguyên về locale ĐANG hoạt động, không phải DefaultLocale: package này
	// được i18n_locale_pin_test.go ghim về zh, nên trả về vi sẽ phá ghim cho mọi
	// test chạy sau (đã làm đỏ 3 test khi thử cách kia). Ca này là ngoại lệ có chủ
	// ý của cái ghim đó — chính comment của ghim nói nó KHÔNG kiểm đường tiếng Việt
	// trong imp, và đây đúng là chỗ trống đó.
	truoc := i18n.Active()
	t.Cleanup(func() { _ = i18n.SetLocale(truoc) })
	if err := i18n.SetLocale(i18n.Vietnamese); err != nil {
		t.Fatalf("SetLocale: %v", err)
	}

	// Dùng zeroFFFDSource, KHÔNG dùng viLegacySource: file 8-bit tiếng Việt dừng
	// sớm ở hàng rào U+FFFD (thông báo một mảnh), nên nó không đi qua nhánh ghép
	// ba mảnh. Chính khẳng định tiền đề dưới đây đã phát hiện việc chọn sai fixture.
	_, err := decodeSource([]byte(zeroFFFDSource))
	if err == nil {
		t.Fatal("tiền đề sai: rác không U+FFFD phải bị từ chối")
	}
	msg := err.Error()

	// Tiền đề: phải là đúng nhánh "giải mã được nhưng không giống tiếng Trung",
	// nhánh duy nhất ghép ba mảnh. Các nhánh khác chỉ có một mảnh nên không chứng
	// minh được gì.
	if !strings.Contains(msg, "%") && !strings.Contains(msg, "iconv") {
		t.Fatalf("tiền đề sai: không phải nhánh thông báo ba mảnh\n  có: %s", msg)
	}

	for _, r := range msg {
		if (r >= 0x3400 && r <= 0x4DBF) || (r >= 0x4E00 && r <= 0x9FFF) {
			t.Errorf("thông báo còn chữ Hán %q — một mảnh không đi qua i18n.F (rất có thể do bọc LỒNG: F ngoài tra khóa do F trong sinh ra)\n  thông báo: %s",
				r, msg)
			break
		}
	}
}

// TestDecodeSourceRejectsZeroFFFDGarbage là ca chứng minh hàng rào cũ không đủ:
// không có U+FFFD nào nên hàng rào cũ cho qua, còn tiêu chí "có giống tiếng Trung
// không" thì chặn được.
func TestDecodeSourceRejectsZeroFFFDGarbage(t *testing.T) {
	raw := []byte(zeroFFFDSource)

	// Chốt tiền đề của ca test: GB18030 thật sự giải mã "thành công", UTF-8 hợp lệ,
	// và KHÔNG có U+FFFD. Nếu một ngày điều này không còn đúng thì ca test mất ý
	// nghĩa và phải dựng lại, chứ không được lặng lẽ xanh.
	out, decErr := simplifiedchinese.GB18030.NewDecoder().Bytes(raw)
	if decErr != nil {
		t.Fatalf("tiền đề sai: GB18030 phải decode thành công, lại lỗi %v", decErr)
	}
	for _, r := range string(out) {
		if r == utf8.RuneError {
			t.Fatal("tiền đề sai: ca này phải KHÔNG có U+FFFD mới chứng minh được hàng rào cũ mù")
		}
	}

	if _, err := decodeSource(raw); !errors.Is(err, ErrEncodingUnreliable) {
		t.Errorf("rác không U+FFFD phải bị chặn, có err = %v", err)
	}
}

func TestDecodeSourceUTF8Paths(t *testing.T) {
	const s = "Chương 3: Gió nổi\nHắn không đáp."

	dec, err := decodeSource([]byte(s))
	if err != nil {
		t.Fatalf("UTF-8 thuần: %v", err)
	}
	if dec.text != s || dec.encoding != encodingUTF8 {
		t.Errorf("UTF-8 thuần: text=%q encoding=%q", dec.text, dec.encoding)
	}

	dec, err = decodeSource(append(append([]byte{}, utf8BOM...), []byte(s)...))
	if err != nil {
		t.Fatalf("UTF-8 BOM: %v", err)
	}
	if dec.text != s || dec.encoding != encodingUTF8BOM {
		t.Errorf("UTF-8 BOM: text=%q encoding=%q", dec.text, dec.encoding)
	}
}
