import { z } from "zod";

/**
 * A directive is a selectable priority profile for JEV. It changes ONLY the
 * observation's `directive`/`objective.description` text and the server-side
 * question instructions. It never touches physics, hitboxes, cooldowns, or
 * adds any code-side behaviour for JEV.
 */
export const DirectiveIdSchema = z.enum([
  "SPEEDRUNNER",
  "COLLECTOR",
  "SCORE_HUNTER",
  "GUARDIAN",
]);
export type DirectiveId = z.infer<typeof DirectiveIdSchema>;

export type QuestionId =
  | "horizontal_input"
  | "vertical_action"
  | "shoot_input"
  | "dash_input"
  | "interaction_input"
  | "input_duration";

export interface DirectiveProfile {
  id: DirectiveId;
  label: string;
  hudLabel: string;
  /** Shown to the human player on the title/pause screens. */
  blurb: string;
  /** Sent to Jev inside the observation as `directive.description`. */
  description: string;
  /** Replaces the base `instructions` for the listed questions. */
  instructionOverrides: Partial<Record<QuestionId, string>>;
}

export const DIRECTIVES: Record<DirectiveId, DirectiveProfile> = {
  SPEEDRUNNER: {
    id: "SPEEDRUNNER",
    label: "Speedrunner",
    hudLabel: "SPEED",
    blurb: "JEV bolts for the exit. Coins are a distraction. Fights are optional.",
    description:
      "Priority: reach the level exit as fast as possible. Progress toward the objective, skip optional fights and pickups, shoot only when an enemy blocks the path.",
    instructionOverrides: {
      horizontal_input:
        "Choose the horizontal button JEV should hold during the next interval. JEV's top priority is reaching the exit quickly: keep moving toward the objective, avoid detours for coins or pickups, and only stop for immediate danger or platform edges.",
      shoot_input:
        "Choose whether JEV should shoot. JEV is speedrunning: shoot only when an enemy blocks the path ahead and JEV is facing it with a clear horizontal line of fire. The game will not correct JEV's aim.",
    },
  },
  COLLECTOR: {
    id: "COLLECTOR",
    label: "Collector",
    hudLabel: "COINS",
    blurb: "JEV detours for every shiny thing on the map.",
    description:
      "Priority: collect coins and pickups whenever the path to them appears safe, then progress toward the objective.",
    instructionOverrides: {
      horizontal_input:
        "Choose the horizontal button JEV should hold during the next interval. JEV's top priority is collecting coins and pickups: move toward the nearest pickup whose path appears safe, then continue toward the objective. Avoid immediate danger and platform edges.",
      vertical_action:
        "Choose JEV's vertical input for the next interval. Jump or drop when that brings JEV closer to a coin or pickup, or to avoid danger.",
    },
  },
  SCORE_HUNTER: {
    id: "SCORE_HUNTER",
    label: "Score Hunter",
    hudLabel: "SCORE",
    blurb: "JEV plays for kills and clean health. Slower, deadlier.",
    description:
      "Priority: maximize score by defeating enemies and avoiding damage. Hold useful firing positions and finish enemies before progressing.",
    instructionOverrides: {
      horizontal_input:
        "Choose the horizontal button JEV should hold during the next interval. JEV's top priority is score: get to a position where an enemy is horizontally aligned and in range, face it, and avoid taking damage. Progress only once nearby enemies are defeated.",
      shoot_input:
        "Choose whether JEV should shoot. JEV is hunting for score: shoot whenever JEV faces an enemy with a clear horizontal line of fire within range. The game will not correct JEV's aim.",
    },
  },
  GUARDIAN: {
    id: "GUARDIAN",
    label: "Guardian",
    hudLabel: "GUARD",
    blurb: "JEV shadows you, revives fast, and takes the hits.",
    description:
      "Priority: protect the teammate. Stay close to them, revive them immediately when downed, and shoot enemies threatening them.",
    instructionOverrides: {
      horizontal_input:
        "Choose the horizontal button JEV should hold during the next interval. JEV's top priority is the teammate: stay within a short distance of them, move toward them if they are downed or in danger, and avoid platform edges.",
      interaction_input:
        "Choose whether JEV should interact. JEV is guarding: revive the teammate the moment the revive interactable is in range, and otherwise interact with in-range objectives.",
    },
  },
};

export const DEFAULT_DIRECTIVE: DirectiveId = "SCORE_HUNTER";
