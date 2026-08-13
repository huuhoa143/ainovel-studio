package serve

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/huuhoa143/ainovel-studio/internal/domain"
	"github.com/huuhoa143/ainovel-studio/internal/rules"
	"github.com/huuhoa143/ainovel-studio/internal/store"
)

// ghiTho ghi thẳng bytes vào một đường dẫn trong store, bỏ qua tầng store.
//
// Cần thiết vì mọi phép ghi qua store đều tạo JSON hợp lệ, nên không có cách nào
// dựng ca "tệp hỏng" bằng API công khai. Và ca đó phải kiểm được: nó là ranh giới
// giữa "chưa có dữ liệu" (bình thường) và "nguồn hỏng thật" (tin vận hành), tức
// đúng chỗ mà một endpoint dễ gộp hai chuyện lại.
func ghiTho(t *testing.T, st *store.Store, rel, noiDung string) {
	t.Helper()
	duong := filepath.Join(st.Dir(), filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(duong), 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", rel, err)
	}
	if err := os.WriteFile(duong, []byte(noiDung), 0o644); err != nil {
		t.Fatalf("ghi %s: %v", rel, err)
	}
}

// TestVanPhong_ThieuCaHaiNguonKhongPhaiLoi canh lớp lỗi "trạng thái bình thường
// bị trả về như lỗi".
//
// Tác phẩm mới chưa qua biên cung nào thì meta/style_rules.json chưa tồn tại, và
// chưa mở qua Host thì meta/user_rules.json cũng vậy. Đây là ca người dùng gặp
// ĐẦU TIÊN, nên trả 500 cho nó là biến lần chạy đầu thành một lỗi.
func TestVanPhong_ThieuCaHaiNguonKhongPhaiLoi(t *testing.T) {
	root := t.TempDir()
	newBook(t, root, "sach", nil)
	s := &server{root: root}

	rec := do(t, s, "GET", "/api/books/sach/style")
	if rec.Code != http.StatusOK {
		t.Fatalf("thiếu cả hai nguồn phải là 200, nhận %d: %s", rec.Code, rec.Body.String())
	}

	// Khoá phải CÓ MẶT với giá trị null, không được vắng: web phân biệt "tệp chưa
	// từng được ghi" (null) với "đã ghi mà rỗng" ([]/{}), và omitempty xoá cả hai
	// thành một.
	raw := rec.Body.String()
	for _, khoa := range []string{`"arc_style":null`, `"user_rules":null`} {
		if !strings.Contains(raw, khoa) {
			t.Errorf("thiếu %s trong payload: %s", khoa, raw)
		}
	}
}

// TestVanPhong_MotNguonHongVanConNguonKia canh: một tệp hỏng không được làm
// trắng cả bề mặt khi nguồn còn lại vẫn đọc được.
//
// Và nó không được NUỐT lỗi: "rỗng vì chưa có" với "rỗng vì hỏng" là hai tin vận
// hành khác nhau, gộp lại thì người vận hành đi sửa sai chỗ.
func TestVanPhong_MotNguonHongVanConNguonKia(t *testing.T) {
	root := t.TempDir()
	st := newBook(t, root, "sach", func(st *store.Store) {
		if err := st.UserRules.Save(&rules.Snapshot{
			Status:      rules.StatusReady,
			Structured:  rules.Structured{Genre: "tiên hiệp điều tra"},
			Preferences: "nhịp chậm, tránh đánh nhau dài",
			Sources:     []string{"startup_prompt"},
		}); err != nil {
			t.Fatal(err)
		}
	})
	ghiTho(t, st, "meta/style_rules.json", `{"prose": [ đây không phải JSON`)

	s := &server{root: root}
	rec := do(t, s, "GET", "/api/books/sach/style")
	if rec.Code != http.StatusOK {
		t.Fatalf("một nguồn hỏng mà nguồn kia đọc được phải là 200, nhận %d", rec.Code)
	}

	var doc StyleDoc
	if err := json.Unmarshal(rec.Body.Bytes(), &doc); err != nil {
		t.Fatal(err)
	}
	if doc.User == nil {
		t.Error("nguồn user_rules đọc được mà bị làm trắng theo nguồn hỏng")
	}
	if doc.Arc != nil {
		t.Error("nguồn hỏng phải là nil, không được đoán ra một khối rỗng trông như dữ liệu")
	}
	if len(doc.Warnings) != 1 {
		t.Fatalf("phải có đúng 1 cảnh báo nêu tên nguồn hỏng, nhận %d: %v", len(doc.Warnings), doc.Warnings)
	}
	if !strings.Contains(doc.Warnings[0], "style_rules.json") {
		t.Errorf("cảnh báo phải gọi tên nguồn hỏng để biết sửa ở đâu: %q", doc.Warnings[0])
	}
}

