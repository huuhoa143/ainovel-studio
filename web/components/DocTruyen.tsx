'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { layChuong } from '@/lib/api';
import { DOC_DUYET } from '@/lib/chu/doc-duyet';
import { soTu } from '@/lib/dinhdang';
import type { Khu } from '@/lib/khu';
import { CHU, GIAI_THICH, TRANG_THAI_CHUONG, kyTheoTone, nhanKetLuan } from '@/lib/nhan';
import type { ChapterDetail, ChapterRow, Contract, Review, Snapshot } from '@/lib/types';

import { BanDuyet } from './BanDuyet';
import { BieuTuong } from './BieuTuong';
import { MucLucChuong } from './MucLucChuong';


/**
 * Bề mặt ĐỌC TRUYỆN — câu hỏi thứ ba của người vận hành trong PRODUCT.md: "thành quả đọc ra
 * sao".
 *
 * Ba cột: mục lục (nhóm Tập → Hồi, tìm theo số/tên) · khổ đọc · kế hoạch và nhận xét. Cột
 * phải gập được để đọc tập trung, và lựa chọn đó cùng cỡ chữ, giãn dòng được nhớ trong
 * localStorage của máy đang xem — đây là sở thích đọc, không phải dữ liệu của truyện.
 *
 *  - **Khổ đọc 68ch, serif.** Serif là dấu hiệu ngữ nghĩa: thấy serif là thấy văn của tác
 *    phẩm. Giãn dòng thấp nhất 1.75 vì dấu tiếng Việt xếp hai tầng — `ế ộ ữ ỗ` ăn khoảng trên,
 *    dấu nặng ăn khoảng dưới, ở 1.5 thì dấu dòng dưới chạm dấu dòng trên.
 *  - **Phím ←/→ chuyển chương**, trừ khi đang gõ trong ô nhập.
 *  - **Chương trước/sau đi theo DANH SÁCH có dấu vết sản xuất, không phải `n ± 1`.** Bảng
 *    chương có lỗ; nhảy sang `n + 1` có thể rơi vào một chương chưa tồn tại.
 */
