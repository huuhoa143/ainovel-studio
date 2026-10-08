import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { snap, tongGia } from '@/components/mau.test-helper';
import type { Khu as KhuMa } from '@/lib/khu';
import { CHU } from '@/lib/nhan';
import type { Studio } from '@/lib/useStudio';
import { BO_DEM_RONG, themChu } from '@/lib/vanSong';

import Trang, { Khu } from './page';

/**
 * Studio giả cho bài kiểm tầng `Trang`.
 *
 * `useStudio` bị thay chứ không bị cho gọi thật: bài kiểm ở đây canh việc `Trang` NỐI DÂY,
 * và một `useStudio` thật sẽ biến nó thành bài kiểm về khả năng giả lập `fetch` + `EventSource`
 * của jsdom — đo nhầm thứ, và hỏng vì những lý do không liên quan.
 */
/**
 * Hành động mở-tại-khu, giữ làm spy: mắt cuối của sợi dây Xưởng chỉ đo được ở đây.
 */
const MO_TAI = vi.fn();

/**
 * Đổi khu, giữ làm spy: huy hiệu nghiệm thu ở thanh trên chỉ đo được tới đích ở tầng này.
 */
const CHON_KHU = vi.fn();

const STUDIO_GIA: Studio = {
  // `books` dựng lại từ chính `snap()` chứ không ép kiểu một object hai trường: thanh trên
  // đọc `b.activity` để vẽ đốm trạng thái, và một fixture ép kiểu làm `tsc` xanh trong khi
  // component nổ lúc chạy — đúng lớp lỗi mà `mau.test-helper.ts` ghi lại.
  workshop: { root: '/w', books: [snap({}).book] },
  tacPham: 'b',
  snapshot: snap({ agents: [], idle_agents: [] }),
  hoSo: undefined,
  chuongChon: undefined,
  khu: 'dong-san-xuat',
  man: 'xuong-san-xuat',
  song: undefined,
  suKien: [],
  vanSong: themChu(BO_DEM_RONG, 'nàng quay đầu lại'),
  ketNoi: 'song',
  dangTai: false,
  loi: undefined,
  chonTacPham: () => {},
  chonMan: () => {},
  chonChuong: () => {},
  chonKhu: CHON_KHU,
  moTacPhamVuaTao: () => {},
  moTacPhamTai: MO_TAI,
  docChuong: () => {},
  lamMoi: () => {},
  taiLai: () => {},
  banDungDaDoi: false,
};

vi.mock('@/lib/useStudio', () => ({ useStudio: () => STUDIO_GIA }));
vi.mock('@/lib/useMay', () => ({
  useMay: () => ({ canCaiDat: false, daHoi: true }),
}));

/**
 * jsdom KHÔNG hiện thực `scrollIntoView` — nó không bố cục nên không có gì để cuộn tới.
 * `Rail` gọi nó trong effect để kéo khu đang mở vào tầm nhìn, nên dựng cả `Trang` mà không
 * có mảnh vá này thì bài kiểm đỏ vì một lỗ hổng của môi trường, không vì mã.
 *
 * Vá TẠI ĐÂY chứ không ở `vitest.setup.giaodien.ts`: tệp đó vá một lỗi làm MỌI bài kiểm nói
 * dối; cái này chỉ chạm tới bài kiểm nào dựng `Rail`. Đặt vào setup chung là lặng lẽ tắt một
 * hành vi cho cả bộ kiểm, kể cả bài kiểm sau này muốn đo chính hành vi đó.
 */
Element.prototype.scrollIntoView = function () {
  /* jsdom không bố cục */
};

/**
 * LUẬT ĐỊNH TUYẾN — việc DUY NHẤT còn lại của `page.tsx` sau Task 13.
 *
 * Gọi thẳng `Khu` chứ không dựng `Trang`: `Trang` gọi `useStudio`, tức mạng, tức một bộ kiểm
 * canh định tuyến lại đi đo khả năng giả lập `fetch` của jsdom. `Khu` là một hàm thuần trên
 * đúng cái nó nhận.
 */
function ve(
  khu: KhuMa,
  vanSong = BO_DEM_RONG,
  p: Partial<Parameters<typeof Khu>[0]> = {},
) {
  return render(
    <Khu
      khu={khu}
      snapshot={snap({ agents: [], idle_agents: [] })}
      sach={[snap({}).book]}
      tong={tongGia()}
      tacPham="b"
      vuaChot={new Set<number>()}
      chuongChon={undefined}
      onChonChuong={() => {}}
      onChonKhu={() => {}}
      onDocChuong={() => {}}
      onChonTacPham={() => {}}
      onMoTacPham={() => {}}
      onXoaXong={() => {}}
      onXongTaoSach={() => {}}
      onChotCungDung={() => {}}
      onDoiCauHinh={() => {}}
      onDoi={() => {}}
      nhapSan=""
      suKien={[]}
      song={undefined}
      vanSong={vanSong}
      dangChay
      {...p}
    />,
  );
}

