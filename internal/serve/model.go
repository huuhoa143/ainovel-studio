package serve

// Hợp đồng JSON giữa engine và web studio.
//
// Khóa dùng tiếng Anh: đây là hợp đồng máy–máy. Mọi trạng thái trả về dưới dạng
// mã enum, không phải chữ hiển thị — chữ tiếng Việt thuộc về giao diện, để đổi
// từ ngữ không phải sửa server và để cùng payload dùng được cho nhiều bề mặt.
//
// Nguyên tắc bao trùm: KHÔNG BỊA. Trường nào store không có dữ liệu thì để
// nil/omitempty và khai báo trong Capabilities, để giao diện tự biết cột nào
// không nên vẽ. Trả về một con số trông hợp lý mà không có nguồn còn tệ hơn
// trả về trống, vì người vận hành sẽ tin nó.

// Capabilities cho giao diện biết dữ liệu nào thật sự tồn tại trong store của
// bản này. Bản mockup thiết kế ban đầu có cột chi phí theo chương; store chỉ
// cộng chi phí theo agent và theo model (domain.UsageState), không theo chương,
// nên cột đó không có nguồn và bị khai báo false ở đây.
type Capabilities struct {
	PerChapterDuration bool `json:"per_chapter_duration"`
	PerChapterCost     bool `json:"per_chapter_cost"`
	LayeredOutline     bool `json:"layered_outline"`
	// Ba cờ dưới đây phục vụ ba bề mặt ở Rail. Chúng được suy từ CHÍNH builder mà
	// endpoint tương ứng dùng (buildStyle/buildCost/buildSettings), không từ một
	// phép kiểm riêng — đúng bài học của LayeredOutline: hai đường suy luận song
	// song về cùng một dữ liệu sẽ có lúc lệch nhau, và khi lệch thì giao diện ẩn
	// một bề mặt vẫn còn đủ dữ liệu để vẽ.
	StyleRules    bool `json:"style_rules"`
	CostBreakdown bool `json:"cost_breakdown"`
	RunSettings   bool `json:"run_settings"`
}

// Book là một tác phẩm trong xưởng, dùng cho bộ chọn ở thanh trên.
type Book struct {
	ID        string `json:"id"`   // tên thư mục, dùng làm khóa trong URL
	Name      string `json:"name"` // tên tác phẩm; rỗng khi chưa đặt
	Phase     string `json:"phase"`
	Flow      string `json:"flow,omitempty"`
	Done      int    `json:"completed_chapters"`
	Total     int    `json:"total_chapters"`
	Words     int    `json:"total_words"`
	Activity  string `json:"activity"` // running | idle | complete
	UpdatedAt string `json:"updated_at"`

	// Năm trường cho bề mặt Xưởng. Lấy từ cùng nguồn mà `/studio` dùng (transport của store)
	// để hai bề mặt không nói hai số khác nhau về cùng một cuốn. Không omitempty: một xưởng
	// mười cuốn cần liệt kê đủ mà không phải gọi /studio riêng cho từng cuốn — xem
	// TestWorkshopCoDuSoLieuChoManXuong.
	CostUSD         float64 `json:"cost_usd"`
	CostPerChapter  float64 `json:"cost_per_chapter"`
	ChaptersPerHour float64 `json:"chapters_per_hour"`
	// EngineOpen do handleWorkshop đặt (cần s.may, một trường server — bookFrom/scanWorkshop
	// chỉ biết store).
	EngineOpen bool `json:"engine_open"`
	// Stop là lần dừng gần nhất của phiên đang mở (cùng phép chiếu với snapshot `stop`). Tủ
	// truyện cần nó: một cuốn engine tự dừng vì lỗi là việc cần người, không phải "đang nghỉ".
	Stop *LanDung `json:"stop,omitempty"`
}

