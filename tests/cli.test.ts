import { expect, test } from "bun:test";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeRepo, runSlip } from "./helpers";

test("unknown command exits 1 with message", () => {
  const repo = makeRepo();
  const r = runSlip(repo, "frobnicate");
  expect(r.code).toBe(1);
  expect(r.err).toContain("unknown command");
});

test("init scaffolds .slips, config, gitattributes, onboarding blocks", () => {
  const repo = makeRepo();
  const r = runSlip(repo, "init", "--prefix", "sx");
  expect(r.code).toBe(0);
  expect(existsSync(join(repo, ".slips", "issues.jsonl"))).toBe(true);
  const config = JSON.parse(readFileSync(join(repo, ".slips", "config.json"), "utf8"));
  expect(config.prefix).toBe("sx");
  expect(readFileSync(join(repo, ".gitattributes"), "utf8")).toContain("merge=union");
  expect(readFileSync(join(repo, "AGENTS.md"), "utf8")).toContain("<!-- slips:start -->");
  expect(readFileSync(join(repo, "CLAUDE.md"), "utf8")).toContain("<!-- slips:start -->");
});

test("init is idempotent — no duplicate blocks or attributes", () => {
  const repo = makeRepo();
  runSlip(repo, "init");
  const r = runSlip(repo, "init");
  expect(r.code).toBe(0);
  const attrs = readFileSync(join(repo, ".gitattributes"), "utf8");
  expect(attrs.match(/merge=union/g)).toHaveLength(1);
  const agents = readFileSync(join(repo, "AGENTS.md"), "utf8");
  expect(agents.match(/<!-- slips:start -->/g)).toHaveLength(1);
});

test("init --claude writes SessionStart and SessionEnd hooks, preserving existing settings", () => {
  const repo = makeRepo();
  const settingsDir = join(repo, ".claude");
  mkdirSync(settingsDir, { recursive: true });
  writeFileSync(
    join(settingsDir, "settings.json"),
    JSON.stringify({ permissions: { allow: ["Bash"] } }),
  );
  const r = runSlip(repo, "init", "--claude");
  expect(r.code).toBe(0);
  const settings = JSON.parse(readFileSync(join(settingsDir, "settings.json"), "utf8"));
  expect(settings.permissions).toEqual({ allow: ["Bash"] }); // preserved
  const start = JSON.stringify(settings.hooks.SessionStart);
  const end = JSON.stringify(settings.hooks.SessionEnd);
  expect(start).toContain("slip prime");
  expect(end).toContain("slip release --session");
  // idempotent
  runSlip(repo, "init", "--claude");
  const again = JSON.parse(readFileSync(join(settingsDir, "settings.json"), "utf8"));
  expect(again.hooks.SessionStart).toHaveLength(1);
});

test("create prints id and persists; show round-trips", () => {
  const repo = makeRepo();
  runSlip(repo, "init");
  const r = runSlip(
    repo,
    "create",
    "--title",
    "First slip",
    "--type",
    "bug",
    "--priority",
    "1",
    "--label",
    "core",
  );
  expect(r.code).toBe(0);
  const id = r.out.trim();
  expect(id).toMatch(/^sl-[0-9a-z]{4}$/);
  const shown = JSON.parse(runSlip(repo, "show", id, "--json").out);
  expect(shown.title).toBe("First slip");
  expect(shown.type).toBe("bug");
  expect(shown.priority).toBe(1);
  expect(shown.labels).toEqual(["core"]);
});

test("create validates inputs", () => {
  const repo = makeRepo();
  runSlip(repo, "init");
  expect(runSlip(repo, "create").code).toBe(1); // no title
  expect(runSlip(repo, "create", "--title", "x", "--type", "story").code).toBe(1);
  expect(runSlip(repo, "create", "--title", "x", "--priority", "9").code).toBe(1);
  expect(runSlip(repo, "create", "--title", "x", "--blocked-by", "sl-nope").code).toBe(1);
});

test("search matches title/description/labels/id case-insensitively", () => {
  const repo = makeRepo();
  runSlip(repo, "init");
  const a = runSlip(repo, "create", "--title", "Fix LOGIN flow").out.trim();
  runSlip(repo, "create", "--title", "Other", "--description", "touches login too");
  const hits = JSON.parse(runSlip(repo, "search", "login", "--json").out);
  expect(hits).toHaveLength(2);
  const byId = JSON.parse(runSlip(repo, "search", a, "--json").out);
  expect(byId).toHaveLength(1);
});

test("list filters and hides closed by default", () => {
  const repo = makeRepo();
  runSlip(repo, "init");
  const a = runSlip(repo, "create", "--title", "Open task").out.trim();
  const b = runSlip(repo, "create", "--title", "A bug", "--type", "bug").out.trim();
  runSlip(repo, "close", b);
  const open = JSON.parse(runSlip(repo, "list", "--json").out);
  expect(open.map((s: { id: string }) => s.id)).toEqual([a]);
  const all = JSON.parse(runSlip(repo, "list", "--all", "--json").out);
  expect(all).toHaveLength(2);
  const bugs = JSON.parse(runSlip(repo, "list", "--all", "--type", "bug", "--json").out);
  expect(bugs.map((s: { id: string }) => s.id)).toEqual([b]);
});

