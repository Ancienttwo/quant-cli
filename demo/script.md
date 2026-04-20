# TonQuant Demo Video Script

> **Duration**: ~2 minutes
> **Format**: Terminal recording (asciinema) + voice-over or text overlay
> **Goal**: Show Agent-Native Factor Marketplace — browse, compose, and research quant factors on TON

---

## Scene 1: Title + Help (15s)

**Text overlay:**
> "TonQuant — Agent-Native Research and Factor Marketplace for TON"

**Terminal:**
```bash
$ tonquant --help
```
Show the full command list — Phase 0 (market), Phase 1 (quant), Phase 2 (marketplace).
Show the full command list — support research, quant, and marketplace surfaces.

---

## Scene 2: Research Check (15s)

**Text overlay:**
> "Step 1: Check public market truth and TON liquidity"

**Terminal:**
```bash
$ tonquant research quote BTC
$ tonquant research liquidity TON
$ tonquant trending --limit 5
```

Quick visual of public-market quote data plus TON liquidity context.

---

## Scene 3: Factor Marketplace (30s)

**Text overlay:**
> "Step 2: Browse the Factor Marketplace"

**Terminal:**
```bash
$ tonquant factor seed
$ tonquant factor top --limit 5
$ tonquant factor discover --category momentum --min-icir 1.0 --max-peer-corr 0.4
```

**Key moments:**
1. `factor seed` populates the registry with 15 built-in factors
2. `factor top` shows the leaderboard ranked by factor-native metrics
3. `factor discover` filters momentum factors above ICIR 1.0 with peer-correlation guardrails

---

## Scene 4: Durable Autoresearch (30s)

**Text overlay:**
> "Step 3: Initialize a track, run it, and inspect the candidate."

**Terminal:**
```bash
$ tonquant autoresearch init --title 'TON Momentum Demo' --strategy momentum --symbols TON/USDT --start-date 2026-01-01 --end-date 2026-03-31 --track ton-momentum-demo
$ tonquant autoresearch run --track ton-momentum-demo --iterations 1
$ tonquant autoresearch status --track ton-momentum-demo
```

**Key moments:**
1. Track initializes with normalized strategy, symbol, and date-range metadata
2. `run` produces one durable iteration against that track
3. `status` shows the baseline, latest run summary, and candidate state
4. Viewer sees that autoresearch is now a reviewable lifecycle, not a one-shot command

**Pause 2s on the final output** so viewer can read the recommendation.

---

## Scene 5: Factor Composition + JSON (20s)

**Text overlay:**
> "Step 4: Compose factors. Structured JSON for any AI Agent."

**Terminal:**
```bash
$ tonquant factor compose --name 'Momentum+Vol' --components mom_30d_ton:0.6,vol_30d_ton:0.4
$ tonquant factor compose --name 'Momentum+Vol' --components mom_30d_ton:0.6,vol_30d_ton:0.4 --force --json
```

**Key moments:**
1. Human-readable output: composite name, components with weights, derived backtest
2. JSON envelope: `{ status: "ok", data: { ... } }` — structured for agents

---

## Closing (10s)

**Text overlay:**
> "TonQuant — from zero to quant research in one command"
>
> bun install -g tonquant
> tonquant.com
> github.com/Ancienttwo/ton-quant

---

## Recording Notes

- Use a clean terminal with dark background matching DESIGN.md (#0A0E14)
- Font: JetBrains Mono, 14-16px
- Terminal width: 120+ columns for table formatting
- Run `factor seed` before `factor top/discover` to populate the registry
- If using asciinema: `asciinema rec demo/recording.cast --cols 120 --rows 38`
- Speed up wait times in post-production (2x for network calls)
- Total raw recording: ~3-4 minutes, edit down to ~2 minutes