// Workshop là toàn cảnh xưởng: mọi tác phẩm tìm thấy dưới thư mục gốc.
type Workshop struct {
	Root  string `json:"root"`
	Books []Book `json:"books"`
	// WebBuild là mã của bản dựng giao diện ĐANG ĐƯỢC PHỤC VỤ.
	//
	// # Vì sao nó đi kèm toàn cảnh xưởng, không có nhịp riêng
	//
	// Giao diện đã hỏi `/api/workshop` mỗi 8 giây (nhịp nền của `useStudio`). Cho mã bản dựng
	// đi nhờ chuyến ấy thì việc phát hiện là miễn phí; một endpoint riêng là một lượt gọi nữa
	// mỗi 8 giây cho một chuỗi hầu như không bao giờ đổi.
	//
	// # Vì sao cần
	//
	// `next build` thay toàn bộ tệp chunk. Một tab đang mở giữ JS đã tải trong bộ nhớ nên phần
	// cũ vẫn chạy — dòng sự kiện vẫn chảy — nhưng mảnh nào nó nạp VỀ SAU thì trỏ vào tệp đã bị
	// thay và nhận 404. Bề mặt hỏng nửa vời mà im lặng, và người dùng phải TỰ ĐOÁN ra rằng
	// cần tải lại. Đó là lời nguyên văn: "phải F5 thì mới thấy được… hơi bị phiền".
	//
	// Không tự tải lại hộ: người dùng có thể đang đọc dở hoặc đang gõ can thiệp. Nói ra rồi để
	// họ bấm.
	WebBuild string `json:"web_build,omitempty"`
}

// LaneBlock là một khối trên trục sản xuất (tập hoặc cung).
type LaneBlock struct {
	Index int    `json:"index"`
	Title string `json:"title,omitempty"`
	// State: done | running | planned | unplanned
	//   planned   = đã có cấu trúc chi tiết, chưa chạy tới
	//   unplanned = mới là bộ khung, Architect sẽ mở khi tới lượt
	// Hai trạng thái này khác nhau về bản chất trong mô hình cuốn-vòng-cung hai
	// tầng, nên giao diện vẽ chúng khác nhau (đặc/sọc chéo).
	State string `json:"state"`
	// Chapters là số chương thật khi đã mở, hoặc số dự kiến khi còn là bộ khung.
	// 0 nghĩa là CHƯA BIẾT — tập chưa mở thì chưa có cung nào nên không có cả số
	// dự kiến. Giao diện phải vẽ khối đó bằng độ rộng mặc định, không nhân với 0
	// (khối sẽ biến mất khỏi trục).
	Chapters  int  `json:"chapters"`
	Estimated bool `json:"estimated,omitempty"` // true khi Chapters là số dự kiến
	Final     bool `json:"final,omitempty"`     // tập收官
	From      int  `json:"from,omitempty"`      // chương đầu, chỉ khi đã mở
	To        int  `json:"to,omitempty"`
}

// ChapterMark là trạng thái một chương trên lane chương (1 vạch = 1 chương).
type ChapterMark struct {
	Chapter int    `json:"chapter"`
	State   string `json:"state"` // done | running | rewrite | gate | pending
}

// Timeline là dữ liệu cho trục sản xuất ba tầng.
type Timeline struct {
	Volumes  []LaneBlock   `json:"volumes"`
	Arcs     []LaneBlock   `json:"arcs"` // các cung trong tập hiện tại
	Chapters []ChapterMark `json:"chapters"`
}

// ChapterRow là một hàng trong bảng chương.
type ChapterRow struct {
	Chapter int    `json:"chapter"`
	Title   string `json:"title,omitempty"`
	// Stage: done | drafting | rewrite | pending
	Stage string `json:"stage"`
	Words int    `json:"words,omitempty"`
	// DurationMs nil = không đo được (chương chỉ có một checkpoint, hoặc chưa
	// chạy). Không dùng 0 cho "không biết": 0 nghĩa là xong tức thời.
	DurationMs *int64 `json:"duration_ms,omitempty"`
	// Owner là các vai đã tham gia chu kỳ gần nhất, suy ra từ bước checkpoint.
	Owner []string `json:"owner,omitempty"`
	// Reviewed = chương có bản nhận xét riêng (reviews/NN.json). Không phải mọi chương đều
	// được nhận xét, nên màn Nhận xét biên tập cần biết chương nào mở ra có nội dung.
	Reviewed bool `json:"reviewed,omitempty"`
}

