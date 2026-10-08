import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { GIAI_THICH } from '@/lib/nhan';

import { OCanThiep } from './OCanThiep';

vi.mock('@/lib/api', async (goc) => ({
  ...(await goc<typeof import('@/lib/api')>()),
  canThiep: vi.fn(),
}));

function ve() {
  return render(<OCanThiep tacPham="b" dangChay onDoi={() => {}} />);
}

/**
 * Câu giải thích của ô can thiệp — thứ ĐO ĐƯỢC là nó có chiếm chỗ hay không.
 *
 * Khối này cao 43px trong một ô can thiệp 98px, và ô can thiệp ăn thẳng vào bốn ô của bàn
 * ngay trên nó. Người dùng nói nguyên văn: *"phần này chiếm quá nhiều diện tích làm 4
 * session ở trên bé quá"*.
 */

test('câu giải thích không chiếm chỗ, nhưng vẫn còn cho trình đọc màn hình', () => {
  const { container } = ve();
  const cau = container.querySelector('#vi-sao-can-thiep')!;

  // Còn trong DOM: `aria-describedby` của ô nhập trỏ vào đúng id này, và một `describedby`
  // trỏ vào phần tử không tồn tại là ô nhập mất mô tả.
  expect(cau).not.toBeNull();
  expect(cau.textContent).toContain(GIAI_THICH.canThiepArbiterXuLy);
  // Nhưng KHÔNG chiếm pixel nào.
  expect(cau.hasAttribute('hidden')).toBe(true);

  // Và chuột vẫn tra được qua chú giải của ô nhập.
  expect(screen.getByRole('textbox').getAttribute('title')).toBe(
    GIAI_THICH.canThiepArbiterXuLy,
  );
});
