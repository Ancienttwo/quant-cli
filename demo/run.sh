#!/bin/bash
# TonQuant Demo Runner — Phase 2: Factor Marketplace
# Usage: ./demo/run.sh
# Records with asciinema if available, otherwise just runs the demo.
#
# Tip: Run in a terminal with dark background (#0A0E14) and JetBrains Mono font.

set -e

DELAY=1.5  # seconds between commands
TYPE_DELAY=0.03  # seconds between characters

# Simulate typing a command
type_cmd() {
  local cmd="$1"
  printf "\n\033[1;33m\$\033[0m "
  for (( i=0; i<${#cmd}; i++ )); do
    printf "%s" "${cmd:$i:1}"
    sleep $TYPE_DELAY
  done
  printf "\n"
  sleep 0.3
}

# Run a command with typing effect
run() {
  type_cmd "$1"
  eval "$1"
  sleep "$DELAY"
}

# Section header
section() {
  printf "\n\033[1;36m━━━ %s ━━━\033[0m\n" "$1"
  sleep 1
}

clear

# Title
printf "\n"
printf "  \033[1;36m╔══════════════════════════════════════════════╗\033[0m\n"
printf "  \033[1;36m║\033[0m  \033[1;37mTonQuant\033[0m — Agent-Native Factor Marketplace  \033[1;36m║\033[0m\n"
printf "  \033[1;36m║\033[0m  \033[2mTON AI Agent Hackathon · Track 1\033[0m            \033[1;36m║\033[0m\n"
printf "  \033[1;36m╚══════════════════════════════════════════════╝\033[0m\n"
sleep 2

# Scene 1: Help
section "Available Commands"
run "tonquant --help"

# Scene 2: Research Check
section "Research Check"
run "tonquant research quote BTC"
run "tonquant research liquidity TON"
run "tonquant trending --limit 5"

# Scene 3: Factor Marketplace
section "Factor Marketplace"
printf "\n\033[2m  Browse, discover, and compose quant factors\033[0m\n"
sleep 1
run "tonquant factor seed"
run "tonquant factor top --limit 5"
run "tonquant factor discover --category momentum --min-icir 1.0 --max-peer-corr 0.4"

# Scene 4: Durable Autoresearch
section "Durable Autoresearch"
printf "\n\033[2m  Initialize a track, run an iteration, then inspect the result\033[0m\n"
sleep 1
run "tonquant autoresearch init --title 'TON Momentum Demo' --strategy momentum --symbols TON/USDT --start-date 2026-01-01 --end-date 2026-03-31 --track ton-momentum-demo"
run "tonquant autoresearch run --track ton-momentum-demo --iterations 1"
run "tonquant autoresearch status --track ton-momentum-demo"

# Scene 5: Factor Composition + JSON
section "Factor Composition"
printf "\n\033[2m  Blend factors with custom weights → structured JSON for agents\033[0m\n"
sleep 1
run "tonquant factor compose --name 'Momentum+Vol' --components mom_30d_ton:0.6,vol_30d_ton:0.4"
run "tonquant factor compose --name 'Momentum+Vol' --components mom_30d_ton:0.6,vol_30d_ton:0.4 --force --json"

# Closing
printf "\n"
printf "  \033[1;36m╔══════════════════════════════════════════════╗\033[0m\n"
printf "  \033[1;36m║\033[0m                                              \033[1;36m║\033[0m\n"
printf "  \033[1;36m║\033[0m  \033[1;37mbun install -g tonquant\033[0m                     \033[1;36m║\033[0m\n"
printf "  \033[1;36m║\033[0m  \033[2mhttps://tonquant.com\033[0m                        \033[1;36m║\033[0m\n"
printf "  \033[1;36m║\033[0m                                              \033[1;36m║\033[0m\n"
printf "  \033[1;36m╚══════════════════════════════════════════════╝\033[0m\n"
printf "\n"
sleep 3
