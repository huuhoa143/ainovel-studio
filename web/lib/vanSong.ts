import { CHU } from './nhan';

/**
 * Bộ đệm VĂN SỐNG phía client — chữ model đang sinh ra, đã nhận qua SSE.
 *
 * Đây là bộ đệm THỨ HAI, và hai bộ đệm giữ hai thứ khác nhau — đừng lẫn:
 *
 *   - **Server** (`internal/serve/dong_van.go`) giữ đúng LƯỢT HIỆN TẠI, trần 512KB, cắt từ
 *     đầu. Nó chỉ cần đủ cho người mở trang GIỮA một lượt.
 *   - **Client** (tệp này) giữ 3 lượt gần nhất để đọc lại được đoạn vừa trôi qua.
 *
 * Trần đôi là cố ý. Chỉ đếm lượt thì một lượt Writer bằng cả chương vẫn phình tới hàng chục
 * MB. Chỉ đếm byte thì một lượt dài đẩy hết lượt trước ra và mất luôn vạch ngăn — tức mất
 * đúng thứ làm người đọc biết mình đang ở lượt nào.
 */

/** Một lượt máy nói: từ lệnh xóa này tới lệnh xóa kế tiếp. */
export interface LuotVan {
  /**
   * Số thứ tự tăng dần, KHÔNG dùng lại sau khi lượt bị bỏ.
   *
   * Dùng làm `key` của React. Chỉ số mảng thì không được: khi lượt cũ nhất bị bỏ, mọi chỉ số
   * dịch xuống một bậc, React coi đó là "nội dung của phần tử 0 vừa đổi" và giữ nguyên nút
   * DOM — trong một khu đang tự cuộn thì đó là một cú nhảy vị trí ngay giữa lúc đọc.
   */
  id: number;
  /** Nhãn vạch ngăn mở đầu lượt. `undefined` cho lượt đầu tiên của phiên xem. */
  nhan?: string;
  chu: string;
}

export interface BoDemVan {
  luot: LuotVan[];
  /** id sẽ cấp cho lượt kế tiếp. */
  idKe: number;
}

export const BO_DEM_RONG: BoDemVan = { luot: [], idKe: 1 };

/** Số lượt giữ lại. Người dùng cần đối chiếu lượt này với lượt trước, không cần cả phiên. */
export const SO_LUOT_GIU = 3;

/**
 * Lượt "văn" — đủ dài để là chữ của chương, không phải tham số công cụ. Sau lượt viết nháp,
 * engine phát liền vài lượt ngắn (`✻ check_consistency`, `✻ commit_chapter`, `plan` của
 * chương sau, mỗi lượt vài trăm ký tự). Chỉ đếm lượt thì ba lượt ngắn đó đẩy chương vừa viết
 * ra khỏi bộ đệm sau vài giây — khu "AI đang viết" còn lại toàn tham số. Độ dài chỉ lọc lời
 * nói ngắn của model; lượt công cụ dài (tham số kế hoạch) bị loại bằng `loaiLuot`, không bằng
 * độ dài.
 */
export const DO_DAI_LUOT_VAN = 1500;

/**
 * Dấu ngăn đoạn SUY NGHĨ của model với văn nó viết ra.
 *
 * Engine đặt dấu này (`internal/utils.ThinkingSep`), và nó là CÔNG TẮC chứ không phải nhãn:
 * đoạn sau dấu thứ nhất là suy nghĩ, sau dấu thứ hai là văn trở lại, cứ thế đổi vai. TUI đã
 * đọc dấu này từ đầu (`panels_activity.go`) và vẽ suy nghĩ bằng chữ mờ nghiêng.
 *
 * Web thì CHƯA, và cái lỗ đó đo được trên truyện thật: `\x02` không vẽ ra ký tự nào, nên khu
 * "Đoạn viết gần nhất" nối thẳng "Let me re-check the consistency, then commit…" vào cuối
 * chương bằng ĐÚNG kiểu chữ serif khổ đọc của văn truyện. Người đọc không có cách nào biết
 * câu đó không phải của truyện.
 */
export const DAU_NGHI = '\x02';

/** Một đoạn trong lượt: văn của truyện, hay tiếng model tự nhủ. */
export interface DoanVan {
  nghi: boolean;
  chu: string;
}

/**
 * Tách một lượt thành các đoạn theo `DAU_NGHI`. Đoạn lẻ là suy nghĩ — cùng luật với TUI.
 *
 * Đoạn rỗng bị bỏ: hai dấu liền nhau là ca hợp lệ (model mở rồi đóng suy nghĩ mà không nói
 * gì), và một đoạn rỗng vẽ ra là một khối trống không nói gì cả.
 */
