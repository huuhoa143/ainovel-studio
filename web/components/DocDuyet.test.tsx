import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

import { DOC_DUYET } from '@/lib/chu/doc-duyet';
import { CHU, GIAI_THICH } from '@/lib/nhan';
import type { ChapterRow, Review, Snapshot } from '@/lib/types';

import { BanDuyet } from './BanDuyet';
import { DocTruyen } from './DocTruyen';
import { HangChoVietLai } from './HangChoVietLai';
import { KiemDinh } from './KiemDinh';
import { locChuong, nhomChuong } from './MucLucChuong';
import { snap } from './mau.test-helper';

vi.mock('@/lib/api', async (goc) => ({
  ...(await goc<typeof import('@/lib/api')>()),
  layChuong: vi.fn(async (_b: string, n: number) => ({
    chapter: n,
    title: `Tên ${n}`,
    words: 1200,
    text: `Chương ${n}: Tên ${n}\n\nĐoạn mở đầu của chương ${n}.\n\nĐoạn thứ hai.`,
  })),
}));

beforeEach(() => {
  window.localStorage.clear();
});

const HANG: ChapterRow[] = [
  { chapter: 1, stage: 'done', title: 'Cửa đá' },
  { chapter: 2, stage: 'done', title: 'Người gác cầu' },
  { chapter: 3, stage: 'rewrite', title: 'Thư không người nhận', words: 2837 },
  { chapter: 12, stage: 'done', title: 'Đêm trắng' },
];

/* ── mục lục ──────────────────────────────────────────────────────────── */

test('tìm chương theo số: đúng số trước, rồi các số bắt đầu bằng chuỗi gõ', () => {
  expect(locChuong(HANG, '1').map((r) => r.chapter)).toEqual([1, 12]);
});

test('tìm chương theo tên không cần gõ dấu', () => {
  expect(locChuong(HANG, 'cua da').map((r) => r.chapter)).toEqual([1]);
  expect(locChuong(HANG, 'dem').map((r) => r.chapter)).toEqual([12]);
});

test('nhóm theo Tập → Hồi chỉ từ khối đã mở; không có khối thì một nhóm phẳng', () => {
  expect(nhomChuong(HANG, { volumes: null, arcs: null, chapters: [] })).toHaveLength(1);

  const g = nhomChuong(HANG, {
    volumes: [{ index: 1, title: 'Khởi đầu', state: 'done', chapters: 3, from: 1, to: 3 }],
    arcs: [{ index: 2, state: 'running', chapters: 2, from: 2, to: 3 }],
    chapters: [],
  });
  expect(g.map((t) => t.ten)).toEqual(['Tập 1 · Khởi đầu', DOC_DUYET.ngoaiTap]);
  expect(g[0]!.hoi.map((h) => h.ten)).toEqual([undefined, 'Hồi 2']);
});

/* ── nhận xét ─────────────────────────────────────────────────────────── */

const DUYET: Review = {
  chapter: 1,
  scope: 'chapter',
  verdict: 'pass',
  summary: 'Ổn.',
  dimensions: [
    { name: 'pacing', score: 70, verdict: 'pass' },
    { name: 'hook', score: 0 },
    { name: 'aesthetic' },
  ],
  issues: [
    { type: 'pacing', severity: 'warning', description: 'nhẹ', needs_change: false },
    {
      type: 'consistency',
      severity: 'critical',
      description: 'nặng',
      evidence: 'Hắn đã chết.',
      needs_change: true,
    },
  ],
};

test('điểm tổng là trung bình các tiêu chí được chấm — 0 tính, vắng không tính', () => {
  const { container } = render(<BanDuyet review={DUYET} />);
  expect(container.querySelector('.bdDiem .so')?.textContent).toBe('35');
  // Tiêu chí vắng điểm không có thanh.
  expect(container.querySelectorAll('.bdTieuChi .dac')).toHaveLength(2);
});

test('vấn đề nghiêm trọng đứng trước, dẫn chứng là trích dẫn', () => {
  const { container } = render(<BanDuyet review={DUYET} />);
  const mota = [...container.querySelectorAll('.bdVanDe .mota')].map((p) => p.textContent);
  expect(mota).toEqual(['nặng', 'nhẹ']);
  expect(container.querySelector('.danchung blockquote')?.textContent).toBe('Hắn đã chết.');
});

test('chương đang viết chưa có nhận xét thì nói vì sao', () => {
  render(
    <KiemDinh
      snapshot={snap({ chapters: [{ chapter: 4, stage: 'drafting' }] })}
      tacPham="b"
      choGhi
      dangChay
      chuongChon={4}
      onChonChuong={() => {}}
      onDoi={() => {}}
    />,
  );
  expect(screen.getByText(GIAI_THICH.chuaCoDuyet)).toBeDefined();
  expect(screen.getByText(DOC_DUYET.viSaoChuaCo.drafting)).toBeDefined();
});

