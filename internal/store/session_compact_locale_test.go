package store

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"unicode"

	"github.com/voocel/agentcore"
	"github.com/huuhoa143/ainovel-studio/internal/domain"
	"github.com/huuhoa143/ainovel-studio/internal/i18n"
)

// Nhóm test này giữ BẤT BIẾN quan trọng nhất của lớp nén log phiên: phần chữ
// trong marker được dịch, còn tiền tố [session_compact: thì KHÔNG.
//
// Vì sao phải chốt bằng test: tiền tố ấy là giao thức, không phải chữ hiển thị.
// Hai chỗ dò nó bằng HasPrefix — IsCompacted trong chính file này, và
// internal/diag/redact.go khi quyết định giữ nguyên hay che một giá trị JSON.
// Dịch tiền tố thì cả hai cùng thôi nhận ra marker: IsCompacted trả false, còn
// redact.go rơi xuống nhánh sau và thấy chuỗi có chữ Việt + dấu cách nên đánh giá
// là văn xuôi rồi CHE luôn cả marker. Kết quả là log chẩn đoán mất chỗ tham chiếu
// tới bản nháp, mà không có lỗi nào nổ ra và không dòng log nào cảnh báo.
//
// Trước bộ test này, compactText / compactToolCall / CompactTag / IsCompacted
// không có một dòng test nào — tức đúng cơ chế dễ phá nhất lại là cơ chế không
// được canh.

func coChuHanTrongMarker(s string) bool {
	for _, r := range s {
		if unicode.Is(unicode.Han, r) {
			return true
		}
	}
	return false
}

func datLocaleStore(t *testing.T, loc i18n.Locale) {
	t.Helper()
	if err := i18n.SetLocale(loc); err != nil {
		t.Fatalf("SetLocale(%s): %v", loc, err)
	}
	// Trả lại ghim của package (i18n_locale_pin_test.go), không phải DefaultLocale.
	t.Cleanup(func() { _ = i18n.SetLocale(i18n.Chinese) })
}

// bocContentArgs lấy chuỗi placeholder mà compactToolCall đã ghi vào args.content.
func bocContentArgs(t *testing.T, tc *agentcore.ToolCall) string {
	t.Helper()
	var args map[string]json.RawMessage
	if err := json.Unmarshal(tc.Args, &args); err != nil {
		t.Fatalf("args không phải JSON object: %v", err)
	}
	raw, ok := args["content"]
	if !ok {
		t.Fatal("args thiếu trường content")
	}
	var s string
	if err := json.Unmarshal(raw, &s); err != nil {
		t.Fatalf("content không bị thay bằng placeholder chuỗi: %s", raw)
	}
	return s
}

func toolCall(name string, args string) *agentcore.ToolCall {
	return &agentcore.ToolCall{Name: name, Args: json.RawMessage(args)}
}

// markerCases dựng đủ sáu điểm sinh marker trong file này, qua đúng hàm mà
// production gọi — không tự ghép chuỗi.
func markerCases(t *testing.T) map[string]string {
	t.Helper()

	dai := strings.Repeat("a", 5000)    // vượt ngưỡng 4096
	ratDai := strings.Repeat("b", 9000) // vượt ngưỡng 8192 của nhánh default
	noiDung := strings.Repeat("Chữ ", 2000)

	novelCtx := fmt.Sprintf(`{"_loading_summary":"nạp 3 chương","pad":%q}`, dai)

	return map[string]string{
		"read_chapter":    compactText(agentcore.RoleTool, "read_chapter", noiDung),
		"default_qua_dai": compactText(agentcore.RoleTool, "check_consistency", ratDai),
		"novel_context":   compactText(agentcore.RoleTool, "novel_context", novelCtx),
		"draft_chapter_co_so_chuong": bocContentArgs(t, compactToolCall(
			toolCall("draft_chapter", fmt.Sprintf(`{"chapter":3,"content":%q}`, noiDung)))),
		// content là object chứ không phải chuỗi → đi nhánh nhãn dự phòng "第N章正文",
		// đúng chỗ vừa được bọc i18n.
		"draft_chapter_content_object": bocContentArgs(t, compactToolCall(
			toolCall("draft_chapter", fmt.Sprintf(`{"content":{"body":%q}}`, dai)))),
		"save_foundation": bocContentArgs(t, compactToolCall(
			toolCall("save_foundation", fmt.Sprintf(`{"type":"premise","content":%q}`, dai)))),
	}
}

