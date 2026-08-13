// Dữ liệu mẫu thuần túy cho seed-demo, tách khỏi main.go để phần điều phối
// (thứ tự gọi store, các bất biến phải giữ) không bị chôn giữa hàng trăm dòng
// văn bản tiếng Việt.
//
// Ba nguyên tắc bắt buộc với MỌI chuỗi thêm vào tệp này (xem yêu cầu gốc):
//  1. Tiếng Việt có dấu thật, không lorem ipsum — giao diện này được thiết kế
//     quanh việc dấu tiếng Việt xếp hai tầng, cần line-height cao hơn.
//  2. Ít nhất một chuỗi DÀI ở mỗi loại trường (tên, tiêu đề, mô tả) — lỗi tràn
//     chữ chỉ lộ ra ở ca dài.
//  3. Ít nhất một tiêu đề chương dễ gây lẫn với số thứ tự chương, xem ch7.
package main

import (
	"time"

	"github.com/huuhoa143/ainovel-studio/internal/domain"
	"github.com/huuhoa143/ainovel-studio/internal/rules"
)

// ── nhân vật ────────────────────────────────────────────────────────────────

// demoCharacters là hồ sơ Architect đặt ra từ đầu (NhanVat.tsx gọi đây là "dự
// định", tách khỏi "hiện trạng" của demoCharacterSnapshots). Cố ý phủ đủ bốn
// hạng core/important/secondary/decorative vì giao diện xếp thứ tự đọc theo
// hạng, và mục cuối cố ý mang một cái tên rất dài để lộ ca tràn chữ.
func demoCharacters() []domain.Character {
	return []domain.Character{
		{
			Name:    "Lâm Thanh",
			Aliases: []string{"Tiểu Lâm", "Người gác cầu"},
			Role:    "nhân vật chính, người gác cầu đá dưới chân Hàn Sơn",
			Description: "Lâm Thanh vốn là đứa trẻ bị bỏ lại chân cầu đá năm lên bảy tuổi, " +
				"trên người chỉ có một mảnh ngọc bội khắc ba chữ cổ không ai đọc được. Suốt " +
				"mười hai năm ròng, y sống bằng nghề gác cầu, ghi lại tên người qua lại trong " +
				"một cuốn sổ da dê đã sờn gáy — không ngờ chính cuốn sổ ấy về sau lại trở " +
				"thành chứng cứ duy nhất vạch trần một âm mưu giấu kín suốt ba đời của dòng " +
				"họ Bạch.",
			Arc:    "Từ kẻ vô danh gác cầu đến người nắm giữ chân tướng ba tiếng chuông Hàn Sơn",
			Traits: []string{"trầm lặng", "quan sát tỉ mỉ", "trung thành đến cố chấp"},
			Tier:   "core",
		},
		{
			Name:    "Bạch Vô Hà",
			Aliases: []string{"Bạch trưởng lão"},
			Role:    "trưởng lão Bạch gia, người nuôi dưỡng Lâm Thanh",
			Description: "Bên ngoài ôn hòa, mực thước, được cả trấn kính trọng vì công nuôi " +
				"dưỡng một đứa trẻ mồ côi suốt mười hai năm không oán than. Bên trong âm " +
				"thầm tiêu hủy từng trang sổ sách liên quan tới lời thề ba đời trước, sẵn " +
				"sàng hy sinh cả người mình từng nuôi nấng để giữ bí mật đó chôn chặt thêm " +
				"một đời nữa.",
			Arc:    "Từ ân nhân trong mắt Lâm Thanh trở thành nghi phạm số một",
			Traits: []string{"điềm tĩnh", "mưu sâu", "tàn nhẫn khi cần"},
			Tier:   "important",
		},
		{
			Name: "Diệp Tiểu Yến",
			Role: "y sư trẻ ở trấn dưới chân núi, bạn thời thơ ấu của Lâm Thanh",
			Description: "Giỏi y thuật, thường xuyên băng bó vết thương cho Lâm Thanh mà " +
				"không hỏi lý do. Không ai ngờ nàng được Bạch gia cài cắm bên cạnh y từ năm " +
				"mười tuổi.",
			Arc:    "Từ người bạn vô tư đến kẻ đứng giữa hai lằn ranh ơn và oán",
			Traits: []string{"dịu dàng", "che giấu giỏi", "day dứt"},
			Tier:   "secondary",
		},
		{
			Name:        "Tôn Bất Nhị",
			Role:        "lão bán trà đầu cầu",
			Description: "Chứng kiến mọi chuyện qua lại nơi đầu cầu suốt hai mươi năm nhưng chưa từng dính vào bất cứ ân oán nào.",
			Traits:      []string{"lắm lời", "vô hại"},
			Tier:        "decorative",
		},
		{
			// Tên cố ý rất dài — ca kiểm tràn chữ cho cột/nhãn tên nhân vật.
			Name:    "Tưởng Dạ Lan Thư Cửu Tuyền Chi Chủ Nhân Đường Ẩn Cư Sĩ",
			Aliases: []string{"Chủ nhân Đường", "Người áo xám", "Cửu Tuyền lão quái"},
			Role:    "ẩn sĩ bí ẩn tự xưng chủ nhân thật sự của Cửu Tuyền Đường",
			Description: "Không ai từng thấy mặt thật của người này, chỉ biết mọi manh mối " +
				"về thân thế Lâm Thanh và lời thề ba đời trước đều dẫn ngược về một cái tên " +
				"duy nhất được nhắc tới trong cấm kỵ của cả ba dòng họ.",
			Arc:    "Từ một cái tên cấm kỵ trở thành lời giải cho toàn bộ bí ẩn Hàn Sơn",
			Traits: []string{"ẩn giấu", "toàn tri", "không thể đoán định"},
			Tier:   "important",
		},
	}
}

// demoCharacterSnapshots là ảnh chụp trạng thái tại ranh giới Tập 1 · Cung 1
// (cung "Ba Tiếng Chuông" vừa khép). Cố ý CHỈ có 3/5 nhân vật — Diệp Tiểu Yến
// không có ảnh chụp để kiểm ca "chưa có ảnh chụp" ngay trong danh sách, không
// chỉ ở ca toàn bộ tác phẩm rỗng.
func demoCharacterSnapshots() []domain.CharacterSnapshot {
	return []domain.CharacterSnapshot{
		{
			Volume: 1, Arc: 1, Name: "Lâm Thanh",
			Status:     "Bị thương nhẹ ở vai trái, vừa phát hiện mảnh ngọc bội thứ hai giấu trong tượng đá đầu cầu",
			Power:      "Nội lực mới khai mở tới tầng Trúc Cơ sơ kỳ",
			Motivation: "Truy tìm thân thế thật của mình và ý nghĩa ba chữ khắc trên ngọc bội",
			Relations:  "Bắt đầu nghi ngờ Bạch Vô Hà nhưng chưa dám đối chất trực diện",
		},
		{
			Volume: 1, Arc: 1, Name: "Bạch Vô Hà",
			Status:     "Vẫn giữ vẻ ôn hòa trước mặt trưởng lão hội, âm thầm tiêu hủy sổ sách năm xưa",
			Power:      "Tu vi Kim Đan trung kỳ, cố ý không để lộ",
			Motivation: "Che giấu bằng được bí mật ba đời trước khi đại hội môn phái diễn ra",
			Relations:  "Quan hệ với Lâm Thanh chuyển từ che chở sang đề phòng ngầm",
		},
		{
			Volume: 1, Arc: 1, Name: "Tưởng Dạ Lan Thư Cửu Tuyền Chi Chủ Nhân Đường Ẩn Cư Sĩ",
			Status:     "Vẫn đứng ngoài cuộc, chỉ quan sát qua trận pháp truyền tin từ xa",
			Motivation: "Chờ đúng thời điểm ba dòng họ tự phơi bày để ra tay một lần dứt điểm",
			Relations:  "Chưa từng gặp trực tiếp bất kỳ ai trong ba dòng họ",
		},
	}
}

