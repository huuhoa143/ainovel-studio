# Hệ thống đánh giá của ainovel-cli

> Đánh giá không phải là dựng mới một bộ script kiểm tra, mà là **lấy chính những thứ dự án đã có — bộ chẩn đoán sự thật (`diag`), bộ thống kê văn phong cấp cả sách (`stylestat`), phần duyệt bảy chiều nguyên bản (`ReviewEntry`) — làm bộ đánh giá**, rồi bọc thêm một lớp harness chạy lô offline. Một bản định nghĩa sự thật, không còn trôi lệch ở hai nơi.

---

## 0. Vì sao phải thiết kế lại

Tính ổn định đã chạy được: truyện dài 235 chương / 1.270.000 từ viết xong một hơi, vòng kín quy hoạch cuốn dần thành lập (xem `architecture.md` §9.1). Điểm nghẽn đã dịch chuyển — sang **chất lượng lặp được**:

- Sau khi sửa một prompt, luồng còn ổn định không? Chuỗi tool, việc đẩy trạng thái, các sự thật đã lưu bền còn đúng không?
- Chất lượng chính văn, dàn ý, việc duyệt là thật sự tăng lên, hay chỉ là lần này rút thăm ngẫu nhiên được kết quả tốt?
- Trong truyện dài thì nhân vật, trục thời gian, phục bút, ngữ cảnh có tiếp tục đáng tin không?
- **Việc văn phong bị đóng cứng ở cấp cả sách** (tic mẫu câu bình quân mấy chục lần mỗi chương, hình thái cuối chương đồng dạng, đọc lại từng chữ xuyên chương) có tốt lên hay tệ đi không? Đây là hung thủ thật của kết quả 6,5/10 đo thực tế trên 196 chương, mà việc duyệt từng chương thì mù tự nhiên với nó.

Hiện các phán đoán này dựa vào "cảm giác + người rút đọc". Hệ thống đánh giá phải biến việc sửa prompt từ chỗ dựa cảm giác thành một quy trình kỹ thuật **có hồi quy, có bằng chứng, có người đọc mẫu**.

Nhưng dự án này không cần, và cũng không nên, bê nguyên một nền tảng eval thông dụng của ngành (dataset / experiment / scorer / cơ sở dữ liệu / Web UI). Lý do rất đơn giản: **cái nhân của những năng lực đó — phép kiểm tất định và tín hiệu chất lượng — đã tồn tại trong dự án, viết bằng Go, và dùng chung một bản mô hình sự thật với runtime.**

---

## 1. Luận điểm cốt lõi: bộ đánh giá đã tồn tại

Bốn loại bộ đánh giá của hệ thống đánh giá, ba loại đã được hiện thực trong codebase, chỉ là chưa từng được gọi với vai "bộ đánh giá":

| Bộ đánh giá | Năng lực dự án đã có | Cửa vào | Sản phẩm |
|---|---|---|---|
| **Chẩn đoán sự thật tất định** | Một nhóm luật hiện vật + luật runtime của `internal/diag` | `diag.Diagnose(store)` | `Report{Stats, Findings}`, Finding mang Severity/Evidence |
| **Hồi quy văn phong cấp cả sách** | `internal/stylestat` | `stylestat.Compute(input)` | Mẫu câu bình quân mỗi chương, câu lặp xuyên chương, tỉ lệ câu ngắn cuối chương, việc trộn lẫn định dạng tiêu đề |
| **Phán quyết chất lượng (rubric)** | rubric có phiên bản (ban đầu phái sinh từ bảy chiều của `editor.md`) | LLM Judge (thước cố định để làm A/B) | consistency/character/pacing/continuity/foreshadow/hook/aesthetic |
| **Xuất hành vi đã tẩy thông tin riêng** | Phần xuất của `internal/diag` | `diag.WriteExport(store, rep, rc)` | Bộ xương hành vi, cho người đọc mẫu và lưu trữ |

`diag.Analyze(s *store.Store)` nhận vào một Store là cho ra được một `Report` đầy đủ — **nó vốn đã chạy offline được trên bất kỳ thư mục sản phẩm nào**. `stylestat.Compute` là hàm thuần. Điều này nghĩa là việc hệ thống đánh giá phải làm không phải hiện thực lại "chương có xuống đĩa không, progress có đẩy không, checkpoint có tồn tại không, có sót pending không, luồng có vòng lặp chết không" — những cái đó diag làm hết rồi, mà mỗi luật lại ứng với một cái hố thật đã đạp phải (`PhaseFlowMismatch`, `OrphanedSteer`, `OutlineExhausted`, `repeatedErrors`/`stuckStep` ứng với các sự cố lịch sử idleResume / livelock dàn ý cạn / lời gọi tool bị in ra như văn bản).

> **Việc của hệ thống đánh giá không phải tạo ra phép kiểm, mà là: lái theo lô + chạy các bộ đánh giá đã có trên sản phẩm + ánh xạ Finding/thống kê thành cửa gác + tổng hợp báo cáo.**

---

## 2. Nguyên tắc thiết kế

### 2.1 Bộ đánh giá chính là bộ chẩn đoán, tuyệt đối không dựng lại phép kiểm tất định

