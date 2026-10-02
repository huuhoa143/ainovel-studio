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

/** Hạ chữ đầu để ghép vào giữa câu ("Đọc tài liệu…" → "đọc tài liệu…"). */
function thuong(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

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
  moTaXongChuong: (vai: string) => `${vai} vừa chốt chương, kế tiếp là lên kế hoạch chương sau.`,
  /** Điều phối vừa giao việc cho một vai; `viec` là phần trong ngoặc của dòng gốc. */
  moTaGiaoViec: (vai: string, viec?: string) =>
    viec ? `Điều phối giao cho ${vai}: ${viec}` : `Điều phối giao việc cho ${vai}.`,
  moTaDangCongCu: (vai: string, viec: string) => `${vai} đang ${thuong(viec)}.`,
  moTaVuaCongCu: (vai: string, viec: string) => `${vai} vừa ${thuong(viec)}.`,
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

/**
 * Chữ cho lỗi LLM, việc giao và trạng thái kẹt — đọc qua `lib/loiLlm.ts`, không ghép tay ở
 * component. `ncc` là tên nhà cung cấp đã cấu hình (vd. "lingoreup"); vắng thì "Nhà cung cấp".
 */
export const LOI_LLM = {
  nccMacDinh: 'Nhà cung cấp',
  khongConModelGoiCongCu: (ncc: string) => `${ncc} không còn model nào gọi công cụ được`,
  khongConModel: (ncc: string) =>
    `${ncc} không còn model nào nhận yêu cầu (thiếu khóa hoặc model không gọi được công cụ)`,
  khongCoKhoa: (ncc: string) => `${ncc} chưa có khóa dùng được cho model này`,
  khoaBiTuChoi: (ncc: string) => `Khóa API của ${ncc} bị từ chối`,
  tuChoiTruyCap: (ncc: string) => `${ncc} từ chối truy cập`,
  gioiHanLuot: (ncc: string) => `${ncc} đang giới hạn số lượt gọi`,
  quaLau: (ncc: string) => `${ncc} trả lời quá lâu`,
  loiMayChu: (ncc: string) => `${ncc} đang lỗi phía máy chủ`,
  khongKetNoi: (ncc: string) => `Không kết nối được tới ${ncc}`,
  khongCoModel: (ncc: string) => `Model đang chọn không có trên ${ncc}`,
  loiKhac: (ncc: string) => `${ncc} báo lỗi`,
  congTamLoi: (ncc: string, ma: string) => `${ncc} tạm thời lỗi ${ma}`,
  /** Lỗi thoáng qua đã được engine tự thử lại và đi tiếp. */
  daTuThuLai: 'đã tự thử lại',
  dangThuLai: (lan: number, tong: number) => `đang thử lại ${lan}/${tong}`,

  viecDoiModel: (vai: string) => `Thử chọn model khác cho ${vai} ở Model & khóa API.`,
  viecDoiModelChung: 'Thử chọn model khác ở Model & khóa API.',
  viecKiemKhoa: 'Kiểm tra khóa API ở Model & khóa API.',
  viecCho: 'Chờ một lúc rồi viết tiếp, hoặc đổi model ở Model & khóa API.',
  viecKiemMang: 'Kiểm tra địa chỉ và mạng, rồi viết tiếp.',

  giaoViec: (tu: string, cho: string) => `${tu} giao việc cho ${cho}`,
  giaoViecCho: (cho: string) => `Giao việc cho ${cho}`,

  /** Dòng gộp các lần thử lại cùng một lỗi ở Diễn biến. */
  thuLaiNLan: (n: number) => (n === 1 ? 'Thử lại 1 lần' : `Thử lại ${n} lần`),

  dangKet: 'Đang kẹt',
  dangKetPhu: 'AI đang thử lại mãi một lỗi và chưa gọi được lượt nào',
  moCauHinh: 'Mở Model & khóa API',

  dungNen: 'Đang dựng nền truyện',
  dungNenPhu: 'Nhân vật, thế giới và dàn ý — chương 1 viết sau bước này.',
} as const;

/** Nhãn đầu vào của một quyết định ở Nhật ký — theo loại quyết định. */
export const NHAT_KY_VAO = {
  /** plan_start: đầu vào là ý tưởng người dùng gõ lúc tạo truyện. */
  yTuong: 'Ý tưởng của bạn:',
  /** intervention: đầu vào là góp ý người dùng gửi giữa chừng. */
  gopY: 'Góp ý:',
  /** Loại khác: đầu vào do engine ghi, không phải chữ của người dùng. */
  khac: 'Đầu vào:',
} as const;

/** Nút Đóng phiên lúc máy đang viết — khóa, và nói đúng lý do. */
export const DONG_PHIEN = {
  khiDangChay: 'Đang viết dở một lượt. Tạm dừng trước, rồi mới đóng phiên.',
} as const;

/**
 * Tên công cụ của engine → việc, nói bằng tiếng Việt (xem `lib/congCu.ts`). `c` là số chương
 * khi dòng gốc có "(chương N)".
 */
export const CONG_CU = {
  soatNen: 'Soát nền truyện',
  docTaiLieu: (c?: number) => (c ? `Đọc tài liệu cho chương ${c}` : 'Đọc tài liệu truyện'),
  luuNen: (phan?: string) => (phan ? `Lưu ${phan}` : 'Lưu nền truyện'),
  phanNen: {
    premise: 'tiền đề',
    characters: 'nhân vật',
    world_rules: 'luật thế giới',
    outline: 'dàn ý',
    layered_outline: 'dàn ý phân tầng',
    relationships: 'quan hệ nhân vật',
    timeline: 'dòng thời gian',
    foreshadow: 'phục bút',
    style: 'văn phong',
  } as Record<string, string>,
  keHoach: (c?: number) => (c ? `Lên kế hoạch chương ${c}` : 'Lên kế hoạch chương'),
  vietNhap: (c?: number) => (c ? `Viết nháp chương ${c}` : 'Viết nháp chương'),
  soatNhatQuan: (c?: number) => (c ? `Soát nhất quán chương ${c}` : 'Soát nhất quán'),
  chot: (c?: number) => (c ? `Chốt chương ${c}` : 'Chốt chương'),
  docLai: (c?: number, nhap?: boolean) =>
    `Đọc lại ${nhap ? 'bản nháp ' : ''}${c ? `chương ${c}` : 'chương'}`,
  luuNhanXet: (c?: number) => (c ? `Lưu nhận xét chương ${c}` : 'Lưu nhận xét'),
  sua: (c?: number) => (c ? `Sửa chương ${c}` : 'Sửa chương'),
  suaDanY: 'Sửa dàn ý',
  tomTatHoi: 'Tóm tắt hồi',
  tomTatTap: 'Tóm tắt tập',
  hoiBan: 'Hỏi ý bạn',
  moLai: 'Mở lại truyện để viết tiếp',
  /** "Người viết đang đọc tài liệu…" — ghép vai với việc. */
  vaiLam: (vai: string, viec: string) => `${vai}: ${viec.charAt(0).toLowerCase()}${viec.slice(1)}`,
} as const;

/** Nút ở thanh dưới. */
export const DIEU_KHIEN = {
  vietThem: 'Viết thêm',
  vietThemGiai:
    'Truyện đã đủ số chương dự kiến. Bấm nếu muốn AI viết tiếp quá dự kiến — vẫn tính phí như thường.',
  lienTuc: 'Liên tục',
  tungChuong: 'Từng chương',
} as const;
