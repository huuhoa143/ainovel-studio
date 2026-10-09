# Nhật ký thay đổi

Mọi thay đổi đáng kể của AINovel Studio được ghi ở đây. Định dạng theo
[Keep a Changelog](https://keepachangelog.com/vi/1.1.0/), phiên bản theo
[Semantic Versioning](https://semver.org/lang/vi/).

*All notable changes to AINovel Studio are documented here, following Keep a Changelog and
Semantic Versioning.*

## [Unreleased]

## [1.0.0] — chưa phát hành

Bản đầu tiên dưới dạng **app desktop**. Các tag `v0.x` trong repo là của dự án upstream
[voocel/ainovel-cli](https://github.com/voocel/ainovel-cli) (công cụ dòng lệnh) và không phải bản
phát hành của AINovel Studio.

### Thêm

- **App desktop cho macOS (Apple Silicon + Intel) và Windows 10/11 x64** — vỏ Electron gói sẵn
  engine Go (sidecar) và giao diện; không cần terminal, Go hay Node. Bản macOS được ký Developer
  ID và notarize.
- **Tự cập nhật** từ GitHub Releases, kèm mục **Kiểm tra cập nhật…** trong menu.
- **Studio ba màn**: Tủ truyện, Tiến độ (buồng lái sản xuất), Đọc truyện — tạo, chạy, tạm dừng,
  góp ý thời gian thực, duyệt từng chương, cấu hình, xuất bản.
- **Cấu hình nhà cung cấp và model ngay trong app**, gồm model theo vai, proxy tự định nghĩa, kiểm
  tra kết nối và kiểm tra khả năng gọi công cụ; khóa API chỉ ghi, không bao giờ trả về.
- **Theo dõi chi phí** theo vai và theo model, cho từng truyện và cả xưởng.
- **Xuất EPUB/TXT** và **Tệp → Nhập truyện từ thư mục…** để mang truyện viết bằng bản CLI cũ vào.
- **Chuyển dữ liệu một lần** từ `~/.ainovel` (cấu hình, luật viết, văn phong) sang thư mục dữ liệu
  của app.
- **Việt hóa toàn bộ**: giao diện, prompt, tài liệu tham chiếu và văn phong — AI sinh truyện tiếng
  Việt.
- Giấy tờ đi kèm app: [PRIVACY.md](PRIVACY.md), [DISCLAIMER.md](DISCLAIMER.md), [NOTICE](NOTICE)
  và danh sách giấy phép bên thứ ba sinh tự động mỗi lần build.
- Tài liệu cộng đồng: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), mẫu issue và pull request.

### Thay đổi

- Dữ liệu người dùng chuyển từ `~/.ainovel` sang thư mục dữ liệu của app
  (`~/Library/Application Support/AINovel Studio` trên macOS, `%APPDATA%\AINovel Studio` trên
  Windows).
- Binary Go chỉ còn là sidecar của app; API nội bộ chỉ nghe trên `127.0.0.1`.

### Gỡ bỏ

- Giao diện dòng lệnh/TUI, bản Docker và chế độ web chỉ-đọc của fork.

[Unreleased]: https://github.com/huuhoa143/ainovel-studio/commits/main
[1.0.0]: https://github.com/huuhoa143/ainovel-studio/commits/main
