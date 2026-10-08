module github.com/huuhoa143/ainovel-studio

go 1.25.5

require (
	github.com/voocel/agentcore v1.7.13
	github.com/voocel/litellm v1.8.8
	golang.org/x/sys v0.38.0
	golang.org/x/text v0.40.0
)

require golang.org/x/image v0.44.0 // indirect

replace github.com/voocel/litellm => ./third_party/litellm
