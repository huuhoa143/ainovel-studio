package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"unicode/utf8"

	"errors"
	"github.com/voocel/agentcore/schema"
	"github.com/huuhoa143/ainovel-studio/internal/i18n"
)

// AskUserResponse 用户回答结果。
type AskUserResponse struct {
	Answers map[string]string // question text → 用户选择的答案
	Notes   map[string]string // question text → 自定义输入（选"其他"时）
}

// AskUserHandler 阻塞等待用户回答，由 CLI 或 TUI 注入具体实现。
type AskUserHandler func(ctx context.Context, questions []Question) (*AskUserResponse, error)

// Question 单个问题。
type Question struct {
	Question    string   `json:"question"`
	Header      string   `json:"header"`
	Options     []Option `json:"options"`
	MultiSelect bool     `json:"multiSelect"`
}

// Option 可选项。
type Option struct {
	Label       string `json:"label"`
	Description string `json:"description"`
}

// AskUserTool 让 LLM 向用户提出结构化问题。
type AskUserTool struct {
	mu      sync.RWMutex
	handler AskUserHandler
}

func NewAskUserTool() *AskUserTool {
	return &AskUserTool{}
}

// SetHandler 注入 UI 回调，CLI 和 TUI 各自实现。
func (t *AskUserTool) SetHandler(h AskUserHandler) {
	t.mu.Lock()
	t.handler = h
	t.mu.Unlock()
}

func (t *AskUserTool) Name() string  { return "ask_user" }
func (t *AskUserTool) Label() string { return i18n.F("询问用户") }

// 交互工具：阻塞等待用户回答，显然不能并发调度。
func (t *AskUserTool) ReadOnly(_ json.RawMessage) bool        { return false }
func (t *AskUserTool) ConcurrencySafe(_ json.RawMessage) bool { return false }
func (t *AskUserTool) Description() string {
	return i18n.F("当需求信息不足、且缺失信息会明显影响规划方向时，向用户提出 1-4 个结构化问题。每个问题必须包含 header、question 和 2-4 个选项；用户可选预设项，也可自由补充。返回结果是可直接阅读的中文摘要，格式类似：用户回答：[篇幅] 长篇；[重心] 剧情升级（补充：不要后宫）。只有在无法稳定判断篇幅、主线重心、关键约束或明确偏好时才使用；不要把能自行合理推断的问题都抛给用户。")
}

func (t *AskUserTool) Schema() map[string]any {
	option := schema.Object(
		schema.Property("label", schema.String(i18n.F("选项显示文本（1-5个词）"))).Required(),
		schema.Property("description", schema.String(i18n.F("选项含义说明"))).Required(),
	)
	question := schema.Object(
		schema.Property("question", schema.String(i18n.F("完整的问题文本"))).Required(),
		schema.Property("header", schema.String(i18n.F("短标签（最多12字符）"))).Required(),
		schema.Property("options", schema.Array(i18n.F("2-4个可选项"), option)).Required(),
		schema.Property("multiSelect", schema.Bool(i18n.F("是否允许多选"))),
	)
	return schema.Object(
		schema.Property("questions", schema.Array(i18n.F("1-4个问题"), question)).Required(),
	)
}

type askUserArgs struct {
	Questions []Question `json:"questions"`
}

func (t *AskUserTool) Execute(ctx context.Context, args json.RawMessage) (json.RawMessage, error) {
	var a askUserArgs
	if err := json.Unmarshal(args, &a); err != nil {
		return nil, fmt.Errorf("invalid args: %w", err)
	}
	if err := validateQuestions(a.Questions); err != nil {
		return json.Marshal(fmt.Sprintf(i18n.F("参数校验失败: %s"), err))
	}

	t.mu.RLock()
	h := t.handler
	t.mu.RUnlock()

	if h == nil {
		return json.Marshal(i18n.F("当前环境不支持交互式询问，请根据你的判断自行决策并继续。"))
	}

	resp, err := h(ctx, a.Questions)
	if err != nil {
		return json.Marshal(fmt.Sprintf(i18n.F("用户交互失败: %s。请根据你的判断自行决策并继续。"), err))
	}

	return json.Marshal(formatAnswers(a.Questions, resp))
}

