package tools

import (
	"testing"

	"github.com/huuhoa143/ainovel-studio/internal/domain"
)

// TestParsePremiseSections chốt rằng tiêu đề tiếng Trung (sách cũ) vẫn được
// chuẩn hóa về canonical tiếng Việt — bản zh không bị phá.
func TestParsePremiseSections(t *testing.T) {
	premise := `# Premise

## 题材和基调
东方玄幻，冷硬成长。

## 题材定位
东方玄幻升级流，面向追求爽点和关系推进的读者。

## 核心冲突
主角必须在宗门规则与个人良知之间做选择。

## 中期转向
旧有修炼路线失效，必须转向禁术体系。
`

	sections := parsePremiseSections(premise)
	if sections["Thể loại và tông điệu"] == "" {
		t.Fatalf("expected 题材和基调 normalized to \"Thể loại và tông điệu\", got %+v", sections)
	}
	if sections["Định vị thể loại"] == "" {
		t.Fatalf("expected 题材定位 normalized to \"Định vị thể loại\", got %+v", sections)
	}
	if sections["Xung đột cốt lõi"] == "" {
		t.Fatalf("expected 核心冲突 normalized to \"Xung đột cốt lõi\", got %+v", sections)
	}
	if sections["Khúc ngoặt giữa truyện"] == "" {
		t.Fatalf("expected 中期转向 alias normalized to \"Khúc ngoặt giữa truyện\", got %+v", sections)
	}
}

// TestParsePremiseSectionsVietnamese chốt rằng đúng những tiêu đề tiếng Việt mà
// architect-short.md / architect-long.md dặn LLM xuất ra đều được nhận về canonical.
// Không có test này thì dịch prompt sẽ làm template_ready vĩnh viễn false mà không hề báo lỗi.
func TestParsePremiseSectionsVietnamese(t *testing.T) {
	premise := `# Đêm dài rồi sẽ sáng

## Thể loại và tông điệu
Huyền huyễn phương Đông, trưởng thành lạnh và cứng.

## Định vị thể loại
Dòng lên cấp, nhắm vào người đọc cần điểm khoái và đà đẩy quan hệ.

## Xung đột cốt lõi
Nhân vật chính phải chọn giữa luật tông môn và lương tri.

## Mục tiêu nhân vật chính
Tìm ra chân tướng cái chết của sư phụ.

## Hướng kết cục
Chọn lương tri, mất chỗ đứng trong tông môn.

## Vùng cấm khi viết
Không mở rộng thành đăng dài kỳ.

## Điểm bán khác biệt
Luật tu luyện có giá phải trả rất cụ thể.

## Móc khác biệt
Mỗi lần lên cấp là một lần mất đi một ký ức.

## Cam kết tưởng thưởng cốt lõi
Sự căng thẳng của lựa chọn và cái giá của nó.

## Động cơ truyện
Bên ngoài là cuộc truy sát, bên trong là nỗi nghi ngờ chính mình.

## Mạch chính quan hệ/trưởng thành
Từ nương tựa sang đối đầu rồi tới thấu hiểu.

## Lộ trình lên cấp
Đầu dựa công pháp, giữa dựa đồng đội, sau dựa lựa chọn.

## Chuyển hướng giữa kỳ
Công pháp cũ mất hiệu lực, buộc phải chuyển sang hệ cấm thuật.

## Luận đề kết cục
Lương tri có đáng giá bằng cả một đời tu hành không.

## Độ phù hợp truyện ngắn
Mâu thuẫn cốt lõi thu được trong một lần biến cố.
`

	sections := parsePremiseSections(premise)
	// canonical → tiêu đề tiếng Việt nguồn (map 1-1 ở đây; các alias nhiều-về-một kiểm riêng bên dưới)
	for _, canonical := range []string{
		"Thể loại và tông điệu",
		"Định vị thể loại",
		"Xung đột cốt lõi",
		"Mục tiêu nhân vật chính",
		"Hướng kết cục",
		"Vùng cấm khi viết",
		"Điểm bán khác biệt",
		"Móc khác biệt",
		"Cam kết tưởng thưởng cốt lõi",
		"Động cơ truyện",
		"Mạch chính quan hệ/trưởng thành",
		"Lộ trình lên cấp",
		"Khúc ngoặt giữa truyện",
		"Luận đề kết cục",
		"Độ phù hợp truyện ngắn",
	} {
		if sections[canonical] == "" {
			t.Fatalf("tiêu đề tiếng Việt %q không được nhận về canonical; có: %+v", canonical, sections)
		}
	}
}

