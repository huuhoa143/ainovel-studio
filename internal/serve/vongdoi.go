package serve

import (
	"fmt"
	"net/http"

	"github.com/huuhoa143/ainovel-studio/internal/domain"
)

// Vòng đời sáng tác: chế độ đi tiếp, cấp phép chương, mở lại sách đã hoàn thành.
//
// Ba việc này là bản web của `/review`, `/next` và `/reopen` trong TUI. Cả ba đều ủy
// quyền cho `Host` — không phải để cho gọn, mà vì `Host` là chỗ duy nhất giữ đúng thứ tự
// giữa ghi trạng thái và điều phối engine. Ví dụ `AdvanceOneChapter` không chỉ ghi giấy
// phép: nó còn đánh thức vòng chạy nếu engine đang đứng chờ. Tự ghi `RunMeta` rồi mong
// engine tự thấy là dựng lại một nửa cơ chế, và nửa còn lại sẽ lệch.

// handleDoiCheDoTien — PUT /api/books/{book}/advance-mode
//
// `auto` = tự chạy liên tục. `review` = dừng trước mỗi chương mới, chờ cấp phép.
//
// Nhận đúng hai giá trị và từ chối mọi thứ khác, thay vì rơi về `auto`. Rơi về mặc định ở
// đây là ca xấu nhất: người vận hành nghĩ mình đã bật nghiệm thu từng chương rồi đi ngủ,
// còn engine viết thẳng 60 chương. `domain.ChapterAdvanceMode.Valid()` đã có sẵn phép
// kiểm đó và `RunMeta.Init` cũng từ chối giá trị lạ chứ không đoán.
func (s *server) handleDoiCheDoTien(w http.ResponseWriter, r *http.Request) {
	var than struct {
		Mode string `json:"mode"`
	}
	if err := docThan(r, &than); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	mode := domain.ChapterAdvanceMode(than.Mode)
	if !mode.Valid() {
		writeErr(w, http.StatusBadRequest, fmt.Errorf(
			"chế độ đi tiếp %q không hợp lệ; chỉ nhận %q hoặc %q",
			than.Mode, domain.ChapterAdvanceAuto, domain.ChapterAdvanceReview))
		return
	}
	p, err := s.may.dangMo(r.PathValue("book"))
	if err != nil {
		writeErr(w, maLoi(err), err)
		return
	}
	if err := p.eng.SetAdvanceMode(mode); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	snap := p.eng.Snapshot()
	writeJSON(w, map[string]any{
		"mode":           snap.AdvanceMode,
		"permit_chapter": snap.AdvancePermitChapter,
		"has_hold":       snap.HasAdvanceHold,
	})
}

// handleChoDiTiep — POST /api/books/{book}/advance
//
// Cấp phép ĐÚNG MỘT chương. Đây là bản web của `/next`.
//
// Trả lại `permit_chapter` sau khi cấp: giao diện cần con số đó để nói "đã cho tới chương
// N" thay vì chỉ nói "xong". Ở chế độ review, con số này là câu trả lời cho "vì sao dây
// chuyền đứng yên", nên nó phải hiện ra được.
func (s *server) handleChoDiTiep(w http.ResponseWriter, r *http.Request) {
	p, err := s.may.dangMo(r.PathValue("book"))
	if err != nil {
		writeErr(w, maLoi(err), err)
		return
	}
	if err := p.eng.AdvanceOneChapter(); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	p.chayTu = mocBayGio()
	s.may.theoDoi(p)
	snap := p.eng.Snapshot()
	writeJSON(w, map[string]any{
		"permit_chapter": snap.AdvancePermitChapter,
		"running":        snap.IsRunning,
	})
}

// handleMoLai — POST /api/books/{book}/reopen
//
// Mở lại một cuốn ĐÃ hoàn thành để viết tiếp. Bản web của `/reopen [hướng]`.
//
// `direction` là câu người vận hành nói về hướng viết tiếp, và nó KHÔNG phải tham số kỹ
// thuật: `Host.Reopen` đưa nó qua Arbiter phán quyết rồi mới tự chạy tiếp. Cho phép rỗng
// vì mở lại không kèm định hướng là một ý định hợp lệ (viết tiếp theo dàn ý đang có).
func (s *server) handleMoLai(w http.ResponseWriter, r *http.Request) {
	var than struct {
		Direction string `json:"direction"`
	}
	if err := docThan(r, &than); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	p, err := s.may.mo(r.PathValue("book"))
	if err != nil {
		writeErr(w, maLoi(err), err)
		return
	}
	if err := p.eng.Reopen(than.Direction); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	// Reopen chỉ ĐẶT ý định; phải Resume mới thật sự chạy. TUI cũng làm đúng hai bước này
	// (`resumeBook` sau `Reopen` trong commands.go), và bỏ bước hai thì người dùng bấm
	// "mở lại" rồi thấy dây chuyền vẫn đứng — không lỗi, không giải thích.
	nhan, err := p.eng.Resume()
	if err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	p.chayTu = mocBayGio()
	s.may.theoDoi(p)
	writeJSON(w, map[string]any{"reopened": true, "resumed": nhan})
}
