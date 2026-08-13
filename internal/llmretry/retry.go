// Package llmretry là hạt nhân thử lại dùng chung cho mọi lời gọi model có cấu trúc
// (Arbiter, nhập truyện, mô phỏng, chuẩn hóa luật người dùng).
//
// Nó chỉ thử lại những lỗi mà bộ điều hợp model đánh dấu là retryable, tôn trọng
// `Retry-After`/lùi theo cấp số nhân, và đẩy tiến độ vào chuỗi quan sát sẵn có qua
// ToolProgress. Lỗi tài khoản, xác thực, quyền hạn trả về ngay.
//
// # Vì sao nó phải biết BỎ CUỘC
//
// Bản trước lặp vô hạn: `for retry := 1; ; retry++`, chỉ `context` mới dừng được. Với một lỗi
// thoáng qua thì đúng — nhưng ĐO ĐƯỢC trên máy thật, ca xấu là thế này:
//
//	22:00 SYSTEM Thử lại (lần 20): [codex/gpt-5.5] [429]: The usage limit has been
//	             reached (reset after 26m 54s)
//	21:59 SYSTEM Thử lại (lần 19): […cùng câu…]
//
// Provider nói thẳng "27 phút nữa hãy quay lại", còn engine gõ cửa mỗi phút — vì `retryDelay`
// kẹp mọi khoảng chờ về trần 60 giây, kể cả khi hint dài hơn. Lượt chạy giữ suất engine duy
// nhất (`soToiDa: 1`) suốt hơn 24 giờ, màn hình trông như đang tiến triển, và người vận hành
// không mở được cuốn khác.
//
// # Vì sao bỏ cuộc là ĐỦ, không cần thêm cơ chế nào
//
// Tầng dưới đã biết xử đúng: `engine.pauseWithNotify` tạm dừng lượt chạy, gửi thông báo và
// chờ người vào bấm Chạy lại — xem `internal/host/engine.go`. Nó chỉ chờ một thứ: một LỖI
// trả về thay vì một vòng lặp không bao giờ trả về. Nên chỗ sửa duy nhất là ở đây, và cả bốn
// đường gọi cùng được sửa một lần.
//
// # Ba luật bỏ cuộc, và vì sao cần cả ba
//
//	mốc xa      provider cho mốc reset dài hơn `MocXaLaBo` → bỏ NGAY, không thử lần nào nữa
//	hết lượt    đã thử `LanToiDa` lần mà lỗi không đổi
//	hết giờ     tổng thời gian đã chờ vượt `ChoToiDa`
//
// Bỏ luật "mốc xa" thì ca đã đo ở trên vẫn phí 5 lần thử. Bỏ luật "hết lượt" thì provider nào
// không nói mốc reset sẽ lặp mãi như cũ. Luật "hết giờ" KHÔNG bắn với bộ mặc định — nó là lưới
// cho ai nâng `LanToiDa`, lý do đầy đủ ghi tại chính trường đó.
//
// # Còn MỘT vòng lặp không trần nữa, và gói này KHÔNG chạm tới
//
// `llmcontract.Execute` (`internal/llmcontract/execute.go`) có `for attempt := 1; ; attempt++`
// riêng, lặp trên lỗi ĐỊNH DẠNG ĐẦU RA — JSON hỏng, sai schema — cho tới khi context bị hủy.
// Triệu chứng người dùng thấy y hệt: engine quay mãi, không tiến, giữ suất engine duy nhất.
//
// Nó nằm ngoài phạm vi ở đây vì khác loại: lỗi ở đó là MODEL TRẢ SAI ĐỊNH DẠNG, và mỗi lần
// hỏi lại có kèm phản hồi lỗi nên lần sau khác lần trước — không phải "gõ lại cùng một cánh
// cửa đóng". Bài kiểm `TestDecide_InvalidOutputContinuesUntilContextCanceled` đang khóa hành
// vi ấy như một hợp đồng, nên đổi nó là một quyết định riêng, không phải một dòng thêm vào đây.
package llmretry

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/voocel/agentcore"
	"github.com/huuhoa143/ainovel-studio/internal/i18n"
)

