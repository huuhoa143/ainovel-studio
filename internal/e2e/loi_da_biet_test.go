package e2e

// Các test trong tệp này CHỐT HÀNH VI ĐANG SAI, không chốt hành vi đúng.
//
// Vì sao chúng tồn tại thay vì chỉ ghi vào báo cáo: bug tìm ra bằng test rồi để
// nguyên thì lần chạy sau không ai thấy nữa. Chốt lại thì hai điều được bảo đảm:
//
//  1. Bộ test chính (TestVongDoiSachTiengViet) vẫn XANH và vẫn chặn được lỗi rò
//     MỚI — nó chỉ tha đúng những chuỗi đã liệt kê ở đây, không tha cả lớp.
//  2. Khi ai đó SỬA, test ở đây ĐỎ. Đỏ ở đây là tin tốt: nó buộc người sửa quay
//     lại xóa mục tương ứng khỏi danh sách tha, nhờ vậy lớp bảo vệ chặt dần thay
//     vì lỏng mãi.
//
// KHÔNG được đọc các test này là "đã chấp nhận hành vi hiện tại". Chi tiết mức độ
// và cách sửa nằm ở docs/audit/e2e-report.md.

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/voocel/agentcore"
	"github.com/huuhoa143/ainovel-studio/internal/i18n"
	"github.com/huuhoa143/ainovel-studio/internal/tools"
)

// roDaBiet là các chuỗi tiếng Trung ĐANG bị tiêm nguyên văn vào ngữ cảnh của mô
// hình qua giá trị trả về của tool. Đây là chữ mà MÔ HÌNH đọc và làm theo, không
// phải chuỗi giao diện — nên hậu quả không phải "hiển thị xấu" mà là mô hình được
// chỉ dẫn bằng tiếng Trung ngay giữa một phiên tiếng Việt.
//
// Chúng bị bỏ sót vì cùng một lý do rất cụ thể: `next_step` của edit_chapter ĐÃ
// được bọc i18n.F, còn của plan_chapter và draft_chapter thì không. Bộ đo độ phủ
// bản dịch chỉ đếm trên catalog, nên chuỗi chưa bọc là chuỗi vô hình với nó.
//
// # Danh sách này giờ RỖNG, và đó là trạng thái đích
//
// Cả hai mục đã được sửa (bọc i18n.F ở plan_chapter.go:97 và draft_chapter.go:119,
// 136). Chính bài kiểm dưới đây phát hiện ra và đòi xóa mục — đúng như nó được
// thiết kế: sổ ngoại lệ phải tự đỏ khi ngoại lệ hết còn đúng, nếu không nó biến
// thành chỗ chôn lỗi vĩnh viễn.
//
// Rỗng có ý nghĩa cụ thể chứ không phải để trống cho đẹp: `boLoRoDaBiet` giờ là
// hàm không làm gì, nên `TestVongDoiSachTiengViet` kiểm trên chuỗi ĐẦY ĐỦ, không
// còn được tha chỗ nào. Thêm mục vào đây là nới lỏng bài kiểm đó — chỉ làm khi có
// lý do ghi rõ tại chỗ, và mặc định là sửa lỗi thay vì ghi vào sổ.
var roDaBiet = []struct {
	nguon string // file:dòng
	chuoi string
}{}

// boLoRoDaBiet xóa các chuỗi rò đã biết khỏi s để phần kiểm còn lại chỉ bắt lỗi
// MỚI. Cố tình xóa theo chuỗi chính xác chứ không theo pattern: tha cả pattern
// thì lần rò sau cũng lọt.
func boLoRoDaBiet(s string) string {
	for _, r := range roDaBiet {
		// JSON encode chuỗi trong tool result, nên khớp cả bản thô và bản đã escape.
		s = strings.ReplaceAll(s, r.chuoi, "")
	}
	return s
}

