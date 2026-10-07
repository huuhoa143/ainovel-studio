package serve

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// dungNhaCauHinh dựng một HOME tạm + cwd tạm để mọi phép tra đường dẫn cấu hình trỏ vào
// thư mục của bài kiểm.
//
// `DefaultConfigPath` đọc `os.UserHomeDir()` và `projectConfigPath` giải theo cwd, nên phải
// khống chế cả hai. Thiếu một cái là bài kiểm ghi vào ~/.ainovel/config.json THẬT của người
// chạy — tức xóa khóa API của chính họ.
func dungNhaCauHinh(t *testing.T) string {
	t.Helper()
	nha := t.TempDir()
	datNhaTam(t, nha)
	t.Chdir(nha)
	return nha
}

// datNhaTam trỏ thư mục nhà của người dùng vào `nha` trên MỌI hệ điều hành.
//
// `os.UserHomeDir()` đọc $HOME trên unix nhưng %USERPROFILE% trên Windows. Chỉ đặt HOME thì
// trên Windows bài kiểm vẫn ghi vào nhà thật của người chạy.
func datNhaTam(t *testing.T, nha string) {
	t.Helper()
	t.Setenv("HOME", nha)
	t.Setenv("USERPROFILE", nha)
}

func goiCauHinh(t *testing.T, s *server, method, than string) *httptest.ResponseRecorder {
	t.Helper()
	var body *strings.Reader
	if than == "" {
		body = strings.NewReader("")
	} else {
		body = strings.NewReader(than)
	}
	r := httptest.NewRequest(method, "/api/config", body)
	// `httptest.NewRequest` đặt Host = "example.com", nên không gán lại thì hàng rào chống
	// DNS rebinding chặn mọi yêu cầu và bài kiểm đo nhầm hàng rào thay vì đo cấu hình.
	r.Host = "127.0.0.1:8420"
	r.Header.Set(tenHeaderRao, "1")
	rec := httptest.NewRecorder()
	s.routes().ServeHTTP(rec, r)
	return rec
}

func giaiCauHinh(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &m); err != nil {
		t.Fatalf("giải mã (mã %d): %v — thân: %s", rec.Code, err, rec.Body.String())
	}
	return m
}

