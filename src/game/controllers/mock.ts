import type { PlayerInputV1 } from "../contracts/input";
import { buildObservation } from "../observation/build";
import type { GameObservationV1 } from "../contracts/observation";
import type { ControllerContext, PlayerController } from "./types";

/**
 * Offline stand-in for JEV. It consumes ONLY the same GameObservationV1 that is
 * sent to TypeSafe and emits ONLY PlayerInputV1, so it has no privileged
 * access. It is intentionally imperfect: it shoots when an enemy is roughly
 * ahead in its facing direction, jumps at ledges, and follows the directive
 * loosely. It can and does miss.
 */
export class MockAIController implements PlayerController {
  readonly kind = "MOCK_AI" as const;
  private current: PlayerInputV1 | null = null;
  private holdUntilTick = 0;
  private stuckTicks = 0;
  private lastX = 0;

  update(ctx: ControllerContext): PlayerInputV1 {
    if (this.current && ctx.tick < this.holdUntilTick && this.current.episodeId === ctx.episodeId) {
      return { ...this.current, basedOnTick: ctx.tick };
    }
    const obs = buildObservation(ctx.world, ctx.playerId, ctx.nowMs);
    const input = this.decide(obs, ctx);
    this.current = input;
    this.holdUntilTick = ctx.tick + Math.round(input.holdForMs / (1000 / 60));
    return input;
  }

  private decide(obs: GameObservationV1, ctx: ControllerContext): PlayerInputV1 {
    const self = obs.self;
    const facingSign = self.facing === "right" ? 1 : -1;
    let horizontal: PlayerInputV1["horizontal"] = "right";
    let verticalAction: PlayerInputV1["verticalAction"] =
      self.jumpHeld && !self.grounded && self.velocity.y < 0 ? "jump" : "none";
    let shoot = false;
    let dash = false;
    let interact = false;

    // stuck detection via absolute x
    if (Math.abs(self.position.x - this.lastX) < 0.5) this.stuckTicks++;
    else this.stuckTicks = 0;
    this.lastX = self.position.x;

    const nearest = obs.enemies[0];
    const threatAhead = obs.enemies.find((e) => Math.sign(e.relativePosition.x) === facingSign && Math.abs(e.relativePosition.y) < 60 && Math.abs(e.relativePosition.x) < 340);
    const threatBehind = obs.enemies.find((e) => Math.sign(e.relativePosition.x) === -facingSign && Math.abs(e.relativePosition.y) < 60 && Math.abs(e.relativePosition.x) < 200);

    // Directive-flavoured goal choice (all via observation only)
    const wantCoins = obs.directive.id === "COLLECTOR";
    const wantKills = obs.directive.id === "SCORE_HUNTER";
    const guardian = obs.directive.id === "GUARDIAN";
    const coin = obs.pickups.find((p) => p.type === "coin");
    const teammate = obs.teammate;

    if (guardian && teammate && teammate.downed) {
      horizontal = teammate.relativePosition.x < -8 ? "left" : teammate.relativePosition.x > 8 ? "right" : "neutral";
      if (Math.abs(teammate.relativePosition.x) < 30 && Math.abs(teammate.relativePosition.y) < 40) interact = true;
    } else if (guardian && teammate && Math.abs(teammate.relativePosition.x) > 160) {
      horizontal = teammate.relativePosition.x < 0 ? "left" : "right";
    } else if (wantCoins && coin && Math.abs(coin.relativePosition.x) < 260) {
      horizontal = coin.relativePosition.x < -6 ? "left" : coin.relativePosition.x > 6 ? "right" : "neutral";
      if (coin.relativePosition.y < -40 && self.grounded) verticalAction = "jump";
    } else if (wantKills && nearest && Math.abs(nearest.relativePosition.y) < 80) {
      horizontal = nearest.relativePosition.x < -140 ? "left" : nearest.relativePosition.x > 140 ? "right" : "neutral";
    } else if (threatBehind && !threatAhead) {
      // turn to face it
      horizontal = threatBehind.relativePosition.x < 0 ? "left" : "right";
    } else if (threatAhead && Math.abs(threatAhead.relativePosition.x) < 120 && obs.directive.id !== "SPEEDRUNNER") {
      horizontal = "neutral";
    }

    if (threatAhead && self.canShoot) shoot = true;
    // Heuristic misfire: occasionally shoot at a threat on a different level (misses).
    if (!threatAhead && nearest && Math.sign(nearest.relativePosition.x) === facingSign && Math.abs(nearest.relativePosition.x) < 200 && ctx.tick % 90 < 6) shoot = true;

    // Terrain: jump for gaps/walls and dodge close projectiles
    const t = obs.terrain;
    const movingDir = horizontal === "left" ? -1 : horizontal === "right" ? 1 : 0;
    if (movingDir !== 0) {
      const wall = movingDir === 1 ? t.rightWallDistance : t.leftWallDistance;
      const unsafe = movingDir === 1 ? !t.safeLandingRight : !t.safeLandingLeft;
      if ((wall !== null && wall < 28) || unsafe) {
        if (self.grounded) verticalAction = "jump";
      }
    }
    if (this.stuckTicks > 45 && self.grounded) verticalAction = "jump";
    if (this.stuckTicks > 120) horizontal = horizontal === "right" ? "left" : "right";

    const incoming = obs.hostileProjectiles.find((p) => Math.abs(p.relativePosition.x) < 90 && Math.abs(p.relativePosition.y) < 30 && p.approaching);
    if (incoming && self.grounded) verticalAction = verticalAction === "none" ? "jump" : verticalAction;
    if (incoming && self.canDash && ctx.tick % 2 === 0) dash = true;

    if (obs.interactables.some((i) => i.type !== "exit" && Math.abs(i.relativePosition.x) < 30 && Math.abs(i.relativePosition.y) < 40 && !i.activated)) interact = true;
    if (obs.interactables.some((i) => i.type === "exit" && Math.abs(i.relativePosition.x) < 30 && Math.abs(i.relativePosition.y) < 40)) interact = true;

    return {
      schemaVersion: "1.0",
      episodeId: ctx.episodeId,
      basedOnTick: ctx.tick,
      horizontal,
      verticalAction,
      shoot,
      dash,
      interact,
      holdForMs: 150,
    };
  }

  dispose(): void {}
}
