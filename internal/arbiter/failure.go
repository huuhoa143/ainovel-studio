package arbiter

import (
	"context"
	"fmt"
	"strings"

	"errors"
	"github.com/voocel/agentcore"
	"github.com/voocel/agentcore/schema"
	"github.com/huuhoa143/ainovel-studio/internal/i18n"
	"github.com/huuhoa143/ainovel-studio/internal/llmcontract"
)

// FailureFacts 是 worker_failure / deadlock 两个场景共用的事实包:
// Engine 已做过确定性分类(重试/参数错等不到这里),送到 Arbiter 的都是
// "确定性代码给不出出路"的残余。
type FailureFacts struct {
	Kind          string   `json:"kind"` // worker_failure | deadlock
	Agent         string   `json:"agent,omitempty"`
	Task          string   `json:"task,omitempty"`
	Error         string   `json:"error,omitempty"` // worker_failure:错误文本
	ErrorKind     string   `json:"error_kind,omitempty"`
	Repeats       int      `json:"repeats,omitempty"` // deadlock:同指令已派次数
	Phase         string   `json:"phase,omitempty"`
	NextChapter   int      `json:"next_chapter,omitempty"`
	PendingQueue  []int    `json:"pending_rewrites,omitempty"`
	FoundationGap []string `json:"foundation_missing,omitempty"`
	FactWarnings  []string `json:"fact_warnings,omitempty"`
}

// FailureDecision 失败/僵局裁定。
type FailureDecision struct {
	Action   string      `json:"action"` // retry | reroute | abort
	Dispatch *DispatchOp `json:"dispatch,omitempty"`
	Reason   string      `json:"reason"`
}

func (d *FailureDecision) ValidateAgainst(f FailureFacts) error {
	if strings.TrimSpace(d.Reason) == "" {
		return errors.New(i18n.F("reason 不能为空"))
	}
	switch d.Action {
	case "retry", "abort":
		return nil
	case "reroute":
		if d.Dispatch == nil {
			return errors.New(i18n.F("reroute 必须附 dispatch"))
		}
		if err := d.Dispatch.validate(); err != nil {
			return err
		}
		return validateDispatchAgainst(d.Dispatch, f.Phase)
	default:
		return fmt.Errorf(i18n.F("action 非法: %q（可选 retry / reroute / abort）"), d.Action)
	}
}

// failureContract 紧邻 FailureDecision:action 封闭枚举,dispatch 可空对象
// (仅 reroute 时非 null);跨字段组合仍由 ValidateAgainst 按事实校验。
//
// Là FUNC, không phải var — dù nội dung tĩnh. Lý do: mô tả schema đi qua i18n.F,
// và khởi tạo biến cấp gói chạy TRƯỚC mọi init() của Go. Để ở dạng var thì bản
// dịch bị chốt theo locale lúc nạp package: test ghim locale
// (i18n_locale_pin_test.go) không tác dụng, và một lệnh đổi ngôn ngữ lúc chạy sẽ
// không đổi được mô tả gửi cho LLM. Bọc thành func để bản dịch được đọc lúc DÙNG.
// Chi phí không đáng kể: dựng một lần cho mỗi lượt hỏi trọng tài, đi kèm một
// request LLM. KHÔNG cache bằng sync.Once — cache chính là cái bug đang sửa.
func failureContract() llmcontract.Contract {
	return llmcontract.Contract{
		Name:        "arbiter_failure",
		Description: i18n.F("失败/僵局裁定:给出出路"),
		Schema: schema.Object(
			schema.Property("action", schema.Enum(i18n.F("出路"), "retry", "reroute", "abort")).Required(),
			schema.Property("dispatch", dispatchSchema(i18n.F("派单目标(仅 reroute 时给出,否则为 null)"))).Required(),
			schema.Property("reason", schema.String(i18n.F("裁定理由"))).Required(),
		),
	}
}

// DecideFailure 失败/僵局咨询。失败语义:返回 error → Engine 按最保守路径处理
// (暂停 + notify),绝不无限咨询。
func DecideFailure(ctx context.Context, model agentcore.ChatModel, systemPrompt string, facts FailureFacts) (FailureDecision, error) {
	payload, err := marshalPayload(facts)
	if err != nil {
		return FailureDecision{}, err
	}
	return decide(ctx, model, failureContract(), systemPrompt, payload, func(d *FailureDecision) error {
		return d.ValidateAgainst(facts)
	})
}
