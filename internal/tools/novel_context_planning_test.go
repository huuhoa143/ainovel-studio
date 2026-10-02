package tools

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/huuhoa143/ainovel-studio/internal/domain"
	"github.com/huuhoa143/ainovel-studio/internal/store"
)

// Kiến trúc sư của truyện dài không được nhận nguyên dàn ý mỗi lần đọc ngữ cảnh: chỉ khung
// tập/hồi đi toàn cục, chi tiết chương chỉ có ở MỘT hồi. Bản sửa lấy từ bản gốc ainovel-cli
// (7217f42 + 47df100).

type planningArcView struct {
	Index           int                   `json:"index"`
	Status          string                `json:"status"`
	Chapters        []domain.OutlineEntry `json:"chapters"`
	ChaptersOmitted bool                  `json:"chapters_omitted"`
	Goal            string                `json:"goal"`
}

type planningView struct {
	LayeredOutline []struct {
		Index int               `json:"index"`
		Arcs  []planningArcView `json:"arcs"`
	} `json:"layered_outline"`
	OutlineDetail map[string]int `json:"outline_detail"`
}

func planningStore(t *testing.T) *store.Store {
	t.Helper()
	s := store.NewStore(t.TempDir())
	if err := s.Init(); err != nil {
		t.Fatalf("Init: %v", err)
	}
	if err := s.Progress.Init("test", 4); err != nil {
		t.Fatalf("Init progress: %v", err)
	}
	if err := s.Progress.SetLayered(true); err != nil {
		t.Fatalf("SetLayered: %v", err)
	}
	if err := s.Progress.UpdateVolumeArc(1, 2); err != nil {
		t.Fatalf("UpdateVolumeArc: %v", err)
	}
	if err := s.Outline.SaveLayeredOutline([]domain.VolumeOutline{
		{Index: 1, Title: "Tập 1", Arcs: []domain.ArcOutline{
			{Index: 1, Title: "Mở", Goal: "lập đội", Chapters: []domain.OutlineEntry{{Chapter: 1, Title: "c1"}, {Chapter: 2, Title: "c2"}}},
			{Index: 2, Title: "Giữa", Goal: "vào hang", Chapters: []domain.OutlineEntry{{Chapter: 3, Title: "c3"}, {Chapter: 4, Title: "c4"}}},
		}},
		{Index: 2, Title: "Tập 2", Arcs: []domain.ArcOutline{
			{Index: 1, Title: "Khung", Goal: "đối mặt", EstimatedChapters: 6},
		}},
	}); err != nil {
		t.Fatalf("SaveLayeredOutline: %v", err)
	}
	return s
}

func docPlanning(t *testing.T, s *store.Store, args string) (planningView, error) {
	t.Helper()
	raw, err := NewContextTool(s, References{}, "default").Execute(context.Background(), json.RawMessage(args))
	if err != nil {
		return planningView{}, err
	}
	var out struct {
		Planning planningView `json:"planning_memory"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	return out.Planning, nil
}

func hoi(p planningView, vol, arc int) planningArcView {
	for _, v := range p.LayeredOutline {
		if v.Index != vol {
			continue
		}
		for _, a := range v.Arcs {
			if a.Index == arc {
				return a
			}
		}
	}
	return planningArcView{Index: -1}
}

func TestArchitectPlanningChiMoChiTietHoiHienTai(t *testing.T) {
	p, err := docPlanning(t, planningStore(t), `{}`)
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	if got := hoi(p, 1, 2); len(got.Chapters) != 2 || got.ChaptersOmitted {
		t.Fatalf("hồi hiện tại (v1a2) phải mang đủ chương: %+v", got)
	}
	if got := hoi(p, 1, 1); len(got.Chapters) != 0 || !got.ChaptersOmitted {
		t.Fatalf("hồi khác phải bỏ chi tiết chương: %+v", got)
	}
	if got := hoi(p, 2, 1); got.Status != "skeleton" || got.Goal != "đối mặt" {
		t.Fatalf("hồi khung phải giữ mục tiêu: %+v", got)
	}
	if p.OutlineDetail["volume"] != 1 || p.OutlineDetail["arc"] != 2 {
		t.Fatalf("outline_detail = %v, muốn v1a2", p.OutlineDetail)
	}
}

func TestArchitectPlanningDocKhoanhVungTheoTapHoi(t *testing.T) {
	s := planningStore(t)
	p, err := docPlanning(t, s, `{"volume":1,"arc":1}`)
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	if got := hoi(p, 1, 1); len(got.Chapters) != 2 {
		t.Fatalf("hồi được xin phải mang đủ chương: %+v", got)
	}
	if got := hoi(p, 1, 2); len(got.Chapters) != 0 {
		t.Fatalf("chỉ một hồi mang chi tiết: %+v", got)
	}
	// Hồi khung xin được (bản sửa 47df100): trả mục tiêu để expand_arc, không báo lỗi.
	p, err = docPlanning(t, s, `{"volume":2,"arc":1}`)
	if err != nil {
		t.Fatalf("hồi khung phải đọc được: %v", err)
	}
	if got := hoi(p, 2, 1); got.Status != "skeleton" {
		t.Fatalf("hồi khung: %+v", got)
	}
}

func TestArchitectPlanningTuChoiThamSoSai(t *testing.T) {
	s := planningStore(t)
	for _, args := range []string{`{"volume":1}`, `{"arc":1}`, `{"chapter":1,"volume":1,"arc":1}`, `{"volume":9,"arc":9}`, `{"volume":-1,"arc":1}`} {
		if _, err := docPlanning(t, s, args); err == nil {
			t.Fatalf("%s phải bị từ chối", args)
		}
	}
}
