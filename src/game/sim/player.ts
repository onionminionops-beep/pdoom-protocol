import { MOVEMENT, TICK_MS } from "../config/movement";
import { WEAPONS, FACT_CHECK_PULSE } from "../config/weapons";
import type { PlayerInputV1 } from "../contracts/input";
import { groundBelow, moveAABB } from "./physics";
import type {
  AABB,
  Facing,
  PlayerId,
  PlayerState,
  ProjectileState,
  SimEvent,
  WorldState,
} from "./types";

export function playerBox(p: PlayerState): AABB {
  return { x: p.pos.x, y: p.pos.y, w: MOVEMENT.bodyWidth, h: MOVEMENT.bodyHeight };
}

export function otherPlayerId(id: PlayerId): PlayerId {
  return id === "p1" ? "p2" : "p1";
}

function setAnim(p: PlayerState, anim: PlayerState["anim"]): void {
  if (p.anim !== anim) {
    p.anim = anim;
    p.animMs = 0;
  }
}

/**
 * Advances one player by one tick given its input. Facing changes ONLY when
 * `input.horizontal` is left/right. Nothing in here reads enemy positions.
 */
export function stepPlayer(
  world: WorldState,
  p: PlayerState,
  input: PlayerInputV1,
  events: SimEvent[],
): void {
  const dt = TICK_MS / 1000;
  const M = MOVEMENT;
  p.animMs += TICK_MS;
  p.lastInput = { ...input };

  // timers
  p.fireCooldownMs = Math.max(0, p.fireCooldownMs - TICK_MS);
  p.dashCooldownMs = Math.max(0, p.dashCooldownMs - TICK_MS);
  p.invulnMs = Math.max(0, p.invulnMs - TICK_MS);
  p.dropIgnoreMs = Math.max(0, p.dropIgnoreMs - TICK_MS);
  p.coyoteMs = Math.max(0, p.coyoteMs - TICK_MS);
  p.jumpBufferMs = Math.max(0, p.jumpBufferMs - TICK_MS);
  p.factCheckCooldownMs = Math.max(0, p.factCheckCooldownMs - TICK_MS);
  p.factCheckMs = Math.max(0, p.factCheckMs - TICK_MS);

  if (!p.alive) {
    setAnim(p, "death");
    return;
  }

  if (p.downed) {
    p.downedTimerMs -= TICK_MS;
    p.vel.x = 0;
    applyGravityAndMove(world, p, dt, false);
    setAnim(p, "downed");
    if (p.downedTimerMs <= 0) {
      p.alive = false;
      events.push({ type: "player_died", playerId: p.id });
    }
    return;
  }

  // ---- facing: explicit horizontal input only
  const h = input.horizontal;
  if (h === "left") p.facing = "left";
  else if (h === "right") p.facing = "right";

  const wantDir = h === "left" ? -1 : h === "right" ? 1 : 0;

  // ---- dash
  if (p.dashTimeMs > 0) {
    p.dashTimeMs -= TICK_MS;
    p.vel.x = (p.dashDir === "right" ? 1 : -1) * M.dashSpeed;
    p.vel.y = 0;
    const res = moveAABB(world.level, playerBox(p), p.vel, dt, false);
    p.pos = res.pos;
    if (res.hitWall) p.dashTimeMs = 0;
    setAnim(p, "dash");
    return;
  }
  if (input.dash && p.dashCooldownMs <= 0) {
    p.dashTimeMs = M.dashDurationMs;
    p.dashCooldownMs = M.dashCooldownMs;
    p.dashDir = p.facing;
    events.push({ type: "dash", playerId: p.id, facing: p.facing });
  }

  // ---- horizontal accel
  const onGround = p.grounded;
  const accel = onGround ? M.groundAccel : M.airAccel;
  const decel = onGround ? M.groundDecel : M.airDecel;
  let skidding = false;
  if (wantDir !== 0) {
    const turning = Math.sign(p.vel.x) !== 0 && Math.sign(p.vel.x) !== wantDir;
    const a = turning ? accel * M.turnDecelMultiplier : accel;
    p.vel.x += wantDir * a * dt;
    if (turning && onGround && Math.abs(p.vel.x) > M.skidThreshold) skidding = true;
    p.vel.x = Math.max(-M.runSpeed, Math.min(M.runSpeed, p.vel.x));
  } else {
    const s = Math.sign(p.vel.x);
    p.vel.x -= s * decel * dt;
    if (Math.sign(p.vel.x) !== s) p.vel.x = 0;
  }

  // ---- jump handling (buffer + coyote + variable height)
  const jumpPressed = input.verticalAction === "jump";
  if (jumpPressed && !p.jumpHeld) p.jumpBufferMs = M.jumpBufferMs;
  if (jumpPressed) p.jumpHeldMs += TICK_MS;
  else if (!p.jumping) p.jumpHeldMs = 0;
  p.jumpHeld = jumpPressed;

  const canJumpNow = p.grounded || p.coyoteMs > 0;
  if (p.jumpBufferMs > 0 && canJumpNow) {
    p.vel.y = M.jumpVelocity;
    p.jumping = true;
    p.jumpHeldMs = 0;
    p.grounded = false;
    p.coyoteMs = 0;
    p.jumpBufferMs = 0;
    events.push({ type: "jump", playerId: p.id });
  }
  if (p.jumping && !jumpPressed) p.jumpHeldMs += TICK_MS;
  if (p.jumping && !jumpPressed && p.vel.y < M.jumpCutVelocity && p.jumpHeldMs >= M.jumpMinHoldMs) {
    p.vel.y = M.jumpCutVelocity;
    p.jumping = false;
  }
  if (p.vel.y >= 0) p.jumping = false;

  // ---- drop-through
  if (input.verticalAction === "drop" && p.grounded && p.onOneWayPlatform) {
    p.dropIgnoreMs = M.dropThroughIgnoreMs;
    p.grounded = false;
    p.vel.y = Math.max(p.vel.y, 60);
  }

  applyGravityAndMove(world, p, dt, p.dropIgnoreMs > 0);

  // ---- animation
  if (p.invulnMs > M.invulnerabilityAfterHitMs - 260) setAnim(p, "hurt");
  else if (!p.grounded) setAnim(p, p.vel.y < 0 ? "jump" : "fall");
  else if (p.anim === "land" && p.animMs < 120) {
    /* hold landing */
  } else if (skidding) setAnim(p, "skid");
  else if (Math.abs(p.vel.x) > 10) setAnim(p, "run");
  else if (p.anim === "shoot" && p.animMs < 160) {
    /* hold shoot */
  } else if (p.anim === "idle" && p.animMs > 6000) setAnim(p, "idle_personality");
  else if (p.anim === "idle_personality" && p.animMs > 1400) setAnim(p, "idle");
  else if (p.anim !== "idle_personality") setAnim(p, "idle");

  if (p.reviveProgressMs > 0) setAnim(p, "revive");
}

