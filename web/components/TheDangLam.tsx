'use client';

import { type ReactNode, useEffect, useState } from 'react';

import { BUOC_CHUONG, BUOC_NEN, LOI_LLM, TD } from '@/lib/chu/tien-do';
import { daChay, donGia, nangSuat, so, tongTien } from '@/lib/dinhdang';
import type { Khu } from '@/lib/khu';
import { giaiCongCu } from '@/lib/congCu';
import { type TinhTrangKet, cauLoi, giaiGiaoViec, giaiLoi, lyDoTuDung } from '@/lib/loiLlm';
import { chuongChoDuyet, trangThaiCua } from '@/lib/nghiemThu';
import { denLuotBienTap } from '@/lib/nhanXetDinhKy';
import { CHU, DH, TRANG_THAI_MAY_RUNTIME, nhanVai } from '@/lib/nhan';
import { type BuocHienTai, buocHienTai, chuongDangLam, mayNaoDo, vaiHienTai } from '@/lib/song';
import type { Snapshot, StreamEvent } from '@/lib/types';
import type { CongDoanSong } from '@/lib/useStudio';

/**
 * THẺ "ĐANG LÀM" — điểm nhấn duy nhất của màn Tiến độ.
 *
 * Gộp ba thứ trước đây là ba dải chồng nhau (dải trạng thái, dải việc tiếp theo, trục sản
 * xuất) vào MỘT thẻ trả lời một câu: "truyện đang ở đâu, và việc gì đang diễn ra". Thẻ chỉ lo
 * phần đầu (trạng thái · chương · bước); phần thân do người gọi truyền vào qua ba khe, vì luật
 * đổi dải (`DaiTrangThai` lúc chạy, `ViecTiepTheo` lúc nghỉ) vẫn nằm ở `BuongLai.tsx`.
 *
 * Câu trạng thái đọc CÙNG khóa với thanh dưới (`mayNaoDo`) chứ không tự suy: hai chỗ trên một
 * màn hình nói hai điều về cùng một engine là lớp lỗi dự án này đã trả giá — xem lib/song.ts.
 */
