import { parseArgs } from "node:util";
import { findSlip } from "../lib/cli-util";
import { UserError } from "../lib/errors";
import { readSlips, requireRoot } from "../lib/storage";

export function run(argv: string[]): void {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { json: { type: "boolean", default: false } },
    allowPositionals: true,
  });
  const id = positionals[0];
  if (!id) throw new UserError("usage: slip show <id>");
  const root = requireRoot();
  const slip = findSlip(readSlips(root).slips, id);
  if (values.json) {
    console.log(JSON.stringify(slip));
    return;
  }
  console.log(`${slip.id}  ${slip.status}  p${slip.priority}  ${slip.type}`);
  console.log(`title:       ${slip.title}`);
  if (slip.description) console.log(`description: ${slip.description}`);
  if (slip.labels.length) console.log(`labels:      ${slip.labels.join(", ")}`);
  if (slip.blocked_by.length) console.log(`blocked by:  ${slip.blocked_by.join(", ")}`);
  if (slip.claim) console.log(`claim:       ${slip.claim.agent} until ${slip.claim.expires_at}`);
  console.log(`created:     ${slip.created_at}`);
  console.log(`updated:     ${slip.updated_at}`);
  if (slip.closed_at)
    console.log(
      `closed:      ${slip.closed_at}${slip.close_reason ? ` (${slip.close_reason})` : ""}`,
    );
}
