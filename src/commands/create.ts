import { parseArgs } from "node:util";
import { parsePriority, parseType } from "../lib/cli-util";
import { UserError } from "../lib/errors";
import { generateId, newSlip } from "../lib/model";
import { mutate, readConfig, requireRoot } from "../lib/storage";

export function run(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    options: {
      title: { type: "string" },
      description: { type: "string", default: "" },
      type: { type: "string", default: "task" },
      priority: { type: "string", default: "2" },
      label: { type: "string", multiple: true, default: [] },
      "blocked-by": { type: "string", multiple: true, default: [] },
      json: { type: "boolean", default: false },
    },
  });
  if (!values.title) throw new UserError("--title is required");
  const type = parseType(values.type);
  const priority = parsePriority(values.priority);
  const blockedBy = values["blocked-by"];
  const root = requireRoot();
  const config = readConfig(root);
  const slip = mutate(root, (slips) => {
    const ids = new Set(slips.map((s) => s.id));
    for (const dep of blockedBy) {
      if (!ids.has(dep)) throw new UserError(`unknown blocker id "${dep}"`);
    }
    const s = newSlip({
      id: generateId(config.prefix, ids),
      title: values.title as string,
      description: values.description,
      type,
      priority,
      labels: values.label,
      blocked_by: blockedBy,
    });
    slips.push(s);
    return s;
  });
  console.log(values.json ? JSON.stringify(slip) : slip.id);
}
