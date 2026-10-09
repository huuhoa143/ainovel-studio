<!--
Cảm ơn bạn đã đóng góp! Đọc CONTRIBUTING.md trước nếu chưa đọc.
Lỗi bảo mật: đừng mở PR công khai trước khi báo riêng — xem SECURITY.md.
-->

## Đổi gì và vì sao

<!-- Đổi cái gì, vì sao cần. Nếu sửa lỗi: liên kết issue (Fixes #123). -->

## Đo bằng gì để biết nó đúng

<!-- Bài kiểm đỏ-trước-xanh-sau, ảnh chụp trước/sau, số đo… -->

## Kiểm thử đã chạy

Repo không có CI (GitHub Actions tắt có chủ đích) — xin chạy trên máy và đánh dấu:

- [ ] `go test ./...`
- [ ] `cd web && npx vitest run && npm run typecheck`
- [ ] `cd desktop && npx vitest run && npm run typecheck`
- [ ] Đã chạy thử trong app (`cd desktop && npm start`) — nếu đổi giao diện hay vỏ desktop

## Kiểm tra

- [ ] Commit theo conventional commit; phần thân giải thích **vì sao**.
- [ ] Chuỗi gốc tiếng Trung đi qua i18n; không chép đè `third_party/litellm`; không nới hàng rào loopback/`Host`/`Origin` của sidecar.
- [ ] Không có khóa API, `config.json`, log cá nhân hay dữ liệu truyện riêng trong diff.
- [ ] Thêm phụ thuộc mới? `desktop/scripts/gen-legal.sh /tmp/legal` vẫn chạy được (giấy phép tìm thấy).
- [ ] Đổi hành vi gọi mạng hay dữ liệu lưu trên máy? Đã cập nhật [PRIVACY.md](../PRIVACY.md) và tăng `legal-version`.
- [ ] Cập nhật [CHANGELOG.md](../CHANGELOG.md) (mục Unreleased) nếu người dùng thấy được thay đổi.
