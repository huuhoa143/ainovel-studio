package serve

import (
	"strings"
	"sync"

	"github.com/huuhoa143/ainovel-studio/internal/host"
	"github.com/huuhoa143/ainovel-studio/internal/utils"
)

// Dòng VĂN SỐNG — chữ model đang sinh ra, đường từ engine tới trình duyệt.
//
// # Vì sao cần một bộ đệm ở giữa
//
// `Host.Stream()` là MỘT channel Go, và channel Go có nghĩa "một người nhận": mỗi mẩu chữ
// chỉ đến đúng một chỗ đọc. Nếu mỗi kết nối SSE tự nhận thẳng từ đó thì hai tab trình
// duyệt sẽ GIÀNH mẩu của nhau — mỗi bên thấy một nửa câu, và không bên nào biết mình đang
// thiếu. Kể cả một tab cũng vỡ: tab đóng rồi mở lại là mất trắng lượt đang chạy.
//
// Nên đúng một goroutine hút channel (mở cùng lúc với engine), còn các kết nối SSE đọc
// LẠI từ bộ đệm này theo số thứ tự riêng của chúng.
//
// # Vì sao giữ cả "văn của lượt hiện tại"
//
// Người dùng mở trang GIỮA lúc engine đang viết một chương. Nếu chỉ phát các mẩu MỚI thì
// họ thấy nửa cuối một câu và phải đoán phần đầu. TUI gốc không có vấn đề này vì nó là
// process giữ cả lượt trong bộ đệm màn hình. `vong` giữ đúng thứ đó: toàn bộ chữ kể từ
// lần xóa gần nhất, để một người mới vào nhận được cả đoạn đang chảy trong một mẩu.
//
// # Ranh giới lượt
//
// Engine phát `host.StreamClearSentinel` để nói "xóa lượt hiện tại, bắt đầu lượt mới"
// (host.go:1016). Nó đi CÙNG channel với chữ để giữ đúng thứ tự — nên ở đây nó cũng phải
// là một mục trong hàng, không phải một lời gọi riêng: xử lý nó ngoài hàng sẽ cho phép
// một mẩu chữ của lượt mới vượt lên trước lệnh xóa của lượt cũ, và giao diện xóa mất
// đúng phần vừa nhận.
type dongVan struct {
	mu   sync.Mutex
	manh []manhVan
	seq  int64
	vong strings.Builder

	// cho là channel BÁO HIỆU, không mang dữ liệu: nó được ĐÓNG để đánh thức mọi người đang
	// chờ, rồi thay bằng channel mới. Đây là lối broadcast chuẩn của Go — gửi giá trị thì chỉ
	// một người nhận được, mà ở đây có N kết nối SSE cùng chờ một bộ đệm.
	cho chan struct{}
}

// manhVan là một mục trong hàng: hoặc một mẩu chữ, hoặc một lệnh xóa.
type manhVan struct {
	Seq int64
	Chu string
	Xoa bool
}

// soManhGiu là số mục giữ lại trong hàng phát lại.
//
// Đây là cửa sổ cho người bị mất kết nối vài giây, không phải bản lưu: mỗi mẩu là một
// nhịp phát của model (thường vài chục ký tự), nên 3000 mục là khoảng một chương văn.
// Client tụt xa hơn thế sẽ nhận lại `vong` khi nối lại, tức vẫn không mất ngữ cảnh.
const soManhGiu = 3000

// coVongToiDa chặn `vong` phình vô hạn.
//
// Một lượt của Writer có thể là cả chương (vài nghìn từ) và engine có thể chạy nhiều giờ
// mà không phát lệnh xóa nào nếu có gì đó sai ở tầng dưới. Cắt từ ĐẦU chứ không từ cuối:
// phần cuối là phần đang chảy, tức phần người dùng đang đọc.
const coVongToiDa = 512 << 10

func (d *dongVan) them(delta string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	// defer chạy theo thứ tự NGƯỢC với lúc khai báo, nên `danhThuc` ở đây chạy TRƯỚC
	// `mu.Unlock()` phía trên — đúng yêu cầu "gọi trong lúc đã giữ khóa". Đặt ở CẢ HAI nhánh
	// bên dưới (sentinel và chữ) vì cả hai đều là mẩu mới mà người chờ cần biết.
	defer d.danhThuc()

	d.seq++
	if delta == host.StreamClearSentinel {
		d.vong.Reset()
		d.day(manhVan{Seq: d.seq, Xoa: true})
		return
	}

	d.vong.WriteString(delta)
	if d.vong.Len() > coVongToiDa {
		s := d.vong.String()
		d.vong.Reset()
		d.vong.WriteString(catDauGiuVai(s, coVongToiDa/2))
	}
	d.day(manhVan{Seq: d.seq, Chu: delta})
}