// Dimension là một chiều trong bản duyệt của Editor.
type Dimension struct {
	Name string `json:"name"`
	// Con trỏ, không phải int: điểm 0 và điểm VẮNG là hai chuyện khác nhau. 0/100
	// là điểm Editor thật sự chấm — điểm tệ nhất có thể — còn vắng là chiều không
	// được chấm.
	//
	// `int` cộng `omitempty` gộp hai chuyện đó lại: 0 là zero-value nên omitempty
	// bỏ luôn khóa, và client nhận đúng thứ mà một chiều chưa chấm nhận được. Đo
	// được trên bản mẫu: chiều foreshadow chấm 0 ra JSON KHÔNG có khóa "score",
	// trong khi các chiều cùng bản duyệt có "score": 88 bình thường.
	//
	// Đáng ghi lại vì phía web ĐÃ phòng đúng ca này (`d.score != null` trong
	// BanDuyet.tsx, kèm comment giải thích) nhưng phòng vô ích: server đã làm rụng
	// dữ liệu trước khi tới client. Một lớp phòng ở đúng chỗ vẫn không cứu được khi
	// tầng dưới đã mất thông tin.
	//
	// Bỏ omitempty là đủ, không cần con trỏ: domain.DimensionScore.Score là `int`
	// với thẻ `json:"score"` không omitempty, nên store LUÔN có một con số. "Vắng"
	// không phải trạng thái biểu diễn được ở tầng dưới, nên dựng con trỏ ở đây chỉ
	// là máy móc dư cho một ca không tồn tại.
	Score   int    `json:"score"`
	Verdict string `json:"verdict,omitempty"`
	Comment string `json:"comment,omitempty"`
}

// Issue là một vấn đề Editor nêu, kèm dẫn chứng.
type Issue struct {
	Type        string `json:"type"`
	Severity    string `json:"severity"`
	Description string `json:"description"`
	Evidence    string `json:"evidence,omitempty"`
	Suggestion  string `json:"suggestion,omitempty"`
	Chapters    []int  `json:"chapters,omitempty"`
	NeedsChange bool   `json:"needs_change"`
}

// Review là bản duyệt của Editor cho một chương hoặc một cung.
type Review struct {
	Chapter        int         `json:"chapter"`
	Scope          string      `json:"scope"`
	Verdict        string      `json:"verdict"`
	Summary        string      `json:"summary,omitempty"`
	Dimensions     []Dimension `json:"dimensions,omitempty"`
	Issues         []Issue     `json:"issues,omitempty"`
	ContractStatus string      `json:"contract_status,omitempty"`
	ContractMisses []string    `json:"contract_misses,omitempty"`
}

// Contract là yêu cầu đặt ra cho một chương, do Writer lập ở bước plan.
type Contract struct {
	Chapter   int      `json:"chapter"`
	Title     string   `json:"title,omitempty"`
	CoreEvent string   `json:"core_event,omitempty"`
	Hook      string   `json:"hook,omitempty"`
	Scenes    []string `json:"scenes,omitempty"`
}

// Decision là một phán quyết của Arbiter đã落盘.
type Decision struct {
	ID         string `json:"id"`
	At         string `json:"at"`
	Kind       string `json:"kind"`
	Decider    string `json:"decider"`
	Reason     string `json:"reason,omitempty"`
	Input      string `json:"input,omitempty"`
	Model      string `json:"model,omitempty"`
	DurationMs int64  `json:"duration_ms,omitempty"`
	Error      string `json:"error,omitempty"`
	// Decision là quyết định thô dạng JSON, giữ nguyên để giao diện có thể mở
	// ra xem — đây là phần "replay được" của nhật ký phán quyết.
	Decision any `json:"decision,omitempty"`
}

