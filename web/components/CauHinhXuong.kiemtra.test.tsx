import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

import { LoiApi } from '@/lib/api';
import type { CauHinhDoc } from '@/lib/types';

/**
 * Danh sách nhà cung cấp: kiểm tra kết nối, thêm, xóa.
 *
 * # Ba chỗ hỏng ÂM THẦM của nút Kiểm tra
 *
 *   1. Hỏi nhầm nhà cung cấp — mọi dòng đi kiểm cái đang làm mặc định, và dòng `kiraai` báo
 *      xanh nhờ khóa của nơi khác.
 *   2. Lỗi tràn sang dòng khác — 401 của `kiraai` dán lên `openai` đang khỏe.
 *   3. Bấm được khi chưa có khóa — một nút luôn trả lỗi đọc thành "nhà cung cấp hỏng".
 *
 * Cộng hai lỗi của bản trước: Xóa không hỏi (khóa mất hẳn, không xem lại được), và sửa một
 * nhà cung cấp xong màn hình vẫn khoe kết quả kiểm của địa chỉ CŨ.
 */

const LIET_KE = vi.fn<
  (p: string) => Promise<{ provider: string; models: string[]; count: number; tools?: unknown }>
>();
// Tùy chọn của lượt hỏi, tách khỏi LIET_KE để các bài cũ (`toHaveBeenCalledWith('kiraai')`) giữ nguyên.
const TUY_CHON = vi.fn();
const LUU = vi.fn((_than?: Record<string, unknown>) => Promise.resolve({ saved: true, path: '', reopen_to_apply: [] }));

const CAU_HINH: CauHinhDoc = {
  needs_setup: false,
  path: '/tmp/x/.ainovel/config.json',
  provider: 'openai',
  model: 'cx/gpt-5.5',
  style: '',
  styles: [],
  role_names: ['default', 'architect', 'writer', 'editor'],
  roles: {
    writer: { provider: 'kiraai', model: 'kira-mini-1.0', fallbacks: [{ provider: 'openai', model: 'cx/gpt-5.5' }] },
    editor: { provider: 'openai', model: 'cx/gpt-5.5', fallbacks: [{ provider: 'kiraai', model: 'kira-1.0' }] },
  },
  providers: [
    {
      name: 'openai',
      type: 'openai',
      base_url: 'https://9router.example/v1',
      api_key_set: true,
      api_key_masked: 'sk-4…802',
      models: [{ name: 'cx/gpt-5.5' }],
    },
    {
      name: 'kiraai',
      type: 'openai',
      base_url: 'https://kiraai.example/api/v1',
      api_key_set: true,
      api_key_masked: 'kira…e42',
      // HAI tên, chỉ một có thật ở nhà cung cấp — đủ để phân biệt "lọc đúng" với "nêu tất".
      models: [{ name: 'kira-mini-1.0' }, { name: 'kira-1.0' }],
    },
    { name: 'chuaCoKhoa', type: 'openai', base_url: 'https://x.example/v1', api_key_set: false, models: [] },
  ],
  presets: [{ name: 'openrouter', label: 'OpenRouter', type: 'openai', base_url: 'https://openrouter.ai/api/v1' }],
  engine_open: [],
};

vi.mock('@/lib/api', async (goc) => ({
  ...(await goc<typeof import('@/lib/api')>()),
  layCauHinh: () => Promise.resolve(CAU_HINH),
  lietKeModel: (p: string, o?: unknown) => {
    TUY_CHON(o);
    return LIET_KE(p);
  },
  luuCauHinh: (...a: unknown[]) => LUU(...(a as [])),
}));

const { CauHinhXuong } = await import('./CauHinhXuong');

function dongCua(ten: string): HTMLElement {
  const the = Array.from(document.querySelectorAll<HTMLElement>('li.nccMuc')).find(
    (li) => li.querySelector('.nccTen')?.textContent === ten,
  );
  expect(the, `không thấy dòng nhà cung cấp ${ten}`).toBeDefined();
  return the!;
}
const nutKiem = (ten: string) => within(dongCua(ten)).getByRole('button', { name: /^(Kiểm tra|Đang kiểm…)$/ });

beforeEach(async () => {
  cleanup();
  LIET_KE.mockReset();
  TUY_CHON.mockClear();
  LUU.mockClear();
  render(<CauHinhXuong />);
  await waitFor(() => expect(document.querySelectorAll('li.nccMuc').length).toBe(3));
});

test('mặc định đứng ĐẦU danh sách', () => {
  expect(document.querySelector('li.nccMuc .nccTen')?.textContent).toBe('openai');
});

