# Mantle MCP E2E Agent 测试规范

> 本文档定义 mantle-mcp 的端到端 Agent 测试架构。  
> 使用 Vercel AI SDK 构建测试 Agent，通过 InMemoryTransport 连接 MCP Server，  
> 以真实 LLM 调用验证每个工具的端到端可用性。  
> 仅在 release 阶段执行，不替代现有单元测试。

---

## 1. 概述与目标

### 1.1 背景

mantle-mcp 当前拥有 12 个 Vitest 单元测试文件、44 个测试用例，覆盖所有 17 个工具的核心逻辑。单元测试通过依赖注入（DI）替换外部依赖，验证工具 handler 的输入/输出契约。

但单元测试**不覆盖以下场景**：

- Agent 能否通过自然语言 prompt 正确选择并调用目标工具
- MCP 协议层（`ListTools` → `CallTool`）的完整链路
- 工具的 `inputSchema` 是否足够让 LLM 正确推断参数
- 工具的 `description` 是否足够引导 LLM 在正确场景下选择

### 1.2 目标

| 目标 | 说明 |
|------|------|
| 验证工具可达性 | 每个 MCP 工具都能被 Agent 通过自然语言 prompt 正确调用 |
| 验证协议完整性 | MCP Server → InMemoryTransport → MCP Client → AI SDK 工具适配层完整工作 |
| 验证 schema 质量 | 工具的 description + inputSchema 能引导 LLM 生成正确参数 |
| 回归保护 | 每个 release 运行全部场景，确保新版本不破坏已有工具 |

### 1.3 与现有测试的关系

```
┌─────────────────────────────────────┐
│  E2E Agent Tests（本规范）           │  ← release 阶段，真实 LLM
│  验证: prompt → 工具选择 → 参数推断   │
├─────────────────────────────────────┤
│  Unit Tests（现有 Vitest）           │  ← 每次 PR，DI mock
│  验证: 工具 handler 输入/输出契约     │
└─────────────────────────────────────┘
```

两层互补：单元测试保证工具逻辑正确，E2E 测试保证 Agent 能正确发现和使用工具。

---

## 2. 技术栈

| 组件 | 包名 | 用途 |
|------|------|------|
| Vercel AI SDK | `ai` | `generateText` 构建 Agent 循环（非 OpenRouter 使用 `stopWhen: stepCountIs(3)`；OpenRouter 兼容模式不传 `stopWhen`） |
| AI SDK MCP 适配 | `@ai-sdk/mcp` 或手动适配 | 将 MCP 工具 schema 转换为 AI SDK tool 格式 |
| LLM Provider | `@ai-sdk/openai` / `@ai-sdk/anthropic` | 提供真实 LLM 推理能力 |
| MCP SDK | `@modelcontextprotocol/sdk` | `Client` + `InMemoryTransport.createLinkedPair()` |
| 测试框架 | `vitest` | 复用现有测试基础设施 |

### 2.1 新增依赖

```json
{
  "devDependencies": {
    "ai": "^6.x",
    "@ai-sdk/openai": "^3.x",
    "@ai-sdk/anthropic": "^3.x"
  }
}
```

> 注意：`@modelcontextprotocol/sdk` 和 `vitest` 已在项目中。  
> AI SDK v6 语义：多步循环使用 `stopWhen: stepCountIs(3)`（不再使用 `maxSteps`）；OpenRouter 兼容模式下可省略 `stopWhen`。

### 2.2 环境变量

| 变量 | 必须 | 说明 |
|------|------|------|
| `E2E_LLM_PROVIDER` | 是 | LLM 提供商：`openai`、`anthropic` 或 `openrouter` |
| `E2E_LLM_API_KEY` | 是 | 对应提供商的 API Key |
| `E2E_LLM_MODEL` | 否 | 模型名，默认 `gpt-4o`（OpenAI）或 `claude-sonnet-4-20250514`（Anthropic） |
| `E2E_OPENROUTER_SITE_URL` | 否 | 仅 `provider=openrouter` 时使用；设置 `HTTP-Referer` 请求头 |
| `E2E_OPENROUTER_APP_NAME` | 否 | 仅 `provider=openrouter` 时使用；设置 `X-Title` 请求头 |
| `E2E_TIMEOUT_MS` | 否 | 单个 `generateText` 调用超时，默认 `30000` |
| `E2E_MAX_RETRIES` | 否 | 单个场景最大额外重试次数，默认 `2`（总尝试次数 = 1 + 此值 = 3） |
| `E2E_SUBGRAPH_ENDPOINT` | 否 | indexer 场景使用的 subgraph endpoint（无配置时 indexer 场景自动跳过） |
| `E2E_SQL_ENDPOINT` | 否 | indexer 场景使用的 SQL indexer endpoint（无配置时 indexer 场景自动跳过） |

