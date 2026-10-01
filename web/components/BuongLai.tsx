'use client';

import { useState } from 'react';

import { BangChuong, GhiChuChiPhi } from '@/components/BangChuong';
import { MucXem } from '@/components/MucXem';
import { DongSuKien, NhatKy } from '@/components/NhatKy';
import { OCanThiep } from '@/components/OCanThiep';
import { Truc } from '@/components/Truc';
import { TD } from '@/lib/chu/tien-do';
import { useVuaCoTin } from '@/lib/dauDoi';
import { so } from '@/lib/dinhdang';
import type { Khu } from '@/lib/khu';
import { CHU, GIAI_THICH, nhanPhamViXem, nhanPhase, DH } from '@/lib/nhan';
import {
  type MucXem as Muc,
  type PhamVi,
  locHang,
  phamViCua,
  soHangAn,
  vieccTonBiAn,
} from '@/lib/phamVi';
import { mayDangChay } from '@/lib/song';
import type { ChapterRow, Snapshot } from '@/lib/types';
import type { CongDoanSong } from '@/lib/useStudio';
import type { BoDemVan } from '@/lib/vanSong';

import { CuaNghiemThu } from './CuaNghiemThu';
import { DaiTrangThai } from './DaiTrangThai';
import { PhienNay, TheDangLam } from './TheDangLam';
import { VanSong } from './VanSong';
import { ViecTiepTheo } from './ViecTiepTheo';

/**
 * BUỒNG LÁI — bề mặt `?khu=dong-san-xuat`, tên hiển thị "Tiến độ".
 *
 * # Vì sao ĐỔI dải chứ không hiện cả hai
 *
 * Lúc máy nghỉ KHÔNG CÓ GÌ đang chảy để xem, và câu người dùng mang theo lúc đó là "giờ tôi
 * làm gì" — đúng câu `ViecTiepTheo` trả lời. Lúc máy chạy thì ngược lại: câu là "nó đang làm
 * gì", và một dải "việc tiếp theo" lúc đó là mời người dùng bấm một nút thứ hai trong khi một
 * lượt đang tiêu tiền.
 *
 * Hai nút cùng gọi `POST /run` không thấy trạng thái khóa-lúc-đang-gửi của nhau, nên bấm cả
 * hai là hai lượt chạy — tiền đôi vì một chi tiết giao diện. Đó là lý do `ViecTiepTheo` chỉ
 * điều hướng chứ không chạy engine, và là lý do nó biến mất hẳn khi máy đang chạy.
 *
 * # Bố cục: một thẻ điểm nhấn, rồi các thẻ bằng chứng
 *
 * Bản trước là một khung đứng yên chia bốn ô bằng ba thanh kéo. Nó giải đúng bài toán chiều
 * cao, nhưng mọi ô cùng sức nặng nên mắt không biết bắt đầu từ đâu, và ô rỗng vẫn giữ nguyên
 * diện tích của nó. Bản này đi theo mẫu `.impeccable/mocks/huong2.png`:
 *
 *   ┌──────────────────────────────────────┬───────────────┐
 *   │ ĐANG LÀM — trạng thái · chương ·     │ Phiên này     │   ← điểm nhấn
 *   │ năm bước · trục toàn truyện          │ (khóa–giá trị)│
 *   ├──────────────────────────────────────┴───────────────┤
 *   │ Văn đang viết — khối serif khi có chữ, một dòng khi chưa │
 *   ├──────────────────────────┬───────────────────────────┤
 *   │ Chương gần đây           │ Diễn biến                 │   ← bằng chứng
 *   ├──────────────────────────┴───────────────────────────┤
 *   │ Nhật ký quyết định                                   │
 *   └──────────────────────────────────────────────────────┘
 *     Góp ý — ghim đáy, không cuộn đi mất
 *
 * Trang cuộn được; chỉ ô góp ý ghim đáy. Mỗi thẻ có trần chiều cao riêng và tự cuộn bên
 * trong, nên không thẻ nào đẩy được thẻ khác ra khỏi tầm mắt — và thẻ rỗng thu về đúng chiều
 * cao câu nói của nó thay vì giữ một khoảng trắng lớn.
 *
 * Thứ tự DOM là thứ tự đọc: cửa duyệt (việc PHẢI làm) → cảnh báo → thẻ đang làm → bằng chứng.
 * "Dây chuyền đang chờ BẠN" đứng trước "dây chuyền đang làm gì".
 */
