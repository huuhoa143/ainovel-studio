// Hai trang cục bộ (data: URL) mà main tự hiện, không cần sidecar: trang "Đang khởi động…" và
// trang lỗi khi sidecar không lên hoặc chết giữa chừng. Không có preload/IPC, nên hai nút trên
// trang lỗi là liên kết tới scheme riêng `ainovel-action:`; window.ts chặn `will-navigate` tới
// scheme này và gọi hành động tương ứng — chỉ khi trang hiện tại là trang cục bộ (actionFor).

import { escapeHtml } from './markdown';

export const ACTION_SCHEME = 'ainovel-action:';
export type ErrorAction = 'retry' | 'open-logs';

export type ErrorKind = 'start-failed' | 'crashed';

export interface ErrorPageContext {
  platform: NodeJS.Platform;
  /** Thư mục log, in ra cho người dùng chép gửi hỗ trợ. */
  logsDir: string;
}

const COPY: Record<ErrorKind, { title: string; body: string }> = {
  'start-failed': {
    title: 'Không khởi động được AINovel Studio',
    body: 'Phần máy chủ chạy ngầm của app không lên được. Bấm "Thử lại"; nếu vẫn lỗi, mở thư mục log và gửi tệp sidecar.log cho người hỗ trợ.',
  },
  crashed: {
    title: 'AINovel Studio vừa dừng bất ngờ',
    body: 'Phần máy chủ chạy ngầm của app đã tắt. Truyện đã lưu trên máy vẫn còn nguyên. Bấm "Thử lại" để mở lại.',
  },
};

// Trên Windows, phần mềm diệt virus hay chặn/cách ly nhị phân Go chưa ký — lý do khởi động
// hỏng thường gặp nhất mà người dùng tự chữa được.
const WIN_AV_HINT =
  'Trên Windows, phần mềm diệt virus đôi khi chặn hoặc cách ly tệp "ainovel-cli.exe" của app. Nếu vậy, hãy cho phép tệp đó trong phần mềm diệt virus rồi bấm "Thử lại".';

export function parseAction(url: string): ErrorAction | null {
  if (!url.startsWith(ACTION_SCHEME)) return null;
  const name = url.slice(ACTION_SCHEME.length).replace(/^\/+/, '').replace(/\/+$/, '');
  return name === 'retry' || name === 'open-logs' ? name : null;
}

/** Trang hiện tại là trang cục bộ của main (đang khởi động / lỗi) — không bao giờ là studio. */
export function isLocalPage(url: string): boolean {
  return url.startsWith('data:');
}

/**
 * Hành động cần làm khi trang `currentUrl` điều hướng tới `targetUrl`. Chỉ trang cục bộ mới ra
 * lệnh được: studio (hay bất cứ thứ gì nó nhúng) mà điều hướng tới `ainovel-action:` thì bỏ qua.
 */
export function actionFor(currentUrl: string, targetUrl: string): ErrorAction | null {
  return isLocalPage(currentUrl) ? parseAction(targetUrl) : null;
}

function page(title: string, body: string, extraCss = ''): string {
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #0e0c09; color: #e8e4dc; font: 15px/1.55 -apple-system, "Segoe UI", system-ui, sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 56px 32px; }
  h1 { font-size: 22px; font-weight: 600; margin: 0 0 12px; }
  p { margin: 0 0 8px; color: #c9c3b8; }
${extraCss}
</style>
</head>
<body>
${body}
</body>
</html>`;
}

function toDataUrl(html: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

export function loadingPageHtml(): string {
  const title = 'Đang khởi động…';
  return page(
    title,
    `<main class="loading">
  <h1>${escapeHtml(title)}</h1>
  <p>AINovel Studio đang mở phần máy chủ chạy ngầm. Thường chỉ mất vài giây.</p>
</main>`,
    `  main.loading { padding-top: 30vh; text-align: center; }
  main.loading h1 { color: #eab656; }`,
  );
}

export function loadingPageUrl(): string {
  return toDataUrl(loadingPageHtml());
}

export function errorPageHtml(kind: ErrorKind, detail: string, logLines: string[], ctx: ErrorPageContext): string {
  const { title, body } = COPY[kind];
  const log = logLines.slice(-30).map(escapeHtml).join('\n') || '(chưa có dòng log nào)';
  const avHint = kind === 'start-failed' && ctx.platform === 'win32' ? `\n  <p>${escapeHtml(WIN_AV_HINT)}</p>` : '';
  return page(
    title,
    `<main>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(body)}</p>${avHint}
  <p class="detail">${escapeHtml(detail)}</p>
  <div class="actions">
    <a class="btn primary" href="${ACTION_SCHEME}retry">Thử lại</a>
    <a class="btn secondary" href="${ACTION_SCHEME}open-logs">Mở thư mục log</a>
  </div>
  <p class="detail">Thư mục log: <code>${escapeHtml(ctx.logsDir)}</code></p>
  <h2>30 dòng log cuối</h2>
  <pre>${log}</pre>
</main>`,
    `  .detail { color: #8b8780; font-size: 13px; }
  code { font: 12px ui-monospace, "SF Mono", Menlo, Consolas, monospace; color: #b8b2a7; user-select: all; }
  .actions { display: flex; gap: 12px; margin: 24px 0 16px; }
  a.btn { display: inline-block; padding: 9px 18px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px; }
  a.primary { background: #eab656; color: #0e0c09; }
  a.secondary { border: 1px solid #3a352e; color: #e8e4dc; }
  a.btn:focus-visible { outline: 2px solid #71c1ad; outline-offset: 2px; }
  h2 { font-size: 13px; font-weight: 600; color: #8b8780; margin: 20px 0 8px; }
  pre { margin: 0; padding: 14px 16px; background: #17140f; border: 1px solid #2a261f; border-radius: 6px;
        font: 12px/1.5 ui-monospace, "SF Mono", Menlo, Consolas, monospace; color: #b8b2a7;
        white-space: pre-wrap; word-break: break-all; max-height: 50vh; overflow: auto; }`,
  );
}

export function errorPageUrl(kind: ErrorKind, detail: string, logLines: string[], ctx: ErrorPageContext): string {
  return toDataUrl(errorPageHtml(kind, detail, logLines, ctx));
}
