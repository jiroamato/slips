import { IntegrityError } from "./errors";
import { nowIso } from "./time";

export const STATUSES = ["open", "in_progress", "closed"] as const;
export const TYPES = ["task", "bug", "feature", "epic"] as const;

export type Status = (typeof STATUSES)[number];
export type SlipType = (typeof TYPES)[number];
export type Priority = 0 | 1 | 2 | 3 | 4;

export interface Claim {
  agent: string;
  session_id: string | null;
  expires_at: string;
}

export interface Slip {
  id: string;
  title: string;
  description: string;
  status: Status;
  type: SlipType;
  priority: Priority;
  labels: string[];
  blocked_by: string[];
  claim: Claim | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  close_reason: string | null;
}

const ID_CHARS = "0123456789abcdefghijklmnopqrstuvwxyz";

export function generateId(prefix: string, existing: Set<string>): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    const bytes = crypto.getRandomValues(new Uint8Array(4));
    let suffix = "";
    for (const b of bytes) suffix += ID_CHARS[b % 36];
    const id = `${prefix}-${suffix}`;
    if (!existing.has(id)) return id;
  }
  throw new IntegrityError("could not generate a unique id after 100 attempts");
}

export function newSlip(opts: {
  id: string;
  title: string;
  description?: string;
  type?: SlipType;
  priority?: Priority;
  labels?: string[];
  blocked_by?: string[];
  now?: Date;
}): Slip {
  const at = nowIso(opts.now);
  return {
    id: opts.id,
    title: opts.title,
    description: opts.description ?? "",
    status: "open",
    type: opts.type ?? "task",
    priority: opts.priority ?? 2,
    labels: opts.labels ?? [],
    blocked_by: opts.blocked_by ?? [],
    claim: null,
    created_at: at,
    updated_at: at,
    closed_at: null,
    close_reason: null,
  };
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function isClaim(v: unknown): v is Claim {
  if (v === null || typeof v !== "object") return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c.agent === "string" &&
    (c.session_id === null || typeof c.session_id === "string") &&
    typeof c.expires_at === "string"
  );
}

/** Parse one JSONL line into a Slip; returns null for corrupt/invalid lines. */
export function parseSlip(line: string): Slip | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (raw === null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const valid =
    typeof o.id === "string" &&
    typeof o.title === "string" &&
    typeof o.description === "string" &&
    (STATUSES as readonly string[]).includes(o.status as string) &&
    (TYPES as readonly string[]).includes(o.type as string) &&
    typeof o.priority === "number" &&
    o.priority >= 0 &&
    o.priority <= 4 &&
    isStringArray(o.labels) &&
    isStringArray(o.blocked_by) &&
    (o.claim === null || isClaim(o.claim)) &&
    typeof o.created_at === "string" &&
    typeof o.updated_at === "string" &&
    (o.closed_at === null || typeof o.closed_at === "string") &&
    (o.close_reason === null || typeof o.close_reason === "string");
  return valid ? (o as unknown as Slip) : null;
}
