package tui

import (
	"errors"
	"github.com/huuhoa143/ainovel-studio/internal/i18n"
	"strings"
	"testing"
)

func TestEnterStartingSwitchesToWorkbenchImmediately(t *testing.T) {
	m := NewModel(nil, nil, "")
	m.width = 120
	m.height = 40
	m.resizeTextarea()
	m.updateViewportSize()

	m.enterStarting("写一本东方玄幻长篇")

	if m.mode != modeRunning {
		t.Fatalf("mode = %v, want modeRunning", m.mode)
	}
	if !m.starting {
		t.Fatal("starting should be true while host startup command is running")
	}
	if !m.snapshot.IsRunning {
		t.Fatal("snapshot should render as running during local startup")
	}
	if got := m.textarea.Placeholder; got != i18n.F("正在初始化创作...") {
		t.Fatalf("placeholder = %q", got)
	}
	if len(m.events) != 2 {
		t.Fatalf("events = %+v, want startup user + system events", m.events)
	}
	if m.events[0].Category != "USER" || !strings.HasPrefix(m.events[0].Summary, i18n.F("创作需求: ")) {
		t.Fatalf("first event = %+v, want USER prompt event", m.events[0])
	}
}

func TestStartupFailureStaysInWorkbench(t *testing.T) {
	m := NewModel(nil, nil, "")
	m.width = 120
	m.height = 40
	m.resizeTextarea()
	m.updateViewportSize()

	m.enterStarting("写一本东方玄幻长篇")

	next, _ := m.handleStartResultMsg(startResultMsg{err: errors.New("模型账户未激活")})
	got := next.(Model)
	if got.mode != modeRunning {
		t.Fatalf("启动失败后 mode = %v, want modeRunning", got.mode)
	}
	if got.starting {
		t.Fatal("启动失败后 starting 应复位")
	}
	if got.snapshot.IsRunning {
		t.Fatal("启动失败后 snapshot 不应仍显示运行中")
	}
	if !strings.Contains(got.textarea.Placeholder, i18n.F("启动失败，请检查模型配置或使用 /model 切换模型")) {
		t.Fatalf("placeholder = %q", got.textarea.Placeholder)
	}
	if len(got.events) == 0 || got.events[len(got.events)-1].Category != "ERROR" {
		t.Fatalf("工作台应保留启动错误事件: %+v", got.events)
	}
}

func TestApplyStartupPromptEventTruncatesSummaryButKeepsDetail(t *testing.T) {
	m := NewModel(nil, nil, "")
	prompt := strings.Repeat("设", maxPromptEventCols+50)

	m.applyStartupPromptEvent(prompt)

	if len(m.events) != 1 {
		t.Fatalf("events = %+v, want one event", m.events)
	}
	ev := m.events[0]
	if ev.Detail != prompt {
		t.Fatalf("detail should keep full prompt, got len=%d want=%d", len([]rune(ev.Detail)), len([]rune(prompt)))
	}
	maxSummaryRunes := len([]rune("创作需求: ")) + maxPromptEventCols
	if got := len([]rune(ev.Summary)); got > maxSummaryRunes {
		t.Fatalf("summary runes = %d, want <= %d", got, maxSummaryRunes)
	}
	if !strings.HasSuffix(ev.Summary, "...") {
		t.Fatalf("summary should be truncated with ellipsis, got %q", ev.Summary)
	}
}
