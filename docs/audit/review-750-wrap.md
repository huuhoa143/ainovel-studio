# Soát đối kháng 750 chuỗi bọc `i18n.F` (commit `1bebe2e`)

## 1. Kết luận một dòng

**An toàn về cơ chế bọc — cần sửa chọn lọc 1 chỗ (+1 test phòng ngừa, +1 chuỗi thiếu dịch),
KHÔNG cần hoàn nguyên gì.** Nhưng phép
kiểm chứng ghi trong commit message ("28/29 package ok") chứng minh ít hơn nhiều so với
những gì nó nghe như đang chứng minh, và bug thật duy nhất tôi tìm được thuộc **lớp ngược
lại** với lớp bạn đã tự soát: không phải "bọc nhầm chuỗi dữ liệu", mà là **"bỏ qua nhầm
chuỗi nội dung"** trong 654 chuỗi bị script skip.

---

## 2. Phép thử `AINOVEL_LANG=vi` — tiền đề của bạn SAI

### 2.1 `AINOVEL_LANG=vi` KHÔNG vô hiệu hóa ghim zh

Đây là điều cần sửa trước mọi thứ khác. Bạn viết: *"Biến môi trường này ép locale vi, vô
hiệu hóa mọi ghim zh."* Không đúng. Cả 14 file ghim đều có dạng:

```go
func init() { _ = i18n.SetLocale(i18n.Chinese) }
```

Theo thứ tự khởi tạo của Go, package được import (`i18n`) init xong **trước** package
importing. Nên `i18n.init()` đọc `AINOVEL_LANG=vi` → đặt vi, rồi `init()` trong file ghim
chạy **sau** và đặt lại zh. **Ghim luôn thắng biến môi trường.**

Bằng chứng thực nghiệm, không chỉ suy luận từ spec:

```
AINOVEL_LANG=vi go test -count=1 ./...     → 29/29 ok, exit 0
```

Xanh toàn bộ. Đó không phải tin tốt — đó là phép thử **không chạy** ở 14 package ghim.
Cộng thêm: lần chạy đầu tôi làm mà không có `-count=1` thì mọi dòng đều là `(cached)`,
nên nếu chỉ chạy lệnh bạn đưa và thấy xanh, kết luận rút ra sẽ hoàn toàn vô căn cứ.

### 2.2 Phép thử thay thế: overlay gỡ ghim (không sửa file nào trong repo)

Vì tôi không được sửa file, tôi dùng `go test -overlay` — thay nội dung file ở tầng build,
file trong repo nguyên vẹn. Overlay đặt ở `/tmp/i18naudit/nopin.json`, map 14 file ghim về
`""` (không tồn tại):

```
AINOVEL_LANG=vi go test -count=1 -overlay=/tmp/i18naudit/nopin.json ./...
```

**Kết quả: 13/14 package ghim chuyển ĐỎ — 67 test fail.** Chỉ `agents/ctxpack` còn xanh
(nó đã có `restore_locale_test.go` kiểm đường vi riêng).

| Package | Fail | Package | Fail |
|---|---|---|---|
| `internal/host` | 9 | `internal/host/exp` | 6 |
| `internal/host/imp` | 11 | `internal/flow` | 11 |
| `internal/eval` | 5 | `internal/diag` | 2 |
| `internal/arbiter` | 2 (+3 subtest) | `internal/tools` | 7 |
| `internal/userrules` | 2 | `internal/rules` | 1 |
| `internal/llmcontract` | 1 | `internal/host/sim` | 1 |
| `internal/store` | 0 (xanh) | `internal/agents/ctxpack` | 0 (xanh) |

### 2.3 Phân loại 67 ca: **100% là "assert chốt chữ Trung", 0 lỗi thật**

Tôi soát từng ca. Kết quả trung thực: **không ca nào là lỗi sản phẩm.** Nhưng ba nhóm
không hiển nhiên, phải truy tận gốc mới kết luận được — và nếu đọc vội thì cả ba đều
*trông như* lỗi thật:

**a) 4 ca ở `internal/host` báo `completed=[]` — engine viết ZERO chương.**
Đây là ca đáng sợ nhất vì nó là failure *hành vi*, không phải lệch chuỗi:

```
engine_test.go:285: 一个许可必须恰好只稳定一个新章: []
engine_test.go:370: 两章写满应完本, got phase=writing completed=[]
engine_test.go:804: 返工队列应已排空, got [1]
engine_test.go:531: 补裁后应派发规划师并回显补齐事件, dispatched=true healed=false
```

Nguyên nhân là **test fake**, không phải sản phẩm — `internal/host/engine_test.go:141`:

```go
var chapterRe = regexp.MustCompile(`写第 (\d+) 章`)
```

`scriptedWriterModel` bóc số chương từ task điều phối bằng regex tiếng Trung. Router giờ
phát "Viết chương 4" → không khớp → `chapter = 0` → `plan_chapter(chapter=0)` bị tool từ
chối → không có gì commit → `completed=[]`. Model thật (LLM) đọc "Viết chương 4" bình
thường; chỉ con fake là mù.

**b) `internal/tools` `TestContextToolInjectsStyleStats` báo `Patterns:[]`.**
Cũng là failure dữ liệu, cũng không phải lỗi. `internal/stylestat/stylestat.go:185` đã
locale-aware thật sự — `if i18n.Active() == i18n.Chinese` chọn bảng mẫu zh, ngược lại dùng
`viPatternDefs` (stylestat.go:113). Fixture là văn Trung + bảng mẫu vi → 0 mẫu. **Đúng
hành vi mong muốn**, test chỉ chưa biết điều đó.

**c) `internal/host/exp` — nghi vấn round-trip xuất/nhập, đã loại.**
Exporter giờ ghi `Chương 1  雨夜归人` xuống đĩa, mà `exp/txt.go:61` có
`chapterHeaderRe = ^#+\s+第.+?章`. Nghe như xuất rồi nhập lại là vỡ. Nhưng không: agent
trước đã thêm `chapterHeaderViRe` (txt.go:70-82) và `isChapterTitleLine` dò **cả hai**.
Tương tự `internal/store/session.go:153-156` có cả `chapterRe` và `chapterViRe` cho việc
đặt tên file log phiên. Lớp này đã được xử lý tử tế, kèm ghi chú lý do.

**d) Hai ca đếm-ra-0 còn lại, truy tận gốc: cũng là test.**
Đây là hai ca duy nhất khác ngoài (a) và (b) mà thông báo lỗi là **số đếm**, nên tôi không
xếp loại theo mẫu mà mở test ra đọc:

- `internal/host/imp/segment_test.go:449` đếm ghi chú cắt bằng
  `if strings.Contains(s, "裁掉") { clipNotes++ }` — dò chữ Hán trong thông báo tiến độ. Ở
  vi thành 0. Chốt rằng sản phẩm vẫn đúng: assert ngay phía trên nó
  (`len(seg.Chapters) != len(chunks)`) **đã đậu**, tức logic cắt biên vùng ngữ cảnh chạy
  đúng; chỉ phép đếm của test là mù.
- `internal/userrules/normalize_test.go:188` đặt `sawHint` bằng
  `strings.Contains(text, "JSON Schema") && strings.Contains(text, "错误：")`. Ở vi prompt
  sửa lỗi ghi "Lỗi:" → `sawHint=false`. Cũng chốt được sản phẩm đúng: hai assert phía trên
  (`ForbiddenPhrases` parse ra 1 mục, `model.calls == 2`) **đã đậu**, tức cơ chế hỏi lại
  kèm phản hồi lỗi vẫn hoạt động.

Còn lại 60 ca là dạng thẳng: test `Contains("运行中")` / `expected '写第 4 章'` trong khi
sản phẩm phát ra đúng câu tiếng Việt tương ứng. Sản phẩm đúng, test chốt chữ Trung.

> **Hệ quả cần ghi nhận:** 13 package đang có ghim = 13 package **chưa từng** được kiểm ở
> đường tiếng Việt. Ghim không sai (lý do giảm diff rebase là chính đáng, và
> `ctxpack` đã làm mẫu tốt: ghim + file `*_locale_test.go` riêng kiểm đường vi). Cái sai là
> coi "28/29 ok" là bằng chứng đường vi lành.

