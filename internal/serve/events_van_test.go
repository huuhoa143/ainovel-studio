package serve

import (
	"bufio"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// TestSSEVanSongKhungDung canh HAI lớp lỗi trong một khung SSE.
//
//  1. KHÔNG được đặt `id:` cho sự kiện văn sống. `resumeSeq` (events.go) đọc `Last-Event-ID`
//     làm mốc HÀNG ĐỢI ui_event; trình duyệt tự gửi lại header đó khi nối lại. Một seq của
//     delta lọt vào đó làm client bỏ qua hoặc phát lại các sự kiện ui — và cả hai hướng sai
//     đều im lặng.
//  2. Chữ phải ở `data.text`, KHÔNG ở `summary`. Phía web, `congDoanTu()` trong
//     web/lib/useStudio.ts dựng nhãn "công đoạn" từ `ev.summary`; nhồi văn vào đó thì ô công
//     đoạn ở thanh transport hiện văn truyện.
func TestSSEVanSongKhungDung(t *testing.T) {
	goc := t.TempDir()
	newBook(t, goc, "sach", nil)

	may := newBoMay(goc)
	van := &dongVan{}
	may.dang["sach"] = &phienMay{id: "sach", van: van, moLuc: mocBayGio()}
	van.them("Giọt đầu tiên rơi.")

	srv := &server{root: goc, choGhi: true, may: may}
	rec := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/books/sach/events", nil)
	ctx, huy := contextVoiHanVan(t, 400*time.Millisecond)
	defer huy()
	srv.routes().ServeHTTP(rec, r.WithContext(ctx))

	than := rec.Body.String()
	if !strings.Contains(than, "event: stream_delta") {
		t.Fatalf("không thấy sự kiện stream_delta trong khung:\n%s", than)
	}
	if !strings.Contains(than, `"text":"Giọt đầu tiên rơi."`) {
		t.Errorf("chữ không nằm ở data.text:\n%s", than)
	}
	if strings.Contains(than, `"summary":"Giọt đầu tiên`) {
		t.Error("chữ lọt vào summary — ô công đoạn ở transport sẽ hiện văn truyện")
	}
	for _, khoi := range strings.Split(than, "\n\n") {
		if strings.Contains(khoi, "event: stream_delta") && strings.Contains(khoi, "id:") {
			t.Errorf("khối stream_delta có `id:` — nó sẽ đè mốc Last-Event-ID của ui_event:\n%s", khoi)
		}
	}
}

// TestSSEVanSongVaoGiuaLuot canh thứ tự hai sự kiện đầu tiên.
//
// Nếu gửi cả đoạn đang chảy mà KHÔNG gửi `stream_clear` trước, giao diện sẽ dán đoạn đó vào
// phần văn nó đang giữ từ trước (ví dụ sau khi mất kết nối rồi nối lại) — hai khúc của cùng
// một lượt xuất hiện hai lần liền nhau, và người đọc không có cách nào biết đâu là chỗ nối.
func TestSSEVanSongVaoGiuaLuot(t *testing.T) {
	goc := t.TempDir()
	newBook(t, goc, "sach", nil)

	may := newBoMay(goc)
	van := &dongVan{}
	may.dang["sach"] = &phienMay{id: "sach", van: van, moLuc: mocBayGio()}
	van.them("nửa đầu ")
	van.them("nửa sau")

	srv := &server{root: goc, choGhi: true, may: may}
	rec := httptest.NewRecorder()
	ctx, huy := contextVoiHanVan(t, 400*time.Millisecond)
	defer huy()
	srv.routes().ServeHTTP(rec, httptest.NewRequest("GET", "/api/books/sach/events", nil).WithContext(ctx))

	than := rec.Body.String()
	iXoa := strings.Index(than, "event: stream_clear")
	iVan := strings.Index(than, "event: stream_delta")
	if iXoa < 0 || iVan < 0 {
		t.Fatalf("thiếu sự kiện mở đầu:\n%s", than)
	}
	if iXoa > iVan {
		t.Error("stream_clear đến SAU stream_delta — giao diện sẽ xóa mất đoạn vừa nhận")
	}
	if !strings.Contains(than, `"text":"nửa đầu nửa sau"`) {
		t.Errorf("đoạn đang chảy không được gửi nguyên khối:\n%s", than)
	}
	// Và KHÔNG được gửi lại từng mẩu sau khi đã gửi cả khối.
	if strings.Count(than, "event: stream_delta") != 1 {
		t.Errorf("có %d sự kiện stream_delta, muốn 1 — đoạn văn đang bị gửi lặp",
			strings.Count(than, "event: stream_delta"))
	}
}

// TestSSEVanSongKhongCoMayVanChay canh việc "không có văn sống" KHÔNG phải lỗi.
//
// Hai ca hợp lệ: `s.may == nil` (studio chạy chế độ chỉ đọc, ngoài loopback) và engine chưa
// mở cho cuốn này. Cả hai đều phải cho `/events` chạy bình thường — dòng sự kiện đọc từ store
// nên nó không cần engine. Trả lỗi ở đây sẽ làm giao diện mất luôn dòng sự kiện của một cuốn
// đang xem, chỉ vì nó không chạy.
func TestSSEVanSongKhongCoMayVanChay(t *testing.T) {
	for _, ten := range []string{"không có bộ giám sát", "engine chưa mở"} {
		t.Run(ten, func(t *testing.T) {
			goc := t.TempDir()
			newBook(t, goc, "sach", nil)
			var may *boMay
			if ten == "engine chưa mở" {
				may = newBoMay(goc)
			}
			srv := &server{root: goc, choGhi: true, may: may}
			rec := httptest.NewRecorder()
			ctx, huy := contextVoiHanVan(t, 250*time.Millisecond)
			defer huy()
			srv.routes().ServeHTTP(rec,
				httptest.NewRequest("GET", "/api/books/sach/events", nil).WithContext(ctx))

			if rec.Code != 200 {
				t.Fatalf("mã %d, muốn 200: %s", rec.Code, rec.Body.String())
			}
			if strings.Contains(rec.Body.String(), "event: stream_delta") {
				t.Error("phát văn sống khi không có engine — không có nguồn nào để phát")
			}
		})
	}
}

// TestNhipDoUiEventKhongDoi canh việc ai đó "tối ưu" cả hai loại về một nhịp.
//
// Hai loại có nhịp KHÁC nhau vì dữ liệu của chúng khác nhau, và cả hai con số đều đo được
// trên scripts/sample.gif: dòng sự kiện thêm dòng 5 lần trong 17,9 giây (dò 700ms là đủ),
// còn văn sống đổi ở 146/254 khung với trung vị 70ms (phải đánh thức).
//
// Hạ `pollInterval` xuống cho văn sống là nghiền đĩa: mỗi nhịp dò là một lần đọc tệp JSONL,
// và ở 150ms thì đó là gần 7 lần đọc mỗi giây cho một hàng đợi gần như im.
func TestNhipDoUiEventKhongDoi(t *testing.T) {
	if pollInterval != 700*time.Millisecond {
		t.Errorf("pollInterval = %v, muốn 700ms. Nếu đổi có chủ ý thì sửa cả bài kiểm này "+
			"VÀ ghi lý do: văn sống KHÔNG cần nhịp này, nó đi theo đánh thức (xem dongVan.doi).",
			pollInterval)
	}
}

// contextVoiHanVan cho handler SSE một hạn chót để nó thoát vòng chờ.
//
// Handler SSE chạy vô hạn tới khi client đi; `httptest` không tự đóng, nên bài kiểm phải là
// bên đặt hạn.
func contextVoiHanVan(t *testing.T, d time.Duration) (context.Context, context.CancelFunc) {
	t.Helper()
	return context.WithTimeout(context.Background(), d)
}

// TestSSEVanSongChayTrongLucDangNoi canh ĐƯỜNG CHẢY THẬT của tính năng này.
//
// # Vì sao bài kiểm này phải có
//
// Ba bài kiểm trên đều nạp chữ TRƯỚC khi mở kết nối, nên mọi thứ đi qua nhánh "gửi cả lượt
// hiện tại lúc nối" và hàm `bomVan` không bao giờ phát gì. ĐO ĐƯỢC bằng phép thử đột biến:
// ba đột biến vào `bomVan` — cho delta mang `id:`, nhét chữ vào `summary` thay vì `data.text`,
// và đảo thứ tự đăng-ký-chờ với đọc — đều XANH, không bài nào bắt.
//
// Mà `bomVan` mới là đường mà chữ đi khi engine đang viết: người dùng mở trang rồi NGỒI XEM,
// và mọi mẩu sau đó đều qua đường này. Bộ kiểm cũ canh đúng cái không quan trọng.
//
// # Vì sao chạy handler trong goroutine
//
// Handler SSE chạy tới khi client đi, nên nó phải ở goroutine khác để bài kiểm còn đẩy được
// chữ vào giữa chừng. Chỉ đọc `rec.Body` SAU khi handler đã về (chờ `xong`) — đọc trong lúc
// nó còn ghi là một cuộc đua dữ liệu, và `-race` sẽ bắt đúng bài kiểm này chứ không bắt lỗi
// thật.
func TestSSEVanSongChayTrongLucDangNoi(t *testing.T) {
	goc := t.TempDir()
	newBook(t, goc, "sach", nil)

	may := newBoMay(goc)
	van := &dongVan{}
	may.dang["sach"] = &phienMay{id: "sach", van: van, moLuc: mocBayGio()}

	srv := &server{root: goc, choGhi: true, may: may}
	rec := httptest.NewRecorder()
	ctx, huy := contextVoiHanVan(t, 700*time.Millisecond)
	defer huy()

	xong := make(chan struct{})
	go func() {
		srv.routes().ServeHTTP(rec,
			httptest.NewRequest("GET", "/api/books/sach/events", nil).WithContext(ctx))
		close(xong)
	}()

	// Chờ handler vào vòng chờ rồi mới đẩy: đẩy quá sớm thì mẩu rơi vào nhánh "lúc nối" và
	// bài kiểm lại canh nhầm nhánh, đúng lỗi mà nó sinh ra để vá.
	time.Sleep(120 * time.Millisecond)
	van.them("mẩu đến ")
	time.Sleep(60 * time.Millisecond)
	van.them("khi đang nối")
	<-xong

	than := rec.Body.String()
	if !strings.Contains(than, `"text":"mẩu đến "`) || !strings.Contains(than, `"text":"khi đang nối"`) {
		t.Fatalf("mẩu đẩy trong lúc đang nối không tới được client:\n%s", than)
	}
	if strings.Contains(than, `"summary"`) {
		t.Error("chữ lọt vào summary — ô công đoạn ở transport sẽ hiện văn truyện")
	}
	for _, khoi := range strings.Split(than, "\n\n") {
		if strings.Contains(khoi, "event: stream_delta") && strings.Contains(khoi, "id:") {
			t.Errorf("khối stream_delta có `id:` — nó đè mốc Last-Event-ID của ui_event:\n%s", khoi)
		}
	}
}

// TestSSEVanSongToiTrongVaiChucMili canh ĐỘ TRỄ, không canh sự có mặt.
//
// # Vì sao cần bài kiểm đo thời gian
//
// ĐO ĐƯỢC bằng phép thử đột biến: đảo thứ tự "đăng ký chờ" với "đọc bộ đệm" — tức đặt
// `van.doi()` SAU `bomVan` — thì mọi bài kiểm khác vẫn XANH. Đột biến đó không làm MẤT chữ;
// nó chỉ làm chữ tới MUỘN: mẩu đến trong kẽ hở giữa hai bước không đánh thức ai, nên kết nối
// ngủ tới nhịp dò 700ms kế tiếp.
//
// Mà đó đúng là thứ tính năng này sinh ra để tránh. ĐO ĐƯỢC trên scripts/sample.gif: nhịp
// thật của chữ máy là trung vị 70ms, 94% khoảng cách ≤ 210ms. Chảy qua vòng dò 700ms thì
// người dùng thấy chữ nhảy từng cục — có chữ, nhưng mất hẳn cảm giác đang chạy.
//
// Ngưỡng 300ms là ngưỡng RỘNG cho máy CI chậm, và vẫn nhỏ hơn 700ms đủ để đột biến đỏ.
//
// # Vì sao phải dựng server thật
//
// `httptest.ResponseRecorder` chỉ đọc được sau khi handler đã về, nên nó không đo được lúc
// một dòng TỚI. Muốn đo độ trễ thì phải đọc dòng theo dòng từ một kết nối thật.
func TestSSEVanSongToiTrongVaiChucMili(t *testing.T) {
	goc := t.TempDir()
	newBook(t, goc, "sach", nil)

	may := newBoMay(goc)
	van := &dongVan{}
	may.dang["sach"] = &phienMay{id: "sach", van: van, moLuc: mocBayGio()}

	ts := httptest.NewServer((&server{root: goc, choGhi: true, may: may}).routes())
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/api/books/sach/events")
	if err != nil {
		t.Fatalf("mở dòng: %v", err)
	}
	defer resp.Body.Close()
	doc := bufio.NewReader(resp.Body)

	// Chờ handler vào vòng chờ. Đẩy sớm hơn thì mẩu rơi vào nhánh "gửi cả lượt lúc nối" và
	// phép đo thành vô nghĩa.
	time.Sleep(150 * time.Millisecond)

	type ketQua struct {
		tre time.Duration
		err error
	}
	// `mocDay` đặt TRƯỚC khi goroutine chạy và không ghi lại nữa: goroutine chỉ đọc, nên
	// không có cuộc đua. Đặt nó thành biến gói rồi gán trong thân bài kiểm là một cuộc đua
	// thật, và `-race` sẽ bắt chính bài kiểm này chứ không bắt lỗi của sản phẩm.
	mocDay := time.Now()
	ch := make(chan ketQua, 1)
	go func() {
		for {
			dong, err := doc.ReadString('\n')
			if err != nil {
				ch <- ketQua{err: err}
				return
			}
			if strings.Contains(dong, `"text":"nhanh lên"`) {
				ch <- ketQua{tre: time.Since(mocDay)}
				return
			}
		}
	}()

	van.them("nhanh lên")

	select {
	case kq := <-ch:
		if kq.err != nil {
			t.Fatalf("đọc dòng: %v", kq.err)
		}
		if kq.tre > 300*time.Millisecond {
			t.Errorf("mẩu tới sau %v — quá 300ms nghĩa là nó đi theo vòng dò 700ms chứ không "+
				"theo đánh thức. Kiểm lại thứ tự: `van.doi()` phải gọi TRƯỚC `bomVan`.", kq.tre)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("mẩu không bao giờ tới")
	}
}

// TestSSEVanSongEngineMoSauKhiNoi canh lỗi ĐO ĐƯỢC trên truyện thật (dong-ho-qua-lac,
// 2026-10-02): trang mở lúc engine CHƯA mở, người dùng bấm Viết tiếp, engine mở với bộ đệm
// mới — và khung "AI đang viết" trống suốt ba chương, vì kết nối SSE chỉ tra bộ đệm một lần
// lúc nối. Kết nối đang mở phải tự nhận bộ đệm của phiên vừa mở, và cả phiên MỞ LẠI sau đó.
func TestSSEVanSongEngineMoSauKhiNoi(t *testing.T) {
	goc := t.TempDir()
	newBook(t, goc, "sach", nil)
	may := newBoMay(goc)
	srv := httptest.NewServer((&server{root: goc, choGhi: true, may: may}).routes())
	defer srv.Close()

	ctx, huy := context.WithTimeout(context.Background(), 6*time.Second)
	defer huy()
	req, _ := http.NewRequestWithContext(ctx, "GET", srv.URL+"/api/books/sach/events", nil)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()

	dong := make(chan string, 64)
	go func() {
		sc := bufio.NewScanner(res.Body)
		for sc.Scan() {
			dong <- sc.Text()
		}
		close(dong)
	}()
	cho := func(muon string) {
		t.Helper()
		for {
			select {
			case l, ok := <-dong:
				if !ok {
					t.Fatalf("stream đóng trước khi thấy %q", muon)
				}
				if strings.Contains(l, muon) {
					return
				}
			case <-ctx.Done():
				t.Fatalf("hết giờ chờ %q — kết nối không nhận bộ đệm của phiên vừa mở", muon)
			}
		}
	}

	// Engine mở SAU khi kết nối đã nối.
	time.Sleep(150 * time.Millisecond)
	van := &dongVan{}
	may.mu.Lock()
	may.dang["sach"] = &phienMay{id: "sach", van: van, moLuc: mocBayGio()}
	may.mu.Unlock()
	van.them("Chương một bắt đầu.")
	cho(`"text":"Chương một bắt đầu."`)

	// Đóng rồi mở lại phiên: bộ đệm mới, kết nối cũ vẫn phải theo kịp.
	van2 := &dongVan{}
	may.mu.Lock()
	may.dang["sach"] = &phienMay{id: "sach", van: van2, moLuc: mocBayGio()}
	may.mu.Unlock()
	van2.them("Phiên mới.")
	cho(`"text":"Phiên mới."`)
}
