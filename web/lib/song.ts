import type { Activity, Runtime, Snapshot } from './types';

/** Tập đóng của `Runtime`, để canh cửa cho một chuỗi đến từ dây. Cùng vai với `laKhu`. */
const RUNTIME: readonly string[] = ['idle', 'running', 'pausing', 'paused', 'completed'];

/**
 * Trạng thái máy đã hợp nhất — MỘT khoá cho cả nhãn, nhịp đập, lẫn bộ nút.
 *
 * # Vì sao một khoá thay vì để mỗi bề mặt tự suy
 *
 * ĐO ĐƯỢC trên app thật (2026-08-02, cuốn `viet-truyen-dang-trung-sinh`): API trả
 * `runtime: "paused"` cùng lúc với `transport.state: "running"`, và thanh dưới in ra CẢ HAI —
 * vạch đầu đọc tắt (đọc `mayDangChay`, đúng) trong khi ký hiệu ▶ đang đập và chữ ghi "đang
 * chạy" (tra `TRANG_THAI_MAY[transport.state]`, sai), ngay cạnh một nút mời bấm "▶ Chạy".
 *
 * Nguyên nhân không phải ai cẩu thả. `mayDangChay` ra đời sau transport, và transport được
 * đấu dây một nửa: nhận `mayChay` cho chuyển động, còn câu chữ ở lại nguồn cũ. Một bản vá
 * kiểu "nhớ dùng đúng trường" sẽ hỏng lại y hệt ở bề mặt thứ ba. Nên chỗ suy ra trạng thái
 * chỉ còn ĐÚNG MỘT, và `mayDangChay` cũng chỉ là một câu hỏi đặt cho nó.
 *
 * # Ba luật, ba lý do khác nhau
 *
 * 1. `runtime` hợp lệ thì THẮNG — nó là engine tự khai; `activity` suy từ mốc checkpoint nên
 *    trễ ở CẢ HAI chiều (xem `mayDangChay` dưới).
 * 2. `runtime` vắng (`''`, engine đóng) thì rơi về `activity` — sự thật mạnh nhất còn lại.
 * 3. `runtime` LẠ cũng rơi về `activity`, không trả nguyên chuỗi ra ngoài. Ca đến được: một
 *    bản engine mới hơn web thêm trạng thái thứ sáu. Trả nguyên chuỗi thì tra bảng ra
 *    `undefined` và thanh dưới TRẮNG đúng ô trả lời câu hỏi số một. Rơi về `activity` là mất
 *    độ chính xác; trắng ô là mất câu trả lời.
 */
export function mayNaoDo(runtime: string | undefined, activity: Activity): Runtime {
  if (runtime && RUNTIME.includes(runtime)) return runtime as Runtime;
  // `Activity` dùng `complete`, `Runtime` dùng `completed`. Ánh xạ ở ĐÂY, một lần, thay vì
  // để mỗi bề mặt tự đoán xem hai chữ đó có phải một không.
  return activity === 'complete' ? 'completed' : activity;
}

