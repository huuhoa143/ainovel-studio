package tools

import (
	"fmt"
	"strings"

	"github.com/huuhoa143/ainovel-studio/internal/domain"
	"github.com/huuhoa143/ainovel-studio/internal/errs"
	"github.com/huuhoa143/ainovel-studio/internal/i18n"
)

// validateCommitArgs 在创建 PendingCommit 前校验模型提交的完整语义载荷。
// 错误直接返回模型修正；不生成半成品状态，也不猜测缺失值。
func (t *CommitChapterTool) validateCommitArgs(a commitArgs) error {
	if strings.TrimSpace(a.Title) == "" {
		return fmt.Errorf("title is required: %w", errs.ErrToolArgs)
	}
	if strings.TrimSpace(a.Summary) == "" {
		return fmt.Errorf("summary is required: %w", errs.ErrToolArgs)
	}
	if len(a.KeyEvents) == 0 {
		return fmt.Errorf("key_events must contain at least one event: %w", errs.ErrToolArgs)
	}
	if err := validateTextItems("characters", a.Characters); err != nil {
		return err
	}
	if err := validateTextItems("key_events", a.KeyEvents); err != nil {
		return err
	}
	for i, event := range a.TimelineEvents {
		if strings.TrimSpace(event.Time) == "" || strings.TrimSpace(event.Event) == "" {
			return fmt.Errorf("timeline_events[%d] requires time and event: %w", i, errs.ErrToolArgs)
		}
		if err := validateTextItems(fmt.Sprintf("timeline_events[%d].characters", i), event.Characters); err != nil {
			return err
		}
	}

	if len(a.ForeshadowUpdates) > 0 {
		ledger, err := t.store.World.LoadForeshadowLedger()
		if err != nil {
			return fmt.Errorf("load foreshadow ledger: %w: %w", errs.ErrStoreRead, err)
		}
		// 账本是全书投影，而 Projector 按章序重放章节记录。重写早期章节时账本里
		// 还躺着后续章节才种下的伏笔——放行它们，提交前校验就与重放结论相反，
		// 模型无从修正，返工队列随之锁死。故一律以"本章可见"为准。
		plantedAt := make(map[string]int, len(ledger))
		for _, entry := range ledger {
			plantedAt[entry.ID] = entry.PlantedAt
		}
		declared := make(map[string]struct{}, len(a.ForeshadowUpdates))
		for i, update := range a.ForeshadowUpdates {
			id := strings.TrimSpace(update.ID)
			if id == "" {
				return fmt.Errorf("foreshadow_updates[%d].id is required: %w", i, errs.ErrToolArgs)
			}
			switch update.Action {
			case "plant":
				if strings.TrimSpace(update.Description) == "" {
					return fmt.Errorf("foreshadow_updates[%d] plant requires description: %w", i, errs.ErrToolArgs)
				}
				declared[id] = struct{}{}
			case "advance", "resolve":
				if _, ok := declared[id]; ok {
					continue
				}
				at, known := plantedAt[id]
				if !known {
					return fmt.Errorf("foreshadow_updates[%d] references unknown id %q: %w", i, id, errs.ErrToolPrecondition)
				}
				if at > a.Chapter {
					return fmt.Errorf(i18n.F("foreshadow_updates[%d] 伏笔 %q 种植于第 %d 章，不能在第 %d 章推进或回收: %w"),
						i, id, at, a.Chapter, errs.ErrToolPrecondition)
				}
			default:
				return fmt.Errorf("foreshadow_updates[%d].action invalid: %q: %w", i, update.Action, errs.ErrToolArgs)
			}
		}
	}

	for i, change := range a.RelationshipChanges {
		if strings.TrimSpace(change.CharacterA) == "" || strings.TrimSpace(change.CharacterB) == "" || strings.TrimSpace(change.Relation) == "" {
			return fmt.Errorf("relationship_changes[%d] requires character_a, character_b and relation: %w", i, errs.ErrToolArgs)
		}
		if change.CharacterA == change.CharacterB {
			return fmt.Errorf("relationship_changes[%d] cannot relate a character to itself: %w", i, errs.ErrToolArgs)
		}
	}
	for i, change := range a.StateChanges {
		if strings.TrimSpace(change.Entity) == "" || strings.TrimSpace(change.Field) == "" || strings.TrimSpace(change.NewValue) == "" {
			return fmt.Errorf("state_changes[%d] requires entity, field and new_value: %w", i, errs.ErrToolArgs)
		}
	}
	for i, intro := range a.CastIntros {
		if strings.TrimSpace(intro.Name) == "" || strings.TrimSpace(intro.BriefRole) == "" {
			return fmt.Errorf("cast_intros[%d] requires name and brief_role: %w", i, errs.ErrToolArgs)
		}
	}
	if a.HookType != "" && !domain.ValidHookType(a.HookType) {
		return fmt.Errorf("invalid hook_type %q: %w", a.HookType, errs.ErrToolArgs)
	}
	if a.DominantStrand != "" && !domain.ValidDominantStrand(a.DominantStrand) {
		return fmt.Errorf("invalid dominant_strand %q: %w", a.DominantStrand, errs.ErrToolArgs)
	}
	if a.Feedback != nil && (strings.TrimSpace(a.Feedback.Deviation) == "" || strings.TrimSpace(a.Feedback.Suggestion) == "") {
		return fmt.Errorf("feedback requires deviation and suggestion: %w", errs.ErrToolArgs)
	}
	return nil
}

func validateTextItems(name string, items []string) error {
	for i, item := range items {
		if strings.TrimSpace(item) == "" {
			return fmt.Errorf("%s[%d] cannot be empty: %w", name, i, errs.ErrToolArgs)
		}
	}
	return nil
}
