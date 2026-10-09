package store

import (
	"fmt"
	"os"
	"strings"
	"testing"
)

// TestKhoaChanHaiProcessGhi canh khóa tệp.
//
// # Vì sao khóa này bắt buộc
//
// `IO.WithWriteLock` chỉ là `io.mu.Lock()` — mutex TRONG PROCESS. Nó không thấy process
// khác. TUI bị đóng băng nhưng vẫn chạy được, và web studio nay cũng ghi, nên không có tệp
// khóa thì hai bên ghi chồng `meta/run_meta.json`. Hỏng theo kiểu tệ nhất: không lỗi,
// không log, chỉ mất dữ liệu.
//
// # Vì sao bài kiểm nằm ở gói store chứ không ở serve
//
// Bản đầu đặt khóa trong `internal/serve` và bài kiểm ở đó XANH — nhưng khóa vô dụng, vì
// `host.New` có năm chỗ gọi và chỉ một chỗ lấy khóa. Bài kiểm xanh cho một cơ chế không
// bảo vệ được gì. Khóa chuyển xuống store (chỗ mọi người ghi đều đi qua) thì bài kiểm
// theo xuống cùng.
func TestKhoaChanHaiProcessGhi(t *testing.T) {
	dir := t.TempDir()

	k1, err := layKhoa(dir)
	if err != nil {
		t.Fatalf("lấy khóa lần đầu: %v", err)
	}

	// Giả một process KHÁC còn sống đang giữ khóa. PID 1 là init/launchd, luôn sống.
	// Khẳng định tiền đề thay vì giả định — một bài kiểm dựa trên PID 1 mà PID 1 không
	// phản hồi thì nó rơi vào nhánh mồ côi và vẫn xanh, tức kiểm nhầm thứ.
	if !conSong(1) {
		t.Skip("PID 1 không phản hồi phép thử — bỏ ca 'người khác đang giữ'")
	}
	ghiKhoaTho(t, dir, "1\n2026-07-31T00:00:00Z\n")
	if _, err := layKhoa(dir); err == nil {
		t.Error("lấy được khóa dù process khác đang giữ — hai bên sẽ cùng ghi")
	} else {
		// Phải là sentinel: tầng HTTP dùng nó để trả 409 thay vì 400, và người dùng cần
		// phân biệt "người khác đang giữ" với "lỗi ổ đĩa".
		if !isKhoaErr(err) {
			t.Errorf("lỗi không bọc ErrDangBiKhoa nên tầng trên không phân loại được: %v", err)
		}
		// Thông báo phải NÓI ĐƯỢC phải làm gì, bằng chữ người dùng app desktop hiểu: đóng
		// chương trình kia, không thấy thì khởi động lại máy. PID và tệp vẫn ở cuối để chẩn đoán.
		for _, can := range []string{"Đóng cửa sổ AINovel Studio", "khởi động lại máy", "process 1", tenTepKhoa} {
			if !strings.Contains(err.Error(), can) {
				t.Errorf("thông báo thiếu %q: %v", can, err)
			}
		}
		// Không còn khuyên xóa tay: tới được đây là người giữ còn sống thật.
		if strings.Contains(err.Error(), "xóa") {
			t.Errorf("thông báo vẫn khuyên xóa tệp khóa — mời hai bên cùng ghi: %v", err)
		}
	}

	// Khóa mồ côi: PID đã chết (máy sập, kill -9) thì phải TIẾP QUẢN, không chặn vĩnh viễn.
	ghiKhoaTho(t, dir, "999999999\n2026-07-31T00:00:00Z\n")
	if _, err := layKhoa(dir); err != nil {
		t.Fatalf("không tiếp quản được khóa mồ côi — người dùng bị chặn sau một lần sập: %v", err)
	}

	// Tệp rác cũng phải tiếp quản được, không được chặn luôn.
	ghiKhoaTho(t, dir, "không phải số\n")
	k3, err := layKhoa(dir)
	if err != nil {
		t.Fatalf("tệp khóa rác làm chặn luôn: %v", err)
	}

	if err := k3.tra(); err != nil {
		t.Errorf("trả khóa: %v", err)
	}
	// Trả hai lần phải im lặng: đường thoát của engine có thể chạy qua `tra` nhiều nhánh.
	if err := k3.tra(); err != nil {
		t.Errorf("trả khóa lần hai phải im lặng, được: %v", err)
	}
	_ = k1
}

// TestStoreKhoaMoKhoa canh API mức Store mà host.New/Close dùng.
func TestStoreKhoaMoKhoa(t *testing.T) {
	dir := t.TempDir()
	st := NewStore(dir)

	if err := st.Khoa(); err != nil {
		t.Fatalf("Khoa: %v", err)
	}
	if _, err := os.Stat(TepKhoaCua(dir)); err != nil {
		t.Fatalf("Khoa không tạo tệp khóa: %v", err)
	}
	// Lấy hai lần phải im lặng: đường khởi động có nhiều nhánh, và một khóa lấy hai lần
	// rồi trả một lần sẽ để lại tệp mồ côi.
	if err := st.Khoa(); err != nil {
		t.Errorf("Khoa lần hai phải im lặng, được: %v", err)
	}

	if err := st.MoKhoa(); err != nil {
		t.Fatalf("MoKhoa: %v", err)
	}
	if _, err := os.Stat(TepKhoaCua(dir)); !os.IsNotExist(err) {
		t.Errorf("MoKhoa không xóa tệp khóa (Stat: %v)", err)
	}
	if err := st.MoKhoa(); err != nil {
		t.Errorf("MoKhoa khi chưa khóa phải im lặng, được: %v", err)
	}

	// Store KHÔNG được tự khóa trong Init: rất nhiều bài kiểm dựng NewStore+Init rồi không
	// bao giờ đóng, và khóa trong Init sẽ rải tệp khóa mồ côi khắp thư mục tạm.
	dir2 := t.TempDir()
	st2 := NewStore(dir2)
	if err := st2.Init(); err != nil {
		t.Fatalf("Init: %v", err)
	}
	if _, err := os.Stat(TepKhoaCua(dir2)); !os.IsNotExist(err) {
		t.Error("Init tự lấy khóa — mọi bài kiểm dùng store sẽ để lại khóa mồ côi")
	}
}

