package serve

import (
	"fmt"
	"net/http"

	"github.com/huuhoa143/ainovel-studio/internal/rules"
	"github.com/huuhoa143/ainovel-studio/internal/store"
)

// buildStyle dựng bề mặt Văn phong từ hai nguồn độc lập trong store.
//
// # Ba trạng thái, và vì sao thiếu tệp KHÔNG phải lỗi
//
// Tác phẩm mới chưa qua biên cung nào thì meta/style_rules.json chưa tồn tại, và
// tác phẩm chưa mở qua Host thì meta/user_rules.json cũng vậy. Đó là trạng thái
// BÌNH THƯỜNG của một cuốn vừa bắt đầu — trả 500 cho nó là biến ca người dùng
// gặp ĐẦU TIÊN thành một lỗi.
//
// Nên ba ca được phân biệt thế này:
//   - thiếu tệp  → khối tương ứng là nil → JSON `null`, HTTP 200
//   - tệp có mà rỗng → khối có mặt, các mảng trong nó là `[]`, HTTP 200
//   - lỗi đọc thật (JSON hỏng, không đủ quyền) → tên nguồn vào Warnings
//
// Lỗi đọc trả kèm 200 khi nguồn CÒN LẠI vẫn đọc được: một tệp hỏng không đáng
// làm trắng cả bề mặt. Chỉ khi CẢ HAI nguồn đều lỗi thì mới không còn gì để hiện,
// và lúc đó buildStyle trả error để handler dựng 500.
func buildStyle(st *store.Store) (*StyleDoc, error) {
	doc := &StyleDoc{}
	var loiArc, loiUser error

	if r, err := st.World.LoadStyleRules(); err != nil {
		loiArc = err
		doc.Warnings = append(doc.Warnings,
			fmt.Sprintf("đọc meta/style_rules.json thất bại: %v", err))
	} else if r != nil {
		doc.Arc = &ArcStyle{
			Volume:    r.Volume,
			Arc:       r.Arc,
			Prose:     r.Prose,
			Taboos:    r.Taboos,
			UpdatedAt: r.UpdatedAt,
		}
		// Không dùng thẳng domain.CharacterVoice: hợp đồng JSON phải đứng độc lập
		// với hình của engine, và ánh xạ tay ở đây là chỗ duy nhất phải sửa nếu
		// engine đổi tên trường.
		if r.Dialogue != nil {
			doc.Arc.Dialogue = make([]CharacterVoice, 0, len(r.Dialogue))
			for _, v := range r.Dialogue {
				doc.Arc.Dialogue = append(doc.Arc.Dialogue,
					CharacterVoice{Name: v.Name, Rules: v.Rules})
			}
		}
	}

	if snap, err := st.UserRules.Load(); err != nil {
		loiUser = err
		doc.Warnings = append(doc.Warnings,
			fmt.Sprintf("đọc meta/user_rules.json thất bại: %v", err))
	} else if snap != nil {
		doc.User = userStyleFrom(snap)
	}

	if loiArc != nil && loiUser != nil {
		return nil, fmt.Errorf("cả hai nguồn văn phong đều không đọc được: %v; %v", loiArc, loiUser)
	}
	return doc, nil
}

func userStyleFrom(snap *rules.Snapshot) *UserStyle {
	return &UserStyle{
		Status:           string(snap.Status),
		Genre:            snap.Structured.Genre,
		ForbiddenPhrases: snap.Structured.ForbiddenPhrases,
		ForbiddenChars:   snap.Structured.ForbiddenChars,
		FatigueWords:     snap.Structured.FatigueWords,
		Preferences:      snap.Preferences,
		DeclaredBy:       snap.Sources,
		Uncertain:        snap.Uncertain,
	}
}

// coVanPhong cho biết bề mặt Văn phong có dữ liệu để vẽ hay không.
//
// Suy từ CHÍNH doc mà endpoint trả, không từ một phép kiểm riêng — hai đường suy
// luận song song về cùng dữ liệu sẽ có lúc lệch, và khi lệch thì Rail gắn nhãn
// "chưa dựng" cho một bề mặt vẫn còn đủ dữ liệu (đúng lỗi LayeredOutline đã mắc).
//
// "Có dữ liệu" nghĩa là có ít nhất một luật thật, không phải "tệp tồn tại":
// user_rules.json luôn tồn tại sau khi mở sách, nhưng một bản chỉ có
// system_defaults mà người dùng không khai gì thì vẫn đáng vẽ — nó chứa bảng từ
// gây mỏi thật mà Editor đang dùng để chấm. Nên chỉ cần bất kỳ mục nào khác rỗng.
func coVanPhong(doc *StyleDoc) bool {
	if doc == nil {
		return false
	}
	if a := doc.Arc; a != nil {
		if len(a.Prose) > 0 || len(a.Dialogue) > 0 || len(a.Taboos) > 0 {
			return true
		}
	}
	if u := doc.User; u != nil {
		if u.Genre != "" || u.Preferences != "" ||
			len(u.ForbiddenPhrases) > 0 || len(u.ForbiddenChars) > 0 ||
			len(u.FatigueWords) > 0 {
			return true
		}
	}
	return false
}

func (s *server) handleStyle(w http.ResponseWriter, r *http.Request) {
	st, err := s.openBook(r.PathValue("book"))
	if err != nil {
		writeErr(w, http.StatusNotFound, err)
		return
	}
	doc, err := buildStyle(st)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, doc)
}
