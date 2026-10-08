package rules

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestDefaultProjectRulesDir 锁死项目级规则目录镜像全局：./.ainovel/rules/。
func TestDefaultProjectRulesDir(t *testing.T) {
	proj := filepath.Join("/tmp", "demo-book")
	want := filepath.Join(proj, ".ainovel", "rules")
	if got := DefaultProjectRulesDir(proj); got != want {
		t.Errorf("DefaultProjectRulesDir=%q, want %q", got, want)
	}
	if got := DefaultProjectRulesDir(""); got != "" {
		t.Errorf("空项目根应返回空串，得到 %q", got)
	}
}

// OptionsFor nối tầng chung cạnh tệp cấu hình và tầng riêng trong thư mục truyện — không
// cái nào trôi theo cwd.
func TestOptionsFor_NeoTheoCauHinhVaTruyen(t *testing.T) {
	proj := t.TempDir()
	rulesDir := filepath.Join(proj, ".ainovel", "rules")
	if err := os.MkdirAll(rulesDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(rulesDir, "book.md"), []byte("# 本书偏好\n每章 4000 字"), 0o644); err != nil {
		t.Fatal(err)
	}

	userDir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(userDir, "rules"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(userDir, "rules", "chung.md"), []byte("# chung"), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Chdir(t.TempDir()) // cwd khác hẳn: không nguồn nào được đọc từ đây

	srcs := RawFileSources(OptionsFor(userDir, proj))
	coChung := false
	for _, s := range srcs {
		if s.Kind == SourceGlobal && s.Label == "global:chung.md" {
			coChung = true
		}
	}
	if !coChung {
		t.Errorf("tầng chung phải đọc từ <userDir>/rules, được %+v", srcs)
	}
	var got *RawSource
	for i := range srcs {
		if srcs[i].Kind == SourceProject {
			got = &srcs[i]
		}
	}
	if got == nil {
		t.Fatalf("应从 ./.ainovel/rules/ 扫到项目规则来源，得到 %+v", srcs)
	}
	if !strings.Contains(got.Text, "本书偏好") {
		t.Errorf("项目规则原文应被原样返回，得到 %q", got.Text)
	}
	if got.Label != "project:book.md" {
		t.Errorf("来源标签应为 project:book.md，得到 %q", got.Label)
	}
}
