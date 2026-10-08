package serve

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/huuhoa143/ainovel-studio/internal/bootstrap"
)

// Cùng dựng giai đoạn bỏ dở phải hủy được: lượt đầu giữ cờ "đang cùng dựng", cờ đó chặn chạy
// tiếp. Hủy là bất biến — gọi lại, hoặc gọi khi engine chưa mở, vẫn 200 với cancelled=false.
func TestHuyCungDungGiaiDoan(t *testing.T) {
	root := t.TempDir()
	newBook(t, root, "sach", nil)
	may := boMayThu(t, root)
	tat := false
	if err := bootstrap.SaveConfig(may.cauHinh, bootstrap.Config{
		Provider: "openrouter", ModelName: "fake",
		// Không bao giờ được gọi: bài kiểm chỉ mở engine, không chạy.
		Providers: map[string]bootstrap.ProviderConfig{"openrouter": {APIKey: "sk-fake", BaseURL: "http://127.0.0.1:1"}},
		Notify:    bootstrap.NotifyConfig{Enabled: &tat},
	}); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(may.dongTatCa)
	mux := (&server{root: root, may: may}).routes()

	huy := func(raoHeader bool) (int, map[string]any) {
		t.Helper()
		r := httptest.NewRequest(http.MethodPost, "/api/books/sach/stage-cocreate/cancel", nil)
		r.Host = "127.0.0.1:8420"
		if raoHeader {
			r.Header.Set(tenHeaderRao, "1")
		}
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, r)
		var m map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &m)
		return rec.Code, m
	}

	if ma, _ := huy(false); ma != http.StatusForbidden {
		t.Errorf("thiếu header rào phải 403, được %d", ma)
	}
	if ma, m := huy(true); ma != 200 || m["cancelled"] != false {
		t.Errorf("engine chưa mở: %d %v, muốn 200 cancelled=false", ma, m)
	}

	p, err := may.mo("sach")
	if err != nil {
		t.Fatalf("mở engine: %v", err)
	}
	if !p.eng.PauseForCoCreate() {
		t.Fatal("không vào được cùng dựng giai đoạn")
	}
	if ma, m := huy(true); ma != 200 || m["cancelled"] != true {
		t.Errorf("đang cùng dựng: %d %v, muốn 200 cancelled=true", ma, m)
	}
	if ma, m := huy(true); ma != 200 || m["cancelled"] != false {
		t.Errorf("hủy lần hai: %d %v, muốn 200 cancelled=false", ma, m)
	}
	// Cờ đã nhả thật: vào lại được.
	if !p.eng.PauseForCoCreate() {
		t.Error("hủy xong mà cờ cùng dựng vẫn giữ — không vào lại được")
	}
}

// POST /import KHÔNG kèm tệp là «Tiếp tục nhập»: phải tới được bộ máy nhập (không bị chặn ở
// bước đọc tệp tải lên). Không có lượt nhập dở nào thì bộ máy tự báo trong nhật ký.
func TestNhap_KhongTepLaChayTiep(t *testing.T) {
	root := t.TempDir()
	newBook(t, root, "sach", nil)
	may := boMayThu(t, root)
	tat := false
	if err := bootstrap.SaveConfig(may.cauHinh, bootstrap.Config{
		Provider: "openrouter", ModelName: "fake",
		Providers: map[string]bootstrap.ProviderConfig{"openrouter": {APIKey: "sk-fake", BaseURL: "http://127.0.0.1:1"}},
		Notify:    bootstrap.NotifyConfig{Enabled: &tat},
	}); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(may.dongTatCa)
	if _, err := may.mo("sach"); err != nil {
		t.Fatalf("mở engine: %v", err)
	}
	var than bytes.Buffer
	mw := multipart.NewWriter(&than)
	_ = mw.WriteField("accept", "true")
	_ = mw.Close()
	r := httptest.NewRequest(http.MethodPost, "/api/books/sach/import", &than)
	r.Host = "127.0.0.1:8420"
	r.Header.Set(tenHeaderRao, "1")
	r.Header.Set("Content-Type", mw.FormDataContentType())
	rec := httptest.NewRecorder()
	(&server{root: root, may: may}).routes().ServeHTTP(rec, r)
	if strings.Contains(rec.Body.String(), "không có tệp nào") {
		t.Fatalf("không kèm tệp vẫn bị đòi tệp: %d %s", rec.Code, rec.Body.String())
	}
	var m struct {
		Log    []dongNhatKy `json:"log"`
		Failed bool         `json:"failed"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &m); err != nil || rec.Code != 200 {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
	if !m.Failed || len(m.Log) == 0 {
		t.Errorf("không có lượt nhập dở thì nhật ký phải báo lỗi, được %+v", m)
	}
}
