package serve

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/huuhoa143/ainovel-studio/internal/bootstrap"
)

// Ba câu trả lời của bộ máy nhập theo thứ tự: chia chương, phân tích, tổng hợp (truyện gốc chưa
// rõ đã kết hay chưa — để đi qua chỗ dừng chọn kết/tiếp).
func cauTraLoiNhap() []string {
	ranh := func(unit, title string) map[string]any {
		return map[string]any{"unit_id": unit, "anchor": nil, "kind": "chapter", "title": title, "uncertain": false, "reason": nil}
	}
	seg, _ := json.Marshal(map[string]any{"boundaries": []any{ranh("L1", "第一章"), ranh("L3", "第二章")}})
	su := func(n int, title string) map[string]any {
		return map[string]any{
			"chapter": n, "title": title, "summary": "摘要", "core_event": "核心事件",
			"key_events": []string{"事件"}, "hook": nil, "scenes": []string{}, "characters": []string{},
			"character_evidence": []any{}, "world_evidence": []any{}, "timeline_events": []any{},
			"foreshadow_updates": []any{}, "relationship_changes": []any{}, "state_changes": []any{},
			"hook_type": "mystery", "dominant_strand": "quest",
		}
	}
	ana, _ := json.Marshal(map[string]any{"chapters": []any{su(1, "第一章"), su(2, "第二章")}})
	syn, _ := json.Marshal(map[string]any{
		"premise": "# 测试书\n前提",
		"characters": []any{map[string]any{
			"name": "甲", "aliases": []string{}, "role": "protagonist", "description": "d",
			"arc": "a", "traits": []string{"坚韧"}, "tier": nil,
		}},
		"world_rules": []any{},
		"structure": []any{map[string]any{"title": "卷一", "theme": "主题", "arcs": []any{map[string]any{
			"title": "弧一", "goal": "目标", "start_chapter": 1, "end_chapter": 2,
		}}}},
		"compass":       map[string]any{"ending_direction": "终局", "open_threads": []string{}, "estimated_scale": nil, "last_updated": nil},
		"planning_tier": "short",
		"story_status":  "uncertain",
		"status_reason": "根据正文判断",
	})
	return []string{string(seg), string(ana), string(syn)}
}

// gatewayNhap trả lần lượt các câu trả lời, ở cả dạng thường lẫn SSE. datLai đưa nó về câu
// đầu — cho một lượt nhập mới trong cùng bài kiểm.
func gatewayNhap(t *testing.T, traLoi []string) (url string, datLai func()) {
	t.Helper()
	var mu sync.Mutex
	i := 0
	gw := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/chat/completions") {
			http.NotFound(w, r)
			return
		}
		than, _ := io.ReadAll(r.Body)
		mu.Lock()
		noi := traLoi[min(i, len(traLoi)-1)]
		i++
		mu.Unlock()
		if bytes.Contains(than, []byte(`"stream":true`)) {
			w.Header().Set("Content-Type", "text/event-stream")
			b, _ := json.Marshal(map[string]any{"id": "c", "model": "m1", "choices": []any{map[string]any{"index": 0, "delta": map[string]any{"content": noi}}}})
			fmt.Fprintf(w, "data: %s\n\n", b)
			b, _ = json.Marshal(map[string]any{"id": "c", "model": "m1", "choices": []any{map[string]any{"index": 0, "delta": map[string]any{}, "finish_reason": "stop"}}})
			fmt.Fprintf(w, "data: %s\n\ndata: [DONE]\n\n", b)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id": "c", "object": "chat.completion", "model": "m1",
			"choices": []any{map[string]any{"index": 0, "message": map[string]any{"role": "assistant", "content": noi}, "finish_reason": "stop"}},
			"usage":   map[string]int{"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
		})
	}))
	t.Cleanup(gw.Close)
	return gw.URL, func() { mu.Lock(); i = 0; mu.Unlock() }
}

