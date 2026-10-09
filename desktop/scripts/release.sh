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
# Đây là lối vào DUY NHẤT bump phiên bản, tạo tag và tạo GitHub release.
# release.ps1 chỉ gắn thêm bản Windows dựng-trên-Windows vào release đã có.
#
# Không có gì lên remote cho tới bước 6: tag chỉ tạo ở máy (bước 2), nhánh + tag
# được push nguyên tử ngay trước `gh release create`. Hỏng ở bất kỳ bước nào trước
# đó thì origin y nguyên.
#
# Các bước (~30-45 phút, phần lớn là chờ Apple notarize 4 lượt):
#   1.  Điều kiện tiên quyết; `git fetch origin`, HEAD phải bằng hoặc đi trước
#       (fast-forward được) origin/$RELEASE_BRANCH
#   2.  Bump desktop/package.json + commit + tag vX.Y.Z — CHỈ Ở MÁY
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
#   4.  Windows: electron-forge make --platform=win32 --arch=x64 (NSIS), dựng chéo
#       và KHÔNG smoke được trên Mac — release notes mang một dòng nhắc kiểm trên
#       Windows thật (release.ps1 xóa dòng đó sau khi dựng lại + smoke + thay tệp).
#       Hỏng thì cảnh báo — bản mac vẫn phát hành, Windows gắn sau bằng release.ps1.
#   5.  latest-mac.yml hai arch (arm64 đứng TRƯỚC)
#   6.  push nguyên tử nhánh + tag → gh release create --verify-tag + upload
#
# Cách dùng:
#   desktop/scripts/release.sh 1.0.0                 # phát hành thật
#   desktop/scripts/release.sh 1.0.0 --resume        # tiếp sau khi hỏng giữa chừng
#   desktop/scripts/release.sh 1.0.0 --dry-run       # tập dượt: build + đóng gói +
#                                                    # smoke; KHÔNG đụng git/remote/
#                                                    # Keychain, KHÔNG ký/notarize,
#                                                    # KHÔNG upload. package.json được
#                                                    # bump tạm và trả lại khi thoát.
#   desktop/scripts/release.sh 1.0.0 --skip-windows  # chỉ mac (Windows gắn sau bằng release.ps1)
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
    -h|--help)      awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; exit 0 ;;
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
ORIGIN_RE='github\.com[:/]huuhoa143/ainovel-studio(\.git)?/?$'
BUMP_SUBJECT="chore(desktop): phát hành $TAG"

# Dry-run bump tạm package.json + package-lock.json để mọi thứ dựng ra mang đúng
# $VERSION; bản gốc chép vào đây và được trả về khi thoát, dù thoát kiểu gì.
DRY_BACKUP=""

cleanup_release() {
  local rc=$?
  rm -f /tmp/ainovel-notary-*.zip 2>/dev/null || true
  if [[ -n "$DRY_BACKUP" ]]; then
    cp "$DRY_BACKUP/package.json" "$DESKTOP/package.json"
    cp "$DRY_BACKUP/package-lock.json" "$DESKTOP/package-lock.json"
    rm -rf "$DRY_BACKUP"
    echo "  [dry-run] Đã trả desktop/package.json + package-lock.json về như cũ"
  fi
  # Chỉ xóa tệp trạng thái khi THÀNH CÔNG — giữ nó cho --resume khi hỏng.
  if (( rc == 0 )); then
    state_cleanup
  else
    red "Hỏng (mã $rc). Trạng thái giữ ở $STATE_FILE — sửa xong chạy lại với --resume."
    if (( DRY_RUN == 0 )) && ! state_is_done published; then
      red "origin chưa bị đổi gì: tag $TAG (nếu đã tạo) và commit bump chỉ nằm ở máy này."
    fi
  fi
  return $rc
}
trap cleanup_release EXIT

