import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanImportStaging, findBooks, importBooks, isBookDir, summarizeImport } from '../src/main/importBooks';

let dir: string;
let booksDir: string;
let stagingDir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ainovel-import-'));
  booksDir = path.join(dir, 'userData', 'books');
  stagingDir = path.join(dir, 'userData', '.import-staging');
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Dựng một truyện tối thiểu như Store.Init: meta/progress.json + vài tệp nội dung. */
function makeBook(at: string, opts: { lock?: boolean; title?: string } = {}) {
  fs.mkdirSync(path.join(at, 'meta'), { recursive: true });
  fs.mkdirSync(path.join(at, 'chapters'), { recursive: true });
  fs.writeFileSync(path.join(at, 'meta', 'progress.json'), JSON.stringify({ phase: 'writing' }));
  fs.writeFileSync(path.join(at, 'chapters', '01.md'), `# ${opts.title ?? 'Chương 1'}\n`);
  if (opts.lock) fs.writeFileSync(path.join(at, 'meta', 'studio.lock'), '12345');
  return at;
}

const run = (source: string, opts: Parameters<typeof importBooks>[1] = {}) =>
  importBooks({ source, booksDir, stagingDir }, opts);
const none = { links: [], cancelled: false };

describe('isBookDir', () => {
  it('cần meta/progress.json là object JSON', async () => {
    const b = makeBook(path.join(dir, 'b'));
    expect(isBookDir(b)).toBe(true);

    const hong = path.join(dir, 'hong');
    fs.mkdirSync(path.join(hong, 'meta'), { recursive: true });
    fs.writeFileSync(path.join(hong, 'meta', 'progress.json'), '{hỏng');
    expect(isBookDir(hong)).toBe(false);

    const mang = path.join(dir, 'mang');
    fs.mkdirSync(path.join(mang, 'meta'), { recursive: true });
    fs.writeFileSync(path.join(mang, 'meta', 'progress.json'), '[]');
    expect(isBookDir(mang)).toBe(false);

    const thuMuc = path.join(dir, 'thumuc');
    fs.mkdirSync(path.join(thuMuc, 'meta', 'progress.json'), { recursive: true });
    expect(isBookDir(thuMuc)).toBe(false);

    expect(isBookDir(path.join(dir, 'khong-co'))).toBe(false);
  });
});