// Cả vòng nhập qua HTTP, đi qua đúng hai chỗ dừng chờ người, và snapshot nói đúng pha ở mỗi
// chỗ để giao diện hiện đúng nút:
//
//	tải tệp lên (không tự chốt)        → import.phase = awaiting_confirm
//	«Chấp nhận cách chia chương»       → import.phase = story_uncertain
//	«Truyện gốc đã kết» + «Tiếp tục…» → import = null (đã công bố)
//
// mayNhap dựng một cuốn trống, engine đang mở, trỏ vào gateway nhập giả; trả server cùng hai
// hàm gọi: nhap (POST /import, tep rỗng = không kèm tệp) và pha (import.phase của snapshot).
func mayNhap(t *testing.T, traLoi []string) (*server, func(string, map[string]string) (bool, string), func() any, func()) {
	t.Helper()
	gw, datLai := gatewayNhap(t, traLoi)
	root := t.TempDir()
	newBook(t, root, "sach", nil)
	may := boMayThu(t, root)
	tat, khong := false, false
	if err := bootstrap.SaveConfig(may.cauHinh, bootstrap.Config{
		Provider: "g", ModelName: "m1",
		Providers: map[string]bootstrap.ProviderConfig{"g": {
			Type: "openai", APIKey: "k", BaseURL: gw,
			Models: []bootstrap.ModelConfig{{Name: "m1", JSONSchema: &khong}},
		}},
		Notify: bootstrap.NotifyConfig{Enabled: &tat},
	}); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(may.dongTatCa)
	if _, err := may.mo("sach"); err != nil {
		t.Fatalf("mở engine: %v", err)
	}
	s := &server{root: root, may: may}

	nhap := func(tep string, truong map[string]string) (bool, string) {
		t.Helper()
		var than bytes.Buffer
		mw := multipart.NewWriter(&than)
		if tep != "" {
			fw, _ := mw.CreateFormFile("file", "truyen.txt")
			_, _ = fw.Write([]byte(tep))
		}
		for k, v := range truong {
			_ = mw.WriteField(k, v)
		}
		_ = mw.Close()
		r := httptest.NewRequest(http.MethodPost, "/api/books/sach/import", &than)
		r.Host = "127.0.0.1:8420"
		r.Header.Set(tenHeaderRao, "1")
		r.Header.Set("Content-Type", mw.FormDataContentType())
		rec := httptest.NewRecorder()
		s.routes().ServeHTTP(rec, r)
		if rec.Code != 200 {
			t.Fatalf("import = %d: %s", rec.Code, rec.Body.String())
		}
		var m struct {
			Failed bool `json:"failed"`
		}
		_ = json.Unmarshal(rec.Body.Bytes(), &m)
		return m.Failed, rec.Body.String()
	}
	pha := func() any {
		t.Helper()
		var snap struct {
			Import *TrangThaiNhap `json:"import"`
		}
		rec := do(t, s, "GET", "/api/books/sach/studio")
		if err := json.Unmarshal(rec.Body.Bytes(), &snap); err != nil {
			t.Fatalf("%d: %v", rec.Code, err)
		}
		if snap.Import == nil {
			return nil
		}
		return snap.Import.Pha
	}
	return s, nhap, pha, datLai
}

func goiBoNhap(t *testing.T, s *server) (int, map[string]any) {
	t.Helper()
	r := httptest.NewRequest(http.MethodPost, "/api/books/sach/import/discard", strings.NewReader("{}"))
	r.Host = "127.0.0.1:8420"
	r.Header.Set(tenHeaderRao, "1")
	rec := httptest.NewRecorder()
	s.routes().ServeHTTP(rec, r)
	var m map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &m)
	return rec.Code, m
}

func TestNhap_ChayTiepQuaHaiChoDung(t *testing.T) {
	s, nhap, pha, _ := mayNhap(t, cauTraLoiNhap())

	if p := pha(); p != nil {
		t.Fatalf("chưa nhập gì mà import = %v", p)
	}
	if hong, nk := nhap("第一章\n正文一\n第二章\n正文二\n", nil); hong {
		t.Fatalf("nhập lần đầu hỏng: %s", nk)
	}
	if p := pha(); p != PhaNhapChoXacNhan {
		t.Fatalf("sau khi chia chương, import.phase = %v, muốn %s", p, PhaNhapChoXacNhan)
	}
	// Tải lại tệp lúc đang dở thì bị từ chối — đúng lý do phải có «Tiếp tục nhập».
	if hong, nk := nhap("第一章\n别的书\n", nil); !hong {
		t.Fatalf("tải tệp khác lúc đang dở phải bị từ chối: %s", nk)
	}
	if p := pha(); p != PhaNhapChoXacNhan {
		t.Fatalf("lượt bị từ chối làm đổi pha: %v", p)
	}

	if hong, nk := nhap("", map[string]string{"accept": "true"}); hong {
		t.Fatalf("chấp nhận cách chia hỏng: %s", nk)
	}
	if p := pha(); p != PhaNhapChuaRoKet {
		t.Fatalf("sau khi chấp nhận, import.phase = %v, muốn %s", p, PhaNhapChuaRoKet)
	}

	if hong, nk := nhap("", map[string]string{"story": "closed"}); hong {
		t.Fatalf("chọn truyện đã kết hỏng: %s", nk)
	}
	if p := pha(); p != nil {
		t.Fatalf("nhập xong mà import = %v, muốn null", p)
	}
	// Lượt nhập đã công bố: thư mục nhập là hồ sơ, «Bỏ lượt nhập dở» không đụng tới.
	if ma, m := goiBoNhap(t, s); ma != 200 || m["discarded"] != false {
		t.Errorf("bỏ lượt nhập đã xong: %d %v, muốn 200 discarded=false", ma, m)
	}
	if _, err := os.Stat(filepath.Join(s.root, "sach", "meta", "import")); err != nil {
		t.Errorf("hồ sơ nhập của truyện đã công bố bị xóa: %v", err)
	}
}

