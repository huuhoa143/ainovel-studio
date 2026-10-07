package serve

import (
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/huuhoa143/ainovel-studio/assets"
	"github.com/huuhoa143/ainovel-studio/internal/bootstrap"
	"github.com/huuhoa143/ainovel-studio/internal/domain"
	"github.com/huuhoa143/ainovel-studio/internal/entry/startup"
	"github.com/huuhoa143/ainovel-studio/internal/host"
)

// Bộ giám sát engine — phần cho phép studio GHI, không chỉ đọc.
//
// # Vì sao engine chạy TRONG process này chứ không phải process con
//
// Ba sự thật đo được, cái thứ hai là cái quyết định:
//
//  1. `AskUser` là một hàm Go (`tools.AskUserHandler`) mà engine gọi rồi CHẶN chờ trả
//     lời. In-process thì cầu nối tới trình duyệt chỉ là một channel. Nếu spawn process
//     con thì phải phát minh một giao thức IPC cho đúng việc đó, và giao thức ấy là thứ
//     duy nhất mới trong toàn bộ thiết kế.
//
//  2. `store.IO.WithWriteLock` chỉ là `io.mu.Lock()` — một mutex TRONG PROCESS, không
//     phải khóa tệp. Nên hai process cùng mở một cuốn sách thì không có bảo vệ nào cả.
//     Một process là thiết kế duy nhất an toàn với store hiện tại.
//
//  3. `emitEvent`/`emitDelta` không bao giờ chặn engine (drop-oldest ở host.go), và SSE
//     của studio đọc từ `st.Runtime.LoadQueueAfter`. Nên engine in-process không phá
//     luồng sự kiện đang có: engine vẫn ghi hàng đợi xuống store, studio vẫn đuôi theo.
//
// Điều này GIẢI QUYẾT TẬN GỐC phản biện đã ghi ở README.md — "nếu studio cũng ghi thì
// hai process cùng sửa meta/run_meta.json và ý kiến can thiệp có thể mất trắng". Không
// còn hai process: studio LÀ người ghi duy nhất.
//
// # Đổi lại cái gì
//
// Engine sập thì mất luôn studio. Chấp nhận được vì studio không có giá trị độc lập khi
// engine đã chết — nhưng vòng chạy có `recover` để HTTP còn sống mà HIỆN lỗi ra, thay vì
// người dùng thấy trình duyệt mất kết nối và không biết vì sao.

// boMay giữ engine đang mở cho từng tác phẩm.
//
// Dựng dạng map để về sau mở được nhiều sách cùng lúc, nhưng `soToiDa` hiện là 1: hai
// cuốn cùng chạy là gấp đôi tiền và gấp đôi RAM, đó là quyết định của người dùng chứ
// không phải của mã. Map làm cho việc nới ra sau này không phải đổi hình dạng gì.
type boMay struct {
	mu       sync.Mutex
	root     string
	soToiDa  int
	dang     map[string]*phienMay
	napConfg func() (bootstrap.Config, error) // tách ra để test tiêm được

	// dangTat bật ở đầu dongTatCa và không bao giờ tắt lại. Canh bởi mu.
	//
	// Yêu cầu không-SSE được chạy tiếp trong thời hạn tắt êm, và khi quá hạn handler vẫn có
	// thể đang chạy SAU lúc dongTatCa đã quét xong map. Không có cờ này thì một handler như thế
	// gọi `mo` là mở một engine MỚI không ai đóng — giữ khóa truyện tới khi process chết.
	dangTat bool
}

// mocBayGio là một chỗ duy nhất lấy thời điểm hiện tại trong gói này.
//
// Gói lại thành hàm chứ không rải `time.Now()` khắp nơi: các mốc trong bộ giám sát (mở
// lúc nào, chạy từ khi nào) được đọc lên giao diện, và hai công thức lấy giờ khác nhau
// là hai mốc lệch nhau mà không ai kiểm.
func mocBayGio() time.Time { return time.Now() }

