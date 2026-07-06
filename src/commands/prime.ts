import { parseArgs } from "node:util";
import { UserError } from "../lib/errors";
import { buildPrime, renderPrime } from "../lib/prime";
import { readConfig, readSlips, requireRoot } from "../lib/storage";

export function run(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    options: {
      budget: { type: "string", default: "1000" },
      json: { type: "boolean", default: false },
    },
  });
  const budget = Number(values.budget);
  if (!Number.isInteger(budget) || budget <= 0)
    throw new UserError("--budget must be a positive integer");
  const root = requireRoot();
  const data = buildPrime(readSlips(root).slips, readConfig(root));
  console.log(values.json ? JSON.stringify(data) : renderPrime(data, budget));
}
