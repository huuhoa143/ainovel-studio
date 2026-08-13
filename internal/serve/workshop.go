package serve

import (
	"os"
	"path/filepath"
	"sort"

	"github.com/huuhoa143/ainovel-studio/internal/store"
)

// scanWorkshop quét thư mục gốc để tìm mọi tác phẩm.
//
// Dấu hiệu nhận biết một tác phẩm là có meta/progress.json — đó là tệp sự thật
// mà Store.Init tạo ra. Dùng nó thay vì "có thư mục nào cũng tính" để thư mục
// rác hay thư mục đang tải dở không hiện lên như tác phẩm trống.
func scanWorkshop(root, only string) (*Workshop, error) {
	abs, err := filepath.Abs(root)
	if err != nil {
		abs = root
	}
	ws := &Workshop{Root: abs, Books: []Book{}}

	entries, err := os.ReadDir(root)
	if err != nil {
		if os.IsNotExist(err) {
			// Chưa có thư mục output là trạng thái hợp lệ của máy mới, không
			// phải lỗi — trả xưởng rỗng để giao diện hiện trạng thái trống.
			return ws, nil
		}
		return nil, err
	}

	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		id := e.Name()
		if only != "" && id != only {
			continue
		}
		dir := filepath.Join(root, id)
		if _, err := os.Stat(filepath.Join(dir, "meta", "progress.json")); err != nil {
			continue
		}

		st := store.NewStore(dir)
		p, err := st.Progress.Load()
		if err != nil || p == nil {
			continue
		}
		ws.Books = append(ws.Books, bookFrom(st, id, p, st.Checkpoints.All()))
	}

	// Đang chạy lên trước, rồi tới cập nhật gần nhất: thứ tự này khớp việc người
	// vận hành mở studio để xem "cái gì đang chạy".
	sort.SliceStable(ws.Books, func(i, j int) bool {
		a, b := ws.Books[i], ws.Books[j]
		if (a.Activity == "running") != (b.Activity == "running") {
			return a.Activity == "running"
		}
		if a.UpdatedAt != b.UpdatedAt {
			return a.UpdatedAt > b.UpdatedAt
		}
		return a.ID < b.ID
	})
	return ws, nil
}
