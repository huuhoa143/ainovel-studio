import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

import { DIEU_KHIEN, DONG_PHIEN } from '@/lib/chu/tien-do';
import { CHU } from '@/lib/nhan';
import type { Snapshot } from '@/lib/types';

import { DieuKhien } from './DieuKhien';
import { snap } from './mau.test-helper';

/**
 * Bộ kiểm cho thanh điều khiển. Repo chưa từng có tệp này; nó ra đời cùng Task 6, và không có
 * nó thì việc bỏ nguồn thứ hai của `advance_mode` không có hàng rào nào — nhãn chế độ sẽ lặng
 * lẽ quay về `/settings` ngày ai đó "sửa lại cho chắc".
 *
 * # Hai phép đo cho cùng một câu "KHÔNG gọi mạng để biết chế độ"
 *
 * `LAY_CAI_DAT` bắt đường đi qua `lib/api.ts`; `FETCH` bắt đường ai đó gọi thẳng `fetch`. Một
 * mình phép đo thứ nhất không đủ — nó chỉ canh đúng một cái tên hàm.
 *
 * Và cả hai đều KHÔNG BAO GIỜ resolve. Đó là điều kiện để bài kiểm đo đúng thứ nó nói: một
 * mock trả sẵn `advance_mode` sẽ cho ra nhãn đúng vì lý do sai, và lúc đó bài kiểm xanh trong
 * khi component vẫn phụ thuộc mạng.
 */
const LAY_CAI_DAT = vi.fn(() => new Promise<never>(() => {}));

vi.mock('@/lib/api', async (goc) => ({
  ...(await goc<typeof import('@/lib/api')>()),
  layCaiDat: (...a: unknown[]) => LAY_CAI_DAT(...(a as [])),
  doiCheDoTien: (...a: unknown[]) => DOI_CHE_DO(...a),
}));

const DOI_CHE_DO = vi.fn();
const FETCH = vi.fn(() => new Promise<never>(() => {}));

const ON_DOI = vi.fn();

beforeEach(() => {
  LAY_CAI_DAT.mockClear();
  DOI_CHE_DO.mockReset().mockResolvedValue({ mode: 'review', permit_chapter: 0, has_hold: false });
  FETCH.mockClear();
  ON_DOI.mockReset();
  vi.stubGlobal('fetch', FETCH);
});

/** Máy ĐANG MỞ cho cuốn này là ca thường: `advance` non-null nghĩa đúng thế. */
function ve(p: Partial<Snapshot> = {}, dangChay = false) {
  return render(
    <DieuKhien
      snapshot={snap(p)}
      tacPham="tran-yeu-ky"
      choGhi
      dangChay={dangChay}
      onDoi={ON_DOI}
    />,
  );
}

const REVIEW = { mode: 'review', hold: false } as const;
const AUTO = { mode: 'auto', hold: false } as const;

/* ── chế độ đọc từ snapshot, không từ /settings ─────────────────────────── */

test('chế độ nghiệm thu suy từ `snapshot.advance`, KHÔNG cần một lời gọi mạng nào', () => {
  ve({ advance: { ...REVIEW } });

  expect(screen.getByRole('button', { name: CHU.cheDoNghiemThu })).toBeDefined();

  // Hai phép đo cho cùng một câu. `/settings` là endpoint mà nhãn này TỪNG đọc, nên nó là
  // đúng chuỗi phải vắng mặt.
  expect(LAY_CAI_DAT).not.toHaveBeenCalled();
  for (const [u] of FETCH.mock.calls as unknown as [string][]) {
    expect(String(u)).not.toContain('settings');
  }
});

test('chế độ tự chạy cũng suy từ snapshot — vế ngược', () => {
  // Cần bài riêng: một nhãn viết cứng thành `cheDoNghiemThu` vẫn làm bài trên xanh, và hệ quả
  // là một thanh transport nói "Nghiệm thu từng chương" trên một engine đang chạy liên tục.
  ve({ advance: { ...AUTO } });

  // Hợp đồng MỚI: cả hai lựa chọn luôn hiện, cái đang bật mang `aria-pressed` và không bấm
  // được. Bản trước chỉ vẽ MỘT nút mang nhãn là trạng thái hiện tại — xem chú thích trong
  // DieuKhien.tsx về vì sao kiểu nút đó không đọc ra được là "đang bật" hay "bấm để bật".
  const tuChay = screen.getByRole('button', { name: CHU.cheDoTuChay });
  const nghiemThu = screen.getByRole('button', { name: CHU.cheDoNghiemThu });
  expect(tuChay.getAttribute('aria-pressed')).toBe('true');
  expect(nghiemThu.getAttribute('aria-pressed')).toBe('false');
  // Cái đang bật không bấm được: bấm lại chế độ đang chạy là một lời gọi API không làm gì.
  expect((tuChay as HTMLButtonElement).disabled).toBe(true);
  expect(LAY_CAI_DAT).not.toHaveBeenCalled();
});

