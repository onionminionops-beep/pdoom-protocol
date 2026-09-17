export type MusicTrack = "title" | "level" | "boss" | "victory" | "defeat";

interface Track {
  bpm: number;
  root: number;
  lead: readonly number[];
  bass: readonly number[];
  wave: OscillatorType;
}

export const TRACKS: Record<MusicTrack, Track> = {
  title: {
    bpm: 104,
    root: 60,
    lead: [0, -1, 7, 12, 10, -1, 7, 3, 5, -1, 3, 7, 2, -1, 7, 10],
    bass: [0, 0, 8, 7],
    wave: "triangle",
  },
  level: {
    bpm: 136,
    root: 60,
    lead: [0, 7, 12, -1, 10, 7, 3, 7, 5, 12, 15, 12, 7, 3, 2, 7],
    bass: [0, 8, 5, 7],
    wave: "square",
  },
  boss: {
    bpm: 156,
    root: 57,
    lead: [0, 1, 7, 0, 12, 7, 1, 7, 0, 6, 12, 6, 13, 7, 1, 0],
    bass: [0, 1, 6, 7],
    wave: "sawtooth",
  },
  victory: {
    bpm: 124,
    root: 60,
    lead: [0, 4, 7, 12, -1, 7, 12, 16, 14, 12, 7, 4, 12, -1, -1, -1],
    bass: [0, 5, 7, 0],
    wave: "triangle",
  },
  defeat: {
    bpm: 72,
    root: 57,
    lead: [12, -1, 10, -1, 7, -1, 3, -1, 5, -1, 2, -1, 0, -1, -1, -1],
    bass: [0, 8, 5, 0],
    wave: "triangle",
  },
};

export function midiFrequency(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}
