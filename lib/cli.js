// CLI argument parsing + interactive flow for `create-dig-app`.
//
// Kept separate from index.js (the pure scaffolding lib) so the arg/prompt logic is independently
// testable and the scaffold core stays free of process/TTY concerns. `run()` is what bin/ calls.

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { resolve } from "node:path";

import { TEMPLATES, templateNames, UnknownTemplateError } from "./templates.js";
import { scaffold, normalizeAppName } from "./index.js";

/**
 * Parse argv (after `node script`) into the scaffold inputs.
 * Supports: `<name>` positional, `--template/-t <t>`, `--help/-h`, `--version/-v`, and the
 * npm-init passthrough form (`npm create dig-app name -- --template t`).
 *
 * @param {string[]} argv
 * @returns {{ appName?: string, template?: string, help?: boolean, version?: boolean }}
 */
export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--version" || a === "-v") out.version = true;
    else if (a === "--template" || a === "-t") out.template = argv[++i];
    else if (a.startsWith("--template=")) out.template = a.slice("--template=".length);
    else if (a === "--") continue; // npm-init separator
    else if (a.startsWith("-")) throw new Error(`Unknown option: ${a}`);
    else if (out.appName === undefined) out.appName = a;
    // ignore extra positionals
  }
  return out;
}

/** The `--help` text. */
export function helpText() {
  const list = templateNames()
    .map((n) => `    ${n.padEnd(18)} ${TEMPLATES[n].description}`)
    .join("\n");
  return [
    "create-dig-app — scaffold a wallet-wired, deployable DIG Network app (free, no mint).",
    "",
    "Usage:",
    "  npm create dig-app@latest <name> -- --template <template>",
    "  npm create dig-app@latest            # interactive",
    "",
    "Options:",
    "  -t, --template <template>   One of the templates below",
    "  -h, --help                  Show this help",
    "  -v, --version               Print the version",
    "",
    "Templates:",
    list,
    "",
    "Scaffolding is FREE: no mint, no chain, no spend. You spend 100 DIG only when you",
    "publish a capsule with `digstore deploy`. Preview free first with `digstore dev`.",
  ].join("\n");
}

/** Ask a free-text question with an optional default. */
async function ask(rl, question, fallback) {
  const suffix = fallback ? ` (${fallback})` : "";
  const answer = (await rl.question(`${question}${suffix}: `)).trim();
  return answer || fallback || "";
}

/** Prompt for a template by number from the registry. */
async function askTemplate(rl) {
  const names = templateNames();
  stdout.write("\nPick a template:\n");
  names.forEach((n, i) => {
    stdout.write(`  ${i + 1}) ${n} — ${TEMPLATES[n].description}\n`);
  });
  while (true) {
    const raw = (await rl.question(`Template [1-${names.length}] (1): `)).trim() || "1";
    const idx = Number.parseInt(raw, 10);
    if (Number.isInteger(idx) && idx >= 1 && idx <= names.length) return names[idx - 1];
    if (names.includes(raw)) return raw; // allow typing the name
    stdout.write(`Please enter a number 1-${names.length} (or a template name).\n`);
  }
}

/**
 * Run the CLI end-to-end: parse args, fill gaps interactively, scaffold, print next steps.
 *
 * @param {string[]} argv argv after `node <script>`.
 * @param {{ cwd?: string, log?: (s: string) => void, version?: string }} [io]
 * @returns {Promise<number>} a process exit code.
 */
export async function run(argv, io = {}) {
  const log = io.log ?? ((s) => stdout.write(s + "\n"));
  const cwd = io.cwd ?? process.cwd();

  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    log(e.message);
    log("Run with --help for usage.");
    return 1;
  }

  if (args.help) {
    log(helpText());
    return 0;
  }
  if (args.version) {
    log(io.version ?? "unknown");
    return 0;
  }

  // Resolve app name + template, prompting interactively for anything missing.
  let { appName, template } = args;
  const interactive = stdin.isTTY && stdout.isTTY;
  let rl;
  try {
    if (!appName || !template) {
      if (!interactive) {
        log("Missing required arguments. Usage:");
        log("  npm create dig-app@latest <name> -- --template <template>");
        log("Run with --help to see templates.");
        return 1;
      }
      rl = createInterface({ input: stdin, output: stdout });
      if (!appName) appName = await ask(rl, "Project name", "my-dig-app");
      if (!template) template = await askTemplate(rl);
    }

    // Validate the template early with a friendly message.
    if (!templateNames().includes(template)) {
      log(new UnknownTemplateError(template).message);
      return 1;
    }

    const targetDir = resolve(cwd, normalizeAppName(appName));
    const result = scaffold({ appName, template, targetDir });

    log("");
    log(`Scaffolded "${result.appName}" (${result.template}) — free, no mint, no chain, no spend.`);
    log("");
    log("Next steps:");
    for (const step of result.nextSteps) log(`  ${step}`);
    log("");
    log("Free to build and preview — you spend 100 DIG only when you publish a capsule.");
    log("Deploy from CI: https://docs.dig.net/digstore/cli/deploy-from-github-actions");
    return 0;
  } catch (e) {
    log(`Error: ${e?.message ?? e}`);
    return 1;
  } finally {
    if (rl) rl.close();
  }
}