// ChinhSach là luật bỏ cuộc. Giá trị 0 ở bất kỳ trường nào lấy mặc định của `chuan()`.
type ChinhSach struct {
	// LanToiDa là số lần THỬ LẠI tối đa (không tính lần gọi đầu).
	//
	// 5 là mặc định, và con số đó đến từ hình dạng của backoff chứ không phải một số tròn:
	// 1+2+4+8+16 = 31 giây chờ thật. Đủ qua mọi cú nấc ngắn (503 thoáng qua, mạng chớp,
	// throttle vài giây), chưa tới mức phí một phút cho một bức tường quota.
	LanToiDa int

	// ChoMoiLan là trần cho MỘT lần chờ. Giữ 60s như bản trước.
	ChoMoiLan time.Duration

	// ChoToiDa là trần cho TỔNG thời gian đã chờ qua mọi lần thử.
	//
	// Với BỘ MẶC ĐỊNH nó không bao giờ bắn, và điều đó là có chủ ý chứ không phải sót: chờ
	// nhiều nhất 60s một lần (`ChoMoiLan`) × 5 lần (`LanToiDa`) = đúng 300s = `ChoToiDa`, mà
	// điều kiện là `>` nên luật "hết lượt" luôn tới trước một nhịp. Nó là lưới cho ai NÂNG
	// `LanToiDa` — chẳng hạn đường nhập truyện chạy tay đáng chịu 30 lần thử, và lúc đó 30×60s
	// = nửa tiếng treo máy nếu không có trần tổng.
	//
	// Ghi ra vì một chú thích cũ ở đây từng biện minh nó bằng "5s × 200 lần", một kịch bản chỉ
	// tới được khi `LanToiDa` là 200 — tức nói về một cấu hình không phải mặc định mà không nói
	// rõ, và người đọc sau sẽ tưởng luật này đang tích cực bảo vệ.
	ChoToiDa time.Duration

	// MocXaLaBo — provider cho mốc reset dài hơn thế thì bỏ cuộc ngay.
	//
	// 2 phút, và đây là ranh giới giữa "chờ một chút" với "hết quota, quay lại sau". Không
	// ngủ đúng 27 phút rồi tự chạy tiếp, vì hai lý do: một engine ngủ 27 phút trông y hệt một
	// engine treo, và có gói quota reset theo NGÀY — lúc đó mốc là hàng giờ.
	MocXaLaBo time.Duration
}

func (cs ChinhSach) chuan() ChinhSach {
	if cs.LanToiDa <= 0 {
		cs.LanToiDa = 5
	}
	if cs.ChoMoiLan <= 0 {
		cs.ChoMoiLan = 60 * time.Second
	}
	if cs.ChoToiDa <= 0 {
		cs.ChoToiDa = 5 * time.Minute
	}
	if cs.MocXaLaBo <= 0 {
		cs.MocXaLaBo = 2 * time.Minute
	}
	return cs
}

// Quyet là ba lối ra của một lần xét lỗi.
type Quyet int

const (
	// QuyetTraNgay — lỗi không thử lại được (khóa API sai, 400, bộ lọc nội dung). Trả thẳng.
	QuyetTraNgay Quyet = iota
	// QuyetThuLai — chờ `PhanQuyet.Cho` rồi gọi lại.
	QuyetThuLai
	// QuyetBoCuoc — thử lại được về lý thuyết, nhưng không đáng hoặc không thể lúc này.
	QuyetBoCuoc
)

// PhanQuyet là kết quả của một lần xét, đủ để người gọi hành động mà không hỏi lại gì.
type PhanQuyet struct {
	Quyet Quyet
	// Cho chỉ có nghĩa khi `Quyet == QuyetThuLai`.
	Cho time.Duration
	// LyDo là câu nói cho NGƯỜI, chỉ có khi `Quyet == QuyetBoCuoc`. Nó đi thẳng vào thông báo
	// tạm dừng của engine, nên nó phải nói được vì sao và làm gì tiếp.
	LyDo string
}

