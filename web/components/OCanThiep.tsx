'use client';

import { useEffect, useRef, useState } from 'react';

import { LoiApi, canThiep } from '@/lib/api';
import { CHU, GIAI_THICH } from '@/lib/nhan';
import type { Capabilities } from '@/lib/types';

import { BieuTuong } from './BieuTuong';

/**
 * Ô can thiệp — người vận hành nói vào dây chuyền.
 *
 * # Ô này từng bị vô hiệu, và lý do đã hết hiệu lực
 *
 * Bản trước vô hiệu hóa ô nhập vì "engine sở hữu quyền ghi; serve ghi vào cùng tệp thì
 * hai process cùng sửa `meta/run_meta.json` và ý kiến can thiệp sẽ mất trắng". Lý lẽ đó
 * đúng với tiền đề của nó, và tiền đề đã đổi: engine chạy TRONG process studio nên chỉ
 * còn một người ghi. `capabilities.steer` giờ nói đúng sự thật đó — server đặt nó theo
 * việc có mắc nhóm route ghi hay không — và ô này vẫn theo cờ như nó vẫn làm, nên khi
 * studio chạy ngoài loopback (đường ghi tắt) nó tự trở lại vô hiệu.
 *
 * Lo ngại cũ vẫn đúng và KHÔNG bị bỏ qua: vẽ một ô nhập hoạt động rồi gửi vào hư không là
 * lỗi tệ nhất ở đây. Nên ô chỉ hoạt động khi cờ bật, và mọi lỗi từ server được hiện nguyên
 * văn thay vì nuốt.
 *
 * # Vì sao MỘT ô cho ba việc
 *
 * Server tự chọn `Steer` (đang chạy → tiêm vào lượt hiện tại) hay `Continue` (đã dừng →
 * đánh thức lượt mới) theo trạng thái engine, đúng như TUI dùng một ô nhập cho cả ba ca.
 * Hai ô riêng sẽ buộc người vận hành phải biết engine đang ở trạng thái nào TRƯỚC khi gõ —
 * thứ mà họ mở studio ra để biết.
 *
 * Nhưng nhãn nút thì nói TRƯỚC câu này sẽ thành gì, vì hai việc khác nhau về hệ quả: tiêm
 * vào lượt đang chạy có thể làm chương đang viết bị xếp lại vào hàng chờ, còn đánh thức là
 * bắt đầu một lượt mới và tiêu tiền.
 */
/** id của ô góp ý — nút "Viết thêm" ở thanh dưới đưa con trỏ vào đây. */
export const O_GOP_Y = 'o-gop-y';

const SU_KIEN_GOP_Y = 'ainovel:mo-gop-y';

/**
 * Mở ô góp ý từ chỗ khác trên màn hình — điền sẵn chữ, đặt con trỏ, kèm một câu nói hệ quả.
 *
 * Ô này là ô góp ý DUY NHẤT. Bản trước cửa nghiệm thu mở thêm một ô của riêng nó ngay trong dải
 * tím, cùng nhãn nút "Gửi góp ý và viết tiếp" với ô này ở cuối trang: hai ô làm cùng một việc
 * trên một màn hình, người dùng không biết gõ vào đâu — và ô thứ hai còn không nhận con trỏ, không
 * có chữ gợi ý. Giờ nút của cửa chỉ gọi hàm này.
 */
export function moGopY(y: { chu?: string; giai?: string } = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SU_KIEN_GOP_Y, { detail: y }));
}

