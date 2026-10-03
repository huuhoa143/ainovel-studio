'use client';

import { mauBia } from '@/lib/bia';
import { CHU_TG } from '@/lib/chu/the-gioi';
import { CHU, GIAI_THICH } from '@/lib/nhan';
import type { TaiVe } from '@/lib/useHoSo';

/**
 * Vỏ chung của ba bề mặt hồ sơ tác phẩm.
 *
 * Gộp vào một chỗ vì cả ba chịu đúng cùng một bộ trạng thái, và chính bộ trạng
 * thái đó là phần dễ nói dối nhất:
 *
 *   - đang tải        → nói là đang đọc store
 *   - lỗi             → hiện câu của server, KHÔNG hạ thành "chưa có dữ liệu"
 *   - mảng `null`     → engine chưa ghi tệp đó lần nào
 *   - mảng `[]`       → đã ghi mà rỗng
 *
 * Hai ca cuối là hai sự thật khác nhau. Gộp chúng lại thành một câu "chưa có gì"
 * là nói dối một trong hai, và người vận hành sẽ đọc câu đó rồi tin rằng nền tác
 * phẩm chưa dựng trong khi nó đã dựng và đang rỗng — hai kết luận dẫn tới hai
 * hành động khác nhau.
 */
export function HoSoKhung({
  tieuDe,
  motTa,
  lop,
  hanhDong,
  children,
}: {
  tieuDe: string;
  motTa?: string;
  /** Lớp gốc của màn, để CSS riêng của màn có phạm vi và không lan sang màn khác. */
  lop?: string;
  /** Nút hoặc bộ lọc đứng ở mép phải thanh đầu. */
  hanhDong?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className={lop ? `canvas khuhoso ${lop}` : 'canvas khuhoso'}>
      <div className="head">
        <h1>{tieuDe}</h1>
        {motTa ? <span className="sub">{motTa}</span> : null}
        {hanhDong ? <div className="headPhai">{hanhDong}</div> : null}
      </div>
      {children}
    </main>
  );
}

/**
 * Một khối gập được, dùng cho phần NỀN của bề mặt.
 *
 * # Khi nào gập, và vì sao mặc định là đóng
 *
 * Gập dành cho khối đọc-một-lần đứng chắn trước khối đọc-mỗi-lần. Ca đã đo: khu
 * "Dàn ý phân tầng" mở ra là hai màn hình Tiền đề, còn cây Tập → Cung → Chương —
 * thứ mang tên cho cả khu và đổi ở mỗi cung — nằm dưới đáy cuộn.
 *
 * Đóng KHÔNG phải giấu: dòng tóm mang tên khối và số đo của nó, nên người dùng
 * biết trong đó có gì trước khi quyết định mở. Cái bị bỏ đi chỉ là việc phải cuộn
 * qua nó mỗi lần vào khu.
 *
 * `<details>` chứ không phải state React: nó cho sẵn bàn phím (Enter/Space),
 * `aria-expanded` đúng, và tìm-trong-trang của trình duyệt mở được khối đang
 * đóng — thứ mà một bản dựng tay gần như luôn thiếu.
 */
export function HopGap({
  tieuDe,
  phu,
  tomTat,
  moSan,
  children,
}: {
  tieuDe: string;
  /** Số đo của khối, hiện ngay trên dòng tóm — nó là lý do để mở hoặc để bỏ qua. */
  phu?: string;
  /** Vài dòng xem trước khi khối đóng: đủ để biết trong đó có gì mà không phải mở. */
  tomTat?: React.ReactNode;
  moSan?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="hopGap" open={moSan}>
      <summary>
        <h2>{tieuDe}</h2>
        {phu ? <span className="hopPhu">{phu}</span> : null}
        {tomTat ? <div className="hopTomTat">{tomTat}</div> : null}
      </summary>
      <div className="hopThan">{children}</div>
    </details>
  );
}

/**
 * Trạng thái tải/lỗi dùng chung. Trả về `null` khi dữ liệu đã sẵn sàng, để chỗ
 * gọi vẽ nội dung thật.
 *
 * Đây là một HÀM, không phải component, và điều đó là cố ý. Bản trước viết nó
 * thành `<TinhTrangHoSo tai={tai} />` rồi chỗ gọi dùng `tt ?? <nội dung>` — mà
 * một phần tử React thì luôn khác `null`, nên nhánh nội dung KHÔNG BAO GIỜ chạy:
 * ba bề mặt hồ sơ hiện đúng dòng tiêu đề (có số liệu thật, chứng tỏ đã tải xong)
 * rồi để trống toàn bộ thân trang. Lỗi chỉ thấy được bằng ảnh chụp — build sạch,
 * tsc sạch, không có cảnh báo nào.
 *
 * Gọi là hàm thì `tinhTrang(tai) ?? <nội dung>` so `null` thật với `null`.
 */
export function tinhTrangHoSo<T>(tai: TaiVe<T>): React.ReactNode | null {
  if (tai.loi) {
    return (
      <section className="sect">
        <p className="loiDoc">{tai.loi}</p>
      </section>
    );
  }
  if (tai.dangTai || !tai.du) {
    return (
      <section className="sect">
        <p className="trongSect">{CHU.dangTai}</p>
      </section>
    );
  }
  return null;
}