func newBoMay(root string) *boMay {
	return &boMay{
		root:     root,
		soToiDa:  1,
		dang:     map[string]*phienMay{},
		napConfg: bootstrap.LoadConfig,
	}
}

// phienMay là một engine đang mở cho một cuốn sách.
type phienMay struct {
	id     string
	eng    *host.Host
	moLuc  time.Time
	chayTu time.Time

	// hoi là cầu nối `ask_user`: engine hỏi rồi CHẶN chờ trả lời từ trình duyệt.
	// Xem hoi_nguoi_dung.go — đây là lý do quyết định cho việc engine chạy in-process.
	hoi *cauNoiHoi

	// van là bộ đệm chữ model đang sinh ra. Một bộ đệm cho mỗi phiên, và đúng một
	// goroutine hút channel của engine vào nó — xem dong_van.go cho vì sao không để mỗi
	// kết nối SSE tự nhận từ channel.
	van *dongVan

	// mu chỉ canh ba trường dưới. Không dùng mu của boMay: một phiên báo lỗi không
	// được chặn phiên khác đang mở.
	mu      sync.Mutex
	loiCuoi error
	daDung  bool
}

func (p *phienMay) datLoi(err error) {
	p.mu.Lock()
	p.loiCuoi = err
	p.daDung = true
	p.mu.Unlock()
}

func (p *phienMay) tinhTrang() (loi error, dung bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.loiCuoi, p.daDung
}

var (
	errQuaNhieuMay = errors.New("Studio chỉ viết một truyện mỗi lúc")
	errChuaMoMay   = errors.New("tác phẩm này chưa mở engine")
	errDangTat     = errors.New("Studio đang tắt, không mở thêm engine")
)

// mo mở engine cho một cuốn, hoặc trả lại engine đang mở.
//
// Đây là điểm vào DUY NHẤT tạo `*host.Host` trong gói này. Mọi route ghi đi qua nó, nên
// khóa tệp và hạn mức số engine chỉ cần thi hành ở một chỗ.
func (b *boMay) mo(id string) (*phienMay, error) {
	dir, err := (&server{root: b.root}).bookDir(id)
	if err != nil {
		return nil, err
	}

	b.mu.Lock()
	defer b.mu.Unlock()

	if b.dangTat {
		return nil, errDangTat
	}
	if p, ok := b.dang[id]; ok {
		return p, nil
	}
	if len(b.dang) >= b.soToiDa {
		if err := b.nhuongCho(); err != nil {
			return nil, err
		}
	}

	cfg, err := b.napConfg()
	if err != nil {
		return nil, fmt.Errorf("đọc cấu hình: %w", err)
	}
	// OutputDir là trường LÚC CHẠY (`json:"-"` trong bootstrap.Config), không đọc từ
	// tệp cấu hình. Mặc định của nó là "output/novel" tính theo thư mục làm việc — tức
	// engine gốc chỉ biết MỘT cuốn cho mỗi CWD. Studio phục vụ nhiều cuốn dưới một gốc,
	// nên gán tường minh ở đây chính là cách đúng để chọn cuốn.
	cfg.OutputDir = dir
	cfg.FillDefaults()

	bundle := assets.Load(cfg.Style, assets.DefaultLoadOptions(cfg.OutputDir))
	// host.New lấy khóa tệp của thư mục (store.Khoa) và Close trả lại. Bản đầu của bộ
	// giám sát này tự lấy khóa riêng, và nó VÔ DỤNG: host.New có năm chỗ gọi, nên khóa
	// đặt ở serve chỉ chặn được serve tự đụng chính nó — không chặn được TUI hay headless,
	// tức đúng cái nó tồn tại để chặn.
	eng, err := host.New(cfg, bundle)
	if err != nil {
		return nil, err
	}

	p := &phienMay{id: id, eng: eng, moLuc: mocBayGio(), hoi: &cauNoiHoi{}, van: &dongVan{}}
	// Phải cắm handler TRƯỚC khi engine có cơ hội chạy. Không cắm thì `AskUserTool` gọi
	// vào handler nil và engine đứng im mà không ai biết nó đang chờ gì.
	eng.AskUser().SetHandler(p.hoi.handler)
	// Hút văn sống ngay khi mở, KHÔNG chờ tới lúc chạy: `tao` gọi PrepareQuick (một lượt
	// Arbiter thật) ngay sau `mo`, nên bắt đầu hút muộn hơn là bỏ mất đúng lượt đầu tiên —
	// lượt mà người dùng đang ngồi chờ và không biết máy có làm gì không.
	go p.van.hut(eng.Stream())
	b.dang[id] = p
	slog.Info("studio mở engine", "module", "serve", "book", id, "dir", dir)
	return p, nil
}

