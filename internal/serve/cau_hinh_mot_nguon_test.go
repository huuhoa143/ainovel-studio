package serve

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/huuhoa143/ainovel-studio/internal/bootstrap"
	"github.com/huuhoa143/ainovel-studio/internal/domain"
	"github.com/huuhoa143/ainovel-studio/internal/store"
)

/*
Một nguồn sự thật cho màn Model & khóa API.

Mỗi bài ở đây là một lỗi ĐO ĐƯỢC trên máy thật (rà lỗi 2026-10-01): lượt ghi trả "đã lưu"
trong khi thứ màn hình hiện ra — bản TRỘN của tầng toàn cục và tầng dự án — không đổi, hoặc
đổi thành một cặp provider/model không tồn tại.
*/

// haiTang dựng HOME (tầng toàn cục) và một cwd dự án KHÁC HOME (tầng dự án), mỗi tầng một tệp.
func haiTang(t *testing.T, toanCuc, duAn string) (*server, string, string) {
	t.Helper()
	nha := dungNhaCauHinh(t)
	goc := filepath.Join(nha, ".ainovel", "config.json")
	ghiCauHinhTho(t, goc, toanCuc)
	thuMuc := t.TempDir()
	t.Chdir(thuMuc)
	dich := filepath.Join(thuMuc, ".ainovel", "config.json")
	ghiCauHinhTho(t, dich, duAn)
	return &server{root: t.TempDir(), choGhi: true, may: newBoMay(t.TempDir())}, goc, dich
}

const toanCucLingo = `{"provider":"lingo","model":"auto","providers":{"lingo":{"type":"openai","api_key":"sk-goc","base_url":"https://lingo.example/v1","models":[{"name":"auto"}]}}}`

const duAnBa = `{"provider":"lingo","model":"auto","providers":{
  "lingo":{"type":"openai","api_key":"sk-goc","base_url":"https://lingo.example/v1","models":[{"name":"auto"}]},
  "r9":{"type":"openai","api_key":"sk-r9","base_url":"https://r9.example/v1","models":[{"name":"cx/luna"}]},
  "kira":{"type":"openai","api_key":"sk-kira","base_url":"https://kira.example/v1","models":[{"name":"kira-mini"}]}}}`

// B2: xóa một nhà cung cấp mà tầng toàn cục cũng có — trước đây "đã lưu" mà nó vẫn còn.
func TestCauHinh_XoaNccBiTangToanCucChe_TuChoiVaHoanNguyen(t *testing.T) {
	s, goc, dich := haiTang(t, toanCucLingo, duAnBa)
	if rec := goiCauHinh(t, s, "PUT", `{"provider":"r9","model":"cx/luna"}`); rec.Code != 200 {
		t.Fatalf("đổi mặc định: %d %s", rec.Code, rec.Body.String())
	}
	truoc, _ := os.ReadFile(dich)

	rec := goiCauHinh(t, s, "PUT", `{"remove_provider":"lingo","roles":{}}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("xóa bị tầng toàn cục che phải 409, được %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), goc) {
		t.Errorf("thông báo phải chỉ ra tệp đang che (%s): %s", goc, rec.Body.String())
	}
	if sau, _ := os.ReadFile(dich); string(sau) != string(truoc) {
		t.Error("lượt bị từ chối vẫn để lại thay đổi trên tệp dự án")
	}
}

// B2: xóa khóa ở tầng dự án khi tầng toàn cục còn khóa — trước đây thẻ vẫn "đã đặt khóa".
func TestCauHinh_XoaKhoaBiChe_TuChoi(t *testing.T) {
	s, _, _ := haiTang(t, toanCucLingo, duAnBa)
	rec := goiCauHinh(t, s, "PUT", `{"provider_config":{"name":"lingo","api_key":""}}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("xóa khóa bị che phải 409, được %d: %s", rec.Code, rec.Body.String())
	}
}

