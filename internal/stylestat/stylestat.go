// Package stylestat 对已写正文做全书级风格统计，产出纯事实。
//
// 动机：弧内评审窗口（~10 章）对全书级模式固化天然失明——句式 tic 章均几十次、
// 章末形态同构、跨章复读，单章看每处都"正常"，只有全书统计能暴露。统计归代码
// （确定性、零幻觉），裁定归 LLM（editor 按数字判维度分，writer 据此自避免）。
package stylestat

import (
	"regexp"
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/huuhoa143/ainovel-studio/internal/domain"
	"github.com/huuhoa143/ainovel-studio/internal/i18n"
)

// minChapters 少于此章数不出统计——样本太小，频率没有意义。
const minChapters = 5

// phraseWindow 动态短语挖掘只看最近 N 章：writer 需要避免的是"现在的口头禅"。
const phraseWindow = 20

// Input 统计输入。Chapters 按章号升序；Stopwords 为角色名等专有名词，
// 动态短语挖掘时跳过（出场人名天然高频，不是文风问题）。
type Input struct {
	Chapters  []string
	Titles    []string
	Stopwords []string
}

// Stats 全书风格统计结果。所有字段都是事实计数，不含任何裁定或指令。
type Stats struct {
	Chapters          int            `json:"chapters"`
	Patterns          []PatternStat  `json:"patterns,omitempty"`
	TopPhrases        []PhraseStat   `json:"top_phrases,omitempty"`
	RepeatedSentences []SentenceStat `json:"repeated_sentences,omitempty"`
	Ending            EndingStat     `json:"ending"`
	OpeningTimeRate   float64        `json:"opening_time_rate"`
	TitleFormats      *TitleStat     `json:"title_formats,omitempty"`
}

// PatternStat 固定句式模式类的全书计数（通用 AI 文风 tic）。
type PatternStat struct {
	Name       string  `json:"name"`
	Total      int     `json:"total"`
	PerChapter float64 `json:"per_chapter"`
}

// PhraseStat 最近 phraseWindow 章内挖掘出的高频短语。
type PhraseStat struct {
	Text  string `json:"text"`
	Count int    `json:"count"`
}

// SentenceStat 跨章逐字重复的长句（复读交代的直接证据）。
type SentenceStat struct {
	Text     string `json:"text"`
	Chapters int    `json:"chapters"`
	Count    int    `json:"count"`
}

// EndingStat 章末行形态分布。短结尾本身合法，全书同构才是问题。
type EndingStat struct {
	ShortRatio  float64 `json:"short_ratio"`
	MedianRunes int     `json:"median_runes"`
}

// TitleStat 章节标题「第N章」前缀混用计数（混用=机制痕迹暴露在产物里）。
type TitleStat struct {
	WithPrefix    int `json:"with_prefix"`
	WithoutPrefix int `json:"without_prefix"`
}

type patternDef struct {
	name string
	re   *regexp.Regexp
}

// zhPatternDefs 通用 AI 文风句式模式。计数是近似（正则不做语法分析），
// 用途是本书自身的纵向基线对比，绝对精度不重要。
var zhPatternDefs = []patternDef{
	{"矫正句『不是…(而)是…』", regexp.MustCompile(`不是[^。！？\n]{1,24}?[，、]?(?:而)?是`)},
	{"计时量词『X息/X瞬』", regexp.MustCompile(`[一两二三四五六七八九十几数半][息瞬]`)},
	{"明喻『像一/仿佛/如同/宛如』", regexp.MustCompile(`像一|仿佛|如同|宛如`)},
	{"沉默节拍『沉默了/没有说话/没有回头』", regexp.MustCompile(`沉默了|没有说话|没有回头`)},
	{"神态模板『眼中闪过/嘴角勾起/咬了咬唇』", regexp.MustCompile(`眼[中底]闪过|目光一凝|瞳孔一缩|眼眶微红|嘴角[微轻一]?[勾扬翘]|咬了咬唇|不可置信`)},
	{"躯体反应『心头一紧/身子一颤/倒吸凉气』", regexp.MustCompile(`心头一[紧沉颤]|身子一[颤震僵]|倒吸(?:了)?一口凉气`)},
	{"思维标记『心想/意识到/感到/觉得』", regexp.MustCompile(`心想|意识到|感到|觉得`)},
	{"抽象套话『一种说不出的/的意义在于』", regexp.MustCompile(`一种说不出的|说不清[的道]|的意义在于|真正的[^。！？\n]{1,10}是`)},
}

