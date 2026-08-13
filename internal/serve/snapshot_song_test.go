package serve

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/huuhoa143/ainovel-studio/internal/host"
)

// TestAnhXaVaiKhopTUI canh lớp lỗi tệ nhất của việc ánh xạ: web và TUI nói KHÁC NHAU về
// "ai đang chạy".
//
// Cả hai bề mặt đều trông đáng tin, nên khi chúng lệch thì không ai biết bên nào sai.
//
// # Kế hoạch ban đầu nói SAI luật
//
// Bản đầu của kế hoạch giả định luật là "State == working thì đang chạy, còn lại thì chờ".
// Đọc thẳng `sidebarIdleAgents`/`sidebarAgents` (internal/entry/tui/panels_sidebar.go:239,260)
// thì luật thật NGƯỢC LẠI: "State == idle thì chờ", còn lại — kể cả một giá trị chưa từng
// gặp — đều được TUI coi là đang chạy. Engine hôm nay chỉ từng gán "working" hoặc "idle"
// (internal/host/observer.go:124,144,170,228), nên hai cách so trùng kết quả VỚI DỮ LIỆU HÔM
// NAY. Nhưng nếu mai engine thêm một trạng thái mới mà không ai sửa web, so "== working" sẽ
// âm thầm đẩy trạng thái đó sang "chờ" trong khi TUI vẫn vẽ nó là "đang chạy" — đúng lớp lỗi
// bài kiểm này phải canh. Vai "arbiter" dưới đây dùng State rỗng để phân biệt hai luật: rỗng
// không phải "working", nhưng cũng không phải "idle".
//
// (Bài kiểm KHÔNG lặp lại nhánh "không ai đang chạy thì gộp hết vào danh sách đang chạy" của
// `sidebarAgents`: đó là mẹo trình bày để sidebar TUI không hiện một khối rỗng, không phải
// một sự thật về ai đang chạy — bề mặt JSON không cần né một khối rỗng theo cách đó.)
//
// Bài kiểm chốt CẢ HAI kết quả trên cùng một đầu vào, để lần sau ai đổi một bên là đỏ.
func TestAnhXaVaiKhopTUI(t *testing.T) {
	vao := []host.AgentSnapshot{
		{Name: "writer", State: "working", Tool: "draft_chapter", Turn: 7, Summary: "viết chương 2"},
		{Name: "editor", State: "idle"},
		{Name: "arbiter", State: ""}, // không idle, dù không phải "working" — vẫn phải đang chạy
	}

	dang, cho := anhXaVai(vao)

	if len(dang) != 2 {
		t.Fatalf("vai đang chạy: %d, muốn 2 (writer + arbiter, vì \"\" != \"idle\") — %+v", len(dang), dang)
	}
	var writerVai, arbiterVai *Vai
	for i := range dang {
		switch dang[i].Role {
		case "writer":
			writerVai = &dang[i]
		case "arbiter":
			arbiterVai = &dang[i]
		}
	}
	if writerVai == nil {
		t.Fatalf("thiếu writer trong vai đang chạy: %+v", dang)
	}
	if writerVai.Tool != "draft_chapter" || writerVai.Turn != 7 {
		t.Errorf("vai writer = %+v, muốn tool draft_chapter / turn 7", writerVai)
	}
	if writerVai.Task != "viết chương 2" {
		t.Errorf("Task = %q, muốn lấy từ Summary", writerVai.Task)
	}
	if arbiterVai == nil {
		t.Fatalf("thiếu arbiter trong vai đang chạy — chứng tỏ luật đang so \"== working\" thay vì \"!= idle\": %+v", dang)
	}

	muonCho := []string{"editor"}
	if len(cho) != len(muonCho) {
		t.Fatalf("vai chờ = %v, muốn %v", cho, muonCho)
	}
	for i, v := range muonCho {
		if cho[i] != v {
			t.Errorf("vai chờ[%d] = %q, muốn %q", i, cho[i], v)
		}
	}
}

