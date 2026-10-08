import { app, Menu, type MenuItemConstructorOptions } from 'electron';
import type { LegalDocId } from './legal';

/** Mục "Nhập truyện…" — main.ts tắt nó trong lúc đang nhập. */
export const IMPORT_MENU_ID = 'import-books';

export const REPO_URL = 'https://github.com/huuhoa143/ainovel-studio';
export const ISSUES_URL = `${REPO_URL}/issues/new/choose`;

export interface MenuActions {
  checkForUpdates: () => void;
  openBooksDir: () => void;
  importBooks: () => void;
  openLogsDir: () => void;
  openLegalDoc: (id: LegalDocId) => void;
  openExternal: (url: string) => void;
  /** Windows/Linux: hộp "Giới thiệu" tự vẽ (macOS dùng bảng About chuẩn trong menu app). */
  showAbout: () => void;
  /** Hiện "Công cụ nhà phát triển" — bản dev luôn bật, bản đóng gói chỉ khi AINOVEL_DEVTOOLS=1. */
  devTools: boolean;
}

export function buildMenu(actions: MenuActions): Menu {
  return Menu.buildFromTemplate(menuTemplate(actions, process.platform, app.name));
}

// Menu native. Mục "Sửa" là bắt buộc: thiếu nó thì Cmd+C/V không chạy trên macOS.
export function menuTemplate(actions: MenuActions, platform: NodeJS.Platform, name: string): MenuItemConstructorOptions[] {
  const isMac = platform === 'darwin';

  const appMenu: MenuItemConstructorOptions = {
    label: name,
    submenu: [
      ...(isMac ? ([{ role: 'about', label: `Giới thiệu ${name}` }] as MenuItemConstructorOptions[]) : []),
      { label: 'Kiểm tra cập nhật…', click: () => actions.checkForUpdates() },
      { type: 'separator' },
      ...(isMac
        ? ([
            { role: 'hide', label: `Ẩn ${name}` },
            { role: 'hideOthers', label: 'Ẩn các app khác' },
            { role: 'unhide', label: 'Hiện tất cả' },
            { type: 'separator' },
          ] as MenuItemConstructorOptions[])
        : []),
      { role: 'quit', label: `Thoát ${name}` },
    ],
  };

  const template: MenuItemConstructorOptions[] = [
    appMenu,
    {
      label: 'Tệp',
      submenu: [
        { id: IMPORT_MENU_ID, label: 'Nhập truyện từ thư mục…', click: () => actions.importBooks() },
        { type: 'separator' },
        { label: 'Mở thư mục truyện', click: () => actions.openBooksDir() },
        { label: 'Mở thư mục log', click: () => actions.openLogsDir() },
      ],
    },
    {
      label: 'Sửa',
      submenu: [
        { role: 'undo', label: 'Hoàn tác' },
        { role: 'redo', label: 'Làm lại' },
        { type: 'separator' },
        { role: 'cut', label: 'Cắt' },
        { role: 'copy', label: 'Sao chép' },
        { role: 'paste', label: 'Dán' },
        { role: 'selectAll', label: 'Chọn tất cả' },
      ],
    },
    {
      label: 'Xem',
      submenu: [
        { role: 'reload', label: 'Tải lại' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Cỡ chữ gốc' },
        { role: 'zoomIn', label: 'Phóng to' },
        { role: 'zoomOut', label: 'Thu nhỏ' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Toàn màn hình' },
        ...(actions.devTools
          ? ([{ role: 'toggleDevTools', label: 'Công cụ nhà phát triển' }] as MenuItemConstructorOptions[])
          : []),
      ],
    },
    // macOS: menu Cửa sổ chuẩn — Cmd+W đóng, Cmd+M thu nhỏ. Windows giữ thanh menu trong cửa
    // sổ (Kiểm tra cập nhật / Thoát ở menu đầu tiên, Giới thiệu ở Trợ giúp) và Alt+F4 sẵn có.
    ...(isMac ? ([{ role: 'windowMenu', label: 'Cửa sổ' }] as MenuItemConstructorOptions[]) : []),
    // role 'help' trên macOS: hệ điều hành gắn ô Tìm kiếm chuẩn vào đầu menu.
    {
      label: 'Trợ giúp',
      ...(isMac ? { role: 'help' as const } : {}),
      submenu: [
        { label: 'Quyền riêng tư', click: () => actions.openLegalDoc('privacy') },
        { label: 'Miễn trừ trách nhiệm', click: () => actions.openLegalDoc('disclaimer') },
        { label: 'Giấy phép mã nguồn mở', click: () => actions.openLegalDoc('licenses') },
        { type: 'separator' },
        { label: 'Mã nguồn trên GitHub', click: () => actions.openExternal(REPO_URL) },
        { label: 'Báo lỗi…', click: () => actions.openExternal(ISSUES_URL) },
        ...(isMac
          ? []
          : ([
              { type: 'separator' },
              { label: `Giới thiệu ${name}`, click: () => actions.showAbout() },
            ] as MenuItemConstructorOptions[])),
      ],
    },
  ];

  return template;
}