---

## 3. Bảng phát hiện có mức độ

| # | Vị trí | msgid / đối tượng | Vấn đề | Đề xuất | Mức độ |
|---|---|---|---|---|---|
| 1 | `internal/rules/snapshot.go:187-192` | `FatigueWords` (16 khóa map) | **Kiểm từ gây mỏi CHẾT ÂM THẦM ở locale vi.** `ForbiddenPhrases` (slice) được bọc → thành tiếng Việt; `FatigueWords` (khóa map) bị script skip → còn tiếng Trung. Cả hai đều so khớp **chuỗi con literal với văn bản sinh ra**. Văn tiếng Việt không bao giờ chứa `不禁`/`竟然`/`仿佛` → 16 ngưỡng này vô hiệu hoàn toàn. Bản dịch **đã có sẵn trong catalog** và không được dùng — đúng lớp bug mà commit này sinh ra để sửa. | Làm như `stylestat` đã làm: bảng `viFatigueWords` chọn theo `i18n.Active()`. KHÔNG bọc khóa map bằng `i18n.F` (sẽ đóng băng + lệ thuộc thứ tự init). | **NGHIÊM TRỌNG** |
| 2 | `internal/host/host.go:1546` | `i18n.F("导入")` → `"nhập khẩu"` | Dịch sai ngữ vực. Đây là "nhập truyện/nhập sách" (quy trình), không phải nhập khẩu thương mại. Chuỗi này ghép vào câu khoá độc quyền: *"Đang nhập khẩu, hãy hoàn tất rồi mới nhập khẩu"*. Người dùng thấy trực tiếp. | ~~Sửa catalog `导入` → `nhập truyện`~~ | ~~CẦN SỬA~~ → **ĐÃ HẾT** (xem ghi chú) |
| 3 | `internal/tools/*` (1 msgid) | `注意返回值是 JSON 字符串，\n 须还原为真实换行。draft_chapter 改写过草稿后…` | 1/717 msgid vừa bọc **không có bản dịch** → mô tả tool gửi cho LLM còn tiếng Trung lẫn giữa các mô tả tiếng Việt khác. Không chết chức năng (LLM đọc được), nhưng là chỗ duy nhất lệch. | Dịch bổ sung vào `vi.json`. | **NHỎ** |
| 4 | `internal/agents/guard/subagent_guards.go:170,173` | `strings.Contains(task, "卷摘要")` / `"弧摘要"` | Code **sản phẩm** phân nhánh theo chuỗi task tiếng Trung. Hiện **còn chạy đúng nhờ may**: nhánh `\|\|` đầu khớp tên tool (`save_volume_summary`), và bản dịch vi của task router tình cờ vẫn giữ nguyên phần `(save_volume_summary)`. Nếu ai đó gọt bản dịch cho gọn và bỏ phần trong ngoặc, guard tụt về nhánh `default` nới lỏng → editor được phép kết thúc mà chưa lưu tóm tắt cung → tái hiện livelock `outline-exhaustion`. Không test nào bắt. | Giữ nguyên logic, nhưng thêm test bất biến: task do `flow.Route` sinh cho tóm tắt cung/tập PHẢI chứa tên tool, ở mọi locale. | **CẦN SỬA** (phòng ngừa) |

> **Ghi chú về đo đạc đồng thời (quan trọng khi đọc lại báo cáo này):**
> `internal/i18n/locales/vi.json` đang được một agent khác sửa **trong lúc** tôi soát. Mọi
> số liệu catalog ở đây là ảnh chụp lúc `2026-07-30 ~23:0x` (catalog 1.786 mục). Khi tôi
> kiểm lại lần cuối lúc `23:11` thì catalog đã lên **1.815 mục** và phát hiện #2 **đã được
> sửa xong** — `导入` giờ là `nhập truyện`, đúng như đề xuất. Tôi để #2 lại trong bảng thay
> vì xóa, vì nó là bằng chứng cho một lớp lỗi còn sống (dịch sai ngữ vực ở chuỗi ghép vào
> câu khác), và vì lượt soát chất lượng câu chữ vẫn chưa được làm (mục 5).
> Phát hiện #1 tôi đã xác nhận lại trên trạng thái file hiện tại: **vẫn còn nguyên**.