test('`Cho đi tiếp` chỉ có ở chế độ nghiệm thu', () => {
  // Ở chế độ tự chạy engine không chờ giấy phép nào, nên một nút cấp phép ở đó không làm gì.
  ve({ advance: { ...REVIEW } });
  expect(screen.getByRole('button', { name: CHU.choDiTiep })).toBeDefined();

  // `cleanup()` giữa hai lượt vẽ: không có nó thì nút của lượt trước còn nằm trong
  // `document` và `queryByRole` thấy nó — bài kiểm khi đó đỏ (hoặc xanh) vì rác của chính
  // mình, không vì điều đang canh. Đúng lớp lỗi hạ tầng mà `vitest.setup.giaodien.ts` vá cho
  // ranh giới GIỮA CÁC BÀI; trong CÙNG một bài thì phải tự dọn.
  cleanup();

  ve({ advance: { ...AUTO } });
  expect(screen.queryByRole('button', { name: CHU.choDiTiep })).toBeNull();
});

/* ── ca engine đóng: KHÔNG đo được, và không được vẽ thành "tự chạy" ────── */

test('`advance === null` thì KHÔNG vẽ chế độ nào — "tự chạy" là một khẳng định chưa ai đo', () => {
  // Đây là ca chịu lực của Task 6. `null` nghĩa engine ĐÓNG nên không đo được, KHÔNG nghĩa là
  // auto (`serve.go:325` chỉ gán `advance` khi `may.dangMo(id)` thành công). Vẽ "Tự chạy liên
  // tục" ở đó là đúng lớp lỗi `null`-đọc-thành-một-phép-đo mà cả hợp đồng `/studio` giữ, và nó
  // đã gây một lỗi thật ở kế hoạch 2/4.
  //
  // Và nó còn sai về chức năng, không chỉ về lời: `PUT /advance-mode` tự đòi `may.dangMo(book)`
  // (`vongdoi.go:41`), nên trên một engine đã đóng cái nút đó chắc chắn trả lỗi. Vẽ nó là mời
  // bấm một nút không bấm được.
  ve();

  expect(screen.queryByRole('button', { name: CHU.cheDoTuChay })).toBeNull();
  expect(screen.queryByRole('button', { name: CHU.cheDoNghiemThu })).toBeNull();
  expect(screen.queryByRole('button', { name: CHU.choDiTiep })).toBeNull();
});

test('`advance === null` KHÔNG làm mất nút Chạy — bề mặt vẫn điều khiển được', () => {
  // Vế ngược của bài trên, và nó cần đứng riêng: "ẩn cả thanh khi không đo được chế độ" cũng
  // làm bài trên xanh, trong khi hệ quả là mất đường chạy engine — đúng cái "ngõ chết" mà chú
  // thích của nhánh `maMoy === false` đã ghi bằng lời của người dùng.
  ve();
  expect(screen.getByRole('button', { name: `▶ ${CHU.chay}` })).toBeDefined();
});

test('engine đóng thì bộ nút ĐÚNG NGAY khung hình đầu — không đổi hình sau một lượt gọi mạng', () => {
  // Cái "khựng" mà người vận hành thấy mỗi lần đổi cuốn, ĐO ĐƯỢC:
  //
  // Bản trước hỏi `/api/engine` trong một `useEffect` và giữ kết quả ở `maMoy`, khởi tạo `null`.
  // Mà `null` rơi vào nhánh "engine đang mở", nên một cuốn ĐÃ ĐÓNG máy được vẽ với bộ nút của
  // engine đang mở — có cả `Đóng máy` — rồi vài trăm mili-giây sau mới đổi hình thành
  // `[Mở máy][▶ Chạy]`.
  //
  // `FETCH` ở tệp này KHÔNG BAO GIỜ resolve, nên trạng thái ở đây đúng là khung hình đầu tiên:
  // nếu component còn chờ mạng thì `Mở máy` chưa thể có mặt.
  ve();

  expect(
    screen.getByRole('button', { name: CHU.moMay }),
    'khung hình đầu chưa có Mở máy — thanh vẫn đang chờ một lượt gọi mạng',
  ).toBeDefined();
  expect(
    screen.queryByRole('button', { name: CHU.dongMay }),
    'engine đóng mà vẽ nút Đóng máy — đúng bộ nút sai của khung hình đầu',
  ).toBeNull();
});

