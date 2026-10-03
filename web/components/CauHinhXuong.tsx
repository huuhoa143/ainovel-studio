'use client';

import { useEffect, useState } from 'react';

import {
  apDungCauHinh,
  layCauHinh,
  luuCauHinh,
  thuKetNoi,
  type KetQuaCongCu,
  type SuaCauHinh,
} from '@/lib/api';
import { CH } from '@/lib/chu/cau-hinh';
import { thanXoaNhaCungCap, vaiDungNhaCungCap, vaiGhimO } from '@/lib/chuyenNhaCungCap';
import { useModelNapVe, type ModelNapVe } from '@/lib/modelNapVe';
import { nhanKenhVai } from '@/lib/nhan';
import type { CauHinhDoc, MucModel, NhaCungCap } from '@/lib/types';

import { BieuTuong } from './BieuTuong';
import { HopXacNhan } from './HopXacNhan';
import { KenhVaiChung } from './KenhVaiChung';
import { TrangThaiLuu, useTrangThaiLuu } from './TrangThaiLuu';

/**
 * Model & khóa API — thiết lập dùng chung cho mọi truyện.
 *
 * # Bố cục: một câu hỏi chính, hai câu hỏi phụ
 *
 *   1. "Đang dùng" — truyện sẽ viết bằng gì. Điểm nhấn của màn, đứng đầu.
 *   2. "Nhà cung cấp" — nơi lấy model và khóa API. Danh sách gọn; sửa/thêm mở ngay tại chỗ.
 *   3. "Thiết lập khác" — kiểu văn và độ suy luận mặc định.
 *
 * Lần đầu (chưa có nhà cung cấp) chỉ hiện đúng bước cần làm: thêm một nhà cung cấp.
 *
 * # Một nguồn sự thật
 *
 * Mọi thứ hiện ra là bản `GET /api/config` trả về, và mọi lượt lưu xong đều nạp lại nó. Server
 * từ chối những lượt ghi không có tác dụng (bị tệp dùng chung che) thay vì báo "đã lưu" suông,
 * nên thứ trên màn hình luôn là thứ engine sẽ nạp.
 *
 * # Vì sao ô khóa luôn trống
 *
 * Server không bao giờ trả khóa (chỉ trả dạng che `sk-4…802`). Để trống lúc lưu nghĩa là "giữ
 * khóa cũ" — `api_key` chỉ được gửi khi người dùng thật sự gõ.
 */
export function CauHinhXuong({
  lanDau = false,
  onDoiCauHinh,
}: {
  lanDau?: boolean;
  /** Gọi sau MỖI lần lưu thành công. Tách khỏi lần nạp lúc mount. */
  onDoiCauHinh?: () => void;
}) {
  const [du, datDu] = useState<CauHinhDoc | null>(null);
  const [loi, datLoi] = useState<string | null>(null);
  const [dangTai, datDangTai] = useState(true);

  /** MỘT bộ nạp model cho cả màn: thẻ nhà cung cấp và ô chọn model hỏi cùng một câu. */
  const napVe = useModelNapVe();

  const tai = () => {
    datDangTai(true);
    layCauHinh()
      .then((d) => {
        datDu(d);
        datLoi(null);
      })
      .catch((e: unknown) => datLoi(e instanceof Error ? e.message : String(e)))
      .finally(() => datDangTai(false));
  };
  /** Sau khi lưu: nạp lại chính mình VÀ báo lên trên. Mọi đường lưu đều đi qua đây. */
  const daLuu = () => {
    tai();
    onDoiCauHinh?.();
  };

  useEffect(tai, []);

  const coNcc = !!du && du.providers.length > 0;

  return (
    <main className="canvas" id="cau-hinh">
      <div className="head">
        <h1>{lanDau ? CH.tieuDeLanDau : CH.tieuDe}</h1>
      </div>

      <div className="chThan">
        <p className="chGioiThieu">{lanDau || (du && !coNcc) ? CH.gioiThieuLanDau : CH.gioiThieu}</p>

        {loi ? (
          <div className="the chBao red" role="alert">
            <span>{loi}</span>
            <button type="button" className="nutPhu" onClick={tai}>
              {CH.taiLai}
            </button>
          </div>
        ) : null}
        {dangTai && !du ? <p className="chTrong">{CH.dangTai}</p> : null}

        {du ? (
          <>
            <PhienDangMo du={du} onDaApDung={tai} />
            {coNcc ? <KenhVaiChung du={du} napVe={napVe} onXong={daLuu} /> : null}
            <DanhSachNhaCungCap du={du} napVe={napVe} onXong={daLuu} />
            {coNcc ? <ThietLapKhac du={du} onXong={daLuu} /> : null}
            <p className="chTep">
              {du.base_path ? CH.haiTep(du.path, du.base_path) : CH.tepDangSua(du.path)}
            </p>
          </>
        ) : null}
      </div>
    </main>
  );
}

