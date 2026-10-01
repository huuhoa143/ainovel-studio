'use client';

import { useEffect, useRef, useState } from 'react';

import { LoiApi, xoaSach } from '@/lib/api';
import { mauBia, nenBia } from '@/lib/bia';
import { TU_TRUYEN as T } from '@/lib/chu/tu-truyen';
import { donGia, nangSuat, ngayGio, so, soTu, tongTien } from '@/lib/dinhdang';
import type { Khu } from '@/lib/khu';
import { CHU, DH, GIAI_THICH, nhanPhase } from '@/lib/nhan';
import type { Book } from '@/lib/types';
import { tienCuaXuong, vieccanBanCuaXuong, type TaiTongXuong, type ViecCanBan } from '@/lib/tongXuong';
import { tongXuong } from '@/lib/xuong';
import { useDauDoi } from '@/lib/dauDoi';

import { BieuTuong } from './BieuTuong';
import { HopXacNhan } from './HopXacNhan';

/**
 * Màn Tủ truyện: mọi truyện của bạn, và cái gì đang cần bạn.
 *
 * # Thứ tự trên màn là thứ tự ba câu hỏi trong PRODUCT.md
 *
 * Lời chào kèm MỘT câu tóm tắt ("Đang viết X, chưa có việc nào cần bạn") trả lời câu đầu —
 * dây chuyền còn chạy đúng không — trước khi mắt chạm tới bất kỳ con số nào. Khối "Cần bạn
 * xem" chỉ hiện khi CÓ việc: một khối trống ở vị trí nổi bật nhất dạy người ta bỏ qua nó, đúng
 * vào ngày nó có việc thật. Ba ô số đứng cạnh lời chào, kệ truyện ngay dưới.
 *
 * # Vì sao kệ là THẺ có bìa, không còn là bảng chín cột
 *
 * Bảng cũ trả lời "cuốn nào tốn bao nhiêu" rất tốt và mọi câu khác rất tệ: chín cột cùng một
 * độ đậm thì mắt không biết dừng ở đâu. Thẻ đưa ba thứ lên trước — truyện nào (bìa màu, tên),
 * đang ở đâu (trạng thái, thanh tiến độ), tốn bao nhiêu — và lùi phần còn lại xuống một dòng
 * nhỏ. Bấm thẻ là vào Tiến độ của truyện đó. Đọc, Xuất bản, Xóa nằm trong menu "…": chúng là
 * việc thỉnh thoảng mới làm, và ba nút phơi trên mọi thẻ là ba chỗ bấm nhầm.
 *
 * # Vì sao KHÔNG có nút chạy ở đây (giữ nguyên quyết định 4, spec §4)
 *
 * Chạy và dừng chỉ có ở thanh dưới, trên truyện đang mở — một đường tiêu tiền duy nhất. Hai nút
 * cùng gọi `POST /run` thì trạng thái khóa-lúc-đang-gửi của chúng không thấy nhau.
 *
 * # Vì sao CÓ xóa (đảo quyết định 8)
 *
 * Một khóa API sai từng để lại ba cuốn 0 chương 0 đô, gỡ được chỉ bằng terminal. Phần "thấy rõ
 * mình đang phá cái gì" là việc của hộp xác nhận: nó đọc ra SỐ CHƯƠNG và SỐ TIỀN sắp mất.
 * Đổi tên vẫn KHÔNG có: tên thư mục đi vào đường dẫn của mọi tệp trong cuốn.
 *
 * # `0` KHÔNG phải "chưa đo được"
 *
 * `chapters_per_hour` và `cost_per_chapter` về `0` cho cuốn CHƯA CHẠY lần nào; thẻ ẩn hai số
 * đó thay vì in `0`. `cost_usd === 0` thì NGƯỢC LẠI: đó là một phép đo có thật, in `$0,00`.
 */