### 2.3 Provider 初始化模式

```typescript
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";

function resolveModel(): LanguageModel {
  const provider = process.env.E2E_LLM_PROVIDER;
  const apiKey = process.env.E2E_LLM_API_KEY;
  if (!provider || !apiKey) {
    throw new Error("E2E_LLM_PROVIDER and E2E_LLM_API_KEY are required.");
  }

  if (provider === "openai") {
    const model = process.env.E2E_LLM_MODEL ?? "gpt-4o";
    return createOpenAI({ apiKey })(model);
  }
  if (provider === "anthropic") {
    const model = process.env.E2E_LLM_MODEL ?? "claude-sonnet-4-20250514";
    return createAnthropic({ apiKey })(model);
  }
  if (provider === "openrouter") {
    const model = process.env.E2E_LLM_MODEL ?? "openai/gpt-4o";
    const siteUrl = process.env.E2E_OPENROUTER_SITE_URL;
    const appName = process.env.E2E_OPENROUTER_APP_NAME;
    const headers: Record<string, string> = {};
    if (siteUrl) headers["HTTP-Referer"] = siteUrl;
    if (appName) headers["X-Title"] = appName;
    return createOpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      headers
    })(model);
  }
  throw new Error(`Unsupported E2E_LLM_PROVIDER: ${provider}`);
}
```

> 当 `provider=openrouter` 时，复用 `createOpenAI`，并将 `baseURL` 设为 `https://openrouter.ai/api/v1`。  
> 若配置 `E2E_OPENROUTER_SITE_URL` / `E2E_OPENROUTER_APP_NAME`，会分别注入 `HTTP-Referer` / `X-Title` 请求头。

---

## 3. 架构设计

### 3.1 核心组件

```
┌──────────────────────────────────────────────────────────┐
│  Vitest Test Runner                                      │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Shared Runner (setup / teardown)                   │  │
│  │                                                    │  │
│  │  ┌──────────┐    InMemoryTransport    ┌─────────┐ │  │
│  │  │ MCP      │◄──────────────────────►│ mantle  │ │  │
│  │  │ Client   │   createLinkedPair()    │ -mcp    │ │  │
│  │  └────┬─────┘                         │ Server  │ │  │
│  │       │ listTools()                   │(allTools)│ │  │
│  │       ▼                               └─────────┘ │  │
│  │  ┌──────────┐                                      │  │
│  │  │ Tool     │  convert MCP schema → AI SDK tools   │  │
│  │  │ Adapter  │                                      │  │
│  │  └────┬─────┘                                      │  │
│  │       │                                            │  │
│  │       ▼                                            │  │
│  │  ┌──────────────────────────────────────┐          │  │
│  │  │  Vercel AI SDK Agent                 │          │  │
│  │  │  generateText({                      │          │  │
│  │  │    model,                            │          │  │
│  │  │    tools: scenarioScopedTools,       │          │  │
│  │  │    prompt: executionPrompt,          │          │  │
│  │  │    stopWhen: provider-aware,         │          │  │
│  │  │    maxRetries: 0,                    │          │  │
│  │  │    timeout: E2E_TIMEOUT_MS           │          │  │
│  │  │  })                                  │          │  │
│  │  └────────────────┬─────────────────────┘          │  │
│  │                   │                                │  │
│  │                   ▼                                │  │
│  │            ┌────────────┐                          │  │
│  │            │ LLM Provider│ (OpenAI / Anthropic)    │  │
│  │            └────────────┘                          │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  单个主测试块顺序执行 scenarios（soft-fail 汇总后统一失败） │
└──────────────────────────────────────────────────────────┘
```

### 3.2 执行时序

```
Setup（主测试块开始时）:
  1. createServer()                           → MCP Server 实例
  2. InMemoryTransport.createLinkedPair()      → [clientTransport, serverTransport]
  3. server.connect(serverTransport)           → Server 绑定传输
  4. new Client({ name: "e2e-agent" })
  5. client.connect(clientTransport)           → Client 绑定传输
  6. client.listTools()                        → 获取 17 个工具的 schema
  7. convertToAiSdkTools(mcpTools, client)     → 转换为 AI SDK tool 格式

Main test block（单个 `it("runs all scenarios...")` 内顺序循环）:
  0. 检查 skipUnless → 跳过或继续
  1. 替换 prompt 中的环境变量模板，构造 executionPrompt（强制先调用目标工具）
  2. 仅暴露当前场景 `expectedToolCall` 对应工具（scenario-scoped tools）
  3. provider-aware stop condition：OpenRouter 不传 `stopWhen`，其他 provider 使用 `stepCountIs(3)`
  4. generateText({
       model: resolvedModel,
       tools: scenarioScopedTools,
       prompt: executionPrompt,
       stopWhen: providerAwareStopWhen,
       maxRetries: 0,
       timeout: scenario.timeoutMs ?? E2E_TIMEOUT_MS,
       system: SERVER_INSTRUCTIONS
     })
  5. 从 result.steps 提取所有 tool_call + 对应 tool_result
  6. 断言 L1: expectedToolCall 出现在 tool_call 列表中
  7. 断言 L2: tool 参数包含所有 requiredArgs 指定的 key
  8. 断言 L3a: tool 参数匹配 scenario.toolArgsMatch 模式
  9. 断言 L3b: 文本断言在 `result.text + expected tool result` 上执行

Teardown（主测试块 finally）:
  1. client.close()
  2. server.close()
```

