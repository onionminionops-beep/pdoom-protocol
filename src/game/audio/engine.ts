import type { SimEvent } from "../sim/types";
import type { AudioEngine } from "./types";
import { midiFrequency, TRACKS, type MusicTrack } from "./music";
import { SOUNDS, soundForEvent, type Tone } from "./sounds";

export interface AudioEngineOptions {
  createContext?: () => AudioContext;
}

interface Voice {
  source: AudioScheduledSourceNode;
  nodes: AudioNode[];
  bus: "sfx" | "music";
}

const clampVolume = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

export class WebAudioEngine implements AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private sfx: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private masterVolume = 0.7;
  private musicVolume = 0.4;
  private sfxVolume = 0.8;
  private muted = false;
  private unlocked = false;
  private disposed = false;
  private track: MusicTrack | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextBeat = 0;
  private beat = 0;
  private voices = new Set<Voice>();
  private lastDryClick = new Map<string, number>();

  constructor(private readonly options: AudioEngineOptions = {}) {}

  async unlock(): Promise<void> {
    if (this.disposed) return;
    if (!this.context) {
      if (!this.options.createContext && (typeof window === "undefined" || !window.AudioContext))
        return;
      const context = this.options.createContext
        ? this.options.createContext()
        : new window.AudioContext();
      this.context = context;
      this.master = context.createGain();
      this.music = context.createGain();
      this.sfx = context.createGain();
      this.music.connect(this.master);
      this.sfx.connect(this.master);
      this.master.connect(context.destination);
      this.noise = context.createBuffer(1, Math.ceil(context.sampleRate), context.sampleRate);
      const channel = this.noise.getChannelData(0);
      let state = 42017;
      for (let i = 0; i < channel.length; i++) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        channel[i] = state / 2147483648 - 1;
      }
      this.applyVolumes();
    }
    if (this.context.state === "suspended") await this.context.resume();
    if (this.disposed || this.context.state !== "running") return;
    this.unlocked = true;
    if (this.track && !this.timer) this.scheduleMusic();
  }

  setMasterVolume(v: number): void {
    this.masterVolume = clampVolume(v);
    this.applyVolumes();
  }
  setMusicVolume(v: number): void {
    this.musicVolume = clampVolume(v);
    this.applyVolumes();
  }
  setSfxVolume(v: number): void {
    this.sfxVolume = clampVolume(v);
    this.applyVolumes();
  }
  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    const time = this.context?.currentTime ?? 0;
    this.master?.gain.setTargetAtTime(this.muted ? 0 : this.masterVolume, time, 0.015);
    this.music?.gain.setTargetAtTime(this.musicVolume, time, 0.015);
    this.sfx?.gain.setTargetAtTime(this.sfxVolume, time, 0.015);
  }

  handleEvents(events: readonly SimEvent[], listenerX: number): void {
    if (!this.unlocked || this.disposed || this.context?.state !== "running") return;
    for (const event of events) {
      const sound = soundForEvent(event);
      if (sound) {
        const now = this.context.currentTime;
        const player = "playerId" in event ? event.playerId : "";
        if (sound !== "dry" || now - (this.lastDryClick.get(player) ?? -Infinity) >= 0.18) {
          const x = "pos" in event ? event.pos.x : listenerX;
          const pan =
            Number.isFinite(x) && Number.isFinite(listenerX)
              ? Math.max(-1, Math.min(1, (x - listenerX) / 480))
              : 0;
          for (const tone of SOUNDS[sound]) this.playTone(tone, "sfx", now, pan);
          if (sound === "dry") this.lastDryClick.set(player, now);
        }
      }
      if (event.type === "boss_phase") this.startMusic("boss");
      if (event.type === "level_won") this.startMusic("victory");
      if (event.type === "level_lost") this.startMusic("defeat");
    }
  }

  private playTone(tone: Tone, bus: Voice["bus"], time: number, pan = 0): void {
    const context = this.context,
      destination = bus === "sfx" ? this.sfx : this.music;
    if (!context || !destination || this.voices.size >= 64) return;
    const start = Math.max(context.currentTime, time + (tone.delay ?? 0));
    const end = start + tone.duration;
    const envelope = context.createGain();
    const panner = context.createStereoPanner();
    panner.pan.setValueAtTime(pan, start);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(tone.gain, start + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    envelope.gain.setValueAtTime(0, end + 0.005);
    envelope.connect(panner);
    panner.connect(destination);
    let source: AudioScheduledSourceNode;
    const nodes: AudioNode[] = [envelope, panner];
    if (tone.wave === "noise") {
      const noise = context.createBufferSource();
      noise.buffer = this.noise;
      noise.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(tone.frequency, start);
      filter.frequency.exponentialRampToValueAtTime(tone.endFrequency ?? tone.frequency, end);
      noise.connect(filter);
      filter.connect(envelope);
      nodes.push(filter);
      source = noise;
    } else {
      const oscillator = context.createOscillator();
      oscillator.type = tone.wave;
      oscillator.frequency.setValueAtTime(tone.frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(tone.endFrequency ?? tone.frequency, end);
      oscillator.connect(envelope);
      source = oscillator;
    }
    const voice: Voice = { source, nodes, bus };
    this.voices.add(voice);
    source.onended = () => this.release(voice);
    source.start(start);
    source.stop(end + 0.01);
  }

  private release(voice: Voice): void {
    if (!this.voices.delete(voice)) return;
    voice.source.onended = null;
    voice.source.disconnect();
    for (const node of voice.nodes) node.disconnect();
  }

  private cancelVoices(bus?: Voice["bus"]): void {
    for (const voice of this.voices)
      if (!bus || voice.bus === bus) {
        voice.source.stop();
        this.release(voice);
      }
  }

  startMusic(track: MusicTrack): void {
    if (this.disposed || (this.track === track && this.timer)) return;
    this.stopMusic();
    this.track = track;
    if (this.unlocked) this.scheduleMusic();
  }

  private scheduleMusic(): void {
    if (!this.context || !this.track) return;
    this.nextBeat = this.context.currentTime + 0.02;
    this.beat = 0;
    this.pumpMusic();
    this.timer = setInterval(() => this.pumpMusic(), 50);
  }

  private pumpMusic(): void {
    if (!this.context || !this.track || this.context.state !== "running") return;
    const now = this.context.currentTime;
    const track = TRACKS[this.track];
    const step = 60 / track.bpm / 4;
    if (this.nextBeat < now - step) this.nextBeat = now + 0.02;
    while (this.nextBeat < now + 0.16) {
      const lead = track.lead[this.beat % track.lead.length];
      if (lead >= 0)
        this.playTone(
          {
            wave: track.wave,
            frequency: midiFrequency(track.root + lead),
            duration: step * 0.85,
            gain: 0.055,
          },
          "music",
          this.nextBeat,
          -0.2,
        );
      if (this.beat % 4 === 0) {
        this.playTone(
          {
            wave: "triangle",
            frequency: midiFrequency(track.root - 24 + track.bass[Math.floor(this.beat / 16) % 4]),
            duration: step * 3,
            gain: 0.13,
          },
          "music",
          this.nextBeat,
          0.15,
        );
        this.playTone(
          { wave: "sine", frequency: 110, endFrequency: 40, duration: 0.09, gain: 0.14 },
          "music",
          this.nextBeat,
        );
      } else if (this.beat % 2 === 0) {
        this.playTone(
          { wave: "noise", frequency: 4500, duration: 0.025, gain: 0.025 },
          "music",
          this.nextBeat,
          0.3,
        );
      }
      this.beat++;
      this.nextBeat += step;
    }
  }

  stopMusic(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.track = null;
    this.cancelVoices("music");
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unlocked = false;
    this.stopMusic();
    this.cancelVoices();
    this.master?.disconnect();
    this.music?.disconnect();
    this.sfx?.disconnect();
    if (this.context && this.context.state !== "closed") void this.context.close().catch(() => {});
    this.master = this.music = this.sfx = null;
    this.noise = null;
    this.lastDryClick.clear();
  }
}

export function createAudioEngine(options: AudioEngineOptions = {}): AudioEngine {
  return new WebAudioEngine(options);
}
