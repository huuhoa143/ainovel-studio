'use client';

import { useState } from 'react';

import { CHU, GIAI_THICH } from '@/lib/nhan';

import { BuongLai } from '@/components/BuongLai';
import { CaiDat } from '@/components/CaiDat';
import { ChiPhiXuong } from '@/components/ChiPhiXuong';
import { CauHinhXuong } from '@/components/CauHinhXuong';
import { CungDung } from '@/components/CungDung';
import { DieuKhien } from '@/components/DieuKhien';
import { HoiChan } from '@/components/HoiChan';
import { NhapXuat } from '@/components/NhapXuat';
import { TacPhamMoi } from '@/components/TacPhamMoi';
import { ChiPhi } from '@/components/ChiPhi';
import { DanY } from '@/components/DanY';
import { DocTruyen } from '@/components/DocTruyen';
import { HangChoVietLai } from '@/components/HangChoVietLai';
import { Inspector } from '@/components/Inspector';
import { KiemDinh } from '@/components/KiemDinh';
import { NhanVat } from '@/components/NhanVat';
import type { DongSuKien } from '@/components/NhatKy';
import { Rail } from '@/components/Rail';
import { LuatTheGioi, PhucBut } from '@/components/TheGioi';
import { ToSanXuat } from '@/components/ToSanXuat';
import { Transport } from '@/components/Transport';
import { VanPhong } from '@/components/VanPhong';
import { Xuong } from '@/components/Xuong';
import { DangTai, KhongTaiDuoc, XuongTrong } from '@/components/XuongTrong';
import { useVuaChot } from '@/lib/chotChuong';
import { dungInspector, laKhuMucMay, type Khu as KhuMa } from '@/lib/khu';
import { manTheoTacPham } from '@/lib/man';
import { coViecCanBan, useTongXuong, type TaiTongXuong } from '@/lib/tongXuong';
import { viSaoDung } from '@/lib/loiLlm';
import { trangThaiCua } from '@/lib/nghiemThu';
import { mayDangChay } from '@/lib/song';
import { useMay } from '@/lib/useMay';
import type { CongDoanSong } from '@/lib/useStudio';
import type { Book, ChapterMark, Snapshot } from '@/lib/types';
import type { BoDemVan } from '@/lib/vanSong';
import { useStudio } from '@/lib/useStudio';

/** Danh sách rỗng ỔN ĐỊNH: `?? []` mới mỗi lần render sẽ làm effect của hook chạy vô ích. */
const KHONG_CO_VACH: ChapterMark[] = [];

