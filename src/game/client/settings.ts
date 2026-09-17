import { DEFAULT_BINDINGS, type KeyBindings } from "@/game/controllers/human";

export interface ClientSettings {
  master: number;
  music: number;
  sfx: number;
  screenShake: boolean;
  reducedFlashing: boolean;
  colorblind: boolean;
  bindings: KeyBindings;
}

export const ACTIONS = ["left", "right", "jump", "drop", "shoot", "dash", "interact"] as const;
export type InputAction = (typeof ACTIONS)[number];

export function defaultSettings(reducedMotion = false): ClientSettings {
  return {
    master: 0.7,
    music: 0.35,
    sfx: 0.7,
    screenShake: !reducedMotion,
    reducedFlashing: reducedMotion,
    colorblind: false,
    bindings: structuredClone(DEFAULT_BINDINGS),
  };
}

export function keyLabel(code: string): string {
  return code.replace(/^Key/, "").replace(/^Digit/, "").replace("Arrow", "").replace("Left", " L").replace("Right", " R");
}

export function remapKey(bindings: KeyBindings, action: InputAction, code: string): KeyBindings | null {
  if (["Escape", "Tab", "Enter", "MetaLeft", "MetaRight"].includes(code)) return null;
  if (ACTIONS.some((other) => other !== action && bindings[other].includes(code))) return null;
  return { ...bindings, [action]: [code] };
}
