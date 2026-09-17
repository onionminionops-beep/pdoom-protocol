import type { SlotKind } from "../sim/types";
import { DisabledController } from "./disabled";
import { HumanController } from "./human";
import { JevController, type JevControllerOptions } from "./jev";
import { MockAIController } from "./mock";
import type { PlayerController } from "./types";

export function createController(
  kind: SlotKind,
  jevOptions?: JevControllerOptions,
): PlayerController {
  switch (kind) {
    case "HUMAN":
      return new HumanController();
    case "JEV":
      return new JevController(jevOptions);
    case "MOCK_AI":
      return new MockAIController();
    case "DISABLED":
      return new DisabledController();
  }
}
