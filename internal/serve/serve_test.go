package serve

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/huuhoa143/ainovel-studio/internal/domain"
	"github.com/huuhoa143/ainovel-studio/internal/store"
)

// newBook dựng một tác phẩm thật trên đĩa để test đi qua đúng đường store, không
// qua mock. Store là hệ tệp nên test bằng t.TempDir() vừa nhanh vừa thật.
func newBook(t *testing.T, root, id string, fn func(*store.Store)) *store.Store {
	t.Helper()
	dir := filepath.Join(root, id)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	st := store.NewStore(dir)
	if err := st.Init(); err != nil {
		t.Fatalf("store.Init: %v", err)
	}
	if err := st.Progress.Init("Trấn Yêu Ký", 300); err != nil {
		t.Fatalf("progress.Init: %v", err)
	}
	if fn != nil {
		fn(st)
	}
	return st
}

func do(t *testing.T, s *server, method, target string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	s.routes().ServeHTTP(rec, httptest.NewRequest(method, target, nil))
	return rec
}

// Đây là test quan trọng nhất của file: id tác phẩm đến từ URL nên là dữ liệu
// không tin được. Không chặn thì "../../.." đọc được file ngoài xưởng, và store
// chứa toàn văn chưa phát hành cùng khóa cấu hình.
func TestBookDir_ChanThoatKhoiThuMucGoc(t *testing.T) {
	root := t.TempDir()
	s := &server{root: root}

	xau := []string{
		"..",
		"../etc",
		"../../etc/passwd",
		"a/../../b",
		"/etc/passwd",
		`..\windows`,
		"sub/dir",
		"",
		".",
	}
	for _, id := range xau {
		t.Run("chan_"+id, func(t *testing.T) {
			if dir, err := s.bookDir(id); err == nil {
				t.Errorf("bookDir(%q) phải bị từ chối, nhưng trả %q", id, dir)
			}
		})
	}

	// Tên hợp lệ vẫn phải đi qua được, nếu không hàng rào đã chặn cả việc thật.
	if _, err := s.bookDir("tran-yeu-ky"); err != nil {
		t.Errorf("tên hợp lệ bị từ chối: %v", err)
	}
}

func TestBookDir_OnlyBookGioiHanDungMotTacPham(t *testing.T) {
	s := &server{root: t.TempDir(), onlyBook: "a"}
	if _, err := s.bookDir("a"); err != nil {
		t.Errorf("tác phẩm được phép lại bị từ chối: %v", err)
	}
	if _, err := s.bookDir("b"); err == nil {
		t.Error("phiên giới hạn ở 'a' vẫn cho mở 'b'")
	}
}

func TestStudio_KhaiBaoDungKhaNangDuLieu(t *testing.T) {
	root := t.TempDir()
	newBook(t, root, "sach", nil)
	s := &server{root: root}

	rec := do(t, s, "GET", "/api/books/sach/studio")
	if rec.Code != http.StatusOK {
		t.Fatalf("mã %d, thân: %s", rec.Code, rec.Body.String())
	}
	var snap Snapshot
	if err := json.Unmarshal(rec.Body.Bytes(), &snap); err != nil {
		t.Fatalf("giải mã: %v", err)
	}

	// Store chỉ cộng chi phí theo agent/model (domain.UsageState), không theo
	// chương. Khai báo true ở đây sẽ khiến giao diện vẽ một cột không có nguồn,
	// và người vận hành sẽ tin những con số đó.
	if snap.Capabilities.PerChapterCost {
		t.Error("PerChapterCost phải là false: store không có chi phí theo chương")
	}
	if !snap.Capabilities.PerChapterDuration {
		t.Error("PerChapterDuration phải là true: suy được từ checkpoint")
	}
}

