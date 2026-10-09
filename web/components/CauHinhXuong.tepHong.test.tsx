import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { CH } from '@/lib/chu/cau-hinh';
import type { CauHinhDoc } from '@/lib/types';

import { CauHinhXuong } from './CauHinhXuong';

/**
 * Tệp thiết lập hỏng: server trả 200 với `needs_setup: true` và `config_error`.
 *
 * Với người dùng, ca này trông Y HỆT lần đầu — mọi nhà cung cấp biến mất. Không nói ra thì
 * người đã có khóa tưởng app tự xóa thiết lập của họ, và cũng không biết rằng lượt lưu kế
 * tiếp sẽ ghi đè tệp cũ.
 */

const TRONG: CauHinhDoc = {
  needs_setup: true,
  path: '/u/AINovel/config.json',
  provider: '',
  model: '',
  style: '',
  styles: [],
  role_names: [],
  providers: [],
  presets: [],
  engine_open: [],
};

let tra: CauHinhDoc = TRONG;
vi.mock('@/lib/api', async (goc) => ({
  ...(await goc<typeof import('@/lib/api')>()),
  layCauHinh: () => Promise.resolve(tra),
}));

afterEach(cleanup);

test('tệp hỏng: nói ra là không đọc được, lưu sẽ ghi mới, kèm lỗi nêu đường dẫn tệp', async () => {
  const loi = 'invalid character } in /u/AINovel/config.json';
  tra = { ...TRONG, config_error: loi };
  render(<CauHinhXuong lanDau />);
  const bao = await screen.findByRole('alert');
  expect(bao.textContent).toContain(CH.tepHong);
  expect(bao.textContent).toContain(loi);
  // Vẫn là màn lần đầu: câu giải thích khóa API và biểu mẫu thêm nhà cung cấp còn nguyên.
  expect(screen.getByText(CH.goiYKhoaLanDau)).toBeDefined();
  await waitFor(() => expect(document.querySelector('input[type="password"]')).not.toBeNull());
});

test('lần đầu thật (không có config_error): không có cảnh báo tệp hỏng', async () => {
  tra = TRONG;
  render(<CauHinhXuong lanDau />);
  await waitFor(() => expect(screen.getByText(CH.tepDangSua(TRONG.path))).toBeDefined());
  expect(screen.queryByText(CH.tepHong)).toBeNull();
});
