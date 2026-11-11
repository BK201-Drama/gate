import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { allow } from "../src/allow.ts";
import { loadCard, reopen, type GateCard } from "../src/card.ts";

function card(status: GateCard["status"]): GateCard {
  return {
    status,
    acceptance: ['node -e "process.exit(0)"'],
    architecture: ['node -e "process.exit(0)"'],
    maxAttempts: 3,
    attempts: 0,
    body: "",
    filePath: "GATE.md",
  };
}

test("approved card is allowed", () => {
  assert.deepEqual(allow(card("approved")), { code: 0, message: "approved" });
});

test("draft card is refused", () => {
  const result = allow(card("draft"));
  assert.equal(result.code, 2);
  assert.match(result.message, /draft/);
});

test("a finished card reopens for the next run", () => {
  const subject: GateCard = {
    status: "ready",
    acceptance: ["npm run e2e"],
    architecture: ["npm run arch"],
    maxAttempts: 3,
    attempts: 3,
    body: "",
    filePath: "GATE.md",
  };
  reopen(subject);
  assert.equal(subject.status, "approved");
  assert.equal(subject.attempts, 0);
});
test("capital status is refused while loading", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-"));
  const file = path.join(dir, "GATE.md");
  fs.writeFileSync(
    file,
    "---\nstatus: Approved\nacceptance:\n  - npm run e2e\narchitecture:\n  - npm run arch\n---\n",
  );
  assert.throws(() => loadCard(file), /Approved/);
});
