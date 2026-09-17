import type { PlayerInputV1 } from "../contracts/input";
import type { PlayerId, WorldState } from "../sim/types";

export interface ControllerContext {
  /** Read-only snapshot of the authoritative simulation. Controllers must not mutate it. */
  world: Readonly<WorldState>;
  playerId: PlayerId;
  tick: number;
  episodeId: string;
  nowMs: number;
}

export interface PlayerController {
  readonly kind: "HUMAN" | "JEV" | "MOCK_AI" | "DISABLED";
  update(context: ControllerContext): PlayerInputV1;
  dispose(): void;
}
