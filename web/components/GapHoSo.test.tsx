import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

import { snap } from './mau.test-helper';

/**
 * Khối NỀN gập lại, khối ĐANG DÙNG mở ra.
 *
 * # Ca thật
 *
 * Người dùng: *"rất khó để xem và biết và sử dụng ấy, đặt vai vào người dùng nhé"*. Đo được
 * trên tác phẩm đang chạy, và hai con số nói hết:
 *
 *	Nhân vật   8 hồ sơ × ~501px = 4.083px → 6,3 màn hình, không mục lục
 *	Dàn ý      4 tập / 16 cung / 216 chương mở hết = 52.589px → 81,2 màn hình
 *
 * Cả hai bề mặt đều trả lời được câu hỏi khó (đọc kỹ một mục) mà KHÔNG trả lời được câu hỏi
 * dễ (*"cuốn này có những ai"*, *"Tập 3 có cung nào"*) — vì câu dễ đòi nhìn thấy cả danh
 * sách, mà cả danh sách thì không nằm vừa màn hình nào.
 *
 * Bốn bài dưới khoá đúng bộ mặc định ấy. Chúng dễ bị lật ngược bởi một lượt "cho tiện xem"
 * sau này, và lúc đó không có gì đỏ lên.
 */

let DAN_Y: { premise: string; volumes: unknown; flat: unknown } = {
  premise: '',
  volumes: null,
  flat: null,
};
let NHAN_VAT: { characters: unknown; snapshots: unknown } = {
  characters: null,
  snapshots: null,
};
let THE_GIOI: { rules: unknown; foreshadow: unknown; relations: unknown } = {
  rules: null,
  foreshadow: null,
  relations: null,
};

vi.mock('@/lib/api', async (goc) => ({
  ...(await goc<typeof import('@/lib/api')>()),
  layDanY: () => Promise.resolve(DAN_Y),
  layNhanVat: () => Promise.resolve(NHAN_VAT),
  layTheGioi: () => Promise.resolve(THE_GIOI),
}));

const { DanY } = await import('./DanY');
const { NhanVat } = await import('./NhanVat');

beforeEach(() => {
  cleanup();
  DAN_Y = { premise: '', volumes: null, flat: null };
  NHAN_VAT = { characters: null, snapshots: null };
  THE_GIOI = { rules: null, foreshadow: null, relations: null };
});

/* ── Nhân vật ───────────────────────────────────────────────────────────── */

const NGUOI = [
  { name: 'Lâm Kỳ', tier: 'core', role: 'nhân vật chính', aliases: ['Ông chủ Lâm'], description: 'Hai mươi bảy tuổi.', arc: 'Đường dây dài.', traits: ['thực dụng'] },
  { name: 'Hạ Văn Tình', tier: 'core', role: 'nữ chính', aliases: [], description: 'Bác sĩ.', arc: '', traits: [] },
  { name: 'A Lực', tier: 'secondary', role: 'hộ vệ', aliases: [], description: 'Lực quê.', arc: '', traits: [] },
];

test('lưới thẻ hiện CẢ DÀN, và chưa panel nào mở — cả dàn phải nằm vừa một màn', async () => {
  NHAN_VAT = { characters: NGUOI, snapshots: null };
  render(<NhanVat tacPham="b" />);

  await waitFor(() => expect(document.querySelectorAll('.tgNvThe').length).toBe(3));
  expect(
    document.querySelector('.tgNvPanel'),
    'một hồ sơ mở sẵn chiếm chỗ của lưới, nên những người còn lại lại nằm dưới mép',
  ).toBeNull();
  // Thứ tự theo hạng: chủ chốt trước, phụ sau.
  const ten = Array.from(document.querySelectorAll('.tgNvThe .tgNvTen .ten')).map((e) => e.textContent);
  expect(ten).toEqual(['Lâm Kỳ', 'Hạ Văn Tình', 'A Lực']);
});

