// Package serve cung cấp HTTP API cho web studio: đọc store, và CHẠY engine.
//
// # Vì sao nó không còn chỉ đọc
//
// Bản trước của chú thích này giải thích vì sao `serve` chỉ đọc, và lý lẽ đó đúng
// với tiền đề của nó: engine là process riêng, nên hai process cùng sửa
// meta/run_meta.json sẽ mất trắng ý kiến can thiệp — engine đọc PendingSteer, xử
// lý, rồi ClearPendingSteer, và một lượt ghi chen vào giữa không để lại dấu vết.
// Store không có khóa liên tiến-trình.
//
// Tiền đề đã đổi: engine giờ chạy TRONG process này (internal/serve/engine.go).
// Nên không còn hai process ghi — studio LÀ người ghi duy nhất, và phản biện cũ
// được giải quyết tận gốc chứ không bị đi vòng. Mọi lệnh ghi đi qua `*host.Host`,
// không qua RunMetaStore trực tiếp, nên chúng dùng đúng những giao dịch mà engine
// dùng cho chính nó.
//
// Hai thứ được thêm để chuyện đó an toàn:
//
//   - `store.Khoa()` trong `host.New` — khóa mức TỆP, chặn TUI/headless mở cùng
//     một cuốn. Nó cần thiết vì `IO.WithWriteLock` chỉ là mutex trong process.
//   - `raoGhi` + hàng rào địa chỉ trong `rao.go` — studio giờ giữ khóa API và tiêu
//     được tiền, nên nó phải từ chối lệnh ghi từ mọi nguồn không phải chính nó.
//
// Nhóm route ghi chỉ được mắc khi địa chỉ lắng nghe là loopback. Chạy ra ngoài
// loopback thì package này lui về đúng hành vi chỉ-đọc cũ.
//
// # Vì sao tail queue thay vì hook vào engine
//
// observer đã ghi mọi sự kiện vào runtime queue kèm Seq tăng đơn điệu
// (observer.persistEvent → RuntimeStore.AppendQueue). SSE chỉ cần đọc
// LoadQueueAfter(seq). Nhờ vậy package này không chạm một dòng nào của core —
// điều quan trọng với một fork đang phải đuổi theo upstream phát triển nhanh.
// Seq cũng map thẳng sang Last-Event-ID nên client kết nối lại không bỏ sót.
//
// # Vì sao chuỗi ở đây KHÔNG đi qua i18n
//
// Đây là ngoại lệ duy nhất trong repo, và nó có chủ đích. Ghi lại để không ai
// "sửa" nó thành đúng-hình-thức mà sai-mục-đích.
//
// Lớp i18n của repo dùng chính chuỗi tiếng Trung làm msgid, và locale zh là
// catalog RỖNG — mọi msgid rơi về chính nó, tức đúng chuỗi gốc của upstream. Cơ
// chế đó tồn tại cho MỘT việc: đối chiếu hành vi với upstream (xem
// i18n.EnvLocale). Nó chỉ chạy được khi có một chuỗi upstream để rơi về.
//
// Package này là mã mới của fork, upstream không có `serve`. Nên bọc chuỗi ở đây
// đòi phải TỰ BỊA msgid tiếng Trung cho từng câu — 18 câu tiếng Trung do người
// không viết tiếng Trung soạn, đặt vào một fork tiếng Việt, để phục vụ một phép
// đối chiếu không tồn tại. Cái giá là thật, cái lợi thì không.
//
// Nên chuỗi ở đây là tiếng Việt trực tiếp, và `AINOVEL_LANG=zh` KHÔNG đổi được
// chúng. Đó là hệ quả đã biết, không phải lỗi bỏ sót.
//
// Điều này KHÔNG áp cho phần còn lại của repo: mọi chuỗi có nguyên bản tiếng
// Trung đều phải qua i18n.F/T, và có bộ canh soi mã nguồn để bảo đảm
// (internal/i18n/quetnguon_test.go, internal/serve/web_chu_test.go).
package serve

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/huuhoa143/ainovel-studio/internal/domain"
	"github.com/huuhoa143/ainovel-studio/internal/store"
)

