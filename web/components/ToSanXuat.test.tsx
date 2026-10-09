import { cleanup, render, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';

import { CHU_VH } from '@/lib/chu/van-hanh';
import { CHU } from '@/lib/nhan';

import { snap } from './mau.test-helper';
import { ToSanXuat } from './ToSanXuat';

afterEach(cleanup);

function the(container: HTMLElement, ten: string): HTMLElement {
  const h = [...container.querySelectorAll('.vhVai')].find(
    (e) => e.querySelector('h2')?.textContent === ten,
  );
  if (!h) throw new Error(`không thấy thẻ ${ten}`);
  return h as HTMLElement;
}

test('mỗi vai một thẻ, kể cả vai chưa làm việc', () => {
  const { container } = render(<ToSanXuat snapshot={snap({})} />);
  expect(container.querySelectorAll('.vhVai')).toHaveLength(5);
  expect(within(the(container, 'Biên tập viên')).getByText(CHU_VH.chuaLam)).toBeDefined();
});

test('thẻ mang số chương, quyết định, lỗi và model', () => {
  const { container } = render(
    <ToSanXuat
      snapshot={snap({
        chapters: [
          { chapter: 1, stage: 'done', owner: ['writer'] },
          { chapter: 2, stage: 'done', owner: ['writer', 'editor'] },
        ],
        decisions: [
          { id: 'a', at: '', kind: 'worker_failure', decider: 'arbiter', error: 'hỏng' },
          { id: 'b', at: '', kind: 'volume_end', decider: 'architect', model: 'm-ghi' },
        ],
        transport: { state: 'idle', cost_usd: 0, agent: 'writer', model: 'cx/gpt-5.6-luna' },
      })}
    />,
  );
  const viet = the(container, 'Người viết');
  expect(viet.querySelector('.vhVaiSo')?.textContent).toContain('2');
  expect(within(viet).getByText('cx/gpt-5.6-luna')).toBeDefined();
  expect(within(viet).getByText(CHU_VH.modelGanNhat)).toBeDefined();

  const dp = the(container, 'Điều phối');
  expect(dp.querySelector('[data-loi]')?.textContent).toContain('1');

  expect(within(the(container, 'Kiến trúc sư')).getByText('m-ghi')).toBeDefined();
});

test('chưa chương nào có owner thì số chương là "không đo được", không phải 0', () => {
  const { container } = render(
    <ToSanXuat snapshot={snap({ chapters: [{ chapter: 1, stage: 'done' }] })} />,
  );
  const dd = the(container, 'Người viết').querySelector('.vhVaiSo dd');
  expect(dd?.textContent).toBe(CHU.khongCo);
});

test('vai đang chạy mang nhãn đang làm', () => {
  const { container } = render(
    <ToSanXuat snapshot={snap({ transport: { state: 'running', cost_usd: 0, agent: 'editor' } })} />,
  );
  expect(the(container, 'Biên tập viên').dataset.lam).toBe('dang');
});
