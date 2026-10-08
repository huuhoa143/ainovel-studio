# Chapter Advance Gate

> **2026-10-08 — chỉ còn app desktop.** TUI và headless đã gỡ. Chỗ nào bên dưới nhắc TUI, `/review` hay `/next` là mô tả lúc viết; cửa gác không đổi, còn trên app nó là chế độ **Duyệt từng chương** trong thanh điều khiển của studio.

> Trạng thái: đã hiện thực  
> Ngày: 2026-07-14  
> Giải quyết: nghiệm thu từng chương, tạm dừng an toàn sau can thiệp, giấy phép chương chính xác khi khôi phục sau sập

## 1. Vì sao cần nó

Rủi ro cốt lõi của việc sáng tác tự động truyện dài không phải tốn thêm một lời gọi, mà là trong lúc người dùng đọc soát thì hệ thống vẫn ghi tiếp chương mới, rồi gấp cả tóm tắt, trạng thái nhân vật và phản hồi dàn ý dựng trên tình tiết cũ vào nguồn sự thật về sau. Xóa cái chương viết thừa cũng không tự hủy được các trạng thái phái sinh ấy, và người dùng vì thế mất niềm tin vào quá trình sáng tác.

Dự án vẫn lấy "cho mục tiêu rồi tự chủ hoàn thành liên tục" làm định vị mặc định, nên không biến việc xác nhận từng chương thành mặc định toàn cục. Hệ thống cung cấp hai chính sách rõ ràng:

- `auto`: chế độ mặc định, tự chủ đẩy liên tục;
- `review`: chế độ nghiệm thu từng chương do người dùng chủ động chọn, mỗi chương mới xuôi cần một giấy phép chính xác.

Đây không phải trả luồng công việc lại cho Coordinator LLM. Khi nào cần người dùng xác nhận là chính sách của người dùng; luồng tất định của bước sau vẫn do Route suy ra; còn việc có cần dừng lại một lần để nghiệm thu kết quả của một can thiệp nào đó thì mới do Arbiter phán đoán ngữ nghĩa.

## 2. Phân định biên

| Câu hỏi | Thuộc về | Lý do |
|---|---|---|
| Hiện có đang ở chế độ nghiệm thu từng chương không | RunMeta / Host | Ý định vận hành lâu dài của người dùng |
| Chương nào đã có giấy phép | RunMeta / Gate | Sự thật máy móc, kiểm chứng được và khôi phục được |
| Bước sau chạy Worker nào | `flow.Route` | Suy ra từ sự thật sáng tác bằng hàm thuần |
| Chỉ thị có bắt đầu một chương mới xuôi không | `flow.StartsForwardChapter` | Phán đoán máy móc có kiểu |
| "Sửa xong cho tôi xem" có cần tạm dừng không | Arbiter | Phán đoán ngữ nghĩa từ ngôn ngữ tự nhiên |
| Việc tạm dừng kích hoạt khi nào | `ChapterAdvanceGate` | Thi hành tất định cho một ý định dùng một lần |
| Ngân sách có cho phép tiếp không | `BudgetSentinel` | Chính sách Host độc lập |

`AdvanceMode`, giấy phép chương và hold dùng một lần không vào bảng quyết định của Route, và cũng không cho model sửa. Máy trạng thái sáng tác của Route và chính sách nghiệm thu từng chương giữ trực giao với nhau.

## 3. Mô hình trạng thái tối thiểu

Trong `meta/run.json` chỉ thêm ba mục ý định vận hành:

```go
type RunMeta struct {
	AdvanceMode          ChapterAdvanceMode `json:"advance_mode"`
	AdvancePermitChapter int                `json:"advance_permit_chapter,omitempty"`
	AdvanceHold          *AdvanceHold       `json:"advance_hold,omitempty"`
}

const (
	ChapterAdvanceAuto   ChapterAdvanceMode = "auto"
	ChapterAdvanceReview ChapterAdvanceMode = "review"
)

const (
	AdvanceHoldAtBoundary           AdvanceHoldAfter = "boundary"
	AdvanceHoldAfterRewritesDrained AdvanceHoldAfter = "rewrites_drained"
)

type AdvanceHold struct {
	After  AdvanceHoldAfter `json:"after"`
	Reason string           `json:"reason"`
}
```

