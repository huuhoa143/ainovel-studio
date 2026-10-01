import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { TU_TRUYEN } from '@/lib/chu/tu-truyen';
import { CHU, DH } from '@/lib/nhan';

import { Xuong } from './Xuong';
import { sach, tongGia } from './mau.test-helper';

/**
 * Bề mặt Tủ truyện: lời chào + ba ô số, khối "cần bạn", và kệ một thẻ một cuốn.
 *
 * # Mỗi khẳng định "chưa đo được" đi kèm khẳng định NGƯỢC LẠI
 *
 * Bài hỏi "cuốn chưa chạy thì không in số này" được thỏa bởi một bề mặt giấu số đó cho MỌI
 * cuốn — và lúc đó nó giấu đúng những con số mà màn hình này tồn tại để hiện. Nên mỗi bài đều
 * dựng HAI cuốn: một cuốn chưa đo được và một cuốn có số thật, rồi đòi cả hai điều cùng lúc.
 */
function ve(...s: Parameters<typeof sach>[0][]) {
  return render(<Xuong sach={s.map((p) => sach(p))} tong={tongGia()} onChonKhu={() => {}} onMoTacPham={() => {}} onXoaXong={() => {}} />);
}

/** Chữ của từng ô số cạnh lời chào, theo đúng thứ tự vẽ. */
function oTong(container: HTMLElement): (string | null)[] {
  return [...container.querySelectorAll('.xtong .o')].map((e) => e.textContent);
}

/** Thẻ của một cuốn, tra theo mã cuốn. */
function the(container: HTMLElement, ma: string): HTMLElement {
  const li = container.querySelector<HTMLElement>(`.keLuoi [data-ma="${ma}"]`);
  if (!li) throw new Error(`không có thẻ nào cho cuốn ${ma}`);
  return li;
}

/** Mở menu "…" của một thẻ, trả về nhãn các mục theo thứ tự. */
function moMenu(container: HTMLElement, ma: string): HTMLElement[] {
  fireEvent.click(the(container, ma).querySelector('.theMenuNut')!);
  return [...the(container, ma).querySelectorAll<HTMLElement>('[role="menuitem"]')];
}

test('ba ô số của cả tủ: chương đã xong, số từ, đã tiêu', () => {
  const { container } = ve(
    { id: 'a', completed_chapters: 3, total_words: 5305, cost_usd: 1.67, engine_open: true },
    { id: 'b', completed_chapters: 2, total_words: 3000, cost_usd: 0.9 },
  );

  // Viết THẲNG chuỗi mong đợi, không dựng lại bằng `tongXuong` hay `so()`: một bài kiểm gọi
  // đúng hàm mà bề mặt gọi thì nó chỉ chứng minh hai lời gọi giống nhau, kể cả khi cả hai
  // cùng sai. Con số ở đây tính tay: 3+2 chương, 5305+3000 từ, 167+90 xu.
  expect(oTong(container)).toEqual(['5 chương đã xong', '8.305 từ', '$2,57 đã tiêu']);

  // Hai con số còn lại của bản cũ (số truyện, phiên đang mở) không mất — chúng lùi xuống khối
  // "Toàn tủ" ở cuối màn.
  const toan = container.querySelector('.tuToan')!.textContent ?? '';
  expect(toan).toContain(`${TU_TRUYEN.soTruyen}2`);
  expect(toan).toContain(`${TU_TRUYEN.phienDangMo}1`);
});

test('ô tiền mang MẪU SỐ khi chỉ đo được một phần tủ', () => {
  const { container } = render(
    <Xuong
      sach={[sach({ id: 'a', cost_usd: 7.37 }), sach({ id: 'b' }), sach({ id: 'c' })]}
      tong={tongGia({ books: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as never, counted: 1 })}
      onChonKhu={() => {}}
      onMoTacPham={() => {}}
      onXoaXong={() => {}}
    />,
  );
  expect(container.querySelector('.xtong .o:last-child .mauSo')?.textContent).toBe(CHU.doDuocO(1, 3));
});

