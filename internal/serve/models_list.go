package serve

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/huuhoa143/ainovel-studio/internal/bootstrap"
)

// handleLietKeModel — GET /api/models?provider=<tên>
//
// # Vì sao bề mặt này tồn tại
//
// Ô Model trước đây là một ô chữ tự do, và cái giá của nó đã đo được trên máy thật: người
// dùng đặt provider dùng `cx/gpt-5.5`, nhưng ô "model mặc định" vẫn để `gpt-5.5`. Router
// không có model tên đó nên trả 404, Arbiter chết, và thông báo hiện lên là
// `model_not_found: No active credentials for provider: openai` — một câu nói về CREDENTIALS
// trong khi lỗi thật là SAI TÊN MODEL. Ba lượt tạo hỏng liên tiếp vì đúng chỗ này.
//
// Không ô chữ tự do nào tự bắt được lỗi ấy. Danh sách thì bắt được, vì nó đến từ chính nhà
// cung cấp.
//
// # Vì sao liệt kê model CŨNG LÀ kiểm tra kết nối
//
// Bề mặt này cố tình không có nút "kiểm tra" riêng gọi thử một lượt chat. Một lượt chat thử
// tiêu tiền thật, và nó kiểm được đúng những thứ mà `/models` đã kiểm rồi:
//
//	gọi được  → địa chỉ gốc đúng, mạng thông
//	200       → khóa hợp lệ (401/403 thì không)
//	có trong danh sách → tên model có thật
//
// Ba câu hỏi ấy là toàn bộ những gì hỏng ở lượt vừa rồi, và trả lời chúng miễn phí.
//
// Câu thứ tư — model có gọi công cụ được không — thì `/models` không trả lời được, và nó đã
// làm hỏng một lượt thật (xem cong_cu.go). Nên `?tools=1` xin thêm đúng MỘT lượt chat tí hon;
// nút Kiểm tra gửi cờ đó, bộ chọn model nạp danh sách thì không.
func (s *server) handleLietKeModel(w http.ResponseWriter, r *http.Request) {
	// Bản TRỘN, đúng nguồn `GET /api/config` hiện ra. Bản trước đọc riêng tệp đích, nên một
	// nhà cung cấp hay khóa nằm ở tầng toàn cục làm thẻ nói "đã đặt khóa" còn nút Kiểm tra
	// nói "chưa có khóa" — hai câu trả lời cho cùng một câu hỏi trên cùng một màn.
	cfg, err := bootstrap.LoadConfig()
	if err != nil {
		writeErr(w, http.StatusBadRequest, fmt.Errorf("đọc cấu hình: %w", err))
		return
	}

	ten := strings.TrimSpace(r.URL.Query().Get("provider"))
	if ten == "" {
		ten = cfg.Provider
	}
	if ten == "" {
		writeErr(w, http.StatusBadRequest, fmt.Errorf("chưa có nhà cung cấp nào để hỏi"))
		return
	}
	pc, ok := cfg.Providers[ten]
	if !ok {
		writeErr(w, http.StatusNotFound, fmt.Errorf("không có nhà cung cấp %q trong cấu hình", ten))
		return
	}
	var kiem *yeuCauCongCu
	if q := r.URL.Query(); q.Get("tools") == "1" {
		model := strings.TrimSpace(q.Get("model"))
		if model == "" {
			model = modelDangDungO(&cfg, ten, pc)
		}
		kiem = &yeuCauCongCu{model: model}
	}
	lietKeTheo(w, r, ten, pc, kiem)
}

