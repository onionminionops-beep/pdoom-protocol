import { describe, expect, it } from "vitest";
import { runPlaythrough, scriptedDriver } from "./helpers/playthrough";
import { MOVEMENT } from "@/game/config/movement";

describe("Consensus Heights playthrough", () => {
  it.each(["scripted shared inputs", "two observation-only mock teammates"])("wins with %s", (mode) => {
    const run = runPlaythrough(mode === "scripted shared inputs" ? { driver: scriptedDriver() } : {});
    expect(run.world.status, run.samples.join("\n")).toBe("won");
    expect(run.rooms.size).toBe(8);
    expect(run.roomsByPlayer.p1.size).toBe(8);
    expect(run.roomsByPlayer.p2.size).toBe(8);
    expect([...run.phases]).toEqual([0, 1, 2, 3]);
    expect(run.gateConditions).toEqual([true, true, true]);
    expect(run.world.openedGates).toEqual({ r2_comments: true, r4_gallery: true, r6_split: true });
    expect(run.events).toContainEqual(expect.objectContaining({ type: "interact", playerId: "p1", interactableId: "sw_upper" }));
    expect(run.events).toContainEqual(expect.objectContaining({ type: "interact", playerId: "p2", interactableId: "sw_lower" }));
    expect(run.events).toContainEqual(expect.objectContaining({ type: "enemy_killed", enemyType: "consensus_engine" }));
    expect(run.world.bossActive).toBe(false);
    expect(run.world.enemies.some((e) => e.type === "consensus_engine" && e.health > 0)).toBe(false);
    expect(run.world.score).toBeGreaterThan(0);
    const b = run.world.breakdown;
    expect(b.kills).toBeGreaterThanOrEqual(2500);
    expect(b.coins).toBeGreaterThan(0);
    expect(b.timeBonus).toBeGreaterThan(0);
    expect(b.damageTakenPenalty).toBeGreaterThan(0);
    expect(run.world.score).toBe(b.kills + b.coins + b.timeBonus + b.reviveBonus - b.damageTakenPenalty);
  }, 30_000);

  it("uses shared jump constants that clear the largest required three-tile rise", () => {
    const maximumRise = MOVEMENT.jumpVelocity ** 2 / (2 * MOVEMENT.gravity);
    expect(maximumRise).toBeGreaterThan(96);
    expect(MOVEMENT.runSpeed * (-2 * MOVEMENT.jumpVelocity / MOVEMENT.gravity)).toBeGreaterThan(128);
  });
});
