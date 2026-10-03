'use client';

/**
 * Toàn bộ trạng thái của bề mặt studio nằm trong một hook.
 *
 * Không dùng thư viện quản lý state: bề mặt này có đúng một nguồn dữ liệu
 * (store, qua HTTP) và một dòng cập nhật (SSE). Thêm một store phía client chỉ
 * tạo ra bản sao thứ hai của sự thật — đúng thứ PRODUCT.md cấm ("studio không
 * nhân bản logic engine").
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  DongGia,
  LA_MOCK,
  LOAI_SU_KIEN_UI,
  LOAI_VAN_SONG,
  duongSuKien,
  layHoSo,
  laySnapshot,
  layWorkshop,
} from './api';
import { nhanSuKienUi } from './dongSuKien';
import { nhanVai } from './nhan';
import { KHU_MAC_DINH, chuanKhu, laKhu, type Khu } from './khu';
import { KHU_DAU_MAN, manCuaKhu, type Man } from './man';
import type { Profile, Snapshot, StreamEvent, Workshop } from './types';
import { BO_DEM_RONG, moLuot, nhanVach, themChu, type BoDemVan } from './vanSong';
import { cachMoTacPham, khuDap } from './xuong';

/** Số sự kiện giữ lại trong dòng. Nhật ký là cửa sổ, không phải log đầy đủ. */
const GIU_SU_KIEN = 40;

/**
 * Sự kiện đến thì bảng chương và trục cũng cũ theo, nhưng gọi lại snapshot mỗi
 * sự kiện sẽ nghiền store khi engine đang phát liên tục. Gộp lại một nhịp.
 */
const NHIP_LAM_MOI_MS = 1500;
/** Nhịp hỏi lại khi engine đang ở trạng thái chuyển tiếp (`pausing`). */
const NHIP_CHUYEN_TIEP_MS = 1000;

/**
 * Nhịp làm mới NỀN — cho những gì dòng sự kiện không với tới.
 *
 * # Vì sao phải có nó
 *
 * Dòng sự kiện chỉ mở khi có một tác phẩm ĐANG MỞ (`if (!tacPham || !snapshot) return`).
 * Hệ quả đo được: đứng ở màn Quản lý, tạo thêm một cuốn dưới thư mục gốc, thì server trả về
 * 4 cuốn còn bảng vẫn hiện 3 — và nó hiện 3 mãi mãi, vì không có gì gọi lại. Người dùng chỉ
 * còn cách F5.
 *
 * Và ngay cả khi có engine mở, dòng sự kiện chỉ chảy khi CÓ SỰ KIỆN. Một engine đang nghỉ
 * không phát gì, nên một cuốn bị đổi từ CLI hay từ một tab khác vẫn không thấy.
 *
 * # Vì sao 8 giây, và vì sao chỉ khi tab đang hiện
 *
 * `/api/workshop` quét meta của từng cuốn, nên nó không miễn phí. 8 giây đủ nhanh để không
 * ai kịp nghĩ tới F5, và đủ chậm để một xưởng vài chục cuốn không bị nghiền. Tab ẩn thì
 * dừng hẳn: làm mới một bề mặt không ai nhìn là tiêu I/O đổi lấy không gì.
 */
const NHIP_NEN_MS = 8000;

/**
 * 'khong' = KHÔNG có dòng nào để mở, khác hẳn 'dang-mo'.
 *
 * Xưởng rỗng thì useStudio không bao giờ mở EventSource (cần có tác phẩm), nên
 * để huy hiệu ở 'dang-mo' là một câu vĩnh viễn sai: nó nói máy đang kết nối
 * trong khi không có gì để kết nối tới.
 */
export type TinhTrangKetNoi = 'dang-mo' | 'song' | 'mat' | 'khong';

/**
 * Công đoạn suy từ dòng sự kiện.
 *
 * `dangChay` KHÔNG phải mặc định true. observer chỉ ghi vào runtime queue các
 * sự kiện đã kết thúc (xem internal/host/observer.go:191 — sự kiện "bắt đầu"
 * cố ý không ghi để replay không bị nhân đôi), nên phần lớn sự kiện đến là
 * bước VỪA XONG chứ không phải bước đang chạy. Chỉ khi payload có ID và
 * FinishedAt còn là zero value của Go thì bước đó thật sự đang chạy.
 */
export interface CongDoanSong {
  buoc: string;
  vai?: string;
  loai?: string;
  dangChay: boolean;
  luc: string;
  loi: boolean;
}

interface PayloadEvent {
  ID?: string;
  Category?: string;
  Agent?: string;
  Summary?: string;
  Level?: string;
  Failed?: boolean;
  FinishedAt?: string;
}

/** Zero value của time.Time khi marshal sang JSON. */
const THOI_GIAN_RONG = '0001-01-01';

function docPayload(p: unknown): PayloadEvent {
  if (!p || typeof p !== 'object') return {};
  return p as PayloadEvent;
}