export default function Trang() {
  const s = useStudio();
  const may = useMay();

  /**
   * Họ 09 (chương chốt) + họ 10 (đồng thanh) — gọi ĐÚNG MỘT LẦN, ở đây.
   *
   * Ở tầng này chứ không trong `Truc` (nơi đã có sẵn `marks`) vì họ 10 đòi ba bề mặt nhấp
   * CÙNG một nhịp: vạch trên lane, chip đếm ở rail, và tiến độ ở thanh trên. Rail và thanh
   * trên là anh em của buồng lái, nên `Trang` là tổ tiên chung gần nhất — và cũng là chỗ
   * duy nhất giữ được "một sự kiện, một dấu". Gọi hook ở mỗi bề mặt là dựng ba bộ nhớ và ba
   * đồng hồ cho cùng một sự kiện; chúng sẽ lệch nhịp, mà cùng nhịp mới là cả điểm của họ 10.
   */
  const chot = useVuaChot(s.snapshot?.timeline.chapters ?? KHONG_CO_VACH);

  /**
   * Dấu cho họ 10, gộp CẢ "vừa xảy ra" lẫn "còn đang nhấp" vào một con số.
   *
   * `0` khi không nhấp, `chot.dau` khi đang nhấp. Hai bề mặt kia dùng nó làm `key`, nên:
   *   · mỗi lần chốt, số đổi → React dựng lại phần tử → hoạt ảnh chạy;
   *   · khi tập được dọn, số về 0 → dựng lại lần nữa, lần này KHÔNG lớp nào → sạch.
   *
   * ĐO ĐƯỢC trên app thật vì sao cần vế thứ hai: bản trước chỉ truyền `chot.dau`, và vì đó
   * là bộ đếm tăng dần nên lớp `dongThanh` DÍNH LẠI vĩnh viễn sau lần chốt đầu tiên (đo ở
   * t=3.200ms: vạch trên lane đã sạch, hai chỗ kia vẫn còn lớp). Hôm nay nó vô hại — không
   * gì dựng lại phần tử đó — nhưng nó là một quả mìn hẹn giờ: ngày ai đó thêm một `key` hay
   * một nhánh render mới, hai chỗ ấy nhấp lên vì một sự kiện đã qua từ lâu.
   *
   * Và nó phá đúng lời hứa của họ 10 — "cùng màu, cùng lúc, CÙNG THỜI LƯỢNG". Ba chỗ phải
   * cùng sống cùng tắt, nên cả ba đọc từ một nguồn duy nhất là `chot.vua`.
   */
  const dauDongThanh = chot.vua.size > 0 ? chot.dau : 0;

  // Chốt bản nháp từ cùng dựng: chuyển sang khu Tác phẩm mới với bản nháp đã có. Không tự
  // tạo luôn — người dùng còn phải đặt tên thư mục, và một cú tạo ngầm sẽ tiêu tiền mà họ
  // chưa xác nhận.
  const [nhapTuCungDung, datNhapTuCungDung] = useState('');
  const chotCungDung = (banNhap: string) => {
    datNhapTuCungDung(banNhap);
    s.chonKhu('tac-pham-moi');
  };

  const sachDangXem = s.workshop?.books.find((b) => b.id === s.tacPham);
  const xuongTrong = s.workshop && s.workshop.books.length === 0;

  /**
   * Tạo xong thì ĐI THẲNG tới bề mặt sản xuất.
   *
   * `chonTacPham` giữ nguyên khu đang xem (`khuRef.current`), nên bản trước đứng lại ở
   * chính biểu mẫu Tác phẩm mới — với một biểu mẫu trắng. Người dùng nói nguyên văn: "tôi
   * bấm bắt đầu viết xong chả biết làm gì nữa luôn". Đúng: dấu hiệu duy nhất cho biết đã
   * có gì xảy ra là tên tác phẩm trên thanh trên đổi.
   *
   * Đây là chỗ TUI gốc không thể sai được, vì nó không có điều hướng: xong phần cài đặt là
   * bạn đang ở màn hình sống, thấy dòng sự kiện chạy. Web có điều hướng nên nó phải TỰ đi.
   */
  const xongTaoSach = s.moTacPhamVuaTao;

  // Cột inspector chỉ tồn tại ở khu dùng nó. Các bề mặt khác tự mang chi tiết
  // của mình, nên giữ lại 292px trống ở đó là lấy mất 1/5 bề rộng để hiện một
  // panel không nói gì.
  const coInsp = !!s.snapshot && !xuongTrong && dungInspector(s.khu);

  /**
   * Màn này có nói về một cuốn không — điều kiện chung của thanh trên và transport.
   *
   * Một hàm, ba chỗ đọc. Viết `s.man === 'xuong-san-xuat'` ở từng chỗ là ba bản của một luật,
   * và lúc chúng lệch thì transport hiện trên một canvas nói về cả xưởng — đúng lỗi mà cả
   * bản này tồn tại để sửa.
   */
  const theoTacPham = manTheoTacPham(s.man);

  /**
   * Tổng cả xưởng: nguồn của dải việc-cần-bạn và của màn Cài đặt chung.
   *
   * Nạp ở tầng `Trang` chứ không trong từng bề mặt vì hai người đọc nó ở hai màn khác nhau,
   * và cái thứ hai là RAIL — dấu việc tồn trên hàng "Quản lý" phải đúng kể cả khi người dùng
   * đang đứng trong xưởng sản xuất và bảng Quản lý không được vẽ. Gọi trong `Xuong.tsx` thì
   * dấu đó chỉ sống khi bảng đang mở, tức đúng lúc không ai cần nó.
   */
  const tong = useTongXuong(s.workshop?.books.length ?? 0);
  const canBan = tong.du ? coViecCanBan(tong.du) : false;

  // Thanh trên và transport luôn hiện, kể cả khi canvas chưa có gì: chúng là
  // câu trả lời cho "dây chuyền còn sống không", câu hỏi đầu tiên khi mở studio.
  return (
    /* `khongTrans` bỏ hẳn HÀNG transport khỏi lưới, không chỉ bỏ nội dung của nó: hàng đó là
       `minmax(30px, auto)`, nên không có lớp này thì hai màn kia mang một dải trống 30px ở
       đáy — một vùng giao diện không nói gì, đúng thứ mà `khung.rong` đã tồn tại để tránh ở
       cột inspector. */
    <div className={`khung${coInsp ? '' : ' rong'}${theoTacPham ? '' : ' khongTrans'}`}>
      {/* Dải báo bản dựng đứng TRÊN CÙNG, ngoài mọi khu: nó nói về chính cái tab, không về
          tác phẩm nào — và nó phải thấy được dù người dùng đang ở bề mặt nào. */}
      {s.banDungDaDoi ? (
        <div className="daiBanDung" role="status">
          <span className="ky" aria-hidden="true">
            ■
          </span>
          <span>{GIAI_THICH.banDungDaDoi}</span>
          <button type="button" onClick={() => window.location.reload()}>
            {CHU.taiLaiNgay}
          </button>
        </div>
      ) : null}


      {/* Chưa có tệp cấu hình thì dẫn THẲNG vào cài đặt, không hiện studio trống.
          Một studio không có khóa API không làm được gì cả, nên hiện nó ra rồi để người
          dùng tự đi tìm chỗ nhập khóa là bắt họ đoán. Đây là trạng thái "rỗng lần đầu"
          của brief thiết kế, và nó đứng TRƯỚC mọi nhánh khác vì nó chặn tất cả. */
      may.canCaiDat ? (
        <CauHinhXuong lanDau onDoiCauHinh={may.hoiLai} />
      ) : xuongTrong && may.choGhi ? (
        // Xưởng rỗng + ghi được → dẫn thẳng vào tạo tác phẩm. Hiện một trang trống kèm
        // một lệnh CLI là câu trả lời của bản chỉ-đọc; giờ studio tạo được nên để người
        // dùng tự đi tìm chỗ tạo là bắt họ đoán.
        <TacPhamMoi onXong={xongTaoSach} />
      ) : xuongTrong ? (
        <XuongTrong root={s.workshop?.root} />
      ) : (
        <>
          <Rail
            snapshot={s.snapshot}
            hoSo={s.hoSo}
            khu={s.khu}
            man={s.man}
            onChonKhu={s.chonKhu}
            onChonMan={s.chonMan}
            canBan={canBan}
            tenCuonNgan={sachDangXem?.name || sachDangXem?.id}
            dauChot={dauDongThanh}
            sach={s.workshop?.books ?? []}
            tacPham={s.tacPham}
            ketNoi={s.ketNoi}
            choDuyet={
              s.snapshot ? trangThaiCua(s.snapshot.advance, s.snapshot.runtime, s.snapshot.stop).dangCho : false
            }
            onMoTacPham={s.moTacPhamTai}
          />
          {/* Màn chung (tủ truyện, cài đặt, viết mới) không cần dữ liệu của cuốn đang mở,
              nên chúng hiện ngay thay vì chờ nạp toàn bộ một cuốn dài. */}
          {s.snapshot || laKhuMucMay(s.khu) ? (
          <Khu
            khu={s.khu}
            onXoaXong={s.taiLai}
            snapshot={s.snapshot}
            // `?? []` ở đây KHÔNG biến "chưa tải" thành "xưởng rỗng": nhánh này chỉ chạy khi
            // `s.snapshot` đã có, mà snapshot chỉ có sau khi `tacPham` được chọn, mà `tacPham`
            // chỉ được chọn từ chính `workshop`. Ba nhánh `!s.snapshot` ở trên đã đỡ ca chưa
            // tải, và xưởng rỗng thật thì `xuongTrong` đã bắt trước cả ba.
            sach={s.workshop?.books ?? []}
            tong={tong}
            tacPham={s.tacPham}
            // Hai prop dưới đây chỉ có một người đọc: dải quyết định của cửa nghiệm thu, ở hai
            // bề mặt. `may.choGhi` chứ không phải `snapshot.capabilities.steer` — hai giá trị
            // gần nhau nhưng không bằng nhau, và cái khác biệt là cái đáng giữ: `steer` là một
            // `bool` trong JSON (`serve.go:309` đặt nó bằng `choGhi && may != nil`), nên nó
            // KHÔNG BAO GIỜ nói được "chưa biết". `choGhi === undefined` là "đang hỏi
            // /api/config", và dải có một bài kiểm riêng cho đúng ca đó: khóa nút mà KHÔNG nói
            // "studio chỉ đọc". Dùng `steer` là lặng lẽ giết nhánh ấy.
            choGhi={may.choGhi}
            chuongChon={s.chuongChon}
            onChonChuong={s.chonChuong}
            onChonKhu={s.chonKhu}
            onDocChuong={s.docChuong}
            onChonTacPham={s.chonTacPham}
            onMoTacPham={s.moTacPhamTai}
            onXongTaoSach={xongTaoSach}
            onChotCungDung={chotCungDung}
            onDoiCauHinh={may.hoiLai}
            // `lamMoi`, KHÔNG `taiLai`. Cả hai đọc lại snapshot, và đó là chỗ dễ nhầm nhất
            // trong sợi dây này: `taiLai` bơm `lanTai` nên nó cũng đóng/mở lại dòng sự kiện,
            // xóa danh sách sự kiện và xóa trắng bộ đệm văn sống. Ở đây người dùng vừa bấm
            // `Cho đi tiếp` hoặc `Trả chương về viết lại` — hai lệnh mà bằng chứng để quyết
            // định chính là đoạn chữ đang nằm trong bộ đệm đó.
            onDoi={s.lamMoi}
            nhapSan={nhapTuCungDung}
            suKien={s.suKien}
            song={s.song}
            vanSong={s.vanSong}
            dangChay={mayDangChay(s.snapshot)}
            vuaChot={chot.vua}
          />
          ) : s.loi ? (
            <KhongTaiDuoc loi={s.loi} onThuLai={s.taiLai} />
          ) : (
            <DangTai />
          )}
          {coInsp ? (
            <Inspector
              snapshot={s.snapshot}
              tacPham={s.tacPham}
              chuongChon={s.chuongChon}
            />
          ) : null}
        </>
      )}

      {/* Modal chặn: engine đang ĐỨNG chờ trả lời. Đặt ở tầng Trang chứ không trong một khu
          vì nó phải hiện bất kể người dùng đang xem bề mặt nào — một dây chuyền đứng chờ
          không được ẩn sau một lựa chọn điều hướng. */}
      <HoiChan tacPham={s.tacPham} choGhi={may.choGhi} />

      {/* Transport CHỈ ở màn xưởng sản xuất.
          Nó nói năng suất · giá thành · thời lượng của MỘT cuốn, và nó mang nút `▶ Chạy` —
          một nút tiêu tiền thật. Đặt nó dưới màn Quản lý (canvas liệt kê mọi cuốn) hay dưới
          Cài đặt chung (canvas sửa cấu hình toàn máy) là dán một điều khiển cấp-tác-phẩm vào
          đáy một bề mặt cấp-xưởng. Đo được ở bản trước: đứng ở bảng ba cuốn, đáy màn hình
          vẫn mời `▶ Chạy` cho `tran-yeu-ky` — một cuốn người dùng không chọn và không nhìn.

          Đây cũng chính là luật đã cấm nút chạy trong bảng Xưởng ("một đường tiêu tiền duy
          nhất"), chỉ là trước đây nó bị lách qua đường transport. */}
      {theoTacPham ? (
      <Transport
        transport={s.snapshot?.transport}
        song={s.song}
        suKien={s.suKien}
        trong={xuongTrong}
        // Truyền hai trường THÔ, không truyền một boolean đã suy sẵn: transport cần phân
        // biệt năm trạng thái engine, mà một boolean chỉ chở được hai. Phép chọn giữa
        // `runtime` và `activity` nằm ở `mayNaoDo` — cùng hàm mà `mayDangChay` đang dùng,
        // nên hai bề mặt không thể lệch nhau nữa.
        runtime={s.snapshot?.runtime}
        hoatDong={s.snapshot?.book.activity ?? 'idle'}
        agents={s.snapshot?.agents}
        dungVi={viSaoDung(s.snapshot)}
      >
        {/* Điều khiển sống TRONG transport: đó là chỗ trả lời "dây chuyền còn sống không",
            nên nút bấm phải ở cùng chỗ với câu trả lời. Đặt nó trong một bề mặt riêng sẽ
            buộc người vận hành đổi khu để dừng một dây chuyền họ đang nhìn thấy đang chạy. */}
        <DieuKhien
          snapshot={s.snapshot}
          tacPham={s.tacPham}
          choGhi={may.choGhi}
          dangChay={s.snapshot ? mayDangChay(s.snapshot) : false}
          // Cùng luật với dải quyết định ở trên, và ở đây cái giá còn lộ hơn: `Dừng` là nút
          // người ta bấm SAU KHI đọc chữ đang chảy và thấy máy đi sai hướng. Nối `taiLai` vào
          // đây là để cú bấm ấy vứt luôn bằng chứng vừa đọc.
          onDoi={s.lamMoi}
        />
      </Transport>
      ) : null}
    </div>
  );
}

