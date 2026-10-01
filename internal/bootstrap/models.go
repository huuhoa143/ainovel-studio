package bootstrap

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"reflect"
	"strings"
	"sync"

	"github.com/voocel/agentcore"
	"github.com/voocel/agentcore/llm"
	"github.com/huuhoa143/ainovel-studio/internal/errs"
	"github.com/huuhoa143/ainovel-studio/internal/i18n"
	"github.com/huuhoa143/ainovel-studio/internal/llmcontract"
	"github.com/huuhoa143/ainovel-studio/internal/llmretry"
)

// FailoverEvent 表示一次显式 provider 切换。
// Reason 为短标签（rate_limit / timeout / stream_idle / network），用于结构化日志。
type FailoverEvent struct {
	Role         string
	Reason       string
	FromProvider string
	FromModel    string
	ToProvider   string
	ToModel      string
	Err          error
}

// FailoverReporter 在发生显式切换时被调用。
type FailoverReporter func(FailoverEvent)

type modelTarget struct {
	provider   string
	name       string
	model      agentcore.ChatModel
	jsonSchema *bool
}

// SwappableModel 是可热切换的 ChatModel 包装器。
// 已开始的请求继续使用旧实例；后续请求自动切到新实例。
type SwappableModel struct {
	*agentcore.SwappableModel
	mu       sync.RWMutex
	provider string
	name     string
	// jsonSchema 是当前选中模型的 config json_schema 三态声明，与 provider/name
	// 同锁原子切换；llmcontract.Resolve 经结构匹配接口每次现读。
	jsonSchema *bool
}

func NewSwappableModel(provider, name string, model agentcore.ChatModel, jsonSchema *bool) *SwappableModel {
	return &SwappableModel{
		SwappableModel: agentcore.NewSwappableModel(model),
		provider:       provider,
		name:           name,
		jsonSchema:     jsonSchema,
	}
}

// Generate và GenerateStream ghi đè bản nhúng CHỈ để cắm luật "cửa còn đóng lâu thì thôi gõ".
//
// # Vì sao ở đây, không phải ở `ForRole`
//
// Mọi vai đều cầm một `*SwappableModel` (`ForRole` trả nó; `failoverModel.currentTarget` cũng
// trỏ vào chính nó), nên đây là nút cổ chai thật của cả bốn vai. Quan trọng hơn: kiểu này ĐÃ
// cài đủ sáu giao diện năng lực tùy chọn mà tầng trên ép kiểu (`Capabilities`, `Info`,
// `ProviderName`, `ModelName`, `StructuredOutputFacts`, `JSONSchemaOverride`). Bọc một kiểu
// MỚI quanh `ForRole` sẽ che hết chúng — vẫn biên dịch, chỉ là độ suy luận và giao thức đầu ra
// có cấu trúc lặng lẽ rơi về mặc định. Thêm hai phương thức vào kiểu sẵn có thì không có gì
// để che.
//
// Luật nằm trong `llmretry`, không phải ở đây: xem `ChanChoLau` cho lý do đầy đủ và cho phần
// đo được của ca "Thử lại (6/7)".
func (m *SwappableModel) Generate(ctx context.Context, messages []agentcore.Message, tools []agentcore.ToolSpec, opts ...agentcore.CallOption) (*agentcore.LLMResponse, error) {
	resp, err := m.SwappableModel.Generate(ctx, messages, tools, opts...)
	if err != nil {
		return nil, llmretry.ChanChoLau(err, llmretry.ChinhSach{})
	}
	return resp, nil
}

func (m *SwappableModel) GenerateStream(ctx context.Context, messages []agentcore.Message, tools []agentcore.ToolSpec, opts ...agentcore.CallOption) (<-chan agentcore.StreamEvent, error) {
	ch, err := m.SwappableModel.GenerateStream(ctx, messages, tools, opts...)
	if err != nil {
		return nil, llmretry.ChanChoLau(err, llmretry.ChinhSach{})
	}
	// Lọc CẢ dòng sự kiện, không chỉ lỗi trả ngay: `callLLMStream` biến `StreamEventError`
	// thành lỗi của lượt gọi, và đó là đường mà 429 của Writer đi qua.
	return llmretry.LocChoLau(ctx, ch, llmretry.ChinhSach{}), nil
}

