#!/usr/bin/env bash
# Dựng thư mục giấy tờ pháp lý đi kèm app.
#
# Cách dùng:
#   desktop/scripts/gen-legal.sh <outdir>
#
# Đầu ra (build-sidecar.sh gọi với <outdir> = desktop/resources/legal; vỏ Electron đọc đúng
# các tên tệp này — đổi tên là phá hợp đồng với desktop/src):
#   LICENSE  NOTICE  PRIVACY.md  DISCLAIMER.md   chép nguyên từ gốc repo
#   THIRD_PARTY_NOTICES.md                       sinh ra — mọi thứ bên thứ ba ĐÓNG GÓI vào app
#   LICENSES.chromium.html                       giấy phép Chromium của Electron (xem dưới)
#
# Phủ những gì đi vào gói:
#   - module Go biên dịch vào sidecar (hợp của darwin và windows, vì cây phụ thuộc khác nhau
#     theo GOOS: x/sys/unix vs x/sys/windows) + thư viện chuẩn Go;
#   - phụ thuộc chạy-thật của web/ (đóng vào web/out) và desktop/ (bundle vào main.js), đọc
#     từ package-lock.json: mục không `dev`, không `optional` — các gói optional ở đây là nhị
#     phân dựng-lúc-build theo nền tảng (@next/swc-*, sharp/@img), không vào gói;
#   - font nhúng lúc build bởi next/font (OFL-1.1, giấy phép buộc đi kèm font);
#   - Electron và Chromium.
#
# Không gọi mạng: văn bản giấy phép đọc từ module cache của Go và node_modules có sẵn. Nên
# phải chạy SAU `go build` (module đã tải) và sau `npm ci` ở web/ và desktop/.
#
# Tất định: sắp theo tên, không dấu thời gian — hai lần chạy trên cùng cây cho cùng tệp.
# Hỏng ồn ào: một gói không tìm được tệp giấy phép, hay một giấy phép không nhận ra được, là
# dừng với mã lỗi — không bao giờ ghi "UNKNOWN" vào gói.

set -euo pipefail

(( $# == 1 )) || { echo "usage: $0 <outdir>" >&2; exit 2; }

DESKTOP="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$DESKTOP/.." && pwd)"

OUT_PARENT="$(mkdir -p "$(dirname "$1")" && cd "$(dirname "$1")" && pwd)"
OUT="$OUT_PARENT/$(basename "$1")"
# Đầu ra bị xóa sạch rồi dựng lại; chặn những đích mà gõ nhầm sẽ thành thảm họa.
case "$OUT" in
  /|"$HOME"|"$REPO"|"$DESKTOP") echo "error: từ chối ghi vào $OUT" >&2; exit 2 ;;
esac

for f in LICENSE NOTICE PRIVACY.md DISCLAIMER.md; do
  [[ -s "$REPO/$f" ]] || { echo "error: thiếu $REPO/$f" >&2; exit 1; }
done
for d in web desktop; do
  [[ -d "$REPO/$d/node_modules" ]] || {
    echo "error: thiếu $REPO/$d/node_modules — chạy \`npm ci\` trong $d/ trước" >&2
    exit 1
  }
done
CHROMIUM="$DESKTOP/node_modules/electron/dist/LICENSES.chromium.html"
[[ -s "$CHROMIUM" ]] || { echo "error: thiếu $CHROMIUM" >&2; exit 1; }

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

# ─── Module Go ──────────────────────────────────────────────────────────
# Một dòng mỗi gói: <module path>\t<version>\t<thư mục trên đĩa>. Module có `replace` cục bộ
# (litellm → third_party/litellm) thì .Module.Dir đã là thư mục thay thế. Gói thư viện chuẩn
# không có .Module nên rơi ra ngoài; module chính cũng bị lọc.
GO_DEPS="$STAGE/go-deps.tsv"
for goos in darwin windows; do
  (
    cd "$REPO"
    CGO_ENABLED=0 GOWORK=off GOOS="$goos" GOARCH=amd64 go list -deps \
      -f '{{with .Module}}{{if not .Main}}{{.Path}}	{{.Version}}	{{.Dir}}{{with .Replace}}	{{.Path}}{{end}}{{end}}{{end}}' \
      ./cmd/ainovel-cli
  )
done | awk 'NF' | sort -u > "$GO_DEPS"

GOROOT_DIR="$(cd "$REPO" && go env GOROOT)"
GO_VERSION="$(cd "$REPO" && go env GOVERSION)"

# ─── Sinh THIRD_PARTY_NOTICES.md ────────────────────────────────────────
node - "$REPO" "$GO_DEPS" "$GOROOT_DIR" "$GO_VERSION" > "$STAGE/THIRD_PARTY_NOTICES.md" <<'NODE'
const fs = require('fs');
const path = require('path');
const [repo, goDepsFile, goroot, goVersion] = process.argv.slice(2);

