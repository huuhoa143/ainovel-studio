// ainovel-cli là thành phần chạy ngầm (sidecar) của app AINovel Studio: app spawn
// `ainovel-cli serve ...` và mở giao diện của nó trong cửa sổ. Không còn TUI hay chế độ
// dòng lệnh nào khác — hợp đồng ở docs/superpowers/specs/2026-10-08-desktop-app-design.md.
package main

import (
	"fmt"
	"os"

	"github.com/huuhoa143/ainovel-studio/internal/serve"
	buildversion "github.com/huuhoa143/ainovel-studio/internal/version"
)

// Do desktop/scripts/build-sidecar.sh tiêm qua -ldflags "-X main.version=…".
var (
	version = "dev"
	commit  = "unknown"
	date    = "unknown"
)

// loiKhongPhaiApp là câu trả lời cho mọi cách gọi không phải của app. Một dòng, vì người gõ
// nó gần như chắc chắn đã mở nhầm tệp trong gói app.
const loiKhongPhaiApp = "ainovel-cli là thành phần chạy ngầm của AINovel Studio — mở app AINovel Studio để dùng."

func main() {
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "serve":
			os.Exit(serve.Command(os.Args[2:]))
		case "--version":
			// Quy trình phát hành dùng dòng này để xác nhận nhị phân trong gói đúng phiên bản.
			if len(os.Args) == 2 {
				buildversion.Print(os.Stdout, buildversion.Info{Version: version, Commit: commit, Date: date})
				return
			}
		}
	}
	fmt.Fprintln(os.Stderr, loiKhongPhaiApp)
	os.Exit(2)
}
