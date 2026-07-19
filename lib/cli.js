// CLI argument parsing + interactive flow for `create-dig-app`.
//
// Kept separate from index.js (the pure scaffolding lib) so the arg/prompt logic is independently
// testable and the scaffold core stays free of process/TTY concerns. `run()` is what bin/ calls.
//
// Agent-friendly surface (see AGENT_FRIENDLY.md → create-dig-app):
//   - `--json`            one structured object on stdout, all human prose on stderr, no prompts.
//   - `--help-json`       the full flag/template tree + the exit-code table as data.
//   - `--list-templates`  the TEMPLATES registry as data (pair with `--json`).
//   - a differentiated, documented EXIT table (no single generic exit 1).
//   - on failure, `{ok:false,error:{code,exit_code,message,hint,…}}` under `--json`.

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { resolve } from "node:path";

import { TEMPLATES, templateNames, UnknownTemplateError } from "./templates.js";
import { scaffold, normalizeAppName, normalizeLang, resolveTemplate } from "./index.js";

/**
 * The schema version of the machine-readable output envelopes (`--json`, `--help-json`,
 * `--list-templates --json`). Bump on any breaking change to those shapes.
 */
export const SCHEMA_VERSION = 1;

/**
 * The stable, documented exit-code table. Each failure class gets a distinct non-zero code so a
 * script/agent can branch on the *kind* of failure, not just success/failure. Documented in README
 * and emitted from `--help-json`.
 * @type {{ SUCCESS:0, USAGE:2, UNKNOWN_TEMPLATE:3, TARGET_NOT_EMPTY:4, MISSING_ARGS:5, TEMPLATE_FILES_MISSING:6, INVALID_APP_NAME:7, INTERNAL:1 }}
 */
export const EXIT = Object.freeze({
  SUCCESS: 0,
  INTERNAL: 1, // an unexpected/uncategorized error (kept as the generic fallback only)
  USAGE: 2, // bad/unknown option or malformed arguments
  UNKNOWN_TEMPLATE: 3, // --template names a template that does not exist
  TARGET_NOT_EMPTY: 4, // the target directory exists and is not empty (refusing to overwrite)
  MISSING_ARGS: 5, // required args missing and not running interactively (no TTY)
  TEMPLATE_FILES_MISSING: 6, // the bundled template files are missing (a packaging bug)
  INVALID_APP_NAME: 7, // the app name normalizes to nothing usable
});

/** Human-readable meaning for each exit code (emitted in `--help-json`). */
const EXIT_MEANINGS = Object.freeze({
  [EXIT.SUCCESS]: "success",
  [EXIT.INTERNAL]: "unexpected internal error",
  [EXIT.USAGE]: "usage error (bad or unknown option / malformed arguments)",
  [EXIT.UNKNOWN_TEMPLATE]: "unknown template id",
  [EXIT.TARGET_NOT_EMPTY]: "target directory exists and is not empty",
  [EXIT.MISSING_ARGS]: "required arguments missing in non-interactive mode",
  [EXIT.TEMPLATE_FILES_MISSING]: "bundled template files are missing",
  [EXIT.INVALID_APP_NAME]: "app name is not usable",
});

/**
 * Parse argv (after `node script`) into the scaffold inputs.
 * Supports: `<name>` positional, `--template/-t <t>`, the language flags
 * (`--typescript`/`--ts`, `--javascript`/`--js`, `--lang <js|ts>`/`--lang=<v>`), `--help/-h`,
 * `--version/-v`, the machine flags `--json` / `--help-json` / `--list-templates`, and the
 * npm-init passthrough form (`npm create dig-app name -- --template t`).
 *
 * @param {string[]} argv
 * @returns {{ appName?: string, template?: string, lang?: ("js"|"ts"), help?: boolean,
 *   helpJson?: boolean, version?: boolean, json?: boolean, listTemplates?: boolean }}
 */