test('thẻ mang đủ thứ để CHỌN mà không phải mở: tên · hạng · vai · bí danh', async () => {
  NHAN_VAT = { characters: NGUOI, snapshots: null };
  render(<NhanVat tacPham="b" />);

  await waitFor(() => expect(document.querySelector('.nguoidau')).not.toBeNull());
  const dau = document.querySelector('.nguoidau')!.textContent!;
  expect(dau).toContain('Lâm Kỳ');
  expect(dau).toContain('chủ chốt');
  expect(dau).toContain('nhân vật chính');
  // Bí danh là tên người vận hành hay gõ tìm — nó phải tra được khi panel còn đóng.
  expect(dau, 'bí danh nằm trong panel nên không tra được lúc đóng').toContain('Ông chủ Lâm');
});

test('bấm thẻ mở panel chi tiết; hồ sơ và hiện trạng là HAI khối riêng; Esc đóng', async () => {
  NHAN_VAT = {
    characters: NGUOI,
    snapshots: [{ volume: 2, arc: 1, name: 'Lâm Kỳ', status: 'Còn sống.', motivation: 'Giữ kho.' }],
  };
  render(<NhanVat tacPham="b" />);

  await waitFor(() => expect(document.querySelectorAll('.tgNvThe').length).toBe(3));
  const the = document.querySelector<HTMLButtonElement>('.tgNvThe')!;
  fireEvent.click(the);

  const panel = document.querySelector('.tgNvPanel')!;
  expect(panel).not.toBeNull();
  expect(the.getAttribute('aria-pressed')).toBe('true');
  expect(panel.querySelector('h2')?.textContent).toBe('Lâm Kỳ');
  expect(panel.textContent).toContain('thực dụng');
  const anh = panel.querySelector('.tgAnhChup')!;
  expect(anh, 'hiện trạng cuối hồi phải đứng thành khối riêng, không trộn vào hồ sơ').not.toBeNull();
  expect(anh.textContent).toContain('Còn sống.');
  expect(anh.textContent).not.toContain('Hai mươi bảy tuổi.');

  fireEvent.keyDown(window, { key: 'Escape' });
  expect(document.querySelector('.tgNvPanel')).toBeNull();
  expect(document.activeElement, 'đóng panel phải trả tiêu điểm về thẻ vừa mở').toBe(the);
});

test('lọc theo hạng chỉ để lại đúng hạng đó, kèm số đếm trên nút', async () => {
  NHAN_VAT = { characters: NGUOI, snapshots: null };
  render(<NhanVat tacPham="b" />);

  await waitFor(() => expect(document.querySelectorAll('.tgLocNut').length).toBe(3));
  const nut = Array.from(document.querySelectorAll<HTMLButtonElement>('.tgLocNut'));
  expect(nut.map((n) => n.textContent)).toEqual(['Tất cả3', 'Chủ chốt2', 'Phụ1']);
  fireEvent.click(nut[2]!);
  const ten = Array.from(document.querySelectorAll('.tgNvThe .tgNvTen .ten')).map((e) => e.textContent);
  expect(ten).toEqual(['A Lực']);
});

test('quan hệ của một người lấy từ hồ sơ thế giới, mới nhất trước, chỉ hiện người kia', async () => {
  NHAN_VAT = { characters: NGUOI, snapshots: null };
  THE_GIOI = {
    rules: null,
    foreshadow: null,
    relations: [
      { character_a: 'Lâm Kỳ', character_b: 'A Lực', relation: 'Hộ vệ.', chapter: 3 },
      { character_a: 'Hạ Văn Tình', character_b: 'Lâm Kỳ', relation: 'Đồng minh.', chapter: 9 },
      { character_a: 'A Lực', character_b: 'Hạ Văn Tình', relation: 'Theo cô.', chapter: 5 },
    ],
  };
  render(<NhanVat tacPham="b" />);

  await waitFor(() => expect(document.querySelector('.tgQuanHeAll')).not.toBeNull());
  fireEvent.click(document.querySelector<HTMLButtonElement>('.tgNvThe')!);
  const dong = Array.from(document.querySelectorAll('.tgNvPanel .tgQH > li .tgQHDau .ten')).map(
    (e) => e.textContent,
  );
  expect(dong).toEqual(['Hạ Văn Tình', 'A Lực']);
});

