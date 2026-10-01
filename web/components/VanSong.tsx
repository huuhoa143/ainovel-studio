'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { CHU, GIAI_THICH } from '@/lib/nhan';
import { dangODay } from '@/lib/tuCuon';
import type { BoDemVan } from '@/lib/vanSong';

/**
 * Khu VĂN SỐNG — chữ model đang sinh ra.
 *
 * # Serif cho văn, mono cho mã — tách theo TỪNG lượt
 *
 * ĐO ĐƯỢC trên `scripts/sample.gif` (255 khung): khu này không chỉ có văn truyện. Nó còn là
 * đối số JSON của lời gọi tool, danh mục khế ước tự đối chiếu có ✓, bảng kiểm chất lượng.
 * Bản đầu vẽ cả khu bằng mono vì thế; bản hệ giao diện 2 đổi sang serif vì lượt đáng xem
 * nhất ở đây là bản nháp Người viết đang viết, và đó là chữ của truyện.
 *
 * Nên lượt nào TRÔNG như dữ liệu (`laMa`: mở bằng `{`/`[`, hoặc dày dấu ngoặc kép-hai-chấm
 * của JSON) giữ mono cỡ nhỏ; còn lại là văn, serif khổ đọc. Phép thử thô và cố ý thô: sai
 * một lượt thì chỉ sai kiểu chữ, không mất chữ nào.
 *
 * # Vì sao vạch ngăn thay vì xóa
 *
 * TUI XÓA sạch khu này ở mỗi lượt vì terminal không cuộn lại được. Trình duyệt giỏi đúng chỗ
 * đó, nên vứt đi phần vừa đọc là bỏ phí. Trần giữ 3 lượt nằm ở `lib/vanSong.ts` cùng lý do.
 *
 * # Tên vùng đứng yên, tiêu đề thì đổi
 *
 * `aria-label` của section KHÔNG phải câu trạng thái, dù tiêu đề nhìn thấy được thì là. Lý do
 * đã trả giá một lần rồi và ghi ở `CHU.vttVung`: tên vùng là thứ trình đọc màn hình điều
 * hướng TỚI, nên đặt nó bằng câu trạng thái thì cây trợ năng đọc tên vùng rồi đọc lại y
 * nguyên câu ấy ở nội dung — và ở đây nó còn thành SAI hẳn khi máy chuyển sang nghỉ.
 */
export function VanSong({ boDem, dangChay }: { boDem: BoDemVan; dangChay: boolean }) {
  const thanRef = useRef<HTMLDivElement>(null);
  const [bamDay, datBamDay] = useState(true);

  // Giữ trong ref VÀ trong state: effect dưới đọc ref (không muốn chạy lại mỗi lần đổi), còn
  // nút "về cuối" cần state để render lại.
  const bamDayRef = useRef(true);
  bamDayRef.current = bamDay;

  const theoCuon = useCallback(() => {
    const el = thanRef.current;
    if (!el) return;
    datBamDay(dangODay(el));
  }, []);

  const veCuoi = useCallback(() => {
    const el = thanRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    datBamDay(true);
  }, []);

  /**
   * Tự cuộn — nhưng CHỈ khi người đọc đang ở đáy.
   *
   * Tự cuộn là phép ĐO, không phải sở thích: chia khu chữ của `sample.gif` thành 8 dải ngang
   * thì bảy dải TRÊN cũng đổi 59–73 khung. Nếu chữ chỉ thêm ở dưới thì dải trên phải đứng im
   * — chúng không im, tức cả khối dịch lên.
   *
   * Nhường người đọc cũng là quyết định đã chốt: không dừng khi cuộn lên thì đọc lại một đoạn
   * dài trong lúc engine đang phát là bất khả — cứ mỗi mẩu 2ms là màn hình lại nhảy về đáy.
   */
  useEffect(() => {
    if (!bamDayRef.current) return;
    const el = thanRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [boDem]);

  return (
    <section className="vansong" aria-label={CHU.vanSongVung}>
      {/* BA tiêu đề, không hai — và cái thứ ba là một lỗi mà bài kiểm cũ bắt được.
          Khu này nói về BỘ ĐỆM của phiên xem, không về máy (xem `CHU.mayNghi`). Nhưng khi
          máy nghỉ mà bộ đệm CÒN chữ thì "chưa có văn nào" là một câu sai ngay trên đống chữ
          nó vừa phủ nhận. Ba ca, ba câu:
            đang chạy            → máy đang nói
            nghỉ + bộ đệm rỗng   → chưa có văn nào trong phiên này
            nghỉ + bộ đệm có chữ → văn của lượt gần nhất  */}
      <div className="vshead">
        <h2>
          {dangChay
            ? CHU.mayDangNoi
            : boDem.luot.length === 0
              ? CHU.mayNghi
              : CHU.vanLuotGanNhat}
        </h2>
      </div>
      <div className="vsthan" ref={thanRef} onScroll={theoCuon}>
        {boDem.luot.length === 0 ? (
          <p className="vstrong">{dangChay ? GIAI_THICH.vanSongTrong : GIAI_THICH.vanSongNghi}</p>
        ) : (
          boDem.luot.map((l, i) => (
            <div className="luot" key={l.id}>
              {/* Lượt ĐẦU trong bộ đệm không có vạch kể cả khi nó mang nhãn: vạch là thứ
                  NGĂN GIỮA hai lượt. Vẽ một vạch trên cùng là khẳng định có một lượt phía
                  trên nó — mà lượt đó đã bị trần cắt mất, hoặc chưa từng có. */}
              {i > 0 && l.nhan ? (
                <div className="vach" role="separator">
                  <span>{l.nhan}</span>
                </div>
              ) : null}
              <pre className={`chu${laMa(l.chu) ? ' ma' : ''}`}>{l.chu}</pre>
            </div>
          ))
        )}
      </div>
      {bamDay ? null : (
        <button type="button" className="vecuoi" onClick={veCuoi}>
          {CHU.veCuoi}
        </button>
      )}
    </section>
  );
}

/** Lượt này là dữ liệu máy (JSON, đối số tool) chứ không phải văn? Xem chú thích đầu tệp. */
export function laMa(chu: string): boolean {
  const dau = chu.trimStart().slice(0, 1);
  if (dau === '{' || dau === '[') return true;
  const mau = chu.slice(0, 400);
  return (mau.match(/"\s*:/g)?.length ?? 0) >= 3;
}
