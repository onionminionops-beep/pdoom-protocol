import { MOVEMENT, TILE } from "../config/movement";
import { WEAPONS } from "../config/weapons";
import { DIRECTIVES } from "../contracts/directives";
import {
  GameObservationV1Schema,
  OBSERVATION_LIMITS,
  type GameObservationV1,
  type ObservedEnemy,
  type ObservedProjectile,
} from "../contracts/observation";
import {
  distanceToCeiling,
  distanceToGround,
  distanceToWall,
  horizontalLineClear,
  tileAt,
} from "../sim/physics";
import { otherPlayerId } from "../sim/player";
import type { EnemyState, PlayerId, PlayerState, ProjectileState, WorldState } from "../sim/types";
import { INTERACT_RANGE_PX, REVIVE_RANGE_PX } from "../sim/step";
import { roomAt } from "../sim/visibility";
import { cameraContains, fitCamera } from "../view/camera";

const HAZARD_CHECK_MAX = 400;

/**
 * Builds the observation JEV (or the mock) receives. Only facts a player
 * could plausibly perceive: relative positions, coarse geometry, visible
 * enemy state. No rendering info, no human input, no future state.
 * Deterministic: same world => same observation (timestamp aside).
 */
export function buildObservation(
  world: Readonly<WorldState>,
  selfId: PlayerId,
  timestampMs: number,
): GameObservationV1 {
  const self = world.players[selfId];
  const mate = world.players[otherPlayerId(selfId)];
  const mateDisabled = world.slots[otherPlayerId(selfId)] === "DISABLED";
  const level = world.level;
  const room = roomAt(level, self.pos) ?? level.rooms[0];
  const weapon = WEAPONS[self.weapon];
  const hh = MOVEMENT.bodyHeight / 2;
  const hw = MOVEMENT.bodyWidth / 2;
  const camera = fitCamera(world);

  const rel = (p: { x: number; y: number }) => ({ x: p.x - self.pos.x, y: p.y - self.pos.y });

  // ---- terrain
  const groundBelowD = distanceToGround(level, self.pos.x, self.pos.y + hh, 600);
  const ceilingD = distanceToCeiling(level, self.pos.x, self.pos.y - hh, 300);
  const leftWallScanPx = Math.max(0, Math.min(self.pos.x - hw - camera.x, self.pos.x - hw - 1));
  const rightWallScanPx = Math.max(
    0,
    Math.min(
      camera.x + camera.width - (self.pos.x + hw),
      level.widthTiles * TILE - self.pos.x - hw - 1,
    ),
  );
  const leftWall = distanceToWall(level, self.pos.x - hw, self.pos.y, -1, leftWallScanPx);
  const rightWall = distanceToWall(level, self.pos.x + hw, self.pos.y, 1, rightWallScanPx);
  const safeLandingLeft = landingSafe(world, self.pos.x - TILE * 1.5, self.pos.y + hh);
  const safeLandingRight = landingSafe(world, self.pos.x + TILE * 1.5, self.pos.y + hh);
  const nearLeftEdge = self.grounded && !hasGroundAt(world, self.pos.x - hw - 4, self.pos.y + hh);
  const nearRightEdge = self.grounded && !hasGroundAt(world, self.pos.x + hw + 4, self.pos.y + hh);
  const jumpWouldReachPlatform = platformReachableAbove(world, self);
  const dropIsSafe =
    self.onOneWayPlatform && landingSafe(world, self.pos.x, self.pos.y + hh + TILE);

  // ---- enemies
  const enemies: ObservedEnemy[] = world.enemies
    .filter(
      (e) =>
        e.roomId === room.id &&
        e.health > 0 &&
        e.phase !== "dying" &&
        cameraContains(camera, e.pos),
    )
    .map((e) => describeEnemy(world, self, e, weapon.rangePx))
    .filter((e) => e.distance < 900)
    .sort(
      (a, b) =>
        (a.estimatedTimeToContactMs ?? Infinity) - (b.estimatedTimeToContactMs ?? Infinity) ||
        a.distance - b.distance ||
        a.id.localeCompare(b.id),
    )
    .slice(0, OBSERVATION_LIMITS.enemies);

  // ---- projectiles
  const hostileProjectiles: ObservedProjectile[] = world.projectiles
    .filter((p) => p.ownerKind === "enemy" && cameraContains(camera, p.pos))
    .map((p) => describeProjectile(self, p))
    .filter((p) => Math.hypot(p.relativePosition.x, p.relativePosition.y) < 520)
    .sort((a, b) => {
      const ta = a.estimatedTimeToClosestApproachMs ?? 1e9;
      const tb = b.estimatedTimeToClosestApproachMs ?? 1e9;
      if (a.approaching !== b.approaching) return a.approaching ? -1 : 1;
      return (
        ta - tb ||
        Math.hypot(a.relativePosition.x, a.relativePosition.y) -
          Math.hypot(b.relativePosition.x, b.relativePosition.y) ||
        a.id.localeCompare(b.id)
      );
    })
    .slice(0, OBSERVATION_LIMITS.hostileProjectiles);

  // ---- pickups
  const pickups = world.pickups
    .filter((p) => p.roomId === room.id && !p.collected && cameraContains(camera, p.pos))
    .map((p) => {
      const r = rel(p.pos);
      return {
        id: p.id,
        type: p.type,
        value: p.value,
        relativePosition: r,
        distance: Math.hypot(r.x, r.y),
        pathAppearsSafe:
          horizontalLineClear(level, self.pos.x, p.pos.x, self.pos.y) &&
          !hazardBetween(world, self.pos.x, p.pos.x, self.pos.y + hh),
      };
    })
    .filter((p) => p.distance < 700)
    .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id))
    .slice(0, OBSERVATION_LIMITS.pickups);

  // ---- interactables
  const interactables = world.interactables
    .filter((it) => !(it.type === "weapon_crate" && it.activated))
    .filter(
      (it) =>
        it.roomId === room.id &&
        (!it.requiredPlayer || it.requiredPlayer === selfId) &&
        cameraContains(camera, it.pos),
    )
    .map((it) => {
      const r = rel(it.pos);
      return {
        id: it.id,
        type: it.type,
        relativePosition: r,
        inRange:
          Math.abs(r.x) < it.w / 2 + INTERACT_RANGE_PX / 2 + hw &&
          Math.abs(r.y) < it.h / 2 + INTERACT_RANGE_PX / 2 + hh,
        activated: it.activated,
        distance: Math.hypot(r.x, r.y),
      };
    })
    .filter((it) => it.distance < 900)
    .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id))
    .slice(0, OBSERVATION_LIMITS.interactables)
    .map((it) => ({
      id: it.id,
      type: it.type,
      relativePosition: it.relativePosition,
      inRange: it.inRange,
      activated: it.activated,
    }));

  // ---- teammate
  const mateRel = rel(mate.pos);
  const mateNearEnemies = world.enemies.filter(
    (e) => e.health > 0 && Math.hypot(e.pos.x - mate.pos.x, e.pos.y - mate.pos.y) < 120,
  ).length;
  const mateDanger =
    world.projectiles.some(
      (p) => p.ownerKind === "enemy" && Math.hypot(p.pos.x - mate.pos.x, p.pos.y - mate.pos.y) < 90,
    ) || mateNearEnemies >= 1;
  const mateNeedsRevive = !mateDisabled && mate.alive && mate.downed;
  const mateInReviveRange = Math.hypot(mateRel.x, mateRel.y) < REVIVE_RANGE_PX + MOVEMENT.bodyWidth;

  // ---- tactical
  const imminent = hostileProjectiles.filter(
    (p) => p.approaching && (p.estimatedTimeToClosestApproachMs ?? 1e9) < 700,
  ).length;
  const closeEnemies = enemies.filter((e) => e.distance < 140).length;
  const dangerLevel =
    self.health <= 25 && (closeEnemies > 0 || imminent > 0)
      ? "critical"
      : closeEnemies >= 2 || imminent >= 2
        ? "high"
        : closeEnemies === 1 || imminent === 1
          ? "medium"
          : "low";
  const clearShotLeft = enemies.some(
    (e) => e.horizontalSide === "left" && e.lineOfFireClear && e.verticalAlignment === "aligned",
  );
  const clearShotRight = enemies.some(
    (e) => e.horizontalSide === "right" && e.lineOfFireClear && e.verticalAlignment === "aligned",
  );

  const anyInteractInRange =
    interactables.some((i) => i.inRange && !i.activated) || (mateNeedsRevive && mateInReviveRange);
  const directive = DIRECTIVES[world.directive];

  const obs: GameObservationV1 = {
    schemaVersion: "1.0",
    episodeId: world.episodeId,
    tick: world.tick,
    timestampMs,
    rules: {
      units: "distance px; velocity px/s; time ms; tile 32 px",
      coordinates: "+x right, +y down; course left-to-right; relative positions use self center",
      movement: {
        bodyWidthPx: MOVEMENT.bodyWidth,
        bodyHeightPx: MOVEMENT.bodyHeight,
        runSpeedPxPerS: MOVEMENT.runSpeed,
      },
      jump: {
        jumpVelocityPxPerS: MOVEMENT.jumpVelocity,
        gravityPxPerS2: MOVEMENT.gravity,
        maxRisePx: Math.round(
          (MOVEMENT.jumpVelocity * MOVEMENT.jumpVelocity) / (2 * MOVEMENT.gravity),
        ),
        approximateSameHeightReachPx: Math.round(
          (MOVEMENT.runSpeed * (2 * Math.abs(MOVEMENT.jumpVelocity))) / MOVEMENT.gravity,
        ),
        approximateFullHoldMs: Math.ceil(
          (Math.abs(MOVEMENT.jumpVelocity) / MOVEMENT.gravity) * 1000,
        ),
        minimumHoldMs: MOVEMENT.jumpMinHoldMs,
      },
      dash: {
        speedPxPerS: MOVEMENT.dashSpeed,
        durationMs: MOVEMENT.dashDurationMs,
        cooldownMs: MOVEMENT.dashCooldownMs,
      },
      weapon: {
        rangePx: weapon.rangePx,
        fireCooldownMs: weapon.fireCooldownMs,
        blastRadiusPx: weapon.blastRadius,
        firing: "horizontal along facing",
      },
      interaction: {
        interactRangePx: INTERACT_RANGE_PX,
        reviveRangePx: REVIVE_RANGE_PX,
        reviveHoldMs: MOVEMENT.reviveHoldMs,
        reviveHealthFraction: MOVEMENT.reviveHealthFraction,
      },
    },
    directive: { id: directive.id, description: directive.description },
    objective: { type: room.objectiveType, description: room.objectiveText },
    self: {
      id: self.id,
      character: "jev",
      position: { x: self.pos.x, y: self.pos.y },
      velocity: { x: self.vel.x, y: self.vel.y },
      facing: self.facing,
      grounded: self.grounded,
      onOneWayPlatform: self.onOneWayPlatform,
      nearLeftEdge,
      nearRightEdge,
      health: self.health,
      maxHealth: MOVEMENT.maxHealth,
      alive: self.alive,
      downed: self.downed,
      weapon: self.weapon,
      ammunition: self.ammo[self.weapon],
      canShoot:
        self.alive &&
        !self.downed &&
        self.fireCooldownMs <= 0 &&
        self.dashTimeMs <= 0 &&
        (self.ammo[self.weapon] ?? 1) > 0,
      canJump: self.alive && !self.downed && (self.grounded || self.coyoteMs > 0),
      jumpHeld: self.jumpHeld,
      canDash: self.alive && !self.downed && self.dashCooldownMs <= 0 && self.dashTimeMs <= 0,
      dashCooldownMs: self.dashCooldownMs,
      canInteract: anyInteractInRange,
    },
    teammate: {
      id: mate.id,
      character: "user",
      relativePosition: mateRel,
      velocity: { x: mate.vel.x, y: mate.vel.y },
      healthFraction: mateDisabled ? 0 : mate.health / MOVEMENT.maxHealth,
      alive: !mateDisabled && mate.alive,
      downed: mateNeedsRevive,
      surrounded: mateNearEnemies >= 2,
      imminentDanger: !mateDisabled && mateDanger,
    },
    terrain: {
      groundDistanceBelow: groundBelowD,
      ceilingDistanceAbove: ceilingD,
      leftWallDistance: leftWall,
      rightWallDistance: rightWall,
      safeLandingLeft,
      safeLandingRight,
      jumpWouldReachPlatform,
      dropIsSafe,
      leftWallScan: leftWallScanPx,
      rightWallScan: rightWallScanPx,
      platforms: describePlatforms(world, self, camera),
      nextObstruction: describeNextObstruction(world, self, camera, leftWall, rightWall),
    },
    progression: describeProgression(world, self, room, camera),
    enemies,
    hostileProjectiles,
    pickups,
    interactables,
    tactical: {
      dangerLevel,
      enemyCount: enemies.length,
      imminentProjectileCount: imminent,
      clearShotExistsLeft: clearShotLeft,
      clearShotExistsRight: clearShotRight,
      teammateNeedsRevive: mateNeedsRevive,
    },
    game: {
      levelId: level.id,
      roomId: room.id,
      score: world.score,
      coins: world.coins,
      scoreBreakdown: { ...world.breakdown },
      elapsedMs: world.elapsedMs,
      status: world.status,
    },
  };
  return GameObservationV1Schema.parse(obs);
}

