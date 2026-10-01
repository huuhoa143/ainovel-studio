/**
 * Chữ của nhóm màn "Thế giới truyện": Dàn ý, Nhân vật, Luật thế giới, Phục bút, Văn phong.
 *
 * Chữ đã có trong `lib/nhan.ts` vẫn lấy từ đó; tệp này chỉ giữ chữ MỚI của lượt làm lại,
 * để nhiều người sửa song song không giẫm lên nhau trong một tệp chung.
 */
export const CHU_TG = {
  /* ── dàn ý ── */
  xemToanBo: 'Xem toàn bộ',
  thuGon: 'Thu gọn',
  moHetTap: 'Mở mọi tập',
  dongHetTap: 'Đóng mọi tập',
  tapDangViet: 'Đang viết',
  tapDaXong: 'Đã xong',
  tapChuaViet: 'Chưa viết',
  daVietTren: (xong: number, tong: number) => `${xong}/${tong} chương`,
  soHoi: (n: number) => `${n} hồi`,
  chuongSo: (n: number) => `Chương ${n}`,
  chuongPham: (tu: number, den: number) => (tu === den ? `chương ${tu}` : `chương ${tu}–${den}`),
  canh: 'Cảnh',
  trangThaiChuong: {
    done: 'đã xong',
    running: 'đang viết',
    rewrite: 'cần viết lại',
    gate: 'chờ duyệt',
    pending: 'chưa viết',
  } as Record<string, string>,

  /* ── nhân vật ── */
  locHang: 'Lọc theo hạng',
  tatCa: 'Tất cả',
  chonNhanVat: 'Chọn một nhân vật để xem tính cách, động lực, năng lực và quan hệ.',
  dongChiTiet: 'Đóng',
  hoSo: 'Hồ sơ',
  biDanh: 'Còn gọi là',
  quanHeVoi: 'Quan hệ đã ghi',
  quanHeTomTat: 'Quan hệ hiện tại',
  hienThem: (n: number) => `Hiện thêm ${n}`,
  conLai: (n: number) => `còn ${n}`,
  khongCoQuanHe: 'Chưa ghi quan hệ nào với nhân vật này.',
  khongKhopHang: 'Không có nhân vật nào ở hạng này.',
  tatCaQuanHe: 'Mọi quan hệ đã ghi',
  demQuanHe: (n: number) => `${n} cặp`,
  timQuanHe: 'Tìm theo tên hoặc nội dung',
  khongKhopTim: (q: string) => `Không có mục nào khớp “${q}”. Thử từ khác, hoặc xoá ô tìm.`,
  oChuong: (n: number) => `ch. ${n}`,
  cuoiHoi: (tap: number, hoi: number) => `cuối tập ${tap} · hồi ${hoi}`,

  /* ── luật thế giới ── */
  demLuat: (n: number) => `${n} luật`,

  /* ── phục bút ── */
  locTrangThai: 'Lọc theo trạng thái',
  chuaThu: 'chưa thu',
  timPhucBut: 'Tìm trong phục bút',
  dangHien: (hien: number, tong: number) => `Đang hiện ${hien} trên ${tong}`,
  gieoThu: (gieo: number, thu?: number) => (thu ? `ch. ${gieo} → ${thu}` : `từ ch. ${gieo}`),
  khongCoTrangThai: 'Không có phục bút nào ở trạng thái này.',

  /* ── văn phong ── */
  nguonQuyTac: 'Nguồn',
  giongTitle: (n: number) => `${n} nhân vật`,
} as const;
