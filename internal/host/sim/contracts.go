package sim

import (
	"github.com/voocel/agentcore/schema"
	"github.com/huuhoa143/ainovel-studio/internal/i18n"
	"github.com/huuhoa143/ainovel-studio/internal/llmcontract"
)

func textList(description string) map[string]any {
	return schema.Array(description, schema.String(description))
}

// Hai contract dưới đây là FUNC, không phải var — dù chúng tĩnh về nội dung.
//
// Lý do: mô tả schema đi qua i18n.F, và khởi tạo biến cấp gói chạy TRƯỚC mọi
// init() của Go. Để ở dạng var thì bản dịch bị chốt theo locale lúc nạp package:
// test ghim locale (i18n_locale_pin_test.go) không tác dụng, và một lệnh đổi
// ngôn ngữ lúc chạy sẽ không đổi được mô tả gửi cho LLM. Bọc thành func để bản
// dịch được đọc lúc DÙNG.
//
// Chi phí dựng lại schema mỗi lần gọi là không đáng kể: mỗi contract được dựng
// một lần cho mỗi lượt gọi LLM trong runner (một lần cho mỗi nguồn ngữ liệu, một
// lần cho bước hợp nhất), tức đi kèm một request mạng hàng giây. Không có chỗ
// dùng nào trong vòng lặp nóng. KHÔNG cache bằng sync.Once — cache chính là cái
// bug đang sửa.
func sourceReportContract() llmcontract.Contract {
	return llmcontract.Contract{
		Name:        "simulation_source_report",
		Description: i18n.F("从单篇语料提炼可复用且不复制原文的写作方法"),
		Schema: schema.Object(
			schema.Property("title", llmcontract.Nullable(schema.String(i18n.F("可选标题；无法确认时为 null")))).Required(),
			schema.Property("summary", schema.String(i18n.F("样本文本的写法价值概括"))).Required(),
			schema.Property("style_observations", textList(i18n.F("叙述视角、句式与描写纹理观察"))).Required(),
			schema.Property("common_words", textList(i18n.F("高频词、意象与转场词类别"))).Required(),
			schema.Property("plot_patterns", textList(i18n.F("情节推进、转折与冲突升级模式"))).Required(),
			schema.Property("hook_patterns", textList(i18n.F("开篇、章末与信息差钩子模式"))).Required(),
			schema.Property("pacing_notes", textList(i18n.F("场景密度与信息释放节奏"))).Required(),
			schema.Property("reader_appeal", textList(i18n.F("吸引读者继续阅读的方法"))).Required(),
			schema.Property("reusable_techniques", textList(i18n.F("可借鉴的结构性技巧"))).Required(),
			schema.Property("warnings", textList(i18n.F("必须避免的复制与套用风险"))).Required(),
		),
	}
}

func synthesisContract() llmcontract.Contract {
	return llmcontract.Contract{
		Name:        "simulation_synthesis",
		Description: i18n.F("把既有画像和语料报告合成为可执行的仿写方法画像"),
		Schema: schema.Object(
			schema.Property("style", schema.Object(
				schema.Property("narrative_voice", textList(i18n.F("叙述人称、距离与信息控制"))).Required(),
				schema.Property("sentence_rhythm", textList(i18n.F("句式节奏"))).Required(),
				schema.Property("prose_texture", textList(i18n.F("描写质感"))).Required(),
				schema.Property("perspective", textList(i18n.F("视角规则"))).Required(),
				schema.Property("mood", textList(i18n.F("情绪调性"))).Required(),
				schema.Property("do_not_copy", textList(i18n.F("禁止复制的内容"))).Required(),
			)).Required(),
			schema.Property("lexicon", schema.Object(
				schema.Property("common_words", textList(i18n.F("常用词类别"))).Required(),
				schema.Property("emotion_words", textList(i18n.F("情绪词类别"))).Required(),
				schema.Property("scene_words", textList(i18n.F("场景词类别"))).Required(),
				schema.Property("transition_words", textList(i18n.F("转场词类别"))).Required(),
				schema.Property("signature_phrases", textList(i18n.F("抽象后的口吻特征，不含原句"))).Required(),
			)).Required(),
			schema.Property("plot_design", schema.Object(
				schema.Property("opening_patterns", textList(i18n.F("开局方式"))).Required(),
				schema.Property("escalation_patterns", textList(i18n.F("冲突升级方式"))).Required(),
				schema.Property("turning_point_patterns", textList(i18n.F("转折设计"))).Required(),
				schema.Property("payoff_patterns", textList(i18n.F("回收与兑现方式"))).Required(),
			)).Required(),
			schema.Property("hook_design", schema.Object(
				schema.Property("hook_types", textList(i18n.F("钩子类型"))).Required(),
				schema.Property("placement", textList(i18n.F("钩子位置"))).Required(),
				schema.Property("cliffhanger_patterns", textList(i18n.F("悬念停顿方式"))).Required(),
				schema.Property("payoff_rules", textList(i18n.F("钩子兑现规则"))).Required(),
			)).Required(),
			schema.Property("pacing_density", schema.Object(
				schema.Property("scene_density", textList(i18n.F("单场景信息密度"))).Required(),
				schema.Property("information_release", textList(i18n.F("信息释放节奏"))).Required(),
				schema.Property("dialogue_action_ratio", textList(i18n.F("对白、动作与心理比例"))).Required(),
				schema.Property("compression_rules", textList(i18n.F("内容展开与压缩规则"))).Required(),
			)).Required(),
			schema.Property("reader_engagement", schema.Object(
				schema.Property("methods", textList(i18n.F("吸引读者的方法"))).Required(),
				schema.Property("emotional_drivers", textList(i18n.F("情绪驱动力"))).Required(),
				schema.Property("progression_rewards", textList(i18n.F("阶段性进展奖励"))).Required(),
				schema.Property("anti_patterns", textList(i18n.F("削弱吸引力的反模式"))).Required(),
			)).Required(),
			schema.Property("role_guidance", schema.Object(
				schema.Property("architect", textList(i18n.F("Architect 使用画像的规则"))).Required(),
				schema.Property("writer", textList(i18n.F("Writer 借鉴但不复制的规则"))).Required(),
				schema.Property("editor", textList(i18n.F("Editor 检查方向与侵权风险的规则"))).Required(),
			)).Required(),
		),
	}
}
