# Kế hoạch 2/4 — Buồng lái sản xuất (bề mặt web)

> **Cho người thi hành:** KỸ NĂNG BẮT BUỘC — dùng `superpowers:subagent-driven-development`.
> Các bước dùng cú pháp checkbox (`- [ ]`) để theo dõi.

**Mục tiêu:** dựng lại `?khu=dong-san-xuat` thành buồng lái ba cột theo bố cục TUI, với văn
sống chảy thật ở cột giữa.

**Kiến trúc:** logic chịu lực nằm ở hàm THUẦN trong `web/lib/` (bộ đệm văn, ngưỡng cuộn, cây
vai, bộ lọc sự kiện ui); React component chỉ vẽ và giữ DOM. Ranh giới đó là điều kiện để có
bài kiểm đỏ-trước — một component ôm cả ba việc thì không kiểm được việc nào.

**Bộ đồ nghề:** Next 16 · React 19 · vitest 4 (hai project: `logic` chạy Node, `giaodien` chạy
jsdom) · bộ canh quét nguồn phía Go giữ nguyên.

**Nền đã có:** kế hoạch 1/4 (`5f7fe95`) đã giao hợp đồng JSON ĐÃ ĐO: `/studio` mang `agents`,
`idle_agents`, `advance`, `context`, `in_progress_chapter`, `pending_steer`, `rewrite_reason`,
`recovery`; `/events` phát `stream_delta` + `stream_clear` với nhịp trung vị **2ms**, delta
không mang `id:`, chữ ở `data.text`. Bộ chạy test cho web dựng ở `61bc31e`.

---

## Luật cho mọi người thi hành — đọc trước khi gõ dòng đầu tiên

1. **KHÔNG xóa chú thích đang có.** Chú thích trong repo này ghi lý do và các phép đo đã trả
   giá để có. Chúng là tài sản, không phải mã chết. Nếu một chú thích thành sai sau thay đổi
   của bạn, **sửa nó cho đúng**, đừng xóa.
2. **Worktree đặt NGOÀI repo** — `~/.config/superpowers/worktrees/ainovel-cli/<nhánh>`. Đã đo:
   worktree trong `.worktrees/` làm `internal/diag` và `internal/i18n` (hai bộ quét cây nguồn)
   bò vào bản sao và cho **8 FAIL giả**.
3. **Cổng là DELTA so với nền, không phải "xanh hết".** Nền hiện tại: `go test ./...` **30 gói
   / 0 FAIL**, `npm test` **2/2**, `tsc --noEmit` 0 lỗi, `npm run build` exit 0. Chạy toàn bộ,
   không chạy `-x` hay lọc theo gói.
4. **Nhãn tiếng Việt phải qua `web/lib/nhan.ts`.** `TestNhanDlPhaiQuaTuDien` canh việc đó và
   nó sẽ bắt bạn.
5. **Mỗi bài kiểm phải ĐỎ TRƯỚC vì đúng lý do nó canh.** Chạy nó, đọc câu lỗi, xác nhận câu đó
   nói đúng cái bạn định canh. Một bài kiểm đỏ vì gõ sai tên hàm không chứng minh gì.

---

## Cấu trúc tệp

| Tệp | Việc | Trạng thái |
|---|---|---|
| `web/lib/dongSuKien.ts` | lọc sự kiện ui: bỏ thứ không mang `seq` | mới |
| `web/lib/vanSong.ts` | bộ đệm văn sống: lượt, vạch ngăn, hai trần | mới |
| `web/lib/tuCuon.ts` | ngưỡng "đang bám đáy" | mới |
| `web/lib/vaiTro.ts` | dựng cây vai từ `depth` | mới |
| `web/lib/api.ts` | tách hằng loại sự kiện làm hai nhóm | sửa |
| `web/lib/useStudio.ts` | định tuyến delta/clear sang bộ đệm, phơi `vanSong` | sửa |
| `web/components/VanSong.tsx` | pane văn sống + tự cuộn + vạch ngăn | mới |
| `web/components/DaiTrangThai.tsx` | dải trạng thái: vai · việc tồn · ngữ cảnh | mới |
| `web/components/BuongLai.tsx` | lưới ba cột của buồng lái | mới |
| `web/components/Inspector.tsx` | hai chế độ cột phải | sửa |
| `web/app/page.tsx` | chỉ còn định tuyến khu | sửa |
| `web/app/globals.css` | lưới + điểm gãy 1240/860 | sửa |
| `web/lib/nhan.ts` | nhãn mới | sửa |

`page.tsx` đang 509 dòng. Tách phần dựng buồng lái ra `BuongLai.tsx`; **không refactor gì
khác** trong tệp đó.

---

## Cụm A — bộ đệm và định tuyến sự kiện (T1–T5)

### Task 1: Sự kiện không mang `seq` không được đi vào đường ui

Có một lỗi THẬT đang sống trong `useStudio`. `LOAI_SU_KIEN` đã chứa `'stream_delta'` và
`'stream_clear'` (`web/lib/api.ts:45`), và vòng đăng ký gắn CÙNG MỘT handler `nhan` cho cả
bốn loại (`useStudio.ts:292`). Handler đó mở đầu bằng `if (ev.seq <= seqRef.current) return;`.

Payload của delta là `{"text":"…"}` — không có `seq`. Trong JavaScript `undefined <= 0` là
`false`, nên **không có early return**: `seqRef.current` bị gán `undefined`, mẩu chữ bị đẩy
vào danh sách `suKien` như một sự kiện, và — nặng nhất — `henRef` được đặt lại ở MỖI mẩu. Với
nhịp 2ms đã đo, hẹn 1500ms không bao giờ tới hạn, tức **bảng chương, trục và transport đứng
im suốt lúc engine đang viết**. Đúng thứ buồng lái tồn tại để hiện.

**Tệp:**
- Tạo: `web/lib/dongSuKien.ts`
- Tạo: `web/lib/dongSuKien.test.ts`

- [ ] **Bước 1: Viết bài kiểm đỏ**

```ts
// web/lib/dongSuKien.test.ts
import { expect, test } from 'vitest';

import { nhanSuKienUi } from './dongSuKien';

test('mẩu văn sống lọt vào đường ui bị bỏ, KHÔNG làm hỏng mốc seq', () => {
  // Đây đúng payload của `stream_delta`. Nó không có `seq`.
  expect(nhanSuKienUi({ text: 'nàng quay đầu lại' }, 12)).toBeUndefined();
});

test('sự kiện cũ hoặc trùng bị bỏ', () => {
  expect(nhanSuKienUi({ seq: 12, kind: 'ui_event' }, 12)).toBeUndefined();
  expect(nhanSuKienUi({ seq: 5, kind: 'ui_event' }, 12)).toBeUndefined();
});

test('sự kiện mới được nhận nguyên vẹn', () => {
  const ev = { seq: 13, kind: 'ui_event', summary: 'viết chương 2' };
  expect(nhanSuKienUi(ev, 12)).toEqual(ev);
});

test('seq không phải số bị bỏ — kể cả chuỗi số', () => {
  // Một `seq: "13"` lọt qua `>` sẽ so sánh kiểu ép, rồi được gán vào mốc dưới dạng chuỗi;
  // phép so sánh kế tiếp sẽ so chuỗi với số và cho kết quả không đoán được.
  expect(nhanSuKienUi({ seq: '13', kind: 'ui_event' }, 12)).toBeUndefined();
});
```

- [ ] **Bước 2: Chạy để xác nhận đỏ**

Chạy: `cd web && npx vitest run lib/dongSuKien.test.ts`
Chờ: FAIL — `Failed to resolve import "./dongSuKien"`.

- [ ] **Bước 3: Viết phần đủ để xanh**

```ts
// web/lib/dongSuKien.ts
import type { StreamEvent } from './types';

/**
 * Cổng vào của đường sự kiện ui.
 *
 * # Vì sao một hàm riêng cho hai phép so sánh
 *
 * Vì đã có một lỗi ĐO ĐƯỢC ở đúng chỗ này. `LOAI_SU_KIEN` chứa cả `stream_delta`, và
 * `useStudio` từng gắn cùng một handler cho mọi loại. Payload của delta là `{"text":"…"}`,
 * không có `seq`, và `undefined <= 0` trong JavaScript là `false` — nên không có early
 * return. Ba hệ quả, nặng dần:
 *
 *   1. `seqRef.current` bị gán `undefined`, tức mốc nối lại của stream mất nghĩa;
 *   2. mẩu chữ bị đẩy vào danh sách sự kiện như một sự kiện;
 *   3. hẹn làm mới snapshot bị đặt lại ở MỖI mẩu. Nhịp delta đã đo là trung vị 2ms, nên hẹn
 *      1500ms KHÔNG BAO GIỜ tới hạn — bảng chương và transport đứng im đúng lúc engine đang
 *      viết, tức đúng lúc buồng lái phải sống.
 *
 * Đòi `typeof === 'number'` chứ không chỉ `!= null`: một `seq: "13"` lọt qua `>` nhờ ép kiểu
 * rồi được gán vào mốc dưới dạng chuỗi, và phép so sánh của mẩu sau đó so chuỗi với chuỗi
 * theo thứ tự từ điển ("9" > "13").
 */
export function nhanSuKienUi(vao: unknown, mocSeq: number): StreamEvent | undefined {
  if (!vao || typeof vao !== 'object') return undefined;
  const ev = vao as Partial<StreamEvent>;
  if (typeof ev.seq !== 'number') return undefined;
  if (ev.seq <= mocSeq) return undefined;
  return ev as StreamEvent;
}
```

- [ ] **Bước 4: Chạy để xác nhận xanh**

Chạy: `cd web && npx vitest run lib/dongSuKien.test.ts`
Chờ: 4 passed.

- [ ] **Bước 5: Commit**

```bash
git add web/lib/dongSuKien.ts web/lib/dongSuKien.test.ts
git commit -m "fix(web): mẩu văn sống lọt đường ui làm chết hẹn làm mới snapshot"
```

---

### Task 2: Bộ đệm văn sống — thêm chữ vào lượt hiện tại

**Tệp:**
- Tạo: `web/lib/vanSong.ts`
- Tạo: `web/lib/vanSong.test.ts`

- [ ] **Bước 1: Viết bài kiểm đỏ**

```ts
// web/lib/vanSong.test.ts
import { expect, test } from 'vitest';

import { BO_DEM_RONG, themChu } from './vanSong';

test('mẩu đầu tiên tạo lượt mở, không có nhãn vạch', () => {
  const bd = themChu(BO_DEM_RONG, 'nàng ');
  expect(bd.luot).toHaveLength(1);
  expect(bd.luot[0]!.chu).toBe('nàng ');
  expect(bd.luot[0]!.nhan).toBeUndefined();
});

test('mẩu kế tiếp nối vào lượt hiện tại, không mở lượt mới', () => {
  const bd = themChu(themChu(BO_DEM_RONG, 'nàng '), 'quay đầu lại');
  expect(bd.luot).toHaveLength(1);
  expect(bd.luot[0]!.chu).toBe('nàng quay đầu lại');
});

test('bộ đệm cũ không bị sửa tại chỗ', () => {
  const truoc = themChu(BO_DEM_RONG, 'a');
  themChu(truoc, 'b');
  expect(truoc.luot[0]!.chu).toBe('a');
});
```

- [ ] **Bước 2: Chạy để xác nhận đỏ**

Chạy: `cd web && npx vitest run lib/vanSong.test.ts`
Chờ: FAIL — không resolve được `./vanSong`.

- [ ] **Bước 3: Viết phần đủ để xanh**

```ts
// web/lib/vanSong.ts

/**
 * Bộ đệm VĂN SỐNG phía client — chữ model đang sinh ra, đã nhận qua SSE.
 *
 * Đây là bộ đệm THỨ HAI, và hai bộ đệm giữ hai thứ khác nhau — đừng lẫn:
 *
 *   - **Server** (`internal/serve/dong_van.go`) giữ đúng LƯỢT HIỆN TẠI, trần 512KB, cắt từ
 *     đầu. Nó chỉ cần đủ cho người mở trang GIỮA một lượt.
 *   - **Client** (tệp này) giữ 3 lượt gần nhất để đọc lại được đoạn vừa trôi qua.
 *
 * Trần đôi là cố ý. Chỉ đếm lượt thì một lượt Writer bằng cả chương vẫn phình tới hàng chục
 * MB. Chỉ đếm byte thì một lượt dài đẩy hết lượt trước ra và mất luôn vạch ngăn — tức mất
 * đúng thứ làm người đọc biết mình đang ở lượt nào.
 */

/** Một lượt máy nói: từ lệnh xóa này tới lệnh xóa kế tiếp. */
export interface LuotVan {
  /**
   * Số thứ tự tăng dần, KHÔNG dùng lại sau khi lượt bị bỏ.
   *
   * Dùng làm `key` của React. Chỉ số mảng thì không được: khi lượt cũ nhất bị bỏ, mọi chỉ số
   * dịch xuống một bậc, React coi đó là "nội dung của phần tử 0 vừa đổi" và giữ nguyên nút
   * DOM — trong một khu đang tự cuộn thì đó là một cú nhảy vị trí ngay giữa lúc đọc.
   */
  id: number;
  /** Nhãn vạch ngăn mở đầu lượt. `undefined` cho lượt đầu tiên của phiên xem. */
  nhan?: string;
  chu: string;
}

export interface BoDemVan {
  luot: LuotVan[];
  /** id sẽ cấp cho lượt kế tiếp. */
  idKe: number;
}

export const BO_DEM_RONG: BoDemVan = { luot: [], idKe: 1 };

/** Số lượt giữ lại. Người dùng cần đối chiếu lượt này với lượt trước, không cần cả phiên. */
export const SO_LUOT_GIU = 3;

/** Trần tổng byte của cả bộ đệm. Cùng con số với trần của server, vì cùng một lý do. */
export const CO_TOI_DA = 512 * 1024;

/** Thêm một mẩu chữ vào lượt đang mở. Mở lượt đầu nếu bộ đệm còn rỗng. */
export function themChu(bd: BoDemVan, chu: string): BoDemVan {
  if (!chu) return bd;
  const luot = bd.luot.slice();
  const cuoi = luot[luot.length - 1];
  if (!cuoi) {
    // Mẩu tới trước lệnh xóa nào cả. Server LUÔN gửi `stream_clear` trước lúc nối, nên ca này
    // chỉ xảy ra khi engine mở giữa chừng — vẫn phải giữ chữ, không được bỏ.
    return cat({ luot: [{ id: bd.idKe, chu }], idKe: bd.idKe + 1 });
  }
  luot[luot.length - 1] = { ...cuoi, chu: cuoi.chu + chu };
  return cat({ luot, idKe: bd.idKe });
}

/** Cắt theo hai trần. Bước 3 của Task 4 thay thân hàm này. */
function cat(bd: BoDemVan): BoDemVan {
  return bd;
}
```

- [ ] **Bước 4: Chạy để xác nhận xanh**

Chạy: `cd web && npx vitest run lib/vanSong.test.ts`
Chờ: 3 passed.

- [ ] **Bước 5: Commit**

```bash
git add web/lib/vanSong.ts web/lib/vanSong.test.ts
git commit -m "feat(web): bộ đệm văn sống, thêm chữ vào lượt đang mở"
```

---

### Task 3: Vạch ngăn — `stream_clear` mở lượt mới, chữ lượt trước còn nguyên

**Tệp:**
- Sửa: `web/lib/vanSong.ts`
- Sửa: `web/lib/vanSong.test.ts`

- [ ] **Bước 1: Viết bài kiểm đỏ (thêm vào cuối tệp test)**

