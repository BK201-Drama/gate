import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { main } from "../src/cli.ts";
import { loadCard } from "../src/card.ts";

function project(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "gate-cli-"));
}

test("init lays down the workflow and allow passes", () => {
  const cwd = project();
  const logs: string[] = [];
  const code = main(["init", "--kind", "web"], {
    cwd,
    gateBin: "node gate.js",
    stdout: (text) => logs.push(text),
  });
  assert.equal(code, 0);
  assert.equal(fs.existsSync(path.join(cwd, "AGENTS.md")), true);
  assert.equal(fs.existsSync(path.join(cwd, "scripts/run-gate.mjs")), true);
  assert.equal(fs.existsSync(path.join(cwd, ".githooks/pre-commit")), true);
  assert.equal(fs.existsSync(path.join(cwd, ".cursor/hooks.json")), true);
  assert.equal(fs.existsSync(path.join(cwd, ".claude/settings.json")), true);
  assert.equal(fs.existsSync(path.join(cwd, ".codex/hooks.json")), true);
  assert.match(
    fs.readFileSync(path.join(cwd, ".github/workflows/gate.yml"), "utf8"),
    /node scripts\/run-gate\.mjs/,
  );
  assert.equal(fs.existsSync(path.join(cwd, ".cursor/rules/gate.mdc")), true);
  assert.equal(fs.existsSync(path.join(cwd, "scripts/arch.mjs")), true);
  assert.equal(fs.existsSync(path.join(cwd, "playwright.config.ts")), true);
  assert.equal(fs.existsSync(path.join(cwd, ".dependency-cruiser.cjs")), true);
  const again = main(["init"], {
    cwd,
    gateBin: "node gate.js",
    stdout: () => {},
  });
  assert.equal(again, 0);
  assert.match(
    fs.readFileSync(path.join(cwd, "GATE.md"), "utf8"),
    /status: approved/,
  );
});

test("check writes a report and ready refuses until it passes", () => {
  const cwd = project();
  const card = path.join(cwd, "GATE.md");
  fs.writeFileSync(
    card,
    "---\nstatus: approved\nacceptance:\n  - e2e\narchitecture:\n  - arch\nmax_attempts: 3\nattempts: 0\n---\n\n",
  );
  const output: string[] = [];
  const code = main(["check", card], {
    cwd,
    stdout: (text) => output.push(text),
    run: (command) => ({
      command,
      exitCode: command === "arch" ? 0 : 1,
      output: "no",
    }),
  });
  assert.equal(code, 1);
  const report = JSON.parse(
    fs.readFileSync(path.join(cwd, "GATE.report.json"), "utf8"),
  );
  assert.equal(report.passed, false);
  const readyCode = main(["ready", card], { cwd, stdout: () => {} });
  assert.equal(readyCode, 1);
  assert.equal(loadCard(card).status, "approved");
});

test("missing card is refused", () => {
  const cwd = project();
  const code = main(["ready", path.join(cwd, "missing.md")], {
    cwd,
    stdout: () => {},
  });
  assert.equal(code, 2);
});

test("unknown command is refused", () => {
  assert.equal(main(["nope"], { stdout: () => {} }), 2);
});

test("a demand sentence is refused", () => {
  const lines: string[] = [];
  const code = main(["run", "用户能完成预约"], {
    stdout: (text) => lines.push(text),
    loadIssue: () => {
      throw new Error("should not read an issue");
    },
  });
  assert.equal(code, 2);
  assert.match(lines.join(""), /Multica/);
});

test("run reads the demand from the Multica issue", () => {
  const cwd = project();
  fs.writeFileSync(
    path.join(cwd, "GATE.md"),
    "---\nstatus: approved\nacceptance:\n  - e2e\narchitecture:\n  - arch\nmax_attempts: 3\nattempts: 0\n---\n\n",
  );
  const prompts: string[] = [];
  const comments: string[] = [];
  const code = main(["run", "MUL-12"], {
    cwd,
    stdout: () => {},
    loadIssue: () => ({ title: "用户能完成预约", description: "选择时间后看到结果" }),
    commentOnIssue: (_id, body) => comments.push(body),
    run: (command) => ({ command, exitCode: 0, output: "" }),
    spawnAgent: (prompt) => {
      prompts.push(prompt);
      return { code: 0, output: "VERDICT: pass" };
    },
  });
  assert.equal(code, 0);
  assert.match(prompts[0] ?? "", /用户能完成预约/);
  assert.match(prompts[0] ?? "", /选择时间后看到结果/);
  assert.equal(comments.length > 0, true);
});
