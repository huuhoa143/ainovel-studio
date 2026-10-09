#!/usr/bin/env bash
# Ký từ trong ra ngoài một AINovel Studio.app cho Developer ID + notarize.
#
# Cách dùng:
#   desktop/scripts/sign-bundle.sh <app-path> <entitlements> <identity>
#
# Chép từ sign-lingoreup-bundle.sh của lingoreup, bỏ phần venv Python. Giữ
# nguyên các bài học sau, mỗi cái trả bằng một lượt notarize bị từ chối:
#
#   • Quét MỌI tệp theo magic number Mach-O, không theo đuôi hay thư mục.
#     `codesign --deep` không đi vào Resources/ — ShipIt trong Squirrel.framework
#     và chrome_crashpad_handler từng lọt như vậy. Ở đây Resources/bin/ainovel-cli
#     là đúng loại tệp đó: không đuôi, nằm trong Resources/.
#   • Sắp theo ĐỘ SÂU giảm dần, không chỉ `find -depth`: codesign trên tệp chạy
#     chính của một bundle kiểm cả mã lồng bên trong; trên arm64 mọi Mach-O mang
#     sẵn chữ ký ad-hoc của linker nên ký lộn xộn vẫn qua, còn x64 thì KHÔNG có
#     → "code object is not signed at all" (lingoreup v0.3.7, nhánh x64).
#   • Dylib/framework bên trong: KHÔNG gắn entitlements (chúng thừa hưởng của
#     tiến trình nạp chúng; gắn vào Electron Framework từng gây SIGTRAP trong
#     v8::CppHeap::Create).
#   • Helper .app và .app gốc: CÓ entitlements (V8 trong Renderer Helper dùng
#     MAP_JIT, thiếu allow-jit là CHECK-fail → cửa sổ trắng).
#   • .app gốc ký KHÔNG --deep: --deep ở gốc ghi đè chữ ký helper/framework vừa
#     niêm phong, macOS 26 amfi từ chối với errno 163.
#   • Mọi lần ký đều --options runtime --timestamp (Apple bắt buộc), và có thử
#     lại: timestamp.apple.com thỉnh thoảng bóp băng thông giữa hàng trăm lần ký.
#
# Sidecar Go (Resources/bin/ainovel-cli) là tệp được Electron `spawn` — tức là
# tệp chạy chính của TIẾN TRÌNH RIÊNG, hardened runtime xét entitlements của
# chính nó. Go không JIT, không nạp thư viện ngoài, nên nó ký hardened runtime
# KHÔNG entitlements: đặc quyền tối thiểu, và notarize chấp nhận.

set -euo pipefail

[[ $# -eq 3 ]] || {
  echo "usage: $0 <app-path> <entitlements> <identity>" >&2
  exit 2
}
APP="$1"
ENT="$2"
IDENTITY="$3"

[[ -d "$APP" ]] || { echo "error: không thấy app: $APP" >&2; exit 1; }
[[ -f "$ENT" ]] || { echo "error: không thấy entitlements: $ENT" >&2; exit 1; }

SIDECAR="$APP/Contents/Resources/bin/ainovel-cli"
[[ -f "$SIDECAR" ]] || {
  echo "error: thiếu sidecar trong gói: $SIDECAR" >&2
  echo "       forge.config.ts phải có extraResource ['resources/bin', ...] và build-sidecar.sh phải chạy trước" >&2
  exit 1
}

COMMON=(--force --options runtime --timestamp --sign "$IDENTITY")

# is_macho <path> — đúng nếu 4 byte đầu là magic Mach-O.
#   cffaedfe/feedfacf  64-bit LE/BE     cefaedfe/feedface  32-bit LE/BE
#   cafebabe/bebafeca  fat / universal
is_macho() {
  local magic
  magic="$(head -c 4 "$1" 2>/dev/null | xxd -p)" || return 1
  case "$magic" in
    cffaedfe|feedfacf|cefaedfe|feedface|cafebabe|bebafeca) return 0 ;;
    *) return 1 ;;
  esac
}

# codesign_retry — backoff tăng dần (~1 phút tổng), lần cuối hiện stderr để lỗi
# thật (không phải nghẽn timestamp) còn đọc được.
codesign_retry() {
  local attempt
  local backoff=(0 3 5 8 10 12 15 15)
  for attempt in 0 1 2 3 4 5 6 7; do
    (( attempt > 0 )) && sleep "${backoff[$attempt]}"
    if /usr/bin/codesign "$@" >/dev/null 2>&1; then
      return 0
    fi
  done
  /usr/bin/codesign "$@" && return 0
  return 1
}

