package serve

import (
	"fmt"
	"net/http"
	"os"
	"sort"

	"github.com/huuhoa143/ainovel-studio/assets"
	"github.com/huuhoa143/ainovel-studio/internal/bootstrap"
)

// Cấu hình đọc/ghi cho web — mảnh làm người dùng không phải mở terminal lần nào.
//
// # Ba luật của tệp này
//
//  1. **Khóa API đi MỘT CHIỀU.** GET trả `api_key_masked` + `api_key_set`, không bao giờ
//     trả khóa thật. Nên PUT phải chịu được việc khóa VẮNG MẶT và giữ nguyên khóa cũ —
//     đó là lý do `APIKey` là `*string`: nil = giữ, "" = xóa có chủ ý.
//
//  2. **Ghi thì đọc ĐÚNG tệp đích, không đọc bản đã trộn.** `LoadConfig` trộn
//     `~/.ainovel/config.json` với `./.ainovel/config.json`, còn `EffectiveConfigPath`
//     trả tệp project nếu có. "LoadConfig → sửa → SaveConfig" sẽ đổ cả bộ credential
//     global vào tệp project, làm phẳng lớp cấu hình mà người dùng cố ý dựng.
//     `SaveProviderConfig` của bootstrap đã theo lối đúng (đọc `loadOptionalJSON(path)`);
//     tệp này theo cùng lối.
//
//  3. **Kiểm bản ĐÃ TRỘN, và hoàn nguyên nếu hỏng.** Studio giờ là giao diện duy nhất,
//     nên một cấu hình sai ghi thành công sẽ khóa người dùng ra khỏi chính công cụ của họ
//     — trên web không có `vim` để sửa tệp. Kiểm phải nói về thứ engine SẼ NẠP, tức
//     `LoadConfig()`, không phải về riêng tệp đích: tệp project hợp lệ khi chỉ chứa phần
//     ghi đè, nên kiểm nó một mình sẽ chặn đúng cách dùng mà lớp cấu hình tồn tại để phục vụ.

// vaiCoTheDoi là các vai đặt được model riêng.
//
// Lấy đúng theo `normalizeRoleKey` của TUI (command_model.go:124) — bốn kênh. `arbiter`
// KHÔNG có mặt vì upstream cố ý không mở cấu hình cho nó (`host.arbiterModel` luôn dùng
// model mặc định). Thêm nó vào đây sẽ là một ô người dùng đổi mà không có tác dụng gì.
var vaiCoTheDoi = []string{"default", "architect", "writer", "editor"}

// kieuVanCoThat liệt kê các giá trị `style` thật sự có tác dụng.
//
// # Vì sao phải là danh sách ĐÓNG
//
// `assets.loadReferences` tra `references/genres/<style>/`; không thấy thì để
// `StyleReference` và `ArcTemplates` RỖNG — không lỗi, không cảnh báo. Nên một ô nhập tự
// do cho phép người dùng gõ `tien_hiep` rồi tin rằng mình đã chọn thể loại, trong khi
// engine chạy không có tham chiếu thể loại nào.
//
// Chuyện này đã xảy ra thật: cuốn sách 8 chương trong lần chạy thử cấu hình
// `style: "tien_hiep"` và vì thế không nhận được style-reference lẫn arc-template nào.
//
// Đọc từ assets lúc chạy chứ không viết cứng: người dùng thả thêm `styles/*.md` vào thư
// mục ghi đè của mình thì danh sách phải lớn theo, nếu không giao diện lại nói sai lần nữa.
func kieuVanCoThat() []string {
	b := assets.Load("", assets.LoadOptions{})
	ten := make([]string, 0, len(b.Styles))
	for k := range b.Styles {
		ten = append(ten, k)
	}
	sort.Strings(ten)
	return ten
}

type nhaCungCapRa struct {
	Ten          string                  `json:"name"`
	Loai         string                  `json:"type,omitempty"`
	BaseURL      string                  `json:"base_url,omitempty"`
	CoKhoa       bool                    `json:"api_key_set"`
	KhoaChe      string                  `json:"api_key_masked,omitempty"`
	Models       []bootstrap.ModelConfig `json:"models,omitempty"`
	KhongCanKhoa bool                    `json:"api_key_optional,omitempty"`
}

