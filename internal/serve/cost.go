package serve

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/huuhoa143/ainovel-studio/internal/domain"
	"github.com/huuhoa143/ainovel-studio/internal/store"
)

// usageRel là đường dẫn tương đối của tệp usage trong store, phải khớp
// internal/store/usage.go. Cần biết tên tệp ở đây vì UsageStore.Load() không nói
// được "tệp có mà schema lệch" — xem buildCost.
const usageRel = "meta/usage.json"

// buildCost dựng bề mặt Chi phí từ meta/usage.json.
//
// # Bốn trạng thái, không phải hai
//
// UsageStore.Load() trả (nil, nil) cho HAI ca khác nhau: tệp không tồn tại, VÀ
// tệp tồn tại nhưng Schema != domain.UsageSchemaVersion (internal/store/usage.go:25
// — bản schema lệch bị bỏ qua có chủ đích để engine tự dựng lại bằng session
// replay). Chỉ gọi Load thì hai ca đó đọc ra y hệt nhau, và một tác phẩm có số
// liệu cũ sẽ bị bề mặt báo là "chưa chạy gì" — sai, và sai theo hướng làm người
// vận hành tưởng mình chưa tốn tiền.
//
// Nên phải stat tệp để tách chúng:
//
//	no_file      → không có tệp: chưa chạy gì. Trạng thái BÌNH THƯỜNG của sách
//	               mới, không phải lỗi, nên 200.
//	stale_schema → có tệp mà Load bỏ qua: có số liệu nhưng bản này không đọc
//	               được. Cũng 200 — bề mặt nói "số liệu thuộc bản cũ" thay vì
//	               nói dối là chưa có.
//	empty        → Load ra state mà chưa mục nào: đã chạy, chưa có số.
//	ready        → có số liệu.
//
// Lỗi đọc thật (JSON hỏng, không đủ quyền) trả error → 500: nguồn duy nhất của
// bề mặt này đã hỏng nên không còn gì để hiện, khác hẳn bề mặt Văn phong vốn có
// nguồn thứ hai để ngã về.
func buildCost(st *store.Store) (*CostDoc, error) {
	usage, err := st.Usage.Load()
	if err != nil {
		return nil, fmt.Errorf("đọc %s: %w", usageRel, err)
	}

	if usage == nil {
		// Load trả nil cho cả "thiếu tệp" lẫn "schema lệch" — stat để tách.
		coTep, err := tepUsageTonTai(st)
		if err != nil {
			return nil, err
		}
		state := ChiPhiChuaCoTep
		if coTep {
			state = ChiPhiLechSchema
		}
		// PerAgent/PerModel để nil → `null`: theo quy ước của /outline, /cast,
		// /world, null nghĩa là tệp chưa từng được ghi (hoặc không đọc được ở bản
		// này), khác với `{}` nghĩa là đã ghi mà rỗng.
		return &CostDoc{State: state}, nil
	}

	doc := &CostDoc{
		State:                 ChiPhiSanSang,
		UpdatedAt:             thoiDiem(usage.UpdatedAt),
		Overall:               usageTotalsFrom(usage.Overall),
		PerAgent:              usageMapFrom(usage.PerAgent),
		PerModel:              usageMapFrom(usage.PerModel),
		MissingAssistantUsage: usage.MissingUsage,
	}
	if len(doc.PerAgent) == 0 && len(doc.PerModel) == 0 {
		doc.State = ChiPhiRong
	}
	return doc, nil
}

// tepUsageTonTai kiểm meta/usage.json có trên đĩa hay không.
//
// Đi qua store.Dir() chứ không tự ghép đường dẫn từ id URL: bookDir đã kiểm tên
// và đường dẫn ở đây là kết quả ĐÃ giải quyết của nó, nên không có lối nào cho
// dữ liệu URL chen vào lần nữa.
func tepUsageTonTai(st *store.Store) (bool, error) {
	_, err := os.Stat(filepath.Join(st.Dir(), filepath.FromSlash(usageRel)))
	switch {
	case err == nil:
		return true, nil
	case os.IsNotExist(err):
		return false, nil
	default:
		// Không đoán: không stat được là chuyện khác với không có tệp.
		return false, fmt.Errorf("kiểm %s: %w", usageRel, err)
	}
}

// usageMapFrom chuyển map cộng dồn của store sang hình hợp đồng.
//
// Trả nil khi vào nil để giữ quy ước null≠{}: map nil ra `null` (chưa từng ghi),
// map rỗng khác nil ra `{}` (đã ghi mà rỗng).
func usageMapFrom(in map[string]domain.AgentUsageTotals) map[string]UsageTotals {
	if in == nil {
		return nil
	}
	out := make(map[string]UsageTotals, len(in))
	for name, t := range in {
		out[name] = usageTotalsFrom(t)
	}
	return out
}

func usageTotalsFrom(t domain.AgentUsageTotals) UsageTotals {
	return UsageTotals{
		Input:        t.Input,
		Output:       t.Output,
		CacheRead:    t.CacheRead,
		CacheWrite:   t.CacheWrite,
		CostUSD:      t.Cost,
		SavedUSD:     t.Saved,
		CacheCapable: t.CacheCapable,
		CacheBreaks:  t.CacheBreaks,
	}
}

// thoiDiem in mốc thời gian theo RFC3339 UTC, và trả rỗng cho mốc zero.
//
// Cần thiết vì time.Time zero marshal thành "0001-01-01T00:00:00Z" — một mốc
// TRÔNG như dữ liệu thật, và giao diện sẽ hiện "cập nhật lúc năm 1". Rỗng nói
// đúng điều đang xảy ra: chưa có mốc nào.
func thoiDiem(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.UTC().Format(time.RFC3339)
}

// coChiPhiChiTiet cho biết bề mặt Chi phí có phần chia nhỏ để vẽ hay không.
//
// Suy từ chính doc mà endpoint trả (xem coVanPhong về lý do). Chỉ tính PerAgent /
// PerModel: giá trị của bề mặt này là phần chia nhỏ, còn tổng thì thanh dưới đã
// có — một usage.json chỉ có Overall mà không có mục nào không đủ để vẽ.
func coChiPhiChiTiet(doc *CostDoc) bool {
	return doc != nil && (len(doc.PerAgent) > 0 || len(doc.PerModel) > 0)
}

func (s *server) handleCost(w http.ResponseWriter, r *http.Request) {
	st, err := s.openBook(r.PathValue("book"))
	if err != nil {
		writeErr(w, http.StatusNotFound, err)
		return
	}
	doc, err := buildCost(st)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, doc)
}