// maxHeaderRunes là độ dài tối đa của header câu hỏi, tính bằng rune.
//
// Ràng buộc thật là bề rộng cột trên terminal, không phải số ký tự: 12 chữ Hán
// chiếm 24 cột (chữ Hán là ký tự rộng gấp đôi). Áp nguyên con số 12 cho tiếng
// Việt là siết còn nửa chỗ — "Chọn thể loại" đã 13 rune và bị từ chối, khiến
// agent phải cắt header thành chữ vô nghĩa hoặc kẹt vòng lặp thử-lại.
func maxHeaderRunes() int {
	if i18n.Active() == i18n.Chinese {
		return 12
	}
	return 24
}

func validateQuestions(questions []Question) error {
	if len(questions) == 0 {
		return errors.New(i18n.F("至少需要一个问题"))
	}
	if len(questions) > 4 {
		return fmt.Errorf(i18n.F("最多4个问题，当前 %d 个"), len(questions))
	}
	for i, q := range questions {
		if q.Question == "" {
			return fmt.Errorf(i18n.F("问题 %d: 问题文本不能为空"), i+1)
		}
		if q.Header == "" {
			return fmt.Errorf(i18n.F("问题 %d: header 不能为空"), i+1)
		}
		if max := maxHeaderRunes(); utf8.RuneCountInString(q.Header) > max {
			return fmt.Errorf(i18n.F("问题 %d: header %q 超过 %d 字符"), i+1, q.Header, max)
		}
		if len(q.Options) < 2 || len(q.Options) > 4 {
			return fmt.Errorf(i18n.F("问题 %d: 需要2-4个选项，当前 %d 个"), i+1, len(q.Options))
		}
		for j, opt := range q.Options {
			if opt.Label == "" {
				return fmt.Errorf(i18n.F("问题 %d 选项 %d: label 不能为空"), i+1, j+1)
			}
			if opt.Description == "" {
				return fmt.Errorf(i18n.F("问题 %d 选项 %d: description 不能为空"), i+1, j+1)
			}
		}
	}
	return nil
}

func formatAnswers(questions []Question, resp *AskUserResponse) string {
	if resp == nil || len(resp.Answers) == 0 {
		return i18n.F("用户未提供回答，请根据你的判断自行决策并继续。")
	}
	var parts []string
	for _, q := range questions {
		answer, ok := resp.Answers[q.Question]
		if !ok {
			continue
		}
		entry := fmt.Sprintf("[%s] %s", q.Header, answer)
		if note, hasNote := resp.Notes[q.Question]; hasNote {
			// Cả hai dấu ngoặc nằm TRONG msgid, không xé một đầu ra ngoài.
			//
			// Trước đây là `i18n.F("（补充：") + note + "）"`: dấu mở đi qua catalog
			// nên thành `(` ASCII, dấu đóng viết cứng nên vẫn là `）` toàn phần —
			// một cặp ngoặc hai kiểu. Và bản dịch của dấu mở không có khoảng trắng
			// đầu nên nó dính vào chữ trước: `Leo thang(bổ sung: …）`.
			//
			// Gộp thành một msgid thì cả cặp ngoặc lẫn khoảng trắng đều nằm trong
			// bản dịch, tức nằm ở chỗ duy nhất biết ngôn ngữ đích cần gì.
			entry += fmt.Sprintf(i18n.F("（补充：%s）"), note)
		}
		parts = append(parts, entry)
	}
	// JoinRecords chứ không JoinList: mỗi phần tử là một bản ghi `[Header] answer`
	// mà answer là chữ người dùng tự nhập nên có dấu phẩy bất cứ lúc nào. Nối bằng
	// dấu phẩy là làm mất biên bản ghi, và mất không báo lỗi.
	//
	// Chuỗi này đi vào ngữ cảnh cho LLM, và chính mô tả công cụ ở trên đã khai báo
	// định dạng dùng `;` — nên đây cũng là chỗ giữ cho mô tả và đầu ra thật khớp
	// nhau.
	return fmt.Sprintf(i18n.F("用户回答：%s"), i18n.JoinRecords(parts))
}