Không có PolicyEngine tổng quát, mảng điều kiện, hàng đợi giấy phép, thời gian hết hạn hay phiên bản chính sách. Nhu cầu thật đã có chỉ cần một chế độ lưu bền, một giấy phép chính xác và một hold dùng một lần.

### 3.1 Các bất biến

1. `AdvanceMode` chỉ có thể là `auto` hoặc `review`; giá trị không rõ thì trả `UnsupportedAdvanceModeError`.
2. Chế độ không rõ thì không được khởi Host, cũng không được viết lại RunMeta.
3. Dưới `auto` thì giấy phép buộc phải là `0`.
4. Dưới `review` thì giấy phép chỉ có thể là `0` hoặc một số chương nguyên dương.
5. Cấp lại cùng một mục tiêu là bất biến, mục tiêu khác không được ghi đè giấy phép đang bay.
6. Giấy phép chỉ ràng buộc việc "bắt đầu một chương mới xuôi chưa hoàn thành"; quy hoạch, duyệt, viết lại, gia công và khôi phục việc nộp thì không bị chặn.
7. Giấy phép gắn với số chương, không gắn với một lần chạy process hay một lần gọi Worker.
8. Chỉ khi chương mục tiêu đã vào `CompletedChapters`, `PendingCommit` tương ứng đã rỗng, và có checkpoint `commit` của chương đó thì giấy phép mới coi là được tiêu thụ ổn định.
9. Chương mục tiêu đã hoàn thành mà thiếu commit checkpoint là trạng thái hỏng: báo lỗi tường minh và tạm dừng, không đoán rồi sửa.
10. Giấy phép chưa hoàn thành buộc phải bằng `Progress.NextChapter()`. `PendingRewrites` không làm đổi `NextChapter()`, nên việc viết lại và giấy phép xuôi đang bay cùng tồn tại được về mặt máy móc.
11. `AdvanceHold` chỉ được dùng `boundary` hoặc `rewrites_drained`, và buộc phải mang theo lý do không rỗng.
12. hold và giấy phép dùng compare-and-clear; khi trạng thái bị một động tác mới thay thế thì không được xóa nhầm.

## 4. Store API

RunMetaStore cung cấp các tác vụ nguyên tử hẹp và có kiểu:

```go
SetAdvanceMode(mode domain.ChapterAdvanceMode) error
GrantAdvancePermit(chapter int) error
ClearAdvancePermit(chapter int) error
SetAdvanceHold(hold domain.AdvanceHold) error
ClearAdvanceHold(expected domain.AdvanceHold) error
```

- Khi chuyển về `auto` thì xóa giấy phép chương trong cùng một khóa ghi, nhưng không xóa một hold khác do can thiệp của người dùng sinh ra;
- Việc cấp phép chỉ hợp pháp dưới `review`;
- Tác vụ xóa chỉ tiêu thụ đúng cái mục tiêu mà bên gọi vừa đọc;
- Khi khởi tạo RunMeta thì chế độ mặc định là `auto`, và giữ lại chế độ, giấy phép, hold đã xuống đĩa.

Dự án hiện không có dữ liệu lịch sử nào cần di trú, nên phần hiện thực không chứa việc đọc trường cũ, ghi kép hay nhánh hạ cấp.

## 5. Ngữ nghĩa của hàm thuần

### 5.1 Nhận biết chương mới xuôi

```go
func StartsForwardChapter(
	inst *Instruction,
	progress *domain.Progress,
	pending *domain.PendingCommit,
) bool
```

Chỉ trả về true khi tất cả các điều kiện sau đồng thời thỏa:

- Worker là `writer`;
- phase là `writing`;
- không có `PendingCommit`;
- không có hàng đợi viết lại;
- không có `InProgressChapter`;
- chương mục tiêu bằng `NextChapter()`.

Phép phán đoán chỉ đọc các trường có kiểu, không phân tích văn bản của Task hay Reason.

### 5.2 hold dùng một lần

`ResolveAdvanceHold` trả về, dựa trên hold và Progress:

- `keep`: điều kiện chưa thỏa;
- `consume`: trạng thái hoàn sách thì chỉ cần dọn ý định;
- `consume-and-stop`: dọn ý định rồi tạm dừng.

`boundary` kích hoạt ở biên của Worker hiện tại; `rewrites_drained` kích hoạt sau khi hàng đợi viết lại xả rỗng. Điều kiện không rõ và sự thật thiếu thì báo lỗi luôn.