export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--help-json") out.helpJson = true;
    else if (a === "--version" || a === "-v") out.version = true;
    else if (a === "--json") out.json = true;
    else if (a === "--list-templates") out.listTemplates = true;
    else if (a === "--template" || a === "-t") out.template = argv[++i];
    else if (a.startsWith("--template=")) out.template = a.slice("--template=".length);
    // Language: long/short shorthands and the explicit `--lang <value>` (value normalized below).
    else if (a === "--typescript" || a === "--ts") out.lang = "ts";
    else if (a === "--javascript" || a === "--js") out.lang = "js";
    else if (a === "--lang") out.lang = normalizeLang(argv[++i]);
    else if (a.startsWith("--lang=")) out.lang = normalizeLang(a.slice("--lang=".length));
    else if (a === "--")
      continue; // npm-init separator
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
    "Prefer Rust? `digstore new` scaffolds the same starters from the CLI.",
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
    "      --json                  Emit one structured result on stdout (prose → stderr)",
    "      --list-templates        List the templates (pair with --json for machine output)",
    "      --help-json             Print the full flag/template tree + exit codes as JSON",
    "  -h, --help                  Show this help",
    "  -v, --version               Print the version",
    "",
    "Templates:",
    list,
    "",
    "Scaffolding is FREE: no mint, no chain, no spend. You spend $DIG only when you publish a",
    "capsule with `digstore deploy`. Preview free first with `digstore dev`.",
    "Published apps live on DIGHUb (hub.dig.net/stores/<id>) and, optionally, at <name>.on.dig.net.",
  ].join("\n");
}

/**
 * The template registry as plain data (for `--list-templates --json`): id, title, description,
 * output dir, build command, wallet flag, and supported languages — straight from {@link TEMPLATES}
 * (no second source of truth).
 * @returns {Array<{id:string,title:string,description:string,outputDir:string,buildCommand:string,wallet:boolean,langs:string[]}>}
 */
export function listTemplatesJson() {
  return templateNames().map((id) => {
    const t = TEMPLATES[id];
    return {
      id,
      title: t.title,
      description: t.description,
      outputDir: t.outputDir,
      buildCommand: t.buildCommand,
      wallet: t.wallet,
      langs: [...t.langs],
    };
  });
}

/**
 * The complete machine self-description (`--help-json`): the global flag list, the template tree,
 * and the exit-code table — so one introspection call yields the whole invocation contract.
 * @returns {object}
 */
export function helpJson() {
  return {
    schemaVersion: SCHEMA_VERSION,
    name: "create-dig-app",
    summary: "Scaffold a wallet-wired, deployable DIG Network app (free, no mint).",
    flags: [
      { name: "--template", alias: "-t", value: "<template>", description: "The template to scaffold." },
      {
        name: "--typescript",
        aliases: ["--ts"],
        description: "Scaffold the TypeScript variant (where available).",
      },
      { name: "--javascript", aliases: ["--js"], description: "Scaffold the JavaScript variant (default)." },
      { name: "--lang", value: "<js|ts>", description: "Same as the language flags." },
      { name: "--json", description: "Emit one structured result object on stdout; route prose to stderr." },
      { name: "--list-templates", description: "List the available templates (use with --json for data)." },
      { name: "--help-json", description: "Print this machine self-description as JSON." },
      { name: "--help", alias: "-h", description: "Show human help." },
      { name: "--version", alias: "-v", description: "Print the version." },
    ],
    templates: listTemplatesJson(),
    exitCodes: Object.fromEntries(Object.entries(EXIT_MEANINGS).map(([code, meaning]) => [code, meaning])),
  };
}

/**
 * Classify an error thrown by the scaffolder/CLI into a stable machine code, exit code, and hint.
 * The codes are UPPER_SNAKE symbolic strings (never derived from the human message) and pair 1:1
 * with the {@link EXIT} table. Structured fields already on the error (e.g.
 * {@link UnknownTemplateError}.requested) are carried through rather than flattened to prose.
 *
 * @param {unknown} e
 * @returns {{ code: string, exit_code: number, message: string, hint: string, extra?: object }}
 */
