// Minimal "build" for the static template: copy src/ → public/ (the dig.toml output-dir).
// No bundler, no dependencies — the lightest possible path to a publishable content root.
import { cpSync, rmSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, "src"), out, { recursive: true });

console.log("Built src/ -> public/");