var errNotInitialized = errors.New("thư mục này chưa có dữ liệu tác phẩm (thiếu meta/progress.json)")

// rawJSON để nguyên khối JSON thô khi đưa vào payload, thay vì bọc thành chuỗi.
type rawJSON json.RawMessage

func (r rawJSON) MarshalJSON() ([]byte, error) {
	if len(r) == 0 {
		return []byte("null"), nil
	}
	return r, nil
}

// Command là điểm vào của lệnh con `ainovel-cli serve`.
func Command(argv []string) int {
	fs := flag.NewFlagSet("serve", flag.ContinueOnError)
	addr := fs.String("addr", "127.0.0.1:8420", "địa chỉ lắng nghe")
	root := fs.String("root", filepath.Join("output"), "thư mục gốc chứa các tác phẩm")
	book := fs.String("book", "", "chỉ phục vụ một tác phẩm (tên thư mục con trong root)")
	webDir := fs.String("web", "", "thư mục web tĩnh đã build (rỗng = chỉ chạy API)")
	if err := fs.Parse(argv); err != nil {
		return 2
	}

	// Mặc định chỉ lắng nghe localhost: store chứa toàn văn tác phẩm chưa phát
	// hành và khóa cấu hình, mở ra mọi giao diện mạng là rò rỉ mặc định.
	if err := warnIfPublic(*addr); err != nil {
		fmt.Fprintf(os.Stderr, "serve: %v\n", err)
	}

	// Đường GHI chỉ bật trên loopback, và đây là TỪ CHỐI chứ không phải cảnh báo.
	//
	// Từ khi studio ghi được, một yêu cầu từ người lạ không chỉ đọc được bản thảo mà còn
	// khởi động được engine (đốt tiền API thật) và đặt được khóa API. Người dùng đã chọn
	// không có mật khẩu, nên hàng rào địa chỉ chính là thứ thay cho việc xác thực —
	// không thể để nó là một dòng cảnh báo rồi vẫn chạy.
	choGhi := laDiaChiCucBo(*addr)

	srv := &server{root: *root, onlyBook: *book, webDir: *webDir, choGhi: choGhi}
	if choGhi {
		srv.may = newBoMay(*root)
		defer srv.may.dongTatCa()
	}
	mux := srv.routes()

	fmt.Fprintf(os.Stdout, "ainovel studio đang chạy tại http://%s\n", *addr)
	fmt.Fprintf(os.Stdout, "  thư mục gốc: %s\n", *root)
	if choGhi {
		fmt.Fprintln(os.Stdout, "  chế độ: đầy đủ — tạo, chạy, can thiệp được từ giao diện")
	} else {
		fmt.Fprintf(os.Stderr,
			"  chế độ: CHỈ ĐỌC — %s không phải loopback nên đường ghi bị tắt.\n"+
				"          Muốn dùng đầy đủ thì chạy với --addr 127.0.0.1:8420.\n", *addr)
	}
	if *webDir == "" {
		fmt.Fprintln(os.Stdout, "  chế độ: chỉ API (dùng --web để phục vụ giao diện đã build)")
	}

	httpSrv := &http.Server{
		Addr:              *addr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
		// Không đặt WriteTimeout: SSE là kết nối dài, WriteTimeout sẽ cắt stream
		// giữa phiên theo đồng hồ chứ không theo lỗi thật.
	}
	if err := httpSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		fmt.Fprintf(os.Stderr, "serve: %v\n", err)
		return 1
	}
	return 0
}

// warnIfPublic cảnh báo khi lắng nghe ra ngoài loopback.
//
// Dùng chung `laDiaChiCucBo` thay vì tự so chuỗi. Bản cũ liệt kê tay `case "", "127.0.0.1",
// "localhost", "::1"` và vì thế IM LẶNG với `--addr :8420` — dạng viết tắt của 0.0.0.0,
// tức nghe mọi giao diện. Đúng cái nó tồn tại để cảnh báo thì nó bỏ qua.
func warnIfPublic(addr string) error {
	if laDiaChiCucBo(addr) {
		return nil
	}
	return fmt.Errorf("đang lắng nghe %s — store chứa toàn văn chưa phát hành, đừng mở ra mạng công cộng", addr)
}

