'use client';

import { DOC_DUYET } from '@/lib/chu/doc-duyet';
import { soTu } from '@/lib/dinhdang';
import type { Khu } from '@/lib/khu';
import { CHU, GIAI_THICH, kyTheoTone, nhanKetLuan, trangThaiDong } from '@/lib/nhan';
import type { ChapterRow, Review, Snapshot } from '@/lib/types';

import { BanDuyet } from './BanDuyet';
import { BieuTuong } from './BieuTuong';

/**
 * Hàng chờ viết lại: chương Editor đã trả về, kèm lý do trả về.
 *
 * # Vì sao là một bề mặt riêng chứ không phải một phép lọc của bảng chương
 *
 * Đây là hàng đợi VIỆC, không phải một mức xem. Người vận hành mở nó để biết
 * "còn nợ gì" — và nợ đó có thứ tự ưu tiên riêng, không theo số chương. Bảng
 * chương xếp theo số chương vì nó là bản đồ tiến độ; hàng chờ xếp theo số chương
 * nhỏ trước vì chương cũ bị treo lâu hơn chặn nhiều chương sau nó hơn.
 *
 * # Nguồn
 *
 * `snapshot.chapters` với `stage === 'rewrite'`. Đây là danh sách ĐẦY ĐỦ, không
 * phải phần lọc: `buildChapterRows` đưa mọi chương trong `progress.PendingRewrites`
 * vào bảng (snapshot.go:277), và `rowStage` xét `rewrite` trước `done` nên chương
 * đã nghiệm thu rồi bị trả về vẫn hiện ở đây.
 *
 * Không dùng `timeline.chapters` làm nguồn dù nó cũng có vạch `rewrite`: lane
 * chương chỉ trải từ 1 tới `total_chapters`, nên một chương chờ viết lại nằm
 * ngoài khoảng đó sẽ không có vạch — và một hàng chờ thiếu người là hàng chờ
 * nói dối.
 */
export function HangChoVietLai({
  snapshot,
  chuongChon,
  onChonChuong,
  onChonKhu,
}: {
  snapshot: Snapshot;
  chuongChon: number | undefined;
  onChonChuong: (n: number) => void;
  /**
   * Đổi khu (tùy chọn) — cho hai lối "Đọc bản cũ" và "Mở trong Nhận xét biên tập". Hai nút
   * chỉ hiện trên thẻ ĐANG MỞ, tức chương đã là chương đang chọn, nên chỉ cần đổi khu: gọi
   * `onChonChuong` rồi `onChonKhu` trong cùng một nhịp sẽ ghi URL với số chương cũ
   * (xem `moTacPhamVuaTao` trong useStudio.ts).
   */
  onChonKhu?: (k: Khu) => void;
}) {
  const hangCho = snapshot.chapters
    .filter((r) => r.stage === 'rewrite')
    .sort((a, b) => a.chapter - b.chapter);

  const sel = snapshot.selected;
  const dungChuong = sel && sel.chapter === chuongChon;
  const duyet = dungChuong ? sel.review : undefined;
  const dangVe = !!sel && chuongChon !== undefined && !dungChuong;
  const lyDo = snapshot.rewrite_reason?.trim();

  return (
    <main className="canvas khuhang" id="hang-cho-viet-lai">
      <div className="head">
        <h1>{CHU.hangChoVietLai}</h1>
        <span className="sub">{CHU.demHangCho(hangCho.length)}</span>
      </div>

      <div className="hcThan">
        {hangCho.length === 0 ? (
          <div className="hcTrong the">
            <span className="hcTrongKy" aria-hidden="true">
              <BieuTuong ten="vietLai" co={20} />
            </span>
            <p className="chinh">{GIAI_THICH.hangChoRong}</p>
            <p>{DOC_DUYET.hangChoRongGoiY}</p>
            {onChonKhu ? (
              <button type="button" className="nutPhu" onClick={() => onChonKhu('ban-thao')}>
                <BieuTuong ten="doc" co={14} />
                {CHU.docBanThao}
              </button>
            ) : null}
          </div>
        ) : (
          <>
            {lyDo ? (
              <section className="hcLyDo" aria-label={DOC_DUYET.lyDoTraVe}>
                <h2>{DOC_DUYET.lyDoTraVe}</h2>
                <p>{lyDo}</p>
                <p className="ghichu">{DOC_DUYET.lyDoTraVeGhiChu}</p>
              </section>
            ) : null}
            <ul className="dsHangCho">
              {hangCho.map((r) => (
                <MotChuong
                  key={r.chapter}
                  r={r}
                  moRa={r.chapter === chuongChon}
                  duyet={r.chapter === chuongChon ? duyet : undefined}
                  dangVe={r.chapter === chuongChon && dangVe}
                  onChon={() => onChonChuong(r.chapter)}
                  onChonKhu={onChonKhu}
                />
              ))}
            </ul>
            <p className="hcNguon">{GIAI_THICH.hangChoNguon}</p>
          </>
        )}
      </div>
    </main>
  );
}

