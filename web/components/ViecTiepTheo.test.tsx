import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import { CHU } from '@/lib/nhan';
import type { CongDoanSong } from '@/lib/useStudio';

import { ViecTiepTheo } from './ViecTiepTheo';
import { snap } from './mau.test-helper';

/**
 * Hợp đồng của dải việc tiếp theo, canh ở RANH GIỚI CỦA CHÍNH NÓ.
 *
 * # Vì sao tệp này ra đời ở Task 13
 *
 * Luật đổi dải (Task 12) làm khối `DangLam` bên trong component này KHÔNG TỚI ĐƯỢC từ buồng
 * lái: `DangLam` chỉ vẽ khi `dangChay`, mà `BuongLai` chỉ vẽ dải này khi máy NGHỈ. Cụm C
 * đã ghi lại chuyện đó và để lại một câu hỏi: giữ `DangLam` như mã chết, hay bỏ nó?
 *
 * Quyết định: GIỮ, và bịt bằng bài kiểm ở đây thay vì bằng một lời hứa trong chú thích. Ba
 * lý do, theo thứ tự sức nặng:
 *
 *   1. `dangChay` điều khiển HAI thứ trong component này — câu trạng thái (`trangThai()` có
 *      hai nhánh riêng cho ca đang chạy) và khối `DangLam`. Bỏ riêng `DangLam` để lại một
 *      component phản ứng nửa vời với chính cờ của nó: nó vẫn đổi câu sang "Máy đang viết"
 *      rồi im lặng về việc đang viết cái gì. Muốn bỏ cho sạch thì phải bỏ cả nhánh `dangChay`,
 *      tức đổi component thành "dải lúc máy nghỉ" — một component khác, và bài kiểm hiện có
 *      của `BuongLai` ("dải được cho biết máy đang NGHỈ") mất luôn thứ nó canh.
 *   2. "Không tới được" là tính chất của NGƯỜI GỌI hôm nay, không phải của component. Xóa nó
 *      là nướng luật đổi dải của `BuongLai` vào một component mà `BuongLai` chỉ tình cờ là
 *      người gọi duy nhất.
 *   3. Mã chết đắt vì không ai đo được nó — đó đúng là điều tệp này sửa. Sau đây nhánh
 *      `dangChay` có phép đo; nó chỉ không có người gọi.
 *
 * Cái KHÔNG đổi được, và nói thẳng ra: `song` đi từ `useStudio` xuyên `BuongLai` xuống đây
 * vẫn không quan sát được TỪ `BuongLai`. Cụm C đã thử và kết luận đúng — một giá trị không
 * có đường ra màn hình thì không bài kiểm nào ở tầng đó phân biệt nổi. Bài kiểm dưới đây
 * canh nó ở tầng có đường ra.
 */
function ve(dangChay: boolean, song?: CongDoanSong) {
  return render(
    <ViecTiepTheo
      snapshot={snap({
        chapters: [{ chapter: 1, stage: 'done' }],
      })}
      dangChay={dangChay}
      song={song}
      onChonKhu={() => {}}
      onDocChuong={() => {}}
    />,
  );
}

test('máy nghỉ: nói tiến độ và chỉ đường xuống thanh dưới, KHÔNG có dòng đang làm gì', () => {
  const { container } = ve(false);

  expect(screen.getByText(CHU.ttNghi(1, 3))).toBeDefined();
  expect(container.querySelector('.vttLive')).toBeNull();
});

test('máy chạy: dòng đang làm gì nói vai và bước từ `song`', () => {
  // Đây là nhánh mà luật đổi dải của `BuongLai` không đi vào được. Phép đo của nó sống ở đây.
  const { container } = ve(true, {
    vai: 'writer',
    buoc: 'draft_chapter',
    dangChay: true,
    luc: '2026-08-01T23:11:00Z',
    loi: false,
  });

  expect(container.querySelector('.vttLive')).not.toBeNull();
  expect(screen.getByText('draft_chapter')).toBeDefined();
  // Tên vai đi qua từ điển như mọi chỗ khác trên trang, nên nó ra `Người viết` chứ không `writer`.
  expect(screen.getByText('Người viết')).toBeDefined();
});

test('máy chạy mà `song` vắng: dòng đang làm gì im, không bịa vai hay bước', () => {
  // `song` là công đoạn suy từ dòng SSE, và nó vắng cho tới mẩu sự kiện đầu tiên. Vẽ một
  // dòng "đang làm gì" rỗng ở đó là khẳng định có một bước đang chạy mà chưa ai báo.
  const { container } = ve(true);
  expect(container.querySelector('.vttLive')).toBeNull();
});
