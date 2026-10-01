package serve

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestRaoGhiChanYeuCauLa canh hàng rào chống CSRF sang localhost.
//
// # Vì sao lớp lỗi này đáng một bài kiểm riêng
//
// Studio nghe ở 127.0.0.1 nên trực giác nói "chỉ máy mình gọi được". Sai: MỌI trang web
// đang mở trong trình duyệt đều gọi được tới 127.0.0.1. Khi studio còn chỉ đọc thì thiệt
// hại là rò văn bản; từ khi nó ghi được thì một tab quảng cáo có thể khởi động engine và
// đốt tiền API thật, hoặc thay khóa.
//
// Ba ca chặn dưới đây tương ứng ba đường vào thật:
//   - thiếu header → `<form>` trên trang khác (form HTML không đặt được header tùy ý)
//   - Origin lạ → `fetch` từ trang khác
//   - Host lạ → DNS rebinding (evil.com trỏ về 127.0.0.1, nên hàng rào địa chỉ mù)
func TestRaoGhiChanYeuCauLa(t *testing.T) {
	daGoi := false
	h := raoGhi(func(w http.ResponseWriter, r *http.Request) {
		daGoi = true
		writeJSON(w, map[string]bool{"ok": true})
	})

	for _, c := range []struct {
		ten    string
		host   string
		origin string
		header string
		dat    int
	}{
		{"đủ điều kiện", "127.0.0.1:8420", "http://127.0.0.1:8420", "1", 200},
		{"đủ điều kiện, localhost", "localhost:8420", "http://localhost:8420", "1", 200},
		{"đủ điều kiện, không có Origin", "127.0.0.1:8420", "", "1", 200},
		{"thiếu header rào", "127.0.0.1:8420", "http://127.0.0.1:8420", "", 403},
		{"Origin trang khác", "127.0.0.1:8420", "https://evil.example", "1", 403},
		{"Host lạ — DNS rebinding", "evil.example", "", "1", 403},
		{"Host là IP ngoài", "10.0.0.5:8420", "", "1", 403},
	} {
		t.Run(c.ten, func(t *testing.T) {
			daGoi = false
			r := httptest.NewRequest("POST", "/api/books", strings.NewReader("{}"))
			r.Host = c.host
			if c.origin != "" {
				r.Header.Set("Origin", c.origin)
			}
			if c.header != "" {
				r.Header.Set(tenHeaderRao, c.header)
			}
			rec := httptest.NewRecorder()
			h(rec, r)

			if rec.Code != c.dat {
				t.Errorf("mã %d, muốn %d — thân: %s", rec.Code, c.dat, rec.Body.String())
			}
			if daGoi != (c.dat == 200) {
				t.Errorf("handler %s được gọi, đáng lẽ %v", map[bool]string{true: "ĐÃ", false: "KHÔNG"}[daGoi], c.dat == 200)
			}
		})
	}
}

// TestLaDiaChiCucBo canh hàng rào địa chỉ.
//
// Đây là hàng rào THAY CHO xác thực: người dùng chọn không đặt mật khẩu, nên nếu hàm này
// nhận sai một địa chỉ công khai thì studio phơi cả khóa API lẫn quyền khởi động engine
// ra internet mà không có lớp nào phía sau đỡ.
func TestLaDiaChiCucBo(t *testing.T) {
	for _, c := range []struct {
		addr string
		dat  bool
	}{
		{"127.0.0.1:8420", true},
		{"localhost:8420", true},
		{"[::1]:8420", true},
		{"127.0.0.53:8420", true}, // cả dải 127/8 là loopback
		{"0.0.0.0:8420", false},   // ca nguy hiểm nhất: nghe MỌI giao diện
		{":8420", false},          // dạng viết tắt của 0.0.0.0
		{"192.168.1.10:8420", false},
		// RFC 5737 TEST-NET-3 — dải dành riêng cho tài liệu, không ai định tuyến tới.
		// Cố ý KHÔNG dùng một IP thật của ai: repo này công khai, và một địa chỉ thật nằm
		// trong bảng "không phải loopback" chỉ nói được một điều — máy đó là của người viết.
		{"203.0.113.10:8420", false},
		{"[::]:8420", false},
	} {
		if got := laDiaChiCucBo(c.addr); got != c.dat {
			t.Errorf("laDiaChiCucBo(%q) = %v, muốn %v", c.addr, got, c.dat)
		}
	}
}

