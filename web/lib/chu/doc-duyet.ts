/**
 * Chữ mới của nhóm màn Đọc truyện · Nhận xét biên tập · Cần viết lại.
 *
 * Tách khỏi `lib/nhan.ts` để nhiều người sửa song song không giẫm lên nhau; chữ cũ vẫn ở đó.
 */

export const DOC_DUYET = {
  /* ── mục lục chương (dùng chung cho Đọc truyện và Nhận xét biên tập) ── */
  mucLuc: 'Mục lục',
  timChuong: 'Tìm chương theo số hoặc tên',
  timChuongNgan: 'Tìm chương…',
  khongThayChuong: (q: string) => `Không có chương nào khớp “${q}”.`,
  xoaTim: 'Xóa ô tìm',
  tap: (n: number, ten?: string) => (ten ? `Tập ${n} · ${ten}` : `Tập ${n}`),
  hoi: (n: number, ten?: string) => (ten ? `Hồi ${n} · ${ten}` : `Hồi ${n}`),
  ngoaiTap: 'Chương khác',
  demChuong: (n: number) => `${n} chương`,
  /** "Chương 12 · Cửa đá"; tiêu đề trùng "Chương 12" thì không lặp lại. */
  tenChuong: (n: number, ten?: string) => {
    const t = ten?.trim();
    if (!t || /^chương\s*\d+\s*$/i.test(t)) return `Chương ${n}`;
    return `Chương ${n} · ${t}`;
  },

  /* ── lọc mục lục ở Nhận xét biên tập ── */
  locNhan: 'Hiện chương nào',
  locCoNhanXet: (n: number) => `Có nhận xét · ${n}`,
  locTatCa: (n: number) => `Tất cả · ${n}`,

  /* ── Đọc truyện ── */
  cheDoDoc: 'Cách hiển thị chữ',
  nhoChu: 'Chữ nhỏ hơn',
  toChu: 'Chữ to hơn',
  coChu: (px: number) => `Cỡ chữ ${px}`,
  gianDong: 'Giãn dòng',
  gianDongMuc: ['Vừa', 'Rộng', 'Thoáng'] as const,
  doiGianDong: (hienTai: string) => `Giãn dòng: ${hienTai}. Bấm để đổi`,
  moBenLe: 'Hiện kế hoạch và nhận xét',
  dongBenLe: 'Ẩn kế hoạch và nhận xét để đọc tập trung',
  benLe: 'Kế hoạch và nhận xét',
  moMucLuc: 'Mục lục',
  viTri: (i: number, n: number) => `Chương thứ ${i} trên ${n} chương đã có`,
  tienDoDoc: 'Đã đọc trong chương',
  phutDoc: (p: number) => `khoảng ${p} phút đọc`,
  tu: (s: string) => `${s} từ`,
  phimTat: 'Phím ← và → để chuyển chương',
  chuongSauLa: 'Chương sau',
  chuongTruocLa: 'Chương trước',
  hetChuong: 'Đây là chương mới nhất đã có.',
  xemNhanXetDay: 'Mở trong Nhận xét biên tập',
  khongMoDuoc: 'Không mở được chương này.',
  thuLai: 'Thử lại',
  chuaCoKeHoach: 'Chương này không có kế hoạch riêng.',

  /* ── Nhận xét biên tập ── */
  diemTrungBinh: 'điểm trung bình',
  diemTrungBinhDay: (n: number) =>
    `Trung bình cộng điểm của ${n} tiêu chí mà biên tập viên chấm. Biên tập viên không ghi một điểm tổng riêng.`,
  chuaChamDiem: 'Biên tập viên không chấm điểm từng tiêu chí ở nhận xét này.',
  tongQuan: 'Tổng quan',
  thamVi: (s: string) => `Phạm vi: ${s}`,
  keHoach: (s: string) => `Kế hoạch: ${s}`,
  canSua: 'cần sửa',
  docChuongNay: 'Đọc chương này',
  dangMoNhanXet: 'Đang mở nhận xét của chương này…',
  /** Vì sao chương chưa có nhận xét, theo công đoạn. */
  viSaoChuaCo: {
    done: 'Có thể chương được chốt trước khi bật nhận xét, hoặc nhận xét của nó đã bị xóa khỏi thư mục truyện.',
    rewrite: 'Chương đang chờ viết lại. Nhận xét cũ không còn trong thư mục truyện.',
    drafting: 'Người viết đang viết chương này. Biên tập viên chấm định kỳ, không chấm từng chương.',
    pending: 'Chương này chưa được viết, nên chưa có gì để nhận xét.',
  },
  goiYKhiChuaCo: 'Bạn vẫn đọc được chương, và có thể chọn một chương đã duyệt ở danh sách bên trái.',

  /* ── Cần viết lại ── */
  lyDoTraVe: 'Lý do biên tập viên trả về',
  lyDoTraVeGhiChu: 'Biên tập viên ghi một lý do cho cả lượt trả về này.',
  anNhanXet: 'Ẩn nhận xét',
  docBanCu: 'Đọc bản cũ',
  moNhanXetDay: 'Mở trong Nhận xét biên tập',
  hangChoRongGoiY: 'Bạn có thể đọc các chương đã duyệt ở Đọc truyện.',
  soVanDe: (n: number) => `${n} vấn đề`,
  chuongLienQuan: (ds: number[]) => `ch. ${ds.join(', ')}`,
} as const;

/** Biên tập viên chấm định kỳ — xem `lib/nhanXetDinhKy.ts`. */
export const NHAN_XET_DINH_KY = {
  chuKy: (n: number) => `Biên tập viên chấm định kỳ, cứ ${n} chương một lần, và một lần cuối khi viết xong.`,
  chamCuoi: (tong: number) =>
    `Truyện ${tong} chương: Biên tập viên chấm toàn truyện một lần, ngay sau chương cuối.`,
  chuaToiLuot: 'Chương này chưa tới lượt chấm.',
  truyenNgan: 'Truyện ngắn này kết thúc trước lượt chấm đầu tiên, nên chưa có nhận xét nào.',
  cuoiHoi: 'Biên tập viên chấm ở cuối mỗi hồi. Chương này chưa tới lượt chấm.',
  dangViet: 'Người viết đang viết chương này. Biên tập viên chấm định kỳ, không chấm từng chương.',
} as const;
