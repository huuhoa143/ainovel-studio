'use client';

import { soTu } from '@/lib/dinhdang';
import type { Khu } from '@/lib/khu';
import { CHU, GIAI_THICH, giaiCongDoan, nhanVai } from '@/lib/nhan';
import type { Snapshot } from '@/lib/types';
import type { CongDoanSong } from '@/lib/useStudio';

import { BieuTuong } from './BieuTuong';

/**
 * Dải VIỆC TIẾP THEO — dòng đầu tiên của bề mặt mặc định.
 *
 * # Vì sao dải này tồn tại
 *
 * Người dùng mở studio và nói nguyên văn: "vào chẳng biết bắt đầu từ đâu… quá ngợp".
 * Bề mặt mặc định trả lời rất nhiều câu hỏi — trục sản xuất, bảng chương, nhật ký phán
 * quyết, dòng sự kiện — mà KHÔNG câu nào là "giờ tôi làm gì". Mười sáu mục trong rail đều
 * cùng sức nặng, nên câu trả lời đó phải do người dùng tự suy ra từ dữ liệu.
 *
 * Dải này là một câu trạng thái cộng nhiều nhất hai hành động. Nó không thêm dữ liệu mới:
 * mọi thứ trong đây đều đã có ở đâu đó trên trang. Cái nó thêm là THỨ TỰ ƯU TIÊN.
 *
 * # Vì sao hành động ở đây chỉ ĐIỀU HƯỚNG, không chạy engine
 *
 * Chạy tiếp là hành vi tiêu tiền, và thanh transport đã là chỗ bấm nó. Hai nút cùng gọi
 * `POST /run` thì trạng thái "đang gửi" của chúng không thấy nhau, nên bấm cả hai là hai
 * lượt chạy — tức tiền đôi vì một chi tiết giao diện. Lúc máy đang nghỉ, dải này CHỈ ĐƯỜNG
 * tới thanh dưới bằng chữ.
 *
 * # Vì sao "Đọc từ chương 1" chọn luôn chương chứ chỉ đổi khu
 *
 * `DocTruyen` với `chuongChon` rỗng hiện "chưa chọn chương" — tức một bề mặt đọc không có
 * gì để đọc. Đường cũ là ba bước: đổi khu, hiểu rằng danh sách bên trái bấm được, bấm một
 * dòng. Đây là đúng chỗ người dùng rơi ra, vì thành quả — thứ duy nhất họ thật sự muốn —
 * nằm sau ba bước không ai dẫn.
 *
 * Nên nút này mở chương bằng MỘT hành động (`docChuong`), không phải "chọn chương rồi đổi
 * khu". Bản đầu làm đúng kiểu ghép đó và URL mất `ch=`: React gộp hai lần đặt state nên
 * hành động thứ hai còn đọc ref của nhịp cũ. Chi tiết ở lib/useStudio.ts.
 */
