import fs from 'node:fs';
import path from 'node:path';
import { copyTree } from './copyTree';

// Lần mở đầu của app: chép dữ liệu người dùng của bản CLI cũ (`~/.ainovel/`) sang `<userData>`,
// nơi sidecar giữ MỌI dữ liệu dùng chung cạnh `--config` (bootstrap.Config.UserDir). Không import
// electron để vitest kiểm được; main.ts gọi trước mỗi lần khởi động sidecar.
//
// Chỉ chạy MỘT lần: xong lần đầu (kể cả khi có lỗi) thì ghi `<userData>/.legacy-migrated`, và
// có tệp đó là không làm gì nữa — người dùng xóa rules/ hay config.json để làm lại từ đầu sẽ
// không bị chép đè trở lại từ bản cũ. Trong lần chạy đó, mỗi mục chỉ chép khi đích CHƯA có —
// người đã có dữ liệu trong app không bao giờ bị ghi đè. Bản cũ không bao giờ bị xóa hay sửa. Mỗi mục được chép ra tên tạm cạnh đích rồi rename, nên
// tắt giữa chừng không để lại đích dở (lần sau sẽ chép lại từ đầu).
//
// Không chép `models-cache.json`: dựng lại được.

export interface LegacyMigrationInput {
  /** `<userData>`. */
  userData: string;
  /** `~/.ainovel`. */
  legacyDir: string;
  platform: NodeJS.Platform;
}

export type MigrationItem = 'config' | 'rules' | 'style';

export type MigrationResult =
  | { kind: 'exists' }
  | { kind: 'no-legacy' }
  /** `links`: liên kết tượng trưng không được chép (đường dẫn tương đối trong mục). */
  | { kind: 'copied'; links: string[] }
  | { kind: 'error'; error: Error };

export interface MigrationStep {
  item: MigrationItem;
  from: string;
  to: string;
  result: MigrationResult;
}

const PRIVATE_MODE = 0o600;

export const MARKER_NAME = '.legacy-migrated';

export interface LegacyMigrationOutcome {
  /** true = đã chuyển ở một lần mở trước, lần này không làm gì. */
  alreadyDone: boolean;
  steps: MigrationStep[];
  /** Lỗi ghi tệp đánh dấu — khi đó lần mở sau sẽ thử chuyển lại (vẫn không ghi đè đích đã có). */
  markerError?: Error;
}