// TestCauHinhKhoaDiMotChieu là bài kiểm quan trọng nhất của đợt này.
//
// # Khế ước
//
// GET không bao giờ trả khóa thật. Hệ quả BẮT BUỘC: giao diện không có khóa để gửi lại,
// nên PUT phải hiểu "vắng mặt khóa" là "giữ khóa cũ".
//
// # Vì sao nó dễ sai, và sai thì mất gì
//
// Cách viết tự nhiên nhất là `pc.APIKey = than.APIKey` với `APIKey string`. Lúc đó mỗi lần
// người dùng đổi base_url hay thêm một model, khóa bị ghi thành chuỗi rỗng. Người dùng
// không thấy gì bất thường — biểu mẫu vẫn hiện "đã đặt khóa" cho tới lần tải lại trang —
// rồi lần chạy sau engine hỏng vì thiếu khóa, cách xa nguyên nhân.
//
// Đó là lý do trường ấy là `*string`, và bài kiểm này đi qua ĐÚNG trình tự mà trình duyệt
// làm: GET → PUT không kèm khóa → GET.
func TestCauHinhKhoaDiMotChieu(t *testing.T) {
	nha := dungNhaCauHinh(t)
	const khoaThat = "sk-42c1132b65dba0f2-s8crgv-af9c8802"
	ghiCauHinhTho(t, filepath.Join(nha, ".ainovel", "config.json"), `{
	  "provider": "r9", "model": "cx/gpt-5.5",
	  "providers": {"r9": {"type": "openai", "base_url": "http://127.0.0.1:8899/v1",
	                       "api_key": "`+khoaThat+`", "models": [{"name": "cx/gpt-5.5"}]}}
	}`)

	s := &server{root: t.TempDir(), choGhi: true, may: newBoMay(t.TempDir())}

	// 1. GET không được để lộ khóa — kiểm trên TOÀN BỘ thân, không chỉ trường mình nghĩ tới.
	rec := goiCauHinh(t, s, "GET", "")
	if rec.Code != 200 {
		t.Fatalf("GET /api/config mã %d: %s", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), khoaThat) {
		t.Fatalf("GET /api/config LÀM LỘ khóa thật:\n%s", rec.Body.String())
	}
	got := giaiCauHinh(t, rec)
	ncc := got["providers"].([]any)[0].(map[string]any)
	if ncc["api_key_set"] != true {
		t.Error("api_key_set phải true khi đã có khóa")
	}
	if che, _ := ncc["api_key_masked"].(string); che == "" || strings.Contains(khoaThat, che) && len(che) > 10 {
		t.Errorf("api_key_masked = %q — phải là dạng che ngắn, không phải khóa", che)
	}

	// 2. PUT đổi base_url mà KHÔNG gửi khóa (vì giao diện không có khóa để gửi).
	rec = goiCauHinh(t, s, "PUT", `{"provider_config":{"name":"r9","base_url":"http://127.0.0.1:9999/v1"}}`)
	if rec.Code != 200 {
		t.Fatalf("PUT mã %d: %s", rec.Code, rec.Body.String())
	}

	// 3. Khóa phải CÒN NGUYÊN trên đĩa, và base_url phải đã đổi.
	tren := docCauHinhTho(t, filepath.Join(nha, ".ainovel", "config.json"))
	p := tren["providers"].(map[string]any)["r9"].(map[string]any)
	if p["api_key"] != khoaThat {
		t.Errorf("khóa bị mất sau khi đổi base_url: %v (phải là khóa cũ)", p["api_key"])
	}
	if p["base_url"] != "http://127.0.0.1:9999/v1" {
		t.Errorf("base_url chưa đổi: %v", p["base_url"])
	}
	// Trường không gửi phải còn: type và models không nằm trong yêu cầu.
	if p["type"] != "openai" {
		t.Errorf("type bị xóa dù không gửi: %v", p["type"])
	}
	if p["models"] == nil {
		t.Error("models bị xóa dù không gửi")
	}

	// 4. Gửi khóa RỖNG TƯỜNG MINH thì phải xóa được — đó là nghĩa khác với vắng mặt, và
	//    người dùng cần đường xóa khóa khi đổi nhà cung cấp.
	rec = goiCauHinh(t, s, "PUT", `{"provider_config":{"name":"r9","api_key":""}}`)
	if rec.Code != 200 {
		t.Fatalf("PUT xóa khóa mã %d: %s", rec.Code, rec.Body.String())
	}
	tren = docCauHinhTho(t, filepath.Join(nha, ".ainovel", "config.json"))
	p = tren["providers"].(map[string]any)["r9"].(map[string]any)
	if k, co := p["api_key"]; co && k != "" {
		t.Errorf("khóa rỗng tường minh không xóa được: %v", k)
	}
}

