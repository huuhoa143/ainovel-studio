import type { Khu } from './khu';

/**
 * Ba MÀN của studio — tầng điều hướng nằm TRÊN khu.
 *
 * # Vì sao có tầng này, và vì sao một tên nhóm không thay được nó
 *
 * Ranh giới cấp-máy / cấp-tác-phẩm đã tồn tại trong mã từ lâu (`laKhuMucMay` trong khu.ts),
 * nhưng nó chỉ được THỂ HIỆN bằng một cái tên nhóm trong rail: "Chung cho mọi tác phẩm".
 * Một cái tên không ngăn được cái nhầm nó mô tả. Đo được trên app thật: đứng ở bề mặt Cấu
 * hình máy — thứ sửa tệp cấu hình của app cho MỌI tác phẩm — thì thanh trên vẫn là bộ
 * chọn của một cuốn, rail vẫn liệt kê 14 khu của cuốn đó, và transport dưới đáy vẫn mời bấm
 * `▶ Chạy` cho cuốn đó. Ba trong bốn vùng của khung nói về cuốn A trong khi canvas nói về cả
 * máy. Cái tên nhóm là mảnh duy nhất nói đúng, và nó thua ba vùng kia.
 *
 * Nên ranh giới phải là một tầng THẬT: đổi màn thì đổi cả khung, không chỉ đổi canvas.
 *
 * # Vì sao BA chứ không hai
 *
 * Hai màn (xưởng / một tác phẩm) là bản đề xuất `g-hai-tang.html`, và nó gộp cấu hình máy
 * vào màn xưởng. Nhưng "tôi đang có những gì" và "máy chạy bằng gì" là hai câu hỏi người
 * dùng mang tới vào hai lúc khác nhau, và gộp chúng làm màn quản lý phải mang một biểu mẫu
 * khóa API ở giữa một bảng đang được quét mắt.
 */
export type Man = 'quan-ly' | 'cai-dat-chung' | 'xuong-san-xuat';

export const MAN: readonly Man[] = ['quan-ly', 'cai-dat-chung', 'xuong-san-xuat'] as const;

/** Màn mở đầu. Xem `manDap` cho ba nhánh và lý do của từng nhánh. */
export const MAN_MAC_DINH: Man = 'quan-ly';

/**
 * Khu nào thuộc màn nào.
 *
 * Bảng này là NGUỒN DUY NHẤT của phép chia, và nó cố ý liệt kê đủ mọi khu thay vì dùng một
 * `default`. Một khu mới thêm vào mà quên xếp màn sẽ làm TypeScript đỏ ngay tại đây — chứ
 * không lặng lẽ rơi vào màn sản xuất rồi hiện ra dưới một bộ chọn tác phẩm không liên quan.
 */
const MAN_CUA_KHU: Record<Khu, Man> = {
  // ── Quản lý: cả xưởng. Không khu nào ở đây đọc `tacPham`.
  xuong: 'quan-ly',
  'tac-pham-moi': 'quan-ly',
  // Bàn ý tưởng cho một truyện MỚI — luôn cùng dựng mở sách, bất kể đang chọn cuốn nào.
  'cung-dung': 'quan-ly',

  // ── Cài đặt chung: áp cho MỌI lượt chạy sau, không thuộc cuốn nào.
  'cau-hinh': 'cai-dat-chung',
  'kenh-vai-chung': 'cai-dat-chung',
  'chi-phi-xuong': 'cai-dat-chung',

  // ── Xưởng sản xuất: một cuốn. Mọi khu ở đây đọc `tacPham`.
  'dong-san-xuat': 'xuong-san-xuat',
  'ban-thao': 'xuong-san-xuat',
  'kiem-dinh': 'xuong-san-xuat',
  'hang-cho-viet-lai': 'xuong-san-xuat',
  'nhap-xuat': 'xuong-san-xuat',
  'dan-y': 'xuong-san-xuat',
  'nhan-vat': 'xuong-san-xuat',
  'luat-the-gioi': 'xuong-san-xuat',
  'phuc-but': 'xuong-san-xuat',
  'van-phong': 'xuong-san-xuat',
  'to-san-xuat': 'xuong-san-xuat',
  'chi-phi': 'xuong-san-xuat',
  'phien-chay': 'xuong-san-xuat',
  // Cùng dựng GIAI ĐOẠN của cuốn đang mở — tạm dừng cuốn đó trong lúc bàn.
  'ban-huong': 'xuong-san-xuat',
};