// Transport là dải trạng thái luôn hiện ở đáy giao diện.
type Transport struct {
	// State: running | idle | complete
	State string `json:"state"`
	// LastStep là công đoạn vừa HOÀN THÀNH, không phải công đoạn đang chạy.
	// Store chỉ ghi checkpoint khi một bước thành công, nên đây là tất cả những
	// gì suy được từ trạng thái tĩnh. Tên field nói đúng điều đó: gọi nó là
	// "step" từng làm giao diện hiện "commit" trong khi engine đang draft chương
	// kế tiếp. Công đoạn đang chạy chỉ có trong dòng sự kiện (SSE), và giao diện
	// phải ghi đè bằng dữ liệu đó ngay khi nhận được sự kiện đầu tiên.
	LastStep string  `json:"last_step,omitempty"`
	Agent    string  `json:"agent,omitempty"`
	Model    string  `json:"model,omitempty"`
	CostUSD  float64 `json:"cost_usd"`
	// CostPerChapter là tổng chi phí chia số chương đã xong — con số này CÓ
	// nguồn thật, khác với chi phí theo từng chương.
	CostPerChapter *float64 `json:"cost_per_chapter,omitempty"`
	// ChaptersPerHour nil khi phiên quá ngắn để con số có nghĩa.
	ChaptersPerHour *float64 `json:"chapters_per_hour,omitempty"`
	ElapsedMs       *int64   `json:"elapsed_ms,omitempty"`
	// LastCall là lượt gọi LLM gần nhất, đọc từ usage.json: vai nào, bằng cặp provider/model ĐÃ
	// CẤU HÌNH nào (provider là tên trong `providers`, không phải loại giao thức), lúc nào.
	//
	// Khác `Model` ở trên: `Model` là model MẶC ĐỊNH lúc mở phiên (meta/run.json), không phải
	// model của vai nào. Ghép `Agent` với `Model` từng cho ra "Người viết · cx/gpt-5.6-luna"
	// trong khi Người viết chạy model khác. nil khi chưa có lượt nào được ghi.
	LastCall *LuotGoi `json:"last_call,omitempty"`
}

// LuotGoi là một lượt gọi LLM đã ghi nhận.
type LuotGoi struct {
	Agent    string `json:"agent"`
	Provider string `json:"provider"`
	Model    string `json:"model"`
	// At theo RFC 3339.
	At string `json:"at"`
}

// Snapshot là toàn bộ dữ liệu cho một lần tải bề mặt studio.
type Snapshot struct {
	Book         Book         `json:"book"`
	Capabilities Capabilities `json:"capabilities"`
	Timeline     Timeline     `json:"timeline"`
	Chapters     []ChapterRow `json:"chapters"`
	Transport    Transport    `json:"transport"`
	Decisions    []Decision   `json:"decisions,omitempty"`
	Selected     *Selection   `json:"selected,omitempty"`
	// Warnings là kết quả kiểm tra nhất quán nông của store. Hiện ra thay vì
	// nuốt đi: dữ liệu lệch là tin vận hành, không phải chi tiết nội bộ.
	Warnings []string `json:"warnings,omitempty"`
	// QueueSeq là số thứ tự sự kiện mới nhất lúc chụp snapshot. Giao diện dùng
	// nó làm điểm bắt đầu cho SSE để không bỏ sót và không nhận trùng sự kiện
	// phát ra giữa lúc tải trang và lúc mở stream.
	QueueSeq int64 `json:"queue_seq"`
	// Import là lượt nhập truyện đang chờ người (xem nhap_dang_do.go); null khi không có.
	Import *TrangThaiNhap `json:"import"`

	// Bốn nhóm dưới là trường SỐNG: chúng chỉ đo được khi engine đang mở. Dùng con trỏ /
	// slice để `nil` marshal thành `null`, và `null` nghĩa là "không có nguồn" — khác hẳn `0`
	// nghĩa là "đo được, bằng không". Giao diện có hai nhánh vẽ khác nhau cho hai câu đó.
	Agents     []Vai    `json:"agents"`
	IdleAgents []string `json:"idle_agents"`
	Advance    *TienDo  `json:"advance"`
	Context    *NguCanh `json:"context"`

	// Bốn trường dưới cũng chỉ có nghĩa khi engine đang mở, chiếu thẳng từ
	// host.UISnapshot (xem chieuTruongSong) — không suy lại từ store.
	PendingSteer      string `json:"pending_steer,omitempty"`
	RewriteReason     string `json:"rewrite_reason,omitempty"`
	Recovery          string `json:"recovery,omitempty"`
	InProgressChapter *int   `json:"in_progress_chapter"`

	// Runtime là trạng thái engine tự khẳng định: idle / running / pausing / paused /
	// completed. Rỗng khi engine đóng.
	//
	// KHÔNG có `omitempty` và cũng không phải con trỏ, vì `""` ở đây đã đủ nghĩa "không biết"
	// và giao diện chỉ so với các giá trị cụ thể. Nó tồn tại vì `book.activity` KHÔNG thay
	// được: `activity` suy từ mốc checkpoint trong store, nên nó còn nói "running" vài phút
	// sau khi engine đã dừng — xem chú thích của `mayDangChay` trong web/lib/song.ts.
	Runtime string `json:"runtime"`

	// Stop là lần dừng gần nhất của phiên đang mở — ai dừng, vì sao, lỗi model cuối cùng.
	// Vắng khi engine đóng, đang chạy lại, hoặc chưa dừng lần nào. Xem host/lan_dung.go.
	Stop *LanDung `json:"stop,omitempty"`
}

