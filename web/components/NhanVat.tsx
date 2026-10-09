'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { layNhanVat, layTheGioi } from '@/lib/api';
import { CHU_TG } from '@/lib/chu/the-gioi';
import { CHU, GIAI_THICH, nhanHang } from '@/lib/nhan';
import type { Character, CharacterSnapshot, RelationshipEntry } from '@/lib/types';
import { useHoSo } from '@/lib/useHoSo';

import {
  HopGap,
  HoSoKhung,
  MucRong,
  NutHienThem,
  VongTen,
  chuanHoaTim,
  tinhTrangHoSo,
} from './HoSoKhung';

/**
 * Nhân vật: lưới thẻ để thấy cả dàn, panel chi tiết để đọc một người.
 *
 * # Hai câu hỏi, hai tầng
 *
 * Câu rẻ nhất — *"cuốn này có những ai"* — phải trả lời được trong một màn: tám thẻ, mỗi
 * thẻ mang tên, hạng, vai, bí danh và một dòng mô tả. Câu thứ hai — *"người này giờ ra
 * sao"* — tốn đúng một cú bấm và mở panel bên phải, lưới vẫn nằm nguyên để chuyển sang
 * người khác mà không phải cuộn lại.
 *
 * # Hồ sơ và hiện trạng KHÔNG trộn
 *
 * Hồ sơ là điều Kiến trúc sư đặt ra từ đầu (vai, tính cách, tuyến truyện), còn ảnh chụp là
 * điều đã XẢY RA tới cuối hồi gần nhất (`CharacterSnapshot`). Trộn lại thì không còn phân
 * biệt được "dự định" với "hiện trạng" — đúng thứ cần đối chiếu khi Biên tập viên báo nhân
 * vật hành xử lệch tính cách. Panel giữ hai khối riêng, có nhãn riêng.
 *
 * # Quan hệ đọc từ hồ sơ thế giới
 *
 * Lưới quan hệ nằm trong `/world`, không trong `/cast`. Nó là chuyện của nhân vật nên hiện
 * ở đây; lỗi đọc nó KHÔNG được làm hỏng cả màn — thiếu thì chỉ thiếu khối quan hệ.
 */
