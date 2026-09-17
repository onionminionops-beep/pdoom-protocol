import type { HoldForMs, PlayerInputV1 } from "../contracts/input";
import type { EnemyType, InteractableType, PickupType, WeaponId } from "../contracts/observation";
import type { DirectiveId } from "../contracts/directives";

export type Facing = "left" | "right";
export type CharacterId = "user" | "jev";
export type PlayerId = "p1" | "p2";
export type SlotKind = "HUMAN" | "JEV" | "MOCK_AI" | "DISABLED";

export interface Vec2 {
  x: number;
  y: number;
}

export interface AABB {
  x: number; // centre
  y: number; // centre
  w: number;
  h: number;
}

export type PlayerAnim =
  | "idle"
  | "idle_personality"
  | "run"
  | "skid"
  | "jump"
  | "fall"
  | "land"
  | "shoot"
  | "dash"
  | "hurt"
  | "downed"
  | "revive"
  | "being_revived"
  | "victory"
  | "death";

export interface PlayerState {
  id: PlayerId;
  character: CharacterId;
  pos: Vec2;
  vel: Vec2;
  facing: Facing;
  grounded: boolean;
  wasGrounded: boolean;
  onOneWayPlatform: boolean;
  health: number;
  alive: boolean;
  downed: boolean;
  /** ms remaining before a downed player bleeds out and dies. */
  downedTimerMs: number;
  weapon: WeaponId;
  ammo: Record<WeaponId, number | null>;
  fireCooldownMs: number;
  dashCooldownMs: number;
  dashTimeMs: number;
  dashDir: Facing;
  coyoteMs: number;
  jumpBufferMs: number;
  jumpHeldMs: number;
  jumpHeld: boolean;
  jumping: boolean;
  dropIgnoreMs: number;
  invulnMs: number;
  /** Progress towards a revive of the teammate (ms held). */
  reviveProgressMs: number;
  factCheckMs: number;
  factCheckCooldownMs: number;
  anim: PlayerAnim;
  animMs: number;
  lastInput: PlayerInputV1 | null;
  damageTaken: number;
}

export type EnemyPhase =
  "idle" | "move" | "telegraph" | "attack" | "recover" | "hurt" | "dying" | "special";

export interface EnemyState {
  id: string;
  type: EnemyType;
  pos: Vec2;
  vel: Vec2;
  facing: Facing;
  grounded: boolean;
  health: number;
  maxHealth: number;
  phase: EnemyPhase;
  phaseMs: number;
  /** Type-specific scratch (timers, indices). Deterministic, plain data only. */
  data: Record<string, number>;
  hurtMs: number;
  roomId: string;
  bubble: string | null;
  bubbleMs: number;
  contactDamage: number;
  w: number;
  h: number;
  flying: boolean;
  bossPhase?: number;
}

export interface ProjectileState {
  id: string;
  ownerId: PlayerId | string;
  ownerKind: "player" | "enemy";
  weapon: WeaponId | "enemy_graph" | "enemy_bubble" | "enemy_shockwave" | "enemy_boss";
  pos: Vec2;
  vel: Vec2;
  radius: number;
  damage: number;
  travelled: number;
  maxTravel: number;
  blastRadius: number;
  selfDamageFraction: number;
  ageMs: number;
  /** Kind-specific visual variant. */
  variant: number;
}

export interface PickupState {
  id: string;
  type: PickupType;
  pos: Vec2;
  value: number;
  collected: boolean;
  roomId: string;
}

export interface InteractableState {
  id: string;
  type: InteractableType;
  pos: Vec2;
  w: number;
  h: number;
  roomId: string;
  activated: boolean;
  /** Which player may activate it; null for anyone. */
  requiredPlayer: PlayerId | null;
  label: string;
}

export interface RoomDef {
  id: string;
  /** Tile-space bounds [x0, y0, x1, y1) */
  bounds: [number, number, number, number];
  objectiveType:
    "traverse" | "survive" | "defeat_enemies" | "revive_teammate" | "interact" | "reach_exit";
  objectiveText: string;
  /** Gate closes until enemies in this room are cleared. */
  gateOnEnemies: boolean;
  gateTileX: number | null;
  billboards: string[];
}

