import { cleanup, render, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

/**
 * Văn phong: hai nguồn (bạn đặt / Biên tập viên rút ra) thành hai thẻ riêng.
 *
 * Ca thật: `preferences` là markdown thô của người dùng, mở đầu bằng `## [startup_prompt]`.
 * Bản trước in nguyên chuỗi đó, nên `##` và ngoặc vuông nằm giữa văn — cùng lỗi đã sửa ở
 * tiền đề của Dàn ý.
 */

let DOC: unknown = null;

vi.mock('@/lib/api', async (goc) => ({
  ...(await goc<typeof import('@/lib/api')>()),
  layVanPhong: () => Promise.resolve(DOC),
}));

const { VanPhong } = await import('./VanPhong');

beforeEach(() => {
  cleanup();
});

test('hai nguồn là hai thẻ; cụm từ cấm là chip; "Nên dùng" không còn rác markdown', async () => {
  DOC = {
    warnings: null,
    user_rules: {
      status: 'ready',
      genre: 'Mạt thế',
      forbidden_phrases: ['đáng chú ý là', 'cảm xúc lẫn lộn'],
      forbidden_chars: null,
      fatigue_words: { 'chớp mắt': 3 },
      preferences: '## [startup_prompt]\n\nTruyện xoay quanh hai thế giới.',
      declared_by: ['system_defaults'],
      uncertain: null,
    },
    arc_style: {
      volume: 13,
      arc: 3,
      prose: ['Miêu tả bằng nhiệt và mùi.'],
      dialogue: [{ name: 'Lâm Kỳ', rules: ['Nói thực dụng.'] }],
      taboos: ['Không truy nguyên người ẩn danh.'],
      updated_at: '',
    },
  };
  render(<VanPhong tacPham="b" />);

  await waitFor(() => expect(document.querySelectorAll('.tgVpThe').length).toBe(2));
  expect(Array.from(document.querySelectorAll('.vpthe li')).map((l) => l.textContent)).toEqual([
    'đáng chú ý là',
    'cảm xúc lẫn lộn',
  ]);
  const van = document.querySelector('.vpvan')!;
  expect(van.textContent).not.toMatch(/#|\[/);
  expect(van.querySelector('.tgNhanPhu')?.textContent).toBe('startup prompt');
  expect(van.querySelector('p')?.textContent).toBe('Truyện xoay quanh hai thế giới.');
  expect(document.querySelector('.vpgiong h4')?.textContent).toBe('LKLâm Kỳ');
});