// GET phải nói ra tầng toàn cục đang trộn vào, để màn hình giải thích được vì sao.
func TestCauHinh_GetNoiRaTangToanCuc(t *testing.T) {
	s, goc, dich := haiTang(t, toanCucLingo, duAnBa)
	doc := giaiCauHinh(t, goiCauHinh(t, s, "GET", ""))
	if doc["path"] != dich {
		t.Errorf("path = %v, muốn %s", doc["path"], dich)
	}
	if doc["base_path"] != goc {
		t.Errorf("base_path = %v, muốn %s", doc["base_path"], goc)
	}
}

// B3: `model: ""` từng thừa hưởng `auto` của tầng toàn cục và sinh ra `kira · auto`.
func TestCauHinh_ModelRong_TuChoi(t *testing.T) {
	s, _, dich := haiTang(t, toanCucLingo, duAnBa)
	truoc, _ := os.ReadFile(dich)
	rec := goiCauHinh(t, s, "PUT", `{"provider":"kira","model":""}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("model rỗng phải 400, được %d: %s", rec.Code, rec.Body.String())
	}
	if sau, _ := os.ReadFile(dich); string(sau) != string(truoc) {
		t.Error("model rỗng vẫn được ghi xuống tệp")
	}
}

// B3/B11: cặp provider/model không tồn tại không được lưu — ở mặc định lẫn ở vai.
func TestCauHinh_CapKhongTonTai_TuChoi(t *testing.T) {
	s, _, _ := haiTang(t, toanCucLingo, duAnBa)
	if rec := goiCauHinh(t, s, "PUT", `{"provider":"kira","model":"cx/luna"}`); rec.Code != http.StatusBadRequest {
		t.Errorf("mặc định trỏ model của nhà cung cấp khác phải 400, được %d", rec.Code)
	}
	if rec := goiCauHinh(t, s, "PUT", `{"roles":{"editor":{"provider":"kira","model":"khong-co"}}}`); rec.Code != http.StatusBadRequest {
		t.Errorf("vai trỏ model không có phải 400, được %d", rec.Code)
	}
	// Đường hợp lệ vẫn đi: chọn một model CHƯA khai thì khai nó trong cùng lượt ghi.
	rec := goiCauHinh(t, s, "PUT", `{"provider_config":{"name":"kira","models":[{"name":"kira-mini"},{"name":"kira-pro"}]},
	  "roles":{"editor":{"provider":"kira","model":"kira-pro"}}}`)
	if rec.Code != 200 {
		t.Errorf("khai model rồi chọn trong cùng lượt phải 200, được %d: %s", rec.Code, rec.Body.String())
	}
}

// B4: sửa một mục KHÔNG khai type (giao thức suy theo tên) không được âm thầm thành openai.
func TestCauHinh_SuaNccKhongDoiGiaoThuc(t *testing.T) {
	nha := dungNhaCauHinh(t)
	duong := filepath.Join(nha, ".ainovel", "config.json")
	ghiCauHinhTho(t, duong, `{"provider":"anthropic","model":"claude","providers":{"anthropic":{"api_key":"sk-a","models":[{"name":"claude"}]}}}`)
	s := &server{root: t.TempDir(), choGhi: true, may: newBoMay(t.TempDir())}

	if rec := goiCauHinh(t, s, "PUT", `{"provider_config":{"name":"anthropic","base_url":"https://proxy.example/v1"}}`); rec.Code != 200 {
		t.Fatalf("sửa base_url: %d %s", rec.Code, rec.Body.String())
	}
	pc := docCauHinhTho(t, duong)["providers"].(map[string]any)["anthropic"].(map[string]any)
	if _, co := pc["type"]; co {
		t.Errorf("sửa base_url đã gắn type %v cho mục vốn suy giao thức theo tên", pc["type"])
	}
	if rec := goiCauHinh(t, s, "PUT", `{"provider_config":{"name":"anthropic","type":"bogus"}}`); rec.Code != http.StatusBadRequest {
		t.Errorf("giao thức lạ phải 400, được %d", rec.Code)
	}
	if rec := goiCauHinh(t, s, "PUT", `{"provider_config":{"name":"  co cach  ","type":"openai"}}`); rec.Code != http.StatusBadRequest {
		t.Errorf("tên có khoảng trắng phải 400, được %d", rec.Code)
	}
}

// B5 (phía server): mục vai mang fallbacks + reasoning_effort đi qua nguyên vẹn.
func TestCauHinh_VaiGiuFallbacksVaDoSuyLuan(t *testing.T) {
	s, _, dich := haiTang(t, toanCucLingo, duAnBa)
	rec := goiCauHinh(t, s, "PUT", `{"roles":{"writer":{"provider":"r9","model":"cx/luna","reasoning_effort":"high","fallbacks":[{"provider":"lingo","model":"auto"}]}}}`)
	if rec.Code != 200 {
		t.Fatalf("ghi vai: %d %s", rec.Code, rec.Body.String())
	}
	w := docCauHinhTho(t, dich)["roles"].(map[string]any)["writer"].(map[string]any)
	if w["reasoning_effort"] != "high" || w["fallbacks"] == nil {
		t.Errorf("vai mất trường: %v", w)
	}
}

// B7: nhà cung cấp chưa có khóa (và không phải gateway trên máy) không được chọn làm mặc định.
func TestCauHinh_NccChuaKhoa_KhongDungDuoc(t *testing.T) {
	s, _, _ := haiTang(t, toanCucLingo, duAnBa)
	rec := goiCauHinh(t, s, "PUT", `{"provider_config":{"name":"thu","type":"openai","base_url":"https://thu.example/v1","models":[{"name":"m1"}]},"provider":"thu","model":"m1"}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("nhà cung cấp không khóa làm mặc định phải 400, được %d: %s", rec.Code, rec.Body.String())
	}
	// Gateway trên máy thì không cần khóa.
	rec = goiCauHinh(t, s, "PUT", `{"provider_config":{"name":"maynha","type":"openai","base_url":"http://127.0.0.1:11434/v1","models":[{"name":"m1"}]},"provider":"maynha","model":"m1"}`)
	if rec.Code != 200 {
		t.Fatalf("gateway cục bộ không khóa phải được, %d: %s", rec.Code, rec.Body.String())
	}
	doc := giaiCauHinh(t, goiCauHinh(t, s, "GET", ""))
	for _, x := range doc["providers"].([]any) {
		n := x.(map[string]any)
		if n["name"] == "maynha" && n["api_key_optional"] != true {
			t.Errorf("gateway cục bộ phải báo api_key_optional: %v", n)
		}
	}
}

