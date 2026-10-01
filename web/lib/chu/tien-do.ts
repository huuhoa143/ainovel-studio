/**
 * Chữ MỚI của màn Tiến độ (`?khu=dong-san-xuat`) — bản làm lại theo `.impeccable/brief-v2.md`.
 *
 * Tách khỏi `lib/nhan.ts` để nhiều người sửa song song không giẫm lên nhau. Chữ đã có trong
 * `nhan.ts` thì vẫn đọc từ đó; tệp này chỉ giữ câu chưa có ở đâu.
 */

/** Năm bước của một chương, đúng thứ tự engine đi qua (xem `ownersFromSteps` phía server). */
export const BUOC_CHUONG = ['Kế hoạch', 'Viết nháp', 'Soát nhất quán', 'Chốt', 'Biên tập'] as const;

/** Bước đang làm, nói bằng động từ để ghép vào câu "Người viết đang …". */
const VIEC_BUOC = [
  'lập kế hoạch chương',
  'viết bản nháp',
  'soát nhất quán với hồ sơ truyện',
  'chốt bản thảo',
  'biên tập và chấm chương',
] as const;

export const TD = {
  xemLaiChuong: (n: number) => `Xem lại chương ${n}`,
  theDangLam: 'Việc đang làm',
  choBanDuyet: 'Chờ bạn duyệt',

  /** "đã chạy 12 phút" — đồng hồ của cả phiên, không phải của riêng chương. */
  daChay: (ms: number): string => {
    const phut = Math.floor(ms / 60000);
    if (phut < 1) return 'vừa bắt đầu';
    if (phut < 60) return `đã chạy ${phut} phút`;
    const gio = Math.floor(phut / 60);
    const du = phut % 60;
    return du === 0 ? `đã chạy ${gio} giờ` : `đã chạy ${gio} giờ ${du} phút`;
  },

  buocVung: 'Các bước của chương này',
  buocXong: 'đã xong',
  buocDangLam: 'đang làm',
  buocTiepTheo: 'bước kế tiếp',
  buocChua: 'chưa tới',

  moTaDangLam: (vai: string, i: number) => `${vai} đang ${VIEC_BUOC[i] ?? 'làm việc'}.`,
  moTaVuaXong: (vai: string, i: number, sau: number) =>
    `${vai} vừa xong bước ${BUOC_CHUONG[i]?.toLowerCase() ?? ''}, kế tiếp là ${
      BUOC_CHUONG[sau]?.toLowerCase() ?? ''
    }.`,
  moTaTho: (vai: string, viec: string) => `${vai} đang làm: ${viec}`,
  moTaChoLuot: 'Đang chuẩn bị lượt viết đầu tiên.',

  phienNay: 'Phiên này',
  daXong: 'Đã xong',
  tocDo: 'Tốc độ',
  gia: 'Giá',
  daTieu: 'Đã tiêu',
  model: 'Model lượt trước',
  thoiGian: 'Thời gian',
  soChu: 'Số chữ',
  chuongMoiGio: (x: string) => `${x} chương/giờ`,
  moiChuong: (x: string) => `${x} / chương`,
  chuaDo: 'chưa đủ số liệu',

  /** Bảng chương gọn: mặc định chỉ hiện chừng này hàng mới nhất. */
  hienThem: (n: number) => `Hiện thêm ${n} chương`,
  thuGon: 'Thu gọn',

  canhBao: (n: number) => (n === 1 ? '1 chỗ dữ liệu không khớp' : `${n} chỗ dữ liệu không khớp`),
  xemCanhBao: 'Xem chi tiết',

  xemDayDu: 'Xem đầy đủ',
  thuGonTienDe: 'Thu gọn',
} as const;
