#!/usr/bin/env bash
# Mở một AINovel Studio.app đã đóng gói và kiểm nó chạy THẬT, không chỉ "không sập":
#
#   1. Mở app qua LaunchServices (`open -n -g`, như người dùng bấm đúp).
#   2. Chờ dòng `AINOVEL_READY http://127.0.0.1:<cổng>` MỚI trong
#      "<userData>/logs/sidecar.log" — tức sidecar Go đã spawn, đã Listen.
#   3. `curl /api/workshop` trên cổng đó phải trả 200 — giao diện có API để nói chuyện.
#   4. Thoát app theo đường Cmd+Q (AppleScript `quit` → before-quit → stop sidecar).
#   5. Không được còn tiến trình ainovel-cli mồ côi của gói này.
#
# Cách dùng:
#   desktop/scripts/smoke.sh "<đường dẫn>/AINovel Studio.app"
#
# Biến môi trường:
#   AINOVEL_SMOKE_TIMEOUT    giây chờ AINOVEL_READY (mặc định 60 — lần mở đầu
#                            tiên của một bản vừa notarize, Gatekeeper kiểm mạng)
#   AINOVEL_SMOKE_USERDATA   thư mục userData (mặc định ~/Library/Application Support/<productName>)
#   AINOVEL_SMOKE_FORCE=1    chạy kể cả khi đang có một AINovel Studio khác mở

set -euo pipefail

[[ $# -eq 1 ]] || { echo "usage: $0 <app-path>" >&2; exit 2; }
# `pwd -P`: tiến trình mang đường dẫn THẬT (/tmp → /private/tmp), pgrep phải khớp nó.
APP="$(cd "$(dirname "$1")" && pwd -P)/$(basename "$1")"
[[ -d "$APP/Contents" ]] || { echo "error: không phải .app: $APP" >&2; exit 1; }

READY_TIMEOUT="${AINOVEL_SMOKE_TIMEOUT:-60}"
QUIT_TIMEOUT=20

PLIST="$APP/Contents/Info.plist"
BUNDLE_ID="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$PLIST")"
EXE_NAME="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$PLIST")"
# productName quyết định tên thư mục userData của Electron; CFBundleName mang đúng nó.
PRODUCT_NAME="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleName' "$PLIST")"
EXE_PATH="$APP/Contents/MacOS/$EXE_NAME"
SIDECAR="$APP/Contents/Resources/bin/ainovel-cli"
USERDATA="${AINOVEL_SMOKE_USERDATA:-$HOME/Library/Application Support/$PRODUCT_NAME}"
LOG="$USERDATA/logs/sidecar.log"

[[ -x "$EXE_PATH" ]] || { echo "error: không thấy tệp chạy: $EXE_PATH" >&2; exit 1; }
[[ -x "$SIDECAR" ]]  || { echo "error: không thấy sidecar: $SIDECAR" >&2; exit 1; }

# Một AINovel Studio khác đang mở (bản đã cài, hay `npm start`) giữ single-instance
# lock: bản mới sẽ focus cửa sổ cũ rồi tự thoát ngay — không phân biệt được với
# một cú sập thật. Bỏ qua thay vì báo đỏ giả (bài học lingoreup v0.1.59).
if pgrep -f "/Contents/MacOS/$EXE_NAME" >/dev/null 2>&1 \
   || pgrep -f "node_modules/electron/dist/Electron.app.*ainovel" >/dev/null 2>&1; then
  echo "⚠ Đang có một $PRODUCT_NAME khác chạy — bản mới sẽ đụng single-instance lock."
  if [[ "${AINOVEL_SMOKE_FORCE:-0}" != "1" ]]; then
    echo "  Bỏ qua smoke. Thoát bản đang mở rồi chạy lại, hoặc đặt AINOVEL_SMOKE_FORCE=1."
    exit 0
  fi
fi

# Chỉ đọc phần log MỚI: tệp có thể đã chứa AINOVEL_READY của những lần mở trước,
# cổng cũ ở đó không còn ai nghe.
LOG_OFFSET=0
[[ -f "$LOG" ]] && LOG_OFFSET="$(stat -f%z "$LOG")"

MAIN_PID=""
cleanup() {
  local rc=$?
  if [[ -n "$MAIN_PID" ]] && kill -0 "$MAIN_PID" 2>/dev/null; then
    kill "$MAIN_PID" 2>/dev/null || true
    # Electron xử lý SIGTERM bằng quit êm trên vòng lặp chính; main đang treo (vd chờ
    # hộp Keychain) thì SIGTERM không bao giờ được xử lý → leo thang lên SIGKILL.
    for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 "$MAIN_PID" 2>/dev/null || break; sleep 0.5; done
    kill -9 "$MAIN_PID" 2>/dev/null || true
    # Helper (GPU, renderer…) của đúng gói này.
    pkill -9 -f "$APP/Contents/Frameworks/" 2>/dev/null || true
  fi
  # Chỉ giết sidecar của ĐÚNG gói này (khớp đường dẫn đầy đủ), không đụng
  # ainovel-cli nào khác người dùng đang chạy.
  pkill -f "$SIDECAR" 2>/dev/null || true
  return $rc
}
trap cleanup EXIT

