import { expect, test } from "bun:test";
import { isExpired, nowIso, parseTtl } from "../src/lib/time";

test("parseTtl parses s/m/h/d units to milliseconds", () => {
  expect(parseTtl("30s")).toBe(30_000);
  expect(parseTtl("45m")).toBe(45 * 60_000);
  expect(parseTtl("2h")).toBe(2 * 3_600_000);
  expect(parseTtl("1d")).toBe(86_400_000);
});

test("parseTtl rejects invalid durations", () => {
  expect(() => parseTtl("soon")).toThrow();
  expect(() => parseTtl("10")).toThrow();
  expect(() => parseTtl("m30")).toThrow();
  expect(() => parseTtl("")).toThrow();
});

test("isExpired compares against now", () => {
  expect(isExpired("2000-01-01T00:00:00.000Z")).toBe(true);
  expect(isExpired(new Date(Date.now() + 60_000).toISOString())).toBe(false);
});

test("nowIso returns ISO 8601 UTC", () => {
  expect(nowIso(new Date(0))).toBe("1970-01-01T00:00:00.000Z");
});
