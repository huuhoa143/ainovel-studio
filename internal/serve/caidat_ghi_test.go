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

// dungCauHinh dựng server với tệp cấu hình riêng của bài kiểm (đúng như `serve --config`),
// và trỏ nhà của người dùng vào một thư mục tạm: đường nào còn lén đọc/ghi `~` thì lộ ra ở
// bài kiểm thay vì đụng khóa API thật của người chạy.
func dungCauHinh(t *testing.T) (*server, string) {
	t.Helper()
	datNhaTam(t, t.TempDir())
	duong := filepath.Join(t.TempDir(), "config.json")
	return &server{root: t.TempDir(), may: newBoMay(t.TempDir(), duong)}, duong
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

// boMayThu là bộ máy của các bài kiểm không quan tâm cấu hình: tệp cấu hình riêng, chưa tồn tại.
func boMayThu(t *testing.T, root string) *boMay {
	t.Helper()
	return newBoMay(root, filepath.Join(t.TempDir(), "config.json"))
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
	s, duong := dungCauHinh(t)
	const khoaThat = "sk-42c1132b65dba0f2-s8crgv-af9c8802"
	ghiCauHinhTho(t, duong, `{
	  "provider": "r9", "model": "cx/gpt-5.5",
	  "providers": {"r9": {"type": "openai", "base_url": "http://127.0.0.1:8899/v1",
	                       "api_key": "`+khoaThat+`", "models": [{"name": "cx/gpt-5.5"}]}}
	}`)

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
	tren := docCauHinhTho(t, duong)
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
	tren = docCauHinhTho(t, duong)
	p = tren["providers"].(map[string]any)["r9"].(map[string]any)
	if k, co := p["api_key"]; co && k != "" {
		t.Errorf("khóa rỗng tường minh không xóa được: %v", k)
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
	s, duong := dungCauHinh(t)
	// Cấu hình nền phải HỢP LỆ, nếu không `ValidateBase` chặn vì thiếu credential và bài
	// kiểm sẽ "xanh vì lý do sai": nó tưởng mình đo phép kiểm kiểu văn trong khi thật ra
	// mọi PUT đều bị chặn ở một phép kiểm khác.
	ghiCauHinhTho(t, duong, `{
	  "provider": "r9", "model": "m1",
	  "providers": {"r9": {"type":"openai","api_key":"sk-test","base_url":"http://127.0.0.1:1/v1"}}
	}`)

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
	s, duong := dungCauHinh(t)

	// Thiếu model là cấu hình không dùng được.
	rec := goiCauHinh(t, s, "PUT", `{"provider":"r9"}`)
	if rec.Code == 200 {
		t.Error("cấu hình thiếu model được ghi — lần mở engine sau sẽ hỏng và người dùng bị kẹt")
	}
	if _, err := os.Stat(duong); err == nil {
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
	s, _ := dungCauHinh(t)

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
	s, _ := dungCauHinh(t)
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

// Lần mở app đầu tiên: chưa có tệp → cần cài, và `path` là ĐÚNG tệp app truyền vào. Lưu một
// cấu hình dùng được → hết cần cài, tệp nằm đúng chỗ đó và không có gì khác bị ghi — kể cả
// `~/.ainovel` của cơ chế hai tầng cũ.
func TestCauHinhLanDau_GhiDungMotTep(t *testing.T) {
	nha := t.TempDir()
	datNhaTam(t, nha)
	thuMuc := t.TempDir()
	duong := filepath.Join(thuMuc, "config.json")
	s := &server{root: t.TempDir(), may: newBoMay(t.TempDir(), duong)}

	doc := giaiCauHinh(t, goiCauHinh(t, s, "GET", ""))
	if doc["needs_setup"] != true {
		t.Errorf("chưa có tệp mà needs_setup = %v", doc["needs_setup"])
	}
	if doc["path"] != duong {
		t.Errorf("path = %v, muốn %s", doc["path"], duong)
	}
	if _, co := doc["config_error"]; co {
		t.Errorf("thiếu tệp là lần đầu, không phải lỗi: %v", doc["config_error"])
	}

	rec := goiCauHinh(t, s, "PUT", `{
	  "provider": "r9", "model": "m1",
	  "provider_config": {"name": "r9", "type": "openai", "api_key": "sk-test", "models": [{"name": "m1"}]}
	}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("PUT = %d: %s", rec.Code, rec.Body.String())
	}
	if m := giaiCauHinh(t, rec); m["path"] != duong {
		t.Errorf("PUT báo path = %v, muốn %s", m["path"], duong)
	}
	if doc := giaiCauHinh(t, goiCauHinh(t, s, "GET", "")); doc["needs_setup"] != false {
		t.Errorf("đã có khóa + model mà needs_setup = %v", doc["needs_setup"])
	}
	if p := docCauHinhTho(t, duong)["provider"]; p != "r9" {
		t.Errorf("tệp cấu hình chưa được ghi: provider = %v", p)
	}
	muc, _ := os.ReadDir(thuMuc)
	if len(muc) != 1 {
		t.Errorf("thư mục cấu hình chỉ được có config.json, có %d mục", len(muc))
	}
	if muc, _ := os.ReadDir(nha); len(muc) != 0 {
		t.Errorf("thư mục nhà bị ghi: %v", muc)
	}
}

// Tệp hỏng cú pháp: GET vẫn 200 để giao diện đứng được ở màn cài đặt, nói rõ lỗi, và một lượt
// lưu hợp lệ ghi lại tệp từ rỗng.
func TestCauHinhTepHong_BaoLoiVaChoGhiLai(t *testing.T) {
	s, duong := dungCauHinh(t)
	ghiCauHinhTho(t, duong, `{ "provider": "r9", }`)

	rec := goiCauHinh(t, s, "GET", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("tệp hỏng không được làm GET chết: %d %s", rec.Code, rec.Body.String())
	}
	doc := giaiCauHinh(t, rec)
	if doc["needs_setup"] != true {
		t.Errorf("tệp hỏng phải coi là cần cài, needs_setup = %v", doc["needs_setup"])
	}
	if loi, _ := doc["config_error"].(string); !strings.Contains(loi, duong) {
		t.Errorf("config_error phải nêu tệp hỏng, được %q", loi)
	}

	if loi, _ := doc["config_error"].(string); !strings.Contains(loi, ".broken-") {
		t.Errorf("config_error phải báo trước tệp sẽ được cất ở đâu, được %q", loi)
	}

	rec = goiCauHinh(t, s, "PUT", `{
	  "provider": "r9", "model": "m1",
	  "provider_config": {"name": "r9", "type": "openai", "api_key": "sk-test"}
	}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("lưu đè tệp hỏng = %d: %s", rec.Code, rec.Body.String())
	}
	// Tệp hỏng không bị xóa: nó được cất nguyên văn, và PUT nói rõ ở đâu.
	saoLuu, _ := giaiCauHinh(t, rec)["broken_backup"].(string)
	if !strings.HasPrefix(saoLuu, duong+".broken-") {
		t.Fatalf("broken_backup = %q, muốn %s.broken-<mốc>", saoLuu, duong)
	}
	if b, err := os.ReadFile(saoLuu); err != nil || string(b) != `{ "provider": "r9", }` {
		t.Errorf("tệp hỏng không còn nguyên ở %s: %q, %v", saoLuu, b, err)
	}
	doc = giaiCauHinh(t, goiCauHinh(t, s, "GET", ""))
	if _, co := doc["config_error"]; co || doc["needs_setup"] != false {
		t.Errorf("lưu xong vẫn báo lỗi/cần cài: %v", doc)
	}
}

// Lượt lưu đè tệp hỏng mà không qua kiểm thì tệp hỏng phải về lại đúng chỗ — không mất, không
// bị thay bằng nửa cấu hình.
func TestCauHinhTepHong_LuuHongThiTraTepVe(t *testing.T) {
	s, duong := dungCauHinh(t)
	ghiCauHinhTho(t, duong, `{ hỏng`)
	if rec := goiCauHinh(t, s, "PUT", `{"provider":"r9"}`); rec.Code == http.StatusOK {
		t.Fatalf("cấu hình thiếu model không được lưu: %s", rec.Body.String())
	}
	if b, _ := os.ReadFile(duong); string(b) != `{ hỏng` {
		t.Errorf("tệp hỏng không được trả về chỗ cũ: %q", b)
	}
	if muc, _ := filepath.Glob(duong + ".broken-*"); len(muc) != 0 {
		t.Errorf("lượt bị từ chối vẫn để lại bản cất: %v", muc)
	}
}

// Đọc không được vì lỗi vào/ra (ở đây: đường dẫn là một thư mục) thì KHÔNG ghi đè gì cả.
func TestCauHinhLoiVaoRa_KhongGhiDe(t *testing.T) {
	duong := t.TempDir() // một thư mục, không phải tệp
	s := &server{root: t.TempDir(), may: newBoMay(t.TempDir(), duong)}
	rec := goiCauHinh(t, s, "PUT", `{
	  "provider": "r9", "model": "m1",
	  "provider_config": {"name": "r9", "type": "openai", "api_key": "sk-test"}
	}`)
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("lỗi vào/ra phải 500, được %d: %s", rec.Code, rec.Body.String())
	}
	if fi, err := os.Stat(duong); err != nil || !fi.IsDir() {
		t.Errorf("đường dẫn cấu hình bị đụng tới: %v", err)
	}
	if muc, _ := filepath.Glob(duong + ".broken-*"); len(muc) != 0 {
		t.Errorf("lỗi vào/ra không được bị coi là tệp hỏng: %v", muc)
	}
}
