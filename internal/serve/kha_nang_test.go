package serve

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/huuhoa143/ainovel-studio/internal/domain"
	"github.com/huuhoa143/ainovel-studio/internal/rules"
	"github.com/huuhoa143/ainovel-studio/internal/store"
)

// Bài kiểm cho ba cờ StyleRules / CostBreakdown / RunSettings ở Capabilities.
//
// # Vì sao cần một bài kiểm riêng cho ba cờ này
//
// Vì lỗi đã xảy ra thật một lần với cờ thứ tư. LayeredOutline từng suy từ
// progress.Layered — một đường riêng do engine đặt — và đo được trên dữ liệu thật:
// payload có 2 tập, 2 cung, mà capability báo false, nên giao diện ẩn hai lane
// vẫn còn đủ dữ liệu để vẽ. Hai đường suy luận song song về cùng một dữ liệu sẽ có
// lúc lệch, và khi lệch thì hướng sai luôn là ẩn mất thứ đang có.
//
// Nên phép canh không phải "cờ có đúng giá trị mong đợi" mà là "cờ KHÔNG LỆCH với
// thứ endpoint thật sự trả". Bài kiểm đọc chính payload HTTP mà trình duyệt nhận,
// tự quyết định "có gì để vẽ hay không" bằng phép kiểm riêng của nó (xem
// coDuLieuTrongPayload…), rồi so với cờ. Cố ý KHÔNG gọi coVanPhong /
// coChiPhiChiTiet / coCaiDat: gọi chúng thì bài kiểm chỉ nhắc lại hiện thực, còn
// đọc payload thì nó kiểm được đúng điều web dựa vào.
func TestKhaNang_BaCoKhongLechVoiEndpoint(t *testing.T) {
	root := t.TempDir()

	dung := func(id string, fn func(*store.Store)) { newBook(t, root, id, fn) }

	// ── các trạng thái store đáng phân biệt ──

	dung("trong", nil)

	dung("du-ca-ba-nguon", func(st *store.Store) {
		must := func(err error) {
			t.Helper()
			if err != nil {
				t.Fatal(err)
			}
		}
		must(st.World.SaveStyleRules(domain.WritingStyleRules{
			Volume: 1, Arc: 2,
			Prose:     []string{"Tả cảnh bằng chi tiết nghề gác cầu, không bằng tính từ"},
			Taboos:    []string{"Không dùng \"bỗng nhiên\" mở đoạn"},
			UpdatedAt: "2026-07-31T09:00:00Z",
		}))
		must(st.UserRules.Save(&rules.Snapshot{
			Status:     rules.StatusReady,
			Structured: rules.Structured{Genre: "tiên hiệp điều tra"},
			Sources:    []string{"startup_prompt"},
		}))
		must(st.Usage.Save(domain.UsageState{
			Overall:  domain.AgentUsageTotals{Input: 512_800, Cost: 6.5},
			PerAgent: map[string]domain.AgentUsageTotals{"writer": {Input: 400_000, Cost: 5.0}},
		}))
		must(st.RunMeta.Init("tien_hiep", "google", "gemini-2.5-pro"))
	})

	// Chỉ có bảng từ gây mỏi từ system_defaults, người dùng không khai gì. Vẫn
	// đáng vẽ: đó là luật thật mà Editor đang dùng để chấm.
	dung("chi-tu-gay-moi", func(st *store.Store) {
		if err := st.UserRules.Save(&rules.Snapshot{
			Status:     rules.StatusReady,
			Structured: rules.Structured{FatigueWords: map[string]int{"bỗng nhiên": 2}},
			Sources:    []string{"system_defaults"},
		}); err != nil {
			t.Fatal(err)
		}
	})

	// user_rules.json tồn tại mà KHÔNG có luật nào: tệp có, nội dung trắng.
	dung("user-rules-trang", func(st *store.Store) {
		if err := st.UserRules.Save(&rules.Snapshot{Status: rules.StatusReady}); err != nil {
			t.Fatal(err)
		}
	})

	// usage.json đã ghi mà chưa cộng được mục nào: có tổng, không có phần chia nhỏ.
	// Bề mặt Chi phí sống bằng phần chia nhỏ, nên đây là "không có gì để vẽ".
	dung("usage-chua-muc-nao", func(st *store.Store) {
		if err := st.Usage.Save(domain.UsageState{
			Overall:  domain.AgentUsageTotals{Input: 1_000, Cost: 0.01},
			PerAgent: map[string]domain.AgentUsageTotals{},
			PerModel: map[string]domain.AgentUsageTotals{},
		}); err != nil {
			t.Fatal(err)
		}
	})

	// run.json rỗng: ca đến được qua SetPlanningTier/SetStartPrompt/SetPendingSteer/
	// SetPlanStart, vốn tạo tệp từ nil mà không đi qua Init. Đọc ra `ready` với mọi
	// trường trắng — nếu cờ chỉ xét state thì Rail mở một bề mặt không có dòng nào.
	stRunTrong := newBook(t, root, "run-json-trong", nil)
	ghiTho(t, stRunTrong, "meta/run.json", `{}`)

	// run.json chỉ mang chỉ thị can thiệp: KHÔNG có cấu hình nào, nhưng vẫn đáng
	// vẽ — đó là thứ duy nhất trên bề mặt này đang chờ engine hành động.
	stChiSteer := newBook(t, root, "run-chi-steer", nil)
	ghiTho(t, stChiSteer, "meta/run.json", `{"pending_steer": "Đừng để Diệp Tiểu Yến lộ chuyện ở cung này"}`)

	s := &server{root: root}
	for _, id := range []string{
		"trong", "du-ca-ba-nguon", "chi-tu-gay-moi", "user-rules-trang",
		"usage-chua-muc-nao", "run-json-trong", "run-chi-steer",
	} {
		t.Run(id, func(t *testing.T) {
			kn := khaNangCua(t, s, id)

			for _, ca := range []struct {
				ten    string
				duong  string
				co     bool
				oracle func(map[string]any) bool
			}{
				{"style_rules", "style", kn.StyleRules, coDuLieuVanPhong},
				{"cost_breakdown", "cost", kn.CostBreakdown, coDuLieuChiPhi},
				{"run_settings", "settings", kn.RunSettings, coDuLieuCaiDat},
			} {
				payload := payloadCua(t, s, id, ca.duong)
				muon := ca.oracle(payload)
				if ca.co != muon {
					t.Errorf("cờ %s = %v nhưng /%s trả %v dữ liệu để vẽ\n"+
						"cờ lệch với endpoint: hướng sai của nó là %s\npayload: %v",
						ca.ten, ca.co, ca.duong, muon,
						huongSai(ca.co), payload)
				}
			}
		})
	}
}

