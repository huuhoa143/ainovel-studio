import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

import { TU_TRUYEN as T } from '@/lib/chu/tu-truyen';
import type { DapCungDung } from '@/lib/types';

/**
 * Cùng dựng giai đoạn TẠM DỪNG truyện đang mở ngay lượt đầu. Lịch sử chỉ sống trong
 * component, nên mọi lối rời khi phiên còn mở phải trả cuốn về — nếu không cuốn nằm dừng
 * chờ một cuộc bàn không ai còn giữ.
 */

const GIAI_DOAN = vi.fn<(book: string, history: unknown[]) => Promise<DapCungDung>>();
const CHOT = vi.fn<(book: string, apply: string) => Promise<{ applied: boolean }>>();
const HUY = vi.fn<(book: string) => Promise<unknown>>();
const MO_SACH = vi.fn<(history: unknown[]) => Promise<DapCungDung>>();

vi.mock('@/lib/api', async (goc) => ({
  ...(await goc<typeof import('@/lib/api')>()),
  cungDungGiaiDoan: (b: string, h: unknown[]) => GIAI_DOAN(b, h),
  chotCungDung: (b: string, a: string) => CHOT(b, a),
  huyCungDungGiaiDoan: (b: string) => HUY(b),
  cungDungMoSach: (h: unknown[]) => MO_SACH(h),
}));

const { CungDung } = await import('./CungDung');

const DAP: DapCungDung = { message: 'Rõ rồi.', raw: 'Rõ rồi.', draft: 'Chặng sau: đẩy nhịp.', ready: true };

beforeEach(() => {
  cleanup();
  for (const f of [GIAI_DOAN, CHOT, HUY, MO_SACH]) f.mockReset();
  GIAI_DOAN.mockResolvedValue(DAP);
  MO_SACH.mockResolvedValue(DAP);
  CHOT.mockResolvedValue({ applied: true });
  HUY.mockResolvedValue({});
});

function guiMotLuot() {
  fireEvent.change(screen.getByRole('textbox', { name: T.cdNhap }), { target: { value: 'đẩy nhịp lên' } });
  fireEvent.click(screen.getByRole('button', { name: /^Gửi/ }));
}

test('chưa gửi lượt nào thì không có nút hủy, và rời đi KHÔNG gọi hủy', () => {
  const { unmount } = render(<CungDung cheDo="giai-doan" tacPham="b" onXong={() => {}} />);
  expect(screen.queryByRole('button', { name: T.cdHuyBan })).toBeNull();
  unmount();
  expect(HUY).not.toHaveBeenCalled();
});

test('bấm "Thôi bàn" gọi hủy cho đúng cuốn và xóa cuộc bàn', async () => {
  render(<CungDung cheDo="giai-doan" tacPham="b" onXong={() => {}} />);
  guiMotLuot();
  await waitFor(() => expect(screen.getByText('Chặng sau: đẩy nhịp.')).toBeDefined());

  fireEvent.click(screen.getByRole('button', { name: T.cdHuyBan }));
  await waitFor(() => expect(HUY).toHaveBeenCalledWith('b'));
  await waitFor(() => expect(screen.queryByRole('button', { name: T.cdHuyBan })).toBeNull());
  expect(screen.queryByText('Chặng sau: đẩy nhịp.')).toBeNull();
});

test('rời bề mặt giữa cuộc bàn thì hủy — lịch sử mất theo, không còn đường bàn tiếp', async () => {
  const { unmount } = render(<CungDung cheDo="giai-doan" tacPham="b" onXong={() => {}} />);
  guiMotLuot();
  await waitFor(() => expect(GIAI_DOAN).toHaveBeenCalled());
  unmount();
  expect(HUY).toHaveBeenCalledWith('b');
});

test('lượt đầu hỏng vẫn để lại cuốn tạm dừng, nên rời đi vẫn hủy', async () => {
  GIAI_DOAN.mockRejectedValue(new Error('mô hình lỗi'));
  const { unmount } = render(<CungDung cheDo="giai-doan" tacPham="b" onXong={() => {}} />);
  guiMotLuot();
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('mô hình lỗi'));
  unmount();
  expect(HUY).toHaveBeenCalledWith('b');
});

test('đóng/tải lại trang giữa cuộc bàn thì hủy', async () => {
  render(<CungDung cheDo="giai-doan" tacPham="b" onXong={() => {}} />);
  guiMotLuot();
  await waitFor(() => expect(GIAI_DOAN).toHaveBeenCalled());
  window.dispatchEvent(new Event('pagehide'));
  expect(HUY).toHaveBeenCalledWith('b');
});

test('áp dụng gửi bản nháp cho CUỐN NÀY, rồi rời đi KHÔNG hủy nữa', async () => {
  const onXong = vi.fn();
  const { unmount } = render(<CungDung cheDo="giai-doan" tacPham="b" onXong={onXong} />);
  guiMotLuot();
  await waitFor(() => expect(screen.getByRole('button', { name: T.cdApDung })).toBeDefined());

  fireEvent.click(screen.getByRole('button', { name: T.cdApDung }));
  await waitFor(() => expect(onXong).toHaveBeenCalledWith('Chặng sau: đẩy nhịp.'));
  expect(CHOT).toHaveBeenCalledWith('b', 'Chặng sau: đẩy nhịp.');
  unmount();
  expect(HUY).not.toHaveBeenCalled();
});

test('mở sách (chưa có cuốn) không bao giờ gọi hủy hay áp dụng', async () => {
  const onXong = vi.fn();
  const { unmount } = render(<CungDung cheDo="mo-sach" tacPham={undefined} onXong={onXong} />);
  guiMotLuot();
  await waitFor(() => expect(MO_SACH).toHaveBeenCalled());
  expect(screen.queryByRole('button', { name: T.cdHuyBan })).toBeNull();
  unmount();
  expect(HUY).not.toHaveBeenCalled();
  expect(CHOT).not.toHaveBeenCalled();
});
