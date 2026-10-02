package serve

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/huuhoa143/ainovel-studio/internal/bootstrap"
)

// # Vì sao nút Kiểm tra giờ thử thêm MỘT lượt gọi công cụ
//
// Liệt kê model trả lời được ba câu (địa chỉ đúng, khóa sống, tên model có thật) và miễn phí.
// Nhưng nó KHÔNG trả lời câu mà cả dây chuyền phụ thuộc: model này có gọi công cụ được không.
// Kiến trúc sư, Người viết và Biên tập viên đều làm việc bằng công cụ.
//
// ĐO ĐƯỢC trên máy người dùng (2026-10-02): `lingoreup · auto` báo "Kết nối được · 306 model"
// trong khi cổng trả `routing_exhausted: 388 routes checked (229 no usable key configured, 159
// model lacks tool-calling)` cho MỌI lượt có công cụ. Nút Kiểm tra xanh, rồi truyện kẹt ở bước
// đầu tiên và engine thử lại mãi. Một dấu ✓ nói sai còn tệ hơn không có dấu nào.
//
// Nên lượt thử này là cái giá đáng trả: một yêu cầu tí hon (`max_tokens` nhỏ, một công cụ rỗng),
// chỉ chạy khi người dùng BẤM Kiểm tra — không chạy khi bộ chọn model nạp danh sách.

// yeuCauCongCu: có mặt = người gọi muốn thử gọi công cụ; `model` rỗng = để `lietKeTheo` tự chọn.
type yeuCauCongCu struct {
	model string
}

// ketQuaCongCu là phần `tools` của câu trả lời liệt kê model.
type ketQuaCongCu struct {
	Model string `json:"model,omitempty"`
	// Checked = đã thật sự gửi lượt thử. false kèm `note` khi không thử được (chưa chọn model,
	// giao thức chưa hỗ trợ) — KHÁC với "thử rồi và hỏng".
	Checked bool   `json:"checked"`
	OK      bool   `json:"ok"`
	Reason  string `json:"reason,omitempty"`
	Note    string `json:"note,omitempty"`
	// Raw là câu gốc của nhà cung cấp, để giao diện đặt vào `title` cho ai cần tra.
	Raw string `json:"raw,omitempty"`
}

// thuGoiCongCu gửi một lượt chat tí hon KÈM một công cụ tới `model` và báo nó có nhận không.
func thuGoiCongCu(ctx context.Context, ten string, pc bootstrap.ProviderConfig, model string) ketQuaCongCu {
	kq := ketQuaCongCu{Model: model}
	if model == "" {
		kq.Note = "Chọn một model rồi bấm Kiểm tra lại để biết model đó có gọi công cụ được không."
		return kq
	}
	loai := loaiGiaoThuc(ten, pc)
	if loai != "openai" {
		kq.Note = fmt.Sprintf("Chưa kiểm được khả năng gọi công cụ với giao thức %s.", loai)
		return kq
	}
	if strings.EqualFold(strings.TrimSpace(pc.API), "responses") {
		kq.Note = "Chưa kiểm được khả năng gọi công cụ với đầu cuối responses."
		return kq
	}

	goc := strings.TrimRight(strings.TrimSpace(pc.BaseURL), "/")
	if goc == "" {
		goc = "https://api.openai.com/v1"
	}
	than, _ := json.Marshal(map[string]any{
		"model":      model,
		"max_tokens": 16,
		"messages": []map[string]string{
			{"role": "user", "content": "Gọi công cụ ping."},
		},
		"tools": []map[string]any{{
			"type": "function",
			"function": map[string]any{
				"name":        "ping",
				"description": "Kiểm tra kết nối.",
				"parameters":  map[string]any{"type": "object", "properties": map[string]any{}},
			},
		}},
	})

	ctx, huy := context.WithTimeout(ctx, 45*time.Second)
	defer huy()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, goc+"/chat/completions", bytes.NewReader(than))
	if err != nil {
		kq.Note = "Không dựng được lượt thử gọi công cụ."
		return kq
	}
	req.Header.Set("Content-Type", "application/json")
	if pc.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+pc.APIKey)
	}

	kq.Checked = true
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		kq.Reason = "không gọi được nhà cung cấp"
		kq.Raw = err.Error()
		return kq
	}
	defer res.Body.Close()
	noiDung, _ := io.ReadAll(io.LimitReader(res.Body, 64<<10))

	if res.StatusCode == http.StatusOK {
		// 200 mà thân là một lỗi bọc trong JSON (vài gateway làm vậy) vẫn là hỏng.
		if loi := loiTrongThan(noiDung); loi != "" {
			kq.Raw = loi
			kq.Reason = dichLyDoCongCu(loi, res.StatusCode)
			return kq
		}
		kq.OK = true
		return kq
	}
	loi := loiTrongThan(noiDung)
	if loi == "" {
		loi = strings.TrimSpace(string(noiDung))
	}
	kq.Raw = rutGon(loi, 400)
	kq.Reason = dichLyDoCongCu(loi, res.StatusCode)
	return kq
}

