'use client';

import { layChiPhi } from '@/lib/api';
import { CHU_VH } from '@/lib/chu/van-hanh';
import { donGia, ngayGio, phanTram, so, tongTien } from '@/lib/dinhdang';
import { CHU, GIAI_THICH, nhanVai } from '@/lib/nhan';
import type { CostDoc, Snapshot, UsageTotals } from '@/lib/types';
import { useHoSo } from '@/lib/useHoSo';

import { HoSoKhung, tinhTrangNguon } from './HoSoKhung';

/**
 * Chi phí: tiền đi đâu, và số đó đáng tin tới mức nào.
 *
 * # Ba ô số ở đầu, và vì sao chúng không phải hero-metric
 *
 * Người vận hành mở màn này để hỏi đúng ba câu: tốn bao nhiêu, mỗi chương bao nhiêu, bộ đệm
 * gỡ lại bao nhiêu. Ba ô trả lời ba câu đó, cùng cỡ, mỗi ô kèm MẪU SỐ của nó ngay dưới — một
 * con số tiền trơ không nói được nó cộng trên bao nhiêu chương. Không có ô nào to hơn ô nào.
 *
 * # Câu hỏi đắt hơn là "con số đó có đủ không"
 *
 * `missing_assistant_usage` đếm số lượt gọi model KHÔNG báo lại usage. Lớn hơn 0 nghĩa là mọi
 * con số ở đây là SÀN. Nên dòng độ tin đứng ngay dưới ba ô, trước phần phân bổ.
 *
 * # Phân bổ bằng thanh, bảng token thu vào "Xem chi tiết"
 *
 * "Tiền đi vào vai nào" là một tỉ lệ, và thanh trả lời nó bằng một cú nhìn. Bảng tám cột vẫn
 * còn nguyên — nó là chỗ đối chiếu với hoá đơn — nhưng gập lại, vì đó là việc đọc-một-lần.
 */
export function ChiPhi({ tacPham, snapshot }: { tacPham: string | undefined; snapshot: Snapshot }) {
  const tai = useHoSo(tacPham, layChiPhi);
  const tt = tinhTrangNguon(tai);
  const du = tai.du;

  return (
    <HoSoKhung tieuDe={CHU.chiPhi} motTa={tt || !du ? undefined : motTa(du, snapshot)}>
      {tt ??
        (du ? (
          du.state === 'ready' ? (
            <div className="vh vhChiPhi">
              <OSoChiPhi du={du} snapshot={snapshot} />
              <DoTin du={du} snapshot={snapshot} />
              <div className="vhDoi">
                <PhanBo
                  tieuDe={CHU.theoTacTu}
                  o={du.per_agent}
                  tong={du.overall.cost_usd}
                  nhan={nhanVai}
                  muc="vai"
                />
                <PhanBo
                  tieuDe={CHU.theoModel}
                  o={du.per_model}
                  tong={du.overall.cost_usd}
                  mono
                  muc="model"
                />
              </div>
              <details className="the vhChiTiet">
                <summary>
                  <span className="vhChiTietTen">{CHU_VH.xemChiTiet}</span>
                  <span className="vhChiTietPhu">{CHU_VH.xemChiTietPhu}</span>
                </summary>
                <BangGop
                  tieuDe={CHU.theoTacTu}
                  o={du.per_agent}
                  overall={du.overall}
                  nhanO={nhanVai}
                  cotDau={CHU.colVai}
                  tepNguon={GIAI_THICH.chiPhiTepNguon}
                  muc="vai"
                  giaiTongChung
                />
                <BangGop
                  tieuDe={CHU.theoModel}
                  o={du.per_model}
                  overall={du.overall}
                  cotDau={CHU.model}
                  maCotDau
                  tepNguon={GIAI_THICH.chiPhiTepNguon}
                  muc="model"
                />
              </details>
            </div>
          ) : (
            <ThieuNguon du={du} />
          )
        ) : null)}
    </HoSoKhung>
  );
}

