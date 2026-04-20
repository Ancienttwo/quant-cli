---
name: tonquant-cli
description: Use TonQuant as an open-source MIT CLI for OKX-first market research, quant runs, factor discovery, backtests, and TON account/payment support workflows around a multi-market factor marketplace. Trigger when the user wants shell-first finance research with `--json` output.
---

# TonQuant CLI

TonQuant is an open-source MIT CLI for agent-native quant workflows with OKX-first global crypto research and TON execution/support flows.

Use it from PI, OpenClaw, Claude Code, or any other agent that can execute shell commands and parse `--json` output.

Works from PI, OpenClaw, Claude Code, or any other agent that can execute shell commands and parse `--json` output.

## Who This Is For

- AI agents that need a stable shell + JSON contract
- Developers and researchers working directly in the terminal
- Factor creators using the multi-market factor marketplace with TON as the account and payment rail
- Researchers who want OKX-first public market data while keeping Hyperliquid available as a crypto-tradfi bridge venue

## Install

Prerequisite: Bun must already be available on `PATH`.

```bash
npm install -g tonquant
tonquant --help
```

The published package ships the CLI entrypoint plus the bundled quant backend, so support commands and quant commands work immediately after install.

## JSON Contract

Agents should call TonQuant with `--json` unless a human-readable terminal view is explicitly desired.

Success envelope:

```json
{ "status": "ok", "data": { "...": "..." } }
```

Error envelope:

```json
{ "status": "error", "error": "description", "code": "ERROR_CODE" }
```

Agent rules:

- Always check `status` before reading `data`.
- Treat `status: "error"` as the canonical failure path; do not scrape human output.
- If `--json` was requested and the command still fails before producing JSON, treat that as an environment/setup/runtime issue outside the normal contract.

## Global Flags

| Flag | Meaning |
| --- | --- |
| `--json` | Structured JSON output for agents |
| `--testnet` | Use testnet network for supported TON flows |
| `--config <path>` | Override the default config path |
| `--help` | Show help |
| `--version` | Show version |

## Command Map

### Research and Wallet Support

| Command | Purpose |
| --- | --- |
| `tonquant trending --limit 5 --json` | Rank TON tokens by STON.fi liquidity |
| `tonquant pools NOT/TON --json` | Inspect a TON pair pool |
| `tonquant research quote BTC --json` | Get an OKX-first public-market quote with provenance |
| `tonquant research search TON --json` | Search supported public-market instruments |
| `tonquant research compare BTC --json` | Compare OKX-first quotes against Binance and Hyperliquid bridge/reference venues |
| `tonquant research candles BTC --json` | Fetch public-market candles |
| `tonquant research liquidity NOT --json` | Inspect TON liquidity, pools, and price context (deprecated compatibility path) |
| `tonquant init --mnemonic 'word1 ... word24' --json` | Configure a wallet |
| `tonquant balance --all --json` | Show TON + jetton balances |
| `tonquant swap NOT TON 1000 --json` | Simulate a swap |
| `tonquant history --json` | Show recent wallet history |
| `tonquant okx market ticker BTC-USDT --json` | Proxy the official externally installed OKX Agent Trade Kit CLI through TonQuant |

### Quant Runtime

| Command | Purpose |
| --- | --- |
| `tonquant data fetch TON/USDT --json` | Fetch and cache normalized datasets |
| `tonquant data list --json` | List cached datasets |
| `tonquant data info TON/USDT --json` | Show cached dataset metadata |
| `tonquant signal list --json` | List available single-instrument signals |
| `tonquant signal compute --signals rsi,macd --symbols TON/USDT --json` | Compute single-instrument indicators |
| `tonquant factor evaluate --definition-file ./factor.json --liquidity-assumptions-file ./liquidity.json --cost-model-file ./cost.json --symbols AAPL,MSFT,NVDA --json` | Compute a factor evaluation artifact from factor-native metrics |
| `tonquant backtest run --strategy momentum --symbols TON/USDT --start-date 2026-01-01 --end-date 2026-03-31 --json` | Run a normalized backtest |
| `tonquant preset list --json` | List built-in presets |
| `tonquant preset show momentum-ton --json` | Show a preset definition |
| `tonquant autoresearch init --title "TON momentum" --strategy momentum --symbols TON/USDT --start-date 2026-01-01 --end-date 2026-03-31 --json` | Create a durable autoresearch track |
| `tonquant autoresearch run --track <trackId> --iterations 1 --json` | Advance an existing track |
| `tonquant autoresearch status --track <trackId> --json` | Inspect a track |
| `tonquant autoresearch list --json` | List durable tracks |
| `tonquant autoresearch promote --track <trackId> --candidate <candidateId> --json` | Promote a reviewed candidate |
| `tonquant autoresearch reject --track <trackId> --candidate <candidateId> --json` | Reject a candidate |