// loiTrongThan moi câu lỗi ra khỏi thân trả về, chịu cả `{"error":{"message"}}` lẫn
// `{"error":"..."}`. Rỗng khi thân không mang lỗi.
func loiTrongThan(b []byte) string {
	var v struct {
		Error json.RawMessage `json:"error"`
	}
	if json.Unmarshal(b, &v) != nil || len(v.Error) == 0 || string(v.Error) == "null" {
		return ""
	}
	var chuoi string
	if json.Unmarshal(v.Error, &chuoi) == nil {
		return chuoi
	}
	var dt struct {
		Message string `json:"message"`
		Code    any    `json:"code"`
	}
	if json.Unmarshal(v.Error, &dt) == nil && dt.Message != "" {
		return dt.Message
	}
	return string(v.Error)
}

var (
	reSoTuyen   = regexp.MustCompile(`(\d+)\s+routes?\s+checked`)
	reKhongKhoa = regexp.MustCompile(`(\d+)\s+no usable key`)
	reKhongCC   = regexp.MustCompile(`(\d+)\s+model lacks tool`)
)

// dichLyDoCongCu đổi câu lỗi của gateway thành một câu tiếng Việt nói ra NGUYÊN NHÂN.
func dichLyDoCongCu(loi string, ma int) string {
	t := strings.ToLower(loi)
	switch {
	case strings.Contains(t, "routes checked"):
		phan := []string{}
		if m := reKhongKhoa.FindStringSubmatch(t); m != nil {
			phan = append(phan, m[1]+" tuyến không có khóa dùng được")
		}
		if m := reKhongCC.FindStringSubmatch(t); m != nil {
			phan = append(phan, m[1]+" tuyến dùng model không gọi được công cụ")
		}
		dau := "cổng đã thử hết các tuyến mà không tuyến nào nhận"
		if m := reSoTuyen.FindStringSubmatch(t); m != nil {
			dau = "cổng đã thử hết " + m[1] + " tuyến mà không tuyến nào nhận"
		}
		if len(phan) > 0 {
			return dau + ": " + strings.Join(phan, ", ")
		}
		return dau
	case strings.Contains(t, "tool") && (strings.Contains(t, "lack") || strings.Contains(t, "not support") || strings.Contains(t, "unsupported")):
		return "model này không hỗ trợ gọi công cụ"
	case strings.Contains(t, "no usable") || strings.Contains(t, "no candidate model") || strings.Contains(t, "no active credentials"):
		return "cổng không còn khóa nhà cung cấp nào dùng được cho model này"
	case strings.Contains(t, "not in the catalog") || strings.Contains(t, "model_not_found") || strings.Contains(t, "does not exist"):
		return "cổng không có model này"
	case ma == http.StatusUnauthorized || ma == http.StatusForbidden:
		return "khóa API sai hoặc hết hạn"
	case ma == http.StatusTooManyRequests || strings.Contains(t, "rate limit"):
		return "bị giới hạn tần suất, thử lại sau"
	case ma == http.StatusNotFound:
		return "địa chỉ gốc không có đường /chat/completions"
	default:
		return "nhà cung cấp từ chối lượt gọi công cụ"
	}
}

// modelDangDungO chọn model để thử cho một nhà cung cấp ĐÃ LƯU: model mặc định nếu nó là nhà
// cung cấp mặc định, rồi model của vai đầu tiên trỏ vào nó, rồi model đầu tiên đã khai.
func modelDangDungO(cfg *bootstrap.Config, ten string, pc bootstrap.ProviderConfig) string {
	if cfg != nil {
		if cfg.Provider == ten && strings.TrimSpace(cfg.ModelName) != "" {
			return strings.TrimSpace(cfg.ModelName)
		}
		vai := make([]string, 0, len(cfg.Roles))
		for k := range cfg.Roles {
			vai = append(vai, k)
		}
		sort.Strings(vai)
		for _, k := range vai {
			if rc := cfg.Roles[k]; rc.Provider == ten && strings.TrimSpace(rc.Model) != "" {
				return strings.TrimSpace(rc.Model)
			}
		}
	}
	for _, m := range pc.Models {
		if strings.TrimSpace(m.Name) != "" {
			return strings.TrimSpace(m.Name)
		}
	}
	return ""
}

// loaiGiaoThuc: cùng luật suy giao thức với `diaChiLietKe`.
func loaiGiaoThuc(ten string, pc bootstrap.ProviderConfig) string {
	loai := strings.ToLower(strings.TrimSpace(pc.Type))
	if loai != "" {
		return loai
	}
	if t, err := pc.ProviderType(ten); err == nil {
		return strings.ToLower(t)
	}
	return "openai"
}

func rutGon(s string, n int) string {
	s = strings.TrimSpace(s)
	if len([]rune(s)) <= n {
		return s
	}
	return string([]rune(s)[:n]) + "…"
}
