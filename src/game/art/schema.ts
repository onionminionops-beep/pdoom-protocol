import { z } from "zod";
import { EnemyTypeSchema } from "../contracts/observation";
import { ENEMY_ANIMS, PLAYER_ANIMS, type ArtManifest } from "./manifest";

const positiveInt = z.number().int().positive();
const file = z.string().regex(/^[a-z0-9_-]+\.png$/);
const animation = z.object({
  name: z.string().min(1),
  row: z.number().int().nonnegative(),
  frames: positiveInt,
  fps: z.number().positive(),
  loop: z.boolean(),
});

export const SpriteSheetSchema = z
  .object({
    key: z.string().min(1),
    file,
    frameWidth: positiveInt,
    frameHeight: positiveInt,
    anims: z.array(animation).min(1),
    originOffset: z.object({ x: z.number(), y: z.number() }),
  })
  .superRefine((sheet, ctx) => {
    if (sheet.anims.some((anim, index) => anim.row !== index)) {
      ctx.addIssue({
        code: "custom",
        message: "Animation rows must be contiguous and ordered",
        path: ["anims"],
      });
    }
    if (new Set(sheet.anims.map((anim) => anim.name)).size !== sheet.anims.length) {
      ctx.addIssue({ code: "custom", message: "Animation names must be unique", path: ["anims"] });
    }
  });

const backdrop = z.object({
  file,
  width: positiveInt,
  height: positiveInt,
  parallax: z.number().min(0).max(1),
});

export const ArtManifestSchema = z
  .object({
    version: z.literal(1),
    generatedBy: z.enum(["gpt-image-2", "gpt-image-1", "programmatic", "mixed"]),
    characters: z.object({ user: SpriteSheetSchema, jev: SpriteSheetSchema }),
    enemies: z.record(EnemyTypeSchema, SpriteSheetSchema),
    props: z.record(
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
      SpriteSheetSchema,
    ),
    tileset: z.object({
      key: z.literal("tiles"),
      file,
      tileSize: z.literal(32),
      columns: positiveInt,
      tiles: z.record(
        z.enum([
          "solid",
          "oneway",
          "hazard",
          "gate",
          "solid_top",
          "solid_left",
          "solid_right",
          "solid_inner",
        ]),
        z.array(z.number().int().nonnegative()).min(1),
      ),
    }),
    backdrops: z.object({ bg_far: backdrop, bg_mid: backdrop, bg_near: backdrop }),
    billboards: z.object({
      file,
      frameWidth: positiveInt,
      frameHeight: positiveInt,
      count: positiveInt,
    }),
    ui: z.object({ font: z.string().min(1), portraitUser: file, portraitJev: file, logo: file }),
  })
  .superRefine((manifest, ctx) => {
    for (const [key, sheet] of Object.entries({
      ...manifest.characters,
      ...manifest.enemies,
      ...manifest.props,
    })) {
      if (sheet.key !== key) ctx.addIssue({ code: "custom", message: `Sheet key must be ${key}` });
      const expected =
        key in manifest.characters ? PLAYER_ANIMS : key in manifest.enemies ? ENEMY_ANIMS : null;
      if (expected && JSON.stringify(sheet.anims.map((a) => a.name)) !== JSON.stringify(expected)) {
        ctx.addIssue({ code: "custom", message: `${key}: incomplete or reordered animation rows` });
      }
    }
    for (const sheet of Object.values(manifest.characters)) {
      if (sheet.frameWidth !== 32 || sheet.frameHeight !== 48) {
        ctx.addIssue({ code: "custom", message: "Player frames must be 32x48" });
      }
    }
  }) satisfies z.ZodType<ArtManifest>;