// TestCauHinhKhongLamPhangLopProject canh việc ghi đúng tệp đích.
//
// # Lỗi mà nó chặn
//
// `LoadConfig` TRỘN `~/.ainovel/config.json` với `./.ainovel/config.json`, còn
// `EffectiveConfigPath` trả tệp project khi có. Nên lối viết tự nhiên "LoadConfig → sửa →
// SaveConfig(EffectiveConfigPath)" sẽ đổ toàn bộ credential global vào tệp project.
//
// Hậu quả cụ thể: người dùng cố ý để khóa ở global và chỉ ghi đè `style` ở project; sau một
// lần bấm Lưu trên web, tệp project chứa cả khóa API — rồi họ commit nó lên git.
func TestCauHinhKhongLamPhangLopProject(t *testing.T) {
	nha := dungNhaCauHinh(t)
	// Lớp GLOBAL giữ credential.
	ghiCauHinhTho(t, filepath.Join(nha, ".ainovel", "config.json"), `{
	  "provider": "r9", "model": "m1",
	  "providers": {"r9": {"type":"openai","api_key":"sk-bi-mat-toan-cuc","base_url":"http://127.0.0.1:1/v1"}}
	}`)
	// Lớp PROJECT chỉ ghi đè style — cố ý KHÔNG chứa khóa. Phải là một cwd KHÁC $HOME, vì
	// nếu cwd trùng $HOME thì ./.ainovel/config.json và ~/.ainovel/config.json là một tệp
	// và bài kiểm không còn hai lớp để đo.
	duAn := t.TempDir()
	t.Chdir(duAn)
	ghiCauHinhTho(t, filepath.Join(duAn, ".ainovel", "config.json"), `{"style":"fantasy"}`)

	s := &server{root: t.TempDir(), choGhi: true, may: newBoMay(t.TempDir())}
	rec := goiCauHinh(t, s, "PUT", `{"style":"suspense"}`)
	if rec.Code != 200 {
		t.Fatalf("PUT mã %d: %s", rec.Code, rec.Body.String())
	}

	duAnCfg := docCauHinhTho(t, filepath.Join(duAn, ".ainovel", "config.json"))
	if duAnCfg["style"] != "suspense" {
		t.Errorf("style chưa ghi vào tệp project: %v", duAnCfg["style"])
	}
	// Điểm chính: tệp project KHÔNG được mọc thêm providers từ lớp global.
	if _, co := duAnCfg["providers"]; co {
		t.Errorf("tệp project mọc thêm `providers` từ lớp global — khóa API vừa bị chép vào "+
			"tệp mà người dùng có thể commit:\n%v", duAnCfg)
	}
}

// TestCauHinhKieuVanLaDanhSachDong canh việc không nhận kiểu văn không tồn tại.
//
// `assets.loadReferences` tra `references/genres/<style>/` và khi không thấy thì để
// StyleReference + ArcTemplates RỖNG — không lỗi, không cảnh báo. Nên nhận một giá trị bừa
// là để người dùng tin mình đã chọn thể loại trong khi engine chạy không có tham chiếu nào.
//
// Đã xảy ra thật: cuốn sách 8 chương ở lần chạy thử có `style: "tien_hiep"`.
func TestCauHinhKieuVanLaDanhSachDong(t *testing.T) {
	nha := dungNhaCauHinh(t)
	// Cấu hình nền phải HỢP LỆ, nếu không `ValidateBase` chặn vì thiếu credential và bài
	// kiểm sẽ "xanh vì lý do sai": nó tưởng mình đo phép kiểm kiểu văn trong khi thật ra
	// mọi PUT đều bị chặn ở một phép kiểm khác.
	ghiCauHinhTho(t, filepath.Join(nha, ".ainovel", "config.json"), `{
	  "provider": "r9", "model": "m1",
	  "providers": {"r9": {"type":"openai","api_key":"sk-test","base_url":"http://127.0.0.1:1/v1"}}
	}`)
	s := &server{root: t.TempDir(), choGhi: true, may: newBoMay(t.TempDir())}

	rec := goiCauHinh(t, s, "PUT", `{"style":"tien_hiep"}`)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("kiểu văn không tồn tại phải bị từ chối, được mã %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "âm thầm") {
		t.Errorf("thông báo phải nói rõ hậu quả (bị bỏ qua âm thầm), được: %s", rec.Body.String())
	}

	// Giá trị thật phải qua được, nếu không bài trên xanh vì một lý do sai (chặn tất cả).
	for _, k := range []string{"default", "fantasy", "romance", "suspense", ""} {
		than := `{"style":"` + k + `"}`
		if rec := goiCauHinh(t, s, "PUT", than); rec.Code != 200 {
			t.Errorf("kiểu văn %q phải hợp lệ, mã %d: %s", k, rec.Code, rec.Body.String())
		}
	}
}