// handleDocCauHinh — GET /api/config
func (s *server) handleDocCauHinh(w http.ResponseWriter, r *http.Request) {
	// Ở ĐÂY dùng bản đã trộn, không phải tệp đích: người dùng cần thấy cái đang CÓ HIỆU
	// LỰC. Chỉ đường GHI mới phải đọc riêng tệp đích.
	cfg, err := bootstrap.LoadConfig()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}

	ncc := make([]nhaCungCapRa, 0, len(cfg.Providers))
	for ten, pc := range cfg.Providers {
		ncc = append(ncc, nhaCungCapRa{
			Ten: ten, Loai: pc.Type, BaseURL: pc.BaseURL,
			CoKhoa: pc.APIKey != "", KhoaChe: cheKhoa(pc.APIKey),
			Models: pc.Models,
		})
	}
	sort.Slice(ncc, func(i, j int) bool { return ncc[i].Ten < ncc[j].Ten })

	// Cuốn nào đang mở engine: đổi cấu hình KHÔNG ăn vào engine đang chạy (nó giữ bản
	// `cfg` từ lúc host.New). Giao diện phải nói rõ điều đó thay vì để người dùng tưởng
	// mình vừa đổi model của lượt đang chạy.
	dangMo := []string{}
	if s.may != nil {
		s.may.mu.Lock()
		for id := range s.may.dang {
			dangMo = append(dangMo, id)
		}
		s.may.mu.Unlock()
		sort.Strings(dangMo)
	}

	writeJSON(w, map[string]any{
		"needs_setup":      bootstrap.NeedsSetup(),
		"path":             bootstrap.EffectiveConfigPath(),
		"provider":         cfg.Provider,
		"model":            cfg.ModelName,
		"reasoning_effort": cfg.ReasoningEffort,
		"style":            cfg.Style,
		"styles":           kieuVanCoThat(),
		"roles":            cfg.Roles,
		"role_names":       vaiCoTheDoi,
		"providers":        ncc,
		"presets":          mauNhaCungCap(),
		"engine_open":      dangMo,
	})
}

// thanCauHinh là thân của PUT /api/config. Mọi trường là con trỏ: vắng = không đổi.
//
// Dùng con trỏ chứ không dùng chuỗi rỗng làm "không đổi", vì với `style` và `api_key` thì
// chuỗi rỗng là một giá trị HỢP LỆ có nghĩa riêng ("không đặt"). Gộp hai nghĩa vào một
// biểu diễn là đúng lớp lỗi `omitempty` trên số đã gặp ở `Dimension.Score`, nơi điểm 0 bị
// nuốt thành "không có điểm".
type thanCauHinh struct {
	Provider        *string `json:"provider,omitempty"`
	Model           *string `json:"model,omitempty"`
	ReasoningEffort *string `json:"reasoning_effort,omitempty"`
	Style           *string `json:"style,omitempty"`

	NhaCungCap *struct {
		Ten     string                  `json:"name"`
		Loai    string                  `json:"type,omitempty"`
		BaseURL *string                 `json:"base_url,omitempty"`
		APIKey  *string                 `json:"api_key,omitempty"`
		Models  []bootstrap.ModelConfig `json:"models,omitempty"`
	} `json:"provider_config,omitempty"`

	// Roles là model MẶC ĐỊNH theo vai, áp cho mọi lượt chạy sau.
	//
	// # Vì sao nó THAY CẢ MAP chứ không trộn từng khóa
	//
	// Một vai không có mặt trong map nghĩa là "thừa hưởng mặc định" — đó là cách duy nhất
	// nói ra việc BỎ một ghi đè. Trộn từng khóa thì thêm được mà không bao giờ xóa được,
	// và bề mặt sẽ có một ô người dùng đặt rồi không gỡ ra được nữa.
	//
	// Con trỏ vì `nil` (không gửi) và `{}` (gửi map rỗng = gỡ hết ghi đè) là hai ý định
	// khác nhau — cùng lý lẽ đã ghi cho `Style` và `APIKey` ở trên.
	//
	// `GET /api/config` đã trả `roles` từ lâu; trước bản này nó ĐỌC được mà không GHI
	// được, nên bề mặt Cài đặt chung sẽ phải hiện một bảng chỉ để nhìn. Đó đúng là khiếm
	// khuyết mà màn Cài đặt chung tồn tại để xoá.
	Roles *map[string]bootstrap.RoleConfig `json:"roles,omitempty"`

	XoaNhaCungCap *string `json:"remove_provider,omitempty"`
}