func isKhoaErr(err error) bool {
	return err != nil && strings.Contains(err.Error(), ErrDangBiKhoa.Error())
}

func ghiKhoaTho(t *testing.T, dirSach, noiDung string) {
	t.Helper()
	if err := os.WriteFile(TepKhoaCua(dirSach), []byte(noiDung), 0o644); err != nil {
		t.Fatalf("ghi khóa thô: %v", err)
	}
}

// TestKhoaPIDTaiDung canh ca PID được cấp lại cho một process KHÁC.
//
// Sau sập / mất điện rồi khởi động lại, hệ điều hành cấp lại PID nhỏ từ đầu (Windows rất hay),
// nên PID trong tệp khóa cũ thường trỏ vào một chương trình không liên quan đang sống. Chỉ thử
// "PID sống" thì studio từ chối mở truyện mãi mãi. Mốc khởi động trong tệp khóa phân biệt được.
//
// Dùng PID của process CHA (trình chạy `go test`): chắc chắn sống, không phải chính mình (khóa
// của chính mình bị bỏ qua), và có trên mọi hệ điều hành — PID 1 thì Windows không có.
func TestKhoaPIDTaiDung(t *testing.T) {
	cha := os.Getppid()
	that, ok := mocKhoiDong(cha)
	if !ok {
		t.Skip("hệ điều hành này không đọc được mốc khởi động — luật cũ (chỉ PID) áp dụng")
	}
	if lai, _ := mocKhoiDong(cha); lai != that {
		t.Fatalf("mốc khởi động không ổn định giữa hai lần đọc: %q rồi %q", that, lai)
	}

	ca := []struct {
		ten     string
		noiDung string
		dangGiu bool
	}{
		{"đúng process đã lấy khóa", fmt.Sprintf("%d\n2026-07-31T00:00:00Z\n%s%s\n", cha, tienToKhoiDong, that), true},
		{"PID bị cấp lại cho process khác", fmt.Sprintf("%d\n2026-07-31T00:00:00Z\n%s1\n", cha, tienToKhoiDong), false},
		// Tệp đời cũ không có mốc: giữ luật cũ, PID sống = đang giữ.
		{"tệp khóa đời cũ", fmt.Sprintf("%d\n2026-07-31T00:00:00Z\n", cha), true},
	}
	for _, c := range ca {
		t.Run(c.ten, func(t *testing.T) {
			dir := t.TempDir()
			if _, err := layKhoa(dir); err != nil {
				t.Fatal(err)
			}
			ghiKhoaTho(t, dir, c.noiDung)

			// Hai người đọc, MỘT luật: snapshot hỏi "có ai đang viết không" và layKhoa phải
			// trả lời giống nhau, không thì giao diện báo "đang viết" cho một truyện mở được.
			if got := DangCoNguoiGiu(dir); got != c.dangGiu {
				t.Errorf("DangCoNguoiGiu = %v, muốn %v", got, c.dangGiu)
			}
			k, err := layKhoa(dir)
			if c.dangGiu {
				if !isKhoaErr(err) {
					t.Errorf("người giữ còn sống thật mà vẫn lấy được khóa (err=%v)", err)
				}
				return
			}
			if err != nil {
				t.Fatalf("không tiếp quản được khóa của PID đã bị cấp lại: %v", err)
			}
			_ = k.tra()
		})
	}
}

// TestKhoaGhiMocKhoiDong: khóa mới phải mang mốc của CHÍNH process lấy nó, nếu hệ điều hành
// đọc được — thiếu nó thì sau một lần khởi động lại, ca PID tái dùng lại thành ngõ cụt.
func TestKhoaGhiMocKhoiDong(t *testing.T) {
	that, ok := mocKhoiDong(os.Getpid())
	dir := t.TempDir()
	k, err := layKhoa(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = k.tra() }()
	tk := docKhoa(TepKhoaCua(dir))
	if tk.pid != os.Getpid() {
		t.Errorf("pid trong khóa = %d, muốn %d", tk.pid, os.Getpid())
	}
	if ok && tk.khoiDong != that {
		t.Errorf("mốc khởi động trong khóa = %q, muốn %q", tk.khoiDong, that)
	}
	if !ok && tk.khoiDong != "" {
		t.Errorf("hệ điều hành không đọc được mốc mà khóa vẫn ghi %q", tk.khoiDong)
	}
	// PID không tồn tại phải báo "không đọc được", không được trả một mốc rỗng-mà-ok: mốc giả
	// sẽ khác mốc đã ghi và biến một khóa thật thành mồ côi.
	if moc, ok := mocKhoiDong(999999999); ok {
		t.Errorf("PID không tồn tại mà vẫn đọc được mốc khởi động %q", moc)
	}
}
