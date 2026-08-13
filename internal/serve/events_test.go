package serve

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/huuhoa143/ainovel-studio/internal/domain"
	"github.com/huuhoa143/ainovel-studio/internal/store"
)

func TestResumeSeq(t *testing.T) {
	cases := []struct {
		name   string
		lastID string
		after  string
		want   int64
	}{
		// Trình duyệt tự gửi Last-Event-ID khi tự kết nối lại; nó phải thắng
		// tham số ?after vì nó phản ánh sự kiện client THẬT SỰ đã nhận.
		{"Last-Event-ID thắng after", "42", "10", 42},
		{"chỉ có after", "", "10", 10},
		{"không có gì thì từ đầu", "", "", 0},
		{"Last-Event-ID rác thì rơi về after", "abc", "7", 7},
		{"số âm bị bỏ qua", "-5", "", 0},
		{"after rác thì từ đầu", "", "xyz", 0},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			r := httptest.NewRequest("GET", "/api/books/x/events?after="+c.after, nil)
			if c.lastID != "" {
				r.Header.Set("Last-Event-ID", c.lastID)
			}
			if got := resumeSeq(r); got != c.want {
				t.Errorf("resumeSeq = %d, muốn %d", got, c.want)
			}
		})
	}
}

// Khung SSE rất dễ sai và sai thì client im lặng không nhận được gì. Test này
// chốt đúng ba thứ: có dòng id (để trình duyệt resume được), có event, và data
// nằm trên MỘT dòng — ký tự xuống dòng thô trong data sẽ bị hiểu là ranh giới
// trường và làm hỏng cả khung.
func TestWriteSSE_KhungDungChuan(t *testing.T) {
	rec := httptest.NewRecorder()
	ok := writeSSE(rec, sseEvent{
		Seq:      47,
		Kind:     "ui_event",
		Category: "TOOL",
		Summary:  "draft_chapter ghi 2.980 từ\ndòng thứ hai",
	})
	if !ok {
		t.Fatal("writeSSE trả false trên writer bình thường")
	}

	out := rec.Body.String()
	if !strings.HasPrefix(out, "id: 47\n") {
		t.Errorf("thiếu dòng id ở đầu — client sẽ không resume được:\n%q", out)
	}
	if !strings.Contains(out, "event: ui_event\n") {
		t.Errorf("thiếu dòng event:\n%q", out)
	}
	if !strings.HasSuffix(out, "\n\n") {
		t.Errorf("khung SSE phải kết bằng dòng trống:\n%q", out)
	}

	// Tách phần data và chốt nó là một dòng duy nhất.
	var dataLines []string
	for _, line := range strings.Split(strings.TrimRight(out, "\n"), "\n") {
		if strings.HasPrefix(line, "data: ") {
			dataLines = append(dataLines, line)
		}
	}
	if len(dataLines) != 1 {
		t.Fatalf("data phải nằm trên đúng 1 dòng, được %d dòng:\n%q", len(dataLines), out)
	}

	// Và nội dung phải giải mã lại được, với dấu tiếng Việt nguyên vẹn.
	var back sseEvent
	if err := json.Unmarshal([]byte(strings.TrimPrefix(dataLines[0], "data: ")), &back); err != nil {
		t.Fatalf("data không phải JSON hợp lệ: %v", err)
	}
	if !strings.Contains(back.Summary, "2.980 từ") {
		t.Errorf("nội dung tiếng Việt bị méo: %q", back.Summary)
	}
	if !strings.Contains(back.Summary, "\n") {
		t.Error("xuống dòng trong nội dung phải được giữ (dạng đã thoát), không bị mất")
	}
}

func TestPump_DayDungPhanMoiVaTraSeqCuoi(t *testing.T) {
	dir := t.TempDir()
	st := store.NewStore(dir)
	if err := st.Init(); err != nil {
		t.Fatalf("init: %v", err)
	}

	for i := 1; i <= 3; i++ {
		if _, err := st.Runtime.AppendQueue(domain.RuntimeQueueItem{
			Time:     time.Now(),
			Kind:     domain.RuntimeQueueUIEvent,
			Priority: domain.RuntimePriorityBackground,
			Category: "TOOL",
			Summary:  "sự kiện",
		}); err != nil {
			t.Fatalf("append: %v", err)
		}
	}

	rec := httptest.NewRecorder()
	last := pump(rec, rec, st, 0)
	if last != 3 {
		t.Errorf("seq cuối = %d, muốn 3", last)
	}
	if n := strings.Count(rec.Body.String(), "id: "); n != 3 {
		t.Errorf("đẩy %d sự kiện, muốn 3", n)
	}

	// Gọi lại với cùng mốc: không được đẩy trùng. Đây là điều kiện để client
	// kết nối lại nhiều lần mà dòng sự kiện không nhân bản.
	rec2 := httptest.NewRecorder()
	if got := pump(rec2, rec2, st, last); got != last {
		t.Errorf("không có gì mới thì seq phải giữ %d, được %d", last, got)
	}
	if body := rec2.Body.String(); body != "" {
		t.Errorf("không được đẩy gì khi không có sự kiện mới, được:\n%q", body)
	}
}

func TestPump_QueueRongKhongLoi(t *testing.T) {
	dir := t.TempDir()
	st := store.NewStore(dir)
	if err := st.Init(); err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	if got := pump(rec, rec, st, 0); got != 0 {
		t.Errorf("queue rỗng phải giữ seq 0, được %d", got)
	}
}
