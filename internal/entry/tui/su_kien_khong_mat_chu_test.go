package tui

import (
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/charmbracelet/bubbles/textarea"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/x/ansi"
	"github.com/huuhoa143/ainovel-studio/internal/host"
)

// TestSuKienDaiKhongMatChuOMoiBeRong chốt bản sửa một lỗi MẤT DỮ LIỆU.
//
// # Lỗi
//
// Nội dung luồng sự kiện được dàn cho bề rộng KHUNG (`centerW`) rồi nhồi vào
// viewport rộng `centerW - 2`. Nhánh ERROR tính `maxSumW = width - 12` với tiền tố
// đúng 12 cột, nên dòng đầu chiếm trọn bề rộng khung — vượt viewport 2 cột, và phần
// vượt bị cắt.
//
// Chỗ mất KHÔNG phải cái đuôi câu. Nó là ký tự cuối dòng đầu của một câu đang ngắt
// tiếp, nên nó nằm GIỮA TỪ và hai nửa dính liền lại thành một từ khác:
//
//	"chế độ nghiệm thu"       → "chế độ nghim thu"        (mất `ệ`)
//	"không có trong hàng đợi" → "không có rong hàng đợi"  (mất `t`)
//
// Ca thứ hai là ca tệ nhất: `rong` là một từ tiếng Việt thật nên câu vẫn đọc được và
// chỉ sai nghĩa. Người dùng sẽ báo đây là lỗi chính tả, không ai nghĩ tới layout.
//
// # Vì sao nó là lỗi do việt hóa đánh thức, không phải lỗi việt hóa gây ra
//
// Lỗi chỉ nổ khi dòng thật sự phải ngắt. Đo trên chính các chuỗi đã bắt lỗi: đường
// zh dài 45 cột trong khung 61–76 cột nên gần như không bao giờ chạm mốc ngắt, còn
// đường vi dài 75–99 cột nên chạm thường xuyên. Khuyết điểm có sẵn từ trước nhưng
// nằm im ở tiếng Trung.
//
// # Vì sao kiểm bằng phép GHÉP LẠI chứ không so số cột
//
// So số cột đòi biết chính xác bề rộng hiển thị của `✕` qua go-runewidth và bề dày
// viền khung — hai con số có thể đổi. Ghép các dòng lại rồi đòi ra đúng chuỗi gốc là
// bất biến ở mức nghĩa: không ký tự nào được biến mất, bất kể layout tính thế nào.
func TestSuKienDaiKhongMatChuOMoiBeRong(t *testing.T) {
	// Câu thật đã bắt được lỗi, giữ nguyên văn: nó có dấu hai tầng (`ệ`) và đủ dài
	// để chạm mốc ngắt ở các bề rộng dưới đây.
	const summary = "/next chỉ dùng cho chế độ nghiệm thu từng chương, hãy chạy /review on trước"

	events := []host.Event{{
		Time:     time.Now(),
		Category: "ERROR",
		Agent:    "engine",
		Summary:  summary,
	}}

	// Nhiều bề rộng vì lỗi phụ thuộc chỗ mốc ngắt rơi vào đâu trong câu: một bề rộng
	// may mắn có thể ngắt đúng khoảng trắng và không mất gì.
	for _, w := range []int{100, 110, 120, 130, 140, 150, 160} {
		m := Model{mode: modeRunning, textarea: textarea.New(), events: events}
		next, _ := m.Update(tea.WindowSizeMsg{Width: w, Height: 40})
		m = next.(Model)
		m.refreshEventViewport()

		hienRa := ansi.Strip(m.viewport.View())
		if !coDuChu(hienRa, summary) {
			t.Errorf("bề rộng %d: mất chữ khi ngắt dòng.\n  gốc  : %q\n  hiện : %q",
				w, summary, rutGon(hienRa))
		}
	}
}

var khoangTrang = regexp.MustCompile(`\s+`)

// coDuChu kiểm mọi ký tự-không-trắng của gốc còn đủ và đúng thứ tự trong phần hiện ra.
//
// Bỏ hết khoảng trắng ở cả hai bên trước khi so: khoảng trắng tại mốc ngắt bị mất là
// ĐÚNG (ngắt dòng ở khoảng trắng), và phần đệm đầu dòng tiếp là do layout thêm vào.
// Thứ duy nhất không được mất là chữ.
func coDuChu(hienRa, goc string) bool {
	return strings.Contains(
		khoangTrang.ReplaceAllString(hienRa, ""),
		khoangTrang.ReplaceAllString(goc, ""),
	)
}

func rutGon(s string) string {
	s = strings.TrimRight(s, " \n")
	if len(s) > 400 {
		return s[:400] + "…"
	}
	return s
}
