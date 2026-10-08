import { describe, expect, it, vi, type Mock } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';

// menu.ts import `app`/`Menu` từ electron; menuTemplate không đụng tới chúng.
vi.mock('electron', () => ({ app: { name: 'AINovel Studio' }, Menu: {} }));
const { ISSUES_URL, menuTemplate, REPO_URL } = await import('../src/main/menu');

function actions() {
  return {
    checkForUpdates: vi.fn(),
    openBooksDir: vi.fn(),
    importBooks: vi.fn(),
    openLogsDir: vi.fn(),
    openLegalDoc: vi.fn(),
    openExternal: vi.fn(),
    showAbout: vi.fn(),
    devTools: false,
  };
}

const sub = (item: MenuItemConstructorOptions) => item.submenu as MenuItemConstructorOptions[];
const labels = (items: MenuItemConstructorOptions[]) => items.map((i) => (i.type === 'separator' ? '—' : i.label));
const click = (item: MenuItemConstructorOptions | undefined) =>
  (item!.click as unknown as () => void)();

function helpMenu(template: MenuItemConstructorOptions[]) {
  const help = template.find((m) => m.label === 'Trợ giúp');
  expect(help, 'thiếu menu Trợ giúp').toBeDefined();
  expect(template.at(-1)).toBe(help);
  return help!;
}

describe('menu Trợ giúp', () => {
  it('macOS: role help, không có Giới thiệu (nằm ở menu app)', () => {
    const a = actions();
    const t = menuTemplate(a, 'darwin', 'AINovel Studio');
    const help = helpMenu(t);
    expect(help.role).toBe('help');
    expect(labels(sub(help))).toEqual([
      'Quyền riêng tư',
      'Miễn trừ trách nhiệm',
      'Giấy phép mã nguồn mở',
      '—',
      'Mã nguồn trên GitHub',
      'Báo lỗi…',
    ]);
    expect(sub(t[0]).some((i) => i.role === 'about')).toBe(true);
  });

  for (const platform of ['win32', 'linux'] as const) {
    it(`${platform}: có Giới thiệu trong Trợ giúp, menu app không còn role about`, () => {
      const a = actions();
      const t = menuTemplate(a, platform, 'AINovel Studio');
      const help = helpMenu(t);
      expect(help.role).toBeUndefined();
      expect(labels(sub(help))).toEqual([
        'Quyền riêng tư',
        'Miễn trừ trách nhiệm',
        'Giấy phép mã nguồn mở',
        '—',
        'Mã nguồn trên GitHub',
        'Báo lỗi…',
        '—',
        'Giới thiệu AINovel Studio',
      ]);
      expect(sub(t[0]).some((i) => i.role === 'about')).toBe(false);
      click(sub(help).find((i) => i.label === 'Giới thiệu AINovel Studio'));
      expect(a.showAbout).toHaveBeenCalledOnce();
    });
  }

  it('các mục gọi đúng hành động', () => {
    const a = actions();
    const items = sub(helpMenu(menuTemplate(a, 'darwin', 'AINovel Studio')));
    const by = (label: string) => items.find((i) => i.label === label);
    click(by('Quyền riêng tư'));
    click(by('Miễn trừ trách nhiệm'));
    click(by('Giấy phép mã nguồn mở'));
    expect((a.openLegalDoc as Mock).mock.calls).toEqual([['privacy'], ['disclaimer'], ['licenses']]);
    click(by('Mã nguồn trên GitHub'));
    click(by('Báo lỗi…'));
    expect((a.openExternal as Mock).mock.calls).toEqual([[REPO_URL], [ISSUES_URL]]);
    expect(REPO_URL).toBe('https://github.com/huuhoa143/ainovel-studio');
    expect(ISSUES_URL).toBe('https://github.com/huuhoa143/ainovel-studio/issues/new/choose');
  });
});
