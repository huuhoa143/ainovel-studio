package serve

import (
	"net/http"

	"github.com/huuhoa143/ainovel-studio/internal/store"
)

// Tổng của CẢ xưởng: GET /api/workshop/cost.
//
// # Vì sao route này tồn tại, và vì sao nó không nằm trong /api/workshop
//
// Màn Quản lý và màn Cài đặt chung cần hai thứ mà `/api/workshop` không mang: chi phí bổ
// theo VAI trên toàn xưởng, và trạng thái "cuốn này có đang chờ tôi không" của từng cuốn.
// Cộng ở web thì mỗi lần mở màn là N lượt gọi, và hai người xem cùng lúc thấy hai con số
// khác nhau vì N lượt ấy không cùng một thời điểm. Nên phép cộng nằm ở server.
//
// Tách khỏi `/api/workshop` vì hai route có hai NHỊP khác nhau: `/api/workshop` bị dò lại
// theo chu kỳ (bộ chọn tác phẩm và slate đọc nó), còn tờ tổng này chỉ đọc khi người dùng mở
// màn. Gộp lại là bắt mọi lượt dò phải đọc thêm `meta/usage.json` + `meta/run.json` của từng
// cuốn — hai tệp mỗi cuốn, mỗi vòng dò, để phục vụ một bề mặt đang không mở.
//
// # Hai loại sự thật về "đang chờ bạn", và chúng KHÔNG được gộp
//
// `snapshot.advance` chỉ tồn tại khi engine ĐANG MỞ (xem chieuTruongSong trong snapshot.go):
// nó là lời engine tự khẳng định rằng nó đang đứng ở cửa. Vì `boMay.soToiDa == 1`, nhiều
// nhất MỘT cuốn trong cả xưởng nói được câu đó.
//
// Còn `meta/run.json` giữ Ý ĐỊNH ĐÃ KÝ của mọi cuốn, kể cả cuốn đã đóng engine từ lâu: chế
// độ nghiệm thu, một mốc tạm dừng đã đặt, một ý kiến can thiệp chưa tiêu thụ. Đó là sự thật
// trên đĩa, luôn đọc được.
//
// Route này trả loại thứ HAI, và tên trường nói rõ điều đó. Gọi nó là "đang chờ bạn" sẽ dựng
// một hàng chờ cho những cuốn không có engine nào đứng chờ cả — tức đúng lớp lỗi mà cả hợp
// đồng /studio giữ: đọc một giá trị trên đĩa thành một phép đo sống.
type WorkshopCostDoc struct {
	// Books cùng THỨ TỰ với `/api/workshop` (cả hai đi qua scanWorkshop), để giao diện ghép
	// được theo chỉ số mà không phải dựng map — và để hai bề mặt không xếp khác nhau.
	Books []WorkshopCostBook `json:"books"`

	// Overall / PerAgent / PerModel là tổng của mọi cuốn ĐỌC ĐƯỢC số liệu.
	//
	// Cộng float64 thẳng, KHÔNG làm tròn từng cuốn — khác luật của dải tổng ở màn Quản lý
	// (`tongXuong` trong web/lib/xuong.ts cộng theo xu), và khác có lý do: dải tổng đứng
	// TRÊN một bảng in chi phí từng cuốn hai chữ số, nên nó phải khớp thứ mắt cộng được. Tờ
	// này không đứng cạnh bảng đó; nó đứng cạnh phần bổ theo vai của CHÍNH nó, và ở đó điều
	// phải đúng là các phần cộng lại ra tổng. Làm tròn từng cuốn trước khi cộng sẽ làm các
	// thanh bổ theo vai không cộng ra được con số in ở tiêu đề.
	Overall  UsageTotals            `json:"overall"`
	PerAgent map[string]UsageTotals `json:"per_agent"`
	PerModel map[string]UsageTotals `json:"per_model"`

	// Counted là số cuốn có số liệu đã cộng vào; NoData là id của những cuốn không có.
	//
	// Bắt buộc phải có cả hai, và đây không phải chẩn đoán cho lập trình viên: một tổng
	// $7,37 trên một xưởng bốn cuốn nói hai điều rất khác nhau tuỳ vào việc nó cộng từ bốn
	// cuốn hay từ một cuốn. Không nói ra thì người vận hành đọc nó thành "cả xưởng tốn có
	// thế", trong khi ba cuốn kia chỉ là chưa đo được.
	Counted int      `json:"counted"`
	NoData  []string `json:"no_data"`

	// MissingAssistantUsage cộng dồn số lượt mô hình không trả usage trên toàn xưởng. Nó
	// lớn nghĩa là MỌI con số ở trên đều thiếu, và bề mặt phải nói ra thay vì để người vận
	// hành tin một tổng bị hụt — cùng lý lẽ đã ghi ở CostDoc.
	MissingAssistantUsage int `json:"missing_assistant_usage"`
}

