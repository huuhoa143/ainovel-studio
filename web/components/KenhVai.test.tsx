import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import type { VaiModelDoc } from '@/lib/types';

/**
 * Dải kênh model trong Phiên chạy.
 *
 * # Hai chỗ nói dối mà bộ kiểm này canh
 *
 *   1. Màn Phiên chạy in model LÚC KHỞI ĐỘNG ở khối trên và model ĐANG CHẠY ở dải này, cả hai
 *      dưới nhãn "Model". Sau một lần đổi nóng, hai con số khác nhau và không gì nói ra điều
 *      đó — người đọc phải tự phát hiện màn hình đang tự mâu thuẫn.
 *   2. Lưu ở đây ăn ngay VÀ ghi vĩnh viễn xuống `cfg.Roles` (`host.go:1352-1360`). Vế thứ hai
 *      không đoán được từ giao diện, và nó chính là cách những dòng ghim lạ trong tệp cấu hình
 *      ra đời — người dùng tưởng mình chỉ đổi cho lượt chạy này.
 */

const DU: VaiModelDoc = {
  channels: [
    { role: 'default', provider: 'kiraai', model: 'kira-mini-1.0', explicit: true, thinking: '', thinking_options: [] },
    { role: 'writer', provider: 'kiraai', model: 'kira-mini-1.0', explicit: false, thinking: '', thinking_options: [] },
  ],
  providers: ['kiraai', 'openai'],
  models_by_provider: { kiraai: ['kira-mini-1.0'], openai: ['cx/gpt-5.5'] },
};

const LAY = vi.fn<() => Promise<VaiModelDoc>>(() => Promise.resolve(DU));
const DOI = vi.fn((_b: string, _s: Record<string, unknown>) => Promise.resolve({ applied: ['model'] }));

vi.mock('@/lib/api', async (goc) => ({
  ...(await goc<typeof import('@/lib/api')>()),
  layVaiModel: () => LAY(),
  doiVaiModel: (b: string, s: Record<string, unknown>) => DOI(b, s),
}));

const { LoiApi } = await import('@/lib/api');

const { KenhVai } = await import('./KenhVai');

test('nói ra khi model đang chạy đã KHÁC model lúc khởi động', async () => {
  render(<KenhVai tacPham="x" khoiDong="openai · cx/gpt-5.5" />);

  await waitFor(() => expect(screen.getByText(/Đã đổi giữa chừng/)).toBeDefined());
  const canh = screen.getByText(/Đã đổi giữa chừng/).textContent ?? '';
  expect(canh, 'không nói ra giá trị CŨ').toMatch(/openai · cx\/gpt-5\.5/);
  expect(canh, 'không nói ra giá trị ĐANG chạy').toMatch(/kiraai · kira-mini-1\.0/);
});

test('KHÔNG cảnh báo khi hai giá trị còn khớp — cảnh báo thừa là nhiễu', async () => {
  render(<KenhVai tacPham="x" khoiDong="kiraai · kira-mini-1.0" />);
  await waitFor(() => expect(screen.getByText('Đang viết bằng')).toBeDefined());
  expect(screen.queryByText(/Đã đổi giữa chừng/)).toBeNull();
});

test('nói ra rằng lưu ở đây còn GHI VĨNH VIỄN, không chỉ ăn cho lượt này', async () => {
  render(<KenhVai tacPham="x" />);
  await waitFor(() => expect(screen.getByText('Đang viết bằng')).toBeDefined());
  expect(
    screen.getByText(/lưu làm mặc định/),
    'chỉ hứa "ăn ngay" mà giấu vế ghi vĩnh viễn — đúng cách ba dòng ghim lạ ra đời',
  ).toBeDefined();
});


test('máy ĐÓNG thì tiêu đề nói đúng trạng thái, không hứa "đang chạy"', async () => {
  // 409 = engine chưa mở. Đây là trạng thái bình thường của mọi cuốn không chạy, nên bề mặt
  // phải nói ra nó — chứ không giữ tiêu đề "Đang chạy với" trên một cái máy đã tắt. Cùng lớp
  // lỗi mà `DieuKhien` đã tránh khi từ chối in "Tự chạy liên tục" lúc `advance === null`.
  LAY.mockRejectedValueOnce(new LoiApi('chưa mở engine', 409));
  render(<KenhVai tacPham="x" khoiDong="openai · cx/gpt-5.5" />);

  await waitFor(() => expect(screen.getByText('Phiên đang đóng')).toBeDefined());
  expect(
    screen.queryByText('Đang viết bằng'),
    'máy đã đóng mà tiêu đề vẫn khẳng định có thứ đang chạy',
  ).toBeNull();
  // Và vẫn phải có đường mở máy — ẩn cả khối là bỏ mất lối ra duy nhất.
  expect(screen.getByRole('button', { name: /Mở sẵn/ })).toBeDefined();
});

test('đổi model gửi CẢ CẶP chọn từ một danh sách đã nhóm theo nhà cung cấp', async () => {
  render(<KenhVai tacPham="x" />);
  await waitFor(() => expect(screen.getByText('Đang viết bằng')).toBeDefined());
  fireEvent.click(screen.getByRole('button', { name: /Đổi model — Người viết/ }));
  const nhom = within(screen.getByRole('group', { name: 'openai' }));
  fireEvent.click(nhom.getByRole('option', { name: /cx\/gpt-5\.5/ }));
  await waitFor(() => expect(DOI).toHaveBeenCalled());
  expect(DOI.mock.calls.at(-1)).toEqual(['x', { role: 'writer', provider: 'openai', model: 'cx/gpt-5.5' }]);
});

test('model không có mức suy luận thật thì KHÔNG vẽ ô chọn rỗng (B12)', async () => {
  LAY.mockResolvedValueOnce({
    ...DU,
    channels: DU.channels.map((k) => ({ ...k, thinking_options: [''] })),
  });
  render(<KenhVai tacPham="x" />);
  await waitFor(() => expect(screen.getByText('Đang viết bằng')).toBeDefined());
  expect(screen.queryByRole('combobox', { name: /suy luận/ })).toBeNull();
});
