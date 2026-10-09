import { describe, expect, it } from 'vitest';
import { actionFor, errorPageHtml, errorPageUrl, loadingPageUrl, parseAction } from '../src/main/errorPage';

const MAC = { platform: 'darwin' as const, logsDir: '/Users/a/Library/Application Support/AINovel Studio/logs' };
const WIN = { platform: 'win32' as const, logsDir: 'C:\\Users\\a\\AppData\\Roaming\\AINovel Studio\\logs' };

function decode(url: string): string {
  return decodeURIComponent(url.slice(url.indexOf(',') + 1));
}

describe('parseAction', () => {
  it('nhận hai hành động, bỏ qua phần còn lại', () => {
    expect(parseAction('ainovel-action:retry')).toBe('retry');
    expect(parseAction('ainovel-action://open-logs/')).toBe('open-logs');
    expect(parseAction('ainovel-action:rm-rf')).toBeNull();
    expect(parseAction('http://127.0.0.1:1234/')).toBeNull();
  });
});

describe('actionFor', () => {
  it('chỉ trang cục bộ (data:) mới ra lệnh được', () => {
    const errorPage = errorPageUrl('crashed', 'x', [], MAC);
    expect(actionFor(errorPage, 'ainovel-action:retry')).toBe('retry');
    expect(actionFor(loadingPageUrl(), 'ainovel-action:open-logs')).toBe('open-logs');
  });

  it('studio điều hướng tới ainovel-action: thì bỏ qua', () => {
    expect(actionFor('http://127.0.0.1:48123/', 'ainovel-action:retry')).toBeNull();
    expect(actionFor('http://127.0.0.1:48123/sach/a', 'ainovel-action:open-logs')).toBeNull();
    expect(actionFor('', 'ainovel-action:retry')).toBeNull();
  });
});

describe('errorPageHtml', () => {
  it('chỉ lấy 30 dòng cuối và escape HTML trong log', () => {
    const lines = Array.from({ length: 40 }, (_, i) => `dòng ${i}`);
    lines.push('<script>alert(1)</script>');
    const html = errorPageHtml('crashed', 'Mã thoát: 2', lines, MAC);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('dòng 10\n');
    expect(html).toContain('dòng 11');
    expect(html).toContain('Thử lại');
    expect(html).toContain('Mở thư mục log');
  });

  it('in đường dẫn thư mục log', () => {
    expect(errorPageHtml('start-failed', 'x', [], MAC)).toContain(MAC.logsDir);
    expect(errorPageHtml('crashed', 'x', [], WIN)).toContain(WIN.logsDir);
  });

  it('gợi ý diệt virus chặn ainovel-cli.exe chỉ ở Windows, chỉ khi không khởi động được', () => {
    expect(errorPageHtml('start-failed', 'x', [], WIN)).toContain('ainovel-cli.exe');
    expect(errorPageHtml('start-failed', 'x', [], MAC)).not.toContain('ainovel-cli.exe');
    expect(errorPageHtml('crashed', 'x', [], WIN)).not.toContain('ainovel-cli.exe');
  });

  it('data URL giải mã lại được', () => {
    const url = errorPageUrl('start-failed', 'x', [], MAC);
    expect(url.startsWith('data:text/html;charset=utf-8,')).toBe(true);
    expect(decode(url)).toContain('Không khởi động được');
  });
});

describe('loadingPageUrl', () => {
  it('trang khởi động cục bộ, cùng nền tối với trang lỗi', () => {
    const html = decode(loadingPageUrl());
    expect(html).toContain('Đang khởi động…');
    expect(html).toContain('#0e0c09');
    expect(html).not.toContain('ainovel-action:');
  });
});
