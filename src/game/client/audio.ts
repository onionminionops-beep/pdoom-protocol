import type { AudioEngine } from "@/game/audio/types";

export function createClientAudio(): AudioEngine {
  return {
    unlock: async () => {},
    setMasterVolume: () => {},
    setMusicVolume: () => {},
    setSfxVolume: () => {},
    setMuted: () => {},
    handleEvents: () => {},
    startMusic: () => {},
    stopMusic: () => {},
    dispose: () => {},
  };
}