export interface EnemySpawnDef {
  id: string;
  type: EnemyType;
  tileX: number;
  tileY: number;
  roomId: string;
  facing?: Facing;
}

export interface LevelData {
  id: string;
  name: string;
  widthTiles: number;
  heightTiles: number;
  /** Row-major strings: '#' solid, '-' one-way platform, '.' empty, 'H' hazard. */
  rows: string[];
  spawns: { p1: [number, number]; p2: [number, number] };
  rooms: RoomDef[];
  enemies: EnemySpawnDef[];
  pickups: Array<{
    id: string;
    type: PickupType;
    tileX: number;
    tileY: number;
    value?: number;
    roomId: string;
  }>;
  interactables: Array<
    Omit<InteractableState, "pos" | "activated" | "w" | "h"> & {
      tileX: number;
      tileY: number;
      wTiles?: number;
      hTiles?: number;
    }
  >;
  exitTileX: number;
}

export interface ScoreBreakdown {
  kills: number;
  coins: number;
  timeBonus: number;
  damageTakenPenalty: number;
  reviveBonus: number;
}

export type SimEvent =
  | { type: "shot"; playerId: PlayerId; weapon: WeaponId; facing: Facing; pos: Vec2 }
  | {
      type: "shot_blocked";
      playerId: PlayerId;
      reason: "cooldown" | "no_ammo" | "downed" | "dashing";
    }
  | { type: "projectile_hit"; projectileId: string; targetId: string; pos: Vec2; damage: number }
  | { type: "projectile_expired"; projectileId: string; pos: Vec2 }
  | { type: "explosion"; pos: Vec2; radius: number }
  | { type: "enemy_hurt"; enemyId: string; damage: number }
  | { type: "enemy_killed"; enemyId: string; enemyType: EnemyType; pos: Vec2; score: number }
  | { type: "player_hurt"; playerId: PlayerId; damage: number; from: string }
  | { type: "player_downed"; playerId: PlayerId }
  | { type: "player_died"; playerId: PlayerId }
  | { type: "player_revived"; playerId: PlayerId; by: PlayerId }
  | { type: "revive_progress"; playerId: PlayerId; target: PlayerId; fraction: number }
  | { type: "jump"; playerId: PlayerId }
  | { type: "land"; playerId: PlayerId; impactVy: number }
  | { type: "dash"; playerId: PlayerId; facing: Facing }
  | { type: "pickup"; playerId: PlayerId; pickupId: string; pickupType: PickupType; value: number }
  | {
      type: "interact";
      playerId: PlayerId;
      interactableId: string;
      interactableType: InteractableType;
    }
  | { type: "fact_check_pulse"; playerId: PlayerId; pos: Vec2 }
  | { type: "enemy_bubble"; enemyId: string; text: string }
  | { type: "enemy_telegraph"; enemyId: string }
  | { type: "enemy_attack"; enemyId: string; pos: Vec2 }
  | { type: "gate_opened"; roomId: string }
  | { type: "room_entered"; roomId: string }
  | { type: "boss_phase"; phase: number }
  | { type: "level_won" }
  | { type: "level_lost" };

export interface WorldState {
  episodeId: string;
  seed: number;
  tick: number;
  elapsedMs: number;
  status: "playing" | "won" | "lost";
  level: LevelData;
  players: Record<PlayerId, PlayerState>;
  slots: Record<PlayerId, SlotKind>;
  enemies: EnemyState[];
  projectiles: ProjectileState[];
  pickups: PickupState[];
  interactables: InteractableState[];
  /** Rooms whose gate has opened. */
  openedGates: Record<string, boolean>;
  currentRoomId: string;
  score: number;
  coins: number;
  breakdown: ScoreBreakdown;
  directive: DirectiveId;
  nextId: number;
  rngState: number;
  /** Camera-independent "restricted" zones from Hall Monitors: tile-space AABBs with ms remaining. */
  restrictedZones: Array<{
    x: number;
    y: number;
    w: number;
    h: number;
    msLeft: number;
    ownerId: string;
  }>;
  bossActive: boolean;
  bossPhase: number;
  winTimerMs: number;
}

export interface PlayerInputs {
  p1: PlayerInputV1;
  p2: PlayerInputV1;
}

export const HOLD_OPTIONS: readonly HoldForMs[] = [100, 150, 200, 250];
