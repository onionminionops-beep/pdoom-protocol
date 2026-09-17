import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AI_CONFIG } from "@/game/config/ai";
import { JevController } from "@/game/controllers/jev";
import { DecisionRequestSchema, type DecisionResponse } from "@/game/contracts/decision";
import { PlayerInputV1Schema, neutralInput } from "@/game/contracts/input";
import { CONSENSUS_HEIGHTS } from "@/game/levels/consensusHeights";
import { stepWorld } from "@/game/sim/step";
import { createWorld } from "@/game/sim/world";

const controllers: JevController[] = [];

function harness(honorAbort = true) {
  const world = createWorld({
    level: CONSENSUS_HEIGHTS,
    seed: 42,
    episodeId: "ep-test",
    directive: "SPEEDRUNNER",
    slots: { p1: "HUMAN", p2: "JEV" },
  });
  const requests: Array<{
    url: string;
    init?: RequestInit;
    resolve: (response: Response) => void;
  }> = [];
  const fetcher = vi.fn<typeof fetch>(
    (url, init) =>
      new Promise((resolve, reject) => {
        requests.push({ url: String(url), init, resolve });
        if (honorAbort)
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
      }),
  );
  const onStatus = vi.fn();
  const controller = new JevController({
    fetch: fetcher,
    episodeId: world.episodeId,
    now: Date.now,
    onStatus,
  });
  controllers.push(controller);
  const update = (tick = world.tick) => {
    world.tick = tick;
    return controller.update({
      world,
      playerId: "p2",
      tick,
      episodeId: world.episodeId,
      nowMs: Date.now(),
    });
  };
  const replySession = (
    index = 0,
    requestBudget: number | null = 1200,
    expiresAt = Date.now() + 1800000,
    minDecisionIntervalMs?: number,
  ) => {
    requests[index].resolve(
      Response.json({
        sessionToken: "test-session-token",
        requestBudget,
        expiresAt,
        minDecisionIntervalMs,
      }),
    );
  };
  const decision = (index = requests.length - 1): DecisionResponse => {
    const { observation } = DecisionRequestSchema.parse(
      JSON.parse(String(requests[index].init?.body)),
    );
    const answer = (choice: string) => ({ choice, confidence: 1, probabilities: { [choice]: 1 } });
    return {
      requestId: `req-${index}`,
      episodeId: observation.episodeId,
      basedOnTick: observation.tick,
      input: {
        ...neutralInput(observation.episodeId, observation.tick),
        horizontal: "right",
        shoot: true,
        holdForMs: 250,
      },
      answers: {
        horizontal_input: answer("right"),
        vertical_action: answer("none"),
        shoot_input: answer("true"),
        dash_input: answer("false"),
        interaction_input: answer("false"),
        input_duration: answer("250"),
      },
      gated: { horizontal: false, vertical: false, shoot: false, dash: false, interact: false },
      latencyMs: 20,
      model: "jev-test",
    };
  };
  const replyDecision = (data = decision(), index = requests.length - 1) =>
    requests[index].resolve(Response.json(data));
  const replyError = (code = "upstream_unavailable", retryAfterMs?: number) => {
    requests[requests.length - 1].resolve(
      Response.json(
        {
          error: code,
          message: "Unavailable",
          retryAfterMs,
        },
        { status: 503 },
      ),
    );
  };
  return {
    world,
    controller,
    onStatus,
    requests,
    update,
    replySession,
    replyDecision,
    replyError,
    decision,
  };
}

const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
});
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose();
  vi.useRealTimers();
});

