import type { WebPreferences } from 'electron';

// webPreferences chung cho MỌI BrowserWindow của app (test/webPrefs.test.ts quét src để chắc
// không cửa sổ nào tự đặt riêng). Không import giá trị nào từ electron để vitest đọc được.
//
// spellcheck: false — bật thì Chromium (Windows/Linux) tải từ điển Hunspell từ CDN của Google,
// một kết nối ra ngoài mà PRIVACY.md không liệt kê. Studio không cần kiểm chính tả.
export const BASE_WEB_PREFERENCES = {
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  spellcheck: false,
} as const satisfies WebPreferences;
