import { MOVEMENT, TICK_MS, TILE } from "../config/movement";
import { FACT_CHECK_PULSE, WEAPONS } from "../config/weapons";
import { neutralInput, type PlayerInputV1 } from "../contracts/input";
import { aabbOverlap } from "./physics";
import {
  damagePlayer,
  detectLanding,
  otherPlayerId,
  playerBox,
  stepPlayer,
  tryFactCheckPulse,
  tryShoot,
} from "./player";
import { stepEnemies } from "./enemies";
import { applyPulse, stepProjectiles } from "./projectiles";
import type { PlayerId, PlayerInputs, SimEvent, WorldState } from "./types";

export const REVIVE_HOLD_MS = MOVEMENT.reviveHoldMs;
export const REVIVE_RANGE_PX = MOVEMENT.reviveRangePx;
export const INTERACT_RANGE_PX = MOVEMENT.interactRangePx;
export const REVIVE_BONUS = 300;
export const TIME_BONUS_PAR_MS = 8 * 60 * 1000;

/**
 * Advances the world by exactly one tick (1/60 s). Pure with respect to inputs:
 * same world + same inputs => same result. Inputs from a stale episode or a
 * disabled slot are replaced with neutral input. Returns the events produced.
 */
export function stepWorld(world: WorldState, inputs: PlayerInputs): SimEvent[] {
  const events: SimEvent[] = [];
  if (world.status !== "playing") {
    world.tick++;
    return events;
  }
  world.tick++;
  world.elapsedMs += TICK_MS;

  const sanitized: PlayerInputs = {
    p1: sanitize(world, "p1", inputs.p1),
    p2: sanitize(world, "p2", inputs.p2),
  };

  for (const pid of ["p1", "p2"] as const) {
    if (world.slots[pid] === "DISABLED") continue;
    const p = world.players[pid];
    const prevVy = p.vel.y;
    stepPlayer(world, p, sanitized[pid], events);
    detectLanding(p, prevVy, events);
    if (!p.downed && p.alive) {
      tryShoot(world, p, sanitized[pid], events);
      if (tryFactCheckPulse(world, p, sanitized[pid], events)) applyPulse(world, pid, events);
    }
    clampToLevel(world, p);
  }

  handleRevives(world, sanitized, events);
  handleInteractables(world, sanitized, events);
  handlePickups(world, events);
  stepEnemies(world, events);
  stepProjectiles(world, events);
  stepZonesAndHazards(world, events);
  updateRooms(world, events);
  checkEndConditions(world, events);
  return events;
}

function sanitize(
  world: WorldState,
  pid: PlayerId,
  input: PlayerInputV1 | undefined,
): PlayerInputV1 {
  if (!input || world.slots[pid] === "DISABLED" || input.episodeId !== world.episodeId) {
    return neutralInput(world.episodeId, world.tick);
  }
  return input;
}

function clampToLevel(
  world: WorldState,
  p: { pos: { x: number; y: number }; vel: { x: number; y: number } },
): void {
  const half = MOVEMENT.bodyWidth / 2;
  const maxX = world.level.widthTiles * TILE - half;
  if (p.pos.x < half) {
    p.pos.x = half;
    p.vel.x = Math.max(0, p.vel.x);
  } else if (p.pos.x > maxX) {
    p.pos.x = maxX;
    p.vel.x = Math.min(0, p.vel.x);
  }
}

function handleRevives(world: WorldState, inputs: PlayerInputs, events: SimEvent[]): void {
  for (const pid of ["p1", "p2"] as const) {
    const p = world.players[pid];
    const oid = otherPlayerId(pid);
    const other = world.players[oid];
    const canRevive =
      world.slots[pid] !== "DISABLED" &&
      world.slots[oid] !== "DISABLED" &&
      p.alive &&
      !p.downed &&
      other.alive &&
      other.downed &&
      Math.hypot(other.pos.x - p.pos.x, other.pos.y - p.pos.y) <
        REVIVE_RANGE_PX + MOVEMENT.bodyWidth &&
      inputs[pid].interact;
    if (canRevive) {
      p.reviveProgressMs += TICK_MS;
      other.anim = "being_revived";
      events.push({
        type: "revive_progress",
        playerId: pid,
        target: oid,
        fraction: Math.min(1, p.reviveProgressMs / REVIVE_HOLD_MS),
      });
      if (p.reviveProgressMs + 1e-6 >= REVIVE_HOLD_MS) {
        other.downed = false;
        other.health = Math.round(MOVEMENT.maxHealth * MOVEMENT.reviveHealthFraction);
        other.invulnMs = MOVEMENT.invulnerabilityAfterHitMs * 2;
        other.downedTimerMs = 0;
        p.reviveProgressMs = 0;
        world.score += REVIVE_BONUS;
        world.breakdown.reviveBonus += REVIVE_BONUS;
        events.push({ type: "player_revived", playerId: oid, by: pid });
      }
    } else {
      p.reviveProgressMs = 0;
    }
  }
}

function handleInteractables(world: WorldState, inputs: PlayerInputs, events: SimEvent[]): void {
  for (const it of world.interactables) {
    if (it.activated) continue;
    for (const pid of ["p1", "p2"] as const) {
      if (world.slots[pid] === "DISABLED") continue;
      const p = world.players[pid];
      if (!p.alive || p.downed || !inputs[pid].interact) continue;
      if (it.requiredPlayer && it.requiredPlayer !== pid) continue;
      const box = {
        x: it.pos.x,
        y: it.pos.y,
        w: it.w + INTERACT_RANGE_PX,
        h: it.h + INTERACT_RANGE_PX,
      };
      if (!aabbOverlap(box, playerBox(p))) continue;
      if (
        it.type === "exit" &&
        world.enemies.some((e) => e.type === "consensus_engine" && e.health > 0)
      )
        continue;
      it.activated = true;
      events.push({
        type: "interact",
        playerId: pid,
        interactableId: it.id,
        interactableType: it.type,
      });
      if (it.type === "weapon_crate") {
        const wid = it.label.includes("Nuance") ? "launcher" : "shotgun";
        p.weapon = wid;
        p.ammo[wid] = WEAPONS[wid].maxAmmo;
      } else if (it.type === "switch") {
        const room = world.level.rooms.find((r) => r.id === it.roomId);
        const roomSwitches = world.interactables.filter(
          (s) => s.type === "switch" && s.roomId === it.roomId,
        );
        if (
          room &&
          room.gateTileX !== null &&
          !room.gateOnEnemies &&
          roomSwitches.every((s) => s.activated) &&
          !world.openedGates[room.id]
        ) {
          world.openedGates[room.id] = true;
          openGateColumn(world, room.gateTileX);
          events.push({ type: "gate_opened", roomId: room.id });
        }
      } else if (it.type === "exit") {
        world.status = "won";
        finalizeScore(world);
        events.push({ type: "level_won" });
      }
      break;
    }
  }
}

function handlePickups(world: WorldState, events: SimEvent[]): void {
  for (const pk of world.pickups) {
    if (pk.collected) continue;
    for (const pid of ["p1", "p2"] as const) {
      if (world.slots[pid] === "DISABLED") continue;
      const p = world.players[pid];
      if (!p.alive || p.downed) continue;
      if (!aabbOverlap({ x: pk.pos.x, y: pk.pos.y, w: 20, h: 20 }, playerBox(p))) continue;
      pk.collected = true;
      if (pk.type === "coin") {
        world.coins += pk.value;
        world.score += pk.value * 50;
        world.breakdown.coins += pk.value * 50;
      } else if (pk.type === "health") {
        p.health = Math.min(MOVEMENT.maxHealth, p.health + pk.value);
      } else if (pk.type === "ammo") {
        for (const w of ["shotgun", "launcher"] as const) {
          if (p.ammo[w] !== null)
            p.ammo[w] = Math.min(
              WEAPONS[w].maxAmmo ?? 0,
              (p.ammo[w] ?? 0) + WEAPONS[w].ammoPerPickup,
            );
        }
      } else if (pk.type === "fact_check") {
        p.factCheckMs = FACT_CHECK_PULSE.durationMs;
      } else if (pk.type === "shotgun") {
        p.weapon = "shotgun";
        p.ammo.shotgun = WEAPONS.shotgun.maxAmmo;
      } else if (pk.type === "launcher") {
        p.weapon = "launcher";
        p.ammo.launcher = WEAPONS.launcher.maxAmmo;
      }
      events.push({
        type: "pickup",
        playerId: pid,
        pickupId: pk.id,
        pickupType: pk.type,
        value: pk.value,
      });
      break;
    }
  }
}

