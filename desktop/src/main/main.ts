import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app, BrowserWindow, dialog, Menu, shell } from 'electron';
import { APP_ID } from './appId';
import { askConsent } from './consentDialog';
import { DocViewer } from './docViewer';
import { errorPageUrl, loadingPageUrl, type ErrorAction } from './errorPage';
import { armExitWatchdog } from './exitWatchdog';
import { isAbortedLoad, Lifecycle } from './lifecycle';
import { cleanImportStaging, importBooks, summarizeImport } from './importBooks';
import { describeMigrationStep, migrateLegacyUserData, tightenConfigMode } from './legacyMigration';
import { needsConsent, readConsent, readLegalVersions, resolveLegalPaths, writeConsent } from './legal';
import { createLogger } from './logger';
import { buildMenu, IMPORT_MENU_ID, REPO_URL } from './menu';
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

  // Lần nhập trước bị ngắt (crash, bị kill) có thể để lại bản chép dở trong staging.
  try {
    const stale = cleanImportStaging(data.importStaging);
    if (stale.length > 0) log.info(`nhập truyện: dọn ${stale.length} bản chép dở của lần trước`);
  } catch (err) {
    log.warn(`nhập truyện: không dọn được ${data.importStaging}: ${(err as Error).message}`);
  }

  // Dev: app.getAppPath() là `desktop/`, repo là thư mục cha.
  const bins = resolveSidecarPaths({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    repoRoot: path.dirname(app.getAppPath()),
    platform: process.platform,
    env: process.env,
  });

  const legalPaths = resolveLegalPaths({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    repoRoot: path.dirname(app.getAppPath()),
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
      // Trước khi sidecar chạy lần đầu: chép config/luật/văn phong của bản CLI cũ sang — một lần
      // duy nhất trong đời app (tệp đánh dấu), các lần sau không làm gì. Lỗi chỉ ghi log — Go
      // thiếu config thì mở màn nhập key.
      const migration = migrateLegacyUserData({
        userData: data.userData,
        legacyDir: path.join(os.homedir(), '.ainovel'),
        platform: process.platform,
      });
      for (const s of migration.steps) (s.result.kind === 'error' ? log.warn : log.info)(describeMigrationStep(s));
      if (migration.markerError) {
        log.warn(`chuyển dữ liệu bản cũ: không ghi được tệp đánh dấu — ${migration.markerError.message}`);
      }
      // Mỗi lần: config.json chứa API key không được để người khác đọc.
      try {
        if (tightenConfigMode(data.config, process.platform)) log.info(`cấu hình: siết quyền ${data.config} về 0600`);
      } catch (err) {
        log.warn(`cấu hình: không siết được quyền ${data.config}: ${(err as Error).message}`);
      }
      log.info(`sidecar: khởi động ${bins.bin} (web ${bins.web}, books ${data.books})`);
      return new Sidecar({
        bin: bins.bin,
        booksDir: data.books,
        webDir: bins.web,
        configFile: data.config,
        cwd: data.userData,
        logFile: data.sidecarLog,
      });
    },
    startSidecar: (sc, signal) => startOnStablePort(sc, data.sidecarPort, signal),
    showLoading: () => loadLocal(loadingPageUrl()),
    studioAllowed: () => consentGiven,
    showStudio: (url) => ensureWindow().loadURL(url),
    showError: (kind, detail, lines) =>
      loadLocal(errorPageUrl(kind, detail, lines, { platform: process.platform, logsDir: data.logs })),
    hideWindows: () => {
      for (const w of BrowserWindow.getAllWindows()) w.hide();
    },
    quitApp: () => app.quit(),
  });

  const quitting = () => lifecycle.phase === 'quitting' || lifecycle.phase === 'exiting';

  const docs = new DocViewer({
    paths: legalPaths,
    cacheDir: data.legalView,
    getParent: () => win,
    log,
  });

  // Đồng ý điều khoản: sidecar khởi động song song, nhưng lifecycle chỉ tải studio khi
  // consentGiven xong — trước đó cửa sổ đứng ở trang "Đang khởi động…" (không có gì để bấm), hộp
  // thoại gắn vào cửa sổ. Chọn Thoát đi đường quit bình thường (lifecycle dừng sidecar).
  let allowStudio!: () => void;
  const consentGiven = new Promise<void>((resolve) => (allowStudio = resolve));

  const runConsent = async () => {
    const current = readLegalVersions(legalPaths);
    if (!needsConsent(readConsent(data.legalConsent), current)) {
      allowStudio();
      return;
    }
    log.info(`điều khoản: hỏi đồng ý (quyền riêng tư v${current.privacy}, miễn trừ v${current.disclaimer})`);
    // Hộp thoại phải gắn vào cửa sổ ĐANG hiện (sheet trên macOS) — đợi trang khởi động lên.
    const w = ensureWindow();
    if (!w.isVisible()) await new Promise<void>((resolve) => w.once('show', () => resolve()));
    const answer = await askConsent({ window: w, openDoc: (id) => docs.open(id), quitting });
    if (answer === 'quit') {
      if (!quitting()) {
        log.info('điều khoản: người dùng chọn Thoát');
        app.quit();
      }
      return;
    }
    try {
      writeConsent(data.legalConsent, current, app.getVersion());
    } catch (err) {
      // Không ghi được thì lần sau hỏi lại — vẫn cho dùng lần này.
      log.warn(`điều khoản: không ghi được ${data.legalConsent}: ${(err as Error).message}`);
    }
    log.info('điều khoản: người dùng đã đồng ý');
    allowStudio();
  };

  const showAbout = () => {
    const box: Electron.MessageBoxOptions = {
      type: 'info',
      title: 'Giới thiệu AINovel Studio',
      message: `AINovel Studio ${app.getVersion()}`,
      detail: [
        'Giấy phép Apache-2.0 — © voocel, huuhoa143.',
        'Bản fork tiếng Việt của voocel/ainovel-cli (github.com/voocel/ainovel-cli); engine, kiến trúc và thiết kế gốc thuộc về dự án upstream.',
        '',
        REPO_URL,
      ].join('\n'),
      buttons: ['Đóng', 'Mã nguồn trên GitHub', 'Giấy phép'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    };
    const owner = win && !win.isDestroyed() ? win : undefined;
    void (owner ? dialog.showMessageBox(owner, box) : dialog.showMessageBox(box)).then(({ response }) => {
      if (response === 1) void shell.openExternal(REPO_URL);
      else if (response === 2) docs.open('licenses');
    });
  };

  const onAction = (a: ErrorAction) => {
    if (a === 'retry') void lifecycle.start();
    else openDir(data.logs);
  };

  // Chỉ thêm thư mục mới vào books nên chạy được cả khi một truyện đang mở engine. Sidecar quét
  // books mỗi lần gọi /api/workshop, nên tải lại trang là đủ để danh sách hiện truyện mới.
  // Chép bất đồng bộ để cửa sổ không đơ; trong lúc chép: tắt mục menu, thanh tiến độ trên
  // Dock/taskbar, hậu tố tiêu đề. Thoát app thì hủy (importAbort) — truyện đang chép bị bỏ, không
  // để lại thư mục dở; sót gì trong staging thì lần mở sau cleanImportStaging dọn.
  let importAbort: AbortController | null = null;
  const IMPORTING_SUFFIX = ' — Đang nhập truyện…';

  const setImporting = (on: boolean) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById(IMPORT_MENU_ID);
    if (item) item.enabled = !on;
    if (!win || win.isDestroyed()) return;
    if (on) {
      win.setProgressBar(0);
      win.setTitle(win.webContents.getTitle() + IMPORTING_SUFFIX);
      win.on('page-title-updated', keepImportingTitle);
    } else {
      win.setProgressBar(-1);
      win.off('page-title-updated', keepImportingTitle);
      win.setTitle(win.webContents.getTitle());
    }
  };

  // Trang đổi document.title (chuyển truyện, tải lại) thì giữ hậu tố cho tới khi nhập xong.
  function keepImportingTitle(event: Electron.Event, title: string) {
    event.preventDefault();
    if (win && !win.isDestroyed()) win.setTitle(title + IMPORTING_SUFFIX);
  }

  const importFromFolder = async () => {
    if (importAbort || quitting()) return;
    const parent = win && !win.isDestroyed() ? win : undefined;
    const opts: Electron.OpenDialogOptions = {
      title: 'Nhập truyện từ thư mục',
      buttonLabel: 'Nhập',
      message: 'Chọn một thư mục truyện, hoặc thư mục chứa nhiều truyện (vd. output/ của bản cũ)',
      properties: ['openDirectory'],
    };
    const picked = parent ? await dialog.showOpenDialog(parent, opts) : await dialog.showOpenDialog(opts);
    if (picked.canceled || picked.filePaths.length === 0 || importAbort || quitting()) return;
    const source = picked.filePaths[0];
    const abort = new AbortController();
    importAbort = abort;
    setImporting(true);
    let message: string;
    let imported = 0;
    try {
      const r = await importBooks(
        { source, booksDir: data.books, stagingDir: data.importStaging },
        {
          signal: abort.signal,
          onProgress: (done, total) => {
            if (win && !win.isDestroyed()) win.setProgressBar(total > 0 ? done / total : 0);
          },
        },
      );
      imported = r.imported.length;
      message = summarizeImport(r);
      log.info(`nhập truyện từ ${source}: ${message}`);
      if (r.cancelled) return; // app đang thoát — không hiện hộp thoại
    } catch (err) {
      message = `Không đọc được thư mục: ${(err as Error).message}`;
      log.warn(`nhập truyện từ ${source}: ${message}`);
    } finally {
      importAbort = null;
      setImporting(false);
    }
    if (quitting()) return;
    const box: Electron.MessageBoxOptions = {
      type: imported > 0 ? 'info' : 'warning',
      message: imported > 0 ? 'Nhập truyện xong' : 'Không nhập được truyện nào',
      detail: message,
      buttons: ['OK'],
    };
    const owner = win && !win.isDestroyed() ? win : undefined;
    if (owner) await dialog.showMessageBox(owner, box);
    else await dialog.showMessageBox(box);
    // Chỉ tải lại khi cửa sổ đang ở studio — đang trang lỗi/khởi động thì studio sẽ tự tải mới.
    if (imported > 0 && win && !win.isDestroyed() && lifecycle.phase === 'running' && lifecycle.origin) {
      const current = win.webContents.getURL();
      if (current.startsWith(lifecycle.origin)) win.webContents.reload();
    }
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
    importAbort?.abort();
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
      copyright: '© voocel, huuhoa143 · Apache-2.0',
      // Credits hiện trong bảng About chuẩn của macOS (Windows/Linux dùng showAbout).
      credits: `Giấy phép Apache-2.0. Bản fork tiếng Việt của voocel/ainovel-cli — engine và thiết kế gốc thuộc về dự án upstream.\n${REPO_URL}`,
    });
    Menu.setApplicationMenu(
      buildMenu({
        checkForUpdates: () => checkForUpdates(true),
        openBooksDir: () => openDir(data.books),
        importBooks: () => {
          importFromFolder().catch((err: Error) => log.error('nhập truyện:', err));
        },
        openLogsDir: () => openDir(data.logs),
        openLegalDoc: (id) => docs.open(id),
        openExternal: (url) => void shell.openExternal(url),
        showAbout,
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
    runConsent().catch((err: Error) => {
      // Hộp thoại hỏng thì đừng khóa người dùng ngoài app mãi: ghi log và cho vào.
      log.error('điều khoản:', err);
      allowStudio();
    });
    checkForUpdates(false);
  });
}
