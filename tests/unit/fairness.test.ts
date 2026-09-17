import { describe, expect, it } from "vitest";
import { MOVEMENT } from "@/game/config/movement";
import { WEAPONS } from "@/game/config/weapons";
import { neutralInput, PlayerInputV1Schema } from "@/game/contracts/input";
import { GameObservationV1Schema } from "@/game/contracts/observation";
import { MockAIController } from "@/game/controllers/mock";
import { buildObservation } from "@/game/observation/build";
import { CONSENSUS_HEIGHTS } from "@/game/levels/consensusHeights";
import { spawnEnemy } from "@/game/sim/enemies";
import { playerBox, tryShoot } from "@/game/sim/player";
import { rngInt } from "@/game/sim/rng";
import { stepWorld } from "@/game/sim/step";
import { createWorld } from "@/game/sim/world";
import type { PlayerState, WorldState } from "@/game/sim/types";
import { advance, arena, flatLevel } from "./helpers/world";
import { scriptedDriver } from "./helpers/playthrough";

function comparablePlayer(p: PlayerState) {
  return { ...p, id: "player", character: "character" };
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function comparableEpisode(world: WorldState) {
  const copy = structuredClone(world);
  copy.episodeId = "same";
  for (const p of Object.values(copy.players)) {
    if (p.lastInput) p.lastInput.episodeId = "same";
  }
  return copy;
}

describe("shared physics and fair inputs", () => {
  it("produces identical full player state and hitboxes over 32 random input sequences", () => {
    for (let seed = 0; seed < 32; seed++) {
      const level = flatLevel();
      level.spawns.p2 = [...level.spawns.p1];
      level.rows[14] = `${".".repeat(16)}###${".".repeat(77)}`;
      const a = arena({ level, seed, slots: { p1: "HUMAN", p2: "DISABLED" } });
      const b = arena({ level, seed, slots: { p1: "DISABLED", p2: "MOCK_AI" } });
      let state = seed;
      let input = neutralInput("arena", 0);
      for (let tick = 0; tick < 600; tick++) {
        if (tick % 8 === 0) {
          const r = rngInt(state, 0, 4096);
          state = r.state;
          input = {
            ...neutralInput("arena", tick),
            horizontal: (["left", "neutral", "right"] as const)[r.value % 3],
            verticalAction: (["none", "jump", "drop"] as const)[(r.value >> 2) % 3],
            shoot: !!(r.value & 32),
            dash: !!(r.value & 64),
            interact: !!(r.value & 128),
          };
        }
        const previousFacing = a.players.p1.facing;
        stepWorld(a, { p1: input, p2: input });
        stepWorld(b, { p1: input, p2: input });
        expect(comparablePlayer(a.players.p1)).toEqual(comparablePlayer(b.players.p2));
        expect(playerBox(a.players.p1)).toEqual(playerBox(b.players.p2));
        if (input.horizontal === "neutral") expect(a.players.p1.facing).toBe(previousFacing);
      }
    }
  });

  it.each(["blaster", "shotgun", "launcher"] as const)(
    "%s has a fixed muzzle, spread and direction independent of targets",
    (weapon) => {
      for (const id of ["p1", "p2"] as const) {
        for (const facing of ["left", "right"] as const) {
          const shots = [-200, 0, 200].map((dy) => {
            const world = arena();
            const p = world.players[id];
            p.weapon = weapon;
            p.facing = facing;
            spawnEnemy(world, "target", "doom_prophet", p.pos.x + 100, p.pos.y + dy, "arena");
            tryShoot(world, p, { ...neutralInput("arena", 0), shoot: true }, []);
            const dir = facing === "left" ? -1 : 1;
            const def = WEAPONS[weapon];
            expect(world.projectiles).toHaveLength(def.pellets);
            for (const [i, pr] of world.projectiles.entries()) {
              expect(pr.pos).toEqual({
                x: p.pos.x + dir * (MOVEMENT.bodyWidth / 2 + 6),
                y: p.pos.y - 4,
              });
              expect(pr.vel).toEqual({
                x: dir * def.projectileSpeed,
                y: def.pellets === 1 ? 0 : (i / (def.pellets - 1) - 0.5) * 2 * def.spreadVy,
              });
            }
            expect(p.facing).toBe(facing);
            return world.projectiles;
          });
          expect(shots[0]).toEqual(shots[1]);
          expect(shots[1]).toEqual(shots[2]);
        }
      }
    },
  );

  it("holds only contract inputs, never mutates a deeply frozen world, and exposes no extra observation fields", () => {
    const world = arena({ level: CONSENSUS_HEIGHTS });
    const driver = scriptedDriver();
    const mock = new MockAIController();
    for (let tick = 0; tick < 5000; tick++) {
      if (tick % 60 === 0) {
        const copy = freeze(structuredClone(world));
        const guarded = new Proxy(copy, {
          set() {
            throw new Error("world mutation");
          },
          deleteProperty() {
            throw new Error("world mutation");
          },
          defineProperty() {
            throw new Error("world mutation");
          },
        });
        const before = JSON.stringify(guarded);
        const obs = buildObservation(guarded, "p2", world.elapsedMs);
        expect(obs).toEqual(GameObservationV1Schema.parse(obs));
        for (const offset of [0, 1]) {
          const input = mock.update({
            world: guarded,
            playerId: "p2",
            episodeId: world.episodeId,
            tick: world.tick + offset,
            nowMs: world.elapsedMs,
          });
          expect(input).toEqual(PlayerInputV1Schema.parse(input));
        }
        expect(JSON.stringify(guarded)).toBe(before);
      }
      stepWorld(world, { p1: driver(world, "p1"), p2: driver(world, "p2") });
    }
  });

  it("neutralizes every axis of stale episode inputs", () => {
    const a = arena();
    const b = arena();
    advance(a, 120, {
      episodeId: "stale",
      horizontal: "right",
      verticalAction: "jump",
      shoot: true,
      dash: true,
      interact: true,
    });
    advance(b, 120);
    expect(a).toEqual({
      ...b,
      players: {
        ...b.players,
        p1: { ...b.players.p1, lastInput: neutralInput(b.episodeId, a.tick) },
      },
    });
  });

  it("cannot mutate cached controller input by editing a returned input", () => {
    const world = arena();
    const mock = new MockAIController();
    const ctx = { world, playerId: "p2" as const, episodeId: world.episodeId, tick: 0, nowMs: 0 };
    const input = mock.update(ctx);
    const expected = { ...input };
    input.horizontal = input.horizontal === "left" ? "right" : "left";
    expect(mock.update(ctx)).toEqual(expected);
  });
});

describe("seeded replay", () => {
  it.each([false, true])(
    "is identical after 5000 ticks (different episode IDs: %s)",
    (differentEpisodes) => {
      const options = {
        level: CONSENSUS_HEIGHTS,
        seed: 42,
        episodeId: "first",
        directive: "SPEEDRUNNER" as const,
        slots: { p1: "HUMAN" as const, p2: "MOCK_AI" as const },
      };
      const a = createWorld(options);
      const b = createWorld({
        ...options,
        episodeId: differentEpisodes ? "fresh-episode" : options.episodeId,
      });
      const driver = scriptedDriver();
      expect(a.rngState).toBe(b.rngState);
      for (let tick = 0; tick < 5000; tick++) {
        const inputs = { p1: driver(a, "p1"), p2: driver(a, "p2") };
        stepWorld(a, inputs);
        stepWorld(b, {
          p1: { ...inputs.p1, episodeId: b.episodeId },
          p2: { ...inputs.p2, episodeId: b.episodeId },
        });
      }
      expect(a.tick).toBe(5000);
      expect(a.status).toBe("won");
      expect(JSON.stringify(comparableEpisode(a))).toBe(JSON.stringify(comparableEpisode(b)));
      if (!differentEpisodes) expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(a.rngState).not.toBe(42);
    },
  );

  it("keeps seed zero distinct from seed one", () => {
    expect(arena({ seed: 0 }).rngState).toBe(0);
    expect(arena({ seed: 1 }).rngState).toBe(1);
  });
});