export function ViecTiepTheo({
  snapshot,
  dangChay,
  song,
  onChonKhu,
  onDocChuong,
}: {
  snapshot: Snapshot;
  dangChay: boolean;
  /** Công đoạn suy từ dòng SSE — chỉ dùng khi máy đang chạy. */
  song: CongDoanSong | undefined;
  onChonKhu: (k: Khu) => void;
  /**
   * Mở một chương để đọc — MỘT hành động, không phải chọn chương rồi đổi khu.
   *
   * Ghép hai hành động ở đây làm URL mất `ch=` (xem `docChuong` trong lib/useStudio.ts).
   */
  onDocChuong: (n: number) => void;
}) {
  const b = snapshot.book;
  const xong = b.completed_chapters;
  const vietLai = snapshot.chapters.filter((r) => r.stage === 'rewrite').length;

  // Chương mới nhất CÓ BẢN THẢO, không phải chương có số lớn nhất: một chương đang soạn
  // chưa có tệp nào để đọc, nên mở nó ra là mở một khổ đọc trống.
  const chuongDoc = chuongDocDuoc(snapshot);

  const tt = trangThai(snapshot, dangChay);

  return (
    <section className={`vtt ${tt.mau}`} aria-label={CHU.vttVung}>
      <span className={`vttDot ${tt.mau}${dangChay ? ' dap' : ''}`} aria-hidden="true" />

      <div className="vttChu">
        <p className="vttCau">{tt.cau}</p>
        <p className="vttHint">{tt.hint}</p>
        {dangChay ? <DangLam snapshot={snapshot} song={song} /> : null}
      </div>

      <div className="vttNut">
        {/* Chương chờ viết lại đứng TRƯỚC nút đọc: nó là việc tồn, và một việc tồn bị
            đặt sau một lời mời đọc thì không còn là việc tồn nữa. */}
        {vietLai > 0 ? (
          <button
            type="button"
            className="vttPhu vttCanh"
            onClick={() => onChonKhu('hang-cho-viet-lai')}
          >
            <BieuTuong ten="vietLai" co={14} />
            {CHU.xemChoVietLai(vietLai)}
          </button>
        ) : null}

        {chuongDoc !== undefined ? (
          <button
            type="button"
            className="vttChinh"
            onClick={() => onDocChuong(chuongDoc.so)}
          >
            <BieuTuong ten="doc" co={14} />
            {chuongDoc.nhan}
          </button>
        ) : null}

        {/* Xuất bản chỉ hiện khi truyện đã xong: trước lúc đó nó xuất ra một tệp thiếu
            chương, và một nút mời làm việc đó là mời hiểu sai trạng thái. */}
        {b.phase === 'complete' && xong > 0 ? (
          <button
            type="button"
            className="vttPhu"
            onClick={() => onChonKhu('nhap-xuat')}
            title={GIAI_THICH.xuatBanGiaiThich}
          >
            {CHU.xuatBan}
          </button>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Dòng "đang làm gì" — ai, bước nào, chương nào — kèm đường tới dòng sự kiện.
 *
 * # Vì sao dòng này cần thiết dù transport đã có
 *
 * TUI gốc không có bề mặt nào cả: cột trái liệt kê vai đang chạy, cột giữa chảy sự kiện và
 * văn model đang sinh ra. Người dùng nhìn một chỗ là biết máy đang làm gì. Web xé việc đó
 * làm hai — trạng thái ở thanh dưới cùng, dòng sự kiện ở section thứ tư phải cuộn mới tới —
 * và người dùng nói nguyên văn: "không có sự kết nối và rời rạc".
 *
 * Dòng này đặt câu trả lời ngay cạnh câu trạng thái, và cho một đường đi tới dòng sự kiện
 * thay vì bắt tự tìm.
 *
 * # Vì sao dùng cùng một LUẬT với transport chứ không tự suy
 *
 * `transport.last_step` là bước VỪA XONG, không phải bước đang chạy — observer cố ý không
 * ghi sự kiện "bắt đầu" vào runtime queue. Suy khác transport một chút là hai chỗ trên cùng
 * một trang nói hai điều về cùng một engine, và đó là lớp lỗi tệ hơn im lặng.
 */
function DangLam({
  snapshot,
  song,
}: {
  snapshot: Snapshot;
  song: CongDoanSong | undefined;
}) {
  const t = snapshot.transport;
  const buoc = song?.buoc ?? t?.last_step;
  const vai = song?.vai ?? t?.agent;
  const dangBuoc = song?.dangChay ?? false;
  // Chương đang soạn lấy từ bảng chương, không từ `book.completed_chapters + 1`: bảng có lỗ
  // và chương đang soạn có thể là một chương bị trả về viết lại ở giữa cuốn.
  const soan = snapshot.chapters.find((r) => r.stage === 'drafting')?.chapter;

  if (!buoc && !vai && soan === undefined) return null;

  return (
    <p className="vttLive">
      {vai ? <b>{nhanVai(vai)}</b> : null}
      {buoc ? (
        <span className="b" title={giaiCongDoan(buoc) ?? undefined}>
          {buoc}
        </span>
      ) : null}
      <span className="tt">
        {dangBuoc ? CHU.buocDangChayNgan : CHU.congDoanVuaXong}
        {/* Số chương chỉ thêm khi tên bước CHƯA mang nó.
            ĐO ĐƯỢC trên cuốn đang chạy: engine phát `draft_chapter(chương 2)`, nên nối thêm
            " · chương 2" cho ra "draft_chapter(chương 2) vừa xong · chương 2" — cùng một số
            nói hai lần, và người đọc phải kiểm xem hai số đó có khác nhau không. */}
        {soan !== undefined && !buoc?.includes(String(soan))
          ? ` · ${CHU.chuong.toLowerCase()} ${soan}`
          : ''}
      </span>
      <button
        type="button"
        className="vttNeo"
        onClick={() =>
          document.getElementById('dong-su-kien')?.scrollIntoView({ block: 'start' })
        }
      >
        {CHU.xemDongSuKien}
      </button>
    </p>
  );
}

/**
 * Chương nào mở ra được, và nhãn nào nói đúng chương đó.
 *
 * Chỉ nhận `done` và `rewrite`: đó là hai công đoạn đã có tệp bản thảo trên đĩa. Chương
 * `drafting` thì Writer còn đang viết và `pending` thì chưa chạy — mở một trong hai ra là
 * mở khổ đọc rồi nhận "chưa có bản thảo", tức biến nút mời đọc thành cái bẫy. `DocTruyen`
 * cho bấm mọi hàng vì ở đó người dùng đang chọn có ý thức trong một danh sách có ký hiệu
 * công đoạn; ở đây thì máy chọn thay họ, nên nó phải chọn cái chắc chắn đọc được.
 *
 * Nhãn mang SỐ chương thật thay vì "chương đầu": danh sách chương có lỗ (chương 1–3 có thể
 * không có dấu vết sản xuất nào), nên "Đọc từ chương 1" trên một danh sách bắt đầu ở chương
 * 4 là một câu sai.
 */
function chuongDocDuoc(snap: Snapshot): { so: number; nhan: string } | undefined {
  const xong = snap.chapters.filter((r) => r.stage === 'done').map((r) => r.chapter);
  // Chương bị trả về viết lại vẫn có bản thảo để đọc — và khi CHỈ có loại đó thì đọc nó
  // là việc đúng: đó là chỗ chất lượng đang tuột.
  const traVe = snap.chapters.filter((r) => r.stage === 'rewrite').map((r) => r.chapter);
  const co = [...(xong.length > 0 ? xong : traVe)].sort((a, b) => a - b);

  // Lấy hai đầu rồi kiểm tường minh thay vì tin `co.length`: `noUncheckedIndexedAccess`
  // nói đúng — một phép kiểm độ dài KHÔNG chứng minh được phần tử tại một chỉ số có thật,
  // và đây đúng lớp lỗi đã làm sập bề mặt này một lần (kiểu khai `LaneBlock[]` cho một
  // trường server trả `null`, `tsc` xanh vì kiểu nói dối).
  const dau = co[0];
  const cuoi = co[co.length - 1];
  if (dau === undefined || cuoi === undefined) return undefined;

  // Truyện đã xong hoặc mới có một chương → mời đọc từ đầu. Đang viết dở → chương mới
  // nhất, vì đó là thứ vừa xuất hiện và là lý do họ mở trang lên. Studio không lưu "đã
  // đọc tới đâu", nên bịa ra một con dấu đọc là bịa dữ liệu.
  if (snap.book.phase === 'complete' || co.length === 1) {
    return {
      so: dau,
      nhan: dau === 1 ? CHU.docTuChuongDau : `${CHU.docBanThao} · ${CHU.chuong} ${dau}`,
    };
  }
  return { so: cuoi, nhan: CHU.docChuongMoiNhat };
}

/** Câu trạng thái + lời chỉ đường, suy từ dữ liệu chứ không từ một cờ duy nhất. */
function trangThai(
  snap: Snapshot,
  dangChay: boolean,
): { cau: string; hint: string; mau: string } {
  const b = snap.book;
  const xong = b.completed_chapters;

  if (dangChay) {
    if (xong === 0) {
      return {
        cau: CHU.ttDangDungNen,
        hint: GIAI_THICH.dangDungNenChoMotChut,
        mau: 'chay',
      };
    }
    return {
      cau: CHU.ttDangViet(xong, b.total_chapters),
      hint: GIAI_THICH.dangVietTuDiTiep,
      mau: 'chay',
    };
  }

  if (b.phase === 'complete') {
    return {
      cau: CHU.ttXong(xong, soTu(b.total_words) ?? '0'),
      hint: GIAI_THICH.xongCoTheXuat,
      mau: 'xong',
    };
  }

  if (xong === 0) {
    return { cau: CHU.ttChuaCoChuong, hint: GIAI_THICH.chuaChayLanNao, mau: 'nghi' };
  }

  return {
    cau: CHU.ttNghi(xong, b.total_chapters),
    hint: GIAI_THICH.chayTiepOThanhDuoi,
    mau: 'nghi',
  };
}