// handleGhiCauHinh — PUT /api/config
func (s *server) handleGhiCauHinh(w http.ResponseWriter, r *http.Request) {
	var than thanCauHinh
	if err := docThan(r, &than); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}

	duong := bootstrap.EffectiveConfigPath()
	if duong == "" {
		writeErr(w, http.StatusInternalServerError,
			fmt.Errorf("không xác định được đường dẫn tệp cấu hình"))
		return
	}
	// Đọc ĐÚNG tệp đích. `LoadConfigFile` lỗi khi tệp không tồn tại, và đó là ca bình
	// thường ở lần cài đầu — nên coi lỗi đọc là "bắt đầu từ cấu hình trống" chứ không
	// chặn. Hướng sai duy nhất của việc này là ghi đè một tệp hỏng cú pháp, mà người dùng
	// web thì không có cách nào khác để sửa tệp hỏng đó.
	cfg, err := bootstrap.LoadConfigFile(duong)
	if err != nil {
		cfg = bootstrap.Config{}
	}
	if cfg.Providers == nil {
		cfg.Providers = map[string]bootstrap.ProviderConfig{}
	}

	if than.NhaCungCap != nil {
		n := than.NhaCungCap
		if n.Ten == "" {
			writeErr(w, http.StatusBadRequest, fmt.Errorf("thiếu tên nhà cung cấp"))
			return
		}
		pc := cfg.Providers[n.Ten] // giữ nguyên extra_body / extra / timeout đã có
		if n.Loai != "" {
			pc.Type = n.Loai
		}
		if n.BaseURL != nil {
			pc.BaseURL = *n.BaseURL
		}
		// Đây là điểm mấu chốt của "khóa một chiều": nil nghĩa là giao diện không gửi
		// khóa (vì nó không bao giờ nhận được khóa), nên phải GIỮ khóa cũ. Nếu chỗ này
		// gán thẳng thì mỗi lần người dùng đổi base_url là khóa bị xóa sạch.
		if n.APIKey != nil {
			pc.APIKey = *n.APIKey
		}
		if n.Models != nil {
			pc.Models = n.Models
		}
		cfg.Providers[n.Ten] = pc
	}

	if than.XoaNhaCungCap != nil {
		delete(cfg.Providers, *than.XoaNhaCungCap)
	}
	if than.Provider != nil {
		cfg.Provider = *than.Provider
	}
	if than.Model != nil {
		cfg.ModelName = *than.Model
	}
	if than.ReasoningEffort != nil {
		cfg.ReasoningEffort = *than.ReasoningEffort
	}
	if than.Roles != nil {
		// Map rỗng → `nil`, không phải `map[]{}`: `Roles` mang `omitempty`, nên một map rỗng
		// vẫn rụng khỏi JSON lúc ghi. Đặt nil tường minh để thứ nằm trên đĩa khớp với thứ
		// trong bộ nhớ, thay vì để hai lượt ghi liên tiếp cho hai kết quả khác nhau.
		if len(*than.Roles) == 0 {
			cfg.Roles = nil
		} else {
			cfg.Roles = *than.Roles
		}
	}
	if than.Style != nil {
		if err := kiemKieuVan(*than.Style); err != nil {
			writeErr(w, http.StatusBadRequest, err)
			return
		}
		cfg.Style = *than.Style
	}

	// Ghi tệp đích, rồi kiểm bản ĐÃ TRỘN, và hoàn nguyên nếu không dùng được.
	//
	// # Vì sao không kiểm trước khi ghi
	//
	// Bản đầu kiểm `ValidateBase` trên riêng tệp đích, và nó SAI: tệp project hợp lệ khi
	// chỉ chứa phần ghi đè (ví dụ đúng một dòng `style`), còn provider/khóa nằm ở lớp
	// global. Kiểm tệp đích một mình thì không bao giờ lưu được một override như thế —
	// tức chặn đúng cách dùng mà `EffectiveConfigPath` tồn tại để phục vụ.
	//
	// Cái phải hợp lệ là thứ engine SẼ NẠP, tức `LoadConfig()` sau khi ghi. Nên trình tự
	// là ghi → nạp lại theo đúng đường thật → kiểm → hoàn nguyên nếu hỏng. Dùng chính
	// `LoadConfig` chứ không tự dựng lại phép trộn: một bản trộn viết tay sẽ trôi khỏi
	// `mergeConfig` và lúc đó phép kiểm nói về một cấu hình không ai nạp.
	// errCu != nil nghĩa là TRƯỚC ĐÓ không có tệp — cần cho việc hoàn nguyên đúng cách:
	// hoàn nguyên về "không có tệp" là XÓA, không phải ghi lại chuỗi rỗng.
	cu, errCu := os.ReadFile(duong)
	if err := bootstrap.SaveConfig(duong, cfg); err != nil {
		writeErr(w, http.StatusInternalServerError, fmt.Errorf("ghi cấu hình: %w", err))
		return
	}
	tron, err := bootstrap.LoadConfig()
	if err == nil {
		tron.FillDefaults()
		err = tron.ValidateBase()
	}
	if err != nil {
		// Hoàn nguyên. Studio là giao diện duy nhất, nên để lại một cấu hình hỏng là khóa
		// người dùng ra khỏi công cụ của họ — trên web không có `vim` để sửa tệp.
		if errCu == nil {
			_ = os.WriteFile(duong, cu, 0o600)
		} else {
			_ = os.Remove(duong) // trước đó không có tệp thì đừng để lại tệp nửa vời
		}
		writeErr(w, http.StatusBadRequest, fmt.Errorf("cấu hình chưa dùng được: %w", err))
		return
	}

	// Engine đang mở giữ bản cfg từ lúc host.New, nên thay đổi chỉ ăn từ lượt mở sau.
	// Trả về để giao diện nói đúng, không hứa hẹn quá.
	canMoLai := []string{}
	if s.may != nil {
		s.may.mu.Lock()
		for id := range s.may.dang {
			canMoLai = append(canMoLai, id)
		}
		s.may.mu.Unlock()
		sort.Strings(canMoLai)
	}
	writeJSON(w, map[string]any{
		"saved":           true,
		"path":            duong,
		"reopen_to_apply": canMoLai,
	})
}

