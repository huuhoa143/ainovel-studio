package serve

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/huuhoa143/ainovel-studio/internal/bootstrap"
)

/*
`GET /api/models` đọc payload của NGƯỜI KHÁC, nên nó phải mềm.

# Vì sao tệp này tồn tại

Handler này từng không có một bài kiểm nào, và đó đúng là chỗ một lỗi chặn cửa đi lọt: khi
thêm phần đọc cửa sổ ngữ cảnh, struct giải mã có thêm ba trường `int` và một struct lồng —
và mọi lỗi giải mã ở :128 là chí mạng (502, danh sách rỗng).

ĐO ĐƯỢC bằng cách dựng lại cả hai struct rồi cho ăn bảy payload thật: 5 trong 7 hình dạng
gãy sau khi sửa, trong khi bản cũ (`id`/`name` thôi) đọc trôi cả 7. `"capabilities": [...]`
là hình dạng phổ biến, nên đây không phải ca hiếm.

Luật mà tệp này canh: **một trường PHỤ không bao giờ được làm rơi trường CHÍNH.** Danh sách
model là thứ bắt được cái typo `cx/gpt-5.5` vs `gpt-5.5` — ba lượt tạo truyện hỏng vì nó.
Cửa sổ chỉ là thứ thêm vào. Hình dạng lạ thì mất cửa sổ, không mất danh sách.
*/

// dungGateway dựng một gateway giả trả đúng `than`, và một tệp cấu hình trỏ vào nó.
func dungGateway(t *testing.T, than string) *server {
	t.Helper()
	s, duongCauHinh := dungCauHinh(t)

	gw := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(than))
	}))
	t.Cleanup(gw.Close)

	cfg := bootstrap.Config{
		Provider:  "g",
		ModelName: "m",
		Providers: map[string]bootstrap.ProviderConfig{
			"g": {Type: "openai", APIKey: "k", BaseURL: gw.URL},
		},
	}
	b, err := json.Marshal(cfg)
	if err != nil {
		t.Fatalf("gói cấu hình: %v", err)
	}
	if err := os.WriteFile(duongCauHinh, b, 0o600); err != nil {
		t.Fatalf("ghi cấu hình: %v", err)
	}
	return s
}

// hoiModel gọi handler và trả về thân đã giải mã.
func hoiModel(t *testing.T, s *server) (int, map[string]any) {
	t.Helper()
	r := httptest.NewRequest(http.MethodGet, "/api/models?provider=g", nil)
	r.Host = "127.0.0.1:8420"
	r.Header.Set(tenHeaderRao, "1")
	rec := httptest.NewRecorder()
	s.routes().ServeHTTP(rec, r)

	var m map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &m); err != nil {
		t.Fatalf("giải mã (mã %d): %v — thân: %s", rec.Code, err, rec.Body.String())
	}
	return rec.Code, m
}

func tenModel(t *testing.T, than map[string]any) []string {
	t.Helper()
	tho, _ := than["models"].([]any)
	ra := make([]string, 0, len(tho))
	for _, x := range tho {
		s, _ := x.(string)
		ra = append(ra, s)
	}
	return ra
}

func cuaSo(t *testing.T, than map[string]any, ten string) int {
	t.Helper()
	m, _ := than["windows"].(map[string]any)
	f, _ := m[ten].(float64)
	return int(f)
}