// TestTruongSongLaNullKhiMayDong canh lớp lỗi "0 nói dối".
//
// Engine ĐÓNG thì không đo được ngữ cảnh, không biết vai nào đang chạy. `0` và `[]` nói "đo
// được, bằng không" — giao diện sẽ vẽ một thước ngữ cảnh 0% và một cây vai rỗng, tức khẳng
// định một điều không ai biết. `null` nói "không có nguồn", và giao diện có nhánh riêng cho nó.
//
// Đọc JSON THÔ chứ không giải vào struct: giải vào struct biến `null` thành zero value và bài
// kiểm mất đúng thứ nó đo. Cùng lý do như TestTrucSachKhongPhanTangTraNull trong gói này.
func TestTruongSongLaNullKhiMayDong(t *testing.T) {
	goc := t.TempDir()
	st := newBook(t, goc, "sach", nil)
	ghiTho(t, st, "chapters/01.md", "# Chương một\n\nMột dòng.\n")

	srv := &server{root: goc} // KHÔNG có bộ giám sát → engine đóng
	rec := httptest.NewRecorder()
	srv.routes().ServeHTTP(rec, httptest.NewRequest("GET", "/api/books/sach/studio", nil))
	if rec.Code != 200 {
		t.Fatalf("mã %d: %s", rec.Code, rec.Body.String())
	}

	var tho map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &tho); err != nil {
		t.Fatalf("giải mã: %v", err)
	}
	for _, ten := range []string{"agents", "idle_agents", "advance", "context"} {
		got := strings.TrimSpace(string(tho[ten]))
		if got != "null" {
			t.Errorf("%s = %s, muốn `null` khi engine đóng.\n"+
				"`0`/`[]`/`{}` ở đây là khẳng định một điều không đo được, và giao diện sẽ "+
				"vẽ số 0 thay vì vẽ dấu \"không có nguồn\".", ten, got)
		}
	}
}

// TestAnhXaTruongSongDiXuyenTuSnapshot canh việc serve TỰ TÍNH thay vì lấy từ engine.
//
// `PRODUCT.md` cấm studio nhân bản logic engine, và đây là chỗ dễ vi phạm nhất: mọi trường
// dưới đây đều "có thể suy được" từ store nếu chịu viết thêm mã. Suy lại là dựng bản sao thứ
// hai của sự thật, và hai bản sao thì lệch.
//
// Bài kiểm bơm một `UISnapshot` có giá trị KHÔNG suy được từ store (ví dụ RecoveryLabel là
// một câu chỉ engine biết), rồi đòi thấy đúng câu đó trong JSON.
func TestAnhXaTruongSongDiXuyenTuSnapshot(t *testing.T) {
	snap := host.UISnapshot{
		Agents:               []host.AgentSnapshot{{Name: "writer", State: "working"}},
		PendingSteer:         "cho Lục Miên xuất hiện sớm hơn",
		PendingRewrites:      []int{8},
		RewriteReason:        "lệch mốc giờ sổ miếu",
		AdvanceMode:          "review",
		HasAdvanceHold:       true,
		AdvanceHoldReason:    "chờ cấp phép cung 2",
		AdvancePermitChapter: 8,
		RecoveryLabel:        "lần trước dừng ở cửa nghiệm thu",
		InProgressChapter:    2,
		ContextTokens:        52400,
		ContextWindow:        128000,
		ContextPercent:       41,
		ContextScope:         "baseline",
		ContextStrategy:      "light_trim",
	}

	ra := chieuTruongSong(snap)

	if ra.PendingSteer != snap.PendingSteer {
		t.Errorf("pending_steer = %q, muốn %q", ra.PendingSteer, snap.PendingSteer)
	}
	if ra.Recovery != snap.RecoveryLabel {
		t.Errorf("recovery = %q, muốn %q — câu này chỉ engine biết, serve không suy được",
			ra.Recovery, snap.RecoveryLabel)
	}
	if ra.RewriteReason != snap.RewriteReason {
		t.Errorf("rewrite_reason = %q, muốn %q", ra.RewriteReason, snap.RewriteReason)
	}
	if ra.InProgressChapter == nil || *ra.InProgressChapter != 2 {
		t.Errorf("in_progress_chapter = %v, muốn 2", ra.InProgressChapter)
	}
	if ra.Advance == nil || !ra.Advance.Hold || ra.Advance.Mode != "review" ||
		ra.Advance.PermitChapter != 8 || ra.Advance.HoldReason != snap.AdvanceHoldReason {
		t.Errorf("advance = %+v, muốn mode review / hold true / permit 8 / có lý do", ra.Advance)
	}
	if ra.Context == nil || ra.Context.Tokens != 52400 || ra.Context.Window != 128000 ||
		ra.Context.Percent != 41 || ra.Context.Scope != "baseline" ||
		ra.Context.Strategy != "light_trim" {
		t.Errorf("context = %+v, muốn đúng năm trường của UISnapshot", ra.Context)
	}
}

