import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BASE_WEB_PREFERENCES } from '../src/main/webPrefs';

const SRC = path.resolve(__dirname, '..', 'src');

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? sources(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('webPreferences', () => {
  it('tắt kiểm chính tả (không tải từ điển Hunspell từ Google) và giữ sandbox', () => {
    expect(BASE_WEB_PREFERENCES).toEqual({ contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false });
  });

  // Mọi `new BrowserWindow({...})` trong src phải trải BASE_WEB_PREFERENCES và không bật lại
  // spellcheck — thêm cửa sổ mới mà quên là test này đỏ.
  it('mọi BrowserWindow trong src dùng BASE_WEB_PREFERENCES', () => {
    const sites: string[] = [];
    for (const file of sources(SRC)) {
      const text = fs.readFileSync(file, 'utf8');
      for (const m of text.matchAll(/new BrowserWindow\(/g)) {
        // Phần tùy chọn: tới `});` đầu tiên sau lời gọi.
        const opts = text.slice(m.index!, text.indexOf('});', m.index!));
        const where = `${path.relative(SRC, file)}@${m.index}`;
        sites.push(where);
        expect(opts, where).toMatch(/webPreferences:\s*\{\s*\.\.\.BASE_WEB_PREFERENCES/);
        expect(opts, where).not.toMatch(/spellcheck:\s*true/);
      }
    }
    expect(sites.length).toBeGreaterThanOrEqual(2); // cửa sổ chính + cửa sổ xem tài liệu
  });
});