```ts
import { moLuot } from './vanSong';

test('lệnh xóa mở lượt mới, chữ lượt trước KHÔNG mất', () => {
  let bd = themChu(BO_DEM_RONG, 'lượt một');
  bd = moLuot(bd, '— chương 2 · 23:11 —');
  bd = themChu(bd, 'lượt hai');

  expect(bd.luot).toHaveLength(2);
  expect(bd.luot[0]!.chu).toBe('lượt một');
  expect(bd.luot[1]!.chu).toBe('lượt hai');
  expect(bd.luot[1]!.nhan).toBe('— chương 2 · 23:11 —');
});

test('mỗi lượt có id riêng, không dùng lại', () => {
  let bd = themChu(BO_DEM_RONG, 'a');
  bd = moLuot(bd, 'v1');
  bd = moLuot(bd, 'v2');
  const id = bd.luot.map((l) => l.id);
  expect(new Set(id).size).toBe(id.length);
});

test('hai lệnh xóa liền nhau không để lại lượt rỗng', () => {
  // Engine phát sentinel hai lần liên tiếp là ca hợp lệ (lượt bị hủy trước khi phát chữ).
  // Một lượt rỗng vẽ ra là một vạch ngăn không ngăn gì cả.
  let bd = themChu(BO_DEM_RONG, 'a');
  bd = moLuot(bd, 'v1');
  bd = moLuot(bd, 'v2');
  expect(bd.luot).toHaveLength(2);
  expect(bd.luot[1]!.nhan).toBe('v2');
});
```

- [ ] **Bước 2: Chạy để xác nhận đỏ**

Chạy: `cd web && npx vitest run lib/vanSong.test.ts`
Chờ: FAIL — `moLuot` không được export.

- [ ] **Bước 3: Viết phần đủ để xanh (thêm vào `vanSong.ts`)**

```ts
/**
 * Mở một lượt mới — phản ứng với `stream_clear`.
 *
 * Tên hàm là "mở lượt", không phải "xóa": ở TUI lệnh này XÓA sạch khu chữ, còn ở đây nó thành
 * một vạch ngăn. Trình duyệt giỏi đúng cái terminal dở — cuộn lại được — nên vứt đi phần vừa
 * đọc là bỏ phí một khả năng, và người dùng đã chọn phương án vạch ngăn.
 *
 * Lượt đang mở mà RỖNG thì thay nhãn của nó chứ không xếp thêm một lượt nữa: hai sentinel
 * liền nhau là ca hợp lệ, và một lượt rỗng vẽ ra là một vạch ngăn không ngăn gì cả.
 */
export function moLuot(bd: BoDemVan, nhan?: string): BoDemVan {
  const cuoi = bd.luot[bd.luot.length - 1];
  if (cuoi && cuoi.chu === '') {
    const luot = bd.luot.slice();
    luot[luot.length - 1] = { ...cuoi, nhan };
    return { luot, idKe: bd.idKe };
  }
  return cat({
    luot: [...bd.luot, { id: bd.idKe, nhan, chu: '' }],
    idKe: bd.idKe + 1,
  });
}
```

- [ ] **Bước 4: Chạy để xác nhận xanh**

Chạy: `cd web && npx vitest run lib/vanSong.test.ts`
Chờ: 6 passed.

- [ ] **Bước 5: Commit**

```bash
git add web/lib/vanSong.ts web/lib/vanSong.test.ts
git commit -m "feat(web): lệnh xóa lượt thành vạch ngăn, giữ chữ lượt trước"
```

---

### Task 4: Hai trần — 3 lượt HOẶC 512KB, bỏ từ lượt cũ nhất

**Tệp:**
- Sửa: `web/lib/vanSong.ts` (thay thân `cat`)
- Sửa: `web/lib/vanSong.test.ts`

- [ ] **Bước 1: Viết bài kiểm đỏ (thêm vào cuối tệp test)**

```ts
import { CO_TOI_DA, SO_LUOT_GIU } from './vanSong';

function boDemNhieuLuot(soLuot: number, chuMoiLuot: string): BoDemVan {
  let bd = BO_DEM_RONG;
  for (let i = 0; i < soLuot; i += 1) {
    bd = moLuot(bd, `v${i}`);
    bd = themChu(bd, chuMoiLuot);
  }
  return bd;
}

test('quá SO_LUOT_GIU lượt thì bỏ lượt CŨ NHẤT', () => {
  const bd = boDemNhieuLuot(SO_LUOT_GIU + 2, 'x');
  expect(bd.luot).toHaveLength(SO_LUOT_GIU);
  // Hai lượt đầu (v0, v1) phải là hai lượt bị bỏ.
  expect(bd.luot.map((l) => l.nhan)).toEqual(['v2', 'v3', 'v4']);
});

test('quá trần byte thì bỏ từ lượt cũ nhất cho tới khi dưới trần', () => {
  const nua = 'x'.repeat(Math.floor(CO_TOI_DA * 0.6));
  let bd = BO_DEM_RONG;
  bd = moLuot(bd, 'v0');
  bd = themChu(bd, nua);
  bd = moLuot(bd, 'v1');
  bd = themChu(bd, nua);

  // Hai lượt = 120% trần, mà số lượt vẫn dưới SO_LUOT_GIU → chỉ trần byte mới cắt được.
  expect(bd.luot).toHaveLength(1);
  expect(bd.luot[0]!.nhan).toBe('v1');
});

test('MỘT lượt vượt trần thì không xóa sạch — cắt từ ĐẦU lượt đó', () => {
  // Ca này là lý do trần byte không được viết thành vòng "bỏ tới khi vừa". Bỏ lượt cuối cùng
  // là để lại một khu trống trong lúc engine đang phát chữ.
  const qua = 'y'.repeat(CO_TOI_DA + 5000);
  const bd = themChu(BO_DEM_RONG, qua);

  expect(bd.luot).toHaveLength(1);
  expect(bd.luot[0]!.chu.length).toBeLessThanOrEqual(CO_TOI_DA);
  // Giữ phần CUỐI: đó là phần đang chảy, tức phần người dùng đang đọc.
  expect(bd.luot[0]!.chu.endsWith('y')).toBe(true);
  expect(bd.luot[0]!.chu.length).toBeGreaterThan(0);
});

test('id vẫn tăng sau khi bỏ lượt — không cấp lại id đã dùng', () => {
  const bd = boDemNhieuLuot(SO_LUOT_GIU + 3, 'x');
  expect(bd.idKe).toBeGreaterThan(SO_LUOT_GIU + 3);
});
```

- [ ] **Bước 2: Chạy để xác nhận đỏ**

Chạy: `cd web && npx vitest run lib/vanSong.test.ts`
Chờ: FAIL — bài "bỏ lượt cũ nhất" báo nhận 5 lượt thay vì 3 (`cat` còn là hàm rỗng).

- [ ] **Bước 3: Thay thân `cat` trong `vanSong.ts`**

```ts
/**
 * Cắt bộ đệm theo HAI trần: số lượt và tổng byte. Cái nào chạm trước thì cái đó cắt.
 *
 * Thứ tự cố ý: bỏ lượt cũ nhất TRƯỚC, và chỉ khi chỉ còn một lượt mà vẫn quá trần thì mới cắt
 * chữ bên trong nó. Ngược lại — cắt chữ trước — sẽ gọt mất phần đầu của một lượt cũ mà lẽ ra
 * chỉ cần bỏ cả lượt, tức để lại một lượt cụt đầu vô nghĩa.
 *
 * Không bao giờ bỏ lượt CUỐI. Trần chạm được trong lúc engine đang phát, và một khu trống ở
 * vị trí đắt nhất của màn hình đúng lúc máy đang nói là hỏng nặng hơn cả việc phình bộ đệm.
 */
function cat(bd: BoDemVan): BoDemVan {
  let luot = bd.luot;

  if (luot.length > SO_LUOT_GIU) luot = luot.slice(luot.length - SO_LUOT_GIU);

  let tong = luot.reduce((n, l) => n + l.chu.length, 0);
  while (tong > CO_TOI_DA && luot.length > 1) {
    tong -= luot[0]!.chu.length;
    luot = luot.slice(1);
  }

  // Chỉ còn một lượt mà vẫn quá trần: cắt từ ĐẦU chữ của nó. Phần cuối là phần đang chảy.
  const cuoi = luot[luot.length - 1];
  if (luot.length === 1 && cuoi && cuoi.chu.length > CO_TOI_DA) {
    luot = [{ ...cuoi, chu: cuoi.chu.slice(cuoi.chu.length - CO_TOI_DA) }];
  }

  return luot === bd.luot ? bd : { luot, idKe: bd.idKe };
}
```

- [ ] **Bước 4: Chạy để xác nhận xanh**

Chạy: `cd web && npx vitest run lib/vanSong.test.ts`
Chờ: 10 passed.

- [ ] **Bước 5: Phép thử đột biến — chứng minh bài kiểm có canh gì**

Sửa mã sản xuất, chạy test, xác nhận ĐỎ, rồi hoàn nguyên. Ghi kết quả vào phần Nhật ký cuối
kế hoạch này.

| # | Đột biến | Phải đỏ ở |
|---|---|---|
| 1 | `luot.slice(luot.length - SO_LUOT_GIU)` → `luot.slice(0, SO_LUOT_GIU)` | "bỏ lượt CŨ NHẤT" |
| 2 | `luot.length > 1` → `luot.length > 0` | "MỘT lượt vượt trần không xóa sạch" |
| 3 | `chu.slice(chu.length - CO_TOI_DA)` → `chu.slice(0, CO_TOI_DA)` | "giữ phần CUỐI" |
| 4 | trong `moLuot`, bỏ nhánh lượt-rỗng | "hai lệnh xóa liền nhau" |

Đột biến nào XANH là một lỗ hổng thật: viết thêm bài kiểm bịt nó **trước khi** đi tiếp.

- [ ] **Bước 6: Commit**

```bash
git add web/lib/vanSong.ts web/lib/vanSong.test.ts
git commit -m "feat(web): hai trần cho bộ đệm văn sống, bỏ từ lượt cũ nhất"
```

---

### Task 5: `useStudio` định tuyến delta/clear sang bộ đệm

**Tệp:**
- Sửa: `web/lib/api.ts:45`
- Sửa: `web/lib/useStudio.ts`
- Sửa: `web/lib/nhan.ts`

- [ ] **Bước 1: Tách hằng loại sự kiện trong `api.ts`**

Thay dòng 45:

```ts
/**
 * Hai nhóm loại sự kiện, và chúng đi hai đường KHÁC NHAU trong `useStudio`.
 *
 * Gộp làm một danh sách là lỗi đã đo: handler của đường ui đòi trường `seq`, mà payload văn
 * sống không có nó — xem chú thích của `nhanSuKienUi` trong lib/dongSuKien.ts.
 *
 * Hai nhịp cũng khác nhau, và đó là thiết kế chứ không phải thiếu sót: `ui_event` nhảy khoảng
 * 5 lần trong 18 giây nên vòng dò 700ms là đủ; `stream_delta` có nhịp trung vị 2ms nên nó
 * được ĐÁNH THỨC ở phía server. Hạ vòng dò chung xuống cho khớp delta là nghiền đĩa vì một
 * dòng gần như im.
 */
export const LOAI_SU_KIEN_UI = ['ui_event', 'control'] as const;
export const LOAI_VAN_SONG = ['stream_delta', 'stream_clear'] as const;
export const LOAI_SU_KIEN = [...LOAI_SU_KIEN_UI, ...LOAI_VAN_SONG] as const;
```

- [ ] **Bước 2: Viết bài kiểm đỏ cho nhãn vạch**

```ts
// thêm vào web/lib/vanSong.test.ts
import { nhanVach } from './vanSong';

test('nhãn vạch nói chương nào và lúc mấy giờ', () => {
  const t = new Date('2026-08-01T23:11:04');
  expect(nhanVach(2, t)).toBe('chương 2 · 23:11');
});

test('không biết chương thì nhãn chỉ có giờ, không bịa số chương', () => {
  const t = new Date('2026-08-01T09:05:00');
  expect(nhanVach(undefined, t)).toBe('09:05');
});
```

Chạy: `cd web && npx vitest run lib/vanSong.test.ts` → FAIL (`nhanVach` chưa có).

- [ ] **Bước 3: Thêm `nhanVach` vào `vanSong.ts`**

```ts
import { CHU } from './nhan';

/**
 * Nhãn của một vạch ngăn: lượt này thuộc chương nào, mở lúc mấy giờ.
 *
 * Chương có thể chưa biết (`in_progress_chapter` là `null` khi không có chương nào đang
 * soạn). Lúc đó nhãn chỉ có giờ — bịa một số chương vào một vạch ngăn là gán sai cả một đoạn
 * văn cho một chương.
 */
export function nhanVach(chuong: number | undefined, luc: Date): string {
  const gio = `${String(luc.getHours()).padStart(2, '0')}:${String(luc.getMinutes()).padStart(2, '0')}`;
  return chuong === undefined ? gio : `${CHU.chuong.toLowerCase()} ${chuong} · ${gio}`;
}
```

Chạy lại → 12 passed.

- [ ] **Bước 4: Đấu dây trong `useStudio.ts`**

Bốn sửa đổi, không hơn:

1. Thêm import: `import { BO_DEM_RONG, moLuot, nhanVach, themChu, type BoDemVan } from './vanSong';`
   và `import { nhanSuKienUi } from './dongSuKien';`, và đổi `LOAI_SU_KIEN` thành
   `LOAI_SU_KIEN_UI, LOAI_VAN_SONG` trong import từ `./api`.

2. Thêm state cạnh các state khác:

```ts
const [vanSong, setVanSong] = useState<BoDemVan>(BO_DEM_RONG);
```

3. Trong effect "dòng sự kiện", thay đầu handler `nhan` và thêm hai handler mới:

```ts
    const nhan = (raw: MessageEvent) => {
      let tho: unknown;
      try {
        tho = JSON.parse(raw.data as string);
      } catch {
        return; // một mục hỏng không được giết cả dòng
      }
      const ev = nhanSuKienUi(tho, seqRef.current);
      if (!ev) return;
      seqRef.current = ev.seq;
      setKetNoi('song');
      /* … phần còn lại giữ NGUYÊN … */
    };

    // Văn sống đi đường riêng: nó không có `seq`, không vào danh sách sự kiện, và KHÔNG
    // được đặt lại hẹn làm mới snapshot — nhịp 2ms sẽ làm hẹn 1500ms không bao giờ tới hạn.
    const nhanDelta = (raw: MessageEvent) => {
      let d: { text?: unknown };
      try {
        d = JSON.parse(raw.data as string) as { text?: unknown };
      } catch {
        return;
      }
      if (typeof d.text !== 'string' || !d.text) return;
      setKetNoi('song');
      setVanSong((b) => themChu(b, d.text as string));
    };

    const nhanXoa = () => {
      setKetNoi('song');
      setVanSong((b) => moLuot(b, nhanVach(chuongDangSoanRef.current, new Date())));
    };

    for (const loai of LOAI_SU_KIEN_UI) nguon.addEventListener(loai, nhan);
    nguon.addEventListener(LOAI_VAN_SONG[0], nhanDelta);
    nguon.addEventListener(LOAI_VAN_SONG[1], nhanXoa);
```

4. Thêm ref cho chương đang soạn (đặt cạnh ba ref hiện có, và gán trong lúc render như chúng):

```ts
  const chuongDangSoanRef = useRef<number | undefined>(undefined);
  /* … */
  chuongDangSoanRef.current = snapshot?.in_progress_chapter ?? undefined;
```

5. Đổi tác phẩm thì bộ đệm phải sạch. Trong effect §2, cạnh `setSuKien([])`:

