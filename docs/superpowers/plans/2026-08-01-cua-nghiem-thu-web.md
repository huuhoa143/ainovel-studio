# Kế hoạch 4/4 — Cửa nghiệm thu

> **Cho người thi hành:** KỸ NĂNG BẮT BUỘC — dùng `superpowers:subagent-driven-development`.

**Mục tiêu:** khi engine dừng ở biên chương chờ người duyệt, chuyện đó phải thấy được từ MỌI
bề mặt, và quyết định phải bấm được ngay tại chỗ đang đọc.

**Kiến trúc:** một component `CuaNghiemThu` dùng ở HAI chỗ (dải trên buồng lái, và bề mặt Kiểm
định) cộng một huy hiệu ở thanh trên. Không endpoint mới: `advance` đã có trong `/studio` từ
kế hoạch 1/4, và ba route hành động đã có (`POST /advance`, `POST /steer`, `PUT /advance-mode`).

**Nền:** nhánh `feat/viet-hoa-i18n` sau khi kế hoạch 2/4 và 3/4 hạ cánh.

---

## Luật cho người thi hành

Giống hai kế hoạch trước; lặp lại vì chúng đã trả giá để có:

1. **KHÔNG xóa chú thích đang có.** Sửa cho đúng nếu nó thành sai.
2. **Worktree NGOÀI repo**, `web/node_modules` phải là thư mục THẬT.
3. **Cổng là DELTA so với nền**, chạy toàn bộ, không `-x`, không lọc gói.
4. **Nhãn phải qua `web/lib/nhan.ts`.**
5. **Nghi ngờ bài kiểm y như nghi ngờ mã.** Ba lỗ hổng cùng một lớp đã tìm được ở kế hoạch
   2/4: bài kiểm dựng đầu vào từ chính hằng số nó đang đo, và bảng đột biến chỉ canh chiều
   nghịch. Câu hỏi bắt buộc cho mỗi bài kiểm: *"xóa hẳn tính năng này thì nó có đỏ không?"*
6. **`web/vitest.setup.giaodien.ts` là bản vá cho lỗi hạ tầng kiểm thật — ĐỪNG GỠ.**

---

## Quyết định đã chốt (spec §4 và §7.3, không bàn lại)

| # | Quyết định | Vì sao |
|---|---|---|
| 7 | "Trả chương về viết lại" dùng **`/steer`** sẵn có | ở cửa nghiệm thu engine đang đứng nên server chọn `Continue` — đúng nghĩa "đi tiếp, nhưng làm việc này". Một route riêng là đưa quyết định phạm vi ảnh hưởng vào `serve`, tức nhân bản logic Arbiter mà `PRODUCT.md` cấm |
| — | **KHÔNG dùng modal** | modal chỉ dành cho `ask_user`, lúc đó engine chặn THẬT. Ở cửa nghiệm thu engine đứng chờ nhưng người dùng vẫn cần đọc bản thảo, xem chi phí, đối chiếu chương trước — chặn họ lại là chặn đúng việc họ phải làm để quyết định |

---

## Cấu trúc tệp

| Tệp | Việc | Trạng thái |
|---|---|---|
| `web/lib/nghiemThu.ts` | suy trạng thái cửa từ `snapshot.advance` | mới |
| `web/components/CuaNghiemThu.tsx` | dải quyết định, dùng ở 2 chỗ | mới |
| `web/components/ThanhTren.tsx` | huy hiệu `NGHIỆM THU · ĐANG CHỜ BẠN` | sửa |
| `web/components/BuongLai.tsx` | gắn dải lên đầu buồng lái | sửa |
| `web/components/KiemDinh.tsx` | gắn dải trên bản duyệt | sửa |
| `web/components/DieuKhien.tsx` | bỏ nguồn thứ hai của `advance_mode` | sửa |
| `web/app/page.tsx` | truyền snapshot xuống thanh trên | sửa |
| `web/lib/nhan.ts` · `web/app/globals.css` | nhãn + kiểu | sửa |

---

### Task 1: Suy trạng thái cửa

**Tệp:** tạo `web/lib/nghiemThu.ts`, `web/lib/nghiemThu.test.ts`

- [ ] **Bước 1: Viết bài kiểm đỏ**

```ts
// web/lib/nghiemThu.test.ts
import { expect, test } from 'vitest';

import type { TienDo } from './types';
import { trangThaiCua } from './nghiemThu';

test('advance null (engine đóng) thì KHÔNG có cửa nào chờ', () => {
  // `null` = engine đóng nên không đo được. Vẽ một cửa nghiệm thu lúc đó là mời người dùng
  // bấm một nút chắc chắn trả 409.
  expect(trangThaiCua(null)).toEqual({ dangCho: false, cheDoDuyet: false });
});

test('chế độ auto thì không bao giờ chờ, kể cả hold bật', () => {
  const a: TienDo = { mode: 'auto', hold: true };
  expect(trangThaiCua(a).dangCho).toBe(false);
});

test('chế độ review + hold thì cửa đang chờ, kèm chương và lý do', () => {
  const a: TienDo = {
    mode: 'review', hold: true, permit_chapter: 8, hold_reason: 'nhịp tụt ở đoạn giữa',
  };
  const t = trangThaiCua(a);
  expect(t.dangCho).toBe(true);
  expect(t.cheDoDuyet).toBe(true);
  expect(t.chuong).toBe(8);
  expect(t.lyDo).toBe('nhịp tụt ở đoạn giữa');
});

test('chế độ review mà chưa tới biên thì chưa chờ', () => {
  expect(trangThaiCua({ mode: 'review', hold: false }).dangCho).toBe(false);
  expect(trangThaiCua({ mode: 'review', hold: false }).cheDoDuyet).toBe(true);
});

test('hold bật mà KHÔNG có lý do vẫn là đang chờ — lý do là tùy, cửa thì không', () => {
  // Engine có thể dừng ở biên mà Editor chưa kịp kết luận. Đòi lý do mới vẽ cửa sẽ giấu mất
  // một dây chuyền đang đứng im.
  expect(trangThaiCua({ mode: 'review', hold: true }).dangCho).toBe(true);
});
```

- [ ] **Bước 2: Chạy → FAIL**

- [ ] **Bước 3: Viết**

```ts
import type { TienDo } from './types';

/** Trạng thái của cửa nghiệm thu, đủ để cả ba chỗ dùng vẽ ra. */
export interface TrangThaiCua {
  /** Engine ĐANG đứng chờ người duyệt. Đây là thứ bật huy hiệu ở thanh trên. */
  dangCho: boolean;
  /** Chế độ nghiệm thu có bật không — khác với "đang chờ ngay lúc này". */
  cheDoDuyet: boolean;
  chuong?: number;
  lyDo?: string;
}

/**
 * Suy trạng thái cửa từ `snapshot.advance`.
 *
 * Ba điều tách bạch, và lẫn chúng là nguồn của những giao diện nói dối:
 *
 *   - `advance === null` → engine ĐÓNG, không đo được. KHÔNG phải "không chờ vì mọi thứ ổn".
 *     Vẽ cửa lúc này là mời người dùng bấm một nút chắc chắn trả 409.
 *   - `mode !== 'review'` → chế độ tự chạy; `hold` có bật cũng không có ai phải duyệt.
 *   - `mode === 'review' && hold` → ĐANG CHỜ. Đây là ca duy nhất bật huy hiệu.
 *
 * `hold_reason` là TÙY. Engine dừng ở biên trước, Editor kết luận sau; đòi có lý do mới vẽ
 * cửa sẽ giấu mất một dây chuyền đang đứng im trong khoảng giữa hai việc đó.
 */
export function trangThaiCua(advance: TienDo | null): TrangThaiCua {
  if (!advance) return { dangCho: false, cheDoDuyet: false };
  const cheDoDuyet = advance.mode === 'review';
  return {
    dangCho: cheDoDuyet && advance.hold,
    cheDoDuyet,
    chuong: advance.permit_chapter,
    lyDo: advance.hold_reason,
  };
}
```

- [ ] **Bước 4: Chạy → 5 passed**

- [ ] **Bước 5: Phép thử đột biến**

| # | Đột biến | Phải đỏ ở |
|---|---|---|
| 1 | `if (!advance) return …` → `advance = advance ?? {mode:'auto',hold:false}` rồi bỏ nhánh | "advance null … KHÔNG có cửa nào chờ" (phải kiểm cả `cheDoDuyet`) |
| 2 | `dangCho: cheDoDuyet && advance.hold` → `advance.hold` | "chế độ auto thì không bao giờ chờ" |
| 3 | `dangCho: … && advance.hold` → `cheDoDuyet` | "chế độ review mà chưa tới biên" |

- [ ] **Bước 6: Commit**

---

### Task 2: `CuaNghiemThu.tsx` — dải quyết định

**Tệp:** tạo `web/components/CuaNghiemThu.tsx`, `web/components/CuaNghiemThu.test.tsx`

Dải amber, nội dung: đang chờ ở chương nào · kết luận của Editor (`hold_reason`, nguyên văn) ·
hai nút `Cho đi tiếp` và `Trả chương N về viết lại`.

- [ ] **Bài kiểm phải có, tối thiểu:**

