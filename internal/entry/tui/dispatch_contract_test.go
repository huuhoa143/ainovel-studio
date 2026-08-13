package tui

import (
	"strings"
	"testing"

	"github.com/huuhoa143/ainovel-studio/internal/host"
)

// Summary của sự kiện DISPATCH là HỢP ĐỒNG hai đầu: internal/host sinh ra
// `agent + DispatchTaskOpen + việc + DispatchTaskClose`, còn renderDispatchSummary
// ở đây tách lại để tô tên agent khác màu phần việc.
//
// Trước đây mỗi đầu viết cứng ký tự「（」riêng. Đổi một bên là bên kia thôi tách
// được — và hỏng LẶNG LẼ: dòng vẫn hiện, chỉ mất màu và mất phân biệt tên/việc.
// Không lỗi, không log, không test nào bắt.
//
// Test này dùng CHÍNH hằng của host để dựng chuỗi, nên nếu ai đổi hằng thì cả hai
// đầu đổi theo và test vẫn đúng; còn nếu ai viết cứng ký tự lại ở một đầu thì test
// đỏ ngay.
func TestTachDuocTenAgentTrongSummaryDispatch(t *testing.T) {
	const agent = "writer"
	const task = "Viết chương 3"
	summary := agent + host.DispatchTaskOpen + task + host.DispatchTaskClose

	out := renderDispatchSummary(summary, 80)

	if !strings.Contains(out, task) {
		t.Errorf("mất phần việc khỏi kết quả render:\n  vào : %q\n  ra  : %q", summary, out)
	}
	// Bằng chứng đã TÁCH được: tên agent bị đổi sang nhãn hiển thị (writer →
	// WRITER). Nếu không tách được thì agentName là cả chuỗi summary và nhãn hiển
	// thị không thể xuất hiện ở đầu.
	//
	// KHÔNG chốt theo mã màu ANSI: lipgloss tự tắt màu khi không gắn TTY, nên
	// trong test kết quả là chữ trơn — assert theo màu sẽ đỏ oan dù hành vi đúng.
	want := agentDisplayName(agent)
	if !strings.HasPrefix(out, want) {
		t.Errorf("không tách được tên agent khỏi phần việc:\n  muốn bắt đầu bằng %q\n  được: %q", want, out)
	}
}

// Không được dùng dấu ngoặc toàn phần: mỗi chiếc chiếm 2 cột hiển thị trên
// terminal (ăn 4 cột chỉ để bọc), và sai chính tả trong câu tiếng Việt.
func TestNgoacDispatchKhongPhaiDangToanPhan(t *testing.T) {
	for _, s := range []string{host.DispatchTaskOpen, host.DispatchTaskClose} {
		for _, r := range s {
			if r > 0xFF {
				t.Errorf("hằng %q chứa ký tự rộng %q — dùng dấu ASCII", s, r)
			}
		}
	}
}

// Summary không có dấu bọc (sự kiện không phải DISPATCH kèm việc) thì phải để
// nguyên, không được cắt bừa.
func TestSummaryKhongCoNgoacThiDeNguyen(t *testing.T) {
	out := renderDispatchSummary("editor", 80)
	if want := agentDisplayName("editor"); !strings.Contains(out, want) {
		t.Errorf("summary trơn bị làm méo: muốn chứa %q, được %q", want, out)
	}
}
