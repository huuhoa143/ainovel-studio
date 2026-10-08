import type { ErrorKind } from './errorPage';
import type { SidecarExit } from './sidecar';

// Vòng đời của app quanh sidecar — MỘT chỗ quyết định cái gì được hiện, khi nào. main.ts chỉ
// nối sự kiện Electron vào đây và thực thi các hiệu ứng (Deps). KHÔNG import electron để vitest
// kiểm được mọi đường đua: thoát giữa lúc khởi động, sidecar chết, cài cập nhật hỏng…
//
//   idle ──start──▶ starting ──READY──▶ running ──sidecar chết──▶ failed ──Thử lại──▶ starting
//                      └──── lỗi ────────────────────────────────────▲
//   (mọi pha trừ exiting/updating) ──before-quit──▶ quitting ──sidecar dừng──▶ exiting
//   idle/starting/running/failed ──prepareInstall──▶ updating ──before-quit-for-update──▶ exiting
//                                                       └── lỗi / quá hạn ──▶ idle ──▶ starting
//
// Luật duy nhất: chỉ pha `starting` (đúng lượt) mới được chuyển sang running/failed, chỉ pha
// `running` (đúng sidecar) mới báo "chết bất ngờ". Mọi kết quả đến muộn của lượt cũ — kể cả
// lỗi do chính ta dừng sidecar khi thoát hay cài cập nhật — rơi vào im lặng.

export type Phase = 'idle' | 'starting' | 'running' | 'failed' | 'updating' | 'quitting' | 'exiting';

export interface SidecarHandle {
  readonly running: boolean;
  stop(): Promise<void>;
  lastLines(n?: number): string[];
  on(event: 'exit', listener: (info: SidecarExit) => void): unknown;
}

export interface LifecycleDeps<S extends SidecarHandle> {
  createSidecar(): S;
  /** Khởi động tới READY, trả về URL gốc. `signal` hủy khi lượt này bị thay thế. */
  startSidecar(sidecar: S, signal: AbortSignal): Promise<string>;
  showLoading(): void;
  /** Tải studio; reject khi điều hướng hỏng (gồm cả ERR_ABORTED khi bị trang khác chen ngang). */
  showStudio(url: string): Promise<void>;
  showError(kind: ErrorKind, detail: string, logLines: string[]): void;
  /** Ẩn cửa sổ ngay khi bắt đầu thoát — người dùng không phải nhìn cửa sổ đứng hình chờ sidecar. */
  hideWindows(): void;
  /** app.quit() — gọi lại sau khi sidecar đã dừng. */
  quitApp(): void;
  log: { info(msg: string): void; warn(msg: string): void; error(msg: string): void };
  /** Chờ trình cài cập nhật tiếp quản tối đa bao lâu trước khi coi là hỏng. */
  installTimeoutMs?: number;
}

/** Lỗi loadURL khi điều hướng bị chen ngang (một loadURL khác, sidecar chết…). */
export function isAbortedLoad(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === 'ERR_ABORTED';
}

export class Lifecycle<S extends SidecarHandle> {
  private _phase: Phase = 'idle';
  private _origin: string | null = null;
  private sidecar: S | null = null;
  private gen = 0;
  private abort: AbortController | null = null;
  private installTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly installTimeoutMs: number;

  constructor(private readonly deps: LifecycleDeps<S>) {
    this.installTimeoutMs = deps.installTimeoutMs ?? 60_000;
  }

  get phase(): Phase {
    return this._phase;
  }

  /** Origin của studio khi đang chạy — window.ts chỉ cho điều hướng trong origin này. */
  get origin(): string | null {
    return this._origin;
  }

