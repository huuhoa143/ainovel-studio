package serve

import (
	"strings"
	"testing"
	"time"

	"github.com/huuhoa143/ainovel-studio/internal/host"
)

// TestDongVanRanhGioiLuotDungThuTu canh lớp lỗi "xử lý lệnh xóa NGOÀI hàng".
//
// Engine phát `host.StreamClearSentinel` trên CÙNG channel với chữ để giữ thứ tự
// (host.go:1085 — chú thích ở đó nói rõ sentinel đi cùng kênh để đảm bảo có thứ tự).
// Nếu bộ đệm bắt sentinel ra xử lý riêng — ví dụ gọi thẳng một hàm xóa — thì một mẩu chữ
// của lượt MỚI có thể vượt lên trước lệnh xóa của lượt CŨ, và giao diện xóa mất đúng phần
// vừa nhận. Bài kiểm này chốt rằng lệnh xóa là MỘT MỤC trong hàng, nằm đúng chỗ.
func TestDongVanRanhGioiLuotDungThuTu(t *testing.T) {
	d := &dongVan{}
	d.them("một ")
	d.them("hai")
	d.them(host.StreamClearSentinel)
	d.them("ba")

	manh, _ := d.sau(0)
	if len(manh) != 4 {
		t.Fatalf("hàng có %d mục, muốn 4: %+v", len(manh), manh)
	}
	muon := []struct {
		chu string
		xoa bool
	}{{"một ", false}, {"hai", false}, {"", true}, {"ba", false}}
	for i, m := range muon {
		if manh[i].Chu != m.chu || manh[i].Xoa != m.xoa {
			t.Errorf("mục %d = %+v, muốn chu=%q xoa=%v", i, manh[i], m.chu, m.xoa)
		}
		if i > 0 && manh[i].Seq <= manh[i-1].Seq {
			t.Errorf("mục %d có Seq %d không lớn hơn mục trước (%d) — hàng mất thứ tự",
				i, manh[i].Seq, manh[i-1].Seq)
		}
	}

	// Lượt hiện tại chỉ được chứa chữ SAU lệnh xóa. Nếu nó còn "mộthai" thì người vào
	// muộn sẽ nhận cả văn của lượt trước, dán liền vào lượt này.
	if vong, _ := d.vongHienTai(); vong != "ba" {
		t.Errorf("vòng hiện tại = %q, muốn %q", vong, "ba")
	}
	// Sentinel KHÔNG được lọt vào văn dưới dạng chuỗi thô.
	if strings.Contains(func() string { v, _ := d.vongHienTai(); return v }(), "CLEAR") {
		t.Error("sentinel lọt vào văn — người dùng sẽ thấy ký tự điều khiển trên trang")
	}
}

// TestDongVanHaiCaiTran canh hai lớp lỗi khác nhau, đừng gộp chúng.
//
//  1. Hàng phát lại phình vô hạn → process giữ cả engine ăn hết RAM sau vài giờ chạy.
//  2. `vong` (văn lượt hiện tại) phình vô hạn nếu engine KHÔNG phát lệnh xóa nào — chuyện
//     xảy ra thật khi có gì đó sai ở tầng dưới.
//
// Hướng cắt của (2) là điều đáng canh nhất: cắt từ ĐẦU, không từ cuối. Phần cuối là phần
// đang chảy, tức phần người dùng đang đọc; cắt cuối là xóa đúng thứ họ đang nhìn.
func TestDongVanHaiCaiTran(t *testing.T) {
	t.Run("hàng bỏ mục cũ nhất", func(t *testing.T) {
		d := &dongVan{}
		for i := 0; i < soManhGiu+50; i++ {
			d.them("x")
		}
		manh, _ := d.sau(0)
		if len(manh) > soManhGiu {
			t.Errorf("hàng giữ %d mục, trần là %d", len(manh), soManhGiu)
		}
		// Mục còn lại phải là mục MỚI: seq nhỏ nhất phải lớn hơn 50.
		if manh[0].Seq <= 50 {
			t.Errorf("mục đầu có Seq %d — hàng đang bỏ mục MỚI thay vì mục cũ", manh[0].Seq)
		}
	})

	t.Run("vòng cắt từ đầu chứ không từ cuối", func(t *testing.T) {
		d := &dongVan{}
		d.them("ĐẦU-PHẢI-MẤT")
		// Đếm số lần gọi thay vì dò `vongLen() <= coVongToiDa`: `them()` tự cắt xuống đúng
		// coVongToiDa/2 NGAY trong cùng lời gọi mỗi khi vượt trần, nên độ dài đọc lại được sau
		// mỗi lời gọi luôn <= coVongToiDa — dò theo điều kiện đó sẽ không bao giờ thoát.
		soLan := coVongToiDa/4096 + 2
		for i := 0; i < soLan; i++ {
			d.them(strings.Repeat("y", 4096))
		}
		d.them("CUỐI-PHẢI-CÒN")

		vong, _ := d.vongHienTai()
		if len(vong) > coVongToiDa {
			t.Errorf("vòng dài %d byte, trần là %d", len(vong), coVongToiDa)
		}
		if !strings.HasSuffix(vong, "CUỐI-PHẢI-CÒN") {
			t.Error("mất phần CUỐI — đó là phần đang chảy, người dùng đang đọc nó")
		}
		if strings.Contains(vong, "ĐẦU-PHẢI-MẤT") {
			t.Error("còn phần ĐẦU sau khi vượt trần — trần không được thi hành")
		}
	})
}

