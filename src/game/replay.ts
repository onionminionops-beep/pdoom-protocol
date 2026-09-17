import { neutralInput, PlayerInputV1Schema, type PlayerInputV1 } from "./contracts/input";
import type { DirectiveId } from "./contracts/directives";
import type { LevelData, SimEvent, WorldState } from "./sim/types";
import { createWorld } from "./sim/world";

export type RecordedAction = Pick<
  PlayerInputV1,
  "horizontal" | "verticalAction" | "shoot" | "dash" | "interact" | "holdForMs"
>;

export interface HumanReplay {
  seed: number;
  levelId: string;
  sourceEpisodeId: string;
  actions: RecordedAction[];
}

export class HumanInputRecording {
  private readonly replay: HumanReplay;

  constructor(world: Readonly<WorldState>) {
    if (world.tick !== 0 || world.slots.p1 !== "HUMAN") {
      throw new Error("Record human inputs from the start of an episode.");
    }
    this.replay = {
      seed: world.seed,
      levelId: world.level.id,
      sourceEpisodeId: world.episodeId,
      actions: [],
    };
  }

  record(world: Readonly<WorldState>, input: PlayerInputV1): void {
    const checked = PlayerInputV1Schema.parse(input);
    if (
      world.episodeId !== this.replay.sourceEpisodeId ||
      world.seed !== this.replay.seed ||
      world.level.id !== this.replay.levelId ||
      world.slots.p1 !== "HUMAN" ||
      checked.episodeId !== world.episodeId ||
      checked.basedOnTick !== world.tick ||
      world.tick !== this.replay.actions.length
    ) {
      throw new Error("Recording requires consecutive inputs from one human episode.");
    }
    const { horizontal, verticalAction, shoot, dash, interact, holdForMs } = checked;
    this.replay.actions.push({
      horizontal,
      verticalAction,
      shoot,
      dash,
      interact,
      holdForMs,
    });
  }

  snapshot(): HumanReplay {
    return {
      ...this.replay,
      actions: this.replay.actions.map((action) => ({ ...action })),
    };
  }
}

export function replayHumanInput(
  replay: Readonly<HumanReplay>,
  tick: number,
  episodeId: string,
): PlayerInputV1 {
  const input = neutralInput(episodeId, tick);
  return { ...input, ...replay.actions[tick] };
}

export function createComparisonWorld(
  replay: Readonly<HumanReplay>,
  level: LevelData,
  directive: DirectiveId,
  episodeId: string,
  companion: "JEV" | "MOCK_AI",
): WorldState {
  if (level.id !== replay.levelId || replay.actions.length === 0) {
    throw new Error("Comparison requires a recording for this level.");
  }
  if (episodeId === replay.sourceEpisodeId) {
    throw new Error("Comparison requires a fresh episode ID.");
  }
  return createWorld({
    level,
    seed: replay.seed,
    episodeId,
    directive,
    slots: { p1: "HUMAN", p2: companion },
  });
}

export interface ComparisonResult {
  directive: DirectiveId;
  seed: number;
  levelId: string;
  companion: "JEV" | "MOCK_AI";
  recordedTicks: number;
  ticksPlayed: number;
  status: WorldState["status"] | "recording_ended";
  elapsedMs: number;
  teamScore: number;
  teamCoins: number;
  teamKills: number;
  teamDamageTaken: number;
  jevCoins: number;
  jevRevives: number;
  jevProgressPx: number;
  averageTeammateDistancePx: number;
  decisions: number;
  averageLatencyMs: number | null;
  fallbackTicks: number;
}

export class ComparisonMetrics {
  private teamKills = 0;
  private jevCoins = 0;
  private jevRevives = 0;
  private distanceSum = 0;
  private samples = 0;
  private progress = 0;
  private fallbackTicks = 0;
  private decisions = 0;
  private latencySum = 0;
  private readonly startX: number;

  constructor(world: Readonly<WorldState>) {
    this.startX = world.players.p2.pos.x;
  }

  sample(world: Readonly<WorldState>, events: readonly SimEvent[], fallback: boolean): void {
    for (const event of events) {
      if (event.type === "enemy_killed") this.teamKills++;
      if (event.type === "pickup" && event.playerId === "p2" && event.pickupType === "coin") {
        this.jevCoins += event.value;
      }
      if (event.type === "player_revived" && event.by === "p2") this.jevRevives++;
    }
    this.samples++;
    if (fallback) this.fallbackTicks++;
    const { p1, p2 } = world.players;
    this.distanceSum += Math.hypot(p1.pos.x - p2.pos.x, p1.pos.y - p2.pos.y);
    this.progress = Math.max(this.progress, p2.pos.x - this.startX);
  }

  decision(latencyMs: number): void {
    if (!Number.isFinite(latencyMs) || latencyMs < 0) return;
    this.decisions++;
    this.latencySum += latencyMs;
  }

  result(
    world: Readonly<WorldState>,
    replay: Readonly<HumanReplay>,
    companion: "JEV" | "MOCK_AI",
  ): ComparisonResult {
    return {
      directive: world.directive,
      seed: replay.seed,
      levelId: replay.levelId,
      companion,
      recordedTicks: replay.actions.length,
      ticksPlayed: world.tick,
      status: world.status === "playing" ? "recording_ended" : world.status,
      elapsedMs: world.elapsedMs,
      teamScore: world.score,
      teamCoins: world.coins,
      teamKills: this.teamKills,
      teamDamageTaken: world.players.p1.damageTaken + world.players.p2.damageTaken,
      jevCoins: this.jevCoins,
      jevRevives: this.jevRevives,
      jevProgressPx: this.progress,
      averageTeammateDistancePx: this.samples ? this.distanceSum / this.samples : 0,
      decisions: this.decisions,
      averageLatencyMs: this.decisions ? this.latencySum / this.decisions : null,
      fallbackTicks: this.fallbackTicks,
    };
  }
}
