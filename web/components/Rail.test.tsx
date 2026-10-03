import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import type { Khu } from '@/lib/khu';
import { TEN_KHU } from '@/lib/khu';
import { manCuaKhu } from '@/lib/man';
import { CHU, DH } from '@/lib/nhan';

import { Rail } from './Rail';
import { snap } from './mau.test-helper';

/**
 * Đường VÀO màn Xưởng.
 *
 * Kế hoạch không đòi tệp này, và đó chính là lý do nó phải có: mục rail là đường duy nhất tới
 * bề mặt Xưởng ngoài việc gõ tay `?khu=xuong`. Bộ kiểm của `Xuong.tsx` dựng component đó
 * THẲNG, nên xóa hẳn mục rail vẫn xanh cả bộ — đúng lớp "mắt cuối của sợi dây không ai chạm
 * tới" mà cụm D đã đo được một lần với `vanSong={s.vanSong}`.
 */

/**
 * jsdom KHÔNG hiện thực `scrollIntoView`; `Rail` gọi nó trong effect để kéo khu đang mở vào
 * tầm nhìn. Vá tại đây chứ không ở `vitest.setup.giaodien.ts` — cùng lý do đã ghi ở
 * `app/page.test.tsx`: tệp setup vá một lỗi làm MỌI bài kiểm nói dối, còn cái này chỉ chạm
 * tới bài kiểm nào dựng `Rail`.
 */
Element.prototype.scrollIntoView = function () {
  /* jsdom không bố cục */
};

function ve(khu: Khu = 'dong-san-xuat', dauChot = 0) {
  const chon = vi.fn();
  const doiMan = vi.fn();
  const r = render(
    <Rail
      snapshot={snap({})}
      hoSo={undefined}
      khu={khu}
      man={manCuaKhu(khu)}
      onChonKhu={chon}
      canBan={false}
      tenCuonNgan="Trấn Yêu Ký"
      dauChot={dauChot}
    />,
  );
  return { ...r, chon, doiMan };
}

/* ── họ 10 · đồng thanh ──────────────────────────────────────────────────
 *
 * Một chương chốt thì ba chỗ nhấp CÙNG màu, CÙNG lúc: vạch trên lane, chip này, và tiến độ
 * ở thanh trên. Chỉ chip "Bản thảo" được nhận dấu — nó đếm đúng con số mà sự kiện làm đổi.
 */

test('dauChot=0 (mở trang) thì KHÔNG chip nào mang lớp đồng thanh', () => {
  // Cùng luật với mọi họ khác: mở trang thấy chín chương đã chốt từ hôm qua, và nếu chúng
  // làm chip nhấp thì cái nhấp đó không còn nghĩa gì.
  const { container } = ve();
  expect(container.querySelectorAll('.dongThanh')).toHaveLength(0);
});

test('chốt một chương → ĐÚNG MỘT chip nhấp, và là chip Bản thảo', () => {
  const { container } = ve('dong-san-xuat', 1);
  const nhap = [...container.querySelectorAll('.dongThanh')];
  expect(nhap).toHaveLength(1);

  // Rải ra các mục khác sẽ biến một tin thành một đợt nhấp toàn rail — đúng thứ họ 10 tồn
  // tại để KHÔNG làm.
  const muc = nhap[0]!.closest('.mucdi');
  expect(muc?.querySelector('.nhan')?.textContent).toBe(CHU.banThao);
});

test('dấu về 0 sau khi hết nhấp thì lớp được DỌN, không dính lại', () => {
  // ĐO ĐƯỢC trên app thật: bản trước truyền thẳng bộ đếm `chot.dau`, và vì nó chỉ tăng nên
  // lớp `dongThanh` dính vĩnh viễn sau lần chốt đầu (t=3.200ms: vạch trên lane đã sạch, hai
  // chỗ kia vẫn còn lớp). Hôm nay vô hại, nhưng nó phá đúng lời hứa "cùng thời lượng" của
  // họ 10 — và là mìn hẹn giờ cho ngày ai đó thêm một `key` mới.
  const { container } = ve('dong-san-xuat', 0);
  expect(container.querySelectorAll('.dongThanh')).toHaveLength(0);
});

test('đồng thanh THẮNG nhấp-số-đổi: một phần tử không mang hai hoạt ảnh', () => {
  // Chốt chương làm `completed_chapters` đổi, nên họ 08 (`vuaDoi`) cũng muốn nhấp cùng lúc.
  // Hai hoạt ảnh trên một phần tử thì cái nào thắng tuỳ thứ tự khai trong CSS — một hành vi
  // không ai đọc ra được từ mã component.
  const { container } = ve('dong-san-xuat', 3);
  const chip = container.querySelector('.dongThanh');
  expect(chip?.className).not.toContain('vuaDoi');
});

