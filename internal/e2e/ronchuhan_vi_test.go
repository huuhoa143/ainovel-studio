package e2e

// Kiểm bản sửa `non_cjk_fragments` (internal/rules/lint.go) qua ĐƯỜNG THẬT.
//
// # Vì sao cần tệp này khi đã có test đơn vị trong internal/rules/
//
// Test đơn vị gọi `rules.Lint(text)` rồi xem kết quả trả về. Nhưng luật này gây hại
// không phải ở chỗ trả về — nó gây hại ở chỗ ĐI TIẾP:
//
//	commit_chapter → checkRules → SaveRuleViolations → meta/rule_violations.jsonl
//	                                                 ↓
//	                     novel_context(chapter) → result["rule_violations"] → editor đọc
//
// Nên câu cần trả lời là "editor cuối cùng nhận được gì", và chỉ đi trọn đường ghi–
// nạp mới trả lời được. Cụ thể có một chi tiết chỉ lộ ra ở đường thật:
// novel_context.go:101 chỉ tiêm khóa `rule_violations` KHI `len(violations) > 0` —
// nên với văn sạch, phán quyết đúng không phải "danh sách rỗng" mà là "không có
// khóa đó". Test đơn vị trên `rules.Lint` không thể thấy điều đó.
//
// # Điều kiện quan trọng hơn: chiều nghịch
//
// Tắt tiếng ồn thì dễ — xóa luật đi là hết. Phép kiểm đáng giá là luật vẫn BẮT
// được lỗi lẫn ngôn ngữ thật, nếu không thì ta chỉ đổi một luật vô dụng thành một
// luật chết. Vì vậy mỗi ca "phải im" ở đây đều có ca "phải bắt" đi kèm, và ca bắt
// còn phải bắt ĐÚNG CHỖ: `Target` phải là chữ Hán thật, không phải mấy mảnh âm
// tiết vô nghĩa như bản cũ sinh ra ("kh, ng, xanh").

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/huuhoa143/ainovel-studio/assets"
	"github.com/huuhoa143/ainovel-studio/internal/i18n"
	"github.com/huuhoa143/ainovel-studio/internal/rules"
	storepkg "github.com/huuhoa143/ainovel-studio/internal/store"
	"github.com/huuhoa143/ainovel-studio/internal/tools"
)

// roVanRoChuHan là văn kể tiếng Việt bị rò đúng hai cụm chữ Hán — đúng hình dạng
// lỗi thật: mô hình đang viết tiếng Việt rồi chèn lẫn một từ tiếng Trung, chứ
// không phải cả đoạn tiếng Trung (ca cả đoạn thì mắt thường thấy ngay).
const roVanRoChuHan = `Bến đá nằm ở khúc sông gấp, nước đổi màu từ xanh sang nâu đục.

Ông Thản gác cầu ở đó ba mươi năm. Sáng nào ông cũng ra sớm, trong lòng 忐忑 không yên.

— Cầu này còn qua được không, bác?

— Qua được. Nhưng đừng đặt chân lên phiến thứ tư.

Người lạ nhìn xuống chân cầu, thấy khe nứt 深邃 mà hẹp.`

// roChuHanTrongVan là các chữ Hán có mặt trong roVanRoChuHan, để khẳng định
// Target chỉ đúng chỗ rò.
var roChuHanTrongVan = []string{"忐忑", "深邃"}

// ── Ca 1: văn sạch — phải im, và im tới tận tay editor ──

