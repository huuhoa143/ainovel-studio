import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { binaryName, resolveDataPaths, resolveSidecarPaths } from '../src/main/paths';

const base = { resourcesPath: '/App/Contents/Resources', repoRoot: '/repo', env: {} };

describe('resolveSidecarPaths', () => {
  it('bản đóng gói macOS đọc từ Resources', () => {
    expect(resolveSidecarPaths({ ...base, isPackaged: true, platform: 'darwin' })).toEqual({
      bin: path.join('/App/Contents/Resources', 'bin', 'ainovel-cli'),
      web: path.join('/App/Contents/Resources', 'web'),
    });
  });

  it('bản đóng gói Windows có đuôi .exe', () => {
    const p = resolveSidecarPaths({ ...base, isPackaged: true, platform: 'win32' });
    expect(p.bin).toBe(path.join('/App/Contents/Resources', 'bin', 'ainovel-cli.exe'));
  });

  it('bản đóng gói bỏ qua AINOVEL_BIN/AINOVEL_WEB', () => {
    const p = resolveSidecarPaths({
      ...base,
      isPackaged: true,
      platform: 'darwin',
      env: { AINOVEL_BIN: '/x/bin', AINOVEL_WEB: '/x/web' },
    });
    expect(p.bin).toBe(path.join('/App/Contents/Resources', 'bin', 'ainovel-cli'));
  });

  it('dev mặc định trỏ vào repo', () => {
    expect(resolveSidecarPaths({ ...base, isPackaged: false, platform: 'darwin' })).toEqual({
      bin: path.join('/repo', 'ainovel-cli'),
      web: path.join('/repo', 'web', 'out'),
    });
  });

  it('dev ưu tiên biến môi trường', () => {
    expect(
      resolveSidecarPaths({
        ...base,
        isPackaged: false,
        platform: 'darwin',
        env: { AINOVEL_BIN: '/x/bin', AINOVEL_WEB: '/x/web' },
      }),
    ).toEqual({ bin: '/x/bin', web: '/x/web' });
  });

  it('dev: biến môi trường rỗng coi như không có', () => {
    const p = resolveSidecarPaths({ ...base, isPackaged: false, platform: 'win32', env: { AINOVEL_BIN: '' } });
    expect(p.bin).toBe(path.join('/repo', 'ainovel-cli.exe'));
  });
});

describe('binaryName', () => {
  it('theo nền tảng', () => {
    expect(binaryName('darwin')).toBe('ainovel-cli');
    expect(binaryName('win32')).toBe('ainovel-cli.exe');
  });
});

describe('resolveDataPaths', () => {
  it('mọi thứ nằm dưới userData', () => {
    const u = '/Users/a/Library/Application Support/AINovel Studio';
    expect(resolveDataPaths(u)).toEqual({
      userData: u,
      books: path.join(u, 'books'),
      config: path.join(u, 'config.json'),
      importStaging: path.join(u, '.import-staging'),
      logs: path.join(u, 'logs'),
      sidecarLog: path.join(u, 'logs', 'sidecar.log'),
      mainLog: path.join(u, 'logs', 'main.log'),
      windowState: path.join(u, 'window-state.json'),
      sidecarPort: path.join(u, 'sidecar-port'),
    });
  });
});