// LanDung là host.StopNote chiếu ra hợp đồng.
type LanDung struct {
	At        string `json:"at"`
	Kind      string `json:"kind"` // user | gate | budget | stuck
	Reason    string `json:"reason"`
	LastError string `json:"last_error,omitempty"`
	// LastErrorAgent là vai gặp lỗi ấy (writer, architect_long…).
	LastErrorAgent string `json:"last_error_agent,omitempty"`
}

// TienDo là chế độ đi tiếp và cửa nghiệm thu.
type TienDo struct {
	Mode          string `json:"mode"`
	PermitChapter int    `json:"permit_chapter,omitempty"`
	Hold          bool   `json:"hold"`
	HoldReason    string `json:"hold_reason,omitempty"`
}

// NguCanh là cửa sổ ngữ cảnh của model đang chạy.
type NguCanh struct {
	Tokens   int     `json:"tokens"`
	Window   int     `json:"window"`
	Percent  float64 `json:"percent"`
	Scope    string  `json:"scope,omitempty"`
	Strategy string  `json:"strategy,omitempty"`
}

// Vai là một tác tử đang làm việc, chiếu từ host.AgentSnapshot.
//
// Chỉ lấy phần giao diện DÙNG. `UpdatedAt` và `TaskID` không lên đây: cái đầu không hiện ở
// đâu, cái sau là khóa nội bộ của engine — đưa ra JSON là mời người sau dựng logic quanh nó.
type Vai struct {
	Role  string `json:"role"`
	State string `json:"state"`
	Tool  string `json:"tool,omitempty"`
	// Chapter là chương mà lượt gọi công cụ đang chạy nói tới (read_chapter(1), edit_chapter(1)…).
	// Thẻ "đang làm" ưu tiên nó hơn "chương kế tiếp" — xem chuongTuThamSo ở host.
	Chapter int    `json:"chapter,omitempty"`
	Turn    int    `json:"turn,omitempty"`
	Task    string `json:"task,omitempty"`
	Depth   int    `json:"depth"`
}

// Selection là chi tiết của chương đang được chọn, cho panel inspector.
type Selection struct {
	Chapter  int       `json:"chapter"`
	Title    string    `json:"title,omitempty"`
	Contract *Contract `json:"contract,omitempty"`
	Review   *Review   `json:"review,omitempty"`
	Excerpt  string    `json:"excerpt,omitempty"`
	Words    int       `json:"words,omitempty"`
}

// ── Quy ước "vắng" cho ba bề mặt dưới đây ──
//
// Ba endpoint /outline, /cast, /world đã lập một quy ước mà web dựa vào và ghi lại
// ở web/lib/types.ts:206-218: mảng `null` nghĩa là TỆP CHƯA TỪNG ĐƯỢC GHI, mảng
// `[]` nghĩa là tệp đã có mà mục này rỗng. Hai ca đó là hai sự thật khác nhau và
// giao diện hiện chúng bằng hai câu khác nhau; gộp lại là nói dối một trong hai.
//
// Quy ước đó rơi ra tự nhiên từ store: ReadJSON + os.IsNotExist → (nil, nil) →
// slice nil → `null`, còn `{"prose":[]}` giải mã thành slice rỗng khác nil → `[]`.
// Nên ba hợp đồng dưới đây KHÔNG chuẩn hoá slice về rỗng, và tuyệt đối KHÔNG đặt
// `omitempty` lên chúng — omitempty xoá cả hai ca thành "khoá không có mặt", tức
// phá đúng cái phân biệt mà quy ước tồn tại để giữ.

// ── Văn phong ──

