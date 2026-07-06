# Slips — Design Spec

**Date:** 2026-07-05
**Status:** Approved pending user review

## Overview

Slips is a lightweight, git-native issue tracker built for AI agent workflows. It is inspired by [seeds](https://github.com/jayminwest/seeds) but deliberately smaller: the minimal core (issues, dependencies, ready-work detection) done better, with two differentiators aimed squarely at agents — a token-budgeted `prime` command for context injection, and lease-based claims so parallel agents never silently grab the same work.

No database daemon, no binary files, no runtime dependencies. The JSONL file is the database; git is the sync layer.

## Goals

- An agent can find unblocked work, claim it exclusively, and close it — entirely through a fast CLI.
- Tracker state can be injected into an agent's context automatically at session start, within a token budget.
- Multiple agents on the same machine or parallel branches can write concurrently without corruption.
- Zero runtime dependencies; installable and runnable anywhere Bun is.

## Non-Goals (v1)

- Plans / decomposition (seeds' plan surface), templates/convoys, extensions metadata.
- Event sourcing or audit history — state-based storage only.
- Markdown bodies or any human-facing storage format. Slips is for agents to read.
- Enforcement hooks that block agent behavior.
- A web UI, server, or daemon of any kind.

## Storage

- `.slips/issues.jsonl` — the database. One JSON object per line, one line per slip.
- `.slips/config.json` — project config: id prefix, default type/priority, default claim TTL.
- `.gitattributes` — `slip init` adds `.slips/issues.jsonl merge=union` so parallel-branch merges concatenate rather than conflict.

**Write path:** read entire file → mutate in memory → write to temp file in the same directory → atomic rename over the original. Writes are guarded by an advisory lock file `.slips/.lock` (created with `O_EXCL`, contains pid + timestamp, considered stale and reclaimable after 30 seconds).

**Read path:** parse every line; if the same id appears more than once (post-merge state), keep the record with the newest `updated_at` (tiebreak: last occurrence in the file). The next write compacts duplicates away naturally.

**Corrupt lines:** unparseable lines are skipped on read with a warning to stderr; `slip doctor` reports them and `slip doctor --fix` drops them.

## Data Model

```ts
interface Slip {
  id: string;            // "<prefix>-<4 base36 chars>", e.g. "sl-x7k2"; random so branches never collide
  title: string;
  description: string;   // plain text, default ""
  status: "open" | "in_progress" | "closed";
  type: "task" | "bug" | "feature" | "epic";
  priority: 0 | 1 | 2 | 3 | 4;   // 0 = critical, 4 = backlog; default 2
  labels: string[];
  blocked_by: string[];  // slip ids that must be closed before this is ready
  claim: Claim | null;
  created_at: string;    // ISO 8601 UTC
  updated_at: string;
  closed_at: string | null;
  close_reason: string | null;
}

interface Claim {
  agent: string;         // who claimed it (free-form name)
  session_id: string | null;  // harness session id if available, for release-by-session
  expires_at: string;    // ISO 8601; lease is dead after this regardless of session state
}
```

**Semantics:**

- A slip is **ready** when: `status` is `open`, every id in `blocked_by` refers to a `closed` slip (unknown ids count as blocking and are flagged by `doctor`), and it has no live claim.
- A **live claim** is a non-null `claim` with `expires_at` in the future. Expired claims are treated as absent everywhere (and compacted to `null` on next write of that slip).
- `claim` succeeds only if there is no live claim by a *different* agent; re-claiming your own slip refreshes the lease. Claiming sets `status` to `in_progress`. Closed slips cannot be claimed.
- `release` (any form) clears the claim and sets the slip's status back to `open`.
- `close` clears the claim, sets `closed_at`, and accepts an optional `--reason`.
- Reopening (`update --status open`) clears `closed_at`/`close_reason`.

## CLI

Command: `slip`. Every command accepts `--json` for machine-readable output (objects on success, `{"error": "..."}` on failure). Exit code 0 on success, 1 on user error (bad args, claim conflict, missing id), 2 on integrity/IO errors. Human output is plain text — no colors in v1.

| Command | Behavior |
|---|---|
| `slip init [--claude] [--prefix <p>]` | Create `.slips/`, config, gitattributes entry; offer AGENTS.md/CLAUDE.md onboarding block. `--claude` also writes Claude Code hooks (below). |
| `slip create --title <t> [--type] [--priority] [--label ...] [--blocked-by ...] [--description]` | Create a slip; prints id. |
| `slip list [--status] [--type] [--label] [--priority] [--all]` | Filterable listing; default hides closed. |
| `slip show <id>` | Full record. |
| `slip update <id> [--title] [--status] [--type] [--priority] [--description] [--add-label/--rm-label]` | Field updates; bumps `updated_at`. |
| `slip close <id> [--reason <r>]` | Close + clear claim. |
| `slip search <query>` | Case-insensitive substring match over title, description, labels, id. |
| `slip dep add <id> <blocker-id>` / `slip dep rm <id> <blocker-id>` | Manage `blocked_by`. Cycles rejected at add time. |
| `slip ready` | Ready slips (definition above), sorted by priority then `created_at`. |
| `slip claim <id> --agent <name> [--session <sid>] [--ttl <dur>]` | Take/refresh a lease (default TTL 60m, config-overridable; durations like `90m`, `2h`). Fails loudly on another agent's live lease. |
| `slip release <id>` / `slip release --session <sid>` / `slip release --agent <name>` | Clear matching claim(s) and set those slips back to `open`. |
| `slip prime [--budget <tokens>]` | Agent context block (below). |
| `slip sync [-m <msg>]` | `git add .slips && git commit` scoped to `.slips/` only; no-op with message if clean. |
| `slip doctor [--fix]` | Integrity checks: duplicate ids, dangling/unknown `blocked_by`, dependency cycles, corrupt lines, expired-but-present claims, stale lock. `--fix` repairs what is mechanically safe. |

## `slip prime`

The flagship agent feature. Emits a compact plain-text block designed for prompt injection:

1. Header: project prefix, counts (open / in_progress / closed).
2. **Ready work** — top ready slips with id, priority, title, labels.
3. **In progress** — who holds each claim and when the lease expires.
4. **Recently closed** — last few, id + title + reason, for continuity.
5. Footer: one-line command hints (`slip claim <id> --agent <you>`, `slip close <id>`).

`--budget <tokens>` (default 1000) caps output; estimation is `ceil(chars / 4)`. Sections are trimmed in reverse priority order (recently-closed first, then in-progress, then ready-work tail) until under budget. `--json` emits the same data structurally, un-trimmed.

## Claude Code Integration (`slip init --claude`)

Writes/merges into `.claude/settings.json`:

- **SessionStart** hook → `slip prime` (stdout is injected as session context).
- **SessionEnd** hook → `slip release --session $CLAUDE_SESSION_ID` (frees leases on clean exit; TTL expiry covers crashes — the two are complementary).

Also appends the onboarding block (`<!-- slips:start -->` … `<!-- slips:end -->`) to CLAUDE.md and AGENTS.md: what slips is, the command cheat-sheet, and the claim-before-work convention. No enforcement hooks (PreToolUse/Stop) — context injection over policing. Hook merging preserves any existing hooks in settings.json.

## Stack

- **Runtime:** Bun (>= 1.1), TypeScript, ES modules.
- **Runtime dependencies: none.** Arg parsing via `node:util` `parseArgs` with `argv[2]` subcommand routing.
- **Dev tooling:** `bun test`, Biome (lint + format), `tsc --noEmit` for typechecking.
- **Distribution:** run via `bun src/cli.ts` locally, `bunx slips` / npm publish later; `bun build --compile` single-binary escape hatch when wanted.

## Repository Layout

```
slips/
├── src/
│   ├── cli.ts              # entry: subcommand routing, --json/--help plumbing
│   ├── commands/           # one file per command (init, create, list, ...)
│   └── lib/
│       ├── model.ts        # Slip/Claim types, validation, id generation
│       ├── storage.ts      # read (dedup), atomic write, lock
│       ├── ready.ts        # ready/blocking/lease resolution
│       ├── prime.ts        # prime rendering + budget trimming
│       └── time.ts         # ISO timestamps, TTL duration parsing
├── tests/                  # bun test; unit tests over lib/, CLI smoke tests
├── docs/superpowers/specs/ # design docs (this file)
├── CLAUDE.md               # agent onboarding for developing slips (+ mulch/slips blocks)
├── AGENTS.md               # harness-agnostic mirror of the onboarding
├── README.md
├── LICENSE                 # MIT
├── package.json / tsconfig.json / biome.json
└── .slips/                 # slips dogfoods itself for its own issue tracking
```

The repo also gets `.mulch/` (via `ml init`) as its memory system, and is published public on GitHub via `gh repo create`.

## Git Workflow

**Branching:** `main` (releases only) and `dev` (integration). Feature branches cut from `dev`, named after conventional-commit types: `feat/…`, `fix/…`, `chore/…`, `docs/…`. Hotfixes: `hotfix/…` off `main`, PR to `main`, then back-merge `main` → `dev`.

**Merging:**
- Feature → dev: **squash and merge**. The PR title becomes the commit message, so PR titles must be conventional; enforced in CI by `amannn/action-semantic-pull-request`.
- Dev → main (release PRs): **merge commit** — never squash, so per-feature conventional commits reach `main` intact for changelog generation and `main`/`dev` stay aligned.

**Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`; `!` or `BREAKING CHANGE:` for majors). Semver derives from them: `fix` → patch, `feat` → minor, breaking → major.

**Releases:** `release-please` GitHub Action watches `main`, maintains a running release PR with the version bump and generated `CHANGELOG.md`, and tags on merge.

**CI (GitHub Actions):** on every PR — `bun test`, Biome check, `tsc --noEmit`, PR title lint.

**Branch protection:** `main` and `dev` accept PRs only (no direct pushes, no force pushes), required status checks: test, lint, typecheck.

## Error Handling

- All user-facing failures print one clear line to stderr (or `{"error"}` with `--json`) and exit 1.
- Lock contention: retry briefly (~3s with backoff), then fail with a message naming the lock holder pid; never queue indefinitely.
- Claim conflict message includes the holding agent and lease expiry so the losing agent knows when to retry.
- Storage never partially writes: temp-file + rename or nothing.

## Testing

Unit tests over the pure logic, CLI smoke tests over the wiring:

- **storage:** dedup-on-read (newest `updated_at` wins, last-line tiebreak), atomic write, corrupt-line skipping, lock staleness.
- **ready:** blocking resolution, unknown-id-blocks rule, lease-expiry interaction, sort order.
- **claims:** conflict rejection, self-refresh, TTL parsing, release by id/session/agent.
- **prime:** section ordering, budget trimming order, token estimation.
- **cycles:** `dep add` cycle rejection.
- **CLI smoke:** each command exercised end-to-end against a temp directory, `--json` shape assertions.