export function tachNghi(chu: string): DoanVan[] {
  if (!chu.includes(DAU_NGHI)) return chu === '' ? [] : [{ nghi: false, chu }];
  return chu
    .split(DAU_NGHI)
    .map((c, i) => ({ nghi: i % 2 === 1, chu: c }))
    .filter((d) => d.chu !== '');
}

/**
 * Chỉ phần VĂN của lượt, bỏ hết suy nghĩ.
 *
 * Mọi phép đoán về lượt — nó là văn hay bước công cụ, nó đủ dài để giữ lại chưa — phải hỏi
 * hàm này chứ không hỏi `l.chu` thô. Một lượt mở bằng suy nghĩ thì ký tự đầu của `l.chu` là
 * `\x02`, không phải `✻`, nên phép thử thô coi cả lượt công cụ ấy là văn. Và một lượt chỉ
 * toàn suy nghĩ dài 2000 ký tự sẽ chiếm chỗ của bản nháp thật trong bộ đệm ba lượt.
 */
export function vanThuan(chu: string): string {
  return tachNghi(chu)
    .filter((d) => !d.nghi)
    .map((d) => d.chu)
    .join('');
}

/**
 * Lượt này là VĂN (chữ của truyện) hay một BƯỚC CÔNG CỤ — MỘT phép phân loại cho cả bộ đệm và
 * khu hiển thị.
 *
 * Dựa trên dấu engine tự đặt, không đoán theo hình: mọi lượt công cụ đều mở bằng tiêu đề "✻ …"
 * (bảng `toolDisplays` và `streamHeaderFallback` ở internal/host), còn `draft_chapter` — đường
 * duy nhất chở văn truyện — phát trần nội dung, không tiêu đề. Đoán theo hình thì trượt: tham
 * số `plan_chapter` được engine vẽ thành các dòng `characters: / event: / time:`, không có dấu
 * ngoặc kép nào, nên phép thử JSON cũ coi nó là văn và in bằng chữ serif khổ đọc — đo được
 * trên truyện thật, khu "Đoạn viết gần nhất" chỉ toàn tham số kế hoạch.
 */
export function loaiLuot(chu: string): 'van' | 'congCu' {
  const dau = vanThuan(chu).trimStart();
  if (dau.startsWith('✻')) return 'congCu';
  const k = dau.slice(0, 1);
  return k === '{' || k === '[' ? 'congCu' : 'van';
}

/** Tiêu đề và thân của một lượt công cụ: "✻ Lên kế hoạch chương\n…" → ["Lên kế hoạch chương", "…"]. */
export function tachCongCu(chu: string): { tieuDe: string; than: string } {
  const dau = vanThuan(chu).trimStart();
  if (!dau.startsWith('✻')) return { tieuDe: '', than: chu };
  const xuong = dau.indexOf('\n');
  const dong = xuong < 0 ? dau : dau.slice(0, xuong);
  return { tieuDe: dong.replace(/^✻\s*/, '').trim(), than: xuong < 0 ? '' : dau.slice(xuong + 1) };
}

/** Lượt văn đủ dài để giữ lại — xem `DO_DAI_LUOT_VAN`. */
const laVanDai = (l: LuotVan) =>
  loaiLuot(l.chu) === 'van' && vanThuan(l.chu).length >= DO_DAI_LUOT_VAN;

/** Trần tổng byte của cả bộ đệm. Cùng con số với trần của server, vì cùng một lý do. */
export const CO_TOI_DA = 512 * 1024;

/** Thêm một mẩu chữ vào lượt đang mở. Mở lượt đầu nếu bộ đệm còn rỗng. */
export function themChu(bd: BoDemVan, chu: string): BoDemVan {
  if (!chu) return bd;
  const luot = bd.luot.slice();
  const cuoi = luot[luot.length - 1];
  if (!cuoi) {
    // Mẩu tới trước lệnh xóa nào cả. Server LUÔN gửi `stream_clear` trước lúc nối, nên ca này
    // chỉ xảy ra khi engine mở giữa chừng — vẫn phải giữ chữ, không được bỏ.
    return cat({ luot: [{ id: bd.idKe, chu }], idKe: bd.idKe + 1 });
  }
  luot[luot.length - 1] = { ...cuoi, chu: cuoi.chu + chu };
  return cat({ luot, idKe: bd.idKe });
}

/**
 * Mở một lượt mới — phản ứng với `stream_clear`.
 *
 * Tên hàm là "mở lượt", không phải "xóa": ở TUI lệnh này XÓA sạch khu chữ, còn ở đây nó thành
 * một vạch ngăn. Trình duyệt giỏi đúng cái terminal dở — cuộn lại được — nên vứt đi phần vừa
 * đọc là bỏ phí một khả năng, và người dùng đã chọn phương án vạch ngăn.
 *
 * Lượt đang mở mà RỖNG thì thay nhãn của nó chứ không xếp thêm một lượt nữa: hai sentinel
 * liền nhau là ca hợp lệ, và một lượt rỗng vẽ ra là một vạch ngăn không ngăn gì cả.
 */