Phép kiểm tất định chỉ gọi `diag.Diagnose`, không phân tích lại `progress.json` / `checkpoints.jsonl` / `sessions/*.jsonl` ở tầng đánh giá. Lý do là luật sắt DRY của dự án này: **"trạng thái hợp lệ là gì" chỉ được có một bản định nghĩa.** Nếu phần đánh giá dùng Python phân tích lại checkpoint để phán commit có thiếu không, thì đã có hai bản định nghĩa "commit đã xong"; runtime sửa luật diag mà đánh giá không sửa theo là cửa gác lệch thực ngay lập tức.

→ harness đánh giá dùng **Go**, gọi `diag` và `stylestat` in-process, dùng chung `internal/domain` và `internal/store` với runtime. Đây là khác biệt căn bản nhất giữa thiết kế này và bản trước.

### 2.2 Hồi quy văn phong cấp cả sách là tín hiệu chất lượng số một

LLM Judge từng chương thì thấy chương nào cũng "bình thường", nhưng điểm nghẽn lại chính là việc đóng cứng xuyên chương. Nên **bộ xương tất định của hồi quy chất lượng là `stylestat`, không phải LLM Judge**.

**Tiền đề: `stylestat.Compute` dưới 5 chương thì trả nil luôn** (`stylestat.go` `minChapters=5`, mẫu quá nhỏ thì tần suất vô nghĩa). Vì vậy hồi quy văn phong **chỉ có hiệu lực ở tầng Quality / Longform từ ≥5 chương**, còn Smoke 1 chương thì không lấy được tín hiệu văn phong — điều này quyết định phần chi phí và chiến lược mặc định ở dưới. Các chỉ số gồm:

- Số lần bình quân mỗi chương của các mẫu câu của variant so với baseline (`patterns[].per_chapter`)
- Tỉ lệ kết chương bằng câu ngắn (`ending.short_ratio` tiến gần 1 là bệnh)
- Số câu lặp từng chữ xuyên chương (`repeated_sentences`)
- Trộn lẫn định dạng tiêu đề (`title_formats`)
- Tỉ lệ từ chỉ thời gian ở đầu chương (`opening_time_rate`)

Đây là những chỉ số không tốn LLM, tất định, và đánh đúng vào điểm nghẽn chất lượng. **LLM Judge là phần bổ trợ, delta của stylestat là trục chính.**

### 2.3 LLM Judge khớp với rubric nguyên bản bảy chiều, không dựng bếp riêng

Judge không phát minh chiều chấm mới — các chiều đúng bằng bảy mục của `domain.DimensionScore`, dùng để so baseline/variant.

**Nhưng rubric buộc phải có phiên bản và cố định được**, lưu thành ảnh chụp ở `evals/rubrics/*.json`, không phải đọc `editor.md` trực tiếp lúc chạy. Lý do: khi đối tượng bị đánh giá chính là `editor.md`, nếu trọng tài đổi theo `editor.md` thì chuẩn đánh giá trôi luôn — trọng tài và bị đánh giá cùng nguồn sẽ làm câu "sửa editor là tốt hay tệ" không phán được. Nên rubric ban đầu **phái sinh** từ bảy chiều của editor (bảo đảm tiêu chí nhất quán), sau đó **tiến hóa độc lập, bump phiên bản một cách tường minh**; report ghi lại rubric bản nào đã dùng.

### 2.4 Finding tất định quyết cửa gác, LLM và người chỉ phán quyết chất lượng

Khớp với luật sắt của kiến trúc "thống kê về code, phán quyết về LLM":

- **Chỉ bằng chứng tất định mới chặn được việc hợp vào**: Finding `SevCritical` của `diag`, và việc khẳng định hợp đồng do case khai bị thất bại.
- **LLM Judge và người đọc mẫu cho ra warning và đầu mối để xếp thứ tự**, không tự quyết việc hợp vào.
- Một câu: `Finding.Severity` ánh xạ thẳng sang cấp cửa gác, không đưa vào một hệ phân loại độ nghiêm trọng mới.

### 2.5 Đánh giá chỉ quan sát, không chen vào luồng điều khiển

Đánh giá dùng lại `diag`, nhưng **bỏ `Action` và `Planner` của diag** — đó là đồ của luồng điều khiển lúc chạy. Trong ngữ cảnh đánh giá thì `diag.Report` chỉ lấy `Stats` và `Findings`, Action nhất loạt bỏ qua. Đánh giá không tự sửa prompt, không tự rollback, không chạy tiếp. Đây là phần nối dài của kỷ luật kẻ quan sát (`architecture.md` §2.3) sang ngữ cảnh đánh giá.

### 2.6 Thất bại thì phơi ra tường minh

Không mock thành công, không nuốt lỗi, không dùng mẫu để giả vờ là đã qua. Model, tool, cấu hình, hệ tệp, phân tích, judge — bất kỳ cái nào thất bại thì báo cáo ghi rõ nguyên nhân. **Bản thân thất bại chính là kết quả đánh giá** — một case chạy sập thì cửa gác là FAIL, không phải "bỏ qua".

### 2.7 Mỗi lần chỉ kiểm chứng một biến

Ràng buộc cứng của A/B: cùng yêu cầu, cùng cấu hình, cùng model/provider, cùng văn phong, thư mục đầu ra cách ly. Baseline = prompt chính thức hiện tại, Variant = chỉ thay đúng tệp prompt cần kiểm chứng lần này. Một thí nghiệm thì đừng đồng thời sửa Writer/Architect/Editor/Arbiter.

---

## 3. Toàn cảnh kiến trúc