/* ── Dàn ý ──────────────────────────────────────────────────────────────── */

const TAP = [
  {
    index: 1,
    title: 'Cánh Cửa Trong Kho Lạnh',
    theme: 'Từ đầu cơ sống sót.',
    final: false,
    arcs: [
      {
        index: 1,
        title: 'Khe hàng đầu tiên',
        goal: 'Phát hiện năng lực.',
        estimated_chapters: 12,
        chapters: [
          { chapter: 1, title: 'Kho lạnh nợ máu', core_event: 'Bị ép giao kho.', hook: 'Bàn tay dính máu.', scenes: ['Cảnh 1'] },
          { chapter: 2, title: 'Thỏi vàng dính bùn', core_event: 'Bán thử vàng.', hook: 'Tin nhắn lạ.', scenes: [] },
        ],
      },
    ],
  },
];

test('TẬP mở sẵn còn CUNG đóng khi chưa biết đang viết ở đâu, và số chương nằm trên dòng tóm', async () => {
  DAN_Y = { premise: '', volumes: TAP, flat: null };
  // Không có trục sản xuất và chưa chương nào xong: không tập nào "đang viết", nên tập
  // đầu tiên chưa xong được mở, còn hồi của nó vẫn đóng.
  render(<DanY snapshot={snap({ book: { ...snap({}).book, completed_chapters: 0 } })} tacPham="b" />);

  await waitFor(() => expect(document.querySelector('.ntap')).not.toBeNull());

  const tap = document.querySelector<HTMLDetailsElement>('.ntap .capGap')!;
  const cung = document.querySelector<HTMLDetailsElement>('.ncung .capGap')!;
  expect(tap.open, 'đóng cả tập thì dòng tập không nói gì hơn con số ở đầu khu').toBe(true);
  expect(cung.open, 'mở sẵn mọi hồi là bung hàng trăm chương ra').toBe(false);

  // Số chương phải nằm trên DÒNG TÓM: hồi đóng thì đó là thứ duy nhất nói nó chạy tới đâu.
  expect(cung.querySelector('summary')?.textContent).toMatch(/2\s*chương/);
});

const C = (title: string) => ({ chapter: 0, title, core_event: 'Việc.', hook: '', scenes: null });

const BA_TAP = [
  { index: 1, title: 'Tập 1: Cửa', theme: '', final: false, arcs: [{ index: 1, title: 'H1', goal: '', chapters: [C('a'), C('b')] }] },
  {
    index: 2,
    title: 'Ngân hàng',
    theme: '',
    final: false,
    arcs: [
      { index: 1, title: 'H1', goal: '', chapters: [C('c'), C('d')] },
      { index: 2, title: 'H2', goal: '', chapters: [C('e'), C('f')] },
    ],
  },
  { index: 3, title: 'Khung', theme: '', final: true, arcs: [{ index: 1, title: 'H1', goal: '', estimated_chapters: 9, chapters: null }] },
];

