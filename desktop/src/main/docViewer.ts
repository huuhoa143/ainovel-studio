import fs from 'node:fs';
import path from 'node:path';
import { BrowserWindow, session, shell } from 'electron';
import { CHROMIUM_LINK, LEGAL_DOCS, legalDocSource, type LegalDocId, type LegalFile } from './legal';
import { BASE_WEB_PREFERENCES } from './webPrefs';

export interface DocViewerOptions {
  paths: Record<LegalFile, string>;
  /** Thư mục ghi trang đã render (trong userData). */
  cacheDir: string;
  getParent: () => BrowserWindow | null;
  log: { warn(msg: string): void };
}

function isHttp(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

/** Session riêng, chỉ trong bộ nhớ, của cửa sổ xem tài liệu. */
const VIEWER_PARTITION = 'legal-viewer';

/**
 * MỘT cửa sổ con dùng lại cho mọi tài liệu (mở tài liệu khác thì thay nội dung). Không preload,
 * không node, tắt luôn JavaScript — trang là HTML tĩnh do legal.ts render, hoặc
 * LICENSES.chromium.html có sẵn của Electron.
 *
 * Nạp qua tệp chứ không qua data: URL: THIRD_PARTY_NOTICES vài trăm KB, Chromium ~20 MB — vượt
 * giới hạn ~2 MB của URL trong Chromium. Tệp Chromium không mang CSP của ta, nên session riêng
 * của cửa sổ chặn mọi yêu cầu không phải file:// — trang không tải được gì từ mạng.
 */
export class DocViewer {
  private win: BrowserWindow | null = null;
  private sessionReady = false;

  constructor(private readonly opts: DocViewerOptions) {}

  /** Mở (hoặc chuyển) tài liệu, trả về cửa sổ để người gọi chờ `closed` nếu cần. */
  open(id: LegalDocId): BrowserWindow {
    const win = this.ensureWindow();
    const source = legalDocSource(id, this.opts.paths);
    let file: string;
    if (source.kind === 'file') {
      file = source.file;
    } else {
      file = path.join(this.opts.cacheDir, `${id}.html`);
      try {
        fs.mkdirSync(this.opts.cacheDir, { recursive: true });
        fs.writeFileSync(file, source.html);
      } catch (err) {
        this.opts.log.warn(`tài liệu: không ghi được ${file} — ${(err as Error).message}`);
      }
    }
    win.setTitle(LEGAL_DOCS[id].title);
    win.loadFile(file).catch((err: Error) => this.opts.log.warn(`tài liệu: không tải được ${file} — ${err.message}`));
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    return win;
  }

  private ensureWindow(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win;
    const ses = session.fromPartition(VIEWER_PARTITION);
    if (!this.sessionReady) {
      ses.setSpellCheckerEnabled(false);
      ses.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !details.url.startsWith('file://') }));
      ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
      ses.setPermissionCheckHandler(() => false);
      this.sessionReady = true;
    }
    const parent = this.opts.getParent();
    const win = new BrowserWindow({
      width: 820,
      height: 760,
      minWidth: 480,
      minHeight: 360,
      parent: parent && !parent.isDestroyed() ? parent : undefined,
      modal: false,
      show: false,
      backgroundColor: '#0e0c09',
      autoHideMenuBar: true,
      webPreferences: {
        ...BASE_WEB_PREFERENCES,
        javascript: false,
        partition: VIEWER_PARTITION,
      },
    });
    // Tiêu đề lấy từ LEGAL_DOCS, không để <title> của trang đè.
    win.on('page-title-updated', (e) => e.preventDefault());
    const wc = win.webContents;
    // Trang không được rời đi đâu: liên kết http(s) mở bằng trình duyệt, liên kết "Giấy phép
    // Chromium" chuyển tài liệu, còn lại (file:, tương đối…) chặn. Neo `#…` trong trang không phát
    // will-navigate nên vẫn chạy.
    wc.on('will-navigate', (event, url) => {
      event.preventDefault();
      if (url === CHROMIUM_LINK) this.open('chromium');
      else if (isHttp(url)) void shell.openExternal(url);
    });
    wc.on('will-redirect', (event) => event.preventDefault());
    wc.setWindowOpenHandler(({ url }) => {
      if (isHttp(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    win.on('closed', () => {
      if (this.win === win) this.win = null;
    });
    this.win = win;
    return win;
  }
}
