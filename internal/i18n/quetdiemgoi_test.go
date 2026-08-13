package i18n

import (
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"
)

// Bộ quét mã nguồn canh lớp lỗi "đo trên CATALOG thay vì trên ĐIỂM GỌI".
//
// # Vì sao bộ quét này phải tồn tại
//
// Ba lần trong dự án này có người báo "việt hóa xong" dựa trên một phép đo sai
// đối tượng, và cả ba lần đối tượng bị đo sai đều là catalog:
//
//  1. "764 bản dịch chết" — đếm độ phủ trên catalog thay vì trên điểm gọi.
//  2. "14 chuỗi chưa phủ" — con số đó đo *chuỗi có trong catalog hay không*, chứ
//     không đo *chuỗi đã được BỌC hay chưa*. Đo lại đúng: 94 chỗ chưa bọc, 81
//     trong đó đã có bản dịch nằm không dùng. Ba chỗ nặng nhất là next_step gửi
//     cho MÔ HÌNH đọc rồi làm theo, hai lần mỗi chương.
//  3. Bọc lồng ở internal/host/imp/source.go — i18n.F ngoài nhận một chuỗi ghép
//     LÚC CHẠY nên nó tra một khóa *không thể tồn tại* trong catalog. Cả ba msgid
//     đều có bản dịch, nên mọi thống kê báo phủ 100% trong khi người dùng nhận
//     câu nửa Trung nửa Việt.
//
// Lớp thứ ba là lớp duy nhất mà một catalog ĐẦY ĐỦ vẫn không cứu được: khóa được
// dựng lúc chạy thì không có bản dịch nào khớp nó, dù dịch bao nhiêu cũng vậy.
//
// # Bốn luật ở đây
//
//	Luật 1  TestChuHanPhaiBocI18n     chuỗi Hán chưa bọc i18n.F/T
//	Luật 2  TestKhongBocLong          i18n.F/T nhận đối số dựng lúc chạy
//	Luật 3  TestKhongPhaGhimLocale    test đổi locale rồi trả về sai giá trị
//	Luật 4  TestHopDongDichGiuManh    mảnh chuỗi mà LOGIC phụ thuộc phải sống sót
//
// Luật 4 canh một lớp lỗi thứ tư phát hiện trong lúc dựng ba luật đầu; lý lẽ đầy
// đủ ở chú thích của nó.
//
// # Quan hệ với quetnguon_test.go
//
// quetnguon_test.go canh lớp khác — "dấu câu mang tính ngôn ngữ không đi qua
// catalog". Bộ này dùng lại kiến trúc go/ast của nó và dùng chung ba tiện ích
// (coChuHan, viTri, quetBoQua) để hai bộ canh không trôi lệch về phạm vi quét.
// Lý lẽ "vì sao go/ast chứ không quét theo dòng" nằm ở đầu tệp đó, không nhắc lại.
//
// # Vì sao mỗi luật tự khẳng định tiền đề
//
// Mỗi luật đều có một dòng "nếu quét được ít hơn N thì t.Fatal". Không phải cho
// đẹp: lỗi bài-kiểm-rỗng đã xảy ra thật trong dự án này — một bài kiểm so chuỗi
// xuống dòng dạng-nguồn với dạng-lúc-chạy nên cả hai bên đều sai, nó kiểm đúng 0
// mục và xanh suốt. Không có khẳng định tiền đề thì một bộ quét có thể đang canh
// hư không mà vẫn báo xanh, và đó là trạng thái tệ nhất: tệ hơn cả không có bộ
// quét, vì nó còn tạo cảm giác đã được canh.

// tepGo là một tệp nguồn đã phân tích.
type tepGo struct {
	rel string
	f   *ast.File
}

// napNguon nạp cây cú pháp của mã sản phẩm (laTest=false) hoặc của mã kiểm thử
// (laTest=true), theo đúng danh sách nhánh loại trừ của quetnguon_test.go.
//
// Tệp không phân tích được thì DỪNG chứ không bỏ qua: bộ canh mù với một tệp còn
// tệ hơn bộ canh báo đỏ, vì mù thì không ai biết.
func napNguon(t *testing.T, laTest bool) (*token.FileSet, []tepGo) {
	t.Helper()
	goc := filepath.Join("..", "..")
	fset := token.NewFileSet()
	var ra []tepGo

	err := filepath.WalkDir(goc, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			if _, bo := quetBoQua[d.Name()]; bo {
				return fs.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(p, ".go") {
			return nil
		}
		if strings.HasSuffix(p, "_test.go") != laTest {
			return nil
		}
		f, err := parser.ParseFile(fset, p, nil, 0)
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(goc, p)
		ra = append(ra, tepGo{rel: filepath.ToSlash(rel), f: f})
		return nil
	})
	if err != nil {
		t.Fatalf("nạp nguồn: %v", err)
	}
	return fset, ra
}

// napChuoi phân tích một mẩu nguồn trong bộ nhớ. Dùng cho các bài kiểm CÓ-RĂNG:
// chúng chạy đúng hàm quét mà bài kiểm toàn repo chạy, chỉ khác nguồn vào.
func napChuoi(t *testing.T, rel, src string) (*token.FileSet, []tepGo) {
	t.Helper()
	fset := token.NewFileSet()
	f, err := parser.ParseFile(fset, rel, src, 0)
	if err != nil {
		t.Fatalf("phân tích mẩu nguồn %s: %v", rel, err)
	}
	return fset, []tepGo{{rel: rel, f: f}}
}

// doiSoMsgid trả về đối số msgid của i18n.F(...) / i18n.T(...).
//
// Chỉ nhận dạng có tiền tố gói: trong chính gói i18n thì F/T được gọi trần, và
// gói đó không có literal Hán nào để canh — nhận cả dạng trần chỉ mở đường cho
// một hàm F/T cùng tên ở gói khác lọt vào.
func doiSoMsgid(c *ast.CallExpr) (ast.Expr, bool) {
	sel, ok := c.Fun.(*ast.SelectorExpr)
	if !ok {
		return nil, false
	}
	if sel.Sel.Name != "F" && sel.Sel.Name != "T" {
		return nil, false
	}
	if pkg, ok := sel.X.(*ast.Ident); !ok || pkg.Name != "i18n" {
		return nil, false
	}
	if len(c.Args) == 0 {
		return nil, false
	}
	return c.Args[0], true
}

// ==========================================================================
// LUẬT 1 — chuỗi Hán chưa bọc i18n.F/i18n.T
// ==========================================================================

// dulieuKhongPhaiChu miễn trừ những chỗ literal Hán là DỮ LIỆU, không phải chữ
// hiển thị. Khóa là {tệp, ký hiệu} — không phải {tệp, chuỗi} như quetnguon_test.go,
// và tuyệt đối không phải {tệp, dòng}.
//
// Ký hiệu viết được ở HAI độ mịn, và bộ quét tra độ mịn hơn trước:
//
//	"zhPatternDefs"        cả khai báo
//	"zhPatternDefs.name"   chỉ ô .name của khai báo đó
//
// # Vì sao khóa theo KÝ HIỆU chứ không theo chuỗi
//
// Những chỗ này là bảng dữ liệu 16–18 mục. Khóa theo chuỗi thì bảng miễn trừ dài
// 66 dòng và mỗi lần upstream thêm một từ vào bảng dò sáo ngữ là một dòng đỏ;
// khóa theo ký hiệu thì đơn vị miễn trừ trùng với ĐƠN VỊ SUY LUẬN — "cả bảng này
// là dữ liệu" là một câu đúng hoặc sai được, còn "chuỗi 不禁 này là dữ liệu" thì
// không tự đứng được, nó chỉ đúng vì cái bảng chứa nó là bảng dò.
//
// Khóa theo tên cũng hết hiệu lực đúng lúc cần: đổi tên một bảng dữ liệu là đúng
// lúc nên xét lại nó có còn là dữ liệu, và khi tên đổi thì miễn trừ mất hiệu lực
// nên có người phải xét lại thật.
//
// # Vì sao có độ mịn TRƯỜNG, và vì sao nó không phải chuyện thẩm mỹ
//
// Miễn trừ cả ký hiệu thì mọi TRƯỜNG trong đó được miễn theo, kể cả trường sẽ
// mọc ra sau. Với một struct trộn hai loại dữ liệu thì đó là miễn trừ quá tay:
// patternDef có `re` (biểu thức chính quy — dữ liệu thuần) và `name` (nhãn người
// đọc được, ĐI VÀO báo cáo qua PatternNames và PatternStat.Name). Hai trường, hai
// lý lẽ khác nhau, nên hai mục.
//
// Cái mua được không phải sự gọn gàng mà là: thêm một trường mới vào patternDef
// thì trường đó KHÔNG được miễn theo — nó phải tự có mục và tự có lý lẽ. Đúng chỗ
// mà một bảng dữ liệu lặng lẽ mọc thành bảng vừa-dữ-liệu-vừa-hiển-thị.
//
// # Đánh đổi còn lại, nói rõ
//
// Ở những mục còn khóa theo cả ký hiệu, một chuỗi HIỂN THỊ mới mọc thêm bên trong
// vẫn không bị bắt. Chấp nhận vì chúng là bảng dữ liệu thuần hoặc hàm nhận dạng
// thuần — không ai thêm thông báo người dùng vào giữa bảng từ gây mỏi. Nếu một ký
// hiệu ở đây lớn dần thành hàm vừa dò vừa báo thì phải tách nó ra, hoặc hạ nó
// xuống độ mịn trường, chứ không nới miễn trừ.
var dulieuKhongPhaiChu = map[[2]string]string{
	{"internal/rules/snapshot.go", "fatigueWords"}: "bảng từ gây mỏi nhánh zh; nhánh vi nằm " +
		"ngay dưới trong cùng hàm, chọn theo i18n.Active(). Bọc = dịch bảng DÒ sang tiếng Việt " +
		"rồi đem dò văn tiếng Trung.",

	{"internal/rules/snapshot.go", "forbiddenPhrases"}: "nhánh zh của cùng cơ chế; nhánh vi ngay " +
		"dưới CÓ bọc i18n.F. Chú thích tại chỗ ghi lại lần một nửa cơ chế chết vì bên map bị bỏ qua.",

	// zhPatternDefs khóa theo TRƯỜNG, không theo cả khai báo: struct patternDef trộn
	// hai loại dữ liệu có hai lý lẽ khác nhau, và trường thứ ba mọc ra sau không
	// được miễn theo.
	{"internal/stylestat/stylestat.go", "zhPatternDefs.re"}: "biểu thức chính quy dò sáo ngữ trong " +
		"văn MÔ HÌNH SINH ra. Đây là ngôn ngữ của NỘI DUNG, không phải của giao diện: người dùng " +
		"chạy giao diện tiếng Việt vẫn có toàn quyền viết truyện tiếng Trung. viPatternDefs là bản " +
		"song sinh theo CHỨC NĂNG, không phải bản dịch từng chữ.",

	{"internal/stylestat/stylestat.go", "zhPatternDefs.name"}: "nhãn lớp mẫu. Khác .re: nhãn này " +
		"NGƯỜI ĐỌC ĐƯỢC và nó đi ra ngoài — PatternNames() và PatternStat.Name. An toàn vì " +
		"profile() chỉ trả zhProfile khi i18n.Active()==Chinese, nên nhãn Hán không bao giờ tới " +
		"báo cáo ở locale vi; viPatternDefs mang nhãn tiếng Việt. Miễn trừ HẸP NHẤT trong bảng " +
		"này: nó dựa vào một điều kiện ở nơi khác (profile()), nên ai đổi cách chọn profile phải " +
		"quay lại đọc dòng này.",

	{"internal/stylestat/stylestat.go", "zhProfile.openingTime"}: "regex mốc thời gian mở chương " +
		"dạng Trung; viProfile.openingTime là bản song sinh, chọn theo i18n.Active().",

	{"internal/stylestat/stylestat.go", "zhProfile.titlePrefix"}: "regex nhận tiêu đề chương dạng " +
		"Trung; viProfile.titlePrefix là bản song sinh.",

	{"internal/stylestat/stylestat.go", "viProfile.titlePrefix"}: "nhánh vi CỐ Ý nhận thêm dạng " +
		"tiêu đề Trung (第…章): sách nhập từ nguồn tiếng Trung vẫn còn tiêu đề gốc, bỏ dạng zh thì " +
		"thống kê \"lẫn định dạng tiêu đề\" mù một nửa. Chú thích tại chỗ ghi lại.",

	{"internal/stylestat/stylestat.go", "gramEdgeStop"}: "tập rune hư từ/đại từ để loại n-gram " +
		"không phải cụm văn phong. Chỉ áp cho đoạn thuần chữ Hán (validGram chặn ngoài dải " +
		"0x4E00–0x9FFF), nên nó thuộc đường phân tích văn Trung.",

	{"internal/tools/premise_structure.go", "premiseHeadingAliases"}: "khóa map bóc tiêu đề khỏi " +
		"premise. Bí danh tiếng Việt nằm ngay trong cùng bảng — đây là ánh xạ nhiều-về-một CỐ Ý " +
		"song ngữ. Bọc = sách cũ có premise tiếng Trung không parse được nữa.",

	{"internal/domain/runtime.go", "ExtractNovelNameFromPremise"}: "switch name { case \"书名\", … } " +
		"nhận tên GIỮ-CHỖ mà mô hình chép lại từ prompt. So với chuỗi đã dịch thì không khớp cái " +
		"mô hình thật sự chép ra.",

	{"internal/agents/guard/subagent_guards.go", "NewEditorStopGuard"}: "so khớp mô tả TASK để " +
		"nhận việc được phái. Nhánh sống được ở locale vi là nhánh so TÊN TOOL (save_arc_summary); " +
		"hai chuỗi Hán ở đây là nhánh dự phòng cho task viết bằng văn xuôi Trung, và ở locale vi " +
		"chúng CHẾT. Bất biến giữ cho nhánh tên-tool sống nằm ở internal/agents/guard/" +
		"locale_invariant_test.go; tiền đề của bất biến đó do TestMsgidNeoPhaiCoTrongCatalog canh. " +
		"Đây là NỢ đã biết, không phải dữ liệu thuần.",

	{"internal/host/exp/txt.go", "chapterHeaderRe"}: "regex nhận tiêu đề chương dạng Trung; " +
		"chapterHeaderViRe ngay dưới là bản song sinh cho tiếng Việt.",

	{"internal/store/session.go", "chapterRe"}: "regex nhận tiêu đề chương dạng Trung; chapterViRe " +
		"khai cùng khối var là bản song sinh. Chú thích tại chỗ ghi lại vì sao cần cả hai.",

	{"internal/entry/tui/panels_sidebar.go", "renderAgentLine"}: "CỐ Ý so cả dạng đã dịch và dạng " +
		"thô: detail do tầng host đặt nên không kiểm soát được nó đã qua i18n chưa. So một dạng " +
		"thì điều kiện chết lặng ở đúng locale không khớp. Đây là MẪU ĐÚNG cho lớp lỗi mà luật 4 canh.",
}

