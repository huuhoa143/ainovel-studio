---
name: ainovel studio
description: Studio viết tiểu thuyết bằng AI, chạy trên máy bạn — bề mặt trung tính lạnh, màu chỉ ở bìa truyện, hành động chính và trạng thái.
colors:
  bg: "#0e0f12"
  panel: "#15161a"
  panel-2: "#1b1d22"
  raised: "#22242a"
  line: "rgba(255, 255, 255, 0.085)"
  line-2: "rgba(255, 255, 255, 0.055)"
  ink: "#eceef2"
  ink-2: "#a9adb6"
  ink-3: "#868b95"
  gold: "#f2b33d"
  gold-fill: "#f2b33d"
  tren-fill: "#1d1405"
  teal: "#4cc38a"
  amber: "#f28a4b"
  red: "#f06c6c"
  violet: "#a99bf2"
  bg-light: "#f5f5f3"
  panel-light: "#ffffff"
  panel-2-light: "#f0f0ed"
  raised-light: "#e9e9e5"
  line-light: "rgba(20, 20, 30, 0.11)"
  line-2-light: "rgba(20, 20, 30, 0.065)"
  ink-light: "#17181c"
  ink-2-light: "#4c4f57"
  ink-3-light: "#60636b"
  gold-light: "#985a07"
  gold-fill-light: "#eaa43a"
  tren-fill-light: "#241703"
  teal-light: "#16834f"
  amber-light: "#b5530f"
  red-light: "#c63838"
  violet-light: "#6450c4"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  headline-book:
    fontFamily: "Noto Serif, ui-serif, Georgia, serif"
    fontSize: "21px"
    fontWeight: 600
    lineHeight: 1.3
  title-book:
    fontFamily: "Noto Serif, ui-serif, Georgia, serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.35
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  title-card:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.55
    fontFeature: "\"cv11\", \"ss01\""
  body-long:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.6
  meta:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 500
    lineHeight: 1.4
  button:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 500
    lineHeight: 1
  prose:
    fontFamily: "Noto Serif, ui-serif, Georgia, serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.9
  prose-live:
    fontFamily: "Noto Serif, ui-serif, Georgia, serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.8
  code:
    fontFamily: "JetBrains Mono, ui-monospace, Menlo, monospace"
    fontSize: "11.5px"
    fontWeight: 400
rounded:
  pill: "999px"
  card: "14px"
  control: "8px"
  item: "7px"
  segment: "6px"
  spine: "2px 4px 4px 2px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  card: "18px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.gold-fill}"
    textColor: "{colors.tren-fill}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "30px"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "30px"
  button-secondary-hover:
    backgroundColor: "{colors.panel-2}"
  button-stop:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.amber}"
    rounded: "{rounded.control}"
    height: "30px"
  card:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.card}"
    padding: "{spacing.card}"
  pill-status:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  input:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
  rail-item:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.item}"
    padding: "5px 8px"
    height: "30px"
  rail-item-active:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
  segmented-on:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.segment}"
    height: "26px"
---

# Design System: ainovel studio

## Overview

**Creative North Star: "Bàn biên tập yên tĩnh"**

Một bàn làm việc của người biên tập, đặt trong khung của bàn dựng phim: rail điều hướng bên trái, canvas ở giữa, inspector bên phải, thanh điều khiển ở đáy. Mức hoàn thiện ngang Linear / Raycast (tinh, sắc, chiều sâu nhẹ), cá tính màu kiểu Arc / Things 3: mỗi cuốn truyện có một bìa màu riêng, còn mọi bề mặt khác đứng lùi lại, trung tính lạnh, viền mảnh.

Hai giao diện, tối và sáng, dùng chung một bộ tên token. Tối là mặc định khi hệ điều hành tối, sáng khi hệ điều hành sáng; người dùng ghim được bằng nút mặt trời / mặt trăng ở đầu rail (lưu `localStorage['ainovel.giaoDien']`, đặt `data-theme` trên `<html>` bằng script đầu trang để không nháy màu). Vì thế không có màu viết cứng trong component, trừ chữ trắng trên bìa (bìa không đổi theo giao diện).

