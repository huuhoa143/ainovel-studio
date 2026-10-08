package serve

import (
	"errors"
	"strings"
	"testing"
)

// Một phiên RẢNH (truyện đã xong, hay đang dừng ở cửa duyệt) không được chắn đường mở truyện
// khác — ca đo được: viết xong một truyện, bấm "Viết truyện mới" thì bị từ chối.
func TestNhuongCho_PhienRanhDuocDongDeNhuongSuat(t *testing.T) {
	cu, cuDong := docMay, dongPhien
	t.Cleanup(func() { docMay, dongPhien = cu, cuDong })
	dongPhien = func(*phienMay) {}
	docMay = func(*phienMay) (string, string) { return "completed", "Truyện cũ" }

	may := boMayThu(t, t.TempDir())
	may.dang["cu"] = &phienMay{id: "cu", hoi: &cauNoiHoi{}}
	if err := may.nhuongCho(); err != nil {
		t.Fatalf("phiên rảnh mà không nhường: %v", err)
	}
	if len(may.dang) != 0 {
		t.Errorf("phiên rảnh vẫn giữ suất: %v", may.dang)
	}
}

// Vế ngược: phiên đang viết thì GIỮ suất, và lời từ chối nêu tên truyện đang viết.
func TestNhuongCho_PhienDangVietGiuSuatVaNeuTen(t *testing.T) {
	cu, cuDong := docMay, dongPhien
	t.Cleanup(func() { docMay, dongPhien = cu, cuDong })
	dongPhien = func(*phienMay) {}
	docMay = func(*phienMay) (string, string) { return "running", "Người Lái Đò" }

	may := boMayThu(t, t.TempDir())
	may.dang["do"] = &phienMay{id: "do", hoi: &cauNoiHoi{}}
	err := may.nhuongCho()
	if !errors.Is(err, errQuaNhieuMay) {
		t.Fatalf("muốn errQuaNhieuMay, được %v", err)
	}
	if !strings.Contains(err.Error(), "Người Lái Đò") {
		t.Errorf("lời từ chối không nêu truyện đang giữ: %q", err)
	}
	if len(may.dang) != 1 {
		t.Error("phiên đang viết bị đóng ngầm")
	}
}
