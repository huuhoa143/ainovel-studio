import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  describeMigrationStep,
  MARKER_NAME,
  migrateLegacyConfig,
  migrateLegacyUserData,
  tightenConfigMode,
} from '../src/main/legacyMigration';

let dir: string;
let target: string;
let legacy: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ainovel-cfg-'));
  target = path.join(dir, 'userData', 'config.json');
  legacy = path.join(dir, 'home', '.ainovel', 'config.json');
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function writeLegacy(content: string, mode = 0o644) {
  fs.mkdirSync(path.dirname(legacy), { recursive: true });
  fs.writeFileSync(legacy, content);
  fs.chmodSync(legacy, mode);
}

const posix = process.platform !== 'win32';

describe('migrateLegacyConfig', () => {
  it('chép file cũ sang userData với quyền 0600, file cũ giữ nguyên', () => {
    writeLegacy('{"provider":"x","api_key":"k"}', 0o644);
    const before = fs.statSync(legacy);
    const r = migrateLegacyConfig({ target, legacy, platform: process.platform });
    expect(r.kind).toBe('copied');
    expect(fs.readFileSync(target, 'utf8')).toBe('{"provider":"x","api_key":"k"}');
    expect(fs.readFileSync(legacy, 'utf8')).toBe('{"provider":"x","api_key":"k"}');
    expect(fs.statSync(legacy).mode).toBe(before.mode);
    if (posix) expect(fs.statSync(target).mode & 0o777).toBe(0o600);
    // Không để lại file tạm.
    expect(fs.readdirSync(path.dirname(target))).toEqual(['config.json']);
  });

  it('đích đã có thì không đụng vào, kể cả khi file cũ khác', () => {
    writeLegacy('{"old":true}');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, '{"new":true}', { mode: 0o600 });
    const r = migrateLegacyConfig({ target, legacy, platform: process.platform });
    expect(r).toEqual({ kind: 'exists' });
    expect(fs.readFileSync(target, 'utf8')).toBe('{"new":true}');
  });

  it('không có file cũ thì không tạo gì', () => {
    const r = migrateLegacyConfig({ target, legacy, platform: process.platform });
    expect(r.kind).toBe('no-legacy');
    expect(fs.existsSync(target)).toBe(false);
  });

  it('file cũ là thư mục thì coi như không có', () => {
    fs.mkdirSync(legacy, { recursive: true });
    expect(migrateLegacyConfig({ target, legacy, platform: process.platform }).kind).toBe('no-legacy');
  });

  it.runIf(posix)('lỗi chép trả error và không để lại file tạm hay đích cụt', () => {
    writeLegacy('{}', 0o000);
    const r = migrateLegacyConfig({ target, legacy, platform: process.platform });
    // root đọc được mọi file — khi đó ca này thành chép thành công, vẫn đúng hợp đồng.
    if (r.kind === 'error') {
      expect(fs.existsSync(target)).toBe(false);
      expect(fs.readdirSync(path.dirname(target))).toEqual([]);
    } else {
      expect(r.kind).toBe('copied');
    }
  });

  it('Windows: chép nhưng không chmod', () => {
    writeLegacy('{"a":1}');
    const r = migrateLegacyConfig({ target, legacy, platform: 'win32' });
    expect(r.kind).toBe('copied');
    expect(fs.readFileSync(target, 'utf8')).toBe('{"a":1}');
  });
});

describe('tightenConfigMode', () => {
  it.runIf(posix)('người khác đọc được thì siết về 0600; đã 0600 thì không làm gì', () => {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, '{}');
    fs.chmodSync(target, 0o644);
    expect(tightenConfigMode(target, process.platform)).toBe(true);
    expect(fs.statSync(target).mode & 0o777).toBe(0o600);
    expect(tightenConfigMode(target, process.platform)).toBe(false);
  });

  it('chưa có file hay Windows thì không làm gì', () => {
    expect(tightenConfigMode(target, process.platform)).toBe(false);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, '{}');
    fs.chmodSync(target, 0o644);
    expect(tightenConfigMode(target, 'win32')).toBe(false);
  });
});

