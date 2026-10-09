'use client';

import { useState } from 'react';

import { LoiApi, boNhapDo, chayMoPhong, nhapHoSoMoPhong, nhapTruyen, tiepTucNhap, xuatBan } from '@/lib/api';
import { CHU_VH } from '@/lib/chu/van-hanh';
import { CHU, GIAI_THICH } from '@/lib/nhan';
import type { DongNhatKy, NhapDo } from '@/lib/types';

import { BieuTuong } from './BieuTuong';
import { HopXacNhan } from './HopXacNhan';

/**
 * Nhập & Xuất — ba luồng cần tệp.
 *
 * # Vì sao ba luồng ở CÙNG một bề mặt
 *
 * Chúng khác nhau về mục đích nhưng giống nhau về hình dạng tương tác: chọn tệp, bấm chạy,
 * đọc nhật ký. Tách thành ba khu sẽ nhân ba cùng một bố cục trong rail và buộc người vận
 * hành nhớ ba chỗ cho một loại việc.
 *
 * Xuất bản đi ngược chiều (tải VỀ) nhưng vẫn thuộc đây: nó là đầu ra của cùng cái xưởng, và
 * người tìm "chỗ đưa tệp vào ra" tìm ở một chỗ.
 *
 * # Cả ba đòi engine ĐANG MỞ
 *
 * `ImportFrom`, `SimulateFrom` và `Export` đều là method của `Host`. Hai luồng đầu còn giữ
 * khóa độc quyền của engine (`acquireExclusive`), tức chúng không chạy song song với việc
 * viết — và đó là đúng: nhập một cuốn ngoài vào giữa lúc đang viết sẽ ghi chồng dàn ý.
 */
export function NhapXuat({
  tacPham,
  soChuongXong,
  nhapDo = null,
  onDoi = () => {},
}: {
  tacPham: string | undefined;
  /** Số chương đã xong — chặn trên của khoảng chương. Vắng thì không chặn (không đoán 0). */
  soChuongXong?: number;
  /** `snapshot.import` — lượt nhập đang dừng giữa chừng, nếu có. */
  nhapDo?: NhapDo | null;
  /** Nạp lại snapshot sau mỗi bước nhập — pha nhập đổi ở phía engine. */
  onDoi?: () => void;
}) {
  return (
    <main className="canvas vhMan" id="nhap-xuat">
      <div className="head">
        <h1>{CHU.nhapXuat}</h1>
      </div>

      <div className="vh vhNx">
        {!tacPham ? (
          <p className="the vhTrong trongSect">{GIAI_THICH.nhapXuatCanTacPham}</p>
        ) : (
          <>
            <XuatBan tacPham={tacPham} soChuongXong={soChuongXong} />
            {/* Nhập và học văn phong là việc làm một lần cho mỗi truyện, nên cùng một thẻ và
                gập lại mặc định: không chiếm chỗ của Xuất bản, thứ người dùng bấm nhiều lần. */}
            <section className="the vhThe vhNhap">
              <div className="vhTheDau">
                <span className="vhTheBt" aria-hidden="true">
                  <BieuTuong ten="doc" co={18} />
                </span>
                <div>
                  <h2>{CHU_VH.nhapVaHoc}</h2>
                  <p>{CHU_VH.nhapVaHocPhu}</p>
                </div>
              </div>
              <NhapTruyen tacPham={tacPham} nhapDo={nhapDo} onDoi={onDoi} />
              <MoPhong tacPham={tacPham} />
            </section>
          </>
        )}
      </div>
    </main>
  );
}

/* ── xuất bản ──────────────────────────────────────────────────────────── */

const DINH_DANG = [
  { ma: 'TXT', giai: CHU_VH.dinhDangTxt },
  { ma: 'EPUB', giai: CHU_VH.dinhDangEpub },
] as const;

/**
 * Xuất bản là thẻ lớn ĐẦU bề mặt vì nó là việc hay làm nhất trong ba luồng, và là việc duy
 * nhất không có hệ quả lên store — người dùng bấm nó nhiều lần mà không sợ gì.
 *
 * Định dạng là hai thẻ chọn (radio thật bên dưới, nên bàn phím và trình đọc màn hình dùng
 * được như một nhóm), không phải ô thả xuống: chỉ có hai lựa chọn, và câu giải thích dưới mỗi
 * cái là thứ một `<select>` không chứa được.
 */
