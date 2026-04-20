import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ServiceError } from "../errors.js";
import { CONFIG_DIR } from "../types/config.js";
import {
  type FactorMetaPrivate,
  type FactorMetaPublic,
  FactorMetaPublicSchema,
  type FactorRegistryEntry,
  FactorRegistryEntrySchema,
  type FactorRegistryIndex,
  FactorRegistryIndexSchema,
  type FactorSubscription,
  type LegacySignalMetaPublic,
  LegacySignalMetaPublicSchema,
  normalizeStoredFactorMetaPublic,
  SubscriptionFileSchema,
} from "../types/factor-registry.js";
import { ensureDir, readJsonFile, writeJsonFileAtomic } from "../utils/file-store.js";
import { mutateWithEvent } from "./event-log.js";

// ── Paths ──────────────────────────────────────────────────
const REGISTRY_ROOT = join(CONFIG_DIR, "registry");
const INDEX_PATH = join(REGISTRY_ROOT, "factors.json");
const SUBSCRIPTIONS_PATH = join(CONFIG_DIR, "subscriptions.json");

function factorDir(id: string): string {
  return join(REGISTRY_ROOT, "factors", id);
}

// ── Error subclasses ───────────────────────────────────────
export class DuplicateFactorError extends ServiceError {
  constructor(id: string) {
    super(`Factor '${id}' already exists. Use --force to update.`, "DUPLICATE_FACTOR");
    this.name = "DuplicateFactorError";
  }
}

export class FactorNotFoundError extends ServiceError {
  constructor(id: string) {
    super(`Factor '${id}' not found in registry.`, "FACTOR_NOT_FOUND");
    this.name = "FactorNotFoundError";
  }
}

export class FactorListingRequiredError extends ServiceError {
  constructor(id: string) {
    super(
      `Factor '${id}' is a legacy signal entry. Re-evaluate and republish it under the factor contract before using factor-native read models.`,
      "FACTOR_LISTING_REQUIRED",
    );
    this.name = "FactorListingRequiredError";
  }
}

export class BacktestValidationError extends ServiceError {
  constructor(details: string) {
    super(`Backtest validation failed: ${details}`, "BACKTEST_VALIDATION");
    this.name = "BacktestValidationError";
  }
}

// ── Helpers ────────────────────────────────────────────────
function ensureRegistryDir(): void {
  ensureDir(join(REGISTRY_ROOT, "factors"));
}

function readIndex(): FactorRegistryIndex {
  return readJsonFile<FactorRegistryIndex>(INDEX_PATH, FactorRegistryIndexSchema, {
    defaultValue: { version: "2.0.0", factors: [] },
    corruptedCode: "REGISTRY_CORRUPTED",
    corruptedMessage: `factors.json is corrupted. Delete ${INDEX_PATH} to reset.`,
  });
}

function writeIndex(index: FactorRegistryIndex): void {
  ensureRegistryDir();
  writeJsonFileAtomic(INDEX_PATH, index);
}

function readEntry(id: string): FactorRegistryEntry | null {
  const entryPath = join(factorDir(id), "entry.json");
  if (!existsSync(entryPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(entryPath, "utf-8"));
    const parsed = FactorRegistryEntrySchema.parse(raw);
    return {
      ...parsed,
      public: normalizeStoredFactorMetaPublic(parsed.public),
    };
  } catch {
    throw new ServiceError(
      `entry.json for factor '${id}' is corrupted. Delete ${entryPath} to reset.`,
      "REGISTRY_CORRUPTED",
    );
  }
}

function writeEntry(entry: FactorRegistryEntry): void {
  const dir = factorDir(entry.public.id);
  ensureDir(dir);
  writeJsonFileAtomic(join(dir, "entry.json"), entry);
}

function readSubscriptions(): FactorSubscription[] {
  return readJsonFile<{ subscriptions: FactorSubscription[] }>(
    SUBSCRIPTIONS_PATH,
    SubscriptionFileSchema,
    {
      defaultValue: { subscriptions: [] },
      corruptedCode: "SUBSCRIPTIONS_CORRUPTED",
      corruptedMessage: `subscriptions.json is corrupted. Delete ${SUBSCRIPTIONS_PATH} to reset.`,
    },
  ).subscriptions;
}

