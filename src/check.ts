import path from "node:path";
import type { GateCard } from "./card.ts";

export type CommandResult = {
  command: string;
  exitCode: number;
  output: string;
};
export type Report = {
  passed: boolean;
  attempts: number;
  architecture: CommandResult[];
  acceptance: CommandResult[];
};
export type Runner = (command: string, cwd: string) => CommandResult;

const OUTPUT_LIMIT = 8000;

export function tail(output: string): string {
  return output.length <= OUTPUT_LIMIT ? output : output.slice(-OUTPUT_LIMIT);
}

export function check(
  card: GateCard,
  run: Runner,
): { code: 0 | 1 | 2; report?: Report; message: string } {
  if (card.status !== "approved") {
    return { code: 2, message: `refused: status is ${card.status}` };
  }
  if (card.architecture.length === 0)
    return { code: 2, message: "refused: architecture is empty" };
  if (card.acceptance.length === 0)
    return { code: 2, message: "refused: acceptance is empty" };

  const cwd = path.dirname(card.filePath);
  const architecture = card.architecture.map((command) => run(command, cwd));
  const acceptance = card.acceptance.map((command) => run(command, cwd));
  card.attempts += 1;
  const passed = [...architecture, ...acceptance].every(
    (item) => item.exitCode === 0,
  );
  if (!passed && card.attempts >= card.maxAttempts) card.status = "blocked";
  const report: Report = {
    passed,
    attempts: card.attempts,
    architecture,
    acceptance,
  };
  return {
    code: passed ? 0 : 1,
    report,
    message: passed ? "passed" : "failed",
  };
}
