import { describe, expect, it } from "vitest";
import {
  GameObservationV1Schema,
  OBSERVATION_LIMITS,
  serializeObservation,
} from "@/game/contracts/observation";
import { buildObservation } from "@/game/observation/build";
import { spawnEnemy } from "@/game/sim/enemies";
import { fireEnemyProjectile } from "@/game/sim/enemyBehaviors";
import { CONSENSUS_HEIGHTS } from "@/game/levels/consensusHeights";
import { createWorld } from "@/game/sim/world";
import { arena } from "./helpers/world";

function expectSortedKeys(value: unknown) {
  if (Array.isArray(value)) {
    value.forEach(expectSortedKeys);
  } else if (value !== null && typeof value === "object") {
    expect(Object.keys(value)).toEqual(Object.keys(value).sort());
    Object.values(value).forEach(expectSortedKeys);
  }
}

describe("bounded observation contract", () => {
  it("orders enemy threats by time to contact then distance before truncating", () => {
    const world = arena();
    const p = world.players.p2;
    for (let i = 12; i > 0; i--) {
      const e = spawnEnemy(
        world,
        `enemy-${i}`,
        "doom_prophet",
        p.pos.x + 21 + i * 20,
        p.pos.y,
        "arena",
      );
      e.vel.x = i <= 3 ? -i * 40 : 0;
    }
    const obs = buildObservation(world, "p2", 0);
    expect(obs.enemies).toHaveLength(OBSERVATION_LIMITS.enemies);
    expect(obs.enemies.map((e) => e.id)).toEqual(
      Array.from({ length: 8 }, (_, i) => `enemy-${i + 1}`),
    );
    expect(obs.enemies.slice(0, 3).map((e) => e.estimatedTimeToContactMs)).toEqual([500, 500, 500]);
    expect(obs.enemies[3].estimatedTimeToContactMs).toBeNull();
  });

  it("orders approaching projectiles first, breaking equal or unknown times by distance", () => {
    const world = arena();
    const p = world.players.p2;
    const source = spawnEnemy(world, "source", "catastrophe_prophet", p.pos.x, p.pos.y, "arena");
    for (let i = 12; i > 0; i--) {
      source.pos.x = p.pos.x + i * 20;
      fireEnemyProjectile(
        world,
        source,
        "enemy_graph",
        { x: i <= 3 ? -i * 40 : 100, y: 0 },
        12,
        6,
        2000,
      );
      world.projectiles[world.projectiles.length - 1].id = `projectile-${i}`;
    }
    const obs = buildObservation(world, "p2", 0);
    expect(obs.hostileProjectiles).toHaveLength(OBSERVATION_LIMITS.hostileProjectiles);
    expect(obs.hostileProjectiles.map((pr) => pr.id)).toEqual(
      Array.from({ length: 8 }, (_, i) => `projectile-${i + 1}`),
    );
    expect(obs.hostileProjectiles.slice(0, 3).every((pr) => pr.approaching)).toBe(true);
  });

  it("limits pickups/interactables to visible, nearest, permitted objects", () => {
    const world = arena();
    const p = world.players.p2;
    for (let i = 12; i > 0; i--) {
      world.pickups.push({
        id: `pickup-${i}`,
        type: "coin",
        value: 1,
        pos: { x: p.pos.x + 20 * i, y: p.pos.y },
        collected: false,
        roomId: "arena",
      });
      world.interactables.push({
        id: `switch-${i}`,
        type: "switch",
        pos: { x: p.pos.x + 20 * i, y: p.pos.y },
        w: 32,
        h: 32,
        activated: false,
        requiredPlayer: i === 1 ? "p1" : "p2",
        label: "Switch",
        roomId: "arena",
      });
    }
    world.pickups.push({
      ...world.pickups[0],
      id: "offscreen",
      pos: { x: p.pos.x + 500, y: p.pos.y },
    });
    const obs = buildObservation(world, "p2", 123);
    expect(obs.pickups.map((it) => it.id)).toEqual(["pickup-1", "pickup-2", "pickup-3"]);
    expect(obs.interactables.map((it) => it.id)).toEqual([
      "switch-2",
      "switch-3",
      "switch-4",
      "switch-5",
    ]);
    expect(obs.pickups).toHaveLength(OBSERVATION_LIMITS.pickups);
    expect(obs.interactables).toHaveLength(OBSERVATION_LIMITS.interactables);
    expect(obs).toEqual(GameObservationV1Schema.parse(obs));
  });

  it("serializes all object keys in sorted order, rounds to two decimals and preserves array order", () => {
    const world = arena();
    world.players.p2.pos.x = 321.23456;
    world.players.p2.vel.y = -123.4567;
    const obs = buildObservation(world, "p2", 12.3456);
    const text = serializeObservation(obs);
    const decoded: unknown = JSON.parse(text);
    expectSortedKeys(decoded);
    const parsed = GameObservationV1Schema.parse(decoded);
    expect(parsed.self.position.x).toBe(321.23);
    expect(parsed.self.velocity.y).toBe(-123.46);
    expect(parsed.timestampMs).toBe(12.35);
    expect(parsed.enemies.map((e) => e.id)).toEqual(obs.enemies.map((e) => e.id));
    expect(serializeObservation(parsed)).toBe(text);
  });

  it("exposes authoritative rules and bounded platform geometry without leaking the map", () => {
    const world = createWorld({
      level: CONSENSUS_HEIGHTS,
      seed: 42,
      episodeId: "context",
      directive: "MONSTER_SLAYER",
      slots: { p1: "HUMAN", p2: "JEV" },
    });
    world.players.p2.pos = { x: 52 * 32, y: 15 * 32 - 20 };
    world.players.p1.pos = { ...world.players.p2.pos };
    const obs = buildObservation(world, "p2", 0);

    expect(obs.rules).toMatchObject({
      units: "distance px; velocity px/s; time ms; tile 32 px",
      coordinates: "+x right, +y down; course left-to-right; relative positions use self center",
      dash: { speedPxPerS: 520, durationMs: 140, cooldownMs: 650 },
      weapon: {
        rangePx: 420,
        fireCooldownMs: 220,
        firing: "horizontal along facing",
      },
    });
    expect(obs.rules.jump.maxRisePx).toBe(124);
    expect(obs.rules.jump.approximateSameHeightReachPx).toBe(153);
    expect(obs.terrain.platforms.length).toBeLessThanOrEqual(2);
    expect(
      obs.terrain.platforms.every((platform) => platform.relativeRightX > platform.relativeLeftX),
    ).toBe(true);
    expect(JSON.stringify(obs)).not.toContain('"rows"');
  });

  it("reports a closed combat gate and its actionable blocker", () => {
    const world = createWorld({
      level: CONSENSUS_HEIGHTS,
      seed: 42,
      episodeId: "gate",
      directive: "MONSTER_SLAYER",
      slots: { p1: "HUMAN", p2: "JEV" },
    });
    world.players.p2.pos = { x: 52 * 32, y: 15 * 32 - 20 };
    world.players.p1.pos = { ...world.players.p2.pos };
    const obs = buildObservation(world, "p2", 0);

    expect(obs.progression.roomId).toBe("r2_comments");
    expect(obs.progression.objectiveStatus).toBe("blocked");
    expect(obs.progression.blockedReason).toContain("Clear 4 visible room enemies");
    expect(obs.progression.gate).toMatchObject({
      present: true,
      open: false,
      unlockCondition: "clear enemies",
      visibleRemainingEnemies: 4,
    });
    expect(obs.terrain.nextObstruction).toMatchObject({ type: "wall", side: "right" });
  });

  it("uses null gate context for an ungated bounded fixture", () => {
    const obs = buildObservation(arena(), "p2", 0);
    expect(obs.progression.gate).toBeNull();
    expect(obs.progression.blockedReason).toBeNull();
    expect(obs.terrain.nextObstruction).toBeNull();
  });

  it("scans walls to the visible camera edge, not a fixed short probe", () => {
    const world = arena();
    world.players.p2.pos = { x: 20 * 32, y: 15 * 32 - 20 };
    world.level.rows[14] = `${world.level.rows[14].slice(0, 30)}#${world.level.rows[14].slice(31)}`;
    const visible = buildObservation(world, "p2", 0);
    expect(visible.terrain.rightWallDistance).toBeGreaterThan(160);
    expect(visible.terrain.rightWallScan).toBeGreaterThan(visible.terrain.rightWallDistance!);

    world.level.rows[14] = `${world.level.rows[14].slice(0, 30)}.${world.level.rows[14].slice(31)}`;
    world.level.rows[14] = `${world.level.rows[14].slice(0, 40)}#${world.level.rows[14].slice(41)}`;
    const offscreen = buildObservation(world, "p2", 0);
    expect(offscreen.terrain.rightWallDistance).toBeNull();
  });

  it("reports exact bounded platform runs and edge-based gap estimates", () => {
    const world = arena();
    world.level.rows = world.level.rows.map(() => ".".repeat(world.level.rows[0].length));
    world.players.p2.pos = { x: 12 * 32, y: 15 * 32 - 20 };
    world.level.rows[14] =
      world.level.rows[14].slice(0, 10) +
      "--" +
      world.level.rows[14].slice(12, 14) +
      "--" +
      world.level.rows[14].slice(16);
    world.level.rows[13] = ".".repeat(world.level.rows[13].length);
    world.level.rows[16] = ".".repeat(world.level.rows[16].length);
    const obs = buildObservation(world, "p2", 0);
    const platforms = obs.terrain.platforms.filter((platform) => platform.id.endsWith("-14"));

    expect(platforms.map((platform) => platform.id)).toEqual(["platform-10-14", "platform-14-14"]);
    expect(platforms[0]).toMatchObject({
      relativeLeftX: -64,
      relativeRightX: 0,
      horizontalGapPx: 0,
    });
    expect(platforms[1].horizontalGapPx).toBe(54);
    expect(platforms[1].relativeTopY).toBe(-12);
  });

  it("prefers reachable steps over an overlapping unreachable overhead surface", () => {
    const world = arena();
    world.level.rows = world.level.rows.map(() => ".".repeat(world.level.rows[0].length));
    world.players.p2.pos = { x: 12 * 32, y: 15 * 32 - 20 };
    world.level.rows[14] = `${world.level.rows[14].slice(0, 10)}--..--${world.level.rows[14].slice(16)}`;
    world.level.rows[10] = `${world.level.rows[10].slice(0, 12)}--${world.level.rows[10].slice(14)}`;

    const platforms = buildObservation(world, "p2", 0).terrain.platforms;

    expect(platforms.map((platform) => platform.id)).toEqual(["platform-10-14", "platform-14-14"]);
    expect(platforms.every((platform) => platform.reachableByJumpEstimate)).toBe(true);
  });

  it("chooses a nearer wall over a farther closed gate", () => {
    const world = createWorld({
      level: CONSENSUS_HEIGHTS,
      seed: 42,
      episodeId: "wall-before-gate",
      directive: "MONSTER_SLAYER",
      slots: { p1: "HUMAN", p2: "JEV" },
    });
    world.players.p2.pos = { x: 52 * 32, y: 15 * 32 - 20 };
    world.level.rows[14] = `${world.level.rows[14].slice(0, 54)}#${world.level.rows[14].slice(55)}`;

    expect(buildObservation(world, "p2", 0).terrain.nextObstruction).toMatchObject({
      type: "wall",
      side: "right",
    });
  });

  it("keeps a closed gate blocked when visible blockers are absent", () => {
    const world = createWorld({
      level: CONSENSUS_HEIGHTS,
      seed: 42,
      episodeId: "hidden-gate-blocker",
      directive: "MONSTER_SLAYER",
      slots: { p1: "HUMAN", p2: "JEV" },
    });
    world.players.p2.pos = { x: 52 * 32, y: 15 * 32 - 20 };
    for (const enemy of world.enemies) {
      if (enemy.roomId === "r2_comments") enemy.health = 0;
    }

    const progression = buildObservation(world, "p2", 0).progression;

    expect(progression.objectiveStatus).toBe("blocked");
    expect(progression.gate).toMatchObject({
      open: false,
      visibleRemainingEnemies: 0,
      unlockCondition: "clear enemies",
    });
    expect(progression.blockedReason).toContain("Gate closed");
  });

  it("does not expose hidden room totals and reports an opened switch gate", () => {
    const world = createWorld({
      level: CONSENSUS_HEIGHTS,
      seed: 42,
      episodeId: "switch-gate",
      directive: "SCORE_HUNTER",
      slots: { p1: "HUMAN", p2: "JEV" },
    });
    world.players.p2.pos = { x: 180 * 32, y: 15 * 32 - 20 };
    const closed = buildObservation(world, "p2", 0);
    expect(closed.progression.gate).toMatchObject({
      open: false,
      unlockCondition: "activate switches",
      visibleUnactivatedSwitches: 2,
    });
    expect(closed.progression.blockedReason).toContain("visible unactivated switches");

    world.openedGates.r6_split = true;
    const open = buildObservation(world, "p2", 0);
    expect(open.progression.gate).toMatchObject({ open: true });
    expect(open.progression.objectiveStatus).toBe("active");
    expect(open.progression.blockedReason).toBeNull();
  });
});
