package serve

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/huuhoa143/ainovel-studio/internal/bootstrap"
)

/*
Nút Kiểm tra phải trả lời "model này có gọi công cụ được không", không chỉ "kết nối được".

Ca gốc, ĐO ĐƯỢC 2026-10-02: lingoreup · auto liệt kê 306 model (✓ xanh) trong khi mọi lượt
có công cụ trả 429 `routing_exhausted … 159 model lacks tool-calling`. Truyện kẹt ở bước Kiến
trúc sư, còn màn cấu hình vẫn nói mọi thứ ổn.
*/

// gatewayCongCu dựng gateway giả: `/models` trả danh sách, `/chat/completions` trả `maChat`
// + `thanChat`. Đếm số lượt chat để canh việc thử chỉ chạy khi được xin.
func gatewayCongCu(t *testing.T, models string, maChat int, thanChat string) (*server, *int32, *string) {
	t.Helper()
	s, duongCauHinh := dungCauHinh(t)
	var dem int32
	var thanNhan string
	gw := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if strings.HasSuffix(r.URL.Path, "/chat/completions") {
			atomic.AddInt32(&dem, 1)
			b, _ := io.ReadAll(r.Body)
			thanNhan = string(b)
			w.WriteHeader(maChat)
			_, _ = w.Write([]byte(thanChat))
			return
		}
		_, _ = w.Write([]byte(models))
	}))
	t.Cleanup(gw.Close)

	cfg := bootstrap.Config{
		Provider:  "g",
		ModelName: "auto",
		Providers: map[string]bootstrap.ProviderConfig{
			"g": {Type: "openai", APIKey: "k", BaseURL: gw.URL},
		},
	}
	b, _ := json.Marshal(cfg)
	if err := os.WriteFile(duongCauHinh, b, 0o600); err != nil {
		t.Fatal(err)
	}
	return s, &dem, &thanNhan
}

func goi(t *testing.T, s *server, method, url, than string) map[string]any {
	t.Helper()
	var body io.Reader
	if than != "" {
		body = strings.NewReader(than)
	}
	r := httptest.NewRequest(method, url, body)
	r.Host = "127.0.0.1:8420"
	r.Header.Set(tenHeaderRao, "1")
	if than != "" {
		r.Header.Set("Content-Type", "application/json")
	}
	rec := httptest.NewRecorder()
	s.routes().ServeHTTP(rec, r)
	var m map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &m); err != nil {
		t.Fatalf("giải mã (mã %d): %v — %s", rec.Code, err, rec.Body.String())
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("mã %d: %s", rec.Code, rec.Body.String())
	}
	return m
}

const dsModelCC = `{"data":[{"id":"auto"},{"id":"agnes-2.0-flash"}]}`

func TestKiemTra_BaoModelKhongGoiDuocCongCu(t *testing.T) {
	s, dem, _ := gatewayCongCu(t, dsModelCC, http.StatusTooManyRequests,
		`{"error":{"message":"All models exhausted: 388 routes checked (229 no usable key configured, 159 model lacks tool-calling). Add more API keys","code":"routing_exhausted"}}`)

	m := goi(t, s, http.MethodGet, "/api/models?provider=g&tools=1", "")
	if m["count"].(float64) != 2 {
		t.Fatalf("danh sách model vẫn phải về: %v", m)
	}
	cc, _ := m["tools"].(map[string]any)
	if cc == nil {
		t.Fatalf("thiếu phần tools: %v", m)
	}
	if cc["checked"] != true || cc["ok"] != false || cc["model"] != "auto" {
		t.Fatalf("tools = %v", cc)
	}
	ly := cc["reason"].(string)
	for _, can := range []string{"388 tuyến", "229 tuyến không có khóa", "159 tuyến dùng model không gọi được công cụ"} {
		if !strings.Contains(ly, can) {
			t.Errorf("lý do %q thiếu %q", ly, can)
		}
	}
	if atomic.LoadInt32(dem) != 1 {
		t.Errorf("phải đúng một lượt thử, có %d", *dem)
	}
}

