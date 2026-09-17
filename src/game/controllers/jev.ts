import { AI_CONFIG } from "../config/ai";
import {
  ApiErrorSchema,
  DecisionResponseSchema,
  SessionResponseSchema,
  type ApiError,
  type DecisionResponse,
  type SessionResponse,
} from "../contracts/decision";
import { neutralInput, type PlayerInputV1 } from "../contracts/input";
import type { GameObservationV1 } from "../contracts/observation";
import { buildObservation } from "../observation/build";
import { MockAIController } from "./mock";
import type { ControllerContext, PlayerController } from "./types";

export interface JevControllerOptions {
  /** Injected for tests; defaults to global fetch. */
  fetch?: typeof fetch;
  /** Called whenever the controller's status changes (for HUD / dev panel). */
  onStatus?: (status: JevStatus) => void;
  /** Avoids a provisional session before the first update. */
  episodeId?: string;
  /** Monotonic wall clock, independent of simulation pause/time. */
  now?: () => number;
}

export interface JevStatus {
  mode: "connecting" | "live" | "waiting" | "fallback_mock" | "error";
  lastLatencyMs: number | null;
  lastRequestId: string | null;
  consecutiveFailures: number;
  requestsSent: number;
  lastError: string | null;
  minDecisionIntervalMs?: number;
  lastRoundTripMs?: number | null;
}

export interface JevLastDecision extends DecisionResponse {
  observation: GameObservationV1;
}

class RequestFailure extends Error {
  constructor(readonly detail: ApiError) {
    super(detail.message);
  }
}

export class JevController implements PlayerController {
  readonly kind = "JEV" as const;
  private mock = new MockAIController();
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private episodeId: string;
  private generation = 0;
  private latestTick = -1;
  private lastSentTick = -1;
  private session: SessionResponse | null = null;
  private sessionExpiresAt = 0;
  private sessionRequests = 0;
  private input: PlayerInputV1 | null = null;
  private inputObservedAt = -Infinity;
  private inputAcceptedAt = -Infinity;
  private lastDecision: JevLastDecision | null = null;
  private inFlight = false;
  private abort: AbortController | null = null;
  private disposed = false;
  private fallback = false;
  private nextRequestAt = 0;
  private status: JevStatus = {
    mode: "connecting",
    lastLatencyMs: null,
    lastRequestId: null,
    consecutiveFailures: 0,
    requestsSent: 0,
    lastError: null,
    minDecisionIntervalMs: AI_CONFIG.minIntervalMs,
    lastRoundTripMs: null,
  };

  constructor(private readonly opts: JevControllerOptions = {}) {
    this.fetcher = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.now = opts.now ?? (() => performance.now());
    this.episodeId = opts.episodeId ?? crypto.randomUUID();
    this.publish({});
    void this.connect();
  }

  getStatus(): JevStatus {
    return { ...this.status };
  }

  getLastDecision(): JevLastDecision | null {
    return this.lastDecision ? structuredClone(this.lastDecision) : null;
  }

  private publish(patch: Partial<JevStatus>): void {
    this.status = { ...this.status, ...patch };
    this.opts.onStatus?.(this.getStatus());
  }

  private resetEpisode(episodeId: string): void {
    this.generation++;
    this.abort?.abort();
    this.episodeId = episodeId;
    this.session = null;
    this.sessionRequests = 0;
    this.latestTick = -1;
    this.lastSentTick = -1;
    this.input = null;
    this.lastDecision = null;
    this.fallback = false;
    this.nextRequestAt = 0;
    this.mock.dispose();
    this.mock = new MockAIController();
    this.publish({ mode: "connecting", consecutiveFailures: 0, lastError: null });
  }

  private async post(url: string, body: unknown): Promise<unknown> {
    const abort = new AbortController();
    this.abort = abort;
    const timeout = setTimeout(() => abort.abort(), AI_CONFIG.requestTimeoutMs + 500);
    try {
      const response = await this.fetcher(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify(body),
        signal: abort.signal,
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        const parsed = ApiErrorSchema.safeParse(data);
        throw new RequestFailure(parsed.success ? parsed.data : {
          error: "upstream_unavailable", message: "Jev request failed.",
        });
      }
      return data;
    } finally {
      clearTimeout(timeout);
      if (this.abort === abort) this.abort = null;
    }
  }

  private failed(error: unknown): void {
    const failures = this.status.consecutiveFailures + 1;
    if (failures >= AI_CONFIG.consecutiveFailuresBeforeMock) this.fallback = true;
    const detail = error instanceof RequestFailure ? error.detail : null;
    if (detail?.error === "invalid_session") this.session = null;
    const backoff = this.fallback
      ? AI_CONFIG.retryLiveAfterMs
      : AI_CONFIG.minIntervalMs * 2 ** Math.min(failures, 6);
    this.nextRequestAt = Math.max(this.nextRequestAt, this.now() + Math.max(backoff, detail?.retryAfterMs ?? 0));
    this.publish({
      mode: this.fallback ? "fallback_mock" : "error",
      consecutiveFailures: failures,
      lastError: detail?.error ?? "request_failed",
    });
  }

