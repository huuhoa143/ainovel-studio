package tools

import (
	"strings"

	"github.com/huuhoa143/ainovel-studio/internal/domain"
)

// premiseHeadingAliases 把 premise 中出现的二级标题归一化到 canonical 名。
// 这是多对一映射:同一 canonical 可有多个别名。canonical 用越南语——它会经
// premiseStructure 的 found/missing 回给 architect,architect 照着补写缺项,
// 所以 canonical 必须与 architect-*.md 提示词里要求输出的标题同语言。
// 中文别名保留,旧书(中文 premise)仍能解析到同一 canonical。
var premiseHeadingAliases = map[string]string{
	// 中文别名(历史存量,勿删)
	"题材定位":    "Định vị thể loại",
	"题材和基调":   "Thể loại và tông điệu",
	"核心冲突":    "Xung đột cốt lõi",
	"主角目标":    "Mục tiêu nhân vật chính",
	"结局方向":    "Hướng kết cục",
	"终局方向":    "Hướng kết cục",
	"写作禁区":    "Vùng cấm khi viết",
	"差异化卖点":   "Điểm bán khác biệt",
	"差异化钩子":   "Móc khác biệt",
	"核心兑现承诺":  "Cam kết tưởng thưởng cốt lõi",
	"故事引擎":    "Động cơ truyện",
	"关系/成长主线": "Mạch chính quan hệ/trưởng thành",
	"升级路径":    "Lộ trình lên cấp",
	"中段转折":    "Khúc ngoặt giữa truyện",
	"中期转向":    "Khúc ngoặt giữa truyện",
	"终局命题":    "Luận đề kết cục",
	"短篇适配性":   "Độ phù hợp truyện ngắn",
	"本作为什么适合短篇/单卷收束": "Độ phù hợp truyện ngắn",

	// Tiếng Việt — đây là các tiêu đề mà architect-short.md / architect-long.md yêu cầu LLM xuất ra
	"Định vị thể loại":                                    "Định vị thể loại",
	"Thể loại và tông điệu":                               "Thể loại và tông điệu",
	"Xung đột cốt lõi":                                    "Xung đột cốt lõi",
	"Mục tiêu nhân vật chính":                             "Mục tiêu nhân vật chính",
	"Hướng kết truyện":                                    "Hướng kết cục",
	"Hướng kết cục":                                       "Hướng kết cục",
	"Vùng cấm khi viết":                                   "Vùng cấm khi viết",
	"Điểm bán khác biệt":                                  "Điểm bán khác biệt",
	"Móc khác biệt":                                       "Móc khác biệt",
	"Cam kết tưởng thưởng cốt lõi":                        "Cam kết tưởng thưởng cốt lõi",
	"Động cơ truyện":                                      "Động cơ truyện",
	"Mạch chính quan hệ/trưởng thành":                     "Mạch chính quan hệ/trưởng thành",
	"Lộ trình lên cấp":                                    "Lộ trình lên cấp",
	"Khúc ngoặt giữa truyện":                              "Khúc ngoặt giữa truyện",
	"Chuyển hướng giữa kỳ":                                "Khúc ngoặt giữa truyện",
	"Luận đề kết cục":                                     "Luận đề kết cục",
	"Độ phù hợp truyện ngắn":                              "Độ phù hợp truyện ngắn",
	"Vì sao tác phẩm này phù hợp truyện ngắn/thu một tập": "Độ phù hợp truyện ngắn",
}

func parsePremiseSections(premise string) map[string]string {
	lines := strings.Split(premise, "\n")
	sections := make(map[string]string)
	var current string
	var body []string

	flush := func() {
		if current == "" {
			return
		}
		text := strings.TrimSpace(strings.Join(body, "\n"))
		if text != "" {
			sections[current] = text
		}
		body = body[:0]
	}

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if heading, ok := canonicalPremiseHeading(trimmed); ok {
			flush()
			current = heading
			continue
		}
		if current != "" {
			body = append(body, line)
		}
	}
	flush()
	return sections
}

func canonicalPremiseHeading(line string) (string, bool) {
	if !strings.HasPrefix(line, "#") {
		return "", false
	}
	title := strings.TrimSpace(strings.TrimLeft(line, "#"))
	if title == "" {
		return "", false
	}
	canonical, ok := premiseHeadingAliases[title]
	return canonical, ok
}

func premiseStructure(premise string, tier domain.PlanningTier) map[string]any {
	sections := parsePremiseSections(premise)
	required := requiredPremiseHeadings(tier)
	found := make([]string, 0, len(required))
	var missing []string
	for _, heading := range required {
		if _, ok := sections[heading]; ok {
			found = append(found, heading)
			continue
		}
		missing = append(missing, heading)
	}

	structure := map[string]any{
		"template_ready": len(missing) == 0,
		"found":          found,
		"missing":        missing,
	}
	if len(sections) > 0 {
		structure["section_count"] = len(sections)
	}
	return structure
}

func requiredPremiseHeadings(tier domain.PlanningTier) []string {
	common := []string{
		"Thể loại và tông điệu",
		"Định vị thể loại",
		"Xung đột cốt lõi",
		"Mục tiêu nhân vật chính",
		"Hướng kết cục",
		"Vùng cấm khi viết",
		"Điểm bán khác biệt",
		"Móc khác biệt",
		"Cam kết tưởng thưởng cốt lõi",
	}

	switch tier {
	case domain.PlanningTierLong:
		return append(common,
			"Động cơ truyện",
			"Mạch chính quan hệ/trưởng thành",
			"Lộ trình lên cấp",
			"Khúc ngoặt giữa truyện",
			"Luận đề kết cục",
		)
	case domain.PlanningTierMid:
		return append(common,
			"Động cơ truyện",
			"Khúc ngoặt giữa truyện",
		)
	case domain.PlanningTierShort:
		return append(common,
			"Độ phù hợp truyện ngắn",
		)
	default:
		return common
	}
}
