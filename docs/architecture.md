# Kiến trúc runtime của engine AINovel Studio

> Tầng sự thật thì tất định, tầng ngữ nghĩa thì tự chủ: một Engine tất định chạy tuần tự, ba Worker tự chủ, vài hàm Arbiter gọi khi cần, một tầng sự thật nằm trên hệ tệp.
>
> 2026-07-12 hoàn tất việc thay mặt điều khiển: vòng lặp dài Coordinator LLM đã nghỉ, Engine (vòng lặp tất định) + Arbiter (hàm phán quyết ngữ nghĩa) tiếp quản. Quyết định thiết kế và biên bản duyệt xem `docs/engine-arbiter.md`, RFC xem `docs/engine-rfc.md`.
>
> 2026-10-08: sản phẩm chỉ còn app desktop. Cửa vào TUI và headless đã gỡ; engine chỉ chạy qua `serve`, tiến trình sidecar mà app spawn (xem `docs/superpowers/specs/2026-10-08-desktop-app-design.md`).

---

## 1. Mục tiêu (theo thứ tự ưu tiên)

1. **Tính ổn định**: một câu đầu vào, viết xong trọn cuốn tiểu thuyết một cách ổn định (200~500 chương). Giữa đường không tự ngắt vì lý do kiến trúc.
2. **Chất lượng lặp được**: prompt / tài liệu tham chiếu / chiều duyệt / chiến lược ngữ cảnh điều chỉnh độc lập được, không liên can tới kiến trúc.
3. **Khôi phục được**: sau khi sập, mất mạng, tạm dừng thì tiếp tục được từ checkpoint gần nhất.
4. **Quan sát được**: tiến độ, sản phẩm, thời lượng của từng step của từng chương đều tra được.

"Ổn định" là điều kiện tiên quyết, "chất lượng" là tầng trên. Mỗi quyết định kiến trúc đều ưu tiên phục vụ tính ổn định.

---

## 2. Nguyên tắc cốt lõi

### 2.1 Phép tam phân: quyết định về đúng chỗ theo bản chất của nó

- **Chuyển trạng thái liệt kê được → code**. "Viết xong một chương thì phái ai" là đọc sự thật rồi tra bảng: `flow.Route` là hàm thuần + kiểm thử đặc tả vét cạn hàng vạn tổ hợp, tỉ lệ lỗi tiến về 0, không tốn lời gọi LLM.
- **Phán đoán ngữ nghĩa có biên rõ ràng → hàm LLM (Arbiter)**. Chọn kiến trúc sư, phân loại can thiệp của người dùng, đường ra khi thất bại/bế tắc: sự thật vào, quyết định có cấu trúc ra, kiểm tra máy móc đỡ lưng, mỗi phán quyết xuống đĩa và phát lại được.
- **Sáng tác mở → vòng lặp LLM (Worker)**. Trong phạm vi một chương, một lần duyệt, một lần quy hoạch thì architect/writer/editor hoàn toàn tự chủ.

Sự đối xứng giữa hai mặt là một kỷ luật xuyên suốt — mọi điểm quyết định mới về sau đều theo hình dạng này, không phát minh mẫu mới:

```
Mặt tất định:  flow.LoadState   → flow.Route      → Instruction   (kiểm thử đặc tả vét cạn)
Mặt ngữ nghĩa: arbiter.Collect* → arbiter.Decide* → XxxDecision   (decisions.jsonl + hồi quy eval)
               └── thu sự thật (IO) ──┘└── nhân (phát lại offline) ──┘└── Engine thi hành ──┘
```

### 2.2 Tool là giao diện duy nhất của tầng sự thật

Mọi tương tác với hệ tệp, Progress, Checkpoint đều do tool thực hiện. Một tệp đơn lẻ thì thay thế nguyên tử bằng `temp + fsync + rename`; việc ghi tuần tự xuyên nhiều tệp thì không giả làm giao dịch cơ sở dữ liệu: việc nộp chương dùng Saga `PendingCommit` bền vững, việc ghi kết cấu dùng phát lại bất biến tất định và phơi lỗi tường minh. Mỗi bước đều buộc phải kiểm lỗi; chỉ những luồng đã lưu bền ý định khôi phục mới được hứa khôi phục theo đúng payload gốc qua các lần khởi động lại.

### 2.3 Tầng quan sát chỉ quan sát

UI, chẩn đoán, nhật ký sự kiện đều là những bên tiêu thụ thụ động, chiếu ra từ dòng sự kiện / hiện vật chỉ-đọc. Đọc sự thật, không sinh ra sự thật, không ảnh hưởng luồng điều khiển.

**`internal/diag` là hệ con quan sát duy nhất của engine** — một hạ tầng hỗ trợ hạng nhất, nhưng không phải phần cốt lõi của sản phẩm. Nó đọc xuyên gần như mọi hiện vật + session + log + checkpoint, gánh hai việc: ① **chẩn đoán chất lượng sáng tác** (luật → Finding, báo cáo lên màn hình bằng `/diag`); ② **tra lỗi runtime + xuất bản đã tẩy thông tin riêng** (bộ xương hành vi lột bỏ chính văn + tổng hợp các vòng lặp → `meta/diag-export.md` ghi đè).

**Kỷ luật của kẻ quan sát (không được nới)**: diag được chẩn đoán, được đề xuất, nhưng **tuyệt đối không tự tay làm** — không tự sửa, không chạy tiếp, không đổi luồng (bài học lịch sử xem §10 điều 5).

### 2.4 Tầng sự thật phẳng

Chỉ có ba loại sự thật:

- **Progress** — chỉ mục tiến độ (đã viết tới chương mấy, danh sách chờ viết lại)
- **Checkpoint** — ghi nhận tiến triển cấp step (plan / draft / commit / review / arc_summary)
- **Artifact** — chính văn chương, dàn ý, nhân vật, tóm tắt và các sản phẩm khác

Không đưa vào các trừu tượng kiểu WorkflowInstance / TaskInstance / Command. Các sự thật phụ thuộc (bể phản hồi dàn ý, ghi nhận vi phạm máy móc, kiểm toán phán quyết) cũng là jsonl phẳng, mỗi thứ có đúng một bên sản xuất và một bên tiêu thụ.

### 2.5 Bốn luật sắt

**Luật sắt một: tool chỉ trả sự thật, không trả chỉ thị điều phối xuyên tầng**. `commit_chapter` trả về các trường có cấu trúc như `arc_end` / `needs_expansion`; không kèm chuỗi chỉ thị kiểu `[hệ thống]`. Trường `next_step` bên trong tác tử con là chỉ dẫn nội tuyến của một lời trần thuật sự thật ("tôi vừa lưu plan, bước sau là draft"), không tính là vi phạm — xem §6.3.

**Luật sắt hai: định tuyến luồng do Flow Router gánh, việc thi hành do Engine gánh**. `Route(state) → *Instruction` trong `internal/flow/router.go` là hàm thuần (đóng đinh bằng kiểm thử đặc tả vét cạn hàng vạn tổ hợp); mỗi lượt Engine đọc sự thật từ store, Route suy ra chỉ thị, rồi **chạy Worker trực tiếp bằng lập trình** (`subagent.Runner.Run`, tham số/kết quả/chuỗi lỗi đều có kiểu), không có tầng chuyển tiếp tool qua LLM. Trả về nil nghĩa là tình huống ngữ nghĩa (thu xếp kết sách/đợi can thiệp) hoặc dừng tự nhiên. **Bế tắc có biên tường minh** (RFC §5): sau lượt trước mà Route vẫn sinh ra cùng một `Agent+Task`, tức hậu điều kiện của định tuyến chưa thỏa; 3 lần thì hỏi Arbiter, 5 lần thì ngắt cứng và tạm dừng. Checkpoint trung gian bên trong Worker không reset bộ đếm, Engine tất định không cho phép quay không vô hạn.

