import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

import { snap } from '@/components/mau.test-helper';
import { LoiApi } from '@/lib/api';
import { CH } from '@/lib/chu/cau-hinh';
import { LOI_LLM } from '@/lib/chu/tien-do';
import { TU_TRUYEN as T } from '@/lib/chu/tu-truyen';
import type { Khu } from '@/lib/khu';
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

/**
 * Tạo truyện với khóa sai: server trả 400 kèm nguyên văn lỗi của nhà cung cấp — đúng hình
 * `writeErr(maLoi(err), err)` khi `PrepareQuick` (lượt Arbiter đầu tiên) bị từ chối.
 */
const TAO = vi.fn((): Promise<{ book: string; dir: string; state: string }> =>
  Promise.reject(
    new LoiApi('arbiter: POST /chat/completions: 401 Unauthorized: invalid_api_key', 400),
  ),
);

vi.mock('@/lib/api', async (goc) => ({
  ...(await goc<typeof import('@/lib/api')>()),
  LA_MOCK: false,
  layCauHinh: () => LAY(),
  luuCauHinh: () => LUU(),
  taoSach: () => TAO(),
}));

beforeEach(() => {
  // Bản nháp tạo truyện sống trong localStorage — bài trước không được để lại chữ cho bài sau.
  localStorage.clear();
  hienTai = CHUA_CAI;
  LAY.mockClear();
  LUU.mockClear();
  TAO.mockClear();
});

// Xưởng rỗng: cài xong thì studio dẫn thẳng vào tạo tác phẩm — bằng chứng đã qua cửa cài đặt.
// `khu` là state THẬT của React: lối thoát khỏi ngõ cụt chính là đổi khu, nên một `chonKhu`
// rỗng sẽ làm bài kiểm xanh với đúng cái lỗi nó tồn tại để bắt.
vi.mock('@/lib/useStudio', async () => {
  const { useState } = await import('react');
  return {
    useStudio: (): Studio => {
      const [khu, chonKhu] = useState<Khu>('xuong');
      return {
        workshop: { root: '/w', books: [] },
        tacPham: undefined,
        snapshot: snap({}),
        hoSo: undefined,
        chuongChon: undefined,
        khu,
        song: undefined,
        suKien: [],
        vanSong: BO_DEM_RONG,
        ketNoi: 'khong',
        dangTai: false,
        loi: undefined,
        chonTacPham: () => {},
        chonChuong: () => {},
        chonKhu,
        moTacPhamVuaTao: () => {},
        moTacPhamTai: () => {},
        docChuong: () => {},
        lamMoi: () => {},
        taiLai: () => {},
      } as unknown as Studio;
    },
  };
});

Element.prototype.scrollIntoView = function () {
  /* jsdom không bố cục */
};

const { default: Trang } = await import('./page');

/** Điền và lưu biểu mẫu cài lần đầu với một khóa (có thể sai — server không kiểm lúc lưu). */
async function caiLanDau() {
  await waitFor(() =>
    expect(document.querySelector('input[placeholder="openrouter"]')).not.toBeNull(),
  );
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
}

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
  // Câu gợi ý gọi đúng tên hai bước theo thứ tự: chọn nhà cung cấp, rồi dán khóa ở Kết nối.
  const goiY = screen.getByText(CH.goiYKhoaLanDau).textContent ?? '';
  expect(goiY).toContain(CH.buoc1);
  expect(goiY).toContain(CH.buoc2);
  expect(goiY.indexOf(CH.buoc1)).toBeLessThan(goiY.indexOf(CH.buoc2));

  // Biểu mẫu chỉ dựng sau khi tờ cấu hình về.
  await caiLanDau();
  // Server đã báo `needs_setup: false` → studio mở ra ngay (xưởng rỗng → tạo tác phẩm).
  await waitFor(() =>
    expect(screen.getByRole('heading', { level: 1, name: CHU.taoTacPham })).toBeDefined(),
  );
  expect(screen.queryByText(CH.goiYKhoaLanDau)).toBeNull();
  expect(LAY.mock.calls.length, 'useMay phải hỏi lại /api/config sau khi lưu').toBeGreaterThan(1);
});