// TestCauHinhKiemTruocKhiGhi canh việc không ghi một cấu hình làm hỏng engine.
//
// Studio giờ là giao diện duy nhất. Một cấu hình sai ghi thành công sẽ khóa người dùng ra
// khỏi chính công cụ của họ: mọi lần mở engine sau đó đều hỏng ở `ValidateBase`, và trên
// web thì không có `vim` để sửa tệp.
func TestCauHinhKiemTruocKhiGhi(t *testing.T) {
	nha := dungNhaCauHinh(t)
	s := &server{root: t.TempDir(), choGhi: true, may: newBoMay(t.TempDir())}

	// Thiếu model là cấu hình không dùng được.
	rec := goiCauHinh(t, s, "PUT", `{"provider":"r9"}`)
	if rec.Code == 200 {
		t.Error("cấu hình thiếu model được ghi — lần mở engine sau sẽ hỏng và người dùng bị kẹt")
	}
	if _, err := os.Stat(filepath.Join(nha, ".ainovel", "config.json")); err == nil {
		t.Error("đã GHI tệp dù cấu hình không qua kiểm — kiểm phải diễn ra TRƯỚC khi ghi")
	}
}

// TestVaiChiNhanBonKenh canh danh sách vai.
//
// `arbiter` cố ý vắng mặt: `host.arbiterModel` luôn dùng model mặc định, nên một ô chọn
// model cho arbiter là ô người dùng đổi mà không có tác dụng gì — đúng loại giao diện
// nói sai sự thật.
func TestVaiChiNhanBonKenh(t *testing.T) {
	for _, v := range []string{"default", "architect", "writer", "editor"} {
		if !laVaiHopLe(v) {
			t.Errorf("vai %q phải hợp lệ", v)
		}
	}
	for _, v := range []string{"arbiter", "", "Writer", "import_segment"} {
		if laVaiHopLe(v) {
			t.Errorf("vai %q KHÔNG được nhận", v)
		}
	}
}

func ghiCauHinhTho(t *testing.T, duong, noiDung string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(duong), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(duong, []byte(noiDung), 0o600); err != nil {
		t.Fatalf("ghi %s: %v", duong, err)
	}
}

func docCauHinhTho(t *testing.T, duong string) map[string]any {
	t.Helper()
	b, err := os.ReadFile(duong)
	if err != nil {
		t.Fatalf("đọc %s: %v", duong, err)
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatalf("giải mã %s: %v — %s", duong, err, b)
	}
	return m
}

