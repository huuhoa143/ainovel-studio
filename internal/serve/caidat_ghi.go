package serve

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/voocel/agentcore/llm"

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
//  2. **Một tệp.** Đọc và ghi đều đi về đúng tệp `serve --config` — cũng là tệp engine nạp
//     mỗi lần mở. Không có tầng nào khác để một giá trị vừa lưu bị che.
//
//  3. **Kiểm thứ engine SẼ NẠP, và hoàn nguyên nếu hỏng.** Studio là giao diện duy nhất,
//     nên một cấu hình sai ghi thành công sẽ khóa người dùng ra khỏi chính công cụ của họ
//     — trong app không có `vim` để sửa tệp.

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
	// Keyless là lời khai tường minh lưu trong tệp; api_key_optional là kết luận (khai keyless,
	// hoặc tên/địa chỉ đã biết là không cần khóa).
	Keyless bool `json:"keyless"`
}

// handleDocCauHinh — GET /api/config
//
// Tệp đọc không được KHÔNG trả 500: giao diện cần đứng được ở màn cài đặt để người dùng nhập
// lại. Trả `needs_setup: true` kèm `config_error` nói rõ tệp nào hỏng ở đâu. Với tệp hỏng cú
// pháp, lượt PUT kế tiếp cất nó sang `<tệp>.broken-<mốc UTC>` rồi ghi tệp mới từ rỗng (xem
// handleGhiCauHinh).
func (s *server) handleDocCauHinh(w http.ResponseWriter, r *http.Request) {
	cfg, err := s.may.napCauHinh()
	loiTep := ""
	if err != nil {
		loiTep = err.Error()
		cfg = bootstrap.Config{}
	}

	ncc := make([]nhaCungCapRa, 0, len(cfg.Providers))
	for ten, pc := range cfg.Providers {
		ncc = append(ncc, nhaCungCapRa{
			Ten: ten, Loai: pc.Type, BaseURL: pc.BaseURL,
			CoKhoa: pc.APIKey != "", KhoaChe: cheKhoa(pc.APIKey),
			Models: pc.Models, KhongCanKhoa: bootstrap.KhongCanKhoa(ten, pc), Keyless: pc.Keyless,
		})
	}
	sort.Slice(ncc, func(i, j int) bool { return ncc[i].Ten < ncc[j].Ten })

	// Cuốn nào đang mở engine: đổi cấu hình KHÔNG ăn vào engine đang chạy (nó giữ bản
	// `cfg` từ lúc host.New) cho tới khi bấm "Áp dụng ngay" hoặc mở lại phiên.
	dangMo := s.cuonDangMo()

	ra := map[string]any{
		"needs_setup":      loiTep != "" || bootstrap.NeedsSetup(cfg),
		"path":             s.may.cauHinh,
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
		// Phiên nào đang chạy thiết lập model KHÁC tệp — chỉ những phiên này cần "áp dụng ngay".
		"engine_stale": s.cuonCauHinhCu(),
	}
	if loiTep != "" {
		if errors.Is(err, bootstrap.ErrTepHong) {
			loiTep += " — lưu cấu hình mới sẽ cất tệp này thành " +
				filepath.Base(duongSaoLuuTepHong(s.may.cauHinh, mocBayGio())) + " cạnh nó, không xóa"
		}
		ra["config_error"] = loiTep
	}
	writeJSON(w, ra)
}

// cuonCauHinhCu: các cuốn đang mở mà phần model của phiên lệch tệp cấu hình. Đọc lỗi thì tính
// là lệch — nói thừa một dải cảnh báo còn hơn giấu một phiên đang chạy model cũ.
func (s *server) cuonCauHinhCu() []string {
	cu := []string{}
	if s.may == nil {
		return cu
	}
	s.may.mu.Lock()
	ds := make([]*phienMay, 0, len(s.may.dang))
	for _, p := range s.may.dang {
		ds = append(ds, p)
	}
	s.may.mu.Unlock()
	for _, p := range ds {
		if khop, err := p.eng.ModelConfigInSync(); err != nil || !khop {
			cu = append(cu, p.id)
		}
	}
	sort.Strings(cu)
	return cu
}

