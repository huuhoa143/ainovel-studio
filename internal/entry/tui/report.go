package tui

import (
	"fmt"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/huuhoa143/ainovel-studio/internal/diag"
	"github.com/huuhoa143/ainovel-studio/internal/i18n"
)

type reportState struct {
	reqID      int
	report     *diag.Report
	exportPath string // 脱敏诊断文件路径，渲染在报告顶部供贴 issue
	exportErr  error
	loading    bool
	renderW    int
	startedAt  time.Time
	finishedAt time.Time
	viewport   viewport.Model
}

func newReportState(width, height int, reqID int, startedAt time.Time) *reportState {
	boxW, boxH := reportModalSize(width, height)
	contentW := paddedModalContentWidth(boxW)
	vp := viewport.New(contentW, boxH-4) // border 2 + padding 2
	state := &reportState{
		reqID:     reqID,
		loading:   true,
		startedAt: startedAt,
		viewport:  vp,
	}
	state.setContent(contentW)
	return state
}

func (s *reportState) load(report diag.Report, contentW int, exportPath string, exportErr error, finishedAt time.Time) {
	s.loading = false
	s.report = &report
	s.exportPath = exportPath
	s.exportErr = exportErr
	s.finishedAt = finishedAt
	s.setContent(contentW)
}

func (s *reportState) setContent(contentW int) {
	s.renderW = contentW
	switch {
	case s.loading:
		s.viewport.SetContent(renderReportLoadingText(contentW, s.startedAt))
	case s.report != nil:
		s.viewport.SetContent(renderReportText(*s.report, contentW, s.exportPath, s.exportErr, s.startedAt, s.finishedAt))
	default:
		s.viewport.SetContent(i18n.F("诊断报告不可用"))
	}
}

func reportModalSize(termW, termH int) (int, int) {
	w := termW * 80 / 100
	if w > 100 {
		w = 100
	}
	if w < 60 {
		w = termW - 4
	}
	h := termH * 85 / 100
	if h < 20 {
		h = termH - 2
	}
	return w, h
}

