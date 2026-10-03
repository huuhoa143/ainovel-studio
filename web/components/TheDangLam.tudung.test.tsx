import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';

import { LOI_LLM } from '@/lib/chu/tien-do';
import { GIAI_THICH } from '@/lib/nhan';
import type { Snapshot } from '@/lib/types';

import { TheDangLam } from './TheDangLam';
import { ViecTiepTheo } from './ViecTiepTheo';
import { snap } from './mau.test-helper';

/**
 * Engine tự dừng vì cổng model hết tuyến: thẻ phải nói "Đã tự dừng" và lỗi gốc, không phải
 * "Tạm dừng · Bấm Viết tiếp". Ca đo trên truyện thật, chương 726.
 */
afterEach(cleanup);

const LOI =
  'routing_exhausted: All models exhausted: 388 routes checked (124 no usable key configured, 118 prompt too large for the model, 146 model lacks tool-calling). [rate_limit, HTTP 429, openai]';
const LY_DO = 'Nhiệm vụ viết chương 726 đã bị lặp lại 3 lần mà không tiến triển';

const ve = (p: Partial<Snapshot>) => {
  const s = snap({ runtime: 'paused', advance: { mode: 'auto', hold: false }, ...p });
  return render(
    <>
      <TheDangLam snapshot={s} song={undefined} dangChay={false} truc={null} onChonKhu={() => {}} />
      <ViecTiepTheo snapshot={s} dangChay={false} song={undefined} onChonKhu={() => {}} onDocChuong={() => {}} />
    </>,
  );
};

test('tự dừng vì lỗi model: nói lỗi gốc, lời Điều phối, đường gỡ — không mời bấm Viết tiếp', () => {
  ve({ stop: { at: '2026-10-02T16:35:37+07:00', kind: 'stuck', reason: LY_DO, last_error: LOI, last_error_agent: 'writer' } });
  const txt = document.body.textContent ?? '';
  expect(txt).toContain(LOI_LLM.daTuDung);
  expect(txt).toMatch(/118 model không chứa nổi độ dài yêu cầu/);
  expect(txt).toMatch(/Chọn riêng cho Người viết một model ngữ cảnh lớn/);
  expect(txt).toContain(LOI_LLM.tuDungLyDo(LY_DO));
  expect(screen.getByRole('button', { name: LOI_LLM.moCauHinh })).toBeDefined();
  expect(txt).toContain(LOI_LLM.tuDungGoiY);
  expect(txt).not.toContain(GIAI_THICH.chayTiepOThanhDuoi);
});

test('bạn tự bấm dừng: vẫn là "Tạm dừng" thường, không có khối lỗi', () => {
  ve({ stop: { at: '2026-10-02T16:35:37+07:00', kind: 'user', reason: 'Người dùng tạm dừng' } });
  const txt = document.body.textContent ?? '';
  expect(txt).not.toContain(LOI_LLM.daTuDung);
  expect(txt).toContain(GIAI_THICH.chayTiepOThanhDuoi);
  expect(screen.queryByRole('button', { name: LOI_LLM.moCauHinh })).toBeNull();
});

test('đang chạy lại: lần dừng cũ không còn được nhắc', () => {
  const s = snap({
    runtime: 'running',
    advance: { mode: 'auto', hold: false },
    stop: { at: '2026-10-02T16:35:37+07:00', kind: 'stuck', reason: LY_DO, last_error: LOI },
  });
  render(<TheDangLam snapshot={s} song={undefined} dangChay truc={null} />);
  expect(document.body.textContent).not.toContain(LOI_LLM.daTuDung);
});
