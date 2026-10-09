# Thiết kế cache prompt: phối hợp ba tầng litellm / agentcore / ainovel

> **2026-10-08 — chỉ còn app desktop.** TUI và headless đã gỡ. Chỗ nào bên dưới nhắc panel cache của TUI là mô tả lúc viết; thiết kế cache không đổi.

> Bài này là một tài liệu giảng giải: giới thiệu cách chúng tôi thiết kế cache prompt LLM
> (prompt caching) đầu-cuối trên ba repo phối hợp, gồm nguyên lý thiết kế, ca tra lỗi thật và các vị trí mã nguồn đối chiếu được.
>
> - **litellm** — cổng LLM: dịch giao thức và khai báo năng lực
> - **agentcore** — framework Agent: chỗ đặt cache và danh tính cache
> - **ainovel-cli** — tầng ứng dụng: một dòng cấu hình là tiếp vào (codebot cũng vậy)

---

## 1. Vì sao đáng làm: mô hình chi phí và một ca thật

Request của hệ thống Agent có một đặc điểm về cấu trúc: **mỗi lượt request đều mang theo toàn bộ lịch sử**. Một vòng lặp tool 30 lượt thì
body của request ở lượt 30 chứa toàn bộ tin nhắn của 29 lượt trước. Không cache thì cùng những byte tiền tố đó bị tính tiền lặp đi lặp lại.

Giá cache của hai hãng lớn (lấy Anthropic làm ví dụ):

| Mục | So với giá đầu vào thường |
|---|---|
| Ghi cache (TTL 5 phút) | 1,25x |
| Ghi cache (TTL 1 giờ) | 2x |
| **Đọc cache** | **0,1x (tiết kiệm 90%)** |

Ca thật: một lần sinh tiểu thuyết dài 33 chương đốt mất $58, phân tích `meta/usage.json` sau đó phát hiện
**tỉ lệ trúng cache tổng thể chỉ 8,5%** (coordinator chỉ 2,7%, architect là 0). Sau khi so từng request theo
chuỗi usage (input vs cache_read) thì định vị được ba nguyên nhân gốc:

1. **Byte tools dao động**: Description/Schema của tool subagent mỗi lượt dựng lại bằng cách duyệt trực tiếp map của Go,
   thứ tự ngẫu nhiên → body request khác lượt trước ngay từ byte thứ 0 → cache tiền tố mất hiệu lực toàn bộ;
2. **Không có ái lực định tuyến**: dòng OpenAI không gửi `prompt_cache_key`, những request giống nhau từng byte cũng có thể bị
   cân bằng tải sang một instance không có cache (chứng cứ sắt: trong 33 phiên, các request đầu tiên giống nhau từng byte chỉ trúng 12);
3. **Dòng Claude không có điểm ngắt nào**: Anthropic là cache tường minh, không đóng điểm ngắt `cache_control` = hoàn toàn không có cache.

Ba nguyên nhân gốc này ứng với ba khối thiết kế dưới đây: **kỷ luật ổn định tiền tố**, **danh tính cache**, **điều phối điểm ngắt**.

---

## 2. Kiến thức nền: mô hình tư duy của hai giao thức cache

### 2.1 OpenAI: cache tiền tố tự động (ngầm)

- Phía server tự cache tiền tố **≥1024 token**, không cần client khai báo;
- Phần trúng tăng theo hạt canh 128-token;
- Request có thể mang `prompt_cache_key` (trường chính thức) để tạo **ái lực định tuyến** — các request cùng key thì cố gắng rơi vào
  cùng một phân đoạn cache;
- Trong usage, `cached_tokens` báo lượng trúng; **việc ghi cache thì không bao giờ được báo lên** (`cache_write` luôn bằng 0
  là hiện tượng bình thường, không phải bug).

### 2.2 Anthropic: điểm ngắt tường minh (cache_control)

- Client đóng điểm ngắt `cache_control` trên một khối nội dung, **điểm ngắt bao phủ mọi thứ trước nó**
  (thứ tự cố định là tools → system → messages);
- Mỗi request **nhiều nhất 4 điểm ngắt**;
- Giá ghi 1,25x (5m) / 2x (1h), giá đọc 0,1x;
- `cache_control` **không được đóng trên khối thinking** (sẽ bị 400 từ chối).

