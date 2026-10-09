/**
 * Chữ của màn "Model & khóa API" (bản giao diện 2).
 *
 * Tách khỏi `lib/nhan.ts` theo luật làm song song: chuỗi MỚI của màn này đứng ở đây để không
 * giẫm lên các màn khác. Từ vựng theo PRODUCT.md — vai là Điều phối, Kiến trúc sư, Người viết,
 * Biên tập viên; xưng "bạn".
 */

/** Nhãn của độ suy luận; giá trị gửi đi vẫn là mã gốc. */
const NHAN_DO_SUY_LUAN: Record<string, string> = {
  off: 'Tắt',
  low: 'Thấp',
  medium: 'Vừa',
  high: 'Cao',
  xhigh: 'Rất cao',
  max: 'Tối đa',
};

/**
 * Tên hai bước đầu của biểu mẫu và nhãn ô khóa — đặt riêng vì câu gợi ý lần đầu gọi đúng tên
 * chúng. Đổi nhãn ở biểu mẫu mà câu gợi ý còn gọi tên cũ là chỉ đường tới một chỗ không có.
 */
const BUOC_1 = 'Chọn nhà cung cấp';
const BUOC_2 = 'Kết nối';
const KHOA_API = 'Khóa API';

/** Chữ của màn. */
export const CH = {
  tieuDe: 'Model & khóa API',
  tieuDeLanDau: 'Kết nối model để bắt đầu',
  gioiThieu: 'Chọn model cho từng vai và quản lý khóa API. Thiết lập ở đây dùng chung cho mọi truyện.',
  gioiThieuLanDau:
    'Thêm một nhà cung cấp và nhập khóa API. Kiểm tra kết nối, chọn model, rồi bạn có thể bắt đầu viết.',
  /** Lần đầu: khóa API là gì, lấy ở đâu, dán vào đâu — cho người chưa từng dùng. */
  goiYKhoaLanDau: `Khóa API là một mật khẩu riêng do nhà cung cấp model (OpenRouter, OpenAI, Google…) cấp cho tài khoản của bạn. Ở bước 1 (${BUOC_1}) bên dưới, bấm tên nhà cung cấp bạn dùng. Rồi đăng nhập trang của họ, vào mục API keys, tạo một khóa, sao chép và dán vào ô ${KHOA_API} ở bước 2 (${BUOC_2}).`,
  /**
   * Tệp thiết lập hỏng (`config_error`): server coi như chưa cài, lượt lưu hợp lệ kế tiếp ghi
   * lại tệp TỪ ĐẦU. Nói trước điều đó — thứ còn trong tệp cũ sẽ không được giữ.
   */
  tepHong: 'Không đọc được tệp thiết lập, nên app coi như chưa cài đặt. Thêm lại nhà cung cấp và khóa API bên dưới; khi bạn lưu, tệp sẽ được ghi mới và thiết lập cũ trong đó không được giữ lại.',
  tepHongChiTiet: (loi: string) => `Chi tiết: ${loi}`,
  dangTai: 'Đang tải thiết lập…',
  taiLai: 'Tải lại',

  /* ── Đang dùng ── */
  dangDung: 'Đang dùng',
  dangDungPhu: 'Model mà truyện sẽ dùng ở lần viết tới',
  modelMacDinh: 'Model mặc định',
  macDinhGiaiThich: 'Vai nào không chọn riêng sẽ dùng model này. Điều phối luôn dùng model này.',
  chuaChonMacDinh: 'Chưa chọn model mặc định',
  doiModel: 'Đổi model',
  chonRieng: 'Chọn riêng',
  doiRieng: 'Đổi',
  dungMacDinh: 'Dùng mặc định',
  theoMacDinh: 'theo mặc định',
  datRieng: 'đặt riêng',
  luonTheoMacDinh: 'luôn theo mặc định',
  dieuPhoi: 'Điều phối',
  vai: 'Vai',
  modelChuaKhai: 'không còn trong danh sách của nhà cung cấp',
  modelKhongCoThat: 'nhà cung cấp không có model này',
  coDoSuyLuan: (muc: string) => `độ suy luận ${(NHAN_DO_SUY_LUAN[muc] ?? muc).toLowerCase()}`,

  /* ── chọn model ── */
  timModel: 'Tìm model hoặc nhà cung cấp…',
  khongKhop: 'Không có model nào khớp.',
  taiDanhSach: 'Tải danh sách',
  taiLaiDanhSach: 'Tải lại',
  dangTaiDanhSach: 'Đang tải…',
  chuaCoKhoaNhom: 'chưa có khóa',
  daKhai: 'đã lưu',
  conNua: (n: number) => `còn ${n} model nữa — gõ để lọc`,
  chuaTaiGoiY: 'Chưa tải danh sách — bấm "Tải danh sách" để xem mọi model của nhà cung cấp này.',

  /* ── trạng thái lưu ── */
  dangLuu: 'Đang lưu…',
  daLuu: 'Đã lưu',
  luu: 'Lưu',
  huy: 'Hủy',

  /* ── phiên đang mở ── */
  phienDangMo: (ten: string) =>
    `Truyện ${ten} đang mở phiên và vẫn chạy model cũ — thiết lập ở đây đã đổi sau khi phiên mở. Bấm áp dụng để phiên dùng ngay, hoặc thiết lập mới sẽ ăn từ lần mở phiên tới.`,
  apDungNgay: (ten: string) => `Áp dụng ngay cho ${ten}`,
  dangApDung: 'Đang áp dụng…',
  daApDung: (ten: string, gio: string) => `Đã áp dụng cho ${ten} lúc ${gio}`,
  /** Sau "Áp dụng ngay" xuôi — câu "vẫn dùng thiết lập lúc mở" lúc này đã sai. */
  phienDaApDung: (ten: string, gio: string) => `Truyện ${ten} đang dùng thiết lập mới từ ${gio}.`,
  kieuVanCanMoLai: 'Kiểu văn chỉ đổi khi bạn mở lại phiên.',

  /* ── tệp cấu hình ── */
  /** Dòng nhỏ cuối trang: tệp nằm trong thư mục dữ liệu của app, người dùng không phải tìm nó. */
  tepDangSua: (p: string) => `Thiết lập được lưu ở ${p}`,

  /* ── nhà cung cấp ── */
  nhaCungCap: 'Nhà cung cấp',
  themNcc: 'Thêm nhà cung cấp',
  macDinh: 'Mặc định',
  coKhoa: (che: string) => (che ? `Có khóa · ${che}` : 'Có khóa'),
  chuaCoKhoa: 'Chưa có khóa',
  khongCanKhoa: 'Không cần khóa',
  soModel: (n: number) => (n === 0 ? 'chưa có model' : `${n} model`),
  kiemTra: 'Kiểm tra',
  dangKiem: 'Đang kiểm…',
  chuaKiem: 'Chưa kiểm tra',
  ketNoiDuoc: (n: number, gio: string) => `Kết nối được · ${n} model · ${gio}`,
  ketNoiLoi: 'Không kết nối được',
  congCuDuoc: (m: string) => `${m} gọi công cụ được`,
  congCuKhong: (m: string) =>
    `Model ${m} không gọi công cụ được — Kiến trúc sư, Người viết và Biên tập viên sẽ không chạy`,
  congCuLyDo: (ly: string) => `Lý do: ${ly}.`,
  sua: 'Sửa',
  xoa: 'Xóa',
  dungChoVai: (ds: string) => `Đang dùng cho: ${ds}`,
  khongVaiNao: 'Chưa vai nào dùng',
  khongXoaMacDinh: 'Đây là nhà cung cấp mặc định. Đổi model mặc định sang nơi khác trước khi xóa.',
  canKhoaDeKiem: 'Nhập khóa API trước khi kiểm tra.',
  chuaCoNcc: 'Chưa có nhà cung cấp nào. Thêm một nhà cung cấp để bắt đầu.',
  cuaSoLech: (ten: string, ds: string) =>
    `${ten} báo cửa sổ ngữ cảnh khác với thiết lập đang lưu: ${ds}. Ghi lại để bộ nén ngữ cảnh dùng đúng con số.`,
  ghiCuaSo: 'Ghi lại cửa sổ',
  khaiLa: (ds: string) => `Nhà cung cấp không còn phục vụ: ${ds}.`,

  /* ── xóa ── */
  xoaTieuDe: (ten: string) => `Xóa nhà cung cấp ${ten}?`,
  xoaThan: (ghim: string) =>
    `Khóa API đã lưu sẽ mất và không xem lại được.${ghim ? ` ${ghim} đang chọn riêng ở đây sẽ quay về model mặc định.` : ''}`,
  dangXoa: 'Đang xóa…',

  /* ── biểu mẫu ── */
  buoc1: BUOC_1,
  buoc2: BUOC_2,
  buoc3: 'Chọn model',
  tuNhap: 'Tự nhập',
  ten: 'Tên',
  tenGoiY: 'Tên ngắn, không dấu cách — dùng để nhận ra nhà cung cấp trong danh sách.',
  giaoThuc: 'Giao thức',
  theoTen: (ten: string) => `Theo tên (${ten || 'chưa đặt'})`,
  diaChiGoc: 'Địa chỉ gốc',
  diaChiGocGoiY: 'Để trống nếu dùng địa chỉ chính thức của hãng.',
  khoaApi: KHOA_API,
  giuKhoaCu: 'Để trống để giữ khóa cũ',
  khoaCucBo: 'Gateway trên máy bạn có thể không cần khóa.',
  khaiKhongKhoa: 'Nhà cung cấp này không cần khóa API',
  khaiKhongKhoaGoiY: 'Chỉ tích khi bạn tự chạy máy chủ AI trên máy mình hoặc trong mạng nội bộ. Dịch vụ trên mạng luôn cần khóa.',
  kiemKetNoi: 'Kiểm tra kết nối',
  timTrongDs: 'Lọc model…',
  daChon: (n: number) => `Đã chọn ${n} model`,
  themTheoTen: 'Thêm model theo tên',
  themTheoTenGoiY: 'Gõ tên rồi nhấn Enter',
  buoc3ChuaKiem: 'Kiểm tra kết nối để chọn từ danh sách nhà cung cấp, hoặc thêm model theo tên.',
  khongThayONcc: 'không thấy ở nhà cung cấp',
  dungLamMacDinh: 'Dùng làm model mặc định',
  luuNcc: 'Lưu',
  canMotModel: 'Chọn ít nhất một model để bắt đầu.',
  trungTen: (ten: string) => `Đã có nhà cung cấp tên ${ten}. Chọn tên khác, hoặc bấm Sửa ở nhà cung cấp đó.`,
  tenCoKhoangTrang: 'Tên không được có dấu cách.',

  /* ── thiết lập khác ── */
  thietLapKhac: 'Thiết lập khác',
  kieuVan: 'Kiểu văn mặc định',
  kieuVanLa: (k: string) => `Kiểu văn "${k}" không có thật nên đang bị bỏ qua. Chọn một kiểu có sẵn.`,
  doSuyLuan: 'Độ suy luận mặc định',
  theoModel: 'Theo mặc định của model',
  /** Nhãn hiển thị — giá trị gửi đi vẫn là mã gốc. Mã lạ hiện nguyên văn. */
  nhanKieuVan: {
    default: 'Mặc định',
    fantasy: 'Kỳ ảo',
    romance: 'Lãng mạn',
    suspense: 'Hồi hộp',
  } as Record<string, string>,
  nhanDoSuyLuan: NHAN_DO_SUY_LUAN,

  /* ── chuyển dây chuyền ── */
  chuyenTieuDe: (ncc: string) => `Chuyển model mặc định sang ${ncc}?`,
  chuyenThan:
    'Vai theo mặc định sẽ đổi theo. Một số vai đang chọn riêng ở nhà cung cấp khác — bạn muốn chuyển cả chúng sang đây không?',
  dangDungCot: 'Đang dùng',
  seThanh: 'Sẽ thành',
  phaiChonLai: 'chọn lại',
  chiDoiMacDinh: 'Chỉ đổi mặc định',
  chuyenCa: 'Chuyển cả các vai',
  dangChuyen: 'Đang chuyển…',
  modelMoiCua: (vai: string) => `Model mới cho ${vai}`,
  thieuModel: 'Mỗi vai cần một model.',

  /* ── phiên đang mở (KenhVai) ── */
  phienDangMoMo: 'Đang mở…',
} as const;
