import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newSlip } from "../src/lib/model";
import { mutate, readSlips, withLock, writeSlips } from "../src/lib/storage";

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
