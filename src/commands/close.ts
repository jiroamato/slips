import { parseArgs } from "node:util";
import { findSlip } from "../lib/cli-util";
import { UserError } from "../lib/errors";
import { mutate, requireRoot } from "../lib/storage";
import { nowIso } from "../lib/time";

export function run(argv: string[]): void {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      reason: { type: "string" },
      json: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });
  const id = positionals[0];
  if (!id) throw new UserError("usage: slip close <id> [--reason ...]");
  const root = requireRoot();
  const closed = mutate(root, (slips) => {
    const s = findSlip(slips, id);
    s.status = "closed";
    s.claim = null;
    s.closed_at = nowIso();
    s.close_reason = values.reason ?? null;
    s.updated_at = s.closed_at;
    return s;
  });
  console.log(values.json ? JSON.stringify(closed) : `closed ${closed.id}`);
}
