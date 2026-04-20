# TonTrader 技术依赖调研报告

## 1. 依赖总览

基于 PRD 需求，tontrader 需要以下依赖包，按功能分层：

```
┌─────────────────────────────────────────────────────────────┐
│                       tontrader CLI                          │
├──────────────┬──────────────┬──────────────┬────────────────┤
│   CLI 层     │   数据层      │   交易层      │   类型层       │
│ commander    │ @ton-api/    │ @ton/ton     │ zod            │
│ chalk        │   client     │ @ton/crypto  │                │
│ cli-table3   │ @ston-fi/api │ @ton/core    │                │
│              │ (fetch直调)   │ @ston-fi/sdk │                │
├──────────────┴──────────────┴──────────────┴────────────────┤
│                     Bun Runtime                              │
└─────────────────────────────────────────────────────────────┘
```

## 2. 核心 TON SDK 包

### 2.1 `@ton/ton` — 主 SDK
| 属性 | 值 |
|------|-----|
| 最新版本 | **16.2.2** |
| 用途 | 钱包合约、交易构建、消息发送 |
| 依赖 | axios ^1.6.7, dataloader ^2.0.0, zod ^3.21.4 |
| Peer 依赖 | `@ton/core` >=0.63.0 <1.0.0, `@ton/crypto` >=3.2.0 |

**我们需要的 API:**
```typescript
import {
  WalletContractV5R1,  // 最新钱包合约 (mainnet: -239, testnet: -3)
  WalletContractV4,    // 兼容旧钱包
  Address,             // 地址解析
  beginCell,           // 构建 Cell (jetton 转账用)
  internal,            // 构建内部消息
  toNano,              // TON → nanoTON 转换
  SendMode,            // 发送模式标志
} from '@ton/ton';
```

**钱包创建示例:**
```typescript
const wallet = WalletContractV5R1.create({
  workchain: 0,
  publicKey: keyPair.publicKey,
  walletId: { networkGlobalId: -239 }, // mainnet=-239, testnet=-3
});
```

**发送交易示例:**
```typescript
const seqno = await contract.getSeqno();
await contract.sendTransfer({
  secretKey: keyPair.secretKey,
  seqno,
  sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
  messages: [internal({ to: address, value: '0.05', body: 'hello' })]
});
```

### 2.2 `@ton/crypto` — 密码学
| 属性 | 值 |
|------|-----|
| 最新版本 | **3.3.0** |
| 用途 | 助记词 → 密钥对 |

```typescript
import { mnemonicToPrivateKey } from '@ton/crypto';
const keyPair = await mnemonicToPrivateKey(mnemonic.split(' '));
// keyPair.publicKey, keyPair.secretKey
```

### 2.3 `@ton/core` — 核心类型
| 属性 | 值 |
|------|-----|
| 最新版本 | **0.63.1** |
| 用途 | Cell, Address, beginCell 等基础类型（@ton/ton 的 peer dep） |

自动通过 `@ton/ton` 引入，一般不需要单独 import。

## 3. TonAPI 客户端 (钱包余额 + 交易历史)

### 3.1 `@ton-api/client` — TonAPI REST 客户端
| 属性 | 值 |
|------|-----|
| 最新版本 | **0.4.0** |
| 用途 | 查询余额、jetton 持仓、交易历史、事件 |
| 依赖 | core-js-pure ^3.38.0 |

```typescript
import { TonApiClient } from '@ton-api/client';
const ta = new TonApiClient({
  baseUrl: 'https://tonapi.io',
  apiKey: 'YOUR_API_KEY', // 可选，免费额度够用
});
```

**关键 API 端点:**
| 方法 | 用途 | 对应命令 |
|------|------|---------|
| `ta.accounts.getAccount(id)` | 查询余额 | `balance` |
| `ta.accounts.getJettonsBalances(id)` | 查询 jetton 持仓 | `balance --all` |
| `ta.accounts.getAccountEvents(id)` | 交易历史 | `history` |
| `ta.blockchain.execGetMethodForBlockchainAccount()` | 调用合约 getter | jetton wallet 地址推导 |

