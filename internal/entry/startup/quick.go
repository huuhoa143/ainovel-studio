package startup

import (
	"fmt"
	"github.com/huuhoa143/ainovel-studio/internal/i18n"
	"strings"
)

// PrepareQuick 将直接输入整理为可进入 Engine 的快速启动计划。
func PrepareQuick(req Request) (Plan, error) {
	prompt := strings.TrimSpace(req.UserPrompt)
	if prompt == "" {
		return Plan{}, fmt.Errorf("prompt is required")
	}
	return Plan{
		Mode:        ModeQuick,
		DisplayName: i18n.F("快速开始"),
		RawPrompt:   prompt,
	}, nil
}