1. `dangCho === false` → component **không vẽ gì** (trả `null`). Khẳng định điều này ra: một
   dải amber rỗng nằm trên đầu buồng lái suốt phiên là một cảnh báo giả thường trực.
2. `dangCho === true` → thấy số chương, thấy nguyên văn `hold_reason`, thấy hai nút.
3. `hold_reason` vắng → vẫn thấy hai nút và một câu nói rõ Editor chưa kết luận. **Không bịa
   một lý do.**
4. Nhãn nút "trả về viết lại" mang đúng số chương (`Trả chương 8 về viết lại`), không phải một
   câu chung chung — người bấm phải thấy mình đang trả cuốn nào về đâu.
5. `choGhi === false` (studio chạy ngoài loopback) → hai nút **vô hiệu**, kèm câu giải thích.
   Vẽ nút bấm được rồi gửi vào hư không là lỗi tệ nhất ở đây — cùng lý lẽ đã ghi trong
   `OCanThiep.tsx`, đọc nó trước.

- [ ] Chú thích bắt buộc: vì sao KHÔNG dùng modal (chép lý do từ bảng quyết định đầu kế hoạch).

---

### Task 3: Hai hành động, và khóa lúc đang gửi

**Tệp:** sửa `CuaNghiemThu.tsx` + test

- [ ] `Cho đi tiếp` → `choDiTiep(book)` (`POST /advance`, đã có ở `web/lib/api.ts`).
- [ ] `Trả chương N về viết lại` → mở một ô nhập, gửi `canThiep(book, text)` (`POST /steer`).
      Engine đang đứng nên server chọn `Continue` — quyết định 7. **Gửi nguyên văn mô tả lỗi
      của Editor làm giá trị mặc định của ô**, để người vận hành sửa chứ không phải gõ lại.
- [ ] **Khóa lúc đang gửi.** Bài kiểm bắt buộc: bấm hai lần liên tiếp chỉ gọi API **một lần**.
      Bấm đôi ở đây là hai lượt chạy, tức tiền đôi — cùng lớp rủi ro đã khiến màn Xưởng bị
      cấm có nút chạy (quyết định 4 của spec).
- [ ] Lỗi từ server hiện **nguyên văn**, không làm dịu. Giọng thiết bị công nghiệp; và câu của
      server biết rõ hơn giao diện chuyện gì đã xảy ra.
- [ ] Sau khi gửi xong: gọi `onDoi()` để snapshot được nạp lại, đừng tự đoán trạng thái mới.

- [ ] **Phép thử đột biến bắt buộc:**

| # | Đột biến | Phải đỏ ở |
|---|---|---|
| 1 | bỏ cờ `dangGui` (khóa lúc đang gửi) | "bấm hai lần chỉ gọi một lần" |
| 2 | `choDiTiep` ↔ `canThiep` đổi chỗ | hai bài về hành động |
| 3 | nuốt lỗi (`catch {}` rỗng) | bài về hiện lỗi nguyên văn |

---

### Task 4: Huy hiệu ở thanh trên — thấy từ MỌI bề mặt

**Tệp:** `web/components/ThanhTren.tsx`, `web/app/page.tsx`

- [ ] `ThanhTren` nhận thêm prop `cuaNghiemThu: TrangThaiCua | undefined`.
- [ ] `dangCho` → vẽ huy hiệu `NGHIỆM THU · ĐANG CHỜ BẠN`, bấm được, dẫn tới `?khu=kiem-dinh`.
- [ ] Huy hiệu phải hiện ở **mọi khu**, không chỉ buồng lái. Đây là lý do nó ở thanh trên chứ
      không trong một bề mặt: một dây chuyền đang đứng chờ không được ẩn sau một lựa chọn
      điều hướng — cùng lý lẽ đã ghi cho `HoiChan` ở `page.tsx`.
- [ ] Bài kiểm: (a) `dangCho` → huy hiệu có mặt; (b) không chờ → **không** có; (c) bấm huy
      hiệu gọi `onChonKhu('kiem-dinh')`.
- [ ] Màu: amber, dùng token đang có. Một màu tín hiệu duy nhất — luật 5 của `PRODUCT.md`.
      Ký hiệu hình học đứng trước chữ để ảnh đen trắng và người mù màu vẫn phân biệt được;
      xem `TrangThai.tsx` cho khuôn.

---

### Task 5: Gắn dải vào hai bề mặt

- [ ] `BuongLai.tsx`: `<CuaNghiemThu …/>` đặt **trên** dải trạng thái / dải việc tiếp theo.
      Nó là tin cấp cao hơn: "dây chuyền đang chờ BẠN" đứng trước "dây chuyền đang làm gì".
- [ ] `KiemDinh.tsx`: cùng component, đặt trên bản duyệt 7 chiều — đó là chỗ người dùng đọc
      bằng chứng để quyết định, nên nút quyết định phải ở cùng chỗ với bằng chứng.
- [ ] Bài kiểm: cùng một `snapshot` cho cả hai bề mặt thì cả hai đều vẽ dải.
- [ ] Giữ nguyên mọi chú thích hiện có trong `KiemDinh.tsx` — chúng ghi lý do bề mặt này tồn
      tại song song với tab inspector, và vì sao nó không tự gọi thêm mạng.

---

### Task 6: Bỏ nguồn thứ hai của `advance_mode`

`DieuKhien.tsx` hiện tự `fetch` `/settings` để biết `advance_mode` (xem chú thích ở đó:
*"`Snapshot.transport` không mang `advance_mode`; nó nằm ở `/settings`"*). Câu đó đã **hết
hiệu lực**: kế hoạch 1/4 đưa `advance` vào `/studio`.

- [ ] Đọc `advance.mode` từ `snapshot` thay vì gọi `/settings`.
- [ ] **SỬA chú thích đó cho đúng, đừng xóa** — nó ghi một lý do thật, chỉ là tiền đề đã đổi.
- [ ] Vì sao đáng làm: hai endpoint mô tả cùng một engine ở hai thời điểm lệch nhau là lớp lỗi
      "hai sự thật" — đúng thứ quyết định 6 của spec đã tránh khi từ chối tách endpoint riêng
      cho các trường sống. Ở đây nó nặng hơn: nút `Cho đi tiếp` ở dải đọc `snapshot.advance`
      còn nhãn chế độ ở transport đọc `/settings`, nên hai chỗ trên **cùng một màn hình** có
      thể nói khác nhau về cùng một chế độ.
- [ ] Bài kiểm: `snapshot.advance.mode === 'review'` → transport hiện nhãn chế độ nghiệm thu,
      **không cần** bất kỳ lời gọi mạng nào (không mock `fetch`; nếu component vẫn gọi thì bài
      kiểm phải thấy được điều đó).
- [ ] Ca `advance === null` (engine đóng): giữ hành vi hiện tại của `DieuKhien` cho ca không
      biết chế độ — đừng vẽ "tự chạy" như một sự thật.

---

### Task 7: CSS

- [ ] `.cuanghiemthu` — dải amber, ký hiệu + chữ, hai nút căn phải.
- [ ] `.hieunghiemthu` — huy hiệu ở thanh trên.
- [ ] Dùng token đang có; `--ink-3` là sàn cứng.
- [ ] `@media (max-width: 860px)`: hai nút xuống hàng, không tràn ngang.
- [ ] Kiểm: tương phản AA cho mọi chữ trên nền amber; 0 tràn ngang ở 1440 và 390.

---

### Task 8: Cổng cuối + E2E trên cuốn THẬT

- [ ] `go build` · `go vet` · `gofmt -l` rỗng · `go test -count=1 ./...` → **30 gói / 0 FAIL**
- [ ] `cd web && npm test && npx tsc --noEmit && npm run build`
- [ ] E2E trên cuốn thật (không `seed-demo`):

| # | Việc | Bằng chứng |
|---|---|---|
| 1 | bật chế độ nghiệm thu, chạy tới biên chương | engine dừng; `curl /studio \| jq .advance` cho `hold: true` |
| 2 | huy hiệu ở thanh trên | hiện ở buồng lái **và** ở `?khu=chi-phi` (bề mặt bất kỳ) |
| 3 | bấm `Cho đi tiếp` | engine chạy tiếp; `hold` về `false`; chương sau bắt đầu |
| 4 | bấm hai lần thật nhanh | chỉ MỘT lượt chạy — kiểm bằng `/events`, không phải bằng mắt |
| 5 | `Trả chương N về viết lại` | chương vào `pending_rewrites`; văn chương sau lệch theo ý đã gửi |
| 6 | tắt engine rồi mở lại trang | không dải, không huy hiệu (`advance === null`) |
| 7 | chụp 1440 + 390 | 0 tràn ngang, tương phản AA đạt |

- [ ] Kiểm `git merge-base` trước khi gộp `--ff-only`; chạy LẠI toàn bộ cổng **trên cây đã
      gộp**. Cổng xanh trong worktree không chứng minh gì về cây đã gộp — đã đo: 0 FAIL trong
      worktree, 8 FAIL sau khi gộp.

---

## Sau khi cả bốn kế hoạch hạ cánh

