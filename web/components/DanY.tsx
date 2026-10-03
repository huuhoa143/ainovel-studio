'use client';

import { Fragment, memo, useCallback, useEffect, useMemo, useState } from 'react';

import { layDanY } from '@/lib/api';
import { CHU_TG } from '@/lib/chu/the-gioi';
import { CHU, GIAI_THICH } from '@/lib/nhan';
import type { ArcOutline, OutlineEntry, Snapshot, VolumeOutline } from '@/lib/types';
import { useHoSo } from '@/lib/useHoSo';

import { HopGap, HoSoKhung, MucRong, tinhTrangHoSo } from './HoSoKhung';

/**
 * Dàn ý phân tầng: Tập → Hồi → Chương.
 *
 * Cấp bậc phải hiện ra là cấp bậc (Design Principle 1), nên đây là ba mức accordion lồng
 * nhau chứ không phải ba danh sách phẳng cạnh nhau.
 *
 * Điểm dễ nói dối nhất của bề mặt này là **bộ khung**: `arcs === null` nghĩa là tập chưa
 * được Kiến trúc sư mở, `chapters === null` nghĩa là hồi chưa mở. Cả hai KHÔNG phải "tập
 * rỗng"/"hồi rỗng" — chúng là trạng thái *chưa quy hoạch*, nên ở đây không vẽ nút gập cho
 * chúng và nói rõ bằng chữ.
 *
 * # Mặc định mở gì
 *
 * ĐO ĐƯỢC trên tác phẩm thật: 14 tập, 54 hồi, 739 chương, mỗi chương kèm trọng tâm, cách
 * kết và danh sách cảnh. Mở hết là hàng chục màn hình. Nên chỉ TẬP ĐANG VIẾT và HỒI ĐANG
 * VIẾT mở sẵn — đó là chỗ người dùng cần nhìn khi quay lại — còn các tập khác đóng thành
 * một dòng có tiến độ, đủ để thấy "đang ở đâu trong toàn bộ công trình".
 */
