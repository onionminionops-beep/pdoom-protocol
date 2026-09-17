/**
 * Every movement constant for BOTH characters lives here. User and JEV share
 * this object by reference; there is intentionally no per-character override.
 * Units: px, px/s, px/s², ms. Tile size is 32 px.
 */
export const TILE = 32;
export const TICK_MS = 1000 / 60;

export const MOVEMENT = {
  bodyWidth: 20,
  bodyHeight: 40,

  runSpeed: 200,
  groundAccel: 1800,
  groundDecel: 2200,
  turnDecelMultiplier: 1.8,
  airAccel: 1100,
  airDecel: 500,

  gravity: 1700,
  maxFallSpeed: 620,
  jumpVelocity: -520,
  /** Releasing jump early caps upward speed to this (variable-height jumps). */
  jumpCutVelocity: -140,
  /** Minimum ms jump must be held before a cut applies. */
  jumpMinHoldMs: 60,
  coyoteTimeMs: 90,
  jumpBufferMs: 110,
  /** Time after leaving a one-way platform via drop during which it is ignored. */
  dropThroughIgnoreMs: 180,

  dashSpeed: 520,
  dashDurationMs: 140,
  dashCooldownMs: 650,
  /** Dash keeps the player's vertical velocity at 0 while active. */

  skidThreshold: 90,
  /** Distance from an edge (px) that flips `nearLeftEdge`/`nearRightEdge`. */
  edgeProbeDistance: 12,

  maxHealth: 100,
  invulnerabilityAfterHitMs: 500,
  hurtKnockbackX: 160,
  hurtKnockbackY: -180,

  reviveRangePx: 40,
  reviveHoldMs: 1200,
  reviveHealthFraction: 0.5,
  interactRangePx: 36,
} as const;

export type MovementConfig = typeof MOVEMENT;
