package host

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/huuhoa143/ainovel-studio/internal/bootstrap"
	"github.com/huuhoa143/ainovel-studio/internal/store"
)

/*
`napLaiNhaCungCap` là chỗ DUY NHẤT đối chiếu danh mục trong bộ nhớ với tệp trên đĩa.

Trước tệp này nó không có bài kiểm nào, và phép đo đột biến đã chỉ ra hậu quả: xóa lời gọi
trong `Resume` thì cả gói `internal/host` vẫn xanh. Mà đó đúng là lời gọi khiến "đổi khóa API
rồi bấm Chạy" có tác dụng — người sau nhìn thấy `SwitchModel` và `ConfiguredProviders` cũng
gọi nó, tưởng chỗ này thừa, và xóa đi trong một lượt dọn dẹp vô hại.
*/

// tepCauHinhThu là tệp cấu hình của các bài kiểm nạp lại, nằm trong cwd tạm do nhaCauHinh dựng.
const tepCauHinhThu = "config.json"

// nhaCauHinh chuyển cwd sang một thư mục tạm để tepCauHinhThu là của riêng bài kiểm.
func nhaCauHinh(t *testing.T) {
	t.Helper()
	t.Chdir(t.TempDir())
}

func ghiCauHinhDuAn(t *testing.T, cfg bootstrap.Config) {
	t.Helper()
	b, err := json.Marshal(cfg)
	if err != nil {
		t.Fatalf("gói cấu hình: %v", err)
	}
	if err := os.WriteFile(tepCauHinhThu, b, 0o600); err != nil {
		t.Fatalf("ghi cấu hình: %v", err)
	}
}

func hostNapLai(t *testing.T, cfg bootstrap.Config) *Host {
	t.Helper()
	ms, err := bootstrap.NewModelSet(cfg)
	if err != nil {
		t.Fatalf("dựng model set: %v", err)
	}
	duong, err := filepath.Abs(tepCauHinhThu)
	if err != nil {
		t.Fatal(err)
	}
	return &Host{
		cfg:        cfg,
		models:     ms,
		lifecycle:  lifecycleIdle,
		engine:     &engine{},
		events:     make(chan Event, 8),
		store:      store.NewStore(t.TempDir()),
		configPath: duong,
	}
}

func cfgMot(ten, khoa string) bootstrap.Config {
	return bootstrap.Config{
		Provider: ten, ModelName: "m",
		Providers: map[string]bootstrap.ProviderConfig{
			ten: {Type: "openai", APIKey: khoa, Models: []bootstrap.ModelConfig{{Name: "m"}}},
		},
	}
}

/*
Bấm Chạy là đọc lại danh mục — đây là bài kiểm giữ chỗ cho lời gọi trong `Resume`.

Kho rỗng nên `resumeLabel` trả "" và `Resume` về sớm, KHÔNG chạm tới engine hay ngân sách.
Nhưng nó đã đi qua lời gọi nạp lại, nên trạng thái sau đó nói được lời gọi ấy còn hay mất.
*/
func TestResume_DocLaiDanhMucTruocKhiChay(t *testing.T) {
	nhaCauHinh(t)
	h := hostNapLai(t, cfgMot("g", "khoa-cu"))

	// Người dùng mua khóa mới và thêm một nhà cung cấp nữa, rồi bấm Chạy.
	moi := cfgMot("g", "khoa-moi")
	moi.Providers["b"] = bootstrap.ProviderConfig{
		Type: "openai", APIKey: "kb", Models: []bootstrap.ModelConfig{{Name: "mb"}},
	}
	ghiCauHinhDuAn(t, moi)

	if _, err := h.Resume(); err != nil {
		t.Fatalf("Resume: %v", err)
	}

	if got := h.cfg.Providers["g"].APIKey; got != "khoa-moi" {
		t.Fatalf("khóa sau khi bấm Chạy = %q, muốn khoa-moi — engine sẽ gọi bằng khóa đã hết hạn mức", got)
	}
	if _, có := h.cfg.Providers["b"]; !có {
		t.Fatal("nhà cung cấp thêm sau không vào được danh mục của engine đang mở")
	}
}