### Những lớp tôi soát và thấy SẠCH (nói cho công bằng)

Tôi không muốn tìm lỗi cho có. Các lớp sau tôi kiểm có bằng chứng và chúng lành:

- **Hợp đồng schema/enum gửi LLM (hướng 2 của bạn) — sạch.** Đối chiếu 33 token máy
  (`accept`/`polish`/`rewrite`, `met`/`partial`/`missed`, `planted`/`advanced`/`resolved`,
  tên 15 tool, `front_matter`, `crisis`, `quest`…) qua **toàn bộ 1.786 bản dịch**: chỉ 1 ca
  mất token, là `共 %d 次评审，%d 次 rewrite` → `…%d lần viết lại` ở
  `internal/diag/rules_quality.go:199` — chuỗi **hiển thị thống kê**, không phải schema.
  Vô hại. Không giá trị enum nào bị bọc (`grep 'Enum:.*i18n.F'` = 0).
- **Khóa log / trường máy — sạch.** 66 lời gọi `slog.*` có `i18n.F`, không lời nào bọc vị
  trí **khóa**. `Category`/`Level`/`Kind`/`Source`/`Step`/`ID` không chỗ nào gán bằng
  `i18n.F` (= 0 hit). Output thực tế chứng thực: `Source:delta:stylestat`,
  `Kind:review_lesson`, `category=SYSTEM`, `module=engine` đều nguyên vẹn ở locale vi.
- **Đóng băng biến cấp gói (hướng 5) — sạch, đếm độc lập.** Đúng **4** ca, tất cả ở
  `internal/agents/ctxpack/restore.go:119-122`, tất cả có ghi chú đánh đổi, và có
  `restore_locale_test.go` chốt chúng. Không ca nào không được ghi chú. Lý do đứng vững:
  `i18n` được import nên init xong trước, còn `/lang` lúc chạy thì 4 prompt nén này không
  đổi — đánh đổi đã nêu rõ trong comment.
- **Hợp đồng code ↔ `assets/` (hướng 3) — ca đã biết còn khớp.** `engine.go:716` phát
  `"Can thiệp gốc của người dùng (nguồn thẩm quyền duy nhất cho lần sửa này; …"` và
  `assets/prompts/editor.md:13` dặn `Khi nhiệm vụ có kèm "Can thiệp gốc của người dùng"`.
  Hai đầu khớp. Tôi quét thêm 320 chuỗi trong ngoặc kép ở `assets/**/*.md` không tìm thấy
  trong code/catalog — soát tay thì **toàn bộ là ví dụ văn xuôi** trong tài liệu tham khảo
  (`dialogue-writing.md`, `anti-ai-tone.md`…), không phải nhãn hợp đồng. Không phát hiện.
- **Tiền tố `[session_compact:`** — không bị bọc, `HasPrefix(CompactTag)` ở
  `store/session.go` và `diag/redact.go` còn nguyên.
