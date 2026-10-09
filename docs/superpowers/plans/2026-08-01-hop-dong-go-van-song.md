# Hợp đồng Go: văn sống + ánh xạ UISnapshot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa chữ model đang sinh ra và các trường trạng thái sống của engine ra HTTP, để ba bề mặt web (buồng lái, Xưởng, cửa nghiệm thu) có dữ liệu thật mà dựng.

**Architecture:** Engine đã chạy in-process nên `host.Host` gọi được trực tiếp. Thêm một đơn vị duy nhất — `dongVan` — hút `Host.Stream()` (channel một-người-nhận) vào một bộ đệm để N kết nối SSE phát lại được; phần còn lại là ánh xạ `host.UISnapshot` sang JSON. SSE chạy **hai nhịp**: `ui_event` giữ dò 700ms, văn sống đi theo đánh thức.

**Tech Stack:** Go 1.2x (chuẩn thư viện: `net/http`, `net/http/httptest`, `sync`, `encoding/json`), TypeScript (chỉ tệp kiểu `web/lib/types.ts`).

**Spec:** `docs/superpowers/specs/2026-08-01-buong-lai-nam-man-design.md`
**Base:** nhánh `feat/viet-hoa-i18n`, HEAD `a9bbbb4`
**Trạng thái: ĐÃ XONG 2026-08-01** — 16/16 task, 17 commit, gộp tua nhanh vào
`feat/viet-hoa-i18n`. Cổng trên bản đã gộp: build ✓ vet ✓ gofmt ✓ 30 gói / 0 FAIL ✓ tsc ✓.

> ### Bài học phải đọc trước khi lặp lại quy trình này
>
> **1. Đừng đặt worktree BÊN TRONG repo này.** `.worktrees/hop-dong-go/` là một bản sao đầy
> đủ của cây nguồn, và hai gói `internal/diag` + `internal/i18n` có bộ quét đi khắp cây tìm
> chữ Hán và chuỗi chưa bọc i18n. Chúng bò vào bản sao đó và cho **8 FAIL** ngay sau khi gộp,
> trong khi worktree riêng cho 0 FAIL. Lần sau đặt worktree ngoài repo, hoặc dạy hai bộ quét
> bỏ qua thư mục ẩn.
>
> **2. Cổng xanh ở worktree KHÔNG chứng minh gì về bản đã gộp.** Chính vì thế mà bước chạy
> lại cổng sau khi gộp bắt được điều trên.
>
> **3. Cổng xanh không chứng minh bài kiểm canh được gì.** Phép thử đột biến (sửa mã sản xuất
> rồi xem bài kiểm có đỏ không) bắt được hai lỗ hổng mà toàn bộ cổng đều xanh:
> bài kiểm cụm A bắt lỗi bằng cách TREO 45 giây thay vì khẳng định; và cụm B **không có bài
> kiểm nào chạy qua `bomVan`** — đường mà chữ thật sự đi khi engine đang viết — nên ba đột
> biến lọt sạch, trong đó có "delta mang `id:`".

---

## Đây là kế hoạch 1 trong 4

Spec gồm bốn hệ con. Kế hoạch này làm **hợp đồng Go** — nó tự cho ra software kiểm được bằng
`curl` mà không cần một dòng giao diện nào. Ba kế hoạch còn lại (buồng lái · Xưởng · cửa nghiệm
thu) viết sau khi kế hoạch này hạ cánh, vì viết chúng bây giờ là viết dựa trên một hợp đồng
JSON chưa được chứng minh.

## Bối cảnh mà người thi hành cần biết trước

- `internal/serve` là gói duy nhất được ghi vào store qua HTTP. Nó **cố ý không đi qua i18n**
  (đã ghi trong package doc) — đừng "sửa".
- Tên hàm/biến trong gói này là **tiếng Việt không dấu**: `dongVan`, `manhVan`, `them`, `sau`,
  `hut`, `boMay`, `phienMay`. Giữ đúng lối đó.
- Chú thích **giải thích VÌ SAO**, không mô tả code làm gì. Có phép đo thì ghi con số ra. Đọc
  `internal/serve/dong_van.go` và `internal/serve/hoi_nguoi_dung.go` để thấy giọng.
- Helper test đã có trong gói: `newBook(t, goc, ten, nil)` dựng một cuốn trong `t.TempDir()`,
  `ghiTho(t, st, "chapters/01.md", noiDung)` ghi tệp. **Dùng lại**, đừng viết mới.
- `go test ./...` nền là **30 gói ok / 0 FAIL**. Không được giảm.
- Có một server thật đang chạy ở `127.0.0.1:8420` giữ khóa tệp trên thư mục sách thật. Mọi bài
  kiểm dùng `t.TempDir()`.
- **Không `git push`.** Remote của repo này không phải của chúng ta.

## Trạng thái xuất phát

`internal/serve/dong_van.go` đã có **bản nháp chưa có bài kiểm nào** (commit `48ee068`):
`dongVan{mu, manh, seq, vong}`, `manhVan{Seq, Chu, Xoa}`, `them`, `day`, `sau`, `vongHienTai`,
`hut`, hằng `soManhGiu = 3000`, `coVongToiDa = 512<<10`. `boMay.mo()` đã tạo `p.van` và chạy
`go p.van.hut(eng.Stream())`.

Coi bản nháp đó là **mã chưa được biện hộ**. Task 1–5 viết bài kiểm cho nó. Phần nào không có
bài kiểm nào phủ thì XÓA.

## File Structure

