import fs from 'node:fs';
import path from 'node:path';
import { escapeHtml, renderMarkdown } from './markdown';

// Tài liệu pháp lý trong app (menu Trợ giúp, hộp thoại đồng ý lần đầu) và kiểm tra lúc đóng
// gói. Không import electron: main.ts đưa vào app.isPackaged/process.resourcesPath…, forge.config
// dùng lại LEGAL_FILES/checkLegalDir, vitest kiểm mọi thứ.
//
// Bản đóng gói: `<Resources>/legal/` (extraResource từ desktop/resources/legal, do
// scripts/build-sidecar.sh sinh). Dev: các tệp ở gốc repo, trừ THIRD_PARTY_NOTICES.md chỉ có
// sau khi build-sidecar.sh chạy (desktop/resources/legal) và LICENSES.chromium.html lấy thẳng từ
// node_modules/electron/dist.
//
// LICENSES.chromium.html phải nằm TRONG gói: trên macOS electron-packager đặt nó cạnh .app chứ
// không vào trong, nên zip/DMG chỉ chứa .app sẽ thiếu giấy phép Chromium.

export const LEGAL_FILES = [
  'LICENSE',
  'NOTICE',
  'PRIVACY.md',
  'DISCLAIMER.md',
  'THIRD_PARTY_NOTICES.md',
  'LICENSES.chromium.html',
] as const;
export type LegalFile = (typeof LEGAL_FILES)[number];

export type LegalDocId = 'privacy' | 'disclaimer' | 'licenses' | 'chromium';

/** Liên kết từ trang Giấy phép sang trang Chromium; docViewer bắt nó ở will-navigate. */
export const CHROMIUM_LINK = 'ainovel-doc:chromium';

export const LEGAL_DOCS: Record<LegalDocId, { title: string; files: LegalFile[] }> = {
  privacy: { title: 'Quyền riêng tư', files: ['PRIVACY.md'] },
  disclaimer: { title: 'Miễn trừ trách nhiệm', files: ['DISCLAIMER.md'] },
  licenses: { title: 'Giấy phép mã nguồn mở', files: ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md'] },
  // HTML có sẵn của Electron (~20 MB): nạp thẳng tệp, không render lại (legalDocSource).
  chromium: { title: 'Giấy phép Chromium', files: ['LICENSES.chromium.html'] },
};

export interface LegalPathInput {
  isPackaged: boolean;
  /** process.resourcesPath — chỉ có nghĩa ở bản đóng gói. */
  resourcesPath: string;
  /** Thư mục gốc repo (dev): cha của `desktop/`. */
  repoRoot: string;
}

export function resolveLegalPaths(input: LegalPathInput): Record<LegalFile, string> {
  const at = (f: LegalFile) =>
    input.isPackaged
      ? path.join(input.resourcesPath, 'legal', f)
      : f === 'THIRD_PARTY_NOTICES.md'
        ? path.join(input.repoRoot, 'desktop', 'resources', 'legal', f)
        : f === 'LICENSES.chromium.html'
          ? path.join(input.repoRoot, 'desktop', 'node_modules', 'electron', 'dist', f)
          : path.join(input.repoRoot, f);
  return Object.fromEntries(LEGAL_FILES.map((f) => [f, at(f)])) as Record<LegalFile, string>;
}

/**
 * Kiểm tra trước khi đóng gói: đủ năm tệp, không tệp nào rỗng. Trả về danh sách lỗi (rỗng = ổn)
 * để forge.config ném một lỗi gom đủ mọi tệp thiếu.
 */
export function checkLegalDir(dir: string): string[] {
  const problems: string[] = [];
  for (const f of LEGAL_FILES) {
    let size: number;
    try {
      const st = fs.statSync(path.join(dir, f));
      if (!st.isFile()) {
        problems.push(`${f} không phải tệp`);
        continue;
      }
      size = st.size;
    } catch {
      problems.push(`thiếu ${f}`);
      continue;
    }
    if (size === 0 || fs.readFileSync(path.join(dir, f), 'utf8').trim() === '') problems.push(`${f} rỗng`);
  }
  return problems;
}

// ---------------------------------------------------------------------------- phiên bản & đồng ý

const VERSION_MARKER = /<!--\s*legal-version:\s*(\d+)\s*-->/;

/** Số trong dòng `<!-- legal-version: N -->`, hoặc null nếu không có. */
export function parseLegalVersion(text: string): number | null {
  const m = VERSION_MARKER.exec(text);
  return m ? Number(m[1]) : null;
}

export interface LegalVersions {
  privacy: number;
  disclaimer: number;
}

/** Phiên bản hiện tại của hai tài liệu. Thiếu tệp/thiếu dấu = 0 (vẫn hỏi đồng ý lần đầu). */
export function readLegalVersions(paths: Record<LegalFile, string>): LegalVersions {
  const version = (file: string) => {
    try {
      return parseLegalVersion(fs.readFileSync(file, 'utf8')) ?? 0;
    } catch {
      return 0;
    }
  };
  return { privacy: version(paths['PRIVACY.md']), disclaimer: version(paths['DISCLAIMER.md']) };
}

export interface ConsentRecord {
  privacyVersion: number;
  disclaimerVersion: number;
  /** ISO 8601. */
  at: string;
  appVersion: string;
}

/** Bản ghi đồng ý trong userData, hoặc null nếu chưa có / hỏng (coi như chưa đồng ý). */
export function readConsent(file: string): ConsentRecord | null {
  try {
    const r = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<ConsentRecord>;
    if (!Number.isInteger(r.privacyVersion) || !Number.isInteger(r.disclaimerVersion)) return null;
    return r as ConsentRecord;
  } catch {
    return null;
  }
}

/** Hỏi khi chưa từng đồng ý, hoặc khi một trong hai tài liệu có phiên bản mới hơn bản đã đồng ý. */
export function needsConsent(record: ConsentRecord | null, current: LegalVersions): boolean {
  if (!record) return true;
  return current.privacy > record.privacyVersion || current.disclaimer > record.disclaimerVersion;
}

/** Ghi nguyên tử (tệp tạm + rename): tắt máy giữa chừng không để lại JSON dở. */
export function writeConsent(file: string, current: LegalVersions, appVersion: string, now = new Date()): ConsentRecord {
  const record: ConsentRecord = {
    privacyVersion: current.privacy,
    disclaimerVersion: current.disclaimer,
    at: now.toISOString(),
    appVersion,
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2) + '\n');
  fs.renameSync(tmp, file);
  return record;
}