func (m *SwappableModel) ProviderName() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.provider
}

func (m *SwappableModel) Info() llm.ModelInfo {
	return m.StructuredOutputFacts().Info
}

// StructuredOutputFacts 在同一把锁下读取模型实例、身份和配置覆盖，保证一次
// 结构化协议选择只观察到一个完整版本。
func (m *SwappableModel) StructuredOutputFacts() llmcontract.ModelFacts {
	m.mu.RLock()
	defer m.mu.RUnlock()
	current := m.SwappableModel.Current()
	facts := llmcontract.ModelFacts{
		Info:               llm.ModelInfo{Name: m.name, Provider: m.provider},
		JSONSchemaOverride: cloneBoolPtr(m.jsonSchema),
	}
	if cp, ok := current.(llm.CapabilityProvider); ok {
		facts.Capabilities = cp.Capabilities()
	}
	if info, ok := current.(interface{ Info() llm.ModelInfo }); ok {
		modelInfo := info.Info()
		if modelInfo.Name == "" {
			modelInfo.Name = m.name
		}
		if modelInfo.Provider == "" {
			modelInfo.Provider = m.provider
		}
		facts.Info = modelInfo
	}
	return facts
}

func (m *SwappableModel) Capabilities() llm.Capabilities {
	return m.StructuredOutputFacts().Capabilities
}

func (m *SwappableModel) Swap(provider, name string, model agentcore.ChatModel, jsonSchema *bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.SwappableModel.Swap(model)
	m.provider = provider
	m.name = name
	m.jsonSchema = jsonSchema
}

// JSONSchemaOverride 返回当前选中模型的 config json_schema 三态声明。
func (m *SwappableModel) JSONSchemaOverride() *bool {
	return m.StructuredOutputFacts().JSONSchemaOverride
}

func cloneBoolPtr(value *bool) *bool {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func (m *SwappableModel) Current() (provider, name string) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.provider, m.name
}

// ModelSet 持有按角色分配的模型实例，未配置的角色回退到默认模型。
type ModelSet struct {
	mu        sync.RWMutex
	Default   *SwappableModel
	models    map[string]*SwappableModel
	fallbacks map[string][]modelTarget
	config    Config
}

// ForRole 返回指定角色的模型，未配置时返回默认模型。
func (ms *ModelSet) ForRole(role string) agentcore.ChatModel {
	ms.mu.RLock()
	defer ms.mu.RUnlock()
	if m, ok := ms.models[role]; ok {
		return m
	}
	return ms.Default
}

// ForRoleWithFailover 返回带有单次请求级 fallback 的角色模型。
// 仅当该角色显式配置了 fallbacks 时生效；未配置时退化为普通模型。
func (ms *ModelSet) ForRoleWithFailover(role string, report FailoverReporter) agentcore.ChatModel {
	ms.mu.RLock()
	defer ms.mu.RUnlock()
	primary, ok := ms.models[role]
	if !ok {
		return ms.Default
	}
	targets := ms.fallbacks[role]
	if len(targets) == 0 {
		return primary
	}
	return &failoverModel{
		role: role, primary: primary, set: ms, report: report,
	}
}

// Summary 返回模型分配摘要（供日志使用）。
func (ms *ModelSet) Summary() string {
	ms.mu.RLock()
	defer ms.mu.RUnlock()
	var parts []string
	for role, m := range ms.models {
		provider, name := m.Current()
		parts = append(parts, fmt.Sprintf("%s=%s/%s", role, provider, name))
	}
	if len(parts) == 0 {
		provider, name := ms.Default.Current()
		return fmt.Sprintf("default=%s/%s", provider, name)
	}
	provider, name := ms.Default.Current()
	return fmt.Sprintf("default=%s/%s %s", provider, name, strings.Join(parts, " "))
}

