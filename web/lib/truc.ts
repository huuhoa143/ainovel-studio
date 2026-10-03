/**
 * Hình học của trục sản xuất.
 *
 * Đây là chỗ dễ vẽ sai nhất trong cả bề mặt, nên logic tách khỏi component để
 * đọc được và thử được riêng.
 */

import type { LaneBlock, VachChuong, VachHien } from './types';

export interface KhoiDaDo extends LaneBlock {
  /** Trọng số flex-grow. Luôn > 0. */
  trongSo: number;
  /** true khi `chapters === 0`, tức phạm vi CHƯA BIẾT. */
  chuaBietPhamVi: boolean;
}

/**
 * Biến `chapters` thành trọng số độ rộng.
 *
 * `LaneBlock.chapters === 0` nghĩa là CHƯA BIẾT, không phải "không có chương
 * nào": tập chưa mở thì chưa có cung nào nên chưa có cả số dự kiến (xem ghi chú
 * ở model.go:LaneBlock.Chapters). Nhân trực tiếp với 0 làm khối biến mất khỏi
 * trục — người vận hành sẽ thấy một tác phẩm 6 tập chỉ còn 4 khối và tin rằng
 * hai tập kia không tồn tại.
 *
 * Khối chưa biết nhận trọng số trung bình của các khối đã biết, nên nó vẫn có
 * mặt và không giả vờ biết mình rộng bao nhiêu. Nếu cả lane đều chưa biết thì
 * chia đều. Kèm min-width để khối hẹp nhất vẫn đọc được nhãn.
 */
export function doTruc(blocks: LaneBlock[]): KhoiDaDo[] {
  const daBiet = blocks.filter((b) => b.chapters > 0).map((b) => b.chapters);
  const trungBinh =
    daBiet.length > 0
      ? daBiet.reduce((a, b) => a + b, 0) / daBiet.length
      : 1;

  return blocks.map((b) => ({
    ...b,
    trongSo: b.chapters > 0 ? b.chapters : trungBinh,
    chuaBietPhamVi: b.chapters === 0,
  }));
}

/**
 * Khoảng hở giữa các vạch trên lane chương, theo số chương.
 *
 * 1 vạch = 1 chương theo DESIGN.md. Với 300 chương trong khoảng 800px, mỗi vạch
 * còn dưới 3px; giữ khoảng hở 1,5px như bản mockup (108 chương) sẽ làm hở rộng
 * hơn vạch và trục đọc thành đường kẻ sọc thay vì dãy chương.
 */
export function hoVach(soChuong: number): number {
  if (soChuong > 220) return 0;
  if (soChuong > 120) return 1;
  return 1.5;
}

/** Một dải chương liền nhau cùng trạng thái. */
export interface DaiVach {
  from: number;
  to: number;
  state: VachHien;
  /** Số chương trong dải — cũng là trọng số độ rộng. */
  len: number;
  /** Dải này là MỘT chương vừa chốt, tách ra để hoạt ảnh họ 09 chạy đúng chỗ. */
  vuaChot?: boolean;
}

/**
 * Gộp các chương liền nhau cùng trạng thái thành một dải.
 *
 * Vì sao cần: với 300 chương trong 810px, mỗi vạch rộng 2,7px và rơi vào vị trí
 * lẻ của điểm ảnh thiết bị. Trình duyệt làm mờ viền từng ô, nên một dãy 40
 * chương đã nghiệm thu — vốn phải là một khối liền — hiện ra thành vạch sọc.
 * ĐO ĐƯỢC: gap thật là 0px, các ô kề nhau đúng (x = 320 / 322,7 / 325,4), nên
 * sọc không phải do khoảng hở mà do làm mờ dưới điểm ảnh.
 *
 * Gộp dải giữ nguyên ngữ nghĩa "một vạch một chương" ở mức tỉ lệ: độ rộng mỗi
 * dải vẫn đúng bằng số chương của nó, và ranh giới nằm đúng chỗ trạng thái đổi.
 * Lane thưa (còn khoảng hở) vẫn vẽ từng chương để đếm được bằng mắt.
 */
export function nhomVach(
  marks: VachChuong[],
  /**
   * Chương VỪA chốt — mỗi chương trong tập này được TÁCH thành một dải riêng.
   *
   * Vì sao phải tách: hoạt ảnh họ 09 đổ đầy PHẦN TỬ từ trái. Trên một dải gộp 40 chương,
   * nó đọc ra là "cả bốn mươi chương vừa chốt" — một lời nói dối lớn gấp bốn mươi lần sự
   * thật, và nói đúng vào lúc người vận hành đang tin nhất.
   *
   * Tách KHÔNG làm xê dịch gì: độ rộng dải là `flexGrow: len`, nên 40 = 39 + 1 cho ra đúng
   * cùng tổng trọng số. Ranh giới mới biến mất ở lượt nạp sau, khi tập rỗng trở lại.
   */
  vuaChot: ReadonlySet<number> = KHONG_CHOT,
): DaiVach[] {
  const dai: DaiVach[] = [];
  for (const m of marks) {
    const chot = vuaChot.has(m.chapter);
    const cuoi = dai[dai.length - 1];
    // Không gộp chương vừa chốt vào dải trước, và cũng không gộp gì vào một dải vừa chốt:
    // thiếu vế thứ hai thì chương kế tiếp nuốt mất dải một-chương vừa tách ra.
    if (cuoi && !chot && !cuoi.vuaChot && cuoi.state === m.state && m.chapter === cuoi.to + 1) {
      cuoi.to = m.chapter;
      cuoi.len += 1;
      continue;
    }
    dai.push({ from: m.chapter, to: m.chapter, state: m.state, len: 1, vuaChot: chot });
  }
  return dai;
}