- [ ] Sửa ba chỗ tài liệu đang nói sai (spec §"Đợt 6" của bản nháp cũ): `PRODUCT.md` phần
      *Product Purpose* nói "studio đọc từ store"; `README.md:272` nói studio chỉ đọc;
      `main.go:36` chú thích `serve` là dịch vụ chỉ đọc. Cả ba sai từ khi engine chạy
      in-process.
- [ ] Cập nhật `DESIGN.md` cho các mẫu mới (dải trạng thái, khu văn sống, vạch ngăn, dải
      quyết định).

---

## Nhật ký thi hành

Người thi hành ghi vào đây: phép thử đột biến, lỗ hổng bộ kiểm, và mọi chỗ kế hoạch này SAI.

---

### Cụm nghiệm thu (Task 1–4) — thi hành xong

**Commit** (nền = `cc77990`, nhánh `thuc-thi/nghiem-thu`):

| sha | tiêu đề |
|---|---|
| `9561894` | feat(web): suy trạng thái cửa nghiệm thu từ snapshot.advance |
| `42d96fd` | feat(web): dải quyết định của cửa nghiệm thu — một component cho hai bề mặt |
| `c41f1a6` | feat(web): hai hành động của cửa nghiệm thu, và khóa lúc đang gửi |
| `bda3238` | feat(web): huy hiệu nghiệm thu ở thanh trên — thấy được từ MỌI khu |

#### Bộ chạy đột biến: hai cái chốt của cụm Xưởng CỨU được một bảng nói dối

Cụm Xưởng-logic ghi lại hai lần bộ đo của họ không đo gì. Tôi cắm nguyên hai chốt đó vào bộ
chạy của mình, và **chốt thứ hai đã bắn ngay lần chạy đầu của bảng Task 3**: tôi để hai đường
dẫn tệp kiểm trong một biến rồi truyền không ngoặc, zsh không tách từ, vitest nhận một chuỗi
chứa dấu cách và không khớp tệp nào. Không có chốt thì mười dòng bảng đó đã là mười ô trống
trông như "không có bài nào đỏ" — tức một bảng nói bộ kiểm thủng hoàn toàn.

Hai chốt, nguyên văn, để cụm sau khỏi dựng lại lần thứ tư:

```bash
# 1. đột biến có ăn không
if diff -q "$GOC" "$NGUON" >/dev/null; then echo "ĐỘT BIẾN KHÔNG ĂN"; …; fi
# 2. phép đo có chạy không
TONG="$(echo "$RA" | grep -E '^ +Tests +' | tail -1)"
[ -z "$TONG" ] && echo "PHÉP ĐO HỎNG (không có dòng tổng kết)"
```

Bộ chạy KHÔNG đưa vào repo, cùng lý do cụm Xưởng không đưa bộ đo tương phản vào: nó không nằm
trong cổng nào, nên trong repo nó là mã chết trông như một công cụ. Nhưng ba cụm liên tiếp đã
cần nó và hai cụm dựng bản hỏng — **nếu có cụm thứ năm, hãy cân nhắc commit nó thật.**

#### Task 1 — `lib/nghiemThu.ts`

| # | Đột biến | Kết quả | Bài kiểm bắt được |
|---|---|---|---|
| KH-1 | chốt null → `advance ?? {mode:'auto',hold:false}` | **XANH — nhưng KHÔNG phải lỗ hổng** | không bài nào |
| KH-2 | `dangCho: cheDoDuyet && advance.hold` → `advance.hold` | ĐỎ | "chế độ auto thì không bao giờ chờ" |
| KH-3 | `dangCho: …` → `cheDoDuyet` | ĐỎ | "chế độ review mà chưa tới biên" |
| R-4 | bỏ HẲN chốt null (`advance!.mode`) | ĐỎ | "advance null … KHÔNG có cửa nào chờ" |
| R-5 | chốt null → `?? {mode:'review',hold:true}` | ĐỎ | cùng bài |
| R-6 | bỏ `chuong: advance.permit_chapter` | ĐỎ | "review + hold … kèm chương và lý do" |
| R-7 | bỏ `lyDo: advance.hold_reason` | ĐỎ | cùng bài |
| R-8 | `cheDoDuyet` luôn `true` | ĐỎ | "chế độ auto thì không bao giờ chờ" |

**KH-1 xanh, và bảng của kế hoạch SAI ở chỗ nó nói dòng này phải đỏ.** Kế hoạch còn chú thêm
"(phải kiểm cả `cheDoDuyet`)" — nhưng mặc định `auto` cũng cho `cheDoDuyet: false`, nên hai
đầu vào ra CÙNG một kết quả và không khẳng định nào tách được chúng. (`toEqual` của vitest còn
bỏ qua thuộc tính `undefined`, nên `chuong`/`lyDo` cũng không tách được.)

Và đây KHÔNG phải lỗ hổng bộ kiểm, mà là một sự thật về hàm: với câu hỏi "có cửa nào đang chờ
không", **engine đóng và chế độ tự chạy có cùng một câu trả lời đúng**. Tôi đã cân nhắc thêm
một trường `doDuoc` để tách chúng và bỏ ý đó: trong Task 1–4 không ai đọc nó, nên nó sẽ là một
trường chỉ bài kiểm quan sát được — đúng thứ mã chết mà cụm C và cụm Xưởng đã tranh luận.

Thay vào đó chốt `!advance` được chứng minh bằng hai đột biến khác (R-4 ném TypeError, R-5 vẽ
cửa cho một engine đã đóng), và **chú thích của hàm nói thẳng: ai cần tách "engine đóng" khỏi
"tự chạy" — tức người làm Task 6 cho nhãn chế độ ở transport — phải đọc `snapshot.advance ===
null`, đừng hỏi hàm này.** Task 6 có một gạch đầu dòng đúng về ca đó; đây là chỗ nó phải nhìn.

#### Task 2 — `components/CuaNghiemThu.tsx` (kế hoạch không có bảng; bảng này của tôi)

| # | Đột biến | Kết quả | Bài kiểm bắt được |
|---|---|---|---|
| T2-1 | bỏ chốt không-chờ (luôn vẽ dải) | ĐỎ | "cửa KHÔNG chờ thì không vẽ gì" |
| T2-2 | đảo chốt | ĐỎ | cả 7 bài |
| T2-3 | nhãn nút bỏ số chương | ĐỎ | "nhãn nút mang ĐÚNG số chương" |
| T2-4 | bỏ nhánh chưa-có-kết-luận | ĐỎ | "không có kết luận … không bịa" |
| T2-5 | luôn dùng câu chưa-có-kết-luận | ĐỎ | "thấy NGUYÊN VĂN kết luận Editor" |
| T2-6 | nút không bao giờ khóa | ĐỎ | 2 bài |
| T2-7 | gộp `choGhi === undefined` vào `false` | ĐỎ | "choGhi chưa biết" |
| T2-8 | bỏ chốt `!!tacPham` | **XANH — LỖ HỔNG** | không bài nào |
| T2-9 | bỏ ký hiệu hình học | **XANH — LỖ HỔNG** | không bài nào |
| T2-10 | bỏ tên vùng (`aria-label`) | **XANH — LỖ HỔNG** | không bài nào |

**Lỗ hổng T2-8 là lỗ hổng đắt nhất của cụm, và nó trỏ thẳng vào Task 5.** Bỏ `!!tacPham` khỏi
điều kiện bật nút vẫn xanh 7/7, trong khi hệ quả là hai nút bấm được gọi
`POST /api/books/undefined/advance`. Không phải giả thuyết: **`KiemDinh` hôm nay KHÔNG nhận
`tacPham`** (`app/page.tsx` chỉ truyền `snapshot`, `chuongChon`, `onChonChuong`), nên người
gắn dải ở Task 5 rất dễ để trống prop đó. Bịt bằng bài `tacPham: undefined` → nút khóa, và
KHÔNG có câu "chế độ chỉ đọc" (studio ghi được, chỉ là chưa có cuốn nào để ghi vào — hai ca
cần hai lời giải thích khác nhau).

T2-9 và T2-10 là cùng một lớp: hai kênh phụ mà không ai canh. Ký hiệu là kênh duy nhất còn
lại khi mất màu — và sau Task 7 dải này là một khối amber, tức màu sẽ là thứ đập vào mắt
trước. Tên vùng thì nặng hơn bình thường ở đây vì đây là component DUY NHẤT vẽ ở hai bề mặt.
Bịt bằng một bài chung. Cả ba: chạy lại sau khi bịt → ĐỎ. `CuaNghiemThu.test.tsx` có **9** bài.

#### Task 3 — hành động (bảng của kế hoạch + của tôi). Không lỗ hổng.