func (s *server) cuonDangMo() []string {
	dangMo := []string{}
	if s.may == nil {
		return dangMo
	}
	s.may.mu.Lock()
	for id := range s.may.dang {
		dangMo = append(dangMo, id)
	}
	s.may.mu.Unlock()
	sort.Strings(dangMo)
	return dangMo
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
		Ten string `json:"name"`
		// Loai là con trỏ vì "" có nghĩa riêng: "suy giao thức theo tên" (mục do TUI tạo,
		// như `anthropic` không khai type). Bản trước coi "" là "không đổi" còn biểu mẫu thì
		// luôn gửi `openai` — sửa base_url của một mục như thế là âm thầm đổi giao thức.
		Loai    *string                 `json:"type,omitempty"`
		BaseURL *string                 `json:"base_url,omitempty"`
		APIKey  *string                 `json:"api_key,omitempty"`
		Models  []bootstrap.ModelConfig `json:"models,omitempty"`
		// Keyless: nil = không đổi, true/false = khai/bỏ khai "không cần khóa API".
		Keyless *bool `json:"keyless,omitempty"`
	} `json:"provider_config,omitempty"`

	// Roles là model MẶC ĐỊNH theo vai, áp cho mọi lượt chạy sau.
	//
	// # Vì sao nó THAY CẢ MAP chứ không trộn từng khóa
	//
	// Một vai không có mặt trong map nghĩa là "thừa hưởng mặc định" — đó là cách duy nhất
	// nói ra việc BỎ một ghi đè. Trộn từng khóa thì thêm được mà không bao giờ xóa được.
	//
	// Con trỏ vì `nil` (không gửi) và `{}` (gửi map rỗng = gỡ hết ghi đè) là hai ý định
	// khác nhau. Mục gửi lên mang đủ `fallbacks` + `reasoning_effort`; giao diện phải gửi
	// lại nguyên vẹn những gì nó không đổi (xem `vaiGuiLai` phía web).
	Roles *map[string]bootstrap.RoleConfig `json:"roles,omitempty"`

	XoaNhaCungCap *string `json:"remove_provider,omitempty"`
}

// handleGhiCauHinh — PUT /api/config
//
// # Trình tự
//
//  1. Kiểm THÂN: những giá trị tự nó đã vô nghĩa (model rỗng, giao thức lạ) bị từ chối
//     trước khi đụng tệp.
//  2. Đọc tệp, áp thay đổi, ghi.
//  3. Nạp lại theo đúng đường engine nạp, rồi kiểm hai điều: `ValidateBase`, và cặp
//     provider/model vừa chọn có thật. Hỏng điều nào thì hoàn nguyên tệp.
func (s *server) handleGhiCauHinh(w http.ResponseWriter, r *http.Request) {
	var than thanCauHinh
	if err := docThan(r, &than); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if err := kiemThanCauHinh(&than); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}

	duong := s.may.cauHinh
	// Không có tệp là ca bình thường ở lần cài đầu (napCauHinh trả cấu hình rỗng). Tệp HỎNG cú
	// pháp thì bắt đầu từ rỗng — người dùng app không có cách nào khác để sửa nó — nhưng tệp cũ
	// được CẤT SANG BÊN, không bao giờ xóa: trong đó có thể còn khóa của những nhà cung cấp khác.
	// Lỗi vào/ra (quyền, ổ đĩa) thì không đụng gì cả.
	cfg, err := s.may.napCauHinh()
	saoLuu := ""
	switch {
	case err == nil:
	case errors.Is(err, bootstrap.ErrTepHong):
		saoLuu = duongSaoLuuTepHong(duong, mocBayGio())
		if err := os.Rename(duong, saoLuu); err != nil {
			writeErr(w, http.StatusInternalServerError, fmt.Errorf("cất tệp cấu hình hỏng: %w", err))
			return
		}
		cfg = bootstrap.Config{}
	default:
		writeErr(w, http.StatusInternalServerError, fmt.Errorf("đọc cấu hình: %w", err))
		return
	}
	// Bản TRƯỚC lượt ghi: cần để biết vai nào thật sự đổi (chỉ kiểm cặp model của chỗ đổi — một
	// cặp cũ đã lệch không được phép chặn một lượt lưu không liên quan).
	truoc := bootstrap.CloneConfig(cfg)
	if cfg.Providers == nil {
		cfg.Providers = map[string]bootstrap.ProviderConfig{}
	}
	apThanCauHinh(&cfg, &than)

	cu, errCu := os.ReadFile(duong)
	if err := bootstrap.SaveConfig(duong, cfg); err != nil {
		writeErr(w, http.StatusInternalServerError, fmt.Errorf("ghi cấu hình: %w", err))
		return
	}
	hoanNguyen := func() {
		if errCu == nil {
			_ = os.WriteFile(duong, cu, 0o600)
		} else {
			_ = os.Remove(duong) // trước đó không có tệp thì đừng để lại tệp nửa vời
		}
		if saoLuu != "" {
			_ = os.Rename(saoLuu, duong) // lượt hỏng thì trả tệp cũ về chỗ, như chưa có gì xảy ra
		}
	}

	sau, err := s.may.napCauHinh()
	if err == nil {
		// Kiểm trên một BẢN đã điền mặc định — đúng thứ engine dựng.
		kiem := sau
		kiem.FillDefaults()
		err = kiem.ValidateBase()
	}
	if err != nil {
		hoanNguyen()
		writeErr(w, http.StatusBadRequest, fmt.Errorf("cấu hình chưa dùng được: %w", err))
		return
	}
	if err := kiemCapDaChon(truoc, sau, &than); err != nil {
		hoanNguyen()
		writeErr(w, http.StatusBadRequest, err)
		return
	}

	ra := map[string]any{
		"saved":           true,
		"path":            duong,
		"reopen_to_apply": s.cuonDangMo(),
	}
	if saoLuu != "" {
		ra["broken_backup"] = saoLuu
	}
	writeJSON(w, ra)
}