// catDauGiuVai giữ `n` byte cuối của s mà KHÔNG đảo vai các đoạn.
//
// utils.ThinkingSep là CÔNG TẮC chứ không phải nhãn: đoạn sau dấu thứ nhất là
// suy nghĩ của model, sau dấu thứ hai là văn trở lại. Nên cắt đầu có thể nuốt
// mất dấu MỞ và để lại dấu ĐÓNG — từ đó mọi đoạn phía sau đổi vai, văn bị vẽ
// thành suy nghĩ và ngược lại. Hỏng IM LẶNG, vì không mất chữ nào.
//
// Đếm dấu trong phần bỏ đi; lẻ thì mở lại một dấu ở đầu phần giữ.
func catDauGiuVai(s string, n int) string {
	if len(s) <= n {
		return s
	}
	giu := s[len(s)-n:]
	if strings.Count(s[:len(s)-n], utils.ThinkingSep)%2 == 1 {
		return utils.ThinkingSep + giu
	}
	return giu
}

// day thêm vào hàng và bỏ mục cũ nhất khi đầy. Gọi trong lúc đã giữ khóa.
func (d *dongVan) day(m manhVan) {
	d.manh = append(d.manh, m)
	if len(d.manh) > soManhGiu {
		// Sao chép sang slice mới thay vì `d.manh[1:]`: cắt đầu liên tục trên cùng một
		// mảng nền làm nó lớn mãi (append vẫn cấp thêm ở cuối), tức một rò rỉ chậm trong
		// một process chạy hàng giờ.
		giu := make([]manhVan, len(d.manh)-1, soManhGiu+1)
		copy(giu, d.manh[1:])
		d.manh = giu
	}
}

// sau trả các mục có seq lớn hơn `seq`, kèm seq cuối.
func (d *dongVan) sau(seq int64) ([]manhVan, int64) {
	d.mu.Lock()
	defer d.mu.Unlock()

	if len(d.manh) == 0 {
		return nil, d.seq
	}
	var ra []manhVan
	for _, m := range d.manh {
		if m.Seq > seq {
			ra = append(ra, m)
		}
	}
	return ra, d.seq
}

// vongLen là số byte của lượt hiện tại. Chỉ để bài kiểm dừng vòng nạp đúng chỗ; giao diện
// không cần nó, nên nó không lên JSON.
func (d *dongVan) vongLen() int {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.vong.Len()
}

// doi trả channel để chờ mẩu tiếp theo.
//
// Người chờ phải gọi `doi()` TRƯỚC khi đọc `sau()`. Đọc trước rồi mới đăng ký thì mẩu đến
// giữa hai bước không đánh thức ai, và kết nối treo tới nhịp sau — tức chữ đứng im dù engine
// đang phát.
func (d *dongVan) doi() <-chan struct{} {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.cho == nil {
		d.cho = make(chan struct{})
	}
	return d.cho
}

// danhThuc đóng channel báo hiệu hiện tại. Gọi trong lúc đã giữ khóa.
func (d *dongVan) danhThuc() {
	if d.cho != nil {
		close(d.cho)
		d.cho = nil
	}
}

// vongHienTai trả toàn bộ văn của lượt đang chảy và seq tương ứng.
//
// Dùng cho người MỚI mở kết nối. Trả seq hiện tại cùng lúc để họ không nhận lại các mẩu
// đã nằm trong đoạn văn này — nếu tách hai lời gọi thì giữa chúng có thể xen thêm mẩu mới,
// và người đọc thấy một khúc bị lặp.
func (d *dongVan) vongHienTai() (string, int64) {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.vong.String(), d.seq
}

// hut hút channel của engine cho tới khi nó đóng.
//
// Chạy một goroutine cho mỗi phiên engine, mở cùng lúc với engine. Không có `select` với
// ctx: channel này do `Host.Close` đóng, nên vòng lặp tự kết thúc đúng lúc engine chết —
// thêm một đường hủy thứ hai chỉ tạo ra khả năng goroutine chết TRƯỚC engine, và lúc đó
// `emitDelta` sẽ đầy hàng rồi âm thầm bỏ mẩu.
func (d *dongVan) hut(ch <-chan string) {
	for delta := range ch {
		d.them(delta)
	}
}

// hostVan là phần của host mà bộ đệm này cần. Nhận qua interface để bài kiểm không phải
// dựng cả một engine thật.
type hostVan interface {
	Stream() <-chan string
}

var _ hostVan = (*host.Host)(nil)
