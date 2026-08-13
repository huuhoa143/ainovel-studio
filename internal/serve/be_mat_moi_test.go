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

// Bộ kiểm bề mặt Cài đặt + các luật CHUNG cho cả ba bề mặt mới.
//
// Phân chia với hai tệp kiểm cùng nhóm, để không ai phải đọc ba tệp mới biết một
// ca đã được kiểm chưa:
//   - style_test.go — các ca riêng của bề mặt Văn phong (thiếu nguồn, nguồn hỏng,
//     quy ước null≠[])
//   - cost_test.go  — các ca riêng của bề mặt Chi phí (bốn trạng thái, số 0)
//   - tệp này       — bề mặt Cài đặt, cộng những luật phải đúng ở CẢ BA: hàng rào
//     đi ngang thư mục, dấu tiếng Việt, và ba cờ Capabilities phải khớp payload
//
// Mỗi bài kiểm gắn với MỘT lớp lỗi đã có tiền lệ thật trong repo này, không phải
// kiểm cho đủ độ phủ:
//   - omitempty trên số làm rụng giá trị 0 (Dimension.Score đã mắc)
//   - thiếu tệp store bị đối xử như lỗi (ca người dùng gặp ĐẦU TIÊN)
//   - cờ Capabilities suy từ đường riêng nên lệch dữ liệu (LayeredOutline đã mắc)
//   - đi ngang thư mục qua id lấy từ URL
//
// Helper ghiTho (ghi bytes thô, bỏ qua tầng store để dựng ca tệp hỏng) và newBook
// nằm ở style_test.go / serve_test.go — cùng gói, không khai lại.

/* ── Văn phong ───────────────────────────────────────────────────────────── */

// Lớp lỗi mà việc dựng bề mặt này phải xoá bỏ: meta/style_rules.json chỉ được ghi
// ở BIÊN CUNG (internal/tools/save_arc_summary.go:118). Nếu bề mặt chỉ đọc tệp đó
// thì suốt cả cung ĐẦU của mọi tác phẩm nó rỗng trơn — đúng dạng "chưa dựng" giả.
// meta/user_rules.json đã có ngay từ lúc mở sách, nên nó phải đủ để vẽ bề mặt.
func TestVanPhong_ChiCoUserRulesVanDungDuocBeMat(t *testing.T) {
	root := t.TempDir()
	st := newBook(t, root, "sach", func(st *store.Store) {
		if err := st.UserRules.Save(&rules.Snapshot{
			Version: rules.SnapshotVersion,
			Status:  rules.StatusReady,
			Structured: rules.Structured{
				Genre:            "tiên hiệp điều tra",
				ForbiddenPhrases: []string{"khóe miệng khẽ nhếch lên"},
				FatigueWords:     map[string]int{"tuy nhiên": 2},
			},
			Sources: []string{"system_defaults", "global:van-phong.md"},
		}); err != nil {
			t.Fatal(err)
		}
	})
	s := &server{root: root}

	rec := do(t, s, "GET", "/api/books/sach/style")
	if rec.Code != http.StatusOK {
		t.Fatalf("mã %d; thân: %s", rec.Code, rec.Body.String())
	}
	var doc StyleDoc
	if err := json.Unmarshal(rec.Body.Bytes(), &doc); err != nil {
		t.Fatal(err)
	}
	// Chưa qua biên cung nào: khối này phải VẮNG, không phải rỗng bịa ra.
	if doc.Arc != nil {
		t.Errorf("arc_style phải null khi chưa qua biên cung, được %+v", doc.Arc)
	}
	if doc.User == nil {
		t.Fatal("user_rules phải có mặt — tệp đã tồn tại từ lúc mở sách")
	}
	if doc.User.Genre != "tiên hiệp điều tra" {
		t.Errorf("genre = %q", doc.User.Genre)
	}
	if len(doc.User.DeclaredBy) != 2 {
		t.Errorf("declared_by = %v, phải nêu đủ nguồn đã góp", doc.User.DeclaredBy)
	}

	// Và capability phải là true: có dữ liệu để vẽ dù MỘT nguồn còn vắng. Báo
	// false ở đây sẽ làm Rail gắn nhãn "chưa dựng" cho một bề mặt có nội dung
	// thật — đúng lỗi LayeredOutline đã mắc.
	snap, err := buildSnapshot(st, "sach", 0)
	if err != nil {
		t.Fatal(err)
	}
	if !snap.Capabilities.StyleRules {
		t.Error("capabilities.style_rules = false trong khi user_rules có dữ liệu thật")
	}
}