/** Chạy cả ba mục (lỗi của mục này không chặn mục khác) rồi ghi tệp đánh dấu. */
export function migrateLegacyUserData(input: LegacyMigrationInput): LegacyMigrationOutcome {
  const marker = path.join(input.userData, MARKER_NAME);
  if (fs.existsSync(marker)) return { alreadyDone: true, steps: [] };
  const steps = runSteps(input);
  const record = {
    at: new Date().toISOString(),
    from: input.legacyDir,
    items: Object.fromEntries(
      steps.map((s) => [s.item, s.result.kind === 'error' ? `error: ${s.result.error.message}` : s.result.kind]),
    ),
  };
  try {
    fs.mkdirSync(input.userData, { recursive: true });
    atomically(marker, (tmp) => fs.writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`));
    return { alreadyDone: false, steps };
  } catch (err) {
    return { alreadyDone: false, steps, markerError: err as Error };
  }
}

function runSteps(input: LegacyMigrationInput): MigrationStep[] {
  const at = (name: string) => ({ from: path.join(input.legacyDir, name), to: path.join(input.userData, name) });
  const config = at('config.json');
  const rules = at('rules');
  const style = at('style');
  return [
    {
      item: 'config',
      ...config,
      result: migrateLegacyConfig({ target: config.to, legacy: config.from, platform: input.platform }),
    },
    { item: 'rules', ...rules, result: migrateDir(rules.from, rules.to, copyRules) },
    { item: 'style', ...style, result: migrateDir(style.from, style.to, copyStyle) },
  ];
}

export interface ConfigMigrationInput {
  /** `<userData>/config.json`. */
  target: string;
  /** `~/.ainovel/config.json`. */
  legacy: string;
  platform: NodeJS.Platform;
}

/** File chứa API key: bản sao 0600 trên mac/linux. */
export function migrateLegacyConfig(input: ConfigMigrationInput): MigrationResult {
  const { target, legacy, platform } = input;
  try {
    if (fs.existsSync(target)) return { kind: 'exists' };
    if (!isFile(legacy)) return { kind: 'no-legacy' };
    fs.mkdirSync(path.dirname(target), { recursive: true });
    // Go coi config.json hỏng là lỗi khởi động, nên không được để lại file cụt.
    atomically(target, (tmp) => {
      fs.copyFileSync(legacy, tmp);
      if (platform !== 'win32') fs.chmodSync(tmp, PRIVATE_MODE);
    });
    return { kind: 'copied', links: [] };
  } catch (err) {
    return { kind: 'error', error: err as Error };
  }
}

/**
 * Mỗi lần mở app (không phải chuyển dữ liệu): config.json chứa API key mà nhóm/người khác đọc
 * được thì siết về 0600. Trả true nếu đã siết; file chưa có hay Windows thì false.
 */
export function tightenConfigMode(file: string, platform: NodeJS.Platform): boolean {
  if (platform === 'win32' || !isFile(file)) return false;
  const mode = fs.statSync(file).mode & 0o777;
  if ((mode & 0o077) === 0) return false;
  fs.chmodSync(file, PRIVATE_MODE);
  return true;
}

interface DirCopy {
  /** Số mục đáng giữ đã chép; 0 = không có gì. */
  count: number;
  links: string[];
}

/**
 * Luật viết chung: chỉ các tệp `.md` cấp đầu, không ẩn — đúng thứ sidecar nạp
 * (internal/rules/raw.go `rawDir`). Nhờ vậy `README.txt` mà bản CLI tự sinh
 * (internal/rules/loader.go `ensureRulesDirAt`) không bị chép theo.
 */
function copyRules(src: string, dest: string): DirCopy {
  fs.mkdirSync(dest, { recursive: true });
  const out: DirCopy = { count: 0, links: [] };
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name.startsWith('.') || path.extname(e.name).toLowerCase() !== '.md') continue;
    if (e.isSymbolicLink()) out.links.push(e.name);
    if (!e.isFile()) continue;
    fs.copyFileSync(path.join(src, e.name), path.join(dest, e.name));
    out.count++;
  }
  return out;
}

function copyStyle(src: string, dest: string): DirCopy {
  // Thư mục style rỗng vẫn chép: nó không che gì, và giữ đúng hình dạng người dùng đã dựng.
  return { count: 1, links: copyTree(src, dest) };
}

/**
 * Chép một thư mục nếu đích chưa có. `copy` báo count 0 nghĩa là không có gì đáng chép — khi
 * đó không tạo đích, để thư mục rỗng không đứng chỗ của dữ liệu thật.
 */
function migrateDir(from: string, to: string, copy: (src: string, dest: string) => DirCopy): MigrationResult {
  try {
    if (fs.existsSync(to)) return { kind: 'exists' };
    if (!isDir(from)) return { kind: 'no-legacy' };
    fs.mkdirSync(path.dirname(to), { recursive: true });
    let res: DirCopy = { count: 0, links: [] };
    const copied = atomically(to, (tmp) => {
      res = copy(from, tmp);
      return res.count !== 0;
    });
    return copied ? { kind: 'copied', links: res.links } : { kind: 'no-legacy' };
  } catch (err) {
    return { kind: 'error', error: err as Error };
  }
}

/**
 * Dựng nội dung ở `<target>.migrate-<pid>.tmp` rồi rename sang `target`. `build` trả false thì
 * bỏ (không rename). Mọi đường ra đều dọn tên tạm. Trả true nếu đã rename.
 */
function atomically(target: string, build: (tmp: string) => boolean | void): boolean {
  const tmp = `${target}.migrate-${process.pid}.tmp`;
  fs.rmSync(tmp, { recursive: true, force: true });
  try {
    if (build(tmp) === false) return false;
    fs.renameSync(tmp, target);
    return true;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

const ITEM_LABEL: Record<MigrationItem, string> = {
  config: 'cấu hình',
  rules: 'luật viết chung',
  style: 'văn phong chung',
};

export function describeMigrationStep(s: MigrationStep): string {
  const label = ITEM_LABEL[s.item];
  const r = s.result;
  switch (r.kind) {
    case 'exists':
      return `${label}: ${s.to} đã có, không chép từ bản cũ`;
    case 'no-legacy':
      return `${label}: không có gì ở ${s.from} để chép`;
    case 'copied': {
      const links = r.links.length > 0 ? `; bỏ qua liên kết tượng trưng: ${r.links.join(', ')}` : '';
      return `${label}: đã chép ${s.from} → ${s.to} (bản cũ giữ nguyên)${links}`;
    }
    case 'error':
      return `${label}: không chép được ${s.from} → ${s.to}: ${r.error.message}`;
  }
}
