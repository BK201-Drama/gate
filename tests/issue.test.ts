import assert from "node:assert/strict";
import test from "node:test";
import { demandFromIssue, parseIssueId } from "../src/issue.ts";

test("a sentence is not an issue id", () => {
  const parsed = parseIssueId(["用户能完成预约"]);
  assert.equal(parsed.id, undefined);
  assert.match(parsed.rejected ?? "", /Multica/);
});

test("MUL-12 is an issue id", () => {
  assert.deepEqual(parseIssueId(["--issue=MUL-12"]), { id: "MUL-12" });
});

test("demand comes from the issue title and description", () => {
  assert.equal(
    demandFromIssue({ issue: { title: "用户能完成预约", description: "选择时间后看到结果" } }),
    "用户能完成预约\n\n选择时间后看到结果",
  );
});