test('mỗi cuốn đúng MỘT thẻ, và mã cuốn hiện ra kể cả khi hai cuốn trùng tên', () => {
  // `id` là tên thư mục và cũng là khóa trong URL (`?tp=`), nên nó là thứ duy nhất phân biệt
  // được hai thẻ. Bỏ nó đi thì hai cuốn ở hai thư mục khác nhau hiện y hệt nhau.
  const { container } = ve({ id: 'mac-the', name: 'Mặc Thế' }, { id: 'mac-the-2', name: 'Mặc Thế' });

  expect(container.querySelectorAll('.keLuoi [data-ma]')).toHaveLength(2);
  expect(the(container, 'mac-the').querySelector('.tenNut .ma')?.textContent).toBe('mac-the');
  expect(the(container, 'mac-the-2').querySelector('.tenNut .ma')?.textContent).toBe('mac-the-2');
  expect(screen.getAllByRole('button', { name: /Mặc Thế/ }).filter((b) => b.classList.contains('tenNut'))).toHaveLength(2);
});

test('cuốn chưa đặt tên hiện MÃ thay cho tên, không hiện một ô trống', () => {
  const { container } = ve({ id: 'chua-dat-ten', name: '' });
  expect(the(container, 'chua-dat-ten').querySelector('.tenNut')?.textContent).toBe('chua-dat-ten');
});

test('nhịp: cuốn chưa chạy KHÔNG in `0 chương/giờ`, cuốn đã chạy hiện số', () => {
  // `0 ch/giờ` nói cuốn đó CÓ chạy mà chưa xong nổi một chương trong một giờ. Cuốn chưa chạy
  // lần nào thì không có nhịp để nói.
  const { container } = ve({ id: 'im', chapters_per_hour: 0 }, { id: 'chay', chapters_per_hour: 4.4 });

  expect(the(container, 'im').querySelector('.nhip')).toBeNull();
  expect(the(container, 'im').textContent).not.toContain('0 chương/giờ');
  expect(the(container, 'chay').querySelector('.nhip')?.textContent).toContain('4,4');
});

test('giá thành mỗi chương: cùng luật đó — 0 là chưa đo được, không phải $0,000', () => {
  const { container } = ve(
    { id: 'im', cost_usd: 1.2, cost_per_chapter: 0 },
    { id: 'chay', cost_usd: 1.2, cost_per_chapter: 0.835 },
  );

  expect(the(container, 'im').querySelector('.donGia')).toBeNull();
  expect(the(container, 'im').textContent).not.toContain('$0,000');
  expect(the(container, 'chay').querySelector('.donGia')?.textContent).toContain('$0,835');
});

test('chi phí TỔNG bằng 0 vẫn in ra $0,00 — đó là một phép đo, không phải chỗ trống', () => {
  const { container } = ve({ id: 'moi', cost_usd: 0 });
  expect(the(container, 'moi').querySelector('.tong')?.textContent).toBe('$0,00');
});

test('trạng thái: đang viết nói chương nào, tạm nghỉ nói từ bao giờ, hoàn thành nói hoàn thành', () => {
  const gioTruoc = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
  const { container } = ve(
    { id: 'chay', activity: 'running', phase: 'writing', completed_chapters: 725 },
    { id: 'nghi', activity: 'idle', phase: 'writing', updated_at: gioTruoc },
    { id: 'xong', activity: 'idle', phase: 'complete' },
    // Mốc hỏng ở dữ liệu không được biến thành "Invalid Date" hay "NaN" trên màn hình.
    { id: 'hong', activity: 'idle', phase: 'writing', updated_at: 'khong-phai-ngay' },
  );

  expect(the(container, 'chay').querySelector('.theTT')?.textContent).toBe(TU_TRUYEN.dangVietChuong(726));
  expect(the(container, 'chay').querySelector('.cham.gold')).not.toBeNull();

  const nghi = the(container, 'nghi').querySelector('.theTT')?.textContent ?? '';
  expect(nghi).toContain(TU_TRUYEN.tamNghi);
  expect(nghi).toContain('3 giờ trước');

  expect(the(container, 'xong').querySelector('.theTT')?.textContent).toBe(TU_TRUYEN.hoanThanh);
  expect(the(container, 'xong').querySelector('.cham.teal')).not.toBeNull();

  const hong = the(container, 'hong').querySelector('.theTT')?.textContent ?? '';
  expect(hong).toBe(TU_TRUYEN.tamNghi);
  expect(hong).not.toMatch(/Invalid|NaN/);
});

