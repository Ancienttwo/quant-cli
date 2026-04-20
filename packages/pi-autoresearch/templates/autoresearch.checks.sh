#!/usr/bin/env bash
set -euo pipefail

CHANGED_FILES="$(git status --short --untracked-files=normal | sed 's/^.. //')"

if [ -z "$CHANGED_FILES" ]; then
  echo "No tracked changes detected; skipping TonQuant verification."
  exit 0
fi

CODE_CHANGES="$(
  printf '%s\n' "$CHANGED_FILES" \
    | grep -Ev '^(autoresearch(\.jsonl|\.md|\.ideas\.md|\.sh|\.checks\.sh)|packages/pi-autoresearch/(README\.md|skills/|templates/))' \
    || true
)"

if [ -z "$CODE_CHANGES" ]; then
  echo "No tracked code changes outside autoresearch session files; skipping TonQuant verification."
  exit 0
fi

TEST_HOME="${TONQUANT_TEST_HOME:-$(mktemp -d "${TMPDIR:-/tmp}/tonquant-pi-checks-XXXXXX")}"

cleanup() {
  if [ -z "${TONQUANT_TEST_HOME:-}" ]; then
    rm -rf "$TEST_HOME"
  fi
}

trap cleanup EXIT

bun typecheck
bun lint
HOME="$TEST_HOME" bun test --max-concurrency 1 --path-ignore-patterns '_ref/**'
