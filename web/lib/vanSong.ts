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
 * ra khỏi bộ đệm sau vài giây — khu "AI đang viết" còn lại toàn tham số. Cả hai loại lượt
 * đều mở bằng tiêu đề "✻ …", nên phân biệt bằng độ dài chứ không bằng ký hiệu.
 */
export const DO_DAI_LUOT_VAN = 1500;

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
    if (!giu.some((l) => l.chu.length >= DO_DAI_LUOT_VAN)) {
      const bo = luot.slice(0, luot.length - SO_LUOT_GIU);
      const van = [...bo].reverse().find((l) => l.chu.length >= DO_DAI_LUOT_VAN);
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
    luot = [{ ...cuoi, chu: cuoi.chu.slice(cuoi.chu.length - CO_TOI_DA) }];
  }

  return luot === bd.luot ? bd : { luot, idKe: bd.idKe };
}
