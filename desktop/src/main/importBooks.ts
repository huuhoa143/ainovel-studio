import fs from 'node:fs';
import path from 'node:path';
import { copyTreeAsync } from './copyTree';

// "Tệp → Nhập truyện từ thư mục…": chép truyện từ một thư mục ngoài (vd. `output/` của bản CLI
// cũ) vào `<userData>/books`. Không import electron để vitest kiểm được.
//
// Thư mục là một truyện khi có `meta/progress.json` đọc được thành object JSON — đúng dấu hiệu
// mà sidecar dùng khi liệt kê xưởng (internal/serve/workshop.go scanWorkshop + Progress.Load).
// Thư mục chọn có thể LÀ một truyện, hoặc CHỨA các truyện ở cấp con trực tiếp.

/** Tệp khóa engine (internal/store/khoa.go `tenTepKhoa`) — chép theo sẽ thành khóa mồ côi. */
const LOCK_FILE = 'studio.lock';

export interface ImportInput {
  /** Thư mục người dùng chọn. */
  source: string;
  /** `<userData>/books`. */
  booksDir: string;
  /** Thư mục tạm cùng ổ với `booksDir` nhưng nằm ngoài nó (sidecar quét `booksDir` mỗi yêu cầu). */
  stagingDir: string;
}

export type SkipReason = 'exists' | 'not-a-book' | 'error';

export interface ImportSkip {
  name: string;
  reason: SkipReason;
  detail?: string;
}

export interface ImportOptions {
  /** Hủy (vd. người dùng thoát app): truyện đang chép bị bỏ, không để lại thư mục dở. */
  signal?: AbortSignal;
  /** Gọi trước mỗi truyện và khi xong: `done` trên `total` truyện đã xử lý. */
  onProgress?: (done: number, total: number) => void;
}

export interface ImportResult {
  imported: string[];
  skipped: ImportSkip[];
  /** Liên kết tượng trưng không được chép, theo truyện. */
  links: { book: string; path: string }[];
  /** Dừng giữa chừng vì `signal` — các truyện chưa tới lượt không được nhắc tới. */
  cancelled: boolean;
}

export function isBookDir(dir: string): boolean {
  try {
    const raw = fs.readFileSync(path.join(dir, 'meta', 'progress.json'), 'utf8');
    const v: unknown = JSON.parse(raw);
    return typeof v === 'object' && v !== null && !Array.isArray(v);
  } catch {
    return false;
  }
}

/** Các truyện cần nhập và các thư mục con bị loại vì không phải truyện. */
export function findBooks(source: string): { books: string[]; notBooks: string[] } {
  if (isBookDir(source)) return { books: [path.resolve(source)], notBooks: [] };
  const books: string[] = [];
  const notBooks: string[] = [];
  for (const e of fs.readdirSync(source, { withFileTypes: true })) {
    // Thư mục ẩn (.git, .ainovel…) không bao giờ là truyện người dùng muốn nhập.
    if (!e.isDirectory() || e.name.startsWith('.')) continue;
    const dir = path.join(source, e.name);
    if (isBookDir(dir)) books.push(dir);
    else notBooks.push(e.name);
  }
  books.sort();
  notBooks.sort();
  return { books, notBooks };
}

/** Tiền tố thư mục tạm trong staging — `cleanImportStaging` chỉ xóa đúng các tên này. */
const STAGING_PREFIX = 'book-';