/** Ba ô số: tổng, giá mỗi chương, bộ đệm tiết kiệm — mỗi ô kèm mẫu số của nó. */
function OSoChiPhi({ du, snapshot }: { du: CostDoc; snapshot: Snapshot }) {
  const xong = snapshot.book.completed_chapters;
  const gia = snapshot.transport.cost_per_chapter;
  return (
    <div className="vhSo">
      <OSo
        nhan={CHU_VH.daTieu}
        so={tongTien(du.overall.cost_usd) ?? CHU.khongCo}
        phu={CHU_VH.daTieuTren(xong)}
      />
      {/* Giá mỗi chương CÓ nguồn thật — tổng chia số chương đã xong — nhưng cửa sổ của nó
          phải viết cạnh nó, nếu không nó bị đọc thành "chương kế tiếp sẽ tốn chừng này". */}
      <OSo
        nhan={CHU_VH.giaMoiChuong}
        so={gia != null ? (donGia(gia) ?? CHU.khongCo) : CHU.khongCo}
        phu={gia != null ? CHU.cuaSoGiaThanh(xong) : CHU_VH.giaChuaCo}
      />
      {/* Tiền tiết kiệm KHÔNG phải tiền trong ví mà là tiền lẽ ra phải trả nếu không có bộ
          đệm. Dòng phụ nói ra điều đó. */}
      <OSo
        nhan={CHU_VH.boDemTietKiem}
        so={tongTien(du.overall.saved_usd) ?? CHU.khongCo}
        phu={CHU_VH.boDemTietKiemPhu}
        mau="teal"
      />
    </div>
  );
}

/** Một ô số. Dùng chung với Chi phí tổng để hai màn đọc cùng một hình. */
export function OSo({
  nhan,
  so,
  phu,
  mau,
}: {
  nhan: string;
  so: string;
  phu?: string;
  mau?: 'teal' | 'amber';
}) {
  return (
    <div className="the vhO" data-mau={mau}>
      <span className="vhONhan">{nhan}</span>
      <span className="vhOSo">{so}</span>
      {phu ? <span className="vhOPhu">{phu}</span> : null}
    </div>
  );
}

/**
 * Một nhóm phân bổ: tên · thanh · tiền · phần của tổng.
 *
 * Thanh tỉ lệ với mục LỚN NHẤT CỦA CHÍNH NHÓM, không với tổng và không dùng chung mốc với
 * nhóm kia: chia theo tổng thì các vai nhỏ thành vạch không thấy được, còn dùng chung mốc thì
 * một thanh tính ra quá 100% và bị cắt thành một thanh đầy nói dối (đo được trên xưởng thật:
 * một model tốn gần gấp đôi vai tốn nhất). Phần trăm in bên phải là phần của TỔNG — con số
 * người đọc thật sự muốn — nên thanh và chữ không phải lặp lại nhau.
 *
 * `o === null` (chưa có tệp) và `{}` (có tệp mà chưa mục nào) đi qua hai câu khác nhau.
 */