// TestMarkerNenGiuTienToOMoiNgonNgu: ở mọi ngôn ngữ, mọi marker phải còn tiền tố
// và còn được IsCompacted nhận ra.
func TestMarkerNenGiuTienToOMoiNgonNgu(t *testing.T) {
	for _, loc := range []i18n.Locale{i18n.Chinese, i18n.Vietnamese} {
		t.Run(string(loc), func(t *testing.T) {
			datLocaleStore(t, loc)
			cases := markerCases(t)
			if len(cases) != 6 {
				t.Fatalf("mong đợi 6 điểm sinh marker, dựng được %d", len(cases))
			}
			for ten, marker := range cases {
				if !strings.HasPrefix(marker, CompactTag) {
					t.Errorf("%s: mất tiền tố %q → redact.go sẽ che cả marker: %q", ten, CompactTag, marker)
				}
				if !IsCompacted(marker) {
					t.Errorf("%s: IsCompacted không nhận ra marker: %q", ten, marker)
				}
			}
		})
	}
}

// TestPhanChuTrongMarkerDuocDichConTienToThiKhong: nửa còn lại của bất biến —
// phần chữ phải thực sự đổi sang tiếng Việt, nếu không thì "giữ tiền tố" thành ra
// đúng một cách vô nghĩa vì chẳng có gì được dịch cả.
func TestPhanChuTrongMarkerDuocDichConTienToThiKhong(t *testing.T) {
	datLocaleStore(t, i18n.Chinese)
	zh := markerCases(t)

	if err := i18n.SetLocale(i18n.Vietnamese); err != nil {
		t.Fatalf("SetLocale(vi): %v", err)
	}
	vi := markerCases(t)

	// novel_context là marker duy nhất không có chữ Trung nào trong khuôn, nên nó
	// giống nhau ở hai ngôn ngữ — liệt kê tường minh để test không âm thầm bỏ qua
	// một marker đáng lẽ phải đổi.
	giongNhauLaDung := map[string]bool{"novel_context": true}

	for ten, markerVI := range vi {
		if coChuHanTrongMarker(markerVI) {
			t.Errorf("%s: marker tiếng Việt còn chữ Hán: %q", ten, markerVI)
		}
		if !strings.HasPrefix(markerVI, CompactTag) {
			t.Errorf("%s: tiền tố bị dịch mất: %q", ten, markerVI)
		}
		doi := markerVI != zh[ten]
		if giongNhauLaDung[ten] && doi {
			t.Errorf("%s: không có chữ Trung trong khuôn nhưng lại đổi theo ngôn ngữ\n zh=%q\n vi=%q", ten, zh[ten], markerVI)
		}
		if !giongNhauLaDung[ten] && !doi {
			t.Errorf("%s: catalog vi chưa dịch, marker vẫn nguyên tiếng Trung: %q", ten, markerVI)
		}
	}
}

// TestDonViDemLaTuKhongPhaiKyTu: ngưỡng 字 giữ nguyên số, chỉ đổi đơn vị sang
// "từ". Đo trên assets song song cho hệ số chữ Hán → chữ Việt ≈ 1,0, nên nhân
// chia lại ngưỡng là làm sai chứ không phải làm đúng. Test chốt việc con số đi
// qua marker không bị biến đổi.
func TestDonViDemLaTuKhongPhaiKyTu(t *testing.T) {
	datLocaleStore(t, i18n.Vietnamese)

	noiDung := strings.Repeat("Chữ ", 2000)
	soTu := domain.WordCount(noiDung)
	marker := compactText(agentcore.RoleTool, "read_chapter", noiDung)

	if !strings.Contains(marker, fmt.Sprintf("%d", soTu)) {
		t.Errorf("marker không mang đúng số từ %d: %q", soTu, marker)
	}
	if strings.Contains(marker, "ký tự") {
		t.Errorf("字 bị dịch thành \"ký tự\" — đó là nghĩa của 字符, không phải 字: %q", marker)
	}
}
