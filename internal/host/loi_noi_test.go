package host

import (
	"strings"
	"testing"

	"github.com/voocel/agentcore"
)

// Lời model tự nói phải nằm trong một lượt riêng có tiêu đề "✻", không được trần như văn truyện;
// khoảng trắng lẻ không mở lượt rỗng; lượt công cụ kế tiếp mở lại từ đầu.
func TestLoiNoi_MoLuotRiengCoTieuDe(t *testing.T) {
	var events []Event
	o := testObserver(&events)
	var ra []string
	o.emitD = func(s string) { ra = append(ra, s) }
	o.emitC = func() { ra = append(ra, "<clear>") }

	text := func(s string) {
		o.handleSubagentDelta(&agentcore.ProgressPayload{Agent: "writer", DeltaKind: agentcore.DeltaText, Delta: s})
	}
	text("\n")
	if len(ra) != 0 {
		t.Fatalf("khoảng trắng mở lượt rỗng: %q", ra)
	}
	text("Let me start ")
	text("by reading.")
	got := strings.Join(ra, "|")
	if !strings.HasPrefix(got, "<clear>|✻ ") || strings.Count(got, "<clear>") != 1 {
		t.Fatalf("lời nói phải mở đúng MỘT lượt có tiêu đề: %q", got)
	}
	o.streamClear() // lượt công cụ kế tiếp
	ra = nil
	text("Again.")
	if strings.Join(ra, "|") == "Again." {
		t.Fatalf("sau một lượt công cụ, lời nói phải mở lượt mới có tiêu đề: %q", ra)
	}
}
