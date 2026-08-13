package ctxpack

import "github.com/huuhoa143/ainovel-studio/internal/i18n"

// Test trong package này khẳng định trên chuỗi tiếng Trung của upstream: các
// assert Contains trên tiêu đề mục mà builder tự kết xuất ("最近章节摘要",
// "待修审稿问题", "数据告警"). Ghim locale về zh để chúng vẫn so đúng cái upstream
// sinh ra, nhờ vậy diff của fork gần như bằng không và rebase 65+ commit upstream
// không phải sửa lại hàng loạt assert.
//
// Vì sao file này phải có: ctxpack là lớp sinh ngữ cảnh sau nén, nên toàn bộ tiêu
// đề mục đi qua đây đều là chuỗi hiển thị. Package bị bỏ sót khi các package khác
// đã ghim, và lỗi chỉ nổ ra khi các tiêu đề ấy được bọc i18n — catalog vi đã có
// bản dịch sẵn nên vừa bọc là ba test đỏ ngay, không một assert nào đổi.
//
// Đáng chú ý hơn: một trong ba test đỏ vì LÝ DO KHÁC hẳn ngôn ngữ —
// TestStoreSummaryCompactApplyUsesPersistentStoreData báo "strategy không áp
// dụng". Bản tóm tắt tiếng Việt dài hơn bản tiếng Trung, nên với fixture bé
// tokensAfter không còn nhỏ hơn tokensBefore và chiến lược tự bỏ qua. Đó là hành
// vi thật của lớp nén, chỉ lộ ra ở cỡ fixture; ghim zh giữ test kiểm đúng thứ nó
// định kiểm (chiến lược có chạy không), còn đường tiếng Việt được kiểm riêng
// trong restore_locale_test.go.
//
// Đánh đổi phải nói rõ: ghim như thế nghĩa là các test này KHÔNG kiểm đường tiếng
// Việt. Lỗi riêng của bản dịch (thiếu %d, đảo tham số) được chặn ở chỗ khác — bộ
// đối chiếu verb trong internal/i18n, các bất biến theo locale trong
// internal/agents/guard, và scripts/i18n/review_ambiguous.py.
func init() { _ = i18n.SetLocale(i18n.Chinese) }