# In cách làm lại khi origin/$RELEASE_BRANCH đã đi trước bản đã build: tag ở máy
# trỏ vào commit không còn fast-forward được, phải dựng lại từ mã mới.
print_rebuild_recovery() {
  red "origin/$RELEASE_BRANCH đã có commit mà HEAD không có — không push được, origin chưa bị đổi gì."
  echo "  Tag $TAG ở máy dựa trên $(git -C "$REPO" rev-parse --short "$TAG^{commit}"). Làm lại từ mã mới nhất:" >&2
  if [[ "$(git -C "$REPO" log -1 --format=%s "$TAG" 2>/dev/null)" == "$BUMP_SUBJECT" ]]; then
    echo "    git reset --hard $TAG~1          # bỏ commit bump (cây đã sạch lúc bắt đầu)" >&2
  fi
  echo "    git tag -d $TAG" >&2
  echo "    git pull --rebase origin $RELEASE_BRANCH" >&2
  echo "    rm -f '$STATE_FILE'" >&2
  echo "    desktop/scripts/release.sh $VERSION" >&2
}

# ════════════════════════════════════════════════════════════════════════
# Bước 1 — Điều kiện tiên quyết
# ════════════════════════════════════════════════════════════════════════
bold "1/6  Kiểm điều kiện (dry-run=$DRY_RUN, resume=$RESUME)"

[[ "$(uname -s)" == "Darwin" && "$(uname -m)" == "arm64" ]] \
  || { red "release.sh chạy trên Mac Apple Silicon (máy này: $(uname -s)/$(uname -m))"; exit 1; }

REQUIRED=(go node npm npx gh jq shasum xxd base64 file perl ditto create-dmg xcrun codesign hdiutil spctl curl)
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

# Push nhầm remote (fork kj, upstream) là tag + nhánh rơi sai chỗ mà không ai báo.
ORIGIN_URL="$(git -C "$REPO" remote get-url origin 2>/dev/null || true)"
[[ "$ORIGIN_URL" =~ $ORIGIN_RE ]] \
  || { red "origin là '${ORIGIN_URL:-<không có>}', phải là github.com/$GH_REPO"; exit 1; }

BRANCH="$(git -C "$REPO" branch --show-current)"
if (( DRY_RUN == 0 )) && [[ "$BRANCH" != "$RELEASE_BRANCH" ]]; then
  # Tag phải nằm trên lịch sử của $RELEASE_BRANCH: từ một nhánh khác, tag sẽ trỏ vào
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
# desktop/package.json (trừ chính $TAG, có thể đã tạo ở máy từ lượt trước).
PREV_TAG=""
while IFS= read -r t; do
  [[ "$t" != "$TAG" ]] || continue
  if git -C "$REPO" cat-file -e "$t:desktop/package.json" 2>/dev/null; then PREV_TAG="$t"; break; fi
done < <(git -C "$REPO" tag --list 'v[0-9]*' --sort=-v:refname)

HEAD_SHA="$(git -C "$REPO" rev-parse HEAD)"
LOCAL_TAG_SHA="$(git -C "$REPO" rev-parse -q --verify "refs/tags/$TAG^{commit}" || true)"

if (( RESUME == 1 )); then
  [[ -f "$(state_path)" ]] || { red "Không có $(state_path) để resume"; exit 1; }
  [[ "$(state_get version)" == "$VERSION" ]] || {
    red "Trạng thái là của v$(state_get version), bạn yêu cầu v$VERSION"; exit 1; }
  green "Resume $TAG (đã xong: $(jq -r '.steps_done | join(",")' "$(state_path)"))"
  PREV_TAG="$(state_get prev_tag)"
  # Các bước đã xong được build từ commit của tag: resume từ commit khác là đem mã
  # này dán nhãn của mã kia.
  if (( DRY_RUN == 0 )) && state_is_done tag; then
    [[ -n "$LOCAL_TAG_SHA" ]] || { red "Trạng thái ghi đã tag mà không thấy tag $TAG ở máy — làm lại từ đầu (bỏ --resume)."; exit 1; }
    [[ "$HEAD_SHA" == "$LOCAL_TAG_SHA" ]] || {
      red "HEAD (${HEAD_SHA:0:12}) không phải commit của $TAG (${LOCAL_TAG_SHA:0:12}) — mọi thứ đã build là của $TAG."
      echo "  Đưa HEAD về đúng tag (vd. bỏ commit mới: git reset --hard $TAG) rồi chạy lại với --resume." >&2
      exit 1
    }
  fi
