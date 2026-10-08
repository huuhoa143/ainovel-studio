package serve

import (
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/huuhoa143/ainovel-studio/internal/host/exp"
	"github.com/huuhoa143/ainovel-studio/internal/host/imp"
	"github.com/huuhoa143/ainovel-studio/internal/host/sim"
	"github.com/huuhoa143/ainovel-studio/internal/store"
)

// Ba luồng cần tệp: nhập truyện ngoài, mô phỏng văn phong, xuất bản.
//
// # Vì sao TẢI LÊN chứ không chọn đường dẫn trên máy chủ
//
// Người dùng chọn tải lên, và lý do đứng vững: `PRODUCT.md` ghi bối cảnh là engine chạy
// "trên máy mình HOẶC trên VPS riêng". Với ca VPS thì tệp nằm ở máy người dùng còn studio ở
// máy khác, nên một cây thư mục của máy chủ sẽ chỉ vào những tệp họ không có.
//
// # Vì sao đợi xong rồi trả, không stream
//
// Ba luồng này trả `<-chan Event`. Bản này VÉT cạn channel rồi trả toàn bộ nhật ký một lượt.
// Chức năng đủ — chỉ là hiện muộn hơn. Stream đòi một kênh SSE thứ hai có vòng đời riêng và
// phải hòa với kênh sự kiện đang có; đó là việc mua sự mượt, không mua tính năng.
//
// Cái giá ĐO ĐƯỢC và được nói ra: nhập một cuốn dài có thể chạy vài phút, nên yêu cầu HTTP
// treo lâu. Đây là lý do `handleNhap` không đặt hạn thời gian riêng — hạn duy nhất là
// `ReadHeaderTimeout` của server, cố ý không phủ phần thân.

// gioiHanTaiLen là hạn kích thước một lượt tải lên.
//
// 64 MiB: một cuốn tiểu thuyết dạng .txt hiếm khi quá 5 MiB, còn thư mục ngữ liệu mô phỏng
// nhiều chương có thể lớn hơn. Không giới hạn thì một yêu cầu duy nhất ăn hết RAM của process
// đang giữ cả engine — và ở đây engine chạy CÙNG process, nên hết RAM là mất cả cuốn sách
// đang viết, không chỉ mất một request.
const gioiHanTaiLen = 64 << 20

// nhanTep nhận các tệp tải lên vào một thư mục tạm.
//
// Trả cả thư mục để bên gọi dọn: `defer os.RemoveAll` ở bên gọi chứ không ở đây, vì tệp còn
// phải sống qua cả lượt chạy của engine.
func nhanTep(r *http.Request, truong string) (thuMuc string, duong []string, err error) {
	if err := r.ParseMultipartForm(gioiHanTaiLen); err != nil {
		return "", nil, fmt.Errorf("đọc tệp tải lên: %w", err)
	}
	tep := r.MultipartForm.File[truong]
	if len(tep) == 0 {
		return "", nil, fmt.Errorf("không có tệp nào ở trường %q", truong)
	}
	thuMuc, err = os.MkdirTemp("", "ainovel-taiLen-*")
	if err != nil {
		return "", nil, err
	}
	for _, h := range tep {
		p, err := luuMotTep(thuMuc, h)
		if err != nil {
			_ = os.RemoveAll(thuMuc)
			return "", nil, err
		}
		duong = append(duong, p)
	}
	return thuMuc, duong, nil
}

// luuMotTep ghi một tệp tải lên, dùng tên đã LÀM SẠCH.
//
// `filepath.Base` là phần bắt buộc: `Filename` do client đặt nên nó có thể là
// `../../.ssh/authorized_keys`. Không có nó thì một lượt tải lên ghi được ra ngoài thư mục
// tạm — và server này chạy dưới quyền người dùng thật.
func luuMotTep(thuMuc string, h *multipart.FileHeader) (string, error) {
	ten := filepath.Base(filepath.FromSlash(h.Filename))
	if ten == "" || ten == "." || ten == string(filepath.Separator) {
		ten = "tai-len"
	}
	src, err := h.Open()
	if err != nil {
		return "", err
	}
	defer src.Close()

	duong := filepath.Join(thuMuc, ten)
	dst, err := os.OpenFile(duong, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return "", err
	}
	defer dst.Close()
	if _, err := io.Copy(dst, io.LimitReader(src, gioiHanTaiLen)); err != nil {
		return "", err
	}
	return duong, nil
}

