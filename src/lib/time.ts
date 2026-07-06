import { UserError } from "./errors";

const UNITS: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };

export function nowIso(now: Date = new Date()): string {
  return now.toISOString();
}

/** Parse a duration like "30s", "45m", "2h", "1d" into milliseconds. */
export function parseTtl(input: string): number {
  const m = /^(\d+)([smhd])$/.exec(input.trim());
  if (!m) throw new UserError(`invalid duration "${input}" — use forms like 30s, 45m, 2h, 1d`);
  return Number(m[1]) * UNITS[m[2] as keyof typeof UNITS];
}

export function isExpired(expiresAt: string, now: Date = new Date()): boolean {
  const t = Date.parse(expiresAt);
  return Number.isNaN(t) || t <= now.getTime();
}