test('KHÔNG gọi mạng để biết engine có mở không', () => {
  // Cùng lớp hàng rào với hai bài "chế độ suy từ snapshot": chặn ngày ai đó thêm lại
  // `fetch('/api/engine')` cho chắc. Một nguồn sự thật, không phải hai.
  ve({ advance: AUTO });
  expect(FETCH, `thanh điều khiển gọi mạng: ${FETCH.mock.calls.length} lượt`).not.toHaveBeenCalled();
});

/* ── đổi chế độ ────────────────────────────────────────────────────────── */

test('bấm một lựa chọn gửi ĐÚNG chế độ đó, rồi nạp lại snapshot', async () => {
  // Không tự đoán trạng thái mới: `SetAdvanceMode` chạm engine THẬT (`vongdoi.go:46`) và
  // `snapshot.advance.mode` đọc từ cùng `p.eng.Snapshot()` đó, nên đường về đúng là nạp lại
  // snapshot. Tự `datCheDo(r.mode)` là dựng lại một bản thứ hai của cùng sự thật.
  ve({ advance: { ...REVIEW } });

  // Đang ở `review`, bấm `Tự chạy` phải gửi ĐÚNG 'auto'. Hợp đồng cũ là "gửi chế độ ngược
  // lại của cái đang bật" — đúng kết quả nhưng sai cách nghĩ, và nó chỉ đúng khi có hai chế
  // độ. Giờ mỗi nút mang chế độ của chính nó.
  fireEvent.click(screen.getByRole('button', { name: CHU.cheDoTuChay }));

  expect(DOI_CHE_DO).toHaveBeenCalledWith('tran-yeu-ky', 'auto');
  await waitFor(() => expect(ON_DOI).toHaveBeenCalled());
});

test('đang tự chạy, bấm Nghiệm thu thì bật nghiệm thu', async () => {
  ve({ advance: { ...AUTO } });

  fireEvent.click(screen.getByRole('button', { name: CHU.cheDoNghiemThu }));

  expect(DOI_CHE_DO).toHaveBeenCalledWith('tran-yeu-ky', 'review');
  await waitFor(() => expect(ON_DOI).toHaveBeenCalled());
});

/* ── "Chạy tiếp" ở ca tạm dừng ──────────────────────────────────────────
 *
 * `runtime === 'paused'` nghĩa còn một lượt DỞ đang treo, khác hẳn `idle` (engine mở, rỗng
 * việc). Hai ca đó dẫn tới hai câu khác nhau cho cùng một nút, và người vận hành cần đúng
 * câu ấy trước khi bấm một thứ tiêu tiền: "Chạy" nghe như bắt đầu một lượt mới, còn thực tế
 * engine sẽ đi tiếp từ chỗ đang dở.
 */

test('runtime=paused thì nút hạng nhất là "Chạy tiếp", không phải "Chạy"', () => {
  ve({ runtime: 'paused', advance: { ...AUTO } });
  expect(screen.getByRole('button', { name: `▶ ${CHU.chayTiep}` })).toBeDefined();
  expect(screen.queryByRole('button', { name: `▶ ${CHU.chay}` })).toBeNull();
});

test('runtime=idle vẫn là "Chạy" — hai ca không được gộp', () => {
  // Vế ngược, và nó chịu lực: đổi nhãn thành "Chạy tiếp" ở MỌI ca cũng làm bài trên xanh,
  // rồi một cuốn chưa viết chữ nào mời bạn "chạy tiếp" từ hư không.
  ve({ runtime: 'idle', advance: { ...AUTO } });
  expect(screen.getByRole('button', { name: `▶ ${CHU.chay}` })).toBeDefined();
  expect(screen.queryByRole('button', { name: `▶ ${CHU.chayTiep}` })).toBeNull();
});

test('runtime=pausing thì KHÓA nút hạng nhất — lệnh dừng đã nhận rồi', () => {
  // Bấm Chạy giữa lúc engine đang thu dọn là một lượt gọi chắc chắn thất bại hoặc tệ hơn là
  // một lượt chạy chồng lên một lượt đang tắt.
  ve({ runtime: 'pausing', advance: { ...AUTO } }, true);
  const nut = screen.queryByRole('button', { name: `‖ ${CHU.dung}` });
  expect(nut).not.toBeNull();
  expect((nut as HTMLButtonElement).disabled).toBe(true);
});

/* ── thứ tự nút: hạng nhất SÁT MÉP PHẢI ─────────────────────────────────
 *
 * jsdom không bố cục nên đây là phép đo về THỨ TỰ DOM, không về toạ độ — vị trí thật đã đo
 * trên trình duyệt (bản cũ: nút Chạy dịch 107px khi bộ nút đổi từ 3 sang 4; bản mới: 0px).
 * Nhưng thứ tự DOM chính là thứ giữ toạ độ đứng yên, nên nó canh được đúng cái luật.
 *
 * Vì sao hạng nhất đứng cuối: cụm nút đã ghim mép phải rồi, nhưng nút hạng nhất đứng ĐẦU cụm
 * thì mỗi nút phụ thêm vào lại đẩy nó sang trái. Chạy và Dừng loại trừ nhau nên chúng dùng
 * chung một ô neo — đúng như bàn transport của DAW, nơi play–stop là một chỗ cố định.
 */

