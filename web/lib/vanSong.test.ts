import { expect, test } from 'vitest';

import {
  BO_DEM_RONG,
  CO_TOI_DA,
  DAU_NGHI,
  DO_DAI_LUOT_VAN,
  SO_LUOT_GIU,
  catDau,
  loaiLuot,
  moLuot,
  nhanVach,
  tachCongCu,
  tachNghi,
  themChu,
  vanThuan,
  type BoDemVan,
} from './vanSong';

test('mẩu đầu tiên tạo lượt mở, không có nhãn vạch', () => {
  const bd = themChu(BO_DEM_RONG, 'nàng ');
  expect(bd.luot).toHaveLength(1);
  expect(bd.luot[0]!.chu).toBe('nàng ');
  expect(bd.luot[0]!.nhan).toBeUndefined();
});

test('mẩu kế tiếp nối vào lượt hiện tại, không mở lượt mới', () => {
  const bd = themChu(themChu(BO_DEM_RONG, 'nàng '), 'quay đầu lại');
  expect(bd.luot).toHaveLength(1);
  expect(bd.luot[0]!.chu).toBe('nàng quay đầu lại');
});

test('bộ đệm cũ không bị sửa tại chỗ', () => {
  const truoc = themChu(BO_DEM_RONG, 'a');
  themChu(truoc, 'b');
  expect(truoc.luot[0]!.chu).toBe('a');
});

test('lệnh xóa mở lượt mới, chữ lượt trước KHÔNG mất', () => {
  let bd = themChu(BO_DEM_RONG, 'lượt một');
  bd = moLuot(bd, '— chương 2 · 23:11 —');
  bd = themChu(bd, 'lượt hai');

  expect(bd.luot).toHaveLength(2);
  expect(bd.luot[0]!.chu).toBe('lượt một');
  expect(bd.luot[1]!.chu).toBe('lượt hai');
  expect(bd.luot[1]!.nhan).toBe('— chương 2 · 23:11 —');
});

test('mỗi lượt có id riêng, không dùng lại', () => {
  let bd = themChu(BO_DEM_RONG, 'a');
  bd = moLuot(bd, 'v1');
  bd = moLuot(bd, 'v2');
  const id = bd.luot.map((l) => l.id);
  expect(new Set(id).size).toBe(id.length);
});

test('hai lệnh xóa liền nhau không để lại lượt rỗng', () => {
  // Engine phát sentinel hai lần liên tiếp là ca hợp lệ (lượt bị hủy trước khi phát chữ).
  // Một lượt rỗng vẽ ra là một vạch ngăn không ngăn gì cả.
  let bd = themChu(BO_DEM_RONG, 'a');
  bd = moLuot(bd, 'v1');
  bd = moLuot(bd, 'v2');
  expect(bd.luot).toHaveLength(2);
  expect(bd.luot[1]!.nhan).toBe('v2');
});

function boDemNhieuLuot(soLuot: number, chuMoiLuot: string): BoDemVan {
  let bd = BO_DEM_RONG;
  for (let i = 0; i < soLuot; i += 1) {
    bd = moLuot(bd, `v${i}`);
    bd = themChu(bd, chuMoiLuot);
  }
  return bd;
}

test('quá SO_LUOT_GIU lượt thì bỏ lượt CŨ NHẤT', () => {
  const bd = boDemNhieuLuot(SO_LUOT_GIU + 2, 'x');
  expect(bd.luot).toHaveLength(SO_LUOT_GIU);
  // Hai lượt đầu (v0, v1) phải là hai lượt bị bỏ.
  expect(bd.luot.map((l) => l.nhan)).toEqual(['v2', 'v3', 'v4']);
});

test('quá trần byte thì bỏ từ lượt cũ nhất cho tới khi dưới trần', () => {
  const nua = 'x'.repeat(Math.floor(CO_TOI_DA * 0.6));
  let bd = BO_DEM_RONG;
  bd = moLuot(bd, 'v0');
  bd = themChu(bd, nua);
  bd = moLuot(bd, 'v1');
  bd = themChu(bd, nua);

  // Hai lượt = 120% trần, mà số lượt vẫn dưới SO_LUOT_GIU → chỉ trần byte mới cắt được.
  expect(bd.luot).toHaveLength(1);
  expect(bd.luot[0]!.nhan).toBe('v1');
});

