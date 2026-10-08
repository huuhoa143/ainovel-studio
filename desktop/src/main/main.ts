import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, Menu, shell } from 'electron';
import { APP_ID } from './appId';
import { errorPageUrl, loadingPageUrl, type ErrorAction } from './errorPage';
import { armExitWatchdog } from './exitWatchdog';
import { isAbortedLoad, Lifecycle } from './lifecycle';
import { createLogger } from './logger';
import { buildMenu } from './menu';
import { resolveDataPaths, resolveSidecarPaths } from './paths';
import { Sidecar } from './sidecar';
import { startOnStablePort } from './stablePort';
import { checkForUpdates, initUpdater } from './updater';
import { createMainWindow } from './window';

// Windows gắn shortcut, ghim taskbar và thông báo theo AUMID; phải khớp appId mà bộ cài NSIS
// ghi vào shortcut, và phải đặt trước ready.
if (process.platform === 'win32') app.setAppUserModelId(APP_ID);

// Bản thứ hai: nhường cho bản đang chạy (nó sẽ focus cửa sổ) rồi thoát ngay.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  run();
}

function run() {
  const data = resolveDataPaths(app.getPath('userData'));
  const log = createLogger(data.mainLog);
  // Bản đóng gói không có console: lỗi lọt lưới phải nằm trong main.log (logger vẫn in ra
  // console, nên bản dev không mất gì).
  process.on('uncaughtException', (err) => log.error('uncaughtException:', err));
  process.on('unhandledRejection', (reason) => log.error('unhandledRejection:', reason));

  // Dev: app.getAppPath() là `desktop/`, repo là thư mục cha.
  const bins = resolveSidecarPaths({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    repoRoot: path.dirname(app.getAppPath()),
    platform: process.platform,
    env: process.env,
  });

  let win: BrowserWindow | null = null;

  const ensureWindow = (): BrowserWindow => {
    if (win && !win.isDestroyed()) return win;
    const w = createMainWindow({
      stateFile: data.windowState,
      getOrigin: () => lifecycle.origin,
      onAction: (a) => onAction(a),
      canShow: () => !quitting(),
    });
    w.on('closed', () => {
      if (win === w) win = null;
    });
    win = w;
    return w;
  };

  const loadLocal = (url: string) => {
    ensureWindow()
      .loadURL(url)
      // ERR_ABORTED = một trang khác (studio, trang lỗi) đã chen ngang — bình thường.
      .catch((err: Error) => {
        if (!isAbortedLoad(err)) log.warn(`cửa sổ: không tải được trang cục bộ — ${err.message}`);
      });
  };

  const openDir = (dir: string) => {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      log.warn(`không tạo được ${dir}: ${(err as Error).message}`);
    }
    void shell.openPath(dir).then((msg) => {
      if (msg) log.warn(`không mở được ${dir}: ${msg}`);
    });
  };

  const lifecycle = new Lifecycle<Sidecar>({
    log,
    createSidecar: () => {
      fs.mkdirSync(data.books, { recursive: true });
      log.info(`sidecar: khởi động ${bins.bin} (web ${bins.web}, books ${data.books})`);
      return new Sidecar({
        bin: bins.bin,
        booksDir: data.books,
        webDir: bins.web,
        cwd: data.userData,
        logFile: data.sidecarLog,
      });
    },
    startSidecar: (sc, signal) => startOnStablePort(sc, data.sidecarPort, signal),
    showLoading: () => loadLocal(loadingPageUrl()),
    showStudio: (url) => ensureWindow().loadURL(url),
    showError: (kind, detail, lines) =>
      loadLocal(errorPageUrl(kind, detail, lines, { platform: process.platform, logsDir: data.logs })),
    hideWindows: () => {
      for (const w of BrowserWindow.getAllWindows()) w.hide();
    },
    quitApp: () => app.quit(),
  });

  const quitting = () => lifecycle.phase === 'quitting' || lifecycle.phase === 'exiting';

  const onAction = (a: ErrorAction) => {
    if (a === 'retry') void lifecycle.start();
    else openDir(data.logs);
  };

  app.on('second-instance', () => {
    if (!win || win.isDestroyed() || quitting()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });

  // Đóng cửa sổ cuối là thoát app luôn, kể cả macOS — đơn giản cho người dùng ít rành máy.
  app.on('window-all-closed', () => app.quit());

  // Chặn quit tới khi sidecar dừng xong (để Go kịp nhả khóa truyện); lifecycle tự quit lại.
  app.on('before-quit', (event) => {
    if (!lifecycle.onBeforeQuit()) event.preventDefault();
  });

  // Mọi đường thoát (Cmd+Q, đóng cửa sổ, SIGTERM, cài cập nhật) đều đi qua đây khi đã chắc chắn
  // thoát. Chromium có thể treo ở bước tắt cuối khi máy bận — xem exitWatchdog.ts.
  app.on('will-quit', () => {
    armExitWatchdog({ pid: process.pid, platform: process.platform, logFile: data.mainLog });
  });

  app.whenReady().then(() => {
    app.setAboutPanelOptions({
      applicationName: 'AINovel Studio',
      applicationVersion: app.getVersion(),
      copyright: '© huuhoa143 · MIT',
    });
    Menu.setApplicationMenu(
      buildMenu({
        checkForUpdates: () => checkForUpdates(true),
        openBooksDir: () => openDir(data.books),
        openLogsDir: () => openDir(data.logs),
        devTools: !app.isPackaged || process.env.AINOVEL_DEVTOOLS === '1',
      }),
    );
    initUpdater({
      log,
      getWindow: () => win,
      prepareInstall: () => lifecycle.prepareInstall(),
      installProceeding: () => lifecycle.installProceeding(),
      installFailed: (reason) => lifecycle.installFailed(reason),
    });
    // Cửa sổ hiện ngay với trang "Đang khởi động…" (lifecycle.start nạp nó), không đợi READY.
    void lifecycle.start();
    checkForUpdates(false);
  });
}
