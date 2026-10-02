import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import { GIAI_THICH } from '@/lib/nhan';

import type { StreamEvent } from '@/lib/types';

import { DongSuKien, NhatKy } from './NhatKy';

/**
 * Ca rỗng của dòng sự kiện phải nói đúng lý do nó rỗng, và có HAI lý do khác nhau.
 *
 * ĐO ĐƯỢC lúc E2E kế hoạch 2/4 trên cuốn `mac-the-bien-di-vo`: engine đang viết chương 3,
 * khu văn sống đang chảy 9.943 ký tự, dải trạng thái ghi `Writer → draft_chapter` — và ngay
 * dưới đó dòng sự kiện ghi "Engine đang nghỉ hoặc chưa phát".
 *
 * Rỗng lúc máy chạy là chuyện BÌNH THƯỜNG, không phải sự cố: observer chỉ ghi vào hàng những
 * bước ĐÃ KẾT THÚC (internal/host/observer.go:191), nên suốt một lượt `draft_chapter` dài
 * không có sự kiện nào. Phép đo trên `sample.gif` nói đúng thế: dòng sự kiện nhảy 5 lần rồi
 * im 15 giây. Cái sai không phải chỗ rỗng — mà là câu giải thích khẳng định một điều mà ba
 * chỗ khác trên cùng màn hình đang phủ nhận.
 */
test('máy ĐANG CHẠY mà chưa có sự kiện thì KHÔNG được nói engine đang nghỉ', () => {
  render(<DongSuKien suKien={[]} dangChay />);

  const p = screen.getByText(/./, { selector: '.trongSect' });
  expect(p.textContent).not.toMatch(/đang nghỉ/i);
  expect(p.textContent).toBe(GIAI_THICH.chuaCoSuKienDangChay);
});

test('máy NGHỈ mà chưa có sự kiện thì được phép nói engine đang nghỉ', () => {
  render(<DongSuKien suKien={[]} dangChay={false} />);
  expect(screen.getByText(GIAI_THICH.chuaCoSuKienDangNghi)).toBeDefined();
});

test('hai câu là hai câu KHÁC nhau — gộp lại là mất đúng phân biệt này', () => {
  expect(GIAI_THICH.chuaCoSuKienDangChay).not.toBe(GIAI_THICH.chuaCoSuKienDangNghi);
});

test('có sự kiện thì vẽ sự kiện, không vẽ câu rỗng nào', () => {
  render(
    <DongSuKien
      suKien={[{ seq: 1, time: '2026-08-01T20:11:00Z', kind: 'ui_event', summary: 'viết chương 3' }]}
      dangChay
    />,
  );
  expect(screen.getByText('viết chương 3')).toBeDefined();
  expect(document.querySelector('.trongSect')).toBeNull();
});

/* ── đo trên truyện thật dong-ho-qua-lac ───────────────────────────────── */

const HET_TUYEN = (n: number) =>
  `Thử lại (${n}/7): routing_exhausted: All models exhausted: 388 routes checked (229 no usable key c...`;

test('Diễn biến: xếp theo giờ, gộp thử lại liền nhau, dịch lỗi; dòng giao việc thành câu', () => {
  const suKien: StreamEvent[] = [
    // Thứ tự ĐẾN (seq) — sự kiện giao việc 09:07 phát lại sau với seq mới.
    { seq: 9, time: '2026-10-02T09:07:00+07:00', kind: 'event', category: 'DISPATCH', agent: 'architect_short', summary: 'architect_short (Hãy xây dựng…)' },
    { seq: 8, time: '2026-10-02T09:10:30+07:00', kind: 'event', category: 'SYSTEM', agent: 'architect_short', summary: HET_TUYEN(3) },
    { seq: 7, time: '2026-10-02T09:10:20+07:00', kind: 'event', category: 'SYSTEM', agent: 'architect_short', summary: HET_TUYEN(2) },
    { seq: 6, time: '2026-10-02T09:10:10+07:00', kind: 'event', category: 'SYSTEM', agent: 'architect_short', summary: HET_TUYEN(1) },
  ];
  const { container } = render(<DongSuKien suKien={suKien} dangChay ncc="lingoreup" />);
  const dong = [...container.querySelectorAll('.sk')];
  expect(dong).toHaveLength(2);
  expect(dong[0]!.textContent).toContain('Thử lại 3 lần');
  expect(dong[0]!.textContent).toContain('lingoreup không còn model nào');
  expect(dong[0]!.textContent).not.toContain('routing_exhausted');
  expect(dong[0]!.querySelector('.tt')!.getAttribute('title')).toContain('routing_exhausted');
  // Dòng giao việc 09:07 đứng SAU các dòng 09:10, và đọc thành câu.
  expect(dong[1]!.textContent).toContain('Giao việc cho Kiến trúc sư');
});

test('Nhật ký: đầu vào của plan_start là "Ý tưởng của bạn", của intervention là "Góp ý"', () => {
  render(
    <NhatKy
      decisions={[
        { id: 'a', at: '2026-10-02T09:07:00+07:00', kind: 'plan_start', decider: 'arbiter', input: 'Truyện ngắn 3 chương' },
        { id: 'b', at: '2026-10-02T09:08:00+07:00', kind: 'intervention', decider: 'arbiter', input: 'Cho nhân vật buồn hơn' },
      ]}
    />,
  );
  expect(screen.getByText(/Ý tưởng của bạn:/).textContent).toContain('Truyện ngắn 3 chương');
  expect(screen.getByText(/Góp ý:/).textContent).toContain('Cho nhân vật buồn hơn');
});

test('lỗi thoáng qua đã tự thử lại thành công thì không đỏ, không khuyên đổi model', () => {
  const { container } = render(
    <DongSuKien
      ncc="lingo2"
      suKien={[
        {
          seq: 1,
          time: '2026-10-02T11:41:48+07:00',
          kind: 'ui',
          category: 'SYSTEM',
          agent: 'writer',
          summary: 'Thử lại (1/7, sau 1s): {"title":"Error 502: Bad gateway"}',
        },
        {
          seq: 2,
          time: '2026-10-02T11:41:55+07:00',
          kind: 'ui',
          category: 'TOOL',
          agent: 'writer',
          summary: 'draft_chapter(chương 3)',
        },
      ]}
    />,
  );
  const dong = container.querySelector('.sk.daQua');
  expect(dong).not.toBeNull();
  expect(dong!.classList.contains('loi')).toBe(false);
  expect(dong!.textContent).toContain('lingo2 tạm thời lỗi 502, đã tự thử lại.');
  expect(dong!.textContent).not.toContain('Thử chọn model khác');
  // Công cụ cũng đọc bằng tiếng Việt.
  expect(container.textContent).toContain('Viết nháp chương 3');
});
