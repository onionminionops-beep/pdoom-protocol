import type { AudioEngine } from "@/game/audio/types";
import { createController } from "@/game/controllers/factory";
import { HumanController } from "@/game/controllers/human";
import { JevController, type JevLastDecision, type JevStatus } from "@/game/controllers/jev";
import type { PlayerController } from "@/game/controllers/types";
import type { DirectiveId } from "@/game/contracts/directives";
import type { GameObservationV1 } from "@/game/contracts/observation";
import { CONSENSUS_HEIGHTS } from "@/game/levels/consensusHeights";
import { buildObservation } from "@/game/observation/build";
import {
  ComparisonMetrics,
  createComparisonWorld,
  HumanInputRecording,
  replayHumanInput,
  type ComparisonResult,
  type HumanReplay,
} from "@/game/replay";
import { stepWorld } from "@/game/sim/step";
import type { PlayerId, PlayerInputs, SimEvent, SlotKind, WorldState } from "@/game/sim/types";
import { createWorld } from "@/game/sim/world";
import { FixedClock } from "./clock";
import { HumanInputBridge } from "./input";
import type { ClientSettings } from "./settings";

export interface SessionOptions {
  slots: Record<PlayerId, SlotKind>;
  directive: DirectiveId;
  replay?: HumanReplay;
}

export interface ClientSnapshot {
  world: WorldState;
  jevStatus: JevStatus | null;
  observation: GameObservationV1 | null;
  decision: unknown;
  fps: number;
  replayTicks: number | null;
  comparison: ComparisonResult | null;
  averageConfidence: number | null;
  averageLatencyMs: number | null;
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
    readonly gameAgent?: Readonly<{ getObservation: (playerId?: PlayerId) => GameObservationV1 }>;
  }
}

export function createEpisode(options: SessionOptions): WorldState {
  if (options.replay) {
    if (options.slots.p2 !== "JEV" && options.slots.p2 !== "MOCK_AI")
      throw new Error("Comparisons require an AI companion.");
    return createComparisonWorld(
      options.replay,
      CONSENSUS_HEIGHTS,
      options.directive,
      crypto.randomUUID(),
      options.slots.p2,
    );
  }
  return createWorld({
    ...options,
    level: CONSENSUS_HEIGHTS,
    seed: 42,
    episodeId: crypto.randomUUID(),
  });
}

