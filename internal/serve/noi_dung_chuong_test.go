package serve

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	storepkg "github.com/huuhoa143/ainovel-studio/internal/store"
)

// TestChuongDaChotVanDocDuocToanVan chốt bản sửa lỗi "chương đã nghiệm thu hiện
// chưa có bản thảo".
//
// Cách dựng ca kiểm lấy đúng theo cách lỗi được ĐO ra: ghi chapters/{NN}.md mà
// KHÔNG có drafts/{NN}.draft.md. Đó là trạng thái thật của hai loại chương —
// chương đã chốt, và chương nhập từ nguồn ngoài (host/imp ghi thẳng vào chapters/).
//
// Trước bản sửa, cùng một màn hình hiện hai điều trái nhau: bảng chương ghi
// "● đã nghiệm thu · 2.901 từ" trong khi tab Bản thảo ghi "Chưa có bản thảo cho
// chương này". Không có lỗi nào, không có log nào — chỉ là API đọc sai tệp.
func TestChuongDaChotVanDocDuocToanVan(t *testing.T) {
	const than = "Mưa xuống từ chiều, đến khuya vẫn chưa dứt.\n\nÔng lái đò ngồi im."

	dir := t.TempDir()
	st := storepkg.NewStore(dir)
	if err := st.Init(); err != nil {
		t.Fatal(err)
	}
	if err := st.Drafts.SaveFinalChapter(1, than); err != nil {
		t.Fatal(err)
	}
	// Khẳng định tiền đề của ca kiểm, không giả định nó: không có tệp nháp thì bài
	// kiểm mới đo đúng thứ cần đo.
	if _, err := os.Stat(filepath.Join(dir, "drafts", "01.draft.md")); !os.IsNotExist(err) {
		t.Fatalf("ca kiểm này đòi KHÔNG có tệp nháp, nhưng Stat cho %v", err)
	}

	nd, err := noiDungChuong(st, 1)
	if err != nil {
		t.Fatal(err)
	}
	text, words, nguon := nd.Text, nd.Words, nd.Nguon
	if text == "" {
		t.Fatal("chương đã chốt trả về văn bản rỗng — đúng lỗi mà bản sửa này nhằm vào")
	}
	if !strings.Contains(text, "ông lái đò") && !strings.Contains(text, "Ông lái đò") {
		t.Errorf("văn bản trả về không phải thân chương đã ghi: %q", text)
	}
	if words == 0 {
		t.Error("số từ bằng 0 — bảng chương và tab bản thảo sẽ lại nói khác nhau")
	}
	// Nguồn phải nói ĐÚNG tên: giao diện gắn nhãn "Bản thảo", nên trả bản chốt mà
	// không nói gì là đổi lỗi rỗng lấy lỗi gọi sai tên.
	if nguon != NguonChot {
		t.Errorf("nguồn = %q, phải là %q", nguon, NguonChot)
	}
}

// TestBanNhapThangBanChot giữ đúng thứ tự ưu tiên.
//
// Chương đang được viết lại có CẢ hai tệp: bản chốt của lượt trước và bản nháp
// đang soạn. Người vận hành mở ra để xem lượt viết lại đang tới đâu, nên bản nháp
// phải thắng — trả bản chốt ở đây là hiện một thứ đã cũ mà không ai biết.
func TestBanNhapThangBanChot(t *testing.T) {
	st := storepkg.NewStore(t.TempDir())
	if err := st.Init(); err != nil {
		t.Fatal(err)
	}
	if err := st.Drafts.SaveFinalChapter(1, "Bản chốt của lượt trước."); err != nil {
		t.Fatal(err)
	}
	if err := st.Drafts.SaveDraft(1, "Bản nháp đang viết lại."); err != nil {
		t.Fatal(err)
	}

	nd, err := noiDungChuong(st, 1)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(nd.Text, "đang viết lại") {
		t.Errorf("phải trả bản nháp, được: %q", nd.Text)
	}
	if nd.Nguon != NguonNhap {
		t.Errorf("nguồn = %q, phải là %q", nd.Nguon, NguonNhap)
	}
}

// TestChuongChuaVietTraRong giữ được sự trung thực của trạng thái rỗng.
//
// Cần bài kiểm này vì cả hai bài trên đều xanh với một bản "sửa" trả về chuỗi giả
// nào đó. Chương chưa viết phải rỗng, và nguồn phải rỗng theo — giao diện dựa vào
// đó để nói "chưa có" thay vì hiện một khung trống không giải thích.
func TestChuongChuaVietTraRong(t *testing.T) {
	st := storepkg.NewStore(t.TempDir())
	if err := st.Init(); err != nil {
		t.Fatal(err)
	}

	nd, err := noiDungChuong(st, 7)
	if err != nil {
		t.Fatal(err)
	}
	if nd.Text != "" || nd.Words != 0 || nd.Nguon != "" || nd.TieuDe != "" {
		t.Errorf("chương chưa viết phải rỗng hoàn toàn, được text=%q words=%d nguồn=%q tiêu đề=%q",
			nd.Text, nd.Words, nd.Nguon, nd.TieuDe)
	}
}
