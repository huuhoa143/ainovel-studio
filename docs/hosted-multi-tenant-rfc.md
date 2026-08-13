# RFC: Bản hosted nhiều người dùng — Firebase Auth, store trên Postgres, phiên tách rời

> Trạng thái: **bản phác, chưa chốt** (2026-08-13). Quyết định đã có: (1) `internal/store`
> viết lại sang PostgreSQL; (2) khách tự mang khóa API (BYOK); (3) **bỏ hẳn** bản store trên
> tệp — một implementation duy nhất, Postgres. Cái giá của (1)+(3) — mất đường merge với
> upstream, và Postgres thành phụ thuộc bắt buộc cả khi chạy local — đã được cân và chấp nhận;
> mục 9 nói cách trả cái giá đó cho gọn nhất.
>
> Liên quan: `internal/serve/rao.go` (hàng rào ghi), `internal/serve/engine.go` (một slot),
> `internal/store/khoa.go` (khóa liên tiến-trình), `docs/architecture.md`.

## 0. Câu hỏi mà bản này trả lời

Không phải "lưu ở đâu" — mà **"vì sao hai người dùng không đụng nhau"**. Ba lớp trả lời ba
phần khác nhau của câu đó, và gộp chúng lại là lỗi thiết kế đầu tiên phải tránh:

| Lớp | Chặn cái gì | Bằng gì |
|---|---|---|
| Danh tính | người lạ mạo danh người khác | Firebase Auth → phiên do gateway ký |
| Dữ liệu | truy vấn thiếu `WHERE` làm rò cuốn của người khác | `user_id` ở mọi bảng **+ RLS của Postgres** |
| Thi hành | một lượt chạy làm hỏng lượt chạy của người khác | **một process một người đang hoạt động** |

Postgres chỉ trả lời lớp giữa. Lớp dưới cùng là lý do bản này dài.

## 1. Hai mặt phẳng

**Control plane** — service mới, `cmd/ainovel-gateway`, KHÔNG nằm trong `internal/serve`:

- verify Firebase ID token (JWKS, cache khóa công khai), ánh xạ `firebase_uid` → `users.id`
- phát phiên ngắn hạn của **chính nó** (JWT ký bằng khóa server). Không để `internal/serve`
  biết Firebase là gì — xem mục 8 về lý do open source
- định tuyến một phiên tới một worker, giữ vòng đời worker
- hạn mức đĩa/số cuốn, thu hồi phiên bỏ hoang

**Data plane** — `ainovel-cli serve` với store trên Postgres. Worker **stateless**: không giữ
gì trên đĩa cục bộ, nên nó bị giết và dựng lại lúc nào cũng được. Đây là món quà thật của
việc đưa store vào Postgres, và mục 2 tiêu đúng vào nó.

## 2. Tách phiên: một process một người, không phải một process nhiều người

`soToiDa: 1` (`internal/serve/engine.go:70`) — engine mở đúng một cuốn mỗi process, và engine
chạy TRONG process của studio. Có hai đường đi:

**(i) Một container một phiên đang hoạt động.** Không sửa mô hình đồng thời của engine.
**(ii) Nới `soToiDa`, khóa mọi thứ theo `user_id`.** Chú thích ở `engine.go:49` nói map được
dựng sẵn hình dạng cho việc nới này, nên nó không phải chuyện bất khả.

**Chọn (i).** Ba lý do, theo thứ tự sức nặng:

1. Engine chạy **hàng giờ đến hàng ngày**. Một `panic` trong process dùng chung giết luôn
   mọi lượt chạy đang dở của mọi người — mỗi lượt là nhiều giờ compute mà khách đã trả tiền
   (BYOK). Bán kính thiệt hại của (ii) không tương xứng với cái nó tiết kiệm.
2. `engine.go:251` ghi một ca đã đo được: một cuốn chết **giữ luôn cái slot duy nhất** và
   studio coi như hỏng. Ở (ii) ca đó thành một người làm hỏng studio của tất cả.
3. Store đã ở Postgres nên container là vỏ rỗng. Cái đắt của "một container một người"
   thường là dữ liệu dính vào máy — mà đó đúng là thứ vừa bị bỏ đi.