// TestRoVanSachKhongSinhViPhamNaoDenTayEditor đi trọn đường ghi–nạp cho văn tiếng
// Việt sạch: commit_chapter thật ghi xuống ổ, novel_context thật nạp lại.
func TestRoVanSachKhongSinhViPhamNaoDenTayEditor(t *testing.T) {
	if err := i18n.SetLocale(i18n.Vietnamese); err != nil {
		t.Fatal(err)
	}
	st, _ := toneStore(t, len(chuongSach)+2)
	refs := assets.Load("default", assets.LoadOptions{}).References

	for i, than := range chuongSach {
		ch := i + 1

		// (a) Giá trị commit_chapter trả về — bản sao mà writer thấy.
		vs := toneViPham(t, toneVietChuong(t, st, ch, than))
		if n := toneLoc(vs, "non_cjk_fragments"); len(n) > 0 {
			t.Errorf("chương %d (văn tiếng Việt sạch): commit_chapter trả về %s\n"+
				"internal/rules/lint.go — bộ nhận mảnh chữ vẫn đang khớp chữ Latin ở locale vi",
				ch, toneMoTa(n))
		}

		// (b) Đã ghi xuống ổ — bản mà editor thật sự đọc.
		luu := st.World.LoadRuleViolations(ch)
		if n := toneLoc(luu, "non_cjk_fragments"); len(n) > 0 {
			t.Errorf("chương %d: meta/rule_violations.jsonl còn %s", ch, toneMoTa(n))
		}
	}

	// (c) Đường NẠP LẠI. novel_context.go:101 chỉ tiêm khóa khi có violation, nên
	//     với văn sạch phán quyết đúng là "KHÔNG có khóa rule_violations", không
	//     phải "khóa đó rỗng". Đây là chỗ mà bản cũ đưa cho editor một "dẫn chứng"
	//     rỗng nghĩa trên từng chương.
	for ch := 1; ch <= len(chuongSach); ch++ {
		if co, mota := roViPhamTrongNguCanh(t, st, refs, ch); co {
			t.Errorf("chương %d: ngữ cảnh editor nhận vẫn có khối rule_violations: %s\n"+
				"văn sạch thì khối này phải KHÔNG tồn tại (novel_context.go:101 chỉ tiêm khi len>0)",
				ch, mota)
		}
	}
}

// ── Ca 2: chiều nghịch — phải bắt, và bắt đúng chỗ ──

// TestRoChuHanTrongVanVietPhaiBiBat là điều kiện quan trọng hơn ca 1: nếu ca này
// đỏ thì bản sửa chỉ tắt tiếng ồn mà không bắt được lỗi thật, tức ta đổi một luật
// vô dụng thành một luật chết.
func TestRoChuHanTrongVanVietPhaiBiBat(t *testing.T) {
	if err := i18n.SetLocale(i18n.Vietnamese); err != nil {
		t.Fatal(err)
	}
	st, _ := toneStore(t, 3)
	refs := assets.Load("default", assets.LoadOptions{}).References

	vs := toneViPham(t, toneVietChuong(t, st, 1, roVanRoChuHan))
	bat := toneLoc(vs, "non_cjk_fragments")
	if len(bat) == 0 {
		t.Fatalf("chương tiếng Việt có lẫn %v mà non_cjk_fragments KHÔNG bắt.\n"+
			"Bản sửa đã tắt được tiếng ồn nhưng làm luật chết theo: lẫn tiếng Trung là "+
			"đúng lỗi ngôn ngữ mà bản việt hóa cần bắt.\n"+
			"toàn bộ violation nhận được: %s", roChuHanTrongVan, toneMoTa(vs))
	}

	// Bắt đúng CHỖ, không chỉ đúng số. Bản cũ có Target = "kh, ng, xanh" — trông
	// như dẫn chứng cụ thể mà rỗng nghĩa; đó mới là phần gây hại nhất.
	t.Logf("BẮT ĐƯỢC: %s", toneMoTa(bat))

	target := ""
	for _, v := range bat {
		target += v.Target + " "
	}
	for _, han := range roChuHanTrongVan {
		if !strings.Contains(target, han) {
			t.Errorf("Target %q không nêu chữ Hán %q đã rò.\n"+
				"Dẫn chứng phải trỏ đúng chữ rò để editor sửa được; Target rỗng nghĩa "+
				"còn tệ hơn không có dẫn chứng", target, han)
		}
	}
	// Và không được nêu chữ tiếng Việt nào: nếu Target còn chứa âm tiết Việt thì
	// bộ nhận vẫn đang khớp cả nền văn.
	for _, viet := range []string{"Thản", "xanh", "cầu", "ng"} {
		if strings.Contains(target, viet) {
			t.Errorf("Target %q nêu cả chữ tiếng Việt %q — bộ nhận vẫn khớp nền văn, "+
				"không chỉ khớp chữ lạ", target, viet)
		}
	}

	// Đường nạp lại: lỗi thật thì PHẢI tới tay editor.
	co, mota := roViPhamTrongNguCanh(t, st, refs, 1)
	t.Logf("EDITOR NHẬN: co=%v %s", co, toneDau(mota, 300))
	if !co {
		t.Error("chương rò chữ Hán mà ngữ cảnh editor nhận KHÔNG có khối rule_violations — " +
			"phán quyết ghi xuống ổ nhưng không nạp lại được thì editor không bao giờ thấy")
	} else if !strings.Contains(mota, roChuHanTrongVan[0]) {
		t.Errorf("khối rule_violations tới tay editor không nêu chữ rò: %s", mota)
	}
}