```text
[Cases]  evals/cases/*.json —— tập khẳng định ở tầng sự thật, không phải dòng dataset tổng quát
   │
[Runner]  internal/eval —— lắp phần lái host in-process (chặn theo giới hạn số chương), bundle.Prompts ghi đè trong bộ nhớ để làm variant
   │       baseline run ┐
   │       variant  run ┘  mỗi bên một thư mục output cách ly
   ▼
[Collectors]  với mỗi thư mục sản phẩm thì thu:
   ├── diag.Diagnose(store)      → Report{Stats, Findings}      (sự thật + runtime)
   ├── stylestat.Compute(input)  → thống kê văn phong cả sách   (bộ xương hồi quy chất lượng)
   ├── khẳng định hợp đồng của case → checkpoint/phase/hợp đồng tool mong đợi (phần diag không bao phủ)
   ├── usage / cost / token      → đọc từ meta/usage.json
   └── tool_calls                → đọc lời gọi tool thật từ meta/sessions/*.jsonl
   ▼
[Graders]
   ├── Cửa gác tất định: Finding.Severity + khẳng định hợp đồng → hard_fail / regression
   ├── delta của stylestat: chênh lệch chỉ số văn phong variant vs baseline
   ├── LLM Judge (tùy chọn): so A/B theo rubric bảy chiều
   └── Human: người đọc sản phẩm của baseline/variant
   ▼
[Report]  report.json (máy đọc) + report.md (người đọc) + phần xuất hành vi đã tẩy thông tin riêng
   └── Gate: PASS / WARN / FAIL
```

Chiều phụ thuộc: `eval → host → agents → tools → store → domain`, dùng lại `diag` / `stylestat` theo chiều ngang. Tầng đánh giá **không phụ thuộc ngược** vào luồng điều khiển lúc chạy, chỉ đọc Store và các bộ đánh giá chỉ-đọc.

> **Phần hiện thực hiện tại bao phủ trục chính tất định**: không có `--variant` thì là `mode=single`; truyền `--variant` thì là `mode=ab`, cùng một case chạy cách ly baseline và variant rồi sinh delta. Collectors đã tiếp `diag.Diagnose`, hợp đồng của case, `stylestat.Compute`, `meta/usage.json`, phép đếm tool call từ session; Graders đã tiếp cửa gác tất định, delta diag của baseline/variant, delta cost/token/tool call, delta stylestat. Runner lắp trực tiếp bằng `host.New` và tự mang phần chặn theo giới hạn số chương, **không dùng lại `headless.Run`** (cái sau không có giới hạn số chương, và lại đặt handler ask_user kiểu tương tác). LLM Judge và Human vẫn là các tầng tùy chọn về sau, không tham gia cửa gác tất định hiện tại.

---

## 4. Vì sao là Go in-process, không phải shell + Python

| Chiều | shell copy mã nguồn + Python phân tích (đường cũ) | Go in-process (thiết kế này) |
|---|---|---|
| Phép kiểm tất định | Python phân tích lại JSON, thành hai bản định nghĩa với luật diag | Gọi thẳng `diag.Diagnose(store)`, một bản định nghĩa |
| Đổi variant | Copy cả cây mã nguồn + `go build` lại hai binary | `bundle.OverridePrompt(...)` ghi đè trong bộ nhớ rồi lắp host, không copy không biên dịch lại |
| Hồi quy văn phong | Phải viết lại logic tách câu tiếng Trung của stylestat trong Python | Gọi thẳng `stylestat.Compute` |
| Rubric của Judge | Các chiều rải rác trong Python | Dùng lại `domain.DimensionScore`, cùng nguồn với bản chạy thật |
| Rủi ro trôi lệch | Cao: runtime sửa mô hình sự thật mà đánh giá không theo | Thấp: ngay ở kỳ biên dịch là phơi ra việc trường bị đổi |

Cái `prompt_ab.sh` cũ phải copy mã nguồn rồi biên dịch lại là vì prompt được nhúng trong binary (`go:embed`). Nhưng `assets.Bundle.Prompts` là một struct thường, **runner sửa một trường trong bộ nhớ là làm được variant**, hoàn toàn không cần copy mã nguồn. Đây là phần đơn giản hóa lớn nhất có được kèm theo khi viết harness bằng Go.

> **Ràng buộc khi hiện thực**: `assets.Load` qua `loadPrompts` sẽ nối thống nhất hậu tố `WithSimulationGuidance` vào prompt của Worker (architect/writer/editor). Nếu variant chỉ nhét văn bản trần vào `bundle.Prompts.Writer` thì mất phần hậu tố chân dung mô phỏng mà baseline có, và A/B không tương đương.
>
> Cách đúng là ghi đè qua `assets.OverridePrompt`, bên trong đi qua đúng cùng phần bọc như `Load`; eval không copy lại logic bọc đó.

> Bản tài liệu trước còn giữ `prompt_ab.sh` / `prompt_ab_report.py` và "dần dần trích xuất năng lực". Thiết kế này bỏ con đường đó: vấn đề mà chúng giải (chạy cách ly + tổng hợp chỉ số) là một tập con trong harness Go in-process, cố dùng lại thì lại phải gánh phần keo giao diện của ba ngôn ngữ shell/Python/Go. **Harness Go là con đường chính duy nhất**; harness Go hiện tại đã bao phủ việc chạy cách ly baseline/variant, tổng hợp repeat và delta tất định. Các script cũ (`scripts/prompt_ab.sh`, `scripts/prompt_ab_report.py`) cùng sổ tay vận hành của chúng là `docs/prompt-ab.md` đã bị xóa cùng lúc khi thiết kế này đáp đất, không giữ lại nữa.