test('mỗi dòng hỏi ĐÚNG nhà cung cấp của nó, không hỏi cái đang làm mặc định', async () => {
  LIET_KE.mockResolvedValue({ provider: 'kiraai', models: ['kira-mini-1.0'], count: 1 });
  fireEvent.click(nutKiem('kiraai'));
  await waitFor(() => expect(LIET_KE).toHaveBeenCalledWith('kiraai'));
});

test('lỗi của một dòng KHÔNG dán lên dòng khác', async () => {
  LIET_KE.mockRejectedValue(new LoiApi('kiraai trả HTTP 401 — khóa API sai hoặc hết hạn', 502));
  fireEvent.click(nutKiem('kiraai'));
  await waitFor(() => expect(dongCua('kiraai').textContent).toMatch(/401/));
  expect(dongCua('openai').textContent).not.toMatch(/401/);
  expect(dongCua('openai').textContent).toMatch(/Chưa kiểm tra/);
});

test('kiểm xong thì nói số model + giờ, và chỉ tên ĐÃ LƯU mà nhà cung cấp không có mới bị nêu', async () => {
  LIET_KE.mockResolvedValue({ provider: 'kiraai', models: ['kira-1.0', 'khac'], count: 2 });
  fireEvent.click(nutKiem('kiraai'));
  await waitFor(() => expect(dongCua('kiraai').textContent).toMatch(/Kết nối được · 2 model · \d/));
  const chu = dongCua('kiraai').textContent ?? '';
  expect(chu).toMatch(/không còn phục vụ: kira-mini-1\.0\./);
  expect(chu, 'tên có thật cũng bị nêu là lạ').not.toMatch(/phục vụ:[^.]*kira-1\.0/);
});

test('nút Kiểm tra xin thử gọi công cụ, và nói thẳng khi model không gọi được', async () => {
  // Ca thật 2026-10-02: "Kết nối được · 306 model" xanh, trong khi không model nào gọi được
  // công cụ — truyện kẹt ở Kiến trúc sư. Dòng thứ hai là câu trả lời người dùng cần.
  LIET_KE.mockResolvedValue({
    provider: 'kiraai',
    models: ['kira-mini-1.0'],
    count: 1,
    tools: {
      model: 'kira-mini-1.0',
      checked: true,
      ok: false,
      reason: 'cổng đã thử hết 388 tuyến mà không tuyến nào nhận',
      raw: 'All models exhausted',
    },
  });
  fireEvent.click(nutKiem('kiraai'));
  await waitFor(() => expect(dongCua('kiraai').textContent).toMatch(/không gọi công cụ được/));
  expect(TUY_CHON).toHaveBeenCalledWith({ congCu: true });
  const chu = dongCua('kiraai').textContent ?? '';
  expect(chu).toMatch(/Model kira-mini-1\.0 không gọi công cụ được — Kiến trúc sư, Người viết và Biên tập viên sẽ không chạy/);
  expect(chu).toMatch(/Lý do: cổng đã thử hết 388 tuyến/);
});

test('gọi công cụ được thì nói ra, cạnh dòng kết nối', async () => {
  LIET_KE.mockResolvedValue({
    provider: 'kiraai',
    models: ['kira-mini-1.0'],
    count: 1,
    tools: { model: 'kira-mini-1.0', checked: true, ok: true },
  });
  fireEvent.click(nutKiem('kiraai'));
  await waitFor(() => expect(dongCua('kiraai').textContent).toMatch(/kira-mini-1\.0 gọi công cụ được/));
});

test('chưa lưu khóa thì nút Kiểm tra tắt, kèm lý do', () => {
  const nut = nutKiem('chuaCoKhoa') as HTMLButtonElement;
  expect(nut.disabled).toBe(true);
  expect(nut.title).toMatch(/khóa/);
});

test('dòng nói đúng vai nào đang dùng nó, kể cả vai theo mặc định', () => {
  expect(dongCua('openai').textContent).toMatch(/Đang dùng cho: Mặc định, Kiến trúc sư, Biên tập viên/);
  expect(dongCua('kiraai').textContent).toMatch(/Đang dùng cho: Người viết/);
  expect(dongCua('chuaCoKhoa').textContent).toMatch(/Chưa vai nào dùng/);
});

test('không xóa được nhà cung cấp mặc định', () => {
  const nut = within(dongCua('openai')).getByRole('button', { name: 'Xóa' }) as HTMLButtonElement;
  expect(nut.disabled).toBe(true);
});