| # | Đột biến | Kết quả | Bài kiểm bắt được |
|---|---|---|---|
| KH-1 | bỏ cờ `dangGui` | ĐỎ (2) | "bấm hai lần chỉ gọi MỘT lần" × 2 |
| KH-2a | `Cho đi tiếp` gọi nhầm `/steer` | ĐỎ (3) | "gọi POST /advance trên ĐÚNG cuốn" |
| KH-2b | nút gửi gọi nhầm `/advance` | ĐỎ (3) | "gọi POST /steer với chữ ĐÃ SỬA" |
| KH-3 | nuốt lỗi (`catch {}` rỗng) | ĐỎ (2) | hai bài về lỗi nguyên văn |
| R-4 | ô nhập không mang kết luận Editor | ĐỎ (2) | "mang sẵn NGUYÊN VĂN kết luận" |
| R-5 | bỏ `onDoi()` | ĐỎ (2) | hai bài nạp lại |
| R-6 | nhãn nút gửi bỏ `dangChay` | ĐỎ | "nhãn nói TRƯỚC câu này sẽ thành gì" |
| R-7 | nhánh LỖI cũng xóa chữ đã gõ | ĐỎ | "ô nhập GIỮ chữ đã gõ" |
| R-8 | bỏ câu nói ra hệ quả của `/steer` | ĐỎ | "ô nhập nói ra hệ quả" |
| R-9 | `khoa` bỏ `!batDuoc` | ĐỎ (3) | ba bài về nút vô hiệu |
| R-10 | gửi lý do GỐC thay vì chữ đã sửa | ĐỎ | "với chữ ĐÃ SỬA" |

**Bài "bấm hai lần" của tôi lúc đầu xanh vì một lý do sai, và chính nó lộ ra.** Bản đầu tra
nút theo NHÃN ở cả hai cú bấm — nhưng nhãn đổi thành "Đang gửi…" ngay sau cú đầu, nên cú thứ
hai đỏ vì "không tìm thấy nút", không phải vì cái khóa. Cùng lớp với "bài kiểm chờ một điều
kiện mà đầu vào đã thỏa sẵn" của cụm Xưởng. Bịt bằng cách giữ CÙNG một nút qua hai cú bấm
(đúng cách người dùng bấm đôi) và khẳng định thêm `disabled === true` sau cú đầu — nếu không
thì cái nhãn, chứ không phải cái khóa, mới là thứ đang giữ.

#### Task 4 — huy hiệu (kế hoạch không có bảng; bảng này của tôi)

| # | Đột biến | Kết quả | Bài kiểm bắt được |
|---|---|---|---|
| T4-1 | luôn vẽ huy hiệu | ĐỎ (2) | "KHÔNG chờ thì không có huy hiệu" · bài `Trang` |
| T4-2 | bỏ hẳn huy hiệu | ĐỎ (4) | 4 bài |
| T4-3 | dùng `cheDoDuyet` thay `dangCho` | ĐỎ | "cả ba ca không-chờ" |
| T4-4 | huy hiệu dẫn nhầm khu | ĐỎ | "bấm huy hiệu đi tới khu Kiểm định" |
| T4-5 | bỏ ký hiệu hình học | ĐỎ | bài huy hiệu |
| T4-6 | huy hiệu chui vào khối bộ chọn tác phẩm | ĐỎ | "KHÔNG phụ thuộc `dangXem`" |
| T4-7 | bỏ `title` của huy hiệu | **XANH — LỖ HỔNG** | không bài nào |
| T4-8 | `page.tsx` không nối cửa lên thanh trên | ĐỎ | bài `Trang` |
| T4-9 | `page.tsx` nối một cửa rỗng | ĐỎ | bài `Trang` |
| T4-10 | `onChonKhu` của thanh trên thành no-op | **XANH — LỖ HỔNG** | không bài nào |

**Lỗ hổng T4-10 là mắt cuối của sợi dây, lần thứ TƯ trong dự án này** — sau
`vanSong={s.vanSong}` (cụm D), `sach={s.workshop?.books}` và `onMoTacPham={s.moTacPhamTai}`
(cụm Xưởng). Bộ kiểm của `ThanhTren` truyền spy của chính nó vào `onChonKhu`, nên nó chỉ
chứng minh component GỌI đúng tham số. Thay `onChonKhu={s.chonKhu}` ở `page.tsx` bằng một hàm
rỗng thì **14/14 vẫn xanh**, trong khi hệ quả là một huy hiệu amber bấm vào không đi đâu cả và
không lỗi nào nổ ra. Bịt bằng bài dựng cả `Trang` (`chonKhu` là `vi.fn()`) rồi bấm nút thật.

T4-7 (chú giải) bịt bằng một khẳng định trong bài huy hiệu. Nó là kênh thứ BA chứ không thay
được nhãn — chú thích của `moMay` đã ghi lý do: trên cảm ứng chú giải không tồn tại.

Cả hai: chạy lại sau khi bịt → ĐỎ.

**Nói thẳng một chuyện:** bài "KHÔNG chờ thì không có huy hiệu" XANH ngay lần chạy đầu (lúc đó
chưa có huy hiệu nào để mà hiện). Xanh sẵn không có nghĩa là thừa — T4-1 và T4-3 cho thấy nó
là bài duy nhất bắt được hai đột biến đó — nhưng nó KHÔNG được viết theo lối đỏ-trước, và bảng
này là thứ duy nhất chứng minh nó có giá.

#### Chỗ kế hoạch SAI hoặc thiếu

1. **Bảng đột biến Task 1 sai ở dòng 1** — xem mục Task 1 ở trên.
2. **Quyết định 7 nói "ở cửa nghiệm thu engine đang ĐỨNG nên server chọn `Continue`" — điều
   đó không chắc, và tôi đã lệch.** `AdvanceHold` là một ý định tạm dừng được đặt TRƯỚC và chỉ
   được tiêu ở biên chương kế tiếp (`internal/host/imp/runner.go:729` đặt nó ngay sau khi nhập
   truyện xong; `internal/host/engine.go:671` đặt nó từ một op). Nên cửa có thể đang treo
   trong lúc engine vẫn viết dở, và lúc đó `/steer` là `Steer` chứ không phải `Continue`.
   Hệ quả nằm ở NHÃN nút gửi, và nó là hệ quả về tiền: `OCanThiep` đã ghi rõ hai việc khác
   nhau — tiêm vào lượt đang chạy có thể làm chương đang viết bị xếp lại vào hàng chờ, còn
   đánh thức là bắt đầu một lượt MỚI và tiêu tiền. Đã thi hành: `CuaNghiemThu` nhận thêm
   `dangChay: boolean` và dùng lại đúng hai khóa nhãn của `OCanThiep`
   (`tiemVaoLuotDangChay` / `danhThucLuotMoi`). **Việc chọn route thì KHÔNG lệch** — vẫn là
   `/steer`, đúng quyết định 7.
   **Người làm Task 5 phải truyền `dangChay` ở CẢ HAI bề mặt.** `BuongLai` đã có sẵn;
   `KiemDinh` thì `mayDangChay(snapshot)` (`lib/song.ts`) cho đúng giá trị đó từ `snapshot`.
3. **Task 5 sẽ vấp `tacPham` nếu làm theo bảng tệp một cách máy móc.** `KiemDinh` hiện KHÔNG
   nhận `tacPham` (`app/page.tsx`), mà `CuaNghiemThu` cần nó cho cả hai lời gọi API. Có bài
   kiểm giữ ca đó (lỗ hổng T2-8), nên để trống sẽ ra hai nút vô hiệu chứ không ra một lời gọi
   `/books/undefined/…` — nhưng nó vẫn là một dải chết trên đúng bề mặt mà spec §7.3 gọi là
   chỗ người dùng quyết định.
4. **`permit_chapter` VẮNG là ca thường, không phải ca biên.** `TienDo.PermitChapter` khai
   `omitempty` (`internal/serve/model.go:243`) nên số 0 — "chưa cấp phép chương nào", đúng ca
   mà chế độ nghiệm thu tồn tại để tạo ra — rụng khỏi JSON. Kế hoạch vẽ mọi nhãn quanh một số
   chương có thật (`Trả chương 8 về viết lại`); một nhãn dựng bằng chuỗi thẳng sẽ in "Trả
   chương undefined về viết lại". Hai nhãn vì vậy nhận `n?: number`, và có bài kiểm riêng.
   Ghi chú về ngữ nghĩa: `permit_chapter` là chương ĐÃ ĐƯỢC CHO ĐI TIẾP — TUI in đúng trường
   này thành "已放行第 N 章" (`internal/entry/tui/panels_sidebar.go:34`). Ở một cửa đang treo
   thì đó cũng là chương vừa viết xong và đang chờ duyệt, nên cách kế hoạch dùng nó là đúng;
   tôi ghi lại vì suy ra được điều đó tốn một vòng đọc mã Go.
5. **Kế hoạch không nói `CuaNghiemThu` nhận gì.** Bảng tệp chỉ nói "dải quyết định, dùng ở 2
   chỗ". Đã chọn `advance: TienDo | null` (thô, từ `snapshot.advance`) chứ không phải một
   `TrangThaiCua` đã tính sẵn: luật "cửa nào là cửa đang chờ" khi đó chỉ có MỘT chỗ giữ, và
   người nối dây ở Task 5 không có cơ hội tính sai nó. Ngược lại `ThanhTren` nhận
   `TrangThaiCua | undefined` đúng như kế hoạch nói — thanh trên không đọc gì khác của
   snapshot, và cho nó cả cục là mời người sau biến một thanh mức MÁY thành nửa-theo-tác-phẩm.