---

## 5. Case Manifest

Case là đơn vị nhỏ nhất của đầu vào đánh giá, và cũng là một nhóm **khẳng định ở tầng sự thật**. Mô tả bằng JSON để luật không rải rác trong các tham số dòng lệnh.

```json
{
  "id": "writer_first_chapter_xianxia",
  "category": "smoke",
  "role": "writer",
  "description": "Kiểm chứng chất lượng chính văn chương 1 của Writer và tính ổn định của chuỗi tool",
  "prompt": "Viết một truyện tu tiên dài, nhân vật chính khởi đầu làm tạp dịch ở thành biên, nhờ trí nhớ khác thường mà phá được án cũ của tông môn rồi bị cuốn vào cuộc tranh trường sinh.",
  "style": "fantasy",
  "max_chapters": 1,
  "target_prompts": ["writer.md"],
  "rubric": "writer_chapter",

  "expect": {
    "phase": "writing",
    "min_completed_chapters": 1,
    "required_checkpoints": ["chapter:1:plan", "chapter:1:draft", "chapter:1:commit"],
    "no_pending": ["pending_commit", "pending_steer"]
  },

  "gate": {
    "max_severity": "warning",
    "max_cost_delta_ratio": 0.3,
    "max_tool_call_delta_ratio": 0.3,
    "stylestat_regression": "warn"
  }
}
```

**Ngữ nghĩa các trường**:

- `expect`: khẳng định hợp đồng ở cấp case, **chỉ khai những gì luật tổng quát của diag không bao phủ và gắn chặt với case này** (ví dụ "case smoke này buộc phải cho ra đúng chapter:1:commit"). Những cái tổng quát như "không sót pending / phase-flow nhất quán / không có lỗ hổng chương" thì giao cho diag, không khai lặp trong case.
- `category`: tầng đánh giá ∈ `smoke` / `workflow` / `quality` / `longform` / `recovery` / `steering`. Quyết chạy bộ cửa gác nào và mặc định có bật stylestat/Judge không.
- `role`: vai bị đánh giá ∈ `writer` / `architect` / `editor`. Trực giao với `category` — tầng quyết "kiểm sâu tới đâu", vai quyết "kiểm Worker nào". Tầng Workflow chọn tập khẳng định theo `role`.
- `max_severity`: mức nghiêm trọng cao nhất mà Finding của diag được phép. Vượt là hard fail.
- `gate.max_cost_delta_ratio` / `gate.max_tool_call_delta_ratio`: ngưỡng mức tăng chi phí và lời gọi tool của variant so với baseline; bỏ trống thì mặc định `0.3`, ghi rõ `0` nghĩa là không cho phép tăng, số âm nghĩa là tắt delta gate đó.
- `rubric`: bật bảng chấm LLM Judge phiên bản nào. Bỏ trống thì không chạy Judge.
- `gate.stylestat_regression`: `block` / `warn` / `off`, điều khiển việc hồi quy văn phong có chặn hay không (chỉ có hiệu lực với case ≥5 chương).

---

## 6. Phân tầng đánh giá

Mỗi tầng nói rõ **dùng bộ đánh giá đã có nào**, để tránh chuyện "tầng đánh giá lại tự viết lại một lượt phép phán".

### 6.1 Smoke (mỗi lần sửa prompt là buộc phải chạy, tập tối thiểu)

Chỉ phán xem hệ thống còn chạy ổn định được không, không phán văn. 1 chương / giai đoạn quy hoạch là đã phơi ra được.

| case | Mục tiêu | Bộ đánh giá chính |
|---|---|---|
| `writer_first_chapter` | Writer hoàn tất chương 1 và commit | `expect.required_checkpoints` + diag |
| `architect_short` | Quy hoạch truyện ngắn lưu đủ premise/outline/characters/world_rules | Phép kiểm foundation cùng nguồn với diag `MissingSummaries` + `expect` |
| `architect_long` | Quy hoạch truyện dài lưu layered_outline/compass, mở rộng cung đầu | diag `OutlineExhausted`/`CompassDrift` + `expect` |
| `editor_review` | Tới điểm duyệt thì Editor lưu review (bảy chiều đủ mặt) | Khẳng định trên các trường của `ReviewEntry` |

Chi phí: 1 chương × baseline+variant, cỡ giây tới cỡ phút, không bật Judge, không chạy stylestat (số chương chưa đủ 5, `Compute` trả nil). CI mặc định chỉ chạy tầng này.

### 6.2 Workflow (kiểm chứng hành vi của Agent khớp hợp đồng kiến trúc)

**Kỷ luật then chốt: khẳng định hợp đồng, không khẳng định chuỗi tool chính xác.** Kiến trúc đặt cược vào việc LLM tự chủ quyết luồng (`architecture.md` §2.1), viết cứng thứ tự tool sẽ đưa lại vào tầng đánh giá đúng cái "viết code cứng cho hành vi LLM" đã bị §10.13 từ chối. Nên ở đây chỉ khẳng định **những sự thật tất yếu**:

