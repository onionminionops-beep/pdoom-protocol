import type { EnemyType } from "../contracts/observation";
import type { PlayerAnim } from "../sim/types";

/**
 * Contract between the art pipeline (scripts/gen-art -> public/art/**) and the
 * Phaser renderer. The renderer loads `public/art/manifest.json` (this shape)
 * and falls back to programmatic placeholder rectangles for any missing key.
 *
 * All sheets are PNG, nearest-neighbour, transparent background, frames laid
 * out left-to-right, one row per animation in `anims` order.
 */

export interface AnimDef {
  name: string;
  /** Row index in the sheet. */
  row: number;
  frames: number;
  /** Frames per second. */
  fps: number;
  loop: boolean;
}

export interface SpriteSheetDef {
  key: string;
  file: string; // relative to /art/
  frameWidth: number;
  frameHeight: number;
  anims: AnimDef[];
  /** Pixel offset from frame centre to the character's collision-box centre. */
  originOffset: { x: number; y: number };
}

export type CharacterSheetKey = "user" | "jev";
export type EnemySheetKey = EnemyType;
export type PropSheetKey =
  | "coin"
  | "health"
  | "ammo"
  | "fact_check"
  | "weapon_crate"
  | "switch"
  | "exit"
  | "projectiles"
  | "fx";
export type TilesetKey = "tiles";
export type BackdropKey = "bg_far" | "bg_mid" | "bg_near";

export interface ArtManifest {
  version: 1;
  generatedBy: "gpt-image-2" | "gpt-image-1" | "programmatic" | "mixed";
  characters: Record<CharacterSheetKey, SpriteSheetDef>;
  enemies: Record<EnemySheetKey, SpriteSheetDef>;
  props: Record<PropSheetKey, SpriteSheetDef>;
  tileset: {
    key: TilesetKey;
    file: string;
    tileSize: 32;
    columns: number;
    tiles: Record<
      | "solid"
      | "oneway"
      | "hazard"
      | "gate"
      | "solid_top"
      | "solid_left"
      | "solid_right"
      | "solid_inner",
      number[]
    >;
  };
  backdrops: Record<BackdropKey, { file: string; width: number; height: number; parallax: number }>;
  billboards: { file: string; frameWidth: number; frameHeight: number; count: number };
  ui: { font: string; portraitUser: string; portraitJev: string; logo: string };
}

export const PLAYER_ANIMS: PlayerAnim[] = [
  "idle",
  "idle_personality",
  "run",
  "skid",
  "jump",
  "fall",
  "land",
  "shoot",
  "dash",
  "hurt",
  "downed",
  "revive",
  "being_revived",
  "victory",
  "death",
];

export const ENEMY_ANIMS = [
  "idle",
  "move",
  "telegraph",
  "attack",
  "recover",
  "hurt",
  "dying",
  "special",
] as const;

export const PLAYER_FRAME = { w: 32, h: 48 } as const;
export const ART_MANIFEST_URL = "/art/manifest.json";