test('khóa sai: tạo truyện hỏng → nút Sửa khóa API → màn cấu hình → về tạo truyện', async () => {
  render(<Trang />);
  await waitFor(() =>
    expect(screen.getByRole('heading', { level: 1, name: CH.tieuDeLanDau })).toBeDefined(),
  );
  await caiLanDau();

  // Lưu xong: `needs_setup` đã false, xưởng rỗng → biểu mẫu tạo truyện, KHÔNG có rail.
  await waitFor(() =>
    expect(screen.getByRole('heading', { level: 1, name: CHU.taoTacPham })).toBeDefined(),
  );
  fireEvent.change(document.querySelector<HTMLTextAreaElement>('#tpm-y')!, {
    target: { value: 'truyen trinh tham ven song' },
  });
  fireEvent.click(screen.getByRole('button', { name: CHU.batDauViet }));
  await waitFor(() => expect(TAO).toHaveBeenCalled());

  // Lỗi nói tiếng người, không phải nguyên văn `401 Unauthorized: invalid_api_key`.
  const bao = await screen.findByRole('alert');
  expect(bao.textContent).toContain(LOI_LLM.khoaBiTuChoi('thu'));
  expect(bao.textContent).not.toContain('invalid_api_key');

  // Lối ra: nút đi thẳng tới màn nhập khóa.
  fireEvent.click(screen.getByRole('button', { name: T.suaKhoaApi }));
  await waitFor(() =>
    expect(screen.getByRole('heading', { level: 1, name: CH.tieuDe })).toBeDefined(),
  );
  // Màn cấu hình ở xưởng rỗng phải mang lối về — không có rail nào khác để bấm.
  fireEvent.click(screen.getByRole('button', { name: T.veTaoTruyen }));
  await waitFor(() =>
    expect(screen.getByRole('heading', { level: 1, name: CHU.taoTacPham })).toBeDefined(),
  );
  // Và đoạn mô tả vừa gõ vẫn còn: sửa khóa xong là bấm lại được ngay, không phải viết lại.
  expect(document.querySelector<HTMLTextAreaElement>('#tpm-y')!.value).toBe(
    'truyen trinh tham ven song',
  );
});

test('bản nháp tạo truyện: sang cấu hình rồi về vẫn còn; tạo thành công thì xóa', async () => {
  hienTai = DA_CAI;
  const { unmount } = render(<Trang />);
  await waitFor(() =>
    expect(screen.getByRole('heading', { level: 1, name: CHU.taoTacPham })).toBeDefined(),
  );
  const moTa = 'Một nữ thám tử điều tra chuỗi mất tích ở trấn ven sông, giọng tiết chế.';
  fireEvent.change(document.querySelector<HTMLTextAreaElement>('#tpm-y')!, {
    target: { value: moTa },
  });
  // Tên thư mục người dùng tự sửa trong Tùy chọn cũng phải sống sót, không bị sinh lại.
  fireEvent.change(screen.getByPlaceholderText('tran-tham-ven-song'), {
    target: { value: 'tham-tu-ven-song' },
  });

  // Đường sang thứ hai: "Đổi trong Model & khóa API" cạnh dòng Sẽ viết bằng.
  fireEvent.click(await screen.findByRole('button', { name: CHU.doiOCauHinh }));
  await waitFor(() =>
    expect(screen.getByRole('heading', { level: 1, name: CH.tieuDe })).toBeDefined(),
  );
  fireEvent.click(screen.getByRole('button', { name: T.veTaoTruyen }));
  await waitFor(() =>
    expect(screen.getByRole('heading', { level: 1, name: CHU.taoTacPham })).toBeDefined(),
  );
  expect(document.querySelector<HTMLTextAreaElement>('#tpm-y')!.value).toBe(moTa);
  expect(screen.getByPlaceholderText<HTMLInputElement>('tran-tham-ven-song').value).toBe(
    'tham-tu-ven-song',
  );

  // Tải lại trang (app desktop mở lại) cũng không mất.
  unmount();
  render(<Trang />);
  await waitFor(() =>
    expect(document.querySelector<HTMLTextAreaElement>('#tpm-y')?.value).toBe(moTa),
  );

  // Tạo thành công: bản nháp hết nhiệm vụ.
  TAO.mockImplementationOnce(() =>
    Promise.resolve({ book: 'tham-tu-ven-song', dir: '/w/tham-tu-ven-song', state: 'running' }),
  );
  fireEvent.click(screen.getByRole('button', { name: CHU.batDauViet }));
  await waitFor(() => expect(TAO).toHaveBeenCalled());
  await waitFor(() => expect(localStorage.getItem('ainovel.tacPhamMoi.banNhap')).toBeNull());
});

test('xưởng rỗng: Bàn ý tưởng mở được và có lối về tạo truyện', async () => {
  hienTai = DA_CAI;
  render(<Trang />);
  await waitFor(() =>
    expect(screen.getByRole('heading', { level: 1, name: CHU.taoTacPham })).toBeDefined(),
  );
  fireEvent.click(screen.getByRole('button', { name: T.banTruoc }));
  await waitFor(() =>
    expect(screen.getByRole('heading', { level: 1, name: CHU.cungDung })).toBeDefined(),
  );
  fireEvent.click(screen.getByRole('button', { name: T.veTaoTruyen }));
  await waitFor(() =>
    expect(screen.getByRole('heading', { level: 1, name: CHU.taoTacPham })).toBeDefined(),
  );
});