// CurrentSelection 返回角色当前生效的 provider/model。
// role 为空或 "default" 时返回默认模型。
func (ms *ModelSet) CurrentSelection(role string) (provider, model string, explicit bool) {
	ms.mu.RLock()
	defer ms.mu.RUnlock()
	if role == "" || role == "default" {
		provider, model = ms.Default.Current()
		return provider, model, true
	}
	if sw, ok := ms.models[role]; ok {
		provider, model = sw.Current()
		return provider, model, true
	}
	provider, model = ms.Default.Current()
	return provider, model, false
}

// Swap 切换默认模型或指定角色模型。
// role 为空或 "default" 时切换默认模型；其他角色切换为显式覆盖。
func (ms *ModelSet) Swap(role, provider, model string) error {
	ms.mu.Lock()
	defer ms.mu.Unlock()
	pc, ok := ms.config.Providers[provider]
	if !ok {
		return fmt.Errorf("provider %q is not configured: %w", provider, errs.ErrConfig)
	}
	next, err := createModelFromConfig(provider, model, pc, make(map[string]agentcore.ChatModel))
	if err != nil {
		return fmt.Errorf(i18n.F("切换模型失败: %w"), err)
	}

	jsonSchema := ms.config.ModelJSONSchema(provider, model)
	if role == "" || role == "default" {
		ms.Default.Swap(provider, model, next, jsonSchema)
		ms.config.Provider = provider
		ms.config.ModelName = model
		return nil
	}

	if !knownRoles[role] {
		return fmt.Errorf("unknown role %q: %w", role, errs.ErrConfig)
	}

	if existing, ok := ms.models[role]; ok {
		existing.Swap(provider, model, next, jsonSchema)
	} else {
		ms.models[role] = NewSwappableModel(provider, model, next, jsonSchema)
	}
	if ms.config.Roles == nil {
		ms.config.Roles = make(map[string]RoleConfig)
	}
	rc := ms.config.Roles[role]
	rc.Provider = provider
	rc.Model = model
	ms.config.Roles[role] = rc
	return nil
}

// CapNhatNhaCungCap trộn danh mục nhà cung cấp mới đọc từ đĩa vào một ModelSet ĐANG CHẠY.
//
// # Vì sao cần
//
// `Swap` tra `ms.config.Providers` để dựng model mới, mà `ms.config` là ảnh chụp lúc engine
// được mở. Thêm một nhà cung cấp trong studio rồi đổi model cho cuốn đang chạy vì thế chết với
// `provider %q is not configured` — người dùng vừa lưu nó xong và nhìn thấy nó trong danh sách.
//
// # Vì sao TRỘN chứ không thay
//
// Một nhà cung cấp bị xóa khỏi tệp vẫn có thể đang được engine này dùng dở. Thay trắng danh mục
// sẽ rút thảm dưới chân một lượt chạy đang sống; trộn thì chỉ thêm đường ra, không cắt đường
// nào đang đi.
func (ms *ModelSet) CapNhatNhaCungCap(providers map[string]ProviderConfig) {
	if len(providers) == 0 {
		return
	}
	ms.mu.Lock()
	defer ms.mu.Unlock()
	if ms.config.Providers == nil {
		ms.config.Providers = make(map[string]ProviderConfig, len(providers))
	}
	for ten, pc := range providers {
		cu, daCo := ms.config.Providers[ten]
		ms.config.Providers[ten] = pc
		if daCo && !doiCachGoi(cu, pc) {
			continue
		}
		ms.dungLaiTheoNhaCungCap(ten, pc)
	}
}