### 3.3 Tool Adapter 设计

将 MCP 工具转换为 Vercel AI SDK 的 `tool` 格式：

```typescript
// 概念伪代码
function convertToAiSdkTools(
  mcpTools: McpTool[],
  client: Client
): Record<string, CoreTool> {
  return Object.fromEntries(
    mcpTools.map(tool => [
      tool.name,
      {
        description: tool.description,
        inputSchema: jsonSchema(tool.inputSchema),
        execute: async (args) => {
          const result = await client.callTool({
            name: tool.name,
            arguments: args
          });
          return result.content;
        }
      }
    ])
  );
}
```

> 如 `@ai-sdk/mcp` 包已提供等价适配器，优先使用官方实现。

---

## 4. Scenario Registry 接口设计

### 4.1 TypeScript 接口

```typescript
/**
 * v0.2 已定义模块。新版本可扩展（如 v0.3 的 "exec", v0.4 的 "advanced"）。
 * 类型为 string 而非固定联合，以允许版本演进时无需修改接口。
 */
type ScenarioModule = string;

interface AgentScenario {
  /** 唯一标识，格式: {module}-{tool}-{variant} */
  id: string;

  /** 所属工具模块（v0.2: chain, registry, account, token, defi-read, indexer, diagnostics） */
  module: ScenarioModule;

  /** MCP 工具名 */
  toolName: string;

  /** 自然语言 prompt，模拟用户向 Agent 提问 */
  prompt: string;

  /** 期望 Agent 调用的工具名（应与 toolName 一致） */
  expectedToolCall: string;

  /** 期望的工具调用结果类型 */
  expectedOutcome: "success" | "tool-error";

  /** 输出断言 */
  outputAssertions: {
    /** Agent 最终回复应包含的文本片段（AND：全部片段都必须出现） */
    containsText?: string[];

    /** Agent 最终回复应包含的任一文本片段（OR：至少一个片段出现） */
    containsAnyText?: string[];

    /**
     * 工具调用时必须传入的参数 key 列表。
     * 来源于对应工具 inputSchema.required，确保 LLM 不遗漏必填字段。
     */
    requiredArgs?: string[];

    /** 工具调用参数的值模式匹配（部分匹配，验证 LLM 推断的具体值） */
    toolArgsMatch?: Record<string, unknown>;

    /** 工具调用参数值候选模式（OR：至少匹配一个 pattern） */
    toolArgsMatchAny?: Record<string, unknown>[];
  };

  /**
   * 场景前置条件。若环境变量未配置，场景自动跳过而非失败。
   * 例: indexer 场景依赖 E2E_SUBGRAPH_ENDPOINT。
   */
  skipUnless?: string;

  /** 单场景超时（ms），覆盖默认值 */
  timeoutMs?: number;
}
```

### 4.2 分组策略

场景按工具模块分组，每个模块一个场景数组文件：

```
e2e/
├── scenarios/
│   ├── chain.scenarios.ts
│   ├── registry.scenarios.ts
│   ├── account.scenarios.ts
│   ├── token.scenarios.ts
│   ├── defi-read.scenarios.ts
│   ├── indexer.scenarios.ts
│   └── diagnostics.scenarios.ts
├── lib/
│   ├── runner.ts          # 共享 Runner（setup/teardown/assert）
│   └── tool-adapter.ts   # MCP → AI SDK 工具转换
├── agent-e2e.test.ts      # 主测试入口（单个 it 顺序执行所有场景并汇总）
└── vitest.e2e.config.ts   # 独立 Vitest 配置
```

### 4.3 场景注册模式

