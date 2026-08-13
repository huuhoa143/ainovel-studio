package exp

import "github.com/huuhoa143/ainovel-studio/internal/i18n"

// Test trong package này khẳng định trên chuỗi tiếng Trung của upstream (ví dụ
// stub writer trong engine_test bóc số chương bằng regex "写第 (\\d+) 章", hay
// các assert Contains trên văn bản sự kiện). Ghim locale về zh để chúng vẫn so
// đúng cái upstream sinh ra, nhờ vậy diff của fork gần như bằng không và rebase
// 65+ commit upstream không phải sửa lại hàng loạt assert.
//
// Đánh đổi phải nói rõ: ghim như thế nghĩa là các test này KHÔNG kiểm đường
// tiếng Việt. Lỗi riêng của bản dịch (thiếu %d, đảo tham số) được chặn ở chỗ
// khác — bộ đối chiếu verb trong internal/i18n, các bất biến theo locale trong
// internal/agents/guard, và scripts/i18n/review_ambiguous.py cho lớp không thể
// tự xác minh.
func init() { _ = i18n.SetLocale(i18n.Chinese) }
