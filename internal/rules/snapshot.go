package rules

import (
	"fmt"
	"github.com/huuhoa143/ainovel-studio/internal/i18n"
	"maps"
	"strings"
)

// Snapshot 是本书归一化后的用户规则快照（meta/user_rules.json）。
//
// 它是运行时唯一事实源：开书/导入/刷新时由各来源归一化合并而成，之后 novel_context
// 注入与 commit_chapter 检查都只读这一份，不再反复读 rules 文件（避免漂移与双读者发散）。
//
// 注入给模型的只有 Structured + Preferences（见 Payload）；Version / Status / Sources /
// Uncertain 是运维与诊断元数据，不进 working_memory.user_rules。
type Snapshot struct {
	Version     int        `json:"version"`
	Status      Status     `json:"status"`
	Structured  Structured `json:"structured"`
	Preferences string     `json:"preferences"`
	Sources     []string   `json:"sources"`
	Uncertain   []string   `json:"uncertain"`
}

// Status 标记快照归一化是否完整成功。
type Status string

const (
	// StatusReady 所有来源都成功归一化。
	StatusReady Status = "ready"
	// StatusDegraded 至少一个来源归一化失败，已降级为 raw preferences（详见 Uncertain / 日志）。
	StatusDegraded Status = "degraded"
)

// SnapshotVersion 是当前快照 schema 版本，便于未来迁移。
// v2：chapter_words 退出 structured（字数是语义软约束，走 preferences）。
// v1 快照直接加载兼容：未知字段被反序列化忽略，下次叠加保存时自然收敛为 v2；
// 刻意不做"版本不符即重建"——那会丢掉 AddRuntimeRule 运行中追加的不可再生规则。
const SnapshotVersion = 2

// Candidate 是单个来源归一化后的候选结果。
//
// 来源按优先级低→高排列后交给 BuildSnapshot 确定性合并。LLM 只负责把单一来源的
// 自然语言变成候选 Structured/Preferences；优先级与字段覆盖由 BuildSnapshot（Go）裁定。
type Candidate struct {
	Source      string     // 可读来源标签，进入 Snapshot.Sources（如 system_defaults / startup_prompt / global:my.md）
	Structured  Structured // 该来源候选结构化字段
	Preferences string     // 该来源的自然语言偏好正文
	Uncertain   []string   // 该来源故意未提升到 structured 的项 + 原因（诊断）
	Degraded    bool       // 该来源归一化失败、已降级为 raw preferences
}

// Payload 返回注入 working_memory.user_rules 的形态：只暴露 structured + preferences。
// 即便都为空也返回稳定结构，避免 LLM 看到 user_rules=null 走异常分支。
func (s Snapshot) Payload() map[string]any {
	return map[string]any{
		"structured":  s.Structured,
		"preferences": s.Preferences,
	}
}

// BuildSnapshot 把按优先级（低→高）排好的候选确定性合并成快照。
//
// 合并规则（全部 Go 侧确定性，不交给 LLM）：
//   - structured：按字段覆盖，高优先级来源覆盖低优先级；fatigue_words 按词叠加
//   - preferences：不覆盖，按来源顺序拼接（高优先级在后），带来源标题
//   - 空值/零值视为字段缺失，不覆盖已有值（sanitizeStructured）
//   - 任一来源 Degraded → 快照 status=degraded
func BuildSnapshot(cands []Candidate) Snapshot {
	snap := Snapshot{
		Version: SnapshotVersion,
		Status:  StatusReady,
		Sources: make([]string, 0, len(cands)),
	}
	var prefs []string
	for _, c := range cands {
		s := sanitizeStructured(c.Structured)
		if s.Genre != "" {
			snap.Structured.Genre = s.Genre
		}
		if len(s.ForbiddenChars) > 0 {
			snap.Structured.ForbiddenChars = s.ForbiddenChars
		}
		if len(s.ForbiddenPhrases) > 0 {
			snap.Structured.ForbiddenPhrases = s.ForbiddenPhrases
		}
		if len(s.FatigueWords) > 0 {
			snap.Structured.FatigueWords = mergeFatigueWords(snap.Structured.FatigueWords, s.FatigueWords)
		}

		if p := strings.TrimSpace(c.Preferences); p != "" {
			if src := strings.TrimSpace(c.Source); src != "" {
				prefs = append(prefs, fmt.Sprintf("## [%s]\n\n%s", src, p))
			} else {
				prefs = append(prefs, p)
			}
		}
		if src := strings.TrimSpace(c.Source); src != "" {
			snap.Sources = append(snap.Sources, src)
		}
		snap.Uncertain = append(snap.Uncertain, c.Uncertain...)
		if c.Degraded {
			snap.Status = StatusDegraded
		}
	}
	snap.Preferences = strings.Join(prefs, "\n\n")
	return snap
}

