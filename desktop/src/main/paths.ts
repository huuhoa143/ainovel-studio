import path from 'node:path';

// Không import electron: main.ts đưa vào các giá trị lấy từ `app`/`process`, nhờ vậy
// vitest kiểm được mà không cần chạy Electron.

export interface SidecarPathInput {
  isPackaged: boolean;
  /** process.resourcesPath — chỉ có nghĩa ở bản đóng gói. */
  resourcesPath: string;
  /** Thư mục gốc repo (dev): cha của `desktop/`. */
  repoRoot: string;
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
}

export interface SidecarPaths {
  bin: string;
  web: string;
}

export function binaryName(platform: NodeJS.Platform): string {
  return platform === 'win32' ? 'ainovel-cli.exe' : 'ainovel-cli';
}

/**
 * Nhị phân Go và thư mục web tĩnh.
 * Bản đóng gói: `<Resources>/bin/ainovel-cli[.exe]` và `<Resources>/web` (extraResource).
 * Dev: AINOVEL_BIN / AINOVEL_WEB nếu có, không thì `<repo>/ainovel-cli` và `<repo>/web/out`.
 */
export function resolveSidecarPaths(input: SidecarPathInput): SidecarPaths {
  const name = binaryName(input.platform);
  if (input.isPackaged) {
    return {
      bin: path.join(input.resourcesPath, 'bin', name),
      web: path.join(input.resourcesPath, 'web'),
    };
  }
  return {
    bin: input.env.AINOVEL_BIN || path.join(input.repoRoot, name),
    web: input.env.AINOVEL_WEB || path.join(input.repoRoot, 'web', 'out'),
  };
}

export interface DataPaths {
  /** cwd của sidecar. */
  userData: string;
  books: string;
  logs: string;
  sidecarLog: string;
  mainLog: string;
  windowState: string;
  /** Cổng tốt gần nhất của sidecar — giữ origin (và localStorage của web) ổn định. */
  sidecarPort: string;
}

export function resolveDataPaths(userData: string): DataPaths {
  const logs = path.join(userData, 'logs');
  return {
    userData,
    books: path.join(userData, 'books'),
    logs,
    sidecarLog: path.join(logs, 'sidecar.log'),
    mainLog: path.join(logs, 'main.log'),
    windowState: path.join(userData, 'window-state.json'),
    sidecarPort: path.join(userData, 'sidecar-port'),
  };
}