export function Xuong({
  sach,
  tong,
  onChonKhu,
  onMoTacPham,
  onXoaXong,
}: {
  sach: Book[];
  /** Tờ `/api/workshop/cost`, nạp ở `Trang`. `du === undefined` = chưa có, không phải rỗng. */
  tong: TaiTongXuong;
  /**
   * Mở một cuốn ở một bề mặt, trong MỘT hành động.
   *
   * Ba tham số đi cùng nhau chứ không phải ba lời gọi nối tiếp: `useStudio` ghi cả ba mảnh vị
   * trí vào URL trong một lần, và mọi hành động của nó đọc `tacPhamRef.current` — một ref chỉ
   * được đặt lại lúc RENDER. Gọi "chọn tác phẩm" rồi "chọn khu" liền nhau thì lời gọi thứ hai
   * ghi URL bằng cuốn CŨ. Lỗi đó đã đo được hai lần trong dự án này.
   */
  onMoTacPham: (id: string, khu: Khu, chuong?: number) => void;
  /** Nạp lại cả tủ sau khi xóa — kệ phải khớp đĩa ngay, không đợi F5. */
  onXoaXong: () => void;
  /** Đi tới một khu mức MÁY (Viết truyện mới / Bàn ý tưởng) — không kèm truyện nào. */
  onChonKhu: (khu: Khu) => void;
}) {
  const t = tongXuong(sach);
  const tien = tienCuaXuong(tong.du);
  const viec = vieccanBanCuaXuong(tong.du, sach);
  // MỘT hộp cho cả màn, không phải mỗi thẻ một hộp: nút của nó sẽ lọt vào mọi phép đếm nút
  // của thẻ, và mười hộp `<dialog>` cho mười cuốn là mười bẫy focus chờ sẵn.
  const [xinXoa, datXinXoa] = useState<Book | null>(null);
  const [dangXoa, datDangXoa] = useState(false);
  const [loiXoa, datLoiXoa] = useState<string | null>(null);

  const xacNhanXoa = () => {
    if (!xinXoa) return;
    datDangXoa(true);
    datLoiXoa(null);
    xoaSach(xinXoa.id)
      .then(() => {
        datXinXoa(null);
        onXoaXong();
      })
      .catch((e: unknown) => datLoiXoa(e instanceof LoiApi ? e.message : String(e)))
      .finally(() => datDangXoa(false));
  };

  const dangChay = sach.find((b) => b.activity === 'running');
  const engineMo = sach.find((b) => b.engine_open);
  const ganDay = sach
    .filter((b) => ngayGio(b.updated_at))
    .sort((a, b) => new Date(b.updated_at!).getTime() - new Date(a.updated_at!).getTime())
    .slice(0, 5);

  return (
    <main className="canvas khuxuong" id="xuong">
      <div className="head headTu">
        <h1>{DH.tuTruyen}</h1>
        <span className="day" />
        <button type="button" className="nutPhu nutBt" onClick={() => onChonKhu('cung-dung')}>
          <BieuTuong ten="yTuong" co={14} />
          {DH.banYTuong}
        </button>
        <button type="button" className="nutChinh nutBt" onClick={() => onChonKhu('tac-pham-moi')}>
          <BieuTuong ten="cong" co={14} />
          {DH.vietTruyenMoi}
        </button>
      </div>

      <div className="tuThan">
        <section className="tuChao" aria-label={DH.tuTruyen}>
          <div className="tuLoi">
            <h2>{T.loiChao(new Date().getHours())}</h2>
            <p className="tuTomTat">
              <TomTat
                dangChay={dangChay}
                engineMo={engineMo}
                soViec={viec.length}
                onMo={(b) => onMoTacPham(b.id, 'dong-san-xuat')}
              />
            </p>
          </div>

          {/* Ba ô số: tiến độ, khối lượng, tiền. Ô tiền mang MẪU SỐ của chính nó — đo trên tủ
              thật: $7,37 với `counted: 1` trên ba cuốn. Một con số tiền không kèm mẫu số sẽ
              được đọc thành "cả tủ tốn có thế". */}
          <div className="xtong">
            <OTong so={t.chuongDaChot} chu={so(t.chuongDaChot)} nhan={CHU.donViChuongDaChot} loai="chot" />
            <OTong so={t.soTu} chu={so(t.soTu)} nhan={CHU.donViTu} loai="tu" />
            <OTong
              so={t.chiPhi}
              chu={tongTien(t.chiPhi)}
              nhan={CHU.donViDaTieu}
              loai="tien"
              phu={
                tien && tien.tongSach > 0 && tien.demDuoc < tien.tongSach
                  ? tien.demDuoc === 0
                    ? CHU.chuaDoDuocCuonNao
                    : CHU.doDuocO(tien.demDuoc, tien.tongSach)
                  : undefined
              }
              viSaoPhu={GIAI_THICH.tongTienMauSo}
            />
          </div>
        </section>

        <DaiCanBan viec={viec} onMoTacPham={onMoTacPham} />

        <section className="ke" aria-label={T.keTruyen}>
          <ul className="keLuoi">
            {sach.map((b) => (
              <TheTruyen
                key={b.id}
                b={b}
                viec={viec.find((v) => v.sach.id === b.id)}
                onMoTacPham={onMoTacPham}
                onXinXoa={datXinXoa}
              />
            ))}
            <li className="theMoi">
              <button type="button" onClick={() => onChonKhu('tac-pham-moi')}>
                <span className="theMoiDau" aria-hidden="true">
                  <BieuTuong ten="cong" co={16} />
                </span>
                <span className="theMoiChu">
                  <b>{DH.vietTruyenMoi}</b>
                  <span>{T.vietTruyenMoiPhu}</span>
                </span>
              </button>
            </li>
          </ul>
        </section>

        {loiXoa ? (
          <p className="loiDoc" role="alert">
            {loiXoa}
          </p>
        ) : null}

        <div className={`tuDuoi${ganDay.length >= 2 ? '' : ' mot'}`}>
          {ganDay.length >= 2 ? (
            <section className="the tuGanDay">
              <h2>{T.ganDay}</h2>
              <ol>
                {ganDay.map((b) => (
                  <li key={b.id}>
                    <button type="button" onClick={() => onMoTacPham(b.id, 'dong-san-xuat')}>
                      <span className="luc" title={ngayGio(b.updated_at)}>
                        {T.luc(b.updated_at)}
                      </span>
                      <span className="biaNho" style={{ background: nenBia(b.id) }} aria-hidden="true" />
                      <span className="ten">{tenSach(b)}</span>
                      <span className="cau">{trangThai(b).chu}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          <section className="the tuToan">
            <h2>{T.toanTu}</h2>
            <dl>
              <dt>{T.soTruyen}</dt>
              <dd>{so(t.soTacPham)}</dd>
              <dt title={GIAI_THICH.xuongEngineDangMo}>{T.phienDangMo}</dt>
              <dd>{t.engineDangMo > 0 ? so(t.engineDangMo) : T.khongCoPhien}</dd>
              {tien && tien.tietKiem > 0 ? (
                <>
                  <dt>{T.daTietKiem}</dt>
                  <dd>{tongTien(tien.tietKiem)}</dd>
                </>
              ) : null}
            </dl>
          </section>
        </div>
      </div>

      <HopXacNhan
        moRa={xinXoa !== null}
        tieuDe={xinXoa ? CHU.xacNhanXoaDe(xinXoa.id) : ''}
        than={
          xinXoa
            ? GIAI_THICH.xacNhanXoa(
                xinXoa.id,
                xinXoa.completed_chapters ?? 0,
                tongTien(xinXoa.cost_usd) ?? '$0,00',
              )
            : ''
        }
        nhanLam={CHU.xoaTacPham}
        onLam={xacNhanXoa}
        onHuy={() => datXinXoa(null)}
        dangLam={dangXoa}
      />
    </main>
  );
}

/**
 * Câu tóm tắt dưới lời chào: máy đang làm gì, rồi có việc gì cần bạn.
 *
 * Tên truyện đang viết là một nút: câu trả lời "đang viết X" dẫn thẳng tới X trong một lần bấm.
 * Engine mở mà không chạy cũng được nói ra — nó đang giữ khóa tệp của cuốn đó, nên không mở
 * được cuốn khác; nói ở đây thay vì để người dùng gặp lỗi 409 lúc bấm chạy cuốn thứ hai.
 */
function TomTat({
  dangChay,
  engineMo,
  soViec,
  onMo,
}: {
  dangChay: Book | undefined;
  engineMo: Book | undefined;
  soViec: number;
  onMo: (b: Book) => void;
}) {
  const ai = dangChay ?? engineMo;
  const sau = soViec > 0 ? T.tomTatViec(soViec) : T.tomTatKhongViec;
  if (!ai) {
    return <>{sau.charAt(0).toUpperCase() + sau.slice(1)}</>;
  }
  const dau = dangChay ? T.tomTatDangViet : T.tomTatPhienMo;
  return (
    <>
      {dau}
      <button type="button" className="tomTatMo" onClick={() => onMo(ai)}>
        {tenSach(ai)}
      </button>
      , {sau}
    </>
  );
}

/**
 * Khối "Cần bạn xem" — chỉ hiện khi có việc.
 *
 * Việc ở đây là Ý ĐỊNH ĐÃ KÝ đọc từ `meta/run.json` — sự thật trên ĐĨA, không phải lời engine
 * khẳng định nó đang đứng ở cửa. Câu chữ ("đã hẹn", "chưa xử lý") mang đúng nghĩa đó. Nút chỉ
 * ĐIỀU HƯỚNG; việc chạy engine để nguyên ở thanh dưới.
 */
function DaiCanBan({
  viec,
  onMoTacPham,
}: {
  viec: ViecCanBan[];
  onMoTacPham: (id: string, khu: Khu, chuong?: number) => void;
}) {
  if (viec.length === 0) return null;
  return (
    <section className="daicanban cocho" aria-labelledby="canban-de" title={GIAI_THICH.canBanTuDia}>
      <div className="canbanDau">
        <h2 id="canban-de">
          <span className="ky" aria-hidden="true">
            ■
          </span>
          {T.canBanDe}
        </h2>
        <span className="phu">{T.canBanPhu}</span>
      </div>
      {viec.map((v) => (
        <div className="hangcanban" key={v.sach.id}>
          <span className="biaNho" style={{ background: nenBia(v.sach.id) }} aria-hidden="true" />
          <span className="ten">{tenSach(v.sach)}</span>
          <span className="cau">
            {v.tamDung ? CHU.daKyTamDung : null}
            {v.tamDung && v.canThiep ? ' · ' : null}
            {v.canThiep ? CHU.daKyCanThiep : null}
          </span>
          {/* Lý do là chữ của chính bạn viết lúc hẹn dừng. Nó hiện ra vì một việc không nói lý
              do thì không hành động được — phải vào tận nơi mới biết mình đã dặn gì. */}
          {v.lyDo ? <span className="ly">“{v.lyDo}”</span> : null}
          <span className="day" />
          <button
            type="button"
            className="nutPhu"
            onClick={() => onMoTacPham(v.sach.id, 'dong-san-xuat')}
          >
            {CHU.chiTiet}
          </button>
        </div>
      ))}
    </section>
  );
}

/** Trạng thái một dòng của thẻ: chữ + màu chấm. Màu không bao giờ là kênh duy nhất. */
function trangThai(b: Book): { chu: string; mau: 'gold' | 'teal' | 'muted'; luc?: string } {
  if (b.activity === 'running') {
    return {
      chu: b.phase === 'writing' ? T.dangVietChuong(b.completed_chapters + 1) : hoaDau(nhanPhase(b.phase)),
      mau: 'gold',
    };
  }
  if (b.phase === 'complete' || b.activity === 'complete') return { chu: T.hoanThanh, mau: 'teal' };
  return {
    chu: b.phase === 'init' ? hoaDau(nhanPhase(b.phase)) : T.tamNghi,
    mau: 'muted',
    luc: T.luc(b.updated_at),
  };
}

function hoaDau(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function TheTruyen({
  b,
  viec,
  onMoTacPham,
  onXinXoa,
}: {
  b: Book;
  viec: ViecCanBan | undefined;
  onMoTacPham: (id: string, khu: Khu, chuong?: number) => void;
  onXinXoa: (b: Book) => void;
}) {
  const tt = trangThai(b);
  const mau = mauBia(b.id);
  const nhip = b.chapters_per_hour ? nangSuat(b.chapters_per_hour) : undefined;
  const gia = b.cost_per_chapter ? donGia(b.cost_per_chapter) : undefined;
  const tu = soTu(b.total_words);
  const phanTram = b.total_chapters
    ? Math.min(100, Math.round((b.completed_chapters / b.total_chapters) * 100))
    : undefined;

  return (
    // `data-ma` để bài kiểm tra đúng thẻ của một cuốn: `nth-child` sẽ trôi ngay lần thứ tự đổi.
    <li
      data-ma={b.id}
      className={`theTruyen the${b.engine_open ? ' engmo' : ''}${b.activity === 'running' ? ' dangViet' : ''}`}
      style={{ ['--mau-bia' as string]: mau.sang }}
    >
      <div className="bia" style={{ background: nenBia(b.id) }} aria-hidden="true">
        <span className={`biaTen${b.name ? '' : ' chuaTen'}`}>{b.name || T.chuaCoTen}</span>
      </div>

      <div className="theThan">
        {/* Tên là nút MỞ, và nó căng phủ cả thẻ (xem `.tenNut::after` trong CSS): bấm chỗ nào
            trên thẻ cũng vào Tiến độ, nhưng trình đọc màn hình chỉ nghe MỘT nút có tên.
            Mã hiện LUÔN, kể cả khi đã có tên — hai cuốn ở hai thư mục có thể trùng tên, và `id`
            là thứ duy nhất phân biệt được chúng. Đo trên tủ thật: cả BA cuốn tên "Trấn Yêu Ký". */}
        <button
          type="button"
          className="tenNut"
          title={DH.moTruyen(tenSach(b))}
          onClick={() => onMoTacPham(b.id, 'dong-san-xuat')}
        >
          <span className="ten">{b.name || b.id}</span>
          {b.name ? <span className="ma">{b.id}</span> : null}
        </button>

        <p className="theTT">
          <span className={`cham ${tt.mau}`} aria-hidden="true" />
          <span>{tt.chu}</span>
          {tt.luc ? (
            <span className="luc" title={ngayGio(b.updated_at)}>
              · {tt.luc}
            </span>
          ) : null}
        </p>

        {viec || b.engine_open ? (
          <p className="theVien">
            {viec ? (
              <span className="vien amber" title={viec.lyDo ? `${viec.lyDo} — ${GIAI_THICH.canBanTuDia}` : GIAI_THICH.canBanTuDia}>
                {viec.tamDung && viec.canThiep
                  ? `${CHU.daKyTamDungNgan} · ${CHU.daKyCanThiepNgan}`
                  : viec.tamDung
                    ? CHU.daKyTamDungNgan
                    : CHU.daKyCanThiepNgan}
              </span>
            ) : null}
            {b.engine_open ? (
              <span className="vien engnhan" title={GIAI_THICH.xuongEngineDangMo}>
                {CHU.engineDangMo}
              </span>
            ) : null}
          </p>
        ) : null}

        <div className="tiendo">
          <span className="sl">
            <b>{so(b.completed_chapters)}</b>{' '}
            {b.total_chapters ? T.chuongTren(so(b.total_chapters)!) : T.chuong}
          </span>
          {phanTram !== undefined ? <span className="pt">{phanTram}%</span> : <span className="pt">{T.chuaBietTong}</span>}
          {/* Thanh chỉ vẽ khi BIẾT tổng. `total_chapters === 0` là "chưa biết tổng": một thanh
              rỗng nói cuốn chưa đi được đoạn nào, một thanh đầy nói đã xong — cả hai đều là
              khẳng định mà dữ liệu không đưa ra. */}
          {phanTram !== undefined ? (
            <span className="thanh" aria-hidden="true">
              <span className="day" style={{ width: `${phanTram}%` }} />
            </span>
          ) : null}
        </div>

        <p className="theSo">
          <span className="tong">{tongTien(b.cost_usd)}</span>
          {gia ? (
            <span className="donGia">
              {gia}
              {T.moiChuong}
            </span>
          ) : null}
          {nhip ? (
            <span className="nhip">
              {nhip} {CHU.chuongMoiGio}
            </span>
          ) : null}
          {tu ? (
            <span className="tu">
              {tu} {CHU.donViTu}
            </span>
          ) : null}
        </p>
      </div>

      <MenuThe b={b} onMoTacPham={onMoTacPham} onXinXoa={onXinXoa} />
    </li>
  );
}

/**
 * Menu "…" của một thẻ: Đọc, Xuất bản, rồi Xóa.
 *
 * Đọc chỉ có khi đã có chương, Xuất bản chỉ khi đã hoàn thành — trước đó chúng dẫn tới hai bề
 * mặt nói "chưa có gì". Xóa đứng CUỐI, sau một vạch ngăn: tay người ta đi theo thói quen vị
 * trí, nên một hành động không hoàn tác được không được nằm xen giữa các hành động vô hại.
 */
function MenuThe({
  b,
  onMoTacPham,
  onXinXoa,
}: {
  b: Book;
  onMoTacPham: (id: string, khu: Khu, chuong?: number) => void;
  onXinXoa: (b: Book) => void;
}) {
  const [mo, datMo] = useState(false);
  const goc = useRef<HTMLDivElement>(null);
  const nut = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!mo) return;
    goc.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const ngoai = (e: PointerEvent) => {
      if (!goc.current?.contains(e.target as Node)) datMo(false);
    };
    document.addEventListener('pointerdown', ngoai);
    return () => document.removeEventListener('pointerdown', ngoai);
  }, [mo]);

  const dong = () => {
    datMo(false);
    nut.current?.focus();
  };
  const lam = (f: () => void) => () => {
    datMo(false);
    f();
  };

  const coDoc = b.completed_chapters > 0 || b.phase === 'complete';
  const coXuat = b.phase === 'complete';

  return (
    <div
      className={`theMenu${mo ? ' mo' : ''}`}
      ref={goc}
      onKeyDown={(e) => {
        if (!mo) return;
        if (e.key === 'Escape') {
          e.stopPropagation();
          dong();
          return;
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const muc = [...(goc.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
          const i = muc.indexOf(document.activeElement as HTMLElement);
          const toi = e.key === 'ArrowDown' ? (i + 1) % muc.length : (i - 1 + muc.length) % muc.length;
          muc[toi]?.focus();
        }
      }}
    >
      <button
        type="button"
        ref={nut}
        className="theMenuNut"
        aria-haspopup="menu"
        aria-expanded={mo}
        aria-label={T.thaoTacKhac(tenSach(b))}
        title={T.thaoTacKhac(tenSach(b))}
        onClick={() => datMo((m) => !m)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5.5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="18.5" cy="12" r="1.6" />
        </svg>
      </button>
      {mo ? (
        <div className="theMenuHop" role="menu" aria-label={T.thaoTacKhac(tenSach(b))}>
          {coDoc ? (
            <button type="button" role="menuitem" onClick={lam(() => onMoTacPham(b.id, 'ban-thao', 1))}>
              {/* Chương 1 đi CÙNG lời gọi. Tách ra thành "chọn chương" rồi "đổi khu" là mất
                  `?ch=` khỏi URL — đã đo được. */}
              <BieuTuong ten="doc" co={14} />
              {T.docTruyen}
            </button>
          ) : null}
          {coXuat ? (
            <button type="button" role="menuitem" onClick={lam(() => onMoTacPham(b.id, 'nhap-xuat'))}>
              <BieuTuong ten="xuatBan" co={14} />
              {T.xuatBan}
            </button>
          ) : null}
          {coDoc || coXuat ? <span className="vach" role="separator" /> : null}
          <button
            type="button"
            role="menuitem"
            className="nutXoa"
            title={GIAI_THICH.xoaKhongHoanTac}
            onClick={lam(() => onXinXoa(b))}
          >
            {T.xoaTruyen}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function tenSach(b: Book): string {
  return b.name || b.id;
}

/**
 * Một ô số cạnh lời chào, nhấp MỘT lần khi con số của nó đổi.
 *
 * Câu trả lời cho tiêu chí ở PRODUCT.md — "mở studio sau 6 giờ đi vắng và trong vòng 5 giây
 * biết dây chuyền khỏe hay bệnh". Nhấp theo `so` (giá trị THẬT) chứ không theo `chu` (chuỗi đã
 * định dạng): `tongTien` làm tròn hai chữ số, nên hai giá trị khác nhau có thể cho cùng một
 * chuỗi và cú nhấp sẽ mất đúng những lần đổi nhỏ. `key` làm animation chạy lại; xem
 * lib/dauDoi.ts.
 */
function OTong({
  so: giaTri,
  chu,
  nhan,
  loai,
  phu,
  viSaoPhu,
}: {
  so: number;
  /** `undefined` là ca THẬT: `so()` trả undefined cho giá trị vắng hoặc không hữu hạn. */
  chu: string | undefined;
  nhan: string;
  /** `chot` = tiến độ (teal) · `tien` = tiền (gold) · `tu` = số từ, không tô. */
  loai: 'chot' | 'tien' | 'tu';
  /** Mẫu số của con số, khi nó không phủ hết tủ. */
  phu?: string;
  viSaoPhu?: string;
}) {
  const dau = useDauDoi(giaTri);
  return (
    <span key={dau} className={`o${dau > 0 ? ` vuaDoi-${loai}` : ''}`}>
      <b>{chu ?? CHU.khongCo}</b> <em>{nhan}</em>
      {phu ? (
        <span className="mauSo" title={viSaoPhu}>
          {phu}
        </span>
      ) : null}
    </span>
  );
}