### 2.3 Tiền đề chung

Dù ngầm hay tường minh, cache đều chỉ nhận **tiền tố bằng nhau ở mức byte**. Nên nền móng của mọi thiết kế là đúng một câu:

> **Sắp toàn bộ request theo tần suất thay đổi từ thấp lên cao: cái tĩnh đặt trước nhất, cái động đặt sau cùng,
> và phần lịch sử đã gửi thì không được đổi một byte nào.**

---

## 3. Kiến trúc tổng thể: phân việc ba tầng

```
┌────────────────────────────────────────────────────────┐
│ Tầng ứng dụng (ainovel-cli / codebot)                  │
│   Quyết "danh tính cache" lấy giá trị gì:              │
│   một sách một nền, một vai một tên                    │
│   Chi phí tiếp vào = hai dòng cấu hình mỗi agent       │
├────────────────────────────────────────────────────────┤
│ agentcore (framework Agent)                            │
│   Quyết "đặt điểm ngắt ở đâu, key phái sinh khi nào":  │
│   sàn system + đỉnh cuộn ở tin nhắn cuối;              │
│   spawn thì nối #seq; gác theo năng lực provider,      │
│   không hỗ trợ thì bỏ im lặng                          │
├────────────────────────────────────────────────────────┤
│ litellm (cổng LLM)                                     │
│   Dịch giao thức thuần: cache_control ↔ trường của     │
│   từng hãng, truyền xuyên prompt_cache_key,            │
│   khai báo Capabilities                                │
│   Không ra bất kỳ quyết định "có cache hay không"      │
└────────────────────────────────────────────────────────┘
```

Nguyên tắc chia: **litellm chỉ trả lời "endpoint này hỗ trợ những gì", agentcore chỉ trả lời "điểm cache đặt ở đâu",
tầng ứng dụng chỉ trả lời "danh tính là gì"**. Mỗi tầng kiểm thử riêng được, đổi ứng dụng khác (codebot dùng lại cùng bộ
agentcore/litellm) thì không phải viết lại logic cache.

---

## 4. Nền móng: ba kỷ luật ổn định byte tiền tố

Điều kiện tiên quyết để cache có lợi là byte tiền tố ổn định. Ba kỷ luật, mỗi cái ứng với một sự cố thật.

### Kỷ luật một: việc tuần tự hóa tools buộc phải tất định ở mức byte

Sự cố: tool `subagent` nhúng danh sách agent đã đăng ký vào Description/Schema của chính nó, mà danh sách thì đến từ
việc duyệt map của Go — mỗi lời gọi một thứ tự ngẫu nhiên, byte tools mỗi lượt một khác, nên tỉ lệ trúng của coordinator chỉ 2,7%.
(Nhóm Claude Code cũng bị đúng vấn đề này cắn: cả fleet của họ từng vì thế mà trả thêm 10,2% cho việc ghi cache.)

Khắc phục (agentcore `subagent/subagent.go`):

```go
// sortedAgentNames returns registered agent names in deterministic order.
// Description and Schema are rebuilt on every LLM call; iterating the map
// directly would shuffle their bytes across requests and defeat provider
// prefix caching (tools serialize into the cached prompt prefix).
func (t *Tool) sortedAgentNames() []string {
	return slices.Sorted(maps.Keys(t.agents))
}
```

> Dạng tổng quát của bài học: **bất kỳ tập hợp nào đi vào body request thì buộc phải sắp xếp trước khi tuần tự hóa**. Việc
> Go ngẫu nhiên hóa phép duyệt map sẽ giấu con bug này rất sâu — tính năng hoàn toàn bình thường, chỉ hóa đơn là bất thường.

### Kỷ luật hai: lịch sử buộc phải append-only (nén thì phải "nộp")

Sự cố: chiến lược nén ngữ cảnh của writer là "phép chiếu" (mỗi lời gọi thì tạm viết lại view của lịch sử, nhưng không
rơi lại vào baseline). Một khi vượt ngưỡng thì **mỗi lượt lại viết lại toàn bộ tiền tố** → mỗi lượt miss toàn phần.

