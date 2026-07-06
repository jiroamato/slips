# slips — developer guide

CLI: `bun src/cli.ts <command>` during development (or `bun link` once, then `slip ...`).

## Commands

- `bun test` — full suite; `bunx tsc --noEmit` — types; `bunx biome check .` — lint/format
- All three must pass before any commit.

## Architecture

`src/lib/` is pure logic (unit-tested): model, storage (JSONL + lock), ready/cycles, prime rendering. `src/commands/` are thin parseArgs wrappers (smoke-tested via `tests/cli.test.ts`). Zero runtime dependencies — do not add any package to `dependencies`.

## Git workflow

- Branches: `feat/…`, `fix/…`, `chore/…` off `dev`; PRs squash-merge into `dev` with conventional titles.
- Releases: PR `dev` → `main`, **merge commit** (never squash); release-please handles version + changelog.
- Hotfixes: `hotfix/…` off `main`, back-merge `main` → `dev` after.
- Conventional commits everywhere.

## Issue tracking

This repo dogfoods itself — see the slips block below. Claim before working, close with a reason, `slip sync` before finishing.

<!-- slips:start -->
## Slips — issue tracking

This repo uses slips for agent issue tracking. State lives in `.slips/issues.jsonl`.

- `slip ready` — find unblocked work
- `slip claim <id> --agent <name>` — claim before working (lease-based; default TTL 60m)
- `slip create --title "..." [--type task|bug|feature|epic] [--priority 0-4]`
- `slip close <id> --reason "..."` · `slip release <id>` · `slip show <id>`
- `slip prime` — compact status block · `slip sync` — commit tracker changes
- Every command accepts `--json`.

Convention: claim before you work, close with a reason, file discovered follow-ups as new slips, `slip sync` before you finish.
<!-- slips:end -->