## 6. ChapterAdvanceGate

Gate là thành phần chính sách duy nhất về việc tiến của quá trình sáng tác, ngoài ngân sách; trách nhiệm chỉ có hai:

1. Giải và tiêu thụ hold dùng một lần ở biên của vòng lặp;
2. Kiểm giấy phép từng chương trước khi phái writer, và ở biên thì đối chiếu xem giấy phép có được tiêu thụ ổn định hay chưa.

Thứ tự của Engine là:

```text
nộp các can thiệp đang chờ
→ Gate kiểm ở biên
→ Route / lấy phái việc của Arbiter
→ precheck
→ Gate kiểm giấy phép khi phái việc
→ Worker
→ Budget kiểm ở biên
→ Gate kiểm ở biên
→ lượt sau
```

Khi `auto && hold == nil`, phép kiểm ở biên đọc RunMeta rồi trả về ngay, không đọc Progress, PendingCommit hay checkpoint.

### 6.1 hold + dispatch

Arbiter có thể phán câu "viết lại chương 3, sửa xong cho tôi xem" thành:

```json
{
  "hold": {
    "after": "rewrites_drained",
    "reason": "viết lại xong thì đợi người dùng nghiệm thu"
  },
  "dispatch": {
    "agent": "editor",
    "task": "soát lại chương 3 và dựng hàng đợi viết lại theo kết quả"
  }
}
```

Nhóm động tác này buộc phải thi hành phần phái việc đi kèm trước, để Editor dựng nên sự thật về việc viết lại, rồi Gate mới phán được hàng đợi đã xả rỗng chưa. Engine gắn việc "lần phái việc này thì hoãn Gate" vào đúng chỉ thị trong bộ nhớ đó, và xóa luôn khi lấy chỉ thị đi; phái việc thường của Arbiter thì không được lách Gate.

### 6.2 permit và việc viết lại

`reopen` khi hoàn sách chỉ xảy ra được ở `complete`, còn `/next` chỉ xảy ra được ở `writing`, hai cái loại trừ nhau về mặt máy móc. `PendingRewrites` đã tồn tại trong kỳ viết không làm đổi số chương hoàn thành lớn nhất, nên giấy phép vẫn khớp với cùng một `NextChapter()`; Worker viết lại chạy được, nhưng không tiêu thụ giấy phép xuôi.

## 7. Khôi phục sau sập

Việc nộp chương là một saga nhiều bước, nên giấy phép không biểu diễn được bằng một giá trị boolean kiểu "lần run sau được viết một chương". Khi khôi phục, Gate đối chiếu theo ba loại sự thật:

| Cửa sổ sự thật | Hành vi của Gate |
|---|---|
| Chương mục tiêu chưa hoàn thành, không có PendingCommit | Giữ giấy phép, cho phép bắt đầu/khôi phục chương đó |
| PendingCommit thuộc chương mục tiêu | Giữ giấy phép, để việc nộp khôi phục cho xong |
| Chương mục tiêu hoàn thành, PendingCommit rỗng, commit checkpoint tồn tại | Tiêu thụ giấy phép |
| Chương mục tiêu hoàn thành mà thiếu checkpoint | Báo lỗi và tạm dừng |
| Giấy phép trỏ tới một chương chưa hoàn thành không phải NextChapter | Báo lỗi và tạm dừng |

Nhờ vậy, process sập ở bất kỳ cửa sổ nào — bản nháp, ghi trạng thái, gắn cờ tiến độ hay ghi tín hiệu — cũng không dùng sai cùng một giấy phép cho chương sau.

## 8. Arbiter

Schema can thiệp dùng `AdvanceHoldOp`:

```go
type AdvanceHoldOp struct {
	Cancel bool                    `json:"cancel,omitempty"`
	After  domain.AdvanceHoldAfter `json:"after,omitempty"`
	Reason string                  `json:"reason,omitempty"`
}
```

Luật:

- "Dừng một chút đã" nói tường minh thì dùng `boundary`;
- Dưới `auto`, câu "sửa chương đã viết, sửa xong cho tôi nghiệm thu" thì dùng `rewrites_drained`;
- `review` vốn đã dừng từng chương rồi, không tạo lặp một hold đồng nghĩa;
- "Tiếp tục" thì hủy được hold hiện có, nhưng không cấp được giấy phép chương;
- Chuyển chế độ chỉ được dùng `/review on|off`, mở đường chỉ được dùng `/next`.