// nhuongCho giải phóng suất engine khi nó đang bị một phiên RẢNH giữ. Gọi khi đã giữ b.mu.
//
// Đo được trên truyện thật: viết xong một truyện, bấm "Viết truyện mới" thì nhận câu "đã có
// một tác phẩm đang mở engine; dừng nó trước khi mở cuốn khác" — trong khi cuốn kia đã XONG và
// không làm gì. Phiên rảnh chỉ còn giữ khóa tệp; đóng nó không mất gì (mọi thứ đã lưu xuống
// đĩa, mở lại là khôi phục được), nên bắt người dùng đi tìm nút "Đóng phiên" ở cuốn kia là
// một bước thừa đứng chắn đúng lối vào quan trọng nhất.
//
// Chỉ phiên ĐANG BẬN mới được giữ suất: đang chạy / đang dừng dở, hoặc đang chờ người dùng trả
// lời một câu hỏi — đóng lúc đó là vứt việc đang làm. Ca ấy trả lỗi NÊU TÊN cuốn đang giữ để
// người dùng biết phải sang đâu.
func (b *boMay) nhuongCho() error {
	for id, p := range b.dang {
		if dangBan(p) {
			return fmt.Errorf("%w: «%s» đang viết. Tạm dừng nó trước, rồi mở truyện này",
				errQuaNhieuMay, tenHien(p))
		}
		delete(b.dang, id)
		dongPhien(p)
		slog.Info("studio đóng phiên rảnh để nhường suất", "module", "serve", "book", id)
	}
	return nil
}

// docMay đọc trạng thái tự khai và tên truyện của một phiên. Biến chứ không gọi thẳng để bài
// kiểm dựng được ca "phiên bận / phiên rảnh" mà không phải mở một engine thật.
var docMay = func(p *phienMay) (runtime, ten string) {
	s := p.eng.Snapshot()
	return s.RuntimeState, s.NovelName
}

// daXong: truyện đã kết theo STORE (`Phase == complete`), không theo trạng thái tự khai của
// engine — engine vừa mở lại sau khi khởi động studio còn báo `idle` cho một truyện đã xong,
// và đọc trạng thái đó thì nút "Viết thêm" lại rơi về Resume rỗng.
var daXong = func(p *phienMay) bool {
	s := p.eng.Snapshot()
	return s.RuntimeState == "completed" || s.Phase == "complete"
}

// dongPhien đóng engine của một phiên (trả khóa tệp). Biến vì cùng lý do với `docMay`.
var dongPhien = func(p *phienMay) { p.eng.Close() }

// dangBan: phiên đang làm việc hoặc đang chờ người dùng — không được đóng ngầm.
func dangBan(p *phienMay) bool {
	if p.hoi != nil && p.hoi.dangCho() != nil {
		return true
	}
	rt, _ := docMay(p)
	return rt == "running" || rt == "pausing"
}

// tenHien là tên truyện người dùng đọc được, rơi về mã thư mục khi chưa có tên.
func tenHien(p *phienMay) string {
	if _, n := docMay(p); strings.TrimSpace(n) != "" {
		return strings.TrimSpace(n)
	}
	return p.id
}