6. **Task 4 nói `ThanhTren` "nhận thêm prop `cuaNghiemThu`" nhưng không nói nó cũng cần
   `onChonKhu`** — huy hiệu phải dẫn đi đâu đó. Đã thêm; `page.tsx` truyền `s.chonKhu`.
7. **Bảng tệp không kê `web/components/ThanhTren.test.tsx`** — repo chưa từng có bộ kiểm cho
   `ThanhTren`. Không có tệp đó thì T4-2 tới T4-6 không có chỗ nào bắt được.

#### Quyết định tự đưa ra vì kế hoạch không nói

- **`choGhi === undefined` khóa nút nhưng KHÔNG hiện câu "chế độ chỉ đọc".** `undefined` là
  "đang hỏi `/api/config`", không phải "đã hỏi, câu trả lời là không" — cùng lớp `null` khác
  `false` mà cả hợp đồng `/studio` giữ, và câu sai đó sẽ hiện ra ở MỌI lần mở trang.
- **MỘT cờ `dangGui` cho CẢ HAI nút**, không phải mỗi nút một cờ: hai lệnh này loại trừ nhau
  về ý định, và "cho đi tiếp trong lúc câu trả-về đang bay" là một trạng thái không ai đọc
  được.
- **Nhánh LỖI giữ nguyên chữ đã gõ và giữ ô nhập mở.** Nuốt câu vừa gõ cùng lúc với báo lỗi là
  hai thiệt hại chồng nhau; `datChu('')` chỉ nằm ở nhánh thành công.
- **Câu giải thích `/steer` hiện RA MÀN HÌNH khi ô nhập mở**, không nằm trong chú thích mã:
  "trả chương về viết lại" nghe như một lệnh xóa chương, nhưng phạm vi ảnh hưởng do Arbiter
  quyết định và có thể nhiều hơn một chương — người bấm phải biết trước khi gửi. Cùng lối
  `xuongKhongCoNutChay` của màn Xưởng.
- **Ký hiệu lấy từ `kyTheoTone('amber')`, không viết cứng `■`.** Dải này đứng cạnh bản duyệt
  của Editor ở bề mặt Kiểm định, nên hai chỗ phải đi theo cùng một bảng ký hiệu.
- **Huy hiệu đứng sau nhóm "cuốn nào / cuốn mới", KHÔNG ở nhóm bên phải** — chép nguyên luật
  đã ghi trong `ThanhTren.tsx` cho nút tạo tác phẩm: bên phải là tin để NGÓ (dòng sự kiện),
  còn đây là một việc phải làm, và nó nói về đúng cuốn mà bộ chọn bên trái đang hiện. Nó nằm
  NGOÀI khối `dangXem` (có bài kiểm): khối đó biến mất khi chưa chọn tác phẩm, và một dây
  chuyền đang đứng chờ không được biến mất cùng một bộ chọn.
- **`page.tsx` truyền `undefined` khi chưa có snapshot, không phải `trangThaiCua(null)`.** Hai
  ca cho cùng một hình (không huy hiệu) nhưng khác nguồn — "chưa tải xong" và "engine đóng".
- **Bài kiểm hành động nằm ở tệp RIÊNG (`CuaNghiemThu.hanhdong.test.tsx`).** `vi.mock` là
  hoisted và có phạm vi cả tệp, nên gộp lại sẽ bắt bài kiểm hình chạy trên một tầng API giả —
  hai chuyện khác nhau, và một ngày ai sửa mock sẽ làm đỏ những bài không liên quan tới mạng.
- **KHÔNG đụng `app/globals.css`** — Task 7 sở hữu nó, và tránh va chạm với phiên chạy song
  song. Đã đo bằng `grep` từng lớp, và **phép đo đầu tiên của tôi ở đây SAI theo đúng cái bẫy
  mà cụm Xưởng đã ghi** (`.ten .nb .ma .sl .tu` "đã có CSS" — thật ra chỉ tồn tại dưới dạng bị
  giới hạn trong component khác). Đếm số lần xuất hiện là chưa đủ; phải nhìn CHÍNH selector:

  | lớp | trạng thái |
  |---|---|
  | `.cuanghiemthu .cnthead .cntlydo .cntnut .cntO .hieunghiemthu` | chưa có một dòng nào |
  | `.steerbox .steerhint .loiDoc .nutChinh .nutPhu` | có luật TRẦN, dùng lại được ngay |
  | `.ky` · `.lbl` | **CHỈ có luật bị giới hạn** (`.st .ky`, `.trans .ky`, `.mucxem .lbl`…) — KHÔNG có luật trần nào |

  Nghĩa là **Task 7 phải viết TÁM khối, không phải sáu**: sáu lớp mới, cộng `.cuanghiemthu .ky`
  / `.hieunghiemthu .ky` và `.cntlydo .lbl`. Không có chúng thì ký hiệu `■` và nhãn "Kết luận
  của Editor" render trần — đúng thứ đã thấy ở `xuong-1440-truoc-css.png`.

  Sau cụm này dải đã đọc được nhưng CHƯA amber và chưa có bố cục hai nút căn phải.
- **KHÔNG đụng Task 5 và Task 6** dù cả hai chạm vào tệp tôi vừa sửa. Ghi các bẫy ở mục "kế
  hoạch sai" 2 và 3 thay vì tự làm.

#### Cổng sau Task 4 (chạy toàn bộ trong worktree, không lọc gói, không `-x`)

`go build ./...` exit 0 · `go vet ./...` exit 0 · `gofmt -l .` **rỗng** ·
`go test -count=1 ./...` **30 gói ok / 0 FAIL** (đúng nền) ·
`npm test` **171/171** (nền 139/139, không bài nào đỏ) · `npx tsc --noEmit` exit 0 ·
`npm run build` exit 0.

`git merge-base --is-ancestor cc77990 HEAD` → đúng; cây làm việc sạch.

**`tsc` lại bắt được thứ `npm test` không bắt**, lần thứ ba trong dự án: thêm prop bắt buộc
`dangChay` ở Task 3 làm bốn lời gọi trong `CuaNghiemThu.test.tsx` thiếu tham số — `npm test`
xanh 20/20 vì JSX thiếu prop chỉ là `undefined` lúc chạy. Chạy CẢ HAI trước khi commit.

---

### Cụm nghiệm thu-gắn (Task 5–7) — thi hành xong

**Commit** (nền = `91bc4b6`, nhánh `thuc-thi/nghiem-thu`):

| sha | tiêu đề |
|---|---|
| `159e4c7` | feat(web): gắn dải quyết định vào buồng lái và Kiểm định — một cửa, hai bề mặt |
| `fdd619b` | feat(web): nhãn chế độ đọc snapshot.advance — bỏ nguồn thứ hai từ /settings |
| `c8c11e9` | feat(web): hình cho dải nghiệm thu và huy hiệu — amber 9%, hai nút căn phải |

#### Task 5 — gắn dải vào hai bề mặt

Bảng của tôi; kế hoạch không có bảng. **14/14 ĐỎ, không lỗ hổng.**

| # | Đột biến | Kết quả | Bài kiểm bắt được |
|---|---|---|---|
| T5-1 | bỏ HẲN dải khỏi `BuongLai` | ĐỎ (8) | 4 bài buồng lái · 2 bài `Khu` · 2 bài `Trang` |
| T5-2 | bỏ HẲN dải khỏi `KiemDinh` | ĐỎ (7) | 4 bài Kiểm định · 2 bài `Khu` · 1 bài `Trang` |
| T5-3 | dải xuống DƯỚI dải trạng thái | ĐỎ (2) | hai bài thứ tự |
| T5-4 | dải xuống DƯỚI bản duyệt | ĐỎ | "TRÊN bản duyệt" |
| T5-5 | `BuongLai` nhét cứng `choGhi={true}` | ĐỎ (3) | 1 buồng lái · 1 `Khu` · 1 `Trang` |
| T5-6 | `KiemDinh` nhét cứng `choGhi={true}` | ĐỎ (2) | 1 Kiểm định · 1 `Khu` |
| T5-7 | `BuongLai` nhét cứng `dangChay={false}` | ĐỎ | "được cho biết máy đang chạy hay nghỉ" |
| T5-7b | nhét cứng `dangChay={true}` (chiều kia) | ĐỎ | cùng bài |
| T5-8 | `KiemDinh` nhét cứng `dangChay={false}` | ĐỎ | bài tương ứng ở Kiểm định |
| T5-9 | `KiemDinh` không truyền `tacPham` | ĐỎ (3) | "nhận `tacPham`, nên hai nút BẤM ĐƯỢC" |
| T5-10 | `page.tsx` nhét cứng `choGhi={true}` | ĐỎ | **chỉ** bài `Trang` |
| T5-11 | `page.tsx` nối `onDoi` vào hàm rỗng | ĐỎ (2) | hai bài `Trang` |
| T5-12 | `KiemDinh` nuốt `onDoi` | ĐỎ | **chỉ** bài "sợi dây `taiLai` … ở Kiểm định" |
| T5-13 | `BuongLai` nuốt `onDoi` | ĐỎ | **chỉ** bài `Trang` buồng lái |

