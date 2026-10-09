package host

import (
	"strings"
	"testing"

	"github.com/voocel/agentcore"
)

// Provider KHÔNG stream tham số công cụ: nội dung chương tới nguyên khối trong
// ProgressToolStart. Khung văn sống phải nhận được đúng chữ như đường stream — trước đây nó
// không nhận được gì.
func TestObserverDraftKhongStreamVanLenKhungVan(t *testing.T) {
	var events []Event
	o := testObserver(&events)
	var got strings.Builder
	o.emitD = func(s string) { got.WriteString(s) }
	o.handleToolUpdate(agentcore.Event{Type: agentcore.EventToolExecUpdate, Progress: &agentcore.ProgressPayload{
		Kind: agentcore.ProgressToolStart, Agent: "writer", Tool: "draft_chapter",
		Args: []byte(`{"chapter":1,"content":"Con ngõ nhỏ sâu hun hút trong phố Hàng Quạt."}`),
	}})
	if !strings.Contains(got.String(), "Con ngõ nhỏ sâu hun hút trong phố Hàng Quạt.") {
		t.Fatalf("khung văn sống không nhận nội dung chương, được %q", got.String())
	}
}

// Đường stream đã phát nội dung thì ProgressToolStart tới sau KHÔNG được phát lặp.
func TestObserverDraftDaStreamKhongPhatLap(t *testing.T) {
	var events []Event
	o := testObserver(&events)
	var got strings.Builder
	o.emitD = func(s string) { got.WriteString(s) }
	args := `{"chapter":1,"content":"Một câu duy nhất."}`
	o.handleToolUpdate(agentcore.Event{Type: agentcore.EventToolExecUpdate, Progress: &agentcore.ProgressPayload{
		Kind: agentcore.ProgressToolDelta, Agent: "writer", Tool: "draft_chapter", DeltaKind: agentcore.DeltaToolCall, Delta: args}})
	o.handleToolUpdate(agentcore.Event{Type: agentcore.EventToolExecUpdate, Progress: &agentcore.ProgressPayload{
		Kind: agentcore.ProgressToolStart, Agent: "writer", Tool: "draft_chapter", Args: []byte(args)}})
	if n := strings.Count(got.String(), "Một câu duy nhất."); n != 1 {
		t.Fatalf("nội dung phát %d lần, muốn 1: %q", n, got.String())
	}
}
