package rules

import (
	"path/filepath"
)

// LoadOptions 枚举 rules 文件来源目录，供 RawFileSources 扫描归一化。
//
// 目录不存在不算错误，扫描时静默跳过。
type LoadOptions struct {
	// HomeRulesDir là `<thư mục cấu hình>/rules/` — sở thích chung cho mọi cuốn; quét mọi .md
	// cấp đầu (ghép theo thứ tự tên tệp). Rỗng = bỏ qua.
	HomeRulesDir string

	// ProjectRulesDir là `<thư mục truyện>/.ainovel/rules/` — luật riêng của cuốn, ưu tiên cao
	// nhất. Rỗng = bỏ qua.
	ProjectRulesDir string
}

// ainovelDirName là thư mục ẩn trong thư mục truyện chứa luật riêng của cuốn.
const ainovelDirName = ".ainovel"

// DefaultProjectRulesDir ghép `<projectDir>/.ainovel/rules/`; projectDir rỗng thì trả rỗng.
func DefaultProjectRulesDir(projectDir string) string {
	if projectDir == "" {
		return ""
	}
	return filepath.Join(projectDir, ainovelDirName, "rules")
}

// OptionsFor dựng nguồn luật cho một cuốn: tầng chung nằm CẠNH tệp cấu hình (`userDir`, xem
// `bootstrap.Config.UserDir`), tầng riêng nằm trong thư mục truyện.
//
// Không có gì neo theo thư mục làm việc hay `~`: sidecar chạy với cwd do app đặt, và một
// nguồn trôi theo cwd là nguồn người dùng không bao giờ tìm thấy.
func OptionsFor(userDir, bookDir string) LoadOptions {
	var opts LoadOptions
	if userDir != "" {
		opts.HomeRulesDir = filepath.Join(userDir, "rules")
	}
	opts.ProjectRulesDir = DefaultProjectRulesDir(bookDir)
	return opts
}
