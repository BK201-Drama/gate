# gate

本地 AI 代码流水线。`gate init` 把架构规则、使用路径验收和代理规矩布进项目。`gate run` 叫 Cursor CLI 按这个循环写，人不用守着对话。

## 安装

```bash
cd opc-project/gate
npm link
```

## 布到新项目

```bash
mkdir my-app
cd my-app
gate init --install
```

小程序：

```bash
gate init --kind mini --install
```

布上的东西：

- `.dependency-cruiser.cjs`：循环依赖，以及 `src/domain` 不能引用 `ui` / `app` / `pages` / `api`。没装到 `node_modules` 时，`scripts/arch.mjs` 用同一套规则的内建检查。
- 前后端：Playwright。`e2e/usage-path.spec.ts` 打开本地页面，要求出现 `data-testid="usage-ready"`。
- 小程序：miniprogram-automator。打开 `/pages/index/index`，要求出现 `[data-usage-ready]`。
- `AGENTS.md`、Cursor 规则、GitHub Actions。

## 跑一条需求

在项目目录：

```bash
gate run "用户能完成预约"
```

它会调用本机的 `agent`：编写，跑 `gate check`，失败就把报告交回去，最多 3 次。通过后另开一次只读复审。复审没有 `VERDICT: block`，才执行 `gate ready`。

需要 Cursor CLI 已在 PATH 里，命令名是 `agent`。
