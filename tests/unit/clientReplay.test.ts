import { describe, expect, it } from "vitest";
import { neutralInput } from "../../src/game/contracts/input";
import { CONSENSUS_HEIGHTS } from "../../src/game/levels/consensusHeights";
import {
  ComparisonMetrics,
  createComparisonWorld,
  HumanInputRecording,
  replayHumanInput,
} from "../../src/game/replay";
import { stepWorld } from "../../src/game/sim/step";
import { createWorld } from "../../src/game/sim/world";

function initialWorld(episodeId = "recorded") {
  return createWorld({
    level: CONSENSUS_HEIGHTS,
    seed: 725,
    episodeId,
    directive: "GUARDIAN",
    slots: { p1: "HUMAN", p2: "MOCK_AI" },
  });
}

describe("human input replay", () => {
  it("rebases recorded controls to a fresh episode without changing the recording", () => {
    const world = initialWorld();
    const recording = new HumanInputRecording(world);
    const action = {
      ...neutralInput(world.episodeId, 0),
      horizontal: "left" as const,
      shoot: true,
    };
    recording.record(world, action);
    const replay = recording.snapshot();
    const replayed = replayHumanInput(replay, 0, "comparison");
    expect(replayed).toEqual({ ...action, episodeId: "comparison" });
    replayed.shoot = false;
    replay.actions[0].horizontal = "right";
    expect(recording.snapshot().actions[0]).toMatchObject({
      horizontal: "left",
      shoot: true,
    });
    expect(replayHumanInput(replay, 1, "comparison")).toEqual(
      neutralInput("comparison", 1),
    );
  });

  it("rejects skipped ticks, old episodes and nonhuman recordings", () => {
    const world = initialWorld();
    const recording = new HumanInputRecording(world);
    expect(() => recording.record(world, neutralInput("old", 0))).toThrow(
      /one human episode/,
    );
    expect(() =>
      recording.record(world, neutralInput(world.episodeId, 3)),
    ).toThrow(/consecutive/);
    world.slots.p1 = "MOCK_AI";
    expect(() => new HumanInputRecording(world)).toThrow(/human inputs/);
    expect(() =>
      recording.record(world, neutralInput(world.episodeId, 0)),
    ).toThrow(/one human episode/);
  });

  it("replays the human movement through the same simulation inputs", () => {
    const original = initialWorld();
    const recording = new HumanInputRecording(original);
    for (let tick = 0; tick < 100; tick++) {
      const p1 = {
        ...neutralInput(original.episodeId, tick),
        horizontal: "right" as const,
        verticalAction:
          tick >= 10 && tick < 25 ? ("jump" as const) : ("none" as const),
      };
      recording.record(original, p1);
      stepWorld(original, { p1, p2: neutralInput(original.episodeId, tick) });
    }
    const replay = recording.snapshot();
    const comparison = createComparisonWorld(
      replay,
      CONSENSUS_HEIGHTS,
      "COLLECTOR",
      "new",
      "MOCK_AI",
    );
    for (let tick = 0; tick < replay.actions.length; tick++) {
      stepWorld(comparison, {
        p1: replayHumanInput(replay, tick, comparison.episodeId),
        p2: neutralInput(comparison.episodeId, tick),
      });
    }
    expect(comparison.players.p1.pos).toEqual(original.players.p1.pos);
    expect(comparison.players.p1.vel).toEqual(original.players.p1.vel);
    expect(comparison.seed).toBe(replay.seed);
    expect(comparison.directive).toBe("COLLECTOR");
    expect(() =>
      createComparisonWorld(
        replay,
        CONSENSUS_HEIGHTS,
        "COLLECTOR",
        "recorded",
        "JEV",
      ),
    ).toThrow(/fresh episode/);
    expect(() =>
      createComparisonWorld(
        replay,
        { ...CONSENSUS_HEIGHTS, id: "other" },
        "COLLECTOR",
        "new",
        "JEV",
      ),
    ).toThrow(/this level/);
  });

  it("reports team kills separately from Jev pickups and counts fallback ticks", () => {
    const world = initialWorld();
    const recording = new HumanInputRecording(world);
    recording.record(world, neutralInput(world.episodeId, 0));
    const metrics = new ComparisonMetrics(world);
    const before = structuredClone(world);
    metrics.sample(
      world,
      [
        {
          type: "enemy_killed",
          enemyId: "enemy",
          enemyType: "doom_prophet",
          pos: { x: 0, y: 0 },
          score: 100,
        },
        {
          type: "pickup",
          playerId: "p1",
          pickupId: "a",
          pickupType: "coin",
          value: 3,
        },
        {
          type: "pickup",
          playerId: "p2",
          pickupId: "b",
          pickupType: "coin",
          value: 2,
        },
        { type: "player_revived", playerId: "p1", by: "p2" },
      ],
      true,
    );
    metrics.decision(120);
    metrics.decision(180);
    metrics.decision(Number.NaN);
    expect(metrics.result(world, recording.snapshot(), "JEV")).toMatchObject({
      teamKills: 1,
      jevCoins: 2,
      jevRevives: 1,
      fallbackTicks: 1,
      decisions: 2,
      averageLatencyMs: 150,
    });
    expect(world).toEqual(before);
  });
});
