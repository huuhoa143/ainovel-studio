package serve

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/huuhoa143/ainovel-studio/internal/errs"
	"github.com/huuhoa143/ainovel-studio/internal/host"
)

// Cùng dựng — đối thoại nhiều lượt trước khi engine bắt đầu, hoặc giữa hai giai đoạn.
//
// Hai chế độ, dùng chung một hình dạng đối thoại:
//
//   - MỞ SÁCH: `/cocreate` — làm rõ yêu cầu trước khi tạo tác phẩm. Bản web của việc gõ
//     Tab ở màn chào TUI rồi nhập.
//   - GIỮA GIAI ĐOẠN: `/stage-cocreate` — tạm dừng dây chuyền, cùng quy hoạch chặng tiếp,
//     rồi chạy lại. Bản web của lệnh `/cocreate` trong TUI.
//
// # Vì sao KHÔNG stream từng chữ ở bản này
//
// `Host.CoCreateStream` nhận một callback `onProgress(kind, text)` để hiện chữ chảy dần,
// và nó CHẶN tới khi có câu trả lời đầy đủ. Tức bản không-stream vẫn đúng chức năng: nó chỉ
// hiện muộn hơn.
//
// Stream đòi một kênh SSE thứ hai với vòng đời riêng (mở khi gõ, đóng khi xong, kết nối lại
// khi tải trang) và phải hòa với kênh sự kiện đang có. Đó là việc thật, nhưng nó mua sự
// mượt chứ không mua tính năng — nên nó vào việc tồn, có ghi ra, thay vì làm nửa vời.
//
// # Vì sao lịch sử do CLIENT giữ
//
// `CoCreateStream` là hàm thuần theo nghĩa này: nó nhận toàn bộ `history` mỗi lượt và không
// giữ trạng thái phiên nào. Nên server không cần giữ gì cả, và một lượt tải lại trang không
// làm mất phiên — trình duyệt gửi lại lịch sử nó đang có. Giữ phiên ở server sẽ tạo ra một
// trạng thái thứ hai cần dọn, và một cuộc đối thoại mồ côi cho mỗi tab bị đóng.

// thanCungDung là thân của cả hai route.
type thanCungDung struct {
	// LichSu là toàn bộ đối thoại tới lúc này, kể cả lượt người dùng vừa gõ.
	LichSu []struct {
		Vai string `json:"role"` // "user" | "assistant"
		Chu string `json:"text"`
	} `json:"history"`
}

func (t thanCungDung) sangHost() ([]host.CoCreateMessage, error) {
	if len(t.LichSu) == 0 {
		return nil, errors.New("lịch sử đối thoại rỗng")
	}
	out := make([]host.CoCreateMessage, 0, len(t.LichSu))
	for i, m := range t.LichSu {
		vai := strings.TrimSpace(m.Vai)
		if vai != "user" && vai != "assistant" {
			return nil, fmt.Errorf("lượt %d có vai %q không hợp lệ; chỉ nhận user hoặc assistant", i, m.Vai)
		}
		if strings.TrimSpace(m.Chu) == "" {
			return nil, fmt.Errorf("lượt %d rỗng", i)
		}
		out = append(out, host.CoCreateMessage{Role: vai, Content: m.Chu})
	}
	// Lượt cuối phải là của NGƯỜI DÙNG: mô hình được gọi để trả lời một câu, và gọi nó khi
	// lượt cuối là của chính nó sẽ cho ra một lượt nói tiếp vô cớ — tốn tiền, không thêm
	// thông tin nào.
	if out[len(out)-1].Role != "user" {
		return nil, errors.New("lượt cuối phải là của người dùng")
	}
	return out, nil
}

// dapCungDung là phản hồi chung của cả hai route.
//
// # Ba trường ở đây tồn tại vì phiên cùng dựng của TUI cũ đã cho thấy vì sao
//
// Bản đầu chỉ trả `message`/`draft`/`ready`, và nó SAI ở ba chỗ mà `ApplyReply` của phiên cùng
// dựng TUI (đã gỡ cùng TUI) từng ghi rõ:
//
//  1. Lượt assistant ghi vào lịch sử phải là `Raw` (bản đầy đủ có `[DRAFT]`), không phải
//     `Message`. Chỉ ghi `Message` thì lượt sau mô hình KHÔNG thấy bản nháp của chính nó,
//     nên nó phải quy nạp lại từ đối thoại mỗi lượt và chi tiết đầu dễ rơi.
//  2. `draft` rỗng nghĩa là GIỮ bản nháp cũ, không phải xóa. Đường phân tích suy giảm trả
//     `Prompt: ""`, và ghi đè bằng nó sẽ cắt trắng bản yêu cầu người dùng đã tích lũy.
//  3. `Suggestions` là gợi ý "tiếp theo bạn có thể muốn nói" — có ích đúng lúc người dùng
//     bí, và bỏ nó đi là bỏ một cơ chế đã có sẵn.
type dapCungDung struct {
	// LoiNhan là câu mô hình nói với người dùng — phần hiện lên đối thoại.
	LoiNhan string `json:"message"`
	// Tho là bản đầy đủ để client ghi lại vào lịch sử. Rỗng thì dùng LoiNhan (đường suy
	// giảm cho Raw == Message).
	Tho string `json:"raw,omitempty"`
	// BanNhap là bản yêu cầu đã chưng ra. RỖNG = giữ bản cũ, KHÔNG phải xóa.
	BanNhap string `json:"draft,omitempty"`
	// SanSang = đủ thông tin để bắt đầu. Đến từ mô hình, không được suy từ việc `draft` có
	// rỗng hay không: một lượt suy giảm có `draft` rỗng mà vẫn `ready`.
	SanSang bool `json:"ready"`
	// GoiY ghi đè hoàn toàn mỗi lượt, kể cả ghi đè thành rỗng — gợi ý chỉ có nghĩa cho
	// đúng lượt hiện tại.
	GoiY []string `json:"suggestions,omitempty"`
}

