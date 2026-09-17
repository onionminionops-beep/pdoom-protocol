// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DirectiveSelect } from "@/components/DirectiveSelect";
import { Hud } from "@/components/Hud";
import { JevActions } from "@/components/JevActions";
import { createEpisode, type ClientSnapshot } from "@/game/client/session";
import { defaultSettings } from "@/game/client/settings";
import { DIRECTIVES } from "@/game/contracts/directives";
import { neutralInput } from "@/game/contracts/input";
import type { PlayerState, SlotKind } from "@/game/sim/types";
import { createPlayer } from "@/game/sim/world";

function renderActions(player: PlayerState, slot: SlotKind = "JEV") {
  const element = document.createElement("div");
  element.innerHTML = renderToStaticMarkup(
    createElement(JevActions, { player, slot }),
  );
  return element;
}

function actionValues(element: Element) {
  return [...element.querySelectorAll("dd")].map((value) => value.textContent);
}

describe("JEV action HUD", () => {
  it("shows simultaneous applied inputs and clears them on the next neutral snapshot", () => {
    const player = createPlayer("p2", 0, 0);
    player.lastInput = {
      ...neutralInput("episode", 1),
      horizontal: "left",
      verticalAction: "jump",
      shoot: true,
      dash: true,
      interact: true,
    };
    const active = renderActions(player);
    expect(active.querySelector("strong")?.textContent).toBe("Active");
    expect(actionValues(active)).toEqual([
      "← Left",
      "Jump held",
      "On",
      "On",
      "On",
    ]);
    expect(active.querySelectorAll('[data-active="true"]')).toHaveLength(5);

    player.lastInput = {
      ...player.lastInput,
      horizontal: "right",
      verticalAction: "drop",
    };
    expect(actionValues(renderActions(player))).toEqual([
      "Right →",
      "Drop",
      "On",
      "On",
      "On",
    ]);

    player.lastInput = neutralInput("episode", 2);
    const idle = renderActions(player);
    expect(idle.querySelector("strong")?.textContent).toBe("Idle");
    expect(actionValues(idle)).toEqual(["None", "None", "Off", "Off", "Off"]);
    expect(idle.querySelectorAll('[data-active="true"]')).toHaveLength(0);
  });

  it.each(["Disabled", "Downed", "Dead"] as const)(
    "masks retained inputs when %s",
    (state) => {
      const player = createPlayer("p2", 0, 0);
      player.lastInput = {
        ...neutralInput("episode", 1),
        horizontal: "right",
        shoot: true,
      };
      player.downed = state === "Downed" || state === "Dead";
      player.alive = state !== "Dead";
      const element = renderActions(
        player,
        state === "Disabled" ? "DISABLED" : "JEV",
      );
      expect(element.querySelector("strong")?.textContent).toBe(state);
      expect(actionValues(element)).toEqual(["—", "—", "—", "—", "—"]);
      expect(element.querySelectorAll('[data-active="true"]')).toHaveLength(0);
    },
  );

  it("distinguishes waiting for the first input from idle and avoids live announcements", () => {
    const element = renderActions(createPlayer("p2", 0, 0));
    expect(element.querySelector("strong")?.textContent).toBe("Waiting");
    expect(element.querySelector("section")?.getAttribute("aria-live")).toBe(
      "off",
    );
    expect(
      element.querySelector('[role="status"],[role="alert"],button,kbd'),
    ).toBeNull();
  });

  it("uses only p2's applied input even when model/debug data disagrees", () => {
    const world = createEpisode({
      directive: "GUARDIAN",
      slots: { p1: "HUMAN", p2: "JEV" },
    });
    world.players.p1.lastInput = {
      ...neutralInput(world.episodeId, 0),
      horizontal: "right",
      shoot: true,
    };
    world.players.p2.lastInput = {
      ...neutralInput(world.episodeId, 0),
      horizontal: "left",
    };
    const snapshot: ClientSnapshot = {
      world,
      jevStatus: null,
      observation: null,
      fps: 60,
      decision: { input: world.players.p1.lastInput },
    };
    const element = document.createElement("div");
    element.innerHTML = renderToStaticMarkup(
      createElement(Hud, {
        snapshot,
        settings: defaultSettings(),
        onPause: () => {},
        onQuit: () => {},
        onDirectiveChange: () => {},
      }),
    );
    expect(
      element.querySelectorAll('[aria-label="JEV applied actions"]'),
    ).toHaveLength(1);
    const panel = element.querySelector('[aria-label="JEV applied actions"]')!;
    expect(panel.closest(".p2")).not.toBeNull();
    expect(panel.previousElementSibling?.getAttribute("aria-label")).toBe(
      "JEV health",
    );
    expect(actionValues(panel)).toEqual([
      "← Left",
      "None",
      "Off",
      "Off",
      "Off",
    ]);
  });
});

describe("JEV mode selector", () => {
  it("exposes all five modes using stable directive values and an accessible label", () => {
    const element = document.createElement("div");
    element.innerHTML = renderToStaticMarkup(
      createElement(DirectiveSelect, {
        directive: "MONSTER_SLAYER",
        disabled: false,
        onChange: () => {},
      }),
    );
    const select = element.querySelector("select")!;
    expect(select.labels?.[0]?.textContent).toContain("JEV mode");
    expect(select.value).toBe("MONSTER_SLAYER");
    expect([...select.options].map((option) => option.value)).toEqual(
      Object.keys(DIRECTIVES),
    );
    expect([...select.options].map((option) => option.textContent)).toEqual(
      expect.arrayContaining([
        "Guardian",
        "Speedrunner",
        "Monster Slayer",
        "Score Maximizing (Auto)",
        "Token Collector",
      ]),
    );
  });
});