// ── luật thế giới ────────────────────────────────────────────────────────────

// demoWorldRules phủ bốn nhóm chuẩn (magic/technology/geography/society) cộng
// một nhóm KHÔNG chuẩn ("cấm kỵ") để kiểm việc giao diện giữ nguyên nhóm lạ
// theo nguyên văn thay vì bỏ qua hoặc gộp nhầm vào "khác".
func demoWorldRules() []domain.WorldRule {
	return []domain.WorldRule{
		{
			Category: "magic",
			Rule: "Tu vi chia làm cửu phẩm: Luyện Khí, Trúc Cơ, Kim Đan, Nguyên Anh, Hóa Thần, " +
				"Luyện Hư, Hợp Thể, Đại Thừa, Độ Kiếp — mỗi phẩm lại chia ba tầng Sơ, Trung, Đỉnh Phong.",
			Boundary: "Không nhân vật nào được vượt cấp quá hai phẩm chỉ trong một trận đấu, trừ khi đã cấy phục bút cho việc đó từ trước.",
		},
		{
			Category: "technology",
			Rule:     "Trận pháp khắc trên đá được dùng làm phương tiện liên lạc tầm xa, thay cho việc truyền âm trực tiếp bằng pháp lực.",
			Boundary: "Trận pháp truyền tin chỉ truyền được chữ viết, không truyền được hình ảnh hay pháp lực thật.",
		},
		{
			Category: "geography",
			Rule:     "Sương mù bao phủ Hàn Sơn dày đặc nhất vào canh giờ Tý, che khuất toàn bộ lối lên từ chân núi tới đỉnh chuông.",
			Boundary: "Không ai được vượt qua sương mù Hàn Sơn vào canh giờ Tý nếu tu vi chưa tới Kim Đan, nếu không sẽ lạc vào ảo cảnh không lối ra.",
		},
		{
			Category: "society",
			Rule:     "Ba dòng họ Lâm, Bạch, Diệp cùng chia nhau trông coi ba tiếng chuông Hàn Sơn theo một lời thề lập ra từ ba đời trước.",
			Boundary: "Không dòng họ nào được tự ý đánh chuông Hàn Sơn khi chưa có đủ đại diện của cả ba họ chứng kiến.",
		},
		{
			// Nhóm cố ý KHÔNG nằm trong enum chuẩn — ca kiểm "nhóm lạ xếp cuối
			// theo nguyên văn" của web/components/TheGioi.tsx.
			Category: "cấm kỵ",
			Rule:     "Không ai được nhắc tên thật của chủ nhân Cửu Tuyền Đường trước mặt người ngoài đường.",
			Boundary: "Ai phá cấm kỵ này sẽ bị chính trận pháp hộ mệnh của Cửu Tuyền Đường phản phệ ngay lập tức.",
		},
	}
}

// ── phục bút ────────────────────────────────────────────────────────────────

// demoForeshadow cố ý phủ đủ ba trạng thái planted/advanced/resolved — giao
// diện tô màu khác nhau cho từng cái, gieo thiếu một trạng thái là chỉ kiểm
// được một phần ba bề mặt.
func demoForeshadow() []domain.ForeshadowEntry {
	return []domain.ForeshadowEntry{
		{
			ID: "ngoc-boi-song-sinh",
			Description: "Mảnh ngọc bội Lâm Thanh mang theo khi bị bỏ lại chân cầu đá khắc ba " +
				"chữ cổ không ai đọc được; đường vỡ trên ngọc cho thấy còn tồn tại một mảnh " +
				"song sinh khác chưa lộ diện.",
			PlantedAt: 1,
			Status:    "planted",
		},
		{
			ID: "so-ghi-ten-nguoi-qua-cau",
			Description: "Cuốn sổ da dê ghi tên người qua cầu suốt mười hai năm, tưởng chỉ là " +
				"thói quen vô hại của Lâm Thanh, hóa ra trùng khớp với danh sách mật báo của Bạch gia.",
			PlantedAt: 1,
			Status:    "advanced",
		},
		{
			ID: "loi-the-ba-tieng-chuong",
			Description: "Lời thề cũ giữa ba dòng họ được nhắc tới mỗi khi chuông Hàn Sơn điểm " +
				"đủ ba tiếng — tưởng đã bị lãng quên, hoá ra là ám hiệu báo thù được truyền qua nhiều thế hệ.",
			PlantedAt:  1,
			Status:     "resolved",
			ResolvedAt: 3,
		},
	}
}

func demoRelationships() []domain.RelationshipEntry {
	return []domain.RelationshipEntry{
		{CharacterA: "Lâm Thanh", CharacterB: "Bạch Vô Hà", Relation: "Ơn nghĩa nuôi dưỡng bề ngoài, thực chất là quan hệ giám sát", Chapter: 2},
		{CharacterA: "Lâm Thanh", CharacterB: "Diệp Tiểu Yến", Relation: "Bạn thời thơ ấu, nay nảy sinh tình cảm mơ hồ", Chapter: 4},
		{CharacterA: "Bạch Vô Hà", CharacterB: "Tưởng Dạ Lan Thư Cửu Tuyền Chi Chủ Nhân Đường Ẩn Cư Sĩ", Relation: "Liên minh ngầm nhằm bưng bít bí mật ba đời trước đại hội môn phái", Chapter: 5},
	}
}

// ── dàn ý phân tầng ──────────────────────────────────────────────────────────