- Writer: checkpoint `chapter:N:commit` tồn tại; sau commit thì tác tử con kết thúc lượt này (không có phần chính văn kéo dài quá mức phía sau); checkpoint draft đứng trước commit. **Không** khẳng định "buộc phải đúng thứ tự chính xác novel_context→read_chapter→plan→draft→check→commit".
- Architect: trong kỳ viết thì outline chỉ thêm chứ không ghi phủ toàn bộ (checkpoint của `expand_arc`/`append_volume`, không có lần ghi toàn phần `layered_outline` thứ hai); sau khi mở rộng thì outline phẳng và số chương của layered khớp nhau.
- Editor: `ReviewEntry.Verdict` hợp pháp (accept/polish/rewrite); rewrite/polish buộc phải cho ra affected chapters; cuối cung có checkpoint `arc_summary`, cuối tập có `volume_summary`.
- Việc phái việc của Engine: chỉ thị Route khớp với Worker thật sự đã chạy (đọc từ session trace, diag `repeatedErrors` đỡ lưng phần vòng lặp); phán quyết ngữ nghĩa thì soát `meta/decisions.jsonl`.

Phần lớn những cái này được các luật diag + khẳng định trên checkpoint bao phủ trực tiếp, một ít (phần chính văn kéo dài sau commit) thì cần thêm một phép kiểm trace nhẹ trong collector.

### 6.3 Quality (luồng qua rồi mới chạy, để đánh giá chất lượng nội dung)

Hai chân:

1. **delta của stylestat (tất định, trục chính)**: chênh lệch chỉ số văn phong của variant vs baseline. Đây là bằng chứng cứng của hồi quy chất lượng. **Yêu cầu case chạy đủ ≥5 chương** (nếu không `Compute` trả nil, mục này gắn cờ `insufficient_sample`), nên case Quality thuần 1 chương thì không lấy được hồi quy văn phong, cần đặt `max_chapters` lên trên 5.
2. **LLM Judge (bổ trợ)**: A/B theo rubric bảy chiều (xem §8).

Chỉ những case đã qua §6.1/§6.2 mới vào Quality — luồng còn chưa đúng thì nói chất lượng là vô nghĩa.

### 6.4 Longform & Recovery (thay đổi lớn / nightly)

Không cần chạy mỗi lần. Bao phủ tính ổn định của truyện dài và năng lực khôi phục, đây đúng là sân chính của các luật runtime và luật context của diag:

- Viết liên tục 3 chương / 5 chương đầu → diag `GhostCharacter`/`TimelineGaps`/`RelationshipStagnation`/`ChapterGaps` + phần lặp xuyên chương của stylestat.
- Duyệt cuối cung + mở rộng cung sau → `OutlineExhausted`/`StaleForeshadow`/`CompassDrift`.
- Người dùng can thiệp giữa đường (case steering) → user_rules có xuống `meta/user_rules.json` không, các chương sau có tuân theo không.
- Khôi phục sau sập: chạy tới draft chương N rồi kill → Resume → diag xác nhận `checkpoints.jsonl` không có step trùng, không viết lại draft đã xuống đĩa, `pending_commit` cuối cùng về không.
- Lời gọi tool phình ra / chi phí bất thường → diag `repeatedErrors`/`stuckStep`/`streamIdleStorm` + delta usage.

---

## 7. Cửa gác tất định

Cấp cửa gác được phái sinh trực tiếp từ **Severity của Finding của diag** + **khẳng định hợp đồng của case**, không lập thêm hệ phân loại khác.

### 7.1 Hard Fail (chặn việc hợp vào)

- Process panic / headless trả về error.
- diag cho ra Finding `SevCritical` (`InvalidPendingRewrites` / `PhaseFlowMismatch` v.v.).
- Khẳng định hợp đồng `expect` của case thất bại: thiếu commit checkpoint, phase chưa đạt mong đợi, pending đã khai chưa về không.
- Số lỗi / số Finding critical của variant nhiều hơn baseline (hồi quy sang tệ hơn).

### 7.2 Regression (mặc định là warning, có chặn hay không thì do gate của case quyết)

- diag thêm Finding `SevWarning` (variant nhiều hơn baseline).
- tool calls / cost / input token / output token tăng vượt ngưỡng của case (mặc định 30%).
- **Hồi quy stylestat**: số lần bình quân mỗi chương của mẫu câu tăng lên, tỉ lệ câu ngắn cuối chương tăng lên, câu lặp xuyên chương nhiều lên, xuất hiện việc trộn lẫn định dạng tiêu đề — quyết warn/block theo `gate.stylestat_regression`.
- Số từ của chương thấp hơn 60% hoặc cao hơn 180% so với baseline (ngưỡng cùng nguồn với diag `WordCountAnomaly`).

### 7.3 Quality Gate (người đỡ lưng)

- LLM Judge chỉ làm phần bổ trợ và xếp thứ tự.
- Judge phán variant rõ ràng tệ hơn → buộc phải có người đọc mẫu xác nhận.
- Người đọc mẫu xác định là thoái hóa → chặn.
- Judge phán variant tốt hơn nhưng phần tất định có hard fail → vẫn chặn.

### 7.4 Điều kiện đề xuất để hợp vào

Sửa prompt hằng ngày: Smoke qua hết + Workflow của vai mục tiêu qua hết (Smoke 1 chương thì không chứa hồi quy văn phong; nếu đã chạy case Quality ≥5 chương thì stylestat không có hồi quy rõ rệt).
Thay đổi lớn: thêm 2-3 case Quality + 1-2 case Longform + người đọc mẫu.

---

## 8. LLM Judge