describe("JevController", () => {
  it("connects on construction and never overlaps session or decision requests", async () => {
    const h = harness();
    expect(h.requests.map((r) => r.url)).toEqual(["/api/jev/session"]);
    expect(h.controller.getStatus().mode).toBe("connecting");
    for (let tick = 0; tick < 10; tick++)
      expect(h.update(tick)).toEqual(neutralInput("ep-test", tick));
    expect(h.requests).toHaveLength(1);
    h.replySession();
    await flush();
    h.update(10);
    expect(h.requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(AI_CONFIG.minIntervalMs);
    h.update(11);
    expect(h.requests).toHaveLength(2);
    for (let tick = 12; tick < 30; tick++) h.update(tick);
    expect(h.requests).toHaveLength(2);
    h.replyDecision();
    await flush();
    expect(h.controller.getStatus()).toMatchObject({
      mode: "live",
      requestsSent: 1,
      consecutiveFailures: 0,
    });
    expect(h.onStatus).toHaveBeenLastCalledWith(h.controller.getStatus());
    expect(h.controller.getLastDecision()?.observation.tick).toBe(11);
  });

  it("expires the previous hold while waiting for the next decision", async () => {
    const h = harness();
    h.replySession();
    await flush();
    await vi.advanceTimersByTimeAsync(100);
    const snapshot = JSON.stringify(h.world);
    h.update();
    h.replyDecision();
    await flush();
    expect(h.update().horizontal).toBe("right");
    expect(JSON.stringify(h.world)).toBe(snapshot);
    await vi.advanceTimersByTimeAsync(249);
    h.update(14);
    expect(h.requests).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.update(15)).toEqual(neutralInput("ep-test", 15));
    expect(h.requests).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(151);
    expect(h.update(25)).toEqual(neutralInput("ep-test", 25));
    expect(h.requests).toHaveLength(3);
  });

  it.each(["episode", "tick", "input-episode", "input-tick", "tick-age", "time-age"])(
    "rejects a response with stale %s",
    async (kind) => {
      const h = harness();
      h.replySession();
      await flush();
      await vi.advanceTimersByTimeAsync(100);
      h.update(10);
      const response = h.decision();
      if (kind === "episode") response.episodeId = "old-episode";
      if (kind === "tick") response.basedOnTick = 9;
      if (kind === "input-episode") response.input.episodeId = "old-episode";
      if (kind === "input-tick") response.input.basedOnTick = 9;
      if (kind === "tick-age") h.update(10 + AI_CONFIG.maxTickAgeTicks + 1);
      if (kind === "time-age") await vi.advanceTimersByTimeAsync(AI_CONFIG.maxResponseAgeMs + 1);
      h.replyDecision(response);
      await flush();
      expect(h.controller.getLastDecision()).toBeNull();
      expect(h.controller.getStatus()).toMatchObject({ mode: "error", consecutiveFailures: 1 });
      expect(h.update().horizontal).toBe("neutral");
    },
  );

  it("ignores an old episode response even if transport ignores cancellation", async () => {
    const h = harness(false);
    h.replySession();
    await flush();
    await vi.advanceTimersByTimeAsync(100);
    h.update();
    const old = h.decision();
    h.world.episodeId = "new-episode";
    expect(h.update(0)).toEqual(neutralInput("new-episode", 0));
    expect(h.requests[1].init?.signal?.aborted).toBe(true);
    expect(h.requests).toHaveLength(2);
    h.replyDecision(old);
    await flush();
    expect(h.controller.getLastDecision()).toBeNull();
    h.update();
    expect(h.requests).toHaveLength(3);
    expect(JSON.parse(String(h.requests[2].init?.body))).toEqual({ episodeId: "new-episode" });
    h.replySession(2);
    await flush();
    expect(h.controller.getStatus().consecutiveFailures).toBe(0);
  });

  it("falls back after repeated failures, keeps mock inputs legal, and periodically recovers", async () => {
    const h = harness();
    h.replySession();
    await flush();
    await vi.advanceTimersByTimeAsync(100);
    for (let failure = 1; failure <= AI_CONFIG.consecutiveFailuresBeforeMock; failure++) {
      h.update(failure);
      h.replyError();
      await flush();
      if (failure < AI_CONFIG.consecutiveFailuresBeforeMock)
        await vi.advanceTimersByTimeAsync(100 * 2 ** failure);
    }
    expect(h.controller.getStatus().mode).toBe("fallback_mock");
    const count = h.requests.length;
    expect(PlayerInputV1Schema.safeParse(h.update(5)).success).toBe(true);
    await vi.advanceTimersByTimeAsync(AI_CONFIG.retryLiveAfterMs - 1);
    h.update(6);
    expect(h.requests).toHaveLength(count);
    await vi.advanceTimersByTimeAsync(1);
    h.update(7);
    expect(h.requests).toHaveLength(count + 1);
    expect(h.controller.getStatus().mode).toBe("fallback_mock");
    h.replyDecision();
    await flush();
    expect(h.controller.getStatus()).toMatchObject({
      mode: "live",
      consecutiveFailures: 0,
      lastError: null,
    });
    expect(h.update().horizontal).toBe("right");
  });

  it("respects Retry-After before retrying", async () => {
    const h = harness();
    h.replySession();
    await flush();
    await vi.advanceTimersByTimeAsync(100);
    h.update();
    h.replyError("rate_limited", 60000);
    await flush();
    await vi.advanceTimersByTimeAsync(59999);
    h.update(1);
    expect(h.requests).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    h.update(2);
    expect(h.requests).toHaveLength(3);
  });

  it("waits for session expiry after exhausting its budget", async () => {
    const h = harness();
    h.replySession(0, 1, Date.now() + 1000);
    await flush();
    await vi.advanceTimersByTimeAsync(100);
    h.update();
    h.replyDecision();
    await flush();
    await vi.advanceTimersByTimeAsync(250);
    h.update(1);
    expect(h.controller.getStatus()).toMatchObject({
      mode: "fallback_mock",
      lastError: "session_budget_exhausted",
    });
    expect(h.requests).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(650);
    h.update(2);
    expect(h.requests[2].url).toBe("/api/jev/session");
  });

  it("accepts null budgets, uses the 100 ms floor beyond 1200 decisions and still renews on expiry", async () => {
    const h = harness();
    const expiresAt = Date.now() + 1800000;
    h.replySession(0, null, expiresAt, 100);
    await flush();
    for (let i = 1; i <= 1205; i++) {
      await vi.advanceTimersByTimeAsync(100);
      h.update(i * 6);
      expect(h.requests).toHaveLength(i + 1);
      h.update(i * 6 + 1);
      expect(h.requests).toHaveLength(i + 1);
      const result = h.decision();
      result.input.holdForMs = 100;
      result.answers.input_duration = {
        choice: "100",
        confidence: 1,
        probabilities: { "100": 1 },
      };
      h.replyDecision(result);
      await flush();
      expect(h.controller.getStatus()).toMatchObject({
        mode: "live",
        minDecisionIntervalMs: 100,
        consecutiveFailures: 0,
      });
    }
    expect(h.requests.filter((r) => r.url === "/api/jev/session")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(expiresAt - Date.now());
    h.update(108000);
    expect(h.requests.filter((r) => r.url === "/api/jev/session")).toHaveLength(2);
  });

  it.each([0, -1])("still rejects a nonpositive numeric session budget: %s", async (budget) => {
    const h = harness();
    h.replySession(0, budget);
    await flush();
    expect(h.controller.getStatus()).toMatchObject({ mode: "error", consecutiveFailures: 1 });
  });

  it("rejects an expired session even with a null budget", async () => {
    const h = harness();
    h.replySession(0, null, Date.now());
    await flush();
    expect(h.controller.getStatus()).toMatchObject({ mode: "error", consecutiveFailures: 1 });
  });

  it("aborts timed out requests and ignores responses after disposal", async () => {
    const h = harness();
    await vi.advanceTimersByTimeAsync(AI_CONFIG.requestTimeoutMs + 501);
    expect(h.requests[0].init?.signal?.aborted).toBe(true);
    expect(h.controller.getStatus()).toMatchObject({ mode: "error", consecutiveFailures: 1 });
    h.controller.dispose();
    h.replySession();
    await flush();
    expect(h.update()).toEqual(neutralInput("ep-test", 0));
    expect(h.requests).toHaveLength(1);
  });

  it("does not send decisions while the world has ended or repeat a sent tick", async () => {
    const h = harness();
    h.replySession();
    await flush();
    await vi.advanceTimersByTimeAsync(100);
    h.world.status = "won";
    h.update();
    expect(h.requests).toHaveLength(1);
    h.world.status = "playing";
    h.update();
    h.replyDecision();
    await flush();
    await vi.advanceTimersByTimeAsync(250);
    h.update();
    expect(h.requests).toHaveLength(2);
  });

  it("paces a ten-minute slice within the unchanged IP and session budgets", async () => {
    const h = harness();
    const start = Date.now();
    const sent: number[] = [];
    h.replySession(0, 1200, start + 1800000, 550);
    await flush();
    for (let elapsed = 100; elapsed < 600000 - 150; elapsed += 550) {
      await vi.advanceTimersByTimeAsync(elapsed - (Date.now() - start));
      h.update(Math.floor(elapsed * 0.06));
      sent.push(Date.now());
      expect(h.requests).toHaveLength(sent.length + 1);
      await vi.advanceTimersByTimeAsync(150);
      h.update(Math.floor((elapsed + 150) * 0.06));
      expect(h.requests).toHaveLength(sent.length + 1);
      h.replyDecision();
      await flush();
      expect(h.controller.getStatus()).toMatchObject({
        mode: "live",
        minDecisionIntervalMs: 550,
        lastRoundTripMs: 150,
      });
      expect(h.update().horizontal).toBe("right");
      await vi.advanceTimersByTimeAsync(251);
      expect(h.update(Math.floor((elapsed + 401) * 0.06))).toEqual(
        neutralInput("ep-test", h.world.tick),
      );
      await vi.advanceTimersByTimeAsync(148);
      h.update(Math.floor((elapsed + 549) * 0.06));
      expect(h.requests).toHaveLength(sent.length + 1);
    }
    expect(sent.length).toBe(1091);
    expect(sent.length).toBeLessThan(1200);
    for (const time of sent) {
      expect(sent.filter((t) => t > time - 60000 && t <= time).length).toBeLessThanOrEqual(110);
    }
    expect(h.controller.getStatus().consecutiveFailures).toBe(0);
    expect(h.requests.filter((r) => r.url === "/api/jev/session")).toHaveLength(1);
  });

  it("keeps the advertised floor on failures, then resumes paced successes", async () => {
    const h = harness();
    h.replySession(0, 1200, Date.now() + 1800000, 550);
    await flush();
    await vi.advanceTimersByTimeAsync(100);
    h.update(6);
    h.replyError();
    await flush();
    await vi.advanceTimersByTimeAsync(549);
    h.update(38);
    expect(h.requests).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    h.update(39);
    expect(h.requests).toHaveLength(3);
    h.replyDecision();
    await flush();
    await vi.advanceTimersByTimeAsync(549);
    expect(h.update(71).horizontal).toBe("neutral");
    expect(h.requests).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(1);
    h.update(72);
    expect(h.requests).toHaveLength(4);
    expect(h.controller.getStatus().mode).toBe("waiting");
  });

  it.each([100, 150, 200, 250] as const)(
    "expires a received action after its %s ms hold without filling gaps with mock input",
    async (holdForMs) => {
      const h = harness();
      h.replySession(0, 1200, Date.now() + 1800000, 550);
      await flush();
      await vi.advanceTimersByTimeAsync(100);
      h.update(6);
      await vi.advanceTimersByTimeAsync(450);
      h.update(33);
      const result = h.decision();
      result.input.holdForMs = holdForMs;
      h.replyDecision(result);
      await flush();
      expect(h.controller.getStatus()).toMatchObject({
        mode: "live",
        lastRoundTripMs: 450,
        lastLatencyMs: 20,
      });
      expect(h.update().horizontal).toBe("right");
      await vi.advanceTimersByTimeAsync(holdForMs - 1);
      expect(h.update(33 + Math.floor((holdForMs - 1) * 0.06)).horizontal).toBe("right");
      await vi.advanceTimersByTimeAsync(1);
      expect(h.update()).toEqual(neutralInput("ep-test", h.world.tick));
      expect(h.requests).toHaveLength(3);
      expect(h.controller.getStatus().mode).toBe("waiting");
    },
  );

  it("continues a selected jump while the next delayed decision is in flight", async () => {
    const h = harness();
    h.replySession(0, 1200, Date.now() + 1800000, 100);
    await flush();
    await vi.advanceTimersByTimeAsync(100);
    h.update(6);
    const first = h.decision();
    first.input.verticalAction = "jump";
    first.input.holdForMs = 100;
    h.replyDecision(first);
    await flush();

    h.world.players.p2.grounded = true;
    h.world.players.p2.jumpHeld = false;
    let jumpTicks = 0;
    let delayedRequestScheduled = false;
    for (let tick = 7; tick < 27; tick++) {
      const input = h.update(tick);
      if (h.requests.length === 3 && !delayedRequestScheduled) {
        delayedRequestScheduled = true;
        const next = h.decision(2);
        next.input.verticalAction = "jump";
        next.input.holdForMs = 100;
        setTimeout(() => h.replyDecision(next, 2), 300);
      }
      if (input.verticalAction === "jump") jumpTicks++;
      stepWorld(h.world, {
        p1: neutralInput(h.world.episodeId, h.world.tick),
        p2: input,
      });
      await vi.advanceTimersByTimeAsync(17);
    }

    expect(delayedRequestScheduled).toBe(true);
    expect(jumpTicks).toBe(20);
    expect(h.world.players.p2.jumpHeld).toBe(true);
    expect(h.world.players.p2.vel.y).toBeLessThan(0);
  });

  it("honors a fresh release after continuing a jump through a delayed response", async () => {
    const h = harness();
    h.replySession(0, 1200, Date.now() + 1800000, 100);
    await flush();
    await vi.advanceTimersByTimeAsync(100);
    h.update(6);
    const first = h.decision();
    first.input.verticalAction = "jump";
    first.input.holdForMs = 100;
    h.replyDecision(first);
    await flush();
    h.world.players.p2.grounded = true;
    stepWorld(h.world, {
      p1: neutralInput(h.world.episodeId, h.world.tick),
      p2: h.update(7),
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(h.update(13).verticalAction).toBe("jump");
    await vi.advanceTimersByTimeAsync(200);
    expect(h.update(25).verticalAction).toBe("jump");
    const release = h.decision();
    release.input.verticalAction = "none";
    h.replyDecision(release);
    await flush();
    expect(h.update(26).verticalAction).toBe("none");
  });

  it.each([
    { limit: "receipt age", latency: 0, elapsed: 400, tick: 30 },
    { limit: "observation age", latency: 400, elapsed: 351, tick: 30 },
    { limit: "tick age", latency: 0, elapsed: 200, tick: 52 },
  ])("ends a pending jump at the $limit limit", async ({ latency, elapsed, tick }) => {
    const h = harness();
    h.replySession(0, 1200, Date.now() + 1800000, 100);
    await flush();
    await vi.advanceTimersByTimeAsync(100);
    h.update(6);
    const first = h.decision();
    first.input.verticalAction = "jump";
    first.input.holdForMs = 100;
    await vi.advanceTimersByTimeAsync(latency);
    h.replyDecision(first);
    await flush();
    h.world.players.p2.grounded = true;
    stepWorld(h.world, {
      p1: neutralInput(h.world.episodeId, h.world.tick),
      p2: h.update(7),
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(h.update(13).verticalAction).toBe("jump");
    await vi.advanceTimersByTimeAsync(elapsed - 100);
    expect(h.update(tick)).toEqual(neutralInput("ep-test", tick));
  });

  it("adapts above the pacing floor for a slow response without overlapping requests", async () => {
    const h = harness();
    h.replySession(0, 1200, Date.now() + 1800000, 550);
    await flush();
    await vi.advanceTimersByTimeAsync(100);
    h.update(6);
    await vi.advanceTimersByTimeAsync(599);
    h.update(41);
    expect(h.requests).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    h.replyDecision();
    await flush();
    expect(h.controller.getStatus()).toMatchObject({ lastRoundTripMs: 600, lastLatencyMs: 20 });
    await vi.advanceTimersByTimeAsync(119);
    expect(h.update(49).horizontal).toBe("right");
    expect(h.requests).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    h.update(49);
    expect(h.requests).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(31);
    expect(h.update(51)).toEqual(neutralInput("ep-test", 51));
  });

  it("does not renew a paced session to bypass its request cap", async () => {
    const h = harness();
    h.replySession(0, 2, Date.now() + 1800000, 550);
    await flush();
    await vi.advanceTimersByTimeAsync(100);
    h.update(6);
    h.replyDecision();
    await flush();
    await vi.advanceTimersByTimeAsync(550);
    h.update(39);
    h.replyDecision();
    await flush();
    await vi.advanceTimersByTimeAsync(550);
    h.update(72);
    expect(h.controller.getStatus()).toMatchObject({
      mode: "fallback_mock",
      lastError: "session_budget_exhausted",
    });
    await vi.advanceTimersByTimeAsync(60000);
    h.update(3672);
    expect(h.requests).toHaveLength(3);
    expect(h.requests.filter((r) => r.url === "/api/jev/session")).toHaveLength(1);
  });

  it.each(["wall-clock", "tick"] as const)(
    "never extends observation freshness after receipt (%s cap)",
    async (cap) => {
      const h = harness();
      h.replySession(0, 1200, Date.now() + 1800000, 550);
      await flush();
      await vi.advanceTimersByTimeAsync(100);
      h.update(6);
      await vi.advanceTimersByTimeAsync(700);
      h.update(48);
      h.replyDecision();
      await flush();
      expect(h.update().shoot).toBe(true);
      if (cap === "wall-clock") await vi.advanceTimersByTimeAsync(51);
      expect(h.update(cap === "tick" ? 52 : 51)).toEqual(neutralInput("ep-test", h.world.tick));
      expect(h.controller.getLastDecision()?.basedOnTick).toBe(6);
    },
  );
});
