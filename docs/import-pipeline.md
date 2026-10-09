# Đường ống nhập truyện ngoài bằng biên dịch ngữ nghĩa

> **2026-10-08 — chỉ còn app desktop.** TUI và headless đã gỡ. Chỗ nào bên dưới nhắc panel TUI, `/import`, `--yes`, `--guide` hay `tui.log` là mô tả lúc viết; đường ống không đổi, còn cửa vào trên app là khu **Xuất bản & nhập → Nhập truyện có sẵn** của studio (đối chiếu cách chia, gợi ý cách chia, tự chốt cách chia). Log riêng `<gốc sách>/logs/import.log` vẫn giữ.

> Trạng thái: đã hiện thực (v1, `internal/host/imp`; phần vớt tiền tố khi bị cắt gồm giai đoạn ba·bù)
> Ngày: 2026-07-15
> Mục tiêu: để việc nhập truyện ngoài vừa liên tục hưởng được lợi ích từ việc nâng cấp năng lực model, vừa có bảo đảm kỹ thuật là không mất chữ nào của toàn văn, thất bại thì chẩn đoán được, sập thì khôi phục được và việc phát hành thì kiểm chứng được.
> Bản sửa: thứ tự SourceUnit theo thứ tự số của `(Line, Part)` (§7.3/§8.3); việc vớt tiền tố khi bị cắt hạ xuống thành tối ưu hiệu năng có thể để lại sau và bắt buộc phải quan sát được (§9.5/§13.3/§19); bậc model của các hàm ngữ nghĩa mở thành núm điều chỉnh (§13.1/§17).
> Bản sửa 2026-07-16: núm bậc model đáp đất thành cấu hình roles `import_segment/import_analyze/import_synthesize` (§13.1); việc chia lại bằng ngôn ngữ tự nhiên đáp đất thành `--guide` và `guidance.txt` trong khu làm việc làm đầu vào ngữ nghĩa (§18.3); thất bại ngữ nghĩa thì lưu thống nhất phản hồi thô vào failures/ (§14.2); việc xác nhận cách chia hỗ trợ bấm `y` trong panel để mở đường một lần (§8.4); phần nhập chưa xong thì chủ động nhắc lúc khởi động (§18.2). Chế độ JSON Schema (§13.2 cấp 1) tạm chưa hiện thực, gắn cờ TODO chờ cải tạo thống nhất cùng các điểm gọi model khác trong cả repo.

## 1. Một câu

Việc nhập không phải là "dùng regex cắt văn bản, rồi để model nhả một lần ra JSON cả cuốn sách", cũng không phải một Import Agent chạy tự do; nó là một **đường ống biên dịch ngữ nghĩa theo giai đoạn**:

> Model chịu trách nhiệm hiểu phần ngữ nghĩa mở, code chịu trách nhiệm về tọa độ, độ bao phủ, kiểu, băm, thứ tự và tính bất biến; toàn bộ sản phẩm ngữ nghĩa phải kiểm chứng xong trong một khu làm việc độc lập rồi mới phát hành sang trạng thái sách chính thức.

```text
Văn bản ngoài
  → đọc và chuẩn hóa tất định
  → LLM nhận biên chương/tập/văn bản phụ thuộc
  → code kiểm chứng độ bao phủ toàn văn
  → người dùng xác nhận cách chia (có thể cấp quyền tường minh để tự nhận)
  → LLM trích sự thật từng chương theo các lô chương liên tiếp
  → LLM tổng hợp ngữ nghĩa cả sách theo tầng
  → code lắp và kiểm chứng Foundation
  → phát hành Foundation và các chương một cách bất biến
  → mặc định tạm dừng một lần; chỉ khi có `--continue` tường minh thì mới tiếp sức theo cửa gác bình thường
```

## 2. Vì sao buộc phải tái cấu trúc

Bản hiện thực hiện tại là:

```text
regex cắt chương
  → toàn bộ chính văn các chương đưa một lần vào ReverseFoundation
  → model xuất một lần ra premise / characters / world_rules / dàn ý chương toàn phần / compass
  → ghi ngay vào Foundation chính thức
  → rồi lại đọc từng chương cùng chính văn đó, phân tích và commit
```

Nó có bốn vấn đề mang tính cấu trúc.

### 2.1 Việc cắt chương đang liệt kê ngữ nghĩa mở

Tiêu đề chương không có cú pháp đóng. Cứ thêm regex kiểu "Chương N", "Tập N", "Chapter N" thì chỉ bao phủ được những định dạng đã gặp, không bao phủ được tiêu đề tự định nghĩa của tác giả, cách trình bày lai, phân cấp tập-chương và các định dạng tương lai.

Nghiêm trọng hơn, cách chia hiện tại sẽ làm những biên không trúng biến mất luôn khỏi kết quả, và có thể âm thầm bỏ mất phần văn bản trước tiêu đề đầu tiên, các chương rỗng và những nội dung bị phán là tiếng ồn ở đuôi. Code không chứng minh nổi rằng những nội dung đó đáng bị bỏ.

### 2.2 Đầu vào và đầu ra của lời gọi Foundation đều tăng tuyến tính theo số chương

`ReverseFoundation` đồng thời gánh việc hiểu cả sách và sinh dàn ý chương toàn phần: đầu vào chứa toàn bộ chính văn, đầu ra chứa kết cấu chi tiết của từng chương. 54 chương đã có thể làm JSON bị cắt; nâng `max_tokens` chỉ đẩy điểm thất bại sang những cuốn dài hơn.

### 2.3 Trạng thái chính thức đã bị sửa trước khi thất bại

Foundation và các chương thì vừa phân tích vừa phát hành. Khi các bước sau thất bại, cái người dùng nhận được là một trạng thái sách chính thức nửa nhập xong, nửa chưa phân tích. `from=N` hiện tại chỉ là giả định người dùng biết phải khôi phục từ đâu, không chứng minh nổi rằng tệp nguồn, kết quả chia và các chương đã có vẫn còn nhất quán.

### 2.4 Nhiều kết luận ngữ nghĩa bị đóng cứng

Phương án hiện tại còn cố định rằng:

- chính văn nhập vào chỉ có thể là một tập;
- chỉ được chia thành 1~3 cung;
- chọn short/mid/long theo ngưỡng 25/80 của số chương đã nhập;
- để cho phép viết tiếp thì nghiêng về việc cố tạo ra `open_threads`;
- mỗi chương buộc phải có nhân vật, số lượng sự kiện cố định và loại móc cố định.

Những cái này đều không phải sự thật chứng minh máy móc được từ định dạng tệp, mà nên do model phán theo chính văn, hoặc do người dùng biểu đạt ý định tường minh.

## 3. Mục tiêu và phi mục tiêu

### 3.1 Mục tiêu

1. **Định dạng mở thì hiểu được**: không đòi người dùng sửa tiểu thuyết của mình sang định dạng tiêu đề dựng sẵn, cũng không đòi người dùng viết regex.
2. **Toàn văn trình bày được**: mọi đoạn văn bản nguồn không rỗng đều buộc phải thuộc về một chương hoặc một vùng phụ thuộc rõ ràng, cấm mất im lặng.
3. **Quy mô kiểm soát được**: không còn một lời gọi đọc chính văn cả sách rồi xuất ra mọi đối tượng chương; việc chia đoạn, lô chương theo ngân sách đôi và việc tổng hợp theo khoảng đều có biên đầu vào-đầu ra cục bộ, còn đầu ra toàn cục chỉ tăng theo độ phức tạp ngữ nghĩa thật như nhân vật, tập cung.
4. **Thất bại không làm ô nhiễm**: trước khi việc phân tích ngữ nghĩa và kiểm Foundation xong thì không ghi trạng thái sáng tác chính thức.
5. **Khôi phục chính xác**: việc khôi phục dựa vào ảnh chụp nguồn và `InputDigest` của hiện vật, không dựa vào `from=N` hay ký ức của người dùng.
6. **Phần lợi từ model đến trực tiếp**: model mạnh hơn thì cải thiện luôn việc nhận biên, trích sự thật, chia tập cung và phán việc viết tiếp, không cần thêm luật Go.
7. **Dùng lại ngữ nghĩa nộp chính thức**: việc phát hành chương tiếp tục dùng năng lực PendingCommit, checkpoint và bất biến theo digest của `commit_chapter`.
8. **Quan sát được đầy đủ**: tiến độ, danh tính model, lượng dùng, phản hồi thất bại thô và lỗi cuối cùng đều có chỗ rơi rõ ràng.
9. **Tương tác và tự động cùng tồn tại**: mặc định để người dùng xác nhận các biên ngữ nghĩa rủi ro cao, đồng thời cung cấp phép cấp quyền không người trực một cách tường minh; đường tự động không dựa vào việc đoán im lặng.

### 3.2 Phi mục tiêu

- Không dựng Coordinator hay vòng lặp dài Agent tổng quát.
- Không dựng framework Workflow/PolicyEngine/đồ thị tác vụ tổng quát.
- Không tự sửa hay viết lại nguyên văn của người dùng.
- Không hiện thực cơ sở dữ liệu, truy hồi vector hay song song phân tán cho việc nhập.
- Không hỗ trợ việc gộp mờ một cuốn tiểu thuyết khác vào sách đã có.
- Không hiện thực việc di trú trạng thái `from=N` cũ hay tương thích hai đường.
- Không mở rộng EPUB/PDF trong RFC này; bản đầu vẫn chỉ nhận txt/md, tầng đọc giữ cục bộ, sau này thay được mà không đổi các hợp đồng phía sau.

## 4. Biên trách nhiệm

| Câu hỏi | Thuộc về | Lý do |
|---|---|---|
| Giải mã byte, chuẩn hóa ký tự xuống dòng | Go | Định dạng tệp và chuyển đổi tất định |
| Vị trí nguồn nào là tiêu đề chương, tiêu đề tập hay văn bản phụ thuộc | LLM | Ngữ nghĩa mở, không liệt kê hết được |
| Tiêu đề ứng với vị trí nguồn ổn định nào | Go | SourceUnit, mốc neo nguyên văn và dải byte kiểm chứng máy móc được |
| Chương nào đã xảy ra chuyện gì | LLM | Hiểu ngữ nghĩa văn học |
| Nhân vật, luật thế giới, phục bút và quan hệ quy nạp thế nào | LLM | Quy nạp ngữ nghĩa xuyên chương |
| Biên tập cung, truyện có thu về chưa, cấp quy hoạch | LLM | Tùy hình dạng tự sự, không tùy ngưỡng cố định |
| Dải chương có tăng dần, không chồng lấn, bao phủ hết không | Go | Bất biến chứng minh được |
| Kiểu JSON, enum tập đóng, số chương tham chiếu có hợp pháp không | Go | Hợp đồng có kiểu |
| Có dùng lại được phần phân tích đã có không | Host/Workspace | Đầu vào ngữ nghĩa thật dựng lại được cùng `InputDigest` thì mới dùng lại được |
| Khi nào thì ghi trạng thái sách chính thức | Host/Store | Giao thức phát hành và khôi phục sau sập |
| Có cấp quyền tiếp tục theo cách chia hiện tại không | Người dùng/Intent | Xác nhận tương tác hoặc `--yes` tường minh, không để code âm thầm trả lời thay |

