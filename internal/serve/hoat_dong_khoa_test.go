package serve

import (
	"testing"

	"github.com/huuhoa143/ainovel-studio/internal/domain"
	"github.com/huuhoa143/ainovel-studio/internal/store"
)

// Checkpoint mới mà không process nào giữ khóa là dấu vết của một phiên ĐÃ chết (ca đo được:
// khởi động lại studio giữa lúc dựng nền), không phải một phiên đang chạy.
func TestActivity_KhongAiGiuKhoaThiKhongDangChay(t *testing.T) {
	st := newBook(t, t.TempDir(), "sach", func(st *store.Store) {
		ghiTho(t, st, "chapters/01.md", "Mưa trên cầu cũ.")
		if _, err := st.Checkpoints.AppendArtifact(domain.ChapterScope(1), "draft", "chapters/01.md"); err != nil {
			t.Fatal(err)
		}
	})
	p, err := st.Progress.Load()
	if err != nil {
		t.Fatal(err)
	}
	cps := st.Checkpoints.All()

	if got := activityOf(st, p, cps); got != "idle" {
		t.Errorf("không ai giữ khóa: activity = %q, muốn idle", got)
	}

	// Vế ngược: có engine sống giữ khóa (ở đây chính process kiểm) thì checkpoint mới vẫn
	// được tin là đang chạy — không được tắt luôn tín hiệu của một lượt CLI đang viết.
	if err := st.Khoa(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.MoKhoa() })
	if got := activityOf(st, p, cps); got != "running" {
		t.Errorf("có người giữ khóa: activity = %q, muốn running", got)
	}
}
