import { TICK_MS } from "../config/movement";
import type { EnemyType } from "../contracts/observation";
import { ENEMY_DEFS } from "../config/enemies";
import { moveAABB } from "./physics";
import type { AABB, EnemyState, PlayerId, SimEvent, WorldState } from "./types";
import { stepEnemyBehavior } from "./enemyBehaviors";
import { visibleFrom } from "./visibility";

export function enemyBox(e: EnemyState): AABB {
  return { x: e.pos.x, y: e.pos.y, w: e.w, h: e.h };
}

export function spawnEnemy(
  world: WorldState,
  id: string,
  type: EnemyType,
  x: number,
  y: number,
  roomId: string,
  facing: "left" | "right" = "left",
): EnemyState {
  const def = ENEMY_DEFS[type];
  const e: EnemyState = {
    id,
    type,
    pos: { x, y },
    vel: { x: 0, y: 0 },
    facing,
    grounded: false,
    health: def.maxHealth,
    maxHealth: def.maxHealth,
    phase: "idle",
    phaseMs: 0,
    data: {},
    hurtMs: 0,
    roomId,
    bubble: null,
    bubbleMs: 0,
    contactDamage: def.contactDamage,
    w: def.width,
    h: def.height,
    flying: def.flying,
  };
  world.enemies.push(e);
  return e;
}

export function damageEnemy(
  world: WorldState,
  e: EnemyState,
  amount: number,
  by: PlayerId,
  events: SimEvent[],
): void {
  if (e.health <= 0) return;
  if (e.type === "consensus_engine" && world.bossPhase === 3 && e.phase !== "special") return;
  const def = ENEMY_DEFS[e.type];
  const actual = e.phase === "special" && def.vulnerableWhileSpecial ? amount * 1.5 : amount;
  e.health -= actual;
  e.hurtMs = 180;
  events.push({ type: "enemy_hurt", enemyId: e.id, damage: actual });
  if (e.health <= 0) {
    e.health = 0;
    if (e.type === "consensus_engine") world.bossActive = false;
    e.phase = "dying";
    e.phaseMs = 0;
    e.bubble = null;
    world.score += def.score;
    world.breakdown.kills += def.score;
    events.push({
      type: "enemy_killed",
      enemyId: e.id,
      enemyType: e.type,
      pos: { ...e.pos },
      score: def.score,
    });
    void by;
  }
}

/** Gravity + tile collision for grounded enemies; flyers skip gravity. */
export function moveEnemy(world: WorldState, e: EnemyState): void {
  const dt = TICK_MS / 1000;
  if (!e.flying) e.vel.y = Math.min(620, e.vel.y + 1700 * dt);
  const res = moveAABB(world.level, enemyBox(e), e.vel, dt, false);
  e.pos = res.pos;
  e.vel = res.vel;
  e.grounded = res.hitGround;
  if (res.hitWall) e.data.hitWall = 1;
}

export function stepEnemies(world: WorldState, events: SimEvent[]): void {
  const alive: EnemyState[] = [];
  for (const e of world.enemies) {
    e.phaseMs += TICK_MS;
    e.hurtMs = Math.max(0, e.hurtMs - TICK_MS);
    e.bubbleMs = Math.max(0, e.bubbleMs - TICK_MS);
    if (e.bubbleMs <= 0) e.bubble = null;
    if (e.phase === "dying") {
      if (e.phaseMs < ENEMY_DEFS[e.type].deathMs) alive.push(e);
      continue;
    }
    const visible = (["p1", "p2"] as const).some(
      (id) =>
        world.slots[id] !== "DISABLED" &&
        world.players[id].alive &&
        !world.players[id].downed &&
        visibleFrom(world.level, world.players[id].pos, e.pos),
    );
    if (!visible) {
      e.vel = { x: 0, y: 0 };
      e.phase = "idle";
      e.phaseMs = 0;
      alive.push(e);
      continue;
    }
    stepEnemyBehavior(world, e, events);
    alive.push(e);
  }
  world.enemies = alive;
}
