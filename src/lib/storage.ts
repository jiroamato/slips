import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { IntegrityError, UserError } from "./errors";
import { type Slip, parseSlip } from "./model";

export interface Config {
  prefix: string;
  default_ttl: string;
}

const DEFAULT_CONFIG: Config = { prefix: "sl", default_ttl: "60m" };

export function findRoot(start: string = process.cwd()): string | null {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, ".slips"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function requireRoot(): string {
  const root = findRoot();
  if (!root) throw new UserError("no .slips directory found — run `slip init` first");
  return root;
}

export function readConfig(root: string): Config {
  const path = join(root, ".slips", "config.json");
  if (!existsSync(path)) return { ...DEFAULT_CONFIG };
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(path, "utf8")) };
  } catch {
    throw new IntegrityError(".slips/config.json is not valid JSON");
  }
}

export function readSlips(
  root: string,
  opts?: { quiet?: boolean },
): { slips: Slip[]; warnings: string[] } {
  const path = join(root, ".slips", "issues.jsonl");
  if (!existsSync(path)) return { slips: [], warnings: [] };
  const warnings: string[] = [];
  const byId = new Map<string, Slip>();
  const lines = readFileSync(path, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? "").trim();
    if (!line) continue;
    const slip = parseSlip(line);
    if (!slip) {
      warnings.push(`skipping corrupt line ${i + 1} in issues.jsonl`);
      continue;
    }
    const prev = byId.get(slip.id);
    if (!prev || slip.updated_at >= prev.updated_at) byId.set(slip.id, slip);
  }
  if (!opts?.quiet) {
    for (const w of warnings) console.error(`slip: ${w}`);
  }
  return { slips: [...byId.values()], warnings };
}

export function writeSlips(root: string, slips: Slip[]): void {
  const dir = join(root, ".slips");
  const path = join(dir, "issues.jsonl");
  const tmp = join(dir, `.issues.tmp-${process.pid}-${Math.floor(Math.random() * 1e6)}`);
  const body = slips.map((s) => JSON.stringify(s)).join("\n");
  writeFileSync(tmp, body.length ? `${body}\n` : "", "utf8");
  renameSync(tmp, path);
}

const LOCK_STALE_MS = 30_000;
const LOCK_RETRY_MS = 3_000;

export function withLock<T>(root: string, fn: () => T, opts?: { retryMs?: number }): T {
  const lockPath = join(root, ".slips", ".lock");
  const deadline = Date.now() + (opts?.retryMs ?? LOCK_RETRY_MS);
  const token = randomUUID();
  let waitMs = 25;
  for (;;) {
    try {
      const fd = openSync(lockPath, "wx");
      writeFileSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString(), token }));
      closeSync(fd);
      break;
    } catch {
      let holder = "unknown";
      let stale = false;
      try {
        const info = JSON.parse(readFileSync(lockPath, "utf8"));
        holder = String(info.pid ?? "unknown");
        const age = Date.now() - Date.parse(info.at);
        stale = Number.isNaN(age) || age > LOCK_STALE_MS;
      } catch {
        stale = true; // unreadable/corrupt lock — reclaim
      }
      if (stale) {
        rmSync(lockPath, { force: true });
        continue;
      }
      if (Date.now() > deadline) {
        throw new IntegrityError(
          `.slips/.lock is held by pid ${holder} — if that process is dead, delete .slips/.lock`,
        );
      }
      Bun.sleepSync(waitMs);
      waitMs = Math.min(waitMs * 2, 400);
    }
  }
  try {
    return fn();
  } finally {
    // Only release the lock if we still own it — another process may have
    // legitimately reclaimed it as stale while fn() was running.
    try {
      const info = JSON.parse(readFileSync(lockPath, "utf8"));
      if (info.token === token) rmSync(lockPath, { force: true });
    } catch {
      // unreadable or missing lock — do not delete
    }
  }
}

/** Lock → read → mutate the array in place → write → unlock. */
export function mutate<T>(root: string, fn: (slips: Slip[]) => T): T {
  return withLock(root, () => {
    const { slips } = readSlips(root);
    const result = fn(slips);
    writeSlips(root, slips);
    return result;
  });
}
