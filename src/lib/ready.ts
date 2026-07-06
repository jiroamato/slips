import type { Claim, Slip } from "./model";

export function isLiveClaim(claim: Claim | null, now: Date = new Date()): boolean {
  if (claim === null) return false;
  const t = Date.parse(claim.expires_at);
  return !Number.isNaN(t) && t > now.getTime();
}

export function isReady(slip: Slip, byId: Map<string, Slip>, now: Date = new Date()): boolean {
  if (slip.status !== "open") return false;
  if (isLiveClaim(slip.claim, now)) return false;
  for (const dep of slip.blocked_by) {
    const blocker = byId.get(dep);
    if (!blocker || blocker.status !== "closed") return false;
  }
  return true;
}

export function readySlips(slips: Slip[], now: Date = new Date()): Slip[] {
  const byId = new Map(slips.map((s) => [s.id, s]));
  return slips
    .filter((s) => isReady(s, byId, now))
    .sort((a, b) => a.priority - b.priority || a.created_at.localeCompare(b.created_at));
}

/** True if adding blockerId to id's blocked_by would create a dependency cycle. */
export function wouldCycle(slips: Slip[], id: string, blockerId: string): boolean {
  if (id === blockerId) return true;
  const byId = new Map(slips.map((s) => [s.id, s]));
  const stack = [blockerId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const cur = stack.pop();
    if (cur === undefined) continue;
    if (cur === id) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const s = byId.get(cur);
    if (s) stack.push(...s.blocked_by);
  }
  return false;
}