```ts
    setVanSong(BO_DEM_RONG);
```

6. Phơi ra ngoài: thêm `vanSong: BoDemVan;` vào interface `Studio`, thêm `vanSong` vào cả
   object trả về và mảng deps của `useMemo`.

- [ ] **Bước 5: Cổng**

```bash
cd web && npm test && npx tsc --noEmit && npm run build
```
Chờ: test 12+ passed · tsc 0 lỗi · build exit 0.

- [ ] **Bước 6: Commit**

```bash
git add web/lib/api.ts web/lib/useStudio.ts web/lib/vanSong.ts web/lib/vanSong.test.ts web/lib/nhan.ts
git commit -m "feat(web): useStudio nhận văn sống vào bộ đệm riêng"
```

---

## Cụm B — pane văn sống (T6–T9)

### Task 6: Ngưỡng "đang bám đáy"

**Tệp:**
- Tạo: `web/lib/tuCuon.ts`, `web/lib/tuCuon.test.ts`

- [ ] **Bước 1: Viết bài kiểm đỏ**

```ts
// web/lib/tuCuon.test.ts
import { expect, test } from 'vitest';

import { LE_DAY, dangODay } from './tuCuon';

test('đúng đáy thì đang bám đáy', () => {
  expect(dangODay({ scrollTop: 900, scrollHeight: 1000, clientHeight: 100 })).toBe(true);
});

test('lệch trong ngưỡng vẫn coi là bám đáy', () => {
  // Trình duyệt trả số lẻ (devicePixelRatio, sub-pixel), nên so bằng đúng sẽ RỚT khỏi chế độ
  // tự cuộn ngay ở nhịp đầu — và người dùng không hiểu vì sao chữ đứng lại.
  expect(dangODay({ scrollTop: 900 - LE_DAY + 1, scrollHeight: 1000, clientHeight: 100 })).toBe(true);
});

test('cuộn lên quá ngưỡng thì KHÔNG còn bám đáy', () => {
  expect(dangODay({ scrollTop: 400, scrollHeight: 1000, clientHeight: 100 })).toBe(false);
});

test('nội dung ngắn hơn khung thì luôn là bám đáy', () => {
  // Lúc mới mở, khu chưa có gì để cuộn. Trả false ở đây sẽ hiện nút "về cuối" trên một khu
  // không cuộn được — một nút không làm gì.
  expect(dangODay({ scrollTop: 0, scrollHeight: 80, clientHeight: 300 })).toBe(true);
});
```

- [ ] **Bước 2: Chạy → FAIL (không resolve `./tuCuon`)**

- [ ] **Bước 3: Viết**

```ts
// web/lib/tuCuon.ts

/**
 * Ba số của một khu cuộn. Nhận dưới dạng dữ liệu chứ không nhận `HTMLElement` để bài kiểm
 * không phải dựng DOM cho một phép trừ.
 */
export interface ViTriCuon {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/**
 * Ngưỡng (px) còn coi là "đang ở đáy".
 *
 * Không so bằng đúng: trình duyệt trả số lẻ do devicePixelRatio và bố cục sub-pixel, nên
 * `scrollHeight - scrollTop - clientHeight` hiếm khi tròn 0 kể cả khi đã cuộn hết. So bằng
 * đúng sẽ làm khu rớt khỏi chế độ tự cuộn ngay nhịp đầu tiên.
 */
export const LE_DAY = 24;

/** Người dùng có đang ở đáy khu cuộn không — tức tự cuộn có được phép chạy không. */
export function dangODay(v: ViTriCuon): boolean {
  return v.scrollHeight - v.scrollTop - v.clientHeight <= LE_DAY;
}
```

- [ ] **Bước 4: Chạy → 4 passed**

- [ ] **Bước 5: Commit**

```bash
git add web/lib/tuCuon.ts web/lib/tuCuon.test.ts
git commit -m "feat(web): ngưỡng bám đáy cho khu tự cuộn"
```

---

### Task 7: `VanSong.tsx` vẽ lượt và vạch ngăn

**Tệp:**
- Tạo: `web/components/VanSong.tsx`, `web/components/VanSong.test.tsx`
- Sửa: `web/lib/nhan.ts`

- [ ] **Bước 1: Thêm nhãn vào `nhan.ts` (trong object `CHU`)**

```ts
  mayDangNoi: 'Máy đang nói',
  veCuoi: 'về cuối',
  mayNghi: 'Máy đang nghỉ',
```

và vào `GIAI_THICH`:

```ts
  vanSongTrong:
    'Chưa có lượt nào trong phiên xem này. Khi máy bắt đầu viết, chữ sẽ chảy ở đây.',
  vanSongNghi:
    'Đây là báo cáo của lượt vừa xong. Bấm Chạy ở thanh dưới để máy viết tiếp.',
```

- [ ] **Bước 2: Viết bài kiểm đỏ**

```tsx
// web/components/VanSong.test.tsx
import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import { BO_DEM_RONG, moLuot, themChu } from '@/lib/vanSong';

import { VanSong } from './VanSong';

test('vẽ chữ của mọi lượt đang giữ', () => {
  let bd = themChu(BO_DEM_RONG, 'lượt một');
  bd = moLuot(bd, 'chương 2 · 23:11');
  bd = themChu(bd, 'lượt hai');

  render(<VanSong boDem={bd} dangChay />);

  expect(screen.getByText('lượt một')).toBeDefined();
  expect(screen.getByText('lượt hai')).toBeDefined();
});

test('vạch ngăn hiện nhãn của lượt, và lượt đầu KHÔNG có vạch', () => {
  let bd = themChu(BO_DEM_RONG, 'lượt một');
  bd = moLuot(bd, 'chương 2 · 23:11');
  bd = themChu(bd, 'lượt hai');

  const { container } = render(<VanSong boDem={bd} dangChay />);

  expect(screen.getByText('chương 2 · 23:11')).toBeDefined();
  // Hai lượt nhưng chỉ MỘT vạch: vạch là thứ ngăn giữa, không phải nhãn của mỗi khối.
  expect(container.querySelectorAll('.vach')).toHaveLength(1);
});

test('bộ đệm rỗng nói ra là chưa có gì, không để khung trắng', () => {
  render(<VanSong boDem={BO_DEM_RONG} dangChay />);
  expect(screen.getByText(/chưa có lượt nào/i)).toBeDefined();
});
```

- [ ] **Bước 3: Chạy → FAIL (không resolve `./VanSong`)**

- [ ] **Bước 4: Viết `VanSong.tsx`**

```tsx
'use client';

import { CHU, GIAI_THICH } from '@/lib/nhan';
import type { BoDemVan } from '@/lib/vanSong';

/**
 * Khu VĂN SỐNG — chữ model đang sinh ra.
 *
 * # Vì sao chữ UI/mono chứ không phải serif
 *
 * ĐO ĐƯỢC trên `scripts/sample.gif` (255 khung): khu này KHÔNG phải văn truyện. Nó là đối số
 * JSON của lời gọi tool, danh mục khế ước tự đối chiếu có ✓, bảng kiểm chất lượng, và báo cáo
 * chương theo mục. Văn truyện đọc ở bề mặt Bản thảo — đó là chỗ DUY NHẤT nó xuất hiện, và ở
 * đó nó mới là serif khổ 70ch.
 *
 * Bản preview đầu tiên vẽ khu này thành khổ serif đang chảy văn. Sai, và sai theo kiểu tốn
 * kém: nó làm cả bố cục cột giữa được cân theo một thứ không tồn tại.
 *
 * # Vì sao vạch ngăn thay vì xóa
 *
 * TUI XÓA sạch khu này ở mỗi lượt vì terminal không cuộn lại được. Trình duyệt giỏi đúng chỗ
 * đó, nên vứt đi phần vừa đọc là bỏ phí. Trần giữ 3 lượt nằm ở `lib/vanSong.ts` cùng lý do.
 */
export function VanSong({
  boDem,
  dangChay,
}: {
  boDem: BoDemVan;
  dangChay: boolean;
}) {
  return (
    <section className="vansong" aria-label={CHU.mayDangNoi}>
      <div className="vshead">
        <h2>{dangChay ? CHU.mayDangNoi : CHU.mayNghi}</h2>
      </div>
      <div className="vsthan">
        {boDem.luot.length === 0 ? (
          <p className="vstrong">
            {dangChay ? GIAI_THICH.vanSongTrong : GIAI_THICH.vanSongNghi}
          </p>
        ) : (
          boDem.luot.map((l, i) => (
            <div className="luot" key={l.id}>
              {/* Lượt ĐẦU trong bộ đệm không có vạch kể cả khi nó mang nhãn: vạch là thứ
                  NGĂN GIỮA hai lượt. Vẽ một vạch trên cùng là khẳng định có một lượt phía
                  trên nó — mà lượt đó đã bị trần cắt mất, hoặc chưa từng có. */}
              {i > 0 && l.nhan ? (
                <div className="vach" role="separator">
                  <span>{l.nhan}</span>
                </div>
              ) : null}
              <pre className="chu">{l.chu}</pre>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
```

- [ ] **Bước 5: Chạy → 3 passed**

- [ ] **Bước 6: Commit**

```bash
git add web/components/VanSong.tsx web/components/VanSong.test.tsx web/lib/nhan.ts
git commit -m "feat(web): khu văn sống vẽ lượt và vạch ngăn"
```

---

### Task 8: Tự cuộn — dừng khi cuộn lên, nút "về cuối"

**Tệp:**
- Sửa: `web/components/VanSong.tsx`
- Sửa: `web/components/VanSong.test.tsx`

**Đã thăm dò trước, đừng dò lại** — ba giả định của các bài kiểm dưới đây đã được đo trên
chính cấu hình vitest này:

| Giả định | Đo được |
|---|---|
| jsdom có lưu `scrollTop` không | **CÓ** — gán 250 thì đọc lại được 250 |
| `fireEvent.scroll(el)` có kích hoạt `onScroll` của React không | **CÓ** — bộ đếm lên 1 |
| gán `el.scrollTop = el.scrollHeight` có ăn không | **CÓ** — đọc lại được 1000 |

`scrollHeight` và `clientHeight` thì KHÔNG: jsdom không bố cục nên cả hai luôn là 0, phải đặt
tay bằng `Object.defineProperty` — đó là việc của hàm `datCuon` dưới đây.

- [ ] **Bước 1: Viết bài kiểm đỏ (thêm vào cuối tệp test)**

```tsx
import { fireEvent } from '@testing-library/react';
import { CHU } from '@/lib/nhan';

/** jsdom không bố cục nên ba số cuộn đều là 0; đặt tay để mô phỏng một khu đã cuộn. */
function datCuon(el: HTMLElement, v: { top: number; height: number; client: number }) {
  Object.defineProperty(el, 'scrollHeight', { value: v.height, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: v.client, configurable: true });
  el.scrollTop = v.top;
}

test('đang bám đáy thì KHÔNG hiện nút về cuối', () => {
  let bd = themChu(BO_DEM_RONG, 'x');
  const { container } = render(<VanSong boDem={bd} dangChay />);
  const than = container.querySelector('.vsthan') as HTMLElement;

  datCuon(than, { top: 900, height: 1000, client: 100 });
  fireEvent.scroll(than);

  expect(screen.queryByRole('button', { name: CHU.veCuoi })).toBeNull();
});

test('cuộn lên thì hiện nút về cuối', () => {
  const bd = themChu(BO_DEM_RONG, 'x');
  const { container } = render(<VanSong boDem={bd} dangChay />);
  const than = container.querySelector('.vsthan') as HTMLElement;

  datCuon(than, { top: 100, height: 1000, client: 100 });
  fireEvent.scroll(than);

  expect(screen.getByRole('button', { name: CHU.veCuoi })).toBeDefined();
});

test('bấm về cuối thì cuộn xuống đáy và nút biến mất', () => {
  const bd = themChu(BO_DEM_RONG, 'x');
  const { container } = render(<VanSong boDem={bd} dangChay />);
  const than = container.querySelector('.vsthan') as HTMLElement;

  datCuon(than, { top: 100, height: 1000, client: 100 });
  fireEvent.scroll(than);
  fireEvent.click(screen.getByRole('button', { name: CHU.veCuoi }));

  expect(than.scrollTop).toBe(1000);
  expect(screen.queryByRole('button', { name: CHU.veCuoi })).toBeNull();
});

test('chữ mới KHÔNG kéo màn hình khi người dùng đã cuộn lên', () => {
  // Đây là bài canh quan trọng nhất của Task này: tự cuộn phải nhường người đọc. Không có nó
  // thì đọc lại một đoạn dài trong lúc engine đang phát là bất khả.
  let bd = themChu(BO_DEM_RONG, 'x');
  const { container, rerender } = render(<VanSong boDem={bd} dangChay />);
  const than = container.querySelector('.vsthan') as HTMLElement;

  datCuon(than, { top: 100, height: 1000, client: 100 });
  fireEvent.scroll(than);

  bd = themChu(bd, 'chữ mới tới');
  rerender(<VanSong boDem={bd} dangChay />);

  expect(than.scrollTop).toBe(100);
});
```

- [ ] **Bước 2: Chạy → FAIL (chưa có nút, chưa có hành vi cuộn)**

- [ ] **Bước 3: Sửa `VanSong.tsx`**

Thêm import `useCallback, useEffect, useRef, useState` từ `react` và `dangODay` từ
`@/lib/tuCuon`. Thân component:

```tsx
  const thanRef = useRef<HTMLDivElement>(null);
  const [bamDay, datBamDay] = useState(true);

  // Giữ trong ref VÀ trong state: effect dưới đọc ref (không muốn chạy lại mỗi lần đổi), còn
  // nút "về cuối" cần state để render lại.
  const bamDayRef = useRef(true);
  bamDayRef.current = bamDay;

  const theoCuon = useCallback(() => {
    const el = thanRef.current;
    if (!el) return;
    datBamDay(dangODay(el));
  }, []);

  const veCuoi = useCallback(() => {
    const el = thanRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    datBamDay(true);
  }, []);

  /**
   * Tự cuộn — nhưng CHỈ khi người đọc đang ở đáy.
   *
   * Tự cuộn là phép ĐO, không phải sở thích: chia khu chữ của `sample.gif` thành 8 dải ngang
   * thì bảy dải TRÊN cũng đổi 59–73 khung. Nếu chữ chỉ thêm ở dưới thì dải trên phải đứng im
   * — chúng không im, tức cả khối dịch lên.
   *
   * Nhường người đọc cũng là quyết định đã chốt: không dừng khi cuộn lên thì đọc lại một đoạn
   * dài trong lúc engine đang phát là bất khả — cứ mỗi mẩu 2ms là màn hình lại nhảy về đáy.
   */
  useEffect(() => {
    if (!bamDayRef.current) return;
    const el = thanRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [boDem]);
```

Gắn vào JSX: `<div className="vsthan" ref={thanRef} onScroll={theoCuon}>` và ngay sau khối
`.vsthan`:

```tsx
      {bamDay ? null : (
        <button type="button" className="vecuoi" onClick={veCuoi}>
          {CHU.veCuoi}
        </button>
      )}
```

- [ ] **Bước 4: Chạy → 7 passed**

- [ ] **Bước 5: Phép thử đột biến**

| # | Đột biến | Phải đỏ ở |
|---|---|---|
| 1 | bỏ `if (!bamDayRef.current) return;` trong effect | "chữ mới KHÔNG kéo màn hình" |
| 2 | `dangODay(el)` → `true` cố định | "cuộn lên thì hiện nút" |
| 3 | trong `veCuoi`, bỏ `datBamDay(true)` | "bấm về cuối thì nút biến mất" |

- [ ] **Bước 6: Commit**