describe('importBooks', () => {
  it('thư mục chọn LÀ một truyện → nhập đúng nó, bỏ studio.lock', async () => {
    const src = makeBook(path.join(dir, 'src', 'Kiem Hiep'), { lock: true });
    const r = await run(src);
    expect(r).toEqual({ imported: ['Kiem Hiep'], skipped: [], ...none });
    const dest = path.join(booksDir, 'Kiem Hiep');
    expect(fs.readFileSync(path.join(dest, 'chapters', '01.md'), 'utf8')).toBe('# Chương 1\n');
    expect(fs.existsSync(path.join(dest, 'meta', 'progress.json'))).toBe(true);
    expect(fs.existsSync(path.join(dest, 'meta', 'studio.lock'))).toBe(false);
    // Nguồn không bị đụng tới.
    expect(fs.existsSync(path.join(src, 'meta', 'studio.lock'))).toBe(true);
    // Không còn rác tạm.
    expect(fs.existsSync(stagingDir)).toBe(false);
  });

  it('thư mục chọn CHỨA các truyện (như output/ cũ) → nhập mọi truyện, báo thư mục lạ', async () => {
    const out = path.join(dir, 'output');
    makeBook(path.join(out, 'a'));
    makeBook(path.join(out, 'b'));
    fs.mkdirSync(path.join(out, 'rac'), { recursive: true });
    fs.mkdirSync(path.join(out, '.git'), { recursive: true });
    fs.writeFileSync(path.join(out, 'ghichu.txt'), 'x');
    const r = await run(out);
    expect(r.imported).toEqual(['a', 'b']);
    expect(r.skipped).toEqual([{ name: 'rac', reason: 'not-a-book' }]);
    expect(fs.readdirSync(booksDir).sort()).toEqual(['a', 'b']);
  });

  it('trùng tên thì bỏ qua, không ghi đè', async () => {
    const out = path.join(dir, 'output');
    makeBook(path.join(out, 'a'), { title: 'mới' });
    makeBook(path.join(out, 'b'));
    makeBook(path.join(booksDir, 'a'), { title: 'cũ' });
    const r = await run(out);
    expect(r.imported).toEqual(['b']);
    expect(r.skipped).toEqual([{ name: 'a', reason: 'exists' }]);
    expect(fs.readFileSync(path.join(booksDir, 'a', 'chapters', '01.md'), 'utf8')).toBe('# cũ\n');
  });

  it('thư mục không có truyện nào → không tạo gì', async () => {
    const empty = path.join(dir, 'trong');
    fs.mkdirSync(empty);
    const r = await run(empty);
    expect(r).toEqual({ imported: [], skipped: [{ name: 'trong', reason: 'not-a-book' }], ...none });
    expect(fs.existsSync(booksDir)).toBe(false);
    expect(fs.existsSync(stagingDir)).toBe(false);
  });

  it.runIf(process.platform !== 'win32' && process.getuid?.() !== 0)(
    'một truyện lỗi không chặn truyện khác và không để lại thư mục dở',
    async () => {
      const out = path.join(dir, 'output');
      makeBook(path.join(out, 'a'));
      const bad = makeBook(path.join(out, 'b'));
      const secret = path.join(bad, 'chapters', '01.md');
      fs.chmodSync(secret, 0o000);
      try {
        const r = await run(out);
        expect(r.imported).toEqual(['a']);
        expect(r.skipped).toHaveLength(1);
        expect(r.skipped[0]).toMatchObject({ name: 'b', reason: 'error' });
        expect(fs.existsSync(path.join(booksDir, 'b'))).toBe(false);
        expect(fs.existsSync(stagingDir)).toBe(false);
      } finally {
        fs.chmodSync(secret, 0o644);
      }
    },
  );

  it.runIf(process.platform !== 'win32')('không theo liên kết tượng trưng ra ngoài truyện', async () => {
    const src = makeBook(path.join(dir, 'src', 'a'));
    fs.writeFileSync(path.join(dir, 'bimat.txt'), 'bí mật');
    fs.symlinkSync(path.join(dir, 'bimat.txt'), path.join(src, 'link.txt'));
    const r = await run(src);
    expect(r.imported).toEqual(['a']);
    expect(fs.existsSync(path.join(booksDir, 'a', 'link.txt'))).toBe(false);
    // Không bỏ qua trong im lặng: báo lại cho hộp thoại.
    expect(r.links).toEqual([{ book: 'a', path: 'link.txt' }]);
    expect(summarizeImport(r)).toContain('Bỏ qua liên kết tượng trưng: a/link.txt.');
  });

  it('truyện đang chép dở không bao giờ nằm trong books (chép vào staging rồi rename)', async () => {
    const src = makeBook(path.join(dir, 'src', 'a'));
    const seen: string[][] = [];
    const orig = fs.promises.rename;
    vi.spyOn(fs.promises, 'rename').mockImplementation((from, to) => {
      seen.push([String(from), String(to)]);
      return orig(from, to);
    });
    await run(src);
    expect(seen).toHaveLength(1);
    expect(seen[0][0].startsWith(stagingDir + path.sep)).toBe(true);
    expect(seen[0][1]).toBe(path.join(booksDir, 'a'));
  });

  it('chọn chính thư mục books → mọi truyện đều "đã có"', async () => {
    makeBook(path.join(booksDir, 'a'));
    expect(await run(booksDir)).toEqual({ imported: [], skipped: [{ name: 'a', reason: 'exists' }], ...none });
  });
});

