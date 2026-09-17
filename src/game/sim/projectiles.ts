import { TICK_MS } from "../config/movement";
import { circleAABBOverlap, isSolidAt } from "./physics";
import { damagePlayer, playerBox } from "./player";
import { damageEnemy, enemyBox } from "./enemies";
import type { PlayerId, SimEvent, WorldState } from "./types";

export function stepProjectiles(world: WorldState, events: SimEvent[]): void {
  const dt = TICK_MS / 1000;
  const remaining = [];
  for (const pr of world.projectiles) {
    pr.ageMs += TICK_MS;
    const dx = pr.vel.x * dt;
    const dy = pr.vel.y * dt;
    pr.pos.x += dx;
    pr.pos.y += dy;
    pr.travelled += Math.hypot(dx, dy);
    let dead = false;

    if (isSolidAt(world.level, pr.pos.x, pr.pos.y) || pr.travelled >= pr.maxTravel) {
      dead = true;
      if (pr.blastRadius > 0) explode(world, pr, events);
      else events.push({ type: "projectile_expired", projectileId: pr.id, pos: { ...pr.pos } });
    }

    if (!dead && pr.ownerKind === "player") {
      for (const e of world.enemies) {
        if (e.phase === "dying" || e.health <= 0) continue;
        if (circleAABBOverlap(pr.pos.x, pr.pos.y, pr.radius, enemyBox(e))) {
          if (pr.blastRadius > 0) explode(world, pr, events);
          else {
            damageEnemy(world, e, pr.damage, pr.ownerId as PlayerId, events);
            events.push({ type: "projectile_hit", projectileId: pr.id, targetId: e.id, pos: { ...pr.pos }, damage: pr.damage });
          }
          dead = true;
          break;
        }
      }
    } else if (!dead && pr.ownerKind === "enemy") {
      for (const pid of ["p1", "p2"] as const) {
        const p = world.players[pid];
        if (world.slots[pid] === "DISABLED" || !p.alive || p.downed) continue;
        if (circleAABBOverlap(pr.pos.x, pr.pos.y, pr.radius, playerBox(p))) {
          damagePlayer(p, pr.damage, pr.ownerId, pr.vel.x > 0 ? "right" : "left", events);
          events.push({ type: "projectile_hit", projectileId: pr.id, targetId: pid, pos: { ...pr.pos }, damage: pr.damage });
          dead = true;
          break;
        }
      }
    }
    if (!dead) remaining.push(pr);
  }
  world.projectiles = remaining;
}

function explode(world: WorldState, pr: WorldState["projectiles"][number], events: SimEvent[]): void {
  events.push({ type: "explosion", pos: { ...pr.pos }, radius: pr.blastRadius });
  for (const e of world.enemies) {
    if (e.health <= 0) continue;
    if (circleAABBOverlap(pr.pos.x, pr.pos.y, pr.blastRadius, enemyBox(e))) {
      damageEnemy(world, e, pr.damage, pr.ownerId as PlayerId, events);
    }
  }
  // Self-damage only; the teammate is never hurt by friendly explosions.
  if (pr.ownerKind === "player" && pr.selfDamageFraction > 0) {
    const owner = world.players[pr.ownerId as PlayerId];
    if (circleAABBOverlap(pr.pos.x, pr.pos.y, pr.blastRadius, playerBox(owner))) {
      damagePlayer(owner, Math.round(pr.damage * pr.selfDamageFraction), "self", pr.pos.x < owner.pos.x ? "right" : "left", events);
    }
  }
}

/** Fact Check Pulse: knock back nearby enemies, clear hostile projectiles. */
export function applyPulse(world: WorldState, playerId: PlayerId, events: SimEvent[]): void {
  const p = world.players[playerId];
  const R = 110;
  for (const e of world.enemies) {
    const d = Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y);
    if (d < R && e.health > 0) {
      const nx = d === 0 ? 1 : (e.pos.x - p.pos.x) / d;
      e.vel.x = nx * 380;
      e.vel.y = -160;
      damageEnemy(world, e, 5, playerId, events);
    }
  }
  world.projectiles = world.projectiles.filter(
    (pr) => !(pr.ownerKind === "enemy" && Math.hypot(pr.pos.x - p.pos.x, pr.pos.y - p.pos.y) < R),
  );
}