export function OCanThiep({
  capabilities,
  tacPham,
  dangChay,
  daXong = false,
  onDoi,
}: {
  capabilities: Capabilities;
  /** Truyện đã kết: ô này thành ô "viết thêm gì" — câu gửi đi là hướng mở lại truyện. */
  daXong?: boolean;
  tacPham: string | undefined;
  dangChay?: boolean;
  /**
   * Nạp lại snapshot sau khi gửi. Trước bản này ô can thiệp cố ý KHÔNG có nó, và lý lẽ cũ là
   * "can thiệp xếp một ý kiến vào hàng chờ mà không đổi trạng thái cửa nào".
   *
   * Vế đó đúng về CỬA và sai về màn hình: câu vừa gửi đi thẳng vào `snapshot.pending_steer`,
   * mà trường đó là thứ dải trạng thái vẽ ở ô "việc tồn". Không nạp lại thì câu ấy chỉ hiện
   * khi có nhịp snapshot kế tiếp — và nhịp đó do DÒNG SỰ KIỆN đẻ ra, nên ở đúng ca hay dùng ô
   * này nhất (engine đang nghỉ, người vận hành gõ một câu rồi đánh thức lượt mới) không có
   * nhịp nào cả. Người dùng gõ xong, thấy một câu "đã đánh thức" và không gì khác đổi.
   *
   * `lamMoi` chứ không `taiLai`: nạp lại bằng đường tải-lại-cả-trang sẽ xóa trắng bộ đệm văn
   * sống ngay giữa lúc engine đang viết — xem chú thích của `lamMoi` trong `useStudio.ts`.
   */
  onDoi?: () => void;
}) {
  const bat = capabilities.steer && !!tacPham;
  const [chu, datChu] = useState('');
  const [dangGui, datDangGui] = useState(false);
  const [loi, datLoi] = useState<string | null>(null);
  const [daLam, datDaLam] = useState<'steer' | 'continue' | 'reopen' | null>(null);
  // Câu nói hệ quả do nơi mở ô gửi kèm (vd. cửa duyệt: "Điều phối xem góp ý ảnh hưởng tới đâu…").
  const [giai, datGiai] = useState<string | null>(null);
  const oRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const nghe = (e: Event) => {
      const y = (e as CustomEvent<{ chu?: string; giai?: string }>).detail ?? {};
      if (y.chu !== undefined) datChu(y.chu);
      datGiai(y.giai ?? null);
      datLoi(null);
      datDaLam(null);
      const o = oRef.current;
      if (!o) return;
      o.focus();
      o.scrollIntoView?.({ block: 'nearest' });
    };
    window.addEventListener(SU_KIEN_GOP_Y, nghe);
    return () => window.removeEventListener(SU_KIEN_GOP_Y, nghe);
  }, []);

  const gui = () => {
    if (!tacPham || !chu.trim()) return;
    datDangGui(true);
    datLoi(null);
    datDaLam(null);
    canThiep(tacPham, chu.trim())
      .then((r) => {
        datDaLam(r.applied);
        datChu('');
        datGiai(null);
        onDoi?.();
      })
      .catch((e: unknown) => datLoi(e instanceof LoiApi ? e.message : String(e)))
      .finally(() => datDangGui(false));
  };

  return (
    <>
      <div className="steerbox">
        <BieuTuong ten="gopY" co={16} />
        <input
          ref={oRef}
          id={O_GOP_Y}
          type="text"
          placeholder={daXong ? CHU.viDuVietThem : CHU.viDuCanThiep}
          aria-label={CHU.canThiep}
          aria-describedby="vi-sao-can-thiep"
          // Câu đầy đủ vào `title` vì ở ca dùng được nó đã bị ẩn khỏi màn hình — xem chú
          // thích của `<p id="vi-sao-can-thiep">` dưới đây. Chỉ đặt ở ca ấy: lúc câu đang
          // hiện ra thì một `title` lặp lại nguyên văn nó là một chú giải nói lại thứ đang
          // đọc được.
          title={bat ? GIAI_THICH.canThiepArbiterXuLy : undefined}
          value={chu}
          onChange={(e) => datChu(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              gui();
            }
          }}
          disabled={!bat || dangGui}
          readOnly={!bat}
        />
        <button type="button" onClick={gui} disabled={!bat || dangGui || !chu.trim()}>
          {dangGui
            ? CHU.dangGui
            : daXong
              ? CHU.vietThemTheoHuong
              : dangChay
                ? CHU.tiemVaoLuotDangChay
                : CHU.danhThucLuotMoi}
          <BieuTuong ten="mui" co={14} />
        </button>
      </div>

      {loi ? <p className="loiDoc">{loi}</p> : null}
      {giai && !daLam ? <p className="steerhint">{giai}</p> : null}
      {daLam ? (
        <p className="steerhint">
          {daLam === 'steer'
            ? GIAI_THICH.daTiemVaoLuot
            : daLam === 'reopen'
              ? GIAI_THICH.daMoLaiVietThem
              : GIAI_THICH.daDanhThuc}
        </p>
      ) : null}

      {/* Câu giải thích CHỈ hiện khi nó nói điều cần biết lúc này.
          ĐO ĐƯỢC: khối này cao 43px trong một ô can thiệp 98px, và ô can thiệp ăn thẳng vào
          bốn ô của bàn ngay trên — người dùng nói nguyên văn: *"phần này chiếm quá nhiều
          diện tích làm 4 session ở trên bé quá"*.

          Hai ca, hai giá trị khác hẳn nhau:
            · ô BỊ VÔ HIỆU — câu này là chỗ DUY NHẤT nói vì sao ô nhập không gõ được và phải
              làm gì để mở nó. Bỏ đi là để lại một ô chết không lời giải thích, đúng thứ
              `PRODUCT.md` cấm ("nói rõ lỗi gì và làm gì tiếp").
            · ô ĐANG DÙNG ĐƯỢC — câu "Arbiter phân loại phạm vi ảnh hưởng rồi xếp các chương
              bị tác động vào hàng chờ viết lại" là văn giới thiệu: đọc một lần rồi thành đồ
              đạc, và nó đứng dưới mắt suốt phiên để tốn 43px mỗi lần vẽ.

          `hidden` chứ không thôi render: `aria-describedby` của ô nhập trỏ vào đúng id này,
          và một `describedby` trỏ vào phần tử không tồn tại là ô nhập mất mô tả với trình
          đọc màn hình. `hidden` giữ nó trong cây trợ năng cho phép tra cứu đó mà không tốn
          pixel nào — cùng lối mà nút `replay` của nhật ký phán quyết đã dùng.
          Cả câu vẫn nằm trong `title` của ô nhập, nên chuột cũng tra được. */}
      <p className="steerhint" id="vi-sao-can-thiep" hidden={bat}>
        {bat ? (
          GIAI_THICH.canThiepArbiterXuLy
        ) : (
          <>
            <strong>{GIAI_THICH.canThiepChoDay}.</strong> {GIAI_THICH.canThiepTat}
          </>
        )}
      </p>
    </>
  );
}
