import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAbortedLoad, Lifecycle, type LifecycleDeps, type SidecarHandle } from '../src/main/lifecycle';
import type { SidecarExit } from '../src/main/sidecar';

// Sidecar giả điều khiển bằng tay: test quyết định khi nào READY, khi nào chết, stop() xong lúc nào.
class FakeSidecar extends EventEmitter implements SidecarHandle {
  running = false;
  stopCalls = 0;
  private readyFns: { resolve: (url: string) => void; reject: (e: Error) => void } | null = null;
  private stopResolve: (() => void) | null = null;
  holdStop = false;
  signal: AbortSignal | null = null;

  begin(signal: AbortSignal): Promise<string> {
    this.running = true;
    this.signal = signal;
    return new Promise((resolve, reject) => {
      this.readyFns = { resolve, reject };
    });
  }

  ready(url = 'http://127.0.0.1:48123') {
    this.readyFns!.resolve(url);
  }
  failStart(msg: string) {
    this.running = false;
    this.readyFns!.reject(new Error(msg));
  }
  crash(code = 2) {
    this.running = false;
    this.emit('exit', { code, signal: null } satisfies SidecarExit);
  }
  stop(): Promise<void> {
    this.stopCalls++;
    if (!this.running) return Promise.resolve();
    // Như Sidecar thật: dừng giữa lúc khởi động thì start() reject.
    this.readyFns?.reject(new Error('sidecar thoát trước khi sẵn sàng (code=0)'));
    if (this.holdStop) {
      return new Promise((r) => {
        this.stopResolve = () => {
          this.running = false;
          r();
        };
      });
    }
    this.running = false;
    return Promise.resolve();
  }
  finishStop() {
    this.stopResolve?.();
  }
  lastLines(): string[] {
    return ['dòng log cuối'];
  }
}

function setup(over: Partial<LifecycleDeps<FakeSidecar>> = {}) {
  const sidecars: FakeSidecar[] = [];
  const calls: string[] = [];
  let studioLoad: { resolve: () => void; reject: (e: Error) => void } | null = null;
  const deps: LifecycleDeps<FakeSidecar> = {
    createSidecar: () => {
      const sc = new FakeSidecar();
      sidecars.push(sc);
      return sc;
    },
    startSidecar: (sc, signal) => sc.begin(signal),
    showLoading: () => calls.push('loading'),
    showStudio: (url) => {
      calls.push(`studio ${url}`);
      return new Promise((resolve, reject) => {
        studioLoad = { resolve, reject };
      });
    },
    showError: (kind, detail) => calls.push(`error ${kind}: ${detail}`),
    hideWindows: () => calls.push('hide'),
    quitApp: () => calls.push('quit'),
    log: { info: () => {}, warn: () => {}, error: () => {} },
    ...over,
  };
  const lc = new Lifecycle(deps);
  return {
    lc,
    calls,
    sidecars,
    last: () => sidecars.at(-1)!,
    studio: () => studioLoad!,
    errors: () => calls.filter((c) => c.startsWith('error')),
  };
}

const tick = () => new Promise((r) => setImmediate(r));

function abortErr(): Error {
  return Object.assign(new Error('ERR_ABORTED (-3) loading http://127.0.0.1:48123/'), { code: 'ERR_ABORTED', errno: -3 });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Lifecycle — khởi động', () => {
  it('hiện trang khởi động ngay, rồi studio khi READY', async () => {
    const t = setup();
    const p = t.lc.start();
    expect(t.calls).toEqual(['loading']);
    expect(t.lc.phase).toBe('starting');
    await tick();
    t.last().ready();
    await tick();
    expect(t.lc.phase).toBe('running');
    expect(t.lc.origin).toBe('http://127.0.0.1:48123');
    expect(t.calls).toEqual(['loading', 'studio http://127.0.0.1:48123/']);
    t.studio().resolve();
    await p;
    expect(t.errors()).toEqual([]);
  });

  it('không lên được → trang lỗi start-failed kèm log', async () => {
    const t = setup();
    const p = t.lc.start();
    await tick();
    t.last().failStart('sidecar không sẵn sàng sau 20 giây');
    await p;
    expect(t.lc.phase).toBe('failed');
    expect(t.errors()).toEqual(['error start-failed: sidecar không sẵn sàng sau 20 giây']);
  });

  it('start() gọi lặp khi đang khởi động thì bỏ qua', async () => {
    const t = setup();
    void t.lc.start();
    void t.lc.start();
    await tick();
    expect(t.sidecars).toHaveLength(1);
  });
});