test('MỘT lượt vượt trần thì không xóa sạch — cắt từ ĐẦU lượt đó', () => {
  // Ca này là lý do trần byte không được viết thành vòng "bỏ tới khi vừa". Bỏ lượt cuối cùng
  // là để lại một khu trống trong lúc engine đang phát chữ.
  const qua = 'y'.repeat(CO_TOI_DA + 5000);
  const bd = themChu(BO_DEM_RONG, qua);

  expect(bd.luot).toHaveLength(1);
  expect(bd.luot[0]!.chu.length).toBeLessThanOrEqual(CO_TOI_DA);
  // Giữ phần CUỐI: đó là phần đang chảy, tức phần người dùng đang đọc.
  expect(bd.luot[0]!.chu.endsWith('y')).toBe(true);
  expect(bd.luot[0]!.chu.length).toBeGreaterThan(0);
});

test('mẩu rỗng không mở lượt ma, và không nuốt vạch ngăn kế tiếp', () => {
  // Đường thật đã chặn mẩu rỗng một lần ở `useStudio`, nhưng chặn ở đây là chặn tại chỗ hàm
  // này chịu trách nhiệm. Bỏ chặn thì mẩu rỗng mở một lượt TRỐNG, rồi `moLuot` kế tiếp gắn
  // nhãn vào đúng lượt trống đó (nhánh lượt-rỗng) thay vì mở lượt mới — vạch ngăn đầu tiên
  // của phiên xem bị dời lên trên một lượt chưa có chữ nào. Đột biến bỏ chặn LỌT qua cả bộ
  // kiểm trước khi có bài này.
  expect(themChu(BO_DEM_RONG, '').luot).toHaveLength(0);
  // Trả về đúng tham chiếu cũ: nhịp delta là 2ms, một tham chiếu mới cho một thay đổi rỗng
  // là một lần render thừa mỗi 2ms.
  expect(themChu(BO_DEM_RONG, '')).toBe(BO_DEM_RONG);

  let bd = themChu(BO_DEM_RONG, 'lượt một');
  bd = themChu(bd, '');
  bd = moLuot(bd, 'v1');
  expect(bd.luot).toHaveLength(2);
  expect(bd.luot[1]!.nhan).toBe('v1');
});

test('cắt một lượt quá trần phải bỏ phần ĐẦU, giữ phần CUỐI', () => {
  // Bài ngay trên KHÔNG canh được HƯỚNG cắt, và chuyện đó đã đo chứ không phải suy đoán:
  // chuỗi của nó toàn một ký tự 'y', nên `slice(0, CO_TOI_DA)` (cắt nhầm phần cuối) vẫn cho
  // một kết quả `endsWith('y')` và bài đó vẫn XANH. Phép thử đột biến của Task 4 bắt được
  // đúng chỗ này. Chuỗi ở đây có đầu và cuối phân biệt được nên hướng cắt thành đo được.
  const dau = 'PHAN-DAU-PHAI-BI-BO';
  const duoi = 'PHAN-CUOI-DANG-CHAY';
  const bd = themChu(BO_DEM_RONG, dau + 'y'.repeat(CO_TOI_DA) + duoi);

  expect(bd.luot[0]!.chu).toHaveLength(CO_TOI_DA);
  // Phần cuối là phần model vừa phát, tức phần mắt người dùng đang bám.
  expect(bd.luot[0]!.chu.endsWith(duoi)).toBe(true);
  expect(bd.luot[0]!.chu.startsWith(dau)).toBe(false);
});

test('id vẫn tăng sau khi bỏ lượt — không cấp lại id đã dùng', () => {
  const bd = boDemNhieuLuot(SO_LUOT_GIU + 3, 'x');
  expect(bd.idKe).toBeGreaterThan(SO_LUOT_GIU + 3);
});

test('nhãn vạch nói chương nào và lúc mấy giờ', () => {
  const t = new Date('2026-08-01T23:11:04');
  expect(nhanVach(2, t)).toBe('chương 2 · 23:11');
});

test('không biết chương thì nhãn chỉ có giờ, không bịa số chương', () => {
  const t = new Date('2026-08-01T09:05:00');
  expect(nhanVach(undefined, t)).toBe('09:05');
});

test('lượt văn dài gần nhất KHÔNG bị các lượt công cụ ngắn tới sau đẩy ra', () => {
  let bd = BO_DEM_RONG;
  // Văn của `draft_chapter` tới TRẦN, không tiêu đề — đúng như engine phát (stream_extract.go).
  bd = themChu(bd, 'Mai mở cửa tiệm lúc sáu giờ. '.repeat(80));
  for (const t of ['✻ check_consistency\nchapter: 1', '✻ commit_chapter\ntitle: Chương 1', '✻ plan_chapter\nchapter: 2']) {
    bd = moLuot(bd, 'vạch');
    bd = themChu(bd, t);
  }
  expect(bd.luot).toHaveLength(SO_LUOT_GIU + 1);
  expect(bd.luot[0]!.chu).toContain('Mai mở cửa tiệm');
  // Thêm lượt ngắn nữa: vẫn giữ đúng một lượt văn, không phình.
  bd = themChu(moLuot(bd, 'vạch'), '✻ novel_context');
  expect(bd.luot).toHaveLength(SO_LUOT_GIU + 1);
  expect(bd.luot[0]!.chu).toContain('Mai mở cửa tiệm');
});

