import fs from 'node:fs';
import path from 'node:path';

// Chép đệ quy dùng chung cho nhập truyện và chuyển dữ liệu bản cũ. Chỉ chép thư mục và tệp
// thường: liên kết tượng trưng KHÔNG được theo (có thể trỏ ra ngoài cây nguồn) nhưng được trả về
// để người gọi báo lại cho người dùng, không bỏ qua trong im lặng.

export interface CopyOptions {
  /** Loại một mục theo tên ở mọi cấp. */
  skip?: (name: string) => boolean;
}

export interface CopyAsyncOptions extends CopyOptions {
  /** Hủy giữa chừng: kiểm trước mỗi mục, ném lỗi AbortError. */
  signal?: AbortSignal;
}

/** Trả đường dẫn tương đối (dấu `/`) của các liên kết tượng trưng đã bỏ qua. */
export function copyTree(src: string, dest: string, opts: CopyOptions = {}): string[] {
  const links: string[] = [];
  const walk = (from: string, to: string, rel: string) => {
    fs.mkdirSync(to, { recursive: true });
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
      if (opts.skip?.(e.name)) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(from, e.name), path.join(to, e.name), r);
      else if (e.isFile()) fs.copyFileSync(path.join(from, e.name), path.join(to, e.name));
      else if (e.isSymbolicLink()) links.push(r);
    }
  };
  walk(src, dest, '');
  return links;
}

/** Như `copyTree` nhưng không chặn tiến trình main và hủy được. */
export async function copyTreeAsync(src: string, dest: string, opts: CopyAsyncOptions = {}): Promise<string[]> {
  const links: string[] = [];
  const walk = async (from: string, to: string, rel: string) => {
    await fs.promises.mkdir(to, { recursive: true });
    for (const e of await fs.promises.readdir(from, { withFileTypes: true })) {
      opts.signal?.throwIfAborted();
      if (opts.skip?.(e.name)) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(path.join(from, e.name), path.join(to, e.name), r);
      else if (e.isFile()) await fs.promises.copyFile(path.join(from, e.name), path.join(to, e.name));
      else if (e.isSymbolicLink()) links.push(r);
    }
  };
  await walk(src, dest, '');
  return links;
}
