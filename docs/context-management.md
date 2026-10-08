# Thuyết minh về quản lý ngữ cảnh

> **2026-10-08 — chỉ còn app desktop.** TUI và headless đã gỡ. Chỗ nào bên dưới nhắc TUI (`internal/entry/tui/…`, sự kiện `COMPACT` trên TUI, màu phần trăm ngữ cảnh) là mô tả lúc viết; cơ chế nén ngữ cảnh không đổi, còn phần hiển thị trên app nằm ở studio và trong `sidecar.log`.

Tài liệu này thuyết minh hệ thống quản lý ngữ cảnh hiện tại của `ainovel-cli`, gồm:

- Vì sao phải quản lý ngữ cảnh
- Ngữ cảnh đến từ đâu
- Lúc chạy thì nén, khôi phục, chuyển giao thế nào
- Giá trị, điều kiện kích hoạt và tình huống áp dụng của từng chiến lược
- Khi có vấn đề thì nên xem đâu trước

Mục tiêu không phải giới thiệu khái niệm trừu tượng, mà để người bảo trì về sau mở đúng một tài liệu này là hiểu nhanh được phần hiện thực hiện tại và các cửa vào để tra lỗi.

## 1. Mục tiêu thiết kế

Việc quản lý ngữ cảnh của dự án này không phải cho tình huống chat tổng quát, mà hướng tới tình huống sáng tác tiểu thuyết. Nó phải giải đồng thời mấy loại vấn đề:

1. Hội thoại dài sẽ vượt cửa sổ ngữ cảnh của model.
2. Thứ mà việc sáng tác tiểu thuyết cần giữ không phải "bản thân lịch sử chat", mà là ký ức tự sự có cấu trúc.
3. Writer sau khi nén thì không được mất trạng thái nhân vật, phục bút, kế hoạch chương, ràng buộc văn phong, các mục còn phải sửa theo duyệt.
4. Khi khôi phục việc viết thì không được giả định rằng model vẫn "nhớ chuyện đã nói trước đó", buộc phải ưu tiên dựa vào các hiện vật đã lưu bền.

Vì vậy chúng tôi dùng một phương án "ký ức phân tầng":

- Ký ức ngắn hạn: phần đuôi tin nhắn được giữ lại gần nhất
- Ký ức trung hạn: `ContextSummary` sinh ra từ việc nén
- Ký ức dài hạn: các hiện vật có cấu trúc trong store của dự án
- Ký ức khôi phục: handoff / restore pack / novel_context

## 2. Kiến trúc tổng thể

### 2.1 Các tầng chính

Việc quản lý ngữ cảnh hiện chia thành bốn tầng:

1. `agentcore/context`
   Chịu trách nhiệm về ngân sách ngữ cảnh tổng quát, đường ống chiến lược, framework nén/khôi phục.

2. `internal/tools/novel_context`
   Chịu trách nhiệm lắp dữ liệu có cấu trúc trong dự án tiểu thuyết thành ngữ cảnh dùng được cho lượt hiện tại.

3. `internal/orchestrator/store_summary_*`
   Chịu trách nhiệm nén nhanh dựa trên store, dành riêng cho Writer.

4. `internal/orchestrator/writer_restore.go`
   Chịu trách nhiệm nối thêm một gói khôi phục sau khi nén, ngay sau `FullSummary`, để bảo đảm Writer viết tiếp được.

### 2.2 Dòng dữ liệu

Lúc chạy có hai đường ngữ cảnh chính:

1. Đường làm việc bình thường
   - Agent gọi `novel_context`
   - `novel_context` đọc từ store các dữ liệu như tóm tắt chương, kế hoạch, nhân vật, trục thời gian
   - Các dữ liệu đó vào prompt của lượt hiện tại

2. Đường ngữ cảnh quá dài
   - `ContextManager` phát hiện áp lực token
   - Nén theo thứ tự chiến lược
   - Ưu tiên thử nén nhẹ và nén dựa trên store
   - Vẫn chưa đủ thì mới đi tới `FullSummary` bằng LLM
   - Sau `FullSummary` thì tiêm restore pack

