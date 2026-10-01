import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vitest';

/**
 * Canh cách trình bày nút `Xóa` trong bảng Quản lý.
 *
 * # Vì sao bài kiểm này ĐỌC CSS trên đĩa
 *
 * jsdom không tính style từ stylesheet ngoài, nên một bài kiểm render sẽ thấy mọi thuộc tính
 * là rỗng và xanh bất kể CSS viết gì. Cùng kỹ thuật `lib/dauHieu.test.ts` đã dùng cho
 * `app/icon.svg`: đọc tệp thật rồi đối chiếu luật.
 *
 * # Vì sao cần canh
 *
 * Bản đầu của nút này dùng `.nutPhu.nguyHiem`, và nó sai ở hai tầng cùng lúc vì `.nutPhu` mang
 * sẵn `background: var(--raised)` + viền — thêm `color: --red` vào ra một CHIP ĐỎ CÓ NỀN trên
 * mỗi hàng. Hai điều khoản của DESIGN.md bị phá một lượt:
 *
 *   "đỏ nghĩa là lỗi, còn dừng có chủ ý không phải lỗi"  → xóa có chủ ý cũng không phải lỗi
 *   "khác màu chữ, không phải nền cả dòng"               → một khối màu làm mắt nhảy tới nó
 *
 * Không bài kiểm nào đỏ lúc đó, vì lỗi nằm ở chỗ hai lớp CSS GẶP NHAU — không ở lớp nào cả.
 */

const css = readFileSync(
  fileURLToPath(new URL('../app/man/tu-truyen.css', import.meta.url)),
  'utf8',
);

/** Thân của một luật CSS theo selector chính xác. */
function than(selector: string): string {
  const i = css.indexOf(selector + ' {');
  expect(i, `không thấy luật ${selector}`).toBeGreaterThan(-1);
  return css.slice(i + selector.length + 2, css.indexOf('}', i));
}

/** Giá trị của một thuộc tính trong thân luật. */
function thuocTinh(thanLuat: string, ten: string): string | undefined {
  return thanLuat.match(new RegExp(`(?:^|[;{\\s])${ten}:\\s*([^;]+);`))?.[1]?.trim();
}

/* Nút Xóa giờ nằm trong menu "…" của thẻ truyện (bảng xưởng cũ đã bỏ). Luật vẫn là luật cũ. */
const NGHI = '#xuong .theMenuHop .nutXoa';
const CHI_VAO = '#xuong .theMenuHop .nutXoa:hover,\n#xuong .theMenuHop .nutXoa:focus-visible';

test('lúc NGHỈ không mang màu lỗi — đỏ là màu của lỗi, xóa có chủ ý thì không', () => {
  expect(than(NGHI)).not.toContain('--red');
});

test('lúc nghỉ không tô nền — một khối màu trong menu làm mắt nhảy tới nút phá hủy', () => {
  expect(thuocTinh(than(NGHI), 'background')).toBeUndefined();
});

/**
 * Đỏ phải xuất hiện ở ĐÚNG một chỗ: khoảnh khắc người dùng chỉ vào nút.
 *
 * `:focus-visible` đi CÙNG `:hover` chứ không phải thêm cho đủ bộ: bàn phím là đường duy nhất
 * tới nút này của người không dùng chuột, và một nút phá hủy không được im lặng khi nó đang
 * là thứ sắp bị Enter.
 */
test('đỏ chỉ hiện ở hover và focus-visible', () => {
  expect(than(CHI_VAO)).toContain('--red');
});
