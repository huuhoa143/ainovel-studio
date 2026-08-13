package bootstrap

import (
	"context"
	"errors"
	"testing"

	"github.com/voocel/agentcore"
	"github.com/voocel/agentcore/llm"
	"github.com/huuhoa143/ainovel-studio/internal/llmcontract"
	"github.com/huuhoa143/ainovel-studio/internal/llmretry"
)

/*
MẮT CUỐI của sợi dây "thôi gõ cửa đã khóa".

`internal/llmretry/cholau_test.go` đã chứng minh luật đúng. Nhưng luật đúng mà KHÔNG ĐƯỢC CẮM
thì vẫn hỏng y như cũ, và hỏng âm thầm: `SwappableModel` nhúng `*agentcore.SwappableModel`, nên
gỡ hai phương thức ghi đè đi thì bản nhúng lập tức nhận việc — biên dịch xanh, `go vet` xanh,
mọi bài kiểm của `llmretry` xanh, và Writer lại thử đủ 7 lần.

Đây là loại đứt dây thứ sáu trong dự án này, nên nó được canh riêng.
*/

// mayGia trả đúng một lỗi, ở đường được chọn.
type mayGia struct {
	loi       error
	quaStream bool // true = lỗi đi trong DÒNG SỰ KIỆN, không phải ở giá trị trả về
}

func (m mayGia) Generate(context.Context, []agentcore.Message, []agentcore.ToolSpec, ...agentcore.CallOption) (*agentcore.LLMResponse, error) {
	return nil, m.loi
}

func (m mayGia) GenerateStream(context.Context, []agentcore.Message, []agentcore.ToolSpec, ...agentcore.CallOption) (<-chan agentcore.StreamEvent, error) {
	if !m.quaStream {
		return nil, m.loi
	}
	ch := make(chan agentcore.StreamEvent, 1)
	ch <- agentcore.StreamEvent{Type: agentcore.StreamEventError, Err: m.loi}
	close(ch)
	return ch, nil
}

func (m mayGia) SupportsTools() bool { return true }

// loi429 là câu thật đã đo được trên máy — cùng câu đẻ ra "Thử lại (6/7)".
type loi429 struct{}

func (loi429) Error() string {
	return "[codex/gpt-5.5] [429]: The usage limit has been reached (reset after 13m 16s)"
}
func (loi429) Retryable() bool { return true }

func chanRoi(t *testing.T, err error) {
	t.Helper()
	if err == nil {
		t.Fatal("không có lỗi nào — model giả phải trả lỗi")
	}
	var r agentcore.RetryableError
	if !errors.As(err, &r) || r.Retryable() {
		t.Fatalf("lỗi vẫn khai retryable (%v) — vòng lặp agentcore sẽ gõ đủ 7 lần", err)
	}
}

func TestSwappableModel_GenerateChanChoLau(t *testing.T) {
	m := NewSwappableModel("codex", "gpt-5.5", mayGia{loi: loi429{}}, nil)
	_, err := m.Generate(context.Background(), nil, nil)
	chanRoi(t, err)
}

func TestSwappableModel_GenerateStreamChanLoiTraNgay(t *testing.T) {
	m := NewSwappableModel("codex", "gpt-5.5", mayGia{loi: loi429{}}, nil)
	_, err := m.GenerateStream(context.Background(), nil, nil)
	chanRoi(t, err)
}

// Đường QUAN TRỌNG NHẤT: Writer chạy streaming, và 429 của nó về theo dòng sự kiện.
func TestSwappableModel_GenerateStreamChanLoiTrongDongSuKien(t *testing.T) {
	m := NewSwappableModel("codex", "gpt-5.5", mayGia{loi: loi429{}, quaStream: true}, nil)
	ch, err := m.GenerateStream(context.Background(), nil, nil)
	if err != nil {
		t.Fatalf("không mong lỗi trả ngay: %v", err)
	}
	ev, ok := <-ch
	if !ok {
		t.Fatal("kênh đóng mà không có sự kiện nào")
	}
	if ev.Type != agentcore.StreamEventError {
		t.Fatalf("sự kiện đầu không phải lỗi: %v", ev.Type)
	}
	chanRoi(t, ev.Err)
}

// Lỗi chờ NGẮN phải đi qua nguyên vẹn — chặn nhầm nó là biến một trục trặc vài giây thành một
// lượt tạm dừng cần người vào bấm.
func TestSwappableModel_ChoNganKhongBiChan(t *testing.T) {
	m := NewSwappableModel("codex", "gpt-5.5", mayGia{loi: loiNgan{}}, nil)
	_, err := m.Generate(context.Background(), nil, nil)

	var bo *llmretry.LoiBoCuoc
	if errors.As(err, &bo) {
		t.Fatalf("lỗi chờ 5 giây bị chặn: %v", err)
	}
	var r agentcore.RetryableError
	if !errors.As(err, &r) || !r.Retryable() {
		t.Fatalf("lỗi chờ ngắn phải còn thử lại được, được %v", err)
	}
}

type loiNgan struct{}

func (loiNgan) Error() string   { return "rate limited, try again in 5s" }
func (loiNgan) Retryable() bool { return true }

// Ghi đè KHÔNG được che mất các giao diện năng lực: đó là cả lý do luật được cắm vào kiểu sẵn
// có thay vì bọc một vỏ mới quanh `ForRole`.
func TestSwappableModel_GiuNguyenGiaoDienNangLuc(t *testing.T) {
	var m agentcore.ChatModel = NewSwappableModel("codex", "gpt-5.5", mayGia{loi: loi429{}}, nil)

	if _, ok := m.(interface{ ProviderName() string }); !ok {
		t.Fatal("mất ProviderName")
	}
	if _, ok := m.(interface{ ModelName() string }); !ok {
		t.Fatal("mất ModelName")
	}
	if _, ok := m.(llm.CapabilityProvider); !ok {
		t.Fatal("mất Capabilities — độ suy luận sẽ lặng lẽ rơi về mặc định")
	}
	if _, ok := m.(interface{ Info() llm.ModelInfo }); !ok {
		t.Fatal("mất Info — cửa sổ ngữ cảnh mất nguồn")
	}
	if _, ok := m.(interface {
		StructuredOutputFacts() llmcontract.ModelFacts
	}); !ok {
		t.Fatal("mất StructuredOutputFacts — giao thức đầu ra có cấu trúc sẽ chọn sai")
	}
	if _, ok := m.(interface{ JSONSchemaOverride() *bool }); !ok {
		t.Fatal("mất JSONSchemaOverride")
	}
	if p := m.(interface{ ProviderName() string }).ProviderName(); p != "codex" {
		t.Fatalf("ProviderName = %q, muốn codex", p)
	}
}
