<#
.SYNOPSIS
  Gan bo cai Windows x64 (NSIS, CHUA KY) dung + smoke TREN WINDOWS vao mot
  GitHub release DA CO. Khong bump, khong tag, khong tao release.

.DESCRIPTION
  desktop/scripts/release.sh (Mac) la loi vao DUY NHAT bump phien ban, tao tag
  vX.Y.Z va tao GitHub release. Script nay chi chay SAU do, tren may Windows:
    - release.sh dung cheo Windows that bai, hoac chay voi --skip-windows: gan
      bo cai con thieu;
    - release.sh dung cheo thanh cong: bo cai do CHUA DUOC SMOKE (Mac khong chay
      duoc .exe). Chay script nay de thay no bang ban dung + smoke tren Windows.

  Cac buoc (~5-10 phut):
    1. Dieu kien: go, node, npm, git, gh; origin dung repo; cay lam viec sach;
       gh ghim huuhoa143; tag vX.Y.Z DA CO tren origin; release vX.Y.Z DA CO
    2. HEAD phai dung tai commit cua tag (git checkout vX.Y.Z) va
       desktop\package.json phai la X.Y.Z
    3. Sidecar: npm ci + build web, go build windows/amd64 -> desktop\resources\bin,
       chep web\out -> desktop\resources\web (cung hop dong voi build-sidecar.sh)
    4. electron-forge make --platform=win32 --arch=x64 -> NSIS
    5. Doi ten "AINovel Studio Setup X.Y.Z.exe" -> AINovel-Studio-Setup-X.Y.Z.exe
       va sua latest.yml cho khop (GitHub doi dau cach thanh dau cham khi upload)
    6. Smoke: mo ban da dong goi voi userData TAM (khong dung du lieu that),
       cho AINOVEL_READY trong sidecar.log, GET /api/workshop = 200, dong cua so,
       khong con ainovel-cli.exe mo coi
    7. gh release upload --clobber Setup.exe + .blockmap + latest.yml, roi go dong
       nhac "chua chay thu tren Windows" (WinUnverifiedMarker) khoi release notes

  Khong co che do "tai Setup.exe da phat hanh ve roi smoke": chay bo cai NSIS la
  CAI THAT (ghi registry, shortcut, go ban da cai truoc do) - khong re va khong
  vo hai tren may dang dung. Muon kiem tay bo cai da phat hanh: tai Setup.exe,
  cai, mo app thay man Cai dat, dong app, Task Manager khong con ainovel-cli.exe,
  roi xoa dong nhac trong release notes.

  Tep ASCII khong dau co chu y: PowerShell 5.1 doc .ps1 khong BOM theo bang ma
  ANSI, chu Viet co dau trong chuoi se vo.

  Cach dung:
    git checkout v1.0.0
    powershell -ExecutionPolicy Bypass -File desktop\scripts\release.ps1 1.0.0
    ... 1.0.0 -DryRun     # dung + smoke, khong upload; khong noi chuyen voi
                          # remote (tag/release chi kiem neu da co o may)
    ... 1.0.0 -SkipWeb    # web\out da dung san, khong npm ci/build lai
#>

param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Version,
  [switch]$DryRun,
  [switch]$SkipWeb
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($Version -notmatch '^[0-9]+\.[0-9]+\.[0-9]+$') { throw "VERSION phai dang X.Y.Z (nhan: $Version)" }
$Tag = "v$Version"

$Desktop = Split-Path -Parent $PSScriptRoot
$Repo = Split-Path -Parent $Desktop
$GhRepo = 'huuhoa143/ainovel-studio'
$GhUser = 'huuhoa143'
$OriginRe = 'github\.com[:/]huuhoa143/ainovel-studio(\.git)?/?$'
$ProductName = 'AINovel Studio'
$ArtifactPrefix = 'AINovel-Studio'
$Dist = Join-Path $Desktop "out\release\$Version"
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
# Dong release.sh them vao release notes khi bo cai Windows chua duoc smoke tren
# Windows that. PHAI trung tung ky tu voi WIN_UNVERIFIED_MARKER trong release.sh.
$WinUnverifiedMarker = '<!-- ainovel:windows-unverified -->'
# Moi lenh git noi chuyen voi origin di qua credential helper cua gh (mang
# GH_TOKEN), xoa helper ke thua truoc: credential manager co the giu token cua
# tai khoan khac.
$GitGh = @('-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential')