function writeSubscriptions(subs: FactorSubscription[]): void {
  writeJsonFileAtomic(SUBSCRIPTIONS_PATH, { subscriptions: subs });
}

// ── Public API ─────────────────────────────────────────────

export interface PublishOptions {
  force?: boolean;
  privateData?: FactorMetaPrivate;
}

export type RegistryListing = FactorMetaPublic | LegacySignalMetaPublic;

export interface FactorIcView {
  factorId: string;
  factorName: string;
  factorVersion: string;
  rankIcOosMean: number;
  rankIcOosIcir: number;
  rankIcOosTstat: number;
  icOosMean?: number;
  icOosIcir?: number;
  icOosTstat?: number;
  deflatedRankIc?: number;
  nTrials?: number;
  halfLifeDays?: number | null;
  stability: FactorMetaPublic["metrics"]["factorQuality"]["stability"];
  evaluationFrequency: "daily" | "weekly" | "monthly";
  sampleCount: number;
  averageUniverseSize: number;
}

export interface FactorDecayView {
  factorId: string;
  factorName: string;
  factorVersion: string;
  halfLifeDays?: number | null;
  primaryHoldingBucket: FactorMetaPublic["metrics"]["factorQuality"]["stability"]["primaryHoldingBucket"];
  decay: FactorMetaPublic["metrics"]["factorQuality"]["icDecay"];
  evaluationFrequency: "daily" | "weekly" | "monthly";
  sampleCount: number;
}

export interface FactorUniquenessView {
  factorId: string;
  factorName: string;
  factorVersion: string;
  peerCorrelation: FactorMetaPublic["metrics"]["implementationProfile"]["peerCorrelation"];
  turnoverTwoWay: number;
  capacityMethod: string;
  capacityValue: number;
  liquidityAssumptions: FactorMetaPublic["metrics"]["implementationProfile"]["liquidityAssumptions"];
}

function normalizeIndexFactors(index: FactorRegistryIndex): RegistryListing[] {
  return index.factors.map((factor) => normalizeStoredFactorMetaPublic(factor));
}

export function publishFactor(meta: RegistryListing, opts: PublishOptions = {}): RegistryListing {
  const validated =
    meta.listingType === "factor"
      ? FactorMetaPublicSchema.parse(meta)
      : LegacySignalMetaPublicSchema.parse(meta);
  return mutateWithEvent({
    paths: [INDEX_PATH, join(factorDir(validated.id), "entry.json")],
    event: {
      type: "factor.publish",
      entity: { kind: "factor", id: validated.id },
      result: "success",
      summary: opts.force
        ? `Updated factor ${validated.id} in registry.`
        : `Published factor ${validated.id} to registry.`,
      payload: {
        force: Boolean(opts.force),
        version: validated.version,
        visibility: validated.access.visibility,
      },
    },
    apply: () => {
      const index = readIndex();
      const existing = normalizeIndexFactors(index);
      const existingIdx = existing.findIndex((f) => f.id === validated.id);
      if (existingIdx >= 0 && !opts.force) {
        throw new DuplicateFactorError(validated.id);
      }

      const updatedFactors =
        existingIdx >= 0
          ? existing.map((f, i) => (i === existingIdx ? validated : f))
          : [...existing, validated];

      writeIndex({ ...index, factors: updatedFactors });
      writeEntry({ public: validated, private: opts.privateData });
      return validated;
    },
  });
}

export interface DiscoverFilters {
  category?: string;
  asset?: string;
  assetClass?: string;
  marketRegion?: string;
  minRankIcOosIcir?: number;
  minRankIcOosTstat?: number;
  minPositivePeriodShare?: number;
  minHalfLifeDays?: number;
  maxTurnover?: number;
  maxPeerCorrelation?: number;
  timeframe?: string;
}

