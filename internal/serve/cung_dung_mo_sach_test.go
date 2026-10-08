package serve

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/huuhoa143/ainovel-studio/internal/bootstrap"
)

// gatewayCungDung là một nhà cung cấp OpenAI-tương thích giả, trả đúng một câu trả lời cùng dựng
// (dạng XML mà coCreateStream đọc) qua SSE.
func gatewayCungDung(t *testing.T) string {
	t.Helper()
	tra := "<reply>Bạn muốn nhân vật chính là ai?</reply>\n<draft>Truyện về người gác cầu đá.</draft>\n<ready>false</ready>\n<suggestions>\n1. Một cô lái đò\n</suggestions>"
	gw := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/chat/completions") {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		gui := func(v any) {
			b, _ := json.Marshal(v)
			fmt.Fprintf(w, "data: %s\n\n", b)
		}
		gui(map[string]any{"id": "c", "model": "m1", "choices": []any{map[string]any{"index": 0, "delta": map[string]any{"content": tra}}}})
		gui(map[string]any{"id": "c", "model": "m1", "choices": []any{map[string]any{"index": 0, "delta": map[string]any{}, "finish_reason": "stop"}}})
		fmt.Fprint(w, "data: [DONE]\n\n")
	}))
	t.Cleanup(gw.Close)
	return gw.URL
}

// Lần mở app đầu tiên: xưởng TRỐNG, chưa engine nào mở — "Bàn ý tưởng với AI trước" vẫn phải chạy.
// Không mở engine, không lấy khóa truyện, không tạo thư mục sách nào.
func TestCungDungMoSach_XuongTrongVanChay(t *testing.T) {
	s, duong := dungCauHinh(t)
	if err := bootstrap.SaveConfig(duong, bootstrap.Config{
		Provider: "g", ModelName: "m1",
		Providers: map[string]bootstrap.ProviderConfig{"g": {Type: "openai", APIKey: "k", BaseURL: gatewayCungDung(t)}},
	}); err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest(http.MethodPost, "/api/cocreate",
		strings.NewReader(`{"history":[{"role":"user","text":"Một truyện về cây cầu đá"}]}`))
	r.Host = "127.0.0.1:8420"
	r.Header.Set(tenHeaderRao, "1")
	rec := httptest.NewRecorder()
	s.routes().ServeHTTP(rec, r)
	if rec.Code != http.StatusOK {
		t.Fatalf("POST /api/cocreate ở xưởng trống = %d: %s", rec.Code, rec.Body.String())
	}
	var dap dapCungDung
	if err := json.Unmarshal(rec.Body.Bytes(), &dap); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(dap.LoiNhan, "nhân vật chính") || !strings.Contains(dap.BanNhap, "gác cầu") {
		t.Errorf("câu trả lời cùng dựng sai: %+v", dap)
	}
	if len(s.cuonDangMo()) != 0 {
		t.Errorf("cùng dựng mở sách mới không được mở engine nào: %v", s.cuonDangMo())
	}
}

// Chưa cài (không có khóa) thì báo lỗi cấu hình 400, không phải 409 "mở một tác phẩm".
func TestCungDungMoSach_ChuaCaiThiBaoCauHinh(t *testing.T) {
	s, _ := dungCauHinh(t)
	r := httptest.NewRequest(http.MethodPost, "/api/cocreate",
		strings.NewReader(`{"history":[{"role":"user","text":"x"}]}`))
	r.Host = "127.0.0.1:8420"
	r.Header.Set(tenHeaderRao, "1")
	rec := httptest.NewRecorder()
	s.routes().ServeHTTP(rec, r)
	if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "cấu hình") {
		t.Errorf("chưa cài: %d %s, muốn 400 nói về cấu hình", rec.Code, rec.Body.String())
	}
}
