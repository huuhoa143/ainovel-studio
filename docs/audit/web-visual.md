# Kiểm định giao diện web studio — bằng mắt, trên trình duyệt thật

**Commit nền:** `3ee5279` (`feat(i18n): dấu nối liệt kê theo ngôn ngữ + 4 bề mặt rail còn lại + E2E LLM giả`)
**Ngày:** 2026-07-31
**Cách kiểm:** Chrome DevTools MCP trên bản `next build` tĩnh, phục vụ bởi `ainovel-cli serve --web`. Ba bề rộng: 1440, 1024, 390.
**Ảnh:** `docs/audit/screenshots/` — **40 ảnh**: 30 ảnh của đợt kiểm gốc (tiền tố bề rộng) + 10 ảnh trước/sau của các đợt sửa (tiền tố `fix-`). Xem §8.

> ## ⚠ ĐỌC TRƯỚC: phần lớn báo cáo này đã cũ — xem bảng trạng thái ở §0
>
> Soát lại toàn tệp ngày **2026-07-31**. **Cả ba lỗi CHẶN SHIP đã đóng**, nên **kết luận "chưa dùng được" ở §9 KHÔNG còn đúng** — §9 đã được viết lại. Thân các mục §2–§7 giữ nguyên làm **bản ghi lịch sử**: chúng mô tả trạng thái lúc kiểm, không phải trạng thái hôm nay. Mỗi mục đã đổi đều có một khối trạng thái đặt ngay dưới tiêu đề.
>
> Hai điều phải cảnh giác khi đọc:
>
> - **Mọi số dòng trong tệp này đều đã trôi.** `globals.css` đã dài thêm vài trăm dòng chú thích từ lúc kiểm. Tra **theo tên rule/hàm**, đừng tra theo số dòng — `grep -n '^\.canhbao li' -A 12`, không phải `sed -n '622p'`. Chính người phụ trách đã một lần đọc `1.6` trong một **chú thích ghi lại giá trị CŨ** rồi kết luận sai là "chưa sửa".
> - **Vài chỗ được sửa KHÁC cách mục đó đề ra**, và cách thực tế đúng hơn. Đọc khối trạng thái trước khi làm theo phần "Cách sửa".

> ### Bản nào được kiểm — đọc kỹ, chỗ này có bẫy
>
> Tôi bắt đầu kiểm ở `3ee5279` nhưng build từ working tree khi đó **đã có các thay đổi chưa commit** (riêng `web/app/globals.css` lệch `+284/-4` dòng so với commit). Trong lúc tôi kiểm, hai commit của agent khác đã land: `e8bfdcf` (*gộp bản duyệt về một hiện thực*) và `a8cd1d2`.
>
> **Kết quả kiểm lại sau khi xong:** `git status` cho `web/`, `internal/serve/`, `internal/store/` hiện **rỗng**, nghĩa là đúng cái tôi đã build và chụp giờ chính là `a8cd1d2` = HEAD. Số dòng trong báo cáo đã được **định vị lại trên HEAD** và đúng với HEAD.
>
> **Đã xác nhận từng phát hiện vẫn còn ở HEAD** (`a8cd1d2`), không cái nào bị hai commit kia sửa mất:
>
> | Phát hiện | Còn ở HEAD? |
> |---|---|
> | §2.1 `LoadChapterContent` không ngã về bản chốt | ✓ `internal/store/drafts.go` không đổi từ `3ee5279` |
> | §2.2 nhánh rỗng của `Inspector.tsx` bỏ nút | ✓ không có `docthem` trong nhánh đó |
> | §2.3 `.st.gold .ky` đập vô điều kiện | ✓ còn nguyên, `BangChuong.tsx` vẫn `<TrangThai tt={tt} />` |
> | §3.1 rail đếm cửa kiểm định | ✓ `state === 'gate'` còn nguyên |
> | §3.2 `10.5px/1.35` · §3.3 `line-height: 1.45` | ✓ còn nguyên |
> | §4.5 bộ chọn bỏ mất `id` | ✓ `b.name ? b.name` còn nguyên |
>
> ⚠️ **Một chuyện cần nói với người phụ trách commit:** commit `a8cd1d2` (một commit i18n) đã quét luôn `docs/audit/web-visual.md` và `docs/audit/screenshots/` vào cùng nó, trong khi tôi còn đang soạn. Bản bị commit là **bản nháp đầu, số dòng còn sai**. Bản đúng là bản đang nằm ở working tree (` M`). Tôi không chạy lệnh git ghi nào — chỉ `log`/`status`/`diff`/`show`/`ls-files`/`check-ignore`.

---

## 0. Bảng trạng thái — soát lại 2026-07-31

Cách xác minh: đọc code trên đĩa theo tên rule/hàm. **Không dựng lại trình duyệt trong đợt soát này**, nên chỗ nào cần đo bằng mắt mới biết thì ghi thẳng là **chưa đo** — không đoán.

| Mục | Trạng thái | Xác minh ở đâu |
|---|---|---|
| §2.1 chương đã chốt hiện "chưa có bản thảo" | ✔ **ĐÓNG** — sửa khác cách mục đề ra | hàm `noiDungChuong` trong `internal/serve/serve.go` (tra theo tên: tệp này đang được sửa, số dòng trôi trong lúc soát) |
| §2.2 nút "Đọc toàn văn" biến mất | ✔ **ĐÓNG** — làm nhiều hơn mục đề ra | `web/components/Inspector.tsx:298-308` |
| §2.3 nhịp đập không theo liveness | ✔ **ĐÓNG** | `globals.css:933` `.st.gold.dap .ky` · `:2862` reduced-motion · `BangChuong.tsx:100` |
| §3.1 rail "Kiểm định 0" | ✔ **ĐÓNG** | `Rail.tsx:97` `const kiemDinh = rows.length` |
| §3.2 nhãn phụ `10.5px/1.35` | ✔ **ĐÓNG** | `.bangto thead th em` → `10.5px/1.72` |
| §3.3 tiêu đề chương `1.45` | ✔ **ĐÓNG** | `.dsChuong .ten` → `1.72` |
| §3.4 transport tràn ở 390px | ✔ **ĐÓNG** — sửa khác cách mục đề ra | `.trans { flex-wrap: wrap }` mọi bề rộng |
| §4.1 vạch đỏ 85% bị `overflow: hidden` cắt | ✗ **CÒN** | `globals.css:1680` `.ctxbar` vẫn `overflow: hidden` |
| §4.2 câu "Ranh giới" tô amber | ◐ **CODE ĐÃ ĐỔI, số mới chưa đo** | `globals.css:2412` `.dsLuat .ranh .dx { color: var(--ink-3) }` |
| §4.3 dấu `·` mồ côi ở 390px | ✗ **CÒN ở code** — còn mồ côi hay không thì *chưa đo lại* | `Truc.tsx:357` vẫn `· {CHU.ngoaiCuaSo(an)}` |
| §4.4 cuộn hết khu Đọc thì cột văn trống | ✗ **CÒN** | `.benle` (`globals.css:2018`) không có `position: sticky` |
| §4.5 bộ chọn tác phẩm bỏ mất `id` | ✗ **CÒN** | `ThanhTren.tsx:111` vẫn `b.name ? b.name : <em>{b.id}</em>` |
| §4.6 ô can thiệp thiếu `id`/`name` | ✗ **CÒN** | `OCanThiep.tsx` chỉ có `aria-label` + `aria-describedby` |
| §4.7 `--ink-3` trên `--raised` sát sàn 4,53:1 | ○ **ĐỀ NGHỊ CHƯA LÀM** | `DESIGN.md` chưa có câu cấm dùng `--ink-3` trên bề mặt sáng hơn `--raised` |
| §4.8 ba chỗ dưới sàn 1.72 | ✔ **ĐÓNG cả ba** | xem khối trạng thái trong §4.8 |
| §4.9 sáu cảnh báo preload font | — vô hại, vẫn đúng | không phải khuyết điểm |
| §4.10 xưởng trống canh giữa | ✗ **CÒN** | `globals.css:1702` `.trangtrong` vẫn `align-content: center; margin: 0 auto` |
| §5 Dàn ý phẳng — câu quá tuyệt đối | ◐ **SỬA MỘT PHẦN** | `DanY.tsx:62-64`: có `flat` thì hiện số + quan hệ; `flat` rỗng thì vẫn câu cũ |
| §5 Hàng chờ mở rộng — câu phủ định trơ | ✗ **CÒN** | `nhan.ts:692` `chuaCoDuyet` vẫn là câu phủ định trơ |
| §5 Văn phong · Chi phí · Cài đặt "chưa dựng" | ✗ **ĐÃ SAI RỒI** — ba khu vừa land | `khu.ts` giờ có **12 khu**, gồm `van-phong` · `chi-phi` · `cai-dat` |
| §6 những chỗ làm đúng | ⚠ số dòng đã trôi; **các claim không đo lại đợt này** | xem khối trạng thái trong §6 |
| §7 serif ngoài phạm vi | ✔ **ĐÓNG — làm CẢ HAI hướng** | `DESIGN.md:64-66` + `.nguoi .tavan` → `var(--ui)` |

Ba việc còn lại đáng làm trước, theo thứ tự tôi sẽ chọn nếu phải chọn: **§4.5** (hai tác phẩm cùng tên không phân biệt được — sai về dữ liệu, không phải về hình), **§4.1** (một yêu cầu của `DESIGN.md:118` đang không có hiệu lực), **§4.4** (đọc ra như "văn bị mất"). §4.6 là một dòng. §4.10 và §4.3 là thẩm mỹ.

---

## 1. Chuỗi lệnh chạy được

Ghi lại chính xác vì lần trước chưa ai mở nó lần nào.

```bash
cd ~/Personal/ainovel-cli

# 1. Build web tĩnh (node_modules đã có; nếu chưa thì npm install trước)
cd web && npm run build && cd ..
#    → out/ ; ~10s ; exit 0
#    Cảnh báo "rewrites will not work with output: export" là BÌNH THƯỜNG
#    (rewrites chỉ dùng cho `next dev`, bản tĩnh gọi API cùng origin).

# 2. Gieo tác phẩm mẫu — LƯU Ý: seed-demo BẮT BUỘC có tham số đường dẫn
go run ./cmd/seed-demo output/tran-yeu-ky
#    `go run ./cmd/seed-demo` không tham số sẽ panic ở os.Args[1].

# 3. Chạy API + giao diện
go run ./cmd/ainovel-cli serve --web web/out --addr 127.0.0.1:8420
#    → http://127.0.0.1:8420   (root mặc định = ./output)
```

Xưởng trống kiểm bằng một tiến trình thứ hai:

```bash
mkdir -p /tmp/ainovel-empty
go run ./cmd/ainovel-cli serve --web web/out --addr 127.0.0.1:8421 --root /tmp/ainovel-empty
```