func renderReportText(report diag.Report, width int, exportPath string, exportErr error, startedAt, finishedAt time.Time) string {
	var b strings.Builder
	st := report.Stats

	// 概览
	titleStyle := lipgloss.NewStyle().Foreground(colorAccent).Bold(true)
	dimStyle := lipgloss.NewStyle().Foreground(colorDim)
	mutedStyle := lipgloss.NewStyle().Foreground(colorMuted)

	// 脱敏诊断已导出 → 引导用户贴 issue
	if exportPath != "" {
		exportStyle := lipgloss.NewStyle().Foreground(colorAccent2)
		b.WriteString(exportStyle.Render(i18n.F("已导出脱敏诊断（可贴到 GitHub issue）")))
		b.WriteString("\n")
		b.WriteString(dimStyle.Render(wrapText(exportPath, width)))
		b.WriteString("\n\n")
	} else if exportErr != nil {
		b.WriteString(lipgloss.NewStyle().Foreground(colorError).Render(i18n.F("脱敏诊断导出失败：") + exportErr.Error()))
		b.WriteString("\n\n")
	}

	b.WriteString(titleStyle.Render(i18n.F("概览")))
	b.WriteString("\n\n")
	b.WriteString(dimStyle.Render(i18n.F("开始 ")))
	b.WriteString(formatReportTime(startedAt))
	if !finishedAt.IsZero() {
		b.WriteString(dimStyle.Render(i18n.F("  完成 ")))
		b.WriteString(formatReportTime(finishedAt))
	}
	b.WriteString("\n\n")

	// 第一行：章节 + 字数
	b.WriteString(mutedStyle.Render(i18n.F("章节 ")))
	b.WriteString(fmt.Sprintf("%d/%d", st.CompletedChapters, st.TotalChapters))
	b.WriteString(mutedStyle.Render(i18n.F("  字数 ")))
	b.WriteString(fmt.Sprintf("%d", st.TotalWords))
	if st.AvgWordsPerCh > 0 {
		b.WriteString(dimStyle.Render(fmt.Sprintf(" (%d/ch)", st.AvgWordsPerCh)))
	}
	b.WriteString(mutedStyle.Render(i18n.F("  阶段 ")))
	b.WriteString(st.Phase)
	if st.Flow != "" && st.Flow != "writing" {
		b.WriteString(mutedStyle.Render("/"))
		b.WriteString(st.Flow)
	}
	b.WriteString("\n")

	// 第二行：评审 + 改写 + 均分
	b.WriteString(mutedStyle.Render(i18n.F("评审 ")))
	b.WriteString(fmt.Sprintf(i18n.F("%d次"), st.ReviewCount))
	if st.RewriteCount > 0 {
		b.WriteString(mutedStyle.Render(i18n.F("  改写 ")))
		b.WriteString(fmt.Sprintf(i18n.F("%d次"), st.RewriteCount))
	}
	if st.AvgReviewScore > 0 {
		b.WriteString(mutedStyle.Render(i18n.F("  均分 ")))
		b.WriteString(fmt.Sprintf("%.1f", st.AvgReviewScore))
	}
	b.WriteString("\n")

	// 第三行：伏笔 + 规划
	if st.ForeshadowOpen > 0 || st.ForeshadowStale > 0 {
		b.WriteString(mutedStyle.Render(i18n.F("伏笔 ")))
		b.WriteString(fmt.Sprintf(i18n.F("打开%d"), st.ForeshadowOpen))
		if st.ForeshadowStale > 0 {
			b.WriteString(lipgloss.NewStyle().Foreground(colorReview).Render(fmt.Sprintf(i18n.F(" 停滞%d"), st.ForeshadowStale)))
		}
		b.WriteString("\n")
	}
	if st.PlanningTier != "" {
		b.WriteString(mutedStyle.Render(i18n.F("规划 ")))
		b.WriteString(st.PlanningTier)
		b.WriteString("\n")
	}

	// 发现
	b.WriteString("\n")
	findings := report.Findings
	if len(findings) == 0 {
		b.WriteString(lipgloss.NewStyle().Foreground(colorSuccess).Render(i18n.F("未发现问题")))
		b.WriteString("\n")
		return b.String()
	}

	criticals, warnings, infos := countSeverities(findings)
	b.WriteString(titleStyle.Render(i18n.F("发现")))
	b.WriteString(" ")
	b.WriteString(dimStyle.Render(formatSeverityCounts(criticals, warnings, infos)))
	b.WriteString("\n")

	for _, f := range findings {
		b.WriteString("\n")
		renderFinding(&b, f, width)
	}

	if len(report.Actions) > 0 {
		b.WriteString("\n")
		b.WriteString(titleStyle.Render(i18n.F("可执行动作")))
		b.WriteString(" ")
		b.WriteString(dimStyle.Render(fmt.Sprintf("(%d)", len(report.Actions))))
		b.WriteString("\n")
		actionStyle := lipgloss.NewStyle().Foreground(colorSuccess)
		for _, a := range report.Actions {
			b.WriteString("\n")
			b.WriteString(actionStyle.Render("[" + string(a.Kind) + "]"))
			b.WriteString(" ")
			b.WriteString(a.Summary)
			b.WriteString("\n")
			if a.Message != "" {
				b.WriteString("  ")
				b.WriteString(mutedStyle.Render(wrapText(a.Message, width-4)))
				b.WriteString("\n")
			}
		}
	}

	return b.String()
}

func renderReportLoadingText(width int, startedAt time.Time) string {
	titleStyle := lipgloss.NewStyle().Foreground(colorAccent).Bold(true)
	bodyStyle := lipgloss.NewStyle().Foreground(colorMuted)
	hintStyle := lipgloss.NewStyle().Foreground(colorDim)

	var b strings.Builder
	b.WriteString(titleStyle.Render(i18n.F("正在生成诊断报告")))
	b.WriteString("\n\n")
	b.WriteString(hintStyle.Render(i18n.F("开始时间 ") + formatReportTime(startedAt)))
	b.WriteString("\n\n")
	b.WriteString(bodyStyle.Render(wrapText(i18n.F("正在读取当前小说 output 产物并分析流程、质量、规划和上下文问题。项目较大时可能需要几秒。"), width)))
	b.WriteString("\n\n")
	b.WriteString(hintStyle.Render(i18n.F("Esc 可先关闭面板，后台分析完成后下次打开会重新生成。")))
	return b.String()
}

func formatReportTime(t time.Time) string {
	if t.IsZero() {
		return "-"
	}
	return t.Format("2006-01-02 15:04:05")
}