/**
 * Bề mặt của khu đang mở.
 *
 * Chỉ khu được chọn được render — không phải ẩn bằng CSS. Panel bị treo
 * transition trên tab ẩn từng làm mất trắng cả khối khi render headless, và một
 * bề mặt bị ẩn vẫn giữ nguyên hiệu ứng cuộn của nó.
 *
 * Export để bài kiểm gọi thẳng được LUẬT ĐỊNH TUYẾN mà không phải dựng cả `Trang` (tức cả
 * `useStudio`, tức cả mạng). `Trang` vẫn là cửa duy nhất của ứng dụng; đây là cửa của bộ kiểm.
 */
export function Khu({
  khu,
  snapshot,
  sach,
  tong,
  tacPham,
  choGhi,
  chuongChon,
  onChonChuong,
  onChonKhu,
  onDocChuong,
  onChonTacPham,
  onMoTacPham,
  onXoaXong,
  onXongTaoSach,
  onChotCungDung,
  onDoiCauHinh,
  onDoi,
  nhapSan,
  suKien,
  song,
  vanSong,
  dangChay,
  vuaChot,
}: {
  khu: KhuMa;
  /** `undefined` chỉ ở các khu mức máy — xem chỗ gọi. */
  snapshot: Snapshot | undefined;
  /** Mọi cuốn trong xưởng — chỉ khu `xuong` đọc, vì chỉ nó là bề mặt của CẢ xưởng. */
  sach: Book[];
  /**
   * Tờ tổng của cả xưởng. Ba bề mặt đọc nó (Xưởng, Chi phí toàn xưởng, và rail qua `canBan`),
   * nên nó được nạp MỘT lần ở `Trang` rồi truyền xuống — xem chú thích ở chỗ gọi.
   */
  tong: TaiTongXuong;
  tacPham: string | undefined;
  /**
   * Máy có ghi được không — CHỈ dải quyết định của cửa nghiệm thu đọc, ở hai bề mặt.
   *
   * `undefined` = chưa biết (đang hỏi `/api/config`), và nó phải đi tới được: dải khóa nút ở ca
   * đó nhưng KHÔNG nói "studio chỉ đọc", vì đó là một khẳng định chưa ai đo được và nó sẽ hiện
   * ra ở MỌI lần mở trang.
   */
  choGhi: boolean | undefined;
  chuongChon: number | undefined;
  onChonChuong: (n: number) => void;
  onChonKhu: (k: KhuMa) => void;
  onDocChuong: (n: number) => void;
  onChonTacPham: (id: string) => void;
  /** Mở một cuốn từ bảng Xưởng ở một bề mặt cụ thể — xem `moTacPhamTai` trong useStudio. */
  onMoTacPham: (id: string, khu: KhuMa, chuong?: number) => void;
  /** Nạp lại cả xưởng sau khi xóa một tác phẩm. */
  onXoaXong: () => void;
  /** Tạo tác phẩm xong: đổi tác phẩm VÀ đổi khu — xem lý do ở `xongTaoSach`. */
  onXongTaoSach: (id: string) => void;
  onChotCungDung: (banNhap: string) => void;
  /** Hỏi lại `/api/config` sau khi người dùng lưu thay đổi ở bề mặt Cấu hình máy. */
  onDoiCauHinh: () => void;
  /** Nạp lại snapshot sau một lệnh của dải quyết định — `useStudio.taiLai`. */
  onDoi: () => void;
  nhapSan: string;
  suKien: Parameters<typeof DongSuKien>[0]['suKien'];
  song: CongDoanSong | undefined;
  vanSong: BoDemVan;
  dangChay: boolean;
  /** Họ 09 — chỉ buồng lái đọc; các khu khác không có lane chương. */
  vuaChot: ReadonlySet<number>;
}) {
  if (!snapshot) {
    switch (khu) {
      case 'xuong':
        return (
          <Xuong
            sach={sach}
            tong={tong}
            onChonKhu={onChonKhu}
            onMoTacPham={onMoTacPham}
            onXoaXong={onXoaXong}
          />
        );
      case 'chi-phi-xuong':
        return <ChiPhiXuong tong={tong} />;
      case 'cau-hinh':
        return <CauHinhXuong onDoiCauHinh={onDoiCauHinh} />;
      case 'tac-pham-moi':
        return <TacPhamMoi onXong={onXongTaoSach} nhapSan={nhapSan} onChonKhu={onChonKhu} />;
      case 'cung-dung':
        return (
          <CungDung
            cheDo={tacPham ? 'giai-doan' : 'mo-sach'}
            tacPham={tacPham}
            onXong={onChotCungDung}
          />
        );
      default:
        return <DangTai />;
    }
  }
  switch (khu) {
    // Xưởng là bề mặt của CẢ xưởng, nên nó cố ý KHÔNG nhận `tacPham`: nội dung của nó không
    // đổi theo cuốn đang mở (`laKhuMucMay('xuong')`). Truyền vào sẽ mời người sau dùng nó rồi
    // biến một bảng liệt kê mọi cuốn thành nửa-theo-tác-phẩm.
    case 'xuong':
      return (
        <Xuong
          sach={sach}
          tong={tong}
          onChonKhu={onChonKhu}
          onMoTacPham={onMoTacPham}
          onXoaXong={onXoaXong}
        />
      );
    case 'chi-phi-xuong':
      return <ChiPhiXuong tong={tong} />;
    case 'ban-thao':
      return (
        <DocTruyen
          onChonKhu={onChonKhu}
          snapshot={snapshot}
          tacPham={tacPham}
          chuongChon={chuongChon}
          onChonChuong={onChonChuong}
        />
      );
    // Kiểm định nhận `tacPham`/`choGhi`/`dangChay`/`onDoi` CHỈ cho dải quyết định — bề mặt này
    // vẫn không tự gọi thêm mạng nào (xem chú thích đầu `KiemDinh.tsx`). Bốn prop cho một dải
    // vì nút quyết định phải ở cùng chỗ với bằng chứng (spec §7.3).
    case 'kiem-dinh':
      return (
        <KiemDinh
          onChonKhu={onChonKhu}
          snapshot={snapshot}
          tacPham={tacPham}
          choGhi={choGhi}
          dangChay={dangChay}
          chuongChon={chuongChon}
          onChonChuong={onChonChuong}
          onDoi={onDoi}
        />
      );
    case 'hang-cho-viet-lai':
      return (
        <HangChoVietLai
          onChonKhu={onChonKhu}
          snapshot={snapshot}
          chuongChon={chuongChon}
          onChonChuong={onChonChuong}
        />
      );
    case 'to-san-xuat':
      return <ToSanXuat snapshot={snapshot} tacPham={tacPham} />;
    case 'van-phong':
      return <VanPhong tacPham={tacPham} />;
    // Chi phí là bề mặt duy nhất trong ba bề mặt mới cần `snapshot`, và nó cần
    // đúng hai thứ: `capabilities.per_chapter_cost` để nói ra chi phí theo chương
    // không có nguồn, và `transport.cost_per_chapter` — con số CÓ nguồn thật —
    // để đặt cạnh cửa sổ của nó (tổng chia số chương đã nghiệm thu).
    case 'chi-phi':
      return <ChiPhi tacPham={tacPham} snapshot={snapshot} />;
    case 'phien-chay':
      return <CaiDat tacPham={tacPham} />;
    // Khu mức MÁY: cố ý KHÔNG nhận `tacPham`. Truyền vào sẽ mời người sau dùng nó rồi
    // biến một bề mặt toàn cục thành nửa-theo-tác-phẩm.
    case 'nhap-xuat':
      return <NhapXuat tacPham={tacPham} soChuongXong={snapshot?.book.completed_chapters} />;
    case 'cau-hinh':
      return <CauHinhXuong onDoiCauHinh={onDoiCauHinh} />;
    case 'tac-pham-moi':
      return <TacPhamMoi onXong={onXongTaoSach} nhapSan={nhapSan} onChonKhu={onChonKhu} />;
    // Cùng dựng giai đoạn cần tác phẩm; cùng dựng mở sách thì không. Một khu cho cả hai,
    // chế độ suy từ việc có tác phẩm đang xem hay không.
    case 'cung-dung':
      return (
        <CungDung
          cheDo={tacPham ? 'giai-doan' : 'mo-sach'}
          tacPham={tacPham}
          onXong={onChotCungDung}
        />
      );
    case 'dan-y':
      return <DanY snapshot={snapshot} tacPham={tacPham} />;
    case 'nhan-vat':
      return <NhanVat tacPham={tacPham} />;
    case 'luat-the-gioi':
      return <LuatTheGioi tacPham={tacPham} />;
    case 'phuc-but':
      return <PhucBut tacPham={tacPham} />;
    // Buồng lái là bề mặt MẶC ĐỊNH, và nó nằm ở `default` chứ không ở một `case` riêng cho
    // `'dong-san-xuat'`: `KHU_MAC_DINH` là khu được chọn khi URL không nói gì và khi giá trị
    // trong URL không đọc được, nên một khu mới thêm vào mà quên viết `case` phải rơi về đây
    // chứ không rơi vào một màn hình trắng.
    default:
      return (
        <BuongLai
          snapshot={snapshot}
          tacPham={tacPham}
          choGhi={choGhi}
          chuongChon={chuongChon}
          onChonChuong={onChonChuong}
          onChonKhu={onChonKhu}
          onDocChuong={onDocChuong}
          onDoi={onDoi}
          suKien={suKien}
          song={song}
          vanSong={vanSong}
          dangChay={dangChay}
          vuaChot={vuaChot}
        />
      );
  }
}
