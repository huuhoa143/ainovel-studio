import type { Book, Snapshot, TongXuongDoc, TongXuongSach } from '@/lib/types';
import type { TaiTongXuong } from '@/lib/tongXuong';

/**
 * Một cuốn trong xưởng, mặc định là cuốn CHƯA CHẠY LẦN NÀO.
 *
 * Mặc định đó có chủ ý, cùng lý do như năm trường sống `null` của `snap()` ngay dưới: ca
 * "chưa đo được" (`chapters_per_hour === 0`, `cost_per_chapter === 0`) là ca mà bề mặt Xưởng
 * tồn tại để phân biệt với ca "đo được, bằng không". Bài kiểm nào cần một cuốn đã chạy phải
 * NÓI RA bằng cách đặt trường đó, nên không bài nào lỡ đo ca dễ mà tưởng mình đo ca khó.
 *
 * Đặt ở đây chứ không viết lại trong từng tệp kiểm: `lib/xuong.test.ts` và
 * `components/Xuong.test.tsx` cùng dựng `Book`, và hai bản sao của một fixture thì lệch —
 * ngày hợp đồng `/workshop` thêm một trường bắt buộc, một bản được sửa còn bản kia im lặng
 * ở lại với một kiểu đã ép. Tệp này chạy được ở CẢ HAI project của vitest vì nó chỉ nhập
 * kiểu, không chạm `document`.
 */
export function sach(p: Partial<Book> = {}): Book {
  return {
    id: 'b',
    name: 'B',
    phase: 'writing',
    completed_chapters: 0,
    total_chapters: 0,
    total_words: 0,
    activity: 'idle',
    cost_usd: 0,
    cost_per_chapter: 0,
    chapters_per_hour: 0,
    engine_open: false,
    ...p,
  };
}

/**
 * Snapshot tối thiểu cho bài kiểm component.
 *
 * # Vì sao dựng đủ trường thật thay vì `{} as Snapshot['capabilities']`
 *
 * Ép kiểu một object rỗng thành một kiểu có trường bắt buộc là đúng lớp lỗi mà cả `types.ts`
 * lẫn spec §6.1 ghi lại: một kiểu NÓI DỐI về dữ liệu làm `tsc` xanh trong khi mã đọc phải
 * `undefined`. Ở fixture thì hậu quả nhẹ hơn — nhưng nó cũng làm mất đúng thứ fixture này
 * đáng lẽ cho không: ngày hợp đồng thêm một trường bắt buộc, bản dựng đủ sẽ ĐỎ ở đây và
 * người sửa biết ngay có một ca mới phải nghĩ tới, còn bản ép kiểu thì im lặng.
 *
 * Đuôi `.test-helper.ts` chứ không phải `.test.ts`: `vitest.config.mts` gom bài kiểm giao
 * diện theo `{components,app}/**\/*.test.tsx`, nên tệp này không bị chạy như một bộ kiểm rỗng.
 */
export function snap(p: Partial<Snapshot>): Snapshot {
  return {
    // '' = engine đóng, đúng mặc định an toàn: không bề mặt nào được suy nó thành 'đã dừng'.
    runtime: '',
    book: sach({
      completed_chapters: 1,
      total_chapters: 3,
      total_words: 100,
      activity: 'running',
      engine_open: true,
    }),
    capabilities: {
      per_chapter_duration: false,
      per_chapter_cost: false,
      layered_outline: false,
    },
    timeline: { volumes: null, arcs: null, chapters: [] },
    // Năm trường sống mặc định là `null` — tức ca engine ĐÓNG. Đó là mặc định đúng cho một
    // fixture: bài kiểm nào cần ca "đo được" phải nói ra bằng cách đặt trường đó, nên không
    // bài nào lỡ đo ca dễ mà tưởng mình đo ca khó.
    agents: null,
    idle_agents: null,
    advance: null,
    context: null,
    in_progress_chapter: null,
    chapters: [],
    transport: { state: 'running', cost_usd: 0 },
    queue_seq: 0,
    ...p,
  };
}

/**
 * Tờ tổng của cả xưởng — mặc định là ca CHƯA ĐO ĐƯỢC GÌ.
 *
 * Mặc định `du: undefined` chứ không phải một tờ rỗng, và đó là cùng lối với `snap()` ngay
 * trên: `undefined` là ca thật (route vắng mặt ở một binary engine cũ, hoặc lượt gọi còn
 * đang bay), và mọi bề mặt đọc tờ này phải vẽ được ca đó. Bài kiểm nào cần số liệu phải NÓI
 * RA bằng cách truyền `du`, nên không bài nào lỡ đo ca dễ mà tưởng mình đo ca khó.
 */
export function tongGia(du?: Partial<TongXuongDoc>): TaiTongXuong {
  if (!du) return { du: undefined, loi: undefined, dangTai: false };
  return {
    du: {
      books: [],
      overall: {
        input: 0,
        output: 0,
        cache_read: 0,
        cache_write: 0,
        cost_usd: 0,
        saved_usd: 0,
        cache_capable: false,
        cache_breaks: 0,
      },
      per_agent: {},
      per_model: {},
      counted: 0,
      no_data: [],
      missing_assistant_usage: 0,
      ...du,
    },
    loi: undefined,
    dangTai: false,
  };
}

/** Một hàng trong tờ tổng, mặc định KHÔNG có việc gì đang chờ. */
export function tongSach(p: Partial<TongXuongSach> = {}): TongXuongSach {
  return {
    id: 'b',
    cost_state: 'ready',
    cost_usd: 0,
    saved_usd: 0,
    advance_mode: '',
    advance_hold: false,
    pending_steer: false,
    ...p,
  };
}