/*
Xóa một nhà cung cấp khỏi tệp thì nó phải BIẾN MẤT khỏi `h.cfg`, không sống lại.

`h.cfg.Providers` nuôi danh sách trên giao diện VÀ là thứ `SwitchModel` ghi ngược ra đĩa. Trộn
một chiều ở đây làm nhà cung cấp đã xóa quay về tệp NGUYÊN KHÓA API, chỉ vì người dùng lỡ đổi
model của một vai bất kỳ sau đó.
*/
func TestNapLaiNhaCungCap_XoaKhoiTepThiXoaKhoiCfg(t *testing.T) {
	nhaCauHinh(t)
	cu := cfgMot("a", "ka")
	cu.Providers["b"] = bootstrap.ProviderConfig{
		Type: "openai", APIKey: "kb-bi-mat", Models: []bootstrap.ModelConfig{{Name: "mb"}},
	}
	h := hostNapLai(t, cu)

	// Trên đĩa chỉ còn `a` — người dùng vừa xóa `b`.
	ghiCauHinhDuAn(t, cfgMot("a", "ka"))

	h.mu.Lock()
	h.napLaiNhaCungCap()
	h.mu.Unlock()

	if pc, có := h.cfg.Providers["b"]; có {
		t.Fatalf("nhà cung cấp đã xóa vẫn còn trong cfg (khóa %q) — lượt ghi kế tiếp sẽ đẩy nó về đĩa", pc.APIKey)
	}
	if _, có := h.cfg.Providers["a"]; !có {
		t.Fatal("nhà cung cấp còn trên đĩa lại biến mất")
	}
}

/*
Nhưng `ModelSet` thì vẫn phải GIỮ nó.

Hai đích, hai luật, và đây là bài kiểm cho vế thứ hai: một lượt chạy đang sống có thể còn cầm
client của nhà cung cấp vừa bị xóa. "Xóa khỏi cấu hình" nghĩa là đừng dùng cho lượt sau, không
phải cắt ngang lượt đang chạy.
*/
func TestNapLaiNhaCungCap_ModelSetVanGiuNhaCungCapDaXoa(t *testing.T) {
	nhaCauHinh(t)
	cu := cfgMot("a", "ka")
	cu.Providers["b"] = bootstrap.ProviderConfig{
		Type: "openai", APIKey: "kb", Models: []bootstrap.ModelConfig{{Name: "mb"}},
	}
	h := hostNapLai(t, cu)

	ghiCauHinhDuAn(t, cfgMot("a", "ka"))
	h.mu.Lock()
	h.napLaiNhaCungCap()
	h.mu.Unlock()

	if err := h.models.Swap("writer", "b", "mb"); err != nil {
		t.Fatalf("ModelSet đã rút mất nhà cung cấp mà một lượt chạy có thể đang dùng: %v", err)
	}
}

// Tệp cấu hình hỏng không được xóa trắng thứ đang dùng được — và cũng không được im lặng, vì
// triệu chứng ở đầu kia là "đổi khóa rồi mà vẫn lỗi".
func TestNapLaiNhaCungCap_TepHongThiGiuNguyen(t *testing.T) {
	nhaCauHinh(t)
	h := hostNapLai(t, cfgMot("a", "ka"))

	if err := os.WriteFile(tepCauHinhThu, []byte("{ hỏng"), 0o600); err != nil {
		t.Fatalf("ghi tệp hỏng: %v", err)
	}

	h.mu.Lock()
	h.napLaiNhaCungCap()
	h.mu.Unlock()

	if _, có := h.cfg.Providers["a"]; !có {
		t.Fatal("một tệp sai cú pháp đã xóa trắng danh mục đang chạy được")
	}
}