test('khu dòng sản xuất → buồng lái', () => {
  const { container } = ve('dong-san-xuat');
  expect(container.querySelector('.buonglai')).not.toBeNull();
});

test('khu KHÁC → không phải buồng lái', () => {
  // Nửa còn lại của luật, và nó cần một bài riêng: một `default` trả buồng lái cho MỌI khu
  // vẫn làm bài trên xanh, trong khi hệ quả là mười lăm bề mặt kia biến mất.
  const { container } = ve('to-san-xuat');
  expect(container.querySelector('.buonglai')).toBeNull();
  expect(container.querySelector('.khuto')).not.toBeNull();
});

test('khu không đọc được rơi về buồng lái, KHÔNG rơi vào màn hình trắng', () => {
  // `KHU_MAC_DINH` là khu được chọn khi URL không nói gì; buồng lái nằm ở `default` để một
  // khu mới thêm vào mà quên viết `case` cũng rơi về đây. Ép kiểu vì luật này chỉ có nghĩa
  // với một giá trị mà kiểu KHÔNG cho phép — đó chính là ca nó tồn tại để đỡ.
  const { container } = ve('khu-chua-co' as KhuMa);
  expect(container.querySelector('.buonglai')).not.toBeNull();
});

test('buồng lái nhận bộ đệm văn sống đi qua tầng định tuyến', () => {
  // Sợi dây `useStudio.vanSong` → `Trang` → `Khu` → `BuongLai` → `VanSong` đứt ở tầng này
  // thì khu đắt nhất màn hình im lặng mà không có lỗi nào nổ ra.
  ve('dong-san-xuat', themChu(BO_DEM_RONG, 'nàng quay đầu lại'));
  expect(screen.getByText('nàng quay đầu lại')).toBeDefined();
});

test('`Trang` nối bộ đệm văn sống THẬT của studio xuống buồng lái', () => {
  // Mắt CUỐI của sợi dây, và là mắt duy nhất không nằm trong `Khu`. Đã đo bằng đột biến:
  // đổi `vanSong={s.vanSong}` thành một bộ đệm rỗng dựng tại chỗ thì cả bộ kiểm vẫn xanh —
  // vì không bài nào chạm tới `Trang`. Bài này là chỗ chạm đó.
  render(<Trang />);
  expect(screen.getByText('nàng quay đầu lại')).toBeDefined();
});

test('khu `xuong` → bảng Xưởng, không phải buồng lái', () => {
  const { container } = ve('xuong');
  expect(container.querySelector('.khuxuong')).not.toBeNull();
  expect(container.querySelector('.buonglai')).toBeNull();
});

test('`Trang` nối danh sách sách THẬT của studio xuống màn Xưởng', () => {
  // Mắt CUỐI của sợi dây `useStudio.workshop.books` → `Trang` → `Khu` → `Xuong`, và nó không
  // nằm trong `Khu`: bài kiểm ở trên truyền `sach` thẳng vào nên đổi `sach={s.workshop?.books
  // ?? []}` thành một mảng rỗng dựng tại chỗ vẫn xanh. Hệ quả thật là một Xưởng trống trơn
  // trên một xưởng có sách — cùng lớp với `vanSong={s.vanSong}` mà cụm D đã đo được.
  const truoc = STUDIO_GIA.khu;
  STUDIO_GIA.khu = 'xuong';
  try {
    const { container } = render(<Trang />);
    expect(container.querySelector('.khuxuong .keLuoi [data-ma="b"]')).not.toBeNull();
  } finally {
    STUDIO_GIA.khu = truoc;
  }
});

test('`Trang` nối cửa duyệt lên rail, và nút chờ duyệt hiện ở khu KHÁC buồng lái', () => {
  // Mắt cuối của sợi dây `snapshot.advance` → `Trang` → `ThanhTren`, và cùng lúc là phép đo
  // DUY NHẤT cho luật "huy hiệu phải thấy từ MỌI bề mặt". Bộ kiểm của `ThanhTren` dựng
  // component thẳng nên nó không biết gì về việc huy hiệu nằm trong hay ngoài `Khu`; đặt nhầm
  // nó vào một bề mặt thì cả bộ vẫn xanh, trong khi hệ quả là một dây chuyền đang đứng chờ bị
  // ẩn sau một lựa chọn điều hướng.
  //
  // Khu `chi-phi` chứ không phải buồng lái: đó là ca mà luật này tồn tại để đỡ.
  const truocKhu = STUDIO_GIA.khu;
  const truocSnap = STUDIO_GIA.snapshot;
  STUDIO_GIA.khu = 'chi-phi';
  STUDIO_GIA.snapshot = snap({
    agents: [],
    idle_agents: [],
    advance: { mode: 'review', hold: true, permit_chapter: 8 },
  });
  try {
    render(<Trang />);
    expect(screen.getByRole('button', { name: CHU.nghiemThuChoBan })).toBeDefined();
  } finally {
    STUDIO_GIA.khu = truocKhu;
    STUDIO_GIA.snapshot = truocSnap;
  }
});

