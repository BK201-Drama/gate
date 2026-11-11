#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { allow } from "./allow.ts";
import { GateRefuse, loadCard, reopen, saveCard } from "./card.ts";
import { check, type Report, type Runner } from "./check.ts";
import { demandFromIssue, parseIssueId } from "./issue.ts";
import { initProject, type InitKind } from "./init.ts";
import {
  executeRun,
  spawnCursor,
  type AgentMode,
  type AgentResult,
} from "./pipeline.ts";
import { ready } from "./ready.ts";
import { shellRun } from "./run.ts";

type Io = {
  cwd: string;
  run: Runner;
  gateBin: string;
  stdout: (text: string) => void;
  readReport: (filePath: string) => Report | null;
  writeReport: (filePath: string, report: Report) => void;
  spawnAgent: (prompt: string, mode: AgentMode) => AgentResult;
  loadIssue: (id: string) => unknown;
  commentOnIssue: (id: string, body: string) => void;
};

export function main(argv: string[], io?: Partial<Io>): number {
  const full = defaultIo(io);
  const [command, ...rest] = argv;
  try {
    if (command === "init") return initCommand(rest, full);
    if (command === "allow")
      return allowCommand(cardPath(rest, full.cwd), full);
    if (command === "check")
      return checkCommand(cardPath(rest, full.cwd), rest, full);
    if (command === "ready")
      return readyCommand(cardPath(rest, full.cwd), full);
    if (command === "run") return runCommand(rest, full);
    full.stdout("refused: use init, allow, check, ready, or run\n");
    return 2;
  } catch (error) {
    const message =
      error instanceof GateRefuse
        ? error.message
        : "refused: card is unreadable";
    full.stdout(`${message}\n`);
    return 2;
  }
}

function initCommand(rest: string[], io: Io): number {
  let kind: InitKind = "web";
  let force = false;
  let install = false;
  for (const arg of rest) {
    if (arg === "--force") force = true;
    else if (arg === "--install") install = true;
    else if (arg === "--kind") continue;
    else if (arg === "web" || arg === "mini") kind = arg;
    else if (arg.startsWith("--kind="))
      kind = arg.slice("--kind=".length) === "mini" ? "mini" : "web";
  }
  const lines = initProject(io.cwd, {
    kind,
    force,
    install,
    gateBin: io.gateBin,
  });
  io.stdout(`${lines.join("\n")}\n`);
  return 0;
}

function allowCommand(filePath: string, io: Io): number {
  const result = allow(loadCard(filePath));
  io.stdout(`${result.message}\n`);
  return result.code;
}

function checkCommand(filePath: string, rest: string[], io: Io): number {
  const card = loadCard(filePath);
  const result = check(card, io.run);
  if (result.report) {
    io.writeReport(reportPath(filePath), result.report);
    saveCard(card);
  }
  const issueId = parseIssueId(rest.filter((arg) => arg.startsWith("--issue"))).id;
  if (issueId) io.commentOnIssue(issueId, commentBody(result.message, result.report));
  io.stdout(`${result.message}\n`);
  return result.code;
}

function readyCommand(filePath: string, io: Io): number {
  const card = loadCard(filePath);
  const result = ready(card, io.readReport(reportPath(filePath)));
  if (result.code === 0) saveCard(card);
  io.stdout(`${result.message}\n`);
  return result.code;
}

function runCommand(rest: string[], io: Io): number {
  const parsed = parseIssueId(rest);
  if (!parsed.id) {
    io.stdout(`${parsed.rejected}\n`);
    return 2;
  }
  const demand = demandFromIssue(io.loadIssue(parsed.id));
  if (!demand.trim()) {
    io.stdout("refused: Multica issue 没有标题或正文\n");
    return 2;
  }
  const filePath = path.join(io.cwd, "GATE.md");
  if (fs.existsSync(filePath)) {
    const card = loadCard(filePath);
    reopen(card);
    saveCard(card);
  }
  const result = executeRun({
    demand,
    maxAttempts: 3,
    allow: () => allow(loadCard(filePath)).code,
    check: () => checkCommand(filePath, [`--issue=${parsed.id}`], io),
    ready: () => readyCommand(filePath, io),
    isBlocked: () => loadCard(filePath).status === "blocked",
    reportText: () => {
      const report = io.readReport(reportPath(filePath));
      return report ? JSON.stringify(report, null, 2) : "";
    },
    spawnAgent: (prompt, mode) => io.spawnAgent(prompt, mode),
  });
  io.stdout(`${result.messages.join("\n")}\n`);
  return result.code;
}

function commentBody(message: string, report: Report | undefined): string {
  const failed = [
    ...(report?.architecture ?? []),
    ...(report?.acceptance ?? []),
  ].filter((step) => step.exitCode !== 0);
  const detail = failed.map((step) => `${step.command}\n${step.output}`).join("\n");
  return [`gate ${message}`, detail].filter(Boolean).join("\n\n");
}

function cardPath(rest: string[], cwd: string): string {
  const given = rest.find((arg) => !arg.startsWith("--"));
  return given ? path.resolve(cwd, given) : path.join(cwd, "GATE.md");
}

function reportPath(filePath: string): string {
  return path.join(path.dirname(filePath), "GATE.report.json");
}

function loadIssueFromMultica(id: string): unknown {
  const result = spawnSync("multica", ["issue", "get", id, "--output", "json"], {
    encoding: "utf8",
    shell: true,
  });
  if ((result.status ?? 1) !== 0) {
    throw new GateRefuse(`refused: 读不到 Multica issue ${id}`);
  }
  return JSON.parse(result.stdout || "{}");
}

function commentOnMultica(id: string, body: string): void {
  const dir = path.join(process.cwd(), ".gate");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "comment.md"), body);
  spawnSync(
    "multica",
    ["issue", "comment", "add", id, "--content-file", ".gate/comment.md"],
    { cwd: process.cwd(), encoding: "utf8", shell: true },
  );
}

function defaultIo(over: Partial<Io> | undefined): Io {
  const gateJs = fileURLToPath(new URL("../bin/gate.js", import.meta.url));
  return {
    cwd: process.cwd(),
    run: shellRun,
    gateBin: `node ${JSON.stringify(gateJs)}`,
    stdout: (text) => process.stdout.write(text),
    readReport: (filePath) => {
      if (!fs.existsSync(filePath)) return null;
      return JSON.parse(fs.readFileSync(filePath, "utf8")) as Report;
    },
    writeReport: (filePath, report) =>
      fs.writeFileSync(filePath, JSON.stringify(report, null, 2) + "\n"),
    spawnAgent: (prompt, mode) => spawnCursor(process.cwd(), prompt, mode),
    loadIssue: loadIssueFromMultica,
    commentOnIssue: commentOnMultica,
    ...over,
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exit(main(process.argv.slice(2)));
}
