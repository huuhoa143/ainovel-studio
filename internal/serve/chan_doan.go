package serve

import (
	"net/http"

	"github.com/huuhoa143/ainovel-studio/internal/diag"
)

// Chẩn đoán — bản web của `/diag`.
//
// # Vì sao KHÔNG đòi engine đang mở
//
// `diag.Diagnose` chỉ đọc store, và đó là điểm mấu chốt: người dùng cần chẩn đoán ĐÚNG LÚC
// mọi thứ đang hỏng, kể cả khi engine không mở được. Bắt họ mở engine trước để chạy chẩn
// đoán là bắt điều kiện chẩn đoán phải thỏa mãn trước khi được chẩn đoán.
//
// # Vì sao trả JSON thay vì tệp markdown như TUI
//
// `diag.Export` ghi một tệp markdown đã tẩy thông tin nhạy cảm, để người dùng dán vào issue.
// Đó vẫn là việc đúng cho TUI, nhưng trên web thì bề mặt đọc được quan trọng hơn: người
// vận hành mở `/diag` để BIẾT tác phẩm đang thế nào, không phải để lấy một tệp.
//
// Nên route này trả cả hai: `report` có cấu trúc để giao diện vẽ, và `export_path` là tệp
// markdown đã ghi cho ai cần dán đi. `Diagnose` chỉ chạy MỘT lần — `WriteExport` nhận lại
// kết quả đã tính (chính vì việc đó mà upstream tách nó khỏi `Export`).
func (s *server) handleChanDoan(w http.ResponseWriter, r *http.Request) {
	st, err := s.openBook(r.PathValue("book"))
	if err != nil {
		writeErr(w, http.StatusNotFound, err)
		return
	}

	rep, rc := diag.Diagnose(st)
	// Ghi tệp là phụ: lỗi ở đây KHÔNG được che mất bản chẩn đoán vừa tính. Người dùng mở
	// route này để đọc kết quả, và một lỗi ghi đĩa (hết chỗ, chỉ đọc) sẽ biến một chẩn đoán
	// thành công thành một 500 trắng — đúng lúc họ cần nó nhất.
	duong, errGhi := diag.WriteExport(st, rep, rc)

	out := map[string]any{
		"report":  rep,
		"runtime": rc,
	}
	if errGhi != nil {
		out["export_error"] = errGhi.Error()
	} else {
		out["export_path"] = duong
	}
	writeJSON(w, out)
}
