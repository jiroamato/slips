import type { Slip } from "./model";
import { isLiveClaim, readySlips } from "./ready";
import type { Config } from "./storage";

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface PrimeData {
  prefix: string;
  counts: { open: number; in_progress: number; closed: number };
  ready: Slip[];
  in_progress: Slip[];
  recently_closed: Slip[];
}

export function buildPrime(slips: Slip[], config: Config, now: Date = new Date()): PrimeData {
  const counts = { open: 0, in_progress: 0, closed: 0 };
  for (const s of slips) counts[s.status]++;
  return {
    prefix: config.prefix,
    counts,
    ready: readySlips(slips, now),
    in_progress: slips.filter((s) => s.status === "in_progress" && isLiveClaim(s.claim, now)),
    recently_closed: slips
      .filter((s) => s.status === "closed")
      .sort((a, b) => (b.closed_at ?? "").localeCompare(a.closed_at ?? ""))
      .slice(0, 5),
  };
}

function render(data: PrimeData, nReady: number, nWip: number, nClosed: number): string {
  const lines: string[] = [];
  const c = data.counts;
  lines.push(
    `# Slips (${data.prefix}) — ${c.open} open, ${c.in_progress} in progress, ${c.closed} closed`,
  );
  if (nReady > 0) {
    lines.push("", "## Ready");
    for (const s of data.ready.slice(0, nReady)) {
      const labels = s.labels.length ? ` [${s.labels.join(", ")}]` : "";
      lines.push(`- ${s.id} (p${s.priority}, ${s.type}) ${s.title}${labels}`);
    }
  }
  if (nWip > 0 && data.in_progress.length > 0) {
    lines.push("", "## In progress");
    for (const s of data.in_progress.slice(0, nWip)) {
      const cl = s.claim;
      lines.push(`- ${s.id} ${s.title} — claimed by ${cl?.agent} until ${cl?.expires_at}`);
    }
  }
  if (nClosed > 0 && data.recently_closed.length > 0) {
    lines.push("", "## Recently closed");
    for (const s of data.recently_closed.slice(0, nClosed)) {
      lines.push(`- ${s.id} ${s.title}${s.close_reason ? ` — ${s.close_reason}` : ""}`);
    }
  }
  lines.push(
    "",
    'Claim before working: `slip claim <id> --agent <you>` · close: `slip close <id> --reason "..."` · details: `slip show <id>`',
  );
  return lines.join("\n");
}

export function renderPrime(data: PrimeData, budget = 1000): string {
  let nReady = data.ready.length;
  let nWip = data.in_progress.length;
  let nClosed = data.recently_closed.length;
  let out = render(data, nReady, nWip, nClosed);
  while (estimateTokens(out) > budget) {
    if (nClosed > 0) nClosed--;
    else if (nWip > 0) nWip--;
    else if (nReady > 1) nReady--;
    else break; // floor: header + 1 ready + footer
    out = render(data, nReady, nWip, nClosed);
  }
  return out;
}