/**
 * Một chương trong hàng chờ: một thẻ. Nhận xét mở ra TẠI CHỖ, trong thẻ.
 *
 * Lý do trả về nằm trong nhận xét, và nhận xét chỉ có cho chương đang chọn
 * (`selected.review`). Nên bấm "Xem nhận xét" là chọn chương: snapshot nạp lại với
 * `?chapter=n` và nhận xét hiện ra dưới đúng thẻ đó.
 */
function MotChuong({
  r,
  moRa,
  duyet,
  dangVe,
  onChon,
  onChonKhu,
}: {
  r: ChapterRow;
  moRa: boolean;
  duyet: Review | undefined;
  dangVe: boolean;
  onChon: () => void;
  onChonKhu?: (k: Khu) => void;
}) {
  const tt = trangThaiDong(r);
  const tu = soTu(r.words);
  const kl = nhanKetLuan(duyet?.verdict);
  const soVanDe = duyet?.issues?.length ?? 0;

  return (
    <li className={`hcThe the${moRa ? ' mo' : ''}`}>
      <div className="hcDau">
        <button type="button" className="hangdau" aria-expanded={moRa} onClick={onChon}>
          <span className="hcTen">{DOC_DUYET.tenChuong(r.chapter, r.title)}</span>
          <span className="hcMeta">
            <span className={`vien ${tt.mau === 'muted' ? '' : tt.mau}`}>
              <span className="ky" aria-hidden="true">
                {tt.ky}
              </span>
              {tt.nhan}
            </span>
            {kl ? (
              <span className={`vien ${kl.mau === 'muted' ? '' : kl.mau}`}>
                <span className="ky" aria-hidden="true">
                  {kyTheoTone(kl.mau)}
                </span>
                {kl.nhan}
              </span>
            ) : null}
            {soVanDe > 0 ? <span className="hcPhu">{DOC_DUYET.soVanDe(soVanDe)}</span> : null}
            {/* Số từ của bản thảo CŨ: một chương 2.837 từ bị trả về là công đã bỏ ra sẽ phải
                bỏ lại. Chú giải nói rõ để không ai đọc nó là số từ của bản mới. */}
            {tu ? (
              <span className="hcPhu" title={GIAI_THICH.vietLaiConSoTu}>
                {CHU.daCoSoTu} {tu} từ
              </span>
            ) : null}
          </span>
          <span className="hcMo">
            {moRa ? DOC_DUYET.anNhanXet : CHU.moBanDuyet}
            <span className={`hcMui${moRa ? ' lat' : ''}`} aria-hidden="true">
              <BieuTuong ten="mui" co={14} />
            </span>
          </span>
        </button>
      </div>

      {moRa ? (
        <div className="hangthan">
          {duyet ? (
            <BanDuyet review={duyet} tieuDe={false} phang />
          ) : (
            <p className="hcChuaCo">{dangVe ? DOC_DUYET.dangMoNhanXet : GIAI_THICH.chuaCoDuyet}</p>
          )}
          {onChonKhu ? (
            <div className="hcHanhDong">
              <button type="button" className="nutPhu" onClick={() => onChonKhu('ban-thao')}>
                <BieuTuong ten="doc" co={14} />
                {DOC_DUYET.docBanCu}
              </button>
              {duyet ? (
                <button type="button" className="nutPhu" onClick={() => onChonKhu('kiem-dinh')}>
                  <BieuTuong ten="nhanXet" co={14} />
                  {DOC_DUYET.moNhanXetDay}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