### ⚠ Bẫy đo bề rộng hẹp: `resize_page` KHÔNG xuống được 390px

Đọc trước khi kiểm bất kỳ bề rộng nào dưới ~500px. Bẫy này làm **cả một lượt kiểm thành vô nghĩa mà không có dấu hiệu gì**.

Cửa sổ Chrome trên macOS không thu nhỏ dưới **~500px**. Gọi `resize_page` với `width: 390` thì lệnh **báo thành công**, nhưng `window.innerWidth` thật vẫn là `500`. Ở 500px thanh transport vừa đủ chỗ hơn, nên phép đo trả về "hết tràn" — một kết luận **SAI mà trông như đã kiểm**. Đo được tận tay: cùng một trang, `resize_page 390` cho `innerWidth 500` và transport `scrollWidth 500 === clientWidth`, trong khi device emulation cho `innerWidth 390` và transport thật sự tràn `555px`.

Phải dùng **device emulation**, nó đặt viewport độc lập với cửa sổ:

```
emulate  viewport: "390x844x2,mobile,touch"
```

Và luôn **khẳng định lại bề rộng thật trong chính phép đo** thay vì tin tham số đã truyền:

```js
// mọi script đo bố cục nên trả về con số này để đối chiếu
return { beRong: window.innerWidth, /* … */ };
```

Hai điều kèm theo, cùng loại bẫy:

- `emulate` với cờ `mobile` **nạp lại trang**, nên mọi biến gắn vào `window` ở lượt `evaluate_script` trước sẽ mất. Đừng cài hàm trợ giúp dùng lại giữa các bề rộng — nhúng thẳng script đo vào từng lần gọi.
- Dưới emulation di động, `100dvh` phân giải theo chiều cao đã yêu cầu còn `window.innerHeight` báo chiều cao *visual viewport* — hai số lệch nhau (đo được: `dvh` 780 vs `innerHeight` 890). Nên kiểm "transport có sát đáy khung" bằng cách so với `.khung`, **không** so với `window.innerHeight`, nếu không nó báo sai là thanh bị đẩy khỏi màn hình.

### Dữ liệu mẫu phải thêm tay để thấy được 5 bề mặt

> **⚠ Mục này đã LỖI THỜI (cập nhật 2026-07-31).** `cmd/seed-demo` đã được mở rộng đúng như đề nghị ở cuối mục: chạy `go run ./cmd/seed-demo <đường-dẫn>` giờ in ra `nhân vật: 5 (đủ 4 hạng) · luật thế giới: 5 · phục bút: 3` và gieo cả bản duyệt, hàng chờ viết lại, bản nháp. **Không cần ghi fixture tay nữa.** Bảng dưới giữ lại để biết tệp nào mở ra bề mặt nào, không phải để làm theo.

`seed-demo` **không** ghi nhân vật, luật thế giới, phục bút, quan hệ, bản duyệt, hàng chờ viết lại. Năm bề mặt rail vì thế luôn rỗng nếu chỉ chạy seed-demo. Tôi ghi thêm fixture trực tiếp vào store (`output/` đã nằm trong `.gitignore`, không có gì bị commit):

| Tệp | Bề mặt nó mở ra |
|---|---|
| `output/tran-yeu-ky/characters.json` | Nhân vật |
| `output/tran-yeu-ky/world_rules.json` | Luật thế giới |
| `output/tran-yeu-ky/relationship_state.json` | Luật thế giới → Lưới quan hệ |
| `output/tran-yeu-ky/foreshadow_ledger.json` | Phục bút |
| `output/tran-yeu-ky/reviews/01.json` | Kiểm định (7 chiều) + Bản duyệt của Editor |
| `output/tran-yeu-ky/drafts/01.draft.md` | Đọc bản thảo (xem §2.1) |
| `pending_rewrites: [2]` thêm vào `meta/progress.json` | Hàng chờ viết lại |

**Đề nghị:** bổ sung các mục này vào `cmd/seed-demo/main.go`. Nếu không, mỗi người kiểm giao diện lần sau lại kết luận sai rằng năm bề mặt đó "chưa dựng".

---

## 2. CHẶN SHIP

> ### ✔ CẢ BA ĐÃ ĐÓNG (soát 2026-07-31) — mục này giờ là bản ghi lịch sử
>
> Không còn lỗi chặn ship nào. Đọc khối trạng thái dưới từng mục để biết cách sửa thật, vì **hai trong ba mục được sửa khác cách mục đó đề ra**.

### 2.1 Chương đã nghiệm thu hiện "chưa có bản thảo" — bảng nói 2.901 từ, ô bên phải nói không có gì

Đây là lỗi làm người vận hành hiểu sai nghiêm trọng nhất, và nó tự mâu thuẫn ngay trên một màn hình.

**Ảnh:** `1440-04-insp-banthao-trong.png`, `1440-06-khu-ban-thao.png`

Bảng chương: `1 · Người gác cầu đá · ● đã nghiệm thu · Writer · 2.901 · 1,2s`.
Tab **Bản thảo** của đúng chương đó: *"Chưa có bản thảo cho chương này."*

Nguyên nhân gốc nằm ở tầng Go, không phải web — `internal/store/drafts.go:71-80`:

```go
func (s *DraftStore) LoadChapterContent(chapter int) (string, int, error) {
	draft, err := s.LoadDraft(chapter)      // CHỈ đọc drafts/{NN}.draft.md
	...
	return "", 0, nil                       // chương đã chốt → rỗng
}
```

Nó chỉ đọc **bản nháp** `drafts/{NN}.draft.md`, không bao giờ ngã về **bản chốt** `chapters/{NN}.md`.

**Đo được:** `output/tran-yeu-ky/chapters/01.md` có 190 byte văn tiếng Việt trên đĩa, nhưng
`GET /api/books/tran-yeu-ky/chapters/1` trả `{"chapter":1,...,"words":0,"text":""}`.
Sau khi tôi tạo thêm `drafts/01.draft.md`, cùng endpoint trả `"words":172` và toàn văn. Đó là bằng chứng trực tiếp: API đọc sai tệp.

Cả repo còn lại đều dùng `LoadChapterText` để đọc bản chốt — `internal/tools/read_chapter.go:151`, `internal/host/exp/exporter.go:86`, `internal/eval/collect.go:120`, `internal/store/store.go:84`. Chỉ hai chỗ trong `serve` dùng `LoadChapterContent`, và cả hai đều là bề mặt đọc:

- `internal/serve/serve.go:226` → toàn văn của khu **Đọc bản thảo**
- `internal/serve/snapshot.go:438` → trích đoạn + số từ của tab **Bản thảo**

**Cách sửa:** trong `internal/store/drafts.go:71-80`, cho `LoadChapterContent` ngã về bản chốt khi không có nháp:

```go
draft, err := s.LoadDraft(chapter)
if err != nil { return "", 0, err }
if draft != "" { return draft, domain.WordCount(draft), nil }
final, err := s.LoadChapterText(chapter)   // chapters/{NN}.md
if err != nil { return "", 0, err }
if final != "" { return final, domain.WordCount(final), nil }
return "", 0, nil
```

Lưu ý thứ tự: nháp trước bản chốt, vì chương đang gia công thì nháp mới hơn. Nếu không muốn đổi hàm dùng chung (`check_consistency.go:61`, `commit_chapter.go:245` cũng gọi nó và **cố ý** chỉ muốn nháp), thì thêm hàm riêng cho `serve` và đổi hai chỗ gọi ở trên.

> **✔ ĐÓNG (2026-07-31) — nhưng KHÔNG theo "Cách sửa" ở trên. Đừng làm theo đoạn code Go phía trên.**
>
> Mục này đề nghị sửa thẳng `internal/store/drafts.go`. **Cách đó đã bị từ chối có lý do, và lý do đó đúng hơn mục này:** cho `LoadChapterContent` ngã về bản chốt sẽ phá năm điểm gọi trong `internal/tools/` vốn dựa vào nghĩa "có bản nháp hay chưa" để quyết định luồng — rõ nhất là `novel_context_builders.go:261` dùng `draftWords > 0`. Mục này có nêu phương án thay thế ở câu cuối, và **phương án thay thế mới là cái được chọn**.
>
> Hiện thực thật: `internal/serve/serve.go` có hàm riêng **`noiDungChuong(st, n)`** ở tầng đọc-để-hiện — ưu tiên nháp, thiếu thì lấy `chapters/{NN}.md`. Hai điểm gọi trong `serve` đều đã đổi sang nó (`serve.go` cho toàn văn, `snapshot.go` trong `buildSelection` cho số từ + trích đoạn). `LoadChapterContent` **giữ nguyên hợp đồng cũ**.
>
> *(Tra hai chỗ này theo tên hàm, không theo số dòng: `internal/serve/` đang được sửa song song — trong lúc soát, `noiDungChuong` trôi từ dòng 246 sang 249 và điểm gọi ở `snapshot.go` trôi sang 453. Đúng cái bẫy mà đầu tệp cảnh báo, gặp ngay tại đây.)*
>
> **Và họ bắt thêm một lỗi mà mục này không nghĩ tới:** trả bản chốt dưới nhãn "Bản thảo" là hết rỗng nhưng thành gọi sai tên. Nên `noiDungChuong` trả kèm `nguon` (`NguonNhap` / `NguonChot`) để giao diện phân biệt được. Đó là chỗ bản sửa **tốt hơn** đề nghị trong báo cáo.

**Điểm cộng phải ghi nhận:** khu Đọc bản thảo đã tự chẩn đoán đúng lỗi này trong trạng thái rỗng của nó — *"Chương có dấu vết sản xuất nhưng store trả về bản thảo rỗng. Nội dung chương chỉ được đọc từ bản nháp (drafts/); chương đã chốt mà không còn bản nháp thì không có gì để đọc ở đây."* Đó là trung thực đúng mực. Nhưng nó **ghi lại** khuyết điểm chứ không sửa, nên câu hỏi số 3 của người vận hành trong `PRODUCT.md` ("Thành quả đọc ra sao?") vẫn không trả lời được.

### 2.2 Bấm "Đọc toàn văn chương" xong thì nút biến mất, không có đường quay lại

**Ảnh:** trước `1440-04-insp-banthao-trong.png` → sau `1440-05-doc-truyen.png`

`web/components/Inspector.tsx:284-289`: khi API trả `text: ""` thì `doan.length === 0`, và nhánh rỗng render **chỉ** một dòng `<p class="trong">`, bỏ luôn tiêu đề `Trích đoạn` và bỏ luôn nút.

Hệ quả trên màn hình: trạng thái sau khi bấm **trông y hệt** trạng thái chưa bấm bao giờ, chỉ khác là nút không còn. Người vận hành không có tín hiệu nào cho biết đã gọi API, và không bấm lại được — phải đổi tab rồi quay lại (`useEffect` ở dòng 263-266 chỉ reset theo `[tacPham, chuong]`, không reset khi đổi tab).