# ─── 1. Ký mọi Mach-O, sâu nhất trước ──────────────────────────────────
echo "▶ Quét Mach-O trong gói…"
mach_count=0
sign_failed=0
while IFS= read -r -d '' f; do
  [[ -L "$f" ]] && continue
  is_macho "$f" || continue
  codesign_retry "${COMMON[@]}" "$f" || {
    echo "  WARN: ký thất bại: $f" >&2
    sign_failed=$((sign_failed + 1))
  }
  mach_count=$((mach_count + 1))
done < <(find "$APP" -type f -print0 | perl -0 -e '
  my @f = grep { length } <STDIN>;
  chomp(@f);
  # Sâu nhất trước; cùng độ sâu thì theo tên cho ổn định giữa các lần chạy.
  print join("\0", sort { ($b =~ tr{/}{}) <=> ($a =~ tr{/}{}) or $a cmp $b } @f), "\0";
')
echo "  Đã ký $mach_count Mach-O ($sign_failed lỗi)"
(( sign_failed == 0 )) || { echo "error: $sign_failed lần ký Mach-O thất bại" >&2; exit 1; }

# ─── 1b. Sidecar phải mang hardened runtime ────────────────────────────
# Notarize từ chối tệp thực thi thiếu runtime; kiểm ở đây để lỗi hiện sớm và rõ
# thay vì sau 10 phút chờ Apple.
sidecar_info="$(/usr/bin/codesign -dv --verbose=2 "$SIDECAR" 2>&1 || true)"
grep -q "flags=.*runtime" <<<"$sidecar_info" || {
  echo "error: $SIDECAR không có hardened runtime:" >&2
  echo "$sidecar_info" >&2
  exit 1
}
grep -q "Authority=$IDENTITY" <<<"$sidecar_info" || {
  echo "error: $SIDECAR không ký bằng '$IDENTITY':" >&2
  echo "$sidecar_info" >&2
  exit 1
}
echo "  sidecar: hardened runtime + $IDENTITY"

# ─── 2. Niêm phong framework (không entitlements, không --deep) ─────────
echo "▶ Ký framework lồng"
find "$APP/Contents/Frameworks" -mindepth 1 -maxdepth 1 -type d -name "*.framework" -print0 \
  | while IFS= read -r -d '' fw; do
      codesign_retry "${COMMON[@]}" "$fw" || { echo "error: ký framework thất bại: $fw" >&2; exit 1; }
    done

# ─── 3. Helper .app (CÓ entitlements) ──────────────────────────────────
echo "▶ Ký helper .app (kèm entitlements)"
find "$APP/Contents/Frameworks" -mindepth 1 -maxdepth 1 -type d -name "*.app" -print0 \
  | while IFS= read -r -d '' helper; do
      codesign_retry "${COMMON[@]}" --entitlements "$ENT" "$helper" \
        || { echo "error: ký helper thất bại: $helper" >&2; exit 1; }
    done

# ─── 4. .app gốc (CÓ entitlements, KHÔNG --deep) ───────────────────────
echo "▶ Ký .app gốc"
codesign_retry "${COMMON[@]}" --entitlements "$ENT" "$APP"

# ─── 5. Kiểm sâu ───────────────────────────────────────────────────────
echo "▶ codesign --verify --deep --strict"
/usr/bin/codesign --verify --deep --strict --verbose=2 "$APP"

# ─── 6. Quét lại: không Mach-O nào được phép còn chưa ký ───────────────
# codesign --verify không phải lúc nào cũng đi vào Resources/, còn notarize thì có.
echo "▶ Quét Mach-O còn chưa ký"
unsigned=0
while IFS= read -r -d '' f; do
  [[ -L "$f" ]] && continue
  is_macho "$f" || continue
  if /usr/bin/codesign -dv "$f" 2>&1 | grep -q "not signed"; then
    echo "  CHƯA KÝ: $f" >&2
    unsigned=$((unsigned + 1))
  fi
done < <(find "$APP" -type f -print0)
(( unsigned == 0 )) || { echo "error: còn $unsigned Mach-O chưa ký" >&2; exit 1; }

echo "✔ Đã ký: $APP"