// TestPremiseHeadingAliasesVietnamese chốt từng cặp alias tiếng Việt → canonical,
// gồm cả các alias nhiều-về-một (biến thể diễn đạt cùng chỉ một mục).
func TestPremiseHeadingAliasesVietnamese(t *testing.T) {
	cases := map[string]string{
		"## Thể loại và tông điệu":                               "Thể loại và tông điệu",
		"## Định vị thể loại":                                    "Định vị thể loại",
		"## Xung đột cốt lõi":                                    "Xung đột cốt lõi",
		"## Mục tiêu nhân vật chính":                             "Mục tiêu nhân vật chính",
		"## Hướng kết cục":                                       "Hướng kết cục",
		"## Hướng kết truyện":                                    "Hướng kết cục",
		"## Vùng cấm khi viết":                                   "Vùng cấm khi viết",
		"## Điểm bán khác biệt":                                  "Điểm bán khác biệt",
		"## Móc khác biệt":                                       "Móc khác biệt",
		"## Cam kết tưởng thưởng cốt lõi":                        "Cam kết tưởng thưởng cốt lõi",
		"## Động cơ truyện":                                      "Động cơ truyện",
		"## Mạch chính quan hệ/trưởng thành":                     "Mạch chính quan hệ/trưởng thành",
		"## Lộ trình lên cấp":                                    "Lộ trình lên cấp",
		"## Khúc ngoặt giữa truyện":                              "Khúc ngoặt giữa truyện",
		"## Chuyển hướng giữa kỳ":                                "Khúc ngoặt giữa truyện",
		"## Luận đề kết cục":                                     "Luận đề kết cục",
		"## Độ phù hợp truyện ngắn":                              "Độ phù hợp truyện ngắn",
		"## Vì sao tác phẩm này phù hợp truyện ngắn/thu một tập": "Độ phù hợp truyện ngắn",
	}
	for line, want := range cases {
		got, ok := canonicalPremiseHeading(line)
		if !ok {
			t.Fatalf("canonicalPremiseHeading(%q) không khớp alias nào", line)
		}
		if got != want {
			t.Fatalf("canonicalPremiseHeading(%q) = %q, muốn %q", line, got, want)
		}
	}
}

// TestPremiseStructureVietnameseTemplateReady là chốt canh thật sự: premise tiếng Việt
// do architect-long.md sinh ra phải cho template_ready=true. Nếu tiêu đề trong prompt
// và premiseHeadingAliases lệch nhau, test này đỏ.
func TestPremiseStructureVietnameseTemplateReady(t *testing.T) {
	premise := `## Thể loại và tông điệu
Dòng lên cấp, thiên lạnh và cứng.

## Định vị thể loại
Dòng lên cấp

## Xung đột cốt lõi
Xung đột

## Mục tiêu nhân vật chính
Mục tiêu

## Hướng kết cục
Kết cục

## Vùng cấm khi viết
Vùng cấm

## Điểm bán khác biệt
Điểm bán

## Móc khác biệt
Móc

## Cam kết tưởng thưởng cốt lõi
Cam kết

## Động cơ truyện
Động cơ

## Mạch chính quan hệ/trưởng thành
Mạch chính

## Lộ trình lên cấp
Lộ trình

## Khúc ngoặt giữa truyện
Khúc ngoặt

## Luận đề kết cục
Luận đề
`

	structure := premiseStructure(premise, domain.PlanningTierLong)
	if ready, _ := structure["template_ready"].(bool); !ready {
		t.Fatalf("premise tiếng Việt (tier long) phải template_ready, got %+v", structure)
	}
	missing, _ := structure["missing"].([]string)
	if len(missing) != 0 {
		t.Fatalf("không được thiếu tiêu đề nào, got %+v", missing)
	}
}

