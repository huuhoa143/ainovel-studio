import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from 'vitest';

/**
 * Luật ngăn kéo (rail ở màn hình hẹp) phải thắng được `.rail.truot`.
 *
 * Truy vấn media KHÔNG cộng độ đặc hiệu, nên `@media (max-width: 860px) { .rail }` là (0,1,0)
 * và thua `.rail.truot { position: relative }` (0,2,0) ở globals.css — lớp `truot` là dấu
 * trượt chỉ mục đang mở, nó có mặt trên MỌI lần vẽ rail.
 *
 * ĐO ĐƯỢC: ngăn tính ra `position: relative`, nên nó ở lại trong dòng chảy và cao đúng bằng
 * phần nội dung lưới kẹp lại — 227px thay vì kín màn hình 844px. Chữ vẫn đúng, nút vẫn bấm
 * được, nên không chỗ nào kêu; chỉ là hai phần ba cây điều hướng bị cắt mất.
 *
 * Bài kiểm đọc CSS vì jsdom không bố cục và không giải thác được truy vấn media — nó canh
 * đúng thứ duy nhất canh được: luật có kể tên `.rail.truot` hay không.
 */
const css = (ten: string) => readFileSync(join(__dirname, '..', 'app', ten), 'utf8');

test('luật `position: fixed` của ngăn kéo kể cả `.rail.truot`', () => {
  // Khẳng định TIỀN ĐỀ chứ không giả định nó: nếu `.rail.truot` thôi đặt `position` thì bài
  // này thành vô nghĩa và phải được đọc lại, chứ không được im lặng xanh.
  expect(css('globals.css'), '`.rail.truot` không còn đặt position — đọc lại bài kiểm này').toMatch(
    /\.rail\.truot\s*\{[^}]*position:\s*relative/,
  );

  const he = css('he.css');
  const khoi = he.slice(he.indexOf('@media (max-width: 860px)'));
  const luat = khoi.match(/\.rail,\s*\n\s*\.rail\.truot\s*\{([^}]*)\}/);
  expect(luat, 'luật ngăn phải kể cả `.rail.truot`, nếu không nó thua về độ đặc hiệu').not.toBeNull();
  expect(luat![1]).toMatch(/position:\s*fixed/);
});
