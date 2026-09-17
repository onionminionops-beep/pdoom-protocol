import { afterEach, describe, expect, it, vi } from "vitest";
import { createAudioEngine } from "@/game/audio/engine";
import { soundForEvent } from "@/game/audio/sounds";
import { TRACKS } from "@/game/audio/music";
import type { SimEvent } from "@/game/sim/types";

const EVENTS = {
  shot: { type: "shot", playerId: "p1", weapon: "blaster", facing: "right", pos: { x: 500, y: 0 } },
  shot_blocked: { type: "shot_blocked", playerId: "p1", reason: "no_ammo" },
  projectile_hit: { type: "projectile_hit", projectileId: "b", targetId: "e", pos: { x: 0, y: 0 }, damage: 10 },
  projectile_expired: { type: "projectile_expired", projectileId: "b", pos: { x: 0, y: 0 } },
  explosion: { type: "explosion", pos: { x: 0, y: 0 }, radius: 60 },
  enemy_hurt: { type: "enemy_hurt", enemyId: "e", damage: 10 },
  enemy_killed: { type: "enemy_killed", enemyId: "e", enemyType: "doom_prophet", pos: { x: 0, y: 0 }, score: 100 },
  player_hurt: { type: "player_hurt", playerId: "p1", damage: 10, from: "e" },
  player_downed: { type: "player_downed", playerId: "p1" },
  player_died: { type: "player_died", playerId: "p1" },
  player_revived: { type: "player_revived", playerId: "p1", by: "p2" },
  revive_progress: { type: "revive_progress", playerId: "p2", target: "p1", fraction: 0.5 },
  jump: { type: "jump", playerId: "p1" },
  land: { type: "land", playerId: "p1", impactVy: 200 },
  dash: { type: "dash", playerId: "p1", facing: "right" },
  pickup: { type: "pickup", playerId: "p1", pickupId: "c", pickupType: "coin", value: 1 },
  interact: { type: "interact", playerId: "p1", interactableId: "s", interactableType: "switch" },
  fact_check_pulse: { type: "fact_check_pulse", playerId: "p1", pos: { x: 0, y: 0 } },
  enemy_bubble: { type: "enemy_bubble", enemyId: "e", text: "PAUSE EVERYTHING" },
  enemy_telegraph: { type: "enemy_telegraph", enemyId: "e" },
  enemy_attack: { type: "enemy_attack", enemyId: "e", pos: { x: 0, y: 0 } },
  gate_opened: { type: "gate_opened", roomId: "r" },
  room_entered: { type: "room_entered", roomId: "r" },
  boss_phase: { type: "boss_phase", phase: 2 },
  level_won: { type: "level_won" },
  level_lost: { type: "level_lost" },
} satisfies { [K in SimEvent["type"]]: Extract<SimEvent, { type: K }> };

