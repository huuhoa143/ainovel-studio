import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { CHU_VH } from '@/lib/chu/van-hanh';
import { CHU } from '@/lib/nhan';

import { NhapXuat } from './NhapXuat';

const XUAT = vi.fn();
const TIEP = vi.fn();
const BO = vi.fn();
vi.mock('@/lib/api', async (goc) => ({
  ...(await goc<typeof import('@/lib/api')>()),
  xuatBan: (...a: unknown[]) => XUAT(...a),
  tiepTucNhap: (...a: unknown[]) => TIEP(...a),
  boNhapDo: (...a: unknown[]) => BO(...a),
}));

afterEach(() => {
  cleanup();
  XUAT.mockReset();
  TIEP.mockReset();
  BO.mockReset();
});

test('định dạng là nhóm radio; chọn EPUB và khoảng chương rồi gửi đúng tham số', async () => {
  XUAT.mockResolvedValue({ ten: 'b.epub', boQua: [12], soChuong: 20 });
  render(<NhapXuat tacPham="b" />);
  const txt = screen.getByRole('radio', { name: /TXT/ }) as HTMLInputElement;
  expect(txt.checked).toBe(true);
  fireEvent.click(screen.getByRole('radio', { name: /EPUB/ }));
  fireEvent.change(screen.getByLabelText(CHU.tuChuong), { target: { value: '3' } });
  fireEvent.change(screen.getByLabelText(CHU.denChuong), { target: { value: '20' } });
  fireEvent.click(screen.getByRole('button', { name: CHU.taiVe }));
  expect(XUAT).toHaveBeenCalledWith('b', { format: 'EPUB', from: 3, to: 20 });
  await waitFor(() => expect(screen.getByText(CHU.daTaiVe('b.epub', 20))).toBeDefined());
  expect(screen.getByText(CHU.boQuaChuong([12]))).toBeDefined();
});

test('nhập truyện và học văn phong thu gọn mặc định', () => {
  const { container } = render(<NhapXuat tacPham="b" />);
  const gap = [...container.querySelectorAll<HTMLDetailsElement>('details.vhGapLon')];
  expect(gap).toHaveLength(2);
  expect(gap.every((d) => !d.open)).toBe(true);
  expect(gap[0]!.textContent).toContain(CHU.nhapTruyenNgoai);
  expect(gap[1]!.textContent).toContain(CHU.moPhongVanPhong);
});

test('chưa chọn truyện thì nói việc nên làm', () => {
  render(<NhapXuat tacPham={undefined} />);
  expect(screen.queryByRole('button', { name: CHU.taiVe })).toBeNull();
});

test('khoảng chương bị chặn trên bằng số chương đã xong — không phải 0', () => {
  render(<NhapXuat tacPham="b" soChuongXong={3} />);
  for (const nhan of [CHU.tuChuong, CHU.denChuong]) {
    expect((screen.getByLabelText(nhan) as HTMLInputElement).max).toBe('3');
  }
});

test('chưa biết số chương thì không đặt chặn trên', () => {
  render(<NhapXuat tacPham="b" />);
  expect((screen.getByLabelText(CHU.denChuong) as HTMLInputElement).max).toBe('');
});

/* ── lượt nhập dừng giữa chừng ─────────────────────────────────────────── */

const LOG = { log: [{ stage: 'import', text: 'xong' }], failed: false };

test('không có lượt dở thì không có nút tiếp tục hay bỏ', () => {
  render(<NhapXuat tacPham="b" nhapDo={null} />);
  expect(screen.queryByRole('button', { name: CHU_VH.tiepTucNhap })).toBeNull();
  expect(screen.queryByRole('button', { name: CHU_VH.boNhapDo })).toBeNull();
});