// thongKe là số đếm để khẳng định tiền đề — xem chú thích đầu tệp.
type thongKe struct {
	soTep        int
	soGoiI18n    int
	soLiteralHan int
	soTrucTiep   int
	soGianTiep   int
	soMienTru    int
}

// TestChuHanPhaiBocI18n canh lớp lỗi "chuỗi hiển thị tiếng Trung không đi qua
// catalog vì chưa được BỌC".
//
// Đây là luật khó nhất trong bốn luật, và cái khó không nằm ở chỗ tìm literal Hán
// mà ở chỗ phân biệt CHỮ với DỮ LIỆU. Phần lớn literal Hán còn lại trong repo là
// dữ liệu hợp lệ — bảng dò sáo ngữ, khóa map parse tệp cũ, regex nhận tiêu đề
// chương — và bọc chúng phá logic mà không ai thấy. Hai cơ chế giữ cho luật này
// không báo bừa, và chúng khác nhau về BẢN CHẤT:
//
//   - dulieuKhongPhaiChu: bảng miễn trừ, cho những chỗ mà kết luận "đây là dữ
//     liệu" đòi hiểu ý định của con người. 12 mục, mỗi mục một lý do.
//   - thuBocGianTiep: MÃ HÓA MẪU, cho những chỗ mà "hợp lệ" là một tính chất
//     CẤU TRÚC máy đọc được. Không một mục miễn trừ nào.
//
// Ranh giới giữa hai cơ chế là điểm quan trọng nhất của luật này: cái gì máy suy
// ra được thì phải để máy suy, vì bảng liệt kê tay sẽ mục ruỗng.
func TestChuHanPhaiBocI18n(t *testing.T) {
	fset, teps := napNguon(t, false)
	viPham, tk := quetChuaBoc(fset, teps)

	// Khẳng định tiền đề. Ba con số, mỗi con số chặn một cách bộ quét có thể đang
	// canh hư không: đi lạc thư mục, doiSoMsgid hỏng, coChuHan hỏng.
	if tk.soTep < 100 {
		t.Fatalf("chỉ nạp được %d tệp .go sản phẩm — bộ quét lạc đường, bài kiểm rỗng nghĩa", tk.soTep)
	}
	if tk.soGoiI18n < 1500 {
		t.Fatalf("chỉ thấy %d lời gọi i18n.F/T — doiSoMsgid đã hỏng, bài kiểm rỗng nghĩa", tk.soGoiI18n)
	}
	if tk.soLiteralHan < 500 {
		t.Fatalf("chỉ thấy %d literal chứa chữ Hán — coChuHan đã hỏng, bài kiểm rỗng nghĩa", tk.soLiteralHan)
	}
	// Mẫu bọc-gián-tiếp phải còn sống. Nếu thuBocGianTiep hỏng thì luật này đỏ 23
	// dòng vào code ĐÚNG, và cách sửa nhanh nhất khi đó là đổ 23 mục vào bảng miễn
	// trừ — tức chính cái mục ruỗng mà cơ chế này tồn tại để tránh.
	if tk.soGianTiep < 20 {
		t.Fatalf("chỉ thấy %d literal bọc gián tiếp — thuBocGianTiep đã hỏng, mẫu bọc-ở-chỗ-dùng không còn được nhận ra", tk.soGianTiep)
	}

	if len(viPham) > 0 {
		t.Errorf("chuỗi Hán chưa bọc i18n.F/i18n.T (%d chỗ / %d literal Hán):\n  %s",
			len(viPham), tk.soLiteralHan, strings.Join(viPham, "\n  "))
	}
	t.Logf("%d tệp, %d lời gọi i18n.F/T, %d literal Hán: %d bọc trực tiếp, %d bọc gián tiếp, %d miễn trừ",
		tk.soTep, tk.soGoiI18n, tk.soLiteralHan, tk.soTrucTiep, tk.soGianTiep, tk.soMienTru)
}

// quetChuaBoc là thân của luật 1, tách ra để bài kiểm CÓ-RĂNG chạy đúng mã này.
func quetChuaBoc(fset *token.FileSet, teps []tepGo) ([]string, thongKe) {
	tk := thongKe{soTep: len(teps)}

	// Lượt một, TOÀN BỘ tập tệp: thu điểm bọc trực tiếp và tên định danh từng đi
	// qua i18n.F/T. Phải đi trước và phải toàn repo vì bảng nằm ở tệp này còn chỗ
	// bọc nằm ở tệp khác — statusDisplay khai ở entry/tui/theme.go, bọc ở
	// entry/tui/panels.go.
	bocTrucTiep := map[token.Pos]bool{}
	tenBoc := map[string]bool{}
	for _, tp := range teps {
		ast.Inspect(tp.f, func(n ast.Node) bool {
			c, ok := n.(*ast.CallExpr)
			if !ok {
				return true
			}
			arg, ok := doiSoMsgid(c)
			if !ok {
				return true
			}
			tk.soGoiI18n++
			switch v := arg.(type) {
			case *ast.BasicLit:
				bocTrucTiep[v.Pos()] = true
			case *ast.Ident:
				tenBoc[v.Name] = true
			case *ast.SelectorExpr:
				// i18n.F(disp.label) / i18n.F(e.cfg.header): tên TRƯỜNG là mối nối
				// giữa chỗ bọc và bảng khai báo literal.
				tenBoc[v.Sel.Name] = true
			}
			return true
		})
	}

	// Lượt hai: đánh dấu literal được bọc GIÁN TIẾP qua các định danh vừa thu.
	bocGianTiep := map[token.Pos]bool{}
	for _, tp := range teps {
		thuBocGianTiep(tp.f, tenBoc, bocGianTiep)
	}

	// Lượt ba: báo lỗi.
	bang := bangKieu(teps)
	var viPham []string
	for _, tp := range teps {
		kyHieu := banDoKyHieu(tp.f)
		truongCua := banDoTruong(tp, bang)
		ast.Inspect(tp.f, func(n ast.Node) bool {
			lit, ok := n.(*ast.BasicLit)
			if !ok || lit.Kind != token.STRING {
				return true
			}
			s, err := strconv.Unquote(lit.Value)
			if err != nil || !coChuHan(s) {
				return true
			}
			tk.soLiteralHan++
			if bocTrucTiep[lit.Pos()] {
				tk.soTrucTiep++
				return true
			}
			if bocGianTiep[lit.Pos()] {
				tk.soGianTiep++
				return true
			}
			ten := kyHieu.tim(lit.Pos())
			truong := truongCua[lit.Pos()]
			if laDuLieu(tp.rel, ten, truong) {
				tk.soMienTru++
				return true
			}
			nhan := ten
			if truong != "" {
				nhan = ten + "." + truong
			}
			viPham = append(viPham, viTri(fset, tp.rel, lit.Pos())+"  ["+nhan+"]  "+rutGon(s))
			return true
		})
	}
	return viPham, tk
}

// --------------------------------------------------------------------------
// Bọc GIÁN TIẾP — mã hóa mẫu "bọc ở chỗ dùng, không ở bảng"
// --------------------------------------------------------------------------

