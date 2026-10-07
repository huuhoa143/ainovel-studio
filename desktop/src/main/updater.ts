import { app, dialog, type BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { Logger } from './logger';

// Kênh cập nhật KHÔNG đặt ở đây: electron-updater đọc `<Resources>/app-update.yml` do
// forge.config.ts ghi (mac) hoặc maker NSIS sinh (win). Một nguồn, không lệch.

export interface UpdaterOptions {
  log: Logger;
  getWindow: () => BrowserWindow | null;
  /** Dừng sidecar trước khi cài, để quitAndInstall không phải chờ before-quit. */
  beforeInstall: () => Promise<void>;
}

let opts: UpdaterOptions | null = null;

// Lỗi của electron-updater kèm cả stack lẫn thân phản hồi HTTP (hàng trăm dòng) — một dòng
// là đủ cho log.
function firstLine(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.split('\n')[0]!.slice(0, 500);
}

// Lần kiểm tra do người dùng bấm từ menu thì báo cả "đã mới nhất" lẫn lỗi; lần tự động
// lúc mở app thì im lặng trừ khi có bản để cài.
let manualCheck = false;
let checking = false;
let promptShown = false;

function showBox(options: Electron.MessageBoxOptions) {
  const win = opts?.getWindow();
  return win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options);
}

export function initUpdater(o: UpdaterOptions): void {
  opts = o;
  autoUpdater.logger = {
    info: (m: unknown) => o.log.info(`updater: ${firstLine(m)}`),
    warn: (m: unknown) => o.log.warn(`updater: ${firstLine(m)}`),
    error: (m: unknown) => o.log.warn(`updater: ${firstLine(m)}`),
    debug: () => {},
  };
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-not-available', () => {
    o.log.info('updater: đang dùng bản mới nhất');
    if (manualCheck) {
      void showBox({
        type: 'info',
        buttons: ['Đóng'],
        message: 'Bạn đang dùng bản mới nhất',
        detail: `AINovel Studio ${app.getVersion()}`,
      });
    }
    manualCheck = false;
  });

  autoUpdater.on('update-available', (info) => {
    o.log.info(`updater: có bản ${info.version}, đang tải ngầm`);
    if (manualCheck) {
      void showBox({
        type: 'info',
        buttons: ['Đóng'],
        message: `Có bản mới ${info.version}`,
        detail: 'Bản cập nhật đang được tải về. Khi xong, app sẽ hỏi bạn khởi động lại.',
      });
    }
    manualCheck = false;
  });

  autoUpdater.on('error', (err) => {
    // Lỗi mạng chỉ ghi log — không làm phiền, trừ khi người dùng vừa tự bấm kiểm tra.
    o.log.warn(`updater: lỗi — ${firstLine(err)}`);
    if (manualCheck) {
      void showBox({
        type: 'warning',
        buttons: ['Đóng'],
        message: 'Không kiểm tra được bản cập nhật',
        detail: 'Hãy kiểm tra kết nối mạng rồi thử lại sau.',
      });
    }
    manualCheck = false;
  });

  autoUpdater.on('update-downloaded', async (info) => {
    o.log.info(`updater: đã tải xong bản ${info.version}`);
    if (promptShown) return;
    promptShown = true;
    const { response } = await showBox({
      type: 'info',
      buttons: ['Khởi động lại', 'Để sau'],
      defaultId: 0,
      cancelId: 1,
      message: 'Khởi động lại để cập nhật',
      detail: `AINovel Studio ${info.version} đã sẵn sàng. Bấm "Để sau" thì bản mới sẽ được cài khi bạn thoát app.`,
    });
    if (response !== 0) return;
    try {
      await o.beforeInstall();
    } finally {
      autoUpdater.quitAndInstall();
    }
  });
}

/** Kiểm tra cập nhật. Chỉ chạy ở bản đóng gói (bản dev không có app-update.yml). */
export function checkForUpdates(manual: boolean): void {
  if (!opts) return;
  if (!app.isPackaged) {
    opts.log.info('updater: bỏ qua — bản dev');
    if (manual) {
      void showBox({ type: 'info', buttons: ['Đóng'], message: 'Bản dev không tự cập nhật' });
    }
    return;
  }
  if (manual) manualCheck = true;
  if (checking) return;
  checking = true;
  autoUpdater
    .checkForUpdates()
    // Lỗi đã được ghi ở sự kiện 'error'; catch chỉ để không thành unhandled rejection.
    .catch(() => {})
    .finally(() => {
      checking = false;
    });
}