test('tham số công cụ DÀI không được giữ như văn — ca đo được: kế hoạch chương đè chương vừa viết', () => {
  let bd = BO_DEM_RONG;
  bd = themChu(bd, 'An nhặt chiếc ví dưới gốc me. '.repeat(80));
  const keHoach = '✻ Lên kế hoạch chương\n' + '  characters:\n    - Bé An\n  event: An trả ví\n'.repeat(60);
  expect(keHoach.length).toBeGreaterThan(DO_DAI_LUOT_VAN);
  for (const t of [keHoach, '✻ Soát nhất quán\nchapter: 1', '✻ Chốt chương\ntitle: 1', '✻ Đọc tài liệu truyện']) {
    bd = themChu(moLuot(bd, 'vạch'), t);
  }
  expect(bd.luot[0]!.chu).toContain('An nhặt chiếc ví');
});

test('loaiLuot đọc dấu engine đặt, không đoán theo hình', () => {
  expect(loaiLuot('✻ Lên kế hoạch chương\n  characters:\n    - Bé An')).toBe('congCu');
  expect(loaiLuot('{"chapter": 1}')).toBe('congCu');
  expect(loaiLuot('An nhặt chiếc ví: nó còn ấm.')).toBe('van');
  expect(tachCongCu('✻ Chốt chương\ntitle: Chiếc ví')).toEqual({ tieuDe: 'Chốt chương', than: 'title: Chiếc ví' });
});

/* ── suy nghĩ của model không được giả làm văn ──────────────────────────── */

test('tách lượt theo dấu suy nghĩ: đoạn lẻ là model tự nhủ', () => {
  expect(tachNghi('văn' + DAU_NGHI + 'nghĩ' + DAU_NGHI + 'văn nữa')).toEqual([
    { nghi: false, chu: 'văn' },
    { nghi: true, chu: 'nghĩ' },
    { nghi: false, chu: 'văn nữa' },
  ]);
  // Hai dấu liền nhau là ca hợp lệ — không đẻ ra một khối trống.
  expect(tachNghi(DAU_NGHI + DAU_NGHI + 'chỉ văn')).toEqual([{ nghi: false, chu: 'chỉ văn' }]);
  expect(tachNghi('')).toEqual([]);
});

test('lượt công cụ mở đầu bằng suy nghĩ vẫn được nhận ra là công cụ', () => {
  // Trước khi web đọc dấu này, ký tự đầu của lượt là \x02 chứ không phải ✻, nên phép thử
  // thô coi cả lượt tham số là VĂN và vẽ nó bằng serif khổ đọc.
  const l = DAU_NGHI + 'I should plan first.' + DAU_NGHI + '✻ Lên kế hoạch chương\nevent: mở';
  expect(loaiLuot(l)).toBe('congCu');
  expect(tachCongCu(l).tieuDe).toBe('Lên kế hoạch chương');
});

test('suy nghĩ không tính vào độ dài quyết định giữ một lượt văn', () => {
  const nghiDai = DAU_NGHI + 'x'.repeat(DO_DAI_LUOT_VAN + 500) + DAU_NGHI + 'văn ngắn';
  expect(vanThuan(nghiDai)).toBe('văn ngắn');
  // Bộ đệm chỉ giữ 3 lượt; lượt toàn-suy-nghĩ này không được chiếm chỗ của bản nháp thật.
  let bd = BO_DEM_RONG;
  bd = themChu(moLuot(bd), 'văn thật '.repeat(400));
  for (const n of ['a', 'b', 'c']) bd = themChu(moLuot(bd, n), nghiDai);
  expect(bd.luot.some((l) => vanThuan(l.chu).startsWith('văn thật'))).toBe(true);
});

test('cắt đầu giữ nguyên vai của đoạn — không biến văn thành suy nghĩ', () => {
  const s = 'bỏ đi' + DAU_NGHI + 'đang nghĩ' + DAU_NGHI + 'văn giữ lại';
  const giu = catDau(s, 'nghĩ'.length + DAU_NGHI.length + 'văn giữ lại'.length);
  expect(giu.startsWith(DAU_NGHI)).toBe(true);
  expect(vanThuan(giu)).toBe('văn giữ lại');
  expect(catDau('ngắn', 99)).toBe('ngắn');
});