// thuBocGianTiep đánh dấu những literal Hán tuy không phải đối số của i18n.F/T
// nhưng ĐI QUA nó ở chỗ dùng.
//
// # Vì sao mẫu này tồn tại
//
// Bọc ở chỗ dùng chứ không ở bảng là CỐ Ý, không phải lười: bảng cấp package được
// khởi tạo lúc nạp gói, tức TRƯỚC khi locale được đặt, nên bọc tại bảng sẽ đóng
// băng chữ theo locale lúc đó. Bẫy này đã mắc một lần với statusDisplay — chú
// thích ở internal/entry/tui/panels.go:58 ghi lại: thanh trạng thái luôn hiện
// "就绪" dù đang ở tiếng Việt.
//
// # Vì sao MÃ HÓA MẪU chứ không liệt kê 23 ca
//
// Có 23 literal Hán theo mẫu này. Liệt kê từng ca sẽ mục ruỗng theo ba bước, và
// bước cuối mới là bước chết người: (1) mã mới viết ĐÚNG theo cùng mẫu vẫn bị gắn
// cờ; (2) người sau thêm mục 24, 25; (3) tới lúc bảng miễn trừ dài hơn cái nó
// canh thì có người tắt cả bộ quét. Nên ở đây mã hóa cái MẪU:
//
//  1. thu mọi định danh từng xuất hiện làm đối số của i18n.F/i18n.T (kể cả tên
//     TRƯỜNG khi đối số là selector: i18n.F(disp.label) → "label");
//  2. literal nằm ở chỗ mà một trong các định danh đó trỏ tới → bọc gián tiếp.
//
// Ba biến thể thật trong repo, và mối nối của mỗi biến thể:
//
//	i18n.F(writerSummarySystemPromptMsgid)  → TÊN khai báo   (ctxpack/restore.go, 4 hằng)
//	i18n.F(e.cfg.header)                    → KHÓA composite (host/stream_extract.go, 11 mục)
//	i18n.F(disp.label)                      → TRƯỜNG struct  (entry/tui/theme.go, 8 mục)
//
// # Giới hạn, nói thẳng
//
// Đây là phép xấp xỉ, không phải phân tích luồng dữ liệu thật: repo không có
// go/types trong đồ thị phụ thuộc, và kéo golang.org/x/tools vào chỉ để canh một
// luật là cái giá không tương xứng. Hướng sai của phép xấp xỉ là bỏ SÓT — một
// literal Hán nằm trong khai báo TRÙNG TÊN với thứ được bọc ở nơi khác sẽ được
// miễn oan. Chấp nhận được, vì cơ chế này để giảm báo bừa chứ không phải để bắt
// lỗi; cái bắt lỗi là bản thân luật 1.
//
// Hai chỗ CỐ Ý siết lại để bớt xấp xỉ:
//   - khóa của map KHÔNG được coi là tên trường (map[string]X: "READY" chỉ là
//     khóa), nên một khóa map trùng tên trường không mở đường miễn trừ;
//   - miễn trừ ở mức TRƯỜNG, không phải mức cả khai báo: trong statusDisplay chỉ
//     ô .label được miễn, ô .icon vẫn bị canh.
func thuBocGianTiep(f *ast.File, tenBoc map[string]bool, ra map[token.Pos]bool) {
	for _, d := range f.Decls {
		gd, ok := d.(*ast.GenDecl)
		if !ok || (gd.Tok != token.VAR && gd.Tok != token.CONST) {
			continue
		}
		for _, s := range gd.Specs {
			vs, ok := s.(*ast.ValueSpec)
			if !ok {
				continue
			}
			// (1) TÊN khai báo từng là đối số của i18n.F/T → cả khai báo là msgid.
			trung := false
			for _, n := range vs.Names {
				if tenBoc[n.Name] {
					trung = true
				}
			}
			if trung {
				danhDauChuoi(vs, ra)
				continue
			}
			// (2)+(3) đi xuống composite literal, nối theo TRƯỜNG/KHÓA.
			for _, v := range vs.Values {
				diXuongGiaTri(v, kieuGoc(v, vs.Type), tenBoc, ra)
			}
		}
	}
}

// truong là một trường struct đã làm phẳng (struct{a, b string} → hai mục).
type truong struct {
	ten  string
	kieu ast.Expr
}

func truongPhang(st *ast.StructType) []truong {
	var ra []truong
	if st.Fields == nil {
		return ra
	}
	for _, fl := range st.Fields.List {
		if len(fl.Names) == 0 { // trường nhúng
			ra = append(ra, truong{kieu: fl.Type})
			continue
		}
		for _, n := range fl.Names {
			ra = append(ra, truong{ten: n.Name, kieu: fl.Type})
		}
	}
	return ra
}

// kieuGoc chọn kiểu áp cho một biểu thức: kiểu tự khai của composite literal nếu
// có, ngược lại kiểu thừa hưởng từ ngữ cảnh (kiểu khai báo hoặc kiểu phần tử).
func kieuGoc(e ast.Expr, thuaHuong ast.Expr) ast.Expr {
	if cl, ok := e.(*ast.CompositeLit); ok && cl.Type != nil {
		return cl.Type
	}
	return thuaHuong
}

// diXuongGiaTri đi vào một giá trị nếu nó là composite literal.
func diXuongGiaTri(e ast.Expr, kieu ast.Expr, tenBoc map[string]bool, ra map[token.Pos]bool) {
	cl, ok := e.(*ast.CompositeLit)
	if !ok {
		return
	}
	diXuongComposite(cl, kieuGoc(cl, kieu), tenBoc, ra)
}

func diXuongComposite(cl *ast.CompositeLit, kieu ast.Expr, tenBoc map[string]bool, ra map[token.Pos]bool) {
	switch k := boLopBoc(kieu).(type) {
	case *ast.MapType:
		for _, e := range cl.Elts {
			kv, ok := e.(*ast.KeyValueExpr)
			if !ok {
				continue
			}
			// Khóa map KHÔNG phải tên trường — cố ý không xét kv.Key ở đây.
			diXuongGiaTri(kv.Value, k.Value, tenBoc, ra)
		}
	case *ast.ArrayType:
		for _, e := range cl.Elts {
			if kv, ok := e.(*ast.KeyValueExpr); ok { // mảng có chỉ số tường minh
				diXuongGiaTri(kv.Value, k.Elt, tenBoc, ra)
				continue
			}
			diXuongGiaTri(e, k.Elt, tenBoc, ra)
		}
	case *ast.StructType:
		tr := truongPhang(k)
		for i, e := range cl.Elts {
			if kv, ok := e.(*ast.KeyValueExpr); ok {
				ten := tenIdent(kv.Key)
				if tenBoc[ten] {
					danhDauChuoi(kv.Value, ra)
					continue
				}
				diXuongGiaTri(kv.Value, kieuTheoTen(tr, ten), tenBoc, ra)
				continue
			}
			if i >= len(tr) {
				continue
			}
			if tenBoc[tr[i].ten] {
				danhDauChuoi(e, ra)
				continue
			}
			diXuongGiaTri(e, tr[i].kieu, tenBoc, ra)
		}
	default:
		// Kiểu CÓ TÊN mà bộ quét không giải được (map[string]toolDisplay → Ident
		// "toolDisplay"): không biết danh sách trường, nhưng nếu composite literal
		// có KHÓA thì khóa chính là tên trường. Đây là đường đi của toolDisplays.
		//
		// Không giải tên kiểu qua bảng TypeSpec của gói: đường có-khóa đã phủ hết
		// ca thật, và giải tên kiểu đòi gom AST theo gói (kiểu có thể khai ở tệp
		// khác) — thêm một tầng có thể sai để đổi lấy độ phủ mà chưa ai cần.
		for _, e := range cl.Elts {
			kv, ok := e.(*ast.KeyValueExpr)
			if !ok {
				continue
			}
			if tenBoc[tenIdent(kv.Key)] {
				danhDauChuoi(kv.Value, ra)
				continue
			}
			diXuongGiaTri(kv.Value, nil, tenBoc, ra)
		}
	}
}

// boLopBoc bóc con trỏ và ngoặc để lấy kiểu thực.
func boLopBoc(e ast.Expr) ast.Expr {
	for {
		switch v := e.(type) {
		case *ast.ParenExpr:
			e = v.X
		case *ast.StarExpr:
			e = v.X
		default:
			return e
		}
	}
}

func tenIdent(e ast.Expr) string {
	if id, ok := e.(*ast.Ident); ok {
		return id.Name
	}
	return ""
}

func kieuTheoTen(tr []truong, ten string) ast.Expr {
	for _, t := range tr {
		if t.ten == ten {
			return t.kieu
		}
	}
	return nil
}

// danhDauChuoi đánh dấu mọi literal chuỗi trong một nhánh cây.
func danhDauChuoi(n ast.Node, ra map[token.Pos]bool) {
	ast.Inspect(n, func(x ast.Node) bool {
		if lit, ok := x.(*ast.BasicLit); ok && lit.Kind == token.STRING {
			ra[lit.Pos()] = true
		}
		return true
	})
}

// --------------------------------------------------------------------------
// Bản đồ ký hiệu — miễn trừ theo ĐƠN VỊ SUY LUẬN, không theo dòng
// --------------------------------------------------------------------------

type banDo struct{ khoang []khoangKyHieu }

type khoangKyHieu struct {
	dau, cuoi token.Pos
	ten       string
}

// tim trả tên ký hiệu HẸP NHẤT chứa vị trí. Hẹp nhất, không phải đầu tiên: một
// hằng khai bên trong thân hàm nằm trong cả hai khoảng, và tên đúng để miễn trừ
// là tên gần nó nhất.
func (b banDo) tim(p token.Pos) string {
	ten := ""
	rong := token.Pos(-1)
	for _, k := range b.khoang {
		if p < k.dau || p > k.cuoi {
			continue
		}
		if r := k.cuoi - k.dau; rong < 0 || r < rong {
			rong, ten = r, k.ten
		}
	}
	return ten
}

// banDoKyHieu dựng bản đồ vị trí → tên hàm/biến/hằng/kiểu cấp cao nhất.
func banDoKyHieu(f *ast.File) banDo {
	var b banDo
	them := func(ten string, n ast.Node) {
		if ten != "" && ten != "_" {
			b.khoang = append(b.khoang, khoangKyHieu{dau: n.Pos(), cuoi: n.End(), ten: ten})
		}
	}
	for _, d := range f.Decls {
		switch v := d.(type) {
		case *ast.FuncDecl:
			them(v.Name.Name, v)
		case *ast.GenDecl:
			for _, s := range v.Specs {
				switch sp := s.(type) {
				case *ast.ValueSpec:
					if len(sp.Names) > 0 {
						them(sp.Names[0].Name, sp)
					}
				case *ast.TypeSpec:
					them(sp.Name.Name, sp)
				}
			}
		}
	}
	return b
}

// --------------------------------------------------------------------------
// Bản đồ TRƯỜNG — để miễn trừ mịn hơn cả khai báo
// --------------------------------------------------------------------------

// bangKieu gom mọi struct khai trong cùng gói: {thư mục, tên kiểu} → StructType.
//
// Cần vì `zhPatternDefs` là `[]patternDef{{"nhãn", regexp.MustCompile(…)}, …}` —
// phần tử KHÔNG có khóa, nên tên trường chỉ suy được từ khai báo của patternDef.
// Đường có-khóa (toolDisplays) không cần bảng này; đường không-khóa thì bắt buộc.
//
// Khóa theo thư mục vì kiểu chỉ nhìn thấy được trong cùng gói, và kiểu có thể khai
// ở tệp khác cùng gói (patternDef khai cùng tệp, nhưng đừng dựa vào điều đó).
func bangKieu(teps []tepGo) map[[2]string]*ast.StructType {
	ra := map[[2]string]*ast.StructType{}
	for _, tp := range teps {
		thuMuc := filepath.ToSlash(filepath.Dir(tp.rel))
		for _, d := range tp.f.Decls {
			gd, ok := d.(*ast.GenDecl)
			if !ok || gd.Tok != token.TYPE {
				continue
			}
			for _, s := range gd.Specs {
				ts, ok := s.(*ast.TypeSpec)
				if !ok {
					continue
				}
				if st, ok := boLopBoc(ts.Type).(*ast.StructType); ok {
					ra[[2]string{thuMuc, ts.Name.Name}] = st
				}
			}
		}
	}
	return ra
}

// giaiKieu thay một tên kiểu bằng khai báo struct của nó, nếu giải được.
func giaiKieu(kieu ast.Expr, thuMuc string, bang map[[2]string]*ast.StructType) ast.Expr {
	id, ok := boLopBoc(kieu).(*ast.Ident)
	if !ok {
		return kieu
	}
	if st, co := bang[[2]string{thuMuc, id.Name}]; co {
		return st
	}
	return kieu
}

