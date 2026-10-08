import { app, Menu, type MenuItemConstructorOptions } from 'electron';

export interface MenuActions {
  checkForUpdates: () => void;
  openBooksDir: () => void;
  openLogsDir: () => void;
  /** Hiện "Công cụ nhà phát triển" — bản dev luôn bật, bản đóng gói chỉ khi AINOVEL_DEVTOOLS=1. */
  devTools: boolean;
}

// Menu native. Mục "Sửa" là bắt buộc: thiếu nó thì Cmd+C/V không chạy trên macOS.
export function buildMenu(actions: MenuActions): Menu {
  const isMac = process.platform === 'darwin';
  const name = app.name;

  const appMenu: MenuItemConstructorOptions = {
    label: name,
    submenu: [
      { role: 'about', label: `Giới thiệu ${name}` },
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
    // sổ (Giới thiệu / Kiểm tra cập nhật / Thoát nằm ở menu đầu tiên) và Alt+F4 sẵn có.
    ...(isMac ? ([{ role: 'windowMenu', label: 'Cửa sổ' }] as MenuItemConstructorOptions[]) : []),
  ];

  return Menu.buildFromTemplate(template);
}