type server struct {
	root     string
	onlyBook string
	webDir   string

	// choGhi bật nhóm route ghi. Tách khỏi `may != nil` để `routes()` đọc được ý định một
	// cách tường minh, và để test dựng được ca "chỉ đọc" mà không phải mò.
	choGhi bool
	may    *boMay
}

func (s *server) routes() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/workshop", s.handleWorkshop)
	// Tờ tổng của cả xưởng, tách khỏi `/api/workshop` vì hai route có hai nhịp đọc khác
	// nhau — xem chú thích đầu workshop_cost.go.
	mux.HandleFunc("GET /api/workshop/cost", s.handleWorkshopCost)
	mux.HandleFunc("GET /api/books/{book}/studio", s.handleStudio)
	mux.HandleFunc("GET /api/books/{book}/chapters/{n}", s.handleChapter)
	mux.HandleFunc("GET /api/books/{book}/outline", s.handleOutline)
	mux.HandleFunc("GET /api/books/{book}/cast", s.handleCast)
	mux.HandleFunc("GET /api/books/{book}/world", s.handleWorld)
	mux.HandleFunc("GET /api/books/{book}/style", s.handleStyle)
	mux.HandleFunc("GET /api/books/{book}/cost", s.handleCost)
	mux.HandleFunc("GET /api/books/{book}/settings", s.handleSettings)
	mux.HandleFunc("GET /api/books/{book}/events", s.handleEvents)
	// Chẩn đoán chỉ ĐỌC store, nên nó ở nhóm đọc: phải chạy được đúng lúc engine không mở
	// được — đó chính là lúc người ta cần nó.
	mux.HandleFunc("GET /api/books/{book}/diag", s.handleChanDoan)

	// Nhóm GHI. Không mắc vào mux khi không cho ghi — trả 404 thay vì 403 là có chủ ý:
	// route không tồn tại thì không có gì để dò, và giao diện đã có `/api/engine` để hỏi
	// trạng thái nên nó không cần đoán từ mã lỗi.
	if s.choGhi && s.may != nil {
		mux.HandleFunc("GET /api/engine", s.handleMay)
		mux.HandleFunc("POST /api/books", raoGhi(s.handleTaoSach))
		// Xóa nằm ở nhóm GHI: bản chỉ-đọc không được phép xóa gì của ai.
		mux.HandleFunc("DELETE /api/books/{book}", raoGhi(s.handleXoaSach))
		mux.HandleFunc("POST /api/books/{book}/open", raoGhi(s.handleMoMay))
		mux.HandleFunc("POST /api/books/{book}/run", raoGhi(s.handleChay))
		mux.HandleFunc("POST /api/books/{book}/steer", raoGhi(s.handleCanThiep))
		mux.HandleFunc("POST /api/books/{book}/abort", raoGhi(s.handleDung))
		mux.HandleFunc("POST /api/books/{book}/close", raoGhi(s.handleDongMay))
		mux.HandleFunc("GET /api/books/{book}/live", s.handleSong)

		// Cấu hình: GET không qua `raoGhi` vì nó chỉ đọc (và đã che khóa), PUT thì qua.
		mux.HandleFunc("GET /api/config", s.handleDocCauHinh)
		mux.HandleFunc("PUT /api/config", raoGhi(s.handleGhiCauHinh))
		// Liệt kê model của một nhà cung cấp — QUA raoGhi, dù là GET.
		//
		// Nó không đổi gì trong cấu hình, nhưng nó phát một yêu cầu RA NGOÀI kèm khóa API.
		// Một GET không hàng rào thì trang bất kỳ kích được bằng \:
		// không đọc nổi kết quả, nhưng vẫn khiến studio gọi ra ngoài. Và nó lệch luật của
		// chính tệp này — mọi thứ chạm khóa đều nằm sau hàng rào.
		mux.HandleFunc("GET /api/models", raoGhi(s.handleLietKeModel))
		mux.HandleFunc("POST /api/models/try", raoGhi(s.handleThuKetNoi))
		mux.HandleFunc("GET /api/books/{book}/models", s.handleDocVaiModel)
		mux.HandleFunc("PUT /api/books/{book}/models", raoGhi(s.handleGhiVaiModel))
		mux.HandleFunc("POST /api/books/{book}/models/apply", raoGhi(s.handleApDungCauHinh))

		// Vòng đời sáng tác — bản web của /review, /next, /reopen.
		mux.HandleFunc("PUT /api/books/{book}/advance-mode", raoGhi(s.handleDoiCheDoTien))
		mux.HandleFunc("POST /api/books/{book}/advance", raoGhi(s.handleChoDiTiep))
		mux.HandleFunc("POST /api/books/{book}/reopen", raoGhi(s.handleMoLai))

		// Engine hỏi người dùng — luồng CHẶN. Câu hỏi đi kèm /live; đây là đường trả lời.
		mux.HandleFunc("POST /api/books/{book}/ask", raoGhi(s.handleTraLoiHoi))

		// Cùng dựng — đối thoại nhiều lượt. Lịch sử do client giữ, xem cung_dung.go.
		mux.HandleFunc("POST /api/cocreate", raoGhi(s.handleCungDungMoSach))
		mux.HandleFunc("POST /api/books/{book}/stage-cocreate", raoGhi(s.handleCungDungGiaiDoan))

		// Luồng tệp: tải lên để nhập / mô phỏng, tải về để xuất bản.
		mux.HandleFunc("POST /api/books/{book}/import", raoGhi(s.handleNhap))
		mux.HandleFunc("POST /api/books/{book}/simulate", raoGhi(s.handleMoPhong))
		mux.HandleFunc("POST /api/books/{book}/simulate/profile", raoGhi(s.handleNhapHoSoMoPhong))
		mux.HandleFunc("POST /api/books/{book}/export", raoGhi(s.handleXuatBan))
	}

	if s.webDir != "" {
		mux.Handle("/", webTinh(s.webDir))
	}
	return mux
}

