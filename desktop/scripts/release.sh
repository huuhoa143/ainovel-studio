#!/usr/bin/env bash
# Phát hành AINovel Studio: macOS arm64 + x64 (DMG + ZIP, ký + notarize) và
# Windows x64 (NSIS, chưa ký) lên GitHub Releases của huuhoa143/ainovel-studio.
#
# Rút gọn từ lingoreup scripts/local-release.sh + release-with-x64.sh +
# build-x64-local.sh. Giữ mọi bài học đã trả giá (ký trong-ra-ngoài, ditto,
# notarytool tự poll, create-dmg@8, latest-mac.yml hai arch arm64 đứng trước,
# sha512 base64). Bỏ hết venv/cythonize/release-gate/announcement/submodule —
# sidecar ở đây là MỘT nhị phân Go tĩnh.
#
# Chạy trên Mac Apple Silicon. Mỗi lệnh Apple (codesign qua sign-bundle.sh,
# ditto, notarytool, stapler, spctl, create-dmg) gọi thẳng ở đây, không gói hàm.
#
# Các bước (~30-45 phút, phần lớn là chờ Apple notarize 4 lượt):
#   1.  Điều kiện tiên quyết
#   2.  Bump desktop/package.json + commit + tag vX.Y.Z + push
#   3.  Với mỗi arch (arm64 rồi x64):
#         a. build-sidecar.sh darwin <goarch>  → desktop/resources/{bin,web}
#         b. electron-forge package --arch     → .app chưa ký
#         c. sign-bundle.sh (trong ra ngoài; Resources/bin/ainovel-cli trước)
#         d. notarize .app (ditto zip vận chuyển → notarytool → poll)
#         e. staple .app + validate + spctl
#         f. smoke.sh (mở app, AINOVEL_READY, /api/workshop 200, thoát sạch)
#         g. ZIP (ditto) + DMG (create-dmg@8)
#         h. notarize + staple DMG
#         i. kiểm cuối: giải ZIP bằng ditto, mount DMG, spctl cả hai
#   4.  Windows: electron-forge make --platform=win32 --arch=x64 (NSIS). Hỏng thì
#       cảnh báo và chỉ sang release.ps1 — bản mac vẫn phát hành.
#   5.  latest-mac.yml hai arch (arm64 đứng TRƯỚC)
#   6.  gh release create + upload
#
# Cách dùng:
#   desktop/scripts/release.sh 1.0.0                 # phát hành thật
#   desktop/scripts/release.sh 1.0.0 --resume        # tiếp sau khi hỏng giữa chừng
#   desktop/scripts/release.sh 1.0.0 --dry-run       # tập dượt: build + đóng gói +
#                                                    # smoke; KHÔNG đụng git, KHÔNG
#                                                    # ký/notarize, KHÔNG upload
#   desktop/scripts/release.sh 1.0.0 --skip-windows  # chỉ mac (Windows làm bằng release.ps1)
#
# Thông tin xác thực (Keychain, thiết lập một lần mỗi máy):
#   LINGOREUP_NOTARIZE   profile của notarytool (dùng chung với lingoreup — cùng team)
#   gh đã đăng nhập tài khoản huuhoa143 (GITHUB_TOKEN của máy bị gỡ ở MỌI lệnh gh)
#
# Biến môi trường:
#   RELEASE_BRANCH       nhánh được phép phát hành (mặc định main)

set -euo pipefail

# ─── Tham số ────────────────────────────────────────────────────────────
VERSION=""
RESUME=0
DRY_RUN=0
SKIP_WINDOWS=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --resume)       RESUME=1; shift ;;
    --dry-run)      DRY_RUN=1; shift ;;
    --skip-windows) SKIP_WINDOWS=1; shift ;;
    -h|--help)      grep -E '^#( |$)' "$0" | head -48 | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*)             echo "ERROR: cờ lạ: $1" >&2; exit 2 ;;
    *)
      if [[ -z "$VERSION" ]]; then VERSION="$1"; shift
      else echo "ERROR: tham số thừa: $1" >&2; exit 2; fi
      ;;
  esac
done
[[ -n "$VERSION" ]] || { echo "Usage: $0 <X.Y.Z> [--resume] [--dry-run] [--skip-windows]" >&2; exit 2; }
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] \
  || { echo "ERROR: VERSION phải dạng X.Y.Z (nhận: $VERSION)" >&2; exit 2; }
TAG="v$VERSION"

DESKTOP="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$DESKTOP/.." && pwd)"
SCRIPTS="$DESKTOP/scripts"
cd "$DESKTOP"