export function DanY({
  snapshot,
  tacPham,
}: {
  snapshot: Snapshot;
  tacPham: string | undefined;
}) {
  const tai = useHoSo(tacPham, layDanY);
  const tt = tinhTrangHoSo(tai);

  // Bóc MỘT lần ở đây: dòng tóm của khối gập cần số mục, và phần thân cần chính
  // kết quả ấy. Bóc hai lần là hai chỗ có thể lệch nhau.
  const premise = tai.du?.premise ?? '';
  const bocPremise = useMemo(() => bocTienDe(premise), [premise]);
  const mucTienDe = bocPremise.khoi.filter((k) => k.than.length > 0);

  const volumes = tai.du?.volumes ?? null;
  const phang0 = tai.du?.flat ?? [];
  const phang = !(volumes && volumes.length > 0) && phang0.length > 0;
  const ttChuong = ttChuongTu(snapshot);
  // Snapshot đổi ở mỗi sự kiện của dây chuyền, nhưng cây chỉ cần dựng lại khi trạng thái
  // CHƯƠNG đổi. Khoá theo chữ ký đó thì 739 dòng không bị dựng lại mỗi nhịp.
  const kyTrangThai = chuKyTrangThai(snapshot);
  const cay = useMemo(
    () => danhSo(volumes, snapshot),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [volumes, kyTrangThai],
  );

  // Tập nào đang mở. `null` = người dùng chưa bấm gì, theo mặc định (tập đang viết).
  // Giữ trong state chứ không để `<details>` tự nhớ: nút "Mở mọi tập" cần điều khiển được
  // cả 14 tập một lúc, và lượt nạp lại 20 giây/lần không được gập lại thứ người dùng mở.
  const [moTap, setMoTap] = useState<Set<number> | null>(null);
  useEffect(() => setMoTap(null), [tacPham]);
  const tapMo = moTap ?? new Set(cay.filter((t) => t.moSan).map((t) => t.v.index));
  const tapCoCung = cay.filter((t) => t.cung.length > 0);
  const moHet = tapCoCung.length > 0 && tapCoCung.every((t) => tapMo.has(t.v.index));

  const doiTap = useCallback(
    (i: number, mo: boolean) =>
      setMoTap((truoc) => {
        const hien = truoc ?? new Set(cay.filter((t) => t.moSan).map((t) => t.v.index));
        if (hien.has(i) === mo) return truoc;
        const moi = new Set(hien);
        if (mo) moi.add(i);
        else moi.delete(i);
        return moi;
      }),
    [cay],
  );

  return (
    <HoSoKhung
      tieuDe={CHU.danYPhanTang}
      motTa={motTa(snapshot, volumes, cay)}
      lop="tg tgDanY"
    >
      {tt ?? (
        <div className="tgThan">
          {/* TIỀN ĐỀ là thẻ đọc được, gập sẵn. Dòng tóm cho xem trước mục đầu tiên nên
              đóng KHÔNG phải giấu; mở ra là cả bản đặc tả theo nhãn. Tiền đề là NỀN, đọc
              một lần lúc dựng truyện, còn cây dàn ý là thứ đổi mỗi hồi. */}
          <section className="sect tgTienDe">
            <HopGap
              tieuDe={CHU.tienDe}
              phu={mucTienDe.length > 0 ? CHU.demMucTienDe(mucTienDe.length) : undefined}
              tomTat={<XemTruocTienDe boc={bocPremise} />}
            >
              <TienDe boc={bocPremise} />
            </HopGap>
          </section>

          <section className="sect tgCay">
            <div className="tgCayDau">
              <h2>{phang ? CHU.chuong : `${CHU.tap} → ${CHU.cung} → ${CHU.chuong}`}</h2>
              {tapCoCung.length > 1 ? (
                <button
                  type="button"
                  className="nutPhu tgNutNho"
                  onClick={() =>
                    setMoTap(moHet ? new Set() : new Set(tapCoCung.map((t) => t.v.index)))
                  }
                >
                  {moHet ? CHU_TG.dongHetTap : CHU_TG.moHetTap}
                </button>
              ) : null}
            </div>
            {volumes && volumes.length > 0 ? (
              <>
                <ol className="cayDanY">
                  {cay.map((t) => (
                    <Tap key={t.v.index} t={t} mo={tapMo.has(t.v.index)} onDoi={doiTap} />
                  ))}
                </ol>
                {/* Dàn ý phẳng là CÙNG một sự thật xếp khác cách, nên nó không được trình
                    bày như một nguồn thứ hai. Chỉ một dòng chú thích dưới cây. */}
                {phang0.length > 0 ? (
                  <p className="tgChuThich">
                    {`${phang0.length} chương đã có dàn ý chi tiết. ${GIAI_THICH.danYPhangGiai}`}
                  </p>
                ) : null}
              </>
            ) : phang ? (
              // Truyện ngắn không chia tập và hồi: dàn ý phẳng LÀ dàn ý. Bản trước chỉ vẽ cây
              // phân tầng, nên ở cửa duyệt dàn ý — đúng lúc người dùng được mời "xem dàn ý rồi
              // duyệt" — trang này nói "Chưa có dàn ý" trên một truyện đã có đủ 3 chương.
              <ol className="cayChuong tgPhang">
                {phang0.map((c) => {
                  const so = c.chapter;
                  return <ChuongDanY key={so} ch={{ c, so, tt: ttChuong(so) }} />;
                })}
              </ol>
            ) : (
              <MucRong mang={volumes} muc="dàn ý" />
            )}
          </section>
        </div>
      )}
    </HoSoKhung>
  );
}

/** Một phần thân: đoạn văn, hoặc một chùm gạch đầu dòng. */
type PhanTienDe = { loai: 'doan'; chu: string } | { loai: 'gach'; muc: string[] };

/** Một mục của tiền đề: tiêu đề markdown + phần thân thuộc về nó. */
interface KhoiTienDe {
  nhan: string;
  than: PhanTienDe[];
}

const DAU_MUC = /^\s*#{1,6}\s+(.*\S)\s*$/;
/* Gạch đầu dòng markdown. `-`, `*`, `+` cho danh sách không thứ tự; `1.`/`1)` cho
   có thứ tự. Cả hai đều xuất hiện trong `premise.md` thật. */