### Factor Marketplace

| Command | Purpose |
| --- | --- |
| `tonquant factor seed --json` | Load built-in starter factors into the local registry |
| `tonquant factor publish --name "My Factor" --category momentum --evaluation-file ./factor-evaluation.json --json` | Publish a factor artifact to the local registry |
| `tonquant factor discover --category momentum --min-icir 1 --max-peer-corr 0.4 --json` | Search factors with factor-native filters |
| `tonquant factor top --limit 10 --json` | Show the factor leaderboard ranked by ICIR / Rank IC / Q5-Q1 / turnover / peer correlation |
| `tonquant factor subscribe mom_30d_ton --json` | Subscribe to updates for a factor |
| `tonquant factor ic mom_30d_ton --json` | Read local IC / ICIR / t-stat summary for a factor |
| `tonquant factor decay mom_30d_ton --json` | Read local IC decay and half-life disclosure |
| `tonquant factor uniqueness mom_30d_ton --json` | Read local crowding / turnover / capacity summary |
| `tonquant factor pull mom_30d_ton --output-dir ./artifacts --json` | Buy via TON and pull the paid artifact bundle into the local workspace |
| `tonquant factor author show <wallet> --json` | Read the live publisher profile summary from the marketplace platform |
| `tonquant factor unsubscribe mom_30d_ton --json` | Remove a subscription |
| `tonquant signal backtest mom_30d_ton --start-date 2026-01-01 --end-date 2026-03-31 --json` | Re-run the legacy single-instrument backtest path |
| `tonquant factor compose --name "TON Blend" --components mom_30d_ton:0.6,vol_7d_ton:0.4 --json` | Build a weighted composite |
| `tonquant factor composites --json` | List saved composites |
| `tonquant factor composite ton_blend --json` | Show one composite |
| `tonquant factor composite-delete ton_blend --json` | Delete a composite |
| `tonquant factor alert-set mom_30d_ton --metric rankIcOosIcir --condition above --threshold 1.5 --json` | Set a factor-native alert |
| `tonquant factor alert-list --json` | List active alerts |
| `tonquant factor alert-remove mom_30d_ton --json` | Remove alerts for a factor |
| `tonquant factor report-submit mom_30d_ton --return 12.5 --period 30d --agent-id agent-1 --json` | Submit a live-performance report |
| `tonquant factor report-list --json` | List submitted reports |
| `tonquant factor skill-export --limit 5 --output skill/factors.md --json` | Export top factors as agent skill definitions |

### Platform-Publish Boundary

These commands are part of the CLI surface, but they sit at the boundary between the open-source CLI and hosted platform flows:

| Command | Purpose |
| --- | --- |
| `tonquant factor publish-prepare <factorId> --evaluation-file ./factor-evaluation.json --artifact-bundle ./factor.tgz --price-ton 3.5 --duration-days 30 --publisher-address <address> --output ./prepared.json --json` | Prepare a platform publish intent locally with pricing + artifact metadata |
| `tonquant factor publish-request-signature --prepared-file ./prepared.json --json` | Create a platform signing session and upload the staged artifact bundle |
| `tonquant factor publish-status <publicationId> --json` | Check publication review state |
| `tonquant factor payout-request-signature <factorSlug> --publisher-address <address> --payout-address <address> --json` | Create a payout-address signing session |

`tonquant factor publish-submit` and `tonquant factor payout-set` remain deprecated hidden aliases during the compatibility window.

Portal listing/detail/profile/checkout now load from the live platform contract. The remaining rollout gap is real TON smoke against configured infrastructure; deterministic tests and browser proof are landed, but they do not replace that environment-backed gate.

### Automation Appendix

| Command | Purpose |
| --- | --- |
| `tonquant automation schedule --help` | Schedule supported automation jobs |
| `tonquant automation list --json` | List automation jobs |
| `tonquant automation status <jobId> --json` | Show one job |
| `tonquant automation pause <jobId> --json` | Pause a job |
| `tonquant automation resume <jobId> --json` | Resume a job |
| `tonquant automation remove <jobId> --json` | Remove a job |
| `tonquant automation run-now --job <jobId> --json` | Trigger a job immediately |
| `tonquant daemon --once` | Run the foreground automation daemon once |

