package serve

import (
	"fmt"
	"hash/fnv"
	"io/fs"
	"os"
	"path/filepath"
	"sync"

	"github.com/huuhoa143/ainovel-studio/internal/host/imp"
	"github.com/huuhoa143/ainovel-studio/internal/store"
)

// Lượt nhập truyện đang dở của một cuốn, chiếu lên snapshot để giao diện hiện ĐÚNG nút cần bấm
// mà không phải đoán từ chữ trong nhật ký.
//
// Ba pha là ba chỗ bộ máy nhập dừng chờ người (imp.NextAction), gộp theo việc người dùng phải
// làm, không theo từng công đoạn bên trong:
//
//	awaiting_confirm  → «Chấp nhận cách chia chương» (POST /import, không tệp, accept=true)
//	story_uncertain   → chọn «Truyện gốc đã kết» / «Truyện gốc còn viết tiếp» rồi «Tiếp tục nhập»
//	interrupted       → «Tiếp tục nhập» (đứt giữa chừng ở bất kỳ công đoạn tự động nào); có
//	                    `error` khi thư mục nhập hỏng — lúc đó chỉ còn «Bỏ lượt nhập dở»
//
// Ở mọi pha, «Bỏ lượt nhập dở» (POST /import/discard) đều dùng được. Không có lượt nhập nào, hoặc
// lượt nhập đã xong (thư mục nhập còn lại làm hồ sơ), thì `null`.
const (
	PhaNhapChoXacNhan = "awaiting_confirm"
	PhaNhapChuaRoKet  = "story_uncertain"
	PhaNhapBiNgat     = "interrupted"
)

// TrangThaiNhap là trường `import` của snapshot.
type TrangThaiNhap struct {
	Pha string `json:"phase"`
	// SoChuong là số chương của cách chia hiện tại (0 = chưa chia xong); DaPhanTich là số chương
	// đã phân tích liên tục từ chương 1.
	SoChuong   int `json:"chapters"`
	DaPhanTich int `json:"analyzed"`
	// Loi là lý do thư mục nhập hỏng (pha interrupted): chạy tiếp sẽ không được, chỉ bỏ được.
	Loi string `json:"error,omitempty"`
}

// boNhoNhap ghi nhớ kết quả theo dấu vết đĩa. Tính pha phải băm lại tệp nguồn và từng chương
// đã phân tích (imp.LoadState), mà snapshot được hỏi theo chu kỳ — và với cuốn đã nhập xong,
// thư mục nhập còn lại vĩnh viễn làm hồ sơ. Không nhớ thì mỗi nhịp hỏi băm lại cả cuốn.
var boNhoNhap sync.Map // thư mục truyện → daNhoNhap

type daNhoNhap struct {
	dauVet string
	kq     *TrangThaiNhap
}

func trangThaiNhap(st *store.Store) *TrangThaiNhap {
	ws := imp.OpenWorkspace(st.Dir())
	if !ws.Active() {
		return nil
	}
	dv := dauVetNhap(st.Dir())
	if c, ok := boNhoNhap.Load(st.Dir()); ok && c.(daNhoNhap).dauVet == dv {
		return c.(daNhoNhap).kq
	}
	kq := tinhTrangThaiNhap(st, ws)
	boNhoNhap.Store(st.Dir(), daNhoNhap{dauVet: dv, kq: kq})
	return kq
}

func tinhTrangThaiNhap(st *store.Store, ws *imp.Workspace) *TrangThaiNhap {
	f, err := imp.CollectFacts(st, ws)
	if err != nil {
		return &TrangThaiNhap{Pha: PhaNhapBiNgat, Loi: err.Error()}
	}
	kq := &TrangThaiNhap{SoChuong: f.ExpectedChapters, DaPhanTich: f.AnalyzedChapters}
	switch imp.NextAction(f) {
	case imp.ActionDone:
		return nil
	case imp.ActionAwaitConfirmation:
		kq.Pha = PhaNhapChoXacNhan
	case imp.ActionAwaitStoryResolution:
		kq.Pha = PhaNhapChuaRoKet
	default:
		kq.Pha = PhaNhapBiNgat
		// Thư mục nhập có mà thiếu bộ ba nhận diện (manifest/source/intent): bộ máy nhập không chạy
		// tiếp được và cũng không cho nhập tệp mới — chỉ còn đường bỏ đi. Cùng câu bộ máy nhập báo.
		if !f.WorkspaceReady {
			kq.Loi = imp.LoiThuMucHong()
		}
	}
	return kq
}

// dauVetNhap là dấu vết rẻ (chỉ stat) của mọi thứ CollectFacts đọc: cây meta/import và ba tệp
// của kho chính mà phép đối chiếu "đã công bố" dùng. Đổi tên, cỡ hay mốc sửa của bất kỳ tệp
// nào là đổi dấu vết.
func dauVetNhap(dir string) string {
	h := fnv.New64a()
	ghi := func(p string, fi fs.FileInfo) {
		fmt.Fprintf(h, "%s|%d|%d\n", p, fi.Size(), fi.ModTime().UnixNano())
	}
	_ = filepath.WalkDir(filepath.Join(dir, "meta", "import"), func(p string, d fs.DirEntry, err error) error {
		if err == nil {
			if fi, e := d.Info(); e == nil {
				ghi(p, fi)
			}
		}
		return nil
	})
	for _, p := range []string{"meta/progress.json", "premise.md", "outline.json"} {
		if fi, err := os.Stat(filepath.Join(dir, filepath.FromSlash(p))); err == nil {
			ghi(p, fi)
		}
	}
	return fmt.Sprintf("%x", h.Sum64())
}
