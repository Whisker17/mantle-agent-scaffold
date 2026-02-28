# Mantle MCP Release 分割计划（可勾选执行版）

> 基于 `specs/mcp-design.md` 的分版本落地清单。  
> 本文档只做“版本拆分与验收清单”，不代表已实现。  
> 后续每完成一项，请将对应 `[ ]` 改为 `[x]`。

## 0. 版本范围约束

- [x] v1 首发仅支持 DeFi 协议：`Agni`、`Merchant Moe`、`Aave v3`
- [x] `Ondo` 明确为 post-v1（计划中，首发不启用）
- [x] 任何 `BLOCKER:` 地址在“已启用协议”中不得进入 release

---

## 1. 版本总览

| 版本 | 目标 | 预计产出 |
|------|------|----------|
| v0.1-core | 基础骨架 + 链上只读核心 | 可跑通基础查询与地址/代币解析 |
| v0.2-readplus | DeFi 只读 + 估值 + 资源/提示词初版 | 可做组合分析与风险只读检查 |
| v0.3-exec | 交易模拟与核心构建工具 | 可安全构建 transfer/approve/swap/liquidity |
| v0.4-advanced | 借贷、部署、验证、监控完善 | 覆盖 Aave v3 与部署工作流 |
| v0.5-hardening | 安全与工程化加固 | SSRF/CI/错误模型/配置完善 |
| v1.0-ga | 首发稳定版 | 完成 GA 门槛与文档冻结 |
| v1.1-ondo | Ondo 支持 | 启用 Ondo 协议能力 |

---

## 2. v0.1-core（基础骨架）

### 2.1 Server/Transport
- [x] 建立 `src/index.ts`、`src/server.ts`、模块化 tool/resource/prompt 注册
- [x] 支持 `stdio` 传输（作为 v0.1 默认唯一启用传输）
- [x] `mcp.serverUseInstructions` 与 `SERVER_INSTRUCTIONS.md` 对齐

### 2.2 基础工具（只读）
- [x] `mantle_getChainInfo`
- [x] `mantle_getChainStatus`
- [x] `mantle_resolveAddress`（含 `network` 统一与兼容别名处理）
- [x] `mantle_validateAddress`
- [x] `mantle_getBalance`
- [x] `mantle_getTokenBalances`
- [x] `mantle_getAllowances`
- [x] `mantle_getTokenInfo`
- [x] `mantle_resolveToken`（quick-ref + token-list double-check）
- [x] `mantle_getTokenPrices`（估值来源，不可伪造）

### 2.3 基础资源
- [x] `mantle://chain/mainnet`
- [x] `mantle://chain/sepolia`
- [x] `mantle://registry/contracts`
- [x] `mantle://registry/tokens`
- [x] `mantle://registry/protocols`（仅启用 Agni/Merchant Moe/Aave v3；Ondo 标记 planned）

### 2.4 验收
- [x] 基础工具单测通过
- [x] 关键 schema 与示例一致
- [x] README/配置示例可本地跑通

---

## 3. v0.2-readplus（DeFi 只读与分析）

- [x] v0.2-readplus 已完成并通过审计修复（2026-03-01）

### 3.1 DeFi Read + Indexer
- [x] `mantle_getSwapQuote`（Agni/Merchant Moe）
- [x] `mantle_getPoolLiquidity`
- [x] `mantle_getLendingMarkets`（v1 范围仅 Aave v3）
- [x] `mantle_querySubgraph`
- [x] `mantle_queryIndexerSql`

### 3.2 诊断工具（只读）
- [x] `mantle_checkRpcHealth`
- [x] `mantle_probeEndpoint`

### 3.3 Prompt/Resource 先行版本
- [x] `mantle_portfolioAudit`
- [x] `mantle_mantleBasics`
- [x] `mantle_gasConfiguration`
- [x] `mantle://docs/network-basics`
- [x] `mantle://docs/risk-checklist`

### 3.4 验收
- [x] 组合分析流程可输出余额 + allowance + USD 估值
- [x] DeFi 只读路径不触发写操作
- [x] `total_liquidity_usd`/`tvl_usd` 为 null 时有明确降级行为

---

## 4. v0.3-exec（交易模拟与核心执行）

### 4.1 模拟/解码
- [ ] `mantle_simulateTx`（`to: string | null` 支持部署场景）
- [ ] `mantle_decodeCalldata`
- [ ] `mantle_decodeError`

### 4.2 核心交易构建
- [ ] `mantle_buildTransferTx`
- [ ] `mantle_buildApproveTx`
- [ ] `mantle_buildSwapTx`
- [ ] `mantle_buildLiquidityTx`（Agni 范围参数：price/tick/full-range）

