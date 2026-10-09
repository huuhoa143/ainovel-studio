//go:build darwin

package store

import (
	"strconv"

	"golang.org/x/sys/unix"
)

// mocKhoiDong trả thời điểm process bắt đầu (kern.proc.pid → p_starttime, micro giây) dạng
// chuỗi số. macOS cũng cấp lại PID nhỏ sau khi khởi động lại máy, và app desktop chạy ở đây —
// xem `tepKhoa.nguoiGiuConSong` (khoa.go) cho vì sao PID sống thôi là chưa đủ.
func mocKhoiDong(pid int) (string, bool) {
	if pid <= 0 {
		return "", false
	}
	kp, err := unix.SysctlKinfoProc("kern.proc.pid", pid)
	if err != nil || kp.Proc.P_pid != int32(pid) {
		return "", false
	}
	t := kp.Proc.P_starttime
	return strconv.FormatInt(int64(t.Sec)*1_000_000+int64(t.Usec), 10), true
}
