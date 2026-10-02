/**
 * Biên tập viên chấm ĐỊNH KỲ, không chấm từng chương.
 *
 * Cùng luật với `flow.Route` phía server: truyện thường chấm mỗi `domain.ReviewInterval` (5)
 * chương đã xong; truyện phân tầng chấm ở cuối mỗi hồi. Giao diện từng hứa "Biên tập viên nhận
 * xét sau khi chương được chốt" — sai: một truyện 3 chương thật hoàn tất mà không có nhận xét
 * nào, và câu hứa ấy làm người dùng nghĩ có gì đó hỏng.
 */

import { NHAN_XET_DINH_KY } from '@/lib/chu/doc-duyet';
import type { Snapshot } from '@/lib/types';

/** `domain.ReviewInterval` phía server. */
export const CHU_KY_BIEN_TAP = 5;

function phanTang(snap: Snapshot): boolean {
  return !!snap.capabilities.layered_outline && (snap.timeline.arcs?.length ?? 0) > 0;
}

/** Đã tới lượt Biên tập viên chấm chưa, tính theo số chương vừa xong. */
export function denLuotBienTap(snap: Snapshot): boolean {
  const xong = snap.book.completed_chapters;
  if (xong <= 0) return false;
  if (phanTang(snap)) return (snap.timeline.arcs ?? []).some((h) => h.to === xong);
  return xong % CHU_KY_BIEN_TAP === 0;
}

/** Câu giải thích vì sao chưa có nhận xét — nói đúng nhịp chấm của truyện này. */
export function cauChuaCoNhanXet(snap: Snapshot): string {
  const b = snap.book;
  if (phanTang(snap)) return NHAN_XET_DINH_KY.cuoiHoi;
  if (b.phase === 'complete' && b.completed_chapters < CHU_KY_BIEN_TAP) {
    return NHAN_XET_DINH_KY.truyenNgan;
  }
  return `${NHAN_XET_DINH_KY.chuKy(CHU_KY_BIEN_TAP)} ${NHAN_XET_DINH_KY.chuaToiLuot}`;
}
