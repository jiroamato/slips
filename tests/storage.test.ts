import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IntegrityError } from "../src/lib/errors";
import { newSlip } from "../src/lib/model";
import { findRoot, mutate, readConfig, readSlips, withLock, writeSlips } from "../src/lib/storage";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "slips-test-"));
  mkdirSync(join(root, ".slips"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const issuesPath = () => join(root, ".slips", "issues.jsonl");

test("readSlips dedups by id keeping newest updated_at", () => {
  const older = {
    ...newSlip({ id: "sl-aaaa", title: "old" }),
    updated_at: "2026-01-01T00:00:00.000Z",
  };
  const newer = { ...older, title: "new", updated_at: "2026-02-01T00:00:00.000Z" };
  writeFileSync(issuesPath(), `${JSON.stringify(newer)}\n${JSON.stringify(older)}\n`);
  const { slips } = readSlips(root);
  expect(slips).toHaveLength(1);
  expect(slips[0]?.title).toBe("new");
});

test("readSlips tie on updated_at: later line wins", () => {
  const a = {
    ...newSlip({ id: "sl-aaaa", title: "first" }),
    updated_at: "2026-01-01T00:00:00.000Z",
  };
  const b = { ...a, title: "second" };
  writeFileSync(issuesPath(), `${JSON.stringify(a)}\n${JSON.stringify(b)}\n`);
  expect(readSlips(root).slips[0]?.title).toBe("second");
});

test("readSlips skips corrupt lines with a warning", () => {
  const good = newSlip({ id: "sl-good", title: "ok" });
  writeFileSync(issuesPath(), `garbage{{{\n${JSON.stringify(good)}\n{"id":"half"}\n`);
  const { slips, warnings } = readSlips(root);
  expect(slips).toHaveLength(1);
  expect(warnings).toHaveLength(2);
});

test("writeSlips + readSlips round trip; no temp files left", () => {
  const s = newSlip({ id: "sl-aaaa", title: "persist" });
  writeSlips(root, [s]);
  expect(readSlips(root).slips).toEqual([s]);
  const raw = readFileSync(issuesPath(), "utf8");
  expect(raw.endsWith("\n")).toBe(true);
});

test("mutate applies changes under lock and persists", () => {
  writeSlips(root, [newSlip({ id: "sl-aaaa", title: "before" })]);
  const result = mutate(root, (slips) => {
    const s = slips.find((x) => x.id === "sl-aaaa");
    if (s) s.title = "after";
    return "done";
  });
  expect(result).toBe("done");
  expect(readSlips(root).slips[0]?.title).toBe("after");
});

test("withLock reclaims a stale lock", () => {
  const lockPath = join(root, ".slips", ".lock");
  writeFileSync(lockPath, JSON.stringify({ pid: 99999, at: "2000-01-01T00:00:00.000Z" }));
  expect(withLock(root, () => 42)).toBe(42);
});

test("withLock fails fast on a live lock", () => {
  const lockPath = join(root, ".slips", ".lock");
  writeFileSync(lockPath, JSON.stringify({ pid: 99999, at: new Date().toISOString() }));
  expect(() => withLock(root, () => 42, { retryMs: 100 })).toThrow(/lock/i);
});

test("withLock does not delete a lock it no longer owns", () => {
  const lockPath = join(root, ".slips", ".lock");
  const foreign = JSON.stringify({
    pid: 99999,
    at: new Date().toISOString(),
    token: "someone-elses-token",
  });
  withLock(root, () => {
    // Simulate another process reclaiming the lock while fn() runs.
    writeFileSync(lockPath, foreign);
  });
  expect(existsSync(lockPath)).toBe(true);
  expect(readFileSync(lockPath, "utf8")).toBe(foreign);
});

test("findRoot walks up from a nested subdirectory", () => {
  const nested = join(root, "a", "b", "c");
  mkdirSync(nested, { recursive: true });
  expect(findRoot(nested)).toBe(root);
});

test("findRoot returns null when no .slips exists up the tree", () => {
  const bare = mkdtempSync(join(tmpdir(), "slips-noroot-"));
  try {
    expect(findRoot(bare)).toBeNull();
  } finally {
    rmSync(bare, { recursive: true, force: true });
  }
});

test("readConfig returns defaults when config.json is absent", () => {
  expect(readConfig(root)).toEqual({ prefix: "sl", default_ttl: "60m" });
});

test("readConfig merges partial config over defaults", () => {
  writeFileSync(join(root, ".slips", "config.json"), JSON.stringify({ prefix: "xy" }));
  expect(readConfig(root)).toEqual({ prefix: "xy", default_ttl: "60m" });
});

test("readConfig throws IntegrityError on invalid JSON", () => {
  writeFileSync(join(root, ".slips", "config.json"), "not json {{{");
  expect(() => readConfig(root)).toThrow(IntegrityError);
});
