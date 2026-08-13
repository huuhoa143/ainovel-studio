package imp

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"

	"errors"
	"github.com/huuhoa143/ainovel-studio/internal/i18n"
	"github.com/huuhoa143/ainovel-studio/internal/utils"
	"golang.org/x/text/encoding/simplifiedchinese"
)

// 支持的源编码标签，写入 Manifest 与进度事件，不做无声兜底（RFC §7.1）。
const (
	encodingUTF8    = "utf-8"
	encodingUTF8BOM = "utf-8-bom"
	encodingGB18030 = "gb18030"
)

var utf8BOM = []byte{0xEF, 0xBB, 0xBF}

// decoded 是一次解码结果：文本 + 实际所选编码。
type decoded struct {
	text     string
	encoding string
}

// ErrEncodingUnreliable báo rằng không xác định được bảng mã của file một cách
// đáng tin. Là sentinel để chỗ gọi (và test) phân loại được mà không phải so
// chuỗi thông báo — chuỗi thông báo đi qua i18n nên đổi theo ngôn ngữ.
var ErrEncodingUnreliable = errors.New("encoding unreliable")

// decodeSource 按 UTF-8 / UTF-8 BOM / GB18030 顺序解码，返回所选编码。
// 无法可靠解码或出现替换字符时直接失败，错误包含检测结果，不把「尝试 GB18030」藏成无声兜底。
//
// Hàng rào cho nhánh GB18030 là "kết quả có thật sự giống tiếng Trung không",
// không phải "bộ giải mã có báo lỗi không" và cũng không chỉ là "có U+FFFD không".
// Lý do: bộ giải mã GB18030 gần như luôn thành công trên byte bất kỳ (bảng mã có
// nhánh 4 byte phủ hết không gian), nên hai tiêu chí cũ đều lọt. Cụ thể đã dựng
// được ca byte 8-bit giải mã ra UTF-8 hợp lệ, KHÔNG một U+FFFD nào, mà nội dung
// hoàn toàn là rác (tỉ lệ chữ Hán 0,023 — xem source_encoding_test.go). File
// tiếng Việt sai bảng mã đi qua cửa đó sẽ thành chữ Hán vô nghĩa và chạy tiếp cả
// pipeline phân tích/segment như dữ liệu thật.
//
// Vì sao chọn tiêu chí theo NỘI DUNG chứ không theo ngôn ngữ đang hoạt động:
// người dùng chạy giao diện tiếng Việt vẫn có toàn quyền nhập một bộ truyện Trung
// mã GBK — đó là ca hợp lệ, chặn theo locale sẽ chặn oan. Xét nội dung thì đúng
// cho cả hai chiều: nhận truyện Trung thật, từ chối rác ở bất kỳ ngôn ngữ nào.
func decodeSource(raw []byte) (decoded, error) {
	if bytes.HasPrefix(raw, utf8BOM) {
		body := raw[len(utf8BOM):]
		if !utf8.Valid(body) {
			return decoded{}, fmt.Errorf("%w: %s", ErrEncodingUnreliable,
				i18n.F("声明 UTF-8 BOM 但内容不是合法 UTF-8"))
		}
		return decoded{text: string(body), encoding: encodingUTF8BOM}, nil
	}
	if utf8.Valid(raw) {
		return decoded{text: string(raw), encoding: encodingUTF8}, nil
	}
	out, err := simplifiedchinese.GB18030.NewDecoder().Bytes(raw)
	if err != nil {
		return decoded{}, fmt.Errorf("%w: "+i18n.F("既不是合法 UTF-8，GB18030 解码也失败：%v"),
			ErrEncodingUnreliable, err)
	}
	if !utf8.Valid(out) {
		return decoded{}, fmt.Errorf("%w: %s", ErrEncodingUnreliable,
			i18n.F("GB18030 解码结果仍非合法 UTF-8，无法可靠解码"))
	}
	if i := bytes.IndexRune(out, utf8.RuneError); i >= 0 {
		return decoded{}, fmt.Errorf("%w: "+i18n.F("GB18030 解码出现替换字符（U+FFFD @ 字节 %d），无法可靠解码；请确认文件编码"),
			ErrEncodingUnreliable, i)
	}
	// Thông báo phải nói được ba điều để người dùng tự sửa được: file không phải
	// UTF-8, thứ đã thử, và việc cần làm tiếp. Nói "không đọc được file" thì người
	// dùng chỉ còn cách đoán.
	// Ba mảnh phải dịch RỜI rồi mới nối. Bản trước nối trước rồi bọc một lần ở
	// ngoài, nên đối số của i18n.F là chuỗi ghép lúc chạy: mảnh đầu (tiếng Trung)
	// + hai mảnh đã dịch. Khóa đó không thể có trong catalog, F trả nguyên đối số,
	// và người dùng nhận một câu nửa Trung nửa Việt. Đây là lớp lỗi mà bọc-lồng
	// luôn tạo ra: F ngoài cùng tra một khóa do chính F trong tạo ra.
	if text := string(out); !utils.LooksLikeChinese(text) {
		return decoded{}, fmt.Errorf("%w: "+i18n.F("文件不是 UTF-8；按 GB18030 解码后仅 %.0f%% 是汉字，")+
			i18n.F("判定为编码猜测错误而非中文原文（很可能是 Windows-1258/TCVN3 越南语文本或被截断的 UTF-8）。")+
			i18n.F("请先转换为 UTF-8 再导入，例如：iconv -f WINDOWS-1258 -t UTF-8 原文件 > 新文件"),
			ErrEncodingUnreliable, utils.HanRatio(text)*100)
	}
	return decoded{text: string(out), encoding: encodingGB18030}, nil
}