func renderFinding(b *strings.Builder, f diag.Finding, width int) {
	var sevStyle lipgloss.Style
	var marker string
	switch f.Severity {
	case diag.SevCritical:
		sevStyle = lipgloss.NewStyle().Foreground(colorError).Bold(true)
		marker = "critical"
	case diag.SevWarning:
		sevStyle = lipgloss.NewStyle().Foreground(colorReview)
		marker = "warning"
	default:
		sevStyle = lipgloss.NewStyle().Foreground(colorDim)
		marker = "info"
	}

	evidenceStyle := lipgloss.NewStyle().Foreground(colorDim)
	suggestionStyle := lipgloss.NewStyle().Foreground(colorAccent2)

	b.WriteString(sevStyle.Render(fmt.Sprintf("[%s]", marker)))
	b.WriteString(" ")
	b.WriteString(f.Title)
	if f.Confidence != "" || f.AutoLevel != "" {
		tagStyle := lipgloss.NewStyle().Foreground(colorDim)
		tags := ""
		if f.Confidence != "" {
			tags += string(f.Confidence)
		}
		if f.AutoLevel != "" && f.AutoLevel != diag.AutoNone {
			if tags != "" {
				tags += "/"
			}
			tags += string(f.AutoLevel)
		}
		if tags != "" {
			b.WriteString(" ")
			b.WriteString(tagStyle.Render("[" + tags + "]"))
		}
	}
	b.WriteString("\n")

	if f.Evidence != "" {
		b.WriteString("  ")
		b.WriteString(evidenceStyle.Render(wrapText(f.Evidence, width-4)))
		b.WriteString("\n")
	}
	if f.Suggestion != "" {
		b.WriteString("  ")
		b.WriteString(suggestionStyle.Render("-> " + wrapText(f.Suggestion, width-7)))
		b.WriteString("\n")
	}
}

func countSeverities(findings []diag.Finding) (c, w, i int) {
	for _, f := range findings {
		switch f.Severity {
		case diag.SevCritical:
			c++
		case diag.SevWarning:
			w++
		case diag.SevInfo:
			i++
		}
	}
	return
}

func formatSeverityCounts(c, w, i int) string {
	parts := make([]string, 0, 3)
	if c > 0 {
		parts = append(parts, fmt.Sprintf("%d critical", c))
	}
	if w > 0 {
		parts = append(parts, fmt.Sprintf("%d warning", w))
	}
	if i > 0 {
		parts = append(parts, fmt.Sprintf("%d info", i))
	}
	if len(parts) == 0 {
		return ""
	}
	return "(" + strings.Join(parts, " / ") + ")"
}

