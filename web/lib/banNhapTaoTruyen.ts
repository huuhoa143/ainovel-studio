/**
 * Bản nháp của biểu mẫu Viết truyện mới — sống NGOÀI vòng đời của component.
 *
 * # Vì sao không để trong state của `TacPhamMoi`
 *
 * Biểu mẫu dẫn sang được ba màn khác: Model & khóa API (từ "Sẽ viết bằng" và từ nút "Sửa khóa
 * API" khi tạo hỏng vì khóa sai) và Bàn ý tưởng. Mỗi lần sang là `TacPhamMoi` bị gỡ, và state
 * của nó mất theo. Đo được trên app thật: người dùng gõ một đoạn mô tả truyện, bấm Bắt đầu,
 * khóa sai, sang sửa khóa, quay về — ô trống trơn. Lỗi đúng vào lúc người dùng ít rành máy nhất
 * vừa bỏ công viết.
 *
 * # Vì sao localStorage, và khóa theo gì
 *
 * localStorage tách theo origin, và origin chính là một studio: app desktop giữ cổng cố định
 * nên origin không đổi giữa các lần mở, và bản nháp sống sót cả khi tải lại trang hay mở lại
 * app. Không cần thêm phần định danh nào trong khóa.
 *
 * Chỉ xóa khi tạo truyện THÀNH CÔNG (hoặc khi người dùng tự xóa trắng các ô): tạo hỏng là đúng
 * lúc bản nháp quý nhất.
 */

const KHOA = 'ainovel.tacPhamMoi.banNhap';

export interface BanNhapTaoTruyen {
  /** Ô mô tả truyện. Thể loại đang chọn suy ra từ đây (chip sáng khi ô đúng bằng câu mẫu). */
  yeuCau: string;
  /** Tên thư mục trong Tùy chọn. */
  ten: string;
  /** Tên thư mục còn tự đi theo mô tả hay người dùng đã tự sửa. */
  tuDatTen: boolean;
  /** Phần Tùy chọn đang mở. */
  moTuyChon: boolean;
  /**
   * Bản yêu cầu từ Bàn ý tưởng mà bản nháp này bắt đầu từ đó. Bàn ý tưởng chốt một bản MỚI thì
   * bản mới thắng; cùng bản cũ thì những gì người dùng đã sửa trên nó thắng.
   */
  tuNhapSan: string;
}

export function docBanNhap(): BanNhapTaoTruyen | undefined {
  try {
    const tho = window.localStorage.getItem(KHOA);
    if (!tho) return undefined;
    const d = JSON.parse(tho) as Partial<BanNhapTaoTruyen>;
    if (typeof d?.yeuCau !== 'string' || typeof d.ten !== 'string') return undefined;
    return {
      yeuCau: d.yeuCau,
      ten: d.ten,
      tuDatTen: d.tuDatTen !== false,
      moTuyChon: d.moTuyChon === true,
      tuNhapSan: typeof d.tuNhapSan === 'string' ? d.tuNhapSan : '',
    };
  } catch {
    // localStorage bị chặn hoặc JSON hỏng: không có bản nháp. Biểu mẫu trống vẫn dùng được.
    return undefined;
  }
}

/** Ghi bản nháp; ô mô tả và tên cùng trống thì xóa — không giữ một bản nháp rỗng. */
export function ghiBanNhap(d: BanNhapTaoTruyen): void {
  if (!d.yeuCau.trim() && !d.ten.trim()) {
    xoaBanNhap();
    return;
  }
  try {
    window.localStorage.setItem(KHOA, JSON.stringify(d));
  } catch {
    // Ghi không được thì thôi — biểu mẫu trong lượt xem này vẫn đúng.
  }
}

export function xoaBanNhap(): void {
  try {
    window.localStorage.removeItem(KHOA);
  } catch {
    /* bỏ qua */
  }
}
