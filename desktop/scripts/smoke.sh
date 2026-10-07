#!/usr/bin/env bash
# Mở một AINovel Studio.app đã đóng gói và kiểm nó chạy THẬT, không chỉ "không sập":
#
#   1. Mở app qua LaunchServices (`open -n -g`, như người dùng bấm đúp).
#   2. Chờ dòng `AINOVEL_READY http://127.0.0.1:<cổng>` trong
#      "<userData>/logs/sidecar.log" — tức sidecar Go đã spawn, đã Listen.
#   3. `curl /api/workshop` trên cổng đó phải trả 200 — giao diện có API để nói chuyện.
#   4. Thoát app qua app.quit() (SIGTERM → before-quit → stop sidecar, cùng đường với Cmd+Q).
#   5. Không được còn tiến trình ainovel-cli mồ côi của gói này.
#
# App LUÔN chạy cô lập, không đụng gì của máy:
#   --user-data-dir=<thư mục tạm>  app.getPath('userData') trỏ vào đó (log, sách,
#                                  khóa single-instance) — dữ liệu thật không bị
#                                  ghi, và một AINovel Studio khác đang mở không
#                                  chặn được bản đang kiểm.
#   --use-mock-keychain            Chromium dùng Keychain giả: không đọc/tạo mục
#                                  "<productName> Safe Storage", không hộp thoại
#                                  Keychain nào treo app giữa chừng.
# Thư mục tạm bị xóa khi đạt; khi hỏng thì giữ lại và in đường dẫn để xem log.
#
# Cách dùng:
#   desktop/scripts/smoke.sh "<đường dẫn>/AINovel Studio.app"
#
# Biến môi trường:
#   AINOVEL_SMOKE_TIMEOUT    giây chờ AINOVEL_READY (mặc định 60 — lần mở đầu
#                            tiên của một bản vừa notarize, Gatekeeper kiểm mạng)

set -euo pipefail

[[ $# -eq 1 ]] || { echo "usage: $0 <app-path>" >&2; exit 2; }
# `pwd -P`: tiến trình mang đường dẫn THẬT (/tmp → /private/tmp), pgrep phải khớp nó.
APP="$(cd "$(dirname "$1")" && pwd -P)/$(basename "$1")"
[[ -d "$APP/Contents" ]] || { echo "error: không phải .app: $APP" >&2; exit 1; }

READY_TIMEOUT="${AINOVEL_SMOKE_TIMEOUT:-60}"
# Sidecar có tới 15s để tự thoát trước khi bị kill (stopTimeoutMs trong
# desktop/src/main), cộng thời gian Electron đóng cửa sổ — chừa dư.
QUIT_TIMEOUT=30

PLIST="$APP/Contents/Info.plist"
BUNDLE_ID="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$PLIST")"
EXE_NAME="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$PLIST")"
EXE_PATH="$APP/Contents/MacOS/$EXE_NAME"
SIDECAR="$APP/Contents/Resources/bin/ainovel-cli"

[[ -x "$EXE_PATH" ]] || { echo "error: không thấy tệp chạy: $EXE_PATH" >&2; exit 1; }
[[ -x "$SIDECAR" ]]  || { echo "error: không thấy sidecar: $SIDECAR" >&2; exit 1; }

# Chính gói này đang chạy (smoke trước chết dở?): pgrep tìm PID chính và sidecar
# theo đường dẫn gói, hai bản cùng đường dẫn thì không phân biệt được. Bản cài ở
# chỗ khác, hay `npm start`, thì không sao — userData tạm tách hẳn chúng ra.
if pgrep -f "^$EXE_PATH" >/dev/null 2>&1 || pgrep -f "$SIDECAR" >/dev/null 2>&1; then
  echo "✘ Gói này đang chạy sẵn — thoát nó (hoặc: pkill -f '$APP/Contents/') rồi smoke lại." >&2
  exit 1
fi

USERDATA="$(mktemp -d -t ainovel-smoke)"
# `pwd -P`: mktemp trả /var/folders/…, Electron báo đường dẫn thật /private/var/….
USERDATA="$(cd "$USERDATA" && pwd -P)"
LOG="$USERDATA/logs/sidecar.log"

MAIN_PID=""
cleanup() {
  local rc=$?
  if [[ -n "$MAIN_PID" ]] && kill -0 "$MAIN_PID" 2>/dev/null; then
    kill "$MAIN_PID" 2>/dev/null || true
    # SIGTERM được Electron xử lý bằng app.quit() trên vòng lặp chính; main đang
    # treo thì không bao giờ tới lượt → leo thang lên SIGKILL.
    for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 "$MAIN_PID" 2>/dev/null || break; sleep 0.5; done
    kill -9 "$MAIN_PID" 2>/dev/null || true
    # Helper (GPU, renderer…) của đúng gói này.
    pkill -9 -f "$APP/Contents/Frameworks/" 2>/dev/null || true
  fi
  # Chỉ giết sidecar của ĐÚNG gói này (khớp đường dẫn đầy đủ), không đụng
  # ainovel-cli nào khác người dùng đang chạy.
  pkill -f "$SIDECAR" 2>/dev/null || true
  if (( rc == 0 )); then
    rm -rf "$USERDATA"
  else
    echo "  userData của lượt smoke giữ lại để xem: $USERDATA" >&2
  fi
  return $rc
}
trap cleanup EXIT