else
  state_init "$VERSION"
  state_set prev_tag "$PREV_TAG"
fi

# Đối chiếu remote — chỉ ĐỌC (fetch, ls-remote, gh release view). Dry-run không nói
# chuyện với remote, chỉ so với origin/$RELEASE_BRANCH đã có sẵn ở máy.
if (( DRY_RUN == 0 )); then
  git_gh -C "$REPO" fetch --quiet origin "$RELEASE_BRANCH"
fi
# Bước 6 push nhánh kiểu fast-forward: HEAD phải bằng hoặc đi trước origin. Sau khi
# đã push (published) thì origin đi tiếp là chuyện bình thường, không chặn nữa.
if ! state_is_done published; then
  if ! git -C "$REPO" merge-base --is-ancestor "refs/remotes/origin/$RELEASE_BRANCH" HEAD 2>/dev/null; then
    if (( DRY_RUN == 1 )); then
      warn "HEAD không fast-forward được lên origin/$RELEASE_BRANCH (theo lần fetch gần nhất) — bản thật sẽ từ chối."
    elif [[ -n "$LOCAL_TAG_SHA" ]]; then
      print_rebuild_recovery; exit 1
    else
      red "HEAD không chứa origin/$RELEASE_BRANCH. Kéo về trước: git pull --rebase origin $RELEASE_BRANCH"
      exit 1
    fi
  fi
fi

if (( DRY_RUN == 0 )); then
  # Lấy commit tag trỏ tới (dòng ^{} của tag có chú thích, hoặc chính nó nếu là tag nhẹ).
  REMOTE_TAG_SHA="$(git_gh -C "$REPO" ls-remote --tags origin "refs/tags/$TAG" "refs/tags/$TAG^{}" \
    | awk -v t="refs/tags/$TAG" '$2 == t "^{}" { p = $1 } $2 == t { l = $1 } END { print (p != "" ? p : l) }')"
  if [[ -n "$REMOTE_TAG_SHA" ]]; then
    if (( RESUME == 1 )) && [[ "$REMOTE_TAG_SHA" == "$LOCAL_TAG_SHA" && "$REMOTE_TAG_SHA" == "$HEAD_SHA" ]]; then
      # Lượt trước đã push rồi hỏng trước khi kịp ghi trạng thái.
      state_is_done published || { state_mark_done tag; state_mark_done published; }
    elif (( RESUME == 0 )); then
      red "Tag $TAG đã có trên origin. Chọn phiên bản mới, hoặc --resume nếu đang dở chính bản này."
      exit 1
    else
      red "Tag $TAG trên origin trỏ vào ${REMOTE_TAG_SHA:0:12}, không phải HEAD/tag ở máy (${HEAD_SHA:0:12})."
      exit 1
    fi
  fi
  if (( RESUME == 0 )) && ghx release view "$TAG" --repo "$GH_REPO" >/dev/null 2>&1; then
    red "Release $TAG đã có trên $GH_REPO."
    exit 1
  fi
fi
green "Điều kiện OK ($CURRENT_VERSION → $VERSION; tag trước: ${PREV_TAG:-không có})"

# ════════════════════════════════════════════════════════════════════════
# Bước 2 — Bump + commit + tag, CHỈ Ở MÁY (push để dành cho bước 6)
# ════════════════════════════════════════════════════════════════════════
if (( DRY_RUN == 1 )); then
  bold "2/6  [dry-run] Bump tạm $CURRENT_VERSION → $VERSION — không commit, không tag"
  if [[ "$CURRENT_VERSION" != "$VERSION" ]]; then
    # Không bump thì app, latest.yml và tên bộ cài Windows mang phiên bản cũ trong
    # khi sidecar mang $VERSION — tập dượt khác bản thật.
    DRY_BACKUP="$(mktemp -d -t ainovel-dry-pkg)"
    cp "$DESKTOP/package.json" "$DESKTOP/package-lock.json" "$DRY_BACKUP/"
    npm version "$VERSION" --no-git-tag-version >/dev/null
  fi
