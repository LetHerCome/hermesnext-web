# HermesNext Web Foundation Adoption

Status: **Foundation frozen** — approved Mission 13 classification. This document is the permanent, committed record of what this repository is, why it exists, and what may and may not be done to it without a new mission.

## Source revision

- Upstream: [`albidev/hermes-mission-control`](https://github.com/albidev/hermes-mission-control)
- Pinned commit: `fa89852f2eba70ad4fc3753415acc021255a2498`
- This repository's `main` branch is pinned exactly at that commit, plus one carried-fixes commit on top (see below). Upstream history is preserved in full — this is a real clone with the complete commit graph, not a squashed or re-authored copy.

## Remotes

- `origin` — `https://github.com/LetHerCome/hermesnext-web.git` (this permanent repository)
- `upstream` — `https://github.com/albidev/hermes-mission-control.git` (the original project; tracked for future re-sync, never pushed to)

## Carried fixes

Exactly two changes were carried forward from the validated probe clone (`F:/AI/probes/hermes-mission-control`, same pinned commit), each already independently investigated and proven there before being carried here verbatim (byte-identical, same SHA-256 hashes):

1. **`scripts/run-local-telemetry.sh`** — Windows Python interpreter resolution. Adds a `Scripts/python.exe` (Windows venv layout) candidate and a bare `python` fallback to the existing POSIX-only `bin/python` / `python3` resolution chain, so the telemetry sidecar launcher can find a working interpreter on native Windows.
2. **`src/components/overview/ProviderUsagePanel.tsx`** — defensive defaulting. `provider.balances` and `provider.metrics` are defaulted to `[]` before being filtered, because the live Hermes sidecar's `/api/local/provider-usage` response omits those keys entirely (not empty arrays) for any CLI-backed provider (Codex/Ollama/OpenRouter) that isn't configured — which crashed the entire app into `AppErrorBoundary` on every single load in that environment. Root-caused and reproduced live via headless Chrome over the DevTools Protocol; full investigation is in the probe's crash report (`HERMESNEXT-FRONTEND-CRASH-REPORT.md`, probe evidence).

No other runtime behavior was changed, and no UI component was altered beyond that one defensive fix. Nothing was carried from `.venv-probe/`, probe evidence directories, temporary files, logs, or build/runtime artifacts — only the two source diffs.

## Boundaries

- **No Hermes core changes.** This repository has zero dependency on modifying `albidev`'s upstream Hermes core, and this mission made none. The one core-coupled optional patch upstream ships (`patches/hermes-core-mission-control-api_server.patch`) remains untouched and unnecessary for the gateway/chat/session path, which already works natively against the currently installed Hermes Agent v0.21.1 (see the compatibility report referenced below).
- **No product features implemented here.** Projects, Missions, Attention/Approval, executor visibility, governance state, and the full Chat page are **not** implemented in this repository. This is a foundation-freeze mission, not a product mission.
- **No UI redesign.** The existing visual UI, navigation, and component structure are preserved exactly as upstream shipped them, with the one defensive-coding exception noted above.
- **Design reference, not source.** [`sharbelxyz/hermes-agent-mission-control`](https://github.com/sharbelxyz/hermes-agent-mission-control) is a **design reference only** for future product work. It is explicitly **not** a source of code, architecture, or dependencies for this repository or any future mission building on it.

## Foundation freeze matrix

This is the approved Mission 13 classification of every major surface in the inherited codebase, frozen as the basis for all future HermesNext web product work. Each surface's disposition below is a decision, not a suggestion — changing a disposition requires a new mission, not an incidental edit.

### KEEP — reuse as-is, no product-facing change
- Gateway transport (`/api/ws` WebSocket JSON-RPC)
- Auth (loopback token + WS-ticket flows)
- Session lifecycle (`session.create` / `.resume` / `.close` / `.delete` / `.interrupt`)
- Streaming chat (message deltas, completion)
- Reasoning/tool event handling
- Reconnect/replay (`session.events.since`, `replay_epoch`)
- Telemetry sidecar (Python stdlib + psutil, zero-core-dependency architecture)
- Skills backend
- Tools backend
- Cron backend
- Config backend
- Logs backend

### TWEAK — minor adjustment, same surface
- Sessions UI
- Usage UI
- Chat drawer
- Responsive behavior

### ADAPT — repurpose the existing mechanism for a new product concept
- Kanban → future Projects/Missions
- Cron → user-facing Automations
- Agents trace → advanced inspection/debug surface

### HIDE_ADVANCED — keep the backend, move the UI behind an advanced/debug layer
- Skills
- Tools
- Config
- Logs
- Detailed Usage
- Raw execution traces

### REPLACE — current implementation will not carry forward as-is
- Current Home/Overview
- Primary navigation hierarchy
- Primary Agents presentation

### ADD — does not exist yet, net-new product surface
- Projects
- Missions
- Attention/Approval
- Executor visibility
- Governance state
- Full Chat page

## Mission 14 and beyond

**Mission 14 must implement product and visual changes separately from this foundation-freeze mission.** This repository's `main` branch, as committed by Mission 13, contains only: the pinned upstream source, the two carried compatibility fixes, and this document. Any REPLACE/ADD/ADAPT/HIDE_ADVANCED work from the matrix above is explicitly out of scope for Mission 13 and belongs to a subsequent, separately-scoped mission that treats this commit as its starting point.

Recommended Mission 14 scope, in priority order:
1. REPLACE Home/Overview and primary navigation with the new HermesNext information architecture (Projects/Missions-first, not Hermes-agent-first).
2. ADD Projects and Missions as first-class surfaces, built additively (new routes/plugins) rather than as invasive edits to the KEEP set, per the fork-risk guidance in the compatibility report below.
3. ADD Attention/Approval and executor visibility, using the gateway's existing `approval.respond`/`groups.approve` RPC surface (already confirmed present and working — see the compatibility report) rather than inventing a new protocol.
4. ADAPT Cron into Automations and Kanban into Projects/Missions once the new information architecture exists to host them.
5. HIDE_ADVANCED the Skills/Tools/Config/Logs/Usage-detail/raw-trace surfaces behind an explicit advanced/debug entry point, rather than deleting them — they remain KEEP at the backend level.
6. Use `sharbelxyz/hermes-agent-mission-control` only for visual/UX reference during this work, never as a code or architecture source.

## Related evidence

- Compatibility findings against the live Hermes Agent v0.21.1 gateway (G2–G8 live validation, RPC contract confirmation): probe evidence, `HERMESNEXT-CURRENT-HERMES-COMPATIBILITY-REPORT.md`.
- Frontend crash root cause and fix investigation (the second carried fix above): probe evidence, `HERMESNEXT-FRONTEND-CRASH-REPORT.md`.
- This mission's own baseline verification against this permanent repository: `F:/AI/evidence/HERMESNEXT-FOUNDATION-ADOPTION-20260913/HERMESNEXT-FOUNDATION-ADOPTION-REPORT.md`.