test("update edits fields; reopen clears closed metadata", () => {
  const repo = makeRepo();
  runSlip(repo, "init");
  const id = runSlip(repo, "create", "--title", "Original").out.trim();
  runSlip(repo, "update", id, "--title", "Renamed", "--priority", "0", "--add-label", "hot");
  let s = JSON.parse(runSlip(repo, "show", id, "--json").out);
  expect(s.title).toBe("Renamed");
  expect(s.priority).toBe(0);
  expect(s.labels).toEqual(["hot"]);
  runSlip(repo, "close", id, "--reason", "done");
  runSlip(repo, "update", id, "--status", "open");
  s = JSON.parse(runSlip(repo, "show", id, "--json").out);
  expect(s.status).toBe("open");
  expect(s.closed_at).toBeNull();
  expect(s.close_reason).toBeNull();
});

test("close sets closed_at, reason, clears claim", () => {
  const repo = makeRepo();
  runSlip(repo, "init");
  const id = runSlip(repo, "create", "--title", "To close").out.trim();
  runSlip(repo, "claim", id, "--agent", "tester");
  const r = runSlip(repo, "close", id, "--reason", "fixed");
  expect(r.code).toBe(0);
  const s = JSON.parse(runSlip(repo, "show", id, "--json").out);
  expect(s.status).toBe("closed");
  expect(s.close_reason).toBe("fixed");
  expect(s.claim).toBeNull();
  expect(s.closed_at).not.toBeNull();
});

test("update --status closed clears claim", () => {
  const repo = makeRepo();
  runSlip(repo, "init");
  const id = runSlip(repo, "create", "--title", "Claimed work").out.trim();
  const slip = JSON.parse(runSlip(repo, "show", id, "--json").out);
  slip.claim = {
    agent: "x",
    session_id: null,
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  };
  slip.updated_at = new Date(Date.now() + 1_000).toISOString();
  appendFileSync(join(repo, ".slips", "issues.jsonl"), `${JSON.stringify(slip)}\n`);
  runSlip(repo, "update", id, "--status", "closed");
  const s = JSON.parse(runSlip(repo, "show", id, "--json").out);
  expect(s.status).toBe("closed");
  expect(s.claim).toBeNull();
});

test("re-close preserves closed_at and reason", () => {
  const repo = makeRepo();
  runSlip(repo, "init");
  const id = runSlip(repo, "create", "--title", "Close twice").out.trim();
  runSlip(repo, "close", id, "--reason", "first");
  const first = JSON.parse(runSlip(repo, "show", id, "--json").out);
  const r = runSlip(repo, "close", id);
  expect(r.code).toBe(0);
  const s = JSON.parse(runSlip(repo, "show", id, "--json").out);
  expect(s.closed_at).toBe(first.closed_at);
  expect(s.close_reason).toBe("first");
});

test("dep add is idempotent", () => {
  const repo = makeRepo();
  runSlip(repo, "init");
  const a = runSlip(repo, "create", "--title", "A").out.trim();
  const b = runSlip(repo, "create", "--title", "B").out.trim();
  expect(runSlip(repo, "dep", "add", a, b).code).toBe(0);
  expect(runSlip(repo, "dep", "add", a, b).code).toBe(0);
  const s = JSON.parse(runSlip(repo, "show", a, "--json").out);
  expect(s.blocked_by).toEqual([b]);
});

test("dep add/rm with cycle and unknown-id rejection", () => {
  const repo = makeRepo();
  runSlip(repo, "init");
  const a = runSlip(repo, "create", "--title", "A").out.trim();
  const b = runSlip(repo, "create", "--title", "B").out.trim();
  expect(runSlip(repo, "dep", "add", a, b).code).toBe(0);
  expect(runSlip(repo, "dep", "add", b, a).code).toBe(1); // cycle
  expect(runSlip(repo, "dep", "add", a, "sl-nope").code).toBe(1); // unknown
  expect(runSlip(repo, "dep", "rm", a, b).code).toBe(0);
  const s = JSON.parse(runSlip(repo, "show", a, "--json").out);
  expect(s.blocked_by).toEqual([]);
});

test("claim takes a lease, blocks rivals, allows self-refresh", () => {
  const repo = makeRepo();
  runSlip(repo, "init");
  const id = runSlip(repo, "create", "--title", "Contended").out.trim();
  expect(runSlip(repo, "claim", id, "--agent", "alice", "--session", "s1").code).toBe(0);
  const s = JSON.parse(runSlip(repo, "show", id, "--json").out);
  expect(s.status).toBe("in_progress");
  expect(s.claim.agent).toBe("alice");
  const rival = runSlip(repo, "claim", id, "--agent", "bob");
  expect(rival.code).toBe(1);
  expect(rival.err).toContain("alice");
  expect(runSlip(repo, "claim", id, "--agent", "alice", "--ttl", "2h").code).toBe(0); // refresh
  runSlip(repo, "close", id);
  expect(runSlip(repo, "claim", id, "--agent", "bob").code).toBe(1); // closed slips unclaimable
});