test('thẻ của cuốn đang mở engine mang chữ và lớp riêng; thẻ khác KHÔNG mang', () => {
  const { container } = ve({ id: 'mo', engine_open: true }, { id: 'dong', engine_open: false });

  const mo = the(container, 'mo');
  expect(mo.className).toContain('engmo');
  expect(mo.textContent).toContain(CHU.engineDangMo);

  const d = the(container, 'dong');
  expect(d.className).not.toContain('engmo');
  expect(d.textContent).not.toContain(CHU.engineDangMo);
});

test('tiến độ: số đi kèm thanh, và thanh KHÔNG vẽ khi chưa biết tổng số chương', () => {
  // `total_chapters === 0` nghĩa là chưa biết tổng, không phải "tổng bằng không" — vẽ một
  // thanh đầy hay rỗng ở đó đều là khẳng định một tỉ lệ mà dữ liệu không nói.
  const { container } = ve(
    { id: 'biet', completed_chapters: 3, total_chapters: 12 },
    { id: 'chua', completed_chapters: 3, total_chapters: 0 },
  );

  const biet = the(container, 'biet').querySelector('.tiendo');
  expect(biet?.textContent).toContain('3 / 12 chương');
  expect(biet?.textContent).toContain('25%');
  expect(biet?.querySelector<HTMLElement>('.thanh .day')?.style.width).toBe('25%');

  const chua = the(container, 'chua').querySelector('.tiendo');
  expect(chua?.textContent).toContain('3');
  expect(chua?.textContent).toContain(TU_TRUYEN.chuaBietTong);
  expect(chua?.querySelector('.thanh .day')).toBeNull();
});

test('bấm thẻ (nút tên) mở đúng truyện đó ở Tiến độ', () => {
  const mo = vi.fn();
  const { container } = render(
    <Xuong sach={[sach({ id: 'a' }), sach({ id: 'b' })]} tong={tongGia()} onChonKhu={() => {}} onMoTacPham={mo} onXoaXong={() => {}} />,
  );
  // Nút đầu tiên trong thẻ PHẢI là nút mở: nó căng phủ cả thẻ, và `app/page.test.tsx` dựa vào
  // thứ tự này để nối đúng hành động thật.
  expect(the(container, 'b').querySelector('button')).toBe(the(container, 'b').querySelector('.tenNut'));
  fireEvent.click(the(container, 'b').querySelector('.tenNut')!);
  // Mã cuốn phải là mã của THẺ, không phải cuốn đang xem. Đây là chỗ lỗi ref-trễ đã đo được
  // hai lần trong dự án này rơi vào.
  expect(mo).toHaveBeenCalledWith('b', 'dong-san-xuat');
  expect(container.textContent).not.toContain('một đường tiêu tiền duy nhất');
});

/* ── menu "…" ───────────────────────────────────────────────────────────── */

test('thao tác phụ KHÔNG phơi trên thẻ: Đọc, Xuất bản, Xóa chỉ hiện khi mở menu', () => {
  const { container } = ve({ id: 'xong', phase: 'complete', completed_chapters: 4 });
  const nhan = [...the(container, 'xong').querySelectorAll('button')].map((n) => n.textContent);
  expect(nhan).not.toContain(TU_TRUYEN.docTruyen);
  expect(nhan).not.toContain(TU_TRUYEN.xoaTruyen);
  expect(the(container, 'xong').querySelector('[role="menu"]')).toBeNull();
});

test('cuốn chưa có chương nào: menu chỉ có Xóa', () => {
  const { container } = ve({ id: 'b', phase: 'writing' });
  expect(moMenu(container, 'b').map((n) => n.textContent)).toEqual([TU_TRUYEN.xoaTruyen]);
});