// OverlaySnapshot 把一个高优先级候选叠加到已有快照上（候选胜出）。
//
// 用于运行中 Arbiter rules 动作：不重新归一化所有来源，只把新规则覆盖进当前快照——
// structured 按字段覆盖、preferences 追加一段、sources/uncertain 累加、降级传播。
func OverlaySnapshot(base Snapshot, cand Candidate) Snapshot {
	out := base
	out.Version = SnapshotVersion
	s := sanitizeStructured(cand.Structured)
	if s.Genre != "" {
		out.Structured.Genre = s.Genre
	}
	if len(s.ForbiddenChars) > 0 {
		out.Structured.ForbiddenChars = s.ForbiddenChars
	}
	if len(s.ForbiddenPhrases) > 0 {
		out.Structured.ForbiddenPhrases = s.ForbiddenPhrases
	}
	if len(s.FatigueWords) > 0 {
		out.Structured.FatigueWords = mergeFatigueWords(cloneFatigue(out.Structured.FatigueWords), s.FatigueWords)
	}
	if p := strings.TrimSpace(cand.Preferences); p != "" {
		section := p
		if src := strings.TrimSpace(cand.Source); src != "" {
			section = fmt.Sprintf("## [%s]\n\n%s", src, p)
		}
		if strings.TrimSpace(out.Preferences) == "" {
			out.Preferences = section
		} else {
			out.Preferences = out.Preferences + "\n\n" + section
		}
	}
	if src := strings.TrimSpace(cand.Source); src != "" {
		out.Sources = append(append([]string{}, out.Sources...), src)
	}
	if len(cand.Uncertain) > 0 {
		out.Uncertain = append(append([]string{}, out.Uncertain...), cand.Uncertain...)
	}
	if cand.Degraded {
		out.Status = StatusDegraded
	}
	return out
}

// mergeFatigueWords 按词叠加疲劳词阈值，src 覆盖 dst 中的同词阈值（就近优先）。
// 让用户只需新增少量疲劳词，而不必重列内置基线。
func mergeFatigueWords(dst, src map[string]int) map[string]int {
	if len(src) == 0 {
		return dst
	}
	if dst == nil {
		dst = make(map[string]int, len(src))
	}
	maps.Copy(dst, src)
	return dst
}

func cloneFatigue(m map[string]int) map[string]int {
	if len(m) == 0 {
		return nil
	}
	out := make(map[string]int, len(m))
	maps.Copy(out, m)
	return out
}

// SystemDefaults 是代码内置的机械基线（最低优先级来源），不走 LLM 归一化。
//
// 数值迁自旧 assets/rules/default.md 的 front matter。阈值依据一并保留：
// 后段疲劳词（像一/沉默了/没有说话/X息）来自 196 章长跑产物实证——传统 AI 套话被前段
// 表灭绝后，模型转而把这些"节拍词"用到章均 5-7 次，阈值放宽以容忍正常使用。
func SystemDefaults() Candidate {
	return Candidate{
		Source: "system_defaults",
		Structured: Structured{
			// 定长固定串的 AI 套句；checker 字面子串匹配，带变量的模式（不是X而是Y）归语义层。
			ForbiddenPhrases: forbiddenPhrases(),
			FatigueWords:     fatigueWords(),
		},
	}
}

