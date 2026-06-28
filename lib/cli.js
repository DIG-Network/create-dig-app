// CLI argument parsing + interactive flow for `create-dig-app`.
//
// Kept separate from index.js (the pure scaffolding lib) so the arg/prompt logic is independently
// testable and the scaffold core stays free of process/TTY concerns. `run()` is what bin/ calls.

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { resolve } from "node:path";

import { TEMPLATES, templateNames, UnknownTemplateError } from "./templates.js";
import { scaffold, normalizeAppName, normalizeLang, resolveTemplate } from "./index.js";

/**
 * Parse argv (after `node script`) into the scaffold inputs.
 * Supports: `<name>` positional, `--template/-t <t>`, the language flags
 * (`--typescript`/`--ts`, `--javascript`/`--js`, `--lang <js|ts>`/`--lang=<v>`), `--help/-h`,
 * `--version/-v`, and the npm-init passthrough form (`npm create dig-app name -- --template t`).
 *
 * @param {string[]} argv
 * @returns {{ appName?: string, template?: string, lang?: ("js"|"ts"), help?: boolean, version?: boolean }}
 */
export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--version" || a === "-v") out.version = true;
    else if (a === "--template" || a === "-t") out.template = argv[++i];
    else if (a.startsWith("--template=")) out.template = a.slice("--template=".length);
    // Language: long/short shorthands and the explicit `--lang <value>` (value normalized below).
    else if (a === "--typescript" || a === "--ts") out.lang = "ts";
    else if (a === "--javascript" || a === "--js") out.lang = "js";
    else if (a === "--lang") out.lang = normalizeLang(argv[++i]);
    else if (a.startsWith("--lang=")) out.lang = normalizeLang(a.slice("--lang=".length));
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
    "      --typescript, --ts      Scaffold the TypeScript variant (where available)",
    "      --javascript, --js      Scaffold the JavaScript variant (default)",
    "      --lang <js|ts>          Same as the language flags above",
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
 * Prompt for the scaffold language. Only asked for templates that actually offer a TypeScript
 * variant; JS-only templates (e.g. `static`) skip the prompt entirely. Returns "js" or "ts".
 * @param {import("node:readline/promises").Interface} rl
 * @param {string} template A validated template id.
 * @returns {Promise<("js"|"ts")>}
 */
async function askLang(rl, template) {
  // Only the JS variant exists for some templates — don't ask a question with one answer.
  if (!resolveTemplate(template).langs.includes("ts")) return "js";
  stdout.write("\nLanguage:\n");
  stdout.write("  1) JavaScript\n");
  stdout.write("  2) TypeScript\n");
  while (true) {
    const raw = (await rl.question("Language [1-2] (1): ")).trim() || "1";
    if (raw === "1") return "js";
    if (raw === "2") return "ts";
    try {
      return normalizeLang(raw); // also accept "js"/"javascript"/"ts"/"typescript" typed directly
    } catch {
      stdout.write("Please enter 1 (JavaScript) or 2 (TypeScript).\n");
    }
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

  // Resolve app name + template (+ language), prompting interactively for anything missing.
  let { appName, template, lang } = args;
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

    // Ask for the language only when interactive and not already specified on the command line.
    if (lang === undefined && rl) lang = await askLang(rl, template);

    const targetDir = resolve(cwd, normalizeAppName(appName));
    const result = scaffold({ appName, template, lang, targetDir });

    // Tell the user the language that was actually scaffolded. If they asked for TS on a JS-only
    // template (e.g. `static`), say so plainly rather than silently producing a JS project.
    const langLabel = result.lang === "ts" ? "TypeScript" : "JavaScript";
    log("");
    log(
      `Scaffolded "${result.appName}" (${result.template}, ${langLabel}) — free, no mint, no chain, no spend.`,
    );
    if (result.requestedLang === "ts" && result.lang === "js") {
      log(
        `Note: the "${result.template}" template has no TypeScript variant, so it was scaffolded in JavaScript.`,
      );
    }
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