const DAU_GACH = /^\s*(?:[-*+]|\d+[.)])\s+(.*\S)\s*$/;

/**
 * Bóc `premise.md` thành mục có nhãn.
 *
 * # Vì sao phải đọc TỪNG DÒNG, không tách đoạn rồi mới nối
 *
 * Bản trước tách theo dòng trống rồi nối mọi xuống dòng đơn thành dấu cách. Cách
 * đó đúng cho văn xuôi, nhưng `premise.md` không phải văn xuôi — nó là một bản
 * đặc tả có tiêu đề:
 *
 *	## Thể loại và tông điệu
 *	Mạt thế zombie, đô thị thương chiến, dị năng giao dịch hai thế giới…
 *
 * Hai dòng ấy cách nhau đúng MỘT xuống dòng, nên phép nối dán chúng làm một câu
 * và ký tự `##` ở lại giữa đoạn văn. ĐO ĐƯỢC trên tác phẩm thật: **15/15 đoạn**
 * của bề mặt này bắt đầu bằng `#` hoặc `##`, tức toàn bộ cấu trúc của tiền đề
 * biến mất và người đọc nhận một khối chữ có rác markdown rải đều.
 *
 * Tiêu đề là RANH GIỚI, mạnh hơn cả dòng trống. Nên phép bóc chạy theo dòng: gặp
 * `#{1,6}` thì chốt đoạn đang gom và mở mục mới.
 *
 * # Gạch đầu dòng cũng là ranh giới
 *
 * Cùng một lỗi ở cấp thấp hơn, và nó chỉ lộ ra sau khi tiêu đề đã được bóc: mục
 * "Điểm bán khác biệt" viết bằng gạch đầu dòng, nên phép nối dán cả chùm thành
 * một câu chạy dài có dấu `-` rải giữa — "…theo từng giai đoạn. - Hậu cung không
 * chỉ là tình cảm; …". Một danh sách bị đọc thành một câu thì mất luôn phần tin
 * mà việc tách dòng mang: đây là những mục NGANG HÀNG nhau.
 */
function bocTienDe(raw: string): { mo: PhanTienDe[]; ten: string[]; khoi: KhoiTienDe[] } {
  const mo: PhanTienDe[] = [];
  const khoi: KhoiTienDe[] = [];
  let dem: string[] = [];
  let gach: string[] | null = null;
  let trong = false;
  let hien: KhoiTienDe | null = null;

  const day = (p: PhanTienDe) => (hien ? hien.than : mo).push(p);
  const xaDoan = () => {
    const d = dem.join(' ').replace(/\s+/g, ' ').trim();
    dem = [];
    if (d) day({ loai: 'doan', chu: d });
  };
  const xaGach = () => {
    if (gach && gach.length > 0) day({ loai: 'gach', muc: gach });
    gach = null;
  };

  for (const dong of raw.split('\n')) {
    const dauMuc = dong.match(DAU_MUC);
    if (dauMuc) {
      xaDoan();
      xaGach();
      hien = { nhan: dauMuc[1]!, than: [] };
      khoi.push(hien);
      trong = false;
      continue;
    }
    if (dong.trim() === '') {
      // Dòng trống chốt ĐOẠN nhưng KHÔNG chốt danh sách: markdown cho phép gạch
      // đầu dòng cách nhau một dòng trống mà vẫn là một danh sách.
      xaDoan();
      trong = true;
      continue;
    }
    const dauGach = dong.match(DAU_GACH);
    if (dauGach) {
      xaDoan();
      if (!gach) gach = [];
      gach.push(dauGach[1]!);
      trong = false;
      continue;
    }
    // Dòng thường ngay dưới một gạch đầu dòng là phần GÓI TIẾP của chính mục đó,
    // không phải một đoạn mới — trừ khi có dòng trống chen vào giữa.
    if (gach && gach.length > 0 && !trong) {
      gach[gach.length - 1] += ' ' + dong.trim();
      continue;
    }
    xaGach();
    dem.push(dong.trim());
    trong = false;
  }
  xaDoan();
  xaGach();

  // Tiêu đề KHÔNG có thân là tên của chính bản đặc tả (`# Ông Trùm Hai Cõi`), không
  // phải một mục rỗng. Nó đứng riêng ở trên chứ không thành một hàng nhãn trống.
  return { mo, ten: khoi.filter((k) => k.than.length === 0).map((k) => k.nhan), khoi };
}