Mật độ cao nhưng không ngợp: mỗi màn có đúng một điểm nhấn, chi tiết phụ nằm sau thao tác mở rộng. Serif là tín hiệu ngữ nghĩa: thấy Noto Serif là thấy chữ của tác phẩm, không phải chữ của công cụ.

**Key Characteristics:**
- Bề mặt xếp tầng bằng tông (`bg` → `panel` → `panel-2` → `raised`), viền 1px gần như trong suốt.
- Thẻ bo 14px kèm bóng mềm; nút, ô nhập bo 8px; huy hiệu dạng viên thuốc.
- Màu bão hòa chỉ ở ba chỗ: bìa truyện, hành động chính / chương đang viết (vàng), trạng thái dữ liệu.
- Inter cho giao diện với chữ số tabular; Noto Serif cho tên truyện, tên chương, văn truyện; mono chỉ cho mã.
- Trạng thái luôn có ba kênh: màu, ký hiệu hình học, chữ.

## Colors

Trung tính lạnh gần như không chroma; vàng là màu tín hiệu duy nhất, bốn màu dữ liệu đi kèm, và một bảng tám màu bìa nằm ngoài hệ token.

### Primary
- **Vàng đèn bàn** (`gold` / `gold-light`): chữ, viền, nét của thứ đang được chú ý — chương đang viết, tập/hồi hiện tại, vòng focus, viền ô nhập khi focus. Ở giao diện sáng nó là nâu-vàng sẫm để đạt tương phản nên không đem tô nền.
- **Vàng tô** (`gold-fill` / `gold-fill-light`) với **chữ trên vàng** (`tren-fill` / `tren-fill-light`): nền nút chính (Viết tiếp, Viết truyện mới) và khối "hiện tại" trên trục sản xuất. Chữ trên nền vàng luôn tối, ở cả hai giao diện.

### Secondary (màu dữ liệu)
- **Lục đã duyệt** (`teal`): đã duyệt, đã xong, đạt, kết nối sống.
- **Cam cần chú ý** (`amber`): cần viết lại, việc tồn, con số chưa phủ đủ mẫu số, viền nút Dừng.
- **Đỏ lỗi** (`red`): lỗi và mất kết nối. Chỉ thế thôi.
- **Tím chờ duyệt** (`violet`): chờ bạn duyệt (cửa nghiệm thu), công cụ.

### Tertiary (bìa truyện)
- **Bảng bìa** (`web/lib/bia.ts`): tám bộ ba sáng → chính → sâu (ngọc, son, lam, hổ phách, tím than, thiên thanh, hồng đào, rêu), chọn theo băm FNV của `id` thư mục, vẽ bằng `radial-gradient(120% 90% at 20% 10%, sáng 0, chính 55%, sâu 100%)`. Bìa là nội dung nên được phép bão hòa; nó không đổi theo giao diện. Vòng chữ cái của nhân vật cũng lấy từ bảng này.

### Neutral
- **Nền** (`bg`): canvas, rail, thanh đáy.
- **Mặt thẻ** (`panel`): thẻ, nút phụ, ô nhập.
- **Mặt lùi** (`panel-2`): hover, hàng xen kẽ, ô nhập lồng trong thẻ.
- **Mặt nổi** (`raised`): mục rail đang chọn, chip, ô ghim ở thanh đáy, rãnh của bộ chọn đoạn.
- **Viền** (`line`, `line-2`): `line` cho viền thẻ và điều khiển, `line-2` cho đường chia bên trong và mép rail / head.
- **Mực** (`ink` 16.5:1, `ink-2` 8.4:1, `ink-3` 5.3:1): chữ chính, chữ phụ, nhãn và meta. `ink-3` là sàn tương phản cứng, không có mực nào nhạt hơn.

### Named Rules
**The Ba Chỗ Có Màu Rule.** Màu bão hòa chỉ xuất hiện ở bìa truyện, ở hành động chính / thứ đang hiện tại (vàng), và ở trạng thái dữ liệu (lục, cam, đỏ, tím). Khung, nền, tiêu đề, biểu tượng điều hướng đều trung tính.

**The Vàng Tô Khác Vàng Nét Rule.** Nền vàng dùng `gold-fill` với chữ `tren-fill`; `gold` chỉ làm chữ, viền, nét. Tô nền bằng `gold` ở giao diện sáng ra màu đục.