/* ── bộ chuyển màn ───────────────────────────────────────────────────────
 *
 * Ba bài dưới đây thay cho hai bài cũ về "nhóm chung". Nhóm đó không còn: bốn khu mức máy
 * của nó đã lên thành hai MÀN riêng, nên đường vào chúng cũng đổi chỗ. Điều đáng canh thì
 * không đổi — vẫn là "có đường tới đó không, và người dùng có thấy đường ấy không".
 */

test('mọi đích luôn hiện cùng lúc, đứng ở đâu cũng vậy', () => {
  // Bản trước có tầng "màn" chồng trên tầng "khu": phải chọn màn rồi mới thấy khu của nó.
  // Người dùng hỏi "các màn khác đâu rồi ta". Giờ rail là một cây phẳng, nên từ bất cứ khu
  // nào cũng thấy tủ truyện, các mục của truyện đang mở và cài đặt.
  for (const khu of ['dong-san-xuat', 'xuong', 'cau-hinh'] as const) {
    const r = ve(khu);
    const nhan = [...r.container.querySelectorAll('.mucdi .nhan')].map((e) => e.textContent);
    expect(nhan).toContain(DH.tuTruyen);
    expect(nhan).toContain(DH.vietTruyenMoi);
    expect(nhan).toContain(DH.docTruyen);
    expect(nhan).toContain(DH.tienDo);
    expect(nhan).toContain(DH.modelKhoa);
    r.unmount();
  }
});

test('tên truyện đang mở đứng đầu nhóm của nó', () => {
  const { container } = ve('dong-san-xuat');
  expect(container.querySelector('.railSachTen')?.textContent).toBe('Trấn Yêu Ký');
});

test('tủ truyện đứng đầu rail, cài đặt ghim cuối', () => {
  // Thứ tự là thứ tự câu hỏi: "tôi đang có gì" trước, cấu hình dùng một lần thì xuống đáy.
  const { container } = ve('dong-san-xuat');
  const nhan = [...container.querySelectorAll('.mucdi .nhan')].map((e) => e.textContent);
  expect(nhan[0]).toBe(DH.tuTruyen);
  expect(nhan.at(-1)).toBe(DH.chiPhiTong);
});

test('mục Xưởng của màn Quản lý đi tới khu `xuong`', () => {
  const { chon, container } = ve('xuong');
  const muc = [...container.querySelectorAll('.mucdi')].find(
    (e) => e.querySelector('.nhan')?.textContent === CHU.xuong,
  );
  fireEvent.click(muc!);
  expect(chon).toHaveBeenCalledWith('xuong');
});

test('đang ở khu Xưởng thì mục đó sáng lên — người dùng biết mình đang đứng đâu', () => {
  // `aria-current` là thứ duy nhất nói ra chỗ đang đứng, và nó chỉ đúng nếu mã khu của mục
  // khớp mã khu đang mở. Một mục trỏ nhầm khu vẫn điều hướng được nhưng không bao giờ sáng.
  const { container } = ve('xuong');
  const dangMo = container.querySelector('[aria-current="page"] .nhan');
  expect(dangMo?.textContent).toBe(CHU.xuong);
});

test('số ở "Nhận xét biên tập" là số chương CÓ nhận xét, không phải số hàng của bảng chương', () => {
  render(
    <Rail
      snapshot={snap({
        chapters: [
          { chapter: 1, stage: 'pending' },
          { chapter: 2, stage: 'done', reviewed: true },
          { chapter: 3, stage: 'done' },
        ],
      })}
      hoSo={undefined}
      khu="dong-san-xuat"
      man={manCuaKhu('dong-san-xuat')}
      onChonKhu={() => {}}
      canBan={false}
      tenCuonNgan="Trấn Yêu Ký"
      dauChot={0}
    />,
  );
  const nut = screen.getByRole('button', { name: new RegExp(`^${DH.nhanXet}`) });
  expect(nut.textContent).toContain('1');
  expect(nut.textContent).not.toContain('3');
});

/* ── neo cuộn của mục "Nhật ký quyết định" ───────────────────────────── */