// doiCachGoi nói hai bản cấu hình của MỘT nhà cung cấp có dựng ra hai client khác nhau không.
//
// So đúng những trường đi vào `llm.NewModel` (khóa, địa chỉ gốc, loại, timeout, extra) và CỐ Ý
// bỏ `Models`: danh sách model là một danh mục để gợi ý, nó không đổi cách gọi. Không bỏ nó thì
// mỗi lần người dùng thêm một tên vào ô "Danh sách model" là một lượt dựng lại client cho mọi
// vai — tốn công và vứt mất kết nối đang ấm.
//
// NHƯNG `Models` không thuần là danh mục: mỗi mục còn mang `json_schema`, và trường đó quyết
// định request có kèm `response_format: json_schema` hay không — tức nó là CÁCH GỌI, đúng vế
// bên kia của đường ranh mà hàm này vạch ra. Bỏ cả cụm là chôn nó luôn: `sw.jsonSchema` chỉ
// được làm mới trong `sw.Swap`, mà `Swap` chỉ tới được khi hàm này trả true.
//
// Nên tách hai vế: `json_schema` đem so riêng, phần còn lại của `Models` (tên, cửa sổ) vẫn bị
// bỏ qua như cũ.
func doiCachGoi(a, b ProviderConfig) bool {
	if !reflect.DeepEqual(khaiJSONSchema(a), khaiJSONSchema(b)) {
		return true
	}
	a.Models, b.Models = nil, nil
	return !reflect.DeepEqual(a, b)
}

// khaiJSONSchema gom khai báo `json_schema` của từng model thành một bản đồ so sánh được.
//
// Chỉ giữ mục có khai (`nil` = "để adapter tự quyết", tức KHÔNG phải một lựa chọn của người
// dùng), nên thêm một tên model trần vào danh mục không làm bản đồ này đổi. `reflect.DeepEqual`
// đi xuyên con trỏ nên `*bool` so được theo giá trị.
func khaiJSONSchema(p ProviderConfig) map[string]bool {
	var ra map[string]bool
	for _, m := range p.Models {
		if m.JSONSchema == nil {
			continue
		}
		if ra == nil {
			ra = make(map[string]bool, len(p.Models))
		}
		ra[m.Name] = *m.JSONSchema
	}
	return ra
}

// dungLaiTheoNhaCungCap dựng lại MỌI model đang trỏ vào một nhà cung cấp vừa đổi cách gọi.
//
// # Vì sao cần, và vì sao trộn danh mục thôi là chưa đủ
//
// `NewModelSet` dựng client MỘT LẦN lúc `host.New`, mang theo khóa API tại thời điểm đó. Trộn
// danh mục (phần trên) chỉ chữa được đường `Swap` — nó không chạm tới những client ĐÃ dựng.
//
// ĐO ĐƯỢC trên máy người dùng: khóa của gateway hết hạn mức, họ mua khóa mới và lưu vào cấu
// hình, `POST /chat/completions` bằng khóa mới trả 200 trong 5,3 giây — nhưng engine đang mở
// vẫn 429 với đúng câu cũ, vì nó cầm client dựng từ khóa cũ lúc 14:14. Không dấu hiệu nào trên
// màn hình nói ra điều đó; người dùng chỉ thấy "đổi khóa rồi mà vẫn lỗi".
//
// Lượt gọi ĐANG BAY giữ client cũ (`agentcore.SwappableModel` đọc `Current()` lúc gọi), nên
// đây là thay êm: lượt kế tiếp dùng khóa mới, lượt đang chạy không bị cắt ngang.
//
// Người gọi phải đang giữ `ms.mu`.
func (ms *ModelSet) dungLaiTheoNhaCungCap(ten string, pc ProviderConfig) {
	cache := make(map[string]agentcore.ChatModel)
	dung := func(sw *SwappableModel) {
		if sw == nil {
			return
		}
		p, m := sw.Current()
		if p != ten {
			return
		}
		moi, err := createModelFromConfig(ten, m, pc, cache)
		if err != nil {
			// Bỏ qua chứ không hoảng: cấu hình mới hỏng thì giữ client cũ vẫn hơn là để lượt
			// chạy mất model. `PUT /api/config` đã kiểm và hoàn nguyên bản không dùng được.
			slog.Warn(i18n.F("重建模型失败"), "module", "config", "provider", ten, "model", m, "err", err)
			return
		}
		sw.Swap(ten, m, moi, ms.config.ModelJSONSchema(ten, m))
	}
	dung(ms.Default)
	for _, sw := range ms.models {
		dung(sw)
	}
}

