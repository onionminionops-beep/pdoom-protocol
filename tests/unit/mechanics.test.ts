import { describe, expect, it } from "vitest";
import { MOVEMENT, TICK_MS, TILE } from "@/game/config/movement";
import { damagePlayer } from "@/game/sim/player";
import { fireEnemyProjectile } from "@/game/sim/enemyBehaviors";
import { spawnEnemy } from "@/game/sim/enemies";
import { REVIVE_HOLD_MS } from "@/game/sim/step";
import { advance, arena, flatLevel } from "./helpers/world";

describe("co-op mechanics", () => {
  it("damages either player on H tiles without requiring a fall", () => {
    const level = flatLevel();
    level.rows[16] = "H".repeat(level.widthTiles);
    const world = arena({ level });
    const events = advance(world);
    expect(world.players.p1.health).toBe(75);
    expect(world.players.p2.health).toBe(75);
    expect(events.filter((e) => e.type === "player_hurt")).toHaveLength(2);
    advance(world, 1);
    expect(world.players.p1.health).toBe(75);
  });

  it("expires restricted zones and stops applying their slow", () => {
    const world = arena();
    world.restrictedZones.push({ x: 0, y: 0, w: 3000, h: 576, ownerId: "monitor", msLeft: 100 });
    advance(world, 7, { horizontal: "right" });
    expect(world.restrictedZones).toEqual([]);
    advance(world, 30, { horizontal: "right" });
    expect(world.players.p1.vel.x).toBe(MOVEMENT.runSpeed);
  });

  it("collects coins once and credits the shared score breakdown", () => {
    const level = flatLevel();
    level.pickups = [{ id: "coin", type: "coin", tileX: 10, tileY: 15, value: 3, roomId: "arena" }];
    const world = arena({ level });
    const events = advance(world, 30);
    expect(world.coins).toBe(3);
    expect(world.score).toBe(150);
    expect(world.breakdown.coins).toBe(150);
    expect(events.filter((e) => e.type === "pickup")).toHaveLength(1);
  });

  it("requires 1500 ms of uninterrupted, in-range interaction to revive", () => {
    const world = arena();
    damagePlayer(world.players.p2, 100, "test", null, []);
    advance(world, 30, { interact: true });
    advance(world);
    expect(world.players.p1.reviveProgressMs).toBe(0);
    const ticks = Math.round(REVIVE_HOLD_MS / TICK_MS);
    advance(world, ticks - 1, { interact: true });
    expect(world.players.p2.downed).toBe(true);
    expect(world.status).toBe("playing");
    const events = advance(world, 1, { interact: true });
    expect(events).toContainEqual({ type: "player_revived", playerId: "p2", by: "p1" });
    expect(world.players.p2.downed).toBe(false);
    expect(world.players.p2.alive).toBe(true);
    expect(world.players.p2.health).toBe(50);
    expect(world.breakdown.reviveBonus).toBe(300);
  });

  it("cannot revive out of range and does not lose while one player can act", () => {
    const level = flatLevel();
    level.spawns.p2 = [30, 15];
    const world = arena({ level });
    damagePlayer(world.players.p2, 100, "test", null, []);
    advance(world, 120, { interact: true });
    expect(world.players.p1.reviveProgressMs).toBe(0);
    expect(world.players.p2.downed).toBe(true);
    expect(world.status).toBe("playing");
    advance(world, 1200);
    expect(world.players.p2.alive).toBe(false);
    expect(world.status).toBe("playing");
    damagePlayer(world.players.p1, 100, "test", null, []);
    expect(advance(world)).toContainEqual({ type: "level_lost" });
    expect(world.status).toBe("lost");
  });

  it("loses when both active players are downed and neither can revive", () => {
    const world = arena();
    damagePlayer(world.players.p1, 100, "test", null, []);
    damagePlayer(world.players.p2, 100, "test", null, []);
    advance(world);
    expect(world.status).toBe("lost");
  });

  it("requires the assigned players to activate both switches before opening a gate", () => {
    const level = flatLevel();
    level.spawns.p2 = [10, 15];
    level.rooms[0].gateTileX = 20;
    level.rows = level.rows.map((row, y) =>
      y < 16 ? `${row.slice(0, 20)}G${row.slice(21)}` : row,
    );
    level.interactables = (["p1", "p2"] as const).map((id) => ({
      id,
      type: "switch",
      tileX: 10,
      tileY: 15,
      roomId: "arena",
      requiredPlayer: id,
      label: id,
    }));
    const world = arena({ level });
    advance(world, 100, { interact: true });
    expect(world.interactables.map((it) => it.activated)).toEqual([true, false]);
    expect(world.level.rows[15][20]).toBe("G");
    advance(world, 1, {}, { interact: true });
    expect(world.openedGates.arena).toBe(true);
    expect(world.level.rows[15][20]).toBe(".");
    expect(level.rows[15][20]).toBe("G");
  });

  it.each([
    "catastrophe_prophet",
    "datacenter_blockader",
    "purity_enforcer",
    "consensus_engine",
  ] as const)("%s cannot damage players from another room or beyond visible range", (type) => {
    for (const otherRoom of [false, true]) {
      const level = flatLevel();
      if (otherRoom) {
        level.rooms[0].bounds[2] = 12;
        level.rooms.push({ ...level.rooms[0], id: "outside", bounds: [12, 0, 96, 18] });
      }
      const world = arena({ level });
      const p = world.players.p1;
      const enemy = spawnEnemy(
        world,
        "ranged",
        type,
        p.pos.x + (otherRoom ? 3 * TILE : 600),
        p.pos.y,
        otherRoom ? "outside" : "arena",
      );
      const events = advance(world, 600);
      expect(events.some((e) => e.type === "enemy_attack")).toBe(false);
      fireEnemyProjectile(world, enemy, "enemy_bubble", { x: -200, y: 0 }, 10, 6, 2000);
      advance(world, 300);
      expect(world.players.p1.health).toBe(100);
      expect(world.players.p2.health).toBe(100);
    }
  });

  it("allows an on-screen ranged attack to hurt a player", () => {
    const world = arena({ slots: { p1: "HUMAN", p2: "DISABLED" } });
    const p = world.players.p1;
    const enemy = spawnEnemy(
      world,
      "ranged",
      "datacenter_blockader",
      p.pos.x + 200,
      p.pos.y,
      "arena",
    );
    fireEnemyProjectile(world, enemy, "enemy_bubble", { x: -200, y: 0 }, 10, 6, 1000);
    advance(world, 90);
    expect(p.health).toBeLessThan(100);
  });
});
