import { parseArgs } from "node:util";
import { oneLine } from "../lib/cli-util";
import { UserError } from "../lib/errors";
import { readSlips, requireRoot } from "../lib/storage";

export function run(argv: string[]): void {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { json: { type: "boolean", default: false } },
    allowPositionals: true,
  });
  const query = positionals.join(" ").toLowerCase().trim();
  if (!query) throw new UserError("usage: slip search <query>");
  const root = requireRoot();
  const hits = readSlips(root).slips.filter((s) =>
    [s.id, s.title, s.description, ...s.labels].some((f) => f.toLowerCase().includes(query)),
  );
  if (values.json) {
    console.log(JSON.stringify(hits));
    return;
  }
  for (const s of hits) console.log(oneLine(s));
  if (hits.length === 0) console.log("no matches");
}
