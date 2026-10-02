'use client';

import { useEffect, useRef, useState } from 'react';

import { CHU, GIAI_THICH, TRANG_THAI_KHOI, TRANG_THAI_VACH } from '@/lib/nhan';
import {
  bienSanXuat,
  chuongTaiDiem,
  cuaSoTruc,
  doTruc,
  hoVach,
  mocThuocDai,
  nhanPhamVi,
  nhomVach,
  phamViGon,
  vachTrongCuaSo,
  vieccTonNgoaiCuaSo,
  viTriMoc,
  type CuaSoTruc,
} from '@/lib/truc';
import type { Capabilities, ChapterMark, LaneBlock, MarkState, Timeline } from '@/lib/types';

/**
 * Trục sản xuất ba lane: Tập → Cung → Chương.
 *
 * Sản xuất là cấp bậc, không phải danh sách — ba lane nằm trên cùng một trục
 * ngang, độ rộng khối tỉ lệ với phạm vi thật, nên nhìn vào thấy được "đang ở
 * đâu trong toàn bộ công trình".
 */
export function Truc({
  timeline,
  capabilities,
  chuongChon,
  onChonChuong,
  vuaChot,
}: {
  timeline: Timeline;
  capabilities: Capabilities;
  chuongChon: number | undefined;
  onChonChuong: (n: number) => void;
  /**
   * Họ 09 — chương vừa chuyển sang `done`.
   *
   * Nhận qua prop chứ KHÔNG tự gọi `useVuaChot(marks)` ở đây, dù `marks` đã có sẵn trong
   * tệp này. Lý do là họ 10: chip đếm ở rail và ô tiến độ ở thanh trên phải nhấp CÙNG nhịp
   * với vạch, mà hai bề mặt đó là anh em của buồng lái chứ không phải con. Gọi hook ở hai
   * chỗ là dựng hai bộ nhớ và hai đồng hồ cho cùng một sự kiện — và hai bản sao của một sự
   * thật thì có ngày lệch, đúng lớp lỗi mà `mayNaoDo` vừa phải gom lại.
   */
  vuaChot: ReadonlySet<number>;
}) {
  const marks = timeline.chapters ?? [];
  const tong = marks.length;

  // layered_outline === false → truyện ngắn/vừa, không có tập/cung. Ẩn hai lane
  // trên thay vì vẽ lane rỗng: lane rỗng trông như dữ liệu bị mất.
  const phanTang = capabilities.layered_outline;

  // Truyện phẳng chưa có chương nào: không vẽ gì. Câu "Chương này chưa có dữ liệu." của bản
  // trước đứng ngay dưới "Chưa có chương nào" của thẻ đang làm — hai câu cho một sự thật.
  if (tong === 0 && !phanTang) return null;

  return (
    <>
      <div className="lanes">
        {phanTang ? (
          <>
            <div className="lane-lbl" id="lane-tap">
              {CHU.tap}
            </div>
            <Lane blocks={timeline.volumes ?? []} tien="T" nhanLane="tập" />

            <div className="lane-lbl" id="lane-cung">
              {CHU.cung}
            </div>
            <Lane blocks={timeline.arcs ?? []} tien="H" nhanLane="hồi" />
          </>
        ) : null}

        {/* Nhãn lane chương neo lên ĐẦU ô lưới, không căn giữa như hai lane trên.
            Ô này cao hơn nhiều (vạch + thước + dòng nói về cửa sổ), nên căn giữa
            đẩy chữ "Chương" xuống ngang với dòng chú thích và nó trông như nhãn
            của dòng chú thích chứ không phải của lane. */}
        <div className="lane-lbl neo-dau">{CHU.chuong}</div>
        <LaneChuong
          marks={marks}
          chuongChon={chuongChon}
          onChonChuong={onChonChuong}
          vuaChot={vuaChot}
        />
      </div>

      <ChuGiai marks={marks} />
    </>
  );
}