**The Một Tên Hai Giao Diện Rule.** Mọi màu của component đi qua token; thêm màu mới thì phải có giá trị cho cả hai khối tối và sáng.

## Typography

**Display Font:** Inter (với ui-sans-serif, system-ui)
**Body Font:** Inter, `font-feature-settings: "cv11", "ss01"`, số `tabular-nums` ở mọi chỗ có số liệu
**Book Font:** Noto Serif (với ui-serif, Georgia)
**Label/Mono Font:** JetBrains Mono (với ui-monospace, Menlo)

Cả ba tải qua `next/font` lúc build với subset `vietnamese`, không gọi CDN lúc chạy.

**Character:** Một sans trung tính, chặt, cho công cụ; một serif có dấu tiếng Việt đẹp cho tác phẩm. Hai họ tương phản rõ, không ghép hai sans gần nhau.

### Hierarchy
- **Display** (600, 24px, 1.25, −0.02em): lời chào ở đầu Tủ truyện. Mỗi màn nhiều nhất một chỗ.
- **Headline sách** (Noto Serif 600, 21–22px, 1.3): tên chương đang viết ở Tiến độ, tên chương ở Nhận xét biên tập; đầu chương ở khổ đọc là 1.6em.
- **Title sách** (Noto Serif 600, 15–17px, 1.22–1.35): tên chương ở inspector và gợi ý chương tiếp, tên truyện trên bìa (15px, chữ trắng, bóng chữ nhẹ), tên chương trong bảng (500, 14px).
- **Title** (600, 15px, 1.3, −0.01em): tiêu đề màn ở thanh head.
- **Title thẻ** (600, 13–13.5px, 1.4): tiêu đề thẻ ("Phiên này", "Chương gần đây").
- **Body** (400, 13px, 1.55): nền giao diện. Đoạn dài dùng 13.5px / 1.6; mô tả trong hồ sơ thế giới dùng Inter, khổ 72–88ch.
- **Meta** (400, 12px, 1.5): dòng phụ, thời gian, đơn vị.
- **Label** (500, 11.5px, 1.4): nhãn nhóm rail, huy hiệu, chú giải. Không viết hoa, không giãn chữ.
- **Prose** (Noto Serif 400, 17px, 1.9, khổ 68ch): khổ đọc. Văn đang chảy ở Tiến độ 15px / 1.8; dẫn chứng của biên tập viên 14.5px / 1.8, khổ 72ch.
- **Code** (JetBrains Mono 400, 11.5px): id thư mục, tên model, khóa API, địa chỉ.

### Named Rules
**The Serif Là Chữ Của Truyện Rule.** Noto Serif chỉ cho tên truyện, tên chương và văn truyện (kể cả đoạn trích lại). Phép thử: chữ này có nằm trong bộ truyện xuất bản không? Không thì dùng Inter.

**The Mono Chỉ Cho Mã Rule.** Mono dành cho thứ cần đối chiếu từng ký tự (id, model, khóa). Số liệu thường dùng Inter `tabular-nums`, canh phải trong bảng.

**The Dấu Hai Tầng Rule.** Văn xuôi tiếng Việt có line-height ít nhất 1.75; tiêu đề dùng `text-wrap: balance`. Không viết hoa cả chữ để nhấn; nếu cần thì chỉ viết hoa chữ cái đầu.

## Layout

**Khung ứng dụng** là một lưới cố định cao `100dvh`, trang không cuộn, mỗi vùng tự cuộn:

- Từ 1240px trở lên: `rail 236px | canvas | inspector 320px`, thanh trạng thái ở hàng dưới, nằm dưới canvas và inspector (rail đi hết chiều cao).
- Khu không có inspector (khổ đọc, hồ sơ) bỏ hẳn cột 320px, không để cột trống.
- 860–1240px: inspector ẩn, còn `rail | canvas`.
- Dưới 860px: một cột, rail thành dải ngang cuộn được ở đầu (ẩn logo, nhóm, chip kết nối), canvas, rồi thanh đáy. Mọi màn phải có bố cục hẹp.
- Dưới 700px: khối trên trục sản xuất bỏ phạm vi chữ, giữ số hiệu và ký hiệu.