### 3.2 `@ton-api/ton-adapter` — @ton/ton 适配器
| 属性 | 值 |
|------|-----|
| 最新版本 | **0.4.1** |
| 用途 | 让 @ton/ton 的合约通过 TonAPI 发送交易 |
| Peer 依赖 | @ton-api/client ^0.4.0, @ton/core >=0.60.1 |

```typescript
import { ContractAdapter } from '@ton-api/ton-adapter';
const adapter = new ContractAdapter(ta);
const contract = adapter.open(wallet); // wallet 是 WalletContractV5R1 实例
// 现在可以用 contract.sendTransfer(), contract.getSeqno() 等
```

**为什么用这个而不是 TonClient?**
- TonClient 直连 TON 节点（需要 liteserver 配置）
- TonAPI 提供 REST API + 结构化数据（余额、jetton、事件）
- 官方推荐方式，代码更简洁

## 4. STON.fi DEX 包

### 4.1 `@ston-fi/api` — REST API 客户端
| 属性 | 值 |
|------|-----|
| 最新版本 | **0.31.0** |
| 用途 | 价格、池子、交换模拟、交易状态 |
| 依赖 | camelcase-keys, decamelize-keys, ofetch |

**关键 API 端点（无限流，无认证）:**

| 端点 | 方法 | 用途 | 对应命令 |
|------|------|------|---------|
| `/v1/assets` | GET | 所有代币列表 | `trending` |
| `/v1/assets/{address}` | GET | 单个代币详情 | `price` |
| `/v1/assets/query` | POST | 搜索代币 (search_term, sort_by) | `research liquidity <symbol>` |
| `/v1/pools` | GET | 所有池子 | `pools` |
| `/v1/pools/by_market/{a}/{b}` | GET | 交易对池子 | `pools <pair>` |
| `/v1/swap/simulate` | POST | 模拟交换 | `swap` |
| `/v1/reverse_swap/simulate` | POST | 反向模拟 | — |
| `/v1/swap/status` | GET | 交换状态 | `swap --execute` |
| `/v1/wallets/{addr}/assets` | GET | 钱包持仓 | `balance --all` |
| `/v1/wallets/{addr}/operations` | GET | 操作历史 | `history` |
| `/v1/stats/dex` | GET | DEX 统计 | `research` |
| `/v1/routers` | GET | 路由器列表 | swap 执行用 |

**P0 阶段建议**: 直接用 `fetch()` 调 REST API，不引入 `@ston-fi/api` 包。原因：
1. API 无认证，直接 HTTP 调用最简单
2. 减少依赖
3. 返回 JSON 直接用 Zod 解析

### 4.2 `@ston-fi/sdk` — DEX SDK（P1 才需要）
| 属性 | 值 |
|------|-----|
| 最新版本 | **2.7.0** |
| 用途 | 构建 swap 交易消息（execute 才需要） |
| Peer 依赖 | `@ston-fi/api` ^0, `@ton/ton` ^13-16 |

**仅用于 `swap --execute`:**
```typescript
import { DEX, pTON } from '@ston-fi/sdk';

// 从模拟结果获取路由器信息
const router = simulationResult.routerAddress;
const dex = DEX.v2.Router.create(router);

// 构建交易参数
const txParams = await dex.getSwapTonToJettonTxParams({
  userWalletAddress: wallet.address,
  offerAmount: simulationResult.offerUnits,
  minAskAmount: simulationResult.minAskUnits,
  askJettonAddress: simulationResult.askAddress,
  proxyTon: pTON.v2_1.create(proxyTonAddress),
});
```

**⚠️ P0 阶段不需要这个包**。P0 只做 `simulate`（REST API 调用），不执行链上交易。

## 5. CLI & UI 包

### 5.1 `commander` v14.0.3
```typescript
import { Command } from 'commander';
const program = new Command();
program.name('tontrader').version('0.1.0');
program.command('research quote <symbol>').option('--json', 'JSON output').action(researchQuoteAction);
```