test("release by id and by session reopens slips", () => {
  const repo = makeRepo();
  runSlip(repo, "init");
  const a = runSlip(repo, "create", "--title", "A").out.trim();
  const b = runSlip(repo, "create", "--title", "B").out.trim();
  runSlip(repo, "claim", a, "--agent", "alice", "--session", "s1");
  runSlip(repo, "claim", b, "--agent", "alice", "--session", "s1");
  runSlip(repo, "release", a);
  let s = JSON.parse(runSlip(repo, "show", a, "--json").out);
  expect(s.status).toBe("open");
  expect(s.claim).toBeNull();
  runSlip(repo, "release", "--session", "s1");
  s = JSON.parse(runSlip(repo, "show", b, "--json").out);
  expect(s.claim).toBeNull();
});

test("release rejects combined selectors", () => {
  const repo = makeRepo();
  runSlip(repo, "init");
  const a = runSlip(repo, "create", "--title", "A").out.trim();
  const b = runSlip(repo, "create", "--title", "B").out.trim();
  runSlip(repo, "claim", a, "--agent", "alice", "--session", "s1");
  runSlip(repo, "claim", b, "--agent", "bob", "--session", "s2");
  const r = runSlip(repo, "release", "--session", "s1", "--agent", "bob");
  expect(r.code).toBe(1);
  expect(r.err).toContain("exactly one");
  const sa = JSON.parse(runSlip(repo, "show", a, "--json").out);
  expect(sa.claim).not.toBeNull();
  const sb = JSON.parse(runSlip(repo, "show", b, "--json").out);
  expect(sb.claim).not.toBeNull();
});

test("ready lists open unblocked unclaimed work in priority order", () => {
  const repo = makeRepo();
  runSlip(repo, "init");
  const low = runSlip(repo, "create", "--title", "Low", "--priority", "3").out.trim();
  const high = runSlip(repo, "create", "--title", "High", "--priority", "0").out.trim();
  const blocked = runSlip(repo, "create", "--title", "Blocked", "--blocked-by", high).out.trim();
  const claimed = runSlip(repo, "create", "--title", "Claimed").out.trim();
  runSlip(repo, "claim", claimed, "--agent", "x");
  const ready = JSON.parse(runSlip(repo, "ready", "--json").out);
  expect(ready.map((s: { id: string }) => s.id)).toEqual([high, low]);
  runSlip(repo, "close", high);
  const after = JSON.parse(runSlip(repo, "ready", "--json").out);
  expect(after.map((s: { id: string }) => s.id)).toContain(blocked);
});

test("prime renders sections and respects --budget", () => {
  const repo = makeRepo();
  runSlip(repo, "init");
  runSlip(repo, "create", "--title", "Ready work", "--priority", "1");
  const wip = runSlip(repo, "create", "--title", "Working").out.trim();
  runSlip(repo, "claim", wip, "--agent", "alice");
  const done = runSlip(repo, "create", "--title", "Finished").out.trim();
  runSlip(repo, "close", done, "--reason", "shipped");
  const full = runSlip(repo, "prime");
  expect(full.code).toBe(0);
  expect(full.out).toContain("Ready");
  expect(full.out).toContain("alice");
  expect(full.out).toContain("Finished");
  const tiny = runSlip(repo, "prime", "--budget", "40");
  expect(tiny.out).toContain("Ready work");
  expect(tiny.out).not.toContain("Finished");
});

test("sync commits only .slips changes; clean tree is a no-op", () => {
  const repo = makeRepo();
  Bun.spawnSync(["git", "config", "user.email", "t@t"], { cwd: repo });
  Bun.spawnSync(["git", "config", "user.name", "t"], { cwd: repo });
  runSlip(repo, "init");
  runSlip(repo, "create", "--title", "Tracked");
  const r = runSlip(repo, "sync", "-m", "chore: sync slips");
  expect(r.code).toBe(0);
  const log = Bun.spawnSync(["git", "log", "--oneline"], { cwd: repo }).stdout.toString();
  expect(log).toContain("chore: sync slips");
  const again = runSlip(repo, "sync");
  expect(again.code).toBe(0);
  expect(again.out).toContain("nothing to sync");
});

test("doctor reports problems and --fix repairs the mechanical ones", () => {
  const repo = makeRepo();
  runSlip(repo, "init");
  const id = runSlip(repo, "create", "--title", "Valid").out.trim();
  const issues = join(repo, ".slips", "issues.jsonl");
  appendFileSync(issues, "corrupt line{{{\n");
  const r = runSlip(repo, "doctor");
  expect(r.code).toBe(2);
  expect(r.out + r.err).toContain("corrupt");
  const fix = runSlip(repo, "doctor", "--fix");
  expect(fix.code).toBe(0);
  const clean = runSlip(repo, "doctor");
  expect(clean.code).toBe(0);
  expect(JSON.parse(runSlip(repo, "show", id, "--json").out).id).toBe(id); // survivor intact
});
