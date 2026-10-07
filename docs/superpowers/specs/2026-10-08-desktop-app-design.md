# AINovel Studio — app desktop (Electron)

Ngày: 2026-10-08 · Trạng thái: đã duyệt

## Mục tiêu

Người dùng ít rành kỹ thuật tải bản cài từ GitHub Releases của `huuhoa143/ainovel-studio`,
cài, mở app, dán API key là viết truyện được — không terminal, không build. App tự cập nhật.

Thành công khi: trên một máy Mac sạch (arm64 hoặc Intel) và một máy Windows x64 sạch, người
dùng đi trọn vòng cài → nhập key → tạo truyện → chạy một chương → xuất EPUB mà không gặp
cảnh báo nào ngoài SmartScreen một lần trên Windows.

## Quyết định đã chốt

| Mục | Chốt |
|---|---|
| Khung | Electron + Electron Forge + Vite, giống lingoreup (`/Users/robin/Personal/reclip/VideoCaptionerSystem/lingoreup`) |
| Nền tảng | macOS arm64 + x64 (DMG + ZIP), Windows x64 (NSIS). Không Linux |
| Ký | macOS: `Developer ID Application: Chien Bui Minh (CCQUC3AGRH)`, notarize bằng keychain profile `LINGOREUP_NOTARIZE`. Windows: chưa ký |
| Code | `desktop/` trong repo này. Dùng `npm` (giống `web/`), không pnpm |
| Phát hành | GitHub Releases của `huuhoa143/ainovel-studio` (public), tag `vX.Y.Z`, bản đầu `v1.0.0` |
| Cập nhật | electron-updater, provider github, owner `huuhoa143`, repo `ainovel-studio` |
| Truyện | `<userData>/books` (macOS `~/Library/Application Support/AINovel Studio/books`, Windows `%APPDATA%\AINovel Studio\books`) |
| Config | `~/.ainovel/config.json` — chung với CLI; `PUT /api/config` đã ghi vào đó |
| Lần đầu | Không nhúng key. `needs_setup` → mở thẳng màn nhập key |
| Tên | productName `AINovel Studio`, appId `com.huuhoa143.ainovelstudio`, npm name `ainovel-studio-desktop` |

## Kiến trúc

Electron là vỏ mỏng, không có renderer riêng. `BrowserWindow` tải
`http://127.0.0.1:<cổng>/` do sidecar Go (`ainovel-cli serve`) phục vụ; giao diện vẫn là `web/out`.

```
<Resources>/
  bin/ainovel-cli[.exe]   ← Go, CGO_ENABLED=0, đúng arch của gói
  web/                    ← bản sao web/out
  app-update.yml          ← hook forge ghi (mac); NSIS maker tự sinh (win)
```

### Hợp đồng sidecar (Go ↔ Electron) — KHÔNG ĐƯỢC LỆCH

- Lệnh: `ainovel-cli serve --addr 127.0.0.1:0 --root <userData>/books --web <Resources>/web --exit-on-stdin-close`, cwd = `<userData>`.
- Sau khi `net.Listen` thành công (trước `Serve`), in ra **stdout** đúng một dòng:
  `AINOVEL_READY http://127.0.0.1:<cổng thật>` + `\n`. Các dòng log khác giữ nguyên.
- `--addr` với cổng `0` phải hoạt động (in cổng thật đã được cấp).
- `--exit-on-stdin-close`: một goroutine đọc stdin tới EOF/lỗi → tắt êm.
- Tắt êm (SIGINT, SIGTERM, hoặc stdin đóng): `http.Server.Shutdown` (timeout 5s) rồi đóng
  engine/nhả khóa truyện (`dongTatCa`), thoát mã 0.
- Lỗi khởi động (cổng bận, root không ghi được…): ghi stderr, thoát mã ≠ 0, không in `AINOVEL_READY`.

### Module trong `desktop/src/main/`

- `paths.ts` — đường dẫn file nhị phân, thư mục web, thư mục dữ liệu. Bản đóng gói:
  `process.resourcesPath/bin/ainovel-cli[.exe]`, `process.resourcesPath/web`. Dev: biến môi
  trường `AINOVEL_BIN`/`AINOVEL_WEB` nếu có, không thì `<repo>/ainovel-cli` và `<repo>/web/out`.
- `sidecar.ts` — spawn theo hợp đồng trên; stdin để `pipe` và giữ mở; parse `AINOVEL_READY`
  (timeout 20s); stdout+stderr ghi vào `<userData>/logs/sidecar.log` (cắt khi > 5MB) và giữ
  vòng đệm 200 dòng cuối; phát sự kiện `exit` khi chết bất ngờ; `stop()` đóng stdin, chờ 5s,
  rồi `kill()`. Không phụ thuộc Electron để test được bằng vitest với nhị phân giả.
- `window.ts` — một cửa sổ (nhớ kích thước/vị trí trong `<userData>/window-state.json`),
  `contextIsolation`, `sandbox`, không `nodeIntegration`, không preload. Chặn `will-navigate`
  ra ngoài origin sidecar; `setWindowOpenHandler` → `shell.openExternal` cho http(s), deny còn lại.
  Tải tệp (EPUB/TXT) dùng hành vi mặc định (hộp lưu file).
- `errorPage.ts` — trang HTML (data URL hoặc file tĩnh trong asar) khi sidecar không lên hoặc
  chết: thông báo tiếng Việt, 30 dòng log cuối, nút "Thử lại" (khởi động lại sidecar) và
  "Mở thư mục log".