## 3. Các tệp then chốt

### 3.1 Engine ngữ cảnh tổng quát

- `../agentcore/context/strategy.go`
- `../agentcore/context/engine.go`
- `../agentcore/context/strategy_tool.go`
- `../agentcore/context/strategy_trim.go`
- `../agentcore/context/strategy_summary.go`
- `../agentcore/context/message.go`
- `../agentcore/context/summary_run.go`

Tác dụng:

- Định nghĩa `Strategy` / `ForceCompactionStrategy`
- Chịu trách nhiệm thi hành chuỗi chiến lược dựa trên ngân sách
- Chịu trách nhiệm biểu diễn `ContextSummary` và chuyển đổi sang LLM
- Chịu trách nhiệm nén bằng tóm tắt LLM của `FullSummary`

### 3.2 Phần đấu dây phía dự án

- `internal/orchestrator/agents.go`

Tác dụng:

- Lắp `ContextManager` của Writer (Coordinator đã nghỉ từ 2026-07-12, xem docs/engine-arbiter.md)
- Tiêm thêm `StoreSummaryCompact` cho Writer
- Cấu hình prompt `FullSummary` bản riêng cho tiểu thuyết cho Writer
- Cấu hình `writerRestorePack` cho Writer

### 3.3 Phần nén và khôi phục phía dự án

- `internal/orchestrator/store_summary_strategy.go`
- `internal/orchestrator/store_summary_builder.go`
- `internal/orchestrator/writer_restore.go`

Tác dụng:

- Trước khi tóm tắt bằng LLM thì ưu tiên dùng dữ liệu store để nén nhanh
- Dựng thống nhất phần ngữ cảnh có cấu trúc mà việc nén và khôi phục của Writer cần
- Nối thêm một restore message thuần trong bộ nhớ sau `FullSummary`

### 3.4 Lắp ghép ngữ cảnh có cấu trúc

- `internal/tools/novel_context.go`
- `internal/tools/novel_context_builders.go`
- `internal/domain/runtime.go`

Tác dụng:

- Định nghĩa `ContextProfile` / `MemoryPolicy`
- Quyết nạp bao nhiêu tóm tắt chương, bao nhiêu trục thời gian, có bật tóm tắt phân tầng không
- Lắp ra các chương, nhân vật, phục bút, trục thời gian, kinh nghiệm duyệt v.v. từ store

### 3.5 Chuyển giao và khôi phục

- `internal/orchestrator/handoff_policy.go`
- `internal/orchestrator/recovery_engine.go`

Tác dụng:

- Ở giai đoạn truyện dài/viết lại/duyệt thì ưu tiên dựa vào handoff
- Khi khôi phục thì ghép gói chuyển giao có cấu trúc vào prompt

### 3.6 Khả năng quan sát

- `internal/orchestrator/run.go`
- `internal/orchestrator/runtime.go`
- `internal/entry/tui/panels.go`

Tác dụng:

- Ghi lại các sự kiện viết lại ngữ cảnh
- Xuất ra tên chiến lược, biến động token, lượng tin nhắn được giữ
- Để TUI thấy được ngữ cảnh hiện tại đang là `projected` hay `compacted`

## 4. ContextManager được lắp thế nào

Writer đi qua `newContextManager` (mỗi lần spawn thì factory dựng lại theo cửa sổ của model hiện tại). Trước khi nghỉ, Coordinator đi qua cùng factory đó, cấu hình của nó được giữ lại trong bảng dưới để đối chiếu lịch sử.

Các tham số then chốt của `contextManagerConfig` hiện tại:

- `ContextWindow`
  Tổng cửa sổ ngữ cảnh của model.

- `ReserveTokens`
  Token chừa lại cho đầu ra của model.

- `KeepRecentTokens`
  Ngân sách cho phần đuôi tin nhắn gần nhất mà việc nén cố giữ lại.

