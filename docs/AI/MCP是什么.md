---
title: MCP 是什么
---

你给模型接工具的痛，**不是「模型不会调工具」，而是「每个宿主都得重写一遍接线」**。MCP（Model Context Protocol）要解决的是后一半。这篇讲清它在哪一层、和 Function Calling 什么关系，最后给一个能跑起来的最小 server。

## 最短路径

80% 的情况只需要知道这几步：

1. **它是什么**：一套把「工具 / 数据源」标准化暴露给模型客户端的协议 —— 相当于给模型工具生态定了一个「USB-C 接口」。
2. **谁在说话**：你的程序是 **Server**，模型所在的宿主（编辑器、聊天客户端等）是 **Client**，两者用 JSON-RPC 通信。
3. **最常用的三样**：`Tool`（能被调用去做事）、`Resource`（只读数据）、`Prompt`（给人点的模板）。
4. **和 Function Calling 的关系**：不冲突。Function Calling 是**模型怎么表达"我要调工具"**，MCP 是**工具从哪来、怎么被发现**。

::: tip 一句话定位
**MCP 是进程间的工具接入协议，Function Calling 是模型输出层的约定。** 一个 MCP Server 把工具暴露出来，宿主再把这些工具转成自己模型的 function 定义。两者串在一条链上，不是二选一。
:::

## 它到底解决什么问题

在没有 MCP 的世界里，想给一个模型客户端接上「查数据库」能力：

```text
客户端 A ── 自己实现的查库逻辑 ──┐
客户端 B ── 自己实现的查库逻辑 ──┼── 同一件事写了 N 遍
客户端 C ── 自己实现的查库逻辑 ──┘
```

每个客户端要自己定义工具描述、自己解析参数、自己处理错误。而且**工具作者和客户端作者永远对不齐**：你写好的工具，换一个客户端就得重写适配层。

有了 MCP：

```text
你的 MCP Server ── 暴露 tools/resources/prompts
        ▲
        │ 同一套协议
        ├── 客户端 A
        ├── 客户端 B
        └── 客户端 C
```

**工具写一次，所有支持 MCP 的客户端都能用。** 这就是它全部的价值主张，其余都是实现细节。

::: warning 别过度期待
MCP 不负责「让模型变聪明」。它只保证**工具能被发现、参数能被描述清楚、调用结果能被拿回来**。检索质量、提示词效果、模型本身的能力，MCP 一点都不管 —— 那部分见[提示词与上下文工程](./提示词与上下文工程.md)。
:::

## 核心概念

按「谁提供、谁消费」来记最清楚：

| 概念 | 谁提供 | 是什么 | 典型用途 |
| --- | --- | --- | --- |
| **Server** | 你（工具作者） | 一个进程，通过某种传输方式暴露能力 | 把「查库」「读文件」封装成一个 server |
| **Client** | 宿主程序 | 连接 server、发现能力、把调用交给模型 | 编辑器插件、聊天客户端内部 |
| **Tool** | Server | **可执行的动作**，有输入 schema，会产生副作用 | 查天气、发请求、写文件、跑查询 |
| **Resource** | Server | **只读数据**，由 URI 标识 | 配置文件、日志、文档片段 |
| **Prompt** | Server | **预置的提示词模板**，通常由人主动触发 | 「帮我 review 这段代码」这类固定套路 |

判别的经验法则（很好用）：

- **会改变外部状态 → Tool**（调用前该考虑要不要人确认）；
- **只是读 → Resource**（客户端可以缓存、可以订阅变更）；
- **是给人点的按钮，不是给模型自动决定 → Prompt**。

::: tip 为什么要把 Tool 和 Resource 分开
因为**信任级别不同**。Resource 是「读一下，没关系」；Tool 是「可能会写坏东西」。协议层面区分开，客户端才能对两者给出不同的确认策略。把只读的查询也做成 Tool 不会报错，但你会失去这层表达。
:::

## 和 Function Calling 的区别

这是最容易被混淆的点，摊开说：

