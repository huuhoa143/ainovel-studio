package e2e

// VIỆC 4: đường headless — kiểm những gì kiểm được mà không cần LLM thật.
//
// Đường headless không có giao diện để đọc lại, không có chỗ nào hiện gợi ý, và
// hay được gọi từ script/cron. Nên với nó, CHẤT LƯỢNG THÔNG BÁO LỖI chính là toàn
// bộ trải nghiệm khi có sự cố: thông báo không nói được "làm gì tiếp" nghĩa là
// người dùng bế tắc, không phải bất tiện.
//
// Test ở đây gọi trực tiếp headless.Run thay vì spawn binary: cùng một hàm mà
// cmd/ainovel-cli gọi, nhưng bắt được error trả về nguyên dạng thay vì phải dò
// chuỗi trên stderr. Output của binary thật (đã chạy tay) nằm ở
// docs/audit/e2e-report.md phần D.

import (
	"strings"
	"testing"

	"github.com/huuhoa143/ainovel-studio/assets"
	"github.com/huuhoa143/ainovel-studio/internal/entry/headless"
	"github.com/huuhoa143/ainovel-studio/internal/i18n"
)

// TestHeadlessBaoLoiKhoaSaiBangTiengViet: khóa API sai (401 từ provider) phải
// thành một thông báo tiếng Việt, không phải một stack trace hay chuỗi tiếng Trung.
//
// Server giả trả đúng 401 kèm body kiểu OpenRouter, nên đường đi qua litellm →
// agentcore → arbiter → headless giống hệt ca khóa hết hạn thật.
func TestHeadlessBaoLoiKhoaSaiBangTiengViet(t *testing.T) {
	if err := i18n.SetLocale(i18n.Vietnamese); err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	f := newFakeLLM(t, func(call) reply {
		t.Error("script không nên được gọi: server phải trả 401 trước khi tới đây")
		return textReply("")
	})
	f.tuChoi401 = true

	var out, errOut strings.Builder
	err := headless.Run(cauHinh(t, dir, f.baseURL()), assets.Load("default", assets.LoadOptions{}),
		headless.Options{
			Prompt: "Viết truyện ngắn 3 chương về người gác cầu đá",
			Stdin:  strings.NewReader(""),
			Stdout: &out,
			Stderr: &errOut,
		})

	if err == nil {
		t.Fatal("khóa sai mà headless.Run không trả lỗi — script gọi nó sẽ tưởng đã thành công")
	}
	msg := err.Error()
	if coChuHanTrong(msg) {
		t.Errorf("thông báo lỗi còn chữ Hán quanh: %q\n  toàn văn: %s", viTriChuHan(msg), msg)
	}
	// Phải nêu được nguyên nhân gốc, không được nuốt mất: người dùng cần biết đây
	// là lỗi xác thực chứ không phải lỗi mạng hay lỗi ổ đĩa.
	if !strings.Contains(msg, "401") && !strings.Contains(strings.ToLower(msg), "auth") {
		t.Errorf("thông báo không nêu được nguyên nhân xác thực: %q", msg)
	}
	t.Logf("headless + khóa sai → %s", msg)

	// Ghi lại phần KHÔNG đạt: thông báo chỉ nói "thất bại" và dán lỗi provider,
	// không nói người dùng phải làm gì. Đây là khẳng định đặc tả hành vi đang
	// thiếu — nó ĐỎ khi ai đó thêm gợi ý, và khi ấy phải đổi thành khẳng định
	// ngược (xem đầu loi_da_biet_test.go về lý do chốt kiểu này).
	coGoiY := false
	for _, dau := range []string{"kiểm", "hãy", "vui lòng", "chạy", "cấu hình"} {
		if strings.Contains(strings.ToLower(msg), dau) {
			coGoiY = true
			break
		}
	}
	if coGoiY {
		t.Errorf("thông báo ĐÃ có gợi ý hành động (%q) — hãy đổi test này thành khẳng định ngược "+
			"và cập nhật docs/audit/e2e-report.md mục D", msg)
	} else {
		// Đối chứng: cùng một nguyên nhân, nhưng đi đường KHÔI PHỤC thì engine phát
		// một thông báo có gợi ý (internal/host/engine.go:336). Nghĩa là câu gợi ý
		// đã có sẵn, chỉ đường khởi động lần đầu (host.go:356) là không dùng nó.
		goiYCoSan := i18n.F("启动裁定失败,已暂停(请检查模型/网络配置后继续): ")
		if coChuHanTrong(goiYCoSan) {
			t.Errorf("msgid đối chứng không tra được trong catalog (%q) — "+
				"chuỗi trong engine.go:336 đã đổi, cập nhật test", goiYCoSan)
		}
		t.Logf("xác nhận thiếu sót: thông báo nêu nguyên nhân nhưng KHÔNG nói làm gì tiếp.\n"+
			"  Đường khôi phục cho cùng nguyên nhân thì có: %q", goiYCoSan)
	}
}

// TestHeadlessThieuCauHinhBaoRoRang: thiếu prompt và cũng không có phiên nào để
// khôi phục — đây là ca người dùng gõ sai lệnh, và thông báo phải chỉ ra đường ra.
func TestHeadlessThieuCauHinhBaoRoRang(t *testing.T) {
	if err := i18n.SetLocale(i18n.Vietnamese); err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	f := newFakeLLM(t, func(call) reply { return textReply("") })

	var out, errOut strings.Builder
	err := headless.Run(cauHinh(t, dir, f.baseURL()), assets.Load("default", assets.LoadOptions{}),
		headless.Options{Stdin: strings.NewReader(""), Stdout: &out, Stderr: &errOut})

	if err == nil {
		t.Fatal("không có prompt và không có phiên cũ thì phải báo lỗi")
	}
	msg := err.Error()
	if coChuHanTrong(msg) {
		t.Errorf("thông báo còn chữ Hán quanh: %q\n  toàn văn: %s", viTriChuHan(msg), msg)
	}
	// Ca này ĐẠT yêu cầu "nói được làm gì tiếp": nó nêu cả hai đường ra
	// (truyền --prompt, hoặc trỏ vào thư mục đã có phiên).
	if !strings.Contains(msg, "--prompt") {
		t.Errorf("thông báo không chỉ ra đường ra (--prompt): %q", msg)
	}
	t.Logf("headless thiếu prompt → %s", msg)
}
