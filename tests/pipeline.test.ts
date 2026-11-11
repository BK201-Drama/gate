import assert from "node:assert/strict";
import test from "node:test";
import { executeRun, type AgentMode } from "../src/pipeline.ts";

test("empty demand is refused before any agent call", () => {
  let calls = 0;
  const result = executeRun({
    demand: "  ",
    allow: () => 0,
    check: () => 0,
    ready: () => 0,
    isBlocked: () => false,
    reportText: () => "",
    spawnAgent: () => {
      calls += 1;
      return { code: 0, output: "" };
    },
    maxAttempts: 3,
  });
  assert.equal(result.code, 2);
  assert.equal(calls, 0);
});

test("a passing check is reviewed, then marked ready", () => {
  const modes: AgentMode[] = [];
  const result = executeRun({
    demand: "用户能看到预约结果",
    allow: () => 0,
    check: () => 0,
    ready: () => 0,
    isBlocked: () => false,
    reportText: () => "",
    spawnAgent: (_prompt, mode) => {
      modes.push(mode);
      return { code: 0, output: "VERDICT: pass" };
    },
    maxAttempts: 3,
  });
  assert.equal(result.code, 0);
  assert.deepEqual(modes, ["write", "review"]);
});

test("a blocked review uses another attempt, then can pass", () => {
  const modes: AgentMode[] = [];
  let reviews = 0;
  let checks = 0;
  const result = executeRun({
    demand: "用户能看到预约结果",
    allow: () => 0,
    check: () => {
      checks += 1;
      return 0;
    },
    ready: () => 0,
    isBlocked: () => false,
    reportText: () => "",
    spawnAgent: (_prompt, mode) => {
      modes.push(mode);
      if (mode === "review") reviews += 1;
      return {
        code: 0,
        output:
          reviews === 1 ? "VERDICT: block\npage missing" : "VERDICT: pass",
      };
    },
    maxAttempts: 3,
  });
  assert.equal(result.code, 0);
  assert.equal(checks, 2);
  assert.deepEqual(modes, ["write", "review", "write", "review"]);
});

test("the next write prompt contains the failed command output", () => {
  const prompts: string[] = [];
  let checks = 0;
  executeRun({
    demand: "用户能看到预约结果",
    allow: () => 0,
    check: () => {
      checks += 1;
      return checks === 1 ? 1 : 0;
    },
    ready: () => 0,
    isBlocked: () => false,
    reportText: () =>
      "domain-must-not-import-ui: src/domain/order.ts -> src/api/client.ts",
    spawnAgent: (prompt, mode) => {
      if (mode === "write") prompts.push(prompt);
      return { code: 0, output: "VERDICT: pass" };
    },
    maxAttempts: 3,
  });
  assert.match(prompts[1] ?? "", /domain-must-not-import-ui/);
});

test("three failed checks stop without review", () => {
  const modes: AgentMode[] = [];
  const result = executeRun({
    demand: "用户能看到预约结果",
    allow: () => 0,
    check: () => 1,
    ready: () => 0,
    isBlocked: () => false,
    reportText: () => "domain import failed",
    spawnAgent: (_prompt, mode) => {
      modes.push(mode);
      return { code: 0, output: "" };
    },
    maxAttempts: 3,
  });
  assert.equal(result.code, 1);
  assert.deepEqual(modes, ["write", "write", "write"]);
});
