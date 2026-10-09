import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

import { snap } from '@/components/mau.test-helper';
import { CHU } from '@/lib/nhan';
import type { Studio } from '@/lib/useStudio';
import { BO_DEM_RONG } from '@/lib/vanSong';

import Trang from './page';

/**
 * Mắt CUỐI của sợi dây mà Task 5 vừa nối: `s.lamMoi` đi từ `Trang` xuống dải quyết định của
 * cửa nghiệm thu.
 *
 * # Vì sao một tệp riêng chứ không thêm vào `page.test.tsx`
 *
 * Tệp này thay `@/lib/api` cho CẢ tệp (`vi.mock` là hoisted, không có phạm vi theo bài kiểm),
 * và `page.test.tsx` canh luật định tuyến trên một tầng mạng THẬT-nhưng-không-được-gọi. Gộp
 * lại là bắt mười ba bài định tuyến chạy trên một tầng API giả — và một ngày ai sửa mock sẽ
 * làm đỏ những bài không liên quan tới mạng. Cùng lý do cụm trước tách
 * `CuaNghiemThu.hanhdong.test.tsx`.
 *
 * # Vì sao phải dựng cả `Trang`
 *
 * Lần thứ NĂM của cùng một lớp lỗi trong dự án này — sau `vanSong={s.vanSong}` (cụm D),
 * `sach={s.workshop?.books}` + `onMoTacPham={s.moTacPhamTai}` (cụm Xưởng) và
 * `onChonKhu={s.chonKhu}` của thanh trên (cụm nghiệm thu). Bộ kiểm của `BuongLai`, `KiemDinh`
 * và `Khu` đều truyền giá trị CỦA CHÍNH NÓ vào, nên chúng chỉ chứng minh component dùng đúng
 * cái nó nhận. Chỗ `Trang` rót giá trị thật vào nằm ngoài tất cả.
 */
const CHO_DI_TIEP = vi.fn();
const LAM_MOI = vi.fn();
const TAI_LAI = vi.fn();

vi.mock('@/lib/api', async (goc) => ({
  ...(await goc<typeof import('@/lib/api')>()),
  choDiTiep: (...a: unknown[]) => CHO_DI_TIEP(...a),
}));

const MAY = { canCaiDat: false, daHoi: true };

const STUDIO_GIA: Studio = {
  workshop: { root: '/w', books: [snap({}).book] },
  tacPham: 'tran-yeu-ky',
  snapshot: snap({
    agents: [],
    idle_agents: [],
    advance: { mode: 'review', hold: true, permit_chapter: 8 },
  }),
  hoSo: undefined,
  chuongChon: undefined,
  khu: 'dong-san-xuat',
  man: 'xuong-san-xuat',
  song: undefined,
  suKien: [],
  vanSong: BO_DEM_RONG,
  ketNoi: 'song',
  dangTai: false,
  loi: undefined,
  chonTacPham: () => {},
  chonMan: () => {},
  chonChuong: () => {},
  chonKhu: () => {},
  moTacPhamVuaTao: () => {},
  moTacPhamTai: () => {},
  docChuong: () => {},
  lamMoi: LAM_MOI,
  taiLai: TAI_LAI,
  banDungDaDoi: false,
};

vi.mock('@/lib/useStudio', () => ({ useStudio: () => STUDIO_GIA }));
vi.mock('@/lib/useMay', () => ({ useMay: () => MAY }));

/** `Rail` gọi `scrollIntoView` trong effect; jsdom không bố cục nên không có hàm đó. */
Element.prototype.scrollIntoView = function () {
  /* jsdom không bố cục */
};

/**
 * Nút `Cho đi tiếp` CỦA DẢI, tra trong `.cuanghiemthu`.
 *
 * Phải khoanh vùng, và lý do là một sự thật về sản phẩm chứ không phải một mẹo kiểm thử: ở một
 * cửa đang chờ, thanh transport CŨNG vẽ một nút `Cho đi tiếp` (`DieuKhien` hiện nó khi chế độ
 * là `review`), nên trên cùng một màn hình có HAI nút cùng tên. Chúng gọi cùng một route nên
 * đây không phải lớp lỗi "hai sự thật" — nhưng một phép tra toàn cục sẽ đỏ vì "nhiều phần tử",
 * và nếu tra bừa một cái thì bài kiểm có thể đo nút của transport rồi tưởng mình đo nút của dải.
 *
 * Trước Task 6 chuyện này không lộ ra ở đây: tệp này không thay `layCaiDat`, nên nhãn chế độ
 * của transport không bao giờ về và nút kia không bao giờ hiện.
 */
