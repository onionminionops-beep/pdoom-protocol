import { neutralInput, type PlayerInputV1 } from "../../../src/game/contracts/input";
import type { DirectiveId } from "../../../src/game/contracts/directives";
import { MockAIController } from "../../../src/game/controllers/mock";
import { MOVEMENT, TILE } from "../../../src/game/config/movement";
import { CONSENSUS_HEIGHTS } from "../../../src/game/levels/consensusHeights";
import { buildObservation } from "../../../src/game/observation/build";
import { stepWorld } from "../../../src/game/sim/step";
import { createWorld } from "../../../src/game/sim/world";
import { roomAt } from "../../../src/game/sim/visibility";
import type { LevelData, PlayerId, SimEvent, WorldState } from "../../../src/game/sim/types";

export type Driver = (world: WorldState, id: PlayerId) => PlayerInputV1;

export function mockDriver(): Driver {
  const controllers = { p1: new MockAIController(), p2: new MockAIController() };
  return (world, playerId) =>
    controllers[playerId].update({
      world,
      playerId,
      nowMs: world.elapsedMs,
      tick: world.tick,
      episodeId: world.episodeId,
    });
}

export function runPlaythrough({
  driver = mockDriver(),
  ticks = 60_000,
  directive = "SPEEDRUNNER",
  level = CONSENSUS_HEIGHTS,
  seed = 42,
}: {
  driver?: Driver;
  ticks?: number;
  directive?: DirectiveId;
  level?: LevelData;
  seed?: number;
} = {}) {
  const world = createWorld({
    episodeId: "headless",
    seed,
    directive,
    level,
    slots: { p1: "MOCK_AI", p2: "MOCK_AI" },
  });
  const events: SimEvent[] = [];
  const rooms = new Set<string>();
  const roomsByPlayer = { p1: new Set<string>(), p2: new Set<string>() };
  const gateConditions: boolean[] = [];
  const phases = new Set<number>();
  const samples: string[] = [];
  let separation = 0;
  let maxX = world.players.p2.pos.x;
  for (let tick = 0; tick < ticks && world.status === "playing"; tick++) {
    const inputs = { p1: driver(world, "p1"), p2: driver(world, "p2") };
    const tickEvents = stepWorld(world, inputs);
    events.push(...tickEvents);
    for (const event of tickEvents) {
      if (event.type !== "gate_opened") continue;
      const room = world.level.rooms.find((r) => r.id === event.roomId)!;
      gateConditions.push(
        room.gateOnEnemies
          ? !world.enemies.some((e) => e.roomId === room.id && e.health > 0)
          : world.interactables
              .filter((it) => it.roomId === room.id && it.type === "switch")
              .every((it) => it.activated),
      );
    }
    for (const id of ["p1", "p2"] as const) {
      const room = roomAt(world.level, world.players[id].pos);
      if (room) roomsByPlayer[id].add(room.id);
    }
    phases.add(world.bossPhase);
    rooms.add(world.currentRoomId);
    separation += Math.hypot(
      world.players.p1.pos.x - world.players.p2.pos.x,
      world.players.p1.pos.y - world.players.p2.pos.y,
    );
    maxX = Math.max(maxX, world.players.p2.pos.x);
    if (tick % 600 === 0)
      samples.push(
        `${tick}: ${world.currentRoomId} ${(["p1", "p2"] as const)
          .map((id) => {
            const p = world.players[id];
            return `${id}(${(p.pos.x / TILE).toFixed(1)},${((p.pos.y + MOVEMENT.bodyHeight / 2) / TILE).toFixed(1)}) hp=${p.health} down=${p.downed}`;
          })
          .join(" ")} enemies=${world.enemies
          .filter((e) => e.health > 0)
          .map((e) => `${e.id}:${e.health}`)
          .join(",")}`,
      );
  }
  samples.push(
    `final ${world.tick} ${JSON.stringify({ players: Object.values(world.players).map((p) => ({ id: p.id, pos: p.pos, health: p.health, weapon: p.weapon })), enemies: world.enemies.map((e) => ({ id: e.id, pos: e.pos, health: e.health })), switches: world.interactables.filter((it) => it.type === "switch"), damage: events.filter((e) => e.type === "player_hurt").slice(-8) })}`,
  );
  return {
    world,
    events,
    rooms,
    roomsByPlayer,
    gateConditions,
    phases,
    samples: [...samples.slice(0, 12), ...samples.slice(-3)],
    maxX,
    meanSeparation: separation / world.tick,
  };
}

