package serve

import (
	"encoding/json"
	"net/http"
	"reflect"
	"strings"
	"testing"

	"github.com/huuhoa143/ainovel-studio/internal/domain"
	"github.com/huuhoa143/ainovel-studio/internal/store"
)

// TestCaiDat_KhongCoTepKhongPhaiLoi: thư mục đã có meta/progress.json mà chưa có
// meta/run.json là ca có thật — sách nhập từ nguồn ngoài, hoặc store dựng bằng
// công cụ chưa gọi RunMeta.Init. Trả 500 cho nó là biến trạng thái bình thường
// thành lỗi.
//
// Cần State vì đây là OBJECT: không có `null` của mảng để dựa vào, nên "chưa có
// tệp" và "có tệp mà mọi trường rỗng" sẽ đọc ra y hệt nhau nếu thiếu trường này.
func TestCaiDat_KhongCoTepKhongPhaiLoi(t *testing.T) {
	root := t.TempDir()
	newBook(t, root, "sach", nil) // newBook KHÔNG gọi RunMeta.Init
	s := &server{root: root}

	rec := do(t, s, "GET", "/api/books/sach/settings")
	if rec.Code != http.StatusOK {
		t.Fatalf("chưa có run.json phải là 200, nhận %d: %s", rec.Code, rec.Body.String())
	}

	var doc SettingsDoc
	if err := json.Unmarshal(rec.Body.Bytes(), &doc); err != nil {
		t.Fatal(err)
	}
	if doc.State != CaiDatChuaCoTep {
		t.Errorf("state = %q, phải là %q", doc.State, CaiDatChuaCoTep)
	}
	if doc.AdvanceHold != nil || doc.PlanStart != nil {
		t.Error("chưa có tệp thì không được đoán ra khối rỗng trông như dữ liệu")
	}
}

// TestCaiDat_LuonChiDoc canh ràng buộc kiến trúc, không phải một giá trị.
//
// Engine là process riêng và SỞ HỮU quyền ghi meta/run.json. Hai process cùng sửa
// nó sẽ mất trắng ý kiến can thiệp — engine đọc PendingSteer, xử lý, rồi
// ClearPendingSteer, và một lượt ghi chen vào giữa biến mất không lỗi, không dấu
// vết. Store không có khóa liên tiến-trình.
//
// Nên Writable phải là false ở CẢ HAI trạng thái: câu trả lời cho "bề mặt này ghi
// được chứ" không phụ thuộc vào việc tệp có tồn tại hay không.
func TestCaiDat_LuonChiDoc(t *testing.T) {
	root := t.TempDir()
	newBook(t, root, "co-du-lieu", func(st *store.Store) {
		if err := st.RunMeta.Init("tien_hiep", "google", "gemini-2.5-pro"); err != nil {
			t.Fatal(err)
		}
	})
	newBook(t, root, "trong", nil)
	s := &server{root: root}

	for _, id := range []string{"co-du-lieu", "trong"} {
		rec := do(t, s, "GET", "/api/books/"+id+"/settings")
		if rec.Code != http.StatusOK {
			t.Fatalf("%s: mã %d", id, rec.Code)
		}
		var doc SettingsDoc
		if err := json.Unmarshal(rec.Body.Bytes(), &doc); err != nil {
			t.Fatal(err)
		}
		if doc.Writable {
			t.Errorf("%s: writable = true — bề mặt sẽ mở ô nhập, và một lượt ghi từ web "+
				"sẽ mất trắng ý kiến can thiệp của engine", id)
		}
	}
}

// TestCaiDat_SoKhongVanXuongJSON: ở chế độ review, advance_permit_chapter = 0
// nghĩa là "không có chương nào đang được cấp phép" — một tin THẬT, khác hẳn
// "không biết". `omitempty` gộp hai chuyện đó vì 0 là zero-value.
func TestCaiDat_SoKhongVanXuongJSON(t *testing.T) {
	raw, err := json.Marshal(SettingsDoc{State: CaiDatSanSang, AdvanceMode: "review"})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), `"advance_permit_chapter":0`) {
		t.Errorf("thiếu advance_permit_chapter:0 — ở chế độ review đó là tin thật: %s", raw)
	}
	// Khoá của các khối vắng phải CÓ MẶT với giá trị null, để web phân biệt được
	// "không có ý định tạm dừng nào" với "server không nói gì về nó".
	for _, khoa := range []string{`"advance_hold":null`, `"plan_start":null`} {
		if !strings.Contains(string(raw), khoa) {
			t.Errorf("thiếu %s: %s", khoa, raw)
		}
	}
}

