package serve

import (
	"bytes"
	"context"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/huuhoa143/ainovel-studio/internal/bootstrap"
	"github.com/huuhoa143/ainovel-studio/internal/store"
)

// Ba bài kiểm dưới đây canh HỢP ĐỒNG sidecar với app desktop — dòng AINOVEL_READY, tắt êm
// khi stdin đóng, và im lặng khi khởi động hỏng. App desktop đọc đúng từng điều này, nên
// chúng chạy qua `chay` thật với cổng thật, không qua httptest.

// boDemKhoa là bytes.Buffer an toàn khi `chay` ghi từ goroutine khác lúc test đang đọc.
type boDemKhoa struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (d *boDemKhoa) Write(p []byte) (int, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.b.Write(p)
}

func (d *boDemKhoa) String() string {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.b.String()
}

// choSanSang chờ dòng AINOVEL_READY và trả URL trong đó.
func choSanSang(t *testing.T, out *boDemKhoa, ketQua <-chan error) string {
	t.Helper()
	han := time.After(10 * time.Second)
	for {
		for _, dong := range strings.Split(out.String(), "\n") {
			if url, ok := strings.CutPrefix(dong, dongSanSang+" "); ok {
				return url
			}
		}
		select {
		case err := <-ketQua:
			t.Fatalf("serve thoát trước khi báo sẵn sàng: %v\nstdout:\n%s", err, out.String())
		case <-han:
			t.Fatalf("quá hạn chờ %s\nstdout:\n%s", dongSanSang, out.String())
		case <-time.After(10 * time.Millisecond):
		}
	}
}

func choTraVe(t *testing.T, ketQua <-chan error) error {
	t.Helper()
	select {
	case err := <-ketQua:
		return err
	case <-time.After(10 * time.Second):
		t.Fatal("serve không trả về sau khi được yêu cầu tắt")
		return nil
	}
}

func TestChay_Cong0InCongThatVaPhucVu(t *testing.T) {
	ctx, huy := context.WithCancel(context.Background())
	defer huy()
	out := &boDemKhoa{}
	ketQua := make(chan error, 1)
	go func() {
		ketQua <- chay(ctx, tuyChon{addr: "127.0.0.1:0", root: t.TempDir()}, nil, out, io.Discard)
	}()

	url := choSanSang(t, out, ketQua)
	if !strings.HasPrefix(url, "http://127.0.0.1:") || strings.HasSuffix(url, ":0") {
		t.Fatalf("URL sẵn sàng phải mang cổng thật, có %q", url)
	}
	// Dòng log cho người đọc cũng phải mang cổng thật, không phải ":0" người dùng gõ.
	if !strings.Contains(out.String(), "ainovel studio đang chạy tại "+url+"\n") {
		t.Errorf("dòng log người đọc không mang cổng thật:\n%s", out.String())
	}

	rep, err := http.Get(url + "/api/workshop")
	if err != nil {
		t.Fatal(err)
	}
	rep.Body.Close()
	if rep.StatusCode != http.StatusOK {
		t.Errorf("/api/workshop = %d, muốn 200", rep.StatusCode)
	}
	// Cổng 0 trên loopback vẫn là loopback: nhóm route ghi phải được mắc.
	rep, err = http.Get(url + "/api/engine")
	if err != nil {
		t.Fatal(err)
	}
	rep.Body.Close()
	if rep.StatusCode != http.StatusOK {
		t.Errorf("/api/engine = %d, muốn 200 (studio phải ghi được với cổng 0)", rep.StatusCode)
	}

	huy() // như SIGINT/SIGTERM: Command nối tín hiệu vào chính ctx này
	if err := choTraVe(t, ketQua); err != nil {
		t.Errorf("tắt bằng tín hiệu phải trả nil, có %v", err)
	}
}

// Đây là lý do có cờ --exit-on-stdin-close: app desktop chết bất ngờ thì không ai gửi tín
// hiệu, chỉ có ống stdin đóng. Serve phải thoát VÀ trả khóa truyện — không thì lần mở app
// sau gặp "thư mục đang bị process khác giữ" bởi một PID đã chết.
func TestChay_DongStdinThiTatEmVaTraKhoa(t *testing.T) {
	t.Setenv("HOME", t.TempDir()) // host.New ghi bộ đệm giá model vào ~/.ainovel
	root := t.TempDir()
	newBook(t, root, "sach", nil)
	dir := filepath.Join(root, "sach")
	tat := false
	napConfg := func() (bootstrap.Config, error) {
		return bootstrap.Config{
			Provider:  "openrouter",
			ModelName: "fake",
			Providers: map[string]bootstrap.ProviderConfig{
				// Không bao giờ được gọi: bài kiểm chỉ mở engine, không chạy.
				"openrouter": {APIKey: "sk-fake", BaseURL: "http://127.0.0.1:1"},
			},
			Style:  "default",
			Notify: bootstrap.NotifyConfig{Enabled: &tat},
		}, nil
	}

	stdinDoc, stdinGhi := io.Pipe()
	out := &boDemKhoa{}
	ketQua := make(chan error, 1)
	go func() {
		ketQua <- chay(context.Background(),
			tuyChon{addr: "127.0.0.1:0", root: root, napConfg: napConfg}, stdinDoc, out, io.Discard)
	}()
	url := choSanSang(t, out, ketQua)

	req, _ := http.NewRequest(http.MethodPost, url+"/api/books/sach/open", nil)
	req.Header.Set(tenHeaderRao, "1")
	rep, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	than, _ := io.ReadAll(rep.Body)
	rep.Body.Close()
	if rep.StatusCode != http.StatusOK {
		t.Fatalf("mở engine = %d: %s", rep.StatusCode, than)
	}
	if _, err := os.Stat(store.TepKhoaCua(dir)); err != nil {
		t.Fatalf("engine đã mở mà không thấy tệp khóa: %v", err)
	}

	stdinGhi.Close()
	if err := choTraVe(t, ketQua); err != nil {
		t.Errorf("stdin đóng phải tắt êm và trả nil, có %v", err)
	}
	if _, err := os.Stat(store.TepKhoaCua(dir)); !os.IsNotExist(err) {
		t.Errorf("serve đã thoát mà khóa truyện còn nguyên (err=%v)", err)
	}
	// Và khóa nhả THẬT: một người khác lấy được.
	st := store.NewStore(dir)
	if err := st.Khoa(); err != nil {
		t.Errorf("lấy lại khóa sau khi serve thoát: %v", err)
	}
	_ = st.MoKhoa()
}

func TestChay_CongBanThiBaoLoiVaKhongBaoSanSang(t *testing.T) {
	chiem, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer chiem.Close()

	out := &boDemKhoa{}
	err = chay(context.Background(), tuyChon{addr: chiem.Addr().String(), root: t.TempDir()}, nil, out, io.Discard)
	if err == nil {
		t.Fatal("cổng bận mà serve không báo lỗi")
	}
	if strings.Contains(out.String(), dongSanSang) {
		t.Errorf("khởi động hỏng mà vẫn in %s — app desktop sẽ tin một địa chỉ không ai nghe:\n%s",
			dongSanSang, out.String())
	}
}
