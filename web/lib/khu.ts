/**
 * Các khu vực của studio — tức các bề mặt mà rail điều hướng tới.
 *
 * Mã khu để nguyên dạng slug tiếng Việt không dấu vì nó đi vào query string
 * (`?khu=ban-thao`) và người vận hành sẽ thấy nó trên thanh địa chỉ. Chữ hiển
 * thị vẫn nằm ở lib/nhan.ts như mọi chỗ khác.
 *
 * Danh sách dưới đây là hợp đồng giữa rail và page: mục nào không nằm trong
 * `Khu` thì rail PHẢI vẽ nó dưới dạng chưa dựng, không phải liên kết. Bấm vào
 * một bề mặt chưa có là một lời hứa hụt, và một bề mặt trống trơn còn tệ hơn —
 * đó là nói dối.
 *
 * Ba khu (Văn phong, Chi phí, Phiên chạy) có bề mặt ở tầng web nhưng phụ thuộc
 * ba endpoint chỉ có ở bản engine đã dựng chúng. Nằm trong `Khu` là điều kiện
 * CẦN, không phải điều kiện đủ: rail còn hỏi thăm endpoint (`Profile.vanPhong`
 * và hai anh em của nó) rồi mới quyết định vẽ nút hay vẽ nhãn "chưa dựng". Hai
 * lớp này khác nhau — cái trên nói "web đã dựng bề mặt", cái dưới nói "engine
 * đang chạy có nguồn cho nó".
 *
 * # Hai lần đổi tên mã khu ở bản ba màn, và vì sao chúng đáng giá
 *
 * `cai-dat` → `phien-chay`. Mã khu đi vào thanh địa chỉ, nên nó là chữ NGƯỜI DÙNG ĐỌC —
 * đó là cả lý do nó ở dạng slug tiếng Việt. Bề mặt ấy là BẢN GHI của một cuốn ("cuốn này
 * đã khởi động với cấu hình gì", chỉ đọc, từ `meta/run.json`), trong khi thứ người ta đi
 * tìm khi gõ "cài đặt" là cấu hình máy sửa được. Bằng chứng là chính bề mặt đó đã phải in
 * ra một câu chỉ đường sang chỗ khác: "Muốn đổi mặc định cho mọi lượt sau thì sửa ở Cấu
 * hình máy". Một bề mặt phải chỉ đường khỏi chính nó là một bề mặt mang sai tên.
 *
 * Thêm `kenh-vai-chung` và `chi-phi-xuong`. Hai khu MỚI, không phải đổi tên: model theo
 * vai trước đây chỉ sửa được qua một engine ĐANG MỞ (bề mặt KenhVai nằm trong Phiên chạy),
 * nên "mặc định cho mọi tác phẩm" không có chỗ nào đặt được; còn chi phí toàn xưởng trước
 * đây không có nguồn (`/cost` là per-book) — giờ có `GET /api/workshop/cost`.
 */

import { manCuaKhu } from './man';

export type Khu =
  | 'xuong'
  | 'dong-san-xuat'
  | 'ban-thao'
  | 'kiem-dinh'
  | 'hang-cho-viet-lai'
  | 'dan-y'
  | 'nhan-vat'
  | 'luat-the-gioi'
  | 'phuc-but'
  | 'van-phong'
  | 'to-san-xuat'
  | 'chi-phi'
  | 'phien-chay'
  | 'cau-hinh'
  | 'kenh-vai-chung'
  | 'chi-phi-xuong'
  | 'tac-pham-moi'
  | 'cung-dung'
  | 'nhap-xuat';

/**
 * Tên NGƯỜI ĐỌC của từng khu — một bảng, dùng cho mọi chỗ cần gọi tên bề mặt đang mở.
 *
 * `Record<Khu, string>` chứ không phải một object thường: thêm một khu mà quên đặt tên thì
 * TypeScript đỏ ngay ở đây, thay vì để một bề mặt mang tên rỗng lọt ra giao diện. Đó cũng
 * là lý do bảng này đứng CẠNH `Khu` chứ không nằm trong `nhan.ts` — hợp đồng và tên của nó
 * phải đi liền nhau.
 *
 * Chuỗi trùng với nhãn trên rail (`DH`), và trùng là CỐ Ý: cùng một bề mặt thì nút dẫn tới
 * nó và tên của nó khi đang mở phải đọc ra một câu.
 */
export const TEN_KHU: Record<Khu, string> = {
  xuong: 'Tủ truyện',
  'dong-san-xuat': 'Tiến độ',
  'ban-thao': 'Đọc truyện',
  'kiem-dinh': 'Nhận xét biên tập',
  'hang-cho-viet-lai': 'Cần viết lại',
  'dan-y': 'Dàn ý',
  'nhan-vat': 'Nhân vật',
  'luat-the-gioi': 'Luật thế giới',
  'phuc-but': 'Phục bút',
  'van-phong': 'Văn phong',
  'to-san-xuat': 'Nhóm AI',
  'chi-phi': 'Chi phí',
  'phien-chay': 'Thông số phiên',
  'cau-hinh': 'Model & khóa API',
  'kenh-vai-chung': 'Model theo vai',
  'chi-phi-xuong': 'Chi phí tổng',
  'tac-pham-moi': 'Viết truyện mới',
  'cung-dung': 'Bàn ý tưởng',
  'nhap-xuat': 'Xuất bản & nhập',
};

