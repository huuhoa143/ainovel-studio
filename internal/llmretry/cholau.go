package llmretry

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/voocel/agentcore"
	"github.com/huuhoa143/ainovel-studio/internal/i18n"
)

// Chặn "cửa còn đóng lâu" ở tầng MODEL, để vòng lặp thử lại của agentcore cũng nghe được.
//
// # Vì sao gói này chưa đủ, dù `Xet` đã có luật mốc xa
//
// `Xet` chỉ cai quản `llmretry.Generate` — đường của Arbiter và các lời gọi có cấu trúc.
// Writer/Editor/Architect KHÔNG đi đường đó: chúng là subagent của agentcore, và mỗi lượt gọi
// model của chúng đi qua `agentcore.callLLMWithRetry` (`loop.go:463`) với vòng lặp riêng,
// `MaxRetries: 7` đặt ở `internal/agents/build.go`.
//
// ĐO ĐƯỢC trên máy thật sau khi bản vá `Xet` đã chạy:
//
//	00:15 SYSTEM Thử lại (6/7): [codex/gpt-5.5] [429]: The usage limit has been
//	             reached (reset after 13m 16s)
//
// Mẫu số 7 là dấu vân tay của vòng lặp agentcore, không phải của `Xet` (mẫu số 5). Vòng đó chỉ
// hỏi `isRetryable(err)` và kẹp mọi khoảng chờ về trần 60 giây (`defaultMaxRetryDelay`), nên
// một mốc reset 13 phút vẫn bị gõ đủ 7 lần. Rồi `engine.handleWorkerError` cho một lượt "thử
// lại miễn phí" — 7 lần nữa — mới tới Arbiter và mới dừng. Mười bốn lượt gọi cho một cánh cửa
// đã nói rõ khi nào mới mở.
//
// # Vì sao chặn ở đây chứ không sửa agentcore, và không bọc `ForRole`
//
// agentcore là phụ thuộc chỉ-đọc trong module cache; sửa nó là chẻ nhánh một thư viện để đổi
// một hằng số. Nhưng vòng lặp của nó có một cửa ĐÚNG để nói vào: nó chỉ thử lại khi
// `isRetryable(err)` — tức nếu lỗi tự khai "không đáng thử lại", nó thoát ngay ở lần đầu.
//
// Còn bọc `ChatModel` ở `ForRole*` bằng một kiểu mới thì HỎNG ÂM THẦM: sáu giao diện năng lực
// tùy chọn đang được ép kiểu trên đúng giá trị đó (`llm.CapabilityProvider`, `Info()`,
// `ProviderName()`, `ModelName()`, `StructuredOutputFacts()`, `JSONSchemaOverride()` — xem
// `agents/build.go:77`, `llmcontract/contract.go:84-94`, `bootstrap/models.go:285-296`). Một
// vỏ bọc thiếu bất kỳ cái nào trong đó vẫn biên dịch, chỉ là độ suy luận và giao thức đầu ra
// có cấu trúc lặng lẽ rơi về mặc định. `bootstrap.SwappableModel` đã cài đủ cả sáu, nên luật
// này được cắm vào chính nó — không sinh thêm một vỏ nào để phải đồng bộ.
//
// # Vì sao đánh dấu "không thử lại" mà KHÔNG giết failover
//
// `agentcore.IsFailoverEligible` phân loại bằng `errors.Is` trên các sentinel
// (`ErrProviderRateLimit`…), nó KHÔNG hỏi `Retryable()`. Vì `LoiBoCuoc.Unwrap` giữ nguyên lỗi
// gốc, chuỗi sentinel còn nguyên — nên đổi sang nhà cung cấp dự phòng vẫn chạy, chỉ có việc
// gõ lại cùng một cửa là thôi. Đó đúng là ranh giới muốn có: đổi cửa thì miễn phí và có ích,
// gõ lại thì không.