// ResolveContextWindow 使用 ModelSet 的最新配置解析窗口，供运行时热切换后的
// ContextManagerFactory 使用，避免捕获启动时的 Config 副本。
func (ms *ModelSet) ResolveContextWindow(provider, model string) (int, ContextWindowSource) {
	ms.mu.RLock()
	defer ms.mu.RUnlock()
	return ms.config.ResolveContextWindow(provider, model)
}

// ApplyPrepared 提交一个已成功构建的候选 ModelSet。已有 SwappableModel 的地址
// 保持不变，因此已装配的 Worker/Arbiter 会在下一次请求自动使用新客户端。
func (ms *ModelSet) ApplyPrepared(candidate *ModelSet) {
	if candidate == nil {
		return
	}
	ms.mu.Lock()
	defer ms.mu.Unlock()

	defaultProvider, defaultName := candidate.Default.Current()
	ms.Default.Swap(defaultProvider, defaultName, candidate.Default.SwappableModel.Current(), candidate.Default.JSONSchemaOverride())

	nextModels := make(map[string]*SwappableModel, len(candidate.models))
	for role, next := range candidate.models {
		provider, name := next.Current()
		if existing, ok := ms.models[role]; ok {
			existing.Swap(provider, name, next.SwappableModel.Current(), next.JSONSchemaOverride())
			nextModels[role] = existing
		} else {
			nextModels[role] = next
		}
	}
	ms.models = nextModels
	ms.fallbacks = candidate.fallbacks
	ms.config = CloneConfig(candidate.config)
}

func (ms *ModelSet) fallbackTargets(role string) []modelTarget {
	ms.mu.RLock()
	defer ms.mu.RUnlock()
	return append([]modelTarget(nil), ms.fallbacks[role]...)
}

// CapDaCauHinh trả về cặp provider/model ĐÃ CẤU HÌNH (tên provider trong `providers`, tên model
// như người dùng khai) ứng với một lượt gọi của `role` mà phản hồi báo model `daGoi`.
//
// Phản hồi chỉ mang loại giao thức ("openai") và tên model gateway trả về — có khi đã cắt tiền
// tố (`cx/gpt-5.6-luna` về thành `gpt-5.6-luna`). Không đối chiếu được hai thứ đó với cấu hình
// thì thanh trạng thái không nói được "lượt vừa rồi chạy bằng gì". Thứ tự: model chính của vai,
// rồi các fallback; khớp khi tên bằng nhau hoặc tên cấu hình kết thúc bằng `/`+tên trả về.
// Không khớp gì (hoặc `daGoi` rỗng) thì trả model chính của vai.
func (ms *ModelSet) CapDaCauHinh(role, daGoi string) (provider, model string) {
	provider, model, _ = ms.CurrentSelection(role)
	daGoi = strings.TrimSpace(daGoi)
	khop := func(ten string) bool {
		return daGoi == "" || ten == daGoi || strings.HasSuffix(ten, "/"+daGoi)
	}
	if khop(model) {
		return provider, model
	}
	for _, t := range ms.fallbackTargets(role) {
		if khop(t.name) {
			return t.provider, t.name
		}
	}
	return provider, model
}

// ModelName 从 ChatModel 中提取当前模型名，失败返回空字符串。
// 支持 SwappableModel 的热切换：调用时总是返回最新值。
func ModelName(m agentcore.ChatModel) string {
	if info, ok := m.(interface{ Info() llm.ModelInfo }); ok {
		return info.Info().Name
	}
	return ""
}