// TestLoiDaBiet_ToolRoTiengTrungVaoNguCanhModel gọi CHÍNH hai tool đó rồi đọc
// trường next_step trong kết quả — kiểm hành vi, không kiểm mã nguồn.
//
// Điểm đáng chú ý nhất: bản dịch tiếng Việt của cả hai chuỗi ĐÃ CÓ trong catalog.
// Bug không phải "chưa dịch" mà là "điểm gọi không tra catalog" — sửa bằng cách
// bọc i18n.F quanh chuỗi, không phải dịch thêm gì. Test khẳng định cả hai mặt:
// bản dịch có sẵn, mà giá trị lúc chạy vẫn là tiếng Trung.
func TestLoiDaBiet_ToolRoTiengTrungVaoNguCanhModel(t *testing.T) {
	if err := i18n.SetLocale(i18n.Vietnamese); err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	st := dungSanStore(t, dir)

	buoc := func(ten string, tool agentcore.Tool, args any) string {
		t.Helper()
		raw, err := json.Marshal(args)
		if err != nil {
			t.Fatal(err)
		}
		out, err := tool.Execute(context.Background(), raw)
		if err != nil {
			t.Fatalf("%s: %v", ten, err)
		}
		var kq struct {
			NextStep string `json:"next_step"`
		}
		if err := json.Unmarshal(out, &kq); err != nil {
			t.Fatalf("%s: giải mã kết quả: %v", ten, err)
		}
		return kq.NextStep
	}

	nextPlan := buoc("plan_chapter", tools.NewPlanChapterTool(st), map[string]any{
		"chapter": 1, "title": tenChuong[0],
		"goal": "Mở truyện", "conflict": "Người lạ tới bến", "hook": "Bỏ lửng",
	})
	nextDraft := buoc("draft_chapter", tools.NewDraftChapterTool(st), map[string]any{
		"chapter": 1, "mode": "write", "content": chuongSach[0],
	})

	for _, c := range []struct {
		nguon, next string
	}{
		{"internal/tools/plan_chapter.go:97", nextPlan},
		{"internal/tools/draft_chapter.go:119,136", nextDraft},
	} {
		if c.next == "" {
			t.Errorf("%s: không đọc được next_step — cấu trúc kết quả đã đổi, cập nhật test", c.nguon)
			continue
		}
		// Khẳng định đã ĐẢO CHIỀU: trước đây bài kiểm này ghi nhận lỗi còn tồn tại,
		// giờ nó chặn lỗi quay lại. Phép đo không đổi — vẫn gọi tool thật rồi đọc
		// next_step, tức kiểm hành vi chứ không kiểm mã nguồn, nên nó vẫn bắt được
		// cả trường hợp ai đó bọc i18n.F mà lại đưa msgid sai.
		if coChuHanTrong(c.next) {
			t.Errorf("%s: next_step gửi cho MÔ HÌNH còn tiếng Trung: %q\n"+
				"Đây là chữ mô hình đọc rồi làm theo, không phải chuỗi giao diện — để tiếng Trung ở đây\n"+
				"là trộn ngôn ngữ vào đúng chỗ ta đang bảo mô hình đừng trộn. Bọc i18n.F quanh chuỗi;\n"+
				"bản dịch gần như chắc chắn đã có sẵn trong catalog.", c.nguon, c.next)
			continue
		}
		t.Logf("%s: next_step gửi cho mô hình = %q", c.nguon, c.next)
	}
}

// Hai lỗi còn lại của lớp này — non_cjk_fragments báo oan trên văn Latin, và
// bảng từ gây mỏi phân biệt hoa/thường — được chốt ở antitone_vi_test.go
// (TestToneLintKhongBaoBuaTrenVanTiengViet, TestToneTuGayMoiBatCaKhiVietHoaDauCau)
// theo lối khẳng định NGƯỢC: các test đó ĐỎ cho tới khi bug được sửa. Cố tình
// không chốt lại ở đây: hai test nói hai điều trái nhau về cùng một hành vi trong
// cùng một package là cách chắc chắn nhất để cả hai bị bỏ qua.