export async function importBooks(input: ImportInput, opts: ImportOptions = {}): Promise<ImportResult> {
  const result: ImportResult = { imported: [], skipped: [], links: [], cancelled: false };
  const { books, notBooks } = findBooks(input.source);
  for (const name of notBooks) result.skipped.push({ name, reason: 'not-a-book' });
  if (books.length === 0 && notBooks.length === 0) {
    result.skipped.push({ name: path.basename(path.resolve(input.source)), reason: 'not-a-book' });
  }
  if (books.length === 0) return result;

  await fs.promises.mkdir(input.booksDir, { recursive: true });
  await fs.promises.mkdir(input.stagingDir, { recursive: true });
  for (const [i, src] of books.entries()) {
    if (opts.signal?.aborted) {
      result.cancelled = true;
      break;
    }
    opts.onProgress?.(i, books.length);
    const name = path.basename(src);
    const dest = path.join(input.booksDir, name);
    // existsSync không phân biệt hoa thường trên ổ mặc định của mac/Windows — đúng ý: "Truyen"
    // và "truyen" là một thư mục ở đó, nên coi là trùng.
    if (fs.existsSync(dest)) {
      result.skipped.push({ name, reason: 'exists' });
      continue;
    }
    // Chép một thư mục vào chính bên trong nó thì không bao giờ dừng.
    if (isInside(input.booksDir, src)) {
      result.skipped.push({ name, reason: 'error', detail: 'chứa thư mục truyện của app' });
      continue;
    }
    const tmp = await fs.promises.mkdtemp(path.join(input.stagingDir, STAGING_PREFIX));
    try {
      const links = await copyTreeAsync(src, tmp, { skip: (n) => n === LOCK_FILE, signal: opts.signal });
      // Kiểm lại ngay trước rename: rename lên một thư mục rỗng đã có sẽ ghi đè nó.
      if (fs.existsSync(dest)) {
        result.skipped.push({ name, reason: 'exists' });
        continue;
      }
      await fs.promises.rename(tmp, dest);
      result.imported.push(name);
      for (const p of links) result.links.push({ book: name, path: p });
    } catch (err) {
      if (opts.signal?.aborted) {
        result.cancelled = true;
        break;
      }
      result.skipped.push({ name, reason: 'error', detail: (err as Error).message });
    } finally {
      await fs.promises.rm(tmp, { recursive: true, force: true });
    }
  }
  if (!result.cancelled) opts.onProgress?.(books.length, books.length);
  // rmdir chỉ xóa thư mục rỗng: nếu còn rác (vd. rm ở trên thất bại) thì để yên — lần mở app
  // sau `cleanImportStaging` dọn.
  await fs.promises.rmdir(input.stagingDir).catch(() => {});
  return result;
}

/**
 * Dọn thư mục tạm của một lần nhập bị ngắt (app crash / bị kill giữa chừng). Gọi lúc mở app,
 * trước khi có lần nhập nào. Trả tên các mục đã xóa.
 */
export function cleanImportStaging(stagingDir: string): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(stagingDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const removed: string[] = [];
  for (const e of entries) {
    if (!e.name.startsWith(STAGING_PREFIX)) continue;
    fs.rmSync(path.join(stagingDir, e.name), { recursive: true, force: true });
    removed.push(e.name);
  }
  try {
    fs.rmdirSync(stagingDir);
  } catch {
    // còn tệp lạ không phải của ta — để yên
  }
  return removed;
}

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

const REASON_LABEL: Record<SkipReason, string> = {
  exists: 'đã có',
  'not-a-book': 'không phải truyện',
  error: 'lỗi khi chép',
};

/** Câu tóm tắt cho hộp thoại: "Đã nhập N truyện. Bỏ qua: a (đã có), b (không phải truyện)." */
export function summarizeImport(r: ImportResult): string {
  let text = `Đã nhập ${r.imported.length} truyện.`;
  if (r.cancelled) text += ' Đã dừng giữa chừng vì app đang thoát.';
  if (r.skipped.length > 0) {
    const parts = r.skipped.map((s) => `${s.name} (${REASON_LABEL[s.reason]}${s.detail ? `: ${s.detail}` : ''})`);
    text += ` Bỏ qua: ${parts.join(', ')}.`;
  }
  if (r.links.length > 0) {
    text += ` Bỏ qua liên kết tượng trưng: ${r.links.map((l) => `${l.book}/${l.path}`).join(', ')}.`;
  }
  return text;
}
