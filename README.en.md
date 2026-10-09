# AINovel Studio

[![License: Apache-2.0](https://img.shields.io/github/license/huuhoa143/ainovel-studio)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/huuhoa143/ainovel-studio?display_name=tag&sort=semver)](https://github.com/huuhoa143/ainovel-studio/releases/latest)
[![Platforms: macOS | Windows](https://img.shields.io/badge/platforms-macOS%20%7C%20Windows-informational)](#download--install)

**English** · [Tiếng Việt](README.md)

**Project page: [ainovel.lingoreup.com](https://ainovel.lingoreup.com)** ·
**[Download for macOS / Windows](https://github.com/huuhoa143/ainovel-studio/releases/latest)** — no terminal needed.

A desktop app that writes long-form novels with AI, fully autonomously. A deterministic engine
drives an entire book end to end and calls the model only where judgement is actually required:
the Engine routes on facts to coordinate three autonomous authoring agents — Architect / Writer /
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

Download **AINovel Studio**, a desktop app that bundles the engine and the studio interface — no
terminal, no Go or Node to install. Open the
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

The app checks for a new version on every launch, downloads it in the background, and asks to
restart when it is ready. To check right away: **AINovel Studio → Kiểm tra cập nhật…** (Check for
updates).

## First launch

The app opens straight on **Cài đặt → Model & khóa API** (Settings → Model & API key). Paste the
API key for your provider (OpenRouter, Anthropic, Gemini, OpenAI…), pick a default model, save,
and you can create a novel right away.

Configuration, API key included, lives in the app's data folder **on your machine**:

| OS | Config file |
|---|---|
| macOS | `~/Library/Application Support/AINovel Studio/config.json` |
| Windows | `%APPDATA%\AINovel Studio\config.json` |

If you used an older build and have a `~/.ainovel` folder, the first launch **copies**
`config.json` plus your shared writing rules (`rules/`) and style overrides (`style/`) over —
once only; the old files are left in place. From then on the app reads and writes only the file above.

## Where your novels live

Each novel is a folder under `books/`, next to the config file:

- macOS: `~/Library/Application Support/AINovel Studio/books`
- Windows: `%APPDATA%\AINovel Studio\books`

**Tệp → Mở thư mục truyện** (File → Open novels folder) takes you there; **Tệp → Mở thư mục log**
(File → Open logs folder) opens the logs when you need to report a bug.

**Bringing old novels in.** Novels written with an older build (an `output/` folder somewhere on
your disk) come in through **Tệp → Nhập truyện từ thư mục…** (File → Import novels from folder):
pick the folder, and the app copies every valid novel into `books/`. A novel whose name is
already taken is skipped and reported; the source folder is never touched.

<p align="center">
  <img src="docs/assets/studio.gif" alt="The studio: novel shelf, progress, reading, cost, per-role models" width="820">
</p>

<p align="center">
  <sub>The studio on real data from an actual run: the <b>novel shelf</b> → a single book's
  <b>progress</b> → <b>reading</b> → <b>total cost</b> → <b>per-role models</b>. The running
  interface is Vietnamese; see the language note below.</sub>
</p>

<table>
<tr>
<td width="50%" valign="top">
  <img src="docs/assets/ban-thao.png" alt="Reading a draft chapter next to the Editor's review">
  <sub><b>Reading a draft.</b> An accepted chapter sits next to its chapter contract and the
  Editor's seven-dimension review — every dimension has to quote the text as evidence.</sub>
</td>
<td width="50%" valign="top">
  <img src="docs/assets/chi-phi-xuong.png" alt="Total cost, split by role and by model">
  <sub><b>Total cost.</b> Split by role and by model. When a model call returns no usage
  figures, the studio says the total is short rather than quietly adding up the wrong number.</sub>
</td>
</tr>
</table>

> **A note on language.** The interface is **Vietnamese**, and the prompts are localised so the
> model writes Vietnamese prose. **There is no English UI yet** — see
> [Internationalisation](#internationalisation). This README is in English; the app is not.

---

## Features

- **Deterministic engine + cooperating agents** — the Engine dispatches Architect / Writer /
  Editor from a fact-based decision table. The main loop spends *zero* LLM calls and its
  behaviour is exhaustively testable.
- **Auditable semantic rulings** — picking an architect, classifying a user note, choosing a way
  out of a dead end: each is one Arbiter call. Every ruling is written to disk and can be
  replayed.
- **Step-level checkpoint recovery** — every finished tool call writes a checkpoint. After a
  crash or quitting mid-run, the run resumes at the exact plan/draft/check/commit step.
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
- **Real-time notes** — send a correction at any time while writing, without pausing. The system
  assesses the blast radius and rewrites the affected chapters.
- **Optional chapter-by-chapter mode** — fully automatic by default; switch **Cách viết**
  (Writing mode) to **Duyệt từng chương** (Review each chapter) and each new chapter waits for
  your go-ahead.
- **Import, style learning, publishing** — import an existing novel (`.txt`/`.md`) to continue
  it, build a style profile from sample prose, export TXT or EPUB at any time.
- **Multi-LLM** — OpenRouter / Anthropic / Gemini / OpenAI / DeepSeek / Ollama and others,
  switchable, with a separate model per role.

## Using the studio

### Three screens

Navigation has two tiers: **screen** on top, **zone** underneath. All three screens are always
visible at the top of the left rail.

| Screen | Scope | Contains |
|---|---|---|
| **Tủ truyện** (Novel shelf) | every novel | novel list · what needs you · overview · new novel · idea board |
| **Cài đặt** (Settings) | applies to every novel | model & API key · per-role models · total cost |
| **Truyện đang mở** (Open novel) | one novel | progress, reading, editor notes, rewrite queue, outline, characters, world rules, foreshadowing, style, AI team, cost, session parameters, publish & import |

<p align="center">
  <img src="docs/assets/quan-ly.png" alt="The novel shelf: novel list, what-needs-you strip, overview" width="820">
</p>

<p align="center">
  <sub>The <b>novel shelf</b>. The strip at the top appears only when something genuinely waits
  on a person — here, a signed hold quoting the operator's own reason, and one note that has not
  been processed yet.</sub>
</p>

The control bar — which carries a real money-spending `Run` button — exists only on the open
novel screen, because a per-novel control has no business sitting under a surface that lists
every novel.

### One novel running at a time

The engine opens **exactly one** novel at a time. Writing many novels therefore means *managing*
them with a clear priority order, **not** running them in parallel: two at once is twice the
money and twice the RAM, and that is your call, not the machine's.

### Notes while it writes

While the AI is writing, type into the **Góp ý** (Notes) box and send — no pause, no restart.
The note is persisted (so it survives a crash), the Arbiter rules on it within seconds, and the
ruling is carried out: setting changes go through the Architect, rewrites of existing chapters
go to the Editor's queue, writing rules are persisted at once. Every ruling is auditable and
replayable.

### Publish & import

The **Xuất bản & nhập** zone of an open novel groups three file-based jobs:

- **Publish** — merge finished chapters into **TXT** or **EPUB 3**, optionally a chapter range.
  Works mid-run without disturbing the engine. Internal material (the premise, arc separators)
  never reaches the export.
- **Import an existing novel** — *semantically compile* a `.txt`/`.md` novel (UTF-8 or GB18030)
  into an **empty** novel so you can continue it. The model finds chapter boundaries, you confirm
  the split, and the pipeline extracts per-chapter facts and synthesises premise, characters,
  world rules, layered outline and compass. An interrupted import resumes without re-calling the
  model. Design: [docs/import-pipeline.md](docs/import-pipeline.md).
- **Learn a style** — build a style profile from sample prose, or import one built earlier. All
  three agents read it and learn structure, rhythm and hooks, never copying the source's wording.

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

The app is two processes: an Electron shell (window, menus, self-update) and a Go process that
runs the engine plus an HTTP API listening only on `127.0.0.1`. The interface is a static page
talking to that API. The engine runs **in the same process** as the API, so every write goes
through the same transactions the engine uses for itself — the engine stays the single source of
truth.

## Advanced configuration

Everything common — providers, API keys, default model, per-role models, reasoning effort — is
editable in **Cài đặt** (Settings). For what the UI does not cover (self-hosted proxies, custom
headers, Bedrock…): **quit the app**, edit `config.json` in the
[app data folder](#first-launch), and reopen. The Vietnamese README documents every field with
examples ([Cấu hình nâng cao](README.md#cấu-hình-nâng-cao)); the JSON is the same in any language.

## Privacy

There is no project server in the middle: your API key, novels and logs stay on your machine, and
model calls go straight from your machine to the provider you chose. The app's internal API
listens only on `127.0.0.1`. The API key is **write-only** — settable through the UI, never
returned; where it must be shown, it is masked (`sk-4…802`). There is no hosted version. Every
outbound connection the app makes and everything it stores is listed in
[PRIVACY.md](PRIVACY.md); the security surface is described in [SECURITY.md](SECURITY.md).

## Internationalisation

**Short version: the app is Vietnamese only, and the studio interface is not internationalised
at all.**

| Layer | Languages | Mechanism |
|---|---|---|
| Engine strings (Go) | `vi` (default), `zh` (upstream source) | `internal/i18n/` |
| Studio interface | `vi` only | none — strings hardcoded in `web/lib/nhan.ts` |

Adding a language is documented — including why it is more than a translation job for the
interface — in **[docs/i18n.md](docs/i18n.md)**.

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

- **Go 1.25** — engine and HTTP API
- **[agentcore](https://github.com/voocel/agentcore)** — minimal agent core (tool-calling + streaming)
- **[litellm](https://github.com/voocel/litellm)** — unified LLM adapter layer (a patched copy in
  `third_party/`, see [third_party/README.md](third_party/README.md))
- **Next.js (static export)** — the studio interface
- **Electron** — the desktop shell, packaging and self-update

## Contributing / building from source

Users only need to [download the app](#download--install). To change the code, build the app from
source, or cut a release, read **[CONTRIBUTING.md](CONTRIBUTING.md)** (Vietnamese; English issues
and PRs are welcome).

This is a fork, which shapes how contributions should be aimed:

- **Engine, architecture, agent behaviour** — these belong upstream. Please send them to
  [voocel/ainovel-cli](https://github.com/voocel/ainovel-cli) so everyone benefits, not just
  this fork.
- **Localisation, the studio, the desktop app, fork-specific docs** — those live here.

Security issues: please do **not** open a public issue — see [SECURITY.md](SECURITY.md).

## Credits

This is a **fork** of [voocel/ainovel-cli](https://github.com/voocel/ainovel-cli). The engine,
the architecture and the original design are upstream's work. **This fork is not the original
project.**

What the fork adds on top of upstream:

- **i18n layer** (`internal/i18n/`) — Vietnamese by default
- **Localised prompts / reference material / style guides** in `assets/`, so the model writes
  Vietnamese prose instead of Chinese
- **Studio** (`internal/serve/` + `web/`) — an HTTP API over the store plus a full operating
  surface (create · run · notes · review · configure · publish)
- **Desktop app** (`desktop/`) — an Electron shell that packages engine and studio into an
  installable app for macOS and Windows

The initial translation memory was taken from
[kentjuno/ainovel-cli](https://github.com/kentjuno/ainovel-cli) at commit `68eb92d` — thanks
for their localisation work.

### Reference projects

- [voocel/agentcore](https://github.com/voocel/agentcore) — the agent runtime the engine uses (a dependency).
- [voocel/litellm](https://github.com/voocel/litellm) — the model-provider layer; the modified copy lives in `third_party/litellm`.
- [LingoReup Desktop](https://github.com/huuhoa143/LingoReupDesktopApp) — the Electron + sidecar shell and the release / signing / notarisation pipeline in `desktop/` were adapted from it (same author).
- [manaflow-ai/cmux](https://github.com/manaflow-ai/cmux) — origin of the build → sign → notarise → staple release pattern that pipeline follows.

## Legal & community

- [Privacy policy](PRIVACY.md#english) — what the app sends, what it stores, how to delete it
- [Disclaimer](DISCLAIMER.md#english) — AI-generated content, API costs, no warranty
- [Code of conduct](CODE_OF_CONDUCT.md) · [Contributing](CONTRIBUTING.md) ·
  [Security policy](SECURITY.md#english-summary) · [Changelog](CHANGELOG.md)
- [NOTICE](NOTICE) — Apache-2.0 attribution; the app ships a full third-party license list
  (`THIRD_PARTY_NOTICES.md`, generated on every build by
  [`desktop/scripts/gen-legal.sh`](desktop/scripts/gen-legal.sh))

## License

Apache License 2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).

This project actively participates in and acknowledges the
[linux.do community](https://linux.do/).