| Tệp | Trách nhiệm | Trạng thái |
|---|---|---|
| `internal/serve/dong_van.go` | bộ đệm văn sống + đánh thức. Không biết gì về HTTP. | có nháp, thêm `doi()` |
| `internal/serve/dong_van_test.go` | bài kiểm bộ đệm (task 1–6) | tạo mới |
| `internal/serve/events.go` | SSE: hai nhịp, ba loại sự kiện | sửa |
| `internal/serve/events_van_test.go` | bài kiểm SSE văn sống (task 7–10) | tạo mới |
| `internal/serve/model.go` | struct JSON của payload | sửa |
| `internal/serve/snapshot.go` | ánh xạ `host.UISnapshot` → JSON | sửa |
| `internal/serve/snapshot_song_test.go` | bài kiểm ánh xạ (task 11–14) | tạo mới |
| `internal/serve/serve.go` | `handleWorkshop` | sửa |
| `internal/serve/web_kieu_test.go` | bộ canh quét `web/lib/types.ts` (task 15) | tạo mới |
| `web/lib/types.ts` | kiểu của payload | sửa |

---

## Task 1: Ranh giới lượt đi đúng thứ tự trong hàng

**Files:**
- Test: `internal/serve/dong_van_test.go` (tạo mới)
- Modify: `internal/serve/dong_van.go` nếu bài kiểm đỏ

- [x] **Step 1: Viết bài kiểm đỏ**

```go
package serve

import (
	"strings"
	"testing"

	"github.com/voocel/ainovel-cli/internal/host"
)

// TestDongVanRanhGioiLuotDungThuTu canh lớp lỗi "xử lý lệnh xóa NGOÀI hàng".
//
// Engine phát `host.StreamClearSentinel` trên CÙNG channel với chữ để giữ thứ tự
// (host.go:1085 — chú thích ở đó nói rõ "sentinel đi cùng kênh để đảm bảo có thứ tự").
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
```

- [x] **Step 2: Chạy để xác nhận nó đỏ đúng lý do**

Run: `cd /path/to/repo && go test ./internal/serve/ -run TestDongVanRanhGioiLuotDungThuTu -v`

Nếu bản nháp đã đúng thì bài này XANH ngay. **Đó là kết quả hợp lệ** — nó biến mã chưa được
biện hộ thành mã có bài kiểm. Ghi lại output vào báo cáo. Nếu đỏ, đọc lý do rồi sang Step 3.

- [x] **Step 3: Sửa `dong_van.go` cho tới khi xanh (nếu cần)**

Chỉ sửa nếu Step 2 đỏ. Không "dọn dẹp" gì thêm.

- [x] **Step 4: Chạy lại, xác nhận xanh**

Run: `go test ./internal/serve/ -run TestDongVanRanhGioiLuotDungThuTu -v`
Expected: `PASS`

- [x] **Step 5: Commit**

```bash
git add internal/serve/dong_van_test.go internal/serve/dong_van.go
git commit -m "test(serve): chốt ranh giới lượt của bộ đệm văn sống đi trong hàng"
```

---

## Task 2: Hai cái trần — hàng phát lại và lượt hiện tại

**Files:**
- Modify: `internal/serve/dong_van_test.go`
- Modify: `internal/serve/dong_van.go` nếu đỏ

- [x] **Step 1: Viết bài kiểm đỏ**

```go
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
		for d.vongLen() <= coVongToiDa {
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
```

- [x] **Step 2: Chạy để xác nhận đỏ**

Run: `go test ./internal/serve/ -run TestDongVanHaiCaiTran -v`
Expected: FAIL — `d.vongLen undefined` (bản nháp không có hàm đó).

- [x] **Step 3: Thêm `vongLen` vào `dong_van.go`**

```go
// vongLen là số byte của lượt hiện tại. Chỉ để bài kiểm dừng vòng nạp đúng chỗ; giao diện
// không cần nó, nên nó không lên JSON.
func (d *dongVan) vongLen() int {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.vong.Len()
}
```

- [x] **Step 4: Chạy lại, xác nhận xanh**

Run: `go test ./internal/serve/ -run TestDongVanHaiCaiTran -v`
Expected: `PASS`. Nếu nhánh cắt vòng đỏ, sửa `them()` cho cắt đúng từ đầu.

- [x] **Step 5: Commit**

```bash
git add internal/serve/dong_van_test.go internal/serve/dong_van.go
git commit -m "test(serve): chốt hai cái trần của bộ đệm và hướng cắt của lượt hiện tại"
```

---

## Task 3: Hai người đọc độc lập đều nhận đủ

**Files:**
- Modify: `internal/serve/dong_van_test.go`

- [x] **Step 1: Viết bài kiểm đỏ**

```go
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

	doc := func() int {
		var moc int64
		dem := 0
		for {
			manh, _ := d.sau(moc)
			if len(manh) == 0 {
				return dem
			}
			for _, m := range manh {
				dem++
				moc = m.Seq
			}
		}
	}

	a, b := doc(), doc()
	if a != so || b != so {
		t.Errorf("người đọc A nhận %d mẩu, B nhận %d — cả hai phải nhận đủ %d. "+
			"Số lệch nghĩa là hai kết nối đang giành dữ liệu của nhau.", a, b, so)
	}
}
```

- [x] **Step 2: Chạy để xác nhận**

Run: `go test ./internal/serve/ -run TestDongVanHaiNguoiDocDeuDu -v`

Bản nháp nên xanh. Ghi output vào báo cáo.

- [x] **Step 3: (không cần sửa nếu xanh)**

- [x] **Step 4: Xác nhận xanh**

Run: `go test ./internal/serve/ -run TestDongVanHaiNguoiDocDeuDu -v`
Expected: `PASS`

- [x] **Step 5: Commit**

```bash
git add internal/serve/dong_van_test.go
git commit -m "test(serve): chốt hai kết nối cùng đọc đều nhận đủ mẩu chữ"
```

---

## Task 4: Người vào muộn nhận cả lượt, không nhận lặp

**Files:**
- Modify: `internal/serve/dong_van_test.go`

- [x] **Step 1: Viết bài kiểm đỏ**

```go
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
```

- [x] **Step 2: Chạy để xác nhận**

Run: `go test ./internal/serve/ -run TestDongVanVaoMuonKhongLap -v`

- [x] **Step 3: Sửa nếu đỏ**

- [x] **Step 4: Xác nhận xanh**