## Representative Agent Workflows

### 1. Research Before Trading

```bash
tonquant research quote BTC --json
tonquant research compare BTC --json
tonquant research candles BTC --provider okx --json
tonquant swap NOT TON 1000 --json
```

Use `research liquidity` only when you specifically need the deprecated TON pool/liquidity compatibility path.

### 2. Run a Quant Loop

```bash
tonquant data fetch TON/USDT --json
tonquant signal compute --signals rsi,macd --symbols TON/USDT --json
tonquant backtest run --strategy momentum --symbols TON/USDT --start-date 2026-01-01 --end-date 2026-03-31 --json
tonquant autoresearch init --title "TON momentum" --strategy momentum --symbols TON/USDT --start-date 2026-01-01 --end-date 2026-03-31 --json
```

Use `autoresearch run|status|promote|reject` after the track exists.

### 3. Discover, Validate, and Compose Factors

```bash
tonquant factor seed --json
tonquant factor discover --category momentum --min-icir 1 --min-tstat 2 --min-positive-share 0.55 --max-peer-corr 0.4 --json
tonquant factor evaluate --definition-file ./factor.json --liquidity-assumptions-file ./liquidity.json --cost-model-file ./cost.json --symbols AAPL,MSFT,NVDA,AMZN,META --n-trials 8 --output ./factor-evaluation.json --json
tonquant factor publish --name "My Factor" --category momentum --evaluation-file ./factor-evaluation.json --json
tonquant factor compose --name "TON Blend" --components mom_30d_ton:0.6,vol_7d_ton:0.4 --json
```

Use `factor top`, `alert-set`, and `report-submit` after validation if the workflow needs ranking, monitoring, or social proof.

## Factor Submission Contract

Marketplace publishing is factor-native and CLI-only. Portal preview, registry schema, publish gate, and `skill/SKILL.md` all assume the same contract.

Current canonical local compute entrypoint:

```bash
tonquant factor evaluate --definition-file ./factor.json --liquidity-assumptions-file ./liquidity.json --cost-model-file ./cost.json --symbols AAPL,MSFT,NVDA,AMZN,META --n-trials 8 --output ./factor-evaluation.json --json
```

This is the publish-time source of truth today. `tonquant factor ic`, `tonquant factor decay`, and `tonquant factor uniqueness` are local-only read models over the same evaluation path. `tonquant factor pull` is the separate paid-delivery path; it does not replace local `factor subscribe`. `tonquant factor author show` is the read-only live publisher profile surface.

The definition file must describe:

- `universe.assetClass`
- `universe.marketRegion`
- `universe.selectionRule`
- `universe.liquidityFloor`
- `universe.reconstitutionFrequency`
- `signalFormula`
- `signalDirection`
- structured `normalization`
- structured `neutralization`
- `rebalanceFrequency`
- `holdingHorizon`

The evaluation artifact must contain:

- `metrics.factorQuality.rankIcOosMean`
- `metrics.factorQuality.rankIcOosIcir`
- `metrics.factorQuality.rankIcOosTstat`
- `metrics.factorQuality.quantileSpreadQ5Q1`
- `metrics.factorQuality.icDecay`
- `metrics.factorQuality.oosIsRatio`
- `metrics.factorQuality.halfLifeDays`
- `metrics.factorQuality.deflatedRankIc`
- `metrics.factorQuality.nTrials`
- `metrics.factorQuality.stability.positivePeriodShare`
- `metrics.factorQuality.stability.worstSubperiodRankIc`
- `metrics.factorQuality.stability.subperiodCount`
- `metrics.factorQuality.stability.quantileMonotonicity`
- `metrics.factorQuality.stability.primaryHoldingBucket`
- `metrics.implementationProfile.turnoverTwoWay`
- `metrics.implementationProfile.capacityMethod`
- `metrics.implementationProfile.capacityValue`
- `metrics.implementationProfile.liquidityAssumptions`
- `metrics.implementationProfile.peerCorrelation`
- `provenance.trainPeriod`
- `provenance.validationPeriod`
- `provenance.testPeriod`
- `provenance.evaluationFrequency`
- `provenance.sampleCount`
- `provenance.averageUniverseSize`
- `provenance.pointInTime`
- `provenance.survivorshipBiasControlled`
- `provenance.costModel`
- `provenance.codeVersion`

