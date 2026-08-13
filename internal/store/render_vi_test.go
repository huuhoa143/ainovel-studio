package store

import (
	"strings"
	"testing"

	"github.com/huuhoa143/ainovel-studio/internal/domain"
	"github.com/huuhoa143/ainovel-studio/internal/i18n"
)

// i18n_locale_pin_test.go ghim cả package này về locale=zh và đã nói rõ đánh đổi:
// các test ở đây KHÔNG kiểm đường tiếng Việt của Markdown do store kết xuất. File
// này bù đúng khoảng mù đó cho các hàm render*.
//
// Vì sao cần: hai lớp lỗi vừa sửa đều vô hình với mọi bộ đo hiện có.
//   - Tiêu đề "# 时间线\n\n" trước đây không bọc i18n: catalog ĐÃ có bản dịch mà
//     sản phẩm vẫn in tiếng Trung. Bộ đối chiếu verb không thấy (không có verb),
//     thống kê độ phủ catalog cũng không thấy (khóa vẫn nằm đó, "đã dịch").
//   - Dấu nối "、" và ngoặc toàn phần "（）" không phải msgid nên không nằm trong
//     catalog: mọi phép đo dựa trên catalog đều bỏ sót cả lớp lỗi này.
//
// Cả hai chỉ lộ ra khi chạy ở locale vi thật rồi ĐỌC chuỗi kết xuất — nên test này
// làm đúng việc đó thay vì so lại với hằng số trong code.
func withLocaleVI(t *testing.T) {
	t.Helper()
	prev := i18n.Active()
	if err := i18n.SetLocale(i18n.Vietnamese); err != nil {
		t.Fatalf("SetLocale(vi): %v", err)
	}
	t.Cleanup(func() { _ = i18n.SetLocale(prev) })
}

// cjkPunct là các dấu câu toàn phần không được xuất hiện trong Markdown tiếng
// Việt. Không gồm 『』 vì đó là ngoặc trích mẫu câu tiếng Trung, được giữ có chủ ý.
const cjkPunct = "，。、：（）"

func assertNoCJKPunct(t *testing.T, what, md string) {
	t.Helper()
	for _, r := range cjkPunct {
		if strings.ContainsRune(md, r) {
			t.Errorf("%s còn dấu câu toàn phần %q ở locale vi:\n%s", what, string(r), md)
		}
	}
}

func TestRenderViKhongConTiengTrung(t *testing.T) {
	withLocaleVI(t)

	t.Run("timeline", func(t *testing.T) {
		md := renderTimeline([]domain.TimelineEvent{
			{Chapter: 1, Time: "đêm", Event: "Lửa cháy bến sông",
				Characters: []string{"Lâm Vũ", "Trần Nhi"}},
		})
		if !strings.HasPrefix(md, "# Dòng thời gian\n\n") {
			t.Errorf("tiêu đề chưa dịch: %q", md)
		}
		// Dấu nối phải là ", ", ngoặc phải ASCII, và phải có khoảng trắng trước
		// ngoặc mở: tiếng Trung viết 事件（A、B） không cần space vì （ là dấu toàn
		// phần, tiếng Việt thì cần. Khoảng trắng đó nằm trong bản dịch của msgid
		// "（%s）" nên chỉ chốt được bằng cách đọc chuỗi kết xuất ở locale vi.
		if !strings.Contains(md, "Lửa cháy bến sông (Lâm Vũ, Trần Nhi)") {
			t.Errorf("danh sách nhân vật sai dấu nối/ngoặc/khoảng trắng: %q", md)
		}
		assertNoCJKPunct(t, "renderTimeline", md)
	})

	t.Run("characters", func(t *testing.T) {
		md := renderCharacters([]domain.Character{
			{Name: "Lâm Vũ", Role: "protagonist", Description: "Thợ rèn trẻ",
				Arc: "từ thợ rèn thành thủ lĩnh", Traits: []string{"gan", "nóng tính"}},
		})
		if !strings.HasPrefix(md, "# Hồ sơ nhân vật\n\n") {
			t.Errorf("tiêu đề chưa dịch: %q", md)
		}
		if !strings.Contains(md, "## Lâm Vũ (protagonist)") {
			t.Errorf("ngoặc phải là ASCII: %q", md)
		}
		if !strings.Contains(md, "gan, nóng tính") {
			t.Errorf("đặc điểm sai dấu nối: %q", md)
		}
		assertNoCJKPunct(t, "renderCharacters", md)
	})

	t.Run("outline", func(t *testing.T) {
		md := renderOutline([]domain.OutlineEntry{
			{Chapter: 1, Title: "Bến cũ", CoreEvent: "Gặp lại người xưa",
				Hook: "Ai đốt thuyền?", Scenes: []string{"Bến sông lúc rạng đông"}},
		})
		if !strings.HasPrefix(md, "# Dàn ý\n\n") {
			t.Errorf("tiêu đề chưa dịch: %q", md)
		}
		if !strings.Contains(md, "**Cảnh**") {
			t.Errorf("nhãn cảnh chưa dịch: %q", md)
		}
		assertNoCJKPunct(t, "renderOutline", md)
	})

	t.Run("layered_outline", func(t *testing.T) {
		md := renderLayeredOutline([]domain.VolumeOutline{
			{Index: 1, Title: "Khởi", Theme: "mất mát", Arcs: []domain.ArcOutline{
				{Index: 1, Title: "Bến cũ", Goal: "tìm người đốt thuyền", EstimatedChapters: 3},
			}},
		})
		if !strings.HasPrefix(md, "# Dàn ý phân cấp\n\n") {
			t.Errorf("tiêu đề chưa dịch: %q", md)
		}
		assertNoCJKPunct(t, "renderLayeredOutline", md)
	})

	t.Run("foreshadow", func(t *testing.T) {
		md := renderForeshadow([]domain.ForeshadowEntry{
			{ID: "F1", Description: "Vết cháy trên mạn thuyền", PlantedAt: 1, Status: "open"},
		})
		if !strings.HasPrefix(md, "# Sổ theo dõi phục bút\n\n") {
			t.Errorf("tiêu đề chưa dịch: %q", md)
		}
		assertNoCJKPunct(t, "renderForeshadow", md)
	})

	t.Run("relationships", func(t *testing.T) {
		md := renderRelationships([]domain.RelationshipEntry{
			{CharacterA: "Lâm Vũ", CharacterB: "Trần Nhi", Relation: "bạn cũ", Chapter: 1},
		})
		if !strings.HasPrefix(md, "# Quan hệ nhân vật\n\n") {
			t.Errorf("tiêu đề chưa dịch: %q", md)
		}
		assertNoCJKPunct(t, "renderRelationships", md)
	})

	t.Run("world_rules", func(t *testing.T) {
		md := renderWorldRules([]domain.WorldRule{
			{Category: "magic", Rule: "Phép hút tinh thần lực", Boundary: "Cạn thì ngất"},
		})
		if !strings.HasPrefix(md, "# Quy tắc thế giới quan\n\n") {
			t.Errorf("tiêu đề chưa dịch: %q", md)
		}
		assertNoCJKPunct(t, "renderWorldRules", md)
	})
}