Expected: `PASS`

- [x] **Step 5: Commit**

```bash
git add internal/serve/dong_van_test.go internal/serve/dong_van.go
git commit -m "test(serve): chốt người vào muộn nhận cả lượt mà không nhận lặp"
```

---

## Task 5: `hut` kết thúc khi channel đóng, không rò goroutine

**Files:**
- Modify: `internal/serve/dong_van_test.go`

- [x] **Step 1: Viết bài kiểm đỏ**

```go
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
```

Thêm `"time"` vào import của tệp test.

- [x] **Step 2: Chạy để xác nhận**

Run: `go test ./internal/serve/ -run TestDongVanHutKetThucKhiChannelDong -v`

- [x] **Step 3: Sửa nếu đỏ**

- [x] **Step 4: Xác nhận xanh**

Expected: `PASS`

- [x] **Step 5: Commit**

```bash
git add internal/serve/dong_van_test.go
git commit -m "test(serve): chốt hut kết thúc theo channel, không rò goroutine"
```

---

## Task 6: Cơ chế đánh thức (thay vì dò)

**Files:**
- Modify: `internal/serve/dong_van.go`
- Modify: `internal/serve/dong_van_test.go`

- [x] **Step 1: Viết bài kiểm đỏ**

```go
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
```

- [x] **Step 2: Chạy để xác nhận đỏ**

Run: `go test ./internal/serve/ -run TestDongVanDanhThucNgay -v`
Expected: FAIL — `d.doi undefined`.

- [x] **Step 3: Thêm `doi()` và phần đánh thức trong `them()`**

Thêm trường vào struct:

```go
type dongVan struct {
	mu   sync.Mutex
	manh []manhVan
	seq  int64
	vong strings.Builder

	// cho là channel BÁO HIỆU, không mang dữ liệu: nó được ĐÓNG để đánh thức mọi người đang
	// chờ, rồi thay bằng channel mới. Đây là lối broadcast chuẩn của Go — gửi giá trị thì chỉ
	// một người nhận được, mà ở đây có N kết nối SSE cùng chờ một bộ đệm.
	cho chan struct{}
}

// doi trả channel để chờ mẩu tiếp theo.
//
// Người chờ phải gọi `doi()` TRƯỚC khi đọc `sau()`. Đọc trước rồi mới đăng ký thì mẩu đến
// giữa hai bước không đánh thức ai, và kết nối treo tới nhịp sau — tức chữ đứng im dù engine
// đang phát.
func (d *dongVan) doi() <-chan struct{} {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.cho == nil {
		d.cho = make(chan struct{})
	}
	return d.cho
}

// danhThuc đóng channel báo hiệu hiện tại. Gọi trong lúc đã giữ khóa.
func (d *dongVan) danhThuc() {
	if d.cho != nil {
		close(d.cho)
		d.cho = nil
	}
}
```

Trong `them()`, gọi `d.danhThuc()` ngay trước khi trả về ở CẢ HAI nhánh (nhánh sentinel và
nhánh chữ). Cách gọn: bọc bằng `defer d.danhThuc()` đặt ngay sau `defer d.mu.Unlock()` — thứ
tự defer là ngược, nên `danhThuc` chạy TRƯỚC `Unlock`, đúng yêu cầu "gọi trong lúc giữ khóa".

- [x] **Step 4: Chạy lại, xác nhận xanh**

Run: `go test ./internal/serve/ -run TestDongVanDanhThucNgay -v`
Expected: `PASS`

- [x] **Step 5: Commit**

```bash
git add internal/serve/dong_van.go internal/serve/dong_van_test.go
git commit -m "feat(serve): đánh thức người chờ văn sống thay vì để họ dò"
```

---

## Task 7: SSE phát `stream_delta` — không `id:`, chữ ở `data.text`

**Files:**
- Modify: `internal/serve/events.go`
- Test: `internal/serve/events_van_test.go` (tạo mới)

- [x] **Step 1: Viết bài kiểm đỏ**

```go
package serve

import (
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
	ctx, huy := contextVoiHan(t, 400*time.Millisecond)
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

// contextVoiHan cho handler SSE một hạn chót để nó thoát vòng chờ.
//
// Handler SSE chạy vô hạn tới khi client đi; `httptest` không tự đóng, nên bài kiểm phải là
// bên đặt hạn. Đặt hậu tố tên rõ để không đụng helper của đợt khác.
func contextVoiHan(t *testing.T, d time.Duration) (context.Context, context.CancelFunc) {
	t.Helper()
	return context.WithTimeout(context.Background(), d)
}
```

Thêm `"context"` vào import.

- [x] **Step 2: Chạy để xác nhận đỏ**

Run: `go test ./internal/serve/ -run TestSSEVanSongKhungDung -v`
Expected: FAIL — `không thấy sự kiện stream_delta` (handler chưa phát loại này).

- [x] **Step 3: Thêm phần phát văn sống vào `events.go`**

Thêm hàm ghi khung không có `id:`:

```go
// writeSSEKhongID ghi một sự kiện KHÔNG mang `id:`.
//
// Dùng cho văn sống. `id:` là mốc mà trình duyệt gửi lại qua `Last-Event-ID` khi nối lại, và
// `resumeSeq` đọc nó làm mốc hàng đợi ui_event — hai chuỗi seq khác nhau dùng chung một ô thì
// mốc của bên này thành mốc sai của bên kia.
func writeSSEKhongID(w http.ResponseWriter, ten string, than any) bool {
	data, err := json.Marshal(than)
	if err != nil {
		return true // bỏ qua mục lỗi, không giết cả stream
	}
	_, err = fmt.Fprintf(w, "event: %s\ndata: %s\n\n", ten, data)
	return err == nil
}

// bomVan đẩy mọi mẩu văn mới sau mocVan và trả mốc cuối đã đẩy.
func bomVan(w http.ResponseWriter, flusher http.Flusher, van *dongVan, mocVan int64) int64 {
	manh, _ := van.sau(mocVan)
	if len(manh) == 0 {
		return mocVan
	}
	cuoi := mocVan
	for _, m := range manh {
		ok := true
		if m.Xoa {
			ok = writeSSEKhongID(w, "stream_clear", struct{}{})
		} else {
			ok = writeSSEKhongID(w, "stream_delta", map[string]string{"text": m.Chu})
		}
		if !ok {
			return cuoi
		}
		cuoi = m.Seq
	}
	flusher.Flush()
	return cuoi
}
```

