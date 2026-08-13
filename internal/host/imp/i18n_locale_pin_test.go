package imp

import "github.com/huuhoa143/ainovel-studio/internal/i18n"

// Test trong package này khẳng định trên chuỗi tiếng Trung của upstream: các
// assert Contains trên Notes của bộ cắt chương ("重复边界应记入 Notes"), trên văn
// bản lỗi khi sản phẩm cắt chương hỏng, trên dòng tóm tắt phiên nhập dở. Ghim locale về zh để
// chúng vẫn so đúng cái upstream sinh ra, nhờ vậy diff của fork gần như bằng
// không và rebase 65+ commit upstream không phải sửa lại hàng loạt assert.
//
// Vì sao file này phải có: package imp bị bỏ sót khi 5 package khác đã ghim
// (tools, diag, host, flow, host/exp). Hệ quả không lộ ra ngay — nó chỉ nổ khi
// catalog vi dịch tới các msgid của imp: hôm nay 7 test đỏ cùng lúc chỉ vì
// internal/i18n/locales/vi.json thêm bản dịch, không một dòng code Go nào đổi.
// Mỗi package chưa ghim là một quả bom hẹn giờ y như vậy.
//
// Đánh đổi phải nói rõ: ghim như thế nghĩa là các test này KHÔNG kiểm đường
// tiếng Việt của thông báo trong imp. Lỗi riêng của bản dịch (thiếu %d, đảo tham
// số) được chặn ở chỗ khác — bộ đối chiếu verb trong internal/i18n, các bất biến
// theo locale trong internal/agents/guard, và scripts/i18n/review_ambiguous.py.
func init() { _ = i18n.SetLocale(i18n.Chinese) }