// banDoTruong ánh xạ vị trí literal chuỗi → tên TRƯỜNG struct chứa nó.
//
// Tồn tại để bảng miễn trừ viết được ở độ mịn trường ("zhPatternDefs.name"), tức
// để một struct trộn dữ liệu-thuần với nhãn-hiển-thị không bị miễn trừ cả cục.
// Xem chú thích của dulieuKhongPhaiChu để biết vì sao độ mịn đó đáng có.
//
// Trường ghi được là trường TRONG CÙNG, và literal nằm sâu trong một lời gọi vẫn
// được quy về trường chứa nó: `re: regexp.MustCompile("第…章")` ghi literal đó là
// trường `re`, vì cái quyết định nó là dữ liệu hay chữ là VAI của trường, không
// phải chuyện nó đi qua bao nhiêu lớp hàm.
func banDoTruong(tp tepGo, bang map[[2]string]*ast.StructType) map[token.Pos]string {
	ra := map[token.Pos]string{}
	thuMuc := filepath.ToSlash(filepath.Dir(tp.rel))
	for _, d := range tp.f.Decls {
		gd, ok := d.(*ast.GenDecl)
		if !ok || (gd.Tok != token.VAR && gd.Tok != token.CONST) {
			continue
		}
		for _, s := range gd.Specs {
			vs, ok := s.(*ast.ValueSpec)
			if !ok {
				continue
			}
			for _, v := range vs.Values {
				ghiTruong(v, kieuGoc(v, vs.Type), "", thuMuc, bang, ra)
			}
		}
	}
	return ra
}

func ghiTruong(e ast.Expr, kieu ast.Expr, truongHienTai, thuMuc string,
	bang map[[2]string]*ast.StructType, ra map[token.Pos]string) {

	cl, ok := e.(*ast.CompositeLit)
	if !ok {
		if truongHienTai == "" {
			return
		}
		ast.Inspect(e, func(x ast.Node) bool {
			if lit, ok := x.(*ast.BasicLit); ok && lit.Kind == token.STRING {
				if _, co := ra[lit.Pos()]; !co {
					ra[lit.Pos()] = truongHienTai
				}
			}
			return true
		})
		return
	}
	switch k := boLopBoc(giaiKieu(kieuGoc(cl, kieu), thuMuc, bang)).(type) {
	case *ast.MapType:
		for _, el := range cl.Elts {
			if kv, ok := el.(*ast.KeyValueExpr); ok {
				ghiTruong(kv.Value, k.Value, truongHienTai, thuMuc, bang, ra)
			}
		}
	case *ast.ArrayType:
		for _, el := range cl.Elts {
			if kv, ok := el.(*ast.KeyValueExpr); ok { // mảng có chỉ số tường minh
				ghiTruong(kv.Value, k.Elt, truongHienTai, thuMuc, bang, ra)
				continue
			}
			ghiTruong(el, k.Elt, truongHienTai, thuMuc, bang, ra)
		}
	case *ast.StructType:
		tr := truongPhang(k)
		for i, el := range cl.Elts {
			if kv, ok := el.(*ast.KeyValueExpr); ok {
				ten := tenIdent(kv.Key)
				ghiTruong(kv.Value, kieuTheoTen(tr, ten), ten, thuMuc, bang, ra)
				continue
			}
			if i >= len(tr) {
				continue
			}
			ghiTruong(el, tr[i].kieu, tr[i].ten, thuMuc, bang, ra)
		}
	default:
		// Kiểu không giải được: khóa composite (nếu có) chính là tên trường.
		for _, el := range cl.Elts {
			kv, ok := el.(*ast.KeyValueExpr)
			if !ok {
				ghiTruong(el, nil, truongHienTai, thuMuc, bang, ra)
				continue
			}
			ten := tenIdent(kv.Key)
			if ten == "" {
				ten = truongHienTai
			}
			ghiTruong(kv.Value, nil, ten, thuMuc, bang, ra)
		}
	}
}

// laDuLieu tra bảng miễn trừ, độ mịn TRƯỜNG trước rồi mới cả khai báo.
//
// Thứ tự đó là bản chất của cơ chế: có mục "zhPatternDefs.name" thì ô .name được
// miễn, mà KHÔNG có mục "zhPatternDefs" thì mọi trường khác của nó vẫn bị canh.
func laDuLieu(rel, kyHieu, truong string) bool {
	if kyHieu == "" {
		return false
	}
	if truong != "" {
		if _, co := dulieuKhongPhaiChu[[2]string{rel, kyHieu + "." + truong}]; co {
			return true
		}
	}
	_, co := dulieuKhongPhaiChu[[2]string{rel, kyHieu}]
	return co
}

func rutGon(s string) string {
	s = strings.ReplaceAll(s, "\n", "\\n")
	r := []rune(s)
	if len(r) > 40 {
		s = string(r[:40]) + "…"
	}
	return strconv.Quote(s)
}

// ==========================================================================
// LUẬT 2 — bọc lồng
// ==========================================================================

// TestKhongBocLong canh lớp lỗi mà một catalog ĐẦY ĐỦ vẫn không cứu được.
//
// # Vì sao luật này đáng nhất
//
// i18n.F tra msgid trong catalog rồi trả bản dịch, hoặc trả lại chính msgid nếu
// không thấy. Nếu đối số của nó được DỰNG LÚC CHẠY — nối chuỗi, hay tệ hơn: nối
// chuỗi mà một mảnh là kết quả của một i18n.F khác — thì khóa nó tra *không thể
// tồn tại* trong catalog: không tệp .json nào có sẵn "mảnh Trung + mảnh Việt đã
// dịch". F trả nguyên đối số, người dùng nhận một câu nửa Trung nửa Việt, và mọi
// thống kê vẫn báo phủ 100% vì cả ba msgid gốc ĐỀU có bản dịch.
//
// Ca thật: internal/host/imp/source.go dựng thông báo lỗi bảng mã từ ba mảnh, nối
// trước rồi bọc một lần ở ngoài. Bản sửa dịch RỜI ba mảnh rồi mới nối — chú thích
// tại chỗ đó ghi lại. Bản lỗi được giữ nguyên văn trong TestLuat2CoRang.
//
// # Vì sao luật này không có dương tính giả về nguyên tắc
//
// Không phải vì bộ nhận diện cẩn thận, mà vì bản thân mệnh đề đúng: i18n.F với
// đối số dựng lúc chạy thì khóa không tra được, nên nó LUÔN sai bất kể ngữ cảnh.
// Nhờ vậy luật này không cần bảng miễn trừ nào — và một luật không có bảng miễn
// trừ là một luật không mục ruỗng được.
func TestKhongBocLong(t *testing.T) {
	fset, teps := napNguon(t, false)
	viPham, soGoiI18n := quetBocLong(fset, teps)

	// Khẳng định tiền đề. Luật này CẦN nó hơn luật 1: nếu doiSoMsgid hỏng thì luật
	// 1 đỏ ầm ầm (mọi thứ thành "chưa bọc") nên tự lộ, còn luật 2 chỉ im lặng xanh
	// — nó kiểm 0 lời gọi và không có gì để báo. Không có dòng này thì luật đáng
	// nhất trong bốn luật lại là luật dễ hỏng âm thầm nhất.
	if len(teps) < 100 {
		t.Fatalf("chỉ nạp được %d tệp .go sản phẩm — bộ quét lạc đường, bài kiểm rỗng nghĩa", len(teps))
	}
	if soGoiI18n < 1500 {
		t.Fatalf("chỉ thấy %d lời gọi i18n.F/T — doiSoMsgid đã hỏng, bài kiểm rỗng nghĩa", soGoiI18n)
	}

	if len(viPham) > 0 {
		t.Errorf("i18n.F/T nhận đối số dựng LÚC CHẠY — khóa đó không thể có trong catalog (%d chỗ / %d lời gọi):\n  %s",
			len(viPham), soGoiI18n, strings.Join(viPham, "\n  "))
	}
	t.Logf("%d tệp, %d lời gọi i18n.F/T, %d bọc lồng", len(teps), soGoiI18n, len(viPham))
}

func quetBocLong(fset *token.FileSet, teps []tepGo) ([]string, int) {
	var viPham []string
	soGoiI18n := 0
	for _, tp := range teps {
		ast.Inspect(tp.f, func(n ast.Node) bool {
			c, ok := n.(*ast.CallExpr)
			if !ok {
				return true
			}
			arg, ok := doiSoMsgid(c)
			if !ok {
				return true
			}
			soGoiI18n++
			if ly := loiBocLong(arg); ly != "" {
				viPham = append(viPham, viTri(fset, tp.rel, c.Pos())+"  "+ly)
			}
			return true
		})
	}
	return viPham, soGoiI18n
}

// loiBocLong trả lý do vi phạm, hoặc "" nếu đối số hợp lệ.
//
// Chặn theo DANH SÁCH ĐEN chứ không danh sách trắng, và đó là chủ ý: dạng hợp lệ
// còn có selector (i18n.F(disp.label) — mẫu bọc-ở-chỗ-dùng, xem thuBocGianTiep),
// chỉ số mảng, ép kiểu… Liệt kê hết dạng hợp lệ là tự nhận việc theo kịp mọi cách
// viết Go, và mỗi dạng bỏ sót là một dòng đỏ oan. Còn hai dạng bị chặn dưới đây
// thì sai một cách không phụ thuộc ngữ cảnh.
//
// Đo được trên repo hiện tại: chặn cả CallExpr (không riêng lời gọi i18n lồng)
// cho 0 dương tính giả trên 1.922 lời gọi — nên luật lấy luôn dạng rộng hơn đó,
// vì i18n.F(fmt.Sprintf(...)) sai y hệt i18n.F(i18n.F(...)).
func loiBocLong(arg ast.Expr) string {
	if b, ok := arg.(*ast.BinaryExpr); ok {
		return "đối số là chuỗi ghép lúc chạy (" + dangGhep(b) + ")"
	}
	var loi string
	ast.Inspect(arg, func(n ast.Node) bool {
		if loi != "" {
			return false
		}
		c, ok := n.(*ast.CallExpr)
		if !ok {
			return true
		}
		if _, la := doiSoMsgid(c); la {
			loi = "đối số chứa lời gọi i18n.F/T LỒNG bên trong — F ngoài tra khóa do F trong sinh ra"
		} else {
			loi = "đối số là kết quả một lời gọi hàm, dựng lúc chạy"
		}
		return false
	})
	return loi
}

// dangGhep mô tả gọn một phép nối chuỗi để thông báo lỗi chỉ được đúng chỗ.
func dangGhep(b *ast.BinaryExpr) string {
	var manh []string
	ast.Inspect(b, func(n ast.Node) bool {
		switch v := n.(type) {
		case *ast.BasicLit:
			if v.Kind == token.STRING {
				if s, err := strconv.Unquote(v.Value); err == nil {
					manh = append(manh, rutGon(s))
				}
			}
		case *ast.CallExpr:
			if _, la := doiSoMsgid(v); la {
				manh = append(manh, "i18n.F(…)")
				return false
			}
		}
		return true
	})
	if len(manh) == 0 {
		return "nối chuỗi"
	}
	return strings.Join(manh, " + ")
}

// ==========================================================================
// LUẬT 3 — bẫy ghim locale trong test
// ==========================================================================

// tenLocale là các hằng locale. Trả về locale mà một biểu thức chỉ tới, hoặc ""
// nếu biểu thức là một BIẾN — tức đường lưu-rồi-trả, là cách đúng.
var tenLocale = map[string]bool{"Chinese": true, "Vietnamese": true, "DefaultLocale": true}

