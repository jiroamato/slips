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
    const wasClosed = s.status === "closed";
    s.status = "closed";
    s.claim = null;
    if (!wasClosed) s.closed_at = nowIso();
    if (values.reason !== undefined) {
      s.close_reason = values.reason;
    } else if (!wasClosed) {
      s.close_reason = null;
    }
    s.updated_at = nowIso();
    return s;
  });
  console.log(values.json ? JSON.stringify(closed) : `closed ${closed.id}`);
}