function Lane({
  blocks,
  tien,
  nhanLane,
}: {
  blocks: LaneBlock[];
  tien: string;
  nhanLane: string;
}) {
  if (blocks.length === 0) {
    return (
      <div className="lane">
        <span className="blk planned" style={{ flex: '1 1 0' }}>
          <span className="txt">chưa có {nhanLane.toLowerCase()} nào được lên dàn ý</span>
        </span>
      </div>
    );
  }

  const daDo = doTruc(blocks);
  // Lane DÀY (nhiều khối hơn số nhãn đọc được ở bề rộng thường): khối đã xong chỉ còn màu,
  // nhãn giữ cho khối đang mở. Mười mấy nhãn "T1…" bị cắt nửa chữ còn khó đọc hơn không nhãn,
  // và chú giải đầy đủ của từng khối vẫn nằm trong `title`.
  const day = daDo.length > 12;

  return (
    <div className={`lane${day ? ' day' : ''}`} role="group" aria-label={`Trục ${nhanLane}`}>
      {daDo.map((b) => {
        const tt = TRANG_THAI_KHOI[b.state];
        const phamVi = nhanPhamVi(b);
        const soChuong = b.chuaBietPhamVi
          ? undefined
          : `${b.chapters} chương${b.estimated ? ' (dự kiến)' : ''}`;

        // Chú giải gộp mọi điều biết được về khối, kể cả điều KHÔNG biết.
        const chuGiai = [
          b.title,
          tt.nhan,
          phamVi,
          soChuong,
          b.chuaBietPhamVi ? GIAI_THICH.chuaBietPhamVi : undefined,
          b.estimated && !b.chuaBietPhamVi ? GIAI_THICH.soDuKien : undefined,
          b.final ? 'tập cuối' : undefined,
        ]
          .filter(Boolean)
          .join(' · ');

        return (
          <span
            key={`${tien}${b.index}`}
            className={`blk ${b.state}${b.chuaBietPhamVi ? ' chuabiet' : ''}`}
            // Trọng số, KHÔNG phải `chapters` trực tiếp: `chapters === 0` nghĩa
            // là chưa biết, nhân với 0 thì khối biến mất khỏi trục.
            // Bề rộng tối thiểu để ở CSS (--khoi-min) vì nó đổi theo điểm ngắt.
            style={{ flexGrow: b.trongSo, flexShrink: 1, flexBasis: 0 }}
            title={chuGiai}
          >
            <span className="ky" aria-hidden="true">
              {tt.ky}
            </span>
            <span className="idx">
              {tien}
              {b.index}
            </span>
            {/* Chỉ khối ĐANG MỞ mang phạm vi: nó là chỗ mắt cần biết "đang ở đâu". Khối đã
                xong hay chưa tới chỉ mang số hiệu — mười mấy khối hẹp mà khối nào cũng cố nhét
                thêm chữ thì chữ nào cũng bị cắt thành "x…". */}
            {b.state === 'running' ? (
              <span className="txt">· {phamViGon(b) ?? tt.nhan}</span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

/**
 * Lane chương: một vạch một chương, trong một CỬA SỔ quanh biên sản xuất.
 *
 * Vì sao có cửa sổ: xem `cuaSoTruc` trong lib/truc.ts. Tóm lại là ở 2/300 chương
 * xong, phần đã nghiệm thu chiếm 0,67% bề rộng lane — đúng tỉ lệ và không dùng
 * được, mà đó lại là tình trạng của phần lớn thời gian đầu một cuốn 300 chương.
 *
 * Cửa sổ đo từ bề rộng lane THẬT (ResizeObserver) chứ không cắm số chương cố
 * định, nên nó tự đúng ở 1440px và ở 400px.
 *
 * `role="img"` với `aria-label` tổng hợp: 300 phần tử rỗng là tiếng ồn cho trình
 * đọc màn hình, còn một câu tóm tắt thì dùng được. Bảng chương ngay dưới mới là
 * chỗ điều hướng bằng bàn phím.
 */
function LaneChuong({
  marks,
  chuongChon,
  onChonChuong,
  vuaChot,
}: {
  marks: ChapterMark[];
  chuongChon: number | undefined;
  onChonChuong: (n: number) => void;
  /** Họ 09 — chương vừa chuyển sang `done`. Xem `lib/chotChuong.ts`. */
  vuaChot: ReadonlySet<number>;
}) {
  const oLane = useRef<HTMLDivElement>(null);
  const [beRong, setBeRong] = useState(0);
  /** true = người vận hành đã tự chọn xem toàn trục, đừng thu phóng lại. */
  const [xemToanBo, setXemToanBo] = useState(false);

  // Đo bề rộng lane thật. `beRong = 0` cho tới khi đo được, và lúc đó
  // `cuaSoTruc` trả về toàn trục — nội dung hiện ngay, không chờ phép đo.
  useEffect(() => {
    const el = oLane.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((mucs) => {
      const w = mucs[0]?.contentRect.width ?? 0;
      // Làm tròn để một dao động dưới điểm ảnh không kéo cả trục vẽ lại.
      setBeRong(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const tong = marks.length;
  const bien = bienSanXuat(marks);
  const cs = xemToanBo
    ? { from: 1, to: tong, thuPhong: false }
    : cuaSoTruc(tong, bien, beRong);
  const trong = cs.thuPhong ? vachTrongCuaSo(marks, cs) : marks;
  const an = marks.length - trong.length;
  const ton = vieccTonNgoaiCuaSo(marks, cs);

  const ho = hoVach(trong.length);
  const nhan = tomTatTruc(trong.length, demTrangThai(trong), cs, tong);

  return (
    <div ref={oLane}>
      {/* Lane thưa: vẽ từng chương, có khoảng hở, đếm được bằng mắt.
          Lane dày: gộp dải để một dãy chương cùng trạng thái là một khối liền,
          không phải vạch sọc do làm mờ dưới điểm ảnh. */}
      {ho > 0 ? (
        <div className="chlane" role="img" aria-label={nhan} style={{ gap: `${ho}px` }}>
          {trong.map((m) => (
            <i
              key={m.chapter}
              className={`${m.state}${vuaChot.has(m.chapter) ? ' vuaChot' : ''}`}
              onClick={() => onChonChuong(m.chapter)}
              title={`chương ${m.chapter} · ${TRANG_THAI_VACH[m.state].nhan}`}
              style={{
                outline: m.chapter === chuongChon ? '1px solid var(--ink)' : undefined,
                outlineOffset: 1,
              }}
            />
          ))}
        </div>
      ) : (
        <div className="chlane" role="img" aria-label={nhan}>
          {/* Tập vừa chốt đi vào `nhomVach` chứ không chỉ vào `className`: hoạt ảnh họ 09
              đổ đầy cả phần tử, nên chạy nó trên một dải gộp 40 chương là nói "cả bốn mươi
              chương vừa chốt". Tách ra một dải một-chương giữ nguyên tổng trọng số nên
              không có gì xê dịch — xem `nhomVach` trong lib/truc.ts. */}
          {nhomVach(trong, vuaChot).map((d) => (
            <i
              key={d.from}
              className={`${d.state}${d.vuaChot ? ' vuaChot' : ''}`}
              style={{
                flexGrow: d.len,
                flexShrink: 1,
                flexBasis: 0,
                // Chương đang chọn nằm trong dải này: đánh dấu bằng vạch sáng để
                // thấy được vị trí trên một trục 300 chương.
                boxShadow:
                  chuongChon !== undefined && chuongChon >= d.from && chuongChon <= d.to
                    ? 'inset 0 0 0 1px var(--ink)'
                    : undefined,
              }}
              title={
                d.len === 1
                  ? `chương ${d.from} · ${TRANG_THAI_VACH[d.state].nhan}`
                  : `chương ${d.from}–${d.to} (${d.len}) · ${TRANG_THAI_VACH[d.state].nhan}`
              }
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                onChonChuong(chuongTaiDiem(d, (e.clientX - r.left) / r.width));
              }}
            />
          ))}
        </div>
      )}

      <Thuoc cs={cs} />

      <CuaSoNoi
        cs={cs}
        tong={tong}
        an={an}
        ton={ton}
        xemToanBo={xemToanBo}
        onDoi={() => setXemToanBo((v) => !v)}
      />
    </div>
  );
}

/**
 * Thước số chương.
 *
 * Mốc đặt theo TỈ LỆ vị trí thật, không phải chia đều ô flex. Bản trước dùng
 * `flex: 1 1 0` cho mỗi mốc, nên mốc thứ hai của bốn mốc nằm ở 37,5% bề rộng
 * trong khi chương của nó nằm ở 33,1% — một cái nhãn chỉ sai chỗ, tệ hơn không
 * có nhãn. Sai số đó là 40px trên một lane 810px.
 *
 * Mốc đầu và mốc cuối dùng LỚP ĐẶT TAY (`dau`/`cuoi`) chứ không dùng
 * `:first-child`/`:last-child`: cùng lý do drop cap không được bám vào bộ chọn
 * vị trí — bộ chọn vị trí khớp theo từng phần tử cha và sẽ trúng chỗ không ngờ
 * khi cấu trúc đổi.
 */
function Thuoc({ cs }: { cs: CuaSoTruc }) {
  const mocs = mocThuocDai(cs.from, cs.to);
  if (mocs.length === 0) return null;
  return (
    <div className="ruler" aria-hidden="true">
      {mocs.map((m, i) => (
        <span
          key={m}
          className={i === 0 ? 'dau' : i === mocs.length - 1 ? 'cuoi' : undefined}
          style={{ left: `${viTriMoc(m, cs.from, cs.to) * 100}%` }}
        >
          {m}
        </span>
      ))}
    </div>
  );
}

/**
 * Dòng nói ra cửa sổ đang che gì.
 *
 * Bắt buộc phải có: thu phóng là một phép lọc, và phép lọc im lặng ẩn một chương
 * chờ viết lại là đúng cái lỗi mà Rail và bộ chọn mức xem đã phải tránh. Khi
 * phần bị che còn việc tồn, dòng này đổi sang tông cần-chú-ý kèm ký hiệu — lúc
 * đó nó không còn là ghi chú mà là tin vận hành.
 */
function CuaSoNoi({
  cs,
  tong,
  an,
  ton,
  xemToanBo,
  onDoi,
}: {
  cs: CuaSoTruc;
  tong: number;
  an: number;
  ton: number;
  xemToanBo: boolean;
  onDoi: () => void;
}) {
  // Không thu phóng và cũng không phải do người dùng chọn: cửa sổ đúng bằng cả
  // trục, không có gì để nói.
  if (!cs.thuPhong && !xemToanBo) return null;

  if (!cs.thuPhong) {
    return (
      <p className="phamvihint">
        {GIAI_THICH.cuaSoDayDu}{' '}
        <button type="button" onClick={onDoi}>
          {CHU.vungDangLam}
        </button>
      </p>
    );
  }

  return (
    <p className={`phamvihint${ton > 0 ? ' con-ton' : ''}`} title={GIAI_THICH.cuaSoGiai}>
      {ton > 0 ? (
        <span className="ky" aria-hidden="true">
          ■
        </span>
      ) : null}
      <span>
        {CHU.chuong} {CHU.cuaSo(cs.from, cs.to, tong)}
      </span>
      {an > 0 ? (
        <span>
          · {CHU.ngoaiCuaSo(an)}
          {ton > 0 ? ` — ${CHU.conTonNgoaiCuaSo(ton)}` : ''}
        </span>
      ) : null}
      <button type="button" onClick={onDoi}>
        {CHU.hienToanBo(tong)}
      </button>
    </p>
  );
}

function demTrangThai(marks: Pick<ChapterMark, 'state'>[]): Record<MarkState, number> {
  const d: Record<MarkState, number> = {
    done: 0,
    running: 0,
    rewrite: 0,
    gate: 0,
    pending: 0,
  };
  for (const m of marks) d[m.state] += 1;
  return d;
}

/**
 * Câu tóm tắt cho trình đọc màn hình.
 *
 * Khi thu phóng, câu này phải nói rõ đang đọc ĐOẠN NÀO của cả trục: người dùng
 * trình đọc màn hình không thấy được thước số bên dưới.
 */
function tomTatTruc(
  hien: number,
  dem: Record<MarkState, number>,
  cs: CuaSoTruc,
  tong: number,
): string {
  const phan: string[] = cs.thuPhong
    ? [`chương ${cs.from}–${cs.to} trong ${tong} chương`]
    : [`${tong} chương`];
  for (const [ma, n] of Object.entries(dem) as [MarkState, number][]) {
    if (n > 0) phan.push(`${n} ${TRANG_THAI_VACH[ma].nhan}`);
  }
  return phan.join(', ');
}

/**
 * Chú giải chỉ liệt kê trạng thái CÓ MẶT trên trục. Chú giải đầy đủ cho một
 * tác phẩm không có chương nào bị trả về chỉ dạy người đọc một trạng thái họ
 * không cần tìm.
 */
function ChuGiai({ marks }: { marks: Pick<ChapterMark, 'state'>[] }) {
  const co = new Set(marks.map((m) => m.state));
  const thuTu: MarkState[] = ['done', 'running', 'rewrite', 'gate', 'pending'];
  const hien = thuTu.filter((s) => co.has(s));
  if (hien.length === 0) return null;

  return (
    <div className="keys">
      {hien.map((s) => {
        const tt = TRANG_THAI_VACH[s];
        return (
          <span key={s}>
            <b className={`swatch-${s}`} style={{ background: mauVach(s) }} />
            <span className="ky" aria-hidden="true">
              {tt.ky}
            </span>
            {tt.nhan}
          </span>
        );
      })}
    </div>
  );
}

/** Cùng công thức màu với `.chlane i` để chú giải không lệch khỏi trục. */
function mauVach(s: MarkState): string {
  switch (s) {
    case 'done':
      return 'color-mix(in oklch, var(--teal) 62%, var(--panel))';
    case 'running':
      return 'var(--gold-fill)';
    case 'rewrite':
      return 'color-mix(in oklch, var(--amber) 68%, var(--panel))';
    case 'gate':
      return 'var(--violet)';
    default:
      return 'var(--panel-2)';
  }
}
