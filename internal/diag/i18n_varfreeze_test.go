package diag

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

// Go khởi tạo biến cấp gói TRƯỚC khi chạy bất kỳ init() nào. Nên mọi chuỗi lấy
// qua i18n.F trong khởi tạo biến cấp gói bị ĐÓNG BĂNG theo locale đang bật lúc
// nạp package, và về sau không đổi được nữa. Hậu quả hai tầng:
//
//  1. Test không ghim được locale. i18n_locale_pin_test.go đặt SetLocale(Chinese)
//     trong init(), nhưng biến cấp gói đã đọc bản dịch xong trước đó. Đây từng
//     làm TestBriefErrIncludesAdapterFacts (internal/host/imp) đỏ: nó chốt
//     "上游服务错误" mà nhận "Lỗi dịch vụ thượng nguồn".
//  2. Nghiêm trọng hơn: đổi ngôn ngữ lúc chạy sẽ vô hiệu. Thêm lệnh /lang thì mọi
//     chuỗi nằm trong biến cấp gói giữ nguyên ngôn ngữ cũ — không lỗi, không log.
//
// Test này soi MÃ NGUỒN thay vì hành vi, cùng lý do với
// internal/entry/tui/command_config_tone_test.go: đây là bất biến về CÁCH VIẾT.
// Không có cách kiểm nào từ bên ngoài phát hiện được — với locale mặc định thì
// chuỗi đóng băng vẫn "đúng", nó chỉ sai khi locale đổi sau lúc nạp package.
//
// Bắt theo LỚP, không theo từng ca: quét toàn repo, và lần cả đường GIÁN TIẾP
// (var cấp gói gọi một hàm cùng package mà hàm đó gọi i18n.F). Đường gián tiếp
// từng tồn tại thật — analysisContract gọi chapterFactsSchema().
//
// Vì sao đặt ở internal/diag: nhà tự nhiên nhất là internal/i18n, nhưng package
// đó ngoài vùng được sửa của lượt này. diag là package chẩn đoán và đã có ghim
// locale, nên là chỗ hợp lý nhất trong vùng. Test không phụ thuộc gì vào diag —
// chuyển sang internal/i18n sau này chỉ cần đổi dòng package.

// varFreezeAllowlist là NỢ ĐÃ BIẾT, không phải ngoại lệ vĩnh viễn: các biến cấp
// gói vẫn đang đóng băng bản dịch, nằm ngoài vùng file của lượt sửa này.
//
// Khóa là "<đường dẫn tương đối>:<tên biến>". Sửa xong ca nào thì XÓA dòng đó.
// Danh sách rỗng đi là đích.
//
// Cố ý KHÔNG bắt lỗi khi một entry đã hết hiệu lực (chỉ t.Logf): repo này đang
// được nhiều lượt sửa song song, và một test đỏ vì người khác đã sửa xong thì
// gây hiểu nhầm nhiều hơn là giúp. Đánh đổi: nếu một file trong danh sách được
// sửa rồi sau đó có người thêm lại var mới ở đúng file ấy, test sẽ không bắt.
var varFreezeAllowlist = map[string]string{
	// Bốn prompt nén ngữ cảnh. restore.go giữ chữ Trung làm hằng ...Msgid rồi để
	// biến xuất giữ bản đã dịch, và ĐÃ ghi rõ đánh đổi trong comment: nếu thêm
	// lệnh đổi ngôn ngữ lúc chạy thì phải chuyển sang func. Lý do còn là var:
	// internal/agents/build.go truyền chúng vào agentcore dưới dạng string.
	"internal/agents/ctxpack/restore.go:WriterSummarySystemPrompt": "prompt nén ngữ cảnh, đánh đổi đã ghi trong restore.go",
	"internal/agents/ctxpack/restore.go:WriterSummaryPrompt":       "prompt nén ngữ cảnh, đánh đổi đã ghi trong restore.go",
	"internal/agents/ctxpack/restore.go:WriterUpdateSummaryPrompt": "prompt nén ngữ cảnh, đánh đổi đã ghi trong restore.go",
	"internal/agents/ctxpack/restore.go:WriterTurnPrefixPrompt":    "prompt nén ngữ cảnh, đánh đổi đã ghi trong restore.go",

	// Nhãn lựa chọn của TUI. Chưa sửa vì internal/entry/** ngoài vùng lượt này.
	"internal/entry/tui/command_model.go:modelRoleOptions":   "nhãn TUI, ngoài vùng sửa",
	"internal/entry/tui/command_model.go:allThinkingOptions": "nhãn TUI, ngoài vùng sửa",
}