Trong `handleEvents`, sau `lastSeq = pump(...)`, lấy bộ đệm của phiên nếu có:

```go
	// Bộ đệm văn sống của phiên engine, nếu cuốn này đang mở engine.
	//
	// `s.may == nil` là chế độ chỉ đọc (không có bộ giám sát) và `dangMo` lỗi là engine chưa
	// mở. Cả hai KHÔNG phải lỗi của yêu cầu này: dòng sự kiện vẫn chạy, chỉ là không có văn
	// sống nào để phát.
	var van *dongVan
	if s.may != nil {
		if p, err := s.may.dangMo(r.PathValue("book")); err == nil {
			van = p.van
		}
	}
	var mocVan int64
	if van != nil {
		// Người mới nối phải thấy CẢ đoạn đang chảy, không phải nửa cuối một câu. Gửi lệnh
		// xóa trước để giao diện không dán đoạn này vào phần cũ của nó.
		vong, moc := van.vongHienTai()
		mocVan = moc
		if vong != "" {
			writeSSEKhongID(w, "stream_clear", struct{}{})
			writeSSEKhongID(w, "stream_delta", map[string]string{"text": vong})
			flusher.Flush()
		}
	}
```

Rồi đổi vòng lặp chính thành:

```go
	ctx := r.Context()
	for {
		// Đăng ký TRƯỚC khi đọc: mẩu đến giữa hai bước sẽ không đánh thức ai nếu làm ngược,
		// và kết nối treo tới nhịp sau — chữ đứng im dù engine đang phát.
		var choVan <-chan struct{}
		if van != nil {
			choVan = van.doi()
			if moi := bomVan(w, flusher, van, mocVan); moi != mocVan {
				mocVan = moi
				continue // còn mẩu thì vòng lại ngay, đừng chờ
			}
		}

		select {
		case <-ctx.Done():
			return
		case <-choVan:
			// vòng lại để bơm; `choVan` nil thì nhánh này không bao giờ chọn được
		case <-beat.C:
			fmt.Fprint(w, ": nhịp\n\n")
			flusher.Flush()
		case <-ticker.C:
			lastSeq = pump(w, flusher, st, lastSeq)
		}
	}
```

- [x] **Step 4: Chạy lại, xác nhận xanh**

Run: `go test ./internal/serve/ -run TestSSEVanSongKhungDung -v`
Expected: `PASS`

- [x] **Step 5: Commit**

```bash
git add internal/serve/events.go internal/serve/events_van_test.go
git commit -m "feat(serve): phát văn sống qua SSE, không mang id và chữ ở data.text"
```

---

## Task 8: Lúc nối gửi `stream_clear` rồi cả lượt hiện tại

**Files:**
- Modify: `internal/serve/events_van_test.go`

- [x] **Step 1: Viết bài kiểm đỏ**

```go
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
	ctx, huy := contextVoiHan(t, 400*time.Millisecond)
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
```

- [x] **Step 2: Chạy để xác nhận**

Run: `go test ./internal/serve/ -run TestSSEVanSongVaoGiuaLuot -v`

- [x] **Step 3: Sửa `handleEvents` nếu đỏ**

Nếu có nhiều hơn một `stream_delta`, nghĩa là `mocVan` không được đặt từ `vongHienTai()` — sửa
để nó nhận đúng mốc trả về trong cùng lời gọi.

- [x] **Step 4: Xác nhận xanh**

Expected: `PASS`

- [x] **Step 5: Commit**

```bash
git add internal/serve/events_van_test.go internal/serve/events.go
git commit -m "test(serve): chốt thứ tự clear-trước-delta cho người vào giữa lượt"
```

---

## Task 9: Chế độ chỉ đọc và engine chưa mở vẫn chạy

**Files:**
- Modify: `internal/serve/events_van_test.go`

- [x] **Step 1: Viết bài kiểm đỏ**

```go
// TestSSEVanSongKhongCoMayVanChay canh việc "không có văn sống" KHÔNG phải lỗi.
//
// Hai ca hợp lệ: `s.may == nil` (studio chạy chế độ chỉ đọc, ngoài loopback) và engine chưa
// mở cho cuốn này. Cả hai đều phải cho `/events` chạy bình thường — dòng sự kiện đọc từ store
// nên nó không cần engine. Trả lỗi ở đây sẽ làm giao diện mất luôn dòng sự kiện của một cuốn
// đang xem, chỉ vì nó không chạy.
func TestSSEVanSongKhongCoMayVanChay(t *testing.T) {
	for _, ca := range []struct {
		ten string
		may *boMay
	}{
		{"không có bộ giám sát", nil},
		{"engine chưa mở", nil}, // gán ở dưới, cần goc
	} {
		t.Run(ca.ten, func(t *testing.T) {
			goc := t.TempDir()
			newBook(t, goc, "sach", nil)
			may := ca.may
			if ca.ten == "engine chưa mở" {
				may = newBoMay(goc)
			}
			srv := &server{root: goc, choGhi: true, may: may}
			rec := httptest.NewRecorder()
			ctx, huy := contextVoiHan(t, 250*time.Millisecond)
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
```

- [x] **Step 2: Chạy để xác nhận**

Run: `go test ./internal/serve/ -run TestSSEVanSongKhongCoMayVanChay -v`
Expected: PASS nếu Task 7 đã guard đúng; FAIL với nil-pointer nếu chưa.

- [x] **Step 3: Sửa guard nếu đỏ**

