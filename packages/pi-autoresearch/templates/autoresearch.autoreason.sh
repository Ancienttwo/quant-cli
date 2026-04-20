#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${TONQUANT_AUTOREASON_INCUMBENT_FILE:-}" ]]; then
  echo "TONQUANT_AUTOREASON_INCUMBENT_FILE is required." >&2
  exit 1
fi

if [[ -z "${TONQUANT_EVALUATE_CMD_TEMPLATE:-}" ]]; then
  echo "TONQUANT_EVALUATE_CMD_TEMPLATE is required." >&2
  exit 1
fi

if [[ "${TONQUANT_EVALUATE_CMD_TEMPLATE}" != *"{definition_file}"* ]]; then
  echo "TONQUANT_EVALUATE_CMD_TEMPLATE must contain {definition_file}." >&2
  exit 1
fi

SCRATCH_DIR="${TONQUANT_AUTOREASON_SCRATCH_DIR:-.autoreason}"
INCUMBENT_FILE="${TONQUANT_AUTOREASON_INCUMBENT_FILE}"
MIN_ICIR_DELTA="${TONQUANT_AUTOREASON_MIN_ICIR_DELTA:-0.02}"
MAX_TURNOVER_REGRESSION_PCT="${TONQUANT_AUTOREASON_MAX_TURNOVER_REGRESSION_PCT:-15}"
MAX_PEER_CORR_DELTA="${TONQUANT_AUTOREASON_MAX_PEER_CORR_DELTA:-0.05}"
B_FILE="${SCRATCH_DIR}/candidate-b.json"
AB_FILE="${SCRATCH_DIR}/candidate-ab.json"
STATE_FILE="${SCRATCH_DIR}/judge-state.json"
STOP_FILE="${SCRATCH_DIR}/stop-reason.txt"
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/tonquant-pi-autoreason-XXXXXX")"

cleanup() {
  rm -rf "${TMP_ROOT}"
}

trap cleanup EXIT

mkdir -p "${SCRATCH_DIR}"

evaluate_candidate() {
  local label="$1"
  local definition_file="$2"
  local result_json="${TMP_ROOT}/${label}.result.json"
  local summary_json="${TMP_ROOT}/${label}.summary.json"
  local escaped_file
  local command

  if [[ ! -f "${definition_file}" ]]; then
    node - "${label}" "${summary_json}" <<'NODE'
const fs = require("node:fs");
const label = process.argv[2];
const summaryPath = process.argv[3];
fs.writeFileSync(
  summaryPath,
  JSON.stringify({
    label,
    present: false,
    eligible: false,
    reasons: ["missing-definition-file"],
  }),
);
NODE
    return 0
  fi

  escaped_file="$(printf '%q' "${definition_file}")"
  command="${TONQUANT_EVALUATE_CMD_TEMPLATE//\{definition_file\}/${escaped_file}}"
  sh -c "${command}" >"${result_json}"

  node - "${label}" "${result_json}" "${summary_json}" <<'NODE'
const fs = require("node:fs");

const label = process.argv[2];
const resultPath = process.argv[3];
const summaryPath = process.argv[4];
const envelope = JSON.parse(fs.readFileSync(resultPath, "utf8"));
const payload = envelope && envelope.status === "ok" ? envelope.data : envelope;

if (!payload || typeof payload !== "object") {
  throw new Error(`Expected a TonQuant factor evaluation payload for ${label}.`);
}

const evaluation = payload.evaluation ?? payload;
const frequency = String(evaluation.provenance?.evaluationFrequency ?? "daily").toLowerCase();
const sampleCount = Number(evaluation.provenance?.sampleCount ?? 0);
const averageUniverseSize = Number(evaluation.provenance?.averageUniverseSize ?? 0);
const minSampleCount = frequency.includes("week")
  ? 52
  : frequency.includes("month")
    ? 24
    : 252;
const sampleAdequate = sampleCount >= minSampleCount && averageUniverseSize >= 50;

const summary = {
  label,
  present: true,
  eligible: sampleAdequate,
  reasons: sampleAdequate ? [] : ["sample-adequacy"],
  sampleCount,
  averageUniverseSize,
  evaluationFrequency: frequency,
  minSampleCount,
  metrics: {
    rankIcOosIcir: Number(evaluation.metrics?.factorQuality?.rankIcOosIcir ?? 0),
    rankIcOosMean: Number(evaluation.metrics?.factorQuality?.rankIcOosMean ?? 0),
    rankIcOosTstat: Number(evaluation.metrics?.factorQuality?.rankIcOosTstat ?? 0),
    quantileSpreadQ5Q1: Number(evaluation.metrics?.factorQuality?.quantileSpreadQ5Q1 ?? 0),
    turnoverTwoWay: Number(evaluation.metrics?.implementationProfile?.turnoverTwoWay ?? 0),
    peerCorrelationMaxAbs: Number(
      evaluation.metrics?.implementationProfile?.peerCorrelation?.maxAbs ?? 0,
    ),
  },
};

for (const value of Object.values(summary.metrics)) {
  if (!Number.isFinite(value)) {
    throw new Error(`Expected numeric metrics for ${label}.`);
  }
}

fs.writeFileSync(summaryPath, JSON.stringify(summary));
NODE
}

evaluate_candidate "A" "${INCUMBENT_FILE}"
evaluate_candidate "B" "${B_FILE}"
evaluate_candidate "AB" "${AB_FILE}"

