// Errors

// Config
export {
  ensureConfigDir,
  getConfigDir,
  getConfigPath,
  loadConfig,
  saveConfig,
} from "./config/index.js";
// Seed content
export { SEED_FACTORS } from "./data/seed-factors.js";
export { ServiceError } from "./errors.js";
// Factor Alert Service
export {
  evaluateAlerts,
  listAlerts,
  removeAlert,
  setAlert,
} from "./services/alerts.js";
export {
  AutomationDaemonLockError,
  AutomationError,
  AutomationHandlerRegistry,
  AutomationJobCorruptedError,
  AutomationJobNotFoundError,
  AutomationJobStateError,
  acquireAutomationDaemonLock,
  claimAutomationJob,
  claimNextDueAutomationJob,
  completeAutomationJob,
  computeNextRunAt,
  failAutomationJob,
  getAutomationDaemonLockPath,
  getAutomationJob,
  listAutomationJobs,
  pauseAutomationJob,
  reconcileAutomationJob,
  recoverExpiredAutomationJobs,
  removeAutomationJob,
  resumeAutomationJob,
  scheduleAutomationJob,
} from "./services/automation.js";
export {
  buildPriceIndex,
  cachedFindAssetBySymbol,
  cachedFindAssetsBySymbol,
  cachedGetAssets,
  cachedGetPools,
  clearCache,
} from "./services/cache.js";
// Factor Compose Service
export {
  CompositeNotFoundError,
  CompositionValidationError,
  composeFactors,
  DuplicateCompositeError,
  deleteComposite,
  getComposite,
  listComposites,
  normalizeWeights,
  validateComponents,
} from "./services/compose.js";
export {
  appendEvent,
  EVENT_LOG_PATH,
  EventLogCorruptedError,
  EventLogLockError,
  EventLogRollbackError,
  EventLogWriteError,
  mutateWithEvent,
  queryEvents,
  readEvents,
} from "./services/event-log.js";
export { icHalfLifeDays } from "./services/factor-derivations.js";
export {
  type FactorMarketplaceValidationResult,
  type FactorValidationIssue,
  REQUIRED_FACTOR_QUALITY_FIELDS,
  type RequiredFactorQualityField,
  validateFactorMarketplaceContract,
  validateFactorMetricsCompleteness,
} from "./services/factor-metric-validation.js";
export {
  clearMarketCache,
  fetchMarketCandlesData,
  fetchMarketCompareData,
  fetchMarketQuoteData,
  fetchMarketSearchData,
} from "./services/market.js";
export {
  buildIntentText,
  buildPreparedPlatformAction,
  buildPublishIntent,
  buildPublishManifest,
  buildSigningSession,
  createNonce,
  createPublicationId,
  createSessionId,
  createSettlementBatchId,
  hashManifest,
  normalizeTonAddress,
  PlatformPublishError,
  sha256Hex,
  stringifyCanonicalJson,
  verifyTonConnectIntentSignature,
  verifyWalletPublicKeyMatchesAddress,
} from "./services/platform-publish.js";
export {
  fetchBalanceData,
  fetchHistoryData,
  fetchPoolData,
  fetchPriceData,
  fetchResearchData,
  fetchSwapSimulation,
  fetchTrendingData,
} from "./services/queries.js";
export type {
  FactorDecayView,
  FactorIcView,
  FactorUniquenessView,
  RegistryListing,
} from "./services/registry.js";
// Factor Registry Service
export {
  BacktestValidationError,
  DuplicateFactorError,
  discoverFactors,
  FactorListingRequiredError,
  FactorNotFoundError,
  getFactorDecayView,
  getFactorDetail,
  getFactorIcView,
  getFactorLeaderboard,
  getFactorUniquenessView,
  listFactors,
  publishFactor,
  subscribeFactor,
  unsubscribeFactor,
} from "./services/registry.js";
// Factor Report Service
export {
  listReports,
  ReportValidationError,
  submitReport,
} from "./services/reports.js";
export { seedRegistry } from "./services/seed.js";
// Skill export
export {
  exportTopFactorsAsSkills,
  formatSkillMarkdown,
  type SkillDefinition,
} from "./services/skill-export.js";
// Services
export {
  findAssetBySymbol,
  findPool,
  getAssets,
  getPools,
  simulateSwap,
} from "./services/stonfi.js";
export { getBalance, getJettonBalances, getTransactions } from "./services/tonapi.js";
export { createWalletFromMnemonic, getWalletAddress, type WalletInfo } from "./services/wallet.js";
// Types — API schemas
export {
  type Asset,
  AssetSchema,
  type JettonBalance,
  JettonBalanceSchema,
  type Pool,
  PoolSchema,
  type SwapSimulateParams,
  type SwapSimulateResponse,
  SwapSimulateResponseSchema,
  type TonBalance,
  TonBalanceSchema,
  type TransactionEvent,
  TransactionEventSchema,
} from "./types/api.js";
export * from "./types/automation.js";
// Types — Config
export {
  CONFIG_DIR,
  CONFIG_FILE,
  type Config,
  ConfigSchema,
} from "./types/config.js";
// Types — Domain data
export {
  type BalanceData,
  BalanceDataSchema,
  type HistoryData,
  HistoryDataSchema,
  HistoryTransactionSchema,
  type PoolData,
  PoolDataSchema,
  type PriceData,
  PriceDataSchema,
  type ResearchData,
  ResearchDataSchema,
  type SwapExecutionData,
  SwapExecutionDataSchema,
  type SwapSimulationData,
  SwapSimulationDataSchema,
  type TrendingData,
  TrendingDataSchema,
  TrendingTokenSchema,
} from "./types/data.js";
export type {
  EventEntity,
  EventLogAppendInput,
  EventLogEntry,
  EventLogQueryInput,
  EventLogQueryResult,
  EventLogReadInput,
  EventPayload,
  EventResult,
} from "./types/event-log.js";
export {
  EventEntitySchema,
  EventLogAppendInputSchema,
  EventLogEntrySchema,
  EventLogQueryInputSchema,
  EventLogQueryResultSchema,
  EventLogReadInputSchema,
  EventPayloadSchema,
  EventResultSchema,
} from "./types/event-log.js";
// Factor Compose Types
export type {
  ComponentWeight,
  CompositeDefinition,
  CompositeEntry,
  CompositeIndex,
} from "./types/factor-compose.js";
export {
  ComponentWeightSchema,
  CompositeDefinitionSchema,
  CompositeEntrySchema,
  CompositeIndexSchema,
} from "./types/factor-compose.js";
// Factor Registry Types
export type {
  CostModel,
  FactorAlert,
  FactorCategory,
  FactorDecayPoint,
  FactorDefinition,
  FactorEvaluationArtifact,
  FactorHoldingBucket,
  FactorListingType,
  FactorMarketType,
  FactorMetaPrivate,
  FactorMetaPublic,
  FactorMetrics,
  FactorNeutralization,
  FactorNormalization,
  FactorPerformanceReport,
  FactorQuality,
  FactorRegistryEntry,
  FactorRegistryIndex,
  FactorStability,
  FactorSubscription,
  ImplementationProfile,
  LegacyFactorBacktestSummary,
  LegacySignalMetaPublic,
  LiquidityAssumptions,
  PeerCorrelation,
  ReferenceBacktest,
  StoredFactorMetaPublic,
  ValidationProvenance,
} from "./types/factor-registry.js";
// File schemas (alerts, reports)
export {
  AlertsFileSchema,
  CostModelSchema,
  FactorAlertSchema,
  FactorCategorySchema,
  FactorDecayPointSchema,
  FactorDefinitionSchema,
  FactorEvaluationArtifactSchema,
  FactorHoldingBucketSchema,
  FactorIdSchema,
  FactorListingTypeSchema,
  FactorMarketTypeSchema,
  FactorMetaPrivateSchema,
  FactorMetaPublicSchema,
  FactorMetricsSchema,
  FactorNeutralizationSchema,
  FactorNormalizationSchema,
  FactorPerformanceReportSchema,
  FactorQualitySchema,
  FactorRegistryEntrySchema,
  FactorRegistryIndexSchema,
  FactorStabilitySchema,
  FactorSubscriptionSchema,
  ImplementationProfileSchema,
  isFactorListing,
  LegacyFactorBacktestSummarySchema,
  LegacySignalMetaPublicSchema,
  LiquidityAssumptionsSchema,
  normalizeStoredFactorMetaPublic,
  PeerCorrelationSchema,
  ReferenceBacktestSchema,
  ReportsFileSchema,
  StoredFactorMetaPublicSchema,
  sampleAdequacyError,
  ValidationProvenanceSchema,
} from "./types/factor-registry.js";
export {
  type MarketCandle,
  MarketCandleSchema,
  type MarketCandlesData,
  MarketCandlesDataSchema,
  type MarketCompareData,
  MarketCompareDataSchema,
  type MarketInstrumentCandidate,
  MarketInstrumentCandidateSchema,
  type MarketProvider,
  MarketProviderSchema,
  type MarketQuoteData,
  MarketQuoteDataSchema,
  type MarketSearchData,
  MarketSearchDataSchema,
  type MarketTrustMetadata,
  MarketTrustMetadataSchema,
  type MarketType,
  MarketTypeSchema,
  type MarketVenue,
  MarketVenueSchema,
} from "./types/market.js";
export type {
  ArtifactBundle,
  ArtifactDownloadGrant,
  ArtifactStage,
  ArtifactUploadResult,
  AuthorProfile,
  CommissionEventInput,
  CommissionLedgerEntry,
  FactorCommercialTerms,
  FactorDetailView,
  FactorListing,
  NanoAmount,
  PayoutChangeResult,
  PlatformAction,
  PreparedPlatformAction,
  PublicationRecord,
  PublicationStatus,
  PublicationStatusResponse,
  PublishIntent,
  PublishManifest,
  PullSession,
  PullSessionCompletionResult,
  PullSessionStatus,
  RawTonAddress,
  SettlementBatch,
  SettlementStatus,
  SigningSession,
  SigningSessionStatus,
  SubscriptionRecord,
  TonAmount,
  TonConnectSignDataResult,
  TonNetwork,
} from "./types/platform-publish.js";
export {
  ArtifactBundleSchema,
  ArtifactDownloadGrantSchema,
  ArtifactStageSchema,
  ArtifactUploadResultSchema,
  AuthorProfileSchema,
  CommissionEventInputSchema,
  CommissionLedgerEntrySchema,
  FactorCommercialTermsSchema,
  FactorDetailViewSchema,
  FactorListingSchema,
  NanoAmountSchema,
  PayoutChangeResultSchema,
  PlatformActionSchema,
  PreparedPlatformActionSchema,
  PublicationRecordSchema,
  PublicationStatusResponseSchema,
  PublicationStatusSchema,
  PublishIntentSchema,
  PublishManifestSchema,
  PullSessionCompletionResultSchema,
  PullSessionSchema,
  PullSessionStatusSchema,
  RawTonAddressSchema,
  SettlementBatchSchema,
  SettlementStatusSchema,
  SigningSessionSchema,
  SigningSessionStatusSchema,
  SubscriptionRecordSchema,
  TonAmountSchema,
  TonConnectSignDataResultSchema,
  TonNetworkSchema,
} from "./types/platform-publish.js";
export { decrypt, encrypt, getKeyfilePath, loadOrCreateKey } from "./utils/crypto.js";
// Utils
export { calcUsdValue, fromRawUnits, toRawUnits } from "./utils/units.js";
