---
name: tonquant-autoresearch-create
description: Set up PI-native TonQuant factor mining on top of upstream pi-autoresearch. Use when asked to mine factors, tune factor logic, optimize factor-native quality metrics, or run an IDE autoresearch loop for TonQuant.
---

# TonQuant PI Autoresearch

Use this skill when the user wants PI to mine factors or tune factor/backtest logic inside the IDE.

This skill assumes upstream `pi-autoresearch` is already installed and its tools are available:

- `init_experiment`
- `run_experiment`
- `log_experiment`

If those tools are missing, stop and tell the user to install upstream `pi-autoresearch` first.

## Mode Selection

Pick the mode deterministically from the user request:

- Use **autoreason mode** when the request mentions `autoreason`, `self-refinement`, `A/B/AB`, `adversarial revision`, or an explicit desire to keep the incumbent as a first-class candidate.
- Otherwise use **standard mode** with the existing single-definition benchmark template.

## Goal

Use upstream `pi-autoresearch` as the experiment loop runtime, but configure it for TonQuant factor mining:

- primary metric: `rankIcOosIcir` (`higher`)
- secondary metrics:
  - `rankIcOosMean` (`higher`)
  - `rankIcOosTstat` (`higher`)
  - `quantileSpreadQ5Q1` (`higher`)
  - `turnoverTwoWay` (`lower`)
  - `peerCorrelationMaxAbs` (`lower`)

`tonquant autoresearch` is a separate CLI feature. Do not repurpose it here. This skill is for IDE-side experimentation only.

## Setup

1. Infer or ask for:
   - target strategy or factor
   - symbols / market / provider
   - date range
   - files in scope
   - hard constraints
2. Read the relevant TonQuant files before writing anything.
3. Create a branch:

```bash
git checkout -b autoresearch/<goal>-<date>
```

4. Write the session files using the template pair for the selected mode:
   - standard mode:
     - `autoresearch.md` from `../../templates/autoresearch.md`
     - `autoresearch.sh` from `../../templates/autoresearch.sh`
   - autoreason mode:
     - `autoresearch.md` from `../../templates/autoresearch.autoreason.md`
     - `autoresearch.sh` from `../../templates/autoresearch.autoreason.sh`
5. Configure the generated `autoresearch.sh` for the selected mode:
   - standard mode:
     - set `TONQUANT_EVALUATE_CMD` to the exact `tonquant factor evaluate ... --json` workload for this session
     - keep the output as JSON so the template can extract metrics
   - autoreason mode:
     - set `TONQUANT_EVALUATE_CMD_TEMPLATE` to the exact `tonquant factor evaluate ... --json` workload, replacing the definition path with `{definition_file}`
     - set `TONQUANT_AUTOREASON_INCUMBENT_FILE` to the tracked factor definition path
     - keep challengers under `.autoreason/candidate-b.json` and `.autoreason/candidate-ab.json`
     - keep the default guardrails unless the user explicitly asks to change them
6. Write `autoresearch.checks.sh` only when the session may edit tracked repo code.
   - use `../../templates/autoresearch.checks.sh`
   - keep the skip logic for autoresearch/session-only edits
7. Commit the session files.
8. Call `init_experiment`:
   - `name`: concise factor-mining session name
   - `metric_name`: `rankIcOosIcir`
   - `metric_unit`: ``
   - `direction`: `higher`
9. Run the baseline with:

```text
run_experiment({ command: "bash autoresearch.sh" })
```

10. Call `log_experiment` using the parsed metrics from the benchmark output.

## TonQuant-Specific Rules

- Keep file scope narrow:
  - factor logic
  - backtest logic
  - presets / strategy params
  - quant backend handlers directly relevant to the factor hypothesis
- Do not drift into support-command work (`research`, `swap`, wallet, etc.) unless the user explicitly wants that.
- Do not rename CLI contracts during the loop.
- Treat sample adequacy as a viability gate.
  - discard runs where `sampleCount` or `averageUniverseSize` fall below the factor submission contract
- Treat turnover and peer correlation as guardrails.
  - a slightly better ICIR is not enough if turnover explodes or uniqueness collapses
- In autoreason mode, keep the incumbent tracked definition as `A` and write challengers only under `.autoreason/`.
  - only the winner may be copied back into the tracked factor file
  - if `WINNER A` appears twice in a row, stop the loop and finalize or start a new hypothesis
- Use `asi` in `log_experiment` to record:
  - hypothesis
  - why a run was kept/discarded
  - which metric moved and why
  - whether the change is suitable for later durable-track validation via `tonquant autoresearch`

## Suggested Benchmark Shapes

Use a pattern like this for `TONQUANT_EVALUATE_CMD`:

```bash
tonquant factor evaluate --definition-file ./factor.json --liquidity-assumptions-file ./liquidity.json --cost-model-file ./cost.json --symbols AAPL,MSFT,NVDA,AMZN,META --json
```

In autoreason mode, write the corresponding template command as:

```bash
export TONQUANT_EVALUATE_CMD_TEMPLATE='tonquant factor evaluate --definition-file {definition_file} --liquidity-assumptions-file ./liquidity.json --cost-model-file ./cost.json --symbols AAPL,MSFT,NVDA,AMZN,META --json'
```

If the loop stabilizes on a promising result, the follow-up path is:

1. run the durable CLI track flow separately with `tonquant autoresearch init|run|status`
2. use `promote|reject` there for reviewable candidate management

## Keep / Discard Heuristics

- Keep:
  - ICIR improves
  - sample adequacy stays viable
  - turnover and peer correlation do not regress unacceptably
  - checks pass when tracked code changed
- Discard:
  - ICIR is flat or worse
  - improvements are driven by pathological sample collapse
  - uniqueness collapses or turnover balloons without an explicit user-approved tradeoff
  - checks fail

## Resume

On resume, read:

- `autoresearch.md`
- `autoresearch.jsonl`
- `.autoreason/` when autoreason mode is active
- relevant TonQuant files in scope

Then continue the upstream `pi-autoresearch` loop without redefining the session unless the benchmark target changed.
