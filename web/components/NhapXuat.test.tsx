import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { CHU } from '@/lib/nhan';

import { NhapXuat } from './NhapXuat';

const XUAT = vi.fn();
vi.mock('@/lib/api', async (goc) => ({
  ...(await goc<typeof import('@/lib/api')>()),
  xuatBan: (...a: unknown[]) => XUAT(...a),
}));

afterEach(() => {
  cleanup();
  XUAT.mockReset();
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
