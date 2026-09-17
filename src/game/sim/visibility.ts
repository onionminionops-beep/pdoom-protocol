import { TILE } from "../config/movement";
import type { LevelData, RoomDef, Vec2 } from "./types";

export const VISIBLE_HALF_WIDTH = 480;
export const VISIBLE_HALF_HEIGHT = 270;

export function roomAt(level: LevelData, pos: Vec2): RoomDef | undefined {
  return level.rooms.find(
    ({ bounds: [x0, y0, x1, y1] }) =>
      pos.x >= x0 * TILE && pos.x < x1 * TILE && pos.y >= y0 * TILE && pos.y < y1 * TILE,
  );
}

export function visibleFrom(level: LevelData, observer: Vec2, target: Vec2): boolean {
  const room = roomAt(level, observer);
  return (
    room !== undefined &&
    roomAt(level, target)?.id === room.id &&
    Math.abs(target.x - observer.x) <= VISIBLE_HALF_WIDTH &&
    Math.abs(target.y - observer.y) <= VISIBLE_HALF_HEIGHT
  );
}