const die = (msg) => { process.stderr.write(`error: ${msg}\n`); process.exit(1); };
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n').trim();

// Tệp giấy phép + NOTICE trong một thư mục gói (Apache-2.0 §4d buộc mang theo NOTICE).
const LICENSE_RE = /^(licen[sc]e|copying|notice)([-._].*)?$/i;
function licenseFiles(dir) {
  return fs.readdirSync(dir)
    .filter((n) => LICENSE_RE.test(n) && fs.statSync(path.join(dir, n)).isFile())
    .sort();
}

// Nhận dạng giấy phép từ văn bản cho module Go (go.mod không khai giấy phép). Chỉ những mẫu
// thật sự gặp; không khớp là dừng — thêm mẫu mới phải là quyết định có người đọc văn bản.
function classify(text) {
  if (/Apache License\s+Version 2\.0/i.test(text)) return 'Apache-2.0';
  if (/Permission is hereby granted, free of charge/i.test(text)) return 'MIT';
  if (/Redistribution and use in source and binary forms/i.test(text)) {
    return /Neither the name/i.test(text) ? 'BSD-3-Clause' : 'BSD-2-Clause';
  }
  return null;
}

const entries = []; // { section, name, version, license, source, texts: [{file, body}] }

// Go: thư viện chuẩn (kèm các gói golang.org/x/* mà nó vendor sẵn, cùng giấy phép).
// Bản Go của Homebrew dời LICENSE lên thư mục cha của GOROOT (Cellar/go/<v>/LICENSE).
{
  const dir = [goroot, path.dirname(goroot)].find((d) => fs.existsSync(path.join(d, 'LICENSE')));
  if (!dir) die(`không thấy LICENSE của Go trong ${goroot} hay thư mục cha`);
  const body = read(path.join(dir, 'LICENSE'));
  entries.push({
    section: 'go', name: 'Go standard library', version: goVersion,
    license: classify(body) || die('không nhận ra giấy phép của thư viện chuẩn Go'),
    source: 'https://go.dev', texts: [{ file: 'LICENSE', body }],
  });
}
for (const line of read(goDepsFile).split('\n').filter(Boolean)) {
  const [mod, version, dir, replacedBy] = line.split('\t');
  if (!dir || !fs.existsSync(dir)) die(`module Go ${mod} không có trên đĩa (${dir || 'thiếu Dir'}) — chạy \`go mod download\``);
  const files = licenseFiles(dir);
  if (files.length === 0) die(`module Go ${mod}@${version} không có tệp LICENSE trong ${dir}`);
  const texts = files.map((f) => ({ file: f, body: read(path.join(dir, f)) }));
  const lic = texts.map((t) => classify(t.body)).find(Boolean);
  if (!lic) die(`không nhận ra giấy phép của module Go ${mod} (${files.join(', ')})`);
  const local = replacedBy && replacedBy.startsWith('.');
  entries.push({
    section: 'go', name: mod,
    version: local ? `${version || 'v?'} (bản vá trong ${replacedBy.replace(/^\.\//, '')})` : version,
    license: lic, source: `https://pkg.go.dev/${mod}`, texts,
  });
}

