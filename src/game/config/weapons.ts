import type { WeaponId } from "../contracts/observation";

export interface WeaponDef {
  id: WeaponId;
  label: string;
  damage: number;
  /** Projectiles per shot; pellets get a fixed, deterministic vertical spread. */
  pellets: number;
  /** Fixed spread in px/s of vertical velocity applied symmetrically across pellets. */
  spreadVy: number;
  projectileSpeed: number;
  /** Max travel distance before the projectile expires (also = weapon range). */
  rangePx: number;
  fireCooldownMs: number;
  /** null = unlimited */
  maxAmmo: number | null;
  ammoPerPickup: number;
  recoilVx: number;
  /** Area-damage radius, 0 for none. */
  blastRadius: number;
  selfDamageFraction: number;
  projectileRadius: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  blaster: {
    id: "blaster",
    label: "Signal Blaster",
    damage: 12,
    pellets: 1,
    spreadVy: 0,
    projectileSpeed: 620,
    rangePx: 420,
    fireCooldownMs: 220,
    maxAmmo: null,
    ammoPerPickup: 0,
    recoilVx: 30,
    blastRadius: 0,
    selfDamageFraction: 0,
    projectileRadius: 4,
  },
  shotgun: {
    id: "shotgun",
    label: "Context Shotgun",
    damage: 9,
    pellets: 5,
    spreadVy: 55,
    projectileSpeed: 700,
    rangePx: 190,
    fireCooldownMs: 720,
    maxAmmo: 24,
    ammoPerPickup: 8,
    recoilVx: 210,
    blastRadius: 0,
    selfDamageFraction: 0,
    projectileRadius: 3,
  },
  launcher: {
    id: "launcher",
    label: "Nuance Launcher",
    damage: 45,
    pellets: 1,
    spreadVy: 0,
    projectileSpeed: 300,
    rangePx: 520,
    fireCooldownMs: 1100,
    maxAmmo: 6,
    ammoPerPickup: 3,
    recoilVx: 120,
    blastRadius: 64,
    selfDamageFraction: 0.5,
    projectileRadius: 6,
  },
};

export const FACT_CHECK_PULSE = {
  radius: 110,
  knockbackSpeed: 380,
  cooldownMs: 9000,
  /** Power-up duration once picked up. */
  durationMs: 30000,
  damage: 5,
} as const;
