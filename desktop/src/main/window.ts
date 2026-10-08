import fs from 'node:fs';
import { BrowserWindow, screen, shell, type Event, type Rectangle } from 'electron';
import { actionFor, type ErrorAction } from './errorPage';

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized?: boolean;
}

const DEFAULT_STATE: WindowState = { width: 1280, height: 820 };

function loadState(file: string): WindowState {
  try {
    const s = JSON.parse(fs.readFileSync(file, 'utf8')) as WindowState;
    if (!(s.width >= 400 && s.height >= 300)) return DEFAULT_STATE;
    // Màn hình cũ đã rút ra thì bỏ vị trí, giữ kích thước — đừng mở cửa sổ ra ngoài tầm nhìn.
    if (s.x !== undefined && s.y !== undefined) {
      const r: Rectangle = { x: s.x, y: s.y, width: s.width, height: s.height };
      const visible = screen.getAllDisplays().some(({ workArea: a }) =>
        r.x < a.x + a.width && r.x + r.width > a.x && r.y < a.y + a.height && r.y + r.height > a.y,
      );
      if (!visible) return { width: s.width, height: s.height, maximized: s.maximized };
    }
    return s;
  } catch {
    return DEFAULT_STATE;
  }
}

function saveState(file: string, win: BrowserWindow) {
  if (win.isDestroyed()) return;
  const b = win.getNormalBounds();
  const state: WindowState = { ...b, maximized: win.isMaximized() };
  try {
    fs.writeFileSync(file, JSON.stringify(state));
  } catch {
    // không ghi được thì lần sau mở cỡ mặc định
  }
}

export interface MainWindowOptions {
  stateFile: string;
  /** Origin của studio khi sidecar đang chạy; null khi đang ở trang cục bộ. */
  getOrigin: () => string | null;
  onAction: (action: ErrorAction) => void;
  /** false khi app đang thoát: cửa sổ đã bị ẩn thì đừng để `ready-to-show` đến muộn hiện lại. */
  canShow: () => boolean;
}

function isHttp(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function createMainWindow(opts: MainWindowOptions): BrowserWindow {
  const state = loadState(opts.stateFile);
  const win = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 720,
    minHeight: 480,
    show: false,
    backgroundColor: '#0e0c09',
    title: 'AINovel Studio',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  if (state.maximized) win.maximize();
  win.once('ready-to-show', () => {
    if (opts.canShow()) win.show();
  });

  let saveTimer: NodeJS.Timeout | null = null;
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveState(opts.stateFile, win), 500);
  };
  win.on('resize', scheduleSave);
  win.on('move', scheduleSave);
  const clearSaveTimer = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
  };
  win.on('close', () => {
    clearSaveTimer();
    saveState(opts.stateFile, win);
  });
  win.on('closed', clearSaveTimer);

  const wc = win.webContents;
  // Chỉ ở lại origin của sidecar. Liên kết http(s) ra ngoài mở bằng trình duyệt; nút trên
  // trang cục bộ đi qua scheme `ainovel-action:`; còn lại chặn. Chuyển hướng (3xx) đi cùng luật,
  // trừ việc nó không bao giờ là một cú bấm nút.
  const guard = (event: Event, url: string, isRedirect: boolean) => {
    const action = isRedirect ? null : actionFor(wc.getURL(), url);
    if (action) {
      event.preventDefault();
      opts.onAction(action);
      return;
    }
    const origin = opts.getOrigin();
    if (origin && originOf(url) === origin) return;
    event.preventDefault();
    if (isHttp(url)) void shell.openExternal(url);
  };
  wc.on('will-navigate', (event, url) => guard(event, url, false));
  wc.on('will-redirect', (event, url) => guard(event, url, true));
  wc.setWindowOpenHandler(({ url }) => {
    if (isHttp(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  // Studio không cần quyền nào của trình duyệt (camera, micro, vị trí, thông báo…); chỉ cho
  // ghi clipboard (navigator.clipboard.writeText) để nút "Sao chép" chạy được.
  const allowed = (permission: string) => permission === 'clipboard-sanitized-write';
  wc.session.setPermissionRequestHandler((_wc, permission, callback) => callback(allowed(permission)));
  wc.session.setPermissionCheckHandler((_wc, permission) => allowed(permission));

  return win;
}
