import type { SimEvent } from "../sim/types";

/**
 * Contract between the audio module (src/game/audio/engine.ts) and the client.
 * Implementation is WebAudio-synthesised (no external assets) so it ships
 * with zero binary files; the client calls `handleEvents` once per tick.
 */
export interface AudioEngine {
  /** Must be called from a user gesture before any sound plays. */
  unlock(): Promise<void>;
  setMasterVolume(v: number): void;
  setMusicVolume(v: number): void;
  setSfxVolume(v: number): void;
  setMuted(muted: boolean): void;
  /** Deterministic mapping of simulation events to sounds. */
  handleEvents(events: readonly SimEvent[], listenerX: number): void;
  startMusic(track: "title" | "level" | "boss" | "victory" | "defeat"): void;
  stopMusic(): void;
  dispose(): void;
}
