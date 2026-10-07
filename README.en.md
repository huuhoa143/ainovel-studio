# ainovel-studio

**English** · [Tiếng Việt](README.md)

**Project page: [ainovel.lingoreup.com](https://ainovel.lingoreup.com)** ·
**[download the macOS / Windows app](#download--install)** — no terminal needed · or
[build from source](#quick-start).

A fully autonomous AI engine for writing long-form novels. A deterministic engine drives an
entire book end to end and calls the model only where judgement is actually required: the
Engine routes on facts to coordinate three autonomous authoring agents — Architect / Writer /
Editor — and wakes an Arbiter when a semantic ruling is needed. One sentence of intent in, one
finished novel out, with no human in the loop.

> ### This is a fork
>
> This repository is a **Vietnamese-localised fork** of
> [voocel/ainovel-cli](https://github.com/voocel/ainovel-cli). **The engine, the architecture
> and the original design belong to the upstream project** — this fork did not invent them.
>
> Read [Credits](#credits) for the full lineage before citing this repo as the source of any
> idea described below.

## Download & install

The easy way: download **AINovel Studio**, a desktop app that bundles the engine and the web
studio — no terminal, no Go or Node to install. Open the
**[latest release](https://github.com/huuhoa143/ainovel-studio/releases/latest)** and download
the one file that matches your machine:

| Your machine | Download |
|---|---|
| Mac with Apple silicon (M1, M2, M3, M4…) | `AINovel-Studio-<version>-arm64.dmg` |
| Mac with an Intel processor | `AINovel-Studio-<version>-x64.dmg` |
| Windows 10/11 (64-bit) | `AINovel-Studio-Setup-<version>.exe` |

Not sure which Mac you have: Apple menu → **About This Mac**. A **Chip** line reading "Apple M…"
means Apple silicon; a **Processor** line reading "Intel…" means Intel. The `.zip` and `.yml`
files on the release page are for the app's self-updater — you do not need them.

**macOS** — open the `.dmg`, drag **AINovel Studio** into **Applications**, and launch it from
Launchpad. The first time, macOS asks *"…downloaded from the Internet. Are you sure you want to
open it?"* — click **Open**. It only asks once (the app is notarized by Apple).

**Windows** — download `AINovel-Studio-Setup-….exe` and run it. The installer is not code-signed
yet, so you may see two warnings, each only once:

1. While downloading, Edge/Chrome may say the file *"isn't commonly downloaded"*: click **…** (or
   the arrow next to the file) → **Keep**.
2. When you run it, a blue *"Windows protected your PC"* box appears: click **More info** →
   **Run anyway**.

**First launch** — the app opens straight on **General settings → Model & API key**. Paste the
API key for your provider (OpenRouter, Anthropic, Gemini, OpenAI…), save, and you can create a
novel right away. The key is stored in `~/.ainovel/config.json`, shared with the CLI if you
have it.

- Novels live in `~/Library/Application Support/AINovel Studio/books` (macOS) or
  `%APPDATA%\AINovel Studio\books` (Windows); the **Tệp → Mở thư mục truyện** (File → Open novels folder) menu item takes you there.
- The app checks for a new version on every launch, downloads it in the background, and asks
  to restart when it is ready.

The interface is Vietnamese (see the language note below). For the TUI/CLI, Linux, or hacking
on the code, see [Quick start](#quick-start).

<p align="center">
  <img src="docs/assets/studio.gif" alt="Web studio: management, production line, draft, cost, per-role models" width="820">
</p>

<p align="center">
  <sub>The web studio on real data from an actual run: <b>Management</b> across the whole floor →
  a single book's <b>production line</b> → <b>draft</b> → <b>floor-wide cost</b> →
  <b>per-role models</b>. The running interface is Vietnamese; see the language note below.</sub>
</p>

<table>
<tr>
<td width="50%" valign="top">
  <img src="docs/assets/ban-thao.png" alt="Reading a draft chapter next to the Editor's review">
  <sub><b>Reading a draft.</b> An accepted chapter sits next to its chapter contract and the
  Editor's seven-dimension review — every dimension has to quote the text as evidence.</sub>
</td>
<td width="50%" valign="top">
  <img src="docs/assets/chi-phi-xuong.png" alt="Floor-wide cost, split by role and by model">
  <sub><b>Floor-wide cost.</b> Split by role and by model. When a model call returns no usage
  figures, the studio says the total is short rather than quietly adding up the wrong number.</sub>
</td>
</tr>
</table>

> **A note on language.** The default UI language is **Vietnamese**, and the prompts are
> localised so the model writes Vietnamese prose. `AINOVEL_LANG=zh` returns the CLI/TUI to
> upstream's original Chinese strings. **There is no English UI yet** — see
> [Internationalisation](#internationalisation) for exactly what exists and what does not.
> This README is in English; the running program is not.

---

## Features

- **Deterministic engine + cooperating agents** — the Engine dispatches Architect / Writer /
  Editor from a fact-based decision table. The main loop spends *zero* LLM calls and its
  behaviour is exhaustively testable.
- **Auditable semantic rulings** — picking an architect, classifying a user intervention,
  choosing a way out of a dead end: each is one Arbiter call. Every ruling is written to disk
  and can be replayed.
- **Step-level checkpoint recovery** — every finished tool call writes a checkpoint. After a
  crash the run resumes at the exact plan/draft/check/commit step.
- **Two-tier progressive planning (volume → arc)** — long novels are not planned all at once.
  Only the first two volumes' skeleton plus arc 1's chapters are planned up front; later arcs
  are expanded by the Architect when the writing reaches them, always against prior summaries
  and character state.
- **Smart related-chapter recall** — for each chapter the system surfaces related history along
  four axes: foreshadowing, characters present, state changes, relationships — plus a forecast
  of the next chapter. This is what keeps a 500+ chapter novel coherent.
- **Adaptive context strategy** — switches between full context, sliding window and tiered
  summaries based on total chapter count.
- **Seven-dimension quality review** — the Editor reviews setting consistency, character
  behaviour, pacing, narrative continuity, foreshadowing, hooks, and aesthetic quality. The
  aesthetic axis splits further into five sub-scores, each of which must quote the text as
  evidence.
- **Real-time steering** — inject a correction at any time while writing, without pausing. The
  system assesses the blast radius and rewrites the affected chapters.
- **Optional per-chapter acceptance** — fully automatic by default; `/review on` makes each
  `/next` release exactly one new chapter.
- **Unified TUI** — an interactive surface that follows progress live, or takes a one-line
  brief and starts immediately.
- **Web studio** — `ainovel-cli serve --web <dir>` opens a full operating surface over the
  store. See [Web studio](#web-studio).
- **Multi-LLM** — OpenRouter / Anthropic / Gemini / OpenAI and others, switchable.

## Architecture

The core split: **deterministic at the fact layer, autonomous at the semantic layer.**
Enumerable state transitions are executed by deterministic code (Engine + Route); bounded
judgements are asked of an LLM function on demand (Arbiter); open-ended authoring is handed to
autonomous LLM loops (Workers).

```
┌────────────────────────────────────────────────────────────────┐
│                  Host / Engine (deterministic)                 │
│  read Store → Route → run Worker directly → loop               │
│  start ruling / steer classification / deadlock → Arbiter      │
└─────┬────────────┬────────────┬────────────┬───────────────────┘
      │            │            │            │
 ┌────▼────┐  ┌────▼────┐  ┌────▼────┐  ┌────▼────┐
 │Architect│  │ Writer  │  │ Editor  │  │ Arbiter │
 │ LLM loop│  │ LLM loop│  │ LLM loop│  │ LLM func│
 └────┬────┘  └────┬────┘  └────┬────┘  └─────────┘
      └────────────┼────────────┘
                   │ tool calls (IO + checkpoint)
┌──────────────────▼─────────────────────────────────────────────┐
│                             Store                              │
│  Progress / Checkpoint / Outline / Drafts / ...                │
└────────────────────────────────────────────────────────────────┘
```

- **Engine** — each turn reads facts from the Store and dispatches via the Route decision
  table. It decides execution, never literary merit. Crash recovery is "read the store and
  keep going"; there is no session to restore.
- **Arbiter** — on-demand semantic rulings. Facts in, structured decision out, every ruling
  persisted so it can be audited and replayed.
- **Workers** — Architect / Writer / Editor are autonomous authoring loops, each with its own
  context, cooperating only through artefacts in the Store.
- **Tools** — atomic single-file IO with replay invariants. Chapter submission uses a durable
  saga plus checkpoints, and returns **only facts** as JSON — never an instruction string.

## Quick start

```bash
# Requires Go 1.25+. Works on macOS, Linux and Windows.
git clone https://github.com/huuhoa143/ainovel-studio && cd ainovel-studio
go build -o ainovel-cli ./cmd/ainovel-cli

# First run walks you through provider → API key → base URL → model
./ainovel-cli

# For the web studio, build the interface once
cd web && npm ci && npm run build && cd ..
./ainovel-cli serve --web web/out
```

> ### Why the CLI is build-from-source only
>
> There is no `go install`, and that is a real constraint rather than an unfinished chore. Go
> refuses `go install pkg@version` for any module carrying a `replace` directive, and this
> `go.mod` has one: `github.com/voocel/litellm` is wired to a **patched** copy in `third_party/`.
>
> That patch cannot be dropped. Many OpenAI-compatible gateways emit a full terminal chunk —
> `finish_reason` and `usage` included — then close the connection without the `data: [DONE]`
> sentinel. Upstream litellm reads that as a truncated stream, so the engine discards a
> **complete** generation and retries seven times, resending the whole prompt each time. Measured
> against a real gateway: no novel got past its first chapter, and every Run press spent money
> without producing one. See [third_party/README.md](third_party/README.md).
>
> The way out, if `go install` ever matters: publish the patched litellm as a real versioned
> module and drop the `replace`. Better still, upstream the patch — that deletes `third_party/`
> entirely.
>
> Two notes that come with this: the binary does **not** embed the interface (it reads a built
> directory from disk on every request), so a TUI-only user skips the `npm` step. And
> `scripts/install.sh` still hardcodes `REPO="voocel/ainovel-cli"`, so it installs **upstream**,
> not this fork.
>
> **Updating** is `git pull` and rebuild.

The first run generates `~/.ainovel/config.json`. Inside the TUI, `/config` adds or edits
providers and per-model context windows; `/model` switches between saved models. A reference
file lives at `config.example.jsonc` in the repo root.

### Docker

```bash
# TUI
docker run -it --rm -v "$PWD/output:/app/output" -v "$HOME/.ainovel:/root/.ainovel" \
  ghcr.io/voocel/ainovel-cli:latest
```

## Web studio

Besides the TUI, this fork ships a **web operating surface** served straight off the store:

```bash
# API only (127.0.0.1:8420), reading novels under ./output
ainovel-cli serve

# With the built UI
ainovel-cli serve --web ./web/out

# Different root, or serve exactly one novel
ainovel-cli serve --root ./output --book my-novel --addr 127.0.0.1:8420
```

The studio covers the **whole lifecycle** — create a novel, run it, steer it, accept chapters
one by one, set the API key, change per-role models, import outside text, export — without
opening a terminal.

### Three screens

Navigation has two tiers: **screen** on top, **zone** underneath. All three screens are always
visible at the top of the left rail.

| Screen | Scope | Contains |
|---|---|---|
| **Quản lý** (Manage) | whole workshop | novel list · what needs you · workshop totals · new novel · co-draft |
| **Cài đặt chung** (Shared settings) | every novel | provider & key · default model per role · workshop-wide cost |
| **Xưởng sản xuất** (Production) | one novel | 13 authoring and operations zones for the open novel |

Manage is the landing screen. `?tp=<novel>` in the URL opens that novel's production screen
directly; `?khu=<zone>` wins over both.

<p align="center">
  <img src="docs/assets/quan-ly.png" alt="The Manage screen: novel list, what-needs-you strip, workshop totals" width="820">
</p>

<p align="center">
  <sub>The <b>Manage</b> screen. The strip at the top appears only when something genuinely waits
  on a person — here, a signed hold quoting the operator's own reason, and one steering note that
  has not been processed yet.</sub>
</p>

**Changing screen changes the whole frame, not just the canvas.** The book picker appears only
on the production screen; the other two show the workshop root. The transport bar — which
carries a real money-spending `Run` button — exists only on the production screen, because a
per-novel control has no business sitting under a surface that lists every novel.

### Safety rails

The engine runs **in the same process** as the studio, so the studio is the single writer and
every write goes through `*host.Host` — the same transactions the engine uses for itself. Two
rails come with that:

- **File-level lock** (`meta/studio.lock`). `store.IO.WithWriteLock` is only an in-process
  mutex, so it cannot see another process. The TUI still runs, so this lock is what stops both
  sides opening the same novel. It names the holding PID and the file to delete if orphaned.
- **Writes only on loopback.** Since the studio holds the API key and can start the engine, a
  request from a stranger could spend real money. If `--addr` is not loopback, the write routes
  are **not mounted at all** and the studio falls back to read-only. A CSRF rail (custom header
  plus `Origin`/`Host` checks) guards localhost, because any open web page can reach
  `127.0.0.1`.

The API key is **write-only**: settable through the UI, never returned. Where it must be shown,
it is masked (`sk-4…802`).

#### Why there is no hosted trial

**[ainovel.lingoreup.com](https://ainovel.lingoreup.com)** is a project page, not a place to run
the engine. That follows directly from the fence above; it is not a thing left undone.

A public trial means opening the write path to strangers, and the write path is what holds the
API key and starts the engine. A page where a stranger can click "start writing" is a page where
a stranger spends someone else's money. The two alternatives are no better: visitors paste their
own keys onto your server (now you are the custodian of other people's secrets), or you pay and
must build quotas, abuse limits, and signup throttling.

There is also an independent technical constraint: `boMay.soToiDa == 1`, one open novel per
process. So "many users at once" is not a table in a database — it is one process per user plus a
lifecycle layer to run them. That is a second product, not a deployment step.

None of those tensions exist locally: your key, your money, your disk, and the loopback fence
satisfied by construction. See [Quick start](#quick-start).

### One engine at a time

`boMay.soToiDa == 1` — the engine opens **exactly one** novel at a time; a second returns
`errQuaNhieuMay`. "Batch production" therefore means *managing* many novels with a clear
priority queue, **not** running them in parallel. The Manage screen deliberately does not draw
a parallel-run dashboard, because drawing a queue for a mechanism that does not exist promises
something that will not run.

## Internationalisation

**Short version: Vietnamese and Chinese, no English, and the web studio is not
internationalised at all.**

| Surface | Languages | Mechanism |
|---|---|---|
| CLI + TUI | `vi` (default), `zh` (upstream source) | `internal/i18n/`, 2,028 call sites, 1,821 catalog entries |
| Web studio | `vi` only | none — strings hardcoded in `web/lib/nhan.ts` |

`AINOVEL_LANG=zh` reverts the CLI/TUI to upstream's original strings. It does **not** affect
the web studio: `internal/serve/` and `web/` are new fork code with no Chinese original to fall
back to.

Adding a language is documented — including why it is more than a translation job for the web
UI — in **[docs/i18n.md](docs/i18n.md)**.

## Design philosophy

> **Deterministic at the fact layer, autonomous at the semantic layer.** The model is free
> where nothing can be verified (what to write, how to write it) and constrained where things
> can be (ordering, invariants, phases).

- **Enumerable transitions belong in code** — "who runs next" is a table lookup over facts.
  `flow.Route` is a pure function tested exhaustively across tens of thousands of combinations.
- **Bounded judgement belongs to the Arbiter** — facts in, structured decision out, machine
  validation behind it, every ruling persisted and replayable.
- **Open authoring belongs to the Worker** — within a chapter the Writer is fully autonomous;
  failing tools return structured errors with a suggested way out so the LLM can self-correct.
- **Harden boundaries, not judgement** — code guards only provable invariants. It never fakes
  understanding with keyword lists, score thresholds or rule tables.
- **Tools return facts only** — no `[system]` instruction strings smuggled into tool output.
- **Refuse complex orchestration** — no task queue, no policy engine. One sequential loop, one
  decision table, a few ruling functions.
- **Stronger models pay off linearly** — the deterministic shell does not change.

## Tech

- **Go 1.25**
- **[agentcore](https://github.com/voocel/agentcore)** — minimal agent core (tool-calling + streaming)
- **[litellm](https://github.com/voocel/litellm)** — unified LLM adapter layer
- **[Bubble Tea](https://github.com/charmbracelet/bubbletea)** — terminal UI framework
- **Next.js (static export)** — the web studio ships as static files served by the Go binary

## Contributing

This is a fork, which shapes how contributions should be aimed:

- **Engine, architecture, agent behaviour** — these belong upstream. Please send them to
  [voocel/ainovel-cli](https://github.com/voocel/ainovel-cli) so everyone benefits, not just
  this fork.
- **Localisation, the web studio, fork-specific docs** — those live here.

Two conventions worth knowing before you open a PR:

- **Keep the rebase diff small.** The i18n layer uses source strings as msgids specifically so
  this fork can track a fast-moving upstream. Please do not "clean that up" into explicit keys.
- **Comments carry the reasoning.** This codebase documents *why*, often with the measurement
  that motivated a decision. Matching that style is the house norm.

```bash
go test ./internal/...     # Go
cd web && npx vitest run   # web
cd web && npm run build    # static export
```

## Credits

This is a **fork** of [voocel/ainovel-cli](https://github.com/voocel/ainovel-cli). The engine,
the architecture and the original design are upstream's work. **This fork is not the original
project.**

What the fork adds on top of upstream:

- **i18n layer** (`internal/i18n/`) — Vietnamese by default, `AINOVEL_LANG=zh` restores
  upstream's strings
- **Localised prompts / reference material / style guides** in `assets/`, so the model writes
  Vietnamese prose instead of Chinese
- **Web studio** (`internal/serve/` + `web/`) — an HTTP API over the store plus a full
  operating surface; see [Web studio](#web-studio)

The initial translation memory was taken from
[kentjuno/ainovel-cli](https://github.com/kentjuno/ainovel-cli) at commit `68eb92d` — thanks
for their localisation work.

## License

MIT

This project actively participates in and acknowledges the
[linux.do community](https://linux.do/).