// B6: "Kiểm tra" phải đọc CÙNG nguồn với màn hình. Nhà cung cấp chỉ nằm ở tầng toàn cục từng
// trả "không có nhà cung cấp" trong khi thẻ của nó hiện "đã đặt khóa".
func TestLietKeModel_DocBanTron(t *testing.T) {
	gw := httptestGateway(t, `{"data":[{"id":"auto"}]}`)
	s, _, _ := haiTang(t,
		`{"provider":"g","model":"auto","providers":{"g":{"type":"openai","api_key":"k","base_url":"`+gw+`","models":[{"name":"auto"}]}}}`,
		`{"style":"default"}`)
	r := httpReqModel("g")
	rec := ghiNhan(s, r)
	if rec.Code != 200 {
		t.Fatalf("nhà cung cấp ở tầng toàn cục phải kiểm được, mã %d: %s", rec.Code, rec.Body.String())
	}
}
func httptestGateway(t *testing.T, than string) string {
	t.Helper()
	gw := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(than))
	}))
	t.Cleanup(gw.Close)
	return gw.URL
}

func httpReqModel(ncc string) *http.Request {
	r := httptest.NewRequest(http.MethodGet, "/api/models?provider="+ncc, nil)
	r.Host = "127.0.0.1:8420"
	r.Header.Set(tenHeaderRao, "1")
	return r
}

