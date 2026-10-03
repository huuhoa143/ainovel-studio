import { expect, test } from 'vitest';

import type { TienDo } from './types';
import { trangThaiCua } from './nghiemThu';

test('advance null (engine đóng) thì KHÔNG có cửa nào chờ', () => {
  // `null` = engine đóng nên không đo được. Vẽ một cửa nghiệm thu lúc đó là mời người dùng
  // bấm một nút chắc chắn trả 409.
  expect(trangThaiCua(null, '')).toEqual({ dangCho: false, cheDoDuyet: false });
});

test('chế độ auto thì không bao giờ chờ, kể cả hold bật', () => {
  const a: TienDo = { mode: 'auto', hold: true };
  expect(trangThaiCua(a, '').dangCho).toBe(false);
});

test('chế độ review + hold thì cửa đang chờ, kèm chương và lý do', () => {
  const a: TienDo = {
    mode: 'review', hold: true, permit_chapter: 8, hold_reason: 'nhịp tụt ở đoạn giữa',
  };
  const t = trangThaiCua(a, '');
  expect(t.dangCho).toBe(true);
  expect(t.cheDoDuyet).toBe(true);
  expect(t.chuong).toBe(8);
  expect(t.lyDo).toBe('nhịp tụt ở đoạn giữa');
});

test('chế độ review mà chưa tới biên thì chưa chờ', () => {
  expect(trangThaiCua({ mode: 'review', hold: false }, '').dangCho).toBe(false);
  expect(trangThaiCua({ mode: 'review', hold: false }, '').cheDoDuyet).toBe(true);
});

test('hold bật mà KHÔNG có lý do vẫn là đang chờ — lý do là tùy, cửa thì không', () => {
  // Engine có thể dừng ở biên mà Editor chưa kịp kết luận. Đòi lý do mới vẽ cửa sẽ giấu mất
  // một dây chuyền đang đứng im.
  expect(trangThaiCua({ mode: 'review', hold: true }, '').dangCho).toBe(true);
});

/* ── Cửa chặn ở luồng THƯỜNG: review + engine đã dừng ────────────────────────
 *
 * ĐO ĐƯỢC bằng E2E trên cuốn `mac-the-bien-di-vo`: bật `review`, engine viết xong chương 4
 * rồi DỪNG, và Host báo `RuntimeState: "paused"` · `AdvanceMode: "review"` ·
 * `AdvancePermitChapter: 0` · `HasAdvanceHold: FALSE`.
 *
 * Tức `hold` KHÔNG phải tín hiệu của cửa nghiệm thu theo chương. `AdvanceHold` là một lần tạm
 * dừng DO CAN THIỆP KÝ (internal/host/engine.go:672). Chế độ review chặn bằng cách để engine
 * dừng khi chưa có giấy phép cho chương kế tiếp.
 *
 * Với hợp đồng cũ, dải nghiệm thu KHÔNG BAO GIỜ hiện ở luồng thường — chỉ ở ca can thiệp, là
 * ca hiếm hơn nhiều. Đây là lỗi trong spec, không phải trong mã. */

test('review + engine ĐÃ DỪNG = cửa đang chờ, dù hold FALSE', () => {
  expect(
    trangThaiCua({ mode: 'review', hold: false }, 'paused').dangCho,
  ).toBe(true);
});

test('review + engine ĐANG VIẾT = chưa chờ ai', () => {
  expect(
    trangThaiCua({ mode: 'review', hold: false }, 'running').dangCho,
  ).toBe(false);
});

test('auto + engine đã dừng = KHÔNG phải cửa nghiệm thu', () => {
  // Máy nghỉ ở chế độ tự chạy là chuyện khác hẳn: không ai phải duyệt gì, chỉ cần bấm Chạy.
  expect(trangThaiCua({ mode: 'auto', hold: false }, 'paused').dangCho).toBe(false);
});

test('review + đã xong cả truyện = không còn cửa nào để duyệt', () => {
  expect(trangThaiCua({ mode: 'review', hold: false }, 'completed').dangCho).toBe(false);
});

test('hold vẫn là tín hiệu ĐỘC LẬP — ca can thiệp ký tạm dừng lúc engine đang chạy', () => {
  expect(trangThaiCua({ mode: 'review', hold: true }, 'running').dangCho).toBe(true);
});

test('runtime rỗng hoặc không biết thì KHÔNG tự suy là đã dừng', () => {
  // `runtime: ''` là ca engine đóng. Suy nó thành "đã dừng" sẽ vẽ cửa cho một engine không có,
  // tức đúng lớp lỗi null-đọc-thành-phép-đo mà cả hợp đồng /studio giữ.
  expect(trangThaiCua({ mode: 'review', hold: false }, '').dangCho).toBe(false);
  expect(trangThaiCua(null, 'paused').dangCho).toBe(false);
});

test('chế độ từng chương: bạn tự dừng hay engine tự dừng KHÔNG phải cửa duyệt', () => {
  const adv = { mode: 'review', hold: false } as const;
  expect(trangThaiCua(adv, 'paused', { kind: 'gate' }).dangCho).toBe(true);
  expect(trangThaiCua(adv, 'paused', { kind: 'user' }).dangCho).toBe(false);
  expect(trangThaiCua(adv, 'paused', { kind: 'stuck' }).dangCho).toBe(false);
  expect(trangThaiCua(adv, 'paused', { kind: 'budget' }).dangCho).toBe(false);
  // Chưa dừng lần nào trong phiên: giữ phép suy cũ.
  expect(trangThaiCua(adv, 'paused').dangCho).toBe(true);
  // Hold do can thiệp ký: là cửa bất kể lý do dừng.
  expect(trangThaiCua({ ...adv, hold: true }, 'running', { kind: 'user' }).dangCho).toBe(true);
});
