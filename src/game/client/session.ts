import type { AudioEngine } from "@/game/audio/types";
import { createController } from "@/game/controllers/factory";
import { HumanController } from "@/game/controllers/human";
import type { JevStatus } from "@/game/controllers/jev";
import type { PlayerController } from "@/game/controllers/types";
import type { DirectiveId } from "@/game/contracts/directives";
import type { GameObservationV1 } from "@/game/contracts/observation";
import { CONSENSUS_HEIGHTS } from "@/game/levels/consensusHeights";
import { buildObservation } from "@/game/observation/build";
import { stepWorld } from "@/game/sim/step";
import type { PlayerId, PlayerInputs, SimEvent, SlotKind, WorldState } from "@/game/sim/types";
import { createWorld } from "@/game/sim/world";
import { FixedClock } from "./clock";
import { HumanInputBridge } from "./input";
import type { ClientSettings } from "./settings";

export interface SessionOptions {
  slots: Record<PlayerId, SlotKind>;
  directive: DirectiveId;
}

export interface ClientSnapshot {
  world: WorldState;
  jevStatus: JevStatus | null;
  observation: GameObservationV1 | null;
  decision: unknown;
  fps: number;
}

export interface DebugSnapshot {
  readonly episodeId: string;
  readonly tick: number;
  readonly paused: boolean;
  readonly status: WorldState["status"];
  readonly players: Readonly<Record<PlayerId, Readonly<{ x: number; y: number }>>>;
}

declare global {
  interface Window {
    readonly __pdoom?: DebugSnapshot;
  }
}

export function createEpisode(options: SessionOptions): WorldState {
  return createWorld({ ...options, level: CONSENSUS_HEIGHTS, seed: 42, episodeId: crypto.randomUUID() });
}

export class ClientSession {
  readonly world: WorldState;
  readonly clock = new FixedClock();
  private controllers: Record<PlayerId, PlayerController>;
  private bridges: HumanInputBridge[] = [];
  private paused = false;
  private disposed = false;
  private jevStatus: JevStatus | null = null;
  private publishMs = 0;
  private fps = 60;
  private track: Parameters<AudioEngine["startMusic"]>[0] = "level";
  slowMotion = false;
  hitboxes = false;
  onSnapshot: ((snapshot: ClientSnapshot) => void) | null = null;

  constructor(
    options: SessionOptions,
    public settings: ClientSettings,
    private audio: AudioEngine,
    readonly developer: boolean,
  ) {
    this.world = createEpisode(options);
    const makeController = (id: PlayerId) => createController(options.slots[id], {
      onStatus: (status) => {
        if (!this.disposed && id === "p2") this.jevStatus = { ...status };
      },
    });
    this.controllers = { p1: makeController("p1"), p2: makeController("p2") };
    for (const controller of Object.values(this.controllers)) {
      if (controller instanceof HumanController) this.bridges.push(new HumanInputBridge(controller, settings.bindings));
    }
    this.setSettings(settings);
    audio.startMusic("level");
    if (developer) Object.defineProperty(window, "__pdoom", { configurable: true, get: () => this.debugSnapshot() });
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.clock.reset();
    this.bridges.forEach((bridge) => bridge.setEnabled(!paused));
    this.audio.setMuted(paused);
  }

  setSettings(settings: ClientSettings): void {
    this.settings = settings;
    this.bridges.forEach((bridge) => bridge.setBindings(settings.bindings));
    this.audio.setMasterVolume(settings.master);
    this.audio.setMusicVolume(settings.music);
    this.audio.setSfxVolume(settings.sfx);
  }

  advance(deltaMs: number, nowMs: number): SimEvent[] {
    const events: SimEvent[] = [];
    if (this.disposed || this.paused || document.hidden || this.world.status !== "playing") {
      this.clock.reset();
      return events;
    }
    if (deltaMs > 0) this.fps += (Math.min(240, 1000 / deltaMs) - this.fps) * 0.08;
    this.clock.advance(deltaMs, () => {
      if (this.world.status !== "playing") return;
      const context = { world: this.world, tick: this.world.tick, episodeId: this.world.episodeId, nowMs };
      const inputs = {
        p1: this.controllers.p1.update({ ...context, playerId: "p1" }),
        p2: this.controllers.p2.update({ ...context, playerId: "p2" }),
      };
      const tickEvents = this.step(inputs);
      events.push(...tickEvents);
    }, this.slowMotion ? 0.25 : 1);
    this.publishMs += deltaMs;
    if (this.publishMs >= 100 || this.world.status !== "playing") {
      this.publishMs = 0;
      this.publish();
    }
    return events;
  }

  step(inputs: PlayerInputs): SimEvent[] {
    if (this.disposed || this.paused || document.hidden || this.world.status !== "playing") return [];
    const events = stepWorld(this.world, inputs);
    this.audio.handleEvents(events, (this.world.players.p1.pos.x + this.world.players.p2.pos.x) / 2);
    this.updateMusic();
    return events;
  }

  get lastInputs() {
    return { p1: this.world.players.p1.lastInput, p2: this.world.players.p2.lastInput };
  }

  private updateMusic(): void {
    const track = this.world.status === "won" ? "victory" : this.world.status === "lost" ? "defeat" : this.world.bossActive ? "boss" : "level";
    if (track !== this.track) {
      this.track = track;
      this.audio.startMusic(track);
    }
  }

  publish(): void {
    const controller = this.controllers.p2;
    const decision: unknown = this.developer && "getLastDecision" in controller && typeof controller.getLastDecision === "function"
      ? controller.getLastDecision() : null;
    this.onSnapshot?.({
      world: structuredClone(this.world),
      jevStatus: this.jevStatus,
      observation: this.developer ? buildObservation(this.world, "p2", performance.now()) : null,
      decision,
      fps: Math.round(this.fps),
    });
  }

  debugSnapshot(): DebugSnapshot {
    return Object.freeze({
      episodeId: this.world.episodeId,
      tick: this.world.tick,
      paused: this.paused,
      status: this.world.status,
      players: Object.freeze({
        p1: Object.freeze({ ...this.world.players.p1.pos }),
        p2: Object.freeze({ ...this.world.players.p2.pos }),
      }),
    });
  }

  dispose(): void {
    this.disposed = true;
    this.bridges.forEach((bridge) => bridge.dispose());
    Object.values(this.controllers).forEach((controller) => controller.dispose());
    this.audio.stopMusic();
    this.audio.setMuted(false);
    if (this.developer && window.__pdoom?.episodeId === this.world.episodeId) Reflect.deleteProperty(window, "__pdoom");
  }
}