func ghiNhan(s *server, r *http.Request) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	s.routes().ServeHTTP(rec, r)
	return rec
}

// Kiểm một nhà cung cấp ĐANG GÕ, chưa lưu: biểu mẫu cần danh sách model trước khi bấm Lưu.
// Khóa vắng thì dùng khóa đã lưu của mục cùng tên; không ghi gì xuống tệp.
func TestThuKetNoi_KiemBanNhapKhongGhi(t *testing.T) {
	var khoaNhan string
	gw := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		khoaNhan = r.Header.Get("Authorization")
		_, _ = w.Write([]byte(`{"data":[{"id":"m1"},{"id":"m2"}]}`))
	}))
	t.Cleanup(gw.Close)
	s, _, dich := haiTang(t, toanCucLingo, duAnBa)
	truoc, _ := os.ReadFile(dich)

	thu := func(than string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodPost, "/api/models/try", strings.NewReader(than))
		r.Host = "127.0.0.1:8420"
		r.Header.Set(tenHeaderRao, "1")
		return ghiNhan(s, r)
	}
	rec := thu(`{"name":"moi","type":"openai","base_url":"` + gw.URL + `","api_key":"sk-nhap"}`)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"m2"`) {
		t.Fatalf("kiểm bản nháp: %d %s", rec.Code, rec.Body.String())
	}
	if khoaNhan != "Bearer sk-nhap" {
		t.Errorf("không dùng khóa vừa gõ: %q", khoaNhan)
	}
	// Sửa mục đã có, không gõ lại khóa → dùng khóa đã lưu.
	if rec := thu(`{"name":"r9","base_url":"` + gw.URL + `"}`); rec.Code != 200 {
		t.Fatalf("kiểm mục đã có: %d %s", rec.Code, rec.Body.String())
	}
	if khoaNhan != "Bearer sk-r9" {
		t.Errorf("không dùng khóa đã lưu của r9: %q", khoaNhan)
	}
	if sau, _ := os.ReadFile(dich); string(sau) != string(truoc) {
		t.Error("kiểm bản nháp đã ghi xuống tệp")
	}
}

// Mục không khai type (do TUI tạo) phải được kiểm theo giao thức suy từ TÊN.
func TestDiaChiLietKe_SuyGiaoThucTheoTen(t *testing.T) {
	duong, _, err := diaChiLietKe("anthropic", bootstrapProviderKhongType())
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(duong, "https://api.anthropic.com/") {
		t.Errorf("mục anthropic không type phải hỏi cổng anthropic, được %s", duong)
	}
}

func bootstrapProviderKhongType() bootstrap.ProviderConfig {
	return bootstrap.ProviderConfig{APIKey: "k"}
}

// Thanh trạng thái đọc `transport.last_call` từ usage.json — có cả khi engine đã đóng.
func TestTransport_LastCall(t *testing.T) {
	root := t.TempDir()
	luc := time.Date(2026, 10, 2, 9, 30, 0, 0, time.UTC)
	newBook(t, root, "sach", func(st *store.Store) {
		if err := st.Usage.Save(domain.UsageState{
			LastCall: &domain.LastCall{Agent: "writer", Provider: "9Router", Model: "cx/gpt-5.6-luna", At: luc},
		}); err != nil {
			t.Fatal(err)
		}
	})
	s := &server{root: root}
	rec := do(t, s, "GET", "/api/books/sach/studio")
	var snap struct {
		Transport Transport `json:"transport"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &snap); err != nil {
		t.Fatalf("%d: %v", rec.Code, err)
	}
	lc := snap.Transport.LastCall
	if lc == nil || lc.Agent != "writer" || lc.Provider != "9Router" || lc.Model != "cx/gpt-5.6-luna" || lc.At != "2026-10-02T09:30:00Z" {
		t.Errorf("transport.last_call = %+v", lc)
	}
}