test('chỉ TẬP và HỒI đang viết mở sẵn; chương được đánh số dồn khi server gửi 0', async () => {
  DAN_Y = { premise: '', volumes: BA_TAP, flat: null };
  const s = snap({
    timeline: {
      volumes: [
        { index: 1, state: 'done', chapters: 2 },
        { index: 2, state: 'running', chapters: 4 },
        { index: 3, state: 'unplanned', chapters: 9, estimated: true },
      ],
      arcs: null,
      chapters: [
        ...[1, 2, 3, 4].map((n) => ({ chapter: n, state: 'done' as const })),
        { chapter: 5, state: 'running' as const },
        { chapter: 6, state: 'pending' as const },
      ],
    },
  });
  render(<DanY snapshot={s} tacPham="b" />);

  await waitFor(() => expect(document.querySelectorAll('.ntap').length).toBe(3));
  const tap = Array.from(document.querySelectorAll('.cayDanY > .ntap'));
  const mo = (el: Element) => el.querySelector<HTMLDetailsElement>(':scope > .capGap')?.open;
  expect(tap.map(mo), 'chỉ tập đang viết mở; tập đã xong và tập sau đều đóng').toEqual([
    false,
    true,
    false,
  ]);
  const cung = Array.from(tap[1]!.querySelectorAll<HTMLDetailsElement>('.ncung > .capGap'));
  expect(cung.map((d) => d.open), 'hồi đã xong đóng, hồi đang viết mở').toEqual([false, true]);

  // "0" ở đầu mọi dòng là lỗi đã thấy trên dữ liệu thật: số phải là vị trí đếm dồn.
  const so = Array.from(document.querySelectorAll('.cayChuong .nhanhdau > .ma')).map((e) => e.textContent);
  expect(so).toEqual(['1', '2', '3', '4', '5', '6']);
  expect(document.querySelectorAll('.cayChuong > li[data-tt="running"]')).toHaveLength(1);

  // Tiền tố "Tập 1:" trong tên bị bỏ: số tập đã đứng riêng ở đầu dòng.
  expect(tap[0]!.querySelector('.ten')?.textContent).toBe('Cửa');
  // Tiến độ tập đang viết: chương 3–4 xong, chương 5 đang viết, chương 6 chưa viết.
  expect(tap[1]!.querySelector('.tgTienDoChu')?.textContent).toBe('2/4 chương');
});

test('nút "Mở mọi tập" mở rồi đóng cả cây', async () => {
  DAN_Y = { premise: '', volumes: BA_TAP, flat: null };
  render(<DanY snapshot={snap({})} tacPham="b" />);

  await waitFor(() => expect(document.querySelector('.tgCayDau .nutPhu')).not.toBeNull());
  const nut = document.querySelector<HTMLButtonElement>('.tgCayDau .nutPhu')!;
  expect(nut.textContent).toBe('Mở mọi tập');
  fireEvent.click(nut);
  const mo = () =>
    Array.from(document.querySelectorAll<HTMLDetailsElement>('.ntap > .capGap')).map((d) => d.open);
  expect(mo()).toEqual([true, true, true]);
  expect(nut.textContent).toBe('Đóng mọi tập');
  fireEvent.click(nut);
  expect(mo()).toEqual([false, false, false]);
});

test('TIỀN ĐỀ đóng sẵn, và dòng tóm nói ra nó có bao nhiêu mục', async () => {
  DAN_Y = {
    premise: '## Thể loại\nMạt thế.\n\n## Xung đột\nMở khe hàng.',
    volumes: TAP,
    flat: null,
  };
  render(<DanY snapshot={snap({})} tacPham="b" />);

  await waitFor(() => expect(document.querySelector('.hopGap')).not.toBeNull());

  const hop = document.querySelector<HTMLDetailsElement>('.hopGap')!;
  expect(
    hop.open,
    'tiền đề mở sẵn chiếm hai màn đầu, đẩy cây dàn ý — thứ mang tên cho cả khu — xuống đáy cuộn',
  ).toBe(false);
  // Đóng KHÔNG phải giấu: dòng tóm phải nói trong đó có gì.
  expect(hop.querySelector('summary')?.textContent).toContain('Ý tưởng gốc');
  expect(hop.querySelector('summary')?.textContent).toContain('2 mục');
  // …và cho xem trước mục đầu tiên, để biết có đáng mở hay không.
  expect(hop.querySelector('.tgXemTruoc')?.textContent).toBe('Thể loạiMạt thế.');
});

// Không có gì để bung thì KHÔNG vẽ nút gập: một mũi tên bấm vào chẳng mở ra gì là lời hứa suông.
test('tập chưa mở cung thì không có nút gập', async () => {
  DAN_Y = {
    premise: '',
    volumes: [{ index: 1, title: 'Tập chưa mở', theme: '', final: false, arcs: null }],
    flat: null,
  };
  render(<DanY snapshot={snap({})} tacPham="b" />);

  await waitFor(() => expect(document.querySelector('.ntap')).not.toBeNull());
  expect(document.querySelector('.ntap .capGap')).toBeNull();
  expect(document.querySelector('.ntap .nhanhdau')?.tagName).toBe('DIV');
});