// duongSaoLuuTepHong là chỗ cất tệp cấu hình hỏng trước khi ghi tệp mới: cùng thư mục, thêm
// đuôi mốc giờ UTC để nhiều lần hỏng không đè nhau.
func duongSaoLuuTepHong(duong string, luc time.Time) string {
	return duong + ".broken-" + luc.UTC().Format("20060102T150405Z")
}

// kiemThanCauHinh chặn những giá trị tự nó đã vô nghĩa, trước khi đụng tệp.
func kiemThanCauHinh(than *thanCauHinh) error {
	if than.Provider != nil {
		*than.Provider = strings.TrimSpace(*than.Provider)
		if *than.Provider == "" {
			return fmt.Errorf("nhà cung cấp mặc định không được để trống")
		}
	}
	if than.Model != nil {
		*than.Model = strings.TrimSpace(*than.Model)
		// Model rỗng KHÔNG phải "không đặt": nhà cung cấp mặc định đứng một mình không chạy được.
		if *than.Model == "" {
			return fmt.Errorf("model mặc định không được để trống — chọn một model của nhà cung cấp")
		}
	}
	if than.Style != nil {
		if err := kiemKieuVan(*than.Style); err != nil {
			return err
		}
	}
	if n := than.NhaCungCap; n != nil {
		n.Ten = strings.TrimSpace(n.Ten)
		if n.Ten == "" {
			return fmt.Errorf("thiếu tên nhà cung cấp")
		}
		if strings.ContainsAny(n.Ten, " \t\r\n") {
			return fmt.Errorf("tên nhà cung cấp %q không được chứa khoảng trắng", n.Ten)
		}
		if n.Loai != nil {
			*n.Loai = strings.ToLower(strings.TrimSpace(*n.Loai))
			if *n.Loai != "" && !llm.IsProviderRegistered(*n.Loai) {
				return fmt.Errorf("giao thức %q không được hỗ trợ; chọn một trong: %v",
					*n.Loai, llm.RegisteredProviders())
			}
		}
		if n.BaseURL != nil {
			*n.BaseURL = strings.TrimSpace(*n.BaseURL)
		}
		if n.Models != nil {
			sach := make([]bootstrap.ModelConfig, 0, len(n.Models))
			thay := map[string]bool{}
			for _, m := range n.Models {
				m.Name = strings.TrimSpace(m.Name)
				if m.Name == "" || thay[m.Name] {
					continue
				}
				thay[m.Name] = true
				sach = append(sach, m)
			}
			n.Models = sach
		}
	}
	if than.XoaNhaCungCap != nil {
		*than.XoaNhaCungCap = strings.TrimSpace(*than.XoaNhaCungCap)
	}
	if than.Roles != nil {
		for vai, rc := range *than.Roles {
			rc.Provider = strings.TrimSpace(rc.Provider)
			rc.Model = strings.TrimSpace(rc.Model)
			(*than.Roles)[vai] = rc
		}
	}
	return nil
}

