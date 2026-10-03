import { expect, test } from 'vitest';

import { TU_TRUYEN } from './chu/tu-truyen';

/**
 * Ý tưởng mẫu là MỘT danh sách, dùng ở hai bề mặt: "Viết truyện mới" và "Bàn ý tưởng".
 *
 * Bàn ý tưởng từng cắt `slice(0, 4)` mà không ghi lý do, nên hai bề mặt gần như cùng một
 * việc lại mời khác nhau — "Kinh dị" và "Lịch sử" biến mất ở một bên. Và cái cắt ấy theo
 * THỨ TỰ MẢNG: thêm một thể loại vào đầu danh sách sẽ lặng lẽ đẩy một thể loại khác ra.
 */
test('mỗi ý tưởng mẫu có một thể loại riêng và một câu đủ cụ thể để AI làm việc được', () => {
  const ds = TU_TRUYEN.yTuongMau;
  expect(ds.length).toBeGreaterThanOrEqual(6);
  expect(new Set(ds.map((m) => m.the)).size).toBe(ds.length);
  for (const m of ds) {
    // Câu mẫu dạy người dùng một yêu cầu tốt trông ra sao, nên nó phải nói được nhịp,
    // nhân vật và giọng — một câu ba chữ không làm nổi việc đó.
    expect(m.cau.length, m.the).toBeGreaterThan(120);
  }
});
