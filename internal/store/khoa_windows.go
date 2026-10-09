//go:build windows

package store

import (
	"strconv"

	"golang.org/x/sys/windows"
)

// conSong cho biết PID này còn sống.
//
// # Vì sao không dùng os.FindProcess như bản Unix
//
// Trên Windows `os.FindProcess` LUÔN thành công với mọi PID, kể cả PID đã chết, và
// `Signal(0)` không có nghĩa gì. Dùng nguyên bản Unix ở đây sẽ cho kết quả "còn sống"
// cho mọi số — tức khóa mồ côi không bao giờ được dọn, và người dùng Windows bị chặn
// vĩnh viễn sau một lần máy sập.
//
// OpenProcess trả handle rồi hỏi mã thoát là phép thử thật: STILL_ACTIVE (259) nghĩa là
// còn chạy. PID đã chết thì OpenProcess lỗi.
//
// PID còn sống chưa có nghĩa là người giữ khóa còn sống — Windows tái dùng PID rất nhanh,
// nhất là sau khi khởi động lại máy. Phần đó do `mocKhoiDong` bên dưới và
// `tepKhoa.nguoiGiuConSong` (khoa.go) lo.
func conSong(pid int) bool {
	if pid <= 0 {
		return false
	}
	const stillActive = 259
	h, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, uint32(pid))
	if err != nil {
		return false
	}
	defer windows.CloseHandle(h)
	var ma uint32
	if err := windows.GetExitCodeProcess(h, &ma); err != nil {
		// Mở được handle mà không đọc được mã thoát → coi là còn sống. Hướng sai an toàn:
		// từ chối ghi thì mất tiện, cho hai process cùng ghi thì mất dữ liệu.
		return true
	}
	return ma == stillActive
}

// mocKhoiDong trả thời điểm tạo process (GetProcessTimes, đơn vị 100ns kể từ 1601) dạng
// chuỗi số. Mốc này cố định suốt đời process và hai process mang cùng PID không thể có cùng
// mốc, nên nó phân biệt được "đúng process đã lấy khóa" với "process khác mang lại số cũ".
func mocKhoiDong(pid int) (string, bool) {
	if pid <= 0 {
		return "", false
	}
	h, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, uint32(pid))
	if err != nil {
		return "", false
	}
	defer windows.CloseHandle(h)
	var tao, thoat, nhan, nguoiDung windows.Filetime
	if err := windows.GetProcessTimes(h, &tao, &thoat, &nhan, &nguoiDung); err != nil {
		return "", false
	}
	return strconv.FormatUint(uint64(tao.HighDateTime)<<32|uint64(tao.LowDateTime), 10), true
}