// vetSuKien vét cạn một channel sự kiện thành nhật ký đọc được.
//
// Dùng chung cho cả ba luồng vì cả ba trả cùng kiểu `sim.Event`/`imp.Event` với cùng hình
// dạng ba trường. Một hàm cho cả ba là để nhật ký của chúng nhìn giống nhau trên giao diện —
// người vận hành không phải học ba cách đọc.
type dongNhatKy struct {
	// CongDoan là `Stage` của luồng — tên công đoạn, không phải mức nghiêm trọng.
	CongDoan string `json:"stage"`
	Chu      string `json:"text"`
	// HienTai/Tong là tiến độ trong công đoạn. Giữ lại vì nhập một cuốn dài chạy vài phút
	// và một nhật ký không có tiến độ thì không phân biệt được "đang chạy" với "treo".
	HienTai int    `json:"current,omitempty"`
	Tong    int    `json:"total,omitempty"`
	Muc     string `json:"level,omitempty"`
	Loi     bool   `json:"error,omitempty"`
}

// handleNhap — POST /api/books/{book}/import (multipart)
//
// Có `file` = nhập mới. KHÔNG có `file` = chạy tiếp lượt nhập đang dở (nút «Tiếp tục nhập»):
// lượt nhập dừng ở chỗ chờ người — xác nhận cách chia chương, hoặc chọn truyện gốc đã kết hay
// còn tiếp — và một lượt tải lên mới bị từ chối vì thư mục nhập đã có. Không có đường chạy tiếp
// thì cuốn sách kẹt: engine chặn viết khi còn một lượt nhập dở.
//
// Trường tùy chọn: `accept=true` chấp nhận cách chia chương đang chờ (đã xem trong nhật ký),
// `story=open|closed`, `guide`, `auto_confirm`, `continue`.
func (s *server) handleNhap(w http.ResponseWriter, r *http.Request) {
	p, err := s.may.dangMo(r.PathValue("book"))
	if err != nil {
		writeErr(w, maLoi(err), err)
		return
	}
	if err := r.ParseMultipartForm(gioiHanTaiLen); err != nil {
		writeErr(w, http.StatusBadRequest, fmt.Errorf("đọc tệp tải lên: %w", err))
		return
	}
	nguon := ""
	if len(r.MultipartForm.File["file"]) > 0 {
		thuMuc, duong, err := nhanTep(r, "file")
		if err != nil {
			writeErr(w, http.StatusBadRequest, err)
			return
		}
		defer os.RemoveAll(thuMuc)
		if len(duong) != 1 {
			writeErr(w, http.StatusBadRequest,
				fmt.Errorf("nhập truyện nhận đúng MỘT tệp, được %d", len(duong)))
			return
		}
		nguon = duong[0]
	}

	opts := imp.Options{
		SourcePath: nguon, // rỗng = chạy tiếp lượt nhập đang dở
		// Người dùng đã xem cách chia trong nhật ký rồi bấm chấp nhận — khác `auto_confirm` (uỷ
		// quyền trước khi thấy gì).
		AcceptSegmentation: r.FormValue("accept") == "true",
		// AutoConfirm theo lựa chọn tường minh của người dùng. KHÔNG mặc định true: `--yes`
		// là uỷ quyền mù (chấp nhận cách chia chương mà chưa xem), và bật ngầm nó sẽ khiến
		// một cuốn bị chia sai mà không ai kịp thấy.
		AutoConfirm:     r.FormValue("auto_confirm") == "true",
		StoryResolution: strings.TrimSpace(r.FormValue("story")),
		ContinueAfter:   r.FormValue("continue") == "true",
		Guidance:        strings.TrimSpace(r.FormValue("guide")),
	}
	if opts.StoryResolution != "" && opts.StoryResolution != "open" && opts.StoryResolution != "closed" {
		writeErr(w, http.StatusBadRequest,
			fmt.Errorf("story chỉ nhận open hoặc closed, được %q", opts.StoryResolution))
		return
	}

	ch, err := p.eng.ImportFrom(r.Context(), opts)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	nk, coLoi := vetImp(ch)
	writeJSON(w, map[string]any{"log": nk, "failed": coLoi})
}