test('mục neo cuộn tới đúng id SAU khi khu đích render, không ở nhịp bấm', () => {
  // `neoCho` + effect đã có sẵn trong Rail kèm chú thích giải thích vì sao phải cuộn trong
  // effect — nhưng KHÔNG chỗ nào gán vào `neoCho`, nên đường duy nhất đang chạy là cái
  // `requestAnimationFrame` mà chính chú thích ấy gọi là "ĐO ĐƯỢC không chạy".
  //
  // Bài này canh sợi dây đó bằng chính hiện tượng đã đo: ở nhịp BẤM, khu đích chưa mount
  // nên neo chưa có trong DOM; nó chỉ xuất hiện sau khi `khu` đổi.
  const goi: string[] = [];
  Element.prototype.scrollIntoView = function (this: Element) {
    if (this.id) goi.push(this.id);
  };

  const { rerender } = render(
    <Rail
      snapshot={snap({})}
      hoSo={undefined}
      khu="ban-thao"
      man={manCuaKhu('ban-thao')}
      onChonKhu={vi.fn()}
      canBan={false}
      tenCuonNgan="Trấn Yêu Ký"
      dauChot={0}
    />,
  );

  const vh = screen.getByRole('button', { name: new RegExp(DH.vanHanh) });
  if (vh.getAttribute('aria-expanded') === 'false') fireEvent.click(vh);
  fireEvent.click(screen.getByRole('button', { name: new RegExp(DH.nhatKy) }));
  expect(goi, 'chưa đổi khu thì neo chưa có trong DOM — không được cuộn ở nhịp bấm').not.toContain(
    'nhat-ky-phan-quyet',
  );

  // Khu đích đã mount: neo giờ mới tồn tại.
  const neo = document.createElement('div');
  neo.id = 'nhat-ky-phan-quyet';
  document.body.append(neo);
  rerender(
    <Rail
      snapshot={snap({})}
      hoSo={undefined}
      khu="dong-san-xuat"
      man={manCuaKhu('dong-san-xuat')}
      onChonKhu={vi.fn()}
      canBan={false}
      tenCuonNgan="Trấn Yêu Ký"
      dauChot={0}
    />,
  );
  expect(goi).toContain('nhat-ky-phan-quyet');
});

/* ── ngăn kéo ở màn hình hẹp ─────────────────────────────────────────────
 *
 * Luật của ngăn nằm trong một `@media (max-width: 860px)` nên jsdom không bố cục được nó.
 * Bài kiểm vì thế canh HÀNH VI, không canh hình: trạng thái mở/đóng, ba đường ra, và việc
 * tiêu điểm quay về nút. Đó cũng đúng là phần mà CSS không giữ hộ được.
 */

test('thanh gọn gọi tên bề mặt đang mở và mở được ngăn', () => {
  const { container } = ve('phuc-but');
  const nut = container.querySelector<HTMLButtonElement>('.railThanhNut')!;

  expect(nut.textContent).toContain(TEN_KHU['phuc-but']);
  expect(nut.getAttribute('aria-expanded')).toBe('false');
  expect(container.querySelector('.railMan')).toBeNull();

  fireEvent.click(nut);
  expect(nut.getAttribute('aria-expanded')).toBe('true');
  expect(container.querySelector('.railMan')).not.toBeNull();
  // Nút trỏ đúng vào ngăn, nếu không thì trình đọc màn hình không biết nó mở ra cái gì.
  expect(nut.getAttribute('aria-controls')).toBe(
    container.querySelector('nav.rail')!.getAttribute('id'),
  );
});

test('đi tới một đích thì ngăn tự đóng — mọi nút điều hướng, không chỉ vài nút', () => {
  // Rail có hơn hai mươi nút điều hướng. Một nút quên đóng ngăn là một nút để lại tấm che
  // phủ lên chính bề mặt nó vừa mở, nên phép bọc phải nằm ở MỘT chỗ.
  const { container, chon } = ve();
  const nut = container.querySelector<HTMLButtonElement>('.railThanhNut')!;
  fireEvent.click(nut);

  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${DH.phucBut}`) }));
  expect(chon).toHaveBeenCalledWith('phuc-but');
  expect(nut.getAttribute('aria-expanded')).toBe('false');
  expect(container.querySelector('.railMan')).toBeNull();
});

test('Esc đóng ngăn VÀ trả tiêu điểm về nút mở; bấm tấm che cũng đóng', () => {
  const { container } = ve();
  const nut = container.querySelector<HTMLButtonElement>('.railThanhNut')!;

  fireEvent.click(nut);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(nut.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(nut);

  fireEvent.click(nut);
  fireEvent.click(container.querySelector('.railMan')!);
  expect(nut.getAttribute('aria-expanded')).toBe('false');
});
