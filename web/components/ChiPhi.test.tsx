import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { CHU_VH } from '@/lib/chu/van-hanh';
import { CHU } from '@/lib/nhan';
import type { CostDoc, UsageTotals } from '@/lib/types';

import { ChiPhi } from './ChiPhi';
import { snap } from './mau.test-helper';

/**
 * Màn Chi phí của một truyện. Số liệu lấy theo hình của truyện thật `viet-truyen-mat-the-2`:
 * Writer ăn hơn 90% tổng, và có 5 lượt gọi không báo số liệu.
 */
const LAY = vi.fn<(b: string) => Promise<CostDoc>>();
vi.mock('@/lib/api', async (goc) => ({
  ...(await goc<typeof import('@/lib/api')>()),
  layChiPhi: (b: string) => LAY(b),
}));

afterEach(() => {
  cleanup();
  LAY.mockReset();
});

function t(cost: number, saved = 0): UsageTotals {
  return {
    input: 1000,
    output: 100,
    cache_read: 10,
    cache_write: 0,
    cost_usd: cost,
    saved_usd: saved,
    cache_capable: true,
    cache_breaks: 0,
  };
}

function doc(p: Partial<CostDoc> = {}): CostDoc {
  return {
    state: 'ready',
    updated_at: '2026-08-08T10:43:27Z',
    overall: { ...t(128.25, 149.99), cache_breaks: 206 },
    per_agent: { writer: t(116.93), editor: t(6.06), arbiter: t(0) },
    per_model: { 'openai/gpt-5.5': t(96.08), 'openai/gpt-5.6-luna': t(22.95) },
    missing_assistant_usage: 5,
    ...p,
  };
}

function ve(d: CostDoc) {
  LAY.mockResolvedValue(d);
  return render(
    <ChiPhi
      tacPham="viet-truyen-mat-the-2"
      snapshot={snap({
        book: { ...snap({}).book, completed_chapters: 725 },
        transport: { state: 'idle', cost_usd: 128.25, cost_per_chapter: 0.177 },
      })}
    />,
  );
}

test('ba ô số: tổng, giá mỗi chương, bộ đệm tiết kiệm — mỗi ô kèm mẫu số', async () => {
  const { container } = ve(doc());
  await waitFor(() => expect(container.querySelector('.vhSo')).not.toBeNull());
  const o = [...container.querySelectorAll('.vhO')].map((e) => e.textContent);
  expect(o).toHaveLength(3);
  expect(o[0]).toContain('$128,25');
  expect(o[0]).toContain(CHU_VH.daTieuTren(725));
  expect(o[1]).toContain('$0,177');
  expect(o[2]).toContain('$149,99');
});

test('thanh theo vai: tốn nhất lên đầu, thanh đầy theo mục lớn nhất, phần trăm theo TỔNG', async () => {
  const { container } = ve(doc());
  await waitFor(() => expect(container.querySelector('.vhBoHang')).not.toBeNull());
  const vai = container.querySelectorAll('.vhBo')[0]!;
  const hang = [...vai.querySelectorAll('.vhBoHang')];
  expect(hang.map((h) => h.querySelector('.vhBoTen')?.textContent)).toEqual([
    'Người viết',
    'Biên tập viên',
    'Điều phối',
  ]);
  const rong = hang.map((h) => (h.querySelector('.vhBoThanh > span') as HTMLElement).style.width);
  expect(rong[0]).toBe('100%');
  expect(rong[2]).toBe('0%');
  // 116,93 / 128,25 = 91% — phần của tổng, không phải của thanh dài nhất.
  expect(hang[0]!.textContent).toContain(CHU_VH.phanTong('91%'));
});

test('mỗi nhóm có mốc riêng: model tốn nhất cũng đầy đúng 100%, không tràn', async () => {
  const { container } = ve(doc({ per_agent: { writer: t(10) } }));
  await waitFor(() => expect(container.querySelectorAll('.vhBo')).toHaveLength(2));
  const model = container.querySelectorAll('.vhBo')[1]!;
  const dau = model.querySelector('.vhBoThanh > span') as HTMLElement;
  expect(dau.style.width).toBe('100%');
});

test('thiếu số liệu thì nói ra ngay dưới ô số; đủ thì nói là đủ', async () => {
  const { container, unmount } = ve(doc());
  await waitFor(() => expect(container.querySelector('.vhTin')).not.toBeNull());
  expect(screen.getByText(CHU_VH.thieuLuot(5))).toBeDefined();
  unmount();
  const lai = ve(doc({ missing_assistant_usage: 0 }));
  await waitFor(() => expect(lai.container.querySelector('.vhTin')).not.toBeNull());
  expect(screen.getByText(CHU_VH.soLieuDayDu)).toBeDefined();
});

test('bảng token nằm trong "Xem chi tiết" và đóng sẵn', async () => {
  const { container } = ve(doc());
  await waitFor(() => expect(container.querySelector('.vhChiTiet')).not.toBeNull());
  const chiTiet = container.querySelector('details.vhChiTiet') as HTMLDetailsElement;
  expect(chiTiet.open).toBe(false);
  expect(chiTiet.querySelector('table.bangcp')).not.toBeNull();
  expect(chiTiet.textContent).toContain(CHU.tongChung);
});

test('model dùng token mà giá 0 → "Chưa biết giá", không in "$0,00" và không nói "đủ"', async () => {
  // Đo được trên kiraai · kira-mini-1.0: 523k token, cost_usd 0, mà màn in "$0,00" kèm "Số liệu
  // đầy đủ". Không biết giá khác hẳn miễn phí.
  const { container } = ve(
    doc({
      overall: { ...t(0), input: 523868, output: 62928 },
      per_agent: { architect: t(0) },
      per_model: { 'openai/kira-mini-1.0': t(0) },
      missing_assistant_usage: 0,
    }),
  );
  await waitFor(() => expect(container.querySelector('.vhSo')).not.toBeNull());
  const o0 = container.querySelectorAll('.vhO')[0]!.textContent ?? '';
  expect(o0).toContain(CHU_VH.chuaBietGia);
  expect(o0).not.toContain('$0,00');
  const tin = container.querySelector('.vhTin')!.textContent ?? '';
  expect(tin).toContain('kira-mini-1.0');
  expect(tin).not.toContain(CHU_VH.soLieuDayDu);
});
