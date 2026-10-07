//go:build !windows && !darwin

package store

// mocKhoiDong: chưa đọc mốc khởi động trên các hệ khác (Linux không phải đích của app
// desktop). Không có mốc thì tệp khóa chỉ mang PID và `tepKhoa.nguoiGiuConSong` giữ luật cũ.
func mocKhoiDong(int) (string, bool) { return "", false }