function describePlatforms(
  world: Readonly<WorldState>,
  self: PlayerState,
  camera: ReturnType<typeof fitCamera>,
): Array<{
  id: string;
  relativeLeftX: number;
  relativeRightX: number;
  relativeTopY: number;
  surface: "solid" | "oneway";
  horizontalGapPx: number;
  reachableByJumpEstimate: boolean;
}> {
  const minTx = Math.max(0, Math.floor(camera.x / TILE));
  const maxTx = Math.min(
    world.level.widthTiles - 1,
    Math.ceil((camera.x + camera.width) / TILE) - 1,
  );
  const minTy = Math.max(1, Math.floor(camera.y / TILE));
  const maxTy = Math.min(
    world.level.heightTiles - 1,
    Math.ceil((camera.y + camera.height) / TILE) - 1,
  );
  const platforms: Array<{
    id: string;
    relativeLeftX: number;
    relativeRightX: number;
    relativeTopY: number;
    surface: "solid" | "oneway";
    horizontalGapPx: number;
    reachableByJumpEstimate: boolean;
  }> = [];
  for (let ty = minTy; ty <= maxTy; ty++) {
    let start = -1;
    let surface: "solid" | "oneway" | null = null;
    for (let tx = minTx; tx <= maxTx + 1; tx++) {
      const kind = tx <= maxTx ? tileAt(world.level, tx, ty) : "empty";
      const top = kind === "solid" || kind === "oneway";
      const exposed = top && tileAt(world.level, tx, ty - 1) === "empty";
      if (exposed && (surface === null || kind === surface)) {
        if (start < 0) start = tx;
        surface = kind;
      } else {
        if (start >= 0 && surface) addPlatform(start, tx, ty, surface);
        start = -1;
        surface = null;
        if (exposed) {
          start = tx;
          surface = kind;
        }
      }
    }
  }
  return platforms
    .sort(
      (a, b) =>
        Number(b.reachableByJumpEstimate) - Number(a.reachableByJumpEstimate) ||
        a.horizontalGapPx - b.horizontalGapPx ||
        Math.abs(a.relativeTopY) - Math.abs(b.relativeTopY) ||
        Math.abs(a.relativeLeftX + a.relativeRightX) -
          Math.abs(b.relativeLeftX + b.relativeRightX) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 2);

  function addPlatform(start: number, end: number, ty: number, surface: "solid" | "oneway"): void {
    const widthPx = (end - start) * TILE;
    if (widthPx < MOVEMENT.bodyWidth) return;
    const leftX = start * TILE;
    const rightX = end * TILE;
    const topY = ty * TILE;
    const maxRise = (MOVEMENT.jumpVelocity * MOVEMENT.jumpVelocity) / (2 * MOVEMENT.gravity);
    const sameHeightReach =
      (MOVEMENT.runSpeed * (2 * Math.abs(MOVEMENT.jumpVelocity))) / MOVEMENT.gravity;
    const bodyLeft = self.pos.x - MOVEMENT.bodyWidth / 2;
    const bodyRight = self.pos.x + MOVEMENT.bodyWidth / 2;
    const horizontalGapPx = Math.max(0, Math.max(bodyLeft - rightX, leftX - bodyRight));
    const nearestEdgeDistance = Math.min(Math.abs(leftX - bodyRight), Math.abs(rightX - bodyLeft));
    platforms.push({
      id: `platform-${start}-${ty}`,
      relativeLeftX: leftX - self.pos.x,
      relativeRightX: rightX - self.pos.x,
      relativeTopY: topY - self.pos.y,
      surface,
      reachableByJumpEstimate:
        self.pos.y + MOVEMENT.bodyHeight / 2 - topY >= 0 &&
        self.pos.y + MOVEMENT.bodyHeight / 2 - topY <= maxRise &&
        (horizontalGapPx <= sameHeightReach || nearestEdgeDistance <= MOVEMENT.bodyWidth),
      horizontalGapPx,
    });
  }
}