// viPatternDefs là bộ mẫu giọng-AI cho văn tiếng Việt.
//
// Đây KHÔNG phải bản dịch máy của bộ zh. Tám lớp đầu giữ đúng ý nghĩa chẩn đoán
// của lớp zh tương ứng (câu chỉnh nghĩa, lượng từ thời gian, so sánh sáo, nhịp
// im lặng, mẫu thần thái, phản ứng cơ thể, đánh dấu suy nghĩ, sáo trừu tượng) —
// giữ ánh xạ 1-1 để đường zh và vi so được với nhau khi đọc báo cáo. Ba lớp cuối
// là tật riêng của văn Việt do LLM/dịch máy sinh ra, tiếng Trung không có:
//
//   - "một cách + tính từ": cách dịch máy của trạng ngữ 地 tiếng Trung. Người
//     Việt viết "nhìn lạnh lùng", máy viết "nhìn một cách lạnh lùng". Đây là dấu
//     hiệu dịch máy mạnh nhất và gần như không xuất hiện trong văn viết tự nhiên.
//   - "của + đại từ": tiếng Việt lược sở hữu ("ánh mắt hắn"), dịch từ 的 thì
//     bê nguyên "của" vào ("ánh mắt của hắn"). Dày đặc = văn dịch chưa gột.
//   - liên từ mở câu ("Tuy nhiên,", "Bên cạnh đó,"): LLM viết văn kể như viết
//     văn nghị luận. Chỉ tính khi đứng đầu dòng để không bắt lẫn giữa câu.
//
// Đánh đổi có ý thức: các lớp này cố tình KHÔNG gồm những cụm cực phổ thông như
// "giống như" hay "trong lòng" đứng một mình. Chúng xuất hiện dày trong cả văn
// hay lẫn văn dở, nên đếm chúng chỉ tạo nhiễu nền lớn, dìm mất phần tín hiệu.
var viPatternDefs = []patternDef{
	{"Câu chỉnh nghĩa (không phải… mà là…)", regexp.MustCompile(`(?i)(?:không|chẳng) phải[^.!?…\n]{1,40}?,?\s*mà (?:là|vì|do|bởi)`)},
	{"Lượng từ thời gian (trong nháy mắt/tích tắc)", regexp.MustCompile(`(?i)(?:trong|sau) (?:nháy mắt|tích tắc|thoáng chốc|chớp mắt|khoảnh khắc)|(?:vài|một) (?:hơi thở|nhịp tim)`)},
	{"So sánh sáo (tựa như/chẳng khác nào/hệt như)", regexp.MustCompile(`(?i)tựa như|chẳng khác nào|hệt như|y hệt|như thể|như một (?:vệt|làn|tiếng|cái|con)`)},
	{"Nhịp im lặng (im lặng/không đáp/không nói gì)", regexp.MustCompile(`(?i)im lặng|lặng đi|không (?:nói (?:gì|lời nào)|đáp|quay đầu lại)|chẳng nói chẳng rằng`)},
	{"Mẫu thần thái (khóe miệng/ánh mắt lóe lên)", regexp.MustCompile(`(?i)khóe (?:miệng|môi)|(?:ánh mắt|đáy mắt)[^.!?…\n]{0,12}(?:lóe|loé|vụt|thoáng)|(?:nhíu|nhướn|nhướng) (?:mày|mắt)|con ngươi co|không thể tin được`)},
	{"Phản ứng cơ thể (tim thắt lại/người khẽ run)", regexp.MustCompile(`(?i)tim[^.!?…\n]{0,6}(?:thắt|nhói|chùng|đập dồn)|(?:người|thân) (?:khẽ )?(?:run|rung|cứng lại)|hít (?:vào|sâu) một (?:hơi|ngụm)|sống lưng[^.!?…\n]{0,12}lạnh|toàn thân[^.!?…\n]{0,10}(?:cứng|run|lạnh)`)},
	{"Đánh dấu suy nghĩ (cảm thấy/nhận ra/nghĩ rằng)", regexp.MustCompile(`(?i)cảm thấy|nhận ra|nghĩ (?:rằng|thầm)|thấy rằng|hiểu ra|tự nhủ`)},
	{"Sáo trừu tượng (cảm giác khó tả/ý nghĩa nằm ở)", regexp.MustCompile(`(?i)cảm giác[^.!?…\n]{0,14}(?:khó tả|không (?:thể )?(?:diễn tả|gọi tên))|không (?:thể )?diễn tả (?:được|nổi)|ý nghĩa[^.!?…\n]{0,10}(?:nằm ở|là ở)`)},
	{"Trạng ngữ dịch máy (một cách + tính từ)", regexp.MustCompile(`(?i)một cách \p{L}+`)},
	{"Sở hữu dịch máy (của + đại từ)", regexp.MustCompile(`(?i)của (?:hắn|nàng|y|gã|chàng|ta|tôi|cô ấy|anh ấy)\b`)},
	{"Liên từ nghị luận mở câu (Tuy nhiên,/Bên cạnh đó,)", regexp.MustCompile(`(?im)^\s*(?:#{0,3}\s*)?(?:Tuy nhiên|Đồng thời|Bên cạnh đó|Chính vì vậy|Không chỉ vậy|Hơn thế nữa|Mặt khác|Nói cách khác)\s*,`)},
}

