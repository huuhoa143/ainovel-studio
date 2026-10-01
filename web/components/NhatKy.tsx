'use client';

import { useState } from 'react';

import { gio, ngayGio, thoiLuong } from '@/lib/dinhdang';
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

function DongPhanQuyet({ d }: { d: Decision }) {
  const [mo, setMo] = useState(false);
  const { giai, mau } = nhanPhanQuyet(d.kind);
  const coTho = d.decision !== undefined && d.decision !== null;
  const tl = thoiLuong(d.duration_ms);

  return (
    <div className="entry">
      <time dateTime={d.at} title={ngayGio(d.at)}>
        {gio(d.at) ?? '—'}
      </time>

      <span className={`kind ${mau}`} title={d.kind}>
        <span className="giai">{giai || d.kind}</span>
      </span>

      <span className="why">
        {d.reason ? d.reason : <span className="trong">{DH.khongGhiLyDo}</span>}
        {d.input ? <span className="vao">{DH.gopYVao} {d.input}</span> : null}
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
 * Dòng sự kiện trực tiếp từ engine.
 *
 * Khác nhật ký phán quyết: đây là chuyện đang xảy ra, đến qua SSE và không tồn
 * tại trong snapshot. Có nó thì mới trả lời được "dây chuyền còn chạy không"
 * mà không phải đọc log.
 */
export function DongSuKien({
  suKien,
  dangChay,
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
}) {
  if (suKien.length === 0) {
    return (
      <p className="trongSect">
        {dangChay ? GIAI_THICH.chuaCoSuKienDangChay : GIAI_THICH.chuaCoSuKienDangNghi}
      </p>
    );
  }
  return (
    <div className="dong">
      {suKien.map((ev) => (
        <div key={ev.seq} className={`sk${ev.category === 'ERROR' ? ' loi' : ''}`}>
          <time dateTime={ev.time} title={ngayGio(ev.time)}>
            {gio(ev.time) ?? '—'}
          </time>
          <span className="loai" title={ev.category ?? ev.kind}>
            {nhanLoaiSuKien(ev.category ?? ev.kind)}
          </span>
          <span className="tt">
            {ev.summary ?? <span className="trong">{DH.khongMoTa}</span>}
            {ev.agent ? <span className="vai"> · {nhanVai(ev.agent)}</span> : null}
          </span>
        </div>
      ))}
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
