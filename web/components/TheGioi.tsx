'use client';

import { useEffect, useMemo, useState } from 'react';

import { layTheGioi } from '@/lib/api';
import { CHU_TG } from '@/lib/chu/the-gioi';
import {
  CHU,
  THU_TU_NHOM_LUAT,
  nhanNhomLuat,
  nhanPhucBut,
} from '@/lib/nhan';
import type { ForeshadowEntry, WorldRule } from '@/lib/types';
import { useHoSo } from '@/lib/useHoSo';

import { HoSoKhung, MucRong, NutHienThem, chuanHoaTim, tinhTrangHoSo } from './HoSoKhung';

/**
 * Luật thế giới: mỗi nhóm một thẻ, mỗi luật đi kèm GIỚI HẠN của nó.
 *
 * Giới hạn không phải chú thích phụ mà là nửa quan trọng hơn của luật: `WorldRule.Boundary`
 * là điều không được vi phạm, và Biên tập viên bắt lỗi `critical` dựa trên chính nó
 * (assets/prompts/editor.md:129). Nên hai phần cùng cỡ chữ, giới hạn nằm trong một ô riêng
 * có nhãn, chứ không phải luật to và giới hạn bé.
 *
 * Lưới quan hệ nhân vật đã chuyển sang màn Nhân vật: đó là chuyện của nhân vật, và 500 cặp
 * quan hệ đứng dưới 10 luật làm màn này dài gấp chục lần phần nó thật sự nói.
 */