export function discoverFactors(filters: DiscoverFilters = {}): FactorMetaPublic[] {
  let results = normalizeIndexFactors(readIndex()).filter(
    (factor): factor is FactorMetaPublic => factor.listingType === "factor",
  );

  if (filters.category) {
    results = results.filter((f) => f.category === filters.category);
  }
  if (filters.asset) {
    const asset = filters.asset.toUpperCase();
    results = results.filter((f) =>
      f.definition.universe.assets.some((entry) => entry.toUpperCase() === asset),
    );
  }
  if (filters.assetClass) {
    results = results.filter((f) => f.definition.universe.assetClass === filters.assetClass);
  }
  if (filters.marketRegion) {
    results = results.filter((f) => f.definition.universe.marketRegion === filters.marketRegion);
  }
  if (filters.minRankIcOosIcir !== undefined) {
    results = results.filter(
      (f) => f.metrics.factorQuality.rankIcOosIcir >= (filters.minRankIcOosIcir as number),
    );
  }
  if (filters.minRankIcOosTstat !== undefined) {
    results = results.filter(
      (f) => f.metrics.factorQuality.rankIcOosTstat >= (filters.minRankIcOosTstat as number),
    );
  }
  if (filters.minPositivePeriodShare !== undefined) {
    results = results.filter(
      (f) =>
        f.metrics.factorQuality.stability.positivePeriodShare >=
        (filters.minPositivePeriodShare as number),
    );
  }
  if (filters.minHalfLifeDays !== undefined) {
    results = results.filter(
      (f) =>
        (f.metrics.factorQuality.halfLifeDays ?? Number.NEGATIVE_INFINITY) >=
        (filters.minHalfLifeDays as number),
    );
  }
  if (filters.maxTurnover !== undefined) {
    results = results.filter(
      (f) => f.metrics.implementationProfile.turnoverTwoWay <= (filters.maxTurnover as number),
    );
  }
  if (filters.maxPeerCorrelation !== undefined) {
    results = results.filter(
      (f) =>
        f.metrics.implementationProfile.peerCorrelation.maxAbs <=
        (filters.maxPeerCorrelation as number),
    );
  }
  if (filters.timeframe) {
    results = results.filter((f) => f.definition.timeframe === filters.timeframe);
  }

  return results;
}

export function subscribeFactor(factorId: string): FactorSubscription {
  const result = mutateWithEvent({
    paths: [SUBSCRIPTIONS_PATH],
    event: (state) =>
      state.changed
        ? {
            type: "factor.subscribe",
            entity: { kind: "factor", id: factorId },
            result: "success",
            summary: `Subscribed to factor ${factorId}.`,
            payload: {
              subscribedVersion: state.subscription.subscribedVersion,
            },
          }
        : null,
    apply: () => {
      const factor = normalizeIndexFactors(readIndex()).find((entry) => entry.id === factorId);
      if (!factor) {
        throw new FactorNotFoundError(factorId);
      }

      const subs = readSubscriptions();
      const existing = subs.find((s) => s.factorId === factorId);
      if (existing) {
        return { changed: false as const, subscription: existing };
      }

      const subscription: FactorSubscription = {
        factorId,
        subscribedAt: new Date().toISOString(),
        subscribedVersion: factor.version,
      };
      writeSubscriptions([...subs, subscription]);
      return { changed: true as const, subscription };
    },
  });
  return result.subscription;
}

export function unsubscribeFactor(factorId: string): boolean {
  return mutateWithEvent({
    paths: [SUBSCRIPTIONS_PATH],
    event: (changed) =>
      changed
        ? {
            type: "factor.unsubscribe",
            entity: { kind: "factor", id: factorId },
            result: "success",
            summary: `Unsubscribed from factor ${factorId}.`,
          }
        : null,
    apply: () => {
      const subs = readSubscriptions();
      const filtered = subs.filter((s) => s.factorId !== factorId);
      if (filtered.length === subs.length) {
        return false;
      }
      writeSubscriptions(filtered);
      return true;
    },
  });
}

export function listFactors(opts: { subscribedOnly?: boolean } = {}): RegistryListing[] {
  const all = normalizeIndexFactors(readIndex());
  if (!opts.subscribedOnly) return all;

  const subs = readSubscriptions();
  const subIds = new Set(subs.map((s) => s.factorId));
  return all.filter((f) => subIds.has(f.id));
}

