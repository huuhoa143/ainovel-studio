package sim

import "github.com/huuhoa143/ainovel-studio/internal/i18n"

// Test trong package này chốt assert trên chuỗi tiếng Trung của upstream. Ghim
// locale về zh để chúng vẫn so đúng cái upstream sinh ra, nhờ vậy diff của fork
// gần bằng không và rebase không phải sửa lại hàng loạt assert.
//
// Đánh đổi phải nói rõ: các test này KHÔNG kiểm đường tiếng Việt. Lỗi riêng của
// bản dịch được chặn ở chỗ khác — bộ đối chiếu format verb trong internal/i18n,
// các bất biến theo locale trong internal/agents/guard (package đó CỐ Ý không
// ghim), và scripts/i18n/review_ambiguous.py cho lớp không tự xác minh được.
func init() { _ = i18n.SetLocale(i18n.Chinese) }