```typescript
// e2e/scenarios/chain.scenarios.ts
import type { AgentScenario } from "../lib/runner.js";

export const chainScenarios: AgentScenario[] = [
  {
    id: "chain-getChainInfo-mainnet",
    module: "chain",
    toolName: "mantle_getChainInfo",
    prompt: "What is Mantle's chain ID and gas token on mainnet?",
    expectedToolCall: "mantle_getChainInfo",
    expectedOutcome: "success",
    outputAssertions: {
      requiredArgs: [],   // getChainInfo 无必填参数
      containsText: ["5000", "MNT"],
      toolArgsMatch: { network: "mainnet" }
    }
  },
  // ...
];
```

---

## 5. 共享 Runner 设计

### 5.1 Setup / Teardown

主测试块按 `setupRunner() → for...of scenarios → teardownRunner()` 顺序执行一次。

```typescript
// e2e/lib/runner.ts 概念结构

let server: Server;
let client: Client;
let aiSdkTools: Record<string, CoreTool>;

async function setupRunner() {
  // 1. 创建 MCP Server
  server = createServer();

  // 2. 创建 InMemoryTransport
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  // 3. 连接
  await server.connect(serverTransport);
  client = new Client({ name: "e2e-agent", version: "1.0.0" });
  await client.connect(clientTransport);

  // 4. 获取工具列表并转换
  const { tools } = await client.listTools();
  aiSdkTools = convertToAiSdkTools(tools, client);
}

async function teardownRunner() {
  await client.close();
  await server.close();
}
```

### 5.2 场景执行器

```typescript
async function runScenario(
  scenario: AgentScenario,
  tools: Record<string, CoreTool>,
  model: LanguageModel
): Promise<ScenarioResult> {
  // skipUnless: 若依赖的环境变量未配置，跳过
  if (scenario.skipUnless && !process.env[scenario.skipUnless]) {
    return { scenarioId: scenario.id, status: "skipped", reason: `${scenario.skipUnless} not set` };
  }

  // prompt 中的环境变量模板替换（如 {E2E_SUBGRAPH_ENDPOINT}）
  const prompt = resolvePromptTemplates(scenario.prompt);
  const executionPrompt = [
    `You must call ${scenario.expectedToolCall} exactly once before answering.`,
    "Do not answer from prior knowledge without calling the tool.",
    prompt
  ].join("\n\n");

  // 每个场景仅暴露一个目标工具，降低误选概率
  const scenarioTools = tools[scenario.expectedToolCall]
    ? { [scenario.expectedToolCall]: tools[scenario.expectedToolCall] }
    : tools;

  const stopWhen =
    process.env.E2E_LLM_PROVIDER === "openrouter" ? undefined : stepCountIs(3);

  const result = await generateText({
    model,
    tools: scenarioTools,
    prompt: executionPrompt,
    ...(stopWhen ? { stopWhen } : {}),
    maxRetries: 0,
    timeout: scenario.timeoutMs ?? E2E_TIMEOUT_MS,
    system: SERVER_INSTRUCTIONS_CONTENT
  });

  const toolCalls = result.steps.flatMap(step =>
    step.toolCalls.map(tc => ({
      name: tc.toolName,
      args: tc.args,
      resultText: "...from matched tool_result..."
    }))
  );

  return {
    scenarioId: scenario.id,
    status: "executed",
    toolCalls,
    text: result.text,
    usage: result.usage
  };
}
```

### 5.3 断言模式

断言分为三层，按严格程度递增：

| 层级 | 断言类型 | 说明 | 实现方式 | 失败类型 |
|------|----------|------|----------|----------|
| L1 | 工具调用匹配 | 无任何 tool call 时失败；有 tool call 但未命中期望工具按参数类错误处理（可重试） | `toolCalls.length === 0 ? TOOL_NOT_CALLED : WRONG_ARGS` | `TOOL_NOT_CALLED` / `WRONG_ARGS` |
| L2 | 必填参数存在 | 工具调用包含所有 `requiredArgs` 指定的 key | `requiredArgs.every(k => k in args)` | `WRONG_ARGS` |
| L3a | 参数值匹配 | `toolArgsMatch` 为 AND（单模式必须匹配）；`toolArgsMatchAny` 为 OR（候选模式至少匹配一个） | `toolArgsMatch ? expect(args).toMatchObject(pattern) : expect(patterns.some(p => match(args, p))).toBe(true)` | `WRONG_ARGS` |
| L3b | 输出文本包含 | `containsText` 为 AND（全部片段都必须出现）；`containsAnyText` 为 OR（至少一个片段出现）；匹配语料为 `result.text + matchedToolResult` | `const searchable = text + "\\n" + resultText` | `ASSERTION_FAILED` |

> `TOOL_NOT_CALLED` 不可重试；`WRONG_ARGS` / `ASSERTION_FAILED` 可重试（LLM 不确定性）。

`containsText` 与 `containsAnyText` 可同时配置：两组断言独立执行，且都必须通过。`toolArgsMatch` 与 `toolArgsMatchAny` 同理。

