import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { DIEU_KHIEN } from '@/lib/chu/tien-do';
import type { Snapshot } from '@/lib/types';

import { snap } from './mau.test-helper';

/**
 * Nút điều khiển giữ trạng thái "đang làm" cho tới khi ENGINE đổi trạng thái — không phải tới khi
 * HTTP trả lời. Lỗi gặp trên truyện thật: `POST /run` trả 200 ngay, nút quay về "Tiếp tục viết"
 * trong lúc engine chưa kịp đổi, người dùng bấm lại và lần thứ hai bị từ chối.
 */
const CHAY = vi.fn(() => Promise.resolve({}));
const DUNG = vi.fn(() => Promise.resolve({}));
const DOI = vi.fn(() => Promise.resolve({ mode: 'review' }));

vi.mock('@/lib/api', async (goc) => ({
  ...(await goc<typeof import('@/lib/api')>()),
  chaySach: () => CHAY(),
  dungSach: () => DUNG(),
  doiCheDoTien: () => DOI(),
}));

const { DieuKhien } = await import('./DieuKhien');

afterEach(() => {
  cleanup();
  CHAY.mockClear();
  DUNG.mockClear();
  vi.useRealTimers();
});

const ve = (p: Partial<Snapshot>, dangChay = false) => (
  <DieuKhien snapshot={snap(p)} tacPham="tran-yeu-ky" choGhi dangChay={dangChay} onDoi={() => {}} />
);
const DUNG_DO = { runtime: 'paused', advance: { mode: 'auto', hold: false } } as Partial<Snapshot>;

test('HTTP xong mà engine chưa đổi: nút vẫn "Đang bắt đầu…", khóa, aria-busy', async () => {
  render(ve(DUNG_DO));
  fireEvent.click(screen.getByRole('button', { name: /Tiếp tục viết/ }));
  await waitFor(() => expect(CHAY).toHaveBeenCalledOnce());
  await act(async () => {});
  const nut = screen.getByRole('button', { name: DIEU_KHIEN.dangLam.chay });
  expect((nut as HTMLButtonElement).disabled).toBe(true);
  expect(nut.getAttribute('aria-busy')).toBe('true');
});

test('engine đổi sang running: nút nhả và thành Dừng', async () => {
  const { rerender } = render(ve(DUNG_DO));
  fireEvent.click(screen.getByRole('button', { name: /Tiếp tục viết/ }));
  await waitFor(() => expect(CHAY).toHaveBeenCalledOnce());
  await act(async () => {});
  rerender(ve({ ...DUNG_DO, runtime: 'running' }, true));
  const dung = await screen.findByRole('button', { name: /Tạm dừng/ });
  expect((dung as HTMLButtonElement).disabled).toBe(false);
  expect(dung.getAttribute('aria-busy')).toBeNull();
});

test('đang thu dọn sau Dừng: nút Chạy nói "Đang dừng…" và không bấm được', () => {
  render(ve({ ...DUNG_DO, runtime: 'pausing' }));
  const nut = screen.getByRole('button', { name: DIEU_KHIEN.dangDungHan });
  expect((nut as HTMLButtonElement).disabled).toBe(true);
  expect(nut.getAttribute('aria-busy')).toBe('true');
});

test('engine nhận lệnh mà trạng thái đứng yên quá lâu: nút tự nhả, không kẹt mãi', async () => {
  vi.useFakeTimers();
  render(ve(DUNG_DO));
  fireEvent.click(screen.getByRole('button', { name: /Tiếp tục viết/ }));
  await act(async () => {});
  expect(screen.getByRole('button', { name: DIEU_KHIEN.dangLam.chay })).toBeDefined();
  await act(async () => {
    vi.advanceTimersByTime(21_000);
  });
  expect(screen.getByRole('button', { name: /Tiếp tục viết/ })).toBeDefined();
});

test('đổi chế độ xong: không nút nào còn "Đang đổi…", và nhãn ấy chỉ thuộc nút được bấm', async () => {
  const { rerender } = render(ve({ runtime: 'running', advance: { mode: 'auto', hold: false } }, true));
  fireEvent.click(screen.getByRole('button', { name: /Duyệt từng chương|Từng chương/ }));
  await act(async () => {});
  expect(DOI).toHaveBeenCalledOnce();
  // Chế độ đã đổi trên engine, lệnh chưa kịp nhả: nút "Liên tục" giờ là nút CHƯA bật.
  rerender(ve({ runtime: 'running', advance: { mode: 'review', hold: false } }, true));
  const lienTuc = screen.getByRole('button', { name: /Tự viết liên tục|Liên tục/ });
  expect(lienTuc.textContent).not.toContain(DIEU_KHIEN.dangLam.chedo);
});