// handleBoNhapDo — POST /api/books/{book}/import/discard (nút «Bỏ lượt nhập dở»)
//
// Bỏ lượt nhập dở hoặc đã hỏng, để cuốn sách hết bị chặn viết. Bất biến: không có gì để bỏ
// vẫn 200 với `discarded: false`. Đang có bước nhập (hay viết) chạy thì 409 — xóa thư mục dưới
// chân một bước đang ghi vào nó là hỏng cả hai.
func (s *server) handleBoNhapDo(w http.ResponseWriter, r *http.Request) {
	daBo, err := s.may.boNhapDo(r.PathValue("book"))
	if err != nil {
		writeErr(w, maLoi(err), err)
		return
	}
	writeJSON(w, map[string]any{"discarded": daBo})
}

// handleMoPhong — POST /api/books/{book}/simulate (multipart: file, nhiều tệp)
func (s *server) handleMoPhong(w http.ResponseWriter, r *http.Request) {
	p, err := s.may.dangMo(r.PathValue("book"))
	if err != nil {
		writeErr(w, maLoi(err), err)
		return
	}
	thuMuc, _, err := nhanTep(r, "file")
	if err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	defer os.RemoveAll(thuMuc)

	// `SimulateFrom` thay vì `Simulate`: bản gốc đọc `<CWD>/simulate` — một thư mục CHUNG
	// cho mọi tác phẩm và mọi lượt. Với web thì ngữ liệu do người dùng tải lên cho đúng lượt
	// này, nên nó phải nằm ở thư mục tạm riêng.
	ch, err := p.eng.SimulateFrom(r.Context(), thuMuc)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	nk, coLoi := vetSim(ch)
	writeJSON(w, map[string]any{"log": nk, "failed": coLoi})
}

// handleNhapHoSoMoPhong — POST /api/books/{book}/simulate/profile (multipart: file)
func (s *server) handleNhapHoSoMoPhong(w http.ResponseWriter, r *http.Request) {
	p, err := s.may.dangMo(r.PathValue("book"))
	if err != nil {
		writeErr(w, maLoi(err), err)
		return
	}
	thuMuc, duong, err := nhanTep(r, "file")
	if err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	defer os.RemoveAll(thuMuc)
	if len(duong) != 1 {
		writeErr(w, http.StatusBadRequest,
			fmt.Errorf("nhập hồ sơ mô phỏng nhận đúng MỘT tệp, được %d", len(duong)))
		return
	}
	ch, err := p.eng.ImportSimulationProfile(r.Context(), duong[0])
	if err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	nk, coLoi := vetSim(ch)
	writeJSON(w, map[string]any{"log": nk, "failed": coLoi})
}

