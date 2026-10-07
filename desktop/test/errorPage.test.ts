import { describe, expect, it } from 'vitest';
import { errorPageHtml, errorPageUrl, parseAction } from '../src/main/errorPage';

describe('parseAction', () => {
  it('nhận hai hành động, bỏ qua phần còn lại', () => {
    expect(parseAction('ainovel-action:retry')).toBe('retry');
    expect(parseAction('ainovel-action://open-logs/')).toBe('open-logs');
    expect(parseAction('ainovel-action:rm-rf')).toBeNull();
    expect(parseAction('http://127.0.0.1:1234/')).toBeNull();
  });
});

describe('errorPageHtml', () => {
  it('chỉ lấy 30 dòng cuối và escape HTML trong log', () => {
    const lines = Array.from({ length: 40 }, (_, i) => `dòng ${i}`);
    lines.push('<script>alert(1)</script>');
    const html = errorPageHtml('crashed', 'Mã thoát: 2', lines);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('dòng 10\n');
    expect(html).toContain('dòng 11');
    expect(html).toContain('Thử lại');
    expect(html).toContain('Mở thư mục log');
  });

  it('data URL giải mã lại được', () => {
    const url = errorPageUrl('start-failed', 'x', []);
    expect(url.startsWith('data:text/html;charset=utf-8,')).toBe(true);
    expect(decodeURIComponent(url.slice(url.indexOf(',') + 1))).toContain('Không khởi động được');
  });
});