  /** Lần mở đầu và mỗi lần "Thử lại". Chỉ có tác dụng ở pha idle/failed. */
  async start(): Promise<void> {
    if (this._phase !== 'idle' && this._phase !== 'failed') return;
    const gen = this.supersede();
    const signal = this.abort!.signal;
    this._phase = 'starting';
    this.deps.showLoading();
    const current = () => gen === this.gen;

    let sc: S;
    try {
      await this.sidecar?.stop();
      if (!current()) return;
      sc = this.deps.createSidecar();
      this.sidecar = sc;
      sc.on('exit', (info) => this.onExit(sc, info));
      const url = await this.deps.startSidecar(sc, signal);
      if (!current()) return;
      this._origin = new URL(url).origin;
      this._phase = 'running';
      this.deps.log.info(`sidecar: sẵn sàng tại ${url}`);
    } catch (err) {
      if (current()) this.fail('start-failed', (err as Error).message);
      return;
    }

    try {
      await this.deps.showStudio(`${this._origin}/`);
    } catch (err) {
      if (!current() || this._phase !== 'running') return;
      // Sidecar vẫn sống mà tải bị hủy = có điều hướng khác chen ngang (vd. người dùng bấm tải
      // lại), không phải lỗi.
      if (isAbortedLoad(err) && sc.running) return;
      this.fail('start-failed', `Không tải được giao diện: ${(err as Error).message}`);
    }
  }

  /**
   * Gọi từ `before-quit`. Trả false thì main phải `event.preventDefault()`: ta dừng sidecar
   * (Go cần nhả khóa truyện) rồi tự gọi quitApp() lại.
   */
  onBeforeQuit(): boolean {
    switch (this._phase) {
      case 'exiting':
        return true;
      // Trình cập nhật đã dừng sidecar và đang quit: chặn ở đây là quitAndInstall đứng im.
      case 'updating':
        return true;
      case 'quitting':
        return false;
    }
    this.supersede();
    this._phase = 'quitting';
    this.deps.hideWindows();
    const sc = this.sidecar;
    if (!sc?.running) {
      this._phase = 'exiting';
      return true;
    }
    void sc
      .stop()
      .catch((err) => this.deps.log.error(`sidecar: dừng lỗi — ${(err as Error).message}`))
      .finally(() => {
        this._phase = 'exiting';
        this.deps.quitApp();
      });
    return false;
  }

  /**
   * Trước quitAndInstall: dừng sidecar. Trả false nếu app đang thoát thì đừng cài nữa (bản mới
   * vẫn được cài lúc thoát nhờ autoInstallOnAppQuit).
   */
  async prepareInstall(): Promise<boolean> {
    if (this._phase === 'updating' || this._phase === 'quitting' || this._phase === 'exiting') return false;
    this.supersede();
    this._phase = 'updating';
    try {
      await this.sidecar?.stop();
    } catch (err) {
      this.deps.log.error(`sidecar: dừng lỗi — ${(err as Error).message}`);
    }
    if (this._phase !== 'updating') return false;
    this.installTimer = setTimeout(() => this.installFailed('trình cài không tiếp quản kịp'), this.installTimeoutMs);
    return true;
  }

  /** `before-quit-for-update`: trình cài đã tiếp quản, app sắp thoát thật. */
  installProceeding(): void {
    this.clearInstallTimer();
    if (this._phase !== 'exiting') this.supersede();
    this._phase = 'exiting';
  }

  /** Lỗi của updater. Chỉ có nghĩa khi đang cài: khôi phục và mở lại sidecar. */
  installFailed(reason: string): void {
    if (this._phase !== 'updating') return;
    this.clearInstallTimer();
    this.deps.log.warn(`updater: cài không thành — ${reason}; mở lại sidecar`);
    this._phase = 'idle';
    void this.start();
  }

  private onExit(sc: S, info: SidecarExit) {
    if (sc !== this.sidecar || this._phase !== 'running') return;
    this.fail('crashed', `Mã thoát: ${info.code ?? '-'}${info.signal ? `, tín hiệu ${info.signal}` : ''}`);
  }

  private fail(kind: ErrorKind, detail: string) {
    this._phase = 'failed';
    this._origin = null;
    this.deps.log.error(`sidecar ${kind}: ${detail}`);
    this.deps.showError(kind, detail, this.sidecar?.lastLines(30) ?? []);
  }

  /** Mở lượt mới: mọi kết quả đến muộn của lượt cũ bị bỏ qua, lần thử lại cổng của nó bị hủy. */
  private supersede(): number {
    this.abort?.abort();
    this.abort = new AbortController();
    return ++this.gen;
  }

  private clearInstallTimer() {
    if (this.installTimer) clearTimeout(this.installTimer);
    this.installTimer = null;
  }
}