**Thanh head** cao tối thiểu 56px, đệm 12px 24px, viền dưới `line-2`: tiêu đề màn, một dòng phụ meta, công cụ bên phải (bộ chọn đoạn hoặc nút).

**Nhịp khoảng cách** theo bậc 4: 4 / 8 / 12 / 16 / 24px; trong thẻ 16–24px, giữa thẻ 16–24px, trong dòng 6–10px. Khoảng ngoài nhóm luôn lớn hơn khoảng trong nhóm.

**Thanh đáy** (transport) cao tối thiểu 46px, xuống dòng khi nội dung không vừa ở mọi bề rộng (độ dài phụ thuộc dữ liệu, không phụ thuộc màn hình). Ô trạng thái ghim bên trái, số liệu ở giữa, nút điều khiển và nút chính bên phải.

### Named Rules
**The Một Điểm Nhấn Rule.** Mỗi màn có đúng một tiêu điểm (thường là một nút vàng hoặc một tên chương serif lớn); mọi thứ khác lùi về trung tính.

## Elevation & Depth

Chiều sâu nhẹ: chủ yếu là xếp tầng bằng tông, cộng một lớp bóng mềm dưới thẻ. Không bóng cứng, không glow, không glass trang trí.

### Shadow Vocabulary
- **Bóng thẻ** (`--shadow`): tối là viền sáng trong 1px cộng `0 8px 28px` đen 32%; sáng là `0 1px 2px` + `0 6px 20px` ở 5%. Cho mọi thẻ cấp một và đoạn đang bật của bộ chọn.
- **Bóng nổi** (`--shadow-pop`): `0 18px 50px` cộng viền 1px. Chỉ cho popover, menu, hộp thoại.
- **Vòng focus**: viền 2px `gold` 80%, cách 2px; ô nhập focus đổi viền sang `gold` 60% kèm quầng 3px `gold` 18%.

### Named Rules
**The Phẳng Trong Thẻ Rule.** Không lồng thẻ trong thẻ. Bên trong thẻ chỉ chia bằng đường `line-2` hoặc mặt `panel-2`.

## Shapes

Góc mềm, cùng một họ: thẻ 14px (`--r-lg`), nút và ô nhập 8px, mục rail 7px, đoạn trong bộ chọn 6px, huy hiệu và chip 999px, đốm trạng thái tròn 6–7px. Bìa nhỏ ở rail là hình cuốn sách (14×18px, bo `2px 4px 4px 2px`, gáy tối 2px). Bìa lớn ở Tủ truyện có gáy là vệt tối 3px ở mép trái. Ô "Viết truyện mới" và trạng thái rỗng dùng viền đứt.

## Components

### Buttons
- **Shape:** bo 8px, cao 30px, đệm ngang 12px, chữ 500 12.5px, khoảng cách biểu tượng 7px.
- **Primary:** nền `gold-fill`, chữ `tren-fill` 600. Hover trộn 12% `ink` vào nền. Mỗi màn một nút chính.
- **Secondary:** nền `panel`, viền `line`, chữ `ink`; hover sang `panel-2` và viền đậm hơn.
- **Dừng:** nền `panel`, viền `amber` 55%, chữ `amber` — dừng có chủ ý không phải lỗi nên không đỏ.
- **Ghost (dkPhu):** không nền không viền, chữ `ink-3`; hover sang `panel-2`.
- **Hành vi:** nhãn nói hệ quả ("Gửi góp ý và viết tiếp", "Đọc chương mới nhất"); nút ghi bị `disabled` khi đang gửi; nút chỉ hiện khi nó làm được việc (Chạy và Dừng loại trừ nhau).

### Chips / Huy hiệu trạng thái (viên)
- **Style:** viên thuốc, đệm 2px 8px, chữ label 500 11.5px. Mặc định nền `raised`, chữ `ink-2`.
- **Màu:** biến thể teal / gold / amber / red / violet có nền là màu đó 15–16% và chữ là chính màu đó. Luôn mang ký hiệu + chữ.

### Cards / Containers
- **Corner Style:** 14px.
- **Background:** `panel`, viền `line`, bóng thẻ.
- **Internal Padding:** 16–24px; tiêu đề thẻ ở trên, số đếm meta canh phải cùng hàng.

