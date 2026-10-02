import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

import { LoiApi } from '@/lib/api';
import type { CauHinhDoc } from '@/lib/types';

/**
 * Một lượt ghi chỉ được đổi ĐÚNG thứ nó nói là đổi.
 *
 * `ModelConfig` mang `context_window` và `json_schema`, và `PUT /api/config` thay NGUYÊN mảng
 * models. Vòng tự hủy đo được ở bản cũ: "Ghi lại cửa sổ" ghi 272.000 → vài hôm sau sửa một ký
 * tự trong base_url → cửa sổ biến mất, engine quay về 1.050.000 của registry toàn cục.
 *
 * Cùng họ lỗi: sửa một mục KHÔNG khai giao thức (do TUI tạo, suy theo tên) từng âm thầm gắn
 * `type: "openai"` (B4).
 */

const LIET_KE =
  vi.fn<(p: string) => Promise<{ provider: string; models: string[]; count: number; windows?: Record<string, number> }>>();
const THU = vi.fn<(n: Record<string, unknown>) => Promise<{ provider: string; models: string[]; count: number; windows?: Record<string, number> }>>();
const LUU = vi.fn((_than?: Record<string, unknown>) => Promise.resolve({ saved: true, path: '', reopen_to_apply: [] }));

let DU_HIEN: CauHinhDoc;

vi.mock('@/lib/api', async (goc) => ({
  ...(await goc<typeof import('@/lib/api')>()),
  layCauHinh: () => Promise.resolve(DU_HIEN),
  lietKeModel: (p: string) => LIET_KE(p),
  thuKetNoi: (n: Record<string, unknown>) => THU(n),
  luuCauHinh: (...a: unknown[]) => LUU(...(a as [])),
}));

const { CauHinhXuong } = await import('./CauHinhXuong');

const GIU: CauHinhDoc = {
  needs_setup: false,
  path: '/tmp/x/.ainovel/config.json',
  provider: '9Router',
  model: 'cx/gpt-5.6-luna',
  style: '',
  styles: [],
  role_names: ['default', 'architect', 'writer', 'editor'],
  roles: undefined,
  providers: [
    {
      name: '9Router',
      type: 'openai',
      base_url: 'https://9router.example/v1',
      api_key_set: true,
      api_key_masked: 'sk-4…802',
      models: [{ name: 'cx/gpt-5.6-luna', context_window: 272000, json_schema: true }],
    },
  ],
  presets: [],
  engine_open: [],
};

beforeEach(() => {
  cleanup();
  LUU.mockClear();
  LUU.mockImplementation(() => Promise.resolve({ saved: true, path: '', reopen_to_apply: [] }));
  LIET_KE.mockReset();
  THU.mockReset();
  DU_HIEN = GIU;
});

function thanCuoi() {
  return LUU.mock.calls.at(-1)?.[0] as { provider_config?: Record<string, unknown> } | undefined;
}

/** Mở biểu mẫu Sửa của dòng đầu tiên và trả về phạm vi truy vấn trong biểu mẫu đó. */
async function moFormSua() {
  render(<CauHinhXuong />);
  await waitFor(() => expect(document.querySelector('li.nccMuc')).not.toBeNull());
  const li = document.querySelector<HTMLElement>('li.nccMuc')!;
  fireEvent.click(within(li).getByRole('button', { name: 'Sửa' }));
  return within(li.querySelector('form')!);
}

test('sửa Địa chỉ gốc KHÔNG làm rơi context_window, json_schema, khóa hay giao thức', async () => {
  const form = await moFormSua();
  fireEvent.change(form.getByPlaceholderText('https://openrouter.ai/api/v1'), {
    target: { value: 'https://9router.example/v2' },
  });
  fireEvent.click(form.getByRole('button', { name: 'Lưu' }));
  await waitFor(() => expect(LUU).toHaveBeenCalledTimes(1));
  expect(thanCuoi()?.provider_config).toEqual({
    name: '9Router',
    base_url: 'https://9router.example/v2',
    models: [{ name: 'cx/gpt-5.6-luna', context_window: 272000, json_schema: true }],
  });
});

test('thêm một model theo tên thì mục cũ vẫn nguyên vẹn, mục mới là mục trần', async () => {
  const form = await moFormSua();
  const o = form.getByPlaceholderText(/Gõ tên rồi nhấn Enter/);
  fireEvent.change(o, { target: { value: 'cx/gpt-5.6-terra' } });
  fireEvent.keyDown(o, { key: 'Enter' });
  fireEvent.click(form.getByRole('button', { name: 'Lưu' }));
  await waitFor(() => expect(LUU).toHaveBeenCalledTimes(1));
  expect(thanCuoi()?.provider_config?.models).toEqual([
    { name: 'cx/gpt-5.6-luna', context_window: 272000, json_schema: true },
    { name: 'cx/gpt-5.6-terra' },
  ]);
});