// Gói npm khai giấy phép trong package.json nhưng không phát hành tệp LICENSE. Mỗi mục đã có
// người đọc gói: `from` = tệp giấy phép của chính dự án nguồn (cùng repo, cùng chủ bản quyền),
// còn không thì dựng văn bản MIT chuẩn với chủ bản quyền lấy từ trường `author`. Gói mới thiếu
// tệp mà không có ở đây thì build dừng.
const NO_LICENSE_FILE = {
  'client-only': { license: 'MIT', from: 'react/LICENSE', note: 'published from the facebook/react repository' },
  '@next/env': { license: 'MIT', from: 'next/license.md', note: 'published from the vercel/next.js repository' },
  'lazy-val': { license: 'MIT', copyright: 'Copyright (c) Vladimir Krivosheev', note: 'standard MIT text; the package ships no LICENSE file, author per package.json' },
};
function mitText(copyright) {
  return `MIT License

${copyright}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;
}

// npm: bao đóng phụ thuộc chạy-thật đọc từ lockfile.
function npmEntries(section, sub, roots) {
  const lock = JSON.parse(fs.readFileSync(path.join(repo, sub, 'package-lock.json'), 'utf8'));
  const pkgs = lock.packages;
  // Đi từ `roots` theo dependencies, phân giải như Node: node_modules gần nhất đi ngược lên.
  const resolve = (from, name) => {
    let base = from;
    for (;;) {
      const key = (base ? `${base}/` : '') + `node_modules/${name}`;
      if (pkgs[key]) return key;
      if (!base) return null;
      const i = base.lastIndexOf('/node_modules/');
      base = i < 0 ? '' : base.slice(0, i);
    }
  };
  const seen = new Set();
  const stack = roots.map((r) => resolve('', r) || die(`${sub}: lockfile không có ${r}`));
  while (stack.length) {
    const key = stack.pop();
    if (seen.has(key)) continue;
    const meta = pkgs[key];
    if (meta.optional || meta.dev) continue;
    seen.add(key);
    for (const dep of Object.keys(meta.dependencies || {})) {
      const k = resolve(key, dep);
      if (!k) die(`${sub}: không phân giải được ${dep} (từ ${key})`);
      stack.push(k);
    }
  }
  for (const key of seen) {
    const dir = path.join(repo, sub, key);
    if (!fs.existsSync(path.join(dir, 'package.json'))) die(`${sub}: thiếu ${key} trên đĩa — chạy \`npm ci\` trong ${sub}/`);
    const pj = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    const lic = typeof pj.license === 'string' ? pj.license : pj.license?.type || pkgs[key].license;
    if (!lic) die(`${sub}: ${pj.name}@${pj.version} không khai giấy phép`);
    const files = licenseFiles(dir);
    let texts = files.map((f) => ({ file: f, body: read(path.join(dir, f)) }));
    if (texts.length === 0) {
      const ov = NO_LICENSE_FILE[pj.name];
      if (!ov || ov.license !== lic) die(`${sub}: ${pj.name}@${pj.version} (${lic}) không có tệp LICENSE trong ${dir} — đọc gói rồi thêm vào NO_LICENSE_FILE`);
      texts = [ov.from
        ? { file: `${ov.from} (${ov.note})`, body: read(path.join(repo, sub, 'node_modules', ov.from)) }
        : { file: `MIT (${ov.note})`, body: mitText(ov.copyright) }];
    }
    entries.push({
      section, name: pj.name, version: pj.version, license: lic,
      source: `https://www.npmjs.com/package/${pj.name}`, texts,
    });
  }
}
const deps = (sub) => Object.keys(JSON.parse(fs.readFileSync(path.join(repo, sub, 'package.json'), 'utf8')).dependencies || {});
npmEntries('web', 'web', deps('web'));
npmEntries('desktop', 'desktop', deps('desktop'));

// Electron (devDependency theo npm, nhưng chính là thân app).
{
  const dir = path.join(repo, 'desktop/node_modules/electron');
  const pj = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  entries.push({
    section: 'electron', name: 'electron', version: pj.version, license: pj.license,
    source: 'https://www.electronjs.org',
    texts: [{ file: 'LICENSE', body: read(path.join(dir, 'LICENSE')) }],
  });
}

// Font nhúng bởi next/font (web/app/layout.tsx). Bản quyền theo tệp OFL.txt của từng dự án.
const OFL = `SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide development of collaborative font projects, to support the font creation efforts of academic and linguistic communities, and to provide a free and open framework in which fonts may be shared and improved in partnership with others.

The OFL allows the licensed fonts to be used, studied, modified and redistributed freely as long as they are not sold by themselves. The fonts, including any derivative works, can be bundled, embedded, redistributed and/or sold with any software provided that any reserved names are not used by derivative works. The fonts and derivatives, however, cannot be released under any other type of license. The requirement for fonts to remain under this license does not apply to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright Holder(s) under this license and clearly marked as such. This may include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the copyright statement(s).

"Original Version" refers to the collection of Font Software components as distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting, or substituting -- in part or in whole -- any of the components of the Original Version, by changing formats or by porting the Font Software to a new environment.

"Author" refers to any designer, engineer, programmer, technical writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining a copy of the Font Software, to use, study, copy, merge, embed, modify, redistribute, and sell modified and unmodified copies of the Font Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components, in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled, redistributed and/or sold with any software, provided that each copy contains the above copyright notice and this license. These can be included either as stand-alone text files, human-readable headers or in the appropriate machine-readable metadata fields within text or binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font Name(s) unless explicit written permission is granted by the corresponding Copyright Holder. This restriction only applies to the primary font name as presented to the users.

4) The name(s) of the Copyright Holder(s) and the Author(s) of the Font Software shall not be used to promote, endorse or advertise any Modified Version, except to acknowledge the contribution(s) of the Copyright Holder(s) and the Author(s) or with their explicit written permission.

5) The Font Software, modified or unmodified, in part or in whole, must be distributed entirely under this license, and must not be distributed under any other license. The requirement for fonts to remain under this license does not apply to any document created using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM OTHER DEALINGS IN THE FONT SOFTWARE.`;
const FONTS = [
  ['Inter', 'Copyright (c) 2016 The Inter Project Authors (https://github.com/rsms/inter)', 'https://github.com/rsms/inter'],
  ['JetBrains Mono', 'Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono)', 'https://github.com/JetBrains/JetBrainsMono'],
  ['Noto Serif', 'Copyright 2022 The Noto Project Authors (https://github.com/notofonts/latin-greek-cyrillic)', 'https://github.com/notofonts/latin-greek-cyrillic'],
];
// Danh sách font phải khớp layout.tsx: thêm/bớt font ở đó mà quên ở đây là hỏng build.
{
  const layout = fs.readFileSync(path.join(repo, 'web/app/layout.tsx'), 'utf8');
  const m = layout.match(/import\s*\{([^}]*)\}\s*from\s*'next\/font\/google'/);
  if (!m) die('web/app/layout.tsx: không thấy import next/font/google');
  const used = m[1].split(',').map((s) => s.trim().replace(/_/g, ' ')).filter(Boolean).sort();
  const known = FONTS.map((f) => f[0]).sort();
  if (used.join('|') !== known.join('|')) die(`font trong layout.tsx (${used.join(', ')}) khác danh sách trong gen-legal.sh (${known.join(', ')})`);
}
for (const [name, copyright, source] of FONTS) {
  entries.push({
    section: 'fonts', name, version: '—', license: 'OFL-1.1', source,
    texts: [{ file: 'OFL.txt', body: `${copyright}\n\nThis Font Software is licensed under the SIL Open Font License, Version 1.1.\n\n${OFL}` }],
  });
}

