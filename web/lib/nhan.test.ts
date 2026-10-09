import { expect, test } from 'vitest';

import { nhanPhanQuyet } from './nhan';

test('volume_end đọc nhãn theo HÀNH ĐỘNG, không gọi mọi thứ là "chốt cuối tập"', () => {
  // Ba ca đo được trong output/: kết truyện (cả truyện ngắn không có tập), mở tập, và mã lạ.
  expect(nhanPhanQuyet('volume_end', { action: 'complete_book' }).giai).toBe('kết truyện');
  expect(nhanPhanQuyet('volume_end', { action: 'append_volume', volume: 4 }).giai).toBe('mở tập mới');
  expect(nhanPhanQuyet('volume_end', { action: 'mark_final' }).giai).toBe('chốt cuối tập');
  expect(nhanPhanQuyet('volume_end').giai).toBe('chốt cuối tập');
  // Loại khác không bị đụng tới.
  expect(nhanPhanQuyet('intervention', { action: 'complete_book' }).giai).toBe('xử lý góp ý');
});