export function manCuaKhu(khu: Khu): Man {
  return MAN_CUA_KHU[khu];
}

/**
 * Khu mở ra khi người dùng bấm vào một màn ở rail.
 *
 * Đây là khu ĐẦU của mỗi màn, không phải một khu "trang chủ" riêng: bấm tên màn rồi rơi vào
 * một bề mặt tổng quan thứ hai là thêm một nhịp cho mọi lần đổi màn.
 */
export const KHU_DAU_MAN: Record<Man, Khu> = {
  'quan-ly': 'xuong',
  'cai-dat-chung': 'cau-hinh',
  'xuong-san-xuat': 'dong-san-xuat',
};

/**
 * Màn có cần một tác phẩm đang mở không.
 *
 * Chỉ `xuong-san-xuat`. Đây là điều kiện của BA vùng khung, và cả ba dùng chung hàm này để
 * không lệch nhau:
 *
 *   · thanh trên vẽ bộ chọn tác phẩm (hai màn kia vẽ tên xưởng — một bộ chọn cuốn ở màn
 *     không nói về cuốn nào là một điều khiển không nói về gì cả);
 *   · transport hiện (hai màn kia KHÔNG có transport: một nút `▶ Chạy` tiêu tiền thật, gắn
 *     vào một cuốn mà canvas không nói tới, đặt dưới một màn đang được quét mắt, là mời một
 *     cú bấm không có chủ ý — cùng lý lẽ đã cấm nút chạy ở bảng Xưởng);
 *   · inspector chỉ có thể tồn tại ở đây.
 */
export function manTheoTacPham(man: Man): boolean {
  return man === 'xuong-san-xuat';
}

/**
 * Màn nào đáp lúc mở trang.
 *
 * Ba nhánh, ba lý do — chép tinh thần của `khuDap` (lib/xuong.ts), khác đúng nhánh cuối:
 *
 *   - **URL nói rõ khu** → theo URL. Tải lại trang ở một màn phải về đúng màn đó; một luật
 *     đáp thắng URL là URL nói dối.
 *   - **có `?tp=`** → xưởng sản xuất. Người quay lại một cuốn cụ thể đã nói ra họ muốn gì.
 *   - **không có gì** → QUẢN LÝ, bất kể xưởng có mấy cuốn.
 *
 * Nhánh cuối là một quyết định đã đổi, và điều khoản cũ phải được ghi lại vì nó có lý:
 * `khuDap` trước đây chỉ vào Xưởng khi có ≥ 2 cuốn, với lập luận "một bảng một dòng không
 * quyết định gì, nên nó chỉ là một màn hình phải bấm qua". Lập luận đó đúng khi Xưởng là một
 * BẢNG. Giờ Quản lý là một MÀN: nó mang tổng của cả xưởng, dải việc cần bạn, và hai đường
 * tạo tác phẩm. Với một cuốn duy nhất nó vẫn trả lời được "cuốn đó đang thế nào, và tôi tạo
 * cuốn thứ hai ở đâu" — hai câu mà buồng lái của cuốn đó không trả lời.
 */
export function manDap(v: {
  tpTuUrl: string | undefined;
  khuTuUrl: Khu | undefined;
}): Man {
  if (v.khuTuUrl) return manCuaKhu(v.khuTuUrl);
  if (v.tpTuUrl) return 'xuong-san-xuat';
  return MAN_MAC_DINH;
}
