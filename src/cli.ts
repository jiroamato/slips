#!/usr/bin/env bun
import * as claim from "./commands/claim";
import * as close from "./commands/close";
import * as create from "./commands/create";
import * as dep from "./commands/dep";
import * as doctor from "./commands/doctor";
import * as init from "./commands/init";
import * as list from "./commands/list";
import * as prime from "./commands/prime";
import * as ready from "./commands/ready";
import * as release from "./commands/release";
import * as search from "./commands/search";
import * as show from "./commands/show";
import * as sync from "./commands/sync";
import * as update from "./commands/update";
import { UserError } from "./lib/errors";

type Command = { run: (argv: string[]) => void | Promise<void> };

const registry: Record<string, Command> = {
  init,
  create,
  show,
  list,
  search,
  update,
  close,
  dep,
  claim,
  release,
  ready,
  prime,
  sync,
  doctor,
};

const HELP = `slip — git-native issue tracker for agents

Usage: slip <command> [options]   (every command accepts --json)

Commands:
  init      Scaffold .slips/ in this repo (--prefix, --claude)
  create    Create a slip (--title, --type, --priority, --label, --blocked-by, --description)
  list      List slips (--status, --type, --label, --priority, --all)
  show      Show one slip
  update    Update fields (--title, --status, --type, --priority, --description, --add-label, --rm-label)
  close     Close a slip (--reason)
  search    Substring search across title/description/labels/id
  dep       dep add <id> <blocker> | dep rm <id> <blocker>
  ready     List ready work (open, unblocked, unclaimed)
  claim     Take a lease (--agent, --session, --ttl)
  release   Release claims (<id> | --session <sid> | --agent <name>)
  prime     Compact context block for agents (--budget)
  sync      Commit .slips/ changes to git (-m)
  doctor    Integrity checks (--fix)
`;

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    console.log(HELP);
    return;
  }
  const command = registry[cmd];
  if (!command) throw new UserError(`unknown command "${cmd}" — run \`slip --help\``);
  await command.run(rest);
}

function isUserError(err: unknown): boolean {
  if (err instanceof UserError) return true;
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === "string" && code.startsWith("ERR_PARSE_ARGS_");
  }
  return false;
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  if (process.argv.includes("--json")) {
    console.error(JSON.stringify({ error: message }));
  } else {
    console.error(`slip: ${message}`);
  }
  process.exit(isUserError(err) ? 1 : 2);
});
