// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createClientAudio } from "@/game/client/audio";
import { ClientSession, type SessionOptions } from "@/game/client/session";
import { defaultSettings } from "@/game/client/settings";
import { AI_CONFIG } from "@/game/config/ai";
import { TICK_MS } from "@/game/config/movement";
import { DecisionRequestSchema, type DecisionResponse } from "@/game/contracts/decision";
import { DirectiveIdSchema, DIRECTIVES } from "@/game/contracts/directives";
import { neutralInput } from "@/game/contracts/input";
import { GameObservationV1Schema } from "@/game/contracts/observation";
import { buildObservation } from "@/game/observation/build";
import { stepWorld } from "@/game/sim/step";

const sessions: ClientSession[] = [];
const options: SessionOptions = {
  slots: { p1: "HUMAN", p2: "MOCK_AI" },
  directive: "GUARDIAN",
};

afterEach(() => {
  sessions.splice(0).forEach((session) => session.dispose());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function createSession(opts = options) {
  const settings = defaultSettings();
  settings.bindings.right = ["KeyL"];
  const audio = createClientAudio();
  const session = new ClientSession(opts, settings, audio, false);
  sessions.push(session);
  return { session, audio, settings };
}

function liveHarness() {
  vi.useFakeTimers();
  const requests: Array<{
    url: string;
    init?: RequestInit;
    resolve: (response: Response) => void;
  }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(
      (url, init) =>
        new Promise((resolve) => {
          requests.push({ url: String(url), init, resolve });
        }),
    ),
  );
  const { session } = createSession({
    ...options,
    slots: { p1: "HUMAN", p2: "JEV" },
  });
  const replySession = (index: number) =>
    requests[index].resolve(
      Response.json({
        sessionToken: "test-session-token",
        expiresAt: Date.now() + 1800000,
        requestBudget: 1200,
      }),
    );
  const decision = (index: number, horizontal: "left" | "right"): DecisionResponse => {
    const { observation } = DecisionRequestSchema.parse(
      JSON.parse(String(requests[index].init?.body)),
    );
    const answer = (choice: string) => ({
      choice,
      confidence: 1,
      probabilities: { [choice]: 1 },
    });
    return {
      requestId: `request-${index}`,
      episodeId: observation.episodeId,
      basedOnTick: observation.tick,
      input: {
        ...neutralInput(observation.episodeId, observation.tick),
        horizontal,
      },
      answers: {
        horizontal_input: answer(horizontal),
        vertical_action: answer("none"),
        shoot_input: answer("false"),
        dash_input: answer("false"),
        interaction_input: answer("false"),
        input_duration: answer("100"),
      },
      gated: {
        horizontal: false,
        vertical: false,
        shoot: false,
        dash: false,
        interact: false,
      },
      latencyMs: 10,
      model: "test",
    };
  };
  return { session, requests, replySession, decision };
}

describe("live directive changes", () => {
  it("keeps world state, held remapped input, clock remainder and audio intact", () => {
    const { session, audio, settings } = createSession();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyL" }));
    session.advance(TICK_MS * 2.5, 0);
    session.world.players.p2.health = 37;
    session.world.players.p2.dashCooldownMs = 170;
    session.world.score = 520;
    session.world.coins = 6;
    const before = structuredClone(session.world);
    const onSnapshot = vi.fn();
    session.onSnapshot = onSnapshot;
    const music = vi.spyOn(audio, "startMusic");
    const muted = vi.spyOn(audio, "setMuted");
    const world = session.world;
    session.setDirective("MONSTER_SLAYER");

    expect(session.world).toBe(world);
    expect(session.world).toEqual({ ...before, directive: "MONSTER_SLAYER" });
    expect(session.settings).toBe(settings);
    expect(music).not.toHaveBeenCalled();
    expect(muted).not.toHaveBeenCalled();
    expect(onSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        world: { ...before, directive: "MONSTER_SLAYER" },
        decision: null,
        observation: null,
      }),
    );
    session.advance(TICK_MS * 0.5, 1);
    expect(session.world.tick).toBe(before.tick + 1);
    expect(session.lastInputs.p1?.horizontal).toBe("right");
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyL" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD" }));
    session.advance(TICK_MS, 2);
    expect(session.lastInputs.p1?.horizontal).toBe("neutral");
  });

  it("keeps pause state and does not restart controllers for the same mode or after disposal", () => {
    const { session } = createSession();
    session.setPaused(true);
    const before = structuredClone(session.world);
    session.setDirective("COLLECTOR");
    session.advance(1000, 1000);
    expect(session.world).toEqual({ ...before, directive: "COLLECTOR" });
    const publish = vi.fn();
    session.onSnapshot = publish;
    session.setDirective("COLLECTOR");
    expect(publish).not.toHaveBeenCalled();
    session.dispose();
    session.setDirective("SPEEDRUNNER");
    expect(session.world.directive).toBe("COLLECTOR");
  });

  it("rejects late prior-mode decisions even if transport ignores abort", async () => {
    const { session, requests, replySession, decision } = liveHarness();
    const snapshots = vi.fn();
    session.onSnapshot = snapshots;
    replySession(0);
    await vi.advanceTimersByTimeAsync(AI_CONFIG.minIntervalMs);
    session.advance(TICK_MS, performance.now());
    expect(requests[1].url).toBe("/api/jev/decision");
    const stale = decision(1, "right");
    const episodeId = session.world.episodeId;

    session.setDirective("MONSTER_SLAYER");
    expect(requests[1].init?.signal?.aborted).toBe(true);
    expect(JSON.parse(String(requests[2].init?.body))).toEqual({ episodeId });
    requests[1].resolve(Response.json(stale));
    replySession(2);
    await vi.advanceTimersByTimeAsync(AI_CONFIG.minIntervalMs);
    session.advance(TICK_MS, performance.now());
    expect(session.lastInputs.p2?.horizontal).toBe("neutral");
    const nextRequest = DecisionRequestSchema.parse(JSON.parse(String(requests[3].init?.body)));
    expect(nextRequest.observation.directive.id).toBe("MONSTER_SLAYER");
    expect(nextRequest.observation.episodeId).toBe(episodeId);
    requests[3].resolve(Response.json(decision(3, "left")));
    await vi.advanceTimersByTimeAsync(0);
    session.advance(TICK_MS, performance.now());
    expect(session.lastInputs.p2?.horizontal).toBe("left");
    session.publish();
    expect(snapshots.mock.lastCall?.[0].jevStatus.lastRequestId).toBe("request-3");
  });

  it("discards already held AI input and ignores superseded session connections on rapid switches", async () => {
    const { session, requests, replySession, decision } = liveHarness();
    replySession(0);
    await vi.advanceTimersByTimeAsync(AI_CONFIG.minIntervalMs);
    session.advance(TICK_MS, performance.now());
    requests[1].resolve(Response.json(decision(1, "right")));
    await vi.advanceTimersByTimeAsync(0);
    session.advance(TICK_MS, performance.now());
    expect(session.lastInputs.p2?.horizontal).toBe("right");

    session.setDirective("COLLECTOR");
    session.setDirective("SCORE_HUNTER");
    expect(requests[2].init?.signal?.aborted).toBe(true);
    session.advance(TICK_MS, performance.now());
    expect(session.lastInputs.p2?.horizontal).toBe("neutral");
    replySession(3);
    replySession(2);
    await vi.advanceTimersByTimeAsync(AI_CONFIG.minIntervalMs);
    session.advance(TICK_MS, performance.now());
    expect(requests.filter((request) => request.url === "/api/jev/decision")).toHaveLength(2);
    const { observation } = DecisionRequestSchema.parse(JSON.parse(String(requests[4].init?.body)));
    expect(observation.directive.id).toBe("SCORE_HUNTER");
    session.setDirective("SCORE_HUNTER");
    expect(requests).toHaveLength(5);
  });
});

describe("directive contract", () => {
  it.each(DirectiveIdSchema.options)(
    "validates %s in observations without altering simulation rules",
    (directive) => {
      const { session } = createSession();
      const before = structuredClone(session.world);
      session.setDirective(directive);
      const observation = GameObservationV1Schema.parse(buildObservation(session.world, "p2", 0));
      expect(observation.directive).toEqual({
        id: directive,
        description: DIRECTIVES[directive].description,
      });
      const inputs = {
        p1: {
          ...neutralInput(before.episodeId, before.tick),
          horizontal: "right" as const,
        },
        p2: {
          ...neutralInput(before.episodeId, before.tick),
          horizontal: "left" as const,
          shoot: true,
        },
      };
      stepWorld(before, inputs);
      stepWorld(session.world, inputs);
      expect(session.world).toEqual({ ...before, directive });
    },
  );
});