/* ── phiên đang mở ─────────────────────────────────────────────────────── */

/**
 * Truyện đang mở phiên giữ thiết lập lúc mở. Chỉ nói ra khi thiết lập ấy THẬT SỰ lệch tệp.
 *
 * "Áp dụng ngay" nạp lại phần MODEL từ tệp vào engine đang mở (`ApplyConfigFromDisk`), không
 * cần đóng rồi mở lại phiên. Kiểu văn vẫn chỉ ăn ở lần mở sau — câu phụ nói rõ.
 *
 * Bản trước hiện dải cho MỌI phiên đang mở và nhớ "đã áp dụng" bằng state phía web: phiên và
 * tệp cùng là lingo2·auto vẫn bị cảnh báo, bấm áp dụng xong dải vẫn nằm đó, tải lại trang thì
 * câu "vẫn dùng thiết lập lúc mở" quay về. Giờ server so phiên với tệp (`engine_stale`), áp dụng
 * xong thì nạp lại tờ cấu hình và dải tự biến mất — không còn bộ nhớ thứ hai để lệch.
 */
function PhienDangMo({ du, onDaApDung }: { du: CauHinhDoc; onDaApDung: () => void }) {
  const [vua, datVua] = useState<{ ten: string; luc: string } | null>(null);
  const lech = du.engine_stale ?? du.engine_open;
  const xacNhan = vua && !lech.includes(vua.ten) && (
    <p className="the chBao teal" role="status">
      {CH.phienDaApDung(vua.ten, vua.luc)}
    </p>
  );
  if (lech.length === 0) return xacNhan || null;
  return (
    <>
      {xacNhan}
      <div className="the chBao amber">
        {lech.map((ten) => (
          <MotPhien
            key={ten}
            ten={ten}
            onXong={() => {
              datVua({ ten, luc: gio(Date.now()) });
              onDaApDung();
            }}
          />
        ))}
        <span className="phu">{CH.kieuVanCanMoLai}</span>
      </div>
    </>
  );
}

function MotPhien({ ten, onXong }: { ten: string; onXong: () => void }) {
  const tt = useTrangThaiLuu();
  return (
    <div className="chPhien">
      <span>{CH.phienDangMo(ten)}</span>
      <span className="chPhienNut">
        <TrangThaiLuu tt={tt.tt} />
        <button
          type="button"
          className="nutPhu"
          disabled={tt.dang}
          onClick={() => void tt.chay(() => apDungCauHinh(ten), onXong)}
        >
          {tt.dang ? CH.dangApDung : CH.apDungNgay(ten)}
        </button>
      </span>
    </div>
  );
}

/* ── nhà cung cấp ──────────────────────────────────────────────────────── */

