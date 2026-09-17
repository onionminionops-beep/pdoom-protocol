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
  units: z.literal("distance px; velocity px/s; time ms; tile 32 px"),
  coordinates: z.literal("+x right, +y down; relative positions use self center"),
  movement: z.object({
    bodyWidthPx: z.number().positive(),
    bodyHeightPx: z.number().positive(),
    runSpeedPxPerS: z.number().positive(),
  }),
  jump: z.object({
    jumpVelocityPxPerS: z.number(),
    gravityPxPerS2: z.number().positive(),
    maxRisePx: z.number().nonnegative(),
    approximateHorizontalReachPx: z.number().positive(),
    approximateFullHoldMs: z.number().positive(),
    minimumHoldMs: z.number().positive(),
  }),
  dash: z.object({
    speedPxPerS: z.number().positive(),
    durationMs: z.number().positive(),
    cooldownMs: z.number().positive(),
  }),
  weapon: z.object({
    rangePx: z.number().positive(),
    fireCooldownMs: z.number().positive(),
    blastRadiusPx: z.number().nonnegative(),
    firing: z.literal("horizontal along facing"),
  }),
  interaction: z.object({
    interactRangePx: z.number().positive(),
    reviveRangePx: z.number().positive(),
    reviveHoldMs: z.number().positive(),
    reviveHealthFraction: z.number().min(0).max(1),
  }),
});

const PlatformSchema = z.object({
  id: z.string(),
  relativeLeftX: z.number(),
  relativeRightX: z.number(),
  relativeTopY: z.number(),
  surface: z.enum(["solid", "oneway"]),
  horizontalGapPx: z.number().nonnegative(),
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
    platforms: z.array(PlatformSchema).max(2),
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
    objectiveStatus: z.enum(["active", "blocked"]),
    blockedReason: z.string().nullable(),
    gate: z
      .object({
        present: z.boolean(),
        open: z.boolean(),
        distancePx: z.number().nullable(),
        unlockCondition: z.enum(["clear enemies", "activate switches"]),
        visibleRemainingEnemies: z.number().int().nonnegative(),
        visibleUnactivatedSwitches: z.number().int().nonnegative(),
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
  return serializeStable(obs);
}

export function serializeDecisionState(obs: GameObservationV1): string {
  const { schemaVersion, episodeId, tick, timestampMs, enemies, pickups, ...state } = obs;
  void schemaVersion;
  void episodeId;
  void tick;
  void timestampMs;

  return serializeStable({
    ...state,
    enemies: enemies.map((enemy) => {
      const { distance, verticalAlignment, withinWeaponRange, ...compactEnemy } = enemy;
      void distance;
      void verticalAlignment;
      void withinWeaponRange;
      return compactEnemy;
    }),
    pickups: pickups.map((pickup) => {
      const { distance, ...compactPickup } = pickup;
      void distance;
      return compactPickup;
    }),
  });
}

function serializeStable(value: unknown): string {
  return JSON.stringify(value, (_key, nestedValue: unknown) => {
    if (typeof nestedValue === "number" && !Number.isInteger(nestedValue)) {
      return Math.round(nestedValue * 100) / 100;
    }
    if (nestedValue && typeof nestedValue === "object" && !Array.isArray(nestedValue)) {
      const record = nestedValue as Record<string, unknown>;
      return Object.keys(record)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = record[k];
          return acc;
        }, {});
    }
    return nestedValue;
  });
}