Cái phải trả cho (i) là RAM theo phiên **đang hoạt động** (không phải theo người đăng ký), cộng
một bộ điều phối vòng đời. Đổi lại: cách ly ở mức kernel, không phải ở mức "mọi truy vấn đều
đúng".

> Nới `soToiDa` vẫn nên làm, nhưng để cho **một người mở hai cuốn**, không phải để nhồi hai
> người vào một process.

## 3. Viết lại store: bộ test hiện có LÀ bản đặc tả

Đây là mục quan trọng nhất của RFC. Làm sai thứ tự ở đây là cách duy nhất để việc này thất bại.

Đích cuối là **một** implementation (Postgres). Nhưng đường đi tới đó vẫn phải đi qua hai bản
cùng tồn tại một thời gian — không phải vì muốn giữ bản tệp, mà vì nó là **giàn giáo kiểm
chứng** duy nhất ta có.

**Phase 0 — bóc interface, không đổi hành vi.** Tách `internal/store` thành interface + bản
hiện tại trên tệp. Zero thay đổi hành vi, toàn bộ test xanh nguyên trạng.

**Phase 1 — bản Postgres phải qua ĐÚNG bộ test đó.** Biến các test store hiện có thành
**contract test** chạy hai lần: một lần trên bản tệp, một lần trên bản Postgres. Mọi
`_test.go` đang dựng store thật trên thư mục tạm — đó không phải trở ngại, đó là tài sản:
chúng là đặc tả hành vi đã được viết ra, và chúng chưa từng được dùng để kiểm một
implementation thứ hai.

**Phase 1b — xóa bản tệp.** Khi contract test xanh trên cả hai, bản tệp hết việc: xóa nó, giữ
lại bộ contract test (giờ chỉ chạy trên Postgres). Giàn giáo tháo sau khi nhà đứng, không phải
trước.

Bỏ Phase 1 để "đi cho nhanh" là biến câu "engine vẫn chạy đúng không" thành câu trả lời bằng
cảm giác. Có nó thì nó là câu trả lời bằng `go test ./...` — và đó là lý do bản tệp phải sống
thêm đúng một phase nữa chứ không chết ngay từ đầu.

## 4. Bốn cái bẫy của việc chuyển sang Postgres

### 4.1. `seq` của SSE: `bigserial` có lỗ nhìn thấy được — đây là bug thật, không phải lo xa

Hiện `Seq` tăng đơn điệu trong `meta/runtime/queue.jsonl`, SSE đọc `LoadQueueAfter(seq)`, và
`Seq` map thẳng sang `Last-Event-ID` để client nối lại không bỏ sót.

Thay bằng `bigserial` là gài một lỗi khó thấy: `bigserial` cấp số **lúc INSERT**, không phải
lúc COMMIT. Giao dịch lấy `seq=5` có thể commit SAU giao dịch lấy `seq=6`. Client vừa đọc tới
`6` sẽ hỏi `> 6` và **mất vĩnh viễn event 5** — không có lỗi nào nổi lên, chỉ là giao diện
thiếu một dòng.

Cách đúng: cấp `seq` **trong cùng giao dịch, theo từng cuốn**:

```sql
UPDATE books SET event_seq = event_seq + 1 WHERE id = $1 RETURNING event_seq;
```

Nó serialize theo cuốn (đúng cái ta muốn — mỗi cuốn một dòng sự kiện), và vì `seq` được cấp
dưới khóa hàng của chính cuốn đó, không có lỗ nào nhìn thấy được nữa.

### 4.2. Khóa liên tiến-trình: advisory lock **tốt hơn** khóa tệp hiện tại

`store.Khoa()` (`internal/store/khoa.go:60`) ghi `meta/studio.lock` mang PID. Nhược điểm đã
biết và có trong README: khóa **mồ côi** khi process chết bất thường, và người dùng phải đi
xóa tệp bằng tay.

`pg_try_advisory_lock(book_id)` gắn với **connection**. Connection chết là khóa tự rơi. Ca
"khóa mồ côi" biến mất chứ không được xử lý — đây là chỗ việc viết lại trả lại lãi.