  private async connect(): Promise<void> {
    if (this.inFlight || this.disposed) return;
    this.inFlight = true;
    const generation = this.generation;
    const started = this.now();
    this.publish({ mode: this.fallback ? "fallback_mock" : "connecting" });
    try {
      const session = SessionResponseSchema.parse(await this.post("/api/jev/session", { episodeId: this.episodeId }));
      if (this.disposed || generation !== this.generation) return;
      if (session.expiresAt <= Date.now() || session.requestBudget <= 0) throw new Error("Invalid session");
      this.session = session;
      this.sessionExpiresAt = this.now() + (session.expiresAt - Date.now());
      this.sessionRequests = 0;
      this.nextRequestAt = Math.max(this.nextRequestAt, started + AI_CONFIG.minIntervalMs);
      this.publish({
        mode: this.fallback ? "fallback_mock" : "waiting",
        minDecisionIntervalMs: Math.max(AI_CONFIG.minIntervalMs, session.minDecisionIntervalMs ?? AI_CONFIG.minIntervalMs),
      });
    } catch (error) {
      if (!this.disposed && generation === this.generation) this.failed(error);
    } finally {
      this.inFlight = false;
    }
  }

  private async decide(observation: GameObservationV1): Promise<void> {
    const session = this.session;
    if (!session || this.inFlight || this.disposed) return;
    this.inFlight = true;
    const generation = this.generation;
    const started = this.now();
    this.nextRequestAt = started + Math.max(AI_CONFIG.minIntervalMs, session.minDecisionIntervalMs ?? AI_CONFIG.minIntervalMs);
    this.lastSentTick = observation.tick;
    this.sessionRequests++;
    this.publish({
      mode: this.fallback ? "fallback_mock" : "waiting",
      requestsSent: this.status.requestsSent + 1,
    });
    try {
      const result = DecisionResponseSchema.parse(await this.post("/api/jev/decision", {
        sessionToken: session.sessionToken, observation,
      }));
      if (this.disposed || generation !== this.generation) return;
      const received = this.now();
      const latency = received - started;
      this.publish({ lastRoundTripMs: latency, lastLatencyMs: result.latencyMs });
      if (result.episodeId !== observation.episodeId || result.input.episodeId !== observation.episodeId ||
          result.basedOnTick !== observation.tick || result.input.basedOnTick !== observation.tick ||
          (this.input && result.basedOnTick <= this.input.basedOnTick) ||
          this.latestTick - result.basedOnTick > AI_CONFIG.maxTickAgeTicks ||
          latency > AI_CONFIG.maxResponseAgeMs) {
        throw new RequestFailure({ error: "invalid_request", message: "Decision is stale." });
      }
      this.input = result.input;
      this.inputObservedAt = started;
      this.inputAcceptedAt = received;
      this.lastDecision = { ...result, observation };
      this.fallback = false;
      this.nextRequestAt = Math.max(this.nextRequestAt, started + Math.max(result.input.holdForMs, latency * 1.2));
      this.publish({
        mode: "live",
        lastLatencyMs: result.latencyMs,
        lastRequestId: result.requestId,
        consecutiveFailures: 0,
        lastError: null,
      });
    } catch (error) {
      if (!this.disposed && generation === this.generation) this.failed(error);
    } finally {
      this.inFlight = false;
    }
  }

  update(ctx: ControllerContext): PlayerInputV1 {
    if (this.disposed) return neutralInput(ctx.episodeId, ctx.tick);
    if (ctx.episodeId !== this.episodeId) this.resetEpisode(ctx.episodeId);
    this.latestTick = ctx.tick;
    const now = this.now();
    if (!this.inFlight && now >= this.nextRequestAt) {
      if (this.session && now >= this.sessionExpiresAt) this.session = null;
      if (!this.session) {
        void this.connect();
      } else if (this.sessionRequests >= this.session.requestBudget) {
        this.fallback = true;
        this.nextRequestAt = this.sessionExpiresAt;
        this.publish({ mode: "fallback_mock", lastError: "session_budget_exhausted" });
      } else if (ctx.tick > this.lastSentTick) {
        const observation = buildObservation(ctx.world, ctx.playerId, ctx.nowMs);
        if (observation.game.status === "playing") void this.decide(observation);
      }
    }
    if (this.fallback) return this.mock.update(ctx);
    if (this.input && now - this.inputObservedAt <= AI_CONFIG.maxResponseAgeMs &&
        now - this.inputAcceptedAt < Math.min(AI_CONFIG.staleMs, this.input.holdForMs) &&
        ctx.tick - this.input.basedOnTick <= AI_CONFIG.maxTickAgeTicks) return { ...this.input };
    return neutralInput(ctx.episodeId, ctx.tick);
  }

  dispose(): void {
    this.disposed = true;
    this.generation++;
    this.abort?.abort();
    this.mock.dispose();
  }
}
