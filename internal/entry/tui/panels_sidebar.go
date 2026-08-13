package tui

import (
	"fmt"
	"slices"
	"sort"
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/x/ansi"
	"github.com/huuhoa143/ainovel-studio/internal/host"
	"github.com/huuhoa143/ainovel-studio/internal/i18n"
)

// renderStateContent 生成状态侧栏的纯内容(不含边框/外框)，供 stateVP.SetContent 使用。
func renderStateContent(snap host.UISnapshot, contentW int) string {
	contentW = max(12, contentW)
	agents := sidebarAgents(snap.Agents)
	idleAgents := sidebarIdleAgents(snap.Agents)
	var sections []string

	if snap.RecoveryLabel != "" {
		sections = append(sections, lipgloss.NewStyle().Foreground(colorMuted).Italic(true).
			Render(truncate(snap.RecoveryLabel, contentW)))
	}

	var overview strings.Builder
	overview.WriteString(renderField(i18n.F("运行态"), snapshotRuntimeStateLabel(snap.RuntimeState)))
	overview.WriteString(renderField(i18n.F("阶段"), snapshotPhaseLabel(snap.Phase)))
	overview.WriteString(renderField(i18n.F("流程"), snapshotFlowLabel(snap.Flow)))
	if snap.AdvanceMode == "review" {
		advance := i18n.F("逐章验收")
		if snap.AdvancePermitChapter > 0 {
			advance = fmt.Sprintf(i18n.F("已放行第 %d 章"), snap.AdvancePermitChapter)
		}
		overview.WriteString(renderField(i18n.F("推进"), advance))
	} else if snap.AdvanceMode == "auto" {
		overview.WriteString(renderField(i18n.F("推进"), i18n.F("自动")))
	}
	if snap.Layered {
		overview.WriteString(renderField(i18n.F("已完成"), fmt.Sprintf(i18n.F("%d 章"), snap.CompletedCount)))
		// 分层动态规划：右栏只展示当前弧已展开的章节，"已规划"也用同一个口径，
		// 否则会把骨架弧 EstimatedChapters 的粗估算（如 92）混进来，与可见大纲对不上。
		// progress.TotalChapters 那个值仅用于内部 ContextProfile 决策，不要泄漏到 UI。
		if planned := len(snap.Outline); planned > 0 {
			overview.WriteString(renderField(i18n.F("已规划"), fmt.Sprintf(i18n.F("%d 章"), planned)))
		}
	} else {
		switch {
		case snap.TotalChapters > 0:
			overview.WriteString(renderField(i18n.F("进度"), fmt.Sprintf(i18n.F("%d / %d 章"), snap.CompletedCount, snap.TotalChapters)))
		default:
			overview.WriteString(renderField(i18n.F("已完成"), fmt.Sprintf(i18n.F("%d 章"), snap.CompletedCount)))
		}
	}
	overview.WriteString(renderField(i18n.F("字数"), formatNumber(snap.TotalWordCount)))
	if label, ch := inProgressDisplay(snap); label != "" {
		overview.WriteString(renderField(label, fmt.Sprintf(i18n.F("第 %d 章"), ch)))
	}
	if headline := snapshotHeadline(snap); headline != "" {
		label := i18n.F("当前")
		if !snap.IsRunning {
			label = i18n.F("待恢复")
		}
		overview.WriteString(renderHighlightField(label, truncate(headline, sidebarValueBudget(contentW, sidebarValueMaxLines))))
	}
	sections = append(sections, renderSidebarSection(i18n.F("概览"), overview.String(), contentW))

	if len(agents) > 0 {
		var agentBody strings.Builder
		for _, agent := range agents {
			agentBody.WriteString(renderAgentLine(agent, contentW))
			agentBody.WriteString("\n")
		}
		if len(idleAgents) > 0 {
			agentBody.WriteString(lipgloss.NewStyle().Foreground(colorDim).Render(i18n.F("待命: ") + truncate(strings.Join(idleAgents, " · "), max(8, sidebarBodyWidth(contentW)-lipgloss.Width(i18n.F("待命: "))))))
			agentBody.WriteString("\n")
		}
		sections = append(sections, renderSidebarSection(i18n.F("运行角色"), agentBody.String(), contentW))
	}

	if len(snap.PendingRewrites) > 0 {
		var rewrite strings.Builder
		rewrite.WriteString(renderHighlightField(i18n.F("队列"), fmt.Sprintf("%v", snap.PendingRewrites)))
		if snap.RewriteReason != "" {
			rewrite.WriteString(renderField(i18n.F("原因"), truncate(snap.RewriteReason, sidebarValueBudget(contentW, sidebarValueMaxLines))))
		}
		sections = append(sections, renderSidebarSection(i18n.F("返工"), rewrite.String(), contentW))
	}

	if snap.PendingSteer != "" {
		sections = append(sections, renderSidebarSection(i18n.F("干预"),
			renderHighlightField(i18n.F("待处理"), truncate(snap.PendingSteer, sidebarValueBudget(contentW, sidebarValueMaxLines))), contentW))
	}
	if snap.HasAdvanceHold {
		sections = append(sections, renderSidebarSection(i18n.F("验收停靠"),
			renderHighlightField(i18n.F("等待"), truncate(snap.AdvanceHoldReason, sidebarValueBudget(contentW, sidebarValueMaxLines))), contentW))
	}

	if body := renderUsageSidebar(snap, contentW); body != "" {
		sections = append(sections, renderSidebarSection(i18n.F("用量"), body, contentW))
	}

	if body := renderCacheSidebar(snap, contentW); body != "" {
		sections = append(sections, renderSidebarSection(i18n.F("缓存"), body, contentW))
	}

	if body := renderContextSidebar(snap, contentW); body != "" {
		sections = append(sections, renderSidebarSection(i18n.F("上下文"), body, contentW))
	}

	return strings.Join(sections, "\n\n")
}