- `menu.ts` — menu native: App (About, Kiểm tra cập nhật, Quit), Edit (copy/paste chuẩn — bắt
  buộc để Cmd+C/V chạy trên mac), View (reload, zoom, toggle devtools), "Tệp": Mở thư mục
  truyện, Mở thư mục log.
- `updater.ts` — electron-updater: kiểm tra khi mở app (chỉ bản đóng gói) và từ menu, tải
  ngầm, xong thì hộp thoại "Khởi động lại để cập nhật". Lỗi mạng chỉ ghi log, không làm phiền.
- `main.ts` — single-instance lock (bản thứ hai focus cửa sổ cũ), dựng menu, khởi động
  sidecar, mở cửa sổ khi ready, dừng sidecar ở `before-quit` (chặn quit tới khi dừng xong).
  macOS: đóng cửa sổ cuối thì thoát app luôn (đơn giản cho người dùng ít rành máy tính).

### Bảo mật

Fuses như lingoreup (RunAsNode off, EnableNodeOptionsEnvironmentVariable off,
EnableNodeCliInspectArguments off, OnlyLoadAppFromAsar on, EnableEmbeddedAsarIntegrityValidation on).
Sidecar chỉ nghe loopback; studio ghi được vì `--addr` là loopback (`laDiaChiCucBo`) và
Origin/Host của trang khớp. Không đóng gói gì từ `.ainovel/` hay `output/`.

## Thay đổi lõi Go (`internal/serve`, `cmd/ainovel-cli`)

1. Dòng `AINOVEL_READY` sau `Listen` (hợp đồng trên).
2. Cờ `--exit-on-stdin-close` + bắt SIGINT/SIGTERM → tắt êm.
3. Test: cổng 0 in đúng cổng thật; đóng stdin → hàm serve trả về và khóa truyện được nhả.

## Thay đổi web (`web/`)

Khi `GET /api/config` trả `needs_setup: true`, trang mở thẳng "Cài đặt chung" ở phần
"Model & khóa API", kèm một dòng hướng dẫn ngắn (lấy key ở đâu, dán vào đâu). Xác minh lưu
key xong tạo/chạy truyện được ngay mà không khởi động lại sidecar. Có test vitest.

## Build & phát hành (`desktop/scripts/`)

- `build-sidecar.sh <darwin|windows> <arm64|amd64> <version>` — `npm ci && npm run build` trong
  `web/` (bỏ qua nếu `--skip-web`), `go build -trimpath -ldflags "-s -w -X main.version=…
  -X main.commit=… -X main.date=…"` → `desktop/resources/bin/ainovel-cli[.exe]`, chép
  `web/out` → `desktop/resources/web/`. Xóa bin cũ trước khi build để không lẫn arch.
- `forge.config.ts` — `extraResource: ['resources/bin', 'resources/web']`, maker ZIP (darwin),
  maker NSIS (`@electron-addons/electron-forge-maker-nsis`, win32, updater url
  `https://github.com/huuhoa143/ainovel-studio/releases/latest/download`), hook ghi
  `app-update.yml` (copy mẫu lingoreup), `updaterCacheDirName: ainovel-studio-updater`.
- `release.sh X.Y.Z [--dry-run] [--resume]` (chạy trên Mac arm64) — rút gọn từ lingoreup
  `local-release.sh` + `release-with-x64.sh`: prereqs → bump `desktop/package.json` + commit + tag
  `vX.Y.Z` → với mỗi arch (arm64, x64): build-sidecar → `electron-forge package/make --arch` →
  ký từ trong ra ngoài (`bin/ainovel-cli` trước, hardened runtime, `desktop/entitlements.plist`
  copy từ lingoreup) → notarize + staple .app → ZIP (ditto) + DMG (`create-dmg@8`) → notarize +
  staple DMG → `latest-mac.yml` hai arch (arm64 đứng trước) → `gh release create` + upload.
  Không có venv/cythonize/release-gate/announcement/submodule.
  `gh` luôn chạy với `env -u GITHUB_TOKEN` (máy này có GITHUB_TOKEN trỏ sai tài khoản).
- Windows: thử `electron-forge make --platform=win32 --arch=x64` từ Mac trước. Được thì
  `release.sh` làm luôn phần Windows (upload `Setup.exe`, `latest.yml`, `.blockmap`). Không
  được thì `release.ps1` chạy trên máy Windows, upload vào cùng release.
- Tên tệp: `AINovel-Studio-<ver>-arm64.dmg|.zip`, `AINovel-Studio-<ver>-x64.dmg|.zip`,
  `AINovel-Studio-Setup-<ver>.exe`.

## README

Mục "Tải về & cài đặt" ở đầu `README.md` (và `README.en.md`): link
`https://github.com/huuhoa143/ainovel-studio/releases/latest`, chọn tệp nào cho máy nào
(Mac M-series/Intel, Windows), Windows SmartScreen "More info → Run anyway", lần đầu dán key.
Cách build từ nguồn giữ nguyên bên dưới.

## Kiểm thử

- Go: test hợp đồng sidecar.
- Desktop: vitest cho `sidecar.ts` (nhị phân giả bằng node script: in READY, chết, không in READY,
  bỏ qua stdin), `paths.ts`.
- `desktop/scripts/smoke.sh <path .app>` — mở app đã đóng gói, chờ `AINOVEL_READY` trong
  `sidecar.log`, `curl /api/workshop` trả 200.
- Checklist tay trên máy sạch: cài → key → tạo truyện → chạy 1 chương → xuất EPUB → cập nhật lên bản giả.

## Ngoài phạm vi

Linux, ký Windows, chọn thư mục truyện, nhúng web vào nhị phân, TUI/CLI trong app, telemetry,
nhiều cửa sổ, IPC/preload.
