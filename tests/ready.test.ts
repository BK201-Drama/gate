import assert from "node:assert/strict";
import test from "node:test";
import type { GateCard } from "../src/card.ts";
import type { Report } from "../src/check.ts";
import { ready } from "../src/ready.ts";

function card(status: GateCard["status"] = "approved"): GateCard {
  return {
    status,
    acceptance: ["e2e"],
    architecture: ["arch"],
    maxAttempts: 3,
    attempts: 1,
    body: "",
    filePath: "GATE.md",
  };
}

function report(passed: boolean): Report {
  return { passed, attempts: 1, architecture: [], acceptance: [] };
}

test("unapproved card is refused", () => {
  assert.equal(ready(card("draft"), report(true)).code, 2);
});

test("missing report is refused", () => {
  assert.equal(ready(card(), null).code, 2);
});

test("failed report does not change status", () => {
  const subject = card();
  const result = ready(subject, report(false));
  assert.equal(result.code, 1);
  assert.equal(subject.status, "approved");
});

test("passed report marks the card ready", () => {
  const subject = card();
  const result = ready(subject, report(true));
  assert.equal(result.code, 0);
  assert.equal(subject.status, "ready");
});