### Inputs / Fields
- **Style:** nền `panel`, viền `line`, bo 8px.
- **Focus:** viền vàng 60% + quầng 3px; không đổi nền.
- **Ô góp ý** ở đáy Tiến độ: viên dài bo tròn, biểu tượng góp ý bên trái, nút gửi dạng viên bên phải.

### Navigation (rail)
- Logo ba lane + chữ "ainovel" 600 14px, nút đổi giao diện 28px bên phải.
- Mục 30px, bo 7px, chữ 500 13px `ink-2`, biểu tượng `ink-3`; hover `panel-2`; đang mở `raised` + `ink`. Số đếm 11px tabular canh phải.
- Nhóm "Truyện": mỗi cuốn một hàng có bìa nhỏ màu riêng, mục con thụt 31px, nhóm con thụt 47px. Đốm 7px: teal = đang chạy, amber = có việc tồn. Nút "chờ duyệt" màu tím đứng ngay dưới cuốn có cửa nghiệm thu.
- Chân rail: chip kết nối (đốm teal sống / vàng đang mở / đỏ mất).

### Bộ chọn đoạn (segmented)
Rãnh `raised` bo 8px, đệm 2px; đoạn 26px bo 6px, chữ 500 12px `ink-3`; đoạn bật nền `panel` + bóng thẻ + `ink`. Dùng cho "Xem theo Tập / Hồi / Chương".

### Trục sản xuất (signature)
Ba lane Tập / Hồi / Chương cùng một trục ngang, độ rộng khối tỉ lệ với phạm vi thật. Đã duyệt là teal, hiện tại là khối `gold-fill` có ▶, chưa viết là ô rỗng viền mảnh, chưa lên dàn ý là ô □. Dưới lane chương là mốc số chương và câu "Chương a–b / tổng · n chương ngoài khung nhìn · Xem cả …". Chú giải màu đặt ngay dưới trục.

### Thanh trạng thái (transport)
Ô trạng thái ghim (`raised`, ký hiệu + chữ), rồi các cặp nhãn `ink-3` + giá trị `ink` 500 12px tabular ("tốc độ 7,5 chương/giờ", "đã tiêu $128,25"). Tên model là mono. Bên phải: dòng giải thích trạng thái và nút chính Viết tiếp.

### Bìa truyện
Thẻ truyện ở Tủ truyện: bìa màu bên trái (tên truyện serif trắng ở chân bìa), bên phải tên truyện, id thư mục mono, trạng thái, thanh tiến độ teal mảnh kèm "725 / 783 chương · 93%", rồi chi phí và năng suất.

### Ký hiệu trạng thái
Glyph hình học là kênh thứ hai của dữ liệu, đứng trong dòng chữ, luôn đi cùng chữ (`web/lib/nhan.ts`):

| Ký hiệu | Màu | Nghĩa |
|---|---|---|
| ● | teal | đã duyệt, đã xong |
| ▶ | gold | đang viết, hiện tại, đang chạy |
| ■ | amber | cần viết lại |
| ◆ | violet | chờ duyệt |
| ○ | muted (`ink-3`) | chưa viết, đang nghỉ |
| ◇ / □ | muted | đã / chưa lên dàn ý |

### Biểu tượng
Bộ SVG vẽ tay trong `web/components/BieuTuong.tsx`: khung 24, nét `currentColor` 1.6px, đầu nét tròn, mặc định 15px, `aria-hidden`. Biểu tượng mang màu của chữ bên cạnh (thường `ink-3`). Thêm biểu tượng mới thì thêm vào bộ này, không dùng ký tự Unicode hay thư viện ngoài.

### Chữ trên giao diện
Từ vựng và giọng ở `PRODUCT.md`; chuỗi ở `web/lib/nhan.ts` và `web/lib/chu/*.ts`. Về mặt trình bày: viết thường kiểu câu, không viết hoa để nhấn; số theo kiểu Việt (`1.421.310`, `7,5`, `$0,177`); thiếu số đo thì hiện "—", không hiện 0; con số tổng mang mẫu số của nó ("tính trên 1/3 truyện", tông amber); trạng thái rỗng, lỗi, đang tải đều có một câu nói rõ và việc nên làm tiếp.

