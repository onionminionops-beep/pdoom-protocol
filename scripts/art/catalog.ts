import { ENEMY_DEFS } from "../../src/game/config/enemies";
import { EnemyTypeSchema } from "../../src/game/contracts/observation";
import {
  ENEMY_ANIMS,
  PLAYER_ANIMS,
  type ArtManifest,
  type SpriteSheetDef,
  type PropSheetKey,
} from "../../src/game/art/manifest";

export const STYLE =
  "Original 16-bit pixel art for USER + JEV: P(DOOM) PROTOCOL. Dark neon city, cyan, magenta, acid green, amber, indigo. Strong readable silhouettes, hard pixel clusters, no gradients, no antialiasing. No real people, logos, political symbols. No text or lettering. One isolated subject, no shadow, no ground plane, no border.";
export const PIPELINE_SEED = 42017;
export const BILLBOARD_SLOGANS = ["P(DOOM)=99%", "PAUSE EVERYTHING", "NO DATACENTERS"];

const subjects: Record<string, string> = {
  user: "Full body human street runner facing RIGHT in profile, solid amber jacket, SHORT cyan scarf close to neck, slate blue trousers, large boots, swept dark hair, tiny compact blaster held against chest pointing right. Chibi arcade proportions: head one third of total height, broad torso and thick limbs. Standing still with feet planted close together. Narrow silhouette, no outstretched arm or long scarf. Extremely simple 32x48 sprite, at most 12 solid colors, large flat clusters, no tiny details or neon trim.",
  jev: "Full body friendly compact robot street runner facing RIGHT in profile. Large rectangular cyan visor, slate blue shell, SHORT magenta scarf close to neck, solid white chest plate, thick articulated legs, tiny compact blaster against chest pointing right. Chibi arcade proportions: head one third of total height, broad torso and thick limbs. Standing still with feet planted close together. Narrow silhouette, no outstretched arm or long scarf. Extremely simple 32x48 sprite, at most 12 solid colors, large flat clusters, no tiny details or neon trim.",
  doom_prophet:
    "Full body thin hooded fictional doomsday preacher facing RIGHT, ragged indigo robe, hunched shoulders, amber glowing eyes, holding a blank placard.",
  catastrophe_prophet:
    "Full body angular fictional alarmist facing RIGHT, wild white hair, magenta coat, holding a tiny screen with an abstract red descending graph.",
  datacenter_blockader:
    "Full body stout fictional barricade builder facing RIGHT, acid green vest, hard hat, boots, carrying a dark rectangular barrier plate.",
  purity_enforcer:
    "Full body heavy fictional authoritarian robot facing RIGHT, bulky ivory and violet armor, narrow magenta visor, rectangular forearm shield.",
  hall_monitor:
    "Side view hovering rectangular surveillance drone facing RIGHT, indigo body, cyan single eye, twin amber thrusters, short antenna.",
  reply_horde:
    "Tiny side view scuttling robot facing RIGHT, acid green angry screen-face, two little legs, magenta cable tail. Chunky readable silhouette.",
  consensus_engine:
    "Large final boss, symmetrical floating industrial computer idol. Stacked indigo server towers, huge central magenta mechanical eye, cyan conduits, acid green reactor core, armored clamps. No human face.",
  coin: "Single chunky amber coin token with simple square circuit inset, side view.",
  health: "Small cyan medical canister with acid green luminous capsule inset, no cross symbol.",
  ammo: "Small open indigo ammunition box containing three amber energy cells.",
  fact_check: "Small cyan crystalline diamond containing a white check-shaped geometric spark.",
  weapon_crate: "Closed armored violet supply crate, amber clasps, cyan inset barrel icon.",
  switch: "Small wall mounted indigo lever switch with amber handle and acid green status lamp.",
  exit: "Rectangular industrial doorway with cyan luminous frame, indigo void interior, amber corner plates.",
  projectiles:
    "One small horizontal cyan energy bolt pointing right, bright white center, short angular cyan trail.",
  fx: "One angular eight pointed amber and cyan impact spark, centered, no glow blur.",
  tiles:
    "One square seamless dark concrete wall tile, indigo brick seams, small bolts, restrained cyan edge highlights. Orthographic front view, fills entire canvas edge to edge.",
  bg_far:
    "Wide panoramic distant skyline of Consensus Heights, layered indigo skyscrapers and antenna spires, few dim cyan window clusters. Dark night sky, empty upper half, horizontal composition.",
  bg_mid:
    "Wide panoramic middle distance industrial city silhouette, rooftop ducts, magenta neon windows, cyan antennas. Empty transparent upper half, horizontal composition.",
  bg_near:
    "Wide panoramic foreground dark city infrastructure silhouette, thick pipes, rooftop railings, amber hazard lamps. Empty transparent upper half, horizontal composition.",
  billboards:
    "One wide rectangular fictional protest billboard, worn dark indigo metal panel, amber border, blank flat central panel for lettering added later.",
  portrait_user:
    "Bust portrait of original amber jacket street runner, cyan scarf, swept dark hair, determined expression, facing right. Pixel game dialogue portrait.",
  portrait_jev:
    "Bust portrait of friendly original indigo robot, rectangular cyan visor, magenta scarf, white armor. Pixel game dialogue portrait.",
  logo: "Wide abstract geometric emblem: two linked cyan and amber circuit brackets protecting a magenta diamond reactor. Pixel game title crest, no letters or text.",
};

