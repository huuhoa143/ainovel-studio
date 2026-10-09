'use client';

import { DOC_DUYET } from '@/lib/chu/doc-duyet';
import {
  CHU,
  GIAI_THICH,
  kyTheoTone,
  nhanChieu,
  nhanKheUoc,
  nhanKetLuan,
  nhanMuc,
  nhanPhamViDuyet,
  type Tone,
} from '@/lib/nhan';
import type { Dimension, Issue, Review } from '@/lib/types';

/**
 * Nhận xét của Biên tập viên. MỘT hiện thực, BỐN bề mặt dùng: tab Nhận xét của inspector
 * (292px), màn Nhận xét biên tập (rộng cả canvas), Cần viết lại, và cột phải của Đọc truyện.
 *
 * Chép hai lần thì lần đổi thuật ngữ đầu tiên là hai bề mặt nói khác nhau về cùng một chương,
 * nên mọi bề mặt đi qua đây.
 *
 * Thứ tự đọc: tổng quan (kết luận + điểm) → phần kế hoạch còn thiếu → các tiêu chí → các
 * vấn đề. Kế hoạch còn thiếu đứng trước tiêu chí vì nó cụ thể và làm được ngay; điểm từng
 * tiêu chí là chẩn đoán, đọc sau.
 *
 * Hình theo bề rộng, không theo cờ: khối gốc là một container, và dưới 460px các thẻ con tự
 * phẳng lại thành mục có đường kẻ (xem `doc-duyet.css`). `le` chỉ còn hạ cỡ chữ cho cột hẹp;
 * `phang` bỏ khung thẻ khi khối cha đã là một thẻ (Cần viết lại) — không lồng thẻ trong thẻ.
 */