// handleThuKetNoi — POST /api/models/try
//
// Kiểm một nhà cung cấp ĐANG GÕ, trước khi lưu. Biểu mẫu thêm/sửa cần trả lời "khóa này,
// địa chỉ này có sống không, phục vụ model nào" TRƯỚC khi người dùng bấm Lưu — nếu không, bước
// chọn model không có gì để chọn, và lưu một khóa sai là đổi cấu hình thật chỉ để thử.
//
// Thân: {name, type?, base_url?, api_key?}. Trường vắng lấy từ mục đã lưu cùng tên (nên khi
// sửa, không gõ lại khóa vẫn kiểm được bằng khóa cũ). Không ghi gì.
func (s *server) handleThuKetNoi(w http.ResponseWriter, r *http.Request) {
	var than struct {
		Ten     string  `json:"name"`
		Loai    *string `json:"type,omitempty"`
		BaseURL *string `json:"base_url,omitempty"`
		APIKey  *string `json:"api_key,omitempty"`
		// Model để thử gọi công cụ. Vắng thì thử `auto` nếu nhà cung cấp có, không thì báo
		// "chưa kiểm" — xem `lietKeTheo`.
		Model string `json:"model,omitempty"`
		Tools bool   `json:"tools,omitempty"`
	}
	if err := docThan(r, &than); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	ten := strings.TrimSpace(than.Ten)
	var pc bootstrap.ProviderConfig
	if cfg, err := bootstrap.LoadConfig(); err == nil && ten != "" {
		pc = cfg.Providers[ten]
	}
	if than.Loai != nil {
		pc.Type = strings.TrimSpace(*than.Loai)
	}
	if than.BaseURL != nil {
		pc.BaseURL = strings.TrimSpace(*than.BaseURL)
	}
	if than.APIKey != nil {
		pc.APIKey = *than.APIKey
	}
	var kiem *yeuCauCongCu
	if than.Tools {
		kiem = &yeuCauCongCu{model: strings.TrimSpace(than.Model)}
	}
	lietKeTheo(w, r, ten, pc, kiem)
}