- [x] **Step 4: Xác nhận xanh**

Expected: `PASS`

- [x] **Step 5: Commit**

```bash
git add internal/serve/events_van_test.go internal/serve/events.go
git commit -m "test(serve): chốt chế độ chỉ đọc và engine chưa mở vẫn có dòng sự kiện"
```

---

## Task 10: `ui_event` giữ nguyên nhịp dò

**Files:**
- Modify: `internal/serve/events_van_test.go`

- [x] **Step 1: Viết bài kiểm đỏ**

```go
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
```

- [x] **Step 2: Chạy**

Run: `go test ./internal/serve/ -run TestNhipDoUiEventKhongDoi -v`
Expected: `PASS` (chốt hiện trạng)

- [x] **Step 3: (không cần sửa)**

- [x] **Step 4: Chạy toàn bộ gói**

Run: `go test -count=1 ./internal/serve/ -v 2>&1 | tail -30`
Expected: mọi bài PASS

- [x] **Step 5: Commit**

```bash
git add internal/serve/events_van_test.go
git commit -m "test(serve): chốt hai nhịp khác nhau cho ui_event và văn sống"
```

---

## Task 11: Ánh xạ `agents` + `idle_agents`

**Files:**
- Modify: `internal/serve/model.go`
- Modify: `internal/serve/snapshot.go`
- Test: `internal/serve/snapshot_song_test.go` (tạo mới)

- [x] **Step 1: Viết bài kiểm đỏ**

```go
package serve

import (
	"testing"

	"github.com/voocel/ainovel-cli/internal/host"
)

// TestAnhXaVaiKhopTUI canh lớp lỗi tệ nhất của việc ánh xạ: web và TUI nói KHÁC NHAU về
// "ai đang chạy".
//
// Cả hai bề mặt đều trông đáng tin, nên khi chúng lệch thì không ai biết bên nào sai. Luật
// hiện hành nằm ở internal/entry/tui/panels_sidebar.go (`sidebarIdleAgents`): vai nào không
// ở trạng thái làm việc thì vào danh sách chờ.
//
// Bài kiểm chốt CẢ HAI kết quả trên cùng một đầu vào, để lần sau ai đổi một bên là đỏ.
func TestAnhXaVaiKhopTUI(t *testing.T) {
	vao := []host.AgentSnapshot{
		{Name: "writer", State: "working", Tool: "draft_chapter", Turn: 7, Summary: "viết chương 2"},
		{Name: "editor", State: "idle"},
		{Name: "arbiter", State: ""},
	}

	dang, cho := anhXaVai(vao)

	if len(dang) != 1 {
		t.Fatalf("vai đang chạy: %d, muốn 1 — %+v", len(dang), dang)
	}
	if dang[0].Role != "writer" || dang[0].Tool != "draft_chapter" || dang[0].Turn != 7 {
		t.Errorf("vai đang chạy = %+v, muốn writer/draft_chapter/turn 7", dang[0])
	}
	if dang[0].Task != "viết chương 2" {
		t.Errorf("Task = %q, muốn lấy từ Summary", dang[0].Task)
	}
	muonCho := []string{"editor", "arbiter"}
	if len(cho) != len(muonCho) {
		t.Fatalf("vai chờ = %v, muốn %v", cho, muonCho)
	}
	for i, v := range muonCho {
		if cho[i] != v {
			t.Errorf("vai chờ[%d] = %q, muốn %q", i, cho[i], v)
		}
	}
}
```

- [x] **Step 2: Chạy để xác nhận đỏ**

Run: `go test ./internal/serve/ -run TestAnhXaVaiKhopTUI -v`
Expected: FAIL — `anhXaVai undefined`, `Vai` chưa có.

- [x] **Step 3: Thêm kiểu và hàm ánh xạ**

Trong `model.go`:

```go
// Vai là một tác tử đang làm việc, chiếu từ host.AgentSnapshot.
//
// Chỉ lấy phần giao diện DÙNG. `UpdatedAt` và `TaskID` không lên đây: cái đầu không hiện ở
// đâu, cái sau là khóa nội bộ của engine — đưa ra JSON là mời người sau dựng logic quanh nó.
type Vai struct {
	Role  string `json:"role"`
	State string `json:"state"`
	Tool  string `json:"tool,omitempty"`
	Turn  int    `json:"turn,omitempty"`
	Task  string `json:"task,omitempty"`
	Depth int    `json:"depth"`
}
```

Trong `snapshot.go`:

```go
// anhXaVai chiếu danh sách tác tử của engine thành hai danh sách của giao diện.
//
// Luật phân loại lấy ĐÚNG từ TUI (internal/entry/tui/panels_sidebar.go): `State == "working"`
// là đang chạy, còn lại là chờ. Không suy lại theo cách khác — hai bề mặt nói khác nhau về
// "ai đang chạy" là lớp lỗi không tự lộ ra, vì cả hai đều trông đáng tin.
func anhXaVai(vao []host.AgentSnapshot) (dang []Vai, cho []string) {
	for _, a := range vao {
		if a.State == "working" {
			dang = append(dang, Vai{
				Role:  a.Name,
				State: a.State,
				Tool:  a.Tool,
				Turn:  a.Turn,
				Task:  a.Summary,
				Depth: 0,
			})
			continue
		}
		cho = append(cho, a.Name)
	}
	return dang, cho
}
```

- [x] **Step 4: Chạy lại, xác nhận xanh**

Run: `go test ./internal/serve/ -run TestAnhXaVaiKhopTUI -v`
Expected: `PASS`

- [x] **Step 5: Commit**

```bash
git add internal/serve/model.go internal/serve/snapshot.go internal/serve/snapshot_song_test.go
git commit -m "feat(serve): ánh xạ cây vai và vai chờ theo đúng luật của TUI"
```

---

## Task 12: `null` KHÁC `0` cho mọi trường sống

**Files:**
- Modify: `internal/serve/snapshot_song_test.go`
- Modify: `internal/serve/model.go`, `internal/serve/snapshot.go`

