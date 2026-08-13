package imp

import (
	"github.com/voocel/agentcore/schema"
	"github.com/huuhoa143/ainovel-studio/internal/domain"
	"github.com/huuhoa143/ainovel-studio/internal/i18n"
	"github.com/huuhoa143/ainovel-studio/internal/llmcontract"
)

func nullableString(description string) map[string]any {
	return llmcontract.Nullable(schema.String(description))
}

func stringList(description string) map[string]any {
	return schema.Array(description, schema.String(description))
}

// Bốn contract dưới đây là FUNC, không phải var — dù chúng tĩnh về nội dung.
//
// Lý do: mô tả schema đi qua i18n.F, và khởi tạo biến cấp gói chạy TRƯỚC mọi
// init() của Go. Để ở dạng var thì bản dịch bị chốt theo locale lúc nạp package:
// test ghim locale (i18n_locale_pin_test.go) không tác dụng, và một lệnh đổi
// ngôn ngữ lúc chạy sẽ không đổi được mô tả gửi cho LLM. Bọc thành func để bản
// dịch được đọc lúc DÙNG.
//
// Chi phí dựng lại schema mỗi lần gọi là không đáng kể: mỗi contract chỉ được
// dựng một lần cho mỗi lượt gọi LLM (segment/analyze/synthesize), tức đi kèm một
// request mạng hàng giây đến hàng phút. Không có chỗ dùng nào trong vòng lặp nóng.
// KHÔNG cache bằng sync.Once — cache chính là cái bug đang sửa.
func segmentContract() llmcontract.Contract {
	return llmcontract.Contract{
		Name:        "import_segment",
		Description: i18n.F("识别导入文本中的章节、卷篇与附属文本边界"),
		Schema: schema.Object(
			schema.Property("boundaries", schema.Array(i18n.F("按原文顺序排列的边界"), schema.Object(
				schema.Property("unit_id", schema.String(i18n.F("owned 区间内的 unit id"))).Required(),
				schema.Property("anchor", nullableString(i18n.F("同一 unit 多边界时的原文定位片段；否则为 null"))).Required(),
				schema.Property("kind", schema.Enum(i18n.F("边界类型"), kindChapter, kindGroup, kindFrontMatter, kindBackMatter)).Required(),
				schema.Property("title", nullableString(i18n.F("标题原文；没有标题时为 null"))).Required(),
				schema.Property("uncertain", schema.Bool(i18n.F("是否需要用户确认"))).Required(),
				schema.Property("reason", nullableString(i18n.F("不确定原因；无需说明时为 null"))).Required(),
			))).Required(),
		),
	}
}

func analysisContract() llmcontract.Contract {
	return llmcontract.Contract{
		Name:        "import_chapter_analysis",
		Description: i18n.F("提取连续章节的可追溯故事事实"),
		Schema: schema.Object(
			schema.Property("chapters", schema.Array(i18n.F("与输入章号顺序一致的逐章事实"), chapterFactsSchema())).Required(),
		),
	}
}

func chapterFactsSchema() map[string]any {
	characterEvidence := schema.Object(
		schema.Property("chapter", schema.Int(i18n.F("证据所在章"))).Required(),
		schema.Property("name", schema.String(i18n.F("人物名"))).Required(),
		schema.Property("note", nullableString(i18n.F("人物事实；无则为 null"))).Required(),
	)
	worldEvidence := schema.Object(
		schema.Property("chapter", schema.Int(i18n.F("证据所在章"))).Required(),
		schema.Property("category", nullableString(i18n.F("世界事实类别；无法归类时为 null"))).Required(),
		schema.Property("fact", schema.String(i18n.F("正文明确揭示的世界事实"))).Required(),
	)
	timelineEvent := schema.Object(
		schema.Property("chapter", schema.Int(i18n.F("章号"))).Required(),
		schema.Property("time", schema.String(i18n.F("故事内时间"))).Required(),
		schema.Property("event", schema.String(i18n.F("事件"))).Required(),
		schema.Property("characters", stringList(i18n.F("相关人物"))).Required(),
	)
	foreshadow := schema.Object(
		schema.Property("id", schema.String(i18n.F("复用 ledger 中的伏笔 ID"))).Required(),
		schema.Property("action", schema.Enum(i18n.F("伏笔动作"), "plant", "advance", "resolve")).Required(),
		schema.Property("description", nullableString(i18n.F("plant 时的伏笔说明；其他情况可为 null"))).Required(),
	)
	relationship := schema.Object(
		schema.Property("character_a", schema.String(i18n.F("人物 A"))).Required(),
		schema.Property("character_b", schema.String(i18n.F("人物 B"))).Required(),
		schema.Property("relation", schema.String(i18n.F("关系变化"))).Required(),
		schema.Property("chapter", schema.Int(i18n.F("章号"))).Required(),
	)
	stateChange := schema.Object(
		schema.Property("chapter", schema.Int(i18n.F("章号"))).Required(),
		schema.Property("entity", schema.String(i18n.F("角色或实体"))).Required(),
		schema.Property("field", schema.String(i18n.F("发生变化的属性"))).Required(),
		schema.Property("old_value", nullableString(i18n.F("变化前状态；首次出现时为 null"))).Required(),
		schema.Property("new_value", schema.String(i18n.F("变化后状态"))).Required(),
		schema.Property("reason", nullableString(i18n.F("变化原因；正文未说明时为 null"))).Required(),
	)
	return schema.Object(
		schema.Property("chapter", schema.Int(i18n.F("章号"))).Required(),
		schema.Property("title", schema.String(i18n.F("章节标题"))).Required(),
		schema.Property("summary", schema.String(i18n.F("本章概要"))).Required(),
		schema.Property("key_events", stringList(i18n.F("关键事件"))).Required(),
		schema.Property("core_event", schema.String(i18n.F("本章最关键的一件事"))).Required(),
		schema.Property("hook", nullableString(i18n.F("章末钩子；无则为 null"))).Required(),
		schema.Property("scenes", stringList(i18n.F("场景序列"))).Required(),
		schema.Property("characters", stringList(i18n.F("出场人物"))).Required(),
		schema.Property("character_evidence", schema.Array(i18n.F("人物证据"), characterEvidence)).Required(),
		schema.Property("world_evidence", schema.Array(i18n.F("世界事实证据"), worldEvidence)).Required(),
		schema.Property("timeline_events", schema.Array(i18n.F("时间线事件"), timelineEvent)).Required(),
		schema.Property("foreshadow_updates", schema.Array(i18n.F("伏笔增量"), foreshadow)).Required(),
		schema.Property("relationship_changes", schema.Array(i18n.F("关系变化"), relationship)).Required(),
		schema.Property("state_changes", schema.Array(i18n.F("状态变化"), stateChange)).Required(),
		schema.Property("hook_type", schema.Enum(i18n.F("章末钩子类型"), domain.HookTypes()...)).Required(),
		schema.Property("dominant_strand", schema.Enum(i18n.F("主导叙事线"), domain.DominantStrands()...)).Required(),
	)
}