func renderAgentLine(agent host.AgentSnapshot, width int) string {
	stateColor := taskStatusColor(agent.State)
	icon := lipgloss.NewStyle().Foreground(stateColor).Render(agentStateIcon(agent.State))
	badge := lipgloss.NewStyle().Foreground(stateColor).Render(agentStateLabel(agent.State))
	name := lipgloss.NewStyle().Bold(true).Foreground(bodyTextColor).Render(agentDisplayName(agent.Name))
	line := icon + " " + name + " " + badge

	taskLine := agentTaskLine(agent)
	if taskLine != "" {
		line += "\n" + lipgloss.NewStyle().Foreground(colorDim).Render("  "+truncate(taskLine, max(8, sidebarBodyWidth(width)-2)))
	}

	detail := agent.Summary
	if agent.Tool != "" {
		detail = agent.Tool
	}
	// detail đến từ agent.Summary/agent.Tool do tầng host đặt, nên ta KHÔNG kiểm
	// soát được nó đã đi qua i18n hay chưa. So cả bản dịch lẫn chuỗi nguồn: chỉ
	// so một dạng thì điều kiện chết lặng ở đúng cái locale không khớp, và hậu
	// quả là dòng "chờ lệnh" bị in trùng ngay dưới nhãn trạng thái đã có.
	if agent.State == "idle" && (detail == i18n.F("待命") || detail == "待命") {
		detail = ""
	}
	if detail != "" && detail != taskLine {
		line += "\n" + lipgloss.NewStyle().Foreground(colorMuted).Render("  "+truncate(detail, max(8, sidebarBodyWidth(width)-2)))
	}
	if ctx := agentContextLine(agent); ctx != "" {
		line += "\n" + lipgloss.NewStyle().Foreground(colorDim).Italic(true).Render("  "+truncate(ctx, max(8, sidebarBodyWidth(width)-2)))
	}
	return line
}

// sidebarCardChrome là số cột thẻ tự tiêu ngoài phần thân: viền trái + đệm trái.
const sidebarCardChrome = 2

func renderSidebarSection(title, body string, width int) string {
	body = strings.TrimRight(body, "\n")
	if body == "" {
		return ""
	}
	lineW := max(0, width-lipgloss.Width(title)-1)
	header := panelTitleStyle.Render(title) + " " +
		lipgloss.NewStyle().Foreground(colorDim).Render(strings.Repeat("─", lineW))
	card := lipgloss.NewStyle().
		Border(lipgloss.NormalBorder(), false, false, false, true).
		BorderForeground(colorDim).
		PaddingLeft(1).
		Render(fitSidebarBody(body, width))
	return header + "\n" + card
}

