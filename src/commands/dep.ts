import { parseArgs } from "node:util";
import { findSlip } from "../lib/cli-util";
import { UserError } from "../lib/errors";
import { wouldCycle } from "../lib/ready";
import { mutate, requireRoot } from "../lib/storage";
import { nowIso } from "../lib/time";

export function run(argv: string[]): void {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { json: { type: "boolean", default: false } },
    allowPositionals: true,
  });
  const [action, id, blockerId] = positionals;
  if ((action !== "add" && action !== "rm") || !id || !blockerId) {
    throw new UserError("usage: slip dep add|rm <id> <blocker-id>");
  }
  const root = requireRoot();
  const updated = mutate(root, (slips) => {
    const s = findSlip(slips, id);
    if (action === "add") {
      findSlip(slips, blockerId); // throws on unknown blocker
      if (wouldCycle(slips, id, blockerId)) {
        throw new UserError(`adding ${blockerId} as a blocker of ${id} would create a cycle`);
      }
      if (!s.blocked_by.includes(blockerId)) s.blocked_by.push(blockerId);
    } else {
      s.blocked_by = s.blocked_by.filter((d) => d !== blockerId);
    }
    s.updated_at = nowIso();
    return s;
  });
  console.log(
    values.json
      ? JSON.stringify(updated)
      : `${action === "add" ? "added" : "removed"} dependency on ${blockerId}`,
  );
}