// ModelProvider 从 ChatModel 中提取当前 provider 名称，失败返回空字符串。
func ModelProvider(m agentcore.ChatModel) string {
	if info, ok := m.(interface{ Info() llm.ModelInfo }); ok {
		return info.Info().Provider
	}
	if provider, ok := m.(interface{ ProviderName() string }); ok {
		return provider.ProviderName()
	}
	return ""
}

// NewModelSet 根据配置创建多模型集合。
// 相同 provider+model 组合复用同一个实例。
func NewModelSet(cfg Config) (*ModelSet, error) {
	cache := make(map[string]agentcore.ChatModel)

	// 创建默认模型
	defaultPC := cfg.DefaultProviderConfig()
	defaultModel, err := createModelFromConfig(cfg.Provider, cfg.ModelName, defaultPC, cache)
	if err != nil {
		return nil, fmt.Errorf("default model: %w", err)
	}

	ms := &ModelSet{
		Default:   NewSwappableModel(cfg.Provider, cfg.ModelName, defaultModel, cfg.ModelJSONSchema(cfg.Provider, cfg.ModelName)),
		models:    make(map[string]*SwappableModel),
		fallbacks: make(map[string][]modelTarget),
		config:    cfg,
	}
	// Van stream của kênh mặc định. Đặt ngay sau literal vì `Default` dựng bên trong nó, và
	// một kênh mặc định bỏ sót cờ này là ca hỏng NẶNG nhất: arbiter luôn dùng model mặc định.

	// 创建角色覆盖模型
	for role, rc := range cfg.Roles {
		// Mục chỉ ghi đè độ suy luận: vai vẫn theo model mặc định, không dựng model riêng.
		if rc.IsEffortOnly() {
			continue
		}
		pc, ok := cfg.Providers[rc.Provider]
		if !ok {
			return nil, fmt.Errorf("role %s references unknown provider %q: %w", role, rc.Provider, errs.ErrConfig)
		}
		m, err := createModelFromConfig(rc.Provider, rc.Model, pc, cache)
		if err != nil {
			return nil, fmt.Errorf("role %s model: %w", role, err)
		}
		ms.models[role] = NewSwappableModel(rc.Provider, rc.Model, m, cfg.ModelJSONSchema(rc.Provider, rc.Model))
		slog.Info(i18n.F("角色模型分配"), "module", "config", "role", role, "provider", rc.Provider, "model", rc.Model)
		if len(rc.Fallbacks) == 0 {
			continue
		}

		targets := make([]modelTarget, 0, len(rc.Fallbacks))
		for _, fallback := range rc.Fallbacks {
			fpc, ok := cfg.Providers[fallback.Provider]
			if !ok {
				return nil, fmt.Errorf("role %s fallback references unknown provider %q: %w", role, fallback.Provider, errs.ErrConfig)
			}
			fm, err := createModelFromConfig(fallback.Provider, fallback.Model, fpc, cache)
			if err != nil {
				return nil, fmt.Errorf("role %s fallback %s/%s: %w", role, fallback.Provider, fallback.Model, err)
			}
			targets = append(targets, modelTarget{
				provider:   fallback.Provider,
				name:       fallback.Model,
				model:      fm,
				jsonSchema: cfg.ModelJSONSchema(fallback.Provider, fallback.Model),
			})
		}
		ms.fallbacks[role] = targets
	}

	return ms, nil
}

