package serve

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"

	"github.com/huuhoa143/ainovel-studio/internal/tools"
)

// Cầu nối `ask_user` — engine hỏi, trình duyệt trả lời.
//
// # Vì sao đây là luồng khó nhất của cả bản web
//
// `tools.AskUserHandler` là một hàm CHẶN: engine gọi nó rồi đứng chờ tới khi có câu trả
// lời. Mọi luồng khác trong studio là "gửi lệnh rồi xem kết quả"; luồng này ngược lại —
// engine chủ động hỏi, và nó không đi tiếp được cho tới khi người dùng trả lời.
//
// Đây cũng là lý do quyết định cho việc engine chạy in-process: handler là một hàm Go, nên
// cầu nối chỉ cần một channel. Nếu engine ở process con thì phải phát minh một giao thức
// IPC hai chiều cho đúng việc này, và nó sẽ là thứ duy nhất mới trong toàn bộ thiết kế.
//
// Hình dạng theo cầu nối của TUI cũ (hai channel request/result), khác ở chỗ bên đọc là
// HTTP nên câu hỏi phải đọc được nhiều lần (trình duyệt tải lại trang thì vẫn phải thấy câu
// hỏi), còn channel thì chỉ đọc được một lần.
//
// # Vì sao câu hỏi đi kèm /live thay vì có endpoint riêng
//
// Giao diện đã phải dò `/live` để biết engine còn chạy. Thêm một vòng dò thứ hai cho câu
// hỏi là hai nhịp lệch nhau: có lúc `/live` nói đang chạy mà `/ask` chưa kịp báo có câu
// hỏi, và người vận hành thấy dây chuyền "đang chạy" trong khi nó đứng chờ họ. Một nguồn,
// một nhịp.

// cauHoiCho là một lượt hỏi đang chờ trả lời.
type cauHoiCho struct {
	// ID để phía web gửi trả lời đúng lượt. Không có nó thì một trả lời đến muộn (người
	// dùng để tab cũ rồi bấm) sẽ được gán cho lượt hỏi SAU — tức engine nhận câu trả lời
	// cho một câu hỏi khác mà không ai biết.
	ID       string
	CauHoi   []tools.Question
	traLoi   chan *tools.AskUserResponse
	daTraLoi bool
}

// cauNoiHoi giữ lượt hỏi đang chờ của MỘT engine.
//
// Chỉ một lượt tại một thời điểm, và đó không phải giới hạn tùy tiện: `AskUserTool` khai
// `ConcurrencySafe() == false`, nên engine không bao giờ gọi hai lượt song song.
type cauNoiHoi struct {
	mu  sync.Mutex
	cho *cauHoiCho
	dem int
}

var errKhongCoCauHoi = errors.New("engine không đang chờ câu trả lời nào")