- [x] **Step 1: Viết bài kiểm đỏ**

```go
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
```

Thêm `"encoding/json"`, `"net/http/httptest"`, `"strings"` vào import.

- [x] **Step 2: Chạy để xác nhận đỏ**

Run: `go test ./internal/serve/ -run TestTruongSongLaNullKhiMayDong -v`
Expected: FAIL — các khóa vắng mặt (`` vs `null`).

- [x] **Step 3: Thêm trường dạng con trỏ vào payload**

Trong `model.go`, thêm vào struct `Snapshot`:

```go
	// Bốn nhóm dưới là trường SỐNG: chúng chỉ đo được khi engine đang mở. Dùng con trỏ /
	// slice để `nil` marshal thành `null`, và `null` nghĩa là "không có nguồn" — khác hẳn `0`
	// nghĩa là "đo được, bằng không". Giao diện có hai nhánh vẽ khác nhau cho hai câu đó.
	Agents     []Vai      `json:"agents"`
	IdleAgents []string   `json:"idle_agents"`
	Advance    *TienDo    `json:"advance"`
	Context    *NguCanh   `json:"context"`
```

```go
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
```

Trong `snapshot.go`, chỉ điền bốn trường này khi có `UISnapshot`; engine đóng thì để nguyên
`nil`. Đừng khởi tạo slice rỗng — `[]Vai{}` marshal thành `[]`, không phải `null`.

- [x] **Step 4: Chạy lại, xác nhận xanh**

Run: `go test ./internal/serve/ -run TestTruongSongLaNullKhiMayDong -v`
Expected: `PASS`

- [x] **Step 5: Commit**

```bash
git add internal/serve/model.go internal/serve/snapshot.go internal/serve/snapshot_song_test.go
git commit -m "feat(serve): trường sống trả null khi engine đóng, không trả 0"
```

---

## Task 13: Ánh xạ phần còn lại của `UISnapshot`

**Files:**
- Modify: `internal/serve/model.go`, `internal/serve/snapshot.go`
- Modify: `internal/serve/snapshot_song_test.go`

- [x] **Step 1: Viết bài kiểm đỏ**

```go
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
		Agents:            []host.AgentSnapshot{{Name: "writer", State: "working"}},
		PendingSteer:      "cho Lục Miên xuất hiện sớm hơn",
		PendingRewrites:   []int{8},
		RewriteReason:     "lệch mốc giờ sổ miếu",
		AdvanceMode:       "review",
		HasAdvanceHold:    true,
		AdvanceHoldReason: "chờ cấp phép cung 2",
		AdvancePermitChapter: 8,
		RecoveryLabel:     "lần trước dừng ở cửa nghiệm thu",
		InProgressChapter: 2,
		ContextTokens:     52400,
		ContextWindow:     128000,
		ContextPercent:    41,
		ContextScope:      "baseline",
		ContextStrategy:   "light_trim",
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
```

- [x] **Step 2: Chạy để xác nhận đỏ**

Run: `go test ./internal/serve/ -run TestAnhXaTruongSongDiXuyenTuSnapshot -v`
Expected: FAIL — `chieuTruongSong undefined`.

- [x] **Step 3: Thêm `chieuTruongSong` và các trường còn lại**

Trong `model.go`, thêm vào `Snapshot`:

```go
	PendingSteer      string   `json:"pending_steer,omitempty"`
	RewriteReason     string   `json:"rewrite_reason,omitempty"`
	Recovery          string   `json:"recovery,omitempty"`
	InProgressChapter *int     `json:"in_progress_chapter"`
```

Trong `snapshot.go`:

```go
// truongSong là phần payload chỉ có nghĩa khi engine đang mở.
//
// Gom thành một hàm chiếu để có đúng MỘT chỗ quyết định "trường nào đến từ đâu". Rải phép
// gán ra nhiều chỗ là cách mà một trường bị suy lại ở chỗ thứ hai mà không ai thấy.
type truongSong struct {
	Agents            []Vai
	IdleAgents        []string
	PendingSteer      string
	RewriteReason     string
	Recovery          string
	InProgressChapter *int
	Advance           *TienDo
	Context           *NguCanh
}

func chieuTruongSong(snap host.UISnapshot) truongSong {
	dang, cho := anhXaVai(snap.Agents)
	ra := truongSong{
		Agents:        dang,
		IdleAgents:    cho,
		PendingSteer:  snap.PendingSteer,
		RewriteReason: snap.RewriteReason,
		Recovery:      snap.RecoveryLabel,
		Advance: &TienDo{
			Mode:          snap.AdvanceMode,
			PermitChapter: snap.AdvancePermitChapter,
			Hold:          snap.HasAdvanceHold,
			HoldReason:    snap.AdvanceHoldReason,
		},
	}
	if snap.InProgressChapter > 0 {
		n := snap.InProgressChapter
		ra.InProgressChapter = &n
	}
	// Ngữ cảnh chỉ có nghĩa khi biết cửa sổ. `Window == 0` là chưa đo được, không phải cửa
	// sổ bằng không — nên để `nil` thay vì trả một tỉ lệ chia cho 0.
	if snap.ContextWindow > 0 {
		ra.Context = &NguCanh{
			Tokens:   snap.ContextTokens,
			Window:   snap.ContextWindow,
			Percent:  snap.ContextPercent,
			Scope:    snap.ContextScope,
			Strategy: snap.ContextStrategy,
		}
	}
	return ra
}
```

Rồi gọi nó ở chỗ dựng `Snapshot` khi có engine, và gán từng trường sang payload.

- [x] **Step 4: Chạy lại + chạy cả gói**

Run: `go test -count=1 ./internal/serve/ -v 2>&1 | tail -20`
Expected: mọi bài PASS

- [x] **Step 5: Commit**

```bash
git add internal/serve/model.go internal/serve/snapshot.go internal/serve/snapshot_song_test.go
git commit -m "feat(serve): chiếu phần còn lại của UISnapshot ra payload studio"
```

