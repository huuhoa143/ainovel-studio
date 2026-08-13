package serve

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/huuhoa143/ainovel-studio/internal/domain"
	"github.com/huuhoa143/ainovel-studio/internal/store"
)

// TestChiPhi_KhongCoTepKhongPhaiLoi: tác phẩm mới chưa có meta/usage.json. Đó là
// "chưa chạy gì", một trạng thái bình thường — trả 500 cho nó là biến ca người
// dùng gặp đầu tiên thành lỗi.
func TestChiPhi_KhongCoTepKhongPhaiLoi(t *testing.T) {
	root := t.TempDir()
	newBook(t, root, "sach", nil)
	s := &server{root: root}

	rec := do(t, s, "GET", "/api/books/sach/cost")
	if rec.Code != http.StatusOK {
		t.Fatalf("chưa có usage.json phải là 200, nhận %d: %s", rec.Code, rec.Body.String())
	}

	var doc CostDoc
	if err := json.Unmarshal(rec.Body.Bytes(), &doc); err != nil {
		t.Fatal(err)
	}
	if doc.State != ChiPhiChuaCoTep {
		t.Errorf("state = %q, phải là %q", doc.State, ChiPhiChuaCoTep)
	}
	if !strings.Contains(rec.Body.String(), `"per_agent":null`) {
		t.Errorf("chưa có tệp thì per_agent phải là null, không phải {}: %s", rec.Body.String())
	}
}

// TestChiPhi_SchemaLechKhongBaoLaChuaChay là bài kiểm quan trọng nhất của tệp này.
//
// UsageStore.Load() trả (nil, nil) cho HAI ca khác nhau: thiếu tệp, VÀ tệp có mà
// Schema != domain.UsageSchemaVersion (internal/store/usage.go:25 — bản lệch bị bỏ
// qua có chủ đích để engine dựng lại bằng session replay). Chỉ gọi Load thì hai ca
// đọc ra y hệt nhau, và một tác phẩm ĐÃ tốn tiền sẽ bị bề mặt báo là chưa chạy gì —
// sai theo đúng hướng làm người vận hành tưởng mình chưa tốn đồng nào.
func TestChiPhi_SchemaLechKhongBaoLaChuaChay(t *testing.T) {
	root := t.TempDir()
	st := newBook(t, root, "sach", nil)
	ghiTho(t, st, "meta/usage.json", `{
	  "schema": 999,
	  "overall": {"input": 703920, "output": 168390, "cost_usd": 7.373},
	  "per_agent": {"writer": {"input": 500000, "cost_usd": 5.1}}
	}`)

	s := &server{root: root}
	rec := do(t, s, "GET", "/api/books/sach/cost")
	if rec.Code != http.StatusOK {
		t.Fatalf("schema lệch vẫn phải là 200, nhận %d: %s", rec.Code, rec.Body.String())
	}

	var doc CostDoc
	if err := json.Unmarshal(rec.Body.Bytes(), &doc); err != nil {
		t.Fatal(err)
	}
	if doc.State == ChiPhiChuaCoTep {
		t.Error("tệp CÓ trên đĩa mà bề mặt báo \"chưa có tệp\" — người vận hành sẽ tưởng chưa tốn tiền")
	}
	if doc.State != ChiPhiLechSchema {
		t.Errorf("state = %q, phải là %q", doc.State, ChiPhiLechSchema)
	}
}

// TestChiPhi_CoTepMaChuaMucNao phân biệt ca thứ ba: đã chạy, chưa có số.
//
// Hình tệp ở đây mô phỏng đúng thứ engine ghi: UsageTracker.Snapshot luôn
// `make()` cả hai map (internal/host/usage.go:445), nên một phiên chưa cộng được
// mục nào ra `{}` chứ không phải null.
func TestChiPhi_CoTepMaChuaMucNao(t *testing.T) {
	root := t.TempDir()
	st := newBook(t, root, "sach", nil)
	ghiTho(t, st, "meta/usage.json", `{
	  "schema": `+itoa(domain.UsageSchemaVersion)+`,
	  "updated_at": "2026-07-31T09:00:00Z",
	  "overall": {},
	  "per_agent": {},
	  "per_model": {}
	}`)

	s := &server{root: root}
	rec := do(t, s, "GET", "/api/books/sach/cost")
	if rec.Code != http.StatusOK {
		t.Fatalf("mã %d: %s", rec.Code, rec.Body.String())
	}

	var doc CostDoc
	if err := json.Unmarshal(rec.Body.Bytes(), &doc); err != nil {
		t.Fatal(err)
	}
	if doc.State != ChiPhiRong {
		t.Errorf("state = %q, phải là %q", doc.State, ChiPhiRong)
	}
	if !strings.Contains(rec.Body.String(), `"per_agent":{}`) {
		t.Errorf("tệp đã ghi mà rỗng phải ra `{}`, không phải null: %s", rec.Body.String())
	}
}

// TestChiPhi_SoKhongVanXuongJSON canh cùng lớp lỗi với Dimension.Score, ở chỗ nó
// tốn tiền thật.
//
// Ở bề mặt chi phí, $0 và "chưa có số liệu" là HAI chuyện khác nhau: một tác tử
// chạy toàn bằng model miễn phí có cost_usd = 0 thật. `omitempty` trên số gộp hai
// chuyện đó lại vì 0 là zero-value, và một lớp phòng `!= null` ở phía web không
// cứu được — server đã làm rụng dữ liệu trước khi tới nó.
func TestChiPhi_SoKhongVanXuongJSON(t *testing.T) {
	raw, err := json.Marshal(UsageTotals{})
	if err != nil {
		t.Fatal(err)
	}
	for _, khoa := range []string{
		`"input":0`, `"output":0`, `"cache_read":0`, `"cache_write":0`,
		`"cost_usd":0`, `"saved_usd":0`, `"cache_capable":false`, `"cache_breaks":0`,
	} {
		if !strings.Contains(string(raw), khoa) {
			t.Errorf("thiếu %s: %s", khoa, raw)
		}
	}
}

// TestChiPhi_KhongLapLaiConSoCuaThanhDuoi chốt một quyết định thiết kế, không
// phải một hành vi.
//
// Tổng chi phí và giá thành trung bình mỗi chương ĐÃ có ở Transport và đã hiện ở
// thanh dưới. Lặp một con số ở hai chỗ là cách hai bản của nó bắt đầu lệch nhau,
// nên bề mặt này chỉ mang phần chia nhỏ. Bài kiểm tồn tại vì "thêm lại cho tiện"
// là việc rất dễ làm và rất khó thấy.
//
// Overall thì VẪN ở đây và có lý do: tổng token và tổng tiết kiệm nhờ đệm không có
// ở đâu khác trong API, và không có mẫu số thì mỗi hàng chỉ là một con số trơ.
func TestChiPhi_KhongLapLaiConSoCuaThanhDuoi(t *testing.T) {
	raw, err := json.Marshal(CostDoc{State: ChiPhiSanSang})
	if err != nil {
		t.Fatal(err)
	}
	for _, khoa := range []string{"cost_per_chapter", "chapters_per_hour"} {
		if strings.Contains(string(raw), khoa) {
			t.Errorf("%q thuộc về Transport/thanh dưới, không được lặp ở bề mặt Chi phí: %s", khoa, raw)
		}
	}
	// Mẫu số phải còn: bỏ nó đi thì mỗi hàng không nói được "Writer chiếm 62%".
	if !strings.Contains(string(raw), `"overall"`) {
		t.Errorf("thiếu overall — mất mẫu số thì phần chia nhỏ vô nghĩa: %s", raw)
	}
}

// TestChiPhi_TepHongThiBaoLoi: khác bề mặt Văn phong, đây là nguồn DUY NHẤT nên
// hỏng là không còn gì để hiện.
func TestChiPhi_TepHongThiBaoLoi(t *testing.T) {
	root := t.TempDir()
	st := newBook(t, root, "sach", nil)
	ghiTho(t, st, "meta/usage.json", `{"schema": 2, "overall": [hỏng`)

	s := &server{root: root}
	rec := do(t, s, "GET", "/api/books/sach/cost")
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("usage.json hỏng phải là 500, nhận %d: %s", rec.Code, rec.Body.String())
	}
}

// TestChiPhi_ChiaNhoTheoTacTuVaModel: đường thuận lợi — phần chia nhỏ là thứ
// duy nhất bề mặt này có mà thanh dưới không có, nên nó phải thật sự xuống được.
func TestChiPhi_ChiaNhoTheoTacTuVaModel(t *testing.T) {
	root := t.TempDir()
	newBook(t, root, "sach", func(st *store.Store) {
		if err := st.Usage.Save(domain.UsageState{
			Overall:  domain.AgentUsageTotals{Input: 512_800, Cost: 6.5, CacheCapable: true},
			PerAgent: map[string]domain.AgentUsageTotals{"writer": {Input: 400_000, Cost: 5.0}},
			PerModel: map[string]domain.AgentUsageTotals{"gemini-2.5-pro": {Input: 512_800, Cost: 6.5}},
		}); err != nil {
			t.Fatal(err)
		}
	})

	s := &server{root: root}
	rec := do(t, s, "GET", "/api/books/sach/cost")
	if rec.Code != http.StatusOK {
		t.Fatalf("mã %d: %s", rec.Code, rec.Body.String())
	}

	var doc CostDoc
	if err := json.Unmarshal(rec.Body.Bytes(), &doc); err != nil {
		t.Fatal(err)
	}
	if doc.State != ChiPhiSanSang {
		t.Errorf("state = %q, phải là %q", doc.State, ChiPhiSanSang)
	}
	if got := doc.PerAgent["writer"].CostUSD; got != 5.0 {
		t.Errorf("per_agent[writer].cost_usd = %v, phải là 5", got)
	}
	if got := doc.PerModel["gemini-2.5-pro"].Input; got != 512_800 {
		t.Errorf("per_model[gemini-2.5-pro].input = %v, phải là 512800", got)
	}
}