// demoLayeredOutline dựng Tập → Cung → Chương.
//
// QUAN TRỌNG: GetChapterFromLayered (internal/store/outline.go) định vị chương
// theo VỊ TRÍ duyệt tuần tự volumes→arcs→chapters, KHÔNG theo trường Chapter
// của từng entry. Nên Chapter field ở đây phải khớp đúng thứ tự xuất hiện:
// V1A1 chiếm 1-3, V2A1 chiếm 4-7, V2A2 chưa mở (không chiếm số), V2A3 chiếm
// 8-9, V3A1 chiếm 10-11, V4 chưa mở (không chiếm số).
//
// Cố ý phủ đủ bốn trạng thái LaneBlock cho TẬP (done/running/planned/unplanned)
// — xem cách CurrentVolume=2 tương tác với volumeBlock() trong snapshot.go:
//   - V1 (index 1 < CurrentVolume 2)                        → done
//   - V2 (index == CurrentVolume)                            → running
//   - V3 (đã mở chi tiết nhưng index > CurrentVolume)        → planned
//   - V4 (Arcs == nil, còn là bộ khung)                       → unplanned
func demoLayeredOutline() []domain.VolumeOutline {
	return []domain.VolumeOutline{
		{
			Index: 1, Title: "Sương Phủ Hàn Sơn", Theme: "báo thù dòng họ",
			Arcs: []domain.ArcOutline{
				{
					Index: 1, Title: "Ba Tiếng Chuông", Goal: "hé lộ bí ẩn người gác cầu",
					Chapters: []domain.OutlineEntry{
						{
							Chapter:   1,
							Title:     "Người Gác Cầu Đá",
							CoreEvent: "Lâm Thanh gặp một người lạ đội mưa tới hỏi đường lên Hàn Sơn giữa đêm không trăng",
							Hook:      "bỏ lửng",
							Scenes: []string{
								"Đêm mưa tầm tã tại chân cầu đá, Lâm Thanh ghi tên người lạ vào cuốn sổ da dê đã sờn gáy",
								"Người lạ hỏi về ý nghĩa ba tiếng chuông Hàn Sơn rồi biến mất không để lại dấu vết, chỉ còn giọt nước mưa đọng trên phiến đá khắc chữ",
							},
						},
						{
							Chapter:   2,
							Title:     "Thư Không Người Nhận",
							CoreEvent: "Lâm Thanh nhận được một phong thư dán kín không ghi tên người gửi lẫn người nhận",
							Hook:      "câu hỏi",
							Scenes: []string{
								"Phong thư được đặt lặng lẽ dưới phiến đá đầu cầu lúc rạng sáng, bên trong chỉ vỏn vẹn một câu hỏi không lời giải",
							},
						},
						{
							Chapter:   3,
							Title:     "Tiếng Chuông Thứ Ba",
							CoreEvent: "Chuông Hàn Sơn điểm đủ ba tiếng lần đầu tiên sau mười hai năm, báo hiệu lời thề cũ đã bị đánh thức",
							Hook:      "bỏ lửng hành động",
							// Scenes cố ý để trống (nil): Architect chưa chia cảnh cho
							// chương này — ca kiểm "scenes: null" khác với mảng rỗng.
						},
					},
				},
			},
		},
		{
			Index: 2,
			// Tiêu đề tập cố ý rất dài — ca kiểm tràn chữ cho nhãn tiêu đề tập.
			Title: "Vực Đá Ngầm Dưới Chân Hàn Sơn, Nơi Ánh Trăng Không Bao Giờ Chạm Tới Đáy Nước",
			Theme: "đối đầu Bạch gia",
			Arcs: []domain.ArcOutline{
				{
					Index: 1, Title: "Vết Dao Cũ", Goal: "đối đầu trực diện với quá khứ",
					Chapters: []domain.OutlineEntry{
						{
							Chapter:   4,
							Title:     "Máu Cũ Trên Lưỡi Dao Gãy",
							CoreEvent: "Bạch Vô Hà vô tình để lộ vết sẹo dao cũ trùng khớp với món vũ khí trong ký ức mơ hồ thời thơ ấu của Lâm Thanh",
							Hook:      "nghi ngờ",
							Scenes: []string{
								"Trong đại sảnh Bạch gia, tay áo Bạch Vô Hà xô lệch để lộ vết sẹo dài nơi cổ tay",
								"Lâm Thanh nhớ lại mảnh ký ức mờ nhạt về một lưỡi dao gãy đôi dưới ánh trăng",
							},
						},
						{
							Chapter: 5,
							// Tiêu đề chương cố ý rất dài — ca kiểm tràn chữ cho nhãn
							// tiêu đề chương, độc lập với ca tràn chữ của tiêu đề tập.
							Title:     "Đêm Hàn Sơn Đổ Máu: Ba Người Một Kiếm Bên Bờ Vực Đá Ngầm Nơi Lời Thề Cũ Chưa Từng Được Nhắc Lại",
							CoreEvent: "Ba dòng họ ước hẹn gặp nhau tại bờ vực đá ngầm để phân định món nợ máu từ ba đời trước, nhưng chỉ có một thanh kiếm gãy được mang tới làm tin",
							Hook:      "cliffhanger",
							Scenes: []string{
								// Một cảnh cố ý rất dài — ca kiểm tràn chữ cho danh sách cảnh.
								"Dưới ánh trăng mờ trên bờ vực đá ngầm, ba dòng họ đối mặt lần đầu sau ba đời câm lặng, mỗi bên chỉ mang theo một tín vật duy nhất để chứng minh mình còn giữ đúng lời thề năm xưa, trong khi Lâm Thanh đứng lặng giữa họ, nhận ra mảnh ngọc bội của mình khớp với cả ba tín vật ấy cùng lúc",
							},
						},
						{
							Chapter:   6,
							Title:     "Lằn Ranh Giữa Ơn Và Oán",
							CoreEvent: "Diệp Tiểu Yến bất ngờ xuất hiện tại bờ vực, tiết lộ nàng vốn được Bạch gia cài cắm bên cạnh Lâm Thanh từ nhỏ",
							Hook:      "phản bội",
							Scenes: []string{
								"Diệp Tiểu Yến đứng chắn giữa Lâm Thanh và Bạch Vô Hà, tay run run không biết nên rút kiếm về phía ai",
							},
						},
						{
							Chapter: 7,
							// Tiêu đề dễ gây lẫn CỐ Ý, đúng nguyên văn yêu cầu: bộ nhận
							// số chương KHÔNG được đọc "Ba" trong "Chương Ba Đào" thành
							// số 3 — "ba đào" nghĩa là sóng lớn, không phải số thứ tự.
							Title:     "Chương Ba Đào",
							CoreEvent: "Sóng lớn bất thường nổi lên giữa bến đò dưới chân Hàn Sơn đúng lúc ba dòng họ cùng xuất hiện, cuốn trôi tín vật cuối cùng xuống dòng nước xoáy",
							Hook:      "cliffhanger toàn cục",
							Scenes: []string{
								"Bến đò chìm trong sóng dữ chưa từng thấy, ba dòng họ hoảng loạn tranh nhau vớt lại tín vật đang chìm dần",
								"Lâm Thanh lao xuống dòng nước xoáy, trong khoảnh khắc ấy nghe văng vẳng đủ ba tiếng chuông Hàn Sơn vang lên giữa ban ngày",
							},
						},
					},
				},
				{
					// Cung骨架 chưa mở — LaneBlock state "unplanned" trong lane cung.
					Index: 2, Title: "Bóng Ma Trong Sương", Goal: "phản bội từ trong nội bộ",
					EstimatedChapters: 5,
				},
				{
					// Cung đã mở chi tiết nhưng chưa chạy tới — LaneBlock state
					// "planned" trong lane cung, khác "unplanned" ở trên.
					Index: 3, Title: "Cửu Tuyền Đường Mở Cổng", Goal: "chạm mặt thế lực giấu mặt",
					Chapters: []domain.OutlineEntry{
						{
							Chapter:   8,
							Title:     "Cổng Đá Không Tên",
							CoreEvent: "Cửu Tuyền Đường lần đầu hé lộ vị trí thật giữa lòng núi",
							Hook:      "bí ẩn mới",
						},
						{
							Chapter:   9,
							Title:     "Người Áo Xám Cất Tiếng",
							CoreEvent: "Tưởng Dạ Lan Thư Cửu Tuyền Chi Chủ Nhân Đường Ẩn Cư Sĩ xuất hiện trực tiếp lần đầu, tự xưng là chủ nhân thật sự của Cửu Tuyền Đường",
							Hook:      "lộ diện",
						},
					},
				},
			},
		},
		{
			// Tập đã có cấu trúc chi tiết nhưng index > CurrentVolume và chưa
			// chạy tới — LaneBlock state "planned" ở lane tập.
			Index: 3, Title: "Đế Đô Sụp Đổ Dưới Cơn Thịnh Nộ Của Long Mạch", Theme: "chưa rõ, còn chờ Architect quyết định hướng thu tuyến",
			Arcs: []domain.ArcOutline{
				{
					Index: 1, Title: "Mầm Mống Cuối Cùng", Goal: "gieo mầm cho hồi kết",
					Chapters: []domain.OutlineEntry{
						{
							Chapter:   10,
							Title:     "Long Mạch Rung Chuyển",
							CoreEvent: "Đế đô rung chuyển vì long mạch bị khuấy động từ sâu trong lòng đất",
							Hook:      "quy mô mở rộng",
						},
						{
							Chapter:   11,
							Title:     "Mầm Mống Cuối Cùng",
							CoreEvent: "Manh mối cuối cùng về thân thế Lâm Thanh được gieo xuống ngay trước khi đế đô sụp đổ",
							Hook:      "gieo mầm hồi kết",
						},
					},
				},
			},
		},
		{
			// Tập chỉ là bộ khung, Architect chưa mở cung nào — Arcs == nil nên
			// LaneBlock state "unplanned" ở lane tập, KHÁC "planned" của Tập 3.
			Index: 4, Title: "Hồi Kết Chưa Định",
		},
	}
}