// openBook mở store của một tác phẩm sau khi đã kiểm tên thư mục.
func (s *server) openBook(id string) (*store.Store, error) {
	dir, err := s.bookDir(id)
	if err != nil {
		return nil, err
	}
	if _, err := os.Stat(filepath.Join(dir, "meta", "progress.json")); err != nil {
		return nil, errNotInitialized
	}
	return store.NewStore(dir), nil
}

// bookDir dịch id thành đường dẫn, chặn thoát khỏi thư mục gốc.
//
// id đến từ URL nên phải coi là dữ liệu không tin được: "../../../etc" hay
// đường dẫn tuyệt đối sẽ đọc được file ngoài xưởng. Chỉ nhận đúng một đoạn tên,
// không chứa dấu phân cách, và đối chiếu lại bằng đường dẫn đã giải quyết.
func (s *server) bookDir(id string) (string, error) {
	if s.onlyBook != "" && id != s.onlyBook {
		return "", fmt.Errorf("tác phẩm %q không được phục vụ ở phiên này", id)
	}
	if id == "" || id == "." || id == ".." ||
		strings.ContainsAny(id, `/\`) || filepath.IsAbs(id) {
		return "", fmt.Errorf("tên tác phẩm không hợp lệ: %q", id)
	}

	rootAbs, err := filepath.Abs(s.root)
	if err != nil {
		return "", err
	}
	dir := filepath.Join(rootAbs, id)
	// Chốt lần hai sau khi ghép. Hai lớp này KHÔNG lớp nào dư — đã kiểm bằng
	// cách bỏ từng lớp và xem test hỏng ở đâu:
	//   - lớp trên bắt: đường dẫn tuyệt đối ("/etc/passwd"), tên nhiều đoạn
	//     ("sub/dir"), dấu phân cách Windows
	//   - lớp này bắt: ".." và "../etc" — filepath.Join làm sạch chúng thành
	//     đường dẫn hợp lệ TRÔNG vô hại, chỉ so tiền tố mới thấy nó đã ra ngoài
	if dir != rootAbs && !strings.HasPrefix(dir, rootAbs+string(os.PathSeparator)) {
		return "", fmt.Errorf("tên tác phẩm không hợp lệ: %q", id)
	}
	return dir, nil
}

// maBanDung nhận diện bản dựng giao diện đang nằm trên đĩa.
//
// Đọc tên thư mục `_next/static/<id>` mà `next build` sinh mới ở mỗi lượt dựng. Không có nó
// (chạy chế độ chỉ-API, hoặc một bộ dựng khác) thì lùi về dấu vân của `index.html` — kích
// thước cộng mốc sửa đổi, đủ để phát hiện "tệp đã đổi" mà không phải băm cả thư mục.
//
// Trả rỗng khi không có thư mục web: lúc đó giao diện không do ta phục vụ, và một mã bịa sẽ
// làm mọi tab báo "bản dựng đã đổi" ở lần đầu tiên.
func (s *server) maBanDung() string {
	if s.webDir == "" {
		return ""
	}
	if muc, err := os.ReadDir(filepath.Join(s.webDir, "_next", "static")); err == nil {
		for _, m := range muc {
			if m.IsDir() && m.Name() != "chunks" && m.Name() != "media" {
				return m.Name()
			}
		}
	}
	if st, err := os.Stat(filepath.Join(s.webDir, "index.html")); err == nil {
		return fmt.Sprintf("%d-%d", st.Size(), st.ModTime().UnixNano())
	}
	return ""
}

func (s *server) handleWorkshop(w http.ResponseWriter, r *http.Request) {
	ws, err := scanWorkshop(s.root, s.onlyBook)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	ws.WebBuild = s.maBanDung()
	// EngineOpen cần s.may — một trường của server, không phải của store — nên nó được đặt
	// ở đây chứ không trong scanWorkshop/bookFrom, cùng lý lẽ với Capabilities.Steer ở
	// handleStudio. `s.may == nil` (bản chỉ-đọc) thì mọi cuốn đều engine_open=false, đúng
	// giá trị zero của bool nên không cần gán tường minh cho ca đó.
	if s.may != nil {
		for i := range ws.Books {
			if _, err := s.may.dangMo(ws.Books[i].ID); err == nil {
				ws.Books[i].EngineOpen = true
			}
		}
	}
	writeJSON(w, ws)
}

func (s *server) handleStudio(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("book")
	st, err := s.openBook(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, err)
		return
	}
	selected, _ := strconv.Atoi(r.URL.Query().Get("chapter"))
	snap, err := buildSnapshot(st, id, selected)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	// Steer là khả năng của SERVER, không phải của store — nên nó được đặt ở đây chứ
	// không trong buildSnapshot. `buildSnapshot` chỉ biết thư mục tác phẩm; nó không biết
	// server có mắc nhóm route ghi hay không, và trước đây nó viết cứng `false` kèm một
	// chú thích nói "cần engine hợp tác". Engine giờ chạy trong process này, nên câu trả
	// lời đúng là: ghi được khi và chỉ khi nhóm route ghi tồn tại.
	snap.Capabilities.Steer = s.choGhi && s.may != nil

	// Trường sống (agents, advance, context, ...) chỉ có nghĩa khi engine đang mở CHO
	// ĐÚNG CUỐN NÀY. `buildSnapshot` không biết gì về bộ giám sát engine (s.may — nó
	// thuộc server, không thuộc store), nên phải nối ở đây, cùng chỗ Steer đã nối.
	// `dangMo` không tự mở mới: mở studio để ĐỌC một cuốn không được vô tình khởi động
	// engine (tốn tiền API) cho cuốn đó.
	if s.may != nil {
		if p, err := s.may.dangMo(id); err == nil {
			ts := chieuTruongSong(p.eng.Snapshot())
			snap.Agents = ts.Agents
			snap.IdleAgents = ts.IdleAgents
			snap.PendingSteer = ts.PendingSteer
			snap.RewriteReason = ts.RewriteReason
			snap.Recovery = ts.Recovery
			snap.InProgressChapter = ts.InProgressChapter
			snap.Advance = ts.Advance
			snap.Context = ts.Context
			snap.Runtime = ts.Runtime
		}
	}
	writeJSON(w, snap)
}

// Nguồn văn bản của một chương, trả kèm trong JSON để giao diện gọi tên đúng thứ
// nó đang hiện.
const (
	NguonNhap = "draft" // drafts/{NN}.draft.md — đang viết, chưa chốt
	NguonChot = "final" // chapters/{NN}.md — đã nghiệm thu
)

// noiDungChuong đọc văn bản một chương: ưu tiên bản nháp, thiếu thì lấy bản chốt.
//
// # Vì sao phải có hàm này thay vì dùng thẳng LoadChapterContent
//
// LoadChapterContent CHỈ đọc drafts/{NN}.draft.md, và đó là hợp đồng đúng của nó:
// năm điểm gọi trong internal/tools/ dựa vào nghĩa "có bản nháp hay chưa" để quyết
// định luồng — rõ nhất là novel_context_builders.go:261 dùng `draftWords > 0`. Cho
// nó ngã về bản chốt sẽ làm mọi chương đã nghiệm thu bị báo là "đang có nháp", tức
// sửa một lỗi hiển thị bằng cách phá logic engine.
//
// Nên chỗ ngã về phải nằm ở đây, tại tầng đọc-để-hiện.
//
// # Lỗi mà nó sửa
//
// Trên MỘT màn hình, bảng chương ghi `● đã nghiệm thu · 2.901 từ` còn tab Bản thảo
// cùng chương ghi "Chưa có bản thảo cho chương này". Đo được: chapters/01.md có
// nội dung trên đĩa mà API trả text rỗng. Chương đã chốt và chương nhập từ nguồn
// ngoài (host/imp ghi thẳng vào chapters/) không có tệp nháp nào cả.
//
// # Vì sao trả kèm nguồn
//
// Ngã về mà không nói là đổi một lỗi lấy một lỗi khác: giao diện đang gắn nhãn
// "Bản thảo", nên trả bản chốt dưới nhãn đó là hết rỗng nhưng thành gọi sai tên.
// Trường source để giao diện phân biệt được, và bỏ trống khi không có nội dung nào.
func noiDungChuong(st *store.Store, n int) (noiDung, error) {
	tho, _, err := st.Drafts.LoadChapterContent(n)
	if err != nil {
		return noiDung{}, err
	}
	nguon := NguonNhap
	if tho == "" {
		if tho, err = st.Drafts.LoadChapterText(n); err != nil {
			return noiDung{}, err
		}
		if tho == "" {
			return noiDung{}, nil
		}
		nguon = NguonChot
	}
	tieuDe, than := tachTieuDeH1(tho)
	return noiDung{Text: than, Words: domain.WordCount(than), Nguon: nguon, TieuDe: tieuDe}, nil
}

// noiDung là nội dung một chương đã tách khỏi lớp trình bày markdown.
//
// Gói lại thành struct thay vì trả bốn giá trị rời vì cả hai bên đọc đều cần cùng
// một phép biến đổi (tách H1, rồi đếm từ TRÊN phần đã tách). Bốn giá trị rời thì
// mỗi bên tự ghép, và bản sửa gần nhất trong repo này đúng là một lỗi kiểu đó:
// bề rộng khung sự kiện TUI được tính ở sáu chỗ theo hai công thức, nên một chỗ
// cắt mất chữ giữa từ.
type noiDung struct {
	Text  string // thân chương, ĐÃ tách dòng `# tiêu đề` mở đầu
	Words int    // đếm trên thân — không tính dòng tiêu đề
	Nguon string
	// TieuDe là tiêu đề đọc từ H1. Chỉ dùng khi dàn ý không có, xem handleChapter.
	TieuDe string
}

// tachTieuDeH1 tách dòng tiêu đề markdown mở đầu ra khỏi thân chương.
//
// # Lỗi mà nó sửa
//
// Tệp chương do engine ghi luôn mở bằng `# <tiêu đề>` — cùng quy ước mà
// internal/domain/runtime.go:101 dùng để đọc tên tác phẩm. Trước bản sửa này API
// trả tiêu đề HAI LẦN: một lần ở trường `title`, một lần nằm nguyên trong `text`.
// Giao diện đọc dựng `<h2>` từ `title` rồi in `text` thành từng đoạn, nên đoạn đầu
// của MỌI chương hiện ra là `# Hòm gỗ ở bến bắc`.
//
// Không chỉ là xấu. Cùng một dòng thừa làm sai thêm hai chỗ đo được:
//
//   - `words` đếm cả dòng tiêu đề, nên số từ mọi chương đều lệch lên vài từ. Bảng
//     chương và thanh dưới đều lấy từ số này.
//   - `excerpt` mở đầu bằng dấu thăng thay vì bằng văn.
//
// # Vì sao TRẢ tiêu đề ra chứ không bỏ đi
//
// `chapterTitle` lấy tiêu đề từ DÀN Ý, và dàn ý có thể không có mục cho chương này
// (chương nhập từ ngoài, dàn ý sửa tay, chương viết chen). Khi đó H1 là chỗ duy
// nhất còn tiêu đề — cắt mà không trả lại là đổi một lỗi trình bày lấy một lỗi mất
// dữ liệu.
func tachTieuDeH1(text string) (tieuDe, than string) {
	dauVan := strings.TrimLeft(text, " \t\r\n")
	if !strings.HasPrefix(dauVan, "# ") {
		return "", text
	}
	dong, con, _ := strings.Cut(dauVan, "\n")
	// Bỏ `《》` và dấu nháy y như runtime.go làm với tên tác phẩm: mô hình có lúc
	// bọc tiêu đề trong ngoặc kép hoặc ngoặc sách.
	tieuDe = strings.Trim(strings.TrimSpace(strings.TrimPrefix(dong, "# ")), "《》\"")
	return tieuDe, strings.TrimLeft(con, " \t\r\n")
}

func (s *server) handleChapter(w http.ResponseWriter, r *http.Request) {
	st, err := s.openBook(r.PathValue("book"))
	if err != nil {
		writeErr(w, http.StatusNotFound, err)
		return
	}
	n, err := strconv.Atoi(r.PathValue("n"))
	if err != nil || n <= 0 {
		writeErr(w, http.StatusBadRequest, fmt.Errorf("số chương không hợp lệ"))
		return
	}

	nd, err := noiDungChuong(st, n)
	if err != nil {
		writeErr(w, http.StatusNotFound, fmt.Errorf("chương %d chưa có nội dung", n))
		return
	}
	// Dàn ý là nguồn tiêu đề chính; H1 trong tệp chỉ là lưới đỡ. Không ngã về thì
	// chương nào không có mục dàn ý sẽ hiện "chưa đặt tiêu đề" dù tệp có tiêu đề.
	tieuDe := chapterTitle(st, n)
	if tieuDe == "" {
		tieuDe = nd.TieuDe
	}
	out := struct {
		Chapter  int       `json:"chapter"`
		Title    string    `json:"title,omitempty"`
		Words    int       `json:"words"`
		Text     string    `json:"text"`
		Source   string    `json:"source,omitempty"`
		Contract *Contract `json:"contract,omitempty"`
		Review   *Review   `json:"review,omitempty"`
	}{Chapter: n, Title: tieuDe, Words: nd.Words, Text: nd.Text, Source: nd.Nguon}

	if sel := buildSelection(st, n); sel != nil {
		out.Contract, out.Review = sel.Contract, sel.Review
	}
	writeJSON(w, out)
}

func (s *server) handleOutline(w http.ResponseWriter, r *http.Request) {
	st, err := s.openBook(r.PathValue("book"))
	if err != nil {
		writeErr(w, http.StatusNotFound, err)
		return
	}
	volumes, _ := st.Outline.LoadLayeredOutline()
	flat, _ := st.Outline.LoadOutline()
	premise, _ := st.Outline.LoadPremise()
	writeJSON(w, map[string]any{
		"premise": premise,
		"volumes": volumes,
		"flat":    flat,
	})
}

func (s *server) handleCast(w http.ResponseWriter, r *http.Request) {
	st, err := s.openBook(r.PathValue("book"))
	if err != nil {
		writeErr(w, http.StatusNotFound, err)
		return
	}
	chars, _ := st.Characters.Load()
	snapshots, _ := st.Characters.LoadLatestSnapshots()
	writeJSON(w, map[string]any{
		"characters": chars,
		"snapshots":  snapshots,
	})
}

func (s *server) handleWorld(w http.ResponseWriter, r *http.Request) {
	st, err := s.openBook(r.PathValue("book"))
	if err != nil {
		writeErr(w, http.StatusNotFound, err)
		return
	}
	rules, _ := st.World.LoadWorldRules()
	foreshadow, _ := st.World.LoadForeshadowLedger()
	relations, _ := st.World.LoadRelationships()
	writeJSON(w, map[string]any{
		"rules":      rules,
		"foreshadow": foreshadow,
		"relations":  relations,
	})
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	// Store là dữ liệu sống; bộ nhớ đệm của trình duyệt sẽ khiến giao diện hiện
	// tiến độ cũ sau khi tải lại trang.
	w.Header().Set("Cache-Control", "no-store")
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false) // giữ nguyên dấu tiếng Việt, không thoát thành \u
	if err := enc.Encode(v); err != nil {
		// Header đã gửi rồi nên không đổi được mã trạng thái; chỉ ghi log.
		fmt.Fprintf(os.Stderr, "serve: ghi JSON thất bại: %v\n", err)
	}
}

