package assets

import (
	"strings"
	"testing"

	"github.com/huuhoa143/ainovel-studio/internal/i18n"
	"github.com/huuhoa143/ainovel-studio/internal/stylestat"
)

// TestAntiAIToneCoversEveryCountedPattern giữ hai lớp chống giọng AI khớp nhau.
//
// Phân vai: stylestat chỉ ĐẾM sự kiện (`episodic_memory.style_stats`), còn
// references/anti-ai-tone.md là nơi Writer đọc để tự tránh và Editor đọc để có
// tiêu chí phán. Nếu stylestat đếm một lớp mà tài liệu không có mục tương ứng
// thì con số cứ tăng mà không ai có căn cứ để ra issue: chỉ số đỏ mà không ai
// sửa, đúng kiểu lỗi không phát ra tiếng. Test này chặn chiều đó — thêm lớp vào
// viPatternDefs mà quên viết mục trong tài liệu là đỏ ngay.
//
// Ghép theo NHÃN (phần trước dấu mở ví dụ) chứ không theo cả tên: phần ví dụ là
// minh họa cho người đọc báo cáo, sửa ví dụ không nên làm test đỏ.
//
// Nhận CẢ HAI dấu mở ví dụ vì hai ngôn ngữ dùng hai dấu khác nhau: nhãn zh giữ
// 『』 đúng nguyên văn upstream, còn nhãn vi dùng ( ) vì 『』 là dấu tiếng
// Nhật/Trung, lạc trong chữ Việt. Nếu chỉ nhận một dấu thì bộ cắt trả về cả phần
// ví dụ, và phép Contains bên dưới gần như luôn trượt — test đỏ oan hàng loạt và
// hợp đồng này mất tác dụng.
func TestAntiAIToneCoversEveryCountedPattern(t *testing.T) {
	prev := i18n.Active()
	if err := i18n.SetLocale(i18n.Vietnamese); err != nil {
		t.Fatalf("SetLocale(vi): %v", err)
	}
	t.Cleanup(func() { _ = i18n.SetLocale(prev) })

	names := stylestat.PatternNames()
	if len(names) == 0 {
		t.Fatal("stylestat không khai báo lớp mẫu nào cho tiếng Việt")
	}

	doc := mustRead(referencesFS, "references/anti-ai-tone.md")
	for _, name := range names {
		label := nhanCua(name)
		if !strings.Contains(doc, label) {
			t.Errorf("anti-ai-tone.md thiếu mục cho lớp đếm %q (nhãn %q): "+
				"stylestat đếm tật này mà tài liệu không dạy tránh", name, label)
		}
	}
}

// nhanCua cắt tên lớp mẫu tại dấu mở phần ví dụ, nhận cả dạng zh (『) và dạng vi
// ( () — xem lý do ở chú thích của TestAntiAIToneCoversEveryCountedPattern.
//
// Lấy dấu XUẤT HIỆN SỚM NHẤT thay vì thử lần lượt: nếu phần ví dụ tiếng Việt có
// chứa 『 (trích mẫu câu tiếng Trung) thì thử 『 trước sẽ cắt sai chỗ.
func nhanCua(name string) string {
	cat := -1
	for _, dau := range []string{"『", " ("} {
		if i := strings.Index(name, dau); i >= 0 && (cat < 0 || i < cat) {
			cat = i
		}
	}
	if cat < 0 {
		return strings.TrimSpace(name)
	}
	return strings.TrimSpace(name[:cat])
}

// TestNhanCuaCatDungCaHaiDangDau chống chính lớp lỗi mà nhanCua sinh ra để tránh:
// một bộ cắt chỉ nhận một dấu sẽ trả về cả phần ví dụ, và phép Contains ở test
// trên gần như luôn trượt.
func TestNhanCuaCatDungCaHaiDangDau(t *testing.T) {
	for _, c := range []struct{ vao, ra string }{
		{"Câu chỉnh nghĩa (không phải… mà là…)", "Câu chỉnh nghĩa"},
		{"矫正句『不是…(而)是…』", "矫正句"},
		{"Không có ví dụ", "Không có ví dụ"},
		// Ví dụ tiếng Việt trích mẫu câu tiếng Trung: phải cắt ở " (" đứng trước,
		// không phải ở 『 nằm sâu bên trong.
		{"Nhãn vi (trích 『原文』 minh họa)", "Nhãn vi"},
	} {
		if got := nhanCua(c.vao); got != c.ra {
			t.Errorf("nhanCua(%q) = %q, muốn %q", c.vao, got, c.ra)
		}
	}
}

// TestAntiAIToneKeepsAgentNamesInEnglish chặn việc dịch tên agent trong tài liệu.
//
// `Writer` / `Editor` là tên agent, khớp với tên trong code và trong các prompt
// khác; dịch thành "Người viết" / "Biên tập viên" thì tài liệu và hệ thống gọi
// hai thứ khác tên nhau. `aesthetic` là giá trị enum thật mà save_review nhận
// (domain.Review.Dimension so khớp đúng từng ký tự), nên phải còn nguyên literal.
func TestAntiAIToneKeepsAgentNamesInEnglish(t *testing.T) {
	doc := mustRead(referencesFS, "references/anti-ai-tone.md")
	for _, want := range []string{"Writer", "Editor", "aesthetic"} {
		if !strings.Contains(doc, want) {
			t.Errorf("anti-ai-tone.md phải giữ nguyên định danh %q", want)
		}
	}
	for _, banned := range []string{"Người viết", "Biên tập viên"} {
		if strings.Contains(doc, banned) {
			t.Errorf("anti-ai-tone.md dịch tên agent thành %q — phải giữ tiếng Anh", banned)
		}
	}
}