// ─── In ra ─────────────────────────────────────────────────────────────
for (const e of entries) {
  if (!e.license || /unknown|unlicensed/i.test(e.license)) die(`${e.name}: giấy phép "${e.license}"`);
}
const SECTIONS = [
  ['go', 'Sidecar (Go) — module biên dịch vào `ainovel-cli`'],
  ['web', 'Giao diện (web/out) — phụ thuộc chạy-thật của `web/package.json`'],
  ['desktop', 'Vỏ desktop (main.js) — phụ thuộc chạy-thật của `desktop/package.json`'],
  ['electron', 'Electron'],
  ['fonts', 'Font nhúng trong giao diện'],
];
const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
const fence = (body) => {
  let f = '```';
  while (body.includes(f)) f += '`';
  return `${f}text\n${body}\n${f}`;
};

const out = [];
out.push('# Third-party notices — AINovel Studio', '');
out.push('Tệp này được sinh tự động bởi `desktop/scripts/gen-legal.sh` mỗi lần build. Đừng sửa tay.');
out.push('This file is generated by `desktop/scripts/gen-legal.sh` on every build. Do not edit.', '');
out.push('AINovel Studio is licensed under the Apache License 2.0 (see LICENSE and NOTICE).');
out.push('It bundles the third-party components below, each under its own license.', '');
out.push('Chromium and the other components inside Electron are covered by `LICENSES.chromium.html`,');
out.push('shipped next to this file.', '');
out.push(`Tổng cộng / Total: ${entries.length} components.`, '');
for (const [id, title] of SECTIONS) {
  const list = entries.filter((e) => e.section === id).sort(byName);
  out.push(`## ${title}`, '', '| Component | Version | License |', '|---|---|---|');
  for (const e of list) out.push(`| [${e.name}](${e.source}) | ${e.version} | ${e.license} |`);
  out.push('');
}
out.push('---', '', '# License texts', '');
for (const [id] of SECTIONS) {
  for (const e of entries.filter((x) => x.section === id).sort(byName)) {
    out.push(`## ${e.name} ${e.version === '—' ? '' : e.version}`.trimEnd(), '', `License: ${e.license}`, '');
    for (const t of e.texts) out.push(`**${t.file}**`, '', fence(t.body), '');
  }
}
process.stdout.write(out.join('\n'));
process.stderr.write(`  legal: ${entries.length} thành phần (${SECTIONS.map(([id]) => `${id} ${entries.filter((e) => e.section === id).length}`).join(', ')})\n`);
NODE

for f in LICENSE NOTICE PRIVACY.md DISCLAIMER.md; do
  cp "$REPO/$f" "$STAGE/$f"
done
cp "$CHROMIUM" "$STAGE/LICENSES.chromium.html"
rm -f "$GO_DEPS"

rm -rf "$OUT"
mkdir -p "$OUT"
cp "$STAGE"/* "$OUT/"
echo "  legal: $(ls "$OUT" | tr '\n' ' ')→ $OUT"
