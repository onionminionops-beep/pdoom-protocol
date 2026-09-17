import { TILE } from "@/game/config/movement";
import type { WorldState } from "@/game/sim/types";

export const VIEW_WIDTH = 960;
export const VIEW_HEIGHT = 540;

export function fitCamera(world: WorldState) {
  const active = Object.values(world.players).filter((p) => world.slots[p.id] !== "DISABLED" && p.alive);
  const players = active.length ? active : [world.players.p1];
  const minX = Math.min(...players.map((p) => p.pos.x));
  const maxX = Math.max(...players.map((p) => p.pos.x));
  const minY = Math.min(...players.map((p) => p.pos.y));
  const maxY = Math.max(...players.map((p) => p.pos.y));
  const factor = Math.max(1, Math.ceil((maxX - minX + 160) / VIEW_WIDTH), Math.ceil((maxY - minY + 160) / VIEW_HEIGHT));
  const width = VIEW_WIDTH * factor;
  const height = VIEW_HEIGHT * factor;
  const levelWidth = world.level.widthTiles * TILE;
  const levelHeight = world.level.heightTiles * TILE;
  const clamp = (center: number, extent: number, level: number) =>
    extent > level ? (level - extent) / 2 : Math.max(0, Math.min(level - extent, center - extent / 2));
  return {
    width,
    height,
    factor,
    x: Math.round(clamp((minX + maxX) / 2, width, levelWidth)),
    y: Math.round(clamp((minY + maxY) / 2, height, levelHeight)),
  };
}
