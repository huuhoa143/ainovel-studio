#!/usr/bin/env bash
# Thư viện nhỏ cho release.sh — chỉ những gì thật sự trừu tượng:
#   1. Log có màu
#   2. Tệp trạng thái JSON (.release-state.json) để --resume sau khi hỏng giữa chừng
#   3. gh/git ghim đúng tài khoản huuhoa143
#   4. notarize_resilient: tự poll notarytool, sống sót qua rớt mạng tạm thời
#
# Mọi lệnh Apple khác (codesign, ditto, stapler, spctl, create-dmg) viết thẳng
# trong release.sh / sign-bundle.sh — gói chúng vào hàm từng sinh lỗi đường dẫn
# tương đối ở lingoreup v0.1.48.
#
# KHÔNG chạy trực tiếp tệp này. `source` nó từ một script phát hành.

# ─── Log có màu ─────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  bold()  { printf '\033[1m▶ %s\033[0m\n' "$*"; }
  green() { printf '\033[32m✔ %s\033[0m\n' "$*"; }
  red()   { printf '\033[31m✘ %s\033[0m\n' "$*" >&2; }
  warn()  { printf '\033[33m⚠ %s\033[0m\n' "$*" >&2; }
else
  bold()  { printf '▶ %s\n' "$*"; }
  green() { printf '✔ %s\n' "$*"; }
  red()   { printf '✘ %s\n' "$*" >&2; }
  warn()  { printf '⚠ %s\n' "$*" >&2; }
fi

# ─── Tệp trạng thái (--resume) ──────────────────────────────────────────
# Ghi bước nào đã xong và id các lượt notarize đang chạy, để --resume nhảy qua
# những bước đắt (notarize ~10 phút mỗi lượt) thay vì làm lại từ đầu.
# STATE_FILE có thể đặt trước khi source để đổi chỗ (dry-run dùng tệp tạm).

state_path() { printf '%s' "${STATE_FILE:-${DESKTOP:-$(pwd)}/.release-state.json}"; }

state_init() {
  jq -n \
    --arg v "$1" \
    --arg t "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{ version:$v, started_at:$t, steps_done:[] }' \
    > "$(state_path)"
}

state_get() {
  local path
  path="$(state_path)"
  [[ -f "$path" ]] || { echo ""; return; }
  jq -r --arg k "$1" '.[$k] // empty' "$path"
}

state_set() {
  local tmp
  tmp="$(mktemp)"
  jq --arg k "$1" --arg v "$2" '.[$k] = $v' "$(state_path)" > "$tmp"
  mv "$tmp" "$(state_path)"
}

state_mark_done() {
  local tmp
  tmp="$(mktemp)"
  jq --arg s "$1" '.steps_done += [$s] | .steps_done |= unique' \
    "$(state_path)" > "$tmp"
  mv "$tmp" "$(state_path)"
}

state_is_done() {
  local path
  path="$(state_path)"
  [[ -f "$path" ]] || return 1
  jq -e --arg s "$1" '.steps_done | index($s) != null' "$path" >/dev/null
}

state_cleanup() { rm -f "$(state_path)"; }

# ─── gh / git ghim tài khoản ────────────────────────────────────────────
# Máy này export GITHUB_TOKEN của tài khoản hoanh143, và nó đè lên mọi
# `gh auth switch`. Bỏ GITHUB_TOKEN thôi CHƯA đủ: gh lại rơi về tài khoản đang
# active trong keyring — cũng là hoanh143. Nên ta lấy token của huuhoa143 một
# lần, đặt vào GH_TOKEN (GH_TOKEN thắng GITHUB_TOKEN trong thứ tự ưu tiên của
# gh), và vẫn gọi mọi lệnh qua `env -u GITHUB_TOKEN` cho chắc.

GH_USER="${GH_USER:-huuhoa143}"

ensure_gh_token() {
  if [[ -z "${GH_TOKEN:-}" ]]; then
    local token
    token="$(env -u GITHUB_TOKEN gh auth token --user "$GH_USER" 2>/dev/null || true)"
    [[ -n "$token" ]] || { red "Không lấy được token gh của '$GH_USER' (gh auth login --user $GH_USER?)"; return 1; }
    export GH_TOKEN="$token"
  fi
  # Khẳng định tài khoản bằng chính token sẽ dùng để ghi — một lần kiểm bằng
  # token khác rồi ghi bằng token này là đúng cái lỗi từng xảy ra.
  local login
  login="$(env -u GITHUB_TOKEN gh api user --jq .login 2>/dev/null || true)"
  [[ "$login" == "$GH_USER" ]] || { red "Token gh thuộc '$login', không phải '$GH_USER'"; return 1; }
}