**Cách sửa:** ở nhánh `doan.length === 0`, giữ nguyên nút và nói rõ đã tải:

```tsx
if (doan.length === 0) {
  return (
    <div className="ibody">
      <h3>{CHU.trichDoan}</h3>
      <p className="trong">{GIAI_THICH.chuaCoBanThao}</p>
      <button type="button" className="docthem" onClick={doc}>Đọc lại</button>
    </div>
  );
}
```

> **✔ ĐÓNG (2026-07-31)** — `web/components/Inspector.tsx:298-308`, và **làm nhiều hơn** mục này đề nghị: ngoài việc giữ lại tiêu đề `Trích đoạn` + nút, nút còn có `disabled={dangTai}` và nhãn đổi theo trạng thái (`CHU.dangDoc` / `CHU.docLai`). Mục này chỉ đòi "bấm lại được"; bản sửa còn nói cho người dùng biết **đang** tải — tức lấp luôn phần "không có tín hiệu nào cho biết đã gọi API".

### 2.3 Nhịp đập vẫn đập sau khi engine đã dừng — ba chỗ trên một màn hình nói ba điều khác nhau

**Ảnh:** `1440-21-o-can-thiep-nhat-ky.png`

Đo được cùng lúc, cùng một khung hình:

| Chỗ | Nói gì |
|---|---|
| Transport | `○ đang nghỉ` |
| Thanh trên | `2 tác phẩm · 0 đang chạy` |
| Hàng chương 3 | `▶ đang soạn bản thảo` — **đang đập, 2.2s, vô hạn** |

`DESIGN.md:126` định nghĩa nhịp đập là **chuyển động duy nhất mang thông tin**: nó "phân biệt *đang chạy* với *đã dừng ở trạng thái này*". Ở đây nó không phân biệt được, vì `web/app/globals.css:895-897` gắn animation thuần theo màu công đoạn:

```css
/* Nhịp đập là chuyển động duy nhất mang thông tin: nó phân biệt ĐANG chạy với
   ĐÃ DỪNG ở trạng thái này — điều ảnh tĩnh không nói được. */
.st.gold .ky {
  animation: dapnhip 2.2s var(--ease) infinite;
}
```

Chú thích ngay trên nó phát biểu đúng ý định, còn code thì không làm được: `stage === 'drafting'` (`lib/nhan.ts:67` → `mau: 'gold'`) là một **công đoạn đã ghi vào store**, không phải một sự thật về liveness. Chương chết dở giữa lúc soạn chính là ca "đã dừng ở trạng thái này", và nó đập.

Trực tiếp phá tiêu chí thành công ở `PRODUCT.md:27`: "mở studio sau 6 giờ đi vắng và trong vòng 5 giây biết được dây chuyền khỏe hay bệnh". Engine chết + hàng đang đập = đọc ra "khỏe".

**Cách sửa — mẫu đã có sẵn trong repo.** `web/components/Transport.tsx:67` làm đúng rồi:

```tsx
className={`ky ${may.mau}${transport.state === 'running' ? ' dap' : ''}`}
```

Áp cùng cách cho bảng chương:

1. `web/app/globals.css:895` — đổi `.st.gold .ky` thành `.st.gold.dap .ky`.
2. `web/app/globals.css:2724` — trong nhánh `prefers-reduced-motion`, đổi `.st.gold .ky` theo cho khớp.
3. `web/components/BangChuong.tsx:91` — truyền liveness vào `<TrangThai>`; `<TrangThai tt={tt} dap={dangChay} />`, với `dangChay` lấy từ đúng nguồn transport đang dùng (`book.activity === 'running'`).

> **✔ ĐÓNG (2026-07-31)** — đúng theo cả ba bước mục này đề ra, chỉ khác số dòng:
>
> | mục này ghi | thực tế bây giờ |
> |---|---|
> | `globals.css:895` → `.st.gold.dap .ky` | **`globals.css:933`** — đã là `.st.gold.dap .ky` |
> | `globals.css:2724` nhánh `prefers-reduced-motion` | **`globals.css:2862`** — `.st.gold.dap .ky` đã khớp |
> | `BangChuong.tsx:91` truyền liveness | **`BangChuong.tsx:100`** — `<TrangThai tt={tt} dap={dangChay} />` |

Cũng nên xem lại đốm vàng đang đập ở viên `dòng sự kiện` (`globals.css:356-359`, `data-tt='song'`) khi ngay bên dưới ghi *"Chưa nhận sự kiện nào từ engine kể từ lúc mở dòng"*. Ở đây nhịp đập có cổng liveness thật (`song`/`mat`) nên không sai như 2.3, nhưng đặt cạnh "0 đang chạy" thì một đốm vàng đang đập vẫn dễ đọc thành "sự kiện đang chảy".

---

## 3. NẶNG

### 3.1 Rail ghi "Kiểm định 0" trong khi bề mặt Kiểm định có đủ bản duyệt 7 chiều

**Ảnh:** `1440-15-kiem-dinh-7chieu.png` (thấy rõ cả hai số cùng lúc)

- Rail: `◆ Kiểm định 0`
- Tiêu đề bề mặt: `3 chương có dấu vết sản xuất · 1 đã nghiệm thu`, bên dưới là bản duyệt đầy đủ 7 chiều của chương 1.

Hai con số cùng nhãn nhưng khác mẫu số. `web/components/Rail.tsx:82`:

```ts
const cuaKiemDinh = marks.filter((m) => m.state === 'gate').length;
```

Rail đếm **cửa kiểm định trên trục**; bề mặt liệt kê **chương có dấu vết sản xuất**. Người vận hành đọc "0" là "không có gì để kiểm" rồi không bấm vào — trong khi bên trong có một chương verdict `gia công` với 2 vấn đề, một cái severity `error`.

**Cách sửa:** cho rail đếm đúng thứ bề mặt sẽ liệt kê. Bề mặt đọc từ `snapshot.chapters`, nên rail cũng nên đếm từ đó (giống cách `vietLai` ở `Rail.tsx:87` đã cố ý làm, kèm chú thích giải thích chính xác cái bẫy này). Nếu muốn giữ nghĩa "cửa kiểm định" thì phải đổi nhãn rail thành `Cửa kiểm định` để hai con số không dùng chung một tên.

> **✔ ĐÓNG (2026-07-31)** — chọn hướng thứ nhất: `Rail.tsx:97` giờ là `const kiemDinh = rows.length`, đếm đúng thứ bề mặt liệt kê. `cuaKiemDinh` không còn là nguồn của con số đó; chú thích ở `Rail.tsx:94` ghi lại rằng điều kiện `cuaKiemDinh > 0` "gần như không bao giờ đúng" — tức nguyên nhân gốc đã được ghi lại tại chỗ, không chỉ sửa.

### 3.2 Nhãn phụ đầu bảng Tổ sản xuất: `line-height 1.35`, khe mực xấu nhất còn **0,31px**

**Ảnh:** `1440-20-to-san-xuat.png`, `390-03-to-san-xuat.png` (ở 390 nó ngắt hai dòng)
**Tệp:** `web/app/globals.css:2635` — `.bangto thead th em { font: 400 10.5px/1.35 var(--ui); }`

Đo bằng `TextMetrics.actualBoundingBoxAscent/Descent` của chính Inter đang render, không phải ước lượng:

| | px | ratio | khe mực dòng 1 ↔ dòng 2 |
|---|---|---|---|
| chuỗi hiện tại `theo chu kỳ gần nhất của mỗi / chương` | 10.5 | 1.35 | 4,27px |
| **xấu nhất** (dòng 1 hết bằng `ộng`, dòng 2 mở bằng `Ấ/Ộ/Ữ`) | 10.5 | **1.35** | **0,31px** |
| cùng chuỗi xấu nhất, nếu để 1.72 | 10.5 | 1.72 | 4,19px |

0,31px ở DPR 2 là dưới một điểm ảnh vật lý — dấu hai tầng chạm nhau. `DESIGN.md:80` đặt sàn `line-height ≥ 1.72` cho văn bản, và đây là 1.35.

**Cách sửa:** `web/app/globals.css:2635` → `font: 400 10.5px/1.72 var(--ui);`. Cột nới thêm ~3,9px mỗi dòng; nhãn phụ đã có `max-width: 26ch` nên bề rộng cột không đổi.

> **✔ ĐÓNG (2026-07-31)** — đúng theo đề nghị. Tra bằng `grep -n 'bangto thead th em' -A 20`, **không** bằng số dòng 2635 (đã trôi). Đo lại trên trình duyệt thật sau khi sửa: khe mực ca xấu nhất (`…ộng` / `Ầ`) **0,307px → 4,192px**; nhãn phụ render 2 dòng, bước dòng thật 18,05px khớp `line-height` 18,06px; `th` rộng 192px — **bề rộng cột không đổi**, đúng như dự đoán. Ảnh: `fix-v1-lineheight-1.35-vs-1.72-phong10x.png` (phóng nearest-neighbour ×10 ở DPR 2, mỗi ô vuông là một điểm ảnh vật lý) và `fix-v1-1440-to-san-xuat-sau-1.72.png`.

### 3.3 Tiêu đề chương trong danh sách đọc: `line-height 1.45`, khe mực xấu nhất **1,62px**

**Ảnh:** `1440-13-doc-ban-thao-co-van.png` (`Thư không người / nhận` ngắt hai dòng)
**Tệp:** `web/app/globals.css:1807-1814` — `.dsChuong .ten { -webkit-line-clamp: 2; line-height: 1.45; }` (dòng `line-height` là **1812**)

| | khe mực |
|---|---|
| `Thư không người / nhận` (hiện tại) | 5,90px |
| xấu nhất `…ộng` / `Ấ…` | **1,62px** |
| nếu để 1.72 | 4,99px |

Chú thích ngay trên rule đó tự nói tiêu đề **cố ý ngắt hai dòng** và "tiêu đề chương do mô hình đặt, không có giới hạn trên" — nghĩa là ca xấu nhất chắc chắn tới, chỉ là chưa tới.

**Cách sửa:** `globals.css:1812` `line-height: 1.45` → `1.72`. Hộp clamp 2 dòng cao thêm 6,8px.

