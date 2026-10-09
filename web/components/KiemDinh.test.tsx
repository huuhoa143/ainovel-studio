import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import { DOC_DUYET } from '@/lib/chu/doc-duyet';
import { CHU, GIAI_THICH } from '@/lib/nhan';
import type { Snapshot } from '@/lib/types';

import { KiemDinh } from './KiemDinh';
import { snap } from './mau.test-helper';

/**
 * Bộ kiểm cho bề mặt Kiểm định. Repo chưa từng có tệp này; nó ra đời cùng Task 5, vì không có
 * nó thì không chỗ nào bắt được việc dải quyết định bị gắn sai hoặc bị gắn thiếu prop ở đây —
 * và đúng bề mặt này là chỗ spec §7.3 gọi là nơi người dùng đọc bằng chứng để quyết định.
 */
function ve(p: Partial<Snapshot> = {}, q: Partial<Parameters<typeof KiemDinh>[0]> = {}) {
  return render(
    <KiemDinh
      snapshot={snap(p)}
      tacPham="b"
      dangChay={false}
      chuongChon={undefined}
      onChonChuong={() => {}}
      onDoi={() => {}}
      {...q}
    />,
  );
}

const CHO = { mode: 'review', hold: true, permit_chapter: 8 } as const;

/* ── bề mặt vẫn làm đúng việc cũ của nó ────────────────────────────────── */

test('vẽ bản duyệt của ĐÚNG chương đang chọn', () => {
  const { container } = ve(
    {
      chapters: [{ chapter: 8, stage: 'done', words: 2100, title: 'Cửa đá' }],
      selected: {
        chapter: 8,
        review: {
          chapter: 8,
          scope: 'chapter',
          verdict: 'pass',
          dimensions: [{ name: 'nhịp', score: 78, comment: 'chậm ở đoạn giữa' }],
        },
      },
    },
    { chuongChon: 8 },
  );

  expect(container.querySelector('.duyetthan')).not.toBeNull();
  // `getByRole('heading')` chứ không phải `getByText`: tiêu đề chương hiện ở HAI chỗ trên bề
  // mặt này (danh sách chọn bên trái và đầu bản duyệt bên phải), nên một phép tra theo chữ
  // thấy hai phần tử và đỏ vì lý do không liên quan tới điều đang canh. Tiêu đề mang cả số
  // chương ("Chương 8 · Cửa đá") — cùng một chuỗi với bề mặt đọc.
  expect(screen.getByRole('heading', { name: DOC_DUYET.tenChuong(8, 'Cửa đá') })).toBeDefined();
});

test('chương đang chọn chưa có bản duyệt thì nói ra, không vẽ một bản duyệt rỗng', () => {
  const { container } = ve({ chapters: [{ chapter: 8, stage: 'done', words: 10 }] }, {
    chuongChon: 8,
  });

  expect(container.querySelector('.duyetthan')).toBeNull();
  expect(screen.getByText(GIAI_THICH.chuaCoDuyet)).toBeDefined();
});

/* ── dải quyết định (Task 5) ───────────────────────────────────────────── */

