package headless

import (
	"context"
	"strings"
	"testing"

	"github.com/huuhoa143/ainovel-studio/internal/i18n"
	"github.com/huuhoa143/ainovel-studio/internal/tools"
)

func TestTerminalAskUserSingleSelect(t *testing.T) {
	handler := newTerminalAskUser(strings.NewReader("2\n"), &strings.Builder{})
	resp, err := handler.handle(context.Background(), []tools.Question{
		{
			Question: "你想要什么风格？",
			Header:   "风格",
			Options: []tools.Option{
				{Label: "热血", Description: "偏升级"},
				{Label: "悬疑", Description: "偏谜团"},
			},
		},
	})
	if err != nil {
		t.Fatalf("handle: %v", err)
	}
	if got := resp.Answers["你想要什么风格？"]; got != "悬疑" {
		t.Fatalf("unexpected answer: %q", got)
	}
}

func TestTerminalAskUserCustomInput(t *testing.T) {
	handler := newTerminalAskUser(strings.NewReader("0\n不要感情线\n"), &strings.Builder{})
	resp, err := handler.handle(context.Background(), []tools.Question{
		{
			Question: "还有什么限制？",
			Header:   "限制",
			Options: []tools.Option{
				{Label: "黑暗", Description: "整体压抑"},
				{Label: "轻松", Description: "基调明快"},
			},
		},
	})
	if err != nil {
		t.Fatalf("handle: %v", err)
	}
	// So qua i18n.F chứ không chốt cứng chữ: giá trị này là nhãn hiển thị (đường
	// sinh ra nó là ask_user.go:90 `return i18n.F("自定义"), ...`), không phải
	// sentinel — đã kiểm không có chỗ nào so sánh với nó, và resp.Answers chỉ chảy
	// vào formatAnswers rồi thành text tự do trong prompt gửi LLM. Chốt cứng chữ
	// làm test đỏ mỗi lần bản dịch đổi, mà chẳng kiểm thêm điều gì.
	if got := resp.Answers["还有什么限制？"]; got != i18n.F("自定义") {
		t.Fatalf("unexpected answer: %q", got)
	}
	if got := resp.Notes["还有什么限制？"]; got != "不要感情线" {
		t.Fatalf("unexpected note: %q", got)
	}
}
