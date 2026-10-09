package ctxpack

import (
	"context"
	"github.com/huuhoa143/ainovel-studio/internal/i18n"
	"strings"
	"time"

	"github.com/huuhoa143/ainovel-studio/internal/store"
	"github.com/voocel/agentcore"
	corecontext "github.com/voocel/agentcore/context"
)

const storeSummaryStrategyName = "store_summary"

type StoreSummaryCompactConfig struct {
	Store              *store.Store
	KeepRecentTokens   int
	SummaryTokenBudget int
}

type StoreSummaryCompactStrategy struct {
	store              *store.Store
	keepRecentTokens   int
	summaryTokenBudget int
}

func NewStoreSummaryCompact(cfg StoreSummaryCompactConfig) *StoreSummaryCompactStrategy {
	if cfg.KeepRecentTokens <= 0 {
		cfg.KeepRecentTokens = 20000
	}
	if cfg.SummaryTokenBudget <= 0 {
		cfg.SummaryTokenBudget = defaultStoreSummaryBudgetTokens
	}
	return &StoreSummaryCompactStrategy{
		store:              cfg.Store,
		keepRecentTokens:   cfg.KeepRecentTokens,
		summaryTokenBudget: cfg.SummaryTokenBudget,
	}
}

func (s *StoreSummaryCompactStrategy) Name() string { return storeSummaryStrategyName }

func (s *StoreSummaryCompactStrategy) Apply(ctx context.Context, _ []agentcore.AgentMessage, view []agentcore.AgentMessage, budget corecontext.Budget) ([]agentcore.AgentMessage, corecontext.StrategyResult, error) {
	if budget.Window <= 0 || budget.Tokens <= budget.Threshold {
		return view, corecontext.StrategyResult{Name: s.Name()}, nil
	}
	return s.apply(ctx, view, budget)
}

func (s *StoreSummaryCompactStrategy) ForceApply(ctx context.Context, transcript []agentcore.AgentMessage, view []agentcore.AgentMessage, budget corecontext.Budget) ([]agentcore.AgentMessage, corecontext.StrategyResult, error) {
	base := transcript
	if len(base) == 0 {
		base = view
	}
	return s.apply(ctx, base, budget)
}

func (s *StoreSummaryCompactStrategy) apply(_ context.Context, msgs []agentcore.AgentMessage, budget corecontext.Budget) ([]agentcore.AgentMessage, corecontext.StrategyResult, error) {
	if s.store == nil || len(msgs) == 0 {
		return msgs, corecontext.StrategyResult{Name: s.Name()}, nil
	}

	sections, ok, err := buildWriterStoreSummaryText(s.store, s.summaryTokenBudget)
	if err != nil {
		return nil, corecontext.StrategyResult{Name: s.Name()}, err
	}
	if !ok {
		return msgs, corecontext.StrategyResult{Name: s.Name()}, nil
	}

	cut := findCutPoint(msgs, s.keepRecentTokens)
	if cut.FirstKeptIndex <= 0 {
		return msgs, corecontext.StrategyResult{Name: s.Name()}, nil
	}
	// msgid giữ đúng chuỗi cũ (kèm "\n\n") để bản dịch vi sẵn có vẫn ăn.
	summary := strings.TrimRight(i18n.F(storeSummaryPreamble), "\n")
	if task := leadingTask(msgs); task != "" {
		summary += "\n\n" + i18n.F(taskHeading) + task
	}
	summary += "\n\n" + sections

	toKeep := append([]agentcore.AgentMessage(nil), msgs[cut.FirstKeptIndex:]...)
	tokensBefore := corecontext.EstimateTotal(msgs)
	result := make([]agentcore.AgentMessage, 0, 1+len(toKeep))
	result = append(result, corecontext.ContextSummary{
		Summary:      summary,
		TokensBefore: tokensBefore,
		Timestamp:    time.Now(),
	})
	result = append(result, toKeep...)

	tokensAfter := corecontext.EstimateTotal(result)
	if tokensAfter >= tokensBefore {
		return msgs, corecontext.StrategyResult{Name: s.Name()}, nil
	}

	info := &corecontext.SummaryInfo{
		TokensBefore:   tokensBefore,
		TokensAfter:    tokensAfter,
		MessagesBefore: len(msgs),
		MessagesAfter:  len(result),
		CompactedCount: cut.FirstKeptIndex,
		KeptCount:      len(toKeep),
		IsSplitTurn:    cut.IsSplitTurn,
		SummaryLen:     len([]rune(summary)),
		Duration:       time.Millisecond,
	}
	if budget.Tokens > budget.Threshold && tokensAfter > budget.Threshold {
		info.Duration = 2 * time.Millisecond
	}

	return result, corecontext.StrategyResult{
		Applied:     true,
		TokensSaved: max(0, tokensBefore-tokensAfter),
		Name:        s.Name(),
		Info:        info,
	}, nil
}

