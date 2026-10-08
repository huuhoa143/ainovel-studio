package bootstrap

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/huuhoa143/ainovel-studio/internal/errs"
)

const validConfig = `{
  "provider": "openrouter",
  "model": "google/gemini-2.5-flash",
  "providers": { "openrouter": { "api_key": "sk-test-123456" } }
}`

func writeConfig(t *testing.T, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "config.json")
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("write config: %v", err)
	}
	return path
}

// Một tệp, đọc đúng tệp đó, và nhớ nó được đọc từ đâu để mọi lượt ghi ngược về đúng chỗ.
func TestLoadConfig_DocDungTepVaNhoDuongDan(t *testing.T) {
	path := writeConfig(t, validConfig)
	cfg, err := LoadConfig(path)
	if err != nil {
		t.Fatalf("tệp hợp lệ không được lỗi: %v", err)
	}
	if cfg.Provider != "openrouter" || cfg.Providers["openrouter"].APIKey != "sk-test-123456" {
		t.Errorf("đọc sai nội dung: %#v", cfg)
	}
	if cfg.ConfigPath != path || cfg.UserDir() != filepath.Dir(path) {
		t.Errorf("ConfigPath=%q UserDir=%q, muốn %q", cfg.ConfigPath, cfg.UserDir(), path)
	}
	if (Config{}).UserDir() != "" {
		t.Error("cấu hình trong bộ nhớ không được có UserDir")
	}
}

// Tệp hỏng phải báo lỗi, không được lặng lẽ thành cấu hình rỗng (issue #37).
func TestLoadConfig_TepHongBaoLoi(t *testing.T) {
	// Thừa dấu phẩy cuối — kiểu JSON hỏng hay gặp nhất khi sửa tay.
	if _, err := LoadConfig(writeConfig(t, `{ "model": "x", }`)); err == nil {
		t.Fatal("tệp hỏng cú pháp phải báo lỗi")
	}
}

// Chưa có tệp là lỗi bọc os.ErrNotExist — người gọi tự quyết đó là "chưa cài".
func TestLoadConfig_ThieuTepLaErrNotExist(t *testing.T) {
	_, err := LoadConfig(filepath.Join(t.TempDir(), "config.json"))
	if !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("thiếu tệp phải trả os.ErrNotExist, được %v", err)
	}
}

func TestNeedsSetup(t *testing.T) {
	ca := []struct {
		ten  string
		cfg  Config
		muon bool
	}{
		{"rỗng", Config{}, true},
		{"thiếu model", Config{Provider: "p", Providers: map[string]ProviderConfig{"p": {APIKey: "k"}}}, true},
		{"nhà cung cấp không có trong providers", Config{Provider: "p", ModelName: "m"}, true},
		{"nhà cung cấp cần khóa mà chưa có", Config{Provider: "p", ModelName: "m",
			Providers: map[string]ProviderConfig{"p": {Type: "openai", BaseURL: "https://api.example.com/v1"}}}, true},
		// Khóa nằm ở nhà cung cấp KHÁC thì vẫn chưa cài: model mặc định không chạy được.
		{"khóa ở nhà cung cấp khác", Config{Provider: "p", ModelName: "m",
			Providers: map[string]ProviderConfig{"p": {Type: "openai"}, "q": {APIKey: "k"}}}, true},
		{"có khóa", Config{Provider: "p", ModelName: "m", Providers: map[string]ProviderConfig{"p": {APIKey: "k"}}}, false},
		{"ollama không cần khóa", Config{Provider: "ollama", ModelName: "qwen3",
			Providers: map[string]ProviderConfig{"ollama": {}}}, false},
		{"gateway từ xa khai keyless", Config{Provider: "xa", ModelName: "m",
			Providers: map[string]ProviderConfig{"xa": {Type: "openai", BaseURL: "https://gw.example.com/v1", Keyless: true}}}, false},
		{"gateway trên máy không cần khóa", Config{Provider: "lan", ModelName: "m",
			Providers: map[string]ProviderConfig{"lan": {Type: "openai", BaseURL: "http://127.0.0.1:4000/v1"}}}, false},
	}
	for _, c := range ca {
		if got := NeedsSetup(c.cfg); got != c.muon {
			t.Errorf("%s: NeedsSetup = %v, muốn %v", c.ten, got, c.muon)
		}
	}
}

// 根因 2（issue #37 核心复现）：项目级覆盖 provider 但没声明对应 providers 凭证，
// ValidateBase 必须报 config 错误（而非放行后在更深处崩溃）。
func TestValidateBase_ProviderOverrideWithoutCredentials(t *testing.T) {
	cfg := Config{
		Provider:  "mimo",
		ModelName: "mimo-v2.5-pro",
		Providers: map[string]ProviderConfig{
			"openrouter": {APIKey: "sk-test-123456"},
		},
	}
	cfg.FillDefaults()
	err := cfg.ValidateBase()
	if err == nil {
		t.Fatal("provider 缺凭证应报错")
	}
	if !errors.Is(err, errs.ErrConfig) {
		t.Errorf("应包装 errs.ErrConfig，得到: %v", err)
	}
}

func TestValidateBaseRejectsInvalidProviderAPI(t *testing.T) {
	cfg := Config{
		Provider:  "openai",
		ModelName: "gpt-5.1",
		Providers: map[string]ProviderConfig{
			"openai": {APIKey: "sk-test-123456", API: "legacy"},
		},
	}
	cfg.FillDefaults()
	err := cfg.ValidateBase()
	if err == nil {
		t.Fatal("provider api 非法应报错")
	}
	if !errors.Is(err, errs.ErrConfig) {
		t.Errorf("应包装 errs.ErrConfig，得到: %v", err)
	}
}

func TestValidateBaseRejectsProviderAPIOnNonOpenAIProvider(t *testing.T) {
	cfg := Config{
		Provider:  "anthropic",
		ModelName: "claude-sonnet-4",
		Providers: map[string]ProviderConfig{
			"anthropic": {APIKey: "sk-test-123456", API: "responses"},
		},
	}
	cfg.FillDefaults()
	err := cfg.ValidateBase()
	if err == nil {
		t.Fatal("非 OpenAI provider 配置 api 应报错")
	}
	if !errors.Is(err, errs.ErrConfig) {
		t.Errorf("应包装 errs.ErrConfig，得到: %v", err)
	}
}
