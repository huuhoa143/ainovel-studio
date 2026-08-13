# landing/

Trang giới thiệu tĩnh của ainovel studio, đang chạy ở
**[ainovel.lingoreup.com](https://ainovel.lingoreup.com)**.

Không có bước build. `index.html` là một tệp tự chứa: CSS nội tuyến, font tự host trong `chu/`,
ảnh trong `anh/`. Mở thẳng bằng trình duyệt là xem được.

## Vì sao font nằm trong repo

Studio nạp font lúc **build** qua `next/font` rồi nhúng vào `out/`, không gọi CDN lúc chạy
(xem `web/app/layout.tsx`). Trang này giữ đúng nguyên tắc đó: `chu/` chứa woff2 tải sẵn cho
Inter, JetBrains Mono và Noto Serif, mỗi họ ba subset `latin`, `latin-ext`, `vietnamese`.

Subset `vietnamese` là bắt buộc, không phải tuỳ chọn: thiếu nó thì dấu tiếng Việt rơi về font
hệ thống và cả trang lệch chữ ở đúng những từ có dấu. Nhờ `unicode-range` trong `chu.css`,
trình duyệt chỉ tải subset nào thật cần, nên 15 tệp trong repo không đồng nghĩa 15 lượt tải.

## Vì sao ảnh là bản sao của `docs/assets/`

`anh/` là bản sao của bốn ảnh trong `docs/assets/`. Trùng lặp có chủ đích: thư mục này
deploy được nguyên khối bằng một lệnh `tar`, và một landing page trỏ ra ngoài thư mục gốc
của chính nó thì không phục vụ được từ một web root.

Đổi ảnh trong `docs/assets/` thì nhớ đồng bộ sang đây.

## Token màu

`:root` trong `index.html` là **bản sao** của `web/app/globals.css`. Trang này không import
globals.css vì đó là 5000 dòng cho một khung ứng dụng cố định, còn đây là một tài liệu cuộn.
Nhưng giá trị màu phải trùng từng con số, nếu không hai bề mặt thành hai sản phẩm.

Dấu hiệu ba lane cũng vậy: hình học sao từ `web/lib/dauHieu.ts` (bề rộng 20 → 14 → 9, giảm dần
vì Tập ⊃ Cung ⊃ Chương).

## Deploy

```bash
# trên máy dev, từ gốc repo:
tar -C landing -cf - . | ssh lingoreup 'tar -x -C /var/www/ainovel.lingoreup.com'
ssh lingoreup 'chown -R www-data:www-data /var/www/ainovel.lingoreup.com'
```

vhost: `/etc/nginx/sites-enabled/ainovel.lingoreup.com.conf` trên server. TLS dùng wildcard
`*.lingoreup.com` sẵn có, **không** cần certbot cho subdomain này.