对于 `expectedOutcome: "tool-error"` 的场景，L3b 断言验证 Agent 是否正确传达了工具返回的错误信息（如 `"NO_ROUTE"`, `"POOL_NOT_FOUND"`），而非验证成功数据。

### 5.4 重试策略（权威定义，§7.4 引用此处）

由于 LLM 的不确定性，单次失败不代表工具不可用。

**核心参数：**

- `E2E_MAX_RETRIES`（默认 2）：失败后的额外重试次数
- **总尝试次数** = 1（初始）+ `E2E_MAX_RETRIES` = 3
- 仅当全部 3 次尝试都失败时标记为 `FAIL`

**可重试的失败类型：**

| 失败类型 | 可重试 | 原因 |
|----------|--------|------|
| `WRONG_ARGS` | 是 | LLM 参数推断不确定性 |
| `ASSERTION_FAILED` | 是 | LLM 输出措辞不确定性 |
| `TOOL_NOT_CALLED` | 否 | 模型完全未调用任何工具，重试通常无意义 |
| `TIMEOUT` | 否 | 基础设施问题，重试可能加剧 |
| `LLM_ERROR` | 否 | API 层错误，重试应由 SDK 级别处理 |

**执行流程：**

1. 执行场景，记录结果
2. 若失败且失败类型可重试，立即重试（无额外延迟）
3. 若首次遇到不可重试的失败类型，立即标记为 `FAIL`，不再重试
4. 测试报告记录每个场景的实际尝试次数

---

## 6. 场景目录（v0.2，17 工具）

### 6.0 场景分类

由于 MCP Server 使用 `createServer()` 创建（含默认 DI deps），不同工具在 E2E 环境下行为不同：

| 分类 | 说明 | expectedOutcome | 涉及工具 |
|------|------|-----------------|----------|
| **self-contained** | 仅使用静态配置/内存 registry，无需网络 | `success` | `getChainInfo`, `resolveAddress`, `validateAddress`（无 check_code）, `getTokenPrices` |
| **network-dependent** | 需 RPC 访问（公共 RPC 在 E2E 环境可达） | `success` | `getChainStatus`, `getBalance`, `getTokenBalances`, `getAllowances`, `getTokenInfo`, `resolveToken`, `checkRpcHealth`, `probeEndpoint` |
| **stub-deps** | 默认 DI deps 返回 null/空 → 工具返回 typed error | `tool-error` | `getSwapQuote`（`NO_ROUTE`）, `getPoolLiquidity`（`POOL_NOT_FOUND`） |
| **endpoint-configured** | 需外部 endpoint 配置，未配置时自动跳过 | `success` | `querySubgraph`, `queryIndexerSql` |

> `getLendingMarkets` 的默认 deps 返回空数组（非 error），归为 self-contained，返回空 markets 列表。

对于 `stub-deps` 场景：Agent 应正确调用工具、传递正确参数，然后**正确传达工具返回的错误信息**。这验证了 Agent 对错误响应的处理能力。

对于 `endpoint-configured` 场景：通过 `skipUnless` 字段关联环境变量，未配置时场景跳过，避免因环境原因产生 false failure。

### 6.1 chain 模块（2 工具）

| ID | 工具 | 分类 | Prompt | requiredArgs | toolArgsMatch | 输出断言 |
|----|------|------|--------|--------------|---------------|----------|
| `chain-getChainInfo-mainnet` | `mantle_getChainInfo` | self-contained | "What is Mantle's chain ID and native gas token on mainnet?" | `[]` | `{ network: "mainnet" }` | 包含 `"5000"`, `"MNT"` |
| `chain-getChainStatus-mainnet` | `mantle_getChainStatus` | network-dependent | "What is the latest block number on Mantle mainnet?" | `[]` | `{ network: "mainnet" }` | 包含 `"block"` |

### 6.2 registry 模块（2 工具）

| ID | 工具 | 分类 | Prompt | requiredArgs | toolArgsMatch | 输出断言 |
|----|------|------|--------|--------------|---------------|----------|
| `registry-resolveAddress-usdc` | `mantle_resolveAddress` | self-contained | "What is the contract address for USDC on Mantle?" | `["identifier"]` | `{ identifier: "USDC" }` | 包含 `"0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9"` |
| `registry-validateAddress-wmnt` | `mantle_validateAddress` | self-contained | "Validate the address 0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8 on Mantle." | `["address"]` | `{ address: "0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8" }` | 包含 `"valid"` 或 `"WMNT"` |

### 6.3 account 模块（3 工具）

