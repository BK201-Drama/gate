import { spawnSync } from "node:child_process";

export type AgentMode = "write" | "review";
export type AgentResult = { code: number; output: string };

export function executeRun(input: {
  demand: string;
  allow: () => number;
  check: () => number;
  ready: () => number;
  isBlocked: () => boolean;
  reportText: () => string;
  spawnAgent: (prompt: string, mode: AgentMode) => AgentResult;
  maxAttempts: number;
}): { code: number; messages: string[] } {
  const messages: string[] = [];
  if (input.demand.trim() === "") {
    messages.push("refused: demand is empty");
    return { code: 2, messages };
  }
  if (input.allow() !== 0) {
    messages.push("refused: not approved");
    return { code: 2, messages };
  }

  let lastReport = "";
  for (let attempt = 1; attempt <= input.maxAttempts; attempt += 1) {
    const written = input.spawnAgent(
      writerPrompt(input.demand, lastReport),
      "write",
    );
    messages.push(`write ${attempt}: exit ${written.code}`);
    if (written.code !== 0)
      return { code: written.code === 2 ? 2 : 1, messages };
    const checked = input.check();
    messages.push(`check ${attempt}: exit ${checked}`);
    if (checked === 0) {
      const review = input.spawnAgent(reviewPrompt(input.demand), "review");
      messages.push(`review: exit ${review.code}`);
      if (/VERDICT:\s*block/i.test(review.output)) {
        lastReport = review.output;
        if (attempt === input.maxAttempts) return { code: 1, messages };
        continue;
      }
      const readyCode = input.ready();
      messages.push(`ready: exit ${readyCode}`);
      return { code: readyCode, messages };
    }
    if (checked === 2 || input.isBlocked()) {
      messages.push("blocked");
      return { code: 1, messages };
    }
    lastReport = input.reportText();
    if (attempt === input.maxAttempts) return { code: 1, messages };
  }
  return { code: 1, messages };
}

export function spawnCursor(
  cwd: string,
  prompt: string,
  mode: AgentMode,
): AgentResult {
  const args = ["-p", "--trust", "--output-format", "text"];
  if (mode === "write") args.push("--force");
  else args.push("--mode=ask");
  args.push(prompt);
  const result = spawnSync("agent", args, {
    cwd,
    encoding: "utf8",
    shell: true,
    maxBuffer: 10_000_000,
  });
  if (
    result.error &&
    (result.error as NodeJS.ErrnoException).code === "ENOENT"
  ) {
    return { code: 2, output: "Cursor CLI agent is not on PATH" };
  }
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return { code: result.status ?? 1, output };
}

function writerPrompt(demand: string, feedback: string): string {
  return [
    "你在这个仓库里实现一句使用结果，并让使用路径验收通过。",
    "写完后自己运行架构命令和验收命令。失败就阅读命令输出并修改，最多 3 轮，然后停。",
    "不要放宽架构规则，不要删除验收命令，不要用单元测试代替验收。",
    `使用结果：${demand}`,
    feedback ? `上一轮失败，按这段输出修改：\n${feedback}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function reviewPrompt(demand: string): string {
  return [
    "只读复审。不要改文件。",
    "对照使用结果、架构规则和 GATE.report.json。",
    "没有阻塞问题时只输出 VERDICT: pass。",
    "有阻塞问题时输出 VERDICT: block，并写明文件和原因。",
    `使用结果：${demand}`,
  ].join("\n");
}
