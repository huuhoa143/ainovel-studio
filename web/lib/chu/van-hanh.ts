/**
 * Chữ mới của nhóm màn vận hành: Chi phí, Chi phí tổng, Nhóm AI, Thông số phiên,
 * Xuất bản & nhập. Chữ đã có sẵn vẫn đọc từ `lib/nhan.ts`; tệp này chỉ giữ chữ mới để
 * nhiều người sửa song song không giẫm lên nhau.
 */
export const CHU_VH = {
  /* chi phí — ô số */
  daTieu: 'Đã tiêu',
  daTieuTren: (chuong: number) => `cho ${chuong} chương đã xong`,
  daTieuXuong: 'cộng từ mọi truyện',
  dangCongChiPhi: 'Đang cộng chi phí của các truyện…',
  giaMoiChuong: 'Giá mỗi chương',
  giaMoiChuongPhu: 'tổng chia số chương đã xong',
  giaChuaCo: 'chưa có chương nào xong',
  boDemTietKiem: 'Bộ đệm tiết kiệm',
  boDemTietKiemPhu: 'tiền lẽ ra phải trả thêm nếu không có bộ đệm',
  truyenCoSoLieu: 'Truyện có số liệu',
  truyenCoSoLieuPhu: (con: number) =>
    con > 0 ? `${con} truyện còn lại chưa gọi model lần nào` : 'mọi truyện đều đã có số liệu',

  /* chi phí — phân bổ */
  phanTong: (p: string) => `${p} tổng`,
  thanhTheoDinh: 'Thanh dài nhất là mục tốn nhất trong nhóm; con số bên phải là phần của tổng.',
  chuaCoMuc: 'Chưa có mục nào.',

  /* chi phí — độ tin */
  soLieuDayDu: 'Số liệu đầy đủ',
  soLieuDayDuCau: 'Mọi lượt gọi model đều báo lại số liệu, nên các con số trên là đủ.',
  chuaBietGia: 'Chưa biết giá',
  chuaBietGiaPhu: (token: number) =>
    `đã dùng ${new Intl.NumberFormat('vi-VN').format(token)} token — số token đủ, chỉ thiếu bảng giá`,
  chuaBietGiaCau: (model: string) =>
    `Chưa có bảng giá cho ${model}, nên số tiền hiện là 0 dù model đã được dùng. Số token vẫn đếm đủ; tiền thật xem ở trang của nhà cung cấp.`,
  thieuLuot: (n: number) => `Thiếu ${n} lượt`,
  hutDemNgan: (n: number) => (n > 0 ? `${n} lần hụt bộ đệm` : 'không lần hụt bộ đệm nào'),
  capNhatLuc: (t: string) => `cập nhật ${t}`,

  /* chi phí — chi tiết */
  xemChiTiet: 'Xem chi tiết token',
  xemChiTietPhu: 'đầu vào, đầu ra và bộ đệm theo vai và theo model',

  /* nhóm AI */
  dangLam: 'Đang làm',
  chuaLam: 'Chưa làm việc',
  daLam: 'Đã làm việc',
  chuongDaLam: 'chương đã làm',
  quyetDinh: 'quyết định',
  loi: 'lỗi',
  modelGanNhat: 'model gần nhất',
  modelDaGhi: 'model đã ghi',
  chuaGhiModel: 'chưa ghi model',
  giaiVai: {
    architect: 'Lên dàn ý, chia tập và hồi',
    writer: 'Viết từng chương',
    editor: 'Duyệt chương, chỉ chỗ cần viết lại',
    arbiter: 'Phân xử khi các vai bất đồng hoặc gặp lỗi',
    engine: 'Chạy lịch, lưu tiến độ, gọi đúng vai',
  } as Record<string, string>,
  cuaSoNhom: (n: number) =>
    `Số chương tính theo vòng gần nhất của mỗi chương. Quyết định và lỗi chỉ đếm trong ${n} quyết định gần nhất.`,

  /* thông số phiên */
  giaiBatDau: 'thời điểm phiên này mở',
  giaiNhaCungCap: 'nơi gửi các lượt gọi model',
  giaiModel: 'model mặc định lúc mở phiên',
  giaiKieuVan: 'chọn khi tạo truyện, khác với quy tắc ở mục Văn phong',
  giaiDoDai: 'quy mô kế hoạch của truyện',
  giaiCheDo: 'AI tự viết liên tục, hay chờ bạn cho phép từng chương',
  giaiCapPhep: 'chương xa nhất AI được phép viết tới',
  giaiNguoiQuyHoach: 'vai đã lên kế hoạch cho truyện',
  giaiMaPhanQuyet: 'dùng để tra trong nhật ký quyết định',
  xemViecQuyHoach: 'Xem việc đã giao',

  /* xuất bản & nhập */
  khoangChuong: 'Khoảng chương',
  khoangChuongPhu: 'Để trống để xuất mọi chương đã xong.',
  dinhDangTxt: 'Văn bản thuần, mở được ở mọi nơi.',
  dinhDangEpub: 'Sách điện tử có mục lục, đọc trên máy đọc sách.',
  nhapVaHoc: 'Đưa truyện hoặc văn mẫu vào',
  nhapVaHocPhu: 'Hai việc này dùng riêng một lần, nên được thu gọn.',
  denNgan: 'đến',
} as const;