- `ToolMicrocompact`
  Cấu hình vi-nén cho kết quả tool.

- `ExtraStrategies`
  Chiến lược nén thêm phía dự án. Hiện Writer dùng để treo `StoreSummaryCompact`.

- `Summary`
  Cấu hình của `FullSummary`, gồm prompt tự định nghĩa và post-summary hook.

Các giá trị cấu hình thực tế hiện tại:

| Tham số | Writer | Coordinator (đã nghỉ, đối chiếu lịch sử) |
|------|--------|-------------|
| ReserveTokens | 16.384 | 32.000 |
| KeepRecentTokens | 20.000 | 30.000 |
| CommitOnProject | false | true |
| IdleThreshold | 5min | không có |
| ExtraStrategies | StoreSummaryCompact | không có |
| Summary Prompt tự định nghĩa | bản tự sự tiểu thuyết | mặc định (bản trợ lý code) |

Ngưỡng kích hoạt nén = `ContextWindow - ReserveTokens`. Ví dụ cửa sổ 128K thì Writer kích hoạt ở ~112K.

Thứ tự đường ống chiến lược của Writer hiện tại là:

1. `ToolResultMicrocompact`
2. `LightTrim`
3. `StoreSummaryCompact`
4. `FullSummary`

Thứ tự này có hàm ý rõ ràng:

- Dùng cách rẻ nhất để dọn tiếng ồn của tool trước
- Rồi cắt các khối văn bản siêu dài
- Nếu dữ liệu store đủ thì nén có cấu trúc mà không tốn LLM
- Cuối cùng mới lùi về tóm tắt bằng LLM

## 5. Tác dụng của từng chiến lược

### 5.1 ToolResultMicrocompact

Vị trí hiện thực:

- `../agentcore/context/strategy_tool.go`

Tác dụng:

- Dọn các `tool_result` trong lịch sử
- Thay các kết quả tool cũ bằng văn bản chỗ giữ ngắn gọn

Giá trị:

- Nội dung tool trả về thường có thể tích lớn, mật độ thông tin thấp
- Rất nhiều kết quả tool cũ chỉ là "tiếng ồn của quá trình", không phải ký ức của tiểu thuyết

Đặc điểm cấu hình hiện tại của Writer:

- Đã đặt `IdleThreshold = 5m`

Điều này nghĩa là:

- Nếu tin nhắn assistant gần nhất đã rảnh vượt ngưỡng
- Thì sẽ giảm số lượng kết quả tool cũ được giữ một cách mạnh tay hơn

Tình huống áp dụng:

- Nhiều lượt `novel_context`
- Sau nhiều lượt tool read / check / draft

### 5.2 LightTrim

Vị trí hiện thực:

- `../agentcore/context/strategy_trim.go`

Tác dụng:

- Cắt các khối văn bản rất dài
- Giữ phần đầu và phần cuối, phần giữa thay bằng chỗ giữ

Giá trị:

- Giữ nguyên kết cấu tin nhắn
- Giá rẻ
- Rất phù hợp để xử lý chính văn chương siêu dài hoặc các đoạn đầu ra lớn

Tình huống áp dụng:

- Một tin nhắn đơn lẻ quá dài, nhưng chưa cần summary cả đoạn lịch sử

### 5.3 StoreSummaryCompact

Vị trí hiện thực:

- `internal/orchestrator/store_summary_strategy.go`
- `internal/orchestrator/store_summary_builder.go`

Tác dụng:

- Khi ngữ cảnh của Writer quá dài
- Thì ưu tiên dùng ký ức có cấu trúc trong store đã lưu bền để thay các tin nhắn cũ
- Không gọi LLM

Nó không phải tóm tắt hội thoại, mà là "thay thế bằng ký ức có cấu trúc".

Các dữ liệu cốt lõi hiện được giữ gồm:

- Tiến độ hiện tại
- Tóm tắt các chương gần nhất
- Kế hoạch chương hiện tại
- Dàn ý chương hiện tại
- Tóm tắt cung hiện tại
- Tóm tắt tập hiện tại
- Ảnh chụp nhân vật
- Phục bút đang hoạt động
- Các vấn đề duyệt còn phải sửa
- Trục thời gian gần nhất
- Luật văn phong

Tiền đề kích hoạt:

- Chương hiện tại lớn hơn 1
- Store đã có đủ tóm tắt lịch sử
- Và chương hiện tại có ít nhất dữ liệu trạng thái làm việc
  - `chapter_plan` hoặc `current_outline`

Giá trị:

- Giảm số lần nén bằng LLM
- Tránh việc thông tin then chốt của tiểu thuyết bị trôi lệch khi tóm tắt
- Để ký ức dài hạn ưu tiên dựa vào sự thật đã xuống đĩa chứ không phải lịch sử chat

Vì sao chỉ dùng cho Writer:

- Đây là chiến lược nghiệp vụ tiểu thuyết, không phải chiến lược của framework tổng quát
- Mẫu ngữ cảnh của Editor / Architect thì khác (tác vụ một lần, áp lực cửa sổ nhỏ)
- Kiểm chứng trước ở Writer — nơi cần ký ức sáng tác liên tục nhất — là hợp lý nhất

### 5.4 FullSummary

Vị trí hiện thực:

- `../agentcore/context/strategy_summary.go`
- `../agentcore/context/summary_run.go`

Tác dụng:

- Khi mấy tầng trên vẫn chưa đủ thì dùng model để sinh `ContextSummary`
- Giữ phần đuôi tin nhắn gần nhất
- Biến phần ngữ cảnh sớm hơn thành một checkpoint có cấu trúc

Chỗ Writer khác với bản trợ lý code mặc định:

- Writer dùng summary prompt tự định nghĩa
- Nội dung tóm tắt yêu cầu rõ ràng phải giữ:
  - Tiến độ hiện tại
  - Trạng thái tức thời của nhân vật
  - Phục bút và đầu mối đang hoạt động
  - Phản hồi duyệt và các vấn đề còn phải sửa
  - Văn phong và nhịp
  - Các quyết định then chốt
  - Bước tiếp theo
  - Ngữ cảnh then chốt

Giá trị:

- Là chiến lược đỡ lưng cuối cùng
- Ngay cả khi dữ liệu store không đủ thì vẫn duy trì được tính liên tục nhờ LLM

### 5.5 Cầu chì (Circuit Breaker)

Vị trí hiện thực:

- `../agentcore/context/engine.go`

Tác dụng:

- Khi việc nén thất bại liên tiếp tới ngưỡng (mặc định 3 lần) thì bỏ qua việc nén của lượt hiện tại
- Khi bỏ qua thì vẫn phát `RewriteEvent` (`Reason = "circuit_breaker"`)
- TUI sẽ hiện scope là "Bỏ qua do ngắt mạch"
- Dùng chế độ nửa mở: bỏ qua một lượt rồi lần sau sẽ thử lại, thành công thì reset, lại thất bại thì lại bỏ qua

Vì sao cần:

- Việc tóm tắt bằng LLM có thể thất bại liên tiếp vì mạng, model từ chối v.v.
- Không có cầu chì thì mỗi lượt Project đều thử rồi thất bại, phí lời gọi API
- Trong phiên viết truyện dài thì phần phí đó cộng dồn lại

Tra lỗi:

- Nếu TUI liên tục hiện "Bỏ qua do ngắt mạch" thì nghĩa là đường tóm tắt bằng LLM có vấn đề
- Kiểm các sự kiện viết lại ngữ cảnh có `reason=circuit_breaker` trong slog
- Cầu chì không ảnh hưởng `StoreSummaryCompact` (nó không gọi LLM)

### 5.6 Ước lượng token (nhận biết CJK)

Vị trí hiện thực:

- `../agentcore/context/usage.go`

Tác dụng:

- Mọi việc kiểm soát ngân sách, thời điểm kích hoạt nén đều dựa vào việc ước lượng token
- `estimateTextTokens` tự phát hiện văn bản có chủ yếu là ký tự CJK hay không
- Văn bản CJK chiếm chủ đạo: `runes × 1.5`
- Văn bản ASCII chiếm chủ đạo: `bytes / 4`

Vì sao không dùng được `bytes/4` chuẩn:

- Tiếng Trung UTF-8 một chữ = 3 byte
- `bytes/4` sẽ ước một chữ Hán thành 0,75 token, trong khi thực tế khoảng 1,5 token
- Ước thấp 2 lần sẽ làm việc kích hoạt nén trễ nghiêm trọng

Phạm vi ảnh hưởng:

- `EstimateTokens` (một tin nhắn đơn)
- `EstimateTotal` (danh sách tin nhắn)
- `EstimateContextTokens` (ước lượng lai: Usage do LLM báo lên + ước lượng phần tin nhắn ở đuôi)
- Việc cắt theo ngân sách trong `store_summary_builder.go`

Chú ý: args của ToolCall là JSON (ASCII chiếm chủ đạo), vẫn dùng `bytes/4`, không bị phần điều chỉnh cho CJK ảnh hưởng.

## 6. Vì sao Writer có hai bộ "ký ức sau khi nén"

Writer hiện có hai đường trông na ná nhau nhưng trách nhiệm khác nhau:

### 6.1 StoreSummaryCompact

Trách nhiệm:

- Thay trực tiếp các tin nhắn cũ trong quá trình nén

Đặc điểm:

- Xảy ra trước `FullSummary`
- Không tốn LLM
- Dùng store để thay phần lịch sử sớm hơn

### 6.2 writerRestorePack

Vị trí hiện thực:

- `internal/orchestrator/writer_restore.go`

Trách nhiệm:

- Nối thêm một restore message sau `FullSummary`

Đặc điểm:

- Xảy ra sau khi nén bằng LLM
- Tiêm qua `PostSummaryHook`
- Dùng để bổ sung những thông tin có cấu trúc mà Writer buộc phải thấy khi khôi phục để sáng tác tiếp

Vì sao cần cả hai:

- `StoreSummaryCompact` không phải lúc nào cũng trúng
  - Ví dụ ở chương 1 hoặc khi dữ liệu store chưa đủ
- `FullSummary` dù làm tốt cỡ nào cũng có thể bỏ sót thông tin chính xác trong store
- Nên restore pack làm lớp bảo hiểm cuối cùng

Hiện hai cái đã dùng chung `store_summary_builder.go` để tránh trôi lệch tiêu chí.

## 7. Tác dụng của novel_context

Vị trí hiện thực:

- `internal/tools/novel_context.go`
- `internal/tools/novel_context_builders.go`

`novel_context` không phải chiến lược nén, nó là "bộ lắp ghép ngữ cảnh có cấu trúc" lúc chạy.

Nó chia dữ liệu trong store thành mấy loại:

- `working_memory`
  - Kế hoạch chương hiện tại
  - Dàn ý chương hiện tại
  - Tóm tắt các chương gần nhất
  - Trục thời gian
  - checkpoint
  - previous tail

- `episodic_memory`
  - Trạng thái nhân vật
  - Trạng thái quan hệ
  - Các biến động trạng thái gần nhất
  - Phục bút

- `reference_pack`
  - Các thiết định và dữ liệu tham chiếu ổn định hơn

- `selected_memory`
  - Một lượng nhỏ ký ức quan trọng được chọn ra theo tác vụ hiện tại

Giá trị:

- Nó quyết định phần ngữ cảnh tiểu thuyết có cấu trúc thật sự "mớm cho model" ở mỗi lượt
- `StoreSummaryCompact` không gọi chính nó, nhưng dùng lại cùng loại nguồn dữ liệu và cùng lối lắp ghép với nó

## 8. ContextProfile và MemoryPolicy

Vị trí hiện thực:

- `internal/domain/runtime.go`

### 8.1 ContextProfile

Tác dụng:

