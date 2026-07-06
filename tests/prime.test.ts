import { expect, test } from "bun:test";
import { type Slip, newSlip } from "../src/lib/model";
import { buildPrime, estimateTokens, renderPrime } from "../src/lib/prime";

const CONFIG = { prefix: "sl", default_ttl: "60m" };
const future = new Date(Date.now() + 3_600_000).toISOString();

function make(id: string, over: Partial<Slip> = {}): Slip {
  return { ...newSlip({ id, title: `Title for ${id}` }), ...over };
}

function fixture(): Slip[] {
  return [
    make("sl-rdy1", { priority: 1 }),
    make("sl-rdy2", { priority: 3 }),
    make("sl-wip1", {
      status: "in_progress",
      claim: { agent: "agent-a", session_id: "sess-1", expires_at: future },
    }),
    make("sl-old1", {
      status: "closed",
      closed_at: "2026-01-01T00:00:00.000Z",
      close_reason: "done",
    }),
    make("sl-old2", {
      status: "closed",
      closed_at: "2026-02-01T00:00:00.000Z",
      close_reason: "fixed",
    }),
  ];
}

test("estimateTokens is ceil(chars/4)", () => {
  expect(estimateTokens("")).toBe(0);
  expect(estimateTokens("abcd")).toBe(1);
  expect(estimateTokens("abcde")).toBe(2);
});

test("buildPrime aggregates counts and sections", () => {
  const d = buildPrime(fixture(), CONFIG);
  expect(d.counts).toEqual({ open: 2, in_progress: 1, closed: 2 });
  expect(d.ready.map((s) => s.id)).toEqual(["sl-rdy1", "sl-rdy2"]);
  expect(d.in_progress.map((s) => s.id)).toEqual(["sl-wip1"]);
  expect(d.recently_closed.map((s) => s.id)).toEqual(["sl-old2", "sl-old1"]); // newest first
});

test("renderPrime includes all sections and command hints under a big budget", () => {
  const out = renderPrime(buildPrime(fixture(), CONFIG), 10_000);
  expect(out).toContain("Ready");
  expect(out).toContain("sl-rdy1");
  expect(out).toContain("In progress");
  expect(out).toContain("agent-a");
  expect(out).toContain("Recently closed");
  expect(out).toContain("slip claim");
});

test("renderPrime trims recently_closed first, then in_progress, keeps >=1 ready", () => {
  const full = renderPrime(buildPrime(fixture(), CONFIG), 10_000);
  const budget = Math.ceil(full.length / 4) - 10; // just under full size
  const trimmed = renderPrime(buildPrime(fixture(), CONFIG), budget);
  expect(trimmed).toContain("sl-rdy1"); // ready survives
  const tiny = renderPrime(buildPrime(fixture(), CONFIG), 40);
  expect(tiny).toContain("sl-rdy1");
  expect(tiny).not.toContain("sl-old1");
});
