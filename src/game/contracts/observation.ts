import { z } from "zod";
import { DirectiveIdSchema } from "./directives";

/**
 * Units: positions/distances in world pixels (1 tile = 32 px), velocities in
 * px/s, times in ms. All positions except `self.position` are relative to
 * JEV's centre: +x is right, +y is DOWN (screen space).
 */

const Vec2 = z.object({ x: z.number(), y: z.number() });
export const WeaponIdSchema = z.enum(["blaster", "shotgun", "launcher"]);
export type WeaponId = z.infer<typeof WeaponIdSchema>;

const RulesSchema = z.object({
  units: z.object({
    distance: z.literal("px"),
    velocity: z.literal("px/s"),
    time: z.literal("ms"),
    tileSizePx: z.number().positive(),
  }),
  coordinates: z.object({
    positiveX: z.literal("right"),
    positiveY: z.literal("down"),
    relativeTo: z.literal("self center"),
  }),
  movement: z.object({
    bodyWidthPx: z.number().positive(),
    bodyHeightPx: z.number().positive(),
    runSpeedPxPerS: z.number().positive(),
    maxFallSpeedPxPerS: z.number().positive(),
  }),
  jump: z.object({
    jumpVelocityPxPerS: z.number(),
    gravityPxPerS2: z.number().positive(),
    maxRisePx: z.number().nonnegative(),
    approximateFullHoldMs: z.number().positive(),
    minimumHoldMs: z.number().positive(),
    coyoteTimeMs: z.number().nonnegative(),
    jumpCutVelocityPxPerS: z.number(),
  }),
  dash: z.object({
    speedPxPerS: z.number().positive(),
    durationMs: z.number().positive(),
    cooldownMs: z.number().positive(),
    verticalVelocity: z.literal("held at 0 while dashing"),
  }),
  weapon: z.object({
    id: WeaponIdSchema,
    label: z.string(),
    damage: z.number().positive(),
    pelletsPerShot: z.number().int().positive(),
    rangePx: z.number().positive(),
    fireCooldownMs: z.number().positive(),
    ammunition: z.number().nullable(),
    blastRadiusPx: z.number().nonnegative(),
    firing: z.literal("horizontal along facing"),
  }),
  interaction: z.object({
    interactRangePx: z.number().positive(),
    reviveRangePx: z.number().positive(),
    reviveHoldMs: z.number().positive(),
    reviveHealthFraction: z.number().min(0).max(1),
    reviveRequires: z.literal("alive, not downed, in range, and held interact"),
  }),
});

const PlatformSchema = z.object({
  id: z.string(),
  relativePosition: Vec2,
  widthPx: z.number().positive(),
  surface: z.enum(["solid", "oneway"]),
  hazardBelow: z.boolean(),
  reachableByJumpEstimate: z.boolean(),
});

export const ObjectiveTypeSchema = z.enum([
  "traverse",
  "survive",
  "defeat_enemies",
  "revive_teammate",
  "interact",
  "reach_exit",
]);

export const EnemyTypeSchema = z.enum([
  "doom_prophet",
  "catastrophe_prophet",
  "datacenter_blockader",
  "purity_enforcer",
  "hall_monitor",
  "reply_horde",
  "consensus_engine",
]);
export type EnemyType = z.infer<typeof EnemyTypeSchema>;

export const PickupTypeSchema = z.enum([
  "health",
  "shotgun",
  "launcher",
  "ammo",
  "fact_check",
  "coin",
]);
export type PickupType = z.infer<typeof PickupTypeSchema>;

export const InteractableTypeSchema = z.enum([
  "switch",
  "door",
  "weapon_crate",
  "revive_teammate",
  "exit",
]);
export type InteractableType = z.infer<typeof InteractableTypeSchema>;

export const VerticalAlignmentSchema = z.enum([
  "aligned",
  "slightly_above",
  "slightly_below",
  "far_above",
  "far_below",
]);

export const OBSERVATION_LIMITS = {
  enemies: 8,
  hostileProjectiles: 8,
  pickups: 3,
  interactables: 4,
} as const;