// ChanChoLau đánh dấu một lỗi là KHÔNG đáng thử lại khi nhà cung cấp đã nói rõ phải chờ lâu
// hơn `cs.MocXaLaBo`. Mọi lỗi khác trả về nguyên vẹn.
//
// Hàm THUẦN và lũy đẳng: gọi hai lần cho cùng một lỗi ra cùng một kết quả, nên cắm được ở
// nhiều tầng mà không sợ bọc chồng (`failoverModel` gọi lên trên một lỗi đã qua
// `SwappableModel` là ca thật).
func ChanChoLau(err error, cs ChinhSach) error {
	if err == nil {
		return nil
	}
	// Đã chặn rồi thì thôi — bọc chồng làm câu lỗi lặp hai lần và `LanThu` của lớp ngoài
	// ghi đè con số thật của lớp trong.
	var daChan *LoiBoCuoc
	if errors.As(err, &daChan) {
		return err
	}
	// Lỗi vốn đã không thử lại được thì không có gì để chặn: vòng lặp agentcore đã thoát ngay
	// ở lần đầu. Giữ nguyên hình dạng lỗi để tầng trên phân loại đúng như trước.
	if !thuLaiDuoc(err) {
		return err
	}
	moc, qua := choQuaLau(err, cs)
	if !qua {
		return err
	}
	return &LoiBoCuoc{Cuoi: err, LanThu: 0, LyDo: lyDoChoLau(moc)}
}

// choQuaLau là LUẬT "mốc xa", và nó chỉ được viết ở đây.
//
// Hai chỗ cưỡng chế luật này — `Xet` (đường llmretry) và `ChanChoLau` (đường agentcore) — đều
// gọi vào đây. Chép ngưỡng hay phép so sánh sang chỗ thứ hai là mở đường cho hai tầng bỏ cuộc
// ở hai mốc khác nhau, và triệu chứng của việc đó (một vai dừng, vai kia còn quay) gần như
// không đọc ra được từ màn hình.
func choQuaLau(err error, cs ChinhSach) (time.Duration, bool) {
	moc := MocChoLai(err)
	return moc, moc > cs.chuan().MocXaLaBo
}

func lyDoChoLau(moc time.Duration) string {
	return fmt.Sprintf(i18n.F("提供方要求等待 %s 后才能再次调用"), gonGang(moc))
}

// LocChoLau soi một dòng sự kiện stream và chặn đúng lỗi ấy trên đường đi.
//
// # Vì sao stream phải có đường riêng
//
// Writer chạy streaming: `agentcore.callLLM` luôn kết thúc bằng `callLLMStream` (`loop.go:686`).
// Ở đó một `StreamEventError` được TRẢ VỀ THÀNH LỖI của lượt gọi (`loop.go:769`), rồi mới tới
// `callLLMWithRetry` phân loại. Nên chặn ở giá trị trả về của `GenerateStream` là bỏ sót đúng
// đường mà 429 của Writer đi qua — chính đường đã đẻ ra "Thử lại (6/7)".
//
// Kênh ra có đệm và mọi lượt gửi đều canh `ctx.Done()`: `callLLMStream` RỜI BỎ kênh giữa chừng
// khi gặp lỗi (`return` bên trong `for … range`), nên một lượt gửi trần sẽ treo goroutine này
// vĩnh viễn ở mỗi lần stream hỏng.
func LocChoLau(ctx context.Context, nguon <-chan agentcore.StreamEvent, cs ChinhSach) <-chan agentcore.StreamEvent {
	ra := make(chan agentcore.StreamEvent, 100)
	go func() {
		defer close(ra)
		for ev := range nguon {
			if ev.Type == agentcore.StreamEventError && ev.Err != nil {
				ev.Err = ChanChoLau(ev.Err, cs)
			}
			select {
			case ra <- ev:
			case <-ctx.Done():
				return
			}
		}
	}()
	return ra
}
