# Đóng góp

> **English:** this project is developed in Vietnamese — the UI, prompts and reference docs are
> all localised, and there is no English UI layer yet. Issues and pull requests in English are
> welcome; the code comments and commit messages are Vietnamese.

Cảm ơn bạn đã ghé. Trang này nói ba thứ: gửi đóng góp **đi đâu**, dựng dự án thế nào, và những
luật sẽ làm PR của bạn đỏ mà không nhìn ra ngay.

## Trước hết: đóng góp này nên đi đâu?

Đây là **bản fork tiếng Việt** của [voocel/ainovel-cli](https://github.com/voocel/ainovel-cli).
Engine, kiến trúc và thiết kế gốc thuộc về dự án upstream.

- **Sửa engine, sửa lỗi lõi, thêm khả năng cho tác tử** → cân nhắc gửi thẳng **upstream** trước.
  Cả cộng đồng cùng hưởng, và fork này rồi cũng nhận lại khi đồng bộ.
- **Việt hóa, web studio (`internal/serve` + `web/`), tài liệu tiếng Việt** → gửi vào đây. Đó là
  phần fork này thật sự sở hữu.

Không chắc thì cứ mở một issue hỏi trước, đừng viết code rồi mới hỏi.

## Dựng và chạy

Cần **Go 1.25.5+**. Web studio cần thêm **Node** (chỉ khi bạn đụng tới giao diện).

```bash
git clone https://github.com/huuhoa143/ainovel-studio && cd ainovel-studio
go build -o ainovel-cli ./cmd/ainovel-cli
./ainovel-cli                       # lần đầu sẽ dẫn: provider → API key → base URL → model

# giao diện web
cd web && npm ci && npm run build && cd ..
./ainovel-cli serve --web web/out   # mở http://127.0.0.1:8420
```

Muốn xem studio mà **không** tốn tiền gọi model: dựng một tác phẩm mẫu.

```bash
go run ./cmd/seed-demo /tmp/thu/tac-pham-mau
./ainovel-cli serve --root /tmp/thu --web web/out
```

## Kiểm thử

```bash
go test ./...                    # bắt buộc xanh
cd web && npm test               # vitest
cd web && npm run typecheck      # tsc --noEmit
```

## Bốn luật hay làm PR đỏ

Bốn thứ dưới đây đều có bộ canh tự động. Chúng tồn tại vì mỗi cái đã hỏng **thật** một lần.

### 1. Chuỗi có nguyên bản tiếng Trung phải đi qua i18n

Mọi chuỗi hiển thị có nguyên bản tiếng Trung phải qua `i18n.F` / `i18n.T`.
`internal/i18n/quetnguon_test.go` soi mã nguồn và bắt cả dấu câu toàn phần lọt vào chuỗi không
có chữ Hán — loại lỗi vĩnh viễn không vào được catalog nên không phép đo nào thấy.

**Ngoại lệ duy nhất:** `internal/serve` dùng tiếng Việt trực tiếp. Lý do đầy đủ nằm ở đầu
`internal/serve/serve.go`; tóm lại là upstream không có `serve`, nên bọc i18n ở đó đòi tự bịa
msgid tiếng Trung cho một phép đối chiếu không tồn tại.

### 2. Đừng chép đè `third_party/litellm`

Thư mục đó là bản **đã vá**, nối vào bằng `replace` trong `go.mod`. Bản vá xử lý ca gateway phát
đủ `finish_reason` rồi đóng kết nối mà không gửi `data: [DONE]`; thiếu nó thì engine coi một lượt
sinh hoàn chỉnh là bị cắt và thử lại bảy lần — đo trên gateway thật: không cuốn nào viết nổi
chương đầu.

Đồng bộ upstream mới thì phải **áp lại hai khối sửa**. Đọc `third_party/README.md` trước khi
chạm vào, và giữ cả hai bài trong `internal/e2e/stream_sentinel_test.go`.

### 3. Đừng nới hàng rào ghi của studio

`internal/serve/rao.go` chỉ mắc nhóm route ghi khi địa chỉ lắng nghe là loopback, và kiểm cả
`Host` / `Origin` cộng một header chống CSRF. Studio giữ khóa API và khởi động được engine, nên
hàng rào địa chỉ chính là thứ thay cho việc xác thực.

Nếu đề xuất của bạn cần nới nó, hãy mở issue bàn trước — nó là quyết định kiến trúc, không phải
một dòng cấu hình.

### 4. Tiếng Việt là ràng buộc bố cục, không phải bản dịch

Trong `web/`: `line-height` thân bài ≥ 1.72 (khổ đọc dài ≥ 1.78) vì dấu tiếng Việt xếp hai tầng;
cột nhãn rộng hơn phản xạ 20–30%; chữ hoa có dấu cần chừa chỗ phía trên. Chi tiết và lý do trong
`DESIGN.md`.

## Commit và pull request

Lịch sử repo dùng conventional commit tiếng Việt, và phần thân **giải thích VÌ SAO**, không chỉ
liệt kê cái gì đã đổi:

```
fix(web): hồ sơ tác phẩm đọc được và dùng được — markdown thành cấu trúc
```

Một PR tốt ở repo này trả lời được: đổi cái gì, vì sao cần, và **đo bằng gì để biết nó đúng**.
Nếu sửa một lỗi, hãy kèm bài kiểm đỏ-trước-xanh-sau.

## Báo lỗi

Issues đang mở. Lỗi bảo mật thì **đừng** mở issue công khai — xem [SECURITY.md](SECURITY.md).