function Bold($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Green($m) { Write-Host $m -ForegroundColor Green }
function Warn($m) { Write-Host $m -ForegroundColor Yellow }

# Invoke-Native - chay lenh ngoai va KIEM ma thoat. Duoi PS 5.1 +
# ErrorActionPreference=Stop, mot lenh ngoai ghi stderr (gh, git, npm deu hay
# ghi) bi bien thanh loi ket thuc TRUOC khi kip doc $LASTEXITCODE; con khi that
# bai thi lai KHONG nem loi. Ca hai chieu deu sai, nen moi lenh ngoai di qua day
# (hoac Invoke-NativeOutput khi can doc dau ra).
function Invoke-Native {
  param([string]$Exe, [string[]]$Arguments, [switch]$AllowFail)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    # Out-Host: dau ra cua lenh di thang ra man hinh, de ham chi TRA VE ma thoat.
    & $Exe @Arguments | Out-Host
    $code = $LASTEXITCODE
  } finally { $ErrorActionPreference = $prev }
  if (-not $AllowFail -and $code -ne 0) { throw "$Exe $($Arguments -join ' ') that bai (ma $code)" }
  return $code
}

# Invoke-NativeOutput - nhu Invoke-Native nhung TRA VE stdout (cac dong noi bang
# `n); stderr bo di. Ma thoat khac 0 la nem loi.
function Invoke-NativeOutput {
  param([string]$Exe, [string[]]$Arguments)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $out = & $Exe @Arguments 2>$null
    $code = $LASTEXITCODE
  } finally { $ErrorActionPreference = $prev }
  if ($code -ne 0) { throw "$Exe $($Arguments -join ' ') that bai (ma $code)" }
  return (@($out) -join "`n")
}

# Nhu `env -u GITHUB_TOKEN gh ...` ben release.sh: may nay co the mang GITHUB_TOKEN
# cua tai khoan khac, va no de len `gh auth switch`. Go no khoi tien trinh nay,
# roi ghim GH_TOKEN cua huuhoa143 (GH_TOKEN thang GITHUB_TOKEN trong thu tu cua gh).
Remove-Item Env:\GITHUB_TOKEN -ErrorAction SilentlyContinue
function Set-GhToken {
  if (-not $env:GH_TOKEN) {
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try { $t = (gh auth token --user $GhUser 2>$null) } finally { $ErrorActionPreference = $prev }
    if (-not $t) { throw "Khong lay duoc token gh cua '$GhUser' (gh auth login?)" }
    $env:GH_TOKEN = "$t".Trim()
  }
  $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { $login = (gh api user --jq .login 2>$null) } finally { $ErrorActionPreference = $prev }
  if ("$login".Trim() -ne $GhUser) { throw "Token gh thuoc '$login', khong phai '$GhUser'" }
}

# Test-PeAmd64 - doc header PE: 'MZ', offset e_lfanew, chu ky 'PE\0\0', Machine
# 0x8664. Kiem chinh tep vua build thay vi tin GOARCH.
function Test-PeAmd64([string]$Path) {
  $b = [System.IO.File]::ReadAllBytes($Path)
  if ($b.Length -lt 64 -or $b[0] -ne 0x4D -or $b[1] -ne 0x5A) { return $false }
  $pe = [BitConverter]::ToInt32($b, 0x3C)
  if ($b[$pe] -ne 0x50 -or $b[$pe + 1] -ne 0x45) { return $false }
  return ([BitConverter]::ToUInt16($b, $pe + 4) -eq 0x8664)
}

function Get-Sha512B64([string]$Path) {
  $sha = [System.Security.Cryptography.SHA512]::Create()
  $fs = [System.IO.File]::OpenRead($Path)
  try { return [Convert]::ToBase64String($sha.ComputeHash($fs)) } finally { $fs.Dispose(); $sha.Dispose() }
}

