import { parseArgs } from "node:util";
import { findSlip, parsePriority, parseStatus, parseType } from "../lib/cli-util";
import { UserError } from "../lib/errors";
import { mutate, requireRoot } from "../lib/storage";
import { nowIso } from "../lib/time";

export function run(argv: string[]): void {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      title: { type: "string" },
      description: { type: "string" },
      status: { type: "string" },
      type: { type: "string" },
      priority: { type: "string" },
      "add-label": { type: "string", multiple: true, default: [] },
      "rm-label": { type: "string", multiple: true, default: [] },
      json: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });
  const id = positionals[0];
  if (!id) throw new UserError("usage: slip update <id> [--title ...] [--status ...] ...");
  const root = requireRoot();
  const updated = mutate(root, (slips) => {
    const s = findSlip(slips, id);
    if (values.title !== undefined) s.title = values.title;
    if (values.description !== undefined) s.description = values.description;
    if (values.type !== undefined) s.type = parseType(values.type);
    if (values.priority !== undefined) s.priority = parsePriority(values.priority);
    if (values.status !== undefined) {
      const status = parseStatus(values.status);
      s.status = status;
      if (status !== "closed") {
        s.closed_at = null;
        s.close_reason = null;
      } else {
        s.claim = null;
        if (!s.closed_at) s.closed_at = nowIso();
      }
    }
    for (const l of values["add-label"]) if (!s.labels.includes(l)) s.labels.push(l);
    s.labels = s.labels.filter((l) => !values["rm-label"].includes(l));
    s.updated_at = nowIso();
    return s;
  });
  console.log(values.json ? JSON.stringify(updated) : `updated ${updated.id}`);
}
