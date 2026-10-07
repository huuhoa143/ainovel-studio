import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, Menu, shell } from 'electron';
import { errorPageUrl, type ErrorAction, type ErrorKind } from './errorPage';
import { createLogger } from './logger';
import { buildMenu } from './menu';
import { resolveDataPaths, resolveSidecarPaths } from './paths';
import { Sidecar } from './sidecar';
import { startOnStablePort } from './stablePort';
import { checkForUpdates, initUpdater } from './updater';
import { createMainWindow } from './window';

// Bản thứ hai: nhường cho bản đang chạy (nó sẽ focus cửa sổ) rồi thoát ngay.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  run();
}

function run() {
  const data = resolveDataPaths(app.getPath('userData'));
  const log = createLogger(data.mainLog);
  // Dev: app.getAppPath() là `desktop/`, repo là thư mục cha.
  const bins = resolveSidecarPaths({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    repoRoot: path.dirname(app.getAppPath()),
    platform: process.platform,
    env: process.env,
  });

  let win: BrowserWindow | null = null;
  let sidecar: Sidecar | null = null;
  let origin: string | null = null;
  let starting = false;
  let quitReady = false;
  let stopping: Promise<void> | null = null;

  const stopSidecar = (): Promise<void> => {
    if (!sidecar) return Promise.resolve();
    stopping ??= sidecar.stop().finally(() => {
      stopping = null;
    });
    return stopping;
  };

  const showError = (kind: ErrorKind, detail: string) => {
    origin = null;
    const lines = sidecar?.lastLines(30) ?? [];
    log.error(`sidecar ${kind}: ${detail}`);
    ensureWindow();
    void win!.loadURL(errorPageUrl(kind, detail, lines));
  };

  const ensureWindow = () => {
    if (win && !win.isDestroyed()) return win;
    win = createMainWindow({
      stateFile: data.windowState,
      getOrigin: () => origin,
      onAction: (a) => onAction(a),
    });
    win.on('closed', () => {
      win = null;
    });
    return win;
  };

  const startSidecar = async () => {
    if (starting) return;
    starting = true;
    try {
      await stopSidecar();
      fs.mkdirSync(data.books, { recursive: true });
      const sc = new Sidecar({
        bin: bins.bin,
        booksDir: data.books,
        webDir: bins.web,
        cwd: data.userData,
        logFile: data.sidecarLog,
      });
      sidecar = sc;
      sc.on('exit', ({ code, signal }) => {
        if (sc !== sidecar || quitReady) return;
        showError('crashed', `Mã thoát: ${code ?? '-'}${signal ? `, tín hiệu ${signal}` : ''}`);
      });
      log.info(`sidecar: khởi động ${bins.bin} (web ${bins.web}, books ${data.books})`);
      const url = await startOnStablePort(sc, data.sidecarPort);
      origin = new URL(url).origin;
      log.info(`sidecar: sẵn sàng tại ${url}`);
      ensureWindow();
      await win!.loadURL(`${origin}/`);
    } catch (err) {
      showError('start-failed', (err as Error).message);
    } finally {
      starting = false;
    }
  };

  const openLogsDir = () => {
    fs.mkdirSync(data.logs, { recursive: true });
    void shell.openPath(data.logs);
  };

  const onAction = (a: ErrorAction) => {
    if (a === 'retry') void startSidecar();
    else openLogsDir();
  };

  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });

  // Đóng cửa sổ cuối là thoát app luôn, kể cả macOS — đơn giản cho người dùng ít rành máy.
  app.on('window-all-closed', () => app.quit());

  // Chặn quit tới khi sidecar dừng xong (để Go kịp nhả khóa truyện), rồi quit lại.
  app.on('before-quit', (event) => {
    if (quitReady || !sidecar?.running) return;
    event.preventDefault();
    void stopSidecar().finally(() => {
      quitReady = true;
      app.quit();
    });
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
        openBooksDir: () => {
          fs.mkdirSync(data.books, { recursive: true });
          void shell.openPath(data.books);
        },
        openLogsDir,
      }),
    );
    initUpdater({
      log,
      getWindow: () => win,
      beforeInstall: async () => {
        await stopSidecar();
        quitReady = true;
      },
    });
    void startSidecar();
    checkForUpdates(false);
  });
}