Các lời gọi LLM ở đây không phải mặt điều khiển Arbiter, cũng không phải vòng lặp sáng tác của Worker. Chúng là các **hàm ngữ nghĩa** có biên rõ ràng: sự thật có kiểu vào, kết quả ngữ nghĩa có kiểu ra, Host kiểm rồi thi hành.

## 5. Kiến trúc tổng thể

```text
[TUI / Headless]
       │ /import <path> / cấp quyền tự động / xác nhận / hủy
[Host]
       │ độc chiếm vòng đời nhập, sự kiện, runtime model
[imp.Runner]
       ├── LoadState → NextAction (chỉ suy từ sự thật trong khu làm việc)
       ├── Source     đọc, giải mã, chuẩn hóa, chụp ảnh
       ├── Segment    phép chiếu kết cấu → LLM nhận biên → kiểm độ bao phủ
       ├── Analyze    lô liên tiếp theo ngân sách đôi → tạm lưu sự thật từng chương
       ├── Synthesize quy nạp phân tầng → BookSynthesis
       ├── Validate   lắp và kiểm chứng Foundation đầy đủ
       └── Publish    Foundation chính thức → commit_chapter
               │
[khu làm việc meta/import]     [Store chính thức]
ảnh chụp nguồn/cách chia/       Progress/Checkpoint/Artifact/PendingCommit
phân tích/kết quả tổng hợp
```

Runner là phần điều phối giai đoạn tất định thông thường, không có năng lực quyết định tự do. Mỗi lần nó chỉ thi hành một động tác mà `NextAction` suy ra, xong động tác thì đọc lại sự thật.

## 6. Khu làm việc và việc suy trạng thái

Các sự thật trong lúc nhập nằm dưới thư mục sách:

```text
meta/import/
├── manifest.json
├── intent.json
├── source.txt
├── guidance.txt          # khi tồn tại: chỉ dẫn chia bằng ngôn ngữ tự nhiên của người dùng (--guide), là đầu vào ngữ nghĩa của segmentation
├── segmentation.json
├── confirmation.json
├── analyses/
│   ├── 000001.json
│   ├── 000002.json
│   └── ...
├── range-digests/
│   ├── 000001-000050.json
│   └── ...
├── synthesis.json
├── story-resolution.json
└── failures/
    ├── last.json
    └── last-response.txt
```

Bản đầu giữ lại khu làm việc. Nó vừa là căn cứ khôi phục, vừa là bản ghi kiểm toán việc nhập; không thêm cơ chế tự dọn và lưu trữ lịch sử.

`intent.json` lưu phần cấp quyền tường minh của người dùng lúc khởi động việc nhập (tự xác nhận, chọn trước trạng thái truyện khi uncertain, có bỏ qua Hold khi hoàn thành không). Đây là ý định của người dùng mà sau khi khôi phục vẫn buộc phải tuân, không phải trạng thái giai đoạn đoán được từ hiện vật; tạo rồi thì Runner không âm thầm viết lại.

### 6.1 Manifest

```go
type ImportManifest struct {
	Version          int    `json:"version"`
	SourceName       string `json:"source_name"`
	RawSHA256        string `json:"raw_sha256"`
	NormalizedSHA256 string `json:"normalized_sha256"`
	Encoding         string `json:"encoding"`
	SizeBytes        int64  `json:"size_bytes"`
	CreatedAt        string `json:"created_at"`
}

type ImportIntent struct {
	Version             int    `json:"version"`
	AutoConfirm         bool   `json:"auto_confirm,omitempty"`
	StoryResolution     string `json:"story_resolution,omitempty"` // open / closed
	ContinueAfterImport bool   `json:"continue_after_import,omitempty"`
}
```

- `source.txt` là ảnh chụp cục bộ sau khi chuẩn hóa, việc khôi phục không còn phụ thuộc vào đường dẫn gốc còn tồn tại;
- Manifest không lưu đường dẫn nguồn tuyệt đối, để tránh làm lộ thư mục máy và loại bỏ vấn đề khôi phục do di chuyển tệp;
- Intent chỉ nhận giá trị tập đóng, lưu chính xác phần cấp quyền của người dùng trong lệnh khởi động; khi khôi phục thì không suy ngược ý định cũ từ advance mode hiện tại;
- Khi phiên bản schema không khớp thì yêu cầu tường minh dùng phiên bản khớp để tiếp, hoặc nhập lại, không đoán việc di trú.

Khi tạo lần đầu thì ghi đủ và kiểm manifest, intent, source trong một thư mục tạm cùng cấp trước, rồi rename thư mục để phát hành thành `meta/import/`; `meta/import/` không tồn tại thì không tính là khu làm việc đang hoạt động. Nhờ vậy bộ ba ban đầu không vào `NextAction` ở dạng nửa khởi tạo, và cũng không cần thêm `stage=initializing` cho quá trình tạo. Lúc khởi động mà thấy thư mục khởi tạo còn sót thì phải nhắc tường minh và giữ thông tin chẩn đoán, không tự coi là khu làm việc thành công, cũng không xóa im lặng.

### 6.2 Không lưu các enum giai đoạn có thể trôi

Trạng thái lưu bền không ghi các trường điều khiển kiểu `stage=analyzing`, `current=37`. Động tác kế tiếp suy từ hiện vật:

```text
không có manifest/intent/source                       → ingest
không có segmentation                                 → segment
không có confirmation khớp tóm tắt đầu vào của segmentation → await_confirmation / auto_confirm
có phân tích chương bị khuyết hoặc tóm tắt đầu vào không khớp → analyze_first_missing
thiếu RangeDigest khớp đầu vào hoặc thiếu synthesis     → synthesize_first_missing
story_status=uncertain và không có lựa chọn khớp của người dùng → await_story_resolution
hiện vật chính thức không nhất quán với synthesis        → publish
toàn bộ hiện vật chính thức nhất quán                   → done
```

`Stage` trong sự kiện chỉ dùng để trình bày trên UI, không phải nguồn sự thật để khôi phục.

### 6.3 Danh tính hiện vật thống nhất

Không hiện thực đồ thị phụ thuộc. Mỗi hiện vật ngữ nghĩa trong khu làm việc đều dùng thống nhất cùng một luật danh tính:

```go
type Artifact[T any] struct {
	SchemaVersion int    `json:"schema_version"`
	InputDigest   string `json:"input_digest"`
	Payload       T      `json:"payload"`
}
```

`InputDigest` bao phủ toàn bộ **đầu vào ngữ nghĩa** mà động tác đó thật sự tiêu thụ, được tính sau khi mã hóa theo thứ tự cố định:

- segmentation: nội dung nguồn đã chuẩn hóa, phép chiếu SourceUnit, chỉ dẫn của người dùng và phiên bản prompt/schema của việc chia đoạn;
- confirmation: nội dung segmentation và cách xác nhận;
- phân tích chương: dải chương của lô và chính văn, ledger liên tục trước khi vào lô, phiên bản prompt/schema và chỉ dẫn của người dùng;
- RangeDigest/BookSynthesis: nội dung các phân tích có thứ tự hoặc digest tầng dưới mà mỗi bên tiêu thụ, phiên bản prompt/schema của việc tổng hợp;
- story resolution: nội dung synthesis và lựa chọn của người dùng;
- phát hành: nội dung đã chuẩn hóa của các đối tượng miền chờ phát hành.

Các sự thật thi hành như provider/model, usage, thinking thì ghi vào provenance/session, không vì cấu hình model thay đổi mà tự làm mất hiệu lực các phân tích đã thành công; khi người dùng yêu cầu phân tích lại thì xóa hiện vật tương ứng một cách tường minh. Phép phán về việc dùng lại cache chỉ xem động tác hiện tại có dựng lại được cùng `InputDigest` hay không.

`NextAction` đi theo đường ống tuyến tính cố định để tìm hiện vật đầu tiên bị khuyết, phân tích lỗi, hoặc `InputDigest` không khớp. Khi chia lại, sửa chỉ dẫn của người dùng, hay đổi sự thật thượng nguồn thì hạ nguồn tự nhiên lệch; không phải viết luật kiểu "khi cách chia đổi thì xóa tay những tệp nào".

Lúc phát hành thì so từng mục giữa hiện vật chính thức và kết quả tổng hợp; giống nhau thì bỏ qua một cách bất biến, khác nhau thì báo xung đột, không ghi đè theo phỏng đoán. Vì vậy xóa `ResumeFrom`. Việc khôi phục chỉ cần chạy lại `/import`; Runner sẽ tiếp từ sự thật khuyết đầu tiên.

## 7. Đọc tệp nguồn

### 7.1 Giải mã

Bản đầu hỗ trợ:

- UTF-8 / UTF-8 BOM;
- GB18030 (bao phủ các văn bản tiểu thuyết GBK thường gặp).

Kết quả giải mã buộc phải trả về encoding đã chọn, và ghi vào Manifest cùng sự kiện tiến độ. Không được giấu việc "thử GB18030" thành phần đỡ lưng không tiếng. Khi không giải mã đáng tin được hoặc xuất hiện ký tự thay thế không chấp nhận được thì thất bại luôn, lỗi chứa kết quả phát hiện.

### 7.2 Chuẩn hóa

Chỉ làm những chuyển đổi không làm đổi nội dung văn học:

- bỏ BOM;
- CRLF/CR thống nhất thành LF;
- giữ dòng trống, phần thụt lề, dòng tiêu đề và các ký tự chính văn;
- không xóa văn bản phần đầu, chương rỗng, quảng cáo, thông tin bản quyền hay cái gọi là tiếng ồn ở đuôi.

Mọi quyết định loại trừ để cho kết quả ngữ nghĩa của việc chia đoạn và hiển thị trong phần xem trước.

### 7.3 Tọa độ ổn định

Văn bản đã chuẩn hóa dựng nên một bảng `SourceUnit` thống nhất:

```go
type SourceUnit struct {
	ID        string // L1257; dòng vượt ngân sách thì tách thành L1257.1, L1257.2
	Line      int
	Part      int
	StartByte int
	EndByte   int
	Text      string
}
```

- `ID` chỉ dùng để trình bày và cho model tham chiếu; mọi phép phán về thứ tự, bao hàm và tăng dần đều nhất loạt so theo bộ đôi số `(Line, Part)`, cấm so từ điển trên chuỗi ID (`"L900"` theo thứ tự từ điển sẽ lớn hơn `"L1000"`); JSON của phép chiếu giữ id dạng chuỗi, phía Go phân tích thành `(Line, Part)` rồi mới so;
- Dòng bình thường ứng với một unit, nên đường đi thường gặp vẫn là tọa độ số dòng trực quan;
- Khi một dòng vượt ngân sách của phép chiếu kết cấu thì Go chỉ sinh nhiều **unit ảo** tại các biên ký tự UTF-8;
- Các mảnh ảo không ghi lại vào `source.txt`, không chèn ký tự xuống dòng mềm, không đổi bất kỳ ký tự nguồn nào;
- Khi biên nằm trong cùng một unit thì model trả về ID của unit cùng một mốc neo nguyên văn copy từng chữ; Go yêu cầu mốc neo đó phải duy nhất trong unit đó, rồi mới ánh xạ thành vị trí byte chính xác;
- Khi mốc neo không tồn tại hoặc không duy nhất thì phản hồi lỗi cụ thể cho model, cấm đoán offset, cắt văn bản hay đòi người dùng sửa bản gốc trước.

