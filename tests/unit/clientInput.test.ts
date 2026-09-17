// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { HumanInputBridge } from "@/game/client/input";
import { defaultSettings } from "@/game/client/settings";
import { ClientSession, createEpisode, type SessionOptions } from "@/game/client/session";
import { createClientAudio } from "@/game/client/audio";
import { HumanController } from "@/game/controllers/human";
import { TICK_MS } from "@/game/config/movement";
import { neutralInput } from "@/game/contracts/input";

const options: SessionOptions = { slots: { p1: "HUMAN", p2: "DISABLED" }, directive: "GUARDIAN" };
const disposables: Array<{ dispose: () => void }> = [];
afterEach(() => disposables.splice(0).forEach((item) => item.dispose()));

function bridgeFixture() {
  const controller = new HumanController();
  const bindings = { ...defaultSettings().bindings, right: ["KeyL"] };
  const bridge = new HumanInputBridge(controller, bindings);
  disposables.push(bridge, controller);
  const world = createEpisode(options);
  return { bridge, read: () => controller.update({ world, playerId: "p1", tick: 0, episodeId: world.episodeId, nowMs: 0 }) };
}

describe("human input isolation", () => {
  it("uses remapped keys and clears held input on pause and blur", () => {
    const { bridge, read } = bridgeFixture();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD" }));
    expect(read().horizontal).toBe("neutral");
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyL" }));
    expect(read().horizontal).toBe("right");
    bridge.setEnabled(false);
    expect(read().horizontal).toBe("neutral");
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyL" }));
    expect(read().horizontal).toBe("neutral");
    bridge.setEnabled(true);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyL" }));
    window.dispatchEvent(new Event("blur"));
    expect(read().horizontal).toBe("neutral");
  });

  it("does not treat clicks or menu keyboard events as game input", () => {
    const { read } = bridgeFixture();
    const button = document.createElement("button");
    document.body.append(button);
    button.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyJ", bubbles: true }));
    window.dispatchEvent(new MouseEvent("mousedown", { button: 0 }));
    expect(read().shoot).toBe(false);
    button.remove();
  });
});

describe("client session lifetime", () => {
  it("pauses tick advancement and protects the newer episode debug hook", () => {
    const audio = createClientAudio();
    const first = new ClientSession(options, defaultSettings(), audio, true);
    disposables.push(first);
    first.advance(TICK_MS, 0);
    expect(first.world.tick).toBe(1);
    first.setPaused(true);
    first.advance(1000, 1000);
    expect(first.world.tick).toBe(1);
    const second = new ClientSession(options, defaultSettings(), audio, true);
    disposables.push(second);
    first.dispose();
    expect(window.__pdoom?.episodeId).toBe(second.world.episodeId);
    expect(Object.isFrozen(window.__pdoom?.players.p1)).toBe(true);
    second.dispose();
    expect(window.__pdoom).toBeUndefined();
  });

  it("allows the replay harness to supply both slots through the shared contract", () => {
    const session = new ClientSession(options, defaultSettings(), createClientAudio(), false);
    disposables.push(session);
    const x = session.world.players.p1.pos.x;
    session.step({
      p1: { ...neutralInput(session.world.episodeId, 0), horizontal: "right" },
      p2: neutralInput(session.world.episodeId, 0),
    });
    expect(session.world.tick).toBe(1);
    expect(session.world.players.p1.pos.x).toBeGreaterThan(x);
    expect(session.lastInputs.p1?.horizontal).toBe("right");
    expect(window.__pdoom).toBeUndefined();
  });
});