// fitSidebarBody bó thân thẻ về đúng bề rộng thẻ được cấp.
//
// Thẻ tự thêm viền trái + đệm trái (2 cột), nên thân dài đúng `width` làm thẻ rộng
// `width+2` — vượt chỗ viewport có, và viewport CẮT CỨNG phần dôi mà không để lại
// dấu hiệu nào. Trên màn thật, dòng "进度  2 / 300 chương" mất đúng một ký tự và
// hiện thành "2 / 300 chươn": người dùng đọc ra một từ tiếng Việt không tồn tại.
// Lỗi chỉ có ở tiếng Việt vì "2 / 300 章" bên tiếng Trung ngắn hơn nhiều.
//
// Xuống dòng (ansi.Wrap) chứ không cắt: giá trị dài vẫn đọc được trọn, và Wrap
// hiểu chuỗi ANSI nên không làm hỏng màu.
// sidebarBodyWidth là số cột thân thẻ thật sự có, sau khi thẻ ăn viền + đệm.
func sidebarBodyWidth(width int) int {
	return max(1, width-sidebarCardChrome)
}

// sidebarValueWidth là số cột còn lại cho GIÁ TRỊ trên một dòng "nhãn — giá trị":
// thân thẻ trừ cột nhãn và một khoảng trắng phân cách. Trước đây các chỗ gọi tự trừ
// tay hằng 10 (đúng cột nhãn nhưng bỏ quên 2 cột viền+đệm của thẻ), nên giá trị dài
// vẫn dôi ra 2 cột và bị viewport cắt cứng.
func sidebarValueWidth(width int) int {
	return max(8, sidebarBodyWidth(width)-fieldLabelColumn-1)
}

// sidebarValueMaxLines là số dòng tối đa một giá trị sidebar được phép chiếm. 2 là
// mức đủ cho mọi giá trị đo được ở tiếng Việt mà vẫn giữ thẻ gọn.
const sidebarValueMaxLines = 2

// sidebarValueBudget là số cột giá trị được phép chiếm khi cho nó tràn sang tối đa
// maxLines dòng: dòng đầu nằm cạnh nhãn, các dòng sau chỉ mất phần thụt.
//
// Vì sao cần: cắt giá trị theo ĐÚNG MỘT dòng là cách bản cũ giữ sidebar gọn, nhưng
// nhãn tiếng Việt rộng gấp đôi bản Hán nên cột giá trị chỉ còn ~12 cột — "xử lý viết
// lại" (14 cột) bị cắt thành "xử lý v..." dù thẻ còn thừa cả chục dòng trống bên dưới.
// fitSidebarBody giờ đã xuống dòng CÓ THỤT nên tràn dòng là an toàn; cái đáng giữ là
// nội dung, không phải số dòng.
func sidebarValueBudget(width, maxLines int) int {
	budget := sidebarValueWidth(width)
	for i := 1; i < maxLines; i++ {
		budget += max(1, sidebarBodyWidth(width)-lipgloss.Width(sidebarContIndent))
	}
	return budget
}

// sidebarContIndent thụt đầu các dòng TIẾP của một trường bị xuống dòng.
//
// Không có nó thì dòng tiếp bắt đầu ở cột 1 — đúng cột của NHÃN — nên trên màn thật
// "Trạng thái chạy Đã tạm dừng" hiện thành hai dòng "Trạng thái chạy Đã" / "tạm dừng",
// và "tạm dừng" đọc ra như một nhãn mới. Đo được: 9/27 nhãn sidebar vượt cột nhãn 10
// khi dịch sang tiếng Việt (nhãn Hán chỉ 4–8 cột, bản Việt tới 19), nên đây là lớp
// lỗi chung của cả sidebar chứ không phải một hai chỗ lẻ.
const sidebarContIndent = "  "

func fitSidebarBody(body string, width int) string {
	limit := sidebarBodyWidth(width)
	// Ngắt theo bề rộng đã trừ phần thụt, để dòng tiếp cộng thụt vào vẫn không vượt
	// limit — vượt là bị viewport cắt cứng, mất chữ không dấu hiệu.
	wrapAt := max(1, limit-lipgloss.Width(sidebarContIndent))
	lines := strings.Split(body, "\n")
	out := make([]string, 0, len(lines))
	for _, line := range lines {
		if lipgloss.Width(line) <= limit {
			out = append(out, line)
			continue
		}
		sub := strings.Split(ansi.Wrap(line, wrapAt, " ·/,"), "\n")
		out = append(out, sub[0])
		for _, cont := range sub[1:] {
			out = append(out, sidebarContIndent+cont)
		}
	}
	return strings.Join(out, "\n")
}

