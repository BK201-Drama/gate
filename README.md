# gate

检查器。需求在 Multica issue 上发布。`gate` 只跑仓库里的架构扫描和验收，并把结果评论回那张 issue。

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

小程序：`gate init --kind mini --install`。

`GATE.md` 里只有长期检查命令，不写这一次要做什么。

## 使用

1. 在 Multica 创建 issue，例如标题「用户能完成预约」。
2. 把 issue 派给编写代理。代理读 issue，在仓库里改代码。
3. 写完后在项目目录执行：

```bash
gate check --issue=MUL-12
```

失败时，命令输出会作为评论写回 `MUL-12`。代理按评论里的原文改，再跑。通过后再验收。

`gate run MUL-12` 会先读取这张 issue 的标题和正文，再按同一套检查循环调用 Cursor CLI。不要把需求原文放进这条命令。