**T5-12 và T5-13 mỗi cái chỉ MỘT bài bắt được, và đó là hai bài tôi thêm riêng cho chúng.**
Sợi dây `onDoi` có HAI chỗ nối (một trong `BuongLai`, một trong `KiemDinh`) nên một bài đi qua
một bề mặt không chứng minh gì về bề mặt kia. Hệ quả nếu đứt: lệnh tới engine và thành công,
nhưng snapshot không về, nên dải amber ở lại cho một cái cửa ĐÃ MỞ — và cú bấm thứ hai cấp phép
thêm một chương, tức tiền đôi. Không lỗi nào nổ ra.

Đây là **lần thứ NĂM** của lớp lỗi "mắt cuối của sợi dây" trong dự án — sau `vanSong` (cụm D),
`sach` + `onMoTacPham` (cụm Xưởng) và `onChonKhu` của thanh trên (cụm nghiệm thu). Phép đo phải
dựng cả `Trang`; mọi tầng thấp hơn đều truyền giá trị CỦA CHÍNH NÓ vào.

**Hai bộ kiểm mới:** `components/KiemDinh.test.tsx` và `app/page.nghiemthu.test.tsx` (repo chưa
từng có bộ kiểm cho `KiemDinh`). Tệp thứ hai tách riêng vì nó thay `@/lib/api` cho cả tệp —
cùng lý do cụm trước tách `CuaNghiemThu.hanhdong.test.tsx`.

#### Task 6 — bỏ nguồn thứ hai của `advance_mode`

Bảng của tôi, gồm hai dòng kế hoạch/người giao việc BẮT BUỘC. **9/9 ĐỎ, không lỗ hổng.**

| # | Đột biến | Kết quả | Bài kiểm bắt được |
|---|---|---|---|
| T6-1 | **đọc lại `/settings`** (dựng lại NGUYÊN VẸN state + effect + phép suy) | ĐỎ (5) | 4 bài `DieuKhien` · 1 bài `Trang` |
| T6-2 | **coi `advance === null` là auto** (`bietCheDo = true`) | ĐỎ | **chỉ** bài "`advance === null` thì KHÔNG vẽ chế độ nào" |
| T6-3 | coi `advance === null` là review (chiều kia) | ĐỎ | cùng bài |
| T6-4 | nhãn viết cứng "nghiệm thu" | ĐỎ (4) | 4 bài |
| T6-5 | nhãn viết cứng "tự chạy" | ĐỎ (3) | 3 bài |
| T6-6 | đổi chế độ gửi CHÍNH chế độ đang có | ĐỎ (2) | hai bài đổi chế độ |
| T6-7 | bỏ `onDoi()` sau khi đổi | ĐỎ (2) | hai bài đổi chế độ |
| T6-8 | nhãn chế độ hiện ở MỌI ca | ĐỎ | bài ca `null` |
| T6-9 | `Cho đi tiếp` hiện ở mọi chế độ | ĐỎ (2) | 2 bài |

**Lần đầu tôi viết T6-1 nó KHÔNG phải một đột biến, và cái chốt của cụm trước bắt được.** Bản
đầu chỉ thay hai dòng suy luận và tham chiếu một biến không tồn tại → 10/11 đỏ vì lỗi BIÊN DỊCH,
không vì hành vi. Một đột biến không biên dịch được thì làm mọi bài đỏ và không đo gì cả — cùng
họ với "ĐỘT BIẾN KHÔNG ĂN", chỉ ngược dấu. Đã thêm **cái chốt thứ ba** vào bộ chạy: `tsc` phải
xanh SAU khi đột biến, nếu không thì bỏ dòng đó thay vì ghi một con số. Bản đúng dựng lại nguyên
vẹn cả `import`, `useState`, effect `layCaiDat` và phép suy.

**Hai phép đo cho câu "không gọi mạng để biết chế độ"**, vì một mình phép đo đầu chỉ canh đúng
một cái tên hàm: spy trên `layCaiDat` (đường qua `lib/api.ts`) và spy trên `fetch` (đường gọi
thẳng). Cả hai **không bao giờ resolve** — một mock trả sẵn `advance_mode` sẽ cho ra nhãn đúng
vì lý do sai, và lúc đó bài kiểm xanh trong khi component vẫn phụ thuộc mạng.

#### Ca `advance === null`: chỗ tôi lệch khỏi chữ "giữ hành vi hiện tại", và vì sao

Người giao việc nói hai điều mà ở ca này chúng **xung đột**: "giữ hành vi hiện tại của
`DieuKhien` cho ca không biết chế độ" và "đừng vẽ *tự chạy* như một sự thật".

Hành vi hiện tại LÀ vẽ "tự chạy": `cheDo` khởi tạo là `''` nên `choNghiemThu === false`, và nhãn
đi vào nhánh `CHU.cheDoTuChay`. Bài kiểm của tôi cho ca đó ĐỎ trên mã nền — tức cái nói dối có
thật, không phải giả thuyết. Đã chọn vế thứ hai, và giữ vế thứ nhất ở đúng phần nó nói đúng:

- `choNghiemThu === false` khi `advance === null` → nút `Cho đi tiếp` KHÔNG hiện. **Giống hệt
  hành vi cũ**, và đúng: engine đóng thì nút đó trả 409.
- nhãn chế độ thì ẨN thay vì khẳng định một chế độ.

Và nó không chỉ đúng về LỜI mà còn đúng về CHỨC NĂNG — đây là phần suy ra được từ mã Go, không
suy được từ giao diện: `PUT /advance-mode` tự đòi `s.may.dangMo(book)` (`internal/serve/vongdoi.go:41`),
nên trên một engine đã đóng cái nút ấy **chắc chắn trả lỗi**. Vẽ nó là mời bấm một nút không
bấm được — cùng lý lẽ mà chính kế hoạch đã dùng để bỏ cửa nghiệm thu ở ca `null`.

Ẩn chứ không vẽ một dấu "không đo được": nhánh `maMoy === false` ngay dưới ĐÃ là bề mặt cho ca
engine đóng và nó nói ra bằng nút `Mở máy` — một câu rõ hơn một dấu gạch. Có bài kiểm cho vế
ngược ("`advance === null` KHÔNG làm mất nút Chạy") để không ai chữa cái này bằng cách ẩn cả
thanh: nhánh đó mang một sửa lỗi vòng đời có lời người dùng kèm theo.

#### Chỗ kế hoạch SAI hoặc thiếu

1. **Câu "`Snapshot.transport` không mang `advance_mode`" đúng nguyên văn tới hôm nay, nhưng lý
   do THẬT để bỏ `/settings` mạnh hơn thứ kế hoạch ghi.** Kế hoạch nói hai endpoint "mô tả cùng
   một engine ở hai thời điểm lệch nhau". Đo được thì chúng không phải hai bản của một nguồn:
   `/settings` đọc `meta/run.json` — một TỆP còn lại từ lượt trước — còn `snapshot.advance` đến
   thẳng từ engine đang mở (`serve.go:325` chỉ gán khi `may.dangMo(id)` thành công). Nên đường
   mới **mất thông tin** ở ca engine đóng, và đó chính là điều đúng.
2. **Kế hoạch không nói `DieuKhien` sẽ mất gì khi bỏ `datCheDo(r.mode)`.** Đã kiểm phía Go trước
   khi bỏ, vì nếu `PUT /advance-mode` chỉ ghi `run.json` thì đọc chế độ từ snapshot sống sẽ làm
   nút đổi chế độ **không phản ứng** — một hồi quy im lặng. Nó chạm engine thật
   (`p.eng.SetAdvanceMode`, `vongdoi.go:46`) và trả từ chính `p.eng.Snapshot()`, tức cùng nguồn
   mà `/studio` đọc. Nên `onDoi()` là đủ, và giữ một `useState` là dựng lại đúng nguồn thứ hai
   vừa bỏ.
3. **Task 5 không nói dải lấy `choGhi` từ đâu, và `capabilities.steer` là câu trả lời SAI dù nó
   nằm sẵn trong snapshot.** `serve.go:309` đặt `Steer = s.choGhi && s.may != nil`, và nó là một
   `bool` trong JSON nên **không bao giờ nói được "chưa biết"**. Dải có một nhánh riêng cho
   `choGhi === undefined` (khóa nút mà KHÔNG nói "studio chỉ đọc"), có bài kiểm, và đột biến
   T2-7 của cụm trước đã chứng minh nhánh đó sống. Dùng `steer` là lặng lẽ giết nó. Nên
   `may.choGhi` đi xuyên `Khu` — hai prop mới trên một `switch` mười sáu nhánh, và đó là giá
   đúng.
4. **Task 7 kê sáu lớp; nhật ký cụm trước sửa thành tám. Tám là ĐÚNG** — đã đo lại bằng cách
   nhìn CHÍNH selector, không đếm số lần xuất hiện: `.ky` và `.lbl` không có một luật TRẦN nào
   trong `globals.css` (chỉ `.st .ky`, `.trans .lbl`, `.mucxem .lbl`…). Thiếu chúng thì `■` và
   "Kết luận của Editor" render trần.
5. **Task 7 không lường rằng huy hiệu phá thanh trên ở 390px** — xem mục dưới. Đây là chỗ kế
   hoạch thiếu nặng nhất của Task 7, vì hệ quả là mất DỮ LIỆU (tên cuốn đang mở), không phải
   mất hình.