/** Mặc định của `nhomVach`: không có chương nào vừa chốt. */
const KHONG_CHOT: ReadonlySet<number> = new Set();

/**
 * Chương tương ứng với một điểm bấm trong dải.
 *
 * Dải gộp không mất khả năng chọn chương: vị trí bấm trong dải quy về chỉ số
 * chương theo tỉ lệ, nên bấm vào giữa một dải 40 chương vẫn ra chương ở giữa.
 */
export function chuongTaiDiem(d: DaiVach, ti: number): number {
  const buoc = Math.floor(Math.min(Math.max(ti, 0), 0.999999) * d.len);
  return d.from + buoc;
}

/* ── cửa sổ của lane chương ────────────────────────────────────────────── */

/**
 * Biên sản xuất: chương cuối cùng còn dấu vết sản xuất.
 *
 * Không phải "chương đang chạy": engine có thể đang nghỉ giữa hai cung, và lúc
 * đó không mark nào ở `running` nhưng dây chuyền vẫn dừng ở một chỗ cụ thể.
 * Cũng không phải `completed_chapters`: một chương bị trả về viết lại nằm SAU
 * chương đã xong cuối cùng, và nó chính là chỗ cần nhìn.
 */
export function bienSanXuat(marks: VachChuong[]): number {
  let bien = 1;
  for (const m of marks) {
    if (m.state !== 'pending' && m.chapter > bien) bien = m.chapter;
  }
  return bien;
}

export interface CuaSoTruc {
  from: number;
  to: number;
  /** true khi cửa sổ hẹp hơn toàn trục, tức đang thu phóng. */
  thuPhong: boolean;
}

/**
 * Bề rộng một vạch để đếm được từng chương bằng mắt, tính bằng px.
 *
 * Đây là hằng số DUY NHẤT của phép thu phóng, và nó là một ngưỡng thị giác chứ
 * không phải một số chương: ở 16px một vạch là một vật thể có hình, và một dãy
 * 2 chương đã nghiệm thu thành khối 32px — thấy được, không phải cái đốm.
 *
 * Bề rộng cửa sổ suy ra TỪ BỀ RỘNG LANE THẬT chia cho ngưỡng này, nên nó tự
 * đổi theo màn hình thay vì cắm một số chương cố định — cùng lý do mà cột nhãn
 * phải đo từ nhãn thật.
 */
const NHIP_VACH_PX = 16;

/** Không thu phóng xuống dưới mức này: cửa sổ 5 chương thì mất cả bối cảnh. */
const CUA_SO_MIN = 12;
/** Cũng không mở rộng vô hạn trên màn hình rất rộng. */
const CUA_SO_MAX = 160;

/**
 * Cửa sổ nhìn của lane chương.
 *
 * Vì sao cần thu phóng: với 2/300 chương xong, phần đã nghiệm thu chiếm 0,67%
 * bề rộng lane — đúng toán học và vô dụng thị giác. Và đó là tình trạng của
 * người vận hành trong phần lớn thời gian đầu của một cuốn 300 chương.
 *
 * Cửa sổ LỆCH VỀ SAU biên sản xuất (70% phía sau, 30% phía trước) vì hai phía
 * không mang lượng tin bằng nhau: phía sau là chương đã chạy, mang cả cửa kiểm
 * định và chương bị trả về; phía trước là một dãy `pending` giống hệt nhau, xem
 * 25 vạch của nó không biết thêm điều gì so với xem 8 vạch.
 *
 * `beRongLane <= 0` nghĩa là CHƯA ĐO ĐƯỢC (lần render đầu, trước khi
 * ResizeObserver báo về). Khi đó trả về toàn trục: nội dung không được gate sau
 * một phép đo, và toàn trục là mặc định thật thà nhất — nó không giả vờ biết
 * lane rộng bao nhiêu.
 */
