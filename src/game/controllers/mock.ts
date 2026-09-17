import { neutralInput, type PlayerInputV1 } from "../contracts/input";
import { buildObservation } from "../observation/build";
import type { GameObservationV1 } from "../contracts/observation";
import type { ControllerContext, PlayerController } from "./types";

export class MockAIController implements PlayerController {
  readonly kind = "MOCK_AI" as const;
  private current: PlayerInputV1 | null = null;
  private holdUntilTick = 0;
  private lastX = 0;
  private stuckDecisions = 0;
  private searchUntilTick = 0;
  private huntId: string | null = null;

  update(ctx: ControllerContext): PlayerInputV1 {
    if (this.current?.episodeId !== ctx.episodeId) {
      this.current = null;
      this.stuckDecisions = 0;
      this.searchUntilTick = 0;
      this.huntId = null;
    }
    if (this.current && ctx.tick < this.holdUntilTick) {
      return { ...this.current, basedOnTick: ctx.tick };
    }
    const input = this.decide(buildObservation(ctx.world, ctx.playerId, ctx.nowMs));
    this.current = input;
    this.holdUntilTick = ctx.tick + Math.round(input.holdForMs / (1000 / 60));
    return { ...input };
  }

  private decide(obs: GameObservationV1): PlayerInputV1 {
    const input = neutralInput(obs.episodeId, obs.tick);
    input.holdForMs = 150;
    const { self, terrain, teammate } = obs;
    if (!self.alive || self.downed) return input;
    if (Math.abs(self.position.x - this.lastX) < 3) this.stuckDecisions++;
    else this.stuckDecisions = 0;
    this.lastX = self.position.x;

    const speed = obs.directive.id === "SPEEDRUNNER";
    const guardian = obs.directive.id === "GUARDIAN";
    const collector = obs.directive.id === "COLLECTOR";
    const hunter = obs.directive.id === "SCORE_HUNTER" || obs.directive.id === "MONSTER_SLAYER";
    if (hunter) input.holdForMs = 100;
    const boss = obs.enemies.find((e) => e.type === "consensus_engine");
    const target = obs.enemies.find((e) => e.withinWeaponRange && e.lineOfFireClear);
    const sw = obs.interactables.find((i) => i.type === "switch" && !i.activated);
    const coin = obs.pickups.find((p) => p.type === "coin" && Math.abs(p.relativePosition.y) < 130);
    const health = obs.pickups.find((p) => p.type === "health" && self.health < 70);
    let dx = 200;
    let dy = 0;
    let fighting = false;
    if (this.stuckDecisions > 12 && obs.objective.type === "defeat_enemies" && !boss) {
      this.searchUntilTick = obs.tick + 480;
      this.stuckDecisions = 0;
    }
    if (obs.tick < this.searchUntilTick) dx = -200;

    if (guardian && teammate.alive) {
      dx = Math.abs(teammate.relativePosition.x) < 48 ? 0 : teammate.relativePosition.x;
      dy = teammate.relativePosition.y;
    } else if (collector && coin) {
      dx = coin.relativePosition.x;
      dy = coin.relativePosition.y;
    }
    if (health) {
      dx = health.relativePosition.x;
      dy = health.relativePosition.y;
    }
    if (this.huntId && !obs.enemies.some((e) => e.id === this.huntId)) this.huntId = null;
    if (this.stuckDecisions > 6 && obs.objective.type === "defeat_enemies")
      this.huntId ??= obs.enemies[0]?.id ?? null;
    const obstacle =
      obs.enemies.find((e) => e.id === this.huntId) ??
      obs.enemies.find((e) => e.relativePosition.y > -130 || terrain.jumpWouldReachPlatform);
    if (
      obstacle &&
      (hunter ||
        (obs.objective.type === "defeat_enemies" &&
          (this.huntId !== null || obs.tick < this.searchUntilTick)))
    ) {
      dx = obstacle.relativePosition.x;
      dy = obstacle.relativePosition.y;
    }
    if (target && (hunter || !speed || obs.objective.type === "defeat_enemies")) {
      dx = target.relativePosition.x;
      fighting = true;
      if (!boss && target.distance < 72) {
        dx = target.relativePosition.x < 0 ? 120 : -120;
        fighting = false;
      }
    }
    if (sw && (!boss || boss.healthFraction <= 0.33)) {
      dx = sw.relativePosition.x;
      dy = sw.relativePosition.y;
      fighting = false;
      input.interact = sw.inRange;
    }
    if (teammate.downed) {
      dx = teammate.relativePosition.x;
      dy = teammate.relativePosition.y;
      fighting = false;
      input.interact = Math.hypot(dx, dy) < 50;
    }
    const tooClose = obs.enemies.find(
      (e) =>
        e.type !== "consensus_engine" &&
        Math.abs(e.relativePosition.x) < 65 &&
        Math.abs(e.relativePosition.y) < 35,
    );
    if (tooClose && (hunter || collector) && !sw && !teammate.downed) {
      dx = tooClose.relativePosition.x < 0 ? 120 : -120;
      fighting = false;
    }
    input.horizontal = Math.abs(dx) < 12 ? "neutral" : dx < 0 ? "left" : "right";
    const desiredFacing = dx < 0 ? "left" : "right";
    if (fighting && Math.abs(dx) < 330 && self.facing === desiredFacing) {
      input.horizontal = "neutral";
    }

    input.shoot = obs.enemies.some(
      (e) =>
        Math.sign(e.relativePosition.x) === (self.facing === "right" ? 1 : -1) &&
        Math.abs(e.relativePosition.x) < 400 &&
        (hunter
          ? e.withinWeaponRange && e.lineOfFireClear
          : e.verticalAlignment === "aligned" || obs.tick % 90 < 9),
    );
    const wall = (dx < 0 ? terrain.leftWallDistance : terrain.rightWallDistance) ?? Infinity;
    const unsafe = dx < 0 ? !terrain.safeLandingLeft : !terrain.safeLandingRight;
    const risingGoal = dy < -24 && terrain.jumpWouldReachPlatform;
    if (self.jumpHeld && !self.grounded && self.velocity.y < 0) input.verticalAction = "jump";
    if (self.grounded && !fighting && (wall < 38 || unsafe || risingGoal)) {
      input.verticalAction = "jump";
    }
    if (
      self.grounded &&
      self.onOneWayPlatform &&
      dy > 50 &&
      Math.abs(dx) < 50 &&
      terrain.dropIsSafe
    ) {
      input.verticalAction = "drop";
    }
    if (
      this.stuckDecisions > 18 &&
      Math.abs(dx) > 12 &&
      self.grounded &&
      !fighting &&
      !input.interact
    )
      input.verticalAction = "jump";
    if (
      speed &&
      !fighting &&
      !sw &&
      !teammate.downed &&
      !health &&
      self.grounded &&
      wall > 150 &&
      !unsafe &&
      !terrain.jumpWouldReachPlatform &&
      self.canDash
    )
      input.dash = true;
    if (
      boss &&
      sw &&
      boss.healthFraction <= 0.33 &&
      boss.distance < 135 &&
      Math.sign(dx) === Math.sign(boss.relativePosition.x) &&
      self.canDash
    )
      input.dash = true;
    const incoming = obs.hostileProjectiles.find(
      (p) =>
        p.approaching && Math.abs(p.relativePosition.x) < 80 && Math.abs(p.relativePosition.y) < 28,
    );
    if (incoming && self.grounded && !input.interact) input.verticalAction = "jump";
    if (obs.interactables.some((i) => i.type === "exit" && i.inRange) && !boss)
      input.interact = true;
    return input;
  }

  dispose(): void {
    this.current = null;
  }
}