// langProfile gom mọi tham số phụ thuộc ngôn ngữ vào một chỗ.
//
// Vì sao chọn kiểu này thay vì xóa bộ zh: repo vẫn chạy được AINOVEL_LANG=zh để
// đối chiếu hành vi với upstream (xem internal/i18n). Nếu thay tại chỗ thì đường
// zh chết, và mọi test ghim locale=zh trong repo trở thành vô nghĩa. Gom thành
// profile cũng khiến việc thêm ngôn ngữ thứ ba chỉ là thêm một biến, không phải
// rải if khắp file.
type langProfile struct {
	patterns []patternDef
	// sentenceEnders là tập rune kết câu (ngoài '\n' luôn được tính).
	sentenceEnders string
	// guardDecimal: dấu '.' kẹp giữa hai chữ số không phải kết câu ("1.000").
	// Chỉ cần cho chữ Latin; tiếng Trung dùng 。nên không có xung đột.
	guardDecimal bool
	openingTime  *regexp.Regexp
	titlePrefix  *regexp.Regexp
	// wordBased quyết định đơn vị đo độ dài: chữ Hán đo bằng rune, còn tiếng
	// Việt phải đo bằng chữ, nếu không mọi ngưỡng lệch ~4,75 lần (xem
	// domain.WordCount). Ngưỡng số học giữ nguyên vì 1 chữ Hán ≈ 1 chữ Việt.
	wordBased bool
}

// viNumeralWord là các tiếng cấu tạo số đếm tiếng Việt, đủ phủ "bốn mươi bảy",
// "một trăm linh hai". Giữ đồng bộ với bộ nhận tiêu đề chương ở
// internal/host/exp/txt.go — hai chỗ cùng trả lời một câu hỏi ("dòng này có phải
// tiêu đề chương không") nên lệch nhau là lỗi chờ xảy ra.
const viNumeralWord = `(?:không|một|hai|ba|bốn|tư|năm|sáu|bảy|tám|chín|mười|mươi|trăm|nghìn|ngàn|linh|lẻ)`