# Tệp trạng thái nằm trong .git/: không bao giờ bị theo dõi, không cần sửa
# .gitignore, và sống qua `rm -rf out`. Dry-run dùng tệp riêng để một lượt tập
# dượt không bao giờ làm --resume của lượt thật nhảy qua bước ký/notarize.
GIT_DIR_ABS="$(git -C "$REPO" rev-parse --absolute-git-dir)"
if (( DRY_RUN == 1 )); then
  STATE_FILE="$GIT_DIR_ABS/ainovel-desktop-release.dry-run.json"
else
  STATE_FILE="$GIT_DIR_ABS/ainovel-desktop-release.json"
fi
export STATE_FILE

# shellcheck source=lib/state-helpers.sh
source "$SCRIPTS/lib/state-helpers.sh"

# ─── Hằng số ────────────────────────────────────────────────────────────
SIGN_IDENTITY="Developer ID Application: Chien Bui Minh (CCQUC3AGRH)"
NOTARIZE_PROFILE="LINGOREUP_NOTARIZE"
ENTITLEMENTS="$DESKTOP/entitlements.plist"
GH_REPO="huuhoa143/ainovel-studio"
PRODUCT_NAME="AINovel Studio"
ARTIFACT_PREFIX="AINovel-Studio"
RELEASE_BRANCH="${RELEASE_BRANCH:-main}"
DIST="$DESKTOP/out/release/$VERSION"

cleanup_release() {
  local rc=$?
  rm -f /tmp/ainovel-notary-*.zip 2>/dev/null || true
  # Chỉ xóa tệp trạng thái khi THÀNH CÔNG — giữ nó cho --resume khi hỏng.
  if (( rc == 0 )); then
    state_cleanup
  else
    red "Hỏng (mã $rc). Trạng thái giữ ở $STATE_FILE — sửa xong chạy lại với --resume."
  fi
  return $rc
}
trap cleanup_release EXIT

# ════════════════════════════════════════════════════════════════════════
# Bước 1 — Điều kiện tiên quyết
# ════════════════════════════════════════════════════════════════════════
bold "1/6  Kiểm điều kiện (dry-run=$DRY_RUN, resume=$RESUME)"

[[ "$(uname -s)" == "Darwin" && "$(uname -m)" == "arm64" ]] \
  || { red "release.sh chạy trên Mac Apple Silicon (máy này: $(uname -s)/$(uname -m))"; exit 1; }