---

## Task 14: Làm giàu `/api/workshop`

**Files:**
- Modify: `internal/serve/model.go`, `internal/serve/serve.go`
- Modify: `internal/serve/snapshot_song_test.go`

- [x] **Step 1: Viết bài kiểm đỏ**

```go
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
```

- [x] **Step 2: Chạy để xác nhận đỏ**

Run: `go test ./internal/serve/ -run TestWorkshopCoDuSoLieuChoManXuong -v`
Expected: FAIL — thiếu năm khóa.

- [x] **Step 3: Thêm năm trường vào `Book` và điền trong `handleWorkshop`**

```go
	// Năm trường cho bề mặt Xưởng. Lấy từ cùng nguồn mà `/studio` dùng (transport của store)
	// để hai bề mặt không nói hai số khác nhau về cùng một cuốn.
	CostUSD         float64 `json:"cost_usd"`
	CostPerChapter  float64 `json:"cost_per_chapter"`
	ChaptersPerHour float64 `json:"chapters_per_hour"`
	UpdatedAt       string  `json:"updated_at"`
	EngineOpen      bool    `json:"engine_open"`
```

`EngineOpen` suy từ `s.may.dangMo(id)` khi `s.may != nil`; `s.may == nil` thì luôn `false`.

- [x] **Step 4: Chạy lại + cả gói**

Run: `go test -count=1 ./internal/serve/ 2>&1 | tail -5`
Expected: `ok`

- [x] **Step 5: Commit**

```bash
git add internal/serve/model.go internal/serve/serve.go internal/serve/snapshot_song_test.go
git commit -m "feat(serve): workshop mang chi phí, nhịp và trạng thái engine từng cuốn"
```

---

## Task 15: Bộ canh kiểu TypeScript + cập nhật `types.ts`

**Files:**
- Test: `internal/serve/web_kieu_test.go` (tạo mới)
- Modify: `web/lib/types.ts`

- [x] **Step 1: Viết bài kiểm đỏ**

```go
package serve

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// TestKieuTruongSongPhaiChoNull canh lớp lỗi "kiểu nói dối về payload".
//
// ĐO ĐƯỢC ở dự án này một lần: `Timeline.volumes` được khai `LaneBlock[]` trong khi server
// trả `null` cho truyện không phân tầng. `tsc` XANH vì nó tin lời khai, nên `blocks.find(...)`
// được viết mà không ai chặn — và renderer SẬP ở bề mặt mặc định, đúng chỗ người dùng đáp
// xuống. Một kiểu sai không gây cảnh báo; nó gây một cú sập ở nơi khác.
//
// Bài kiểm ở phía Go vì `web/` cố ý không có bộ chạy test (devDependencies chỉ có TypeScript).
// Tiền lệ: TestNhanDlPhaiQuaTuDien trong gói này cũng quét tệp nguồn của web.
func TestKieuTruongSongPhaiChoNull(t *testing.T) {
	duong := filepath.Join("..", "..", "web", "lib", "types.ts")
	b, err := os.ReadFile(duong)
	if err != nil {
		t.Fatalf("không đọc được %s: %v — bài kiểm này không thể kiểm gì", duong, err)
	}
	nguon := string(b)

	// Mỗi trường sống phải khai `| null` vì server trả `null` khi engine đóng (xem
	// TestTruongSongLaNullKhiMayDong).
	for _, truong := range []string{"agents", "idle_agents", "advance", "context",
		"in_progress_chapter"} {
		re := regexp.MustCompile(`(?m)^\s*` + truong + `\??:\s*([^;]+);`)
		khop := re.FindStringSubmatch(nguon)
		if khop == nil {
			t.Errorf("không thấy trường %q trong types.ts — payload có nó mà kiểu thì không",
				truong)
			continue
		}
		if !strings.Contains(khop[1], "null") {
			t.Errorf("trường %q khai `%s` — thiếu `| null`.\n"+
				"Server trả `null` cho trường này khi engine đóng, nên kiểu này đang NÓI DỐI, "+
				"và tsc sẽ xanh trong khi giao diện sập ở ca engine đóng.",
				truong, strings.TrimSpace(khop[1]))
		}
	}
}
```

- [x] **Step 2: Chạy để xác nhận đỏ**

Run: `go test ./internal/serve/ -run TestKieuTruongSongPhaiChoNull -v`
Expected: FAIL — cả năm trường chưa có trong `types.ts`.

- [x] **Step 3: Thêm kiểu vào `web/lib/types.ts`**

```ts
/**
 * Một tác tử đang làm việc.
 *
 * `turn` là số lượt của tác tử trong chu kỳ hiện tại — TUI hiện nó dạng `writer turn 7`, và
 * nó là dấu hiệu duy nhất phân biệt "đang chạy lâu" với "treo".
 */
export interface Vai {
  role: string;
  state: string;
  tool?: string;
  turn?: number;
  task?: string;
  depth: number;
}

export interface TienDo {
  mode: string;
  permit_chapter?: number;
  hold: boolean;
  hold_reason?: string;
}

export interface NguCanh {
  tokens: number;
  window: number;
  percent: number;
  scope?: string;
  strategy?: string;
}
```

Và thêm vào `interface Snapshot`:

```ts
  /**
   * Năm trường SỐNG: `null` nghĩa là engine đang đóng nên KHÔNG ĐO ĐƯỢC — khác hẳn 0 hay [].
   *
   * `| null` ở đây là hàng rào biên dịch, không phải chú thích: một trường khai không-null cho
   * một payload trả `null` làm `tsc` xanh trong khi renderer sập. Đã xảy ra một lần với
   * `Timeline.volumes`. Có bộ canh giữ luật này: TestKieuTruongSongPhaiChoNull.
   */
  agents: Vai[] | null;
  idle_agents: string[] | null;
  advance: TienDo | null;
  context: NguCanh | null;
  in_progress_chapter: number | null;
  pending_steer?: string;
  rewrite_reason?: string;
  recovery?: string;
```