// Các ca Văn phong còn lại — thiếu cả hai nguồn, một nguồn hỏng, cả hai hỏng,
// và quy ước null≠[] — nằm ở style_test.go, không nhân bản ở đây.

/* ── Cài đặt ─────────────────────────────────────────────────────────────── */

// Cài đặt là OBJECT nên không có `null` của mảng để dựa vào. Phải trả 200 kèm
// state, KHÔNG phải 404: 404 ở đây trộn lẫn với 404 thật của openBook ("sai tên
// tác phẩm"), và giao diện sẽ mất khả năng phân biệt hai chuyện đó.
func TestCaiDat_ThieuTepTra200KemState(t *testing.T) {
	root := t.TempDir()
	st := newBook(t, root, "sach", nil) // Progress.Init nhưng KHÔNG RunMeta.Init
	s := &server{root: root}

	rec := do(t, s, "GET", "/api/books/sach/settings")
	if rec.Code != http.StatusOK {
		t.Fatalf("mã %d, muốn 200; thân: %s", rec.Code, rec.Body.String())
	}
	var doc SettingsDoc
	if err := json.Unmarshal(rec.Body.Bytes(), &doc); err != nil {
		t.Fatal(err)
	}
	if doc.State != CaiDatChuaCoTep {
		t.Errorf("state = %q, muốn %q", doc.State, CaiDatChuaCoTep)
	}
	if doc.Writable {
		t.Error("writable phải là false ở bản chỉ-đọc")
	}

	snap, err := buildSnapshot(st, "sach", 0)
	if err != nil {
		t.Fatal(err)
	}
	if snap.Capabilities.RunSettings {
		t.Error("chưa có meta/run.json mà capability báo true")
	}
}

// advance_permit_chapter = 0 nghĩa là "không chương nào được cấp phép", và ở chế
// độ review đó là tin thật mà người vận hành cần thấy. omitempty sẽ làm rụng nó.
func TestCaiDat_GiayPhepBangKhongVanConKhoa(t *testing.T) {
	root := t.TempDir()
	newBook(t, root, "sach", func(st *store.Store) {
		if err := st.RunMeta.Init("tien_hiep", "google", "gemini-2.5-pro"); err != nil {
			t.Fatal(err)
		}
		if err := st.RunMeta.SetAdvanceMode(domain.ChapterAdvanceReview); err != nil {
			t.Fatal(err)
		}
	})
	s := &server{root: root}

	body := do(t, s, "GET", "/api/books/sach/settings").Body.String()
	if !strings.Contains(body, `"advance_permit_chapter":0`) {
		t.Errorf("giấy phép = 0 bị omitempty nuốt: %s", body)
	}
	if !strings.Contains(body, `"advance_mode":"review"`) {
		t.Errorf("mất chế độ推进: %s", body)
	}
}

// Khoá API và cấu hình provider KHÔNG nằm trong store và không được rò ra đây.
// Bài kiểm này canh chuyện đó không trôi vào sau này.
func TestCaiDat_KhongRoKhoaVaKhongLapRawPrompt(t *testing.T) {
	root := t.TempDir()
	newBook(t, root, "sach", func(st *store.Store) {
		if err := st.RunMeta.Init("tien_hiep", "google", "gemini-2.5-pro"); err != nil {
			t.Fatal(err)
		}
		if err := st.RunMeta.SetPlanStart(domain.PlanStartRecord{
			RawPrompt:   "ĐỪNG-LẶP-CHUỖI-NÀY",
			Planner:     "architect_long",
			PlannerTask: "Dựng bộ khung nhiều tập",
			DecisionID:  "dec-1",
		}); err != nil {
			t.Fatal(err)
		}
	})
	s := &server{root: root}

	body := do(t, s, "GET", "/api/books/sach/settings").Body.String()
	for _, xau := range []string{"api_key", "apikey", "secret", "token", "base_url", "raw_prompt"} {
		if strings.Contains(strings.ToLower(body), xau) {
			t.Errorf("payload cài đặt mang %q — không được: %s", xau, body)
		}
	}
	if strings.Contains(body, "ĐỪNG-LẶP-CHUỖI-NÀY") {
		t.Errorf("raw_prompt bị lộ dù đã lược khóa: %s", body)
	}
	// Nhưng phần đáng hiện của plan_start vẫn phải còn.
	if !strings.Contains(body, "architect_long") {
		t.Errorf("mất plan_start.planner: %s", body)
	}
}

