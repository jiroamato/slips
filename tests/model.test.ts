import { expect, test } from "bun:test";
import { generateId, newSlip, parseSlip } from "../src/lib/model";

test("generateId format and uniqueness against existing set", () => {
  const existing = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const id = generateId("sl", existing);
    expect(id).toMatch(/^sl-[0-9a-z]{4}$/);
    expect(existing.has(id)).toBe(false);
    existing.add(id);
  }
});

test("newSlip applies defaults", () => {
  const s = newSlip({ id: "sl-aaaa", title: "Test", now: new Date(0) });
  expect(s.status).toBe("open");
  expect(s.type).toBe("task");
  expect(s.priority).toBe(2);
  expect(s.labels).toEqual([]);
  expect(s.blocked_by).toEqual([]);
  expect(s.claim).toBeNull();
  expect(s.created_at).toBe("1970-01-01T00:00:00.000Z");
  expect(s.updated_at).toBe(s.created_at);
  expect(s.closed_at).toBeNull();
  expect(s.close_reason).toBeNull();
});

test("parseSlip round-trips a valid slip", () => {
  const s = newSlip({ id: "sl-bbbb", title: "Round trip" });
  expect(parseSlip(JSON.stringify(s))).toEqual(s);
});

test("parseSlip rejects invalid records", () => {
  expect(parseSlip("not json")).toBeNull();
  expect(parseSlip("{}")).toBeNull();
  expect(parseSlip(JSON.stringify({ id: "x", title: "t", status: "weird" }))).toBeNull();
  const noTitle = { ...newSlip({ id: "sl-cccc", title: "t" }), title: 42 };
  expect(parseSlip(JSON.stringify(noTitle))).toBeNull();
});
