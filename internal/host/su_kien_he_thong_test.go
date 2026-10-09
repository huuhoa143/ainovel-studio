package host

import (
	"testing"

	storepkg "github.com/huuhoa143/ainovel-studio/internal/store"
)

// Sự kiện SYSTEM / ERROR của host và engine phải tới được studio web (runtime queue); sự kiện
// của observer thì không được ghi đôi — observer tự ghi phần của nó.
func TestEmitEvent_HostGhiQueueObserverKhongGhiDoi(t *testing.T) {
	st := storepkg.NewStore(t.TempDir())
	h := &Host{store: st, events: make(chan Event, 8)}
	h.observer = newObserver(st, h.phatSuKien, func(string) {}, func() {})

	h.emitEvent(Event{Category: "SYSTEM", Summary: "Người dùng tạm dừng"})
	h.emitEvent(Event{Category: "TOOL", Summary: "không ghi — loại này observer lo"})
	h.observer.emitEv(Event{Category: "SYSTEM", Summary: "observer phát, chưa ghi"})

	q, err := st.Runtime.LoadQueueAfter(0)
	if err != nil {
		t.Fatal(err)
	}
	if len(q) != 1 || q[0].Summary != "Người dùng tạm dừng" {
		t.Fatalf("queue sai: %+v", q)
	}
}