> **✔ ĐÓNG (2026-07-31)** — đúng theo đề nghị. Tra bằng `grep -n '^\.dsChuong \.ten' -A 20`.
>
> Đo lại sau khi sửa: khe mực ca xấu nhất (`…ộng` / `Ầ`) **1,615px → 4,99px**. Hàng 1 dòng cao 33,5px, hàng 2 dòng cao 55px (đúng mức "+6,8px" mục này dự đoán), không tiêu đề nào bị cắt sai.
>
> **Điều mục này không nghĩ tới và đã được kiểm:** nâng `line-height` trong một hộp `-webkit-line-clamp` có thể phá canh dòng cơ sở với hai cột `.ky`/`.so` bên cạnh (`.dsChuong button` là grid `align-items: baseline`). Đo trên **cả 7 hàng**: baseline của `.ky` và `.so` lệch **0,00px** so với dòng đầu của tiêu đề. Không phá gì.
>
> Ảnh trước/sau trên cùng bề mặt thật: `fix-v1-1440-ban-thao-truoc-1.45.png` → `fix-v1-1440-ban-thao-sau-1.72.png`.

### 3.4 Ở 390px, 56% thanh transport bị đẩy ra ngoài — mất đúng phần giá thành và năng suất

**Ảnh:** `390-01-dong-san-xuat.png` (đáy khung chỉ còn `đang nghỉ`, `công đoạn commit`, `tổ —`, `ngữ cả…`)

Đo được: `.trans` có `scrollWidth 890px`, `clientWidth 390px` → **500px bị ẩn**, `overflow-x: auto`. Năm trong tám ô nằm ngoài khung:

| ô | left → right | trong khung? |
|---|---|---|
| `○ đang nghỉ` | 4 → 105 | ✓ |
| `công đoạn commit vừa xong` | 105 → 291 | ✓ |
| `tổ —` | 291 → 343 | ✓ |
| `ngữ cảnh —` | 343 → 500 | ✗ |
| `năng suất —` | 500 → 590 | ✗ |
| `giá thành —` | 590 → 677 | ✗ |
| `tổng $0,00` | 677 → 766 | ✗ |
| `đã chạy 0:00:02` | 766 → 886 | ✗ |

`DESIGN.md:104` nói transport là "**luôn hiện, không cuộn mất**"; `DESIGN.md:106` nói "Transport không bao giờ bị bỏ". Thanh thì còn, nhưng nội dung nó tồn tại để mang — chương/giờ và đô-la/chương, đúng ba con số của `PRODUCT.md` Design Principle 3 — thì phải cuộn ngang mới thấy. Ở 390 thanh transport giữ lại đúng phần ít cần nhất.

**Cách sửa:** dưới 860px, xếp transport thành hai hàng thay vì cuộn ngang một hàng — hàng trên `trạng thái máy + công đoạn`, hàng dưới `năng suất · giá thành · tổng · đã chạy`. Grid gốc `44px 1fr 30px` đổi thành `44px 1fr 30px 30px` trong media query, hoặc để `.trans { flex-wrap: wrap; height: auto }` và bỏ `overflow-x`. Cách nào cũng giữ đúng chữ "luôn hiện".

> **✔ ĐÓNG (2026-07-31) — nhưng phương án ĐIỂM NGẮT ở trên là SAI. Đừng làm theo nửa đầu câu "Cách sửa".**
>
> Mục này (và người giao việc) coi đây là bài toán **bề rộng màn hình**, nên đề ra một điểm ngắt. Đo lại cho thấy nó là bài toán **bề rộng dữ liệu**:
>
> | nội dung thanh | bề rộng cần |
> |---|---|
> | fixture của đợt kiểm này, mọi số là `—` | **944px** |
> | một phiên đang chạy có số thật (`công đoạn soat_nhat_quan vừa xong` · `tổ Writer · gemini-2.5-pro` · `ngữ cảnh 78%` · `năng suất 3,4 chương/giờ` · `giá thành $0,420 / chương` · `tổng $128,45` · `đã chạy 6:12:04`) | **1253px** |
>
> Nghĩa là bản sửa theo điểm ngắt 860/900px vẫn **cắt mất `đã chạy` trên cả dải 900–1253px, gồm cả 1024 và 1240** — và cắt **đúng lúc engine bắt đầu có số thật để báo**, tức hỏng chính xác vào lúc dữ liệu trở nên đáng đọc. Đã đo tận tay: ở **901px** thanh tràn 44px và `đã chạy 0:00:02` nằm ngoài khung, ngay cả với fixture nghèo này.
>
> Hiện thực thật = phương án thứ hai ở câu cuối, áp cho **mọi** bề rộng: `.trans { flex-wrap: wrap }` không đặt sau media query nào, và hàng grid của transport thành `minmax(30px, auto)` ngay ở `.khung`.
>
> Kèm hai điều mục này không nêu:
> - `.trans .cell.push { margin-left: auto }` (gom số liệu về mép phải) **chỉ an toàn khi chắc chắn vừa một hàng** — sau khi xuống dòng nó biến chỗ trống thành khoảng hở đọc ra như thiếu ô (đo được: hở 48px ở 390px, **186px ở 1024px** với số liệu thật). Nên nó bị hạ về `0` và chỉ bật lại từ `min-width: 1360px`, nơi nội dung rộng nhất đo được vẫn vừa một hàng. Đánh đổi: ở 1024/1240 nhóm số liệu chảy liền sau `ngữ cảnh` thay vì dạt phải. Ở **≥1360px (gồm 1440px của đợt kiểm này) hình không đổi một pixel**.
> - ô `tổ` mang tên model, **không có giới hạn trên**, nên nó bị chặn theo đúng luật của `.cell.buoc` (300px, 216px dưới 1240px) + ellipsis riêng cho tên model + câu đầy đủ vào `title`. Tên **vai** không bị cắt: đó là tập đóng (Architect/Writer/Editor/Arbiter/Engine) nên không bao giờ là thứ làm tràn.
>
> Kết quả đo sau khi sửa, ở 7 bề rộng (365 · 390 · 901 · 1024 · 1240 · 1359 · 1440), mỗi bề rộng kiểm 2 lần (fixture nghèo + số liệu thật): tràn **0px**, ô ngoài khung **0**, khoảng hở giả **0**, cả bốn số luôn trong khung, thanh luôn sát đáy khung. Ảnh: `fix-v2-390-transport-truoc.png` → `fix-v2-390-transport-sau.png`, thêm `fix-v2-1024-transport-sau.png`, `fix-v2-1440-transport-sau.png`, `fix-v3-1024-to-chan-216-ellipsis.png`.
>
> **Bài học ghi lại cho lần sau:** con số 890px trong bảng trên đo với `tổ —` (52px). Fixture sau này giàu hơn cho `tổ gemini-2.5-pro` (122px) và bảng lập tức lệch 70px. Một ngưỡng bố cục chốt theo bề rộng nội dung **đo từ một fixture** sẽ sai ngay lần fixture đổi.

---

## 4. NHẸ

### 4.1 Vạch đỏ mốc 85% của thước ngữ cảnh bị `overflow: hidden` cắt phần nhô ra

**Tệp:** `web/app/globals.css:1572` (`.ctxbar`) và `1587` (`.ctxbar::after`)

```css
.ctxbar   { height: 5px; overflow: hidden; position: relative; }
.ctxbar::after { left: 85%; top: -2px; bottom: -2px; width: 1px; background: var(--red); }
```

Vạch được thiết kế nhô 2px trên và 2px dưới để nhìn thấy được trên một thanh cao 5px, nhưng `overflow: hidden` của cha cắt sạch phần nhô đó. Đo được `.ctxbar` có `scrollHeight - clientHeight = 2` — chính là phần bị cắt.

`DESIGN.md:118` đòi "vạch đỏ ở mốc 85% để thấy ngưỡng nén sắp tới, không chỉ hiện một con số". Vạch có, nhưng bị bóp thành 1×5px nằm lọt trong thanh.

**Cách sửa:** bỏ `overflow: hidden` khỏi `.ctxbar` — `.ctxbar i` đã tự có `border-radius: 3px` nên không cần cha cắt góc.

### 4.2 Câu "Ranh giới" ở Luật thế giới tô amber toàn bộ — 15,1% diện tích chữ của bề mặt

**Ảnh:** `1440-18-luat-the-gioi.png`

Đo được trên bề mặt đó: tổng diện tích chữ 107.084px², phần **không** phải `--ink/--ink-2/--ink-3` là **15,14%**, trong đó `--amber` `rgb(242,166,96)` chiếm **15,03%**.

`DESIGN.md:13` đặt chiến lược "một màu tín hiệu duy nhất chiếm **dưới 10%** diện tích", và `PRODUCT.md` Design Principle 5 là "Màu dành cho dữ liệu, không cho khung". Ở đây cả câu luật chạy dài đều là amber, không chỉ nhãn.

**Cách sửa:** giữ `Ranh giới:` + đốm ■ ở amber, để câu ranh giới ở `--ink` (16,59:1, thừa ngưỡng). Diện tích amber tụt còn ~3%.

> **◐ CODE ĐÃ ĐỔI — nhưng con số 15,03% CHƯA ĐO LẠI (2026-07-31).**
>
> Cấu trúc giờ tách nhãn khỏi câu: `TheGioi.tsx:54` đặt `Ranh giới:` trong `<span className="dx">` riêng, còn `{r.boundary}` nằm **ngoài** span đó; và `globals.css:2412` đặt `.dsLuat .ranh .dx { color: var(--ink-3) }`. Tức cả câu ranh giới **không còn là amber** — bảng "15,03% amber" ở trên **không còn mô tả code hiện tại**.
>
> Nhưng tôi **chưa dựng lại trình duyệt để đo lại diện tích**, nên con số mới là **chưa đo** — không phải "~3%" như mục này dự đoán, cũng không phải 15,03%. Ai cần con số thật phải đo lại.
>
> Một chỗ lệch so với đề nghị, đáng để chủ thiết kế xem: mục này đề nghị nhãn `Ranh giới:` **giữ amber**, thực tế nhãn thành `--ink-3`. Nếu đốm ■ cũng không còn amber thì hàng đó mất hẳn kênh màu — **chưa đo** màu thực của `.ranh .ky`.

### 4.3 Ở 390px, dấu `·` thành chữ mồ côi mở đầu dòng

**Ảnh:** `390-01-dong-san-xuat.png`

```
Chương 1–15 / 300
· 285 chương ngoài cửa sổ
Hiện toàn bộ 300 chương
```

Ba mảnh là ba phần tử riêng; ở 1440 chúng nằm cùng một dòng nên dấu `·` đóng đúng vai phân cách, ở 390 chúng xuống dòng và `·` mở đầu dòng thứ hai. **Cách sửa:** đưa `·` vào làm `::before` chỉ hiện khi cùng dòng, hoặc bỏ nó ở breakpoint hẹp.

### 4.4 Cuộn hết khu Đọc bản thảo thì cột văn trống trơn, chỉ còn lề bản duyệt

**Ảnh:** `1440-13-doc-ban-thao-co-van.png` → `1440-14-doc-ban-thao-cuoi-7chieu.png`

