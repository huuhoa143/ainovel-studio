import { cleanup, render, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

import { snap } from './mau.test-helper';

/**
 * Tiền đề là MARKDOWN, và bề mặt phải bóc được cấu trúc của nó.
 *
 * # Ca thật, đo được trên tác phẩm đang chạy
 *
 * `premise.md` không phải văn xuôi — nó là một bản đặc tả có tiêu đề và có gạch đầu dòng.
 * Bản trước tách đoạn theo dòng TRỐNG rồi nối mọi xuống dòng đơn thành dấu cách, nên:
 *
 *	## Thể loại và tông điệu          ← tiêu đề
 *	Mạt thế zombie, đô thị thương…    ← thân, cách đúng MỘT xuống dòng
 *
 * bị dán làm một câu và ký tự `##` ở lại giữa đoạn văn. **15/15 đoạn** của bề mặt này bắt đầu
 * bằng `#` hoặc `##` — tức toàn bộ cấu trúc biến mất và người vận hành nhận một khối chữ có
 * rác markdown rải đều. Cùng lỗi ở cấp thấp hơn với gạch đầu dòng: cả chùm thành một câu chạy
 * dài có dấu `-` nằm giữa.
 *
 * Bốn bài dưới canh bốn ca mà một lượt "dọn dẹp" phép bóc rất dễ làm hỏng, và không ca nào
 * thay ca nào được.
 */

let PREMISE = '';

vi.mock('@/lib/api', async (goc) => ({
  ...(await goc<typeof import('@/lib/api')>()),
  layDanY: () => Promise.resolve({ premise: PREMISE, volumes: null, flat: null }),
}));

const { DanY } = await import('./DanY');

const SNAP = snap({});

function ve() {
  render(<DanY snapshot={SNAP} tacPham="b" />);
}

beforeEach(() => {
  cleanup();
  PREMISE = '';
});

test('tiêu đề markdown thành NHÃN, không thành rác giữa câu', async () => {
  PREMISE = [
    '# Ông Trùm Hai Cõi',
    '',
    '## Thể loại và tông điệu',
    'Mạt thế zombie, đô thị thương chiến.',
    '',
    '## Xung đột cốt lõi',
    'Lâm Kỳ mở được khe hàng giữa hai thế giới.',
  ].join('\n');
  ve();

  await waitFor(() => expect(document.querySelector('.kvtiende')).not.toBeNull());

  const nhan = Array.from(document.querySelectorAll('.kvtiende dt')).map((e) => e.textContent);
  expect(nhan).toEqual(['Thể loại và tông điệu', 'Xung đột cốt lõi']);

  // Không một ký tự `#` nào còn sót trong phần chữ.
  const than = document.querySelector('.khuhoso')!.textContent!;
  expect(than, 'rác markdown còn nằm giữa văn').not.toMatch(/#/);

  // Tiêu đề KHÔNG có thân là tên bản đặc tả — nó đứng riêng, không thành một hàng nhãn rỗng.
  expect(document.querySelector('.tiendeTen')?.textContent).toBe('Ông Trùm Hai Cõi');
  expect(nhan).not.toContain('Ông Trùm Hai Cõi');
});

test('gạch đầu dòng thành DANH SÁCH, không thành câu chạy dài', async () => {
  PREMISE = [
    '## Điểm bán khác biệt',
    '- Chênh lệch giá hai thế giới là hệ thống lên cấp chính.',
    '- Hậu cung không chỉ là tình cảm; mỗi mỹ nhân nắm một năng lực.',
    '- Zombie tiến hóa theo áp lực giao dịch.',
  ].join('\n');
  ve();

  await waitFor(() => expect(document.querySelector('.tiendeGach')).not.toBeNull());

  const muc = Array.from(document.querySelectorAll('.tiendeGach li')).map((e) => e.textContent);
  expect(muc).toHaveLength(3);
  expect(muc[0]).toBe('Chênh lệch giá hai thế giới là hệ thống lên cấp chính.');
  // Dấu gạch của markdown phải BIẾN MẤT khỏi chữ — nó giờ là hình dạng của danh sách.
  expect(muc.join(' '), 'dấu `-` còn nằm trong chữ, tức chưa bóc thành mục').not.toMatch(/ - /);
});

test('dòng gói tiếp của một gạch đầu dòng thuộc về CHÍNH mục đó', async () => {
  // `premise.md` được ngắt ở cột 80, nên một mục dài luôn tràn sang dòng sau. Coi dòng ấy là
  // một đoạn mới sẽ xé mục làm đôi — và nửa sau mất luôn dấu hiệu nó thuộc về mục nào.
  PREMISE = [
    '## Điểm bán',
    '- Chênh lệch giá hai thế giới là hệ thống lên cấp chính: muối, pin,',
    'kháng sinh, vàng, dữ liệu, đất hiếm.',
    '- Mục thứ hai.',
  ].join('\n');
  ve();

  await waitFor(() => expect(document.querySelector('.tiendeGach')).not.toBeNull());

  const muc = Array.from(document.querySelectorAll('.tiendeGach li')).map((e) => e.textContent);
  expect(muc).toHaveLength(2);
  expect(muc[0]).toBe(
    'Chênh lệch giá hai thế giới là hệ thống lên cấp chính: muối, pin, kháng sinh, vàng, dữ liệu, đất hiếm.',
  );
});

test('tiền đề viết bằng văn xuôi thuần vẫn vẽ như đoạn văn', async () => {
  // Đường lui, và nó phải còn: ép một bản KHÔNG có nhãn vào lưới nhãn là bịa ra cấu trúc
  // không có trong nguồn. Xuống dòng đơn vẫn được nối — đó là định dạng của TỆP, không phải
  // của văn.
  PREMISE = 'Một thành phố ba lần một năm mở cửa:\nmột lần gọi người sống.\n\nĐoạn hai.';
  ve();

  await waitFor(() => expect(document.querySelector('.tiende')).not.toBeNull());

  expect(document.querySelector('.kvtiende'), 'bịa ra lưới nhãn cho một bản không có nhãn').toBeNull();
  const doan = Array.from(document.querySelectorAll('.tiende')).map((e) => e.textContent);
  expect(doan).toEqual([
    'Một thành phố ba lần một năm mở cửa: một lần gọi người sống.',
    'Đoạn hai.',
  ]);
});

test('tiền đề rỗng nói ra là rỗng, không vẽ lưới trống', async () => {
  PREMISE = '   \n\n  ';
  ve();
  // Soi trong khối Tiền đề, không soi cả màn: hai khối dưới cũng nói "chưa" (tập chưa mở,
  // chưa có dàn ý), nên một truy vấn phẳng khớp nhiều phần tử và ngã trước khi kiểm được
  // điều đang cần kiểm.
  await waitFor(() => expect(document.querySelector('.khuhoso .sect')).not.toBeNull());
  const khoi = document.querySelector('.khuhoso .sect')!;
  expect(khoi.querySelector('h2')?.textContent).toBe('Ý tưởng gốc');
  expect(khoi.querySelector('.trongSect')?.textContent).toMatch(/chưa/i);
  expect(khoi.querySelector('.kvtiende')).toBeNull();
  expect(khoi.querySelector('.tiende')).toBeNull();
});