// TestWorkshopCoDuSoLieuChoManXuong canh một lỗi HIỆU NĂNG thành lỗi đúng đắn.
//
// Bề mặt Xưởng liệt kê mọi tác phẩm kèm chi phí và nhịp. Nếu `/workshop` không mang các số
// đó thì giao diện phải gọi `/studio` một lượt cho MỖI cuốn — với xưởng mười cuốn là mười lượt
// đọc store cho một lần mở trang, và mười thời điểm khác nhau trong cùng một bảng.
func TestWorkshopCoDuSoLieuChoManXuong(t *testing.T) {
	goc := t.TempDir()
	st := newBook(t, goc, "sach", nil)
	ghiTho(t, st, "chapters/01.md", "# Chương một\n\nMột dòng.\n")

	srv := &server{root: goc}
	rec := httptest.NewRecorder()
	srv.routes().ServeHTTP(rec, httptest.NewRequest("GET", "/api/workshop", nil))
	if rec.Code != 200 {
		t.Fatalf("mã %d: %s", rec.Code, rec.Body.String())
	}

	var ra struct {
		Books []map[string]json.RawMessage `json:"books"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &ra); err != nil {
		t.Fatalf("giải mã: %v", err)
	}
	if len(ra.Books) != 1 {
		t.Fatalf("có %d cuốn, muốn 1", len(ra.Books))
	}
	for _, khoa := range []string{"cost_usd", "cost_per_chapter", "chapters_per_hour",
		"updated_at", "engine_open"} {
		if _, co := ra.Books[0][khoa]; !co {
			t.Errorf("thiếu khóa %q — bề mặt Xưởng sẽ phải gọi /studio cho từng cuốn", khoa)
		}
	}
}

// TestVaiRongLaMangRongChuKhongPhaiNull canh một lỗi ĐO ĐƯỢC trên cuốn thật.
//
// Trong Go, một slice chưa append lần nào là `nil`, và `nil` marshal thành `null`. Nên
// `anhXaVai` từng trả `null` cho `idle_agents` khi engine ĐANG MỞ mà mọi vai đều bận —
// tức đúng thứ mà cả hợp đồng trường sống sinh ra để phân biệt bị xóa mất: giao diện đọc
// `null` là "engine đóng nên KHÔNG ĐO ĐƯỢC" và vẽ dấu không-có-nguồn, trong khi sự thật là
// "đo được, không ai chờ".
//
// ĐO ĐƯỢC lúc E2E kế hoạch 2/4 trên cuốn `mac-the-bien-di-vo`: `agents` có một vai đang
// chạy, `idle_agents` là `null`, và dải trạng thái hiện "chờ: không đo được" ngay cạnh một
// vai đang làm việc. Hai câu đó không thể cùng đúng.
//
// Ca engine ĐÓNG vẫn phải là `null`, và nó đi đường khác: `chieuTruongSong` chỉ được gọi khi
// có engine (serve.go), nên lúc đóng cả cấu trúc đứng ở zero value. TestTruongSongLaNullKhiMayDong
// canh đầu đó.
func TestVaiRongLaMangRongChuKhongPhaiNull(t *testing.T) {
	// Engine mở, đúng một vai và nó đang bận: không có ai chờ, nhưng ĐO ĐƯỢC là không có ai.
	ra := chieuTruongSong(host.UISnapshot{
		Agents: []host.AgentSnapshot{{Name: "writer", State: "working"}},
	})

	if ra.IdleAgents == nil {
		t.Error("idle_agents = nil → JSON `null`.\n" +
			"Engine ĐANG MỞ và ta ĐO ĐƯỢC rằng không vai nào chờ; `null` nói ngược lại " +
			"(\"không đo được\"), và giao diện sẽ vẽ dấu không-có-nguồn cạnh một vai đang chạy.")
	}

	// Chiều đối xứng: mọi vai đều chờ thì `agents` phải là mảng rỗng, không phải null.
	ra2 := chieuTruongSong(host.UISnapshot{
		Agents: []host.AgentSnapshot{{Name: "editor", State: "idle"}},
	})
	if ra2.Agents == nil {
		t.Error("agents = nil → JSON `null` trong khi engine mở và đo được là không ai chạy")
	}
}

// TestTienDoMangRuntimeDeThayCuaDangCho canh một khoảng hở ĐO ĐƯỢC bằng E2E: cửa nghiệm thu
// chặn thật mà hợp đồng JSON không có tín hiệu nào để thấy điều đó.
//
// Spec ban đầu chiếu "cửa đang chờ bạn" vào `HasAdvanceHold`. Sai. `AdvanceHold` là một lần
// TẠM DỪNG DO CAN THIỆP KÝ (engine.go:672 đặt nó từ `arbiter.AdvanceHoldOp`), không phải cửa
// nghiệm thu theo chương. Chế độ `review` chặn bằng cách ĐỂ ENGINE DỪNG khi chưa có giấy phép
// cho chương kế tiếp — `AdvanceHold` vẫn `nil` suốt.
//
// ĐO ĐƯỢC trên cuốn `mac-the-bien-di-vo`: bật `review`, engine viết xong chương 4 rồi dừng.
// Host báo `RuntimeState: "paused"`, `AdvanceMode: "review"`, `AdvancePermitChapter: 0`,
// `HasAdvanceHold: FALSE`. Tức với hợp đồng cũ, giao diện không bao giờ vẽ được cửa ở luồng
// THƯỜNG — chỉ vẽ ở ca can thiệp, là ca hiếm hơn nhiều.
//
// `runtime` vào đây thay vì suy từ `agents == []`: danh sách vai rỗng cũng xảy ra trong một
// nhịp chuyển giữa hai bước, nên suy từ nó là đoán. `RuntimeState` là sự thật mà engine tự
// khẳng định, và TUI cũng đọc đúng trường đó (`snapshotRuntimeStateLabel`).
func TestTienDoMangRuntimeDeThayCuaDangCho(t *testing.T) {
	ra := chieuTruongSong(host.UISnapshot{
		RuntimeState:         "paused",
		AdvanceMode:          "review",
		AdvancePermitChapter: 0,
		// HasAdvanceHold cố ý để FALSE: đây đúng hình dạng đã đo ở luồng thường.
	})

	if ra.Runtime != "paused" {
		t.Errorf("runtime = %q, muốn \"paused\".\n"+
			"Không có trường này thì giao diện không phân biệt được \"engine đang viết\" với "+
			"\"engine đã dừng, chờ bạn cấp phép chương sau\" — hai ca mà cả màn Cửa nghiệm thu "+
			"tồn tại để phân biệt.", ra.Runtime)
	}
	if ra.Advance == nil || ra.Advance.Hold {
		t.Errorf("advance = %+v — ca này `hold` PHẢI false; nếu nó true thì bài kiểm đang "+
			"dựng sai hình dạng và không đo được điều nó nói", ra.Advance)
	}
}
