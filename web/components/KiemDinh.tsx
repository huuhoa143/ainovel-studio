'use client';

import { useEffect, useState } from 'react';

import { DOC_DUYET } from '@/lib/chu/doc-duyet';
import type { Khu } from '@/lib/khu';
import { CHU, GIAI_THICH, TRANG_THAI_CHUONG, kyTheoTone, nhanKetLuan } from '@/lib/nhan';
import type { ChapterRow, Review, Snapshot, Stage } from '@/lib/types';

import { BanDuyet } from './BanDuyet';
import { BieuTuong } from './BieuTuong';
import { CuaNghiemThu } from './CuaNghiemThu';
import { MucLucChuong } from './MucLucChuong';

/**
 * Kiểm định: bản duyệt 7 chiều của Editor, ở bề rộng đọc được.
 *
 * # Vì sao có bề mặt này khi inspector đã có tab cùng tên
 *
 * Tab Kiểm định sống trong panel 292px và panel đó BIẾN MẤT dưới 1240px
 * (`dungInspector` + điểm ngắt của khung). Bản duyệt là câu trả lời cho câu hỏi
 * thứ hai trong PRODUCT.md — "chất lượng có tuột không, Editor bắt lỗi gì" — nên
 * để nó chỉ tồn tại ở màn hình rộng là bỏ mất một trong ba câu hỏi chính trên
 * máy hẹp. Ở đây dẫn chứng được đứng cùng dòng với đề xuất thay vì gói trong một
 * cột hẹp.
 *
 * # Vì sao không có bảng xếp hạng chất lượng toàn sách
 *
 * `selected.review` là bản duyệt của ĐÚNG chương đang chọn. Không có endpoint
 * nào trả danh sách kết luận duyệt cho cả sách, nên bề mặt này không thể sắp
 * chương theo điểm hay lọc theo kết luận. Danh sách bên trái hiện CÔNG ĐOẠN của
 * chương — một sự thật khác, và nó được gọi đúng tên trong tiêu đề cột.
 *
 * # Vì sao không tự gọi thêm mạng
 *
 * Chọn chương đi qua `onChonChuong`, tức đúng cơ chế mà bảng chương đã dùng:
 * useStudio nạp lại snapshot với `?chapter=n` và bản duyệt về trong cùng payload.
 * Gọi `/chapters/{n}` ở đây sẽ kéo về cả toàn văn chương — vài nghìn từ — để hiện
 * một bản duyệt.
 *
 * # Bố cục
 *
 * Mục lục bên trái (nhóm Tập → Hồi, tìm theo số/tên) chỉ mang CÔNG ĐOẠN của từng chương —
 * kết luận của chương chưa chọn không có trong payload. Riêng chương đang chọn thì có, nên
 * dòng của nó mang thêm điểm/kết luận. Phần chính là `BanDuyet` ở bề rộng đầy đủ: thẻ tổng
 * quan, thanh điểm từng tiêu chí, rồi thẻ vấn đề có dẫn chứng.
 *
 * Câu trên vẫn đúng sau khi dải quyết định vào đây, và nó là lý do dải nhận `onDoi` từ NGOÀI
 * chứ không tự nạp lại: hai nút của dải đổi trạng thái phía engine, nên snapshot phải về lại
 * — nhưng đường về đó là `useStudio.taiLai`, cùng đường mà mọi lệnh khác trên trang đã dùng.
 *
 * # Vì sao dải quyết định đứng ở đây, TRÊN bản duyệt
 *
 * Đây là chỗ người vận hành đọc bằng chứng để quyết định (spec §7.3), nên nút quyết định phải
 * ở cùng chỗ với bằng chứng. Bắt họ đổi khu để bấm là bắt họ rời mắt khỏi đúng thứ họ vừa đọc.
 * Cùng một component với dải trên buồng lái — hai bản chép tay của một quyết định sẽ trôi lệch
 * ngay lần đổi đầu tiên, và lúc đó hai chỗ trên cùng một ứng dụng nói khác nhau về cùng một
 * cửa. Xem `CuaNghiemThu.tsx`.
 */