test('bấm huy hiệu ở `Trang` gọi hành động đổi khu THẬT của studio', () => {
  // ĐO ĐƯỢC: thay `onChonKhu={s.chonKhu}` của thanh trên bằng một hàm rỗng thì cả 14 bài vẫn
  // xanh — bộ kiểm của `ThanhTren` truyền spy CỦA CHÍNH NÓ vào, nên nó chỉ chứng minh
  // component gọi đúng tham số, không chứng minh nó được nối vào hành động thật. Hệ quả: một
  // huy hiệu amber bấm vào không đi đâu cả, và không lỗi nào nổ ra.
  //
  // Lần thứ tư của cùng lớp lỗi trong dự án này — sau `vanSong={s.vanSong}` (cụm D),
  // `sach={s.workshop?.books}` và `onMoTacPham={s.moTacPhamTai}` (cụm Xưởng).
  const truocKhu = STUDIO_GIA.khu;
  const truocSnap = STUDIO_GIA.snapshot;
  STUDIO_GIA.khu = 'chi-phi';
  STUDIO_GIA.snapshot = snap({
    agents: [],
    idle_agents: [],
    advance: { mode: 'review', hold: true, permit_chapter: 8 },
  });
  CHON_KHU.mockClear();
  try {
    render(<Trang />);
    fireEvent.click(screen.getByRole('button', { name: CHU.nghiemThuChoBan }));
    expect(CHON_KHU).toHaveBeenCalledWith('kiem-dinh');
  } finally {
    STUDIO_GIA.khu = truocKhu;
    STUDIO_GIA.snapshot = truocSnap;
  }
});

test('`Trang` KHÔNG vẽ huy hiệu khi engine đóng (advance null)', () => {
  // Vế ngược, và nó cần một bài riêng: một `ThanhTren` luôn vẽ huy hiệu vẫn làm bài trên xanh.
  // `snap()` để `advance: null` theo mặc định — đúng ca engine đóng.
  render(<Trang />);
  expect(screen.queryByRole('button', { name: CHU.nghiemThuChoBan })).toBeNull();
});

test('CÙNG một snapshot thì cả buồng lái và Kiểm định đều vẽ dải quyết định', () => {
  // Bài kiểm mà Task 5 đòi thẳng, và nó là phép đo duy nhất cho luật "MỘT component cho hai bề
  // mặt": hai bộ kiểm riêng của hai bề mặt đều xanh nếu một bên gắn dải mà bên kia quên, vì
  // không bài nào của chúng biết bên kia tồn tại.
  //
  // Đi qua `Khu` chứ không dựng hai component thẳng: tầng định tuyến là chỗ prop được rót vào,
  // nên đây cũng là chỗ đo được việc `Khu` truyền `advance`/`onDoi` xuống CẢ HAI nhánh
  // `case`. Gắn đủ cho một nhánh rồi quên nhánh kia là ca thật.
  const cho = { advance: { mode: 'review', hold: true, permit_chapter: 8 } };

  const a = ve('dong-san-xuat', BO_DEM_RONG, { snapshot: snap({ ...cho }) });
  expect(a.container.querySelector('.cuanghiemthu')).not.toBeNull();

  const b = ve('kiem-dinh', BO_DEM_RONG, { snapshot: snap({ ...cho }) });
  expect(b.container.querySelector('.cuanghiemthu')).not.toBeNull();
});

test('`Trang` nối hành động mở-tại-khu THẬT của studio xuống nút `Mở` của Xưởng', () => {
  // ĐO ĐƯỢC: thay `onMoTacPham={s.moTacPhamTai}` bằng một hàm rỗng thì cả 34 bài vẫn xanh.
  // Bộ kiểm của `Xuong` truyền spy của chính nó vào, nên nó chỉ chứng minh component GỌI
  // đúng — không chứng minh nó được nối vào hành động thật. Hệ quả: mọi nút trên bảng bấm
  // vào không đi đâu cả, và không lỗi nào nổ ra. Cùng lớp với `vanSong={s.vanSong}` của cụm D
  // và với `sach={s.workshop?.books}` ngay trên.
  const truoc = STUDIO_GIA.khu;
  STUDIO_GIA.khu = 'xuong';
  MO_TAI.mockClear();
  try {
    const { container } = render(<Trang />);
    fireEvent.click(container.querySelector<HTMLElement>('.khuxuong .keLuoi [data-ma="b"] button')!);
    expect(MO_TAI).toHaveBeenCalledWith('b', 'dong-san-xuat');
  } finally {
    STUDIO_GIA.khu = truoc;
  }
});