function applyGravityAndMove(
  world: WorldState,
  p: PlayerState,
  dt: number,
  ignoreOneWay: boolean,
): void {
  const M = MOVEMENT;
  p.vel.y = Math.min(M.maxFallSpeed, p.vel.y + M.gravity * dt);
  const res = moveAABB(world.level, playerBox(p), p.vel, dt, ignoreOneWay);
  p.pos = res.pos;
  p.vel = res.vel;
  p.wasGrounded = p.grounded;
  if (res.hitGround) {
    p.grounded = true;
    p.onOneWayPlatform = res.onOneWay;
    p.coyoteMs = M.coyoteTimeMs;
  } else {
    const g = groundBelow(world.level, playerBox(p), 1, ignoreOneWay);
    if (g.found && p.vel.y >= 0) {
      p.grounded = true;
      p.onOneWayPlatform = g.oneWay;
      p.coyoteMs = M.coyoteTimeMs;
    } else {
      if (p.grounded) p.coyoteMs = M.coyoteTimeMs;
      p.grounded = false;
      p.onOneWayPlatform = false;
    }
  }
}

/** Landing event detection, called after stepPlayer. */
export function detectLanding(p: PlayerState, prevVy: number, events: SimEvent[]): void {
  if (p.grounded && !p.wasGrounded && prevVy > 120) {
    events.push({ type: "land", playerId: p.id, impactVy: prevVy });
    p.anim = "land";
    p.animMs = 0;
  }
}

