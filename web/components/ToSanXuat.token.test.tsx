import { cleanup, render, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { CHU_VH } from '@/lib/chu/van-hanh';
import type { CostDoc, UsageTotals } from '@/lib/types';

import { snap } from './mau.test-helper';

/**
 * Nhóm AI đọc token theo vai (cùng nguồn với Chi phí) và vai đang làm từ `vaiHienTai`. Đo được
 * trên truyện thật: Kiến trúc sư dựng nền tiêu 523k token mà thẻ ghi "Chưa làm việc".
 */
const LAY = vi.fn<(b: string) => Promise<CostDoc>>();
vi.mock('@/lib/api', async (goc) => ({
  ...(await goc<typeof import('@/lib/api')>()),
  layChiPhi: (b: string) => LAY(b),
}));
const { ToSanXuat } = await import('./ToSanXuat');

afterEach(() => {
  cleanup();
  LAY.mockReset();
});

const t = (input: number): UsageTotals => ({
  input,
  output: 0,
  cache_read: 0,
  cache_write: 0,
  cost_usd: 0,
  saved_usd: 0,
  cache_capable: false,
  cache_breaks: 0,
});

function the(container: HTMLElement, ten: string): HTMLElement {
  return [...container.querySelectorAll('.vhVai')].find(
    (e) => e.querySelector('h2')?.textContent === ten,
  ) as HTMLElement;
}

test('vai đã tiêu token (architect_short) là "Đã làm việc", dù chưa sở hữu chương nào', async () => {
  LAY.mockResolvedValue({
    state: 'ready',
    updated_at: '',
    overall: t(523868),
    per_agent: { architect_short: t(522682), arbiter: t(1186) },
    per_model: {},
    missing_assistant_usage: 0,
  } as CostDoc);
  const { container } = render(<ToSanXuat snapshot={snap({})} tacPham="b" />);
  await waitFor(() =>
    expect(within(the(container, 'Kiến trúc sư')).getByText(CHU_VH.daLam)).toBeDefined(),
  );
  expect(within(the(container, 'Người viết')).getByText(CHU_VH.chuaLam)).toBeDefined();
});

test('vai đang làm lấy từ cây vai engine khai, không từ transport.agent đã cũ', () => {
  LAY.mockReturnValue(new Promise(() => {}));
  const { container } = render(
    <ToSanXuat
      tacPham="b"
      snapshot={snap({
        runtime: 'running',
        agents: [{ role: 'editor', state: 'working', tool: 'read_chapter', depth: 0 }],
        transport: { state: 'running', cost_usd: 0, agent: 'writer' },
      })}
    />,
  );
  expect(the(container, 'Biên tập viên').dataset.lam).toBe('dang');
  expect(the(container, 'Người viết').dataset.lam).not.toBe('dang');
});
