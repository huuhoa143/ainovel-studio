/**
 * Định dạng số theo quy ước tiếng Việt: dấu chấm phân nhóm nghìn, dấu phẩy
 * thập phân. `3.104` là ba nghìn một trăm linh bốn, `$0,046` là bốn mươi sáu
 * phần nghìn đô — đọc ngược lại là sai một nghìn lần.
 *
 * Mọi hàm ở đây nhận `undefined` và trả `undefined`, KHÔNG trả '0'. Chỗ gọi
 * hiển thị CHU.khongCo ('—'). Đây là quy tắc chống bịa của model.go dịch sang
 * tầng trình bày: `duration_ms` vắng nghĩa là không đo được, mà '0s' lại nghĩa
 * là xong tức thời — hai điều khác nhau, và người vận hành sẽ tin con số.
 *
 * Định dạng chạy ở phía trình duyệt (dữ liệu đến sau khi mount) nên không có
 * rủi ro lệch giữa render máy chủ và máy khách.
 */

const nfSo = new Intl.NumberFormat('vi-VN');
const nfMot = new Intl.NumberFormat('vi-VN', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const nfHai = new Intl.NumberFormat('vi-VN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const nfBa = new Intl.NumberFormat('vi-VN', {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

/** Số nguyên có phân nhóm nghìn: 3104 → "3.104". */
export function so(n: number | undefined): string | undefined {
  if (n === undefined || n === null || !Number.isFinite(n)) return undefined;
  return nfSo.format(n);
}

/** Số từ. Vắng và 0 đều trả undefined: chương chưa viết thì không có số từ. */
export function soTu(n: number | undefined): string | undefined {
  if (!n) return undefined;
  return nfSo.format(n);
}

/**
 * Thời lượng một chu kỳ. `undefined` giữ nguyên `undefined`.
 * 0 là giá trị THẬT (xong tức thời) nên vẫn in ra "0,0s".
 */
export function thoiLuong(ms: number | undefined): string | undefined {
  if (ms === undefined || ms === null || !Number.isFinite(ms) || ms < 0) return undefined;
  const giay = ms / 1000;
  if (giay < 60) return `${nfMot.format(giay)}s`;

  const tongGiay = Math.round(giay);
  const gio = Math.floor(tongGiay / 3600);
  const phut = Math.floor((tongGiay % 3600) / 60);
  const du = tongGiay % 60;
  if (gio > 0) return `${gio}g ${String(phut).padStart(2, '0')}p`;
  return `${phut}p ${String(du).padStart(2, '0')}s`;
}

/** Đồng hồ đã chạy của cả phiên: 22324000 → "6:12:04". */
export function daChay(ms: number | undefined): string | undefined {
  if (ms === undefined || ms === null || !Number.isFinite(ms) || ms < 0) return undefined;
  const tong = Math.floor(ms / 1000);
  const gio = Math.floor(tong / 3600);
  const phut = Math.floor((tong % 3600) / 60);
  const giay = tong % 60;
  return `${gio}:${String(phut).padStart(2, '0')}:${String(giay).padStart(2, '0')}`;
}

/**
 * Tiền. Ba chữ số thập phân cho đơn giá mỗi chương (giá thành một chương ở
 * mức phần nghìn đô, làm tròn hai số sẽ thành "$0,05" và mất hết độ phân giải).
 */
export function donGia(usd: number | undefined): string | undefined {
  if (usd === undefined || usd === null || !Number.isFinite(usd)) return undefined;
  return `$${nfBa.format(usd)}`;
}

/** Tổng chi phí, hai chữ số thập phân. 0 là giá trị thật: chưa tốn gì. */
export function tongTien(usd: number | undefined): string | undefined {
  if (usd === undefined || usd === null || !Number.isFinite(usd)) return undefined;
  return `$${nfHai.format(usd)}`;
}

/** Năng suất: 3.42 → "3,4". */
export function nangSuat(x: number | undefined): string | undefined {
  if (x === undefined || x === null || !Number.isFinite(x)) return undefined;
  return nfMot.format(x);
}

/** Phần trăm nguyên: 0.62 → "62%". */
export function phanTram(ti: number | undefined): string | undefined {
  if (ti === undefined || ti === null || !Number.isFinite(ti)) return undefined;
  return `${Math.round(ti * 100)}%`;
}

/** Giờ:phút theo múi giờ máy đang xem — mốc thời gian của nhật ký. */
export function gio(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Ngày của một mốc nhật ký, chỉ khi mốc ấy KHÔNG thuộc hôm nay: "hôm qua", "08/08", "08/08/25".
 *
 * Nhật ký chỉ in giờ:phút thì một mốc 21:36 của hôm trước đứng trên 17:40 trông như xếp sai thứ
 * tự — dù nó đúng là mới nhất. Hôm nay thì không in ngày: đó là ca thường và giờ là đủ.
 */
export function ngayNgan(iso: string | undefined, bay: Date = new Date()): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const cungNgay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (cungNgay(d, bay)) return undefined;
  const homQua = new Date(bay.getFullYear(), bay.getMonth(), bay.getDate() - 1);
  if (cungNgay(d, homQua)) return 'hôm qua';
  const dm = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  return d.getFullYear() === bay.getFullYear() ? dm : `${dm}/${String(d.getFullYear() % 100).padStart(2, '0')}`;
}

/** "5 phút trước" / "2 ngày trước" — mốc gần đây đọc theo khoảng cách, không theo đồng hồ. */
export function cachDay(iso: string | undefined, bay: Date = new Date()): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const phut = Math.floor((bay.getTime() - d.getTime()) / 60_000);
  if (phut < 1) return 'vừa xong';
  if (phut < 60) return `${phut} phút trước`;
  const gioTruoc = Math.floor(phut / 60);
  if (gioTruoc < 24) return `${gioTruoc} giờ trước`;
  const ngay = Math.floor(gioTruoc / 24);
  if (ngay < 30) return `${ngay} ngày trước`;
  return d.toLocaleDateString('vi-VN');
}

/** Ngày giờ đầy đủ, dùng cho `title` khi chỉ hiện giờ:phút. */
export function ngayGio(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleString('vi-VN');
}

/** "47/300" — tiến độ gọn cho bộ chọn tác phẩm. */
export function tienDo(xong: number, tong: number): string {
  if (!tong) return nfSo.format(xong);
  return `${nfSo.format(xong)}/${nfSo.format(tong)}`;
}
