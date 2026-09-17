import type { PlayerInputV1 } from "../contracts/input";
import { MockAIController } from "./mock";
import type { ControllerContext, PlayerController } from "./types";

export interface JevControllerOptions {
  /** Injected for tests; defaults to global fetch. */
  fetch?: typeof fetch;
  /** Called whenever the controller's status changes (for HUD / dev panel). */
  onStatus?: (status: JevStatus) => void;
}

export interface JevStatus {
  mode: "connecting" | "live" | "waiting" | "fallback_mock" | "error";
  lastLatencyMs: number | null;
  lastRequestId: string | null;
  consecutiveFailures: number;
  requestsSent: number;
  lastError: string | null;
}

/**
 * PLACEHOLDER — the real TypeSafe-backed controller (session token, adaptive
 * cadence, one request in flight, stale-tick rejection, confidence gating,
 * mock fallback) replaces this file. Until then it delegates to the mock so
 * the client can be wired end-to-end.
 */
export class JevController implements PlayerController {
  readonly kind = "JEV" as const;
  private mock = new MockAIController();
  private status: JevStatus = {
    mode: "fallback_mock",
    lastLatencyMs: null,
    lastRequestId: null,
    consecutiveFailures: 0,
    requestsSent: 0,
    lastError: "JevController not implemented yet",
  };

  constructor(private readonly opts: JevControllerOptions = {}) {
    opts.onStatus?.(this.status);
  }

  getStatus(): JevStatus {
    return this.status;
  }

  update(ctx: ControllerContext): PlayerInputV1 {
    return this.mock.update(ctx);
  }

  dispose(): void {
    this.mock.dispose();
  }
}
