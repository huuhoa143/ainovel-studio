import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';

// Vòng đời của `ainovel-cli serve` theo hợp đồng trong
// docs/superpowers/specs/2026-10-08-desktop-app-design.md. KHÔNG import electron: đường dẫn
// và thư mục log được đưa vào từ ngoài để vitest chạy được với một nhị phân giả.

const READY_RE = /^AINOVEL_READY (http:\/\/\S+)$/;

export interface SidecarOptions {
  bin: string;
  /** Đối số đứng TRƯỚC `serve …` — chỉ test dùng (vd. đường dẫn script cho node). */
  binArgsPrefix?: string[];
  booksDir: string;
  webDir: string;
  /** `<userData>/config.json`, tuyệt đối — Go đọc và ghi đúng một file này. */
  configFile: string;
  /** cwd của tiến trình con (`<userData>`). */
  cwd: string;
  logFile: string;
  env?: NodeJS.ProcessEnv;
  readyTimeoutMs?: number;
  stopTimeoutMs?: number;
  maxLogBytes?: number;
  ringSize?: number;
}

export interface SidecarExit {
  code: number | null;
  signal: NodeJS.Signals | null;
}

export interface SidecarArgsInput {
  booksDir: string;
  webDir: string;
  configFile: string;
}

/** `port` = 0 để hệ điều hành tự cấp cổng trống. */
export function sidecarArgs(input: SidecarArgsInput, port = 0): string[] {
  return [
    'serve',
    '--addr', `127.0.0.1:${port}`,
    '--root', input.booksDir,
    '--web', input.webDir,
    '--config', input.configFile,
    '--exit-on-stdin-close',
  ];
}

type State = 'idle' | 'starting' | 'ready' | 'stopping' | 'exited';

/**
 * Sự kiện:
 * - `exit` (SidecarExit): tiến trình chết bất ngờ SAU khi đã ready. Chết trước ready thì
 *   `start()` reject thay vì phát sự kiện; chết do `stop()` thì im lặng.
 */
export class Sidecar extends EventEmitter {
  private readonly opts: Required<Omit<SidecarOptions, 'binArgsPrefix' | 'env'>> &
    Pick<SidecarOptions, 'binArgsPrefix' | 'env'>;
  private child: ChildProcess | null = null;
  private state: State = 'idle';
  private ring: string[] = [];
  // Dòng của riêng lần start() hiện tại — để phân loại lỗi khởi động mà không lẫn log lần trước.
  private runLines: string[] = [];
  private logFd: number | null = null;
  private logBytes = 0;
  private exited: Promise<SidecarExit> | null = null;
  private _url: string | null = null;

  constructor(opts: SidecarOptions) {
    super();
    this.opts = {
      readyTimeoutMs: 20_000,
      // Ngân sách tắt êm chung với Go: trong khoảng này Go phải xả HTTP (thoiHanTatEm = 2 giây,
      // internal/serve/serve.go), dừng engine, lưu sổ chi phí và nhả khóa truyện. kill() sớm hơn
      // là để lại khóa mồ côi. Đổi số này thì sửa cả chú thích của thoiHanTatEm.
      stopTimeoutMs: 15_000,
      maxLogBytes: 5 * 1024 * 1024,
      ringSize: 200,
      ...opts,
    };
  }

  get url(): string | null {
    return this._url;
  }

  get running(): boolean {
    return this.state === 'starting' || this.state === 'ready' || this.state === 'stopping';
  }

  /** N dòng log cuối (stdout + stderr, theo thứ tự đến). */
  lastLines(n = this.opts.ringSize): string[] {
    return this.ring.slice(-n);
  }

  /** Dòng log của lần start() gần nhất (tối đa ringSize dòng cuối). */
  lastRunLines(): string[] {
    return [...this.runLines];
  }

