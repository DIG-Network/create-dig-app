#!/usr/bin/env node
// create-dig-app — the `npm create dig-app` entry point.
//
// A thin wrapper around lib/cli.js (which wraps the pure scaffolder in lib/index.js). It reads its
// own version from package.json and forwards argv (minus `node script`) to run().

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { run } from "../lib/cli.js";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8"));

const code = await run(process.argv.slice(2), { version: pkg.version });
process.exit(code);