// demoPremise là premise.md — markdown thô, đoạn cách nhau bằng dòng trống
// (TienDe trong web/components/DanY.tsx tách đoạn theo \n{2,}).
const demoPremise = `# Trấn Yêu Ký

Mười hai năm trước, tiếng chuông Hàn Sơn đột ngột im bặt giữa một đêm mưa, và ba dòng họ từng thề giữ nó — Lâm, Bạch, Diệp — cùng lúc giấu nhẹm mọi ghi chép về lý do.

Lâm Thanh, đứa trẻ bị bỏ lại chân cầu đá năm ấy, lớn lên làm người gác cầu vô danh, không biết mình mang trên cổ mảnh ngọc bội duy nhất có thể ghép lại toàn bộ sự thật. Khi ba tiếng chuông bất ngờ vang lên trở lại, y buộc phải chọn giữa lòng biết ơn dành cho người đã nuôi mình và sự thật đang dần lộ ra rằng chính ân nhân ấy là kẻ giấu kín tội ác của cả ba đời.

Đây là câu chuyện về một lời thề tưởng đã chết, một cuốn sổ tưởng vô hại, và một cây cầu đá đã âm thầm chứng kiến mọi chuyện suốt mười hai năm không ai hay biết.`

// ── nội dung sản xuất theo chương ───────────────────────────────────────────

// productionChapter mô tả đầy đủ dữ liệu cần để đẩy MỘT chương qua toàn bộ chu
// kỳ plan→draft→consistency_check→commit (drafts/*.plan.json, drafts/*.draft.md,
// chapters/*.md, checkpoint, MarkChapterComplete).
type productionChapter struct {
	Chapter                                int
	PlanTitle, Goal, Conflict, Hook, Notes string
	Content                                string
	HookType, Strand                       string
}

