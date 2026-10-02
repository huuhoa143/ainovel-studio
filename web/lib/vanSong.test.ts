import { expect, test } from 'vitest';

import {
  BO_DEM_RONG,
  CO_TOI_DA,
  SO_LUOT_GIU,
  moLuot,
  nhanVach,
  themChu,
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
  bd = themChu(bd, '✻ Viết nháp\n' + 'Mai mở cửa tiệm lúc sáu giờ. '.repeat(80));
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