func rangeContract() llmcontract.Contract {
	return llmcontract.Contract{
		Name:        "import_range_digest",
		Description: i18n.F("归纳一个连续章节区间的剧情与事实"),
		Schema: schema.Object(
			schema.Property("start_chapter", schema.Int(i18n.F("区间首章"))).Required(),
			schema.Property("end_chapter", schema.Int(i18n.F("区间末章"))).Required(),
			schema.Property("plot", schema.String(i18n.F("跨章主线剧情推进"))).Required(),
			schema.Property("characters", stringList(i18n.F("有实质进展的人物"))).Required(),
			schema.Property("world_facts", stringList(i18n.F("已确立的世界事实"))).Required(),
			schema.Property("opened_threads", stringList(i18n.F("本区间新开的长线"))).Required(),
			schema.Property("resolved_threads", stringList(i18n.F("本区间收束的长线"))).Required(),
		),
	}
}

func synthesisContract() llmcontract.Contract {
	return llmcontract.Contract{
		Name:        "import_book_synthesis",
		Description: i18n.F("综合全书事实并给出连续完整的卷弧范围"),
		Schema: schema.Object(
			schema.Property("premise", schema.String(i18n.F("故事前提的 Markdown 描述"))).Required(),
			schema.Property("characters", schema.Array(i18n.F("主要人物"), schema.Object(
				schema.Property("name", schema.String(i18n.F("人物名"))).Required(),
				schema.Property("aliases", stringList(i18n.F("别名与称号"))).Required(),
				schema.Property("role", schema.String(i18n.F("叙事角色"))).Required(),
				schema.Property("description", schema.String(i18n.F("人物描述"))).Required(),
				schema.Property("arc", schema.String(i18n.F("人物弧"))).Required(),
				schema.Property("traits", stringList(i18n.F("人物特质"))).Required(),
				schema.Property("tier", nullableString(i18n.F("人物层级；无法判断时为 null"))).Required(),
			))).Required(),
			schema.Property("world_rules", schema.Array(i18n.F("正文确立的世界规则"), schema.Object(
				schema.Property("category", schema.String(i18n.F("规则类别"))).Required(),
				schema.Property("rule", schema.String(i18n.F("规则描述"))).Required(),
				schema.Property("boundary", schema.String(i18n.F("不可违反的边界"))).Required(),
			))).Required(),
			schema.Property("structure", schema.Array(i18n.F("卷与弧的连续章节范围"), schema.Object(
				schema.Property("title", schema.String(i18n.F("卷标题"))).Required(),
				schema.Property("theme", schema.String(i18n.F("卷核心冲突或主题"))).Required(),
				schema.Property("arcs", schema.Array(i18n.F("卷内故事弧"), schema.Object(
					schema.Property("title", schema.String(i18n.F("弧标题"))).Required(),
					schema.Property("goal", schema.String(i18n.F("弧目标"))).Required(),
					schema.Property("start_chapter", schema.Int(i18n.F("起始章"))).Required(),
					schema.Property("end_chapter", schema.Int(i18n.F("结束章"))).Required(),
				))).Required(),
			))).Required(),
			schema.Property("compass", schema.Object(
				schema.Property("ending_direction", schema.String(i18n.F("终局方向"))).Required(),
				schema.Property("open_threads", stringList(i18n.F("仍未收束的长线"))).Required(),
				schema.Property("estimated_scale", nullableString(i18n.F("模糊规模；无法判断时为 null"))).Required(),
				schema.Property("last_updated", llmcontract.Nullable(schema.Int(i18n.F("依据的最新章号；无需填写时为 null")))).Required(),
			)).Required(),
			schema.Property("planning_tier", schema.Enum(i18n.F("规划层级"), "short", "mid", "long")).Required(),
			schema.Property("story_status", schema.Enum(i18n.F("故事是否完结"), storyOpen, storyClosed, storyUncertain)).Required(),
			schema.Property("status_reason", nullableString(i18n.F("状态判断理由"))).Required(),
		),
	}
}