function describeNextObstruction(
  world: Readonly<WorldState>,
  self: PlayerState,
  camera: ReturnType<typeof fitCamera>,
  leftWall: number | null,
  rightWall: number | null,
): {
  side: "left" | "right";
  distancePx: number;
  type: "wall" | "closed_gate";
} | null {
  const candidates: Array<{
    side: "left" | "right";
    distancePx: number;
    type: "wall" | "closed_gate";
  }> = [
    self.facing !== "left" || leftWall === null
      ? null
      : { side: "left" as const, distancePx: leftWall, type: "wall" as const },
    self.facing !== "right" || rightWall === null
      ? null
      : { side: "right" as const, distancePx: rightWall, type: "wall" as const },
  ].filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);
  const room = roomAt(world.level, self.pos) ?? world.level.rooms[0];
  const gateX = room?.gateTileX;
  if (gateX !== null && gateX !== undefined && !world.openedGates[room.id]) {
    const gateIsRight = gateX * TILE >= self.pos.x;
    const gateDistance = gateIsRight
      ? gateX * TILE - (self.pos.x + MOVEMENT.bodyWidth / 2)
      : self.pos.x - MOVEMENT.bodyWidth / 2 - (gateX + 1) * TILE;
    if (
      gateDistance >= 0 &&
      gateDistance <= (gateIsRight ? camera.x + camera.width - self.pos.x : self.pos.x - camera.x)
    ) {
      candidates.push({
        side: gateIsRight ? "right" : "left",
        distancePx: Math.max(0, gateDistance),
        type: "closed_gate",
      });
    }
  }
  if (candidates.length === 0) return null;
  const nearest = candidates.sort((a, b) => a.distancePx - b.distancePx)[0];
  return nearest;
}