```bash
git add web/components/VanSong.tsx web/components/VanSong.test.tsx
git commit -m "feat(web): tự cuộn khu văn sống, nhường người đang đọc lại"
```

---

### Task 9: Ca máy nghỉ — hiện báo cáo lượt cuối, không để khung trống

**Tệp:**
- Sửa: `web/components/VanSong.test.tsx`
- Sửa: `web/components/VanSong.tsx` (chỉ chữ giải thích + `aria`)

- [ ] **Bước 1: Viết bài kiểm đỏ**

```tsx
test('máy nghỉ mà bộ đệm CÒN chữ thì giữ nguyên chữ, chỉ đổi tiêu đề', () => {
  // Bộ đệm còn giữ báo cáo của lượt vừa xong. Xóa nó đi lúc engine đóng là vứt thứ duy nhất
  // đang nói được điều gì đó ở vị trí đắt nhất màn hình.
  const bd = themChu(BO_DEM_RONG, 'khế ước: ✓ 4/4 · 1.874 từ');
  render(<VanSong boDem={bd} dangChay={false} />);

  expect(screen.getByText('khế ước: ✓ 4/4 · 1.874 từ')).toBeDefined();
  expect(screen.getByRole('heading', { name: /máy đang nghỉ/i })).toBeDefined();
});

test('máy nghỉ và bộ đệm rỗng thì nói việc tiếp theo, không nói "chờ chữ"', () => {
  render(<VanSong boDem={BO_DEM_RONG} dangChay={false} />);
  expect(screen.getByText(/bấm chạy ở thanh dưới/i)).toBeDefined();
});
```

- [ ] **Bước 2: Chạy.** Bài đầu có thể XANH sẵn (Task 7 đã vẽ đúng); bài thứ hai đỏ nếu chữ
      `GIAI_THICH.vanSongNghi` chưa khớp. Ghi lại bài nào đỏ và vì sao — nếu **cả hai** xanh
      sẵn thì Task này không thêm phòng thủ nào, hãy nói ra điều đó thay vì giả vờ.

- [ ] **Bước 3: Sửa cho xanh** (chỉnh chữ trong `nhan.ts` nếu cần).

- [ ] **Bước 4: Commit**

```bash
git add web/components/VanSong.tsx web/components/VanSong.test.tsx web/lib/nhan.ts
git commit -m "test(web): canh ca máy nghỉ của khu văn sống"
```

---

## Cụm C — dải trạng thái (T10–T12)

### Task 10: Cây vai từ `depth`

**Tệp:**
- Tạo: `web/lib/vaiTro.ts`, `web/lib/vaiTro.test.ts`

- [ ] **Bước 1: Viết bài kiểm đỏ**

```ts
// web/lib/vaiTro.test.ts
import { expect, test } from 'vitest';

import type { Vai } from './types';
import { cayVai } from './vaiTro';

const v = (role: string, depth: number): Vai => ({ role, state: 'working', depth });

test('mọi vai cùng depth 0 đều là gốc', () => {
  const cay = cayVai([v('writer', 0), v('editor', 0)]);
  expect(cay).toHaveLength(2);
  expect(cay[0]!.con).toHaveLength(0);
});

test('vai depth 1 thành con của vai depth 0 ngay TRƯỚC nó', () => {
  const cay = cayVai([v('writer', 0), v('novel_context', 1), v('editor', 0)]);
  expect(cay).toHaveLength(2);
  expect(cay[0]!.vai.role).toBe('writer');
  expect(cay[0]!.con.map((c) => c.vai.role)).toEqual(['novel_context']);
  expect(cay[1]!.vai.role).toBe('editor');
});

test('cháu depth 2 gắn vào con depth 1 gần nhất', () => {
  const cay = cayVai([v('writer', 0), v('tool', 1), v('sub', 2)]);
  expect(cay[0]!.con[0]!.con.map((c) => c.vai.role)).toEqual(['sub']);
});

test('vai mồ côi (depth nhảy cóc, không có cha) vẫn được vẽ, KHÔNG bị nuốt', () => {
  // Nuốt im lặng một vai đang chạy là nói dối về việc máy đang làm gì. Thà vẽ nó ở gốc.
  const cay = cayVai([v('lac-loai', 3)]);
  expect(cay).toHaveLength(1);
  expect(cay[0]!.vai.role).toBe('lac-loai');
});

test('danh sách rỗng cho cây rỗng, không ném', () => {
  expect(cayVai([])).toEqual([]);
});
```

- [ ] **Bước 2: Chạy → FAIL**

- [ ] **Bước 3: Viết**

```ts
// web/lib/vaiTro.ts
import type { Vai } from './types';

/** Một nút trong cây vai. */
export interface NutVai {
  vai: Vai;
  con: NutVai[];
}

/**
 * Dựng cây vai từ danh sách PHẲNG có `depth`.
 *
 * Engine phát danh sách phẳng theo đúng thứ tự gọi, và `depth` là bậc lồng nhau — đúng cách
 * TUI vẽ (`writer → draft_chapter` rồi `└ writer → novel_context`). Web dựng lại cây từ hai
 * thứ đó chứ không tự suy quan hệ từ tên vai: suy từ tên là nhân bản logic của engine, đúng
 * thứ PRODUCT.md cấm, và nó sẽ lệch ngay lần engine đổi cách gọi lồng.
 *
 * Vai mồ côi (depth nhảy cóc mà không có cha ở bậc trên) được vẽ ở GỐC chứ không bị bỏ. Nuốt
 * im lặng một vai đang chạy là nói dối về việc máy đang làm.
 */
export function cayVai(vao: Vai[]): NutVai[] {
  const goc: NutVai[] = [];
  /** Nút gần nhất ở mỗi bậc, để tìm cha trong một lượt duyệt. */
  const ganNhat: (NutVai | undefined)[] = [];

  for (const vai of vao) {
    const nut: NutVai = { vai, con: [] };
    const bac = Math.max(0, vai.depth);

    let cha: NutVai | undefined;
    for (let b = bac - 1; b >= 0; b -= 1) {
      cha = ganNhat[b];
      if (cha) break;
    }

    if (cha) cha.con.push(nut);
    else goc.push(nut);

    ganNhat[bac] = nut;
    // Bậc sâu hơn của nhánh trước không còn là cha hợp lệ cho vai sau.
    ganNhat.length = bac + 1;
  }

  return goc;
}
```

- [ ] **Bước 4: Chạy → 5 passed**

- [ ] **Bước 5: Phép thử đột biến**

| # | Đột biến | Phải đỏ ở |
|---|---|---|
| 1 | bỏ `ganNhat.length = bac + 1;` | "vai depth 1 thành con của vai depth 0 ngay TRƯỚC nó" |
| 2 | `if (cha) … else goc.push` → `if (cha) … ` (bỏ else) | "vai mồ côi vẫn được vẽ" |

- [ ] **Bước 6: Commit**

```bash
git add web/lib/vaiTro.ts web/lib/vaiTro.test.ts
git commit -m "feat(web): dựng cây vai từ danh sách phẳng có depth"
```

---

### Task 11: `DaiTrangThai.tsx` — vai · việc tồn · ngữ cảnh, và ca `null`

**Tệp:**
- Tạo: `web/components/DaiTrangThai.tsx`, `web/components/DaiTrangThai.test.tsx`
- Sửa: `web/lib/nhan.ts`

- [ ] **Bước 1: Thêm nhãn vào `CHU`**

```ts
  vaiDangChay: 'đang chạy',
  vaiCho: 'chờ',
  vieccTon: 'việc tồn',
  nguCanh: 'ngữ cảnh',
  khongDoDuoc: 'không đo được',
```

và vào `GIAI_THICH`:

```ts
  truongSongNull:
    'Engine đang đóng nên studio không đo được giá trị này. Đây KHÁC với "đo được, bằng không".',
```

- [ ] **Bước 2: Viết bài kiểm đỏ**

```tsx
// web/components/DaiTrangThai.test.tsx
import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import type { Snapshot } from '@/lib/types';

import { DaiTrangThai } from './DaiTrangThai';

/** Snapshot tối thiểu; chỉ đặt những trường dải này thật sự đọc. */
function snap(p: Partial<Snapshot>): Snapshot {
  return {
    book: {
      id: 'b', name: 'B', phase: 'writing', completed_chapters: 1, total_chapters: 3,
      total_words: 100, activity: 'running', cost_usd: 0, cost_per_chapter: 0,
      chapters_per_hour: 0, engine_open: true,
    },
    capabilities: {} as Snapshot['capabilities'],
    timeline: {} as Snapshot['timeline'],
    agents: null, idle_agents: null, advance: null, context: null,
    in_progress_chapter: null,
    chapters: [], transport: {} as Snapshot['transport'], queue_seq: 0,
    ...p,
  } as Snapshot;
}

test('vẽ cây vai với công cụ và số lượt', () => {
  render(
    <DaiTrangThai
      snapshot={snap({
        agents: [
          { role: 'writer', state: 'working', tool: 'draft_chapter', turn: 7, depth: 0 },
          { role: 'novel_context', state: 'working', depth: 1 },
        ],
        idle_agents: ['architect_long', 'editor'],
      })}
    />,
  );

  expect(screen.getByText(/writer/)).toBeDefined();
  expect(screen.getByText(/draft_chapter/)).toBeDefined();
  expect(screen.getByText(/7/)).toBeDefined();
  expect(screen.getByText(/architect_long/)).toBeDefined();
});

test('ngữ cảnh null hiện dấu KHÔNG ĐO ĐƯỢC, không phải thước 0%', () => {
  // Lớp lỗi đã đo ở dự án này: `null` bị đọc thành `0` và giao diện vẽ một thước 0% cho một
  // thứ không có nguồn. Hai điều đó nói hai chuyện khác nhau.
  const { container } = render(<DaiTrangThai snapshot={snap({ context: null })} />);

  expect(container.querySelector('.thuoc')).toBeNull();
  expect(screen.getByText(/không đo được/i)).toBeDefined();
});

test('ngữ cảnh đo được BẰNG 0 vẫn vẽ thước', () => {
  const { container } = render(
    <DaiTrangThai
      snapshot={snap({ context: { tokens: 0, window: 128000, percent: 0 } })}
    />,
  );
  expect(container.querySelector('.thuoc')).not.toBeNull();
});

test('không có vai nào thì nói ra, không để dải trống', () => {
  render(<DaiTrangThai snapshot={snap({ agents: [], idle_agents: [] })} />);
  expect(screen.getByText(/không đo được|chưa có vai/i)).toBeDefined();
});
```

- [ ] **Bước 3: Chạy → FAIL**

- [ ] **Bước 4: Viết `DaiTrangThai.tsx`**

Yêu cầu bắt buộc, viết đúng những điều này:

- Nhận đúng một prop: `snapshot: Snapshot`.
- Dựng cây bằng `cayVai(snapshot.agents ?? [])`; vẽ lồng bằng `<ul>`/`<li>` (cấu trúc thật,
  không phải thụt lề bằng khoảng trắng — trình đọc màn hình cần cây thật).
- Vai chờ: một dòng `chờ: a · b · c` từ `snapshot.idle_agents`.
- Việc tồn: `pending_steer` (nếu khác rỗng) và `rewrite_reason`.
- Ngữ cảnh: `snapshot.context === null` → chữ `CHU.khongDoDuoc` với `title={GIAI_THICH.truongSongNull}`;
  ngược lại → `<div className="thuoc">` với bề rộng theo `percent`, kèm `tokens/window`.
- **Mọi trường sống phải kiểm `=== null` TRƯỚC khi đọc**, không dùng `?? 0`.
- Chữ hiển thị lấy từ `CHU`/`GIAI_THICH`; tên vai và tên tool là DỮ LIỆU, giữ nguyên.

- [ ] **Bước 5: Chạy → 4 passed**

- [ ] **Bước 6: Phép thử đột biến**

| # | Đột biến | Phải đỏ ở |
|---|---|---|
| 1 | `snapshot.context === null ? … :` → `snapshot.context?.percent ?? 0` | "null hiện dấu KHÔNG ĐO ĐƯỢC" |
| 2 | `cayVai(agents)` → `agents.map(v => ({vai: v, con: []}))` | "vẽ cây vai" (mất lồng) |

- [ ] **Bước 7: Commit**

```bash
git add web/components/DaiTrangThai.tsx web/components/DaiTrangThai.test.tsx web/lib/nhan.ts
git commit -m "feat(web): dải trạng thái với cây vai và ngữ cảnh"
```

---

### Task 12: Luật đổi dải theo `dangChay`

**Tệp:**
- Tạo: `web/components/BuongLai.tsx` (khung tối thiểu), `web/components/BuongLai.test.tsx`

- [ ] **Bước 1: Viết bài kiểm đỏ**

```tsx
// web/components/BuongLai.test.tsx — chỉ canh LUẬT ĐỔI DẢI ở Task này
test('đang chạy → hiện dải trạng thái, KHÔNG hiện dải việc tiếp theo', () => { … });
test('máy nghỉ → hiện dải việc tiếp theo, KHÔNG hiện dải trạng thái', () => { … });
```

Dùng `container.querySelector('.daitrangthai')` và `.viectieptheo` để phân biệt. Người thi
hành viết đầy đủ hai bài này theo mẫu của Task 11 (hàm `snap` dùng lại được — tách nó ra
`web/components/mau.test-helper.ts` nếu cần dùng ở hai tệp).

- [ ] **Bước 2: Chạy → FAIL**

- [ ] **Bước 3: Viết khung `BuongLai.tsx`**

Ở Task này chỉ cần khung đủ để hai bài trên xanh: một `<div className="buonglai">` chứa
`{dangChay ? <DaiTrangThai …/> : <ViecTiepTheo …/>}`. Lưới ba cột đầy đủ ở Task 13.

Chú thích bắt buộc ghi vào tệp:

```
Vì sao đổi dải chứ không hiện cả hai: lúc máy nghỉ KHÔNG CÓ GÌ đang chảy để xem, và câu người
dùng mang theo lúc đó là "giờ tôi làm gì" — đúng câu `ViecTiepTheo` trả lời. Lúc máy chạy thì
ngược lại: câu là "nó đang làm gì", và một dải "việc tiếp theo" lúc đó là mời người dùng bấm
một nút thứ hai trong khi một lượt đang tiêu tiền.
```

- [ ] **Bước 4: Chạy → 2 passed**

- [ ] **Bước 5: Commit**

---

## Cụm D — vỏ, lưới, cột phải (T13–T16)

### Task 13: Lưới ba cột, tách khỏi `page.tsx`

**Tệp:**
- Sửa: `web/components/BuongLai.tsx`
- Sửa: `web/app/page.tsx`

- [ ] **Bước 1: Chuyển thân `Canvas` từ `page.tsx` sang `BuongLai.tsx`**

Giữ NGUYÊN mọi chú thích đang có trong `Canvas` — chúng ghi lý do của bộ lọc phạm vi, của
tiêu đề bảng, và của dải việc tiếp theo. `page.tsx` sau bước này chỉ còn định tuyến khu và
case `default` trả `<BuongLai …/>`.

- [ ] **Bước 2: Dựng lưới**

```
grid-template-columns: 194px minmax(0, 1fr) 312px;
grid-template-rows: auto 1fr;
areas: 'dai dai dai' / 'trai giua phai'
```

Cột giữa chia bốn hàng `auto 2fr 1fr auto`:
1. dải trục mảnh (`<Truc …/>`, ~30px)
2. `<VanSong …/>` — **2fr**
3. dòng sự kiện thu gọn — **1fr**
4. `<OCanThiep …/>` ghim đáy