var zhProfile = langProfile{
	patterns:       zhPatternDefs,
	sentenceEnders: "。！？",
	openingTime:    regexp.MustCompile(`夜|清晨|黎明|天亮|醒来|晨光|一整夜`),
	titlePrefix:    regexp.MustCompile(`^#{0,2}\s*第[零〇一二三四五六七八九十百千万\d]+章`),
}

var viProfile = langProfile{
	patterns:       viPatternDefs,
	sentenceEnders: ".!?…",
	guardDecimal:   true,
	openingTime: regexp.MustCompile(`(?i)đêm|sáng sớm|bình minh|rạng đông|hừng đông|` +
		`trời (?:vừa |đã )?sáng|tỉnh (?:giấc|lại)|thức giấc|ánh (?:nắng|sáng) (?:ban )?mai|mở mắt`),
	// Nhận cả dạng Việt và dạng Trung: sách nhập từ nguồn tiếng Trung vẫn còn
	// tiêu đề gốc, bỏ dạng zh ở đây thì thống kê "lẫn định dạng tiêu đề" mù một nửa.
	//
	// Phần tiếng Việt phải chặt hơn hẳn phần tiếng Trung. "第…章" gần như không thể
	// trùng câu văn, còn "Chương" thì trùng đầy: "Chương trình", và nguy hiểm hơn là
	// tên chương chứa chính từ số — "Chương Ba Đào", "Chương Mười Hai Bến Nước".
	// Vì thế bắt buộc: sau "chương" phải có SỐ, và nếu số viết bằng chữ thì phải
	// kết thúc bằng dấu ngắt hoặc hết dòng. Bỏ điều kiện đó thì tên chương bị đếm
	// thành "có tiền tố số thứ tự" và thống kê lẫn định dạng báo sai.
	titlePrefix: regexp.MustCompile(`(?i)^#{0,3}\s*(?:chương\s+(?:\d+(?:[^\p{L}\p{N}]|$)|` +
		viNumeralWord + `(?:\s+` + viNumeralWord + `)*\s*(?:[:.…\-–—]|$))` +
		`|第[零〇一二三四五六七八九十百千万\d]+章)`),
	wordBased: true,
}

// profile chọn bộ tham số theo ngôn ngữ đang hoạt động.
func profile() *langProfile {
	if i18n.Active() == i18n.Chinese {
		return &zhProfile
	}
	return &viProfile
}

// PatternNames trả về tên mọi lớp mẫu của ngôn ngữ đang hoạt động.
//
// Có để package assets kiểm được hợp đồng "mỗi lớp được đếm phải có một mục
// trong references/anti-ai-tone.md". Không có hàm này thì test bên đó buộc phải
// tự dựng corpus khởi đủ mọi lớp, mà corpus thì luôn lạc hậu: thêm một lớp mẫu
// mới sẽ lọt lưới trong im lặng — đúng cái lỗi mà hợp đồng đó sinh ra để chặn.
func PatternNames() []string {
	p := profile()
	out := make([]string, 0, len(p.patterns))
	for _, def := range p.patterns {
		out = append(out, def.name)
	}
	return out
}

// length đo độ dài một đoạn theo đơn vị của ngôn ngữ.
func (p *langProfile) length(s string) int {
	if p.wordBased {
		return domain.WordCount(s)
	}
	return len([]rune(s))
}

