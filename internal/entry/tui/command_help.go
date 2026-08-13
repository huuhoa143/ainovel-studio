package tui

import (
	"strings"

	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/huuhoa143/ainovel-studio/internal/i18n"
)

type helpState struct {
	viewport viewport.Model
	// wrappedFor là bề rộng mà nội dung hiện tại đã được ngắt dòng theo. Phải nhớ để
	// ngắt LẠI khi cửa sổ đổi cỡ: bản cũ chỉ đổi viewport.Width nên nội dung vẫn giữ
	// cách ngắt của bề rộng CŨ, rồi khung modal cắt cứng từng dòng theo bề rộng MỚI —
	// đoạn giữa mỗi dòng biến mất hẳn. Ở 100 cột, mô tả /import mất nguyên cụm
	// "xong; --guide dù": không phải cắt đuôi mà là mất chữ giữa câu.
	wrappedFor int
}

func newHelpState(width, height int) *helpState {
	boxW, boxH := reportModalSize(width, height)
	contentW := paddedModalContentWidth(boxW)

	vp := viewport.New(contentW, boxH-4)
	vp.SetContent(renderHelpText(contentW))
	return &helpState{viewport: vp, wrappedFor: contentW}
}

func renderHelpText(width int) string {
	titleStyle := lipgloss.NewStyle().Foreground(colorAccent).Bold(true)
	nameStyle := lipgloss.NewStyle().Foreground(colorAccent2).Bold(true)
	usageStyle := lipgloss.NewStyle().Foreground(colorMuted)
	descStyle := lipgloss.NewStyle().Foreground(bodyTextColor)
	hintStyle := lipgloss.NewStyle().Foreground(colorDim)

	var b strings.Builder
	// KHÔNG viết tiêu đề vào thân: viền khung modal đã mang đúng tiêu đề này
	// (renderHelpModal truyền i18n.F("命令帮助") làm title). Viết cả hai chỗ thì
	// "Trợ giúp lệnh" hiện HAI LẦN liền nhau — ở tiếng Trung là 4 cột nên khó thấy,
	// ở tiếng Việt là 13 cột và ăn hẳn dòng đầu của một khung đang phải cuộn.
	for i, spec := range commandSpecs() {
		if i > 0 {
			b.WriteString("\n")
		}
		b.WriteString(nameStyle.Render("/" + spec.Name))
		if len(spec.Aliases) > 0 {
			// Khoảng cách giữ trong MÃ, nhãn giữ trong CATALOG: nhồi khoảng trắng vào
			// msgid là cách làm cho hai khung cùng dùng một khe hint lại ra hai kiểu lề.
			b.WriteString(usageStyle.Render("  " + i18n.F("别名：") + "/" + strings.Join(spec.Aliases, " /")))
		}
		b.WriteString("\n")
		// Dòng Usage cũng phải ngắt: /import có usage dài hơn khung ở mọi bề rộng, và
		// khung cắt cứng nên phần "[--guide=<...>]" mất luôn cả dấu đóng.
		b.WriteString(usageStyle.Render(wrapText(i18n.F("用法：")+spec.Usage, width)))
		b.WriteString("\n")
		b.WriteString(descStyle.Render(wrapText(spec.Description, width)))
		b.WriteString("\n")
	}

	b.WriteString("\n")
	b.WriteString(titleStyle.Render(i18n.F("快捷键")))
	b.WriteString("\n\n")
	for _, line := range []string{
		i18n.F("输入 / 搜索命令"),
		i18n.F("↑↓ 选择命令候选"),
		i18n.F("Tab/Enter 接受补全"),
		i18n.F("Esc 关闭当前命令面板"),
		i18n.F("Ctrl+R 切换选中复制模式（关闭鼠标上报后可拖拽选中复制，再按一次恢复）"),
	} {
		b.WriteString(hintStyle.Render(line))
		b.WriteString("\n")
	}
	return b.String()
}

func renderHelpModal(width, height int, state *helpState) string {
	if state == nil {
		return ""
	}

	boxW, boxH := reportModalSize(width, height)
	contentW := paddedModalContentWidth(boxW)

	if state.viewport.Width != contentW {
		state.viewport.Width = contentW
	}
	if state.viewport.Height != boxH-4 {
		state.viewport.Height = boxH - 4
	}
	// Ngắt dòng LẠI theo bề rộng mới, nếu không nội dung ngắt cho bề rộng cũ sẽ bị
	// khung cắt cứng và mất chữ ở giữa câu.
	if state.wrappedFor != contentW {
		state.viewport.SetContent(renderHelpText(contentW))
		state.wrappedFor = contentW
	}

	modal := renderPaddedModalFrame(
		boxW,
		boxH,
		i18n.F("命令帮助"),
		i18n.F("  ↑↓ 滚动 · Esc 关闭"),
		strings.Split(state.viewport.View(), "\n"),
	)
	return lipgloss.Place(width, height, lipgloss.Center, lipgloss.Center, modal)
}

func (m Model) handleHelpKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	if m.help == nil {
		return m, nil
	}
	switch msg.Type {
	case tea.KeyEsc:
		m.help = nil
		return m, m.textarea.Focus()
	case tea.KeyUp:
		m.help.viewport.ScrollUp(1)
		return m, nil
	case tea.KeyDown:
		m.help.viewport.ScrollDown(1)
		return m, nil
	case tea.KeyPgUp:
		m.help.viewport.HalfPageUp()
		return m, nil
	case tea.KeyPgDown:
		m.help.viewport.HalfPageDown()
		return m, nil
	default:
		return m, nil
	}
}