test('chờ duyệt cách chia: mở sẵn, chỉ có nút chấp nhận (và chia lại theo gợi ý), ẩn ô tải tệp', async () => {
  TIEP.mockResolvedValue(LOG);
  const onDoi = vi.fn();
  const { container } = render(<NhapXuat tacPham="b" nhapDo={{ phase: 'awaiting_confirm', chapters: 42, analyzed: 0 }} onDoi={onDoi} />);
  expect(container.querySelector<HTMLDetailsElement>('details.vhGapLon')!.open).toBe(true);
  expect(screen.queryByRole('button', { name: CHU.batDauNhap })).toBeNull();
  expect(screen.queryByRole('radio', { name: CHU_VH.truyenDaKet })).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: CHU_VH.chapNhanChia }));
  expect(TIEP).toHaveBeenCalledWith('b', { accept: true });
  await waitFor(() => expect(onDoi).toHaveBeenCalled());
});

test('chưa rõ truyện gốc đã kết: phải chọn một trong hai rồi mới tiếp tục, gửi đúng story', () => {
  TIEP.mockResolvedValue(LOG);
  render(<NhapXuat tacPham="b" nhapDo={{ phase: 'story_uncertain', chapters: 42, analyzed: 42 }} />);
  expect(screen.queryByRole('button', { name: CHU_VH.chapNhanChia })).toBeNull();
  const nut = screen.getByRole('button', { name: CHU_VH.tiepTucNhap }) as HTMLButtonElement;
  expect(nut.disabled).toBe(true);
  fireEvent.click(screen.getByRole('radio', { name: CHU_VH.truyenConViet }));
  fireEvent.click(nut);
  expect(TIEP).toHaveBeenCalledWith('b', { story: 'open' });
});

test('bị ngắt: nói tiến độ, một nút tiếp tục không kèm tùy chọn', () => {
  TIEP.mockResolvedValue(LOG);
  render(<NhapXuat tacPham="b" nhapDo={{ phase: 'interrupted', chapters: 42, analyzed: 10 }} />);
  expect(screen.getByText(new RegExp(CHU_VH.nhapDoTienDo(42, 10).replace('/', '\\/')))).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: CHU_VH.tiepTucNhap }));
  expect(TIEP).toHaveBeenCalledWith('b', {});
});

test('bị ngắt mà thư mục nhập hỏng: nói vì sao, KHÔNG có nút tiếp tục — chỉ còn bỏ lượt nhập', () => {
  render(<NhapXuat tacPham="b" nhapDo={{ phase: 'interrupted', chapters: 0, analyzed: 0, error: 'permission denied' }} />);
  expect(screen.getByText(/permission denied/)).toBeDefined();
  expect(screen.queryByRole('button', { name: CHU_VH.tiepTucNhap })).toBeNull();
  expect(screen.queryByRole('button', { name: CHU_VH.chapNhanChia })).toBeNull();
  expect(screen.getByRole('button', { name: CHU_VH.boNhapDo })).toBeDefined();
});

test('bỏ lượt nhập dở phải qua hộp xác nhận nói rõ truyện vẫn giữ', async () => {
  BO.mockResolvedValue({ discarded: true });
  const onDoi = vi.fn();
  render(<NhapXuat tacPham="b" nhapDo={{ phase: 'interrupted', chapters: 42, analyzed: 10 }} onDoi={onDoi} />);
  fireEvent.click(screen.getByRole('button', { name: CHU_VH.boNhapDo }));
  expect(BO).not.toHaveBeenCalled();
  expect(screen.getByText(CHU_VH.boNhapDoThan)).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: CHU_VH.boNhapDoLam }));
  expect(BO).toHaveBeenCalledWith('b');
  await waitFor(() => expect(onDoi).toHaveBeenCalled());
});

test('bỏ hỏng (409 khi một bước đang chạy) thì hiện câu của server', async () => {
  const { LoiApi } = await import('@/lib/api');
  BO.mockRejectedValue(new LoiApi('một bước nhập đang chạy', 409));
  render(<NhapXuat tacPham="b" nhapDo={{ phase: 'awaiting_confirm', chapters: 42, analyzed: 0 }} />);
  fireEvent.click(screen.getByRole('button', { name: CHU_VH.boNhapDo }));
  fireEvent.click(screen.getByRole('button', { name: CHU_VH.boNhapDoLam }));
  await waitFor(() => expect(screen.getByText('một bước nhập đang chạy')).toBeDefined());
});