// TestKhongPhaGhimLocale canh cái bẫy đã mắc HAI lần trong dự án này.
//
// # Cái bẫy
//
// 14 gói có tệp i18n_locale_pin_test.go ghim cả gói về zh bằng init(), để các
// assert Contains trên chuỗi tiếng Trung của upstream vẫn so đúng cái upstream
// sinh ra (nhờ vậy diff của fork gần như bằng không khi rebase). Một test đổi
// locale rồi t.Cleanup trả về DefaultLocale sẽ PHÁ GHIM cho mọi test chạy SAU nó
// trong cùng gói — và phá theo cách tệ nhất: test gây lỗi thì xanh, test khác thì
// đỏ, nên người đọc đi sửa sai chỗ. Cách đúng là lưu i18n.Active() trước rồi trả
// lại đúng giá trị đó.
//
// # Vì sao luật này tự tìm gói được ghim thay vì chép danh sách 14 gói
//
// Chép danh sách thì luật đúng hôm nay và sai ngày mai theo hai chiều: thêm một
// tệp ghim mới thì gói đó không được canh, bỏ một tệp ghim thì luật báo bừa. Ở
// đây gói được-ghim được suy ra từ chính nguồn — có init() gọi i18n.SetLocale.
// Hệ quả đáng giá nhất: hai chỗ trong internal/entry/tui hiện trả về DefaultLocale
// một cách VÔ HẠI vì gói đó chưa ghim; ngày nào có người thêm tệp ghim vào
// entry/tui, hai chỗ đó đỏ NGAY, không cần ai nhớ ra mà đi sửa. Chúng được liệt ở
// t.Logf như bom hẹn giờ đã biết.
//
// # Chân thứ hai: đổi locale mà KHÔNG trả
//
// Nặng hơn trả sai, và cùng một gốc. Trong gói được ghim, một hàm test gọi
// SetLocale mà không có t.Cleanup/defer nào trả lại thì nó bỏ ghim vĩnh viễn cho
// phần còn lại của gói.
//
// Chân này CỐ Ý biết tới hàm phụ trợ, và đó là bài học phải trả giá mới có: bản
// đầu chỉ soi trong thân hàm nên nó gắn cờ internal/store/
// session_compact_locale_test.go — một test ĐÚNG, vì chỗ trả locale do
// datLocaleStore(t, …) đăng ký hộ. Cách sửa không phải miễn trừ tệp đó mà là sửa
// luật: t.Cleanup đăng ký được từ bất kỳ đâu trong ngăn xếp gọi, nên luật phải
// nhận cả trường hợp hàm phụ trợ cùng gói đăng ký hộ. Bản thân hàm phụ trợ vẫn bị
// xét riêng, nên nó trả sai thì vẫn đỏ.
//
// Và vì "bất kỳ đâu trong ngăn xếp" là điều kiện thật, phép lan truyền chạy tới
// ĐIỂM BẤT ĐỘNG chứ không một tầng: một hàm gọi một hàm gọi t.Cleanup vẫn là đã
// đăng ký. Bản một tầng sẽ báo bừa vào chuỗi phụ trợ hai tầng — cách viết hoàn
// toàn bình thường mà repo chưa có, nên đây là chỗ hở bịt TRƯỚC khi mã mọc tới.
func TestKhongPhaGhimLocale(t *testing.T) {
	fset, teps := napNguon(t, true)
	viPham, bomHenGio, ghim, soDoiLocale := quetGhimLocale(fset, teps)

	// Khẳng định tiền đề. Ba con số, và con số ghim là con số quan trọng nhất: nếu
	// bộ nhận gói-được-ghim hỏng thì KHÔNG gói nào được canh và luật này xanh tuyệt
	// đối — đúng dạng bài kiểm rỗng đã xảy ra thật trong dự án.
	if len(teps) < 100 {
		t.Fatalf("chỉ nạp được %d tệp _test.go — bộ quét lạc đường, bài kiểm rỗng nghĩa", len(teps))
	}
	if len(ghim) < 10 {
		t.Fatalf("chỉ thấy %d gói tự ghim locale — bộ nhận ghim đã hỏng, không gói nào đang được canh", len(ghim))
	}
	if soDoiLocale < 10 {
		t.Fatalf("chỉ thấy %d chỗ đổi locale trong test — bộ nhận SetLocale đã hỏng, bài kiểm rỗng nghĩa", soDoiLocale)
	}

	if len(viPham) > 0 {
		t.Errorf("test phá ghim locale của gói (%d chỗ):\n  %s", len(viPham), strings.Join(viPham, "\n  "))
	}
	t.Logf("%d tệp _test.go, %d gói được ghim, %d chỗ đổi locale, 0 vi phạm", len(teps), len(ghim), soDoiLocale)
	if len(bomHenGio) > 0 {
		t.Logf("bom hẹn giờ — trả về hằng locale trong gói CHƯA ghim; thêm tệp ghim vào các gói này là %d dòng đỏ:\n  %s",
			len(bomHenGio), strings.Join(bomHenGio, "\n  "))
	}
}

func quetGhimLocale(fset *token.FileSet, teps []tepGo) (viPham, bomHenGio []string, ghim map[string]string, soDoiLocale int) {
	// Lượt một: gói nào tự ghim, và ghim về đâu.
	ghim = map[string]string{}
	for _, tp := range teps {
		for _, d := range tp.f.Decls {
			fd, ok := d.(*ast.FuncDecl)
			if !ok || fd.Recv != nil || fd.Name.Name != "init" {
				continue
			}
			if loc := timDatLocale(fd.Body); loc != "" {
				ghim[filepath.ToSlash(filepath.Dir(tp.rel))] = loc
			}
		}
	}

	// Lượt một-rưỡi: hàm phụ trợ nào ĐĂNG KÝ HỘ chỗ trả locale. t.Cleanup đăng ký
	// được từ bất kỳ đâu trong ngăn xếp gọi, nên một test gọi datLocaleStore(t, …)
	// là đã có chỗ trả dù thân nó không có dòng nào. Khóa theo {thư mục, tên} vì
	// hàm phụ trợ chỉ gọi được trong cùng gói.
	//
	// Lan truyền tới ĐIỂM BẤT ĐỘNG, không phải một tầng: chuỗi phụ-trợ-gọi-phụ-trợ
	// (datLocale → datLocaleStore → t.Cleanup) là cách viết bình thường, và bản một
	// tầng sẽ báo bừa vào nó. Báo bừa là chỗ bộ canh bị tắt, nên chỗ hở này đáng bịt
	// dù hôm nay chưa có chuỗi nào dài hai tầng — luật phải đúng trước khi mã mọc
	// tới đó, chứ không phải sau.
	phuTroTra := map[[2]string]bool{}
	than := map[[2]string]*ast.BlockStmt{}
	for _, tp := range teps {
		thuMuc := filepath.ToSlash(filepath.Dir(tp.rel))
		for _, d := range tp.f.Decls {
			fd, ok := d.(*ast.FuncDecl)
			if !ok || fd.Body == nil || fd.Recv != nil {
				continue
			}
			khoa := [2]string{thuMuc, fd.Name.Name}
			than[khoa] = fd.Body
			if len(timChoTraLocale(fd.Body)) > 0 {
				phuTroTra[khoa] = true
			}
		}
	}
	// Mỗi vòng thêm những hàm gọi tới một hàm đã biết là trả-hộ. Hội tụ vì tập chỉ
	// lớn lên và bị chặn trên bởi số hàm.
	for doi := true; doi; {
		doi = false
		for khoa, body := range than {
			if phuTroTra[khoa] {
				continue
			}
			if goiPhuTroTra(body, khoa[0], phuTroTra) {
				phuTroTra[khoa] = true
				doi = true
			}
		}
	}

	// Lượt hai: xét từng hàm test.
	for _, tp := range teps {
		thuMuc := filepath.ToSlash(filepath.Dir(tp.rel))
		locGhim, coGhim := ghim[thuMuc]
		for _, d := range tp.f.Decls {
			fd, ok := d.(*ast.FuncDecl)
			if !ok || fd.Body == nil || fd.Recv != nil {
				continue
			}
			// init/TestMain là chỗ ĐẶT ghim, không phải chỗ phá ghim.
			if fd.Name.Name == "init" || fd.Name.Name == "TestMain" {
				continue
			}
			dat, traVe := phanTichLocale(fd.Body)
			if dat == 0 {
				continue
			}
			soDoiLocale += dat

			if len(traVe) == 0 && goiPhuTroTra(fd.Body, thuMuc, phuTroTra) {
				continue // hàm phụ trợ cùng gói đã đăng ký hộ chỗ trả
			}
			if len(traVe) == 0 {
				if coGhim {
					viPham = append(viPham, viTri(fset, tp.rel, fd.Pos())+"  "+fd.Name.Name+
						" đổi locale mà KHÔNG có t.Cleanup/defer trả lại — gói này ghim về "+
						locGhim+", mọi test chạy sau sẽ mất ghim")
				}
				continue
			}
			for _, tv := range traVe {
				if tv.hang == "" { // lưu-rồi-trả: cách đúng
					continue
				}
				if !coGhim {
					bomHenGio = append(bomHenGio, viTri(fset, tp.rel, tv.pos)+"  "+fd.Name.Name+
						" trả về i18n."+tv.hang+" (gói chưa ghim) — nên lưu i18n.Active() rồi trả lại giá trị đó")
					continue
				}
				if tv.hang != locGhim {
					viPham = append(viPham, viTri(fset, tp.rel, tv.pos)+"  "+fd.Name.Name+
						" trả locale về i18n."+tv.hang+" nhưng gói ghim về i18n."+locGhim+
						" — phá ghim cho mọi test chạy sau; hãy lưu i18n.Active() trước rồi trả lại giá trị đó")
				}
			}
		}
	}
	return viPham, bomHenGio, ghim, soDoiLocale
}

type choTra struct {
	pos    token.Pos // vị trí t.Cleanup/defer, để báo lỗi chỉ đúng chỗ
	posGoi token.Pos // vị trí chính lời gọi SetLocale, để không đếm nó là "đổi locale"
	hang   string    // tên hằng locale, hoặc "" nếu là biến (lưu-rồi-trả)
}

// phanTichLocale trả số chỗ ĐỔI locale và danh sách chỗ TRẢ locale trong một thân
// hàm.
//
// Tách hai vai là cần thiết, không phải cho gọn: SetLocale trong t.Cleanup là chỗ
// TRẢ, không phải chỗ đổi. Đếm gộp thì con số khẳng định tiền đề bị thổi lên gần
// gấp đôi (63 thay vì 36 trên repo hiện tại) — và một con số tiền đề sai là một
// con số không ai dám dùng làm ngưỡng.
func phanTichLocale(body *ast.BlockStmt) (int, []choTra) {
	traVe := timChoTraLocale(body)
	laTra := map[token.Pos]bool{}
	for _, tv := range traVe {
		laTra[tv.posGoi] = true
	}
	soDat := 0
	ast.Inspect(body, func(x ast.Node) bool {
		c, ok := x.(*ast.CallExpr)
		if !ok {
			return true
		}
		if _, la := goiDatLocale(c); la && !laTra[c.Pos()] {
			soDat++
		}
		return true
	})
	return soDat, traVe
}

// goiPhuTroTra cho biết thân hàm có gọi một hàm phụ trợ cùng gói mà hàm đó đăng ký
// chỗ trả locale.
func goiPhuTroTra(body *ast.BlockStmt, thuMuc string, phuTro map[[2]string]bool) bool {
	co := false
	ast.Inspect(body, func(x ast.Node) bool {
		if co {
			return false
		}
		c, ok := x.(*ast.CallExpr)
		if !ok {
			return true
		}
		if id, ok := c.Fun.(*ast.Ident); ok && phuTro[[2]string{thuMuc, id.Name}] {
			co = true
			return false
		}
		return true
	})
	return co
}