export function LuatTheGioi({ tacPham }: { tacPham: string | undefined }) {
  const tai = useHoSo(tacPham, layTheGioi);
  const tt = tinhTrangHoSo(tai);

  const luat = tai.du?.rules ?? null;

  return (
    <HoSoKhung
      tieuDe={CHU.luatTheGioi}
      motTa={luat && luat.length > 0 ? `${luat.length} luật thế giới` : undefined}
      lop="tg tgLuat"
    >
      {tt ?? (
        <div className="tgThan">
          {luat && luat.length > 0 ? (
            <ul className="tgLuatLuoi">
              {xepNhom(luat).map(([nhom, ds]) => (
                <li className="tgLuatThe" key={nhom}>
                  <h2>
                    {vietHoaDau(nhanNhomLuat(ds[0]!.category.trim() || nhom))}
                    {ds.length > 1 ? <span className="tgPhuNho">{CHU_TG.demLuat(ds.length)}</span> : null}
                  </h2>
                  <ul className="dsLuat">
                    {ds.map((r, i) => (
                      <li key={i}>
                        <p className="luat">{r.rule}</p>
                        {r.boundary ? (
                          <div className="ranh">
                            <span className="tgNhanPhu">{CHU.ranhGioi}</span>
                            <p>{r.boundary}</p>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          ) : (
            <section className="sect">
              <MucRong mang={luat} muc="luật thế giới" />
            </section>
          )}
        </div>
      )}
    </HoSoKhung>
  );
}

function vietHoaDau(s: string): string {
  return s ? s[0]!.toLocaleUpperCase('vi') + s.slice(1) : s;
}

/**
 * Nhóm luật theo thứ tự đã chốt, và nhóm lạ xếp cuối THEO NGUYÊN VĂN.
 *
 * Nhóm là chuỗi tự do trong dữ liệu (`WorldRule.Category` không phải Enum ở tầng schema),
 * nên bỏ qua nhóm lạ sẽ làm mất luật — mà mất một luật thế giới thì người dùng không biết
 * Biên tập viên đang chấm theo cái gì. Truyện thật dùng tên nhóm tự do ("Cửa xuyên giới",
 * "Lõi tinh thể"…), nên nhóm lạ giữ nguyên thứ tự xuất hiện trong tệp.
 */
function xepNhom(luat: WorldRule[]): [string, WorldRule[]][] {
  const theoNhom = new Map<string, WorldRule[]>();
  for (const r of luat) {
    const k = r.category.toLowerCase().trim() || 'other';
    const co = theoNhom.get(k);
    if (co) co.push(r);
    else theoNhom.set(k, [r]);
  }
  const bac = (k: string) => {
    const i = (THU_TU_NHOM_LUAT as readonly string[]).indexOf(k);
    return i < 0 ? THU_TU_NHOM_LUAT.length : i;
  };
  return [...theoNhom.entries()].sort((a, b) => bac(a[0]) - bac(b[0]));
}

/**
 * Phục bút: sổ nợ tự sự.
 *
 * # Không ngợp với 701 mục
 *
 * ĐO ĐƯỢC trên tác phẩm thật: 701 phục bút (139 mới gieo, 538 đang triển khai, 24 đã thu),
 * trung bình 180 ký tự một mục. Đổ hết ra là hàng trăm màn hình. Nên màn này có ba lớp:
 *
 *   1. Đếm theo trạng thái ở đầu, và chính các ô đếm là bộ lọc — một cú bấm là chỉ còn
 *      139 món nợ chưa trả.
 *   2. Ô tìm không cần gõ dấu, tìm cả mô tả lẫn mã.
 *   3. Hiện từng khúc 40 mục, nút "Hiện thêm" nói rõ còn bao nhiêu.
 *
 * Sắp xếp theo VIỆC TỒN, không theo số chương: phục bút mới gieo là món nợ chưa trả và là
 * thứ cần thấy trước; trong mỗi trạng thái, món gieo sớm nhất (nợ lâu nhất) đứng đầu.
 */
export function PhucBut({ tacPham }: { tacPham: string | undefined }) {
  const tai = useHoSo(tacPham, layTheGioi);
  const tt = tinhTrangHoSo(tai);

  const ds = tai.du?.foreshadow ?? null;
  const conNo = ds ? ds.filter((f) => f.status !== 'resolved').length : 0;

  const [loc, setLoc] = useState('');
  const [tim, setTim] = useState('');
  const [so, setSo] = useState(BUOC);
  useEffect(() => {
    setLoc('');
    setTim('');
    setSo(BUOC);
  }, [tacPham]);

  const xep = useMemo(
    () =>
      ds
        ? xepPhucBut(ds).map((f) => ({
            f,
            tt: f.status.toLowerCase().trim(),
            k: chuanHoaTim(`${f.description} ${f.id.replace(/_/g, ' ')}`),
          }))
        : [],
    [ds],
  );
  const dem = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of xep) m.set(x.tt, (m.get(x.tt) ?? 0) + 1);
    const biet = THU_TU_PHUC_BUT.filter((s) => m.has(s));
    const la = [...m.keys()].filter((s) => !THU_TU_PHUC_BUT.includes(s));
    return [...biet, ...la].map((s) => [s, m.get(s)!] as const);
  }, [xep]);

  const k = chuanHoaTim(tim);
  const hien = xep.filter((x) => (!loc || x.tt === loc) && (!k || x.k.includes(k)));
  const datLai = () => setSo(BUOC);

  return (
    <HoSoKhung
      tieuDe={CHU.phucBut}
      motTa={ds && ds.length > 0 ? `${ds.length} phục bút · ${conNo} ${CHU_TG.chuaThu}` : undefined}
      lop="tg tgPhucBut"
    >
      {tt ?? (
        <div className="tgThan">
          {ds && ds.length > 0 ? (
            <>
              <div className="tgPbCongCu">
                <div className="tgLoc" role="group" aria-label={CHU_TG.locTrangThai}>
                  <button
                    type="button"
                    className="tgLocNut"
                    aria-pressed={loc === ''}
                    onClick={() => {
                      setLoc('');
                      datLai();
                    }}
                  >
                    {CHU_TG.tatCa}
                    <span className="tgLocDem">{xep.length}</span>
                  </button>
                  {dem.map(([s, n]) => {
                    const nh = nhanPhucBut(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        className="tgLocNut"
                        data-tt={s}
                        aria-pressed={loc === s}
                        onClick={() => {
                          setLoc(loc === s ? '' : s);
                          datLai();
                        }}
                      >
                        <span className="ky" aria-hidden="true">
                          {nh.ky}
                        </span>
                        {vietHoaDau(nh.nhan)}
                        <span className="tgLocDem">{n}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="tgTimO oNhap">
                  <input
                    type="search"
                    value={tim}
                    onChange={(e) => {
                      setTim(e.target.value);
                      datLai();
                    }}
                    placeholder={CHU_TG.timPhucBut}
                    aria-label={CHU_TG.timPhucBut}
                  />
                </div>
              </div>

              <p className="tgDemHien" aria-live="polite">
                {CHU_TG.dangHien(Math.min(so, hien.length), hien.length)}
              </p>

              {hien.length > 0 ? (
                <ul className="dsPhucBut tgPbDs">
                  {hien.slice(0, so).map((x) => (
                    <MotPhucBut key={x.f.id} f={x.f} />
                  ))}
                </ul>
              ) : (
                <p className="trongSect tgPbRong">
                  {tim ? CHU_TG.khongKhopTim(tim) : CHU_TG.khongCoTrangThai}
                </p>
              )}

              <NutHienThem
                con={hien.length - so}
                buoc={BUOC}
                onThem={() => setSo((n) => n + BUOC)}
                nhan={CHU_TG.hienThem}
              />
            </>
          ) : (
            <section className="sect">
              <MucRong mang={ds} muc="phục bút" />
            </section>
          )}
        </div>
      )}
    </HoSoKhung>
  );
}

const BUOC = 40;

const THU_TU_PHUC_BUT = ['planted', 'advanced', 'resolved'];

function xepPhucBut(ds: ForeshadowEntry[]): ForeshadowEntry[] {
  const bac = (f: ForeshadowEntry) => {
    const i = THU_TU_PHUC_BUT.indexOf(f.status.toLowerCase().trim());
    return i < 0 ? THU_TU_PHUC_BUT.length : i;
  };
  return [...ds].sort((a, b) => bac(a) - bac(b) || a.planted_at - b.planted_at);
}

/**
 * Màu viên trạng thái của phục bút.
 *
 * KHÔNG dùng tông `gold` của `nhanPhucBut` cho "đang triển khai": vàng trong hệ này dành cho
 * hành động chính và chương đang viết, mà 538 viên vàng trên một màn thì vàng mất nghĩa.
 * Mới gieo là việc tồn (amber), đã thu là chuyện đã đóng (teal), đang triển khai trung tính.
 *
 * Cũng KHÔNG có nhịp đập: trạng thái phục bút là một mục trong sổ, không phải liveness — nó
 * không đổi khi engine tắt.
 */
const MAU_PB: Record<string, string> = { planted: 'amber', resolved: 'teal' };

function MotPhucBut({ f }: { f: ForeshadowEntry }) {
  const s = f.status.toLowerCase().trim();
  const tt = nhanPhucBut(f.status);
  return (
    <li data-tt={s}>
      <span className={`vien ${MAU_PB[s] ?? ''}`}>
        <span className="ky" aria-hidden="true">
          {tt.ky}
        </span>
        {tt.nhan}
      </span>
      <p className="tavan">{f.description}</p>
      {/* Hai mốc trong MỘT span không ngắt dòng: "ch. 12 → 30" bị xé ở giữa thì đọc ra
          như hai mốc rời. */}
      <span
        className="moc"
        title={
          f.resolved_at
            ? `${CHU.gieoOChuong(f.planted_at)} · ${CHU.thuOChuong(f.resolved_at)}`
            : CHU.gieoOChuong(f.planted_at)
        }
      >
        {CHU_TG.gieoThu(f.planted_at, f.resolved_at)}
      </span>
      <span className="ma">{f.id}</span>
    </li>
  );
}