Engine gọi RunMetaStore trực tiếp để áp các động tác có cấu trúc, không giả dạng nó thành một LLM Tool.

## 9. Giao diện người dùng

### 9.1 `/review on|off`

- `/review on`: lưu bền ngay chính sách nghiệm thu từng chương; nếu Worker đang chạy thì sau khi việc hiện tại xong sẽ dừng trước chương mới xuôi kế tiếp;
- `/review off`: chuyển về đẩy tự động và xóa giấy phép một cách nguyên tử; không ngầm khởi Engine đang tạm dừng, sự kiện sẽ nhắc rõ để người dùng nhập chỉ thị tiếp tục.

### 9.2 `/next`

Chỉ dùng được khi tất cả các điều kiện sau đồng thời thỏa:

- Engine chưa chạy;
- Không ở giai đoạn cùng lên kế hoạch;
- Chế độ là `review`;
- Không có hold đang chờ;
- Ngân sách cho phép;
- phase là `writing`.

Lệnh cấp giấy phép chính xác cho `NextChapter()` rồi khởi Engine. Thông báo sẽ nói rõ: sau khi chương đó nộp, việc duyệt cần thiết và việc bảo trì kết cấu cung/tập vẫn sẽ hoàn tất, rồi mới đợi mở đường lần nữa.

### 9.3 Trình bày trạng thái

`UISnapshot` là nguồn sự thật duy nhất của TUI, gồm:

- `AdvanceMode`;
- `AdvancePermitChapter`;
- `HasAdvanceHold`;
- `AdvanceHoldReason`.

Thanh bên trình bày trạng thái tự động/nghiệm thu từng chương và chương đã được mở đường; lúc đợi thì ô nhập nhắc "nhập ý kiến sửa, hoặc `/next` để mở chương sau". kind của thông báo là `advance_gate`.

## 10. Kiểm chứng

Kiểm thử bao phủ:

- Chuyển trạng thái nguyên tử và compare-and-clear của chế độ, giấy phép, hold trong RunMeta;
- Chế độ không rõ thì thất bại tường minh và không viết lại RunMeta;
- Nhận biết bằng hàm thuần giữa chương mới xuôi và việc viết lại/khôi phục;
- Ngữ nghĩa boundary của hold, việc viết lại chưa xả rỗng, đã xả rỗng, và hoàn sách;
- Không giấy phép thì chặn, giấy phép chính xác thì mở đường, giấy phép sai chương thì báo lỗi;
- Trong kỳ PendingCommit thì giữ giấy phép, sau khi commit ổn định thì tiêu thụ;
- Khi cờ hoàn thành và checkpoint xung đột thì tạm dừng;
- permit và PendingRewrites xen nhau thì không báo sai;
- Engine chứng minh đầu-cuối rằng một giấy phép làm ổn định đúng một chương mới;
- Khi Gate đã gắn cờ tạm dừng mà goroutine Engine cũ còn đang thoát, `/next` từ chối vào lại một cách tường minh, thử lại sau thì khôi phục bất biến theo cùng giấy phép của chương đó;
- Hồi quy cho hold-only, hold+dispatch và tranh chấp lúc thoát.

## 11. Dứt khoát không làm

- Không cho model quyết chế độ vận hành hay cấp giấy phép;
- Không sửa Route để thích ứng với chính sách xác nhận của người dùng;
- Không biến cả việc viết lại, quy hoạch, duyệt và bảo trì kết cấu thành xác nhận từng bước;
- Không thêm PolicyEngine tổng quát, danh sách StopCondition hay DSL chính sách;
- Không cung cấp việc cấp phép trước cho nhiều chương hay hàng đợi giấy phép;
- Không giữ lại mô hình tạm dừng cũ, trường tương thích, DTO di trú hay đường ghi kép;
- Không hạ cấp im lặng cho những chế độ tương lai chưa rõ.

Sau này nếu xuất hiện nhu cầu mới về biên tự trị đã được kiểm chứng lặp lại thì hãy mở rộng chế độ dựa trên bằng chứng; chi phí đổi ý thấp ở hiện tại chính là tính tương thích cho tương lai.
