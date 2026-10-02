import { expect, test } from 'vitest';

import { giaiCongCu } from './congCu';
import { giaiDong, giaiGiaoViec, giaiLoi, gopSuKien } from './loiLlm';
import { trangThaiDong } from './nhan';
import { cauChuaCoNhanXet, denLuotBienTap } from './nhanXetDinhKy';
import { congDoanTu } from './useStudio';
import type { StreamEvent } from './types';
import { snap } from '@/components/mau.test-helper';

/* Các dòng đo được trên truyện thật dong-ho-qua-lac (Diễn biến và thanh dưới). */

test('tên công cụ thô của engine đọc thành việc tiếng Việt', () => {
  const ca: [string, string][] = [
    ['audit_foundation', 'Soát nền truyện'],
    ['novel_context', 'Đọc tài liệu truyện'],
    ['novel_context(chương 3)', 'Đọc tài liệu cho chương 3'],
    ['save_foundation[world_rules]', 'Lưu luật thế giới'],
    ['save_foundation[characters]', 'Lưu nhân vật'],
    ['save_foundation[outline]', 'Lưu dàn ý'],
    ['save_foundation[premise]', 'Lưu tiền đề'],
    ['plan_chapter(chương 2)', 'Lên kế hoạch chương 2'],
    ['draft_chapter(chương 2)', 'Viết nháp chương 2'],
    ['check_consistency(chương 2)', 'Soát nhất quán chương 2'],
    ['commit_chapter(chương 2)', 'Chốt chương 2'],
    ['read_chapter(chương 3·bản nháp)', 'Đọc lại bản nháp chương 3'],
    ['save_review', 'Lưu nhận xét'],
  ];
  for (const [tho, ra] of ca) expect(giaiCongCu(tho), tho).toBe(ra);
  // Tên lạ: không đoán.
  expect(giaiCongCu('lam_gi_do_moi')).toBeUndefined();
});

test('"writer → novel_context" là Người viết dùng công cụ, KHÔNG phải giao việc cho một hàm', () => {
  expect(giaiGiaoViec('writer → novel_context')).toBe('Người viết: đọc tài liệu truyện');
  expect(giaiGiaoViec('writer → novel_context')).not.toMatch(/giao việc/);
  // Giao việc thật giữa hai vai vẫn đọc như cũ.
  expect(giaiGiaoViec('engine → architect_short (Hãy xây dựng…)')).toBe(
    'Điều phối giao việc cho Kiến trúc sư',
  );
  expect(giaiDong('novel_context(chương 3)')).toBe('Đọc tài liệu cho chương 3');
});

test('lỗi 502 của Cloudflare đọc thành "tạm thời lỗi 502"', () => {
  const tho =
    'Thử lại (1/7, sau 1s): {"type":"https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-502/","title":"Error 502: Bad gateway"}';
  const l = giaiLoi(tho, { ncc: 'lingo2' });
  expect(l?.ma).toBe('may-chu');
  expect(l?.cau).toBe('lingo2 tạm thời lỗi 502');
});

const ev = (seq: number, time: string, category: string, summary: string, agent = 'writer'): StreamEvent => ({
  seq,
  time,
  kind: 'ui',
  category,
  summary,
  agent,
});

test('lỗi đã qua (sau đó máy còn làm được việc) được đánh dấu daQua', () => {
  const ds = [
    ev(1, '2026-10-02T11:41:48+07:00', 'SYSTEM', 'Thử lại (1/7, sau 1s): Error 502: Bad gateway'),
    ev(2, '2026-10-02T11:41:55+07:00', 'TOOL', 'draft_chapter(chương 3)'),
  ];
  const dong = gopSuKien(ds, { ncc: 'lingo2' });
  const loi = dong.find((d) => d.loi);
  expect(loi?.daQua).toBe(true);
  // Lỗi mới nhất, chưa có gì sau nó: chưa qua.
  const conDo = gopSuKien([ds[0]!], { ncc: 'lingo2' }).find((d) => d.loi);
  expect(conDo?.daQua).toBe(false);
});

test('sự kiện giao việc ĐÃ XONG không thành "việc đang làm"; giao việc mới mang vai bên nhận', () => {
  const xong = {
    seq: 5,
    time: '2026-10-02T11:37:51+07:00',
    kind: 'ui',
    category: 'DISPATCH',
    agent: 'architect_short',
    summary: 'architect_short (Hãy xây dựng một truyện ngắn g...)',
    payload: { ID: 'd1', FinishedAt: '2026-10-02T11:37:51+07:00' },
  };
  expect(congDoanTu(xong)).toBeUndefined();
  const batDau = {
    seq: 6,
    time: '2026-10-02T11:37:51+07:00',
    kind: 'ui',
    category: 'DISPATCH',
    agent: 'engine',
    summary: 'writer (Viết chương 1)',
    payload: { ID: 'd2', FinishedAt: '0001-01-01T00:00:00Z' },
  };
  const cd = congDoanTu(batDau);
  expect(cd?.vai).toBe('writer');
  expect(cd?.dangChay).toBe(true);
});

test('chương xong chỉ "đã duyệt" khi có nhận xét thật', () => {
  expect(trangThaiDong({ stage: 'done' }).nhan).toBe('đã xong');
  expect(trangThaiDong({ stage: 'done', reviewed: true }).nhan).toBe('đã duyệt');
  expect(trangThaiDong({ stage: 'drafting' }).nhan).toBe('đang viết');
});

test('lượt chấm định kỳ: mỗi 5 chương ở truyện thường', () => {
  const s = (n: number, phase = 'writing') =>
    snap({ book: { ...snap({}).book, completed_chapters: n, phase } });
  expect(denLuotBienTap(s(2))).toBe(false);
  expect(denLuotBienTap(s(5))).toBe(true);
  expect(cauChuaCoNhanXet(s(3, 'complete'))).toMatch(/kết thúc trước lượt chấm đầu tiên/);
  expect(cauChuaCoNhanXet(s(7))).toMatch(/cứ 5 chương một lần/);
});