export function DocTruyen({
  snapshot,
  tacPham,
  chuongChon,
  onChonChuong,
  onChonKhu,
}: {
  snapshot: Snapshot;
  tacPham: string | undefined;
  chuongChon: number | undefined;
  onChonChuong: (n: number) => void;
  /** Đổi khu (tùy chọn) — cho lối "Mở trong Nhận xét biên tập" ở cột phải. */
  onChonKhu?: (k: Khu) => void;
}) {
  const hang = snapshot.chapters;
  const doc = useCheDoDoc();
  const [moMucLuc, setMoMucLuc] = useState(false);
  const oCuon = useRef<HTMLElement>(null);
  const oTienDo = useRef<HTMLDivElement>(null);

  /**
   * Vào bề mặt đọc mà chưa chọn chương thì TỰ chọn chương đọc được đầu tiên — ưu tiên `done`
   * rồi `rewrite`, hai công đoạn chắc chắn có tệp bản thảo. Không có thì KHÔNG chọn gì: lúc đó
   * câu "chưa có chương nào" là sự thật, và tự mở một chương chưa viết là dựng một khổ đọc trống.
   */
  useEffect(() => {
    if (chuongChon !== undefined) return;
    const dau =
      hang.find((r) => r.stage === 'done') ?? hang.find((r) => r.stage === 'rewrite');
    if (dau) onChonChuong(dau.chapter);
    // `hang` đổi mỗi nhịp làm mới snapshot; chỉ `chuongChon` mới là điều kiện thật ở đây.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chuongChon]);

  const i = hang.findIndex((r) => r.chapter === chuongChon);
  const truoc = i > 0 ? hang[i - 1] : undefined;
  const sau = i >= 0 && i < hang.length - 1 ? hang[i + 1] : undefined;

  const chon = useCallback(
    (n: number) => {
      onChonChuong(n);
      setMoMucLuc(false);
    },
    [onChonChuong],
  );

  // Tiến độ đọc ghi thẳng vào DOM, không qua state: setState mỗi nhịp cuộn là vẽ lại cả
  // nghìn đoạn văn mỗi khung hình.
  const veTienDo = (ti: number) => {
    const el = oTienDo.current;
    if (!el) return;
    el.setAttribute('aria-valuenow', String(Math.round(ti * 100)));
    const thanh = el.firstElementChild as HTMLElement | null;
    if (thanh) thanh.style.transform = `scaleX(${ti})`;
  };

  // Đổi chương thì về đầu trang: đọc tiếp chương mới từ giữa là đọc sai chỗ.
  useEffect(() => {
    oCuon.current?.scrollTo?.({ top: 0 });
    veTienDo(0);
  }, [chuongChon]);

  useEffect(() => {
    const phim = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === 'ArrowLeft' && truoc) {
        e.preventDefault();
        chon(truoc.chapter);
      } else if (e.key === 'ArrowRight' && sau) {
        e.preventDefault();
        chon(sau.chapter);
      }
    };
    window.addEventListener('keydown', phim);
    return () => window.removeEventListener('keydown', phim);
  }, [truoc, sau, chon]);

  const cuon = () => {
    const el = oCuon.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    veTienDo(max > 0 ? Math.min(1, el.scrollTop / max) : 0);
  };

  const lop = ['doclayout', doc.moLe ? 'leMo' : 'leDong', moMucLuc ? 'mlMo' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <main className="canvas khudoc" id="doc-ban-thao" ref={oCuon} onScroll={cuon}>
      <div className="head">
        <h1>{CHU.docBanThao}</h1>
        <span className="sub">{motTa(snapshot)}</span>
        <div className="docCongCu">
          <button
            type="button"
            className="nutPhu docNutMucLuc"
            aria-expanded={moMucLuc}
            onClick={() => setMoMucLuc((m) => !m)}
          >
            {DOC_DUYET.moMucLuc}
          </button>
          <DieuHuong truoc={truoc} sau={sau} onChon={chon} />
          <CoChu doc={doc} />
          <button
            type="button"
            className={`docNutVuong${doc.moLe ? ' bat' : ''}`}
            aria-pressed={doc.moLe}
            aria-label={doc.moLe ? DOC_DUYET.dongBenLe : DOC_DUYET.moBenLe}
            title={doc.moLe ? DOC_DUYET.dongBenLe : DOC_DUYET.moBenLe}
            onClick={() => doc.datLe(!doc.moLe)}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" aria-hidden="true">
              <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
              <path d="M14.5 4.5v15" />
            </svg>
          </button>
        </div>
        <div
          ref={oTienDo}
          className="docTienDo"
          role="progressbar"
          aria-label={DOC_DUYET.tienDoDoc}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={0}
        >
          <span style={{ transform: 'scaleX(0)' }} />
        </div>
      </div>

      <div className={lop}>
        <MucLucChuong
          hang={hang}
          timeline={snapshot.timeline}
          chuongChon={chuongChon}
          onChon={chon}
          nhan={CHU.chonChuongDeDoc}
          phu={(r) => <PhuDong r={r} />}
        />
        {chuongChon ? (
          <ThanChuong
            key={chuongChon}
            tacPham={tacPham}
            chuong={chuongChon}
            doc={doc}
            sau={sau}
            onChon={chon}
            viTri={i >= 0 ? DOC_DUYET.viTri(i + 1, hang.length) : undefined}
            onMoNhanXet={onChonKhu ? () => onChonKhu('kiem-dinh') : undefined}
          />
        ) : (
          <div className="docCot">
            <p className="docTrong">
              {hang.length === 0 ? GIAI_THICH.chuaCoChuong : GIAI_THICH.docChuaChonChuong}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

/** "Trấn Yêu Ký · 2 chương đã xong · 5.803 từ" — chỉ nói điều biết được. */
function motTa(snap: Snapshot): string {
  const b = snap.book;
  const phan: string[] = [b.name || b.id];
  if (b.completed_chapters > 0) phan.push(`${b.completed_chapters} chương đã xong`);
  const tu = soTu(b.total_words);
  if (tu) phan.push(`${tu} từ`);
  return phan.join(' · ');
}

/* ── sở thích đọc, nhớ trong localStorage ─────────────────────────────── */

const CO_CHU = [15, 16, 17, 18, 19, 20, 22] as const;
const GIAN_DONG = [1.75, 1.9, 2.05] as const;
const KHOA = { co: 'ainovel.doc.coChu', gian: 'ainovel.doc.gianDong', le: 'ainovel.doc.benLe' };

interface CheDoDoc {
  co: number;
  gian: number;
  moLe: boolean;
  datCo: (px: number) => void;
  datGian: (i: number) => void;
  datLe: (mo: boolean) => void;
}

function docSo(khoa: string): number | undefined {
  try {
    const v = window.localStorage.getItem(khoa);
    return v == null ? undefined : Number(v);
  } catch {
    return undefined;
  }
}

function ghi(khoa: string, v: string) {
  try {
    window.localStorage.setItem(khoa, v);
  } catch {
    // Trình duyệt chặn bộ nhớ (chế độ riêng tư): vẫn đổi được trong phiên, chỉ không nhớ.
  }
}

/**
 * Đọc trong effect, không trong lúc khởi tạo state: trang dựng tĩnh, nên render đầu tiên phải
 * khớp HTML dựng sẵn — đọc localStorage lúc khởi tạo là lệch hydrate.
 */
function useCheDoDoc(): CheDoDoc {
  const [co, setCo] = useState(17);
  const [gian, setGian] = useState(1);
  const [moLe, setMoLe] = useState(true);

  useEffect(() => {
    const c = docSo(KHOA.co);
    if (c && (CO_CHU as readonly number[]).includes(c)) setCo(c);
    const g = docSo(KHOA.gian);
    if (g !== undefined && g >= 0 && g < GIAN_DONG.length) setGian(g);
    try {
      const l = window.localStorage.getItem(KHOA.le);
      if (l === '0') setMoLe(false);
    } catch {
      // như trên
    }
  }, []);

  return {
    co,
    gian,
    moLe,
    datCo: (px) => {
      setCo(px);
      ghi(KHOA.co, String(px));
    },
    datGian: (g) => {
      setGian(g);
      ghi(KHOA.gian, String(g));
    },
    datLe: (mo) => {
      setMoLe(mo);
      ghi(KHOA.le, mo ? '1' : '0');
    },
  };
}

function CoChu({ doc }: { doc: CheDoDoc }) {
  const vt = CO_CHU.indexOf(doc.co as (typeof CO_CHU)[number]);
  const nhanGian = DOC_DUYET.gianDongMuc[doc.gian] ?? DOC_DUYET.gianDongMuc[1];
  return (
    <div className="docCoChu" role="group" aria-label={DOC_DUYET.cheDoDoc}>
      <button
        type="button"
        aria-label={DOC_DUYET.nhoChu}
        title={DOC_DUYET.nhoChu}
        disabled={vt <= 0}
        onClick={() => doc.datCo(CO_CHU[vt - 1] ?? doc.co)}
      >
        <span className="aNho" aria-hidden="true">A</span>
      </button>
      <span className="docCoSo" title={DOC_DUYET.coChu(doc.co)}>
        {doc.co}
      </span>
      <button
        type="button"
        aria-label={DOC_DUYET.toChu}
        title={DOC_DUYET.toChu}
        disabled={vt >= CO_CHU.length - 1}
        onClick={() => doc.datCo(CO_CHU[vt + 1] ?? doc.co)}
      >
        <span className="aTo" aria-hidden="true">A</span>
      </button>
      <span className="docVach" aria-hidden="true" />
      <button
        type="button"
        className="docGian"
        aria-label={DOC_DUYET.doiGianDong(nhanGian)}
        title={DOC_DUYET.doiGianDong(nhanGian)}
        onClick={() => doc.datGian((doc.gian + 1) % GIAN_DONG.length)}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden="true">
          <path d="M9 6h11M9 12h11M9 18h11" />
          <path d="m3.5 8 1.5-2 1.5 2M3.5 16l1.5 2 1.5-2M5 6v12" />
        </svg>
        <span>{nhanGian}</span>
      </button>
    </div>
  );
}

/* ── điều hướng chương trước / chương sau ─────────────────────────────── */

function DieuHuong({
  truoc,
  sau,
  onChon,
}: {
  truoc: ChapterRow | undefined;
  sau: ChapterRow | undefined;
  onChon: (n: number) => void;
}) {
  return (
    <div className="docnav" role="group" aria-label={DOC_DUYET.phimTat}>
      <button
        type="button"
        className="docNutVuong"
        disabled={!truoc}
        aria-label={CHU.chuongTruoc}
        title={truoc ? `${CHU.chuongTruoc}: ${DOC_DUYET.tenChuong(truoc.chapter, truoc.title)} (←)` : undefined}
        onClick={() => truoc && onChon(truoc.chapter)}
      >
        <span className="lui">
          <BieuTuong ten="mui" co={16} />
        </span>
      </button>
      <button
        type="button"
        className="docNutVuong"
        disabled={!sau}
        aria-label={CHU.chuongSau}
        title={sau ? `${CHU.chuongSau}: ${DOC_DUYET.tenChuong(sau.chapter, sau.title)} (→)` : undefined}
        onClick={() => sau && onChon(sau.chapter)}
      >
        <BieuTuong ten="mui" co={16} />
      </button>
    </div>
  );
}

/** Phần phải của một dòng mục lục: chỉ đánh dấu chương không ở trạng thái thường. */
function PhuDong({ r }: { r: ChapterRow }) {
  if (r.stage === 'done') return null;
  const tt = TRANG_THAI_CHUONG[r.stage];
  return (
    <span className={`docCd ${tt.mau}`} title={tt.nhan}>
      <span aria-hidden="true">{tt.ky}</span>
      <span className="anNhan">{tt.nhan}</span>
    </span>
  );
}

/* ── thân chương: văn + cột phải ──────────────────────────────────────── */

function ThanChuong({
  tacPham,
  chuong,
  doc,
  sau,
  onChon,
  viTri,
  onMoNhanXet,
}: {
  tacPham: string | undefined;
  chuong: number;
  doc: CheDoDoc;
  sau: ChapterRow | undefined;
  onChon: (n: number) => void;
  viTri: string | undefined;
  onMoNhanXet?: () => void;
}) {
  const [ct, setCt] = useState<ChapterDetail>();
  const [dangTai, setDangTai] = useState(false);
  const [loi, setLoi] = useState<string>();
  const [lan, setLan] = useState(0);

  useEffect(() => {
    if (!tacPham) return;
    let huy = false;
    setCt(undefined);
    setLoi(undefined);
    setDangTai(true);
    layChuong(tacPham, chuong)
      .then((d) => {
        if (!huy) setCt(d);
      })
      .catch((e: unknown) => {
        if (!huy) setLoi(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!huy) setDangTai(false);
      });
    return () => {
      huy = true;
    };
  }, [tacPham, chuong, lan]);

  let than: React.ReactNode;
  if (loi) {
    than = (
      <div className="docTrong docLoi" role="alert">
        <p className="chinh">{DOC_DUYET.khongMoDuoc}</p>
        <p>{loi}</p>
        <button type="button" className="nutPhu" onClick={() => setLan((n) => n + 1)}>
          {DOC_DUYET.thuLai}
        </button>
      </div>
    );
  } else if (dangTai || !ct) {
    than = <p className="docTrong">{CHU.dangTai}</p>;
  } else {
    // Model hay mở chương bằng chính dòng tiêu đề ("Chương 725: …"). Tiêu đề đã in ở đầu
    // trang, nên dòng đó bị bỏ.
    const doan = ct.text
      .replace(/^\s*(?:#+\s*)?Chương\s+\d+\b[^\n]*\n+/i, '')
      .split(/\n{2,}/)
      .map((d) => d.replace(/\n/g, ' ').trim())
      .filter(Boolean);

    than = (
      <article
        className="khoDoc"
        style={
          {
            '--doc-co': `${doc.co}px`,
            '--doc-gian': GIAN_DONG[doc.gian],
          } as React.CSSProperties
        }
      >
        <header className="docDau">
          <h2>{DOC_DUYET.tenChuong(ct.chapter, ct.title)}</h2>
          <ChiSoChuong words={ct.words} review={ct.review} viTri={viTri} />
        </header>

        {doan.length === 0 ? (
          <p className="docTrong">{GIAI_THICH.chuongTrongStore}</p>
        ) : (
          <div className="docVan">
            {doan.map((d, k) => (
              <p key={k}>{d}</p>
            ))}
          </div>
        )}

        <footer className="docCuoi">
          {sau ? (
            <button type="button" className="docTiep" onClick={() => onChon(sau.chapter)}>
              <span className="nhan">{DOC_DUYET.chuongSauLa}</span>
              <span className="ten">{DOC_DUYET.tenChuong(sau.chapter, sau.title)}</span>
              <span className="mui" aria-hidden="true">
                <BieuTuong ten="mui" co={18} />
              </span>
            </button>
          ) : (
            <p className="docHet">{DOC_DUYET.hetChuong}</p>
          )}
          <p className="docPhim">{DOC_DUYET.phimTat}</p>
        </footer>
      </article>
    );
  }

  return (
    <>
      <div className="docCot">{than}</div>
      {doc.moLe ? (
        <BenLe
          contract={ct?.contract}
          review={ct?.review}
          sanSang={!!ct}
          onDong={() => doc.datLe(false)}
          onMoNhanXet={onMoNhanXet}
        />
      ) : null}
    </>
  );
}

function ChiSoChuong({
  words,
  review,
  viTri,
}: {
  words: number;
  review: Review | undefined;
  viTri: string | undefined;
}) {
  const tu = soTu(words);
  const kl = nhanKetLuan(review?.verdict);
  // ~300 từ/phút cho văn tiếng Việt đọc lướt-mà-kỹ; làm tròn lên để không hứa "0 phút".
  const phut = words > 0 ? Math.max(1, Math.round(words / 300)) : 0;
  return (
    <div className="docChiSo">
      {tu ? <span>{DOC_DUYET.tu(tu)}</span> : null}
      {phut ? <span>{DOC_DUYET.phutDoc(phut)}</span> : null}
      {viTri ? <span className="anHep">{viTri}</span> : null}
      {kl ? (
        <span className={`vien ${kl.mau === 'muted' ? '' : kl.mau}`} title={CHU.banDuyetEditor}>
          <span className="ky" aria-hidden="true">
            {kyTheoTone(kl.mau)}
          </span>
          {kl.nhan}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Cột phải: kế hoạch chương rồi tới nhận xét.
 *
 * Thứ tự đó không tùy tiện — nhận xét là phán xét việc chương có làm đúng kế hoạch hay không,
 * nên đọc kế hoạch trước thì nhận xét mới có nghĩa.
 */
function BenLe({
  contract,
  review,
  sanSang,
  onDong,
  onMoNhanXet,
}: {
  contract: Contract | undefined;
  review: Review | undefined;
  sanSang: boolean;
  onDong: () => void;
  onMoNhanXet?: () => void;
}) {
  return (
    <aside className="docLe" aria-label={DOC_DUYET.benLe}>
      <div className="docLeDau">
        <h2>{DOC_DUYET.benLe}</h2>
        <button
          type="button"
          className="docNutVuong"
          aria-label={DOC_DUYET.dongBenLe}
          title={DOC_DUYET.dongBenLe}
          onClick={onDong}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      {!sanSang ? null : (
        <>
          <section className="docLeKhoi">
            <h3>{CHU.kheUocChuong}</h3>
            {contract && (contract.core_event || contract.hook || contract.scenes?.length) ? (
              <KheUoc contract={contract} />
            ) : (
              <p className="docLeTrong">{DOC_DUYET.chuaCoKeHoach}</p>
            )}
          </section>

          <section className="docLeKhoi">
            <h3>{CHU.banDuyetEditor}</h3>
            {review ? (
              <BanDuyet review={review} le tieuDe={false} />
            ) : (
              <p className="docLeTrong">{GIAI_THICH.banDuyetChuaCo}</p>
            )}
            {review && onMoNhanXet ? (
              <button type="button" className="nutPhu docLeMo" onClick={onMoNhanXet}>
                {DOC_DUYET.xemNhanXetDay}
              </button>
            ) : null}
          </section>
        </>
      )}
    </aside>
  );
}

function KheUoc({ contract }: { contract: Contract }) {
  return (
    <>
      <dl className="docKeHoach">
        {contract.core_event ? (
          <div>
            <dt title={CHU.sukienTrongTamDay}>{CHU.sukienTrongTamDay}</dt>
            <dd>{contract.core_event}</dd>
          </div>
        ) : null}
        {contract.hook ? (
          <div>
            <dt>{CHU.kieuMocCuoi}</dt>
            <dd>{contract.hook}</dd>
          </div>
        ) : null}
      </dl>
      {/* Danh sách cảnh PHẢI có nhãn riêng: không có nhãn thì nó nằm ngay dưới "Cách kết
          chương" và đọc như thể bốn cảnh đó là bốn kiểu kết. */}
      {contract.scenes && contract.scenes.length > 0 ? (
        <>
          <h4>{CHU.canhTrongChuong}</h4>
          <ol className="docCanh">
            {contract.scenes.map((c, k) => (
              <li key={k}>{c}</li>
            ))}
          </ol>
        </>
      ) : null}
    </>
  );
}
