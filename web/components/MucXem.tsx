'use client';

import { CHU, GIAI_THICH, nhanMucXem } from '@/lib/nhan';
import { MUC_XEM, type MucXem as Muc, type PhamVi, phamViCua } from '@/lib/phamVi';
import type { Timeline } from '@/lib/types';
import { useTruot } from '@/lib/truot';

/**
 * Bộ chọn "Mức xem" — Tập / Cung / Chương, ở đầu vùng canvas như bản mockup.
 *
 * Nó tồn tại vì bảng chương chứa mọi chương có dấu vết sản xuất trên toàn tác
 * phẩm, không phải chương của một cung (xem lib/phamVi.ts). Trước khi có nó,
 * tiêu đề bảng nói "Chương trong cung 2" cho một danh sách rộng hơn thế.
 *
 * Mức nào chưa có phạm vi thì nút bị VÔ HIỆU kèm lý do, không phải biến mất:
 * biến mất thì người vận hành tưởng bề mặt thiếu chức năng, còn vô hiệu kèm lý
 * do thì họ biết đây là giới hạn của dữ liệu — engine chưa mở tập đó.
 */
export function MucXem({
  timeline,
  hienTai,
  onChon,
}: {
  timeline: Timeline;
  hienTai: Muc;
  onChon: (m: Muc) => void;
}) {
  /* Dấu chỉ TRƯỢT giữa Tập / Cung / Chương. Đo vị trí thật vì ba nhãn không bằng bề rộng. */
  const hop = useTruot<HTMLDivElement>('[aria-pressed="true"]', 'ngang', hienTai);

  return (
    <div ref={hop} className="mucxem" role="group" aria-label={CHU.mucXem} title={GIAI_THICH.mucXemGiai}>
      <span className="lbl">{CHU.mucXem}</span>
      {MUC_XEM.map((m) => {
        const pv = phamViCua(timeline, m);
        return (
          <button
            key={m}
            type="button"
            aria-pressed={m === hienTai}
            disabled={pv.khongRo}
            title={chuGiai(pv)}
            onClick={() => onChon(m)}
          >
            {nhanMucXem(m)}
          </button>
        );
      })}
    </div>
  );
}

/** Chú giải của một nút: phạm vi thật, hoặc lý do không lọc được. */
function chuGiai(pv: PhamVi): string {
  if (pv.khongRo) return `${nhanMucXem(pv.muc)} — ${GIAI_THICH.mucChuaMo}`;
  if (pv.from === undefined || pv.to === undefined) {
    return 'mọi chương đã viết';
  }
  return `chương ${pv.from}–${pv.to}`;
}
