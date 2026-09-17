import { describe, expect, it } from "vitest";
import { animationFrame, parseRenderManifest } from "@/game/client/art";
import { fitCamera, VIEW_WIDTH, VIEW_HEIGHT } from "@/game/client/camera";
import { FixedClock, MAX_CATCH_UP_TICKS } from "@/game/client/clock";
import { createEpisode, type SessionOptions } from "@/game/client/session";
import { defaultSettings, remapKey } from "@/game/client/settings";
import { TICK_MS, TILE } from "@/game/config/movement";
import { neutralInput } from "@/game/contracts/input";
import { stepWorld } from "@/game/sim/step";
import type { SpriteSheetDef } from "@/game/art/manifest";

const options: SessionOptions = { slots: { p1: "HUMAN", p2: "MOCK_AI" }, directive: "GUARDIAN" };

describe("fixed client clock", () => {
  it("runs 60 authoritative ticks from uneven render frames", () => {
    const clock = new FixedClock();
    let ticks = 0;
    for (let i = 0; i < 20; i++) {
      clock.advance(10, () => ticks++);
      clock.advance(40, () => ticks++);
    }
    expect(ticks).toBe(60);
  });

  it("caps catch-up and discards suspended time", () => {
    const clock = new FixedClock();
    expect(clock.advance(10000, () => {})).toBe(MAX_CATCH_UP_TICKS);
    expect(clock.advance(1, () => {})).toBe(0);
    clock.reset();
    expect(clock.advance(TICK_MS / 2, () => {})).toBe(0);
  });

  it("slows tick frequency without changing tick duration", () => {
    const clock = new FixedClock();
    let ticks = 0;
    for (let i = 0; i < 60; i++) clock.advance(TICK_MS, () => ticks++, 0.25);
    expect(ticks).toBe(15);
    expect(clock.advance(Number.NaN, () => {})).toBe(0);
    expect(clock.advance(-1, () => {})).toBe(0);
  });
});

describe("co-op camera", () => {
  it("fits widely separated players in integral 16:9 bounds", () => {
    const world = createEpisode(options);
    world.players.p1.pos = { x: 300, y: 300 };
    world.players.p2.pos = { x: 2800, y: 450 };
    const camera = fitCamera(world);
    expect(Number.isInteger(camera.factor)).toBe(true);
    expect(camera.width / camera.height).toBeCloseTo(16 / 9);
    for (const player of Object.values(world.players)) {
      expect(player.pos.x).toBeGreaterThanOrEqual(camera.x);
      expect(player.pos.x).toBeLessThanOrEqual(camera.x + camera.width);
      expect(player.pos.y).toBeGreaterThanOrEqual(camera.y);
      expect(player.pos.y).toBeLessThanOrEqual(camera.y + camera.height);
    }
  });

  it("ignores disabled players and clamps to the right edge", () => {
    const world = createEpisode({ ...options, slots: { p1: "HUMAN", p2: "DISABLED" } });
    world.players.p1.pos.x = world.level.widthTiles * TILE - 30;
    const camera = fitCamera(world);
    expect(camera.width).toBe(VIEW_WIDTH);
    expect(camera.height).toBe(VIEW_HEIGHT);
    expect(camera.x + camera.width).toBe(world.level.widthTiles * TILE);
  });
});

describe("episode replacement", () => {
  it("generates a fresh identity and rejects previous-episode input", () => {
    const previous = createEpisode(options);
    const next = createEpisode(options);
    expect(next.episodeId).not.toBe(previous.episodeId);
    expect(next.seed).toBe(previous.seed);
    const initialX = next.players.p1.pos.x;
    for (let i = 0; i < 30; i++) stepWorld(next, {
      p1: { ...neutralInput(previous.episodeId, i), horizontal: "right" },
      p2: neutralInput(next.episodeId, i),
    });
    expect(next.players.p1.pos.x).toBe(initialX);
    stepWorld(next, {
      p1: { ...neutralInput(next.episodeId, next.tick), horizontal: "right" },
      p2: neutralInput(next.episodeId, next.tick),
    });
    expect(next.players.p1.pos.x).toBeGreaterThan(initialX);
  });
});

describe("optional art", () => {
  const sheet: SpriteSheetDef = {
    key: "user", file: "characters/user.png", frameWidth: 32, frameHeight: 48,
    originOffset: { x: 0, y: 0 },
    anims: [{ name: "idle", row: 2, frames: 4, fps: 10, loop: true }],
  };

  it("accepts partial manifests and rejects unsafe asset paths", () => {
    expect(parseRenderManifest({ version: 1, characters: { user: sheet } }).characters?.user).toEqual(sheet);
    expect(parseRenderManifest(undefined)).toEqual({});
    expect(parseRenderManifest({ version: 1, characters: { user: { ...sheet, file: "../secret" } } })).toEqual({});
  });

  it("calculates looping and terminal animation frames", () => {
    expect(animationFrame(sheet, "idle", 550, 8)).toBe(17);
    const terminal = { ...sheet, anims: [{ ...sheet.anims[0], loop: false }] };
    expect(animationFrame(terminal, "idle", 550, 8)).toBe(19);
  });
});

describe("accessible settings", () => {
  it("respects reduced motion and avoids shared binding mutations", () => {
    const settings = defaultSettings(true);
    expect(settings.screenShake).toBe(false);
    expect(settings.reducedFlashing).toBe(true);
    settings.bindings.jump.push("KeyZ");
    expect(defaultSettings().bindings.jump).not.toContain("KeyZ");
  });

  it("rejects conflicting keys and preserves menu navigation", () => {
    const { bindings } = defaultSettings();
    expect(remapKey(bindings, "jump", "KeyJ")).toBeNull();
    expect(remapKey(bindings, "jump", "Escape")).toBeNull();
    expect(remapKey(bindings, "jump", "Tab")).toBeNull();
    expect(remapKey(bindings, "jump", "KeyZ")?.jump).toEqual(["KeyZ"]);
    expect(bindings.jump).not.toContain("KeyZ");
  });
});