Khắc phục: chiếu xong thì nộp (`CommitOnProject: true`), để việc viết lại chỉ xảy ra một lần, sau đó trở lại
append-only, cho tới lần vượt ngưỡng sau.

> Dạng tổng quát: nén ngữ cảnh là **một lần đứt có kế hoạch** (reset tiền tố, trả giá đầy đủ một lần),
> chuyện đó không sao; cái không chấp nhận được là **mỗi lượt đều đứt**. Nén thì hoặc đừng làm, hoặc làm xong thì cố định lại.

### Kỷ luật ba: nội dung động đi vào phần đuôi

Những thứ đổi mỗi lượt (phong bì trạng thái thế giới, phần nhắc mỗi lượt, kết quả tool mới nhất) chỉ được phép **nối vào đuôi tin nhắn**,
tuyệt đối không quay lại sửa phần giữa. Phong bì `novel_context` của ainovel chính là thiết kế nối-vào-đuôi — nó đổi ở mỗi chương,
nhưng nó đổi thì không ảnh hưởng cache của mấy trăm nghìn token phía trước.

---

## 5. Danh tính cache: một sách một nền, một vai một tên, một phiên một khóa

`prompt_cache_key` của dòng OpenAI giải quyết **vấn đề định tuyến**: request giống nhau từng byte mà bị cân bằng tải sang
instance khác thì vẫn miss. Mục tiêu thiết kế của key là "các request thuộc cùng một huyết mạch cache thì luôn mang cùng một key".

Ba cấp danh tính của chúng tôi (ainovel `internal/agents/build.go`):

```go
// promptCacheBase phái sinh một băm ngắn ổn định từ thư mục sách, làm tiền tố
// danh tính cache prompt: cùng một cuốn sách thì dùng chung xô định tuyến xuyên
// các lần khởi động lại process, và không để lộ đường dẫn cục bộ cho provider.
// Hậu tố vai do bên gọi nối vào; subagent mỗi lần spawn còn nối thêm "#seq"
// (một phiên một khóa).
func promptCacheBase(bookDir string) string {
	sum := sha256.Sum256([]byte(bookDir))
	return "nvl-" + hex.EncodeToString(sum[:6])
}
```

Tầng ứng dụng tiếp vào chỉ là hai dòng cho mỗi agent:

```go
writer := subagent.Config{
	// ...
	CacheLastMessage: "ephemeral",                // công tắc điểm ngắt của Claude (xem §6)
	PromptCacheKey:   cacheBase + "-writer",      // danh tính định tuyến OpenAI (cấp vai)
}
// coordinator (Agent tầng đỉnh) cũng vậy:
agentcore.WithCacheLastMessage("ephemeral"),
agentcore.WithPromptCacheKey(cacheBase+"-coordinator"),
```

Cấp thứ ba (cấp phiên) do agentcore tự phái sinh — mỗi lần spawn một phiên mới là một huyết mạch
cache mới (agentcore `subagent/subagent.go`):

```go
runSeq := t.runSeq.Add(1)

// One conversation, one cache key: suffix the per-run sequence so each
// spawn forms its own cache lineage instead of piling every run of this
// agent into a single routing bucket.
promptCacheKey := cfg.PromptCacheKey
if promptCacheKey != "" {
	promptCacheKey = fmt.Sprintf("%s#%d", promptCacheKey, runSeq)
}
```

Hình thái cuối: `nvl-a1b2c3-writer#17` = cuốn sách này, vai writer, phiên của lần spawn thứ 17.

> Vì sao không phải một key toàn cục? Các phiên khác nhau thì tiền tố khác nhau, trộn vào cùng một xô định tuyến sẽ pha loãng phần trúng.
> Vì sao không mang dấu thời gian/số ngẫu nhiên? key buộc phải **ổn định xuyên các request**, trong một phiên thì mỗi lượt phải giống nhau.

Thiết kế tương ứng của codebot: ngữ nghĩa key = SessionID (đổi phiên = đổi huyết mạch), teammate thì nối thêm hậu tố tên,
còn khi host dùng lại cùng một instance Agent để đổi phiên thì gọi `Agent.SetPromptCacheKey` để trỏ lại danh tính.

