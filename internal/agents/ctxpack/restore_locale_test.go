package ctxpack

import (
	"os"
	"strings"
	"testing"
	"unicode"

	"github.com/huuhoa143/ainovel-studio/internal/i18n"
)

// Nhóm test này giữ đường tiếng Việt của lớp nén ngữ cảnh, thứ mà
// i18n_locale_pin_test.go cố tình không kiểm.
//
// Vì sao cần kiểm riêng: bốn prompt nén trong restore.go và các tiêu đề mục trong
// builder.go không hiện trên màn hình — chúng chỉ đi vào prompt gửi LLM. Bỏ sót
// bọc i18n ở đó không làm test nào đỏ, không sinh log, người dùng cũng không thấy
// gì; hệ quả duy nhất là sau mỗi lần nén, LLM nhận chỉ dẫn tiếng Trung rồi kéo
// giọng văn chương kế về tiếng Trung. Đúng lớp lỗi đã sống sót qua cả bản việt
// hóa trước (báo cáo soát tm-kentjuno mục 7).

// chuaChuHan trả về true nếu chuỗi có ít nhất một chữ Hán.
func chuaChuHan(s string) bool {
	for _, r := range s {
		if unicode.Is(unicode.Han, r) {
			return true
		}
	}
	return false
}

// dongTieuDe bóc các dòng tiêu đề mục ("## …") khỏi văn bản đã kết xuất.
//
// Chỉ soi dòng tiêu đề, KHÔNG soi cả khối: phần thân là JSON dữ liệu truyện, mà
// truyện trong fixture là tiếng Trung — đòi cả khối sạch chữ Hán sẽ đỏ vì nội
// dung tác phẩm, không phải vì lỗi dịch.
func dongTieuDe(text string) []string {
	var out []string
	for _, line := range strings.Split(text, "\n") {
		if strings.HasPrefix(line, "## ") {
			out = append(out, line)
		}
	}
	return out
}

func datLocale(t *testing.T, loc i18n.Locale) {
	t.Helper()
	if err := i18n.SetLocale(loc); err != nil {
		t.Fatalf("SetLocale(%s): %v", loc, err)
	}
	// Trả lại ghim của package (xem i18n_locale_pin_test.go) chứ không phải
	// DefaultLocale: các test khác trong package này so trên chuỗi tiếng Trung.
	t.Cleanup(func() { _ = i18n.SetLocale(i18n.Chinese) })
}

// TestPromptNenNguCanhDichTheoLocale: bốn prompt nén phải đổi ngôn ngữ theo
// catalog, và ở tiếng Việt không được còn chữ Hán nào. Prompt là chỉ dẫn thuần,
// không nhúng dữ liệu truyện, nên "không còn chữ Hán" là điều kiện đúng và chặt.
func TestPromptNenNguCanhDichTheoLocale(t *testing.T) {
	prompts := map[string]string{
		"WriterSummarySystemPrompt": writerSummarySystemPromptMsgid,
		"WriterSummaryPrompt":       writerSummaryPromptMsgid,
		"WriterUpdateSummaryPrompt": writerUpdateSummaryPromptMsgid,
		"WriterTurnPrefixPrompt":    writerTurnPrefixPromptMsgid,
	}

	t.Run("zh giữ nguyên nguồn upstream", func(t *testing.T) {
		datLocale(t, i18n.Chinese)
		for name, msgid := range prompts {
			if got := i18n.F(msgid); got != msgid {
				t.Errorf("%s: zh phải rơi về chính msgid, nhận được %q", name, got)
			}
		}
	})

	t.Run("vi dịch trọn, không sót chữ Hán", func(t *testing.T) {
		datLocale(t, i18n.Vietnamese)
		for name, msgid := range prompts {
			got := i18n.F(msgid)
			if got == msgid {
				t.Errorf("%s: catalog vi chưa có bản dịch — prompt nén vẫn gửi tiếng Trung cho LLM", name)
				continue
			}
			if chuaChuHan(got) {
				t.Errorf("%s: bản dịch vi còn chữ Hán:\n%s", name, got)
			}
		}
	})
}

