这个四阶段的设计非常清晰，并且完美契合了当前 AI Agent 架构中从“认知 -> 分析 -> 风控 -> 执行”的演进逻辑。您将“安全与排障（风控）”单独提取为第三阶段，这是非常专业且必要的，因为在区块链的真实环境中，执行前的模拟和错误排查（Pre-flight & Debugging）往往比执行本身更关键。

结合您提供的新框架以及最新的 Agent Skills 与 MCP（模型上下文协议）设计范式，我为您重新梳理了详细的落地计划。

关于您的疑问：**系统合约地址如何留存？**
**建议：不要在 System Prompt（系统提示词）或大段文本中明文保存。** 
在 Agent 架构中，将大量静态数据写入提示词不仅消耗 Token，还容易引起模型幻觉或上下文超载。最佳实践是采用**数据与指令分离**的模式：
1. **采用 MCP Resources（资源）**：将核心合约地址库（如 Mantle 的 WETH, Router, 官方 Bridge 等）封装为只读的 MCP Resource（如 `mcp://mantle/system-contracts`）。当 Agent 遇到相关任务时，动态读取该资源。
2. **存放在 Skill 的 `assets/` 目录下**：如果是以文件系统形式实现 Skill，可以将地址和 ABI 放在 `assets/registry.json` 中，在 Markdown 技能指南中告诉 Agent：“请通过读取 `assets/registry.json` 来获取 Mantle 官方合约地址”。

---

### 阶段一：Mantle Overviews (Onboarding & 基础认知)
**定位：** Agent 的“入职培训”（Onboarding），为其建立关于 Mantle 网络的全局观、常识和寻址能力。

**需要实现的 Skills：**
1. **`mantle-network-primer` (网络特性指南)**
   * **Skill 内容：** 介绍 Mantle 的 Layer 2 属性、Gas 代币（MNT）机制、区块时间、最终性（Finality）特征，以及与以太坊 L1 的关系。
   * **目标：** 当用户提出宽泛问题（“Mantle 相比其他 L2 有什么不同？”、“为什么我需要 MNT？”）时，Agent 能够调用此 Skill 给出专业解答。
2. **`mantle-address-registry-navigator` (系统地址与资产寻址器)**
   * **Skill 内容：** 教授 Agent **如何**去查找安全的合约地址。指南中不直接写死地址，而是说明：“当你需要获取 Mantle 上的代币或系统合约地址时，请读取本地的 `registry.json`，或调用 `get_contract_address` 工具”。
   * **目标：** 彻底消除 Agent 捏造假地址的幻觉风险，确保所有交互基于官方或认证的白名单合约。

---

### 阶段二：只读与链上分析 (Read-Only Analytics)
**定位：** 赋予 Agent 读取和理解链上状态的能力。

**需要实现的 Skills：**
3. **`mantle-portfolio-analyst` (资产与授权分析师)**
   * **Skill 内容：** 指导 Agent 如何组合调用 RPC 工具来清点用户资产。工作流包括：获取原生 MNT 余额 -> 批量查询 ERC-20 Token 余额 -> **特别重要：查询当前钱包对各个 DEX/Lending 合约的授权额度 (Allowance)**。
   * **目标：** 能够输出一份清晰的格式化资产报告，并高亮提示无限授权（Unlimited Approval）的敞口。
4. **`mantle-data-indexer` (生态数据检索员)**
   * **Skill 内容：** 教授 Agent 如何利用 The Graph 或 Goldsky 等索引服务查询 Mantle 上的历史数据（如：查询某个流动性池过去 24 小时的交易量、用户的历史 Swap 记录）。
   * **目标：** 让 Agent 不仅能看懂“当前状态”，还能通过 GraphQL/SQL 管道进行“历史回溯”。

---

### 阶段三：安全、模拟与排障 (Security, Pre-flight & Debugging)
**定位：** 这是整个系统的**风控核心**。在发起任何不可逆的链上状态更改前，强制执行的“起飞前检查（Pre-flight）”。

**需要实现的 Skills：**
5. **`mantle-risk-evaluator` (风险审查清单)**
   * **Skill 内容：** 设定一套硬性的**执行前检查清单（Risk-Checklist）**。
     * **滑点检查：** 规划的 Swap 滑点是否超过用户设定（如 1%）？
     * **流动性深度：** 目标池的流动性是否足以承载该笔交易而不产生巨大价格冲击？
     * **钓鱼/黑名单检查：** 交互的地址是否在风险数据库中？
   * **目标：** 在生成交易意图后，强制 Agent 逐项打勾，不满足则阻断执行。
6. **`mantle-tx-simulator` (交易模拟与 WYSIWYS)**
   * **Skill 内容：** 指导 Agent 在本地分叉（如 Anvil）或通过 Tenderly API 等模拟环境试运行交易。
   * **目标：** 提取模拟后的状态差异（State Diffs）。实现“所见即所签（WYSIWYS）”，用人类大白话告诉用户：“如果这笔交易广播，你将失去 100 USDC，得到至少 98 MNT，并消耗 0.001 MNT 的 Gas”。
7. **`mantle-readonly-debugger` (RPC 与报错诊断专家)**
   * **Skill 内容：** 专门处理执行前或查询时出现的异常。包含错误码对照表（如常见的以太坊/Mantle Revert 原因）。
   * **排障工作流：** 
     * *RPC异常* -> 引导切换备用节点。
     * *报价失败* -> 检查流动性或代币精度（Decimals）是否传错。
     * *余额不一致* -> 检查是否有未确认的 Pending 交易（Nonce 冲突）。

---

### 阶段四：链上操作与执行指南 (On-chain Operations Guide)
**定位：** 核心执行层。将抽象的意图（Intent）转化为具体的、结构化的执行步骤，并处理多步复杂交易。

**需要实现的 Skills：**
8. **`mantle-smart-contract-deployer` (合约部署与验证指南)**
   * **Skill 内容：** 教授 Agent 如何在 Mantle 编译代码、预估部署 Gas、发送部署交易，并利用相关 API（如 Blockscout/Etherscan 变体）完成合约的开源验证。
9. **`mantle-defi-operator` (DeFi 复杂交互执行器)**
   * **Skill 内容：** 针对如“Swap（兑换）”、“Provide Liquidity（提供流动性）”等复杂操作提供标准化的操作流（SOP）。
   * **复杂 Swap 案例指南：** 
     1. 读取 Token 精度；
     2. 查询聚合器/DEX 的最优报价（Quote）；
     3. 检查当前 Allowance；
     4. 如果不足，构造 `Approve` 交易意图并**与 Swap 交易进行批处理（如果使用的是支持 ERC-4337 的智能账户/账户抽象）**；
     5. 提交执行并监听交易回执（Receipt），验证实际到账金额。

### 总结
这四个阶段的架构实际上勾勒出了一个 **“大脑（Skills） + 肌肉（MCP Tools）”** 的完美闭环：
* **阶段 1 & 4** 构成了 Agent 的**领域知识库**（知道这是什么、知道该怎么做）。
* **阶段 2** 是 Agent 的**感知器官**（获取数据）。
* **阶段 3** 是 Agent 的**免疫与神经系统**（保护资产、防范失败）。

建议在物理实现上，将每个 Skill 写成独立的 `SKILL.md`（按需动态加载），并将所有真正与链交互的动作（发请求、查数据）封装为底层无状态的 MCP Tools。这样您的架构将具备极高的可维护性和安全性。
