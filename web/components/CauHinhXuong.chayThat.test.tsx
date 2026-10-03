import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

import type { CauHinhDoc } from '@/lib/types';

/**
 * Ba lỗi gặp trong lượt chạy thật 2026-10-02 trên màn Model & khóa API.
 *
 *   1. Thêm nhà cung cấp xong bấm Kiểm tra kết nối: form tự tích `agnes-2.0-flash` — model đầu
 *      bảng chữ cái của lingoreup, không ai chọn. Bấm Lưu luôn là lưu nhầm model.
 *   2. Hai ô Kiểu văn / Độ suy luận hiện mã tiếng Anh (`fantasy`, `xhigh`).
 *   3. Bấm "Áp dụng ngay" xong, câu báo vẫn nói phiên "vẫn dùng thiết lập lúc mở".
 */

const THU = vi.fn<(n: Record<string, unknown>) => Promise<{ provider: string; models: string[]; count: number }>>();
const AP_DUNG = vi.fn((_b: string) => Promise.resolve({ applied: true }));
const LUU = vi.fn((_than?: Record<string, unknown>) => Promise.resolve({ saved: true, path: '', reopen_to_apply: [] }));

let DU_HIEN: CauHinhDoc;

vi.mock('@/lib/api', async (goc) => ({
  ...(await goc<typeof import('@/lib/api')>()),
  layCauHinh: () => Promise.resolve(DU_HIEN),
  thuKetNoi: (n: Record<string, unknown>) => THU(n),
  apDungCauHinh: (b: string) => AP_DUNG(b),
  luuCauHinh: (...a: unknown[]) => LUU(...(a as [])),
}));

const { CauHinhXuong } = await import('./CauHinhXuong');

const GOC: CauHinhDoc = {
  needs_setup: false,
  path: '/tmp/x/.ainovel/config.json',
  provider: 'lingoreup',
  model: 'auto',
  style: 'fantasy',
  styles: ['default', 'fantasy', 'romance', 'suspense'],
  reasoning_effort: 'xhigh',
  role_names: ['default', 'architect', 'writer', 'editor'],
  roles: undefined,
  providers: [
    {
      name: 'lingoreup',
      type: 'openai',
      base_url: 'https://llm.example/v1',
      api_key_set: true,
      api_key_masked: 'free…aab',
      models: [{ name: 'auto' }],
    },
  ],
  presets: [{ name: '', label: 'Tự nhập', type: 'openai' }],
  engine_open: ['dong-ho-qua-lac'],
};

beforeEach(() => {
  cleanup();
  THU.mockReset();
  AP_DUNG.mockClear();
  LUU.mockClear();
  DU_HIEN = GOC;
});

async function moFormThem() {
  render(<CauHinhXuong />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Thêm nhà cung cấp' })).toBeDefined());
  fireEvent.click(screen.getByRole('button', { name: 'Thêm nhà cung cấp' }));
  const form = document.querySelector<HTMLFormElement>('form.chForm')!;
  return within(form);
}

test('kiểm kết nối xong chỉ chọn sẵn `auto`, không chọn model đầu bảng chữ cái', async () => {
  THU.mockResolvedValue({ provider: 'lingo2', models: ['agnes-2.0-flash', 'auto', 'glm-5'], count: 3 });
  const form = await moFormThem();
  fireEvent.change(form.getByPlaceholderText('openrouter'), { target: { value: 'lingo2' } });
  fireEvent.click(form.getByRole('button', { name: 'Kiểm tra kết nối' }));
  await waitFor(() => expect(form.getByText('Đã chọn 1 model')).toBeDefined());

  expect((form.getByRole('checkbox', { name: /^auto/ }) as HTMLInputElement).checked).toBe(true);
  expect((form.getByRole('checkbox', { name: /agnes-2\.0-flash/ }) as HTMLInputElement).checked).toBe(false);
  expect(THU.mock.calls[0]![0]).toMatchObject({ name: 'lingo2', tools: true });
});

test('không có `auto` thì không chọn sẵn gì cả', async () => {
  THU.mockResolvedValue({ provider: 'x', models: ['agnes-2.0-flash', 'glm-5'], count: 2 });
  const form = await moFormThem();
  fireEvent.change(form.getByPlaceholderText('openrouter'), { target: { value: 'x' } });
  fireEvent.click(form.getByRole('button', { name: 'Kiểm tra kết nối' }));
  await waitFor(() => expect(form.getByRole('checkbox', { name: /glm-5/ })).toBeDefined());
  expect(form.getByText('Đã chọn 0 model')).toBeDefined();
});

test('Kiểu văn và Độ suy luận hiện nhãn tiếng Việt, giá trị gửi đi vẫn là mã gốc', async () => {
  render(<CauHinhXuong />);
  const kieu = (await screen.findByLabelText('Kiểu văn mặc định')) as HTMLSelectElement;
  expect([...kieu.options].map((o) => o.textContent)).toEqual(['Mặc định', 'Kỳ ảo', 'Lãng mạn', 'Hồi hộp']);
  expect(kieu.value).toBe('fantasy');
  const suy = screen.getByLabelText('Độ suy luận mặc định') as HTMLSelectElement;
  expect([...suy.options].map((o) => o.textContent)).toEqual([
    'Theo mặc định của model',
    'Tắt',
    'Thấp',
    'Vừa',
    'Cao',
    'Rất cao',
    'Tối đa',
  ]);
  expect(suy.value).toBe('xhigh');

  fireEvent.change(kieu, { target: { value: 'romance' } });
  fireEvent.click(within(kieu.closest('form')!).getByRole('button', { name: 'Lưu' }));
  await waitFor(() => expect(LUU).toHaveBeenCalled());
  expect(LUU.mock.calls[0]![0]).toEqual({ style: 'romance', reasoning_effort: 'xhigh' });
});

test('Áp dụng ngay xuôi thì dải lệch biến mất, chỉ còn một dòng xác nhận', async () => {
  DU_HIEN = { ...DU_HIEN, engine_stale: ['dong-ho-qua-lac'] };
  render(<CauHinhXuong />);
  const nut = await screen.findByRole('button', { name: 'Áp dụng ngay cho dong-ho-qua-lac' });
  expect(document.body.textContent).toMatch(/vẫn chạy model cũ/);
  // Server áp xong thì phiên khớp tệp — lần đọc lại không còn cuốn này trong engine_stale.
  DU_HIEN = { ...DU_HIEN, engine_stale: [] };
  fireEvent.click(nut);
  await waitFor(() => expect(document.body.textContent).toMatch(/dong-ho-qua-lac đang dùng thiết lập mới từ \d/));
  expect(document.body.textContent).not.toMatch(/vẫn chạy model cũ/);
  expect(screen.queryByRole('button', { name: /Áp dụng ngay/ })).toBeNull();
  expect(AP_DUNG).toHaveBeenCalledWith('dong-ho-qua-lac');
});

test('phiên đang mở mà khớp tệp thì không có dải "áp dụng ngay"', async () => {
  DU_HIEN = { ...DU_HIEN, engine_stale: [] };
  render(<CauHinhXuong />);
  await screen.findByLabelText('Độ suy luận mặc định');
  expect(screen.queryByRole('button', { name: /Áp dụng ngay/ })).toBeNull();
  expect(document.body.textContent).not.toMatch(/vẫn chạy model cũ/);
});