---

## 6. Điều phối điểm ngắt của Claude: sàn + đỉnh cuộn

Anthropic không đóng điểm ngắt = không cache. Cách phân bổ ngân sách của chúng tôi (giới hạn 4 điểm ngắt/request):

```
[tools][system ←điểm ngắt① "sàn"][...tin nhắn lịch sử...][tin nhắn mới nhất ←điểm ngắt② "đỉnh cuộn"]
```

### 6.1 Sàn (floor): đóng đinh tiền tố tĩnh

system prompt là khối tĩnh lớn nhất. Cho nó một điểm ngắt riêng để bảo đảm **khi phiên mới bắt đầu/khi cache ở đuôi bị đuổi ra,
thì ít nhất tiền tố system+tools vẫn đọc từ cache** (agentcore `loop.go`):

```go
} else if agentCtx.SystemPrompt != "" {
	m := SystemMsg(agentCtx.SystemPrompt)
	if config.CacheLastMessage != "" {
		// Cache floor: pin the static system prompt with its own
		// breakpoint so a fresh session — or a turn whose tail entry was
		// evicted — still reads the system+tools prefix from cache.
		m.Metadata = map[string]any{"cache_control": config.CacheLastMessage}
	}
	prefix = append(prefix, m)
}
```

### 6.2 Đỉnh cuộn (rolling tip): mỗi lượt đẩy diện bao phủ lên

Đóng một điểm ngắt trên **tin nhắn không phải system cuối cùng**. Trong vòng lặp tool, mỗi lời gọi LLM đều ghi một bản
cache bao phủ tới tool_use+tool_result mới nhất, lượt sau đọc luôn, không truyền lại nữa:

```go
// markLastMessageForCache returns a copy of messages with cache_control attached
// to the metadata of the last non-system message. System messages are skipped so
// trailing per-turn reminders (which change every turn) don't end up carrying
// the breakpoint.
func markLastMessageForCache(messages []Message, cacheControl string) []Message {
	idx := -1
	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i].Role != RoleSystem {
			idx = i
			break
		}
	}
	// ...
}
```

Chú ý bỏ qua system reminder ở đuôi: nó đổi mỗi lượt, đóng điểm ngắt lên nó thì bằng với mỗi lượt ghi một bản
cache sẽ không bao giờ được dùng lại.

### 6.3 Ngữ nghĩa khối cuối: một tin nhắn chỉ đốt một điểm ngắt

Ngữ nghĩa `cache_control` ở mức tin nhắn là "ghi một điểm ngắt sau tin nhắn này". Dịch xuống mức khối thì chỉ được
rơi vào **khối cache được cuối cùng** — gắn cờ cho mọi khối sẽ đốt cháy hết ngân sách 4 điểm ngắt; mà Anthropic
từ chối cho khối thinking mang `cache_control`, nên quét từ đuôi lên và bỏ qua reasoning
(agentcore `llm/litellm.go`):

```go
if cache != nil {
	// Anthropic rejects cache_control on thinking blocks — land the
	// breakpoint on the last cacheable block instead.
	for i := len(blocks) - 1; i >= 0; i-- {
		if _, isReasoning := blocks[i].(litellm.ReasoningBlock); isReasoning {
			continue
		}
		blocks[i] = withBlockCache(blocks[i], cache)
		break
	}
}
```

### 6.4 Đường ống TTL

Giá trị cấu hình quy ước là chuỗi `"type[:ttl]"`, như `"ephemeral"` (mặc định 5m) hoặc `"ephemeral:1h"`:

```go
func cacheControlFromMetadata(metadata map[string]any) *litellm.CacheControl {
	value, _ := metadata["cache_control"].(string)
	if value == "" {
		return nil
	}
	if typ, ttl, ok := strings.Cut(value, ":"); ok {
		return &litellm.CacheControl{Type: typ, TTL: ttl}
	}
	return &litellm.CacheControl{Type: value}
}
```

Có nên nâng lên 1h thì để dữ liệu nói: giá ghi tăng từ 1,25x lên 2x, chỉ đáng khi đo thực tế thấy khoảng cách giữa các lời gọi
thường xuyên vượt 5 phút (chúng tôi đo được trung vị của coordinator là 172s, nên không nâng).