export function congDoanTu(ev: StreamEvent): CongDoanSong | undefined {
  const buoc = ev.summary?.trim();
  if (!buoc) return undefined;

  const pl = docPayload(ev.payload);
  const chuaXong = !!pl.FinishedAt && pl.FinishedAt.startsWith(THOI_GIAN_RONG);
  const loai = ev.category || pl.Category || undefined;
  const laGiaoViec = loai?.toUpperCase() === 'DISPATCH';
  // Sự kiện giao việc ĐÃ XONG ("architect_short (…)" kèm FinishedAt) nói rằng một vai vừa làm
  // xong — không phải việc đang diễn ra. Lấy nó làm "đang làm" là đúng lỗi đo được trên truyện
  // thật: Người viết đã chạy mà thẻ vẫn ghi "Kiến trúc sư đang làm". Bỏ qua, giữ việc trước.
  if (laGiaoViec && !!pl.ID && !chuaXong) return undefined;
  // Vai của một lần giao việc là BÊN NHẬN (tên đứng đầu dòng tóm tắt), không phải `agent` —
  // trường đó là `engine` ở sự kiện bắt đầu, tức kênh chứ không phải người làm.
  const nhan = laGiaoViec ? /^\s*([a-z][\w-]*)/i.exec(buoc)?.[1] : undefined;
  const vaiNhan = nhan && nhanVai(nhan) !== nhan ? nhan : undefined;
  return {
    buoc,
    vai: vaiNhan || ev.agent || pl.Agent || undefined,
    loai,
    dangChay: !!pl.ID && chuaXong,
    luc: ev.time,
    loi: pl.Failed === true || pl.Level === 'error' || ev.category === 'ERROR',
  };
}

export interface Studio {
  workshop: Workshop | undefined;
  tacPham: string | undefined;
  snapshot: Snapshot | undefined;
  hoSo: Profile | undefined;
  chuongChon: number | undefined;
  khu: Khu;
  /**
   * Màn đang mở — SUY từ `khu`, không phải một state thứ hai.
   *
   * Hai state cho một vị trí thì có ngày lệch, và lúc lệch thì rail sáng một màn còn canvas
   * vẽ màn khác. `khu` là thứ duy nhất nằm trên URL, nên nó là bản gốc; màn là một phép đọc
   * của nó.
   */
  man: Man;
  song: CongDoanSong | undefined;
  suKien: StreamEvent[];
  /** Chữ model đang sinh ra. Đường riêng, không đi qua `suKien` — xem lib/dongSuKien.ts. */
  vanSong: BoDemVan;
  ketNoi: TinhTrangKetNoi;
  dangTai: boolean;
  loi: string | undefined;
  chonTacPham: (id: string) => void;
  chonChuong: (n: number) => void;
  chonKhu: (k: Khu) => void;
  /**
   * Đổi màn — tức đi tới khu ĐẦU của màn đó.
   *
   * Không phải một hành động riêng ở tầng dưới: đổi màn là đổi khu, và cho nó một đường ghi
   * state riêng sẽ dựng đúng cái state thứ hai mà `man` tồn tại để tránh.
   */
  chonMan: (m: Man) => void;
  /** Mở tác phẩm vừa tạo: đổi tác phẩm + về bề mặt mặc định, một lần ghi URL. */
  moTacPhamVuaTao: (id: string) => void;
  /**
   * Mở một cuốn BẤT KỲ ở một bề mặt bất kỳ, một lần ghi URL.
   *
   * Bảng Xưởng cần nó vì mọi hành động trên dòng đều nhắm vào một cuốn KHÔNG phải cuốn đang
   * xem — ghép từ `chonTacPham` rồi `chonKhu` sẽ ghi URL bằng cuốn cũ.
   */
  moTacPhamTai: (id: string, khu: Khu, chuong?: number) => void;
  /** Mở một chương để đọc: chọn chương + sang bề mặt đọc, một lần ghi URL. */
  docChuong: (n: number) => void;
  /**
   * Đọc lại SỰ THẬT của cuốn đang xem — snapshot, danh sách xưởng, hồ sơ — và không đụng vào
   * gì khác.
   *
   * # Vì sao nó phải tồn tại RIÊNG, không dùng `taiLai`
   *
   * Đây là đường mà mọi nút ghi đi qua sau khi lệnh thành công (Chạy · Dừng · Mở/Đóng máy ·
   * đổi chế độ · Cho đi tiếp · Trả chương về viết lại). Trước bản này chúng dùng `taiLai`, và
   * `taiLai` bơm `lanTai` — tức chạy lại CẢ ba effect. Hai hư hại đo được từ mã:
   *
   *   1. Effect §2 xóa trắng `suKien`, `song` và `vanSong`. Nghĩa là bấm `Dừng` là vứt đúng
   *      đoạn chữ vừa đọc để quyết định dừng. Nó cũng phá thẳng điều khoản của DESIGN.md —
   *      "TUI xóa sạch khu chữ ở mỗi lượt vì terminal không cuộn lại được; trình duyệt giỏi
   *      đúng chỗ đó, nên vứt phần vừa đọc là bỏ phí".
   *   2. Effect §2 đặt `seqRef.current = 0` NGAY TRONG THÂN nó, còn effect §3 đọc
   *      `batDauTu = seqRef.current` để mở lại stream. React chạy §2 trước §3 trong cùng một
   *      lượt, nên stream mở lại từ mốc 0 và phát lại từ ĐẦU hàng đợi — dòng sự kiện sau một
   *      cú bấm nút hiện các sự kiện cũ nhất thay vì chỗ đang đứng.
   *
   * `taiLai` vẫn còn và vẫn đúng cho hai ca của nó: thử lại sau khi không tải được, và xóa
   * một tác phẩm (lúc đó danh sách đổi nên phải chọn lại cuốn — việc chỉ effect §1 làm được).
   */
  lamMoi: () => void;
  taiLai: () => void;
  /**
   * Bản dựng giao diện trên đĩa đã KHÁC bản mà tab này đang chạy.
   *
   * `next build` thay toàn bộ tệp chunk. JS đã tải vẫn chạy — nên dòng sự kiện vẫn chảy —
   * nhưng mảnh nào nạp về sau sẽ nhận 404, và bề mặt hỏng nửa vời trong im lặng. Người dùng
   * đã phải tự đoán ra rằng cần F5 ("hơi bị phiền" — nguyên văn).
   *
   * Không tự tải lại: có thể họ đang đọc dở hoặc đang gõ can thiệp. Chỉ nói ra.
   */
  banDungDaDoi: boolean;
}

