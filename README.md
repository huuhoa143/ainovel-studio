# AINovel Studio

[English](README.en.md) · **Tiếng Việt**

**Trang giới thiệu: [ainovel.lingoreup.com](https://ainovel.lingoreup.com)** · **[Tải app cho macOS / Windows](https://github.com/huuhoa143/ainovel-studio/releases/latest)** — không cần terminal.

App desktop viết tiểu thuyết dài bằng AI, toàn tự động. Engine tất định chạy trọn một cuốn sách, model chỉ được gọi đúng những chỗ cần phán đoán: Engine định tuyến theo sự thật để điều phối ba tác tử sáng tác tự chủ Architect / Writer / Editor, và đánh thức Arbiter khi cần phán quyết ngữ nghĩa. Từ một câu yêu cầu tới một cuốn tiểu thuyết hoàn chỉnh, không cần người can thiệp.

> Đây là **bản fork tiếng Việt** của [voocel/ainovel-cli](https://github.com/voocel/ainovel-cli). Giao diện, prompt và tài liệu đã việt hóa nên AI sinh truyện tiếng Việt; xem [Ghi công](#ghi-công) ở cuối.

## Tải về & cài đặt

Tải **AINovel Studio** — app desktop gói sẵn engine và giao diện, không cần terminal, không cần
cài Go hay Node. Vào **[bản phát hành mới nhất](https://github.com/huuhoa143/ainovel-studio/releases/latest)**
rồi tải đúng một tệp cho máy của bạn:

| Máy của bạn | Tải tệp |
|---|---|
| Mac chip Apple (M1, M2, M3, M4…) | `AINovel-Studio-<phiên bản>-arm64.dmg` |
| Mac chip Intel | `AINovel-Studio-<phiên bản>-x64.dmg` |
| Windows 10/11 (64-bit) | `AINovel-Studio-Setup-<phiên bản>.exe` |

Không rõ Mac của mình dùng chip gì: menu Apple → **Giới thiệu về máy Mac này**. Dòng **Chip** ghi
"Apple M…" là chip Apple; dòng **Bộ xử lý** ghi "Intel…" là chip Intel. Các tệp `.zip` và
`.yml` trong trang phát hành là để app tự cập nhật — không cần tải.

**macOS** — mở tệp `.dmg`, kéo **AINovel Studio** vào thư mục **Applications**, rồi mở từ
Launchpad. Lần mở đầu tiên macOS hỏi *"…được tải về từ Internet. Bạn có chắc muốn mở?"* — bấm
**Mở**. Chỉ hỏi một lần (app đã được Apple kiểm duyệt).

**Windows** — tải `AINovel-Studio-Setup-….exe` rồi chạy. Bộ cài chưa có chữ ký số nên có thể gặp
hai lời cảnh báo, mỗi cái chỉ một lần:

1. Lúc tải, Edge/Chrome có thể báo tệp *"không thường được tải xuống"*: bấm **…** (hoặc mũi tên
   cạnh tệp) → **Giữ lại** (*Keep*).
2. Lúc chạy, Windows hiện hộp xanh *"Windows protected your PC"*: bấm **More info** → **Run anyway**.

App tự kiểm tra bản mới mỗi lần mở, tải ngầm, xong thì hỏi khởi động lại để cập nhật. Muốn kiểm
tra ngay: menu **AINovel Studio → Kiểm tra cập nhật…**.

## Lần đầu mở app

App mở thẳng màn **Cài đặt → Model & khóa API**. Dán API key của nhà cung cấp bạn dùng
(OpenRouter, Anthropic, Gemini, OpenAI…), chọn model mặc định, bấm lưu là tạo truyện được ngay.

Cấu hình (gồm khóa API) nằm trong thư mục dữ liệu của app, **trên máy bạn**:

| Hệ điều hành | Tệp cấu hình |
|---|---|
| macOS | `~/Library/Application Support/AINovel Studio/config.json` |
| Windows | `%APPDATA%\AINovel Studio\config.json` |

Nếu bạn từng dùng bản cũ và có thư mục `~/.ainovel`, lần mở đầu tiên app tự **chép** `config.json`
cùng luật viết (`rules/`) và văn phong (`style/`) chung sang chỗ mới — chỉ một lần, tệp cũ được
giữ nguyên, không bị xóa. Từ đó app chỉ đọc và ghi đúng một tệp ở bảng trên.

## Truyện nằm ở đâu

Mỗi truyện là một thư mục trong `books/` cạnh tệp cấu hình:

- macOS: `~/Library/Application Support/AINovel Studio/books`
- Windows: `%APPDATA%\AINovel Studio\books`

Menu **Tệp → Mở thư mục truyện** mở thẳng chỗ đó; **Tệp → Mở thư mục log** mở chỗ ghi log khi
cần báo lỗi.

**Mang truyện cũ vào.** Truyện viết bằng bản cũ (thư mục `output/` ở đâu đó trên máy) đưa vào
bằng **Tệp → Nhập truyện từ thư mục…**: chọn thư mục chứa truyện, app chép mọi truyện hợp lệ vào
`books/`. Truyện trùng tên với truyện đã có thì bỏ qua và báo lại; thư mục gốc không bị đụng tới.

<p align="center">
  <img src="docs/assets/studio.gif" alt="Studio: Tủ truyện → Tiến độ → Đọc truyện → Chi phí → Model theo vai" width="820">
</p>

<p align="center">
  <sub>Studio, dữ liệu thật từ một lượt chạy: <b>Tủ truyện</b> → <b>Tiến độ</b> của một
  cuốn → <b>Đọc truyện</b> → <b>Chi phí tổng</b> → <b>Model theo vai</b>.</sub>
</p>

<table>
<tr>
<td width="50%" valign="top">
  <img src="docs/assets/ban-thao.png" alt="Đọc bản thảo, kèm bản duyệt của Editor">
  <sub><b>Đọc truyện.</b> Chương đã nghiệm thu, đặt cạnh khế ước chương và bản duyệt bảy chiều
  của Editor — mỗi chiều buộc phải dẫn nguyên văn làm chứng.</sub>
</td>
<td width="50%" valign="top">
  <img src="docs/assets/chi-phi-xuong.png" alt="Chi phí tổng, bổ theo vai và theo model">
  <sub><b>Chi phí tổng.</b> Bổ theo vai và theo model. Khi có lượt model không trả số liệu
  dùng, studio nói thẳng là con số đang thiếu thay vì lặng lẽ cộng sai.</sub>
</td>
</tr>
</table>

## Đặc điểm

- **Engine tất định + nhiều tác tử phối hợp** — Engine điều phối ba tác tử sáng tác tự chủ Architect / Writer / Editor theo bảng quyết định dựa trên sự thật; vòng lặp chính không tốn một lời gọi LLM nào, hành vi kiểm thử vét cạn được
- **Phán quyết ngữ nghĩa có thể kiểm toán** — chọn kiến trúc sư, phân loại can thiệp, đường ra khi thất bại đều do Arbiter quyết trong một lời gọi duy nhất; mỗi phán quyết ghi xuống đĩa và phát lại được. Càng đơn giản càng ổn định, từ chối điều phối phức tạp
- **Khôi phục checkpoint ở cấp step** — mỗi tool chạy xong là ghi một checkpoint, sập máy hay tắt app giữa chừng vẫn khôi phục chính xác tới bước plan/draft/check/commit
- **Quy hoạch cuốn dần hai tầng tập–cung** — truyện dài không còn quy hoạch toàn bộ chương một lần. Ban đầu chỉ quy hoạch khung 2 tập đầu + chương chi tiết của cung 1; các cung/tập sau do Architect mở rộng khi viết tới, mỗi lần mở rộng đều tham chiếu tóm tắt phía trước và trạng thái nhân vật nên quy hoạch xa không rỗng
- **Gợi ý chương liên quan thông minh** — mỗi chương khi viết, hệ thống tự gợi ý các chương lịch sử liên quan theo bốn chiều: phục bút, nhân vật xuất hiện, biến động trạng thái, quan hệ; kèm dự báo chương kế tiếp để giữ tính liên tục cho truyện 500+ chương
- **Chiến lược ngữ cảnh tự thích ứng** — tự chuyển giữa toàn phần / cửa sổ trượt / tóm tắt phân tầng theo tổng số chương, đủ sức cho truyện 500+ chương
- **Duyệt chất lượng bảy chiều** — Editor duyệt theo bảy chiều: nhất quán thiết định, hành vi nhân vật, nhịp, mạch tự sự liền lạc, phục bút, móc, và phẩm chất thẩm mỹ; riêng chiều thẩm mỹ chia nhỏ thành năm mục chất cảm miêu tả / thủ pháp tự sự / độ phân biệt đối thoại / chất lượng dùng từ / sức lay động cảm xúc, mỗi mục buộc phải dẫn nguyên văn làm chứng
- **Góp ý thời gian thực** — trong lúc viết có thể gửi góp ý bất cứ lúc nào (không cần tạm dừng); hệ thống tự lượng định phạm vi ảnh hưởng và viết lại những chương bị ảnh hưởng
- **Duyệt từng chương tùy chọn** — mặc định AI tự viết liên tục; bật **Duyệt từng chương** thì mỗi chương mới chỉ được viết khi bạn cho phép, viết lại và khôi phục sau sập máy không tiêu lẫn lượt cho phép
- **Nhập, học văn phong, xuất bản** — nhập một cuốn có sẵn (`.txt`/`.md`) để viết tiếp, dựng hồ sơ văn phong từ văn mẫu, xuất TXT hoặc EPUB bất cứ lúc nào
- **Tiếng Việt là mặc định** — giao diện, prompt, tài liệu tham chiếu và văn phong đều đã việt hóa nên AI sinh truyện tiếng Việt. **Chưa có tiếng Anh** — hiện trạng đầy đủ ở [docs/i18n.md](docs/i18n.md)
- **Hỗ trợ nhiều LLM** — OpenRouter / Anthropic / Gemini / OpenAI / DeepSeek / Ollama v.v., chuyển đổi tùy ý, đặt model riêng cho từng vai

## Dùng studio

### Ba màn

Điều hướng có hai tầng: **màn** ở trên, **khu** ở dưới. Cả ba màn luôn hiện ở đỉnh thanh bên trái.

| Màn | Phạm vi | Chứa |
|---|---|---|
| **Tủ truyện** | mọi truyện | danh sách truyện · dải việc cần bạn · tổng quan · Viết truyện mới · Bàn ý tưởng |
| **Cài đặt** | áp cho mọi truyện | Model & khóa API · Model theo vai · Chi phí tổng |
| **Truyện đang mở** | một truyện | Tiến độ · Đọc truyện · Nhận xét biên tập · Cần viết lại · Dàn ý · Nhân vật · Luật thế giới · Phục bút · Văn phong · Nhóm AI · Chi phí · Thông số phiên · Xuất bản & nhập |

<p align="center">
  <img src="docs/assets/quan-ly.png" alt="Màn Tủ truyện: danh sách truyện, dải việc cần bạn, tổng quan" width="820">
</p>

<p align="center">
  <sub>Màn <b>Tủ truyện</b>. Dải trên cùng chỉ hiện khi có việc thật đang chờ người — ở đây là một
  mốc tạm dừng đã ký kèm nguyên văn lý do, và một góp ý chưa xử lý.</sub>
</p>

Thanh điều khiển — nơi có nút `▶ Chạy` tiêu tiền thật — chỉ có ở màn truyện đang mở, vì một điều
khiển cho một cuốn không có việc gì ở đáy một bề mặt liệt kê mọi cuốn.

### Một truyện chạy mỗi lần

Engine chỉ mở **đúng một** cuốn mỗi lần. "Viết nhiều truyện" ở đây nghĩa là **quản lý** nhiều
cuốn kèm thứ tự ưu tiên rõ ràng, **không** phải chạy song song: hai cuốn cùng chạy là gấp đôi
tiền và gấp đôi RAM, và đó là quyết định của bạn chứ không phải của máy.

### Góp ý thời gian thực

Trong lúc AI đang viết, gõ góp ý vào ô **Góp ý** rồi gửi, **không cần tạm dừng hay khởi động lại**:

```
Đẩy tuyến tình cảm lên chương 4, thêm cảnh đối đầu giữa nam và nữ chính
```

Hệ thống tự:
1. Ghi góp ý xuống đĩa (để khôi phục sau sập máy)
2. Arbiter phán quyết ngay (trả lời trong vài giây; động tác thuộc loại điều khiển thì nộp an toàn ở biên chương)
3. Thi hành theo phán quyết: sửa thiết định thì đi qua Architect, viết lại chương đã có thì vào hàng đợi của Editor, luật viết thì xuống đĩa ngay — mỗi phán quyết kiểm toán và phát lại được

| Góp ý | Phản ứng hệ thống có thể có |
|---|---|
| "Đổi nhân vật chính thành nữ" | Sửa thiết định nhân vật, lượng định xem các chương đã viết có cần viết lại |
| "Đẩy tuyến tình cảm lên chương 4" | Điều chỉnh dàn ý, có thể viết lại chương 4 và các chương sau |
| "Thêm một nhân vật phản diện" | Cập nhật hồ sơ nhân vật và luật thế giới, đưa vào ở các chương sau |
| "Nhịp chậm quá, đẩy nhanh lên" | Điều chỉnh mật độ dàn ý của các chương sau |

### Duyệt từng chương

Mặc định AI tự viết liên tục. Khi cần đọc soát từng chương — tránh việc bạn đang đọc thì máy vẫn
viết chương mới — bật **Duyệt từng chương** trong thanh điều khiển: xong việc hiện tại thì máy dừng
trước chương mới kế tiếp và đợi bạn cho phép đúng một chương. Việc duyệt và bảo trì kết cấu
cung/tập cần thiết vẫn tự hoàn tất.

Lượt cho phép gắn với số chương cụ thể, và chỉ được tiêu sau khi chương đã nộp xong xuống đĩa,
nên app sập giữa lúc nộp cũng không vô tình viết thêm chương sau. Viết lại, gia công, duyệt và
bảo trì kết cấu không thuộc loại "chương mới" nên không bị chặn.

### Xuất bản & nhập

Khu **Xuất bản & nhập** của truyện đang mở gom ba việc cần tệp:

- **Xuất bản** — hợp nhất các chương đã hoàn thành thành **TXT** hoặc **EPUB 3** (Apple Books, bộ
  chuyển đổi Kindle đọc được), chọn được khoảng chương. Đang viết giữa đường vẫn xuất được, không
  ảnh hưởng engine đang chạy. Premise và phân cách cung là dữ liệu nội bộ nên **không vào bản
  xuất**; chương chưa xong trong khoảng chỉ định thì bỏ qua và báo lại.
- **Nhập truyện có sẵn** — **biên dịch ngữ nghĩa** một cuốn đã có (`.txt`/`.md`, UTF-8 hoặc
  GB18030) vào một **truyện trống** để viết tiếp. Model nhận biên chương, bạn đối chiếu cách chia
  (có thể gợi ý cách chia bằng lời thường), rồi đường ống tự trích sự thật từng chương, quy nạp
  ra tiền đề / nhân vật / luật thế giới / dàn ý phân tầng / la bàn, và ghi từng chương xuống đĩa.
  Bị ngắt thì chạy lại chỉ làm bù phần còn thiếu, không gọi lại model. Thiết kế đầy đủ ở
  [docs/import-pipeline.md](docs/import-pipeline.md).
- **Học văn phong** — dựng hồ sơ văn phong từ văn mẫu, hoặc nhập hồ sơ đã dựng trước đó. Hồ sơ
  được tiêm vào ngữ cảnh của Architect, Writer, Editor; mỗi tác tử chỉ học kết cấu, nhịp, móc và
  thủ pháp, không chép cách diễn đạt hay thiết định riêng của nguyên văn.

> Nhập truyện có sẵn ghi nguyên văn từng chữ thành các chương đã hoàn thành, nên nó dành cho việc
> "viết tiếp cùng một cuốn". Còn **Tệp → Nhập truyện từ thư mục…** là việc khác: chép nguyên
> những truyện đã viết bằng bản cũ vào app.

## Kiến trúc

Thiết kế cốt lõi: **tầng sự thật thì tất định, tầng ngữ nghĩa thì tự chủ**. Những chuyển trạng thái liệt kê được thì do code tất định thực thi (Engine + Route); những phán đoán có biên rõ ràng thì hỏi hàm LLM khi cần (Arbiter); còn sáng tác mở thì giao cho vòng lặp LLM tự chủ (Workers). Một câu tóm lại: một Engine tất định chạy tuần tự, ba Worker tự chủ, vài hàm Arbiter gọi khi cần, và một tầng sự thật nằm trên hệ tệp.

```
┌────────────────────────────────────────────────────────────────┐
│                    Host / Engine (tất định)                    │
│  đọc Store → Route → chạy Worker trực tiếp → lặp               │
│  phán quyết khởi động / phân loại can thiệp / bế tắc → Arbiter │
└─────┬────────────┬────────────┬────────────┬───────────────────┘
      │            │            │            │
 ┌────▼────┐  ┌────▼────┐  ┌────▼────┐  ┌────▼────┐
 │Architect│  │ Writer  │  │ Editor  │  │ Arbiter │
 │vòng LLM │  │vòng LLM │  │vòng LLM │  │ hàm LLM │
 └────┬────┘  └────┬────┘  └────┬────┘  └─────────┘
      └────────────┼────────────┘
                   │ lời gọi tool (IO + checkpoint)
┌──────────────────▼─────────────────────────────────────────────┐
│                             Store                              │
│  Progress / Checkpoint / Outline / Drafts / ...                │
└────────────────────────────────────────────────────────────────┘
```

- **Engine** — mỗi lượt đọc sự thật từ Store, phái Worker theo bảng quyết định Route; nó quyết định việc thực thi, không tham gia phán đoán văn học; khôi phục sau sập máy = đọc store rồi chạy tiếp, không có phiên nào cần phục hồi
- **Arbiter** — phán quyết ngữ nghĩa được đánh thức khi cần (chọn kiến trúc sư, phân loại góp ý của người dùng, đường ra khi thất bại/bế tắc); sự thật vào, quyết định có cấu trúc ra, mỗi phán quyết ghi xuống đĩa nên kiểm toán và phát lại được
- **Workers** — Architect / Writer / Editor là các vòng sáng tác tự chủ, mỗi vòng một ngữ cảnh riêng, phối hợp với nhau qua các hiện vật trong Store
- **Tools** — IO nguyên tử một tệp + phát lại bất biến; việc nộp chương dùng Saga bền vững + checkpoint, chỉ trả JSON sự thật, không kèm chỉ thị

App gồm hai tiến trình: vỏ Electron (cửa sổ, menu, tự cập nhật) và một tiến trình Go chạy engine
cùng HTTP API chỉ nghe trên `127.0.0.1`. Giao diện là trang tĩnh nói chuyện với API đó. Engine chạy
**trong cùng tiến trình** với API nên mọi lệnh ghi đi qua đúng những giao dịch mà engine dùng cho
chính nó — engine là nguồn sự thật duy nhất.

### Trách nhiệm từng tác tử

Trong giao diện, bốn vai mang tên Điều phối (Arbiter), Kiến trúc sư (Architect), Người viết
(Writer) và Biên tập viên (Editor).

| Vai | Trách nhiệm | Tool |
|--------|------|------|
| **Arbiter** | Phán quyết ngữ nghĩa: chọn kiến trúc sư lúc khởi động, phân loại góp ý của người dùng, đường ra khi thất bại/bế tắc | không có (một lời gọi LLM, xuất ra quyết định có cấu trúc) |
| **Architect** | Sinh tiền đề, dàn ý, hồ sơ nhân vật, luật thế giới | `novel_context` `save_foundation` |
| **Writer** | Tự chủ hoàn tất một chương: cấu tứ, viết, tự duyệt và nộp | `novel_context` `read_chapter` `plan_chapter` `draft_chapter` `check_consistency` `commit_chapter` |
| **Editor** | Đọc nguyên văn, duyệt trên hai tầng kết cấu và thẩm mỹ | `novel_context` `read_chapter` `save_review` `save_arc_summary` `save_volume_summary` |

### Luồng viết

```
Yêu cầu → Arbiter chọn kiến trúc sư → Architect quy hoạch khung + cung 1 → Writer viết từng chương → Editor duyệt cung
             (phán quyết lưu đĩa)                                                  ↑                        │
                                                                                   ├── viết lại/gia công ◄──┘
                                                                                   │
                                                                        Architect mở rộng cung/tập kế tiếp
                                                                       (tóm tắt trước + ảnh chụp nhân vật)
```

Ở mỗi bước, câu hỏi "phái ai tiếp" do bảng quyết định Route của Engine suy ra từ sự thật trong Store (đã đóng đinh bằng kiểm thử vét cạn hàng vạn tổ hợp), không tiêu bất kỳ lời gọi LLM nào.

Writer hoàn tất mỗi chương theo thứ tự cố định (nội dung viết thì hoàn toàn tự chủ, thứ tự gọi tool thì nghiêm ngặt):

1. `novel_context` — nạp ngữ cảnh (tóm tắt tình tiết trước, phục bút, trạng thái nhân vật, luật văn phong, gợi ý chương liên quan)
2. `read_chapter` — đọc lại phía trước để tìm lại giọng và nhịp
3. `plan_chapter` — cấu tứ mục tiêu, xung đột, đường cong cảm xúc của chương này; kết quả là **khế ước chương**, tức định nghĩa hoàn thành của chương này, và cũng là bản mà Editor đối chiếu khi nghiệm thu
4. `draft_chapter` — viết trọn phần chính văn của chương
5. `check_consistency` — đối chiếu dữ liệu trạng thái để kiểm tính nhất quán (buộc phải sau draft)
6. `commit_chapter` — nộp bản cuối, ghi xuống đĩa các trường sự thật (`arc_end` / `next_chapter` / bể phản hồi v.v.); bước kế tiếp do Engine suy ra theo bảng quyết định Route

### Luật chuyển trạng thái

Bên trong, hệ thống tách trạng thái vận hành thành hai tầng:

- **Phase** — giai đoạn lớn, cho biết tác phẩm đang ở kỳ thiết định, kỳ viết, hay đã hoàn thành
- **Flow** — luồng đang hoạt động, cho biết ngay lúc này hệ thống đang viết bình thường, đang duyệt, đang viết lại, đang gia công, hay đang xử lý góp ý của người dùng

#### Phase

`Phase` áp dụng luật "chỉ tiến, không lùi":

```text
init -> premise -> outline -> writing -> complete
  \-------> outline ------^
  \--------------> writing
```

- `init` — nhiệm vụ đã tạo, chưa hình thành thiết định ổn định
- `premise` — đã lưu tiền đề câu chuyện
- `outline` — đã lưu dàn ý, có thể vào kỳ viết chính thức
- `writing` — đã vào kỳ sáng tác từng chương
- `complete` — toàn bộ luồng của cuốn sách đã kết thúc

Cho phép cập nhật cùng trạng thái (`writing -> writing`) và tiến (`outline -> writing`); không cho phép lùi (`writing -> premise`, `complete -> writing`).

#### Flow

`Flow` chỉ mô tả các luồng hoạt động bên trong kỳ viết, cho phép chuyển qua lại giữa vài luồng công việc:

```text
writing   -> reviewing / rewriting / polishing / steering / writing
reviewing -> writing / rewriting / polishing / steering / reviewing
rewriting -> writing / steering / rewriting
polishing -> writing / steering / polishing
steering  -> writing / reviewing / rewriting / polishing / steering
```

- `writing` — đẩy sang chương kế tiếp một cách bình thường
- `reviewing` — Editor đang duyệt
- `rewriting` — xử lý những chương buộc phải viết lại
- `polishing` — xử lý những chương chỉ cần gia công
- `steering` — đang lượng định và xử lý góp ý của người dùng

Kết quả duyệt quyết định `reviewing -> rewriting/polishing/writing`; phạm vi ảnh hưởng của góp ý quyết định `steering -> writing/reviewing/rewriting/polishing`. Những cú nhảy rõ ràng bất thường, ví dụ `rewriting -> reviewing`, bị một lớp kiểm tra nhẹ trong code chặn lại.

### Quy hoạch cuốn dần cho truyện dài

Cách làm truyền thống quy hoạch tất cả chương một lần; tới 300+ chương thì dàn ý rỗng, nhịp như chạy cho kịp tiến độ. Hệ thống này dùng **la bàn + quy hoạch cuốn dần theo tầm nhìn**, mô phỏng đúng quy trình sáng tác thật của tác giả truyện mạng:

```
Quy hoạch ban đầu               Khi cung kết thúc                  Khi tập kết thúc
┌───────────────────────────┐   ┌────────────────────────────────┐   ┌──────────────────────────┐
│ Hướng kết cục (la bàn)    │   │ Editor duyệt cấp cung          │   │ Editor duyệt cấp tập     │
│ Khởi đầu 2 tập, sau mở dần│   │ Tóm tắt cung + ảnh chụp NV     │   │ Tóm tắt tập              │
│ Chương chi tiết của cung 1│ → │ Architect mở rộng cung sau     │ → │ Architect tự chủ tạo     │
│ Nhân vật + luật thế giới  │   │ Writer tiếp tục viết           │   │ tập kế + cập nhật la bàn │
└───────────────────────────┘   └────────────────────────────────┘   └──────────────────────────┘
```

- **La bàn (Compass)** — hướng kết cục + các mạch dài đang hoạt động + ước lượng quy mô; Architect cập nhật ở mỗi biên tập, nên hướng truyện có thể tiến hóa theo quá trình sáng tác
- **Sinh theo nhu cầu** — viết xong tập hiện tại, Architect tự chủ tạo tập kế tiếp dựa trên phần đã viết. Quy hoạch ban đầu sinh 2 tập làm bước khởi động, các tập sau sinh khi cần
- **Cung khung** — chỉ có goal + số chương ước lượng, tới lúc mới mở rộng thành chương chi tiết
- **Tinh chỉnh dần** — mỗi lần mở rộng đều tham chiếu tóm tắt phía trước, ảnh chụp nhân vật và luật văn phong, càng viết về sau càng chính xác
- **Mẫu nhịp dùng chung** — cung đột phá trưởng thành / cung tranh đấu thi kỹ / cung khám phá phát hiện / cung ân oán xung đột / cung chuyển tiếp thường ngày; mỗi loại cung có mật độ tham chiếu và bản đồ đề tài phù hợp

### Quản lý ngữ cảnh truyện dài

Tiểu thuyết 500+ chương dùng ba cấp tóm tắt + đường ống nén bốn cấp + gợi ý thông minh:

```
Tập (Volume) → tóm tắt tập
└── Cung (Arc) → tóm tắt cung + ảnh chụp nhân vật + luật văn phong
    └── Chương (Chapter) → tóm tắt chương (cửa sổ trượt 3 chương gần nhất)
```

- **Tóm tắt phân tầng** — gần thì dùng tóm tắt chương, trung bình thì dùng tóm tắt cung, xa thì dùng tóm tắt tập; nén từng tầng mà không mất thông tin
- **Gợi ý chương liên quan** — mỗi chương khi viết, hệ thống tra ngược các chương lịch sử theo bốn chiều phục bút, nhân vật xuất hiện, biến động trạng thái, quan hệ; gợi ý để Writer đọc lại khi cần
- **Dự báo chương kế tiếp** — nạp dàn ý chương sau để Writer thiết kế móc cuối chương và mối nối phục bút
- **Phát hiện biên cung** — tự nhận ra cung/tập kết thúc, kích hoạt duyệt, sinh tóm tắt và mở rộng cung/tập kế tiếp

#### Đường ống nén ngữ cảnh

Khi hội thoại vượt cửa sổ ngữ cảnh của model, hệ thống nén dần theo giá phải trả từ thấp lên cao:

```
ToolResultMicrocompact → LightTrim → StoreSummaryCompact → FullSummary
   dọn kết quả tool cũ    cắt văn bản dài  store nén 0 LLM   LLM tóm tắt đỡ lưng
```

- **StoreSummaryCompact** — riêng cho Writer, dùng luôn tóm tắt chương, ảnh chụp nhân vật, sổ phục bút đã có trong store để thay thế tin nhắn cũ, không tốn một lời gọi LLM nào
- **FullSummary bản riêng cho tiểu thuyết** — Writer dùng prompt tóm tắt hướng tới sự liền lạc của mạch tự sự, yêu cầu rõ ràng phải giữ trạng thái nhân vật, đầu mối phục bút, mục còn phải sửa theo duyệt, và các mốc neo văn phong
- **Gói khôi phục sau khi nén** — sau FullSummary, hệ thống tự tiêm lại kế hoạch chương hiện tại, dàn ý và ảnh chụp nhân vật để Writer không bị "mất ký ức" sau khi nén
- **Cầu chì (circuit breaker)** — khi nén thất bại liên tiếp thì tự bỏ qua và cảnh báo rõ; dùng chế độ nửa mở, lượt sau tự thử lại
- **Ước lượng token CJK** — tiếng Trung tính `runes × 1.5`, không bị `bytes/4` ước thấp làm nén kích hoạt trễ

## Cấu hình nâng cao

Mọi thứ thường dùng — nhà cung cấp, khóa API, model mặc định, model theo vai, cường độ suy luận —
chỉnh được ngay trong **Cài đặt**. Phần dưới đây dành cho ai cần thứ giao diện chưa có (proxy tự
dựng, header riêng, Bedrock…): **tắt app**, sửa trực tiếp `config.json` ở
[thư mục dữ liệu của app](#lần-đầu-mở-app), rồi mở lại.

```jsonc
{
  "provider": "openrouter",
  "model": "google/gemini-2.5-flash",
  "reasoning_effort": "medium",
  "providers": {
    "openrouter": {
      "api_key": "sk-or-v1-xxx",
      "base_url": "https://openrouter.ai/api/v1",
      "models": [
        { "name": "google/gemini-2.5-flash", "context_window": 200000 },
        { "name": "google/gemini-2.5-pro", "context_window": 1000000 }
      ]
    }
  },
  "style": "default"
}
```

> ⚠️ Giá trị của `provider` (và `roles.*.provider`) là **tên key** trong `providers` — một con trỏ, không phải tên giao thức.

`providers.<name>.models` là danh sách model tùy chọn: `name` là tên model gửi cho Provider, `context_window` là cửa sổ nén ngữ cảnh riêng của model đó, `json_schema` là ghi đè ba trạng thái cho đầu ra có cấu trúc nguyên bản (`true` xác nhận có hỗ trợ, `false` xác nhận không hỗ trợ, bỏ trống thì dùng năng lực của adapter). Cửa sổ ngữ cảnh được giải theo thứ tự "giá trị riêng của model → `context_window` cũ ở tầng đỉnh → sổ đăng ký model → 200K đỡ lưng"; nó chỉ ảnh hưởng thời điểm nén ngữ cảnh cục bộ, không đổi hạn mức request thật của API.

`reasoning_effort` là cường độ suy luận mặc định: `off` / `low` / `medium` / `high` / `xhigh` / `max`; bỏ trống nghĩa là dùng mặc định của model. Cấu hình lưu **ý định** bạn đã chọn; lúc gửi thật thì bị kẹp theo **năng lực của model hiện tại của vai đó** — chuyển sang model yếu hơn chỉ làm giá trị có hiệu lực lần đó bị kẹp thấp, chuyển về model mạnh là tự phục hồi.

`providers.<name>.api` chỉ có hiệu lực với `type: "openai"`, chọn endpoint: `chat` (mặc định, `base_url + /chat/completions`) hoặc `responses` (`base_url + /responses`). Proxy kiểu Codex thường cần `responses`.

`providers.<name>.extra` là cấu hình cấp provider truyền xuống HTTP client (`user_agent`, `headers`, `anthropic_beta`); còn `providers.<name>.extra_body` mới là tham số mở rộng của body request — đừng dùng lẫn hai thứ.

### Model theo vai

Trường `roles` phân model khác nhau cho từng tác tử (giao diện: **Cài đặt → Model theo vai**); vai không cấu hình thì dùng model mặc định:

```jsonc
{
  "roles": {
    "writer": { "provider": "anthropic", "model": "claude-sonnet-4", "reasoning_effort": "high" },
    "architect": { "provider": "openrouter", "model": "google/gemini-2.5-pro", "reasoning_effort": "low" }
  }
}
```

Các vai cấu hình được: `architect` / `writer` / `editor`, cùng ba bậc model cho đường ống nhập là `import_segment` / `import_analyze` / `import_synthesize` (không cấu hình thì rơi về architect; có thể trỏ việc chia chương sang model rẻ hơn). Arbiter dùng model mặc định.

### Proxy tự định nghĩa

Chọn Provider nào cũng được rồi điền địa chỉ proxy, hoặc khai báo một provider mới và chỉ định `type` giao thức. `api_key` của proxy tự định nghĩa là tùy chọn:

```jsonc
{
  "provider": "my-proxy",
  "model": "gpt-4o",
  "providers": {
    "my-proxy": {
      "type": "openai",
      "base_url": "https://proxy.example.com/v1",
      "extra": {
        "user_agent": "my-client/1.0",
        "headers": { "X-Custom-Client": "my-client" }
      }
    }
  }
}
```

Các Provider được hỗ trợ: `openrouter` / `anthropic` / `gemini` / `openai` / `deepseek` / `qwen` / `glm` / `grok` / `ollama` / `bedrock` và mọi proxy tự định nghĩa.

Nếu proxy dùng giao thức Anthropic và chỉ cho client Claude Code truy cập, `type` đặt là `anthropic`, `anthropic_beta` đặt ở tầng đỉnh của `extra`, các HTTP header như Stainless đặt trong `extra.headers`:

```jsonc
{
  "provider": "claude-code-proxy",
  "model": "claude-sonnet-4-6",
  "providers": {
    "claude-code-proxy": {
      "type": "anthropic",
      "api_key": "sk-xxx",
      "base_url": "https://proxy.example.com",
      "extra": {
        "user_agent": "claude-code/2.1.183",
        "anthropic_beta": "claude-code-20250219",
        "headers": {
          "X-Stainless-Lang": "js",
          "X-Stainless-Package-Version": "0.94.0",
          "X-Stainless-Runtime": "node"
        }
      }
    }
  }
}
```

Nếu proxy dùng giao thức OpenAI/NewAPI và chỉ cho client Codex truy cập, `type` đặt là `openai`, dùng `extra.user_agent` để ghi đè `litellm-go/0.1` mặc định, và truyền các header nhận dạng Codex trong `extra.headers`. `Session_id` và `X-Codex-Turn-Metadata` nên đổi thành giá trị ngẫu nhiên ổn định:

```jsonc
{
  "provider": "codex-proxy",
  "model": "gpt-5.4",
  "providers": {
    "codex-proxy": {
      "type": "openai",
      "api_key": "sk-xxx",
      "base_url": "https://proxy.example.com/v1",
      "models": [
        { "name": "gpt-5.4", "context_window": 400000 },
        { "name": "gpt-5.4-mini" }
      ],
      "api": "responses",
      "extra": {
        "user_agent": "codex-tui/0.142.3 (Mac OS 26.5.1; arm64) Apple_Terminal/470.2 (codex-tui; 0.142.3)",
        "headers": {
          "Originator": "codex-tui",
          "Session_id": "replace-with-random-session-id",
          "X-Codex-Turn-Metadata": "replace-with-random-turn-metadata"
        }
      }
    }
  }
}
```

Về `api_key`:

- Các nhà cung cấp dựng sẵn như `openrouter` / `anthropic` / `gemini` / `openai` / `deepseek` / `qwen` / `glm` / `grok` cần `api_key`
- `ollama` và `bedrock` không cần `api_key`; Bedrock cần `region`, `access_key_id`, `secret_access_key` trong `extra` (`session_token` tùy chọn)
- Proxy tự định nghĩa đã chỉ định `type` thì không bắt buộc `api_key`

Ollama chạy cục bộ:

```jsonc
{
  "provider": "ollama",
  "model": "qwen3:latest",
  "providers": {
    "ollama": { "base_url": "http://localhost:11434/v1" }
  }
}
```

### Văn phong

Trường `style` chọn văn phong dựng sẵn:

- `default` — văn phong dùng chung
- `suspense` — trinh thám suy luận
- `fantasy` — kỳ ảo tiên hiệp
- `romance` — ngôn tình

### Khử mùi AI và luật tự định nghĩa

Hệ thống có sẵn một đường nền khử mùi AI: danh sách đen máy móc (câu khuôn / từ mỏi, kiểm tra tất định lúc nộp chương) + tiêu chí ngữ nghĩa `assets/references/anti-ai-tone.md` (tiêm cho Writer / Editor để né và để dẫn chứng). Không viết gì cũng dùng được.

Sở thích riêng thì **cứ viết bằng lời thường** (như «đừng viết nhân vật chính thành thánh mẫu», «mỗi chương khoảng 3000 từ», «đừng để xuất hiện 'ở một mức độ nào đó'») — không định dạng, không YAML — gửi qua ô **Góp ý** là cách nhanh nhất: Arbiter nhận ra đó là luật viết và ghi xuống đĩa ngay. Hệ thống dùng model chuẩn hóa các yêu cầu này thành ảnh chụp luật của sách (khoảng số từ, từ bị cấm, ngưỡng từ mỏi… dạng ràng buộc có cấu trúc + sở thích văn phong), lúc viết tự tuân theo, lúc nộp tự kiểm máy móc. Thiết kế ở [docs/user-rules-runtime.md](docs/user-rules-runtime.md); tầng văn phong ghi đè được ở [docs/voice-layer.md](docs/voice-layer.md).

## Cấu trúc một truyện

Toàn bộ dữ liệu sáng tác của một truyện nằm trong thư mục của nó dưới `books/`. Tắt app giữa
chừng rồi mở lại, bấm **Chạy** là viết tiếp từ tiến độ lần trước.

```
books/{tên-truyện}/
├── chapters/           # Bản cuối (Markdown)
├── summaries/          # Tóm tắt chương (JSON)
├── drafts/             # Bản nháp chương
├── reviews/            # Báo cáo duyệt
├── characters.json     # Hồ sơ nhân vật
├── world_rules.json    # Luật thế giới
├── layered_outline.json# Dàn ý phân tầng (chế độ truyện dài)
├── foreshadow_ledger.json # Sổ phục bút
└── meta/
    ├── premise.md      # Tiền đề câu chuyện
    ├── progress.json   # Trạng thái tiến độ
    ├── checkpoints.jsonl # Checkpoint cấp step (nối thêm sau mỗi tool thành công)
    ├── decisions.jsonl # Mọi phán quyết của Arbiter
    └── ...
```

## Khôi phục từ checkpoint

Viết một bộ tiểu thuyết dài có thể mất vài giờ đến vài ngày; máy sập, mất mạng, tắt app giữa chừng đều là chuyện thường. Mở lại app và chạy tiếp là **tự khôi phục**, không cần làm gì bằng tay.

| Thời điểm bị ngắt | Hành vi khôi phục |
|---|---|
| Kỳ quy hoạch (đang dựng luật thế giới/dàn ý) | Kiểm các thiết định đã lưu, tự bù phần còn thiếu |
| Đang viết một chương (có bản nháp chưa nộp) | Viết tiếp chương đó, đọc bản nháp đã có để tiếp |
| Đang duyệt | Kích hoạt lại việc duyệt của Editor |
| Hàng đợi viết lại/gia công chưa rỗng | Tiếp tục xử lý các chương đang chờ viết lại |
| Mở rộng cung/tập bị ngắt (duyệt xong mà cung sau chưa mở) | Tự phát hiện cung/tập khung, kích hoạt Architect mở rộng |
| Góp ý của người dùng chưa xử lý xong | Tiêm lại góp ý lần trước |
| Bị ngắt lúc đang viết bình thường | Tiếp tục từ chương kế tiếp |

Mỗi tool chạy xong là ghi một checkpoint (`meta/checkpoints.jsonl`). Khi chạy lại:

1. Đọc `progress.json` + checkpoint gần nhất + các tín hiệu đang chờ
2. Sinh chỉ thị khôi phục chính xác tới cấp step (ví dụ "draft chương 7 đã xuống đĩa, hãy tiếp tục check_consistency")
3. Engine tính lại định tuyến ngay từ store rồi chạy tiếp — không có phiên nào cần khôi phục, tính bất biến của checkpoint bảo đảm phái lại vẫn an toàn

> Việc ghi tệp dùng thao tác nguyên tử temp + fsync + rename, mất điện ngay giữa lúc ghi cũng không làm hỏng dữ liệu đã có.

## Riêng tư

App không có máy chủ nào của dự án đứng giữa: khóa API, truyện và log nằm trên máy bạn, lời gọi
model đi thẳng từ máy bạn tới nhà cung cấp bạn chọn. API nội bộ của app chỉ nghe trên
`127.0.0.1`. Khóa API đi **một chiều**: đặt được qua giao diện, nhưng không bao giờ được trả về —
chỗ nào cần hiện thì chỉ hiện dạng che (`sk-4…802`). Không có bản chạy trên web. Chi tiết ở
[SECURITY.md](SECURITY.md).

## Triết lý thiết kế

> **Tầng sự thật thì tất định, tầng ngữ nghĩa thì tự chủ.** Model được tự do ở chỗ không kiểm chứng được (viết gì, viết thế nào), và bị ràng buộc ở chỗ kiểm chứng được (thứ tự, tính bất biến, giai đoạn).

### Phép tam phân — càng đơn giản càng ổn định

- **Chuyển trạng thái liệt kê được thì về code** — "phái ai tiếp" là đọc sự thật rồi tra bảng (`flow.Route` là hàm thuần, kiểm thử vét cạn hàng vạn tổ hợp), tỉ lệ lỗi tiến về 0, không tốn lời gọi LLM
- **Phán đoán có biên rõ ràng thì về Arbiter** — chọn kiến trúc sư, phân loại can thiệp, đường ra khi thất bại: sự thật vào, quyết định có cấu trúc ra, kiểm tra máy móc đỡ lưng, mỗi phán quyết xuống đĩa và phát lại được
- **Sáng tác mở thì về Worker** — trong phạm vi một chương, Writer hoàn toàn tự chủ; khi tool thất bại thì trả về lỗi có cấu trúc kèm gợi ý đường ra, để LLM tự sửa
- **Đóng cứng biên, không đóng cứng phán đoán** — code chỉ gác những bất biến chứng minh được; các lựa chọn sáng tác không liệt kê được thì giao cho model, không dùng từ khóa, ngưỡng điểm hay bảng luật để giả làm sự thông hiểu
- **Tool chỉ trả sự thật** — IO nguyên tử một tệp + lỗi tường minh + phát lại bất biến; việc nộp chương dùng Saga bền vững + checkpoint, giá trị trả về là các trường sự thật JSON (`final_verdict` / `pending_rewrites` / `arc_end`), không kèm bất kỳ chuỗi chỉ thị nào
- **Lan can theo sự thật, không phải theo hành vi** — CheckpointDeltaGuard của Worker chỉ nhận sản phẩm đã xuống đĩa: chưa nộp mà muốn nghỉ là bị chặn lại; khi hành vi của model đúng thì lan can không tốn gì
- **Từ chối điều phối phức tạp** — không có task queue, không có policy engine. Một vòng lặp tuần tự + một bảng quyết định + vài hàm phán quyết là toàn bộ luồng điều khiển
- **Model càng mạnh thì lợi càng lớn** — chất lượng sáng tác và phán quyết hưởng lợi tuyến tính khi nâng model; vỏ tất định không phải sửa một dòng

### Vòng kín toàn tự động

Nhập một câu, xuất ra tiểu thuyết hoàn chỉnh:

```
“viết một truyện trinh thám” → dựng luật thế giới → thiết kế nhân vật → quy hoạch dàn ý
                             → viết từng chương → duyệt chất lượng → tự động viết lại
                             → tóm tắt cấp cung → ảnh chụp nhân vật → thành sách hoàn chỉnh
```

- **Engine điều phối tất định** — mỗi lượt đọc tầng sự thật rồi phái theo bảng quyết định, không phiên, không chuyển tiếp; khôi phục sau sập máy = đọc store rồi chạy tiếp
- **Writer sáng tác tự chủ** — mỗi chương tự hoàn tất trọn vòng kín plan → draft → check → commit
- **Editor duyệt tự chủ** — phân tích vấn đề kết cấu xuyên chương, xuất ra phán quyết và phạm vi ảnh hưởng
- **Architect dựng tự chủ** — từ một câu yêu cầu suy ra trọn bộ thiết định, ở biên cung/tập thì tự chủ mở rộng quy hoạch tiếp theo (tham chiếu bể phản hồi dàn ý mà Writer đã ghi xuống đĩa)
- **Quản lý phục bút tự động** — gieo, đẩy, thu hồi đều do Agent tự theo dõi toàn trình
- **Điều tiết nhịp tự động** — theo dõi lịch sử các mạch tự sự và loại móc, tránh để các chương liên tiếp giống nhau về kết cấu

### Tách rời sự thật và chỉ thị

Tool chỉ trả sự thật, "bước tiếp theo" do Engine tính lại từ tầng sự thật mỗi lượt:

- `commit_chapter` / `save_review` ghi xuống đĩa các sự thật có cấu trúc (`final_verdict` / `pending_rewrites` / `arc_end` / bể phản hồi dàn ý), không kèm bất kỳ chuỗi `[hệ thống]` nào
- `flow.Route` đọc các sự thật như `Progress` + `Outline` để suy ra chỉ thị bước tiếp; mỗi lần đổi bảng quyết định thì phải đổi bản đặc tả vét cạn trước rồi mới đổi phần hiện thực
- Toàn bộ quyết định ngữ nghĩa (phán quyết) rơi vào `meta/decisions.jsonl`: để kiểm toán, phát lại ngoại tuyến, hồi quy A/B

Nhờ vậy chỉ thị không bị chuỗi lời gọi nuốt mất, cũng không trôi lệch trong sản phẩm của tool. Sửa bug về luồng chỉ cần sửa một nhánh + một dòng đặc tả.

## Công nghệ

- **Go 1.25** — engine và HTTP API
- **[agentcore](https://github.com/voocel/agentcore)** — nhân Agent tối giản (tool-calling + streaming)
- **[litellm](https://github.com/voocel/litellm)** — lớp thích ứng giao diện LLM thống nhất (bản đã vá trong `third_party/`, xem [third_party/README.md](third_party/README.md))
- **Next.js (xuất tĩnh)** — giao diện studio
- **Electron** — vỏ app desktop, đóng gói và tự cập nhật

## Đóng góp / build từ nguồn

Người dùng chỉ cần [tải app](#tải-về--cài-đặt). Muốn sửa mã, dựng app từ nguồn hay phát hành: xem
**[CONTRIBUTING.md](CONTRIBUTING.md)** — gồm cách dựng môi trường dev, chạy kiểm thử, và các luật
hay làm PR đỏ.

Đây là một bản fork, và điều đó quyết định nên gửi đóng góp đi đâu:

- **Engine, kiến trúc, hành vi tác tử** — những thứ này thuộc về upstream. Xin gửi thẳng tới
  [voocel/ainovel-cli](https://github.com/voocel/ainovel-cli) để cả cộng đồng cùng hưởng.
- **Việt hóa, studio, app desktop, tài liệu của fork** — những thứ này ở đây.

Lỗi bảo mật thì **đừng** mở issue công khai — xem [SECURITY.md](SECURITY.md).

## Ghi công

Đây là **bản fork** của [voocel/ainovel-cli](https://github.com/voocel/ainovel-cli) — toàn bộ engine, kiến trúc và thiết kế gốc thuộc về dự án upstream. Bản fork này không phải dự án gốc.

Phần fork thêm vào so với upstream:

- **Lớp i18n** (`internal/i18n/`) — tiếng Việt là mặc định
- **Việt hóa prompt / tài liệu tham chiếu / văn phong** trong `assets/`, nên AI sinh truyện tiếng Việt thay vì tiếng Trung
- **Studio** (`internal/serve/` + `web/`) — HTTP API trên store cùng một bề mặt vận hành ba màn, làm được trọn vòng đời (tạo · chạy · góp ý · duyệt · cấu hình · xuất bản)
- **App desktop** (`desktop/`) — vỏ Electron gói engine và studio thành app cài được trên macOS và Windows

Bản dịch ban đầu tham khảo [kentjuno/ainovel-cli](https://github.com/kentjuno/ainovel-cli) tại commit `68eb92d` — cảm ơn công sức việt hóa của họ.

## Giấy phép

Apache License 2.0 — xem [LICENSE](LICENSE).

Dự án này tích cực tham gia và ghi nhận [cộng đồng linux.do](https://linux.do/).
