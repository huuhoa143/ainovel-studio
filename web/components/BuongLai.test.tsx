import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { TD } from '@/lib/chu/tien-do';
import { CHU } from '@/lib/nhan';
import type { Snapshot } from '@/lib/types';
import { BO_DEM_RONG, moLuot, themChu, type BoDemVan } from '@/lib/vanSong';

import { BuongLai } from './BuongLai';
import { snap } from './mau.test-helper';

/**
 * Ba bài đầu canh LUẬT ĐỔI DẢI (Task 12); phần còn lại canh việc Task 13 chuyển cả thân
 * `Canvas` vào đây mà không đánh rơi khối nào và không đứt sợi dây nào.
 *
 * `.vtt` chứ không phải `.viectieptheo` như kế hoạch ghi: `ViecTiepTheo` đã tồn tại từ trước
 * và lớp của nó là `vtt` (`app/globals.css` bám theo tên đó). Đổi tên lớp cho khớp kế hoạch
 * là sửa CSS của một dải đang chạy được, chỉ để một bài kiểm đọc đẹp hơn.
 */
function ve(
  dangChay: boolean,
  p: Partial<Snapshot> = {},
  vanSong: BoDemVan = BO_DEM_RONG,
  q: Partial<Parameters<typeof BuongLai>[0]> = {},
) {
  return render(
    <BuongLai
      snapshot={snap({ agents: [], idle_agents: [], ...p })}
      tacPham="b"
      vuaChot={new Set<number>()}
      chuongChon={undefined}
      onChonChuong={() => {}}
      onChonKhu={() => {}}
      onDocChuong={() => {}}
      onDoi={() => {}}
      suKien={[]}
      song={undefined}
      vanSong={vanSong}
      dangChay={dangChay}
      {...q}
    />,
  );
}

/* ── luật đổi dải (Task 12) ───────────────────────────────────────────── */

test('đang chạy → hiện dải trạng thái, KHÔNG hiện dải việc tiếp theo', () => {
  const { container } = ve(true);

  // Khung mang lớp `buonglai`. Lưới ba hàng của Task 13 và CSS của Task 14 đều bám vào đúng
  // tên đó, nên đổi tên nó là để cả buồng lái rơi về một chồng khối dọc mà không bài kiểm
  // nào lên tiếng (đã thử đột biến: bỏ lớp vẫn xanh).
  expect(container.querySelector('.buonglai')).not.toBeNull();
  expect(container.querySelector('.daitrangthai')).not.toBeNull();
  // Hiện CẢ HAI cũng là sai, không chỉ hiện nhầm: một dải "việc tiếp theo" lúc máy đang chạy
  // là mời người dùng bấm một nút thứ hai trong khi một lượt đang tiêu tiền.
  expect(container.querySelector('.vtt')).toBeNull();
});

test('máy nghỉ → hiện dải việc tiếp theo, KHÔNG hiện dải trạng thái', () => {
  const { container } = ve(false);

  expect(container.querySelector('.vtt')).not.toBeNull();
  expect(container.querySelector('.daitrangthai')).toBeNull();
});

test('dải việc tiếp theo được cho biết máy đang NGHỈ, không phải đang chạy', () => {
  // Hai bài trên chỉ hỏi dải nào có mặt, nên chúng vẫn xanh nếu `dangChay` bị nhét cứng
  // thành `true` lúc truyền xuống. Dải đó suy CẢ câu trạng thái lẫn nút từ cờ này: nhét cứng
  // là để nó nói "Máy đang viết" ngay dưới một thanh transport đang đứng im.
  const { container } = ve(false);

  expect(container.querySelector('.vtt')!.textContent).toContain(CHU.ttNghi(1, 3));
});

/* ── dải quyết định của cửa nghiệm thu (Task 5) ────────────────────────── */

const CHO = { mode: 'review', hold: true, permit_chapter: 8 } as const;