| ID | 工具 | 分类 | Prompt | requiredArgs | toolArgsMatch | 输出断言 |
|----|------|------|--------|--------------|---------------|----------|
| `account-getBalance-sample` | `mantle_getBalance` | network-dependent | "Check the MNT balance of address 0x458F293454fE0d67EC0655f3672301301DD51422 on Mantle mainnet." | `["address"]` | `{ address: "0x458F293454fE0d67EC0655f3672301301DD51422" }` | 包含 `"balance"` 或 `"MNT"` |
| `account-getTokenBalances-multi` | `mantle_getTokenBalances` | network-dependent | "Show the USDC and WETH token balances for 0x458F293454fE0d67EC0655f3672301301DD51422 on Mantle." | `["address", "tokens"]` | `{ address: "0x458F293454fE0d67EC0655f3672301301DD51422" }` | 包含 `"balance"` |
| `account-getAllowances-agni` | `mantle_getAllowances` | network-dependent | "Check the USDC allowance that 0x458F293454fE0d67EC0655f3672301301DD51422 has granted to the Agni Router 0x319B69888b0d11cEC22caA5034e25FfFBDc88421." | `["owner", "pairs"]` | `{ owner: "0x458F293454fE0d67EC0655f3672301301DD51422" }` | 包含 `"allowance"` |

### 6.4 token 模块（3 工具）

| ID | 工具 | 分类 | Prompt | requiredArgs | toolArgsMatch | 输出断言 |
|----|------|------|--------|--------------|---------------|----------|
| `token-getTokenInfo-usdc` | `mantle_getTokenInfo` | network-dependent | "What are the details of the USDC token on Mantle, including its decimals and address?" | `["token"]` | `{ token: "USDC" }` | 包含 `"USDC"` 或 `"decimals"` |
| `token-resolveToken-meth` | `mantle_resolveToken` | network-dependent | "Resolve the mETH token on Mantle and return the quick-reference result. Set require_token_list_match=false for this check." | `["symbol", "require_token_list_match"]` | `{ symbol: "mETH", require_token_list_match: false }` | 包含 `"mETH"` |
| `token-getTokenPrices-multi` | `mantle_getTokenPrices` | self-contained | "Get the current USD prices for USDC and WMNT on Mantle." | `["tokens"]` | `{ tokens: ["USDC", "WMNT"] }` | 包含 `"price"` 或 `"null"` |

### 6.5 defi-read 模块（3 工具）

| ID | 工具 | 分类 | expectedOutcome | Prompt | requiredArgs | toolArgsMatch | 输出断言 |
|----|------|------|-----------------|--------|--------------|---------------|----------|
| `defi-getSwapQuote-agni` | `mantle_getSwapQuote` | stub-deps | `tool-error` | "Get me a swap quote for 100 USDC to USDT on Agni on Mantle." | `["token_in", "token_out", "amount_in"]` | `{ token_in: "USDC", token_out: "USDT", amount_in: "100" }` | 包含 `"NO_ROUTE"` 或 `"no route"` 或 `"error"` |
| `defi-getPoolLiquidity-pool` | `mantle_getPoolLiquidity` | stub-deps | `tool-error` | "Show the liquidity details of the Agni pool at address 0x1234567890abcdef1234567890abcdef12345678 on Mantle." | `["pool_address"]` | `{ pool_address: "0x1234567890abcdef1234567890abcdef12345678" }` | 包含 `"POOL_NOT_FOUND"` 或 `"not found"` 或 `"error"` |
| `defi-getLendingMarkets-aave` | `mantle_getLendingMarkets` | self-contained | `success` | "Show me the Aave v3 lending markets on Mantle, especially for USDC." | `[]` | `{ protocol: "aave_v3" }` 或 `{ asset: "USDC" }` | 包含 `"market"` 或 `"aave"` 或 `"empty"` |

### 6.6 indexer 模块（2 工具）

| ID | 工具 | 分类 | skipUnless | Prompt | requiredArgs | toolArgsMatch | 输出断言 |
|----|------|------|-----------|--------|--------------|---------------|----------|
| `indexer-querySubgraph-basic` | `mantle_querySubgraph` | endpoint-configured | `E2E_SUBGRAPH_ENDPOINT` | "Query the Agni subgraph at {E2E_SUBGRAPH_ENDPOINT} to get the top 5 pools by TVL. Use the GraphQL query: { pools(first: 5, orderBy: totalValueLockedUSD) { id totalValueLockedUSD } }" | `["endpoint", "query"]` | `{ endpoint: "{E2E_SUBGRAPH_ENDPOINT}" }` | 包含 `"data"` 或 `"pool"` |
| `indexer-queryIndexerSql-basic` | `mantle_queryIndexerSql` | endpoint-configured | `E2E_SQL_ENDPOINT` | "Run a SQL query against the indexer at {E2E_SQL_ENDPOINT} to get the top 10 token transfers: SELECT * FROM transfers ORDER BY block_number DESC LIMIT 10" | `["endpoint", "query"]` | `{ endpoint: "{E2E_SQL_ENDPOINT}" }` | 包含 `"columns"` 或 `"rows"` |