export function BanDuyet({
  review,
  le = false,
  tieuDe = true,
  phang = false,
}: {
  review: Review;
  /** Dạng cột hẹp (≤296px): cỡ chữ nhỏ hơn một bậc. */
  le?: boolean;
  /** Tự vẽ tiêu đề. Tắt khi khối cha đã có tiêu đề cho nhận xét. */
  tieuDe?: boolean;
  /** Bỏ khung thẻ của các khối con, khi khối cha đã là thẻ. */
  phang?: boolean;
}) {
  const kl = nhanKetLuan(review.verdict);
  const kheUoc = nhanKheUoc(review.contract_status);
  const chieu = review.dimensions ?? [];
  const coDiem = chieu.filter((d) => d.score != null);
  // Biên tập viên không ghi điểm tổng; trung bình các tiêu chí được chấm là con số duy nhất
  // tính được mà không bịa, và chú giải nói rõ nó là trung bình.
  const tb =
    coDiem.length > 0
      ? Math.round(coDiem.reduce((s, d) => s + (d.score ?? 0), 0) / coDiem.length)
      : undefined;
  const vanDe = [...(review.issues ?? [])].sort((a, b) => hangMuc(a) - hangMuc(b));

  const lop = ['bd', le ? 'bdLe' : '', phang ? 'bdPhang' : ''].filter(Boolean).join(' ');

  return (
    <div className={lop}>
      {tieuDe ? <h3 className="bdTieuDe">{CHU.ketLuanDuyet}</h3> : null}

      <section className="bdKhoi bdTong" aria-label={DOC_DUYET.tongQuan}>
        <div className="bdTongDau">
          {tb !== undefined ? (
            <div
              className={`bdDiem ${toneDiem(tb)}`}
              title={DOC_DUYET.diemTrungBinhDay(coDiem.length)}
            >
              <span className="so">{tb}</span>
              <span className="mau">/100</span>
              <span className="nhan">{DOC_DUYET.diemTrungBinh}</span>
            </div>
          ) : null}
          <div className="bdTongVien">
            {kl ? (
              <span className={`vien ${lopVien(kl.mau)} bdKetLuan`}>
                <span className="ky" aria-hidden="true">
                  {kyTheoTone(kl.mau)}
                </span>
                {kl.nhan}
              </span>
            ) : (
              <span className="vien">{CHU.khongCo}</span>
            )}
            <span className="bdPhu">{DOC_DUYET.thamVi(nhanPhamViDuyet(review.scope))}</span>
            {kheUoc ? (
              <span className={`vien ${lopVien(kheUoc.mau)}`}>
                <span className="ky" aria-hidden="true">
                  {kyTheoTone(kheUoc.mau)}
                </span>
                {DOC_DUYET.keHoach(kheUoc.nhan)}
              </span>
            ) : null}
          </div>
        </div>
        {review.summary ? <p className="bdTomTat">{review.summary}</p> : null}
        {tb === undefined && chieu.length > 0 ? (
          <p className="bdGhiChu">{DOC_DUYET.chuaChamDiem}</p>
        ) : null}
      </section>

      {review.contract_misses && review.contract_misses.length > 0 ? (
        <section className="bdKhoi bdThieu">
          <h3 className="bdMuc">
            {CHU.kheUocThieu}
            <span className="dem">{review.contract_misses.length}</span>
          </h3>
          <ul>
            {review.contract_misses.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {chieu.length > 0 ? (
        <section className="bdKhoi bdChieu">
          <h3 className="bdMuc">
            {CHU.cacChieu}
            <span className="dem">{CHU.demChieu(chieu.length)}</span>
          </h3>
          <ul>
            {chieu.map((d, i) => (
              <MotChieu key={`${d.name}-${i}`} d={d} />
            ))}
          </ul>
        </section>
      ) : null}

      {vanDe.length > 0 ? (
        <section className="bdVanDeNhom">
          <h3 className="bdMuc">
            {CHU.vanDeNeuRa}
            <span className="dem">{vanDe.length}</span>
          </h3>
          {vanDe.map((v, i) => (
            <VanDe key={i} v={v} />
          ))}
        </section>
      ) : null}
    </div>
  );
}

/**
 * Một tiêu chí: tên · thanh điểm · điểm · kết luận, nhận xét ở dòng dưới.
 *
 * `d.score` vắng và 0 phải khác nhau: 0/100 là điểm thật, vắng là tiêu chí không được chấm —
 * thanh không vẽ, chỗ điểm ghi "—".
 */
function MotChieu({ d }: { d: Dimension }) {
  const v = nhanKetLuan(d.verdict);
  const coDiem = d.score != null;
  const tone: Tone = v?.mau && v.mau !== 'muted' ? v.mau : coDiem ? toneDiem(d.score!) : 'muted';
  return (
    <li className="bdTieuChi">
      <span className="ten">{nhanChieu(d.name)}</span>
      <span className="thanh" aria-hidden="true">
        {coDiem ? (
          <span
            className={`dac ${tone}`}
            style={{ width: `${Math.max(0, Math.min(100, d.score!))}%` }}
          />
        ) : null}
      </span>
      <span className="diem" title={coDiem ? GIAI_THICH.diemThang100 : undefined}>
        {coDiem ? CHU.diemTren100(d.score!) : CHU.khongCo}
      </span>
      {v ? (
        <span className={`kl ${v.mau}`}>
          <span className="ky" aria-hidden="true">
            {kyTheoTone(v.mau)}
          </span>
          {v.nhan}
        </span>
      ) : (
        <span className="kl muted" />
      )}
      {d.comment ? <p className="nx">{d.comment}</p> : null}
    </li>
  );
}

/**
 * Một vấn đề: mức · loại · chương liên quan, rồi mô tả, dẫn chứng (văn của truyện, nên serif
 * và trích dẫn) và gợi ý sửa.
 *
 * `v.type` đi qua `nhanChieu`: nó cùng bộ từ vựng với tên tiêu chí (internal/domain/review.go).
 */
function VanDe({ v }: { v: Issue }) {
  const m = nhanMuc(v.severity);
  return (
    <article className="bdKhoi bdVanDe">
      <div className="dau">
        {m ? (
          <span className={`vien ${lopVien(m.mau)}`}>
            <span className="ky" aria-hidden="true">
              {kyTheoTone(m.mau)}
            </span>
            {m.nhan}
          </span>
        ) : null}
        <span className="loai">{nhanChieu(v.type)}</span>
        {v.chapters && v.chapters.length > 0 ? (
          <span className="ch">{DOC_DUYET.chuongLienQuan(v.chapters)}</span>
        ) : null}
      </div>
      <p className="mota">{v.description}</p>
      {v.evidence ? (
        <figure className="danchung">
          <figcaption>{CHU.danChung}</figcaption>
          <blockquote>{v.evidence}</blockquote>
        </figure>
      ) : null}
      {v.suggestion ? (
        <div className="goiy">
          <span className="nhan">{CHU.deXuat}</span>
          <p>{v.suggestion}</p>
        </div>
      ) : null}
    </article>
  );
}

const THU_TU_MUC: Record<string, number> = {
  critical: 0,
  high: 0,
  error: 1,
  major: 1,
  medium: 2,
  warning: 3,
  minor: 3,
  low: 3,
};

function hangMuc(v: Issue): number {
  return THU_TU_MUC[v.severity?.toLowerCase().trim()] ?? 4;
}

/** Bậc màu cho một điểm khi không có kết luận đi kèm. */
function toneDiem(n: number): Tone {
  if (n >= 80) return 'teal';
  if (n >= 60) return 'amber';
  return 'red';
}

/** `.vien` không có biến thể `muted`; trung tính là viên trơn. */
function lopVien(t: Tone): string {
  return t === 'muted' ? '' : t;
}
