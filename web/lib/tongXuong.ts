'use client';

import { useEffect, useState } from 'react';

import { giaiLoi } from '@/lib/loiLlm';

import { layTongXuong } from './api';
import type { Book, TongXuongDoc, TongXuongSach } from './types';

/**
 * Tờ tổng của cả xưởng — `GET /api/workshop/cost`.
 *
 * # Vì sao nó KHÔNG được dò lại theo chu kỳ
 *
 * `/api/workshop` bị dò lại đều đặn (bộ chọn tác phẩm và slate đọc nó). Tờ này thì không:
 * mỗi lượt gọi đọc `meta/usage.json` + `meta/run.json` của TỪNG cuốn, tức hai tệp mỗi cuốn.
 * Trên một xưởng mười cuốn đó là hai mươi lượt đọc đĩa cho một dải mà phần lớn thời gian
 * không đổi.
 *
 * Nó nạp lại khi SỐ CUỐN đổi — tức lúc người dùng tạo hoặc nhập một tác phẩm, đúng lúc dải
 * việc-cần-bạn thật sự có thứ mới để nói. Chi phí trong lúc engine chạy thì đã có transport
 * nói theo thời gian thực cho cuốn đang mở, nên tờ này không phải đuổi theo nó.
 *
 * # Lỗi ở đây KHÔNG được làm sập bề mặt
 *
 * Cùng lối với `layHoSo`: route này có thể vắng mặt ở một binary engine cũ hơn bản web, và
 * lúc đó cả studio vẫn phải dùng được. `du === undefined` thì mọi chỗ đọc nó tự có nhánh
 * không-có-số — không chỗ nào được vẽ một con số 0 thay cho một phép đo chưa có.
 */
export interface TaiTongXuong {
  du: TongXuongDoc | undefined;
  loi: string | undefined;
  dangTai: boolean;
}

export function useTongXuong(soSach: number): TaiTongXuong {
  const [tt, datTt] = useState<TaiTongXuong>({
    du: undefined,
    loi: undefined,
    dangTai: true,
  });

  useEffect(() => {
    // Xưởng rỗng thì không có gì để cộng, và gọi route sẽ trả một tờ rỗng — nhưng nó vẫn là
    // một lượt mạng cho một câu đã biết trước câu trả lời.
    if (soSach === 0) {
      datTt({ du: undefined, loi: undefined, dangTai: false });
      return;
    }
    let huy = false;
    datTt((t) => ({ ...t, dangTai: true }));
    layTongXuong()
      .then((du) => {
        if (!huy) datTt({ du, loi: undefined, dangTai: false });
      })
      .catch((e: unknown) => {
        if (huy) return;
        datTt({
          du: undefined,
          loi: e instanceof Error ? e.message : String(e),
          dangTai: false,
        });
      });
    return () => {
      huy = true;
    };
  }, [soSach]);

  return tt;
}

/**
 * Cuốn này có việc đã ký chờ người vận hành không.
 *
 * Chỉ hai trường, và cả hai đọc từ `meta/run.json`, tức từ ĐĨA:
 *
 *   · `advance_hold`  — một mốc tạm dừng đã ký mà engine chưa tiêu thụ
 *   · `pending_steer` — một ý kiến can thiệp đã ký mà engine chưa xử lý
 *
 * `advance_mode === 'review'` KHÔNG tính, và đây là chỗ dễ sai nhất của cả tệp. Chế độ
 * nghiệm thu là một CHẾ ĐỘ, không phải một việc tồn: một cuốn chạy ở chế độ đó suốt đời nó
 * và không có gì đang chờ ai. Tính nó vào thì dấu amber trên hàng "Quản lý" sáng vĩnh viễn,
 * và một dấu luôn sáng là một dấu không ai nhìn nữa.
 */
export function sachCanBan(s: TongXuongSach): boolean {
  return s.advance_hold || s.pending_steer;
}

export function coViecCanBan(du: TongXuongDoc): boolean {
  return du.books.some(sachCanBan);
}

