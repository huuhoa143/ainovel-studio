import { dialog, type BrowserWindow } from 'electron';
import type { LegalDocId } from './legal';

// Hộp thoại đồng ý điều khoản lần đầu (và khi PRIVACY/DISCLAIMER lên phiên bản). Quyết định có
// hỏi hay không và ghi bản ghi nằm ở legal.ts; ở đây chỉ là vòng hộp thoại native.

export const CONSENT_DETAIL = [
  'AINovel Studio dùng mô hình AI do bạn chọn để viết truyện. Trước khi bắt đầu, xin lưu ý:',
  '',
  '• Nội dung do AI tạo ra có thể sai, trùng lặp hoặc không phù hợp. Bạn chịu trách nhiệm về những gì mình dùng và xuất bản.',
  '• Chi phí API do nhà cung cấp AI của bạn tính trực tiếp. Khi đang viết, engine tự chạy tiếp cho tới khi bạn bấm tạm dừng — hãy theo dõi mức chi tiêu.',
  '• Truyện, cấu hình và khóa API lưu trên máy bạn. Chỉ nội dung cần cho việc viết (cùng khóa API) được gửi tới nhà cung cấp AI bạn chọn, và chính sách của nhà cung cấp đó áp dụng.',
  '• App không thu thập dữ liệu sử dụng (không telemetry). Ngoài nhà cung cấp AI, app chỉ tải bảng giá model công khai (OpenRouter) và kiểm tra bản cập nhật (GitHub), không kèm dữ liệu của bạn — chi tiết trong «Quyền riêng tư».',
  '',
  'Bấm «Tôi đã hiểu và đồng ý» nghĩa là bạn chấp nhận Chính sách quyền riêng tư và Miễn trừ trách nhiệm.',
].join('\n');

const BUTTONS = ['Tôi đã hiểu và đồng ý', 'Xem quyền riêng tư', 'Xem miễn trừ trách nhiệm', 'Thoát'];
const VIEW: Record<number, LegalDocId> = { 1: 'privacy', 2: 'disclaimer' };
const QUIT = 3;

export interface ConsentDialogOptions {
  /** Cửa sổ chính đã hiện — hộp thoại gắn vào nó (sheet trên macOS). */
  window: BrowserWindow;
  /** Mở tài liệu trong cửa sổ xem; trả về cửa sổ đó để chờ người dùng đóng. */
  openDoc: (id: LegalDocId) => BrowserWindow;
  /** App đang thoát: dừng vòng hỏi, không làm gì thêm. */
  quitting: () => boolean;
}

/**
 * Hỏi tới khi người dùng đồng ý ('accepted') hoặc chọn Thoát / app thoát giữa chừng ('quit').
 * "Xem …" mở tài liệu rồi hỏi lại khi cửa sổ tài liệu đóng — hộp thoại không che tài liệu.
 */
export async function askConsent(opts: ConsentDialogOptions): Promise<'accepted' | 'quit'> {
  for (;;) {
    if (opts.quitting() || opts.window.isDestroyed()) return 'quit';
    const { response } = await dialog.showMessageBox(opts.window, {
      type: 'info',
      title: 'AINovel Studio',
      message: 'Trước khi bắt đầu',
      detail: CONSENT_DETAIL,
      buttons: BUTTONS,
      defaultId: 0,
      cancelId: QUIT,
      noLink: true,
    });
    if (opts.quitting()) return 'quit';
    const doc = VIEW[response];
    if (!doc) return response === 0 ? 'accepted' : 'quit';
    const viewer = opts.openDoc(doc);
    await new Promise<void>((resolve) => viewer.once('closed', () => resolve()));
  }
}