// apThanCauHinh áp thân lên tệp đích.
func apThanCauHinh(cfg *bootstrap.Config, than *thanCauHinh) {
	if n := than.NhaCungCap; n != nil {
		pc := cfg.Providers[n.Ten] // giữ nguyên extra_body / extra / timeout đã có
		if n.Loai != nil {
			pc.Type = *n.Loai
		}
		if n.BaseURL != nil {
			pc.BaseURL = *n.BaseURL
		}
		// "Khóa một chiều": nil nghĩa là giao diện không gửi khóa (vì nó không bao giờ nhận
		// được khóa), nên phải GIỮ khóa cũ.
		if n.APIKey != nil {
			pc.APIKey = *n.APIKey
		}
		if n.Models != nil {
			pc.Models = n.Models
		}
		if n.Keyless != nil {
			pc.Keyless = *n.Keyless
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
		// Map rỗng → `nil`: `Roles` mang `omitempty`, nên đặt nil tường minh để thứ nằm trên
		// đĩa khớp với thứ trong bộ nhớ.
		if len(*than.Roles) == 0 {
			cfg.Roles = nil
		} else {
			cfg.Roles = *than.Roles
		}
	}
	if than.Style != nil {
		cfg.Style = *than.Style
	}
}

// kiemCapDaChon kiểm mọi cặp provider/model mà lượt ghi này CHỌN (mặc định, và từng vai đã
// đổi so với trước): model phải nằm trong danh sách nhà cung cấp đó khai, và nhà cung cấp phải
// có khóa nếu nó không phải gateway không-khóa.
//
// Chỉ kiểm chỗ ĐỔI: một vai cũ đã lệch từ trước không được chặn một lượt lưu kiểu văn.
// Nhà cung cấp không khai model nào thì không có cơ sở nói tên nào sai — cho qua.
func kiemCapDaChon(truoc, sau bootstrap.Config, than *thanCauHinh) error {
	kiem := func(chu, ncc, model string) error {
		pc, ok := sau.Providers[ncc]
		if !ok {
			return fmt.Errorf("%s trỏ vào nhà cung cấp %q không có trong cấu hình", chu, ncc)
		}
		if pc.APIKey == "" && !bootstrap.KhongCanKhoa(ncc, pc) {
			return fmt.Errorf("%s dùng nhà cung cấp %q nhưng nó chưa có khóa API — nhập khóa trước", chu, ncc)
		}
		if len(pc.Models) == 0 {
			return nil
		}
		for _, m := range pc.Models {
			if m.Name == model {
				return nil
			}
		}
		return fmt.Errorf("%s: model %q không có trong danh sách của %q — thêm nó vào danh sách model của nhà cung cấp, hoặc chọn một model có sẵn",
			chu, model, ncc)
	}
	if than.Provider != nil || than.Model != nil {
		if sau.Provider != truoc.Provider || sau.ModelName != truoc.ModelName {
			if err := kiem("Model mặc định", sau.Provider, sau.ModelName); err != nil {
				return err
			}
		}
	}
	if than.Roles != nil {
		for vai, rc := range sau.Roles {
			if rc.IsEffortOnly() {
				continue
			}
			cu, coCu := truoc.Roles[vai]
			if coCu && cu.Provider == rc.Provider && cu.Model == rc.Model {
				continue
			}
			if err := kiem(fmt.Sprintf("Vai %s", vai), rc.Provider, rc.Model); err != nil {
				return err
			}
		}
	}
	return nil
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