const (
	storeSummaryPreamble = "以下内容来自小说持久化 store，用于在压缩后恢复写作上下文。\n\n"
	taskHeading          = "## 当前任务\n"
)

// leadingTask 取回协调器下发的任务：首次压缩来自首条 user 消息，之后来自上一份摘要。
// store 摘要与 LLM 摘要（WriterSummaryPrompt）都把"当前任务"作为固定一节，按下一个标题结束。
func leadingTask(msgs []agentcore.AgentMessage) string {
	switch first := msgs[0].(type) {
	case agentcore.Message:
		if first.Role == agentcore.RoleUser {
			return first.TextContent()
		}
	case corecontext.ContextSummary:
		// Tiêu đề dò theo locale: prompt nén đã dịch thì model viết "## Nhiệm vụ hiện tại".
		if _, rest, ok := strings.Cut(first.Summary, i18n.F(taskHeading)); ok {
			task, _, _ := strings.Cut(rest, "\n## ")
			return strings.TrimSpace(task)
		}
	}
	return ""
}

// cutPoint / findCutPoint chép từ agentcore v1.8.3 (context.FindCutPoint). Bản fork còn ở
// agentcore v1.7.13, nơi hàm này chưa có; bản gốc của ainovel-cli dùng thẳng hàm thư viện.
// Khác bản cũ của fork ở đúng một chỗ, và đó là bản sửa: KHÔNG kéo điểm cắt lùi về đầu lượt
// khi cắt giữa lượt. Trong vòng gọi công cụ cả phiên chỉ là một lượt user, nên kéo lùi là về 0
// và nén không bao giờ chạy. Điểm cắt chỉ cần không rơi vào một tin nhắn kết quả công cụ.
type cutPoint struct {
	FirstKeptIndex int
	TurnStartIndex int
	IsSplitTurn    bool
}

func findCutPoint(msgs []agentcore.AgentMessage, keepTokens int) cutPoint {
	cutIndex, accumulated := -1, 0
	for i := len(msgs) - 1; i >= 0; i-- {
		accumulated += corecontext.EstimateTokens(msgs[i])
		if accumulated >= keepTokens {
			cutIndex = i
			break
		}
	}
	for cutIndex > 0 && laVai(msgs[cutIndex], agentcore.RoleTool) {
		cutIndex--
	}
	if cutIndex <= 0 {
		return cutPoint{}
	}
	cut := cutPoint{FirstKeptIndex: cutIndex, TurnStartIndex: -1}
	if laVai(msgs[cutIndex], agentcore.RoleUser) {
		return cut
	}
	for i := cutIndex - 1; i >= 0; i-- {
		if laVai(msgs[i], agentcore.RoleUser) {
			cut.TurnStartIndex, cut.IsSplitTurn = i, true
			break
		}
	}
	return cut
}

func laVai(m agentcore.AgentMessage, role agentcore.Role) bool {
	msg, ok := m.(agentcore.Message)
	return ok && msg.Role == role
}
