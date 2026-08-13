package serve

import (
	"testing"

	"github.com/huuhoa143/ainovel-studio/internal/domain"
)

// TestTransportCoVaiKhongPhuThuocSSE chốt bản sửa một trường ĐƯỢC KHAI mà không ai gán.
//
// # Lỗ
//
// `Transport.Agent` có trong hợp đồng JSON, giao diện đọc nó ở `Transport.tsx:56`
// (`song?.vai ?? transport.agent`), nhưng `buildTransport` gán bảy trường khác và bỏ
// đúng trường này.
//
// `song` đến từ SSE, tức chỉ có khi engine ĐANG chạy VÀ trang đang mở. Nên mở studio
// sau khi engine đã dừng thì ô `tổ` chỉ còn tên model, mất vai — và đó đúng là ca mà
// PRODUCT.md đặt làm ca CHÍNH: "mở studio sau 6 giờ đi vắng và trong vòng 5 giây biết
// được dây chuyền khỏe hay bệnh".
//
// # Vì sao lỗ sống lâu
//
// `cmd/seed-demo` có gieo `Agent` vào sự kiện runtime, nên mọi lượt kiểm bằng fixture
// đều thấy vai hiện ra bình thường. Fixture giàu hơn đường thật là chỗ ẩn lỗi tốt nhất
// — và đây là lần thứ hai trong dự án này một lỗi sống nhờ fixture (lần trước:
// seed-demo chỉ ghi `chapters/` nên bề mặt Đọc trống với mọi chương đã nghiệm thu).
//
// Bài kiểm KHÔNG dựng SSE: nó khẳng định đúng cái ca không có SSE, vì đó là ca vỡ.
func TestTransportCoVaiKhongPhuThuocSSE(t *testing.T) {
	for _, c := range []struct {
		step string
		vai  string
	}{
		{"plan", "writer"},
		{"draft", "writer"},
		{"commit", "writer"},
		{"review", "editor"},
		{"arc_summary", "editor"},
		{"volume_summary", "editor"},
	} {
		t.Run(c.step, func(t *testing.T) {
			st := newBook(t, t.TempDir(), "sach", nil)
			ghiTho(t, st, "chapters/01.md", "Mưa trên cầu cũ.")
			if _, err := st.Checkpoints.AppendArtifact(domain.ChapterScope(1), c.step, "chapters/01.md"); err != nil {
				t.Fatal(err)
			}

			p, err := st.Progress.Load()
			if err != nil {
				t.Fatal(err)
			}
			tr := buildTransport(st, p, st.Checkpoints.All())

			if tr.LastStep != c.step {
				t.Fatalf("last_step = %q, muốn %q", tr.LastStep, c.step)
			}
			if tr.Agent != c.vai {
				t.Errorf("agent = %q, muốn %q — thanh dưới sẽ mất vai khi không có SSE", tr.Agent, c.vai)
			}
		})
	}
}

// TestTransportVaiDungCungBangVoiBangChuong chống hai chỗ trôi lệch.
//
// Thanh dưới và bảng chương đều nói "ai làm bước này". Nếu chúng dùng hai bảng tra thì
// lần đổi bảng đầu tiên là hai chỗ trên CÙNG một màn hình gọi tên hai vai khác nhau cho
// cùng một bước — đúng lớp lỗi mà repo này đã gặp với bản duyệt bị chép hai bản.
func TestTransportVaiDungCungBangVoiBangChuong(t *testing.T) {
	for _, step := range []string{"plan", "draft", "review", "arc_summary"} {
		owners := ownersFromSteps([]string{step})
		if len(owners) == 0 {
			t.Fatalf("ownersFromSteps(%q) rỗng — bảng tra đã lạc", step)
		}
		st := newBook(t, t.TempDir(), "sach", nil)
		ghiTho(t, st, "chapters/01.md", "Mưa trên cầu cũ.")
		if _, err := st.Checkpoints.AppendArtifact(domain.ChapterScope(1), step, "chapters/01.md"); err != nil {
			t.Fatal(err)
		}
		p, _ := st.Progress.Load()
		if got := buildTransport(st, p, st.Checkpoints.All()).Agent; got != owners[0] {
			t.Errorf("bước %q: thanh dưới cho %q, bảng chương cho %q", step, got, owners[0])
		}
	}
}
