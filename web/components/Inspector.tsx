'use client';

import { useEffect, useState } from 'react';

import { layChuong, layDanY, layNhanVat } from '@/lib/api';
import { soTu } from '@/lib/dinhdang';
import { CHU, GIAI_THICH, nhanHang, trangThaiDong } from '@/lib/nhan';
import { mayDangChay } from '@/lib/song';
import type {
  ChapterDetail,
  Character,
  Contract,
  Review,
  Selection,
  Snapshot,
} from '@/lib/types';
import { TD } from '@/lib/chu/tien-do';
import { useHoSo } from '@/lib/useHoSo';
import { useTruot } from '@/lib/truot';

import { BanDuyet } from './BanDuyet';
import { MucRong } from './HoSoKhung';
import { TrangThai } from './TrangThai';

type Tab = 'kheuoc' | 'kiemdinh' | 'banthao';

/**
 * Cột phải của buồng lái, HAI CHẾ ĐỘ (spec §7.2).
 *
 *   chưa chọn chương → NGỮ CẢNH TRUYỆN: dải chương `●▶○` · nhân vật · tiền đề
 *   đã chọn chương   → CHI TIẾT CHƯƠNG: ba tab Khế ước / Kiểm định / Bản thảo
 *                      cộng một đường lui về chế độ trên
 *
 * Nội dung KHÔNG bị gate sau animation và tab không dùng transition ẩn/hiện:
 * panel bị treo transition trên tab ẩn sẽ làm mất trắng cả khối khi render
 * headless hoặc khi tab nền bị trình duyệt hoãn. Ở đây tab nào không được chọn
 * thì không render, tab được chọn hiện ngay.
 *
 * # Vì sao hai chế độ, không phải một cột thứ tư
 *
 * Ngữ cảnh truyện và chi tiết chương trả lời hai câu KHÁC NHAU nhưng không bao giờ cùng lúc:
 * người vận hành hoặc đang hỏi "cuốn này về cái gì, đang tới đâu", hoặc đang hỏi "chương này
 * ra sao". Mở thêm một cột cho câu thứ hai là lấy bề rộng của cột giữa — chỗ chữ đang chảy —
 * để hiện một thứ chỉ đọc lúc đứng lại.
 *
 * # Vì sao chế độ là STATE, không phải suy thẳng từ `chuongChon`
 *
 * `chuongChon` do URL giữ (`?ch=`), và đường lui không được xóa nó — tải lại trang phải về
 * đúng chương đang xem. Nên "quay lại danh sách" là một chế độ XEM, không phải một phép bỏ
 * chọn, và nó phải sống trong component.
 *
 * Cái bẫy của lựa chọn đó là ngõ cụt: nếu chế độ chỉ được đặt lại khi `chuongChon` ĐỔI, thì
 * bấm lại đúng chương đang chọn không đổi prop nào và nút trông bấm được mà không phản ứng.
 * Vì thế dải `●▶○` ở chế độ ngữ cảnh tự mở chi tiết trước rồi mới báo lên trên — xem `moChuong`.
 */
