import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  checkLegalDir,
  CHROMIUM_LINK,
  legalDocSource,
  LEGAL_FILES,
  legalDocHtml,
  needsConsent,
  parseLegalVersion,
  readConsent,
  readLegalVersions,
  resolveLegalPaths,
  writeConsent,
  type LegalFile,
} from '../src/main/legal';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ainovel-legal-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function writeAll(target: string, over: Partial<Record<LegalFile, string>> = {}) {
  for (const f of LEGAL_FILES) fs.writeFileSync(path.join(target, f), over[f] ?? `nội dung ${f}\n`);
}

describe('resolveLegalPaths', () => {
  it('bản đóng gói đọc từ <Resources>/legal', () => {
    const p = resolveLegalPaths({ isPackaged: true, resourcesPath: '/App/Contents/Resources', repoRoot: '/repo' });
    for (const f of LEGAL_FILES) expect(p[f]).toBe(path.join('/App/Contents/Resources', 'legal', f));
  });

  it('dev đọc tệp ở gốc repo, THIRD_PARTY_NOTICES từ desktop/resources/legal', () => {
    const p = resolveLegalPaths({ isPackaged: false, resourcesPath: '/ignored', repoRoot: '/repo' });
    expect(p.LICENSE).toBe(path.join('/repo', 'LICENSE'));
    expect(p.NOTICE).toBe(path.join('/repo', 'NOTICE'));
    expect(p['PRIVACY.md']).toBe(path.join('/repo', 'PRIVACY.md'));
    expect(p['DISCLAIMER.md']).toBe(path.join('/repo', 'DISCLAIMER.md'));
    expect(p['THIRD_PARTY_NOTICES.md']).toBe(path.join('/repo', 'desktop', 'resources', 'legal', 'THIRD_PARTY_NOTICES.md'));
    expect(p['LICENSES.chromium.html']).toBe(
      path.join('/repo', 'desktop', 'node_modules', 'electron', 'dist', 'LICENSES.chromium.html'),
    );
  });
});

describe('checkLegalDir (chặn đóng gói)', () => {
  it('đủ năm tệp có nội dung → không lỗi', () => {
    writeAll(dir);
    expect(checkLegalDir(dir)).toEqual([]);
  });

  it('đòi cả giấy phép Chromium', () => {
    expect(LEGAL_FILES).toContain('LICENSES.chromium.html');
    writeAll(dir);
    fs.rmSync(path.join(dir, 'LICENSES.chromium.html'));
    expect(checkLegalDir(dir)).toEqual(['thiếu LICENSES.chromium.html']);
  });

  it('thư mục không tồn tại → báo thiếu tất cả', () => {
    expect(checkLegalDir(path.join(dir, 'khong-co'))).toEqual(LEGAL_FILES.map((f) => `thiếu ${f}`));
  });

  it('thiếu một tệp, một tệp rỗng, một tệp chỉ có khoảng trắng', () => {
    writeAll(dir, { NOTICE: '', 'PRIVACY.md': '  \n\n' });
    fs.rmSync(path.join(dir, 'THIRD_PARTY_NOTICES.md'));
    expect(checkLegalDir(dir)).toEqual(['NOTICE rỗng', 'PRIVACY.md rỗng', 'thiếu THIRD_PARTY_NOTICES.md']);
  });

  it('thư mục trùng tên tệp không qua được', () => {
    writeAll(dir);
    fs.rmSync(path.join(dir, 'LICENSE'));
    fs.mkdirSync(path.join(dir, 'LICENSE'));
    expect(checkLegalDir(dir)).toEqual(['LICENSE không phải tệp']);
  });
});

describe('parseLegalVersion', () => {
  it('đọc số từ dòng dấu', () => {
    expect(parseLegalVersion('# Quyền riêng tư\n<!-- legal-version: 3 -->\n')).toBe(3);
    expect(parseLegalVersion('<!--legal-version:12-->')).toBe(12);
    expect(parseLegalVersion('<!--   legal-version:   7   -->')).toBe(7);
  });

  it('không có dấu hoặc dấu hỏng → null', () => {
    expect(parseLegalVersion('# không có dấu')).toBeNull();
    expect(parseLegalVersion('<!-- legal-version: abc -->')).toBeNull();
    expect(parseLegalVersion('legal-version: 3')).toBeNull();
  });
});

describe('readLegalVersions', () => {
  it('đọc từ PRIVACY.md và DISCLAIMER.md; thiếu tệp/thiếu dấu = 0', () => {
    writeAll(dir, { 'PRIVACY.md': '<!-- legal-version: 2 -->\n# P', 'DISCLAIMER.md': '# không dấu' });
    const direct = Object.fromEntries(LEGAL_FILES.map((f) => [f, path.join(dir, f)])) as Record<LegalFile, string>;
    expect(readLegalVersions(direct)).toEqual({ privacy: 2, disclaimer: 0 });
    fs.rmSync(direct['PRIVACY.md']);
    expect(readLegalVersions(direct)).toEqual({ privacy: 0, disclaimer: 0 });
  });
});