// TestDongVanHaiNguoiDocDeuDu là bài kiểm BIỆN HỘ cho sự tồn tại của cả tệp dong_van.go.
//
// `Host.Stream()` là một channel Go, tức "một người nhận": mỗi mẩu chữ chỉ đến đúng một chỗ
// đọc. Nếu mỗi kết nối SSE tự nhận thẳng từ đó thì hai tab trình duyệt GIÀNH mẩu của nhau —
// mỗi bên thấy một nửa câu và không bên nào biết mình đang thiếu.
//
// Nếu ai đó "tối ưu" bằng cách cho kết nối đọc thẳng channel, bài này phải đỏ.
func TestDongVanHaiNguoiDocDeuDu(t *testing.T) {
	d := &dongVan{}
	const so = 200
	for i := 0; i < so; i++ {
		d.them("m")
	}

	// Vòng đọc có TRẦN SỐ LƯỢT, không phải vòng `for` trần.
	//
	// ĐO ĐƯỢC bằng phép thử đột biến: đổi `sau()` từ `m.Seq > seq` thành `>= seq` làm mẩu
	// cuối được trả lại mãi, và bài kiểm này TREO cho tới khi `go test` hết giờ 45 giây rồi
	// chết bằng một stack dump. Nó vẫn "bắt" được đột biến, nhưng bắt theo cách tệ nhất:
	// không ai đọc ra nguyên nhân từ stack dump, và một bài kiểm treo là bài kiểm sẽ bị tắt.
	//
	// Trần đặt ở `so + 5`: đọc đủ `so` mẩu cần nhiều nhất `so` lượt (ca xấu nhất là mỗi lượt
	// một mẩu), cộng biên cho lượt cuối trả rỗng.
	doc := func() int {
		var moc int64
		dem := 0
		for luot := 0; luot <= so+5; luot++ {
			manh, _ := d.sau(moc)
			if len(manh) == 0 {
				return dem
			}
			for _, m := range manh {
				dem++
				moc = m.Seq
			}
		}
		t.Fatalf("vòng đọc không dừng sau %d lượt — `sau()` đang trả lại mẩu đã đọc, "+
			"nên một kết nối SSE sẽ phát lại mãi cùng một khúc văn", so+5)
		return dem
	}

	a, b := doc(), doc()
	if a != so || b != so {
		t.Errorf("người đọc A nhận %d mẩu, B nhận %d — cả hai phải nhận đủ %d. "+
			"Số lệch nghĩa là hai kết nối đang giành dữ liệu của nhau.", a, b, so)
	}
}