func dapTu(r host.CoCreateReply) dapCungDung {
	return dapCungDung{
		LoiNhan: r.Message,
		Tho:     r.Raw,
		BanNhap: r.Prompt,
		SanSang: r.Ready,
		GoiY:    r.Suggestions,
	}
}

// handleCungDungMoSach — POST /api/cocreate
//
// Không thuộc tác phẩm nào: đây là lúc CHƯA có tác phẩm — kể cả xưởng còn trống ở lần mở app
// đầu tiên. Nên nó không đi qua engine hay khóa truyện nào: chỉ đọc tệp cấu hình rồi gọi mô
// hình (`host.CoCreateStream`). Bản trước mượn engine đang mở của một cuốn KHÁC, nên xưởng
// trống thì nút "Bàn ý tưởng với AI trước" luôn trả 409.
func (s *server) handleCungDungMoSach(w http.ResponseWriter, r *http.Request) {
	var than thanCungDung
	if err := docThan(r, &than); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	ls, err := than.sangHost()
	if err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	cfg, err := s.may.napCauHinh()
	if err != nil {
		writeErr(w, http.StatusBadRequest, fmt.Errorf("đọc cấu hình: %w", err))
		return
	}
	rep, err := host.CoCreateStream(r.Context(), cfg, ls, nil)
	if errors.Is(err, errs.ErrConfig) {
		writeErr(w, http.StatusBadRequest, fmt.Errorf("cấu hình chưa dùng được: %w", err))
		return
	}
	if err != nil {
		writeErr(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, dapTu(rep))
}

// handleCungDungGiaiDoan — POST /api/books/{book}/stage-cocreate
//
// Tạm dừng dây chuyền rồi cùng quy hoạch chặng tiếp. `apply` gửi bản nháp đã chốt để engine
// chạy lại theo nó.
func (s *server) handleCungDungGiaiDoan(w http.ResponseWriter, r *http.Request) {
	var than struct {
		thanCungDung
		// ApDung khác rỗng = chốt bản nháp này và chạy lại. Tách khỏi lượt hỏi đáp vì hai
		// việc có hệ quả rất khác: hỏi đáp chỉ tốn một lượt gọi, còn áp dụng thì khởi động
		// lại cả dây chuyền.
		ApDung string `json:"apply,omitempty"`
	}
	if err := docThan(r, &than); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	p, err := s.may.dangMo(r.PathValue("book"))
	if err != nil {
		writeErr(w, maLoi(err), err)
		return
	}

	if s := strings.TrimSpace(than.ApDung); s != "" {
		if err := p.eng.ResumeFromCoCreate(s); err != nil {
			writeErr(w, http.StatusBadRequest, err)
			return
		}
		p.chayTu = mocBayGio()
		writeJSON(w, map[string]any{"applied": true})
		return
	}

	// Lượt ĐẦU phải tạm dừng dây chuyền trước khi hỏi: cùng dựng giai đoạn có nghĩa là bàn
	// về chặng TIẾP, nên để engine viết tiếp trong lúc bàn là bàn về một quá khứ đang trôi.
	// `PauseForCoCreate` trả false khi sách đã xong hoặc đã đang cùng dựng — cả hai đều
	// KHÔNG phải lỗi ở lượt thứ hai trở đi.
	if len(than.LichSu) == 1 && !p.eng.PauseForCoCreate() {
		writeErr(w, http.StatusConflict, errors.New(
			"không vào được cùng dựng giai đoạn: toàn bộ tác phẩm đã hoàn thành, hoặc đang trong một phiên cùng dựng khác"))
		return
	}

	ls, err := than.sangHost()
	if err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	rep, err := p.eng.StageCoCreateStream(r.Context(), ls, nil)
	if err != nil {
		writeErr(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, dapTu(rep))
}

// handleHuyCungDungGiaiDoan — POST /api/books/{book}/stage-cocreate/cancel
//
// Bỏ dở cùng dựng giai đoạn. Lượt đầu của cùng dựng giai đoạn tạm dừng dây chuyền và giữ cờ
// "đang cùng dựng", cờ đó chặn chạy tiếp / nhập / mô phỏng. Không có đường hủy thì người dùng
// đóng hộp thoại giữa chừng là cuốn sách kẹt tới khi đóng phiên. Truyện vẫn ở trạng thái tạm
// dừng sau khi hủy — bấm chạy tiếp như thường.
//
// Bất biến (idempotent): không có gì để hủy — engine chưa mở, hoặc không đang cùng dựng — vẫn
// trả 200 với `cancelled: false`, vì kết quả người dùng muốn ("không còn cùng dựng") đã đúng.
func (s *server) handleHuyCungDungGiaiDoan(w http.ResponseWriter, r *http.Request) {
	p, err := s.may.dangMo(r.PathValue("book"))
	if err != nil { // chỉ có một lỗi: engine chưa mở — tức không có gì đang cùng dựng
		writeJSON(w, map[string]any{"cancelled": false})
		return
	}
	writeJSON(w, map[string]any{"cancelled": p.eng.CancelCoCreate()})
}
