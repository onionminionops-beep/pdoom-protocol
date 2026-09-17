/** Client-side loop + confidence gating defaults. Server env vars can override budgets. */
export const AI_CONFIG = {
  minIntervalMs: 100,
  requestTimeoutMs: 1500,
  /** Maximum retention after receipt, also bounded by the requested hold. */
  staleMs: 400,
  maxResponseAgeMs: 750,
  /** Decisions based on ticks older than this are discarded. */
  maxTickAgeTicks: 45,
  consecutiveFailuresBeforeMock: 4,
  retryLiveAfterMs: 15000,
  confidenceThresholds: {
    horizontal: 0.4,
    vertical: 0.45,
    shoot: 0.5,
    dash: 0.55,
    interact: 0.5,
    duration: 0.4,
  },
} as const;

export type AiConfig = typeof AI_CONFIG;