export function PhanBo({
  tieuDe,
  o,
  tong,
  nhan,
  mono,
  muc,
}: {
  tieuDe: string;
  o: Record<string, UsageTotals> | null;
  tong: number;
  nhan?: (ma: string) => string;
  /** Tên model là ĐỊNH DANH đối chiếu được nên dùng chữ mono; tên vai là nhãn tiếng Việt. */
  mono?: boolean;
  muc: string;
}) {
  const hang = o ? xepTheoChiPhi(Object.entries(o)) : [];
  const dinh = hang[0]?.[1].cost_usd ?? 0;

  return (
    <section className="the vhBo">
      <h2>{tieuDe}</h2>
      {hang.length === 0 ? (
        <p className="trongSect">
          {o === null
            ? GIAI_THICH.nguonChuaGhi(GIAI_THICH.chiPhiTepNguon, GIAI_THICH.chiPhiKhiNao)
            : GIAI_THICH.nguonCoMaRong(GIAI_THICH.chiPhiTepNguon, muc)}
        </p>
      ) : (
        <ul className="vhBoDs">
          {hang.map(([ma, t]) => {
            // Kiểm `!= null`, không falsy: `$0` là một phép đo có thật (vai đã chạy mà chưa
            // tốn đồng nào), khác hẳn vắng mặt.
            const rong = dinh > 0 && t.cost_usd != null ? (t.cost_usd / dinh) * 100 : 0;
            const phan = tong > 0 && t.cost_usd != null ? phanTram(t.cost_usd / tong) : undefined;
            return (
              <li key={ma} className="vhBoHang">
                <span className={`vhBoTen${mono ? ' ma' : ''}`} title={ma}>
                  {nhan ? nhan(ma) : ma}
                </span>
                <span className="vhBoThanh" aria-hidden="true">
                  <span style={{ width: `${Math.min(100, Math.max(0, rong))}%` }} />
                </span>
                <span className="vhBoTien">{tongTien(t.cost_usd) ?? CHU.khongCo}</span>
                <span className="vhBoPhan">{phan ? CHU_VH.phanTong(phan) : ''}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * Ba trạng thái "không có bảng để vẽ", ba câu khác nhau.
 *
 * `stale_schema` là câu thứ tư và nó tồn tại vì `UsageStore.Load()` trả
 * `(nil, nil)` cho HAI ca khác nhau: thiếu tệp, và tệp có mà `Schema` không khớp
 * bản engine đang chạy. Gộp lại thì một tác phẩm CÓ số liệu cũ bị báo là "chưa
 * chạy gì" — sai theo đúng hướng nguy hiểm nhất, vì nó làm người vận hành tưởng
 * mình chưa tốn tiền.
 */
function ThieuNguon({ du }: { du: CostDoc }) {
  const cau =
    du.state === 'no_file'
      ? GIAI_THICH.nguonChuaGhi(GIAI_THICH.chiPhiTepNguon, GIAI_THICH.chiPhiKhiNao)
      : du.state === 'empty'
        ? GIAI_THICH.nguonCoMaRong(GIAI_THICH.chiPhiTepNguon, 'lượt gọi')
        : GIAI_THICH.chiPhiSchemaCu;

  return (
    <section className="vh">
      <div className="the vhTrong">
        <p className="trongSect">{cau}</p>
        {/* Mốc cập nhật là bằng chứng cho câu "có chạy, chỉ không đọc được" — nên hiện
          khi có.
          Nhưng ĐO ĐƯỢC ở bản engine này: ca `stale_schema` trả `updated_at: ""`.
          `UsageStore.Load()` trả nil khi schema lệch, nên `buildCost` biết tệp TỒN
          TẠI (nó stat) mà không đọc được gì bên trong — kể cả mốc thời gian. Vậy ở
          đúng ca cần bằng chứng nhất thì không có bằng chứng nào, và nhánh này hiện
          không chạy.
          Giữ lại có chủ ý: nó không sai, và nó bật lên ngay nếu tầng Go về sau mang
          mtime của tệp ra. KHÔNG vẽ một hàng rỗng để lấp chỗ — một nhãn "Cập nhật"
          với giá trị trống còn tệ hơn là không có hàng đó. */}
        {du.state === 'stale_schema' && du.updated_at ? (
          <dl className="kv kvcp">
            <dt>{CHU.capNhat}</dt>
            <dd className="m">{ngayGio(du.updated_at) ?? du.updated_at}</dd>
          </dl>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Một bảng token cộng dồn — dùng chung cho theo-tác-tử và theo-model, nằm trong "Xem chi
 * tiết". Đây là chỗ đối chiếu với hoá đơn, không phải chỗ đọc hằng ngày.
 *
 * `o === null` (chưa có tệp) và `{}` (có tệp mà chưa mục nào) đi qua hai câu khác
 * nhau, vì hai ca đó dẫn tới hai chỗ khác nhau để đi xem.
 */
function BangGop({
  tieuDe,
  o,
  overall,
  nhanO,
  cotDau,
  maCotDau,
  tepNguon,
  muc,
  giaiTongChung,
}: {
  tieuDe: string;
  o: Record<string, UsageTotals> | null;
  overall: UsageTotals;
  nhanO?: (ma: string) => string;
  cotDau: string;
  maCotDau?: boolean;
  tepNguon: string;
  muc: string;
  /**
   * Lời giải cho hàng `Tổng chung` — chỉ bật ở BẢNG ĐẦU.
   *
   * Hàng đó có ở cả hai bảng và lời giải đúng cho cả hai, nhưng in nguyên đoạn ba
   * dòng hai lần trong cùng một bề mặt thì lần thứ hai không thêm tin nào — nó chỉ
   * dạy người đọc bỏ qua đoạn văn giải thích, kể cả những đoạn có tin.
   */
  giaiTongChung?: boolean;
}) {
  const hang = o ? Object.entries(o) : [];

  return (
    <section className="sect">
      <h2>{tieuDe}</h2>

      {hang.length === 0 ? (
        <p className="trongSect">
          {o === null
            ? GIAI_THICH.nguonChuaGhi(tepNguon, GIAI_THICH.chiPhiKhiNao)
            : GIAI_THICH.nguonCoMaRong(tepNguon, muc)}
        </p>
      ) : (
        <>
          <div className="bangwrap">
            <table className="bang bangcp">
              <thead>
                <tr>
                  <th scope="col">{cotDau}</th>
                  <th scope="col" className="num">
                    {CHU.colChiPhi}
                  </th>
                  <th scope="col" className="num">
                    {CHU.colTiTrong}
                  </th>
                  <th scope="col" className="num">
                    {CHU.colNhap}
                  </th>
                  <th scope="col" className="num">
                    {CHU.colXuat}
                  </th>
                  <th scope="col" className="num">
                    {CHU.colDocDem}
                  </th>
                  <th scope="col" className="num">
                    {CHU.colGhiDem}
                  </th>
                  <th scope="col" className="num">
                    {CHU.colTietKiem}
                  </th>
                </tr>
              </thead>
              <tbody>
                {xepTheoChiPhi(hang).map(([ma, t]) => (
                  <tr key={ma}>
                    <td className={maCotDau ? 'model' : 'vai'}>
                      {maCotDau ? <span className="ma">{ma}</span> : (nhanO?.(ma) ?? ma)}
                    </td>
                    <O t={t} overall={overall} />
                  </tr>
                ))}
              </tbody>
              {/* Tổng ở CHÂN bảng, không ở đầu trang: đây là mẫu số của cột "Tỉ
                  trọng" ngay bên trên, nên chỗ của nó là cạnh những con số nó
                  chia. Đặt lên đầu là biến nó thành hero-metric. */}
              <tfoot>
                <tr>
                  <td>{CHU.tongChung}</td>
                  <O t={overall} overall={overall} laTong />
                </tr>
              </tfoot>
            </table>
          </div>
          {/* Bảng tám cột không vừa màn hình hẹp, và ở đó thanh cuộn của
              `.bangwrap` là overlay nên vô hình cho tới khi đã cuộn. Dòng này chỉ
              hiện dưới 700px — ở bề rộng đó bảng LUÔN rộng hơn khung (min-width
              660px so với ~354px chỗ thật), nên điều kiện là chắc chắn về mặt cấu
              trúc và không cần đo bằng JS. */}
          <p className="bangkeongang">{GIAI_THICH.bangConCotBenPhai}</p>
          {/* Tổng chung KHÔNG phải tổng các hàng trên, và giao diện cố ý không tự
              cộng lại để kiểm: một lượt gọi không gắn với vai nào vẫn vào tổng
              chung, nên hai con số lệch nhau là chuyện bình thường. Nói ra điều đó
              rẻ hơn và thật hơn việc khẳng định một nguyên nhân. */}
          {giaiTongChung ? <p className="steerhint">{GIAI_THICH.chiPhiTongChung}</p> : null}
        </>
      )}
    </section>
  );
}

/**
 * Các ô số của một hàng.
 *
 * Mọi con số kiểm bằng `!= null`, KHÔNG bằng falsy — `$0` là một sự thật (model
 * miễn phí, hoặc nhà cung cấp không tính giá) còn "chưa có số liệu" là sự thật
 * khác. Lỗi thật đã gặp trong repo này: điểm 0/100 biến mất khỏi giao diện vì một
 * phép kiểm falsy (xem `Dimension.Score`, internal/serve/model.go:95).
 */
function O({ t, overall, laTong }: { t: UsageTotals; overall: UsageTotals; laTong?: boolean }) {
  // Tỉ trọng cần mẫu số khác 0. `0/0` cho NaN, và "0%" ở đó là một câu SAI chứ
  // không phải một câu trống — nên chặn ở đây để ý đồ đọc được.
  const ti = overall.cost_usd > 0 && t.cost_usd != null ? t.cost_usd / overall.cost_usd : undefined;

  return (
    <>
      <td className="num">{tongTien(t.cost_usd) ?? CHU.khongCo}</td>
      <td className="num">
        {/* Hàng tổng không có tỉ trọng của chính nó: "100%" là một con số vô nghĩa
            ở đây, và tệ hơn, nó ngụ ý các hàng trên cộng đủ thành nó. */}
        {laTong ? <span className="trong">{CHU.khongCo}</span> : (phanTram(ti) ?? CHU.khongCo)}
      </td>
      <td className="num">{so(t.input) ?? CHU.khongCo}</td>
      <td className="num">{so(t.output) ?? CHU.khongCo}</td>
      {/* `cache_capable === false` nghĩa là KHÔNG ÁP DỤNG, không phải 0. In "0" ở
          đây nói "model có đệm mà không trúng lần nào" — một chẩn đoán sai về một
          model đơn giản là không có tính năng đó. */}
      <OCache co={t.cache_capable} n={t.cache_read} />
      <OCache co={t.cache_capable} n={t.cache_write} />
      <td className="num">{tongTien(t.saved_usd) ?? CHU.khongCo}</td>
    </>
  );
}

function OCache({ co, n }: { co: boolean; n: number }) {
  if (!co) {
    return (
      <td className="num">
        <span className="trong" title={GIAI_THICH.chiPhiDemKhongApDung}>
          {CHU.khongApDung}
        </span>
      </td>
    );
  }
  return <td className="num">{so(n) ?? CHU.khongCo}</td>;
}

/**
 * Độ tin của số liệu — phần khiến bề mặt này khác một bảng kế toán.
 *
 * Một dòng, không phải một bảng: viên trạng thái nói kết luận (đủ hay thiếu), câu bên cạnh
 * nói hệ quả, và các sự thật đo được (lượt thiếu, lần hụt bộ đệm, mốc cập nhật) đứng nhỏ ở
 * cuối. Cả ba đều nói về GIỚI HẠN của những con số phía trên.
 */
function DoTin({ du, snapshot }: { du: CostDoc; snapshot: Snapshot }) {
  const thieu = du.missing_assistant_usage;
  const dut = du.overall.cache_breaks;
  const capNhat = du.updated_at ? (ngayGio(du.updated_at) ?? du.updated_at) : undefined;

  return (
    <section className="the vhTin" aria-label={CHU.doTinSoLieu} data-thieu={thieu > 0 || undefined}>
      <div className="vhTinDong">
        {thieu > 0 ? (
          <span className="vien amber">
            <span aria-hidden="true">■</span>
            {CHU_VH.thieuLuot(thieu)}
          </span>
        ) : (
          <span className="vien teal">
            <span aria-hidden="true">●</span>
            {CHU_VH.soLieuDayDu}
          </span>
        )}
        <span className="vhTinCau">
          {thieu > 0 ? GIAI_THICH.chiPhiThieuUsage(thieu) : CHU_VH.soLieuDayDuCau}
        </span>
      </div>
      <p className="vhTinPhu">
        {/* `0` in ra là `0`: "đã đo, không lượt nào thiếu" là một sự thật đáng đọc. */}
        <span>
          {CHU.luotThieuUsage}: {so(thieu) ?? CHU.khongCo}
        </span>
        <span title={dut > 0 ? GIAI_THICH.chiPhiDutDem(CHU.demDutDem(dut)) : undefined}>
          {CHU_VH.hutDemNgan(dut)}
        </span>
        {capNhat ? <span>{CHU_VH.capNhatLuc(capNhat)}</span> : null}
      </p>
      {/* Chi phí theo TỪNG chương không có nguồn, và cờ capability nói đúng điều đó. */}
      {snapshot.capabilities.per_chapter_cost === false ? (
        <p className="steerhint">{GIAI_THICH.chiPhiKhongTheoChuong}</p>
      ) : null}
    </section>
  );
}

/** Tốn nhiều nhất lên đầu: bề mặt này để tìm chỗ tiền đi, không để tra bảng chữ cái. */
function xepTheoChiPhi(hang: [string, UsageTotals][]): [string, UsageTotals][] {
  return [...hang].sort((a, b) => (b[1].cost_usd ?? 0) - (a[1].cost_usd ?? 0));
}

/**
 * Dòng mô tả: tổng kèm MẪU SỐ của nó.
 *
 * Một con số tiền trơ không nói được nó cộng trên bao nhiêu chương, và người vận
 * hành sẽ so nó với con số của một tác phẩm khác có độ dài khác.
 */
function motTa(du: CostDoc, snapshot: Snapshot): string | undefined {
  if (du.state !== 'ready') return undefined;
  const tien = tongTien(du.overall.cost_usd);
  if (!tien) return undefined;
  return CHU.tongTrenChuong(tien, snapshot.book.completed_chapters);
}