Optional:

- `referenceBacktest`

Forbidden in factor headline / factor-quality fields:

- `Sharpe`
- `Calmar`
- `Sortino`
- `WinRate`
- `YTD`
- benchmark-relative `IR`

Marketplace minimum bars:

- `metrics.factorQuality.rankIcOosIcir >= 0.5`
- `metrics.factorQuality.rankIcOosTstat >= 2.0`
- `metrics.factorQuality.oosIsRatio >= 0.5`
- `metrics.factorQuality.rankIcOosMean >= 0.02` is acceptable; `>= 0.05` is strong

These are marketplace-quality bars, not a promise that every local experiment should pass them.

Marketplace warnings are softer for `halfLifeDays`, `deflatedRankIc`, `stability.worstSubperiodRankIc`, and `capacityValue`. Disclosure is mandatory, but calibration stays soft until more real submissions accumulate.

Sample adequacy gate:

- daily OOS evaluation: at least `252` observations
- weekly OOS evaluation: at least `52` observations
- monthly OOS evaluation: at least `24` observations
- average cross-sectional universe size: at least `50`

If sample adequacy fails, `factor publish-prepare` and platform review reject the submission as statistically incomplete. That is a contract failure, not a judgment that the factor is bad.

Deflation disclosure:

- Marketplace-facing factor claims must disclose how many materially different variants or trials were tested before publication.
- Publishers must disclose trial count via `--n-trials` on `tonquant factor evaluate`.
- `factor evaluate` also requires structured `--liquidity-assumptions-file` and `--cost-model-file` inputs so the artifact carries market-specific execution assumptions instead of freeform text.
- Backend computes `metrics.factorQuality.deflatedRankIc` as a trial-adjusted IC lower bound using the disclosed `nTrials` and observed sample count.
- `factor publish`, `factor publish-prepare`, and platform publish-session creation reject artifacts missing `halfLifeDays`, `deflatedRankIc`, or `nTrials`.
- Do not omit trial-count context when presenting unusually strong IC / ICIR numbers.

Cost disclosure:

- `provenance.costModel` is required and must be structured by market type (`equity`, `crypto`, `ton-defi`, or `generic`).
- `metrics.implementationProfile.liquidityAssumptions` is required and must carry structured market-specific execution assumptions.
- Portal and marketplace copy must treat these as **disclosed assumptions**, not hidden platform defaults.

## Security and Boundaries

- Never log or echo mnemonic phrases, private keys, or seed data.
- `tonquant init` stores mnemonic material encrypted at `~/.tonquant/config.json` with `0600` permissions.
- `swap --execute` is not a production-ready flow in this pass; treat swap commands as simulation-first unless the CLI contract explicitly changes.
- The open-source repo is the source of truth for:
  - CLI behavior
  - JSON envelopes
  - schemas and local workflow contracts
  - local registry / artifact state
- Hosted publish, review, signer, or settlement surfaces can evolve separately from the local CLI contract. Do not assume every remote service behavior is frozen just because the local command exists.

## Error Handling Expectations

- Expect domain-specific `code` values such as market/provider validation failures, wallet configuration errors, or `NOT_IMPLEMENTED`.
- Keep failure handling branchy and explicit:
  - recoverable contract error -> inspect `code`
  - missing JSON or process failure -> treat as environment/runtime failure
- Prefer rerunning the exact command with `--help` when a command shape or option set is uncertain.

## Companion Surfaces

- GitHub repo: `https://github.com/Ancienttwo/ton-quant`
- Website: `https://tonquant.com`
- PI package for IDE-side factor mining: `packages/pi-autoresearch/README.md`

Use the CLI as the stable command contract. Treat the website as summary/entrypoint material, not the authoritative long-form command reference.

## Optional Official Integrations

TonQuant uses OKX public read-only market APIs directly for `research quote|search|compare|candles`. It still does not bundle the official OKX toolkit. If you want the official OKX exchange-native market/account/trade surface, install that tool yourself and then call it through TonQuant:

```bash
# Official OKX CLI
npm install -g @okx_ai/okx-trade-cli

# Or official OKX skills
npx skills add okx/agent-skills

# TonQuant unified entrypoint
tonquant okx market ticker BTC-USDT --json
```