### 4.3. Giao dịch = biên checkpoint (lãi thứ hai)

Hiện checkpoint ghi sau mỗi tool, và một lần sập giữa lúc ghi nhiều tệp có thể để lại trạng
thái nửa vời. Gói "kết quả tool + biến đổi trạng thái + checkpoint" vào **một** giao dịch thì
khôi phục thành nguyên tử theo định nghĩa: hoặc bước đó có, hoặc nó chưa từng xảy ra. Lời hứa
"khôi phục chính xác tới bước plan/draft/check/commit" được nâng từ *cẩn thận* lên *bất biến*.

### 4.4. Đừng bê nguyên hình dạng tệp vào bảng

`outline.json`, `characters.json`, `world_rules.json`, `foreshadow_ledger.json` nên vào `jsonb`
(chúng được đọc/ghi cả khối, và schema còn đổi theo upstream). Nhưng `chapters`, `drafts`,
`events`, `checkpoints`, `usage` phải là **bảng thật** — chúng được truy vấn theo chương, theo
seq, theo vai/model, và nhét chúng vào một `jsonb` khổng lồ là dựng lại đúng cái ràng buộc mà
việc rời hệ tệp lẽ ra đã tháo.

## 5. Sơ đồ bảng (phác)

```
-- control plane
users(id, firebase_uid UNIQUE, email, status, created_at)
user_secrets(user_id, provider, api_key_ct BYTEA, dek_id, updated_at)   -- mục 7
sessions(id, user_id, worker_id, state, started_at, expires_at)
quotas(user_id, max_books, max_bytes, used_bytes)
workers(id, host, capacity, state, heartbeat_at)

-- data plane, MỌI bảng mang user_id
books(id, user_id, dir_name, name, phase, flow, event_seq BIGINT, created_at,
      UNIQUE(user_id, dir_name))
progress(book_id, ...)                       -- meta/progress.json
chapters(book_id, n, title, content, status, words, PRIMARY KEY(book_id, n))
drafts(book_id, n, kind, content)            -- *.draft.md / *.plan.json
events(book_id, seq, kind, category, agent, summary, payload jsonb, occurred_at,
      PRIMARY KEY(book_id, seq))             -- queue.jsonl; seq → Last-Event-ID
checkpoints(book_id, seq, step, payload jsonb, occurred_at)
snapshots(book_id, key, payload jsonb)
decisions(book_id, seq, kind, reason, payload jsonb, occurred_at)   -- nhật ký Arbiter
usage(book_id, role, model, tokens_in, tokens_out, cost_usd, occurred_at)
docs(book_id, kind, payload jsonb)           -- outline/characters/world/foreshadow
```

**RLS là hàng rào thứ hai, không phải trang trí.** App đặt `SET LOCAL app.user_id` mỗi giao
dịch; policy buộc `user_id = current_setting('app.user_id')::uuid`. Nhờ đó một truy vấn thiếu
`WHERE user_id = ...` **không** rò được cuốn của người khác. Cả mục tiêu của bản hosted này là
"không đụng chạm nhau", nên nó phải là tính chất cấu trúc, đừng để nó phụ thuộc vào việc mọi
truy vấn đều được viết đúng mãi mãi.

## 6. Hàng rào ghi: đổi từ tin-địa-chỉ sang tin-phiên

`rao.go` hiện từ chối đường ghi khi địa chỉ lắng nghe không phải loopback, và `kiemNguonGoc`
đòi `Host` là máy cục bộ. Chú thích của chính nó nói vì sao: *"người dùng đã chọn không có mật
khẩu, nên hàng rào địa chỉ chính là thứ thay cho việc xác thực"*.

Khi đã có xác thực thật thì hàng rào đó **có thứ thay thế chính đáng** — đây là sửa đúng chủ
đích, không phải nới lỏng:

```
--auth-mode=loopback   (mặc định, hành vi HIỆN TẠI, không đổi một byte)
--auth-mode=session    (mới: tin phiên đã ký thay cho địa chỉ)
```