test('cuốn đã hoàn thành: menu có đủ Đọc · Xuất bản · Xóa, và mỗi mục đi đúng chỗ', () => {
  const mo = vi.fn();
  const { container } = render(
    <Xuong sach={[sach({ id: 'xong', phase: 'complete' })]} tong={tongGia()} onChonKhu={() => {}} onMoTacPham={mo} onXoaXong={() => {}} />,
  );

  const muc = moMenu(container, 'xong');
  expect(muc.map((n) => n.textContent)).toEqual([TU_TRUYEN.docTruyen, TU_TRUYEN.xuatBan, TU_TRUYEN.xoaTruyen]);

  fireEvent.click(muc[0]!);
  // Chương 1 đi CÙNG lời gọi, không phải một lời gọi thứ hai: hai lần ghi URL thì lần sau
  // xóa tham số của lần trước, và `?ch=` là thứ bị mất.
  expect(mo).toHaveBeenLastCalledWith('xong', 'ban-thao', 1);
  // Chọn xong thì menu đóng.
  expect(the(container, 'xong').querySelector('[role="menu"]')).toBeNull();

  fireEvent.click(moMenu(container, 'xong')[1]!);
  expect(mo).toHaveBeenLastCalledWith('xong', 'nhap-xuat');
});

test('Escape đóng menu và trả focus về nút "…"', () => {
  const { container } = ve({ id: 'a', completed_chapters: 1 });
  const muc = moMenu(container, 'a');
  expect(document.activeElement).toBe(muc[0]);
  fireEvent.keyDown(muc[0]!, { key: 'Escape' });
  expect(the(container, 'a').querySelector('[role="menu"]')).toBeNull();
  expect(document.activeElement).toBe(the(container, 'a').querySelector('.theMenuNut'));
});

test('KHÔNG có nút Chạy, Dừng hay Đổi tên trên bề mặt này', () => {
  // Hàng rào chống một lần "tiện tay thêm nút" trong tương lai. Nó canh quyết định 4 của
  // spec §4: chạy chỉ có ở thanh dưới, một đường tiêu tiền duy nhất. Đổi tên vẫn không: tên
  // thư mục đi vào đường dẫn của mọi tệp trong cuốn. Mở cả menu để đếm luôn các mục trong đó.
  const { container } = render(
    <Xuong
      sach={[
        sach({ id: 'a', phase: 'writing', engine_open: true, activity: 'running' }),
        sach({ id: 'b', phase: 'complete' }),
      ]}
      tong={tongGia()} onChonKhu={() => {}} onMoTacPham={() => {}} onXoaXong={() => {}}
    />,
  );
  moMenu(container, 'b');

  const nhan = screen.getAllByRole('button').map((n) => n.textContent ?? '');
  expect(nhan.length).toBeGreaterThan(0);
  for (const t of nhan) {
    expect(t).not.toMatch(/chạy|dừng|đổi tên/i);
  }
});

/**
 * Xóa phải đứng CUỐI menu, sau mọi mục điều hướng: tay người ta đi theo thói quen vị trí, nên
 * một hành động không hoàn tác được nằm xen giữa `Đọc` và `Xuất bản` là mời bấm nhầm.
 */
test('Xóa đứng cuối menu, sau mọi mục điều hướng', () => {
  const { container } = ve({ id: 'xong', phase: 'complete' });
  expect(moMenu(container, 'xong').at(-1)?.textContent).toBe(TU_TRUYEN.xoaTruyen);
});

/**
 * Bấm Xóa MỞ hộp xác nhận, không xóa ngay. Server còn đòi gõ lại đúng tên nữa, nhưng một giao
 * diện xóa ngay khi bấm là giao diện sai kể cả khi server cứu được.
 */
test('bấm Xóa mở hộp xác nhận, và hộp nói ra CÁI MẤT', () => {
  const { container } = ve({ id: 'a', completed_chapters: 2, cost_usd: 1.5 });
  const hop = container.querySelector('dialog.hopxn')!;
  expect(hop).not.toBeNull();
  expect(hop.hasAttribute('open')).toBe(false);

  fireEvent.click(moMenu(container, 'a').at(-1)!);

  expect(hop.hasAttribute('open')).toBe(true);
  expect(hop.textContent).toContain('2 chương');
  expect(hop.textContent).toMatch(/1[.,]50/);
});

/** Người ta bấm Enter theo phản xạ khi một hộp bật lên, nên Enter phải rơi vào nút KHÔNG làm gì. */
test('hộp xác nhận đặt focus vào Hủy', () => {
  const { container } = ve({ id: 'a' });
  fireEvent.click(moMenu(container, 'a').at(-1)!);
  expect(document.activeElement?.textContent).toBe(CHU.huy);
});

