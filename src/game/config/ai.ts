/** Client-side loop + confidence gating defaults. Server env vars can override budgets. */
export const AI_CONFIG = {
  minIntervalMs: 100,
  requestTimeoutMs: 1500,
  /** Input decays to neutral after max(2*holdForMs, staleMs) without a fresh decision. */
  staleMs: 400,
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
  },
} as const;

export type AiConfig = typeof AI_CONFIG;
