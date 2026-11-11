import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type InitKind = "web" | "mini";

const templateRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../templates",
);

export function initProject(
  cwd: string,
  options: {
    kind: InitKind;
    force: boolean;
    gateBin: string;
    install: boolean;
  },
): string[] {
  const written: string[] = [];
  const gate = options.gateBin;
  write(
    cwd,
    "scripts/arch.mjs",
    fs.readFileSync(path.join(templateRoot, "arch.mjs")),
    options.force,
    written,
  );
  write(
    cwd,
    ".dependency-cruiser.cjs",
    fs.readFileSync(path.join(templateRoot, "dependency-cruiser.cjs")),
    options.force,
    written,
  );
  if (options.kind === "web") {
    write(
      cwd,
      "playwright.config.ts",
      playwrightConfig(),
      options.force,
      written,
    );
    write(
      cwd,
      "e2e/usage-path.spec.ts",
      playwrightSpec(),
      options.force,
      written,
    );
  } else {
    write(cwd, "e2e/usage-path.mjs", miniSpec(), options.force, written);
  }
  write(cwd, "src/domain/.gitkeep", "", options.force, written);
  write(cwd, "GATE.md", gateCard(options.kind), options.force, written);
  write(cwd, "AGENTS.md", agentsMd(gate, options.kind), options.force, written);
  write(cwd, "CLAUDE.md", claudeMd(options.kind), options.force, written);
  write(
    cwd,
    ".cursor/rules/gate.mdc",
    cursorRule(options.kind),
    options.force,
    written,
  );
  write(
    cwd,
    ".github/workflows/gate.yml",
    workflow(options.kind),
    options.force,
    written,
  );
  mergePackage(cwd, options.kind, written);
  if (options.install) {
    const installed = spawnSync("npm", ["install"], {
      cwd,
      encoding: "utf8",
      shell: true,
    });
    written.push(installed.status === 0 ? "npm install" : "npm install failed");
  }
  return written;
}

