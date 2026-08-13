package eval

import "github.com/huuhoa143/ainovel-studio/internal/i18n"

// Test trong package này chốt assert trên chuỗi tiếng Trung của upstream: chúng
// dò cụm trong văn bản báo cáo đánh giá ("缺终稿", "stylestat warning", "回归")
// để xác nhận đúng loại cảnh báo được phát ra. Ghim locale về zh để chúng vẫn so
// đúng cái upstream sinh ra, nhờ vậy diff của fork gần bằng không và rebase không
// phải sửa lại hàng loạt assert.
//
// Đánh đổi phải nói rõ: các test này KHÔNG kiểm đường tiếng Việt. Lỗi riêng của
// bản dịch được chặn ở chỗ khác — bộ đối chiếu format verb trong internal/i18n,
// các bất biến theo locale trong internal/agents/guard, và
// scripts/i18n/review_ambiguous.py cho lớp không tự xác minh được.
//
// Ở package này việc ghim còn gánh một vai thứ hai, đừng bỏ nó khi dọn: eval gọi
// stylestat.Compute, mà stylestat chọn bộ mẫu văn phong theo i18n.Active(). Ghim
// zh làm các fixture tiếng Trung trong grade_test/collect_test được đo bằng đúng
// bộ mẫu tiếng Trung; để rơi về vi thì mọi mẫu khớp 0 và test stylestat ở đây
// "xanh vì không thấy gì" — đúng loại lỗi thầm lặng mà đợt việt hóa này đang dẹp.
// Đường tiếng Việt của stylestat được kiểm riêng ở internal/stylestat/stylestat_vi_test.go.
//
// Ghi chú cho lần dọn sau: các cảnh báo này đã có trường phân loại có kiểu
// (Finding.Kind và Finding.Source, ví dụ "delta:stylestat" / "delta:tool_calls"),
// nên assert theo hai trường đó sẽ tốt hơn ghim locale và không cần ghim nữa.
// Chưa làm vì nó tăng diff với upstream, mà giảm diff đang là ưu tiên của fork.
func init() { _ = i18n.SetLocale(i18n.Chinese) }