### 5.2 `chalk` v5.6.2
```typescript
import chalk from 'chalk';
console.log(chalk.green('+3.2%'));
console.log(chalk.red('-1.5%'));
```
**注意**: chalk v5 是 ESM-only，Bun 原生支持。

### 5.3 `cli-table3` v0.6.5
```typescript
import Table from 'cli-table3';
const table = new Table({ head: ['Symbol', 'Price', '24h'] });
table.push(['NOT', '$0.0068', '+3.2%']);
```

### 5.4 `zod` v4.3.6
```typescript
import { z } from 'zod';
const AssetSchema = z.object({
  symbol: z.string(),
  price_usd: z.string(),
  change_24h: z.string(),
});
```
**注意**: @ton/ton 内部依赖 zod ^3.21.4，我们用 zod v4。两个版本可共存（Bun workspace 隔离），但需测试。如有冲突可降为 v3。

## 6. 依赖安装命令

### P0 最小依赖
```bash
bun add @ton/ton @ton/crypto @ton/core \
       @ton-api/client @ton-api/ton-adapter \
       commander chalk cli-table3 zod
```

### P1 追加依赖（swap execute）
```bash
bun add @ston-fi/sdk @ston-fi/api
```

### 完整 package.json dependencies
```json
{
  "dependencies": {
    "@ton/ton": "^16.2.2",
    "@ton/crypto": "^3.3.0",
    "@ton/core": "^0.63.1",
    "@ton-api/client": "^0.4.0",
    "@ton-api/ton-adapter": "^0.4.1",
    "commander": "^14.0.3",
    "chalk": "^5.6.2",
    "cli-table3": "^0.6.5",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.8.0"
  }
}
```

**注意**: zod 降为 v3 以避免与 @ton/ton 内部的 zod ^3 潜在冲突。

## 7. TON MCP (`@ton/mcp`) — 参考但不直接依赖

| 属性 | 值 |
|------|-----|
| 版本 | 0.1.15-alpha.0 |
| 用途 | MCP server，供 AI Agent 操作 TON 钱包 |

**我们不直接依赖 @ton/mcp，但可参考其实现:**
- 钱包管理模式（registry vs single-wallet）
- 环境变量设计（MNEMONIC, NETWORK, WALLET_VERSION）
- 交易签名流程

**配置文件路径参考**: `~/.config/ton/config.json`（@ton/mcp 的 registry 模式路径）

## 8. 完整 Jetton 转账代码参考

这是官方推荐的 jetton 转账实现，tontrader `swap --execute` 内部的核心逻辑：

```typescript
import { WalletContractV5R1, Address, beginCell, internal, toNano, SendMode } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { TonApiClient } from '@ton-api/client';
import { ContractAdapter } from '@ton-api/ton-adapter';

// 1. 初始化 TonAPI
const ta = new TonApiClient({ baseUrl: 'https://tonapi.io', apiKey: 'KEY' });
const adapter = new ContractAdapter(ta);

// 2. 创建钱包
const keyPair = await mnemonicToPrivateKey(mnemonic.split(' '));
const wallet = WalletContractV5R1.create({
  workchain: 0,
  publicKey: keyPair.publicKey,
  walletId: { networkGlobalId: -239 }, // -3 for testnet
});
const contract = adapter.open(wallet);

// 3. 获取 jetton wallet 地址
const result = await ta.blockchain.execGetMethodForBlockchainAccount(
  jettonMasterAddress,
  'get_wallet_address',
  { args: [wallet.address.toRawString()] }
);
const jettonWallet = Address.parse(result.decoded.jetton_wallet_address);

// 4. 构建 jetton 转账消息
const jettonTransferBody = beginCell()
  .storeUint(0xf8a7ea5, 32)   // op: jetton transfer
  .storeUint(0, 64)            // query_id
  .storeCoins(jettonAmount)    // 转账数量
  .storeAddress(destination)   // 收款地址
  .storeAddress(wallet.address) // response_destination
  .storeBit(false)             // custom_payload
  .storeCoins(1n)              // forward_ton_amount
  .storeMaybeRef(undefined)    // forward_payload
  .endCell();

// 5. 签名并发送
const seqno = await contract.getSeqno();
await contract.sendTransfer({
  seqno,
  secretKey: keyPair.secretKey,
  sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
  messages: [internal({
    to: jettonWallet,
    value: toNano(0.05),       // gas 费
    body: jettonTransferBody,
  })]
});
```

