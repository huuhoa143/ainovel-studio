'use client';

import { useState } from 'react';

import { CAU_DUNG, LOI_LLM, NHAT_KY_VAO } from '@/lib/chu/tien-do';
import { gio, ngayGio, ngayNgan, thoiLuong } from '@/lib/dinhdang';
import { giaiCongCu } from '@/lib/congCu';
import { cauLoi, giaiGiaoViec, gopSuKien } from '@/lib/loiLlm';
import { GIAI_THICH, nhanPhanQuyet, nhanVai, DH } from '@/lib/nhan';
import type { Decision, StreamEvent } from '@/lib/types';

/**
 * Nhật ký phán quyết — hiện thân của nguyên tắc "máy tất định phải nhìn thấy
 * được là tất định".
 *
 * Mỗi dòng: giờ, loại phán quyết, lý do dựa trên sự thật, nút xem lại. Nút xem
 * lại chỉ hiện khi thật sự có `decision` thô để mở ra; phán quyết thất bại
 * (chỉ có `error`) thì không có gì để replay và nút sẽ là một lời hứa hụt.
 */
export function NhatKy({ decisions }: { decisions: Decision[] | undefined }) {
  const ds = decisions ?? [];
  if (ds.length === 0) {
    return <p className="trongSect">{GIAI_THICH.chuaCoPhanQuyet}</p>;
  }
  return (
    <div className="log">
      {ds.map((d) => (
        <DongPhanQuyet key={d.id} d={d} />
      ))}
    </div>
  );
}

/** Dòng ngày nhỏ dưới giờ — chỉ hiện khi mốc không thuộc hôm nay. Xem `ngayNgan`. */
function MocNgay({ iso }: { iso: string | undefined }) {
  const ngay = ngayNgan(iso);
  return ngay ? <span className="mocNgay">{ngay}</span> : null;
}

function DongPhanQuyet({ d }: { d: Decision }) {
  const [mo, setMo] = useState(false);
  const { giai, mau } = nhanPhanQuyet(d.kind, d.decision);
  const coTho = d.decision !== undefined && d.decision !== null;
  const tl = thoiLuong(d.duration_ms);

  return (
    <div className="entry">
      <time dateTime={d.at} title={ngayGio(d.at)}>
        {gio(d.at) ?? '—'}
        <MocNgay iso={d.at} />
      </time>

      <span className={`kind ${mau}`} title={d.kind}>
        <span className="giai">{giai || d.kind}</span>
      </span>

      <span className="why">
        {d.reason ? d.reason : <span className="trong">{DH.khongGhiLyDo}</span>}
        {d.input ? (
          <span className="vao">
            {nhanDauVao(d.kind)} {d.input}
          </span>
        ) : null}
        {d.error ? <span className="loi">{DH.loi} {d.error}</span> : null}
        <span className="vao">
          <b>{nhanVai(d.decider)}</b>
          {d.model ? ` · ${d.model}` : ''}
          {tl ? ` · ${tl}` : ''}
        </span>
        {mo && coTho ? (
          <pre className="thoBanQuyet">{JSON.stringify(d.decision, null, 2)}</pre>
        ) : null}
      </span>

      <button
        type="button"
        className="replay"
        hidden={!coTho}
        aria-expanded={mo}
        onClick={() => setMo((v) => !v)}
      >
        {mo ? DH.anChiTiet : DH.xemChiTiet}
      </button>
    </div>
  );
}

/**
 * Đầu vào của quyết định là chữ của AI hay của bạn — theo loại. `plan_start` mang ý tưởng
 * lúc tạo truyện; gọi nó là "Góp ý" là gán cho người dùng một việc họ chưa làm.
 */
function nhanDauVao(kind: string): string {
  if (kind === 'plan_start') return NHAT_KY_VAO.yTuong;
  if (kind === 'intervention') return NHAT_KY_VAO.gopY;
  return NHAT_KY_VAO.khac;
}

/**
 * Dòng sự kiện trực tiếp từ engine.
 *
 * Khác nhật ký phán quyết: đây là chuyện đang xảy ra, đến qua SSE và không tồn
 * tại trong snapshot. Có nó thì mới trả lời được "dây chuyền còn chạy không"
 * mà không phải đọc log.
 */
export function DongSuKien({
  suKien,
  dangChay,
  ncc,
}: {
  suKien: StreamEvent[];
  /**
   * Máy còn chạy không — quyết định câu nào được nói ở ca RỖNG.
   *
   * Không suy được từ `suKien`: rỗng lúc máy chạy và rỗng lúc máy nghỉ trông giống hệt nhau
   * ở đây, mà chúng là hai chuyện khác nhau. Xem chú thích của `GIAI_THICH.chuaCoSuKienDangChay`
   * để biết phép đo đã bắt lỗi này.
   */
  dangChay?: boolean;
  /** Tên nhà cung cấp, để câu lỗi nói đúng nơi hỏng. */
  ncc?: string;
}) {
  if (suKien.length === 0) {
    return (
      <p className="trongSect">
        {dangChay ? GIAI_THICH.chuaCoSuKienDangChay : GIAI_THICH.chuaCoSuKienDangNghi}
      </p>
    );
  }
  // Xếp theo giờ và gộp các lần thử lại liền nhau của cùng một lỗi — xem `gopSuKien`.
  const dong = gopSuKien(suKien, { ncc });
  return (
    <div className="dong">
      {dong.map(({ ev, so, loi, daQua }) => {
        // Lỗi đã qua (sau nó máy còn làm được việc) thì không kèm lời khuyên đổi model, và
        // không tô đỏ: truyện vẫn đang chạy. Câu nói đúng điều đã xảy ra — "đã tự thử lại".
        const cauLoiDong = loi
          ? daQua
            ? `${cauLoi({ ...loi, thuLai: undefined }, false)}, ${LOI_LLM.daTuThuLai}.`
            : so > 1
              ? `${LOI_LLM.thuLaiNLan(so)} — ${cauLoi({ ...loi, thuLai: undefined })}`
              : cauLoi(loi)
          : undefined;
        const kindDung = (ev.payload as { Kind?: string } | undefined)?.Kind;
        const cau =
          cauLoiDong ??
          (kindDung ? CAU_DUNG[kindDung] : undefined) ??
          giaiGiaoViec(ev.summary) ??
          giaiCongCu(ev.summary) ??
          ev.summary;
        const laLoi = (ev.category === 'ERROR' || !!loi) && !daQua;
        return (
          <div key={ev.seq} className={`sk${laLoi ? ' loi' : ''}${daQua ? ' daQua' : ''}`}>
            <time dateTime={ev.time} title={ngayGio(ev.time)}>
              {gio(ev.time) ?? '—'}
              <MocNgay iso={ev.time} />
            </time>
            <span className="loai" title={ev.category ?? ev.kind}>
              {nhanLoaiSuKien(ev.category ?? ev.kind)}
            </span>
            <span className="tt" title={cau !== ev.summary ? ev.summary : undefined}>
              {cau ?? <span className="trong">{DH.khongMoTa}</span>}
              {ev.agent ? <span className="vai"> · {nhanVai(ev.agent)}</span> : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const LOAI_SU_KIEN: Record<string, string> = {
  SYSTEM: 'hệ thống',
  ERROR: 'lỗi',
  TOOL: 'công cụ',
  USER: 'bạn',
  DISPATCH: 'giao việc',
  DECISION: 'quyết định',
};

function nhanLoaiSuKien(ma: string | undefined): string {
  if (!ma) return '';
  return LOAI_SU_KIEN[ma.toUpperCase()] ?? ma.toLowerCase();
}