// lietKeTheo hỏi danh sách model của một nhà cung cấp đã dựng sẵn cấu hình.
//
// `kiem` khác nil thì sau khi liệt kê xong còn thử MỘT lượt gọi công cụ — xem `thuGoiCongCu`.
func lietKeTheo(w http.ResponseWriter, r *http.Request, ten string, pc bootstrap.ProviderConfig, kiem *yeuCauCongCu) {
	if strings.TrimSpace(pc.APIKey) == "" && !khongCanKhoa(ten, pc) {
		writeErr(w, http.StatusBadRequest, fmt.Errorf(
			"nhà cung cấp %q chưa có khóa API — nhập khóa rồi mới hỏi được danh sách model", ten))
		return
	}

	duongModel, dat, err := diaChiLietKe(ten, pc)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}

	ctx, huy := context.WithTimeout(r.Context(), 20*time.Second)
	defer huy()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, duongModel, nil)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	dat(req)

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		// Không gọi được là một câu trả lời CÓ ÍCH, không phải lỗi máy chủ của ta: địa chỉ
		// gốc sai hoặc mạng chặn. Trả 502 kèm nguyên văn để giao diện in ra được.
		writeErr(w, http.StatusBadGateway, fmt.Errorf(
			"không gọi được %s: %w", duongModel, err))
		return
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		writeErr(w, http.StatusBadGateway, fmt.Errorf(
			"%s trả HTTP %d — %s", duongModel, res.StatusCode, ngheoNan(res.StatusCode)))
		return
	}

	// CỬA SỔ NGỮ CẢNH được đọc luôn, và đó là sửa một lỗ hổng đo được.
	//
	// Bản trước chỉ lấy `id`/`name` rồi vứt phần còn lại. Hệ quả: `ResolveContextWindow` không
	// có nguồn nào cho nhà cung cấp này nên rơi xuống registry TOÀN CỤC — thứ nói về model
	// GỐC của hãng, không phải về cái gateway đang phục vụ.
	//
	// ĐO ĐƯỢC trên máy người dùng: `9Router` khai `cx/gpt-5.6-luna` có cửa sổ 272.000, nhưng
	// registry khớp `gpt-5.6-luna` của openai và trả 1.050.000. Engine tưởng mình có gấp bốn
	// lần chỗ thật, nên bộ nén ngữ cảnh không nén cho tới một ngưỡng không bao giờ tới —
	// còn gateway thì chặn ở 272.000. Cùng một tên model có thể có trần khác nhau ở hai
	// gateway, nên nguồn ĐÚNG luôn là chính gateway đang gọi.
	//
	// Ba hình dạng đã gặp: `capabilities.contextWindow` (9Router), `context_window`,
	// `context_length` (OpenRouter). Đọc cả ba, lấy cái đầu tiên khác 0.
	//
	// # Vì sao mọi trường cửa sổ đều là `json.RawMessage`
	//
	// Cửa sổ là thứ ta MUỐN; danh sách model là thứ ta CẦN — nó bắt cái typo `cx/gpt-5.5` vs
	// `gpt-5.5` kể trên. Khai kiểu chặt cho phần muốn là cho phép nó giết phần cần: một lỗi
	// giải mã ở BẤT KỲ trường nào cũng làm cả lượt đọc hỏng và trả về danh sách rỗng.
	//
	// ĐO ĐƯỢC, 5 trong 7 hình dạng thật gãy khi khai `int`/struct — trong khi bản chỉ có
	// `id`/`name` đọc trôi cả 7:
	//
	//	"capabilities": ["vision","tools"]   → cannot unmarshal array into ... type suc
	//	"capabilities": true                 → cannot unmarshal bool into ... type suc
	//	"context_length": "128000"           → cannot unmarshal string into ... type int
	//	"context_length": 128000.0           → cannot unmarshal number into ... type int
	//
	// `capabilities` dạng mảng là hình dạng phổ biến, nên đây không phải ca hiếm. Luật rút ra:
	// một trường phụ đọc từ payload của người khác không bao giờ được phép làm rơi trường
	// chính. Hình dạng lạ thì mất CỬA SỔ, không mất DANH SÁCH.
	var than struct {
		Data []struct {
			ID            string          `json:"id"`
			Name          string          `json:"name"`
			ContextWindow json.RawMessage `json:"context_window"`
			ContextLength json.RawMessage `json:"context_length"`
			Capabilities  json.RawMessage `json:"capabilities"`
		} `json:"data"`
		// Anthropic trả cùng dạng `data[]`, Gemini trả `models[]`.
		Models []struct {
			Name          string          `json:"name"`
			ContextWindow json.RawMessage `json:"context_window"`
		} `json:"models"`
	}
	if err := json.NewDecoder(res.Body).Decode(&than); err != nil {
		writeErr(w, http.StatusBadGateway, fmt.Errorf("%s trả nội dung không đọc được: %w", duongModel, err))
		return
	}

	ten2 := map[string]bool{}
	cua := map[string]int{}
	ghiCua := func(ten string, ws ...int) {
		if ten == "" {
			return
		}
		ten2[ten] = true
		for _, w := range ws {
			if w > 0 {
				cua[ten] = w
				return
			}
		}
	}
	for _, m := range than.Data {
		ghiCua(m.ID, cuaTrongNang(m.Capabilities), soMem(m.ContextWindow), soMem(m.ContextLength))
	}
	for _, m := range than.Models {
		// Gemini trả "models/gemini-2.5-pro"; cắt tiền tố cho khớp thứ người dùng gõ.
		ghiCua(strings.TrimPrefix(m.Name, "models/"), soMem(m.ContextWindow))
	}

	ds := make([]string, 0, len(ten2))
	for k := range ten2 {
		ds = append(ds, k)
	}
	sort.Strings(ds)

	ra := map[string]any{
		// `windows` đi RIÊNG khỏi `models` chứ không gộp thành mảng đối tượng: `models` đang
		// nạp thẳng vào `datalist` của giao diện, và đổi hình dạng của nó là bắt mọi chỗ đọc
		// phải sửa theo cho một thông tin mà phần lớn trong số đó không cần.
		"windows":  cua,
		"provider": ten,
		"models":   ds,
		"count":    len(ds),
	}
	if kiem != nil {
		model := kiem.model
		if model == "" && ten2["auto"] {
			model = "auto"
		}
		ra["tools"] = thuGoiCongCu(r.Context(), ten, pc, model)
	}
	writeJSON(w, ra)
}

// soMem đọc một con số từ JSON thô, và trả 0 thay vì LỖI khi hình dạng không phải số.
//
// Nhận cả `272000`, `272000.0` và `"272000"` — ba cách các gateway đã dùng để nói cùng một
// điều. Không nhận thì mất cửa sổ ở gateway đó; khai kiểu chặt để bắt nhận thì mất cả danh
// sách model, vì một lỗi giải mã làm hỏng nguyên lượt đọc.
func soMem(raw json.RawMessage) int {
	s := strings.TrimSpace(string(raw))
	if s == "" || s == "null" {
		return 0
	}
	// Chuỗi bọc số: `"context_length": "128000"`.
	if s[0] == '"' {
		var trong string
		if json.Unmarshal(raw, &trong) != nil {
			return 0
		}
		s = strings.TrimSpace(trong)
	}
	// `ParseFloat` chứ không `Atoi`: `128000.0` là số hợp lệ trong JSON và đã gặp thật.
	f, err := strconv.ParseFloat(s, 64)
	if err != nil || f <= 0 || f > math.MaxInt32 {
		return 0
	}
	return int(f)
}