Chỉ có một khung cuộn (`.canvas.khudoc`, `scrollHeight 1245` / `clientHeight 653`). Khi lề bản duyệt cao hơn cột văn — chương ngắn, hoặc bản duyệt 7 chiều + nhiều vấn đề — cuộn tới đáy để lại một vùng đen lớn ở chỗ vừa còn văn. Đọc ra như "văn bị mất".

Tất cả 7 chiều đều tới được (đã kiểm: chiều cuối `60/100` nằm trong tầm cuộn), nên đây không phải nội dung không truy cập được, chỉ là hình xấu và gây hiểu sai. **Cách sửa:** cho lề bản duyệt `position: sticky; top: 0` trong cột riêng của nó, hoặc cho hai cột cuộn độc lập.

### 4.5 Bộ chọn tác phẩm bỏ mất `id`, hai tác phẩm cùng tên thành không phân biệt được

**Ảnh:** `1440-23-picker-chon-tac-pham.png`, `1440-24-truc-muc-xem-chuong.png`

Hai mục trong danh sách hiện **y hệt nhau**: `○ Trấn Yêu Ký 2/300` và `○ Trấn Yêu Ký 2/300`. Đó là hai thư mục khác nhau, `tran-yeu-ky` và `thanh-van-lo`.

`web/components/ThanhTren.tsx:102` — `{b.name ? b.name : <em>{b.id}</em>}`. `id` chỉ dùng làm phương án dự phòng khi `name` rỗng, không bao giờ dùng để phân biệt. `/api/workshop` đã trả `id` sẵn.

Trường hợp này do fixture của tôi (seed-demo đặt cứng tên "Trấn Yêu Ký" cho mọi thư mục), nhưng nó có thật ngoài đời: chạy lại, nhân bản, làm bản v2 trong thư mục khác đều cho hai tác phẩm cùng tên.

**Đã kiểm và KHÔNG phải lỗi:** mục đang mở có nền `--raised` `rgb(36,32,27)` và chữ `--ink`, cộng `aria-current="true"`; đóng bằng click ra ngoài và Escape đều chạy; `aria-expanded`/`aria-haspopup="listbox"` đúng. Chỉ có ký hiệu là **`○` cho cả hai** — tức kênh ký hiệu mà `DESIGN.md:50` đòi ("mọi trạng thái mang cả đốm màu, ký hiệu, và nhãn chữ") ở đây không mang tin gì.

**Cách sửa:** thêm `id` làm dòng phụ mono `--ink-3` dưới tên, và đổi ký hiệu mục đang mở thành `●`.

### 4.6 Ô nhập can thiệp không có `id`/`name` — console báo issue

Đây là **thông điệp console duy nhất** thuộc loại lỗi/issue trên toàn bộ đợt kiểm: *"A form field element should have an id or name attribute"*. Ô `Ý kiến can thiệp` có `aria-label` nên vẫn dùng được với trình đọc, nhưng thêm `id` + `<label for>` là xong.

### 4.7 Nhãn `--ink-3` trên `--raised` chỉ còn 4,53:1 — hết biên an toàn

Đo trực tiếp từ token đang render (dùng canvas để quy `oklch()` về sRGB):

| | `--bg` | `--panel` | `--panel-2` | `--raised` |
|---|---|---|---|---|
| `--ink` | 16,59 | 15,86 | 14,88 | 13,75 |
| `--ink-2` | 8,93 | 8,54 | 8,02 | 7,40 |
| `--ink-3` | 5,46 | 5,22 | 4,90 | **4,53** |

`DESIGN.md` ghi 16.1 / 8.2 / 4.9 so với `--bg`; đo được 16,59 / 8,93 / 5,46 — con số trong tài liệu **thận trọng hơn thực tế**, tức không có chỗ nào tài liệu nói quá. Tốt.

Nhưng `--ink-3` trên `--raised` (theo `DESIGN.md:26` là "nút bật, nền thước đo") còn 4,53:1 — hơn sàn 4,5 đúng 0,03. Bất kỳ lần nào sau này hạ `--ink-3` hoặc nâng `--raised` là vỡ AA mà không ai để ý. **Đề nghị:** ghi vào `DESIGN.md` rằng cặp `--ink-3` trên `--raised` là cặp sát sàn nhất, và cấm dùng `--ink-3` trên bề mặt nào sáng hơn `--raised`.

> **○ ĐỀ NGHỊ CHƯA LÀM (soát 2026-07-31).** `DESIGN.md` vẫn chưa có câu nào về cặp sát sàn này, cũng chưa có lệnh cấm dùng `--ink-3` trên bề mặt sáng hơn `--raised`. Mục `--ink-3` ở `DESIGN.md` chỉ ghi "sàn cứng, không hạ thêm" — đúng nhưng chưa đủ, vì nguy hiểm thật nằm ở phía **nâng nền**, không phải hạ chữ.
>
> Đây là mục rủi ro-âm-thầm cao nhất trong cả §4: nó không sai hôm nay, nhưng nó là chỗ sẽ vỡ AA mà không có ai hay cái gì báo. Cả bốn con số 4,53 / 4,90 / 5,22 / 5,46 ở bảng trên **là số đo của đợt kiểm gốc, chưa đo lại đợt này** — token có thể đã đổi.

### 4.8 Hai chỗ dưới sàn 1.72 nhưng chưa tới mức nguy hiểm

| Tệp | Rule | ratio | khe xấu nhất | Ghi chú |
|---|---|---|---|---|
| `globals.css:945` | `.title` (tiêu đề chương ở bảng Dòng sản xuất) | 1.5 | 2,24px | ngắt hai dòng ở 390 — ảnh `390-01` |
| `globals.css:2134` | `.chuamoNoi` | 1.66 | 4,07px | chỉ lệch chuẩn, không có rủi ro chạm dấu |
| `globals.css:603` | `.canhbao li` | 1.6 | *chưa đo* | không dựng được trạng thái cảnh báo trong đợt này |

`.title` nên lên 1.72 cùng lúc với §3.3 (cùng một loại nội dung: tiêu đề chương do mô hình đặt).

> **✔ ĐÃ XỬ LÝ (cập nhật 2026-07-31).** Cả ba hàng trên đều đã được đóng, nhưng không hàng nào đóng theo đúng cách bảng mô tả — nên đọc ghi chú này trước khi tin bảng:
>
> - **`.chuamoNoi` → `1.72`.** Đo lại ở 12px: khe xấu nhất (`…ộng` / `Ầ`) **4,07px → 4,79px**. Xác nhận trên bề mặt Dàn ý ở 390px: 2 dòng thật, bước dòng 20,63px khớp `line-height` 20,64px, hộp không bị cắt.
> - **`.canhbao li` → `1.72`.** Con số "*chưa đo*" giờ đã có: ở 12.5px khe xấu nhất **3,49px → 4,99px**. `seed-demo` vẫn không sinh cảnh báo nhất quán nào, nên rule được kiểm bằng **DOM bơm tay** vào đầu canvas — 3 dòng thật, bước dòng 21,5px. Nói rõ vì đây không phải trạng thái thật của engine.
> - **`.title`** — hàng này **đã lỗi thời**: `td.title` không còn khai báo `line-height` riêng nữa (nay kế thừa), nên không còn chỗ nào ở `1.5` để sửa.
>
> Lưu ý về mức độ: 4,07px và 3,49px **không phải ca chạm dấu** như nhãn phụ 10.5px của §3.2 (0,31px). Hai chỗ này được nâng để một sàn đã viết ra thì được thi hành ở mọi nơi, không phải để cứu một va chạm sắp xảy ra — bảng gọi đúng chúng là "chưa tới mức nguy hiểm".

### 4.9 Sáu cảnh báo preload font — vô hại, ghi ra để lần sau không phải điều tra lại

`next/font` preload 3 họ × 2 subset (`latin`, `vietnamese`) = 6 tệp woff2, và mỗi trang chỉ dùng một phần trong vài giây đầu → 6 cảnh báo `preloaded but not used`. Cấu hình ở `web/app/layout.tsx:17-36` là **đúng** (subset `vietnamese` là bắt buộc). Không phải khuyết điểm.

### 4.10 Xưởng trống canh giữa cả hai trục, ở 1440 trôi lơ lửng giữa màn hình đen

**Ảnh:** `1440-22-xuong-trong.png`, `390-04-xuong-trong.png`

Nội dung thì xuất sắc (xem §6), nhưng `.trangtrong { align-content: center; margin: 0 auto }` đặt nó vào giữa một canvas 1440×~1200, cách xa góc trên-trái nơi mắt bắt đầu. **Cách sửa:** neo vào trên-trái với padding, hoặc chỉ canh giữa trục ngang.

---

## 5. Bề mặt nào rỗng — và rỗng đúng cách hay rỗng vì vỡ

Phân biệt rõ vì đó là hai chuyện khác nhau.

| Bề mặt | Trạng thái | Rỗng đúng cách? |
|---|---|---|
| Đọc bản thảo (toàn văn) | rỗng dù chương đã chốt | ❌ **rỗng vì vỡ** — §2.1, `LoadChapterContent` đọc sai tệp |
| Tab Bản thảo trong inspector | như trên | ❌ **rỗng vì vỡ** — §2.1 |
| Kiểm định | rỗng khi thiếu `reviews/{NN}.json` | ✅ đúng cách — nói rõ "Store ghi bản duyệt theo từng chương, và API trả bản duyệt của đúng chương đang chọn" |
| Nhân vật | rỗng khi thiếu `characters.json` | ✅ đúng cách — "Engine ghi mục này ở bước dựng nền" |
| Luật thế giới · Phục bút | rỗng khi thiếu tệp tương ứng | ✅ đúng cách |
| Hàng chờ viết lại | rỗng khi `pending_rewrites` rỗng | ✅ đúng cách — "Editor trả chương về khi bản duyệt có vấn đề buộc phải sửa" |
| Hàng chờ, mở rộng một dòng | `Chưa có bản duyệt cho chương này` | ⚠️ đúng-về-dữ-liệu nhưng **vô dụng về vận hành** — xem dưới |
| Dàn ý → Dàn ý phẳng | `Chưa có dàn ý nào trong store` | ⚠️ câu quá tuyệt đối — xem dưới |
| Dòng sự kiện | `Chưa nhận sự kiện nào từ engine kể từ lúc mở dòng` | ✅ đúng cách |
| Ô can thiệp | vô hiệu có chủ ý | ✅ đúng cách, mẫu mực — xem §6 |
| Xưởng trống | không có tác phẩm | ✅ đúng cách, mẫu mực — xem §6 |
| Văn phong · Chi phí · Cài đặt | **không phải bề mặt** — nhãn "chưa dựng", không bấm được | ✅ đúng hợp đồng ở `web/lib/khu.ts:8-11` |

