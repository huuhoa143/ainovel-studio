package serve

import (
	"strings"
	"testing"

	"github.com/huuhoa143/ainovel-studio/internal/utils"
)

// vaiDoanCuoi trả vai của đoạn CUỐI chuỗi theo luật công tắc của ThinkingSep:
// đoạn 0 là văn, sau mỗi dấu thì đổi vai. Đây đúng là phép mà TUI
// (panels_activity.go) và web (lib/vanSong.ts) dùng để tô màu.
func vaiDoanCuoi(s string) string {
	if strings.Count(s, utils.ThinkingSep)%2 == 1 {
		return "nghĩ"
	}
	return "văn"
}

// Cắt đầu bộ đệm KHÔNG được đảo vai của các đoạn phía sau.
//
// ThinkingSep là công tắc: nuốt mất dấu MỞ mà để lại dấu ĐÓNG thì từ đó trở đi
// văn bị vẽ thành suy nghĩ và ngược lại — mà không mất chữ nào, nên không chỗ
// nào kêu. Bài này canh đúng cái im lặng đó.
func TestCatDauGiuVai(t *testing.T) {
	const S = utils.ThinkingSep

	// Phần giữ mở đầu giữa một đoạn SUY NGHĨ: dấu mở nằm trong phần bỏ đi.
	s := "văn đầu" + S + "đang nghĩ dài dài dài" + S + "văn sau"
	giu := "dài" + S + "văn sau" // đoạn đầu của phần giữ vẫn là suy nghĩ
	got := catDauGiuVai(s, len(giu))
	if !strings.HasPrefix(got, S) {
		t.Fatalf("mất dấu mở, đoạn suy nghĩ cụt đầu sẽ bị vẽ thành văn: %q", got)
	}
	if vaiDoanCuoi(got) != vaiDoanCuoi(s) {
		t.Errorf("đoạn cuối đổi vai sau khi cắt: %q (%s) ≠ gốc (%s)",
			got, vaiDoanCuoi(got), vaiDoanCuoi(s))
	}

	// Phần bỏ đi chứa HAI dấu: parity chẵn, không được thêm gì.
	s2 := "a" + S + "nghĩ" + S + "văn giữ lại đây"
	if got2 := catDauGiuVai(s2, len("văn giữ lại đây")); got2 != "văn giữ lại đây" {
		t.Errorf("parity chẵn mà vẫn thêm dấu: %q", got2)
	}

	// Chưa quá trần thì trả nguyên.
	if catDauGiuVai("ngắn", 100) != "ngắn" {
		t.Error("chuỗi ngắn hơn trần phải giữ nguyên")
	}
}
