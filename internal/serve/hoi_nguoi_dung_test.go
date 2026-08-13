package serve

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/huuhoa143/ainovel-studio/internal/tools"
)

var cauHoiMau = []tools.Question{{
	Question: "Truyện này dài bao nhiêu?",
	Header:   "Độ dài",
	Options: []tools.Option{
		{Label: "Truyện dài", Description: "trên 100 chương"},
		{Label: "Truyện vừa", Description: "20–60 chương"},
	},
}}

// TestHoiChanRoiDuocGiaiPhong canh khế ước cốt lõi của cầu nối.
//
// # Vì sao lớp lỗi này đáng bài kiểm riêng nhất trong cả bản web
//
// `tools.AskUserHandler` là hàm CHẶN: engine gọi rồi đứng chờ. Sai ở đây không cho ra một
// giá trị sai — nó làm engine treo VĨNH VIỄN, và người vận hành thấy một dây chuyền "đang
// chạy" mà không tiến, không lỗi, không log. Đó là hình thức hỏng đắt nhất: nó tiêu thời
// gian mà không tiêu tiền, nên cả cảnh báo ngân sách cũng không bắt được.
func TestHoiChanRoiDuocGiaiPhong(t *testing.T) {
	c := &cauNoiHoi{}
	xong := make(chan *tools.AskUserResponse, 1)
	loiCh := make(chan error, 1)

	go func() {
		tl, err := c.handler(context.Background(), cauHoiMau)
		if err != nil {
			loiCh <- err
			return
		}
		xong <- tl
	}()

	cho := doiCauHoi(t, c)
	if cho.ID == "" {
		t.Fatal("lượt hỏi không có ID — phía web không phân biệt được hai lượt")
	}
	if len(cho.CauHoi) != 1 {
		t.Fatalf("số câu hỏi = %d, muốn 1", len(cho.CauHoi))
	}

	if err := c.traLoi(cho.ID, map[string]string{"Truyện này dài bao nhiêu?": "Truyện vừa"}, nil); err != nil {
		t.Fatalf("traLoi: %v", err)
	}

	select {
	case tl := <-xong:
		if tl.Answers["Truyện này dài bao nhiêu?"] != "Truyện vừa" {
			t.Errorf("đáp án không tới được engine: %v", tl.Answers)
		}
	case err := <-loiCh:
		t.Fatalf("handler trả lỗi: %v", err)
	case <-time.After(2 * time.Second):
		t.Fatal("handler KHÔNG được giải phóng sau khi trả lời — engine sẽ treo vĩnh viễn")
	}

	// Lượt hỏi phải được dọn: còn sót thì giao diện hiện mãi một modal chặn cho một câu hỏi
	// đã trả lời xong.
	if c.dangCho() != nil {
		t.Error("lượt hỏi còn sót sau khi trả lời — modal chặn sẽ không bao giờ đóng")
	}
}

