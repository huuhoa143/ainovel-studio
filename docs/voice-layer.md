# Thiết kế tầng văn phong (Voice Layer)

> Trạng thái: thiết kế đã chốt v2 (2026-07-12 tiếp thu duyệt bên ngoài: bổ sung ngữ nghĩa ghi đè, ngữ nghĩa đường dẫn, thứ tự lắp ghép, cửa vào eval, giao thức thống kê khi đánh giá), **thi hành được**.
> Ưu tiên: đi trước việc tiến hóa mặt điều khiển (docs/engine-arbiter.md) — mùi AI là điểm đau đang sống của người dùng.

## 1. Bối cảnh và định nghĩa vấn đề

Người dùng phản hồi rằng nội dung sinh ra "nặng mùi AI". Sau khi tra, kết luận: **vấn đề không phải kiến thức văn phong bị ghép quá sâu vào luồng, mà là vòng lặp cải tiến bị đứt ở hai chỗ**:

1. **Sửa một lần là phải biên dịch lại** — các tài sản ngữ nghĩa về văn phong (anti-ai-tone.md, chuẩn viết trong writer.md, styles/*.md) đều `go:embed`, chỉnh một cách diễn đạt là phải build lại và phát hành;
2. **Không có vòng đo lường riêng cho văn phong** — sửa xong chỉ biết nhờ người đọc rồi cảm nhận, không có đối chiếu trước-sau khách quan, việc tối ưu thành huyền học.

## 2. Kiểm kê hiện trạng (tài sản liên quan tới văn phong gồm năm tầng)

| Tầng | Vị trí | Hiện trạng | Người dùng chỉnh được |
|----|------|------|---------|
| Tiêu chí ngữ nghĩa | `assets/references/anti-ai-tone.md` | writer né + editor dẫn chứng dùng chung, năm loại kết cấu/dùng từ/miêu tả/đối thoại/nhịp | ❌ nhúng trong binary |
| Chuẩn viết | `assets/prompts/writer.md` §chuẩn viết | Trộn cùng một tệp nhúng với giao thức thi hành | ❌ |
| Preset văn phong | `assets/styles/*.md` (4 tệp) | cfg.Style chọn một điểm, nối vào prompt của writer | ❌ và không thêm mới được |
| Luật máy móc | `internal/rules` | Từ mỏi/từ bị cấm/số từ, commit kiểm cưỡng chế | ✅ đã có ba tầng ghi đè (chú ý: "cấp dự án" của nó gắn với **cwd**, xem 3.4) |
| Sở thích lúc chạy | Động tác `rules` của Arbiter | Ngôn ngữ tự nhiên → có cấu trúc, có hiệu lực xuyên khởi động lại | ✅ |

Còn hai hạ tầng then chốt khác: **stylestat** (thống kê tic mẫu câu ở cấp cả sách, mớm lại cho writer làm "gương từ đầu miệng", code thuần, không ảo giác) và **`OverridePrompt` của eval** (hạ tầng A/B prompt đã có sẵn).

Kết luận: khả năng chỉnh và nguyên liệu đo lường của tầng máy móc đã sẵn sàng, chỗ hụt tập trung ở **tầng ngữ nghĩa không ghi đè được** và **vòng đo lường chưa nhắm vào văn phong**.

## 3. Thiết kế

### 3.1 Nguyên tắc cốt lõi

**Tách "viết thế nào" (văn phong) ra khỏi "phối hợp thế nào" (giao thức): cái trước thì dữ liệu hóa, ghi đè được; cái sau thì giữ nhúng lúc biên dịch.**

### 3.2 Tách writer.md: lấp lại tại chỗ bằng chỗ giữ

Mục chuẩn viết của writer.md nằm ở **giữa** tệp (sau giao thức thi hành, trước phần liên tục của nhân vật phụ), không thể nối đuôi đơn giản. Dùng phương án chỗ giữ:

- `writer.md` (giao thức, nhúng): giữ giao thức thi hành / chạy tiếp từ checkpoint / viết lại và gia công / khế ước chương / phần giải thích cơ chế sở thích người dùng / **toàn bộ mục số từ (gồm cả gợi ý cách viết)** / phần liên tục của nhân vật phụ / tham số commit; vị trí mục chuẩn viết cũ được thay bằng **một** chỗ giữ `{{VOICE}}` duy nhất
- `voice.md` (văn phong, ghi đè được): toàn bộ mục chuẩn viết (khử mùi AI / đa dạng mẫu câu / không kể lại tình tiết trước)

Gợi ý cách viết về số từ được để lại tệp giao thức (duyệt 2026-07-12 chấp nhận): nó ghép rất chặt với việc thi hành hợp đồng số từ, tách ra thì cần chỗ giữ thứ hai, biến Voice thành định dạng nhiều mảnh — không đáng, chỉ vì một đoạn văn bản kỹ thuật mà rất ít người muốn ghi đè; sở thích của người dùng về số từ thì đi qua user_rules. Tên tệp giữ nguyên `writer.md`, không đổi (`OverridePrompt` của eval lấy tên tệp làm khóa, đổi tên chỉ thêm việc đấu dây).

**Thứ tự lắp ghép buộc phải tương thích từng byte với hiện trạng.** Hiện trạng là `writer.md → simulationGuidance → style` (assets/load.go:84 + agents/build.go:247), nên hàm lắp ghép duy nhất là:

```go
// Cửa vào duy nhất cho production, eval, test; {{VOICE}} lấp lại tại chỗ bảo đảm tách mà không mất gì
func BuildWriterPrompt(protocolTemplate, voice, simulationGuidance, style string) string
// = replace(protocolTemplate, "{{VOICE}}", voice) + simulationGuidance + style
```

Bài học tiền lệ: chú thích của `WithSimulationGuidance` từng ghi lại cái hố "baseline có lớp bọc, variant không có → A/B không tương đương"; đường lắp ghép phân nhánh là ổ ấp cho cùng loại sự cố, nên thu về một hàm duy nhất.

### 3.3 Mô hình ghi đè: ngữ nghĩa theo từng tài sản (không lập lờ)

| Tài sản | Ngữ nghĩa ghi đè | Lý do |
|------|---------|------|
| `voice.md` | **Nối thêm**: bản dựng sẵn được giữ, bản toàn cục/bản theo sách nối thêm dưới dạng đoạn có gắn cờ | Thay toàn tệp sẽ làm người dùng mãi mãi đứng ở bản dựng sẵn cũ; nhu cầu thường gặp là tinh chỉnh chứ không phải viết lại |
| `anti-ai-tone.md` | **Nối thêm** (như trên) | Nhu cầu thường gặp là bồi thêm tiêu chí; người muốn phủ định tiêu chí dựng sẵn là cực ít, không thiết kế cho họ |
| `styles/<name>.md` | **Trùng tên thì thay toàn tệp**; tên tệp mới chính là thêm văn phong mới | Văn phong là một giọng nói nguyên khối, gộp hai văn phong thì vô nghĩa |
| `genres/<name>/style-references.md` | Trùng tên thì thay toàn tệp; style tự định nghĩa mà không có reference thì **cho phép khuyết, không lùi về default** (tham chiếu sai còn tệ hơn không có) | Như trên |
| user_rules | Ưu tiên cao nhất lúc chạy (hiện trạng không đổi) | — |

Việc lắp ghép của ngữ nghĩa nối thêm có cờ đánh dấu biên tường minh:

```
## Văn phong mặc định của dự án
...
## Ghi đè văn phong toàn cục của người dùng (các yêu cầu dưới đây ưu tiên hơn mặc định của dự án)
...
## Ghi đè văn phong theo sách (các yêu cầu dưới đây ưu tiên hơn tất cả phần trên)
...
```

**Biên giới trung thực**: dưới ngữ nghĩa nối thêm, "bản sau thắng" là chỉ dẫn ưu tiên đưa cho LLM, không phải bảo đảm máy móc — văn phong là nội dung mang tính đề xuất, chấp nhận được; những ràng buộc cần bảo đảm máy móc thì đi qua tầng rules (ở đó mới là ghi đè thật). Biên giới này được viết vào tài liệu cho người dùng.

`arc-templates.md` thuộc mặt quy hoạch (nó tạo hình kết cấu truyện chứ không tạo giọng), **không vào danh sách trắng của v1**, ghi lại để bàn sau.

### 3.4 Ngữ nghĩa đường dẫn: cấp theo sách gắn với outputDir, không gắn cwd

```
Cấp theo sách   <outputDir>/style/     >   Toàn cục   <userData>/style/   >   Mặc định dựng sẵn (embed đỡ lưng)
```

- Gắn với outputDir làm Voice **đi cùng sách**: đổi thư mục rồi khôi phục cùng cuốn đó thì nạp cùng một bản văn phong; Docker/headless/TUI giải đường dẫn như nhau; nhiều sách dùng chung cwd thì không lẫn vào nhau
- Chữ ký của `assets.Load` nhận tường minh gốc để giải (outputDir), **bên trong không đọc cwd**
- Chú ý khác biệt với tầng rules: `./.ainovel/rules` của rules gắn với cwd (quy ước đã có ở internal/rules/loader.go, thiết kế này không động vào nó); tài liệu cho người dùng nói rõ ngữ nghĩa hai bên khác nhau — rules là "cấp dự án", voice là "cấp theo sách"

Cấu trúc đầy đủ của thư mục người dùng:

```
<outputDir>/style/            (<userData>/style/ đồng dạng — thư mục dữ liệu app, cạnh config.json)
  voice.md                    đoạn nối thêm
  anti-ai-tone.md             đoạn nối thêm
  styles/
    xianxia.md                thêm mới hoặc thay khi trùng tên
  genres/
    xianxia/
      style-references.md     tùy chọn
```

Tên style chính là tên tệp, kiểm theo `[a-z0-9-]+`, từ chối các ký tự đường dẫn.

### 3.5 Vì sao mở cho người dùng là an toàn

Các bất biến của giao thức đều sống ở **tầng sự thật**: draft trước check, commit cưỡng chế kiểm luật máy móc, chặn khi số từ vượt biên, checkpoint bất biến — chúng không sống trong prompt. Người dùng có sửa voice.md hoang đường cỡ nào thì lan can và tiền điều kiện của tool vẫn có hiệu lực như thường, kết quả tệ nhất là văn khó đọc, chứ máy trạng thái không hỏng nổi.

### 3.6 Thời điểm có hiệu lực và cửa vào eval

- v1 giải lúc khởi động, **khởi động lại là có hiệu lực** (khôi phục checkpoint chính xác tới từng bước nên chi phí khởi động lại gần như bằng không; không làm nạp nóng)
- eval thêm **cửa vào variant riêng cho voice** (như `Bundle.OverrideVoice(raw)`), bên trong đi qua cùng đường `BuildWriterPrompt` — cấm làm A/B văn phong bằng cách ghi đè toàn bộ writer.md (sẽ kéo theo cả giao thức, và giao thức của baseline/variant có thể không tương đương)

## 4. Vòng đo lường: bộ đánh giá văn phong

```
sửa voice/anti-ai-tone
  → bộ đánh giá văn phong (ca cố định, A/B voice-variant bằng eval)   ← phần duy nhất thêm mới
  → đối chiếu chỉ số stylestat (chỉ số cứng tất định)
  + LLM judge chấm điểm và dẫn chứng từng mục theo tiêu chí anti-ai-tone (giai đoạn đầu chỉ báo cáo, không làm hard gate)
```

Giao thức thống kê (đầu vào cố định chỉ bảo đảm **so sánh được**, không bảo đảm tái lập được):

- baseline/variant chốt cùng một model và cùng tham số suy luận
- Mỗi ca lặp N≥3 lần, báo cáo trung bình, phương sai và các mẫu thô
- judge chấm mù (không phơi danh tính baseline/variant)
- Các ca bao phủ đề tài × loại chương (mở đầu/đẩy thường ngày/cao trào/thu về)

## 5. Dứt khoát không làm (chống thiết kế quá mức)

- Không mở prompt giao thức cho người dùng cuối (`OverridePrompt` giữ làm năng lực nội bộ của eval)
- Không làm nạp nóng lúc đang chạy
- Không mở các mẫu regex của stylestat thành cấu hình cho người dùng (cửa mở rộng của tầng máy móc đã có: fatigue_words/forbidden_phrases của rules)
- Không làm chợ văn phong/cơ chế chia sẻ (copy thư mục style là tự nhiên chia sẻ được)
- arc-templates không vào danh sách trắng của v1

## 6. Các bước thi hành và nghiệm thu

1. Tách writer.md (chỗ giữ `{{VOICE}}`) + hàm lắp ghép duy nhất `BuildWriterPrompt`
2. Bộ giải ba tầng: `assets.Load(outputDir, style)` + ngữ nghĩa theo từng tài sản (bảng 3.3) + gộp phép liệt kê styles; kiểm thử đơn vị bao phủ ưu tiên/đỡ lưng khi khuyết/cờ đánh dấu biên của phần nối thêm
3. Cửa vào `OverrideVoice` của eval
4. Tài liệu cho người dùng: cấu trúc thư mục, ngữ nghĩa theo từng tài sản, khác biệt ngữ nghĩa đường dẫn giữa rules và voice, ví dụ
5. Bộ đánh giá văn phong (có thể để lại thành một tác vụ riêng)

**Chuẩn nghiệm thu**: ① khi không có tệp ghi đè nào, `BuildWriterPrompt` cho ra kết quả **khớp từng byte** với trước khi tách; ② ưu tiên ba tầng và ngữ nghĩa nối thêm/thay thế có kiểm thử đơn vị dạng bảng; ③ thêm `styles/xianxia.md` là `style: xianxia` dùng được ngay; ④ A/B voice của eval đi cùng đường lắp ghép với production (có kiểm thử chứng minh); ⑤ toàn bộ kiểm thử và hồi quy sim đều xanh.

## 7. Quan hệ với việc tiến hóa mặt điều khiển

Hoàn toàn trực giao (mặt nội dung vs mặt điều khiển), không phụ thuộc khi thi hành. Thứ tự đã hẹn: **tầng văn phong → bộ đánh giá văn phong → Engine/Arbiter (đẩy theo nghị quyết §8 trong tài liệu của nó)**.
