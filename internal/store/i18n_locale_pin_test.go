package store

import "github.com/huuhoa143/ainovel-studio/internal/i18n"

// Test trong package này khẳng định trên chuỗi tiếng Trung của upstream: các
// assert Contains trên Markdown mà store tự kết xuất ("边界：…" trong
// renderWorldRules, tiêu đề nhóm, dòng quy tắc). Ghim locale về zh để chúng vẫn
// so đúng cái upstream sinh ra, nhờ vậy diff của fork gần như bằng không và
// rebase 65+ commit upstream không phải sửa lại hàng loạt assert.
//
// Vì sao file này phải có: store là lớp ghi Markdown xuống ổ đĩa, nên rất nhiều
// chuỗi hiển thị đi qua đây. Package bị bỏ sót khi các package khác đã ghim, và
// lỗi chỉ nổ ra khi catalog vi dịch tới đúng msgid đó — hôm nay là
// "  - 边界：%s\n" làm TestRenderWorldRules đỏ, không một dòng code Go nào đổi.
//
// Đánh đổi phải nói rõ: ghim như thế nghĩa là các test này KHÔNG kiểm đường tiếng
// Việt của Markdown do store kết xuất. Lỗi riêng của bản dịch (thiếu %s, đảo tham
// số) được chặn ở chỗ khác — bộ đối chiếu verb trong internal/i18n, các bất biến
// theo locale trong internal/agents/guard, và scripts/i18n/review_ambiguous.py.
//
// Ghim này KHÔNG che được test tiếng Việt trong session_chapter_test.go:
// extractChapter làm việc trên regex thuần, không đi qua i18n, nên nó kiểm đúng
// đường tiếng Việt bất kể locale nào đang bật.
func init() { _ = i18n.SetLocale(i18n.Chinese) }