/**
 * Tiền đề — bản đặc tả tác phẩm, trình bày như một bảng nhãn → giá trị.
 *
 * Đây là cùng ngôn ngữ mà `.kv` đã dùng khắp studio, và nó đúng với bản chất của
 * dữ liệu: tiền đề là một tập câu trả lời có nhãn (thể loại, xung đột cốt lõi,
 * hướng kết cục, vùng cấm), không phải một áng văn. Đọc dọc cột nhãn là quét
 * được cả bản đặc tả mà không phải đọc hết.
 *
 * Vẫn có đường lui: tiền đề viết bằng văn xuôi thuần — không tiêu đề nào — rơi về
 * cách vẽ đoạn như cũ. Ép một bản không có nhãn vào lưới nhãn là bịa ra cấu trúc.
 */
function VeThan({ than, lop }: { than: PhanTienDe[]; lop?: string }) {
  return (
    <>
      {than.map((p, i) =>
        p.loai === 'gach' ? (
          <ul className="tiendeGach" key={i}>
            {p.muc.map((m, j) => (
              <li key={j}>{m}</li>
            ))}
          </ul>
        ) : (
          <p className={lop} key={i}>
            {p.chu}
          </p>
        ),
      )}
    </>
  );
}

function TienDe({ boc }: { boc: ReturnType<typeof bocTienDe> }) {
  const { mo, ten, khoi } = boc;
  const muc = khoi.filter((k) => k.than.length > 0);

  if (mo.length === 0 && khoi.length === 0) {
    return <p className="trongSect">{GIAI_THICH.chuaCoTienDe}</p>;
  }

  if (muc.length === 0) {
    return (
      <>
        {ten.map((t, i) => (
          <p className="tiende" key={`t${i}`}>
            {t}
          </p>
        ))}
        <VeThan than={mo} lop="tiende" />
      </>
    );
  }

  return (
    <>
      {ten.map((t, i) => (
        <p className="tiendeTen" key={`t${i}`}>
          {t}
        </p>
      ))}
      <VeThan than={mo} lop="tiende" />
      <dl className="kv kvtiende">
        {muc.map((k, i) => (
          <Fragment key={i}>
            <dt>{k.nhan}</dt>
            <dd>
              <VeThan than={k.than} />
            </dd>
          </Fragment>
        ))}
      </dl>
    </>
  );
}


/** Xem trước tiền đề trên dòng tóm: mục đầu tiên, hai dòng. */
function XemTruocTienDe({ boc }: { boc: ReturnType<typeof bocTienDe> }) {
  const dau = boc.khoi.find((k) => k.than.length > 0);
  const chu = (dau ? dau.than : boc.mo)
    .map((p) => (p.loai === 'doan' ? p.chu : p.muc.join(' · ')))
    .join(' ');
  if (!chu) return null;
  return (
    <p className="tgXemTruoc">
      {dau ? <span className="tgXemTruocNhan">{dau.nhan}</span> : null}
      {chu}
    </p>
  );
}

/* ── đánh số và tiến độ ─────────────────────────────────────────────────── */

type TrangThaiKhoi = 'done' | 'running' | 'pending';

interface ChuongSo {
  c: OutlineEntry;
  so: number;
  /** MarkState của trục sản xuất: done / running / rewrite / gate / pending. */
  tt: string;
}

interface CungSo {
  a: ArcOutline;
  chuong: ChuongSo[];
  xong: number;
  tong: number;
  tt: TrangThaiKhoi;
}

interface TapSo {
  v: VolumeOutline;
  cung: CungSo[];
  xong: number;
  tong: number;
  tt: TrangThaiKhoi;
  moSan: boolean;
}

