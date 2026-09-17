import { TILE } from "../config/movement";
import type { AABB, LevelData, Vec2 } from "./types";

export type TileKind = "empty" | "solid" | "oneway" | "hazard";

export function tileAt(level: LevelData, tx: number, ty: number): TileKind {
  if (tx < 0 || tx >= level.widthTiles) return "solid";
  if (ty < 0) return "empty";
  if (ty >= level.heightTiles) return "solid";
  const c = level.rows[ty]?.[tx] ?? ".";
  if (c === "#" || c === "G") return "solid";
  if (c === "-") return "oneway";
  if (c === "H") return "hazard";
  return "empty";
}

export function isSolidAt(level: LevelData, px: number, py: number): boolean {
  return tileAt(level, Math.floor(px / TILE), Math.floor(py / TILE)) === "solid";
}

export interface MoveResult {
  pos: Vec2;
  vel: Vec2;
  hitGround: boolean;
  hitCeiling: boolean;
  hitWall: boolean;
  onOneWay: boolean;
  onHazard: boolean;
}

/**
 * Swept AABB vs tile grid. Horizontal then vertical resolution.
 * `ignoreOneWay` makes one-way platforms passable (used for drop-through).
 */
export function moveAABB(
  level: LevelData,
  box: AABB,
  vel: Vec2,
  dt: number,
  ignoreOneWay: boolean,
): MoveResult {
  let x = box.x;
  let y = box.y;
  let vx = vel.x;
  let vy = vel.y;
  const hw = box.w / 2;
  const hh = box.h / 2;
  let hitWall = false;
  let hitGround = false;
  let hitCeiling = false;
  let onOneWay = false;
  let onHazard = false;
  const eps = 0.01;

  // --- horizontal
  const dx = vx * dt;
  if (dx !== 0) {
    const nx = x + dx;
    const dir = dx > 0 ? 1 : -1;
    const edgeX = nx + dir * hw;
    const tx = Math.floor(edgeX / TILE);
    const ty0 = Math.floor((y - hh + eps) / TILE);
    const ty1 = Math.floor((y + hh - eps) / TILE);
    let blocked = false;
    for (let ty = ty0; ty <= ty1; ty++) {
      if (tileAt(level, tx, ty) === "solid") {
        blocked = true;
        break;
      }
    }
    if (blocked) {
      x = dir > 0 ? tx * TILE - hw - eps : (tx + 1) * TILE + hw + eps;
      vx = 0;
      hitWall = true;
    } else {
      x = nx;
    }
  }

  // --- vertical
  const dy = vy * dt;
  if (dy !== 0) {
    const ny = y + dy;
    const dir = dy > 0 ? 1 : -1;
    const edgeY = ny + dir * hh;
    const ty = Math.floor(edgeY / TILE);
    const tx0 = Math.floor((x - hw + eps) / TILE);
    const tx1 = Math.floor((x + hw - eps) / TILE);
    let blocked = false;
    let oneway = false;
    let hazard = false;
    for (let tx = tx0; tx <= tx1; tx++) {
      const k = tileAt(level, tx, ty);
      if (k === "solid") blocked = true;
      else if (k === "hazard" && dir > 0) {
        blocked = true;
        hazard = true;
      } else if (k === "oneway" && dir > 0 && !ignoreOneWay) {
        // Only land on a one-way platform if we were above its top edge before moving.
        const prevBottom = y + hh;
        const top = ty * TILE;
        if (prevBottom <= top + eps + Math.max(0, dy)) {
          if (prevBottom <= top + 1) {
            blocked = true;
            oneway = true;
          }
        }
      }
    }
    if (blocked) {
      y = dir > 0 ? ty * TILE - hh - eps : (ty + 1) * TILE + hh + eps;
      if (dir > 0) {
        hitGround = true;
        onOneWay = oneway;
        onHazard = hazard;
      } else hitCeiling = true;
      vy = 0;
    } else {
      y = ny;
    }
  }

  return { pos: { x, y }, vel: { x: vx, y: vy }, hitGround, hitCeiling, hitWall, onOneWay, onHazard };
}

/** Is there standing surface directly under this box (within `probe` px)? */
export function groundBelow(level: LevelData, box: AABB, probe: number, ignoreOneWay: boolean): { found: boolean; oneWay: boolean } {
  const hh = box.h / 2;
  const hw = box.w / 2;
  const bottom = box.y + hh;
  const ty = Math.floor((bottom + probe) / TILE);
  const tx0 = Math.floor((box.x - hw + 0.01) / TILE);
  const tx1 = Math.floor((box.x + hw - 0.01) / TILE);
  let oneWay = false;
  let found = false;
  for (let tx = tx0; tx <= tx1; tx++) {
    const k = tileAt(level, tx, ty);
    if (k === "solid" || k === "hazard") found = true;
    else if (k === "oneway" && !ignoreOneWay && bottom <= ty * TILE + 1) {
      found = true;
      oneWay = true;
    }
  }
  return { found, oneWay };
}

/** Distance (px) to the first solid/oneway tile below point, or null within maxPx. */
export function distanceToGround(level: LevelData, x: number, yBottom: number, maxPx: number): number | null {
  const tx = Math.floor(x / TILE);
  const ty0 = Math.floor(yBottom / TILE);
  for (let ty = ty0; ty * TILE <= yBottom + maxPx; ty++) {
    const k = tileAt(level, tx, ty);
    if (k === "solid" || k === "oneway" || k === "hazard") {
      return Math.max(0, ty * TILE - yBottom);
    }
  }
  return null;
}

export function distanceToCeiling(level: LevelData, x: number, yTop: number, maxPx: number): number | null {
  const tx = Math.floor(x / TILE);
  const ty0 = Math.floor(yTop / TILE);
  for (let ty = ty0; (ty + 1) * TILE >= yTop - maxPx && ty >= -1; ty--) {
    if (tileAt(level, tx, ty) === "solid") return Math.max(0, yTop - (ty + 1) * TILE);
  }
  return null;
}

export function distanceToWall(level: LevelData, xEdge: number, y: number, dir: 1 | -1, maxPx: number): number | null {
  const ty = Math.floor(y / TILE);
  let tx = Math.floor(xEdge / TILE);
  for (let i = 0; i <= Math.ceil(maxPx / TILE) + 1; i++) {
    if (tileAt(level, tx, ty) === "solid") {
      const edge = dir > 0 ? tx * TILE : (tx + 1) * TILE;
      const d = Math.abs(edge - xEdge);
      return d <= maxPx ? d : null;
    }
    tx += dir;
  }
  return null;
}

/** Bresenham-ish walk along a horizontal segment checking for solid tiles. */
export function horizontalLineClear(level: LevelData, x0: number, x1: number, y: number): boolean {
  const ty = Math.floor(y / TILE);
  const a = Math.floor(Math.min(x0, x1) / TILE);
  const b = Math.floor(Math.max(x0, x1) / TILE);
  for (let tx = a; tx <= b; tx++) {
    if (tileAt(level, tx, ty) === "solid") return false;
  }
  return true;
}

export function aabbOverlap(a: AABB, b: AABB): boolean {
  return (
    Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h
  );
}

export function circleAABBOverlap(cx: number, cy: number, r: number, b: AABB): boolean {
  const dx = Math.max(Math.abs(cx - b.x) - b.w / 2, 0);
  const dy = Math.max(Math.abs(cy - b.y) - b.h / 2, 0);
  return dx * dx + dy * dy <= r * r;
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