## 9. STON.fi REST API 调用示例

tontrader P0 阶段直接用 fetch 调 STON.fi API：

```typescript
const STONFI_BASE = 'https://api.ston.fi';

// 查询代币
async function searchAsset(symbol: string) {
  const res = await fetch(`${STONFI_BASE}/v1/assets/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ search_term: symbol, limit: 5 }),
  });
  return res.json();
}

// 模拟交换
async function simulateSwap(from: string, to: string, amount: string) {
  const res = await fetch(`${STONFI_BASE}/v1/swap/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      offer_address: from,
      ask_address: to,
      units: amount,
      slippage_tolerance: '0.01',
    }),
  });
  return res.json();
}
```

## 10. 依赖决策总结

| 包 | 版本 | P0 需要? | P1 需要? | 用途 |
|----|------|---------|---------|------|
| `@ton/ton` | 16.2.2 | ✅ | ✅ | 钱包 + 交易签名 |
| `@ton/crypto` | 3.3.0 | ✅ | ✅ | 助记词 → 密钥对 |
| `@ton/core` | 0.63.1 | ✅ (peer) | ✅ | Cell, Address 等基础类型 |
| `@ton-api/client` | 0.4.0 | ✅ | ✅ | TonAPI (余额/历史/jetton 查询) |
| `@ton-api/ton-adapter` | 0.4.1 | ✅ | ✅ | @ton/ton ↔ TonAPI 桥接 |
| `commander` | 14.0.3 | ✅ | ✅ | CLI 框架 |
| `chalk` | 5.6.2 | ✅ | ✅ | 终端颜色 |
| `cli-table3` | 0.6.5 | ✅ | ✅ | 终端表格 |
| `zod` | 3.23+ | ✅ | ✅ | Schema 验证 |
| `@ston-fi/sdk` | 2.7.0 | ❌ | ✅ | 构建 swap 交易消息 |
| `@ston-fi/api` | 0.31.0 | ❌ | ✅ | @ston-fi/sdk 的 peer dep |
| `@ton/mcp` | 0.1.15-alpha | ❌ | ❌ | 仅参考，不直接依赖 |

## 11. 环境变量设计（参考 @ton/mcp）

```bash
# 必选
TONTRADER_MNEMONIC="word1 word2 ..."   # 或从 ~/.tontrader/config.json 读取

# 可选
TONTRADER_NETWORK=mainnet              # mainnet | testnet
TONTRADER_WALLET_VERSION=v5r1          # v5r1 | v4r2
TONAPI_KEY=xxx                         # TonAPI key（可选，免费有限额）
```

## 12. 关键技术要点

1. **钱包版本选择**: 用 `WalletContractV5R1`（最新），`networkGlobalId: -239`(mainnet) / `-3`(testnet)
2. **STON.fi API 无限流**: 无认证无限流，P0 直接 `fetch()` 调用
3. **TonAPI 免费额度**: 有免费额度，key 可选但建议配置
4. **Jetton 转账 gas**: 固定 `toNano(0.05)` 作为 gas 费
5. **Jetton transfer opcode**: `0xf8a7ea5`
6. **zod 版本**: 用 v3 系列（与 @ton/ton 内部依赖兼容）
7. **chalk v5**: ESM-only，Bun 原生支持无问题
8. **@ston-fi/sdk swap 流程**: 先 API simulate → 获取 routerInfo → dexFactory 构建 → 签名发送
