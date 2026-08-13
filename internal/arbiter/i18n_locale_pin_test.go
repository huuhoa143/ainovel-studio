package arbiter

import "github.com/huuhoa143/ainovel-studio/internal/i18n"

// Test trong package này chốt assert trên chuỗi tiếng Trung của upstream (chúng
// dò cụm như "截断" / "拒答" / "契约违约" trong văn bản lỗi để phân loại). Ghim
// locale về zh để chúng vẫn so đúng cái upstream sinh ra, nhờ vậy diff của fork
// gần bằng không và rebase không phải sửa lại hàng loạt assert.
//
// Đánh đổi phải nói rõ: các test này KHÔNG kiểm đường tiếng Việt. Lỗi riêng của
// bản dịch được chặn ở chỗ khác — bộ đối chiếu format verb trong internal/i18n,
// các bất biến theo locale trong internal/agents/guard, và
// scripts/i18n/review_ambiguous.py cho lớp không tự xác minh được.
//
// Ghi chú cho lần dọn sau: code SẢN PHẨM ở đây đã phân loại lỗi bằng trường có
// kiểu (llmcontract.Failure.Kind = FailureLength / FailureSafety / FailureContract
// / FailureProtocol), nên nó an toàn với mọi ngôn ngữ. Chỉ TEST là còn dò văn bản.
// Nâng các assert đó lên so theo Failure.Kind sẽ tốt hơn ghim locale — test khi ấy
// kiểm đúng bản chất và không cần ghim nữa. Chưa làm vì nó tăng diff với upstream,
// mà giảm diff đang là ưu tiên của fork này.
func init() { _ = i18n.SetLocale(i18n.Chinese) }