// «Bỏ lượt nhập dở»: gỡ lượt dở để nhập được truyện khác; bất biến; 409 khi engine đang bận.
func TestNhap_BoLuotNhapDo(t *testing.T) {
	s, nhap, pha, datLai := mayNhap(t, cauTraLoiNhap())
	if hong, nk := nhap("第一章\n正文一\n第二章\n正文二\n", nil); hong || pha() != PhaNhapChoXacNhan {
		t.Fatalf("dựng lượt nhập dở: %s (pha %v)", nk, pha())
	}

	// Engine bận (đang cùng dựng giai đoạn) thì không được xóa dưới chân nó.
	p, _ := s.may.dangMo("sach")
	if !p.eng.PauseForCoCreate() {
		t.Fatal("không vào được cùng dựng")
	}
	if ma, _ := goiBoNhap(t, s); ma != http.StatusConflict {
		t.Errorf("engine bận phải 409, được %d", ma)
	}
	if pha() != PhaNhapChoXacNhan {
		t.Fatal("lượt bị từ chối vẫn xóa lượt nhập")
	}
	p.eng.CancelCoCreate()

	if ma, m := goiBoNhap(t, s); ma != 200 || m["discarded"] != true {
		t.Fatalf("bỏ lượt dở: %d %v", ma, m)
	}
	if pha() != nil {
		t.Errorf("bỏ xong mà import = %v", pha())
	}
	if ma, m := goiBoNhap(t, s); ma != 200 || m["discarded"] != false {
		t.Errorf("bỏ lần hai: %d %v, muốn 200 discarded=false", ma, m)
	}
	// Hết bị chặn: nhập một tệp KHÁC đi được tới chỗ chia chương.
	datLai()
	if hong, nk := nhap("第一章\n别的书\n第二章\n别的书二\n", nil); hong {
		t.Fatalf("bỏ lượt dở rồi mà vẫn không nhập được tệp mới: %s", nk)
	}
}

// Thư mục nhập hỏng (thiếu bộ ba nhận diện) → interrupted + error; bỏ được cả khi engine chưa mở.
func TestNhap_HongThiBoDuocKhiChuaMoEngine(t *testing.T) {
	root := t.TempDir()
	newBook(t, root, "sach", nil)
	if err := os.MkdirAll(filepath.Join(root, "sach", "meta", "import"), 0o755); err != nil {
		t.Fatal(err)
	}
	s := &server{root: root, may: boMayThu(t, root)}
	var snap struct {
		Import *TrangThaiNhap `json:"import"`
	}
	_ = json.Unmarshal(do(t, s, "GET", "/api/books/sach/studio").Body.Bytes(), &snap)
	if snap.Import == nil || snap.Import.Pha != PhaNhapBiNgat || !strings.Contains(snap.Import.Loi, "Bỏ lượt nhập dở") {
		t.Fatalf("thư mục nhập hỏng phải ra interrupted kèm error chỉ đường bỏ, được %+v", snap.Import)
	}
	if ma, m := goiBoNhap(t, s); ma != 200 || m["discarded"] != true {
		t.Fatalf("bỏ lượt hỏng khi chưa mở engine: %d %v", ma, m)
	}
	if _, err := os.Stat(filepath.Join(root, "sach", "meta", "import")); !os.IsNotExist(err) {
		t.Errorf("thư mục nhập hỏng còn đó: %v", err)
	}
}

// Ở chỗ chờ xác nhận, «Tiếp tục nhập» kèm `guide` (không accept) chia lại chương theo gợi ý mới
// và dừng lại chờ xác nhận lần nữa — không tự chốt.
func TestNhap_GoiYMoiThiChiaLai(t *testing.T) {
	ranh := func(unit, title string) map[string]any {
		return map[string]any{"unit_id": unit, "anchor": nil, "kind": "chapter", "title": title, "uncertain": false, "reason": nil}
	}
	haiChuong, _ := json.Marshal(map[string]any{"boundaries": []any{ranh("L1", "第一章"), ranh("L3", "第二章")}})
	motChuong, _ := json.Marshal(map[string]any{"boundaries": []any{ranh("L1", "第一章")}})
	s, nhap, pha, _ := mayNhap(t, []string{string(haiChuong), string(motChuong)})
	soChuong := func() int {
		var snap struct {
			Import *TrangThaiNhap `json:"import"`
		}
		_ = json.Unmarshal(do(t, s, "GET", "/api/books/sach/studio").Body.Bytes(), &snap)
		if snap.Import == nil {
			return -1
		}
		return snap.Import.SoChuong
	}

	if hong, nk := nhap("第一章\n正文一\n第二章\n正文二\n", nil); hong || pha() != PhaNhapChoXacNhan || soChuong() != 2 {
		t.Fatalf("lần đầu phải dừng chờ xác nhận với 2 chương: %s (pha %v, %d chương)", nk, pha(), soChuong())
	}
	if hong, nk := nhap("", map[string]string{"guide": "cả cuốn là một chương"}); hong {
		t.Fatalf("chạy tiếp kèm gợi ý hỏng: %s", nk)
	}
	if pha() != PhaNhapChoXacNhan || soChuong() != 1 {
		t.Errorf("gợi ý mới phải chia lại và chờ xác nhận lần nữa: pha %v, %d chương", pha(), soChuong())
	}
}
