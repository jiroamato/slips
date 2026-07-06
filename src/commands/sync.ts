import { parseArgs } from "node:util";
import { IntegrityError } from "../lib/errors";
import { requireRoot } from "../lib/storage";

function git(root: string, ...args: string[]): { code: number; out: string; err: string } {
  const proc = Bun.spawnSync(["git", ...args], { cwd: root });
  return { code: proc.exitCode, out: proc.stdout.toString(), err: proc.stderr.toString() };
}

export function run(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    options: {
      message: { type: "string", short: "m" },
      json: { type: "boolean", default: false },
    },
  });
  const root = requireRoot();
  const status = git(root, "status", "--porcelain", "--", ".slips");
  if (status.code !== 0) throw new IntegrityError(`git status failed: ${status.err.trim()}`);
  if (status.out.trim() === "") {
    console.log(values.json ? JSON.stringify({ synced: false }) : "nothing to sync");
    return;
  }
  const add = git(root, "add", "--", ".slips");
  if (add.code !== 0) throw new IntegrityError(`git add failed: ${add.err.trim()}`);
  const message = values.message ?? "chore: sync slips";
  const commit = git(root, "commit", "-m", message, "--", ".slips");
  if (commit.code !== 0) throw new IntegrityError(`git commit failed: ${commit.err.trim()}`);
  console.log(
    values.json ? JSON.stringify({ synced: true, message }) : `synced .slips (${message})`,
  );
}
