# @tonquant/pi-autoresearch

PI-native factor-mining layer for TonQuant.

This package does not replace `tonquant autoresearch`. The CLI command group remains the durable quant track lifecycle for candidate review, promotion, rejection, automation, and artifact persistence.

This package teaches PI how to run IDE-side factor mining on top of upstream `pi-autoresearch`, using `tonquant factor evaluate` with structured liquidity and cost inputs as the benchmark substrate.

## Prerequisites

```bash
npm install -g tonquant
npm install -g @mariozechner/pi-coding-agent
pi install git:github.com/davebcn87/pi-autoresearch
```

Published install target for this package:

```bash
pi install npm:@tonquant/pi-autoresearch
```

Until that release exists, you can install the skill from a repo checkout:

```bash
mkdir -p ~/.pi/agent/skills
cp -R packages/pi-autoresearch/skills/tonquant-autoresearch-create ~/.pi/agent/skills/
```

## Recommended Workflow

1. Open the TonQuant repo in PI.
2. Run `/skill:tonquant-autoresearch-create`.
3. Let the skill write:
   - `autoresearch.md`
   - `autoresearch.sh`
   - optional `autoresearch.checks.sh`
4. Let upstream `pi-autoresearch` drive the loop with:
  - primary metric: `rankIcOosIcir` (`higher`)
  - secondary metrics: `rankIcOosMean`, `rankIcOosTstat`, `quantileSpreadQ5Q1`, `turnoverTwoWay`, `peerCorrelationMaxAbs`
5. Use upstream `/skill:autoresearch-finalize` when you want to split kept changes into reviewable branches.

## Autoreason Mode

The skill has an experimental autoreason mode for factor mining.

Choose it when the user explicitly asks for:

- `autoreason`
- `self-refinement`
- `A/B/AB`
- adversarial revision with a synthesis pass

Autoreason mode still writes the same PI session filenames:

- `autoresearch.md`
- `autoresearch.sh`
- optional `autoresearch.checks.sh`

What changes is the generated content:

- tracked factor definition stays the incumbent `A`
- challengers live under `.autoreason/candidate-b.json` and `.autoreason/candidate-ab.json`
- `autoresearch.sh` evaluates `A`, `B`, and `AB` with `tonquant factor evaluate` plus structured liquidity/cost assumptions
- only the winning challenger is copied back into the tracked factor file
- if `A` wins two consecutive iterations, the script emits `AUTOREASON_STOP incumbent-won-twice`

The judge stays numeric and local. There is no LLM judge panel in v1.

## Relationship To TonQuant CLI Autoresearch

- Use `tonquant autoresearch init|run|status|promote|reject` when you want durable track state under `~/.tonquant/quant/autoresearch/`.
- Use this PI package when you want fast IDE-side factor mining loops that mutate code, benchmark with `tonquant factor evaluate`, and keep or discard changes via upstream `pi-autoresearch`.

## Package Contents

- `skills/tonquant-autoresearch-create/SKILL.md`
  - TonQuant-specific PI setup instructions
- `templates/autoresearch.md`
  - session-document starter tuned for factor mining
- `templates/autoresearch.sh`
  - benchmark template that emits parseable `METRIC` lines from TonQuant backtest JSON
- `templates/autoresearch.autoreason.md`
  - autoreason-mode session document with `A / B / AB` editing rules and stop conditions
- `templates/autoresearch.autoreason.sh`
  - autoreason-mode benchmark template that evaluates incumbent and challengers, picks a winner, and promotes only the winning challenger
- `templates/autoresearch.checks.sh`
  - TonQuant correctness-gate template with repo-aware skip logic