// StyleDoc là bề mặt Văn phong: GET /api/books/{book}/style.
//
// # Vì sao HAI nguồn, không phải một
//
// Hai tệp cùng nói về văn phong nhưng khác hẳn nhau về bản chất VÀ về thời điểm
// xuất hiện, nên gộp chúng vào một khối phẳng sẽ làm người đọc tin sai:
//
//   - meta/style_rules.json: Editor CHẮT RA từ các chương đã viết, chỉ được ghi ở
//     biên cung (internal/tools/save_arc_summary.go:118). Đây là mô tả — "văn bản
//     đang thật sự có giọng thế này".
//   - meta/user_rules.json: người dùng KHAI, đã chuẩn hoá lúc mở sách/nhập sách
//     (internal/userrules/service.go:53). Đây là chỉ thị — "văn bản phải thế này".
//
// Chênh lệch thời điểm mới là điều đáng nói: sách mới chưa qua biên cung nào thì
// style_rules.json CHƯA TỒN TẠI, còn user_rules.json đã có ngay từ lúc mở sách.
// Nếu bề mặt này chỉ đọc style_rules.json thì suốt cả cung đầu nó rỗng trơn —
// đúng cái "chưa dựng" giả mà việc này phải xoá bỏ.
//
// Hai khoá tách riêng cũng chính là cách bề mặt gọi tên đúng thứ nó đang hiện:
// tên khoá LÀ tên nguồn, nên không cần thêm trường `source` như handleChapter.
type StyleDoc struct {
	// Arc nil = chưa có meta/style_rules.json (chưa qua biên cung nào).
	Arc *ArcStyle `json:"arc_style"`
	// User nil = chưa có meta/user_rules.json (chưa mở sách qua Host).
	User *UserStyle `json:"user_rules"`
	// Warnings nêu nguồn nào đọc được mà hỏng. Một tệp hỏng không được làm trắng
	// cả bề mặt khi nguồn còn lại vẫn đọc được — nhưng cũng không được nuốt, vì
	// "rỗng vì chưa có" và "rỗng vì hỏng" là hai tin vận hành khác nhau.
	Warnings []string `json:"warnings"`
}

// ArcStyle là văn phong Editor chắt từ chương đã viết (meta/style_rules.json).
type ArcStyle struct {
	// Volume/Arc KHÔNG omitempty: 0 là "chưa gắn được tập/cung" và đó là tin
	// thật, không phải khoá vắng. Cùng lý lẽ với Dimension.Score.
	Volume int `json:"volume"`
	Arc    int `json:"arc"`
	// Prose luôn có ít nhất một mục khi tệp tồn tại: save_arc_summary chỉ ghi tệp
	// khi len(Prose) > 0. Vẫn giữ quy ước null/[] để hợp đồng không phụ thuộc vào
	// một bất biến ở phía engine mà endpoint này không kiểm soát.
	Prose     []string         `json:"prose"`
	Dialogue  []CharacterVoice `json:"dialogue"`
	Taboos    []string         `json:"taboos"`
	UpdatedAt string           `json:"updated_at"`
}

// CharacterVoice là quy tắc thoại của một nhân vật.
type CharacterVoice struct {
	Name  string   `json:"name"`
	Rules []string `json:"rules"`
}

// UserStyle là quy tắc người dùng khai, đã chuẩn hoá (meta/user_rules.json).
type UserStyle struct {
	// Status: ready | degraded — degraded nghĩa là ít nhất một nguồn chuẩn hoá
	// thất bại và đã hạ cấp thành preferences thô (rules.StatusDegraded). Giao
	// diện cần hiện nó: quy tắc hạ cấp KHÔNG được máy kiểm, chỉ được mô hình đọc.
	Status           string   `json:"status"`
	Genre            string   `json:"genre"`
	ForbiddenPhrases []string `json:"forbidden_phrases"`
	ForbiddenChars   []string `json:"forbidden_chars"`
	// FatigueWords là "từ → tối đa mấy lần mỗi chương". Giữ nguyên hình map của
	// store: khoá là dữ liệu (một từ tiếng Việt có dấu), và encoding/json sắp
	// khoá theo thứ tự chữ nên đầu ra vẫn tất định cho curl và cho test.
	FatigueWords map[string]int `json:"fatigue_words"`
	Preferences  string         `json:"preferences"`
	// DeclaredBy là nhãn nguồn đã góp vào bản chuẩn hoá (system_defaults,
	// global:<tệp>, project:<tệp>, startup_prompt, runtime_update). Cần cho bề
	// mặt vì "vì sao có luật này" là câu hỏi đầu tiên khi luật gây bất ngờ.
	DeclaredBy []string `json:"declared_by"`
	Uncertain  []string `json:"uncertain"`
}

// ── Chi phí ──

