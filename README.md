# ainovel-studio

[English](README.en.md) · **Tiếng Việt**

**Trang giới thiệu: [ainovel.lingoreup.com](https://ainovel.lingoreup.com)** · cài trên máy bạn bằng một lệnh `go install` — xem [Bắt đầu nhanh](#bắt-đầu-nhanh).

Engine viết tiểu thuyết dài bằng AI, toàn tự động. Engine tất định chạy trọn một cuốn sách, model chỉ được gọi đúng những chỗ cần phán đoán: Engine định tuyến theo sự thật để điều phối ba tác tử sáng tác tự chủ Architect / Writer / Editor, và đánh thức Arbiter khi cần phán quyết ngữ nghĩa. Từ một câu yêu cầu tới một cuốn tiểu thuyết hoàn chỉnh, không cần người can thiệp.

> Đây là **bản fork tiếng Việt** của [voocel/ainovel-cli](https://github.com/voocel/ainovel-cli). Giao diện, prompt và tài liệu đã việt hóa nên AI sinh truyện tiếng Việt; xem [Ghi công](#ghi-công) ở cuối.

<p align="center">
  <img src="docs/assets/studio.gif" alt="Web studio: Quản lý → Dòng sản xuất → Bản thảo → Chi phí → Model theo vai" width="820">
</p>

<p align="center">
  <sub>Web studio, dữ liệu thật từ một lượt chạy: <b>Quản lý</b> cả xưởng → <b>Dòng sản xuất</b> của một
  cuốn → <b>Bản thảo</b> → <b>Chi phí toàn xưởng</b> → <b>Model theo vai</b>.</sub>
</p>

<table>
<tr>
<td width="50%" valign="top">
  <img src="docs/assets/ban-thao.png" alt="Đọc bản thảo, kèm bản duyệt của Editor">
  <sub><b>Đọc bản thảo.</b> Chương đã nghiệm thu, đặt cạnh khế ước chương và bản duyệt bảy chiều
  của Editor — mỗi chiều buộc phải dẫn nguyên văn làm chứng.</sub>
</td>
<td width="50%" valign="top">
  <img src="docs/assets/chi-phi-xuong.png" alt="Chi phí toàn xưởng, bổ theo vai và theo model">
  <sub><b>Chi phí toàn xưởng.</b> Bổ theo vai và theo model. Khi có lượt model không trả số liệu
  dùng, studio nói thẳng là con số đang thiếu thay vì lặng lẽ cộng sai.</sub>
</td>
</tr>
</table>

## Đặc điểm

- **Engine tất định + nhiều tác tử phối hợp** — Engine điều phối ba tác tử sáng tác tự chủ Architect / Writer / Editor theo bảng quyết định dựa trên sự thật; vòng lặp chính không tốn một lời gọi LLM nào, hành vi kiểm thử vét cạn được
- **Phán quyết ngữ nghĩa có thể kiểm toán** — chọn kiến trúc sư, phân loại can thiệp, đường ra khi thất bại đều do Arbiter quyết trong một lời gọi duy nhất; mỗi phán quyết ghi xuống đĩa và phát lại được. Càng đơn giản càng ổn định, từ chối điều phối phức tạp
- **Khôi phục checkpoint ở cấp step** — mỗi tool chạy xong là ghi một checkpoint, sập máy vẫn khôi phục chính xác tới bước plan/draft/check/commit
- **Quy hoạch cuốn dần hai tầng tập–cung** — truyện dài không còn quy hoạch toàn bộ chương một lần. Ban đầu chỉ quy hoạch khung 2 tập đầu + chương chi tiết của cung 1; các cung/tập sau do Architect mở rộng khi viết tới, mỗi lần mở rộng đều tham chiếu tóm tắt phía trước và trạng thái nhân vật nên quy hoạch xa không rỗng
- **Gợi ý chương liên quan thông minh** — mỗi chương khi viết, hệ thống tự gợi ý các chương lịch sử liên quan theo bốn chiều: phục bút, nhân vật xuất hiện, biến động trạng thái, quan hệ; kèm dự báo chương kế tiếp để giữ tính liên tục cho truyện 500+ chương
- **Chiến lược ngữ cảnh tự thích ứng** — tự chuyển giữa toàn phần / cửa sổ trượt / tóm tắt phân tầng theo tổng số chương, đủ sức cho truyện 500+ chương
- **Duyệt chất lượng bảy chiều** — Editor duyệt theo bảy chiều: nhất quán thiết định, hành vi nhân vật, nhịp, mạch tự sự liền lạc, phục bút, móc, và phẩm chất thẩm mỹ; riêng chiều thẩm mỹ chia nhỏ thành năm mục chất cảm miêu tả / thủ pháp tự sự / độ phân biệt đối thoại / chất lượng dùng từ / sức lay động cảm xúc, mỗi mục buộc phải dẫn nguyên văn làm chứng
- **Người dùng can thiệp thời gian thực** — trong lúc viết có thể tiêm ý kiến sửa vào ô nhập bất cứ lúc nào (không cần tạm dừng); hệ thống tự lượng định phạm vi ảnh hưởng và viết lại những chương bị ảnh hưởng
- **Nghiệm thu từng chương tùy chọn** — mặc định vẫn toàn tự động; khi cần kiểm soát tinh, dùng `/review on` để mỗi lần `/next` chỉ mở đúng một chương mới, viết lại và khôi phục sau sập máy không tiêu lẫn giấy phép
- **Một cửa vào TUI thống nhất** — giao diện tương tác theo dõi tiến độ trực tiếp, cũng có thể mang theo một câu yêu cầu để khởi động luôn
- **Web studio ba màn** — `ainovel-cli serve --web <thư mục>` mở một bề mặt vận hành đầy đủ: Quản lý (cả xưởng) · Cài đặt chung (mọi tác phẩm) · Xưởng sản xuất (một tác phẩm). Trục sản xuất tập/cung/chương, bảng chương, nhật ký phán quyết của Arbiter, dòng sự kiện realtime qua SSE
- **Tiếng Việt là mặc định** — giao diện, prompt, tài liệu tham chiếu và văn phong đều đã việt hóa nên AI sinh truyện tiếng Việt; đặt `AINOVEL_LANG=zh` để quay về chuỗi gốc của upstream. **Chưa có tiếng Anh**, và web studio chưa qua tầng i18n nào — hiện trạng đầy đủ ở [docs/i18n.md](docs/i18n.md)
- **Hỗ trợ nhiều LLM** — OpenRouter / Anthropic / Gemini / OpenAI v.v., chuyển đổi tùy ý

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
- **Arbiter** — phán quyết ngữ nghĩa được đánh thức khi cần (chọn kiến trúc sư, phân loại can thiệp của người dùng, đường ra khi thất bại/bế tắc); sự thật vào, quyết định có cấu trúc ra, mỗi phán quyết ghi xuống đĩa nên kiểm toán và phát lại được
- **Workers** — Architect / Writer / Editor là các vòng sáng tác tự chủ, mỗi vòng một ngữ cảnh riêng, phối hợp với nhau qua các hiện vật trong Store
- **Tools** — IO nguyên tử một tệp + phát lại bất biến; việc nộp chương dùng Saga bền vững + checkpoint, chỉ trả JSON sự thật, không kèm chỉ thị

### Trách nhiệm từng tác tử

| Vai | Trách nhiệm | Tool |
|--------|------|------|
| **Arbiter** | Phán quyết ngữ nghĩa: chọn kiến trúc sư lúc khởi động, phân loại can thiệp của người dùng, đường ra khi thất bại/bế tắc | không có (một lời gọi LLM, xuất ra quyết định có cấu trúc) |
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
- **Flow** — luồng đang hoạt động, cho biết ngay lúc này hệ thống đang viết bình thường, đang duyệt, đang viết lại, đang gia công, hay đang xử lý can thiệp của người dùng

#### Phase

`Phase` áp dụng luật "chỉ tiến, không lùi":

```text
init -> premise -> outline -> writing -> complete
  \-------> outline ------^
  \--------------> writing
```

Ý nghĩa:

- `init` — nhiệm vụ đã tạo, chưa hình thành thiết định ổn định
- `premise` — đã lưu tiền đề câu chuyện
- `outline` — đã lưu dàn ý, có thể vào kỳ viết chính thức
- `writing` — đã vào kỳ sáng tác từng chương
- `complete` — toàn bộ luồng của cuốn sách đã kết thúc

Giải thích luật:

- Cho phép cập nhật cùng trạng thái, ví dụ `writing -> writing`
- Cho phép tiến, ví dụ `outline -> writing`
- Không cho phép lùi, ví dụ `writing -> premise`, `complete -> writing`

#### Flow

`Flow` chỉ mô tả các luồng hoạt động bên trong kỳ viết, cho phép chuyển qua lại giữa vài luồng công việc:

```text
writing   -> reviewing / rewriting / polishing / steering / writing
reviewing -> writing / rewriting / polishing / steering / reviewing
rewriting -> writing / steering / rewriting
polishing -> writing / steering / polishing
steering  -> writing / reviewing / rewriting / polishing / steering
```

Ý nghĩa:

- `writing` — đẩy sang chương kế tiếp một cách bình thường
- `reviewing` — Editor đang duyệt
- `rewriting` — xử lý những chương buộc phải viết lại
- `polishing` — xử lý những chương chỉ cần gia công
- `steering` — đang lượng định và xử lý can thiệp của người dùng

Giải thích luật:

- Cho phép `writing -> reviewing`, ví dụ nộp chương xong thì kích hoạt duyệt
- Cho phép `reviewing -> rewriting/polishing/writing`, do kết quả duyệt quyết định
- Cho phép `steering -> writing/reviewing/rewriting/polishing`, do phạm vi ảnh hưởng của can thiệp quyết định
- Không cho phép những cú nhảy rõ ràng bất thường, ví dụ `rewriting -> reviewing`

Các luật này hiện được một lớp kiểm tra nhẹ trong code ràng buộc thống nhất, tránh trạng thái lùi hoặc nhảy sang nhánh luồng vô lý.

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
- **Sức khỏe TUI đổi màu dần** — mức chiếm dụng ngữ cảnh hiện trực tiếp: xanh (<70%) → vàng (70-85%) → đỏ (>85%)

## Bắt đầu nhanh

```bash
# Cài bản fork này (cần Go 1.25+; chạy trên macOS, Linux và Windows)
go install github.com/huuhoa143/ainovel-studio/cmd/ainovel-cli@latest

# Xem phiên bản
ainovel-cli --version

# Chạy lần đầu sẽ tự vào luồng dẫn dắt (chọn Provider → nhập API Key → Base URL → tên model)
ainovel-cli
```

> ### `go install` cho bạn CLI — web studio cần thêm một bước
>
> Không phải sơ suất, nó là hệ quả của một quyết định thiết kế: nhị phân **không nhúng** giao
> diện, nó đọc thư mục đã dựng từ đĩa ở **từng lượt yêu cầu** (`--web`). `go install` chỉ biên
> dịch phần Go, nên bạn có TUI và engine headless nhưng chưa có tệp giao diện nào.
>
> Muốn web studio thì dựng từ nguồn:
>
> ```bash
> git clone https://github.com/huuhoa143/ainovel-studio && cd ainovel-studio
> go build -o ainovel-cli ./cmd/ainovel-cli
> cd web && npm ci && npm run build && cd ..
> ./ainovel-cli serve --web web/out
> ```
>
> `scripts/install.sh` vẫn chốt cứng `REPO="voocel/ainovel-cli"` nên nó cài **upstream**, không
> phải bản này — fork không phát hành nhị phân release. Dùng `go install` hoặc dựng từ nguồn.
> Windows giờ đã được `go install` phủ; bộ cài shell chưa bao giờ hỗ trợ Windows.
>
> **Cập nhật** là chạy lại đúng lệnh `go install …@latest` ở trên. `ainovel-cli update` giờ báo
> không tìm thấy bản mới, và đó là cố ý: trước đây nó tải nhị phân của **upstream** rồi ghi đè
> lên bản fork, tức người dùng gõ một lệnh cập nhật rồi mất bản việt hóa mà không biết vì sao.

### Docker

Ảnh Docker phù hợp để chạy tác vụ dài headless trên server/NAS, cũng có thể dùng `-it` để vào TUI. Nên mount thư mục cấu hình và thư mục tác phẩm ra máy chủ:

```bash
mkdir -p config workspace

# TUI
docker run --rm -it \
  -v "$PWD/config:/root/.ainovel" \
  -v "$PWD/workspace:/workspace" \
  ghcr.io/voocel/ainovel-cli:latest

# Headless
docker run --rm \
  -v "$PWD/config:/root/.ainovel" \
  -v "$PWD/workspace:/workspace" \
  ghcr.io/voocel/ainovel-cli:latest \
  --headless --prompt "viết một truyện huyền huyễn phương Đông dài, nhân vật chính khởi đầu từ một thị trấn biên thùy"
```

Cũng có thể dùng Compose:

```bash
docker compose run --rm ainovel
docker compose run --rm ainovel --headless --prompt "viết một truyện trinh thám ngắn"
```

Ảnh Docker **đã mang sẵn giao diện web studio** ở `/usr/local/share/ainovel-cli/web`. Nó không nằm trong `/workspace` vì đó là chỗ bạn mount thư mục tác phẩm — một `web/` đặt ở đó sẽ bị chính volume ấy che đi:

```bash
docker run --rm -p 127.0.0.1:8420:8420 \
  -v "$PWD/config:/root/.ainovel" \
  -v "$PWD/workspace:/workspace" \
  ghcr.io/voocel/ainovel-cli:latest \
  serve --addr 0.0.0.0:8420 --web /usr/local/share/ainovel-cli/web
```

Hai điều phải biết trước khi dùng cách trên:

- **Studio khi đó là CHỈ ĐỌC.** Đường ghi (tạo tác phẩm, chạy engine, can thiệp, đặt khóa API) chỉ bật khi địa chỉ lắng nghe là loopback — đó là thứ thay cho việc xác thực, vì studio không có mật khẩu. Trong container thì phải `0.0.0.0` mới ra được khỏi nó, nên hai điều kiện này loại trừ nhau.
- **`-p 127.0.0.1:8420` không phải để cho đẹp.** Không có tiền tố `127.0.0.1:`, Docker mở cổng ra mọi giao diện của máy chủ — tức bản thảo chưa phát hành đọc được từ máy khác trong cùng mạng LAN.

Muốn studio **ghi được**, chạy engine trực tiếp trên máy chủ (`ainovel-cli serve --web ./web`), hoặc trên Linux dùng `--network host` để container lắng nghe đúng loopback thật:

```bash
docker run --rm --network host \
  -v "$PWD/config:/root/.ainovel" -v "$PWD/workspace:/workspace" \
  ghcr.io/voocel/ainovel-cli:latest \
  serve --addr 127.0.0.1:8420 --web /usr/local/share/ainovel-cli/web
```

`--network host` chỉ làm đúng việc này trên Linux; Docker Desktop (macOS/Windows) chạy container trong một VM nên `127.0.0.1` ở đó là loopback của VM, không phải của máy bạn.

Sau khi vào TUI, ở giai đoạn khởi động có hai kiểu tương tác trước khi vào việc:

- `Bắt đầu nhanh`: một câu là vào sáng tác ngay
- `Cùng lên kế hoạch`: đối thoại nhiều lượt với AI để làm rõ yêu cầu, **bên phải đồng bộ trực tiếp bản nháp chỉ thị sáng tác đang được chỉnh ra**; mỗi lượt AI chủ động đưa 1-3 gợi ý dẫn dắt, bấm số là điền luôn vào ô nhập, bấm `Ctrl+S` để vào sáng tác chính thức

Cả hai chế độ cuối cùng đều thu về cùng một bản chỉ thị sáng tác, rồi vào cùng một bộ engine sáng tác.

### Web studio

Ngoài TUI, bản fork này có một **bề mặt vận hành trên web** đọc trực tiếp từ store:

```bash
# Chỉ API (127.0.0.1:8420), đọc các tác phẩm trong ./output
ainovel-cli serve

# Kèm giao diện — gói phát hành đã có sẵn `web/` cạnh nhị phân
ainovel-cli serve --web ./web

# Dựng từ nguồn thì giao diện nằm ở web/out
ainovel-cli serve --web ./web/out

# Chọn thư mục gốc khác, hoặc chỉ phục vụ đúng một tác phẩm
ainovel-cli serve --root ./output --book ten-tac-pham --addr 127.0.0.1:8420
```

> `--web` nhận **thư mục đã dựng**, không phải mã nguồn: `.tsx` phải qua `npm run build` mới thành HTML/JS/CSS, đúng như `.go` phải qua `go build`. Gói phát hành đã dựng sẵn nên chỉ cần trỏ vào `./web`; dựng từ nguồn thì chạy `cd web && npm ci && npm run build` một lần.
>
> Nhị phân **không nhúng** giao diện — nó đọc thư mục ấy từ đĩa ở từng lượt yêu cầu. Nên sửa giao diện rồi dựng lại `web/` là đủ, không phải dựng lại nhị phân và không phải khởi động lại server.

Studio cho xem: trục sản xuất tập/cung/chương theo tỉ lệ thật, bảng chương kèm trạng thái từng công đoạn, nhật ký phán quyết của Arbiter (mỗi dòng có lý do dựa trên sự thật), và dòng sự kiện realtime qua SSE.

Studio **làm được cả vòng đời**: tạo tác phẩm, chạy, can thiệp, nghiệm thu từng chương, đặt khóa API, đổi model theo vai, nhập truyện ngoài, xuất bản — không cần mở terminal lần nào.

#### Ba màn

Điều hướng có hai tầng: **màn** ở trên, **khu** ở dưới. Cả ba màn luôn hiện ở đỉnh rail trái.

| Màn | Phạm vi | Chứa |
|---|---|---|
| **Quản lý** | cả xưởng | danh sách tác phẩm · dải việc cần bạn · tổng xưởng · tác phẩm mới · cùng dựng |
| **Cài đặt chung** | mọi tác phẩm | nhà cung cấp & khóa · model mặc định theo vai · chi phí toàn xưởng |
| **Xưởng sản xuất** | một tác phẩm | 13 khu sáng tác và vận hành của cuốn đang mở |

Màn mở đầu là **Quản lý**. `?tp=<tác-phẩm>` trên URL mở thẳng xưởng sản xuất của cuốn đó;
`?khu=<khu>` thắng cả hai.

<p align="center">
  <img src="docs/assets/quan-ly.png" alt="Màn Quản lý: danh sách tác phẩm, dải việc cần bạn, tổng xưởng" width="820">
</p>

<p align="center">
  <sub>Màn <b>Quản lý</b>. Dải trên cùng chỉ hiện khi có việc thật đang chờ người — ở đây là một
  mốc tạm dừng đã ký kèm nguyên văn lý do, và một ý kiến can thiệp chưa xử lý.</sub>
</p>

**Đổi màn là đổi cả khung, không chỉ đổi canvas.** Bộ chọn tác phẩm chỉ có ở màn sản xuất; hai
màn kia hiện gốc xưởng. Thanh transport — nơi có nút `▶ Chạy` tiêu tiền thật — cũng chỉ có ở
màn sản xuất, vì một điều khiển cấp-tác-phẩm không có việc gì ở đáy một bề mặt liệt kê mọi
tác phẩm.

#### Một engine mỗi lần

`boMay.soToiDa == 1` — engine chỉ mở **đúng một** cuốn mỗi lần, cuốn thứ hai nhận
`errQuaNhieuMay`. Nên "sản xuất hàng loạt" ở đây nghĩa là **quản lý** nhiều cuốn kèm một hàng
ưu tiên rõ ràng, **không** phải chạy song song. Màn Quản lý cố ý không vẽ bảng điều phối chạy
song song: vẽ một hàng đợi cho một cơ chế chưa có là hứa một thứ bấm vào không chạy.

Engine chạy **trong cùng process** với studio. Bản trước của tài liệu này giải thích vì sao studio chỉ đọc ("engine là process riêng và nó sở hữu quyền ghi; hai process cùng sửa `meta/run_meta.json` sẽ làm mất ý kiến can thiệp"), và lý lẽ đó đúng với tiền đề của nó. Tiền đề đã đổi: không còn hai process, studio LÀ người ghi duy nhất. Mọi lệnh ghi đi qua `*host.Host` nên chúng dùng đúng những giao dịch mà engine dùng cho chính nó.

Hai hàng rào đi kèm:

- **Khóa mức tệp** (`meta/studio.lock`). `store.IO.WithWriteLock` chỉ là mutex trong process, nên nó không thấy process khác. TUI vẫn chạy được, nên khóa này là thứ chặn hai bên cùng mở một cuốn. Nó nêu PID đang giữ và đường dẫn tệp cần xóa nếu khóa mồ côi.
- **Đường ghi chỉ bật trên loopback.** Từ khi studio giữ khóa API và khởi động được engine, một yêu cầu từ người lạ không chỉ đọc được bản thảo mà còn tiêu được tiền. Nên `--addr` không phải loopback thì cả nhóm route ghi KHÔNG được mắc — studio lui về đúng hành vi chỉ-đọc cũ. Thêm một hàng rào chống CSRF sang localhost (header riêng + kiểm `Origin`/`Host`), vì mọi trang web đang mở đều gọi được tới `127.0.0.1`.

Khóa API đi **một chiều**: đặt được qua giao diện, nhưng API không bao giờ trả nó về — chỗ nào cần hiện thì chỉ hiện dạng che (`sk-4…802`).

#### Vì sao không có bản dùng thử trên web

**[ainovel.lingoreup.com](https://ainovel.lingoreup.com)** là trang giới thiệu, không phải bản chạy thử. Đó là hệ quả trực tiếp của hàng rào ngay bên trên, không phải chuyện chưa làm tới.

Một bản dùng thử công khai đòi mở đường ghi cho người lạ, mà đường ghi là thứ giữ khóa API và khởi động được engine. Nên một trang cho người lạ bấm "Bắt đầu viết" là một trang cho người lạ tiêu tiền của người khác. Hai lựa chọn còn lại đều không hấp dẫn hơn: khách tự dán khóa của họ vào máy chủ của bạn (bạn thành người giữ secret của người khác), hoặc bạn trả tiền và phải xây hạn mức, chống lạm dụng, chống tạo nhiều tài khoản.

Còn một ràng buộc kỹ thuật độc lập: `boMay.soToiDa == 1`, engine mở đúng một cuốn mỗi process. Nên "nhiều người dùng cùng lúc" không phải chuyện thêm một bảng vào database — nó là một process cho mỗi người, cộng một tầng điều phối vòng đời. Đó là một sản phẩm thứ hai, không phải một bước deploy.

Bản chạy trên máy bạn thì không có mâu thuẫn nào trong số đó: khóa của bạn, tiền của bạn, dữ liệu trên đĩa của bạn, và hàng rào loopback được thỏa tự nhiên. Xem [Bắt đầu nhanh](#bắt-đầu-nhanh).

### Quản lý nhiều tiểu thuyết

Mỗi cuốn tiểu thuyết gắn với thư mục khởi động, sản phẩm nằm ở `{cwd}/output/novel/`. Khởi động ở thư mục khác = một cuốn khác, `cd` về lại rồi khởi động = tự khôi phục từ checkpoint gần nhất. Cấu hình `~/.ainovel/config.json` dùng chung toàn cục, không cần copy.


### Tệp cấu hình

Chạy lần đầu, hệ thống tự dẫn dắt sinh tệp cấu hình `~/.ainovel/config.json`. Vào TUI rồi có thể nhập `/config` để thêm hoặc sửa Provider, lưu nhiều model và đặt cửa sổ ngữ cảnh cho từng model; lưu là có hiệu lực ngay. `/model` dùng để chuyển giữa các model đã lưu đó.

Cũng có thể tạo tệp cấu hình bằng tay, tham khảo `config.example.jsonc` ở thư mục gốc của repo. Luồng dẫn dắt lần đầu cũng copy một bản sang `~/.ainovel/config.example.jsonc` cho tiện xem offline trên máy.

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
      ],
      "extra": {
        "user_agent": "my-client/1.0",
        "headers": { "X-Custom-Client": "my-client" }
      }
    }
  },
  "style": "default"
}
```

#### Thứ tự tìm tệp cấu hình (bản sau ghi đè bản trước)

1. `~/.ainovel/config.json` — cấu hình toàn cục
2. `./.ainovel/config.json` — ghi đè ở cấp dự án (tùy chọn)

> `.ainovel/` cấp dự án là bản phản chiếu của `~/.ainovel/` toàn cục: cùng cấu trúc, chỉ khác gốc từ thư mục home đổi sang dự án hiện tại. Cấu hình đặt ở `./.ainovel/config.json`, luật viết đặt ở `./.ainovel/rules/*.md` (xem phần «Khử mùi AI và luật tự định nghĩa» bên dưới). Thư mục này chứa khóa nên đã được thêm vào `.gitignore` mặc định.

Giải thích luật ghi đè:

- Trường vô hướng thì bản sau ghi đè bản trước, ví dụ `provider`, `model`, `reasoning_effort`, `style`
- `providers` và `roles` hợp nhất theo key, các mục trùng tên thì ghi đè theo từng trường bên trong
- Trường không điền sẽ kế thừa cấu hình tầng trên, ví dụ cấu hình cấp dự án chỉ ghi `base_url` thì vẫn giữ `api_key` của cấu hình toàn cục
- Không hỗ trợ dùng chuỗi rỗng để xóa giá trị đã có ở tầng trên; muốn xóa thì sửa trực tiếp tệp cấu hình có ưu tiên cao hơn

> ⚠️ Giá trị của `provider` (và `roles.*.provider`) là **tên key** trong `providers` — một con trỏ, không phải tên giao thức. Nếu cấu hình cấp dự án chuyển `provider` sang một tài khoản không tồn tại trong `providers` toàn cục thì phải bổ sung luôn thông tin xác thực của tài khoản đó ở cấp dự án (`api_key` / `base_url`), nếu không khởi động sẽ báo "chưa cấu hình thông tin xác thực".

`providers.<name>.models` là danh sách đối tượng model tùy chọn: `name` là tên model gửi cho Provider, `context_window` là cửa sổ nén ngữ cảnh riêng của model đó, `json_schema` là ghi đè ba trạng thái cho đầu ra có cấu trúc nguyên bản (`true` xác nhận có hỗ trợ, `false` xác nhận không hỗ trợ, bỏ trống thì dùng năng lực của adapter). Với proxy tự dựng hoặc khi năng lực phụ thuộc model cụ thể thì nên điền rõ. Mảng chuỗi kiểu cũ vẫn đọc được, lần sau lưu qua `/config` sẽ được chuẩn hóa thành danh sách đối tượng. Nếu không cấu hình, hệ thống lùi về các model cùng Provider đã từng xuất hiện trong cấu hình.

Cửa sổ ngữ cảnh được giải theo thứ tự "giá trị riêng của model → `context_window` cũ ở tầng đỉnh → sổ đăng ký model → 200K đỡ lưng". Nó chỉ ảnh hưởng thời điểm nén ngữ cảnh cục bộ, không thay đổi hạn mức request thật của API phía xa.

`/config` chỉ dùng để **sửa định nghĩa của Provider** (giao thức / API Key / Base URL / thư viện model), không phụ trách "hiện đang dùng model nào" — muốn chuyển model và cường độ suy luận thì dùng `/model`. Danh sách model hỗ trợ `↑↓` chọn dòng, `←→` chọn trường, `Enter` sửa tại chỗ ID model hoặc cửa sổ ngữ cảnh, `Delete` để xóa; cuối danh sách thêm model được luôn, không phải vào nhiều tầng trang chi tiết nữa. Cửa sổ nhận số nguyên, `128K`, `1M`; để trống nghĩa là tự giải. Lưu thì **ghi về gần nhất, tức bản cấu hình đang có hiệu lực** — thư mục dự án có `./.ainovel/config.json` thì ghi vào đó, không thì ghi vào `~/.ainovel/config.json` toàn cục — và áp dụng nóng ngay. Sửa thường thì chỉ bổ sung đoạn Provider tương ứng; khi sửa ID model một cách tường minh, hệ thống di trú đồng bộ các tham chiếu ở tầng đỉnh, ở vai và ở fallback trong cùng một lượt ghi nguyên tử. Model đang được tham chiếu thì không xóa trực tiếp được, phải chuyển đi ở `/model` trước. Ô nhập API Key luôn được ẩn.

API Key và Base URL trong trang chi tiết Provider sửa được tại chỗ, Key đã có chỉ hiện gợi ý che giữa; "kiểm tra kết nối" sẽ dùng bản nháp hiện tại và model đang chọn để gửi một request thật tối thiểu, có thể phát sinh chút lượng dùng API, nhưng kết quả kiểm tra không chặn việc lưu và không kích hoạt hạ cấp tự động. Các cấu hình nâng cao như `extra`, `extra_body`, `stream_idle_timeout` vẫn được bảo trì trong đúng tệp cấu hình mà giao diện đang hiển thị.

`reasoning_effort` là cường độ suy luận mặc định, các giá trị chọn được là `off` / `low` / `medium` / `high` / `xhigh` / `max`; bỏ trống hoặc chuỗi rỗng nghĩa là dùng mặc định của model/provider. `roles.<role>.reasoning_effort` ghi đè được theo vai, không cấu hình thì kế thừa `reasoning_effort` ở tầng đỉnh. Cường độ suy luận có hiệu lực theo "ý định × năng lực": trong cấu hình lưu **ý định gốc** bạn đã chọn, lúc gửi đi thật thì bị kẹp lại theo **năng lực của model hiện tại của vai đó** — chuyển sang model năng lực thấp hơn chỉ làm giá trị có hiệu lực lần đó bị kẹp thấp, ý định lưu vẫn nguyên, chuyển về model mạnh là tự phục hồi. Panel `/model` của TUI sau khi chuyển provider, model hoặc cường độ suy luận sẽ ghi về bản cấu hình đang có hiệu lực (giống `/config`: có bản cấp dự án thì ghi dự án, không thì ghi toàn cục).

`providers.<name>.api` chỉ có hiệu lực với `type: "openai"` hoặc `openai` dựng sẵn, dùng để chọn endpoint của giao thức OpenAI: `chat` (mặc định, `base_url + /chat/completions`) hoặc `responses` (`base_url + /responses`). Nếu `base_url` đã chứa đường dẫn (như `/api/v3` của Volcano Ark) thì đường dẫn đó được giữ nguyên; chỉ điền tên miền thì mặc định dùng `/v1` của OpenAI. Proxy kiểu Codex thường cần cấu hình thành `responses`.

`providers.<name>.extra` là cấu hình cấp provider, được truyền xuống HTTP client, phù hợp để cấu hình các trường nhận dạng của proxy như `user_agent`, `headers`, `anthropic_beta`; còn `providers.<name>.extra_body` mới là tham số mở rộng của body request — đừng dùng lẫn hai thứ.

## Báo cáo chẩn đoán

Nhập `/diag` trong TUI để chẩn đoán và phân tích các sản phẩm trong output của tác phẩm hiện tại, cho ra những phát hiện và đề xuất cải thiện thi hành được.

Chẩn đoán bao gồm bốn chiều:

- **Luồng** — vòng viết lại bị kẹt, chỉ thị chuyển hướng chưa được tiêu thụ, trạng thái phase/flow bất thường, số chương bị nhảy
- **Chất lượng** — chiều duyệt liên tục điểm thấp, tỉ lệ thực hiện khế ước, tỉ lệ viết lại, số từ của chương bất thường
- **Quy hoạch** — phục bút đứng bánh, la bàn lỗi thời, dàn ý cạn, thiếu tóm tắt
- **Ngữ cảnh** — nhân vật biến mất, lỗ hổng trên trục thời gian, dữ liệu quan hệ đứng bánh

Mỗi phát hiện gồm: mô tả vấn đề, bằng chứng dữ liệu, đề xuất cải thiện (trỏ tới prompt/flow/config cụ thể).

`/diag` đồng thời ghi ra một bản `meta/diag-export.md` **đã tẩy thông tin riêng** (bỏ chính văn tiểu thuyết, chỉ giữ bộ xương hành vi gồm lời gọi tool, chuỗi lỗi, số lần lặp v.v.). Gặp vấn đề kiểu vòng lặp vô tận / bị ngắt, dán tệp đó vào GitHub issue là đủ, giúp người bảo trì định vị được khi không có dữ liệu cục bộ của bạn.

## Chân dung mô phỏng văn phong

Đặt các bài tham khảo vào thư mục `simulate/` trong thư mục khởi động hiện tại, rồi nhập `/simulate` trong TUI. Hệ thống đọc đệ quy các tệp `.txt`, `.md`, `.markdown`, dùng model của architect để phân tích ngữ liệu, và ghi vào:

```text
output/novel/meta/simulation_profile.json
```

Chạy `/simulate` lần nữa, hệ thống bỏ qua các tệp không đổi theo `relative_path + sha256`; nếu không có nội dung mới hoặc thay đổi, nó thông báo "chân dung đã là mới nhất" và không gọi LLM. Nếu đã có chân dung mà `simulate/` xuất hiện bài mới hoặc bài đã sửa, hệ thống tiếp tục tổng hợp trên nền chân dung cũ.

Cũng có thể nhập chân dung đã sinh trước đó để tránh phân tích lại cùng một mớ bài:

```text
/simulate
/importsim ./profile.json
```

`/importsim` chỉ nhận JSON `simulation_profile.v1` do chính chức năng này sinh ra, và hợp nhất theo dấu tay của ngữ liệu, nguồn trùng thì bỏ qua. Chỉ nhập tệp chân dung từ nguồn tin được; nội dung nhập vào sẽ trở thành ngữ cảnh tham chiếu cho các Agent về sau. Chân dung được tiêm vào `novel_context` ở dạng compact, cả Architect, Writer, Editor đều đọc được; mỗi Agent chỉ học kết cấu, nhịp, móc và thủ pháp hút người đọc, không copy cách diễn đạt hay thiết định riêng của nguyên văn.

## Nhập

Nhập `/import <đường dẫn tệp>` trong TUI để **biên dịch ngữ nghĩa** một cuốn tiểu thuyết đã có vào dự án. Mỗi lần khởi động gắn với một cuốn sách (`output/novel` dưới thư mục khởi động), nên việc nhập thường được phát ngay ở **màn hình chào sau khi khởi động trong thư mục mới** — nó nằm ngang hàng với "nhập yêu cầu để mở sách mới" và "cùng lên kế hoạch mở sách mới", là cách thứ ba để mở một cuốn sách; khi engine đang sáng tác thì lệnh này bị từ chối. Đường ống tiến theo từng giai đoạn: chụp ảnh tệp nguồn (ingest) → LLM nhận biên chương (segment) → xác nhận cách chia → trích sự thật từng chương (analyze) → quy nạp phân tầng ra tiền đề / nhân vật / luật thế giới / dàn ý phân tầng / la bàn cho cả sách (synthesize) → phát hành Foundation chính thức và ghi từng chương xuống đĩa (publish). Biên chương do model phán quyết theo ngữ nghĩa, không dựa vào luật tiêu đề cứng; phía Go chỉ nắm tọa độ, kiểm tra bao phủ, tính bất biến và thứ tự.

Luồng điển hình chỉ ba bước — nhập, đối chiếu, đợi xong:

```text
/import ~/tieu-thuyet-cua-toi.txt   # ① Khởi động: panel hiện tiến độ trực tiếp, chia xong thì dừng lại
                                    # ② Đối chiếu toàn bộ tiêu đề chương panel liệt kê: bấm y để tiếp
                                    # ③ Tự chạy hết phân tích→tổng hợp→phát hành, xong thì dừng ở nghiệm thu, xác nhận ổn là sáng tác tiếp
```

Chia không đúng? Esc để đóng panel, nói bằng ngôn ngữ tự nhiên rồi nhận biên lại (sẽ lại dừng để đối chiếu):

```text
/import --guide=Màn phụ · X cũng là chương riêng     # Văn bản hướng dẫn có thể chứa dấu cách, đặt ở cuối lệnh
```

Toàn bộ tùy chọn (ba cái đầu được lưu bền, sau khi khôi phục từ sập máy vẫn tuân thủ):

```text
/import ~/tieu-thuyet-cua-toi.txt --yes           # Không người trực: tự nhận cách chia và chạy hết
/import ~/tieu-thuyet-cua-toi.txt --story=closed  # Trả lời trước "trạng thái truyện còn ngờ": xử theo đã hoàn (closed) / chưa hoàn (open)
/import ~/tieu-thuyet-cua-toi.txt --continue      # Nhập xong là viết tiếp luôn, không dừng ở nghiệm thu
/import                                           # Không tham số: khôi phục lần nhập chưa xong từ chỗ bị ngắt
```

Điều kiện trước và khôi phục:

- Chỉ nhập được vào **sách trống** (chưa có chương nào hoàn thành), không hỗ trợ ghép một cuốn khác vào tác phẩm đã có; tệp nguồn hỗ trợ `txt`/`md`, mã hóa UTF-8 / GB18030 (tự nhận biết, không giải mã đáng tin được thì báo lỗi rõ ràng).
- Sản phẩm của từng giai đoạn nằm ở khu làm việc `meta/import/` và gắn theo dấu tay của đầu vào: bị ngắt hay thất bại thì chạy lại `/import` chỉ làm bù phần còn thiếu, không gọi lại model, không phải nhớ "đã nhập tới chương mấy". Khi có lần nhập chưa xong, màn hình chào sau khi khởi động lại sẽ chủ động nhắc tiến độ (ví dụ "đã phân tích 210/300 chương"); trước khi khôi phục xong, engine bị cửa gác chặn nên không lấy bán thành phẩm ra viết tiếp như thể là sách đủ. Phản hồi thô của các lần model xuất lỗi được lưu ở `meta/import/failures/` để tra.
- Khi trạng thái truyện bị tổng hợp phán là `uncertain` thì đường ống dừng, làm rõ bằng `--story=open|closed` rồi chạy lại là được.
- Mặc định sau khi phát hành xong sẽ đặt một Hold nghiệm thu, đợi bạn xác nhận mới viết tiếp; `--continue` bỏ qua Hold đó (ở chế độ review vẫn cần `/next`).
- Ba hàm ngữ nghĩa của việc nhập có thể chỉ định bậc model riêng trong `roles` của cấu hình (xem [Dùng model khác nhau theo vai](#dùng-model-khác-nhau-theo-vai)).

> Nguyên văn được ghi xuống đĩa từng chữ thành các chương đã hoàn thành, nên việc nhập phù hợp để "viết tiếp cùng một cuốn". Nếu chỉ muốn học thiết định để sáng tác hoàn toàn mới thì hãy mở một cuốn mới theo cách thường và mô tả văn phong, thiết định bạn muốn trong yêu cầu.

## Xuất

Nhập `/export` trong TUI để hợp nhất và xuất các chương đã hoàn thành, mặc định TXT, ghi vào `{novelDir}/{NovelName}.txt`. Xuất là tác vụ chỉ đọc, đang viết giữa đường vẫn lấy được "thành phẩm giai đoạn hiện tại" bất cứ lúc nào, không ảnh hưởng engine đang chạy.

Định dạng do **hậu tố của đường dẫn đầu ra** quyết định (`.txt` / `.epub`):

```text
/export                            # Mặc định TXT, {novelDir}/{NovelName}.txt
/export ~/quang-sang.txt           # Hậu tố .txt → TXT
/export ~/quang-sang.epub          # Hậu tố .epub → EPUB (Apple Books / WeChat Reading / bộ chuyển đổi Kindle đọc được)
/export from=10 to=30 --overwrite  # Khoảng chương + ghi đè
/export from=10 ~/x.epub --overwrite
```

- **TXT** — `《Tên sách》` → phân cách tập → chính văn chương (chế độ phân tầng của truyện dài tự thêm phân cách tập). Hai loại dữ liệu nội bộ **không vào bản xuất**: premise (bản thiết kế sáng tác, chứa thông tin hậu trường như đối tượng đọc / vùng cấm khi viết, viết cho tác giả và engine đọc) và phân cách cung (dưới góc nhìn người đọc, cung là kết cấu nội bộ quá chi li). Bộ xuất sinh thống nhất "Chương N Tiêu đề"; tiêu đề trùng lặp mà writer tự mang trong chính văn (`# Chương N…` hoặc `# Tên chương`) sẽ bị lột đi.
- **EPUB** — container chuẩn EPUB 3, gồm trang bìa, mục lục, XHTML tách theo chương; định danh phái sinh ổn định dựa trên nội dung (xuất lại cùng một cuốn thì trình đọc nhận là bản cập nhật). Không kèm ảnh bìa.

Chương chưa hoàn thành trong khoảng chỉ định sẽ bị bỏ qua và hiện trong kết quả, không tính là lỗi.

#### Dùng model khác nhau theo vai

Dùng trường `roles` để phân model khác nhau cho từng tác tử, vai không cấu hình thì dùng model mặc định:

```jsonc
{
  "provider": "openrouter",
  "model": "google/gemini-2.5-flash",
  "reasoning_effort": "medium",
  "providers": {
    "openrouter": { "api_key": "sk-or-v1-xxx", "base_url": "https://openrouter.ai/api/v1" },
    "anthropic": { "api_key": "sk-ant-xxx" }
  },
  "roles": {
    "writer": { "provider": "anthropic", "model": "claude-sonnet-4", "reasoning_effort": "high" },
    "architect": { "provider": "openrouter", "model": "google/gemini-2.5-pro", "reasoning_effort": "low" }
  }
}
```

Các vai cấu hình được: `architect` / `writer` / `editor`, cùng ba bậc model cho ba hàm ngữ nghĩa của đường ống nhập là `import_segment` / `import_analyze` / `import_synthesize` (không cấu hình thì rơi về architect; có thể trỏ việc chia chương — thiên về máy móc hơn — sang model rẻ hơn để tiết kiệm). Arbiter phán quyết ngữ nghĩa dùng thống nhất model default, hiện chưa mở cấu hình vai riêng.

#### Proxy tự định nghĩa

Chọn Provider nào cũng được rồi điền địa chỉ proxy, hoặc dùng Custom Proxy và chỉ định loại giao thức API. `api_key` của proxy tự định nghĩa là tùy chọn; nếu proxy của bạn không cần xác thực thì bỏ đi được:

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

Nếu proxy dùng giao thức Anthropic và hạn chế chỉ client Claude Code truy cập được, `type` phải đặt là `anthropic`, `anthropic_beta` đặt ở tầng đỉnh của `extra`, còn các HTTP header như Stainless đặt trong `extra.headers`:

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

Nếu proxy dùng giao thức OpenAI/NewAPI và hạn chế chỉ client Codex truy cập được, `type` phải đặt là `openai`, dùng `extra.user_agent` để ghi đè `litellm-go/0.1` mặc định, và truyền xuyên các header nhận dạng Codex trong `extra.headers`. `Session_id` và `X-Codex-Turn-Metadata` trong ví dụ nên đổi thành giá trị ngẫu nhiên ổn định; chúng đồng thời tương thích mẫu truyền xuyên Codex của New API và phép kiểm dấu tay `x-codex-*` của sub2api:

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
        { "name": "gpt-5.4-mini" },
        { "name": "MiniMax-M3", "context_window": 1000000 }
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

- Các giao diện được vận hành sẵn như `openrouter` / `anthropic` / `gemini` / `openai` / `deepseek` / `qwen` / `glm` / `grok` thường cần điền `api_key`
- `ollama` và `bedrock` cho phép không điền `api_key`; Bedrock cần cấu hình `region`, `access_key_id`, `secret_access_key` trong `extra` (`session_token` tùy chọn)
- Proxy tự định nghĩa đã chỉ định `type` tường minh thì cho phép không điền `api_key`

Ví dụ cấu hình `ollama` cục bộ:

```jsonc
{
  "provider": "ollama",
  "model": "qwen3:latest",
  "providers": {
    "ollama": {
      "base_url": "http://localhost:11434/v1"
    }
  }
}
```

### Văn phong

Chuyển bằng trường `style` của tệp cấu hình:

- `default` — văn phong dùng chung
- `suspense` — trinh thám suy luận
- `fantasy` — kỳ ảo tiên hiệp
- `romance` — ngôn tình

### Khử mùi AI và luật tự định nghĩa

Hệ thống có sẵn một đường nền khử mùi AI (mặc định xuất xưởng): danh sách đen máy móc (câu khuôn / từ mỏi, dựng sẵn trong code ở `rules.SystemDefaults()`, kiểm tra tất định lúc commit) + tiêu chí ngữ nghĩa `assets/references/anti-ai-tone.md` (tiêm cho writer / editor để né và để dẫn chứng).

Muốn xếp thêm sở thích riêng thì **không cần sửa mã nguồn**: trong thư mục `~/.ainovel/rules/` (toàn cục, đặt tệp `.md` nào cũng được, hợp nhất theo thứ tự từ điển của tên tệp) hoặc thư mục `./.ainovel/rules/` (theo sách, cũng đặt tệp `.md` bất kỳ, cùng hình thái với toàn cục), **cứ viết sở thích bằng lời thường** (như «đừng viết nhân vật chính thành thánh mẫu», «dùng nhiều cảm nhận cơ thể», «mỗi chương khoảng 3000 từ», «đừng để xuất hiện 'ở một mức độ nào đó'») — không định dạng, không YAML. Hệ thống dùng model để chuẩn hóa các yêu cầu ngôn ngữ tự nhiên này thành ảnh chụp luật của sách (khoảng số từ / từ bị cấm / ngưỡng từ mỏi v.v. dạng ràng buộc có cấu trúc + sở thích văn phong), lúc viết tự tuân theo, lúc nộp tự kiểm máy móc; đường nền máy móc cho các câu khuôn AI và từ mỏi thường gặp đã dựng sẵn, không viết gì cũng dùng được, ghi đè theo mức gần nhất và xếp lớp cùng đường nền dựng sẵn.

### Văn phong tự định nghĩa (Voice Layer)

Chuẩn viết và tiêu chí khử mùi AI cũng ghi đè trực tiếp được, cũng **không cần sửa mã nguồn, không cần biên dịch lại**. Thư mục ghi đè có hai cấp: `<thư mục output>/style/` (theo sách, đi cùng sách — đổi máy rồi khôi phục cùng cuốn đó thì nạp cùng một bản văn phong) > `~/.ainovel/style/` (toàn cục), cấu trúc thư mục:

```
style/
├── voice.md                          # Đoạn nối thêm cho chuẩn viết (bản dựng sẵn được giữ, yêu cầu của bạn nối sau và ưu tiên cao hơn)
├── anti-ai-tone.md                   # Đoạn nối thêm cho tiêu chí khử mùi AI (như trên)
├── styles/
│   └── xianxia.md                    # Thêm văn phong tự định nghĩa (tên tệp chính là tên văn phong, trong config đặt style: xianxia là dùng)
│                                     # (nếu trùng tên với bản dựng sẵn như fantasy.md thì thay thế toàn bộ)
└── genres/
    └── xianxia/
        └── style-references.md       # Tham chiếu đề tài của văn phong đó (thay thế toàn tệp)
```

Ghi nhớ nhanh về ngữ nghĩa: **văn bản mang tính chỉ dẫn (voice / anti-ai-tone) thì nối thêm, còn preset văn phong (styles / genres) thì thay thế toàn tệp**. Ưu tiên của phần nối thêm là chỉ thị đưa cho model; những ràng buộc cần cưỡng chế máy móc (từ bị cấm, số từ) thì viết vào thư mục rules ở trên. Thay đổi có hiệu lực sau khi khởi động lại (khôi phục checkpoint chính xác tới từng bước nên khởi động lại không tốn gì). Prompt thuộc loại giao thức thi hành thì không mở cho ghi đè — các bất biến của việc phối hợp do tầng tool gác, và đó cũng là lý do bạn có thể yên tâm sửa văn phong mà không làm hỏng hệ thống. Chi tiết thiết kế xem `docs/voice-layer.md`.

## Cấu trúc đầu ra

Toàn bộ dữ liệu sáng tác (chương, dàn ý, nhân vật, tiến độ v.v.) được lưu trong thư mục output. Bị ngắt rồi chạy lại là tự viết tiếp từ tiến độ lần trước. Xóa thư mục output sẽ sáng tác lại từ đầu.

```
output/{novel_name}/
├── chapters/           # Bản cuối (Markdown)
│   ├── 01.md
│   └── ...
├── summaries/          # Tóm tắt chương (JSON)
├── drafts/             # Bản nháp chương
├── reviews/            # Báo cáo duyệt
├── meta/
│   ├── premise.md      # Tiền đề câu chuyện
│   ├── outline.json    # Dàn ý chương dạng phẳng (chỉ chứa các chương đã mở rộng)
│   ├── layered_outline.json # Dàn ý phân tầng (tập hiện tại + tập xem trước, chế độ truyện dài)
│   ├── compass.json   # La bàn hướng kết cục (chế độ truyện dài)
│   ├── characters.json # Hồ sơ nhân vật
│   ├── world_rules.json# Luật thế giới
│   ├── progress.json   # Trạng thái tiến độ
│   ├── timeline.json   # Trục thời gian
│   ├── foreshadow.json # Sổ phục bút
│   ├── state_changes.json # Ghi nhận biến động trạng thái nhân vật
│   ├── style_rules.json# Luật văn phong (chắt ra ở biên cung)
│   ├── snapshots/      # Ảnh chụp trạng thái nhân vật (truyện dài)
│   ├── checkpoints.jsonl # Checkpoint cấp step (nối thêm sau mỗi tool thành công)
│   ├── characters.md   # Hồ sơ nhân vật (bản đọc được)
│   └── world_rules.md  # Luật thế giới (bản đọc được)
```

## Khôi phục từ checkpoint

Viết một bộ tiểu thuyết dài có thể mất vài giờ đến vài ngày; sập giữa đường, mất mạng, Ctrl+C đều là chuyện thường. Hệ thống **tự khôi phục khi chạy lại trong cùng thư mục**, không cần làm gì bằng tay.

### Các tình huống khôi phục

| Thời điểm bị ngắt | Hành vi khôi phục |
|---|---|
| Kỳ quy hoạch (đang dựng luật thế giới/dàn ý) | Kiểm các thiết định đã lưu, tự bù phần còn thiếu |
| Đang viết một chương (có bản nháp chưa nộp) | Viết tiếp chương đó, đọc bản nháp đã có để tiếp |
| Đang duyệt | Kích hoạt lại việc duyệt của Editor |
| Hàng đợi viết lại/gia công chưa rỗng | Tiếp tục xử lý các chương đang chờ viết lại |
| Mở rộng cung/tập bị ngắt (duyệt xong mà cung sau chưa mở) | Tự phát hiện cung/tập khung, kích hoạt Architect mở rộng |
| Can thiệp của người dùng chưa xong | Tiêm lại chỉ thị can thiệp lần trước |
| Bị ngắt lúc đang viết bình thường | Tiếp tục từ chương kế tiếp |

### Cách hoạt động

Mọi sản phẩm sáng tác được lưu bền trong thư mục `output/`. Mỗi tool chạy xong là ghi một checkpoint (`meta/checkpoints.jsonl`). Khi khởi động lại:

1. Đọc `progress.json` + checkpoint gần nhất + các tín hiệu đang chờ
2. Sinh chỉ thị khôi phục chính xác tới cấp step (ví dụ "draft chương 7 đã xuống đĩa, hãy tiếp tục check_consistency")
3. Engine tính lại định tuyến ngay từ store rồi chạy tiếp — không có phiên nào cần khôi phục, tính bất biến của checkpoint bảo đảm phái lại vẫn an toàn

> Việc ghi tệp dùng thao tác nguyên tử temp + fsync + rename, mất điện ngay giữa lúc ghi cũng không làm hỏng dữ liệu đã có.

## Nghiệm thu từng chương

Hệ thống mặc định dùng chế độ `auto` để sáng tác tự chủ liên tục. Khi cần đọc soát từng chương, tránh việc trong lúc bạn đang đọc thì máy vẫn viết chương mới, có thể bật cửa nghiệm thu tất định:

```text
/review on   # Bật nghiệm thu từng chương; xong việc hiện tại thì đợi trước chương mới xuôi kế tiếp
/next        # Chỉ mở đúng một chương kế tiếp; việc duyệt và bảo trì kết cấu cung/tập cần thiết vẫn tự hoàn tất
/review off  # Trở lại đẩy tự động; nếu hiện đang tạm dừng, nhập tiếp chỉ thị để khởi động Engine
```

Giấy phép gắn với số chương cụ thể. Chương chỉ tiêu giấy phép sau khi trạng thái khôi phục việc nộp đã rỗng và commit checkpoint đã xuống đĩa, nên process sập giữa lúc nộp cũng không vô tình viết thêm chương sau. Viết lại, gia công, duyệt và bảo trì kết cấu không thuộc loại "chương mới" nên không bị cửa gác chặn.

## Can thiệp thời gian thực (Steer)

Trong lúc sáng tác, bạn có thể tiêm ý kiến sửa qua ô nhập bất cứ lúc nào, **không cần tạm dừng hay khởi động lại**.

### Chế độ TUI

Sau khi sáng tác khởi động, ô nhập dưới đáy tự chuyển sang chế độ can thiệp:

```
❯ Đẩy tuyến tình cảm lên chương 4, thêm cảnh đối đầu giữa nam và nữ chính
```

Nhập xong bấm Enter, hệ thống tự:
1. Ghi chỉ thị can thiệp vào `run.json` (để khôi phục sau sập máy)
2. Arbiter phán quyết ngay (truy vấn phản hồi trong vài giây; động tác thuộc loại điều khiển thì nộp an toàn ở biên chương)
3. Thi hành theo phán quyết: sửa thiết định thì đi qua Architect, viết lại chương đã có thì vào hàng đợi của Editor, luật viết thì xuống đĩa ngay — mỗi phán quyết kiểm toán và phát lại được

### Ví dụ can thiệp

| Chỉ thị can thiệp | Phản ứng hệ thống có thể có |
|---|---|
| "Đổi nhân vật chính thành nữ" | Sửa thiết định nhân vật, lượng định xem các chương đã viết có cần viết lại |
| "Đẩy tuyến tình cảm lên chương 4" | Điều chỉnh dàn ý, có thể viết lại chương 4 và các chương sau |
| "Thêm một nhân vật phản diện" | Cập nhật hồ sơ nhân vật và luật thế giới, đưa vào ở các chương sau |
| "Nhịp chậm quá, đẩy nhanh lên" | Điều chỉnh mật độ dàn ý của các chương sau |

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

- **Go 1.25** — ngôn ngữ chính
- **[agentcore](https://github.com/voocel/agentcore)** — nhân Agent tối giản (tool-calling + streaming)
- **[litellm](https://github.com/voocel/litellm)** — lớp thích ứng giao diện LLM thống nhất
- **[Bubble Tea](https://github.com/charmbracelet/bubbletea)** — framework TUI cho terminal

## Đóng góp

Đây là một bản fork, và điều đó quyết định nên gửi đóng góp đi đâu:

- **Engine, kiến trúc, hành vi tác tử** — những thứ này thuộc về upstream. Xin gửi thẳng tới
  [voocel/ainovel-cli](https://github.com/voocel/ainovel-cli) để cả cộng đồng cùng hưởng, chứ
  không riêng bản fork này.
- **Việt hóa, web studio, tài liệu của fork** — những thứ này ở đây.

Hai quy ước nên biết trước khi mở PR:

- **Giữ diff rebase nhỏ.** Lớp i18n dùng chuỗi nguồn làm msgid chính là để fork bám được một
  upstream đi nhanh. Xin đừng "dọn cho sạch" thành khóa tường minh — lý do đầy đủ ở
  [docs/i18n.md](docs/i18n.md).
- **Chú thích mang LÝ DO.** Mã trong repo này ghi *vì sao*, thường kèm luôn phép đo đã dẫn tới
  quyết định. Viết theo nếp đó là quy ước của nhà.

```bash
go test ./internal/...     # Go
cd web && npx vitest run   # web
cd web && npm run build    # xuất tĩnh
```

## Ghi công

Đây là **bản fork** của [voocel/ainovel-cli](https://github.com/voocel/ainovel-cli) — toàn bộ engine, kiến trúc và thiết kế gốc thuộc về dự án upstream. Bản fork này không phải dự án gốc.

Phần fork thêm vào so với upstream:

- **Lớp i18n** (`internal/i18n/`) — tiếng Việt là mặc định, `AINOVEL_LANG=zh` quay về chuỗi gốc của upstream
- **Việt hóa prompt / tài liệu tham chiếu / văn phong** trong `assets/`, nên AI sinh truyện tiếng Việt thay vì tiếng Trung
- **Web studio** (`internal/serve/` + `web/`) — HTTP API trên store cùng một bề mặt vận hành ba màn, làm được trọn vòng đời (tạo · chạy · can thiệp · nghiệm thu · cấu hình · xuất bản), xem [Web studio](#web-studio)

Bản dịch ban đầu tham khảo [kentjuno/ainovel-cli](https://github.com/kentjuno/ainovel-cli) tại commit `68eb92d` — cảm ơn công sức việt hóa của họ.

## License

MIT

Dự án này tích cực tham gia và ghi nhận [cộng đồng linux.do](https://linux.do/).
