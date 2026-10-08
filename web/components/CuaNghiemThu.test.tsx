import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import { CHU, GIAI_THICH, kyTheoTone } from '@/lib/nhan';

import { CuaNghiemThu } from './CuaNghiemThu';

/** Cửa ĐANG chờ, ca đầy đủ nhất: có chương, có kết luận Editor. */
function cho(p: Partial<Parameters<typeof CuaNghiemThu>[0]> = {}) {
  return render(
    <CuaNghiemThu
      soChuongXong={7}
      advance={{
        mode: 'review',
        hold: true,
        permit_chapter: 8,
        hold_reason: 'nhịp tụt ở đoạn giữa; ba cảnh liên tiếp cùng một nhịp',
      }}
      runtime="" tacPham="b"
      onDoi={() => {}}
      {...p}
    />,
  );
}

test('cửa KHÔNG chờ thì không vẽ gì — cả ba ca không-chờ', () => {
  // Một dải amber rỗng nằm trên đầu buồng lái suốt phiên là một cảnh báo giả thường trực:
  // người vận hành học cách bỏ qua nó, và lần nó nói thật thì họ cũng bỏ qua.
  //
  // Ba ca vào cùng một bài vì chúng là MỘT luật ("chỉ review + hold mới có cửa") và tách ra
  // thì mỗi bài chỉ canh được một phần ba của nó. Ca `null` đứng đầu: engine đóng thì mọi nút
  // ở đây chắc chắn trả 409.
  const { container, rerender } = render(
    <CuaNghiemThu soChuongXong={7} advance={null} runtime="" tacPham="b" onDoi={() => {}} />,
  );
  expect(container.querySelector('.cuanghiemthu')).toBeNull();

  rerender(
    <CuaNghiemThu
      soChuongXong={7}
      advance={{ mode: 'auto', hold: true }}
      runtime="" tacPham="b"
      onDoi={() => {}}
    />,
  );
  expect(container.querySelector('.cuanghiemthu')).toBeNull();

  rerender(
    <CuaNghiemThu
      soChuongXong={7}
      advance={{ mode: 'review', hold: false }}
      runtime="" tacPham="b"
      onDoi={() => {}}
    />,
  );
  expect(container.querySelector('.cuanghiemthu')).toBeNull();
});

test('cửa đang chờ: thấy số chương, thấy NGUYÊN VĂN kết luận Editor, thấy hai nút', () => {
  const { container } = cho();

  expect(container.querySelector('.cuanghiemthu')).not.toBeNull();
  expect(container.textContent).toContain('8');
  // Nguyên văn, không cắt và không làm dịu: câu của Editor biết rõ hơn giao diện chuyện gì
  // đã xảy ra, và người vận hành quyết định dựa trên chính câu đó.
  expect(container.textContent).toContain(
    'nhịp tụt ở đoạn giữa; ba cảnh liên tiếp cùng một nhịp',
  );
  expect(screen.getAllByRole('button')).toHaveLength(2);
});

test('nhãn nút trả về mang ĐÚNG số chương, không phải một câu chung chung', () => {
  // Người bấm phải thấy mình đang trả cuốn nào về đâu. "Trả chương về viết lại" không nói
  // chương nào, và ở một dải nằm trên đầu MỌI bề mặt thì chương đang chờ có thể không phải
  // chương người dùng vừa đọc.
  cho();
  expect(screen.getByRole('button', { name: CHU.traChuongVeVietLai(8) })).toBeDefined();
  expect(screen.getByRole('button', { name: /^Duyệt(, viết chương| dàn ý)/ })).toBeDefined();
});

test('không có kết luận Editor thì vẫn đủ hai nút, và nói rõ là CHƯA có — không bịa', () => {
  // Engine dừng ở biên trước, Editor kết luận sau. Khoảng giữa hai việc đó là một dây chuyền
  // đang đứng im, nên cửa phải hiện; nhưng chỗ của kết luận không được lấp bằng một câu do
  // giao diện nghĩ ra.
  const { container } = cho({
    advance: { mode: 'review', hold: true, permit_chapter: 8 },
  });

  expect(screen.getAllByRole('button')).toHaveLength(2);
  expect(container.textContent).toContain(GIAI_THICH.nghiemThuChuaCoKetLuan);
  expect(container.querySelector('.cntlydo')!.textContent).not.toContain(CHU.ketLuanEditor);
});

