import { MOVEMENT, TILE } from "../config/movement";
import type { DirectiveId } from "../contracts/directives";
import { WEAPONS } from "../config/weapons";
import { hashString } from "./rng";
import { spawnEnemy } from "./enemies";
import type { LevelData, PlayerId, PlayerState, SlotKind, WorldState } from "./types";

export interface CreateWorldOptions {
  level: LevelData;
  seed: number;
  episodeId: string;
  directive: DirectiveId;
  slots: Record<PlayerId, SlotKind>;
}

function tileCentre(tx: number, ty: number, h: number): { x: number; y: number } {
  return { x: tx * TILE + TILE / 2, y: (ty + 1) * TILE - h / 2 };
}

export function createPlayer(id: PlayerId, x: number, y: number): PlayerState {
  return {
    id,
    character: id === "p1" ? "user" : "jev",
    pos: { x, y },
    vel: { x: 0, y: 0 },
    facing: "right",
    grounded: false,
    wasGrounded: false,
    onOneWayPlatform: false,
    health: MOVEMENT.maxHealth,
    alive: true,
    downed: false,
    downedTimerMs: 0,
    weapon: "blaster",
    ammo: { blaster: null, shotgun: WEAPONS.shotgun.maxAmmo, launcher: WEAPONS.launcher.maxAmmo },
    fireCooldownMs: 0,
    dashCooldownMs: 0,
    dashTimeMs: 0,
    dashDir: "right",
    coyoteMs: 0,
    jumpBufferMs: 0,
    jumpHeldMs: 0,
    jumpHeld: false,
    jumping: false,
    dropIgnoreMs: 0,
    invulnMs: 0,
    reviveProgressMs: 0,
    factCheckMs: 0,
    factCheckCooldownMs: 0,
    anim: "idle",
    animMs: 0,
    lastInput: null,
    damageTaken: 0,
  };
}

export function createWorld(opts: CreateWorldOptions): WorldState {
  const level: LevelData = { ...opts.level, rows: [...opts.level.rows] };
  const p1s = tileCentre(level.spawns.p1[0], level.spawns.p1[1], MOVEMENT.bodyHeight);
  const p2s = tileCentre(level.spawns.p2[0], level.spawns.p2[1], MOVEMENT.bodyHeight);
  const world: WorldState = {
    episodeId: opts.episodeId,
    seed: opts.seed,
    tick: 0,
    elapsedMs: 0,
    status: "playing",
    level,
    players: { p1: createPlayer("p1", p1s.x, p1s.y), p2: createPlayer("p2", p2s.x, p2s.y) },
    slots: { ...opts.slots },
    enemies: [],
    projectiles: [],
    pickups: level.pickups.map((p) => ({
      id: p.id,
      type: p.type,
      pos: tileCentre(p.tileX, p.tileY, TILE),
      value: p.value ?? (p.type === "coin" ? 1 : 25),
      collected: false,
      roomId: p.roomId,
    })),
    interactables: level.interactables.map((it) => {
      const w = (it.wTiles ?? 1) * TILE;
      const h = (it.hTiles ?? 1) * TILE;
      return {
        id: it.id,
        type: it.type,
        pos: { x: it.tileX * TILE + w / 2, y: (it.tileY + 1) * TILE - h / 2 },
        w,
        h,
        roomId: it.roomId,
        activated: false,
        requiredPlayer: it.requiredPlayer,
        label: it.label,
      };
    }),
    openedGates: {},
    currentRoomId: level.rooms[0]?.id ?? "start",
    score: 0,
    coins: 0,
    breakdown: { kills: 0, coins: 0, timeBonus: 0, damageTakenPenalty: 0, reviveBonus: 0 },
    directive: opts.directive,
    nextId: 1,
    rngState: (opts.seed ^ hashString(opts.episodeId)) >>> 0 || 1,
    restrictedZones: [],
    bossActive: false,
    bossPhase: 0,
    winTimerMs: 0,
  };
  for (const s of level.enemies) {
    const c = tileCentre(s.tileX, s.tileY, 0);
    const e = spawnEnemy(world, s.id, s.type, c.x, c.y, s.roomId, s.facing ?? "left");
    e.pos.y = (s.tileY + 1) * TILE - e.h / 2;
  }
  return world;
}

/** Deep-clone via structured clone; WorldState is plain data by design. */
export function cloneWorld(world: WorldState): WorldState {
  return structuredClone(world);
}