function XuatBan({ tacPham, soChuongXong }: { tacPham: string; soChuongXong?: number }) {
  // Không có `max` thì trình duyệt báo `valuemax=0` cho trình đọc màn hình — và mũi tên lên
  // của ô số chạy quá số chương thật. Chỉ đặt khi biết chắc có chương.
  const toiDa = soChuongXong && soChuongXong > 0 ? soChuongXong : undefined;
  const [dinhDang, datDinhDang] = useState<'TXT' | 'EPUB'>('TXT');
  const [tu, datTu] = useState('');
  const [den, datDen] = useState('');
  const [dangGui, datDangGui] = useState(false);
  const [loi, datLoi] = useState<string | null>(null);
  const [xong, datXong] = useState<{ ten: string; boQua: number[]; soChuong: number } | null>(null);

  const gui = () => {
    datDangGui(true);
    datLoi(null);
    datXong(null);
    xuatBan(tacPham, {
      format: dinhDang,
      from: Number(tu) || undefined,
      to: Number(den) || undefined,
    })
      .then(datXong)
      .catch((e: unknown) => datLoi(e instanceof LoiApi ? e.message : String(e)))
      .finally(() => datDangGui(false));
  };

  return (
    <section className="the vhThe vhXuat">
      <div className="vhTheDau">
        <span className="vhTheBt" data-chinh aria-hidden="true">
          <BieuTuong ten="xuatBan" co={18} />
        </span>
        <div>
          <h2>{CHU.xuatBan}</h2>
          <p>{GIAI_THICH.xuatBanGiaiThich}</p>
        </div>
      </div>

      <fieldset className="vhNhomChon">
        <legend>{CHU.dinhDang}</legend>
        <div className="vhDdDs">
          {DINH_DANG.map((d) => (
            <label key={d.ma} className="vhDd">
              <input
                type="radio"
                name={`dinh-dang-${tacPham}`}
                value={d.ma}
                checked={dinhDang === d.ma}
                onChange={() => datDinhDang(d.ma)}
              />
              <span className="vhDdTen">{d.ma}</span>
              <span className="vhDdGiai">{d.giai}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="vhNhomChon">
        <legend>{CHU_VH.khoangChuong}</legend>
        <div className="vhKhoang">
          <input
            type="number"
            min={1}
            max={toiDa}
            inputMode="numeric"
            aria-label={CHU.tuChuong}
            value={tu}
            onChange={(e) => datTu(e.target.value)}
            placeholder="1"
          />
          <span aria-hidden="true">{CHU_VH.denNgan}</span>
          <input
            type="number"
            min={1}
            max={toiDa}
            inputMode="numeric"
            aria-label={CHU.denChuong}
            value={den}
            onChange={(e) => datDen(e.target.value)}
            placeholder={toiDa ? String(toiDa) : CHU.chuongCuoi}
          />
        </div>
        <p className="steerhint">{CHU_VH.khoangChuongPhu}</p>
      </fieldset>

      {loi ? <p className="loiDoc">{loi}</p> : null}
      {xong ? (
        <p className="vhXong" role="status">
          <span className="vien teal">
            <span aria-hidden="true">●</span>
            {CHU.daTaiVe(xong.ten, xong.soChuong)}
          </span>
          {/* Chương bị bỏ qua KHÔNG phải lỗi — chương chưa viết xong thì exp.Run bỏ qua có
              chủ ý. Nhưng người dùng phải biết bản họ vừa tải thiếu gì, nếu không họ gửi
              đi một bản thiếu chương mà tưởng là đủ. */}
          {xong.boQua.length > 0 ? (
            <span className="vhXongBoQua">{CHU.boQuaChuong(xong.boQua)}</span>
          ) : null}
        </p>
      ) : null}

      <div className="vhTheNut">
        <button type="button" className="nutChinh" disabled={dangGui} onClick={gui}>
          <BieuTuong ten="xuatBan" co={14} />
          {dangGui ? CHU.dangGui : CHU.taiVe}
        </button>
      </div>
    </section>
  );
}

/* ── nhập truyện ngoài ─────────────────────────────────────────────────── */

/**
 * # Lượt nhập dừng giữa chừng
 *
 * Engine dừng một lượt nhập ở ba chỗ (`snapshot.import.phase`) và giữ khóa viết cho tới khi
 * lượt nhập xong — nên mỗi pha phải có lối đi tiếp ngay ở đây, nếu không cuốn đứng mãi. Chỉ
 * hiện điều khiển của ĐÚNG pha đang có; tải tệp mới lúc còn lượt dở thì server từ chối, nên
 * biểu mẫu tệp ẩn đi thay vì để người dùng bấm vào một lỗi. Nhãn nút khớp nguyên văn câu
 * engine viết trong nhật ký.
 */
function NhapTruyen({
  tacPham,
  nhapDo,
  onDoi,
}: {
  tacPham: string;
  nhapDo: NhapDo | null;
  onDoi: () => void;
}) {
  const [tep, datTep] = useState<File | null>(null);
  const [huongDan, datHuongDan] = useState('');
  const [tuDongChot, datTuDongChot] = useState(false);
  const [ket, datKet] = useState<'open' | 'closed' | null>(null);
  const [chay, datChay] = useState(false);
  const [loi, datLoi] = useState<string | null>(null);
  const [nhatKy, datNhatKy] = useState<DongNhatKy[] | null>(null);
  const [hoiBo, datHoiBo] = useState(false);
  const [dangBo, datDangBo] = useState(false);
  const [daBo, datDaBo] = useState(false);

  const chayLuong = (fn: () => Promise<{ log: DongNhatKy[] }>) => {
    datChay(true);
    datLoi(null);
    datNhatKy(null);
    datDaBo(false);
    fn()
      .then((r) => datNhatKy(r.log))
      .catch((e: unknown) => datLoi(e instanceof LoiApi ? e.message : String(e)))
      // Pha nhập đổi ở phía engine — nạp lại snapshot để điều khiển đi theo pha mới.
      .finally(() => {
        datChay(false);
        onDoi();
      });
  };

  const gui = () => {
    if (!tep) return;
    chayLuong(() => nhapTruyen(tacPham, tep, { autoConfirm: tuDongChot, guide: huongDan }));
  };

  const tiepTuc = (tuyChon: Parameters<typeof tiepTucNhap>[1]) => chayLuong(() => tiepTucNhap(tacPham, tuyChon));

  const bo = () => {
    datDangBo(true);
    datLoi(null);
    boNhapDo(tacPham)
      .then((r) => {
        datHoiBo(false);
        datNhatKy(null);
        // `false` = không còn gì để bỏ (đã xong từ trước) — không báo "đã bỏ" cho một việc không xảy ra.
        datDaBo(r.discarded);
        onDoi();
      })
      .catch((e: unknown) => {
        datHoiBo(false);
        datLoi(e instanceof LoiApi ? e.message : String(e));
      })
      .finally(() => datDangBo(false));
  };

  const oHuongDan = (
    <label className="oNhap">
      <span>{CHU.huongDanChia}</span>
      <input
        value={huongDan}
        onChange={(e) => datHuongDan(e.target.value)}
        placeholder="Ví dụ: mỗi chương bắt đầu bằng một dòng chỉ có số"
      />
    </label>
  );

  return (
    // Có lượt dở thì mở sẵn: đây là việc đang chặn cả cuốn, không phải việc làm một lần.
    <details className="vhGapLon" open={nhapDo ? true : undefined}>
      <summary>
        <span className="vhGapTen">{CHU.nhapTruyenNgoai}</span>
        <span className="vhGapGiai">{GIAI_THICH.nhapTruyenGiaiThich}</span>
      </summary>

      {nhapDo ? (
        <div className="bieuMau vhNhapDo" role="group" aria-label={CHU_VH.nhapDoTieuDe}>
          <p className="vhNhapDoDau">
            <strong>{CHU_VH.nhapDoTieuDe}.</strong> {CHU_VH.nhapDoChanViet}
            {!nhapDo.error && nhapDo.chapters > 0 ? (
              <> {CHU_VH.nhapDoTienDo(nhapDo.chapters, nhapDo.analyzed)}</>
            ) : null}
          </p>

          {nhapDo.phase === 'awaiting_confirm' ? (
            <>
              <p className="steerhint">{CHU_VH.nhapDoChoChia}</p>
              {oHuongDan}
              <div className="nccNut">
                <button type="button" className="nutChinh" disabled={chay} onClick={() => tiepTuc({ accept: true })}>
                  {chay ? CHU.dangChayLuong : CHU_VH.chapNhanChia}
                </button>
                <button
                  type="button"
                  className="nutPhu"
                  disabled={chay || !huongDan.trim()}
                  onClick={() => tiepTuc({ guide: huongDan.trim() })}
                >
                  {CHU_VH.tiepTucNhap}
                </button>
              </div>
            </>
          ) : nhapDo.phase === 'story_uncertain' ? (
            <>
              <p className="steerhint">{CHU_VH.nhapDoChuaRoKet}</p>
              <div className="vhChonKet" role="radiogroup" aria-label={CHU_VH.nhapDoChuaRoKet}>
                {(
                  [
                    ['closed', CHU_VH.truyenDaKet],
                    ['open', CHU_VH.truyenConViet],
                  ] as const
                ).map(([ma, nhan]) => (
                  <label key={ma}>
                    <input type="radio" name="nhap-ket" checked={ket === ma} onChange={() => datKet(ma)} />
                    {nhan}
                  </label>
                ))}
              </div>
              <div className="nccNut">
                <button
                  type="button"
                  className="nutChinh"
                  disabled={chay || !ket}
                  onClick={() => ket && tiepTuc({ story: ket })}
                >
                  {chay ? CHU.dangChayLuong : CHU_VH.tiepTucNhap}
                </button>
              </div>
            </>
          ) : nhapDo.error ? (
            // Thư mục nhập hỏng: tiếp tục chắc chắn thất bại — chỉ còn nút bỏ ngay dưới.
            <p className="loiDoc">
              {CHU_VH.nhapDoHong}
              {nhapDo.error ? ` (${nhapDo.error})` : null}
            </p>
          ) : (
            <>
              <p className="steerhint">{CHU_VH.nhapDoBiNgat}</p>
              <div className="nccNut">
                <button type="button" className="nutChinh" disabled={chay} onClick={() => tiepTuc({})}>
                  {chay ? CHU.dangChayLuong : CHU_VH.tiepTucNhap}
                </button>
              </div>
            </>
          )}

          {loi ? <p className="loiDoc">{loi}</p> : null}

          <div className="nccNut">
            <button type="button" className="nutPhu" disabled={chay || dangBo} onClick={() => datHoiBo(true)}>
              {CHU_VH.boNhapDo}
            </button>
          </div>
          <HopXacNhan
            moRa={hoiBo}
            tieuDe={CHU_VH.boNhapDoHoi}
            than={CHU_VH.boNhapDoThan}
            nhanLam={CHU_VH.boNhapDoLam}
            nhanDangLam={CHU_VH.dangBo}
            dangLam={dangBo}
            onLam={bo}
            onHuy={() => datHoiBo(false)}
          />
        </div>
      ) : (
        <div className="bieuMau">
          {daBo ? (
            <p className="steerhint" role="status">
              {CHU_VH.daBoNhapDo}
            </p>
          ) : null}
          <label className="oNhap">
            <span>{CHU.tepNguon}</span>
            <input
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              onChange={(e) => datTep(e.target.files?.[0] ?? null)}
            />
          </label>
          {oHuongDan}
          <label className="oNhap oNhapCheck">
            <span>{CHU.tuDongChotChia}</span>
            <input
              type="checkbox"
              checked={tuDongChot}
              onChange={(e) => datTuDongChot(e.target.checked)}
            />
          </label>
          {/* Cảnh báo đứng cạnh CHÍNH ô nó nói về, không ở đầu mục: đây là uỷ quyền mù, và
              người dùng phải đọc nó lúc đang bấm chứ không phải lúc bắt đầu đọc trang. */}
          <p className="steerhint">{GIAI_THICH.tuDongChotLaUyQuyenMu}</p>

          {loi ? <p className="loiDoc">{loi}</p> : null}

          <div className="nccNut">
            <button type="button" className="nutChinh" disabled={chay || !tep} onClick={gui}>
              {chay ? CHU.dangChayLuong : CHU.batDauNhap}
            </button>
          </div>
        </div>
      )}

      <NhatKyLuong nhatKy={nhatKy} dangChay={chay} />
    </details>
  );
}

/* ── mô phỏng văn phong ────────────────────────────────────────────────── */

function MoPhong({ tacPham }: { tacPham: string }) {
  const [nguLieu, datNguLieu] = useState<File[]>([]);
  const [hoSo, datHoSo] = useState<File | null>(null);
  const [chay, datChay] = useState<'ngu-lieu' | 'ho-so' | null>(null);
  const [loi, datLoi] = useState<string | null>(null);
  const [nhatKy, datNhatKy] = useState<DongNhatKy[] | null>(null);

  const goi = (ten: 'ngu-lieu' | 'ho-so', fn: () => Promise<{ log: DongNhatKy[] }>) => {
    datChay(ten);
    datLoi(null);
    datNhatKy(null);
    fn()
      .then((r) => datNhatKy(r.log))
      .catch((e: unknown) => datLoi(e instanceof LoiApi ? e.message : String(e)))
      .finally(() => datChay(null));
  };

  return (
    <details className="vhGapLon">
      <summary>
        <span className="vhGapTen">{CHU.moPhongVanPhong}</span>
        <span className="vhGapGiai">{GIAI_THICH.moPhongGiaiThich}</span>
      </summary>

      <div className="bieuMau">
        <label className="oNhap">
          <span>{CHU.nguLieu}</span>
          <input
            type="file"
            multiple
            accept=".txt,.md,text/plain,text/markdown"
            onChange={(e) => datNguLieu(Array.from(e.target.files ?? []))}
          />
        </label>
        <div className="nccNut">
          <button
            type="button"
            className="nutChinh"
            disabled={chay !== null || nguLieu.length === 0}
            onClick={() => goi('ngu-lieu', () => chayMoPhong(tacPham, nguLieu))}
          >
            {chay === 'ngu-lieu' ? CHU.dangChayLuong : CHU.dungHoSoTuNguLieu}
          </button>
        </div>

        {/* Nhập hồ sơ sẵn là đường KHÁC, không phải một tùy chọn của đường trên: nó bỏ qua
            cả bước phân tích ngữ liệu, nên gộp hai thứ vào một nút sẽ che mất khác biệt. */}
        <label className="oNhap">
          <span>{CHU.hoSoSan}</span>
          <input
            type="file"
            accept=".json,application/json"
            onChange={(e) => datHoSo(e.target.files?.[0] ?? null)}
          />
        </label>
        <div className="nccNut">
          <button
            type="button"
            className="nutPhu"
            disabled={chay !== null || !hoSo}
            onClick={() => goi('ho-so', () => nhapHoSoMoPhong(tacPham, hoSo!))}
          >
            {chay === 'ho-so' ? CHU.dangChayLuong : CHU.nhapHoSoSan}
          </button>
        </div>

        {loi ? <p className="loiDoc">{loi}</p> : null}
      </div>

      <NhatKyLuong nhatKy={nhatKy} dangChay={chay !== null} />
    </details>
  );
}

/* ── nhật ký chung ─────────────────────────────────────────────────────── */

/**
 * Nhật ký của một luồng đã chạy xong.
 *
 * Bản này KHÔNG stream: server vét cạn channel rồi trả cả nhật ký một lượt (xem chú thích
 * đầu internal/serve/tep.go). Nên trong lúc chạy chỉ có một dòng "đang chạy" — và dòng đó
 * phải nói rõ là có thể lâu, nếu không người dùng tưởng nó treo và bấm lại.
 */
function NhatKyLuong({ nhatKy, dangChay }: { nhatKy: DongNhatKy[] | null; dangChay: boolean }) {
  if (dangChay) return <p className="trongSect">{GIAI_THICH.luongCoTheLau}</p>;
  if (!nhatKy || nhatKy.length === 0) return null;
  return (
    <ul className="nkLuong">
      {nhatKy.map((d, i) => (
        <li key={i} className={d.error ? 'loi' : d.level === 'warn' ? 'canh' : undefined}>
          <span className="nkCd">{d.stage}</span>
          <span className="nkChu">{d.text}</span>
          {d.total && d.total > 0 ? (
            <span className="nkTd">
              {d.current}/{d.total}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