// Xet quyết định làm gì với một lỗi — HÀM THUẦN, không đọc đồng hồ, không ngủ.
//
// Tách khỏi vòng lặp vì đây là toàn bộ phần có luật, và luật thì phải kiểm được bằng bảng ca.
// Nằm trong vòng lặp có `time.Sleep` thì mỗi ca phải trả bằng một bài kiểm chạy thật thời
// gian, và không ai viết đủ ca.
//
//   - `lanThu` là lần thử lại thứ mấy, đếm từ 1.
//   - `daCho` là tổng thời gian đã chờ qua các lần trước.
func Xet(err error, lanThu int, daCho time.Duration, cs ChinhSach) PhanQuyet {
	cs = cs.chuan()

	if err == nil {
		return PhanQuyet{Quyet: QuyetTraNgay}
	}
	// Hủy và hết hạn KHÔNG phải lỗi provider: chúng là ý muốn của người gọi hoặc trần thời
	// gian của chính lượt chạy, nên thử lại là chống lại chính lệnh vừa nhận.
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return PhanQuyet{Quyet: QuyetTraNgay}
	}
	if !thuLaiDuoc(err) {
		return PhanQuyet{Quyet: QuyetTraNgay}
	}

	// Luật 1 — MỐC XA. Xét TRƯỚC hai luật kia, vì đây là thông tin do chính provider đưa ra:
	// nó biết chắc khi nào mở lại, còn hai luật kia chỉ là phỏng đoán từ số lần thất bại.
	//
	// Phép so sánh nằm trong `choQuaLau` (cholau.go) chứ không viết tại chỗ: đường thử lại của
	// agentcore cưỡng chế CÙNG luật này qua `ChanChoLau`, và hai bản chép của một ngưỡng là hai
	// tầng bỏ cuộc ở hai mốc khác nhau — một triệu chứng gần như không đọc ra được từ màn hình.
	moc, qua := choQuaLau(err, cs)
	if qua {
		return PhanQuyet{Quyet: QuyetBoCuoc, LyDo: lyDoChoLau(moc)}
	}

	// Luật 2 — HẾT LƯỢT.
	if lanThu > cs.LanToiDa {
		return PhanQuyet{
			Quyet: QuyetBoCuoc,
			LyDo:  fmt.Sprintf(i18n.F("已重试 %d 次仍是同一错误"), cs.LanToiDa),
		}
	}

	cho := moc
	if cho <= 0 {
		cho = lui(lanThu-1, cs.ChoMoiLan)
	}
	if cho > cs.ChoMoiLan {
		cho = cs.ChoMoiLan
	}

	// Luật 3 — HẾT GIỜ. Xét SAU khi đã tính `cho`, vì nó hỏi "chờ thêm chừng này thì có vượt
	// trần không", chứ không hỏi về phần đã chờ.
	if daCho+cho > cs.ChoToiDa {
		return PhanQuyet{
			Quyet: QuyetBoCuoc,
			LyDo:  fmt.Sprintf(i18n.F("累计等待 %s 仍未调用成功"), gonGang(daCho)),
		}
	}

	return PhanQuyet{Quyet: QuyetThuLai, Cho: cho}
}

// LoiBoCuoc là lỗi trả về khi hạt nhân thôi thử lại.
//
// Bọc lỗi cuối cùng (`Unwrap`) chứ không thay thế nó, và đó là điều kiện đúng-sai: tầng trên
// phân loại lỗi bằng `errors.Is` với các sentinel của agentcore (`ErrProviderQuota`,
// `ErrProviderAuth`, `ErrContextOverflow`…) và bằng `contentFilterAdvice`. Nuốt lỗi gốc là
// làm mọi phép phân loại đó mù, và lời khuyên kèm theo thông báo tạm dừng biến mất.
type LoiBoCuoc struct {
	Cuoi   error
	LanThu int
	LyDo   string
}

// Error nói ra ĐỦ ba mảnh mà người vận hành cần: đã thử mấy lần, vì sao thôi, và lỗi gốc là
// gì. Câu này đi thẳng vào thông báo tạm dừng của engine, nên nó là toàn bộ những gì họ đọc
// được lúc quay lại sau vài giờ.
//
// Ca `LanThu == 0` có nhánh RIÊNG, không phải để đẹp: luật "mốc xa" chặn ngay ở lần xét đầu
// tiên nên không có lần thử lại nào, và một câu "thôi thử lại sau 0 lần" đọc ra như một lỗi
// của chính phần mềm.
func (e *LoiBoCuoc) Error() string {
	if e.LanThu <= 0 {
		return fmt.Sprintf(i18n.F("停止调用模型 (%s): %v"), e.LyDo, e.Cuoi)
	}
	return fmt.Sprintf(i18n.F("重试 %d 次后停止 (%s): %v"), e.LanThu, e.LyDo, e.Cuoi)
}

func (e *LoiBoCuoc) Unwrap() error { return e.Cuoi }

// Retryable luôn FALSE, và đó là cách lỗi này nói chuyện được với vòng lặp của agentcore.
//
// `agentcore.callLLMWithRetry` hỏi đúng một câu trước khi thử lại: `isRetryable(err)`, cài bằng
// `errors.As` nên nó bắt lớp NGOÀI CÙNG của chuỗi lỗi. Khai false ở đây là lối duy nhất để dừng
// vòng lặp ấy mà không phải chẻ nhánh agentcore — xem `ChanChoLau` trong cholau.go.
//
// Không mất gì: `Unwrap` vẫn trả lỗi gốc, nên `errors.Is` với các sentinel provider vẫn thấy
// đủ, và `IsFailoverEligible` (phân loại bằng văn bản + sentinel, không hỏi `Retryable`) cho ra
// đúng kết quả như trước.
func (e *LoiBoCuoc) Retryable() bool { return false }