**Luật sắt ba: phán quyết ngữ nghĩa đi qua Arbiter, mỗi phán quyết xuống đĩa**. Việc chọn kiến trúc sư lúc khởi động, phân loại can thiệp của người dùng, đường ra khi thất bại/bế tắc đều do các hàm Decide theo từng tình huống trong `internal/arbiter` phán quyết: sự thật vào, quyết định có cấu trúc ra, kiểm tra máy móc đỡ lưng, kiểm toán trong decisions.jsonl (phát lại offline để hồi quy được). Ba Worker giữ lại `CheckpointDeltaGuard` riêng của mình (lan can sự thật: sản phẩm chưa xuống đĩa thì không được nghỉ).

**Luật sắt bốn: đóng cứng biên, không đóng cứng những phán đoán ngữ nghĩa không liệt kê được**. Code chỉ cố định những bất biến chứng minh được (quyền, giai đoạn, thứ tự, tính bất biến, tính toàn vẹn kết cấu) rồi cấp cho model đủ sự thật và đủ không gian hành động; những câu hỏi mở như lựa chọn sáng tác, phán đoán chất lượng, kế hoạch thích ứng với chính văn ra sao thì buộc phải để cho Worker / Arbiter. Cấm dùng từ khóa, ngưỡng điểm, liệt kê độ lệch hay bảng luật để thay cho sự thông hiểu của model, cũng cấm thu hẹp không gian quyết định hợp pháp của nó chỉ vì lo model sai. Trước khi thêm một luật trong code thì phải chứng minh được không gian quyết định là đóng và kết quả kiểm chứng máy móc được; nếu không thì hãy cải thiện ngữ cảnh và năng lực biểu đạt của tool, để lợi ích từ việc nâng model đến được mà không phải sửa lớp vỏ.

---

## 3. Toàn cảnh kiến trúc

```
[Entry: serve — sidecar của app desktop, HTTP API trên loopback]
        │ prompt / steer
[Vỏ Host]
   ├── observer            Trung kế tiến độ Worker + sự kiện phái việc của Engine → chiếu ra UI/log
   ├── engine              Vòng lặp tất định: LoadState → Route → tiền kiểm → chạy Worker → biên sentinel
   ├── đường can thiệp     Steer/Continue → Arbiter phán quyết → thi hành động tác (ngay/nộp ở biên)
   └── usage / ngân sách / điểm dừng / quản lý model
        │ Gọi subagent.Runner.Run bằng lập trình (tiến độ trung kế qua ctx ToolProgress)
[architect_short/long · writer · editor] (mỗi cái một run + context + model riêng)
        │ lời gọi tool
[Tools]  novel_context · read_chapter · plan_chapter · draft_chapter · edit_chapter
         check_consistency · commit_chapter · save_review · save_arc_summary
         save_volume_summary · save_foundation
        │ Nguyên tử một tệp + phát lại bất biến (commit dùng Saga bền vững)
[Store: hệ tệp (tmp + rename)]
   Progress · Checkpoints · Outline · Drafts · Summaries · Characters · World
   · Signals · Decisions (kiểm toán phán quyết) · bể phản hồi · ghi nhận vi phạm
```

| Tầng | Làm gì | Không làm gì |
|---|---|---|
| Entry | Trình bày, nhận đầu vào | Quyết định nghiệp vụ |
| Host/Engine | Vòng đời, thi hành Route, chạy Worker, biên sentinel, điều phối can thiệp | Phán đoán văn học; ghi sự thật sáng tác (động tác trạng thái điều khiển đi qua nhân của tool) |
| Arbiter | Phán quyết ngữ nghĩa (quyết định có cấu trúc) | Tự tay sáng tác; thi hành động tác |
| Workers | Suy nghĩ, viết, duyệt | Đọc/ghi Store trực tiếp (buộc phải qua tool) |
| Tools | IO nguyên tử một tệp + lỗi tường minh + bất biến; commit dùng Saga | Chỉ thị điều phối xuyên tác tử con |
| Store | Ghi xuống đĩa trên hệ tệp | Logic nghiệp vụ |

Phụ thuộc một chiều: `entry → host → agents/arbiter → tools → store → domain`; `flow` là package chiến lược thuần ở tầng đỉnh (trên store, dưới host). Độc lập theo chiều ngang: `errs/` được bất kỳ tầng nào tham chiếu, `diag/` đăng ký dòng sự kiện của host + đọc `store/` ở chế độ chỉ-đọc.

---

## 4. Mô hình dữ liệu

### 4.1 Progress (`internal/domain/runtime.go`)

```go
type Progress struct {
    NovelName         string
    Phase             Phase           // init / premise / outline / writing / complete
    CurrentChapter    int
    TotalChapters     int
    CompletedChapters []int
    TotalWordCount    int
    ChapterWordCounts map[int]int
    InProgressChapter int             // chương đang được viết
    Flow              FlowState       // writing / reviewing / rewriting / polishing / steering
    PendingRewrites   []int
    StrandHistory     []string        // chuỗi dominant_strand
    HookHistory       []string        // chuỗi hook_type
    CurrentVolume, CurrentArc int     // phân tầng cho truyện dài
    Layered           bool
}
```

Logic điều khiển chỉ đọc các trường sự thật trên, không dựa vào bất kỳ "dấu thời gian cập nhật" nào — thông tin thời gian do `OccurredAt` của checkpoint gánh.

RunMeta (`meta/run.json`) gánh **ý định vận hành của người dùng** (không phải sự thật sáng tác): PlanningTier, PlanStart (cố định hóa phán quyết khởi động, là căn cứ duy nhất để khôi phục khi sập trong kỳ quy hoạch), PendingSteer (bảo vệ can thiệp khi sập, đúng một khe đang bay), AdvanceMode / AdvancePermitChapter (chính sách nghiệm thu từng chương và giấy phép chương chính xác), AdvanceHold (một lần tạm dừng do can thiệp ký). `RunMeta.Init` giữ lại toàn bộ các trường ý định qua các lần khởi động lại.

### 4.2 Checkpoint (`internal/domain/checkpoint.go`)

```go
type Scope      struct { Kind ScopeKind; Chapter, Volume, Arc int }
type Checkpoint struct {
    Seq        int64       // tăng đơn điệu
    Scope      Scope       // chapter / arc / volume / global
    Step       string      // plan / draft / commit / review / arc_summary / ...
    Artifact   string
    Digest     string
    OccurredAt time.Time
}
```

Lưu trữ: `meta/checkpoints.jsonl`, chỉ nối thêm. Ghi lặp cùng một `Scope+Step+Digest` được coi là bất biến, không sinh dòng mới.

### 4.3 Artifact và các sự thật phụ thuộc

Artifact nằm ở `store/outline.go` `drafts.go` `summaries.go` `characters.go` `world.go`.