export function Inspector({
  snapshot,
  tacPham,
  chuongChon,
}: {
  snapshot: Snapshot | undefined;
  tacPham: string | undefined;
  chuongChon: number | undefined;
}) {
  const [tab, setTab] = useState<Tab>('kheuoc');
  /* Gạch chân TRƯỢT giữa ba tab. Ba nhãn tiếng Việt không bằng bề rộng nên phải đo vị trí
     thật, không tính theo chỉ số — xem lib/truot.ts. */
  const hopTab = useTruot<HTMLDivElement>('[aria-selected="true"]', 'ngang', tab);
  /**
   * `true` = người dùng đã bấm đường lui và đang xem ngữ cảnh truyện dù `?ch=` còn nguyên.
   * Đặt lại mỗi khi `chuongChon` đổi: chọn một chương khác ở cột giữa là một yêu cầu xem
   * chương đó, không phải một yêu cầu ở lại danh sách.
   */
  const [xemNguCanh, datXemNguCanh] = useState(false);
  useEffect(() => {
    datXemNguCanh(false);
  }, [chuongChon]);

  const sel = snapshot?.selected;
  const cheDoChuong = chuongChon !== undefined && !xemNguCanh;

  return (
    <aside className="insp" aria-label={CHU.cotPhaiVung}>
      {cheDoChuong ? (
        <>
          {/* Tiêu đề panel và thân panel phải nói CÙNG MỘT điều.
              Bản trước hiện "Chương / chưa đặt tiêu đề" ở tiêu đề trong khi thân nói
              "Chưa chọn chương" — và câu ở tiêu đề là câu sai: nó khẳng định có một
              chương đang mở, chỉ là chương đó chưa được đặt tên. Giờ hai chế độ tách hẳn
              nhau nên ca đó không dựng lại được: tiêu đề chương chỉ tồn tại khi có chương. */}
          <div className="ihead">
            <button type="button" className="ilui" onClick={() => datXemNguCanh(true)}>
              <span aria-hidden="true">← </span>
              {CHU.veDanhSachChuong}
            </button>
            <div className="no">{viTri(snapshot, chuongChon)}</div>
            <h2>
              {sel?.title ? sel.title : <span className="draft">{CHU.chuaDatTieuDe}</span>}
            </h2>
            <TrangThaiChuong snapshot={snapshot} chuong={chuongChon} />
          </div>

          {/* Tab chỉ TỒN TẠI khi có chương, không phải tồn tại rồi bị vô hiệu.
              Bản trước vẽ ba tab `disabled` ở ca chưa chọn chương, với lý do đúng — ba tab
              trông bấm được mà bấm nào cũng ra cùng một câu là một lời hứa hụt lặp ba lần.
              Hai chế độ đưa lý do đó tới tận cùng: ở chế độ ngữ cảnh KHÔNG có chương nào để
              ba tab nói về, nên chúng không có mặt. */}
          <div ref={hopTab} className="tabs" role="tablist" aria-label={CHU.cotPhaiVung}>
            <TabNut tab="kheuoc" hienTai={tab} onChon={setTab} nhan={CHU.tabKheUoc} />
            <TabNut tab="kiemdinh" hienTai={tab} onChon={setTab} nhan={CHU.tabKiemDinh} />
            <TabNut tab="banthao" hienTai={tab} onChon={setTab} nhan={CHU.tabBanThao} />
          </div>

          {tab === 'kheuoc' ? (
            <TabKheUoc contract={sel?.contract} sel={sel} />
          ) : tab === 'kiemdinh' ? (
            <TabKiemDinh review={sel?.review} />
          ) : (
            <TabBanThao tacPham={tacPham} chuong={chuongChon} excerpt={sel?.excerpt} />
          )}
        </>
      ) : (
        <NguCanhTruyen
          tacPham={tacPham}
          chuongChon={chuongChon}
          onVeChuong={() => datXemNguCanh(false)}
        />
      )}
    </aside>
  );
}

function TabNut({
  tab,
  hienTai,
  onChon,
  nhan,
}: {
  tab: Tab;
  hienTai: Tab;
  onChon: (t: Tab) => void;
  nhan: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={tab === hienTai}
      onClick={() => onChon(tab)}
    >
      {nhan}
    </button>
  );
}

/* ── chế độ ngữ cảnh truyện ───────────────────────────────────────────── */

/**
 * Chế độ mặc định của cột phải: cuốn này về cái gì, và đang tới đâu.
 *
 * Ba khối theo đúng thứ tự spec §7.2 — và thứ tự đó là thứ tự câu hỏi: "đang tới đâu" (dải
 * chương) đứng trước "ai" (nhân vật) đứng trước "về cái gì" (tiền đề), vì hai câu đầu đổi
 * theo từng lượt còn câu cuối đứng yên cả cuốn. Tiền đề gọn về hai mục đầu, phần còn lại mở
 * ra bằng một nút — nó dài nhất và được đọc ít nhất.
 *
 * Tiền đề và nhân vật đọc từ hai endpoint hồ sơ, và `useHoSo` chỉ nạp lại khi đổi tác phẩm —
 * chúng KHÔNG đổi theo từng sự kiện của dây chuyền, nên gộp vào nhịp làm mới 1,5s là nghiền
 * store để hiện lại đúng dữ liệu cũ.
 */