// demoCompletedChapters là 5 chương đã có bản thảo chốt (1, 2, 3, 5 sẽ hiện
// "đã nghiệm thu"; chương 4 cũng nằm trong CompletedChapters nhưng bị đưa vào
// PendingRewrites ngay sau đó nên sẽ hiện "chờ viết lại" — rewrite được xét
// TRƯỚC done trong rowStage, xem internal/serve/snapshot.go).
func demoCompletedChapters() []productionChapter {
	return []productionChapter{
		{
			Chapter: 1, PlanTitle: "Người Gác Cầu Đá",
			Goal:     "Giới thiệu Lâm Thanh và không khí Hàn Sơn, gài phục bút ngọc bội",
			Conflict: "Chưa có xung đột trực tiếp — chương dựng thế giới",
			Hook:     "bỏ lửng",
			Notes:    "Giữ nhịp chậm, đúng tinh thần chương mở đầu",
			Content: "Đêm ấy mưa không dứt suốt canh giờ Tý. Lâm Thanh ngồi tựa lưng vào cột đá " +
				"nơi bậc thứ hai trăm của cây cầu đá bắc qua khe núi, tay lật giở từng trang sổ " +
				"da dê đã sờn gáy, ghi lại tên người vừa qua cầu. Một bóng người đội mưa xuất " +
				"hiện nơi đầu cầu, không mang theo đèn đuốc, hỏi duy nhất một câu: tiếng chuông " +
				"Hàn Sơn báo mấy giờ thì đổ. Lâm Thanh còn chưa kịp đáp, bóng người đã khuất " +
				"trong màn mưa, chỉ để lại trên phiến đá một vết chân ướt hình dạng kỳ lạ, và " +
				"từ khe núi vọng xuống đúng một tiếng chuông đơn độc, không trọn vẹn ba tiếng " +
				"như lệ thường mười hai năm qua.",
			HookType: "cliffhanger", Strand: "main",
		},
		{
			Chapter: 2, PlanTitle: "Thư Không Người Nhận",
			Goal:     "Gài câu hỏi về ngọc bội, mở đầu mối nghi ngờ với Bạch gia",
			Conflict: "Lâm Thanh hoang mang không biết ai biết bí mật của mình",
			Hook:     "câu hỏi",
			Notes:    "Không để lộ danh tính người gửi thư",
			Content: "Sáng hôm sau, dưới phiến đá nơi người lạ từng đứng, Lâm Thanh tìm thấy " +
				"một phong thư dán kín không đề tên người gửi lẫn người nhận. Bên trong chỉ " +
				"vỏn vẹn một dòng chữ run rẩy: \"Ngọc bội của ngươi có phải vỡ làm đôi.\" Lâm " +
				"Thanh siết chặt mảnh ngọc bội đeo nơi cổ, thứ y mang theo từ năm lên bảy khi " +
				"bị bỏ lại chân cầu, chưa từng cho ai xem trọn vẹn hoa văn khắc trên đó. Y " +
				"không biết ai đã biết được điều này, và càng không biết vì sao câu hỏi ấy lại " +
				"khiến tay mình run lên như đang chạm phải một bí mật đáng lẽ phải ngủ yên.",
			HookType: "question", Strand: "main",
		},
		{
			Chapter: 3, PlanTitle: "Tiếng Chuông Thứ Ba",
			Goal:     "Khép cung Ba Tiếng Chuông, xác nhận lời thề cũ đã bị đánh thức",
			Conflict: "Chuông đổ giữa lúc không ai chuẩn bị tinh thần",
			Hook:     "bỏ lửng hành động",
			Notes:    "Chương chốt cung — nhịp phải dồn nhanh hơn hai chương trước",
			Content: "Giữa canh ba, chuông Hàn Sơn bất ngờ đổ liền ba tiếng, âm vang truyền dọc " +
				"theo triền núi xuống tận chân cầu đá, thứ âm thanh mà theo lời các bô lão " +
				"trong trấn, đã im bặt tròn mười hai năm. Lâm Thanh đứng bật dậy, sổ da dê rơi " +
				"xuống đất, mở ra đúng trang có nét chữ của người lạ đêm mưa hôm trước. Y chợt " +
				"hiểu ra: ba tiếng chuông không phải điềm báo thiên tai như dân trong trấn vẫn " +
				"đồn, mà là một lời thề cũ vừa được đánh thức sau ba đời im lặng, và y, kẻ gác " +
				"cầu vô danh, đã vô tình trở thành người đầu tiên nghe thấy nó vang lên.",
			HookType: "cliffhanger", Strand: "main",
		},
		{
			Chapter: 4, PlanTitle: "Máu Cũ Trên Lưỡi Dao Gãy",
			Goal:     "Lâm Thanh phát hiện dấu vết đầu tiên nghi ngờ Bạch Vô Hà",
			Conflict: "Đối đầu ngầm giữa lòng tin cũ và nghi ngờ mới",
			Hook:     "nghi ngờ",
			Notes:    "Editor sẽ trả về vì mâu thuẫn mốc thời gian với chương 2 — xem bản duyệt",
			Content: "Tại đại sảnh Bạch gia, giữa lúc trà đang rót, tay áo Bạch Vô Hà vô tình xô " +
				"lệch để lộ một vết sẹo dài nơi cổ tay, hình dạng như bị một lưỡi dao gãy đôi " +
				"cứa qua. Lâm Thanh nhìn thấy, trong đầu chợt hiện lên mảnh ký ức mờ nhạt nhất " +
				"mà y từng cố quên: một lưỡi dao gãy dưới ánh trăng, tiếng thét của một người " +
				"đàn bà, và bàn tay nhỏ bé của chính y níu lấy vạt áo ai đó đẫm máu. Bạch Vô Hà " +
				"nhận ra ánh mắt của Lâm Thanh, vội kéo tay áo che lại, nhưng đã quá muộn — " +
				"nghi ngờ đã kịp nảy mầm, và từ khoảnh khắc ấy, mọi lời dạy bảo suốt mười hai " +
				"năm qua bỗng trở nên đáng ngờ.",
			HookType: "reveal", Strand: "side",
		},
		{
			Chapter: 5, PlanTitle: "Đêm Hàn Sơn Đổ Máu",
			Goal:     "Ba dòng họ đối chất trực diện lần đầu, khép mục tiêu 'đối đầu' của cung",
			Conflict: "Ba dòng họ cùng xuất hiện, mỗi bên chỉ còn một tín vật duy nhất",
			Hook:     "cliffhanger",
			Notes:    "Cảnh trung tâm của cả cung — không được rút gọn",
			Content: "Bờ vực đá ngầm dưới chân Hàn Sơn chìm trong sương mỏng, ba dòng họ hẹn " +
				"nhau tại đó đúng giờ Tý để phân định món nợ máu đã treo lơ lửng suốt ba đời. " +
				"Mỗi bên chỉ mang theo đúng một tín vật để chứng minh mình còn giữ trọn lời " +
				"thề năm xưa: một mảnh ngọc bội, một lưỡi dao gãy, một cuốn sổ da dê. Lâm " +
				"Thanh đứng giữa ba bên, tay run run áp mảnh ngọc bội của mình vào từng tín " +
				"vật một, và chết lặng khi nhận ra hoa văn trên cả ba đều khớp với phần vỡ " +
				"trên ngọc bội của y không sai một đường nét. Gió từ vực đá ngầm thổi lên " +
				"lạnh buốt, cuốn theo tiếng chuông Hàn Sơn vọng tới đúng lúc thanh kiếm gãy " +
				"được rút ra khỏi vỏ.",
			HookType: "cliffhanger", Strand: "main",
		},
	}
}

// demoDraftingChapter là chương 6 — đang soạn dở (InProgressChapter), có
// bản thảo THẬT dù chưa hoàn tất, để bề mặt đọc/inspector không hiện trống
// trơn khi chọn một chương "đang soạn".
func demoDraftingChapter() productionChapter {
	return productionChapter{
		Chapter: 6, PlanTitle: "Lằn Ranh Giữa Ơn Và Oán",
		Goal:     "Diệp Tiểu Yến lộ thân phận cài cắm, đẩy Lâm Thanh vào thế phải chọn phe ngay tại bờ vực",
		Conflict: "Ơn nuôi dưỡng của Bạch gia đối đầu với sự thật vừa phát hiện ở chương 4-5",
		Hook:     "phản bội",
		Notes:    "Giữ nhịp căng liên tục từ chương 5, không hạ nhiệt bằng đoạn hồi tưởng dài",
		Content: "Diệp Tiểu Yến bước ra từ sau phiến đá, ánh mắt không rời khỏi Lâm Thanh. " +
			"Nàng chưa từng nghĩ mình sẽ phải đứng vào đúng khoảnh khắc này, giữa ơn nuôi " +
			"dưỡng của Bạch gia và...",
	}
}

// demoPendingChapter là chương 7 — mới chỉ có hợp đồng (plan), chưa viết một
// chữ nào. Tiêu đề "Chương Ba Đào" là ca bẫy bắt buộc, xem demoLayeredOutline.
func demoPendingChapter() productionChapter {
	return productionChapter{
		Chapter: 7, PlanTitle: "Chương Ba Đào",
		Goal:     "Sóng lớn bất thường cuốn trôi tín vật cuối cùng, đẩy cả ba dòng họ vào thế phải hợp tác bất đắc dĩ",
		Conflict: "Thiên tai bất ngờ chen giữa xung đột nội bộ ba dòng họ",
		Hook:     "cliffhanger toàn cục",
		Notes: "Tiêu đề chương cố ý không phải số thứ tự — \"Ba Đào\" nghĩa là sóng lớn, " +
			"không phải \"chương 3\". Bộ nhận số chương không được đọc nhầm.",
	}
}