export function KiemDinh({
  snapshot,
  tacPham,
  choGhi,
  dangChay,
  chuongChon,
  onChonChuong,
  onDoi,
  onChonKhu,
}: {
  snapshot: Snapshot;
  /**
   * Cuốn đang mở — CHỈ dải quyết định đọc nó, và nó bắt buộc phải có đường vào đây.
   *
   * Để trống nó cho ra một dải amber với hai nút xám: chốt `!!tacPham` trong `CuaNghiemThu`
   * biến ca đó thành hai nút vô hiệu thay vì một lời gọi `POST /books/undefined/advance` —
   * nên hỏng ở đây hỏng IM LẶNG, trên đúng bề mặt tồn tại để quyết định.
   */
  tacPham: string | undefined;
  /** undefined = chưa biết (đang hỏi `/api/config`) — xem `useMay`. */
  choGhi: boolean | undefined;
  /** Engine có đang viết dở không — quyết định NHÃN nút gửi của dải. Xem `CuaNghiemThu`. */
  dangChay: boolean;
  chuongChon: number | undefined;
  onChonChuong: (n: number) => void;
  /** Gọi sau mỗi lệnh của dải để snapshot được nạp lại — đừng tự đoán trạng thái mới. */
  onDoi: () => void;
  /**
   * Đổi khu (tùy chọn) — cho nút "Đọc chương này". Chương đã là chương đang chọn nên chỉ cần
   * đổi khu; vắng thì nút không vẽ.
   */
  onChonKhu?: (k: Khu) => void;
}) {
  const hang = snapshot.chapters;
  const sel = snapshot.selected;

  // Chỉ một phần chương được nhận xét riêng (ở truyện thật: 51 trên 726), nên mục lục mặc định
  // chỉ hiện các chương có nhận xét — cộng chương bị trả về viết lại và chương đang chọn, để
  // không bao giờ giấu thứ đang xem. Bản trước liệt kê đủ 726 dòng, đa số mở ra trống.
  const soCoNX = hang.filter((r) => r.reviewed).length;
  const [chiCoNX, datChiCoNX] = useState(true);
  const locNX = chiCoNX && soCoNX > 0;
  const hangHien = locNX
    ? hang.filter((r) => r.reviewed || r.stage === 'rewrite' || r.chapter === chuongChon)
    : hang;

  // Vào mà chưa chọn chương thì mở chương đáng đọc nhận xét NHẤT: chương bị trả về viết lại
  // (mới nhất trước), rồi chương có nhận xét gần đây nhất. Bản trước mở chương 1 — ở một
  // truyện 700 chương, đó là chương được chốt trước khi bật nhận xét, nên màn mở ra trống.
  useEffect(() => {
    if (chuongChon !== undefined) return;
    const moiTruoc = [...hang].reverse();
    const dau =
      moiTruoc.find((r) => r.stage === 'rewrite') ??
      moiTruoc.find((r) => r.reviewed) ??
      moiTruoc.find((r) => r.stage === 'done') ??
      hang[0];
    if (dau) onChonChuong(dau.chapter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chuongChon]);

  // Nhận xét phải thuộc ĐÚNG chương đang chọn. Trong lúc snapshot mới còn trên đường về,
  // `selected` vẫn là của chương trước — hiện nó dưới tiêu đề chương mới là gán nhận xét
  // của chương này cho chương khác.
  const dungChuong = sel && sel.chapter === chuongChon;
  const duyet = dungChuong ? sel.review : undefined;
  const dangVe = !!sel && chuongChon !== undefined && !dungChuong;
  const dong = hang.find((r) => r.chapter === chuongChon);

  return (
    <main className="canvas khukiem" id="kiem-dinh">
      <div className="head">
        <h1>{CHU.kiemDinh}</h1>
        <span className="sub">{motTa(hang)}</span>
      </div>

      {/* Trên nhận xét, không dưới: một dải nhét vào cuối `<main>` vẫn "có mặt" trong khi
          người dùng phải cuộn qua hết các tiêu chí mới thấy hai cái nút. */}
      <CuaNghiemThu
        advance={snapshot.advance}
        runtime={snapshot.runtime}
        tacPham={tacPham}
        choGhi={choGhi}
        dangChay={dangChay}
        onDoi={onDoi}
      />

      <div className="kiemlayout">
        <MucLucChuong
          hang={hangHien}
          timeline={snapshot.timeline}
          chuongChon={chuongChon}
          onChon={onChonChuong}
          nhan={CHU.chonChuongDeDuyet}
          dau={
            soCoNX > 0 ? (
              <div className="kdLoc" role="group" aria-label={DOC_DUYET.locNhan}>
                <button type="button" aria-pressed={chiCoNX} onClick={() => datChiCoNX(true)}>
                  {DOC_DUYET.locCoNhanXet(soCoNX)}
                </button>
                <button type="button" aria-pressed={!chiCoNX} onClick={() => datChiCoNX(false)}>
                  {DOC_DUYET.locTatCa(hang.length)}
                </button>
              </div>
            ) : null
          }
          phu={(r) => <PhuDong r={r} review={r.chapter === chuongChon ? duyet : undefined} />}
        />

        <div className="duyetwrap">
          {!chuongChon ? (
            <div className="kdTrong">
              <p>{hang.length === 0 ? GIAI_THICH.chuaCoChuong : GIAI_THICH.chuaChonChuongDuyet}</p>
            </div>
          ) : (
            <>
              <header className="kdDau">
                <h2>{DOC_DUYET.tenChuong(chuongChon, dong?.title)}</h2>
                {onChonKhu && dong && dong.stage !== 'pending' ? (
                  <button type="button" className="nutPhu" onClick={() => onChonKhu('ban-thao')}>
                    <BieuTuong ten="doc" co={14} />
                    {DOC_DUYET.docChuongNay}
                  </button>
                ) : null}
              </header>
              {duyet ? (
                <div className="duyetthan">
                  <BanDuyet review={duyet} tieuDe={false} />
                </div>
              ) : dangVe ? (
                <div className="kdTrong">
                  <p>{DOC_DUYET.dangMoNhanXet}</p>
                </div>
              ) : (
                <ChuaCoNhanXet
                  stage={dong?.stage}
                  onDoc={
                    onChonKhu && dong && dong.stage !== 'pending'
                      ? () => onChonKhu('ban-thao')
                      : undefined
                  }
                />
              )}
            </>
          )}
          {/* Nói ra giới hạn của nguồn, ở cuối chứ không ở đầu: người vận hành tới đây để
              đọc nhận xét, không để đọc chú thích về API. */}
          <p className="kiemnguon">{GIAI_THICH.kiemDinhMotChuong}</p>
        </div>
      </div>
    </main>
  );
}

/** Phần phải của một dòng mục lục: công đoạn; chương đang chọn thì thêm kết luận + điểm. */
function PhuDong({ r, review }: { r: ChapterRow; review: Review | undefined }) {
  const kl = nhanKetLuan(review?.verdict);
  if (kl) {
    return (
      <span className={`kdKl ${kl.mau}`} title={kl.nhan}>
        <span aria-hidden="true">{kyTheoTone(kl.mau)}</span>
        {diemTb(review) ?? kl.nhan}
      </span>
    );
  }
  const tt = TRANG_THAI_CHUONG[r.stage];
  return (
    <span className={`kdCd ${tt.mau}`} title={tt.nhan}>
      <span aria-hidden="true">{tt.ky}</span>
      <span className="anNhan">{tt.nhan}</span>
    </span>
  );
}

function diemTb(r: Review | undefined): string | undefined {
  const d = (r?.dimensions ?? []).filter((x) => x.score != null);
  if (d.length === 0) return undefined;
  return String(Math.round(d.reduce((s, x) => s + (x.score ?? 0), 0) / d.length));
}

/** Chương chưa có nhận xét: nói vì sao theo công đoạn, và gợi việc làm tiếp. */
function ChuaCoNhanXet({ stage, onDoc }: { stage: Stage | undefined; onDoc?: () => void }) {
  return (
    <div className="kdTrong the">
      <p className="chinh">{GIAI_THICH.chuaCoDuyet}</p>
      {stage ? <p>{DOC_DUYET.viSaoChuaCo[stage]}</p> : null}
      {stage === 'done' || stage === 'rewrite' ? <p>{DOC_DUYET.goiYKhiChuaCo}</p> : null}
      {onDoc ? (
        <button type="button" className="nutPhu" onClick={onDoc}>
          <BieuTuong ten="doc" co={14} />
          {DOC_DUYET.docChuongNay}
        </button>
      ) : null}
    </div>
  );
}

/** Chỉ đếm những gì đếm được từ payload: số chương có dấu vết sản xuất. */
function motTa(hang: ChapterRow[]): string {
  const daNghiemThu = hang.filter((r) => r.stage === 'done').length;
  return `${hang.length} chương đã viết · ${daNghiemThu} đã duyệt`;
}
