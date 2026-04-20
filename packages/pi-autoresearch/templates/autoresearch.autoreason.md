# Autoresearch (Autoreason Mode): <factor-mining-goal>

## Objective

Optimize a TonQuant factor inside PI using an autoreason-style loop:

- incumbent tracked factor = `A`
- adversarial challenger in `.autoreason/candidate-b.json` = `B`
- synthesized challenger in `.autoreason/candidate-ab.json` = `AB`

The judge stays objective and local: `tonquant factor evaluate --json`.

## Editing Protocol

1. Keep the tracked factor definition file as the current incumbent `A`.
2. Write challenger `B` to `.autoreason/candidate-b.json`.
3. Write challenger `AB` to `.autoreason/candidate-ab.json`.
4. Run `bash autoresearch.sh`.
5. Read the winner line:
   - `WINNER A` means the incumbent held; no tracked factor promotion happened.
   - `WINNER B` means the adversarial challenger won and was copied into the tracked factor file.
   - `WINNER AB` means the synthesized challenger won and was copied into the tracked factor file.
6. If the script prints `AUTOREASON_STOP incumbent-won-twice`, stop iterating and finalize or start a new hypothesis.

## Judge Contract

- Primary metric: `rankIcOosIcir` (`higher`)
- Secondary metrics:
  - `rankIcOosMean` (`higher`)
  - `rankIcOosTstat` (`higher`)
  - `quantileSpreadQ5Q1` (`higher`)
  - `turnoverTwoWay` (`lower`)
  - `peerCorrelationMaxAbs` (`lower`)

Challenge gates:

- challengers must pass sample adequacy
- challengers must improve ICIR by at least `0.02`
- challengers must not worsen turnover by more than `15%`
- challengers must not worsen max peer correlation by more than `0.05`
- if both challengers fail, `A` wins

## Environment Variables

- `TONQUANT_EVALUATE_CMD_TEMPLATE`
  - full command containing `{definition_file}`
- `TONQUANT_AUTOREASON_INCUMBENT_FILE`
  - tracked factor definition path
- `TONQUANT_AUTOREASON_SCRATCH_DIR`
  - defaults to `.autoreason`
- `TONQUANT_AUTOREASON_MIN_ICIR_DELTA`
  - defaults to `0.02`
- `TONQUANT_AUTOREASON_MAX_TURNOVER_REGRESSION_PCT`
  - defaults to `15`
- `TONQUANT_AUTOREASON_MAX_PEER_CORR_DELTA`
  - defaults to `0.05`

## How To Run

`bash autoresearch.sh`

The script prints parseable output like:

```text
WINNER AB
METRIC rankIcOosIcir=1.42
METRIC rankIcOosMean=0.034
METRIC rankIcOosTstat=2.4
METRIC quantileSpreadQ5Q1=0.012
METRIC turnoverTwoWay=0.21
METRIC peerCorrelationMaxAbs=0.28
```

## Files In Scope

- tracked factor definition file for `A`
- `.autoreason/candidate-b.json`
- `.autoreason/candidate-ab.json`
- any narrow factor/backtest/preset files the user explicitly puts in scope

## Off Limits

- support-command files unless the user explicitly expands scope
- durable CLI track files under `~/.tonquant/quant/autoresearch/`
- automation contracts and event schemas unless the user explicitly wants them changed

## Constraints

- no CLI contract renames
- keep the benchmark JSON-backed and reproducible
- when tracked repo code changes, `autoresearch.checks.sh` must pass before a run is kept
- only the winning challenger may overwrite the tracked factor file
- prefer small, reviewable changes over broad rewrites

## What's Been Tried

- baseline:
- kept changes:
- discarded ideas:
- adequacy failures:
- guardrail failures:
- follow-up ideas:
