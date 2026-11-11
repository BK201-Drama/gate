import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const arch = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../templates/arch.mjs",
);

function project(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "gate-arch-"));
}

test("domain importing ui fails", () => {
  const dir = project();
  fs.mkdirSync(path.join(dir, "src/domain"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src/ui"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "src/ui/button.ts"),
    "export const label = 'ok';\n",
  );
  fs.writeFileSync(
    path.join(dir, "src/domain/order.ts"),
    "import { label } from '../ui/button.ts';\nexport const name = label;\n",
  );
  const result = spawnSync(process.execPath, [arch], {
    cwd: dir,
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /domain-must-not-import-ui/);
});

test("domain with no outward import passes", () => {
  const dir = project();
  fs.mkdirSync(path.join(dir, "src/domain"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "src/domain/order.ts"),
    "export const id = 1;\n",
  );
  const result = spawnSync(process.execPath, [arch], {
    cwd: dir,
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
});