### 4.3 执行安全
- [ ] 建立“build 工具内置 simulation 为主”的单一模拟策略
- [ ] 落地交易前风险 preflight（含滑点、深度、授权）
- [ ] `human_summary` 展示与确认门槛落地

### 4.4 验收
- [ ] swap 主流程可跑通：quote → approve(按需) → build → confirm
- [ ] 无额外重复模拟冲突
- [ ] 失败路径返回 typed error

---

## 5. v0.4-advanced（借贷、部署、验证、监控）

### 5.1 借贷与监控
- [ ] `mantle_buildLendingTx`（仅 `aave_v3`）
- [ ] `mantle_getTransactionReceipt`
- [ ] `mantle_waitForReceipt`

### 5.2 部署与验证
- [ ] `mantle_buildDeployTx`
- [ ] `mantle_verifyContract`
- [ ] `mantle_checkVerification`
- [ ] `mantle_getExplorerUrl`

### 5.3 Prompt 补齐
- [ ] `mantle_swapWorkflow`
- [ ] `mantle_deployWorkflow`
- [ ] `mantle_riskPreflight`
- [ ] `mantle_companionMcps`

### 5.4 验收
- [ ] Aave v3 借贷路径可跑通（含 HF 风险门槛）
- [ ] 部署→回执→验证闭环可跑通
- [ ] 所有 Tx Build 工具输出结构一致

---

## 6. v0.5-hardening（安全与工程化加固）

### 6.1 安全
- [ ] Endpoint 安全策略统一（SSRF 防护）
- [ ] `ENDPOINT_NOT_ALLOWED` 全链路返回一致
- [ ] `MANTLE_ALLOWED_ENDPOINT_DOMAINS` 生效
- [ ] `MANTLE_ALLOW_HTTP_LOCAL_ENDPOINTS` 生效

### 6.2 Token/Registry 工程化
- [ ] token-list pin/hash 机制完善
- [ ] token-list 不可用时分级策略严格执行（读降级、写阻断）
- [ ] CI 同步检查覆盖：registry/tokens/protocols/abis/blocker

### 6.3 运维与可观测性
- [ ] 补充结构化日志规范（stderr）
- [ ] 增加基础指标：tool 调用次数、延迟、错误率
- [ ] 增加 `MANTLE_LOG_LEVEL`（如设计采用）

### 6.4 验收
- [ ] 安全测试通过（含 SSRF、私网地址拦截）
- [ ] CI 校验矩阵全绿
- [ ] 文档与实现无偏差

---

## 7. v1.0-ga（首发稳定版）

### 7.1 GA 关闭项（来自审计 backlog）
- [ ] `unsigned_tx` 扩展 nonce/EIP-1559 字段策略（或明确钱包负责并文档化）
- [ ] `token`/`asset` 命名策略统一（含兼容策略）
- [ ] `waitForReceipt` 与 T1 的关系明确（例外或替代方案）
- [ ] 明确 revoke 标准流程（`approve(0)`）
- [ ] 多步交易顺序规范（必要时引入 sequence 方案）
- [ ] 工具名冲突检测（server 启动即 fail-fast）
- [ ] HTTP/SSE 传输实现文档与代码对齐（若仍宣称支持）
- [ ] ABI 资源“计数与发现策略”说明一致

### 7.2 首发回归
- [ ] 端到端回归（只读、交易构建、部署、验证、错误路径）
- [ ] 所有 prompts 示例可按 schema 成功调用
- [ ] 发布说明与迁移说明完成

---

## 8. v1.1-ondo（后续版本）

### 8.1 功能启用
- [ ] 启用 Ondo 协议配置（从 planned → enabled）
- [ ] 补齐 Ondo ABI/provider
- [ ] 扩展 `mantle_getLendingMarkets`（或独立 Ondo 读工具）
- [ ] 若有写路径，补齐对应 build 工具与风险规则

### 8.2 文档与提示词
- [ ] 协议清单更新为“已启用 Ondo”
- [ ] prompts / companion / examples 全量更新
- [ ] CI 协议完整性检查把 Ondo 纳入 enabled 集合

### 8.3 验收
- [ ] Ondo 相关路径单测/集成测试通过
- [ ] 无 regression 到 v1.0 已有协议

---

## 9. 跨版本统一勾选区（发布门禁）

- [ ] 所有新增工具都有：输入 schema、输出 schema、错误码、示例
- [ ] 所有新增资源都有：URI、返回结构、用途说明
- [ ] 所有新增 prompt 都有：参数、流程、风险边界
- [ ] 所有“写操作相关路径”都满足：地址校验 → token 校验 → simulation → human_summary
- [ ] 所有 release 都有对应测试清单与回归结果
- [ ] `specs/mcp-design.md` 与实际实现保持同步更新