// TestCauHinhGhiDuocModelTheoVai.
//
// `GET /api/config` trả `roles` từ trước bản này, nhưng `PUT` không nhận nó — tức bề mặt
// đọc được mà không ghi được, và màn Cài đặt chung sẽ phải hiện một bảng chỉ để nhìn. Đó
// đúng là khiếm khuyết mà màn ấy tồn tại để xoá, nên nó cần một phép đo.
func TestCauHinhGhiDuocModelTheoVai(t *testing.T) {
	dungNhaCauHinh(t)
	s := &server{root: t.TempDir(), choGhi: true, may: newBoMay(t.TempDir())}

	// Phải có provider + model hợp lệ trước: `validateModelRef` đòi vai trỏ tới một
	// provider có thật, nên một bài kiểm chỉ gửi `roles` sẽ đỏ vì cấu hình nền, không vì
	// mã đang đo.
	if rec := goiCauHinh(t, s, "PUT", `{
	  "provider": "google", "model": "gemini-2.5-pro",
	  "provider_config": {"name": "google", "type": "openai", "api_key": "sk-test"}
	}`); rec.Code != http.StatusOK {
		t.Fatalf("dựng cấu hình nền: %d — %s", rec.Code, rec.Body.String())
	}

	rec := goiCauHinh(t, s, "PUT", `{"roles": {
	  "writer": {"provider": "google", "model": "gemini-2.5-pro"},
	  "editor": {"provider": "google", "model": "gemini-2.5-flash"}
	}}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("ghi roles = %d, phải 200: %s", rec.Code, rec.Body.String())
	}

	doc := giaiCauHinh(t, goiCauHinh(t, s, "GET", ""))
	roles, _ := doc["roles"].(map[string]any)
	writer, _ := roles["writer"].(map[string]any)
	if writer == nil || writer["model"] != "gemini-2.5-pro" {
		t.Fatalf("roles.writer không được ghi: %v", roles)
	}
	editor, _ := roles["editor"].(map[string]any)
	if editor == nil || editor["model"] != "gemini-2.5-flash" {
		t.Fatalf("roles.editor không được ghi: %v", roles)
	}

	// Map RỖNG = gỡ hết ghi đè. Đây là cách duy nhất nói ra việc bỏ một vai; không có nó
	// thì bề mặt có một ô đặt được mà không gỡ ra được.
	if rec := goiCauHinh(t, s, "PUT", `{"roles": {}}`); rec.Code != http.StatusOK {
		t.Fatalf("gỡ roles = %d: %s", rec.Code, rec.Body.String())
	}
	doc = giaiCauHinh(t, goiCauHinh(t, s, "GET", ""))
	if r, co := doc["roles"]; co && r != nil {
		if m, _ := r.(map[string]any); len(m) > 0 {
			t.Errorf("gửi map rỗng phải gỡ hết ghi đè, còn lại: %v", r)
		}
	}

	// Vai KHÔNG gửi thì không đổi: `roles` vắng mặt nghĩa là "không nói gì về vai".
	if rec := goiCauHinh(t, s, "PUT", `{"roles": {"writer": {"provider":"google","model":"gemini-2.5-pro"}}}`); rec.Code != http.StatusOK {
		t.Fatalf("đặt lại writer: %s", rec.Body.String())
	}
	if rec := goiCauHinh(t, s, "PUT", `{"style": ""}`); rec.Code != http.StatusOK {
		t.Fatalf("ghi style: %s", rec.Body.String())
	}
	doc = giaiCauHinh(t, goiCauHinh(t, s, "GET", ""))
	roles, _ = doc["roles"].(map[string]any)
	if _, co := roles["writer"]; !co {
		t.Error("PUT không nhắc tới roles đã xoá mất ghi đè đang có")
	}
}

// TestCauHinhVaiLaKhongHopLeBiTuChoi: một vai không có thật phải bị chặn, và cấu hình cũ
// phải còn nguyên. Không có nhánh này thì một lần gõ nhầm khoá người dùng ra khỏi studio —
// trên web không có `vim` để sửa lại tệp.
func TestCauHinhVaiLaKhongHopLeBiTuChoi(t *testing.T) {
	dungNhaCauHinh(t)
	s := &server{root: t.TempDir(), choGhi: true, may: newBoMay(t.TempDir())}
	if rec := goiCauHinh(t, s, "PUT", `{
	  "provider": "google", "model": "gemini-2.5-pro",
	  "provider_config": {"name": "google", "type": "openai", "api_key": "sk-test"}
	}`); rec.Code != http.StatusOK {
		t.Fatalf("dựng nền: %s", rec.Body.String())
	}

	rec := goiCauHinh(t, s, "PUT", `{"roles": {"kien-truc-su": {"provider":"google","model":"gemini-2.5-pro"}}}`)
	if rec.Code == http.StatusOK {
		t.Fatal("vai lạ phải bị từ chối, không được ghi thành công")
	}

	doc := giaiCauHinh(t, goiCauHinh(t, s, "GET", ""))
	if doc["model"] != "gemini-2.5-pro" {
		t.Errorf("cấu hình phải được hoàn nguyên nguyên vẹn, model = %v", doc["model"])
	}
}