func sidebarAgents(agents []host.AgentSnapshot) []host.AgentSnapshot {
	var out []host.AgentSnapshot
	for _, agent := range agents {
		if agent.State == "idle" {
			continue
		}
		out = append(out, agent)
	}
	if len(out) == 0 {
		out = append(out, agents...)
	}
	sort.SliceStable(out, func(i, j int) bool {
		li, lj := out[i], out[j]
		if agentStateRank(li.State) != agentStateRank(lj.State) {
			return agentStateRank(li.State) < agentStateRank(lj.State)
		}
		return agentOrder(li.Name) < agentOrder(lj.Name)
	})
	return out
}

func sidebarIdleAgents(agents []host.AgentSnapshot) []string {
	var names []string
	hasActive := false
	for _, agent := range agents {
		if agent.State != "idle" {
			hasActive = true
			continue
		}
		names = append(names, agentDisplayName(agent.Name))
	}
	if !hasActive {
		return nil
	}
	sort.Strings(names)
	return names
}

// inProgressDisplay 计算"进行中"字段的标签和章节号。
// 根据 flow 选择动词（打磨/重写/写作）；in_progress_chapter 与 flow 不匹配时视为 stale：
//   - polishing/rewriting 模式下章节不在 pending_rewrites 中 → 回退到队列首章
//   - 字段为 0 时不渲染
func inProgressDisplay(snap host.UISnapshot) (label string, chapter int) {
	ch := snap.InProgressChapter
	switch snap.Flow {
	case "polishing":
		if ch <= 0 || !slices.Contains(snap.PendingRewrites, ch) {
			if len(snap.PendingRewrites) == 0 {
				return "", 0
			}
			ch = snap.PendingRewrites[0]
		}
		return i18n.F("打磨中"), ch
	case "rewriting":
		if ch <= 0 || !slices.Contains(snap.PendingRewrites, ch) {
			if len(snap.PendingRewrites) == 0 {
				return "", 0
			}
			ch = snap.PendingRewrites[0]
		}
		return i18n.F("重写中"), ch
	default:
		if ch <= 0 {
			return "", 0
		}
		return i18n.F("写作中"), ch
	}
}

func snapshotHeadline(snap host.UISnapshot) string {
	if snap.PendingSteer != "" {
		if !snap.IsRunning {
			return i18n.F("待恢复：处理用户干预")
		}
		return i18n.F("等待处理用户干预")
	}
	if len(snap.PendingRewrites) > 0 {
		if !snap.IsRunning {
			return i18n.F("待恢复：返工处理")
		}
		return i18n.F("等待返工处理")
	}
	if snap.AdvanceMode == "review" && !snap.IsRunning && snap.Phase == "writing" {
		return i18n.F("逐章验收：等待放行下一章")
	}
	return ""
}

func snapshotPhaseLabel(phase string) string {
	switch phase {
	case "premise":
		return i18n.F("前提")
	case "outline":
		return i18n.F("大纲")
	case "writing":
		return i18n.F("写作")
	case "complete":
		return i18n.F("完成")
	case "init":
		return i18n.F("初始化")
	default:
		if phase == "" {
			return "-"
		}
		return phase
	}
}

func snapshotRuntimeStateLabel(state string) string {
	switch state {
	case "running":
		return i18n.F("运行中")
	case "pausing":
		return i18n.F("暂停中")
	case "paused":
		return i18n.F("已暂停")
	case "completed":
		return i18n.F("已完成")
	default:
		return i18n.F("空闲")
	}
}

func snapshotFlowLabel(flow string) string {
	switch flow {
	case "":
		return "-"
	case "writing":
		return i18n.F("写作")
	case "reviewing":
		return i18n.F("评审")
	case "rewriting":
		return i18n.F("重写")
	case "polishing":
		return i18n.F("打磨")
	case "steering":
		return i18n.F("干预")
	default:
		return flow
	}
}