// TestVanPhong_CaHaiNguonHongThiBaoLoi: khi không còn gì để hiện thì phải nói
// thất bại, không trả một bề mặt trắng trông như "chưa có dữ liệu".
func TestVanPhong_CaHaiNguonHongThiBaoLoi(t *testing.T) {
	root := t.TempDir()
	st := newBook(t, root, "sach", nil)
	ghiTho(t, st, "meta/style_rules.json", `{hỏng`)
	ghiTho(t, st, "meta/user_rules.json", `[cũng hỏng`)

	s := &server{root: root}
	rec := do(t, s, "GET", "/api/books/sach/style")
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("cả hai nguồn hỏng phải là 500, nhận %d: %s", rec.Code, rec.Body.String())
	}
}

// TestVanPhong_NullKhacRong chốt quy ước null≠[] cho bề mặt này.
//
// Quy ước do /outline, /cast, /world lập ra và web dựa vào (web/lib/types.ts):
// `null` = tệp chưa từng được ghi, `[]` = tệp đã có mà mục này rỗng. Hai ca là
// hai sự thật, và `omitempty` gộp chúng thành "khoá không có mặt" — tức phá đúng
// cái phân biệt mà quy ước tồn tại để giữ.
func TestVanPhong_NullKhacRong(t *testing.T) {
	root := t.TempDir()
	st := newBook(t, root, "sach", func(st *store.Store) {
		// prose có mục, dialogue rỗng KHÁC nil, taboos để nil.
		if err := st.World.SaveStyleRules(domain.WritingStyleRules{
			Volume: 1, Arc: 2,
			Prose:     []string{"Tả cảnh bằng chi tiết nghề gác cầu, không bằng tính từ"},
			Dialogue:  []domain.CharacterVoice{},
			UpdatedAt: "2026-07-31T09:00:00Z",
		}); err != nil {
			t.Fatal(err)
		}
	})
	_ = st

	s := &server{root: root}
	rec := do(t, s, "GET", "/api/books/sach/style")
	if rec.Code != http.StatusOK {
		t.Fatalf("mã %d: %s", rec.Code, rec.Body.String())
	}
	raw := rec.Body.String()
	if !strings.Contains(raw, `"dialogue":[]`) {
		t.Errorf("mảng rỗng đã ghi phải ra `[]`, không phải null hay khoá vắng: %s", raw)
	}
	if !strings.Contains(raw, `"taboos":null`) {
		t.Errorf("mảng chưa ghi phải ra `null`: %s", raw)
	}
	// Volume/Arc là số: 0 phải xuống được, nên khoá luôn có mặt (cùng lớp lỗi với
	// Dimension.Score — xem diem_khong_test.go).
	if !strings.Contains(raw, `"volume":1`) || !strings.Contains(raw, `"arc":2`) {
		t.Errorf("thiếu volume/arc: %s", raw)
	}
}

// TestVanPhong_SoKhongVanXuongJSON: cùng lớp lỗi omitempty với Dimension.Score,
// khác kiểu. Một bản style_rules chắt ở tập 0 / cung 0 (chưa gắn được tập-cung)
// phải xuống tới client là 0, không phải khoá vắng.
func TestVanPhong_SoKhongVanXuongJSON(t *testing.T) {
	raw, err := json.Marshal(ArcStyle{Volume: 0, Arc: 0})
	if err != nil {
		t.Fatal(err)
	}
	for _, khoa := range []string{`"volume":0`, `"arc":0`} {
		if !strings.Contains(string(raw), khoa) {
			t.Errorf("thiếu %s — omitempty gộp \"tập 0\" với \"không biết tập nào\": %s", khoa, raw)
		}
	}
}