test('cửa đang chờ → bề mặt Kiểm định vẽ dải quyết định, TRÊN bản duyệt', () => {
  // Nút quyết định phải ở cùng chỗ với bằng chứng (spec §7.3): đây là bề mặt người vận hành
  // đọc bản duyệt 7 chiều để quyết định, nên bắt họ đổi khu để bấm là bắt họ rời mắt khỏi
  // đúng thứ họ vừa đọc để quyết định.
  const { container } = ve({ advance: { ...CHO } });

  const dai = container.querySelector('.cuanghiemthu');
  expect(dai).not.toBeNull();

  // TRÊN bản duyệt, không phải đâu đó trong bề mặt: `compareDocumentPosition` chứ không phải
  // thứ tự `querySelectorAll`, vì một dải nhét vào cuối `<main>` vẫn "có mặt" trong khi người
  // dùng phải cuộn qua hết bản duyệt mới thấy hai cái nút.
  const layout = container.querySelector('.kiemlayout')!;
  expect(dai!.compareDocumentPosition(layout) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test('cửa KHÔNG chờ → bề mặt Kiểm định không có dải nào', () => {
  // Vế ngược. `snap()` để `advance: null` theo mặc định — engine đóng.
  const { container } = ve();
  expect(container.querySelector('.cuanghiemthu')).toBeNull();
});

test('dải ở Kiểm định nhận `tacPham`, nên hai nút BẤM ĐƯỢC', () => {
  // Lỗ hổng T2-8 của cụm trước trỏ thẳng vào bài này: `KiemDinh` trước Task 5 KHÔNG nhận
  // `tacPham`, nên để trống prop đó cho ra một dải amber với hai nút xám — một dải CHẾT trên
  // đúng bề mặt tồn tại để quyết định. Chốt `!!tacPham` bên trong `CuaNghiemThu` biến nó thành
  // hai nút vô hiệu thay vì một lời gọi `/books/undefined/advance`, nên hỏng ở đây là hỏng IM
  // LẶNG: không lỗi nào nổ ra.
  ve({ advance: { ...CHO } });

  for (const n of screen.getAllByRole('button', { name: /chương|Cho đi tiếp/ })) {
    expect((n as HTMLButtonElement).disabled).toBe(false);
  }
  expect(screen.getByRole('button', { name: /^Duyệt(, viết chương| dàn ý)/ })).toBeDefined();
  expect(screen.getByRole('button', { name: CHU.traChuongVeVietLai(8) })).toBeDefined();
});

test('dải ở Kiểm định: nút trả về mở ô góp ý ngay dưới dải, nhãn gửi theo máy chạy hay nghỉ', () => {
  // `dangChay` quyết định NHÃN của nút gửi, và hai nhãn đó là hai hệ quả khác nhau về tiền:
  // tiêm vào lượt đang chạy, hay đánh thức một lượt MỚI. Trang này không có ô góp ý ở đáy như
  // Tiến độ, nên ô nằm ngay dưới dải — thiếu nó thì nút trả về là một nút chết.
  const veVoi = (b: boolean) =>
    render(
      <KiemDinh
        snapshot={snap({ advance: { ...CHO } })}
        tacPham="b"
        dangChay={b}
        chuongChon={undefined}
        onChonChuong={() => {}}
        onDoi={() => {}}
      />,
    );

  veVoi(true);
  fireEvent.click(screen.getByRole('button', { name: CHU.traChuongVeVietLai(8) }));
  expect((document.activeElement as HTMLElement).id, 'con trỏ phải vào ô góp ý').toBe('o-gop-y');
  expect(screen.getByRole('button', { name: CHU.tiemVaoLuotDangChay })).toBeDefined();
  expect(screen.queryByRole('button', { name: CHU.danhThucLuotMoi })).toBeNull();

  cleanup();

  veVoi(false);
  fireEvent.click(screen.getByRole('button', { name: CHU.traChuongVeVietLai(8) }));
  expect(screen.getByRole('button', { name: CHU.danhThucLuotMoi })).toBeDefined();
  expect(screen.queryByRole('button', { name: CHU.tiemVaoLuotDangChay })).toBeNull();
});

/* ── chỉ một phần chương có nhận xét ─────────────────────────────────── */

const NHIEU = [
  { chapter: 1, stage: 'done', title: 'Một' },
  { chapter: 2, stage: 'done', title: 'Hai', reviewed: true },
  { chapter: 3, stage: 'done', title: 'Ba' },
  { chapter: 4, stage: 'done', title: 'Bốn', reviewed: true },
  { chapter: 5, stage: 'done', title: 'Năm' },
] as Snapshot['chapters'];

test('chưa chọn chương thì mở chương CÓ nhận xét mới nhất, không phải chương 1', () => {
  const chon: number[] = [];
  ve({ chapters: NHIEU }, { onChonChuong: (n) => chon.push(n) });
  expect(chon).toEqual([4]);
});

test('mục lục mặc định chỉ hiện chương có nhận xét; bấm "Tất cả" thì hiện đủ', () => {
  const { container } = ve({ chapters: NHIEU }, { chuongChon: 4 });
  const so = () => [...container.querySelectorAll('.mucluc .so')].map((e) => e.textContent);
  expect(so()).toEqual(['2', '4']);
  fireEvent.click(screen.getByRole('button', { name: DOC_DUYET.locTatCa(5) }));
  expect(so()).toEqual(['1', '2', '3', '4', '5']);
});

test('server ngã về bản duyệt chương khác → nói "đang mở", không gán điểm cho chương này', () => {
  // Chốt cũ so `sel.chapter` với chương đang chọn, mà server đặt `sel.chapter` = ĐÚNG chương
  // được hỏi rồi mới ngã về bản duyệt gần nhất trước đó (`LoadLastReview`). Nên chốt ấy cho
  // qua, và bề mặt in "Chương 4 · 89/100" cho một chương chưa viết chữ nào — đo được thật.
  const { container } = ve(
    {
      chapters: [
        { chapter: 3, stage: 'done', title: 'Chạy lại', reviewed: true },
        { chapter: 4, stage: 'pending', title: 'Chậm ba giây' },
      ],
      selected: {
        chapter: 4,
        title: 'Chậm ba giây',
        review: {
          chapter: 3,
          scope: 'global',
          verdict: 'accept',
          dimensions: [{ name: 'nhịp', score: 89 }],
        },
      },
    },
    { chuongChon: 4 },
  );

  expect(container.querySelector('.duyetthan')).toBeNull();
  expect(container.textContent).not.toContain('89');
  expect(screen.getByText(DOC_DUYET.dangMoNhanXet)).toBeDefined();
});
