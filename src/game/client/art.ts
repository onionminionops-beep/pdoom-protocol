import { z } from "zod";
import type { ArtManifest, SpriteSheetDef } from "@/game/art/manifest";
import { ArtManifestSchema } from "@/game/art/schema";
import { EnemyTypeSchema } from "@/game/contracts/observation";

const assetPath = z
  .string()
  .regex(/^[a-zA-Z0-9_./-]+$/)
  .refine((path) => !path.includes("..") && !path.startsWith("/"));
const positive = z.number().int().positive().max(8192);
const sheet = z.object({
  key: z.string(),
  file: assetPath,
  frameWidth: positive,
  frameHeight: positive,
  anims: z.array(
    z.object({
      name: z.string(),
      row: z.number().int().nonnegative(),
      frames: positive,
      fps: z.number().positive().max(120),
      loop: z.boolean(),
    }),
  ),
  originOffset: z.object({ x: z.number(), y: z.number() }),
});

export const renderManifestSchema = z.object({
  version: z.literal(1),
  generatedBy: ArtManifestSchema.shape.generatedBy.optional(),
  characters: z.object({ user: sheet.optional(), jev: sheet.optional() }).optional(),
  enemies: z.partialRecord(EnemyTypeSchema, sheet).optional(),
  props: z
    .partialRecord(
      z.enum([
        "coin",
        "health",
        "ammo",
        "fact_check",
        "weapon_crate",
        "switch",
        "exit",
        "projectiles",
        "fx",
      ]),
      sheet,
    )
    .optional(),
  tileset: z
    .object({
      key: z.literal("tiles"),
      file: assetPath,
      tileSize: z.literal(32),
      columns: positive,
      tiles: z.record(z.string(), z.array(z.number().int().nonnegative())),
    })
    .optional(),
  backdrops: z
    .partialRecord(
      z.enum(["bg_far", "bg_mid", "bg_near"]),
      z.object({
        file: assetPath,
        width: positive,
        height: positive,
        parallax: z.number().min(0).max(1),
      }),
    )
    .optional(),
  billboards: z
    .object({
      file: assetPath,
      frameWidth: positive,
      frameHeight: positive,
      count: positive,
    })
    .optional(),
  ui: z
    .object({
      font: z.string(),
      portraitUser: assetPath,
      portraitJev: assetPath,
      logo: assetPath,
    })
    .optional(),
});

export interface RenderManifest {
  version?: ArtManifest["version"];
  generatedBy?: ArtManifest["generatedBy"];
  characters?: Partial<ArtManifest["characters"]>;
  enemies?: Partial<ArtManifest["enemies"]>;
  props?: Partial<ArtManifest["props"]>;
  tileset?: z.infer<typeof renderManifestSchema>["tileset"];
  backdrops?: Partial<ArtManifest["backdrops"]>;
  billboards?: ArtManifest["billboards"];
  ui?: ArtManifest["ui"];
}

export function parseRenderManifest(data: unknown): RenderManifest {
  const result = renderManifestSchema.safeParse(data);
  if (!result.success) return {};
  if (result.data.generatedBy) {
    const complete = ArtManifestSchema.safeParse(data);
    return complete.success ? complete.data : {};
  }
  return result.data;
}

export function sheetEntries(manifest: RenderManifest): Array<[string, SpriteSheetDef]> {
  return [
    ...Object.entries(manifest.characters ?? {}),
    ...Object.entries(manifest.enemies ?? {}),
    ...Object.entries(manifest.props ?? {}),
  ];
}

export function animationFrame(
  sheet: SpriteSheetDef,
  name: string,
  elapsedMs: number,
  columns: number,
): number {
  const anim = sheet.anims.find((candidate) => candidate.name === name) ?? sheet.anims[0];
  if (!anim) return 0;
  const elapsedFrames = Math.floor((Math.max(0, elapsedMs) * anim.fps) / 1000);
  const frame = anim.loop ? elapsedFrames % anim.frames : Math.min(anim.frames - 1, elapsedFrames);
  return anim.row * columns + frame;
}

export function spritePlacement(
  sheet: SpriteSheetDef,
  x: number,
  y: number,
  flip: boolean,
  bodyHeight?: number,
) {
  return {
    x: Math.round(x - sheet.originOffset.x * (flip ? -1 : 1)),
    y: Math.round(y + (bodyHeight === undefined ? 0 : bodyHeight / 2) - sheet.originOffset.y),
    originY: bodyHeight === undefined ? 0.5 : 1,
  };
}

export function pixelDisplayScale(
  width: number,
  height: number,
  availableWidth: number,
  availableHeight: number,
): number {
  const fit = Math.min(availableWidth / width, availableHeight / height);
  if (!Number.isFinite(fit) || fit <= 0) return 1;
  return fit >= 1 ? Math.floor(fit) : 1 / Math.ceil(1 / fit);
}