describe('migrateLegacyUserData', () => {
  let home: string;
  let userData: string;
  const run = () => migrateLegacyUserData({ userData, legacyDir: home, platform: process.platform }).steps;
  const kinds = (steps: ReturnType<typeof run>) => Object.fromEntries(steps.map((s) => [s.item, s.result.kind]));
  const tree = (root: string): string[] => {
    const out: string[] = [];
    const walk = (d: string, rel: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) walk(path.join(d, e.name), r);
        else out.push(r);
      }
    };
    walk(root, '');
    return out.sort();
  };

  beforeEach(() => {
    home = path.join(dir, 'home', '.ainovel');
    userData = path.join(dir, 'userData');
  });

  function seedLegacy() {
    fs.mkdirSync(path.join(home, 'rules'), { recursive: true });
    fs.writeFileSync(path.join(home, 'config.json'), '{"k":1}');
    fs.writeFileSync(path.join(home, 'rules', 'my-style.md'), '- thoại ngắn');
    fs.writeFileSync(path.join(home, 'rules', 'B.MD'), '- hoa');
    fs.writeFileSync(path.join(home, 'rules', 'README.txt'), 'tệp CLI tự sinh');
    fs.writeFileSync(path.join(home, 'rules', '.an.md'), 'ẩn');
    fs.mkdirSync(path.join(home, 'rules', 'con'), { recursive: true });
    fs.writeFileSync(path.join(home, 'rules', 'con', 'x.md'), 'cấp con — sidecar không nạp');
    fs.mkdirSync(path.join(home, 'style', 'styles'), { recursive: true });
    fs.writeFileSync(path.join(home, 'style', 'voice.md'), 'giọng');
    fs.writeFileSync(path.join(home, 'style', 'styles', 'kiem-hiep.md'), 'kiếm hiệp');
    fs.writeFileSync(path.join(home, 'models-cache.json'), '{}');
  }

  it('chép config, các .md cấp đầu của rules (bỏ README.txt/ẩn/cấp con) và cả cây style', () => {
    seedLegacy();
    const before = tree(home);
    const steps = run();
    expect(kinds(steps)).toEqual({ config: 'copied', rules: 'copied', style: 'copied' });
    expect(tree(path.join(userData, 'rules'))).toEqual(['B.MD', 'my-style.md']);
    expect(tree(path.join(userData, 'style'))).toEqual(['styles/kiem-hiep.md', 'voice.md']);
    expect(fs.readFileSync(path.join(userData, 'style', 'styles', 'kiem-hiep.md'), 'utf8')).toBe('kiếm hiệp');
    // models-cache dựng lại được — không chép; không còn tên tạm.
    expect(fs.readdirSync(userData).sort()).toEqual([MARKER_NAME, 'config.json', 'rules', 'style']);
    // Bản cũ nguyên vẹn.
    expect(tree(home)).toEqual(before);
    expect(describeMigrationStep(steps[1])).toContain('đã chép');
  });

  it('đích đã có thì mục đó giữ nguyên, các mục khác vẫn chép', () => {
    seedLegacy();
    fs.mkdirSync(path.join(userData, 'rules'), { recursive: true });
    fs.writeFileSync(path.join(userData, 'rules', 'app.md'), 'luật trong app');
    const steps = run();
    expect(kinds(steps)).toEqual({ config: 'copied', rules: 'exists', style: 'copied' });
    expect(tree(path.join(userData, 'rules'))).toEqual(['app.md']);
  });

  it('chỉ chạy một lần: xóa đích để làm lại thì KHÔNG bị chép lại từ bản cũ', () => {
    seedLegacy();
    const first = migrateLegacyUserData({ userData, legacyDir: home, platform: process.platform });
    expect(first.alreadyDone).toBe(false);
    const marker = JSON.parse(fs.readFileSync(path.join(userData, MARKER_NAME), 'utf8'));
    expect(marker.items).toEqual({ config: 'copied', rules: 'copied', style: 'copied' });
    expect(marker.from).toBe(home);
    expect(Number.isNaN(Date.parse(marker.at))).toBe(false);

    fs.rmSync(path.join(userData, 'rules'), { recursive: true });
    fs.rmSync(path.join(userData, 'config.json'));
    const second = migrateLegacyUserData({ userData, legacyDir: home, platform: process.platform });
    expect(second).toEqual({ alreadyDone: true, steps: [] });
    expect(fs.existsSync(path.join(userData, 'rules'))).toBe(false);
    expect(fs.existsSync(path.join(userData, 'config.json'))).toBe(false);
  });

  it('không có gì để chép vẫn ghi đánh dấu — bản cũ xuất hiện sau cũng không bị kéo vào', () => {
    run();
    expect(fs.existsSync(path.join(userData, MARKER_NAME))).toBe(true);
    seedLegacy();
    expect(run()).toEqual([]);
    expect(fs.existsSync(path.join(userData, 'config.json'))).toBe(false);
  });

  it.runIf(posix)('liên kết tượng trưng không được chép nhưng được báo trong log', () => {
    seedLegacy();
    fs.writeFileSync(path.join(dir, 'ngoai.md'), 'ngoài cây');
    fs.symlinkSync(path.join(dir, 'ngoai.md'), path.join(home, 'rules', 'link.md'));
    fs.symlinkSync(path.join(dir, 'ngoai.md'), path.join(home, 'style', 'styles', 'link.md'));
    const steps = run();
    expect(fs.existsSync(path.join(userData, 'rules', 'link.md'))).toBe(false);
    expect(fs.existsSync(path.join(userData, 'style', 'styles', 'link.md'))).toBe(false);
    expect(describeMigrationStep(steps[1])).toContain('bỏ qua liên kết tượng trưng: link.md');
    expect(describeMigrationStep(steps[2])).toContain('bỏ qua liên kết tượng trưng: styles/link.md');
  });

  it('rules cũ chỉ có README.txt → không tạo thư mục rules rỗng', () => {
    fs.mkdirSync(path.join(home, 'rules'), { recursive: true });
    fs.writeFileSync(path.join(home, 'rules', 'README.txt'), 'tệp CLI tự sinh');
    const steps = run();
    expect(kinds(steps)).toEqual({ config: 'no-legacy', rules: 'no-legacy', style: 'no-legacy' });
    expect(fs.readdirSync(userData)).toEqual([MARKER_NAME]);
  });

  it.runIf(posix && process.getuid?.() !== 0)('lỗi ở style không để lại thư mục dở và không chặn mục khác', () => {
    seedLegacy();
    const locked = path.join(home, 'style', 'styles', 'kiem-hiep.md');
    fs.chmodSync(locked, 0o000);
    try {
      const steps = run();
      expect(kinds(steps)).toEqual({ config: 'copied', rules: 'copied', style: 'error' });
      expect(fs.readdirSync(userData).sort()).toEqual([MARKER_NAME, 'config.json', 'rules']);
      const marker = JSON.parse(fs.readFileSync(path.join(userData, MARKER_NAME), 'utf8'));
      expect(marker.items.style).toMatch(/^error: /);
      expect(describeMigrationStep(steps[2])).toContain('không chép được');
    } finally {
      fs.chmodSync(locked, 0o644);
    }
  });
});