test('chưa cấp phép chương nào thì nhãn nút vẫn đọc được, không có "undefined"', () => {
  // `TienDo.PermitChapter` khai `omitempty` (internal/serve/model.go:243), nên số 0 — "chưa
  // cấp phép chương nào", đúng ca mà chế độ nghiệm thu tồn tại để tạo ra — RỤNG khỏi JSON và
  // tới đây thành vắng mặt. Một nhãn dựng bằng chuỗi thẳng sẽ in "Trả chương undefined về
  // viết lại" ở đúng ca thường gặp nhất.
  const { container } = cho({ advance: { mode: 'review', hold: true } });

  expect(container.querySelector('.cuanghiemthu')).not.toBeNull();
  expect(container.textContent).not.toContain('undefined');
  expect(screen.getAllByRole('button')).toHaveLength(2);
  // Và không rơi về câu chung "chương này": vắng `permit_chapter` thì chương chờ duyệt là
  // chương VỪA viết xong (fixture: 7 chương đã xong).
  expect(screen.getByRole('button', { name: CHU.traChuongVeVietLai(7) })).toBeDefined();
});

test('chưa có tác phẩm đang mở thì khóa nút', () => {
  // Không bài nào của tôi lúc đầu chạm tới chốt `!!tacPham` — bỏ nó vẫn xanh 7/7 (đã thử đột
  // biến). Hệ quả không phải giả thuyết: `KiemDinh` hôm nay KHÔNG nhận `tacPham`
  // (`app/page.tsx`), nên người gắn dải vào bề mặt đó ở Task 5 rất dễ để trống, và lúc đó hai
  // nút bấm được sẽ gọi `POST /api/books/undefined/advance`.
  cho({ tacPham: undefined });

  for (const n of screen.getAllByRole('button')) {
    expect((n as HTMLButtonElement).disabled).toBe(true);
  }
});

test('dải mang TÊN VÙNG và một ký hiệu hình học, không chỉ có màu', () => {
  // Hai kênh thứ hai của cùng một dải, và cả hai đều không có bài nào giữ lúc đầu (đã thử đột
  // biến: bỏ `aria-label`, bỏ ký hiệu — cả hai đều xanh 7/7).
  //
  // Ký hiệu: dải này là violet ("chờ duyệt" của hệ giao diện 2), và sau Task 7 màu sẽ là thứ đập vào mắt trước. Ảnh đen trắng
  // và người mù màu chỉ còn ký hiệu — luật của `PRODUCT.md`, khuôn ở `TrangThai.tsx`.
  // Tên vùng: đây là component DUY NHẤT vẽ ở hai bề mặt, nên tên vùng cũng là thứ duy nhất
  // nói cho trình đọc màn hình biết hai chỗ đó là một việc.
  const { container } = cho();
  const dai = container.querySelector('.cuanghiemthu')!;

  expect(dai.getAttribute('aria-label')).toBe(CHU.cuaNghiemThuVung);
  expect(dai.querySelector('.ky')!.textContent).toBe(kyTheoTone('violet'));
});

test('cửa sau bước dựng nền (chưa có chương nào) nói về DÀN Ý, không về "chương này"', () => {
  // Đo được trên truyện thật: chế độ duyệt dừng ngay sau khi Kiến trúc sư dựng nền, và dải cũ
  // ghi "Biên tập viên chưa chấm chương này" cùng nút "Yêu cầu viết lại chương này" — trong
  // khi chưa có chương nào để chấm hay viết lại.
  cho({
    soChuongXong: 0,
    advance: { mode: 'review', hold: false },
    runtime: 'paused',
  });
  expect(screen.getByText(CHU.dangChoDuyetNen)).toBeDefined();
  expect(screen.getByText(GIAI_THICH.nghiemThuNenTruyen)).toBeDefined();
  expect(screen.getByRole('button', { name: CHU.choVietChuongDau })).toBeDefined();
  expect(screen.getByRole('button', { name: CHU.gopYChoDanY })).toBeDefined();
  expect(screen.queryByText(GIAI_THICH.nghiemThuChuaCoKetLuan)).toBeNull();
});