export function TheDangLam({
  snapshot,
  song,
  dangChay,
  viec,
  truc,
  chiTiet,
  ket,
  onChonKhu,
  suKien = [],
}: {
  snapshot: Snapshot;
  /** Dòng sự kiện — đọc các lần `save_foundation[…]` để dựng dải bốn chặng dựng nền. */
  suKien?: StreamEvent[];
  song: CongDoanSong | undefined;
  dangChay: boolean;
  /**
   * Engine đang thử lại mãi một lỗi (xem `phatHienKet`). Có thì thẻ nói "Đang kẹt" bằng màu
   * hổ phách thay cho "Đang viết" — thanh dưới vẫn báo máy chạy, nhưng chạy mà không gọi được
   * lượt nào thì với người dùng là kẹt, và họ cần biết ngay chỗ để gỡ.
   */
  ket?: TinhTrangKet;
  onChonKhu?: (k: Khu) => void;
  /** Khe dưới phần đầu — câu việc tiếp theo kèm nút, lúc máy nghỉ. */
  viec?: ReactNode;
  /** Trục toàn truyện. */
  truc: ReactNode;
  /** Khe cuối thẻ — vai, việc tồn, ngữ cảnh, lúc máy chạy. */
  chiTiet?: ReactNode;
}) {
  const cua = trangThaiCua(snapshot.advance, snapshot.runtime, snapshot.stop);
  const vai = vaiHienTai(snapshot, song?.vai);
  const ncc = snapshot.transport.last_call?.provider;
  // Engine tự dừng (bế tắc, hết ngân sách): thẻ nói "Đã tự dừng" và vì sao, thay cho một chữ
  // "Tạm dừng" trơn — chữ ấy đọc ra là "bạn dừng nó, bấm chạy là xong".
  const tuDung = !dangChay && !ket && !cua.dangCho ? lyDoTuDung(snapshot, ncc) : undefined;
  const tt = ket
    ? { ma: 'ket', nhan: LOI_LLM.dangKet, mau: 'amber', phu: undefined }
    : tuDung
      ? { ma: 'tuDung', nhan: LOI_LLM.daTuDung, mau: 'red', phu: undefined }
      : trangThaiThe(snapshot, cua.dangCho, dangChay);
  // Chưa có chương nào và Kiến trúc sư đang làm (hoặc truyện còn ở chặng dựng nền): việc
  // đang diễn ra là DỰNG NỀN, không phải "Chương 1". Nêu số chương ở đây là hứa một chương
  // chưa tồn tại — và trên truyện thật, chương ấy chưa có cả dàn ý.
  const dungNen = laDungNen(snapshot, vai);
  const dangLamSo = dangChay ? chuongDangLam(snapshot) : undefined;
  // Đang sửa lại một chương ĐÃ XONG (trả về viết lại, góp ý hồi tố): dải năm bước là của luồng
  // viết chương mới, vẽ nó ở đây là nói "đang lên kế hoạch chương 2" trong lúc đang sửa chương 1.
  const suaLai = dangLamSo !== undefined && dangLamSo <= snapshot.book.completed_chapters;
  const chuong = dungNen
    ? undefined
    : chuongCuaThe(
        snapshot,
        cua.dangCho ? chuongChoDuyet(cua, snapshot.book.completed_chapters) : dangLamSo,
        dangChay,
      );
  const hien = buocHienTai(snapshot, song);
  const buoc =
    dangChay && !dungNen && !suaLai
      ? buocCuaChuong(hien, snapshot.transport.last_step, denLuotBienTap(snapshot))
      : undefined;
  const buocNen = dangChay && dungNen && !ket ? buocDungNen(suKien) : undefined;
  // Đồng hồ của BƯỚC đang chạy, không phải của phiên: một bước viết nháp đứng im hai phút trên
  // màn hình đọc ra là treo; một con số nhích từng giây nói nó vẫn đang làm.
  // Không biết bước (model đang nghĩ một lượt dài, chưa gọi công cụ nào) thì đếm thời gian của
  // VAI: một lượt không stream của Kiến trúc sư đứng im cả phút là lúc người dùng cần thấy số
  // nhích nhất.
  const batDauBuoc = useMocBatDau(
    dangChay && !ket ? `${vai}|${hien.dangChay ? hien.buoc : ''}` : undefined,
    hien.dangChay ? hien.luc : undefined,
  );
  return (
    <section className="the tdDangLam" data-tt={tt.ma} aria-label={TD.theDangLam}>
      <p className="tdTt">
        <span className={`tdDot ${tt.mau}${dangChay && !ket ? ' dap' : ''}`} aria-hidden="true" />
        <span className="tdTtNhan">{tt.nhan}</span>
        {tt.phu ? <span className="tdTtPhu">· {tt.phu}</span> : null}
      </p>

      {chuong ? (
        <h2 className="tdChuong">
          {CHU.chuong} {so(chuong.so)}
          {chuong.ten ? <> · {chuong.ten}</> : null}
        </h2>
      ) : dungNen && (dangChay || ket) ? (
        <h2 className="tdChuong">{LOI_LLM.dungNen}</h2>
      ) : null}

      {ket ? (
        <div className="tdKet" role="status">
          <p className="tdMoTa" title={ket.loi.tho}>
            {cauLoi(ket.loi)}
          </p>
          {onChonKhu ? (
            <button type="button" className="nutPhu" onClick={() => onChonKhu('cau-hinh')}>
              {LOI_LLM.moCauHinh}
            </button>
          ) : null}
        </div>
      ) : tuDung ? (
        <div className="tdKet" role="status">
          <p className="tdMoTa" title={tuDung.loi?.tho}>
            {tuDung.loi ? cauLoi(tuDung.loi) : tuDung.lyDo}
          </p>
          {tuDung.loi && tuDung.lyDo ? (
            <p className="tdMoTaPhu">{LOI_LLM.tuDungLyDo(tuDung.lyDo)}</p>
          ) : null}
          {onChonKhu && tuDung.kind === 'stuck' ? (
            <button type="button" className="nutPhu" onClick={() => onChonKhu('cau-hinh')}>
              {LOI_LLM.moCauHinh}
            </button>
          ) : null}
        </div>
      ) : dangChay ? (
        <p className="tdMoTa" title={song?.buoc}>
          {moTa(song, hien, vai, buoc, ncc)}
          {batDauBuoc ? <DemGiay tu={batDauBuoc} /> : null}
        </p>
      ) : null}
      {dungNen && dangChay && !ket ? <p className="tdMoTaPhu">{LOI_LLM.dungNenPhu}</p> : null}
      {buoc ? <DaiBuoc ten={BUOC_CHUONG} b={buoc} /> : null}
      {buocNen ? <DaiBuoc ten={BUOC_NEN} b={buocNen} /> : null}

      {viec}

      <div className="tdTruc" role="group" aria-label={DH.tienDoToanTruyen}>
        {truc}
      </div>

      {chiTiet}
    </section>
  );
}