export class ClientSession {
  readonly world: WorldState;
  readonly clock = new FixedClock();
  private controllers: Record<PlayerId, PlayerController>;
  private controllerGenerations: Record<PlayerId, number> = { p1: 0, p2: 0 };
  private bridges: HumanInputBridge[] = [];
  private paused = false;
  private disposed = false;
  private jevStatus: JevStatus | null = null;
  private publishMs = 0;
  private fps = 60;
  private recording: HumanInputRecording | null;
  private metrics: ComparisonMetrics;
  private decisions: JevLastDecision[] = [];
  private confidenceSum = 0;
  private latencySum = 0;
  readonly replay: HumanReplay | null;
  comparison: ComparisonResult | null = null;
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
    this.replay = options.replay ? structuredClone(options.replay) : null;
    this.recording =
      !this.replay && this.world.slots.p1 === "HUMAN" ? new HumanInputRecording(this.world) : null;
    this.metrics = new ComparisonMetrics(this.world);
    this.controllers = { p1: this.makeController("p1"), p2: this.makeController("p2") };
    for (const id of ["p1", "p2"] as const) {
      const controller = this.controllers[id];
      if (id === "p1" && this.replay) {
        controller.dispose();
        continue;
      }
      if (controller instanceof HumanController)
        this.bridges.push(new HumanInputBridge(controller, settings.bindings));
    }
    this.setSettings(settings);
    audio.startMusic("level");
    if (developer) {
      Object.defineProperty(window, "__pdoom", {
        configurable: true,
        get: () => this.debugSnapshot(),
      });
      Object.defineProperty(window, "gameAgent", {
        configurable: true,
        value: Object.freeze({
          getObservation: (playerId: PlayerId = "p2") =>
            buildObservation(this.world, playerId, performance.now()),
        }),
      });
    }
  }

  private makeController(id: PlayerId): PlayerController {
    const generation = ++this.controllerGenerations[id];
    return createController(this.world.slots[id], {
      episodeId: this.world.episodeId,
      onStatus: (status) => {
        if (!this.disposed && id === "p2" && generation === this.controllerGenerations[id]) {
          this.jevStatus = { ...status };
          if (status.mode === "live" && this.controllers.p2 instanceof JevController) {
            const decision = this.controllers.p2.getLastDecision();
            if (decision && decision.requestId !== this.decisions.at(-1)?.requestId) {
              this.decisions.push(decision);
              this.metrics.decision(decision.latencyMs);
              this.latencySum += decision.latencyMs;
              const answers = Object.values(decision.answers);
              this.confidenceSum +=
                answers.reduce((sum, answer) => sum + answer.confidence, 0) / answers.length;
            }
          }
        }
      },
    });
  }

  setDirective(directive: DirectiveId): void {
    if (
      this.disposed ||
      this.replay ||
      this.world.status !== "playing" ||
      this.world.directive === directive
    )
      return;
    this.world.directive = directive;
    for (const id of ["p1", "p2"] as const) {
      const controller = this.controllers[id];
      if (controller.kind !== "JEV" && controller.kind !== "MOCK_AI") continue;
      this.controllerGenerations[id]++;
      controller.dispose();
      if (id === "p2") this.jevStatus = null;
      this.controllers[id] = this.makeController(id);
    }
    this.publish();
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
    if (
      this.disposed ||
      this.paused ||
      document.hidden ||
      this.world.status !== "playing" ||
      this.comparison
    ) {
      this.clock.reset();
      return events;
    }
    if (deltaMs > 0) this.fps += (Math.min(240, 1000 / deltaMs) - this.fps) * 0.08;
    this.clock.advance(
      deltaMs,
      () => {
        if (this.world.status !== "playing" || this.comparison) return;
        const context = {
          world: this.world,
          tick: this.world.tick,
          episodeId: this.world.episodeId,
          nowMs,
        };
        const inputs = {
          p1: this.replay
            ? replayHumanInput(this.replay, this.world.tick, this.world.episodeId)
            : this.controllers.p1.update({ ...context, playerId: "p1" }),
          p2: this.controllers.p2.update({ ...context, playerId: "p2" }),
        };
        const tickEvents = this.step(inputs);
        events.push(...tickEvents);
      },
      this.slowMotion ? 0.25 : 1,
    );
    this.publishMs += deltaMs;
    if (this.publishMs >= 100 || this.world.status !== "playing" || this.comparison) {
      this.publishMs = 0;
      this.publish();
    }
    return events;
  }

  step(inputs: PlayerInputs): SimEvent[] {
    if (
      this.disposed ||
      this.paused ||
      document.hidden ||
      this.world.status !== "playing" ||
      this.comparison
    )
      return [];
    this.recording?.record(this.world, inputs.p1);
    const events = stepWorld(this.world, inputs);
    this.metrics.sample(this.world, events, this.jevStatus?.mode === "fallback_mock");
    if (
      this.replay &&
      (this.world.tick >= this.replay.actions.length || this.world.status !== "playing")
    ) {
      const companion = this.world.slots.p2;
      if (companion === "JEV" || companion === "MOCK_AI")
        this.comparison = this.metrics.result(this.world, this.replay, companion);
      Object.values(this.controllers).forEach((controller) => controller.dispose());
    }
    this.audio.handleEvents(
      events,
      (this.world.players.p1.pos.x + this.world.players.p2.pos.x) / 2,
    );
    this.updateMusic();
    return events;
  }

  get lastInputs() {
    return { p1: this.world.players.p1.lastInput, p2: this.world.players.p2.lastInput };
  }

  getRecording(): HumanReplay | null {
    return this.recording?.snapshot() ?? null;
  }

  decisionLog(): string {
    return this.decisions.map((decision) => JSON.stringify(decision)).join("\n");
  }

  private updateMusic(): void {
    const track =
      this.world.status === "won"
        ? "victory"
        : this.world.status === "lost"
          ? "defeat"
          : this.world.bossActive
            ? "boss"
            : "level";
    if (track !== this.track) {
      this.track = track;
      this.audio.startMusic(track);
    }
  }

  publish(): void {
    const controller = this.controllers.p2;
    const decision =
      this.developer && controller instanceof JevController ? controller.getLastDecision() : null;
    this.onSnapshot?.({
      world: structuredClone(this.world),
      jevStatus: this.jevStatus,
      observation: this.developer ? buildObservation(this.world, "p2", performance.now()) : null,
      decision,
      fps: Math.round(this.fps),
      replayTicks: this.replay?.actions.length ?? null,
      comparison: this.comparison,
      averageConfidence: this.decisions.length ? this.confidenceSum / this.decisions.length : null,
      averageLatencyMs: this.decisions.length ? this.latencySum / this.decisions.length : null,
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
    if (this.developer && window.__pdoom?.episodeId === this.world.episodeId) {
      Reflect.deleteProperty(window, "__pdoom");
      Reflect.deleteProperty(window, "gameAgent");
    }
  }
}
