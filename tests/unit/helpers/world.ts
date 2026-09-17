import { neutralInput, type PlayerInputV1 } from "@/game/contracts/input";
import { createWorld, type CreateWorldOptions } from "@/game/sim/world";
import { stepWorld } from "@/game/sim/step";
import type { LevelData, WorldState } from "@/game/sim/types";

export function flatLevel(): LevelData {
  return {
    id: "arena",
    name: "Test arena",
    widthTiles: 96,
    heightTiles: 18,
    rows: Array.from({ length: 18 }, (_, y) => (y >= 16 ? "#" : ".").repeat(96)),
    spawns: { p1: [10, 15], p2: [11, 15] },
    rooms: [
      {
        id: "arena",
        bounds: [0, 0, 96, 18],
        objectiveType: "traverse",
        objectiveText: "Traverse",
        gateOnEnemies: false,
        gateTileX: null,
        billboards: [],
      },
    ],
    enemies: [],
    pickups: [],
    interactables: [],
    exitTileX: 95,
  };
}

export function arena(options: Partial<CreateWorldOptions> = {}): WorldState {
  return createWorld({
    level: flatLevel(),
    seed: 42,
    episodeId: "arena",
    directive: "SPEEDRUNNER",
    slots: { p1: "HUMAN", p2: "MOCK_AI" },
    ...options,
  });
}

export function advance(
  world: WorldState,
  ticks = 1,
  p1: Partial<PlayerInputV1> = {},
  p2: Partial<PlayerInputV1> = {},
) {
  return Array.from({ length: ticks }, () =>
    stepWorld(world, {
      p1: { ...neutralInput(world.episodeId, world.tick), ...p1 },
      p2: { ...neutralInput(world.episodeId, world.tick), ...p2 },
    }),
  ).flat();
}
