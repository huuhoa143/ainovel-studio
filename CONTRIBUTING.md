# Đóng góp

> **English:** this project is developed in Vietnamese — the UI, prompts and reference docs are
> all localised, and there is no English UI layer yet. Issues and pull requests in English are
> welcome; the code comments and commit messages are Vietnamese.

Cảm ơn bạn đã ghé. Trang này nói bốn thứ: gửi đóng góp **đi đâu**, dựng app từ nguồn thế nào,
phát hành ra sao, và những luật sẽ làm PR của bạn đỏ mà không nhìn ra ngay.

Người chỉ muốn **dùng** app thì không cần đọc trang này — [tải bản phát hành](https://github.com/huuhoa143/ainovel-studio/releases/latest).

## Trước hết: đóng góp này nên đi đâu?

Đây là **bản fork tiếng Việt** của [voocel/ainovel-cli](https://github.com/voocel/ainovel-cli).
Engine, kiến trúc và thiết kế gốc thuộc về dự án upstream.

- **Sửa engine, sửa lỗi lõi, thêm khả năng cho tác tử** → cân nhắc gửi thẳng **upstream** trước.
  Cả cộng đồng cùng hưởng, và fork này rồi cũng nhận lại khi đồng bộ.
- **Việt hóa, studio (`internal/serve` + `web/`), app desktop (`desktop/`), tài liệu tiếng
  Việt** → gửi vào đây. Đó là phần fork này thật sự sở hữu.

Không chắc thì cứ mở một issue hỏi trước, đừng viết code rồi mới hỏi.

## App gồm những gì

Sản phẩm duy nhất là app desktop **AINovel Studio**. Nó gói ba phần, mỗi phần một thư mục:

| Thư mục | Là gì | Ngôn ngữ |
|---|---|---|
| `cmd/ainovel-cli`, `internal/` | **sidecar**: engine + HTTP API (`ainovel-cli serve`), chỉ nghe loopback | Go |
| `web/` | giao diện studio, xuất tĩnh ra `web/out` | Next.js / TypeScript |
| `desktop/` | vỏ Electron: spawn sidecar, mở cửa sổ, menu, tự cập nhật | TypeScript |

Nhị phân sidecar vẫn mang tên `ainovel-cli` (di sản từ upstream), nhưng nó không còn là một CLI
cho người dùng: app spawn nó với `serve --root <userData>/books --web <web> --config
<userData>/config.json`, và gọi nó kiểu khác thì nó chỉ báo "mở app để dùng" rồi thoát.

## Dựng và chạy bản dev

Cần **Go 1.25.5+** (theo `go.mod`) và **Node** kèm `npm` (Node 20 LTS trở lên).

```bash
git clone https://github.com/huuhoa143/ainovel-studio && cd ainovel-studio

# 1. Giao diện → web/out
cd web && npm ci && npm run build && cd ..

# 2. Sidecar → ./ainovel-cli ở gốc repo
go build -o ainovel-cli ./cmd/ainovel-cli

# 3. App
cd desktop && npm ci && npm start
```

Ở bản dev, app tìm sidecar ở `<repo>/ainovel-cli` và giao diện ở `<repo>/web/out` (xem
`resolveSidecarPaths` trong `desktop/src/main/paths.ts`); đặt `AINOVEL_BIN` / `AINOVEL_WEB` để
trỏ đi chỗ khác. Sửa Go thì dựng lại bước 2, sửa giao diện thì dựng lại bước 1, rồi khởi động
lại app.

> **Bản dev dùng chung thư mục dữ liệu với app đã cài.** Cả hai đều tên "AINovel Studio" nên
> cùng `~/Library/Application Support/AINovel Studio` (macOS) / `%APPDATA%\AINovel Studio`
> (Windows) — cùng `config.json`, cùng `books/`. App cũng giữ khóa một-phiên-bản, nên đang mở
> bản đã cài thì `npm start` không lên. Muốn tách hẳn, truyền cờ Chromium `--user-data-dir`
> (đúng cờ `desktop/scripts/smoke.sh` dùng để chạy cô lập):
>
> ```bash
> cd desktop && npx electron-forge start -- --user-data-dir=/tmp/ainovel-dev
> ```

### Xem giao diện mà không tốn tiền gọi model

Dựng một tác phẩm mẫu phủ mọi bề mặt của studio, rồi trỏ bản dev vào nó:

```bash
go run ./cmd/seed-demo /tmp/ainovel-dev/books/tac-pham-mau
cd desktop && npx electron-forge start -- --user-data-dir=/tmp/ainovel-dev
```

Chỉ sửa giao diện thì vòng lặp nhanh hơn là `next dev` (hot reload) nói chuyện với một sidecar
chạy thẳng:

```bash
./ainovel-cli serve --addr 127.0.0.1:8420 --root /tmp/ainovel-dev/books \
  --config /tmp/ainovel-dev/config.json
cd web && npm run dev            # http://127.0.0.1:8421, proxy /api sang 8420
cd web && npm run dev:mock       # hoặc: dữ liệu giả, không cần sidecar
```

`--config` nhận đường dẫn **tuyệt đối** và là tệp duy nhất sidecar đọc/ghi; `--addr` phải là
loopback.

## Kiểm thử

```bash
go test ./...                    # bắt buộc xanh
cd web && npx vitest run         # giao diện
cd web && npm run typecheck      # tsc --noEmit
cd desktop && npx vitest run     # vỏ Electron (không cần chạy Electron)
cd desktop && npm run typecheck
```

**Repo không có CI.** GitHub Actions bị tắt có chủ đích (fork này từng xóa hết workflow, xem
commit `54f1da4`), nên không có máy nào chạy kiểm thử thay bạn: mọi lệnh trên phải xanh **trên máy
bạn** trước khi mở PR, và mẫu PR sẽ hỏi bạn đã chạy những lệnh nào. Xin đừng thêm workflow trong
PR.

**Thêm phụ thuộc?** Mỗi lần build, `desktop/scripts/gen-legal.sh` sinh danh sách giấy phép bên
thứ ba đóng gói vào app, và **dừng build** nếu một gói không có tệp giấy phép hay giấy phép không
nhận ra được. Chạy thử `desktop/scripts/gen-legal.sh /tmp/legal` sau khi thêm module Go hay gói
npm chạy-thật. Đổi chỗ app gọi mạng hay dữ liệu nó lưu trên máy thì phải cập nhật
[PRIVACY.md](PRIVACY.md) (và tăng `legal-version`).

## Phát hành

Chỉ người bảo trì phát hành. Bản phát hành lên
[GitHub Releases](https://github.com/huuhoa143/ainovel-studio/releases) và app đã cài tự cập
nhật từ đó.

```bash
desktop/scripts/release.sh 1.2.3 --dry-run       # tập dượt: build + đóng gói + smoke, không ký,
                                                 # không đụng git/remote
desktop/scripts/release.sh 1.2.3                 # phát hành thật
desktop/scripts/release.sh 1.2.3 --resume        # tiếp sau khi hỏng giữa chừng
desktop/scripts/release.sh 1.2.3 --skip-windows  # chỉ macOS
```

`release.sh` là lối vào **duy nhất** bump phiên bản, tạo tag `vX.Y.Z` và tạo release. Nó:

- chạy trên **Mac Apple Silicon**, từ nhánh `main` (đổi bằng `RELEASE_BRANCH`);
- dựng macOS **arm64 và x64** (DMG + ZIP, ký Developer ID, notarize, staple, smoke từng bản — bản
  x64 smoke qua Rosetta 2), rồi dựng chéo **Windows x64** (NSIS, chưa ký);
- chỉ đẩy nhánh + tag lên origin ở bước cuối, ngay trước `gh release create`, nên hỏng ở bước nào
  trước đó thì origin y nguyên.

Thiết lập một lần mỗi máy:

- Identity ký "Developer ID Application" trong Keychain, và profile notarytool
  **`LINGOREUP_NOTARIZE`** (`xcrun notarytool store-credentials LINGOREUP_NOTARIZE …`).
- `npm install -g create-dmg@8` (bản npm của sindresorhus — **không** phải `brew install
  create-dmg`, bản đó làm hỏng chữ ký .app trong DMG), `brew install gh jq go`.
- `gh` đăng nhập tài khoản **huuhoa143**. Máy có biến `GITHUB_TOKEN` của tài khoản khác sẽ đè lên
  `gh auth switch`, nên script gỡ nó ở mọi lệnh `gh`; tự gõ `gh` thì cũng chạy
  `env -u GITHUB_TOKEN gh …`.

Bản Windows dựng chéo trên Mac **chưa được chạy thử**, và release notes mang một dòng nhắc điều đó.
Trên một máy Windows, `desktop/scripts/release.ps1` dựng lại, smoke, thay bộ cài trong release
đã có và xóa dòng nhắc:

```powershell
git checkout v1.2.3
powershell -ExecutionPolicy Bypass -File desktop\scripts\release.ps1 1.2.3
```

Chi tiết từng bước nằm ở phần đầu mỗi script trong `desktop/scripts/`.

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

### 3. Đừng nới hàng rào của sidecar

Sidecar giữ khóa API và khởi động được engine, nên nó chỉ lắng nghe trên loopback, và
`internal/serve/rao.go` kiểm cả `Host` / `Origin` cộng một header chống CSRF — mọi trang web
đang mở trong trình duyệt đều gọi được tới `127.0.0.1`. Hàng rào đó thay cho việc xác thực.

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

Hai quy ước nữa:

- **Giữ diff rebase nhỏ.** Lớp i18n dùng chuỗi nguồn làm msgid chính là để fork bám được một
  upstream đi nhanh. Xin đừng "dọn cho sạch" thành khóa tường minh — lý do đầy đủ ở
  [docs/i18n.md](docs/i18n.md).
- **Chú thích mang LÝ DO.** Mã trong repo này ghi *vì sao*, thường kèm luôn phép đo đã dẫn tới
  quyết định. Viết theo nếp đó là quy ước của nhà.

## Báo lỗi

Issues đang mở, có sẵn mẫu báo lỗi và đề xuất tính năng; câu hỏi cách dùng hợp hơn ở
[Discussions](https://github.com/huuhoa143/ainovel-studio/discussions). Tham gia dự án nghĩa là
đồng ý với [Bộ quy tắc ứng xử](CODE_OF_CONDUCT.md). Kèm log giúp rất nhiều: trong app, **Tệp → Mở thư mục log** (`sidecar.log` và
`main.log`) — nhớ xóa khóa API nếu lỡ dán vào đâu đó. Lỗi bảo mật thì **đừng** mở issue công
khai — xem [SECURITY.md](SECURITY.md).