Và thêm năm trường vào `interface Book`:

```ts
  cost_usd: number;
  cost_per_chapter: number;
  chapters_per_hour: number;
  updated_at: string;
  engine_open: boolean;
```

- [x] **Step 4: Chạy bộ canh + `tsc`**

Run: `go test ./internal/serve/ -run TestKieuTruongSongPhaiChoNull -v`
Expected: `PASS`

Run: `cd web && npx tsc --noEmit`
Expected: 0 lỗi. Nếu `node_modules` thiếu trong worktree:
`ln -s ~/Personal/ainovel-cli/web/node_modules web/node_modules`

- [x] **Step 5: Commit**

```bash
git add internal/serve/web_kieu_test.go web/lib/types.ts
git commit -m "feat(web): kiểu cho trường sống, kèm bộ canh đòi | null"
```

---

## Task 16: Cổng cuối và E2E trên cuốn thật

**Files:** không sửa gì — đây là bước xác minh.

- [x] **Step 1: Chạy toàn bộ cổng**

```bash
go build ./...
go vet ./...
gofmt -l .              # phải rỗng
go test -count=1 ./...  # phải 30 gói ok / 0 FAIL
cd web && npx tsc --noEmit && cd ..
```

- [x] **Step 2: Dựng binary và chạy trên gốc sách thật**

```bash
go build -o /tmp/ainovel-moi ./cmd/ainovel-cli
```

Đừng khởi động server thứ hai trên cùng gốc: server đang chạy ở `127.0.0.1:8420` giữ khóa tệp,
và bài kiểm khóa sẽ từ chối đúng như thiết kế. Báo cáo lại rằng bước này cần người vận hành
dừng server cũ — **đừng tự dừng nó**.

- [x] **Step 3: E2E — hai kết nối cùng lúc**

Sau khi người vận hành khởi động lại server bằng binary mới, trên một cuốn ĐANG CHẠY:

```bash
curl -sN "http://127.0.0.1:8420/api/books/<cuốn>/events" | grep --line-buffered stream_delta | head -20 > /tmp/a.txt &
curl -sN "http://127.0.0.1:8420/api/books/<cuốn>/events" | grep --line-buffered stream_delta | head -20 > /tmp/b.txt &
wait; diff /tmp/a.txt /tmp/b.txt && echo "HAI KẾT NỐI KHỚP"
```

Expected: hai tệp giống nhau. Lệch nghĩa là hai kết nối đang giành mẩu — đúng ca mà `dongVan`
tồn tại để chặn.

- [x] **Step 4: E2E — nhịp**

Đo khoảng cách giữa các `stream_delta` liên tiếp. Expected: phần lớn dưới 300ms. Nếu chúng đến
thành cục cách nhau ~700ms thì cơ chế đánh thức không hoạt động và nó đang đi theo vòng dò.

- [x] **Step 5: Báo cáo, không commit**

Bước này không sửa mã nên không có commit. Báo cáo gồm: output bốn cổng, kết quả `diff` hai
kết nối, và phân bố khoảng cách nhịp.

---

## Self-Review

**1. Spec coverage.** Đối chiếu §10.1–10.3 của spec (18 bài kiểm) với các task:

| Spec | Task |
|---|---|
| 10.1 (1) ranh giới lượt | Task 1 |
| 10.1 (2) hai cái trần | Task 2 |
| 10.1 (3) hai người đọc | Task 3 |
| 10.1 (4) vào muộn không lặp | Task 4 |
| 10.1 (5) hut không rò goroutine | Task 5 |
| 10.2 (6) không `id:` | Task 7 |
| 10.2 (7) chữ ở `data.text` | Task 7 |
| 10.2 (8) clear rồi cả lượt | Task 8 |
| 10.2 (9) không có máy vẫn chạy | Task 9 |
| 10.2 (10) ui_event giữ nhịp | Task 10 |
| 10.3 (11) null khác 0 | Task 12 |
| 10.3 (12) idle_agents khớp TUI | Task 11 |
| 10.3 (13) đi xuyên từ Snapshot | Task 13 |
| 10.3 (14) workshop đủ 5 trường | Task 14 |
| 10.4 (15) bộ canh `\| null` | Task 15 |
| §5.2 cơ chế đánh thức | Task 6 |
| §10.5 E2E hai tab + nhịp | Task 16 |

Ba bài của spec §10.4 (16–18: dải đổi theo `dangChay`, tự cuộn, vạch ngăn) là **phía web** —
chúng thuộc kế hoạch 2, không thuộc kế hoạch này. Ghi ra để không ai tưởng bị bỏ.

**2. Placeholder scan.** Không có "TBD"/"TODO"/"tương tự Task N". Mọi step có code là có code
đầy đủ. Task 16 không có code vì nó là bước xác minh — đã nói rõ.

**3. Type consistency.** Tên dùng xuyên các task: `dongVan.doi()`, `dongVan.danhThuc()`,
`dongVan.vongLen()`, `manhVan{Seq,Chu,Xoa}`, `writeSSEKhongID`, `bomVan`, `anhXaVai`,
`chieuTruongSong`, `truongSong`, `Vai`, `TienDo`, `NguCanh`, helper test `contextVoiHan`.
Tên JSON xuyên Go và TS: `agents`, `idle_agents`, `advance`, `context`, `in_progress_chapter`,
`pending_steer`, `rewrite_reason`, `recovery`, `cost_usd`, `cost_per_chapter`,
`chapters_per_hour`, `updated_at`, `engine_open`.

**Một chỗ đã sửa khi tự soát:** Task 12 ban đầu chỉ kiểm `agents` và `context`. Nhưng `advance`
và `idle_agents` cũng là trường sống và cùng lớp lỗi — nếu chỉ hai trường được canh thì hai
trường kia sẽ được ánh xạ thành `{}`/`[]` mà không ai thấy. Đã thêm cả bốn vào bài kiểm.