/* ── trạng thái của thẻ ─────────────────────────────────────────────── */

function trangThaiThe(
  snap: Snapshot,
  choDuyet: boolean,
  dangChay: boolean,
): { ma: string; nhan: string; mau: string; phu?: string } {
  if (choDuyet) return { ma: 'cho', nhan: TD.choBanDuyet, mau: 'violet' };

  const khoa = mayNaoDo(snap.runtime, snap.book.activity);
  const may = TRANG_THAI_MAY_RUNTIME[khoa];
  const nhan = viethoa(may.nhan);
  const ms = snap.transport.elapsed_ms;

  if (dangChay) {
    return {
      ma: 'chay',
      nhan: DH.dangViet,
      mau: 'gold',
      phu: ms !== undefined && ms > 0 ? TD.daChay(ms) : undefined,
    };
  }
  if (snap.book.phase === 'complete') return { ma: 'xong', nhan, mau: 'teal' };
  return { ma: khoa, nhan, mau: may.mau };
}

function viethoa(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

/**
 * Chương mà thẻ nói tới.
 *
 * Ưu tiên: chương đang chờ duyệt → chương đang soạn (store khai) → chương kế tiếp khi máy
 * đang chạy hoặc truyện còn dở. Truyện đã xong thì không có chương nào để nêu.
 */
function chuongCuaThe(
  snap: Snapshot,
  choDuyet: number | undefined,
  dangChay: boolean,
): { so: number; ten?: string } | undefined {
  const b = snap.book;
  const soan =
    choDuyet ??
    snap.in_progress_chapter ??
    snap.chapters.find((r) => r.stage === 'drafting')?.chapter;
  let n = soan;
  if (n === undefined && b.phase !== 'complete' && (dangChay || b.completed_chapters > 0)) {
    const ke = b.completed_chapters + 1;
    if (b.total_chapters === 0 || ke <= b.total_chapters) n = ke;
  }
  if (n === undefined || n <= 0) return undefined;
  return { so: n, ten: snap.chapters.find((r) => r.chapter === n)?.title };
}

/* ── năm bước của một chương ────────────────────────────────────────── */

/**
 * Mã bước → vị trí trong `BUOC_CHUONG`.
 *
 * Nhận cả hai dạng: mã checkpoint (`draft`, `consistency_check`…, xem `ownersFromSteps`) và
 * tên lời gọi tool trong dòng SSE (`draft_chapter(chương 2)`, `check_consistency(...)`). Mã
 * lạ trả `undefined` — thà không sáng bước nào còn hơn sáng nhầm.
 */
export function chiSoBuoc(ma: string | undefined): number | undefined {
  if (!ma) return undefined;
  const t = ma.trim().toLowerCase();
  if (/^plan/.test(t)) return 0;
  if (/^(draft|edit)/.test(t)) return 1;
  if (/^(consistency|check_consistency)/.test(t)) return 2;
  if (/^commit/.test(t)) return 3;
  if (/^(review|save_review)/.test(t)) return 4;
  return undefined;
}

export interface BuocChuong {
  /** Bước đang sáng. */
  hienTai: number;
  /** Bước ấy đang chạy thật (SSE báo chưa xong), hay chỉ là bước KẾ sau bước vừa xong. */
  dangLam: boolean;
  /** Bước vừa xong, để câu mô tả nói được "vừa xong X". */
  vuaXong?: number;
}

/**
 * Suy bước hiện tại của chương.
 *
 * Dòng SSE thắng checkpoint: nó biết bước ĐANG chạy, còn `transport.last_step` chỉ biết bước
 * VỪA XONG (observer không ghi sự kiện "bắt đầu"). Xong bước cuối thì vòng lại bước đầu — đó
 * là chương kế.
 */
export function buocCuaChuong(
  song: { buoc?: string; dangChay: boolean } | undefined,
  lastStep: string | undefined,
  bienTap = false,
): BuocChuong | undefined {
  const tuSong = chiSoBuoc(song?.buoc);
  if (tuSong !== undefined && song?.dangChay) return { hienTai: tuSong, dangLam: true };
  // Đang chạy một công cụ PHỤ (đọc tài liệu, đọc lại chương): nó phục vụ bước KẾ, nên bước kế
  // sáng như đang làm — không phải như "bước kế tiếp" đứng chờ.
  const phu = !!song?.dangChay && tuSong === undefined;
  const xong = (phu ? undefined : tuSong) ?? chiSoBuoc(lastStep);
  if (xong === undefined) return phu ? { hienTai: 0, dangLam: true } : undefined;
  // Chốt xong KHÔNG phải lúc nào cũng tới biên tập: Biên tập viên chấm định kỳ (mỗi
  // `CHU_KY_BIEN_TAP` chương (lib/nhanXetDinhKy.ts), hoặc cuối hồi ở truyện phân tầng). Ngoài lượt đó, sau Chốt là
  // Kế hoạch của chương kế — đúng việc engine làm. Bản trước luôn sáng "Biên tập" và nói
  // "kế tiếp là biên tập" trong lúc engine đã lên kế hoạch chương sau.
  const ke = xong === 3 && !bienTap ? 0 : (xong + 1) % BUOC_CHUONG.length;
  return { hienTai: ke, dangLam: phu, vuaXong: xong };
}


function moTa(
  song: CongDoanSong | undefined,
  hien: BuocHienTai,
  vai: string | undefined,
  b: BuocChuong | undefined,
  ncc?: string,
): string {
  const ai = vai ? nhanVai(vai) : 'AI';
  // Bước đang chạy là một công cụ PHỤ hoặc một lần giao việc: câu cụ thể ("đang đọc tài liệu
  // cho chương 3") nói nhiều hơn câu chung của bước ("đang lập kế hoạch") — dải năm bước bên
  // dưới đã nói bước nào rồi.
  const phu = hien.dangChay && !!hien.buoc && chiSoBuoc(hien.buoc) === undefined;
  if (b?.dangLam && !phu) return TD.moTaDangLam(ai, b.hienTai);
  if (!phu && b?.vuaXong === 3 && b.hienTai === 0) return TD.moTaXongChuong(ai);
  if (!phu && b?.vuaXong !== undefined) return TD.moTaVuaXong(ai, b.vuaXong, b.hienTai);
  const buoc = phu ? hien.buoc : song?.buoc;
  if (buoc) {
    // Lỗi LLM, giao việc và công cụ đi qua cùng một chỗ dịch với thanh dưới và Diễn biến;
    // nguyên văn nằm ở `title` của dòng.
    const loi = giaiLoi(buoc, { ncc, vai });
    if (loi) return cauLoi(loi);
    if (buoc === song?.buoc && song.loai?.toUpperCase() === 'DISPATCH') {
      const viec = /\(([\s\S]*)\)\s*$/.exec(buoc)?.[1]?.trim();
      return TD.moTaGiaoViec(ai, viec);
    }
    const dang = phu || !!song?.dangChay;
    const congCu = giaiCongCu(buoc);
    if (congCu) return dang ? TD.moTaDangCongCu(ai, congCu) : TD.moTaVuaCongCu(ai, congCu);
    return TD.moTaTho(ai, giaiGiaoViec(buoc) ?? buoc);
  }
  return TD.moTaChoLuot;
}

/** Chặng dựng nền: chưa có chương nào xong và việc đang ở tay Kiến trúc sư / chặng trước viết. */
export function laDungNen(snap: Snapshot, vai: string | undefined): boolean {
  const b = snap.book;
  if (b.completed_chapters > 0 || b.phase === 'complete') return false;
  if (snap.in_progress_chapter) return false;
  if (vai && nhanVai(vai) === nhanVai('architect')) return true;
  return ['init', 'premise', 'outline'].includes(b.phase);
}

/**
 * Dải năm bước. Mỗi ô mang CẢ chữ trạng thái cho trình đọc màn hình — màu không bao giờ là
 * kênh duy nhất (PRODUCT.md, luật 5); mắt thì phân biệt bằng nền, viền và độ đậm.
 */
function DaiBuoc({ ten: dsTen, b }: { ten: readonly string[]; b: BuocChuong }) {
  return (
    <ol
      className="tdBuoc"
      aria-label={TD.buocVung}
      style={{ '--so-buoc': dsTen.length } as React.CSSProperties}
    >
      {dsTen.map((ten, i) => {
        const loai = i < b.hienTai ? 'xong' : i === b.hienTai ? 'dang' : 'chua';
        const nhan =
          loai === 'xong'
            ? TD.buocXong
            : loai === 'dang'
              ? b.dangLam
                ? TD.buocDangLam
                : TD.buocTiepTheo
              : TD.buocChua;
        return (
          <li
            key={ten}
            className={`${loai}${loai === 'dang' && b.dangLam ? ' dap' : ''}`}
            aria-current={loai === 'dang' ? 'step' : undefined}
          >
            {ten}
            <span className="td-an">, {nhan}</span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Chặng dựng nền đang ở đâu, đọc từ các lần `save_foundation[phần]` trong dòng sự kiện.
 *
 * Chỉ tin cái ĐÃ THẤY: chặng nào chưa có sự kiện lưu thì là "chưa", kể cả khi trang được mở
 * giữa chừng và các lần lưu trước đó nằm ngoài dòng sự kiện của lần xem này. Đoán "chắc đã
 * xong" từ thứ tự là vẽ một dấu xong không ai đo.
 */
export function buocDungNen(suKien: readonly StreamEvent[]): BuocChuong {
  const CHANG: Record<string, number> = {
    premise: 0,
    characters: 1,
    relationships: 1,
    world_rules: 2,
    timeline: 2,
    foreshadow: 2,
    style: 2,
    outline: 3,
    layered_outline: 3,
  };
  let xong = -1;
  for (const e of suKien) {
    const m = /^\s*save_foundation\s*\[([^\]]+)\]/.exec(e.summary ?? '');
    const c = m ? CHANG[m[1]!.trim()] : undefined;
    if (c !== undefined && c > xong) xong = c;
  }
  const hienTai = Math.min(xong + 1, BUOC_NEN.length - 1);
  return { hienTai, dangLam: true, vuaXong: xong >= 0 ? xong : undefined };
}

/**
 * Mốc bắt đầu của bước đang chạy. Dòng sự kiện biết giờ bắt đầu thì dùng nó; cây vai không
 * mang giờ, nên khi chỉ biết qua cây vai thì đếm từ lúc trang THẤY bước ấy — ghi chú để ai
 * đọc con số biết nó là "đã thấy chạy bao lâu", không phải "đã chạy bao lâu" tuyệt đối.
 */
function useMocBatDau(khoa: string | undefined, luc: string | undefined): string | undefined {
  const [moc, datMoc] = useState<{ khoa: string; luc: string } | undefined>();
  useEffect(() => {
    if (!khoa) return datMoc(undefined);
    datMoc((cu) => (cu?.khoa === khoa ? cu : { khoa, luc: luc ?? new Date().toISOString() }));
  }, [khoa, luc]);
  return khoa && moc?.khoa === khoa ? (luc ?? moc.luc) : undefined;
}

/** "· 0:42" nhích từng giây kể từ `tu`. Tự dừng khi gỡ khỏi cây. */
export function DemGiay({ tu }: { tu: string }) {
  const [bay, datBay] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => datBay(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const giay = Math.max(0, Math.floor((bay - Date.parse(tu)) / 1000));
  if (!Number.isFinite(giay)) return null;
  const phut = Math.floor(giay / 60);
  return (
    <span className="tdDem" aria-hidden="true">
      {' · '}
      {phut}:{String(giay % 60).padStart(2, '0')}
    </span>
  );
}

/* ── cột "Phiên này" ─────────────────────────────────────────────────── */

/**
 * Số liệu của phiên dạng khóa–giá trị. Mỗi số trả lời một câu vận hành (PRODUCT.md, luật 3):
 * đã tới đâu, nhanh cỡ nào, mỗi chương tốn bao nhiêu, đã tiêu bao nhiêu, đang dùng model gì.
 *
 * Số nào chưa có nguồn thì nói "chưa đủ số liệu", không điền 0: tốc độ 0 chương/giờ và "phiên
 * quá ngắn để đo" là hai chuyện khác nhau.
 */
export function PhienNay({ snapshot }: { snapshot: Snapshot }) {
  const t = snapshot.transport;
  const b = snapshot.book;
  const toc = nangSuat(t.chapters_per_hour);
  const gia = donGia(t.cost_per_chapter);
  const chay = daChay(t.elapsed_ms);

  // `last_call` là lượt gọi thật gần nhất (có tên nhà cung cấp); `t.model` chỉ là model mặc
  // định lúc mở phiên — cùng luật với thanh dưới.
  const lc = t.last_call;
  const modelLuot = lc ? `${lc.provider} · ${lc.model}` : t.model;
  const vaiLuot = lc?.agent ?? t.agent;

  return (
    <aside className="the tdPhien" aria-label={TD.phienNay}>
      <h2>{TD.phienNay}</h2>
      <dl className="tdKv">
        <dt>{TD.daXong}</dt>
        <dd>
          {so(b.completed_chapters)}
          {b.total_chapters > 0 ? <span className="mo"> / {so(b.total_chapters)}</span> : null}
        </dd>

        <dt>{TD.tocDo}</dt>
        <dd title={toc ? undefined : DH.phienQuaNgan}>
          {toc ? TD.chuongMoiGio(toc) : <span className="mo">{TD.chuaDo}</span>}
        </dd>

        <dt>{TD.gia}</dt>
        <dd>{gia ? TD.moiChuong(gia) : <span className="mo">{TD.chuaDo}</span>}</dd>

        <dt>{TD.daTieu}</dt>
        <dd>{tongTien(t.cost_usd) ?? <span className="mo">{TD.chuaDo}</span>}</dd>

        {b.total_words > 0 ? (
          <>
            <dt>{TD.soChu}</dt>
            <dd>{so(b.total_words)}</dd>
          </>
        ) : null}

        {chay ? (
          <>
            <dt>{TD.thoiGian}</dt>
            <dd>{chay}</dd>
          </>
        ) : null}

        <dt>{TD.model}</dt>
        <dd className="tdModel" title={modelLuot}>
          {modelLuot ? (
            <>
              {vaiLuot ? <span className="mo">{nhanVai(vaiLuot)} · </span> : null}
              <code>{modelLuot}</code>
            </>
          ) : (
            <span className="mo">{CHU.khongCo}</span>
          )}
        </dd>
      </dl>
    </aside>
  );
}