export function BuongLai({
  snapshot,
  tacPham,
  choGhi,
  chuongChon,
  onChonChuong,
  onChonKhu,
  onDocChuong,
  onDoi,
  suKien,
  song,
  vanSong,
  dangChay,
  vuaChot,
}: {
  snapshot: Snapshot;
  tacPham: string | undefined;
  /** undefined = chưa biết (đang hỏi `/api/config`) — xem `useMay`. Dải quyết định đọc nó. */
  choGhi: boolean | undefined;
  chuongChon: number | undefined;
  onChonChuong: (n: number) => void;
  onChonKhu: (k: Khu) => void;
  onDocChuong: (n: number) => void;
  /**
   * Gọi sau mỗi lệnh ghi để snapshot được nạp lại. Hai người đọc: dải quyết định của cửa
   * nghiệm thu, và ô can thiệp ở hàng cuối.
   *
   * Với dải quyết định, hệ quả nếu thiếu là tiền: `Cho đi tiếp` mở đúng cái cửa mà dải đang
   * vẽ, nên không nạp lại thì dải amber ở lại cho một cửa đã mở và cú bấm thứ hai cấp phép
   * thêm một chương nữa.
   *
   * Với ô can thiệp, hệ quả là im lặng. Điều khoản cũ nói ô này KHÔNG cần nạp lại vì "can
   * thiệp xếp một ý kiến vào hàng chờ mà không đổi trạng thái cửa nào" — đúng về CỬA và sai
   * về màn hình: câu vừa gửi đi vào `snapshot.pending_steer`, tức ô "việc tồn" của dải trạng
   * thái. Xem chú thích của `onDoi` trong `OCanThiep.tsx` cho phép đo đầy đủ.
   *
   * Người gọi phải rót `lamMoi` chứ không `taiLai` — `taiLai` xóa trắng `vanSong` và `suKien`,
   * tức xóa đúng bằng chứng mà cả hai nút này được bấm để phản ứng lại.
   */
  onDoi: () => void;
  suKien: Parameters<typeof DongSuKien>[0]['suKien'];
  /**
   * Công đoạn suy từ dòng SSE. Thẻ "đang làm" đọc nó để biết bước NÀO đang chạy — thứ
   * `transport.last_step` không biết (nó chỉ biết bước vừa xong). `ViecTiepTheo` cũng nhận
   * nó, dù nhánh dùng nó (`DangLam`) chỉ vẽ khi máy chạy, tức đúng ca dải đó không hiện.
   */
  song: CongDoanSong | undefined;
  /** Chữ model đang sinh ra. Đường riêng, không đi qua `suKien` — xem lib/dongSuKien.ts. */
  vanSong: BoDemVan;
  dangChay: boolean;
  /** Họ 09 — chỉ đi thẳng xuống `Truc`; buồng lái không đọc nó. Xem `lib/chotChuong.ts`. */
  vuaChot: ReadonlySet<number>;
}) {
  const canhBao = snapshot.warnings ?? [];

  /**
   * Bốn cờ "thẻ này đang có tin", bật một chấm vàng cạnh tiêu đề thẻ.
   *
   * Mỗi thẻ đọc một NGUỒN KHÁC nhau, và đó là cả điểm của cụm này: một cờ chung suy từ
   * `dangChay` sẽ cho bốn thẻ cùng nhấp suốt lúc engine bật, tức nói đúng một điều mà thanh
   * dưới đã nói rồi. Cái người vận hành cần biết là thẻ NÀO vừa động.
   *
   *   · văn sống  — `vanSong` là object mới ở mỗi mẩu chữ, nên chính nó là tín hiệu.
   *   · sự kiện   — `seq` của mục MỚI NHẤT, không phải `suKien.length`: danh sách bị kẹp ở
   *                 `GIU_SU_KIEN = 40`, nên khi đã đầy thì độ dài đứng im mãi mãi.
   *   · chương    — `vuaChot` của họ 09, không phải `snapshot.chapters` (mảng đó được thay
   *                 nguyên cụm mỗi 1,5s dù không ô nào đổi — nhịp NẠP, không phải tin).
   *   · quyết định — chữ ký hai đầu cộng độ dài, vì hợp đồng không hứa thứ tự.
   */
  const dsPhanQuyet = snapshot.decisions ?? [];
  const oSongVanSong = useVuaCoTin(vanSong);
  const oSongSuKien = useVuaCoTin(suKien[0]?.seq ?? 0);
  const oSongChuong = vuaChot.size > 0;
  const oSongNhatKy = useVuaCoTin(
    `${dsPhanQuyet.length}·${dsPhanQuyet[0]?.id ?? ''}·${dsPhanQuyet.at(-1)?.id ?? ''}`,
  );

  // Mặc định "Tập" như bản mockup. `layered_outline === false` thì không có
  // tập/cung nào để lọc, và mức người dùng chọn có thể mất phạm vi khi engine
  // sang tập mới — cả hai ca đều rơi về "Chương", tức không lọc gì.
  const [mucMuon, setMucMuon] = useState<Muc>('tap');
  const phanTang = snapshot.capabilities.layered_outline;
  const pvMuon = phamViCua(snapshot.timeline, mucMuon);
  const muc: Muc = !phanTang || pvMuon.khongRo ? 'chuong' : mucMuon;
  const pv = phamViCua(snapshot.timeline, muc);

  const hang = locHang(snapshot.chapters, pv);
  const an = soHangAn(snapshot.chapters, pv);
  const ton = vieccTonBiAn(snapshot.chapters, pv);
  const [moHet, datMoHet] = useState(false);
  const bang = bangGon(hang, chuongChon, moHet);

  return (
    <main className="canvas buonglai" id="dong-san-xuat">
      <div className="head">
        <h1>{DH.tienDo}</h1>
        <span className="sub">{motTa(snapshot)}</span>
        {phanTang ? (
          <MucXem timeline={snapshot.timeline} hienTai={muc} onChon={setMucMuon} />
        ) : null}
      </div>

      <div className="tdCuon">
        <div className="tdTrang">
          {/* Cửa duyệt đứng TRƯỚC mọi thứ: "dây chuyền đang chờ BẠN" là một việc phải làm.
              Nó tự trả `null` khi không có cửa nào chờ, nên ở đây không có điều kiện nào:
              luật "cửa nào là cửa đang chờ" chỉ có MỘT chỗ giữ (`lib/nghiemThu.ts`). */}
          <CuaNghiemThu
            advance={snapshot.advance}
            runtime={snapshot.runtime}
            tacPham={tacPham}
            choGhi={choGhi}
            dangChay={dangChay}
            onDoi={onDoi}
          />

          {/* Dữ liệu lệch là tin vận hành, không phải chi tiết nội bộ — hiện ra, không nuốt.
              Gọn về một dòng có số đếm; danh sách mở ra khi cần, vì một tệp bản thảo thiếu
              không được phép đẩy cả màn xuống. */}
          {canhBao.length > 0 ? (
            <details className="canhbao" aria-label={GIAI_THICH.duLieuLech}>
              <summary>
                <span className="ky" aria-hidden="true">
                  ■
                </span>
                <span className="cbCau">{TD.canhBao(canhBao.length)}</span>
                <span className="cbMo">{TD.xemCanhBao}</span>
              </summary>
              <ul>
                {canhBao.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </details>
          ) : null}

          <div className="tdHangDau">
            <TheDangLam
              snapshot={snapshot}
              song={song}
              dangChay={dangChay}
              viec={
                dangChay ? null : (
                  <ViecTiepTheo
                    snapshot={snapshot}
                    dangChay={dangChay}
                    song={song}
                    onChonKhu={onChonKhu}
                    onDocChuong={onDocChuong}
                  />
                )
              }
              truc={
                <Truc
                  timeline={snapshot.timeline}
                  capabilities={snapshot.capabilities}
                  chuongChon={chuongChon}
                  onChonChuong={onChonChuong}
                  vuaChot={vuaChot}
                />
              }
              chiTiet={dangChay ? <DaiTrangThai snapshot={snapshot} /> : null}
            />
            <PhienNay snapshot={snapshot} />
          </div>

          {/* Văn đang viết: khối đọc được khi có chữ, MỘT dòng gợi ý khi máy chạy mà chưa có
              chữ. Lúc nghỉ và bộ đệm rỗng thì không vẽ gì: thẻ đang làm đã nói "bấm Viết tiếp",
              một dải gạch đứt nhắc lại câu đó chỉ là thêm một thứ để đọc. */}
          {dangChay || vanSong.luot.length > 0 ? (
          <div
            className={`tdVan${vanSong.luot.length === 0 ? ' rong' : ''}${
              oSongVanSong ? ' dangSong' : ''
            }`}
          >
            <VanSong boDem={vanSong} dangChay={dangChay} />
          </div>
          ) : null}

          <div className="tdLuoi">
            {/* Chương mới nhất đứng trên: ở một cuốn 700 chương, thứ người dùng cần là mấy
                chương vừa xong, không phải chương 1. Chương đang viết và cần viết lại thì
                LUÔN hiện dù nằm ở đâu — việc tồn không được rơi khỏi tầm mắt vì một phép cắt. */}
            <section className={`the tdO tdO-chuong${oSongChuong ? ' dangSong' : ''}`}>
              <div className="tdODau">
                <h2>{tieuDeBang(pv)}</h2>
                <span className="dem">{CHU.soChuongTrongBang(hang.length)}</span>
              </div>
              <div className="tdOThan">
                <BangChuong
                  rows={bang.hien}
                  capabilities={snapshot.capabilities}
                  chuongChon={chuongChon}
                  onChon={onChonChuong}
                  dangChay={mayDangChay(snapshot)}
                  khiTrong={
                    snapshot.chapters.length > 0 ? GIAI_THICH.bangTrongPhamVi : undefined
                  }
                />
                {bang.conAn > 0 || moHet ? (
                  <button
                    type="button"
                    className="tdThem"
                    aria-expanded={moHet}
                    onClick={() => datMoHet((v) => !v)}
                  >
                    {moHet ? TD.thuGon : TD.hienThem(bang.conAn)}
                  </button>
                ) : null}
                <NgoaiPhamVi pv={pv} an={an} ton={ton} onBoLoc={() => setMucMuon('chuong')} />
                <GhiChuChiPhi capabilities={snapshot.capabilities} />
              </div>
            </section>

            {/* `id` để dải việc tiếp theo cuộn tới được — xem `DangLam` trong ViecTiepTheo.tsx. */}
            <section
              className={`the tdO tdO-sukien${oSongSuKien ? ' dangSong' : ''}`}
              id="dong-su-kien"
            >
              <div className="tdODau">
                <h2>{DH.dongSuKien}</h2>
                <span className="dem">{CHU.soDongSuKien(suKien.length)}</span>
              </div>
              <div className="tdOThan">
                <DongSuKien suKien={suKien} dangChay={dangChay} />
              </div>
            </section>
          </div>

          <section
            className={`the tdO tdO-nhatky${oSongNhatKy ? ' dangSong' : ''}`}
            id="nhat-ky-phan-quyet"
          >
            <div className="tdODau">
              <h2>
                {DH.nhatKy} <span className="phu">{DH.nhatKyPhu}</span>
              </h2>
              <span className="dem">{CHU.soPhanQuyet(dsPhanQuyet.length)}</span>
            </div>
            <div className="tdOThan">
              <NhatKy decisions={snapshot.decisions} />
            </div>
          </section>
        </div>
      </div>

      {/* Ô góp ý ghim đáy, đúng chỗ dòng nhập của TUI. Nó KHÔNG cuộn đi mất: góp ý là việc
          người vận hành làm giữa lúc đang đọc chữ chảy. */}
      <div className="blcanthiep">
        <h2 className="td-an">{DH.gopY}</h2>
        <OCanThiep
          capabilities={snapshot.capabilities}
          tacPham={tacPham}
          dangChay={dangChay}
          onDoi={onDoi}
        />
      </div>
    </main>
  );
}

/** Bảng chương mặc định hiện chừng này hàng mới nhất. */
const GIOI_BANG = 8;

/**
 * Hàng nào của bảng được hiện: mới nhất trước, gọn về `GIOI_BANG` hàng — cộng mọi chương
 * đang viết, cần viết lại, hoặc đang được chọn, dù chúng nằm ở đâu. Cắt im lặng một chương
 * chờ viết lại là đúng lỗi mà Rail và bộ chọn mức xem đã phải tránh.
 */
function bangGon(
  hang: ChapterRow[],
  chuongChon: number | undefined,
  moHet: boolean,
): { hien: ChapterRow[]; conAn: number } {
  const moi = [...hang].sort((a, b) => b.chapter - a.chapter);
  // Thừa một hai hàng thì hiện luôn: một nút "hiện thêm 1 chương" tốn đúng chỗ của hàng đó.
  if (moHet || moi.length <= GIOI_BANG + 2) return { hien: moi, conAn: 0 };
  const hien = moi.filter(
    (r, i) =>
      i < GIOI_BANG ||
      r.stage === 'rewrite' ||
      r.stage === 'drafting' ||
      r.chapter === chuongChon,
  );
  return { hien, conAn: moi.length - hien.length };
}

/** "Trấn Yêu Ký · đang viết · 300 chương · 6 tập" — chỉ nói điều biết được. */
function motTa(snap: Snapshot): string {
  const b = snap.book;
  const phan: string[] = [b.name || b.id, nhanPhase(b.phase)];
  if (b.total_chapters > 0) phan.push(`${so(b.total_chapters)} chương`);
  // `?? []` chứ không tin `layered_outline`: hai trường đến từ hai nhánh khác nhau phía
  // server, nên một cuốn có cờ true mà volumes null là ca hợp lệ (dàn ý phân tầng đã có
  // khung mà chưa mở tập nào).
  const soTap = snap.timeline.volumes?.length ?? 0;
  if (snap.capabilities.layered_outline && soTap > 0) {
    phan.push(`${soTap} tập`);
  }
  if (b.total_words > 0) phan.push(`${so(b.total_words)} từ`);
  return phan.join(' · ');
}

/**
 * Tiêu đề bảng chương — nói đúng phần ĐANG HIỆN, không phải phần mong là đang
 * hiện.
 *
 * Bản trước suy tiêu đề từ khối đang chạy ("Chương trong cung 2 · tập 3") trong
 * khi bảng vẫn liệt kê mọi chương có dấu vết sản xuất trên toàn tác phẩm. Với
 * fixture, cung 2 là chương 45–50 mà bảng chứa cả chương 41 và 44 — tiêu đề
 * khẳng định một phạm vi mà dữ liệu không có. Giờ tiêu đề đi theo phép lọc thật.
 */
function tieuDeBang(pv: PhamVi): string {
  if (pv.index === undefined || pv.from === undefined || pv.to === undefined) {
    return DH.chuongGanDay;
  }
  return DH.chuongTrong(nhanPhamViXem(pv.muc, pv.index), pv.from, pv.to);
}

/**
 * Dòng nói ra những gì phép lọc đã ẩn.
 *
 * Bắt buộc phải có: ẩn im lặng một chương chờ viết lại là đúng cái lỗi mà Rail
 * đã tránh — người vận hành bỏ qua một hàng chờ thật vì bề mặt không nói. Số
 * việc tồn được tách riêng vì nó là loại tin khác: chương đã nghiệm thu ở tập
 * trước nằm ngoài phạm vi là chuyện bình thường, chương chờ viết lại thì không.
 */
function NgoaiPhamVi({
  pv,
  an,
  ton,
  onBoLoc,
}: {
  pv: PhamVi;
  an: number;
  ton: number;
  onBoLoc: () => void;
}) {
  if (an <= 0 || pv.index === undefined) return null;
  return (
    <p className={`phamvihint${ton > 0 ? ' con-ton' : ''}`}>
      {ton > 0 ? (
        <span className="ky" aria-hidden="true">
          ■
        </span>
      ) : null}
      {CHU.ngoaiPhamVi(an, nhanPhamViXem(pv.muc, pv.index))}
      {ton > 0 ? ` — ${CHU.conTonNgoaiPhamVi(ton)}` : ''}.{' '}
      <button type="button" onClick={onBoLoc}>
        {CHU.hienTatCa}
      </button>
    </p>
  );
}
