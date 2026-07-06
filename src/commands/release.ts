import { parseArgs } from "node:util";
import { findSlip } from "../lib/cli-util";
import { UserError } from "../lib/errors";
import type { Slip } from "../lib/model";
import { mutate, requireRoot } from "../lib/storage";
import { nowIso } from "../lib/time";

function releaseSlip(s: Slip): void {
  s.claim = null;
  if (s.status === "in_progress") s.status = "open";
  s.updated_at = nowIso();
}

export function run(argv: string[]): void {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      session: { type: "string" },
      agent: { type: "string" },
      json: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });
  const id = positionals[0];
  const selectorCount = [id, values.session, values.agent].filter(Boolean).length;
  if (selectorCount === 0) {
    throw new UserError("usage: slip release <id> | --session <sid> | --agent <name>");
  }
  if (selectorCount > 1) {
    throw new UserError("provide exactly one of <id>, --session, or --agent");
  }
  const root = requireRoot();
  const released = mutate(root, (slips) => {
    if (id) {
      const s = findSlip(slips, id);
      releaseSlip(s);
      return [s.id];
    }
    const hits = slips.filter(
      (s) =>
        s.claim !== null &&
        ((values.session && s.claim.session_id === values.session) ||
          (values.agent && s.claim.agent === values.agent)),
    );
    for (const s of hits) releaseSlip(s);
    return hits.map((s) => s.id);
  });
  console.log(
    values.json
      ? JSON.stringify({ released })
      : `released ${released.length} slip(s)${released.length ? `: ${released.join(", ")}` : ""}`,
  );
}