function mockContext() {
  const parameter = () => ({
    setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(),
  });
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  const source = () => ({ ...node(), start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null });
  const context = {
    currentTime: 10, sampleRate: 44100, state: "suspended", destination: node(),
    createGain: vi.fn(() => ({ ...node(), gain: parameter() })),
    createStereoPanner: vi.fn(() => ({ ...node(), pan: parameter() })),
    createOscillator: vi.fn(() => ({ ...source(), type: "sine", frequency: parameter() })),
    createBufferSource: vi.fn(() => ({ ...source(), buffer: null, loop: false })),
    createBiquadFilter: vi.fn(() => ({ ...node(), type: "lowpass", frequency: parameter() })),
    createBuffer: vi.fn((_channels: number, size: number) => ({ getChannelData: () => new Float32Array(size) })),
    resume: vi.fn(async () => { context.state = "running"; }),
    close: vi.fn(async () => { context.state = "closed"; }),
  };
  const factory = vi.fn(() => context as unknown as AudioContext);
  return { context, factory };
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("audio engine", () => {
  it("is inert during SSR, before a gesture, and after disposal", async () => {
    vi.stubGlobal("window", undefined);
    const server = createAudioEngine();
    await expect(server.unlock()).resolves.toBeUndefined();
    server.dispose();
    const { factory, context } = mockContext();
    const engine = createAudioEngine({ createContext: factory });
    engine.startMusic("title");
    engine.handleEvents(Object.values(EVENTS), 0);
    expect(factory).not.toHaveBeenCalled();
    await engine.unlock();
    expect(factory).toHaveBeenCalledOnce();
    expect(context.resume).toHaveBeenCalledOnce();
    engine.dispose();
    engine.dispose();
    await engine.unlock();
    expect(factory).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
  });

  it.each(Object.values(EVENTS))("maps $type without throwing", async (event) => {
    const { context, factory } = mockContext();
    const engine = createAudioEngine({ createContext: factory });
    await engine.unlock();
    expect(() => engine.handleEvents([event], 0)).not.toThrow();
    const count = context.createOscillator.mock.calls.length + context.createBufferSource.mock.calls.length;
    expect(count > 0).toBe(soundForEvent(event) !== null);
    engine.dispose();
  });

  it("distinguishes all weapons and quiet bookkeeping events", () => {
    expect(["blaster", "shotgun", "launcher"].map((weapon) => soundForEvent({
      ...EVENTS.shot, weapon: weapon as "blaster" | "shotgun" | "launcher",
    }))).toEqual(["blaster", "shotgun", "launcher"]);
    expect(soundForEvent({ ...EVENTS.shot_blocked, reason: "cooldown" })).toBeNull();
    expect(soundForEvent(EVENTS.projectile_expired)).toBeNull();
    expect(soundForEvent(EVENTS.revive_progress)).toBeNull();
    expect(soundForEvent({ ...EVENTS.interact, interactableType: "door" })).toBe("door");
    expect(soundForEvent({ ...EVENTS.pickup, pickupType: "health" })).toBe("pickup");
  });

  it("clamps panning and centres events with no position", async () => {
    const { context, factory } = mockContext();
    const engine = createAudioEngine({ createContext: factory });
    await engine.unlock();
    engine.handleEvents([EVENTS.shot], 0);
    expect(context.createStereoPanner.mock.results[0].value.pan.setValueAtTime).toHaveBeenCalledWith(1, 10);
    context.currentTime++;
    engine.handleEvents([EVENTS.shot], 1000);
    expect(context.createStereoPanner.mock.results[1].value.pan.setValueAtTime).toHaveBeenCalledWith(-1, 11);
    engine.handleEvents([EVENTS.jump], 1000);
    expect(context.createStereoPanner.mock.results[2].value.pan.setValueAtTime).toHaveBeenCalledWith(0, 11);
    engine.dispose();
  });

  it("plays both co-op shots in the same tick with independent panning", async () => {
    const { context, factory } = mockContext();
    const engine = createAudioEngine({ createContext: factory });
    await engine.unlock();
    engine.handleEvents([
      { ...EVENTS.shot, pos: { x: -480, y: 0 } },
      { ...EVENTS.shot, playerId: "p2", pos: { x: 480, y: 0 } },
    ], 0);
    expect(context.createOscillator).toHaveBeenCalledTimes(2);
    expect(context.createStereoPanner.mock.results[0].value.pan.setValueAtTime).toHaveBeenCalledWith(-1, 10);
    expect(context.createStereoPanner.mock.results[1].value.pan.setValueAtTime).toHaveBeenCalledWith(1, 10);
    engine.dispose();
  });

  it("remembers volume before unlock, clamps invalid values, restores mute", async () => {
    const { context, factory } = mockContext();
    const engine = createAudioEngine({ createContext: factory });
    engine.setMasterVolume(0.25); engine.setMusicVolume(5); engine.setSfxVolume(NaN); engine.setMuted(true);
    await engine.unlock();
    const [master, music, sfx] = context.createGain.mock.results.map((r) => r.value.gain);
    expect(master.setTargetAtTime).toHaveBeenLastCalledWith(0, 10, 0.015);
    expect(music.setTargetAtTime).toHaveBeenLastCalledWith(1, 10, 0.015);
    expect(sfx.setTargetAtTime).toHaveBeenLastCalledWith(0, 10, 0.015);
    engine.setMuted(false);
    expect(master.setTargetAtTime).toHaveBeenLastCalledWith(0.25, 10, 0.015);
    engine.dispose();
  });

  it("uses envelopes and releases voices on completion", async () => {
    const { context, factory } = mockContext();
    const engine = createAudioEngine({ createContext: factory });
    await engine.unlock();
    engine.handleEvents([EVENTS.shot], 0);
    const oscillator = context.createOscillator.mock.results[0].value;
    const gain = context.createGain.mock.results[3].value;
    expect(oscillator.frequency.setValueAtTime).toHaveBeenCalledWith(960, 10);
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.11, 10.004);
    oscillator.onended?.();
    expect(oscillator.disconnect).toHaveBeenCalledOnce();
    expect(gain.disconnect).toHaveBeenCalledOnce();
    engine.dispose();
  });

  it("runs every track with one scheduler and cancels pending music", async () => {
    vi.useFakeTimers();
    const { context, factory } = mockContext();
    const engine = createAudioEngine({ createContext: factory });
    await engine.unlock();
    for (const track of Object.keys(TRACKS) as Array<keyof typeof TRACKS>) {
      engine.startMusic(track);
      engine.startMusic(track);
      expect(vi.getTimerCount()).toBe(1);
      context.currentTime += 0.5;
      vi.advanceTimersByTime(100);
    }
    engine.stopMusic();
    expect(vi.getTimerCount()).toBe(0);
    const count = context.createOscillator.mock.calls.length;
    vi.advanceTimersByTime(1000);
    expect(context.createOscillator.mock.calls.length).toBe(count);
    expect(context.createOscillator.mock.results.every((r) => r.value.disconnect.mock.calls.length > 0)).toBe(true);
    engine.dispose();
  });

  it("bounds simultaneous voices and throttles no-ammo clicks", async () => {
    const { context, factory } = mockContext();
    const engine = createAudioEngine({ createContext: factory });
    await engine.unlock();
    for (let i = 0; i < 300; i++) {
      engine.handleEvents([EVENTS.shot_blocked, EVENTS.shot], 0);
      context.currentTime += 1 / 60;
    }
    expect(context.createOscillator.mock.calls.length).toBeLessThanOrEqual(64);
    engine.dispose();
  });

  it("handles a rejected resume without starting sound and permits retry", async () => {
    const { context, factory } = mockContext();
    context.resume.mockRejectedValueOnce(new Error("Gesture required"));
    const engine = createAudioEngine({ createContext: factory });
    await expect(engine.unlock()).rejects.toThrow("Gesture required");
    engine.handleEvents([EVENTS.jump], 0);
    expect(context.createOscillator).not.toHaveBeenCalled();
    await engine.unlock();
    engine.handleEvents([EVENTS.jump], 0);
    expect(context.createOscillator).toHaveBeenCalledOnce();
    engine.dispose();
  });
});
