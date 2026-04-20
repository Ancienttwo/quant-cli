# Autoresearch: <factor-mining-goal>

## Objective

Optimize TonQuant factor behavior inside PI using upstream `pi-autoresearch`, with `tonquant factor evaluate --json` as the benchmark substrate.

## Metrics

- **Primary**: `rankIcOosIcir` (`higher` is better)
- **Secondary**:
  - `rankIcOosMean` (`higher`)
  - `rankIcOosTstat` (`higher`)
  - `quantileSpreadQ5Q1` (`higher`)
  - `turnoverTwoWay` (`lower`)
  - `peerCorrelationMaxAbs` (`lower`)

## How To Run

`bash autoresearch.sh`

The script must print parseable metric lines:

```text
METRIC rankIcOosIcir=1.42
METRIC rankIcOosMean=0.034
METRIC rankIcOosTstat=2.4
METRIC quantileSpreadQ5Q1=0.012
METRIC turnoverTwoWay=0.21
METRIC peerCorrelationMaxAbs=0.28
```

## Files In Scope

- list every factor, preset, backtest, or quant backend file the loop may edit

## Off Limits

- support-command files unless the user explicitly expands scope
- durable CLI track files under `~/.tonquant/quant/autoresearch/`
- automation contracts and event schemas unless the user explicitly wants them changed

## Constraints

- no CLI contract renames
- keep the benchmark JSON-backed and reproducible
- when tracked repo code changes, `autoresearch.checks.sh` must pass before a run is kept
- prefer small, reviewable changes over broad rewrites

## What's Been Tried

- baseline:
- kept changes:
- discarded ideas:
- drawdown / trade-count failure modes:
- follow-up ideas:
