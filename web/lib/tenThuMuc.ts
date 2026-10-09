/**
 * Gợi tên thư mục từ câu ý tưởng.
 *
 * Bản trước lấy năm chữ ĐẦU câu, mà câu ý tưởng gần như luôn mở bằng phần khung chứ không
 * phải phần riêng: "Truyện ngắn 3 chương, một …" thành `truyen-ngan-3-chuong-mot` — cuốn nào
 * cũng ra cùng một cái tên, và trên đĩa không còn biết thư mục nào là truyện nào.
 *
 * Nên bỏ các chữ khung (thể loại, độ dài, lời nhờ viết, số chương) rồi mới lấy năm chữ.
 * Bỏ hết mà không còn gì thì quay về cách cũ: một tên chung chung vẫn hơn ô trống khóa nút.
 */
// Lọc trên chữ CÒN DẤU: bỏ dấu trước thì "vé" trùng "về", "thể" trùng "the", và tên mất
// đúng chữ riêng của truyện.
const CHU_KHUNG = new Set([
  'truyện',
  'ngắn',
  'dài',
  'tiểu',
  'thuyết',
  'cuốn',
  'bộ',
  'tập',
  'chương',
  'phần',
  'viết',
  'giúp',
  'cho',
  'tôi',
  'mình',
  'hãy',
  'một',
  'về',
  'khoảng',
  'tầm',
  'gồm',
  'thể',
  'loại',
  'phong',
  'cách',
  'giọng',
  'văn',
  'kiểu',
]);

const boDau = (c: string) =>
  c
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');

function tach(v: string): string[] {
  return v
    .normalize('NFC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

const ghep = (chu: string[]) =>
  chu
    .map(boDau)
    .flatMap((c) => c.split(/[^a-z0-9]+/))
    .filter(Boolean)
    .slice(0, 5)
    .join('-')
    .slice(0, 64)
    .replace(/-+$/, '');

export function goiYTenThuMuc(yTuong: string): string {
  const chu = tach(yTuong);
  const rieng = chu.filter((c) => !CHU_KHUNG.has(c) && !/^\d+$/.test(c));
  return ghep(rieng.length > 0 ? rieng : chu);
}