- Quyết kích thước cửa sổ nạp theo tổng số chương

Luật hiện tại:

- `<= 15` chương
  - Tóm tắt `10` chương gần nhất
  - Trục thời gian `10` chương gần nhất

- `<= 50` chương
  - Tóm tắt `5` chương gần nhất
  - Trục thời gian `8` chương gần nhất

- `> 50` chương
  - Tóm tắt `3` chương gần nhất
  - Trục thời gian `5` chương gần nhất
  - Bật tóm tắt phân tầng

Giá trị:

- Kiểm soát quy mô ngữ cảnh
- Tránh nhồi toàn bộ lịch sử vào prompt khi viết truyện dài

### 8.2 MemoryPolicy

Tác dụng:

- Viết ra tường minh chiến lược dùng ngữ cảnh hiện tại
- Cấp cho `novel_context` xuất ra
- Cấp cho logic handoff / reminder / chẩn đoán dùng

Các trường then chốt:

- `SummaryWindow`
- `TimelineWindow`
- `LayeredSummaries`
- `SummaryStrategy`
- `HandoffPreferred`
- `ReadOnlyThreshold`

Giá trị:

- Biến câu "hệ thống hiện tại nên dùng ký ức thế nào" từ logic ngầm thành chiến sách tường minh lúc chạy

## 9. Tác dụng của handoff

Vị trí hiện thực:

- `internal/orchestrator/handoff_policy.go`

Khi tác phẩm vào giai đoạn dài hơn, phức tạp hơn, phụ thuộc nhiều hơn vào các hiện vật có cấu trúc thì hệ thống sẽ nghiêng về handoff.

handoff pack sẽ ghi lại:

- Giai đoạn và flow hiện tại
- Vị trí chương kế tiếp
- Lần nộp gần nhất
- Lần duyệt gần nhất
- Tóm tắt gần nhất
- memory policy hiện tại
- Câu hướng dẫn khôi phục

Giá trị:

- Khi khôi phục sau khi bị ngắt thì không dựa vào lịch sử chat
- Ở các tình huống viết lại, duyệt, truyện dài thì ưu tiên dựa vào các hiện vật có cấu trúc

## 10. Khả năng quan sát và tra lỗi

### 10.1 Sự kiện viết lại ngữ cảnh

Vị trí hiện thực:

- `internal/orchestrator/run.go`

Mỗi lần viết lại ngữ cảnh đều xuất ra qua `contextRewriteCallback`:

- `reason`
- `strategy`
- `committed`
- `tokens_before`
- `tokens_after`
- `messages_before`
- `messages_after`
- `compacted_count`
- `kept_count`
- `split_turn`
- `incremental`
- `summary_runes`
- `duration_ms`

Phần này đồng thời vào:

- `slog`
- hàng đợi runtime boundary
- Sự kiện `COMPACT` của TUI

### 10.2 Trong TUI thấy được gì

TUI sẽ trình bày:

- Token ngữ cảnh hiện tại (kèm màu đổi dần theo độ khỏe)
- context window
- scope ngữ cảnh hiện tại (gồm cả "Bỏ qua do ngắt mạch")
- Tên chiến lược của lần gần nhất
- Số lượng summary

Ý nghĩa màu của tỉ lệ phần trăm ngữ cảnh (hiện thực ở `internal/entry/tui/layout.go`):

| Màu | Điều kiện | Ý nghĩa |
|------|------|------|
| Xanh | < 70% | Dư dả, còn xa ngưỡng nén |
| Vàng | 70-85% | Gần ngưỡng nén |
| Đỏ | > 85% | Sắp nén hoặc đang nén |

Nhãn tiếng Việt của Scope:

| Scope | Hiển thị | Ý nghĩa |
|-------|------|------|
| baseline | Cơ sở | Trạng thái bình thường |
| projected | Dự kiến | Xem trước phần nén tạm |
| compacted | Đã lưu | Việc nén đã có hiệu lực |
| recovered | Đã khôi phục | Khôi phục sau khi tràn |
| skipped | Bỏ qua do ngắt mạch | Việc nén bị cầu chì bỏ qua |

