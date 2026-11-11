export type IssueText = { title: string; description: string };

const ISSUE_ID = /^[A-Za-z][A-Za-z0-9]*-\d+$/;

export function parseIssueId(argv: string[]): { id?: string; rejected?: string } {
  const fromFlag = argv.find((arg) => arg.startsWith("--issue="))?.slice("--issue=".length);
  const positional = argv.filter((arg) => !arg.startsWith("--") && arg !== fromFlag);
  const id = (fromFlag ?? positional[0] ?? "").trim();
  if (!id) {
    return { rejected: "refused: 需求写在 Multica issue 上。用法：gate run <issue-id>" };
  }
  if (!ISSUE_ID.test(id)) {
    return {
      rejected: `refused: 「${id}」不是 Multica issue。先在 Multica 发布需求，再执行 gate run <issue-id> 或 gate check --issue <issue-id>。`,
    };
  }
  return { id };
}

export function demandFromIssue(raw: unknown): string {
  const issue = unwrap(raw);
  const title = text(issue, "title");
  const description = text(issue, "description") || text(issue, "body");
  return [title, description].filter(Boolean).join("\n\n");
}

function unwrap(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  const record = raw as Record<string, unknown>;
  for (const key of ["issue", "data"]) {
    const nested = record[key];
    if (nested && typeof nested === "object" && ("title" in nested || "description" in nested)) {
      return nested as Record<string, unknown>;
    }
  }
  return record;
}

function text(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}
