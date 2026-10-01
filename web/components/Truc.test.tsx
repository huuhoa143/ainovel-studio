import { render } from '@testing-library/react';
import { expect, test } from 'vitest';

import type { ChapterMark, MarkState, Timeline } from '@/lib/types';

import { Truc } from './Truc';

/**
 * Họ 09 — chương chốt. Vạch trên lane đổ đầy từ trái rồi cao thêm và nhấp.
 *
 * Đây là sự kiện quan trọng nhất của cả sản phẩm: một đơn vị sản xuất vừa hoàn thành, thứ
 * người vận hành chờ suốt sáu giờ. Trước bản này nó là một vạch vài pixel đổi màu, không
 * dấu vết nào.
 *
 * jsdom KHÔNG chạy hoạt ảnh và KHÔNG bố cục, nên tệp này đo đúng cái nó đo được: lớp có
 * được gắn đúng vạch không, và cấu trúc dải có tách đúng chỗ không. Chuyển động thật là
 * việc của phép kiểm trên trình duyệt — nói ra để không ai tưởng bộ kiểm canh cả hình.
 */

function tl(cap: [number, MarkState][]): Timeline {
  const chapters: ChapterMark[] = cap.map(([chapter, state]) => ({ chapter, state }));
  return { volumes: null, arcs: null, chapters };
}

const CAP = { layered_outline: false } as never;

function ve(cap: [number, MarkState][], vuaChot: ReadonlySet<number>) {
  return render(
    <Truc
      timeline={tl(cap)}
      capabilities={CAP}
      chuongChon={undefined}
      onChonChuong={() => {}}
      vuaChot={vuaChot}
    />,
  );
}

/** Lane THƯA: dưới ngưỡng dày thì mỗi chương một vạch riêng. */
const THUA: [number, MarkState][] = [
  [1, 'done'],
  [2, 'done'],
  [3, 'running'],
];

test('không có chương nào vừa chốt thì KHÔNG vạch nào mang lớp', () => {
  const { container } = ve(THUA, new Set());
  expect(container.querySelectorAll('.chlane i.vuaChot')).toHaveLength(0);
  // Vạch vẫn phải được vẽ: một bản sửa xoá sạch lane cũng làm dòng trên xanh.
  expect(container.querySelectorAll('.chlane i').length).toBeGreaterThan(0);
});

test('lane thưa: ĐÚNG vạch của chương vừa chốt mang lớp', () => {
  const { container } = ve(THUA, new Set([2]));
  const nhap = [...container.querySelectorAll('.chlane i.vuaChot')];
  expect(nhap).toHaveLength(1);
  // Đúng vạch nào: chú giải của vạch mang số chương.
  expect(nhap[0]!.getAttribute('title')).toContain('chương 2');
});

test('vạch vừa chốt GIỮ nguyên lớp trạng thái — hoạt ảnh không được nuốt màu', () => {
  // `vuaChot` thêm vào chứ không thay thế. Mất `done` là mất màu teal, và lúc hoạt ảnh chạy
  // xong vạch sẽ về màu "chưa tới" — tức chương vừa chốt trông như chưa làm.
  const { container } = ve(THUA, new Set([2]));
  const v = container.querySelector('.chlane i.vuaChot');
  expect(v?.className).toContain('done');
});

/* ── lane DÀY: dải gộp ────────────────────────────────────────────────────
 *
 * `hoVach` trả 0 khi có TRÊN 220 chương trong cửa sổ; dưới ngưỡng đó lane vẫn vẽ từng
 * chương. Con số ấy phải đứng trong fixture chứ không trong đầu người viết bài kiểm:
 *
 * ĐO ĐƯỢC — bản đầu của hai bài dưới đây dùng 120 chương và chúng XANH mà không kiểm gì.
 * jsdom cho ra 120 phần tử với `gap: 1.5px`, tức nhánh THƯA; `nhomVach` không hề được gọi,
 * và phép so tổng trọng số là `0 === 0` vì nhánh thưa không đặt `flexGrow` nào. Hai bài
 * xanh trên một đường mã chưa từng chạy.
 *
 * Nên bài đầu tiên của nhóm này canh chính cái tiền đề đó — nếu ngưỡng đổi thì nó đỏ trước,
 * thay vì hai bài kia lặng lẽ thành vacuous lần nữa.
 */

const SO_CHUONG_DAY = 260;

function laneDay(n: number, chotTai: number): [number, MarkState][] {
  return Array.from(
    { length: n },
    (_, i) => [i + 1, i + 1 > chotTai ? 'pending' : 'done'] as [number, MarkState],
  );
}

test('fixture lane dày THẬT SỰ chạy nhánh gộp dải', () => {
  // Tiền đề của hai bài dưới. Nhánh gộp cho ra ÍT phần tử hơn hẳn số chương và đặt
  // `flexGrow`; nhánh thưa cho ra đúng một phần tử mỗi chương và không đặt `flexGrow`.
  const { container } = ve(laneDay(SO_CHUONG_DAY, 40), new Set());
  const els = [...container.querySelectorAll('.chlane i')];

  expect(els.length, 'phải gộp, không phải một vạch một chương').toBeLessThan(SO_CHUONG_DAY);
  expect((els[0] as HTMLElement).style.flexGrow, 'nhánh gộp đặt flexGrow').not.toBe('');
});

test('lane dày: chương vừa chốt được TÁCH thành dải riêng, không nhuộm cả dãy', () => {
  const { container } = ve(laneDay(SO_CHUONG_DAY, 40), new Set([40]));
  const nhap = [...container.querySelectorAll('.chlane i.vuaChot')];

  expect(nhap).toHaveLength(1);
  // Dải MỘT chương, không phải dải 40 chương: `flexGrow` là trọng số độ rộng.
  expect((nhap[0] as HTMLElement).style.flexGrow).toBe('1');
  expect(nhap[0]!.getAttribute('title')).toBe('chương 40 · đã duyệt');
});

test('lane dày: tách KHÔNG làm đổi tổng trọng số — không có gì xê dịch', () => {
  // Độ rộng dải là `flexGrow: len`. Tổng đổi thì cả lane co giãn ngay giữa lúc hoạt ảnh
  // chạy, tức chuyển động mang thông tin biến thành chuyển động gây nhiễu.
  const cap = laneDay(SO_CHUONG_DAY, 40);
  const tong = (vc: ReadonlySet<number>) => {
    const { container } = ve(cap, vc);
    return [...container.querySelectorAll('.chlane i')].reduce(
      (s, el) => s + Number((el as HTMLElement).style.flexGrow || 0),
      0,
    );
  };
  const day = tong(new Set([40]));
  expect(day, 'tổng phải là một số thật, không phải 0 của nhánh thưa').toBe(SO_CHUONG_DAY);
  expect(day).toBe(tong(new Set()));
});
