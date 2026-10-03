import { render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import type { CauHinhDoc } from '@/lib/types';

/**
 * Màn Tác phẩm mới phải nói TRƯỚC nó sẽ viết bằng model nào.
 *
 * # Vì sao đây là mắt nối, không phải một dòng trang trí
 *
 * Đây là chỗ quyết định ở Cấu hình máy được TIÊU: cuốn mới nhận `cfg.Provider` + `cfg.Roles`
 * lúc engine mở, và sau đó không đổi được nữa nếu không đóng máy. Bản trước im lặng hoàn toàn
 * về model, nên người dùng vừa thêm một nhà cung cấp xong, sang đây bấm Bắt đầu, và không có
 * gì xác nhận cái vừa đổi đã ăn hay chưa — họ chỉ biết khi hóa đơn về.
 *
 * Ca chịu lực là vai GHIM: `writer` trỏ sang một nhà cung cấp khác mặc định. Một bản cài đặt
 * chỉ đọc `du.provider` sẽ hiện nhà cung cấp mặc định cho cả hai vai, tức nói dối đúng vào ca
 * mà người dùng cần dòng này nhất.
 */

const CAU_HINH: CauHinhDoc = {
  needs_setup: false,
  path: '/tmp/x/.ainovel/config.json',
  provider: 'kiraai',
  model: 'kira-mini-1.0',
  style: 'default',
  styles: ['default'],
  role_names: ['default', 'architect', 'writer', 'editor'],
  roles: { writer: { provider: 'openai', model: 'cx/gpt-5.5' } },
  providers: [
    { name: 'kiraai', api_key_set: true, models: [{ name: 'kira-mini-1.0' }] },
    { name: 'openai', api_key_set: true, models: [{ name: 'cx/gpt-5.5' }] },
  ],
  presets: [],
  engine_open: [],
};

vi.mock('@/lib/api', async (goc) => ({
  ...(await goc<typeof import('@/lib/api')>()),
  layCauHinh: () => Promise.resolve(CAU_HINH),
}));

const { TacPhamMoi } = await import('./TacPhamMoi');

test('nói đúng model của TỪNG vai, kể cả vai ghim sang nhà cung cấp khác', async () => {
  render(<TacPhamMoi onXong={() => {}} />);

  // Chờ theo NHÃN, không theo giá trị: giá trị được in thành một chuỗi ghép
  // (`openai · cx/gpt-5.5`), nên tìm đúng `cx/gpt-5.5` sẽ không khớp phần tử nào.
  await waitFor(() => expect(screen.getByText('Người viết')).toBeDefined());

  const doc = (nhan: string) =>
    Array.from(document.querySelectorAll('dt')).find((d) => d.textContent === nhan)?.nextElementSibling
      ?.textContent;

  // `writer` ghim sang openai; `architect` thừa hưởng mặc định kiraai. Hai giá trị KHÁC nhau —
  // đó là điều kiện để bài kiểm này chứng minh được gì.
  expect(doc('Người viết'), 'vai ghim bị hiện thành nhà cung cấp mặc định').toBe('openai · cx/gpt-5.5');
  expect(doc('Kiến trúc sư'), 'vai thừa hưởng phải hiện GIÁ TRỊ thừa hưởng, không phải ô trống').toBe(
    'kiraai · kira-mini-1.0',
  );
});

test('có đường đi thẳng sang Cấu hình máy khi model không phải cái mình muốn', async () => {
  const CHON = vi.fn();
  render(<TacPhamMoi onXong={() => {}} onChonKhu={CHON} />);

  await waitFor(() => expect(screen.getByRole('button', { name: 'Đổi trong Model & khóa API' })).toBeDefined());
  screen.getByRole('button', { name: 'Đổi trong Model & khóa API' }).click();
  expect(CHON).toHaveBeenCalledWith('cau-hinh');
});

test('chip thể loại điền một câu mẫu và tên thư mục; gõ ý riêng thì chip biến mất', async () => {
  const { fireEvent } = await import('@testing-library/react');
  const { TU_TRUYEN } = await import('@/lib/chu/tu-truyen');
  render(<TacPhamMoi onXong={() => {}} />);

  const o = screen.getByRole('textbox', { name: /Bạn muốn viết truyện gì/ }) as HTMLTextAreaElement;
  const mau = TU_TRUYEN.yTuongMau.find((m) => m.the === 'Trinh thám')!;
  fireEvent.click(screen.getByRole('button', { name: 'Trinh thám' }));
  expect(o.value).toBe(mau.cau);
  // Tên thư mục tự sinh đi theo, nên nút chính bấm được ngay mà không phải mở Tùy chọn.
  expect(document.querySelector('.tpmTuyChon code')?.textContent).toBe('trinh-tham-dieu-tra-nhip');
  expect((screen.getByRole('button', { name: /Bắt đầu viết/ }) as HTMLButtonElement).disabled).toBe(false);

  // Chữ của chính người dùng thì không chip nào được đè lên.
  fireEvent.change(o, { target: { value: 'Ý của tôi' } });
  expect(screen.queryByRole('button', { name: 'Trinh thám' })).toBeNull();
});