const nutTiepCuaDai = (c: HTMLElement) =>
  [...c.querySelectorAll<HTMLButtonElement>('.cuanghiemthu button')].find(
    (n) => /^Duyệt(, viết chương| dàn ý)/.test(n.textContent ?? ''),
  )!;

beforeEach(() => {
  CHO_DI_TIEP.mockReset().mockResolvedValue({ permit_chapter: 9, running: true });
  LAM_MOI.mockReset();
  TAI_LAI.mockReset();
});

test('`Trang` nối `lamMoi` THẬT của studio vào dải — bấm Cho đi tiếp thì snapshot được nạp lại', async () => {
  // ĐO ĐƯỢC hệ quả nếu đứt: lệnh đi tới engine và thành công, nhưng snapshot không bao giờ về,
  // nên dải amber ở lại trên màn hình cho một cái cửa đã mở. Người vận hành bấm tiếp lần thứ
  // hai — và lần đó cấp phép thêm một chương nữa, tức tiền đôi vì một sợi dây thiếu.
  //
  // Không lỗi nào nổ ra ở ca đó, và không bài kiểm nào ngoài bài này chạm tới nó.
  const { container } = render(<Trang />);

  fireEvent.click(nutTiepCuaDai(container));

  expect(CHO_DI_TIEP).toHaveBeenCalledWith('tran-yeu-ky');
  await waitFor(() => expect(LAM_MOI).toHaveBeenCalled());
});

test('dải quyết định KHÔNG được nối `taiLai` — nó xóa trắng khu chữ đang chảy', () => {
  // Hai hàm cùng nạp lại snapshot, nên nối nhầm cái nào cũng làm bài trên xanh. Cái phân biệt
  // chúng nằm ở HƯ HẠI PHỤ, và nó chỉ đo được bằng một bài riêng: `taiLai` bơm `lanTai`, tức
  // chạy lại cả effect §2 của `useStudio` — mà effect đó `setSuKien([])`, `setSong(undefined)`,
  // `setVanSong(BO_DEM_RONG)` và đặt `seqRef.current = 0`.
  //
  // Nghĩa là: bấm `Cho đi tiếp` hay `Trả chương về viết lại` sẽ vứt đúng đoạn chữ vừa đọc để
  // quyết định, và dòng sự kiện mở lại từ ĐẦU hàng đợi thay vì từ chỗ đang đứng. Không có gì
  // đỏ, chỉ có một màn hình vừa trắng ra sau một cú bấm nút.
  const { container } = render(<Trang />);

  fireEvent.click(nutTiepCuaDai(container));

  expect(TAI_LAI).not.toHaveBeenCalled();
});

test('sợi dây `lamMoi` cũng liền ở bề mặt KIỂM ĐỊNH, không riêng buồng lái', async () => {
  // Hai bề mặt, hai chỗ nối, và bài trên chỉ đi qua một chỗ: `KiemDinh` truyền `onDoi` xuống
  // dải bằng một lời gọi RIÊNG, nên thay nó bằng một hàm rỗng vẫn để bài trên xanh.
  //
  // Và đây là bề mặt tệ nhất để hỏng: spec §7.3 gọi nó là chỗ người dùng đọc bằng chứng để
  // quyết định, tức chỗ nhiều người sẽ bấm nút nhất.
  const truoc = STUDIO_GIA.khu;
  STUDIO_GIA.khu = 'kiem-dinh';
  try {
    const { container } = render(<Trang />);
    fireEvent.click(nutTiepCuaDai(container));
    expect(CHO_DI_TIEP).toHaveBeenCalledWith('tran-yeu-ky');
    // `await` TRONG `try`, không `return` một lời hứa: `finally` chạy ngay lúc `return` được
    // định giá, nên bản `return` khôi phục `khu` trước khi `waitFor` xong — và bài kiểm khi đó
    // chờ một lời hứa trên một cây đã bị đổi dưới chân nó.
    await waitFor(() => expect(LAM_MOI).toHaveBeenCalled());
    expect(TAI_LAI).not.toHaveBeenCalled();
  } finally {
    STUDIO_GIA.khu = truoc;
  }
});

test('`Trang` truyền cửa THẬT từ snapshot — engine đóng thì không dải nào', () => {
  // Vế ngược của cả hai bài trên: một `page.tsx` dựng `advance` tại chỗ (hay một `Khu` luôn vẽ
  // dải) vẫn làm chúng xanh.
  const truoc = STUDIO_GIA.snapshot;
  STUDIO_GIA.snapshot = snap({ agents: [], idle_agents: [] });
  try {
    const { container } = render(<Trang />);
    expect(container.querySelector('.cuanghiemthu')).toBeNull();
  } finally {
    STUDIO_GIA.snapshot = truoc;
  }
});
