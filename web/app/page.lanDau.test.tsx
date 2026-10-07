import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { snap } from '@/components/mau.test-helper';
import { CH } from '@/lib/chu/cau-hinh';
import { CHU } from '@/lib/nhan';
import type { CauHinhDoc } from '@/lib/types';
import type { Studio } from '@/lib/useStudio';
import { BO_DEM_RONG } from '@/lib/vanSong';

/**
 * Lần đầu mở app (bản desktop: chưa có `config.json`): cả hành trình, với `useMay` THẬT.
 *
 * `page.cauhinh.test.tsx` giả `useMay` để soi đúng một mắt (prop `hoiLai` có được truyền
 * xuống không). Bài này để `useMay` chạy thật và chỉ giả mạng, vì lời hứa với người dùng là
 * cả chuỗi: mở app → thấy ngay màn nhập khóa kèm câu giải thích → lưu → vào studio, KHÔNG
 * tải lại trang. Mỗi mắt đúng riêng mà chuỗi vẫn đứt được ở chỗ nối.
 */

const CHUA_CAI: CauHinhDoc = {
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

const DA_CAI: CauHinhDoc = {
  ...CHUA_CAI,
  needs_setup: false,
  provider: 'thu',
  model: 'm1',
  providers: [{ name: 'thu', type: 'openai', api_key_set: true, models: [{ name: 'm1' }] }],
};

/** Tờ cấu hình server đang giữ — lưu xong thì đổi, như server thật. */
let hienTai: CauHinhDoc = CHUA_CAI;
const LAY = vi.fn(() => Promise.resolve(hienTai));
const LUU = vi.fn(() => {
  hienTai = DA_CAI;
  return Promise.resolve({ saved: true, path: CHUA_CAI.path, reopen_to_apply: [] as string[] });
});

vi.mock('@/lib/api', async (goc) => ({
  ...(await goc<typeof import('@/lib/api')>()),
  LA_MOCK: false,
  layCauHinh: () => LAY(),
  luuCauHinh: () => LUU(),
}));

// Xưởng rỗng: cài xong thì studio dẫn thẳng vào tạo tác phẩm — bằng chứng đã qua cửa cài đặt.
vi.mock('@/lib/useStudio', () => ({
  useStudio: (): Studio =>
    ({
      workshop: { root: '/w', books: [] },
      tacPham: undefined,
      snapshot: snap({}),
      hoSo: undefined,
      chuongChon: undefined,
      khu: 'xuong',
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

Element.prototype.scrollIntoView = function () {
  /* jsdom không bố cục */
};

const { default: Trang } = await import('./page');

test('needs_setup: mở thẳng màn khóa API kèm câu giải thích; lưu xong vào studio không cần tải lại', async () => {
  // Cùng một lần `render` từ đầu tới cuối: chuyển màn xảy ra trong cây đang sống, tức không
  // có lần tải lại trang nào xen vào.
  render(<Trang />);

  // Mở app là thấy ngay màn nhập khóa, không phải studio trống.
  await waitFor(() =>
    expect(screen.getByRole('heading', { level: 1, name: CH.tieuDeLanDau })).toBeDefined(),
  );
  // Câu giải thích khóa API là gì, dán vào đâu — cho người chưa từng dùng.
  expect(screen.getByText(CH.goiYKhoaLanDau)).toBeDefined();
  expect(screen.getByText(CH.goiYKhoaLanDau).textContent).toContain(CH.khoaApi);
  expect(screen.getByText(CH.goiYKhoaLanDau).textContent).toContain(CH.buoc2);

  // Biểu mẫu chỉ dựng sau khi tờ cấu hình về.
  await waitFor(() => expect(document.querySelector('input[placeholder="openrouter"]')).not.toBeNull());
  const ten = document.querySelector<HTMLInputElement>('input[placeholder="openrouter"]');
  const khoa = document.querySelector<HTMLInputElement>('input[type="password"]');
  expect(ten, 'không thấy ô tên nhà cung cấp — bề mặt cài lần đầu đã đổi').not.toBeNull();
  expect(khoa, 'không thấy ô khóa API — bề mặt cài lần đầu đã đổi').not.toBeNull();
  fireEvent.change(ten!, { target: { value: 'thu' } });
  fireEvent.change(khoa!, { target: { value: 'sk-khoa-gia' } });
  const themModel = screen.getByPlaceholderText(/Gõ tên rồi nhấn Enter/);
  fireEvent.change(themModel, { target: { value: 'm1' } });
  fireEvent.keyDown(themModel, { key: 'Enter' });
  fireEvent.click(screen.getByRole('button', { name: /^Lưu$/ }));

  await waitFor(() => expect(LUU).toHaveBeenCalled());
  // Server đã báo `needs_setup: false` → studio mở ra ngay (xưởng rỗng → tạo tác phẩm).
  await waitFor(() =>
    expect(screen.getByRole('heading', { level: 1, name: CHU.taoTacPham })).toBeDefined(),
  );
  expect(screen.queryByText(CH.goiYKhoaLanDau)).toBeNull();
  expect(LAY.mock.calls.length, 'useMay phải hỏi lại /api/config sau khi lưu').toBeGreaterThan(1);
});