Nhờ vậy văn bản chia chương thông thường giữ được mô hình số dòng, còn cả đoạn không có ký tự xuống dòng, một dòng chứa nhiều chương, hay dòng dài bất thường thì cũng xử bằng cùng một loại tọa độ.

## 8. Chia đoạn theo ngữ nghĩa

### 8.1 Phép chiếu kết cấu

Model thấy phép chiếu kết cấu đã chia khối theo ngân sách ngữ cảnh:

```json
{
  "owned_units": {"start": "L1200", "end": "L1800"},
  "context_units": {"start": "L1180", "end": "L1820"},
  "units": [
    {"id": "L1200", "line": 1200, "text": "Gió thổi tới từ ngoài cổng thành.", "blank_before": true},
    {"id": "L1257", "line": 1257, "text": "Tập hai · Bắc Cảnh", "blank_before": true, "blank_after": true}
  ],
  "user_guidance": ""
}
```

Vùng ngữ cảnh có thể chồng lấn, nhưng mỗi lời gọi chỉ được trả kết quả cho `owned_units`, nên không có chuyện bỏ phiếu giữa các khối chồng lấn hay gộp xung đột. Kỷ luật về tọa độ do Go thi hành (bản sửa 2026-07-16): biên mà model trả về ở vùng ngữ cảnh thì không kích hoạt việc hỏi lại về ngữ nghĩa — biên đó thuộc quyền quản của khối liền kề (nó sẽ báo lại một lần nữa trong vùng owned của chính nó), code cắt bỏ luôn và hồi đáp phần giải thích; việc thử lại về ngữ nghĩa chỉ để dành cho thất bại ngữ nghĩa thật (ID ảo giác ngoài phép chiếu, kind bất hợp pháp v.v.). Hành vi cũ là phản hồi để hỏi lại khi vượt biên, khiến model yếu thường tiêu hết cả 3 lần thử và làm sập cả khối.

Kích thước khối tính theo context window và ngân sách chừa lại của model architect hiện tại, không chia khối theo số dòng cố định hay số chương cố định. Khi ngữ cảnh của model mở rộng ra thì số lần gọi tự nhiên giảm. Ngân sách quy hoạch không dùng hết mức (bản sửa 2026-07-16): chính văn owned chỉ là một phần của request, lúc quy hoạch thì trừ độ dài thực tế của system prompt và phần chỉ dẫn, rồi quy đổi theo 3/4 cho phần phình ra của lớp bọc JSON của phép chiếu; vùng ngữ cảnh còn có giới hạn byte riêng (chunkBytes/8, sàn 4096) để chặn việc các mảnh ảo của dòng siêu dài ngốn hết ngân sách đầu vào. Phía đầu ra thì đỡ lưng đối xứng: khi JSON biên của một khối bị cắt theo độ dài (rất nhiều chương ngắn) thì chia khối làm đôi rồi thử lại theo đệ quy — nửa khối có đường cache riêng, thành quả của lần thử lại không phải trả tiền lại; nếu ở mức unit mà vẫn bị cắt thì mới thật là thiếu dung lượng.

Quyết định về biên của mỗi khối được ghi xuống đĩa dưới dạng hiện vật (`segment-chunks/chunk-*.json`, danh tính = danh tính của việc chia + MaxUnitBytes + dải owned của khối — bảng unit được xác định duy nhất bởi «nguồn đã chuẩn hóa + MaxUnitBytes», nên khi đổi bậc làm các mảnh của dòng siêu dài bị định hình lại thì cache tự nhiên lệch, không dùng lại các biên cũ đã lệch chỗ), nên bất kỳ khối nào thất bại hoặc bị ngắt thì lúc chạy lại các khối đã xong được dùng lại với không lời gọi nào — cùng triết lý với analyze theo từng chương, synthesize theo từng khoảng; sau khi segmentation cuối cùng xuống đĩa thì cache cấp khối bị xóa. Khi việc tích hợp cuối cùng (resolve) thất bại thì cũng xóa cache khối và ghi ảnh chụp quyết định vào `failures/`: lúc đó digest của cache luôn khớp, giữ nó lại sẽ làm lần chạy lại đọc lại đúng loạt biên đó với không lời gọi nào và tái hiện đúng cùng một thất bại một cách tất định. Biên chương có chính văn rỗng (nguồn truyện mạng thật thường có tiêu đề chỗ giữ kiểu "đã khóa/chương trả phí") thì không làm thất bại toàn cục: nhập vào đoạn trước (văn bản không mất một chữ), ghi vào `Segmentation.Notes` để phần xem trước khi xác nhận trình bày, người xem không chấp nhận thì dùng `--guide` để phán quyết.

### 8.2 Đầu ra của model

```go
type BoundaryDecision struct {
	UnitID    string   `json:"unit_id"`
	Anchor    string   `json:"anchor,omitempty"`
	Kind      string   `json:"kind"` // chapter / group / front_matter / back_matter
	Title     string   `json:"title,omitempty"`
	Uncertain bool     `json:"uncertain,omitempty"`
	Reason    string   `json:"reason,omitempty"`
}
```

- `chapter` là đơn vị chính văn nộp được, gồm cả phán đoán ngữ nghĩa về việc mở đầu, khai từ, ngoại truyện v.v. có tính là chương không;
- `group` là chứng cứ về kết cấu tầng trên như tập, phần, thiên, không tính thẳng thành chương;
- `front_matter` / `back_matter` gắn cờ những vùng phụ thuộc rõ ràng không vào chính văn chương;
- `anchor` buộc phải từng chữ đến từ unit tương ứng; khi biên nằm ở điểm bắt đầu của unit thì được bỏ trống;
- `uncertain` chỉ dùng để nhắc trong phần xem trước, không để code đặt ngưỡng độ tin cậy.

Không để model sinh regex. Regex vẫn sẽ nén ngữ nghĩa mở trở lại thành cú pháp có hạn, và đưa vào các vấn đề về ký tự thoát, khớp cục bộ và giả định định dạng thống nhất.

### 8.3 Phần code kiểm chứng

Go chỉ kiểm:

1. Mọi ID unit đều tồn tại và nằm trong phép chiếu của lời gọi đó (owned + vùng ngữ cảnh; ngoài phép chiếu là ảo giác, phản hồi để hỏi lại);
2. Với biên ở vùng owned thì kind thuộc tập đóng, anchor không rỗng phải duy nhất trong unit tương ứng và ánh xạ tới biên byte UTF-8, cùng vị trí thì không xung đột về ngữ nghĩa (khi kind/tiêu đề khác nhau thì giữ cái nào không do Go phán quyết, hỏi lại thì giao cho model; phần trùng hoàn toàn giống nhau là dư thừa máy móc, cho qua rồi âm thầm bỏ trùng), khối đầu tiên phải có một biên đỡ được điểm bắt đầu của văn bản (phần mở đầu có phải là lời nói đầu không thì do model phán, không để Go trả lời thay) — tất cả đều kiểm ngay trong kỳ gọi (bản sửa 2026-07-16): giá trị tồi mà vào cache khối rồi mới phát hiện lúc cuối thì digest luôn khớp sẽ làm thất bại tái hiện một cách tất định; các biên ở vùng ngữ cảnh thì chắc chắn bị cắt bỏ, không hỏi lại vì chúng;
2a. **Hồi đáp tiêu đề** (bản sửa 2026-07-16, seg-v2): title của các biên chapter/group sau khi chuẩn hóa (bỏ khoảng trắng) buộc phải thật sự tồn tại trong nguyên văn của unit biên, nếu không thì hỏi lại ngay trong kỳ gọi — đo thực tế trên một nguồn thu thập theo trang có 157 chương thì 67 chương là biên và tiêu đề do model bịa ra ở phần văn tiếp giữa chương (sự nhập nhằng về kỷ luật bao phủ buộc mỗi khối phải đặt biên ở đầu khối), tất cả đều bị mục này chặn lại bằng phép soát sự thật. Phần lượng định ngữ nghĩa vẫn thuộc model: với nguồn thật sự không có quy ước tiêu đề thì đặt `uncertain=true` để giữ tiêu đề do quy nạp (phần xem trước trình bày cờ còn ngờ); tiêu đề mang tính mô tả của front/back matter thì rủi ro thấp, không soát. prompt siết theo: biên chỉ đặt ở chỗ phân cách kết cấu thật, còn khi đầu khối là phần chính văn tiếp nối của chương trước thì trả về boundaries rỗng mới là đầu ra đúng (trừ phần đầu của khối đầu tiên);
3. Thứ tự và phần trùng của các biên thì do Go sửa một cách tất định chứ không phủ quyết (bản sửa 2026-07-16): sắp xếp ổn định theo byte sau khi phân tích để phục hồi thứ tự thật — thứ tự giữa các khối được bảo đảm bởi việc các dải owned không chồng lấn, nên chuyện lộn thứ tự chỉ có thể xảy ra trong một khối, và việc sắp xếp không mất thông tin nào; phần trùng cùng byte thì giữ cái xuất hiện trước và ghi vào `Notes`. Hành vi cũ yêu cầu tăng dần nghiêm ngặt nếu không thì thất bại toàn cục, mà đo thực tế thì 319 biên bại vì 1 chỗ lộn thứ tự trong khối, và cache khối lại làm thất bại đó tái hiện tất định. Phép phán thứ tự nhất loạt theo thứ tự số của `(Line, Part)`, không so từ điển trên ID;
4. Dải chính văn của mỗi chương sinh ra là không rỗng (tiêu đề chỗ giữ có chính văn rỗng thì nhập vào đoạn trước, xem §8.1);
5. Mọi văn bản nguồn không rỗng đều thuộc về đúng một chương, một tiêu đề group, hoặc một front/back matter rõ ràng (phần văn bản không rỗng ở đầu mà chưa có chỗ thuộc về — phần giới thiệu/quảng cáo ở đầu sách bị bỏ sót biên — thì Go thu về front_matter một cách tất định và ghi `Notes` để giao cho phần xem trước khi xác nhận, không phủ quyết ở cuối);
5a. Chương trùng tên (tiêu đề sau khi bỏ khoảng trắng thì giống nhau) thì ghi vào `Notes` để người soát (bản sửa 2026-07-16) — với nguồn có quy ước tiêu đề thì tên chương lẽ ra không được trùng, trùng là tín hiệu tất định của việc "cùng một chương bị cắt sai"; có gộp hay không thì không do Go phán quyết, `Notes` không rỗng là chặn `--yes`;
6. Không có phần chồng lấn, vượt biên hay chưa có chỗ thuộc về;
7. group không bị tính sai vào tổng số chương.

Câu "L1257 về mặt ngữ nghĩa có phải tiêu đề chương không" thì Go không phán lại.

### 8.4 Người dùng xác nhận

Ở chế độ tương tác thì trước khi xác nhận không gọi việc phân tích chương, cũng không ghi Store chính thức. Phần xem trước ít nhất phải hiện:

- Số tập/group và số chương;
- Toàn bộ tiêu đề chương, cuộn xem được;
- Dải và tóm tắt của phần văn bản phụ thuộc ở đầu và cuối;
- Chương rỗng, chương dài bất thường và các biên model gắn cờ uncertain;
- Dòng bắt đầu và kết thúc của mỗi chương, để người dùng đối chiếu với bản gốc.

Người dùng có thể:

- Xác nhận (bấm `y` ở panel xem trước của TUI, bên trong thì chạy lại bằng AcceptSegmentation; mở đường một lần cho cách chia hiện tại, không ghi vào intent, confirmation ghi `method=user_confirmed`);
- Nhập phần giải thích bằng ngôn ngữ tự nhiên rồi nhận biên lại, ví dụ `/import --guide=Màn phụ · X cũng là chương riêng`;
- Hủy và giữ khu làm việc (Esc).

`/import <path> --yes` là phép cấp quyền không người trực tường minh: Runner sau khi kiểm độ bao phủ qua thì ghi cùng hiện vật confirmation đó, ghi lại `method=auto_authorized`, rồi tiếp tục phân tích. `--yes` dù có biên uncertain thì cũng nghĩa là người dùng chọn tin cách chia lần này, nhưng phần uncertain vẫn được giữ trong hiện vật và log. **Ngoại lệ (bản sửa 2026-07-16)**: khi cách chia có phần giải thích về dung sai (`Notes` không rỗng — đã từng xảy ra việc hút chương rỗng, đỡ lưng ở đầu, bỏ trùng ở chỗ trùng nhau) thì `--yes` không tự mở đường, vẫn dừng ở phần xem trước để xác nhận — kết cấu đã bị viết lại một cách tất định, nên phép cấp quyền mù mà chưa xem phần xem trước thì không nên nuốt nó; còn `y` sau khi đã xem phần xem trước (AcceptSegmentation) thì không bị hạn chế này.

`--yes` chỉ bỏ qua việc xác nhận cách chia, không quyết thay người dùng về `story_status=uncertain`, cũng không bỏ qua Hold khi hoàn thành việc nhập. Người dùng không cần viết regex hay điền tay `from=N`.

## 9. Trích sự thật từng chương theo các lô liên tiếp

Sau khi xác nhận thì bắt đầu từ phân tích khuyết đầu tiên, gom các chương liên tiếp thành lô theo **ngân sách đôi cả đầu vào và đầu ra** của model hiện tại. Bản đầu thì các lô chạy tuần tự, không làm song song giữa các cửa sổ: ID phục bút, biệt danh nhân vật và các biến động trạng thái có thứ tự thời gian, và ledger nén mà lô trước sinh ra là đầu vào của lô sau.

Việc chạy tuần tự chỉ ràng buộc chiến lược thi hành của bản đầu, không phải hạn chế kiến trúc vĩnh viễn; hiện vật phân tích vẫn xuống đĩa độc lập theo từng chương, nên sau này khi có bằng chứng chứng minh việc gộp song song vẫn giữ được chất lượng ngữ nghĩa thì chỉ cần thay phần điều phối lô.

### 9.1 Đầu ra theo lô, hiện vật theo từng chương

Bỏ envelope lai `=== TAG ===`. Mỗi lời gọi trả về một đối tượng lô có cấu trúc, mỗi phần tử mảng vẫn là sự thật của một chương:

```go
type ImportedChapterFacts struct {
	Chapter             int                        `json:"chapter"`
	Title               string                     `json:"title"`
	Summary             string                     `json:"summary"`
	KeyEvents           []string                   `json:"key_events"`
	CoreEvent           string                     `json:"core_event"`
	Hook                string                     `json:"hook"`
	Scenes              []string                   `json:"scenes"`
	Characters          []string                   `json:"characters"`
	CharacterEvidence   []ImportedCharacterFact    `json:"character_evidence,omitempty"`
	WorldEvidence       []ImportedWorldFact        `json:"world_evidence,omitempty"`
	TimelineEvents      []domain.TimelineEvent      `json:"timeline_events,omitempty"`
	ForeshadowUpdates   []domain.ForeshadowUpdate  `json:"foreshadow_updates,omitempty"`
	RelationshipChanges []domain.RelationshipEntry `json:"relationship_changes,omitempty"`
	StateChanges        []domain.StateChange       `json:"state_changes,omitempty"`
	HookType            string                     `json:"hook_type"`
	DominantStrand      string                     `json:"dominant_strand"`
}

type AnalysisBatchResult struct {
	Chapters []ImportedChapterFacts `json:"chapters"`
}

type ChapterAnalysisPayload struct {
	BatchStart int                  `json:"batch_start"`
	BatchEnd   int                  `json:"batch_end"`
	Facts      ImportedChapterFacts `json:"facts"`
}
```

Mỗi `analyses/NNNNNN.json` là một `Artifact[ChapterAnalysisPayload]`. Các chương xuống đĩa trong cùng một lô thì ghi cùng `BatchStart/BatchEnd`; còn `InputDigest` của chúng dùng lối **gắn theo từng chương**: danh tính của việc chia (`InputDigest` của hiện vật segmentation) + phiên bản prompt/schema + số chương + chính văn của chương đó. Lý do gắn theo từng chương chứ không theo cách chia lô là vì biên của lô thay đổi theo năng lực đầu vào/đầu ra của model (đổi model mạnh hơn thì lô tự nhiên lớn hơn); nếu viết cách chia lô vào danh tính thì sau khi đổi model, các phân tích đã thành công sẽ lệch toàn bộ, buộc phải tính lại và trả tiền lặp. Gắn theo danh tính của việc chia thì bảo đảm khi «chia lại, đổi phiên bản prompt/schema, đổi nguồn» thì các phân tích hạ nguồn tự nhiên lệch, còn chỉ đổi model thì không bị vạ lây — đó mới là ngữ nghĩa mất hiệu lực mà việc khôi phục thật sự cần.

`ImportedCharacterFact` và `ImportedWorldFact` là các quan sát nén dùng để tổng hợp cả sách, không ghi thẳng vào nhân vật hay luật thế giới chính thức. Chúng ít nhất mang theo số chương, để kết quả tổng hợp có nguồn ổn định.

### 9.2 Gom lô theo ngân sách đôi

Việc quy hoạch lô thỏa đồng thời:

```text
đầu vào dự kiến + system/prompt/ledger + phần chừa cho suy luận + đầu ra thấy được dự kiến ≤ context window
đầu ra thấy được dự kiến ≤ giới hạn completion khả dụng của provider/model
```

- Ước lượng đầu vào bao phủ tiêu đề, chính văn của từng chương và ledger trước lô;
- Ước lượng đầu ra gồm phần phí kết cấu cố định của schema analyzer và phần chừa sự thật bảo toàn cho mỗi chương, chỉ quyết lần này nạp bao nhiêu chương, không cắt bất kỳ trường nào;
- Với các model mà reasoning token và JSON thấy được dùng chung ngân sách completion thì buộc phải trừ phần chừa cho suy luận trước;
- Năng lực đầu ra của provider/model càng mạnh thì lô tự nhiên càng lớn; không được viết luật cố định kiểu "mỗi lô 10/20 chương";
- Khi bản thân đầu vào của một chương không vào nổi context, hoặc đầu ra kết cấu tối thiểu của một chương cũng không vào nổi completion, thì báo tường minh chương đó và dung lượng của model, không cắt chính văn hay bịa ra một thành công giản lược.

Nhờ vậy tổng số chương tăng thì chỉ tăng số lô, không còn để một phản hồi nào tăng vô hạn theo quy mô cả sách; đồng thời không dời #83 từ hạt canh cả sách sang hạt canh một lô không bị ràng buộc đầu ra.

### 9.3 Ngữ cảnh của một lô

Một lời gọi lô chỉ chứa:

- Nguyên văn và tiêu đề của dải chương liên tiếp hiện tại;
- Bảng biệt danh nhân vật nén phái sinh từ các chương trước;
- ID phục bút đang hoạt động kèm trạng thái một câu;
- Phần tóm tắt trạng thái gần nhất cần thiết.

Model xử lý các chương trong lô theo thứ tự mảng, có thể tiếp nối biệt danh, phục bút và trạng thái trong lô; sau khi lô kết thúc thì Go cập nhật ledger nén theo thứ tự các sự thật đã kiểm chứng. Nó không phụ thuộc vào Premise cả sách chưa được sinh, cũng không đọc lại toàn bộ phần trước. Sự thật của chương là đầu vào của Foundation, chứ không phải ngược lại tạo thành phụ thuộc vòng.

### 9.4 Kiểm chứng phản hồi đầy đủ

Code kiểm kết cấu, miền giá trị và tham chiếu ở hai tầng, không đóng cứng chất lượng văn học:

- Cấp lô: mảng chapters liên tiếp theo số chương mong đợi, không trùng, không lỗ hổng, dải lô, `InputDigest` và schema version đều khớp;
- Cấp từng chương: chapter/title nhất quán với phần chia nguồn, summary/core_event không rỗng, các trường tập đóng của domain chính thức như hook type, strand đều hợp pháp, các trường trục thời gian, phục bút và biến động trạng thái đều hợp kiểu.

Code không đòi "buộc phải 3~6 sự kiện", "buộc phải có nhân vật xuất hiện", "buộc phải có ba khung cảnh". Chương yên tĩnh, thư từ, chương tả cảnh hay chương không có nhân vật tên tuổi đều là hình dạng văn học hợp pháp.

Khi phản hồi đầy đủ xuất hiện lỗi JSON hay lỗi kiểm ngữ nghĩa thì không nộp bất kỳ chương mới nào trong đó; phản hồi lỗi cụ thể cho cùng model đó, rồi đi theo phần thử lại ở tầng đầu ra của §13.3. Model có thể viết lại các đối tượng phía trước sau khi sửa, nên khi kiểm thất bại thông thường thì không được tự tiện lưu một phần của mảng.

### 9.5 Tiền tố liên tiếp khi bị cắt theo độ dài

> Định vị khi thi hành: mục này là một **tối ưu token trên đường lỗi**, không phải phần mà tính đúng của việc khôi phục phụ thuộc vào. v1 (giai đoạn ba) thì bị cắt là «thất bại + thu nhỏ rồi gom lô lại», bản thân điều đó đã đúng và khôi phục được; việc vớt tiền tố liên tiếp thì hiện thực ở một giai đoạn con độc lập (giai đoạn ba·bù), bật/tắt riêng, nghiệm thu riêng.

Chỉ khi phản hồi gắn cờ rõ là `StopReasonLength` và trả về được phần văn bản phân tích được thì mới cho phép lưu **tiền tố hợp pháp liên tiếp dài nhất** từ phản hồi thất bại:

1. Dùng decoder JSON dạng stream để vào mảng `chapters` ở tầng đỉnh;
2. Từ chương đầu của lô mà đọc lần lượt các đối tượng JSON đã đóng hoàn chỉnh;
3. Mỗi đối tượng phải qua độc lập phần kiểm theo từng chương ở §9.4, và cùng các đối tượng trước đó tạo thành một chuỗi liên tiếp tính từ chương đầu của lô, rồi ghi ngay một cách nguyên tử vào hiện vật phân tích tương ứng;
4. Gặp đối tượng đầu tiên không hoàn chỉnh, bất hợp pháp, nhảy số hay trùng thì dừng ngay, các byte phía sau nhất loạt không giải thích;
5. Cấm thêm dấu ngoặc, viết tiếp nửa JSON, đoán trường thiếu, hay vớt các đối tượng không liên tiếp từ những vị trí phía sau;
6. Phản hồi thô, StopReason, dải tiền tố đã lưu và chương thất bại đầu tiên đều ghi vào failure artifact, sự kiện và log;
7. `NextAction` gom lô lại từ phân tích khuyết đầu tiên, không làm lại phần tiền tố hợp pháp đã nộp.

