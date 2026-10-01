package bootstrap

import (
	"os"
	"path/filepath"
	"testing"
)

// PatchConfigFile chỉ được đổi đúng thứ `sua` đổi, trên đúng tệp đích — không trộn tầng, không
// điền mặc định. Đây là đường ghi của SwitchModel/SetRoleThinking khi engine đang mở.
func TestPatchConfigFile_ChiVaDungTruong(t *testing.T) {
	duong := filepath.Join(t.TempDir(), "config.json")
	if err := os.WriteFile(duong, []byte(`{"provider":"moi","model":"m2","roles":{"writer":{"provider":"moi","model":"m2","fallbacks":[{"provider":"moi","model":"m1"}],"reasoning_effort":"high"}}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := PatchConfigFile(duong, func(c *Config) {
		rc := c.Roles["editor"]
		rc.Provider, rc.Model = "moi", "m1"
		c.Roles["editor"] = rc
	}); err != nil {
		t.Fatalf("vá: %v", err)
	}
	c, err := LoadConfigFile(duong)
	if err != nil {
		t.Fatal(err)
	}
	if c.Provider != "moi" || c.ModelName != "m2" {
		t.Errorf("mặc định bị đổi: %s · %s", c.Provider, c.ModelName)
	}
	if c.Style != "" {
		t.Errorf("vá không được điền mặc định style, được %q", c.Style)
	}
	if w := c.Roles["writer"]; w.ReasoningEffort != "high" || len(w.Fallbacks) != 1 {
		t.Errorf("vai writer mất fallbacks/độ suy luận: %+v", w)
	}
	if e := c.Roles["editor"]; e.Provider != "moi" || e.Model != "m1" {
		t.Errorf("vai editor chưa được vá: %+v", e)
	}
}

func TestPatchConfigFile_TuChoiTepHong(t *testing.T) {
	duong := filepath.Join(t.TempDir(), "config.json")
	if err := os.WriteFile(duong, []byte(`{hỏng`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := PatchConfigFile(duong, func(c *Config) { c.Provider = "x" }); err == nil {
		t.Fatal("tệp hỏng cú pháp phải bị từ chối, không ghi đè")
	}
	if b, _ := os.ReadFile(duong); string(b) != `{hỏng` {
		t.Errorf("tệp hỏng đã bị ghi đè: %q", b)
	}
}

// Một vai chỉ ghi đè độ suy luận (SetRoleThinking trên vai đang thừa hưởng) phải là cấu hình
// hợp lệ và vai vẫn theo model mặc định. Trước đây ValidateBase đòi provider+model và NewModelSet
// chết ở "unknown provider" — tức lần mở engine sau hỏng.
func TestVaiChiDoSuyLuan_HopLeVaThuaHuong(t *testing.T) {
	cfg := Config{
		Provider: "p", ModelName: "m",
		Providers: map[string]ProviderConfig{"p": {Type: "openai", APIKey: "k", Models: []ModelConfig{{Name: "m"}}}},
		Roles:     map[string]RoleConfig{"editor": {ReasoningEffort: "high"}},
	}
	cfg.FillDefaults()
	if err := cfg.ValidateBase(); err != nil {
		t.Fatalf("vai chỉ có độ suy luận phải hợp lệ: %v", err)
	}
	ms, err := NewModelSet(cfg)
	if err != nil {
		t.Fatalf("dựng model set: %v", err)
	}
	if p, m, rieng := ms.CurrentSelection("editor"); rieng || p != "p" || m != "m" {
		t.Errorf("vai chỉ độ suy luận phải thừa hưởng mặc định, được %s · %s (riêng=%v)", p, m, rieng)
	}
	if got := cfg.ResolveReasoningEffort("editor"); got != "high" {
		t.Errorf("độ suy luận của vai mất: %q", got)
	}

	// Một nửa (có provider mà không model) vẫn phải bị chặn.
	cfg.Roles["writer"] = RoleConfig{Provider: "p"}
	if err := cfg.ValidateBase(); err == nil {
		t.Error("vai có provider mà thiếu model phải bị chặn")
	}
}

// Phản hồi chỉ mang loại giao thức và tên model gateway trả về (có khi đã cắt tiền tố). Phải
// đối chiếu được về TÊN provider + tên model đã cấu hình, kể cả khi lượt đó chạy bằng fallback.
func TestCapDaCauHinh_DoiChieuVeTenCauHinh(t *testing.T) {
	cfg := Config{
		Provider: "lingoreup", ModelName: "auto",
		Providers: map[string]ProviderConfig{
			"lingoreup": {Type: "openai", APIKey: "k", Models: []ModelConfig{{Name: "auto"}}},
			"9Router":   {Type: "openai", APIKey: "k", Models: []ModelConfig{{Name: "cx/gpt-5.6-luna"}}},
			"kiraai":    {Type: "openai", APIKey: "k", Models: []ModelConfig{{Name: "kira-mini"}}},
		},
		Roles: map[string]RoleConfig{"writer": {
			Provider: "9Router", Model: "cx/gpt-5.6-luna",
			Fallbacks: []ModelRef{{Provider: "kiraai", Model: "kira-mini"}},
		}},
	}
	ms, err := NewModelSet(cfg)
	if err != nil {
		t.Fatal(err)
	}
	ca := []struct{ vai, daGoi, ncc, model string }{
		{"writer", "gpt-5.6-luna", "9Router", "cx/gpt-5.6-luna"}, // gateway cắt tiền tố
		{"writer", "kira-mini", "kiraai", "kira-mini"},           // chạy bằng fallback
		{"writer", "", "9Router", "cx/gpt-5.6-luna"},
		{"editor", "auto", "lingoreup", "auto"}, // vai thừa hưởng
		{"arbiter", "auto", "lingoreup", "auto"},
	}
	for _, c := range ca {
		if p, m := ms.CapDaCauHinh(c.vai, c.daGoi); p != c.ncc || m != c.model {
			t.Errorf("%s/%q → %s · %s, muốn %s · %s", c.vai, c.daGoi, p, m, c.ncc, c.model)
		}
	}
}