Tỉ lệ 2:1 là phép ĐO, không phải cảm giác: khu chữ máy đổi **146/254 khung**, dòng sự kiện
đổi **5 lần** trong cùng 17,9 giây. Ghi con số đó vào chú thích cạnh `grid-template-rows`.

Bảng chương chi tiết + nhật ký phán quyết cuộn tiếp trong cột giữa, DƯỚI dòng sự kiện.

- [ ] **Bước 3: Cổng** — `npm test && npx tsc --noEmit && npm run build`

- [ ] **Bước 4: Commit**

---

### Task 14: CSS + hai điểm gãy

**Tệp:** `web/app/globals.css`

- [ ] Lưới buồng lái, `.vansong`, `.vsthan` (`overflow-y: auto`), `.vach`, `.vecuoi`,
      `.daitrangthai`, cây vai.
- [ ] `.chu` — `white-space: pre-wrap`, `font-family` mono, `overflow-wrap: anywhere`
      (một dòng JSON dài không được đẩy tràn ngang cả cột).
- [ ] `@media (max-width: 1240px)` — bỏ cột phải, giữ dải + cột giữa.
- [ ] `@media (max-width: 860px)` — dải xếp hai hàng.
- [ ] Màu: chỉ dùng token đang có. `--ink-3` là sàn cứng, không hạ. Một màu tín hiệu duy
      nhất (vàng) — luật 5 của `PRODUCT.md`.
- [ ] Kiểm: 0 tràn ngang ở 1440 và 390; tương phản AA cho mọi phần tử có chữ.

---

### Task 15: Cột phải hai chế độ

**Tệp:** `web/components/Inspector.tsx` + test

- [ ] Chưa chọn chương → **ngữ cảnh truyện**: chương `●▶○` · nhân vật · tiền đề.
- [ ] Đã chọn chương → chi tiết chương (ba tab hiện có) + nút `← danh sách` đặt lại về chế độ
      ngữ cảnh truyện.
- [ ] KHÔNG mở cột thứ tư.
- [ ] Bài kiểm: (a) không có `chuongChon` → thấy tiền đề, không thấy tab; (b) có `chuongChon`
      → thấy tab, thấy nút quay lại; (c) bấm nút quay lại → về chế độ ngữ cảnh.

Giữ nguyên chú thích hiện có về việc tab không dùng transition ẩn/hiện.

---

### Task 16: Cổng cuối + E2E trên cuốn THẬT

- [ ] `go build ./...` · `go vet ./...` · `gofmt -l` rỗng · `go test -count=1 ./...` → **30
      gói / 0 FAIL** (delta so nền, không phải "xanh hết")
- [ ] `cd web && npm test && npx tsc --noEmit && npm run build`
- [ ] Dựng binary mới, chạy `serve --web web/out` với `HOME` cách ly, mở một cuốn THẬT và chạy:

| # | Việc | Bằng chứng phải thu |
|---|---|---|
| 1 | mở cuốn đang chạy | chữ chảy mượt; đo khoảng cách giữa các lần DOM đổi, trung vị phải ở hàng chục ms chứ không phải 700ms |
| 2 | hai tab cùng lúc | cả hai đủ chữ, so byte |
| 3 | đóng tab mở lại giữa lượt | thấy CẢ đoạn đang chảy, không phải nửa cuối câu |
| 4 | cuộn lên | tự cuộn dừng; bấm "về cuối" thì chạy lại |
| 5 | dừng engine | khu văn sống giữ báo cáo lượt cuối, tiêu đề đổi sang "Máy đang nghỉ" |
| 6 | tải lại trang | URL giữ đúng `tp` + `ch` + `khu` |
| 7 | chụp 1440 + 390 | 0 tràn ngang |

**Không dùng `seed-demo`.** Nó đã hai lần để lỗi sống sót vì giàu hơn đường thật.

- [ ] Gộp về `feat/viet-hoa-i18n` bằng `--ff-only`, và **kiểm `git merge-base` trước khi
      gộp** — subagent commit trên base cũ làm rơi commit, đã đo được ở dự án này.
- [ ] Sau khi gộp, chạy LẠI toàn bộ cổng **trên cây đã gộp**. Cổng xanh trong worktree không
      chứng minh gì về cây đã gộp — đã đo: 0 FAIL trong worktree, 8 FAIL sau khi gộp.

---

## Nhật ký thi hành

Người thi hành ghi vào đây: kết quả phép thử đột biến từng cụm, lỗ hổng phát hiện được, và
mọi chỗ kế hoạch này SAI. Kế hoạch sai là chuyện bình thường; giấu chuyện đó mới không.

---

### Cụm A (Task 1–5) — thi hành xong

**Phép thử đột biến, Task 4** (mã sản xuất bị sửa, chạy `lib/vanSong.test.ts`, rồi hoàn nguyên):

| # | Đột biến | Kết quả | Bài kiểm bắt được |
|---|---|---|---|
| 1 | `luot.slice(luot.length - SO_LUOT_GIU)` → `luot.slice(0, SO_LUOT_GIU)` | ĐỎ | "quá SO_LUOT_GIU lượt thì bỏ lượt CŨ NHẤT" |
| 2 | `luot.length > 1` → `luot.length > 0` | ĐỎ | "MỘT lượt vượt trần thì không xóa sạch" |
| 3 | `chu.slice(chu.length - CO_TOI_DA)` → `chu.slice(0, CO_TOI_DA)` | **XANH — LỖ HỔNG** | không bài nào |
| 4 | `moLuot` bỏ nhánh lượt-rỗng | ĐỎ | "hai lệnh xóa liền nhau không để lại lượt rỗng" |
| 5 (thêm) | `themChu`: `cuoi.chu + chu` → `chu` | ĐỎ | "mẩu kế tiếp nối vào lượt hiện tại" |
| 6 (thêm) | `themChu` bỏ `if (!chu) return bd;` | **XANH — LỖ HỔNG** | không bài nào |

**Lỗ hổng 3 — bài kiểm của chính kế hoạch này không canh được điều nó nói mình canh.**
Bài "MỘT lượt vượt trần thì không xóa sạch — cắt từ ĐẦU lượt đó" dựng chuỗi bằng
`'y'.repeat(CO_TOI_DA + 5000)`, tức MỘT ký tự lặp lại. Cắt đầu và cắt cuối cho ra hai chuỗi
KHÁC NHAU nhưng cả hai đều `endsWith('y')` và đều đúng độ dài, nên khẳng định "giữ phần CUỐI"
trong bài đó không đo được gì. Bịt bằng bài mới **"cắt một lượt quá trần phải bỏ phần ĐẦU,
giữ phần CUỐI"**: chuỗi có đầu và cuối phân biệt được. Đã chạy lại đột biến 3 sau khi bịt → ĐỎ.

**Lỗ hổng 6 — một nhánh phòng thủ không có bài kiểm nào.** Bỏ `if (!chu) return bd;` thì cả bộ
vẫn xanh, trong khi hệ quả là thật: mẩu rỗng mở một lượt TRỐNG, rồi `moLuot` kế tiếp gắn nhãn
vào đúng lượt trống đó (nhánh lượt-rỗng) thay vì mở lượt mới — vạch ngăn đầu tiên của phiên
xem bị dời lên trên một lượt chưa có chữ nào. Bịt bằng bài **"mẩu rỗng không mở lượt ma, và
không nuốt vạch ngăn kế tiếp"**. Chạy lại đột biến 6 → ĐỎ.

Task 1 cũng được thử đột biến dù kế hoạch không đòi, vì cái đỏ duy nhất của nó là "không
resolve được module" — thứ đó không chứng minh gì về từng khẳng định:
`typeof ev.seq !== 'number'` → `ev.seq == null` cho ĐỎ ở bài "seq không phải số";
`ev.seq <= mocSeq` → `<` cho ĐỎ ở bài "sự kiện cũ hoặc trùng bị bỏ".

**Chỗ kế hoạch sai hoặc thiếu:**

1. **Bài kiểm ở Task 4 không canh được hướng cắt** (lỗ hổng 3 ở trên). Số bài kiểm thực tế của
   `vanSong.test.ts` sau Task 5 là **14**, không phải 12 như kế hoạch ghi.
2. **Task 5 Bước 6 bảo `git add web/lib/nhan.ts`, nhưng Task 5 không sửa `nhan.ts`.** `nhanVach`
   chỉ ĐỌC `CHU.chuong` sẵn có. Không có nhãn mới nào cần thêm ở cụm này.
3. **`npm run build` KHÔNG chạy được trong worktree này, và không phải vì mã.** Turbopack (mặc
   định của Next 16) từ chối `web/node_modules` vì nó là symlink trỏ ra ngoài gốc dự án:
   `Symlink [project]/node_modules is invalid, it points out of the filesystem root`.
   Đã đo trên mã NỀN (stash hết thay đổi): hỏng y hệt → môi trường, không phải hồi quy.
   `npx next build --webpack` exit 0. Cổng "build exit 0" của các cụm sau cần biết điều này.
4. **`web/node_modules` KHÔNG nằm trong `.gitignore`** (`git check-ignore` không khớp), nên nó
   hiện ra là tệp chưa theo dõi. Một lệnh `git add -A` của bất kỳ ai sẽ nuốt 425MB vào commit.
5. `LOAI_SU_KIEN` sau khi tách không còn nơi dùng (chỉ còn là khai báo hợp đồng đầy đủ). Giữ
   nguyên theo kế hoạch, nhưng nó là mã chết cho tới khi có người dùng lại.
6. Chú thích đầu `internal/serve/web_chu_test.go:15` nói "`web/` cố ý không có bộ chạy test" —
   câu đó đã sai từ `61bc31e` (vitest được dựng ở đó), trước cụm này. Không sửa vì nằm ngoài
   phạm vi Task 1–5; ghi ra để người làm cụm sau nhặt.

**Cổng sau Task 5** (chạy toàn bộ, không lọc gói, không `-x`):
`go build` 0 · `go vet` 0 · `gofmt -l .` rỗng · `go test -count=1 ./...` **30 gói ok / 0 FAIL**
(đúng nền) · `npm test` **20/20** (nền 2/2) · `tsc --noEmit` 0 lỗi ·
`next build --webpack` exit 0 · `npm run build` exit 1 (Turbopack, xem mục 3).

---

### Cụm B (Task 6–9) — thi hành xong

**Commit** (nền = `15f59b4`):

| sha | tiêu đề |
|---|---|
| `3781a7c` | feat(web): ngưỡng bám đáy cho khu tự cuộn |
| `32be38c` | feat(web): khu văn sống vẽ lượt và vạch ngăn |
| `04a1a9f` | feat(web): tự cuộn khu văn sống, nhường người đang đọc lại |
| `d41311f` | test(web): canh ca máy nghỉ của khu văn sống |

#### LỖ HỔNG NẶNG NHẤT: bộ chạy `giaodien` không dọn DOM giữa hai bài kiểm

Không phải lỗi mã sản xuất — lỗi HẠ TẦNG KIỂM, và nó làm mọi bài kiểm component của cụm này
lẫn các cụm sau mất giá trị. `@testing-library/react` chỉ tự đăng ký `afterEach(cleanup)` khi
bộ chạy bật `globals: true`; `vitest.config.mts` cố ý không bật (mọi tệp kiểm `import` tường
minh). Hai lựa chọn đó gặp nhau ở một chỗ im lặng, và không ai được báo.

ĐO ĐƯỢC (hai bài cùng vẽ một `<p>dấu vết</p>` rồi đếm): bài thứ hai thấy **2** phần tử.

Nó nói dối theo CẢ HAI chiều, và chiều thứ hai mới đắt:
- `getByText` gặp hai bản của cùng một chữ → ĐỎ với "Found multiple elements", đỏ ở một bài
  vô can. Đây là cách nó lộ ra: bài "vạch ngăn hiện nhãn" của Task 7 đỏ vì bài Task 7 TRƯỚC
  nó để lại đúng cái vạch đó trong `document`.
- `getByRole('button', …)` **XANH nhờ cái nút bài trước để lại**. Tức toàn bộ bộ kiểm nút
  "về cuối" của Task 8 có thể xanh mà không cần nút nào được vẽ. Bắt được là do may.

Bịt bằng `web/vitest.setup.giaodien.ts` + `setupFiles` cho project `giaodien` (không lặp
`afterEach(cleanup)` từng tệp: quên một tệp là im lặng trở lại, và không bộ canh nào bắt).
**Cụm C và D thừa hưởng bản đã bịt — đừng gỡ.**

#### Phép thử đột biến — Task 6 (`lib/tuCuon.ts`)

Kế hoạch không đòi. Vẫn làm, vì cái đỏ duy nhất của Task 6 là "không resolve được module".

| # | Đột biến | Kết quả | Bài kiểm bắt được |
|---|---|---|---|
| 1 | `<= LE_DAY` → `< LE_DAY` | **XANH — LỖ HỔNG** | không bài nào |
| 2 | `LE_DAY = 24` → `LE_DAY = 0` | **XANH — LỖ HỔNG** | không bài nào |
| 3 | bỏ `- v.clientHeight` | ĐỎ | 3/4 bài |
| 4 | `<=` → `>=` | ĐỎ | cả 4 bài |
| 5 (thêm) | `LE_DAY = 24` → `600` | ĐỎ | "cuộn lên quá ngưỡng thì KHÔNG còn bám đáy" |

**Lỗ hổng 2 — cùng lớp với lỗ hổng `'y'.repeat(…)` của cụm A: bài kiểm đo cái nó tự sinh ra.**
Bài "lệch trong ngưỡng vẫn coi là bám đáy" dựng đầu vào bằng `900 - LE_DAY + 1`, tức đầu vào
TRÔI THEO chính hằng số đang được đo. Đặt `LE_DAY = 0` thì nó vẫn xanh — trong khi lúc đó
ngưỡng không tha một lệch nào, đúng thứ nó sinh ra để tha, và chú thích của chính nó nói khu
sẽ "rớt khỏi chế độ tự cuộn ngay nhịp đầu". Ba trong bốn bài của kế hoạch đều dựng đầu vào từ
`LE_DAY`. Bịt bằng bài dùng lệch **viết thẳng** (`scrollTop: 899`).
**Lỗ hổng 1** bịt bằng bài chốt mốc `lệch === LE_DAY → true`. Chạy lại 1 và 2 → ĐỎ.

#### Phép thử đột biến — Task 7 (`components/VanSong.tsx`)

Kế hoạch không có bảng cho Task 7. Bảng này là của tôi.

| # | Đột biến | Kết quả | Bài kiểm bắt được |
|---|---|---|---|
| 1 | bỏ chốt `i > 0` (vẽ vạch cả ở lượt đầu) | **XANH — LỖ HỔNG** | không bài nào |
| 2 | bỏ chốt `l.nhan` (vạch rỗng) | **XANH — LỖ HỔNG** | không bài nào |
| 3 | `key={l.id}` → `key={i}` | **XANH — LỖ HỔNG** | không bài nào |
| 4 | bỏ nhánh bộ đệm rỗng | ĐỎ | "bộ đệm rỗng nói ra là chưa có gì" |
| 5 | `<pre>` không vẽ `l.chu` | ĐỎ | "vẽ chữ của mọi lượt đang giữ" |
| 6 | `aria-label` → câu trạng thái | **XANH — LỖ HỔNG** | không bài nào |