// TestBienPromptXuatDiQuaI18n chốt việc bốn biến xuất thật sự lấy giá trị từ
// catalog, không phải hằng chuỗi thô.
//
// Vì sao cần: sửa đúng ở đây là một dòng bọc i18n.F, và ai đó gỡ nó ra thì mọi
// test còn lại vẫn xanh — TestPromptNenNguCanhDichTheoLocale kiểm catalog qua
// msgid, không kiểm biến. Test này bắc cầu giữa hai chỗ đó.
//
// Vì sao phải ép lại locale mặc định chứ không dùng locale đang ghim: biến cấp
// package được khởi tạo TRƯỚC mọi hàm init() của package, kể cả init() ghim zh
// trong i18n_locale_pin_test.go. Nên bốn biến này chốt theo locale mà i18n.init
// đã đặt (mặc định vi), không phải zh. Chính thứ tự đó khiến chúng đúng trong
// binary thật — i18n được import nên init xong trước — nhưng lệch với locale ghim
// khi chạy test. So sai chiều là được một test đỏ oan.
func TestBienPromptXuatDiQuaI18n(t *testing.T) {
	if v := strings.TrimSpace(os.Getenv(i18n.EnvLocale)); v != "" {
		t.Skipf("%s=%q ép locale lúc init, không suy ra được kỳ vọng", i18n.EnvLocale, v)
	}
	datLocale(t, i18n.DefaultLocale)

	cases := []struct {
		name  string
		got   string
		msgid string
	}{
		{"WriterSummarySystemPrompt", WriterSummarySystemPrompt, writerSummarySystemPromptMsgid},
		{"WriterSummaryPrompt", WriterSummaryPrompt, writerSummaryPromptMsgid},
		{"WriterUpdateSummaryPrompt", WriterUpdateSummaryPrompt, writerUpdateSummaryPromptMsgid},
		{"WriterTurnPrefixPrompt", WriterTurnPrefixPrompt, writerTurnPrefixPromptMsgid},
	}
	for _, c := range cases {
		if want := i18n.F(c.msgid); c.got != want {
			t.Errorf("%s không lấy từ catalog: biến = %q, i18n.F(msgid) = %q", c.name, c.got, want)
		}
	}
}

// TestTieuDeMucGoiKhoiPhucTheoLocale: gói khôi phục sau nén phải dán nhãn mục
// bằng cùng ngôn ngữ với prompt nén.
//
// Vì sao đây là cặp phải kiểm cùng nhau: prompt ra lệnh cho LLM "dùng ĐÚNG định
// dạng ## Tiến độ hiện tại…", rồi ngay sau đó gói khôi phục dán nhãn cho đúng dữ
// liệu tiến độ ấy. Hai nhãn lệch ngôn ngữ thì mô hình thấy hai mục khác nhau cho
// một thứ, và lần nén sau tóm tắt sai chỗ. Không có lỗi nào nổ ra.
func TestTieuDeMucGoiKhoiPhucTheoLocale(t *testing.T) {
	s := seededWriterStore(t)

	t.Run("zh", func(t *testing.T) {
		datLocale(t, i18n.Chinese)
		text, ok, err := buildWriterRestoreText(s, restoreBudgetTokens)
		if err != nil || !ok {
			t.Fatalf("buildWriterRestoreText: ok=%v err=%v", ok, err)
		}
		heads := dongTieuDe(text)
		if len(heads) == 0 {
			t.Fatalf("không bóc được dòng tiêu đề nào từ:\n%s", text)
		}
		if !strings.Contains(text, "## 当前进度") {
			t.Errorf("zh phải giữ nhãn nguồn upstream, tiêu đề nhận được: %q", heads)
		}
	})

	t.Run("vi", func(t *testing.T) {
		datLocale(t, i18n.Vietnamese)
		text, ok, err := buildWriterRestoreText(s, restoreBudgetTokens)
		if err != nil || !ok {
			t.Fatalf("buildWriterRestoreText: ok=%v err=%v", ok, err)
		}
		heads := dongTieuDe(text)
		if len(heads) == 0 {
			t.Fatalf("không bóc được dòng tiêu đề nào từ:\n%s", text)
		}
		for _, h := range heads {
			if chuaChuHan(h) {
				t.Errorf("tiêu đề mục còn tiếng Trung ở locale vi: %q", h)
			}
		}

		// Nhãn tiến độ là nhãn duy nhất xuất hiện ở CẢ prompt nén lẫn gói khôi
		// phục, nên nó là điểm neo kiểm sự khớp nhau giữa hai bên.
		nhanTienDo := "## " + i18n.F("当前进度")
		if !strings.Contains(text, nhanTienDo) {
			t.Errorf("gói khôi phục thiếu nhãn %q, tiêu đề nhận được: %q", nhanTienDo, heads)
		}
		if !strings.Contains(i18n.F(writerSummaryPromptMsgid), nhanTienDo) {
			t.Errorf("prompt nén không còn ra lệnh dùng nhãn %q — prompt và gói khôi phục đã lệch nhau", nhanTienDo)
		}
	})
}
