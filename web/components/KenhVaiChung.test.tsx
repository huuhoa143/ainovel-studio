import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

import type { CauHinhDoc } from '@/lib/types';

/**
 * Thẻ "Đang dùng" — câu trả lời cho "truyện sẽ viết bằng gì", và chỗ DUY NHẤT chọn model.
 *
 * Mỗi bài canh một lỗi đo được ở bản trước:
 *   - lưu một vai xóa `fallbacks`/`reasoning_effort` của mọi vai khác (B5);
 *   - "Chỉ đổi mặc định" gửi `model: ""` hoặc `models[0]`, bỏ qua thứ người dùng vừa chọn (B3);
 *   - chọn một model vừa tải mà chưa khai thì server từ chối — phải khai trong cùng lượt ghi;
 *   - và bề mặt chết trắng vì thứ tự hook (#310) — bài đầu tiên.
 */

const LUU = vi.fn((_than?: Record<string, unknown>) => Promise.resolve({ saved: true, path: '', reopen_to_apply: [] }));
const LIET_KE = vi.fn<(p: string) => Promise<{ provider: string; models: string[]; count: number; windows?: Record<string, number> }>>();
const AP_DUNG = vi.fn((_b: string) => Promise.resolve({ applied: true }));

const GOC: CauHinhDoc = {
  needs_setup: false,
  path: '/tmp/x/.ainovel/config.json',
  provider: 'lingoreup',
  model: 'auto',
  style: 'default',
  styles: ['default'],
  role_names: ['default', 'architect', 'writer', 'editor'],
  roles: {
    writer: {
      provider: '9Router',
      model: 'cx/luna',
      reasoning_effort: 'high',
      fallbacks: [{ provider: 'lingoreup', model: 'auto' }],
    },
  },
  providers: [
    { name: 'lingoreup', api_key_set: true, models: [{ name: 'auto', context_window: 128000 }] },
    { name: '9Router', api_key_set: true, models: [{ name: 'cx/luna', context_window: 272000 }] },
    { name: 'kiraai', api_key_set: true, models: [{ name: 'kira-mini', context_window: 64000, json_schema: true }] },
    { name: 'chuaKhoa', api_key_set: false, models: [{ name: 'x1' }] },
  ],
  presets: [],
  engine_open: [],
};

let DU: CauHinhDoc = GOC;

vi.mock('@/lib/api', async (goc) => ({
  ...(await goc<typeof import('@/lib/api')>()),
  layCauHinh: () => Promise.resolve(DU),
  luuCauHinh: (...a: unknown[]) => LUU(...(a as [])),
  lietKeModel: (p: string) => LIET_KE(p),
  apDungCauHinh: (b: string) => AP_DUNG(b),
}));

const { CauHinhXuong } = await import('./CauHinhXuong');

beforeEach(() => {
  cleanup();
  DU = GOC;
  LUU.mockClear();
  LIET_KE.mockReset();
  AP_DUNG.mockClear();
});

async function dung() {
  render(<CauHinhXuong />);
  await waitFor(() => expect(document.querySelector('.chDangDung')).not.toBeNull());
  return within(document.querySelector<HTMLElement>('.chDangDung')!);
}

function dongVai(ten: string): HTMLElement {
  const d = Array.from(document.querySelectorAll<HTMLElement>('.chDongVai')).find(
    (x) => x.querySelector('.chTenVai')?.textContent === ten,
  );
  expect(d, `không thấy dòng vai ${ten}`).toBeDefined();
  return d!;
}

function thanCuoi(): Record<string, unknown> {
  return LUU.mock.calls.at(-1)?.[0] as Record<string, unknown>;
}

/** Mở ô chọn model qua nhãn truy cập rồi bấm một dòng. */
function chonTrong(nhan: RegExp, model: string, nhom?: string) {
  fireEvent.click(screen.getByRole('button', { name: nhan }));
  const ds = screen.getByRole('listbox');
  const pham = nhom ? within(within(ds).getByRole('group', { name: nhom })) : within(ds);
  fireEvent.click(pham.getByRole('option', { name: new RegExp(model.replace(/[/.]/g, '\\$&')) }));
}