func TestKhongDichChuoiTrongKhoiTaoBienCapGoi(t *testing.T) {
	root := moduleRoot(t)
	hits := scanVarFreeze(t, root)

	seen := make(map[string]bool, len(hits))
	for _, h := range hits {
		key := h.file + ":" + h.varName
		seen[key] = true
		if _, ok := varFreezeAllowlist[key]; ok {
			continue
		}
		t.Errorf("%s:%d biến cấp gói %q lấy chuỗi qua i18n%s — bản dịch bị đóng băng lúc nạp package.\n"+
			"  Sửa: bọc thành func để bản dịch được đọc lúc DÙNG, ví dụ\n"+
			"      func %s() T { return T{...} }\n"+
			"  KHÔNG dùng sync.Once để cache — cache chính là cái bug này.\n"+
			"  Nếu là sentinel error cần errors.Is: đổi sang type có Error() gọi i18n.F\n"+
			"  (xem invalidWriteTargetError trong internal/host/engine.go).",
			h.file, h.line, h.varName, h.via, h.varName)
	}

	for key, why := range varFreezeAllowlist {
		if !seen[key] {
			t.Logf("entry allowlist đã hết hiệu lực, xóa đi: %s (%s)", key, why)
		}
	}
}

// varFreezeHit là một biến cấp gói đọc bản dịch lúc nạp package.
type varFreezeHit struct {
	file    string // đường dẫn tương đối module root
	line    int
	varName string
	via     string // "" nếu gọi i18n.F trực tiếp; " (qua <hàm>)" nếu gián tiếp
}

// moduleRoot leo ngược từ thư mục package đến chỗ có go.mod. Không hard-code độ
// sâu để test còn đúng khi file này được chuyển sang package khác.
func moduleRoot(t *testing.T) string {
	t.Helper()
	dir, err := filepath.Abs(".")
	if err != nil {
		t.Fatal(err)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatal("không tìm thấy go.mod khi leo ngược từ thư mục package")
		}
		dir = parent
	}
}

// scanVarFreeze phân tích từng package Go trong repo và trả về mọi biến cấp gói
// mà giá trị khởi tạo đọc bản dịch — trực tiếp hoặc qua hàm cùng package.
func scanVarFreeze(t *testing.T, root string) []varFreezeHit {
	t.Helper()

	// Gom file theo (thư mục, tên package): một thư mục có thể chứa cả `package
	// foo` và `package foo_test`, và hàm chỉ tra được trong cùng package.
	type pkgKey struct{ dir, name string }
	files := map[pkgKey][]*ast.File{}
	fset := token.NewFileSet()

	err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			switch d.Name() {
			case ".git", "vendor", "node_modules", "testdata":
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(path, ".go") {
			return nil
		}
		f, perr := parser.ParseFile(fset, path, nil, parser.SkipObjectResolution)
		if perr != nil {
			return nil // file không parse được không phải việc của test này
		}
		k := pkgKey{dir: filepath.Dir(path), name: f.Name.Name}
		files[k] = append(files[k], f)
		return nil
	})
	if err != nil {
		t.Fatalf("quét cây nguồn: %v", err)
	}
	if len(files) == 0 {
		t.Fatal("không quét được package nào — test sẽ rỗng mà trông như đang gác")
	}

	var hits []varFreezeHit
	for _, pkgFiles := range files {
		funcs := map[string]*ast.FuncDecl{}
		for _, f := range pkgFiles {
			for _, d := range f.Decls {
				if fd, ok := d.(*ast.FuncDecl); ok && fd.Recv == nil && fd.Body != nil {
					funcs[fd.Name.Name] = fd
				}
			}
		}
		for _, f := range pkgFiles {
			hits = append(hits, scanFile(fset, f, funcs, root)...)
		}
	}
	sort.Slice(hits, func(i, j int) bool {
		if hits[i].file != hits[j].file {
			return hits[i].file < hits[j].file
		}
		return hits[i].line < hits[j].line
	})
	return hits
}

