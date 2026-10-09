import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import { LOI_LLM, TD } from '@/lib/chu/tien-do';
import { giaiLoi } from '@/lib/loiLlm';
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

/* ── dựng nền, lỗi LLM, kẹt (đo trên truyện thật dong-ho-qua-lac) ─────────── */

const LOI_THO =
  'Thử lại (4/7): routing_exhausted: All models exhausted: 388 routes checked (229 no usable key c...';

test('chưa có chương nào và Kiến trúc sư đang làm → "Đang dựng nền truyện", không phải "Chương 1"', () => {
  const s = snap({});
  ve(
    true,
    { book: { ...s.book, phase: 'init', completed_chapters: 0 }, in_progress_chapter: undefined },
    { ...SONG('draft', true), vai: 'architect_short', buoc: 'save_foundation' },
  );
  expect(screen.getByRole('heading', { name: LOI_LLM.dungNen })).toBeDefined();
  expect(screen.queryByText(/^Chương 1/)).toBeNull();
});

test('bước là lỗi LLM → câu tiếng Việt kèm việc nên làm, nguyên văn ở title', () => {
  const s = snap({});
  const { container } = ve(
    true,
    { book: { ...s.book, phase: 'init', completed_chapters: 0 } },
    { ...SONG('x', true), vai: 'architect_short', buoc: LOI_THO, dangChay: false },
  );
  const mt = container.querySelector('.tdMoTa')!;
  expect(mt.textContent).toContain('không còn model nào nhận yêu cầu');
  expect(mt.textContent).toContain('Kiến trúc sư');
  expect(mt.textContent).not.toContain('routing_exhausted');
  expect(mt.getAttribute('title')).toBe(LOI_THO);
});

test('kẹt → thẻ nói "Đang kẹt" và có nút mở Model & khóa API', () => {
  const s = snap({});
  const chon: string[] = [];
  render(
    <TheDangLam
      snapshot={snap({ book: { ...s.book, phase: 'init', completed_chapters: 0 } })}
      song={undefined}
      dangChay
      truc={<i data-truc />}
      ket={{ loi: giaiLoi(LOI_THO, { ncc: 'lingoreup', vai: 'architect_short' })!, vai: 'architect_short' }}
      onChonKhu={(k) => chon.push(k)}
    />,
  );
  expect(screen.getByText(LOI_LLM.dangKet)).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: LOI_LLM.moCauHinh }));
  expect(chon).toEqual(['cau-hinh']);
});

/* ── lượt chạy thật dong-ho-qua-lac: sau Chốt KHÔNG mặc nhiên là Biên tập ─────────────── */

test('chốt xong mà chưa tới lượt chấm thì bước kế là Kế hoạch của chương sau', () => {
  expect(buocCuaChuong(undefined, 'commit')).toEqual({ hienTai: 0, dangLam: false, vuaXong: 3 });
  expect(buocCuaChuong(undefined, 'commit', true)).toEqual({ hienTai: 4, dangLam: false, vuaXong: 3 });
});

test('thẻ không nói "kế tiếp là biên tập" khi chưa tới lượt chấm (2 chương xong)', () => {
  ve(true, {
    book: { ...snap({}).book, completed_chapters: 2, total_chapters: 3, phase: 'writing' },
    transport: { state: 'running', cost_usd: 0, last_step: 'commit' },
  });
  expect(screen.queryByText(/kế tiếp là biên tập/)).toBeNull();
  expect(screen.getByText(TD.moTaXongChuong('AI'))).toBeDefined();
});

test('giao việc đang chạy đọc thành "Điều phối giao cho Người viết: …", không phải "giao việc cho chính mình"', () => {
  ve(
    true,
    { book: { ...snap({}).book, completed_chapters: 1, total_chapters: 3, phase: 'writing' } },
    { buoc: 'writer (Viết chương 2)', vai: 'writer', loai: 'DISPATCH', dangChay: true, luc: '', loi: false },
  );
  expect(screen.getByText('Điều phối giao cho Người viết: Viết chương 2')).toBeDefined();
});

test('công cụ đang chạy đọc thành việc của vai, không phải tên hàm', () => {
  ve(
    true,
    { book: { ...snap({}).book, completed_chapters: 2, total_chapters: 3, phase: 'writing' } },
    { buoc: 'novel_context(chương 3)', vai: 'writer', loai: 'TOOL', dangChay: true, luc: '', loi: false },
  );
  expect(screen.getByText('Người viết đang đọc tài liệu cho chương 3.')).toBeDefined();
  expect(screen.queryByText(/novel_context/)).toBeNull();
});