function NguCanhTruyen({
  tacPham,
  chuongChon,
  onVeChuong,
}: {
  tacPham: string | undefined;
  /** Chương vẫn đang chọn trên URL — có thì có đường quay lại chi tiết của nó. */
  chuongChon: number | undefined;
  onVeChuong: () => void;
}) {
  const danY = useHoSo(tacPham, layDanY);
  const nhanVat = useHoSo(tacPham, layNhanVat);

  return (
    <>
      <div className="ihead">
        {/* Đường lui KHÔNG được là đường cụt: `chuongChon` do URL giữ, nên bấm lại đúng chương
            ấy ở cột giữa không đổi prop nào và cột phải sẽ đứng yên. Nút này là đường về. */}
        {chuongChon !== undefined ? (
          <button type="button" className="ilui" onClick={onVeChuong}>
            {TD.xemLaiChuong(chuongChon)}
            <span aria-hidden="true"> →</span>
          </button>
        ) : null}
        <h2 className="chuachon">{CHU.nguCanhTruyen}</h2>
      </div>

      <div className="ibody">
        <section className="iKhoi">
          <h3>{CHU.nhanVat}</h3>
          {/* `loi` KHÔNG bị hạ xuống thành "chưa có dữ liệu": một lời gọi hỏng và một tác
              phẩm chưa dựng nền là hai chuyện, và chỉ một trong hai có cách sửa. */}
          {nhanVat.loi ? (
            <p className="loiDoc">{nhanVat.loi}</p>
          ) : nhanVat.du?.characters && nhanVat.du.characters.length > 0 ? (
            <ul className="nvtom">
              {nhanVat.du.characters.slice(0, 8).map((c) => (
                <NguoiTom key={c.name} c={c} />
              ))}
            </ul>
          ) : nhanVat.dangTai ? (
            <p className="trong nvtom">{CHU.dangTai}</p>
          ) : (
            <div className="nvtom">
              <MucRong mang={nhanVat.du?.characters ?? null} muc="nhân vật nào" />
            </div>
          )}
        </section>

        <section className="iKhoi">
          <h3>{CHU.tienDe}</h3>
          {danY.loi ? (
            <p className="loiDoc">{danY.loi}</p>
          ) : danY.dangTai ? (
            <p className="trong">{CHU.dangTai}</p>
          ) : (
            <TienDeTom raw={danY.du?.premise ?? ''} />
          )}
        </section>
      </div>
    </>
  );
}

function NguoiTom({ c }: { c: Character }) {
  return (
    <li>
      <span className="nvten">{c.name}</span>
      <span className={`hang h-${(c.tier ?? 'important').toLowerCase()}`}>
        {nhanHang(c.tier)}
      </span>
      {c.role ? <span className="nvvai">{c.role}</span> : null}
    </li>
  );
}

/**
 * Tiền đề rút gọn.
 *
 * Cùng phép tách đoạn với bề mặt Dàn ý, và cùng lý do: `premise.md` là markdown thô, nên
 * xuống dòng ĐƠN là định dạng của TỆP chứ không phải của văn — giữ nguyên nó ở cột 292px
 * cho ra một đoạn răng cưa. Chỉ dòng trống mới là ranh giới đoạn.
 *
 * Dùng `--ui` chứ không serif: đây là bản ghi của engine VỀ tác phẩm, viết cho người vận
 * hành — phép thử của `DESIGN.md` ("chữ này có nằm trong bộ truyện xuất bản không?") trả lời
 * là không.
 */
