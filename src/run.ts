import { spawnSync } from "node:child_process";
import { tail, type CommandResult } from "./check.ts";

export function shellRun(command: string, cwd: string): CommandResult {
  const result = spawnSync(command, {
    cwd,
    shell: true,
    encoding: "utf8",
    maxBuffer: 10_000_000,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}${result.error ? result.error.message : ""}`;
  return { command, exitCode: result.status ?? 1, output: tail(output) };
}