# userData mới tinh mỗi lượt: mọi dòng trong log đều của lượt này.
read_log() {
  [[ -f "$LOG" ]] || return 0
  cat "$LOG"
}

echo "▶ Mở $(basename "$APP")  (bundle: $BUNDLE_ID)"
echo "  log: $LOG"
/usr/bin/open -n -g "$APP" --args -ApplePersistenceIgnoreState YES \
  --user-data-dir="$USERDATA" --use-mock-keychain

# ─── 1. Chờ AINOVEL_READY ───────────────────────────────────────────────
URL=""
deadline=$((SECONDS + READY_TIMEOUT))
while (( SECONDS < deadline )); do
  [[ -n "$MAIN_PID" ]] || MAIN_PID="$(pgrep -f "^$EXE_PATH" 2>/dev/null | head -1 || true)"
  URL="$(read_log | grep -Eo 'AINOVEL_READY http://127\.0\.0\.1:[0-9]+' | tail -1 | awk '{print $2}' || true)"
  [[ -n "$URL" ]] && break
  if [[ -n "$MAIN_PID" ]] && ! kill -0 "$MAIN_PID" 2>/dev/null; then
    echo "✘ Tiến trình chính chết trước khi sidecar báo READY" >&2
    break
  fi
  sleep 0.5
done

if [[ -z "$URL" ]]; then
  echo "✘ Không thấy AINOVEL_READY trong ${READY_TIMEOUT}s" >&2
  echo "  --- 30 dòng cuối sidecar.log ---" >&2
  read_log | tail -30 >&2 || true
  echo "  Gợi ý: log show --last 5m --predicate \"process == '$EXE_NAME'\"" >&2
  [[ -f "$USERDATA/logs/main.log" ]] && { echo "  --- main.log ---" >&2; tail -30 "$USERDATA/logs/main.log" >&2; }
  exit 1
fi
[[ -n "$MAIN_PID" ]] || MAIN_PID="$(pgrep -f "^$EXE_PATH" 2>/dev/null | head -1 || true)"
echo "  ✔ sidecar sẵn sàng: $URL (PID app ${MAIN_PID:-?})"

# ─── 2. /api/workshop phải trả 200 ─────────────────────────────────────
code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$URL/api/workshop" || echo 000)"
if [[ "$code" != "200" ]]; then
  echo "✘ GET $URL/api/workshop trả $code (muốn 200)" >&2
  read_log | tail -30 >&2 || true
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

# SIGTERM vào đúng PID của bản đang kiểm: Electron xử lý bằng app.quit() →
# before-quit → dừng sidecar, y như Cmd+Q. AppleScript `quit` theo bundle id thì
# sẽ thoát luôn cả AINovel Studio người dùng đang mở.
[[ -n "$MAIN_PID" ]] || { echo "✘ Không tìm thấy PID chính của $EXE_PATH để thoát" >&2; exit 1; }
echo "▶ Thoát app (SIGTERM → app.quit → before-quit)"
kill -TERM "$MAIN_PID"

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

# ─── 5. Sidecar tự thoát êm, không bị kill ─────────────────────────────
# "Không mồ côi" chưa đủ: sidecar bị kill() sau stopTimeoutMs cũng không để lại mồ
# côi, nên đường đóng-stdin → Go tự thoát hỏng vẫn qua. sidecar.ts ghi
# "[main] tiến trình thoát: code=<c> signal=<s>" khi tiến trình con đóng — phải là
# code=0 signal=null, và không có dòng "— kill()" nào.
EXIT_LINE="$(read_log | grep -Eo 'code=[^ ]+ signal=[^ ]+' | tail -1 || true)"
if [[ "$EXIT_LINE" != "code=0 signal=null" ]] || read_log | grep -q 'kill()'; then
  echo "✘ Sidecar không tự thoát êm (dòng thoát: '${EXIT_LINE:-không có}')" >&2
  read_log | tail -15 >&2 || true
  exit 1
fi
# Khóa ghi của truyện (internal/store: <books>/<truyện>/meta/studio.lock) phải được trả.
LOCKS="$(find "$USERDATA/books" -name studio.lock 2>/dev/null || true)"
if [[ -n "$LOCKS" ]]; then
  echo "✘ Còn tệp khóa sau khi thoát: $LOCKS" >&2
  exit 1
fi
echo "  ✔ sidecar thoát code=0, không bị kill, không còn studio.lock"

echo "✔ smoke đạt: $APP"