elif ! state_is_done tag; then
  bold "2/6  Bump $CURRENT_VERSION → $VERSION, commit, tag $TAG (chỉ ở máy)"
  if [[ -n "$LOCAL_TAG_SHA" ]]; then
    # Tag sót của một lượt hỏng trước bước 6: dùng lại nếu đúng là HEAD.
    [[ "$LOCAL_TAG_SHA" == "$HEAD_SHA" ]] || {
      red "Tag $TAG ở máy trỏ vào ${LOCAL_TAG_SHA:0:12}, không phải HEAD (${HEAD_SHA:0:12})."
      echo "  Tag chưa lên origin (đã kiểm ở bước 1). Nếu là tag sót: git tag -d $TAG" >&2
      exit 1
    }
    [[ "$CURRENT_VERSION" == "$VERSION" ]] || {
      red "Tag $TAG trỏ vào HEAD nhưng desktop/package.json là $CURRENT_VERSION"; exit 1; }
    echo "  Tag $TAG ở máy đã trỏ vào HEAD — dùng lại"
  else
    if [[ "$CURRENT_VERSION" != "$VERSION" ]]; then
      # `npm version` sửa cả package-lock.json, đúng định dạng npm, không tự tag.
      npm version "$VERSION" --no-git-tag-version >/dev/null
      git -C "$REPO" add desktop/package.json desktop/package-lock.json
      git -C "$REPO" commit -m "$BUMP_SUBJECT"
    else
      # Bản đầu tiên: package.json đã sẵn 1.0.0, không có gì để bump — chỉ tag.
      echo "  desktop/package.json đã là $VERSION — chỉ tag"
    fi
    git -C "$REPO" tag -a "$TAG" -m "AINovel Studio $TAG"
    HEAD_SHA="$(git -C "$REPO" rev-parse HEAD)"
    LOCAL_TAG_SHA="$HEAD_SHA"
  fi
  state_mark_done tag
  green "Tag $TAG ở máy → ${HEAD_SHA:0:12} (chưa push)"
else
  green "2/6  Bump + tag (bỏ qua — $TAG ở máy)"
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
  # đúng thứ người dùng nhận; bản x64 chạy qua Rosetta. smoke.sh luôn chạy app
  # trong userData tạm + Keychain giả: không đụng dữ liệu/Keychain thật của máy
  # build, nên không có hộp thoại Keychain nào chặn giữa chừng.
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
  warn "4/6  Windows bỏ qua (--skip-windows) — máy Windows kiểm cập nhật sẽ gặp 404 tới khi release.ps1 gắn bộ cài + latest.yml (xem cuối lượt)"
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
    warn "Bộ cài Windows dựng chéo — KHÔNG smoke được trên Mac. Release notes sẽ mang dòng nhắc; kiểm trên Windows thật sau khi phát hành (xem cuối lượt)."
    state_mark_done win
  else
    warn "Dựng Windows từ Mac thất bại — bản mac vẫn phát hành; máy Windows kiểm cập nhật sẽ gặp 404 tới khi release.ps1 gắn bộ cài + latest.yml (xem cuối lượt)."
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
# Bước 6 — push nhánh + tag, rồi gh release
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

# Bản Windows của release.sh luôn dựng chéo — không có cách smoke nó trên Mac.
# Dòng mang WIN_UNVERIFIED_MARKER trong release notes là lời nhắc công khai cho tới
# khi release.ps1 dựng lại trên Windows, smoke, thay tệp và XÓA đúng dòng đó.
# release.ps1 tìm theo chính chuỗi này — đổi ở đây thì đổi cả bên đó.
WIN_UNVERIFIED_MARKER="<!-- ainovel:windows-unverified -->"
if state_is_done win; then
  WIN_NOTE="> Bộ cài Windows của bản này được dựng trên macOS và chưa được chạy thử trên máy Windows thật. Gặp lỗi xin báo ở mục Issues. $WIN_UNVERIFIED_MARKER"
else
  WIN_NOTE="> Bộ cài Windows chưa có trong bản này — sẽ được bổ sung sau. $WIN_UNVERIFIED_MARKER"
fi

