import { expect, test } from "bun:test";
import { type Slip, newSlip } from "../src/lib/model";
import { isLiveClaim, isReady, readySlips, wouldCycle } from "../src/lib/ready";

const future = new Date(Date.now() + 3_600_000).toISOString();
const past = "2000-01-01T00:00:00.000Z";

function make(id: string, over: Partial<Slip> = {}): Slip {
  return { ...newSlip({ id, title: id }), ...over };
}
const byId = (slips: Slip[]) => new Map(slips.map((s) => [s.id, s]));

test("isLiveClaim: null, expired, live", () => {
  expect(isLiveClaim(null)).toBe(false);
  expect(isLiveClaim({ agent: "a", session_id: null, expires_at: past })).toBe(false);
  expect(isLiveClaim({ agent: "a", session_id: null, expires_at: future })).toBe(true);
});

test("isReady: only open, unblocked, unclaimed slips", () => {
  const blocker = make("sl-bloc");
  const blocked = make("sl-wait", { blocked_by: ["sl-bloc"] });
  const unknown = make("sl-unkn", { blocked_by: ["sl-none"] });
  const claimed = make("sl-clam", { claim: { agent: "a", session_id: null, expires_at: future } });
  const expired = make("sl-expd", { claim: { agent: "a", session_id: null, expires_at: past } });
  const closed = make("sl-done", { status: "closed" });
  const all = byId([blocker, blocked, unknown, claimed, expired, closed]);
  expect(isReady(blocker, all)).toBe(true);
  expect(isReady(blocked, all)).toBe(false);
  expect(isReady(unknown, all)).toBe(false); // unknown blocker ids block
  expect(isReady(claimed, all)).toBe(false);
  expect(isReady(expired, all)).toBe(true); // expired lease = unclaimed
  expect(isReady(closed, all)).toBe(false);
});

test("isReady: becomes true once blocker closes", () => {
  const blocker = make("sl-bloc", { status: "closed" });
  const blocked = make("sl-wait", { blocked_by: ["sl-bloc"] });
  expect(isReady(blocked, byId([blocker, blocked]))).toBe(true);
});

test("readySlips sorts by priority then created_at", () => {
  const p1 = make("sl-p1xx", { priority: 1, created_at: "2026-01-02T00:00:00.000Z" });
  const p1old = make("sl-p1o", { priority: 1, created_at: "2026-01-01T00:00:00.000Z" });
  const p0 = make("sl-p0xx", { priority: 0, created_at: "2026-01-03T00:00:00.000Z" });
  expect(readySlips([p1, p1old, p0]).map((s) => s.id)).toEqual(["sl-p0xx", "sl-p1o", "sl-p1xx"]);
});

test("wouldCycle: self, direct, transitive, and none", () => {
  const a = make("sl-a", { blocked_by: ["sl-b"] });
  const b = make("sl-b", { blocked_by: ["sl-c"] });
  const c = make("sl-c");
  const slips = [a, b, c];
  expect(wouldCycle(slips, "sl-a", "sl-a")).toBe(true);
  expect(wouldCycle(slips, "sl-b", "sl-a")).toBe(true); // a already depends on b
  expect(wouldCycle(slips, "sl-c", "sl-a")).toBe(true); // a → b → c, adding c → a closes loop
  expect(wouldCycle(slips, "sl-a", "sl-c")).toBe(false);
});
