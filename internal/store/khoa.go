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
// giữa các goroutine của cùng một engine, và bảo vệ ZERO giữa hai process. Trước đây điều
// đó vô hại vì chỉ có một đường ghi duy nhất (TUI/headless), và người dùng khó mà mở hai
// cái cùng lúc trên cùng thư mục.
//
// Nay có ba đường ghi cùng tồn tại — TUI, headless, và web studio — nên "khó mà" không
// còn là bảo đảm. Hai bên cùng ghi `meta/run_meta.json` thì hỏng theo kiểu tệ nhất: không
// lỗi, không log, chỉ mất dữ liệu.
//
// # Vì sao khóa nằm ở ĐÂY chứ không ở tầng gọi
//
// Bản đầu đặt khóa trong `internal/serve`, và nó vô dụng: `host.New` có năm chỗ gọi (TUI,
// headless, eval, serve, test), nên khóa ở một chỗ chỉ chặn được chỗ đó tự đụng chính nó.
// Đặt ở store — nơi mọi người ghi đều phải đi qua — thì một lần viết bảo vệ được cả năm.
//
// Cố ý KHÔNG gọi trong `Init()`: rất nhiều bài kiểm dựng `NewStore` + `Init` rồi không bao
// giờ đóng, và khóa trong Init sẽ rải tệp khóa mồ côi khắp nơi. Chỉ engine thật mới lấy.

// ErrDangBiKhoa là lỗi khi một process khác đang giữ thư mục.
//
// Sentinel riêng để tầng trên phân biệt được "người khác đang giữ" với lỗi IO — hai thứ
// này cần hai câu trả lời khác nhau cho người dùng, và với HTTP là hai mã khác nhau.
var ErrDangBiKhoa = errors.New("thư mục tác phẩm đang bị process khác giữ")

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

	if err := ghiKhoaMoi(duong, noiDung); err == nil {
		return &khoa{duong: duong}, nil
	} else if !os.IsExist(err) {
		return nil, err
	}

	pid, moc := docKhoa(duong)
	if pid > 0 && pid != os.Getpid() && conSong(pid) {
		return nil, fmt.Errorf("%w: process %d giữ từ %s. Đóng tiến trình đó trước, "+
			"hoặc nếu chắc nó đã chết thì xóa %s", ErrDangBiKhoa, pid, moc, duong)
	}

	// Khóa mồ côi: process giữ nó đã chết (máy sập, kill -9). Tiếp quản, nhưng GHI LOG —
	// một khóa mồ côi bị dọn im lặng sẽ che mất chuyện engine trước đã chết bất thường,
	// và đó là thông tin duy nhất còn lại về lần sập đó.
	slog.Warn("dọn khóa mồ côi", "module", "store", "pid", pid, "từ", moc, "tệp", duong)
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

// docKhoa đọc PID và mốc thời gian. Tệp rác → pid 0, để bên gọi coi là mồ côi.
func docKhoa(duong string) (int, string) {
	b, err := os.ReadFile(duong)
	if err != nil {
		return 0, ""
	}
	dong := strings.Split(strings.TrimSpace(string(b)), "\n")
	pid, err := strconv.Atoi(strings.TrimSpace(dong[0]))
	if err != nil {
		return 0, ""
	}
	moc := ""
	if len(dong) > 1 {
		moc = strings.TrimSpace(dong[1])
	}
	return pid, moc
}

// DangCoNguoiGiu cho biết có process CÒN SỐNG nào đang giữ khóa của thư mục này không.
//
// Chỉ đọc, không lấy khóa. Đây là câu trả lời mạnh nhất có được cho "cuốn này có đang được
// viết không" từ bên ngoài engine: mọi đường chạy engine (TUI, headless, studio) đều đi qua
// `host`, mà `host` lấy khóa này. Không ai giữ khóa thì không ai đang ghi — dù checkpoint cuối
// mới cách vài phút. Khóa mồ côi (process đã chết) tính là không ai giữ, cùng luật với `layKhoa`.
func DangCoNguoiGiu(dir string) bool {
	pid, _ := docKhoa(TepKhoaCua(dir))
	return pid > 0 && conSong(pid)
}
