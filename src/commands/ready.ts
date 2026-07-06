import { parseArgs } from "node:util";
import { oneLine } from "../lib/cli-util";
import { readySlips } from "../lib/ready";
import { readSlips, requireRoot } from "../lib/storage";

export function run(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    options: { json: { type: "boolean", default: false } },
  });
  const root = requireRoot();
  const ready = readySlips(readSlips(root).slips);
  if (values.json) {
    console.log(JSON.stringify(ready));
    return;
  }
  for (const s of ready) console.log(oneLine(s));
  if (ready.length === 0)
    console.log("nothing ready — check `slip list` for blocked or claimed work");
}