export function cuaSoTruc(tong: number, bien: number, beRongLane: number): CuaSoTruc {
  if (tong <= 0) return { from: 1, to: 0, thuPhong: false };
  if (beRongLane <= 0) return { from: 1, to: tong, thuPhong: false };

  const span = Math.min(
    CUA_SO_MAX,
    Math.max(CUA_SO_MIN, Math.round(beRongLane / NHIP_VACH_PX)),
  );
  if (tong <= span) return { from: 1, to: tong, thuPhong: false };

  let from = Math.round(bien - span * 0.7);
  if (from < 1) from = 1;
  let to = from + span - 1;

  // Bám vào vạch đích khi nó đã trong tầm.
  // ĐO ĐƯỢC ở 1440px với 280/300: biên là chương 281, span 51, nên cửa sổ ra
  // 245–295 và năm chương cuối (296–300) nằm ngoài. Người vận hành ở 280/300
  // đang nhìn vào chỗ kết thúc của cả bộ, và một trục không cho thấy vạch đích
  // ngay khi đích còn cách có năm chương là bỏ mất đúng tin họ cần.
  if (to > tong || tong - to <= span * 0.25) {
    to = tong;
    from = Math.max(1, to - span + 1);
  }
  return { from, to, thuPhong: true };
}

/** Các vạch nằm trong cửa sổ. */
export function vachTrongCuaSo(marks: VachChuong[], cs: CuaSoTruc): VachChuong[] {
  return marks.filter((m) => m.chapter >= cs.from && m.chapter <= cs.to);
}

/**
 * Việc tồn bị cửa sổ che.
 *
 * Bắt buộc phải đếm và phải hiện ra: thu phóng là một phép lọc, và một phép lọc
 * im lặng ẩn đi chương đang chờ viết lại là đúng cái lỗi mà Rail và bộ chọn mức
 * xem đã phải tránh. `pending` không tính — chương chưa tới nằm ngoài tầm mắt là
 * chuyện bình thường, chương bị trả về thì không.
 */
export function vieccTonNgoaiCuaSo(marks: VachChuong[], cs: CuaSoTruc): number {
  return marks.filter(
    (m) =>
      (m.chapter < cs.from || m.chapter > cs.to) &&
      (m.state === 'rewrite' ||
        m.state === 'running' ||
        m.state === 'vietDo' ||
        m.state === 'gate'),
  ).length;
}

/**
 * Mốc số chương cho thước của MỘT ĐOẠN trục.
 *
 * Mốc chia đều theo bề rộng thật của đoạn (chứ không làm tròn về số chẵn) vì
 * thước được đặt theo tỉ lệ: mốc phải nằm đúng chỗ chương đó nằm, nếu không nó
 * là một cái nhãn chỉ sai chỗ — tệ hơn không có nhãn.
 */
export function mocThuocDai(from: number, to: number): number[] {
  const span = to - from + 1;
  if (span <= 0) return [];
  if (span === 1) return [from];

  const soMoc = span <= 14 ? 2 : span <= 40 ? 4 : 6;
  const buoc = (span - 1) / (soMoc - 1);
  const mocs: number[] = [];
  for (let i = 0; i < soMoc; i += 1) {
    const m = Math.round(from + i * buoc);
    if (mocs[mocs.length - 1] !== m) mocs.push(m);
  }
  return mocs;
}

/** Vị trí một mốc trong đoạn, theo tỉ lệ 0–1. */
export function viTriMoc(m: number, from: number, to: number): number {
  if (to <= from) return 0;
  return (m - from) / (to - from);
}

/**
 * Các mốc số chương trên thước dưới lane chương.
 *
 * Bước làm tròn theo tổng số chương để nhãn không chen nhau: 300 chương → 1,
 * 100, 200, 300.
 */
export function mocThuoc(tong: number): number[] {
  if (tong <= 0) return [];
  if (tong <= 12) return [1, tong];

  const buoc = tong > 400 ? 200 : tong > 150 ? 100 : tong > 60 ? 25 : 10;
  const mocs: number[] = [1];
  for (let m = buoc; m < tong; m += buoc) mocs.push(m);
  mocs.push(tong);
  // Mốc cuối và mốc trước nó dính nhau khi tổng không chia hết cho bước.
  if (mocs.length > 2) {
    const cuoi = mocs[mocs.length - 1]!;
    const truoc = mocs[mocs.length - 2]!;
    if (cuoi - truoc < buoc / 2) mocs.splice(mocs.length - 2, 1);
  }
  return mocs;
}

/** Nhãn phạm vi của một khối: "chương 45–50", hoặc undefined khi chưa mở. */
export function nhanPhamVi(b: LaneBlock): string | undefined {
  if (b.from && b.to) {
    return b.from === b.to ? `chương ${b.from}` : `chương ${b.from}–${b.to}`;
  }
  return undefined;
}

/**
 * Phạm vi dạng gọn cho chữ TRONG khối: "1–18".
 *
 * Khối hẹp nhất trên trục chỉ hơn 100px, mà "T1 · chương 1–18" ở 10.5px mono
 * cần nhiều hơn thế nên bị cắt thành "T1 · chương …" — mất đúng phần mang tin.
 * Lane đã có nhãn "Tập"/"Cung" bên trái nên chữ "chương" trong khối là dư.
 * Dạng dài vẫn còn trong chú giải khi trỏ chuột.
 */
export function phamViGon(b: LaneBlock): string | undefined {
  if (b.from && b.to) {
    return b.from === b.to ? `${b.from}` : `${b.from}–${b.to}`;
  }
  return undefined;
}