// handleXuatBan — POST /api/books/{book}/export → TẢI VỀ
//
// # Vì sao trả thẳng tệp chứ không trả đường dẫn
//
// `exp.Run` ghi ra một tệp trên máy CHỦ. Trả đường dẫn cho trình duyệt là trả một chuỗi vô
// dụng khi studio chạy trên VPS — đúng bối cảnh mà `PRODUCT.md` ghi. Nên xuất vào thư mục
// tạm rồi đẩy nội dung về theo phản hồi, và xóa tệp tạm sau đó.
// # Vì sao KHÔNG cần engine
//
// Xuất bản là phép ĐỌC: `exp.Run` chỉ cần `*store.Store` (xem Host.Export — nó không làm
// gì ngoài chuyển tiếp store), và tệp ra nằm trong thư mục tạm của hệ thống, không đụng
// vào thư mục truyện. Nên nó đi cùng đường với `/studio`, `/workshop`, `/chapters/{n}`:
// mở store đọc thẳng.
//
// Bản trước đòi `dangMo` và hỏng ở đúng ca thường gặp nhất: truyện ĐÃ XONG, mở lại studio
// hôm sau, engine chưa mở. Thẻ "Truyện đã hoàn thành" mời bấm "Xuất bản", trang Xuất bản
// vẽ nút bật sáng — bấm vào nhận "tác phẩm này chưa mở engine", mà truyện đã xong thì
// thanh dưới KHÔNG còn nút mở phiên nào để làm theo. Một ngõ cụt y hệt luồng "Viết thêm".
func (s *server) handleXuatBan(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("book")
	st, err := s.openBook(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, err)
		return
	}

	// ToLower, KHÔNG ToUpper: hằng của gói exp là chữ thường ("txt" / "epub",
	// exp/types.go). Bản trước viết hoa tham số rồi so với hằng chữ thường, nên
	// KHÔNG ca nào khớp và mọi lần xuất đều rơi về nhánh dự phòng TXT — kể cả khi
	// người dùng chọn EPUB. Hỏng im lặng: mã 200, tệp tải về bình thường, chỉ là
	// sai định dạng và sai cả phần đuôi tên tệp.
	dinhDang := exp.Format(strings.ToLower(strings.TrimSpace(r.URL.Query().Get("format"))))
	if dinhDang != exp.FormatTXT && dinhDang != exp.FormatEPUB {
		dinhDang = exp.FormatTXT
	}
	tu, _ := strconv.Atoi(r.URL.Query().Get("from"))
	den, _ := strconv.Atoi(r.URL.Query().Get("to"))
	tu, den = kepKhoangChuong(st, tu, den)

	thuMuc, err := os.MkdirTemp("", "ainovel-xuat-*")
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	defer os.RemoveAll(thuMuc)

	duoi := "txt"
	if dinhDang == exp.FormatEPUB {
		duoi = "epub"
	}
	raTep := filepath.Join(thuMuc, "xuat."+duoi)

	kq, err := exp.Run(r.Context(), exp.Deps{Store: st}, exp.Options{
		Format: dinhDang, OutPath: raTep, From: tu, To: den,
		// Overwrite: thư mục là tạm và tên do ta đặt, nên không có tệp nào của người dùng
		// để ghi đè. Đặt true để không hỏng vì một lần chạy trước sót lại.
		Overwrite: true,
	})
	if err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}

	b, err := os.ReadFile(raTep)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, fmt.Errorf("đọc tệp vừa xuất: %w", err))
		return
	}

	tenTruyen := ""
	if pr, err := st.Progress.Load(); err == nil && pr != nil {
		tenTruyen = pr.NovelName
	}
	w.Header().Set("Content-Type", loaiTep(duoi))
	w.Header().Set("Content-Disposition", dauTepXuat(id, tenTruyen, duoi))
	// Số chương bị bỏ qua đi theo header: chúng KHÔNG phải lỗi (chương chưa viết xong thì
	// exp.Run bỏ qua có chủ ý), nhưng người dùng cần biết bản tải về thiếu gì.
	if len(kq.Skipped) > 0 {
		w.Header().Set("X-Ainovel-Skipped", boQuaThanhChu(kq.Skipped))
	}
	w.Header().Set("X-Ainovel-Chapters", strconv.Itoa(kq.Chapters))
	if _, err := w.Write(b); err != nil {
		return // header đã gửi; chỉ còn cách im lặng
	}
}

// kepKhoangChuong kéo khoảng chương về phạm vi truyện THẬT CÓ. 0 nghĩa là "từ đầu" /
// "tới hết", đúng quy ước của exp.Options.
//
// `exp.Run` duyệt đúng khoảng được giao và xếp mọi chương chưa xong vào Result.Skipped —
// hợp lý khi khoảng nằm trong truyện, nhưng không ai lọc khoảng trước đó. Đo được: gõ
// "đến chương 99" trên truyện 4 chương trả về mã 200 kèm header liệt kê 5…99, và giao
// diện in "bỏ qua 96 chương chưa xong (4, 5, 6, 7…)" — 96 chương chưa từng được lên kế
// hoạch, nói như thể chúng tồn tại mà viết dở.
//
// Đọc được tiến độ thì kẹp; không đọc được thì giữ nguyên tham số (thà xuất thừa còn hơn
// từ chối một yêu cầu hợp lệ vì một tệp không đọc nổi).
func kepKhoangChuong(st *store.Store, tu, den int) (int, int) {
	if tu < 0 {
		tu = 0
	}
	if den < 0 {
		den = 0
	}
	p, err := st.Progress.Load()
	if err != nil || p == nil || p.TotalChapters <= 0 {
		return tu, den
	}
	if tu > p.TotalChapters {
		tu = p.TotalChapters
	}
	if den > p.TotalChapters {
		den = 0 // "tới hết"
	}
	return tu, den
}