test('snapshot còn của chương cũ thì nói đang mở, không nói "chưa có"', () => {
  render(
    <KiemDinh
      snapshot={snap({ chapters: HANG, selected: { chapter: 1, review: DUYET } })}
      tacPham="b"
      choGhi
      dangChay={false}
      chuongChon={2}
      onChonChuong={() => {}}
      onDoi={() => {}}
    />,
  );
  expect(screen.getByText(DOC_DUYET.dangMoNhanXet)).toBeDefined();
  expect(screen.queryByText(GIAI_THICH.chuaCoDuyet)).toBeNull();
});

/* ── Đọc truyện ───────────────────────────────────────────────────────── */

function veDoc(chuong: number, onChon = vi.fn()) {
  const s = snap({ chapters: HANG }) as Snapshot;
  render(<DocTruyen snapshot={s} tacPham="b" chuongChon={chuong} onChonChuong={onChon} />);
  return onChon;
}

test('phím ←/→ chuyển chương theo danh sách, bỏ qua khi đang gõ trong ô tìm', async () => {
  const onChon = veDoc(2);
  await screen.findByRole('heading', { name: 'Chương 2 · Tên 2' });

  fireEvent.keyDown(window, { key: 'ArrowRight' });
  expect(onChon).toHaveBeenLastCalledWith(3);
  fireEvent.keyDown(window, { key: 'ArrowLeft' });
  expect(onChon).toHaveBeenLastCalledWith(1);

  onChon.mockClear();
  fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'ArrowRight' });
  expect(onChon).not.toHaveBeenCalled();
});

test('dòng tiêu đề lặp ở đầu văn bị bỏ', async () => {
  veDoc(1);
  await screen.findByText('Đoạn mở đầu của chương 1.');
  expect(screen.queryByText(/^Chương 1: Tên 1$/)).toBeNull();
});

test('cỡ chữ và cột phải được nhớ trong localStorage', async () => {
  veDoc(1);
  await screen.findByText('Đoạn mở đầu của chương 1.');

  fireEvent.click(screen.getByRole('button', { name: DOC_DUYET.toChu }));
  expect(window.localStorage.getItem('ainovel.doc.coChu')).toBe('18');
  const bai = document.querySelector<HTMLElement>('.khoDoc')!;
  expect(bai.style.getPropertyValue('--doc-co')).toBe('18px');

  fireEvent.click(screen.getAllByRole('button', { name: DOC_DUYET.dongBenLe })[0]!);
  expect(window.localStorage.getItem('ainovel.doc.benLe')).toBe('0');
  expect(document.querySelector('.docLe')).toBeNull();
});

test('mở lại thì đọc đúng sở thích đã lưu', async () => {
  window.localStorage.setItem('ainovel.doc.coChu', '20');
  window.localStorage.setItem('ainovel.doc.benLe', '0');
  veDoc(1);
  await screen.findByText('Đoạn mở đầu của chương 1.');
  await waitFor(() =>
    expect(document.querySelector<HTMLElement>('.khoDoc')!.style.getPropertyValue('--doc-co')).toBe(
      '20px',
    ),
  );
  expect(document.querySelector('.docLe')).toBeNull();
});

/* ── Cần viết lại ─────────────────────────────────────────────────────── */

test('thẻ đang mở có lối đọc bản cũ và mở nhận xét đầy đủ', () => {
  const onChonKhu = vi.fn();
  render(
    <HangChoVietLai
      snapshot={snap({
        chapters: HANG,
        rewrite_reason: 'Mâu thuẫn mốc thời gian.',
        selected: { chapter: 3, review: { ...DUYET, chapter: 3 } },
      })}
      chuongChon={3}
      onChonChuong={() => {}}
      onChonKhu={onChonKhu}
    />,
  );
  expect(screen.getByText('Mâu thuẫn mốc thời gian.')).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: DOC_DUYET.docBanCu }));
  expect(onChonKhu).toHaveBeenLastCalledWith('ban-thao');
  fireEvent.click(screen.getByRole('button', { name: DOC_DUYET.moNhanXetDay }));
  expect(onChonKhu).toHaveBeenLastCalledWith('kiem-dinh');
});

test('thẻ đóng chỉ có nút xem nhận xét, bấm là chọn chương', () => {
  const onChon = vi.fn();
  render(
    <HangChoVietLai snapshot={snap({ chapters: HANG })} chuongChon={undefined} onChonChuong={onChon} />,
  );
  const nut = screen.getByRole('button', { expanded: false });
  expect(nut.textContent).toContain(CHU.moBanDuyet);
  fireEvent.click(nut);
  expect(onChon).toHaveBeenCalledWith(3);
});