function write(
  cwd: string,
  relative: string,
  contents: string | Buffer,
  force: boolean,
  written: string[],
): void {
  const target = path.join(cwd, relative);
  if (fs.existsSync(target) && !force) {
    written.push(`skip ${relative}`);
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
  written.push(`write ${relative}`);
}

function mergePackage(cwd: string, kind: InitKind, written: string[]): void {
  const target = path.join(cwd, "package.json");
  const scripts =
    kind === "web"
      ? {
          arch: "node scripts/arch.mjs",
          e2e: "playwright test",
          dev: 'echo "add a dev server on 127.0.0.1:4173" && exit 1',
        }
      : { arch: "node scripts/arch.mjs", e2e: "node e2e/usage-path.mjs" };
  const devDependencies =
    kind === "web"
      ? { "dependency-cruiser": "^16.10.4", "@playwright/test": "^1.56.1" }
      : {
          "dependency-cruiser": "^16.10.4",
          "miniprogram-automator": "^0.12.1",
        };
  if (!fs.existsSync(target)) {
    const name =
      path
        .basename(cwd)
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-") || "app";
    fs.writeFileSync(
      target,
      JSON.stringify(
        { name, private: true, type: "module", scripts, devDependencies },
        null,
        2,
      ) + "\n",
    );
    written.push("write package.json");
    return;
  }
  const pkg = JSON.parse(fs.readFileSync(target, "utf8")) as {
    scripts?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  pkg.scripts ??= {};
  pkg.devDependencies ??= {};
  let changed = false;
  for (const [key, value] of Object.entries(scripts)) {
    if (!pkg.scripts[key]) {
      pkg.scripts[key] = value;
      changed = true;
    }
  }
  for (const [key, value] of Object.entries(devDependencies)) {
    if (!pkg.devDependencies[key]) {
      pkg.devDependencies[key] = value;
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(target, JSON.stringify(pkg, null, 2) + "\n");
    written.push("write package.json");
  } else written.push("skip package.json");
}

function gateCard(kind: InitKind): string {
  const acceptance = kind === "web" ? "npm run e2e" : "npm run e2e";
  return `---
status: approved
acceptance:
  - ${acceptance}
architecture:
  - npm run arch
max_attempts: 3
attempts: 0
---

# 需求

用 \`gate run "一句使用结果"\` 填写这一节。
`;
}

function playwrightConfig(): string {
  return `import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  use: { baseURL: "http://127.0.0.1:4173" },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
`;
}

function playwrightSpec(): string {
  return `import { expect, test } from "@playwright/test";

test("主路径可用", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("usage-ready")).toBeVisible();
});
`;
}

function miniSpec(): string {
  return `import automator from "miniprogram-automator";

const mini = await automator.launch({
  projectPath: process.cwd(),
  cliPath: process.env.WECHAT_DEVTOOLS_CLI,
});
try {
  const page = await mini.reLaunch("/pages/index/index");
  const ready = await page.$("[data-usage-ready]");
  if (!ready) {
    console.error("usage path: [data-usage-ready] missing on /pages/index/index");
    process.exit(1);
  }
} finally {
  await mini.close();
}
`;
}

function agentsMd(gate: string, kind: InitKind): string {
  return `# 本地 AI 代码流水线

人在 Cursor 或 Claude Code 的对话里提出改动时，自己把功能做出来并跑通验收。不要中途问能不能执行命令。

1. 改代码，让使用路径真的走通。${acceptanceLine(kind)}
2. 运行 \`npm run arch\`，再运行 \`npm run e2e\`。
3. 退出码不是 0：阅读这次命令的完整输出，自己改，再运行。最多 3 轮。
4. 第 3 轮仍失败：停下，留下最后一次输出原文。
5. 通过：说明改了哪些文件，以及这两条命令都是退出码 0。

不要放宽 \`.dependency-cruiser.cjs\`。不要用单元测试代替 \`npm run e2e\`。不要合并，不要部署。

人若执行 \`${gate} run "一句使用结果"\`，同样遵守上面的循环。复审会话只输出 \`VERDICT: pass\` 或 \`VERDICT: block\` 加原因，不改文件。
`;
}

function claudeMd(kind: InitKind): string {
  return `# 自发跑通

对话里接到实现或修改请求后，按 \`AGENTS.md\` 自己改代码并循环运行 \`npm run arch\` 和 \`npm run e2e\`，最多 3 轮。不要把失败丢回给人，除非 3 轮后仍失败。

${acceptanceLine(kind)}
`;
}

function acceptanceLine(kind: InitKind): string {
  return kind === "web"
    ? '网页验收是 Playwright：`e2e/usage-path.spec.ts` 要能看到 `data-testid="usage-ready"`，开发服务在 127.0.0.1:4173。'
    : "小程序验收是 miniprogram-automator：打开 `/pages/index/index`，页面上要有 `[data-usage-ready]`。";
}

function cursorRule(kind: InitKind): string {
  return `---
description: 对话里改完代码后自己跑架构检查和验收，按失败输出改，最多 3 轮。
alwaysApply: true
---

遵守 \`AGENTS.md\` 和 \`CLAUDE.md\`。人在对话里提出改动后：

1. 实现使用路径。
2. 运行 \`npm run arch\`，再运行 \`npm run e2e\`。
3. 失败则阅读输出并修改，最多 3 轮，不要询问人。
4. 第 3 轮仍失败才把最后一次输出留在回复里。

${acceptanceLine(kind)}
不要用单元测试代替验收。
`;
}

function workflow(kind: InitKind): string {
  const extra =
    kind === "web"
      ? "      - run: npx playwright install --with-deps chromium\n"
      : "";
  return `name: gate
on:
  pull_request:
jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm install
${extra}      - run: npm run arch
      - run: npm run e2e
`;
}
