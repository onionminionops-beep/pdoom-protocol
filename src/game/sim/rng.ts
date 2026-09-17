/** Mulberry32 — tiny deterministic PRNG. State lives in WorldState.rngState. */
export function rngNext(state: number): { state: number; value: number } {
  let t = (state + 0x6d2b79f5) | 0;
  let r = t;
  r = Math.imul(r ^ (r >>> 15), r | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  const value = ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  t = t | 0;
  return { state: t, value };
}

export function rngRange(
  state: number,
  min: number,
  max: number,
): { state: number; value: number } {
  const r = rngNext(state);
  return { state: r.state, value: min + r.value * (max - min) };
}

export function rngInt(
  state: number,
  minInclusive: number,
  maxExclusive: number,
): { state: number; value: number } {
  const r = rngNext(state);
  return {
    state: r.state,
    value: minInclusive + Math.floor(r.value * (maxExclusive - minInclusive)),
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