func TestPremiseStructure(t *testing.T) {
	premise := `## 题材和基调
升级流，偏冷硬。

## 题材定位
升级流

## 核心冲突
冲突

## 主角目标
目标

## 终局方向
终局

## 写作禁区
禁区

## 差异化卖点
卖点

## 差异化钩子
钩子

## 核心兑现承诺
兑现

## 故事引擎
引擎

## 中段转折
转折
`

	structure := premiseStructure(premise, domain.PlanningTierMid)
	if ready, _ := structure["template_ready"].(bool); !ready {
		t.Fatalf("expected template_ready, got %+v", structure)
	}
	missing, _ := structure["missing"].([]string)
	if len(missing) != 0 {
		t.Fatalf("expected no missing headings, got %+v", missing)
	}
}

func TestPremiseStructureShortAcceptsLegacyHeadingAlias(t *testing.T) {
	premise := `## 题材和基调
单卷高压营救。

## 题材定位
短篇高密度冒险。

## 核心冲突
主角必须在一夜内救出人质。

## 主角目标
救出人质并活着离开。

## 结局方向
完成任务但付出代价。

## 写作禁区
不扩展成长期连载。

## 差异化卖点
时限压力与连续反转。

## 差异化钩子
每次选择都缩短救援时间。

## 核心兑现承诺
紧迫感、抉择与反转。

## 本作为什么适合短篇/单卷收束
核心矛盾和人物弧线都能在单次任务中完成。
`

	structure := premiseStructure(premise, domain.PlanningTierShort)
	if ready, _ := structure["template_ready"].(bool); !ready {
		t.Fatalf("expected short template_ready, got %+v", structure)
	}
}

// TestPremiseStructureShortVietnamese là bản tiếng Việt của test trên: chốt rằng
// tiêu đề dài trong architect-short.md ("Vì sao tác phẩm này phù hợp...") cũng
// quy về đúng canonical "Độ phù hợp truyện ngắn".
func TestPremiseStructureShortVietnamese(t *testing.T) {
	premise := `## Thể loại và tông điệu
Một tập, giải cứu áp lực cao.

## Định vị thể loại
Phiêu lưu mật độ cao dạng truyện ngắn.

## Xung đột cốt lõi
Nhân vật chính phải cứu con tin trong một đêm.

## Mục tiêu nhân vật chính
Cứu được con tin và sống mà ra.

## Hướng kết truyện
Hoàn thành nhiệm vụ nhưng phải trả giá.

## Vùng cấm khi viết
Không mở rộng thành đăng dài kỳ.

## Điểm bán khác biệt
Áp lực thời hạn và các cú lật liên tiếp.

## Móc khác biệt
Mỗi lựa chọn đều rút ngắn thời gian giải cứu.

## Cam kết tưởng thưởng cốt lõi
Cảm giác cấp bách, sự quyết đoán và cú lật.

## Vì sao tác phẩm này phù hợp truyện ngắn/thu một tập
Mâu thuẫn cốt lõi và đường cung nhân vật đều xong trong một lần nhiệm vụ.
`

	structure := premiseStructure(premise, domain.PlanningTierShort)
	if ready, _ := structure["template_ready"].(bool); !ready {
		t.Fatalf("premise ngắn tiếng Việt phải template_ready, got %+v", structure)
	}
}