**Endpoint còn thiếu** (khớp đúng ghi chú ở `Rail.tsx:29-35`): `meta/style_rules.json` (Văn phong) không có endpoint; `meta/usage.json` có `PerAgent`/`PerModel` nhưng API chỉ trả `Overall.Cost` (Chi phí); `RunMeta` không được trả (Cài đặt). Không có mục nào trong ba mục đó giả vờ bấm được — rail dựng đúng.

> **✗ ĐOẠN TRÊN ĐÃ SAI (2026-07-31) — đừng trích dẫn nó. Cả ba bề mặt đã được dựng.**
>
> Tầng API: `internal/serve/snapshot.go` giờ gọi `buildStyle` / `buildCost` / `buildSettings` và trả ba cờ `StyleRules` / `CostBreakdown` / `RunSettings` trong `Capabilities`. Tầng web: `web/lib/khu.ts` giờ có **12 khu**, thêm `van-phong` · `chi-phi` · `cai-dat`. Nên câu "không có endpoint" và hàng *"Văn phong · Chi phí · Cài đặt — không phải bề mặt, nhãn chưa dựng, không bấm được"* trong bảng §5 **đều đã hết đúng**.
>
> **Ba bề mặt mới này CHƯA được kiểm bằng mắt lần nào** — chúng land trong lúc tôi đang soát tệp này. Đó là ba bề mặt cần kiểm trước nhất ở đợt sau.
>
> Ghi lại một chuyện đúng lúc, vì nó là bài học của cả tệp: hàng đó đúng khi tôi bắt đầu soát và **sai trước khi tôi soát xong** — tôi phải sửa chính khối này hai lần trong một lượt. Một báo cáo kiểm định là **ảnh chụp**, không phải trạng thái; nên mọi kết luận trong đây cần đọc kèm ngày, và mọi lần dùng lại đều phải kiểm lại trên đĩa.
>
> Ba cờ mới đáng ghi nhận vì chúng học đúng bài học của `LayeredOutline` (xem chú thích trong `snapshot.go`): chúng suy từ **chính builder** mà endpoint tương ứng dùng, không từ một phép kiểm riêng — nên không có hai đường suy luận song song để lệch nhau.
>
> Ba cờ mới đáng ghi nhận vì chúng học đúng bài học của `LayeredOutline` (xem chú thích trong `snapshot.go`): chúng suy từ **chính builder** mà endpoint tương ứng dùng, không từ một phép kiểm riêng — nên không có hai đường suy luận song song để lệch nhau.
>
> **Một câu ở §5 cần đọc lại theo nghĩa mới.** Bảng trên xếp ba mục đó là *"✅ đúng hợp đồng ở `web/lib/khu.ts`"* — hợp đồng đó (mục nào không nằm trong `Khu` thì rail PHẢI vẽ là chưa dựng, vì *"bấm vào một bề mặt chưa có là một lời hứa hụt, và một bề mặt trống trơn còn tệ hơn — đó là nói dối"*) **vẫn còn nguyên giá trị và vẫn đang được tôn trọng**; chỉ là ba mục kia đã chuyển sang phía "có bề mặt thật". Hợp đồng không bị phá, nó được dùng đúng.

Hai chỗ nên sửa câu chữ:

- **Hàng chờ viết lại, mở rộng** (`1440-17-hang-cho-mo-rong.png`): chương 2 đang trong hàng chờ mà mở ra chỉ được "Chưa có bản duyệt cho chương này". Bề mặt này tồn tại để trả lời câu hỏi số 2 của `PRODUCT.md` — "Editor bắt lỗi gì, chương nào bị trả về?" — nên khi thiếu bản duyệt, nó nên nói rõ nó đọc `pending_rewrites` từ `progress.json` còn lý do nằm ở `reviews/{NN}.json`, chứ không phải một câu phủ định trơ.
- **Dàn ý phẳng** (`1440-10-dan-y-cuoi.png`): câu "Chưa có dàn ý nào trong store" đứng ngay dưới một dàn ý phân tầng đầy đủ 2 tập. Nên là "Chưa có dàn ý phẳng — tác phẩm này dùng dàn ý phân tầng".

> **Trạng thái hai chỗ này (soát 2026-07-31):**
>
> - **Hàng chờ mở rộng — ✗ CÒN.** `web/lib/nhan.ts:692` vẫn là `chuaCoDuyet: 'Chưa có bản duyệt cho chương này.'` — vẫn là câu phủ định trơ, chưa nói nó đọc `pending_rewrites` từ đâu và lý do nằm ở tệp nào.
> - **Dàn ý phẳng — ◐ SỬA MỘT PHẦN.** `DanY.tsx:62-64` giờ có nhánh: khi `flat` có nội dung thì hiện `"<n> chương đã mở chi tiết"` + `GIAI_THICH.danYPhangGiai` (*"Bản dàn trải của dàn ý phân tầng, do engine ghi lại để tra theo số chương. Cùng một sự thật, khác cách xếp."*) — đúng tinh thần đề nghị, và nói rõ quan hệ giữa hai dạng. **Nhưng** khi `flat` rỗng thì vẫn rơi về `GIAI_THICH.chuaCoDanY` = *"Chưa có dàn ý nào trong store."* (`nhan.ts:736`) — vẫn là câu tuyệt đối, vẫn có thể đứng dưới một dàn ý phân tầng đầy đủ. Ca chính xác trong ảnh `1440-10` **còn tái hiện được hay không thì chưa đo lại**: phụ thuộc fixture hiện tại có ghi `flat` hay không, và tôi không dựng trình duyệt đợt này.

**Một chỗ tôi không kiểm được:** thư mục con không có `meta/progress.json` bị `/api/workshop` loại im lặng (tôi tạo `output/xuong-rong-chua-init` và nó không hiện, cũng không có cảnh báo). Không phán được là đúng hay sai vì chưa rõ ý định; nhưng người vận hành gieo sai thư mục sẽ thấy "Xưởng chưa có tác phẩm" mà không biết là có thư mục nhưng chưa init.

---

## 6. Những chỗ làm đúng, đã đo và xác nhận

Ghi ra để đợt sau không sửa hỏng chúng.

> **⚠ Trạng thái mục này (soát 2026-07-31): số dòng đã trôi, và các claim KHÔNG được đo lại đợt này.**
>
> Mục này là thứ dễ bị tin sai nhất trong cả tệp, vì nó nói "đã đo và xác nhận" — nhưng đó là đo ở đợt kiểm gốc. Từ đó `globals.css` đã dài thêm vài trăm dòng và nhiều bề mặt đã đổi. **Không dựng lại trình duyệt đợt soát này**, nên mọi con số ở dưới (0 lỗi tương phản, 5,46:1 placeholder, 10,53:1 focus, diện tích, `scrollWidth === innerWidth`) là **chưa đo lại** — chúng có thể vẫn đúng, nhưng tệp này không còn là bằng chứng cho điều đó.
>
> Số dòng đã định vị lại (tra theo tên, đừng tra theo số):
>
> | mục này ghi | thực tế bây giờ |
> |---|---|
> | `globals.css:2723-2736` — `prefers-reduced-motion` | **`:2861`**, và selector đầu đã là `.st.gold.dap .ky` (đổi theo §2.3) |
> | `globals.css:2638-2639` — chỗ duy nhất *tắt* `text-transform`/`letter-spacing` | **`:2776-2777`** |
> | `globals.css:608-609` — cột nhãn 96px | **`:634` + `:641`** |
> | `globals.css:41-44` — giữ hình dạng trục khi hẹp | **`:44`** (`--khoi-min: 72px`), bản hẹp ở **`:160`** (`40px`) |
>
> **Quan trọng nhất — phạm vi "toàn bộ" của mục này đã hẹp đi.** Mọi claim ở đây nói "trên cả 9 khu", và lúc đó 9 khu **là** toàn bộ ứng dụng. Giờ `khu.ts` có **12 khu**: Văn phong · Chi phí · Cài đặt vừa được dựng. Nên *"0 lỗi tương phản trên toàn bộ bề mặt"* thật ra là **0 lỗi trên 9 trong 12 bề mặt** — ba bề mặt mới **chưa được đo lần nào**, cả tương phản, cả tràn ngang, cả danh sách CẤM. Đây không phải chuyện câu chữ: một câu "0 lỗi" đọc như đã phủ hết sẽ làm người sau không đi kiểm ba chỗ chưa ai xem.
>
> Một claim đã **hết đúng theo nghĩa chữ**: *"Không tràn ngang ở bất kỳ bề rộng nào… trên cả 9 khu"* đo khi transport còn cuộn ngang một hàng. Giờ transport xuống dòng nên `.trans` không còn tràn ở bất kỳ bề rộng nào (§3.4) — claim vẫn đúng, nhưng **vì một lý do khác** với lúc viết.
>
> Một claim khác cần đọc lại cùng §7: *"Vấn đề kèm `Dẫn chứng:` in serif nghiêng — dùng serif đúng chỗ `DESIGN.md:60` cho phép"* vẫn đúng, nhưng danh sách ở `DESIGN.md:60` giờ có **bốn** mục (thêm "tiêu đề chương"), không phải ba như mục §7 trích.

**Tương phản: 0 lỗi trên toàn bộ bề mặt, cả ba bề rộng.** Đo bằng cách quy `oklch()`/`lab()` về sRGB qua canvas rồi tự tính WCAG, không ước lượng bằng mắt. Tổng ~1.000 nút chữ qua 3 bề rộng × 9 khu, không một nút nào dưới ngưỡng. (Lần đo đầu của tôi dùng regex `rgb()` và **âm thầm bỏ qua** mọi màu `lab()` — nếu tin nó thì "0 lỗi" là vô nghĩa; con số trên là lần đo lại đã sửa.)

**Placeholder giữ 4,5:1 — yêu cầu mà `PRODUCT.md:62` nói riêng.** Đo `::placeholder` của ô can thiệp: `--ink-3` trên `--bg` = **5,46:1**. Không hạ nhạt "cho thanh thoát".

**Drop cap chịu được ca xấu nhất của tiếng Việt.** `DESIGN.md:82` cảnh báo lỗi này *ẩn* khi chương mở bằng "Đêm" vì `Đ` không có dấu trên. Tôi cố ý viết bản nháp mở bằng **"Ấy là đêm mưa không dứt"** — `Ấ` có cả dấu mũ và dấu sắc. Ảnh `1440-13` và `390-02`: drop cap `Ấ` hiện nguyên hai tầng dấu, không cụt ngọn. `line-height: 0.94` làm đúng việc nó nói.

**Không có lỗi React/hydration nào.** Console qua toàn đợt: 1 issue a11y (§4.6) + 6 cảnh báo preload font vô hại (§4.9). Không error, không cảnh báo hydration.

**Không tràn ngang ở bất kỳ bề rộng nào.** `document.documentElement.scrollWidth === innerWidth` ở cả 1440, 1024, 390 trên cả 9 khu.

