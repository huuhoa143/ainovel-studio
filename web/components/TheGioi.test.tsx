import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

/**
 * Luật thế giới và Phục bút — hai bề mặt đọc cùng một tệp `/world`.
 *
 * Ca đo trên tác phẩm thật: 701 phục bút. Đổ hết ra một lúc là hàng trăm màn hình, nên bề
 * mặt này đứng trên ba lớp: đếm-kiêm-lọc theo trạng thái, ô tìm không cần dấu, và hiện từng
 * khúc. Các bài dưới khoá cả ba, cùng với luật quan trọng nhất của bề mặt: lọc không bao giờ
 * làm MẤT mục — số đếm trên nút luôn khớp với số mục lọc ra được.
 */

let THE_GIOI: { rules: unknown; foreshadow: unknown; relations: unknown } = {
  rules: null,
  foreshadow: null,
  relations: null,
};

vi.mock('@/lib/api', async (goc) => ({
  ...(await goc<typeof import('@/lib/api')>()),
  layTheGioi: () => Promise.resolve(THE_GIOI),
}));

const { LuatTheGioi, PhucBut } = await import('./TheGioi');

beforeEach(() => {
  cleanup();
  THE_GIOI = { rules: null, foreshadow: null, relations: null };
});

function phucBut(n: number, status: string, tu = 1) {
  return Array.from({ length: n }, (_, i) => ({
    id: `${status}_${i}`,
    description: `Mô tả ${status} số ${i}`,
    planted_at: tu + i,
    status,
    ...(status === 'resolved' ? { resolved_at: tu + i + 2 } : {}),
  }));
}

test('phục bút: đếm theo trạng thái ở đầu, nợ chưa trả xếp trước, hiện từng khúc 40', async () => {
  THE_GIOI = {
    rules: null,
    relations: null,
    foreshadow: [...phucBut(30, 'advanced'), ...phucBut(5, 'resolved'), ...phucBut(20, 'planted', 100)],
  };
  render(<PhucBut tacPham="b" />);

  await waitFor(() => expect(document.querySelector('.tgPbDs')).not.toBeNull());
  const nut = Array.from(document.querySelectorAll<HTMLButtonElement>('.tgLocNut'));
  expect(nut.map((n) => n.querySelector('.tgLocDem')?.textContent)).toEqual(['55', '20', '30', '5']);
  expect(nut[0]!.getAttribute('aria-pressed')).toBe('true');

  const dong = () => Array.from(document.querySelectorAll<HTMLLIElement>('.tgPbDs > li'));
  expect(dong(), 'đổ hết ra một lúc là thứ làm màn này ngợp').toHaveLength(40);
  expect(dong()[0]!.dataset.tt, 'món nợ chưa trả phải đứng đầu').toBe('planted');

  fireEvent.click(document.querySelector<HTMLButtonElement>('.tgHienThem .nutPhu')!);
  expect(dong()).toHaveLength(55);
  expect(document.querySelector('.tgHienThem')).toBeNull();
});

test('phục bút: bấm ô đếm là lọc, bấm lại là bỏ lọc; ô tìm không cần gõ dấu', async () => {
  THE_GIOI = {
    rules: null,
    relations: null,
    foreshadow: [
      ...phucBut(3, 'advanced'),
      { id: 'cua_xam', description: 'Cửa xám trong kho lạnh.', planted_at: 1, status: 'planted' },
      { id: 'vang_bun', description: 'Thỏi vàng dính bùn.', planted_at: 2, status: 'resolved', resolved_at: 3 },
    ],
  };
  render(<PhucBut tacPham="b" />);

  await waitFor(() => expect(document.querySelector('.tgPbDs')).not.toBeNull());
  const daThu = document.querySelector<HTMLButtonElement>('.tgLocNut[data-tt="resolved"]')!;
  fireEvent.click(daThu);
  const dong = () => Array.from(document.querySelectorAll('.tgPbDs > li'));
  expect(dong()).toHaveLength(1);
  // Hai mốc trong một span: "ch. 2 → 3".
  expect(dong()[0]!.querySelector('.moc')?.textContent).toBe('ch. 2 → 3');
  fireEvent.click(daThu);
  expect(dong()).toHaveLength(5);

  fireEvent.change(document.querySelector('.tgTimO input')!, { target: { value: 'cua xam' } });
  expect(dong().map((l) => l.querySelector('.ma')?.textContent)).toEqual(['cua_xam']);

  fireEvent.change(document.querySelector('.tgTimO input')!, { target: { value: 'không có' } });
  expect(dong()).toHaveLength(0);
  expect(document.querySelector('.tgPbRong')?.textContent).toMatch(/Không có mục nào khớp/);
});

test('luật thế giới: mỗi nhóm một thẻ, tên nhóm tự do giữ nguyên văn, giới hạn có nhãn riêng', async () => {
  THE_GIOI = {
    foreshadow: null,
    relations: null,
    rules: [
      { category: 'Cửa xuyên giới', rule: 'Chỉ mở ở kho lạnh.', boundary: 'Không mở tùy ý.' },
      { category: 'magic', rule: 'Lõi tinh thể.', boundary: '' },
      { category: 'magic', rule: 'Lõi vỡ.', boundary: 'Không hồi lại.' },
    ],
  };
  render(<LuatTheGioi tacPham="b" />);

  await waitFor(() => expect(document.querySelectorAll('.tgLuatThe').length).toBe(2));
  const the = Array.from(document.querySelectorAll('.tgLuatThe'));
  // Nhóm đã biết đứng trước, nhóm lạ sau và giữ nguyên chữ.
  expect(the.map((t) => t.querySelector('h2')?.firstChild?.textContent)).toEqual([
    'Phép thuật',
    'Cửa xuyên giới',
  ]);
  expect(the[0]!.querySelectorAll('.dsLuat > li')).toHaveLength(2);
  const ranh = the[1]!.querySelector('.ranh')!;
  expect(ranh.textContent).toContain('Giới hạn');
  expect(ranh.textContent).toContain('Không mở tùy ý.');
});