// goiDatLocale nhận i18n.SetLocale(X) và trả đối số.
func goiDatLocale(n ast.Node) (ast.Expr, bool) {
	c, ok := n.(*ast.CallExpr)
	if !ok || len(c.Args) != 1 {
		return nil, false
	}
	sel, ok := c.Fun.(*ast.SelectorExpr)
	if !ok || sel.Sel.Name != "SetLocale" {
		return nil, false
	}
	if pkg, ok := sel.X.(*ast.Ident); !ok || pkg.Name != "i18n" {
		return nil, false
	}
	return c.Args[0], true
}

// timDatLocale trả tên hằng locale mà init() ghim tới.
func timDatLocale(n ast.Node) string {
	ra := ""
	ast.Inspect(n, func(x ast.Node) bool {
		if ra != "" {
			return false
		}
		if arg, ok := goiDatLocale(x); ok {
			ra = hangLocale(arg)
		}
		return true
	})
	return ra
}

// hangLocale trả tên hằng nếu biểu thức là i18n.<Hằng> hoặc <Hằng> trần, ngược
// lại "" (biến — đường lưu-rồi-trả).
func hangLocale(e ast.Expr) string {
	switch v := e.(type) {
	case *ast.SelectorExpr:
		if pkg, ok := v.X.(*ast.Ident); ok && pkg.Name == "i18n" && tenLocale[v.Sel.Name] {
			return v.Sel.Name
		}
	case *ast.Ident:
		if tenLocale[v.Name] {
			return v.Name
		}
	}
	return ""
}

// timChoTraLocale tìm mọi chỗ TRẢ locale: t.Cleanup(func(){ SetLocale(X) }) và
// defer SetLocale(X). Hai dạng cùng một vai nên cùng một luật.
func timChoTraLocale(body *ast.BlockStmt) []choTra {
	var ra []choTra
	ast.Inspect(body, func(n ast.Node) bool {
		switch v := n.(type) {
		case *ast.DeferStmt:
			if arg, ok := goiDatLocale(v.Call); ok {
				ra = append(ra, choTra{pos: v.Pos(), posGoi: v.Call.Pos(), hang: hangLocale(arg)})
			}
		case *ast.CallExpr:
			sel, ok := v.Fun.(*ast.SelectorExpr)
			if !ok || sel.Sel.Name != "Cleanup" || len(v.Args) != 1 {
				return true
			}
			ast.Inspect(v.Args[0], func(x ast.Node) bool {
				if arg, ok := goiDatLocale(x); ok {
					ra = append(ra, choTra{pos: v.Pos(), posGoi: x.Pos(), hang: hangLocale(arg)})
				}
				return true
			})
		}
		return true
	})
	return ra
}

// ==========================================================================
// LUẬT 4 — msgid mà TEST neo vào phải còn tồn tại trong catalog
// ==========================================================================

// TestMsgidNeoPhaiCoTrongCatalog canh lớp "bài kiểm xanh vì không kiểm gì cả",
// ở đúng chỗ nó gây thiệt hại lớn nhất: các bài kiểm bất biến theo locale.
//
// # Lớp lỗi thứ tư, và vì sao nó KHÔNG cần một luật riêng nữa
//
// Trong lúc dựng luật 1, hai dòng ở internal/agents/guard/subagent_guards.go bị
// gắn cờ:
//
//	case strings.Contains(task, "save_arc_summary") || strings.Contains(task, "弧摘要"):
//
// `task` không phải hằng — internal/flow/router.go:156 sinh nó QUA i18n.F. Ở
// locale vi, nhánh "弧摘要" chết; guard chỉ còn sống nhờ nhánh so TÊN TOOL, và nó
// sống được đúng vì người dịch tình cờ giữ nguyên chữ save_arc_summary trong câu
// tiếng Việt. Đây là một lớp lỗi thật, khác ba lớp trên: chuỗi sinh ra ĐÃ bọc
// đúng, chuỗi so khớp là dữ liệu nên đúng khi không bọc, không có bọc lồng nào, và
// mọi phép đo độ phủ báo 100%. Triệu chứng không phải chữ sai trên màn hình mà là
// một NHÁNH CHẾT LẶNG — hàng rào an toàn thôi không gác nữa, không log, không lỗi.
//
// Nhưng lớp đó ĐÃ được canh: internal/agents/guard/locale_invariant_test.go dựng
// đúng bất biến ấy cho 4 msgid, ở cả hai locale, kèm cả phép kiểm trật tự tham số.
// Dựng thêm một bảng hợp đồng ở đây chỉ là bảng thứ hai phải giữ đồng bộ với
// router.go — hai bộ canh cùng một thứ thì cái nào lệch trước cũng thành tiếng ồn.
//
// # Cái CÒN HỞ, và đó là việc của luật này
//
// Bộ canh kia neo msgid bằng hằng chép tay, kèm chú thích "phải khớp nguyên văn
// với internal/flow/router.go". Không có gì ép điều đó. Upstream sửa một chữ trong
// câu tiếng Trung là hằng ở đây trôi — và khi trôi thì i18n.F(msgid) trả lại chính
// msgid (chuỗi tiếng Trung), chuỗi đó VẪN chứa "save_arc_summary", nên bài kiểm
// bất biến vẫn XANH. Bài kiểm trật tự tham số thì tự t.Skipf. Cả hai im lặng đúng
// vào lúc khớp nối đã hở.
//
// Nên luật này không kiểm bất biến — nó kiểm TIỀN ĐỀ của bất biến: msgid mà một
// bài kiểm neo vào phải thật sự tra được trong catalog.
//
// # Nó đã bắt được lỗi thật, hai lần, theo hai đường khác nhau
//
// Lần một, ngay sau khi dựng: một lượt prune "3 mục catalog chết" — đã kiểm tay
// rằng chúng không còn trong mã sản phẩm, nhưng không kiểm có TEST nào neo vào.
// Luật này đỏ ngay. Truy ra thì bộ canh bất biến neo vào một chuỗi router KHÔNG
// CÒN PHÁT RA (upstream đã đổi câu), tức nó vốn đã vô nghĩa mà không ai thấy:
// msgid còn bản dịch nên i18n.F trả bản dịch và bài kiểm chạy bình thường — chỉ là
// chạy trên một chuỗi mà code không bao giờ sinh. Cả msgid trôi lẫn catalog bị
// prune đều lộ ra ở cùng một chỗ, vì cả hai đều làm hỏng đúng tiền đề này.
//
// Lần đó cũng cho thấy `t.Skipf` là một dạng im lặng: bài kiểm trật tự tham số tự
// bỏ qua khi chưa có bản dịch, nên nó không bao giờ nói gì. Bỏ-qua-âm-thầm và
// xanh-rỗng là một lớp lỗi, không phải hai.
//
// # Vì sao nhận diện được mà không cần bảng khai tay
//
// Hai hình thức neo, hai cách nhận (chi tiết ở quetMsgidNeo):
//
//   - NHÚNG THẲNG `i18n.F("汉字…")` — chính lời gọi là bằng chứng, không cần hàng
//     rào nào, không có đường báo bừa.
//   - HẰNG cấp package giá trị chuỗi Hán, trong tệp CÓ gọi i18n.F/T — chỉ có một
//     lý do để tồn tại. Hàng rào "tệp có gọi i18n" là thứ tách sạch 4 hằng msgid
//     của guard khỏi 4 hằng văn truyện tiếng Trung dùng làm dữ liệu lint ở
//     internal/rules và internal/e2e: hai tệp kia gọi i18n.F/T đúng 0 lần.
//
// Không mục miễn trừ nào, ở cả hai hình thức.
func TestMsgidNeoPhaiCoTrongCatalog(t *testing.T) {
	_, teps := napNguon(t, true)

	ents, err := localeFS.ReadDir("locales")
	if err != nil {
		t.Fatalf("đọc thư mục locales: %v", err)
	}
	var viPham []string
	soCatalog, soNeo := 0, 0
	for _, e := range ents {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		raw, err := localeFS.ReadFile("locales/" + e.Name())
		if err != nil {
			t.Fatalf("đọc %s: %v", e.Name(), err)
		}
		var c catalog
		if err := unmarshalCatalog(raw, &c); err != nil {
			t.Fatalf("phân tích %s: %v", e.Name(), err)
		}
		soCatalog++
		vp, n := quetMsgidNeo(teps, c, e.Name())
		viPham = append(viPham, vp...)
		soNeo = n
	}

	// Khẳng định tiền đề. Luật này canh tiền đề của bộ canh khác, nên nó mà rỗng
	// nghĩa thì cả hai tầng đều im — đúng dạng lỗi mà cả bộ quét này tồn tại để
	// chặn.
	if len(teps) < 100 {
		t.Fatalf("chỉ nạp được %d tệp _test.go — bộ quét lạc đường, bài kiểm rỗng nghĩa", len(teps))
	}
	if soCatalog == 0 {
		t.Fatal("không đọc được catalog nào — bài kiểm rỗng nghĩa")
	}
	if soNeo == 0 {
		t.Fatal("không thấy msgid nào được neo trong mã kiểm thử — bộ nhận đã hỏng, bài kiểm rỗng nghĩa")
	}

	if len(viPham) > 0 {
		t.Errorf("msgid được test neo vào nhưng KHÔNG tra được trong catalog — i18n.F sẽ trả lại "+
			"chính msgid và mọi khẳng định dựng trên nó thành xanh rỗng (%d chỗ):\n  %s",
			len(viPham), strings.Join(viPham, "\n  "))
	}
	t.Logf("%d tệp _test.go, %d catalog, %d msgid được neo, tất cả tra được", len(teps), soCatalog, soNeo)
}

// quetMsgidNeo tìm msgid neo trong mã kiểm thử và kiểm chúng có trong catalog.
//
// Neo có HAI hình thức, và cả hai đều là cùng một sự phụ thuộc:
//
//	const msgTask = "生成…（save_arc_summary）"   →  i18n.F(msgTask)
//	i18n.F("生成…（save_arc_summary）")            →  nhúng thẳng
//
// Hình thức thứ hai mới thêm. Lý do thêm: lỗi prune catalog thật sự đã xảy ra
// thuộc đúng họ này, chỉ khác cách khai báo — nên bịt một hình thức mà bỏ hình
// thức kia là để cửa mở đúng bằng chiều rộng cũ. Đo được trên repo: 38 chỗ nhúng
// thẳng, 0 chỗ thiếu catalog, nên mở rộng này không tốn một mục miễn trừ nào.
func quetMsgidNeo(teps []tepGo, c catalog, tenCatalog string) ([]string, int) {
	var viPham []string
	soNeo := 0
	bao := func(rel, ten, msgid string) {
		if _, co := c[msgid]; co {
			return
		}
		viPham = append(viPham, rel+"  "+ten+"  (catalog "+tenCatalog+")  "+rutGon(msgid))
	}

	for _, tp := range teps {
		// Neo dạng NHÚNG THẲNG: literal Hán là đối số của i18n.F/T ngay tại chỗ.
		// Không cần hàng rào "tệp có gọi i18n" như dạng hằng — chính lời gọi đã là
		// bằng chứng đây là msgid, nên dạng này không có đường báo bừa.
		ast.Inspect(tp.f, func(n ast.Node) bool {
			cl, ok := n.(*ast.CallExpr)
			if !ok {
				return true
			}
			arg, la := doiSoMsgid(cl)
			if !la {
				return true
			}
			lit, ok := arg.(*ast.BasicLit)
			if !ok || lit.Kind != token.STRING {
				return true
			}
			msgid, err := strconv.Unquote(lit.Value)
			if err != nil || !coChuHan(msgid) {
				return true
			}
			soNeo++
			bao(tp.rel, "i18n.F(…) nhúng thẳng", msgid)
			return true
		})

		// Neo dạng HẰNG: tệp không gọi i18n.F/T thì hằng chữ Hán trong đó là dữ liệu
		// mẫu, không phải msgid. Đây là toàn bộ cơ chế chống báo bừa của dạng này.
		goiI18n := false
		ast.Inspect(tp.f, func(n ast.Node) bool {
			if cl, ok := n.(*ast.CallExpr); ok {
				if _, la := doiSoMsgid(cl); la {
					goiI18n = true
				}
			}
			return true
		})
		if !goiI18n {
			continue
		}
		for _, d := range tp.f.Decls {
			gd, ok := d.(*ast.GenDecl)
			if !ok || (gd.Tok != token.CONST && gd.Tok != token.VAR) {
				continue
			}
			for _, s := range gd.Specs {
				vs, ok := s.(*ast.ValueSpec)
				if !ok {
					continue
				}
				for i, v := range vs.Values {
					lit, ok := v.(*ast.BasicLit)
					if !ok || lit.Kind != token.STRING {
						continue
					}
					msgid, err := strconv.Unquote(lit.Value)
					if err != nil || !coChuHan(msgid) {
						continue
					}
					soNeo++
					if _, co := c[msgid]; co {
						continue
					}
					ten := "?"
					if i < len(vs.Names) {
						ten = vs.Names[i].Name
					}
					viPham = append(viPham, tp.rel+"  "+ten+"  (catalog "+tenCatalog+")  "+rutGon(msgid))
				}
			}
		}
	}
	return viPham, soNeo
}

