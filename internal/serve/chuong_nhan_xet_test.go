package serve

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/huuhoa143/ainovel-studio/internal/domain"
	"github.com/huuhoa143/ainovel-studio/internal/store"
)

// Route /chapter/{n} chỉ được trả nhận xét CỦA CHÍNH chương n.
//
// `buildSelection` cố tình ngã về bản duyệt gần nhất trước đó, và Kiểm định dùng
// cái ngã ấy kèm câu "đang mở nhận xét của chương N". Route này không có chỗ nói
// câu đó: giao diện đọc truyện gắn thẳng verdict thành huy hiệu dưới tiêu đề
// chương. Đo được trên truyện thật — chương 4 chưa viết chữ nào đeo huy hiệu
// xanh "đạt", lấy từ bản duyệt toàn truyện nộp ở chương 3.
func TestChuongChiTraNhanXetCuaChinhNo(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "sach")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	st := store.NewStore(dir)
	if err := st.Init(); err != nil {
		t.Fatal(err)
	}
	if err := st.Progress.Save(&domain.Progress{Phase: domain.PhaseWriting, TotalChapters: 4}); err != nil {
		t.Fatal(err)
	}
	for _, n := range []int{3, 4} {
		if err := st.Drafts.SaveFinalChapter(n, "Một đoạn văn của chương."); err != nil {
			t.Fatal(err)
		}
	}
	// Bản duyệt TOÀN TRUYỆN nộp ở chương 3 — không phải nhận xét của chương 4.
	if err := st.World.SaveReview(domain.ReviewEntry{
		Chapter: 3, Scope: "global", Verdict: "accept", Summary: "ba chương liền mạch",
	}); err != nil {
		t.Fatal(err)
	}

	srv := &server{root: root}
	doc := func(n string) map[string]any {
		r := httptest.NewRequest("GET", "/api/books/sach/chapter/"+n, nil)
		r.SetPathValue("book", "sach")
		r.SetPathValue("n", n)
		w := httptest.NewRecorder()
		srv.handleChapter(w, r)
		if w.Code != http.StatusOK {
			t.Fatalf("chương %s: mã %d — %s", n, w.Code, w.Body.String())
		}
		var m map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &m); err != nil {
			t.Fatal(err)
		}
		return m
	}

	if r := doc("4")["review"]; r != nil {
		t.Errorf("chương 4 không có nhận xét riêng, không được mượn của chương khác: %v", r)
	}
	if r := doc("3")["review"]; r == nil {
		t.Error("chương 3 có nhận xét của chính nó, phải trả về")
	}
}
