import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { snap } from '@/components/mau.test-helper';
import type { CauHinhDoc } from '@/lib/types';
import type { Studio } from '@/lib/useStudio';
import { BO_DEM_RONG } from '@/lib/vanSong';

/**
 * MẮT CUỐI của sợi dây cấu hình: `page.tsx` có thật sự truyền `may.hoiLai` xuống
 * `CauHinhXuong` không.
 *
 * # Vì sao bài kiểm này phải dựng cả `Trang`
 *
 * `lib/useMay.test.tsx` đã chứng minh `hoiLai` hỏi lại được, và `CauHinhXuong` gọi
 * `onDoiCauHinh` sau khi lưu. Cả hai nửa đúng mà sợi dây vẫn có thể đứt ở giữa — và nó ĐÃ
 * đứt: đo bằng đột biến, gỡ `onDoiCauHinh={may.hoiLai}` khỏi `page.tsx` thì **212/212 vẫn
 * xanh và `tsc` cũng xanh** (prop là tùy chọn). Đây là lần thứ năm trong dự án này mà mắt
 * cuối một sợi dây không ai chạm tới.
 *
 * Hư hại nếu nó đứt lại: người dùng mới nhập khóa API xong KẸT ở màn "Cài đặt lần đầu" —
 * `page.tsx` chặn toàn bộ studio sau `canCaiDat`, và không gì trên màn hình nói cho họ biết
 * phải tải lại trang. ĐO ĐƯỢC trên một máy sạch trước khi vá.
 */

const HOI_LAI = vi.fn();

const CAU_HINH: CauHinhDoc = {
  needs_setup: true,
  path: '/tmp/x/.ainovel/config.json',
  provider: '',
  model: '',
  style: '',
  styles: [],
  role_names: [],
  providers: [],
  presets: [],
  engine_open: [],
};

const LUU = vi.fn<() => Promise<{ saved: boolean; path: string; reopen_to_apply: string[] }>>();

vi.mock('@/lib/api', async (goc) => ({
  ...(await goc<typeof import('@/lib/api')>()),
  layCauHinh: () => Promise.resolve(CAU_HINH),
  luuCauHinh: () => LUU(),
}));

vi.mock('@/lib/useStudio', () => ({
  useStudio: (): Studio =>
    ({
      workshop: { root: '/w', books: [] },
      tacPham: undefined,
      snapshot: snap({}),
      hoSo: undefined,
      chuongChon: undefined,
      khu: 'cau-hinh',
      song: undefined,
      suKien: [],
      vanSong: BO_DEM_RONG,
      ketNoi: 'khong',
      dangTai: false,
      loi: undefined,
      chonTacPham: () => {},
      chonChuong: () => {},
      chonKhu: () => {},
      moTacPhamVuaTao: () => {},
      moTacPhamTai: () => {},
      docChuong: () => {},
      lamMoi: () => {},
      taiLai: () => {},
    }) as unknown as Studio,
}));

// `canCaiDat: true` — đúng ca mà `page.tsx` chặn toàn bộ studio.
vi.mock('@/lib/useMay', () => ({
  useMay: () => ({ canCaiDat: true, daHoi: true, hoiLai: HOI_LAI }),
}));

Element.prototype.scrollIntoView = function () {
  /* jsdom không bố cục */
};

const { default: Trang } = await import('./page');

test('lưu khóa API xong thì `Trang` HỎI LẠI cấu hình — không bắt người dùng F5', async () => {
  HOI_LAI.mockReset();
  LUU.mockReset().mockResolvedValue({ saved: true, path: CAU_HINH.path, reopen_to_apply: [] });

  render(<Trang />);
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeDefined());

  // Biểu mẫu thêm nhà cung cấp hiện ngay ở ca `lanDau` với 0 nhà cung cấp.
  const ten = document.querySelector<HTMLInputElement>('input[placeholder="openrouter"]');
  const khoa = document.querySelector<HTMLInputElement>('input[type="password"]');
  expect(ten, 'không thấy ô tên nhà cung cấp — bề mặt cài lần đầu đã đổi').not.toBeNull();

  fireEvent.change(ten!, { target: { value: 'thu' } });
  if (khoa) fireEvent.change(khoa, { target: { value: 'sk-khoa-gia' } });
  // Lần đầu, nhà cung cấp này thành mặc định — phải có một model thì mới lưu được.
  const themModel = screen.getByPlaceholderText(/Gõ tên rồi nhấn Enter/);
  fireEvent.change(themModel, { target: { value: 'm1' } });
  fireEvent.keyDown(themModel, { key: 'Enter' });
  fireEvent.click(screen.getByRole('button', { name: /^Lưu$/ }));

  await waitFor(() => expect(LUU).toHaveBeenCalled());
  await waitFor(() =>
    expect(
      HOI_LAI,
      'lưu xong mà `Trang` không hỏi lại /api/config — người dùng sẽ kẹt ở màn cài đặt',
    ).toHaveBeenCalled(),
  );
});
