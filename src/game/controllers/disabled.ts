import { neutralInput, type PlayerInputV1 } from "../contracts/input";
import type { ControllerContext, PlayerController } from "./types";

export class DisabledController implements PlayerController {
  readonly kind = "DISABLED" as const;
  update(ctx: ControllerContext): PlayerInputV1 {
    return neutralInput(ctx.episodeId, ctx.tick);
  }
  dispose(): void {}
}