export const GameObservationV1Schema = z.object({
  schemaVersion: z.literal("1.0"),
  episodeId: z.string().min(1).max(64),
  tick: z.number().int().nonnegative(),
  timestampMs: z.number().nonnegative(),
  rules: RulesSchema,

  directive: z.object({
    id: DirectiveIdSchema,
    description: z.string().max(400),
  }),

  objective: z.object({
    type: ObjectiveTypeSchema,
    description: z.string().max(200),
  }),

  self: z.object({
    id: z.string(),
    character: z.literal("jev"),
    position: Vec2,
    velocity: Vec2,
    facing: z.enum(["left", "right"]),
    grounded: z.boolean(),
    onOneWayPlatform: z.boolean(),
    nearLeftEdge: z.boolean(),
    nearRightEdge: z.boolean(),
    health: z.number(),
    maxHealth: z.number(),
    alive: z.boolean(),
    downed: z.boolean(),
    weapon: WeaponIdSchema,
    ammunition: z.number().nullable(),
    canShoot: z.boolean(),
    canJump: z.boolean(),
    jumpHeld: z.boolean().default(false),
    canDash: z.boolean(),
    dashCooldownMs: z.number(),
    canInteract: z.boolean(),
  }),

  teammate: z.object({
    id: z.string(),
    character: z.literal("user"),
    relativePosition: Vec2,
    velocity: Vec2,
    healthFraction: z.number(),
    alive: z.boolean(),
    downed: z.boolean(),
    surrounded: z.boolean(),
    imminentDanger: z.boolean(),
  }),

  terrain: z.object({
    groundDistanceBelow: z.number().nullable(),
    ceilingDistanceAbove: z.number().nullable(),
    leftWallDistance: z.number().nullable(),
    rightWallDistance: z.number().nullable(),
    safeLandingLeft: z.boolean(),
    safeLandingRight: z.boolean(),
    jumpWouldReachPlatform: z.boolean(),
    dropIsSafe: z.boolean(),
    platforms: z.array(PlatformSchema).max(6),
    nextObstruction: z
      .object({
        side: z.enum(["left", "right"]),
        distancePx: z.number().nonnegative(),
        type: z.enum(["wall", "closed_gate"]),
      })
      .nullable(),
  }),
  progression: z.object({
    roomId: z.string(),
    roomIndex: z.number().int().nonnegative(),
    objectiveStatus: z.enum(["active", "blocked", "complete"]),
    blockedReason: z.string().nullable(),
    gate: z
      .object({
        present: z.boolean(),
        open: z.boolean(),
        distancePx: z.number().nullable(),
        remainingEnemies: z.number().int().nonnegative(),
        requiredSwitches: z.number().int().nonnegative(),
        activatedSwitches: z.number().int().nonnegative(),
      })
      .nullable(),
  }),

  enemies: z
    .array(
      z.object({
        id: z.string(),
        type: EnemyTypeSchema,
        relativePosition: Vec2,
        relativeVelocity: Vec2,
        horizontalSide: z.enum(["left", "right", "overlapping"]),
        distance: z.number(),
        verticalAlignment: VerticalAlignmentSchema,
        lineOfFireClear: z.boolean(),
        withinWeaponRange: z.boolean(),
        facingSelf: z.boolean(),
        healthFraction: z.number(),
        attacking: z.boolean(),
        telegraphing: z.boolean(),
        estimatedTimeToContactMs: z.number().nullable(),
      }),
    )
    .max(OBSERVATION_LIMITS.enemies),

  hostileProjectiles: z
    .array(
      z.object({
        id: z.string(),
        relativePosition: Vec2,
        relativeVelocity: Vec2,
        approaching: z.boolean(),
        estimatedTimeToClosestApproachMs: z.number().nullable(),
        estimatedMissDistance: z.number().nullable(),
        canJumpOver: z.boolean(),
        canDropUnder: z.boolean(),
      }),
    )
    .max(OBSERVATION_LIMITS.hostileProjectiles),

  pickups: z
    .array(
      z.object({
        id: z.string(),
        type: PickupTypeSchema,
        value: z.number(),
        relativePosition: Vec2,
        distance: z.number(),
        pathAppearsSafe: z.boolean(),
      }),
    )
    .max(OBSERVATION_LIMITS.pickups),

  interactables: z
    .array(
      z.object({
        id: z.string(),
        type: InteractableTypeSchema,
        relativePosition: Vec2,
        inRange: z.boolean(),
        activated: z.boolean(),
      }),
    )
    .max(OBSERVATION_LIMITS.interactables),

  tactical: z.object({
    dangerLevel: z.enum(["low", "medium", "high", "critical"]),
    enemyCount: z.number().int(),
    imminentProjectileCount: z.number().int(),
    clearShotExistsLeft: z.boolean(),
    clearShotExistsRight: z.boolean(),
    teammateNeedsRevive: z.boolean(),
  }),

  game: z.object({
    levelId: z.string(),
    roomId: z.string(),
    score: z.number(),
    coins: z.number().int(),
    scoreBreakdown: z.object({
      kills: z.number(),
      coins: z.number(),
      timeBonus: z.number(),
      damageTakenPenalty: z.number(),
      reviveBonus: z.number(),
    }),
    elapsedMs: z.number(),
    status: z.enum(["playing", "won", "lost"]),
  }),
});

export type GameObservationV1 = z.infer<typeof GameObservationV1Schema>;
export type ObservedEnemy = GameObservationV1["enemies"][number];
export type ObservedProjectile = GameObservationV1["hostileProjectiles"][number];

/** Stable key order + fixed float precision so identical states serialize identically. */
export function serializeObservation(obs: GameObservationV1): string {
  return JSON.stringify(obs, (_key, value: unknown) => {
    if (typeof value === "number" && !Number.isInteger(value)) {
      return Math.round(value * 100) / 100;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      return Object.keys(record)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = record[k];
          return acc;
        }, {});
    }
    return value;
  });
}