// TestDongVanVaoMuonKhongLap canh lớp lỗi "thấy nửa cuối một câu".
//
// Người dùng mở trang GIỮA lúc engine đang viết. Chỉ phát các mẩu MỚI thì họ thấy khúc giữa
// một câu và phải đoán phần đầu. Nên lúc nối phải gửi cả `vong`.
//
// Nhưng gửi cả vòng RỒI gửi tiếp từ seq 0 thì họ nhận đoạn đó HAI lần. Vì vậy `vongHienTai`
// trả cả văn và mốc seq trong MỘT lời gọi có khóa: tách hai lời gọi thì giữa chúng có thể
// xen mẩu mới, và người đọc thấy một khúc bị lặp.
func TestDongVanVaoMuonKhongLap(t *testing.T) {
	d := &dongVan{}
	d.them("Giọt đầu tiên ")
	d.them("rơi xuống ")
	d.them("mặt kính.")

	vong, moc := d.vongHienTai()
	if vong != "Giọt đầu tiên rơi xuống mặt kính." {
		t.Fatalf("vòng = %q", vong)
	}

	// Sau mốc đó, người vào muộn KHÔNG được nhận lại gì cả.
	manh, _ := d.sau(moc)
	if len(manh) != 0 {
		t.Errorf("nhận thêm %d mẩu sau mốc của vòng — người đọc sẽ thấy đoạn văn lặp: %+v",
			len(manh), manh)
	}

	// Mẩu mới sau đó thì phải nhận.
	d.them(" Nó không trong.")
	manh, _ = d.sau(moc)
	if len(manh) != 1 || manh[0].Chu != " Nó không trong." {
		t.Errorf("mẩu mới sau mốc = %+v, muốn đúng một mẩu %q", manh, " Nó không trong.")
	}
}

// TestDongVanHutKetThucKhiChannelDong canh lớp lỗi rò goroutine.
//
// Mỗi phiên engine chạy một `go p.van.hut(eng.Stream())`. `Host.Close()` đóng channel đó
// (host.go:899). Nếu `hut` không kết thúc theo, mỗi lần mở-đóng một cuốn để lại một goroutine
// treo — và studio là process chạy hàng giờ, mở nhiều cuốn.
//
// KHÔNG thêm một đường hủy thứ hai (ctx) vào `hut`: hai đường hủy cho một vòng lặp tạo ra khả
// năng goroutine chết TRƯỚC engine, và lúc đó `emitDelta` đầy hàng rồi âm thầm bỏ mẩu.
func TestDongVanHutKetThucKhiChannelDong(t *testing.T) {
	d := &dongVan{}
	ch := make(chan string, 3)
	xong := make(chan struct{})
	go func() {
		d.hut(ch)
		close(xong)
	}()

	ch <- "a"
	ch <- "b"
	close(ch)

	select {
	case <-xong:
	case <-time.After(2 * time.Second):
		t.Fatal("hut không kết thúc sau khi channel đóng — goroutine bị rò")
	}

	manh, _ := d.sau(0)
	if len(manh) != 2 {
		t.Errorf("hút được %d mẩu, muốn 2 — mẩu gửi trước lúc đóng không được mất", len(manh))
	}
}

// TestDongVanDanhThucNgay canh lý do KIẾN TRÚC của cơ chế đánh thức.
//
// ĐO ĐƯỢC trên scripts/sample.gif (255 khung × 70ms): khu chữ máy đổi ở 146/254 khung, khoảng
// cách trung vị giữa hai lần đổi là 70ms và 94% khoảng cách ≤ 210ms. `pollInterval` của SSE
// hiện tại là 700ms — chậm gấp 10 lần. Đẩy văn sống qua vòng dò đó thì người dùng thấy chữ
// nhảy từng cục mỗi 0,7 giây, không phải chảy.
//
// Engine chạy IN-PROCESS nên không cần dò: người chờ được đánh thức ngay khi có mẩu mới.
// Ngưỡng 200ms trong bài kiểm là ngưỡng RỘNG cho máy CI chậm; nó vẫn đỏ nếu ai thay đánh thức
// bằng một vòng dò 700ms.
func TestDongVanDanhThucNgay(t *testing.T) {
	d := &dongVan{}
	cho := d.doi()

	go func() {
		time.Sleep(10 * time.Millisecond)
		d.them("mẩu mới")
	}()

	select {
	case <-cho:
	case <-time.After(200 * time.Millisecond):
		t.Fatal("người chờ không được đánh thức trong 200ms — cơ chế đánh thức không hoạt động")
	}

	// Đăng ký TRƯỚC rồi đọc SAU là luật chống mất mẩu: nếu đọc trước rồi mới đăng ký thì mẩu
	// đến giữa hai bước sẽ không đánh thức ai, và kết nối treo tới nhịp sau.
	cho2 := d.doi()
	select {
	case <-cho2:
		t.Fatal("channel chờ MỚI đã đóng sẵn — người chờ sẽ quay vòng liên tục, tức lại là dò")
	default:
	}
}