/* ── chung cho cả ba ─────────────────────────────────────────────────────── */

// id tác phẩm đến từ URL nên là dữ liệu không tin được. Ba route mới phải đi qua
// ĐÚNG hàng rào của bookDir như các route cũ; quên một chỗ là mở lại đúng lỗ đã
// bịt (store chứa toàn văn chưa phát hành).
func TestBeMatMoi_ChanDiNgangThuMuc(t *testing.T) {
	root := t.TempDir()
	newBook(t, root, "sach", nil)
	// Một tác phẩm THẬT nằm ngoài root: nếu hàng rào hở thì nó đọc được.
	ngoai := filepath.Join(filepath.Dir(root), "ngoai-xuong")
	if err := os.MkdirAll(filepath.Join(ngoai, "meta"), 0o755); err != nil {
		t.Fatal(err)
	}
	s := &server{root: root}

	for _, duong := range []string{"style", "cost", "settings"} {
		for _, id := range []string{"..", "../ngoai-xuong", "../../etc", "sub/dir", "/etc"} {
			t.Run(duong+"_"+id, func(t *testing.T) {
				rec := do(t, s, "GET", "/api/books/"+id+"/"+duong)
				if rec.Code == http.StatusOK {
					t.Errorf("GET /%s với id %q trả 200 — hàng rào hở: %s",
						duong, id, rec.Body.String())
				}
			})
		}
	}
}

// Dấu tiếng Việt phải sống nguyên qua cả ba endpoint mới, kể cả ca chuỗi dài.
// Encoder mặc định của Go thoát HTML; giao diện đọc được nhưng curl và log thì
// không, và đó là chỗ người vận hành hay soi nhất.
func TestBeMatMoi_GiuNguyenDauTiengViet(t *testing.T) {
	const dai = "Giữ điểm nhìn hạn chế ở Lâm Thanh: chỉ kể những gì y thấy, nghe hoặc suy " +
		"ra được, tuyệt đối không nhảy vào đầu Bạch Vô Hà để giải thích động cơ — sức nặng " +
		"của tuyến truyện này nằm ở chỗ người đọc biết nhiều hơn Lâm Thanh nhưng vẫn chưa " +
		"biết đủ."

	root := t.TempDir()
	newBook(t, root, "sach", func(st *store.Store) {
		if err := st.World.SaveStyleRules(domain.WritingStyleRules{
			Volume: 1, Arc: 1,
			Prose:  []string{dai},
			Taboos: []string{"Không dùng lại hình ảnh 'ba tiếng chuông' để kết chương lần thứ hai"},
			Dialogue: []domain.CharacterVoice{
				{Name: "Diệp Tiểu Yến", Rules: []string{"Hay bỏ lửng câu ở cuối khi nói về Bạch gia."}},
			},
		}); err != nil {
			t.Fatal(err)
		}
		if err := st.RunMeta.Init("tiên hiệp điều tra", "google", "gemini-2.5-pro"); err != nil {
			t.Fatal(err)
		}
	})
	s := &server{root: root}

	for _, duong := range []string{"style", "settings"} {
		body := do(t, s, "GET", "/api/books/sach/"+duong).Body.String()
		if strings.Contains(body, `\u`) {
			t.Errorf("/%s thoát unicode: %s", duong, body)
		}
	}
	body := do(t, s, "GET", "/api/books/sach/style").Body.String()
	if !strings.Contains(body, dai) {
		t.Errorf("chuỗi dài có dấu bị méo: %s", body)
	}
	if !strings.Contains(body, "Diệp Tiểu Yến") {
		t.Errorf("tên nhân vật có dấu bị méo: %s", body)
	}
}