// TestHoiCtxHuyThiTraLoi canh đường DỪNG giữa lúc engine đang hỏi.
//
// Người dùng bấm Dừng khi modal đang mở là ca thật và hay gặp. Handler phải trả LỖI, không
// được trả một phản hồi rỗng: engine coi phản hồi là ý kiến của người dùng, nên một map
// rỗng sẽ thành "người dùng trả lời: [Độ dài] " và mô hình tự bịa phần còn lại.
func TestHoiCtxHuyThiTraLoi(t *testing.T) {
	c := &cauNoiHoi{}
	ctx, huy := context.WithCancel(context.Background())
	ket := make(chan error, 1)
	go func() {
		_, err := c.handler(ctx, cauHoiMau)
		ket <- err
	}()

	doiCauHoi(t, c)
	huy()

	select {
	case err := <-ket:
		if !errors.Is(err, context.Canceled) {
			t.Errorf("phải trả context.Canceled, được: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("hủy ctx KHÔNG giải phóng handler — dừng engine giữa lúc hỏi sẽ treo")
	}
	if c.dangCho() != nil {
		t.Error("lượt hỏi mồ côi sau khi hủy — modal chặn cho một engine đã chết")
	}
}

// TestHoiTuChoiTraLoiLuotKhac canh việc không nhận đáp án của lượt hỏi cũ.
//
// Ca thật: người dùng mở studio ở hai tab, hoặc để một tab lâu rồi mới bấm. Nếu cầu nối
// nhận bừa thì engine lấy câu trả lời cho một câu hỏi KHÁC làm ý kiến người dùng — sai
// lệch mà không ai thấy, vì cả hai phía đều báo thành công.
func TestHoiTuChoiTraLoiLuotKhac(t *testing.T) {
	c := &cauNoiHoi{}
	go func() { _, _ = c.handler(context.Background(), cauHoiMau) }()
	cho := doiCauHoi(t, c)

	err := c.traLoi("h999", map[string]string{"Truyện này dài bao nhiêu?": "Truyện vừa"}, nil)
	if err == nil {
		t.Fatal("nhận đáp án cho lượt hỏi khác — engine sẽ dùng câu trả lời sai làm ý kiến người dùng")
	}
	if !strings.Contains(err.Error(), cho.ID) {
		t.Errorf("thông báo phải nêu lượt đang chờ để người dùng biết tải lại trang: %v", err)
	}

	// Không có lượt nào đang chờ thì phải là sentinel riêng, để tầng HTTP trả 409 chứ
	// không 400: "engine không đang hỏi" là trạng thái, không phải yêu cầu sai.
	c2 := &cauNoiHoi{}
	if err := c2.traLoi("h1", nil, nil); !errors.Is(err, errKhongCoCauHoi) {
		t.Errorf("phải trả errKhongCoCauHoi, được: %v", err)
	}
}

// TestHoiDoiDuMoiCauTraLoi canh việc không cho đáp án thiếu.
//
// `AskUserTool.Description` nói kết quả là bản tóm tắt đọc được ("người dùng trả lời:
// [Độ dài] Truyện vừa"). Khóa thiếu thành chuỗi rỗng trong bản tóm tắt đó, nên mô hình đọc
// một câu dở và tự điền — tức người dùng bị gán một ý kiến họ không nói.
func TestHoiDoiDuMoiCauTraLoi(t *testing.T) {
	c := &cauNoiHoi{}
	go func() { _, _ = c.handler(context.Background(), cauHoiMau) }()
	cho := doiCauHoi(t, c)

	for _, dap := range []map[string]string{nil, {}, {"Truyện này dài bao nhiêu?": "   "}} {
		if err := c.traLoi(cho.ID, dap, nil); err == nil {
			t.Errorf("đáp án %v phải bị từ chối", dap)
		}
	}
	// Sau khi bị từ chối, lượt hỏi vẫn phải CÒN để người dùng trả lời lại. Đánh dấu đã trả
	// lời rồi mới kiểm sẽ khóa họ ra khỏi câu hỏi đang chặn engine của chính họ.
	if c.dangCho() == nil {
		t.Fatal("lượt hỏi bị dọn sau một đáp án thiếu — người dùng không còn đường trả lời")
	}
	if err := c.traLoi(cho.ID, map[string]string{"Truyện này dài bao nhiêu?": "Truyện dài"}, nil); err != nil {
		t.Errorf("trả lời lại sau khi bị từ chối phải được, được lỗi: %v", err)
	}
}

// doiCauHoi chờ tới khi handler đã đăng ký lượt hỏi.
//
// Không dùng `time.Sleep` cố định: handler chạy ở goroutine khác nên một mốc ngủ cứng sẽ
// đỏ ngẫu nhiên trên máy chậm và xanh sai trên máy nhanh.
func doiCauHoi(t *testing.T, c *cauNoiHoi) *cauHoiCho {
	t.Helper()
	han := time.Now().Add(2 * time.Second)
	for time.Now().Before(han) {
		if cho := c.dangCho(); cho != nil {
			return cho
		}
		time.Sleep(2 * time.Millisecond)
	}
	t.Fatal("handler không đăng ký lượt hỏi nào trong 2s")
	return nil
}