describe('needsConsent', () => {
  const rec = { privacyVersion: 2, disclaimerVersion: 1, at: '2026-10-09T00:00:00.000Z', appVersion: '1.0.0' };

  it('chưa từng đồng ý → hỏi', () => {
    expect(needsConsent(null, { privacy: 0, disclaimer: 0 })).toBe(true);
  });

  it('cùng phiên bản → không hỏi', () => {
    expect(needsConsent(rec, { privacy: 2, disclaimer: 1 })).toBe(false);
  });

  it('một trong hai tài liệu lên phiên bản → hỏi lại', () => {
    expect(needsConsent(rec, { privacy: 3, disclaimer: 1 })).toBe(true);
    expect(needsConsent(rec, { privacy: 2, disclaimer: 2 })).toBe(true);
  });

  it('tài liệu hạ phiên bản (cài lại bản cũ) → không hỏi', () => {
    expect(needsConsent(rec, { privacy: 1, disclaimer: 1 })).toBe(false);
  });
});

describe('readConsent / writeConsent', () => {
  it('ghi rồi đọc lại đúng bản ghi; không để lại tệp tạm', () => {
    const file = path.join(dir, 'sub', 'legal-consent.json');
    const now = new Date('2026-10-09T01:02:03.000Z');
    const written = writeConsent(file, { privacy: 2, disclaimer: 1 }, '1.2.0', now);
    expect(written).toEqual({ privacyVersion: 2, disclaimerVersion: 1, at: '2026-10-09T01:02:03.000Z', appVersion: '1.2.0' });
    expect(readConsent(file)).toEqual(written);
    expect(fs.readdirSync(path.dirname(file))).toEqual(['legal-consent.json']);
    expect(needsConsent(readConsent(file), { privacy: 2, disclaimer: 1 })).toBe(false);
  });

  it('không có tệp, JSON hỏng, thiếu trường → null (hỏi lại)', () => {
    const file = path.join(dir, 'legal-consent.json');
    expect(readConsent(file)).toBeNull();
    fs.writeFileSync(file, '{hỏng');
    expect(readConsent(file)).toBeNull();
    fs.writeFileSync(file, JSON.stringify({ privacyVersion: '2', disclaimerVersion: 1 }));
    expect(readConsent(file)).toBeNull();
  });
});

describe('legalDocHtml', () => {
  const paths = () => Object.fromEntries(LEGAL_FILES.map((f) => [f, path.join(dir, f)])) as Record<LegalFile, string>;

  it('markdown được render, dấu phiên bản không hiện, có CSP chặt và không có script', () => {
    writeAll(dir, { 'PRIVACY.md': '<!-- legal-version: 1 -->\n# Quyền riêng tư\n\n<script>alert(1)</script>' });
    const html = legalDocHtml('privacy', paths());
    expect(html).toContain('<h1 id="quyền-riêng-tư">Quyền riêng tư</h1>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('legal-version');
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain(`content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"`);
  });

  it('Giấy phép gộp LICENSE + NOTICE (chữ thường) + THIRD_PARTY_NOTICES (markdown)', () => {
    writeAll(dir, { LICENSE: 'Apache <License>', NOTICE: 'Copyright voocel', 'THIRD_PARTY_NOTICES.md': '## gói a\n\nMIT' });
    const html = legalDocHtml('licenses', paths());
    expect(html).toContain('<pre class="plain">Apache &lt;License&gt;</pre>');
    expect(html).toContain('<pre class="plain">Copyright voocel</pre>');
    expect(html).toContain('<h2 id="gói-a">gói a</h2>');
    expect(html.indexOf('LICENSE')).toBeLessThan(html.indexOf('NOTICE'));
    expect(html.indexOf('NOTICE')).toBeLessThan(html.indexOf('THIRD_PARTY_NOTICES.md'));
  });

  it('trang Giấy phép có liên kết sang giấy phép Chromium, sau NOTICE', () => {
    writeAll(dir);
    const html = legalDocHtml('licenses', paths());
    expect(html).toContain(`<a href="${CHROMIUM_LINK}">Giấy phép Chromium</a>`);
    expect(html.indexOf(CHROMIUM_LINK)).toBeGreaterThan(html.indexOf('NOTICE'));
    expect(html.indexOf(CHROMIUM_LINK)).toBeLessThan(html.indexOf('THIRD_PARTY_NOTICES.md'));
    expect(legalDocHtml('privacy', paths())).not.toContain(CHROMIUM_LINK);
  });

  it('Chromium: nạp thẳng tệp HTML có sẵn, không render; thiếu tệp → trang ghi chú', () => {
    writeAll(dir);
    expect(legalDocSource('chromium', paths())).toEqual({ kind: 'file', file: path.join(dir, 'LICENSES.chromium.html') });
    expect(legalDocSource('privacy', paths()).kind).toBe('html');
    fs.rmSync(path.join(dir, 'LICENSES.chromium.html'));
    const src = legalDocSource('chromium', paths());
    expect(src.kind === 'html' && src.html).toContain('Không tìm thấy tệp LICENSES.chromium.html');
  });

  it('thiếu tệp → ghi chú thay vì lỗi', () => {
    writeAll(dir);
    fs.rmSync(path.join(dir, 'THIRD_PARTY_NOTICES.md'));
    expect(legalDocHtml('licenses', paths())).toContain('Không tìm thấy tệp THIRD_PARTY_NOTICES.md');
  });
});
