package bootstrap

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// LoadConfig đọc tệp cấu hình DUY NHẤT của tiến trình, hỗ trợ chú thích dòng //.
//
// Không còn trộn tầng `~/.ainovel` + `./.ainovel`: app truyền đường dẫn tuyệt đối qua
// `serve --config`, và mọi lượt đọc lẫn ghi đều đi về đúng tệp đó. Tệp không có thì trả lỗi
// bọc `os.ErrNotExist` — người gọi quyết định đó là "chưa cài" hay là lỗi.
//
// `ConfigPath` của kết quả được gán bằng `path`, để engine dựng từ cấu hình này ghi ngược về
// đúng nơi nó được đọc ra.
func LoadConfig(path string) (Config, error) {
	cfg, err := loadJSONFile(path)
	if err != nil {
		return Config{}, err
	}
	cfg.ConfigPath = path
	return cfg, nil
}

// ErrTepHong đánh dấu tệp cấu hình ĐỌC ĐƯỢC nhưng không phải JSON hợp lệ — phân biệt với lỗi
// vào/ra (quyền, ổ đĩa), là ca không được phép ghi đè.
var ErrTepHong = errors.New("tệp cấu hình hỏng cú pháp")

// loadOptionalJSON 读取一个可选的配置文件：
//   - 文件不存在 → (zero, false, nil)，由调用方决定用默认/上层值
//   - 文件存在但解析失败 → 返回错误（不再静默吞掉——否则用户的配置"配了不生效"
//     却无从排查，正是 issue #37 的根因）
func loadOptionalJSON(path string) (Config, bool, error) {
	cfg, err := loadJSONFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return Config{}, false, nil
		}
		return Config{}, false, err
	}
	return cfg, true, nil
}

// loadJSONFile 读取 JSON 配置文件，支持 // 行注释。
// 文件不存在时返回错误（由调用方决定是否忽略）。
func loadJSONFile(path string) (Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Config{}, err
	}
	cleaned := stripJSONComments(data)
	var cfg Config
	if err := json.Unmarshal(cleaned, &cfg); err != nil {
		return Config{}, fmt.Errorf("%w %s: %w", ErrTepHong, path, err)
	}
	return cfg, nil
}

func cloneMap(m map[string]any) map[string]any {
	if len(m) == 0 {
		return nil
	}
	c := make(map[string]any, len(m))
	for k, v := range m {
		c[k] = v
	}
	return c
}

// CloneConfig 深拷贝配置中会在运行时修改的 map/slice，避免候选配置污染当前配置。
func CloneConfig(cfg Config) Config {
	clone := cfg
	clone.Providers = make(map[string]ProviderConfig, len(cfg.Providers))
	for name, pc := range cfg.Providers {
		pc.Models = append([]ModelConfig(nil), pc.Models...)
		pc.Extra = cloneMap(pc.Extra)
		pc.ExtraBody = cloneMap(pc.ExtraBody)
		clone.Providers[name] = pc
	}
	clone.Roles = make(map[string]RoleConfig, len(cfg.Roles))
	for role, rc := range cfg.Roles {
		rc.Fallbacks = append([]ModelRef(nil), rc.Fallbacks...)
		clone.Roles[role] = rc
	}
	clone.Notify.Events = append([]string(nil), cfg.Notify.Events...)
	return clone
}

// PatchConfigFile vá tệp cấu hình: đọc lại tệp từ đĩa, áp `sua`, ghi lại.
//
// Đây là đường ghi cho mọi thay đổi lúc engine đang chạy. Ghi lại ảnh chụp `h.cfg` thay vì
// vá sẽ đè mất những gì người dùng vừa lưu ở studio sau lúc mở engine. Tệp hỏng cú pháp thì
// từ chối, không ghi đè.
func PatchConfigFile(path string, sua func(*Config)) error {
	cfg, found, err := loadOptionalJSON(path)
	if err != nil {
		return err
	}
	if !found {
		cfg = Config{}
	}
	sua(&cfg)
	return SaveConfig(path, cfg)
}

// stripJSONComments 去除 JSON 中的 // 行注释，跟踪引号状态避免误删字符串内容。
func stripJSONComments(data []byte) []byte {
	out := make([]byte, 0, len(data))
	inString := false
	escaped := false

	for i := 0; i < len(data); i++ {
		b := data[i]

		if escaped {
			out = append(out, b)
			escaped = false
			continue
		}

		if inString {
			out = append(out, b)
			if b == '\\' {
				escaped = true
			} else if b == '"' {
				inString = false
			}
			continue
		}

		// 不在字符串内
		if b == '"' {
			inString = true
			out = append(out, b)
			continue
		}

		// 检测 // 注释
		if b == '/' && i+1 < len(data) && data[i+1] == '/' {
			// 跳到行尾
			for i < len(data) && data[i] != '\n' {
				i++
			}
			if i < len(data) {
				out = append(out, '\n')
			}
			continue
		}

		out = append(out, b)
	}

	return out
}

// SaveConfig 将配置写入指定路径（JSON 格式，缩进美化）。
func SaveConfig(path string, cfg Config) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".config-*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	committed := false
	defer func() {
		_ = tmp.Close()
		if !committed {
			_ = os.Remove(tmpPath)
		}
	}()
	if err := tmp.Chmod(0o600); err != nil {
		return err
	}
	if _, err := tmp.Write(append(data, '\n')); err != nil {
		return err
	}
	if err := tmp.Sync(); err != nil {
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmpPath, path); err != nil {
		return err
	}
	committed = true
	return nil
}