// dangMo trả phiên đang mở, không tự mở mới.
//
// Tách khỏi `mo` vì hai nhóm route có nghĩa khác nhau: can thiệp / dừng chỉ có nghĩa khi
// engine ĐANG mở, còn tạo / chạy tiếp thì mở nếu cần. Gộp lại sẽ khiến một cú "dừng" gõ
// sai tên sách âm thầm KHỞI ĐỘNG một engine mới.
func (b *boMay) dangMo(id string) (*phienMay, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if p, ok := b.dang[id]; ok {
		return p, nil
	}
	return nil, errChuaMoMay
}

// dong đóng engine và trả khóa.
func (b *boMay) dong(id string) error {
	b.mu.Lock()
	p, ok := b.dang[id]
	if ok {
		delete(b.dang, id)
	}
	b.mu.Unlock()
	if !ok {
		return errChuaMoMay
	}
	// Close trả cả khóa tệp của thư mục (xem store.MoKhoa trong host.Close).
	p.eng.Close()
	slog.Info("studio đóng engine", "module", "serve", "book", id)
	return nil
}

// dongTatCa dùng lúc tắt server. Trả khóa cho mọi cuốn để lần chạy sau không gặp khóa mồ côi.
//
// Bật dangTat CÙNG lượt khóa với lượt chụp danh sách: mọi `mo` sau đó bị từ chối, nên danh sách
// này là đầy đủ — không engine nào mở chen vào sau lúc quét mà sống sót qua lúc tắt.
func (b *boMay) dongTatCa() {
	b.mu.Lock()
	b.dangTat = true
	ids := make([]string, 0, len(b.dang))
	for id := range b.dang {
		ids = append(ids, id)
	}
	b.mu.Unlock()
	for _, id := range ids {
		if err := b.dong(id); err != nil {
			slog.Warn("đóng engine lỗi", "module", "serve", "book", id, "err", err)
		}
	}
}

// tao bắt đầu một tác phẩm mới từ một câu yêu cầu.
//
// Thứ tự ba bước LẤY ĐÚNG từ headless.Run: PrepareQuick → PrepareUserRules → StartPrepared.
// `PrepareUserRules` phải chạy TRƯỚC `StartPrepared` vì nó chốt ảnh chụp luật người dùng
// cho cả cuốn; đảo thứ tự thì cuốn sách chạy với luật của lần trước.
func (b *boMay) tao(id, yeuCau string) (*phienMay, error) {
	yeuCau = strings.TrimSpace(yeuCau)
	if yeuCau == "" {
		return nil, errors.New("thiếu câu yêu cầu truyện")
	}

	// Cuốn này đã có trên đĩa TRƯỚC lượt gọi chưa?
	//
	// Phải hỏi ở đây, trước `mo`. Hỏi sau thì lúc nào cũng thấy "đã có" — vì chính `mo`
	// vừa tạo nó — và nhánh dọn sẽ không bao giờ chạy.
	dir, err := (&server{root: b.root}).bookDir(id)
	if err != nil {
		return nil, err
	}
	_, errStat := os.Stat(dir)
	moiTinh := errors.Is(errStat, os.ErrNotExist)

	p, err := b.mo(id)
	if err != nil {
		return nil, err
	}

	// Từ đây xuống, MỌI nhánh lỗi phải trả máy về đúng trạng thái trước lượt gọi.
	//
	// Bản trước chỉ `return nil, err`, và cái giá của nó đã đo được trên máy thật: một
	// khóa API sai làm Arbiter trả 404, rồi để lại BA thứ rác cùng lúc —
	//
	//   1. thư mục cuốn đã nằm trên đĩa (meta/ đủ 6 tệp, 0 chương), hiện lên bảng Quản lý
	//      như một tác phẩm bình thường;
	//   2. engine vẫn MỞ. `soToiDa` là 1, nên một cuốn chết giữ luôn cái slot duy nhất và
	//      người dùng không mở được cuốn nào khác — studio coi như hỏng;
	//   3. không có đường nào gỡ hai thứ trên từ giao diện.
	//
	// Lỗi khi đang tạo là chuyện BÌNH THƯỜNG (gõ sai tên model, khóa hết hạn, mạng rớt).
	// Một thao tác thất bại phải không để lại dấu vết, nếu không mỗi lần gõ sai là một
	// lần người dùng phải mở terminal đi dọn tay.
	donDep := func(err error) error {
		if errDong := b.dong(id); errDong != nil {
			slog.Warn("dọn sau khi tạo hỏng: đóng engine không xong",
				"module", "serve", "book", id, "err", errDong)
		}
		// CHỈ xóa thư mục nếu chính lượt này tạo ra nó. Cuốn có sẵn mà tạo đè lỗi thì xóa
		// là mất bản thảo của người ta — thà để lại rác còn hơn.
		if moiTinh {
			if errXoa := os.RemoveAll(dir); errXoa != nil {
				slog.Warn("dọn sau khi tạo hỏng: xóa thư mục không xong",
					"module", "serve", "book", id, "dir", dir, "err", errXoa)
			}
		}
		slog.Info("tạo tác phẩm hỏng, đã dọn", "module", "serve",
			"book", id, "xóa_thư_mục", moiTinh, "err", err)
		return err
	}

	plan, err := startup.PrepareQuick(startup.Request{
		Mode:        startup.ModeQuick,
		UserPrompt:  yeuCau,
		OutputDir:   p.eng.Dir(),
		Interactive: true,
	})
	if err != nil {
		return nil, donDep(err)
	}
	if err := p.eng.PrepareUserRules(plan.RawPrompt); err != nil {
		return nil, donDep(err)
	}
	if err := p.eng.StartPrepared(plan.RawPrompt); err != nil {
		return nil, donDep(err)
	}
	p.chayTu = mocBayGio()
	b.theoDoi(p)
	return p, nil
}

