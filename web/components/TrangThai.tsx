import { useDauDoi } from '@/lib/dauDoi';
import type { NhanTrangThai } from '@/lib/nhan';

/**
 * Một trạng thái công đoạn: ký hiệu + chữ, tô theo tông ngữ nghĩa.
 *
 * Ký hiệu đứng trước chữ và khác nhau giữa các trạng thái, nên ảnh đen trắng
 * và người mù màu vẫn phân biệt được — màu không bao giờ là kênh duy nhất.
 * Ký hiệu mang `aria-hidden` vì chữ ngay bên cạnh đã nói cùng một điều; đọc cả
 * hai là lặp.
 *
 * `dap` là NHỊP ĐẬP, và nó phải do phía gọi truyền vào — component này không tự
 * suy được. Trạng thái nó nhận (`tt`) đến từ `stage`/`activity` đã ghi vào store,
 * tức một công đoạn, không phải một sự thật về liveness; tự bật nhịp đập theo
 * tông `gold` là đúng cái lỗi làm engine đã chết đọc ra thành đang chạy. Chỉ
 * truyền `dap` khi có sự thật liveness thật — xem lib/song.ts.
 */
export function TrangThai({
  tt,
  title,
  dap,
  vien,
}: {
  tt: NhanTrangThai;
  title?: string;
  dap?: boolean;
  /**
   * Vẽ thành viên thuốc `.vien` của hệ giao diện 2 thay vì dòng chữ trần. Tùy chọn, mặc định
   * tắt: `TrangThai` còn nằm ở thanh dưới và tổ sản xuất, hai chỗ vẫn dùng dạng chữ trần.
   */
  vien?: boolean;
}) {
  /**
   * Trạng thái VỪA ĐỔI thì lắng xuống một lần.
   *
   * Đặt ở đây chứ không ở từng chỗ gọi: `TrangThai` là component của MỌI `.st` trong bề mặt —
   * hàng bảng chương, khối trục, nhãn inspector, ô transport. Một chỗ sửa là cả hệ đi cùng
   * nhau, và không có chỗ nào lỡ quên.
   *
   * `tt` là object HẰNG lấy từ bảng tra (`TRANG_THAI_CHUONG[stage]`), nên cùng một trạng thái
   * cho cùng một tham chiếu và `useDauDoi` không thấy đổi ở những lần render lại vô nghĩa.
   *
   * KHÔNG đụng nhịp đập: `.dap` giữ vòng 2,2s của nó. Hai chuyển động trả lời hai câu khác
   * nhau — "vừa đổi" và "còn đang chạy" — nên chúng cùng tồn tại.
   */
  const dau = useDauDoi(tt);

  return (
    <span
      key={dau}
      className={`st ${tt.mau}${vien ? ' vien' : ''}${dap ? ' dap' : ''}${dau > 0 ? ' vuaDoi' : ''}`}
      title={title}
    >
      <span className="ky" aria-hidden="true">
        {tt.ky}
      </span>
      {tt.nhan}
    </span>
  );
}
