import fs from 'node:fs';
import path from 'node:path';

// Log của chính tiến trình main (updater, vòng đời cửa sổ) vào `<userData>/logs/main.log`.
// Bản đóng gói không có console, nên đây là nơi duy nhất thấy được lỗi mạng của updater.

const MAX_BYTES = 2 * 1024 * 1024;

export interface Logger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  debug(...args: unknown[]): void;
}

export function createLogger(file: string): Logger {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file) && fs.statSync(file).size > MAX_BYTES) fs.renameSync(file, `${file}.1`);
  } catch {
    // không ghi được thì chỉ còn console
  }
  const write = (level: string, args: unknown[]) => {
    const text = args
      .map((a) => (a instanceof Error ? a.stack ?? a.message : typeof a === 'string' ? a : safeJson(a)))
      .join(' ');
    const line = `${new Date().toISOString()} [${level}] ${text}\n`;
    if (level === 'error') console.error(line.trimEnd());
    else console.log(line.trimEnd());
    try {
      fs.appendFileSync(file, line);
    } catch {
      // bỏ qua
    }
  };
  return {
    info: (...a) => write('info', a),
    warn: (...a) => write('warn', a),
    error: (...a) => write('error', a),
    debug: () => {},
  };
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