func renderUsageSidebar(snap host.UISnapshot, width int) string {
	if snap.TotalInputTokens <= 0 && snap.TotalOutputTokens <= 0 && snap.TotalCostUSD <= 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString(renderField(i18n.F("输入"), formatTokensCompact(snap.TotalInputTokens)))
	b.WriteString(renderField(i18n.F("输出"), formatTokensCompact(snap.TotalOutputTokens)))
	if cost := formatCostUSD(snap.TotalCostUSD); cost != "" {
		b.WriteString(renderField(i18n.F("费用"), cost))
	}
	if saved := formatCostUSD(snap.TotalSavedUSD); saved != "" {
		b.WriteString(renderField(i18n.F("节省"), saved))
	}
	if snap.BudgetLimitUSD > 0 {
		pct := snap.TotalCostUSD / snap.BudgetLimitUSD * 100
		b.WriteString(renderField(i18n.F("预算"), fmt.Sprintf("$%.2f/$%.2f (%.0f%%)", snap.TotalCostUSD, snap.BudgetLimitUSD, pct)))
	}

	agentStats := usageStatsByCost(snap.CachePerAgent)
	if len(agentStats) > 0 {
		b.WriteString(renderUsageGroupHeader(i18n.F("角色"), width))
		limit := min(len(agentStats), 4)
		for i := 0; i < limit; i++ {
			a := agentStats[i]
			b.WriteString(renderUsageLine(agentDisplayName(a.Role), eventAgentColor(a.Role), a.Input, a.Output, a.Cost, width))
			b.WriteString("\n")
		}
	}
	modelStats := usageStatsByCost(snap.CachePerModel)
	if len(modelStats) > 0 {
		b.WriteString(renderUsageGroupHeader(i18n.F("模型"), width))
		limit := min(len(modelStats), 4)
		for i := 0; i < limit; i++ {
			a := modelStats[i]
			b.WriteString(renderUsageLine(modelDisplayName(a.Model), bodyTextColor, a.Input, a.Output, a.Cost, width))
			b.WriteString("\n")
		}
	}
	return b.String()
}

func usageStatsByCost(in []host.AgentCacheStat) []host.AgentCacheStat {
	out := append([]host.AgentCacheStat(nil), in...)
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Cost != out[j].Cost {
			return out[i].Cost > out[j].Cost
		}
		return out[i].Input+out[i].Output > out[j].Input+out[j].Output
	})
	return out
}

func renderUsageGroupHeader(label string, width int) string {
	line := lipgloss.NewStyle().Foreground(colorDim).
		Render(strings.Repeat("·", max(8, width-lipgloss.Width(label)-3)))
	return lipgloss.NewStyle().Foreground(colorMuted).Render(label+" ") + line + "\n"
}

func renderUsageLine(name string, color lipgloss.TerminalColor, input, output int, cost float64, width int) string {
	nameW := 11
	if width < 24 {
		nameW = 8
	}
	nameCell := lipgloss.NewStyle().Foreground(color).Width(nameW).
		Render(truncate(name, nameW))
	tokens := formatTokensCompact(input + output)
	right := tokens
	if costStr := formatCostUSD(cost); costStr != "" {
		right += " · " + costStr
	}
	// 名称恰好占满固定列宽时，padding 不会留下尾随空格；显式分隔，避免
	// "gpt-5.6-sol5.3k" 这类模型名与用量粘连。
	return fitInlineLine(nameCell+" "+lipgloss.NewStyle().Foreground(colorDim).Render(right), width)
}

func modelDisplayName(model string) string {
	model = strings.TrimSpace(model)
	if model == "" {
		return "unknown"
	}
	parts := strings.Split(model, "/")
	if len(parts) >= 3 {
		return strings.Join(parts[1:], "/")
	}
	if len(parts) == 2 {
		return parts[1]
	}
	return model
}

