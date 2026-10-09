'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { DOC_DUYET } from '@/lib/chu/doc-duyet';
import { CHU, GIAI_THICH } from '@/lib/nhan';
import type { ChapterRow, LaneBlock, Timeline } from '@/lib/types';

/**
 * Mục lục chương dùng chung cho Đọc truyện và Nhận xét biên tập: nhóm theo Tập → Hồi khi
 * trục có khoảng chương, kèm ô tìm theo số hoặc tên.
 *
 * Nhóm chỉ dựng từ khối ĐÃ MỞ (có `from`/`to`). `timeline.arcs` chỉ là các hồi của tập hiện
 * tại, nên tập khác chỉ có tiêu đề tập — vậy là đúng nguồn, không đoán thêm hồi nào.
 * Không có khối nào mở thì danh sách phẳng, không vẽ một tiêu đề nhóm rỗng.
 */
export function MucLucChuong({
  hang,
  timeline,
  chuongChon,
  onChon,
  nhan,
  phu,
  dau,
}: {
  hang: ChapterRow[];
  timeline: Timeline | undefined;
  chuongChon: number | undefined;
  onChon: (n: number) => void;
  /** Tên vùng cho trình đọc màn hình. */
  nhan: string;
  /** Phần phụ bên phải mỗi dòng (trạng thái, số từ…). */
  phu?: (r: ChapterRow) => ReactNode;
  /** Phần đặt dưới ô tìm (vd. bộ lọc) — nằm TRONG khung dính, nên cuộn cùng danh sách. */
  dau?: ReactNode;
}) {
  const [tim, setTim] = useState('');
  const oDs = useRef<HTMLElement>(null);

  const loc = useMemo(() => locChuong(hang, tim), [hang, tim]);
  const nhom = useMemo(() => nhomChuong(loc, timeline), [loc, timeline]);

  // Mở thẳng chương 726 bằng URL thì danh sách phải cuộn tới đó; `block: 'nearest'` để chỉ
  // cuộn khung danh sách, không kéo cả canvas.
  useEffect(() => {
    const el = oDs.current?.querySelector('[aria-current="true"]');
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [chuongChon, hang.length]);

  return (
    <nav className="mucluc" aria-label={nhan} ref={oDs}>
      {hang.length > 0 ? (
        <div className="mlTim">
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4 4" />
          </svg>
          <input
            type="search"
            value={tim}
            placeholder={DOC_DUYET.timChuongNgan}
            aria-label={DOC_DUYET.timChuong}
            onChange={(e) => setTim(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && loc[0]) onChon(loc[0].chapter);
              if (e.key === 'Escape') setTim('');
            }}
          />
        </div>
      ) : null}
      {dau}

      {hang.length === 0 ? (
        <p className="mlTrong">{GIAI_THICH.chuaCoChuong}</p>
      ) : loc.length === 0 ? (
        <p className="mlTrong">{DOC_DUYET.khongThayChuong(tim.trim())}</p>
      ) : (
        <div className="mlNhom">
          {nhom.map((g) => (
            <section key={g.khoa} className="mlTap">
              {g.ten ? <h3 className="mlTapTen">{g.ten}</h3> : null}
              {g.hoi.map((h, i) => (
                <div key={`${h.khoa}-${i}`} className="mlHoi">
                  {h.ten ? <h4 className="mlHoiTen">{h.ten}</h4> : null}
                  <ul>
                    {h.hang.map((r) => (
                      <li key={r.chapter}>
                        <button
                          type="button"
                          aria-current={r.chapter === chuongChon}
                          onClick={() => onChon(r.chapter)}
                          title={DOC_DUYET.tenChuong(r.chapter, r.title)}
                        >
                          <span className="so">{r.chapter}</span>
                          <span className="ten">
                            {r.title ? r.title : <em>{CHU.chuaDatTieuDe}</em>}
                          </span>
                          {phu ? <span className="phu">{phu(r)}</span> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </nav>
  );
}

/** Bỏ dấu để "cua da" tìm ra "Cửa đá". */
function boDau(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

export function locChuong(hang: ChapterRow[], tim: string): ChapterRow[] {
  const q = tim.trim();
  if (!q) return hang;
  if (/^\d+$/.test(q)) {
    // Số: ưu tiên đúng chương đó, rồi các chương có số bắt đầu bằng chuỗi gõ vào.
    const dung = hang.filter((r) => String(r.chapter) === q);
    const dau = hang.filter((r) => String(r.chapter) !== q && String(r.chapter).startsWith(q));
    return [...dung, ...dau];
  }
  const k = boDau(q);
  return hang.filter((r) => boDau(r.title ?? '').includes(k));
}

interface Hoi {
  khoa: string;
  ten?: string;
  hang: ChapterRow[];
}
interface Tap {
  khoa: string;
  ten?: string;
  hoi: Hoi[];
}

function trong(b: LaneBlock, n: number): boolean {
  return !!b.from && !!b.to && n >= b.from && n <= b.to;
}

export function nhomChuong(hang: ChapterRow[], tl: Timeline | undefined): Tap[] {
  const taps = (tl?.volumes ?? []).filter((b) => b.from && b.to);
  const hois = (tl?.arcs ?? []).filter((b) => b.from && b.to);
  if (taps.length === 0 && hois.length === 0) {
    return [{ khoa: 'tat-ca', hoi: [{ khoa: 'tat-ca', hang }] }];
  }

  const ra: Tap[] = [];
  const timTap = (khoa: string, ten?: string): Tap => {
    let t = ra.find((x) => x.khoa === khoa);
    if (!t) {
      t = { khoa, ten, hoi: [] };
      ra.push(t);
    }
    return t;
  };

  for (const r of hang) {
    const tap = taps.find((b) => trong(b, r.chapter));
    const t = tap
      ? timTap(`t${tap.index}`, DOC_DUYET.tap(tap.index, tap.title))
      : timTap('ngoai', taps.length > 0 ? DOC_DUYET.ngoaiTap : undefined);
    const hoi = hois.find((b) => trong(b, r.chapter));
    const khoaHoi = hoi ? `h${hoi.index}` : '-';
    let h = t.hoi[t.hoi.length - 1];
    if (!h || h.khoa !== khoaHoi) {
      h = { khoa: khoaHoi, ten: hoi ? DOC_DUYET.hoi(hoi.index, hoi.title) : undefined, hang: [] };
      t.hoi.push(h);
    }
    h.hang.push(r);
  }
  return ra;
}
