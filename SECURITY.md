# Chính sách bảo mật

> **English:** please report vulnerabilities privately through GitHub's
> [Report a vulnerability](https://github.com/huuhoa143/ainovel-studio/security/advisories/new)
> form rather than opening a public issue. Only the latest release is supported. You should get
> an acknowledgement within 7 days; fixes ship as a new release, delivered by the app's
> auto-updater. See the [English summary](#english-summary) at the end.

## Phiên bản được hỗ trợ

Chỉ **bản phát hành mới nhất** trên
[GitHub Releases](https://github.com/huuhoa143/ainovel-studio/releases/latest) được sửa lỗi bảo
mật. App tự cập nhật, nên bản sửa đến với người dùng qua một bản phát hành mới — không có nhánh
bảo trì cho bản cũ. Các tag `v0.x` là của dự án upstream, không thuộc phạm vi này.

| Phiên bản | Hỗ trợ |
|---|---|
| Bản mới nhất | Có |
| Mọi bản cũ hơn | Không — hãy cập nhật |

## Báo lỗ hổng

**Đừng mở issue công khai.** Dùng
[**Report a vulnerability**](https://github.com/huuhoa143/ainovel-studio/security/advisories/new)
(tab Security của repo) — kênh đó riêng tư giữa bạn và người bảo trì.

Xin kèm: phiên bản hoặc commit, môi trường, các bước tái hiện, và tác động thật mà bạn quan sát
được. Một bản tái hiện chạy được có giá trị hơn nhiều một mô tả.

### Điều bạn có thể mong đợi

Đây là dự án cá nhân, không phải sản phẩm thương mại có đội trực, nên đây là mục tiêu chứ không
phải cam kết:

- **Xác nhận đã nhận** trong vòng 7 ngày.
- **Đánh giá ban đầu** (có phải lỗ hổng không, mức độ) trong vòng 14 ngày.
- Lỗ hổng được xác nhận sẽ được sửa trong một bản phát hành mới; mức độ nghiêm trọng quyết định độ
  gấp. Bạn được báo trước khi bản sửa ra.
- **Công bố có phối hợp**: advisory được công bố sau khi bản sửa đã phát hành. Bạn được ghi công
  trong advisory nếu muốn.

Xin đừng công bố chi tiết trước khi có bản sửa, và đừng thử nghiệm trên máy hay dữ liệu của người
khác.

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
để cập nhật giá và cửa sổ ngữ cảnh (`internal/models/pricing.go`). Danh sách đầy đủ những gì app gửi ra
mạng và lưu trên máy nằm ở [PRIVACY.md](PRIVACY.md).

## Phạm vi

Chỉ mã trong repo này. Lỗ hổng của **upstream**
[voocel/ainovel-cli](https://github.com/voocel/ainovel-cli) xin báo cho dự án gốc — trừ khi nó
nằm ở phần fork này thêm vào (`internal/serve`, `web/`, `desktop/`, `third_party/litellm` đã vá).

## English summary

- **Supported versions:** only the latest release. The app updates itself; fixes ship as a new
  release. The `v0.x` tags belong to the upstream project.
- **How to report:** privately via
  [Report a vulnerability](https://github.com/huuhoa143/ainovel-studio/security/advisories/new)
  — never in a public issue. Include the version or commit, environment, reproduction steps and
  the impact you observed.
- **What to expect** (goals, not an SLA — this is a personal project): acknowledgement within 7
  days, initial assessment within 14 days, a fix in a new release, coordinated disclosure through
  a GitHub advisory after the fix ships, with credit if you want it.
- **Scope:** the local desktop app — the Electron shell (`desktop/`), the Go sidecar
  (`internal/serve` and the code it drives), the web UI (`web/`) and the patched
  `third_party/litellm`. Most valuable reports: a web page or another process reaching the
  sidecar API past its `Host` / `Origin` / anti-CSRF header guards (`internal/serve/rao.go`); the
  sidecar listening beyond loopback; API keys leaking through the API, logs, error messages or
  screenshots; escaping the data folder during import/export.
- **Not vulnerabilities:** the sidecar API has no authentication by design (the loopback address
  guard replaces it); the Windows installer is not code-signed (documented in the README).
- **Upstream issues** belong to [voocel/ainovel-cli](https://github.com/voocel/ainovel-cli)
  unless they live in code this fork added.
- Where your API key lives and every outbound connection the app makes:
  [PRIVACY.md](PRIVACY.md).