function describeProgression(
  world: Readonly<WorldState>,
  self: PlayerState,
  room: NonNullable<ReturnType<typeof roomAt>>,
  camera: ReturnType<typeof fitCamera>,
) {
  const roomIndex = Math.max(
    0,
    world.level.rooms.findIndex((candidate) => candidate.id === room.id),
  );
  const visibleRemainingEnemies = world.enemies.filter(
    (enemy) =>
      enemy.roomId === room.id &&
      enemy.health > 0 &&
      enemy.phase !== "dying" &&
      cameraContains(camera, enemy.pos),
  ).length;
  const visibleUnactivatedSwitches = world.interactables.filter(
    (interactable) =>
      interactable.type === "switch" &&
      interactable.roomId === room.id &&
      !interactable.activated &&
      cameraContains(camera, interactable.pos),
  ).length;
  const gate =
    room.gateTileX === null
      ? null
      : {
          present: true,
          open: Boolean(world.openedGates[room.id]),
          distancePx: Math.abs((room.gateTileX + 0.5) * TILE - self.pos.x),
          unlockCondition: room.gateOnEnemies
            ? ("clear enemies" as const)
            : ("activate switches" as const),
          visibleRemainingEnemies,
          visibleUnactivatedSwitches,
        };
  const blockedReason =
    world.openedGates[room.id] || room.gateTileX === null
      ? null
      : room.gateOnEnemies
        ? visibleRemainingEnemies > 0
          ? `Clear ${visibleRemainingEnemies} visible room enem${
              visibleRemainingEnemies === 1 ? "y" : "ies"
            }; hidden room state is unknown.`
          : "Gate closed; clear enemies; visible remainder is unknown."
        : visibleUnactivatedSwitches > 0
          ? `Activate the ${visibleUnactivatedSwitches} visible unactivated switch${
              visibleUnactivatedSwitches === 1 ? "" : "es"
            }; other switch state is unknown.`
          : "Gate closed; activate switches; visible remainder is unknown.";
  return {
    roomId: room.id,
    roomIndex,
    objectiveStatus: blockedReason ? ("blocked" as const) : ("active" as const),
    blockedReason,
    gate,
  };
}

