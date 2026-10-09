/**
 * Chữ mới của nhóm màn Tủ truyện · Viết truyện mới · Bàn ý tưởng · hộp xác nhận.
 *
 * Tách khỏi `lib/nhan.ts` để nhiều người sửa song song không giẫm lên nhau; chữ cũ vẫn ở đó.
 */

/** Lời chào theo giờ máy đang xem. */
function loiChao(gio: number): string {
  if (gio < 5) return 'Chào bạn, khuya rồi';
  if (gio < 11) return 'Chào buổi sáng';
  if (gio < 14) return 'Chào buổi trưa';
  if (gio < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

/**
 * "2 tháng trước" — mốc tương đối cho thẻ truyện. Mốc hỏng hoặc vắng trả `undefined`, không
 * bao giờ in "Invalid Date" hay "NaN ngày trước".
 */
function luc(iso: string | undefined, bayGio: number = Date.now()): string | undefined {
  if (!iso) return undefined;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return undefined;
  const giay = Math.max(0, Math.round((bayGio - t) / 1000));
  if (giay < 60) return 'vừa xong';
  const phut = Math.round(giay / 60);
  if (phut < 60) return `${phut} phút trước`;
  const gio = Math.round(phut / 60);
  if (gio < 24) return `${gio} giờ trước`;
  const ngay = Math.round(gio / 24);
  if (ngay < 2) return 'hôm qua';
  if (ngay < 30) return `${ngay} ngày trước`;
  const thang = Math.round(ngay / 30);
  if (thang < 12) return `${thang} tháng trước`;
  return `${Math.round(thang / 12)} năm trước`;
}

/**
 * Ý tưởng mẫu: bấm một thể loại là có một câu yêu cầu đủ cụ thể để AI làm việc được — nhân
 * vật, xung đột, giọng văn, nhịp. Câu mẫu dạy người dùng một yêu cầu tốt trông ra sao.
 */
const Y_TUONG_MAU: { the: string; cau: string }[] = [
  {
    the: 'Mạt thế',
    cau: 'Truyện mạt thế dài, nhịp nhanh. Sau một trận mưa axit, thành phố ven biển chỉ còn những khu chợ đổi chác dưới lòng đất. Nhân vật chính là một thợ sửa máy lọc nước, lầm lì nhưng giữ chữ tín, bị cuốn vào cuộc tranh giành nguồn nước cuối cùng. Giọng lạnh, ít tả cảm xúc, mỗi chương khép bằng một lựa chọn khó.',
  },
  {
    the: 'Tiên hiệp',
    cau: 'Truyện tiên hiệp tu luyện, nhịp vừa. Một đệ tử tạp dịch không linh căn nhặt được nửa cuốn kiếm phổ trong bãi phế liệu của tông môn, và cuốn phổ ấy có một phần hồn của người viết ra nó. Thế giới có luật tu luyện chặt chẽ, cảnh giới rõ ràng; nhân vật chính lên cấp chậm nhưng mỗi bước đều phải trả giá.',
  },
  {
    the: 'Trinh thám',
    cau: 'Truyện trinh thám điều tra dài, nhịp chậm. Nhân vật chính là một nữ pháp y trẻ ở một thị trấn ven sông, nơi ba người mất tích trong ba mùa nước lũ liên tiếp. Manh mối rải đều, không giấu thông tin với người đọc, giọng tiết chế; mỗi chương khép bằng một hình ảnh cụ thể.',
  },
  {
    the: 'Ngôn tình',
    cau: 'Truyện ngôn tình đô thị, chậm mà ấm. Một cô thợ đóng sách cổ ở phố Hàng Bông và một kiến trúc sư được thuê để biến dãy phố ấy thành khách sạn. Hai người ở hai phía của cùng một cuộc tranh chấp, không ai là người xấu. Nhiều đối thoại, ít kịch tính giả tạo, kết có hậu nhưng phải xứng đáng.',
  },
  {
    the: 'Kinh dị',
    cau: 'Truyện kinh dị dân gian, nhịp chậm và ngột ngạt. Một sinh viên về quê chịu tang bà ngoại và phát hiện cả làng giữ một lệ cúng nửa đêm mà không ai chịu giải thích. Sợ hãi đến từ những điều không nói ra, không có máu me; mỗi chương hé thêm một phần sự thật.',
  },
  {
    the: 'Lịch sử',
    cau: 'Truyện lịch sử giả tưởng thời Lý. Một viên quan coi kho sách hoàng cung phát hiện trong sổ sách có một trận đánh chưa từng được chép vào sử. Truyện đan giữa đấu trí triều đình và những chuyến đi tìm nhân chứng; ngôn ngữ trang trọng vừa phải, chi tiết đời sống thật.',
  },
];

export const TU_TRUYEN = {
  /* ── Tủ truyện ── */
  loiChao,
  luc,
  keTruyen: 'Kệ truyện',
  ganDay: 'Gần đây',
  toanTu: 'Toàn tủ',
  soTruyen: 'Số truyện',
  phienDangMo: 'Phiên viết đang mở',
  daTietKiem: 'Tiết kiệm nhờ bộ nhớ đệm',
  khongCoPhien: 'không có',
  /** Hai câu mở đầu của dòng tóm tắt; tên truyện theo sau, là một nút. */
  tomTatDangViet: 'Đang viết ',
  tomTatPhienMo: 'Phiên viết còn mở ở ',
  tomTatViec: (n: number) => (n === 1 ? 'một truyện có việc cần bạn.' : `${n} truyện có việc cần bạn.`),
  tomTatKhongViec: 'chưa có việc nào cần bạn.',
  canBanDe: 'Cần bạn xem',
  canBanPhu: 'Những truyện tự dừng vì lỗi, bạn đã hẹn dừng, hoặc còn góp ý chưa xử lý.',
  dangVietChuong: (n: number) => `Đang viết chương ${n}`,
  tamNghi: 'Đang nghỉ',
  tuDung: 'Đã tự dừng',
  tuDungXemLyDo: 'Tự dừng vì lỗi — mở để xem',
  hoanThanh: 'Hoàn thành',
  chuongTren: (tong: string) => `/ ${tong} chương`,
  chuong: 'chương',
  chuaBietTong: 'chưa biết tổng số chương',
  moiChuong: '/chương',
  thaoTacKhac: (ten: string) => `Thao tác khác với ${ten}`,
  docTruyen: 'Đọc truyện',
  xuatBan: 'Xuất bản',
  xoaTruyen: 'Xóa truyện…',
  vietTruyenMoiPhu: 'Kể một ý tưởng, AI lo phần còn lại',
  chuaCoTen: 'Chưa có tên',

  /* ── trống / lỗi / đang tải ── */
  thuMoLai: 'Thử mở lại',
  dangTaiPhu: 'Đang đọc thư mục truyện trên máy của bạn.',

  /* ── Viết truyện mới ── */
  thuMotY: 'Chưa có ý? Bắt đầu từ một thể loại',
  yTuongMau: Y_TUONG_MAU,
  tuyChon: 'Tùy chọn',
  luuO: 'lưu ở thư mục',
  chuaCoTenThuMuc: 'cần đặt tên thư mục',
  chuaRoY: 'Ý còn mơ hồ?',
  banTruoc: 'Bàn ý tưởng với AI trước',
  /** Chỉ hiện khi tủ chưa có truyện nào. Menu do app desktop dựng — tên phải khớp nguyên văn. */
  coTruyenCu: 'Đã có truyện viết từ trước? Mở menu Tệp → Nhập truyện từ thư mục… để đưa vào tủ.',
  buocLau: ['10–30 giây', '1–4 phút', 'liên tục'],
  /** Tạo hỏng vì khóa API — nút mở thẳng màn Model & khóa API. */
  suaKhoaApi: 'Sửa khóa API',
  /** Xưởng chưa có truyện nào: đường về biểu mẫu tạo truyện từ hai màn phụ của nó. */
  veTaoTruyen: 'Về tạo truyện',

  /* ── Bàn ý tưởng ── */
  cdChaoDe: 'Kể ý tưởng của bạn, dù còn mơ hồ',
  cdChaoThan:
    'Điều phối sẽ hỏi lại vài câu về nhân vật, bối cảnh và giọng văn, rồi gom tất cả thành một bản yêu cầu ở cột bên. Khi thấy ổn, bạn chốt và AI bắt đầu viết.',
  cdNhap: 'Viết tin nhắn',
  /* Cùng dựng giai đoạn — bàn chặng tiếp của truyện đang mở, không phải truyện mới. */
  cdGdChaoDe: 'Chặng tiếp theo nên đi thế nào?',
  cdGdChaoThan: 'Kể điều bạn muốn đổi hoặc thêm cho phần sắp viết — nhịp, nhân vật, tình tiết. AI hỏi lại cho rõ rồi đưa ra một bản hướng đi để bạn áp dụng.',
  cdGdGoiYNhap: 'Ví dụ: cho nhân vật chính gặp lại người cũ ở chặng này…',
  cdGoiYGui: 'Enter để gửi · Shift+Enter xuống dòng',
  cdDangNghi: 'Điều phối đang nghĩ',
  cdBanNhapTrong: 'Bản yêu cầu sẽ hiện ở đây sau lượt trả lời đầu tiên, và được cập nhật sau mỗi lượt.',
  cdSanSang: 'Đủ rõ để viết',
  cdChuaSanSang: 'Còn vài điều cần hỏi',
  cdChuaSanSangPhu: 'Trả lời thêm vài câu để AI chốt được bản này.',
  /* Cùng dựng giai đoạn — truyện đang mở bị tạm dừng trong lúc bàn. */
  cdHuyBan: 'Thôi bàn, trở lại viết',
  cdDangHuy: 'Đang trở lại…',
  cdApDung: 'Áp dụng cho truyện và viết tiếp',
  cdDangApDung: 'Đang áp dụng…',
  cdSoLuot: (n: number) => `${n} lượt trao đổi`,
};