func kiemKieuVan(k string) error {
	if k == "" {
		return nil // rỗng = mặc định, hợp lệ
	}
	for _, c := range kieuVanCoThat() {
		if c == k {
			return nil
		}
	}
	return fmt.Errorf("kiểu văn %q không có thật nên sẽ bị bỏ qua âm thầm; chọn một trong: %v",
		k, kieuVanCoThat())
}

// mauNhaCungCap là các nhà cung cấp dựng sẵn, lấy đúng danh sách của trình cài TUI.
//
// Chép sang đây thay vì xuất `setupProviders` ra: cấu trúc `setupProvider` của bootstrap
// mang cả cờ điều khiển luồng TUI (`needType`, `apiKeyOptional`) lẫn nhãn đã dịch, và xuất
// nó ra sẽ khóa hình dạng nội bộ của bootstrap vào một khế ước HTTP. Cái giá là danh sách
// có thể trôi; đổi lại chỉ là một danh sách gợi ý, và người dùng luôn nhập tay được.
func mauNhaCungCap() []map[string]any {
	return []map[string]any{
		{"name": "openrouter", "label": "OpenRouter", "type": "openai", "base_url": "https://openrouter.ai/api/v1"},
		{"name": "anthropic", "label": "Anthropic", "type": "anthropic"},
		{"name": "gemini", "label": "Gemini", "type": "gemini"},
		{"name": "openai", "label": "OpenAI", "type": "openai"},
		{"name": "deepseek", "label": "DeepSeek", "type": "openai", "base_url": "https://api.deepseek.com/v1"},
		{"name": "", "label": "Tự nhập (proxy / gateway riêng)", "type": "openai"},
	}
}