func huongSai(co bool) string {
	if co {
		return "vẽ một bề mặt rỗng"
	}
	return "ẩn một bề mặt vẫn còn đủ dữ liệu"
}

func khaNangCua(t *testing.T, s *server, id string) Capabilities {
	t.Helper()
	rec := do(t, s, "GET", "/api/books/"+id+"/studio")
	if rec.Code != http.StatusOK {
		t.Fatalf("/studio %s: mã %d: %s", id, rec.Code, rec.Body.String())
	}
	var snap Snapshot
	if err := json.Unmarshal(rec.Body.Bytes(), &snap); err != nil {
		t.Fatal(err)
	}
	return snap.Capabilities
}

func payloadCua(t *testing.T, s *server, id, duong string) map[string]any {
	t.Helper()
	rec := do(t, s, "GET", "/api/books/"+id+"/"+duong)
	if rec.Code != http.StatusOK {
		t.Fatalf("/%s %s: mã %d: %s", duong, id, rec.Code, rec.Body.String())
	}
	var m map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &m); err != nil {
		t.Fatal(err)
	}
	return m
}

// ── phép kiểm riêng của bài kiểm, đọc payload như web đọc ──

func coDuLieuVanPhong(m map[string]any) bool {
	if arc, ok := m["arc_style"].(map[string]any); ok {
		for _, k := range []string{"prose", "dialogue", "taboos"} {
			if coPhanTu(arc[k]) {
				return true
			}
		}
	}
	if u, ok := m["user_rules"].(map[string]any); ok {
		for _, k := range []string{"genre", "preferences"} {
			if s, _ := u[k].(string); s != "" {
				return true
			}
		}
		for _, k := range []string{"forbidden_phrases", "forbidden_chars", "fatigue_words"} {
			if coPhanTu(u[k]) {
				return true
			}
		}
	}
	return false
}

func coDuLieuChiPhi(m map[string]any) bool {
	return coPhanTu(m["per_agent"]) || coPhanTu(m["per_model"])
}

// coDuLieuCaiDat: có ít nhất một sự kiện cấu hình. `state` và `writable` không
// tính — state là siêu dữ liệu về payload, còn writable là hằng số của bản này
// (luôn false), nên cả hai luôn có mặt và không nói gì về việc có dữ liệu.
func coDuLieuCaiDat(m map[string]any) bool {
	if s, _ := m["state"].(string); s != CaiDatSanSang {
		return false
	}
	for k, v := range m {
		if k == "state" || k == "writable" {
			continue
		}
		switch t := v.(type) {
		case nil:
		case string:
			if t != "" {
				return true
			}
		case float64:
			if t != 0 {
				return true
			}
		case bool:
			if t {
				return true
			}
		default:
			return true // object/array có mặt = một sự kiện thật
		}
	}
	return false
}

func coPhanTu(v any) bool {
	switch t := v.(type) {
	case []any:
		return len(t) > 0
	case map[string]any:
		return len(t) > 0
	}
	return false
}