windows_followup() {
  warn "════════════════════════════════════════════════════════════════════"
  if state_is_done win; then
    warn " Bộ cài Windows được DỰNG CHÉO từ Mac và CHƯA SMOKE trên Windows thật."
  else
    warn " Release CHƯA có bộ cài Windows — và CHƯA có latest.yml."
    warn " Từ giờ tới lúc gắn xong, MỌI máy Windows đang cài app kiểm cập nhật đều"
    warn " nhận lỗi 404 (release mới nhất không có tệp cập nhật Windows). Gắn càng sớm càng tốt."
  fi
  warn " Trên một máy Windows (đứng ở tag $TAG), chạy:"
  warn "   powershell -ExecutionPolicy Bypass -File desktop\\scripts\\release.ps1 $VERSION"
  warn " Nó dựng lại, smoke, thay Setup.exe + .blockmap + latest.yml và gỡ dòng nhắc"
  warn " trong release notes. Không có Windows để dựng: tải Setup.exe từ release về"
  warn " một máy Windows, cài, mở app thấy màn Cài đặt, đóng app, Task Manager không"
  warn " còn ainovel-cli.exe — rồi tự xóa dòng nhắc trong release notes."
  warn "════════════════════════════════════════════════════════════════════"
}

if ! state_is_done published; then
  bold "6/6  Push nguyên tử $RELEASE_BRANCH + $TAG lên origin"
  if (( DRY_RUN == 1 )); then
    echo "  [dry-run] Sẽ push --atomic origin $TAG^{commit}:$RELEASE_BRANCH + $TAG"
  else
    ensure_gh_token || exit 1
    TAG_SHA="$(git -C "$REPO" rev-parse "$TAG^{commit}")"
    # Kiểm lại ngay trước khi push: 30-45 phút build đủ lâu để origin đi tiếp.
    git_gh -C "$REPO" fetch --quiet origin "$RELEASE_BRANCH"
    git -C "$REPO" merge-base --is-ancestor "refs/remotes/origin/$RELEASE_BRANCH" "$TAG_SHA" \
      || { print_rebuild_recovery; exit 1; }
    # Push đúng commit của tag (không phải HEAD — HEAD có thể đã đổi trong lúc build).
    # --atomic: origin nhận cả nhánh lẫn tag, hoặc không nhận gì — không bao giờ có
    # tag trên origin mà $RELEASE_BRANCH chưa có commit của nó.
    if ! git_gh -C "$REPO" push --atomic origin "$TAG_SHA:refs/heads/$RELEASE_BRANCH" "refs/tags/$TAG"; then
      git_gh -C "$REPO" fetch --quiet origin "$RELEASE_BRANCH" || true
      if ! git -C "$REPO" merge-base --is-ancestor "refs/remotes/origin/$RELEASE_BRANCH" "$TAG_SHA"; then
        print_rebuild_recovery
      else
        red "Push hỏng (mạng/quyền?) — push nguyên tử nên origin chưa bị đổi gì. Sửa xong chạy lại với --resume."
      fi
      exit 1
    fi
    green "Đã push $RELEASE_BRANCH + $TAG"
  fi
  state_mark_done published
else
  green "6/6  Push (bỏ qua — đã lên origin)"
fi

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

Windows: bộ cài chưa ký. Trình duyệt có thể báo tệp \"không thường được tải\" — chọn **Giữ lại (Keep)**; lúc chạy, SmartScreen hỏi một lần — bấm **More info → Run anyway**.

$WIN_NOTE

## Thay đổi${PREV_TAG:+ từ $PREV_TAG}

${CHANGES:-- (không có commit nào chạm desktop/internal/cmd/web)}"
    if (( RESUME == 1 )) && ghx release view "$TAG" --repo "$GH_REPO" >/dev/null 2>&1; then
      # Chỉ khi --resume: lượt trước của CHÍNH script này đã tạo release rồi chết
      # trước khi kịp ghi trạng thái. Lượt mới đã bị bước 1 chặn nếu release có sẵn.
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
  green "Tập dượt $TAG xong — không ký, không notarize, không commit/tag/push, không nói chuyện với remote, không upload."
  echo "    Tệp ở: $DIST"
else
  green "Phát hành $TAG xong"
  echo "    https://github.com/$GH_REPO/releases/tag/$TAG"
  windows_followup
fi