// ── Ca 3: nhánh zh không được đổi hành vi ──

// TestRoNhanhTiengTrungGiuNguyenHanhVi là chốt chống hồi quy cho đường gốc: bản
// sửa chọn bộ nhận theo locale, nên phải chứng minh nhánh zh vẫn bắt đúng thứ nó
// sinh ra để bắt — mảnh chữ Latin lẫn trong văn tiếng Trung.
//
// Giữ ở tầng rules.Lint (không qua store): khẳng định ở đây là về hàm thuần, và
// dựng cả một store tiếng Trung chỉ để kiểm một regex là đổi chỗ dễ sai lấy chỗ
// khó sai.
func TestRoNhanhTiengTrungGiuNguyenHanhVi(t *testing.T) {
	// Lưu locale ĐANG chạy rồi trả lại đúng giá trị đó, không hằng hóa "vi".
	//
	// Trả về một hằng thì đúng chừng nào gói này còn chạy ở locale mặc định. Ngày
	// nào internal/e2e có tệp i18n_locale_pin_test.go ghim gói về zh — như 14 gói
	// khác đã có — thì dòng trả-về-hằng sẽ PHÁ GHIM cho mọi test chạy sau nó, và phá
	// theo cách tệ nhất: test gây lỗi thì xanh, test khác thì đỏ, nên người đọc đi
	// sửa sai chỗ. Bẫy đó đã mắc hai lần trong dự án này.
	truoc := i18n.Active()
	if err := i18n.SetLocale(i18n.Chinese); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := i18n.SetLocale(truoc); err != nil {
			t.Fatal(err)
		}
	})

	const vanTrungLanLatin = "他站在桥头，望着河水。这是一个 pattern 的问题。"
	vs := toneLoc(rules.Lint(vanTrungLanLatin), "non_cjk_fragments")
	if len(vs) == 0 {
		t.Fatalf("locale zh: văn tiếng Trung lẫn \"pattern\" mà non_cjk_fragments không bắt — "+
			"bản sửa theo locale đã làm hỏng nhánh gốc.\nvi phạm nhận được: %s",
			toneMoTa(rules.Lint(vanTrungLanLatin)))
	}
	if !strings.Contains(vs[0].Target, "pattern") {
		t.Errorf("locale zh: Target = %q, phải nêu \"pattern\"", vs[0].Target)
	}

	// Đối chứng trong cùng locale: văn tiếng Trung thuần phải im.
	if n := toneLoc(rules.Lint("他站在桥头，望着河水。"), "non_cjk_fragments"); len(n) > 0 {
		t.Errorf("locale zh: văn tiếng Trung thuần bị báo %s", toneMoTa(n))
	}
}

// ── Tiện ích ──

// roViPhamTrongNguCanh gọi novel_context THẬT rồi cho biết khối rule_violations có
// mặt hay không, kèm mô tả để thông báo lỗi chỉ được ra chỗ sai.
//
// Bóc bằng map chứ không bằng struct có kiểu: câu hỏi ở đây là "KHÓA có tồn tại
// không", mà unmarshal vào struct thì khóa thiếu và khóa rỗng cho cùng một
// zero-value — đúng cái phân biệt mà ca này cần.
func roViPhamTrongNguCanh(t *testing.T, st *storepkg.Store, refs tools.References, ch int) (bool, string) {
	t.Helper()
	out, err := tools.NewContextTool(st, refs, "default").
		Execute(context.Background(), toneArgs(t, map[string]any{"chapter": ch}))
	if err != nil {
		t.Fatalf("novel_context(chapter=%d): %v", ch, err)
	}
	var doc map[string]json.RawMessage
	if err := json.Unmarshal(out, &doc); err != nil {
		t.Fatalf("bóc đáp novel_context: %v", err)
	}
	raw, co := doc["rule_violations"]
	if !co {
		return false, "(không có khóa)"
	}
	return true, string(raw)
}