Judge là phần bổ trợ chất lượng, bản chất là **dùng rubric có phiên bản (ban đầu phái sinh từ bảy chiều của editor.md) để so baseline/variant offline**. rubric là một cái thước cố định, tiến hóa độc lập với `editor.md` bản chạy thật (lý do xem §2.3), report ghi lại phiên bản rubric đã dùng.

### 8.1 Đầu vào (kiểm soát kích thước, tuyệt đối không nhét cả cuốn sách)

- Yêu cầu gốc của người dùng + dàn ý/hợp đồng của chương hiện tại.
- Chính văn của **cùng một chương** ở baseline và variant.
- Tóm tắt 1-2 chương gần nhất + tóm tắt trạng thái nhân vật (đọc từ store).
- Các mảnh stylestat liên quan của chương đó (để Judge thấy được những sự thật kiểu "câu này lặp 7 lần trong cả sách").

### 8.2 Đầu ra (có cấu trúc, khớp bảy chiều)

```json
{
  "scores": {
    "consistency": 8, "character": 7, "pacing": 8, "continuity": 8,
    "foreshadow": 7, "hook": 7, "aesthetic": 6
  },
  "winner": "variant",
  "confidence": "medium",
  "reasons": ["variant đẩy hành động tập trung hơn", "baseline kể lại tình tiết trước nặng hơn"],
  "risks": ["variant lót động cơ cho nhân vật phụ hơi ít"]
}
```

- Các chiều đúng bằng bảy mục của `domain.DimensionScore`, mỗi mục 0-10.
- `winner` ∈ baseline/variant/tie; `confidence` ∈ low/medium/high.
- `reasons`/`risks` mỗi dòng ≤ 80 từ, dẫn nguyên văn thì phải ngắn.

### 8.3 Biên

Judge **không được**: quyết luồng có qua hay không, sửa sản phẩm, tự sửa prompt, làm căn cứ duy nhất để hợp vào, sinh phần trích dẫn nguyên văn dài.
Judge **được**: xếp thứ tự cho người duyệt, chỉ ra chỗ thoái hóa rõ rệt, tổng kết khác biệt A/B, phơi ra tác dụng phụ của việc sửa prompt.

---

## 9. Báo cáo

Mỗi thí nghiệm sinh `report.json` (máy đọc, sinh lại markdown được) + `report.md` (người đọc) + `artifacts/{case_id}/{baseline,variant}/` (sản phẩm thô). Khi `--repeat N` thì đường dẫn là `artifacts/{case_id}/rN/{baseline,variant}/`.

### 9.1 delta của chỉ số

Báo cáo hiện chênh lệch của variant so với baseline, giá trị tuyệt đối và tỉ lệ đặt cạnh nhau:

```text
completed: baseline=5 variant=5   ← ≥5 chương thì chỉ số văn phong mới có nghĩa
tool_calls: baseline=12 variant=16  +4 (+33.3%)
cost_usd: baseline=0.42 variant=0.55  +0.13 (+31.0%)
output_tokens: baseline=8200 variant=9100  +900 (+11.0%)
critical_findings: baseline=0 variant=0
warning_findings: baseline=1 variant=2  +1
stylestat.pattern_top_per_chapter: baseline=3.1 variant=5.4  +2.3   ← hồi quy văn phong
stylestat.ending_short_ratio: baseline=0.42 variant=0.71  +0.29     ← cuối chương đồng dạng nặng lên
```

### 9.2 Tổng hợp Repeat

Khi `--repeat N` thì không chỉ xem lần cuối; phần hiện thực hiện tại trình bày tỉ lệ qua, số lần hard fail, số lần warning, min/avg/max của cost/tool_calls. Sau khi tiếp Judge thì thêm phân bố winner, tránh trộn tiếng ồn của trọng tài model vào báo cáo tất định mặc định.

```text
writer_first_chapter_xianxia repeat=3
- pass_rate: 3/3
- cost_usd: avg=0.41 min=0.38 max=0.44
- tool_calls: avg=13 min=12 max=15
- stylestat.pattern_top_per_chapter: avg delta=+0.4 (không có hồi quy rõ rệt)
```

### 9.3 Báo cáo khả thi tối thiểu

```text
Gate: FAIL

Hard Fail:
- writer_first_chapter_xianxia: missing checkpoint chapter:1:commit

Warnings:
- writer_dialogue_density: tool_calls +35%
- writer_anti_ai_tone: ending_short_ratio +0.28 (hồi quy văn phong)

Quality:
- writer_anti_ai_tone: judge prefers variant, confidence=medium

Artifacts:
- workspace/evals/20260629-120000/report.json
```

---

## 10. Cấu trúc thư mục và lệnh

```text
internal/eval/
  case.go        Cấu trúc Case manifest + việc nạp
  eval.go        Điều phối CLI: single / A/B / repeat
  runner.go      Lắp phần lái host (chặn theo giới hạn số chương + drain tới Done), bundle.OverridePrompt ghi đè trong bộ nhớ
  collect.go     Chạy diag.Diagnose + stylestat.Compute + usage/tool_calls + khẳng định hợp đồng trên thư mục sản phẩm
  grade.go       Ánh xạ Finding→cửa gác + delta baseline/variant + quyết định của stylestat gate
  report.go      report.json + report.md

cmd/ainovel-cli  Cửa vào lệnh con eval

evals/
  cases/         smoke/ workflow/ quality/ longform/ recovery/ steering/
  rubrics/       writer_chapter.json / architect_outline.json / editor_review.json
  variants/      writer-anti-ai-tone/writer.md v.v. (mỗi thư mục chỉ đặt prompt cần thay)
  reports/       Lưu trữ các báo cáo lịch sử
```