describe('Lifecycle — thoát', () => {
  it('thoát giữa lúc khởi động: ẩn cửa sổ, không trang lỗi, không cửa sổ mới, quit sau khi sidecar dừng', async () => {
    const t = setup();
    const p = t.lc.start();
    await tick();
    const sc = t.last();
    sc.holdStop = true;
    expect(t.lc.onBeforeQuit()).toBe(false);
    expect(t.lc.phase).toBe('quitting');
    expect(t.calls).toContain('hide');
    await p; // start() đã reject bên trong vì stop — phải im lặng
    // Cmd+Q lần nữa trong lúc chờ: vẫn chặn, không dừng lần hai.
    expect(t.lc.onBeforeQuit()).toBe(false);
    sc.finishStop();
    await tick();
    expect(t.calls.at(-1)).toBe('quit');
    expect(t.lc.phase).toBe('exiting');
    expect(t.lc.onBeforeQuit()).toBe(true);
    expect(t.errors()).toEqual([]);
    expect(t.calls.filter((c) => c === 'loading')).toHaveLength(1);
  });

  it('thoát giữa lúc khởi động hủy signal — startOnStablePort không thử cổng khác', async () => {
    const t = setup();
    void t.lc.start();
    await tick();
    const signal = t.last().signal!;
    expect(signal.aborted).toBe(false);
    t.lc.onBeforeQuit();
    expect(signal.aborted).toBe(true);
  });

  it('thoát khi đang chạy: dừng sidecar rồi quit, sự kiện exit lúc đó không thành trang lỗi', async () => {
    const t = setup();
    void t.lc.start();
    await tick();
    t.last().ready();
    await tick();
    const sc = t.last();
    sc.holdStop = true;
    expect(t.lc.onBeforeQuit()).toBe(false);
    sc.crash(0);
    sc.finishStop();
    await tick();
    expect(t.errors()).toEqual([]);
    expect(t.calls.at(-1)).toBe('quit');
  });

  it('thoát khi chưa có sidecar → cho quit luôn', () => {
    const t = setup();
    expect(t.lc.onBeforeQuit()).toBe(true);
    expect(t.lc.phase).toBe('exiting');
  });

  it('Thử lại sau khi đã bắt đầu thoát thì bỏ qua', async () => {
    const t = setup();
    void t.lc.start();
    await tick();
    t.last().failStart('x');
    await tick();
    t.lc.onBeforeQuit();
    await t.lc.start();
    expect(t.sidecars).toHaveLength(1);
  });
});

