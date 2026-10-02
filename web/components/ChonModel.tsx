'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { CH } from '@/lib/chu/cau-hinh';

/**
 * Ô chọn model — một combobox cho CẢ CẶP nhà cung cấp + model.
 *
 * # Vì sao một ô, không phải hai
 *
 * Bản trước có ô Nhà cung cấp và ô Model độc lập, và đó là gốc của ca hỏng đo được trên máy
 * người dùng: `openai · cx/gpt-5.5` — nhà cung cấp đúng tên, model của gateway khác. Một tên
 * model chỉ có nghĩa BÊN TRONG một nhà cung cấp, nên người dùng chọn một DÒNG trong danh sách
 * đã nhóm theo nhà cung cấp, và cặp đi cùng nhau. Không có đường nào dựng ra cặp không tồn tại.
 *
 * # Vì sao có ô tìm
 *
 * Một gateway thật trả 306 model. Một `datalist` 306 dòng không lọc được theo nhà cung cấp và
 * không nói được model nào đã lưu. Ô tìm lọc theo cả tên model lẫn tên nhà cung cấp.
 */

export interface NhomModel {
  provider: string;
  /** Model đã lưu trong cấu hình — đứng trước, và mang nhãn "đã lưu". */
  daKhai: string[];
  /** Model vừa tải từ nhà cung cấp. */
  daTai: string[];
  /** Nhóm không chọn được (vd. chưa có khóa) — vẫn hiện để người dùng biết nó tồn tại. */
  tat?: string;
  /** Có tải được danh sách không (có khóa, hoặc gateway không cần khóa). */
  taiDuoc: boolean;
  dangTai: boolean;
  daTaiLan: boolean;
  loi: string | null;
}

/** Một nhóm hiện tối đa chừng này dòng khi chưa gõ gì — đủ để quét mắt, không đủ để ngợp. */
const TRAN_NHOM = 40;