function sheet(key: string, w: number, h: number, names: readonly string[]): SpriteSheetDef {
  return {
    key,
    file: `${key}.png`,
    frameWidth: w,
    frameHeight: h,
    originOffset: { x: 0, y: 0 },
    anims: names.map((name, row) => ({
      name,
      row,
      frames: 4,
      fps: name === "run" || name === "move" ? 12 : 8,
      loop: [
        "idle",
        "idle_personality",
        "run",
        "move",
        "downed",
        "being_revived",
        "special",
        "spin",
      ].includes(name),
    })),
  };
}

export function createManifest(): ArtManifest {
  const propSizes: Record<PropSheetKey, [number, number]> = {
    coin: [16, 16],
    health: [24, 24],
    ammo: [24, 24],
    fact_check: [24, 24],
    weapon_crate: [32, 32],
    switch: [24, 32],
    exit: [64, 96],
    projectiles: [24, 16],
    fx: [48, 48],
  };
  return {
    version: 1,
    generatedBy: "programmatic",
    characters: {
      user: sheet("user", 32, 48, PLAYER_ANIMS),
      jev: sheet("jev", 32, 48, PLAYER_ANIMS),
    },
    enemies: Object.fromEntries(
      EnemyTypeSchema.options.map((key) => {
        const enemy = ENEMY_DEFS[key];
        return [key, sheet(key, enemy.width, enemy.height, ENEMY_ANIMS)];
      }),
    ) as ArtManifest["enemies"],
    props: Object.fromEntries(
      Object.entries(propSizes).map(([key, [w, h]]) => [
        key,
        sheet(
          key,
          w,
          h,
          key === "projectiles"
            ? [
                "blaster",
                "shotgun",
                "launcher",
                "enemy_graph",
                "enemy_bubble",
                "enemy_shockwave",
                "enemy_boss",
              ]
            : key === "fx"
              ? ["impact", "explosion", "pulse", "dash"]
              : key === "switch"
                ? ["off", "on"]
                : ["spin"],
        ),
      ]),
    ) as ArtManifest["props"],
    tileset: {
      key: "tiles",
      file: "tiles.png",
      tileSize: 32,
      columns: 8,
      tiles: {
        solid: [0],
        oneway: [1],
        hazard: [2],
        gate: [3],
        solid_top: [4],
        solid_left: [5],
        solid_right: [6],
        solid_inner: [7],
      },
    },
    backdrops: {
      bg_far: { file: "bg_far.png", width: 640, height: 360, parallax: 0.12 },
      bg_mid: { file: "bg_mid.png", width: 640, height: 360, parallax: 0.35 },
      bg_near: { file: "bg_near.png", width: 640, height: 360, parallax: 0.65 },
    },
    billboards: { file: "billboards.png", frameWidth: 192, frameHeight: 80, count: 3 },
    ui: {
      font: "monospace",
      portraitUser: "portrait_user.png",
      portraitJev: "portrait_jev.png",
      logo: "logo.png",
    },
  };
}

export interface AssetSpec {
  key: string;
  width: number;
  height: number;
  kind: "sheet" | "tiles" | "backdrop" | "billboards" | "ui";
  transparent: boolean;
  prompt: string;
  sheet?: SpriteSheetDef;
}

export function assetCatalog(manifest = createManifest()): AssetSpec[] {
  const specs: Omit<AssetSpec, "prompt">[] = [
    ...Object.values({ ...manifest.characters, ...manifest.enemies, ...manifest.props }).map(
      (s) => ({
        key: s.key,
        width: s.frameWidth,
        height: s.frameHeight,
        kind: "sheet" as const,
        transparent: true,
        sheet: s,
      }),
    ),
    { key: "tiles", width: 32, height: 32, kind: "tiles", transparent: false },
    ...Object.entries(manifest.backdrops).map(([key, b]) => ({
      key,
      width: b.width,
      height: b.height,
      kind: "backdrop" as const,
      transparent: key !== "bg_far",
    })),
    { key: "billboards", width: 192, height: 80, kind: "billboards", transparent: true },
    { key: "portrait_user", width: 96, height: 96, kind: "ui", transparent: true },
    { key: "portrait_jev", width: 96, height: 96, kind: "ui", transparent: true },
    { key: "logo", width: 384, height: 128, kind: "ui", transparent: true },
  ];
  return specs.map((s) => ({
    ...s,
    prompt: `${STYLE} ${subjects[s.key]} ${s.transparent ? "Transparent background if supported; otherwise perfectly flat chroma blue #0000ff, never use this blue in the subject." : ""} Intended final resolution ${s.width}x${s.height}. ${s.kind === "sheet" ? "One single key pose only. Do not draw multiple frames or a sprite sheet. Entire subject inside canvas with a small margin." : ""}`,
  }));
}
