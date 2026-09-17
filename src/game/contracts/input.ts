import { z } from "zod";

export const HorizontalSchema = z.enum(["left", "neutral", "right"]);
export const VerticalActionSchema = z.enum(["none", "jump", "drop"]);
export const HoldForMsSchema = z.union([
  z.literal(100),
  z.literal(150),
  z.literal(200),
  z.literal(250),
]);

/**
 * The single input contract consumed by the simulation. Every controller
 * (human, Jev, mock, disabled) produces exactly this; the simulation never
 * knows where it came from.
 */
export const PlayerInputV1Schema = z.object({
  schemaVersion: z.literal("1.0"),
  episodeId: z.string().min(1).max(64),
  basedOnTick: z.number().int().nonnegative(),
  horizontal: HorizontalSchema,
  verticalAction: VerticalActionSchema,
  shoot: z.boolean(),
  dash: z.boolean(),
  interact: z.boolean(),
  holdForMs: HoldForMsSchema,
});

export type PlayerInputV1 = z.infer<typeof PlayerInputV1Schema>;
export type Horizontal = z.infer<typeof HorizontalSchema>;
export type VerticalAction = z.infer<typeof VerticalActionSchema>;
export type HoldForMs = z.infer<typeof HoldForMsSchema>;

export function neutralInput(episodeId: string, basedOnTick: number): PlayerInputV1 {
  return {
    schemaVersion: "1.0",
    episodeId,
    basedOnTick,
    horizontal: "neutral",
    verticalAction: "none",
    shoot: false,
    dash: false,
    interact: false,
    holdForMs: 100,
  };
}