Ở `session`: đòi phiên hợp lệ do gateway ký, **giữ nguyên** header `X-Ainovel-Studio` chống
CSRF, và `Origin` phải khớp origin công khai đã cấu hình. Ba phép kiểm, không phải một.

Mặc định phải giữ **y nguyên** — bản chạy local một người là đường sống của dự án open source,
và nó cũng là thứ bộ test hiện có đang canh.

> Không bao giờ giải bằng cách cho nginx giả `Host: 127.0.0.1`. Nó chạy được, không cần sửa
> code, và nó vô hiệu lớp chống DNS rebinding mà không để lại dấu vết nào trong code cho người
> đọc sau.

## 7. BYOK: hai rủi ro, một cái ít ai nghĩ tới

**7.1. Custody.** Khóa của khách vào `user_secrets.api_key_ct` dưới **envelope encryption**
(DEK theo user, KEK ở KMS/khóa server ngoài DB). Giải mã chỉ trong RAM của worker, đúng thời
gian một lượt chạy. Không log, không đưa vào trace. `cheKhoa()` trong `rao.go` đã che khi trả
về API — giữ nguyên, đừng để bản hosted làm nó yếu đi.

**7.2. SSRF qua Base URL — cái này mới là chỗ dễ mất máy.** Cấu hình cho người dùng đặt **Base
URL**, và `internal/serve/models_list.go:255` gắn `Authorization: Bearer` rồi phát yêu cầu ra
địa chỉ đó. Trên máy của chính mình thì vô hại. Trên server của bạn, một khách đặt base URL
thành `http://169.254.169.254/...` là biến worker của bạn thành đầu đọc metadata của cloud, và
họ còn tự chọn được header đi kèm.

Bắt buộc, trước khi mở BYOK ra công khai: allowlist scheme `https`, phân giải DNS rồi **chặn**
loopback / link-local / RFC1918 / IPv6 tương ứng, chặn redirect sang các dải đó, và đặt
timeout. Đây là điều kiện để mở, không phải phần tăng cường.

## 8. Firebase và mục tiêu open source

Người self-host không nên bị buộc dựng một Firebase project để chạy dự án của bạn. Nên
Firebase chỉ được xuất hiện trong **gateway**, sau một interface:

```go
type XacThuc interface {
    Kiem(ctx context.Context, token string) (DanhTinh, error)
}
```

Bản Firebase là một implementation; một bản OIDC chung và một bản "single user, không auth"
(cho bản local) là hai bản còn lại. Nếu `internal/serve` biết tới Firebase thì bạn vừa phát
hành một dự án open source chỉ chạy được trên hạ tầng của chính bạn.

## 9. Cái giá của "một implementation" và cách trả cho gọn

Quyết định là **bỏ hẳn** bản trên tệp. Đổi lại có hai thứ thật, và cả hai đều nên được nói ra
trước khi bắt tay chứ không phát hiện ở phase 3:

**9.1. Postgres thành phụ thuộc bắt buộc, kể cả để viết chương đầu tiên.** Hôm nay
`ainovel-cli` là một nhị phân tĩnh, `install.sh` xong là chạy. Sau việc này, người dùng local
phải có một Postgres trước khi làm được bất cứ gì. Phần *Bắt đầu nhanh* và *Docker* trong
README đổi bản chất: `docker run` một container thành `docker compose` hai service. TUI dù
đang đóng băng cũng đi qua store, nên nó cũng cần DB — đây là thay đổi thấy được với người
đang dùng.

**9.2. Merge upstream mất, nhưng đừng để nó lan.** Vẫn nên giữ đường khâu:

- interface store ở `internal/store`, bản Postgres ở package riêng `internal/store/pg`
- engine và `internal/serve` **chỉ** biết interface, không biết SQL

Không phải để merge được nữa — mà để lần sau upstream đổi *hình dạng dữ liệu*, bạn sửa một
package chứ không sửa cả tầng sự thật. Và để cái ngày bạn muốn thêm lại một bản nhẹ (SQLite
cho bản local, chẳng hạn) thì chỗ cắm đã có sẵn.

## 10. Chạy local và chạy test — chỗ chịu tác động nặng nhất

