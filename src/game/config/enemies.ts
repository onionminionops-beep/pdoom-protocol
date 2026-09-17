import type { EnemyType } from "../contracts/observation";

export interface EnemyDef {
  type: EnemyType;
  label: string;
  maxHealth: number;
  width: number;
  height: number;
  speed: number;
  contactDamage: number;
  score: number;
  flying: boolean;
  /** Takes bonus damage while in its `special` phase (e.g. composing a post). */
  vulnerableWhileSpecial: boolean;
  deathMs: number;
  /** Ranged attack projectile parameters, if any. */
  ranged: { speed: number; damage: number; cooldownMs: number; telegraphMs: number; rangePx: number } | null;
  bubbles: string[];
  bubbleIntervalMs: number;
}

export const ENEMY_DEFS: Record<EnemyType, EnemyDef> = {
  doom_prophet: {
    type: "doom_prophet",
    label: "Doom Prophet",
    maxHealth: 40,
    width: 22,
    height: 40,
    speed: 55,
    contactDamage: 10,
    score: 100,
    flying: false,
    vulnerableWhileSpecial: true,
    deathMs: 600,
    ranged: null,
    bubbles: ["It's already over.", "Superintelligence by Tuesday.", "There is no point.", "I read the paper."],
    bubbleIntervalMs: 3200,
  },
  catastrophe_prophet: {
    type: "catastrophe_prophet",
    label: "Catastrophe Prophet",
    maxHealth: 50,
    width: 22,
    height: 42,
    speed: 30,
    contactDamage: 8,
    score: 150,
    flying: false,
    vulnerableWhileSpecial: false,
    deathMs: 600,
    ranged: { speed: 260, damage: 12, cooldownMs: 2200, telegraphMs: 650, rangePx: 380 },
    bubbles: ["This changes everything!", "Six months, maximum!", "The model is certain!", "We are so back—wait, no."],
    bubbleIntervalMs: 2600,
  },
  datacenter_blockader: {
    type: "datacenter_blockader",
    label: "Datacenter Blockader",
    maxHealth: 70,
    width: 26,
    height: 44,
    speed: 40,
    contactDamage: 10,
    score: 200,
    flying: false,
    vulnerableWhileSpecial: true,
    deathMs: 700,
    ranged: { speed: 200, damage: 10, cooldownMs: 2800, telegraphMs: 900, rangePx: 320 },
    bubbles: ["Educate yourself!", "Do the work!", "I have a 47-part thread.", "Cooling towers are complicity!"],
    bubbleIntervalMs: 2400,
  },
  purity_enforcer: {
    type: "purity_enforcer",
    label: "Purity Enforcer",
    maxHealth: 120,
    width: 34,
    height: 52,
    speed: 35,
    contactDamage: 14,
    score: 350,
    flying: false,
    vulnerableWhileSpecial: false,
    deathMs: 900,
    ranged: { speed: 340, damage: 16, cooldownMs: 3000, telegraphMs: 1000, rangePx: 260 },
    bubbles: ["Not good enough.", "Your wording has been noted.", "Apologize better.", "The committee has concerns."],
    bubbleIntervalMs: 3000,
  },
  hall_monitor: {
    type: "hall_monitor",
    label: "Algorithm Hall Monitor",
    maxHealth: 45,
    width: 28,
    height: 24,
    speed: 80,
    contactDamage: 8,
    score: 175,
    flying: true,
    vulnerableWhileSpecial: false,
    deathMs: 500,
    ranged: null,
    bubbles: ["Tone detected.", "Nuance reduced reach.", "Context exceeds limit.", "Engagement falling."],
    bubbleIntervalMs: 2200,
  },
  reply_horde: {
    type: "reply_horde",
    label: "Reply Horde",
    maxHealth: 12,
    width: 16,
    height: 16,
    speed: 150,
    contactDamage: 5,
    score: 40,
    flying: false,
    vulnerableWhileSpecial: false,
    deathMs: 300,
    ranged: null,
    bubbles: ["ratio", "source?", "this you?", "L + cope"],
    bubbleIntervalMs: 1800,
  },
  consensus_engine: {
    type: "consensus_engine",
    label: "The Consensus Engine",
    maxHealth: 900,
    width: 120,
    height: 140,
    speed: 0,
    contactDamage: 16,
    score: 2500,
    flying: true,
    vulnerableWhileSpecial: false,
    deathMs: 3000,
    ranged: { speed: 240, damage: 14, cooldownMs: 2100, telegraphMs: 900, rangePx: 600 },
    bubbles: ["ENGAGEMENT IS TRUTH.", "NUANCE NOT FOUND.", "EVERYONE AGREES.", "YOU ARE THE PROBLEM."],
    bubbleIntervalMs: 2000,
  },
};