/**
 * Đánh số chương và tính tiến độ cho từng tập/hồi.
 *
 * # Vì sao phải tự đánh số
 *
 * ĐO ĐƯỢC trên tác phẩm thật: cây dàn ý phân tầng trả `chapter: 0` cho MỌI chương (chỉ
 * dàn ý phẳng mới mang số), nên bản trước hiện "0" ở đầu cả 739 dòng. Hai bản xếp cùng thứ
 * tự — 739 mục cả hai bên — nên số thật là vị trí đếm dồn qua các hồi đã mở. Chương nào
 * server đã gửi số thì giữ số đó.
 *
 * Trạng thái chương lấy từ trục sản xuất (`timeline.chapters`) của snapshot; trục vắng thì
 * lùi về `completed_chapters`, vì truyện viết tuần tự.
 */
/** Chữ ký của mọi thứ `danhSo` đọc từ snapshot. */
function chuKyTrangThai(snap: Snapshot): string {
  const truc = (snap.timeline.volumes ?? []).map((b) => b.state[0]).join('');
  const chuong = (snap.timeline.chapters ?? []).map((m) => m.state[0]).join('');
  return `${snap.book.completed_chapters}|${snap.in_progress_chapter ?? ''}|${truc}|${chuong}`;
}

/** Trạng thái một chương theo số — MỘT phép đo cho cây phân tầng và danh sách phẳng. */
function ttChuongTu(snap: Snapshot): (so: number) => string {
  const dau = new Map<number, string>();
  for (const m of snap.timeline.chapters ?? []) dau.set(m.chapter, m.state);
  const dangViet = snap.in_progress_chapter;
  return (so: number) => {
    if (dangViet === so) return 'running';
    return dau.get(so) ?? (so <= snap.book.completed_chapters ? 'done' : 'pending');
  };
}

function danhSo(volumes: VolumeOutline[] | null, snap: Snapshot): TapSo[] {
  if (!volumes) return [];
  const ttChuong = ttChuongTu(snap);
  const khoiTruc = new Map((snap.timeline.volumes ?? []).map((b) => [b.index, b.state]));

  let dem = 0;
  const tap: TapSo[] = volumes.map((v) => {
    const cung: CungSo[] = (v.arcs ?? []).map((a) => {
      const chuong = (a.chapters ?? []).map((c) => {
        const so = c.chapter > 0 ? c.chapter : dem + 1;
        dem = so;
        return { c, so, tt: ttChuong(so) };
      });
      const xong = chuong.filter((c) => c.tt === 'done').length;
      const tong = chuong.length > 0 ? chuong.length : (a.estimated_chapters ?? 0);
      return { a, chuong, xong, tong, tt: 'pending' as TrangThaiKhoi };
    });
    const xong = cung.reduce((s, c) => s + c.xong, 0);
    const tong = cung.reduce((s, c) => s + c.tong, 0);
    const truc = khoiTruc.get(v.index);
    const tt: TrangThaiKhoi =
      truc === 'done' || (truc === undefined && tong > 0 && xong === tong)
        ? 'done'
        : truc === 'running' || (truc === undefined && xong > 0)
          ? 'running'
          : 'pending';
    // Hồi đang viết = hồi đầu tiên chưa xong của tập đang viết.
    if (tt === 'running') {
      const dangChay = cung.find((c) => c.tong === 0 || c.xong < c.tong);
      for (const c of cung) {
        c.tt = c === dangChay ? 'running' : c.tong > 0 && c.xong === c.tong ? 'done' : 'pending';
      }
    } else {
      for (const c of cung) c.tt = tt === 'done' ? 'done' : 'pending';
    }
    return { v, cung, xong, tong, tt, moSan: false };
  });

  // Mở sẵn tập đang viết; không có thì tập đầu tiên chưa xong; hết rồi thì tập cuối.
  const mo =
    tap.find((t) => t.tt === 'running' && t.cung.length > 0) ??
    tap.find((t) => t.tt === 'pending' && t.cung.length > 0) ??
    [...tap].reverse().find((t) => t.cung.length > 0);
  if (mo) mo.moSan = true;
  return tap;
}

