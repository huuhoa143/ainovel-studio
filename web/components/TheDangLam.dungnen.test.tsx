import { expect, test } from 'vitest';

import type { StreamEvent } from '@/lib/types';

import { buocDungNen } from './TheDangLam';

const ev = (summary: string, seq: number): StreamEvent => ({ seq, time: '', kind: 'event', summary });

test('dải dựng nền tiến theo các lần save_foundation thấy được', () => {
  expect(buocDungNen([])).toEqual({ hienTai: 0, dangLam: true, vuaXong: undefined });
  expect(buocDungNen([ev('save_foundation[premise]', 1)]).hienTai).toBe(1);
  const b = buocDungNen([
    ev('save_foundation[premise]', 1),
    ev('save_foundation[characters]', 2),
    ev('novel_context', 3),
    ev('save_foundation[world_rules]', 4),
  ]);
  expect(b).toMatchObject({ hienTai: 3, vuaXong: 2 });
  // Lưu dàn ý xong thì đứng ở chặng cuối, không vượt ra ngoài dải.
  expect(buocDungNen([ev('save_foundation[outline]', 5)]).hienTai).toBe(3);
});

test('sửa nền theo góp ý (lưu lại nhân vật SAU dàn ý) không kéo dải lùi', () => {
  const b = buocDungNen([ev('save_foundation[outline]', 1), ev('save_foundation[characters]', 2)]);
  expect(b.hienTai).toBe(3);
});