export const KHU: readonly Khu[] = [
  'xuong',
  'dong-san-xuat',
  'ban-thao',
  'kiem-dinh',
  'hang-cho-viet-lai',
  'dan-y',
  'nhan-vat',
  'luat-the-gioi',
  'phuc-but',
  'van-phong',
  'to-san-xuat',
  'chi-phi',
  'phien-chay',
  'cau-hinh',
  'kenh-vai-chung',
  'chi-phi-xuong',
  'tac-pham-moi',
  'cung-dung',
  'nhap-xuat',
] as const;

/**
 * Khu mặc định TRONG màn xưởng sản xuất.
 *
 * Không còn là khu mở đầu của cả ứng dụng — màn mở đầu là Quản lý, xem `manDap` trong
 * man.ts. Nó vẫn giữ đúng vai cũ ở một chỗ quan trọng: khu rơi về khi `?khu=` vắng hoặc
 * không đọc được, nên một khu mới thêm mà quên viết `case` trong `page.tsx` rơi vào buồng
 * lái chứ không rơi vào màn hình trắng.
 */
export const KHU_MAC_DINH: Khu = 'dong-san-xuat';

export function laKhu(v: string | null | undefined): v is Khu {
  return !!v && (KHU as readonly string[]).includes(v);
}

/**
 * Mã khu CŨ → mã khu hiện hành.
 *
 * `kenh-vai-chung` đã nhập vào `cau-hinh` (dải kênh vai giờ là một khối của bề mặt Cấu hình
 * máy). Mã khu đi vào thanh địa chỉ nên nó nằm trong dấu trang và lịch sử của người dùng —
 * bỏ nó là để một liên kết cũ rơi vào khu mặc định, tức bật sang buồng lái của một cuốn nào
 * đó thay vì màn họ định mở.
 *
 * # Vì sao chuẩn hóa ở đây chứ không thêm một `case` trong `page.tsx`
 *
 * ĐO ĐƯỢC: một `case 'kenh-vai-chung'` vẽ đúng bề mặt, nhưng `khu` vẫn giữ giá trị cũ nên
 * rail so `di="cau-hinh"` với nó và KHÔNG mục nào sáng. Người dùng vào bằng liên kết cũ thấy
 * đúng nội dung nhưng không biết mình đang đứng ở đâu. Đổi ngay lúc đọc URL thì mọi thứ
 * xuôi theo: rail sáng đúng mục, và `ghiUrl` viết lại địa chỉ thành mã mới.
 */
const KHU_DOI_TEN: Record<string, Khu> = {
  'kenh-vai-chung': 'cau-hinh',
};

export function chuanKhu(v: string | null | undefined): Khu | undefined {
  if (!v) return undefined;
  const doi = KHU_DOI_TEN[v];
  if (doi) return doi;
  return laKhu(v) ? v : undefined;
}

/**
 * Khu mức MÁY: bề mặt của nó không đọc `tacPham`, và nội dung không đổi khi người dùng
 * chuyển tác phẩm.
 *
 * # Hàm này giờ CHỈ là một lối gọi tắt — bảng thật nằm ở lib/man.ts
 *
 * Trước bản ba màn, đây là chỗ duy nhất khai ranh giới cấp-máy/cấp-tác-phẩm, và ranh giới
 * ấy chỉ được THỂ HIỆN ra bằng một cái tên nhóm trong rail. Cái tên thua: đứng ở Cấu hình
 * máy thì thanh trên, rail và transport đều vẫn nói về một cuốn (xem chú thích đầu man.ts
 * cho phép đo).
 *
 * Giờ ranh giới là một tầng thật (`Man`), nên hàm này phải HỎI bảng đó chứ không giữ bản
 * sao thứ hai. Hai bảng cùng mô tả một phép chia thì có ngày lệch — thêm một khu vào
 * `MAN_CUA_KHU` mà quên cập nhật danh sách ở đây là một lỗi im lặng, và nó sẽ hiện ra dưới
 * dạng một bề mặt toàn cục mọc thêm một bộ chọn tác phẩm.
 */
export function laKhuMucMay(khu: Khu): boolean {
  return manCuaKhu(khu) !== 'xuong-san-xuat';
}

/**
 * Khu nào dùng panel inspector.
 *
 * Chỉ Dòng sản xuất: inspector là chi tiết của HÀNG đang chọn trong bảng chương.
 * Các bề mặt khác đã tự mang chi tiết của mình (bề mặt đọc có khu lề riêng cho
 * bản duyệt), nên để cột 292px trống ở đó là lấy mất 1/5 bề rộng để hiện một
 * panel không nói gì.
 */
export function dungInspector(khu: Khu): boolean {
  return khu === 'dong-san-xuat';
}