// renderCacheSidebar 渲染左栏"缓存"区块。
//
// 三种态：
//  1. 完全没消费 token：返回空，section 不渲染
//  2. 当前会话所有 role 都跑的是不支持 prompt cache 的模型：仅渲染一行"未启用"提示
//  3. 已启用：顶部"命中率累计/近10 · 节省 · 读/写"+ 分隔 + per-role 行
//
// per-role 行 capable 时显示"累计/近10%"双数字；不 capable 时显示"未启用"。
// 通过累计 vs 近 N 次的对比可以识别"前期拖累"vs"稳态低命中"。
func renderCacheSidebar(snap host.UISnapshot, width int) string {
	// 上游 streaming 没发 OpenAI 的 final usage chunk —— 累计数据全为 0，
	// 但这不是"没启用 cache"也不是"用量太低被门控藏起来"，必须显式提示，
	// 否则用户会一直以为左栏写了缓存代码却显示不出来。优先级最高。
	if snap.MissingAssistantUsage > 0 && snap.TotalInputTokens <= 0 {
		warn := lipgloss.NewStyle().Foreground(colorError).Bold(true).
			Render(fmt.Sprintf(i18n.F("⚠ 上游未返 usage（%d 次）"), snap.MissingAssistantUsage))
		hint := lipgloss.NewStyle().Foreground(colorDim).Italic(true).
			Render(truncate(i18n.F("检查 provider stream_options.include_usage"), max(8, sidebarBodyWidth(width))))
		return warn + "\n" + hint + "\n"
	}

	if snap.TotalInputTokens <= 0 && snap.TotalCacheWriteTokens <= 0 {
		return ""
	}

	// 全程未启用 → 显示一行解释，避免用户误判为"0% 命中需要排查"
	if !snap.OverallCacheCapable && snap.TotalCacheReadTokens == 0 && snap.TotalCacheWriteTokens == 0 {
		return lipgloss.NewStyle().Foreground(colorDim).Italic(true).
			Render(truncate(i18n.F("当前模型未启用 prompt cache"), max(8, sidebarBodyWidth(width)))) + "\n"
	}

	var b strings.Builder

	// 顶部综合指标：累计 + 近 N 各占一行，标签明示，避免 "X% · 近N Y%" 这种
	// 三种分隔符（百分号 / 中点 / 文字）混杂导致语义不清。
	overallHit := cacheHitRate(snap.TotalCacheReadTokens, snap.TotalInputTokens)
	b.WriteString(renderField(i18n.F("累计命中"), colorPercent(overallHit)))
	if snap.OverallRecentSamples > 0 && snap.OverallRecentInput > 0 {
		recent := cacheHitRate(snap.OverallRecentCacheRead, snap.OverallRecentInput)
		b.WriteString(renderField(fmt.Sprintf(i18n.F("近%d命中"), snap.OverallRecentSamples), colorPercent(recent)))
	}

	if savedStr := formatCostUSD(snap.TotalSavedUSD); savedStr != "" {
		b.WriteString(renderField(i18n.F("节省"), savedStr))
	}

	// 读/写量分两行。写量为 0 在 OpenAI / Gemini 系协议是常态——
	// 这两家是自动透明 caching，cache 写入完全免费（首次未命中按正常输入价，
	// 建立 cache 不收任何溢价），所以协议本身不暴露 cache_creation 字段，没必要。
	// 只有 Anthropic / Bedrock 系才报写量，因为他们写要加价（5m +25%/1h +100%），
	// 必须把这个量给用户用于计费。
	b.WriteString(renderField(i18n.F("缓存读量"), formatTokensCompact(snap.TotalCacheReadTokens)))
	if snap.TotalCacheWriteTokens > 0 {
		b.WriteString(renderField(i18n.F("缓存写量"), formatTokensCompact(snap.TotalCacheWriteTokens)))
	} else if snap.TotalCacheReadTokens > 0 {
		hint := lipgloss.NewStyle().Foreground(colorDim).Italic(true).Render(i18n.F("(自动缓存无溢价)"))
		b.WriteString(renderField(i18n.F("缓存写量"), "0 "+hint))
	}

	// 断裂 = 前缀未缩短而命中骤降（合法下降如换章/压缩已豁免）。次数多通常
	// 指向服务端逐出或中转轮询上游，详情看 tui.log 的"缓存链断裂"warn。
	if snap.TotalCacheBreaks > 0 {
		v := lipgloss.NewStyle().Foreground(colorReview).Render(fmt.Sprintf(i18n.F("%d 次"), snap.TotalCacheBreaks))
		b.WriteString(renderField(i18n.F("链路断裂"), v))
	}

	// Arbiter 按设计不参与 prompt cache（KB 级一次性裁定，无稳定前缀可复用），
	// 常驻"未启用"或"0%"只会引人排查；用量面板仍完整记它的账。
	var roles []host.AgentCacheStat
	for _, a := range snap.CachePerAgent {
		if a.Role != "arbiter" {
			roles = append(roles, a)
		}
	}
	if len(roles) > 0 {
		b.WriteString(lipgloss.NewStyle().Foreground(colorDim).
			Render(strings.Repeat("·", max(8, width-12))))
		b.WriteString("\n")
		for _, a := range roles {
			b.WriteString(renderCacheAgentLine(a, width))
			b.WriteString("\n")
		}
	}
	return b.String()
}

