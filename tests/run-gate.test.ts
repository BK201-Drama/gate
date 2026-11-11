import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const template = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../templates/run-gate.mjs",
);

function project(acceptance: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "run-gate-"));
  fs.mkdirSync(path.join(dir, "scripts"));
  fs.copyFileSync(template, path.join(dir, "scripts", "run-gate.mjs"));
  fs.writeFileSync(
    path.join(dir, "GATE.md"),
    `---
status: approved
acceptance:
  - ${acceptance}
architecture:
  - node -e "process.exit(0)"
max_attempts: 3
attempts: 0
---
`,
  );
  spawnSync("git", ["init"], { cwd: dir, encoding: "utf8" });
  return dir;
}

test("plain run writes a passing report", () => {
  const dir = project('node -e "process.exit(0)"');
  const result = spawnSync(process.execPath, ["scripts/run-gate.mjs"], {
    cwd: dir,
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
  const report = JSON.parse(
    fs.readFileSync(path.join(dir, "GATE.report.json"), "utf8"),
  );
  assert.equal(report.passed, true);
  assert.equal(report.architecture[0].exitCode, 0);
  assert.equal(report.acceptance[0].exitCode, 0);
});

test("failure exits 1", () => {
  const dir = project('node -e "process.exit(1)"');
  const result = spawnSync(process.execPath, ["scripts/run-gate.mjs"], {
    cwd: dir,
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  const report = JSON.parse(
    fs.readFileSync(path.join(dir, "GATE.report.json"), "utf8"),
  );
  assert.equal(report.passed, false);
});

test("cursor harness does not repeat a tree it already checked", () => {
  const dir = project('node -e "process.exit(0)"');
  const once = spawnSync(
    process.execPath,
    ["scripts/run-gate.mjs", "--harness", "cursor"],
    { cwd: dir, input: '{"status":"completed"}', encoding: "utf8" },
  );
  assert.equal(once.status, 0);
  assert.match(once.stdout, /followup_message/);
  const twice = spawnSync(
    process.execPath,
    ["scripts/run-gate.mjs", "--harness", "cursor"],
    { cwd: dir, input: '{"status":"completed"}', encoding: "utf8" },
  );
  assert.equal(twice.stdout.trim(), "{}");
});