**Không vi phạm danh sách CẤM.** Soát cả CSS lẫn ảnh: không `backdrop-filter`, không gradient chữ, không glow, không sidebar navy, không bảng viền đầy ô (bảng chỉ có kẻ ngang 1px), không nhãn chữ hoa giãn cách (`grp` là sentence case; chỗ duy nhất có `text-transform`/`letter-spacing` là `globals.css:2638-2639` và nó *tắt* cả hai). Hai `repeating-linear-gradient` duy nhất là vân sọc chéo của khối "chờ mở" — đúng `DESIGN.md:114` yêu cầu.

**Hàng được chọn dùng đúng `inset 1px`, không phải viền dày.** Đo `box-shadow` ô đầu hàng: `lab(77.4575 12.5001 55.13) 1px 0 0 0 inset`, `border-left-width: 0px`. Đúng `DESIGN.md:115`.

**Token khớp `DESIGN.md` từng giá trị**, và tỉ số thực **tốt hơn** con số tài liệu ghi (§4.7).

**`prefers-reduced-motion` đầy đủ.** `globals.css:2723-2736` gọi tên cả ba selector nhịp đập rồi mới phủ toàn cục `transition-duration: 0.01ms` — có nhánh thay thế, không animation nào không có đường tắt.

**Bàn phím là hạng nhất.** `:focus-visible { outline: 2px solid var(--gold); outline-offset: 1px }` toàn cục, cộng hai override ở chỗ outline bị cắt (`.bang tbody tr`, `.dsHangCho .hangdau`). Vàng trên `--bg` = 10,53:1, thừa ngưỡng 3:1 cho thành phần không phải chữ.

**Trạng thái không bao giờ chỉ dựa vào màu.** Mọi công đoạn đều có đốm + ký hiệu + nhãn chữ: `● đã nghiệm thu`, `▶ đang soạn bản thảo`, `■ trả về viết lại`, `○ chờ trong hàng`, `◆ cửa kiểm định`, `◇ mới gieo`. Ảnh đen trắng vẫn đọc được. (Ngoại lệ duy nhất: ký hiệu trong bộ chọn tác phẩm — §4.5.)

**Trục giữ được hình dạng khi hẹp.** Ở 390 khối bỏ phần chữ phạm vi (`T1 · 1–3` → `T1`) mà giữ tỉ lệ và vị trí, đúng ý định ghi ở `globals.css:41-44`. Cửa sổ chương tự co (1–51 ở 1440 → 1–43 ở 1024 → 1–15 ở 390) và số "ngoài cửa sổ" cập nhật theo (249 → 257 → 285). Không có chỗ nào bịa.

**Ô can thiệp vô hiệu là mẫu mực.** `disabled` + `readOnly` thật (đã kiểm DOM), `cursor: not-allowed`, kèm giải thích in đậm *vì sao*: engine sở hữu quyền ghi, hai process cùng ghi thì ý kiến can thiệp mất trắng — và chỉ luôn sang TUI. Khớp đúng lời mở đầu `internal/serve/serve.go:1-12`.

**Xưởng trống nêu nguyên nhân + đường dẫn thật + lệnh sửa:** "Thư mục gốc không chứa tác phẩm nào có meta/progress.json", `thư mục gốc /tmp/ainovel-empty`, `ainovel-cli run --root <thư mục gốc>`. Rail biến mất đúng (không tác phẩm thì không có khu), transport còn lại và nói "chưa có tác phẩm nào để theo dõi".

**Kiểm định là hàng mảnh có dẫn chứng, không phải thẻ điểm** (`DESIGN.md:116`). Mỗi chiều một hàng: tên chiều, verdict có đốm + chữ, điểm mono, rồi một câu kết luận. Vấn đề kèm `Dẫn chứng:` in serif nghiêng — dùng serif đúng chỗ `DESIGN.md:60` cho phép ("dẫn chứng của Editor").

**Cột nhãn tiếng Việt được nới thật.** `globals.css:608-609` ghi rõ 96px chứ không phải 74px của bản mockup vì "Cung, tập 3" bị ngắt hai dòng. Ở cả 1440 và 1024, `Cung, tập 1` nằm một dòng. Luật 2 của `DESIGN.md:81` được thi hành, không chỉ chép lại.

**Số liệu định dạng theo tiếng Việt:** `2.901` (dấu chấm hàng nghìn), `1,2s` (dấu phẩy thập phân), `$0,00`.

---

## 7. Một điều cần đối chiếu lại với chủ thiết kế

**Serif tràn ra ngoài phạm vi `DESIGN.md` cho phép.** `DESIGN.md:60` viết serif "**chỉ** dùng cho văn bản tiểu thuyết — trích đoạn, bản thảo, dẫn chứng của Editor". Đo được `.tavan` là `13px/1.78 var(--serif)` và nó mang:

- `web/components/NhanVat.tsx:103` — mô tả nhân vật
- `web/components/TheGioi.tsx:194` — mô tả phục bút

Cả hai đều **không** thuộc ba loại được liệt kê. Về mặt chữ nghĩa thì không sao (1.78 vượt sàn, có `max-width: 74ch`, có `text-wrap: pretty`), và lập luận "đây là mô tả nội dung tác phẩm" nghe được. Nhưng nó làm loãng chính tín hiệu mà `DESIGN.md:62` nói serif tồn tại để mang: "thấy serif là thấy văn của tác phẩm, không phải chữ của công cụ".

Đây là quyết định của chủ thiết kế, không phải lỗi. Chọn một trong hai: nới câu ở `DESIGN.md:60` để bao gồm mô tả hồ sơ, hoặc đổi `.tavan` sang `var(--ui)`. Đừng để hai tài liệu và code nói khác nhau.

> **✔ ĐÓNG (2026-07-31) — chủ thiết kế đã trả lời, và làm CẢ HAI hướng cho khớp nhau.**
>
> Mục này đề "chọn một trong hai". Kết quả là cả hai, nhất quán:
>
> 1. **`DESIGN.md` được viết rõ ra**, không chỉ nới. Giờ có một **phép thử** (`DESIGN.md:64`): *"chữ này có nằm trong bộ truyện xuất bản không? Có thì serif, không thì `--ui`"* — và một đoạn riêng (`:66`) **loại hẳn** mô tả hồ sơ: *"Chúng là bản ghi của engine về tác phẩm… người đọc truyện không bao giờ thấy chúng; cùng loại với `core_event` của khế ước hay `comment` của bản duyệt."* Tức tài liệu không còn là một danh sách để tra mà là một quy tắc suy được — đúng chỗ mục này lo ("đừng để hai tài liệu và code nói khác nhau").
> 2. **Code đổi theo:** `.nguoi .tavan` (`globals.css:2345`) và `.dsPhucBut .tavan` (`:2503`) giờ là `var(--ui)`. `line-height: 1.78` và `max-width: 74ch` **giữ nguyên** — vì đây vẫn là khổ đọc dài, và sàn 1.78 áp cho khổ đọc dài bất kể họ chữ. Chú thích tại chỗ ghi lại đúng lý lẽ đó.
>
> Lưu ý cho người đọc: `DESIGN.md:60` giờ liệt kê **bốn** mục serif (thêm "tiêu đề chương"), không phải ba như câu trích ở đầu mục này. Ảnh `1440-19-phuc-but.png` chụp **trạng thái cũ** — mô tả phục bút trong ảnh đó còn là serif.

**Một điểm tôi phải nói rõ là do fixture của tôi:** trong ảnh `1440-23`, bảng chương ghi chương 1 có `2.901` từ còn inspector ghi `Số từ 172`. Con số 2.901 lấy từ `chapter_word_counts` trong `progress.json` (seed-demo ghi), 172 là đếm từ bản nháp tôi tự viết. Trong một lượt chạy thật hai số này khớp. **Nhưng** nó phơi ra một chuyện thật: hai con số đến từ hai nguồn khác nhau và không có chỗ nào đối chiếu, nên một lần lệch thật (ví dụ `edit_chapter` sửa nháp mà không cập nhật `progress.json` — xem `internal/tools/edit_chapter.go:162-169`) sẽ hiện ra im lặng như vậy.

---

## 8. Mục lục ảnh

> **Cập nhật 2026-07-31: thư mục giờ có 40 ảnh.** 30 ảnh dưới đây là của **đợt kiểm gốc** — chúng chụp **trạng thái TRƯỚC KHI SỬA** và phải đọc như ảnh lịch sử. Cụ thể, những ảnh này giờ **không còn giống bản đang chạy**: `1440-04`/`1440-06` (§2.1 đã đóng), `1440-05` (§2.2), `1440-21` (§2.3), `1440-15` (§3.1), `1440-20`/`390-03` (§3.2), `1440-13` (§3.3), `390-01` (§3.4), `1440-18` (§4.2), `1440-19` (§7).
>
> 10 ảnh trước/sau của các đợt sửa, tiền tố `fix-`:
>
> | Ảnh | Mục | Dùng cho |
> |---|---|---|
> | `fix-v1-lineheight-1.35-vs-1.72-phong10x.png` | §3.2 | phóng nearest-neighbour ×10 ở DPR 2 — mỗi ô vuông là một điểm ảnh vật lý; thấy chân dấu nặng `ộ` và ngọn `Ầ` dùng chung một điểm ảnh ở 1.35 |
> | `fix-v1-1440-to-san-xuat-sau-1.72.png` | §3.2 | bề mặt Tổ sản xuất sau khi sửa |
> | `fix-v1-1440-ban-thao-truoc-1.45.png` | §3.3 | **trước** — ép 1.45 trên chính bề mặt thật để so |
> | `fix-v1-1440-ban-thao-sau-1.72.png` | §3.3 | **sau** |
> | `fix-v2-390-transport-truoc.png` | §3.4 | **trước** ở đúng 390px — đáy khung mất cả bốn số |
> | `fix-v2-390-transport-sau.png` | §3.4 | **sau** — 3 hàng, cả bốn số trong khung |
> | `fix-v2-1024-transport-sau.png` | §3.4 | 1024px — nhóm số liệu chảy trái (đánh đổi của `.push`) |
> | `fix-v2-1440-transport-sau.png` | §3.4 | 1440px — không đổi một pixel so với đợt kiểm gốc |
> | `fix-v3-1024-to-chan-216-ellipsis.png` | §3.4 | ô `tổ` chặn 216px + ellipsis tên model |
> | `fix-v3-390-canhbao-1.72-dom-bom-tay.png` | §4.8 | `.canhbao li` ở 1.72 — **DOM bơm tay**, không phải trạng thái thật của engine |

Cả 30 ảnh của đợt kiểm gốc, kể cả những ảnh chỉ dùng để chứng minh "chỗ này không có lỗi".

