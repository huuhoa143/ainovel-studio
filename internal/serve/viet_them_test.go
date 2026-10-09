package serve

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/huuhoa143/ainovel-studio/internal/domain"
	"github.com/huuhoa143/ainovel-studio/internal/store"
)

// Góp ý trên truyện ĐÃ KẾT mà engine chưa mở phải tự mở engine, không trả "chưa mở engine".
//
// Đây là cả luồng "Viết thêm": truyện xong thì thanh dưới KHÔNG còn nút mở phiên nào, nên
// một câu "tác phẩm này chưa mở engine" là ngõ cụt — người dùng không có cách nào làm theo.
// Ngược lại, truyện CHƯA kết thì câu ấy đúng và phải giữ: ở đó có nút Viết tiếp để bấm.
func TestDaKetTrenDia(t *testing.T) {
	root := t.TempDir()

	viet := func(id string, phase domain.Phase) {
		dir := filepath.Join(root, id)
		if err := os.MkdirAll(filepath.Join(dir, "meta"), 0o755); err != nil {
			t.Fatal(err)
		}
		st := store.NewStore(dir)
		if err := st.Progress.Save(&domain.Progress{Phase: phase, NovelName: id}); err != nil {
			t.Fatal(err)
		}
	}
	viet("da-ket", domain.PhaseComplete)
	viet("dang-viet", domain.PhaseWriting)

	b := boMayThu(t, root)
	if !b.daKetTrenDia("da-ket") {
		t.Error("truyện phase=complete phải được coi là đã kết")
	}
	if b.daKetTrenDia("dang-viet") {
		t.Error("truyện đang viết không được coi là đã kết")
	}
	// Không đọc được thì ngã về false — không mở engine vì đọc hụt một tệp.
	if b.daKetTrenDia("khong-ton-tai") {
		t.Error("truyện không tồn tại phải trả false")
	}

	// Vế còn lại của luật: truyện chưa kết + engine chưa mở vẫn là "chưa mở engine".
	if _, err := b.canThiep("dang-viet", "thêm một đoạn"); !errors.Is(err, errChuaMoMay) {
		t.Errorf("truyện chưa kết phải trả errChuaMoMay, có %v", err)
	}

	// Và truyện ĐÃ kết phải ĐI QUA chốt ấy để mở engine. Không dựng engine thật trong bài
	// kiểm — chặn ở bước đọc cấu hình là đủ để chứng minh nó đã rẽ sang nhánh `mo`.
	b.dang = map[string]*phienMay{}
	b.soToiDa = 1
	if err := os.WriteFile(b.cauHinh, []byte("{ hỏng"), 0o600); err != nil {
		t.Fatal(err)
	}
	_, err := b.canThiep("da-ket", "viết thêm một chương")
	if errors.Is(err, errChuaMoMay) {
		t.Fatal("truyện đã kết vẫn bị chặn ở 'chưa mở engine' — luồng Viết thêm chết")
	}
	if err == nil || !strings.Contains(err.Error(), "đọc cấu hình") {
		t.Errorf("phải đi tới bước mở engine, có %v", err)
	}
}