func TestKiemTra_GoiCongCuDuoc(t *testing.T) {
	s, _, than := gatewayCongCu(t, dsModelCC, http.StatusOK,
		`{"choices":[{"message":{"role":"assistant","tool_calls":[{"type":"function","function":{"name":"ping","arguments":"{}"}}]}}]}`)

	m := goi(t, s, http.MethodGet, "/api/models?provider=g&tools=1", "")
	cc := m["tools"].(map[string]any)
	if cc["checked"] != true || cc["ok"] != true {
		t.Fatalf("tools = %v", cc)
	}
	// Lượt thử phải tí hon và thật sự mang công cụ — không thì nó không kiểm gì.
	var gui map[string]any
	if err := json.Unmarshal([]byte(*than), &gui); err != nil {
		t.Fatal(err)
	}
	if gui["model"] != "auto" || gui["tools"] == nil || gui["max_tokens"].(float64) > 32 {
		t.Errorf("thân lượt thử = %v", gui)
	}
}

func TestLietKe_KhongXinThiKhongTieuLuotChat(t *testing.T) {
	// Bộ chọn model nạp danh sách rất thường; mỗi lần là một lượt chat thì tốn tiền vô ích.
	s, dem, _ := gatewayCongCu(t, dsModelCC, http.StatusOK, `{}`)
	m := goi(t, s, http.MethodGet, "/api/models?provider=g", "")
	if _, co := m["tools"]; co {
		t.Errorf("không xin tools mà vẫn trả: %v", m["tools"])
	}
	if atomic.LoadInt32(dem) != 0 {
		t.Errorf("không xin mà vẫn gọi chat %d lần", *dem)
	}
}

func TestThuKetNoi_KhongCoModelThiChonAutoHoacBaoChuaKiem(t *testing.T) {
	s, _, than := gatewayCongCu(t, dsModelCC, http.StatusOK, `{"choices":[{"message":{"content":"ok"}}]}`)
	m := goi(t, s, http.MethodPost, "/api/models/try", `{"name":"g","tools":true}`)
	if cc := m["tools"].(map[string]any); cc["model"] != "auto" || cc["ok"] != true {
		t.Fatalf("có `auto` trong danh sách thì thử bằng `auto`: %v", cc)
	}
	if !strings.Contains(*than, `"auto"`) {
		t.Errorf("lượt thử không gửi auto: %s", *than)
	}

	s2, dem2, _ := gatewayCongCu(t, `{"data":[{"id":"x"},{"id":"y"}]}`, http.StatusOK, `{}`)
	m2 := goi(t, s2, http.MethodPost, "/api/models/try", `{"name":"g","tools":true}`)
	cc2 := m2["tools"].(map[string]any)
	if cc2["checked"] != false || cc2["note"] == "" {
		t.Fatalf("không có model nào để thử thì phải nói 'chưa kiểm', không đoán: %v", cc2)
	}
	if atomic.LoadInt32(dem2) != 0 {
		t.Errorf("không có model mà vẫn gọi chat")
	}
}

func TestDichLyDoCongCu(t *testing.T) {
	ca := map[string]string{
		"Model 'claude-haiku-4-5' is not in the catalog":            "cổng không có model này",
		"No candidate model has a configured, usable provider key.": "cổng không còn khóa",
		"This model does not support tools":                         "không hỗ trợ gọi công cụ",
	}
	for vao, can := range ca {
		if ra := dichLyDoCongCu(vao, 400); !strings.Contains(ra, can) {
			t.Errorf("%q → %q, cần chứa %q", vao, ra, can)
		}
	}
	if ra := dichLyDoCongCu("x", http.StatusUnauthorized); !strings.Contains(ra, "khóa API") {
		t.Errorf("401 → %q", ra)
	}
}