export function ChonModel({
  nhom,
  dangChon,
  nhanNut,
  nhanTruyCap,
  onChon,
  onTai,
  tat = false,
  chinh = false,
}: {
  nhom: NhomModel[];
  /** Cặp đang có hiệu lực — được đánh dấu trong danh sách. */
  dangChon?: { provider: string; model: string };
  nhanNut: string;
  /** Nhãn cho trình đọc màn hình, vd. "Đổi model cho Người viết". */
  nhanTruyCap: string;
  onChon: (provider: string, model: string) => void;
  onTai: (provider: string) => void;
  tat?: boolean;
  /** Nút dạng chính (tô vàng) — chỉ dùng cho điểm nhấn của màn. */
  chinh?: boolean;
}) {
  const [mo, datMo] = useState(false);
  const [tim, datTim] = useState('');
  const [tro, datTro] = useState(0);
  const goc = useRef<HTMLDivElement>(null);
  const oTim = useRef<HTMLInputElement>(null);
  const idDs = useId();

  // Đóng khi bấm ra ngoài. `mousedown` chứ không `click`: bấm vào một dòng phải chọn xong
  // trước khi ô đóng, còn bấm ra ngoài thì đóng ngay, không đợi nhả chuột.
  useEffect(() => {
    if (!mo) return;
    const ngoai = (e: MouseEvent) => {
      if (goc.current && !goc.current.contains(e.target as Node)) datMo(false);
    };
    document.addEventListener('mousedown', ngoai);
    return () => document.removeEventListener('mousedown', ngoai);
  }, [mo]);

  useEffect(() => {
    if (mo) oTim.current?.focus();
    else datTim('');
  }, [mo]);

  const q = tim.trim().toLowerCase();
  const hien = useMemo(
    () =>
      nhom
        .map((n) => {
          const tat = [...n.daKhai, ...n.daTai.filter((m) => !n.daKhai.includes(m))];
          const khopNcc = q !== '' && n.provider.toLowerCase().includes(q);
          const loc = q === '' || khopNcc ? tat : tat.filter((m) => m.toLowerCase().includes(q));
          const cat = q === '' ? loc.slice(0, TRAN_NHOM) : loc;
          return { ...n, khopNcc, dong: cat, con: loc.length - cat.length };
        })
        // Đang lọc thì nhóm không khớp tên và không còn dòng nào phải biến mất. Bản trước giữ
        // tiêu đề của mọi nhà cung cấp, nên gõ "lingo2" vẫn thấy lingoreup, 9Router, kiraai —
        // ba tiêu đề rỗng đứng trên kết quả duy nhất.
        .filter((n) => q === '' || n.khopNcc || n.dong.length > 0),
    [nhom, q],
  );
  // Danh sách PHẲNG các dòng chọn được, để phím mũi tên đi qua mọi nhóm như một danh sách.
  const phang = hien.flatMap((n) => (n.tat ? [] : n.dong.map((m) => ({ provider: n.provider, model: m }))));
  useEffect(() => datTro(0), [q]);

  const chon = (provider: string, model: string) => {
    datMo(false);
    onChon(provider, model);
  };

  return (
    <div className="chonModel" ref={goc}>
      <button
        type="button"
        className={chinh ? 'nutChinh' : 'nutPhu'}
        aria-haspopup="listbox"
        aria-expanded={mo}
        aria-label={nhanTruyCap}
        disabled={tat}
        onClick={() => datMo((x) => !x)}
      >
        {nhanNut}
      </button>
      {mo ? (
        <div className="chonModelPop" role="dialog" aria-label={nhanTruyCap}>
          <input
            ref={oTim}
            className="chonModelTim"
            role="combobox"
            aria-expanded="true"
            aria-controls={idDs}
            aria-autocomplete="list"
            aria-activedescendant={phang[tro] ? `${idDs}-${tro}` : undefined}
            placeholder={CH.timModel}
            value={tim}
            onChange={(e) => datTim(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                datTro((i) => Math.min(i + 1, phang.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                datTro((i) => Math.max(i - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                const d = phang[tro];
                if (d) chon(d.provider, d.model);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                datMo(false);
              }
            }}
          />
          <div className="chonModelDs" id={idDs} role="listbox" aria-label={nhanTruyCap}>
            {hien.map((n) => (
              <div key={n.provider} className="chonModelNhom" role="group" aria-label={n.provider}>
                <div className="chonModelDauNhom">
                  <span className="ten">{n.provider}</span>
                  {n.tat ? <span className="vien amber">{n.tat}</span> : null}
                  {!n.tat && n.taiDuoc ? (
                    <button
                      type="button"
                      className="chonModelTai"
                      disabled={n.dangTai}
                      onClick={() => onTai(n.provider)}
                    >
                      {n.dangTai ? CH.dangTaiDanhSach : n.daTaiLan ? CH.taiLaiDanhSach : CH.taiDanhSach}
                    </button>
                  ) : null}
                </div>
                {n.loi ? <p className="chonModelLoi">{n.loi}</p> : null}
                {!n.tat
                  ? n.dong.map((m) => {
                      const i = phang.findIndex((d) => d.provider === n.provider && d.model === m);
                      const dang = dangChon?.provider === n.provider && dangChon.model === m;
                      return (
                        <div
                          key={m}
                          id={`${idDs}-${i}`}
                          role="option"
                          aria-selected={dang}
                          className={`chonModelDong${i === tro ? ' tro' : ''}${dang ? ' dang' : ''}`}
                          onMouseEnter={() => datTro(i)}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => chon(n.provider, m)}
                        >
                          <span className="m">{m}</span>
                          {n.daKhai.includes(m) ? <span className="nhan">{CH.daKhai}</span> : null}
                          {dang ? <span className="dau" aria-hidden="true">✓</span> : null}
                        </div>
                      );
                    })
                  : null}
                {!n.tat && n.con > 0 ? <p className="chonModelCon">{CH.conNua(n.con)}</p> : null}
                {!n.tat && !n.daTaiLan && n.taiDuoc && q === '' ? (
                  <p className="chonModelCon">{CH.chuaTaiGoiY}</p>
                ) : null}
              </div>
            ))}
            {phang.length === 0 ? <p className="chonModelTrong">{CH.khongKhop}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
