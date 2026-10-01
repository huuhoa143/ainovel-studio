package host

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/voocel/agentcore"

	"github.com/huuhoa143/ainovel-studio/internal/bootstrap"
)

// B1: đổi model khi phiên đang mở phải VÁ đúng trường trên tệp, không ghi lại ảnh chụp lúc mở.
//
// Đo được trên máy thật: mở phiên → đổi mặc định sang kiraai ở màn cấu hình → đổi model
// Biên tập viên ở phiên đang mở → tệp quay về mặc định cũ và mọc thêm `"style":"default"`.
func TestSwitchModel_KhongDeThayDoiLuuSauLucMo(t *testing.T) {
	h, path := newModelConfigTestHost(t)

	// Sau lúc mở engine, studio lưu một mặc định mới và gắn độ suy luận cho writer.
	tep, err := bootstrap.LoadConfigFile(path)
	if err != nil {
		t.Fatal(err)
	}
	tep.ModelName = "writer-model"
	w := tep.Roles["writer"]
	w.ReasoningEffort = "high"
	tep.Roles["writer"] = w
	if err := bootstrap.SaveConfig(path, tep); err != nil {
		t.Fatal(err)
	}

	if err := h.SwitchModel("editor", "proxy", "old"); err != nil {
		t.Fatalf("switch: %v", err)
	}

	sau, err := bootstrap.LoadConfigFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if sau.ModelName != "writer-model" {
		t.Errorf("mặc định lưu sau lúc mở bị đè về %q", sau.ModelName)
	}
	if sau.Style != "" {
		t.Errorf("tệp mọc thêm style %q từ ảnh chụp đã điền mặc định", sau.Style)
	}
	if got := sau.Roles["writer"]; got.ReasoningEffort != "high" || len(got.Fallbacks) != 1 {
		t.Errorf("writer mất độ suy luận/fallbacks: %+v", got)
	}
	if got := sau.Roles["editor"]; got.Provider != "proxy" || got.Model != "old" {
		t.Errorf("editor chưa được ghi: %+v", got)
	}
}

// SetRoleThinking trên một vai đang thừa hưởng phải để lại cấu hình MỞ ĐƯỢC.
func TestSetRoleThinking_VaiThuaHuong_GiuCauHinhHopLe(t *testing.T) {
	h, path := newModelConfigTestHost(t)
	if err := h.SetRoleThinking("editor", "high"); err != nil {
		t.Fatalf("set thinking: %v", err)
	}
	sau, err := bootstrap.LoadConfigFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if got := sau.Roles["editor"]; got.ReasoningEffort != "high" || got.Provider != "" {
		t.Errorf("editor phải chỉ mang độ suy luận, được %+v", got)
	}
	sau.FillDefaults()
	if err := sau.ValidateBase(); err != nil {
		t.Fatalf("cấu hình sau SetRoleThinking không mở được engine: %v", err)
	}
	if _, err := bootstrap.NewModelSet(sau); err != nil {
		t.Fatalf("dựng model set: %v", err)
	}

	// Bỏ độ suy luận → mục biến mất, không để lại `{}`.
	if err := h.SetRoleThinking("editor", ""); err != nil {
		t.Fatalf("bỏ thinking: %v", err)
	}
	sau, _ = bootstrap.LoadConfigFile(path)
	if _, con := sau.Roles["editor"]; con {
		t.Errorf("mục editor rỗng còn nằm lại trong tệp: %+v", sau.Roles["editor"])
	}
}

// "Áp dụng ngay": engine đang mở nhận cấu hình model mới từ đĩa, kể cả việc GỠ một vai.
func TestApplyConfigFromDisk_NhanMacDinhVaGoVai(t *testing.T) {
	nhaCauHinh(t)
	cu := cfgMot("g", "k")
	cu.Providers["g"] = bootstrap.ProviderConfig{Type: "openai", APIKey: "k", Models: []bootstrap.ModelConfig{{Name: "m"}, {Name: "m2"}}}
	cu.Roles = map[string]bootstrap.RoleConfig{"writer": {Provider: "g", Model: "m2"}}
	h := hostNapLai(t, cu)

	moi := cfgMot("g", "k")
	moi.Providers["g"] = cu.Providers["g"]
	moi.ModelName = "m2"
	ghiCauHinhDuAn(t, moi)

	if err := h.ApplyConfigFromDisk(); err != nil {
		t.Fatalf("áp dụng: %v", err)
	}
	if p, m, _ := h.CurrentModelSelection("default"); p != "g" || m != "m2" {
		t.Errorf("mặc định chưa đổi: %s · %s", p, m)
	}
	if _, _, rieng := h.CurrentModelSelection("writer"); rieng {
		t.Error("vai writer đã gỡ khỏi tệp mà engine vẫn coi là đặt riêng")
	}
	if b, _ := os.ReadFile(filepath.Join(".ainovel", "config.json")); len(b) == 0 {
		t.Error("tệp cấu hình biến mất")
	}
}

// "Lượt trước" ở thanh trạng thái: ghi bằng TÊN provider đã cấu hình, không bằng loại giao thức,
// và sống qua lượt ghi/đọc usage.json.
func TestUsageRecord_GhiLuotGoiTheoTenCauHinh(t *testing.T) {
	h, _ := newModelConfigTestHost(t)
	tk := NewUsageTracker(h.models, nil)
	tk.Record("writer", "", agentcore.Message{
		Role:  agentcore.RoleAssistant,
		Usage: &agentcore.Usage{Provider: "openai", Model: "writer-model", Input: 10, Output: 5},
	})
	lc := tk.LastCall()
	if lc == nil || lc.Agent != "writer" || lc.Provider != "proxy" || lc.Model != "writer-model" || lc.At.IsZero() {
		t.Fatalf("lượt gọi sai: %+v", lc)
	}
	snap := tk.Snapshot()
	if snap.LastCall == nil || snap.LastCall.Provider != "proxy" {
		t.Fatalf("snapshot thiếu last_call: %+v", snap.LastCall)
	}
	tk2 := NewUsageTracker(h.models, nil)
	tk2.applyState(snap)
	if got := tk2.LastCall(); got == nil || got.Model != "writer-model" {
		t.Errorf("last_call không sống qua usage.json: %+v", got)
	}
}
