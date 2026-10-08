'use client';

import { TU_TRUYEN as T } from '@/lib/chu/tu-truyen';
import { CHU, GIAI_THICH } from '@/lib/nhan';

import { BieuTuong } from './BieuTuong';

/**
 * Không đọc được store.
 *
 * Câu lỗi lấy từ server (`writeErr` trả `{"error": "..."}`) chứ không phải câu chung của giao
 * diện: server biết rõ hơn — thiếu meta/progress.json, tên tác phẩm không hợp lệ, hay đường
 * dẫn ra ngoài thư mục gốc.
 */
export function KhongTaiDuoc({ loi, onThuLai }: { loi: string; onThuLai: () => void }) {
  return (
    <main className="trangtrong ttLoi">
      <div className="ttHop the" role="alert">
        <span className="ttDau" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.5v5.5M12 16.5h.01" />
          </svg>
        </span>
        <h1>{GIAI_THICH.khongTaiDuoc}</h1>
        <p className="loi">{loi}</p>
        <p>{GIAI_THICH.khongTaiDuocViSao}</p>
        <button type="button" className="nutChinh" onClick={onThuLai}>
          <BieuTuong ten="vietLai" co={14} />
          {T.thuMoLai}
        </button>
      </div>
    </main>
  );
}

/** Khoảng chờ đầu tiên. Một dòng kèm một vòng quay nhỏ, không có khối xám nhấp nháy. */
export function DangTai() {
  return (
    <main className="trangtrong ttTai" aria-busy="true">
      <p role="status">
        <span className="ttQuay" aria-hidden="true" />
        <span>
          <b>{CHU.dangTai}</b>
          <span className="phu">{T.dangTaiPhu}</span>
        </span>
      </p>
    </main>
  );
}
