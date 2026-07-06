import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CLI = resolve(import.meta.dir, "..", "src", "cli.ts");

export function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "slips-cli-"));
  Bun.spawnSync(["git", "init", "-q"], { cwd: dir });
  return dir;
}

export function runSlip(cwd: string, ...args: string[]) {
  const proc = Bun.spawnSync(["bun", CLI, ...args], { cwd, env: { ...process.env } });
  return { code: proc.exitCode, out: proc.stdout.toString(), err: proc.stderr.toString() };
}