// scanFile tìm hit trong các khai báo var/const cấp gói của một file.
// const cũng xét: i18n.F không phải hằng nên đó là lỗi biên dịch, nhưng bắt luôn
// thì thông báo của test rõ hơn lỗi của compiler.
func scanFile(fset *token.FileSet, f *ast.File, funcs map[string]*ast.FuncDecl, root string) []varFreezeHit {
	i18nName, ok := i18nLocalName(f)
	if !ok {
		return nil // file không import i18n thì không thể có hit
	}
	rel := relPath(fset, f, root)

	var hits []varFreezeHit
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
			names := make([]string, 0, len(vs.Names))
			for _, n := range vs.Names {
				names = append(names, n.Name)
			}
			name := strings.Join(names, ",")

			for _, v := range vs.Values {
				if pos, via, found := findTranslation(v, i18nName, funcs, map[string]bool{}); found {
					hits = append(hits, varFreezeHit{
						file:    rel,
						line:    fset.Position(pos).Line,
						varName: name,
						via:     via,
					})
					break // một hit cho mỗi spec là đủ để báo
				}
			}
		}
	}
	return hits
}

// findTranslation tìm lời gọi đọc bản dịch trong một biểu thức: trực tiếp
// (<i18n>.F/.T/...) hoặc gián tiếp qua hàm cùng package. visited chặn đệ quy vòng.
func findTranslation(n ast.Node, i18nName string, funcs map[string]*ast.FuncDecl, visited map[string]bool) (token.Pos, string, bool) {
	var pos token.Pos
	var via string
	found := false

	ast.Inspect(n, func(node ast.Node) bool {
		if found {
			return false
		}
		ce, ok := node.(*ast.CallExpr)
		if !ok {
			return true
		}
		switch fn := ce.Fun.(type) {
		case *ast.SelectorExpr:
			// <i18n>.F(...) / <i18n>.T(...)
			if id, ok := fn.X.(*ast.Ident); ok && id.Name == i18nName {
				pos, via, found = ce.Pos(), "", true
				return false
			}
		case *ast.Ident:
			// Hàm cùng package: lần vào thân nó.
			callee, ok := funcs[fn.Name]
			if !ok || visited[fn.Name] {
				return true
			}
			visited[fn.Name] = true
			if _, _, deep := findTranslation(callee.Body, i18nName, funcs, visited); deep {
				pos, via, found = ce.Pos(), " (qua "+fn.Name+")", true
				return false
			}
		}
		return true
	})
	return pos, via, found
}

// i18nLocalName trả về tên định danh mà file này gắn cho package i18n, xử lý cả
// import có bí danh. Trả false nếu file không import i18n.
func i18nLocalName(f *ast.File) (string, bool) {
	for _, imp := range f.Imports {
		path := strings.Trim(imp.Path.Value, `"`)
		if path != "github.com/huuhoa143/ainovel-studio/internal/i18n" {
			continue
		}
		if imp.Name != nil {
			if imp.Name.Name == "_" || imp.Name.Name == "." {
				return "", false
			}
			return imp.Name.Name, true
		}
		return "i18n", true
	}
	return "", false
}

func relPath(fset *token.FileSet, f *ast.File, root string) string {
	abs := fset.Position(f.Package).Filename
	if rel, err := filepath.Rel(root, abs); err == nil {
		return filepath.ToSlash(rel)
	}
	return filepath.ToSlash(abs)
}
