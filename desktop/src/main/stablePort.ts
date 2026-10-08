import fs from 'node:fs';
import type { Sidecar } from './sidecar';

// Giữ origin của studio ỔN ĐỊNH qua các lần mở app.
//
// Web lưu tùy chọn (giao diện sáng/tối, cỡ chữ đọc, rail…) trong localStorage, mà localStorage
// gắn theo origin — tức theo CỔNG. Cổng ngẫu nhiên mỗi lần mở là người dùng mất hết tùy chọn
// mỗi lần mở app (và sau mỗi lần "Thử lại"). Nên: nhớ cổng tốt gần nhất, lần sau xin lại đúng
// cổng đó; cổng đã bị chiếm thì để hệ điều hành cấp cổng mới (:0) và nhớ cổng mới.
//
// Không import electron: main.ts đưa đường dẫn tệp vào.

export function readSavedPort(file: string): number {
  try {
    const n = Number(fs.readFileSync(file, 'utf8').trim());
    return Number.isInteger(n) && n > 0 && n < 65536 ? n : 0;
  } catch {
    return 0;
  }
}

export function savePort(file: string, port: number): void {
  try {
    fs.writeFileSync(file, `${port}\n`);
  } catch {
    // không ghi được thì lần sau lại để hệ điều hành chọn
  }
}

/**
 * Lỗi `net.Listen` của Go luôn có dạng `listen tcp 127.0.0.1:<cổng>: bind: …` — cổng bận
 * (`address already in use`, Windows: `Only one usage of each socket address`) hoặc cổng nằm
 * trong dải Windows/Hyper-V giữ chỗ (`forbidden by its access permissions`). Mọi ca đó đều
 * chữa được bằng cách đổi cổng; còn lỗi khác (root không ghi được…) thì đổi cổng vô ích.
 */
export function isListenError(lines: string[]): boolean {
  return lines.some((l) => /listen tcp [^\s]*: bind:/i.test(l));
}

/**
 * Khởi động sidecar trên cổng đã nhớ (nếu có), lùi về :0 một lần khi cổng đó không dùng được.
 * `signal` bị hủy (app đang thoát / cài cập nhật) thì không thử lại — không spawn tiến trình mới
 * sau khi chủ của nó đã thôi cần.
 */
export async function startOnStablePort(sidecar: Sidecar, portFile: string, signal?: AbortSignal): Promise<string> {
  const saved = readSavedPort(portFile);
  let url: string;
  try {
    url = await sidecar.start(saved);
  } catch (err) {
    if (saved === 0 || signal?.aborted || !isListenError(sidecar.lastRunLines())) throw err;
    url = await sidecar.start(0);
  }
  const port = Number(new URL(url).port);
  if (port > 0 && port !== saved) savePort(portFile, port);
  return url;
}