function describeEnemy(
  world: Readonly<WorldState>,
  self: PlayerState,
  e: EnemyState,
  weaponRange: number,
): ObservedEnemy {
  const r = { x: e.pos.x - self.pos.x, y: e.pos.y - self.pos.y };
  const distance = Math.hypot(r.x, r.y);
  const halfSum = MOVEMENT.bodyWidth / 2 + e.w / 2;
  const horizontalSide = Math.abs(r.x) < halfSum ? "overlapping" : r.x < 0 ? "left" : "right";
  const dy = r.y;
  const aligned = Math.abs(dy + 4) < e.h / 2 + WEAPONS[self.weapon].projectileRadius;
  const verticalAlignment = aligned
    ? "aligned"
    : dy < 0
      ? dy > -80
        ? "slightly_above"
        : "far_above"
      : dy < 80
        ? "slightly_below"
        : "far_below";
  const lineOfFireClear = horizontalLineClear(world.level, self.pos.x, e.pos.x, self.pos.y - 4);
  const facingSelf = (e.facing === "right" && r.x < 0) || (e.facing === "left" && r.x > 0);
  const relVel = { x: e.vel.x - self.vel.x, y: e.vel.y - self.vel.y };
  const closingSpeed = -(r.x * relVel.x + r.y * relVel.y) / Math.max(1, distance);
  const estimatedTimeToContactMs =
    closingSpeed > 5 ? Math.max(0, Math.round(((distance - halfSum) / closingSpeed) * 1000)) : null;
  return {
    id: e.id,
    type: e.type,
    relativePosition: r,
    relativeVelocity: relVel,
    horizontalSide,
    distance,
    verticalAlignment,
    lineOfFireClear,
    withinWeaponRange: Math.abs(r.x) <= weaponRange && aligned,
    facingSelf,
    healthFraction: e.health / e.maxHealth,
    attacking: e.phase === "attack",
    telegraphing: e.phase === "telegraph",
    estimatedTimeToContactMs,
  };
}