typed-call buộc phải ghi lại lần này có lấy được phần văn bản dùng được không: các chế độ có cấu trúc không dạng stream như JSON Schema có thể không đưa ra được tiền tố phân tích được khi dừng theo độ dài. Nếu provider không trả về phần văn bản, không chứng minh rõ được là bị cắt theo độ dài, hoặc không hoàn thành nổi một đối tượng hợp pháp nào, thì không lưu bất kỳ kết quả nào, phát sự kiện/log `prefix_salvage=unavailable` và lùi về «thất bại + thu nhỏ rồi gom lô lại», thay vì quay không im lặng. Khi lô một chương mà vẫn bị cắt thì báo luôn là năng lực đầu ra của model không đủ, không thu nhỏ theo vòng lặp hay tạo ra sự thật rỗng.

Việc bị cắt theo độ dài là lỗi dung lượng, không vào vòng lặp tự sửa ngữ nghĩa kiểu "phản hồi lỗi kiểm cho cùng model đó", cũng không thử lại nguyên trạng cùng một lô.

### 9.6 Khôi phục

Mỗi chương phân tích thành công là ghi nguyên tử vào `analyses/NNNNNN.json`. Sau khi sập:

- Các phân tích khớp `InputDigest` thì dùng lại luôn, không trả tiền lặp;
- Phân tích khuyết hoặc lệch đầu tiên trở thành điểm khởi của lô kế tiếp;
- Sau khi đầu vào ngữ nghĩa thượng nguồn thay đổi thì các phân tích không dựng lại được cùng `InputDigest` tự nhiên mất hiệu lực;
- Phần tiền tố hợp pháp liên tiếp đã nộp khi bị cắt theo độ dài và các hiện vật hoàn thành bình thường thì dùng đúng cùng một luật khôi phục;
- Không cho phép người dùng nhảy qua một chương thất bại để tiếp tục sinh các sự thật ngữ nghĩa không liên tiếp phía sau.

## 10. Tổng hợp phân tầng

### 10.1 Vì sao không thể làm một lần xuất ra cả sách nữa

Việc tổng hợp cả sách cần hiểu xuyên chương, nhưng không cần đọc lại toàn bộ chính văn, và cũng không nên xuất ra đối tượng chi tiết của từng chương. Sự thật từng chương đã chứa ngữ nghĩa ở cấp chương; việc tổng hợp chỉ xử lý các sự thật nén đó.

### 10.2 Hình dạng Map/Reduce

```text
ImportedChapterFacts × N
        ↓ chia thành các khoảng liên tiếp theo context window hiện tại
RangeDigest × M
        ↓ khi cần thì tiếp tục gộp
BookSynthesis
```

Sách ngắn mà một lần chứa được toàn bộ sự thật các chương thì sinh `BookSynthesis` luôn; chỉ sách dài mới sinh ra `RangeDigest`. Việc có phân tầng hay không do ngân sách token quyết định máy móc, không do ngưỡng số chương quyết định.

`RangeDigest` chứa phần đẩy tình tiết, biến động nhân vật, sự thật thế giới, phục bút đã gieo/đã thu và các biên kết cấu ứng viên của dải liên tiếp đó. Kích thước đầu ra của nó bị một khoảng đơn lẻ ràng buộc; còn phần tổng hợp cuối thì không xuất lặp N đối tượng chương chi tiết nữa, chỉ xuất sự thật toàn cục và dải tập cung.

### 10.3 Kết quả tổng hợp cuối cùng

```go
type BookSynthesis struct {
	Premise       string                 `json:"premise"`
	Characters    []domain.Character     `json:"characters"`
	WorldRules    []domain.WorldRule     `json:"world_rules"`
	Structure     []ImportedVolumeRange  `json:"structure"`
	Compass       domain.StoryCompass    `json:"compass"`
	PlanningTier  domain.PlanningTier    `json:"planning_tier"`
	StoryStatus   string                 `json:"story_status"` // open / closed / uncertain
	StatusReason  string                 `json:"status_reason"`
}
```

Phần kết cấu chỉ trả về các dải, không xuất lặp mọi chương:

```go
type ImportedVolumeRange struct {
	Title string             `json:"title"`
	Theme string             `json:"theme"`
	Arcs  []ImportedArcRange `json:"arcs"`
}

type ImportedArcRange struct {
	Title        string `json:"title"`
	Goal         string `json:"goal"`
	StartChapter int    `json:"start_chapter"`
	EndChapter   int    `json:"end_chapter"`
}
```

Model tự quyết số tập và số cung, có thể tham khảo các tiêu đề group trong tệp nguồn, nhưng không bị giới hạn "một tập", "1~3 cung". Go dùng title/core_event/hook/scenes của `ImportedChapterFacts` để lắp `OutlineEntry` chính thức.

### 10.4 Trạng thái truyện

Việc nhập chỉ dựng lại sự thật của chính văn, không bịa ra mạch dài chưa thu về chỉ để Engine tiếp tục được:

- `open`: chính văn có mục tiêu hoặc sức căng thật sự chưa thu về, thì sinh Compass bình thường;
- `closed`: phát hành theo tác phẩm đã hoàn kết, tập cuối gắn cờ Final; cần viết tiếp thì do người dùng reopen tường minh và cho hướng mới;
- `uncertain`: trước khi phát hành thì yêu cầu người dùng chọn xử theo chưa hoàn hay đã hoàn; nếu Intent đã lưu lựa chọn qua `--story=open|closed` thì dùng luôn, nếu không thì vào trạng thái đợi tương tác. Lựa chọn được lưu thành hiện vật `story-resolution.json` với đầu vào là synthesis hiện tại.

Code không âm thầm đoán ý định người dùng qua việc `open_threads` có rỗng hay không.

## 11. Lắp và kiểm chứng Foundation

Model xuất ngữ nghĩa tổng hợp, Go chịu trách nhiệm lắp các đối tượng miền chính thức. Trước khi phát hành thì buộc phải thỏa:

1. Premise có tiêu đề tên sách hợp pháp; khi chính văn không xác nhận được tên sách thì dùng basename của tệp nguồn, và gắn nguồn là filename, không để model tuyên bố đó là "tên sách thật";
2. Mọi dải tập và cung đều liên tiếp theo thứ tự;
3. Dải đầu tiên bắt đầu từ chương 1, dải cuối cùng kết thúc ở chương N;
4. Mỗi chương thuộc về đúng một cung;
5. Sau `FlattenOutline` thì số chương là N, tiêu đề nhất quán với sự thật từng chương;
6. Tên nhân vật, luật thế giới và Compass thỏa các ràng buộc kiểu domain hiện có;
7. PlanningTier là giá trị tập đóng hợp pháp, nhưng lý do chọn đến từ model chứ không từ ngưỡng số chương;
8. Trạng thái closed/open nhất quán với hình dạng phát hành của Final, Compass;
9. `InputDigest` của hiện vật Synthesis dựng lại được từ tập phân tích có thứ tự hiện tại.

Khi vi phạm ràng buộc kết cấu thì phản hồi lỗi cụ thể cho model để sinh lại, tiếp tục cho tới khi thành công hoặc context bị hủy; không ghi xuống đĩa bán thành phẩm.

## 12. Phát hành chính thức

### 12.1 Điều kiện tiền đề để phát hành

Việc nhập mới chỉ được vào khi:

- Không có chương nào đã hoàn thành;
- Không có chương đang bay hay PendingCommit;
- Không có một khu làm việc nhập khác không cùng nguồn;
- Foundation chính thức rỗng, hoặc trùng hoàn toàn digest với phần khu làm việc hiện tại đã phát hành.

Ngữ nghĩa của việc gộp một tiểu thuyết đã có với văn bản ngoài mới thì không rõ, nên bản đầu từ chối tường minh, không đoán là ghi đè hay nối thêm.

### 12.2 Phát hành Foundation

Phát hành theo thứ tự phụ thuộc chính thức:

```text
planning tier
→ premise
→ characters
→ world rules
→ layered outline + flat outline
→ compass
→ đối chiếu progress
```

Mỗi bước:

1. Tính digest của nội dung chờ phát hành;
2. Hiện vật chính thức không tồn tại thì ghi nguyên tử và nối thêm checkpoint;
3. Đã tồn tại mà digest giống nhau thì bỏ qua một cách bất biến;
4. Đã tồn tại mà khác nhau thì trả lỗi xung đột, không ghi đè.

Sập giữa đường thì chỉ cần đối chiếu lại từ mục đầu tiên, không cần giao dịch xuyên tệp hay một máy trạng thái Foundation Pending.

### 12.3 Phát hành chương

Dùng lại luồng hiện có theo thứ tự chương:

```text
lưu draft
→ Progress.StartChapter
→ commit_chapter(sự thật từng chương)
```

`commit_chapter` đã có saga PendingCommit, checkpoint và phép kiểm bất biến cho chương đã hoàn thành. Việc nhập không copy một bộ logic nộp thứ hai.

Các cửa sổ sập:

| Cửa sổ | Hành vi khôi phục |
|---|---|
| trước draft | Lưu lại cùng chính văn đó |
| sau draft, trước StartChapter | Đối chiếu digest rồi tiếp |
| sau StartChapter, trước PendingCommit | Thi hành lại commit của cùng chương đó |
| đang trong PendingCommit | Do saga nộp hiện có khôi phục |
| sau chapter complete | digest/checkpoint nhất quán thì bỏ qua |
| nội dung chính thức xung đột với digest của nguồn | Dừng tường minh, báo chương bị xung đột |

### 12.4 Biên hoàn thành việc nhập

Sau khi toàn bộ các chương đã nộp ổn định thì đặt một `AdvanceHoldAtBoundary`, lý do nói rõ là "đã nhập xong tiểu thuyết ngoài, đợi nghiệm thu rồi viết tiếp". Nó chỉ bảo vệ lần nhập xuyên hệ thống này, không đổi chế độ `auto/review` lâu dài của người dùng.

`--yes` chỉ cấp quyền tự nhận cách chia, không được ngầm bỏ qua Hold này. Chỉ khi người dùng đồng thời truyền `--continue` độc lập thì Runner mới không tạo Hold riêng cho việc nhập; sau đó vẫn tuân advance mode bình thường: `auto` thì viết tiếp được, `review` thì vẫn đợi `/next`.

Mặc định TUI không tự tiếp sức không nhắc nữa. Người dùng kiểm tra trạng thái Foundation và các chương rồi dùng cửa vào tiếp tục hiện có để khôi phục việc sáng tác.

**Chỗ rơi khi đóng panel**: việc nhập phát ra từ trang chào mà thu xếp thành công thì khi bấm Esc đóng panel sẽ chạy bù một lần `Resume()` (cửa gác khôi phục của bootstrap chỉ chạy một lần lúc khởi động), người dùng rơi thẳng vào bàn làm việc và bị Hold hoàn thành việc nhập chặn ở biên chương sau để đợi nghiệm thu — chứ không phải nằm lại ở trang chào mà bấm Enter nhầm là "mở sách mới". Trạng thái cuối khi lỗi và tình huống ở bàn làm việc thì chỉ đóng panel.