/* ── lời chào, tóm tắt, khối cần bạn ───────────────────────────────────── */

test('dòng tóm tắt nói truyện đang viết, và tên đó bấm được để mở', () => {
  const mo = vi.fn();
  const { container } = render(
    <Xuong
      sach={[sach({ id: 'a', name: 'Ông Trùm', activity: 'running', engine_open: true }), sach({ id: 'b' })]}
      tong={tongGia()}
      onChonKhu={() => {}}
      onMoTacPham={mo}
      onXoaXong={() => {}}
    />,
  );
  const tt = container.querySelector('.tuTomTat')!;
  expect(tt.textContent).toBe(`${TU_TRUYEN.tomTatDangViet}Ông Trùm, ${TU_TRUYEN.tomTatKhongViec}`);
  fireEvent.click(tt.querySelector('button')!);
  expect(mo).toHaveBeenCalledWith('a', 'dong-san-xuat');
});

test('khối "Cần bạn xem" ẩn khi không có việc, hiện kèm lý do khi có', () => {
  const khong = ve({ id: 'a' });
  expect(khong.container.querySelector('.daicanban')).toBeNull();
  expect(khong.container.querySelector('.tuTomTat')?.textContent).toBe('Chưa có việc nào cần bạn.');
  khong.unmount();

  const mo = vi.fn();
  const { container } = render(
    <Xuong
      sach={[sach({ id: 'a', name: 'Truyện A' }), sach({ id: 'b' })]}
      tong={tongGia({
        books: [
          {
            id: 'a',
            cost_state: 'ready',
            cost_usd: 0,
            saved_usd: 0,
            advance_mode: 'review',
            advance_hold: true,
            advance_hold_reason: 'đọc lại hồi 2',
            pending_steer: false,
          },
        ],
      })}
      onChonKhu={() => {}}
      onMoTacPham={mo}
      onXoaXong={() => {}}
    />,
  );
  const khoi = container.querySelector('.daicanban.cocho')!;
  expect(khoi).not.toBeNull();
  expect(khoi.textContent).toContain('Truyện A');
  expect(khoi.textContent).toContain(CHU.daKyTamDung);
  expect(khoi.textContent).toContain('đọc lại hồi 2');
  expect(container.querySelector('.tuTomTat')?.textContent).toBe('Một truyện có việc cần bạn.');
  // Thẻ của cuốn đó cũng mang viên amber, để quét kệ vẫn thấy.
  expect(the(container, 'a').querySelector('.vien.amber')?.textContent).toBe(CHU.daKyTamDungNgan);
  expect(the(container, 'b').querySelector('.vien.amber')).toBeNull();

  fireEvent.click(khoi.querySelector('button')!);
  expect(mo).toHaveBeenCalledWith('a', 'dong-san-xuat');
});

test('thẻ cuối kệ là "+ Viết truyện mới", và nó dẫn tới màn viết mới', () => {
  const chon = vi.fn();
  const { container } = render(
    <Xuong sach={[sach({ id: 'a' })]} tong={tongGia()} onChonKhu={chon} onMoTacPham={() => {}} onXoaXong={() => {}} />,
  );
  const cuoi = container.querySelector('.keLuoi > li:last-child')!;
  expect(cuoi.classList.contains('theMoi')).toBe(true);
  expect(cuoi.textContent).toContain(DH.vietTruyenMoi);
  fireEvent.click(cuoi.querySelector('button')!);
  expect(chon).toHaveBeenCalledWith('tac-pham-moi');
});

test('Gần đây xếp theo lần sửa mới nhất, và chỉ hiện khi có từ hai cuốn có mốc', () => {
  const mot = ve({ id: 'a', updated_at: '2026-07-31T16:11:20Z' }, { id: 'b' });
  expect(mot.container.querySelector('.tuGanDay')).toBeNull();
  mot.unmount();

  const { container } = ve(
    { id: 'cu', name: 'Cũ', updated_at: '2026-07-01T10:00:00Z' },
    { id: 'moi', name: 'Mới', updated_at: '2026-07-31T16:11:20Z' },
    { id: 'khong', name: 'Không mốc' },
  );
  const ten = [...container.querySelectorAll('.tuGanDay .ten')].map((e) => e.textContent);
  expect(ten).toEqual(['Mới', 'Cũ']);
});
