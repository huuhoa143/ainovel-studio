import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sidecar, sidecarArgs, type SidecarExit, type SidecarOptions } from '../src/main/sidecar';

const FAKE = path.join(__dirname, 'fixtures', 'fake-sidecar.mjs');

let dir: string;
let live: Sidecar[] = [];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ainovel-sidecar-'));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(live.map((s) => s.stop()));
  live = [];
  fs.rmSync(dir, { recursive: true, force: true });
});

function make(mode: string, extra: Partial<SidecarOptions> = {}, env: Record<string, string> = {}) {
  const sc = new Sidecar({
    bin: process.execPath,
    binArgsPrefix: [FAKE],
    booksDir: path.join(dir, 'books'),
    webDir: path.join(dir, 'web'),
    configFile: path.join(dir, 'config.json'),
    cwd: dir,
    logFile: path.join(dir, 'logs', 'sidecar.log'),
    env: { ...process.env, FAKE_MODE: mode, ...env },
    ...extra,
  });
  live.push(sc);
  return sc;
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe('sidecarArgs', () => {
  it('đúng hợp đồng', () => {
    expect(sidecarArgs({ booksDir: '/b', webDir: '/w', configFile: '/u/config.json' })).toEqual([
      'serve', '--addr', '127.0.0.1:0', '--root', '/b', '--web', '/w', '--config', '/u/config.json',
      '--exit-on-stdin-close',
    ]);
    expect(sidecarArgs({ booksDir: '/b', webDir: '/w', configFile: '/u/config.json' }, 8421)[2]).toBe(
      '127.0.0.1:8421',
    );
  });
});

describe('Sidecar', () => {
  it('parse AINOVEL_READY với cổng thật và phục vụ được', async () => {
    const sc = make('ready');
    const url = await sc.start();
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(Number(new URL(url).port)).toBeGreaterThan(0);
    expect(sc.url).toBe(url);
    const res = await fetch(`${url}/api/workshop`);
    expect(res.status).toBe(200);
    // Đối số truyền đúng hợp đồng.
    expect(sc.lastLines().join('\n')).toContain(
      `fake argv: serve --addr 127.0.0.1:0 --root ${path.join(dir, 'books')} --web ${path.join(dir, 'web')} --config ${path.join(dir, 'config.json')} --exit-on-stdin-close`,
    );
  });

  it('chết sau khi ready → phát sự kiện exit', async () => {
    const sc = make('crash-after-ready');
    await sc.start();
    const info = await new Promise<SidecarExit>((resolve) => sc.once('exit', resolve));
    expect(info.code).toBe(3);
    expect(sc.running).toBe(false);
    expect(sc.lastLines().join('\n')).toContain('[err] fake: panic giả');
  });

  it('không bao giờ ready → reject do timeout và tiến trình bị dừng', async () => {
    const sc = make('never-ready', { readyTimeoutMs: 500 });
    let exitEvents = 0;
    sc.on('exit', () => exitEvents++);
    await expect(sc.start()).rejects.toThrow(/không sẵn sàng/);
    await waitFor(() => !sc.running);
    expect(exitEvents).toBe(0);
  });

  it('thoát trước khi ready → reject kèm mã thoát, không phát exit', async () => {
    const sc = make('exit-early');
    let exitEvents = 0;
    sc.on('exit', () => exitEvents++);
    await expect(sc.start()).rejects.toThrow(/thoát trước khi sẵn sàng \(code=1/);
    expect(sc.lastLines().join('\n')).toContain('address already in use');
    expect(exitEvents).toBe(0);
  });

  it('nhị phân không tồn tại → reject', async () => {
    const sc = make('ready', { bin: path.join(dir, 'khong-co'), binArgsPrefix: [] });
    await expect(sc.start()).rejects.toThrow(/ENOENT/);
    expect(sc.running).toBe(false);
  });

  it('spawn() ném đồng bộ → reject đúng lỗi đó (không phải ReferenceError), khởi động lại được', async () => {
    const sc = make('ready', { bin: 'khong\0hop-le', binArgsPrefix: [] });
    const err = await sc.start().catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(ReferenceError);
    expect((err as Error).message).toMatch(/null bytes|ERR_INVALID_ARG/i);
    expect(sc.running).toBe(false);
    expect(sc.lastLines().join('\n')).toContain('không spawn được');
  });

  it("'error' phát hai lần trên tiến trình con không làm sập main", async () => {
    const sc = make('ready');
    await sc.start();
    const child = (sc as unknown as { child: EventEmitterLike }).child;
    expect(() => {
      child.emit('error', new Error('lỗi một'));
      child.emit('error', new Error('lỗi hai'));
    }).not.toThrow();
    expect(sc.lastLines().join('\n')).toContain('lỗi hai');
  });

  it('stop() đóng stdin và sidecar tắt êm, không phát exit', async () => {
    const sc = make('ready');
    let exitEvents = 0;
    sc.on('exit', () => exitEvents++);
    await sc.start();
    await sc.stop();
    expect(sc.running).toBe(false);
    expect(exitEvents).toBe(0);
    const log = fs.readFileSync(path.join(dir, 'logs', 'sidecar.log'), 'utf8');
    expect(log).toContain('fake: stdin đóng, tắt êm');
    // Tự thoát vì stdin đóng, không phải bị kill khi hết hạn chờ.
    expect(log).not.toContain('kill()');
  });

  it('stop() kill khi sidecar phớt lờ stdin', async () => {
    const sc = make('ignore-stdin', { stopTimeoutMs: 300 });
    await sc.start();
    const pid = (sc as unknown as { child: { pid: number } }).child.pid;
    await sc.stop();
    expect(sc.running).toBe(false);
    expect(pidAlive(pid)).toBe(false);
    const log = fs.readFileSync(path.join(dir, 'logs', 'sidecar.log'), 'utf8');
    expect(log).toContain('kill()');
    expect(log).toContain('fake: nhận SIGTERM');
  });

  it('khởi động lại được sau khi đã dừng', async () => {
    const sc = make('ready');
    await sc.start();
    await sc.stop();
    const b = await sc.start();
    expect(b).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect((await fetch(b)).status).toBe(200);
  });

  it('vòng đệm giữ đúng N dòng cuối; log ghi ra tệp', async () => {
    const sc = make('chatty', { ringSize: 50 }, { FAKE_LINES: '300' });
    await sc.start();
    const lines = sc.lastLines();
    expect(lines).toHaveLength(50);
    expect(lines.at(-1)).toMatch(/^AINOVEL_READY /);
    expect(lines.some((l) => l.startsWith('dòng 299 '))).toBe(true);
    expect(lines.some((l) => l.startsWith('dòng 0 '))).toBe(false);
    expect(sc.lastLines(30)).toHaveLength(30);
    const log = fs.readFileSync(path.join(dir, 'logs', 'sidecar.log'), 'utf8');
    expect(log).toContain('[out] dòng 0 ');
    expect(log).toContain('[out] AINOVEL_READY http://127.0.0.1:');
  });

  it('cắt log khi vượt ngưỡng', async () => {
    const logFile = path.join(dir, 'logs', 'sidecar.log');
    const sc = make('chatty', { maxLogBytes: 10_000 }, { FAKE_LINES: '400' });
    await sc.start();
    await sc.stop();
    expect(fs.existsSync(`${logFile}.1`)).toBe(true);
    expect(fs.statSync(logFile).size).toBeLessThanOrEqual(10_000);
    expect(fs.statSync(`${logFile}.1`).size).toBeLessThanOrEqual(10_000);
  });

  it('không đổi tên được log khi cắt (Windows: EPERM do diệt virus giữ tệp) → cắt ngắn tại chỗ, vẫn ghi tiếp', async () => {
    const logFile = path.join(dir, 'logs', 'sidecar.log');
    const rename = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw Object.assign(new Error('EPERM: operation not permitted, rename'), { code: 'EPERM' });
    });
    const sc = make('chatty', { maxLogBytes: 10_000 }, { FAKE_LINES: '400' });
    await sc.start();
    await sc.stop();
    expect(rename).toHaveBeenCalled();
    // ~40KB log qua ngưỡng 10KB: mỗi lần cắt thử rename đúng một lần, không thử lại mỗi dòng.
    expect(rename.mock.calls.length).toBeLessThan(10);
    expect(fs.existsSync(`${logFile}.1`)).toBe(false);
    const log = fs.readFileSync(logFile, 'utf8');
    expect(log.length).toBeLessThanOrEqual(10_000);
    // Vẫn ghi được tới tận dòng cuối cùng (không ghi vào fd đã đóng).
    expect(log).toContain('tiến trình thoát');
  });

  it('log cũ đã quá ngưỡng thì cắt ngay lúc khởi động', async () => {
    const logFile = path.join(dir, 'logs', 'sidecar.log');
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.writeFileSync(logFile, 'x'.repeat(20_000));
    const sc = make('ready', { maxLogBytes: 10_000 });
    await sc.start();
    await sc.stop();
    expect(fs.statSync(`${logFile}.1`).size).toBe(20_000);
    expect(fs.readFileSync(logFile, 'utf8')).toContain('AINOVEL_READY');
  });
});

interface EventEmitterLike {
  emit(event: string, ...args: unknown[]): boolean;
}

async function waitFor(cond: () => boolean, ms = 5000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('waitFor: hết giờ');
    await new Promise((r) => setTimeout(r, 20));
  }
}
