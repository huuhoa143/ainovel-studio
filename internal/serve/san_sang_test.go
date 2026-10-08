package serve

import (
	"bytes"
	"context"
	"errors"
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

// tepCauHinhTam là giá trị `--config` của các bài kiểm không quan tâm cấu hình.
func tepCauHinhTam(t *testing.T) string {
	t.Helper()
	return filepath.Join(t.TempDir(), "config.json")
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
		ketQua <- chay(ctx, tuyChon{addr: "127.0.0.1:0", root: t.TempDir(), config: tepCauHinhTam(t)}, nil, out, io.Discard)
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
	root := t.TempDir()
	newBook(t, root, "sach", nil)
	dir := filepath.Join(root, "sach")
	tat := false
	cauHinh := tepCauHinhTam(t)
	if err := bootstrap.SaveConfig(cauHinh, bootstrap.Config{
		Provider:  "openrouter",
		ModelName: "fake",
		Providers: map[string]bootstrap.ProviderConfig{
			// Không bao giờ được gọi: bài kiểm chỉ mở engine, không chạy.
			"openrouter": {APIKey: "sk-fake", BaseURL: "http://127.0.0.1:1"},
		},
		Style:  "default",
		Notify: bootstrap.NotifyConfig{Enabled: &tat},
	}); err != nil {
		t.Fatal(err)
	}

	stdinDoc, stdinGhi := io.Pipe()
	out := &boDemKhoa{}
	ketQua := make(chan error, 1)
	go func() {
		ketQua <- chay(context.Background(),
			tuyChon{addr: "127.0.0.1:0", root: root, config: cauHinh}, stdinDoc, out, io.Discard)
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
	err = chay(context.Background(), tuyChon{addr: chiem.Addr().String(), root: t.TempDir(), config: tepCauHinhTam(t)}, nil, out, io.Discard)
	if err == nil {
		t.Fatal("cổng bận mà serve không báo lỗi")
	}
	if strings.Contains(out.String(), dongSanSang) {
		t.Errorf("khởi động hỏng mà vẫn in %s — app desktop sẽ tin một địa chỉ không ai nghe:\n%s",
			dongSanSang, out.String())
	}
}

// Studio chỉ nghe loopback: mọi địa chỉ khác là lỗi khởi động — không mở cổng, không in
// READY — chứ không phải một chế độ chỉ-đọc. `:0` là dạng viết tắt của mọi giao diện.
func TestChay_DiaChiKhongPhaiLoopbackLaLoiKhoiDong(t *testing.T) {
	for _, addr := range []string{"0.0.0.0:0", ":0", "[::]:0", "192.168.1.10:0", "example.com:0"} {
		out := &boDemKhoa{}
		err := chay(context.Background(), tuyChon{addr: addr, root: t.TempDir(), config: tepCauHinhTam(t)}, nil, out, io.Discard)
		if err == nil || !strings.Contains(err.Error(), "loopback") {
			t.Errorf("%s: phải là lỗi khởi động nói rõ loopback, được %v", addr, err)
		}
		if strings.Contains(out.String(), dongSanSang) {
			t.Errorf("%s: lỗi khởi động mà vẫn in %s", addr, dongSanSang)
		}
	}
}

// `--config` là bắt buộc và phải tuyệt đối: thiếu hoặc tương đối là lỗi khởi động.
func TestChay_ThieuHoacTuongDoiConfigLaLoiKhoiDong(t *testing.T) {
	for _, cfg := range []string{"", "config.json", filepath.Join(".", "x", "config.json")} {
		out := &boDemKhoa{}
		err := chay(context.Background(), tuyChon{addr: "127.0.0.1:0", root: t.TempDir(), config: cfg}, nil, out, io.Discard)
		if err == nil || !strings.Contains(err.Error(), "--config") {
			t.Errorf("--config %q: phải là lỗi khởi động, được %v", cfg, err)
		}
		if strings.Contains(out.String(), dongSanSang) {
			t.Errorf("--config %q: lỗi khởi động mà vẫn in %s", cfg, dongSanSang)
		}
	}
}

// Tắt êm có HAI nhịp: SSE dừng ngay, yêu cầu khác được trọn thời hạn. Bản trước hủy mọi
// context lúc bắt đầu tắt, nên một lượt nhập / xuất đang dở chết tức thì dù chú thích hứa
// "chờ trả lời xong".
//
// Thứ tự được ép bằng channel chứ không bằng đồng hồ: yêu cầu chậm chỉ được trả lời SAU KHI
// luồng SSE đã kết thúc. Nếu SSE không dừng ngay thì nó giữ tới hết thời hạn (thoiHanTatEm)
// và bài kiểm quá hạn chờ; nếu yêu cầu chậm bị hủy sớm thì nó trả 503 thay vì 200.
func TestChay_TatEmCatSSENgayNhungChoYeuCauKhac(t *testing.T) {
	root := t.TempDir()
	newBook(t, root, "sach", nil)

	vao := make(chan struct{})
	nha := make(chan struct{})
	themRoute := func(mux *http.ServeMux) {
		mux.HandleFunc("GET /cham", func(w http.ResponseWriter, r *http.Request) {
			close(vao)
			select {
			case <-nha:
				_, _ = io.WriteString(w, "xong")
			case <-r.Context().Done():
				w.WriteHeader(http.StatusServiceUnavailable)
			}
		})
	}

	ctx, huy := context.WithCancel(context.Background())
	defer huy()
	out := &boDemKhoa{}
	ketQua := make(chan error, 1)
	go func() {
		ketQua <- chay(ctx, tuyChon{addr: "127.0.0.1:0", root: root, config: tepCauHinhTam(t), themRoute: themRoute}, nil, out, io.Discard)
	}()
	url := choSanSang(t, out, ketQua)

	sse, err := http.Get(url + "/api/books/sach/events")
	if err != nil {
		t.Fatal(err)
	}
	defer sse.Body.Close()
	hetSSE := make(chan struct{})
	go func() {
		_, _ = io.Copy(io.Discard, sse.Body)
		close(hetSSE)
	}()

	type traLoi struct {
		ma   int
		than string
		err  error
	}
	cham := make(chan traLoi, 1)
	go func() {
		rep, err := http.Get(url + "/cham")
		if err != nil {
			cham <- traLoi{err: err}
			return
		}
		b, _ := io.ReadAll(rep.Body)
		rep.Body.Close()
		cham <- traLoi{ma: rep.StatusCode, than: string(b)}
	}()
	<-vao

	huy()
	select {
	case <-hetSSE:
	case <-time.After(thoiHanTatEm - 500*time.Millisecond):
		t.Fatal("luồng SSE không dừng ngay khi bắt đầu tắt — nó đang giữ Shutdown tới hết thời hạn")
	}

	close(nha)
	tl := <-cham
	if tl.err != nil || tl.ma != http.StatusOK || tl.than != "xong" {
		t.Errorf("yêu cầu đang dở phải được trả lời xong trong lúc tắt êm, có ma=%d than=%q err=%v",
			tl.ma, tl.than, tl.err)
	}
	if err := choTraVe(t, ketQua); err != nil {
		t.Errorf("tắt êm phải trả nil, có %v", err)
	}
}

// Sau khi dongTatCa bắt đầu, `mo` phải từ chối: một handler còn chạy sau thời hạn tắt êm mà
// mở được engine mới thì engine đó không ai đóng và khóa truyện mồ côi.
func TestBoMay_MoSauKhiTatThiTuChoi(t *testing.T) {
	// Tệp cấu hình là một THƯ MỤC: `mo` mà đi đọc nó thì nhận lỗi khác hẳn errDangTat.
	b := newBoMay(t.TempDir(), t.TempDir())
	b.dongTatCa()
	if _, err := b.mo("sach"); !errors.Is(err, errDangTat) {
		t.Fatalf("mo sau dongTatCa = %v, muốn errDangTat", err)
	}
	if maLoi(errDangTat) != http.StatusServiceUnavailable {
		t.Errorf("errDangTat phải ra 503, có %d", maLoi(errDangTat))
	}
}
