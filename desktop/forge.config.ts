import path from 'node:path';
import { mkdir, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import type { ForgeConfig } from '@electron-forge/shared-types';
import type { MakerOptions } from '@electron-forge/maker-base';
import { MakerZIP } from '@electron-forge/maker-zip';
import MakerNSIS from '@electron-addons/electron-forge-maker-nsis';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { build as electronBuilder, type Configuration } from 'app-builder-lib';
import { APP_ID } from './src/main/appId';
import pkg from './package.json';

// Một nguồn duy nhất cho kênh cập nhật: `app-update.yml` trong gói (mọi nền tảng, hook
// packageAfterCopy) và cấu hình publish mà electron-builder dùng để sinh latest.yml cho bộ cài
// Windows cùng đọc từ đây nên không thể lệch nhau. Cả hai nền tảng dùng provider github.
const UPDATER = {
  provider: 'github' as const,
  owner: 'huuhoa143',
  repo: 'ainovel-studio',
  // Thư mục cache của electron-updater (~/Library/Caches/<tên>, %LOCALAPPDATA%\<tên>). PHẢI là
  // `<tên gói npm>-updater`: bộ cài NSIS tự chép mình vào đúng thư mục electron-builder suy ra
  // từ tên gói (APP_INSTALLER_STORE_FILE), và NsisUpdater lấy bản đó làm gốc cho cập nhật vi
  // sai — lệch tên là âm thầm tải lại cả bộ cài mỗi lần. Giữ cố định qua các bản.
  updaterCacheDirName: `${pkg.name}-updater`,
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

// Ghim tường minh mọi lựa chọn của bộ cài để đổi mặc định ở bản electron-builder sau không
// lặng lẽ đổi hành vi cài/gỡ của người dùng đang có.
const NSIS: NonNullable<Configuration['nsis']> = {
  oneClick: true,
  perMachine: false,
  // Gỡ app KHÔNG xóa %APPDATA%\AINovel Studio — truyện của người dùng nằm trong đó.
  deleteAppDataOnUninstall: false,
  createDesktopShortcut: true,
  createStartMenuShortcut: true,
  shortcutName: 'AINovel Studio',
  runAfterFinish: true,
  // Không dấu cách: GitHub đổi dấu cách trong tên asset thành dấu chấm, latest.yml sẽ lệch.
  artifactName: 'AINovel-Studio-Setup-${version}.${ext}',
};

// Maker NSIS gốc gọi electron-builder KHÔNG kèm cấu hình (appId rơi về mặc định
// com.electron.<tên gói> — chính là GUID gỡ cài đặt và AUMID của shortcut) và tự ghi
// app-update.yml provider generic đè lên bản github của hook. Nên ta tự gọi electron-builder
// với cấu hình đầy đủ ở đây; chỉ mượn lớp gốc làm vỏ maker. Nó cũng tự khóa vào máy build
// win32, nhưng electron-builder dựng NSIS trên darwin được (không cần wine/rcedit) — nhờ vậy
// release.sh làm luôn bản Windows từ Mac.
class MakerNSISFull extends MakerNSIS {
  isSupportedOnCurrentPlatform(): boolean {
    return true;
  }

  async make({ dir, makeDir, targetArch }: MakerOptions): Promise<string[]> {
    const outDir = path.resolve(makeDir, 'nsis', targetArch);
    const workDir = path.resolve(makeDir, 'nsis', `${targetArch}-build`);
    await rm(outDir, { recursive: true, force: true });
    await rm(workDir, { recursive: true, force: true });
    await mkdir(outDir, { recursive: true });
    await electronBuilder({
      prepackaged: dir,
      win: [`nsis:${targetArch}`],
      // Chỉ dựng; release.sh upload. Không để electron-builder tự publish khi thấy CI/tag.
      publish: 'never',
      config: {
        appId: APP_ID,
        directories: { output: workDir },
        nsis: NSIS,
        publish: { provider: UPDATER.provider, owner: UPDATER.owner, repo: UPDATER.repo },
      },
    });
    // Lấy bộ cài, .blockmap (cập nhật vi sai) và latest.yml; bỏ tệp phụ của electron-builder.
    const keep = (f: string) => f.endsWith('.exe') || f.endsWith('.exe.blockmap') || f === 'latest.yml';
    const files = (await readdir(workDir)).filter(keep);
    if (!files.some((f) => f.endsWith('.exe')) || !files.includes('latest.yml')) {
      throw new Error(`electron-builder không sinh đủ bộ cài + latest.yml trong ${workDir}: [${files.join(', ')}]`);
    }
    const result: string[] = [];
    for (const f of files) {
      await rename(path.join(workDir, f), path.join(outDir, f));
      result.push(path.join(outDir, f));
    }
    await rm(workDir, { recursive: true, force: true });
    return result;
  }
}

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    appBundleId: APP_ID,
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
    // nên ghi app-update.yml ở đây được. Cho cả macOS (<App>.app/Contents/Resources) lẫn
    // Windows (<thư mục app>/resources); maker NSIS ở trên không ghi đè.
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
    // Windows: NSIS (target NSIS của electron-builder). Squirrel.Windows không được
    // electron-updater hỗ trợ. Chưa ký Authenticode — người dùng gặp SmartScreen một lần.
    new MakerNSISFull({}, ['win32']),
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