function TienDeTom({ raw }: { raw: string }) {
  const [moHet, datMoHet] = useState(false);
  /* Tiền đề là markdown: `# Tên truyện`, rồi từng mục `## Thể loại…` kèm thân. In thô thì
     panel thành một khối chữ rải dấu thăng. Tên truyện bỏ đi (đã ở rail và thanh trên);
     mỗi mục thành một nhãn nhỏ cộng đoạn thân. */
  const muc: { de?: string; than: string[] }[] = [];
  for (const dong of raw.split('\n')) {
    const t = dong.trim();
    if (!t) {
      muc.at(-1)?.than.push('');
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(t);
    if (h) {
      if (h[1] === '#') continue;
      muc.push({ de: h[2], than: [] });
      continue;
    }
    if (muc.length === 0) muc.push({ than: [] });
    muc.at(-1)!.than.push(t.replace(/^[-*+]\s+/, '· ').replace(/\*\*(.+?)\*\*/g, '$1'));
  }
  const coNoiDung = muc.some((m) => m.de || m.than.some(Boolean));
  if (!coNoiDung) return <p className="trong">{GIAI_THICH.chuaCoTienDe}</p>;
  const gon = !moHet && muc.length > GIOI_TIEN_DE;
  return (
    <div className={`tiende${moHet ? '' : ' gon'}`}>
      {(gon ? muc.slice(0, GIOI_TIEN_DE) : muc).map((m, i) => {
        const doan = m.than
          .join('\n')
          .split(/\n{2,}/)
          .map((d) => d.replace(/\s*\n\s*/g, ' ').trim())
          .filter(Boolean);
        return (
          <div className="tiendemuc" key={i}>
            {m.de ? <h4>{m.de}</h4> : null}
            {doan.map((d, j) => (
              <p className="tiendetom" key={j}>
                {d}
              </p>
            ))}
          </div>
        );
      })}
      {muc.length > GIOI_TIEN_DE ? (
        <button
          type="button"
          className="ilui ihetca"
          aria-expanded={moHet}
          onClick={() => datMoHet((v) => !v)}
        >
          {moHet ? TD.thuGonTienDe : TD.xemDayDu}
        </button>
      ) : null}
    </div>
  );
}

/** Tiền đề gọn hiện chừng này mục đầu. */
const GIOI_TIEN_DE = 2;

/** "Chương 47 · tập 3 · cung 2" — suy từ trục, không bịa khi chưa biết. */
function viTri(snapshot: Snapshot | undefined, chuong: number): string {
  const phan = [`${CHU.chuong} ${chuong}`];
  if (snapshot?.capabilities.layered_outline) {
    const tap = snapshot.timeline.volumes?.find(
      (v) => v.from && v.to && chuong >= v.from && chuong <= v.to,
    );
    if (tap) phan.push(`tập ${tap.index}`);
    const cung = snapshot.timeline.arcs?.find(
      (a) => a.from && a.to && chuong >= a.from && chuong <= a.to,
    );
    if (cung) phan.push(`hồi ${cung.index}`);
  }
  return phan.join(' · ');
}

function TrangThaiChuong({
  snapshot,
  chuong,
}: {
  snapshot: Snapshot | undefined;
  chuong: number;
}) {
  const row = snapshot?.chapters.find((r) => r.chapter === chuong);
  if (!row) return null;
  // Cùng một sự thật liveness với bảng chương và thanh transport — nếu ba chỗ
  // này suy khác nhau thì một màn hình lại nói ba điều, đúng lỗi đã sửa.
  const chay = mayDangChay(snapshot);
  return <TrangThai tt={trangThaiDong(row, chay)} dap={chay} />;
}

/* ── tab Khế ước ──────────────────────────────────────────────────────── */

function TabKheUoc({
  contract,
  sel,
}: {
  contract: Contract | undefined;
  sel: Selection | undefined;
}) {
  if (!contract) {
    return (
      <div className="ibody">
        <p className="trong">{GIAI_THICH.chuaCoKheUoc}</p>
        {sel?.words ? <SoTuDaViet words={sel.words} /> : null}
      </div>
    );
  }

  return (
    <div className="ibody">
      <h3>{CHU.yeuCauChuong}</h3>
      <dl className="kv">
        {contract.core_event ? (
          <>
            <dt title={CHU.sukienTrongTamDay}>{CHU.sukienTrongTam}</dt>
            <dd>{contract.core_event}</dd>
          </>
        ) : null}
        {contract.hook ? (
          <>
            <dt>{CHU.kieuMocCuoi}</dt>
            <dd>{contract.hook}</dd>
          </>
        ) : null}
        {sel?.words ? (
          <>
            <dt>{CHU.colSoTu}</dt>
            <dd className="m">{soTu(sel.words)}</dd>
          </>
        ) : null}
      </dl>

      {contract.scenes && contract.scenes.length > 0 ? (
        <>
          <h3>{CHU.canhTrongChuong}</h3>
          <ol className="canh">
            {contract.scenes.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ol>
        </>
      ) : null}
    </div>
  );
}

function SoTuDaViet({ words }: { words: number }) {
  return (
    <dl className="kv" style={{ marginTop: 14 }}>
      <dt>{CHU.colSoTu}</dt>
      <dd className="m">{soTu(words)}</dd>
    </dl>
  );
}

/* ── tab Kiểm định ────────────────────────────────────────────────────── */

/**
 * Kiểm định là hàng mảnh có kết luận kèm dẫn chứng, KHÔNG phải thẻ điểm.
 * Điểm số đứng sau kết luận và ở cỡ nhỏ hơn: kết luận là thứ người vận hành
 * cần, con số chỉ để so sánh giữa các lần chạy.
 *
 * Thân bản duyệt nằm ở `BanDuyet` vì khu Kiểm định vẽ cùng một thứ ở bề rộng
 * khác. Ở đây chỉ còn ca "chưa có bản duyệt" và cái vỏ `.ibody`.
 */
function TabKiemDinh({ review }: { review: Review | undefined }) {
  if (!review) {
    return (
      <div className="ibody">
        <p className="trong">{GIAI_THICH.chuaCoDuyet}</p>
      </div>
    );
  }

  return (
    <div className="ibody">
      <BanDuyet review={review} />
    </div>
  );
}

/* ── tab Bản thảo ─────────────────────────────────────────────────────── */

/**
 * Trích đoạn có sẵn trong snapshot; toàn văn phải gọi riêng
 * /api/books/{book}/chapters/{n}, nên chỉ gọi khi người dùng thật sự mở tab
 * này. Trích đoạn hiện ngay để không có khoảng trống chờ mạng.
 */
function TabBanThao({
  tacPham,
  chuong,
  excerpt,
}: {
  tacPham: string | undefined;
  chuong: number;
  excerpt: string | undefined;
}) {
  const [toanVan, setToanVan] = useState<ChapterDetail>();
  const [dangTai, setDangTai] = useState(false);
  const [loi, setLoi] = useState<string>();

  useEffect(() => {
    setToanVan(undefined);
    setLoi(undefined);
  }, [tacPham, chuong]);

  const doc = () => {
    if (!tacPham) return;
    setDangTai(true);
    setLoi(undefined);
    layChuong(tacPham, chuong)
      .then(setToanVan)
      .catch((e: unknown) => setLoi(e instanceof Error ? e.message : String(e)))
      .finally(() => setDangTai(false));
  };

  if (toanVan) {
    const doan = toanVan.text
      .split(/\n{2,}/)
      .map((d) => d.trim())
      .filter(Boolean);

    // Đã tải xong mà không có đoạn nào: GIỮ tiêu đề và GIỮ nút.
    //
    // Bản trước bỏ cả hai, và hệ quả đo được là một ngõ cụt: sau khi bấm, panel
    // trông y hệt lúc chưa bấm bao giờ — chỉ khác là nút không còn. Người vận
    // hành không có tín hiệu nào cho biết yêu cầu đã đi và đã về, và không bấm
    // lại được, vì `useEffect` ở trên chỉ reset theo `[tacPham, chuong]` nên
    // đường duy nhất là đổi tab rồi quay lại.
    //
    // Câu giải thích cũng phải khác câu lúc chưa bấm (`chuaCoBanThao`), nếu không
    // hai trạng thái khác nhau lại nói cùng một điều — chính cái làm ngõ cụt này
    // vô hình.
    if (doan.length === 0) {
      return (
        <div className="ibody">
          <h3>{CHU.trichDoan}</h3>
          <p className="trong">{GIAI_THICH.docVeRong}</p>
          <button type="button" className="docthem" onClick={doc} disabled={dangTai}>
            {dangTai ? CHU.dangDoc : CHU.docLai}
          </button>
        </div>
      );
    }

    return (
      <div className="banthao">
        {doan.map((d, i) => (
          // `mocua` là lớp đặt tay cho đúng một đoạn: bộ chọn vị trí từng khớp
          // nhiều phần tử và biến số liệu thành drop cap khổng lồ.
          <p key={i} className={i === 0 ? 'doan mocua' : 'doan'}>
            {d}
          </p>
        ))}
        {toanVan.words ? (
          <dl className="kv" style={{ marginTop: 16 }}>
            <dt>{CHU.colSoTu}</dt>
            <dd className="m">{soTu(toanVan.words)}</dd>
          </dl>
        ) : null}
      </div>
    );
  }

  return (
    <div className="ibody">
      <h3>{CHU.trichDoan}</h3>
      {excerpt ? (
        <p className="excerpt">{excerpt}</p>
      ) : (
        <p className="trong">{GIAI_THICH.chuaCoBanThao}</p>
      )}
      {loi ? <p className="trong">{loi}</p> : null}
      <button type="button" className="docthem" onClick={doc} disabled={dangTai}>
        {dangTai ? CHU.dangDoc : CHU.docToanVan}
      </button>
    </div>
  );
}
