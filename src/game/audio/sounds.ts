import type { WeaponId } from "../contracts/observation";
import type { SimEvent } from "../sim/types";

export interface Tone {
  wave: OscillatorType | "noise";
  frequency: number;
  endFrequency?: number;
  duration: number;
  gain: number;
  delay?: number;
}

export const SOUNDS = {
  blaster: [{ wave: "square", frequency: 960, endFrequency: 160, duration: 0.11, gain: 0.11 }],
  shotgun: [
    { wave: "noise", frequency: 1800, endFrequency: 250, duration: 0.18, gain: 0.2 },
    { wave: "triangle", frequency: 160, endFrequency: 50, duration: 0.15, gain: 0.17 },
  ],
  launcher: [
    { wave: "sawtooth", frequency: 180, endFrequency: 42, duration: 0.3, gain: 0.16 },
    { wave: "noise", frequency: 600, duration: 0.22, gain: 0.16 },
  ],
  hit: [{ wave: "noise", frequency: 2600, duration: 0.055, gain: 0.12 }],
  enemyDeath: [{ wave: "square", frequency: 290, endFrequency: 45, duration: 0.28, gain: 0.12 }],
  coin: [
    { wave: "square", frequency: 1046, duration: 0.07, gain: 0.07 },
    { wave: "square", frequency: 1568, duration: 0.12, gain: 0.07, delay: 0.06 },
  ],
  pickup: [
    { wave: "triangle", frequency: 523, duration: 0.1, gain: 0.17 },
    { wave: "triangle", frequency: 784, duration: 0.14, gain: 0.17, delay: 0.07 },
  ],
  jump: [{ wave: "square", frequency: 180, endFrequency: 580, duration: 0.12, gain: 0.07 }],
  land: [{ wave: "noise", frequency: 300, duration: 0.065, gain: 0.14 }],
  dash: [{ wave: "noise", frequency: 500, endFrequency: 5000, duration: 0.15, gain: 0.11 }],
  hurt: [{ wave: "sawtooth", frequency: 130, endFrequency: 60, duration: 0.2, gain: 0.14 }],
  downed: [{ wave: "triangle", frequency: 440, endFrequency: 110, duration: 0.5, gain: 0.18 }],
  revive: [
    { wave: "triangle", frequency: 392, duration: 0.13, gain: 0.18 },
    { wave: "triangle", frequency: 523, duration: 0.15, gain: 0.18, delay: 0.12 },
    { wave: "triangle", frequency: 784, duration: 0.3, gain: 0.18, delay: 0.24 },
  ],
  switch: [
    { wave: "square", frequency: 700, duration: 0.06, gain: 0.07 },
    { wave: "square", frequency: 1000, duration: 0.06, gain: 0.07, delay: 0.07 },
  ],
  door: [{ wave: "noise", frequency: 280, endFrequency: 800, duration: 0.4, gain: 0.12 }],
  pulse: [{ wave: "sine", frequency: 220, endFrequency: 1320, duration: 0.36, gain: 0.17 }],
  bubble: [{ wave: "triangle", frequency: 380, endFrequency: 450, duration: 0.045, gain: 0.06 }],
  telegraph: [
    { wave: "square", frequency: 660, duration: 0.08, gain: 0.09 },
    { wave: "square", frequency: 880, duration: 0.08, gain: 0.09, delay: 0.13 },
  ],
  enemyAttack: [{ wave: "sawtooth", frequency: 430, endFrequency: 140, duration: 0.15, gain: 0.1 }],
  boss: [
    { wave: "sawtooth", frequency: 65, endFrequency: 130, duration: 0.6, gain: 0.12 },
    { wave: "square", frequency: 196, duration: 0.5, gain: 0.07, delay: 0.2 },
  ],
  victory: [
    { wave: "triangle", frequency: 523, duration: 0.14, gain: 0.15 },
    { wave: "triangle", frequency: 659, duration: 0.14, gain: 0.15, delay: 0.14 },
    { wave: "triangle", frequency: 784, duration: 0.35, gain: 0.15, delay: 0.28 },
  ],
  defeat: [
    { wave: "triangle", frequency: 330, duration: 0.22, gain: 0.17 },
    { wave: "triangle", frequency: 294, duration: 0.22, gain: 0.17, delay: 0.22 },
    { wave: "triangle", frequency: 220, duration: 0.55, gain: 0.17, delay: 0.44 },
  ],
  dry: [{ wave: "square", frequency: 85, duration: 0.035, gain: 0.06 }],
  room: [{ wave: "sine", frequency: 523, duration: 0.18, gain: 0.06 }],
} satisfies Record<string, readonly Tone[]>;

export type SoundId = keyof typeof SOUNDS;

const EVENT_SOUNDS = {
  shot: "blaster",
  shot_blocked: null,
  projectile_hit: "hit",
  projectile_expired: null,
  explosion: "launcher",
  enemy_hurt: "hit",
  enemy_killed: "enemyDeath",
  player_hurt: "hurt",
  player_downed: "downed",
  player_died: "defeat",
  player_revived: "revive",
  revive_progress: null,
  jump: "jump",
  land: "land",
  dash: "dash",
  pickup: "pickup",
  interact: "switch",
  fact_check_pulse: "pulse",
  enemy_bubble: "bubble",
  enemy_telegraph: "telegraph",
  enemy_attack: "enemyAttack",
  gate_opened: "door",
  room_entered: "room",
  boss_phase: "boss",
  level_won: "victory",
  level_lost: "defeat",
} satisfies Record<SimEvent["type"], SoundId | null>;

const WEAPON_SOUNDS: Record<WeaponId, SoundId> = {
  blaster: "blaster",
  shotgun: "shotgun",
  launcher: "launcher",
};

export function soundForEvent(event: SimEvent): SoundId | null {
  if (event.type === "shot") return WEAPON_SOUNDS[event.weapon];
  if (event.type === "shot_blocked") return event.reason === "no_ammo" ? "dry" : null;
  if (event.type === "pickup") return event.pickupType === "coin" ? "coin" : "pickup";
  if (event.type === "interact") {
    if (event.interactableType === "door" || event.interactableType === "exit") return "door";
    if (event.interactableType === "revive_teammate") return null;
  }
  return EVENT_SOUNDS[event.type];
}
