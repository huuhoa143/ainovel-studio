# Ảnh và GIF của README / README media

Bốn tệp ở thư mục này là giao diện studio của app **chụp thật**, không phải mockup:

| Tệp | Bề mặt | Dùng ở |
|---|---|---|
| `studio.gif` | 5 khung: Quản lý → Dòng sản xuất → Bản thảo → Chi phí toàn xưởng → Model theo vai | đầu README |
| `quan-ly.png` | Màn Quản lý | mục Ba màn |
| `ban-thao.png` | Đọc bản thảo + bản duyệt của Editor | đầu README |
| `chi-phi-xuong.png` | Chi phí toàn xưởng | đầu README |

## Vì sao chụp từ một store nhân bản, không phải store thật

Ảnh lên README là ảnh **công khai**, nên hai thứ trong store thật không được lên:

1. **Đường dẫn nhà.** Thanh trên cùng in thư mục gốc (trong app thật là thư mục dữ liệu của
   app, mang tên người dùng máy). Chạy thẳng từ máy ai thì ảnh mang tên
   người đó (`/Users/<tên>/...`). Store nhân bản đặt ở `/tmp/ainovel/xuong` nên thanh đó đọc là
   `tmp/ainovel/xuong` — không có gì để lộ.
2. **Ba cuốn trùng tên.** Store thật có ba lượt chạy thử đều đặt `novel_name` là *Trấn Yêu Ký*.
   Đúng dữ liệu, nhưng ba dòng trùng tên trên một bảng quản lý **đọc thành lỗi hiển thị**. Bản
   nhân bản đổi tên hai cuốn phụ cho khác nhau.

Ngoài hai điểm đó, **mọi con số đều là số thật** của một lượt chạy có thu phí: `$7,37` đã tiêu,
`$2,18` bộ đệm tiết kiệm, `$1.475/chương`, `0,5 chương/giờ`, và cảnh báo *"3 lượt mô hình không
trả số liệu dùng"*. Đừng thay bằng số đẹp hơn — cả điểm mạnh của bề mặt này là nó không làm tròn
cho dễ nhìn.

## Tái tạo

```bash
# 1. Nhân bản store, đổi tên hai cuốn phụ cho khác nhau
rm -rf /tmp/ainovel && mkdir -p /tmp/ainovel
cp -R "$HOME/Library/Application Support/AINovel Studio/books" /tmp/ainovel/xuong   # hoặc thư mục truyện bất kỳ
mv /tmp/ainovel/xuong/chay-thu /tmp/ainovel/xuong/cuu-tuyen-duong
# rồi sửa "novel_name" trong meta/progress.json của từng cuốn

# 2. Cấu hình riêng với khóa giả, để khỏi đọc config.json của app đã cài
#    (viết /tmp/ainovel/config.json: một provider, api_key giả, một model mặc định)

# 3. Chạy sidecar thẳng; --config là tệp DUY NHẤT nó đọc/ghi, --addr phải là loopback
./ainovel-cli serve --addr 127.0.0.1:8421 --root /tmp/ainovel/xuong \
  --config /tmp/ainovel/config.json --web web/out
```

Chụp ở khung `1440×900` cho ảnh tĩnh và `1200×800` cho khung GIF, DPR 2. Rồi:

```bash
ffmpeg -f concat -safe 0 -i frames.txt \
  -vf "scale=1000:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a" \
  -loop 0 studio.gif
ffmpeg -i <ảnh>.png -vf "scale=1600:-1:flags=lanczos" <đích>.png
```

`dither=sierra2_4a` không phải tùy tiện: giao diện nền tối nhiều chữ nhỏ, khử răng cưa của dấu
tiếng Việt bị vỡ thành mảng nếu tắt dither.

---

The four files here are **real captures** of the app's studio interface, not mockups. They are shot from a
cloned store at `/tmp/ainovel/xuong` for two reasons: the top bar prints the root directory (a
real store leaks `/Users/<name>/...` into a public image), and the real store has three test runs
that all share the novel name *Trấn Yêu Ký* — correct data that reads as a rendering bug in a
management table. Every figure shown is real: `$7.37` spent, `$1,475` per chapter, and the honest
"3 model calls returned no usage data" warning. Do not swap them for prettier numbers.
