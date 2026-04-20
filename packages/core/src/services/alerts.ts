import { join } from "node:path";
import { z } from "zod";
import { CONFIG_DIR } from "../types/config.js";
import { AlertsFileSchema, type FactorAlert, FactorAlertSchema } from "../types/factor-registry.js";
import { readJsonFile, writeJsonFileAtomic } from "../utils/file-store.js";
import { appendEvent, mutateWithEvent } from "./event-log.js";
import { getFactorDetail } from "./registry.js";

// ── Paths ──────────────────────────────────────────────────
const ALERTS_PATH = join(CONFIG_DIR, "alerts.json");

const AlertEvaluationStatusSchema = z.enum(["fired", "not-triggered", "failed"]);

const AlertEvaluationSchema = z.object({
  alert: FactorAlertSchema,
  status: AlertEvaluationStatusSchema,
  metricName: z.string().min(1),
  metricValue: z.number().optional(),
  reason: z.string().min(1).optional(),
});

export type AlertEvaluation = z.infer<typeof AlertEvaluationSchema>;

// ── IO helpers ─────────────────────────────────────────────

function readAlerts(): FactorAlert[] {
  return readJsonFile<{ alerts: FactorAlert[] }>(ALERTS_PATH, AlertsFileSchema, {
    defaultValue: { alerts: [] },
    corruptedCode: "ALERTS_CORRUPTED",
    corruptedMessage: `alerts.json is corrupted. Delete ${ALERTS_PATH} to reset.`,
  }).alerts;
}

function writeAlerts(alerts: ReadonlyArray<FactorAlert>): void {
  writeJsonFileAtomic(ALERTS_PATH, { alerts });
}

// ── Public API ─────────────────────────────────────────────

export function setAlert(
  factorId: string,
  metric: FactorAlert["metric"],
  condition: "above" | "below",
  threshold: number,
): FactorAlert {
  const result = mutateWithEvent({
    paths: [ALERTS_PATH],
    event: (state) => ({
      type: "factor.alert.set",
      entity: { kind: "factor", id: factorId },
      result: "success",
      summary: `Set ${condition} alert for factor ${factorId}.`,
      payload: {
        metric,
        condition,
        threshold,
        replaced: state.replaced,
      },
    }),
    apply: () => {
      getFactorDetail(factorId);

      const alert = FactorAlertSchema.parse({
        factorId,
        metric,
        condition,
        threshold,
        createdAt: new Date().toISOString(),
        active: true,
      });

      const existing = readAlerts();
      const hasDuplicate = existing.some(
        (current) =>
          current.factorId === factorId &&
          current.metric === metric &&
          current.condition === condition,
      );

      const updated = hasDuplicate
        ? existing.map((current) =>
            current.factorId === factorId &&
            current.metric === metric &&
            current.condition === condition
              ? alert
              : current,
          )
        : [...existing, alert];

      writeAlerts(updated);
      return { alert, replaced: hasDuplicate };
    },
  });
  return result.alert;
}

export function listAlerts(): FactorAlert[] {
  return readAlerts();
}

export function removeAlert(factorId: string): boolean {
  const result = mutateWithEvent({
    paths: [ALERTS_PATH],
    event: (state) =>
      state.removed
        ? {
            type: "factor.alert.remove",
            entity: { kind: "factor", id: factorId },
            result: "success",
            summary: `Removed alerts for factor ${factorId}.`,
            payload: {
              removedCount: state.removedCount,
            },
          }
        : null,
    apply: () => {
      const existing = readAlerts();
      const filtered = existing.filter((alert) => alert.factorId !== factorId);
      if (filtered.length === existing.length) {
        return { removed: false as const, removedCount: 0 };
      }
      writeAlerts(filtered);
      return {
        removed: true as const,
        removedCount: existing.length - filtered.length,
      };
    },
  });
  return result.removed;
}

export function evaluateAlerts(params: { factorId?: string } = {}): AlertEvaluation[] {
  const alerts = params.factorId
    ? readAlerts().filter((alert) => alert.factorId === params.factorId && alert.active)
    : readAlerts().filter((alert) => alert.active);

  return alerts.map((alert) => {
    let metricValue: number;
    const metricName = alert.metric;
    try {
      const detail = getFactorDetail(alert.factorId);
      if (detail.public.listingType !== "factor") {
        throw new Error("Legacy signals do not expose factor-native alert metrics.");
      }
      switch (alert.metric) {
        case "rankIcOosIcir":
          metricValue = detail.public.metrics.factorQuality.rankIcOosIcir;
          break;
        case "turnoverTwoWay":
          metricValue = detail.public.metrics.implementationProfile.turnoverTwoWay;
          break;
        case "peerCorrelationMaxAbs":
          metricValue = detail.public.metrics.implementationProfile.peerCorrelation.maxAbs;
          break;
      }
    } catch (error) {
      return AlertEvaluationSchema.parse({
        alert,
        status: "failed",
        metricName,
        reason: error instanceof Error ? error.message : String(error),
      });
    }

    const triggered =
      alert.condition === "above" ? metricValue > alert.threshold : metricValue < alert.threshold;

    if (triggered) {
      appendEvent({
        type: "factor.alert.fire",
        entity: { kind: "factor", id: alert.factorId },
        result: "success",
        summary: `Factor ${alert.factorId} alert fired.`,
        payload: {
          metric: alert.metric,
          condition: alert.condition,
          threshold: alert.threshold,
          metricName,
          metricValue,
        },
      });
    }

    return AlertEvaluationSchema.parse({
      alert,
      status: triggered ? "fired" : "not-triggered",
      metricName,
      metricValue,
    });
  });
}