| 维度 | Function Calling | MCP |
| --- | --- | --- |
| **所在层** | 模型的输出/输入格式约定 | 进程之间的通信协议 |
| **解决的问题** | 模型如何表达「我要调用某函数」 | 工具有哪些、参数是什么、怎么调用 |
| **谁定义工具** | 调用方在每次请求里塞进去 | Server 声明，Client 发现后转成请求的一部分 |
| **传输** | 无（就在 API 请求体里） | JSON-RPC，stdio 或 Streamable HTTP |
| **典型失效** | 模型不按 schema 输出、幻觉出参数 | 连不上 server、schema 描述太差导致模型选错工具 |

**它们的关系是接力**：

```text
MCP Server 声明工具
      ↓
Client 发现（tools/list）并转成自己模型的 function 定义
      ↓
模型用 Function Calling 表达「调用 foo，参数 {...}」
      ↓
Client 执行，把结果回填给模型
```

所以：**MCP 让工具可移植，Function Calling 让模型可表达。** 一个只支持 Function Calling 的客户端完全没有 MCP 也能工作 —— 只是每接一个新工具都要改客户端代码。

## 最小可跑的 Server 示例

### 依赖版本（已核对）

- `@modelcontextprotocol/sdk` —— 写作时 npm 上的 latest 是 **`1.32.1`**（`engines.node >= 18`）
- `zod` —— 是**必需的 peer dependency**，SDK 声明为 `^3.25 || ^4.0`
- 运行时用 `tsx` 跑 TS，省掉编译步骤（版本未锁定，未验证）

```bash
mkdir -p ~/mcp-demo && cd ~/mcp-demo
npm init -y
npm install @modelcontextprotocol/sdk@1.32.1 zod
npm install -D tsx typescript @types/node
```

::: warning 注意包名分代
`@modelcontextprotocol/sdk` 是 **v1 世代**的包（当前就是 1.32.x）。仓库主分支上还有另一套拆分的 **v2 包**（`@modelcontextprotocol/server`、`@modelcontextprotocol/client`），API 形状不同。网上抄示例时**先确认它用的是哪一代**，否则 import 路径会全不对。

本文示例针对 `@modelcontextprotocol/sdk@1.32.1`，**未在本机运行验证**。
:::

### 代码

`server.ts`：

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const server = new McpServer({
  name: 'demo-server',
  version: '1.0.0'
})

// Tool：可执行的动作。inputSchema 用 zod 对象描述，客户端会拿到它的 JSON Schema
server.registerTool(
  'add',
  {
    title: '两数相加',
    description: '计算两个整数之和。当用户要求做加法时使用。',
    inputSchema: { a: z.number(), b: z.number() }
  },
  async ({ a, b }) => ({
    content: [{ type: 'text', text: String(a + b) }]
  })
)

// Resource：只读数据，用 URI 标识
server.registerResource(
  'notes',
  'notes://readme',
  { title: '说明', mimeType: 'text/plain' },
  async (uri) => ({
    contents: [{ uri: uri.href, text: '这是一段只读的示例数据。' }]
  })
)

// Prompt：给人点的模板，不是给模型自动选的
server.registerPrompt(
  'explain',
  {
    title: '解释一个概念',
    description: '生成一个解释型提问模板',
    argsSchema: { topic: z.string() }
  },
  ({ topic }) => ({
    messages: [
      {
        role: 'user',
        content: { type: 'text', text: `请用三句话解释：${topic}` }
      }
    ]
  })
)