/**
 * Máy còn đang chạy hay không — sự thật DUY NHẤT được phép bật nhịp đập.
 *
 * # Vì sao cần một hàm riêng cho một phép so sánh một dòng
 *
 * Nhịp đập là chuyển động duy nhất mang thông tin trong cả giao diện
 * (DESIGN.md:130): nó phân biệt *đang chạy* với *đã dừng ở trạng thái này*. Bản
 * trước gắn nó vào TÔNG MÀU của công đoạn, và tông màu suy từ `stage` — một giá
 * trị ĐÃ GHI VÀO STORE. Chương chết dở giữa lúc soạn giữ `stage: drafting` mãi
 * mãi, nên nó đập mãi mãi.
 *
 * ĐO ĐƯỢC ở bản trước, cùng một khung hình: transport `○ đang nghỉ`, thanh trên
 * `2 tác phẩm · 0 đang chạy`, hàng chương 3 `▶ đang soạn bản thảo` mang
 * `dapnhip:running`. Ba chỗ nói ba điều, và cái đang động là cái nói sai. Đó là
 * hỏng đúng tiêu chí thành công của PRODUCT.md:27 — "mở studio sau 6 giờ đi vắng
 * và trong vòng 5 giây biết được dây chuyền khỏe hay bệnh": engine chết mà hàng
 * đang đập thì đọc ra là khỏe.
 *
 * Một hàm dùng chung thay vì `snapshot.book.activity === 'running'` rải rác vì
 * ba bề mặt cùng cần nó (bảng chương, inspector, và transport đã tự có). Ba bản
 * chép tay của cùng một điều kiện sẽ lệch nhau ngay lần đổi đầu tiên, và lúc đó
 * hai chỗ trên cùng một màn hình lại nói khác nhau — đúng lỗi vừa sửa.
 *
 * # Vì sao `book.activity` chứ không `transport.state`
 *
 * Hai trường này là CÙNG MỘT giá trị, không phải hai nguồn có thể lệch: server
 * tính cả hai bằng `activityOf(p, cps)` trên cùng một `progress` và cùng một
 * danh sách checkpoint (`internal/serve/snapshot.go:70` và `:361`). Nên bảng
 * chương không thể đập trong lúc thanh transport ghi "đang nghỉ".
 * Chọn `book.activity` vì `Book` luôn có trong snapshot, còn `Transport` là một
 * bề mặt trình bày — nếu sau này nó thành optional thì chỗ này không phải đổi.
 *
 * Lưu ý về ngữ nghĩa của "running": `activityOf` trả `idle` khi checkpoint mới
 * nhất đã cũ hơn `activityIdleAfter`. Nghĩa là đây là "vừa có dấu hiệu sống",
 * không phải "process còn tồn tại" — store không biết chuyện đó. Đó là sự thật
 * mạnh nhất có được, và nó đúng là sự thật mà thanh transport đang dùng.
 */
export function mayDangChay(snapshot: Snapshot | undefined): boolean {
  if (!snapshot) return false;
  // `runtime` THẮNG khi có, và đó là một lỗi ĐO ĐƯỢC chứ không phải sở thích kiến trúc.
  //
  // Bấm "Cho đi tiếp 1 chương" trên cuốn `mac-the-bien-di-vo`: engine nhận giấy phép và Writer
  // bắt đầu chương 5 (`runtime: "running"`, `agents: [writer]`), nhưng checkpoint mới chưa kịp
  // ghi nên `activity` vẫn `idle` — và khu văn sống ghi "Máy đang nghỉ" ngay TRÊN chữ nó đang
  // nhận về. Chiều ngược cũng vậy: engine dừng ở cửa nghiệm thu mà checkpoint vừa ghi xong thì
  // `activity` còn `running` vài phút, tức nhịp đập chạy trên một dây chuyền đã đứng.
  //
  // Lúc viết hàm này, `activity` là sự thật mạnh nhất có được — hợp đồng chưa mang `runtime`.
  // Kế hoạch 4/4 thêm nó, nên phần "store không biết chuyện đó" trong chú thích ở trên chỉ còn
  // đúng cho ca engine ĐÓNG.
  //
  // Phép suy ấy giờ nằm ở `mayNaoDo`, không còn viết lại ở đây: hàm này TỪNG là bản thứ hai
  // của cùng một luật, và bản thứ hai chính là thứ để thanh transport trôi mất một nửa.
  return mayNaoDo(snapshot.runtime, snapshot.book.activity) === 'running';
}

/**
 * Chương mà vai đang làm THẬT SỰ đụng tới — tham số `chapter` của lượt gọi công cụ đang chạy
 * (`read_chapter(1)`, `edit_chapter(1)`…), do engine khai ở `agents[].chapter`.
 *
 * Khác "chương kế tiếp": khi bạn trả chương 1 về sửa, chương kế tiếp là 2 nhưng việc đang làm là
 * chương 1. Đo được trên truyện thật — thẻ ghi "Chương 2 · Ba giây" kèm dải bước "Kế hoạch" suốt
 * lượt Biên tập viên sửa chương 1. `undefined` khi không vai nào đang cầm một chương cụ thể.
 */