**Phòng tuyến khi tạo mới**: `PrepareUserRules` / `StartPrepared` từ chối tạo mới khi thư mục sách đã có chương thành phẩm (`CompletedChapters` không rỗng) — StartPrepared ngay đầu là reset checkpoints và progress, chạm nhầm sẽ dọn sạch im lặng cả cuốn sách (gồm toàn bộ các chương vừa nhập). Phần quy hoạch còn sót mà chưa có chương thành phẩm thì cho qua, để giữ đường tự lành là thử lại Ctrl+S của việc cùng lên kế hoạch trong cùng phiên và việc phán bù khi khôi phục.

### 12.5 Cửa gác phát hành xuyên khởi động lại

Khi khu làm việc tồn tại và `NextAction != done` thì `Host.New/Resume` buộc phải nhận diện cuốn sách là một lần nhập chưa xong:

- Cho phép xem, chẩn đoán và thi hành việc khôi phục `/import`;
- Cấm Engine thường khởi động, Continue hay phái Writer;
- Hiện rõ động tác khôi phục hiện tại, không coi phần Foundation/chương đã phát hành một phần là một cuốn sách trọn nghĩa viết tiếp được.

Cửa gác đọc thẳng khu làm việc và Store chính thức để suy ra, không thêm `published bool`. Nhờ vậy sau khi sập ở bất kỳ cửa sổ phát hành nào cũng không để luồng sáng tác thường tiêu thụ trạng thái nửa phát hành khi Runner còn chưa khôi phục.

## 13. Nhân của việc gọi model

Bên trong `imp` giữ một typed-call helper nhỏ và chuyên dụng, không xây framework luồng công việc LLM tổng quát.

### 13.1 Chọn model

- Mặc định dùng model của vai architect;
- Bậc model của các hàm ngữ nghĩa là núm điều chỉnh mở: segment/analyze/synthesize mỗi cái khai bậc riêng được, mặc định rơi về architect, tầng cấu hình có thể trỏ segment — cái thiên về máy móc hơn — sang bậc rẻ hơn. Đây là cấu hình lời gọi, không đổi hợp đồng ngữ nghĩa nào, và cũng không viết «một vai duy nhất» thành tiền đề kiến trúc — mục đích là để phần lợi chi phí của việc «model bậc rẻ mạnh lên» cũng vào được;
  - Chỗ đáp đất khi hiện thực: cấu hình roles hỗ trợ ba key vai `import_segment` / `import_analyze` / `import_synthesize`; không cấu hình thì rơi về architect. Ngân sách đôi và các tùy chọn thinking/có cấu trúc của mỗi hàm thì phái sinh độc lập theo năng lực thật của bậc tương ứng (cửa sổ nhỏ của bậc nhỏ chỉ ràng buộc chính hàm đó), lượng dùng thì hạch toán theo vai của bậc thật;
- Tiếp vào phần failover đã cấu hình của vai đã chọn;
- Dùng reasoning effort của vai đã chọn, và quyết có gửi tham số thinking hay không qua phép dò năng lực;
- Ghi siêu dữ liệu session và usage theo provider/model thật;
- Thu vào sentinel ngân sách hiện có (đáp đất 2026-07-16): trước khi khởi động thì qua `Refuse()` cùng kỷ luật với Start/Resume/Continue; khi đang chạy mà ngân sách dừng cứng thì hủy context của chính việc nhập qua `abortWithEvent` (Host đăng ký cancel của tác vụ độc chiếm, không còn chỉ tạm dừng cái Engine vốn chưa chạy).

### 13.2 Năng lực đầu ra có cấu trúc

Bốn loại sản phẩm của việc nhập dùng chung `llmcontract.Execute`: khi model hoặc cấu hình của người dùng khai rõ là hỗ trợ thì gửi JSON Schema nguyên bản; khi năng lực chưa rõ hoặc rõ là không hỗ trợ thì tự sinh Prompt Contract từ chính bản Schema đó. Chế độ nguyên bản kiểm phản hồi đầy đủ, chế độ tương thích thì mới trích đối tượng JSON cân bằng; cả hai đường đều thi hành cùng một phép kiểm Schema trước, rồi giải mã DTO và thi hành phép kiểm nghiệp vụ. Sau khi request báo lỗi thì không được âm thầm xóa schema rồi thử lại; phán đoán năng lực sai hay Provider từ chối thì buộc phải phơi ra.

### 13.3 Tách riêng thất bại về request, ngữ nghĩa và dung lượng

- Lỗi tầng request: chỉ thử lại các lỗi timeout, giới hạn tần suất, lỗi mạng mà adapter gắn cờ rõ là retryable, dùng ngữ nghĩa lùi dần hiện có và tiếp tục cho tới khi thành công hoặc context bị hủy;
- Lỗi tầng đầu ra: phản hồi lỗi cụ thể của việc phân tích JSON hay của Validate cho cùng model đó, tiếp tục tự lành cho tới khi thành công hoặc ngữ cảnh bị người dùng/hệ thống ngân sách hủy; còn vi phạm hợp đồng Schema nguyên bản, từ chối trả lời và bị cắt thì không hỏi lại một cách mù quáng.
- Việc thử lại không được im lặng: mỗi lần lùi dần ở tầng request ("đang thử lại lần thứ N · thử lại sau Xs") và mỗi lần hỏi lại ở tầng đầu ra đều hồi đáp lên panel nhập bằng sự kiện tiến độ — không hồi đáp thì người dùng sẽ phán sai là bị treo. Sự kiện lùi dần chỉ mang theo thời điểm đến hạn (`RetryAt`), còn số giây còn lại thì tầng render tính theo từng tick để tạo thành đồng hồ đếm ngược thời gian thực (dùng chung cơ chế với panel sự kiện của bàn sáng tác); trong kỳ chạy thì panel có spinner thường trú ở trên cùng kèm thời gian đã dùng, phần đuôi log còn có con trỏ hình sao cùng kiểu với phần stream.
- Phần hồi đáp lỗi không được rỗng nghĩa: message của gateway thường chỉ có một câu "Provider returned error"; phần hồi đáp và văn bản thất bại thì thống nhất kèm các sự thật có cấu trúc của adapter (phân loại lỗi/mã trạng thái HTTP/provider/model, `modelErrDetail` trích từ chuỗi lỗi của litellm qua errors.As), sự thật đặt trước, khi bị cắt thì ưu tiên giữ lại.
- Các giai đoạn dài không được im lặng: việc chia theo từng khối, việc tổng hợp theo từng khoảng thì gọi model bên trong hàm (một khối có thể mất mấy phút), nên hồi đáp phần tiến triển theo từng khối/từng khoảng qua `callProfile.step` ("đang chia khối N/M, đã nhận K biên"). Key của sự kiện chỉ dành cho phần lùi dần của request (là cái nhất thời trong cùng một lời gọi, nhảy tại chỗ); còn việc hỏi lại do kiểm thì là sự kiện ngữ nghĩa xuyên lời gọi, mỗi cái một dòng riêng để giữ lịch sử — dùng chung Key sẽ làm khối sau đè khối trước và mất hết đầu mối để tra.
- Chuyển ghi log toàn phần: mỗi sự kiện tiến độ (gồm cả các dòng thử lại bị panel đè tại chỗ) đều ghi vào **log riêng của việc nhập** `<gốc sách>/logs/import.log` (không trộn dòng với tui.log, một lần nhập là một tệp để xem trọn bản chuyển ghi); phần lùi dần của request và việc hỏi lại về ngữ nghĩa thì còn ghi trọn chuỗi lỗi vào cùng log đó.
- Hồi đáp ngữ nghĩa của model chứ không chỉ có phép đếm máy móc: việc chia theo khối thì hồi đáp các tiêu đề model nhận ra ("model nhận ra: Chương mười hai Đêm phong tuyết / … (tổng N chỗ)"), việc phân tích theo chương thì hồi đáp sự kiện cốt lõi ("chương 12 «Đêm phong tuyết»: ……"), việc tổng hợp xong thì hồi đáp phần khái quát cả sách (tóm tắt premise) — người dùng nên thấy được model đã đọc hiểu cái gì.
- Lỗi dung lượng: `StopReasonLength` thì không thử lại nguyên trạng, cũng không vào vòng lặp tự sửa ngữ nghĩa; analysis batch thì khi phần văn bản phân tích được thì lưu tiền tố hợp pháp liên tiếp theo §9.5, nếu không thì ghi `prefix_salvage=unavailable` rồi thu nhỏ và gom lô lại; các hàm ngữ nghĩa còn lại thì thất bại tường minh luôn và giữ phản hồi thô.

Việc xác thực, quyền, model không hỗ trợ và xung đột trạng thái thì thất bại ngay. Không có việc mô phỏng thành công, đỡ lưng bằng đối tượng rỗng hay bỏ qua chương thất bại.

### 13.4 Ngân sách đầu vào và đầu ra

Mỗi loại hàm ngữ nghĩa có schema, ngân sách đầu vào, phần chừa cho suy luận và ngân sách đầu ra thấy được riêng:

- Đầu ra của việc chia đoạn chỉ chứa các biên của owned range hiện tại;
- analysis batch đồng thời bị context window và giới hạn completion ràng buộc, đầu ra là sự thật từng chương của một dải liên tiếp có hạn;
- RangeDigest chỉ chứa một khoảng liên tiếp;
- BookSynthesis chỉ chứa sự thật toàn cục và dải tập cung, không xuất lặp đối tượng chương.

Mỗi request trước khi gửi đều ghi lại đầu vào ước lượng, phần chừa cho suy luận, số max tokens đã xin và đầu ra thấy được dự kiến. Việc ước lượng chỉ quyết việc chia khối/gom lô, không xóa chính văn hay trường sự thật. Vì vậy không tồn tại cái kết cấu kiểu "tổng số chương càng nhiều thì một phản hồi nào đó tất phải dài hơn", và cũng không được chỉ vì đầu vào nhét được mà bỏ qua rủi ro đầu ra bị cắt.

## 14. Sự kiện, log và chẩn đoán

### 14.1 Các giai đoạn của sự kiện

```go
const (
	StageIngesting            Stage = "ingesting"
	StageSegmenting           Stage = "segmenting"
	StageAwaitingConfirmation Stage = "awaiting_confirmation"
	StageAnalyzing            Stage = "analyzing"
	StageSynthesizing         Stage = "synthesizing"
	StageAwaitingStoryStatus  Stage = "awaiting_story_status"
	StageValidating           Stage = "validating"
	StagePublishing           Stage = "publishing"
	StageDone                 Stage = "done"
	StageError                Stage = "error"
)
```

Mỗi sự kiện chứa action, chương/khoảng hiện tại, tổng số, thời lượng và lỗi tùy chọn. Sự kiện analysis batch còn chứa thêm dải lô, phần ước lượng ngân sách, StopReason và dải tiền tố đã nộp. Event là phép chiếu, không tham gia việc khôi phục.

### 14.2 Lỗi buộc phải tới đồng thời ba chỗ

1. Panel nhập của TUI: tự xuống dòng, giữ trọn chuỗi lỗi;
2. `tui.log`: ghi có cấu trúc stage, chapter/range, model, attempt và error;
3. `meta/import/failures/`: lưu siêu dữ liệu của lần thất bại cuối và phản hồi của model chưa bị cắt gọt.

Chính văn tiểu thuyết gốc thì không ghi vào log thường, cũng không vào phần xuất chẩn đoán tẩy thông tin riêng mặc định. Phản hồi thất bại nằm trong chính thư mục sách của người dùng, thông báo lỗi cho ra đường dẫn rõ ràng.

### 14.3 Session và Usage

Mỗi lời gọi ngữ nghĩa đều ghi lại:

- Tên task ổn định, như `import/segment/0003`, `import/analyze/0054-0061`;
- Phản hồi thô của assistant;
- provider/model và usage;
- structured mode, thinking level và kết quả kiểm đầu ra.

Lượng dùng quy thống nhất vào vai architect, để chi phí của việc nhập thấy được trong ngân sách.

## 15. Vòng đời và đồng thời

- Việc nhập loại trừ lẫn nhau với các tác vụ ghi của Engine, việc cùng lên kế hoạch theo giai đoạn, và simulation;
- Trong kỳ nhập thì cùng một cuốn sách chỉ cho phép một Runner;
- Người dùng hủy sẽ hủy các lời gọi model đang bay, còn các sự thật đã xuống đĩa nguyên tử trong khu làm việc thì được giữ;
- Hủy trước khi xác nhận thì không sửa Store chính thức;
- Hủy sau khi bắt đầu phát hành thì không rollback theo phỏng đoán, lần sau chỉ khôi phục việc phát hành một cách chính xác;
- Bản đầu thì các analysis batch chạy tuần tự với nhau, còn trong một lô thì một lời gọi model trả về sự thật theo thứ tự chương; việc phát hành chính thức vẫn tuần tự theo chương;
- `Host.New/Resume` thi hành cửa gác ở §12.5 khi có lần nhập chưa xong, ngữ nghĩa loại trừ lẫn nhau vẫn thành lập xuyên các lần khởi động lại process;
- Việc xuất có cho phép đồng thời hay không thì giữ ngữ nghĩa chỉ-đọc hiện có, nhưng nó chỉ thấy được các chương đã phát hành chính thức.

## 16. Các bất biến cốt lõi

1. Mỗi hiện vật trong khu làm việc đều được định danh bởi `SchemaVersion + InputDigest + Payload`; chỉ khi dựng lại được cùng `InputDigest` từ đầu vào ngữ nghĩa thật hiện tại thì mới dùng lại được.
2. Manifest ứng với một ảnh chụp nguồn đã chuẩn hóa duy nhất; mỗi đoạn văn bản nguồn không rỗng buộc phải có và chỉ có một chỗ thuộc về.
3. Model chỉ được tham chiếu SourceUnit, mốc neo nguyên văn và số chương mà Host cấp; Go chỉ nhận những tọa độ ánh xạ duy nhất được về byte của nguồn.
4. analysis batch chỉ được nộp phản hồi đầy đủ, hoặc tiền tố hợp pháp liên tiếp dài nhất tính từ chương đầu dưới `StopReasonLength`; thiếu bất kỳ chương nào cũng chặn các phân tích và việc tổng hợp phía sau.
5. Dải tập cung buộc phải liên tiếp, không chồng lấn và bao phủ trọn `1..N`; Foundation chính thức chỉ được phát hành từ một Synthesis đã qua kiểm chứng đầy đủ.
6. Chương chính thức chỉ được phát hành qua `commit_chapter` theo thứ tự; hiện vật chính thức đã tồn tại thì chỉ được dùng lại một cách bất biến khi digest nội dung giống nhau, khác nhau thì thất bại vì xung đột.
7. Bất kỳ thất bại nào của model cũng không được giải thích thành "không có nội dung" hay "tiếp chương sau", không được vá nửa JSON hay bỏ qua chương thất bại.
8. `done` buộc phải được chứng minh đồng thời bởi hiện vật trong khu làm việc, hiện vật chính thức, Progress, PendingCommit và checkpoint; trước `done` thì Engine thường không được khởi động.

## 17. Cấu trúc package và các giao diện hẹp

Giữ `internal/host/imp`, tách theo trách nhiệm:

```text
imp/
├── types.go       Options/Event công khai và các DTO ngữ nghĩa
├── source.go      đọc, giải mã, chuẩn hóa, SourceUnit/anchor
├── workspace.go   hiện vật nguyên tử của meta/import và InputDigest
├── call.go        lời gọi LLM có kiểu dành riêng cho import
├── segment.go     phép chiếu kết cấu, hàm ngữ nghĩa về biên, kiểm độ bao phủ
├── analyze.go     lô liên tiếp theo ngân sách đôi, sự thật từng chương và tiền tố khi bị cắt
├── synthesize.go  RangeDigest và BookSynthesis
├── publish.go     đối chiếu Foundation và phát hành qua commit_chapter
└── runner.go      LoadState → NextAction → thi hành
```

Không thêm mới `ImportEngine`, `Task`, `WorkflowInstance`, Repository tổng quát hay bảng đăng ký plugin.

Các phụ thuộc mà Host tiêm vào thì giữ hẹp:

```go
type Deps struct {
	Store         *store.Store
	CommitChapter ChapterCommitter
	Model         agentcore.ChatModel
	Runtime       ModelRuntime
	Prompts       Prompts
	Emit          func(Event)
}
```

`ModelRuntime` chỉ mang theo các sự thật của lời gọi như context window, giới hạn completion, thinking, callback session/usage, và chừa một chỗ chọn bậc model cho mỗi hàm ngữ nghĩa (mặc định architect); không để `imp` phụ thuộc ngược vào cả Host, cũng không hàn cứng một vai duy nhất thành tiền đề kiến trúc.

## 18. Giao diện người dùng

### 18.1 Nhập mới

```text
/import <path> [--yes] [--story=open|closed] [--continue] [--guide=<chỉ dẫn chia>]
```

Hành vi mặc định: tạo ảnh chụp nguồn, chia theo ngữ nghĩa rồi mở phần xem trước để xác nhận, phát hành xong thì đặt một Hold riêng cho việc nhập. Xóa `from=N`.

Ba tùy chọn đầu là các phép cấp quyền tường minh độc lập với nhau, và ghi vào `intent.json`:

- `--yes`: tự nhận cách chia sau khi kiểm độ bao phủ qua; không quyết trạng thái truyện uncertain, không bỏ qua Hold khi hoàn thành;
- `--story=open|closed`: chỉ cung cấp lựa chọn của người dùng trước, cho trường hợp synthesis trả về uncertain; khi model đã phán rõ open/closed thì không ghi đè sự thật của model;
- `--continue`: không tạo Hold riêng cho việc nhập; không lách advance mode bình thường, dưới `review` thì vẫn cần `/next`.

`--guide` khác ba cái trên: nó không phải phép cấp quyền lúc khởi động mà là đầu vào ngữ nghĩa của việc chia, ghi xuống đĩa thành `guidance.txt` trong khu làm việc (có thể chứa dấu cách, phải đặt ở cuối lệnh). Xem §18.3.

Vì vậy `/import book.txt --yes` vẫn dừng lại sau khi nhập xong; chỉ khi truyền thêm `--continue` thì mới cấp quyền cho luồng sáng tác tiếp sức khi cửa gác bình thường cho phép.

### 18.2 Khôi phục

Khi cùng một cuốn sách có khu làm việc đang hoạt động thì chạy `/import` không tham số là suy ra bước sau ngay từ sự thật và intent đã lưu; đường dẫn tệp nguồn và các tham số khởi động đều không phải thứ bắt buộc để khôi phục. `/import <path>` với đường dẫn mới thì không được ghi đè khu làm việc đang hoạt động.

Phần nhập chưa xong buộc phải chủ động thấy được, không thể đợi tới lúc việc sáng tác của người dùng bị cửa gác từ chối mới phơi ra. Hiện thực thành ba lời nhắc tăng dần:

1. Lúc khởi động thì TUI phát hiện một lần (`imp.ResumeSummary`, sinh mô tả theo giai đoạn dựa trên `NextAction`), giao diện chào hiện nổi bật "phát hiện phần nhập chưa xong (đã phân tích N/M chương), nhập /import để khôi phục từ chỗ ngắt";
2. Người dùng phớt lời nhắc mà thử sáng tác thì cửa gác xuyên khởi động lại (§12.5) từ chối cho engine khởi động và phát sự kiện cảnh báo;
3. Trong lúc khôi phục thì panel nhập hiện giai đoạn hiện tại và tiến độ theo thời gian thực.

### 18.3 Chia lại

Người dùng sau khi soát phần xem trước thì dùng `/import --guide=<giải thích bằng ngôn ngữ tự nhiên>` để nhận biên lại, ví dụ `--guide=Màn phụ · X cũng là chương riêng`. Phần chỉ dẫn được ghi vào `guidance.txt` của khu làm việc và thu vào `InputDigest` của segmentation: chỉ dẫn thay đổi làm cách chia cũ cùng confirmation cũ, các phân tích và synthesis không dựng lại được cùng `InputDigest`, nên tự nhiên làm lại hết; không cung cấp trình sửa regex.

### 18.4 Hủy

Hủy trước khi xác nhận thì chỉ giữ khu làm việc; trước khi phát hành thì bỏ được cả khu làm việc một cách tường minh. Sau khi bắt đầu phát hành thì không cung cấp thao tác bỏ kiểu "giả vờ như chưa có gì xảy ra", chỉ cho phép khôi phục cho xong hoặc để người dùng tự xử cuốn sách chính thức theo cách khác.

## 19. Thứ tự thi hành

### Giai đoạn một: khu làm việc và việc suy trạng thái thuần

- Manifest, Intent, ảnh chụp nguồn, `Artifact/InputDigest`, đọc-ghi nguyên tử;
- `LoadState/NextAction`;
- Kiểm tiền đề cho sách trống và việc khôi phục cùng nguồn;
- Xóa phần thiết kế phụ thuộc vào `ResumeFrom`.

Giai đoạn này không gọi model, chứng minh trước rằng sự thật khôi phục không có chỗ nhập nhằng.

### Giai đoạn hai: chia theo ngữ nghĩa và xác nhận

- SourceUnit, mảnh ảo cho dòng siêu dài, mốc neo nguyên văn và việc chia khối theo ngân sách ngữ cảnh;
- typed call BoundaryDecision;
- Kiểm độ bao phủ toàn văn;
- Phần xem trước của TUI, việc nhận biên lại bằng ngôn ngữ tự nhiên, `--yes` và hiện vật confirmation.

Dùng tiêu đề phi chuẩn, tiêu đề tập, lời nói đầu và cước chú để kiểm chứng "không sót một chữ" trước.

### Giai đoạn ba: sự thật từng chương theo các lô liên tiếp

- `ImportedChapterFacts`;
- Quy hoạch lô theo ngân sách đôi context/completion;
- Phân tích tuần tự giữa các lô và ledger liên tục dạng nén;
- Khôi phục theo hiện vật `InputDigest` của từng chương;
- Bị cắt thì là «thất bại + thu nhỏ rồi gom lô lại», và ghi lại phần văn bản có dùng được không;
- Đấu dây session, usage, failover, thinking, lỗi dung lượng và việc thử lại theo phản hồi kết cấu.

### Giai đoạn ba·bù: vớt tiền tố khi bị cắt (tối ưu hiệu năng, để lại sau được)

- Phân tích tiền tố hợp pháp liên tiếp của `StopReasonLength` (§9.5);
- Chỉ bật khi phần văn bản phân tích được, không đổi tính đúng của việc khôi phục; bật/tắt riêng, nghiệm thu riêng.

### Giai đoạn bốn: tổng hợp phân tầng và Foundation

- RangeDigest nhận biết context;
- BookSynthesis;
- Kết cấu tập cung dạng dải;
- StoryStatus;
- Lắp và kiểm chứng Foundation đầy đủ.