> `{E2E_SUBGRAPH_ENDPOINT}` 和 `{E2E_SQL_ENDPOINT}` 为运行时模板变量，从环境变量注入到 prompt 中。未配置时场景自动跳过。

### 6.7 diagnostics 模块（2 工具）

| ID | 工具 | 分类 | Prompt | requiredArgs | toolArgsMatch | 输出断言 |
|----|------|------|--------|--------------|---------------|----------|
| `diagnostics-checkRpcHealth-mainnet` | `mantle_checkRpcHealth` | network-dependent | "Check the health of the Mantle mainnet RPC endpoint." | `[]` | `{ network: "mainnet" }` | 包含 `"reachable"` 或 `"chain_id"` |
| `diagnostics-probeEndpoint-block` | `mantle_probeEndpoint` | network-dependent | "Probe the RPC endpoint https://rpc.mantle.xyz with eth_blockNumber." | `["rpc_url"]` | `{ rpc_url: "https://rpc.mantle.xyz", method: "eth_blockNumber" }` | 包含 `"result"` 或 `"block"` |

### 6.8 场景总览

| 模块 | 工具数 | 场景数 | 分类分布 |
|------|--------|--------|----------|
| chain | 2 | 2 | 1 self-contained + 1 network-dependent |
| registry | 2 | 2 | 2 self-contained |
| account | 3 | 3 | 3 network-dependent |
| token | 3 | 3 | 1 self-contained + 2 network-dependent |
| defi-read | 3 | 3 | 1 self-contained + 2 stub-deps |
| indexer | 2 | 2 | 2 endpoint-configured（可跳过） |
| diagnostics | 2 | 2 | 2 network-dependent |
| **合计** | **17** | **17** | **5 self-contained, 8 network, 2 stub-deps, 2 configurable** |

---

## 7. 执行策略

### 7.1 运行时机

| 触发条件 | 运行内容 |
|----------|----------|
| 每次 PR | 仅运行 `npm test`（现有单元测试） |
| Release tag / 手动触发 | `npm test`（单元测试）+ `npm run test:e2e`（Agent E2E 测试） |

### 7.2 NPM Script

```json
{
  "scripts": {
    "test": "vitest run",
    "test:e2e": "vitest run --config vitest.e2e.config.ts"
  }
}
```

> `npm run test:e2e` 不会自动加载 `.env`。  
> 推荐命令：

```bash
set -a
source .env
set +a
# 未配置 indexer endpoint 时显式跳过这两类场景
unset E2E_SUBGRAPH_ENDPOINT E2E_SQL_ENDPOINT
npm run test:e2e
```

### 7.3 独立 Vitest 配置

```typescript
// vitest.e2e.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["e2e/**/*.test.ts"],
    environment: "node",
    testTimeout: 300_000,    // 单个主测试块 5 分钟（含 runner 层重试）
    hookTimeout: 30_000,     // setup/teardown 超时
    retry: 0                 // 重试在 runner 层处理，Vitest 层不重试
  }
});
```

### 7.4 超时预算（派生自 §5.4 重试策略）

| 参数 | 值 | 推导 |
|------|-------|------|
| 单次 `generateText` 超时 | `E2E_TIMEOUT_MS`（默认 30s） | 单次 LLM 调用上限 |
| 单场景最大耗时 | 30s × 3 = 90s | `E2E_TIMEOUT_MS` × (1 + `E2E_MAX_RETRIES`) |
| Vitest `testTimeout` | 300s（5min） | 覆盖单个主测试块内所有场景的顺序执行 + buffer |
| 全套件典型耗时 | ~2-5min | 多数场景 1-3s，仅超时场景耗满 30s |
| 全套件理论最坏耗时（放宽 `testTimeout` 时） | 17 × 90s ≈ 26min | 所有场景都需 3 次 × 30s（极端情况） |

> 注意：当前实现是单个 `it()` 顺序执行全部场景，Vitest `testTimeout` 作用于整块执行时间。  
> 若未来改为每个场景独立 `it()`，可将 `testTimeout` 调整为单场景预算（`E2E_TIMEOUT_MS × 3 + buffer`，约 120s）。
> 默认 300s 配置下，若主测试块超时会被 Vitest 直接判定失败；要覆盖极端重试场景需显式提高 `testTimeout`。

### 7.5 失败处理

