package store

import (
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// Khóa mức TỆP cho một thư mục tác phẩm, chặn hai PROCESS cùng ghi.
//
// # Vì sao store cần khóa tệp
//
// `IO.WithWriteLock` chỉ là `io.mu.Lock()` — một mutex trong process. Nó bảo vệ hoàn hảo
// giữa các goroutine của cùng một engine, và bảo vệ ZERO giữa hai process. Hai process có
// thể cùng mở một thư mục (sidecar của app và harness eval, hoặc một sidecar mồ côi sau khi
// app chết). Hai bên cùng ghi `meta/run_meta.json` thì hỏng theo kiểu tệ nhất: không lỗi,
// không log, chỉ mất dữ liệu.
//
// # Vì sao khóa nằm ở ĐÂY chứ không ở tầng gọi
//
// Bản đầu đặt khóa trong `internal/serve`, và nó vô dụng: `host.New` có nhiều chỗ gọi
// (serve, eval, test), nên khóa ở một chỗ chỉ chặn được chỗ đó tự đụng chính nó. Đặt ở
// store — nơi mọi người ghi đều phải đi qua — thì một lần viết bảo vệ được tất cả.
//
// Cố ý KHÔNG gọi trong `Init()`: rất nhiều bài kiểm dựng `NewStore` + `Init` rồi không bao
// giờ đóng, và khóa trong Init sẽ rải tệp khóa mồ côi khắp nơi. Chỉ engine thật mới lấy.

// ErrDangBiKhoa là lỗi khi một process khác đang giữ thư mục.
//
// Sentinel riêng để tầng trên phân biệt được "người khác đang giữ" với lỗi IO — hai thứ
// này cần hai câu trả lời khác nhau cho người dùng, và với HTTP là hai mã khác nhau.
var ErrDangBiKhoa = errors.New("Truyện này đang được mở ở một chương trình AINovel khác")

const tenTepKhoa = "studio.lock"

// khoa là khóa đang giữ. nil nghĩa là chưa lấy.
type khoa struct{ duong string }

// TepKhoaCua dựng đường dẫn tệp khóa của một thư mục tác phẩm.
//
// Một hàm cho một phép ghép đường dẫn nhìn như thừa, nhưng đây đúng là lớp lỗi vừa gặp
// trong repo này: bề rộng khung sự kiện TUI được tính ở sáu chỗ theo hai công thức và một
// chỗ cắt mất chữ giữa từ. Đường dẫn khóa có bốn chỗ dùng nên nó chỉ được có một công thức.
func TepKhoaCua(dir string) string {
	return filepath.Join(dir, "meta", tenTepKhoa)
}

// Khoa lấy khóa ghi cho thư mục này.
//
// Gọi hai lần trên cùng Store là không sao (idempotent): đường thoát của engine có thể
// chạy qua nhiều nhánh, và một khóa bị lấy hai lần rồi trả một lần sẽ để lại tệp mồ côi.
func (s *Store) Khoa() error {
	if s.khoa != nil {
		return nil
	}
	k, err := layKhoa(s.dir)
	if err != nil {
		return err
	}
	s.khoa = k
	return nil
}

// MoKhoa trả khóa.
//
// Chịu được cả `s == nil` và "chưa từng lấy". Không phải phòng xa: `Host.Close` là đường
// dọn dẹp và nó chạy được trên một Host dựng dở — có bài kiểm cố ý dựng `&Host{}` với
// store nil để kiểm việc Close chờ công việc async. Một phương thức GIẢI PHÓNG mà panic
// khi chưa có gì để giải phóng sẽ biến mọi đường thoát thành một cái bẫy. `tra()` bên dưới
// đã theo đúng lối này.
func (s *Store) MoKhoa() error {
	if s == nil || s.khoa == nil {
		return nil
	}
	err := s.khoa.tra()
	s.khoa = nil
	return err
}

func layKhoa(dir string) (*khoa, error) {
	if err := os.MkdirAll(filepath.Join(dir, "meta"), 0o755); err != nil {
		return nil, fmt.Errorf("tạo thư mục meta: %w", err)
	}
	duong := TepKhoaCua(dir)
	noiDung := fmt.Sprintf("%d\n%s\n", os.Getpid(), time.Now().Format(time.RFC3339))
	if bd, ok := mocKhoiDong(os.Getpid()); ok {
		noiDung += tienToKhoiDong + bd + "\n"
	}

	if err := ghiKhoaMoi(duong, noiDung); err == nil {
		return &khoa{duong: duong}, nil
	} else if !os.IsExist(err) {
		return nil, err
	}

	tk := docKhoa(duong)
	if tk.pid != os.Getpid() && tk.nguoiGiuConSong() {
		// Người đọc câu này có thể là người dùng app desktop, không biết "process" hay "tệp
		// khóa" là gì. Nên câu chính nói bằng thứ họ thấy (một cửa sổ đang mở truyện này) và
		// việc phải làm; PID và đường dẫn tệp đứng cuối, cho người cần chẩn đoán.
		//
		// Không còn khuyên "xóa tệp khóa": từ khi so mốc khởi động, một khóa đi tới được đây là
		// do một chương trình CÒN SỐNG và ĐÚNG LÀ chương trình đã lấy khóa — xóa tay là mời hai
		// bên cùng ghi. Khởi động lại máy thì chắc chắn tắt nó, và lần mở sau tự dọn khóa.
		return nil, fmt.Errorf("%w (mở lúc %s). Đóng cửa sổ AINovel Studio khác đang mở truyện "+
			"này rồi thử lại. Không tìm thấy cửa sổ nào thì khởi động lại máy rồi mở lại — khóa sẽ "+
			"tự được gỡ. [process %d, tệp %s]",
			ErrDangBiKhoa, hienMoc(tk.moc), tk.pid, duong)
	}

	// Khóa mồ côi: process giữ nó đã chết (máy sập, kill -9). Tiếp quản, nhưng GHI LOG —
	// một khóa mồ côi bị dọn im lặng sẽ che mất chuyện engine trước đã chết bất thường,
	// và đó là thông tin duy nhất còn lại về lần sập đó.
	slog.Warn("dọn khóa mồ côi", "module", "store", "pid", tk.pid, "từ", tk.moc, "tệp", duong)
	if err := os.Remove(duong); err != nil {
		return nil, fmt.Errorf("xóa khóa mồ côi %s: %w", duong, err)
	}
	if err := ghiKhoaMoi(duong, noiDung); err != nil {
		return nil, fmt.Errorf("lấy khóa sau khi dọn: %w", err)
	}
	return &khoa{duong: duong}, nil
}

// ghiKhoaMoi tạo tệp khóa, thất bại nếu đã có.
//
// O_EXCL là phần làm việc: tạo-hoặc-thất-bại trong MỘT lời gọi hệ thống. Nếu tách thành
// "Stat thấy trống rồi Create" thì giữa hai bước đó có kẽ, và hai process khởi động cùng
// lúc sẽ cùng lấy được khóa — tức lỗi mà khóa này tồn tại để chặn.
func ghiKhoaMoi(duong, noiDung string) error {
	f, err := os.OpenFile(duong, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	_, werr := f.WriteString(noiDung)
	cerr := f.Close()
	if werr != nil {
		return werr
	}
	return cerr
}

func (k *khoa) tra() error {
	if k == nil || k.duong == "" {
		return nil
	}
	err := os.Remove(k.duong)
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

// tienToKhoiDong đánh dấu dòng mốc khởi động trong tệp khóa. Có tiền tố (thay vì "dòng thứ
// ba là mốc") để tệp cũ hai dòng và tệp mới đọc chung một hàm mà không đoán.
const tienToKhoiDong = "batdau="

// tepKhoa là nội dung một tệp khóa đã đọc.
type tepKhoa struct {
	pid int
	moc string // lúc lấy khóa, RFC3339 — chỉ để hiện và ghi log
	// khoiDong là mốc khởi động của process giữ khóa, dạng mã riêng của từng hệ điều hành
	// (xem mocKhoiDong). Rỗng = tệp khóa đời cũ, hoặc hệ điều hành không đọc được mốc.
	khoiDong string
}

// docKhoa đọc tệp khóa. Tệp rác → pid 0, để bên gọi coi là mồ côi.
func docKhoa(duong string) tepKhoa {
	b, err := os.ReadFile(duong)
	if err != nil {
		return tepKhoa{}
	}
	dong := strings.Split(strings.TrimSpace(string(b)), "\n")
	pid, err := strconv.Atoi(strings.TrimSpace(dong[0]))
	if err != nil {
		return tepKhoa{}
	}
	tk := tepKhoa{pid: pid}
	if len(dong) > 1 {
		tk.moc = strings.TrimSpace(dong[1])
	}
	for _, d := range dong[1:] {
		if v, ok := strings.CutPrefix(strings.TrimSpace(d), tienToKhoiDong); ok {
			tk.khoiDong = v
		}
	}
	return tk
}

// nguoiGiuConSong: process ghi tệp khóa này CÒN chạy — luật mồ côi DUY NHẤT, `layKhoa` và
// `DangCoNguoiGiu` cùng gọi.
//
// # Vì sao PID còn sống là chưa đủ
//
// PID được tái dùng. Sau một lần sập hay mất điện rồi khởi động lại, hệ điều hành cấp lại
// các PID nhỏ từ đầu — trên Windows chuyện này xảy ra RẤT thường, không phải ca hiếm. PID
// trong tệp khóa khi đó thuộc về một chương trình không liên quan đang chạy, và phép thử
// "PID sống" đọc nó thành "có người đang giữ": studio từ chối mở truyện mãi mãi, và người
// dùng app desktop bị bảo đi xóa một tệp họ không biết nằm đâu — một ngõ cụt.
//
// Nên tệp khóa ghi thêm MỐC KHỞI ĐỘNG của process giữ nó. PID sống mà mốc khởi động bây giờ
// khác mốc đã ghi → đó là một process khác mang lại số cũ → khóa mồ côi.
//
// Tệp khóa đời cũ (không có mốc), hoặc không đọc được mốc của PID đang sống (khác chủ, hệ
// điều hành không hỗ trợ): giữ luật cũ, PID sống = đang giữ. Sai theo hướng an toàn — từ
// chối ghi thì mất tiện, cho hai bên cùng ghi thì mất dữ liệu.
func (tk tepKhoa) nguoiGiuConSong() bool {
	if tk.pid <= 0 || !conSong(tk.pid) {
		return false
	}
	if tk.khoiDong == "" {
		return true
	}
	bayGio, ok := mocKhoiDong(tk.pid)
	return !ok || bayGio == tk.khoiDong
}

// hienMoc đổi mốc RFC3339 trong tệp khóa sang giờ địa phương dễ đọc; đọc không được thì
// trả nguyên văn.
func hienMoc(moc string) string {
	t, err := time.Parse(time.RFC3339, moc)
	if err != nil {
		if moc == "" {
			return "không rõ"
		}
		return moc
	}
	return t.Local().Format("15:04 ngày 02/01/2006")
}

// DangCoNguoiGiu cho biết có process CÒN SỐNG nào đang giữ khóa của thư mục này không.
//
// Chỉ đọc, không lấy khóa. Đây là câu trả lời mạnh nhất có được cho "cuốn này có đang được
// viết không" từ bên ngoài engine: mọi đường chạy engine (studio, eval) đều đi qua
// `host`, mà `host` lấy khóa này. Không ai giữ khóa thì không ai đang ghi — dù checkpoint cuối
// mới cách vài phút. Khóa mồ côi (process đã chết) tính là không ai giữ, cùng luật với `layKhoa`.
func DangCoNguoiGiu(dir string) bool {
	return docKhoa(TepKhoaCua(dir)).nguoiGiuConSong()
}
