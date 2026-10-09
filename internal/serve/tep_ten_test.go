package serve

import (
	"net/url"
	"strings"
	"testing"
)

// Người dùng tải về một cuốn truyện, nên tên tệp là TÊN TRUYỆN — tên thư mục chỉ là đường lui
// ASCII ở `filename=` cho trình duyệt không hiểu `filename*`.
func TestDauTepXuat_TenTruyenTrongFilenameSao(t *testing.T) {
	cd := dauTepXuat("dong-ho-qua-lac", "Tiếng Vọng Thời Gian Phố Cổ", "txt")
	if !strings.Contains(cd, `filename="dong-ho-qua-lac.txt"`) {
		t.Errorf("filename= phải là tên thư mục ASCII: %s", cd)
	}
	i := strings.Index(cd, "filename*=UTF-8''")
	if i < 0 {
		t.Fatalf("thiếu filename*: %s", cd)
	}
	ten, err := url.PathUnescape(cd[i+len("filename*=UTF-8''"):])
	if err != nil {
		t.Fatal(err)
	}
	if ten != "Tiếng Vọng Thời Gian Phố Cổ.txt" {
		t.Errorf("filename* = %q", ten)
	}
}

func TestDauTepXuat_ChuaCoTenThiDungThuMuc(t *testing.T) {
	cd := dauTepXuat("chay-thu", "  ", "epub")
	if !strings.Contains(cd, "filename*=UTF-8''chay-thu.epub") {
		t.Errorf("chưa có tên truyện thì filename* phải là tên thư mục: %s", cd)
	}
}

func TestTenTepAnToan_BoKyTuCam(t *testing.T) {
	cases := map[string]string{
		`Cửa/đá: "đêm"?`:         "Cửa đá đêm",
		"  Tên\tcó\nxuống dòng ": "Tên có xuống dòng",
		"...Ẩn.":                 "Ẩn",
		`a\b|c*d<e>f`:            "a b c d e f",
	}
	for vao, muon := range cases {
		if got := tenTepAnToan(vao); got != muon {
			t.Errorf("tenTepAnToan(%q) = %q, muốn %q", vao, got, muon)
		}
	}
	if got := tenTepAnToan(strings.Repeat("ạ", 200)); len([]rune(got)) != 120 {
		t.Errorf("phải cắt ở 120 rune, được %d", len([]rune(got)))
	}
}
