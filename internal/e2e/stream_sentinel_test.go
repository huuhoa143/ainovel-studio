package e2e

import (
	"context"
	"strings"
	"testing"

	"github.com/voocel/agentcore"

	"github.com/huuhoa143/ainovel-studio/internal/bootstrap"
)

/*
Dấu kết thúc stream: `finish_reason` là NGỮ NGHĨA, `[DONE]` chỉ là VẬN CHUYỂN.

# Vì sao hai bài này tồn tại

Giá trị của cả bản vá `third_party/litellm` nằm ở bốn dòng, và trước hai bài này không có
gì canh chúng. Một lần đồng bộ lại fork từ upstream sẽ âm thầm gỡ bản vá, engine hỏng lại
đúng như cũ, và không bài kiểm nào đỏ — đúng kiểu hư hại mà repo này canh ở mọi chỗ khác.

Ca hỏng đã đo trên một gateway tương thích OpenAI thật: `grep -c DONE` trên toàn phản hồi
ra 0, byte cuối là `}}}\n\n` rồi đóng kết nối, trong khi chunk trước đó mang
`finish_reason: "stop"` kèm cả `usage`. Bản litellm chưa vá coi đó là stream bị cắt, nên
engine bỏ một lượt sinh HOÀN CHỈNH rồi thử lại bảy lần và không cuốn nào viết nổi chương
đầu.

# Vì sao PHẢI có cả hai bài

Bài đầu một mình sẽ xanh cả khi ai đó "sửa" bằng cách bỏ luôn việc kiểm — và lúc đó một
stream đứt giữa chừng sẽ được nhận như đã xong, tức chốt một chương dở dang vào bản thảo.
Bài thứ hai là thứ giữ cho bản vá là NỚI ĐÚNG MỘT CA chứ không phải tháo cả lớp bảo vệ.
*/

// modelTuFake dựng một ChatModel trỏ vào máy chủ giả, đi qua đúng đường litellm mà engine dùng.
func modelTuFake(t *testing.T, f *fakeLLM) agentcore.ChatModel {
	t.Helper()
	cfg := bootstrap.Config{
		Provider:  "openai",
		ModelName: "fake-vi",
		Providers: map[string]bootstrap.ProviderConfig{
			"openai": {Type: "openai", APIKey: "sk-fake", BaseURL: f.baseURL()},
		},
	}
	cfg.FillDefaults()
	ms, err := bootstrap.NewModelSet(cfg)
	if err != nil {
		t.Fatalf("dựng ModelSet: %v", err)
	}
	return ms.Default
}

// gomStream đọc cạn kênh sự kiện, trả chữ đã gom và lỗi (nếu có).
func gomStream(t *testing.T, m agentcore.ChatModel) (string, error) {
	t.Helper()
	ch, err := m.GenerateStream(context.Background(),
		[]agentcore.Message{{Role: agentcore.RoleUser,
			Content: []agentcore.ContentBlock{agentcore.TextBlock("viết một câu")}}}, nil)
	if err != nil {
		return "", err
	}
	var b strings.Builder
	for ev := range ch {
		switch ev.Type {
		case agentcore.StreamEventTextDelta:
			b.WriteString(ev.Delta)
		case agentcore.StreamEventError:
			return b.String(), ev.Err
		}
	}
	return b.String(), nil
}

func TestStreamThieuSentinelNhungCoFinishReasonThiCoiLaXong(t *testing.T) {
	f := newFakeLLM(t, func(call) reply { return reply{Text: "Đêm ấy mưa không dứt suốt canh giờ Tý."} })
	f.khongSentinel = true

	van, err := gomStream(t, modelTuFake(t, f))
	if err != nil {
		t.Fatalf("stream có finish_reason mà thiếu [DONE] phải coi là XONG, nhưng lỗi: %v", err)
	}
	if !strings.Contains(van, "Đêm ấy mưa") {
		t.Errorf("mất nội dung đã nhận: %q", van)
	}
}

func TestStreamCutGiuaChungThiVANBaoLoi(t *testing.T) {
	f := newFakeLLM(t, func(call) reply { return reply{Text: strings.Repeat("chữ dài ", 200)} })
	f.cutGiuaChung = true

	_, err := gomStream(t, modelTuFake(t, f))
	if err == nil {
		t.Fatal("stream đứt ngang khi CHƯA có finish_reason phải báo lỗi — " +
			"nhận nó là chốt một chương dở dang vào bản thảo")
	}
}