// wrapText ngắt văn bản dài theo bề rộng hiển thị, ưu tiên ngắt Ở BIÊN TỪ.
//
// Vì sao phải là biên từ: bản cũ ngắt theo từng KÝ TỰ, nên một từ tiếng Việt bị xé
// làm hai — đo được trên màn hình thật: "chương" → "chư" + "ơng", "dùng" → "dù" +
// "ng". Cả hai nửa đều là chuỗi đọc được (và "dù" là một từ tiếng Việt thật), nên
// người dùng đọc ra LỖI CHÍNH TẢ chứ không nhận ra là lỗi layout — sẽ bị báo sai
// loại mãi. Tiếng Trung không gặp lớp này vì mỗi chữ Hán là một đơn vị đứng riêng,
// ngắt ở đâu cũng không xé chữ nào; đây là khuyết điểm chỉ thức dậy ở tiếng Việt.
//
// Chuỗi KHÔNG có khoảng trắng (một mạch chữ Hán, đường dẫn, URL) vẫn ngắt cứng theo
// ký tự — đó là cách duy nhất, và TestWrapTextResetsAtNewlines giữ đúng hành vi đó.
func wrapText(s string, maxWidth int) string {
	if maxWidth <= 0 || lipgloss.Width(s) <= maxWidth {
		return s
	}
	const indent = "  " // indent continuation
	indentW := lipgloss.Width(indent)
	// Bề rộng tối đa một từ được phép chiếm khi bị đẩy xuống dòng tiếp. Từ nào dài
	// hơn mức này thì không dòng nào chứa nổi nguyên vẹn → phải ngắt cứng.
	soloW := max(1, maxWidth-indentW)

	var b strings.Builder
	// word đệm từ đang dở: chỉ khi gặp khoảng trắng mới biết từ đã hết, nên phải
	// giữ lại rồi mới quyết định đặt nó ở dòng này hay đẩy xuống dòng sau.
	// sp đệm khoảng trắng đang chờ: chỉ ghi ra KHI BIẾT từ theo sau nó vừa dòng.
	// Ghi ngay sẽ để lại khoảng trắng ở cuối dòng và làm dòng dôi ra 1 cột — đúng
	// lỗi TestRenderImportLineWrapsWithoutClipping bắt được (81 > 80).
	var word, sp strings.Builder
	lineW, wordW, spW := 0, 0, 0
	// hasContent: dòng hiện tại đã có chữ chưa — chỉ khi có mới được phép ngắt.
	// dropSpace: dòng hiện tại do NGẮT DÒNG sinh ra, nên khoảng trắng đầu dòng là
	// rác và phải bỏ. Với dòng do '\n' của chính văn bản sinh ra thì KHÔNG bỏ:
	// phần thụt đầu dòng đó là của tác giả (khối xác nhận cắt chương nhiều dòng).
	hasContent, dropSpace := false, false

	newline := func() {
		b.WriteString("\n")
		b.WriteString(indent)
		lineW = indentW
		hasContent, dropSpace = false, true
	}
	flush := func() {
		if wordW == 0 {
			return
		}
		switch {
		case hasContent && lineW+spW+wordW > maxWidth:
			newline() // bỏ luôn khoảng trắng đang chờ: nó là cuối dòng
		case spW > 0:
			b.WriteString(sp.String())
			lineW += spW
		}
		sp.Reset()
		spW = 0
		b.WriteString(word.String())
		lineW += wordW
		// Từ đã nằm trên dòng: từ đây khoảng trắng là dấu tách thật, không phải rác
		// đầu dòng nữa. Phải xóa cờ Ở ĐÂY chứ không ở vòng lặp — newline() được gọi
		// từ chính flush() nên nếu xóa ở vòng lặp thì khoảng trắng ngay sau từ đầu
		// tiên của dòng tiếp sẽ bị bỏ, dính hai từ vào nhau.
		hasContent, dropSpace = true, false
		word.Reset()
		wordW = 0
	}

	for _, r := range s {
		// 原有换行处必须重置行宽：'\n' 宽度为 0，不重置会把多行消息的累计宽度
		// 误判为超宽，从首个被换行的行起给其后每一行都插入伪换行+缩进（整体打散）。
		if r == '\n' {
			flush()
			sp.Reset()
			spW = 0
			b.WriteRune(r)
			lineW = 0
			hasContent, dropSpace = false, false
			continue
		}
		if r == ' ' || r == '\t' {
			flush()
			if !dropSpace {
				sp.WriteRune(r)
				spW += lipgloss.Width(string(r))
			}
			continue
		}
		// Từ đã dài hơn cả một dòng trống (một mạch chữ Hán, đường dẫn, URL):
		// ngắt cứng ngay, đừng đệm vô hạn.
		w := lipgloss.Width(string(r))
		if wordW+w > soloW {
			flush()
			if hasContent && lineW+w > maxWidth {
				newline()
			}
		}
		word.WriteRune(r)
		wordW += w
	}
	flush()
	return b.String()
}

func renderReportModal(width, height int, state *reportState) string {
	if state == nil {
		return ""
	}

	boxW, boxH := reportModalSize(width, height)

	contentW := paddedModalContentWidth(boxW)

	// 如果 viewport 尺寸变化了，更新
	if state.viewport.Width != contentW {
		state.viewport.Width = contentW
		state.viewport.Height = boxH - 4
	}
	if state.viewport.Height != boxH-4 {
		state.viewport.Height = boxH - 4
	}
	if state.renderW != contentW {
		state.setContent(contentW)
	}

	modal := renderPaddedModalFrame(
		boxW,
		boxH,
		i18n.F("诊断报告"),
		i18n.F("  ↑↓ 滚动 · Esc 关闭"),
		strings.Split(state.viewport.View(), "\n"),
	)
	return lipgloss.Place(width, height, lipgloss.Center, lipgloss.Center, modal)
}

func (m Model) handleReportKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	if m.report == nil {
		return m, nil
	}
	switch msg.Type {
	case tea.KeyEsc:
		m.report = nil
		return m, m.textarea.Focus()
	case tea.KeyUp:
		m.report.viewport.ScrollUp(1)
		return m, nil
	case tea.KeyDown:
		m.report.viewport.ScrollDown(1)
		return m, nil
	case tea.KeyPgUp:
		m.report.viewport.HalfPageUp()
		return m, nil
	case tea.KeyPgDown:
		m.report.viewport.HalfPageDown()
		return m, nil
	default:
		return m, nil
	}
}