// pendingRewriteReason là lý do Editor trả chương 4 về hàng chờ viết lại,
// dùng cho Progress.SetPendingRewrites.
const pendingRewriteReason = "Bản duyệt chương 4 phát hiện mâu thuẫn mốc thời gian nghiêm trọng với chương 2: " +
	"vết sẹo dao cũ của Bạch Vô Hà khiến Lâm Thanh 'nhớ lại' một ký ức mà theo chương 2 y " +
	"chưa từng biết tới. Cần viết lại đoạn hồi tưởng để khớp đúng trình tự nhân quả."

// ── bản duyệt của Editor ─────────────────────────────────────────────────────

// demoReviews trả về mọi bản duyệt cần gieo. Ghi chú vị trí lưu (quan trọng để
// tránh đụng tên tệp — xem store.WorldStore.SaveReview):
//   - scope "chapter" và "arc" đều lưu vào reviews/{ch}.json (KHÔNG được trùng
//     số chương giữa hai review non-global, review sau sẽ ghi đè review trước)
//   - scope "global" lưu vào reviews/{ch}-global.json — tệp riêng, không đụng
//     review chapter/arc của cùng số chương
//
// Chương 3 mang bản duyệt scope=arc với MỘT chiều chấm đúng 0/100 — ca bẫy bắt
// buộc: model.go định nghĩa `Score int `json:"score,omitempty"“, tức điểm 0
// (giá trị zero của int) bị omitempty nuốt mất khi mã hóa JSON, event dù
// BanDuyet.tsx đã tự sửa ở phía client (`d.score != null`) thì dữ liệu 0 đó
// KHÔNG BAO GIỜ tới được trình duyệt — server đã làm rụng nó từ trước. Xem
// ghi chú đầy đủ trong báo cáo gửi kèm.
func demoReviews() []domain.ReviewEntry {
	return []domain.ReviewEntry{
		{
			Chapter: 1, Scope: "chapter", Verdict: "accept",
			Summary: "Chương mở truyện gọn, dựng đúng không khí Hàn Sơn và gài phục bút ngọc bội một cách tự nhiên, không lộ liễu.",
			Dimensions: []domain.DimensionScore{
				{Dimension: "consistency", Score: 92, Verdict: "accept", Comment: "Khớp toàn bộ mốc thời gian đã thiết lập ở premise."},
				{Dimension: "pacing", Score: 85, Verdict: "accept", Comment: "Nhịp chậm rãi phù hợp chương mở đầu."},
				{Dimension: "prose", Score: 88, Verdict: "accept"},
				{Dimension: "foreshadow", Score: 80, Verdict: "accept", Comment: "Gieo phục bút ngọc bội tự nhiên, không cần chỉnh."},
			},
			ContractStatus: "met",
		},
		{
			Chapter: 2, Scope: "chapter", Verdict: "polish",
			Summary: "Ý tưởng phong thư bí ẩn tốt nhưng đoạn giữa chương sa vào miêu tả tâm lý quá dài, làm loãng nhịp truyện.",
			Dimensions: []domain.DimensionScore{
				{Dimension: "consistency", Score: 75, Verdict: "accept"},
				{Dimension: "pacing", Score: 60, Verdict: "polish", Comment: "Đoạn giữa chương kéo dài không cần thiết."},
				{Dimension: "prose", Score: 82, Verdict: "accept"},
				{Dimension: "foreshadow", Score: 70, Verdict: "accept"},
			},
			Issues: []domain.ConsistencyIssue{
				{
					Type: "pacing", Severity: "warning",
					Description: "Đoạn Lâm Thanh suy nghĩ về nguồn gốc phong thư kéo dài gần một phần ba chương, làm chậm nhịp ngay sau cú hook mở đầu.",
					Evidence:    "\"Y không biết ai đã biết được điều này, và càng không biết vì sao câu hỏi ấy lại khiến tay mình run lên...\"",
					Suggestion:  "Rút ngắn đoạn miêu tả tâm lý ở giữa chương xuống còn khoảng một nửa, dồn chữ cho phản ứng hành động.",
					Chapters:    []int{2},
				},
			},
			ContractStatus: "partial",
			ContractMisses: []string{"Chưa thể hiện rõ ai là người đặt phong thư, dù hợp đồng chương yêu cầu để lại ít nhất một manh mối vật lý"},
			ContractNotes:  "Manh mối duy nhất là câu hỏi trong thư; hợp đồng muốn thêm một dấu vết cụ thể hơn (dấu chân, mùi hương, ...).",
		},
		{
			// scope=arc: bản duyệt chốt cung "Ba Tiếng Chuông" tại chương cuối cung.
			Chapter: 3, Scope: "arc", Verdict: "polish",
			Summary: "Cung 'Ba Tiếng Chuông' khép lại đúng mục tiêu hé lộ, nhịp dồn tốt ở chương chốt, " +
				"nhưng không cài thêm phục bút mới nào cho tuyến Bạch gia trước khi sang cung kế.",
			Dimensions: []domain.DimensionScore{
				{Dimension: "consistency", Score: 88, Verdict: "accept"},
				{Dimension: "pacing", Score: 70, Verdict: "polish", Comment: "Nhịp dồn tốt nhưng hơi vội ở câu kết."},
				{Dimension: "prose", Score: 85, Verdict: "accept"},
				{
					// CA BẪY: điểm 0/100 hợp lệ, không phải "chưa chấm".
					Dimension: "foreshadow", Score: 0, Verdict: "rewrite",
					Comment: "Chấm 0 vì đây là yêu cầu BẮT BUỘC của một chương chốt cung theo rubric, " +
						"không phải vì văn phong kém: cung khép lại mà không cài thêm phục bút mới nào cho tuyến Bạch gia.",
				},
			},
			Issues: []domain.ConsistencyIssue{
				{
					Type: "foreshadow", Severity: "warning",
					Description: "Chương chốt cung 'Ba Tiếng Chuông' không cài thêm phục bút mới nào cho tuyến Bạch gia trước khi bước sang cung 'Vết Dao Cũ'.",
					Evidence:    "Toàn chương chỉ giải quyết phục bút tiếng chuông, không mở thêm câu hỏi nào về Bạch gia.",
					Suggestion:  "Thêm một chi tiết nhỏ báo hiệu bất thường ở Bạch gia ngay trước khi khép cung, làm bệ phóng cho cung kế.",
					Chapters:    []int{3},
				},
			},
			ContractStatus: "partial",
			ContractMisses: []string{"Chưa cài phục bút mới cho tuyến Bạch gia trước khi khép cung"},
		},
		{
			Chapter: 4, Scope: "chapter", Verdict: "rewrite",
			Summary: "Chi tiết vết sẹo dao cũ mâu thuẫn trực tiếp với trình tự ký ức đã thiết lập ở chương 2; cần viết lại đoạn hồi tưởng trước khi có thể chấp nhận chương này.",
			Dimensions: []domain.DimensionScore{
				{Dimension: "consistency", Score: 35, Verdict: "rewrite", Comment: "Mâu thuẫn mốc thời gian với chương 2."},
				{Dimension: "pacing", Score: 55, Verdict: "polish"},
				{Dimension: "prose", Score: 78, Verdict: "accept"},
				{Dimension: "foreshadow", Score: 60, Verdict: "polish"},
			},
			Issues: []domain.ConsistencyIssue{
				{
					Type: "consistency", Severity: "critical",
					Description:    "Vết sẹo dao cũ của Bạch Vô Hà được mô tả là khiến Lâm Thanh 'nhớ lại' ký ức, nhưng theo chương 2, Lâm Thanh chưa từng biết tới sự tồn tại của lưỡi dao gãy trước khi nhận phong thư.",
					Evidence:       "\"Lâm Thanh nhìn thấy, trong đầu chợt hiện lên mảnh ký ức mờ nhạt nhất mà y từng cố quên: một lưỡi dao gãy dưới ánh trăng...\"",
					Suggestion:     "Viết lại đoạn hồi tưởng để ký ức về lưỡi dao gãy xuất hiện SAU khi Lâm Thanh nhận phong thư ở chương 2, khớp đúng trình tự nhân quả.",
					Chapters:       []int{2, 4},
					RequiresChange: true,
				},
				{
					Type: "contract", Severity: "error",
					Description:    "Hợp đồng chương yêu cầu một cảnh đối đầu trực diện giữa Lâm Thanh và Bạch Vô Hà, nhưng chương chỉ dừng ở một khoảnh khắc lộ sẹo tình cờ.",
					Suggestion:     "Thêm một lượt đối thoại căng thẳng trực tiếp sau khi vết sẹo lộ ra, đúng tinh thần 'đối đầu' của hợp đồng cung.",
					Chapters:       []int{4},
					RequiresChange: true,
				},
			},
			ContractStatus: "missed",
			ContractMisses: []string{
				"Không thể hiện cảnh đối đầu trực diện đã cam kết trong hợp đồng cung 'Vết Dao Cũ'",
				"Bỏ sót chi tiết vết dao cũ được nhắc ở đầu cung",
			},
			AffectedChapters: []int{4},
		},
		{
			Chapter: 5, Scope: "chapter", Verdict: "accept",
			Summary: "Cảnh đối chất ba dòng họ ở bờ vực đá ngầm dồn nén tốt, khép lại đúng mục tiêu 'đối đầu' của cung mà không cần chỉnh.",
			Dimensions: []domain.DimensionScore{
				{Dimension: "consistency", Score: 90, Verdict: "accept"},
				{Dimension: "pacing", Score: 91, Verdict: "accept"},
				{Dimension: "prose", Score: 89, Verdict: "accept"},
				{Dimension: "foreshadow", Score: 86, Verdict: "accept", Comment: "Tín vật trùng khớp là một cú twist phục bút mạnh."},
			},
			ContractStatus: "met",
		},
		{
			// scope=global tại chương 5 — lưu vào reviews/05-global.json, KHÔNG
			// đụng review chapter ở trên (reviews/05.json). Khi người vận hành
			// chọn chương 6 hoặc 7 (chưa có review riêng), buildSelection sẽ rơi
			// về đúng bản duyệt global gần nhất này (LoadLastReview).
			Chapter: 5, Scope: "global", Verdict: "accept",
			Summary: "Kiểm tra tổng thể 5 chương đầu: mạch thời gian nhất quán sau khi tính luôn phần cần " +
				"sửa ở chương 4, nhịp truyện tăng dần hợp lý, mật độ dựng thế giới không lấn át tuyến nhân vật chính.",
			Dimensions: []domain.DimensionScore{
				{Dimension: "consistency", Score: 78, Verdict: "polish", Comment: "Chờ chương 4 viết lại xong mới coi là ổn định hoàn toàn."},
				{Dimension: "pacing", Score: 83, Verdict: "accept"},
			},
			Issues: []domain.ConsistencyIssue{
				{
					Type: "worldbuilding", Severity: "warning",
					Description: "Mật độ giới thiệu luật thế giới ở chương 1-2 hơi dày so với phần còn lại, có thể dồn bớt sang các chương sau.",
					Suggestion:  "Rải đều chi tiết về hệ thống tu vi sang chương 6-7 thay vì tập trung ở đầu truyện.",
					Chapters:    []int{1, 2},
				},
			},
		},
	}
}