/**
 * Trạng thái tải cho ba bề mặt đọc-một-endpoint (Văn phong / Chi phí / Cài đặt).
 *
 * Khác `tinhTrangHoSo` ở đúng hai chỗ, và cả hai đều là chỗ nói thật:
 *
 *  1. Ca lỗi mang TIÊU ĐỀ và LỜI GIẢI, không chỉ một dòng đỏ. Câu của server nói
 *     được "chuyện gì" nhưng không nói được "điều này KHÔNG có nghĩa là tác phẩm
 *     chưa có dữ liệu" — mà đó đúng là kết luận sai mà người vận hành sẽ tự rút
 *     ra. Ba bề mặt này rỗng-vì-chưa-chạy nhiều hơn hẳn các bề mặt khác, nên hai
 *     ca đó phải tách nhau rõ hơn.
 *
 *  2. `!du` KHÔNG gộp vào "đang tải". `tinhTrangHoSo` trả câu "đang tải" cho cả
 *     hai, nên khi `du` vắng mà không có lời gọi nào đang bay — chưa chọn tác
 *     phẩm — bề mặt quay vòng vĩnh viễn. Một khoảng chờ không bao giờ kết thúc là
 *     lỗi, cùng hạng với bề mặt trống trơn: cả hai đều làm người dùng chờ một thứ
 *     sẽ không tới.
 */
export function tinhTrangNguon<T>(tai: TaiVe<T>): React.ReactNode | null {
  if (tai.loi) {
    return (
      <section className="sect">
        <h2>{GIAI_THICH.nguonKhongDocDuocTieuDe}</h2>
        <p className="trongSect">{GIAI_THICH.nguonKhongDocDuoc}</p>
        <p className="loiDoc">{tai.loi}</p>
      </section>
    );
  }
  if (tai.dangTai) {
    return (
      <section className="sect">
        <p className="trongSect">{CHU.dangTai}</p>
      </section>
    );
  }
  if (!tai.du) {
    return (
      <section className="sect">
        <p className="trongSect">{GIAI_THICH.chuaChonTacPham}</p>
      </section>
    );
  }
  return null;
}

/**
 * Câu cho một mục rỗng, phân biệt `null` với `[]`.
 *
 * `muc` là danh từ ghép vào câu: "nhân vật nào", "luật thế giới nào".
 */
export function MucRong({
  mang,
  muc,
  coKhi,
}: {
  mang: unknown[] | null | undefined;
  muc: string;
  /**
   * Câu nói mục này CÓ từ lúc nào, khi đó không phải lúc dựng nền. Phục bút được gieo lúc chốt
   * từng chương — câu mặc định "tạo khi dựng nền truyện" nói sai ngay ở cửa duyệt dàn ý, lúc
   * nền đã dựng xong mà chưa có phục bút nào (đúng ra là chưa tới lúc).
   */
  coKhi?: string;
}) {
  if (coKhi && (mang === null || mang === undefined || mang.length === 0)) {
    return <p className="trongSect">{coKhi}</p>;
  }
  if (mang === null || mang === undefined) {
    return <p className="trongSect">{GIAI_THICH.chuaDungNen(muc)}</p>;
  }
  return <p className="trongSect">{GIAI_THICH.dungNenMaRong(muc)}</p>;
}

/**
 * Chuẩn hoá chuỗi để tìm: bỏ dấu, `đ` → `d`, chữ thường.
 *
 * Người dùng gõ "ha van tinh" phải ra "Hạ Vãn Tình": gõ đủ dấu tiếng Việt trong một ô tìm
 * là việc chậm nhất trên bàn phím, và một ô tìm đòi đúng dấu thì gần như không dùng được.
 */
export function chuanHoaTim(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .trim();
}

/**
 * Nút "Hiện thêm" cho danh sách dài, kèm số còn lại.
 *
 * Phân trang bằng nút thay vì ảo hoá: danh sách ở đây là văn mô tả nhiều dòng, cao không
 * đều, và tìm-trong-trang của trình duyệt phải tìm được mọi mục đang hiện. Mỗi lần thêm
 * một khúc vừa đọc, không đổ cả 701 mục ra một lúc.
 */
export function NutHienThem({
  con,
  buoc,
  onThem,
  nhan,
}: {
  con: number;
  buoc: number;
  onThem: () => void;
  nhan: (n: number) => string;
}) {
  if (con <= 0) return null;
  return (
    <div className="tgHienThem">
      <button type="button" className="nutPhu" onClick={onThem}>
        {nhan(Math.min(buoc, con))}
      </button>
      <span className="tgHienThemCon">{CHU_TG.conLai(con)}</span>
    </div>
  );
}

/** "Hạ Vãn Tình" → "HT": chữ đầu của họ và của tên, như cách người Việt viết tắt tên. */
function chuDau(ten: string): string {
  const tu = ten.trim().split(/\s+/).filter(Boolean);
  if (tu.length === 0) return '?';
  const dau = tu[0]![0]!;
  const cuoi = tu.length > 1 ? tu[tu.length - 1]![0]! : '';
  return (dau + cuoi).toLocaleUpperCase('vi');
}

/** Vòng tròn chữ cái đầu. Màu suy từ tên, như màu bìa suy từ mã truyện: cố định, riêng. */
export function VongTen({ ten, lon }: { ten: string; lon?: boolean }) {
  return (
    <span
      className={lon ? 'tgVong lon' : 'tgVong'}
      style={{ background: mauBia(ten).chinh }}
      aria-hidden="true"
    >
      {chuDau(ten)}
    </span>
  );
}