6. **Fixture `studio-tran-yeu-ky.json` mang một trạng thái server thật KHÔNG dựng được:**
   `agents`/`context`/`in_progress_chapter` non-null mà `advance: null`. `chieuTruongSong`
   (`snapshot.go:571`) đặt cả năm trường sống trong CÙNG một lời gọi và `Advance` ở đó là
   `&TienDo{…}`, không bao giờ `nil`. Cùng lớp drift mà cụm D đã sửa cho năm trường kia và bỏ
   sót đúng trường này. Đã sửa thành một cửa đang chờ — cần cho kiểm hình, và cũng để mock thôi
   nói dối.

#### Một hồi quy TỰ GÂY RA ở 390px, và nó không hiện ra dưới dạng tràn ngang

`tranNgangTrang === 0` và `barTran === 0` ở 390px — cả hai phép đo mà Task 7 yêu cầu đều XANH.
Nhưng huy hiệu (194px) đã nén `.pickwrap` xuống còn **5px**: tên cuốn đang mở biến mất khỏi
thanh trên. Đúng cái hỏng mà chú thích của `.slate` đã trả giá để ghi một lần ("bị nén về bề
rộng 0 mà các đốm bên trong vẫn vẽ ra ngoài") — và một bộ đo chỉ hỏi "có tràn không" **không
bao giờ thấy nó**, vì flex nén chứ không tràn.

Ngân sách đo được ở 390px: 330px dùng được (390 − đệm 24 − ba khe 36), trong đó bộ chọn đòi
76px, nút `+` 27px, huy hiệu kết nối 104px → còn **123px** cho huy hiệu.

| | trước | sau |
|---|---|---|
| huy hiệu | 194px | **83px** |
| bộ chọn tác phẩm | **5px** (nén) | **116px** (không nén) |

Đã xử bằng bản nhãn ngắn `nghiemThuChoBanNgan = 'Chờ bạn'`, hai bản cùng nằm trong DOM và CSS
chọn bản nào hiện — không có điểm ngắt nào trong JS, vì một `matchMedia` ở đó là bản thứ hai của
một con số mà `globals.css` đã giữ. Giữ vế "chờ bạn" chứ vế "nghiệm thu": vế thứ hai nói CHỦ ĐỀ,
vế thứ nhất nói việc phải làm, và huy hiệu tồn tại để nói điều thứ hai.

**Cái còn mất, nói thẳng:** ở 390px bộ chọn hiện `Tr… 46/300` chứ không hiện đủ "Trấn Yêu Ký",
vì huy hiệu vẫn ăn 83px của nó. Chấp nhận, và có lý do đo được: tên cuốn VẪN trên màn hình —
`.head` của bề mặt in "Trấn Yêu Ký · đang viết · 300 chương · 6 tập · 138.412 từ" ngay dưới
thanh trên — còn huy hiệu chỉ hiện khi có một cửa đang chờ. Đường thứ ba (rút về đúng ký hiệu,
trả bộ chọn về 161px) đã cân nhắc và bỏ: một hình vuông amber không tên là một huy hiệu không ai
đọc được, và trên cảm ứng `title` không tồn tại (lý do đã ghi ở `moMay`).

**Task 7 vì vậy ĐỘNG VÀO `ThanhTren.tsx` và `nhan.ts`, ngoài bảng tệp** — cùng tiền lệ và cùng
lý do như `data-nhan` của cụm Xưởng: CSS không được tự bịa chuỗi (luật 4), nên một bản nhãn thứ
hai phải đi qua `nhan.ts`.

#### Kiểm hình trên trình duyệt THẬT

`npm run build:mock` → phục vụ `web/out` tĩnh trên `127.0.0.1:8479` → Chromium qua Playwright.

**Ảnh chụp:**
`~/Personal/reclip/VideoCaptionerSystem/.playwright-mcp/nghiemthu-1440.png` ·
`…/nghiemthu-390.png` · `…/nghiemthu-kiemdinh-1440.png` (dải trên bản duyệt 7 chiều).

| Việc | 1440×900 | 390×844 |
|---|---|---|
| tràn ngang trang | **0** | **0** |
| tràn ngang trong dải | **0** | **0** |
| tràn ngang thanh trên | **0** | **0** |
| bộ chọn tác phẩm bị nén | không | **không** (116px) |
| huy hiệu | 194px, nhãn đầy đủ | 83px, nhãn ngắn |
| hai nút | cùng hàng với chữ, căn phải | **xuống hàng riêng** dưới chữ |
| phần tử chữ đo được (dải) | **6** | **6** |
| màu không đọc được | **0** | **0** |
| vi phạm AA trong dải | **0** | **0** |
| vi phạm AA toàn trang | **0** (345 phần tử) | **0** (308 phần tử) |
| tỉ số thấp nhất trên nền amber | **4,94:1** (`.lbl`) | **4,94:1** |

**Điểm ngắt đo tại chỗ:** 861px → hai cột (`291.82px 321.18px`), nút cùng hàng với chữ;
860px → một cột (`824px`), nút xuống hàng (top 212 so với ô lý do 159). Cả hai 0 tràn.

**Ca engine đóng, đo trên `?tp=bien-ky`:** không dải, không huy hiệu, và transport chỉ còn
`▶ Chạy` + `Đóng máy` — **không nhãn chế độ nào**, tức ca `null` của Task 6 đúng trên trình
duyệt thật, không chỉ trong jsdom.

**Ca Kiểm định:** hai nút `disabled === false` trên trình duyệt thật, tức `tacPham` và `choGhi`
thật sự tới được bề mặt đó — bẫy T2-8 mà cụm trước cảnh báo đã được đóng bằng một phép đo sống,
không chỉ bằng một bài kiểm jsdom.

#### BỘ ĐO TƯƠNG PHẢN: chốt thứ tư, và cách tôi chứng minh nó không đo nhầm

Cụm Xưởng ghi lại rằng bản đầu của họ tô đen trước rồi tô đè, nên `rgba(0,0,0,0)` để lại pixel
đen ĐẶC và **mọi phần tử bị đo trên nền đen** — báo cao hơn sự thật. Bản của tôi bỏ hẳn bước tô
đen (`clearRect` rồi tô thẳng, đọc alpha thật) và gộp chuỗi tổ tiên theo `source-over`.

Ba chốt của họ đều bật: đếm màu không đọc được (**0**), cắm một phần tử chắc chắn vi phạm rồi
hỏi lại (**đúng 1** mọi lần chạy), quét cả `::before`.

**Chốt thứ tư, của tôi, và nó là thứ duy nhất chứng minh bản này không lặp lại lỗi ĐÓ:** hỏi
CÙNG một màu chữ trên BA nền khác nhau và đòi ba con số khác nhau. Triệu chứng của bộ đo hỏng là
"mọi phần tử `--ink-3` đều ra đúng một số".

| `--ink-3` trên | tỉ số |
|---|---|
| `--bg` | **5,46:1** |
| `--panel` | **5,22:1** |
| nền dải (amber 9%) | **4,94:1** |

Ba số khác nhau, và **giảm dần đúng chiều** nền sáng lên — đúng vật lý. Thêm một đối chiếu độc
lập: **5,46 khớp CHÍNH XÁC** con số cụm Xưởng đo cho `--ink-3` trên một dòng thường. Hai bộ đo
dựng riêng, cùng một con số.

**Một chỗ đáng ghi cho người sau:** chú thích của token nói `--ink-3` là "4.9:1" so với `--bg`,
còn hai bộ đo độc lập đều cho 5,46. Không sửa (ngoài phạm vi, và con số 4,9 vẫn ở phía an toàn),
nhưng nếu ai chỉnh token đừng tin con số trong chú thích đó.

Nồng độ 9% chứ 12%: chép nguyên `.canhbao`, và có ba lý do đo được — (a) hai dải amber đứng gần
nhau trong `.bltren` nên hai nồng độ khác nhau đọc thành hai MỨC báo động trong khi chúng là hai
LOẠI tin; (b) dải này đứng trên `--panel`/`--bg` cạnh `.canhbao`, không phải giữa những hàng
`--bg` như dòng engine-mở của màn Xưởng; (c) 9% để lại **4,94:1**, tức dư 0,44 trên sàn — gấp
đôi khoảng dư 0,21 mà cụm Xưởng phải sống với ở 12%.

#### Chỗ KHÔNG có bài kiểm, và vì sao

CSS thuần vẫn không có bài kiểm nào, cùng lý do cụm Xưởng đã ghi: jsdom không bố cục. Mọi khẳng
định về hình ở trên đứng trên số đo lấy từ Chromium thật. Ba thứ không có hàng rào hồi quy:

- dải và huy hiệu có hình đúng hay không;
- **ngân sách 123px của thanh trên ở 390px** — thêm bất kỳ thứ gì vào `.bar` sẽ lại nén bộ chọn,
  và không có gì đỏ. Đây là cái đáng lo nhất của cụm này, vì phép đo "có tràn không" **không
  bắt được nó** (flex nén chứ không tràn). Con số và cách đo đã ghi thẳng vào `nhan.ts` và CSS;
- tỉ số tương phản sau một lần chỉnh token.

Thứ jsdom GIỮ được thì đã có bài: `ThanhTren.test.tsx` chốt cả hai bản nhãn có mặt, `aria-label`
là bản đầy đủ, và bản ngắn phải là một chuỗi KHÁC (hai bản giống nhau thì điểm ngắt không tiết
kiệm pixel nào mà bài kiểm vẫn xanh).

#### Quyết định tự đưa ra vì kế hoạch không nói

- **`dangChay` của dải ở Kiểm định lấy từ prop `dangChay` của `Khu`, không gọi lại
  `mayDangChay(snapshot)`.** Nhật ký cụm trước gợi ý cách thứ hai; cả hai cho cùng giá trị, mà
  `page.tsx` đã tính sẵn một lần — tính lại là mở đường cho hai bản của cùng một phép suy.
- **`maMoy` (`/api/engine`) được GIỮ dù `snapshot.advance !== null` bây giờ trả lời được chính
  câu nó đang hỏi.** Đó là nguồn thứ hai của "engine có mở không", cùng lớp với nguồn thứ hai
  vừa bỏ — nhưng nhánh `maMoy === false` mang một sửa lỗi vòng đời có lời người dùng kèm theo
  ("không biết luồng chạy như nào… rời rạc"), và gộp nó là đổi luồng Chạy/Mở máy, việc mà cụm
  này không sở hữu và Task 8 không có mục E2E nào cho. Đã ghi thẳng vào chú thích tại chỗ để ai
  sở hữu luồng đó nhặt.
- **Ở một cửa đang chờ, `Cho đi tiếp` xuất hiện HAI lần trên cùng màn hình** — một ở dải, một ở
  transport (`DieuKhien` hiện nó khi chế độ là `review`). Không phải lớp lỗi "hai sự thật":
  chúng gọi CÙNG một route và giờ đọc CÙNG một nguồn. Không bỏ cái nào: nút ở transport có
  nghĩa ở mọi bề mặt kể cả khi chưa tới biên, còn nút ở dải là nút quyết định đứng cạnh bằng
  chứng. Nhưng bộ kiểm phải khoanh vùng — `app/page.nghiemthu.test.tsx` tra trong
  `.cuanghiemthu`, và có chú thích nói vì sao. Trước Task 6 chuyện này không lộ ra trong bộ
  kiểm vì tệp đó không thay `layCaiDat` nên nhãn chế độ không bao giờ về.
- **`.cntlydo` dùng `--ink-2`, không `--ink-3`.** Đây là câu người vận hành đọc để QUYẾT ĐỊNH,
  không phải một nhãn phụ; và nó cũng là chỗ dư tương phản nhất nên không có lý do hạ.
- **Dưới 860px hai nút căn TRÁI, không căn phải.** Trên một hàng của chính nó, căn phải đẩy hai
  nút ra xa mắt vừa đọc xong câu kết luận — ở khổ hẹp thứ tự đọc là trên xuống dưới.
- **Không mở điểm ngắt mới.** Dải dùng 860px (`DESIGN.md:110` và rail đang bám), huy hiệu dùng
  700px (`.nutMoi` và `.slate` đang bám).
- **`web/out` dựng lại bằng `npm run build` (không mock) trước khi commit** — nó bị
  `.gitignore` bỏ qua nên không vào commit, nhưng để lại một bản mock là đặt bẫy cho Task 8.
- **Bộ chạy đột biến và bộ đo tương phản KHÔNG đưa vào repo**, cùng lý do ba cụm trước: chúng
  không nằm trong cổng nào nên trong repo chúng là mã chết trông như hàng rào. Nhưng đây là cụm
  thứ NĂM cần chúng, và cụm trước đã viết "nếu có cụm thứ năm, hãy cân nhắc commit nó thật" —
  tôi vẫn không commit, và ghi lại rằng khuyến nghị đó bây giờ có bốn cụm hậu thuẫn.

#### Cổng sau Task 7 (chạy toàn bộ trong worktree, không lọc gói, không `-x`)

`go build ./...` exit 0 · `go vet ./...` exit 0 · `gofmt -l .` **rỗng** ·
`go test -count=1 ./...` **30 gói ok / 0 FAIL** (đúng nền) ·
`npm test` **197/197** (nền sau Task 1–4: 171/171, không bài nào đỏ) · `npx tsc --noEmit` exit 0 ·
`npm run build` exit 0.

`git merge-base --is-ancestor 91bc4b6 HEAD` → đúng; cây làm việc sạch.

**`tsc` bắt được thứ `npm test` không bắt, lần thứ TƯ trong dự án:** fixture của
`KiemDinh.test.tsx` dùng `note` cho một `Dimension` mà hợp đồng khai `comment`. `npm test` xanh
188/188 vì bài đó không đọc trường ấy — nó chỉ đếm `.duyetthan`. Chạy CẢ HAI trước khi commit.

---

## Task 8 — cổng cuối + E2E (người điều phối tự làm)

Gộp `--ff-only` từ `thuc-thi/nghiem-thu`, merge-base kiểm trước = `cc77990` (đúng bằng HEAD của
`feat/viet-hoa-i18n`). Cổng trên cây ĐÃ GỘP: `go build` 0 · `go vet` 0 · `gofmt -l` rỗng ·
`go test -count=1 ./...` **30 gói / 0 FAIL** · `npm test` **207/207** · `tsc` 0 · `npm run build` 0.

### E2E trên cuốn thật `mac-the-bien-di-vo` (không fixture)

| # | Việc | Kết quả |
|---|---|---|
| 1 | bật `review`, chạy tới biên chương | engine viết xong chương 4 rồi DỪNG · `runtime: "paused"` |
| 2 | huy hiệu ở thanh trên | hiện ở buồng lái **và** ở `?khu=chi-phi` |
| 3 | dải amber | hiện ở buồng lái **và** ở `?khu=kiem-dinh` — một component, hai bề mặt |
| 4 | `hold_reason` vắng | dải nói "Editor chưa ghi kết luận nào", KHÔNG bịa lý do |
| 5 | bấm `Cho đi tiếp 1 chương` | `runtime` paused→running · `permit_chapter: 5` · Writer vào chương 5 |
| 6 | engine chạy lại | huy hiệu VÀ dải cùng biến mất |
| 7 | đóng máy | cả sáu trường sống `null`, `runtime: ""` |
| 8 | 1440 + 390 | 0 tràn ngang cả hai |

### Lỗi E2E lộ ra và đã sửa (`3fda982`)

**Spec chiếu SAI tín hiệu của cửa.** Chi tiết trong thông điệp commit. Ba thay đổi: `/studio`
mang thêm `runtime`; `trangThaiCua` nhận nó; `mayDangChay` cho nó thắng `book.activity`.

---

## Việc tồn sau khi cả bốn kế hoạch hạ cánh

Ghi ra thay vì để người sau tự phát hiện.

1. **Cây vai LUÔN PHẲNG với dữ liệu thật.** `host.AgentSnapshot` (`internal/host/events.go:147`)
   không có trường depth, nên `anhXaVai` gán cứng `Depth: 0`. Spec §7.2 vẽ
   `└ writer → novel_context` và điều đó chưa hiện ra được. `cayVai` dựng đúng theo hợp đồng và
   tự suy biến về phẳng, nên không phải sửa web.
   **Đường sửa nếu muốn:** payload của `ui_event` ĐÃ có `Depth` (đo được: `Depth: 0` cho arbiter,
   `Depth: 1` cho `novel_context`), nên nguồn tồn tại — chỉ cần observer mang nó sang
   `AgentSnapshot`. Đó là sửa engine, và spec §3 cố ý loại việc đó khỏi phạm vi.

2. **HAI nút `Cho đi tiếp 1 chương` trên cùng một màn hình** — một ở dải nghiệm thu, một ở
   transport (`DieuKhien`, có từ trước). Đúng lớp rủi ro mà quyết định 4 của spec nêu để CẤM
   Xưởng có nút chạy: hai nút không thấy trạng thái khóa-lúc-đang-gửi của nhau, nên bấm cả hai
   là cấp phép hai chương. Chưa sửa vì nó là quyết định phạm vi, không phải lỗi cài đặt: bỏ nút
   nào là câu hỏi cho người dùng.

3. **`pending_steer` không bao giờ là `null`.** `internal/serve/model.go` khai `omitempty`, nên
   chuỗi rỗng rụng khỏi JSON và hai ca "không có việc tồn" với "engine đóng" đến web y hệt nhau.
   Spec §6.1 nói ngược. Dải vì vậy không vẽ dấu "không đo được" cho việc tồn — vẽ là khẳng định
   một điều dữ liệu không nói.

4. **Thước ngữ cảnh chưa lần nào hiện ra trên cuốn thật.** `ContextWindow` là 0 suốt cả bốn lượt
   E2E, nên `context` luôn `null` và cả dải lẫn transport đều hiện "không đo được" — đúng hợp
   đồng, nhưng nghĩa là nhánh VẼ THƯỚC chỉ có bài kiểm đơn vị chống lưng, chưa có phép đo sống.
