import { expect, test } from 'vitest';

import { nhanVai } from '@/lib/nhan';
import type { StreamEvent } from '@/lib/types';

import { cauLoi, giaiGiaoViec, giaiLoi, gopSuKien, phatHienKet, sapSuKien } from './loiLlm';

/** Nguyên văn đo được trên truyện thật dong-ho-qua-lac, kể cả chỗ bị cắt "c...". */
const HET_TUYEN =
  'Thử lại (4/7): routing_exhausted: All models exhausted: 388 routes checked (229 no usable key c...';
const HET_TUYEN_DU =
  'Thử lại (4/7, sau 8s): routing_exhausted: All models exhausted: 388 routes checked (229 no usable key configured, 159 model lacks tool-calling). Add more API keys or wait for rate limits to reset.';

test('nhanVai hiểu biến thể của engine: architect_short, writer_first_chapter, coordinator', () => {
  expect(nhanVai('architect_short')).toBe('Kiến trúc sư');
  expect(nhanVai('architect_long')).toBe('Kiến trúc sư');
  expect(nhanVai('writer_first_chapter')).toBe('Người viết');
  expect(nhanVai('writer_feedback')).toBe('Người viết');
  expect(nhanVai('coordinator')).toBe('Điều phối');
  expect(nhanVai('editor')).toBe('Biên tập viên');
  // Mã lạ vẫn hiện nguyên văn — đoán bừa là tệ hơn.
  expect(nhanVai('novel_context')).toBe('novel_context');
});

test('lỗi hết tuyến bị cắt vẫn dịch được, kèm số lần thử và việc nên làm', () => {
  const l = giaiLoi(HET_TUYEN, { ncc: 'lingoreup', vai: 'architect_short' })!;
  expect(l.ma).toBe('het-tuyen');
  expect(l.thuLai).toEqual({ lan: 4, tong: 7 });
  expect(cauLoi(l)).toBe(
    'lingoreup không còn model nào nhận yêu cầu (thiếu khóa hoặc model không gọi được công cụ) (đang thử lại 4/7). Thử chọn model khác cho Kiến trúc sư ở Model & khóa API.',
  );
  expect(l.tho).toBe(HET_TUYEN);
});

test('bản đầy đủ nói ra từng nhóm lý do', () => {
  const l = giaiLoi(HET_TUYEN_DU, { ncc: 'lingoreup' })!;
  expect(l.cau).toBe(
    'lingoreup không còn model nào dùng được cho bước này: 159 model không gọi được công cụ, 229 model chưa có khóa',
  );
});

test('có tuyến bị loại vì yêu cầu quá dài + 429: chỉ đường tới model ngữ cảnh lớn', () => {
  const l = giaiLoi(
    'writer thất bại: routing_exhausted: All models exhausted: 388 routes checked (124 no usable key configured, 118 prompt too large for the model, 146 model lacks tool-calling). Add more API keys or wait for rate limits to reset. Soonest reset ~47s. [rate_limit, HTTP 429, openai]',
    { ncc: 'lingo2', vai: 'writer' },
  )!;
  expect(cauLoi(l)).toBe(
    'lingo2 không còn model nào dùng được cho bước này: 118 model không chứa nổi độ dài yêu cầu, 146 model không gọi được công cụ, 124 model chưa có khóa, số còn lại đang bị giới hạn lượt (429). Chọn riêng cho Người viết một model ngữ cảnh lớn, gọi được công cụ ở Model & khóa API — hoặc chờ vài phút cho hết giới hạn lượt.',
  );
});

test('mã HTTP và lỗi mạng thường gặp đều có câu tiếng Việt', () => {
  expect(giaiLoi('401 Unauthorized: invalid api key')!.ma).toBe('khoa-sai');
  expect(giaiLoi('HTTP 403 Forbidden')!.ma).toBe('cam');
  expect(giaiLoi('429 Too Many Requests')!.ma).toBe('gioi-han');
  expect(giaiLoi('context deadline exceeded')!.ma).toBe('qua-lau');
  expect(giaiLoi('502 Bad Gateway')!.ma).toBe('may-chu');
  expect(giaiLoi('dial tcp: connection refused')!.ma).toBe('mang');
  expect(giaiLoi("Model 'x' is not in the catalog")!.ma).toBe('khong-model');
});

