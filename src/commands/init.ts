import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

const ONBOARDING = `<!-- slips:start -->
## Slips — issue tracking

This repo uses slips for agent issue tracking. State lives in \`.slips/issues.jsonl\`.

- \`slip ready\` — find unblocked work
- \`slip claim <id> --agent <name>\` — claim before working (lease-based; default TTL 60m)
- \`slip create --title "..." [--type task|bug|feature|epic] [--priority 0-4]\`
- \`slip close <id> --reason "..."\` · \`slip release <id>\` · \`slip show <id>\`
- \`slip prime\` — compact status block · \`slip sync\` — commit tracker changes
- Every command accepts \`--json\`.

Convention: claim before you work, close with a reason, file discovered follow-ups as new slips, \`slip sync\` before you finish.
<!-- slips:end -->
`;

const GITATTR_LINE = ".slips/issues.jsonl merge=union";

function ensureBlock(path: string, block: string): void {
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (existing.includes("<!-- slips:start -->")) return;
  writeFileSync(path, existing ? `${existing.trimEnd()}\n\n${block}` : block, "utf8");
}

function ensureLine(path: string, line: string): void {
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (existing.includes(line)) return;
  writeFileSync(path, existing ? `${existing.trimEnd()}\n${line}\n` : `${line}\n`, "utf8");
}

type Hooks = Record<string, Array<{ hooks: Array<{ type: string; command: string }> }>>;

function ensureHook(hooks: Hooks, event: string, command: string): void {
  if (!hooks[event]) {
    hooks[event] = [];
  }
  const entries = hooks[event];
  if (entries === undefined) return;
  const present = entries.some((e) => e.hooks?.some((h) => h.command === command));
  if (!present) entries.push({ hooks: [{ type: "command", command }] });
}

export function run(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    options: {
      prefix: { type: "string", default: "sl" },
      claude: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
    },
  });
  const root = process.cwd();
  const dir = join(root, ".slips");
  mkdirSync(dir, { recursive: true });
  const configPath = join(dir, "config.json");
  const configExisted = existsSync(configPath);
  let effectivePrefix = values.prefix;
  if (!configExisted) {
    writeFileSync(
      configPath,
      `${JSON.stringify({ prefix: values.prefix, default_ttl: "60m" }, null, 2)}\n`,
    );
  } else {
    try {
      const existingConfig = JSON.parse(readFileSync(configPath, "utf8"));
      if (typeof existingConfig.prefix === "string") effectivePrefix = existingConfig.prefix;
    } catch {
      // existing config is unreadable — fall back to the requested prefix
    }
  }
  const prefixKept = configExisted && values.prefix !== effectivePrefix;
  const issuesPath = join(dir, "issues.jsonl");
  if (!existsSync(issuesPath)) writeFileSync(issuesPath, "");

  ensureLine(join(root, ".gitattributes"), GITATTR_LINE);
  ensureLine(join(root, ".gitignore"), ".slips/.lock");
  ensureBlock(join(root, "AGENTS.md"), ONBOARDING);
  ensureBlock(join(root, "CLAUDE.md"), ONBOARDING);

  if (values.claude) {
    const claudeDir = join(root, ".claude");
    mkdirSync(claudeDir, { recursive: true });
    const settingsPath = join(claudeDir, "settings.json");
    const settings = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, "utf8")) : {};
    const hooks: Hooks = settings.hooks ?? {};
    ensureHook(hooks, "SessionStart", "slip prime");
    ensureHook(hooks, "SessionEnd", 'slip release --session "$CLAUDE_SESSION_ID"');
    settings.hooks = hooks;
    writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  }

  if (values.json) {
    console.log(
      JSON.stringify({
        initialized: true,
        prefix: effectivePrefix,
        claude: values.claude,
      }),
    );
  } else {
    const prefixNote = prefixKept ? " (existing config kept)" : "";
    console.log(
      `initialized .slips (prefix "${effectivePrefix}"${prefixNote})${values.claude ? " with Claude Code hooks" : ""}`,
    );
  }
}