/** Một việc đang chờ, đã ghép với cuốn của nó. */
export interface ViecCanBan {
  sach: Book;
  /** Ý định đã ký. Có thể mang cả hai. */
  tamDung: boolean;
  canThiep: boolean;
  /** Engine tự dừng vì lỗi (bế tắc, hết ngân sách) — việc cần người, không phải ý định đã ký. */
  tuDung?: boolean;
  lyDo?: string;
}

/**
 * Ghép tờ tổng với danh sách cuốn để ra các việc đang chờ.
 *
 * Ghép theo `id`, KHÔNG theo chỉ số. Hai tờ hôm nay cùng thứ tự — cả hai đi qua
 * `scanWorkshop`, và có một bài kiểm Go canh đúng điều đó — nhưng ghép theo vị trí là buộc
 * một bất biến của server vào một vòng lặp ở web, và nó sẽ hỏng lặng lẽ vào ngày một trong
 * hai route đổi cách xếp. Ghép sai ở đây nghĩa là gán việc tồn của cuốn A cho cuốn B.
 */
export function vieccanBanCuaXuong(
  du: TongXuongDoc | undefined,
  sach: Book[],
): ViecCanBan[] {
  const theoID = new Map(sach.map((b) => [b.id, b]));
  const ra: ViecCanBan[] = [];
  for (const s of du?.books ?? []) {
    if (!sachCanBan(s)) continue;
    const b = theoID.get(s.id);
    // Cuốn có trong tờ tổng mà không có trong danh sách là một ca thật, dù hiếm: hai lượt
    // gọi ở hai thời điểm, và một cuốn có thể bị xóa khỏi đĩa ở giữa. Bỏ qua thay vì dựng
    // một dòng mang mỗi cái id — một dòng như thế không bấm vào đâu được.
    if (!b) continue;
    ra.push({
      sach: b,
      tamDung: s.advance_hold,
      canThiep: s.pending_steer,
      lyDo: s.advance_hold_reason,
    });
  }
  // Cuốn có phiên đang mở mà engine TỰ dừng: lời chào từng nói "chưa có việc nào cần bạn" ngay
  // trên một cuốn đứng im vì cổng model hết tuyến.
  for (const b of sach) {
    const d = b.stop;
    if (!d || (d.kind !== 'stuck' && d.kind !== 'budget')) continue;
    const loi = giaiLoi(d.last_error, { vai: d.last_error_agent });
    const co = ra.find((v) => v.sach.id === b.id);
    if (co) {
      co.tuDung = true;
      co.lyDo = loi?.cau ?? d.reason;
    } else {
      ra.push({ sach: b, tamDung: false, canThiep: false, tuDung: true, lyDo: loi?.cau ?? d.reason });
    }
  }
  return ra;
}

/**
 * Tổng số tiền, kèm MẪU SỐ của nó.
 *
 * Trả cả `counted` và `tong` vì con số tiền một mình nói dối. Đo trên xưởng thật: `$7,37`
 * với `counted: 1` trên ba cuốn — hai cuốn kia chưa có `meta/usage.json` nên không có gì để
 * cộng. Một dải tổng ghi "$7,37 đã tiêu" mà không nói mẫu số sẽ được đọc thành "cả xưởng
 * tốn có thế".
 */
export interface TienXuong {
  chiPhi: number;
  tietKiem: number;
  demDuoc: number;
  tongSach: number;
  /** Số lượt mô hình không trả usage. Lớn thì mọi con số trên đây đều thiếu một phần. */
  thieuUsage: number;
}

export function tienCuaXuong(du: TongXuongDoc | undefined): TienXuong | undefined {
  if (!du) return undefined;
  return {
    chiPhi: du.overall.cost_usd,
    tietKiem: du.overall.saved_usd,
    demDuoc: du.counted,
    tongSach: du.books.length,
    thieuUsage: du.missing_assistant_usage,
  };
}