function motTa(
  snap: Snapshot,
  volumes: VolumeOutline[] | null,
  cay: TapSo[],
): string | undefined {
  if (!snap.capabilities.layered_outline && !volumes?.length) {
    return 'Truyện không chia tập và hồi';
  }
  if (!volumes) return undefined;
  const dang = cay.find((t) => t.tt === 'running');
  const phan = [`${volumes.length} tập`];
  const soChuong = cay.reduce((s, t) => s + t.tong, 0);
  if (soChuong > 0) phan.push(`${soChuong} chương`);
  if (dang) phan.push(`đang viết tập ${dang.v.index}`);
  return phan.join(' · ');
}

/** "Tập 1: Cánh Cửa…" → "Cánh Cửa…": số tập đã đứng riêng ở đầu dòng, nhắc lại là thừa. */
function boTienTo(ten: string): string {
  return ten.replace(/^\s*tập\s*\d+\s*[:·.\-–—]\s*/i, '').trim() || ten;
}

const NHAN_TT: Record<TrangThaiKhoi, { nhan: string; mau: string }> = {
  done: { nhan: CHU_TG.tapDaXong, mau: 'teal' },
  running: { nhan: CHU_TG.tapDangViet, mau: 'gold' },
  pending: { nhan: CHU_TG.tapChuaViet, mau: '' },
};

/** Thanh tiến độ mảnh. Có chữ số đi kèm, nên thanh chỉ là kênh thứ hai. */
function TienDoManh({ xong, tong, tt }: { xong: number; tong: number; tt: TrangThaiKhoi }) {
  const phan = tong > 0 ? Math.min(100, Math.round((xong / tong) * 100)) : 0;
  return (
    <span className="tgTienDo" data-tt={tt}>
      <span className="tgTienDoChu">{CHU_TG.daVietTren(xong, tong)}</span>
      <span className="tgTienDoThanh" aria-hidden="true">
        <span style={{ width: `${phan}%` }} />
      </span>
    </span>
  );
}

/* ── cây ────────────────────────────────────────────────────────────────── */