// splitSentences cắt câu theo dấu kết câu của ngôn ngữ.
//
// Viết tay thay vì dùng regexp vì RE2 không có lookbehind, mà quy tắc "dấu chấm
// kẹp giữa hai chữ số không phải kết câu" cần nhìn cả rune trước và sau. Bỏ quy
// tắc đó thì "1.000 lượng" chẻ thành hai mảnh vụn, cả hai đều dưới ngưỡng độ dài
// nên câu biến mất khỏi thống kê — mất dữ liệu mà không có lỗi.
func (p *langProfile) splitSentences(text string) []string {
	var out []string
	start := 0
	var prev rune
	for i, r := range text {
		if r != '\n' && !strings.ContainsRune(p.sentenceEnders, r) {
			prev = r
			continue
		}
		size := utf8.RuneLen(r)
		if p.guardDecimal && r == '.' && unicode.IsDigit(prev) && unicode.IsDigit(nextRune(text, i+size)) {
			prev = r
			continue
		}
		out = append(out, text[start:i])
		start = i + size
		prev = r
	}
	return append(out, text[start:])
}

func nextRune(s string, i int) rune {
	if i >= len(s) {
		return 0
	}
	r, _ := utf8.DecodeRuneInString(s[i:])
	return r
}

// shortEndingLen 末行不超过此字数计为"短结尾"（中文按 rune，越南文按词，
// 因 1 汉字 ≈ 1 越南语词，阈值数值不变）。
const shortEndingLen = 30

// minRepeatLen 是độ dài tối thiểu để một câu được xét lặp, cùng đơn vị với
// shortEndingLen.
const minRepeatLen = 12

// Compute 计算全书风格统计；章数不足时返回 nil。
func Compute(in Input) *Stats {
	n := len(in.Chapters)
	if n < minChapters {
		return nil
	}
	all := strings.Join(in.Chapters, "\n")
	p := profile()

	s := &Stats{Chapters: n}
	for _, def := range p.patterns {
		total := len(def.re.FindAllStringIndex(all, -1))
		if total == 0 {
			continue
		}
		s.Patterns = append(s.Patterns, PatternStat{
			Name:       def.name,
			Total:      total,
			PerChapter: round1(float64(total) / float64(n)),
		})
	}
	s.TopPhrases = minePhrases(p, recentWindow(in.Chapters), in.Stopwords)
	s.RepeatedSentences = repeatedSentences(p, in.Chapters)
	s.Ending = endingShape(p, in.Chapters)
	s.OpeningTimeRate = openingTimeRate(p, in.Chapters)
	s.TitleFormats = titleFormats(p, in.Titles)
	return s
}

func recentWindow(chapters []string) []string {
	if len(chapters) <= phraseWindow {
		return chapters
	}
	return chapters[len(chapters)-phraseWindow:]
}

// minePhrases 在窗口内挖掘 3-6 字高频短语。
// 过滤：含标点/空白、首尾虚词、命中专有名词；去重：与已选短语互为子串的丢弃。
//
// Với tiếng Việt, "3-6 字" phải hiểu là 3-6 CHỮ (âm tiết cách nhau bằng dấu
// cách), không phải 3-6 rune: đếm theo rune thì n-gram cắt ngang giữa từ và ra
// toàn mảnh vô nghĩa, mà thực tế còn tệ hơn — validGram cũ đòi mọi rune nằm
// trong khối chữ Hán nên với văn Việt TopPhrases LUÔN rỗng, tức cơ chế "writer
// tự tránh khẩu ngữ đang lặp" tắt hoàn toàn trong khi báo cáo vẫn nói sạch.
func minePhrases(p *langProfile, chapters []string, stopwords []string) []PhraseStat {
	text := strings.Join(chapters, "\n")
	threshold := max(8, len(chapters)/2)

	var counts map[string]int
	var stopGrams []string
	if p.wordBased {
		counts = countWordGrams(text)
		stopGrams = stopwordWordGrams(stopwords)
	} else {
		counts = countRuneGrams(text)
		stopGrams = stopwordBigrams(stopwords)
	}

	type cand struct {
		text  string
		count int
	}
	var cands []cand
	for g, c := range counts {
		if c < threshold || hitStopword(g, stopGrams) {
			continue
		}
		cands = append(cands, cand{g, c})
	}
	sort.Slice(cands, func(i, j int) bool {
		if cands[i].count != cands[j].count {
			return cands[i].count > cands[j].count
		}
		// 同频取更长的（信息量更大），再按字典序稳定排序
		if len(cands[i].text) != len(cands[j].text) {
			return len(cands[i].text) > len(cands[j].text)
		}
		return cands[i].text < cands[j].text
	})

	var out []PhraseStat
	for _, c := range cands {
		if len(out) >= 8 {
			break
		}
		dup := false
		for _, picked := range out {
			if strings.Contains(picked.Text, c.text) || strings.Contains(c.text, picked.Text) {
				dup = true
				break
			}
		}
		if !dup {
			out = append(out, PhraseStat{Text: c.text, Count: c.count})
		}
	}
	return out
}