test('Xóa HỎI trước; xác nhận thì gỡ cả vai lẫn fallback trỏ vào nó (B9)', async () => {
  fireEvent.click(within(dongCua('kiraai')).getByRole('button', { name: 'Xóa' }));
  expect(LUU, 'xóa mà không hỏi').not.toHaveBeenCalled();
  const dialog = (await screen.findByText('Xóa nhà cung cấp kiraai?')).closest('dialog')!;
  expect(dialog.textContent).toMatch(/Người viết đang chọn riêng ở đây/);

  fireEvent.click(within(dialog).getByRole('button', { name: 'Hủy' }));
  expect(LUU).not.toHaveBeenCalled();

  fireEvent.click(within(dongCua('kiraai')).getByRole('button', { name: 'Xóa' }));
  const dialog2 = (await screen.findByText('Xóa nhà cung cấp kiraai?')).closest('dialog')!;
  fireEvent.click(within(dialog2).getByRole('button', { name: 'Xóa' }));
  await waitFor(() => expect(LUU).toHaveBeenCalled());
  expect(LUU.mock.calls[0]![0]).toEqual({
    remove_provider: 'kiraai',
    roles: { editor: { provider: 'openai', model: 'cx/gpt-5.5', fallbacks: [] } },
  });
});

/* ── thêm nhà cung cấp ──────────────────────────────────────────────────── */

function moThem() {
  fireEvent.click(screen.getByRole('button', { name: /Thêm nhà cung cấp/ }));
  const form = document.querySelector<HTMLFormElement>('.chNcc .chPanel form')!;
  expect(form, 'không mở được biểu mẫu thêm').not.toBeNull();
  return form;
}

test('gõ trùng tên một nhà cung cấp đã có thì KHÔNG lưu được, kể cả bằng Enter', () => {
  const form = moThem();
  fireEvent.change(within(form).getByPlaceholderText('openrouter'), { target: { value: 'kiraai' } });
  expect(within(form).getByText(/Đã có nhà cung cấp tên kiraai/)).toBeDefined();
  expect((within(form).getByRole('button', { name: 'Lưu' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.submit(form);
  expect(LUU).not.toHaveBeenCalled();
});

test('mẫu sẵn điền tên + địa chỉ; tên mới lưu được, kèm giao thức và khóa vừa gõ', async () => {
  const form = moThem();
  fireEvent.click(within(form).getByRole('button', { name: 'OpenRouter' }));
  expect((within(form).getByPlaceholderText('openrouter') as HTMLInputElement).value).toBe('openrouter');
  fireEvent.change(form.querySelector('input[type="password"]')!, { target: { value: 'sk-moi' } });
  fireEvent.change(within(form).getByPlaceholderText(/Gõ tên rồi nhấn Enter/), { target: { value: 'a/m1, a/m2' } });
  fireEvent.keyDown(within(form).getByPlaceholderText(/Gõ tên rồi nhấn Enter/), { key: 'Enter' });
  fireEvent.click(within(form).getByRole('button', { name: 'Lưu' }));
  await waitFor(() => expect(LUU).toHaveBeenCalled());
  expect(LUU.mock.calls[0]![0]).toEqual({
    provider_config: {
      name: 'openrouter',
      type: 'openai',
      base_url: 'https://openrouter.ai/api/v1',
      api_key: 'sk-moi',
      models: [{ name: 'a/m1' }, { name: 'a/m2' }],
    },
  });
});

test('tên có dấu cách bị chặn ngay trên biểu mẫu', () => {
  const form = moThem();
  fireEvent.change(within(form).getByPlaceholderText('openrouter'), { target: { value: 'co cach' } });
  expect((within(form).getByRole('button', { name: 'Lưu' }) as HTMLButtonElement).disabled).toBe(true);
});

/* ── sửa thì quên kết quả kiểm cũ (B8) ──────────────────────────────────── */

test('sửa xong một nhà cung cấp thì kết quả kiểm của địa chỉ cũ bị quên', async () => {
  LIET_KE.mockResolvedValue({ provider: 'kiraai', models: ['kira-1.0'], count: 1 });
  fireEvent.click(nutKiem('kiraai'));
  await waitFor(() => expect(dongCua('kiraai').textContent).toMatch(/Kết nối được/));

  fireEvent.click(within(dongCua('kiraai')).getByRole('button', { name: 'Sửa' }));
  const form = dongCua('kiraai').querySelector('form')!;
  fireEvent.change(within(form).getByPlaceholderText('https://openrouter.ai/api/v1'), {
    target: { value: 'https://moi.example/v1' },
  });
  fireEvent.click(within(form).getByRole('button', { name: 'Lưu' }));
  await waitFor(() => expect(LUU).toHaveBeenCalled());
  await waitFor(() => expect(dongCua('kiraai').textContent).toMatch(/Chưa kiểm tra/));
});