// WorkshopCostBook là phần của một cuốn trong tờ tổng.
//
// Cố ý KHÔNG lặp lại các trường mà `/api/workshop` đã mang (tiến độ, số từ, nhịp, engine
// mở): hai bản sao của một con số thì có ngày lệch, và giao diện đã có cả hai tờ trong tay.
type WorkshopCostBook struct {
	ID string `json:"id"`

	// CostState là bốn ca của buildCost (ready | empty | no_file | stale_schema). Giữ nguyên
	// bốn ca chứ không hạ xuống một bool: "chưa chạy gì" và "có số liệu thuộc bản cũ" cho
	// cùng một ô trống nhưng khác nhau về việc người vận hành phải làm gì tiếp.
	CostState string  `json:"cost_state"`
	CostUSD   float64 `json:"cost_usd"`
	SavedUSD  float64 `json:"saved_usd"`

	// Ba trường dưới là Ý ĐỊNH ĐÃ KÝ trong meta/run.json — xem chú thích đầu tệp về vì sao
	// chúng KHÔNG phải "engine đang đứng ở cửa".
	//
	// AdvanceMode rỗng nghĩa là chưa có meta/run.json: cuốn chưa chạy engine lần nào. Khác
	// hẳn `auto` — cái đó là một chế độ đã chọn.
	AdvanceMode       string `json:"advance_mode"`
	AdvanceHold       bool   `json:"advance_hold"`
	AdvanceHoldReason string `json:"advance_hold_reason,omitempty"`

	// PendingSteer là BOOL, không phải chuỗi: một ý kiến can thiệp còn tồn là tin đủ để bật
	// một dấu ở bảng, còn nguyên văn của nó thuộc bề mặt của chính cuốn đó. Trả cả chuỗi ở
	// đây là chở toàn văn can thiệp của mọi cuốn vào một route dùng để quét bảng.
	PendingSteer bool `json:"pending_steer"`
}