// countRuneGrams đếm n-gram 3-6 rune cho văn viết liền (chữ Hán).
func countRuneGrams(text string) map[string]int {
	runes := []rune(text)
	counts := make(map[string]int)
	for size := 3; size <= 6; size++ {
		for i := 0; i+size <= len(runes); i++ {
			gram := runes[i : i+size]
			if !validGram(gram) {
				continue
			}
			counts[string(gram)]++
		}
	}
	return counts
}

// countWordGrams đếm n-gram 2-6 CHỮ cho văn viết rời (tiếng Việt).
//
// Cận dưới là 2 chứ không phải 3 như tiếng Trung: tật tiếng Việt hay gọn hơn
// ("khóe miệng", "im lặng"), mà một cụm 2 chữ Việt đã tương đương lượng thông
// tin của 2-4 chữ Hán. n-gram không bắc qua ranh giới câu — cụm vắt từ cuối câu
// này sang đầu câu sau không phải một cụm từ, nó là trùng hợp của dấu câu.
func countWordGrams(text string) map[string]int {
	counts := make(map[string]int)
	for _, clause := range splitClauses(text) {
		words := strings.Fields(clause)
		for size := 2; size <= 6; size++ {
			for i := 0; i+size <= len(words); i++ {
				gram := words[i : i+size]
				if !validWordGram(gram) {
					continue
				}
				counts[strings.Join(gram, " ")]++
			}
		}
	}
	return counts
}

// clauseBreak là mọi dấu ngắt mệnh đề của chữ Latin — n-gram không được bắc qua.
var clauseBreak = regexp.MustCompile(`[.!?…,;:—–()"“”‘’\[\]\n\t]+`)

func splitClauses(text string) []string {
	return clauseBreak.Split(text, -1)
}

// gramEdgeStop 首尾为这些虚词/代词的 n-gram 不是文风短语，跳过。
const gramEdgeStop = "的了着是在和与就也都还又把被他她它我你这那"

func validGram(gram []rune) bool {
	for _, r := range gram {
		if r < 0x4E00 || r > 0x9FFF { // 仅纯汉字片段
			return false
		}
	}
	if strings.ContainsRune(gramEdgeStop, gram[0]) || strings.ContainsRune(gramEdgeStop, gram[len(gram)-1]) {
		return false
	}
	return true
}

// viEdgeStop là các hư từ/đại từ tiếng Việt: cụm mở hoặc đóng bằng chúng thì
// không phải một cụm văn phong mà chỉ là mảnh ngữ pháp bị cắt ngang.
// Tương ứng với gramEdgeStop của tiếng Trung.
var viEdgeStop = map[string]bool{
	"của": true, "là": true, "đã": true, "đang": true, "sẽ": true, "và": true,
	"với": true, "thì": true, "cũng": true, "đều": true, "còn": true, "lại": true,
	"bị": true, "được": true, "này": true, "đó": true, "kia": true, "ấy": true,
	"một": true, "các": true, "những": true, "cái": true, "rằng": true, "mà": true,
	"nhưng": true, "vì": true, "nên": true, "ở": true, "trong": true, "ngoài": true,
	"cho": true, "từ": true, "đến": true, "khi": true, "nếu": true, "hay": true,
	"hoặc": true, "về": true, "ra": true, "vào": true, "lên": true, "xuống": true,
	"rồi": true, "vẫn": true, "chỉ": true, "hắn": true, "nàng": true, "y": true,
	"gã": true, "ta": true, "tôi": true, "cô": true, "anh": true, "chàng": true,
	"nó": true, "họ": true, "mình": true, "có": true, "không": true, "đi": true,
}

