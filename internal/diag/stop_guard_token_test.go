package diag

import (
	"strings"
	"testing"

	"github.com/huuhoa143/ainovel-studio/internal/i18n"
)

// Định danh mà runtime.go dò trong log để đếm số lần hệ thống tự chặn end_turn.
//
// Phải khớp nguyên văn với `strings.Contains(line, …)` trong scanLogTail.
const tokenChanDung = "stop_guard"

// msgidChanDung là ba msgid mà guard phát ra qua slog, lấy nguyên văn từ
// internal/agents/guard/subagent_guards.go:66,103,110.
//
// Chép tay thay vì import: gói guard không xuất chúng, và tạo một biến xuất chỉ để
// test được là đổi hình dạng mã sản phẩm cho tiện việc kiểm. Cái giá của việc chép là
// hằng có thể trôi khỏi nguồn — nhưng lỗi đó đã có bộ canh khác bắt
// (TestMsgidNeoPhaiCoTrongCatalog trong internal/i18n: msgid được test neo vào mà
// không tra được trong catalog thì đỏ).
var msgidChanDung = []string{
	"subagent stop_guard 检测到不可恢复停机，立即升级",
	"subagent stop_guard 连续阻拦超限，升级为终止",
	"subagent stop_guard 拦截 end_turn",
}

// TestChuChanDungSongSotQuaBanDich canh khế ước hai đầu giữa guard và diag.
//
// # Khế ước
//
// Bên SINH: guard gọi `slog.Warn(i18n.F("subagent stop_guard 拦截 end_turn"), …)`.
// Bên ĐỌC: `scanLogTail` đếm `strings.Contains(line, "stop_guard")`.
//
// Hai đầu viết cứng riêng, và đầu sinh ĐI QUA i18n. Nên bản dịch là một đường làm vỡ
// khế ước mà không ai đụng một dòng Go nào.
//
// # Vì sao nó đang đúng, và vì sao đúng-nhờ-may là chưa đủ
//
// Cả ba bản dịch tình cờ giữ nguyên `stop_guard`:
//
//	"subagent stop_guard 拦截 end_turn" → "subagent stop_guard chặn end_turn"
//
// Nhưng dịch `stop_guard` thành `chốt canh dừng` cho thuần Việt là một lựa chọn hoàn
// toàn hợp lý với người dịch — họ không có cách nào biết chuỗi này bị một hàm khác dò
// bằng chuỗi con. Và khi đó `RuntimeCapture.StopGuard` về 0 VĨNH VIỄN.
//
// # Hậu quả nếu vỡ
//
// `/diag` mất tín hiệu "hệ thống đang tự chặn". Nó không báo lỗi, không báo 0-vì-hỏng
// — nó báo 0 y như một phiên khỏe mạnh chưa bị chặn lần nào. Đúng loại lỗi mà chú
// thích BlockHook ở subagent_guards.go:19 mô tả: chỉ số im lặng thì không ai đi tìm.
//
// Đây là ca thứ TƯ cùng lớp trong repo (sau host/stream_extract.go tiền tố `✻ `,
// host/advance_gate.go, và tools/ask_user.go) và là ca duy nhất chưa có lưới.
func TestChuChanDungSongSotQuaBanDich(t *testing.T) {
	truoc := i18n.Active()
	t.Cleanup(func() { _ = i18n.SetLocale(truoc) })

	// Kiểm ở CẢ HAI locale. Đường zh cũng phải đúng: nếu ai sửa msgid gốc mà bỏ định
	// danh đi thì bản zh vỡ trước, và bản zh là bản đối chiếu với upstream.
	for _, loc := range []i18n.Locale{i18n.Vietnamese, i18n.Chinese} {
		if err := i18n.SetLocale(loc); err != nil {
			t.Fatalf("SetLocale(%s): %v", loc, err)
		}
		for _, msgid := range msgidChanDung {
			// Msgid phải mang định danh: nếu bản gốc mất nó thì không bản dịch nào cứu.
			if !strings.Contains(msgid, tokenChanDung) {
				t.Errorf("msgid gốc không còn chứa %q — sửa cả scanLogTail:\n  %s",
					tokenChanDung, msgid)
				continue
			}
			dich := i18n.F(msgid)
			if !strings.Contains(dich, tokenChanDung) {
				t.Errorf("[%s] bản dịch bỏ mất định danh %q, nên diag.scanLogTail sẽ đếm 0 mãi mãi.\n"+
					"  msgid: %s\n  dịch : %s\n"+
					"Giữ nguyên %q trong bản dịch, hoặc sửa cả hai đầu cùng lúc "+
					"(internal/diag/runtime.go scanLogTail).",
					loc, tokenChanDung, msgid, dich, tokenChanDung)
			}
		}
	}
}

// TestChuChanDungCoRang chứng minh bài kiểm trên bắt được thật.
//
// Không có bài này thì TestChuChanDungSongSotQuaBanDich có thể xanh vì một lý do sai —
// ví dụ `i18n.F` trả lại chính msgid (khi thiếu bản dịch), mà msgid thì đương nhiên
// chứa định danh. Bài này khẳng định phép kiểm phân biệt được "bản dịch giữ định danh"
// với "bản dịch bỏ định danh".
func TestChuChanDungCoRang(t *testing.T) {
	const msgid = "subagent stop_guard 拦截 end_turn"

	for _, c := range []struct {
		ten  string
		dich string
		dat  bool
	}{
		{"giữ định danh", "subagent stop_guard chặn end_turn", true},
		{"dịch thuần Việt, mất định danh", "subagent chốt canh dừng chặn end_turn", false},
		{"dịch cả cụm", "chốt canh dừng của tác tử con đã chặn end_turn", false},
	} {
		got := strings.Contains(c.dich, tokenChanDung)
		if got != c.dat {
			t.Errorf("%s: phép kiểm cho %v, phải %v\n  %s → %s", c.ten, got, c.dat, msgid, c.dich)
		}
	}
}