// TestCheKhoaKhongLoBiMat canh việc che khóa API.
//
// Khóa ngắn phải che HẾT: để lộ 4 ký tự đầu và 3 cuối của một khóa 10 ký tự là để lộ 7/10.
// Đây là lý do có nhánh `len <= 12`, và nếu ai bỏ nhánh đó thì bài này đỏ.
func TestCheKhoaKhongLoBiMat(t *testing.T) {
	for _, c := range []struct {
		ten string
		vao string
		dat string
	}{
		{"rỗng giữ rỗng", "", ""},
		{"khóa thật", "sk-42c1132b65dba0f2-s8crgv-af9c8802", "sk-4…802"},
		{"ngắn — che hết", "sk-abc123", "•••••••••"},
		{"đúng 12 — che hết", "123456789012", "••••••••••••"},
		{"13 — bắt đầu hé", "1234567890123", "1234…123"},
	} {
		t.Run(c.ten, func(t *testing.T) {
			got := cheKhoa(c.vao)
			if got != c.dat {
				t.Errorf("cheKhoa(%q) = %q, muốn %q", c.vao, got, c.dat)
			}
			// Bất biến quan trọng hơn từng ca: phần giữa của khóa không bao giờ lộ.
			if len(c.vao) > 12 {
				giua := c.vao[4 : len(c.vao)-3]
				if giua != "" && strings.Contains(got, giua) {
					t.Errorf("phần giữa %q còn nằm trong kết quả %q", giua, got)
				}
			}
		})
	}
}

// TestCheDoChiDocKhongMacRouteGhi canh việc tắt đường ghi.
//
// Không đủ nếu chỉ tin vào `laDiaChiCucBo`: hàng rào chỉ có tác dụng nếu `routes()` thật
// sự không mắc nhóm ghi vào mux. Bài này đo ở mức mux, tức đúng chỗ quyết định.
func TestCheDoChiDocKhongMacRouteGhi(t *testing.T) {
	goc := t.TempDir()
	newBook(t, goc, "sach", nil)

	chiDoc := (&server{root: goc, choGhi: false}).routes()
	choGhi := (&server{root: goc, choGhi: true, may: newBoMay(goc)}).routes()

	duongGhi := []struct {
		method, path string
	}{
		{"POST", "/api/books"},
		{"POST", "/api/books/sach/open"},
		{"POST", "/api/books/sach/run"},
		{"POST", "/api/books/sach/steer"},
		{"POST", "/api/books/sach/abort"},
		{"POST", "/api/books/sach/close"},
		{"GET", "/api/books/sach/live"},
		{"GET", "/api/engine"},
		{"POST", "/api/models/try"},
		{"POST", "/api/books/sach/models/apply"},
	}
	for _, d := range duongGhi {
		rec := httptest.NewRecorder()
		chiDoc.ServeHTTP(rec, httptest.NewRequest(d.method, d.path, strings.NewReader("{}")))
		if rec.Code != http.StatusNotFound {
			t.Errorf("chế độ chỉ đọc: %s %s trả %d, phải 404 (route không được tồn tại)",
				d.method, d.path, rec.Code)
		}
	}

	// Đối chứng: cùng những đường đó PHẢI tồn tại khi cho ghi. Không có nửa này thì bài
	// kiểm trên vẫn xanh với một `routes()` gõ sai đường dẫn.
	for _, d := range duongGhi {
		rec := httptest.NewRecorder()
		r := httptest.NewRequest(d.method, d.path, strings.NewReader("{}"))
		r.Header.Set(tenHeaderRao, "1")
		choGhi.ServeHTTP(rec, r)
		if rec.Code == http.StatusNotFound {
			t.Errorf("chế độ ghi: %s %s vẫn 404 — route chưa được mắc", d.method, d.path)
		}
	}

	// Đường ĐỌC không được bị ảnh hưởng: tắt ghi không phải tắt studio.
	rec := httptest.NewRecorder()
	chiDoc.ServeHTTP(rec, httptest.NewRequest("GET", "/api/workshop", nil))
	if rec.Code != http.StatusOK {
		t.Errorf("chế độ chỉ đọc làm hỏng đường đọc: /api/workshop trả %d", rec.Code)
	}
}

// TestTenSachHopLe canh quy ước tên thư mục tác phẩm.
//
// Chặn dấu tiếng Việt là quyết định có lý do, không phải hạn chế tùy tiện: tên này thành
// đường dẫn trên đĩa, và macOS lưu dạng NFD còn Linux dạng NFC — cùng một tên người dùng
// gõ sẽ thành HAI thư mục khác nhau khi đồng bộ hoặc chuyển máy.
func TestTenSachHopLe(t *testing.T) {
	for _, c := range []struct {
		ten string
		dat bool
	}{
		{"novel", true},
		{"dau-nuoc-duoi-cau-da", true},
		{"sach_2", true},
		{"a", true},
		{"", false},
		{"Novel", false},                // chữ hoa
		{"dấu-tiếng-việt", false},       // NFC/NFD
		{"../etc", false},               // thoát thư mục
		{"a/b", false},                  // dấu phân cách
		{"-mo-dau-bang-gach", false},    // phải bắt đầu bằng chữ/số
		{strings.Repeat("a", 64), true}, // đúng hạn
		{strings.Repeat("a", 65), false},
	} {
		if got := tenSachHopLe.MatchString(c.ten); got != c.dat {
			t.Errorf("tenSachHopLe(%q) = %v, muốn %v", c.ten, got, c.dat)
		}
	}
}