describe('importBooks — hủy giữa chừng', () => {
  function bigOutput(n: number) {
    const out = path.join(dir, 'output');
    for (let i = 0; i < n; i++) {
      const b = makeBook(path.join(out, `b${i}`));
      for (let j = 0; j < 30; j++) fs.writeFileSync(path.join(b, 'chapters', `${j}.md`), 'x'.repeat(1000));
    }
    return out;
  }

  it('hủy trước khi bắt đầu → không nhập gì, không để lại gì', async () => {
    const ac = new AbortController();
    ac.abort();
    const r = await run(bigOutput(2), { signal: ac.signal });
    expect(r).toMatchObject({ imported: [], cancelled: true });
    expect(fs.readdirSync(booksDir)).toEqual([]);
    expect(fs.existsSync(stagingDir)).toBe(false);
  });

  it('hủy sau truyện đầu → truyện đầu nguyên vẹn, truyện đang chép bị bỏ, staging sạch', async () => {
    const out = bigOutput(3);
    const ac = new AbortController();
    const progress: [number, number][] = [];
    const r = await run(out, {
      signal: ac.signal,
      onProgress: (done, total) => {
        progress.push([done, total]);
        if (done === 1) ac.abort(); // ngay khi truyện thứ hai bắt đầu
      },
    });
    expect(r.cancelled).toBe(true);
    expect(r.imported).toEqual(['b0']);
    expect(r.skipped).toEqual([]);
    expect(fs.readdirSync(booksDir)).toEqual(['b0']);
    expect(fs.readdirSync(path.join(booksDir, 'b0', 'chapters'))).toHaveLength(31); // 01.md + 30 tệp
    expect(fs.existsSync(stagingDir)).toBe(false);
    expect(progress).toEqual([[0, 3], [1, 3]]);
    expect(summarizeImport(r)).toContain('Đã dừng giữa chừng');
  });

  it('hủy giữa lúc đang chép tệp → không có thư mục dở trong books hay staging', async () => {
    const out = bigOutput(1);
    const ac = new AbortController();
    const orig = fs.promises.copyFile;
    let n = 0;
    vi.spyOn(fs.promises, 'copyFile').mockImplementation((from, to, mode) => {
      if (++n === 5) ac.abort();
      return orig(from, to, mode);
    });
    const r = await run(out, { signal: ac.signal });
    expect(r).toMatchObject({ imported: [], skipped: [], cancelled: true });
    expect(fs.readdirSync(booksDir)).toEqual([]);
    expect(fs.existsSync(stagingDir)).toBe(false);
  });

  it('báo tiến độ đủ cho mọi truyện', async () => {
    const progress: [number, number][] = [];
    await run(bigOutput(2), { onProgress: (d, t) => progress.push([d, t]) });
    expect(progress).toEqual([[0, 2], [1, 2], [2, 2]]);
  });
});

describe('cleanImportStaging', () => {
  it('xóa bản chép dở book-* của lần trước, để yên tệp lạ', () => {
    fs.mkdirSync(path.join(stagingDir, 'book-abc', 'meta'), { recursive: true });
    fs.writeFileSync(path.join(stagingDir, 'book-abc', 'meta', 'progress.json'), '{}');
    fs.mkdirSync(path.join(stagingDir, 'book-def'));
    fs.writeFileSync(path.join(stagingDir, 'khac.txt'), 'không phải của ta');
    expect(cleanImportStaging(stagingDir).sort()).toEqual(['book-abc', 'book-def']);
    expect(fs.readdirSync(stagingDir)).toEqual(['khac.txt']);
  });

  it('chỉ có book-* thì xóa luôn thư mục staging; chưa có staging thì không làm gì', () => {
    fs.mkdirSync(path.join(stagingDir, 'book-x'), { recursive: true });
    expect(cleanImportStaging(stagingDir)).toEqual(['book-x']);
    expect(fs.existsSync(stagingDir)).toBe(false);
    expect(cleanImportStaging(stagingDir)).toEqual([]);
  });
});

describe('findBooks', () => {
  it('xếp theo tên', async () => {
    const out = path.join(dir, 'o');
    makeBook(path.join(out, 'z'));
    makeBook(path.join(out, 'm'));
    expect(findBooks(out).books.map((p) => path.basename(p))).toEqual(['m', 'z']);
  });
});

describe('summarizeImport', () => {
  it('câu tiếng Việt cho hộp thoại', async () => {
    expect(summarizeImport({ imported: ['a', 'b'], skipped: [], ...none })).toBe('Đã nhập 2 truyện.');
    expect(
      summarizeImport({
        ...none,
        imported: ['a'],
        skipped: [
          { name: 'b', reason: 'exists' },
          { name: 'rac', reason: 'not-a-book' },
          { name: 'c', reason: 'error', detail: 'EACCES' },
        ],
      }),
    ).toBe('Đã nhập 1 truyện. Bỏ qua: b (đã có), rac (không phải truyện), c (lỗi khi chép: EACCES).');
  });
});