// Trạng thái nguồn chi phí. Bốn ca, không phải hai — xem CostDoc.State.
const (
	ChiPhiSanSang    = "ready"        // có số liệu
	ChiPhiChuaCoTep  = "no_file"      // chưa có meta/usage.json
	ChiPhiRong       = "empty"        // có tệp, chưa có mục nào
	ChiPhiLechSchema = "stale_schema" // có tệp nhưng schema khác bản này
)

// CostDoc là bề mặt Chi phí: GET /api/books/{book}/cost.
//
// # Vì sao KHÔNG có "giá thành mỗi chương"
//
// Transport đã mang CostUSD và CostPerChapter, và cả hai đã hiện ở thanh dưới.
// Lặp lại một con số ở hai chỗ là cách hai bản của nó bắt đầu lệch nhau. Giá trị
// của bề mặt này là PHẦN CHIA NHỎ theo tác tử và theo model — thứ duy nhất
// UsageState có mà Transport không mang.
//
// # Vì sao vẫn có Overall
//
// Nó không phải để hiện lại tổng tiền. Hai lý do nó phải ở đây: (1) tổng TOKEN và
// tổng tiết kiệm nhờ đệm KHÔNG có ở bất cứ đâu khác trong API — Transport chỉ
// mang tiền; (2) không có mẫu số thì mỗi hàng chỉ là một con số trơ, không nói
// được "Writer chiếm 62% chi phí". Trường cost_usd trong Overall trùng với
// transport.cost_usd LÀ CỐ Ý và chỉ dùng làm mẫu số, không phải để in lại thành
// tiêu đề — việc đó là của thanh dưới.
type CostDoc struct {
	// State là ca nào trong bốn ca. Cần một trường riêng vì null/{} chỉ phân biệt
	// được ba: "có tệp mà schema lệch" đọc ra y hệt "chưa có tệp" qua
	// UsageStore.Load — nó trả (nil, nil) cho CẢ HAI (internal/store/usage.go:25).
	// Không stat tệp thì trạng thái thứ tư này biến mất, và một tác phẩm có số
	// liệu cũ sẽ bị báo là chưa chạy gì.
	State string `json:"state"`
	// UpdatedAt rỗng khi chưa có số liệu; không omitempty để khoá luôn có mặt.
	UpdatedAt string `json:"updated_at"`
	// Overall là mẫu số, không phải tiêu đề — xem ghi chú ở đầu struct.
	Overall UsageTotals `json:"overall"`
	// PerAgent/PerModel null = chưa có tệp; {} = có tệp mà chưa mục nào. Đây là
	// lý do KHÔNG dùng thẳng domain.UsageState: PerModel ở đó mang
	// `json:"per_model,omitempty"`, và omitempty trên map xoá luôn khoá cho cả
	// hai ca — cùng lớp lỗi với Dimension.Score, chỉ khác kiểu.
	PerAgent map[string]UsageTotals `json:"per_agent"`
	PerModel map[string]UsageTotals `json:"per_model"`
	// MissingAssistantUsage là số lượt mô hình không trả usage — chẩn đoán quan
	// trọng: nó lớn nghĩa là mọi con số ở trên đều thiếu, và bề mặt phải nói ra
	// thay vì để người vận hành tin một tổng bị hụt.
	MissingAssistantUsage int `json:"missing_assistant_usage"`
}

// UsageTotals là các cộng dồn của một tác tử, một model, hoặc của cả phiên.
//
// KHÔNG trường nào có omitempty, và đó là điểm chính của struct này. $0 và "chưa
// có số liệu" là hai chuyện khác nhau ở bề mặt chi phí; 0 token cũng vậy. Đây
// đúng cái bẫy Dimension.Score đã mắc (xem ghi chú ở đó): 0 là zero-value nên
// omitempty bỏ luôn khoá, client nhận đúng thứ mà "vắng" nhận được, và một lớp
// phòng `!= null` ở phía web không cứu được vì server đã làm rụng dữ liệu trước.
//
// Con trỏ là không cần: domain.AgentUsageTotals khai các trường này là int/float64
// không omitempty, nên store LUÔN có một con số. "Vắng" không biểu diễn được ở
// tầng dưới, và ca vắng thật đã được State + null/{} mang.
type UsageTotals struct {
	Input        int     `json:"input"`
	Output       int     `json:"output"`
	CacheRead    int     `json:"cache_read"`
	CacheWrite   int     `json:"cache_write"`
	CostUSD      float64 `json:"cost_usd"`
	SavedUSD     float64 `json:"saved_usd"`
	CacheCapable bool    `json:"cache_capable"`
	CacheBreaks  int     `json:"cache_breaks"`
}