- **Signals**: `PendingCommit` (khôi phục khi commit bị ngắt). Đọc lúc khởi động/khôi phục, lúc chạy thì không đọc.
- **Decisions** (`meta/decisions.jsonl`): bản ghi kiểm toán của mỗi phán quyết Arbiter (facts+input+decision), phát lại offline được; **không phải nguồn dữ liệu để khôi phục** (khôi phục chỉ dựa vào Progress/Checkpoint/RunMeta).
- **Bể phản hồi dàn ý** (`meta/outline_feedback.jsonl`): commit feedback của writer được ghi xuống đĩa (chỉ với sách phân tầng), architect tham khảo qua novel_context ở lần tác vụ kết cấu sau rồi xóa rỗng.
- **Ghi nhận vi phạm máy móc** (`meta/rule_violations.jsonl`): kết quả kiểm theo user_rules lúc commit, editor tiêu thụ khi duyệt qua `novel_context(chapter=N)`; là siêu dữ liệu chất lượng theo kiểu best-effort, không nhất quán mạnh ngang hàng với việc nộp.

### 4.4 Dàn ý phân tầng và sự thu về khi hoàn sách (tập chung cuộc)

Quy hoạch cuốn dần (mốc neo compass + khung tập + cung mở theo nhu cầu) giải được chuyện "mở và cuốn", nhưng lại biến "kết thúc khi nào" từ một con số thành một phán quyết mở ở cuối mỗi tập — việc thu về khi hoàn sách buộc phải thiết kế tường minh, nếu không sẽ có hai loại bế tắc: trên sổ sách viết xong mà không thu được cái đuôi (vòng lặp chết viết tiếp vượt biên, đã được kết cấu đỡ lưng khắc phục) và tự sự viết xong mà sổ sách không cho dừng (estimated_scale ước cao + ngưỡng hoàn kết phủ quyết cứng → pha nước hoặc ngắt mạch).

**Tập chung cuộc là một khái niệm hạng nhất của việc thu về**, hoàn sách = một phán quyết về hướng + một đoạn trượt tất định:

- **Tuyên bố (phán quyết ngữ nghĩa của LLM)**: cuối tập, kiến trúc sư chọn một trong ba — append_volume (tiếp) / append_volume kèm `"final": true` (tập chung cuộc) / complete_book (điều kiện thỏa đủ ngay lúc này). Trong việc xét hoàn kết, estimated_scale là **bằng chứng, không phải quyền phủ quyết**.
- **Thi hành (code tra bảng sự thật)**: sự thật chung cuộc = `domain.FinaleVolume`. Kết cấu tập cuối viết xong (`layeredStructurallyComplete`) **và bộ ba thu xếp cuối tập đủ mặt (duyệt cung / tóm tắt cung / tóm tắt tập)** là tự động MarkComplete — việc hoàn kết không giành lên trước cửa chất lượng của editor. Sách chưa tuyên bố thì vẫn đi qua `layeredBookComplete` cấp chất lượng (phục bút + mạch dài về không).
- **Giải trừ (suy từ dữ liệu, không có tool hủy)**: sau khi tuyên bố mà lại nối thêm một tập mới chưa gắn cờ → trạng thái thu về tự nhiên được giải trừ. Trạng thái luôn suy được từ layered_outline.
- **Phái việc xét hoàn kết**: cuối tập, nhánh 10 của Route phái architect_long đi theo danh mục xét hoàn kết — quyền phán quyết hoàn kết nằm ở kiến trúc sư (một Worker), không nằm ở mặt điều khiển.

---

## 5. Quy ước về tool

Tool là điểm tương tác duy nhất giữa tầng sự thật và Agent.

### 5.1 Nhóm tool đọc

`novel_context(scope)` / `read_chapter(n)` — gọi được bất cứ lúc nào, không phụ thuộc trạng thái tiền đề, dữ liệu trả về đủ để LLM tự quyết định. `novel_context(chapter=N)` tiêm thêm các vi phạm máy móc của chương đó (nếu có); đường của architect thì tiêm tóm tắt cung của các tập đã hoàn thành/tập hiện tại, ảnh chụp nhân vật, bể phản hồi dàn ý và trạng thái foundation. Khi mở rộng cung, nội dung đã xảy ra là sự thật còn khung chỉ là kế hoạch; Architect có thể đồng thời chỉnh title/goal của cung mục tiêu trong `expand_arc` rồi mở rộng các chương.

### 5.2 Nhóm tool ghi (nguyên tử một tệp + ngữ nghĩa khôi phục phân cấp)

Việc ghi một tệp đơn lẻ là nguyên tử; các bước xuyên nhiều tệp thì không hứa tính nguyên tử kiểu cơ sở dữ liệu. Việc nộp thường và nộp sau khi viết lại của `commit_chapter` dùng chung `PendingCommit`, tiến theo "ý định đầy đủ → artifact/trạng thái → Progress → checkpoint → xóa ý định"; việc khôi phục chỉ dùng payload đã chuẩn hóa và ảnh chụp chính văn của lần xuống đĩa đầu tiên, cấm dùng tham số do model sinh lại sau khi khởi động lại hoặc bản draft đã bị ghi đè. Các tác vụ kết cấu như `expand_arc` / `append_volume` không có ý định lưu bền, chỉ hứa phát lại bất biến với cùng tham số, sửa các view phái sinh, và trả lỗi tường minh.

