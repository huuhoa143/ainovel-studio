package serve

import (
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
)

// Hàng rào cho nhóm route GHI.
//
// # Vì sao studio chỉ đọc thì không cần, mà studio ghi thì bắt buộc
//
// Khi studio chỉ đọc, thiệt hại tối đa của một yêu cầu lạ là đọc được văn bản trên máy
// người dùng. Từ khi nó ghi được, cùng một yêu cầu lạ có thể: bắt đầu một cuốn sách mới
// (đốt tiền API thật), dừng cuốn đang chạy, hoặc thay khóa API. Nên ba hàng rào dưới đây
// là điều kiện để tính năng này tồn tại, không phải phần tăng cường thêm.

// tenMayCucBo là các tên host được coi là máy này.
//
// # Vì sao KHÔNG có chuỗi rỗng trong bảng này
//
// Có hai câu hỏi khác nhau cùng dùng khái niệm "host cục bộ", và chuỗi rỗng có nghĩa
// TRÁI NGƯỢC ở hai bên:
//
//   - Trong header `Host` của yêu cầu, rỗng là chuyện thường của HTTP/1.0 → vô hại.
//   - Trong địa chỉ LẮNG NGHE (`:8420`), rỗng nghĩa là "mọi giao diện" → y hệt 0.0.0.0.
//
// Gộp hai câu hỏi vào một bảng đã tạo ra đúng lỗi đó: `laDiaChiCucBo(":8420")` trả true,
// nên studio bật đường ghi trong khi đang phơi ra toàn mạng. Nên bảng này không chứa
// rỗng, và bên kiểm header tự nới cho riêng mình.
var tenMayCucBo = map[string]bool{
	"127.0.0.1": true,
	"localhost": true,
	"::1":       true,
	"[::1]":     true,
}

// laDiaChiCucBo cho biết địa chỉ lắng nghe có phải loopback.
//
// `chay` dùng nó để TỪ CHỐI khởi động trên địa chỉ không phải loopback: hậu quả của sai ở
// đây là người lạ khởi động được engine và đọc được khóa vừa đặt.
//
// Hướng sai của hàm này KHÔNG đối xứng: nhận sai một địa chỉ công khai thành cục bộ là
// phơi khóa API ra internet; từ chối sai một địa chỉ cục bộ chỉ làm mất tiện. Nên mọi ca
// không nhận ra đều trả false.
func laDiaChiCucBo(addr string) bool {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		host = addr
	}
	// Rỗng = mọi giao diện. Kiểm tường minh để không ai "sửa" bằng cách thêm rỗng vào bảng.
	if strings.TrimSpace(host) == "" {
		return false
	}
	if tenMayCucBo[host] {
		return true
	}
	if ip := net.ParseIP(strings.Trim(host, "[]")); ip != nil {
		return ip.IsLoopback()
	}
	return false
}

// tenHeaderRao là header mà mọi yêu cầu ghi phải mang.
//
// Đây là hàng rào chống CSRF, và nó làm việc nhờ hai luật của trình duyệt:
//
//   - Form HTML KHÔNG đặt được header tùy ý. Nên `<form action="http://127.0.0.1:8420/...">`
//     trên một trang bất kỳ không gửi được header này.
//   - `fetch` với header tùy ý bị coi là yêu cầu "không đơn giản", nên trình duyệt bắt
//     buộc phải preflight OPTIONS trước. Server này không trả header CORS cho phép, nên
//     trình duyệt tự chặn trước khi yêu cầu thật đi ra.
//
// Không có hàng rào này thì một tab quảng cáo đang mở ở nền xóa được sách hoặc đốt được
// tiền của người dùng, và người dùng không có cách nào biết.
const tenHeaderRao = "X-Ainovel-Studio"

// raoGhi bọc một handler ghi bằng ba phép kiểm.
func raoGhi(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := kiemNguonGoc(r); err != nil {
			writeErr(w, http.StatusForbidden, err)
			return
		}
		next(w, r)
	}
}

// kiemNguonGoc kiểm Host, Origin và header rào.
func kiemNguonGoc(r *http.Request) error {
	// Host: chặn DNS rebinding. Kẻ tấn công trỏ evil.com về 127.0.0.1 rồi cho trình duyệt
	// gọi tới; lúc đó địa chỉ ĐÍCH là loopback nên hàng rào addr không thấy gì, nhưng
	// header Host mang "evil.com". Chỉ nhận Host là tên của máy này.
	host := r.Host
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	// Host rỗng: chỉ gặp với HTTP/1.0. Nới ở ĐÂY chứ không nới trong `tenMayCucBo`, vì
	// cùng chuỗi rỗng đó trong địa chỉ lắng nghe lại nghĩa là "mọi giao diện" — xem chú
	// thích của bảng. Bỏ lọt ca này chỉ mất tiện với client cổ; nới sai bên kia là phơi khóa.
	if strings.TrimSpace(host) != "" && !tenMayCucBo[host] {
		if ip := net.ParseIP(strings.Trim(host, "[]")); ip == nil || !ip.IsLoopback() {
			return fmt.Errorf("Host %q không phải máy cục bộ — studio chỉ nhận lệnh ghi từ chính máy này", r.Host)
		}
	}

	// Origin: có thì phải khớp máy cục bộ. Vắng mặt là bình thường với `fetch` cùng gốc ở
	// một số phiên bản trình duyệt, nên vắng KHÔNG bị coi là lỗi — hàng rào header dưới
	// đây mới là chỗ chặn form và yêu cầu khác gốc.
	if org := r.Header.Get("Origin"); org != "" {
		u, err := url.Parse(org)
		if err != nil {
			return fmt.Errorf("Origin không đọc được: %q", org)
		}
		oh := u.Hostname()
		if !tenMayCucBo[oh] {
			if ip := net.ParseIP(oh); ip == nil || !ip.IsLoopback() {
				return fmt.Errorf("Origin %q khác máy cục bộ", org)
			}
		}
	}

	if r.Header.Get(tenHeaderRao) == "" {
		return fmt.Errorf("thiếu header %s — yêu cầu ghi phải đến từ giao diện studio", tenHeaderRao)
	}
	return nil
}

// cheKhoa che khóa API để hiện lên giao diện.
//
// Giữ đầu và cuối vì đó là phần người dùng dùng để nhận ra mình đã dán khóa nào; phần
// giữa là phần bí mật. Khóa ngắn thì che HẾT: với khóa 8 ký tự, để lộ 4+4 là để lộ cả.
//
// API không bao giờ trả khóa thật, kể cả trên loopback. Nếu trả, khóa sẽ nằm trong bộ
// nhớ đệm của trình duyệt, trong lịch sử devtools, và trong mọi ảnh chụp màn hình mà
// người dùng gửi đi khi báo lỗi.
func cheKhoa(k string) string {
	if k == "" {
		return ""
	}
	r := []rune(k)
	if len(r) <= 12 {
		return strings.Repeat("•", len(r))
	}
	return string(r[:4]) + "…" + string(r[len(r)-3:])
}