test('vẽ được mặc định và MỌI vai sau khi cấu hình về — không ném lỗi thứ tự hook', async () => {
  const the = await dung();
  expect(the.getByText('Model mặc định')).toBeDefined();
  for (const v of ['Kiến trúc sư', 'Người viết', 'Biên tập viên', 'Điều phối']) dongVai(v);
});

test('vai theo mặc định hiện CẶP thừa hưởng; vai đặt riêng có lối quay về mặc định', async () => {
  await dung();
  const kts = dongVai('Kiến trúc sư');
  expect(kts.textContent).toMatch(/lingoreup·auto/);
  expect(kts.textContent).toMatch(/theo mặc định/);
  expect(within(kts).queryByRole('button', { name: 'Dùng mặc định' })).toBeNull();

  const nv = dongVai('Người viết');
  expect(nv.textContent).toMatch(/9Router·cx\/luna/);
  expect(nv.textContent).toMatch(/đặt riêng/);
  expect(within(nv).getByRole('button', { name: 'Dùng mặc định' })).toBeDefined();
  // Điều phối không có ô chọn — host.arbiterModel luôn dùng mặc định.
  expect(within(dongVai('Điều phối')).queryAllByRole('button')).toHaveLength(0);
});

test('chọn riêng một vai GIỮ fallbacks và độ suy luận của vai khác (B5)', async () => {
  await dung();
  chonTrong(/Biên tập viên/, 'kira-mini', 'kiraai');
  await waitFor(() => expect(LUU).toHaveBeenCalled());
  const roles = thanCuoi().roles as Record<string, Record<string, unknown>>;
  expect(roles.editor).toEqual({ provider: 'kiraai', model: 'kira-mini' });
  expect(roles.writer, 'lưu vai Biên tập viên đã xóa ý định riêng của Người viết').toEqual(GOC.roles!.writer);
  expect(thanCuoi().provider_config, 'model đã khai thì không khai lại').toBeUndefined();
  await waitFor(() => expect(within(dongVai('Biên tập viên')).getByText('Đã lưu')).toBeDefined());
});

test('"Dùng mặc định" gỡ đúng vai đó, các vai khác đi qua nguyên vẹn', async () => {
  DU = { ...GOC, roles: { ...GOC.roles, editor: { provider: 'kiraai', model: 'kira-mini' } } };
  await dung();
  fireEvent.click(within(dongVai('Biên tập viên')).getByRole('button', { name: 'Dùng mặc định' }));
  await waitFor(() => expect(LUU).toHaveBeenCalled());
  const roles = thanCuoi().roles as Record<string, unknown>;
  expect(Object.keys(roles)).toEqual(['writer']);
  expect(roles.writer).toEqual(GOC.roles!.writer);
});

test('không còn vai đặt riêng ở nơi khác thì đổi mặc định ghi THẲNG, không hỏi', async () => {
  DU = { ...GOC, roles: undefined };
  await dung();
  chonTrong(/Đổi model — Model mặc định/, 'kira-mini', 'kiraai');
  await waitFor(() => expect(LUU).toHaveBeenCalled());
  expect(thanCuoi()).toEqual({ provider: 'kiraai', model: 'kira-mini' });
  expect(screen.queryByRole('dialog', { name: /Chuyển model mặc định/ })).toBeNull();
});

test('còn vai đặt riêng ở nơi khác thì HỎI, và "Chỉ đổi mặc định" gửi đúng model đã chọn (B3)', async () => {
  await dung();
  chonTrong(/Đổi model — Model mặc định/, 'kira-mini', 'kiraai');
  expect(LUU, 'chưa xác nhận mà đã ghi').not.toHaveBeenCalled();
  const hop = await screen.findByText(/Chuyển model mặc định sang kiraai/);
  const dialog = hop.closest('dialog')!;
  fireEvent.click(within(dialog).getByRole('button', { name: 'Chỉ đổi mặc định' }));
  await waitFor(() => expect(LUU).toHaveBeenCalled());
  expect(thanCuoi()).toEqual({ provider: 'kiraai', model: 'kira-mini' });
});