// ==========================================================================
// BÀI KIỂM CÓ-RĂNG — mỗi luật phải chứng minh nó bắt được lỗi thật
// ==========================================================================
//
// Một bộ canh chưa bao giờ thấy đỏ là một bộ canh chưa được kiểm. Bốn bài kiểm
// dưới đây cho từng luật ăn NGUYÊN VĂN mã lỗi rồi đòi nó phải báo, và cho ăn bản
// đã sửa rồi đòi nó phải im. Chúng chạy đúng những hàm quét mà bài kiểm toàn repo
// chạy, nên chúng không thể xanh nhờ một đường mã khác.
//
// Vì sao dựng bản lỗi trong bộ nhớ chứ không hoàn nguyên tệp thật: hoàn nguyên
// chứng minh được một lần rồi mất, còn mẩu nguồn ở đây nằm lại vĩnh viễn như một
// bài kiểm hồi quy — và nó không thể làm hỏng cây làm việc của người khác.

// TestLuat2CoRang cho luật 2 ăn nguyên văn bản lỗi bọc-lồng đã tồn tại thật ở
// internal/host/imp/source.go (trước commit 3ce9643).
func TestLuat2CoRang(t *testing.T) {
	// Nguyên văn bản LỖI: i18n.F ngoài cùng nhận một chuỗi ghép mà hai mảnh là
	// kết quả của hai i18n.F khác.
	loi := `package imp

import (
	"fmt"

	"github.com/huuhoa143/ainovel-studio/internal/i18n"
)

func decodeSource(text string, ratio float64) error {
	return fmt.Errorf("%w: "+i18n.F("文件不是 UTF-8；按 GB18030 解码后仅 %.0f%% 是汉字，"+
		i18n.F("判定为编码猜测错误而非中文原文（很可能是 Windows-1258/TCVN3 越南语文本或被截断的 UTF-8）。")+
		i18n.F("请先转换为 UTF-8 再导入，例如：iconv -f WINDOWS-1258 -t UTF-8 原文件 > 新文件")),
		ErrEncodingUnreliable, ratio)
}
`
	// Nguyên văn bản SỬA: ba mảnh dịch RỜI rồi mới nối, phép nối nằm ngoài i18n.F.
	sua := `package imp

import (
	"fmt"

	"github.com/huuhoa143/ainovel-studio/internal/i18n"
)

func decodeSource(text string, ratio float64) error {
	return fmt.Errorf("%w: "+i18n.F("文件不是 UTF-8；按 GB18030 解码后仅 %.0f%% 是汉字，")+
		i18n.F("判定为编码猜测错误而非中文原文（很可能是 Windows-1258/TCVN3 越南语文本或被截断的 UTF-8）。")+
		i18n.F("请先转换为 UTF-8 再导入，例如：iconv -f WINDOWS-1258 -t UTF-8 原文件 > 新文件"),
		ErrEncodingUnreliable, ratio)
}
`
	fset, teps := napChuoi(t, "source_loi.go", loi)
	viPham, soGoi := quetBocLong(fset, teps)
	if soGoi != 3 {
		t.Fatalf("bản lỗi phải có 3 lời gọi i18n.F, thấy %d — mẩu nguồn đã trôi, bài kiểm này rỗng nghĩa", soGoi)
	}
	if len(viPham) != 1 {
		t.Fatalf("luật 2 KHÔNG có răng: bản lỗi bọc-lồng phải cho đúng 1 vi phạm, thấy %d\n%s",
			len(viPham), strings.Join(viPham, "\n"))
	}
	// Thông báo phải NÊU ĐƯỢC hai i18n.F lồng bên trong. Bắt đúng chỗ mà tả sai
	// nguyên nhân thì người đọc đi bọc lại mảnh ngoài thay vì tách ba mảnh ra.
	if strings.Count(viPham[0], "i18n.F(…)") != 2 {
		t.Errorf("bắt được nhưng thông báo không chỉ ra hai i18n.F lồng, người đọc sẽ đi sai hướng: %s", viPham[0])
	}
	t.Logf("bản lỗi → đỏ: %s", viPham[0])

	fset, teps = napChuoi(t, "source_sua.go", sua)
	viPham, soGoi = quetBocLong(fset, teps)
	if soGoi != 3 {
		t.Fatalf("bản sửa phải có 3 lời gọi i18n.F, thấy %d", soGoi)
	}
	if len(viPham) != 0 {
		t.Fatalf("luật 2 BÁO BỪA: bản đã sửa phải xanh, lại thấy %d vi phạm\n%s",
			len(viPham), strings.Join(viPham, "\n"))
	}
	t.Logf("bản sửa → xanh (%d lời gọi i18n.F, 0 vi phạm)", soGoi)
}

// TestLuat1CoRang kiểm cả hai chiều của luật 1: nó phải bắt chuỗi hiển thị chưa
// bọc, VÀ phải im với cả ba biến thể của mẫu bọc-ở-chỗ-dùng.
//
// Chiều thứ hai quan trọng hơn chiều thứ nhất. Nếu thuBocGianTiep hỏng thì luật 1
// đỏ 23 dòng vào code ĐÚNG, và cách sửa nhanh nhất khi đó là đổ 23 mục vào bảng
// miễn trừ — tức đúng cái mục ruỗng mà cơ chế ấy tồn tại để tránh. Bài kiểm này
// khóa cả ba biến thể lại để chuyện đó phải cố tình mới xảy ra được.
func TestLuat1CoRang(t *testing.T) {
	src := `package p

import "github.com/huuhoa143/ainovel-studio/internal/i18n"

// (a) chưa bọc — phải ĐỎ
func loi() string { return "章节已提交" }

// (b) đã bọc trực tiếp — phải xanh
func ok1() string { return i18n.F("章节已提交") }

// (c) bọc gián tiếp qua TÊN hằng — mẫu ctxpack/restore.go
const promptMsgid = "你是一个小说创作上下文摘要助手。"

var Prompt = i18n.F(promptMsgid)

// (d) bọc gián tiếp qua KHÓA composite của kiểu CÓ TÊN — mẫu host/stream_extract.go
type toolDisplay struct {
	header   string
	nakedKey string
}

var toolDisplays = map[string]toolDisplay{
	"plan_chapter": {header: "✻ 规划"},
	"draft":        {nakedKey: "content"},
}

func (e *toolDisplay) headerText() string { return i18n.F(e.header) }

// (e) bọc gián tiếp qua TRƯỜNG struct nội tuyến, phần tử KHÔNG khóa — mẫu entry/tui/theme.go
var statusDisplay = map[string]struct {
	icon  string
	label string
}{
	"READY": {"○", "就绪"},
	"ERROR": {"✕", "错误"},
}

func render(k string) string { return i18n.F(statusDisplay[k].label) }

// (f) ô KHÔNG được bọc trong cùng bảng vẫn phải bị canh — miễn trừ ở mức TRƯỜNG
var iconOnly = map[string]struct {
	icon  string
	label string
}{
	"X": {"设定", "完成"},
}
`
	fset, teps := napChuoi(t, "fixture.go", src)
	viPham, tk := quetChuaBoc(fset, teps)

	if tk.soGoiI18n != 4 {
		t.Fatalf("mẩu nguồn phải có 4 lời gọi i18n.F, thấy %d — mẩu đã trôi, bài kiểm rỗng nghĩa", tk.soGoiI18n)
	}
	// 章节已提交 ×2, 你是一个… ×1, ✻ 规划 ×1, 就绪/错误 ×2, 设定/完成 ×2 = 8
	if tk.soLiteralHan != 8 {
		t.Fatalf("mẩu nguồn phải có 8 literal Hán, thấy %d — mẩu đã trôi, bài kiểm rỗng nghĩa", tk.soLiteralHan)
	}
	// promptMsgid, "✻ 规划", "就绪", "错误", và ô .label = "完成" của bảng (f).
	if tk.soGianTiep != 5 {
		t.Fatalf("mẫu bọc-gián-tiếp phải nhận 5 literal (tên hằng, khóa composite, 3 ô .label), thấy %d",
			tk.soGianTiep)
	}

	// Đúng hai chỗ phải đỏ: hàm loi(), và ô .icon = "设定" trong bảng iconOnly.
	// Ô .label = "完成" cùng bảng thì được miễn — đó là miễn trừ ở mức TRƯỜNG.
	// Nhãn ô .icon mang cả tên TRƯỜNG: đó là độ mịn mà bảng miễn trừ tra được.
	muon := []string{`fixture.go:6  [loi]  "章节已提交"`, `fixture.go:45  [iconOnly.icon]  "设定"`}
	sort.Strings(muon)
	sort.Strings(viPham)
	got := strings.Join(viPham, " | ")
	if got != strings.Join(muon, " | ") {
		t.Fatalf("luật 1 sai:\n  muốn: %s\n  thấy: %s", strings.Join(muon, " | "), got)
	}
	t.Logf("bản lỗi → đỏ đúng 2 chỗ: %s", got)
	t.Logf("ba biến thể bọc-ở-chỗ-dùng → xanh (%d literal nhận qua mẫu, 0 mục miễn trừ tay)", tk.soGianTiep)
}

