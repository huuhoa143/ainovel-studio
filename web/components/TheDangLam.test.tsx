import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import { TD } from '@/lib/chu/tien-do';
import { DH } from '@/lib/nhan';
import type { Snapshot } from '@/lib/types';
import type { CongDoanSong } from '@/lib/useStudio';

import { snap } from './mau.test-helper';
import { PhienNay, TheDangLam, buocCuaChuong, chiSoBuoc } from './TheDangLam';

function ve(dangChay: boolean, p: Partial<Snapshot> = {}, song?: CongDoanSong) {
  return render(
    <TheDangLam snapshot={snap(p)} song={song} dangChay={dangChay} truc={<i data-truc />} />,
  );
}

const SONG = (buoc: string, dangChay: boolean): CongDoanSong => ({
  buoc,
  vai: 'writer',
  dangChay,
  luc: '2026-08-01T10:00:00Z',
  loi: false,
});

/* ── năm bước ─────────────────────────────────────────────────────────── */

test('mã bước nhận cả mã checkpoint lẫn tên lời gọi tool', () => {
  expect(chiSoBuoc('plan')).toBe(0);
  expect(chiSoBuoc('draft_chapter(chương 2)')).toBe(1);
  expect(chiSoBuoc('edit')).toBe(1);
  expect(chiSoBuoc('consistency_check')).toBe(2);
  expect(chiSoBuoc('check_consistency(chương 2)')).toBe(2);
  expect(chiSoBuoc('commit_chapter')).toBe(3);
  expect(chiSoBuoc('save_review')).toBe(4);
  // Mã lạ không sáng bước nào — thà im còn hơn sáng nhầm.
  expect(chiSoBuoc('novel_context')).toBeUndefined();
});

test('SSE báo bước ĐANG chạy thì sáng đúng bước đó', () => {
  expect(buocCuaChuong(SONG('draft_chapter', true), 'plan')).toEqual({
    hienTai: 1,
    dangLam: true,
  });
});

test('chỉ có bước VỪA XONG thì sáng bước kế tiếp, và xong bước cuối thì vòng về đầu', () => {
  // `transport.last_step` là bước vừa xong, không phải bước đang chạy.
  expect(buocCuaChuong(undefined, 'consistency_check')).toEqual({
    hienTai: 3,
    dangLam: false,
    vuaXong: 2,
  });
  expect(buocCuaChuong(undefined, 'review')?.hienTai).toBe(0);
  expect(buocCuaChuong(undefined, undefined)).toBeUndefined();
});

/* ── thẻ ──────────────────────────────────────────────────────────────── */

test('đang chạy: thấy "Đang viết", tên chương và dải năm bước có bước hiện tại', () => {
  const { container } = ve(
    true,
    {
      runtime: 'running',
      in_progress_chapter: 7,
      chapters: [{ chapter: 7, stage: 'drafting', title: 'Kho lạnh đứng tên người chết' }],
    },
    SONG('check_consistency(chương 7)', true),
  );

  expect(screen.getByText(DH.dangViet)).toBeDefined();
  expect(screen.getByRole('heading', { name: /Chương 7 · Kho lạnh đứng tên người chết/ })).toBeDefined();
  const buoc = container.querySelectorAll('.tdBuoc li');
  expect(buoc).toHaveLength(5);
  expect(buoc[2]!.getAttribute('aria-current')).toBe('step');
  expect(buoc[0]!.className).toContain('xong');
  expect(buoc[4]!.className).toContain('chua');
});

test('máy nghỉ: không có dải năm bước, vì không bước nào đang diễn ra', () => {
  const { container } = ve(false, { runtime: 'idle' });
  expect(container.querySelector('.tdBuoc')).toBeNull();
});

test('cửa đang chờ: câu trạng thái là "Chờ bạn duyệt" và chương là chương đang chờ', () => {
  ve(false, {
    runtime: 'paused',
    advance: { mode: 'review', hold: true, permit_chapter: 8 },
    chapters: [{ chapter: 8, stage: 'done', title: 'Tín hiệu dưới mực xanh' }],
  });
  expect(screen.getByText(TD.choBanDuyet)).toBeDefined();
  expect(screen.getByRole('heading', { name: /Chương 8 · Tín hiệu dưới mực xanh/ })).toBeDefined();
});

test('trục được vẽ trong thẻ', () => {
  const { container } = ve(false);
  expect(container.querySelector('.tdTruc [data-truc]')).not.toBeNull();
});

/* ── phiên này ────────────────────────────────────────────────────────── */

test('phiên này: số chưa có nguồn nói "chưa đủ số liệu", không điền 0', () => {
  // Tốc độ 0 chương/giờ và "phiên quá ngắn để đo" là hai chuyện khác nhau.
  render(<PhienNay snapshot={snap({ transport: { state: 'running', cost_usd: 1.5 } })} />);
  expect(screen.getAllByText(TD.chuaDo).length).toBeGreaterThanOrEqual(2);
  expect(screen.getByText('$1,50')).toBeDefined();
});

test('phiên này: có số thì nói kèm đơn vị', () => {
  render(
    <PhienNay
      snapshot={snap({
        transport: {
          state: 'running',
          cost_usd: 128.25,
          chapters_per_hour: 7.5,
          cost_per_chapter: 0.18,
          model: 'lingoreup-auto',
        },
      })}
    />,
  );
  expect(screen.getByText(TD.chuongMoiGio('7,5'))).toBeDefined();
  expect(screen.getByText('lingoreup-auto')).toBeDefined();
});
