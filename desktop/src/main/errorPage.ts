// Trang lỗi khi sidecar không lên hoặc chết giữa chừng. Không có preload/IPC, nên hai nút
// là liên kết tới scheme riêng `ainovel-action:`; window.ts chặn `will-navigate` tới scheme
// này và gọi hành động tương ứng.

export const ACTION_SCHEME = 'ainovel-action:';
export type ErrorAction = 'retry' | 'open-logs';

export type ErrorKind = 'start-failed' | 'crashed';

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

export function parseAction(url: string): ErrorAction | null {
  if (!url.startsWith(ACTION_SCHEME)) return null;
  const name = url.slice(ACTION_SCHEME.length).replace(/^\/+/, '').replace(/\/+$/, '');
  return name === 'retry' || name === 'open-logs' ? name : null;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function errorPageHtml(kind: ErrorKind, detail: string, logLines: string[]): string {
  const { title, body } = COPY[kind];
  const log = logLines.slice(-30).map(escapeHtml).join('\n') || '(chưa có dòng log nào)';
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
  .detail { color: #8b8780; font-size: 13px; }
  .actions { display: flex; gap: 12px; margin: 24px 0 28px; }
  a.btn { display: inline-block; padding: 9px 18px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px; }
  a.primary { background: #eab656; color: #0e0c09; }
  a.secondary { border: 1px solid #3a352e; color: #e8e4dc; }
  a.btn:focus-visible { outline: 2px solid #71c1ad; outline-offset: 2px; }
  h2 { font-size: 13px; font-weight: 600; color: #8b8780; margin: 0 0 8px; }
  pre { margin: 0; padding: 14px 16px; background: #17140f; border: 1px solid #2a261f; border-radius: 6px;
        font: 12px/1.5 ui-monospace, "SF Mono", Menlo, Consolas, monospace; color: #b8b2a7;
        white-space: pre-wrap; word-break: break-all; max-height: 50vh; overflow: auto; }
</style>
</head>
<body>
<main>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(body)}</p>
  <p class="detail">${escapeHtml(detail)}</p>
  <div class="actions">
    <a class="btn primary" href="${ACTION_SCHEME}retry">Thử lại</a>
    <a class="btn secondary" href="${ACTION_SCHEME}open-logs">Mở thư mục log</a>
  </div>
  <h2>30 dòng log cuối</h2>
  <pre>${log}</pre>
</main>
</body>
</html>`;
}

export function errorPageUrl(kind: ErrorKind, detail: string, logLines: string[]): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(errorPageHtml(kind, detail, logLines))}`;
}