// ── văn phong: hai nguồn, hai vòng đời ──────────────────────────────────────

// demoStyleRules là văn phong Editor CHẮT RA từ các chương đã viết
// (meta/style_rules.json). Engine thật chỉ ghi tệp này ở BIÊN CUNG
// (internal/tools/save_arc_summary.go:118), nên nó gắn với một cặp tập/cung cụ
// thể — ở đây là cung 1 của tập 1, cung vừa chốt xong ở seed này.
//
// Cố ý có một quy tắc prose rất dài và một danh sách cấm nhiều mục: bề mặt Văn
// phong xếp các quy tắc thành danh sách dọc, và ca dài là ca duy nhất lộ ra lỗi
// tràn chữ khi nhãn tiếng Việt dài hơn nhãn tiếng Anh 20-30%.
func demoStyleRules() domain.WritingStyleRules {
	return domain.WritingStyleRules{
		Volume: 1,
		Arc:    1,
		Prose: []string{
			"Giữ điểm nhìn hạn chế ở Lâm Thanh: chỉ kể những gì y thấy, nghe hoặc suy ra được, " +
				"tuyệt đối không nhảy vào đầu Bạch Vô Hà để giải thích động cơ — sức nặng của " +
				"tuyến truyện này nằm ở chỗ người đọc biết nhiều hơn Lâm Thanh nhưng vẫn chưa " +
				"biết đủ.",
			"Mỗi cảnh mở bằng một chi tiết vật chất cụ thể (tiếng chuông, mưa trên đá, gáy sổ sờn) trước khi vào đối thoại.",
			"Câu tả thiên nhiên tối đa hai câu liền nhau, sau đó phải có hành động hoặc thoại chen vào.",
			"Không dùng câu hỏi tu từ để chuyển đoạn; chuyển bằng hành động hoặc bằng một mốc thời gian cụ thể.",
		},
		Dialogue: []domain.CharacterVoice{
			{
				Name: "Lâm Thanh",
				Rules: []string{
					"Nói ngắn, phần lớn dưới mười chữ; càng xúc động càng ngắn.",
					"Không bao giờ gọi thẳng tên Bạch Vô Hà, chỉ dùng 'trưởng lão'.",
					"Hỏi lại thay vì phản bác khi bị dồn.",
				},
			},
			{
				Name: "Bạch Vô Hà",
				Rules: []string{
					"Câu dài, nhiều mệnh đề phụ, luôn nghe như đang dạy đạo lý.",
					"Dùng 'ta' và 'con'; không bao giờ dùng 'ngươi' với Lâm Thanh trước mặt người ngoài.",
				},
			},
			{
				Name: "Diệp Tiểu Yến",
				Rules: []string{
					"Hay bỏ lửng câu ở cuối khi nói về Bạch gia.",
					"Dùng từ nghề y chính xác, không nói vòng.",
				},
			},
		},
		Taboos: []string{
			"Không để Lâm Thanh đoán đúng ý đồ Bạch gia trước chương 12",
			"Không dùng lại hình ảnh 'ba tiếng chuông' để kết chương lần thứ hai",
			"Không cho nhân vật phụ giải thích luật thế giới bằng một đoạn độc thoại dài",
			"Không mô tả nội tâm Bạch Vô Hà ở bất kỳ chương nào thuộc tuyến Lâm Thanh",
		},
		UpdatedAt: time.Now().Add(-2 * time.Hour).Format(time.RFC3339),
	}
}