// Generator là giao diện tối thiểu mà hạt nhân cần ở một model.
type Generator interface {
	Generate(context.Context, []agentcore.Message, []agentcore.ToolSpec, ...agentcore.CallOption) (*agentcore.LLMResponse, error)
}

// Event mô tả một lần thử lại sắp xảy ra.
type Event struct {
	Attempt int
	Delay   time.Duration
	Err     error
}

// Config là phần quan sát được và luật bỏ cuộc của một lượt gọi.
type Config struct {
	Agent   string
	OnRetry func(Event)
	// ChinhSach rỗng = dùng mặc định. Để ngỏ cho người gọi vì bốn đường gọi có mức chịu đựng
	// khác nhau: một lượt nhập truyện chạy tay đáng chờ lâu hơn một phán quyết giữa dây chuyền.
	ChinhSach ChinhSach
}

// Generate gọi model, thử lại theo `Xet`, và bỏ cuộc thay vì lặp vô hạn.
func Generate(ctx context.Context, model Generator, cfg Config, messages []agentcore.Message, opts ...agentcore.CallOption) (*agentcore.LLMResponse, error) {
	cs := cfg.ChinhSach.chuan()
	var daCho time.Duration

	for lanThu := 1; ; lanThu++ {
		resp, err := model.Generate(ctx, messages, nil, opts...)
		if err == nil {
			return resp, nil
		}
		// Kiểm context TRƯỚC khi xét lỗi: lượt chạy vừa bị dừng thì lỗi của provider chỉ là hệ
		// quả, và bọc nó thành `LoiBoCuoc` sẽ báo "thôi thử lại" cho một cú bấm Dừng có chủ ý.
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}

		pq := Xet(err, lanThu, daCho, cs)
		switch pq.Quyet {
		case QuyetTraNgay:
			return nil, err
		case QuyetBoCuoc:
			return nil, &LoiBoCuoc{Cuoi: err, LanThu: lanThu - 1, LyDo: pq.LyDo}
		}

		if cfg.OnRetry != nil {
			cfg.OnRetry(Event{Attempt: lanThu, Delay: pq.Cho, Err: err})
		}
		meta, _ := json.Marshal(struct {
			DelayMS int64 `json:"retry_delay_ms"`
		}{DelayMS: pq.Cho.Milliseconds()})
		agentcore.ReportToolProgress(ctx, agentcore.ProgressPayload{
			Kind:  agentcore.ProgressRetry,
			Agent: cfg.Agent,
			// MaxRetries là MẪU SỐ, và nó phải có mặt: thiếu nó thì giao diện in "Thử lại (lần
			// 20)" — một con số không có trần, đọc ra là "sẽ còn mãi". Có mẫu số thì thành
			// "lần 3/5", tức người vận hành biết bao giờ máy sẽ dừng và chờ mình.
			MaxRetries: cs.LanToiDa,
			Attempt:    lanThu,
			Message:    err.Error(),
			Meta:       meta,
		})

		timer := time.NewTimer(pq.Cho)
		select {
		case <-ctx.Done():
			timer.Stop()
			return nil, ctx.Err()
		case <-timer.C:
		}
		daCho += pq.Cho
	}
}

func thuLaiDuoc(err error) bool {
	var retryable agentcore.RetryableError
	return errors.As(err, &retryable) && retryable.Retryable()
}

// lui là lùi theo cấp số nhân 1s·2s·4s… kẹp ở `tran`.
//
// Vòng lặp nhân dần thay vì `1 << n`: `soLan` đến từ một vòng lặp không trần nên `1 << 64`
// tràn về 0 và biến trần thành "không chờ gì cả". Đã có bài kiểm canh đúng ca đó.
func lui(soLan int, tran time.Duration) time.Duration {
	d := time.Second
	for i := 0; i < soLan && d < tran; i++ {
		d *= 2
	}
	if d > tran {
		return tran
	}
	return d
}

// gonGang in một khoảng thời gian cho NGƯỜI đọc: "27 phút", không phải "26m54.000s".
//
// Câu này đi vào thông báo tạm dừng, nên nó phải đọc được ở mức liếc qua. Làm tròn LÊN: nói
// ngắn hơn thực tế là mời người dùng quay lại lúc cửa vẫn còn đóng.
func gonGang(d time.Duration) string {
	switch {
	case d <= 0:
		return i18n.F("时长未知")
	case d < time.Minute:
		return fmt.Sprintf(i18n.F("%d 秒"), int((d+time.Second-1)/time.Second))
	case d < time.Hour:
		return fmt.Sprintf(i18n.F("%d 分钟"), int((d+time.Minute-1)/time.Minute))
	default:
		return fmt.Sprintf(i18n.F("%.1f 小时"), d.Hours())
	}
}