// colorPercent 把百分比按命中率分档着色后转字符串，仅用于值列。
func colorPercent(p float64) string {
	return lipgloss.NewStyle().Foreground(cacheHitColor(p)).Bold(true).
		Render(formatPercent(p))
}

// renderCacheAgentLine 渲染单个 role 行：role + 命中率 + 缓存读 / 总输入。
//
// 把分子分母都摆出来（cacheRead / input）让用户一眼就能验算命中率的来源，
// 也能识别"高百分比但小样本"的侥幸数据（比如 100% / 1k 的可信度低于 80% / 300k）。
//
// 百分比优先用滑动窗稳态值；窗内无样本时回落到累计。整个左栏只有这一处用 "/"，
// 语义专一（数学除号：cache 命中量 / 总输入量），不会与其它分隔符混淆。
//
// 三种态：
//
//	未启用     "WRITER        未启用"
//	已启用     "WRITER        85%  · 323k / 394k"
//	无 cache  显式"未启用"，不混进 0/0 干扰判读
func renderCacheAgentLine(a host.AgentCacheStat, width int) string {
	// role 名与"运行角色"区保持完全一致；Width 取 12 让最长的 ARCHITECT
	// 仍能保留 1 列尾随空格做分隔，其它 role 自动右侧填充。
	roleStyle := lipgloss.NewStyle().Foreground(eventAgentColor(a.Role)).Width(12)
	role := roleStyle.Render(agentDisplayName(a.Role))

	if !a.CacheCapable {
		dim := lipgloss.NewStyle().Foreground(colorDim).Italic(true)
		_ = width
		return role + dim.Render(i18n.F("未启用"))
	}

	// 稳态命中率优先；窗内无样本时回落到累计。
	hit := cacheHitRate(a.RecentCacheRead, a.RecentInput)
	if a.RecentSamples == 0 || a.RecentInput == 0 {
		hit = cacheHitRate(a.CacheRead, a.Input)
	}
	// 百分比固定 4 列宽（"100%"），避免读量列在 "5%" 与 "85%" 之间左右跳。
	pctCell := lipgloss.NewStyle().Width(4).
		Render(colorPercent(hit))

	// 累计读 / 累计输入 — 即便上方百分比是滑动窗值，分子分母都用累计，因为
	// "看出规模"才是这一列的主诉求；百分比单独提供稳态信号即可。
	tokens := lipgloss.NewStyle().Foreground(colorDim).Render(
		" · " + formatTokensCompact(a.CacheRead) + " / " + formatTokensCompact(a.Input))
	_ = width
	return role + pctCell + tokens
}

// cacheHitRate 在 input 已含 cacheRead 的语义下直接除得百分比。
// input == 0 时返回 0，避免出现假命中。
func cacheHitRate(cacheRead, input int) float64 {
	if input <= 0 {
		return 0
	}
	return float64(cacheRead) / float64(input) * 100
}

// cacheHitColor 命中率染色：≥50% 绿 / 20–50% 黄 / <20% 红。
// 用与上下文使用率相反的方向：缓存命中率越高越健康。
func cacheHitColor(percent float64) lipgloss.AdaptiveColor {
	switch {
	case percent >= 50:
		return colorSuccess
	case percent >= 20:
		return colorReview
	default:
		return colorError
	}
}

func formatPercent(p float64) string {
	if p <= 0 {
		return "0%"
	}
	if p < 10 {
		return fmt.Sprintf("%.1f%%", p)
	}
	return fmt.Sprintf("%.0f%%", p)
}

// formatTokensCompact 把 token 数渲染成 "8.2k" / "1.4M" 这种紧凑形式。
// 用于狭窄的 per-role 行，避免和 formatNumber 的逗号风格挤出去。
func formatTokensCompact(n int) string {
	if n <= 0 {
		return "0"
	}
	if n >= 1_000_000 {
		return fmt.Sprintf("%.1fM", float64(n)/1_000_000)
	}
	if n >= 1000 {
		return fmt.Sprintf("%.1fk", float64(n)/1000)
	}
	return fmt.Sprintf("%d", n)
}

