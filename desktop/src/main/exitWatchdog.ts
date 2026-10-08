import { spawn as nodeSpawn } from 'node:child_process';

// Lưới an toàn khi Chromium treo ở bước tắt CUỐI, sau khi mọi thứ của ta đã xong.
//
// Gốc rễ (đã tái hiện bằng một app Electron 11 dòng, không có code của ta, cả 42.0.1 lẫn
// 42.11.12): sau sự kiện 'quit', BrowserMainLoop::ShutdownThreadsAndCleanUp gọi
// TaskTracker::CompleteShutdown và chờ mọi tác vụ BLOCK_SHUTDOWN của ThreadPool. Các tác vụ đó
// chạy trên luồng nền (QoS background) mà macOS bóp CPU/IO; máy bận (build, notarize, Rosetta)
// là luồng nền đứng hẳn — ở `_pthread_set_properties_self` lúc vừa tạo, hay trong `open()` — và
// tiến trình chính treo mãi với cửa sổ đã đóng. Bản đang chạy giữ khóa single-instance nên
// người dùng mở lại cũng không được.
//
// Lúc đó JS đã chết (môi trường node bị hủy trước bước này), nên hẹn giờ trong JS vô dụng: phải
// là một tiến trình riêng. Hẹn giờ được đặt ở 'will-quit' — sidecar đã dừng (truyện đã nhả
// khóa), cửa sổ đã đóng, electron-updater đã chạy xong handler cài-khi-thoát của nó (handler
// đó gắn vào 'quit', phát ngay sau). Quá hạn mà tiến trình vẫn còn thì SIGKILL.
//
// Không bao giờ giết nhầm: so `ps -o lstart=` (thời điểm khởi động) lúc đặt và lúc bắn — PID đã
// được tái dùng (kể cả bởi chính AINovel Studio vừa mở lại) thì lstart khác, bỏ qua.

export const EXIT_WATCHDOG_MS = 10_000;

// $1 = pid, $2 = số giây chờ, $3 = tệp log. Đối số vị trí nên đường dẫn có dấu cách/nháy vẫn an toàn.
export const WATCHDOG_SCRIPT = [
  's=$(ps -p "$1" -o lstart= 2>/dev/null) || exit 0',
  'sleep "$2"',
  '[ -n "$s" ] && [ "$(ps -p "$1" -o lstart= 2>/dev/null)" = "$s" ] || exit 0',
  'echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [warn] tắt: Chromium chưa thoát sau $2 giây kể từ will-quit — SIGKILL $1" >> "$3"',
  'kill -9 "$1"',
].join('\n');

export interface ExitWatchdogOptions {
  pid: number;
  platform: NodeJS.Platform;
  logFile: string;
  delayMs?: number;
  spawn?: typeof nodeSpawn;
}

/**
 * Đặt hẹn giờ ép thoát. Chỉ macOS/Linux: treo này là chuyện luồng nền QoS của macOS, chưa
 * thấy trên Windows (và Windows không có sh/ps để làm việc này an toàn). Trả về đã đặt hay chưa.
 */
export function armExitWatchdog(o: ExitWatchdogOptions): boolean {
  if (o.platform === 'win32') return false;
  const seconds = String((o.delayMs ?? EXIT_WATCHDOG_MS) / 1000);
  try {
    const child = (o.spawn ?? nodeSpawn)('/bin/sh', ['-c', WATCHDOG_SCRIPT, 'ainovel-exit-watchdog', String(o.pid), seconds, o.logFile], {
      detached: true,
      stdio: 'ignore',
      // App mở từ Finder có PATH tối thiểu; ghim để ps/sleep/date luôn là bản hệ thống.
      env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
    });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}
