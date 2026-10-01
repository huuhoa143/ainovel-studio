import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { CHU_VH } from '@/lib/chu/van-hanh';
import { CHU, GIAI_THICH } from '@/lib/nhan';
import type { SettingsDoc } from '@/lib/types';

import { CaiDat } from './CaiDat';

const LAY = vi.fn<(b: string) => Promise<SettingsDoc>>();
vi.mock('@/lib/api', async (goc) => ({
  ...(await goc<typeof import('@/lib/api')>()),
  layCaiDat: (b: string) => LAY(b),
  // Dải kênh vai không thuộc bài này: để nó chờ mãi, không gọi mạng.
  layVaiModel: () => new Promise<never>(() => {}),
}));

afterEach(() => {
  cleanup();
  LAY.mockReset();
});

function doc(p: Partial<SettingsDoc> = {}): SettingsDoc {
  return {
    state: 'ready',
    writable: false,
    started_at: '2026-08-06T22:18:15+07:00',
    provider: '9Router',
    model: 'cx/gpt-5.6-luna',
    style: 'default',
    planning_tier: 'long',
    advance_mode: 'auto',
    advance_permit_chapter: 0,
    advance_hold: null,
    pending_steer: '',
    start_prompt: 'Viết truyện mạt thế',
    plan_start: {
      planner: 'architect_long',
      planner_task: 'Yêu cầu sáng tác dài',
      decision_id: 'dec-e36ce44a2c19',
    },
    ...p,
  } as SettingsDoc;
}

test('khóa–giá trị theo nhóm, mỗi khóa kèm câu giải thích', async () => {
  LAY.mockResolvedValue(doc());
  const { container } = render(<CaiDat tacPham="b" />);
  await waitFor(() => expect(container.querySelector('.vhPhien')).not.toBeNull());
  const nhom = [...container.querySelectorAll('.vhNhom > h2')].map((h) => h.textContent);
  expect(nhom).toEqual([
    CHU.khoiDongVoi,
    CHU.tienChuong,
    CHU.yeuCauKhoiTao,
    CHU.phanQuyetKhoiDong,
  ]);
  expect(screen.getByText(CHU_VH.giaiModel)).toBeDefined();
  expect(screen.getByText('cx/gpt-5.6-luna').className).toBe('ma');
});

test('người lên kế hoạch đọc ra tên Việt; việc đã giao gập sẵn', async () => {
  LAY.mockResolvedValue(doc());
  const { container } = render(<CaiDat tacPham="b" />);
  await waitFor(() => expect(container.querySelector('.vhPhien')).not.toBeNull());
  expect(screen.getByText('Kiến trúc sư · truyện dài')).toBeDefined();
  const gap = container.querySelector('details.vhGap') as HTMLDetailsElement;
  expect(gap.open).toBe(false);
  expect(gap.textContent).toContain('Yêu cầu sáng tác dài');
});

test('chế độ duyệt mà chưa cho phép chương nào: nói thành câu, AI đang chờ bạn', async () => {
  LAY.mockResolvedValue(doc({ advance_mode: 'review' }));
  render(<CaiDat tacPham="b" />);
  await waitFor(() => expect(screen.getByText(CHU.chuaCapPhepChuongNao)).toBeDefined());
  expect(screen.getByText(GIAI_THICH.caiDatCapPhepReview)).toBeDefined();
});

test('góp ý chưa xử lý hiện ra; bề mặt chỉ đọc nói vì sao', async () => {
  LAY.mockResolvedValue(doc({ pending_steer: 'cho nhân vật nghỉ một chương' }));
  render(<CaiDat tacPham="b" />);
  await waitFor(() => expect(screen.getByText('cho nhân vật nghỉ một chương')).toBeDefined());
  expect(screen.getByText(GIAI_THICH.caiDatChiDoc)).toBeDefined();
});
