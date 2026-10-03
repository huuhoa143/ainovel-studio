'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { giaiCongCu } from '@/lib/congCu';
import { CHU, GIAI_THICH } from '@/lib/nhan';
import { dangODay } from '@/lib/tuCuon';
import { loaiLuot, tachCongCu, tachNghi, vanThuan, type BoDemVan, type LuotVan } from '@/lib/vanSong';

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

  // Máy nghỉ thì khu này là "đoạn viết gần nhất" — tức VĂN. Còn lượt văn nào thì chỉ hiện văn;
  // để tham số kế hoạch đứng dưới tiêu đề ấy là gọi tham số là đoạn viết. Không còn lượt văn
  // nào thì hiện nguyên bộ đệm: các bước công cụ vẫn là dấu vết thật của lượt vừa rồi.
  const coVan = boDem.luot.some((l) => loaiLuot(l.chu) === 'van' && vanThuan(l.chu).trim() !== '');
  const hien = dangChay || !coVan ? boDem.luot : boDem.luot.filter((l) => loaiLuot(l.chu) === 'van');

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
        {hien.length === 0 ? (
          <p className="vstrong">{dangChay ? GIAI_THICH.vanSongTrong : GIAI_THICH.vanSongNghi}</p>
        ) : (
          hien.map((l, i) => (
            <div className="luot" key={l.id}>
              {/* Lượt ĐẦU trong bộ đệm không có vạch kể cả khi nó mang nhãn: vạch là thứ
                  NGĂN GIỮA hai lượt. Vẽ một vạch trên cùng là khẳng định có một lượt phía
                  trên nó — mà lượt đó đã bị trần cắt mất, hoặc chưa từng có. */}
              {i > 0 && l.nhan ? (
                <div className="vach" role="separator">
                  <span>{l.nhan}</span>
                </div>
              ) : null}
              <Luot l={l} dangSong={dangChay && i === hien.length - 1} />
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

/** Số dòng tham số giữ dưới một bước công cụ — đủ để thấy nó đang ghi gì, không đủ để lấn văn. */
const SO_DONG_THAM_SO = 6;

/**
 * Một lượt. Văn vẽ serif kèm con trỏ đang gõ; bước công cụ vẽ thành MỘT hàng việc — tên bước
 * (engine đã dịch sẵn trong tiêu đề "✻ …") kèm vòng quay khi nó đang chạy, và tham số thu
 * vào vài dòng mono mờ ở dưới. Tham số vẫn đọc được, chỉ không còn giả làm văn truyện.
 */
function Luot({ l, dangSong }: { l: LuotVan; dangSong: boolean }) {
  if (loaiLuot(l.chu) === 'congCu' && l.chu.trimStart().startsWith('✻')) {
    const { tieuDe, than } = tachCongCu(l.chu);
    const dong = than.replace(/\s+$/, '').split('\n');
    const cut = dong.length > SO_DONG_THAM_SO;
    return (
      <div className={`buocCc${dangSong ? ' dang' : ''}`}>
        <p className="bccTen">
          <span className="bccDau" aria-hidden="true" />
          {/* Tiêu đề dự phòng của engine là TÊN HÀM trần ("✻ audit_foundation") cho công cụ
              không có bộ trích; dịch qua cùng bảng với Diễn biến và thanh dưới. */}
          {giaiCongCu(tieuDe) ?? tieuDe}
        </p>
        {than.trim() ? (
          <pre className={`chu ma bccThan${cut ? ' cut' : ''}`}>
            {cut ? dong.slice(-SO_DONG_THAM_SO).join('\n') : dong.join('\n')}
          </pre>
        ) : null}
      </div>
    );
  }
  // Suy nghĩ của model nằm CÙNG lượt với văn nó viết ra, ngăn bằng `DAU_NGHI`. Vẽ hai thứ đó
  // cùng một kiểu chữ là nói dối: đoạn "Let me re-check the consistency…" không phải câu nào
  // của truyện. Suy nghĩ xuống mono mờ nghiêng, thụt vào, có nhãn — đọc được, không giả làm văn.
  const doan = tachNghi(l.chu);
  const ma = laMa(l.chu);
  return (
    <>
      {doan.map((d, i) =>
        d.nghi ? (
          <aside className="nghi" key={i} aria-label={CHU.modelTuNhu}>
            <p className="nghiNhan">{CHU.modelTuNhu}</p>
            <pre className="chu nghiChu">{d.chu.trim()}</pre>
          </aside>
        ) : (
          <pre className={`chu${ma ? ' ma' : ''}`} key={i}>
            {d.chu}
            {dangSong && i === doan.length - 1 ? (
              <span className="conTro" aria-hidden="true" />
            ) : null}
          </pre>
        ),
      )}
      {doan.length === 0 && dangSong ? (
        <pre className="chu">
          <span className="conTro" aria-hidden="true" />
        </pre>
      ) : null}
    </>
  );
}

/** Lượt này là dữ liệu máy (JSON, đối số tool) chứ không phải văn? Xem chú thích đầu tệp. */
export function laMa(chu: string): boolean {
  if (loaiLuot(chu) === 'congCu') return true;
  const mau = vanThuan(chu).slice(0, 400);
  return (mau.match(/"\s*:/g)?.length ?? 0) >= 3;
}
