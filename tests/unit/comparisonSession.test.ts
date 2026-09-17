// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { ClientSession } from "@/game/client/session";
import { createClientAudio } from "@/game/client/audio";
import { defaultSettings } from "@/game/client/settings";
import { TICK_MS } from "@/game/config/movement";
import { DIRECTIVES } from "@/game/contracts/directives";
import { HumanController } from "@/game/controllers/human";
import { HumanInputBridge } from "@/game/client/input";

const disposables: Array<{ dispose: () => void }> = [];
afterEach(() => disposables.splice(0).forEach((item) => item.dispose()));

function session() {
  const audio = createClientAudio();
  const source = new ClientSession(
    { slots: { p1: "HUMAN", p2: "MOCK_AI" }, directive: "GUARDIAN" },
    defaultSettings(),
    audio,
    false,
  );
  disposables.push(source, audio);
  return source;
}

describe("recorded directive comparisons", () => {
  it("replays identical human controls across directives, ignores live keys, and stops at the recording boundary", () => {
    const source = session();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD" }));
    for (let i = 0; i < 20; i++) source.advance(TICK_MS, i * TICK_MS);
    const replay = source.getRecording();
    expect(replay?.actions).toHaveLength(20);
    const expected = structuredClone(source.world.players.p1);
    source.dispose();
    if (!replay) throw new Error("Missing recording");
    for (const directive of Object.values(DIRECTIVES)) {
      const audio = createClientAudio();
      const comparison = new ClientSession(
        {
          slots: { p1: "HUMAN", p2: "MOCK_AI" },
          directive: directive.id,
          replay,
        },
        defaultSettings(),
        audio,
        false,
      );
      disposables.push(comparison, audio);
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyA" }));
      for (let i = 0; i < 25; i++) {
        comparison.advance(TICK_MS, i * TICK_MS);
        if (i < 20)
          expect(comparison.world.players.p1.lastInput).toEqual({
            ...replay.actions[i],
            schemaVersion: "1.0",
            basedOnTick: i,
            episodeId: comparison.world.episodeId,
          });
      }
      expect(comparison.world.tick).toBe(20);
      const rebased = structuredClone(expected);
      if (rebased.lastInput) rebased.lastInput.episodeId = comparison.world.episodeId;
      expect(comparison.world.players.p1).toEqual(rebased);
      expect(comparison.world.episodeId).not.toBe(replay.sourceEpisodeId);
      expect(comparison.comparison).toMatchObject({
        directive: directive.id,
        companion: "MOCK_AI",
        ticksPlayed: 20,
        recordedTicks: 20,
        status: "recording_ended",
        fallbackTicks: 0,
        averageLatencyMs: null,
      });
      expect(comparison.getRecording()).toBeNull();
      comparison.dispose();
    }
  });

  it("keeps the chosen directive fixed throughout a comparison replay", () => {
    const source = session();
    source.advance(TICK_MS, 0);
    const replay = source.getRecording();
    if (!replay) throw new Error("Missing recording");
    const audio = createClientAudio();
    const comparison = new ClientSession(
      { slots: { p1: "HUMAN", p2: "MOCK_AI" }, directive: "SPEEDRUNNER", replay },
      defaultSettings(),
      audio,
      false,
    );
    disposables.push(comparison, audio);
    comparison.setDirective("MONSTER_SLAYER");
    comparison.advance(TICK_MS, 0);
    expect(comparison.world.directive).toBe("SPEEDRUNNER");
    expect(comparison.comparison?.directive).toBe("SPEEDRUNNER");
  });

  it("freezes a recording snapshot while the source episode continues", () => {
    const source = session();
    source.advance(TICK_MS, 0);
    const replay = source.getRecording();
    source.advance(TICK_MS, TICK_MS);
    expect(replay?.actions).toHaveLength(1);
    expect(source.getRecording()?.actions).toHaveLength(2);
  });
});

it("fires on canvas clicks, releases outside it, and clears on pause", () => {
  const source = session();
  const controller = new HumanController();
  const bridge = new HumanInputBridge(controller, defaultSettings().bindings);
  disposables.push(controller, bridge);
  const canvas = document.createElement("canvas");
  document.body.append(canvas);
  const input = () =>
    controller.update({
      world: source.world,
      playerId: "p1",
      episodeId: source.world.episodeId,
      tick: 0,
      nowMs: 0,
    });
  canvas.dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true }));
  expect(input().shoot).toBe(true);
  window.dispatchEvent(new MouseEvent("mouseup", { button: 0 }));
  expect(input().shoot).toBe(false);
  canvas.dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true }));
  bridge.setEnabled(false);
  expect(input().shoot).toBe(false);
  canvas.remove();
});