// buildWorkshopCost cộng chi phí và đọc ý định của mọi cuốn dưới thư mục gốc.
//
// Một cuốn không đọc được KHÔNG làm cả tờ thất bại, và đó là quyết định: `scanWorkshop` đã
// bỏ qua thư mục không phải tác phẩm, nên tới đây một lỗi đọc là chuyện của MỘT cuốn (quyền
// tệp, JSON hỏng). Trả 500 cho cả xưởng vì một cuốn hỏng là lấy mất câu trả lời về chín cuốn
// còn lại — trong khi cuốn hỏng đã được nói ra qua `no_data`.
func buildWorkshopCost(root, only string) (*WorkshopCostDoc, error) {
	ws, err := scanWorkshop(root, only)
	if err != nil {
		return nil, err
	}

	doc := &WorkshopCostDoc{
		Books:    []WorkshopCostBook{},
		PerAgent: map[string]UsageTotals{},
		PerModel: map[string]UsageTotals{},
		NoData:   []string{},
	}

	for _, b := range ws.Books {
		dir, err := (&server{root: root}).bookDir(b.ID)
		if err != nil {
			// Tên đã đi qua scanWorkshop (nó là tên thư mục thật) nên nhánh này gần như không
			// tới được. Vẫn xử: bỏ cuốn đó và nói ra, chứ không im lặng cộng thiếu.
			doc.NoData = append(doc.NoData, b.ID)
			continue
		}
		st := store.NewStore(dir)

		hang := WorkshopCostBook{ID: b.ID}

		cost, err := buildCost(st)
		if err != nil {
			hang.CostState = ChiPhiChuaCoTep
			doc.NoData = append(doc.NoData, b.ID)
		} else {
			hang.CostState = cost.State
			hang.CostUSD = cost.Overall.CostUSD
			hang.SavedUSD = cost.Overall.SavedUSD
			// Chỉ cộng ca `ready`. `empty` là đã chạy mà chưa có số, `no_file` là chưa chạy,
			// `stale_schema` là có số mà bản này không đọc được — cả ba đều mang Overall
			// bằng zero-value, nên cộng chúng vào thì vô hại về SỐ nhưng làm `Counted` nói
			// dối: nó sẽ khẳng định đã đo được bốn cuốn khi chỉ đo được một.
			if cost.State == ChiPhiSanSang {
				doc.Counted++
				doc.Overall = congUsage(doc.Overall, cost.Overall)
				doc.MissingAssistantUsage += cost.MissingAssistantUsage
				congVaoMap(doc.PerAgent, cost.PerAgent)
				congVaoMap(doc.PerModel, cost.PerModel)
			} else {
				doc.NoData = append(doc.NoData, b.ID)
			}
		}

		// Ý định đã ký. Lỗi đọc run.json KHÔNG đẩy cuốn vào `no_data`: trường đó nói về số
		// liệu chi phí, và trộn hai loại thiếu vào một danh sách là làm cả hai không đọc ra
		// được. Cuốn chưa có run.json thì `AdvanceMode` rỗng, và bề mặt đã có câu cho ca đó.
		if meta, err := st.RunMeta.Load(); err == nil && meta != nil {
			hang.AdvanceMode = string(meta.AdvanceMode)
			hang.PendingSteer = meta.PendingSteer != ""
			if h := meta.AdvanceHold; h != nil {
				hang.AdvanceHold = true
				hang.AdvanceHoldReason = h.Reason
			}
		}

		doc.Books = append(doc.Books, hang)
	}

	return doc, nil
}

// congUsage cộng hai bộ cộng dồn.
//
// CacheCapable là OR, không phải cộng: nó là một tính chất của model, và "có cuốn nào dùng
// model biết cache không" là câu duy nhất có nghĩa ở tầng xưởng.
func congUsage(a, b UsageTotals) UsageTotals {
	return UsageTotals{
		Input:        a.Input + b.Input,
		Output:       a.Output + b.Output,
		CacheRead:    a.CacheRead + b.CacheRead,
		CacheWrite:   a.CacheWrite + b.CacheWrite,
		CostUSD:      a.CostUSD + b.CostUSD,
		SavedUSD:     a.SavedUSD + b.SavedUSD,
		CacheCapable: a.CacheCapable || b.CacheCapable,
		CacheBreaks:  a.CacheBreaks + b.CacheBreaks,
	}
}

// congVaoMap cộng từng khóa của `them` vào `dich`.
//
// `them` nil là ca thật (cuốn chưa có tệp usage) và vòng lặp trên map nil chạy không vòng
// nào, nên không cần chốt riêng.
func congVaoMap(dich map[string]UsageTotals, them map[string]UsageTotals) {
	for ten, t := range them {
		dich[ten] = congUsage(dich[ten], t)
	}
}

func (s *server) handleWorkshopCost(w http.ResponseWriter, r *http.Request) {
	doc, err := buildWorkshopCost(s.root, s.onlyBook)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, doc)
}