/*
Ba hình dạng khai cửa sổ, cộng bốn hình dạng LẠ không được phép làm rơi danh sách.

Bốn ca cuối là bài kiểm thật sự: mỗi ca trong đó từng trả 502 với danh sách rỗng.
*/
func TestLietKeModel_MoiHinhDangCuaSo(t *testing.T) {
	ca := []struct {
		ten  string
		than string
		cua  int
	}{
		{
			ten:  "capabilities.contextWindow (9Router)",
			than: `{"data":[{"id":"cx/gpt-5.6-luna","capabilities":{"contextWindow":272000}}]}`,
			cua:  272000,
		},
		{
			ten:  "context_window",
			than: `{"data":[{"id":"cx/gpt-5.6-luna","context_window":272000}]}`,
			cua:  272000,
		},
		{
			ten:  "context_length (OpenRouter)",
			than: `{"data":[{"id":"cx/gpt-5.6-luna","context_length":272000}]}`,
			cua:  272000,
		},
		{
			// Hình dạng phổ biến nhất trong nhóm gãy, và là ca đã chặn cửa PR.
			ten:  "capabilities là MẢNG — mất cửa sổ, KHÔNG mất danh sách",
			than: `{"data":[{"id":"cx/gpt-5.6-luna","capabilities":["vision","tools"]}]}`,
			cua:  0,
		},
		{
			ten:  "capabilities là bool",
			than: `{"data":[{"id":"cx/gpt-5.6-luna","capabilities":true}]}`,
			cua:  0,
		},
		{
			ten:  "context_length bọc trong chuỗi",
			than: `{"data":[{"id":"cx/gpt-5.6-luna","context_length":"128000"}]}`,
			cua:  128000,
		},
		{
			ten:  "context_length là số thực",
			than: `{"data":[{"id":"cx/gpt-5.6-luna","context_length":128000.0}]}`,
			cua:  128000,
		},
	}

	for _, c := range ca {
		t.Run(c.ten, func(t *testing.T) {
			s := dungGateway(t, c.than)
			ma, than := hoiModel(t, s)

			if ma != http.StatusOK {
				t.Fatalf("mã %d, muốn 200 — payload lạ không được làm hỏng cả lượt đọc: %v", ma, than)
			}
			// Vế QUAN TRỌNG NHẤT: danh sách model sống sót ở MỌI hình dạng.
			if got := tenModel(t, than); len(got) != 1 || got[0] != "cx/gpt-5.6-luna" {
				t.Fatalf("models = %v, muốn [cx/gpt-5.6-luna] — mất danh sách là mất thứ bề mặt này sinh ra để làm", got)
			}
			if got := cuaSo(t, than, "cx/gpt-5.6-luna"); got != c.cua {
				t.Fatalf("cửa sổ = %d, muốn %d", got, c.cua)
			}
		})
	}
}

// Thứ tự ưu tiên là một quyết định, nên nó phải bị đóng đinh: `capabilities.contextWindow`
// trước `context_window` trước `context_length`. Không có bài kiểm này thì đảo thứ tự vẫn xanh.
func TestLietKeModel_ThuTuUuTien(t *testing.T) {
	s := dungGateway(t, `{"data":[{"id":"m","capabilities":{"contextWindow":1},"context_window":2,"context_length":3}]}`)
	_, than := hoiModel(t, s)
	if got := cuaSo(t, than, "m"); got != 1 {
		t.Fatalf("cửa sổ = %d, muốn 1 — `capabilities.contextWindow` phải thắng", got)
	}

	s2 := dungGateway(t, `{"data":[{"id":"m","context_window":2,"context_length":3}]}`)
	_, than2 := hoiModel(t, s2)
	if got := cuaSo(t, than2, "m"); got != 2 {
		t.Fatalf("cửa sổ = %d, muốn 2 — `context_window` phải thắng `context_length`", got)
	}
}

// Gemini trả `models[]` và gắn tiền tố `models/`; người dùng gõ tên KHÔNG có tiền tố.
func TestLietKeModel_DangGemini(t *testing.T) {
	s := dungGateway(t, `{"models":[{"name":"models/gemini-2.5-pro","context_window":2000000}]}`)
	_, than := hoiModel(t, s)

	if got := tenModel(t, than); len(got) != 1 || got[0] != "gemini-2.5-pro" {
		t.Fatalf("models = %v, muốn [gemini-2.5-pro] — còn tiền tố thì không khớp thứ người dùng gõ", got)
	}
	if got := cuaSo(t, than, "gemini-2.5-pro"); got != 2000000 {
		t.Fatalf("cửa sổ = %d, muốn 2000000 — cửa sổ phải theo tên ĐÃ cắt tiền tố", got)
	}
}

// Số vô nghĩa không được ghi thành cửa sổ: 0 và số âm nghĩa là "không khai", và ghi chúng
// xuống `providers[].models[].context_window` sẽ làm hỏng phép phân giải ở tầng dưới.
func TestLietKeModel_SoVoNghiaKhongThanhCuaSo(t *testing.T) {
	s := dungGateway(t, `{"data":[{"id":"a","context_window":0},{"id":"b","context_length":-5},{"id":"c","context_window":"khong-phai-so"}]}`)
	ma, than := hoiModel(t, s)

	if ma != http.StatusOK {
		t.Fatalf("mã %d, muốn 200", ma)
	}
	if got := len(tenModel(t, than)); got != 3 {
		t.Fatalf("có %d model, muốn 3 — cả ba tên đều hợp lệ", got)
	}
	for _, ten := range []string{"a", "b", "c"} {
		if got := cuaSo(t, than, ten); got != 0 {
			t.Fatalf("%s có cửa sổ %d, muốn không khai", ten, got)
		}
	}
}
