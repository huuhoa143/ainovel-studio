import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Sidecar } from '../src/main/sidecar';
import { isListenError, readSavedPort, savePort, startOnStablePort } from '../src/main/stablePort';

const FAKE = path.join(__dirname, 'fixtures', 'fake-sidecar.mjs');

let dir: string;
let portFile: string;
let live: Sidecar[] = [];
let blockers: net.Server[] = [];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ainovel-port-'));
  portFile = path.join(dir, 'sidecar-port');
});

afterEach(async () => {
  await Promise.all(live.map((s) => s.stop()));
  await Promise.all(blockers.map((b) => new Promise((r) => b.close(r))));
  live = [];
  blockers = [];
  fs.rmSync(dir, { recursive: true, force: true });
});

function make(mode = 'ready') {
  const sc = new Sidecar({
    bin: process.execPath,
    binArgsPrefix: [FAKE],
    booksDir: path.join(dir, 'books'),
    webDir: path.join(dir, 'web'),
    cwd: dir,
    logFile: path.join(dir, 'logs', 'sidecar.log'),
    env: { ...process.env, FAKE_MODE: mode },
  });
  live.push(sc);
  return sc;
}

/** Chiếm một cổng trống trên loopback và trả về số cổng. */
function occupyPort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    blockers.push(srv);
    srv.listen(0, '127.0.0.1', () => resolve((srv.address() as net.AddressInfo).port));
  });
}

async function freePort(): Promise<number> {
  const port = await occupyPort();
  const srv = blockers.pop()!;
  await new Promise((r) => srv.close(r));
  return port;
}

const portOf = (url: string) => Number(new URL(url).port);

describe('readSavedPort / savePort', () => {
  it('không có tệp hoặc nội dung rác → 0', () => {
    expect(readSavedPort(portFile)).toBe(0);
    for (const junk of ['', 'abc', '-1', '70000', '12.5']) {
      fs.writeFileSync(portFile, junk);
      expect(readSavedPort(portFile)).toBe(0);
    }
  });

  it('ghi rồi đọc lại', () => {
    savePort(portFile, 48123);
    expect(readSavedPort(portFile)).toBe(48123);
  });
});

describe('isListenError', () => {
  it('nhận lỗi bind của Go trên mac/linux và Windows', () => {
    expect(isListenError(['[err] serve: listen tcp 127.0.0.1:48123: bind: address already in use'])).toBe(true);
    expect(
      isListenError([
        '[err] serve: listen tcp 127.0.0.1:48123: bind: Only one usage of each socket address (protocol/network address/port) is normally permitted.',
      ]),
    ).toBe(true);
    expect(isListenError(['[err] serve: mkdir /books: permission denied'])).toBe(false);
  });
});

describe('startOnStablePort', () => {
  it('lần đầu: để hệ điều hành chọn rồi nhớ cổng', async () => {
    const url = await startOnStablePort(make(), portFile);
    expect(portOf(url)).toBeGreaterThan(0);
    expect(readSavedPort(portFile)).toBe(portOf(url));
  });

  it('dùng lại cổng đã nhớ — origin giữ nguyên qua các lần khởi động', async () => {
    const port = await freePort();
    savePort(portFile, port);
    const sc = make();
    const a = await startOnStablePort(sc, portFile);
    expect(portOf(a)).toBe(port);
    await sc.stop();
    const b = await startOnStablePort(sc, portFile);
    expect(b).toBe(a);
    expect(readSavedPort(portFile)).toBe(port);
  });

  it('cổng đã nhớ bị chiếm → lùi về :0 và nhớ cổng mới', async () => {
    const busy = await occupyPort();
    savePort(portFile, busy);
    const sc = make();
    const url = await startOnStablePort(sc, portFile);
    expect(portOf(url)).not.toBe(busy);
    expect(portOf(url)).toBeGreaterThan(0);
    expect(readSavedPort(portFile)).toBe(portOf(url));
    expect((await fetch(url)).status).toBe(200);
  });

  it('lỗi không phải bind → không thử lại, ném lỗi và giữ nguyên cổng đã nhớ', async () => {
    savePort(portFile, 48123);
    await expect(startOnStablePort(make('exit-early-other'), portFile)).rejects.toThrow(/thoát trước khi sẵn sàng/);
    expect(readSavedPort(portFile)).toBe(48123);
  });
});