# Loi chan ban that nhung chi canh bao khi -DryRun (tap duot tu bat ky commit nao).
function Stop-OrWarn([string]$Message) {
  if ($DryRun) { Warn "  [dry-run] $Message" } else { throw $Message }
}

$smokeProc = $null
$smokeUserData = $null
$smokeOk = $false
try {
  # ======================================================================
  # 1. Dieu kien
  # ======================================================================
  Bold "1/7  Dieu kien (dry-run=$DryRun)"
  $missing = @('go', 'node', 'npm', 'npx', 'git', 'gh') | Where-Object { -not (Get-Command $_ -ErrorAction SilentlyContinue) }
  if ($missing) { throw "Thieu cong cu: $($missing -join ', ')" }
  if (-not (Test-Path (Join-Path $Desktop 'forge.config.ts'))) { throw 'Thieu desktop\forge.config.ts' }

  Set-Location $Repo
  $originUrl = Invoke-NativeOutput git @('remote', 'get-url', 'origin')
  if ($originUrl -notmatch $OriginRe) { throw "origin la '$originUrl', phai la github.com/$GhRepo" }
  $tracked = git status --porcelain | Where-Object { $_ -notmatch '^\?\?' }
  if ($tracked) {
    git status --short
    Stop-OrWarn 'Cay lam viec co thay doi chua commit. Commit hoac stash truoc.'
  }
  if (-not $DryRun) { Set-GhToken }

  # ======================================================================
  # 2. Tag + release phai co san (release.sh tao ca hai); HEAD = commit cua tag
  # ======================================================================
  Bold "2/7  Tag $Tag va release tren $GhRepo"
  if (-not $DryRun) {
    # Commit tag tro toi tren origin: dong ^{} cua tag co chu thich, hoac chinh no.
    $lsRemote = Invoke-NativeOutput git ($GitGh + @('ls-remote', '--tags', 'origin', "refs/tags/$Tag", "refs/tags/$Tag^{}"))
    $remoteSha = $null
    foreach ($line in ($lsRemote -split "`n")) {
      $f = $line -split '\s+'
      if ($f.Count -lt 2) { continue }
      if ($f[1] -eq "refs/tags/$Tag^{}") { $remoteSha = $f[0] }
      elseif ($f[1] -eq "refs/tags/$Tag" -and -not $remoteSha) { $remoteSha = $f[0] }
    }
    if (-not $remoteSha) { throw "Tag $Tag chua co tren origin. release.sh (tren Mac) tao tag va release - chay no truoc." }
    # Khong --force: tag o may khac tag tren origin la loi phai nhin tan mat, khong ghi de.
    $code = Invoke-Native git ($GitGh + @('fetch', '--quiet', 'origin', "refs/tags/${Tag}:refs/tags/${Tag}")) -AllowFail
    if ($code -ne 0) { throw "Khong lay duoc tag $Tag tu origin (tag o may khac origin? xoa: git tag -d $Tag)" }
    $exists = ((Invoke-Native gh @('release', 'view', $Tag, '--repo', $GhRepo, '--json', 'tagName') -AllowFail) -eq 0)
    if (-not $exists) { throw "Chua co release $Tag tren $GhRepo. release.sh (tren Mac) tao release - chay no truoc." }
  }
  $head = Invoke-NativeOutput git @('rev-parse', 'HEAD')
  $tagCommit = $null
  if ((Invoke-Native git @('rev-parse', '-q', '--verify', "refs/tags/$Tag") -AllowFail) -eq 0) {
    $tagCommit = Invoke-NativeOutput git @('rev-parse', "$Tag^{commit}")
    if (-not $DryRun -and $tagCommit -ne $remoteSha) { throw "Tag $Tag o may ($tagCommit) khac origin ($remoteSha)" }
  }
  # Bo cai Windows PHAI dung tu dung commit cua tag, khong thi hai nen tang cung so
  # phien ban ma khac ma.
  if (-not $tagCommit) { Stop-OrWarn "Khong co tag $Tag o may - dung tu HEAD ($head)" }
  elseif ($tagCommit -ne $head) { Stop-OrWarn "HEAD ($head) khong o tag $Tag ($tagCommit). Chay: git checkout $Tag" }
  $pkgVersion = (Get-Content (Join-Path $Desktop 'package.json') -Raw | ConvertFrom-Json).version
  if ($pkgVersion -ne $Version) { Stop-OrWarn "desktop\package.json la $pkgVersion, khong phai $Version" }
  Green "  dung tu $(if ($tagCommit -eq $head) { "tag $Tag" } else { "HEAD $head" })"

  # ======================================================================
  # 3. Sidecar (cung hop dong voi build-sidecar.sh)
  # ======================================================================
  Bold '3/7  Sidecar windows/amd64 + web'
  if (-not $SkipWeb) {
    Set-Location (Join-Path $Repo 'web')
    [void](Invoke-Native npm @('ci'))
    [void](Invoke-Native npm @('run', 'build'))
  }
  $webOut = Join-Path $Repo 'web\out'
  if (-not (Test-Path (Join-Path $webOut 'index.html'))) { throw "Khong thay $webOut\index.html - bo -SkipWeb" }

  $binDir = Join-Path $Desktop 'resources\bin'
  $webDir = Join-Path $Desktop 'resources\web'
  # Xoa sach bin\ truoc: forge chep ca thu muc, mot nhi phan arch khac sot lai se vao goi.
  if (Test-Path $binDir) { Remove-Item -Recurse -Force $binDir }
  New-Item -ItemType Directory -Force $binDir
  Set-Location $Repo
  $commit = (git rev-parse --short HEAD).Trim()
  $date = (git log -1 --format=%cI).Trim()
  $exe = Join-Path $binDir 'ainovel-cli.exe'
  $env:CGO_ENABLED = '0'; $env:GOWORK = 'off'; $env:GOOS = 'windows'; $env:GOARCH = 'amd64'
  try {
    [void](Invoke-Native go @('build', '-trimpath', '-ldflags', "-s -w -X main.version=$Version -X main.commit=$commit -X main.date=$date", '-o', $exe, './cmd/ainovel-cli'))
  } finally {
    Remove-Item Env:\GOOS, Env:\GOARCH, Env:\CGO_ENABLED, Env:\GOWORK -ErrorAction SilentlyContinue
  }
  if (-not (Test-PeAmd64 $exe)) { throw "$exe khong phai PE x86-64" }
  $verOut = Invoke-NativeOutput $exe @('--version')
  if ($verOut -notmatch [regex]::Escape($Version)) { throw "Sidecar khong bao phien ban ${Version}: $verOut" }
  if (Test-Path $webDir) { Remove-Item -Recurse -Force $webDir }
  Copy-Item -Recurse $webOut $webDir
  Green "  $exe (PE x86-64, $Version), web -> $webDir"

  # ======================================================================
  # 4. forge make -> NSIS
  # ======================================================================
  Bold '4/7  electron-forge make --platform=win32 --arch=x64'
  Set-Location $Desktop
  if (-not (Test-Path (Join-Path $Desktop 'node_modules'))) { [void](Invoke-Native npm @('ci')) }
  foreach ($d in @("out\$ProductName-win32-x64", 'out\make\nsis')) {
    $p = Join-Path $Desktop $d
    if (Test-Path $p) { Remove-Item -Recurse -Force $p }
  }
  # KHONG dat CI: maker NSIS (electron-builder) thay CI la tu publish roi chet vi thieu token.
  Remove-Item Env:\CI -ErrorAction SilentlyContinue
  [void](Invoke-Native npx @('electron-forge', 'make', '--platform=win32', '--arch=x64'))
  $appDir = Join-Path $Desktop "out\$ProductName-win32-x64"
  $nsisDir = Join-Path $Desktop 'out\make\nsis\x64'
  if (-not (Test-Path $appDir)) { throw "Khong thay $appDir" }
  if (-not (Test-Path (Join-Path $appDir 'resources\bin\ainovel-cli.exe'))) { throw 'Goi thieu resources\bin\ainovel-cli.exe - extraResource?' }
  if (-not (Test-Path (Join-Path $appDir 'resources\web\index.html'))) { throw 'Goi thieu resources\web\index.html - extraResource?' }

  # ======================================================================
  # 5. Doi ten bo cai + sua latest.yml
  # ======================================================================
  # electron-builder dat ten "<productName> Setup <ver>.exe" (CO dau cach) va ghi
  # dung ten do vao latest.yml. GitHub doi dau cach thanh dau cham khi upload ->
  # latest.yml tro vao mot asset khong ton tai -> updater 404 lang le. sha512/size
  # theo NOI DUNG nen doi ten khong lam sai chung. .blockmap khong co ten trong
  # latest.yml (updater suy ra "<url>.blockmap"), chi can doi ten tep cho khop.
  Bold '5/7  Ten tep theo spec + latest.yml'
  $exes = @(Get-ChildItem $nsisDir -File -Filter '*.exe')
  if ($exes.Count -ne 1) { throw "out\make\nsis\x64 co $($exes.Count) tep .exe (muon 1)" }
  $ymlSrc = Join-Path $nsisDir 'latest.yml'
  if (-not (Test-Path $ymlSrc)) { throw 'Maker NSIS khong sinh latest.yml - thieu cau hinh updater trong forge.config.ts?' }
  New-Item -ItemType Directory -Force $Dist
  $newExe = "$ArtifactPrefix-Setup-$Version.exe"
  $winExe = Join-Path $Dist $newExe
  $winMap = "$winExe.blockmap"
  $winYml = Join-Path $Dist 'latest.yml'
  Copy-Item -LiteralPath $exes[0].FullName $winExe -Force
  $oldMap = "$($exes[0].FullName).blockmap"
  if (Test-Path -LiteralPath $oldMap) { Copy-Item -LiteralPath $oldMap $winMap -Force }
  $yml = (Get-Content -LiteralPath $ymlSrc -Raw).Replace($exes[0].Name, $newExe)
  [System.IO.File]::WriteAllText($winYml, $yml, $Utf8NoBom)
  if (-not $yml.Contains($newExe)) { throw "latest.yml khong nhac toi $newExe sau khi doi ten" }
  if (-not $yml.Contains((Get-Sha512B64 $winExe))) { throw "sha512 trong latest.yml khong khop $newExe" }
  Green "  $newExe ($([math]::Round((Get-Item $winExe).Length / 1MB, 1)) MB), latest.yml$(if (Test-Path $winMap) { ', .blockmap' })"

  # ======================================================================
  # 6. Smoke
  # ======================================================================
  # App chay voi --user-data-dir=<thu muc tam>: app.getPath('userData') tro vao do
  # (log, sach, khoa single-instance), nen du lieu that trong %APPDATA% khong bi
  # dung va mot AINovel Studio khac dang mo khong chan duoc ban dang kiem. (Windows
  # ma hoa bang DPAPI, khong co hop thoai Keychain nhu macOS.)
  Bold '6/7  Smoke - mo ban dong goi (userData tam), AINOVEL_READY, /api/workshop, dong sach'
  $appExe = (Resolve-Path (Join-Path $appDir "$ProductName.exe")).Path
  $sidecarPath = (Resolve-Path (Join-Path $appDir 'resources\bin\ainovel-cli.exe')).Path
  # Chinh goi nay dang chay (smoke truoc chet do?) thi khong phan biet duoc tien
  # trinh nao cua lan nay.
  $same = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $appExe -or $_.ExecutablePath -eq $sidecarPath })
  if ($same.Count -gt 0) { throw "Goi nay dang chay san (PID $($same.ProcessId -join ',')) - dong no roi chay lai." }

  $smokeUserData = Join-Path $env:TEMP ("ainovel-smoke-" + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force $smokeUserData | Out-Null
  $log = Join-Path $smokeUserData 'logs\sidecar.log'
  $smokeProc = Start-Process -FilePath $appExe -ArgumentList "--user-data-dir=`"$smokeUserData`"" -PassThru
  $url = $null
  $deadline = (Get-Date).AddSeconds(60)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
    if (Test-Path $log) {
      # userData moi tinh: moi dong trong log deu cua lan nay. FileShare ReadWrite
      # vi sidecar van dang ghi.
      $fs = [System.IO.File]::Open($log, 'Open', 'Read', 'ReadWrite')
      try { $text = (New-Object System.IO.StreamReader($fs)).ReadToEnd() } finally { $fs.Dispose() }
      $m = [regex]::Matches($text, 'AINOVEL_READY (http://127\.0\.0\.1:[0-9]+)')
      if ($m.Count -gt 0) { $url = $m[$m.Count - 1].Groups[1].Value; break }
    }
    if ($smokeProc.HasExited) { break }
  }
  if (-not $url) { throw "Khong thay AINOVEL_READY trong $log sau 60s" }
  Green "  sidecar san sang: $url"
  $resp = Invoke-WebRequest -UseBasicParsing -TimeoutSec 10 "$url/api/workshop"
  if ($resp.StatusCode -ne 200) { throw "GET /api/workshop tra $($resp.StatusCode)" }
  $resp = Invoke-WebRequest -UseBasicParsing -TimeoutSec 10 "$url/"
  if ($resp.StatusCode -ne 200) { throw "GET / tra $($resp.StatusCode) - giao dien web khong duoc phuc vu" }
  Green '  GET /api/workshop -> 200, GET / -> 200'

  # Dong cua so cuoi = app.quit() -> before-quit -> dung sidecar. Day la duong
  # nguoi dung that; Stop-Process thi bo qua before-quit va khong kiem duoc gi.
  # Chi dong cua so cua DUNG tien trinh vua mo (tien trinh chinh cua Electron so
  # huu cua so), khong dung AINovel Studio nao khac nguoi dung dang mo.
  # MainWindowHandle chi thay cua so DANG HIEN: cho no hien (toi da 10s).
  $deadline = (Get-Date).AddSeconds(10)
  do { Start-Sleep -Milliseconds 250; $smokeProc.Refresh() } while ($smokeProc.MainWindowHandle -eq 0 -and -not $smokeProc.HasExited -and (Get-Date) -lt $deadline)
  if ($smokeProc.MainWindowHandle -eq 0) { throw 'Tien trinh app khong co cua so chinh de dong' }
  [void]$smokeProc.CloseMainWindow()
  # Sidecar co toi 15s de tu thoat truoc khi bi kill (stopTimeoutMs trong
  # desktop/src/main), cong thoi gian Electron dong cua so - chua du.
  $quitTimeout = 30
  $deadline = (Get-Date).AddSeconds($quitTimeout)
  while ((Get-Date) -lt $deadline) {
    $orph = Get-CimInstance Win32_Process -Filter "Name='ainovel-cli.exe'" | Where-Object { $_.ExecutablePath -eq $sidecarPath }
    if ($smokeProc.HasExited -and -not $orph) { break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $smokeProc.HasExited) { throw "App khong thoat trong ${quitTimeout}s sau khi dong cua so" }
  $orph = Get-CimInstance Win32_Process -Filter "Name='ainovel-cli.exe'" | Where-Object { $_.ExecutablePath -eq $sidecarPath }
  if ($orph) { throw "Con ainovel-cli.exe mo coi (PID $($orph.ProcessId -join ','))" }
  # "Khong mo coi" chua du: sidecar bi kill() sau stopTimeoutMs cung khong de lai mo
  # coi, nen duong dong-stdin -> Go tu thoat hong van qua. sidecar.ts ghi dong
  # "[main] ... code=<c> signal=<s>" khi tien trinh con dong - phai la code=0
  # signal=null, va khong co dong "kill()" nao. (Khop phan ASCII: tep nay khong dau.)
  $fs = [System.IO.File]::Open($log, 'Open', 'Read', 'ReadWrite')
  try { $text = (New-Object System.IO.StreamReader($fs)).ReadToEnd() } finally { $fs.Dispose() }
  $exits = [regex]::Matches($text, 'code=(\S+) signal=(\S+)')
  $exitLine = if ($exits.Count -gt 0) { $exits[$exits.Count - 1].Value } else { '' }
  if ($exitLine -ne 'code=0 signal=null' -or $text.Contains('kill()')) {
    throw "Sidecar khong tu thoat em (dong thoat: '$exitLine') - xem $log"
  }
  # Khoa ghi cua truyen (internal/store: <books>\<truyen>\meta\studio.lock) phai duoc tra.
  $locks = @(Get-ChildItem -Path (Join-Path $smokeUserData 'books') -Recurse -Filter 'studio.lock' -ErrorAction SilentlyContinue)
  if ($locks.Count -gt 0) { throw "Con tep khoa sau khi thoat: $($locks.FullName -join ', ')" }
  Green '  sidecar thoat code=0, khong bi kill, khong con studio.lock'
  $smokeProc = $null
  $smokeOk = $true
  Green '  app da thoat, khong con ainovel-cli.exe mo coi'

  # ======================================================================
  # 7. Gan vao release co san + go dong nhac khoi release notes
  # ======================================================================
  Bold "7/7  gh release upload $Tag tren $GhRepo"
  $assets = @($winExe, $winYml)
  if (Test-Path $winMap) { $assets += $winMap }
  $assets | ForEach-Object { Write-Host "    $(Split-Path -Leaf $_)" }
  if ($DryRun) {
    Write-Host "  [dry-run] Se upload --clobber $($assets.Count) tep vao release $Tag va go dong nhac khoi release notes"
  } else {
    # --clobber: thay bo cai dung cheo (chua smoke) cua release.sh neu co.
    [void](Invoke-Native gh (@('release', 'upload', $Tag, '--repo', $GhRepo, '--clobber') + $assets))
    Green "  Da upload vao https://github.com/$GhRepo/releases/tag/$Tag"

    # Doc release notes bang UTF-8: mac dinh PS 5.1 giai ma dau ra lenh ngoai bang
    # bang ma OEM, chu Viet se vo roi bi ghi nguoc len GitHub.
    $prevEnc = [Console]::OutputEncoding
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    try {
      $body = Invoke-NativeOutput gh @('release', 'view', $Tag, '--repo', $GhRepo, '--json', 'body', '--jq', '.body')
    } finally { [Console]::OutputEncoding = $prevEnc }
    $lines = @($body -split "`n")
    $kept = @($lines | Where-Object { -not $_.Contains($WinUnverifiedMarker) })
    if ($kept.Count -lt $lines.Count) {
      $notesFile = Join-Path $env:TEMP ("ainovel-notes-" + [guid]::NewGuid().ToString('N') + '.md')
      try {
        [System.IO.File]::WriteAllText($notesFile, ($kept -join "`n"), $Utf8NoBom)
        [void](Invoke-Native gh @('release', 'edit', $Tag, '--repo', $GhRepo, '--notes-file', $notesFile))
      } finally { Remove-Item -LiteralPath $notesFile -ErrorAction SilentlyContinue }
      Green '  Da go dong nhac "chua chay thu tren Windows" khoi release notes'
    }
  }
  Green "`nWindows $Tag xong$(if ($DryRun) { ' (dry-run)' })"
}
finally {
  if ($smokeProc -and -not $smokeProc.HasExited) { Stop-Process -Id $smokeProc.Id -Force -ErrorAction SilentlyContinue }
  if ($smokeUserData) {
    # Smoke hong giua chung: don helper + sidecar cua DUNG goi nay ($appExe va
    # $sidecarPath da gan truoc $smokeUserData).
    Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $appExe -or $_.ExecutablePath -eq $sidecarPath } |
      ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    if ($smokeOk) { Remove-Item -Recurse -Force -LiteralPath $smokeUserData -ErrorAction SilentlyContinue }
    else { Warn "userData cua lan smoke giu lai de xem: $smokeUserData" }
  }
  Set-Location $Repo
}