REQUIRED=(go node npm npx gh jq shasum xxd base64 file perl ditto create-dmg xcrun codesign hdiutil spctl curl osascript)
MISSING=()
for bin in "${REQUIRED[@]}"; do command -v "$bin" >/dev/null || MISSING+=("$bin"); done
if (( ${#MISSING[@]} > 0 )); then
  red "Thiếu công cụ: ${MISSING[*]}"
  echo "  npm install -g create-dmg@8     # sindresorhus (KHÔNG phải brew create-dmg)"
  echo "  brew install gh jq go"
  exit 1
fi

# create-dmg của Homebrew dùng AppleScript và làm hỏng chữ ký .app bên trong DMG.
CREATE_DMG_VERSION="$(create-dmg --version 2>/dev/null || echo 0)"
[[ "$CREATE_DMG_VERSION" =~ ^8\. ]] || {
  red "create-dmg là '$CREATE_DMG_VERSION', cần 8.x (npm sindresorhus). Sửa: npm install -g create-dmg@8"
  exit 1
}

# Rosetta 2: cần để smoke bản x64 trên máy arm64.
/usr/bin/pgrep -q oahd || arch -x86_64 /usr/bin/true 2>/dev/null || {
  red "Không có Rosetta 2 — không smoke được bản x86_64. Sửa: softwareupdate --install-rosetta --agree-to-license"
  exit 1
}

[[ -f "$ENTITLEMENTS" ]]            || { red "Thiếu $ENTITLEMENTS"; exit 1; }
[[ -f "$DESKTOP/package.json" ]]    || { red "Thiếu $DESKTOP/package.json"; exit 1; }
[[ -f "$DESKTOP/forge.config.ts" ]] || { red "Thiếu $DESKTOP/forge.config.ts"; exit 1; }

if (( DRY_RUN == 0 )); then
  security find-identity -v -p codesigning 2>/dev/null | grep -qF "$SIGN_IDENTITY" || {
    red "Không có identity ký trong keychain: $SIGN_IDENTITY"; exit 1; }
  # In NGUYÊN lỗi của notarytool: "profile chưa thiết lập" và "Apple đòi ký lại
  # thỏa thuận (HTTP 403)" là hai việc khác hẳn nhau để sửa.
  if ! notary_err="$(xcrun notarytool history --keychain-profile "$NOTARIZE_PROFILE" 2>&1 >/dev/null)"; then
    red "notarytool (profile $NOTARIZE_PROFILE) không dùng được:"
    printf '  %s\n' "$notary_err" >&2
    red "Nếu là 403 'agreement missing or expired': chủ tài khoản vào developer.apple.com chấp nhận thỏa thuận mới."
    red "Nếu là thiếu profile: xcrun notarytool store-credentials $NOTARIZE_PROFILE --apple-id … --team-id CCQUC3AGRH --password …"
    exit 1
  fi
  ensure_gh_token || exit 1
fi

# Cây làm việc sạch (tệp chưa theo dõi thì được; thay đổi đã theo dõi thì chặn):
# commit bump phải chỉ chứa đúng phiên bản, và tag phải trỏ vào đúng mã đã build.
if [[ -n "$(git -C "$REPO" status --porcelain | grep -v '^??' || true)" ]]; then
  if (( DRY_RUN == 1 )); then
    warn "Cây làm việc có thay đổi chưa commit — dry-run vẫn chạy, bản thật sẽ từ chối."
  else
    red "Cây làm việc có thay đổi chưa commit. Commit hoặc stash trước."
    git -C "$REPO" status --short | head >&2
    exit 1
  fi
fi

BRANCH="$(git -C "$REPO" branch --show-current)"
if (( DRY_RUN == 0 )) && [[ "$BRANCH" != "$RELEASE_BRANCH" ]]; then
  # Bước 2 push nhánh hiện tại rồi tag lên đó: từ một nhánh khác, tag sẽ trỏ vào
  # commit mà $RELEASE_BRANCH không bao giờ nhận (bài học release.ps1 của lingoreup).
  red "Đang ở nhánh '$BRANCH', chỉ phát hành từ '$RELEASE_BRANCH' (đổi bằng RELEASE_BRANCH=…)."
  exit 1
fi

if [[ ! -d "$DESKTOP/node_modules" ]]; then
  warn "desktop/node_modules chưa có — npm ci"
  npm ci
fi

CURRENT_VERSION="$(jq -r .version "$DESKTOP/package.json")"
# Tag desktop trước: không lấy `git describe` trần vì repo đã có tag v0.x của các
# bản CLI (goreleaser) — chung không gian tên. Tag desktop là tag mà cây của nó có
# desktop/package.json.
PREV_TAG=""
while IFS= read -r t; do
  if git -C "$REPO" cat-file -e "$t:desktop/package.json" 2>/dev/null; then PREV_TAG="$t"; break; fi
done < <(git -C "$REPO" tag --list 'v[0-9]*' --sort=-v:refname)

if (( RESUME == 1 )); then
  [[ -f "$(state_path)" ]] || { red "Không có $(state_path) để resume"; exit 1; }
  [[ "$(state_get version)" == "$VERSION" ]] || {
    red "Trạng thái là của v$(state_get version), bạn yêu cầu v$VERSION"; exit 1; }
  green "Resume $TAG (đã xong: $(jq -r '.steps_done | join(",")' "$(state_path)"))"
  PREV_TAG="$(state_get prev_tag)"
else
  if git -C "$REPO" rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
    red "Tag $TAG đã có. Chọn phiên bản mới, hoặc --resume nếu đang dở chính bản này."
    exit 1
  fi
  if (( DRY_RUN == 0 )) && ghx release view "$TAG" --repo "$GH_REPO" >/dev/null 2>&1; then
    red "Release $TAG đã có trên $GH_REPO."
    exit 1
  fi
  state_init "$VERSION"
  state_set prev_tag "$PREV_TAG"
fi
green "Điều kiện OK ($CURRENT_VERSION → $VERSION; tag trước: ${PREV_TAG:-không có})"

# ════════════════════════════════════════════════════════════════════════
# Bước 2 — Bump + commit + tag + push
# ════════════════════════════════════════════════════════════════════════
if ! state_is_done bump; then
  bold "2/6  Bump $CURRENT_VERSION → $VERSION, commit, tag $TAG, push"
  if (( DRY_RUN == 1 )); then
    echo "  [dry-run] Sẽ bump desktop/package.json, commit, tag $TAG, push origin $RELEASE_BRANCH + $TAG"
  else
    if [[ "$CURRENT_VERSION" != "$VERSION" ]]; then
      # `npm version` sửa cả package-lock.json, đúng định dạng npm, không tự tag.
      npm version "$VERSION" --no-git-tag-version >/dev/null
      git -C "$REPO" add desktop/package.json desktop/package-lock.json
      git -C "$REPO" commit -m "chore(desktop): phát hành $TAG"
    else
      # Bản đầu tiên: package.json đã sẵn 1.0.0, không có gì để bump — chỉ tag.
      echo "  desktop/package.json đã là $VERSION — chỉ tag"
    fi
    git -C "$REPO" tag -a "$TAG" -m "AINovel Studio $TAG"
    git_push origin "$BRANCH"
    git_push origin "$TAG"
    green "Đã push $TAG"
  fi
  state_mark_done bump
else
  green "2/6  Bump (bỏ qua)"
fi

# ════════════════════════════════════════════════════════════════════════
# Bước 3 — macOS, từng arch
# ════════════════════════════════════════════════════════════════════════
mkdir -p "$DIST"

# Electron gọi kiến trúc là arm64/x64; Go gọi là arm64/amd64.
goarch_of() { [[ "$1" == "x64" ]] && echo amd64 || echo "$1"; }
macho_of()  { [[ "$1" == "x64" ]] && echo x86_64 || echo arm64; }

web_flag() {
  # Web chỉ dựng MỘT lần mỗi lượt phát hành (đầu ra tĩnh, giống nhau mọi arch).
  if state_is_done web; then echo "--skip-web"; fi
}

for ARCH in arm64 x64; do
  GOARCH_T="$(goarch_of "$ARCH")"
  MACHO="$(macho_of "$ARCH")"
  ZIP_PATH="$DIST/$ARTIFACT_PREFIX-$VERSION-$ARCH.zip"
  DMG_PATH="$DIST/$ARTIFACT_PREFIX-$VERSION-$ARCH.dmg"

  # ── a+b. sidecar + forge package ──────────────────────────────────────
  if ! state_is_done "package_$ARCH"; then
    bold "3a/$ARCH  build-sidecar darwin/$GOARCH_T"
    # shellcheck disable=SC2046  # web_flag trả rỗng hoặc đúng một từ
    bash "$SCRIPTS/build-sidecar.sh" darwin "$GOARCH_T" "$VERSION" $(web_flag)
    state_mark_done web

    bold "3b/$ARCH  electron-forge package --arch=$ARCH"
    rm -rf "$DESKTOP/out/$PRODUCT_NAME-darwin-$ARCH"
    # Gọi forge TRỰC TIẾP, dạng `--arch=x64`: qua `npm run package -- …` thì một
    # `--` rơi vào commander của forge thành "hết tùy chọn", cờ arch bị bỏ qua
    # và bản build lặng lẽ thành arm64 (bài học build-x64-local.sh).
    npx electron-forge package --platform=darwin --arch="$ARCH"
    APP="$DESKTOP/out/$PRODUCT_NAME-darwin-$ARCH/$PRODUCT_NAME.app"
    [[ -d "$APP" ]] || { red "forge package xong nhưng không thấy $APP"; exit 1; }

    # Kiểm chính các tệp trong gói, không tin cờ.
    file -b "$APP/Contents/MacOS/$PRODUCT_NAME" | grep -q "$MACHO" \
      || { red "Electron trong gói không phải $MACHO: $(file -b "$APP/Contents/MacOS/$PRODUCT_NAME")"; exit 1; }
    file -b "$APP/Contents/Resources/bin/ainovel-cli" | grep -q "$MACHO" \
      || { red "Sidecar trong gói không phải $MACHO — resources/bin lẫn arch?"; exit 1; }
    [[ -f "$APP/Contents/Resources/web/index.html" ]] \
      || { red "Thiếu Resources/web/index.html — extraResource trong forge.config.ts?"; exit 1; }
    [[ -f "$APP/Contents/Resources/app-update.yml" ]] \
      || { red "Thiếu Resources/app-update.yml — không có nó electron-updater không bao giờ cập nhật"; exit 1; }
    "$APP/Contents/Resources/bin/ainovel-cli" --version 2>/dev/null | grep -qF "$VERSION" \
      || { red "Sidecar không báo phiên bản $VERSION"; exit 1; }

    state_set "app_$ARCH" "$APP"
    state_mark_done "package_$ARCH"
  else
    green "3ab/$ARCH  package (bỏ qua — $(state_get "app_$ARCH"))"
  fi
  APP="$(state_get "app_$ARCH")"

  # ── c. ký ─────────────────────────────────────────────────────────────
  if ! state_is_done "sign_$ARCH"; then
    bold "3c/$ARCH  Ký (trong ra ngoài, hardened runtime, timestamp RFC3161)"
    if (( DRY_RUN == 1 )); then
      echo "  [dry-run] Sẽ chạy sign-bundle.sh với '$SIGN_IDENTITY'"
    else
      bash "$SCRIPTS/sign-bundle.sh" "$APP" "$ENTITLEMENTS" "$SIGN_IDENTITY"
    fi
    state_mark_done "sign_$ARCH"
  else
    green "3c/$ARCH  Ký (bỏ qua)"
  fi

  # ── d. notarize .app ──────────────────────────────────────────────────
  if ! state_is_done "notarize_app_$ARCH"; then
    bold "3d/$ARCH  Notarize .app"
    if (( DRY_RUN == 1 )); then
      echo "  [dry-run] Sẽ nộp notarytool"
    else
      # ditto -c -k --sequesterRsrc --keepParent: giữ resource fork + xattr mà
      # `zip` thường làm rơi. Zip này chỉ để Apple đọc, xong là bỏ.
      TRANSPORT_ZIP="/tmp/ainovel-notary-$VERSION-$ARCH.zip"
      rm -f "$TRANSPORT_ZIP"
      ditto -c -k --sequesterRsrc --keepParent "$APP" "$TRANSPORT_ZIP"
      echo "  zip vận chuyển: $(du -h "$TRANSPORT_ZIP" | cut -f1)"
      notarize_resilient "$TRANSPORT_ZIP" "notarize_app_${ARCH}_id" "$NOTARIZE_PROFILE" \
        || { red "Notarize .app $ARCH hỏng. Chạy lại với --resume."; exit 1; }
      rm -f "$TRANSPORT_ZIP"
    fi
    state_mark_done "notarize_app_$ARCH"
  else
    green "3d/$ARCH  Notarize .app (bỏ qua)"
  fi

  # ── e. staple .app ────────────────────────────────────────────────────
  if ! state_is_done "staple_app_$ARCH"; then
    bold "3e/$ARCH  Staple .app + spctl"
    if (( DRY_RUN == 1 )); then
      echo "  [dry-run] Sẽ staple + validate + spctl"
    else
      xcrun stapler staple "$APP"
      xcrun stapler validate "$APP"
      spctl -a -vv --type execute "$APP"
    fi
    state_mark_done "staple_app_$ARCH"
  else
    green "3e/$ARCH  Staple .app (bỏ qua)"
  fi

  # ── f. smoke ──────────────────────────────────────────────────────────
  # KHÔNG bọc state_is_done: rẻ (~10s) và --resume chính là lúc một .app cũ từ
  # lượt trước dễ bị đem đi phát hành nhất. Chạy trên bản ĐÃ ký + staple, tức
  # đúng thứ người dùng nhận; bản x64 chạy qua Rosetta.
  #
  # Trên máy build đã từng chạy bản dev chưa ký, lần smoke ĐẦU của bản ký Developer
  # ID sẽ treo ở hộp thoại Keychain "AINovel Studio Safe Storage" (ACL của mục đó
  # không nhận chữ ký mới). Bấm "Always Allow" một lần là xong cho mọi bản sau;
  # smoke.sh in gợi ý này khi hết giờ chờ.
  bold "3f/$ARCH  Smoke (mở app, AINOVEL_READY, /api/workshop, thoát sạch)"
  bash "$SCRIPTS/smoke.sh" "$APP"

  # ── g. ZIP + DMG ──────────────────────────────────────────────────────
  if ! state_is_done "dist_$ARCH"; then
    bold "3g/$ARCH  ZIP (ditto) + DMG (create-dmg@8)"
    # ZIP cho electron-updater: Squirrel.Mac giải bằng `ditto -x -k`, nên nén bằng
    # ditto thì bundle đi về y nguyên.
    rm -f "$ZIP_PATH"
    ditto -c -k --keepParent "$APP" "$ZIP_PATH"
    echo "  ZIP: $(basename "$ZIP_PATH") ($(du -h "$ZIP_PATH" | cut -f1))"

    # create-dmg nhận đường dẫn .app TUYỆT ĐỐI và chạy trong thư mục đích riêng
    # của arch này, để tệp "<App> <ver>.dmg" nó tự đặt tên rơi đúng chỗ rồi đổi tên.
    DMG_STAGE="$DIST/dmg-$ARCH"
    rm -rf "$DMG_STAGE"; mkdir -p "$DMG_STAGE"
    if (( DRY_RUN == 1 )); then
      (cd "$DMG_STAGE" && create-dmg --no-code-sign "$APP" .)
    else
      (cd "$DMG_STAGE" && create-dmg --identity="$SIGN_IDENTITY" "$APP" .)
    fi
    shopt -s nullglob
    dmgs=("$DMG_STAGE"/*.dmg)
    shopt -u nullglob
    (( ${#dmgs[@]} == 1 )) || { red "create-dmg cho ra ${#dmgs[@]} tệp .dmg trong $DMG_STAGE"; exit 1; }
    rm -f "$DMG_PATH"
    mv "${dmgs[0]}" "$DMG_PATH"
    rmdir "$DMG_STAGE"
    echo "  DMG: $(basename "$DMG_PATH") ($(du -h "$DMG_PATH" | cut -f1))"
    state_mark_done "dist_$ARCH"
  else
    green "3g/$ARCH  ZIP + DMG (bỏ qua)"
  fi

  # ── h. notarize + staple DMG ──────────────────────────────────────────
  if ! state_is_done "notarize_dmg_$ARCH"; then
    bold "3h/$ARCH  Notarize + staple DMG (lượt nộp riêng)"
    if (( DRY_RUN == 1 )); then
      echo "  [dry-run] Sẽ nộp DMG + staple"
    else
      notarize_resilient "$DMG_PATH" "notarize_dmg_${ARCH}_id" "$NOTARIZE_PROFILE" \
        || { red "Notarize DMG $ARCH hỏng. Chạy lại với --resume."; exit 1; }
      xcrun stapler staple "$DMG_PATH"
      xcrun stapler validate "$DMG_PATH"
    fi
    state_mark_done "notarize_dmg_$ARCH"
  else
    green "3h/$ARCH  Notarize DMG (bỏ qua)"
  fi

  # ── i. kiểm cuối ──────────────────────────────────────────────────────
  # Giải ZIP bằng `ditto -x -k` (đúng cách Squirrel.Mac làm lúc chạy; `unzip` làm
  # rơi resource fork và báo "sealed resource missing" giả trên một ZIP lành).
  if ! state_is_done "verify_$ARCH"; then
    bold "3i/$ARCH  Kiểm cuối — ZIP (giải bằng ditto) + DMG (mount), spctl"
    if (( DRY_RUN == 1 )); then
      echo "  [dry-run] Sẽ spctl ZIP + DMG"
    else
      ZIP_TMP="$(mktemp -d -t ainovel-verify-zip)"
      ditto -x -k "$ZIP_PATH" "$ZIP_TMP"
      spctl -a -vv --type execute "$ZIP_TMP/$PRODUCT_NAME.app"
      rm -rf "$ZIP_TMP"
      DMG_MNT="$(mktemp -d -t ainovel-verify-mnt)"
      hdiutil attach "$DMG_PATH" -nobrowse -readonly -mountpoint "$DMG_MNT" >/dev/null
      spctl -a -vv --type execute "$DMG_MNT/$PRODUCT_NAME.app"
      spctl -a -vv --type open --context context:primary-signature "$DMG_PATH"
      hdiutil detach "$DMG_MNT" -quiet || true
      rmdir "$DMG_MNT" 2>/dev/null || true
    fi
    state_mark_done "verify_$ARCH"
  else
    green "3i/$ARCH  Kiểm cuối (bỏ qua)"
  fi
done

# ════════════════════════════════════════════════════════════════════════
# Bước 4 — Windows x64 (NSIS, chưa ký), dựng chéo từ Mac
# ════════════════════════════════════════════════════════════════════════
WIN_EXE="$DIST/$ARTIFACT_PREFIX-Setup-$VERSION.exe"
WIN_MAP="$WIN_EXE.blockmap"
WIN_YML="$DIST/latest.yml"

if (( SKIP_WINDOWS == 1 )); then
  warn "4/6  Windows bỏ qua (--skip-windows) — chạy desktop/scripts/release.ps1 $VERSION trên máy Windows"
elif ! state_is_done win; then
  bold "4/6  Windows x64 — build-sidecar windows/amd64 + forge make (NSIS)"
  win_ok=1
  bash "$SCRIPTS/build-sidecar.sh" windows amd64 "$VERSION" --skip-web || win_ok=0
  if (( win_ok == 1 )); then
    rm -rf "$DESKTOP/out/$PRODUCT_NAME-win32-x64" "$DESKTOP/out/make/nsis"
    # KHÔNG đặt CI: maker NSIS (electron-builder) thấy CI là tự publish lên GitHub
    # rồi chết vì thiếu token. Gỡ cả CI lẫn GITHUB_TOKEN khỏi môi trường của nó.
    env -u CI -u GITHUB_TOKEN npx electron-forge make --platform=win32 --arch=x64 || win_ok=0
  fi
  if (( win_ok == 1 )); then
    shopt -s nullglob
    exes=("$DESKTOP"/out/make/nsis/x64/*.exe)
    shopt -u nullglob
    if (( ${#exes[@]} != 1 )) || [[ ! -f "$DESKTOP/out/make/nsis/x64/latest.yml" ]]; then
      red "forge make xong nhưng out/make/nsis/x64 không có đúng 1 .exe + latest.yml"
      win_ok=0
    fi
  fi
  if (( win_ok == 1 )); then
    # electron-builder đặt tên "<productName> Setup <ver>.exe" (CÓ dấu cách) và ghi
    # đúng tên đó vào latest.yml. GitHub đổi dấu cách thành dấu chấm khi upload →
    # tên trong latest.yml không khớp asset → updater 404 lặng lẽ (lingoreup v0.3.6).
    # Đổi tên về dạng của spec rồi sửa latest.yml theo; sha512/size theo NỘI DUNG
    # nên không đổi. .blockmap không có tên trong latest.yml — updater suy ra
    # thành "<url>.blockmap", nên chỉ cần đổi tên tệp cho khớp.
    OLD_EXE="$(basename "${exes[0]}")"
    [[ -n "$OLD_EXE" ]] || { red "Không xác định được tên bộ cài gốc"; exit 1; }
    cp "${exes[0]}" "$WIN_EXE"
    if [[ -f "${exes[0]}.blockmap" ]]; then cp "${exes[0]}.blockmap" "$WIN_MAP"; fi
    OLD_EXE="$OLD_EXE" NEW_EXE="$(basename "$WIN_EXE")" perl -pe '
      BEGIN { $o = $ENV{OLD_EXE}; $n = $ENV{NEW_EXE}; }
      s/\Q$o\E/$n/g;
    ' "$DESKTOP/out/make/nsis/x64/latest.yml" > "$WIN_YML"
    grep -qF "$(basename "$WIN_EXE")" "$WIN_YML" \
      || { red "latest.yml không nhắc tới $(basename "$WIN_EXE") sau khi đổi tên"; exit 1; }
    # Khẳng định sha512 trong latest.yml đúng là của tệp sẽ upload.
    WIN_SHA="$(shasum -a 512 "$WIN_EXE" | awk '{print $1}' | xxd -r -p | base64)"
    if [[ -z "$WIN_SHA" ]] || ! grep -qF "sha512: $WIN_SHA" "$WIN_YML"; then
      red "sha512 trong latest.yml không khớp $WIN_EXE"; exit 1
    fi
    echo "  $(basename "$WIN_EXE") ($(du -h "$WIN_EXE" | cut -f1)), latest.yml, $( [[ -f "$WIN_MAP" ]] && basename "$WIN_MAP")"
    state_mark_done win
  else
    warn "Dựng Windows từ Mac thất bại — bản mac vẫn phát hành."
    warn "Sau đó chạy trên máy Windows: powershell -ExecutionPolicy Bypass -File desktop\\scripts\\release.ps1 $VERSION"
  fi
else
  green "4/6  Windows (bỏ qua — đã xong)"
fi

# ════════════════════════════════════════════════════════════════════════
# Bước 5 — latest-mac.yml hai arch
# ════════════════════════════════════════════════════════════════════════
# electron-updater MacUpdater chọn tệp theo chuỗi con "arm64" trong url: máy
# Apple Silicon lấy tệp có "arm64", máy Intel lấy tệp KHÔNG có. Tên tệp đã mã
# hóa arch (…-arm64.zip / …-x64.zip). arm64 PHẢI đứng đầu: client cũ (trước 6)
# bỏ qua lọc arch và lấy files[0].
bold "5/6  latest-mac.yml (arm64 + x64)"
A_ZIP="$DIST/$ARTIFACT_PREFIX-$VERSION-arm64.zip"
X_ZIP="$DIST/$ARTIFACT_PREFIX-$VERSION-x64.zip"
for f in "$A_ZIP" "$X_ZIP"; do [[ -f "$f" ]] || { red "Thiếu $f"; exit 1; }; done

# sha512 của electron-updater là BASE64 của digest nhị phân, không phải hex.
sha512_b64() { shasum -a 512 "$1" | awk '{print $1}' | xxd -r -p | base64; }
size_of()    { stat -f%z "$1"; }

A_SHA="$(sha512_b64 "$A_ZIP")"; A_SZ="$(size_of "$A_ZIP")"
X_SHA="$(sha512_b64 "$X_ZIP")"; X_SZ="$(size_of "$X_ZIP")"
MAC_YML="$DIST/latest-mac.yml"
cat > "$MAC_YML" <<EOF
version: $VERSION
files:
  - url: $(basename "$A_ZIP")
    sha512: $A_SHA
    size: $A_SZ
  - url: $(basename "$X_ZIP")
    sha512: $X_SHA
    size: $X_SZ
path: $(basename "$A_ZIP")
sha512: $A_SHA
releaseDate: '$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'
EOF
echo "  arm64: $(basename "$A_ZIP") ($A_SZ B)"
echo "  x64:   $(basename "$X_ZIP") ($X_SZ B)"

# ════════════════════════════════════════════════════════════════════════
# Bước 6 — gh release
# ════════════════════════════════════════════════════════════════════════
ASSETS=(
  "$A_ZIP" "$DIST/$ARTIFACT_PREFIX-$VERSION-arm64.dmg"
  "$X_ZIP" "$DIST/$ARTIFACT_PREFIX-$VERSION-x64.dmg"
  "$MAC_YML"
)
if state_is_done win; then
  ASSETS+=("$WIN_EXE" "$WIN_YML")
  [[ -f "$WIN_MAP" ]] && ASSETS+=("$WIN_MAP")
fi
for f in "${ASSETS[@]}"; do [[ -f "$f" ]] || { red "Thiếu asset $f"; exit 1; }; done

if ! state_is_done gh_release; then
  bold "6/6  gh release $TAG trên $GH_REPO (${#ASSETS[@]} tệp)"
  for f in "${ASSETS[@]}"; do echo "    $(basename "$f")  ($(du -h "$f" | cut -f1))"; done
  if (( DRY_RUN == 1 )); then
    echo "  [dry-run] Sẽ tạo release $TAG và upload các tệp trên"
  else
    ensure_gh_token || exit 1
    if [[ -n "$PREV_TAG" ]]; then
      CHANGES="$(git -C "$REPO" log --pretty='- %s' "$PREV_TAG..$TAG" -- desktop internal cmd web 2>/dev/null || true)"
    else
      CHANGES="- Bản app desktop đầu tiên."
    fi
    NOTES="AINovel Studio $TAG

## Tải về

| Máy | Tệp |
|---|---|
| Mac chip Apple (M1, M2, M3, M4…) | \`$ARTIFACT_PREFIX-$VERSION-arm64.dmg\` |
| Mac chip Intel | \`$ARTIFACT_PREFIX-$VERSION-x64.dmg\` |
| Windows 10/11 (64-bit) | \`$ARTIFACT_PREFIX-Setup-$VERSION.exe\` |

Windows: bộ cài chưa ký, SmartScreen sẽ hỏi một lần — bấm **More info → Run anyway**.

## Thay đổi${PREV_TAG:+ từ $PREV_TAG}

${CHANGES:-- (không có commit nào chạm desktop/internal/cmd/web)}"
    if ghx release view "$TAG" --repo "$GH_REPO" >/dev/null 2>&1; then
      # release.ps1 có thể đã tạo release này trước (Windows chạy trước) — gắn thêm.
      ghx release upload "$TAG" --repo "$GH_REPO" --clobber "${ASSETS[@]}"
    else
      ghx release create "$TAG" --repo "$GH_REPO" --verify-tag \
        --title "AINovel Studio $TAG" --notes "$NOTES" "${ASSETS[@]}"
    fi
  fi
  state_mark_done gh_release
else
  green "6/6  gh release (bỏ qua)"
fi

echo
if (( DRY_RUN == 1 )); then
  green "Tập dượt $TAG xong — không ký, không notarize, không đụng git, không upload."
  echo "    Tệp ở: $DIST"
else
  green "Phát hành $TAG xong"
  echo "    https://github.com/$GH_REPO/releases/tag/$TAG"
  state_is_done win || warn "Chưa có bản Windows: chạy desktop\\scripts\\release.ps1 $VERSION trên máy Windows."
fi