### Motion
Easing `cubic-bezier(0.16, 1, 0.3, 1)`, 140–160ms cho chuyển trạng thái thường, chỉ trên nền, màu chữ, viền, bóng. Nội dung không bị gate sau animation.

Chuyển động LẶP chỉ có một nghĩa: máy đang chạy THẬT. Mọi vòng lặp gắn với `data-tt="chay"` (thẻ đang làm) hoặc `data-chay` (thanh dưới) — cùng khóa `mayNaoDo` — không bao giờ với `stage` đã ghi trên đĩa. Mỗi chuyển động trả lời một câu:

- chấm đập 2.2s ở thẻ và ký hiệu ▶ ở thanh dưới — "còn sống";
- đường vàng trôi dọc mép trên thanh dưới (2.4s) — tín hiệu còn sống thấy được từ mọi màn;
- dải sáng quét qua bước đang làm của dải năm bước / bốn chặng dựng nền (1.9s) — "việc đang ở đây";
- màu xanh lấp từ trái sang một lần khi một bước xong (450ms) — "xong, sang bước kế";
- vạch chéo trôi trên ô chương đang viết ở trục chương — "chương này";
- con trỏ vàng nhấp nháy cuối văn đang chảy, vòng quay nhỏ cạnh bước công cụ đang chạy;
- đồng hồ "· 0:42" của bước đang chạy nhích từng giây — một lượt dài không stream không được đứng im.

`prefers-reduced-motion`: bỏ chuyển động không gian và vòng lặp, GIỮ tín hiệu — bước đang làm vẫn sáng vàng, chương đang viết vẫn mang vạch chéo (đứng yên), con trỏ đứng yên, vòng quay thành chấm vàng, đường chạy thành vạch tĩnh. Bất biến chéo giữa các bề mặt được canh ở `web/app/trangthai.matran.test.tsx`.

## Do's and Don'ts

### Do:
- **Do** tô nền vàng bằng `gold-fill` với chữ `tren-fill`, và dùng `gold` chỉ cho chữ, viền, nét.
- **Do** đi qua token cho mọi màu, để cả hai giao diện cùng đúng; thêm token mới thì thêm vào cả khối tối và khối sáng.
- **Do** dùng thẻ `.the` (bo 14px, viền `line`, bóng thẻ) cho khối cấp một, nút bo 8px, huy hiệu `.vien` cho trạng thái.
- **Do** đặt số liệu bằng Inter `tabular-nums`, canh phải trong bảng; mono chỉ cho id, model, khóa.
- **Do** kèm ký hiệu và chữ cho mọi trạng thái, không để màu đứng một mình.
- **Do** giữ một điểm nhấn mỗi màn và cho chi tiết phụ lùi sau thao tác mở rộng.
- **Do** lấy màu bìa từ `mauBia` / `nenBia` theo `id`, không theo tên truyện.

### Don't:
- **Don't** dùng màu bão hòa cho khung, tiêu đề hay biểu tượng điều hướng; màu chỉ ở bìa, hành động chính và trạng thái.
- **Don't** dùng Noto Serif cho chữ của công cụ (nhãn, nút, mô tả hồ sơ), và đừng dùng mono cho số thường.
- **Don't** đặt nhãn chữ hoa nhỏ giãn cách lên trên khối, đừng dùng chữ gradient, glassmorphism trang trí hay glow.
- **Don't** làm hàng số to + nhãn nhỏ kiểu landing SaaS; con số phải trả lời một câu hỏi vận hành và mang mẫu số.
- **Don't** đánh dấu trạng thái hay hàng đang chọn bằng dải màu dày ở cạnh trái; dùng nền, màu chữ hoặc viền trong 1px.
- **Don't** lồng thẻ trong thẻ, và đừng thêm bóng cứng.
- **Don't** viết màu cứng trong component; ngoại lệ duy nhất là chữ trắng trên bìa và vòng nhân vật.
- **Don't** dùng đỏ cho Dừng; đỏ chỉ dành cho lỗi. Trong danh sách dài, Xóa lùi về `ink-3` lúc nghỉ và chỉ đỏ khi trỏ hoặc focus, không tô nền.
