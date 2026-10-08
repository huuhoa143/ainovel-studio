import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { armExitWatchdog, WATCHDOG_SCRIPT } from '../src/main/exitWatchdog';

const posix = process.platform !== 'win32';

let dir: string;
let victims: ChildProcess[] = [];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ainovel-watchdog-'));
});

afterEach(() => {
  for (const v of victims) v.kill('SIGKILL');
  victims = [];
  fs.rmSync(dir, { recursive: true, force: true });
});

function victim(): ChildProcess {
  const v = spawn('sleep', ['30'], { stdio: 'ignore' });
  victims.push(v);
  return v;
}

function exited(v: ChildProcess, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (v.exitCode !== null || v.signalCode !== null) return resolve(true);
    const t = setTimeout(() => resolve(false), ms);
    v.once('exit', () => {
      clearTimeout(t);
      resolve(true);
    });
  });
}

describe.runIf(posix)('armExitWatchdog', () => {
  it('tiến trình còn sống quá hạn → SIGKILL và ghi một dòng vào log', async () => {
    const v = victim();
    const log = path.join(dir, 'main log với dấu cách.log');
    expect(armExitWatchdog({ pid: v.pid!, platform: process.platform, logFile: log, delayMs: 300 })).toBe(true);
    expect(await exited(v, 5000)).toBe(true);
    expect(v.signalCode).toBe('SIGKILL');
    expect(fs.readFileSync(log, 'utf8')).toMatch(/tắt: Chromium chưa thoát sau 0\.3 giây kể từ will-quit — SIGKILL \d+/);
  });

  it('tiến trình đã tự thoát trước hạn → không làm gì', async () => {
    const v = victim();
    const log = path.join(dir, 'main.log');
    armExitWatchdog({ pid: v.pid!, platform: process.platform, logFile: log, delayMs: 300 });
    v.kill('SIGTERM');
    await exited(v, 2000);
    await new Promise((r) => setTimeout(r, 800));
    expect(fs.existsSync(log)).toBe(false);
  });

  it('PID đã bị tái dùng (lstart khác) → không giết', () => {
    // ps giả: lần gọi đầu trả một thời điểm khởi động, lần sau trả thời điểm khác.
    const bin = path.join(dir, 'bin');
    fs.mkdirSync(bin);
    const counter = path.join(dir, 'n');
    fs.writeFileSync(
      path.join(bin, 'ps'),
      `#!/bin/sh\nif [ -f "${counter}" ]; then echo "Thu Oct  8 01:00:00 2026"; else touch "${counter}"; echo "Thu Oct  8 00:00:00 2026"; fi\n`,
      { mode: 0o755 },
    );
    const v = victim();
    const log = path.join(dir, 'main.log');
    const r = spawnSync('/bin/sh', ['-c', WATCHDOG_SCRIPT, 'wd', String(v.pid), '0.1', log], {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    expect(r.status).toBe(0);
    expect(v.exitCode).toBeNull();
    expect(v.signalCode).toBeNull();
    expect(fs.existsSync(log)).toBe(false);
  });
});

describe('armExitWatchdog — Windows', () => {
  it('không đặt gì trên win32', () => {
    let spawned = false;
    const fake = (() => {
      spawned = true;
      throw new Error('không được gọi');
    }) as unknown as typeof spawn;
    expect(armExitWatchdog({ pid: 1, platform: 'win32', logFile: 'x', spawn: fake })).toBe(false);
    expect(spawned).toBe(false);
  });
});