Giá trị:

- Phán nhanh được độ khỏe của ngữ cảnh hiện tại
- Khi vàng/đỏ thì có thể lường trước là việc nén sắp xảy ra
- Thấy "Bỏ qua do ngắt mạch" là biết đường tóm tắt bằng LLM có vấn đề

### 10.3 Có vấn đề thì xem đâu trước

#### Tình huống 1: Writer nén xong thì mất kế hoạch chương

Xem trước:

- `novel_context` có tiêm `chapter_plan` một cách ổn định không
- `store_summary_builder.go` có lấy được `chapterPlan` không
- `writerRestorePack` có được làm mới không

Các tệp trọng điểm:

- `internal/tools/novel_context_builders.go`
- `internal/orchestrator/store_summary_builder.go`
- `internal/orchestrator/session.go`

#### Tình huống 2: nén xong thì mất trạng thái nhân vật/phục bút

Xem trước:

- `LoadLatestSnapshots`
- `LoadActiveForeshadow`
- `store_summary_builder.go`
- Summary prompt của Writer có bị ghi đè không

#### Tình huống 3: nén thường xuyên mà luôn không trúng store_summary

Xem trước:

- Chương hiện tại có phải `<= 1` không
- Đã có recent summaries / arc / volume summary chưa
- Có tồn tại `chapter_plan` hoặc `current_outline` không
- Cái mà `writer.Context.Strategy` ghi lại cuối cùng có phải `full_summary` không

#### Tình huống 4: khôi phục xong thì ngữ cảnh không đủ

Xem trước:

- handoff có được sinh ra không
- restore pack có được làm mới không
- recovery prompt có tiêm handoff không

#### Tình huống 5: kết quả tool quá nhiều làm ngữ cảnh phình ra

Xem trước:

- `ToolResultMicrocompact` có trúng không
- `IdleThreshold` có hiệu lực không

## 11. Các lựa chọn đánh đổi của phần hiện thực hiện tại

### Các hướng đã chốt là giữ

1. Không nhồi logic nghiệp vụ tiểu thuyết vào `agentcore`
2. Ưu tiên dựa vào store có cấu trúc, không dựa vào lịch sử chat
3. Writer dùng prompt tóm tắt riêng cho tiểu thuyết
4. Việc nén và khôi phục cố dùng chung builder để tránh trôi lệch tiêu chí

### Các hạn chế hiện vẫn cố ý giữ

1. `StoreSummaryCompact` chỉ dùng cho Writer
2. Chương 1 sẽ không trúng store-based compact
3. Khi dữ liệu store không đủ thì vẫn lùi về `FullSummary`
4. `writerRestorePack` là phần bù kiểu nối thêm, không thay thế `FullSummary`

Các hạn chế này không phải khiếm khuyết, mà là biên được đặt ra ở giai đoạn hiện tại để kiểm soát độ phức tạp.

## 12. Tóm lại một câu

Việc quản lý ngữ cảnh của dự án này không đơn giản là "nén hội thoại dài cho ngắn lại", mà là:

`Ưu tiên dùng ký ức tiểu thuyết có cấu trúc để duy trì tính liên tục, chỉ khi cần thiết mới để LLM đi tóm tắt hội thoại; và ở cả ba khâu nén, khôi phục, chuyển giao thì đều cố dựa vào cùng một bộ hiện vật đã lưu bền.`

Nếu về sau bạn muốn sửa hệ thống này thì hãy giữ ba điều dưới đây trước:

1. Đừng để ký ức then chốt của Writer lại chỉ dựa vào lịch sử chat nữa.
2. Đừng để tiêu chí của `store_summary` và `writer_restore` phân nhánh.
3. Khi có vấn đề về tính liên tục thì hãy kiểm xem các hiện vật có cấu trúc đã vào ngữ cảnh chưa, rồi mới quyết có sửa prompt hay không.