Lệnh (`cmd/ainovel-eval` là công cụ riêng cho người phát triển, không nằm trong app; `--config` bắt buộc, đường dẫn tuyệt đối):

```bash
# Nhiều case theo lô (CI mặc định chỉ chạy smoke, không bật judge)
go run ./cmd/ainovel-eval --config "$PWD/.ainovel/config.json" \
  --cases evals/cases/smoke \
  --variant evals/variants/writer-anti-ai-tone \
  --out workspace/evals/writer-anti-ai-tone --ci
```

**Các tham số đã hiện thực ở kỳ này**: `--cases` (thư mục hoặc một manifest đơn), `--variant` (thư mục prompt biến thể; truyền vào là tự chạy A/B baseline+variant), `--repeat N` (mỗi case chạy lặp N lần), `--config`, `--out`, `--max-chapters N` (ghi đè mặc định của case), `--timeout` (giới hạn đồng hồ tường cho một case), `--ci` (dẹp phần xuất từng sự kiện; mã thoát khác 0 tức là hard fail, không truyền cờ này thì cũng vậy).

**Đang trong quy hoạch (chưa hiện thực, đừng dùng ở dòng lệnh, nếu không sẽ báo flag chưa định nghĩa)**: `--judge`/`--no-judge` (LLM Judge của Phase 3). Với các lần sửa prompt lớn thì hiện có thể dùng A/B tất định + repeat trước:

```bash
# Sửa prompt lớn: A/B + repeat để giảm tính ngẫu nhiên
go run ./cmd/ainovel-eval --config "$PWD/.ainovel/config.json" \
  --cases evals/cases/quality \
  --variant evals/variants/writer-anti-ai-tone \
  --repeat 3 --ci
```

---

## 11. Những việc dứt khoát không làm

Vi phạm là đại diện cho việc đánh giá lệch khỏi định vị.

1. **Không copy logic chẩn đoán tổng quát của diag vào tầng đánh giá** — các phán đoán tổng quát (sót pending, phase/flow nhất quán, lỗ hổng chương, vòng lặp chết) nhất loạt đi qua `diag`, phán đoán sự thật chỉ có một bản định nghĩa. Khẳng định hợp đồng ở cấp case (`expect.required_checkpoints` v.v.) thì được đọc trực tiếp API `store`/checkpoint, nhưng chỉ làm **khẳng định mỏng** — kiểm chứng những mong đợi cụ thể gắn chặt với case này, tuyệt đối không viết lại một lượt các luật tổng quát diag đã có.
2. **Không hiện thực lại các luật tất định** — diag đã có một nhóm luật hiện vật + luật runtime. Thiếu luật thì đi thêm vào diag, tầng đánh giá chỉ tiêu thụ.
3. **Không viết lại logic văn phong tiếng Trung của stylestat trong Python** — gọi thẳng package Go.
4. **Không cho LLM Judge quyết luồng có qua hay không** — cửa gác chỉ nhận bằng chứng tất định.
5. **Không cho việc đánh giá chen vào luồng điều khiển** — bỏ Action/Planner của diag, không tự sửa prompt, không rollback, không chạy tiếp, không phát hành.
6. **Không khẳng định chuỗi lời gọi tool chính xác** — chỉ khẳng định hợp đồng (commit đã xảy ra, checkpoint tồn tại), để bảo vệ cược "LLM lái luồng".
7. **Không đưa vào cơ sở dữ liệu / Web UI / nền tảng đánh giá trực tuyến** — giai đoạn hiện tại cần một bộ hồi quy cục bộ lặp được, đáp đất được, chi phí thấp.
8. **Không copy mã nguồn rồi biên dịch lại để làm variant** — ghi đè `bundle.Prompts` trong bộ nhớ.
9. **Không mock thành công, không nuốt lỗi** — bất kỳ khâu nào thất bại thì ghi rõ, case chạy sập tức là FAIL.
10. **case không đổi theo prompt một cách thường xuyên** — case là tập kiểm thử ổn định; sửa case để cho variant qua là gian lận.

---

## 12. Đáp đất theo giai đoạn

### Phase 1 · Runner + cửa gác tất định (MVP, chứng minh giả thuyết trước)

- `internal/eval`: cấu trúc Case + runner (headless in-process + ghi đè bundle) + collect (gọi `diag.Diagnose`) + grade (Finding→cửa gác + hợp đồng `expect`).
- `evals/cases/smoke/` đặt 3-4 case.
- Báo cáo trước cho ra `report.json` + markdown tối thiểu.

**Nghiệm thu**: một lệnh chạy hết smoke; các trường hợp Writer bỏ qua commit, sót pending, thiếu checkpoint, phase không khớp **đều bị cửa gác chặn lại** (những cái này diag vốn tra được, cái đang kiểm chứng là harness đã tiếp đúng chưa).

### Phase 2 · A/B + repeat + hồi quy stylestat (đã hiện thực)

- `--variant` tự chạy baseline và variant, xuất artifacts cách ly.
- `--repeat N` tổng hợp pass rate, hard fail runs, warning runs, min/avg/max của cost/tool_calls.
- collect thêm `stylestat.Compute`, grade thêm delta văn phong.
- Báo cáo trình bày phần đối chiếu baseline-variant của mẫu câu bình quân mỗi chương / tỉ lệ câu ngắn cuối chương / câu lặp xuyên chương / trộn lẫn định dạng tiêu đề.