- **Độ phủ dịch của 750 chuỗi vừa bọc — 716/717 (99,86%).** Chỉ 1 msgid thiếu (mục #3).

---

## 4. Lớp lỗi bạn CHƯA nghĩ tới mà tôi tìm ra

Đây là phần bạn nói cần nhất, nên tôi tách riêng và nói thẳng.

### 4.1 Lớp NGƯỢC: 654 chuỗi bị script bỏ qua chưa hề được ai soát

Cả sáu hướng bạn đưa, và cả phép tự kiểm 21-ca của bạn, đều soi **một chiều**: *"chuỗi nào
bị bọc mà lẽ ra không nên bọc"*. Không hướng nào soi chiều còn lại: **"chuỗi nào bị bỏ qua
mà lẽ ra PHẢI bọc"**.

Đó là điểm mù có hệ thống, vì luật skip của script (`case`/`==`/`HasPrefix`/`regexp`/**khóa
map**) là luật **cú pháp**, còn "dữ liệu hay nội dung" là phân biệt **ngữ nghĩa**. Khi hai
thứ lệch nhau, script bỏ qua đúng theo luật của nó mà vẫn sai.

Phát hiện #1 chính là ca đó, và nó tệ hơn một lỗi bỏ sót thường:

```go
// internal/rules/snapshot.go:186-192
ForbiddenPhrases: []string{i18n.F("某种程度上"), i18n.F("值得注意的是"), …},  // slice → ĐƯỢC bọc
FatigueWords: map[string]int{
    "不禁": 1, "竟然": 1, "仿佛": 2, "此外": 1, "然而": 2, …            // khóa map → BỊ bỏ qua
},
```

Hai danh sách **cạnh nhau**, cùng một mục đích (baseline máy dò giọng AI), cùng cách dùng
(so khớp literal với văn bản sinh ra), nhưng khác cấu trúc Go — nên một cái được việt hóa,
một cái không. Chính lượt bọc này tạo ra sự bất đối xứng đó: trước commit cả hai đều tiếng
Trung (nhất quán, cùng chết ở vi); sau commit một nửa sống, một nửa chết.

Ba dữ kiện chốt rằng đây là gap thật, không phải chủ ý:

1. **Bản dịch của cả 16 từ đã nằm trong `vi.json`** (`不禁`→`không khỏi`,
   `几息`→`vài nhịp thở`, `沉默了`→`lặng đi`…) và không được gọi.
2. **Phía assets đã việt hóa xong** — `assets/voice.md:13` và
   `assets/references/anti-ai-tone.md:17` đã liệt `'mấy nhịp thở / vài nhịp thở'`,
   `'một tia'`, `'một nét'`. Nên ý định việt hóa lớp này là rõ ràng; chỉ phía code chưa theo.
3. **Dự án đã có khuôn mẫu đúng cho đúng bài toán này**: `internal/stylestat/stylestat.go`
   giữ hai bảng mẫu (`patternDefs` zh + `viPatternDefs`) và chọn theo `i18n.Active()`.
   `rules/snapshot.go` chưa được áp khuôn đó.

Comment ngay trên chỗ đó nói ngưỡng các từ này rút từ **thực chứng 196 chương**. Toàn bộ
phần tinh chỉnh ấy hiện vô hiệu với đầu ra tiếng Việt, không log, không test, không triệu
chứng.

**Đề xuất về quy trình:** soát lại 654 chuỗi bị skip với câu hỏi *"chuỗi này so khớp với
văn bản do MODEL sinh ra / do NGƯỜI DÙNG nhập, hay so với hằng số của chính code?"* Nếu là
loại đầu thì nó là **nội dung theo ngôn ngữ tác phẩm** và cần bảng theo locale — không phải
dữ liệu bất biến. `wrap_display.py` không tự phân biệt được; việc này phải làm bằng mắt.

### 4.2 Bộ kiểm chứng có thể tự cho điểm mình bằng cách... không chạy

Lớp thứ hai, về phương pháp: `AINOVEL_LANG=vi` (mục 2.1) là một phép thử **thất bại im
lặng theo hướng "đậu"**. Nó xanh vì không chạy, mà xanh-vì-không-chạy trông y hệt
xanh-vì-đúng. Cộng với cache của `go test` (lần chạy đầu của tôi: 100% `(cached)`), rất dễ
báo cáo một bằng chứng rỗng mà vẫn hoàn toàn thật thà.

Cách sửa: `-count=1` bắt buộc, và một cổng cấu trúc — **package nào có
`i18n_locale_pin_test.go` thì phải có file `*_locale_test.go` kèm theo** (khuôn `ctxpack`
đã làm). Kiểm được bằng một test đếm file, rẻ hơn nhiều so với gỡ ghim.

### 4.3 Hợp đồng "may mà đúng" (#4)

Không phải lớp mới hoàn toàn, nhưng khác sắc thái với hướng 1 của bạn: `subagent_guards.go`
không đọc chuỗi *dữ liệu*, nó đọc chuỗi **do một module khác sinh ra và dịch**. Nó đúng
hôm nay chỉ vì bản dịch tình cờ giữ lại tên tool trong ngoặc. Bất biến ấy chưa được ghi
thành test nên lần sửa văn phong tiếp theo có thể phá nó — và triệu chứng sẽ là livelock,
không phải một dòng lỗi.

---

## 5. Số liệu

| Hạng mục | Số |
|---|---|
| Chuỗi bọc trong `1bebe2e` | 750 điểm / 75 file |
| msgid tiếng Trung phân biệt được bọc mới (bóc từ diff) | 717 |
| Soát tự động toàn bộ 717 (độ phủ dịch, token máy, verb, vị trí khóa) | 717 / 717 |
| Soát tay tại chỗ gọi | ~90 (mọi ca nổi lên từ 67 test đỏ + 28 ca nghi ghép chuỗi + toàn bộ schema/enum/log) |
| Test đỏ khi gỡ ghim | 67 (13/14 package) |
| Trong đó là lỗi thật | **0** |
| Trong đó là assert chốt chữ Trung | 67 |
| Phát hiện NGHIÊM TRỌNG | 1 (#1, thuộc lớp *bỏ qua nhầm*, không phải *bọc nhầm*) |
| Phát hiện CẦN SỬA | 2 (#2 — đã được agent khác sửa lúc 23:11; #4 phòng ngừa) |
| Phát hiện NHỎ | 1 (#3) |
| Còn phải làm sau báo cáo này | #1, #3, #4 + lượt soát verb-order và lượt đọc chất lượng câu chữ |

### Phần KHÔNG soát, và vì sao

- **Chất lượng câu chữ của 717 bản dịch.** Tôi chỉ kiểm bất biến máy (token, verb, khóa),
  không đọc thẩm định văn phong từng câu. Ngoại lệ: #2 lộ ra vì nó xuất hiện trong output
  test. Có thể còn lỗi ngữ vực cùng loại — cần một lượt đọc riêng của người biết tiếng Việt.
- **Trật tự tham số của ca ≥2 verb cùng kiểu (hướng 4).** Tôi chạy
  `review_ambiguous.py --with-sites` và đọc danh sách nó in ra; các cặp zh/vi hiện lên đều
  giữ đúng thứ tự (`%d/%d`, `$%.2f`…`$%.2f`, `%d chương, tổng %d chương`). Nhưng tôi
  **không** mở từng chỗ gọi để đối chiếu thứ tự tham số thật — bạn đã tìm được 4 ca đảo
  trước đây nên lớp này có tiền lệ, và nó vẫn là lỗ hổng lớn nhất còn lại trong lượt soát
  này. Nên giao riêng một lượt.
- ~~Hai ca `TestSegmentClipsContextBoundaries` và `TestNormalize_FeedbackRetryRecovers`~~ —
  đã truy xong, xem 2.3(d) bên dưới. Không còn ca nào bỏ lửng.
- **Chạy thật ứng dụng ở locale vi.** Toàn bộ báo cáo dựa trên test + phân tích tĩnh. Bug
  #1 (từ gây mỏi chết âm thầm) đúng là loại **chỉ hiện ra khi chạy thật** và sẽ không bao
  giờ làm test nào đỏ.

---

## Phụ lục: tái lập phép thử gỡ ghim

Overlay không sửa file nào trong repo:

```bash
cd ~/Personal/ainovel-cli
python3 - <<'EOF'
import json, os, subprocess
root = os.getcwd()
files = subprocess.check_output(["git","ls-files","*i18n_locale_pin_test.go"], text=True).split()
json.dump({"Replace": {os.path.join(root,f): "" for f in files}},
          open("/tmp/i18naudit/nopin.json","w"), indent=1)
EOF

AINOVEL_LANG=vi go test -count=1 -overlay=/tmp/i18naudit/nopin.json ./...
```

`-count=1` là bắt buộc: không có nó, `go test` trả `(cached)` cho cả 29 package.
