import { describe, expect, it } from "vitest";
import {
  GameObservationV1Schema,
  OBSERVATION_LIMITS,
  serializeObservation,
} from "@/game/contracts/observation";
import { buildObservation } from "@/game/observation/build";
import { spawnEnemy } from "@/game/sim/enemies";
import { fireEnemyProjectile } from "@/game/sim/enemyBehaviors";
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
});