// chay chạy tiếp một cuốn đã có phiên khôi phục được.
func (b *boMay) chay(id string) (string, error) {
	p, err := b.mo(id)
	if err != nil {
		return "", err
	}
	// Truyện đã XONG thì "chạy" chỉ có một nghĩa: viết thêm. Không mở lại trước thì Resume
	// không tìm được phiên nào và trả rỗng — đo được: nút "Viết thêm" trên truyện đã xong báo
	// "không có phiên nào khôi phục được", tức nút mang tên một việc mà không làm được việc đó.
	if err := moLaiNeuDaXong(p, ""); err != nil {
		return "", err
	}
	nhan, err := p.eng.Resume()
	if err != nil {
		return "", err
	}
	if nhan == "" {
		return "", errors.New("không có phiên nào khôi phục được cho tác phẩm này")
	}
	p.chayTu = mocBayGio()
	b.theoDoi(p)
	return nhan, nil
}

// canThiep gửi một câu của người vận hành vào dây chuyền.
//
// Chọn Steer hay Continue theo ĐÚNG luật của TUI (handleEnterKey, model_update.go:334):
// đang chạy thì Steer (tiêm vào lượt đang chạy), đã dừng thì Continue (đánh thức lượt
// mới). Nếu web tự chọn khác thì cùng một ô nhập sẽ có hai nghĩa giữa hai giao diện.
func (b *boMay) canThiep(id, chu string) (string, error) {
	chu = strings.TrimSpace(chu)
	if chu == "" {
		return "", errors.New("câu can thiệp rỗng")
	}
	p, err := b.dangMo(id)
	if err != nil {
		// Engine chưa mở. Hai ca, và chúng khác nhau về NGHĨA chứ không chỉ về trạng thái:
		//
		//   · truyện CHƯA kết — câu này là góp ý cho một lượt đang/sắp chạy, mà không có
		//     lượt nào cả. "Chưa mở engine" là câu trả lời đúng; người dùng bấm Viết tiếp.
		//   · truyện ĐÃ kết — câu này là HƯỚNG viết thêm, tức một yêu cầu BẮT ĐẦU làm việc
		//     lại. Đó đúng lớp "tạo / chạy tiếp" mà `mo` phục vụ, không phải lớp "can thiệp
		//     vào việc đang chạy" mà `dangMo` canh.
		//
		// Thiếu vế hai thì cả luồng "Viết thêm" chết: đo được trên truyện thật — bấm nút
		// "Viết thêm" ở thanh dưới, gõ hướng, gửi, và nhận đúng câu "tác phẩm này chưa mở
		// engine" mà người dùng không có cách nào làm theo (truyện đã xong thì thanh dưới
		// KHÔNG còn nút mở phiên nào).
		if !errors.Is(err, errChuaMoMay) || !b.daKetTrenDia(id) {
			return "", err
		}
		if p, err = b.mo(id); err != nil {
			return "", err
		}
	}
	if p.eng.Snapshot().IsRunning {
		if err := p.eng.Steer(chu); err != nil {
			return "", err
		}
		return "steer", nil
	}
	// Góp ý trên truyện đã xong là HƯỚNG viết thêm: mở lại với câu ấy làm hướng (cùng đường
	// `Reopen` → `Resume` mà TUI và `/reopen` đi), không đánh thức một lượt trên sách đã kết.
	if daXong(p) {
		if err := moLaiNeuDaXong(p, chu); err != nil {
			return "", err
		}
		if _, err := p.eng.Resume(); err != nil {
			return "", err
		}
		p.chayTu = mocBayGio()
		b.theoDoi(p)
		return "reopen", nil
	}
	if err := p.eng.Continue(chu); err != nil {
		return "", err
	}
	p.chayTu = mocBayGio()
	b.theoDoi(p)
	return "continue", nil
}