# ghx — gh luôn chạy với GITHUB_TOKEN đã bị gỡ (GH_TOKEN do ensure_gh_token đặt).
ghx() { env -u GITHUB_TOKEN gh "$@"; }

# git_push — push bằng credential helper của gh (mang GH_TOKEN ở trên). Phải xóa
# helper kế thừa trước: osxkeychain giữ token của tài khoản KIA và sẽ thắng.
git_push() {
  env -u GITHUB_TOKEN git -c credential.helper= -c credential.helper='!gh auth git-credential' push "$@"
}

# ─── notarytool submit + poll bền bỉ ────────────────────────────────────
# Không dùng `--wait`: một phiên `--wait` gãy vì Wi-Fi rớt là mất dấu lượt nộp.
# Ta tự poll, và lưu id vào tệp trạng thái để --resume gắn lại vào đúng lượt
# Apple đang quét thay vì nộp lượt mới.
#
# Mã thoát: 0=Accepted, 1=Invalid/Rejected, 2=hết giờ/lỗi mạng.

NOTARIZE_POLL_MAX="${NOTARIZE_POLL_MAX:-360}"   # 360 × 10s = 1 giờ
NOTARIZE_POLL_INTERVAL="${NOTARIZE_POLL_INTERVAL:-10}"

notarize_status() {
  xcrun notarytool info "$1" --keychain-profile "$2" --output-format json 2>/dev/null \
    | jq -r '.status // "Unknown"'
}

notarize_resilient() {
  local artifact="$1"
  local state_key="$2"          # vd notarize_app_arm64_id
  local profile="$3"

  local prior_id prior_status
  prior_id="$(state_get "$state_key")"
  if [[ -n "$prior_id" ]]; then
    prior_status="$(notarize_status "$prior_id" "$profile" || echo "")"
    if [[ "$prior_status" == "Accepted" ]]; then
      green "Notarize ($state_key) đã Accepted ($prior_id) — không nộp lại"
      return 0
    fi
    if [[ "$prior_status" == "In Progress" ]]; then
      green "Gắn lại vào lượt notarize đang chạy $prior_id"
      _notarize_poll "$prior_id" "$profile"
      return $?
    fi
  fi

  bold "Nộp notarize: $(basename "$artifact")"
  local submit_json sub_id
  submit_json="$(xcrun notarytool submit "$artifact" \
    --keychain-profile "$profile" \
    --no-wait --output-format json 2>&1)" || {
      red "notarytool submit thất bại:"
      printf '%s\n' "$submit_json" >&2
      return 1
    }

  sub_id="$(printf '%s\n' "$submit_json" | jq -r '.id // empty' 2>/dev/null || true)"
  [[ -n "$sub_id" ]] || {
    red "Không đọc được id lượt nộp từ notarytool:"
    printf '%s\n' "$submit_json" >&2
    return 1
  }
  state_set "$state_key" "$sub_id"
  echo "  id: $sub_id"
  _notarize_poll "$sub_id" "$profile"
}

_notarize_poll() {
  local sub_id="$1" profile="$2"
  bold "Poll Apple (tối đa $((NOTARIZE_POLL_MAX * NOTARIZE_POLL_INTERVAL / 60)) phút)"
  local attempts=0 network_failures=0 status
  while (( attempts < NOTARIZE_POLL_MAX )); do
    sleep "$NOTARIZE_POLL_INTERVAL"
    attempts=$((attempts + 1))
    status="$(notarize_status "$sub_id" "$profile" || echo "NetworkError")"
    case "$status" in
      Accepted)
        echo
        green "Notarize Accepted (lần poll #$attempts)"
        return 0
        ;;
      Invalid|Rejected)
        echo
        red "Notarize $status. Log chi tiết:"
        xcrun notarytool log "$sub_id" --keychain-profile "$profile" 2>&1 | head -50 >&2
        return 1
        ;;
      "In Progress")
        if (( attempts % 6 == 0 )); then
          printf '\r  In Progress (%d phút)...' $((attempts * NOTARIZE_POLL_INTERVAL / 60)) >&2
        fi
        network_failures=0
        ;;
      *)
        network_failures=$((network_failures + 1))
        if (( network_failures > 30 )); then  # ~5 phút lỗi mạng liên tục
          echo
          red "Lỗi mạng kéo dài. Id lượt nộp đã lưu: $sub_id"
          red "Chạy lại với --resume khi mạng ổn."
          return 2
        fi
        ;;
    esac
  done

  echo
  red "Notarize quá $((NOTARIZE_POLL_MAX * NOTARIZE_POLL_INTERVAL / 60)) phút. Id: $sub_id"
  red "Kiểm tay: xcrun notarytool info $sub_id --keychain-profile $profile"
  return 2
}