// normalize 只做不改变文学内容的转换：CRLF/CR 统一为 LF。
// 保留空行、缩进、标题行与正文字符；不删除首部文本、空章、广告或所谓尾部噪声（RFC §7.2）。
// BOM 已在 decodeSource 阶段剥离。
func normalize(text string) string {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")
	return text
}

// Ingest 读取源文件，解码、归一化，并以目录 rename 原子创建 meta/import/ 工作区快照。
// 返回工作区句柄与 Manifest；调用方据此发出进度事件。
func Ingest(bookDir, sourcePath string, in Intent) (*Workspace, *Manifest, error) {
	raw, err := os.ReadFile(sourcePath)
	if err != nil {
		return nil, nil, fmt.Errorf(i18n.F("读取源文件：%w"), err)
	}
	if len(bytes.TrimSpace(raw)) == 0 {
		return nil, nil, fmt.Errorf(i18n.F("源文件为空：%s"), sourcePath)
	}
	dec, err := decodeSource(raw)
	if err != nil {
		return nil, nil, err
	}
	normBytes := []byte(normalize(dec.text))

	m := Manifest{
		Version:          workspaceSchemaVersion,
		SourceName:       filepath.Base(sourcePath),
		RawSHA256:        Digest(raw),
		NormalizedSHA256: Digest(normBytes),
		Encoding:         dec.encoding,
		SizeBytes:        int64(len(raw)),
		CreatedAt:        time.Now().UTC().Format(time.RFC3339),
	}
	if in.Version == 0 {
		in.Version = workspaceSchemaVersion
	}

	ws, err := createWorkspace(bookDir, m, in, normBytes)
	if err != nil {
		return nil, nil, err
	}
	return ws, &m, nil
}

// SourceUnit 是模型可引用的稳定坐标（RFC §7.3）。
// ID 仅用于展示与模型引用；所有顺序/包含/递增判断一律按 (Line, Part) 数值序，禁止对 ID 字符串做字典序比较。
type SourceUnit struct {
	ID        string `json:"id"`   // L1257；超预算行拆为 L1257.1、L1257.2
	Line      int    `json:"line"` // 1 起
	Part      int    `json:"part"` // 0=整行；虚拟分片 1..N
	StartByte int    `json:"start_byte"`
	EndByte   int    `json:"end_byte"`
	Text      string `json:"text"`
}

// unitLess 定义 SourceUnit 的全序：先 Line 后 Part，均为数值比较（A1 修订）。
func unitLess(a, b SourceUnit) bool {
	if a.Line != b.Line {
		return a.Line < b.Line
	}
	return a.Part < b.Part
}

// buildSourceUnits 从归一化文本建立稳定坐标表。
// 正常行一个 unit；单行字节超过 maxUnitBytes 时只在 UTF-8 字符边界生成多个虚拟 unit，
// 不写回 source.txt、不插入软换行、不改变任何源字符（RFC §7.3）。maxUnitBytes<=0 表示不分片。
func buildSourceUnits(normalized []byte, maxUnitBytes int) []SourceUnit {
	var units []SourceUnit
	n := len(normalized)
	line := 0
	offset := 0
	for offset < n {
		nl := bytes.IndexByte(normalized[offset:], '\n')
		lineEnd := n
		if nl >= 0 {
			lineEnd = offset + nl
		}
		line++
		if maxUnitBytes > 0 && lineEnd-offset > maxUnitBytes {
			part := 0
			s := offset
			for s < lineEnd {
				e := s + maxUnitBytes
				if e >= lineEnd {
					e = lineEnd
				} else {
					for e > s && !utf8.RuneStart(normalized[e]) {
						e--
					}
					if e == s { // 单个超长 rune 的极端兜底
						e = s + maxUnitBytes
					}
				}
				part++
				units = append(units, SourceUnit{
					ID: fmt.Sprintf("L%d.%d", line, part), Line: line, Part: part,
					StartByte: s, EndByte: e, Text: string(normalized[s:e]),
				})
				s = e
			}
		} else {
			units = append(units, SourceUnit{
				ID: fmt.Sprintf("L%d", line), Line: line, Part: 0,
				StartByte: offset, EndByte: lineEnd, Text: string(normalized[offset:lineEnd]),
			})
		}
		if nl < 0 {
			break
		}
		offset = lineEnd + 1
	}
	return units
}

// resolveBoundaryByte 把一条边界决策映射为精确字节位置：
// 无 anchor 取 unit 起点；有 anchor 要求在该 unit 内唯一逐字命中，再映射为字节偏移（RFC §8.3）。
func resolveBoundaryByte(unitByID map[string]SourceUnit, unitID, anchor string) (int, error) {
	u, ok := unitByID[unitID]
	if !ok {
		return 0, fmt.Errorf(i18n.F("边界引用不存在的 unit：%s"), unitID)
	}
	if anchor == "" {
		return u.StartByte, nil
	}
	switch strings.Count(u.Text, anchor) {
	case 0:
		return 0, fmt.Errorf(i18n.F("锚点 %q 不在 unit %s 内"), anchor, unitID)
	case 1:
		return u.StartByte + strings.Index(u.Text, anchor), nil
	default:
		return 0, fmt.Errorf(i18n.F("锚点 %q 在 unit %s 内不唯一"), anchor, unitID)
	}
}
