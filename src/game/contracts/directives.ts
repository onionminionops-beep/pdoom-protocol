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
  "MONSTER_SLAYER",
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
    label: "Token Collector",
    hudLabel: "COINS",
    blurb: "JEV seeks in-world coins and pickups along safe paths.",
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
    label: "Score Maximizing (Auto)",
    hudLabel: "SCORE",
    blurb: "JEV balances kills, coins, revives, speed, and health for the best total score.",
    description:
      "Priority: maximize total score. Automatically balance enemy kills, coins, teammate revives, the completion time bonus, and damage penalties using the current observation. Choose the best scoring opportunity while keeping a safe route to the exit.",
    instructionOverrides: {
      horizontal_input:
        "Choose the horizontal input JEV should hold during the next interval. Maximize total score: compare nearby kills, safe coins and pickups, teammate revives, and progress toward the exit for the time bonus. Adapt to the current observation, avoid damage penalties, and do not insist on fighting every enemy.",
      shoot_input:
        "Choose whether JEV should shoot to improve total score. Take clear horizontal shots at enemies JEV faces within range while balancing ammo, danger, and other scoring opportunities. The game will not correct JEV's aim.",
      interaction_input:
        "Choose whether JEV should interact to improve total score: revive a teammate in range when safe, open useful weapon crates, and activate in-range objectives to progress toward the completion time bonus.",
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
  MONSTER_SLAYER: {
    id: "MONSTER_SLAYER",
    label: "Monster Slayer",
    hudLabel: "SLAYER",
    blurb: "JEV prioritizes clearing enemies and the boss before moving on.",
    description:
      "Priority: defeat nearby enemies and the boss. Seek safe firing positions, face targets explicitly, and finish fights before progressing. Collect supplies when needed to keep fighting; coins and completion speed are secondary.",
    instructionOverrides: {
      horizontal_input:
        "Choose the horizontal input JEV should hold during the next interval. Prioritize defeating enemies: approach a safe firing position, align horizontally and face a target in range, and finish nearby fights before progressing. Dodge immediate danger; only detour for supplies needed to fight.",
      shoot_input:
        "Choose whether JEV should shoot. Prioritize clearing enemies and the boss: fire when JEV faces an enemy with a clear horizontal line of fire within weapon range. Preserve limited ammo when no shot is useful. The game will not correct JEV's aim.",
    },
  },
};

export const DEFAULT_DIRECTIVE: DirectiveId = "SCORE_HUNTER";