// validWordGram lọc cụm chỉ gồm chữ, không mở/đóng bằng hư từ.
func validWordGram(gram []string) bool {
	for _, w := range gram {
		if w == "" {
			return false
		}
		for _, r := range w {
			// Chỉ nhận chữ và dấu tổ hợp: số liệu, ký hiệu không phải văn phong.
			if !unicode.IsLetter(r) && !unicode.Is(unicode.M, r) {
				return false
			}
		}
	}
	return !viEdgeStop[strings.ToLower(gram[0])] && !viEdgeStop[strings.ToLower(gram[len(gram)-1])]
}

// stopwordWordGrams tách tên riêng thành các cặp CHỮ liền nhau, cùng triết lý
// với stopwordBigrams của tiếng Trung: tên hay vào văn dưới dạng một phần
// ("Cửu Uyên chắp tay" chứa "Cửu Uyên"), khớp theo tên đầy đủ sẽ lọt lưới.
//
// Cố tình KHÔNG lọc theo từng âm tiết đơn: âm tiết trong tên người Việt ("Lâm",
// "Vân", "Anh") đồng thời là từ thường dùng, lọc lẻ sẽ xóa oan cả cụm văn phong
// hợp lệ. Cặp hai chữ là mức chặt vừa đủ.
func stopwordWordGrams(stopwords []string) []string {
	var grams []string
	for _, w := range stopwords {
		words := strings.Fields(strings.TrimSpace(w))
		if len(words) == 1 {
			grams = append(grams, strings.ToLower(words[0]))
			continue
		}
		for i := 0; i+2 <= len(words); i++ {
			grams = append(grams, strings.ToLower(strings.Join(words[i:i+2], " ")))
		}
	}
	return grams
}

// stopwordBigrams 把专有名词拆成 2 字片段：人名常以部分形式入文
// （"九渊负手"含"九渊"），按整名匹配会漏网。宁可过滤偏严——短语事实少一条
// 无碍，人名混进口头禅清单才是噪声。
func stopwordBigrams(stopwords []string) []string {
	var grams []string
	for _, w := range stopwords {
		runes := []rune(strings.TrimSpace(w))
		if len(runes) < 2 {
			continue
		}
		for i := 0; i+2 <= len(runes); i++ {
			grams = append(grams, string(runes[i:i+2]))
		}
	}
	return grams
}

// hitStopword so không phân biệt hoa thường: tên riêng tiếng Việt viết hoa trong
// văn nhưng stopword có thể đến từ nguồn viết thường. Với chữ Hán, ToLower là
// no-op nên đường zh không đổi hành vi.
func hitStopword(gram string, stopGrams []string) bool {
	lower := strings.ToLower(gram)
	for _, g := range stopGrams {
		if strings.Contains(lower, strings.ToLower(g)) {
			return true
		}
	}
	return false
}