// cuaTrongNang moi cửa sổ ra khỏi khối `capabilities` khi khối đó là một ĐỐI TƯỢNG.
//
// 9Router để cửa sổ ở đây. Nhiều gateway khác lại dùng đúng tên khóa ấy cho một MẢNG năng lực
// (`["vision","tools"]`) hoặc một cờ bool — với chúng câu trả lời đúng là "không khai cửa sổ",
// không phải "payload hỏng".
func cuaTrongNang(raw json.RawMessage) int {
	s := strings.TrimSpace(string(raw))
	if s == "" || s[0] != '{' {
		return 0
	}
	var nang struct {
		ContextWindow json.RawMessage `json:"contextWindow"`
		CuaSo         json.RawMessage `json:"context_window"`
	}
	if json.Unmarshal(raw, &nang) != nil {
		return 0
	}
	if w := soMem(nang.ContextWindow); w > 0 {
		return w
	}
	return soMem(nang.CuaSo)
}

// diaChiLietKe trả về địa chỉ liệt kê model và hàm đặt header xác thực cho từng giao thức.
//
// Trả lỗi tường minh cho giao thức chưa dựng, thay vì đoán một đường dẫn rồi để người dùng
// nhận một lỗi 404 khó hiểu từ phía nhà cung cấp.
func diaChiLietKe(ten string, pc bootstrap.ProviderConfig) (string, func(*http.Request), error) {
	goc := strings.TrimRight(strings.TrimSpace(pc.BaseURL), "/")
	loai := strings.ToLower(strings.TrimSpace(pc.Type))
	if loai == "" {
		// Mục không khai type suy giao thức theo TÊN — đúng luật engine dùng
		// (`ProviderConfig.ProviderType`). Rơi thẳng về openai thì nút Kiểm tra của mục
		// `anthropic` do TUI tạo hỏi nhầm cổng và báo 401 cho một khóa đang sống.
		if t, err := pc.ProviderType(ten); err == nil {
			loai = strings.ToLower(t)
		} else {
			loai = "openai"
		}
	}

	switch loai {
	case "openai":
		if goc == "" {
			goc = "https://api.openai.com/v1"
		}
		return goc + "/models", func(r *http.Request) {
			if pc.APIKey != "" {
				r.Header.Set("Authorization", "Bearer "+pc.APIKey)
			}
		}, nil

	case "anthropic":
		if goc == "" {
			goc = "https://api.anthropic.com/v1"
		}
		// Anthropic mặc định trả 20 mục mỗi trang; xin trang lớn nhất để danh sách đủ.
		return goc + "/models?limit=1000", func(r *http.Request) {
			r.Header.Set("x-api-key", pc.APIKey)
			r.Header.Set("anthropic-version", "2023-06-01")
		}, nil

	case "gemini":
		if goc == "" {
			goc = "https://generativelanguage.googleapis.com/v1beta"
		}
		// Gemini mặc định 50 mục mỗi trang.
		return goc + "/models?pageSize=1000", func(r *http.Request) {
			r.Header.Set("x-goog-api-key", pc.APIKey)
		}, nil

	default:
		return "", nil, fmt.Errorf(
			"chưa liệt kê được model cho giao thức %q — gõ tay tên model vào ô bên cạnh", loai)
	}
}

// ngheoNan dịch mã HTTP thành câu nói ra NGUYÊN NHÂN, không phải lặp lại con số.
func ngheoNan(ma int) string {
	switch ma {
	case http.StatusUnauthorized, http.StatusForbidden:
		return "khóa API sai hoặc hết hạn"
	case http.StatusNotFound:
		return "địa chỉ gốc không có đường /models — kiểm tra lại Địa chỉ gốc"
	case http.StatusTooManyRequests:
		return "bị giới hạn tần suất, thử lại sau"
	default:
		return "nhà cung cấp từ chối yêu cầu"
	}
}
