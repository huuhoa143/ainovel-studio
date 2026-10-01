# Brief làm lại giao diện · ainovel studio v2

## Direction contract

THESIS: Studio viết tiểu thuyết bằng AI ở mức hoàn thiện của Linear/Raycast (tinh, sắc, có chiều sâu nhẹ) cộng cá tính màu của Arc/Things 3. Bỏ hẳn kiểu "bảng điều khiển nhà máy" nâu-đen, nhiều đường kẻ, chữ mono khắp nơi.

OWN-WORLD: Bề mặt trung tính lạnh (`--bg`, `--panel`, `--panel-2`, `--raised`), viền mảnh `--line`, thẻ bo `--r-lg` (14px) với `--shadow`, nút bo 8px. Màu thật chỉ có ở ba chỗ: bìa truyện (`lib/bia.ts`, mỗi truyện một màu), hành động chính và chương đang viết (`--gold`), và trạng thái dữ liệu (`--teal` ổn hoặc đã duyệt, `--amber` cần chú ý, `--red` lỗi, `--violet` chờ duyệt). Có hai giao diện, sáng và tối, dùng chung tên token, nên tuyệt đối không viết màu cứng. Inter cho giao diện, dùng chữ số tabular. Noto Serif CHỈ cho tên truyện, tên chương và văn truyện. Mono chỉ cho mã (id thư mục, tên model) và không dùng cho số thường.

STORY: Người dùng mở studio, thấy ngay truyện nào đang viết và có việc gì cần mình, bấm một lần là vào việc. Mỗi màn có MỘT điểm nhấn chính, phần còn lại lùi lại.

FIRST VIEWPORT: xem mẫu `.impeccable/mocks/huong2.png` (mở bằng Read). Phần trên là Tủ truyện bản tối, phần dưới là Tiến độ bản sáng. Đó là chuẩn mức hoàn thiện, không phải bản vẽ để chép pixel.

FORM: canon (chuẩn ngành), tham chiếu Linear/Raycast × Arc/Things 3, seed 6608f96e.

FINISH: chưa review và chưa ghi tài liệu thì chưa xong. Bản dựng kết thúc bằng finish review, verdict và DESIGN.md.

## Luật làm việc song song (bắt buộc)

- Thư mục: `/Users/robin/Personal/ainovel-cli/web`. Có nhiều agent cùng làm trên cùng cây thư mục, mỗi agent một nhóm màn.
- CSS: chỉ viết trong tệp `app/man/<ten-ban>.css` của bạn. Tệp này đã được import sẵn và nạp sau `globals.css` và `he.css`. KHÔNG sửa `app/globals.css`, `app/he.css` hay `app/man/index.css`. Muốn bỏ một quy tắc cũ thì ghi đè nó trong tệp của bạn, với selector có phạm vi theo id hoặc lớp gốc của màn (vd. `#xuong …`, `.buonglai …`) để không lan sang màn khác.
- Chữ hiển thị: viết thuần Việt, ấm và rõ, xưng "bạn", theo từ vựng ở PRODUCT.md (Tủ truyện, Tiến độ, Đọc truyện, Nhận xét biên tập, Cần viết lại, Góp ý; vai là Điều phối, Kiến trúc sư, Người viết, Biên tập viên; Tập → Hồi → Chương). Sửa giá trị trong `lib/nhan.ts` bằng tool Edit, từng chỗ nhỏ (agent khác cũng đang sửa tệp này, nên không ghi đè cả tệp; nếu Edit báo tệp đã đổi thì đọc lại rồi sửa tiếp). Chuỗi MỚI thì đặt trong `lib/chu/<ten-ban>.ts` (tạo mới, export một object) để không giẫm lên nhau.
- Chỉ sửa component trong danh sách của bạn. Component dùng chung với người khác thì không đụng; ghi vào báo cáo.
- Dùng thành phần chung đã có trong `he.css`: `.the` (thẻ), `.vien` + `teal|gold|amber|red|violet` (viên trạng thái), `.nutChinh` / `.nutPhu`, `.head`. Biểu tượng lấy từ `components/BieuTuong.tsx` (SVG nét 1.6). Thêm biểu tượng mới thì báo lại, không tự sửa tệp đó.
- Màu bìa truyện: `import { mauBia, nenBia } from '@/lib/bia'`.
- KHÔNG chạy `npm run build`, KHÔNG mở trình duyệt (chỉ có một profile và các agent sẽ tranh nhau). Chỉ chạy `npx tsc --noEmit` và `npx vitest run <các test của bạn>`. Trước khi báo xong, chạy cả bộ `npx vitest run`. Test đỏ vì đổi cấu trúc hoặc chữ thì sửa test cho đúng hành vi mới, không nới lỏng bài kiểm. Test đỏ ở tệp không phải của bạn thì ghi vào báo cáo.
- Không commit.
- Giữ nguyên hành vi, dữ liệu và luồng gọi API. Đây là làm lại giao diện và trải nghiệm, kèm sửa bug giao diện thấy được, không viết lại logic engine.
- Mục tiêu UX cho mỗi màn: không ngợp (ẩn chi tiết phụ sau thao tác mở rộng), một điểm nhấn chính, thao tác hay dùng thì bấm ít nhất, trạng thái rỏng hoặc lỗi hoặc đang tải đều có câu rõ ràng kèm việc nên làm tiếp. Có bố cục hẹp dưới 860px.

## Báo cáo cuối

Tiếng Việt, gọn: đã đổi gì ở từng màn (bố cục, điểm nhấn, thao tác), tệp đã sửa, trạng thái test, và những gì cần người khác làm hoặc cần kiểm bằng mắt.

## Cập nhật token (đọc lại)

- Nền của nút chính hoặc khối tô vàng dùng `--gold-fill`, chữ đặt trên nó dùng `--tren-fill`. `--gold` chỉ dùng làm CHỮ, viền hoặc nét. Ở giao diện sáng, `--gold` là nâu-vàng sẫm để đạt tương phản, nên đem tô nền sẽ trông đục.
- Đã có `--shadow-pop` cho popover và hộp thoại.