// repeatedSentences 找跨 ≥3 章逐字重复的 ≥12 字句子，按次数取 top 5。
func repeatedSentences(p *langProfile, chapters []string) []SentenceStat {
	type rec struct {
		count    int
		chapters map[int]struct{}
	}
	seen := make(map[string]*rec)
	for ci, text := range chapters {
		for _, sent := range p.splitSentences(text) {
			// 剥掉包裹引号再归并：同一句台词带/不带前引号不应算成两条
			// Gạch đầu dòng thoại tiếng Việt (— / -) cũng phải bóc, cùng lý do.
			sent = strings.Trim(strings.TrimSpace(sent), `"“”‘’「」『』—–-`)
			sent = strings.TrimSpace(sent)
			if p.length(sent) < minRepeatLen {
				continue
			}
			r := seen[sent]
			if r == nil {
				r = &rec{chapters: make(map[int]struct{})}
				seen[sent] = r
			}
			r.count++
			r.chapters[ci] = struct{}{}
		}
	}

	var out []SentenceStat
	for sent, r := range seen {
		if len(r.chapters) < 3 {
			continue
		}
		// 40 là ngân sách hiển thị theo đơn vị chữ Hán; quy đổi để câu tiếng Việt
		// còn nhận ra được trong báo cáo (40 rune tiếng Việt chỉ ~9 chữ).
		out = append(out, SentenceStat{
			Text:     truncateRunes(sent, domain.RuneBudgetForWords(40)),
			Chapters: len(r.chapters),
			Count:    r.count,
		})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Count != out[j].Count {
			return out[i].Count > out[j].Count
		}
		return out[i].Text < out[j].Text
	})
	if len(out) > 5 {
		out = out[:5]
	}
	return out
}

// endingShape đo hình dạng dòng kết. MedianRunes vẫn là số rune thật (tên trường
// nói đúng cái nó chứa), nhưng việc PHÂN LOẠI ngắn/dài đo bằng đơn vị của ngôn
// ngữ: giữ ngưỡng 30 theo rune cho tiếng Việt thì gần như mọi dòng kết đều "ngắn"
// (30 rune ≈ 7 chữ), ShortRatio kẹt ở 1,0 và tín hiệu "cả sách kết cùng một kiểu"
// mất hết khả năng phân biệt — vẫn ra số, chỉ là số vô dụng.
func endingShape(p *langProfile, chapters []string) EndingStat {
	var lengths []int
	short := 0
	for _, text := range chapters {
		line := lastNonEmptyLine(text)
		if line == "" {
			continue
		}
		lengths = append(lengths, len([]rune(line)))
		if p.length(line) <= shortEndingLen {
			short++
		}
	}
	if len(lengths) == 0 {
		return EndingStat{}
	}
	sort.Ints(lengths)
	return EndingStat{
		ShortRatio:  round2(float64(short) / float64(len(lengths))),
		MedianRunes: lengths[len(lengths)/2],
	}
}

func openingTimeRate(p *langProfile, chapters []string) float64 {
	hit := 0
	for _, text := range chapters {
		if p.openingTime.MatchString(firstParagraph(text)) {
			hit++
		}
	}
	return round2(float64(hit) / float64(len(chapters)))
}

func titleFormats(p *langProfile, titles []string) *TitleStat {
	if len(titles) == 0 {
		return nil
	}
	t := &TitleStat{}
	for _, title := range titles {
		if strings.TrimSpace(title) == "" {
			continue
		}
		if p.titlePrefix.MatchString(title) {
			t.WithPrefix++
		} else {
			t.WithoutPrefix++
		}
	}
	// 只有混用才值得上报；统一格式不是事实意义上的问题
	if t.WithPrefix == 0 || t.WithoutPrefix == 0 {
		return nil
	}
	return t
}

func lastNonEmptyLine(text string) string {
	lines := strings.Split(text, "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		if line := strings.TrimSpace(lines[i]); line != "" {
			return line
		}
	}
	return ""
}

// firstParagraph 取第一个非空且非 Markdown 标题的行（章文件首行常是 # 标题）。
func firstParagraph(text string) string {
	for line := range strings.SplitSeq(text, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		return line
	}
	return ""
}

func truncateRunes(s string, n int) string {
	runes := []rune(s)
	if len(runes) <= n {
		return s
	}
	return string(runes[:n]) + "…"
}

func round1(f float64) float64 { return float64(int(f*10+0.5)) / 10 }
func round2(f float64) float64 { return float64(int(f*100+0.5)) / 100 }
