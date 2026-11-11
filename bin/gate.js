#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cli = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/cli.ts",
);
const result = spawnSync(
  process.execPath,
  ["--experimental-strip-types", cli, ...process.argv.slice(2)],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