export function getFactorDetail(factorId: string): FactorRegistryEntry {
  const entry = readEntry(factorId);
  if (!entry) throw new FactorNotFoundError(factorId);
  return entry;
}

function requireFactorListing(factorId: string): FactorMetaPublic {
  const entry = getFactorDetail(factorId);
  const normalized = normalizeStoredFactorMetaPublic(entry.public);
  if (normalized.listingType !== "factor") {
    throw new FactorListingRequiredError(factorId);
  }
  return normalized;
}

export function getFactorIcView(factorId: string): FactorIcView {
  const factor = requireFactorListing(factorId);
  return {
    factorId: factor.id,
    factorName: factor.name,
    factorVersion: factor.version,
    rankIcOosMean: factor.metrics.factorQuality.rankIcOosMean,
    rankIcOosIcir: factor.metrics.factorQuality.rankIcOosIcir,
    rankIcOosTstat: factor.metrics.factorQuality.rankIcOosTstat,
    icOosMean: factor.metrics.factorQuality.icOosMean,
    icOosIcir: factor.metrics.factorQuality.icOosIcir,
    icOosTstat: factor.metrics.factorQuality.icOosTstat,
    deflatedRankIc: factor.metrics.factorQuality.deflatedRankIc,
    nTrials: factor.metrics.factorQuality.nTrials,
    halfLifeDays: factor.metrics.factorQuality.halfLifeDays,
    stability: factor.metrics.factorQuality.stability,
    evaluationFrequency: factor.provenance.evaluationFrequency,
    sampleCount: factor.provenance.sampleCount,
    averageUniverseSize: factor.provenance.averageUniverseSize,
  };
}

export function getFactorDecayView(factorId: string): FactorDecayView {
  const factor = requireFactorListing(factorId);
  return {
    factorId: factor.id,
    factorName: factor.name,
    factorVersion: factor.version,
    halfLifeDays: factor.metrics.factorQuality.halfLifeDays,
    primaryHoldingBucket: factor.metrics.factorQuality.stability.primaryHoldingBucket,
    decay: factor.metrics.factorQuality.icDecay,
    evaluationFrequency: factor.provenance.evaluationFrequency,
    sampleCount: factor.provenance.sampleCount,
  };
}

export function getFactorUniquenessView(factorId: string): FactorUniquenessView {
  const factor = requireFactorListing(factorId);
  return {
    factorId: factor.id,
    factorName: factor.name,
    factorVersion: factor.version,
    peerCorrelation: factor.metrics.implementationProfile.peerCorrelation,
    turnoverTwoWay: factor.metrics.implementationProfile.turnoverTwoWay,
    capacityMethod: factor.metrics.implementationProfile.capacityMethod,
    capacityValue: factor.metrics.implementationProfile.capacityValue,
    liquidityAssumptions: factor.metrics.implementationProfile.liquidityAssumptions,
  };
}

export function getFactorLeaderboard(
  opts: { period?: string; limit?: number } = {},
): FactorMetaPublic[] {
  const sorted = normalizeIndexFactors(readIndex())
    .filter((factor): factor is FactorMetaPublic => factor.listingType === "factor")
    .sort((left, right) => {
      const icirDiff =
        right.metrics.factorQuality.rankIcOosIcir - left.metrics.factorQuality.rankIcOosIcir;
      if (icirDiff !== 0) return icirDiff;

      const rankIcDiff =
        right.metrics.factorQuality.rankIcOosMean - left.metrics.factorQuality.rankIcOosMean;
      if (rankIcDiff !== 0) return rankIcDiff;

      const spreadDiff =
        right.metrics.factorQuality.quantileSpreadQ5Q1 -
        left.metrics.factorQuality.quantileSpreadQ5Q1;
      if (spreadDiff !== 0) return spreadDiff;

      const turnoverDiff =
        left.metrics.implementationProfile.turnoverTwoWay -
        right.metrics.implementationProfile.turnoverTwoWay;
      if (turnoverDiff !== 0) return turnoverDiff;

      return (
        left.metrics.implementationProfile.peerCorrelation.maxAbs -
        right.metrics.implementationProfile.peerCorrelation.maxAbs
      );
    });
  return sorted.slice(0, opts.limit ?? 10);
}
