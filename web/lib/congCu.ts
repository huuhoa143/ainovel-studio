/**
 * Tên công cụ của engine → việc người dùng đọc được.
 *
 * Dòng sự kiện TOOL mang nguyên tên hàm (`novel_context(chương 3)`, `save_foundation[world_rules]`,
 * `read_chapter(chương 3·bản nháp)`). Đó là dữ liệu của engine, đúng, nhưng giữa một màn hình
 * tiếng Việt nó đọc như mã lỗi. Một bảng duy nhất cho Diễn biến, thanh dưới và thẻ đang làm —
 * ba chỗ không bao giờ dịch cùng một công cụ thành ba câu khác nhau. Tên lạ trả `undefined` để
 * nơi gọi giữ nguyên văn: đoán sai một việc tệ hơn để nguyên tên.
 */

import { CONG_CU } from '@/lib/chu/tien-do';

const MAU = /^\s*([a-z][a-z0-9_]*)\s*(?:\[([^\]]*)\])?\s*(?:\(([^)]*)\))?\s*$/i;

export function giaiCongCu(tho: string | undefined): string | undefined {
  if (!tho) return undefined;
  const m = MAU.exec(tho);
  if (!m) return undefined;
  const ten = m[1]!.toLowerCase();
  const phan = m[2]?.trim();
  const ngoac = m[3] ?? '';
  const so = /chương\s*(\d+)/i.exec(ngoac);
  const c = so ? Number(so[1]) : undefined;
  const nhap = /nháp|draft/i.test(ngoac);
  switch (ten) {
    case 'audit_foundation':
      return CONG_CU.soatNen;
    case 'novel_context':
      return CONG_CU.docTaiLieu(c);
    case 'save_foundation':
      return CONG_CU.luuNen(phan ? CONG_CU.phanNen[phan] : undefined);
    case 'plan_chapter':
      return CONG_CU.keHoach(c);
    case 'draft_chapter':
      return CONG_CU.vietNhap(c);
    case 'check_consistency':
      return CONG_CU.soatNhatQuan(c);
    case 'commit_chapter':
      return CONG_CU.chot(c);
    case 'read_chapter':
      return CONG_CU.docLai(c, nhap);
    case 'save_review':
      return CONG_CU.luuNhanXet(c);
    case 'edit_chapter':
      return CONG_CU.sua(c);
    case 'revise_outline':
      return CONG_CU.suaDanY;
    case 'save_arc_summary':
      return CONG_CU.tomTatHoi;
    case 'save_volume_summary':
      return CONG_CU.tomTatTap;
    case 'ask_user':
      return CONG_CU.hoiBan;
    case 'reopen_book':
      return CONG_CU.moLai;
    default:
      return undefined;
  }
}