function tenNutTheoThuTu() {
  return [...document.querySelectorAll('.dieukhien button')].map((b) => b.textContent);
}

test('nút hạng nhất luôn là nút CUỐI, ở cả bốn bộ nút', () => {
  const boCanKiem: [string, Partial<Snapshot>, boolean, string][] = [
    ['engine đóng', {}, false, `▶ ${CHU.chay}`],
    ['mở · tự chạy', { advance: { ...AUTO } }, false, `▶ ${CHU.chay}`],
    ['mở · nghiệm thu', { advance: { ...REVIEW } }, false, `▶ ${CHU.chay}`],
    ['đang chạy · nghiệm thu', { advance: { ...REVIEW } }, true, `‖ ${CHU.dung}`],
  ];
  for (const [ten, p, chay, cuoi] of boCanKiem) {
    cleanup();
    ve(p, chay);
    const ds = tenNutTheoThuTu();
    expect(ds.length, ten).toBeGreaterThan(0);
    expect(ds[ds.length - 1], ten).toBe(cuoi);
  }
});

test('công tắc chế độ mang đủ TÊN TRỢ NĂNG, vì CSS ẩn nhãn nhóm ở màn hình hẹp', () => {
  // Bài này canh một hợp đồng giữa TSX và CSS, và nó chỉ đáng có kể từ khi hai bên chạm nhau.
  //
  // `globals.css` ẩn `.dkChonDe` và kẹp ellipsis nhãn nút khi thanh transport dưới 1.700px —
  // phép đổi để ba ô tiền (`giá thành` · `tổng` · `đã chạy`) không bị cắt ở 1512px. Đổi được
  // vì không mất tin nào: chữ "Chế độ đi tiếp" chuyển sang `aria-label` của nhóm, còn tên đầy
  // đủ của nút vẫn là nội dung văn bản nên nó vẫn là accessible name dù mắt chỉ thấy
  // "Nghiệm thu t…".
  //
  // Cái làm phép đổi đó hợp lệ nằm HOÀN TOÀN ở đây. Bỏ `aria-label` của nhóm, hay đổi nhãn
  // nút sang `aria-label` ngắn, thì người dùng trình đọc màn hình mất hẳn thông tin mà người
  // dùng mắt chỉ mất tạm — và không có gì trên màn hình nói ra chuyện đó.
  const { container } = ve({ advance: { ...REVIEW } });

  const nhom = container.querySelector('[role="group"].dkChon');
  expect(nhom, 'công tắc chế độ phải là một `group` có nhãn').not.toBeNull();
  expect(nhom!.getAttribute('aria-label')).toBe(CHU.cheDoDiTiep);

  // Mắt thấy nhãn NGẮN (để thanh dưới không cắt "Tự viết liên t…"); tên trợ năng vẫn là tên
  // ĐẦY ĐỦ, qua `aria-label` — người dùng trình đọc màn hình không mất gì.
  const nut = [...nhom!.querySelectorAll('button')];
  expect(nut.map((b) => b.getAttribute('aria-label'))).toEqual([CHU.cheDoTuChay, CHU.cheDoNghiemThu]);
  expect(nut.map((b) => b.textContent?.trim())).toEqual([DIEU_KHIEN.lienTuc, DIEU_KHIEN.tungChuong]);
});

test('đang chạy → Đóng phiên khóa và nói ĐÚNG lý do (không phải "cần mở phiên trước")', () => {
  ve({ advance: { ...AUTO } }, true);
  const nut = screen.getByRole('button', { name: CHU.dongMay }) as HTMLButtonElement;
  expect(nut.disabled).toBe(true);
  expect(nut.getAttribute('title')).toBe(DONG_PHIEN.khiDangChay);
  expect(nut.getAttribute('title')).not.toContain('mở phiên trước');
});

test('truyện đã xong: viết tiếp hạ xuống hàng phụ, tên "Viết thêm" — không phải nút vàng chính', () => {
  const { container } = ve({
    runtime: 'completed',
    advance: { ...AUTO },
    book: { ...snap({}).book, phase: 'complete', completed_chapters: 3, total_chapters: 3 },
  });
  expect(container.querySelector('.dkChay')).toBeNull();
  const nut = screen.getByRole('button', { name: DIEU_KHIEN.vietThem });
  expect(nut.className).toContain('dkPhu');
});
