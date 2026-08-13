package flow

import (
	"fmt"

	"errors"
	"github.com/huuhoa143/ainovel-studio/internal/domain"
	"github.com/huuhoa143/ainovel-studio/internal/i18n"
)

// StartsForwardChapter 判断一条指令是否会开始尚未完成的正向新章。
// 它只读事实，不决定是否放行；Task/Reason 文案不参与判断。
func StartsForwardChapter(inst *Instruction, progress *domain.Progress, pending *domain.PendingCommit) bool {
	if inst == nil || inst.Agent != "writer" || progress == nil || progress.Phase != domain.PhaseWriting {
		return false
	}
	if pending != nil || len(progress.PendingRewrites) > 0 || progress.InProgressChapter > 0 {
		return false
	}
	target := inst.Chapter
	if target == 0 {
		target = progress.NextChapter()
	}
	return target > 0 && target == progress.NextChapter()
}

// AdvanceHoldResolution 是一次性暂停在当前事实下的处理结果。
type AdvanceHoldResolution int

const (
	AdvanceHoldKeep AdvanceHoldResolution = iota
	AdvanceHoldConsume
	AdvanceHoldConsumeAndStop
)

// ResolveAdvanceHold 纯函数解析一次性暂停。未知条件和缺失事实显式报错，
// 不允许按“继续运行”静默降级。
func ResolveAdvanceHold(hold *domain.AdvanceHold, progress *domain.Progress) (AdvanceHoldResolution, error) {
	if hold == nil {
		return AdvanceHoldKeep, nil
	}
	if !hold.After.Valid() {
		return AdvanceHoldKeep, fmt.Errorf(i18n.F("不支持的一次性暂停条件 %q"), hold.After)
	}
	if progress == nil {
		return AdvanceHoldKeep, errors.New(i18n.F("缺少 Progress，无法解析一次性暂停"))
	}
	if progress.Phase == domain.PhaseComplete {
		return AdvanceHoldConsume, nil
	}
	if progress.Phase != domain.PhaseWriting {
		return AdvanceHoldKeep, fmt.Errorf(i18n.F("一次性暂停仅适用于 writing/complete 阶段（当前 %s）"), progress.Phase)
	}
	switch hold.After {
	case domain.AdvanceHoldAtBoundary:
		return AdvanceHoldConsumeAndStop, nil
	case domain.AdvanceHoldAfterRewritesDrained:
		if len(progress.PendingRewrites) > 0 {
			return AdvanceHoldKeep, nil
		}
		return AdvanceHoldConsumeAndStop, nil
	default:
		return AdvanceHoldKeep, fmt.Errorf(i18n.F("不支持的一次性暂停条件 %q"), hold.After)
	}
}
