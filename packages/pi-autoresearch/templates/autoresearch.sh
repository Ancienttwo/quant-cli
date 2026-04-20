#!/usr/bin/env bash
set -euo pipefail

RESULT_JSON="$(mktemp "${TMPDIR:-/tmp}/tonquant-pi-autoresearch-result-XXXXXX.json")"
LIQUIDITY_JSON="$(mktemp "${TMPDIR:-/tmp}/tonquant-pi-liquidity-XXXXXX.json")"
COST_JSON="$(mktemp "${TMPDIR:-/tmp}/tonquant-pi-cost-XXXXXX.json")"

cat >"${LIQUIDITY_JSON}" <<'JSON'
{"marketType":"equity","executionLagBars":1,"advParticipationPct":0.05,"slippageBps":10,"notes":"PI autoresearch default liquidity assumptions"}
JSON

cat >"${COST_JSON}" <<'JSON'
{"marketType":"equity","included":true,"executionLagBars":1,"feeBps":2,"slippageModel":"fixed_bps","notes":"PI autoresearch default cost model"}
JSON

EVALUATE_CMD="${TONQUANT_EVALUATE_CMD:-tonquant factor evaluate --definition-file ./factor.json --liquidity-assumptions-file ${LIQUIDITY_JSON} --cost-model-file ${COST_JSON} --symbols AAPL,MSFT,NVDA,AMZN,META --json}"

cleanup() {
  rm -f "$RESULT_JSON" "$LIQUIDITY_JSON" "$COST_JSON"
}

trap cleanup EXIT

sh -c "$EVALUATE_CMD" >"$RESULT_JSON"

node - "$RESULT_JSON" <<'NODE'
const fs = require("node:fs");

const resultPath = process.argv[2];
const envelope = JSON.parse(fs.readFileSync(resultPath, "utf8"));
const payload = envelope && envelope.status === "ok" ? envelope.data : envelope;

if (!payload || typeof payload !== "object") {
  throw new Error("Expected a TonQuant backtest JSON payload.");
}

const evaluation = payload.evaluation ?? payload;

const metrics = {
  rankIcOosIcir: Number(evaluation.metrics?.factorQuality?.rankIcOosIcir ?? 0),
  rankIcOosMean: Number(evaluation.metrics?.factorQuality?.rankIcOosMean ?? 0),
  rankIcOosTstat: Number(evaluation.metrics?.factorQuality?.rankIcOosTstat ?? 0),
  quantileSpreadQ5Q1: Number(evaluation.metrics?.factorQuality?.quantileSpreadQ5Q1 ?? 0),
  turnoverTwoWay: Number(evaluation.metrics?.implementationProfile?.turnoverTwoWay ?? 0),
  peerCorrelationMaxAbs: Number(
    evaluation.metrics?.implementationProfile?.peerCorrelation?.maxAbs ?? 0,
  ),
};

for (const [name, value] of Object.entries(metrics)) {
  if (!Number.isFinite(value)) {
    throw new Error(`Expected numeric metric for ${name}.`);
  }
  console.log(`METRIC ${name}=${value}`);
}
NODE