// TestCaiDat_KhongMangKhoaAPI canh một ràng buộc bảo mật đã ghi thành lời.
//
// Khoá API và cấu hình provider KHÔNG nằm trong store (chúng ở config của người
// dùng) và không được thêm vào đây. Server này mặc định chỉ lắng nghe localhost
// đúng vì store đã đủ nhạy cảm; đưa khoá vào một payload HTTP là biến một rò rỉ
// tiềm năng thành một rò rỉ có sẵn.
//
// Bài kiểm quét theo thẻ json thay vì theo giá trị: nó phải bắt được lúc ai đó
// THÊM trường, chứ không phải lúc trường đó tình cờ có dữ liệu.
func TestCaiDat_KhongMangKhoaAPI(t *testing.T) {
	cam := []string{"key", "secret", "token", "password", "credential", "api_key"}
	tp := reflect.TypeOf(SettingsDoc{})
	for i := 0; i < tp.NumField(); i++ {
		the := tp.Field(i).Tag.Get("json")
		if idx := strings.Index(the, ","); idx >= 0 {
			the = the[:idx]
		}
		for _, tu := range cam {
			if strings.Contains(strings.ToLower(the), tu) {
				t.Errorf("SettingsDoc.%s (json:%q) chứa %q — khoá/bí mật không được vào payload HTTP",
					tp.Field(i).Name, the, tu)
			}
		}
	}
	if tp.NumField() == 0 {
		t.Fatal("không đọc được trường nào — bài kiểm này đang rỗng")
	}
}

// TestCaiDat_LuocRawPrompt: PlanStart.RawPrompt lặp lại StartPrompt gần như
// nguyên văn, và một trường lặp là một trường sẽ lệch. Nó bị lược có chủ đích, nên
// phải có chỗ canh việc "thêm lại cho đủ".
func TestCaiDat_LuocRawPrompt(t *testing.T) {
	raw, err := json.Marshal(PlanStart{Planner: "architect_long"})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "raw_prompt") {
		t.Errorf("raw_prompt lặp lại start_prompt, đã lược có chủ đích: %s", raw)
	}
}

// TestCaiDat_DuongThuanLoi: đủ mọi trường mà bề mặt phải hiện khác nhau —
// review + giấy phép đang treo + ý định tạm dừng + chỉ thị can thiệp chưa xử lý.
//
// Thứ tự gọi ở đây KHÔNG đảo được: GrantAdvancePermit từ chối chạy khi chế độ còn
// là auto (internal/store/run_meta.go:validateAdvanceControl), nên phải
// SetAdvanceMode trước.
func TestCaiDat_DuongThuanLoi(t *testing.T) {
	root := t.TempDir()
	newBook(t, root, "sach", func(st *store.Store) {
		must := func(err error) {
			t.Helper()
			if err != nil {
				t.Fatal(err)
			}
		}
		must(st.RunMeta.Init("tien_hiep", "google", "gemini-2.5-pro"))
		must(st.RunMeta.SetPlanningTier(domain.PlanningTierLong))
		must(st.RunMeta.SetPlanStart(domain.PlanStartRecord{
			RawPrompt: "yêu cầu gốc rất dài, phải bị lược khỏi payload",
			Planner:   "architect_long", PlannerTask: "Dựng bộ khung nhiều tập",
			DecisionID: "dec-20260731-0001",
		}))
		must(st.RunMeta.SetAdvanceMode(domain.ChapterAdvanceReview))
		must(st.RunMeta.GrantAdvancePermit(8))
		must(st.RunMeta.SetAdvanceHold(domain.AdvanceHold{
			After:  domain.AdvanceHoldAfterRewritesDrained,
			Reason: "Dừng cho tôi đọc trước khi sang cung sau",
		}))
		must(st.RunMeta.SetPendingSteer("Đừng để Diệp Tiểu Yến lộ chuyện ở cung này"))
	})

	s := &server{root: root}
	rec := do(t, s, "GET", "/api/books/sach/settings")
	if rec.Code != http.StatusOK {
		t.Fatalf("mã %d: %s", rec.Code, rec.Body.String())
	}

	var doc SettingsDoc
	if err := json.Unmarshal(rec.Body.Bytes(), &doc); err != nil {
		t.Fatal(err)
	}
	if doc.State != CaiDatSanSang {
		t.Errorf("state = %q, phải là %q", doc.State, CaiDatSanSang)
	}
	if doc.AdvanceMode != string(domain.ChapterAdvanceReview) {
		t.Errorf("advance_mode = %q", doc.AdvanceMode)
	}
	if doc.AdvancePermitChapter != 8 {
		t.Errorf("advance_permit_chapter = %d, phải là 8", doc.AdvancePermitChapter)
	}
	if doc.AdvanceHold == nil {
		t.Fatal("advance_hold bị mất")
	}
	if doc.AdvanceHold.After != string(domain.AdvanceHoldAfterRewritesDrained) {
		t.Errorf("advance_hold.after = %q", doc.AdvanceHold.After)
	}
	if doc.PendingSteer == "" {
		t.Error("pending_steer bị mất — nó là thứ duy nhất trên bề mặt này đang chờ engine hành động")
	}
	if doc.PlanStart == nil || doc.PlanStart.Planner != "architect_long" {
		t.Errorf("plan_start sai: %+v", doc.PlanStart)
	}
	// Dấu tiếng Việt phải nguyên vẹn, không thoát thành \u.
	if !strings.Contains(rec.Body.String(), "Diệp Tiểu Yến") {
		t.Errorf("dấu tiếng Việt bị thoát trong payload: %s", rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), "yêu cầu gốc rất dài") {
		t.Error("RawPrompt phải bị lược khỏi payload")
	}
}
