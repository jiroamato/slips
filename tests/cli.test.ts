import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