function DanhSachNhaCungCap({
  du,
  napVe,
  onXong,
}: {
  du: CauHinhDoc;
  napVe: ModelNapVe;
  onXong: () => void;
}) {
  const [dangSua, datDangSua] = useState<string | null>(null);
  const [themMoi, datThemMoi] = useState(du.providers.length === 0);
  // Mặc định lên đầu: đó là cái đang thật sự viết truyện.
  const ds = [...du.providers].sort(
    (a, b) => Number(b.name === du.provider) - Number(a.name === du.provider) || a.name.localeCompare(b.name),
  );

  return (
    <section className="the chNcc" aria-labelledby="ch-ncc">
      <div className="chDauThe">
        <h2 id="ch-ncc">{CH.nhaCungCap}</h2>
        {!themMoi ? (
          <button type="button" className="nutPhu" onClick={() => datThemMoi(true)}>
            <BieuTuong ten="cong" co={14} />
            {CH.themNcc}
          </button>
        ) : null}
      </div>

      {ds.length === 0 && !themMoi ? <p className="chTrong">{CH.chuaCoNcc}</p> : null}

      {themMoi ? (
        <div className="chPanel">
          <FormNhaCungCap
            du={du}
            onXong={() => {
              datThemMoi(false);
              onXong();
            }}
            onHuy={du.providers.length > 0 ? () => datThemMoi(false) : undefined}
          />
        </div>
      ) : null}

      {ds.length > 0 ? (
        <ul className="nccList">
          {ds.map((n) => (
            <li key={n.name} className={`nccMuc${dangSua === n.name ? ' dangSua' : ''}`}>
              <MotNhaCungCap
                n={n}
                du={du}
                napVe={napVe}
                dangSua={dangSua === n.name}
                onSua={() => datDangSua(dangSua === n.name ? null : n.name)}
                onXong={onXong}
              />
              {dangSua === n.name ? (
                <div className="chPanel">
                  <FormNhaCungCap
                    du={du}
                    cu={n}
                    onXong={() => {
                      // Đổi địa chỉ hay khóa thì mọi thứ đã biết về nhà cung cấp này hết giá trị.
                      napVe.xoa(n.name);
                      datDangSua(null);
                      onXong();
                    }}
                    onHuy={() => datDangSua(null)}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/**
 * Một dòng nhà cung cấp: tên, địa chỉ, khóa, số model, trạng thái kết nối, và thao tác.
 *
 * "Kiểm tra" là `GET /api/models` — gọi được = địa chỉ đúng và mạng thông; 200 = khóa còn
 * sống; có tên trong danh sách = model khai đúng. Miễn phí, không tốn một lượt chat.
 */
function MotNhaCungCap({
  n,
  du,
  napVe,
  dangSua,
  onSua,
  onXong,
}: {
  n: NhaCungCap;
  du: CauHinhDoc;
  napVe: ModelNapVe;
  dangSua: boolean;
  onSua: () => void;
  onXong: () => void;
}) {
  const tt = useTrangThaiLuu();
  const [hoiXoa, datHoiXoa] = useState(false);
  const laMacDinh = n.name === du.provider;
  const coKhoa = n.api_key_set || !!n.api_key_optional;
  const dungBoi = vaiDungNhaCungCap(du, n.name);
  const ghim = vaiGhimO(du, n.name);
  const dsModel = n.models ?? [];

  const dangKiem = napVe.dangNapCua(n.name);
  const loiKiem = napVe.loiCua(n.name);
  const daKiem = napVe.daHoi(n.name);
  const luc = napVe.lucCua(n.name);
  const dsThat = napVe.modelCua(n.name);

  // Tên ĐÃ LƯU mà nhà cung cấp không còn phục vụ. Danh sách trả về rỗng = gateway không liệt kê.
  const khaiLa = daKiem && dsThat.length > 0 ? dsModel.map((m) => m.name).filter((t) => !dsThat.includes(t)) : [];
  // Cửa sổ ngữ cảnh nhà cung cấp tự khai khác thứ đang lưu — nguồn đúng là chính gateway.
  const cuaLech = daKiem
    ? dsModel
        .map((m) => ({ ten: m.name, moi: napVe.cuaSoCua(n.name, m.name), cu: m.context_window ?? 0 }))
        .filter((x) => x.moi > 0 && x.moi !== x.cu)
    : [];

  const ghi = (than: SuaCauHinh) => tt.chay(() => luuCauHinh(than), onXong);

  return (
    <>
      <div className="nccDong">
        <div className="nccChinh">
          <div className="nccDau">
            <span className="nccTen">{n.name}</span>
            {laMacDinh ? <span className="vien gold">{CH.macDinh}</span> : null}
            <span className={`vien ${n.api_key_set ? 'teal' : n.api_key_optional ? '' : 'amber'}`}>
              {n.api_key_set ? CH.coKhoa(n.api_key_masked ?? '') : n.api_key_optional ? CH.khongCanKhoa : CH.chuaCoKhoa}
            </span>
          </div>
          <div className="nccPhu">
            {n.base_url ? <span className="m">{n.base_url}</span> : null}
            <span>{CH.soModel(dsModel.length)}</span>
            <span>{dungBoi.length > 0 ? CH.dungChoVai(dungBoi.map(nhanKenhVai).join(', ')) : CH.khongVaiNao}</span>
          </div>
        </div>
        <div className="nccKetNoi" aria-live="polite">
          {dangKiem ? (
            <span className="chTT dang">{CH.dangKiem}</span>
          ) : loiKiem ? (
            <span className="chTT loi" title={loiKiem}>
              <span aria-hidden="true">✗ </span>
              {CH.ketNoiLoi}
            </span>
          ) : daKiem ? (
            <>
              <span className="chTT xong">
                <span aria-hidden="true">✓ </span>
                {CH.ketNoiDuoc(dsThat.length, luc ? gio(luc) : '')}
              </span>
              <DongCongCu kq={napVe.congCuCua(n.name)} />
            </>
          ) : (
            <span className="chTT">{CH.chuaKiem}</span>
          )}
        </div>
        <div className="nccNut">
          <button
            type="button"
            className="nutPhu"
            onClick={() => napVe.nap(n.name, { congCu: true })}
            disabled={dangKiem || !coKhoa}
            title={coKhoa ? undefined : CH.canKhoaDeKiem}
          >
            {dangKiem ? CH.dangKiem : CH.kiemTra}
          </button>
          <button type="button" className="nutPhu" onClick={onSua} aria-expanded={dangSua} disabled={tt.dang}>
            {CH.sua}
          </button>
          <button
            type="button"
            className="nutPhu nguyHiem"
            disabled={tt.dang || laMacDinh}
            title={laMacDinh ? CH.khongXoaMacDinh : undefined}
            onClick={() => {
              tt.xoaLoi();
              datHoiXoa(true);
            }}
          >
            {CH.xoa}
          </button>
        </div>
      </div>

      {loiKiem ? <p className="chDongLoi">{loiKiem}</p> : null}
      {!hoiXoa ? <TrangThaiLuu tt={tt.tt} /> : null}
      {cuaLech.length > 0 ? (
        <p className="chCanhDong">
          <span>
            {CH.cuaSoLech(n.name, cuaLech.map((x) => `${x.ten} → ${x.moi.toLocaleString('vi')}`).join(', '))}
          </span>
          <button
            type="button"
            className="nutPhu"
            disabled={tt.dang}
            onClick={() =>
              void ghi({
                provider_config: {
                  name: n.name,
                  // Trải mục cũ rồi mới đè cửa sổ: `json_schema` không đi theo lượt ghi này.
                  models: dsModel.map((m) => ({
                    ...m,
                    context_window: napVe.cuaSoCua(n.name, m.name) || m.context_window,
                  })),
                },
              })
            }
          >
            {CH.ghiCuaSo}
          </button>
        </p>
      ) : null}
      {khaiLa.length > 0 ? <p className="chCanhDong">{CH.khaiLa(khaiLa.join(', '))}</p> : null}

      {hoiXoa ? (
        <HopXacNhan
          moRa
          tieuDe={CH.xoaTieuDe(n.name)}
          than={
            <>
              <p>{CH.xoaThan(ghim.map(nhanKenhVai).join(', '))}</p>
              {tt.tt.loai === 'loi' ? <p className="loiDoc">{tt.tt.loi}</p> : null}
            </>
          }
          nhanLam={CH.xoa}
          nhanDangLam={CH.dangXoa}
          dangLam={tt.dang}
          onHuy={() => datHoiXoa(false)}
          onLam={() =>
            void ghi(thanXoaNhaCungCap(du, n.name)).then((ok) => {
              if (ok) {
                napVe.xoa(n.name);
                datHoiXoa(false);
              }
            })
          }
        />
      ) : null}
    </>
  );
}

/* ── biểu mẫu nhà cung cấp ─────────────────────────────────────────────── */

const GIAO_THUC = ['openai', 'anthropic', 'gemini'];

/**
 * Thêm hoặc sửa một nhà cung cấp — ba bước gọn trong một khung: chọn mẫu → kết nối → chọn model.
 *
 * # Vì sao kiểm TRƯỚC khi lưu
 *
 * Bản trước phải lưu rồi mới kiểm được, nên bước chọn model không có gì để chọn (người dùng gõ
 * tay một chuỗi phẩy), và thử một khóa là đổi cấu hình thật. Giờ "Kiểm tra kết nối" hỏi bằng
 * bản nháp (`POST /api/models/try`), rồi danh sách model hiện ra để tích chọn.
 *
 * # Ba luật giữ nguyên
 *
 *   1. Khóa chỉ gửi khi người dùng gõ; để trống = giữ khóa cũ.
 *   2. Mục model cũ giữ NGUYÊN VẸN (`context_window`, `json_schema`) — chỉ tên mới sinh mục
 *      trần. Dựng lại mục từ tên là xóa sạch hai trường kia.
 *   3. Giao thức chỉ gửi khi ĐỔI. Mục do TUI tạo không khai `type` (suy theo tên); bản trước
 *      luôn gửi `openai` nên sửa base_url của mục `anthropic` là âm thầm đổi giao thức.
 */
function FormNhaCungCap({
  du,
  cu,
  onXong,
  onHuy,
}: {
  du: CauHinhDoc;
  cu?: NhaCungCap;
  onXong: () => void;
  /** Vắng = không có đường lùi (lần đầu, chưa có nhà cung cấp nào). */
  onHuy?: () => void;
}) {
  const [ten, datTen] = useState(cu?.name ?? '');
  const loaiGoc = cu ? (cu.type ?? '') : 'openai';
  const [loai, datLoai] = useState(loaiGoc);
  const [baseURL, datBaseURL] = useState(cu?.base_url ?? '');
  const [khoa, datKhoa] = useState('');
  const [chon, datChon] = useState<string[]>((cu?.models ?? []).map((m) => m.name));
  const [themTen, datThemTen] = useState('');
  const [loc, datLoc] = useState('');
  const [kq, datKq] = useState<{
    models: string[];
    windows: Record<string, number>;
    congCu?: KetQuaCongCu;
  } | null>(null);
  const kiem = useTrangThaiLuu();
  const luu = useTrangThaiLuu();
  const lanDau = !du.provider;
  const [macDinh, datMacDinh] = useState('');

  const tenSach = ten.trim();
  const trungTen = !cu && du.providers.some((x) => x.name === tenSach);
  const coCach = /\s/.test(tenSach);
  const mucCu = new Map<string, MucModel>((cu?.models ?? []).map((m) => [m.name, m]));
  const tuyChonLoai = Array.from(
    new Set([...GIAO_THUC, ...(loaiGoc && !GIAO_THUC.includes(loaiGoc) ? [loaiGoc] : [])]),
  );
  // Giao thức chỉ đi theo lượt ghi khi nó ĐỔI (hoặc khi thêm mới).
  const kemLoai = loai !== loaiGoc || !cu ? { type: loai } : {};

  const dungMau = (nhan: string) => {
    const m = du.presets.find((p) => p.label === nhan);
    if (!m) return;
    datTen(m.name ?? '');
    datLoai(m.type ?? 'openai');
    datBaseURL(m.base_url ?? '');
    datKq(null);
  };

  const kiemKetNoi = () =>
    void kiem.chay(
      () =>
        thuKetNoi({
          name: tenSach,
          ...kemLoai,
          base_url: baseURL.trim(),
          ...(khoa !== '' ? { api_key: khoa } : {}),
          // Thử gọi công cụ bằng model đang chọn; chưa chọn gì thì server thử `auto` nếu có.
          tools: true,
          ...(chon[0] ? { model: chon[0] } : {}),
        }),
      (r) => {
        datKq({ models: r.models, windows: r.windows ?? {}, congCu: r.tools });
        // Thêm mới và chưa chọn gì: chọn sẵn `auto` nếu nhà cung cấp có — và CHỈ `auto`. Bản
        // trước chọn model đầu bảng chữ cái (`agnes-2.0-flash` ở lingoreup), tức một model
        // ngẫu nhiên mà người dùng không hề chọn sẽ được lưu nếu họ bấm Lưu luôn.
        if (!cu && chon.length === 0 && r.models.includes('auto')) datChon(['auto']);
      },
    );

  const doiChon = (m: string, co: boolean) =>
    datChon((ds) => (co ? (ds.includes(m) ? ds : [...ds, m]) : ds.filter((x) => x !== m)));

  const gui = () => {
    // Hàng rào thứ hai, sau `disabled` của nút: biểu mẫu còn submit được bằng phím Enter.
    if (trungTen || coCach || !tenSach || (lanDau && chon.length === 0)) return;
    const models: MucModel[] = chon.map((name) => {
      const goc = mucCu.get(name) ?? { name };
      const w = kq?.windows[name] ?? 0;
      return w > 0 ? { ...goc, context_window: w } : goc;
    });
    const sua: SuaCauHinh = {
      provider_config: { name: tenSach, base_url: baseURL.trim(), models, ...kemLoai },
    };
    // Chỉ gửi khóa khi người dùng THẬT SỰ gõ — chuỗi rỗng là lệnh XÓA khóa ở server.
    if (khoa !== '') sua.provider_config!.api_key = khoa;
    // Chưa có mặc định (lần đầu) thì đặt luôn, nếu không cấu hình vừa lưu vẫn chưa dùng được.
    if (lanDau) {
      sua.provider = tenSach;
      const md = macDinh && chon.includes(macDinh) ? macDinh : chon[0];
      if (md) sua.model = md;
    }
    void luu.chay(() => luuCauHinh(sua), onXong);
  };

  const dsKq = kq?.models ?? [];
  const tatCa = Array.from(new Set([...chon, ...dsKq]));
  const q = loc.trim().toLowerCase();
  const hien = (q ? tatCa.filter((m) => m.toLowerCase().includes(q)) : tatCa).slice(0, 200);
  const soBuoc = cu ? 0 : 1;

  return (
    <form
      className="bieuMau chForm"
      onSubmit={(e) => {
        e.preventDefault();
        gui();
      }}
    >
      {!cu && du.presets.length > 0 ? (
        <fieldset className="chBuoc">
          <legend>
            <span className="so">1</span>
            {CH.buoc1}
          </legend>
          <div className="chMau">
            {du.presets.map((p) => (
              <button
                key={p.label}
                type="button"
                className={`chMauNut${p.name === tenSach && (p.base_url ?? '') === baseURL ? ' dang' : ''}`}
                onClick={() => dungMau(p.label)}
              >
                {p.name ? p.label : CH.tuNhap}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      <fieldset className="chBuoc">
        <legend>
          <span className="so">{soBuoc + 1}</span>
          {CH.buoc2}
        </legend>
        <div className="chLuoi">
          <label className="oNhap">
            <span>{CH.ten}</span>
            <input
              value={ten}
              onChange={(e) => datTen(e.target.value)}
              readOnly={!!cu}
              placeholder="openrouter"
              required
            />
            {!cu ? <small>{CH.tenGoiY}</small> : null}
          </label>
          <label className="oNhap">
            <span>{CH.giaoThuc}</span>
            <select
              value={loai}
              onChange={(e) => {
                datLoai(e.target.value);
                datKq(null);
              }}
            >
              {cu && !cu.type ? <option value="">{CH.theoTen(cu.name)}</option> : null}
              {tuyChonLoai.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="oNhap rong">
            <span>{CH.diaChiGoc}</span>
            <input
              value={baseURL}
              onChange={(e) => {
                datBaseURL(e.target.value);
                datKq(null);
              }}
              placeholder="https://openrouter.ai/api/v1"
            />
            <small>{CH.diaChiGocGoiY}</small>
          </label>
          <label className="oNhap rong">
            <span>{CH.khoaApi}</span>
            <input
              type="password"
              value={khoa}
              onChange={(e) => {
                datKhoa(e.target.value);
                datKq(null);
              }}
              autoComplete="off"
              placeholder={cu?.api_key_set ? CH.giuKhoaCu : 'sk-…'}
            />
            {cu?.api_key_optional ? <small>{CH.khoaCucBo}</small> : null}
          </label>
        </div>
        <div className="chHangNut">
          <button type="button" className="nutPhu" onClick={kiemKetNoi} disabled={kiem.dang || !tenSach}>
            {kiem.dang ? CH.dangKiem : CH.kiemKetNoi}
          </button>
          {kiem.tt.loai === 'loi' ? (
            <TrangThaiLuu tt={kiem.tt} />
          ) : kq ? (
            <span className="chKqKiem" role="status">
              <span className="chTT xong">
                <span aria-hidden="true">✓ </span>
                {CH.ketNoiDuoc(kq.models.length, gio(Date.now()))}
              </span>
              <DongCongCu kq={kq.congCu} />
            </span>
          ) : kiem.dang ? (
            <TrangThaiLuu tt={kiem.tt} />
          ) : null}
        </div>
      </fieldset>

      <fieldset className="chBuoc">
        <legend>
          <span className="so">{soBuoc + 2}</span>
          {CH.buoc3}
          <span className="phu">{CH.daChon(chon.length)}</span>
        </legend>
        {!kq ? <p className="chGoiY">{CH.buoc3ChuaKiem}</p> : null}
        {tatCa.length > 8 ? (
          <input
            className="chLoc"
            value={loc}
            onChange={(e) => datLoc(e.target.value)}
            placeholder={CH.timTrongDs}
            aria-label={CH.timTrongDs}
          />
        ) : null}
        {hien.length > 0 ? (
          <ul className="chDsChon">
            {hien.map((m) => {
              const w = kq?.windows[m] ?? mucCu.get(m)?.context_window ?? 0;
              return (
                <li key={m}>
                  <label>
                    <input type="checkbox" checked={chon.includes(m)} onChange={(e) => doiChon(m, e.target.checked)} />
                    <span className="m">{m}</span>
                    {w > 0 ? <span className="phu">{Math.round(w / 1000)}k</span> : null}
                    {kq && dsKq.length > 0 && !dsKq.includes(m) ? (
                      <span className="vien amber">{CH.khongThayONcc}</span>
                    ) : null}
                  </label>
                </li>
              );
            })}
          </ul>
        ) : null}
        <label className="oNhap chThemTen">
          <span>{CH.themTheoTen}</span>
          <input
            value={themTen}
            onChange={(e) => datThemTen(e.target.value)}
            placeholder={CH.themTheoTenGoiY}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              themTen
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
                .forEach((m) => doiChon(m, true));
              datThemTen('');
            }}
          />
        </label>
        {lanDau && chon.length > 1 ? (
          <label className="oNhap">
            <span>{CH.dungLamMacDinh}</span>
            <select value={macDinh || chon[0]} onChange={(e) => datMacDinh(e.target.value)}>
              {chon.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </fieldset>

      {trungTen ? <p className="chDongLoi">{CH.trungTen(tenSach)}</p> : null}
      {coCach ? <p className="chDongLoi">{CH.tenCoKhoangTrang}</p> : null}

      <div className="chHangNut cuoi">
        {/* Lần đầu, nhà cung cấp này sẽ thành mặc định — không có model thì cấu hình vừa lưu
            không dùng được, nên nút chờ tới khi có ít nhất một model. */}
        <button
          type="submit"
          className="nutChinh"
          disabled={luu.dang || !tenSach || trungTen || coCach || (lanDau && chon.length === 0)}
        >
          {luu.dang ? CH.dangLuu : CH.luuNcc}
        </button>
        {lanDau && chon.length === 0 ? <span className="chTT">{CH.canMotModel}</span> : null}
        {onHuy ? (
          <button type="button" className="nutPhu" onClick={onHuy} disabled={luu.dang}>
            {CH.huy}
          </button>
        ) : null}
        <TrangThaiLuu tt={luu.tt} />
      </div>
    </form>
  );
}

/* ── thiết lập khác ────────────────────────────────────────────────────── */

/** Kiểu văn và độ suy luận mặc định — những thứ không thuộc về vai nào. */
function ThietLapKhac({ du, onXong }: { du: CauHinhDoc; onXong: () => void }) {
  // `style: ""` nghĩa là kiểu `default` — hiện đúng option đó thay vì một ô chọn lệch state.
  const styleHienTai = du.style || (du.styles.includes('default') ? 'default' : '');
  const [style, datStyle] = useState(styleHienTai);
  const [effort, datEffort] = useState(du.reasoning_effort ?? '');
  const tt = useTrangThaiLuu();

  // Đồng bộ lại sau mỗi lần nạp — kể cả khi nơi khác vừa lưu.
  useEffect(() => {
    datStyle(styleHienTai);
    datEffort(du.reasoning_effort ?? '');
  }, [styleHienTai, du.reasoning_effort]);

  const kieuVanLa = !!du.style && !du.styles.includes(du.style);
  const doi = style !== styleHienTai || effort !== (du.reasoning_effort ?? '');

  return (
    <section className="the chKhac" aria-labelledby="ch-khac">
      <div className="chDauThe">
        <h2 id="ch-khac">{CH.thietLapKhac}</h2>
      </div>
      {kieuVanLa ? <p className="chCanhDong">{CH.kieuVanLa(du.style)}</p> : null}
      <form
        className="bieuMau chLuoi"
        onSubmit={(e) => {
          e.preventDefault();
          // CHỈ gửi hai trường của khối này: trường vắng = giữ nguyên ở server.
          void tt.chay(() => luuCauHinh({ style, reasoning_effort: effort }), onXong);
        }}
      >
        <label className="oNhap">
          <span>{CH.kieuVan}</span>
          {/* Danh sách ĐÓNG: giá trị lạ bị engine bỏ qua không lỗi không cảnh báo. */}
          <select value={style} onChange={(e) => datStyle(e.target.value)}>
            {kieuVanLa ? <option value={du.style}>{du.style}</option> : null}
            {du.styles.map((k) => (
              <option key={k} value={k}>
                {CH.nhanKieuVan[k] ?? k}
              </option>
            ))}
          </select>
        </label>
        <label className="oNhap">
          <span>{CH.doSuyLuan}</span>
          <select value={effort} onChange={(e) => datEffort(e.target.value)}>
            <option value="">{CH.theoModel}</option>
            {['off', 'low', 'medium', 'high', 'xhigh', 'max'].map((m) => (
              <option key={m} value={m}>
                {CH.nhanDoSuyLuan[m] ?? m}
              </option>
            ))}
          </select>
        </label>
        <div className="chHangNut rong">
          <button type="submit" className="nutChinh" disabled={tt.dang || !doi}>
            {tt.dang ? CH.dangLuu : CH.luu}
          </button>
          <TrangThaiLuu tt={tt.tt} />
        </div>
      </form>
    </section>
  );
}

function gio(ms: number): string {
  return new Date(ms).toLocaleTimeString('vi', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Dòng thứ hai của kết quả Kiểm tra: model có gọi công cụ được không.
 *
 * "Kết nối được · 306 model" từng đứng một mình trong khi không model nào của cổng gọi được
 * công cụ — dấu ✓ xanh, rồi truyện kẹt ở bước Kiến trúc sư. Giờ câu đó luôn đi kèm câu này.
 */
function DongCongCu({ kq }: { kq: KetQuaCongCu | undefined }) {
  if (!kq) return null;
  if (!kq.checked) {
    return kq.note ? <span className="chTT">{kq.note}</span> : null;
  }
  if (kq.ok) {
    return (
      <span className="chTT xong">
        <span aria-hidden="true">✓ </span>
        {CH.congCuDuoc(kq.model ?? '')}
      </span>
    );
  }
  return (
    <span className="chTT loi chCongCu" title={kq.raw}>
      <span aria-hidden="true">✗ </span>
      {CH.congCuKhong(kq.model ?? '')}
      {kq.reason ? <span className="phu"> {CH.congCuLyDo(kq.reason)}</span> : null}
    </span>
  );
}