test('chữ không phải lỗi thì để nguyên (trả undefined)', () => {
  expect(giaiLoi('draft_chapter(chương 2)')).toBeUndefined();
  expect(giaiLoi(undefined)).toBeUndefined();
});

test('dòng giao việc nội bộ thành câu', () => {
  expect(giaiGiaoViec('engine → architect_short (Hãy xây dựng một truyện ngắn g...)')).toBe(
    'Điều phối giao việc cho Kiến trúc sư',
  );
  expect(giaiGiaoViec('architect_short (Hãy xây dựng một truyện ngắn g...)')).toBe(
    'Giao việc cho Kiến trúc sư',
  );
  expect(giaiGiaoViec('viết chương 2')).toBeUndefined();
});

function ev(seq: number, time: string, summary: string, agent = 'architect_short'): StreamEvent {
  return { seq, time, kind: 'event', category: 'SYSTEM', agent, summary };
}

test('Diễn biến xếp theo GIỜ, không theo seq — sự kiện phát lại không chen sai chỗ', () => {
  const ds = [
    ev(5, '2026-10-02T09:07:00+07:00', 'architect_short (Hãy…)'),
    ev(4, '2026-10-02T09:10:00+07:00', HET_TUYEN),
    ev(3, '2026-10-02T09:09:00+07:00', HET_TUYEN),
  ];
  expect(sapSuKien(ds).map((e) => e.seq)).toEqual([4, 3, 5]);
});

test('các lần thử lại liền nhau của cùng một lỗi gộp thành một dòng có đếm', () => {
  const ds = [1, 2, 3, 4].map((n) =>
    ev(n, `2026-10-02T09:0${n}:00+07:00`, `Thử lại (${n}/7): routing_exhausted: All models exhausted`),
  );
  ds.push(ev(9, '2026-10-02T09:00:00+07:00', 'architect_short (Hãy…)', 'arbiter'));
  const g = gopSuKien(ds, { ncc: 'lingoreup' });
  expect(g).toHaveLength(2);
  expect(g[0]!.so).toBe(4);
  expect(g[0]!.loi?.ma).toBe('het-tuyen');
  expect(g[1]!.so).toBe(1);
});

test('kẹt: hai vòng thử lại liên tiếp cùng một lỗi', () => {
  const ds: StreamEvent[] = [];
  let seq = 0;
  let phut = 0;
  for (const vong of [1, 2]) {
    for (let n = 1; n <= 7; n++) {
      ds.push(
        ev(++seq, new Date(Date.UTC(2026, 9, 2, 2, phut++, vong)).toISOString(), `Thử lại (${n}/7): routing_exhausted`),
      );
    }
  }
  // Ngưỡng thời gian rất lớn để chắc là luật "hai vòng" bắt được, không phải luật thời gian.
  const k = phatHienKet(ds, { ncc: 'lingoreup', nguongMs: 10 ** 9 });
  expect(k?.loi.ma).toBe('het-tuyen');
  expect(k?.vai).toBe('architect_short');
});

test('không kẹt: một vòng ngắn, hoặc đã có sự kiện thường mới hơn', () => {
  const vong = [1, 2, 3].map((n) =>
    ev(n, `2026-10-02T09:00:0${n}+07:00`, `Thử lại (${n}/7): routing_exhausted`),
  );
  expect(phatHienKet(vong)).toBeUndefined();
  const hetKet = [...vong, ev(9, '2026-10-02T09:05:00+07:00', 'draft_chapter(chương 1)', 'writer')];
  expect(phatHienKet(hetKet, { nguongMs: 1 })).toBeUndefined();
});

test('kẹt: một vòng kéo dài quá ngưỡng thời gian', () => {
  const ds = [
    ev(1, '2026-10-02T09:00:00+07:00', 'Thử lại (1/7): routing_exhausted'),
    ev(2, '2026-10-02T09:02:00+07:00', 'Thử lại (2/7): routing_exhausted'),
  ];
  expect(phatHienKet(ds, { nguongMs: 90_000 })?.loi.ma).toBe('het-tuyen');
});
