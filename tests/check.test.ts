import assert from "node:assert/strict";
import test from "node:test";
import { check, tail, type CommandResult, type Runner } from "../src/check.ts";
import type { GateCard } from "../src/card.ts";

function card(overrides: Partial<GateCard> = {}): GateCard {
  return {
    status: "approved",
    acceptance: ["e2e"],
    architecture: ["arch"],
    maxAttempts: 3,
    attempts: 0,
    body: "",
    filePath: pathOf("proj/GATE.md"),
    ...overrides,
  };
}

function pathOf(value: string): string {
  return value.split("/").join(requirePathSep());
}

function requirePathSep(): string {
  return process.platform === "win32" ? "\\" : "/";
}

function runner(codes: Record<string, number>): Runner {
  return (command) => ({
    command,
    exitCode: codes[command] ?? 0,
    output: command,
  });
}

test("unapproved card is refused", () => {
  const result = check(card({ status: "draft" }), runner({}));
  assert.equal(result.code, 2);
  assert.equal(result.report, undefined);
});

test("empty architecture is refused", () => {
  const result = check(card({ architecture: [] }), runner({}));
  assert.equal(result.code, 2);
  assert.match(result.message, /architecture/);
});

test("both commands passing increments attempts and stays approved", () => {
  const subject = card();
  const result = check(subject, runner({ arch: 0, e2e: 0 }));
  assert.equal(result.code, 0);
  assert.equal(result.report?.passed, true);
  assert.equal(subject.attempts, 1);
  assert.equal(subject.status, "approved");
  assert.deepEqual(
    result.report?.architecture.map((item) => item.command),
    ["arch"],
  );
  assert.deepEqual(
    result.report?.acceptance.map((item) => item.command),
    ["e2e"],
  );
});

test("failure at the attempt cap blocks the card", () => {
  const subject = card({ attempts: 2, maxAttempts: 3 });
  const result = check(subject, runner({ arch: 1, e2e: 0 }));
  assert.equal(result.code, 1);
  assert.equal(subject.status, "blocked");
  assert.equal(subject.attempts, 3);
});

test("output keeps the last 8000 characters", () => {
  const long = "x".repeat(8001);
  const run: Runner = () => ({
    command: "arch",
    exitCode: 0,
    output: tail(long),
  });
  const result = check(card({ acceptance: ["e2e"] }), (command, cwd) => {
    const item: CommandResult =
      command === "arch"
        ? run(command, cwd)
        : { command, exitCode: 0, output: "" };
    return item;
  });
  assert.equal(result.report?.architecture[0]?.output.length, 8000);
});