// ── Cài đặt ──

// Trạng thái nguồn cài đặt.
const (
	CaiDatSanSang   = "ready"
	CaiDatChuaCoTep = "no_file"
)

// SettingsDoc là bề mặt Cài đặt: GET /api/books/{book}/settings.
//
// # Vì sao chỉ đọc, và vì sao nói ra điều đó trong payload
//
// Writable là false vì đây là BẢN GHI: nó nói tác phẩm đã khởi động với cấu hình
// gì. Quá khứ không sửa được, nên một ô nhập ở đây sẽ hứa một việc không tồn tại.
// Nó nằm TRONG payload vì đây là câu trả lời cho riêng bề mặt cấu hình, không suy được từ
// việc studio ghi được hay không.
//
// Lý do CŨ ghi ở đây ("engine sở hữu quyền ghi, hai process cùng sửa sẽ mất trắng
// ý kiến can thiệp") không còn đúng: engine chạy trong process này nên studio là
// người ghi duy nhất. Giữ lại vế kết luận, đổi vế lý do — xem settings.go.
//
// # Cái gì CỐ Ý không có ở đây
//
// Khoá API và cấu hình provider KHÔNG nằm trong store (chúng ở config của người
// dùng) nên không có ở payload này. Chúng ĐẶT ĐƯỢC qua PUT /api/config, và lo ngại
// cũ — "đưa khoá vào một payload HTTP là biến rò rỉ tiềm năng thành rò rỉ có sẵn"
// — được giải quyết bằng cách cho khoá đi MỘT CHIỀU: vào được, không bao giờ ra.
// Xem cheKhoa trong rao.go và TestCauHinhKhoaDiMotChieu.
//
// PlanStart.RawPrompt cũng bị lược: nó lặp lại StartPrompt gần như nguyên văn,
// và một trường lặp là một trường sẽ lệch.
type SettingsDoc struct {
	// State: ready | no_file. Cần vì đây là OBJECT, không có null của mảng để
	// dựa vào — "chưa có meta/run.json" và "có tệp mà mọi trường rỗng" sẽ đọc ra
	// y hệt nhau nếu không có trường này.
	State string `json:"state"`
	// Writable luôn false ở bản chỉ-đọc. Giữ là trường chứ không phải hằng số
	// phía web: ngày engine nhận lệnh ghi, server đổi một chỗ và giao diện mở ô
	// nhập theo, không cần phát hành lại web.
	Writable     bool   `json:"writable"`
	StartedAt    string `json:"started_at"`
	Provider     string `json:"provider"`
	Model        string `json:"model"`
	Style        string `json:"style"`
	PlanningTier string `json:"planning_tier"`
	// AdvanceMode: auto | review.
	AdvanceMode string `json:"advance_mode"`
	// AdvancePermitChapter KHÔNG omitempty: 0 nghĩa là "không có chương nào đang
	// được cấp phép", và ở chế độ review đó là tin thật — đúng ca số-0-không-phải
	// -vắng. Ở chế độ auto nó buộc phải là 0
	// (internal/store/run_meta.go:validateAdvanceControl).
	AdvancePermitChapter int `json:"advance_permit_chapter"`
	// AdvanceHold nil = không có ý định tạm dừng nào đang treo.
	AdvanceHold *AdvanceHold `json:"advance_hold"`
	// PendingSteer là chỉ thị can thiệp engine CHƯA xử lý. Rỗng là ca thường.
	PendingSteer string `json:"pending_steer"`
	StartPrompt  string `json:"start_prompt"`
	// PlanStart nil = chưa có phán quyết khởi động nào落盘.
	PlanStart *PlanStart `json:"plan_start"`
}

// AdvanceHold là ý định tạm dừng một lần, do can thiệp ký.
type AdvanceHold struct {
	// After: boundary | rewrites_drained
	After  string `json:"after"`
	Reason string `json:"reason"`
}

// PlanStart là phán quyết khởi động đã落盘 (bỏ RawPrompt — xem SettingsDoc).
type PlanStart struct {
	Planner     string `json:"planner"`
	PlannerTask string `json:"planner_task"`
	DecisionID  string `json:"decision_id"`
}