// TestMienTruTruongCoRang chứng minh miễn trừ độ mịn TRƯỜNG thật sự hẹp.
//
// Điều đáng canh không phải "hai mục hiện có còn hiệu lực" — mà là "một TRƯỜNG
// MỚI mọc ra sẽ KHÔNG được miễn theo". Đó là toàn bộ lý do hạ độ mịn xuống trường;
// nếu tính đó mất thì hai mục kia chỉ là bảng cũ viết dài hơn.
func TestMienTruTruongCoRang(t *testing.T) {
	const tep = "internal/stylestat/stylestat.go"

	for _, truong := range []string{"name", "re"} {
		if !laDuLieu(tep, "zhPatternDefs", truong) {
			t.Errorf("zhPatternDefs.%s phải được miễn — bảng miễn trừ đã trôi khỏi nguồn", truong)
		}
	}
	// Một trường thứ ba, chưa tồn tại: PHẢI KHÔNG được miễn.
	if laDuLieu(tep, "zhPatternDefs", "hint") {
		t.Fatal("zhPatternDefs.hint được miễn oan — miễn trừ đang rơi về độ mịn cả khai báo, " +
			"tức một trường hiển thị mọc thêm sau này sẽ lọt lưới trong im lặng")
	}
	if laDuLieu(tep, "zhPatternDefs", "") {
		t.Fatal("zhPatternDefs được miễn cả khai báo — mất đúng tính chất vừa dựng")
	}

	// Bản đồ trường phải giải được struct CÓ TÊN với phần tử KHÔNG khóa — hình dạng
	// thật của zhPatternDefs. Không giải được thì mọi mục .name/.re trên vô hiệu và
	// luật 1 sẽ đỏ, nên ca này chốt luôn cơ chế bangKieu/giaiKieu.
	src := "package stylestat\n\nimport \"regexp\"\n\n" +
		"type patternDef struct {\n\tname string\n\tre   *regexp.Regexp\n}\n\n" +
		"var zhPatternDefs = []patternDef{\n" +
		"\t{\"矫正句『不是…(而)是…』\", regexp.MustCompile(`不是[^。]{1,24}?是`)},\n}\n"

	_, teps := napChuoi(t, "internal/stylestat/stylestat.go", src)
	truongCua := banDoTruong(teps[0], bangKieu(teps))

	thay := map[string]string{}
	ast.Inspect(teps[0].f, func(n ast.Node) bool {
		lit, ok := n.(*ast.BasicLit)
		if !ok || lit.Kind != token.STRING {
			return true
		}
		if s, err := strconv.Unquote(lit.Value); err == nil && coChuHan(s) {
			thay[truongCua[lit.Pos()]] = s
		}
		return true
	})
	if len(thay) != 2 || thay["name"] == "" || thay["re"] == "" {
		t.Fatalf("bản đồ trường không giải được patternDef (phần tử KHÔNG khóa của kiểu CÓ TÊN): %v", thay)
	}
	t.Logf("giải đúng trường của kiểu có tên, phần tử không khóa: name=%q re=%q", thay["name"], thay["re"])
}

// TestLuat3CoRang cho luật 3 ăn cả ba dạng: trả sai (phá ghim), không trả, và
// lưu-rồi-trả (cách đúng).
func TestLuat3CoRang(t *testing.T) {
	ghim := `package host

import "github.com/huuhoa143/ainovel-studio/internal/i18n"

func init() { _ = i18n.SetLocale(i18n.Chinese) }
`
	xau := `package host

import (
	"testing"

	"github.com/huuhoa143/ainovel-studio/internal/i18n"
)

// (a) trả về DefaultLocale trong gói ghim zh — PHÁ GHIM
func TestTraSai(t *testing.T) {
	t.Cleanup(func() { _ = i18n.SetLocale(i18n.DefaultLocale) })
	_ = i18n.SetLocale(i18n.Vietnamese)
}

// (b) đổi locale mà không trả gì
func TestKhongTra(t *testing.T) {
	_ = i18n.SetLocale(i18n.Vietnamese)
}

// (c) lưu-rồi-trả — cách ĐÚNG
func TestDung(t *testing.T) {
	truoc := i18n.Active()
	t.Cleanup(func() { _ = i18n.SetLocale(truoc) })
	_ = i18n.SetLocale(i18n.Vietnamese)
}

// (d) trả về đúng hằng mà gói ghim — chấp nhận được
func TestTraDungHang(t *testing.T) {
	t.Cleanup(func() { _ = i18n.SetLocale(i18n.Chinese) })
	_ = i18n.SetLocale(i18n.Vietnamese)
}

// (e) chỗ trả do phụ trợ đăng ký hộ, QUA HAI TẦNG — hình dạng mà bản một tầng
//     báo bừa. datLocale → datLocaleStore → t.Cleanup.
func datLocaleStore(t *testing.T, loc i18n.Locale) {
	truoc := i18n.Active()
	t.Cleanup(func() { _ = i18n.SetLocale(truoc) })
	_ = i18n.SetLocale(loc)
}

func datLocale(t *testing.T, loc i18n.Locale) {
	datLocaleStore(t, loc)
}

func TestQuaHaiTangPhuTro(t *testing.T) {
	datLocale(t, i18n.Vietnamese)
	_ = i18n.SetLocale(i18n.Vietnamese)
}
`
	fset := token.NewFileSet()
	var teps []tepGo
	for _, tp := range []struct{ rel, src string }{
		{"internal/host/i18n_locale_pin_test.go", ghim},
		{"internal/host/xau_test.go", xau},
	} {
		f, err := parser.ParseFile(fset, tp.rel, tp.src, 0)
		if err != nil {
			t.Fatalf("phân tích %s: %v", tp.rel, err)
		}
		teps = append(teps, tepGo{rel: tp.rel, f: f})
	}

	viPham, _, ghimThay, soDoi := quetGhimLocale(fset, teps)
	if len(ghimThay) != 1 || ghimThay["internal/host"] != "Chinese" {
		t.Fatalf("bộ nhận gói-được-ghim hỏng: %v — không gói nào đang được canh, bài kiểm rỗng nghĩa", ghimThay)
	}
	// 4 hàm test + datLocaleStore đặt locale = 6 chỗ đổi (datLocale chỉ chuyển tiếp).
	if soDoi != 6 {
		t.Fatalf("phải thấy 6 chỗ đổi locale, thấy %d — mẩu nguồn đã trôi", soDoi)
	}
	if len(viPham) != 2 {
		t.Fatalf("luật 3 phải cho đúng 2 vi phạm (trả sai + không trả), thấy %d:\n%s",
			len(viPham), strings.Join(viPham, "\n"))
	}
	if !strings.Contains(strings.Join(viPham, "\n"), "TestTraSai") ||
		!strings.Contains(strings.Join(viPham, "\n"), "TestKhongTra") {
		t.Fatalf("bắt sai hàm — luật 3 không chỉ được đúng chỗ:\n%s", strings.Join(viPham, "\n"))
	}
	// TestQuaHaiTangPhuTro là ca chống-báo-bừa của phép lan truyền tới điểm bất
	// động. Bản một tầng gắn cờ đúng hàm này.
	for _, v := range viPham {
		for _, dung := range []string{"TestDung", "TestTraDungHang", "TestQuaHaiTangPhuTro", "datLocale"} {
			if strings.Contains(v, dung) {
				t.Fatalf("luật 3 BÁO BỪA vào cách viết đúng (%s): %s", dung, v)
			}
		}
	}
	t.Logf("bản lỗi → đỏ đúng 2 chỗ:\n  %s", strings.Join(viPham, "\n  "))
}

// TestLuat4CoRang kiểm cả hai chiều của luật 4: bắt msgid đã trôi, và im với văn
// bản mẫu.
//
// Chiều thứ hai là chiều dễ mất: nếu bộ nhận "tệp có gọi i18n.F/T" hỏng thì luật
// này báo bừa vào 4 hằng văn truyện tiếng Trung ở internal/rules và internal/e2e —
// và cách sửa nhanh nhất khi đó là dựng một bảng miễn trừ 4 mục cho một luật chỉ
// canh 4 mục, tức bảng dài bằng cái nó canh.
func TestLuat4CoRang(t *testing.T) {
	// (a) Tệp CÓ gọi i18n.F/T → hằng chữ Hán là msgid được neo.
	neo := `package guard

import "github.com/huuhoa143/ainovel-studio/internal/i18n"

const (
	msgConTrongCatalog = "生成第 %d 卷卷摘要（save_volume_summary）"
	msgDaTroi          = "生成第 %d 卷卷摘要（đã trôi vì upstream sửa câu gốc）"
)

func dung(m string) string { return i18n.F(m) }
`
	// (b) Tệp KHÔNG gọi i18n.F/T → hằng chữ Hán là văn bản mẫu, không phải msgid.
	//     Nguyên hình dạng của internal/rules/lint_locale_test.go.
	mau := `package rules

const vanTrungSach = "青石渡口在河湾处，水色由青转浊。"

func dem(s string) int { return len(s) }

func dung() int { return dem(vanTrungSach) }
`
	// Catalog thật, để phép kiểm neo vào dữ liệu đang dùng chứ không vào giả định.
	raw, err := localeFS.ReadFile("locales/vi.json")
	if err != nil {
		t.Fatalf("đọc vi.json: %v", err)
	}
	var c catalog
	if err := unmarshalCatalog(raw, &c); err != nil {
		t.Fatalf("phân tích vi.json: %v", err)
	}
	if _, co := c["生成第 %d 卷卷摘要（save_volume_summary）"]; !co {
		t.Fatal("msgid mốc không còn trong vi.json — mẩu nguồn đã trôi, bài kiểm này rỗng nghĩa")
	}

	_, teps := napChuoi(t, "guard/neo_test.go", neo)
	viPham, soNeo := quetMsgidNeo(teps, c, "vi.json")
	if soNeo != 2 {
		t.Fatalf("phải nhận 2 msgid được neo dạng HẰNG, thấy %d — bộ nhận đã hỏng, bài kiểm rỗng nghĩa", soNeo)
	}
	if len(viPham) != 1 {
		t.Fatalf("luật 4 KHÔNG có răng: phải bắt đúng 1 msgid đã trôi, thấy %d\n%s",
			len(viPham), strings.Join(viPham, "\n"))
	}
	if !strings.Contains(viPham[0], "msgDaTroi") {
		t.Fatalf("bắt sai hằng — luật 4 không chỉ được đúng chỗ: %s", viPham[0])
	}
	t.Logf("neo dạng HẰNG, msgid đã trôi → đỏ: %s", viPham[0])

	// Hình thức thứ hai: msgid NHÚNG THẲNG vào i18n.F. Đây là chỗ hở đã bịt —
	// lỗi prune catalog thật thuộc đúng họ này, chỉ khác cách khai báo.
	nhung := "package guard\n\n" +
		"import \"github.com/huuhoa143/ainovel-studio/internal/i18n\"\n\n" +
		"func conTrongCatalog() string { return i18n.F(\"生成第 %d 卷卷摘要（save_volume_summary）\") }\n\n" +
		"func daTroi() string { return i18n.F(\"生成第 %d 卷卷摘要（câu gốc đã đổi）\") }\n"

	_, teps = napChuoi(t, "guard/nhung_test.go", nhung)
	viPham, soNeo = quetMsgidNeo(teps, c, "vi.json")
	if soNeo != 2 {
		t.Fatalf("phải nhận 2 msgid nhúng thẳng, thấy %d — chân nhúng-thẳng đã hỏng, "+
			"và nó hỏng thì 38 điểm neo trên repo thôi được canh mà không ai biết", soNeo)
	}
	if len(viPham) != 1 || !strings.Contains(viPham[0], "nhúng thẳng") {
		t.Fatalf("luật 4 KHÔNG có răng ở dạng nhúng thẳng: phải bắt đúng 1, thấy %d\n%s",
			len(viPham), strings.Join(viPham, "\n"))
	}
	t.Logf("neo NHÚNG THẲNG, msgid đã trôi → đỏ: %s", viPham[0])

	_, teps = napChuoi(t, "rules/lint_locale_test.go", mau)
	viPham, soNeo = quetMsgidNeo(teps, c, "vi.json")
	if soNeo != 0 || len(viPham) != 0 {
		t.Fatalf("luật 4 BÁO BỪA vào văn bản mẫu: %d neo, %d vi phạm\n%s",
			soNeo, len(viPham), strings.Join(viPham, "\n"))
	}
	t.Logf("văn bản mẫu (tệp không gọi i18n.F/T) → không tính là msgid neo, 0 vi phạm")
}
