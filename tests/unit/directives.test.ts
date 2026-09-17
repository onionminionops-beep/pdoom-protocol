import { expect, it } from "vitest";
import { neutralInput, PlayerInputV1Schema } from "@/game/contracts/input";
import { MockAIController } from "@/game/controllers/mock";
import type { LevelData } from "@/game/sim/types";
import { runPlaythrough } from "./helpers/playthrough";

function directiveArena(): LevelData {
  return {
    id: "directives",
    name: "Directive comparison",
    widthTiles: 400,
    heightTiles: 18,
    rows: Array.from({ length: 18 }, (_, y) =>
      Array.from({ length: 400 }, (_, x) =>
        y >= 16 || (y === 6 && x >= 29 && x <= 31)
          ? "#"
          : (y === 13 && x >= 33 && x <= 44) || (y === 10 && x >= 39 && x <= 44)
            ? "-"
            : ".",
      ).join(""),
    ),
    spawns: { p1: [30, 5], p2: [30, 15] },
    rooms: [
      {
        id: "arena",
        bounds: [0, 0, 400, 18],
        objectiveType: "traverse",
        objectiveText: "Continue right; explore the ledge or clear nearby enemies.",
        gateOnEnemies: false,
        gateTileX: null,
        billboards: [],
      },
    ],
    enemies: [18, 21, 24, 27, 50, 62].map((tileX, i) => ({
      id: `enemy_${i}`,
      type: "doom_prophet",
      tileX,
      tileY: 15,
      roomId: "arena",
    })),
    pickups: [
      ...[34, 36, 38, 40, 42].map((tileX, i) => ({
        id: `coin_${i}`,
        type: "coin" as const,
        tileX,
        tileY: 12,
        roomId: "arena",
      })),
      ...[41, 43].map((tileX, i) => ({
        id: `bonus_${i}`,
        type: "coin" as const,
        tileX,
        tileY: 9,
        roomId: "arena",
      })),
    ],
    interactables: [],
    exitTileX: 399,
  };
}

it("measurably follows each directive over the same 3000-tick comparison arena", () => {
  const results = (["SPEEDRUNNER", "COLLECTOR", "SCORE_HUNTER", "GUARDIAN"] as const).map(
    (directive) => {
      const mock = new MockAIController();
      const run = runPlaythrough({
        directive,
        ticks: 3000,
        level: directiveArena(),
        driver: (world, id) => {
          const input =
            id === "p1"
              ? neutralInput(world.episodeId, world.tick)
              : mock.update({
                  world,
                  playerId: id,
                  tick: world.tick,
                  episodeId: world.episodeId,
                  nowMs: world.elapsedMs,
                });
          expect(input).toEqual(PlayerInputV1Schema.parse(input));
          return input;
        },
      });
      expect(run.world.tick).toBe(3000);
      return {
        directive,
        distance: run.maxX - run.world.players.p1.pos.x,
        coins: run.events.filter(
          (e) => e.type === "pickup" && e.playerId === "p2" && e.pickupType === "coin",
        ).length,
        kills: run.events.filter((e) => e.type === "enemy_killed").length,
        separation: run.meanSeparation,
      };
    },
  );
  const [speed, collector, hunter, guardian] = results;
  const diagnostics = JSON.stringify(results, null, 2);
  expect(speed.distance, diagnostics).toBeGreaterThan(
    Math.max(collector.distance, hunter.distance, guardian.distance),
  );
  expect(collector.coins, diagnostics).toBeGreaterThan(
    Math.max(speed.coins, hunter.coins, guardian.coins),
  );
  expect(hunter.kills, diagnostics).toBeGreaterThan(
    Math.max(speed.kills, collector.kills, guardian.kills),
  );
  expect(guardian.separation, diagnostics).toBeLessThan(
    Math.min(speed.separation, collector.separation, hunter.separation),
  );
});