| Tool | Artifact | Step |
|---|---|---|
| `plan_chapter` | drafts/chXX.plan.json | plan |
| `draft_chapter` | drafts/chXX.draft.md | draft |
| `edit_chapter` | drafts/chXX.draft.md | edit |
| `check_consistency` | không có (chỉ đọc, trả nội tuyến) | consistency_check |
| `commit_chapter` | chapters/chXX.md + Progress (+ bể phản hồi/ghi nhận vi phạm, best-effort) | commit |
| `save_review` | reviews/chXX.json (global thì là chXX-global.json) | review |
| `save_arc_summary` | summaries/arc-vNNaNN.json | arc_summary |
| `save_volume_summary` | summaries/vol-vNN.json | volume_summary |
| `save_foundation` | foundation/*.json (expand_arc/append_volume/update_compass thành công là tiêu thụ bể phản hồi) | premise / outline / layered_outline / characters / world_rules / expand_arc / append_volume / update_compass / complete_book |

`commit_chapter` gánh việc phát hiện hoàn thành cung/tập/cả sách, trả về sự thật có cấu trúc; `save_review` không phán quyết ngưỡng văn học, chỉ kiểm sự thật của việc duyệt rồi ánh xạ nguyên tử verdict mà Editor đưa ra thành Flow và hàng đợi viết lại.

`edit_chapter` là lớp bọc mỏng của `agentcore.EditTool`, phép kiểm quyền sở hữu bảo đảm chương đã hoàn thành buộc phải nằm trong `PendingRewrites` mới sửa được.

### 5.3 Phân tầng lỗi

| Loại lỗi | Tầng xử lý | Động tác |
|---|---|---|
| Mạng timeout / EOF stream | Tools | Thử lại 3 lần |
| provider 429/503 | litellm | failover sang provider dự bị |
| Xác thực / model không tồn tại | Tools | terminal, ném lên |
| Thiếu artifact tiền đề | Tools | conflict, ném lên, LLM gọi `novel_context` rồi thử lại |
| Tham số tool không hợp lệ | Tools | validation, ném lên, LLM sửa tham số |
| retryable (stream-idle v.v.) | tầng subagent | MaxRetries=7 thử lại tại chỗ, không ra khỏi Worker |
| Worker thất bại (guard leo thang/hard_stop v.v.) | Engine | Lỗi tất định thì tạm dừng luôn; còn lại thì thử lại một lần cùng chỉ thị → Arbiter phán quyết retry/reroute/abort |
| Bế tắc (cùng một chỉ thị định tuyến tái hiện liên tiếp) | Engine | 3 lần hỏi Arbiter, 5 lần ngắt cứng và tạm dừng |
| Stream phản hồi rỗng / suy nghĩ lâu | litellm (`StreamIdleTimeout=5min`) | watchdog kích hoạt thử lại |

### 5.4 Tính bất biến

Trước khi chạy, mỗi tool ghi đều kiểm checkpoint trước: nếu `Step+Digest` của checkpoint mới nhất trong scope hiện tại trùng với lần này thì trả luôn sản phẩm đã có. Việc thử lại và việc phái lại sau khi khôi phục từ sập máy đều an toàn — đây cũng là nền móng để mô hình khôi phục của Engine (đọc store rồi chạy tiếp) đứng được.

---

## 6. Lắp ghép Worker

> Một Prompt siêu lớn duy nhất + một Agent duy nhất chạy hết một cuốn sách thì trên lý thuyết khả thi, nhưng ba thứ sẽ chặn tính ổn định: **ngữ cảnh nổ** (200 chương thì nén mạnh cỡ nào cũng thoái hóa), **nhiễu trách nhiệm** (quy hoạch cần nghiêm cẩn / viết cần tưởng tượng / duyệt cần phê phán, đặt cùng một prompt thì làm nhạt nhau), và **mất phần lợi từ model không đồng nhất** (chọn model độc lập cho quy hoạch/viết/duyệt là không gian tối ưu chi phí/chất lượng đáng kể). Vì vậy topo nhiều Worker là cần thiết.

### 6.1 Lắp ghép và chạy

`agents.BuildWorkers` (`internal/agents/build.go`) lắp ba loại Worker thành một `subagent.Runner`: Engine gọi trực tiếp `Run(agent, task)`, mỗi lời gọi là một `agentcore.AgentLoop` trọn vẹn (context riêng, model riêng, thử lại riêng). Toàn bộ lắp một lần là có hiệu lực: model theo vai + failover, prompt cache key (mỗi lần spawn tự tăng #seq), ThinkingLevel, UsageRecorder/SessionLogger (OnMessage), ContextManagerFactory của Writer (cửa sổ tự dựng lại khi chuyển bằng /model), RestorePack, StopGuardFactory, StopAfterTools.

Việc trung kế tiến độ của Worker đi qua **callback ToolProgress của ctx**: Engine gọi `Runner.Run` bằng `agentcore.WithToolProgress(ctx, relay)`, các sự kiện lời gọi tool/chính văn dạng stream/thinking/retry/context của tác tử con đi qua relay vào observer — cùng một hình thái ProgressPayload như thời Coordinator, tầng quan sát dùng lại được.

```
Engine ── Runner.Run(agent, task) ──▶ architect_short/long · writer · editor
                                          │ lời gọi tool
                                        Store (môi giới phối hợp; các Worker không nói chuyện trực tiếp với nhau)
```

`bootstrap.ModelSet` hỗ trợ model cấp vai: architect/writer/editor mỗi cái cấu hình độc lập + provider failover. Cho Writer chạy Sonnet thay vì Opus tiết kiệm được một cấp độ lớn chi phí trên truyện dài 200 chương. Arbiter dùng thống nhất model Default (tính tiền qua usageTrackedModel), hiện chưa mở cấu hình vai riêng.

### 6.2 Ba mẫu phối hợp

Các Worker không nói chuyện trực tiếp với nhau, mọi dòng thông tin đi qua các hiện vật có cấu trúc trong Store:

**Mẫu A · Chuyển giao tuần tự (trục chính)**: Route phái Architect quy hoạch → Writer chương 1..N → Editor duyệt cuối cung → Writer viết lại. Ở mỗi bước, "phái ai tiếp" do Route suy ra từ sự thật.

**Mẫu B · Vòng kín phản hồi**: Writer báo độ lệch so với dàn ý trong commit → bể phản hồi xuống đĩa (chỉ với sách phân tầng) → Architect tham khảo qua novel_context ở lần tác vụ kết cấu sau → tác vụ thành công là tiêu thụ và xóa rỗng. Writer không gọi Architect trực tiếp, phản hồi lưu chuyển qua tầng sự thật.

**Mẫu C · Mở rộng khung (quy hoạch cuốn dần)**: sau commit, sự thật cho thấy cung kế tiếp vẫn là khung → Route (hoặc precheck của Engine) phái architect_long mở rộng → Writer tiếp tục. Năng lực "quy hoạch cuốn dần" của truyện dài chính là vòng kín này.

### 6.3 Ràng buộc bằng code cho luồng của Worker (không dựa vào cây gậy prompt)

> Thời kỳ đầu, luồng của writer dựa vào câu "tiến hành nghiêm ngặt theo thứ tự sau" trong `writer.md` để ràng buộc. LLM thường xuyên vi phạm — bỏ qua plan để draft luôn, viết chính văn chỉ vào cửa chat mà không xuống đĩa. **Ràng buộc luồng bằng prompt thì không ổn định**, model càng nâng cấp lại càng có thể "không tuân thủ một cách sáng tạo".

Bốn tầng ràng buộc bằng code (có hiệu lực đồng thời):

| Tầng | Chỗ đặt | Tác dụng |
|---|---|---|
| `StopAfterTools` / `StopAfterToolResult` | SubAgentConfig trong `agents/build.go` | Tool then chốt thành công là thoát khỏi run của Worker (thoát ở trạng thái cuối vẫn hỏi StopGuard, xem kiểm thử hợp đồng). Writer trúng `commit_chapter` là dừng; `save_review`/`save_arc_summary`/`save_volume_summary` của Editor và việc thu xếp cung/tập của Architect thì đi qua `StopAfterToolResult` |
| `CheckpointDeltaGuard` | `agents/guard/subagent_guards.go` | Lấy checkpoint baseline làm mốc, trước khi kết thúc lượt này buộc phải thấy một checkpoint mới của step tương ứng, không thì từ chối `end_turn`; chặn liên tiếp 3 lần thì leo thang thành terminate (đỡ lưng cho vòng lặp chết của model yếu). Guard của Editor nhận biết tác vụ: khi được phái sinh tóm tắt thì chỉ soát lại, không tính là hoàn thành |
| `next_step` nội tuyến trong tool | Trường trong giá trị trả về của từng tool | Mỗi sự thật tự mang theo "gợi ý bước sau", LLM thấy sự thật là biết bước tiếp |
| Kiểm quyền sở hữu/tiền đề trong tool | `edit_chapter` `commit_chapter` v.v. | Chặn vật lý ở tầng dữ liệu: sửa chương đã hoàn thành mà chưa vào hàng đợi thì bị từ chối, nộp rỗng bị từ chối, `ConcurrencySafe=false` ngăn tranh chấp đồng thời |

writer.md chỉ gánh: giao thức thi hành, mô hình nhận thức về việc chạy tiếp từ checkpoint, cách đọc khế ước chương; còn chuẩn viết thì nằm ở tầng văn phong (`{{VOICE}}` là chỗ giữ để lấp lại, người dùng ghi đè được, xem `docs/voice-layer.md`). **Đây chính là điều kiện tiên quyết để tầng văn phong dám mở cho người dùng: các bất biến sống ở tầng tool, prompt sửa bừa cũng không làm hỏng máy trạng thái.**

### 6.4 Phụ thuộc agentcore

`../agentcore` là thư viện Agent dùng chung của chính dự án này (liên kết qua go.work). Các nguyên thủy mà Engine dùng: `subagent.Runner.Run` (gọi trực tiếp bằng lập trình, kết quả có kiểu và chuỗi lỗi — các phép phân loại như `errors.Is(err, subagent.ErrUnknownAgent)` không dựa vào câu chữ của lỗi), `ToolProgress` của ctx (trung kế sự kiện), `subagent.Config`, `StopGuard`/`StopAfterTools`. `subagent.Tool` chỉ dành cho các host cần phơi Runner ra cho model, dùng qua `Runner.AsTool()`; AINovel không đi qua tầng này.

**Biên của việc sửa**: được vào agentcore — chiến lược ContextManager mới, adapter provider mới, loại sự kiện mới; không vào agentcore — model nghiệp vụ và tool nghiệp vụ. Tiêu chí phán đoán: giả sử tương lai agentcore được đưa vào một coding agent / một agent chăm sóc khách hàng, năng lực mới đó ở tình huống kia vẫn có ý nghĩa thì mới được vào. **Cấm viết bản vá đỡ lưng ở tầng ứng dụng** — thiếu năng lực thì sửa thẳng upstream.

**Kiểm thử hợp đồng** (`internal/agents/agentcore_contract_test.go`, 5 điều, tất cả được `Runner.Run` lái): đóng đinh các hành vi framework mà dự án này phụ thuộc thành những khẳng định chạy được (thoát ở trạng thái cuối thì hỏi StopGuard, Error/Aborted không tới được guard, chuỗi lỗi Escalate khớp được bằng `errors.Is`, `ErrUnknownAgent` có kiểu của `Run` v.v.). **Trước khi bump agentcore thì buộc phải xanh hết** — chú thích sẽ lỗi thời, kiểm thử thì không (kỷ luật này đã bắt được một giả định hết hiệu lực và tiết kiệm được một workaround).

### 6.5 Cache prompt

Đòn bẩy thứ hai của chi phí chạy dài (thứ nhất là chọn model). Bản giải thích đầy đủ xem `docs/prompt-cache-design.md`. Ba tầng phân việc: **litellm chỉ dịch giao thức**, **agentcore quyết định chỗ đặt cache và danh tính**, **ainovel chỉ một dòng cấu hình là tiếp vào**.

Điều kiện tiên quyết để cache có lợi là **byte tiền tố của request phải ổn định**, được ba kỷ luật bảo đảm (đều ở agentcore):

1. **Tính tất định của byte tools** — Description/Schema dựng lại mỗi lần, mọi phép duyệt map đều sắp xếp trước
2. **Lịch sử chỉ nối thêm** — tin nhắn chỉ nối, không viết lại; nén ngữ cảnh là một giao dịch tường minh kiểu "trả một lần miss toàn phần để lấy cửa sổ", phép chiếu buộc phải `CommitOnProject`
3. **Nội dung động đi vào phần đuôi** — phong bì/chỉ thị đều nối vào đuôi, tuyệt đối không viết lại các tin nhắn trước

Cấu hình theo lối «một sách một nền, một vai một tên, một phiên một khóa»: dòng OpenAI dùng `PromptCacheKey = nvl-<băm sách>-<vai>#<số thứ tự spawn>` để tạo ái lực định tuyến (mặc định chỉ gửi cho endpoint chính thức, proxy thì bật tường minh); dòng Claude dùng điểm ngắt cuộn `CacheLastMessage: "ephemeral"` + điểm ngắt sàn cho system. **Vạch đỏ của chốt khóa**: mọi lượng đi vào khóa cache đều bị đóng băng ngay lần tính đầu tiên trong phiên, thà cũ chứ không phá cache. Việc phát hiện đứt (`host/usage.go noteCacheBreak`) là quan sát thuần, không sửa; số lần được đếm vào `usage.json cache_breaks` và panel cache của TUI.

---

## 7. Engine và Arbiter

### 7.1 Vòng lặp Engine (`internal/host/engine.go`)

```
for {
    áp động tác trạng thái điều khiển của can thiệp (xả rỗng; hold+dispatch thì dựng sự thật viết lại trước)
    advanceGate.HandleBoundary() // tiêu thụ hold + đối chiếu giấy phép review
    inst := phái việc do can thiệp ?? Route(LoadState) ?? planStartFallback
    inst == nil → return          // hoàn sách / dừng theo ngữ nghĩa, đợi Continue
    precheck(inst)                // hiện thân tất định của ToolGate cũ: kỳ hoàn sách thì bỏ phái việc;
                                  // chương mục tiêu của writer chưa mở rộng → đổi phái architect mở rộng
    advanceGate.Allow(inst)       // chỉ chặn chương mới xuôi mà chưa có giấy phép
    trackDeadlock(inst)           // cùng Agent+Task tái hiện liên tiếp: 3 lần hỏi Arbiter, 5 lần ngắt mạch
    runWorker(inst)               // subagent.Runner.Run + trung kế tiến độ + sự kiện DISPATCH
    phân loại lỗi: lỗi tất định→tạm dừng; bại lần đầu thì thử lại một lần; bại nữa→Arbiter(retry/reroute/abort)
    biên chính sách: budget → advanceGate
}
```

Một goroutine chạy tuần tự; `ctx` cancel = tạm dừng (checkpoint bảo đảm không mất gì). **Trạng thái điều khiển chỉ đổi ở biên của vòng lặp**: hold/reopen/dispatch của can thiệp xếp hàng tới biên mới nộp (tổ hợp hold+dispatch thì thi hành phái việc để dựng hàng đợi trước, rồi mới cho Gate tiêu thụ hold); answer/rules thì thi hành ngay. Chế độ `review` chỉ ràng buộc chương mới xuôi, không chặn việc viết lại, duyệt, bảo trì kết cấu và khôi phục việc nộp. Trước khi thi hành phái việc của Arbiter thì đối chiếu Expect (các trường ngữ nghĩa Phase/Flow/QueueHead; CheckpointSeq chỉ kiểm toán, không đối chiếu — lúc can thiệp thì worker phần lớn đang chạy, seq tất đổi), không khớp thì bỏ và gửi **đồng bộ** can thiệp gốc về lại đường phán quyết đầy đủ để hỏi lại.

### 7.2 Arbiter (`internal/arbiter/`)

Bốn tình huống, mỗi tình huống một cặp `Collect*Facts` (biên IO) / `Decide*` (không IO ngoài request model do bộ thi hành thống nhất quản lý, phát lại offline được) + một kiểu Decision riêng (những động tác không khớp tình huống thì không biểu đạt nổi ở mức kiểu):

| Tình huống | Kích hoạt | Kiểu quyết định |
|---|---|---|
| `plan_start` | Sách mới khởi động | Chọn kiến trúc sư short/long + bồi thêm cho yêu cầu quá ngắn |
| `intervention` | Người dùng can thiệp | Tổ hợp answer/rules/hold/reopen/dispatch (thứ tự thi hành do Engine cố định) |
| `worker_failure` | Worker báo lỗi mà phân loại tất định không có đường ra | retry / reroute / abort |
| `deadlock` | Cùng chỉ thị lặp lại mà không tiến triển | retry / reroute / abort |

Đường thất bại: bộ thi hành có cấu trúc thống nhất chọn JSON Schema nguyên bản hay hợp đồng bằng prompt tùy theo năng lực; lỗi định dạng/Schema ở chế độ prompt và lỗi kiểm nghiệp vụ ở cả hai chế độ đều phản hồi nguyên nhân chính xác cho model để nó tiếp tục sửa, cho tới khi thành công hoặc `context` kết thúc, không đặt giới hạn số lần. Vi phạm hợp đồng nguyên bản, từ chối trả lời, bị cắt, kết thúc lỗi và các lỗi request không thử lại được thì trả về tường minh ngay; can thiệp thì không sinh ghi, khởi động thì báo lỗi tường minh, failure/deadlock thì tạm dừng theo lối bảo toàn. **Đầu ra của Arbiter cũng không đáng tin ngang mọi đầu ra LLM khác** — sau khi kiểm JSON Schema, `Validate` vẫn tiếp tục kiểm máy móc theo sự thật (ràng buộc phase, reopen chỉ giới hạn ở sách đã hoàn, chương vượt biên). Lượng dùng đi qua `usageTrackedModel` vào ngân sách và hệ thống usage.

### 7.3 Vỏ Host (`internal/host/host.go`)

Vòng đời (`StartPrepared`/`Resume`/`Continue`/`Steer`/`Abort`/`Close`), điều phối can thiệp (FIFO tuần tự + PendingSteer bảo vệ khi sập), phép chiếu sự kiện, quản lý model. Kênh quan sát `Events`/`Stream`/`Done`, UI tổng hợp bằng `Snapshot()`, các cửa mở rộng (nhập/xuất/cùng lên kế hoạch/mô phỏng văn phong/chuyển model).

`runEnded` (callback engine.onDone) định trạng thái cuối theo sự thật trong store: Phase=Complete → completed + bản tổng kết hoàn sách tất định (không tốn lời gọi LLM); còn lại → idle/paused. **Cấm mọi logic "tự động chạy tiếp" xuất hiện ở đây** (bài học lịch sử §10 điều 5).

---

## 8. Khởi động, khôi phục và can thiệp

### 8.1 Tạo mới

```
User: "yêu cầu một câu"
  → StartPrepared(raw)
    → Progress.Init / Checkpoints.Reset
    → StartPrompt cố định vào RunMeta (sự thật đầu vào xuống đĩa trước phán quyết)
    → Arbiter phán quyết plan_start (chọn kiến trúc sư + bồi thêm yêu cầu) → thất bại thì báo lỗi tường minh (kiểm toán kèm error)
    → PlanStartRecord cố định vào RunMeta (phán quyết xuống sự thật trước, rồi mới khởi thi hành)
    → engine.start(chỉ thị phái việc đầu tiên)
```

Phán quyết thất bại không phải cửa tử: StartPrompt đã có, sau đó bất kỳ lần khôi phục/tiếp tục nào cũng sẽ được engine phán bù (xem §8.2).

### 8.2 Khôi phục (khởi động lại sau khi sập)

```
Process khởi động → resumeLabel (nhãn UI thuần) → cảnh báo nhất quán → AdvanceGate đối chiếu
  → có PendingSteer → đi đồng bộ đường phán quyết can thiệp (can thiệp có hiệu lực trước việc chạy tiếp) rồi mới dựng engine lên
  → không thì engine.start(nil): chỉ khôi phục sự thật, Route tính lại từ store rồi chạy tiếp
```

Không có phiên nào cần khôi phục. Sập trong kỳ quy hoạch (phán quyết đã xuống đĩa, foundation đầu tiên chưa xuống đĩa) thì `planStartFallback` phái tiếp theo PlanStartRecord, không làm lại phán quyết đã có. Nếu phán quyết khởi động **chưa từng hoàn tất** (model lỗi lúc khởi động), `planStartFallback` phán bù ngay tại chỗ dựa vào StartPrompt — đây là việc thử lại của phán quyết lần đầu, không vi phạm nguyên tắc "khôi phục thì không phán quyết lại"; phán bù thất bại thì tạm dừng tường minh và thông báo, không cho phép dừng máy im lặng. Tính an toàn của việc phái lại do tính bất biến của tool bảo đảm (§5.4).

### 8.3 Người dùng can thiệp

`Steer`/`Continue` đi thống nhất qua đường phán quyết của Arbiter (`doIntervention`):

```
lưu bền PendingSteer (bảo vệ khi sập) → Collect facts → Decide (vài giây)
  → ghi decisions.jsonl → answer hồi đáp / rules xuống đĩa ngay
  → hold/reopen/dispatch vào hàng đợi nộp ở biên (khi engine đã dừng thì thi hành ngay và dựng engine lên theo ý định)
  → tất cả động tác thành công → xóa PendingSteer một cách nguyên tử (ClearHandledSteer)
```

Bảo vệ khi sập là **lưu bền best-effort với đúng một khe đang bay**: `SetPendingSteer` lần đầu thất bại thì báo lỗi tường minh và dừng phán quyết, tuyệt đối không tiếp tục thi hành khi chưa có bản ghi khôi phục; kỳ phán quyết, động tác thất bại (giữ lại để phát lại), thoát bình thường/Abort (defer lưu lại phần phái việc còn sót) đều được bảo vệ. Vẫn còn hai cửa sổ nói rõ là không bảo đảm — phái việc đã chuyển vào hàng đợi thi hành trong bộ nhớ rồi bị kill cứng (cỡ mili giây), và đầu vào đồng thời trong lúc đang đợi interMu. Người dùng có mặt thì cảm nhận được, chi phí gửi lại chỉ vài giây.

**Tầng lưu bền của can thiệp lâu dài**: luật văn phong/chất lượng được động tác `rules` của phán quyết chuẩn hóa qua `userrules.Service` vào ảnh chụp luật của sách, `novel_context` tiêm vào `working_memory.user_rules` — có hiệu lực xuyên nén, xuyên khởi động lại (chi tiết xem [Ảnh chụp luật người dùng](user-rules-runtime.md)). Các đường ra khác thì bản thân đã xuống store (độ dài/tình tiết→phái việc cho architect, sửa chương cũ→editor vào hàng đợi PendingRewrites, viết lại sau khi hoàn sách→reopen).

### 8.4 Điều khiển việc đẩy chương

`ChapterAdvanceGate` thi hành thống nhất hai ý định của người dùng ở hai thang thời gian khác nhau:

| Ý định | Nguồn | Ngữ nghĩa |
|---|---|---|
| `AdvanceMode=review` + giấy phép chính xác | `/review on`, `/next` | Chính sách lâu dài: mỗi chương mới xuôi buộc phải được mở riêng |
| `AdvanceHold` | Arbiter intervention | Ý định một lần: tạm dừng ở biên hiện tại hoặc sau khi xả rỗng việc viết lại |

Giấy phép gắn với số chương. Chỉ khi chương mục tiêu vào CompletedChapters, PendingCommit rỗng và commit checkpoint tồn tại thì mới tiêu thụ, nên sập ở bất kỳ cửa sổ nào của saga nộp cũng không dùng cùng một giấy phép cho chương sau. Các bất biến chi tiết xem [Chapter Advance Gate](chapter-advance-gate.md).

---

## 9. Cấu trúc thư mục

```
internal/
  domain/         Dữ liệu thuần: Phase / FlowState / Progress / Checkpoint / Scope / Story / Plan /
                  Review / StateChange / luật chuyển Phase-Flow
  store/          Lưu bền trên hệ tệp (tmp+rename + điều phối bất biến; commit có sự thật theo pha Saga): progress / checkpoints / outline /
                  drafts / summaries / characters / world / signals / run_meta / runtime /
                  session / decisions (kiểm toán phán quyết)
  tools/          11 tool cho Agent, nhóm ghi thì nguyên tử một tệp + lỗi tường minh + bất biến; commit dùng thêm Saga bền vững
  flow/           Chiến lược định tuyến (hàm thuần + biên IO): router.go (bảng quyết định Route) + state.go (LoadState)
                  + pause.go (phán quyết điểm dừng)
  arbiter/        Tầng phán quyết ngữ nghĩa (LLM-as-function): plan_start / intervention / failure(deadlock)
                  cặp hàm Collect/Decide theo từng tình huống + kiểu Decision theo từng tình huống + kiểm máy móc
  agents/         build.go lắp ba Worker (subagent.Runner, Engine gọi trực tiếp bằng lập trình); ctxpack/ chiến lược nén ngữ cảnh của Writer
    guard/        subagent_guards.go (CheckpointDeltaGuard ×3, lan can sự thật của Worker)
  host/           host.go (vòng đời/điều phối can thiệp) + engine.go (vòng lặp thi hành tất định) + observer*.go
                  + events.go + usage*.go + budget.go + advance_gate.go + resume.go + cocreate.go
    imp/          Nhập tiểu thuyết ngoài bằng biên dịch ngữ nghĩa: ingest → segment → analyze → synthesize → publish (suy trạng thái thuần + LLM làm hàm)
    exp/          Xuất các chương đã hoàn thành: TXT / EPUB 3; chỉ đọc thuần
  serve/          HTTP API trên loopback mà app desktop (desktop/) spawn làm sidecar; giao diện là web/out
  entry/          startup (khởi động engine cho serve)
  bootstrap/      config + ModelSet + provider failover + trình dẫn dắt setup
  eval/           Đánh giá offline (A/B prompt/voice, hồi quy)
  diag/ errs/ models/ notify/ rules/ userrules/ stylestat/ ...

assets/
  prompts/        arbiter-plan-start / arbiter-intervention / arbiter-failure / architect-short|long
                  / writer (mẫu giao thức, {{VOICE}} là chỗ giữ) / editor / import-* / simulation-*
  voice.md        Chuẩn viết (mặc định dựng sẵn của tầng văn phong; ba tầng ghi đè xem docs/voice-layer.md)
  references/     Kỹ thuật viết + anti-ai-tone + mẫu theo đề tài v.v.
  styles/         default/fantasy/romance/suspense (người dùng ghi đè/thêm mới được)

../agentcore     Framework Agent dùng chung (thư mục anh em qua go.work, thêm năng lực chung được, không thêm nghiệp vụ)
../litellm       Cổng LLM
```

### 9.1 Các mốc tiến hóa

| Thời gian | Tái cấu trúc | Hiệu quả thuần |
|---|---|---|
| 2026-04-10 | `internal/orchestrator/` (6342 dòng) → `host/` + `agents/` | Nhân runtime -74% |
| 2026-04-20 | Hybrid Coordinator: tạo `host/flow/`, thu định tuyến về hàm thuần | Tỉ lệ lỗi định tuyến tiến về 0 |
| 2026-05-02 | Sửa suy nghĩ chậm/stream của agentcore; xóa bản vá chạy tiếp `idleResumeCount` | mimo / stream khi suy nghĩ chậm chạy được |
| 2026-06-05 | Vòng kín quy hoạch cuốn dần + `/import` suy ngược để viết tiếp | Lần đầu chạy được 200+ chương |
| 2026-07-12 | **Thay mặt điều khiển Engine + Arbiter**: vòng lặp dài Coordinator và hệ sinh thái bảy bản vá nghỉ; ba tầng ghi đè của tầng văn phong; gia cố qua năm vòng duyệt đối kháng | Mỗi biên tiết kiệm một lần chuyển tiếp LLM; mặt điều khiển kiểm thử offline được 100%; phán quyết ngữ nghĩa phát lại được |
| 2026-07-15 | **Đường ống biên dịch ngữ nghĩa của `/import`**: luật chia cứng nghỉ, đổi sang biên dịch theo pha ingest→segment→analyze→synthesize→publish; suy trạng thái thuần (`NextAction(Facts)`) + hiện vật gắn theo dấu tay đầu vào, khôi phục bất biến toàn trình | Việc chia tự mạnh lên theo năng lực model; không có liệt kê pha trôi lệch; ngắt là tiếp được, mặt điều khiển kiểm thử offline được |

Đo thực tế: hy3-preview free 12 chương / 73 phút, mimo-v2.5-pro 10 chương / 84.000 từ, cả hai đều chạy một hơi xong; truyện dài gpt-5.4 《Phàm Cốt》 235 chương / 1.270.000 từ chạy được vòng kín quy hoạch cuốn dần (số liệu thời Coordinator, lần chạy đầu thời Engine còn phải bổ sung).

---

## 10. Những việc dứt khoát không làm

Vi phạm là đại diện cho việc lệch kiến trúc.

1. **Không đưa vào khái niệm Task / Job / WorkItem**. "Tác vụ hiện tại" mà UI hiển thị là phép chiếu của dòng sự kiện, không phải sự thật.
2. **Không phát minh bộ điều phối thứ hai ngoài Route**. Mọi câu "bước sau phái ai" buộc phải qua bảng quyết định Route (đóng đinh bằng đặc tả vét cạn) hoặc phán quyết Arbiter (xuống đĩa để kiểm toán), không cho phép các phép phái việc if-else rải rác.
3. **Không làm cơ chế "chạy tiếp khi rảnh"**. Vòng lặp Engine kết thúc = Host vào trạng thái cuối; muốn động lại thì chỉ có người dùng `Continue` hoặc khởi động lại `Resume`.
4. **Không thêm phần dạy hành vi vào prompt**. Cần lan can hành vi nghĩa là phân tầng đã sai — bất biến vào tiền điều kiện của tool, phán đoán vào Arbiter, luồng vào Route.
5. **Không thêm bản vá tự chạy tiếp cho việc dừng máy bất thường ở Host**. `idleResumeCount` một thời, trong đúng một lần chạy dài mà nó thực sự kích hoạt, đã 100% không cứu được gì, mà còn che mất nguyên nhân thật ở tầng agentcore (chi tiết xem `feedback_no_host_resilience.md`).
6. **Không suy ra việc hoàn thành tác vụ dựa trên "tool exec end"**. Bằng chứng duy nhất của việc hoàn thành là checkpoint đã ghi.
7. **Không làm mô hình bốn tầng kiểu WorkflowInstance / Command + Apply**. Tầng sự thật chỉ có Progress + Checkpoint + Artifact.
8. **Không hỗ trợ Worker song song**. Một vòng lặp Engine đang hoạt động, một cuốn sách đẩy tuần tự. Nhiều tiểu thuyết thì dùng nhiều process.
9. **Không gọi LLM ở tầng tool** (ngoài chính các tool của Agent). IO thuần + kiểm + bất biến.
10. **Không cho UI đọc Store trực tiếp**. Chỉ được đăng ký sự kiện hoặc đọc `Snapshot()` của Host.
11. **Không viết máy trạng thái Flow ở phía Host**. Nhãn Flow chỉ do tool cập nhật, Route chỉ đọc không ghi.
12. **Không viết code cứng đỡ lưng cho "LLM ảo giác"**. Hãy tối ưu prompt, cải thiện giá trị trả về của tool, để novel_context trình bày sự thật rõ ràng hơn.
13. **Không cho diag / tầng quan sát chen vào luồng điều khiển**. Chẩn đoán chỉ đọc; tự sửa / chạy tiếp / đổi luồng đều nhất loạt không làm.
14. **Chính sách ngân sách và đẩy chương không vào tầng Route/tool**. `BudgetSentinel` / `ChapterAdvanceGate` là các thành phần chính sách ở biên của Engine (thi hành chỉ thị người dùng đã ký trước, không lượng định hành vi văn học); `notify` là quan sát thuần.
15. **Sửa mặt điều khiển thì buộc phải sửa đặc tả vét cạn trước rồi mới sửa phần hiện thực**; **trước khi bump agentcore thì buộc phải qua kiểm thử hợp đồng**.
16. **Không làm DSL workflow tổng quát, event sourcing, State Digest toàn cục**. Route là một miền một bảng, tổng quát hóa là thiết kế quá mức.

---

## 11. Chiến lược kiểm chứng

### 11.1 Danh mục tài sản kiểm thử

| Tầng | Tài sản | Bao phủ |
|---|---|---|
| Đặc tả mặt điều khiển | `flow/router_exhaustive_test.go` | Vét cạn 120.000 tổ hợp của bảng quyết định Route + các tính chất hàm thuần/tất định/bảo toàn |
| Hợp đồng framework | `agents/agentcore_contract_test.go` | 5 giả định về hành vi agentcore, được `Runner.Run` lái (trước khi nâng cấp thì buộc phải chạy) |
| Engine đầu-cuối | `host/engine_test.go` | Model fake + tool thật: viết trọn sách / phán quyết thất bại / phán quyết bế tắc / trình tự nghiệm thu việc viết lại / boundary hold dừng ngay / bảo toàn khi tranh chấp lúc thoát / một giấy phép một chương |
| Phán quyết | `arbiter/arbiter_test.go` | Phân tích cú pháp/thử lại theo phản hồi/ma trận kiểm theo từng tình huống/thu sự thật |
| Hợp đồng đường ống sự thật | kiểm thử store/tools | Bể phản hồi xuyên khởi động lại, ghi nhận vi phạm latest-wins/xóa khi viết lại/tiêm vào novel_context, PlanStart giữ được qua Init |
| Tầng văn phong | `assets/load_test.go` | Tách ra khớp từng byte / ngữ nghĩa ba tầng ghi đè / eval đi cùng đường lắp ghép |
| Chất lượng ngữ nghĩa | `internal/eval` + decisions.jsonl | A/B prompt/voice, phát lại phán quyết offline (bộ hồi quy đang dựng) |

### 11.2 Các tình huống về tính ổn định

- **A Chạy dài**: 80~200 chương chạy một hơi xong, Phase=complete. Cho phép provider failover, thử lại; cấm mọi việc tự chạy tiếp.
- **B Khôi phục sau sập**: kill process sau bất kỳ step nào → Resume → Route chạy tiếp từ sự thật, không viết lại sản phẩm đã xuống đĩa, checkpoints không có step trùng. Sập trong kỳ quy hoạch thì đi qua PlanStartRecord.
- **C Provider chập chờn**: 503 gián đoạn → litellm failover, Worker không hay biết.
- **D Người dùng can thiệp**: Steer khi đang chạy → phán quyết hồi đáp trong vài giây, động tác nộp ở biên; Steer khi đã dừng → phán quyết rồi dựng lên theo ý định; sập → PendingSteer phát lại.

### 11.3 Tính tuân thủ (viết được thành linter / test)

- `flow.Route` buộc phải là hàm thuần: cấm đọc Store / mọi IO
- Trong thân hàm `runEnded` không cho phép xuất hiện bất kỳ lời gọi khởi động engine nào
- Tình huống phán quyết mới buộc phải thêm theo cặp Collect/Decide + kiểu Decision + việc xuống đĩa
- Code liên quan tới recovery chỉ được xuất hiện ở `host/resume.go` và `engine.planStartFallback`

### 11.4 Lặp chất lượng

Đổi văn phong → sửa `<thư mục sách>/style/` (cấp người dùng) hoặc assets/voice.md (dựng sẵn), kiểm chứng A/B bằng bộ đánh giá văn phong; thêm chiều duyệt → sửa editor.md (save_review nhận có cấu trúc); thêm tài liệu tham chiếu → đấu dây tường minh ở ba chỗ (`tools.References` + `loadReferences` + ánh xạ tiêm vào novel_context).

**Thống kê văn phong cấp cả sách (`internal/stylestat`)**: chạy thống kê tất định trên toàn bộ các chương đã hoàn thành (mẫu câu/cụm từ tần cao/câu lặp xuyên chương/hình thái cuối chương), tiêm vào `episodic_memory.style_stats`: editor phán quyết theo số, writer dựa vào đó để tự tránh. **Thống kê về code, phán quyết về LLM.**

---

## 12. Tổng kết

> **Tầng sự thật thì tất định, tầng ngữ nghĩa thì tự chủ.** Model được tự do ở chỗ không kiểm chứng được (viết gì, viết thế nào, phán thế nào), và bị ràng buộc ở chỗ kiểm chứng được (thứ tự, tính bất biến, giai đoạn).

Không có task queue, không có policy engine, không có phiên thường trú. Chỉ có:

- Một vòng lặp Engine tất định chạy tuần tự (~500 dòng, sáu đường đầu-cuối đóng đinh)
- Một bảng quyết định Route (hàm thuần, đặc tả vét cạn 120.000 tổ hợp)
- Bốn hàm phán quyết Arbiter (sự thật vào, quyết định có cấu trúc ra, xuống đĩa và phát lại được)
- Ba loại Worker theo chức năng (context và model độc lập, lan can sự thật không quấy rầy)
- 11 tool nguyên tử một tệp, thất bại tường minh/khôi phục bất biến khi xuyên nhiều tệp; trong đó commit dùng Saga bền vững + một tệp jsonl checkpoint

Lợi ích từ việc nâng model chảy về đâu thì thấy rõ một lượt: sáng tác tốt hơn (toàn bộ đầu ra của Writer/Architect/Editor), phán quyết chính xác hơn (bốn tình huống của Arbiter), tóm tắt tốt hơn (ctxpack) — tất cả đổi model là có, lớp vỏ không sửa một dòng. Mặt điều khiển không ăn phần lợi từ model, bởi **tra bảng thì không cần trí tuệ**; nó cần được chứng minh là đúng, và nó đã được chứng minh rồi.

Sự cứng nhắc của luồng là có ý, có định giá, và có để cửa: muốn nới thứ tự tool của writer → nới một đoạn prompt giao thức (bất biến có tầng tool đỡ lưng); muốn phái theo cung → Route thêm một dòng nhánh; muốn mở rộng năng lực phán quyết → thêm một cặp Collect/Decide. Mỗi lần nới đều có trọng tài (đặc tả vét cạn, đánh giá văn phong, phát lại decisions) — **dùng bằng chứng để quyết cho model bao nhiêu dây, chứ không dùng niềm tin**.

Kỷ luật duy nhất: **khi có người muốn thêm một điểm quyết định, hãy qua phép tam phân trước — liệt kê được thì vào Route, biên rõ ràng thì vào Arbiter, mở thì vào Worker**. Quyết định không thuộc cả ba thì hãy nghĩ lại cho rõ xem nó có thật sự tồn tại không.