test('sửa mục KHÔNG khai giao thức thì không âm thầm gắn type (B4)', async () => {
  DU_HIEN = {
    ...GIU,
    provider: 'anthropic',
    model: 'claude',
    providers: [{ name: 'anthropic', api_key_set: true, models: [{ name: 'claude' }] }],
  };
  const form = await moFormSua();
  expect((form.getByRole('combobox', { name: 'Giao thức' }) as HTMLSelectElement).value).toBe('');
  fireEvent.change(form.getByPlaceholderText('https://openrouter.ai/api/v1'), {
    target: { value: 'https://proxy.example/v1' },
  });
  fireEvent.click(form.getByRole('button', { name: 'Lưu' }));
  await waitFor(() => expect(LUU).toHaveBeenCalledTimes(1));
  expect(thanCuoi()?.provider_config, 'lượt sửa base_url đã đổi giao thức').not.toHaveProperty('type');
});

test('kiểm kết nối bằng BẢN NHÁP trước khi lưu, rồi tích chọn từ danh sách', async () => {
  THU.mockResolvedValue({
    provider: '9Router',
    models: ['cx/gpt-5.6-luna', 'cx/gpt-5.6-terra'],
    count: 2,
    windows: { 'cx/gpt-5.6-terra': 400000 },
  });
  const form = await moFormSua();
  fireEvent.change(document.querySelector('li.nccMuc input[type="password"]')!, { target: { value: 'sk-moi' } });
  fireEvent.click(form.getByRole('button', { name: 'Kiểm tra kết nối' }));
  await waitFor(() => expect(THU).toHaveBeenCalled());
  // Kèm `tools` + model đang chọn: nút Kiểm tra thử luôn model ấy có gọi công cụ được không.
  expect(THU.mock.calls[0]![0], 'bản nháp phải mang khóa vừa gõ và KHÔNG mang type khi chưa đổi').toEqual({
    name: '9Router',
    base_url: 'https://9router.example/v1',
    api_key: 'sk-moi',
    tools: true,
    model: 'cx/gpt-5.6-luna',
  });
  expect(LUU, 'kiểm tra đã ghi cấu hình').not.toHaveBeenCalled();

  fireEvent.click(await form.findByRole('checkbox', { name: /cx\/gpt-5\.6-terra/ }));
  fireEvent.click(form.getByRole('button', { name: 'Lưu' }));
  await waitFor(() => expect(LUU).toHaveBeenCalledTimes(1));
  expect(thanCuoi()?.provider_config?.models).toEqual([
    { name: 'cx/gpt-5.6-luna', context_window: 272000, json_schema: true },
    { name: 'cx/gpt-5.6-terra', context_window: 400000 },
  ]);
});

test('"Ghi lại cửa sổ" chỉ đổi cửa sổ, không đụng khai json_schema', async () => {
  LIET_KE.mockResolvedValue({ provider: '9Router', models: ['cx/gpt-5.6-luna'], count: 1, windows: { 'cx/gpt-5.6-luna': 400000 } });
  render(<CauHinhXuong />);
  await waitFor(() => expect(document.querySelector('li.nccMuc')).not.toBeNull());
  fireEvent.click(within(document.querySelector<HTMLElement>('li.nccMuc')!).getByRole('button', { name: 'Kiểm tra' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Ghi lại cửa sổ' }));
  await waitFor(() => expect(LUU).toHaveBeenCalledTimes(1));
  expect(thanCuoi()?.provider_config?.models).toEqual([
    { name: 'cx/gpt-5.6-luna', context_window: 400000, json_schema: true },
  ]);
});

test('cửa sổ khớp thì không có cảnh báo lệch', async () => {
  LIET_KE.mockResolvedValue({ provider: '9Router', models: ['cx/gpt-5.6-luna'], count: 1, windows: { 'cx/gpt-5.6-luna': 272000 } });
  render(<CauHinhXuong />);
  await waitFor(() => expect(document.querySelector('li.nccMuc')).not.toBeNull());
  fireEvent.click(within(document.querySelector<HTMLElement>('li.nccMuc')!).getByRole('button', { name: 'Kiểm tra' }));
  await screen.findByText(/Kết nối được · 1 model/);
  expect(screen.queryByRole('button', { name: 'Ghi lại cửa sổ' })).toBeNull();
});

test('ghi hỏng thì nói ra lý do ngay cạnh nút vừa bấm, biểu mẫu vẫn mở', async () => {
  LUU.mockImplementation(() =>
    Promise.reject(new LoiApi('Đổi khóa của "9Router" không có tác dụng: tệp toàn cục vẫn giữ giá trị cũ', 409)),
  );
  const form = await moFormSua();
  fireEvent.click(form.getByRole('button', { name: 'Lưu' }));
  await waitFor(() => expect(form.getByRole('alert').textContent).toMatch(/không có tác dụng/));
  expect(document.querySelector('li.nccMuc form'), 'lỗi mà biểu mẫu đóng mất').not.toBeNull();
});