// demoUserRules là quy tắc NGƯỜI DÙNG KHAI đã chuẩn hoá (meta/user_rules.json).
//
// Nguồn này khác demoStyleRules cả về bản chất lẫn vòng đời, và đó là lý do bề
// mặt Văn phong phải hiện cả hai: tệp này được Host ghi ngay lúc mở sách
// (internal/userrules/service.go:53), còn style_rules.json phải chờ tới biên cung
// đầu tiên. Một tác phẩm mới chỉ có tệp này — nếu bề mặt chỉ đọc style_rules thì
// nó rỗng trơn suốt cung đầu.
//
// Cố ý dựng Status = degraded: đó là ca một nguồn chuẩn hoá thất bại và bị hạ cấp
// thành preferences thô, tức quy tắc KHÔNG được máy kiểm mà chỉ mô hình đọc. Giao
// diện phải hiện khác ca ready, nên seed phải có nó để bề mặt không bao giờ chỉ
// được thử với đường thuận lợi.
func demoUserRules() *rules.Snapshot {
	return &rules.Snapshot{
		Version: rules.SnapshotVersion,
		Status:  rules.StatusDegraded,
		Structured: rules.Structured{
			Genre:          "tiên hiệp điều tra, nhịp chậm",
			ForbiddenChars: []string{"Triệu Nhất Đao", "Vương Bá Thiên"},
			ForbiddenPhrases: []string{
				"ở một mức độ nào đó", "đáng chú ý là", "không hiểu vì sao",
				"trăm mối cảm xúc ngổn ngang", "khóe miệng khẽ nhếch lên",
			},
			FatigueWords: map[string]int{
				"tuy nhiên": 2, "thế nhưng": 2, "ngoài ra": 1,
				"một thoáng": 2, "một tia": 2, "tựa như": 2,
				"im lặng": 2, "không nói gì": 2,
				"trong nháy mắt": 3, "khoảnh khắc": 3,
				"bất giác": 1, "không khỏi": 1,
			},
		},
		Preferences: "## [system_defaults]\n\nGiữ bảng từ gây mỏi mặc định của hệ thống.\n\n" +
			"## [global:van-phong-cua-toi.md]\n\nTôi muốn truyện đi chậm, mỗi chương chỉ đẩy " +
			"một bước điều tra, không dồn ba bước vào một chương. Đối thoại phải mang thông " +
			"tin, không được chỉ để lấp chỗ. Tránh mọi câu sáo của văn mạng: không 'khóe " +
			"miệng khẽ nhếch', không 'ánh mắt lóe lên tia sáng lạnh'.\n\n" +
			"## [project:trans-yeu-ky.md]\n\nRiêng cuốn này: mọi mốc thời gian phải khớp với " +
			"bảng niên biểu ở premise, sai một năm là lỗi nặng chứ không phải lỗi nhỏ.",
		Sources: []string{
			"system_defaults",
			"global:van-phong-cua-toi.md",
			"project:tran-yeu-ky.md",
		},
		Uncertain: []string{
			"'mỗi chương khoảng ba nghìn chữ' — số chữ là ràng buộc mềm về ngữ nghĩa, " +
				"cố ý không nâng lên structured (xem rules.Structured), giữ ở kênh preferences",
			"'giọng kể hơi cổ' — không có trường máy kiểm nào tương ứng, để mô hình tự diễn giải",
		},
	}
}

// ── chi phí: phần chia nhỏ theo tác tử và theo model ────────────────────────

// demoUsage gieo meta/usage.json cho bề mặt Chi phí.
//
// Ba ca cố ý nằm trong cùng một bản gieo, vì cả ba đều là ca bẫy thật:
//
//  1. arbiter có cost_usd = 0 ĐÚNG NGHĨA — nó có token thật (đã gọi model) nhưng
//     provider không tính tiền lượt đó. `$0` và "chưa có số liệu" là hai chuyện
//     khác nhau, và nếu hợp đồng JSON đặt omitempty lên cost_usd thì hàng này ra
//     JSON không có khoá và bề mặt sẽ hiện nó y như một tác tử chưa chạy.
//  2. editor có cache_capable = false trong khi các tác tử khác true — cột "tiết
//     kiệm nhờ đệm" phải hiện khác nhau cho hai loại này, không được hiện $0 như
//     nhau.
//  3. MissingUsage > 0 — số lượt mô hình không trả usage. Nó lớn nghĩa là MỌI con
//     số ở trên đều thiếu, nên bề mặt buộc phải nói ra thay vì để người vận hành
//     tin một tổng bị hụt.
func demoUsage() domain.UsageState {
	perAgent := map[string]domain.AgentUsageTotals{
		"writer": {
			Input: 486_320, Output: 92_140, CacheRead: 361_880, CacheWrite: 48_210,
			Cost: 4.182_6, Saved: 1.734_2, CacheCapable: true, CacheBreaks: 2,
		},
		"editor": {
			Input: 214_760, Output: 38_920, CacheRead: 0, CacheWrite: 0,
			Cost: 1.906_4, Saved: 0, CacheCapable: false,
		},
		"architect": {
			Input: 96_480, Output: 41_330, CacheRead: 52_100, CacheWrite: 18_640,
			Cost: 1.284_0, Saved: 0.402_8, CacheCapable: true,
		},
		// cost_usd = 0 mà token > 0: ca "$0 là số thật", xem ghi chú (1) ở trên.
		"arbiter": {
			Input: 12_840, Output: 3_260, CacheRead: 8_120, CacheWrite: 0,
			Cost: 0, Saved: 0.041_6, CacheCapable: true,
		},
	}
	perModel := map[string]domain.AgentUsageTotals{
		"gemini-2.5-pro": {
			Input: 703_920, Output: 168_390, CacheRead: 414_980, CacheWrite: 66_850,
			Cost: 7.373_0, Saved: 2.137_0, CacheCapable: true, CacheBreaks: 2,
		},
		"gemini-2.5-flash": {
			Input: 106_480, Output: 7_260, CacheRead: 7_120, CacheWrite: 0,
			Cost: 0, Saved: 0.041_6, CacheCapable: true,
		},
	}

	var overall domain.AgentUsageTotals
	for _, t := range perAgent {
		overall.Input += t.Input
		overall.Output += t.Output
		overall.CacheRead += t.CacheRead
		overall.CacheWrite += t.CacheWrite
		overall.Cost += t.Cost
		overall.Saved += t.Saved
		overall.CacheBreaks += t.CacheBreaks
	}
	overall.CacheCapable = true

	return domain.UsageState{
		UpdatedAt:    time.Now().Add(-90 * time.Second),
		Overall:      overall,
		PerAgent:     perAgent,
		PerModel:     perModel,
		MissingUsage: 3,
	}
}
