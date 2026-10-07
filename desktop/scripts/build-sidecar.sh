#!/usr/bin/env bash
# Dựng sidecar Go + giao diện web vào desktop/resources/ cho MỘT nền tảng/kiến trúc.
#
# Cách dùng:
#   desktop/scripts/build-sidecar.sh <darwin|windows> <arm64|amd64> <version> [--skip-web]
#
# Đầu ra (forge chép nguyên hai thư mục này vào <Resources>/ qua `extraResource`):
#   desktop/resources/bin/ainovel-cli[.exe]   Go, CGO_ENABLED=0, đúng GOOS/GOARCH yêu cầu
#   desktop/resources/web/                    bản sao web/out
#
# `--skip-web` chỉ bỏ bước `npm ci && npm run build` trong web/ — vẫn CHÉP web/out.
# release.sh dựng web một lần rồi gọi lại script này với `--skip-web` cho các
# kiến trúc sau: đầu ra `next build` là tệp tĩnh, giống hệt nhau cho mọi arch.

set -euo pipefail

usage() {
  echo "usage: $0 <darwin|windows> <arm64|amd64> <version> [--skip-web]" >&2
  exit 2
}

SKIP_WEB=0
ARGS=()
for a in "$@"; do
  case "$a" in
    --skip-web) SKIP_WEB=1 ;;
    -h|--help)  usage ;;
    -*)         echo "error: cờ lạ: $a" >&2; usage ;;
    *)          ARGS+=("$a") ;;
  esac
done
(( ${#ARGS[@]} == 3 )) || usage

GOOS_T="${ARGS[0]}"
GOARCH_T="${ARGS[1]}"
VERSION="${ARGS[2]}"
case "$GOOS_T"   in darwin|windows) ;; *) echo "error: GOOS phải là darwin|windows (nhận: $GOOS_T)" >&2; exit 2 ;; esac
case "$GOARCH_T" in arm64|amd64)    ;; *) echo "error: GOARCH phải là arm64|amd64 (nhận: $GOARCH_T)" >&2; exit 2 ;; esac
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$ ]] \
  || { echo "error: version phải dạng X.Y.Z (nhận: $VERSION)" >&2; exit 2; }

DESKTOP="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$DESKTOP/.." && pwd)"
BIN_DIR="$DESKTOP/resources/bin"
WEB_DIR="$DESKTOP/resources/web"

EXE="ainovel-cli"
[[ "$GOOS_T" == "windows" ]] && EXE="ainovel-cli.exe"

# ─── 1. Giao diện web ───────────────────────────────────────────────────
# `npm ci` chứ không `npm install`: dựng đúng cây phụ thuộc đã khóa — cùng lý do
# với .goreleaser.yml. `cd` trong subshell để không rò thư mục làm việc ra ngoài.
if (( SKIP_WEB == 0 )); then
  echo "▶ web: npm ci && npm run build"
  (cd "$REPO/web" && npm ci && npm run build)
else
  echo "▶ web: bỏ qua bước build (--skip-web), chỉ chép web/out"
fi
[[ -f "$REPO/web/out/index.html" ]] || {
  echo "error: không thấy $REPO/web/out/index.html — chạy lại không kèm --skip-web" >&2
  exit 1
}

# ─── 2. Nhị phân Go ─────────────────────────────────────────────────────
# Xóa SẠCH bin/ trước khi build: forge chép cả thư mục, nên một ainovel-cli của
# arch trước (hay một .exe sót lại) sẽ đi vào gói của arch sau mà không ai báo.
rm -rf "$BIN_DIR"
mkdir -p "$BIN_DIR"

COMMIT="$(git -C "$REPO" rev-parse --short HEAD 2>/dev/null || echo unknown)"
# Ngày của commit chứ không phải giờ build — như `{{.CommitDate}}` trong
# .goreleaser.yml: hai lần build cùng một commit cho ra cùng chuỗi phiên bản.
DATE="$(git -C "$REPO" log -1 --format=%cI 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "▶ go build $GOOS_T/$GOARCH_T v$VERSION ($COMMIT)"
# GOWORK=off: như Dockerfile — một go.work lạc trên máy build không được đổi
# cây module của bản phát hành.
(
  cd "$REPO"
  CGO_ENABLED=0 GOWORK=off GOOS="$GOOS_T" GOARCH="$GOARCH_T" \
    go build -trimpath \
      -ldflags "-s -w -X main.version=$VERSION -X main.commit=$COMMIT -X main.date=$DATE" \
      -o "$BIN_DIR/$EXE" ./cmd/ainovel-cli
)

# Kiểm arch của chính tệp vừa ra, không tin cờ: một GOARCH gõ sai hay bị biến
# môi trường đè thì đây là chỗ cuối cùng bắt được trước khi nó vào gói.
FILE_OUT="$(file -b "$BIN_DIR/$EXE")"
case "$GOOS_T/$GOARCH_T" in
  darwin/arm64)  want="Mach-O 64-bit executable arm64" ;;
  darwin/amd64)  want="Mach-O 64-bit executable x86_64" ;;
  windows/amd64) want="PE32+ executable" ;;
  windows/arm64) want="PE32+ executable" ;;
esac
[[ "$FILE_OUT" == *"$want"* ]] || {
  echo "error: $EXE sai định dạng. Muốn: '$want'. Thực tế: '$FILE_OUT'" >&2
  exit 1
}
if [[ "$GOOS_T" == "windows" ]]; then
  if [[ "$GOARCH_T" == "amd64" ]]; then pe_arch="x86-64"; else pe_arch="Aarch64"; fi
  [[ "$FILE_OUT" == *"$pe_arch"* ]] || {
    echo "error: $EXE không phải $pe_arch: '$FILE_OUT'" >&2
    exit 1
  }
fi
echo "  $EXE: $FILE_OUT"

# ─── 3. Chép web/out ────────────────────────────────────────────────────
rm -rf "$WEB_DIR"
mkdir -p "$WEB_DIR"
# `cp -R out/. dst` chép NỘI DUNG (kể cả tệp chấm), không tạo thêm tầng out/.
cp -R "$REPO/web/out/." "$WEB_DIR/"
echo "  web: $(find "$WEB_DIR" -type f | wc -l | tr -d ' ') tệp → $WEB_DIR"

echo "✔ sidecar $GOOS_T/$GOARCH_T sẵn sàng trong $DESKTOP/resources/"
