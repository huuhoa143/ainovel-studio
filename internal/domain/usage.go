package domain

import "time"

// UsageSchemaVersion 是 meta/usage.json 的兼容版本号。
// 未来若 AgentUsageTotals 字段语义变化，递增此值；UsageStore.Load 见到不同版本应忽略并触发 replay 重建。
const UsageSchemaVersion = 2

// UsageState 是累计 token / cost 用量的可持久化快照。
// 内存中由 UsageTracker 维护，定期 debounce 落盘到 meta/usage.json。
//
// 注意：UsageTracker 内部的滑动窗 samples（"近 N 次命中率"）**不持久化**——
// 它只服务 UI 短期诊断，进程重启从空开始重新积累几轮即可恢复语义。
// MissingAssistantUsage 保留持久化，跨重启累积更有诊断价值。
type UsageState struct {
	Schema       int                         `json:"schema"`
	UpdatedAt    time.Time                   `json:"updated_at"`
	Overall      AgentUsageTotals            `json:"overall"`
	PerAgent     map[string]AgentUsageTotals `json:"per_agent"`
	PerModel     map[string]AgentUsageTotals `json:"per_model,omitempty"`
	MissingUsage int                         `json:"missing_assistant_usage"`
	// LastCall là lượt gọi LLM gần nhất có usage. Vắng khi chưa có lượt nào kể từ bản này.
	LastCall *LastCall `json:"last_call,omitempty"`
}

// LastCall mô tả lượt gọi LLM gần nhất: vai nào, bằng cặp provider/model ĐÃ CẤU HÌNH nào, lúc nào.
// Provider là TÊN trong `providers` của cấu hình (vd. "9Router"), không phải loại giao thức.
type LastCall struct {
	Agent    string    `json:"agent"`
	Provider string    `json:"provider"`
	Model    string    `json:"model"`
	At       time.Time `json:"at"`
}

// AgentUsageTotals 是单个角色（或 overall）累计计数的可持久化形态。
type AgentUsageTotals struct {
	Input        int     `json:"input"`
	Output       int     `json:"output"`
	CacheRead    int     `json:"cache_read"`
	CacheWrite   int     `json:"cache_write"`
	Cost         float64 `json:"cost_usd"`
	Saved        float64 `json:"saved_usd"`
	CacheCapable bool    `json:"cache_capable"`
	// CacheBreaks 是 live 检测到的缓存链断裂次数（前缀未缩短而命中骤降）。
	// 只在实时路径累计，session replay 不重放检测。
	CacheBreaks int `json:"cache_breaks,omitempty"`
}