export function classifyError(e) {
  const message = (e && e.message) || String(e);
  if (e instanceof UnknownTemplateError) {
    return {
      code: "UNKNOWN_TEMPLATE",
      exit_code: EXIT.UNKNOWN_TEMPLATE,
      message,
      hint: `Run with --list-templates (or --help) to see the available templates.`,
      extra: { template: e.requested },
    };
  }
  // Plain-Error cases from the scaffolder, distinguished by their stable wording.
  if (/exists and is not empty/i.test(message)) {
    return {
      code: "TARGET_NOT_EMPTY",
      exit_code: EXIT.TARGET_NOT_EMPTY,
      message,
      hint: "Choose a new app name or empty the target directory, then re-run.",
    };
  }
  if (/template files for .* are missing/i.test(message)) {
    return {
      code: "TEMPLATE_FILES_MISSING",
      exit_code: EXIT.TEMPLATE_FILES_MISSING,
      message,
      hint: "This is a packaging bug — reinstall create-dig-app or report it.",
    };
  }
  if (/is not a usable app name|app name must be a string/i.test(message)) {
    return {
      code: "INVALID_APP_NAME",
      exit_code: EXIT.INVALID_APP_NAME,
      message,
      hint: "Use a name containing letters or digits (it is slugified to an npm-safe package name).",
    };
  }
  return {
    code: "INTERNAL",
    exit_code: EXIT.INTERNAL,
    message,
    hint: "An unexpected error occurred. Re-run with --help for usage.",
  };
}

/**
 * Ask a free-text question with an optional default.
 * Exported for unit testing; `rl` is any object with an async `question(prompt) => string` (the
 * production caller passes a `node:readline/promises` interface).
 * @param {{ question: (q: string) => Promise<string> }} rl
 * @param {string} question
 * @param {string} [fallback]
 * @returns {Promise<string>}
 */
export async function ask(rl, question, fallback) {
  const suffix = fallback ? ` (${fallback})` : "";
  const answer = (await rl.question(`${question}${suffix}: `)).trim();
  return answer || fallback || "";
}

/**
 * Prompt for a template by number from the registry (or by typing its name). Re-prompts on an
 * out-of-range / unrecognized answer. Exported for unit testing (pass a fake `rl`).
 * @param {{ question: (q: string) => Promise<string> }} rl
 * @returns {Promise<string>} a canonical template id.
 */