func writeErr(w http.ResponseWriter, code int, err error) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(map[string]string{"error": err.Error()})
}

// webTinh phục vụ bản dựng web tĩnh, và đặt `Cache-Control` KHÁC NHAU cho hai loại tệp.
//
// # Vì sao `http.FileServer` trần là một lỗi, không phải mặc định vô hại
//
// Nó không gửi `Cache-Control` nào cả — chỉ `Last-Modified`. Khi thiếu header đó, trình
// duyệt áp *heuristic caching*: giữ bản đã tải khoảng 10% khoảng thời gian kể từ
// `Last-Modified` và KHÔNG hỏi lại server. Với một tệp sửa vài giờ trước, đó là hàng chục
// phút phục vụ đồ cũ trong im lặng.
//
// ĐO ĐƯỢC trên máy thật: sau khi dựng lại giao diện, trình duyệt vẫn hiện nút phiên bản cũ
// dù bản dựng trên đĩa đã đổi — và cách duy nhất thoát ra là tải lại cứng. Bắt người dùng
// nhớ `Cmd+Shift+R` sau mỗi lần cập nhật là chuyển một lỗi của server thành nghĩa vụ của họ.
//
// # Vì sao hai luật chứ không một
//
// Next.js băm nội dung vào TÊN tệp của mọi thứ dưới `/_next/static/`. Tên đổi khi nội dung
// đổi, nên bản cũ không bao giờ bị nhầm là bản mới:
//
//	/_next/static/**  → immutable một năm. Tải một lần, không hỏi lại lần nào nữa.
//	mọi thứ khác      → `no-cache`, tức PHẢI hỏi lại server trước khi dùng.
//
// `index.html` thuộc nhóm thứ hai, và nó là mắt xích quyết định: nó chứa tên băm của các
// chunk. Nó mới thì mọi thứ khác tự mới theo; nó cũ thì trình duyệt còn đi lấy chunk cũ dù
// chunk mới đã nằm sẵn trên đĩa.
//
// `no-cache` KHÔNG phải `no-store`: bản sao vẫn được giữ, chỉ là phải hỏi lại. `Last-Modified`
// làm lượt hỏi đó trả 304 rỗng, nên giá của việc luôn-đúng gần bằng không.
func webTinh(dir string) http.Handler {
	tep := http.FileServer(http.Dir(dir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// So trên đường dẫn ĐÃ CHUẨN HÓA, không phải path thô.
		//
		// `http.ServeMux` chuẩn hóa và chuyển hướng trước khi tới đây, nên hôm nay path thô
		// vẫn ra kết quả đúng. Nhưng đây là hàm công khai của package và nó không được dựa
		// vào một tầng khác giữ đúng hành vi mãi mãi: gọi thẳng `webTinh` với
		// `/_next/static/../index.html` thì bản trước gắn `immutable` MỘT NĂM lên đúng tệp
		// phải luôn hỏi lại — đã đo. `path.Clean` đóng hẳn đường đó với một dòng.
		if strings.HasPrefix(path.Clean(r.URL.Path), "/_next/static/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			w.Header().Set("Cache-Control", "no-cache")
		}
		tep.ServeHTTP(w, r)
	})
}
