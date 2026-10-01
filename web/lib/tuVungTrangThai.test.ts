import { expect, test } from 'vitest';

import { CHU, TRANG_THAI_KET_NOI, GIAI_THICH, TRANG_THAI_KHOI, TRANG_THAI_MAY_RUNTIME } from './nhan';

/**
 * Năm sự thật khác nhau KHÔNG được dùng chung một bộ từ.
 *
 * # Lỗi mà tệp này ra đời để canh
 *
 * ĐO ĐƯỢC 2026-08-02, quét DOM buồng lái và xếp theo toạ độ y — TÁM cụm chữ nói về trạng
 * thái trên cùng một màn hình, cùng một giây:
 *
 *   y=13   thanh trên   "4 tác phẩm · 1 ĐANG CHẠY"
 *   y=61   đầu canvas   "· đang viết ·"
 *   y=105  hero         "MÁY ĐANG NGHỈ · 9/111 chương đã chốt"
 *   y=196  trục · Tập   "T1 · ĐANG CHẠY"
 *   y=224  trục · Cung  "C1 · ĐANG CHẠY"
 *   y=308  văn sống     "MÁY ĐANG NGHỈ"
 *   y=787  can thiệp    "nói vào dây chuyền đang chạy"
 *   y=853  thanh dưới   "ĐANG CHẠY"
 *
 * Bốn câu "đang chạy", hai câu "đang nghỉ". Người dùng nói nguyên văn: "có quá nhiều trạng
 * thái và cảm giác nó bị phân tán mỗi nơi 1 chỗ".
 *
 * Vấn đề KHÔNG phải là tám. Tám chỗ nói tám chuyện khác nhau là chuyện lành — bề mặt này
 * giám sát một cỗ máy nhiều tầng. Vấn đề là chúng nói về NĂM sự thật khác nhau
 * (`ketNoi` / `book.activity` / `book.status` / `runtime` / con trỏ trên trục) bằng CÙNG một
 * bộ từ, nên đọc thành một sự thật được nhắc tám lần — rồi tự cãi nhau.
 *
 * Nên luật là: chỉ THANH DƯỚI được dùng chữ "đang chạy"/"đang nghỉ" để nói về máy. Chỗ khác
 * nói chuyện khác thì phải dùng chữ khác.
 */

test('trục sản xuất KHÔNG mượn chữ của trạng thái máy', () => {
  // Khối trên trục là một CON TRỎ — "đang ở khối nào" — không phải một phép đo liveness.
  // `timeline.volumes[].status` đến từ store và nó vẫn `running` khi engine đã tắt, nên chữ
  // "đang chạy" ở đây là một lời khẳng định về máy mà nguồn của nó không bảo đảm nổi.
  expect(TRANG_THAI_KHOI.running.nhan).not.toBe(TRANG_THAI_MAY_RUNTIME.running.nhan);
  expect(TRANG_THAI_KHOI.running.nhan).toBe('hiện tại');
});

test('slate thanh trên KHÔNG mượn chữ của trạng thái máy', () => {
  // Slate đếm theo `book.activity` của TỪNG cuốn — "cuốn nào có dấu vết sản xuất gần đây".
  // Với cuốn đang mở, con số đó mâu thuẫn được với thanh dưới (ĐO ĐƯỢC: slate "1 đang chạy"
  // trong khi engine `paused`), vì hai bên đọc hai trường khác nhau. Đổi chữ là cách rẻ nhất
  // để hai câu thôi trông như một câu.
  const chu = CHU.demTacPham(4, 1);
  expect(chu).not.toContain('đang chạy');
  expect(chu).toContain('4');
  expect(chu).toContain('1');
});

test('slate im lặng khi KHÔNG có cuốn nào đang làm việc', () => {
  // "0 cuốn có việc" là một câu thừa chiếm chỗ trên một thanh đã chật. Không có việc thì
  // chỉ cần nói có bao nhiêu tác phẩm.
  const chu = CHU.demTacPham(4, 0);
  expect(chu).toContain('4');
  expect(chu).not.toMatch(/\b0\b/);
});