### Giai đoạn năm: phát hành và chuyển giao

- Đối chiếu digest từng hiện vật của Foundation;
- Dùng lại `commit_chapter` để phát hành;
- Hủy/khôi phục sau sập;
- Cửa gác Engine xuyên khởi động lại;
- AdvanceHold mặc định khi nhập xong và `--continue` tường minh;
- TUI/log/failure artifact đầy đủ.

### Giai đoạn sáu: xóa phần hiện thực cũ

- Xóa phần phán quyết định dạng chương của `splitter.go`;
- Xóa tagged envelope;
- Xóa lời gọi cả sách `ReverseFoundation`;
- Xóa ngưỡng số chương `pickScale`;
- Xóa `ResumeFrom/from=N`;
- Xóa các ràng buộc prompt kiểu "cố định một tập, 1~3 cung, cưỡng chế open threads";
- Hiện thực xong rồi mới cập nhật phần mô tả luồng cũ trong README và architecture.

## 20. Kiểm thử và nghiệm thu

### 20.1 Kiểm thử hàm thuần và kiểm thử tính chất

- Mọi segmentation hợp pháp đều thỏa việc dải toàn văn không chồng lấn, không lỗ hổng;
- SourceUnit bất hợp pháp, mốc neo nguyên văn không duy nhất, biên lộn thứ tự và trùng thì tất phải bị từ chối;
- Thứ tự biên phán theo thứ tự số của `(Line, Part)`; dựng một tập unit mà "thứ tự từ điển và thứ tự số cho kết luận trái nhau", rồi khẳng định là qua theo thứ tự số;
- Cả dòng bình thường và mảnh ảo đều ánh xạ lại được không mất mát về cùng một bản byte nguồn đã chuẩn hóa;
- Mọi ranges tập cung hợp pháp đều bao phủ đúng `1..N`;
- Cùng đầu vào ngữ nghĩa thì sinh ổn định cùng `InputDigest`, và bất kỳ đầu vào thật nào thay đổi cũng làm hiện vật tương ứng lệch;
- Việc gom lô theo ngân sách đôi không vượt các ràng buộc context/completion đã cho;
- NextAction bất biến với cùng một ảnh chụp sự thật.

Làm fuzz/property test cho việc ánh xạ tọa độ, việc lắp dải, ngân sách lô và `InputDigest`, không khẳng định rằng model sẽ xuất ra một tiêu đề cố định nào.

### 20.2 Kiểm thử hợp đồng với model

- Tên chương phi chuẩn và kết cấu tập-chương lai;
- Mở đầu/khai từ/ngoại truyện được model phán theo ngữ nghĩa là chương;
- front/back matter được trình bày rõ chứ không bị bỏ mất;
- Cả cuốn một dòng, một dòng nhiều chương và dòng vượt ngân sách thì chia chính xác qua SourceUnit + anchor;
- Chương yên tĩnh thì cho phép characters rỗng;
- JSON bất hợp pháp, thiếu trường, dải vượt biên thì vào phần thử lại theo phản hồi;
- analysis batch trả về các đối tượng từng chương liên tiếp, không được nhảy số hay trùng;
- `StopReasonLength` thì chỉ lưu tiền tố hợp pháp liên tiếp dài nhất, nửa đối tượng và các đối tượng không liên tiếp phía sau thì không lưu;
- Khi chế độ có cấu trúc không cho ra phần văn bản phân tích được thì khẳng định là đi theo «thất bại + thu nhỏ rồi gom lô lại» và log ghi rõ `prefix_salvage=unavailable`;
- JSON hỏng dưới `StopReasonStop` bình thường thì không vào đường vớt tiền tố khi bị cắt;
- Khi lô một chương mà vẫn bị cắt thì thất bại tường minh, không sinh sự thật rỗng;
- Lỗi phân tích/nghiệp vụ của Prompt Contract thì liên tục phản hồi để tự lành, cho tới khi thành công hoặc ngữ cảnh bị hủy; còn vi phạm hợp đồng Schema nguyên bản, từ chối trả lời và bị cắt thì giữ ngay phản hồi thô rồi kết thúc;
- Các model không hỗ trợ thinking/JSON Schema thì không nhận tham số bất hợp pháp.

Kiểm thử với model thì khẳng định hợp đồng và bất biến, không khẳng định phán đoán văn học chính xác.

### 20.3 Ma trận sập

Ít nhất bao phủ:

- Sau ảnh chụp nguồn;
- Sau segmentation, trước khi xác nhận;
- Trước và sau khi đối tượng thứ N của analysis batch xuống đĩa;
- Trước và sau khi chương cuối của tiền tố khi bị cắt theo độ dài xuống đĩa;
- Giữa RangeDigest;
- Sau Synthesis, trước Foundation;
- Trước và sau mỗi hiện vật Foundation;
- Các cửa sổ draft/StartChapter/PendingCommit/progress/checkpoint;
- Sau khi chương cuối nộp, trước và sau AdvanceHold;
- Khởi động lại sau khi Foundation/các chương phát hành một phần rồi thử Host.Resume thường.

Mỗi cửa sổ sau khi khởi động lại thì chỉ được tiếp động tác hiện tại, không được tiêu thụ lặp một lời gọi model đã thành công, và cũng không được nhảy qua hiện vật thất bại. Khi `NextAction != done` thì Engine thường buộc phải bị cửa gác chặn, cho tới khi việc khôi phục việc nhập xong.

### 20.4 Hình dạng hồi quy của #83

Dựng đầu vào 54 chương và dài hơn, kiểm chứng:

1. Không có lời gọi đơn lẻ nào đòi xuất ra dàn ý chi tiết của 54 chương;
2. analysis batch gom lô đồng thời theo ngân sách context của đầu vào và completion của đầu ra thấy được, không nhét quá nhiều chương chỉ vì đầu vào chứa được;
3. Giai đoạn ba·bù: mô phỏng `StopReasonLength` kiểu "13 chương đầu đầy đủ, chương 14 bị cắt", thì chỉ nộp 13 chương đầu, động tác kế tiếp bắt đầu từ chương 14; khi chưa hiện thực việc vớt tiền tố thì cả lô thất bại rồi gom lô lại từ chương đầu của lô;
4. Mô phỏng phản hồi bị cắt mà không có đối tượng hoàn chỉnh nào, thì lỗi hiện đầy đủ, ghi log, lưu phản hồi thô và không ghi hiện vật phân tích;
5. Mô phỏng JSON hỏng bình thường, thì đi theo phần thử lại bằng phản hồi kết cấu chứ không phải việc vớt tiền tố;
6. Sau khi sửa thì chỉ chạy lại động tác khuyết đầu tiên, không làm lại các chương đã xong;
7. Tiêu đề phi chuẩn thì vào phần xem trước qua việc chia theo ngữ nghĩa, không phải vá bằng cách thêm regex.

### 20.5 Chuẩn nghiệm thu cuối cùng

1. Chế độ tương tác mặc định để người dùng thấy và xác nhận toàn bộ biên chương trước khi ghi đĩa chính thức; `--yes` tự nhận được một cách tường minh và để lại hiện vật kiểm toán tương đương.
2. Mọi văn bản nguồn không rỗng đều tìm được một chỗ thuộc về duy nhất từ segmentation.
3. 200~500 chương thì không tạo thành một lời gọi model đọc chính văn cả sách và xuất ra mọi đối tượng chương; mỗi lô phân tích đồng thời bị ngân sách đầu vào và đầu ra ràng buộc, đầu ra toàn cục chỉ biểu đạt sự thật toàn cục và dải tập cung.
4. Sập ở bất kỳ giai đoạn nào cũng khôi phục chính xác được mà không cần `from=N`.
5. Trạng thái chính thức giữ nguyên không đổi trước khi việc kiểm chứng ngữ nghĩa đầy đủ xong.
6. Việc phát hành bị ngắt thì saga commit hiện có khôi phục được, và không nộp lặp chương.
7. Phần nhập chưa xong thì sau khi khởi động lại không khởi động được Engine thường; chỉ xem, chẩn đoán hoặc khôi phục việc nhập được.
8. `--yes` không bỏ qua Hold khi hoàn thành; chỉ `--continue` độc lập mới bỏ qua, và nó cũng không lách cửa gác review.
9. Năng lực, lượng dùng, StopReason, phần ước lượng ngân sách và lỗi của model và provider đều quan sát được.
10. Đổi sang model mạnh hơn là cải thiện được chất lượng việc chia, phân tích và tổng hợp, đồng thời mở rộng tự nhiên lô an toàn, giảm số lần gọi, mà không phải sửa luật văn học trong Go.

## 21. Tính mở rộng hướng tới tương lai

Tính mở rộng của phương án này đến từ những biên ổn định, chứ không từ các trừu tượng dựng trước:

- Model hiểu tốt hơn: ba loại hàm ngữ nghĩa Boundary/Chapter/Synthesis chính xác lên luôn;
- Cửa sổ ngữ cảnh hoặc đầu ra mở rộng: bộ ngân sách đôi tự mở rộng analysis batch an toàn, và giảm số khối cùng số tầng Reduce;
- Đầu ra có cấu trúc mạnh hơn: typed-call tự chọn ràng buộc provider mạnh hơn;
- Model bậc rẻ mạnh lên: phần segment thiên về máy móc hơn thì chuyển sang bậc rẻ hơn được, phần lợi chi phí theo đó mà vào, không đổi hợp đồng ngữ nghĩa;
- Định dạng đầu vào mới: chỉ cần chuyển EPUB v.v. thành cùng một văn bản đã chuẩn hóa và cùng hệ tọa độ SourceUnit;
- Ngữ nghĩa cả sách mới: thêm trường có bên tiêu thụ rõ ràng vào `ImportedChapterFacts` hoặc `BookSynthesis`, không đổi giao thức khôi phục và phát hành;
- Việc cùng lên kế hoạch với người dùng mạnh hơn: thêm phần sửa bằng ngôn ngữ tự nhiên ở biên xác nhận, không viết kiến thức về định dạng vào code.

Phần không đổi là độ bao phủ toàn văn, danh tính `InputDigest`, việc kiểm dải và việc phát hành bất biến. Đây là phần sổ sách mà model có mạnh cỡ nào cũng không đáng giao cho model; còn phần ngữ nghĩa biến động thì để hết trong các hàm của model, nên phần lợi từ việc nâng cấp model xuyên được tới kết quả của sản phẩm.

## 22. Quyết định cuối cùng

Dùng **đường ống nhập ngữ nghĩa theo giai đoạn**, từ chối hai hướng:

1. Tiếp tục mở rộng regex chương và các ngưỡng số chương/số cung;
2. Dùng một Agent vòng lặp dài tự do để tiếp quản toàn bộ việc nhập.

Biên cuối cùng là:

> **Model quyết định văn bản có nghĩa gì; code bảo đảm từng chữ đã đi đâu, từng kết quả ứng với đầu vào nào, đầu vào và đầu ra của mỗi lời gọi đều nhét được, thất bại thì tiếp từ đâu, và khi nào thì đủ tư cách trở thành sự thật chính thức.**

Điều này vừa giữ được năng lực tự chủ của model và phần lợi trong tương lai, vừa giữ được kiến trúc gọn gàng hiện tại của ainovel-cli gồm Engine + hàm ngữ nghĩa có kiểu + tầng sự thật trên hệ tệp.