// Ba cờ phải suy từ DỮ LIỆU thật qua chính builder mà endpoint dùng — không phải
// từ một phép kiểm song song. Hai đường suy luận về cùng dữ liệu sẽ có lúc lệch,
// và khi lệch thì Rail ẩn một bề mặt vẫn còn đủ dữ liệu (lỗi LayeredOutline).
func TestBeMatMoi_BaCoKhopVoiPayloadThat(t *testing.T) {
	root := t.TempDir()
	st := newBook(t, root, "sach", func(st *store.Store) {
		must := func(err error) {
			t.Helper()
			if err != nil {
				t.Fatal(err)
			}
		}
		must(st.World.SaveStyleRules(domain.WritingStyleRules{
			Volume: 1, Arc: 1, Prose: []string{"Câu tả thiên nhiên tối đa hai câu liền nhau."},
		}))
		must(st.Usage.Save(demoUsageNho()))
		must(st.RunMeta.Init("tien_hiep", "google", "gemini-2.5-pro"))
	})

	snap, err := buildSnapshot(st, "sach", 0)
	if err != nil {
		t.Fatal(err)
	}
	if !snap.Capabilities.StyleRules {
		t.Error("style_rules = false dù có prose thật")
	}
	if !snap.Capabilities.CostBreakdown {
		t.Error("cost_breakdown = false dù có per_agent thật")
	}
	if !snap.Capabilities.RunSettings {
		t.Error("run_settings = false dù có meta/run.json")
	}

	// Và cờ phải khớp với payload endpoint trả — đây là điểm chính của bài kiểm.
	styleDoc, err := buildStyle(st)
	if err != nil {
		t.Fatal(err)
	}
	if got := coVanPhong(styleDoc); got != snap.Capabilities.StyleRules {
		t.Errorf("cờ (%v) lệch payload (%v)", snap.Capabilities.StyleRules, got)
	}
	costDoc, err := buildCost(st)
	if err != nil {
		t.Fatal(err)
	}
	if got := coChiPhiChiTiet(costDoc); got != snap.Capabilities.CostBreakdown {
		t.Errorf("cờ (%v) lệch payload (%v)", snap.Capabilities.CostBreakdown, got)
	}
}

// usage.json chỉ có Overall mà không mục nào: cờ phải là false, vì giá trị của
// bề mặt Chi phí là PHẦN CHIA NHỎ — thanh dưới đã có tổng.
func TestBeMatMoi_ChiCoTongThiKhongDuDeVe(t *testing.T) {
	root := t.TempDir()
	st := newBook(t, root, "sach", func(st *store.Store) {
		if err := st.Usage.Save(domain.UsageState{
			Overall: domain.AgentUsageTotals{Input: 100, Cost: 9.99},
		}); err != nil {
			t.Fatal(err)
		}
	})

	snap, err := buildSnapshot(st, "sach", 0)
	if err != nil {
		t.Fatal(err)
	}
	if snap.Capabilities.CostBreakdown {
		t.Error("chỉ có tổng mà cost_breakdown = true → bề mặt sẽ vẽ một bảng rỗng")
	}
}

// Một usage.json hỏng KHÔNG được làm sập bề mặt studio: dòng sản xuất không phụ
// thuộc nguồn này, và 500 ở /studio là mất cả trang vì một cột.
func TestBeMatMoi_NguonHongKhongLamSapStudio(t *testing.T) {
	root := t.TempDir()
	st := newBook(t, root, "sach", nil)
	ghiTho(t, st, "meta/usage.json", `{"schema":`)
	s := &server{root: root}

	rec := do(t, s, "GET", "/api/books/sach/studio")
	if rec.Code != http.StatusOK {
		t.Fatalf("usage.json hỏng làm sập /studio (mã %d): %s", rec.Code, rec.Body.String())
	}
	var snap Snapshot
	if err := json.Unmarshal(rec.Body.Bytes(), &snap); err != nil {
		t.Fatal(err)
	}
	if snap.Capabilities.CostBreakdown {
		t.Error("nguồn hỏng mà cờ báo true")
	}
	// Còn endpoint chi phí thì phải nói thẳng là lỗi, không im lặng trả rỗng.
	if rec := do(t, s, "GET", "/api/books/sach/cost"); rec.Code != http.StatusInternalServerError {
		t.Errorf("/cost với tệp hỏng trả %d, muốn 500", rec.Code)
	}
}

// demoUsageNho là bản usage nhỏ nhất còn đủ để cờ cost_breakdown bật: một mục
// per_agent và một mục per_model. Các ca chi phí chi tiết nằm ở cost_test.go.
func demoUsageNho() domain.UsageState {
	return domain.UsageState{
		Overall: domain.AgentUsageTotals{Input: 100, Output: 50, Cost: 1.5},
		PerAgent: map[string]domain.AgentUsageTotals{
			"writer": {Input: 100, Output: 50, Cost: 1.5, CacheCapable: true},
		},
		PerModel: map[string]domain.AgentUsageTotals{
			"gemini-2.5-pro": {Input: 100, Output: 50, Cost: 1.5, CacheCapable: true},
		},
	}
}