- **Soft Fail 模式**：所有场景都执行完毕再汇总结果，不因单个失败中断
- **CI 报告权衡**：Vitest 仅显示主测试块 1 条用例；场景级通过/失败/重试细节由自定义报告输出
- 区分失败类型：
  - `TOOL_NOT_CALLED`：Agent 未进行任何工具调用
  - `WRONG_ARGS`：Agent 调用了工具但参数不匹配（schema 问题）
  - `ASSERTION_FAILED`：工具调用正确但输出不符合预期（handler 问题）
  - `TIMEOUT`：LLM 响应超时
  - `LLM_ERROR`：LLM API 返回错误

### 7.6 测试报告

每次运行生成结构化报告：

```
=== Mantle MCP E2E Agent Test Report ===
Provider: openai (gpt-4o)
Date: 2026-03-01T12:00:00Z
Duration: 45s

Results: 15/17 PASS, 1 FAIL, 1 SKIP

PASS  chain-getChainInfo-mainnet          (1.2s, 1 attempt)
PASS  chain-getChainStatus-mainnet        (2.1s, 1 attempt)
PASS  registry-resolveAddress-usdc        (1.8s, 1 attempt)
...
FAIL  indexer-querySubgraph-basic         (30.0s, 3 attempts)
      → TOOL_NOT_CALLED: Agent did not call mantle_querySubgraph
SKIP  diagnostics-probeEndpoint-block     (skipped: E2E_SKIP_DIAGNOSTICS=true)

Total LLM tokens: 12,345 (prompt: 8,234, completion: 4,111)
```

---

## 8. 版本演进规则

### 8.1 新版本 Scenario 添加规则

每个新 release 版本必须：

1. 为所有新增工具添加对应 scenario
2. 保留所有已有 scenario 作为回归测试
3. 在 scenario 文件头部标注引入版本

```typescript
// e2e/scenarios/exec.scenarios.ts (v0.3 新增)
export const execScenarios: AgentScenario[] = [
  {
    id: "exec-simulateTx-transfer",
    module: "exec",        // 新模块（ScenarioModule = string，无需修改接口）
    toolName: "mantle_simulateTx",
    prompt: "Simulate a transfer of 1 MNT to 0x...",
    expectedToolCall: "mantle_simulateTx",
    expectedOutcome: "success",
    outputAssertions: {
      requiredArgs: ["to", "value"],
      containsText: ["simulation", "result"]
    }
  }
];
```

### 8.2 版本 → 场景映射

| 版本 | 新增工具 | 累计场景数 |
|------|----------|------------|
| v0.1-core | 10 工具（chain, registry, account, token） | 10 |
| v0.2-readplus | 7 工具（defi-read, indexer, diagnostics） | 17 |
| v0.3-exec | ~7 工具（simulateTx, decode*, build*Tx） | ~24 |
| v0.4-advanced | ~7 工具（lending, deploy, verify, receipt） | ~31 |
| v0.5-hardening | 0 新工具（安全加固） | ~31 |
| v1.0-ga | 0 新工具（稳定化） | ~31 |
| v1.1-ondo | ~2 工具（Ondo 相关） | ~33 |

### 8.3 Release Gate 标准

Release 可发布的 E2E 条件：

- [ ] 所有场景执行完毕（无 TIMEOUT 或 LLM_ERROR）
- [ ] 通过率 ≥ 90%（允许 LLM 不确定性导致的偶发失败）
- [ ] 无 `TOOL_NOT_CALLED` 类型失败（schema/description 问题必须修复）
- [ ] 新增工具对应的 scenario 全部 PASS
- [ ] 无连续失败场景：同一场景在连续 2 个 release 中均失败时，视为非偶发问题，必须修复后方可发布

---

## 9. 验收标准

### 9.1 Spec 验收

- [ ] 本文档覆盖所有 9 个章节
- [ ] 场景目录覆盖 v0.2 全部 17 个工具
- [ ] 架构图与时序描述一致
- [ ] 接口定义完整且可实现
- [ ] 执行策略明确运行时机、超时、重试

### 9.2 实现验收

- [ ] `e2e/` 目录结构与 §4.2 一致
- [ ] `vitest.e2e.config.ts` 独立于主测试配置
- [ ] `npm run test:e2e` 可执行全部场景
- [ ] 所有 17 个场景实现且在 `E2E_LLM_PROVIDER` 配置后可运行
- [ ] Runner setup/teardown 正确管理 MCP 连接生命周期
- [ ] 失败场景产生清晰的失败类型和错误信息
- [ ] 测试报告包含 §7.6 定义的所有字段

### 9.3 跨版本验收

- [ ] v0.3+ 新增工具有对应 scenario PR
- [ ] 已有 scenario 在新版本上无 regression
- [ ] Release 发布前 E2E 测试结果记录在案