// fatigueWords / forbiddenPhrases chọn bảng theo ngôn ngữ đang hoạt động, cùng
// khuôn với stylestat.profile().
//
// Vì sao KHÔNG bọc từng khóa map bằng i18n.F: khóa map là dữ liệu, và bọc chúng
// vừa làm bảng đóng băng theo locale lúc init gói, vừa lệ thuộc thứ tự init —
// đúng hai lớp bug đã phải sửa ở chỗ khác trong repo này.
//
// Vì sao đây là lỗi thật, không phải chuyện hình thức: checker so khớp CHUỖI CON
// LITERAL với văn bản do mô hình sinh ra (rules/checker.go:72
// appendFatigueWords). Bảng tiếng Trung khớp 0 lần trong văn tiếng Việt, nên cả
// 16 ngưỡng chết lặng — không lỗi, không log, và mọi chương đều "sạch từ gây
// mỏi". Trước đó ForbiddenPhrases (slice) được bọc nên đã sang tiếng Việt và
// hoạt động, còn FatigueWords (khóa map) bị bỏ qua đúng luật "khóa map là dữ
// liệu" — thành ra một nửa cơ chế sống, một nửa chết.
//
// Ngưỡng giữ nguyên con số của upstream: hệ số chữ Hán → chữ Việt đo được ~1,0
// (cả hai đơn âm), nên "tối đa N lần mỗi chương" mang cùng ý nghĩa ở hai ngôn
// ngữ.
func fatigueWords() map[string]int {
	if i18n.Active() == i18n.Chinese {
		return map[string]int{
			"不禁": 1, "竟然": 1, "仿佛": 2, "此外": 1, "然而": 2,
			"一丝": 2, "一抹": 2, "一缕": 2, "宛如": 1, "不由得": 1,
			"像一": 3, "沉默了": 2, "没有说话": 2, "几息": 3, "一息": 3, "数息": 2,
		}
	}
	// Bảng tiếng Việt không phải bản dịch từng chữ mà là các từ/cụm mà văn AI
	// tiếng Việt thật sự lạm dụng, chọn tương ứng theo CHỨC NĂNG của bản gốc:
	// liên từ chuyển ý, lượng từ mờ, so sánh sáo, nhịp im lặng, đơn vị thời gian
	// tiên hiệp. Phải khớp với bộ mẫu của stylestat để một bên dạy và một bên đo
	// cùng một thứ.
	return map[string]int{
		// liên từ chuyển ý bị lạm dụng (此外 / 然而)
		"ngoài ra": 1, "tuy nhiên": 2, "thế nhưng": 2, "bên cạnh đó": 1,
		// "không kìm được" (不禁 / 不由得)
		"không khỏi": 1, "bất giác": 1, "chẳng khỏi": 1,
		// bất ngờ hóa (竟然)
		"không ngờ": 1, "nào ngờ": 1,
		// so sánh sáo (仿佛 / 宛如 / 像一)
		"tựa như": 2, "như thể": 2, "chẳng khác nào": 1, "hệt như": 1,
		// lượng từ mờ (一丝 / 一抹 / 一缕)
		"một thoáng": 2, "một tia": 2, "một nét": 2, "một làn": 2,
		// nhịp im lặng (沉默了 / 没有说话)
		"im lặng": 2, "không nói gì": 2, "không đáp": 2,
		// đơn vị thời gian tiên hiệp (几息 / 一息 / 数息)
		"trong nháy mắt": 3, "chớp mắt": 3, "khoảnh khắc": 3,
	}
}

func forbiddenPhrases() []string {
	if i18n.Active() == i18n.Chinese {
		return []string{"某种程度上", "值得注意的是", "不知为何", "五味杂陈"}
	}
	return []string{
		i18n.F("某种程度上"), i18n.F("值得注意的是"),
		i18n.F("不知为何"), i18n.F("五味杂陈"),
	}
}

// sanitizeStructured 落实"空值/零值=字段缺失"：归一化器可能吐 genre:"" 这类占位
// （原型实测），必须当作未声明，避免污染合并与机械检查。
func sanitizeStructured(s Structured) Structured {
	out := Structured{}
	if g := strings.TrimSpace(s.Genre); g != "" {
		out.Genre = g
	}
	out.ForbiddenChars = nonEmptyStrings(s.ForbiddenChars)
	out.ForbiddenPhrases = nonEmptyStrings(s.ForbiddenPhrases)
	out.FatigueWords = sanitizeFatigueWords(s.FatigueWords)
	return out
}

func nonEmptyStrings(in []string) []string {
	var out []string
	for _, s := range in {
		if t := strings.TrimSpace(s); t != "" {
			out = append(out, t)
		}
	}
	return out
}

func sanitizeFatigueWords(m map[string]int) map[string]int {
	if len(m) == 0 {
		return nil
	}
	out := make(map[string]int, len(m))
	for w, n := range m {
		if w = strings.TrimSpace(w); w == "" || n <= 0 {
			continue
		}
		out[w] = n
	}
	if len(out) == 0 {
		return nil
	}
	return out
}