func TestStudio_KhongCoDuLieuThiBaoRoRang(t *testing.T) {
	root := t.TempDir()
	// Thư mục tồn tại nhưng chưa có meta/progress.json.
	if err := os.MkdirAll(filepath.Join(root, "rong"), 0o755); err != nil {
		t.Fatal(err)
	}
	s := &server{root: root}

	rec := do(t, s, "GET", "/api/books/rong/studio")
	if rec.Code != http.StatusNotFound {
		t.Errorf("mã = %d, muốn 404", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "chưa có dữ liệu") {
		t.Errorf("thông báo phải nói rõ vấn đề, được: %s", rec.Body.String())
	}
}

// Chương đang nằm trong hàng đợi viết lại VẪN nằm trong CompletedChapters (bản
// 終稿 cũ còn đó). Xét "đã xong" trước sẽ làm trạng thái "trả về viết lại" không
// bao giờ hiện ra — đúng thứ người vận hành cần thấy nhất.
func TestChapterState_VietLaiThangDaXong(t *testing.T) {
	p := &domain.Progress{
		CompletedChapters: []int{1, 2, 3},
		PendingRewrites:   []int{2},
		InProgressChapter: 4,
	}
	done := map[int]bool{1: true, 2: true, 3: true}
	rewrite := map[int]bool{2: true}

	cases := map[int]string{
		1: "done",
		2: "rewrite",
		3: "done",
		4: "running",
		5: "pending",
	}
	for ch, want := range cases {
		if got := chapterState(ch, p, done, rewrite); got != want {
			t.Errorf("chương %d: trạng thái = %q, muốn %q", ch, got, want)
		}
	}
}

func TestBuildChapterRows_KhongTraHangRongChoCaCuonSach(t *testing.T) {
	root := t.TempDir()
	st := newBook(t, root, "sach", func(st *store.Store) {
		if err := st.Progress.MarkChapterComplete(1, 3000, "cliffhanger", "main"); err != nil {
			t.Fatalf("mark: %v", err)
		}
	})
	p, err := st.Progress.Load()
	if err != nil {
		t.Fatal(err)
	}

	rows := buildChapterRows(st, p, nil)
	// Sách 300 chương mới xong 1 chương: chỉ nên có chương 1 và chương kế tiếp.
	// Trả 300 hàng rỗng là rác, không phải dữ liệu.
	if len(rows) > 3 {
		t.Errorf("có %d hàng cho sách mới xong 1/300 chương — phải chỉ trả chương có dấu vết + chương kế", len(rows))
	}
	var thay1 bool
	for _, r := range rows {
		if r.Chapter == 1 {
			thay1 = true
			if r.Stage != "done" {
				t.Errorf("chương 1 phải là done, được %q", r.Stage)
			}
		}
	}
	if !thay1 {
		t.Error("thiếu chương 1 đã hoàn thành")
	}
}

// duration_ms phải VẮNG khi không đo được, không phải 0. Số 0 nghĩa là "xong tức
// thời"; giao diện sẽ hiện "0s" và đó là một lời nói dối cụ thể.
func TestChapterRow_KhongDoDuocThiKhongCoDuration(t *testing.T) {
	root := t.TempDir()
	st := newBook(t, root, "sach", func(st *store.Store) {
		if err := st.Progress.MarkChapterComplete(1, 3000, "", ""); err != nil {
			t.Fatal(err)
		}
	})
	p, _ := st.Progress.Load()

	// Chỉ một checkpoint → không biết lúc nào bắt đầu.
	cycles := map[int]chapterCycle{1: {Chapter: 1, Measurable: false}}
	rows := buildChapterRows(st, p, cycles)

	for _, r := range rows {
		if r.Chapter == 1 && r.DurationMs != nil {
			t.Errorf("chương không đo được phải bỏ trống duration, được %d", *r.DurationMs)
		}
	}

	// Và phải CÓ khi đo được — nếu không test trên là vacuous.
	cycles[1] = chapterCycle{Chapter: 1, Measurable: true, Start: t0, End: t0.Add(90 * 1e9)}
	rows = buildChapterRows(st, p, cycles)
	var thay bool
	for _, r := range rows {
		if r.Chapter == 1 && r.DurationMs != nil {
			thay = true
		}
	}
	if !thay {
		t.Error("chương đo được phải có duration_ms")
	}
}

func TestWorkshop_ChiNhanThuMucCoDuLieuThat(t *testing.T) {
	root := t.TempDir()
	newBook(t, root, "sach-that", nil)
	// Thư mục rác và tệp lẻ không được hiện lên như tác phẩm trống.
	if err := os.MkdirAll(filepath.Join(root, "thu-muc-rac"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "ghi-chu.txt"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}

	ws, err := scanWorkshop(root, "")
	if err != nil {
		t.Fatalf("quét: %v", err)
	}
	if len(ws.Books) != 1 {
		t.Fatalf("tìm thấy %d tác phẩm, muốn 1: %+v", len(ws.Books), ws.Books)
	}
	if ws.Books[0].ID != "sach-that" {
		t.Errorf("id = %q", ws.Books[0].ID)
	}
	if ws.Books[0].Name != "Trấn Yêu Ký" {
		t.Errorf("tên tiếng Việt bị méo: %q", ws.Books[0].Name)
	}
}

func TestWorkshop_ChuaCoThuMucGocLaTrangThaiHopLe(t *testing.T) {
	// Máy mới chưa chạy engine lần nào: xưởng rỗng, không phải lỗi 500.
	ws, err := scanWorkshop(filepath.Join(t.TempDir(), "chua-ton-tai"), "")
	if err != nil {
		t.Fatalf("thư mục chưa tồn tại phải là xưởng rỗng, được lỗi: %v", err)
	}
	if len(ws.Books) != 0 {
		t.Errorf("phải rỗng, được %d", len(ws.Books))
	}
}

// Dấu tiếng Việt phải sống nguyên qua JSON. Encoder mặc định của Go thoát HTML
// và có thể làm chữ thành ê; giao diện đọc được nhưng log và curl thì
// không, và đó là chỗ người vận hành hay soi nhất.
func TestJSON_GiuNguyenDauTiengViet(t *testing.T) {
	rec := httptest.NewRecorder()
	writeJSON(rec, map[string]string{"s": "Tiếng chuông thứ ba — đã nghiệm thu"})

	body := rec.Body.String()
	if !strings.Contains(body, "Tiếng chuông thứ ba") {
		t.Errorf("dấu tiếng Việt bị thoát: %s", body)
	}
	if strings.Contains(body, `\u`) {
		t.Errorf("không được thoát unicode: %s", body)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.Contains(ct, "utf-8") {
		t.Errorf("Content-Type = %q, phải khai báo utf-8", ct)
	}
	// Store là dữ liệu sống; đệm của trình duyệt sẽ hiện tiến độ cũ sau F5.
	if cc := rec.Header().Get("Cache-Control"); cc != "no-store" {
		t.Errorf("Cache-Control = %q, muốn no-store", cc)
	}
}

func TestExcerpt_CatTheoRanhGioiTu(t *testing.T) {
	// Cắt giữa từ tiếng Việt tạo ra chữ vô nghĩa và có thể làm rơi dấu.
	text := "Đêm ấy mưa không dừng. Lâm Thanh ngồi dựa cột đá ở chân bậc thứ hai trăm, nghe tiếng chuông từ Hàn Sơn vọng xuống qua màn nước."
	got := excerpt(text, 40)

	if !strings.HasSuffix(got, "…") {
		t.Errorf("phải kết bằng dấu lược: %q", got)
	}
	// Không được cắt giữa từ: ký tự trước dấu lược phải là hết một từ, tức phần
	// còn lại sau khi bỏ "…" không được kết thúc bằng chữ dở.
	body := strings.TrimSuffix(got, "…")
	if strings.HasSuffix(body, " ") {
		t.Errorf("không nên để khoảng trắng trước dấu lược: %q", got)
	}
	if !strings.HasPrefix(got, "Đêm ấy mưa") {
		t.Errorf("mất phần đầu: %q", got)
	}

	// Chuỗi ngắn hơn hạn mức thì giữ nguyên, không thêm dấu lược.
	if got := excerpt("Ngắn.", 40); got != "Ngắn." {
		t.Errorf("chuỗi ngắn bị sửa: %q", got)
	}
	if got := excerpt("   ", 40); got != "" {
		t.Errorf("chuỗi trắng phải thành rỗng, được %q", got)
	}
}

// Bug tìm được khi thử với dữ liệu thật: capability lấy từ cờ progress.Layered
// báo false trong khi payload đã có 2 tập và 2 cung, làm giao diện ẩn hai lane
// trên dù đủ dữ liệu để vẽ. Cờ đó do engine đặt ở đường riêng; capability phải
// suy từ DỮ LIỆU.
func TestCapabilities_LayeredSuyTuDuLieuKhongTuCo(t *testing.T) {
	root := t.TempDir()
	st := newBook(t, root, "sach", func(st *store.Store) {
		must := func(err error) {
			t.Helper()
			if err != nil {
				t.Fatal(err)
			}
		}
		// Có dàn ý phân tầng thật, nhưng KHÔNG chạm tới cờ progress.Layered.
		must(st.Outline.SaveLayeredOutline([]domain.VolumeOutline{
			{Index: 1, Title: "Tập một", Arcs: []domain.ArcOutline{
				{Index: 1, Title: "Cung một", Chapters: []domain.OutlineEntry{
					{Chapter: 1, Title: "Chương một"},
				}},
			}},
		}))
	})

	p, err := st.Progress.Load()
	if err != nil {
		t.Fatal(err)
	}
	if p.Layered {
		t.Skip("cờ Layered đã bật; test này chỉ có nghĩa khi cờ còn tắt")
	}

	snap, err := buildSnapshot(st, "sach", 0)
	if err != nil {
		t.Fatalf("buildSnapshot: %v", err)
	}
	if len(snap.Timeline.Volumes) == 0 {
		t.Fatal("phải có lane tập từ layered_outline")
	}
	if !snap.Capabilities.LayeredOutline {
		t.Error("có dữ liệu phân tầng mà capability báo false → giao diện sẽ ẩn lane tập/cung")
	}
}

// Tên field phải nói đúng bản chất: đây là bước vừa xong, không phải bước đang
// chạy. Gọi nó là "step" từng làm giao diện hiện "commit" khi engine đang draft.
func TestTransport_LastStepKhongPhaiStepDangChay(t *testing.T) {
	root := t.TempDir()
	st := newBook(t, root, "sach", nil)
	p, _ := st.Progress.Load()

	tr := buildTransport(st, p, st.Checkpoints.All())
	// Không có checkpoint thì phải trống, không được bịa.
	if tr.LastStep != "" {
		t.Errorf("chưa có checkpoint mà LastStep = %q", tr.LastStep)
	}

	raw, err := json.Marshal(tr)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), `"step"`) {
		t.Errorf(`hợp đồng JSON không được có khóa "step" (gây hiểu là công đoạn đang chạy): %s`, raw)
	}
}