// handler là hàm cắm vào `Host.AskUser().SetHandler`.
//
// Nó CHẶN cho tới khi có trả lời hoặc ctx bị hủy. Hủy ctx xảy ra khi người dùng dừng
// engine giữa lúc nó đang hỏi — phải trả lỗi chứ không được trả câu rỗng, vì một câu trả
// lời rỗng sẽ được engine coi là ý kiến thật của người dùng.
func (c *cauNoiHoi) handler(ctx context.Context, ch []tools.Question) (*tools.AskUserResponse, error) {
	c.mu.Lock()
	c.dem++
	cho := &cauHoiCho{
		ID:     fmt.Sprintf("h%d", c.dem),
		CauHoi: ch,
		traLoi: make(chan *tools.AskUserResponse, 1),
	}
	c.cho = cho
	c.mu.Unlock()

	// Dọn khi thoát bằng MỌI đường, kể cả ctx hủy: một lượt hỏi mồ côi để lại sẽ làm giao
	// diện hiện mãi một modal chặn cho engine đã chết.
	defer func() {
		c.mu.Lock()
		if c.cho == cho {
			c.cho = nil
		}
		c.mu.Unlock()
	}()

	select {
	case tl := <-cho.traLoi:
		return tl, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

// dangCho trả lượt hỏi đang chờ, hoặc nil.
func (c *cauNoiHoi) dangCho() *cauHoiCho {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.cho
}

// traLoi nạp câu trả lời cho một lượt hỏi cụ thể.
func (c *cauNoiHoi) traLoi(id string, dap map[string]string, ghiChu map[string]string) error {
	c.mu.Lock()
	cho := c.cho
	if cho == nil {
		c.mu.Unlock()
		return errKhongCoCauHoi
	}
	if cho.ID != id {
		c.mu.Unlock()
		// Không im lặng nhận: trả lời cho lượt khác nghĩa là người dùng đang xem một câu
		// hỏi CŨ (tab để lâu), và câu họ chọn không phải câu trả lời cho câu đang hỏi.
		return fmt.Errorf("câu trả lời gửi cho lượt hỏi %q, nhưng engine đang chờ lượt %q — "+
			"tải lại trang để xem câu hỏi hiện tại", id, cho.ID)
	}
	if cho.daTraLoi {
		c.mu.Unlock()
		return errors.New("lượt hỏi này đã được trả lời")
	}

	// KIỂM TRƯỚC, đánh dấu SAU. Thứ tự này là bản sửa một lỗi bài kiểm bắt được: bản đầu
	// đặt `daTraLoi = true` rồi mới kiểm, nên một đáp án thiếu một khóa sẽ khóa người dùng
	// ra khỏi chính câu hỏi đang chặn engine của họ — không đường nào trả lời lại, và engine
	// treo vĩnh viễn.
	//
	// Mọi câu hỏi phải có đáp án: `AskUserTool.Description` nói kết quả là bản tóm tắt đọc
	// được ("người dùng trả lời: [Độ dài] Truyện vừa"), nên khóa thiếu thành chuỗi rỗng
	// trong bản tóm tắt đó và mô hình đọc một câu dở rồi tự điền — tức người dùng bị gán
	// một ý kiến họ không nói.
	for _, q := range cho.CauHoi {
		if strings.TrimSpace(dap[q.Question]) == "" {
			c.mu.Unlock()
			return fmt.Errorf("thiếu câu trả lời cho: %s", q.Question)
		}
	}

	cho.daTraLoi = true
	c.mu.Unlock()

	cho.traLoi <- &tools.AskUserResponse{Answers: dap, Notes: ghiChu}
	return nil
}

// handleTraLoiHoi — POST /api/books/{book}/ask
func (s *server) handleTraLoiHoi(w http.ResponseWriter, r *http.Request) {
	var than struct {
		ID     string            `json:"id"`
		Dap    map[string]string `json:"answers"`
		GhiChu map[string]string `json:"notes,omitempty"`
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
	if err := p.hoi.traLoi(than.ID, than.Dap, than.GhiChu); err != nil {
		ma := http.StatusBadRequest
		if errors.Is(err, errKhongCoCauHoi) {
			ma = http.StatusConflict
		}
		writeErr(w, ma, err)
		return
	}
	writeJSON(w, map[string]any{"answered": true})
}

// hoiRa là hình dạng câu hỏi trên đường HTTP.
//
// Sao chép chứ không dùng thẳng `tools.Question`: kiểu đó có tag JSON hợp lệ, nhưng nó là
// hình dạng nội bộ của lớp tool và việc phơi nó ra sẽ khóa một khế ước HTTP vào một kiểu
// mà upstream tự do đổi.
type hoiRa struct {
	ID     string `json:"id"`
	CauHoi []struct {
		Question    string `json:"question"`
		Header      string `json:"header"`
		MultiSelect bool   `json:"multi_select"`
		Options     []struct {
			Label       string `json:"label"`
			Description string `json:"description"`
		} `json:"options"`
	} `json:"questions"`
}

func hoiRaTu(cho *cauHoiCho) *hoiRa {
	if cho == nil {
		return nil
	}
	out := &hoiRa{ID: cho.ID}
	for _, q := range cho.CauHoi {
		m := struct {
			Question    string `json:"question"`
			Header      string `json:"header"`
			MultiSelect bool   `json:"multi_select"`
			Options     []struct {
				Label       string `json:"label"`
				Description string `json:"description"`
			} `json:"options"`
		}{Question: q.Question, Header: q.Header, MultiSelect: q.MultiSelect}
		for _, o := range q.Options {
			m.Options = append(m.Options, struct {
				Label       string `json:"label"`
				Description string `json:"description"`
			}{Label: o.Label, Description: o.Description})
		}
		out.CauHoi = append(out.CauHoi, m)
	}
	return out
}