async function main() {
  // stdio 传输：客户端会把本进程当子进程拉起，用 stdin/stdout 讲 JSON-RPC
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((error) => {
  // 关键：绝对不能写到 stdout，会污染 JSON-RPC 流
  console.error('server failed to start:', error)
  process.exit(1)
})
```

在 `package.json` 里加一行：

```json
{
  "type": "module",
  "scripts": {
    "start": "tsx server.ts"
  }
}
```

```bash
npm start
```

跑起来后终端**什么都不该打印**，这是正常的 —— 它在等 stdin 上的 JSON-RPC 消息。（配到客户端里才能真正用起来。）

### 这个示例为什么长这样

- **`inputSchema` 写的是 zod 对象，不是 JSON Schema 字面量**：SDK 负责把它转成协议要的 JSON Schema。工具的 `description` 质量直接决定模型选不选得对，这是最值得花时间的地方。
- **`stdio` 传输最简单**：不需要起 HTTP 服务、不需要处理端口和鉴权。适合「本地工具」这一场景。
- **三种东西都注册了一遍**：只是为了展示形状。真实项目里通常只注册 Tool。
- **`console.error` 而不是 `console.log`**：stdio 模式的 stdout 就是协议通道，混入任何非协议输出都会让客户端解析失败。这是写 MCP server 最容易犯的第一个错，通常表现为「客户端提示解析错误 / 连接后立刻断开」。

## 传输方式与安全边界

| 传输 | 适用 | 注意 |
| --- | --- | --- |
| **stdio** | 本地工具，客户端拉起子进程 | 简单、无鉴权需求；**stdout 只能有协议内容** |
| **Streamable HTTP** | 远程服务、多客户端 | 要处理会话、鉴权（如 Bearer）、以及本地监听的 DNS rebinding 防护 |

SDK 文档里专门提到：**监听在 localhost 的 MCP server 面临 DNS rebinding 风险**，官方提供了一个默认带防护的 Express 工厂（`createMcpExpressApp`）。如果要对外暴露，还有 `requireBearerAuth` 这类中间件来校验 `Authorization: Bearer <token>`。

::: danger 不要把 MCP Server 开在 0.0.0.0 且不鉴权
MCP server 通常掌握了**真实的写权限**（读写文件、跑命令、查库）。一个没有鉴权、监听所有网卡的 server 等价于把你的机器交出去。本地用途就绑 `127.0.0.1`；远程用途必须加鉴权，并且想清楚它能碰到什么资源。
:::

## 踩坑点

| 现象 | 原因 | 解法 |
| --- | --- | --- |
| 客户端连上就断开 / 协议解析报错 | server 往 stdout 打印了日志 | 所有日志改用 `console.error` 或写文件 |
| 模型从来不调用你注册的工具 | `description` 太含糊，或工具太多 | 把 description 写成「什么时候用」而不是「这是什么」；精简工具数量 |
| 参数校验总失败 | zod schema 与实际传参类型不符 | 检查 `inputSchema`；注意数字/字符串的区分 |
| `Cannot find module '.../server/mcp.js'` | 用了 v2 的 import 路径但装的是 v1 | 统一到一代：v1 是 `@modelcontextprotocol/sdk/server/mcp.js` |
| 命令行直接跑没任何反应 | stdio server 本来就在等 stdin | 正常现象。用客户端的 Inspector 或 `stdio` 客户端去连 |

## 官方文档与我的取舍

- 协议主页：<https://modelcontextprotocol.io>
- TypeScript SDK：<https://github.com/modelcontextprotocol/typescript-sdk>
- SDK 文档（server 篇）：<https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/docs/server.md>
- npm 包：<https://www.npmjs.com/package/@modelcontextprotocol/sdk>
- llama.cpp 的 MCP 相关实验性支持（前沿，不稳定）：见其 server README 中 `--tools` / `--ui-mcp-proxy` 一节

我的取舍结论：

1. **只有当你的工具需要被多个客户端复用时，MCP 才划算。** 只服务一个自家应用，直接写 Function Calling 更短、更可控。
2. **优先 stdio**。远程 HTTP 带来的鉴权、会话、会话超时、DNS rebinding 防护，都是真实的工程量，别在没有远程需求时提前吃。
3. **工具的 description 是主要产出物，不是注释。** 模型选错工具，八成是描述写得像文档索引而不是使用说明。
4. **先看包名再抄示例**。这个协议迭代很快（包名、import 路径、注册方法名都变过），过期的示例是这块最大的时间黑洞。
5. **安全上按「给了它 shell」来设计。** 别因为它是「工具」就低估它 —— 它跑在你的机器上。