| Ảnh | Bề mặt | Dùng cho |
|---|---|---|
| `1440-01-to-san-xuat.png` | Dòng sản xuất, chưa chọn chương | ảnh nền, inspector rỗng đúng cách |
| `1440-02-inspector-hopdong.png` | Inspector → Hợp đồng | hàng chọn dùng `inset 1px` |
| `1440-03-insp-kiemdinh-rong.png` | Inspector → Kiểm định, rỗng | rỗng đúng cách |
| `1440-04-insp-banthao-trong.png` | Inspector → Bản thảo, rỗng | **§2.1** bảng 2.901 vs "chưa có bản thảo" |
| `1440-05-doc-truyen.png` | sau khi bấm Đọc toàn văn | **§2.2** nút biến mất |
| `1440-06-khu-ban-thao.png` | Đọc bản thảo, chưa có nháp | **§2.1** trạng thái rỗng tự chẩn đoán |
| `1440-07-kiem-dinh.png` | Kiểm định, chưa có bản duyệt | rỗng đúng cách |
| `1440-08-hang-cho-viet-lai.png` | Hàng chờ, rỗng | rỗng đúng cách |
| `1440-09-dan-y.png` | Dàn ý, đầu trang | vân sọc chéo khối chưa mở |
| `1440-10-dan-y-cuoi.png` | Dàn ý, cuối trang | **§5** "Chưa có dàn ý nào trong store" |
| `1440-11-nhan-vat.png` | Nhân vật, rỗng | rỗng đúng cách |
| `1440-12-nhan-vat-co-du-lieu.png` | Nhân vật, có dữ liệu | thẻ tier, cột nhãn |
| `1440-13-doc-ban-thao-co-van.png` | Đọc bản thảo, có văn | **§3.3** + drop cap `Ấ` nguyên dấu |
| `1440-14-doc-ban-thao-cuoi-7chieu.png` | Đọc bản thảo, cuộn hết | **§4.4** cột văn trống |
| `1440-15-kiem-dinh-7chieu.png` | Kiểm định, có bản duyệt | **§3.1** rail 0 vs 7 chiều |
| `1440-16-hang-cho-co-mot.png` | Hàng chờ, có 1 chương | hàng thu gọn |
| `1440-17-hang-cho-mo-rong.png` | Hàng chờ, mở rộng | **§5** mở ra không có lý do |
| `1440-18-luat-the-gioi.png` | Luật thế giới | **§4.2** amber 15,1% |
| `1440-19-phuc-but.png` | Phục bút | ký hiệu 3 trạng thái + serif `.tavan` (**§7**) |
| `1440-20-to-san-xuat.png` | Tổ sản xuất | **§3.2** nhãn phụ 1.35 |
| `1440-21-o-can-thiep-nhat-ky.png` | Nhật ký + Dòng sự kiện + Ô can thiệp | **§2.3** ba chỗ nói ba điều |
| `1440-22-xuong-trong.png` | Xưởng trống @1440 | **§4.10** + nội dung mẫu mực |
| `1440-23-picker-chon-tac-pham.png` | Bộ chọn tác phẩm | **§4.5** hai mục y hệt |
| `1440-24-truc-muc-xem-chuong.png` | Mục xem = Chương | đổi phạm vi bảng, **§4.5** |
| `1024-01-dong-san-xuat.png` | Dòng sản xuất @1024 | inspector bỏ đúng ở 1240 |
| `1024-02-truc.png` | Trục @1024 | cửa sổ chương co còn 1–43 |
| `390-01-dong-san-xuat.png` | Dòng sản xuất @390 | **§3.4** transport cắt, **§4.3** dấu `·` mồ côi |
| `390-02-doc-ban-thao.png` | Đọc bản thảo @390 | drop cap `Ấ` ở 390 |
| `390-03-to-san-xuat.png` | Tổ sản xuất @390 | **§3.2** nhãn phụ ngắt hai dòng |
| `390-04-xuong-trong.png` | Xưởng trống @390 | rail biến mất đúng |

---

## 9. Trả lời thẳng: giao diện này đã dùng được chưa?

> ### ✔ Câu trả lời đã ĐỔI (2026-07-31): **cả ba chỗ chặn đã đóng.**
>
> Phần dưới là **kết luận của đợt kiểm gốc** và không còn đúng. Giữ lại vì nó ghi *vì sao* ba chỗ đó chặn — lý lẽ vẫn còn giá trị, chỉ trạng thái là hết hạn.
>
> **Trạng thái hôm nay, theo ba câu hỏi của `PRODUCT.md`:**
>
> | Câu hỏi | Chỗ từng chặn | Giờ |
> |---|---|---|
> | 1. Dây chuyền còn chạy đúng không? | §2.3 nhịp đập không theo liveness | ✔ đóng — `.st.gold.dap .ky` + `dap={dangChay}` |
> | 2. Chất lượng có tuột không? | §3.1 rail "Kiểm định 0" | ✔ đóng — `Rail.tsx:97` đếm đúng thứ bề mặt liệt kê |
> | 3. Thành quả đọc ra sao? | §2.1 API đọc sai tệp + §2.2 nút biến mất | ✔ đóng cả hai — `noiDungChuong` (kèm trường `nguon`) + nhánh rỗng giữ nút |
>
> Hai chỗ "nên sửa trước khi ai đó vận hành trên điện thoại" cũng đã đóng: transport ở 390px (§3.4) và hai `line-height` 0,31px / 1,62px (§3.2, §3.3).
>
> **Nhưng KHÔNG kết luận là "đã dùng được", vì hai lẽ:**
>
> 1. **Đợt soát này chỉ đọc code, không mở trình duyệt.** Cả ba chỗ chặn đều là lỗi mà **chỉ mở trình duyệt mới thấy** — chính mục §2.3 nói ra điều đó: *"ảnh tĩnh và pytest đều không bắt được một animation nói sai"*. §3.2/§3.3/§3.4 đã được xác minh bằng mắt kèm số đo và ảnh trước/sau; **§2.1, §2.2, §2.3, §3.1 thì chỉ được xác minh bằng đọc code** — code đúng, nhưng **chưa ai chụp lại ba bề mặt đó sau khi sửa**. Muốn nói "dùng được" thì phải chạy lại đợt kiểm bằng mắt.
> 2. **Còn sáu mục §4/§5 chưa đóng** (§4.1, §4.3, §4.4, §4.5, §4.6, §4.10 + hai chỗ câu chữ ở §5), và §4.7 là một quả bom hẹn giờ chưa gỡ. Không mục nào chặn ship, nhưng **§4.5 là sai về dữ liệu, không phải về hình**: hai tác phẩm khác thư mục cùng tên hiện y hệt nhau, và người vận hành có thể mở sai tác phẩm mà không có cách nào biết.
>
> **Việc đúng tiếp theo:** chạy lại một đợt kiểm bằng mắt trên bản hiện tại — có §0 và mục "Bẫy đo bề rộng hẹp" ở §1 thì đợt sau không mất một lượt vì những bẫy đã biết. Thứ tự ưu tiên:
>
> 1. **Ba bề mặt mới: Văn phong · Chi phí · Cài đặt.** Vừa land trong lúc soát tệp này, **chưa ai kiểm bằng mắt lần nào**. Đây cũng là chỗ dễ tái phạm nhất: cả ba tồn tại để hiện số liệu, và §3.4 vừa chứng minh rằng bố cục số liệu **hỏng theo dữ liệu, không theo bề rộng màn hình** — nên phải kiểm với số thật, không chỉ với fixture `—`.
> 2. **Bốn bề mặt của ba chỗ chặn đã sửa** (§2.1, §2.2, §2.3, §3.1) — code đúng nhưng chưa có ảnh nào sau khi sửa. §2.3 đặc biệt: một nhịp đập nói sai chỉ thấy được khi mở trình duyệt.
> 3. **§4.5** — sai về dữ liệu, đáng sửa trước mọi mục §4 còn lại.

---

### Kết luận gốc của đợt kiểm (2026-07-31, đã hết hạn — xem khối trên)

**Chưa — còn ba chỗ làm người vận hành hiểu sai, và cả ba đều nằm đúng vào ba câu hỏi mà `PRODUCT.md` nói người vận hành mở studio để hỏi.**

Nói cho công bằng: đây là một giao diện làm rất tốt. Hệ token khớp thiết kế từng giá trị, tương phản không sai một chỗ nào trên cả ba bề rộng, ba luật tiếng Việt được thi hành thật chứ không chép lại, danh sách CẤM không bị vi phạm chỗ nào, trạng thái rỗng ở hầu hết bề mặt nêu được cả nguyên nhân lẫn cách sửa, và ô can thiệp vô hiệu là hình mẫu về trung thực. Bố cục ở 1440 và 1024 gần như không có gì phải nói. Người viết nó rõ ràng đã đọc `PRODUCT.md` và `DESIGN.md`, không chỉ nhìn ảnh mockup.

Nhưng ba chỗ này chặn:

1. **"Dây chuyền còn chạy đúng không?"** — Nhịp đập vẫn đập trên hàng `đang soạn bản thảo` sau khi engine đã dừng, trong khi transport ghi `đang nghỉ` và thanh trên ghi `0 đang chạy` (§2.3). Engine chết đọc ra thành khỏe. Đây đúng là thứ mà `PRODUCT.md:27` đặt làm tiêu chí thành công, và cũng đúng là thứ chỉ mở trình duyệt mới thấy — ảnh tĩnh và pytest đều không bắt được một animation nói sai.

2. **"Chất lượng có tuột không?"** — Rail ghi `Kiểm định 0` trong khi bề mặt có bản duyệt 7 chiều với một vấn đề severity `error` (§3.1). Người vận hành đọc "0" rồi đi qua.

3. **"Thành quả đọc ra sao?"** — Không đọc được. Chương đã nghiệm thu hiện "chưa có bản thảo" vì API đọc bản nháp thay vì bản chốt (§2.1), và nút "Đọc toàn văn chương" bấm xong thì tự biến mất không để lại đường quay lại (§2.2).

Ba lỗi này sửa nhỏ: một nhánh fallback trong `drafts.go`, một class `dap` truyền vào `BangChuong`, một cách đếm trong `Rail.tsx`, một nhánh rỗng trong `Inspector.tsx`. Không có gì phải làm lại về kiến trúc hay thiết kế.

Sau ba lỗi đó, hai chỗ nữa nên sửa trước khi ai đó thật sự vận hành trên điện thoại: transport ở 390 đẩy hết giá thành và năng suất ra ngoài khung (§3.4), và hai `line-height` mà khe mực xấu nhất còn 0,31px và 1,62px (§3.2, §3.3) — hôm nay chưa chạm dấu, nhưng tiêu đề chương do mô hình đặt nên ca xấu nhất chỉ là chuyện thời gian.