function describeProjectile(self: PlayerState, p: ProjectileState): ObservedProjectile {
  const r = { x: p.pos.x - self.pos.x, y: p.pos.y - self.pos.y };
  const relVel = { x: p.vel.x - self.vel.x, y: p.vel.y - self.vel.y };
  const v2 = relVel.x * relVel.x + relVel.y * relVel.y;
  let tClosest: number | null = null;
  let miss: number | null = null;
  if (v2 > 1) {
    const t = -(r.x * relVel.x + r.y * relVel.y) / v2; // seconds
    if (t > 0) {
      tClosest = Math.round(t * 1000);
      const cx = r.x + relVel.x * t;
      const cy = r.y + relVel.y * t;
      miss = Math.hypot(cx, cy);
    }
  }
  const approaching = tClosest !== null && (miss ?? Infinity) < 48;
  const hh = MOVEMENT.bodyHeight / 2;
  return {
    id: p.id,
    relativePosition: r,
    relativeVelocity: relVel,
    approaching,
    estimatedTimeToClosestApproachMs: tClosest,
    estimatedMissDistance: miss,
    canJumpOver: r.y > -hh * 0.2 && Math.abs(p.vel.y) < 60 && self.grounded,
    canDropUnder: r.y < -hh * 0.6 && self.onOneWayPlatform,
  };
}

function hasGroundAt(world: Readonly<WorldState>, x: number, yBottom: number): boolean {
  const d = distanceToGround(world.level, x, yBottom, 8);
  return d !== null;
}

function landingSafe(world: Readonly<WorldState>, x: number, yBottom: number): boolean {
  const tx = Math.floor(x / TILE);
  const ty0 = Math.floor(yBottom / TILE);
  for (let ty = ty0; ty * TILE <= yBottom + HAZARD_CHECK_MAX; ty++) {
    const k = tileAt(world.level, tx, ty);
    if (k === "hazard") return false;
    if (k === "solid" || k === "oneway") return true;
    if (ty >= world.level.heightTiles) return false;
  }
  return false;
}

function hazardBetween(
  world: Readonly<WorldState>,
  x0: number,
  x1: number,
  yBottom: number,
): boolean {
  const a = Math.floor(Math.min(x0, x1) / TILE);
  const b = Math.floor(Math.max(x0, x1) / TILE);
  const ty = Math.floor((yBottom + 1) / TILE);
  for (let tx = a; tx <= b; tx++) {
    if (tileAt(world.level, tx, ty) === "hazard") return true;
  }
  return false;
}

function platformReachableAbove(world: Readonly<WorldState>, self: PlayerState): boolean {
  // Max jump height h = v^2 / (2g)
  const h = (MOVEMENT.jumpVelocity * MOVEMENT.jumpVelocity) / (2 * MOVEMENT.gravity);
  const top = self.pos.y + MOVEMENT.bodyHeight / 2;
  for (const dx of [-TILE, 0, TILE]) {
    const tx = Math.floor((self.pos.x + dx) / TILE);
    for (let ty = Math.floor(top / TILE) - 1; ty >= Math.floor((top - h) / TILE); ty--) {
      const k = tileAt(world.level, tx, ty);
      if (k === "oneway" || k === "solid") {
        // must have headroom above the platform
        if (
          tileAt(world.level, tx, ty - 1) === "empty" &&
          tileAt(world.level, tx, ty - 2) === "empty"
        )
          return true;
        break;
      }
    }
  }
  return false;
}