const commonRoute: [number, number][] = [
  [14, 14],
  [29, 16],
  [39, 15],
  [49, 16],
  [51, 15],
  [64, 16],
  [67, 14],
  [70, 12],
  [74, 10],
  [80, 16],
  [83, 14],
  [86, 12],
  [90, 12],
  [93, 16],
  [98, 13],
  [103, 16],
  [107, 13],
  [113, 11],
  [117, 14],
  [119, 12],
  [125, 16],
  [129, 14],
  [135, 16],
  [139, 14],
  [142, 12],
  [146, 10],
  [150, 12],
  [153, 16],
  [156, 14],
  [159, 16],
];
const upperRoute: [number, number][] = [
  [163, 14],
  [168, 12],
  [173, 10],
  [179.5, 9],
  [194, 9],
];
const lowerRoute: [number, number][] = [
  [176, 13],
  [183, 16],
  [185, 13],
  [189, 13],
  [192.5, 16],
];
const spireRoute: [number, number][] = [
  [197, 16],
  [199, 14],
  [202, 12],
  [205, 10],
  [208, 8],
  [211, 6],
  [214, 4],
  [217, 4],
  [224, 12],
];

export function scriptedDriver(): Driver {
  const indices: Record<PlayerId, number> = { p1: 0, p2: 0 };
  const clearing: Record<PlayerId, string | null> = { p1: null, p2: null };
  const routes = {
    p1: [...commonRoute, ...upperRoute, ...spireRoute],
    p2: [...commonRoute, ...lowerRoute, ...spireRoute],
  };
  return (world, id) => {
    const p = world.players[id];
    const obs = buildObservation(world, id, world.elapsedMs);
    const input = neutralInput(world.episodeId, world.tick);
    input.shoot = true;
    input.interact = true;
    const route = routes[id];
    let waypoint = route[indices[id]];
    if (
      waypoint &&
      Math.abs(p.pos.x - waypoint[0] * TILE) < 18 &&
      Math.abs(p.pos.y + MOVEMENT.bodyHeight / 2 - waypoint[1] * TILE) < 6 &&
      p.grounded
    ) {
      indices[id]++;
      waypoint = route[indices[id]];
    }
    let dx = waypoint ? waypoint[0] * TILE - p.pos.x : 8 * TILE;
    let dy = waypoint ? waypoint[1] * TILE - MOVEMENT.bodyHeight / 2 - p.pos.y : 0;
    const room = world.level.rooms.find((r) => r.id === obs.game.roomId);
    if (
      room?.gateOnEnemies &&
      !world.openedGates[room.id] &&
      room.gateTileX !== null &&
      p.pos.x > (room.gateTileX - 1) * TILE
    )
      clearing[id] = room.id;
    if (clearing[id] && world.openedGates[clearing[id]]) clearing[id] = null;
    const remaining = world.enemies.find((e) => e.roomId === clearing[id] && e.health > 0);
    if (remaining) {
      dx = remaining.pos.x - p.pos.x;
      dy = remaining.pos.y - p.pos.y;
    }
    const target = obs.enemies.find(
      (e) => e.withinWeaponRange && e.verticalAlignment === "aligned" && e.lineOfFireClear,
    );
    const teammate = obs.teammate;
    if (teammate.downed) {
      dx = teammate.relativePosition.x;
      dy = teammate.relativePosition.y;
    } else if (world.bossActive) {
      const sw = world.interactables.find(
        (it) => it.id === (id === "p1" ? "sw_boss_l" : "sw_boss_r"),
      );
      if (world.bossPhase === 3 && sw && !sw.activated) {
        dx = sw.pos.x - p.pos.x;
        dy = sw.pos.y - p.pos.y;
      } else {
        dx = (id === "p1" ? 225 : 235) * TILE - p.pos.x;
        dy = 12 * TILE - MOVEMENT.bodyHeight / 2 - p.pos.y;
      }
    } else if (obs.game.roomId === "r8_boss") {
      dx = 238 * TILE - p.pos.x;
      dy = 0;
    }
    input.horizontal = Math.abs(dx) < 8 ? "neutral" : dx < 0 ? "left" : "right";
    const seekingSwitch =
      world.bossPhase === 3 &&
      world.interactables.some(
        (it) =>
          it.type === "switch" &&
          it.roomId === "r8_boss" &&
          it.requiredPlayer === id &&
          !it.activated,
      );
    if (
      seekingSwitch &&
      target?.type === "consensus_engine" &&
      target.distance < 135 &&
      Math.sign(dx) === Math.sign(target.relativePosition.x)
    )
      input.dash = true;
    if (target && target.distance < 330 && !seekingSwitch && !teammate.downed) {
      input.horizontal =
        Math.abs(target.relativePosition.x) < 30
          ? "neutral"
          : target.relativePosition.x < 0
            ? "left"
            : "right";
      if (target.distance > 80 && p.facing === (target.relativePosition.x < 0 ? "left" : "right"))
        input.horizontal = "neutral";
    }
    const wall =
      (dx < 0 ? obs.terrain.leftWallDistance : obs.terrain.rightWallDistance) ?? Infinity;
    if (
      p.grounded &&
      !target &&
      ((dy < -12 && Math.abs(dx) < 150) || (wall < 35 && Math.abs(dx) > 15))
    ) {
      input.verticalAction = "jump";
    } else if (!p.grounded && p.vel.y < 0) {
      input.verticalAction = "jump";
    }
    if (p.grounded && dy > 40 && Math.abs(dx) < 50 && p.onOneWayPlatform)
      input.verticalAction = "drop";
    return input;
  };
}
