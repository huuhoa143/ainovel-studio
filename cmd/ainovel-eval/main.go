// ainovel-eval là harness đánh giá ngoại tuyến cho người phát triển — chạy các ca trong
// evals/cases qua engine thật và chấm điểm. Không đóng gói vào app.
//
// Dùng: go run ./cmd/ainovel-eval --config /duong/dan/config.json --cases evals/cases
package main

import (
	"os"

	"github.com/huuhoa143/ainovel-studio/internal/eval"
)

func main() {
	os.Exit(eval.Command(os.Args[1:]))
}