/**
 * Fires the current weapon if legal. Projectiles travel horizontally in
 * `p.facing`; the only vertical component is the weapon's fixed pellet spread.
 */
export function tryShoot(
  world: WorldState,
  p: PlayerState,
  input: PlayerInputV1,
  events: SimEvent[],
): void {
  if (!input.shoot || !p.alive) return;
  if (p.downed) {
    events.push({ type: "shot_blocked", playerId: p.id, reason: "downed" });
    return;
  }
  if (p.dashTimeMs > 0) {
    events.push({ type: "shot_blocked", playerId: p.id, reason: "dashing" });
    return;
  }
  if (p.fireCooldownMs > 0) return; // holding shoot is fine; silently wait
  const def = WEAPONS[p.weapon];
  const ammo = p.ammo[p.weapon];
  if (ammo !== null && ammo <= 0) {
    events.push({ type: "shot_blocked", playerId: p.id, reason: "no_ammo" });
    // Auto-fallback to blaster is a rule of the sim, not aim assistance.
    p.weapon = "blaster";
    return;
  }
  const dir: 1 | -1 = p.facing === "right" ? 1 : -1;
  const muzzle = { x: p.pos.x + dir * (MOVEMENT.bodyWidth / 2 + 6), y: p.pos.y - 4 };
  for (let i = 0; i < def.pellets; i++) {
    const t = def.pellets === 1 ? 0 : i / (def.pellets - 1) - 0.5; // -0.5..0.5
    const proj: ProjectileState = {
      id: `pr${world.nextId++}`,
      ownerId: p.id,
      ownerKind: "player",
      weapon: def.id,
      pos: { ...muzzle },
      vel: { x: dir * def.projectileSpeed, y: t * 2 * def.spreadVy },
      radius: def.projectileRadius,
      damage: def.damage,
      travelled: 0,
      maxTravel: def.rangePx,
      blastRadius: def.blastRadius,
      selfDamageFraction: def.selfDamageFraction,
      ageMs: 0,
      variant: i,
    };
    world.projectiles.push(proj);
  }
  if (ammo !== null) p.ammo[p.weapon] = ammo - 1;
  p.fireCooldownMs = def.fireCooldownMs;
  p.vel.x -= dir * def.recoilVx;
  p.anim = "shoot";
  p.animMs = 0;
  events.push({ type: "shot", playerId: p.id, weapon: def.id, facing: p.facing, pos: muzzle });
}

export function tryFactCheckPulse(
  world: WorldState,
  p: PlayerState,
  input: PlayerInputV1,
  events: SimEvent[],
): boolean {
  if (!input.interact || p.factCheckMs <= 0 || p.factCheckCooldownMs > 0 || p.downed || !p.alive)
    return false;
  p.factCheckCooldownMs = FACT_CHECK_PULSE.cooldownMs;
  events.push({ type: "fact_check_pulse", playerId: p.id, pos: { ...p.pos } });
  return true;
}

export function damagePlayer(
  p: PlayerState,
  amount: number,
  from: string,
  knockDir: Facing | null,
  events: SimEvent[],
): void {
  if (!p.alive || p.downed || p.invulnMs > 0 || p.dashTimeMs > 0) return;
  p.health = Math.max(0, p.health - amount);
  p.damageTaken += amount;
  p.invulnMs = MOVEMENT.invulnerabilityAfterHitMs;
  if (knockDir) {
    p.vel.x = (knockDir === "right" ? 1 : -1) * MOVEMENT.hurtKnockbackX;
    p.vel.y = MOVEMENT.hurtKnockbackY;
    p.grounded = false;
  }
  events.push({ type: "player_hurt", playerId: p.id, damage: amount, from });
  if (p.health <= 0) {
    p.downed = true;
    p.downedTimerMs = 20000;
    p.reviveProgressMs = 0;
    events.push({ type: "player_downed", playerId: p.id });
  }
}