---

## 7. Gửi an toàn: gác theo năng lực + phán định endpoint chính thức

### 7.1 Gác theo năng lực: trường không được hỗ trợ thì không ra khỏi cửa

Các provider của litellm **kiểm nghiêm** `ProviderOptions` (khóa không rõ là báo lỗi luôn), nên
agentcore gác theo khai báo năng lực trước khi gửi (agentcore `llm/litellm.go`):

```go
// Prompt-cache routing identity. Capability-gated: litellm providers
// validate provider options strictly, so an unsupported key must be
// dropped here rather than rejected there.
if callCfg.PromptCacheKey != "" && caps.Cache.PromptKey == litellm.SupportYes {
	req.ProviderOptions["prompt_cache_key"] = callCfg.PromptCacheKey
}
```

### 7.2 Phán định endpoint chính thức: hệ sinh thái tương thích không có hợp đồng nào cho trường không rõ

`prompt_cache_key` là trường chính thức của OpenAI, nhưng hành vi của các endpoint "tương thích OpenAI" thì không có hợp đồng thống nhất nào.
Thực chứng trên mạng (2026-07):

- **Endpoint nghiêm thì từ chối luôn**: Groq, Cerebras, Volcano Engine, Fireworks trả 400/422 với trường này
  (Zed #36215, OpenClaw #48155 đều vì thế mà đổi sang gửi có điều kiện);
- **Loại trung chuyển tái đóng gói thì bỏ im lặng**: các đường không-truyền-xuyên của one-api/new-api/sub2api phân tích body request vào
  struct rồi re-marshal, trường không rõ biến mất không tiếng (gửi cũng như không);
- **Endpoint dễ tính thì bỏ qua**: Ollama, vLLM bản hiện tại, MiniMax.

Nên khai báo năng lực của openai provider trong litellm phán định **động** theo BaseURL
(litellm `provider/openai/capabilities.go`):

```go
// promptCacheParamsSupport reports whether this endpoint is trusted to accept
// OpenAI's prompt cache params (prompt_cache_key / prompt_cache_retention).
// Only the official endpoint guarantees the field contract.
func (p *Provider) promptCacheParamsSupport() litellm.Support {
	if p.cfg.PromptCacheParams || isOfficialBaseURL(p.cfg.BaseURL) {
		return litellm.SupportYes
	}
	return litellm.SupportUnknown
}

func isOfficialBaseURL(baseURL string) bool {
	u, err := url.Parse(baseURL)
	if err != nil {
		return false
	}
	return strings.EqualFold(u.Hostname(), "api.openai.com")
}
```

`api.openai.com` chính thức → `SupportYes` (gửi); BaseURL của bên thứ ba → `SupportUnknown`
(phép gác ở §7.1 tự động không gửi, **mặc định không bao giờ làm nổ endpoint nào**); người dùng đã xác nhận proxy của mình truyền xuyên nguyên trạng thì
opt-in tường minh trong cấu hình provider:

```jsonc
"my-relay": {
  "type": "openai",
  "base_url": "https://relay.example.com/v1",
  "extra": { "prompt_cache_params": true }   // tôi xác nhận proxy này truyền xuyên body request
}
```

> Vì sao công tắc làm ở tầng năng lực của litellm mà không ở tầng cấu hình ứng dụng? Bởi vì lúc chạy `/model` đổi provider
> sẽ đổi client, khai báo năng lực theo client mà đổi tự động; còn phép phán định ở kỳ dựng của ứng dụng thì không bao phủ được việc đổi lúc chạy.

---

## 8. Quan sát: phát hiện đứt chuỗi cache

Cache là "tính năng không thấy được" — hỏng thì không báo lỗi, chỉ là đắt hơn. Nên phải có quan sát (học theo
promptCacheBreakDetection của Claude Code, làm bản nhẹ).

Tiêu chí phán định (ainovel `internal/host/usage.go`):

```go
// Trong cùng một phiên (role+task): tiền tố không ngắn lại, mà lượng trúng giảm >5% so với lần trước và mức giảm ≥2000 token
broke := prevPrefix > 0 && prefix >= prevPrefix &&
	float64(u.CacheRead) < float64(prevRead)*cacheBreakKeepRatio &&
	prevRead-u.CacheRead >= cacheBreakMinDropTokens
```

Bốn thiết kế then chốt, mỗi cái ứng với một loại báo sai:

| Thiết kế | Loại báo sai được ngăn |
|---|---|
| **Ngưỡng đôi** (tương đối 5% và tuyệt đối 2000) | Ngưỡng tương đối đơn lẻ bị nhiễu của tiền tố nhỏ nhấn chìm; ngưỡng tuyệt đối đơn lẻ bỏ sót việc thoái hóa ở tiền tố lớn |
| **Baseline đi theo phiên (role+task)** | Chiều đo buộc phải khớp với hạt canh phiên của `prompt_cache_key` (`#seq`); so sánh theo role xuyên phiên sẽ báo sai khi "phiên trước rất ngắn, còn request đầu của phiên mới lại có tiền tố dài hơn" (chỗ hụt thật mà Codex review bắt được) |
| **Tiền tố ngắn lại = reset hợp pháp** | Nén ngữ cảnh là đứt có kế hoạch, reset baseline chứ không cảnh báo |
| **replay thì không phát hiện** | Phát lại lịch sử lúc khởi động sẽ làm những vết đứt cũ hiện thành cảnh báo mới |

Khi cảnh báo thì đưa gợi ý quy nguyên theo khoảng thời gian: khoảng >1h → nghi TTL 1h hết hạn; >5m → nghi TTL 5m hết hạn;
rất ngắn → nghi bị server đuổi ra/định tuyến trôi (**trạm trung chuyển luân phiên các tài khoản upstream là nguyên nhân thường gặp nhất**). Số lần được lưu bền vào
`usage.json` và hiện ở dòng "đứt chuỗi" trên panel cache của TUI.

---

## 9. Vạch đỏ của chốt khóa: nguyên tắc đơn điệu trong phiên

Một ràng buộc cấp hiến pháp cho các tính năng tương lai:

> **Mọi lượng sẽ đi vào tiền tố cache (system prompt, tools, tham số thinking, tham số lấy mẫu)
> đều buộc phải đóng băng sau lần tính đầu tiên trong phiên — thà cũ chứ không được phá cache.**

Ví dụ: những tính năng kiểu "chỉnh cường độ thinking lúc đang chạy", nếu để cường độ mới tác động ngay vào phiên đang diễn ra,
thì mỗi lần chỉnh là một lần viết lại tiền tố, làm mất hiệu lực toàn bộ cache. Cách đúng là giá trị mới chỉ có hiệu lực với **phiên spawn mới**.
Với mọi yêu cầu kiểu "chỉnh được X lúc chạy", câu hỏi đầu tiên đều là: X có nằm trong tiền tố cache không?

---

## 10. Các phán định sai thường gặp và giới hạn trần

1. **`cache_write` của OpenAI luôn bằng 0 là bình thường** — API không báo lượng ghi, đừng coi là bug rồi đi tra.
2. **Giới hạn trần của trạm trung chuyển**: nếu trạm luân phiên nhiều tài khoản upstream thì byte của client có ổn cỡ nào cũng vẫn miss (cache của tài khoản upstream A
   thì tài khoản B không thấy được). Điều này giải thích được câu đố "request giống nhau hoàn toàn từng byte mà chỉ trúng 12/33".
   **Đây không phải vấn đề client giải được** — dữ liệu của nhóm Claude Code cũng cho thấy khoảng chín phần mười các ca "client không đổi
   mà vẫn đứt" là do nguyên nhân phía server.
3. **Tiêu chí kiểm chứng**: JSONL của phiên không chứa system prompt và body request đầy đủ, **chuỗi usage từng request
   (input vs cache_read) mới là chuẩn vàng để chẩn đoán**. Một dấu tay thực dụng: nếu lượng trúng đóng đinh đúng ở
   "số token của system prompt làm tròn xuống theo 128" thì nghĩa là chỉ đoạn system trúng, còn đoạn tin nhắn miss toàn bộ.
4. **Tính lợi ích**: giá đọc 0,1x, giá ghi 1,25x, nghĩa là một bản cache chỉ cần được đọc 1 lần là hoàn vốn.
   Trong phiên agent nhiều lượt thì điểm ngắt gần như luôn có lợi, nên `CacheLastMessage` không đặt công tắc, mặc định bật.

---

## 11. Bảng tra nhanh hướng dẫn tiếp vào

**ainovel-cli** (đã dựng sẵn): mỗi agent cấu hình `CacheLastMessage: "ephemeral"` +
`PromptCacheKey: promptCacheBase(bookDir) + "-<role>"`, còn lại tự động hết.

**codebot** (đã dựng sẵn): key = SessionID; khi `Reset`/`SwitchSession` thì
`agent.SetPromptCacheKey(newSessionID)`; teammate dùng `sessionID + "-" + name`.

Danh mục tối thiểu để **ứng dụng mới tiếp vào agentcore**:

```go
agentcore.NewAgent(
	agentcore.WithCacheLastMessage("ephemeral"),   // điểm ngắt Claude: sàn + đỉnh cuộn
	agentcore.WithPromptCacheKey(stableIdentity),  // định tuyến OpenAI: ổn định, mỗi phiên một khóa
	// ...
)
```

Cộng thêm ba câu tự kiểm (ứng với ba kỷ luật):

1. Việc tuần tự hóa tools của tôi có tất định ở mức byte không? (các tập hợp đã sắp xếp hết chưa)
2. Lịch sử của tôi có append-only không? (nén có nộp không)
3. Những nội dung đổi mỗi lượt của tôi có ở phần đuôi hết không?

---

## 12. Danh mục kinh nghiệm cho người học

- Bản chất của việc tối ưu cache là **kỷ luật byte**, không phải chỉnh tham số: bảo đảm tiền tố ổn định trước, rồi mới nói tới key và điểm ngắt.
- Chẩn đoán thì luôn bắt đầu từ **chuỗi usage từng request**, đừng đoán từ code.
- Go ngẫu nhiên hóa phép duyệt map + tuần tự hóa body request = kẻ sát hại cache ẩn nhất, kiểm thử tính năng không bao giờ phát hiện ra.
- "Tương thích OpenAI" là từ tiếp thị, không phải hợp đồng: trước khi gửi trường chính thức sang endpoint bên thứ ba thì hãy tìm chứng cứ hạng nhất
  (mã nguồn/issue/cách vá đã đáp đất của các client cùng loại), "nói chung là sẽ bỏ qua" là một suy luận nguy hiểm.
- Quan sát thì ưu tiên chống báo sai: chiều đo buộc phải khớp với hạt canh của huyết mạch cache; thà bỏ sót chứ không được báo sai,
  nếu không thì cảnh báo sẽ nhanh chóng bị phớt lờ.
- Chuẩn kiểm nghiệm của việc phân tầng: khi đổi sang một ứng dụng khác (codebot) để tiếp vào thì logic cache không phải viết lại một dòng nào.

---

### Phụ lục: chỉ mục mã nguồn

| Chủ đề | Vị trí |
|---|---|
| Sắp xếp tất định cho tools | agentcore `subagent/subagent.go` `sortedAgentNames` |
| Phái sinh key cấp phiên (#seq) | agentcore `subagent/subagent.go` `runAgent` |
| Sàn system + đỉnh cuộn | agentcore `loop.go` `callLLM` / `markLastMessageForCache` |
| Điểm ngắt ở khối cuối + bỏ qua thinking | agentcore `llm/litellm.go` `convertAgentBlocks` |
| Phân tích TTL ("ephemeral:1h") | agentcore `llm/litellm.go` `cacheControlFromMetadata` |
| Gác theo năng lực | agentcore `llm/litellm.go` `applyCallConfig` |
| Phán định endpoint chính thức + opt-in | litellm `provider/openai/capabilities.go` / `provider.go Config` |
| Danh tính cache (một sách một nền) | ainovel `internal/agents/build.go` `promptCacheBase` |
| Phát hiện đứt | ainovel `internal/host/usage.go` `noteCacheBreak` |
| Định vị trong kiến trúc | ainovel `docs/architecture.md` §6.5 |