  /** Khởi động và chờ dòng AINOVEL_READY. Trả về URL gốc của studio. */
  start(port = 0): Promise<string> {
    if (this.state !== 'idle' && this.state !== 'exited') {
      return Promise.reject(new Error(`sidecar đang ở trạng thái ${this.state}`));
    }
    this.state = 'starting';
    this._url = null;
    this.runLines = [];
    this.openLog();
    const args = [...(this.opts.binArgsPrefix ?? []), ...sidecarArgs(this.opts, port)];
    this.record('main', `khởi động: ${this.opts.bin} ${args.join(' ')}`);

    return new Promise<string>((resolve, reject) => {
      let settled = false;
      // Khai báo TRƯỚC fail(): spawn() có thể ném đồng bộ (đối số hỏng) và gọi fail() ngay.
      let timer: NodeJS.Timeout | undefined;
      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      };

      let child: ChildProcess;
      try {
        child = spawn(this.opts.bin, args, {
          cwd: this.opts.cwd,
          env: this.opts.env ?? process.env,
          // stdin để pipe và GIỮ MỞ: Go thoát êm khi nó đóng (--exit-on-stdin-close), kể cả
          // khi Electron chết đột ngột và hệ điều hành đóng pipe hộ.
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        });
      } catch (err) {
        this.state = 'exited';
        this.record('main', `không spawn được: ${(err as Error).message}`);
        this.closeLog();
        fail(err as Error);
        return;
      }
      this.child = child;
      // Ghi vào stdin đã đóng (EPIPE) không được làm sập main.
      child.stdin?.on('error', () => {});

      timer = setTimeout(() => {
        this.record('main', `không thấy AINOVEL_READY sau ${this.opts.readyTimeoutMs}ms — dừng tiến trình`);
        fail(new Error(`sidecar không sẵn sàng sau ${Math.round(this.opts.readyTimeoutMs / 1000)} giây`));
        child.kill();
      }, this.opts.readyTimeoutMs);

      this.pipeLines(child.stdout, 'out', (line) => {
        if (this.state !== 'starting') return;
        const m = READY_RE.exec(line);
        if (!m) return;
        this._url = m[1]!;
        this.state = 'ready';
        settled = true;
        clearTimeout(timer);
        resolve(this._url);
      });
      this.pipeLines(child.stderr, 'err');

      this.exited = new Promise<SidecarExit>((res) => {
        let done = false;
        const finish = (code: number | null, signal: NodeJS.Signals | null) => {
          if (done) return;
          done = true;
          const prev = this.state;
          this.state = 'exited';
          this.child = null;
          this.record('main', `tiến trình thoát: code=${code} signal=${signal}`);
          this.closeLog();
          const info: SidecarExit = { code, signal };
          res(info);
          // Chưa ready (kể cả bị stop() giữa lúc khởi động) thì start() reject; đã settle thì no-op.
          fail(new Error(`sidecar thoát trước khi sẵn sàng (code=${code}${signal ? `, signal=${signal}` : ''})`));
          if (prev === 'ready') this.emit('exit', info);
        };
        // on() chứ không once(): lần 'error' thứ hai không có listener là ném ra và làm sập main.
        child.on('error', (err) => {
          this.record('main', `lỗi tiến trình: ${err.message}`);
          fail(err);
          // Spawn thất bại (ENOENT…) thì không có 'close' đáng tin, tự khép vòng đời.
          if (child.pid === undefined) finish(null, null);
        });
        // 'close' chứ không phải 'exit': nó phát SAU khi stdout/stderr đã cạn, nên những dòng
        // cuối (thường là lý do chết) kịp vào log trước khi đóng tệp.
        child.once('close', (code, signal) => finish(code, signal));
      });
    });
  }

  /** Đóng stdin, chờ tối đa stopTimeoutMs, rồi kill(). Gọi lặp lại vô hại. */
  async stop(): Promise<void> {
    const child = this.child;
    if (!child || !this.exited || this.state === 'exited') return;
    if (this.state !== 'stopping') {
      this.state = 'stopping';
      this.record('main', 'dừng: đóng stdin');
      child.stdin?.end();
    }
    const exited = this.exited;
    if (await within(exited, this.opts.stopTimeoutMs)) return;
    this.record('main', `không thoát sau ${this.opts.stopTimeoutMs}ms — kill()`);
    child.kill();
    if (await within(exited, 2_000)) return;
    child.kill('SIGKILL');
    await exited;
  }

  private pipeLines(stream: NodeJS.ReadableStream | null, tag: 'out' | 'err', onLine?: (line: string) => void) {
    if (!stream) return;
    let buf = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => {
      buf += chunk;
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, '');
        buf = buf.slice(i + 1);
        this.record(tag, line);
        onLine?.(line);
      }
    });
    stream.on('end', () => {
      if (buf) {
        this.record(tag, buf);
        onLine?.(buf);
        buf = '';
      }
    });
  }

  private record(tag: 'out' | 'err' | 'main', line: string) {
    this.ring.push(tag === 'out' ? line : `[${tag}] ${line}`);
    if (this.ring.length > this.opts.ringSize) this.ring.splice(0, this.ring.length - this.opts.ringSize);
    this.runLines.push(this.ring[this.ring.length - 1]!);
    if (this.runLines.length > this.opts.ringSize) this.runLines.shift();
    this.writeLog(`${new Date().toISOString()} [${tag}] ${line}\n`);
  }

  private openLog() {
    if (this.logFd !== null) return;
    try {
      fs.mkdirSync(path.dirname(this.opts.logFile), { recursive: true });
      this.logBytes = fs.existsSync(this.opts.logFile) ? fs.statSync(this.opts.logFile).size : 0;
      if (this.logBytes > this.opts.maxLogBytes) this.rotateLog();
      else this.logFd = fs.openSync(this.opts.logFile, 'a');
    } catch {
      // Không ghi được log thì vẫn chạy; vòng đệm trong bộ nhớ vẫn còn cho trang lỗi.
      this.logFd = null;
    }
  }

  /**
   * Cắt log: đổi tên thành `.1` (đè bản cũ) và mở tệp mới. Trên Windows, phần mềm diệt virus
   * hay bộ lập chỉ mục đang giữ tệp thì rename hỏng (EPERM/EBUSY): khi đó cắt ngắn tệp tại chỗ
   * — mất phần log cũ nhưng dung lượng vẫn có trần, và logBytes về 0 nên không thử lại mỗi dòng.
   * Không bao giờ để logFd trỏ vào fd đã đóng.
   */
  private rotateLog() {
    this.closeLog();
    let renamed = false;
    try {
      fs.renameSync(this.opts.logFile, `${this.opts.logFile}.1`);
      renamed = true;
    } catch {
      // xem chú thích ở trên
    }
    try {
      this.logFd = fs.openSync(this.opts.logFile, renamed ? 'a' : 'w');
    } catch {
      this.logFd = null;
    }
    this.logBytes = 0;
  }

  private writeLog(text: string) {
    if (this.logFd === null) return;
    try {
      const bytes = Buffer.byteLength(text);
      if (this.logBytes + bytes > this.opts.maxLogBytes) {
        this.rotateLog();
        if (this.logFd === null) return;
      }
      fs.writeSync(this.logFd, text);
      this.logBytes += bytes;
    } catch {
      // Đĩa đầy hay tệp bị xóa giữa chừng: bỏ dòng này, không làm sập main.
    }
  }

  private closeLog() {
    if (this.logFd === null) return;
    try {
      fs.closeSync(this.logFd);
    } catch {
      // đã đóng
    }
    this.logFd = null;
  }
}

function within<T>(p: Promise<T>, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), ms);
    p.then(() => {
      clearTimeout(t);
      resolve(true);
    });
  });
}