node - \
  "${TMP_ROOT}/A.summary.json" \
  "${TMP_ROOT}/B.summary.json" \
  "${TMP_ROOT}/AB.summary.json" \
  "${INCUMBENT_FILE}" \
  "${B_FILE}" \
  "${AB_FILE}" \
  "${STATE_FILE}" \
  "${STOP_FILE}" \
  "${MIN_ICIR_DELTA}" \
  "${MAX_TURNOVER_REGRESSION_PCT}" \
  "${MAX_PEER_CORR_DELTA}" <<'NODE'
const fs = require("node:fs");

const [
  aSummaryPath,
  bSummaryPath,
  abSummaryPath,
  incumbentPath,
  bPath,
  abPath,
  statePath,
  stopPath,
  minIcirDeltaRaw,
  maxTurnoverRegressionPctRaw,
  maxPeerCorrDeltaRaw,
] = process.argv.slice(2);

const readJson = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const summaries = {
  A: readJson(aSummaryPath),
  B: readJson(bSummaryPath),
  AB: readJson(abSummaryPath),
};

if (!summaries.A.present || !summaries.A.eligible) {
  throw new Error("Incumbent A must exist and pass sample adequacy before autoreason judging.");
}

const minIcirDelta = Number(minIcirDeltaRaw);
const maxTurnoverRegressionPct = Number(maxTurnoverRegressionPctRaw);
const maxPeerCorrDelta = Number(maxPeerCorrDeltaRaw);
const incumbent = summaries.A;
const maxTurnover = incumbent.metrics.turnoverTwoWay * (1 + maxTurnoverRegressionPct / 100);
const maxPeerCorrelation = incumbent.metrics.peerCorrelationMaxAbs + maxPeerCorrDelta;

function challengerEligibility(summary) {
  if (!summary.present) {
    return { eligible: false, reasons: ["missing-definition-file"] };
  }

  const reasons = [...summary.reasons];
  if (!summary.eligible) {
    return { eligible: false, reasons };
  }

  if (summary.metrics.rankIcOosIcir < incumbent.metrics.rankIcOosIcir + minIcirDelta) {
    reasons.push("insufficient-icir-uplift");
  }
  if (summary.metrics.turnoverTwoWay > maxTurnover) {
    reasons.push("turnover-regression");
  }
  if (summary.metrics.peerCorrelationMaxAbs > maxPeerCorrelation) {
    reasons.push("peer-correlation-regression");
  }

  return { eligible: reasons.length === 0, reasons };
}

const challengers = ["B", "AB"].map((label) => {
  const summary = summaries[label];
  const verdict = challengerEligibility(summary);
  return {
    ...summary,
    label,
    eligible: verdict.eligible,
    reasons: verdict.reasons,
  };
});

function compareCandidates(left, right) {
  const comparisons = [
    ["rankIcOosIcir", "desc"],
    ["rankIcOosMean", "desc"],
    ["rankIcOosTstat", "desc"],
    ["quantileSpreadQ5Q1", "desc"],
    ["turnoverTwoWay", "asc"],
    ["peerCorrelationMaxAbs", "asc"],
  ];

  for (const [metric, direction] of comparisons) {
    const leftValue = left.metrics[metric];
    const rightValue = right.metrics[metric];
    if (leftValue === rightValue) continue;
    if (direction === "desc") {
      return leftValue > rightValue ? -1 : 1;
    }
    return leftValue < rightValue ? -1 : 1;
  }

  return left.label.localeCompare(right.label);
}

const eligibleChallengers = challengers.filter((candidate) => candidate.eligible).sort(compareCandidates);
const winner = eligibleChallengers[0] ?? incumbent;
const winnerPath = winner.label === "B" ? bPath : winner.label === "AB" ? abPath : incumbentPath;

if (winner.label !== "A") {
  fs.copyFileSync(winnerPath, incumbentPath);
}

let previousState = { consecutiveIncumbentWins: 0 };
if (fs.existsSync(statePath)) {
  previousState = {
    ...previousState,
    ...readJson(statePath),
  };
}

const consecutiveIncumbentWins =
  winner.label === "A" ? Number(previousState.consecutiveIncumbentWins ?? 0) + 1 : 0;
const nextState = {
  consecutiveIncumbentWins,
  lastWinner: winner.label,
  updatedAt: new Date().toISOString(),
};

fs.writeFileSync(statePath, `${JSON.stringify(nextState, null, 2)}\n`);

if (consecutiveIncumbentWins >= 2) {
  fs.writeFileSync(stopPath, "incumbent-won-twice\n");
} else if (fs.existsSync(stopPath)) {
  fs.rmSync(stopPath);
}

for (const candidate of [incumbent, ...challengers]) {
  const status = candidate.eligible ? "eligible" : candidate.reasons.join(",");
  console.log(`CANDIDATE ${candidate.label} status=${status}`);
}

console.log(`WINNER ${winner.label}`);
console.log(`STATE consecutiveIncumbentWins=${consecutiveIncumbentWins}`);
if (consecutiveIncumbentWins >= 2) {
  console.log("AUTOREASON_STOP incumbent-won-twice");
}

for (const [name, value] of Object.entries(winner.metrics)) {
  console.log(`METRIC ${name}=${value}`);
}
NODE