describe('Lifecycle — sidecar chết và thử lại', () => {
  it('chết sau READY → trang lỗi crashed; Thử lại mở sidecar mới', async () => {
    const t = setup();
    void t.lc.start();
    await tick();
    t.last().ready();
    await tick();
    t.studio().resolve();
    t.last().crash(2);
    expect(t.lc.phase).toBe('failed');
    expect(t.lc.origin).toBeNull();
    expect(t.errors()).toEqual(['error crashed: Mã thoát: 2']);

    void t.lc.start();
    expect(t.calls.at(-1)).toBe('loading');
    await tick();
    expect(t.sidecars).toHaveLength(2);
    t.last().ready('http://127.0.0.1:48124');
    await tick();
    expect(t.lc.phase).toBe('running');
    expect(t.calls.at(-1)).toBe('studio http://127.0.0.1:48124/');
  });

  it('sidecar cũ chết sau khi đã có sidecar mới thì bỏ qua', async () => {
    const t = setup();
    void t.lc.start();
    await tick();
    const old = t.last();
    old.failStart('x');
    await tick();
    void t.lc.start();
    await tick();
    old.emit('exit', { code: 1, signal: null });
    expect(t.errors()).toHaveLength(1);
  });

  it('chết đúng lúc đang tải studio: một trang lỗi crashed, không thêm "start-failed: ERR_ABORTED"', async () => {
    const t = setup();
    const p = t.lc.start();
    await tick();
    t.last().ready();
    await tick();
    t.last().crash(2);
    t.studio().reject(abortErr());
    await p;
    expect(t.errors()).toEqual(['error crashed: Mã thoát: 2']);
  });

  it('tải studio bị hủy (ERR_ABORTED) khi sidecar vẫn sống → không phải lỗi', async () => {
    const t = setup();
    const p = t.lc.start();
    await tick();
    t.last().ready();
    await tick();
    t.studio().reject(abortErr());
    await p;
    expect(t.lc.phase).toBe('running');
    expect(t.errors()).toEqual([]);
  });

  it('tải studio hỏng thật (không phải ERR_ABORTED) → trang lỗi', async () => {
    const t = setup();
    const p = t.lc.start();
    await tick();
    t.last().ready();
    await tick();
    t.studio().reject(Object.assign(new Error('ERR_CONNECTION_REFUSED'), { code: 'ERR_CONNECTION_REFUSED' }));
    await p;
    expect(t.lc.phase).toBe('failed');
    expect(t.errors()).toHaveLength(1);
  });

  it('isAbortedLoad', () => {
    expect(isAbortedLoad(abortErr())).toBe(true);
    expect(isAbortedLoad(new Error('x'))).toBe(false);
    expect(isAbortedLoad(null)).toBe(false);
  });
});

describe('Lifecycle — cài cập nhật', () => {
  async function running() {
    const t = setup({ installTimeoutMs: 1000 });
    void t.lc.start();
    await tick();
    t.last().ready();
    await tick();
    t.studio().resolve();
    return t;
  }

  it('cài thành công: dừng sidecar, không trang lỗi, before-quit không bị chặn', async () => {
    const t = await running();
    expect(await t.lc.prepareInstall()).toBe(true);
    expect(t.last().running).toBe(false);
    expect(t.lc.phase).toBe('updating');
    // quitAndInstall gọi app.quit(): chặn ở đây là kẹt cài đặt.
    expect(t.lc.onBeforeQuit()).toBe(true);
    t.lc.installProceeding();
    expect(t.lc.phase).toBe('exiting');
    t.lc.installFailed('lỗi đến muộn');
    expect(t.lc.phase).toBe('exiting');
    expect(t.errors()).toEqual([]);
    expect(t.sidecars).toHaveLength(1);
  });

  it('cài hỏng (updater báo lỗi) → mở lại sidecar', async () => {
    const t = await running();
    await t.lc.prepareInstall();
    t.lc.installFailed('spawn EACCES');
    expect(t.lc.phase).toBe('starting');
    await tick();
    expect(t.sidecars).toHaveLength(2);
    t.last().ready();
    await tick();
    expect(t.lc.phase).toBe('running');
    expect(t.errors()).toEqual([]);
  });

  it('trình cài không tiếp quản trong hạn → mở lại sidecar', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const t = await running();
    await t.lc.prepareInstall();
    vi.advanceTimersByTime(999);
    expect(t.lc.phase).toBe('updating');
    vi.advanceTimersByTime(1);
    expect(t.lc.phase).toBe('starting');
    await tick();
    expect(t.sidecars).toHaveLength(2);
  });

  it('cài giữa lúc đang khởi động: lỗi khởi động do bị dừng thì im lặng', async () => {
    const t = setup();
    const p = t.lc.start();
    await tick();
    expect(await t.lc.prepareInstall()).toBe(true);
    await p;
    expect(t.errors()).toEqual([]);
    expect(t.lc.phase).toBe('updating');
  });

  it('đang thoát thì không cài', async () => {
    const t = await running();
    t.last().holdStop = true;
    t.lc.onBeforeQuit();
    expect(await t.lc.prepareInstall()).toBe(false);
  });

  it('lỗi updater khi không cài thì không làm gì', async () => {
    const t = await running();
    t.lc.installFailed('mạng');
    expect(t.lc.phase).toBe('running');
    expect(t.sidecars).toHaveLength(1);
  });
});
