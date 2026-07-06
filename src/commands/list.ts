import { parseArgs } from "node:util";
import { oneLine, parsePriority, parseStatus, parseType } from "../lib/cli-util";
import { readSlips, requireRoot } from "../lib/storage";

export function run(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    options: {
      status: { type: "string" },
      type: { type: "string" },
      label: { type: "string" },
      priority: { type: "string" },
      all: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
    },
  });
  const root = requireRoot();
  let slips = readSlips(root).slips;
  if (values.status) {
    const status = parseStatus(values.status);
    slips = slips.filter((s) => s.status === status);
  } else if (!values.all) {
    slips = slips.filter((s) => s.status !== "closed");
  }
  if (values.type) {
    const type = parseType(values.type);
    slips = slips.filter((s) => s.type === type);
  }
  if (values.label) slips = slips.filter((s) => s.labels.includes(values.label as string));
  if (values.priority !== undefined) {
    const p = parsePriority(values.priority);
    slips = slips.filter((s) => s.priority === p);
  }
  slips.sort((a, b) => a.priority - b.priority || a.created_at.localeCompare(b.created_at));
  if (values.json) {
    console.log(JSON.stringify(slips));
    return;
  }
  for (const s of slips) console.log(oneLine(s));
  if (slips.length === 0) console.log("no slips match");
}