// createModelFromConfig 创建或复用 ChatModel 实例。
func createModelFromConfig(providerKey, model string, pc ProviderConfig, cache map[string]agentcore.ChatModel) (agentcore.ChatModel, error) {
	cacheKey := providerKey + "|" + model
	if m, ok := cache[cacheKey]; ok {
		return m, nil
	}

	providerType, err := pc.ProviderType(providerKey)
	if err != nil {
		return nil, fmt.Errorf(i18n.F("解析 provider 类型失败: %w"), err)
	}
	providerExtra := cloneMap(pc.Extra)
	if pc.API != "" {
		if providerExtra == nil {
			providerExtra = make(map[string]any, 1)
		}
		providerExtra["api"] = pc.API
	}

	streamIdle, err := pc.StreamIdleTimeoutValue()
	if err != nil {
		return nil, fmt.Errorf("provider %s stream_idle_timeout: %w: %w", providerKey, errs.ErrConfig, err)
	}

	m, err := llm.NewModel(providerType, model,
		llm.WithAPIKey(pc.APIKey),
		llm.WithBaseURL(pc.BaseURL),
		llm.WithStreamIdleTimeout(streamIdle),
		llm.WithProviderExtra(providerExtra),
		llm.WithExtra(pc.ExtraBody),
	)
	if err != nil {
		return nil, fmt.Errorf("provider %s (%s): %w: %w", providerKey, providerType, errs.ErrProvider, err)
	}
	cache[cacheKey] = m
	return m, nil
}

type failoverModel struct {
	role    string
	primary *SwappableModel
	set     *ModelSet
	report  FailoverReporter
}

func (m *failoverModel) Generate(ctx context.Context, messages []agentcore.Message, tools []agentcore.ToolSpec, opts ...agentcore.CallOption) (*agentcore.LLMResponse, error) {
	current := m.currentTarget()
	resp, err := current.model.Generate(ctx, messages, tools, opts...)
	if err == nil {
		return resp, nil
	}

	next, reason, ok := m.pickFallback(current, err, requestsJSONSchema(opts))
	if !ok {
		return nil, err
	}
	m.reportFailover(current, next, reason, err)
	// Nhà cung cấp dự phòng là model THÔ (`modelTarget.model` dựng thẳng từ cấu hình), không
	// phải `*SwappableModel`, nên luật không tự đi theo — phải chặn ở chính lối ra này. Lượt
	// chính thì đã qua `SwappableModel` rồi, và `ChanChoLau` lũy đẳng nên chặn lại vô hại.
	resp, err = next.model.Generate(ctx, messages, tools, opts...)
	if err != nil {
		return nil, llmretry.ChanChoLau(err, llmretry.ChinhSach{})
	}
	return resp, nil
}

func (m *failoverModel) GenerateStream(ctx context.Context, messages []agentcore.Message, tools []agentcore.ToolSpec, opts ...agentcore.CallOption) (<-chan agentcore.StreamEvent, error) {
	out := make(chan agentcore.StreamEvent, 100)

	go func() {
		defer close(out)

		current := m.currentTarget()
		fallbackUsed := false

	retry:
		source, resp, err := m.startAttempt(ctx, current, messages, tools, opts...)
		if err != nil {
			if !fallbackUsed {
				if next, reason, ok := m.pickFallback(current, err, requestsJSONSchema(opts)); ok {
					fallbackUsed = true
					m.reportFailover(current, next, reason, err)
					current = next
					goto retry
				}
			}
			// Cùng lý do như ở `Generate`: lối ra này mang được lỗi của một model dự phòng thô.
			out <- agentcore.StreamEvent{
				Type: agentcore.StreamEventError,
				Err:  llmretry.ChanChoLau(err, llmretry.ChinhSach{}),
			}
			return
		}
		if resp != nil {
			out <- agentcore.StreamEvent{
				Type:       agentcore.StreamEventDone,
				Message:    resp.Message,
				StopReason: resp.Message.StopReason,
			}
			return
		}

		forwarded := false
		for ev := range source {
			switch ev.Type {
			case agentcore.StreamEventError:
				if ev.Err != nil && !forwarded && !fallbackUsed {
					if next, reason, ok := m.pickFallback(current, ev.Err, requestsJSONSchema(opts)); ok {
						fallbackUsed = true
						m.reportFailover(current, next, reason, ev.Err)
						current = next
						goto retry
					}
				}
				ev.Err = llmretry.ChanChoLau(ev.Err, llmretry.ChinhSach{})
				out <- ev
				return
			case agentcore.StreamEventDone:
				out <- ev
				return
			default:
				forwarded = true
				out <- ev
			}
		}
	}()

	return out, nil
}

