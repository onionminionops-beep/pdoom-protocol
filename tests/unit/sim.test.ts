import { describe, expect, it } from "vitest";
import { CONSENSUS_HEIGHTS } from "@/game/levels/consensusHeights";
import { createWorld } from "@/game/sim/world";
import { stepWorld } from "@/game/sim/step";
import { neutralInput, type PlayerInputV1 } from "@/game/contracts/input";
import { buildObservation } from "@/game/observation/build";
import { GameObservationV1Schema, serializeObservation } from "@/game/contracts/observation";
import { MockAIController } from "@/game/controllers/mock";
import { MOVEMENT } from "@/game/config/movement";

function mk(slots: Parameters<typeof createWorld>[0]["slots"] = { p1: "HUMAN", p2: "MOCK_AI" }) {
  return createWorld({
    level: CONSENSUS_HEIGHTS,
    seed: 42,
    episodeId: "ep-test",
    directive: "SPEEDRUNNER",
    slots,
  });
}

function input(ep: string, tick: number, patch: Partial<PlayerInputV1>): PlayerInputV1 {
  return { ...neutralInput(ep, tick), ...patch };
}

describe("simulation", () => {
  it("is deterministic for identical inputs", () => {
    const a = mk();
    const b = mk();
    for (let t = 0; t < 600; t++) {
      const i1 = input("ep-test", t, {
        horizontal: "right",
        shoot: t % 20 === 0,
        verticalAction: t % 90 === 0 ? "jump" : "none",
      });
      const i2 = input("ep-test", t, { horizontal: "right", shoot: t % 13 === 0 });
      stepWorld(a, { p1: i1, p2: i2 });
      stepWorld(b, { p1: i1, p2: i2 });
    }
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it("uses identical physics for User and JEV", () => {
    const w = mk();
    w.players.p2.pos = { ...w.players.p1.pos };
    for (let t = 0; t < 120; t++) {
      const i = input("ep-test", t, {
        horizontal: "right",
        verticalAction: t < 5 ? "jump" : "none",
      });
      stepWorld(w, { p1: i, p2: { ...i } });
    }
    expect(w.players.p1.pos).toEqual(w.players.p2.pos);
    expect(w.players.p1.vel).toEqual(w.players.p2.vel);
  });

  it("only changes facing on explicit horizontal input and fires along facing", () => {
    const w = mk({ p1: "HUMAN", p2: "DISABLED" });
    const p = w.players.p1;
    expect(p.facing).toBe("right");
    stepWorld(w, {
      p1: input("ep-test", 0, { horizontal: "left" }),
      p2: neutralInput("ep-test", 0),
    });
    expect(p.facing).toBe("left");
    for (let t = 1; t < 30; t++)
      stepWorld(w, {
        p1: input("ep-test", t, { horizontal: "neutral" }),
        p2: neutralInput("ep-test", t),
      });
    expect(p.facing).toBe("left");
    const ev = stepWorld(w, {
      p1: input("ep-test", 30, { shoot: true }),
      p2: neutralInput("ep-test", 30),
    });
    const shot = ev.find((e) => e.type === "shot");
    expect(shot).toBeDefined();
    const proj = w.projectiles[0];
    expect(proj.vel.x).toBeLessThan(0);
    expect(proj.vel.y).toBe(0);
  });

  it("ignores inputs from a stale episode", () => {
    const w = mk({ p1: "HUMAN", p2: "DISABLED" });
    const x0 = w.players.p1.pos.x;
    for (let t = 0; t < 30; t++)
      stepWorld(w, {
        p1: input("old-episode", t, { horizontal: "right" }),
        p2: neutralInput("ep-test", t),
      });
    expect(w.players.p1.pos.x).toBe(x0);
  });

  it("does not let friendly launcher fire hurt the teammate", () => {
    const w = mk({ p1: "HUMAN", p2: "MOCK_AI" });
    w.players.p1.weapon = "launcher";
    w.players.p1.ammo.launcher = 6;
    w.players.p2.pos = { x: w.players.p1.pos.x + 30, y: w.players.p1.pos.y };
    const hp = w.players.p2.health;
    for (let t = 0; t < 120; t++)
      stepWorld(w, { p1: input("ep-test", t, { shoot: true }), p2: neutralInput("ep-test", t) });
    expect(w.players.p2.health).toBe(hp);
  });

  it("produces a valid, deterministic observation with relative coordinates", () => {
    const w = mk();
    for (let t = 0; t < 60; t++)
      stepWorld(w, {
        p1: input("ep-test", t, { horizontal: "right" }),
        p2: neutralInput("ep-test", t),
      });
    const o1 = buildObservation(w, "p2", 1000);
    const o2 = buildObservation(w, "p2", 1000);
    expect(GameObservationV1Schema.safeParse(o1).success).toBe(true);
    expect(serializeObservation(o1)).toEqual(serializeObservation(o2));
    expect(o1.teammate.relativePosition.x).toBeCloseTo(w.players.p1.pos.x - w.players.p2.pos.x);
    for (let i = 1; i < o1.pickups.length; i++)
      expect(o1.pickups[i].distance).toBeGreaterThanOrEqual(o1.pickups[i - 1].distance);
  });

  it("mock AI plays legally through the input contract and makes progress", () => {
    const w = mk({ p1: "DISABLED", p2: "MOCK_AI" });
    const mock = new MockAIController();
    const x0 = w.players.p2.pos.x;
    for (let t = 0; t < 60 * 20; t++) {
      const inp = mock.update({
        world: w,
        playerId: "p2",
        tick: w.tick,
        episodeId: w.episodeId,
        nowMs: t * (1000 / 60),
      });
      expect(inp.schemaVersion).toBe("1.0");
      stepWorld(w, { p1: neutralInput("ep-test", w.tick), p2: inp });
    }
    expect(w.players.p2.pos.x).toBeGreaterThan(x0 + MOVEMENT.runSpeed * 2);
  });

  it("exposes held jump while airborne even though another jump cannot start", () => {
    const w = mk();
    w.players.p2.pos = { x: 350, y: 492 };
    w.players.p2.grounded = true;
    stepWorld(w, {
      p1: neutralInput(w.episodeId, w.tick),
      p2: input(w.episodeId, w.tick, { verticalAction: "jump" }),
    });
    const obs = buildObservation(w, "p2", 0);
    expect(obs.self).toMatchObject({ jumpHeld: true, canJump: false, grounded: false });
    expect(obs.self.velocity.y).toBeLessThan(0);
    expect(GameObservationV1Schema.parse(obs).self.jumpHeld).toBe(true);
    stepWorld(w, {
      p1: neutralInput(w.episodeId, w.tick),
      p2: neutralInput(w.episodeId, w.tick),
    });
    expect(buildObservation(w, "p2", 0).self.jumpHeld).toBe(false);
  });

  it("accepts older observations that omit held jump state", () => {
    const obs = buildObservation(mk(), "p2", 0);
    const legacySelf = Object.fromEntries(
      Object.entries(obs.self).filter(([key]) => key !== "jumpHeld"),
    );
    expect(GameObservationV1Schema.parse({ ...obs, self: legacySelf }).self.jumpHeld).toBe(false);
  });

  it("holds mock jump through ascent and clears the tutorial ledge like a human", () => {
    const w = mk();
    for (const player of Object.values(w.players)) {
      player.pos = { x: 350, y: 492 };
      player.grounded = true;
    }
    const mock = new MockAIController();
    const minY = { p1: 492, p2: 492 };
    let released = false;
    for (let t = 0; t < 45; t++) {
      const inp = mock.update({
        world: w,
        playerId: "p2",
        tick: w.tick,
        episodeId: w.episodeId,
        nowMs: t * (1000 / 60),
      });
      if (t === 9) expect(inp.verticalAction).toBe("jump");
      if (t > 20 && inp.verticalAction === "none") released = true;
      stepWorld(w, {
        p1: input(w.episodeId, w.tick, {
          horizontal: "right",
          verticalAction: t < 20 ? "jump" : "none",
        }),
        p2: inp,
      });
      for (const id of ["p1", "p2"] as const) minY[id] = Math.min(minY[id], w.players[id].pos.y);
    }
    expect(released).toBe(true);
    expect(492 - minY.p2).toBeGreaterThan(64);
    expect(minY.p2).toBeCloseTo(minY.p1);
    expect(w.players.p2.pos).toEqual(w.players.p1.pos);
    expect(w.players.p2.pos.x).toBeGreaterThan(384 + MOVEMENT.bodyWidth / 2);
  });
});
