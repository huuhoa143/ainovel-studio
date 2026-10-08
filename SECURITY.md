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

App chạy một tiến trình Go (sidecar) **giữ khóa API** và **khởi động được engine**, phục vụ một
HTTP API trên `127.0.0.1` cho cửa sổ app. Nên một yêu cầu từ bên ngoài app không chỉ đọc được
bản thảo chưa phát hành, mà còn tiêu được tiền thật của người dùng. Bốn loại báo cáo đáng giá
nhất:

- một trang web đang mở trong trình duyệt (hay một tiến trình khác) **gọi được** API của sidecar
  vượt qua hàng rào `Host` / `Origin` / header chống CSRF;
- sidecar lắng nghe được ngoài loopback;
- rò khóa API qua API, log, thông báo lỗi, hay ảnh chụp màn hình;
- thoát khỏi thư mục dữ liệu khi đọc/ghi tệp (luồng nhập/xuất, **Tệp → Nhập truyện từ thư
  mục…**).

## Những điều KHÔNG phải lỗ hổng

Hai hành vi dưới đây là quyết định thiết kế có chủ đích, xin đừng báo:

**API của sidecar không có xác thực.** Nó chỉ phục vụ cửa sổ app trên cùng máy, và hàng rào
**địa chỉ** đóng vai trò thay cho mật khẩu: `--addr` không phải loopback thì sidecar từ chối khởi
động, còn `internal/serve/rao.go` kiểm `Host` / `Origin` cộng một header riêng.

**Bộ cài Windows chưa có chữ ký số.** Đã ghi rõ trong README kèm các bước vượt cảnh báo
SmartScreen. Bản macOS được ký Developer ID và notarize.

## Khóa API của bạn nằm ở đâu

Trong tệp cấu hình của app **trên máy bạn**, không đi đâu khác:

- macOS: `~/Library/Application Support/AINovel Studio/config.json`
- Windows: `%APPDATA%\AINovel Studio\config.json`

Lần mở đầu tiên app chép `~/.ainovel/config.json` cũ (nếu có), cùng `rules/` và `style/`, sang đó
— chỉ một lần — và để nguyên tệp cũ. Tệp cũ vẫn chứa khóa API dạng văn bản; nếu không còn dùng
bản cũ, bạn có thể tự xóa thư mục `~/.ainovel`.

API không bao giờ trả khóa về: chỗ nào cần hiện thì chỉ hiện dạng che (`sk-4…802`), vì một khóa
trả về sẽ nằm trong bộ nhớ đệm, trong lịch sử devtools, và trong mọi ảnh chụp màn hình người
dùng gửi kèm khi báo lỗi.

Không có bản hosted. Không có máy chủ nào của dự án này nhận khóa của bạn: lời gọi model đi thẳng
từ máy bạn tới nhà cung cấp bạn chọn. Ngoài đó, app chỉ tự gọi ra ngoài ở hai chỗ, đều không kèm
khóa: kiểm tra bản cập nhật trên GitHub Releases, và tải danh sách model công khai của OpenRouter
để cập nhật giá và cửa sổ ngữ cảnh (`internal/models/pricing.go`).

## Phạm vi

Chỉ mã trong repo này. Lỗ hổng của **upstream**
[voocel/ainovel-cli](https://github.com/voocel/ainovel-cli) xin báo cho dự án gốc — trừ khi nó
nằm ở phần fork này thêm vào (`internal/serve`, `web/`, `desktop/`, `third_party/litellm` đã vá).
