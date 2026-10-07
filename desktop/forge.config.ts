import path from 'node:path';
import { open, readFile, readdir, writeFile } from 'node:fs/promises';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

// Một nguồn duy nhất cho kênh cập nhật: maker NSIS (Windows) và `app-update.yml` ghi vào
// .app (macOS) cùng đọc từ đây nên không thể lệch nhau.
const UPDATER = {
  provider: 'github' as const,
  owner: 'huuhoa143',
  repo: 'ainovel-studio',
  // Tên thư mục cache của electron-updater (~/Library/Caches/<tên>). Giữ cố định qua các bản.
  updaterCacheDirName: 'ainovel-studio-updater',
};

// YAML viết tay để hook không cần thêm dependency. Các khóa bắt buộc đứng đầu.
const APP_UPDATE_YML = [
  `provider: ${UPDATER.provider}`,
  `owner: ${UPDATER.owner}`,
  `repo: ${UPDATER.repo}`,
  `updaterCacheDirName: ${UPDATER.updaterCacheDirName}`,
  '',
].join('\n');

const APP_UPDATE_REQUIRED_KEYS = ['provider:', 'owner:', 'repo:', 'updaterCacheDirName:'] as const;

// resources/bin là thư mục dùng chung giữa các lần build mọi nền tảng/kiến trúc: còn sót
// ainovel-cli.exe từ lần build Windows là nó vào thẳng gói mac (đã xảy ra). Nên trước khi
// đóng gói, đòi bin/ chứa ĐÚNG MỘT tệp, đúng tên và đúng kiến trúc của gói. Đọc header
// Mach-O/PE thay vì gọi `file` để chạy được trên mọi máy build.
const MACHO_CPU: Record<string, number> = { arm64: 0x0100000c, x64: 0x01000007 };
const PE_MACHINE: Record<string, number> = { x64: 0x8664, arm64: 0xaa64 };

async function checkSidecarBin(platform: string, arch: string): Promise<void> {
  const dir = path.resolve(__dirname, 'resources', 'bin');
  const want = platform === 'win32' ? 'ainovel-cli.exe' : 'ainovel-cli';
  const hint = `Chạy scripts/build-sidecar.sh ${platform === 'win32' ? 'windows' : platform} ${arch === 'x64' ? 'amd64' : arch} <version> trước khi đóng gói.`;
  const files = await readdir(dir).catch(() => [] as string[]);
  if (files.length !== 1 || files[0] !== want) {
    throw new Error(`resources/bin phải chỉ có ${want} cho ${platform}/${arch}, đang có: [${files.join(', ')}]. ${hint}`);
  }
  const fh = await open(path.join(dir, want), 'r');
  try {
    const buf = Buffer.alloc(4096);
    await fh.read(buf, 0, buf.length, 0);
    let ok = false;
    if (platform === 'darwin') {
      // MH_MAGIC_64 (little-endian 0xfeedfacf), cputype ngay sau.
      ok = buf.readUInt32LE(0) === 0xfeedfacf && buf.readUInt32LE(4) === MACHO_CPU[arch];
    } else if (platform === 'win32') {
      const pe = buf.readUInt32LE(0x3c);
      ok = buf.toString('latin1', 0, 2) === 'MZ' && pe + 6 <= buf.length &&
        buf.readUInt32LE(pe) === 0x00004550 && buf.readUInt16LE(pe + 4) === PE_MACHINE[arch];
    }
    if (!ok) throw new Error(`resources/bin/${want} không phải nhị phân ${platform}/${arch}. ${hint}`);
  } finally {
    await fh.close();
  }
}

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    appBundleId: 'com.huuhoa143.ainovelstudio',
    icon: 'build/icon',
    // Sidecar Go và web tĩnh nằm NGOÀI asar để spawn() được và để Go đọc thẳng từ đĩa.
    // Chúng rơi vào <Resources>/bin và <Resources>/web (paths.ts đọc qua process.resourcesPath).
    // scripts/build-sidecar.sh điền hai thư mục này trước khi package.
    extraResource: ['resources/bin', 'resources/web'],
  },
  rebuildConfig: {},
  hooks: {
    prePackage: async (_forgeConfig, platform, arch) => {
      await checkSidecarBin(platform, arch);
    },
    // packageAfterCopy chạy TRƯỚC khi chép extraResource, nhưng thư mục Resources đã có,
    // nên ghi app-update.yml ở đây được. Chỉ cần cho macOS — NSIS maker tự sinh bản Windows.
    packageAfterCopy: async (_forgeConfig, buildPath) => {
      const resourcesDir = path.resolve(buildPath, '..');
      const ymlPath = path.join(resourcesDir, 'app-update.yml');
      await writeFile(ymlPath, APP_UPDATE_YML, 'utf8');
      const written = await readFile(ymlPath, 'utf8');
      for (const key of APP_UPDATE_REQUIRED_KEYS) {
        if (!written.includes(key)) {
          throw new Error(`app-update.yml thiếu trường bắt buộc "${key.slice(0, -1)}" tại ${ymlPath}`);
        }
      }
    },
  },
  makers: [
    // Windows: NSIS (bọc target NSIS của electron-builder). Squirrel.Windows không được
    // electron-updater hỗ trợ. Chưa ký Authenticode — người dùng gặp SmartScreen một lần.
    {
      name: '@electron-addons/electron-forge-maker-nsis',
      config: {
        // `updater` làm maker sinh latest.yml cạnh bộ cài và app-update.yml provider github
        // bên trong app (vì URL là endpoint release của github.com).
        updater: {
          url: `https://github.com/${UPDATER.owner}/${UPDATER.repo}/releases/latest/download`,
          updaterCacheDirName: UPDATER.updaterCacheDirName,
          channel: 'latest',
        },
      },
      platforms: ['win32'],
    },
    new MakerZIP({}, ['darwin']),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
      ],
      // Không có renderer riêng: cửa sổ tải giao diện do sidecar phục vụ.
      renderer: [],
    }),
    // Fuses bật/tắt tính năng Electron lúc đóng gói, trước khi ký.
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
