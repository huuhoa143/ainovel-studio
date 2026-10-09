package host

import "testing"

// Bấm Dừng: lifecycle thành paused ngay, nhưng goroutine engine còn đang thoát và cửa khởi động
// vẫn đóng. Trạng thái nói ra phải là "pausing" cho tới khi goroutine thoát hẳn — báo "paused"
// sớm là mời bấm Tiếp tục viết vào một engine chắc chắn từ chối.
func TestTrangThaiBaoRa_DangThoatSauDungThiLaPausing(t *testing.T) {
	if got := trangThaiBaoRa(lifecyclePaused, true); got != "pausing" {
		t.Fatalf("goroutine còn chạy: muốn pausing, được %q", got)
	}
	if got := trangThaiBaoRa(lifecyclePaused, false); got != "paused" {
		t.Fatalf("goroutine đã thoát: muốn paused, được %q", got)
	}
	if got := trangThaiBaoRa(lifecycleRunning, true); got != "running" {
		t.Fatalf("đang chạy: muốn running, được %q", got)
	}
}