**Nghiệm thu**: dùng một case ≥5 chương + một variant "làm nặng tic mẫu câu" thì phải bị hồi quy văn phong gắn cờ warning; case không đủ số chương thì hiện rõ `insufficient_sample` chứ không phán sai là qua.

### Phase 3 · LLM Judge

- `evals/rubrics/` + `judge.go`, A/B theo rubric bảy chiều.
- Judge thất bại (JSON bất hợp pháp) → báo cáo ghi là thất bại, không ảnh hưởng kết quả tất định.

**Nghiệm thu**: đầu ra của Judge vào json+md, và không làm ô nhiễm cửa gác tất định.

### Phase 4 · Longform & Recovery

- Các case viết liên tục 3-5 chương / duyệt cuối cung / người dùng can thiệp / replay pending_commit / áp lực nén ngữ cảnh.
- Dùng lại các luật context + runtime của diag.

**Nghiệm thu**: phát hiện được trục thời gian lặp, sót pending, thiếu tóm tắt cuối cung, vòng lặp tool.

---

## 13. Quy phạm bảo trì Case

- **Kiềm chế số lượng**: Smoke 3-5, Workflow mỗi vai 3-5, Quality 2-4, Longform/Recovery mỗi loại 2-3. Nhiều quá thì không ai muốn chạy.
- **Case tốt**: đầu vào ngắn và rõ, bao phủ rủi ro thật, phơi vấn đề trong ít chương, không phụ thuộc vào việc model sinh ra một câu cố định, không viết sở thích văn phong quá chi li.
- **Case tệ**: đầu vào quá dài, nhiều mục tiêu cùng lúc, phải chạy mấy chục chương mới phán được, chỉ dựa vào cảm nhận chủ quan.
- **Cách đặt tên Variant**: `writer-anti-ai-tone` / `architect-rolling-outline` / `editor-strict-review`, mỗi thư mục chỉ đặt prompt cần thay.

---

## 14. Rủi ro và biên

- **Tính ngẫu nhiên của model**: cùng prompt chạy nhiều lần cũng khác. Với thay đổi quan trọng thì `--repeat 3` để xem xu hướng.
- **Chi phí**: Judge và longform đốt tiền. Cục bộ mặc định chỉ chạy **smoke** (1 chương × baseline+variant, cửa gác diag tất định, không bật Judge, không chạy stylestat); **stylestat chỉ bật ở Quality/Longform từ ≥5 chương** (smoke không đủ số chương, `Compute` trả nil, báo cáo gắn cờ `insufficient_sample`); suite đầy đủ để dành cho thay đổi lớn.
- **Độ lệch của Judge**: Judge cũng là model, thiên về văn bản gọn gàng mang tính giải thích, không hẳn tương đương với tiểu thuyết hay — nên chỉ làm bổ trợ, stylestat là trục chính tất định.
- **Chỉ số hóa quá mức**: số từ/số lần gọi tool/chi phí/thống kê văn phong đều là tín hiệu, không phải mục tiêu. Số của stylestat có thành bệnh hay không thì để người phán theo đề tài, **không viết cứng ngưỡng** (nhất quán với editor.md).
- **Không làm tự động rollback trên bản chạy thật**: đây là công cụ hồi quy offline, không phụ trách việc tự sửa prompt / phát hành trên bản chạy thật.

---

## 15. Tổng kết

Giá trị của bộ hệ thống đánh giá này không phải tự động phán chất lượng văn học, mà là biến việc sửa prompt từ "dựa cảm giác" thành "có hồi quy, có bằng chứng, có người đọc mẫu".

Khác biệt căn bản của nó so với bản thiết kế trước chỉ gói trong một câu: **bộ đánh giá đã ở trong codebase rồi.** `diag` là bộ chẩn đoán sự thật tất định, `stylestat` là bộ hồi quy văn phong cả sách, bảy chiều của `ReviewEntry` là rubric nguyên bản. Việc hệ thống đánh giá phải làm là một lớp harness Go mỏng tang — lái theo lô, thu thập, ánh xạ Finding và thống kê thành cửa gác, tổng hợp báo cáo — chứ không phải dùng một ngôn ngữ khác để viết lại một lượt những phán đoán sự thật ấy.

Một bản định nghĩa sự thật, không bao giờ trôi lệch. Đây đúng là kỷ luật xuyên suốt của dự án này từ kiến trúc tới đánh giá: **harness tối thiểu, dùng lại tối đa, tất định về code, phán quyết về LLM và người.**

---

## 16. Tham khảo

Cấu trúc thông dụng của LLM eval trong ngành (dataset / experiment / scorer / trace / regression gate) là nguồn ý tưởng của thiết kế này, nhưng **cố ý không bê nguyên** — "scorer" của dự án này là `diag`/`stylestat` đã có, "trace" là tầng sự thật checkpoint/session đã có, "dataset" là các case dán vào khẳng định ở tầng sự thật.

- OpenAI Evals · https://developers.openai.com/api/docs/guides/evals (chú: nền tảng Evals được vận hành của họ đã công bố lịch trình nghỉ, chỉ dẫn phần **ý tưởng** về kiểm thử có cấu trúc/chấm tự động/hiệu chuẩn bằng người, không coi là phụ thuộc tương lai)
- Braintrust · https://www.braintrust.dev/foundations/what-is-an-eval
- LangSmith · https://docs.langchain.com/langsmith/evaluation-concepts