export function moLuot(bd: BoDemVan, nhan?: string): BoDemVan {
  const cuoi = bd.luot[bd.luot.length - 1];
  if (cuoi && cuoi.chu === '') {
    const luot = bd.luot.slice();
    luot[luot.length - 1] = { ...cuoi, nhan };
    return { luot, idKe: bd.idKe };
  }
  return cat({
    luot: [...bd.luot, { id: bd.idKe, nhan, chu: '' }],
    idKe: bd.idKe + 1,
  });
}

/**
 * Nhãn của một vạch ngăn: lượt này thuộc chương nào, mở lúc mấy giờ.
 *
 * Chương có thể chưa biết (`in_progress_chapter` là `null` khi không có chương nào đang
 * soạn). Lúc đó nhãn chỉ có giờ — bịa một số chương vào một vạch ngăn là gán sai cả một đoạn
 * văn cho một chương.
 */
export function nhanVach(chuong: number | undefined, luc: Date): string {
  const gio = `${String(luc.getHours()).padStart(2, '0')}:${String(luc.getMinutes()).padStart(2, '0')}`;
  return chuong === undefined ? gio : `${CHU.chuong.toLowerCase()} ${chuong} · ${gio}`;
}

/**
 * Cắt bộ đệm theo HAI trần: số lượt và tổng byte. Cái nào chạm trước thì cái đó cắt.
 *
 * Thứ tự cố ý: bỏ lượt cũ nhất TRƯỚC, và chỉ khi chỉ còn một lượt mà vẫn quá trần thì mới cắt
 * chữ bên trong nó. Ngược lại — cắt chữ trước — sẽ gọt mất phần đầu của một lượt cũ mà lẽ ra
 * chỉ cần bỏ cả lượt, tức để lại một lượt cụt đầu vô nghĩa.
 *
 * Không bao giờ bỏ lượt CUỐI. Trần chạm được trong lúc engine đang phát, và một khu trống ở
 * vị trí đắt nhất của màn hình đúng lúc máy đang nói là hỏng nặng hơn cả việc phình bộ đệm.
 */
function cat(bd: BoDemVan): BoDemVan {
  let luot = bd.luot;

  if (luot.length > SO_LUOT_GIU) {
    const giu = luot.slice(luot.length - SO_LUOT_GIU);
    // Lượt văn gần nhất không bị đẩy ra bởi các lượt công cụ ngắn tới sau nó.
    if (!giu.some(laVanDai)) {
      const bo = luot.slice(0, luot.length - SO_LUOT_GIU);
      const van = [...bo].reverse().find(laVanDai);
      luot = van ? [van, ...giu] : giu;
    } else {
      luot = giu;
    }
  }

  let tong = luot.reduce((n, l) => n + l.chu.length, 0);
  while (tong > CO_TOI_DA && luot.length > 1) {
    tong -= luot[0]!.chu.length;
    luot = luot.slice(1);
  }

  // Chỉ còn một lượt mà vẫn quá trần: cắt từ ĐẦU chữ của nó. Phần cuối là phần đang chảy.
  const cuoi = luot[luot.length - 1];
  if (luot.length === 1 && cuoi && cuoi.chu.length > CO_TOI_DA) {
    luot = [{ ...cuoi, chu: catDau(cuoi.chu, CO_TOI_DA) }];
  }

  return luot === bd.luot ? bd : { luot, idKe: bd.idKe };
}

/**
 * Cắt `n` ký tự cuối của một lượt, GIỮ NGUYÊN vai của từng đoạn.
 *
 * `DAU_NGHI` là công tắc, nên cắt đầu có thể nuốt mất dấu MỞ của một đoạn suy nghĩ và để lại
 * dấu ĐÓNG. Từ đó mọi đoạn phía sau đảo vai: văn bị vẽ thành suy nghĩ và ngược lại — hỏng im
 * lặng, vì chữ vẫn còn đủ. Đếm dấu trong phần bỏ đi; lẻ thì mở lại một dấu ở đầu phần giữ.
 */
export function catDau(chu: string, n: number): string {
  if (chu.length <= n) return chu;
  const giu = chu.slice(chu.length - n);
  const bo = chu.slice(0, chu.length - n);
  const le = (bo.split(DAU_NGHI).length - 1) % 2 === 1;
  return le ? DAU_NGHI + giu : giu;
}