export async function askTemplate(rl) {
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
 * variant; JS-only templates (e.g. `static-site`) skip the prompt entirely. Returns "js" or "ts".
 * Exported for unit testing (pass a fake `rl`).
 * @param {{ question: (q: string) => Promise<string> }} rl
 * @param {string} template A validated template id.
 * @returns {Promise<("js"|"ts")>}
 */
export async function askLang(rl, template) {
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
 * @param {{ cwd?: string, log?: (s: string) => void, out?: (s: string) => void,
 *   err?: (s: string) => void, version?: string }} [io]
 *   `log` is the default human sink (stdout). Under `--json`, structured output goes to `out`
 *   (stdout) and all human prose goes to `err` (stderr). When `out`/`err` are omitted they default
 *   to process stdout/stderr.
 * @returns {Promise<number>} a process exit code (see {@link EXIT}).
 */
export async function run(argv, io = {}) {
  const log = io.log ?? ((s) => stdout.write(s + "\n"));
  const out = io.out ?? ((s) => stdout.write(s + "\n"));
  const err = io.err ?? ((s) => process.stderr.write(s + "\n"));
  const cwd = io.cwd ?? process.cwd();

  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    // A parse failure (unknown option / bad --lang) is a USAGE error.
    if (argvHasJson(argv)) {
      emitJsonError(out, {
        code: "BAD_USAGE",
        exit_code: EXIT.USAGE,
        message: e.message,
        hint: "Run with --help for usage.",
      });
    } else {
      log(e.message);
      log("Run with --help for usage.");
    }
    return EXIT.USAGE;
  }

  const json = args.json === true;
  // Under --json, human prose must go to stderr; otherwise it goes to the normal log sink.
  const human = json ? err : log;

  // Machine self-description — always to stdout, never gated by --json.
  if (args.helpJson) {
    out(JSON.stringify(helpJson(), null, 2));
    return EXIT.SUCCESS;
  }
  if (args.listTemplates) {
    if (json) out(JSON.stringify({ schemaVersion: SCHEMA_VERSION, templates: listTemplatesJson() }, null, 2));
    else log(helpText());
    return EXIT.SUCCESS;
  }
  if (args.help) {
    human(helpText());
    return EXIT.SUCCESS;
  }
  if (args.version) {
    if (json)
      out(JSON.stringify({ schemaVersion: SCHEMA_VERSION, version: io.version ?? "unknown" }, null, 2));
    else log(io.version ?? "unknown");
    return EXIT.SUCCESS;
  }

  // Resolve app name + template (+ language), prompting interactively for anything missing.
  // Under --json we never prompt (agents run unattended) — missing args fail closed.
  let { appName, template, lang } = args;
  const interactive = !json && stdin.isTTY && stdout.isTTY;
  let rl;
  try {
    if (!appName || !template) {
      if (!interactive) {
        if (json) {
          emitJsonError(out, {
            code: "MISSING_ARGS",
            exit_code: EXIT.MISSING_ARGS,
            message:
              "Missing required arguments: <name> and --template are required in non-interactive mode.",
            hint: "Pass a name and --template, e.g. `create-dig-app my-app --template vite-react --json`.",
          });
        } else {
          log("Missing required arguments. Usage:");
          log("  npm create dig-app@latest <name> -- --template <template>");
          log("Run with --help to see templates.");
        }
        return EXIT.MISSING_ARGS;
      }
      rl = createInterface({ input: stdin, output: stdout });
      if (!appName) appName = await ask(rl, "Project name", "my-dig-app");
      if (!template) template = await askTemplate(rl);
    }

    // Validate the template early (accepts the hidden `static` alias via resolveTemplate).
    try {
      resolveTemplate(template);
    } catch (e) {
      const info = classifyError(e);
      if (json) emitJsonError(out, info);
      else log(info.message);
      return info.exit_code;
    }

    // Ask for the language only when interactive and not already specified on the command line.
    if (lang === undefined && rl) lang = await askLang(rl, template);

    const targetDir = resolve(cwd, normalizeAppName(appName));
    const result = scaffold({ appName, template, lang, targetDir });

    if (json) {
      out(JSON.stringify({ schemaVersion: SCHEMA_VERSION, ok: true, result }, null, 2));
      return EXIT.SUCCESS;
    }

    // Tell the user the language that was actually scaffolded. If they asked for TS on a JS-only
    // template (e.g. `static-site`), say so plainly rather than silently producing a JS project.
    const langLabel = result.lang === "ts" ? "TypeScript" : "JavaScript";
    human("");
    human(
      `Scaffolded "${result.appName}" (${result.template}, ${langLabel}) — free, no mint, no chain, no spend.`,
    );
    if (result.requestedLang === "ts" && result.lang === "js") {
      human(
        `Note: the "${result.template}" template has no TypeScript variant, so it was scaffolded in JavaScript.`,
      );
    }
    human("");
    human("Next steps:");
    for (const step of result.nextSteps) human(`  ${step}`);
    human("");
    human("Free to build and preview — you spend $DIG only when you publish a capsule.");
    human("Your app deploys to DIGHUb (hub.dig.net/stores/<id>); register an optional name.on.dig.net too.");
    human("Deploy from CI: https://docs.dig.net/docs/digstore/cli/deploy-from-github-actions");
    return EXIT.SUCCESS;
  } catch (e) {
    const info = classifyError(e);
    if (json) emitJsonError(out, info);
    else log(`Error: ${info.message}`);
    return info.exit_code;
  } finally {
    if (rl) rl.close();
  }
}

/** True if `--json` appears in argv (needed before parseArgs succeeds, e.g. a parse error). */
function argvHasJson(argv) {
  return Array.isArray(argv) && argv.includes("--json");
}

/** Emit a structured error envelope to the machine stdout sink. */
function emitJsonError(out, { code, exit_code, message, hint, extra }) {
  out(
    JSON.stringify(
      {
        schemaVersion: SCHEMA_VERSION,
        ok: false,
        error: { code, exit_code, message, hint, ...(extra || {}) },
      },
      null,
      2,
    ),
  );
}