**Lỗ hổng 1 — lại là một bài kiểm của kế hoạch không canh được điều nó tự nói.** Bài tên
"vạch ngăn hiện nhãn của lượt, **và lượt đầu KHÔNG có vạch**" dựng bộ đệm mà lượt đầu có
`nhan === undefined`, nên chốt `i > 0` không hề tham gia: bỏ hẳn chốt đó vẫn ra đúng một vạch.
Chốt ấy chỉ làm việc ở ca bộ đệm ĐÃ CHẠM TRẦN — lượt cũ nhất bị bỏ và lượt đứng đầu bây giờ
mang nhãn của chính nó. Bịt bằng bài dựng bộ đệm `SO_LUOT_GIU + 1` lượt (`boDemDaCat()`), có
kèm `expect(bd.luot[0]!.nhan).toBeDefined()` để bài này không lặng lẽ trôi về đo nhầm ca.

**Lỗ hổng 3 — chú thích của `LuotVan.id` khẳng định một điều mà không gì giữ.** Nó nói key
theo chỉ số làm React giữ nguyên nút DOM khi lượt cũ nhất bị bỏ, "một cú nhảy vị trí ngay giữa
lúc đọc". Bịt bằng bài so DANH TÍNH nút DOM qua hai lần vẽ: sau khi trần cắt, `.chu[0]` mới
phải LÀ `.chu[1]` cũ.

**Lỗ hổng 6 là chỗ tôi lệch khỏi kế hoạch, xem mục "kế hoạch sai" số 1 dưới đây.**

Cả bốn: chạy lại sau khi bịt → ĐỎ.

#### Phép thử đột biến — Task 8 (bảng của kế hoạch + của tôi)

| # | Đột biến | Kết quả | Bài kiểm bắt được |
|---|---|---|---|
| KH-1 | bỏ `if (!bamDayRef.current) return;` | ĐỎ | "chữ mới KHÔNG kéo màn hình" |
| KH-2 | `dangODay(el)` → `true` cố định | ĐỎ | 3 bài |
| KH-3 | trong `veCuoi` bỏ `datBamDay(true)` | ĐỎ | "bấm về cuối thì nút biến mất" |
| R-4 (thêm) | `dangODay(el)` → `false` cố định | ĐỎ | "đang bám đáy thì KHÔNG hiện nút" |
| R-5 (thêm) | deps `[boDem]` → `[]` | **XANH — LỖ HỔNG** | không bài nào |
| R-6 (thêm) | bỏ hẳn thân effect tự cuộn | **XANH — LỖ HỔNG** | không bài nào |
| R-7 (thêm) | `useState(true)` → `useState(false)` | **XANH — LỖ HỔNG** | không bài nào |
| R-8 (thêm) | bỏ `onScroll` | ĐỎ | 3 bài |

**Lỗ hổng 5 và 6 là lỗ hổng lớn nhất của cụm này: bảng của kế hoạch chỉ canh chiều NGHỊCH của
tự cuộn.** Bốn bài của Task 8 hỏi "đã cuộn lên thì đừng kéo màn hình" và "nút hiện/biến đúng
lúc" — không bài nào hỏi tự cuộn CÓ CHẠY không. Hệ quả đo được: **xóa sạch thân effect tự
cuộn, tức bỏ hẳn tính năng mà spec §2 gọi là thứ duy nhất chạy liên tục, vẫn xanh 11/11.**
Bịt bằng bài "đang bám đáy thì chữ mới KÉO màn hình xuống theo" (nới `scrollHeight` rồi đòi
`scrollTop` đi theo).

**Lỗ hổng 7:** ba bài về nút đều bắn một sự kiện cuộn trước khi hỏi, nên không bài nào chạm
trạng thái ĐẦU. Đặt nhầm nó thành `false` thì nút "về cuối" hiện ngay lúc mở khu — trên một
khu chưa cuộn đi đâu, đúng cái "nút không làm gì" mà bài `tuCuon` thứ tư nói tới. Bịt bằng bài
hỏi thẳng lúc vừa gắn, chưa cuộn lần nào.

Cả ba: chạy lại sau khi bịt → ĐỎ.

#### Task 9 — cả hai bài XANH ngay lần chạy đầu

Kế hoạch đã lường trước và bảo phải nói ra thay vì giả vờ. Nói ra: **Task 9 không đổi một dòng
mã sản xuất nào.** Task 7 đã vẽ đúng nhánh, và câu cho ca nghỉ đã được viết lại ngay ở Task 7
(xem "kế hoạch sai" số 2).

Nhưng xanh sẵn KHÔNG có nghĩa là thừa, và phép thử đột biến là cách trả lời điều đó bằng số:

| # | Đột biến | Kết quả | Bài kiểm bắt được |
|---|---|---|---|
| T9-1 | tiêu đề luôn `Máy đang nói` | ĐỎ | 2 bài — trong đó 1 của Task 7 (trùng lặp) |
| T9-2 | ca rỗng luôn dùng câu "đang chờ chữ" | ĐỎ | **chỉ** bài Task 9 |
| T9-3 | máy nghỉ thì vứt chữ trong bộ đệm | ĐỎ | **chỉ** bài Task 9 |

Hai trong ba đột biến chỉ hai bài đó bắt được, nên Task 9 có thêm phòng thủ thật.

#### Chỗ kế hoạch sai hoặc thiếu

1. **`aria-label` của khu văn sống trong Task 7 lặp lại lỗi mà repo đã trả giá một lần.**
   Kế hoạch viết `<section aria-label={CHU.mayDangNoi}>` trong khi `<h2>` ngay bên trong cũng
   là `CHU.mayDangNoi` — và chú thích của `CHU.vttVung` đã ghi chính xác hệ quả: "trình đọc
   đọc tên vùng rồi đọc lại y nguyên câu đó ở nội dung… tên vùng phải giữ nguyên khi trạng
   thái đổi". Ở đây còn nặng hơn dải "việc tiếp theo": khi máy nghỉ, tên vùng thành SAI hẳn
   (vùng tên "Máy đang nói" chứa tiêu đề "Máy đang nghỉ"). Đã lệch khỏi kế hoạch: thêm
   `CHU.vanSongVung = 'Văn sống'` làm tên vùng đứng yên, và một bài kiểm chốt nó (nếu không
   thì đây chỉ là một ý kiến không ai canh).
2. **`GIAI_THICH.vanSongNghi` của kế hoạch nói dối ở đúng ca nó hiện ra.** Câu kế hoạch cho là
   *"Đây là báo cáo của lượt vừa xong. Bấm Chạy ở thanh dưới để máy viết tiếp."* — nhưng nó
   nằm TRONG nhánh `boDem.luot.length === 0`, tức nó chỉ hiện khi bộ đệm RỖNG, tức khi không
   có báo cáo nào để trỏ vào. (Ca "còn báo cáo" đi nhánh kia và vẽ chính chữ đó — đúng như
   spec §7.2 muốn.) Đã viết lại: *"Máy đang nghỉ, và phiên xem này chưa giữ được lượt nào để
   hiện lại. Bấm Chạy ở thanh dưới…"*, kèm cảnh báo "Mở máy" như `chayTiepOThanhDuoi` đã có.
   Vẫn khớp `/bấm chạy ở thanh dưới/i` mà bài kiểm Task 9 đòi — **lưu ý cho cụm sau: đừng
   chèn `▶` vào giữa "Bấm" và "Chạy" ở chuỗi này**, bài kiểm đó khớp chuỗi liền.
3. **Task 8 thiếu bài canh chiều thuận của tự cuộn** (lỗ hổng R-5/R-6 ở trên). Số bài kiểm
   thực tế của `VanSong.test.tsx` sau Task 9 là **15**, không phải 7 như kế hoạch ghi ở Task 8
   bước 4.
4. **Ba giả định jsdom mà kế hoạch đã thăm dò trước đều ĐÚNG** — `scrollTop` lưu được,
   `fireEvent.scroll` kích hoạt `onScroll`, gán `scrollTop = scrollHeight` ăn. Không phải chỗ
   sai; ghi ra vì nó tiết kiệm thật và cụm sau nên tin bảng đó.
5. **Mục 3 và 4 trong nhật ký của CỤM A giờ không còn đúng, và cùng một nguyên nhân gốc.**
   `web/node_modules` bây giờ là thư mục THẬT (không còn symlink), nên:
   - `npm run build` (Turbopack, mặc định) **exit 0** — không cần `--webpack` nữa;
   - `web/node_modules` **CÓ** bị bỏ qua: `git check-ignore -v` trỏ `web/.gitignore:8`.
     Lý do cụm A thấy ngược nhiều khả năng là mẫu `node_modules/` có gạch chéo cuối nên chỉ
     khớp THƯ MỤC, mà lúc đó nó là symlink. Cảnh báo "một lệnh `git add -A` sẽ nuốt 425MB"
     không còn hiệu lực.
6. Mục 6 của cụm A (chú thích `internal/serve/web_chu_test.go`) đã được chính cụm A sửa ở
   `15f59b4`. Không còn việc để nhặt.
7. **Ngoài phạm vi, để lại cho cụm sau:** `VanSong.tsx` dùng tám lớp CSS chưa tồn tại
   (`.vansong .vshead .vsthan .vstrong .luot .vach .chu .vecuoi`) — `app/globals.css` không có
   lớp nào trong số đó. Đúng theo bảng tệp của kế hoạch (globals.css thuộc cụm khác), nhưng
   nghĩa là khu này CHƯA cuộn được trên trình duyệt thật: `.vsthan` cần `overflow-y: auto` và
   một chiều cao có hạn, nếu không thì `dangODay` luôn thấy `scrollHeight === clientHeight` và
   tự cuộn thành vô nghĩa. Bài kiểm không bắt được điều đó vì jsdom không bố cục.

#### Quyết định tự đưa ra vì kế hoạch không nói

- **Đặt bộ dọn DOM ở `setupFiles` chứ không ở từng tệp kiểm**, và không bật `globals: true`
  (bật là đi ngược lối import tường minh của cả repo).
- **`CHU.veCuoi` viết thường** ('về cuối'): nó là nút hành động nhỏ nổi trong khu chữ, không
  phải nhãn của một vùng.
- **Không tự thêm CSS** cho tám lớp trên — `app/globals.css` nằm ở cụm khác trong bảng tệp,
  và sửa nó ở đây là mời một va chạm với phiên đang chạy song song. Đã ghi ở mục 7.

**Cổng sau Task 9** (chạy toàn bộ, không lọc gói, không `-x`):
`go build` exit 0 · `go vet` exit 0 · `gofmt -l .` rỗng · `go test -count=1 ./...`
**30 gói ok / 0 FAIL** (đúng nền) · `npm test` **42/42** (nền sau cụm A: 20/20) ·
`tsc --noEmit` exit 0 · `npm run build` **exit 0** (Turbopack, xem mục 5).

---

### Cụm C (Task 10–12) — thi hành xong

**Commit** (nền = `aaec673`):

| sha | tiêu đề |
|---|---|
| `815553a` | feat(web): dựng cây vai từ danh sách phẳng có depth |
| `5593413` | feat(web): dải trạng thái với cây vai và ngữ cảnh |
| `919db2b` | feat(web): khung buồng lái đổi dải theo trạng thái máy |

#### Phép thử đột biến — Task 10 (`lib/vaiTro.ts`)

Hai dòng đầu là bảng của kế hoạch; năm dòng sau là của tôi.

| # | Đột biến | Kết quả | Bài kiểm bắt được |
|---|---|---|---|
| KH-1 | bỏ `ganNhat.length = bac + 1;` | **XANH — LỖ HỔNG** | không bài nào |
| KH-2 | bỏ nhánh `else goc.push(nut)` | ĐỎ | 4 bài |
| R-3 | bỏ vòng đi ngược lên, chỉ nhìn `ganNhat[bac - 1]` | **XANH — LỖ HỔNG** | không bài nào |
| R-4 | bỏ `ganNhat[bac] = nut;` | ĐỎ | 2 bài |
| R-5 | `Math.max(0, vai.depth)` → `vai.depth` | **XANH — LỖ HỔNG** | không bài nào |
| R-6 | mọi vai đều về gốc (bỏ lồng) | ĐỎ | 2 bài |
| R-7 | `goc.push` → `goc.unshift` (đảo thứ tự gốc) | ĐỎ | 1 bài |

**Lỗ hổng KH-1 — bảng của kế hoạch chỉ đúng một nửa: nó nói đột biến này phải đỏ ở bài "vai
depth 1 thành con của vai depth 0 ngay TRƯỚC nó", nhưng bài đó không chạm tới được.** Cắt bậc
chỉ có hiệu lực với vai tới SAU một vai nông hơn, mà cả năm bài của kế hoạch đều không có vai
nào đứng sau một vai nông. Bịt bằng bài `[writer 0, tool 1, sub 2, editor 0, phu 2]`: không
cắt bậc thì `phu` bị treo dưới `writer` qua một `tool` của nhánh đã đóng — giao diện khẳng
định Writer đang gọi một công cụ mà nó không gọi.

**Lỗ hổng R-3 — cùng lớp với lỗ hổng `'y'.repeat(…)` của cụm A và `LE_DAY` của cụm B: bài
kiểm dựng đầu vào ở đúng ca mà hai cách viết cho cùng kết quả.** Bài "vai mồ côi" dùng một vai
depth 3 KHÔNG có tổ tiên nào, nên nhìn một bậc hay đi ngược lên đều ra "vẽ ở gốc". Bịt bằng
`[writer 0, sub 2]`: có tổ tiên thì phải đứng dưới nó.

**Lỗ hổng R-5 — một nhánh phòng thủ không bài nào canh** (giống lỗ hổng 6 của cụm A). Hệ quả
rộng hơn vẻ ngoài: `bac = -1` làm `ganNhat.length = 0`, tức xóa sạch mọi mốc cha, và MỌI vai
lồng sau đó bị đẩy lên gốc. Bịt bằng `[la -1, con 1]`.

Cả ba: chạy lại sau khi bịt → ĐỎ. `lib/vaiTro.test.ts` có **8** bài, không phải 5.

#### Phép thử đột biến — Task 11 (`components/DaiTrangThai.tsx`)

Hai dòng đầu là bảng của kế hoạch; sáu dòng sau là của tôi. **Bảy trong tám đột biến XANH ở
lần chạy đầu** — bộ kiểm bốn bài của kế hoạch canh được đúng một điều.

| # | Đột biến | Kết quả | Bài kiểm bắt được |
|---|---|---|---|
| KH-1 | ngữ cảnh: `=== null` → `?? 0` (luôn vẽ thước) | ĐỎ | "ngữ cảnh null hiện dấu KHÔNG ĐO ĐƯỢC" |
| KH-2 | `cayVai(agents)` → `map` phẳng | **XANH — LỖ HỔNG** | không bài nào |
| R-3 | vai: gộp `null` vào nhánh rỗng | **XANH — LỖ HỔNG** | không bài nào |
| R-4 | vai chờ: bỏ hẳn nhánh `null` | **XANH — LỖ HỔNG** | không bài nào |
| R-5 | `turn !== undefined` → kiểm falsy | **XANH — LỖ HỔNG** | không bài nào |
| R-6 | bỏ kẹp 0–100 của thước | **XANH — LỖ HỔNG** | không bài nào |
| R-7 | bỏ `title` giải thích của dấu không-đo-được | **XANH — LỖ HỔNG** | không bài nào |
| R-8 | bỏ cặp `tokens/window` cạnh thước | **XANH — LỖ HỔNG** | không bài nào |

**Lỗ hổng KH-2 — bài "vẽ cây vai" của kế hoạch không canh cây.** Bốn khẳng định của nó đều
hỏi "chữ này có xuất hiện đâu đó không", mà `getByText` không biết gì về lồng nhau. Thay
`cayVai` bằng `map` phẳng vẫn xanh. Bịt bằng bài hỏi DOM: `.cayvai > li` đúng một, `.cayvai
li li` đúng một, và nó chứa `novel_context`.