// ---------------------------------------------------------------------------- trang xem

/** Cửa sổ xem nạp gì: tệp HTML có sẵn (Chromium, nếu có trên đĩa) hoặc trang do ta render. */
export function legalDocSource(
  id: LegalDocId,
  paths: Record<LegalFile, string>,
): { kind: 'file'; file: string } | { kind: 'html'; html: string } {
  if (id === 'chromium') {
    const file = paths['LICENSES.chromium.html'];
    if (fs.existsSync(file)) return { kind: 'file', file };
  }
  return { kind: 'html', html: legalDocHtml(id, paths) };
}

/** Trang HTML hoàn chỉnh của một tài liệu: .md render markdown, tệp khác (LICENSE, NOTICE) giữ
 *  nguyên dạng chữ. Không có script; CSP chặn mọi tải ngoài. Trang Giấy phép có thêm liên kết
 *  sang giấy phép Chromium. Trang Chromium chỉ đi qua đây khi thiếu tệp (ghi chú "không tìm thấy"). */
export function legalDocHtml(id: LegalDocId, paths: Record<LegalFile, string>): string {
  const doc = LEGAL_DOCS[id];
  const chromiumNote =
    id === 'licenses'
      ? `<section>\n<p>Chromium và các thành phần khác bên trong Electron có giấy phép riêng: <a href="${CHROMIUM_LINK}">Giấy phép Chromium</a>.</p>\n</section>`
      : '';
  const sections = doc.files.map((f) => {
    if (f.endsWith('.html')) {
      return `<section><p class="missing">Không tìm thấy tệp ${escapeHtml(f)} trong bản cài này.</p></section>`;
    }
    let text: string;
    try {
      text = fs.readFileSync(paths[f], 'utf8');
    } catch {
      return `<section><p class="missing">Không tìm thấy tệp ${escapeHtml(f)} trong bản cài này.</p></section>`;
    }
    const body = f.endsWith('.md') ? renderMarkdown(text) : `<pre class="plain">${escapeHtml(text)}</pre>`;
    // Nhiều tệp gộp một trang (Giấy phép): mỗi tệp một mục có nhãn tên tệp.
    const label = doc.files.length > 1 ? `<p class="file">${escapeHtml(f)}</p>\n` : '';
    return `<section>\n${label}${body}\n</section>`;
  });
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${escapeHtml(doc.title)}</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #0e0c09; color: #e8e4dc; font: 15.5px/1.65 -apple-system, "Segoe UI", system-ui, sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 40px 32px 64px; }
  h1, h2, h3, h4, h5, h6 { line-height: 1.3; font-weight: 600; margin: 1.6em 0 0.6em; }
  h1 { font-size: 24px; color: #eab656; margin-top: 0; }
  h2 { font-size: 19px; }
  h3 { font-size: 16.5px; }
  h4, h5, h6 { font-size: 15.5px; color: #c9c3b8; }
  p, ul, ol, blockquote, pre, .table { margin: 0 0 1em; }
  p, li { color: #d6d0c5; }
  ul, ol { padding-left: 1.5em; }
  li + li { margin-top: 0.25em; }
  a { color: #71c1ad; }
  a:focus-visible { outline: 2px solid #71c1ad; outline-offset: 2px; }
  strong { color: #e8e4dc; }
  hr { border: 0; border-top: 1px solid #2a261f; margin: 2em 0; }
  blockquote { border-left: 3px solid #3a352e; padding: 2px 0 2px 14px; color: #b8b2a7; }
  code { font: 13px ui-monospace, "SF Mono", Menlo, Consolas, monospace; background: #17140f; padding: 1px 5px; border-radius: 4px; }
  pre { padding: 14px 16px; background: #17140f; border: 1px solid #2a261f; border-radius: 6px; overflow: auto; }
  pre code { background: none; padding: 0; }
  pre.plain { font: 12.5px/1.55 ui-monospace, "SF Mono", Menlo, Consolas, monospace; color: #b8b2a7; white-space: pre-wrap; word-break: break-word; }
  .table { overflow-x: auto; }
  table { border-collapse: collapse; font-size: 14px; }
  th, td { border: 1px solid #2a261f; padding: 6px 10px; vertical-align: top; }
  th { background: #17140f; text-align: left; }
  section + section { border-top: 1px solid #2a261f; margin-top: 2.5em; padding-top: 1.5em; }
  .file { font: 12px ui-monospace, "SF Mono", Menlo, Consolas, monospace; color: #8b8780; text-transform: none; }
  .missing { color: #8b8780; }
</style>
</head>
<body>
<main>
${[...sections.slice(0, 2), chromiumNote, ...sections.slice(2)].filter(Boolean).join('\n')}
</main>
</body>
</html>`;
}
