import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';

import { CHU_VH } from '@/lib/chu/van-hanh';
import { GIAI_THICH } from '@/lib/nhan';
import type { UsageTotals } from '@/lib/types';

import { ChiPhiXuong } from './ChiPhiXuong';
import { tongGia, tongSach } from './mau.test-helper';

afterEach(cleanup);

function t(cost: number, saved = 0): UsageTotals {
  return {
    input: 0,
    output: 0,
    cache_read: 0,
    cache_write: 0,
    cost_usd: cost,
    saved_usd: saved,
    cache_capable: true,
    cache_breaks: 0,
  };
}

test('ô "Truyện có số liệu" mang mẫu số của mọi con số tiền', () => {
  const { container } = render(
    <ChiPhiXuong
      tong={tongGia({
        books: [tongSach({ id: 'a' }), tongSach({ id: 'b' }), tongSach({ id: 'c' })],
        overall: t(7.37, 2),
        per_agent: { writer: t(4.18) },
        per_model: { 'gemini-2.5-pro': t(7.37) },
        counted: 1,
      })}
    />,
  );
  const o = [...container.querySelectorAll('.vhO')].map((e) => e.textContent);
  expect(o[0]).toContain('$7,37');
  expect(o[2]).toContain('1/3');
  expect(o[2]).toContain(CHU_VH.truyenCoSoLieuPhu(2));
});

test('model tốn hơn vai tốn nhất vẫn chỉ đầy 100% — mỗi nhóm một mốc', () => {
  // Ca thật đã gặp: một mốc chung cho hai nhóm làm thanh model tính ra 176%.
  const { container } = render(
    <ChiPhiXuong
      tong={tongGia({
        books: [tongSach()],
        overall: t(7.37),
        per_agent: { writer: t(4.18), editor: t(3.19) },
        per_model: { 'gemini-2.5-pro': t(7.37) },
        counted: 1,
      })}
    />,
  );
  const thanh = [...container.querySelectorAll<HTMLElement>('.vhBoThanh > span')].map(
    (e) => e.style.width,
  );
  expect(thanh).toContain('100%');
  expect(thanh.every((w) => parseFloat(w) <= 100)).toBe(true);
});

test('thiếu usage thì cảnh báo đứng ngay dưới ô số', () => {
  render(
    <ChiPhiXuong
      tong={tongGia({ books: [tongSach()], overall: t(1), counted: 1, missing_assistant_usage: 3 })}
    />,
  );
  expect(screen.getByText(GIAI_THICH.chiPhiXuongThieuUsage(3))).toBeDefined();
});

test('đang tải nói đúng việc đang làm, không mượn câu "đang mở truyện"', () => {
  render(<ChiPhiXuong tong={{ du: undefined, loi: undefined, dangTai: true }} />);
  expect(screen.getByText(CHU_VH.dangCongChiPhi)).toBeDefined();
});