test('cửa đang chờ → dải quyết định đứng TRÊN dải trạng thái', () => {
  // Thứ tự là nội dung, không phải trang trí: "dây chuyền đang chờ BẠN" là tin cấp cao hơn
  // "dây chuyền đang làm gì" — cái thứ nhất là một việc phải làm, cái thứ hai là tin để ngó.
  const { container } = ve(true, { advance: { ...CHO } });

  const dai = container.querySelector('.cuanghiemthu');
  expect(dai).not.toBeNull();

  const tt = container.querySelector('.daitrangthai')!;
  expect(dai!.compareDocumentPosition(tt) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test('cửa đang chờ lúc máy NGHỈ → dải quyết định vẫn đứng trên dải việc tiếp theo', () => {
  // Ca thường gặp hơn ca trên: engine dừng ở biên chương rồi mới treo cửa. Hai bài vì luật đổi
  // dải làm khối dưới đổi component, và một dải chèn vào giữa `.bltren` có thể đúng thứ tự với
  // một khối mà sai với khối kia.
  const { container } = ve(false, { advance: { ...CHO } });

  const dai = container.querySelector('.cuanghiemthu')!;
  const vtt = container.querySelector('.vtt')!;
  expect(dai.compareDocumentPosition(vtt) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test('cửa KHÔNG chờ → buồng lái không có dải quyết định nào', () => {
  // `snap()` để `advance: null` theo mặc định. Vế ngược cần bài riêng: một dải luôn vẽ vẫn làm
  // hai bài trên xanh, và hệ quả là một khối amber thường trực trên đầu bề mặt đông nhất.
  const { container } = ve(true);
  expect(container.querySelector('.cuanghiemthu')).toBeNull();
});

test('dải ở buồng lái: nút trả về đưa con trỏ vào ô góp ý, nhãn gửi theo máy đang chạy hay nghỉ', () => {
  // Nhãn nút gửi là hai HỆ QUẢ khác nhau về tiền (tiêm vào lượt đang chạy / đánh thức lượt mới).
  // Dải không còn ô nhập riêng: nút trả về mở ô góp ý chung, nên đo trên ô ấy — và đo cả HAI
  // chiều, vì nhét cứng một nhãn chỉ lộ ra ở chiều kia.
  const nhanNutGui = (dangChay: boolean) => {
    const { container } = ve(dangChay, { advance: { ...CHO } });
    const dai = container.querySelector('.cuanghiemthu')!;
    fireEvent.click(
      [...dai.querySelectorAll('button')].find((n) => n.textContent === CHU.traChuongVeVietLai(8))!,
    );
    const o = document.activeElement as HTMLInputElement;
    expect(o.id, 'con trỏ phải vào ô góp ý').toBe('o-gop-y');
    return o.closest('.steerbox')!.querySelector('button')!.textContent ?? '';
  };

  expect(nhanNutGui(true)).toContain(CHU.tiemVaoLuotDangChay);
  cleanup();
  expect(nhanNutGui(false)).toContain(CHU.danhThucLuotMoi);
});


/* ── bố cục: đầu trang · trang cuộn · góp ý ghim đáy ─────────────────── */

test('khung có đúng BA hàng: đầu trang · trang cuộn · ô góp ý ghim đáy', () => {
  // Ô góp ý là anh em của trang cuộn chứ không nằm trong nó: góp ý là việc người vận hành
  // làm giữa lúc đang đọc chữ chảy, và một ô nhập cuộn đi mất là bắt họ rời mắt đi tìm nó.
  const { container } = ve(true);
  const khung = container.querySelector('.buonglai')!;
  const hang = [...khung.children].map((e) => e.className.split(' ')[0]);
  expect(hang).toEqual(['head', 'tdCuon', 'blcanthiep']);
});

test('thứ tự DOM là thứ tự ĐỌC: cửa duyệt → thẻ đang làm → văn → bằng chứng', () => {
  // Lưới đặt thẻ bằng cột, nên thứ tự DOM và thứ tự nhìn thấy có thể tách rời — đúng lớp
  // lỗi mà `PRODUCT.md` cấm ("bàn phím là hạng nhất"). Thứ tự này cũng là thứ tự của bố cục
  // một cột ở canvas hẹp, nên nó phải đúng ở cả hai chỗ bằng một khai báo duy nhất.
  const { container } = ve(true, { advance: { mode: 'review', hold: true, permit_chapter: 8 } });
  const thuTu = [
    '.cuanghiemthu',
    '.tdDangLam',
    '.tdPhien',
    '.tdVan',
    '.tdO-chuong',
    '.tdO-sukien',
    '.tdO-nhatky',
  ].map((sel) => {
    const el = container.querySelector(sel);
    expect(el, sel).not.toBeNull();
    return el!;
  });
  for (let i = 1; i < thuTu.length; i++) {
    expect(
      thuTu[i - 1]!.compareDocumentPosition(thuTu[i]!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  }
});

test('trục toàn truyện nằm TRONG thẻ đang làm, không phải một dải riêng', () => {
  // Trục trả lời "đang ở đâu trong cả cuốn" — cùng câu với thẻ đang làm. Tách nó ra một dải
  // riêng là hai khối cùng nói về vị trí, ở hai chỗ.
  const { container } = ve(true, {
    timeline: { volumes: null, arcs: null, chapters: [{ chapter: 1, state: 'done' }] },
  });
  expect(container.querySelector('.tdDangLam .tdTruc .chlane')).not.toBeNull();
});

test('mỗi thẻ bằng chứng có tiêu đề RIÊNG, để biết mình đang đọc thẻ nào lúc đã cuộn', () => {
  const { container } = ve(true);
  for (const ma of ['tdVan', 'tdO-chuong', 'tdO-sukien', 'tdO-nhatky']) {
    const o = container.querySelector(`.${ma}`)!;
    expect(o.querySelector('h2'), ma).not.toBeNull();
  }
});

test('đầu ô mang MẪU SỐ của thứ đang cuộn bên dưới', () => {
  // Ô cao vài trăm pixel chứa vài nghìn pixel nội dung. Không nói ra "còn bao nhiêu nữa" thì
  // thanh cuộn là dấu hiệu duy nhất — mà nó rộng 6px (`scrollbar-width: thin`). Cùng luật
  // với dải tổng của màn Quản lý: một con số không kèm mẫu số bị đọc thành toàn bộ.
  ve(true, {
    chapters: [
      { chapter: 1, stage: 'done', words: 2100 },
      { chapter: 2, stage: 'done', words: 1900 },
    ],
    decisions: [
      { id: 'd1', at: '2026-08-01T10:00:00Z', kind: 'gate', decider: 'arbiter', reason: 'ok' },
    ],
  });

  expect(screen.getByText(CHU.soChuongTrongBang(2))).toBeDefined();
  expect(screen.getByText(CHU.soPhanQuyet(1))).toBeDefined();
  expect(screen.getByText(CHU.soDongSuKien(0))).toBeDefined();
});

test('khu văn sống vẽ chữ của bộ đệm THẬT, không phải một bộ đệm rỗng dựng tại chỗ', () => {
  // Đây là sợi dây dài nhất của Task 13: `useStudio` → `page.tsx` → `BuongLai` → `VanSong`.
  // Đứt ở bất kỳ mắt nào thì khu đắt nhất màn hình im lặng trong lúc engine đang viết, và
  // không có lỗi nào nổ ra — nó chỉ hiện câu "chưa có lượt nào".
  let bd = themChu(BO_DEM_RONG, 'khế ước: ✓ 4/4');
  bd = moLuot(bd, 'chương 2 · 23:11');
  bd = themChu(bd, 'nàng quay đầu lại');

  ve(true, {}, bd);

  expect(screen.getByText('khế ước: ✓ 4/4')).toBeDefined();
  expect(screen.getByText('nàng quay đầu lại')).toBeDefined();
  expect(screen.getByText('chương 2 · 23:11')).toBeDefined();
});

test('khu văn sống được cho biết máy đang chạy hay đang nghỉ', () => {
  // `dangChay` đi tới HAI nơi trong buồng lái (luật đổi dải và tiêu đề khu văn sống). Nhét
  // cứng một trong hai vẫn để bài "đổi dải" xanh, nên tiêu đề phải có bài riêng.
  ve(true, {}, themChu(BO_DEM_RONG, 'x'));
  expect(screen.getByRole('heading', { name: CHU.mayDangNoi })).toBeDefined();

  // Bộ đệm CÓ chữ, nên ca nghỉ ở đây là "văn của lượt gần nhất" — xem ba ca ở `VanSong.tsx`.
  ve(false, {}, themChu(BO_DEM_RONG, 'x'));
  expect(screen.getByRole('heading', { name: CHU.vanLuotGanNhat })).toBeDefined();
});

test('ô can thiệp nói ra hệ quả đúng với trạng thái máy', () => {
  // Nhãn nút của ô can thiệp là hai HỆ QUẢ khác nhau ("tiêm vào lượt đang chạy" vs "đánh
  // thức lượt mới"), và nó suy từ cùng cờ `dangChay`. Không truyền cờ xuống thì nút mời
  // đánh thức một lượt mới trong lúc một lượt đang chạy.
  ve(true);
  expect(screen.getByRole('button', { name: CHU.tiemVaoLuotDangChay })).toBeDefined();

  ve(false);
  expect(screen.getByRole('button', { name: CHU.danhThucLuotMoi })).toBeDefined();
});

/* ── bảng chương + nhật ký: mỗi thứ một thẻ, không nối đuôi nhau ─────── */

test('bảng chương, diễn biến và nhật ký ở BA thẻ riêng, không nối đuôi trong một khu cuộn', () => {
  // Bản đầu xếp ba mục nối đuôi trong MỘT khu cuộn cao 125px: bảng chương bắt đầu ở offset 98
  // nên hiện đúng 0 hàng, nhật ký thì không bao giờ tới. jsdom không bố cục nên không đo
  // được chiều cao; cái nó đo được — và đủ chặn việc dựng lại cấu trúc cũ — là mỗi mục có
  // thân thẻ của RIÊNG nó.
  const { container } = ve(
    true,
    {
      chapters: [{ chapter: 1, stage: 'done', words: 2100 }],
      decisions: [
        {
          id: 'd1',
          at: '2026-08-01T10:00:00Z',
          kind: 'gate',
          decider: 'arbiter',
          reason: 'đủ điều kiện',
        },
      ],
    },
    BO_DEM_RONG,
    {
      suKien: [
        { seq: 1, time: '2026-08-01T10:00:00Z', kind: 'tool', category: 'TOOL', summary: 'x' },
      ],
    },
  );

  expect(container.querySelector('.tdO-sukien > .tdOThan .dong')).not.toBeNull();
  expect(container.querySelector('.tdO-chuong > .tdOThan .bangwrap')).not.toBeNull();
  expect(container.querySelector('.tdO-nhatky > .tdOThan .log')).not.toBeNull();
});

test('bảng chương: mới nhất đứng trên, gọn về tám hàng, và mở được cả bảng', () => {
  // Ở một cuốn 700 chương, thứ người dùng cần là mấy chương vừa xong — không phải chương 1.
  const chapters = Array.from({ length: 20 }, (_, i) => ({
    chapter: i + 1,
    stage: 'done' as const,
    words: 1000,
  }));
  const { container } = ve(false, { chapters });
  const so = () =>
    [...container.querySelectorAll('.tdO-chuong tbody td.ch')].map((e) => e.textContent);

  expect(so()).toEqual(['20', '19', '18', '17', '16', '15', '14', '13']);
  // Mẫu số vẫn là CẢ phạm vi, không phải phần đang hiện.
  expect(screen.getByText(CHU.soChuongTrongBang(20))).toBeDefined();

  fireEvent.click(screen.getByRole('button', { name: TD.hienThem(12) }));
  expect(so()).toHaveLength(20);
  fireEvent.click(screen.getByRole('button', { name: TD.thuGon }));
  expect(so()).toHaveLength(8);
});

test('bảng gọn KHÔNG cắt mất chương cần viết lại hay đang viết, dù nó cũ', () => {
  // Cắt im lặng một chương chờ viết lại là đúng lỗi mà Rail và bộ chọn mức xem đã tránh.
  const chapters = Array.from({ length: 20 }, (_, i) => ({
    chapter: i + 1,
    stage: (i === 2 ? 'rewrite' : i === 4 ? 'drafting' : 'done') as 'rewrite' | 'drafting' | 'done',
  }));
  const { container } = ve(false, { chapters });
  const so = [...container.querySelectorAll('.tdO-chuong tbody td.ch')].map((e) => e.textContent);
  expect(so).toContain('3');
  expect(so).toContain('5');
});

test('khu văn: nghỉ mà rỗng thì không vẽ, chạy mà chưa có chữ thì một dòng, có chữ thì là khối đọc', () => {
  // Một ô trống cao vài trăm pixel giữa màn là thứ người dùng đã chê; lúc nghỉ, cả dòng gợi
  // ý cũng chỉ nhắc lại câu "bấm Viết tiếp" của thẻ đang làm.
  const nghi = ve(false);
  expect(nghi.container.querySelector('.tdVan')).toBeNull();
  cleanup();
  const a = ve(true);
  expect(a.container.querySelector('.tdVan.rong')).not.toBeNull();
  cleanup();
  const b = ve(true, {}, themChu(BO_DEM_RONG, 'nàng quay đầu lại'));
  expect(b.container.querySelector('.tdVan')).not.toBeNull();
  expect(b.container.querySelector('.tdVan.rong')).toBeNull();
});

test('hai neo cuộn `#dong-su-kien` và `#nhat-ky-phan-quyet` còn nguyên', () => {
  // `DangLam` trong `ViecTiepTheo.tsx` cuộn tới `#dong-su-kien` bằng id. Mỗi lần làm lại
  // bố cục là một lần đổi markup, và một lần làm rơi mất `id` sẽ để nút "xem diễn biến" bấm
  // mà không đi đâu — không lỗi nào nổ ra, chỉ một nút im lặng.
  const { container } = ve(true);
  expect(container.querySelector('#dong-su-kien')).not.toBeNull();
  expect(container.querySelector('#nhat-ky-phan-quyet')).not.toBeNull();
});

/* ── phần đi theo từ `Canvas` (Task 13) ───────────────────────────────── */

test('đầu trang nói tên cuốn, giai đoạn và số đo — không phải mỗi tiêu đề khu', () => {
  ve(true, {
    book: { ...snap({}).book, name: 'Trấn Yêu Ký', total_chapters: 300, total_words: 12000 },
  });

  expect(screen.getByRole('heading', { name: CHU.dongSanXuat })).toBeDefined();
  expect(screen.getByText(/Trấn Yêu Ký · chặng viết · 300 chương · 12\.000 từ/)).toBeDefined();
});

test('cuốn KHÔNG phân tầng thì không có bộ chọn mức xem', () => {
  // `layered_outline === false` nghĩa là không có tập/cung nào để lọc. Vẽ bộ chọn ở đó là
  // mời bấm một phép lọc không lọc gì.
  const { container } = ve(true);
  expect(container.querySelector('.mucxem')).toBeNull();
});

test('cuốn phân tầng thì có bộ chọn mức xem', () => {
  const { container } = ve(true, {
    capabilities: { ...snap({}).capabilities, layered_outline: true },
    timeline: {
      volumes: [{ index: 1, state: 'running', chapters: 3, from: 1, to: 3 }],
      arcs: null,
      chapters: [],
    },
  });
  expect(container.querySelector('.mucxem')).not.toBeNull();
});

test('cảnh báo dữ liệu lệch hiện ra, không bị nuốt — gọn một dòng có số đếm', () => {
  const { container } = ve(true, { warnings: ['chương 4 thiếu tệp bản thảo'] });

  expect(container.querySelector('.canhbao')).not.toBeNull();
  // Số đếm nằm ngay trên dòng thấy được, nên phần thu gọn vẫn được nói ra bằng số.
  expect(screen.getByText(TD.canhBao(1))).toBeDefined();
  // Nội dung vẫn ở trong DOM — thu gọn là việc của hình, không phải của dữ liệu.
  expect(screen.getByText('chương 4 thiếu tệp bản thảo')).toBeDefined();
});

test('không có cảnh báo thì không vẽ khối cảnh báo rỗng', () => {
  const { container } = ve(true);
  expect(container.querySelector('.canhbao')).toBeNull();
});

test('nghỉ với bộ đệm chỉ có lượt RỖNG (mở lượt rồi lỗi) → không vẽ khung "Đoạn viết gần nhất"', () => {
  // Đo trên truyện thật: Kiến trúc sư thử lại mãi một lỗi, mỗi lần mở một lượt không chữ;
  // bấm Tạm dừng thì hiện một khung có tiêu đề mà không có gì bên trong.
  const { container } = ve(false, {}, moLuot(moLuot(BO_DEM_RONG)));
  expect(container.querySelector('.tdVan')).toBeNull();
});

test('cạnh ô góp ý có lối vào "Bàn hướng tiếp theo", chú giải nói rõ nó tạm dừng truyện', () => {
  const onChonKhu = vi.fn();
  ve(false, {}, BO_DEM_RONG, { onChonKhu });
  const nut = screen.getByRole('button', { name: TD.banHuong });
  expect(nut.getAttribute('title')).toBe(TD.banHuongGiai);
  fireEvent.click(nut);
  expect(onChonKhu).toHaveBeenCalledWith('ban-huong');
});

test('truyện đã kết thì không mời bàn hướng — không còn chặng nào để bàn', () => {
  ve(false, { book: { ...snap({}).book, phase: 'complete' } });
  expect(screen.queryByRole('button', { name: TD.banHuong })).toBeNull();
});