test('"Chuyển cả các vai" ghi mặc định lẫn vai đặt riêng trong MỘT lượt, giữ độ suy luận', async () => {
  await dung();
  chonTrong(/Đổi model — Model mặc định/, 'kira-mini', 'kiraai');
  const dialog = (await screen.findByText(/Chuyển model mặc định sang kiraai/)).closest('dialog')!;
  fireEvent.click(within(dialog).getByRole('button', { name: 'Chuyển cả các vai' }));
  await waitFor(() => expect(LUU).toHaveBeenCalledTimes(1));
  const than = thanCuoi() as { provider: string; model: string; roles: Record<string, Record<string, unknown>> };
  expect(than.provider).toBe('kiraai');
  expect(than.model).toBe('kira-mini');
  expect(than.roles.writer).toMatchObject({ provider: 'kiraai', model: 'kira-mini', reasoning_effort: 'high' });
  expect(Object.keys(than.roles), 'vai thừa hưởng không được biến thành đặt riêng').toEqual(['writer']);
});

test('chọn model vừa TẢI mà chưa khai thì khai nó trong cùng lượt ghi, giữ nguyên mục cũ', async () => {
  DU = { ...GOC, roles: undefined };
  LIET_KE.mockResolvedValue({ provider: 'kiraai', models: ['kira-mini', 'kira-pro'], count: 2, windows: { 'kira-pro': 200000 } });
  await dung();
  fireEvent.click(screen.getByRole('button', { name: /Đổi model — Người viết/ }));
  const nhom = within(within(screen.getByRole('listbox')).getByRole('group', { name: 'kiraai' }));
  fireEvent.click(nhom.getByRole('button', { name: 'Tải danh sách' }));
  await waitFor(() => expect(nhom.getByRole('option', { name: /kira-pro/ })).toBeDefined());
  fireEvent.click(nhom.getByRole('option', { name: /kira-pro/ }));
  await waitFor(() => expect(LUU).toHaveBeenCalled());
  expect(thanCuoi().provider_config).toEqual({
    name: 'kiraai',
    models: [{ name: 'kira-mini', context_window: 64000, json_schema: true }, { name: 'kira-pro', context_window: 200000 }],
  });
  expect((thanCuoi().roles as Record<string, unknown>).writer).toEqual({ provider: 'kiraai', model: 'kira-pro' });
});

test('ô tìm lọc theo tên model, và nhà cung cấp chưa có khóa không chọn được', async () => {
  await dung();
  fireEvent.click(screen.getByRole('button', { name: /Đổi model — Model mặc định/ }));
  const ds = screen.getByRole('listbox');
  expect(within(within(ds).getByRole('group', { name: 'chuaKhoa' })).queryAllByRole('option')).toHaveLength(0);
  fireEvent.change(screen.getByPlaceholderText(/Tìm model/), { target: { value: 'luna' } });
  const lua = within(ds).getAllByRole('option').map((o) => o.textContent);
  expect(lua).toHaveLength(1);
  expect(lua[0]).toMatch(/cx\/luna/);
});

test('vai trỏ vào model không còn trong danh sách thì nói ra ngay trên dòng của nó', async () => {
  DU = { ...GOC, roles: { editor: { provider: 'kiraai', model: 'kira-cu' } } };
  await dung();
  expect(dongVai('Biên tập viên').textContent).toMatch(/không còn trong danh sách/);
  expect(dongVai('Kiến trúc sư').textContent).not.toMatch(/không còn trong danh sách/);
});

test('truyện đang mở phiên: nói rõ, và "Áp dụng ngay" nạp lại vào phiên đó', async () => {
  DU = { ...GOC, engine_open: ['chay-thu'], engine_stale: ['chay-thu'] };
  render(<CauHinhXuong />);
  await waitFor(() => expect(screen.getByText(/chay-thu đang mở phiên/)).toBeDefined());
  DU = { ...DU, engine_stale: [] };
  fireEvent.click(screen.getByRole('button', { name: 'Áp dụng ngay cho chay-thu' }));
  await waitFor(() => expect(AP_DUNG).toHaveBeenCalledWith('chay-thu'));
  await waitFor(() => expect(screen.getByText(/chay-thu đang dùng thiết lập mới từ/)).toBeDefined());
  expect(screen.queryByText(/chay-thu đang mở phiên/)).toBeNull();
});