// dauTepXuat dựng header Content-Disposition cho tệp xuất.
//
// Người dùng tải về một CUỐN TRUYỆN, nên tên tệp là tên truyện ("Tiếng Vọng Thời Gian Phố
// Cổ.txt"), không phải tên thư mục ("dong-ho-qua-lac.txt"). Tên thật đi ở `filename*` dạng
// RFC 5987 vì header HTTP là latin-1 — chữ có dấu đặt thẳng vào `filename=` sẽ ra rác. Còn
// `filename=` giữ tên thư mục (ASCII chắc chắn) cho trình duyệt không hiểu `filename*`.
func dauTepXuat(id, tenTruyen, duoi string) string {
	ascii := id + "." + duoi
	ten := tenTepAnToan(tenTruyen)
	if ten == "" {
		ten = id
	}
	return fmt.Sprintf("attachment; filename=%q; filename*=UTF-8''%s", ascii, urlHoa(ten+"."+duoi))
}

// tenTepAnToan bỏ những ký tự hệ điều hành không cho đặt trong tên tệp (/ \ : * ? " < > |
// và ký tự điều khiển), gộp khoảng trắng, và cắt ở 120 rune để không vượt giới hạn tên tệp.
func tenTepAnToan(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch {
		// Ký tự điều khiển (tab, xuống dòng) thành dấu cách chứ không bỏ hẳn: bỏ hẳn thì
		// "Tên<tab>có" dính thành "Têncó".
		case r < 0x20 || r == 0x7f, strings.ContainsRune(`/\:*?"<>|`, r):
			b.WriteRune(' ')
		default:
			b.WriteRune(r)
		}
	}
	ten := strings.Join(strings.Fields(b.String()), " ")
	ten = strings.Trim(ten, ". ")
	if r := []rune(ten); len(r) > 120 {
		ten = strings.TrimSpace(string(r[:120]))
	}
	return ten
}

func loaiTep(duoi string) string {
	if duoi == "epub" {
		return "application/epub+zip"
	}
	return "text/plain; charset=utf-8"
}

func urlHoa(s string) string {
	var b strings.Builder
	for _, c := range []byte(s) {
		if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') ||
			c == '-' || c == '.' || c == '_' || c == '~' {
			b.WriteByte(c)
			continue
		}
		fmt.Fprintf(&b, "%%%02X", c)
	}
	return b.String()
}

func boQuaThanhChu(n []int) string {
	s := make([]string, 0, len(n))
	for _, v := range n {
		s = append(s, strconv.Itoa(v))
	}
	return strings.Join(s, ",")
}

var errKenhRong = errors.New("luồng không phát sự kiện nào")

func vetSim(ch <-chan sim.Event) ([]dongNhatKy, bool) {
	var nk []dongNhatKy
	coLoi := false
	for ev := range ch {
		d := dongNhatKy{
			CongDoan: string(ev.Stage), Chu: ev.Message,
			HienTai: ev.Current, Tong: ev.Total,
		}
		if ev.Err != nil {
			d.Loi = true
			d.Chu = strings.TrimSpace(d.Chu + " " + ev.Err.Error())
			coLoi = true
		}
		nk = append(nk, d)
	}
	if len(nk) == 0 {
		nk = append(nk, dongNhatKy{CongDoan: "system", Chu: errKenhRong.Error(), Loi: true})
		coLoi = true
	}
	return nk, coLoi
}

func vetImp(ch <-chan imp.Event) ([]dongNhatKy, bool) {
	var nk []dongNhatKy
	coLoi := false
	for ev := range ch {
		d := dongNhatKy{
			CongDoan: string(ev.Stage), Chu: ev.Message,
			HienTai: ev.Current, Tong: ev.Total, Muc: ev.Level,
		}
		if ev.Err != nil {
			d.Loi = true
			d.Chu = strings.TrimSpace(d.Chu + " " + ev.Err.Error())
			coLoi = true
		}
		nk = append(nk, d)
	}
	if len(nk) == 0 {
		nk = append(nk, dongNhatKy{CongDoan: "system", Chu: errKenhRong.Error(), Loi: true})
		coLoi = true
	}
	return nk, coLoi
}