new_log() {
  [[ -f "$LOG" ]] || return 0
  local size
  size="$(stat -f%z "$LOG")"
  # sidecar.ts cắt log khi > 5MB: tệp nhỏ đi nghĩa là đã bị cắt, đọc lại từ đầu.
  if (( size < LOG_OFFSET )); then LOG_OFFSET=0; fi
  tail -c "+$((LOG_OFFSET + 1))" "$LOG"
}

echo "▶ Mở $(basename "$APP")  (bundle: $BUNDLE_ID)"
echo "  log: $LOG"
/usr/bin/open -n -g "$APP" --args -ApplePersistenceIgnoreState YES

# ─── 1. Chờ AINOVEL_READY ───────────────────────────────────────────────
URL=""
deadline=$((SECONDS + READY_TIMEOUT))
while (( SECONDS < deadline )); do
  [[ -n "$MAIN_PID" ]] || MAIN_PID="$(pgrep -f "^$EXE_PATH" 2>/dev/null | head -1 || true)"
  URL="$(new_log | grep -Eo 'AINOVEL_READY http://127\.0\.0\.1:[0-9]+' | tail -1 | awk '{print $2}' || true)"
  [[ -n "$URL" ]] && break
  if [[ -n "$MAIN_PID" ]] && ! kill -0 "$MAIN_PID" 2>/dev/null; then
    echo "✘ Tiến trình chính chết trước khi sidecar báo READY" >&2
    break
  fi
  sleep 0.5
done

if [[ -z "$URL" ]]; then
  echo "✘ Không thấy AINOVEL_READY mới trong ${READY_TIMEOUT}s" >&2
  echo "  --- 30 dòng log mới nhất ---" >&2
  new_log | tail -30 >&2 || true
  echo "  Gợi ý: log show --last 5m --predicate \"process == '$EXE_NAME'\"" >&2
  if [[ -n "$MAIN_PID" ]] && kill -0 "$MAIN_PID" 2>/dev/null; then
    # Đã gặp thật trên máy build: fuse EnableCookieEncryption khiến Electron đọc mục
    # Keychain "<productName> Safe Storage" trước khi main.ts kịp chạy. Mục đó do bản
    # dev chưa ký tạo ra, ACL của nó không nhận chữ ký Developer ID → macOS hiện hộp
    # hỏi mật khẩu (sau cửa sổ khác, vì `open -g`) và main đứng chờ mãi. Máy người
    # dùng sạch không có mục đó; máy build thì xóa mục hoặc bấm "Always Allow" một lần.
    echo "  App vẫn sống mà sidecar không khởi động: kiểm hộp thoại Keychain" >&2
    echo "  \"$PRODUCT_NAME Safe Storage\" đang chờ (security delete-generic-password -s \"$PRODUCT_NAME Safe Storage\")." >&2
  fi
  exit 1
fi
[[ -n "$MAIN_PID" ]] || MAIN_PID="$(pgrep -f "^$EXE_PATH" 2>/dev/null | head -1 || true)"
echo "  ✔ sidecar sẵn sàng: $URL (PID app ${MAIN_PID:-?})"

# ─── 2. /api/workshop phải trả 200 ─────────────────────────────────────
code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$URL/api/workshop" || echo 000)"
if [[ "$code" != "200" ]]; then
  echo "✘ GET $URL/api/workshop trả $code (muốn 200)" >&2
  new_log | tail -30 >&2 || true
  exit 1
fi
echo "  ✔ GET /api/workshop → 200"

# Trang gốc cũng phải ra: thiếu Resources/web thì API vẫn sống mà cửa sổ trắng.
code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$URL/" || echo 000)"
[[ "$code" == "200" ]] || { echo "✘ GET $URL/ trả $code — giao diện web không được phục vụ" >&2; exit 1; }
echo "  ✔ GET / → 200"

# ─── 3. Thoát theo đường người dùng ────────────────────────────────────
SIDECAR_PIDS="$(pgrep -f "$SIDECAR" 2>/dev/null || true)"
[[ -n "$SIDECAR_PIDS" ]] || { echo "✘ READY đã báo nhưng không thấy tiến trình $SIDECAR" >&2; exit 1; }

echo "▶ Thoát app (AppleScript quit → before-quit)"
osascript -e "tell application id \"$BUNDLE_ID\" to quit" >/dev/null 2>&1 || true

deadline=$((SECONDS + QUIT_TIMEOUT))
while (( SECONDS < deadline )); do
  if { [[ -z "$MAIN_PID" ]] || ! kill -0 "$MAIN_PID" 2>/dev/null; } \
     && ! pgrep -f "$SIDECAR" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if [[ -n "$MAIN_PID" ]] && kill -0 "$MAIN_PID" 2>/dev/null; then
  echo "✘ App không thoát trong ${QUIT_TIMEOUT}s sau lệnh quit" >&2
  exit 1
fi
# ─── 4. Không sidecar mồ côi ───────────────────────────────────────────
ORPHANS="$(pgrep -f "$SIDECAR" 2>/dev/null || true)"
if [[ -n "$ORPHANS" ]]; then
  echo "✘ Còn ainovel-cli mồ côi sau khi app thoát: $(echo "$ORPHANS" | tr '\n' ' ')" >&2
  ps -o pid,ppid,command -p "$(echo "$ORPHANS" | paste -sd, -)" >&2 || true
  exit 1
fi
MAIN_PID=""
echo "  ✔ app đã thoát, không còn ainovel-cli mồ côi (đã có: $(echo "$SIDECAR_PIDS" | tr '\n' ' '))"

echo "✔ smoke đạt: $APP"