function stepZonesAndHazards(world: WorldState, events: SimEvent[]): void {
  world.restrictedZones = world.restrictedZones.filter((z) => (z.msLeft -= TICK_MS) > 0);
  for (const pid of ["p1", "p2"] as const) {
    if (world.slots[pid] === "DISABLED") continue;
    const p = world.players[pid];
    if (!p.alive || p.downed) continue;
    // Falling out of the world / hazards
    const feetY = p.pos.y + MOVEMENT.bodyHeight / 2;
    const tx0 = Math.floor((p.pos.x - MOVEMENT.bodyWidth / 2 + 0.01) / TILE);
    const tx1 = Math.floor((p.pos.x + MOVEMENT.bodyWidth / 2 - 0.01) / TILE);
    const ty = Math.floor((feetY + 1) / TILE);
    const row = world.level.rows[ty];
    const hazard = row !== undefined && row.slice(tx0, tx1 + 1).includes("H");
    if (hazard) {
      damagePlayer(p, 25, "hazard", null, events);
    }
    if (p.pos.y > world.level.heightTiles * TILE + 64) {
      damagePlayer(p, MOVEMENT.maxHealth, "fall", null, events);
    }
    for (const z of world.restrictedZones) {
      if (aabbOverlap({ x: z.x + z.w / 2, y: z.y + z.h / 2, w: z.w, h: z.h }, playerBox(p))) {
        // Slow, do not damage: "reach reduced".
        p.vel.x *= 0.85;
      }
    }
  }
}

function updateRooms(world: WorldState, events: SimEvent[]): void {
  // Lead player defines current room (furthest x among live players).
  let leadX = 0;
  for (const pid of ["p1", "p2"] as const) {
    if (world.slots[pid] === "DISABLED") continue;
    const p = world.players[pid];
    if (p.alive) leadX = Math.max(leadX, p.pos.x);
  }
  const tileX = Math.floor(leadX / TILE);
  for (const room of world.level.rooms) {
    const [x0, , x1] = room.bounds;
    if (tileX >= x0 && tileX < x1 && room.id !== world.currentRoomId) {
      world.currentRoomId = room.id;
      events.push({ type: "room_entered", roomId: room.id });
    }
    if (room.gateOnEnemies && !world.openedGates[room.id]) {
      const remaining = world.enemies.some((e) => e.roomId === room.id && e.health > 0);
      if (!remaining && world.tick > 1) {
        // Only open once the room has been entered (avoid opening before spawn logic).
        if (
          world.currentRoomId === room.id ||
          roomIndex(world, room.id) < roomIndex(world, world.currentRoomId)
        ) {
          world.openedGates[room.id] = true;
          openGateColumn(world, room.gateTileX);
          events.push({ type: "gate_opened", roomId: room.id });
        }
      }
    }
  }
}

/** Gates are 'G' tiles in the level rows; opening one clears its column. world.level is per-world data. */
function openGateColumn(world: WorldState, gateTileX: number | null): void {
  if (gateTileX === null) return;
  world.level.rows = world.level.rows.map((row) => {
    if (row[gateTileX] !== "G") return row;
    return row.slice(0, gateTileX) + "." + row.slice(gateTileX + 1);
  });
}

function roomIndex(world: WorldState, id: string): number {
  return world.level.rooms.findIndex((r) => r.id === id);
}

/** A closed gate is solid for players; exposed so physics/level can consult it. */
export function isGateClosedAt(world: WorldState, tileX: number): boolean {
  for (const room of world.level.rooms) {
    if (room.gateTileX === tileX && !world.openedGates[room.id]) return true;
  }
  return false;
}

function finalizeScore(world: WorldState): void {
  const timeBonus = Math.max(0, Math.round((TIME_BONUS_PAR_MS - world.elapsedMs) / 1000) * 10);
  const dmg = world.players.p1.damageTaken + world.players.p2.damageTaken;
  const penalty = Math.round(dmg * 2);
  world.breakdown.timeBonus = timeBonus;
  world.breakdown.damageTakenPenalty = penalty;
  world.score =
    world.breakdown.kills +
    world.breakdown.coins +
    world.breakdown.reviveBonus +
    timeBonus -
    penalty;
}

function checkEndConditions(world: WorldState, events: SimEvent[]): void {
  if (world.status !== "playing") return;
  const active = (["p1", "p2"] as const).filter((pid) => world.slots[pid] !== "DISABLED");
  const anyAlive = active.some((pid) => {
    const p = world.players[pid];
    return p.alive && !p.downed;
  });
  const anyDownedAlive = active.some(
    (pid) => world.players[pid].alive && world.players[pid].downed,
  );
  if (!anyAlive && !anyDownedAlive) {
    world.status = "lost";
    finalizeScore(world);
    events.push({ type: "level_lost" });
    return;
  }
  // Both down but not yet dead: lost only when nobody can revive.
  if (!anyAlive && anyDownedAlive) {
    world.status = "lost";
    finalizeScore(world);
    events.push({ type: "level_lost" });
  }
}
