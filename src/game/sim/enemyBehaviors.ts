import { ENEMY_DEFS } from "../config/enemies";
import { rngInt } from "./rng";
import { moveEnemy } from "./enemies";
import { damagePlayer, playerBox } from "./player";
import { aabbOverlap } from "./physics";
import { visibleFrom } from "./visibility";
import type {
  EnemyState,
  PlayerId,
  PlayerState,
  ProjectileState,
  SimEvent,
  WorldState,
} from "./types";

/**
 * Deterministic enemy behaviours. Enemies MAY target players (they are the
 * antagonists); the no-auto-aim rule applies to player characters only.
 *
 * Each behaviour is a small state machine over `e.phase` / `e.phaseMs` with
 * type-specific scratch in `e.data`. Everything must be plain data.
 */

export function nearestLivePlayer(world: WorldState, e: EnemyState): PlayerState | null {
  let best: PlayerState | null = null;
  let bestD = Infinity;
  for (const pid of ["p1", "p2"] as const) {
    if (world.slots[pid] === "DISABLED") continue;
    const p = world.players[pid];
    if (!p.alive || p.downed || !visibleFrom(world.level, p.pos, e.pos)) continue;
    const d = Math.hypot(p.pos.x - e.pos.x, p.pos.y - e.pos.y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

export function maybeBubble(world: WorldState, e: EnemyState, events: SimEvent[]): void {
  const def = ENEMY_DEFS[e.type];
  e.data.bubbleTimer = (e.data.bubbleTimer ?? def.bubbleIntervalMs * 0.5) - 1000 / 60;
  if (e.data.bubbleTimer <= 0 && def.bubbles.length > 0) {
    const r = rngInt(world.rngState, 0, def.bubbles.length);
    world.rngState = r.state;
    e.bubble = def.bubbles[r.value];
    e.bubbleMs = 1600;
    e.data.bubbleTimer = def.bubbleIntervalMs;
    events.push({ type: "enemy_bubble", enemyId: e.id, text: e.bubble });
  }
}

export function contactDamage(world: WorldState, e: EnemyState, events: SimEvent[]): void {
  if (e.contactDamage <= 0) return;
  const box = { x: e.pos.x, y: e.pos.y, w: e.w, h: e.h };
  for (const pid of ["p1", "p2"] as const) {
    if (world.slots[pid] === "DISABLED") continue;
    const p = world.players[pid];
    if (!p.alive || p.downed) continue;
    if (aabbOverlap(box, playerBox(p))) {
      damagePlayer(p, e.contactDamage, e.id, p.pos.x < e.pos.x ? "left" : "right", events);
    }
  }
}

export function fireEnemyProjectile(
  world: WorldState,
  e: EnemyState,
  kind: ProjectileState["weapon"],
  vel: { x: number; y: number },
  damage: number,
  radius: number,
  maxTravel: number,
  variant = 0,
): void {
  world.projectiles.push({
    id: `ep${world.nextId++}`,
    ownerId: e.id,
    ownerKind: "enemy",
    weapon: kind,
    pos: { x: e.pos.x + (vel.x > 0 ? e.w / 2 : -e.w / 2), y: e.pos.y - 6 },
    vel,
    radius,
    damage,
    travelled: 0,
    maxTravel,
    blastRadius: 0,
    selfDamageFraction: 0,
    ageMs: 0,
    variant,
  });
}

function faceToward(e: EnemyState, target: PlayerState): void {
  e.facing = target.pos.x < e.pos.x ? "left" : "right";
}

/** Slow chaser that periodically stops to update its chart, creating an opening. */
function stepDoomProphet(world: WorldState, e: EnemyState, events: SimEvent[]): void {
  const def = ENEMY_DEFS[e.type];
  const target = nearestLivePlayer(world, e);
  if (e.phase === "idle") {
    e.vel.x = 0;
    if (target && Math.abs(target.pos.x - e.pos.x) < 380) {
      e.phase = "move";
      e.phaseMs = 0;
    }
  } else if (e.phase === "move") {
    if (target) faceToward(e, target);
    e.vel.x = (e.facing === "right" ? 1 : -1) * def.speed;
    if (e.phaseMs > 2600) {
      e.phase = "special"; // scrolling
      e.phaseMs = 0;
      e.vel.x = 0;
    }
  } else if (e.phase === "special") {
    e.vel.x = 0;
    if (e.phaseMs > 1500) {
      e.phase = "move";
      e.phaseMs = 0;
    }
  }
  moveEnemy(world, e);
  contactDamage(world, e, events);
  maybeBubble(world, e, events);
}

/** Ranged attacker: telegraph, then throw a graph-shaped projectile. */
function stepRanged(
  world: WorldState,
  e: EnemyState,
  events: SimEvent[],
  kind: ProjectileState["weapon"],
): void {
  const def = ENEMY_DEFS[e.type];
  const R = def.ranged!;
  const target = nearestLivePlayer(world, e);
  e.data.cd = Math.max(0, (e.data.cd ?? 0) - 1000 / 60);
  if (e.phase === "idle" || e.phase === "move") {
    if (target) {
      const dx = target.pos.x - e.pos.x;
      const dist = Math.abs(dx);
      if (dist < R.rangePx && Math.abs(target.pos.y - e.pos.y) < 96 && e.data.cd <= 0) {
        faceToward(e, target);
        e.phase = "telegraph";
        e.phaseMs = 0;
        e.vel.x = 0;
        events.push({ type: "enemy_telegraph", enemyId: e.id });
      } else if (dist < 520) {
        faceToward(e, target);
        // Keep distance: back away if too close, approach if far.
        const dir = dist < 120 ? -Math.sign(dx) : dist > R.rangePx * 0.8 ? Math.sign(dx) : 0;
        e.vel.x = dir * def.speed;
        e.phase = "move";
      } else {
        e.vel.x = 0;
        e.phase = "idle";
      }
    }
  } else if (e.phase === "telegraph") {
    e.vel.x = 0;
    if (e.phaseMs >= R.telegraphMs) {
      e.phase = "attack";
      e.phaseMs = 0;
      const dir = e.facing === "right" ? 1 : -1;
      const lob = kind === "enemy_graph" ? -120 : 0;
      fireEnemyProjectile(
        world,
        e,
        kind,
        { x: dir * R.speed, y: lob },
        R.damage,
        6,
        R.rangePx + 80,
      );
      events.push({ type: "enemy_attack", enemyId: e.id, pos: { ...e.pos } });
      e.data.cd = R.cooldownMs;
    }
  } else if (e.phase === "attack") {
    if (e.phaseMs > 300) {
      e.phase = "recover";
      e.phaseMs = 0;
    }
  } else if (e.phase === "recover") {
    if (e.phaseMs > 500) {
      e.phase = "idle";
      e.phaseMs = 0;
    }
  }
  moveEnemy(world, e);
  contactDamage(world, e, events);
  maybeBubble(world, e, events);
}

function stepReplyHorde(world: WorldState, e: EnemyState, events: SimEvent[]): void {
  const def = ENEMY_DEFS[e.type];
  const target = nearestLivePlayer(world, e);
  if (target) faceToward(e, target);
  if (e.grounded) {
    e.data.hop = (e.data.hop ?? 0) + 1000 / 60;
    if (e.data.hop > 350) {
      e.data.hop = 0;
      const r = rngInt(world.rngState, 0, 3);
      world.rngState = r.state;
      e.vel.y = -(260 + r.value * 60);
      e.vel.x = (e.facing === "right" ? 1 : -1) * def.speed * (0.6 + r.value * 0.3);
    } else {
      e.vel.x *= 0.85;
    }
  }
  moveEnemy(world, e);
  contactDamage(world, e, events);
  maybeBubble(world, e, events);
}

function stepHallMonitor(world: WorldState, e: EnemyState, events: SimEvent[]): void {
  const def = ENEMY_DEFS[e.type];
  const target = nearestLivePlayer(world, e);
  e.data.t = (e.data.t ?? 0) + 1000 / 60;
  const homeY = e.data.homeY ?? (e.data.homeY = e.pos.y);
  if (target && Math.abs(target.pos.x - e.pos.x) < 420) {
    faceToward(e, target);
    const dx = target.pos.x - e.pos.x;
    e.vel.x = Math.sign(dx) * Math.min(def.speed, Math.abs(dx));
    e.vel.y = (homeY - 40 + Math.sin(e.data.t / 400) * 18 - e.pos.y) * 3;
    e.data.mark = (e.data.mark ?? 0) - 1000 / 60;
    if (e.data.mark <= 0) {
      e.data.mark = 4500;
      world.restrictedZones.push({
        x: e.pos.x - 48,
        y: e.pos.y,
        w: 96,
        h: 80,
        msLeft: 2500,
        ownerId: e.id,
      });
      e.phase = "attack";
      e.phaseMs = 0;
      events.push({ type: "enemy_attack", enemyId: e.id, pos: { ...e.pos } });
    } else if (e.phase === "attack" && e.phaseMs > 400) {
      e.phase = "move";
    }
  } else {
    e.vel.x = Math.sin(e.data.t / 900) * def.speed * 0.5;
    e.vel.y = (homeY + Math.sin(e.data.t / 500) * 12 - e.pos.y) * 3;
    e.phase = "idle";
  }
  moveEnemy(world, e);
  contactDamage(world, e, events);
  maybeBubble(world, e, events);
}

/** Heavy melee: slow windup, then a ground shockwave in facing direction. */
function stepPurityEnforcer(world: WorldState, e: EnemyState, events: SimEvent[]): void {
  const def = ENEMY_DEFS[e.type];
  const R = def.ranged!;
  const target = nearestLivePlayer(world, e);
  e.data.cd = Math.max(0, (e.data.cd ?? 0) - 1000 / 60);
  if (e.phase === "idle" || e.phase === "move") {
    if (target && Math.abs(target.pos.x - e.pos.x) < 400) {
      faceToward(e, target);
      const dist = Math.abs(target.pos.x - e.pos.x);
      if (dist < 110 && e.data.cd <= 0 && e.grounded) {
        e.phase = "telegraph";
        e.phaseMs = 0;
        e.vel.x = 0;
        events.push({ type: "enemy_telegraph", enemyId: e.id });
      } else {
        e.vel.x = (e.facing === "right" ? 1 : -1) * def.speed;
        e.phase = "move";
      }
    } else {
      e.vel.x = 0;
      e.phase = "idle";
    }
  } else if (e.phase === "telegraph") {
    e.vel.x = 0;
    if (e.phaseMs >= R.telegraphMs) {
      e.phase = "attack";
      e.phaseMs = 0;
      const dir = e.facing === "right" ? 1 : -1;
      // Shockwave hugs the ground: spawn at foot level travelling horizontally.
      world.projectiles.push({
        id: `ep${world.nextId++}`,
        ownerId: e.id,
        ownerKind: "enemy",
        weapon: "enemy_shockwave",
        pos: { x: e.pos.x + dir * e.w * 0.6, y: e.pos.y + e.h / 2 - 10 },
        vel: { x: dir * R.speed, y: 0 },
        radius: 12,
        damage: R.damage,
        travelled: 0,
        maxTravel: R.rangePx,
        blastRadius: 0,
        selfDamageFraction: 0,
        ageMs: 0,
        variant: 0,
      });
      events.push({ type: "enemy_attack", enemyId: e.id, pos: { ...e.pos } });
      e.data.cd = R.cooldownMs;
    }
  } else if (e.phase === "attack") {
    if (e.phaseMs > 450) {
      e.phase = "recover";
      e.phaseMs = 0;
    }
  } else if (e.phase === "recover") {
    if (e.phaseMs > 700) {
      e.phase = "idle";
      e.phaseMs = 0;
    }
  }
  moveEnemy(world, e);
  contactDamage(world, e, events);
  maybeBubble(world, e, events);
}

/** Blockader: fires bubbles, plants its sign (blocking), vulnerable while composing. */
function stepBlockader(world: WorldState, e: EnemyState, events: SimEvent[]): void {
  e.data.compose = (e.data.compose ?? 6000) - 1000 / 60;
  if (e.phase !== "special" && e.data.compose <= 0) {
    e.phase = "special";
    e.phaseMs = 0;
    e.vel.x = 0;
    e.bubble = "typing…";
    e.bubbleMs = 2200;
  }
  if (e.phase === "special") {
    e.vel.x = 0;
    moveEnemy(world, e);
    if (e.phaseMs > 2200) {
      e.phase = "idle";
      e.phaseMs = 0;
      e.data.compose = 7000;
    }
    return;
  }
  stepRanged(world, e, events, "enemy_bubble");
}

export function stepEnemyBehavior(world: WorldState, e: EnemyState, events: SimEvent[]): void {
  switch (e.type) {
    case "doom_prophet":
      return stepDoomProphet(world, e, events);
    case "catastrophe_prophet":
      return stepRanged(world, e, events, "enemy_graph");
    case "datacenter_blockader":
      return stepBlockader(world, e, events);
    case "purity_enforcer":
      return stepPurityEnforcer(world, e, events);
    case "hall_monitor":
      return stepHallMonitor(world, e, events);
    case "reply_horde":
      return stepReplyHorde(world, e, events);
    case "consensus_engine":
      return stepBoss(world, e, events);
  }
}

/* ---------------- Boss ---------------- */

function stepBoss(world: WorldState, e: EnemyState, events: SimEvent[]): void {
  const def = ENEMY_DEFS[e.type];
  const R = def.ranged!;
  world.bossActive = true;
  const frac = e.health / e.maxHealth;
  const phase = frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3;
  if (phase !== world.bossPhase) {
    world.bossPhase = phase;
    e.bossPhase = phase;
    events.push({ type: "boss_phase", phase });
    // Phase 3 requires both switches; make them available.
    if (phase === 3) {
      for (const it of world.interactables)
        if (it.type === "switch" && it.roomId === e.roomId) it.activated = false;
    }
  }
  e.data.t = (e.data.t ?? 0) + 1000 / 60;
  const homeY = e.data.homeY ?? (e.data.homeY = e.pos.y);
  e.vel.y = (homeY + Math.sin(e.data.t / 700) * 10 - e.pos.y) * 2;
  e.vel.x = 0;
  e.data.cd = Math.max(0, (e.data.cd ?? 1500) - 1000 / 60);
  const target = nearestLivePlayer(world, e);
  if (phase === 3) {
    const switches = world.interactables.filter(
      (i) => i.type === "switch" && i.roomId === e.roomId,
    );
    if (switches.length > 0 && switches.every((s) => s.activated)) {
      // Overload: boss becomes vulnerable and stops attacking briefly.
      e.data.overload = (e.data.overload ?? 0) + 1000 / 60;
      e.phase = "special";
      if (e.data.overload > 6000) {
        for (const s of switches) s.activated = false;
        e.data.overload = 0;
        e.phase = "idle";
      }
      moveEnemy(world, e);
      maybeBubble(world, e, events);
      return;
    }
  }
  if (e.data.cd <= 0 && target) {
    e.phase = "telegraph";
    e.phaseMs = 0;
    events.push({ type: "enemy_telegraph", enemyId: e.id });
    e.data.cd = Math.max(900, R.cooldownMs - phase * 250);
  }
  if (e.phase === "telegraph" && e.phaseMs >= R.telegraphMs) {
    e.phase = "attack";
    e.phaseMs = 0;
    events.push({ type: "enemy_attack", enemyId: e.id, pos: { ...e.pos } });
    const r = rngInt(world.rngState, 0, 3);
    world.rngState = r.state;
    if (phase === 1) {
      // Doomer predictions: falling charts from above at 3 x positions around target.
      for (let i = -1; i <= 1; i++) {
        const x = (target?.pos.x ?? e.pos.x) + i * 90 + (r.value - 1) * 20;
        world.projectiles.push(
          mkBossProj(
            world,
            e.id,
            { x, y: e.pos.y - 100 },
            { x: 0, y: R.speed },
            R.damage,
            "enemy_graph",
            0,
          ),
        );
      }
    } else if (phase === 2) {
      // Purity-test attacks: horizontal sweeps left and right + contradictory slogans.
      for (const dir of [-1, 1]) {
        world.projectiles.push(
          mkBossProj(
            world,
            e.id,
            { x: e.pos.x + dir * 70, y: e.pos.y + 30 + r.value * 15 },
            { x: dir * R.speed, y: 0 },
            R.damage,
            "enemy_boss",
            1,
          ),
        );
      }
      e.bubble = r.value === 0 ? "APOLOGIZE." : r.value === 1 ? "NEVER APOLOGIZE." : "BOTH.";
      e.bubbleMs = 1200;
    } else {
      // Algorithmic overload: radial burst.
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + r.value * 0.3;
        world.projectiles.push(
          mkBossProj(
            world,
            e.id,
            { ...e.pos },
            { x: Math.cos(a) * R.speed * 0.8, y: Math.sin(a) * R.speed * 0.8 },
            R.damage,
            "enemy_boss",
            2,
          ),
        );
      }
    }
  }
  if (e.phase === "attack" && e.phaseMs > 400) e.phase = "idle";
  moveEnemy(world, e);
  contactDamage(world, e, events);
  maybeBubble(world, e, events);
}

function mkBossProj(
  world: WorldState,
  ownerId: string,
  pos: { x: number; y: number },
  vel: { x: number; y: number },
  damage: number,
  weapon: ProjectileState["weapon"],
  variant: number,
): ProjectileState {
  return {
    id: `ep${world.nextId++}`,
    ownerId,
    ownerKind: "enemy",
    weapon,
    pos,
    vel,
    radius: 8,
    damage,
    travelled: 0,
    maxTravel: 900,
    blastRadius: 0,
    selfDamageFraction: 0,
    ageMs: 0,
    variant,
  };
}

export type { PlayerId };