Đây là hệ quả trực tiếp của 9.1, và nó cần một quyết định tường minh chứ không để rơi:

**Local**: `docker compose up` (app + `postgres:16-alpine`), migration tự chạy lúc khởi động.
Vẫn là **một lệnh**, nên "tiện" không mất — nhưng nó là một lệnh *Docker*, không còn là một nhị
phân. Người muốn `go run` thuần phải tự trỏ `DATABASE_URL` vào một Postgres của họ.

**Test**: mọi test store giờ cần DB sống. Hai đường, nên chọn (i):

- **(i) testcontainers-go** — mỗi lần `go test` tự dựng một Postgres dùng một lần. Không cần
  người đóng góp cài gì ngoài Docker, và CI không cần cấu hình service riêng. Đổi lại: test
  chậm hơn, và **bắt buộc có Docker** mới chạy được `go test ./...`.
- (ii) service container trong CI + `DATABASE_URL` khi chạy tay. Nhanh hơn, nhưng người mới
  clone repo về sẽ thấy test đỏ và không hiểu tại sao.

Đi kèm, bắt buộc: **transaction rollback per test** hoặc schema riêng mỗi test. Dùng chung một
database mà không cách ly là tự tạo test đỏ ngẫu nhiên (flaky) — và một bộ test flaky ở đúng
tầng sự thật thì tệ hơn không có test, vì nó dạy người ta bỏ qua màu đỏ.

## 11. Thứ tự thi hành

| Phase | Việc | Xong nghĩa là |
|---|---|---|
| 0 | bóc interface store | mọi test xanh, hành vi không đổi |
| 1 | `internal/store/pg` + testcontainers | **cùng** bộ contract test xanh trên cả hai bản |
| 1b | xóa bản trên tệp, đổi README/compose/`install.sh` | một implementation, `docker compose up` là chạy |
| 2 | `--auth-mode=session` + gateway, một người | đăng nhập Firebase, chạy được một cuốn qua web |
| 3 | worker theo phiên + vòng đời + hạn mức | hai người chạy đồng thời, không thấy nhau |
| 4 | BYOK: custody + chặn SSRF (mục 7) | **điều kiện để mở công khai** |
| 5 | quan sát: usage theo user, thu hồi phiên chết | vận hành được mà không phải ssh vào xem |

Phase 4 không phải phần cuối cho đẹp — trước nó thì **không mở ra internet**.

Phase 1b có một phần dễ bị bỏ sót: nó là phase **sửa tài liệu và đường cài**, không chỉ xóa
code. Bỏ bản tệp mà để README vẫn dạy `install.sh` rồi `ainovel-cli` là phát hành một hướng dẫn
chạy không nổi.

## 12. Những câu chưa trả lời

- **Chương dài + `jsonb`/`text`**: một cuốn 300 chương là bao nhiêu MB thật trong Postgres, và
  ngưỡng nào thì `TOAST` bắt đầu ảnh hưởng nhịp đọc của studio? Cần đo, không đoán.
- **Dòng sự kiện lúc cao điểm**: `events` là bảng ghi nhiều nhất. Cần chính sách cắt/nén theo
  tuổi, nếu không nó thành bảng lớn nhất DB trong một tháng.
- **Hạn mức đĩa → hạn mức hàng**: bỏ hệ tệp thì "quota theo byte" không còn tự nhiên. Đo theo
  gì: số cuốn, số chương, hay `pg_total_relation_size` theo user?
- **Bản local cần Postgres — đã chốt** (mục 9.1). Còn phải quyết: có ship sẵn một
  `docker-compose.yml` "một lệnh là chạy" làm đường cài **chính thức** trong README hay không,
  và `install.sh` hiện tại sẽ thành cái gì (đổi thành bản kéo compose, hay bỏ).
- **Backup thành nghĩa vụ mới**: khi dữ liệu ở đĩa của người dùng thì mất là lỗi của họ. Khi
  nó ở DB của bạn thì mất là lỗi của bạn. `pg_dump` định kỳ + kiểm thử **phục hồi** (không chỉ
  kiểm thử sao lưu) phải có trước khi mời người thật vào.