export function NhanVat({ tacPham }: { tacPham: string | undefined }) {
  const tai = useHoSo(tacPham, layNhanVat);
  const taiTG = useHoSo(tacPham, layTheGioi);
  const tt = tinhTrangHoSo(tai);

  const ds = tai.du?.characters ?? null;
  const anh = tai.du?.snapshots ?? null;
  const quanHe = taiTG.du?.relations ?? null;

  const [hang, setHang] = useState<string>('');
  const [chon, setChon] = useState<string | null>(null);
  useEffect(() => {
    setChon(null);
    setHang('');
  }, [tacPham]);

  const xep = useMemo(() => (ds ? xepTheoHang(ds) : []), [ds]);
  const demHang = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of xep) m.set(maHang(c), (m.get(maHang(c)) ?? 0) + 1);
    return THU_TU_HANG.filter((h) => m.has(h)).map((h) => [h, m.get(h)!] as const);
  }, [xep]);
  const hien = hang ? xep.filter((c) => maHang(c) === hang) : xep;
  const nguoiChon = chon ? xep.find((c) => c.name === chon) : undefined;

  const theRef = useRef(new Map<string, HTMLButtonElement>());
  const dong = () => {
    const ten = chon;
    setChon(null);
    if (ten) theRef.current.get(ten)?.focus();
  };

  return (
    <HoSoKhung
      tieuDe={CHU.nhanVat}
      motTa={ds && ds.length > 0 ? `${ds.length} nhân vật` : undefined}
      lop="tg tgNhanVat"
    >
      {tt ?? (
        <div className={nguoiChon ? 'tgThan tgNvBo coChon' : 'tgThan tgNvBo'}>
          <div className="tgNvChinh">
            {ds && ds.length > 0 ? (
              <>
                {demHang.length > 1 ? (
                  <div className="tgLoc" role="group" aria-label={CHU_TG.locHang}>
                    <NutLoc bat={hang === ''} onClick={() => setHang('')} nhan={CHU_TG.tatCa} dem={xep.length} />
                    {demHang.map(([h, n]) => (
                      <NutLoc
                        key={h}
                        bat={hang === h}
                        onClick={() => setHang(hang === h ? '' : h)}
                        nhan={vietHoaDau(nhanHang(h))}
                        dem={n}
                      />
                    ))}
                  </div>
                ) : null}

                {hien.length > 0 ? (
                  <ul className="tgNvLuoi">
                    {hien.map((c) => (
                      <li key={c.name}>
                        <TheNguoi
                          c={c}
                          dangChon={c.name === chon}
                          onChon={() => setChon(c.name === chon ? null : c.name)}
                          refNut={(el) => {
                            if (el) theRef.current.set(c.name, el);
                            else theRef.current.delete(c.name);
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="trongSect">{CHU_TG.khongKhopHang}</p>
                )}

                {/* Ảnh chụp là dữ liệu riêng và có thể vắng dù đã có nhân vật: Biên tập
                    viên chỉ ghi nó ở ranh giới hồi. */}
                {!anh || anh.length === 0 ? (
                  <p className="tgChuThich">{GIAI_THICH.khongCoAnhChup}</p>
                ) : null}
              </>
            ) : (
              <section className="sect">
                <MucRong mang={ds} muc="nhân vật" />
              </section>
            )}

            {quanHe && quanHe.length > 0 ? (
              <section className="sect tgQuanHeAll">
                <HopGap tieuDe={CHU_TG.tatCaQuanHe} phu={CHU_TG.demQuanHe(quanHe.length)}>
                  <DanhSachQuanHe ds={quanHe} />
                </HopGap>
              </section>
            ) : null}
          </div>

          {nguoiChon ? (
            <ChiTiet
              key={nguoiChon.name}
              c={nguoiChon}
              anh={anhCua(anh, nguoiChon.name)}
              quanHe={quanHe}
              onDong={dong}
            />
          ) : null}
        </div>
      )}
    </HoSoKhung>
  );
}

function NutLoc({
  bat,
  onClick,
  nhan,
  dem,
}: {
  bat: boolean;
  onClick: () => void;
  nhan: string;
  dem: number;
}) {
  return (
    <button type="button" className="tgLocNut" aria-pressed={bat} onClick={onClick}>
      {nhan}
      <span className="tgLocDem">{dem}</span>
    </button>
  );
}

/**
 * Thứ tự đọc: chủ chốt trước, thoáng qua sau.
 *
 * `tier` vắng nghĩa là `important` theo mặc định của server (internal/domain/story.go:26)
 * nên nó xếp cùng nhóm quan trọng, không rơi xuống cuối như một hạng không rõ.
 */
const THU_TU_HANG = ['core', 'important', 'secondary', 'decorative'];

function maHang(c: Character): string {
  return (c.tier ?? 'important').toLowerCase().trim() || 'important';
}

function xepTheoHang(ds: Character[]): Character[] {
  const bac = (c: Character) => {
    const i = THU_TU_HANG.indexOf(maHang(c));
    return i < 0 ? THU_TU_HANG.length : i;
  };
  return [...ds].sort((a, b) => bac(a) - bac(b));
}

function anhCua(
  anh: CharacterSnapshot[] | null,
  ten: string,
): CharacterSnapshot | undefined {
  return anh?.find((s) => s.name === ten);
}

function vietHoaDau(s: string): string {
  return s ? s[0]!.toLocaleUpperCase('vi') + s.slice(1) : s;
}

function TheNguoi({
  c,
  dangChon,
  onChon,
  refNut,
}: {
  c: Character;
  dangChon: boolean;
  onChon: () => void;
  refNut: (el: HTMLButtonElement | null) => void;
}) {
  const h = maHang(c);
  return (
    <button
      type="button"
      ref={refNut}
      className="tgNvThe"
      aria-pressed={dangChon}
      aria-controls="tgNvChiTiet"
      onClick={onChon}
    >
      {/* `.nguoidau` mang đủ thứ để CHỌN mà không phải mở: tên · hạng · vai · bí danh.
          Bí danh ở đây vì đó là tên người dùng hay gõ tìm trong trang. */}
      <span className="nguoidau">
        <VongTen ten={c.name} />
        <span className="tgNvTen">
          <span className="ten">{c.name}</span>
          <span className={`vien h-${h}`}>{nhanHang(c.tier)}</span>
        </span>
        {c.role ? <span className="vai">{c.role}</span> : null}
        {c.aliases && c.aliases.length > 0 ? (
          <span className="biDanh">{c.aliases.join(' · ')}</span>
        ) : null}
      </span>
      {c.description ? <span className="tgNvMoTa">{c.description}</span> : null}
    </button>
  );
}

const BUOC_QH = 6;

function ChiTiet({
  c,
  anh,
  quanHe,
  onDong,
}: {
  c: Character;
  anh: CharacterSnapshot | undefined;
  quanHe: RelationshipEntry[] | null;
  onDong: () => void;
}) {
  const nets = c.traits ?? [];
  const dauRef = useRef<HTMLHeadingElement>(null);
  const [soQH, setSoQH] = useState(BUOC_QH);

  // Panel mở thì tiêu điểm vào tên người: người dùng bàn phím đọc tiếp ngay chỗ vừa mở,
  // không phải tab qua cả lưới.
  useEffect(() => {
    dauRef.current?.focus({ preventScroll: true });
    dauRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, []);

  useEffect(() => {
    const phim = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDong();
    };
    window.addEventListener('keydown', phim);
    return () => window.removeEventListener('keydown', phim);
  }, [onDong]);

  const cuaNguoi = useMemo(
    () =>
      (quanHe ?? [])
        .filter((q) => q.character_a === c.name || q.character_b === c.name)
        .sort((a, b) => b.chapter - a.chapter),
    [quanHe, c.name],
  );

  return (
    <aside className="tgNvPanel" id="tgNvChiTiet" aria-label={c.name}>
      <div className="tgPanelDau">
        <VongTen ten={c.name} lon />
        <div className="tgPanelTen">
          <h2 ref={dauRef} tabIndex={-1}>
            {c.name}
          </h2>
          <p>
            <span className={`vien h-${maHang(c)}`}>{nhanHang(c.tier)}</span>
            {c.role ? <span className="vai">{c.role}</span> : null}
          </p>
        </div>
        <button type="button" className="nutPhu tgNutNho" onClick={onDong}>
          {CHU_TG.dongChiTiet}
        </button>
      </div>

      <div className="tgPanelThan">
        {c.aliases && c.aliases.length > 0 ? (
          <p className="tgBiDanh">
            <span className="tgNhanPhu">{CHU_TG.biDanh}</span>
            {c.aliases.join(' · ')}
          </p>
        ) : null}

        {c.description ? <p className="tavan">{c.description}</p> : null}

        {nets.length > 0 ? (
          <div className="tgKhoi">
            <h3>{CHU.netTinhCach}</h3>
            <ul className="tgChips">
              {nets.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {c.arc ? (
          <div className="tgKhoi">
            <h3 title={CHU.duongDayDay}>{CHU.duongDay}</h3>
            <p className="tavan">{c.arc}</p>
          </div>
        ) : null}

        {anh ? (
          <div className="tgKhoi tgAnhChup">
            <h3>
              {CHU.trangThaiCuoiCung}
              <span className="tgPhuNho">{CHU_TG.cuoiHoi(anh.volume, anh.arc)}</span>
            </h3>
            <dl className="kv kvnguoi">
              {anh.status ? (
                <>
                  <dt>{CHU.hienTrang}</dt>
                  <dd>{anh.status}</dd>
                </>
              ) : null}
              {anh.motivation ? (
                <>
                  <dt>{CHU.dongLuc}</dt>
                  <dd>{anh.motivation}</dd>
                </>
              ) : null}
              {anh.power ? (
                <>
                  <dt>{CHU.nangLuc}</dt>
                  <dd>{anh.power}</dd>
                </>
              ) : null}
              {anh.relations ? (
                <>
                  <dt>{CHU.quanHe}</dt>
                  <dd>{anh.relations}</dd>
                </>
              ) : null}
            </dl>
          </div>
        ) : null}

        {quanHe ? (
          <div className="tgKhoi">
            <h3>
              {CHU_TG.quanHeVoi}
              {cuaNguoi.length > 0 ? <span className="tgPhuNho">{cuaNguoi.length}</span> : null}
            </h3>
            {cuaNguoi.length > 0 ? (
              <>
                <ul className="tgQH">
                  {cuaNguoi.slice(0, soQH).map((q, i) => (
                    <MotQuanHe key={i} q={q} ten={c.name} />
                  ))}
                </ul>
                <NutHienThem
                  con={cuaNguoi.length - soQH}
                  buoc={BUOC_QH * 2}
                  onThem={() => setSoQH((n) => n + BUOC_QH * 2)}
                  nhan={CHU_TG.hienThem}
                />
              </>
            ) : (
              <p className="trongSect">{CHU_TG.khongCoQuanHe}</p>
            )}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

/** Một quan hệ. `ten` = người đang xem: chỉ hiện người kia, vì người này đã là tiêu đề. */
function MotQuanHe({ q, ten }: { q: RelationshipEntry; ten?: string }) {
  const kia = ten === q.character_a ? q.character_b : ten === q.character_b ? q.character_a : null;
  return (
    <li>
      <div className="tgQHDau">
        {kia ? (
          <span className="ten">{kia}</span>
        ) : (
          <>
            <span className="ten">{q.character_a}</span>
            <span className="tgQHNoi" aria-hidden="true">
              ·
            </span>
            <span className="ten">{q.character_b}</span>
          </>
        )}
        <span className="tgPhuNho">{CHU_TG.oChuong(q.chapter)}</span>
      </div>
      <p>{q.relation}</p>
    </li>
  );
}

const BUOC_DS = 30;

/** Mọi quan hệ đã ghi: mới nhất trước, có ô tìm, hiện từng khúc. */
function DanhSachQuanHe({ ds }: { ds: RelationshipEntry[] }) {
  const [tim, setTim] = useState('');
  const [so, setSo] = useState(BUOC_DS);
  const xep = useMemo(
    () =>
      [...ds]
        .sort((a, b) => b.chapter - a.chapter)
        .map((q) => ({
          q,
          k: chuanHoaTim(`${q.character_a} ${q.character_b} ${q.relation}`),
        })),
    [ds],
  );
  const k = chuanHoaTim(tim);
  const loc = k ? xep.filter((x) => x.k.includes(k)) : xep;

  return (
    <div className="tgQHAll">
      <div className="tgTimO oNhap">
        <input
          type="search"
          value={tim}
          onChange={(e) => {
            setTim(e.target.value);
            setSo(BUOC_DS);
          }}
          placeholder={CHU_TG.timQuanHe}
          aria-label={CHU_TG.timQuanHe}
        />
        <span className="tgPhuNho">{CHU_TG.dangHien(Math.min(so, loc.length), loc.length)}</span>
      </div>
      {loc.length > 0 ? (
        <ul className="tgQH">
          {loc.slice(0, so).map((x, i) => (
            <MotQuanHe key={i} q={x.q} />
          ))}
        </ul>
      ) : (
        <p className="trongSect">{CHU_TG.khongKhopTim(tim)}</p>
      )}
      <NutHienThem
        con={loc.length - so}
        buoc={BUOC_DS}
        onThem={() => setSo((n) => n + BUOC_DS)}
        nhan={CHU_TG.hienThem}
      />
    </div>
  );
}
