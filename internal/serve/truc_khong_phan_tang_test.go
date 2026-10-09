package serve

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestTrucSachKhongPhanTangTraNull chốt hình dạng payload mà bề mặt đã SẬP vì nó.
//
// # Lỗi mà bài kiểm này canh
//
// Với truyện không phân tầng, `timeline.volumes` và `timeline.arcs` là slice nil của Go,
// nên JSON là `null` — KHÔNG phải `[]`. Kiểu TypeScript khai chúng là `LaneBlock[]` không
// cho null, và hệ quả không phải một cảnh báo: `tsc` XANH vì nó tin lời khai, nên
// `blocks.find(...)` được viết mà không ai chặn.
//
// `Canvas` khởi tạo mức xem là `'tap'` rồi gọi `phamViCua(timeline, 'tap')` để BIẾT phạm vi
// có rõ hay không — tức lời gọi xảy ra TRƯỚC phép kiểm `capabilities.layered_outline`.
// `khoiPhamVi(null).find` làm **sập renderer** ở bề mặt Dòng sản xuất, tức đúng chỗ người
// dùng đáp xuống ở URL gốc.
//
// # Vì sao nó sống lâu, và vì sao bài kiểm nằm ở phía Go
//
// Mọi fixture và mọi cuốn đem ra thử đều PHÂN TẦNG. Lỗi lộ ra ở cuốn không phân tầng đầu
// tiên — một cuốn 3 chương tạo từ web, sau khi bốn bề mặt mới đã được soát xong.
//
// Bài kiểm ở phía Go vì đây là khế ước HAI ĐẦU: phía web chỉ an toàn nếu payload đúng hình
// dạng nó khai. Nếu ai đổi Go sang trả `[]` thì bài này đỏ và họ biết phải sửa cả kiểu TS —
// còn nếu chỉ có bài kiểm phía web thì việc Go đổi hình dạng sẽ không ai thấy.
func TestTrucSachKhongPhanTangTraNull(t *testing.T) {
	goc := t.TempDir()
	st := newBook(t, goc, "ngan", nil)
	ghiTho(t, st, "chapters/01.md", "# Chương một\n\nMột dòng văn.\n")

	srv := &server{root: goc}
	rec := httptest.NewRecorder()
	srv.routes().ServeHTTP(rec, httptest.NewRequest("GET", "/api/books/ngan/studio", nil))
	if rec.Code != 200 {
		t.Fatalf("mã %d: %s", rec.Code, rec.Body.String())
	}

	// Đọc THÔ, không giải vào struct: giải vào struct sẽ biến `null` thành nil slice và bài
	// kiểm mất đúng thứ nó đo — sự khác nhau giữa `null` và `[]` trên đường dây.
	var tho map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &tho); err != nil {
		t.Fatalf("giải mã: %v", err)
	}
	var tl map[string]json.RawMessage
	if err := json.Unmarshal(tho["timeline"], &tl); err != nil {
		t.Fatalf("giải timeline: %v", err)
	}

	for _, ten := range []string{"volumes", "arcs"} {
		got := strings.TrimSpace(string(tl[ten]))
		if got != "null" {
			t.Errorf("timeline.%s = %s, muốn `null`.\n"+
				"Nếu đây là thay đổi có chủ ý thì phải sửa cả `Timeline` trong web/lib/types.ts "+
				"(bỏ `| null`), nếu không kiểu TS sẽ nói sai về payload lần nữa.", ten, got)
		}
	}

	// Cờ phải khớp dữ liệu: `layered_outline` suy từ số tập thật, nên nó phải false ở đây.
	// Không có phép kiểm này thì bài trên vẫn xanh với một payload tự mâu thuẫn (cờ true,
	// volumes null) — và đúng ca đó là ca giao diện tin cờ rồi đụng null.
	var cap map[string]any
	if err := json.Unmarshal(tho["capabilities"], &cap); err != nil {
		t.Fatalf("giải capabilities: %v", err)
	}
	if cap["layered_outline"] != false {
		t.Errorf("layered_outline = %v, muốn false cho sách không phân tầng", cap["layered_outline"])
	}
}

// TestSongKhiChuaMoMayTra200 canh việc "engine chưa mở" KHÔNG phải lỗi.
//
// Bản đầu trả 409, và hệ quả đo được: giao diện dò `/live` mỗi 2 giây để biết engine có
// đang hỏi gì không, nên console đầy `Failed to load resource: 409` — 16 lần trong một lượt
// xem. Trình duyệt ghi log đó ở tầng mạng nên giao diện không tắt được; cách duy nhất là
// đừng trả lỗi cho một câu hỏi không sai.
//
// 409 vẫn đúng cho các route HÀNH ĐỘNG (steer/abort trên engine đã đóng là xung đột thật).
func TestSongKhiChuaMoMayTra200(t *testing.T) {
	goc := t.TempDir()
	newBook(t, goc, "sach", nil)
	srv := &server{root: goc, may: boMayThu(t, goc)}

	rec := httptest.NewRecorder()
	srv.routes().ServeHTTP(rec, httptest.NewRequest("GET", "/api/books/sach/live", nil))
	if rec.Code != 200 {
		t.Fatalf("/live khi chưa mở máy trả %d, phải 200 — nó là câu hỏi có câu trả lời "+
			"phủ định hợp lệ:\n%s", rec.Code, rec.Body.String())
	}
	var d map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &d); err != nil {
		t.Fatalf("giải mã: %v", err)
	}
	if d["open"] != false {
		t.Errorf("open = %v, muốn false", d["open"])
	}
	// `asking` phải VẮNG, không phải null-rỗng: giao diện dùng sự hiện diện của nó để mở
	// modal chặn, nên một object rỗng ở đây sẽ mở một modal không có câu hỏi nào.
	if _, co := d["asking"]; co {
		t.Errorf("`asking` không được có khi engine chưa mở: %v", d)
	}

	// Đối chứng: route HÀNH ĐỘNG vẫn phải 409, nếu không bài trên xanh cùng với một bản sửa
	// làm mọi thứ trả 200.
	rec = httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/books/sach/abort", strings.NewReader("{}"))
	r.Host = "127.0.0.1:8420"
	r.Header.Set(tenHeaderRao, "1")
	srv.routes().ServeHTTP(rec, r)
	if rec.Code != 409 {
		t.Errorf("/abort khi chưa mở máy trả %d, phải 409 (xung đột thật)", rec.Code)
	}
}
