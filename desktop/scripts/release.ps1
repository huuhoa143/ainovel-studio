<#
.SYNOPSIS
  Phat hanh AINovel Studio cho Windows x64 (NSIS, CHUA KY) - duong du phong khi
  release.sh khong dung cheo duoc bo cai Windows tu Mac.

.DESCRIPTION
  Ban Windows cua desktop/scripts/release.sh. Cac buoc chi-co-tren-mac (codesign,
  notarytool, stapler, spctl, create-dmg) khong co o day: v1 phat hanh bo cai
  NSIS chua ky, nguoi dung thay SmartScreen mot lan ("More info -> Run anyway").

  Cac buoc (~5-10 phut):
    1. Dieu kien: go, node, npm, git, gh; cay lam viec sach; gh ghim huuhoa143
    2. Tag vX.Y.Z: neu tag DA CO (ban mac phat hanh truoc) thi HEAD phai dung tai
       tag do; neu CHUA CO thi bump desktop\package.json + commit + tag + push
    3. Sidecar: npm ci + build web, go build windows/amd64 -> desktop\resources\bin,
       chep web\out -> desktop\resources\web (cung hop dong voi build-sidecar.sh)
    4. electron-forge make --platform=win32 --arch=x64 -> NSIS
    5. Doi ten "AINovel Studio Setup X.Y.Z.exe" -> AINovel-Studio-Setup-X.Y.Z.exe
       va sua latest.yml cho khop (GitHub doi dau cach thanh dau cham khi upload)
    6. Smoke: mo ban da dong goi, cho AINOVEL_READY trong sidecar.log,
       GET /api/workshop = 200, dong cua so, khong con ainovel-cli.exe mo coi
    7. gh release: gan vao release co san (upload --clobber) hoac tao moi

  Tep ASCII khong dau co chu y: PowerShell 5.1 doc .ps1 khong BOM theo bang ma
  ANSI, chu Viet co dau trong chuoi se vo.

  Cach dung:
    powershell -ExecutionPolicy Bypass -File desktop\scripts\release.ps1 1.0.0
    ... 1.0.0 -DryRun     # dung + smoke, khong dung git, khong upload
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
$ProductName = 'AINovel Studio'
$ArtifactPrefix = 'AINovel-Studio'
$ReleaseBranch = if ($env:RELEASE_BRANCH) { $env:RELEASE_BRANCH } else { 'main' }
$Dist = Join-Path $Desktop "out\release\$Version"
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Bold($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Green($m) { Write-Host $m -ForegroundColor Green }
function Warn($m) { Write-Host $m -ForegroundColor Yellow }

# Invoke-Native - chay lenh ngoai va KIEM ma thoat. Duoi PS 5.1 +
# ErrorActionPreference=Stop, mot lenh ngoai ghi stderr (gh, git, npm deu hay
# ghi) bi bien thanh loi ket thuc TRUOC khi kip doc $LASTEXITCODE; con khi that
# bai thi lai KHONG nem loi. Ca hai chieu deu sai, nen moi lenh ngoai di qua day.
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

$smokeProc = $null
try {
  # ======================================================================
  # 1. Dieu kien
  # ======================================================================
  Bold "1/7  Dieu kien (dry-run=$DryRun)"
  $missing = @('go', 'node', 'npm', 'npx', 'git', 'gh') | Where-Object { -not (Get-Command $_ -ErrorAction SilentlyContinue) }
  if ($missing) { throw "Thieu cong cu: $($missing -join ', ')" }
  if (-not (Test-Path (Join-Path $Desktop 'forge.config.ts'))) { throw 'Thieu desktop\forge.config.ts' }
  if (-not $DryRun) { Set-GhToken }

  Set-Location $Repo
  $tracked = git status --porcelain | Where-Object { $_ -notmatch '^\?\?' }
  if ($tracked) {
    git status --short
    if ($DryRun) { Warn 'Cay lam viec co thay doi chua commit - dry-run van chay.' }
    else { throw 'Cay lam viec co thay doi chua commit. Commit hoac stash truoc.' }
  }
  $branch = (git branch --show-current).Trim()
  $currentVersion = (Get-Content (Join-Path $Desktop 'package.json') -Raw | ConvertFrom-Json).version
  [void](Invoke-Native git @('fetch', 'origin', '--tags', '--quiet') -AllowFail)
  $tagExists = ((Invoke-Native git @('rev-parse', '-q', '--verify', "refs/tags/$Tag") -AllowFail) -eq 0)
  Green "OK ($currentVersion -> $Version; tag $Tag $(if ($tagExists) { 'da co' } else { 'chua co' }))"

  # ======================================================================
  # 2. Tag
  # ======================================================================
  Bold "2/7  Tag $Tag"
  if ($tagExists) {
    # Ban mac da phat hanh truoc: bo cai Windows PHAI dung tu dung commit cua tag,
    # khong thi hai nen tang cung so phien ban ma khac ma.
    $tagCommit = (git rev-list -n 1 $Tag).Trim()
    $head = (git rev-parse HEAD).Trim()
    if ($tagCommit -ne $head) {
      $msg = "HEAD ($head) khong o tag $Tag ($tagCommit). Chay: git checkout $Tag"
      if ($DryRun) { Warn $msg } else { throw $msg }
    }
    Green "  dung tu tag $Tag co san"
  } elseif ($DryRun) {
    Write-Host "  [dry-run] Se bump desktop\package.json, commit, tag $Tag, push"
  } else {
    if ($branch -ne $ReleaseBranch) { throw "Dang o nhanh '$branch', chi phat hanh tu '$ReleaseBranch'." }
    Set-Location $Desktop
    if ($currentVersion -ne $Version) {
      [void](Invoke-Native npm @('version', $Version, '--no-git-tag-version'))
      Set-Location $Repo
      [void](Invoke-Native git @('add', 'desktop/package.json', 'desktop/package-lock.json'))
      [void](Invoke-Native git @('commit', '-m', "chore(desktop): phat hanh $Tag"))
    }
    Set-Location $Repo
    [void](Invoke-Native git @('tag', '-a', $Tag, '-m', "AINovel Studio $Tag"))
    # Day bang credential helper cua gh (mang GH_TOKEN o tren), xoa helper ke thua
    # truoc: credential manager co the giu token cua tai khoan khac.
    [void](Invoke-Native git @('-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential', 'push', 'origin', $branch))
    [void](Invoke-Native git @('-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential', 'push', 'origin', $Tag))
    Green "  da push $Tag"
  }

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
  $verOut = (& $exe --version 2>&1 | Out-String)
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
  Bold '6/7  Smoke - mo ban dong goi, AINOVEL_READY, /api/workshop, dong sach'
  $appExe = Join-Path $appDir "$ProductName.exe"
  $sidecarPath = (Resolve-Path (Join-Path $appDir 'resources\bin\ainovel-cli.exe')).Path
  $running = Get-Process -Name $ProductName -ErrorAction SilentlyContinue
  if ($running) {
    Warn "  Dang co $ProductName khac chay (single-instance lock) - bo qua smoke. Thoat no roi chay lai de smoke."
  } else {
    $log = Join-Path $env:APPDATA "$ProductName\logs\sidecar.log"
    $offset = if (Test-Path $log) { (Get-Item $log).Length } else { 0 }
    $smokeProc = Start-Process -FilePath $appExe -PassThru
    $url = $null
    $deadline = (Get-Date).AddSeconds(60)
    while ((Get-Date) -lt $deadline) {
      Start-Sleep -Milliseconds 500
      if (Test-Path $log) {
        $fs = [System.IO.File]::Open($log, 'Open', 'Read', 'ReadWrite')
        try {
          if ($fs.Length -lt $offset) { $offset = 0 }   # sidecar.ts cat log khi > 5MB
          [void]$fs.Seek($offset, 'Begin')
          $text = (New-Object System.IO.StreamReader($fs)).ReadToEnd()
        } finally { $fs.Dispose() }
        $m = [regex]::Matches($text, 'AINOVEL_READY (http://127\.0\.0\.1:[0-9]+)')
        if ($m.Count -gt 0) { $url = $m[$m.Count - 1].Groups[1].Value; break }
      }
      if ($smokeProc.HasExited) { break }
    }
    if (-not $url) { throw "Khong thay AINOVEL_READY moi trong $log sau 60s" }
    Green "  sidecar san sang: $url"
    $resp = Invoke-WebRequest -UseBasicParsing -TimeoutSec 10 "$url/api/workshop"
    if ($resp.StatusCode -ne 200) { throw "GET /api/workshop tra $($resp.StatusCode)" }
    $resp = Invoke-WebRequest -UseBasicParsing -TimeoutSec 10 "$url/"
    if ($resp.StatusCode -ne 200) { throw "GET / tra $($resp.StatusCode) - giao dien web khong duoc phuc vu" }
    Green '  GET /api/workshop -> 200, GET / -> 200'

    # Dong cua so cuoi = app.quit() -> before-quit -> dung sidecar. Day la duong
    # nguoi dung that; Stop-Process thi bo qua before-quit va khong kiem duoc gi.
    $main = Get-Process -Name $ProductName -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
    if ($main) { [void]$main.CloseMainWindow() }
    $deadline = (Get-Date).AddSeconds(20)
    while ((Get-Date) -lt $deadline) {
      $alive = Get-Process -Name $ProductName -ErrorAction SilentlyContinue
      $orph = Get-CimInstance Win32_Process -Filter "Name='ainovel-cli.exe'" | Where-Object { $_.ExecutablePath -eq $sidecarPath }
      if (-not $alive -and -not $orph) { break }
      Start-Sleep -Milliseconds 500
    }
    if (Get-Process -Name $ProductName -ErrorAction SilentlyContinue) { throw 'App khong thoat trong 20s sau khi dong cua so' }
    $orph = Get-CimInstance Win32_Process -Filter "Name='ainovel-cli.exe'" | Where-Object { $_.ExecutablePath -eq $sidecarPath }
    if ($orph) { throw "Con ainovel-cli.exe mo coi (PID $($orph.ProcessId -join ','))" }
    $smokeProc = $null
    Green '  app da thoat, khong con ainovel-cli.exe mo coi'
  }

  # ======================================================================
  # 7. gh release
  # ======================================================================
  Bold "7/7  gh release $Tag tren $GhRepo"
  $assets = @($winExe, $winYml)
  if (Test-Path $winMap) { $assets += $winMap }
  $assets | ForEach-Object { Write-Host "    $(Split-Path -Leaf $_)" }
  if ($DryRun) {
    Write-Host "  [dry-run] Se upload $($assets.Count) tep vao release $Tag"
  } else {
    # `gh release view` ghi "release not found" ra stderr khi chua co release -
    # Invoke-Native -AllowFail de quyet dinh bang ma thoat, khong bang stderr.
    $exists = ((Invoke-Native gh @('release', 'view', $Tag, '--repo', $GhRepo, '--json', 'tagName') -AllowFail) -eq 0)
    if ($exists) {
      [void](Invoke-Native gh (@('release', 'upload', $Tag, '--repo', $GhRepo, '--clobber') + $assets))
    } else {
      $notes = "AINovel Studio $Tag`n`nWindows: bo cai chua ky, SmartScreen se hoi mot lan - bam More info -> Run anyway."
      [void](Invoke-Native gh (@('release', 'create', $Tag, '--repo', $GhRepo, '--verify-tag', '--title', "AINovel Studio $Tag", '--notes', $notes) + $assets))
    }
    Green "Da upload vao https://github.com/$GhRepo/releases/tag/$Tag"
  }
  Green "`nWindows $Tag xong$(if ($DryRun) { ' (dry-run)' })"
}
finally {
  if ($smokeProc -and -not $smokeProc.HasExited) { Stop-Process -Id $smokeProc.Id -Force -ErrorAction SilentlyContinue }
  Set-Location $Repo
}