const Tap = memo(function Tap({
  t,
  mo,
  onDoi,
}: {
  t: TapSo;
  mo: boolean;
  onDoi: (tap: number, mo: boolean) => void;
}) {
  const { v, cung } = t;
  const nhan = NHAN_TT[t.tt];
  const dau = (
    <>
      <span className="ma">
        {CHU.tap} {v.index}
      </span>
      <span className="ten">{boTienTo(v.title)}</span>
      {v.final ? <span className="vien">{CHU.tapChot}</span> : null}
      <span className="tgPhai">
        {cung.length > 0 ? <span className="dem">{CHU_TG.soHoi(cung.length)}</span> : null}
        <span className={`vien ${nhan.mau}`}>{nhan.nhan}</span>
        {t.tong > 0 ? <TienDoManh xong={t.xong} tong={t.tong} tt={t.tt} /> : null}
      </span>
    </>
  );

  // Tập chưa mở hồi thì KHÔNG có gì để bung — không vẽ nút gập. Một mũi tên bấm vào chẳng
  // mở ra gì là một lời hứa suông.
  if (cung.length === 0) {
    return (
      <li className="ntap chuamo" data-tt={t.tt}>
        <div className="nhanhdau">{dau}</div>
        <div className="tgTapThan">
          {v.theme ? <p className="phu">{v.theme}</p> : null}
          <p className="chuamoNoi">{GIAI_THICH.tapChuaMo}</p>
        </div>
      </li>
    );
  }

  return (
    <li className="ntap" data-tt={t.tt}>
      <details
        className="capGap"
        open={mo}
        onToggle={(e) => onDoi(v.index, (e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary className="nhanhdau">{dau}</summary>
        <div className="tgTapThan">
          {v.theme ? (
            <p className="phu">
              <span className="tgNhanPhu">{CHU.chuDe}</span>
              {v.theme}
            </p>
          ) : null}
          <ol className="cayCung">
            {cung.map((c) => (
              <Cung key={c.a.index} c={c} />
            ))}
          </ol>
        </div>
      </details>
    </li>
  );
});

function Cung({ c }: { c: CungSo }) {
  const { a, chuong } = c;
  const daMo = chuong.length > 0;
  const pham =
    daMo && chuong.length > 0
      ? CHU_TG.chuongPham(chuong[0]!.so, chuong[chuong.length - 1]!.so)
      : null;
  const dau = (
    <>
      <span className="ma">
        {CHU.cung} {a.index}
      </span>
      <span className="ten">{a.title}</span>
      {/* Số chương ở lại DÒNG TÓM: khi hồi đóng, đây là thứ duy nhất nói hồi này đã chạy
          tới đâu — tức chính lý do để mở nó hay bỏ qua. */}
      <span className="tgPhai">
        {pham ? <span className="tgPham">{pham}</span> : null}
        <span className="dem">
          {daMo
            ? CHU.soChuongDaMo(chuong.length)
            : a.estimated_chapters
              ? CHU.soChuongDuKien(a.estimated_chapters)
              : GIAI_THICH.chuaBietPhamVi}
        </span>
        {daMo ? <TienDoManh xong={c.xong} tong={c.tong} tt={c.tt} /> : null}
      </span>
    </>
  );

  if (!daMo) {
    return (
      <li className="ncung chuamo" data-tt={c.tt}>
        <div className="nhanhdau">{dau}</div>
        <div className="tgCungThan">
          {a.goal ? <p className="phu">{a.goal}</p> : null}
          <p className="chuamoNoi">{GIAI_THICH.cungChuaMo}</p>
        </div>
      </li>
    );
  }

  return (
    <li className="ncung" data-tt={c.tt}>
      <details className="capGap" open={c.tt === 'running'}>
        <summary className="nhanhdau">{dau}</summary>
        <div className="tgCungThan">
          {a.goal ? (
            <p className="phu">
              <span className="tgNhanPhu">{CHU.mucTieuCung}</span>
              {a.goal}
            </p>
          ) : null}
          <ol className="cayChuong">
            {chuong.map((ch) => (
              <ChuongDanY key={ch.so} ch={ch} />
            ))}
          </ol>
        </div>
      </details>
    </li>
  );
}

/**
 * Một chương: một dòng gọn (số · tên · trọng tâm một dòng), bấm mở ra cách kết và cảnh.
 *
 * Bản trước bung sẵn trọng tâm, cách kết và cả danh sách cảnh cho từng chương — 15 chương
 * một hồi thành ba màn hình chữ. Dòng gọn giữ đúng thứ cần để định vị.
 */
function ChuongDanY({ ch }: { ch: ChuongSo }) {
  const { c, so, tt } = ch;
  const canh = c.scenes ?? [];
  const nhanTT = CHU_TG.trangThaiChuong[tt] ?? tt;
  const dong = (
    <>
      <span className="ma">{so}</span>
      <span className="tgDiem" data-tt={tt} title={nhanTT}>
        <span className="tgAn">{nhanTT}</span>
      </span>
      <span className="ten">{c.title || <em>{CHU.chuaDatTieuDe}</em>}</span>
      {c.core_event ? <span className="tgTrongTam">{c.core_event}</span> : null}
    </>
  );
  if (!c.hook && canh.length === 0 && !c.core_event) {
    return (
      <li data-tt={tt}>
        <div className="nhanhdau">{dong}</div>
      </li>
    );
  }
  return (
    <li data-tt={tt}>
      <details className="tgChuongGap">
        <summary className="nhanhdau">{dong}</summary>
        <div className="tgChuongThan">
          <dl className="kv kvcay">
            {c.core_event ? (
              <>
                <dt title={CHU.sukienTrongTamDay}>{CHU.sukienTrongTam}</dt>
                <dd>{c.core_event}</dd>
              </>
            ) : null}
            {c.hook ? (
              <>
                <dt>{CHU.kieuMocCuoi}</dt>
                <dd>{c.hook}</dd>
              </>
            ) : null}
            {canh.length > 0 ? (
              <>
                <dt>{CHU_TG.canh}</dt>
                <dd>
                  <ol className="canh canhcay">
                    {canh.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </dd>
              </>
            ) : null}
          </dl>
        </div>
      </details>
    </li>
  );
}