func renderContextSidebar(snap host.UISnapshot, width int) string {
	if snap.ContextWindow <= 0 && snap.ContextStrategy == "" && snap.ContextScope == "" {
		return ""
	}
	var b strings.Builder
	b.WriteString(renderContextUsageField(i18n.F("主上下文"), snap.ContextPercent, snap.ContextTokens, snap.ContextWindow))
	if strategy := contextStrategyLabel(snap.ContextStrategy); strategy != "" {
		b.WriteString(renderField(i18n.F("最近策略"), truncate(strategy, max(8, width-12))))
	}
	if scope := contextScopeLabel(snap.ContextScope); scope != "" {
		b.WriteString(renderField(i18n.F("当前视图"), scope))
	}
	if snap.ContextSummaryCount > 0 {
		b.WriteString(renderField(i18n.F("摘要"), fmt.Sprintf(i18n.F("%d 条"), snap.ContextSummaryCount)))
	}
	if snap.ContextActiveMessages > 0 {
		b.WriteString(renderField(i18n.F("消息数"), fmt.Sprintf("%d", snap.ContextActiveMessages)))
	}
	if snap.ContextCompactedCount > 0 || snap.ContextKeptCount > 0 {
		b.WriteString(renderField(i18n.F("最近重写"), fmt.Sprintf("%d → %d", snap.ContextCompactedCount, snap.ContextKeptCount)))
	}
	return b.String()
}

func contextScopeLabel(scope string) string {
	switch scope {
	case "baseline":
		return i18n.F("基线")
	case "projected":
		return i18n.F("投影")
	case "recovered":
		return i18n.F("恢复")
	case "committed":
		return i18n.F("已提交")
	case "skipped":
		return i18n.F("熔断跳过")
	default:
		return scope
	}
}

func contextStrategyLabel(strategy string) string {
	switch strategy {
	case "":
		return ""
	case "tool_result_microcompact":
		return i18n.F("工具结果微压缩")
	case "light_trim":
		return i18n.F("轻裁剪")
	case "full_summary":
		return i18n.F("完整摘要")
	default:
		return strategy
	}
}

func agentDisplayName(name string) string {
	return strings.ToUpper(name)
}

func agentTaskLine(agent host.AgentSnapshot) string {
	if agent.TaskKind != "" {
		return taskKindLabel(agent.TaskKind)
	}
	if agent.Summary != "" {
		return agent.Summary
	}
	return ""
}

func agentContextLine(agent host.AgentSnapshot) string {
	ctx := agent.Context
	if ctx.ContextWindow <= 0 || ctx.Tokens <= 0 {
		return ""
	}
	percentColor := contextPercentColor(ctx.Percent)
	percentStr := lipgloss.NewStyle().Foreground(percentColor).Render(fmt.Sprintf("ctx %.0f%%", ctx.Percent))
	parts := []string{percentStr}
	if scope := contextScopeLabel(ctx.Scope); scope != "" {
		parts = append(parts, scope)
	}
	if strategy := contextStrategyLabel(ctx.Strategy); strategy != "" {
		parts = append(parts, strategy)
	}
	return strings.Join(parts, " · ")
}

func agentStateRank(state string) int {
	switch state {
	case "running":
		return 0
	case "failed":
		return 1
	default:
		return 2
	}
}

func agentOrder(name string) int {
	switch {
	case strings.HasPrefix(name, "architect"):
		return 0
	case name == "editor":
		return 2
	case name == "writer":
		return 3
	default:
		return 9
	}
}

func agentStateLabel(state string) string {
	switch state {
	case "running":
		return i18n.F("运行中")
	case "failed":
		return i18n.F("异常")
	case "idle":
		return i18n.F("待命")
	default:
		return state
	}
}

func agentStateIcon(state string) string {
	switch state {
	case "running":
		return "●"
	case "failed":
		return "×"
	default:
		return "·"
	}
}

func taskStatusColor(status string) lipgloss.AdaptiveColor {
	switch status {
	case "running":
		return colorSuccess
	case "queued":
		return colorMuted
	case "failed", "canceled":
		return colorError
	case "succeeded":
		return colorSuccess
	default:
		return colorDim
	}
}

func taskKindLabel(kind string) string {
	switch kind {
	case "foundation_plan":
		return i18n.F("基础规划")
	case "chapter_write":
		return i18n.F("章节写作")
	case "chapter_review":
		return i18n.F("章节评审")
	case "chapter_rewrite":
		return i18n.F("章节重写")
	case "chapter_polish":
		return i18n.F("章节打磨")
	case "arc_expand":
		return i18n.F("弧展开")
	case "volume_append":
		return i18n.F("下一卷规划")
	case "steer_apply":
		return i18n.F("处理干预")
	default:
		return kind
	}
}
