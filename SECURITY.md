# Chính sách bảo mật

> **English:** please report vulnerabilities privately through GitHub's
> [Report a vulnerability](https://github.com/huuhoa143/ainovel-studio/security/advisories/new)
> form rather than opening a public issue.

## Báo lỗ hổng

**Đừng mở issue công khai.** Dùng
[**Report a vulnerability**](https://github.com/huuhoa143/ainovel-studio/security/advisories/new)
(tab Security của repo) — kênh đó riêng tư giữa bạn và người bảo trì.

Xin kèm: phiên bản hoặc commit, môi trường, các bước tái hiện, và tác động thật mà bạn quan sát
được. Một bản tái hiện chạy được có giá trị hơn nhiều một mô tả.

Đây là dự án cá nhân, không phải sản phẩm thương mại có đội trực, nên không hứa SLA. Bạn sẽ nhận
phản hồi sớm nhất có thể.

## Vì sao bề mặt này đáng quan tâm

Web studio **giữ khóa API** và **khởi động được engine**. Nên một yêu cầu từ người lạ không chỉ
đọc được bản thảo chưa phát hành, mà còn tiêu được tiền thật của người dùng. Ba loại báo cáo
đáng giá nhất:

- đường nào đó **ghi được** khi studio đang chạy ngoài loopback;
- rò khóa API qua API, log, thông báo lỗi, hay ảnh chụp màn hình;
- thoát khỏi thư mục gốc khi đọc/ghi tệp (`--root`, luồng nhập/xuất).

## Những điều KHÔNG phải lỗ hổng

Ba hành vi dưới đây là quyết định thiết kế có chủ đích, xin đừng báo:

**Studio không có xác thực.** Nó chạy trên máy người dùng, và hàng rào **địa chỉ** đóng vai trò
thay cho mật khẩu: `internal/serve/rao.go` chỉ mắc nhóm route ghi khi địa chỉ lắng nghe là
loopback. Người dùng đã chọn không có mật khẩu.

**Route ghi trả `404` chứ không `403` khi chạy ngoài loopback.** Cả nhóm không được mắc vào mux,
nên với người dò thì chúng không tồn tại — đó là chủ đích, không phải lỗi thông báo.

**`ainovel-cli update` báo không tìm thấy bản mới.** Fork này không phát hành nhị phân release.
Cập nhật là `git pull` rồi dựng lại.

## Khóa API của bạn nằm ở đâu

Ở `~/.ainovel/config.json` **trên máy bạn**, không đi đâu khác. API không bao giờ trả khóa về,
kể cả trên loopback: chỗ nào cần hiện thì chỉ hiện dạng che (`sk-4…802`), vì một khóa trả về sẽ
nằm trong bộ nhớ đệm trình duyệt, trong lịch sử devtools, và trong mọi ảnh chụp màn hình người
dùng gửi kèm khi báo lỗi.

Không có bản hosted. Không có máy chủ nào của dự án này nhận khóa của bạn.

## Phạm vi

Chỉ mã trong repo này. Lỗ hổng của **upstream**
[voocel/ainovel-cli](https://github.com/voocel/ainovel-cli) xin báo cho dự án gốc — trừ khi nó
nằm ở phần fork này thêm vào (`internal/serve`, `web/`, `third_party/litellm` đã vá).