func (m *failoverModel) SupportsTools() bool {
	return m.primary != nil && m.primary.SupportsTools()
}

func (m *failoverModel) ProviderName() string {
	if m.primary == nil {
		return ""
	}
	return m.primary.ProviderName()
}

func (m *failoverModel) Info() llm.ModelInfo {
	if m.primary == nil {
		return llm.ModelInfo{}
	}
	return m.primary.Info()
}

func (m *failoverModel) Capabilities() llm.Capabilities {
	return m.StructuredOutputFacts().Capabilities
}

func (m *failoverModel) JSONSchemaOverride() *bool {
	return m.StructuredOutputFacts().JSONSchemaOverride
}

func (m *failoverModel) StructuredOutputFacts() llmcontract.ModelFacts {
	if m.primary == nil {
		return llmcontract.ModelFacts{}
	}
	return m.primary.StructuredOutputFacts()
}

func (m *failoverModel) currentTarget() modelTarget {
	if m.primary == nil {
		return modelTarget{}
	}
	provider, name := m.primary.Current()
	return modelTarget{
		provider:   provider,
		name:       name,
		model:      m.primary,
		jsonSchema: m.primary.JSONSchemaOverride(),
	}
}

func (m *failoverModel) pickFallback(current modelTarget, err error, requireJSONSchema bool) (modelTarget, string, bool) {
	if err == nil || current.model == nil {
		return modelTarget{}, "", false
	}
	if errors.Is(err, context.Canceled) {
		return modelTarget{}, "", false
	}

	if !agentcore.IsFailoverEligible(err) {
		return modelTarget{}, agentcore.FailoverReason(err), false
	}
	reason := agentcore.FailoverReason(err)
	var targets []modelTarget
	if m.set != nil {
		targets = m.set.fallbackTargets(m.role)
	}
	for _, target := range targets {
		if target.provider == current.provider && target.name == current.name {
			continue
		}
		if target.model == nil {
			continue
		}
		if requireJSONSchema && !supportsJSONSchema(target) {
			continue
		}
		return target, reason, true
	}
	return modelTarget{}, reason, false
}

func requestsJSONSchema(opts []agentcore.CallOption) bool {
	format := agentcore.ResolveCallConfig(opts).ResponseFormat
	return format != nil && format.Type == agentcore.ResponseFormatJSONSchema
}

func supportsJSONSchema(target modelTarget) bool {
	if target.jsonSchema != nil {
		return *target.jsonSchema
	}
	cp, ok := target.model.(llm.CapabilityProvider)
	return ok && cp.Capabilities().Structured.JSONSchema == llm.SupportYes
}

func (m *failoverModel) reportFailover(from, to modelTarget, reason string, err error) {
	if m.report != nil {
		m.report(FailoverEvent{
			Role:         m.role,
			Reason:       reason,
			FromProvider: from.provider,
			FromModel:    from.name,
			ToProvider:   to.provider,
			ToModel:      to.name,
			Err:          err,
		})
	}
}

func (m *failoverModel) startAttempt(ctx context.Context, target modelTarget, messages []agentcore.Message, tools []agentcore.ToolSpec, opts ...agentcore.CallOption) (<-chan agentcore.StreamEvent, *agentcore.LLMResponse, error) {
	if target.model == nil {
		return nil, nil, fmt.Errorf("no model configured")
	}

	streamCh, err := target.model.GenerateStream(ctx, messages, tools, opts...)
	if err == nil {
		return streamCh, nil, nil
	}

	resp, genErr := target.model.Generate(ctx, messages, tools, opts...)
	if genErr != nil {
		return nil, nil, genErr
	}
	return nil, resp, nil
}
