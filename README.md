# slips

Git-native issue tracking for AI agents. No daemon, no database, no runtime dependencies — `.slips/issues.jsonl` is the database and git is the sync layer.

The minimal core of issue tracking, tuned for agents:

- **`slip prime`** — a token-budgeted context block (ready work, in-progress claims, recent closes) designed to be injected into an agent's prompt at session start.
- **Lease-based claims** — `slip claim <id> --agent <name>` takes a TTL lease so parallel agents never silently grab the same work. Crashed agents' leases expire on their own; clean exits release them via hook.
- **Zero runtime dependencies** — Bun + TypeScript, arg parsing from `node:util`.

## Install

```bash
bun install && bun link   # exposes `slip`
```

## Quick start

```bash
slip init --claude        # scaffold .slips/, onboarding blocks, Claude Code hooks
slip create --title "Ship the thing" --type feature --priority 1
slip ready                # what's unblocked and unclaimed?
slip claim sl-a1b2 --agent me
slip close sl-a1b2 --reason "shipped"
slip sync                 # commit tracker changes
```

Every command accepts `--json`.

## How it works

One JSON object per line in `.slips/issues.jsonl`. `slip init` sets `merge=union` for the file so parallel branches merge by concatenation; reads deduplicate by id keeping the newest `updated_at`. Writes are atomic (temp file + rename) behind an advisory lock. `slip doctor` checks integrity; `slip doctor --fix` repairs what's mechanically safe.

## Commands

```
Commands:
  init      Scaffold .slips/ in this repo (--prefix, --claude)
  create    Create a slip (--title, --type, --priority, --label, --blocked-by, --description)
  list      List slips (--status, --type, --label, --priority, --all)
  show      Show one slip
  update    Update fields (--title, --status, --type, --priority, --description, --add-label, --rm-label)
  close     Close a slip (--reason)
  search    Substring search across title/description/labels/id
  dep       dep add <id> <blocker> | dep rm <id> <blocker>
  ready     List ready work (open, unblocked, unclaimed)
  claim     Take a lease (--agent, --session, --ttl)
  release   Release claims (<id> | --session <sid> | --agent <name>)
  prime     Compact context block for agents (--budget)
  sync      Commit .slips/ changes to git (-m)
  doctor    Integrity checks (--fix)
```

## Workflow

`main` (releases) ← merge-commit PRs from `dev` (integration) ← squash PRs from `feat/…`, `fix/…` branches. Conventional commits; release-please maintains versioning and the changelog.

MIT.
