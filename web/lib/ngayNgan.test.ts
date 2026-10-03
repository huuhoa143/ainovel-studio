import { expect, test } from 'vitest';

import { ngayNgan } from './dinhdang';

const BAY = new Date(2026, 9, 2, 16, 25);
const luc = (y: number, m: number, d: number, h = 21, p = 36) => new Date(y, m, d, h, p).toISOString();

test('hôm nay: không in ngày — giờ là đủ', () => {
  expect(ngayNgan(luc(2026, 9, 2, 0, 5), BAY)).toBeUndefined();
});

test('hôm qua, cùng năm, khác năm', () => {
  expect(ngayNgan(luc(2026, 9, 1), BAY)).toBe('hôm qua');
  expect(ngayNgan(luc(2026, 7, 8), BAY)).toBe('08/08');
  expect(ngayNgan(luc(2025, 11, 31), BAY)).toBe('31/12/25');
});

test('mốc hỏng hoặc vắng: không in gì', () => {
  expect(ngayNgan(undefined, BAY)).toBeUndefined();
  expect(ngayNgan('không phải ngày', BAY)).toBeUndefined();
});