test('chip kết nối nói về TRÌNH DUYỆT, và cả bốn trạng thái cùng một dạng câu', () => {
  // Bản cũ: `dòng sự kiện · đang mở dòng · mất kết nối · chưa mở dòng`. Ba cái sau là câu
  // trạng thái, cái đầu là một DANH TỪ — và nó đúng là trạng thái khoẻ, tức trạng thái người
  // dùng thấy 99% thời gian. Người dùng nói nguyên văn: "có chữ Dòng sự kiện ở trên không
  // biết như thế nào". Ở trạng thái tốt nhất, chip là chỗ duy nhất không nói trạng thái gì.
  // Lặp trên chính BẢNG, không trên một danh sách chép tay: thêm một ca mà quên thêm vào
  // đây thì bài kiểm cũ vẫn xanh. `Record` bắt TypeScript đỏ nếu thiếu ca, còn vòng lặp này
  // bắt nội dung của ca mới phải theo cùng luật.
  const ca = Object.values(TRANG_THAI_KET_NOI);
  expect(ca).toHaveLength(4);

  for (const { nhan, nhanNgan, giaiThich } of ca) {
    expect(nhan.length, nhan).toBeGreaterThan(0);
    expect(nhanNgan.length, nhanNgan).toBeGreaterThan(0);
    expect(giaiThich.length, nhan).toBeGreaterThan(0);

    // Không ca nào được mượn chữ của trạng thái MÁY: chip nói đường truyền có thông không,
    // hoàn toàn không nói engine đang làm gì.
    expect(nhan, nhan).not.toContain('đang chạy');
    expect(nhan, nhan).not.toContain('đang nghỉ');

    // Nhãn phải nêu TÂN NGỮ. "đã nối" trần là bản cũ, và người dùng đã phải hỏi "đã nối là
    // gì ấy nhỉ" — một nhãn phải hỏi mới hiểu là một nhãn đã hỏng.
    expect(nhan, nhan).toContain('hệ thống');

    // Bản ngắn thật sự NGẮN hơn, nếu không thì điểm ngắt 700px không cứu được gì.
    expect(nhanNgan.length, nhanNgan).toBeLessThan(nhan.length);
  }

  // Bốn câu phải PHÂN BIỆT được với nhau, nếu không thì gộp trạng thái là chuyện sớm muộn.
  expect(new Set(ca.map((c) => c.nhan)).size).toBe(4);
  expect(new Set(ca.map((c) => c.giaiThich)).size).toBe(4);
});

test('CHỈ thanh dưới được khai trạng thái máy — không nhãn nào khác mượn câu ấy', () => {
  // Đây là bài chịu lực của cả nhóm, và nó lặp bằng MÁY chứ không bằng tay: một luật chỉ
  // canh vài chuỗi đã biết sẽ xanh y nguyên vào ngày ai đó thêm chuỗi thứ mười.
  //
  // Miễn trừ có DANH SÁCH, và mỗi mục phải tự giải thích được:
  //   TRANG_THAI_MAY*      — chính hai bảng nhãn của thanh dưới và của slate.
  //   buoc*                — nói về BƯỚC hiện tại, không về máy ("công đoạn … đang chạy").
  //   canThiep*/dangViet*  — chữ hướng dẫn, không khẳng định gì về lúc này.
  //   chuaCoSuKienDangChay — ca RỖNG-khi-chạy: chỉ hiện khi đã biết chắc là đang chạy.
  const MIEN_TRU = /^(buoc|canThiep|dangViet|chuaCoSuKienDangChay|cheDo|ttDangViet|ttDangDungNen)/;
  const CAM = /máy đang (nghỉ|chạy)/i;
  const pham: string[] = [];
  for (const [khoa, gt] of Object.entries({ ...CHU, ...GIAI_THICH })) {
    if (typeof gt !== 'string' || MIEN_TRU.test(khoa)) continue;
    if (CAM.test(gt)) pham.push(`${khoa}: ${gt.slice(0, 60)}`);
  }
  expect(pham, 'nhãn khai trạng thái máy ngoài thanh dưới').toEqual([]);
});

test('văn sống nói về BỘ ĐỆM, không nói về máy', () => {
  // Khu văn sống trả lời "phiên xem này có giữ được chữ nào không" — một câu về bộ đệm phía
  // trình duyệt. Nó KHÔNG đo được liveness và không nên giả vờ đo: ĐO ĐƯỢC, nó in "Máy đang
  // nghỉ" ngay bên dưới một hero cũng in "Máy đang nghỉ", tức cùng một câu hai lần cách nhau
  // 200px, trong khi thanh dưới lúc ấy nói ngược lại.
  expect(CHU.mayNghi).not.toContain('Máy đang nghỉ');
  expect(CHU.mayNghi.toLowerCase()).toContain('văn');
});