/** Đọc/ghi tác phẩm đang xem vào query string, để tải lại trang không mất chỗ. */
function tacPhamTuUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return new URLSearchParams(window.location.search).get('tp') ?? undefined;
}

/**
 * Ghi cả ba mảnh vị trí vào URL trong MỘT lần.
 *
 * `replaceState` với một URLSearchParams mới thay thế toàn bộ query string, nên
 * mọi chỗ ghi phải đi qua đây. Có hai chỗ ghi thì chỗ nào chạy sau sẽ xóa tham
 * số của chỗ kia — chọn chương xong là mất khu đang xem.
 */
function ghiUrl(tp: string, chuong: number | undefined, khu: Khu) {
  if (typeof window === 'undefined') return;
  const q = new URLSearchParams();
  q.set('tp', tp);
  if (chuong) q.set('ch', String(chuong));
  if (khu !== KHU_MAC_DINH) q.set('khu', khu);
  window.history.replaceState(null, '', `${window.location.pathname}?${q}`);
}

function chuongTuUrl(): number | undefined {
  if (typeof window === 'undefined') return undefined;
  const v = new URLSearchParams(window.location.search).get('ch');
  const n = v ? Number.parseInt(v, 10) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Khu ghi trên URL, hoặc `undefined` khi URL IM.
 *
 * Hai ca này PHẢI phân biệt được, và đó là cái bẫy của luật đáp: `ghiUrl` cố ý bỏ `khu` khỏi
 * URL khi nó bằng `KHU_MAC_DINH`, nên một bộ đọc trả thẳng `KHU_MAC_DINH` cho ca "không có
 * `?khu=`" làm hai ca "URL im" và "URL ghi dong-san-xuat" đến `khuDap` y hệt nhau. Lúc đó mọi
 * lần mở trang rơi vào nhánh "URL nói rõ khu" và KHÔNG ai thấy màn Xưởng — mà không một bài
 * kiểm nào của `khuDap` đỏ, vì bản thân hàm vẫn đúng.
 *
 * Giá trị không đọc được (`?khu=xyz`) cũng về `undefined`: một mã khu rác không phải một câu
 * URL nói ra, nên nó không được thắng luật đáp.
 */
function khuTuUrl(): Khu | undefined {
  if (typeof window === 'undefined') return undefined;
  // `chuanKhu` chứ không `laKhu`: mã khu cũ trong dấu trang của người dùng phải đi tới bề mặt
  // đã gộp, và phải đi dưới TÊN MỚI để rail biết mục nào đang sáng.
  return chuanKhu(new URLSearchParams(window.location.search).get('khu'));
}

export function useStudio(): Studio {
  const [workshop, setWorkshop] = useState<Workshop>();
  const [tacPham, setTacPham] = useState<string>();
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [hoSo, setHoSo] = useState<Profile>();
  const [chuongChon, setChuongChon] = useState<number>();
  // Khu đọc từ URL ngay lúc dựng state: `next export` không render trước gì nên
  // không có nguy cơ lệch giữa máy chủ và máy khách, và đọc trong useEffect sẽ
  // làm bề mặt nháy qua Dòng sản xuất một nhịp trước khi về đúng khu.
  //
  // URL im thì đứng ở khu mặc định cho tới khi effect §1 biết xưởng có mấy cuốn — luật đáp
  // cần con số đó, và nó chỉ có sau khi `/workshop` trả về.
  const [khu, setKhu] = useState<Khu>(() => khuTuUrl() ?? KHU_MAC_DINH);
  const [song, setSong] = useState<CongDoanSong>();
  const [suKien, setSuKien] = useState<StreamEvent[]>([]);
  const [vanSong, setVanSong] = useState<BoDemVan>(BO_DEM_RONG);
  const [ketNoi, setKetNoi] = useState<TinhTrangKetNoi>('dang-mo');
  const [dangTai, setDangTai] = useState(true);
  const [loi, setLoi] = useState<string>();
  const [lanTai, setLanTai] = useState(0);

  /** Seq lớn nhất đã thấy — điểm nối lại của stream. */
  const seqRef = useRef(0);
  const henRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const tacPhamRef = useRef<string>(undefined);
  const chuongRef = useRef<number | undefined>(undefined);
  const khuRef = useRef<Khu>(KHU_MAC_DINH);
  /**
   * Chương đang soạn, để đặt tên cho vạch ngăn lúc lệnh xóa tới.
   *
   * Ref chứ không phải giá trị đóng trong handler: effect dòng sự kiện cố ý KHÔNG có
   * `snapshot` trong deps (mỗi lần làm mới snapshot sẽ đóng/mở lại stream và mất sự kiện
   * trong khoảng đó), nên một handler đọc `snapshot` trực tiếp sẽ đóng băng ở snapshot đầu
   * tiên và dán số chương CŨ lên mọi vạch ngăn về sau.
   */
  const chuongDangSoanRef = useRef<number | undefined>(undefined);

  tacPhamRef.current = tacPham;
  chuongRef.current = chuongChon;
  khuRef.current = khu;
  chuongDangSoanRef.current = snapshot?.in_progress_chapter ?? undefined;

  /* ── 1. danh sách tác phẩm ─────────────────────────────────────────── */
  useEffect(() => {
    let huy = false;
    setDangTai(true);
    setLoi(undefined);

    layWorkshop()
      .then((ws) => {
        if (huy) return;
        setWorkshop(ws);
        soBanDung(ws);
        const muon = tacPhamTuUrl();
        const co = ws.books.find((b) => b.id === muon);
        const chon = co?.id ?? ws.books[0]?.id;
        setTacPham(chon);
        /**
         * Bề mặt đáp, và nó phải nằm ở ĐÂY chứ không ở chỗ dựng state.
         *
         * Luật đáp cần SỐ LƯỢNG sách (spec §7.1: không có `?tp=` và ≥ 2 cuốn → Xưởng), mà con
         * số đó chỉ tồn tại sau khi `/workshop` trả về. Lúc dựng state nó chưa có, nên đặt
         * luật ở đó là đoán.
         *
         * Cả ba mảnh đi vào `khuDap` ở dạng THÔ — `khuTuUrl()` trả `undefined` khi URL im, và
         * chính hàm thuần đó giữ luật "URL nói rõ khu thì thắng". Không lặp lại luật ấy bằng
         * một `if` ở đây: hai bản của cùng một luật thì lệch, và bản trong `khuDap` là bản có
         * bài kiểm.
         *
         * Chỉ chạy theo `lanTai`, tức lúc mở trang và lúc người dùng bấm tải lại. Đặt nó vào
         * một effect chạy theo `workshop` thì mỗi lần làm mới danh sách sẽ ném người dùng về
         * Xưởng ngay giữa lúc họ đang xem bề mặt khác.
         *
         * `soSach` không còn được truyền: từ bản ba màn, luật đáp không phụ thuộc số cuốn —
         * xem điều khoản đã đổi ở `khuDap`.
         */
        setKhu(khuDap({ tpTuUrl: muon, khuTuUrl: khuTuUrl() }));
        if (!chon) {
          setDangTai(false);
          // Không có tác phẩm thì không có dòng sự kiện nào được mở.
          setKetNoi('khong');
        }
        // Chương từ URL chỉ có nghĩa khi đúng tác phẩm đó.
        if (co) setChuongChon(chuongTuUrl());
      })
      .catch((e: unknown) => {
        if (huy) return;
        setLoi(e instanceof Error ? e.message : String(e));
        setDangTai(false);
      });

    return () => {
      huy = true;
    };
  }, [lanTai]);

  /* ── 2. snapshot của tác phẩm đang xem ─────────────────────────────── */
  /**
   * Nạp lại DANH SÁCH tác phẩm, và cố ý KHÔNG chạm `tacPham` hay `khu`.
   *
   * # Vì sao không dùng `taiLai()`
   *
   * `taiLai` bơm `lanTai`, tức chạy lại cả ba effect: nó đóng/mở lại dòng sự kiện (mất các
   * sự kiện đến trong khoảng đó), xóa bộ đệm văn sống, và cho luật đáp một cơ hội nữa để
   * kéo người dùng về Xưởng giữa lúc họ đang xem bề mặt khác. Ở đây chỉ cần một thứ: danh
   * sách mới.
   *
   * # Vì sao phải có
   *
   * ĐO ĐƯỢC trên máy thật: tạo tác phẩm mới rồi chạy, thanh trên KHÔNG hiện cuốn nào, bảng
   * Xưởng vẫn ba cuốn cũ và ghi "0 engine đang mở" trong khi transport ghi "đang chạy". Phải
   * F5 mới thấy. `/workshop` trước đây chỉ được gọi trong effect §1, mà effect đó chỉ chạy
   * theo `lanTai`.
   *
   * Hư hại không chỉ là một dòng thiếu trong bảng: `ThanhTren` suy cuốn đang xem bằng
   * `workshop.books.find(b => b.id === tacPham)`, nên cuốn vắng trong danh sách làm bộ chọn
   * tác phẩm không được vẽ — người dùng mất luôn đường đổi cuốn.
   *
   * Lỗi im lặng: không có gì đỏ, chỉ có một danh sách nói thiếu.
   */
  /**
   * Mã bản dựng THẤY LẦN ĐẦU trong phiên xem này — mốc để so.
   *
   * Ref chứ không state: nó chỉ là mốc, và một `setState` ở đây sẽ vẽ lại cả bề mặt ở mỗi
   * nhịp nền mà không đổi gì trên màn hình.
   *
   * Không lấy mã lúc BUILD nhúng vào bó JS: làm thế thì phải bơm biến lúc dựng, và một bản
   * dựng lỗi cấu hình sẽ báo "đã đổi" vĩnh viễn. Mốc "cái đầu tiên tab này thấy" luôn đúng
   * mà không cần ai nhúng gì.
   */
  const banDungRef = useRef<string | undefined>(undefined);
  const [banDungDaDoi, setBanDungDaDoi] = useState(false);

  /**
   * So mã bản dựng của MỌI lượt đọc xưởng — cả lần nạp đầu lẫn nhịp nền.
   *
   * Một hàm, hai chỗ gọi. Bản đầu chỉ so trong `napLaiXuong`, và lượt nạp đầu (effect §1) đi
   * đường khác — nên mốc chỉ được đặt ở nhịp nền, và một tab mở đúng lúc bản dựng vừa đổi có
   * thể bỏ lỡ. Bài kiểm "mã đổi giữa hai nhịp" bắt đúng lỗ đó.
   */
  const soBanDung = useCallback((ws: Workshop) => {
    const ma = ws.web_build;
    if (!ma) return;
    if (banDungRef.current === undefined) banDungRef.current = ma;
    else if (banDungRef.current !== ma) setBanDungDaDoi(true);
  }, []);

  const napLaiXuong = useCallback(async () => {
    try {
      const ws = await layWorkshop();
      setWorkshop(ws);
      soBanDung(ws);
    } catch {
      // Danh sách cũ còn dùng được; một lần đọc lỗi không được xóa bề mặt đang xem.
    }
  }, [soBanDung]);

  /**
   * Nạp lại HỒ SƠ truyện (số nhân vật, luật thế giới, phục bút) cho cuốn đang xem.
   *
   * Rail hiện mấy con số này, và engine THÊM vào chúng trong lúc viết — nạp một lần lúc đổi
   * cuốn thì chúng đứng im cả phiên. Cùng lớp lỗi với danh sách xưởng, chỉ khác chỗ hiện ra.
   *
   * Nuốt lỗi có chủ ý: hồ sơ là số phụ, một lần đọc hỏng không được xoá con số đang đúng.
   */
  const napLaiHoSo = useCallback(async (id: string) => {
    try {
      setHoSo(await layHoSo(id));
    } catch {
      /* giữ số cũ */
    }
  }, []);

  const napSnapshot = useCallback(async (id: string, chuong: number | undefined) => {
    const snap = await laySnapshot(id, chuong);
    setSnapshot(snap);
    // Chỉ nhảy về mốc của snapshot khi chưa nhận sự kiện nào; nếu stream đã
    // đi xa hơn thì lùi lại sẽ phát lại những sự kiện vừa xử lý.
    if (snap.queue_seq > seqRef.current) seqRef.current = snap.queue_seq;
    return snap;
  }, []);

  /**
   * Đọc lại cả ba tờ của cuốn đang xem, KHÔNG đụng tới stream hay bộ đệm.
   *
   * Một hàm cho hai người gọi — nhịp làm mới của dòng sự kiện, và `lamMoi` mà mọi nút ghi
   * dùng. Hai bản chép tay của cùng bộ ba này sẽ lệch ngay lần thêm tờ thứ tư, và lúc đó
   * "sau khi bấm nút" và "trong lúc engine chạy" hiện hai lượng dữ liệu khác nhau.
   *
   * Nuốt lỗi có chủ ý ở cả ba: đây là đường ĐỌC LẠI, không phải đường tải lần đầu. Một lần
   * đọc hỏng không được xóa bề mặt đang đúng, và lỗi của chính LỆNH vừa gửi đã được nút của
   * nó hiện ra rồi.
   */
  const napBaTo = useCallback(
    (id: string) => {
      void napSnapshot(id, chuongRef.current).catch(() => undefined);
      void napLaiXuong();
      void napLaiHoSo(id);
    },
    [napSnapshot, napLaiXuong, napLaiHoSo],
  );

  useEffect(() => {
    if (!tacPham) return;
    let huy = false;
    setDangTai(true);
    setLoi(undefined);
    seqRef.current = 0;
    setSuKien([]);
    setSong(undefined);
    // Bộ đệm văn sống thuộc về MỘT tác phẩm. Giữ lại khi đổi cuốn là trưng chữ của cuốn
    // trước dưới tiêu đề của cuốn sau — và không có gì trên màn hình nói ra chuyện đó.
    setVanSong(BO_DEM_RONG);

    napSnapshot(tacPham, chuongTuUrl())
      .catch((e: unknown) => {
        if (!huy) setLoi(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!huy) setDangTai(false);
      });

    layHoSo(tacPham)
      .then((p) => {
        if (!huy) setHoSo(p);
      })
      .catch(() => {
        if (!huy) setHoSo(undefined);
      });

    return () => {
      huy = true;
    };
  }, [tacPham, lanTai, napSnapshot]);

  /* ── 3. dòng sự kiện ───────────────────────────────────────────────── */
  useEffect(() => {
    if (!tacPham || !snapshot) return;

    // Mở stream một lần cho mỗi tác phẩm, từ mốc của snapshot đầu tiên. Không
    // đưa `snapshot` vào deps: mỗi lần làm mới snapshot sẽ đóng/mở lại stream
    // và mất các sự kiện đến trong khoảng đó.
    const batDauTu = seqRef.current;
    setKetNoi('dang-mo');

    const nguon: EventSource | DongGia = LA_MOCK
      ? new DongGia()
      : new EventSource(duongSuKien(tacPham, batDauTu));

    const nhan = (raw: MessageEvent) => {
      let tho: unknown;
      try {
        tho = JSON.parse(raw.data as string);
      } catch {
        return; // một mục hỏng không được giết cả dòng
      }
      // Trùng do kết nối lại, hoặc một payload không mang `seq` — xem lib/dongSuKien.ts.
      const ev = nhanSuKienUi(tho, seqRef.current);
      if (!ev) return;
      seqRef.current = ev.seq;
      setKetNoi('song');

      setSuKien((truoc) => [ev, ...truoc].slice(0, GIU_SU_KIEN));
      const cd = congDoanTu(ev);
      if (cd) setSong(cd);

      // Gộp một nhịp rồi mới đọc lại snapshot: bảng chương, trục và transport
      // phải theo kịp mà không tải lại trang.
      if (henRef.current) clearTimeout(henRef.current);
      // Xưởng và hồ sơ đi CÙNG nhịp với snapshot, không có nhịp riêng: bảng Xưởng hiện chương
      // đã chốt, tiền đã tiêu và "engine đang mở" — cả ba đổi trong lúc chạy, nên một danh
      // sách nạp một lần sẽ đứng im suốt phiên và ô "N engine đang mở" nói 0 trong khi có một
      // engine đang viết. Cùng nhịp vì cùng một lý do phải gộp: nghiền store.
      henRef.current = setTimeout(() => {
        const id = tacPhamRef.current;
        if (id) napBaTo(id);
      }, NHIP_LAM_MOI_MS);
    };

    /**
     * Văn sống đi ĐƯỜNG RIÊNG, và ba điểm khác biệt dưới đây đều là lý do nó phải riêng:
     *
     *   1. payload không có `seq`, nên nó không được chạm vào mốc nối lại của stream;
     *   2. nó không phải một sự kiện, nên không vào danh sách `suKien`;
     *   3. nó KHÔNG được đặt lại hẹn làm mới snapshot. Nhịp delta đã đo là trung vị 2ms, mà
     *      hẹn là 1500ms — mỗi mẩu đặt lại hẹn một lần thì hẹn không bao giờ tới hạn, và
     *      bảng chương, trục, transport đứng im suốt lúc engine đang viết.
     */
    const nhanDelta = (raw: MessageEvent) => {
      let d: { text?: unknown };
      try {
        d = JSON.parse(raw.data as string) as { text?: unknown };
      } catch {
        return;
      }
      if (typeof d.text !== 'string' || !d.text) return;
      setKetNoi('song');
      setVanSong((b) => themChu(b, d.text as string));
    };

    const nhanXoa = () => {
      setKetNoi('song');
      setVanSong((b) => moLuot(b, nhanVach(chuongDangSoanRef.current, new Date())));
    };

    for (const loai of LOAI_SU_KIEN_UI) nguon.addEventListener(loai, nhan);
    nguon.addEventListener(LOAI_VAN_SONG[0], nhanDelta);
    nguon.addEventListener(LOAI_VAN_SONG[1], nhanXoa);

    if (nguon instanceof EventSource) {
      nguon.onopen = () => setKetNoi('song');
      // EventSource tự kết nối lại và tự gửi Last-Event-ID; chỉ cần báo cho
      // người dùng biết đang mất kết nối, không tự dựng lại vòng thử.
      nguon.onerror = () => {
        setKetNoi(nguon.readyState === EventSource.CLOSED ? 'mat' : 'dang-mo');
      };
    } else {
      setKetNoi('song');
    }

    return () => {
      if (henRef.current) clearTimeout(henRef.current);
      nguon.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tacPham, lanTai, !!snapshot, napBaTo]);

  /**
   * Trạng thái CHUYỂN TIẾP tự hỏi lại, không chờ sự kiện.
   *
   * `pausing` là một khoảnh khắc chứ không phải chỗ dừng: engine đang thoát, lát nữa sẽ là
   * `paused`. Nếu chỉ trông vào dòng sự kiện để nạp lại thì một sự kiện rơi (hay một lần nạp lại
   * chạy sớm hơn lúc engine thoát hẳn) là thanh điều khiển kẹt "Đang dừng…" mãi — đo được trên
   * truyện thật, kẹt hơn hai phút dù engine đã dừng từ giây đầu. Hỏi lại mỗi giây cho tới khi
   * trạng thái rời `pausing`; snapshot đổi thì effect tự dọn.
   */
  const dangChuyen = snapshot?.runtime === 'pausing';
  useEffect(() => {
    if (!dangChuyen || !tacPham) return;
    const t = setInterval(() => napBaTo(tacPham), NHIP_CHUYEN_TIEP_MS);
    return () => clearInterval(t);
  }, [dangChuyen, tacPham, napBaTo]);

  /* ── 4. làm mới nền ────────────────────────────────────────────────── */

  /**
   * Hai nguồn kích hoạt, và chúng bắt hai ca KHÁC nhau — bỏ cái nào cũng còn lỗ:
   *
   *   nhịp        — thay đổi xảy ra TRONG LÚC đang nhìn (một tab khác tạo cuốn, CLI chạy
   *                 song song). Không có nhịp thì bề mặt đứng im trước mắt người dùng.
   *   quay lại    — thay đổi xảy ra trong lúc tab bị ẩn. Nhịp không chạy khi ẩn, nên nếu
   *                 chỉ có nhịp thì lúc quay lại vẫn phải đợi hết một chu kỳ mới thấy — và
   *                 đó đúng là khoảnh khắc người ta bấm F5.
   *
   * Chỉ nạp lại XƯỞNG theo nhịp. Snapshot nặng hơn nhiều và đã có dòng sự kiện lo khi engine
   * chạy; nó chỉ được nạp lại ở lần quay lại tab, tức một lần cho mỗi lần rời đi.
   */
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const dangHien = () => document.visibilityState === 'visible';

    const nhip = setInterval(() => {
      if (dangHien()) void napLaiXuong();
    }, NHIP_NEN_MS);

    const quayLai = () => {
      if (!dangHien()) return;
      void napLaiXuong();
      const id = tacPhamRef.current;
      if (id) void napSnapshot(id, chuongRef.current).catch(() => undefined);
    };

    document.addEventListener('visibilitychange', quayLai);
    window.addEventListener('focus', quayLai);
    return () => {
      clearInterval(nhip);
      document.removeEventListener('visibilitychange', quayLai);
      window.removeEventListener('focus', quayLai);
    };
  }, [napLaiXuong, napSnapshot]);

  /* ── hành động ─────────────────────────────────────────────────────── */

  const chonTacPham = useCallback((id: string) => {
    setChuongChon(undefined);
    setSnapshot(undefined);
    setHoSo(undefined);
    setTacPham(id);
    ghiUrl(id, undefined, khuRef.current);
  }, []);

  const chonChuong = useCallback(
    (n: number) => {
      setChuongChon(n);
      const id = tacPhamRef.current;
      if (!id) return;
      ghiUrl(id, n, khuRef.current);
      void napSnapshot(id, n).catch((e: unknown) => {
        setLoi(e instanceof Error ? e.message : String(e));
      });
    },
    [napSnapshot, napLaiXuong],
  );

  const chonKhu = useCallback((k: Khu) => {
    setKhu(k);
    const id = tacPhamRef.current;
    if (id) ghiUrl(id, chuongRef.current, k);
  }, []);

  const chonMan = useCallback(
    (m: Man) => {
      chonKhu(KHU_DAU_MAN[m]);
    },
    [chonKhu],
  );

  /**
   * Mở một tác phẩm VỪA TẠO: đổi tác phẩm và đổi khu trong MỘT hành động.
   *
   * # Vì sao không gọi `chonTacPham` rồi `chonKhu`
   *
   * Ba dòng `xxxRef.current = xxx` ở trên chạy trong lúc RENDER. Gọi hai hành động liền nhau
   * trong cùng một event handler thì React gộp hai lần đặt state và KHÔNG render ở giữa, nên
   * `tacPhamRef.current` bên trong `chonKhu` vẫn là cuốn CŨ. Hệ quả đo được: `ghiUrl` ghi
   * `?tp=<cuốn cũ>` đè lên cuốn mới, và `?ch=` mang theo số chương của cuốn cũ — tải lại
   * trang là quay về cuốn trước, đọc một chương không thuộc cuốn đang xem.
   *
   * Đây đúng cái bẫy mà chú thích của `ghiUrl` đã cảnh báo ("có hai chỗ ghi thì chỗ nào chạy
   * sau sẽ xóa tham số của chỗ kia"), chỉ là lần này hai chỗ ghi nằm trong hai hành động
   * chạy trong cùng một nhịp. Nên hành động này ghi URL đúng một lần, với cả ba mảnh.
   */
  /**
   * Mở một chương ĐỂ ĐỌC: chọn chương và sang bề mặt đọc trong một hành động.
   *
   * Cùng lý do như `moTacPhamVuaTao` — và lần này lỗi đã ĐO ĐƯỢC: dải việc tiếp theo gọi
   * `chonChuong(1)` rồi `chonKhu('ban-thao')`, và URL kết quả là `?tp=…&khu=ban-thao`,
   * MẤT `ch=1`. Vì `chonKhu` đọc `chuongRef.current` mà ref đó chỉ được đặt lại lúc render,
   * nên nó vẫn thấy "chưa chọn chương" và ghi URL không có chương.
   *
   * Hư hại không thấy ngay vì bề mặt đọc tự chọn chương khi vào mà chưa có (DocTruyen.tsx):
   * mở chương 7 rồi tải lại trang thì nó im lặng đưa về chương 1. Tức URL — thứ được thiết
   * kế để giữ đúng chỗ đang xem — nói sai, và cơ chế cứu ở tầng trên che mất chuyện đó.
   */
  const docChuong = useCallback(
    (n: number) => {
      setChuongChon(n);
      setKhu('ban-thao');
      const id = tacPhamRef.current;
      if (!id) return;
      ghiUrl(id, n, 'ban-thao');
      void napSnapshot(id, n).catch((e: unknown) => {
        setLoi(e instanceof Error ? e.message : String(e));
      });
    },
    [napSnapshot],
  );

  /**
   * Mở một cuốn BẤT KỲ ở một bề mặt bất kỳ, trong MỘT hành động.
   *
   * Đây là dạng tổng quát của `moTacPhamVuaTao` ngay dưới, và bảng Xưởng cần đúng dạng tổng
   * quát đó: mỗi dòng có `Mở` (→ buồng lái), và cuốn đã hoàn thành có thêm `Đọc` (→ bề mặt
   * đọc, chương 1) và `Xuất bản` (→ Nhập & Xuất). Cả ba đều mở một cuốn KHÔNG phải cuốn đang
   * xem, nên không cái nào ghép được từ các hành động sẵn có: `docChuong` và `chonKhu` đọc
   * `tacPhamRef.current`, mà ref đó chỉ được đặt lại lúc render — gọi `chonTacPham(id)` rồi
   * `docChuong(1)` trong cùng một handler sẽ ghi URL bằng cuốn CŨ. Lỗi đó đã đo được hai lần
   * trong dự án này; hai chú thích ngay dưới ghi lại cả hai.
   *
   * Ba nhánh của `cachMoTacPham` (lib/xuong.ts) không thay thế nhau được, và nhánh giữa là
   * nhánh làm treo màn hình — lý do đầy đủ nằm ở chú thích của hàm đó.
   */
  const moTacPhamTai = useCallback(
    (id: string, k: Khu, chuong?: number) => {
      const cach = cachMoTacPham(tacPhamRef.current, id, chuong);

      // Cuốn VỪA TẠO chưa có trong danh sách đã nạp lúc mở trang. Gọi ở đây, không ở nhánh
      // `doi-cuon` phía dưới: mở một cuốn cũ cũng đáng nạp lại, vì tiến độ và chi phí của mọi
      // cuốn đã đổi kể từ lần đọc trước.
      void napLaiXuong();

      setChuongChon(chuong);
      setKhu(k);
      setTacPham(id);
      // Một lần ghi, cả ba mảnh. Hai lần ghi thì lần sau xóa tham số của lần trước.
      ghiUrl(id, chuong, k);

      if (cach === 'doi-cuon') {
        // Effect §2 sẽ nạp lại vì `tacPham` đổi. Xóa để bề mặt không vẽ số của cuốn trước
        // dưới tên cuốn sau.
        setSnapshot(undefined);
        setHoSo(undefined);
        return;
      }
      if (cach === 'nap-lai') {
        void napSnapshot(id, chuong).catch((e: unknown) => {
          setLoi(e instanceof Error ? e.message : String(e));
        });
      }
    },
    [napSnapshot],
  );

  const moTacPhamVuaTao = useCallback(
    (id: string) => moTacPhamTai(id, KHU_MAC_DINH),
    [moTacPhamTai],
  );

  /**
   * Đường mà MỌI nút ghi đi qua sau khi lệnh thành công. Lý do đầy đủ ở khai báo `lamMoi`
   * trong interface `Studio`; ở đây chỉ ghi lại điều làm nó khác `taiLai` bằng một câu: nó
   * không chạm `lanTai`, nên stream không đóng lại, `seqRef` không về 0, và bộ đệm văn sống
   * cùng danh sách sự kiện đứng nguyên.
   */
  const lamMoi = useCallback(() => {
    const id = tacPhamRef.current;
    if (id) napBaTo(id);
  }, [napBaTo]);

  const taiLai = useCallback(() => setLanTai((n) => n + 1), []);

  return useMemo(
    () => ({
      workshop,
      tacPham,
      snapshot,
      hoSo,
      chuongChon: chuongChon ?? snapshot?.selected?.chapter,
      khu,
      man: manCuaKhu(khu),
      song,
      suKien,
      vanSong,
      ketNoi,
      dangTai,
      loi,
      chonTacPham,
      chonChuong,
      chonKhu,
      chonMan,
      moTacPhamVuaTao,
      moTacPhamTai,
      docChuong,
      lamMoi,
      taiLai,
      banDungDaDoi,
    }),
    [
      workshop,
      tacPham,
      snapshot,
      hoSo,
      chuongChon,
      khu,
      song,
      suKien,
      vanSong,
      ketNoi,
      dangTai,
      loi,
      chonTacPham,
      chonChuong,
      chonKhu,
      chonMan,
      moTacPhamVuaTao,
      moTacPhamTai,
      docChuong,
      lamMoi,
      taiLai,
      banDungDaDoi,
    ],
  );
}
