package host

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/voocel/agentcore"
)

func testObserver(events *[]Event) *observer {
	return &observer{
		emitEv: func(ev Event) {
			*events = append(*events, ev)
		},
		emitD:               func(string) {},
		emitC:               func() {},
		agents:              make(map[string]*agentState),
		lastThinkingByAgent: make(map[string]string),
		dispatchStarts:      make(map[string]*activeCall),
		toolStarts:          make(map[string]*activeCall),
		streamExtractors:    make(map[string]*agentExtractor),
		streamArgPrefixes:   make(map[string]string),
		streamArgLabels:     make(map[string]string),
		retryEvents:         make(map[string]string),
	}
}

func TestObserverSubagentRetryEventsUpdateSameLinePerAgent(t *testing.T) {
	var events []Event
	o := testObserver(&events)

	for i := 1; i <= 2; i++ {
		o.handleToolUpdate(agentcore.Event{
			Type: agentcore.EventToolExecUpdate,
			Progress: &agentcore.ProgressPayload{
				Kind:       agentcore.ProgressRetry,
				Agent:      "writer",
				Attempt:    i,
				MaxRetries: 7,
				Message:    "stream read error: INTERNAL_ERROR; received from peer [network, openai]",
				Meta:       json.RawMessage(`{"retry_delay_ms":2000}`),
			},
		})
	}

	if len(events) != 2 {
		t.Fatalf("events = %d, want 2 raw update events", len(events))
	}
	if events[0].ID == "" || events[1].ID != events[0].ID {
		t.Fatalf("writer retry events should share ID: %+v", events)
	}
	// Summary 不嵌静态延时（UI 依 RetryAt 倒计时）；延时以截止时刻形式携带，静态快照留在 Detail 供日志。
	if events[1].Agent != "writer" || !strings.Contains(events[1].Summary, "重试 (2/7)") {
		t.Fatalf("event = %+v, want writer retry 2/7 without inline delay", events[1])
	}
	if events[1].RetryAt.IsZero() || !strings.Contains(events[1].Detail, "重试 (2/7，2s后)") {
		t.Fatalf("event = %+v, want RetryAt deadline + static delay in Detail", events[1])
	}
	if events[1].Kind != "network" {
		t.Fatalf("event kind = %q, want network", events[1].Kind)
	}
}

func TestRetryProgressDelayRequiresReportedDelay(t *testing.T) {
	p := &agentcore.ProgressPayload{Attempt: 3, MaxRetries: 7}
	if got := retryProgressDelay(p); got != 0 {
		t.Fatalf("unreported delay = %s, want 0", got)
	}
	p.Meta = json.RawMessage(`{"retry_delay_ms":4500}`)
	if got := retryProgressDelay(p); got.String() != "4.5s" {
		t.Fatalf("reported delay = %s, want 4.5s", got)
	}
}

func TestErrorKindFromFlattenedMessage(t *testing.T) {
	tests := []struct {
		message string
		want    string
	}{
		{message: "tool argument validation failed: invalid JSON", want: "tool_validation"},
		{message: "bad_response_status_code: Too many concurrent requests [provider, HTTP 500, openai]", want: "overloaded"},
	}
	for _, tt := range tests {
		if got := errorKind(nil, tt.message); got != tt.want {
			t.Fatalf("errorKind(%q) = %q, want %q", tt.message, got, tt.want)
		}
	}
}

func TestObserverSubagentToolDeltaUpdatesSaveFoundationType(t *testing.T) {
	var events []Event
	o := testObserver(&events)

	o.handleSubagentDelta(&agentcore.ProgressPayload{
		Kind:      agentcore.ProgressToolDelta,
		Agent:     "architect_long",
		Tool:      "save_foundation",
		DeltaKind: agentcore.DeltaToolCall,
		Delta:     `{"type":"premise","content":"# 书名`,
	})

	if len(events) < 2 {
		t.Fatalf("events = %d, want start + summary update", len(events))
	}
	if events[0].Category != "TOOL" || events[0].Summary != "save_foundation" || events[0].Depth != 1 {
		t.Fatalf("start event = %+v", events[0])
	}
	if events[1].ID != events[0].ID || events[1].Summary != "save_foundation[premise]" {
		t.Fatalf("summary update = %+v, start = %+v", events[1], events[0])
	}
}

func TestObserverSubagentToolDeltaUpdatesSaveFoundationTypeAcrossChunks(t *testing.T) {
	var events []Event
	o := testObserver(&events)

	for _, delta := range []string{`{"ty`, `pe":"premise","content":"# 书名`} {
		o.handleSubagentDelta(&agentcore.ProgressPayload{
			Kind:      agentcore.ProgressToolDelta,
			Agent:     "architect_long",
			Tool:      "save_foundation",
			DeltaKind: agentcore.DeltaToolCall,
			Delta:     delta,
		})
	}

	var summaries []string
	for _, ev := range events {
		summaries = append(summaries, ev.Summary)
	}
	if !strings.Contains(strings.Join(summaries, "\n"), "save_foundation[premise]") {
		t.Fatalf("summaries = %v, want save_foundation[premise]", summaries)
	}
}