// daKetTrenDia: truyện đã kết theo progress.json, đọc KHÔNG cần engine.
//
// `daXong` hỏi engine, nên nó không trả lời được câu hỏi "có nên mở engine không" — đó là
// vòng tròn. Đọc thẳng store là đường duy nhất, và cũng là đường mà `/workshop` đã đi để
// biết chặng của từng cuốn.
//
// Sai thì ngã về false: không chắc truyện đã kết thì không mở engine. Một câu "chưa mở
// engine" thừa còn hơn một engine mở ra vì đọc hụt một tệp.
func (b *boMay) daKetTrenDia(id string) bool {
	st, err := (&server{root: b.root}).openBook(id)
	if err != nil {
		return false
	}
	p, err := st.Progress.Load()
	if err != nil || p == nil {
		return false
	}
	return p.Phase == domain.PhaseComplete
}

// moLaiNeuDaXong mở lại một truyện đã kết để viết thêm; truyện chưa kết thì không làm gì.
func moLaiNeuDaXong(p *phienMay, huong string) error {
	if !daXong(p) {
		return nil
	}
	return p.eng.Reopen(huong)
}

// dung dừng lượt đang chạy. Trả về false khi không có gì để dừng.
func (b *boMay) dung(id string) (bool, error) {
	p, err := b.dangMo(id)
	if err != nil {
		return false, err
	}
	return p.eng.Abort(), nil
}

// theoDoi chờ lượt chạy kết thúc để ghi lại kết cục.
//
// Không phải để engine chạy được — `emitEvent` là drop-oldest nên nó không bao giờ chặn.
// Cần vì nếu không ai đọc `Done()` thì studio không phân biệt được "đang viết" với "đã
// dừng vì lỗi", và đó đúng là câu hỏi số 1 mà PRODUCT.md nói người vận hành mở studio để
// trả lời.
func (b *boMay) theoDoi(p *phienMay) {
	go func() {
		// Engine sập không được kéo cả HTTP đi theo: người dùng cần trang còn sống để
		// ĐỌC lỗi. Không có recover thì panic trong goroutine này giết cả process.
		defer func() {
			if r := recover(); r != nil {
				err := fmt.Errorf("engine panic: %v", r)
				p.datLoi(err)
				slog.Error("engine panic", "module", "serve", "book", p.id, "err", r)
			}
		}()
		<-p.eng.Done()
		p.datLoi(nil)
		slog.Info("lượt chạy kết thúc", "module", "serve", "book", p.id)
	}()
}