**Lỗ hổng R-3 là lỗ hổng nặng nhất của cụm, vì nó nằm đúng chỗ cụm này tồn tại để giữ.** Không
bài nào của kế hoạch chạm tới nhánh `agents === null`: gộp `null` vào nhánh `[]` vẫn xanh cả
bộ. Nói cách khác, bộ kiểm của kế hoạch cho phép giao diện trả lời "engine đóng nên không
biết" bằng câu "engine mở, không ai chạy". Bịt bằng bài vẽ hai lần và đòi hai câu KHÁC nhau,
mỗi lần đều đòi câu kia vắng mặt. R-4 là cùng lỗ hổng đó ở `idle_agents`.

**Lỗ hổng R-5** — `turn: 0` là lượt đầu tiên, một tin thật; bài duy nhất có `turn` dùng số 7
nên không phân biệt được `!== undefined` với kiểm falsy. Cùng lớp với `advance_permit_chapter`
đã ghi ở `types.ts`.

**Lỗ hổng R-7** — dấu "không đo được" không có lời giải thích thì người vận hành không biết đó
là engine đóng hay studio hỏng. Bịt bằng khẳng định `title` trong bài R-3.

Cả bảy: chạy lại sau khi bịt → ĐỎ. `components/DaiTrangThai.test.tsx` có **9** bài, không phải 4.

#### Phép thử đột biến — Task 12 (`components/BuongLai.tsx`)

Kế hoạch không có bảng cho Task này. Bảng này là của tôi.

| # | Đột biến | Kết quả | Bài kiểm bắt được |
|---|---|---|---|
| R-1 | luôn vẽ dải trạng thái | ĐỎ | 2 bài |
| R-2 | luôn vẽ dải việc tiếp theo | ĐỎ | 1 bài |
| R-3 | đảo điều kiện | ĐỎ | cả 3 bài |
| R-4 | hiện CẢ HAI dải cùng lúc | ĐỎ | 2 bài |
| R-5 | nhét cứng `dangChay={true}` xuống dải việc tiếp theo | ĐỎ | "dải việc tiếp theo được cho biết máy đang NGHỈ" |
| R-6 | bỏ lớp `buonglai` của khung | **XANH — LỖ HỔNG** | không bài nào |
| R-7 | không truyền `song` xuống dải việc tiếp theo | **XANH — không bịt được, xem dưới** | không bài nào |

R-5 là bài thứ ba tôi thêm ngoài hai bài kế hoạch đòi: hai bài kia chỉ hỏi dải NÀO có mặt,
nên chúng vẫn xanh khi cờ truyền xuống bị nhét cứng — lúc đó dải nghỉ nói "Máy đang viết"
ngay dưới một transport đang đứng im. R-6 bịt bằng một khẳng định về lớp khung: hôm nay lớp
đó chưa làm gì, nhưng lưới của Task 13 và CSS của Task 14 đều bám vào tên đó.

**R-7 KHÔNG phải lỗ hổng bịt được, và lý do là một phát hiện về thiết kế** — xem mục 8 dưới đây.

#### Chỗ kế hoạch sai hoặc thiếu

1. **Bảng đột biến của Task 10 sai ở dòng 1** — xem lỗ hổng KH-1.
2. **Task 11 Bước 1 bảo thêm hai nhãn ĐÃ CÓ trong `CHU`:** `vaiDangChay` (khối "tổ sản xuất",
   dòng 877) và `nguCanh` (khối transport, dòng 969, đang được `Transport.tsx` dùng). Đáng ghi
   không phải vì trùng, mà vì **thứ bắt được là `tsc`, KHÔNG phải bộ kiểm**: khai trùng khóa
   trong một object literal là JavaScript hợp lệ (bản sau thắng), nên `npm test` xanh 59/59
   trong khi hai nhãn cùng tên sống song song. Đã bỏ hai khóa mới, dùng lại khóa cũ.
3. **Bài kiểm 1 của Task 11 đòi `/writer/` chữ thường.** Tên vai đi qua `nhanVai` như mọi chỗ
   khác trên trang (`ViecTiepTheo` đã làm thế), nên nó ra `Writer`. Đã lệch: bài kiểm đòi
   `/Writer/`. Để nguyên chữ thường ở dải này là để một trang hiện cùng một vai bằng hai cách
   viết, đúng thứ từ điển `nhan.ts` tồn tại để chặn.
4. **Bài kiểm 2 và 4 của Task 11 hỏng ngay với chính fixture của kế hoạch.** Fixture để mọi
   trường sống là `null`, nên câu "không đo được" xuất hiện ở nhiều ô và `getByText` đỏ vì
   "Found multiple elements" — đỏ vì một lý do không liên quan tới điều đang canh. Đã hỏi
   trong ô (`.dtngucanh`, `.dtvai`) thay vì hỏi cả dải.
5. **Biểu thức của bài kiểm 4 (`/không đo được|chưa có vai/i`) nhận CẢ HAI câu**, tức nó xanh
   kể cả khi giao diện gộp hai ca lại — đúng thứ cụm này tồn tại để chặn. Đã đổi thành: ô vai
   phải chứa câu "chưa có vai" VÀ không được chứa "không đo được".
6. **Task 11 Bước 4 tự mâu thuẫn:** nó bảo dựng cây bằng `cayVai(snapshot.agents ?? [])` rồi
   ba dòng sau bảo "mọi trường sống phải kiểm `=== null` TRƯỚC khi đọc, không dùng `?? 0`".
   Đã theo vế thứ hai: `?? []` ở đây biến "engine đóng" thành "không ai chạy".
7. **Task 12 bảo dùng `container.querySelector('.viectieptheo')` — lớp đó không tồn tại.**
   `ViecTiepTheo` đã có từ trước và lớp của nó là `vtt` (`app/globals.css` bám theo tên đó).
   Đã dùng `.vtt`; đổi tên lớp cho khớp kế hoạch là sửa CSS của một dải đang chạy được chỉ để
   một bài kiểm đọc đẹp hơn.
