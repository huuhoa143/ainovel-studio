package rules

import (
	"regexp"
	"strings"

	"github.com/huuhoa143/ainovel-studio/internal/i18n"
)

// Lint 内置产品底线检查：扫描正文中的机制残留，与用户规则无关，commit 时始终执行。
// 与 Check 同契约——仅返事实（铁律一），不阻断流程，由评审/用户裁定。
//
// 当前三类（全部来自真实长跑产物的实证缺陷）：
//   - markdown_residue：正文残留 ** 加粗、首行之外的 # 标题行（导出 txt 会裸露符号）
//   - non_cjk_fragments：混入其他语言文字（模型语言混杂）。判据随语言反转，见 fragmentRe：
//     zh 抓拉丁字母片段（正文裸混 "pattern"），vi 抓残留汉字（正文裸混「的」）。
func Lint(text string) []Violation {
	var vs []Violation
	vs = appendMarkdownResidue(vs, text)
	vs = appendNonCJKFragments(vs, text)
	return vs
}

func appendMarkdownResidue(vs []Violation, text string) []Violation {
	if n := strings.Count(text, "**"); n > 0 {
		vs = append(vs, Violation{
			Rule:     "markdown_residue",
			Target:   "**",
			Actual:   n,
			Severity: SeverityWarning,
		})
	}
	headings := 0
	seenContent := false
	for line := range strings.SplitSeq(text, "\n") {
		t := strings.TrimSpace(line)
		if t == "" {
			continue
		}
		// 第一个非空行的 # 标题是章文件的合法格式（不按行号写死，容忍前导空行）
		first := !seenContent
		seenContent = true
		if !first && strings.HasPrefix(t, "#") {
			headings++
		}
	}
	if headings > 0 {
		vs = append(vs, Violation{
			Rule:     "markdown_residue",
			Target:   "#",
			Actual:   headings,
			Severity: SeverityWarning,
		})
	}
	return vs
}

var latinFragmentRe = regexp.MustCompile(`[A-Za-z]{2,}`)

// hanFragmentRe bắt chữ Hán còn sót trong văn tiếng Việt.
//
// Vì sao KHÔNG có `{2,}` như bản tiếng Trung: ngưỡng 2 ở nhánh zh là để tha cho
// chữ Latin lẻ hợp lệ (ký hiệu, chữ cái đầu). Ở nhánh vi thì MỘT chữ Hán đã là
// lỗi rồi — một chữ 的 sót lại giữa câu tiếng Việt là chính cái mà việc việt hóa
// 37/37 prompt định ngăn. Đặt ngưỡng 2 ở đây sẽ tha đúng ca hay gặp nhất.
var hanFragmentRe = regexp.MustCompile(`\p{Han}+`)

// fragmentRe chọn bộ nhận theo ngôn ngữ đang hoạt động, cùng khuôn với
// fatigueWords / forbiddenPhrases trong snapshot.go và stylestat.profile().
//
// Vì sao phải đảo chiều chứ không chỉ dịch: luật này sinh ra để bắt "mô hình lẫn
// ngôn ngữ khác vào thân bài". Ở bản gốc, nền là chữ Hán nên vật lạ là chữ Latin.
// Bản việt hóa đảo nền: thân bài LÀ chữ Latin, nên `[A-Za-z]{2,}` khớp mọi từ của
// mọi chương. Đo trên corpus tiếng Việt: 202–231 lần mỗi chương, 100% số chương.
//
// Vì sao đó là lỗi nặng chứ không phải tiếng ồn: Target đi qua i18n.JoinList ra
// những mảnh âm tiết vô nghĩa ("Tr, sau, ng"), rồi commit_chapter → checkRules →
// SaveRuleViolations ghi xuống đĩa, và editor đọc lại qua novel_context. Tức nó
// DẠY editor rằng chương nào cũng có tật cơ học — làm hỏng chính thứ mà công cụ
// này tồn tại để làm.
func fragmentRe() *regexp.Regexp {
	if i18n.Active() == i18n.Chinese {
		return latinFragmentRe
	}
	return hanFragmentRe
}

// appendNonCJKFragments 报告混入其他语言文字的总次数与去重示例。
// 现代题材的合法英文（品牌名/缩写）也会命中——warning 级事实，由评审按题材裁定。
//
// Tên luật giữ nguyên "non_cjk_fragments" dù ở nhánh vi nó bắt đúng chiều ngược
// lại. Ba lý do, theo thứ tự nặng dần:
//   - Nó là giá trị ĐÃ GHI XUỐNG ĐĨA: Violation marshal vào rule_violations.jsonl
//     (append-only), và LoadRuleViolations đọc lại cho editor. Đổi tên là bỏ mồ
//     côi mọi bản ghi cũ — im lặng, không lỗi.
//   - internal/e2e/antitone_vi_test.go khớp đúng chuỗi này, mà tệp đó thuộc agent
//     khác nên tôi không được sửa.
//   - Khế ước của dự án đã chốt từ đầu: enum và khóa JSON thì giữ nguyên.
//
// Đọc đúng nghĩa của tên: "mảnh chữ KHÔNG thuộc hệ chữ của thân bài".
func appendNonCJKFragments(vs []Violation, text string) []Violation {
	matches := fragmentRe().FindAllString(text, -1)
	if len(matches) == 0 {
		return vs
	}
	seen := make(map[string]struct{})
	var examples []string
	for _, m := range matches {
		if _, ok := seen[m]; ok {
			continue
		}
		seen[m] = struct{}{}
		if len(examples) < 3 {
			examples = append(examples, m)
		}
	}
	return append(vs, Violation{
		Rule:     "non_cjk_fragments",
		Target:   i18n.JoinList(examples),
		Actual:   len(matches),
		Severity: SeverityWarning,
	})
}
