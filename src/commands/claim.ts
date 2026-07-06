import { parseArgs } from "node:util";
import { findSlip } from "../lib/cli-util";
import { UserError } from "../lib/errors";
import { isLiveClaim } from "../lib/ready";
import { mutate, readConfig, requireRoot } from "../lib/storage";
import { nowIso, parseTtl } from "../lib/time";

export function run(argv: string[]): void {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      agent: { type: "string" },
      session: { type: "string" },
      ttl: { type: "string" },
      json: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });
  const id = positionals[0];
  if (!id)
    throw new UserError("usage: slip claim <id> --agent <name> [--session <sid>] [--ttl <dur>]");
  if (!values.agent) throw new UserError("--agent is required");
  const root = requireRoot();
  const config = readConfig(root);
  const ttlMs = parseTtl(values.ttl ?? config.default_ttl);
  const claimed = mutate(root, (slips) => {
    const s = findSlip(slips, id);
    if (s.status === "closed") throw new UserError(`${id} is closed — reopen it before claiming`);
    if (isLiveClaim(s.claim) && s.claim && s.claim.agent !== values.agent) {
      throw new UserError(
        `${id} is claimed by "${s.claim.agent}" until ${s.claim.expires_at} — retry after expiry or ask them to release`,
      );
    }
    const now = new Date();
    s.claim = {
      agent: values.agent as string,
      session_id: values.session ?? null,
      expires_at: new Date(now.getTime() + ttlMs).toISOString(),
    };
    s.status = "in_progress";
    s.updated_at = nowIso(now);
    return s;
  });
  console.log(
    values.json
      ? JSON.stringify(claimed)
      : `claimed ${claimed.id} for "${claimed.claim?.agent}" until ${claimed.claim?.expires_at}`,
  );
}
