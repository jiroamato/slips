import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { IntegrityError } from "../lib/errors";
import { parseSlip } from "../lib/model";
import { isLiveClaim, wouldCycle } from "../lib/ready";
import { readSlips, requireRoot, withLock, writeSlips } from "../lib/storage";
import { nowIso } from "../lib/time";

export function run(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    options: {
      fix: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
    },
  });
  const root = requireRoot();
  const problems: string[] = [];
  const fixable: string[] = [];

  const issuesPath = join(root, ".slips", "issues.jsonl");
  const raw = existsSync(issuesPath) ? readFileSync(issuesPath, "utf8") : "";
  const lines = raw.split("\n").filter((l) => l.trim() !== "");
  const seen = new Map<string, number>();
  for (let i = 0; i < lines.length; i++) {
    const slip = parseSlip(lines[i] as string);
    if (!slip) {
      fixable.push(`corrupt line ${i + 1}`);
      continue;
    }
    seen.set(slip.id, (seen.get(slip.id) ?? 0) + 1);
  }
  for (const [id, n] of seen) if (n > 1) fixable.push(`duplicate id ${id} (${n} lines)`);

  const { slips } = readSlips(root);
  const ids = new Set(slips.map((s) => s.id));
  for (const s of slips) {
    for (const dep of s.blocked_by) {
      if (!ids.has(dep)) problems.push(`${s.id} blocked by unknown id ${dep}`);
    }
    if (s.claim && !isLiveClaim(s.claim))
      fixable.push(`${s.id} has an expired claim (${s.claim.agent})`);
  }
  // cycle check: for each edge s -> dep, ask wouldCycle on the graph with that edge removed
  for (const s of slips) {
    for (const dep of s.blocked_by) {
      const rest = slips.map((x) =>
        x.id === s.id ? { ...x, blocked_by: x.blocked_by.filter((d) => d !== dep) } : x,
      );
      if (wouldCycle(rest, s.id, dep)) problems.push(`dependency cycle through ${s.id} -> ${dep}`);
    }
  }

  const lockPath = join(root, ".slips", ".lock");
  if (existsSync(lockPath)) {
    try {
      const info = JSON.parse(readFileSync(lockPath, "utf8"));
      if (Date.now() - Date.parse(info.at) > 30_000) fixable.push("stale lock file");
    } catch {
      fixable.push("unreadable lock file");
    }
  }

  if (values.fix && fixable.length > 0) {
    withLock(root, () => {
      const cleaned = readSlips(root).slips.map((s) =>
        s.claim && !isLiveClaim(s.claim) ? { ...s, claim: null, updated_at: nowIso() } : s,
      );
      writeSlips(root, cleaned); // rewrite compacts dups and drops corrupt lines
    });
    if (fixable.some((f) => f.includes("lock"))) rmSync(lockPath, { force: true });
  }

  const remaining = values.fix ? problems : [...fixable, ...problems];
  if (values.json) {
    console.log(
      JSON.stringify({
        ok: remaining.length === 0,
        problems: remaining,
        fixed: values.fix ? fixable : [],
      }),
    );
  } else {
    for (const p of remaining) console.log(`problem: ${p}`);
    if (values.fix) for (const f of fixable) console.log(`fixed: ${f}`);
    if (remaining.length === 0) console.log("ok");
  }
  if (remaining.length > 0) throw new IntegrityError(`${remaining.length} problem(s) found`);
}
