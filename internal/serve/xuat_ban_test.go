package serve

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/huuhoa143/ainovel-studio/internal/domain"
	"github.com/huuhoa143/ainovel-studio/internal/store"
)

// Xuất bản KHÔNG được đòi engine đang mở.
//
// Xuất là phép đọc, và ca thường gặp nhất là truyện đã xong, mở lại studio hôm sau: engine
// chưa mở, mà truyện đã xong thì thanh dưới không còn nút mở phiên nào. Bản trước trả 409
// "tác phẩm này chưa mở engine" cho đúng nút mà thẻ hoàn thành mời bấm.
func TestXuatBanKhongDoiEngine(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "sach")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	st := store.NewStore(dir)
	if err := st.Init(); err != nil {
		t.Fatal(err)
	}
	if err := st.Progress.Save(&domain.Progress{
		Phase: domain.PhaseComplete, NovelName: "Chậm ba giây",
		TotalChapters: 2, CompletedChapters: []int{1, 2},
	}); err != nil {
		t.Fatal(err)
	}
	for _, n := range []int{1, 2} {
		if err := st.Drafts.SaveFinalChapter(n, "Một đoạn văn của chương."); err != nil {
			t.Fatal(err)
		}
	}

	// `may` là nil-an-toàn ở đây: bài kiểm dựng server KHÔNG có bộ máy nào, tức ca
	// "engine chưa mở" ở dạng cực đoan nhất.
	srv := &server{root: root}
	r := httptest.NewRequest("POST", "/api/books/sach/export?format=txt", nil)
	r.SetPathValue("book", "sach")
	w := httptest.NewRecorder()
	srv.handleXuatBan(w, r)

	if w.Code != http.StatusOK {
		t.Fatalf("mã %d — %s", w.Code, w.Body.String())
	}
	if n := w.Body.Len(); n == 0 {
		t.Fatal("tệp xuất rỗng")
	}
	// Tên tệp là tên TRUYỆN, không phải tên thư mục.
	if cd := w.Header().Get("Content-Disposition"); !strings.Contains(cd, "sach.txt") {
		t.Errorf("Content-Disposition thiếu tên ascii dự phòng: %q", cd)
	}
	if got := w.Header().Get("X-Ainovel-Chapters"); got != "2" {
		t.Errorf("số chương xuất = %q, muốn 2", got)
	}
}

// Chọn EPUB phải ra EPUB. Bản trước viết hoa tham số rồi so với hằng chữ thường,
// nên mọi lần xuất đều rơi về TXT — mã 200, tệp tải về bình thường, sai định dạng.
func TestXuatBanTonTrongDinhDang(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "sach")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	st := store.NewStore(dir)
	if err := st.Init(); err != nil {
		t.Fatal(err)
	}
	if err := st.Progress.Save(&domain.Progress{
		Phase: domain.PhaseComplete, NovelName: "Sách", TotalChapters: 1, CompletedChapters: []int{1},
	}); err != nil {
		t.Fatal(err)
	}
	if err := st.Drafts.SaveFinalChapter(1, "Một đoạn văn."); err != nil {
		t.Fatal(err)
	}

	srv := &server{root: root}
	xuat := func(dinhDang string) *httptest.ResponseRecorder {
		r := httptest.NewRequest("POST", "/api/books/sach/export?format="+dinhDang, nil)
		r.SetPathValue("book", "sach")
		w := httptest.NewRecorder()
		srv.handleXuatBan(w, r)
		if w.Code != http.StatusOK {
			t.Fatalf("%s: mã %d — %s", dinhDang, w.Code, w.Body.String())
		}
		return w
	}

	// Giao diện gửi chữ HOA ("EPUB", theo nhãn trên nút chọn), nên ca này mới là ca thật.
	for _, viet := range []string{"EPUB", "epub"} {
		w := xuat(viet)
		if cd := w.Header().Get("Content-Disposition"); !strings.Contains(cd, ".epub") {
			t.Errorf("%s: tên tệp không phải .epub: %q", viet, cd)
		}
		// EPUB là một zip — bốn byte đầu là "PK\x03\x04".
		if got := w.Body.String(); !strings.HasPrefix(got, "PK") {
			t.Errorf("%s: thân không phải zip của EPUB (đầu %q)", viet, got[:min(4, len(got))])
		}
	}
	if cd := xuat("txt").Header().Get("Content-Disposition"); !strings.Contains(cd, ".txt") {
		t.Errorf("txt: tên tệp sai: %q", cd)
	}
}

// Khoảng chương ngoài phạm vi truyện không được đẻ ra một danh sách "chương bỏ qua" ma.
//
// `exp.Run` duyệt đúng khoảng được giao và xếp mọi chương chưa xong vào Skipped. Đo được:
// "đến chương 99" trên truyện 4 chương cho giao diện in "bỏ qua 96 chương chưa xong
// (4, 5, 6, 7…)" — 96 chương chưa từng được lên kế hoạch.
func TestXuatBanKepKhoangChuong(t *testing.T) {
	dir := t.TempDir()
	st := store.NewStore(dir)
	if err := st.Init(); err != nil {
		t.Fatal(err)
	}
	if err := st.Progress.Save(&domain.Progress{TotalChapters: 4, CompletedChapters: []int{1, 2, 3}}); err != nil {
		t.Fatal(err)
	}

	for _, c := range []struct {
		ten             string
		tu, den         int
		muonTu, muonDen int
	}{
		{"vượt trần thì hiểu là tới hết", 1, 99, 1, 0},
		{"âm thì về 0", -5, -2, 0, 0},
		{"trong phạm vi thì giữ nguyên — chương 4 có kế hoạch, bỏ qua nó là tin THẬT", 2, 4, 2, 4},
		{"không truyền gì thì vẫn là cả truyện", 0, 0, 0, 0},
	} {
		t.Run(c.ten, func(t *testing.T) {
			tu, den := kepKhoangChuong(st, c.tu, c.den)
			if tu != c.muonTu || den != c.muonDen {
				t.Errorf("(%d,%d) → (%d,%d), muốn (%d,%d)", c.tu, c.den, tu, den, c.muonTu, c.muonDen)
			}
		})
	}

	// Không đọc được tiến độ thì giữ nguyên — thà xuất thừa còn hơn từ chối yêu cầu hợp lệ.
	if tu, den := kepKhoangChuong(store.NewStore(t.TempDir()), 1, 99); tu != 1 || den != 99 {
		t.Errorf("không có tiến độ: (%d,%d), muốn giữ nguyên (1,99)", tu, den)
	}
}