export function chuongDangLam(snap: Pick<Snapshot, 'agents'> | undefined): number | undefined {
  const goc = snap?.agents?.find((a) => a.depth === 0 && a.state !== 'idle');
  return goc?.chapter && goc.chapter > 0 ? goc.chapter : undefined;
}

/**
 * Vai đang làm — MỘT phép chọn cho mọi bề mặt hỏi "ai đang làm".
 *
 * Bản trước mỗi bề mặt tự ghép `song.vai || last_call.agent`, và trên truyện thật hai chỗ nói
 * hai điều cùng lúc: thẻ đang làm ghi "Kiến trúc sư" (đọc cây vai), thanh dưới ghi "Điều
 * phối" (đọc lượt gọi xong gần nhất — Điều phối vừa giao việc). `last_call` là lượt ĐÃ XONG;
 * nó chỉ trả lời "ai đang làm" khi không còn nguồn nào sống hơn.
 *
 * Thứ tự là độ tươi: vai gốc trong cây vai engine tự khai (cây chỉ chứa vai không rảnh) →
 * dòng sự kiện → lượt gọi gần nhất → vai mặc định của phiên. `||` chứ không `??`: chuỗi rỗng
 * phải rơi tiếp.
 */
export function vaiHienTai(
  snap: Pick<Snapshot, 'agents' | 'transport'> | undefined,
  vaiSong: string | undefined,
): string | undefined {
  const goc = snap?.agents?.find((a) => a.depth === 0 && a.state !== 'idle');
  return (
    goc?.role || vaiSong || snap?.transport.last_call?.agent || snap?.transport.agent || undefined
  );
}

/** Bước đang chạy / vừa xong, ở dạng thô mà `giaiCongCu` và `chiSoBuoc` đọc được. */
export interface BuocHienTai {
  /** Tên bước thô: `novel_context(chương 2)`, `draft_chapter`, mã checkpoint `commit`… */
  buoc?: string;
  /** Bước ấy đang chạy thật (đúng lúc này), hay là bước VỪA xong. */
  dangChay: boolean;
  /** Mốc bắt đầu, nếu biết — chỉ dòng sự kiện biết; cây vai không mang giờ. */
  luc?: string;
}

/**
 * Bước nào đang chạy — MỘT phép chọn cho thẻ đang làm, dải năm bước và thanh dưới.
 *
 * Cùng bệnh với `vaiHienTai`: dòng sự kiện phần lớn chở bước ĐÃ XONG (observer không ghi sự
 * kiện "bắt đầu"), nên ba bề mặt đọc nó ra ba thì khác nhau. Đo được trên truyện thật, cùng
 * một khung hình lúc Người viết đang đọc tài liệu cho chương 2: thẻ ghi "vừa chốt chương",
 * dải năm bước sáng "Kế hoạch" như bước KẾ TIẾP, thanh dưới ghi "Đọc tài liệu… vừa xong", còn
 * khu văn sống quay vòng "Đọc tài liệu truyện" — chỉ cái cuối là đúng.
 *
 * Thứ tự là độ tươi: sự kiện đang chạy → công cụ mà cây vai engine tự khai cho vai gốc đang
 * làm → bước vừa xong (sự kiện, rồi checkpoint).
 */
export function buocHienTai(
  snap: Pick<Snapshot, 'agents' | 'transport'> | undefined,
  song: { buoc?: string; dangChay: boolean; luc?: string } | undefined,
): BuocHienTai {
  if (song?.dangChay && song.buoc) return { buoc: song.buoc, dangChay: true, luc: song.luc };
  const goc = snap?.agents?.find((a) => a.depth === 0 && a.state !== 'idle');
  if (goc?.tool) {
    // `task` mang cả tham số ("writer → novel_context(chương 2)"); `tool` chỉ có tên hàm.
    const sauMuiTen = goc.task?.split('→')[1]?.trim();
    const buoc = sauMuiTen && sauMuiTen.startsWith(goc.tool) ? sauMuiTen : goc.tool;
    return { buoc, dangChay: true };
  }
  return { buoc: song?.buoc ?? snap?.transport.last_step, dangChay: false, luc: song?.luc };
}