8. **Luật đổi dải làm khối `DangLam` bên trong `ViecTiepTheo` thành KHÔNG TỚI ĐƯỢC.** `DangLam`
   chỉ vẽ khi `dangChay`, mà dải đó chỉ hiện khi máy NGHỈ. Hệ quả: tham số `song` của
   `BuongLai` đi xuyên mà không ai đọc, và không bài kiểm nào phân biệt được — một giá trị
   không quan sát được thì không có phép đo nào chạm tới. Đã giữ tham số (Task 13 chuyển cả
   thân `Canvas` vào đây) và ghi rõ trong chú thích. Việc của `DangLam` ("ai · bước nào ·
   chương nào") giờ do `DaiTrangThai` làm, đầy đủ hơn — **người làm Task 13 nên quyết định
   dứt điểm: giữ `DangLam` như mã chết, hay bỏ nó cùng chú thích ghi lý do nó từng tồn tại.**
9. **Cây vai hôm nay LUÔN PHẲNG với dữ liệu thật, và đó là chuyện phía Go.** `host.AgentSnapshot`
   (`internal/host/events.go:147`) không có trường depth, nên `anhXaVai`
   (`internal/serve/snapshot.go:615`) gán cứng `Depth: 0` cho mọi vai. `cayVai` vẫn dựng theo
   hợp đồng JSON đã chốt (spec §6.1) chứ không theo cái server tạm gửi. Ngoài phạm vi cụm C
   (cụm này là web), nhưng **spec §7.2 vẽ `└ writer → novel_context` và điều đó chưa hiện ra
   được trên cuốn thật** — E2E của Task 16 sẽ thấy một cây một bậc, và đó không phải hồi quy.
10. **Spec §6.1 nói `pending_steer`: `"" = không có; null = không biết (engine đóng)` — hợp
    đồng thật không làm được thế.** `internal/serve/model.go:234` khai `omitempty`, nên chuỗi
    rỗng bị rụng khỏi JSON và trường này KHÔNG BAO GIỜ là `null`: hai ca "không có việc tồn"
    và "engine đóng" đến web y hệt nhau. Dải vì vậy không vẽ dấu "không đo được" cho việc tồn
    — vẽ là khẳng định một điều dữ liệu không nói. Ghi lại để ai sửa phía Go biết chỗ này.
11. **`context.percent` là 0–100, không phải 0–1.** TUI in thẳng bằng `%.0f%%`
    (`internal/entry/tui/layout.go:107`). Dùng `phanTram()` của `lib/dinhdang` ở đây sẽ cho
    "4100%" — hàm đó nhân 100. Không phải lỗi của kế hoạch, nhưng là cái bẫy đặt sẵn cho
    người vẽ lại thước này.

#### Quyết định tự đưa ra vì kế hoạch không nói

- **Fixture `components/mau.test-helper.ts` dựng đủ trường THẬT, không `{} as Snapshot[...]`.**
  Ép kiểu một object rỗng là đúng lớp lỗi mà `types.ts` và spec §6.1 ghi lại (kiểu nói dối →
  `tsc` xanh, mã đọc phải `undefined`), và nó cũng bỏ mất thứ fixture đáng lẽ cho không: ngày
  hợp đồng thêm một trường bắt buộc, bản dựng đủ ĐỎ ngay ở đây.
- **`idle_agents: []` thì KHÔNG vẽ dòng "chờ" nào; `null` thì vẽ dấu "không đo được".** Chỗ
  trống nói được "đã đo, không ai chờ" nhưng không nói được "không đo được".
- **Ô "việc tồn" không vẽ gì khi cả hai trường rỗng** — chúng không phải trường sống (mục 10).
- **Thước ngữ cảnh kẹp 0–100, con số in nguyên giá trị engine báo.** Kẹp là việc của hình vẽ;
  kẹp cả con số là giấu đi đúng cái bất thường đáng xem.
- **`BuongLai` chỉ nhận 5 tham số** (snapshot · dangChay · song · onChonKhu · onDocChuong) —
  đủ cho luật đổi dải. Bộ tham số đầy đủ của `Canvas` là việc của Task 13.
- **Không đụng `app/globals.css`** — tám lớp của cụm B cộng bảy lớp mới của dải
  (`.daitrangthai .dtvai .dtcho .dtton .dtngucanh .thuoc .kim .cayvai .khongdo …`) đều chưa có
  CSS. Đúng theo bảng tệp (globals.css thuộc Task 14), và cũng để tránh va chạm.

**Cổng sau Task 12** (chạy toàn bộ trong worktree, không lọc gói, không `-x`):
`go build` exit 0 · `go vet` exit 0 · `gofmt -l .` rỗng · `go test -count=1 ./...`
**30 gói ok / 0 FAIL** (đúng nền) · `npm test` **62/62** (nền sau cụm B: 42/42) ·
`tsc --noEmit` exit 0 · `npm run build` exit 0.

---

### Cụm D (Task 13–15) — thi hành xong

**Commit** (nền = `bd3682c`):

| sha | tiêu đề |
|---|---|
| `759f0c8` | feat(web): buồng lái nhận cả thân Canvas, page.tsx chỉ còn định tuyến khu |
| `f19ade2` | feat(web): lưới buồng lái, khu văn sống cuộn thật, hai điểm gãy |
| `5b76980` | feat(web): cột phải hai chế độ — ngữ cảnh truyện và chi tiết chương |

#### Phép thử đột biến — Task 13 (`BuongLai.tsx` + `page.tsx`)

Kế hoạch không có bảng cho Task này. Bảng này là của tôi.

| # | Đột biến | Kết quả | Bài kiểm bắt được |
|---|---|---|---|
| R-1 | `default` trả `null` thay vì `<BuongLai/>` | ĐỎ | 3 bài |
| R-2 | mọi khu về `<BuongLai/>` (bỏ `switch`) | ĐỎ | "khu KHÁC → không phải buồng lái" |
| R-3 | `page.tsx` truyền `BO_DEM_RONG` xuống `Khu` | **XANH — LỖ HỔNG** | không bài nào |
| R-4 | `BuongLai` dựng bộ đệm rỗng cho `VanSong` | ĐỎ | 2 bài |
| R-5 | `VanSong` luôn nhận `dangChay` | ĐỎ | "khu văn sống được cho biết máy đang chạy hay nghỉ" |
| R-6 | `OCanThiep` không nhận `dangChay` | ĐỎ | "ô can thiệp nói ra hệ quả đúng" |
| R-7 | bảng chương + nhật ký ra NGOÀI khu cuộn | ĐỎ | 2 bài |
| R-8 | đảo thứ tự khu văn sống và khu cuộn | ĐỎ | 5 bài |
| R-9 | bỏ khối cảnh báo | ĐỎ | "cảnh báo dữ liệu lệch hiện ra" |
| R-10 | luôn vẽ bộ chọn mức xem | ĐỎ | "cuốn KHÔNG phân tầng thì không có bộ chọn" |
| R-11 | đầu trang bỏ dòng mô tả | ĐỎ | "đầu trang nói tên cuốn, giai đoạn và số đo" |
| R-12 | `ViecTiepTheo` bỏ khối `DangLam` | ĐỎ | "máy chạy: dòng đang làm gì nói vai và bước" |

**Lỗ hổng R-3 — mắt cuối của sợi dây `vanSong` không có ai chạm tới.** Bộ kiểm mới của
Task 13 gọi thẳng `Khu`, nên tầng `Trang` — chỗ `vanSong={s.vanSong}` được nối — nằm ngoài
mọi bài kiểm; đổi nó thành một bộ đệm rỗng dựng tại chỗ vẫn xanh cả bộ. Hệ quả thật: khu đắt
nhất màn hình im lặng suốt lúc engine viết, không lỗi nào nổ ra, chỉ hiện câu "chưa có lượt
nào". Bịt bằng bài dựng CẢ `Trang` với `useStudio` và `useMay` bị thay (`app/page.test.tsx`).
Chạy lại R-3 sau khi bịt → ĐỎ.

Dựng `Trang` cần một mảnh vá jsdom: `Element.prototype.scrollIntoView` không tồn tại và
`Rail` gọi nó trong effect. Vá TẠI tệp kiểm đó chứ không ở `vitest.setup.giaodien.ts` — tệp
setup vá một lỗi làm MỌI bài kiểm nói dối, còn cái này chỉ chạm tới bài kiểm nào dựng `Rail`;
đặt vào setup chung là lặng lẽ tắt một hành vi cho cả bộ kiểm.

#### Phép thử đột biến — Task 15 (`Inspector.tsx`)

Kế hoạch không có bảng. Bảng này là của tôi. **12/12 ĐỎ, không lỗ hổng nào.**

| # | Đột biến | Kết quả | Bài kiểm bắt được |
|---|---|---|---|
| S-1 | bỏ `&& !xemNguCanh` (chế độ suy thẳng từ prop) | ĐỎ | 2 bài |
| S-2 | luôn ở chế độ ngữ cảnh | ĐỎ | 5 bài |
| S-3 | luôn ở chế độ chi tiết chương | ĐỎ | 7 bài |
| S-4 | `moChuong` không tắt chế độ ngữ cảnh | ĐỎ | "bấm ĐÚNG chương đang chọn không thành ngõ cụt" |
| S-5 | bỏ effect đặt lại theo `chuongChon` | ĐỎ | "đổi sang chương KHÁC ở nơi khác" |
| S-6 | vạch chương bỏ `title` | ĐỎ | 2 bài |
| S-7 | vạch chương bỏ ký hiệu `●▶○` | ĐỎ | "mỗi vạch mang CẢ ký hiệu lẫn chữ" |
| S-8 | gộp `null` và `[]` của nhân vật | ĐỎ | "nhân vật null nói khác nhân vật []" |
| S-9 | tên vùng đổi theo chế độ | ĐỎ | "tên vùng KHÔNG đổi theo chế độ" |
| S-10 | bỏ nút quay lại | ĐỎ | 4 bài |
| S-11 | tiền đề không được truyền xuống | ĐỎ | 2 bài |
| S-12 | hiện CẢ HAI chế độ cùng lúc | ĐỎ | "cột phải vẫn là MỘT cột" |

Hai bài đắt nhất ở đây là S-4 và S-5, và chúng canh cùng một thứ từ hai phía: đường lui
không được thành ngõ cụt. `chuongChon` do URL giữ, nên bấm lại ĐÚNG chương đang chọn không
đổi prop nào — nếu chế độ chỉ đặt lại theo prop thì nút trông bấm được mà không phản ứng.

#### Kiểm hình trên trình duyệt thật

Dựng `npm run build:mock`, phục vụ `web/out` tĩnh, mở Chromium qua Playwright.
Dùng bản mock vì kiểm hình cần dữ liệu có HÌNH DẠNG thật mà không cần engine; E2E trên cuốn
thật là Task 16 và **không** thay được bằng cái này.

| Việc | Kết quả |
|---|---|
| tràn ngang ở 1440×900 | **0** (`documentElement.scrollWidth - clientWidth`) |
| tràn ngang ở 390×844 | **0** |
| `.vsthan` cuộn thật ở 1440 | `clientHeight` 185 · `scrollHeight` 719 → **cuộn** |
| `.vsthan` cuộn thật ở 390 | `clientHeight` 371 · `scrollHeight` 1332 → **cuộn** |
| tự cuộn bám đáy | `scrollHeight - scrollTop - clientHeight` = **−0,5px** (trong ngưỡng `LE_DAY`) |
| cuộn lên → nút "về cuối" | hiện; bấm → `scrollTop` 640 = `scrollHeight − clientHeight` 639, nút biến mất |
| vạch ngăn khi `stream_clear` | 2 lượt · **1** vạch, chữ lượt trước còn nguyên |
| dưới 1240px cột phải biến mất | `.insp` → `display: none` |
| dưới 860px dải xếp hai hàng | **2** mốc `top` khác nhau cho ba ô |
| tương phản AA | **219 phần tử đo được · 0 vi phạm** ở 1440; **263 · 0** ở 390. Thấp nhất 4,66:1 |

Ảnh chụp:
`~/Personal/reclip/VideoCaptionerSystem/.playwright-mcp/buonglai-1440.png` ·
`~/Personal/reclip/VideoCaptionerSystem/.playwright-mcp/buonglai-390.png` ·
`…/buonglai-1440-ngucanh.png` (cột phải ở chế độ chi tiết chương).

**Phép đo tương phản đầu tiên của tôi VÔ GIÁ TRỊ, và đó là bài học đáng ghi nhất của mục
này.** Bản đầu đọc `getComputedStyle().color` bằng regex `rgb()`. Chrome trả màu viết bằng
oklch NGUYÊN DẠNG (`oklch(0.625 0.011 82)`), nên regex không khớp, mọi phần tử bị `continue`,
và hàm trả về **"0 vi phạm"** — một con số xanh mượt cho một phép đo không đo gì. Cùng lớp
lỗi với `'y'.repeat(…)` của cụm A và `LE_DAY` của cụm B, chỉ khác là lần này nó nằm trong
BỘ ĐO chứ trong bộ kiểm. Bản đúng ép màu qua canvas 1×1 rồi đọc pixel, và nó lập tức tìm ra
9 vi phạm thật.

#### Chỗ kế hoạch sai hoặc thiếu

1. **Lưới của Task 13 (`194px minmax(0,1fr) 312px`, areas `'dai dai dai' / 'trai giua phai'`)
   không phải lưới của `BuongLai` — đó là lưới ỨNG DỤNG, và nó đã tồn tại.** `.khung` ở
   `globals.css:99` đã là `194px 1fr 292px` với `'rail canvas insp'`; rail và inspector là
   anh em của buồng lái trong `page.tsx`, không phải con của nó. Dựng lại `trai`/`phai` bên
   trong `BuongLai` là dựng cột thứ tư và cột thứ năm. Đã thi hành: `.buonglai` là lưới HAI
   hàng trong ô `canvas` (`auto minmax(0,1fr)`), và bốn hàng `auto 2fr 1fr auto` nằm ở
   `.blgiua` — đúng chỗ tỉ lệ 2:1 có nghĩa.
2. **Spec §7.2 vẽ dải trạng thái trải qua CẢ cột phải (`'rail band band'`); ở đây nó chỉ
   trải hết cột giữa.** Đưa dải lên tầng `.khung` đòi `page.tsx` phải tự biết bề mặt nào có
   dải — tức trả lại cho `page.tsx` đúng việc Task 13 vừa lấy đi — và tách luật đổi dải ra
   khỏi component mang luật đó. Lệch có chủ ý, ghi ở đầu `BuongLai.tsx`.
3. **Cột phải giữ 292px, KHÔNG lên 312px như spec §7.2.** `dungInspector` chỉ trả `true` cho
   `dong-san-xuat`, nên con số này chỉ ảnh hưởng buồng lái và đổi nó là an toàn về kỹ thuật.
   Không đổi vì 292px được SÁU chú thích trong bốn tệp viện dẫn (`DESIGN.md:96`,
   `globals.css:110`, `page.tsx:66`, `BanDuyet.tsx:18` và `:31`, `KiemDinh.tsx:15`), trong đó
   hai chú thích ghi phép đo dựa trên chính bề rộng đó ("nó hẹp 292px MÀ vẫn cần tiêu đề
   riêng"). Đổi một con số để làm sai sáu câu, đổi lấy 20px mà không phép đo nào đòi.
4. **Task 13 Bước 2 bảo ghi con số 2:1 vào chú thích cạnh `grid-template-rows`, nhưng
   `grid-template-rows` là CSS, mà bảng tệp xếp `globals.css` vào Task 14.** Đã theo bảng
   tệp: Task 13 commit phần TSX, Task 14 commit lưới kèm con số. Sau commit Task 13 buồng lái
   chưa có hình.
5. **Kế hoạch không nói `Canvas` có một `<div style={{height:8}}/>` ở cuối** kèm chú thích
   "để hàng cuối bảng không dính vào transport". Lý do vẫn đúng nhưng thứ ở dưới đã đổi (giờ
   là ô can thiệp ghim đáy, không phải transport), nên nó thành `padding-bottom` của `.blcuon`
   và chú thích đi theo sang CSS.
6. **Bộ đo tương phản ban đầu đo nhầm** — xem mục "Kiểm hình" ở trên.

#### Lỗi tìm được ngoài phạm vi kế hoạch

7. **`.blk.done` vi phạm AA, và nó có từ trước cụm này.** `--tren-mau` trên
   `color-mix(teal 66%, panel)` chỉ đạt **4,0:1** — dưới sàn 4,5:1 của `PRODUCT.md` — và nó
   hỏng ở CHÍN phần tử cùng lúc (`.ky`/`.idx`/`.txt` của mỗi khối đã xong). Cả hai token lẫn
   luật đều không đổi ở cụm này; nó chỉ chưa từng được đo. Đã sửa 66% → **72%** (4,66:1), là
   đúng tỉ lệ mà `.nguoi .hang.h-core` đã dùng cho cùng cặp màu và đạt sàn. Phạm vi ảnh hưởng
   đúng bằng buồng lái: `.blk` chỉ do `Truc.tsx` vẽ, và `Truc` chỉ do `BuongLai` dựng.
8. **Ba fixture `web/fixtures/studio-*.json` chưa bao giờ được cập nhật theo hợp đồng của kế
   hoạch 1/4, và điều đó làm chế độ mock SẬP ngay khi buồng lái được dựng.** Năm trường sống
   (`agents`, `idle_agents`, `advance`, `context`, `in_progress_chapter`) VẮNG khóa hoàn toàn,
   nên chúng về `undefined` chứ không `null`, và `DaiTrangThai` — vốn kiểm `=== null` đúng
   theo hợp đồng — ném `Cannot read properties of undefined (reading 'length')`.
   **Đường THẬT không bị:** `internal/serve/model.go:227-237` khai bốn trường đầu KHÔNG
   `omitempty`, nên server luôn phát khóa với giá trị `null`. Đã sửa fixture (Trấn Yêu Ký =
   engine mở, đo được; hai cuốn kia = engine đóng, `null`) — chọn thế để mock che cả hai
   nhánh của luật null-khác-rỗng.
9. **`fixtures/events.json` không có mẩu `stream_delta`/`stream_clear` nào**, nên `dev:mock`
   hiện một khu văn sống vĩnh viễn trống — tức khu chịu lực nhất của bề mặt mới không xem
   được nếu không có engine. Đã thêm bốn mục (một `stream_clear` + ba `stream_delta` mang chữ
   đúng loại mà `sample.gif` đo được: đối số JSON, khế ước tự đối chiếu có ✓, bảng kiểm chất
   lượng, báo cáo chương). `DongGia` phát chúng qua đúng đường mà `useStudio` nghe.
10. **Ba nhãn `chuaChonChuongTieuDe`, `chuaChonChuong`, `tabChuaChonChuong` đã hết việc** khi
    cột phải có hai chế độ. Đã bỏ khóa, GIỮ bài học sinh ra chúng bằng một chú thích tại chỗ
    và một chú thích ở đầu `Inspector.tsx`.
11. **Một lần chạy `go test -count=1 ./...` cho 29 gói ok / 3 FAIL.** KHÔNG dựng lại được:
    bốn lần chạy sau đó đều 30 ok / 0 FAIL, và lần bất thường không bắt được tên gói. Ghi ra
    để người làm Task 16 biết mà chạy lại thay vì kết luận ngay có hồi quy.
12. **`web/out` chứa bản MOCK sau khi kiểm hình.** Đã dựng lại bằng `npm run build` (không
    mock) trước khi commit. Nó bị `.gitignore` bỏ qua nên không vào commit, nhưng Task 16 vẫn
    nên dựng lại từ đầu.

#### Quyết định tự đưa ra vì kế hoạch không nói

- **`DangLam` được GIỮ, và câu hỏi của cụm C được trả lời bằng một bài kiểm chứ bằng một ý
  kiến.** Ba lý do, theo thứ tự sức nặng: (1) `dangChay` điều khiển HAI thứ trong
  `ViecTiepTheo` — câu trạng thái (`trangThai()` có hai nhánh riêng cho ca đang chạy) và khối
  `DangLam`; bỏ riêng `DangLam` để lại một component phản ứng nửa vời với chính cờ của nó, và
  bỏ cho sạch thì phải bỏ cả nhánh `dangChay`, tức làm mất luôn thứ bài kiểm hiện có của
  `BuongLai` ("dải được cho biết máy đang NGHỈ") đang canh. (2) "Không tới được" là tính chất
  của NGƯỜI GỌI hôm nay, không phải của component; xóa nó là nướng luật đổi dải của `BuongLai`
  vào một component mà `BuongLai` chỉ tình cờ là người gọi duy nhất. (3) Mã chết đắt vì không
  ai đo được nó — nên tôi dựng `ViecTiepTheo.test.tsx` và đo nó ở ranh giới CỦA NÓ. Nhánh đó
  giờ có ba bài kiểm; nó chỉ không có người gọi. Đột biến R-12 xác nhận: bỏ `DangLam` → ĐỎ.
- **`song` vẫn đi xuyên `BuongLai` mà không quan sát được TỪ ĐÓ.** Cụm C đã thử và kết luận
  đúng; tôi không lặp lại. Phép đo của nó nằm ở tầng có đường ra màn hình.
- **Chế độ của cột phải là STATE của `Inspector`, không phải phép bỏ chọn ở `useStudio`.**
  `chuongChon` do URL giữ (`?ch=`), và đường lui không được xóa nó — tải lại trang phải về
  đúng chương đang xem. Nút "← danh sách chương" là một chế độ XEM.
- **`Khu` được export từ `page.tsx`** để bài kiểm gọi thẳng luật định tuyến mà không phải dựng
  `useStudio` (tức mạng). `Trang` vẫn là cửa duy nhất của ứng dụng.
- **Ô can thiệp THÔI ghim đáy dưới 860px.** Bản đầu để `position: sticky`. ĐO ĐƯỢC ở 390×844:
  thanh cao 98px đè lên đáy khu chữ — đúng chỗ chữ mới hiện ra và đúng chỗ tự cuộn vừa kéo
  tới — giấu 98/371 = 26% chiều cao khu đó. Đổi chỗ nó lên trên khu cuộn thì hết đè nhưng thứ
  tự DOM lệch thứ tự nhìn thấy, tức thứ tự Tab lệch, mà `PRODUCT.md` xếp bàn phím hạng nhất.
  Nên nó đi theo dòng chảy.
- **`.bltruc` có `max-height: 120px` + cuộn riêng.** Kế hoạch gọi đây là "dải trục mảnh ~30px"
  nhưng `Truc` là widget lane đầy đủ: một cuốn phân tầng cho ba lane cộng chú giải ≈ 171px, và
  toàn bộ phần thừa đó lấy thẳng từ khu chữ. Trần giữ nguyên mọi lane thay vì cắt bỏ lane nào
  — bỏ lane tập/cung là bỏ Design Principle 1.
- **Mọi khối `auto` của buồng lái nén hơn khối cùng loại ở bề mặt khác.** ĐO ĐƯỢC ở 1440×900
  (cột giữa 802px) với bản chưa nén: đầu trang 55 · dải 124 · cảnh báo 92 · trục 131 · ô can
  thiệp 143 = 545px, để lại 257px cho hai hàng `fr` — khu chữ được **169px**, đúng 21% chiều
  cao của một bề mặt tồn tại để xem chữ chảy. Sau khi nén: 458px, khu chữ **229px** (316px ở
  cuốn không có cảnh báo). Riêng ô can thiệp: 143 → 98 bằng cách xếp tiêu đề và ô nhập trên
  cùng một hàng.
- **Câu giải thích của ô can thiệp kẹp HAI dòng, không phải một.** Bản đầu kẹp một dòng và ở
  1440px nó cắt đúng chỗ đang giải thích vì sao ô nhập bị vô hiệu. `.loiDoc` KHÔNG bị kẹp:
  câu lỗi bị cắt là thứ `PRODUCT.md` cấm.
- **Dải `●▶○` của cột phải TRÙNG dữ liệu với lane chương ở cột giữa, và đó là chủ ý:** lane
  kia vẽ hình dạng cả cuốn theo tỉ lệ, dải này là một danh sách CHỌN ĐƯỢC ngay cạnh chỗ chi
  tiết sẽ hiện ra.
- **Thước ngữ cảnh của dải mang vạch đỏ ở mốc 85%**, cùng mốc mà `DESIGN.md` đặt cho thanh
  transport. Vẽ bằng `background-image` chứ bằng một phần tử: mốc là thuộc tính của cái thước,
  không phải dữ liệu mà component phải tính rồi truyền xuống.
- **`Trang` được dựng trong bài kiểm bằng cách thay `useStudio`/`useMay`**, không phải bằng
  cách giả lập `fetch`: bài kiểm ở tầng đó canh việc NỐI DÂY, và một `useStudio` thật biến nó
  thành bài kiểm về khả năng giả lập `fetch` + `EventSource` của jsdom.

**Cổng sau Task 15** (chạy toàn bộ trong worktree, không lọc gói, không `-x`):
`go build` exit 0 · `go vet` exit 0 · `gofmt -l .` rỗng · `go test -count=1 ./...`
**30 gói ok / 0 FAIL** (đúng nền; xem mục 11 về một lần bất thường không dựng lại được) ·
`npm test` **91/91** (nền sau cụm C: 62/62) · `tsc --noEmit` exit 0 · `npm run build` exit 0.
