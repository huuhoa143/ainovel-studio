package serve

import (
	"fmt"
	"net/http"

	"github.com/huuhoa143/ainovel-studio/internal/store"
)

// buildSettings dựng bề mặt Cài đặt từ meta/run.json.
//
// # Vì sao chỉ đọc
//
// SettingsDoc.Writable là false, nhưng LÝ DO đã đổi — và lý do cũ giờ sai.
//
// Bản trước nói: engine sở hữu quyền ghi tệp này, gọi RunMetaStore từ đây là hai tiến
// trình cùng sửa một chỗ và ý kiến can thiệp sẽ mất trắng. Tiền đề đó không còn: engine
// chạy TRONG process này (xem internal/serve/engine.go), nên studio là người ghi duy
// nhất, và các hàm ghi ĐƯỢC gọi thật — qua Host, không qua RunMetaStore trực tiếp.
//
// Writable vẫn false vì một lý do khác hẳn, và lý do mới thuộc về sản phẩm chứ không
// phải kỹ thuật: những gì bề mặt này hiện là bản ghi tác phẩm ĐÃ KHỞI ĐỘNG với cấu hình
// gì. Đó là quá khứ. Không có phép sửa nào áp lên nó cho có nghĩa — muốn đổi thì sửa
// cấu hình máy rồi đóng và mở lại engine của tác phẩm.
//
// Những thứ ĐỔI ĐƯỢC lúc chạy không nằm trong tệp này: model theo vai đi qua
// Host.SwitchModel (bề mặt KenhVai), chế độ đi tiếp và cấp phép chương đi qua
// Host.SetAdvanceMode/AdvanceOneChapter.
//
// # Hai trạng thái
//
//	no_file → chưa có meta/run.json: chưa chạy engine lần nào cho tác phẩm này.
//	          BÌNH THƯỜNG, không phải lỗi → 200. Cần State vì đây là object,
//	          không có `null` của mảng để dựa vào.
//	ready   → có tệp.
//
// Lỗi đọc thật → error → 500: nguồn duy nhất đã hỏng, không còn gì để hiện.
func buildSettings(st *store.Store) (*SettingsDoc, error) {
	meta, err := st.RunMeta.Load()
	if err != nil {
		return nil, fmt.Errorf("đọc meta/run.json: %w", err)
	}
	if meta == nil {
		return &SettingsDoc{State: CaiDatChuaCoTep, Writable: false}, nil
	}

	doc := &SettingsDoc{
		State:                CaiDatSanSang,
		Writable:             false,
		StartedAt:            meta.StartedAt,
		Provider:             meta.Provider,
		Model:                meta.Model,
		Style:                meta.Style,
		PlanningTier:         string(meta.PlanningTier),
		AdvanceMode:          string(meta.AdvanceMode),
		AdvancePermitChapter: meta.AdvancePermitChapter,
		PendingSteer:         meta.PendingSteer,
		StartPrompt:          meta.StartPrompt,
	}
	if h := meta.AdvanceHold; h != nil {
		doc.AdvanceHold = &AdvanceHold{After: string(h.After), Reason: h.Reason}
	}
	// RawPrompt bị lược có chủ đích: nó lặp lại StartPrompt gần như nguyên văn
	// (RunMetaStore.SetStartPrompt và SetPlanStart nhận cùng một chuỗi từ Host),
	// và một trường lặp là một trường sẽ lệch.
	if p := meta.PlanStart; p != nil {
		doc.PlanStart = &PlanStart{
			Planner:     p.Planner,
			PlannerTask: p.PlannerTask,
			DecisionID:  p.DecisionID,
		}
	}
	return doc, nil
}

// coCaiDat cho biết bề mặt Cài đặt có dữ liệu để vẽ hay không.
//
// Suy từ chính doc mà endpoint trả (xem coVanPhong về lý do).
//
// # Vì sao KHÔNG lấy `State == ready` làm điều kiện
//
// Vì một meta/run.json rỗng là ca ĐẾN ĐƯỢC, không phải ca giả định. Bốn hàm ghi
// của RunMetaStore — SetPlanningTier, SetStartPrompt, SetPendingSteer, SetPlanStart
// — đều làm `if meta == nil { meta = &domain.RunMeta{} }` rồi lưu, tức chúng TẠO
// tệp khi chưa có. Chỉ Init mới đặt StartedAt/Provider/Style/Model, và nó không
// phải điều kiện tiên quyết của bốn hàm kia ở tầng store (ở luồng engine hiện tại
// Init chạy trước — host.go:106 — nhưng đó là thứ tự của Host, không phải bất biến
// của store, và bề mặt này đọc store chứ không đọc Host).
//
// Một run.json như thế đọc ra `ready` với mọi trường trắng, và Rail sẽ mở một bề
// mặt cấu hình không có dòng nào. Nhãn "chưa dựng" trung thực hơn thứ đó.
//
// Điều kiện là "có ít nhất MỘT sự kiện", không phải "có đủ cấu hình": một tệp chỉ
// mang pending_steer vẫn đáng vẽ — chỉ thị can thiệp chưa xử lý là thứ duy nhất
// trên bề mặt này đang chờ engine hành động, nên ẩn nó đi là ẩn đúng phần cần nhất.
func coCaiDat(doc *SettingsDoc) bool {
	if doc == nil || doc.State != CaiDatSanSang {
		return false
	}
	return doc.StartedAt != "" || doc.Provider != "" || doc.Model != "" ||
		doc.Style != "" || doc.PlanningTier != "" || doc.AdvanceMode != "" ||
		doc.AdvancePermitChapter != 0 || doc.PendingSteer != "" ||
		doc.StartPrompt != "" || doc.AdvanceHold != nil || doc.PlanStart != nil
}

func (s *server) handleSettings(w http.ResponseWriter, r *http.Request) {
	st, err := s.openBook(r.PathValue("book"))
	if err != nil {
		writeErr(w, http.StatusNotFound, err)
		return
	}
	doc, err := buildSettings(st)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, doc)
}
