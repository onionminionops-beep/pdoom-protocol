import type { LevelData } from "../sim/types";

/**
 * Consensus Heights — the vertical slice. 8 rooms, left to right.
 * Legend: '#' solid  '-' one-way platform  '.' empty  'H' hazard  'G' gate (opens when room cleared)
 * 18 rows tall (576 px), 240 tiles wide (7680 px).
 */

const W = 240;
const H = 18;

function blank(): string[][] {
  const g: string[][] = [];
  for (let y = 0; y < H; y++) g.push(new Array<string>(W).fill("."));
  return g;
}

function rect(g: string[][], x0: number, y0: number, x1: number, y1: number, c: string): void {
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) if (g[y] && x >= 0 && x < W) g[y][x] = c;
}

function hline(g: string[][], x0: number, x1: number, y: number, c: string): void {
  rect(g, x0, y, x1, y + 1, c);
}

function build(): string[] {
  const g = blank();
  // ground everywhere by default (rows 16-17), carved out for pits later
  rect(g, 0, 16, W, 18, "#");
  // left wall
  rect(g, 0, 0, 1, 18, "#");
  // ceiling strip
  hline(g, 0, W, 0, "#");

  // ---- Room 1: Tutorial Alley (0-30): a couple of steps and a one-way ledge
  rect(g, 12, 14, 16, 16, "#");
  hline(g, 20, 26, 12, "-");
  // gate at x=30 (opens immediately; tutorial has no enemies => gateOnEnemies false; no gate)

  // ---- Room 2: Comment Section (30-62): flat combat, low cover blocks
  rect(g, 38, 15, 40, 16, "#");
  rect(g, 50, 15, 52, 16, "#");
  hline(g, 44, 50, 12, "-");
  rect(g, 61, 1, 62, 16, "G");

  // ---- Room 3: Scaffolding (62-100): multi-level platforming, pit with hazard
  rect(g, 68, 16, 76, 18, "H"); // hazard pit
  rect(g, 66, 14, 69, 16, "#");
  rect(g, 69, 12, 72, 16, "#");
  rect(g, 72, 10, 76, 16, "#");
  hline(g, 79, 84, 9, "-");
  rect(g, 82, 14, 84, 16, "#");
  rect(g, 84, 12, 88, 16, "#");
  hline(g, 88, 92, 12, "-");
  hline(g, 90, 95, 10, "-");
  rect(g, 86, 16, 92, 18, "H");
  rect(g, 96, 13, 100, 16, "#");

  // ---- Room 4: Prediction Gallery (100-134): projectile dodging, elevated shooters
  rect(g, 106, 13, 110, 16, "#");
  rect(g, 118, 12, 122, 16, "#");
  rect(g, 116, 14, 118, 16, "#");
  rect(g, 122, 14, 124, 16, "#");
  hline(g, 110, 116, 11, "-");
  rect(g, 128, 14, 131, 16, "#");
  rect(g, 133, 1, 134, 16, "G");

  // ---- Room 5: The Armory Ledge (134-160): risky weapon pickup over hazard
  rect(g, 140, 16, 152, 18, "H");
  hline(g, 138, 141, 14, "-");
  hline(g, 140, 153, 14, "-");
  hline(g, 141, 144, 12, "-");
  rect(g, 145, 10, 148, 11, "#"); // crate platform
  hline(g, 149, 152, 12, "-");
  rect(g, 154, 14, 158, 16, "#");

  // ---- Room 6: Split Path (160-196): upper and lower routes, two switches
  hline(g, 161, 166, 14, "-");
  hline(g, 166, 171, 12, "-");
  hline(g, 171, 176, 10, "-");
  rect(g, 176, 9, 196, 10, "#");
  hline(g, 165, 169, 7, "-");
  rect(g, 175, 13, 178, 16, "#");
  rect(g, 184, 14, 187, 16, "#");
  rect(g, 186, 16, 190, 18, "H");
  hline(g, 185, 191, 13, "-");
  rect(g, 195, 1, 196, 16, "G");

  // ---- Room 7: Alignment Spire (196-222): vertical traversal
  for (let step = 0; step < 6; step++) {
    rect(g, 198 + step * 3, 14 - step * 2, 201 + step * 3, 16, "#");
  }
  rect(g, 214, 4, 222, 5, "#"); // top ledge into boss arena
  rect(g, 216, 5, 222, 16, "#"); // spire body (solid below ledge)
  rect(g, 197, 16, 216, 18, "#");

  // ---- Room 8: Consensus Engine arena (222-240): floor at row 12 (higher up)
  rect(g, 222, 12, W, 18, "#");
  hline(g, 226, 230, 8, "-");
  hline(g, 233, 237, 8, "-");
  rect(g, 239, 0, 240, 12, "#"); // right wall

  return g.map((r) => r.join(""));
}

export const CONSENSUS_HEIGHTS: LevelData = {
  id: "consensus_heights",
  name: "Consensus Heights",
  widthTiles: W,
  heightTiles: H,
  rows: build(),
  spawns: { p1: [3, 15], p2: [5, 15] },
  exitTileX: 238,
  rooms: [
    {
      id: "r1_tutorial",
      bounds: [0, 0, 30, 18],
      objectiveType: "traverse",
      objectiveText: "Move right. Learn to jump and shoot.",
      gateOnEnemies: false,
      gateTileX: null,
      billboards: ["P(DOOM) = 100%", "PAUSE EVERYTHING"],
    },
    {
      id: "r2_comments",
      bounds: [30, 0, 62, 18],
      objectiveType: "defeat_enemies",
      objectiveText: "Clear the Comment Section to open the gate.",
      gateOnEnemies: true,
      gateTileX: 61,
      billboards: ["SOURCE?", "RATIO"],
    },
    {
      id: "r3_scaffold",
      bounds: [62, 0, 100, 18],
      objectiveType: "traverse",
      objectiveText: "Climb the scaffolding. Avoid the coolant.",
      gateOnEnemies: false,
      gateTileX: null,
      billboards: ["NO COOLING TOWERS"],
    },
    {
      id: "r4_gallery",
      bounds: [100, 0, 134, 18],
      objectiveType: "defeat_enemies",
      objectiveText: "Survive the predictions and clear the gallery.",
      gateOnEnemies: true,
      gateTileX: 133,
      billboards: ["CHART GOES UP", "THEREFORE DOOM"],
    },
    {
      id: "r5_armory",
      bounds: [134, 0, 160, 18],
      objectiveType: "interact",
      objectiveText: "Optional: grab the Nuance Launcher over the pit.",
      gateOnEnemies: false,
      gateTileX: null,
      billboards: ["NUANCE IS VIOLENCE"],
    },
    {
      id: "r6_split",
      bounds: [160, 0, 196, 18],
      objectiveType: "interact",
      objectiveText: "Hit both switches — one up top, one below.",
      gateOnEnemies: false,
      gateTileX: 195,
      billboards: ["EVERYONE AGREES"],
    },
    {
      id: "r7_spire",
      bounds: [196, 0, 222, 18],
      objectiveType: "traverse",
      objectiveText: "Ascend the Alignment Spire.",
      gateOnEnemies: false,
      gateTileX: null,
      billboards: ["ALIGN OR ELSE"],
    },
    {
      id: "r8_boss",
      bounds: [222, 0, 240, 18],
      objectiveType: "defeat_enemies",
      objectiveText: "Defeat the Consensus Engine, then reach the exit.",
      gateOnEnemies: false,
      gateTileX: null,
      billboards: ["ENGAGEMENT IS TRUTH"],
    },
  ],
  enemies: [
    { id: "e_dp1", type: "doom_prophet", tileX: 42, tileY: 15, roomId: "r2_comments" },
    { id: "e_dp2", type: "doom_prophet", tileX: 55, tileY: 15, roomId: "r2_comments" },
    { id: "e_rh1", type: "reply_horde", tileX: 47, tileY: 11, roomId: "r2_comments" },
    { id: "e_rh2", type: "reply_horde", tileX: 48, tileY: 11, roomId: "r2_comments" },
    { id: "e_dp3", type: "doom_prophet", tileX: 82, tileY: 8, roomId: "r3_scaffold" },
    { id: "e_hm1", type: "hall_monitor", tileX: 92, tileY: 6, roomId: "r3_scaffold" },
    { id: "e_cp1", type: "catastrophe_prophet", tileX: 108, tileY: 12, roomId: "r4_gallery" },
    { id: "e_cp2", type: "catastrophe_prophet", tileX: 120, tileY: 11, roomId: "r4_gallery" },
    { id: "e_db1", type: "datacenter_blockader", tileX: 126, tileY: 15, roomId: "r4_gallery" },
    { id: "e_rh3", type: "reply_horde", tileX: 114, tileY: 10, roomId: "r4_gallery" },
    { id: "e_hm2", type: "hall_monitor", tileX: 146, tileY: 6, roomId: "r5_armory" },
    { id: "e_pe1", type: "purity_enforcer", tileX: 180, tileY: 15, roomId: "r6_split" },
    { id: "e_db2", type: "datacenter_blockader", tileX: 180, tileY: 8, roomId: "r6_split" },
    { id: "e_dp4", type: "doom_prophet", tileX: 190, tileY: 8, roomId: "r6_split" },
    { id: "e_hm3", type: "hall_monitor", tileX: 206, tileY: 6, roomId: "r7_spire" },
    { id: "e_rh4", type: "reply_horde", tileX: 205, tileY: 11, roomId: "r7_spire" },
    { id: "e_boss", type: "consensus_engine", tileX: 231, tileY: 11, roomId: "r8_boss" },
  ],
  pickups: [
    { id: "c1", type: "coin", tileX: 14, tileY: 13, roomId: "r1_tutorial" },
    { id: "c16", type: "coin", tileX: 20, tileY: 12, roomId: "r1_tutorial" },
    { id: "c17", type: "coin", tileX: 21, tileY: 12, roomId: "r1_tutorial" },
    { id: "c2", type: "coin", tileX: 22, tileY: 11, roomId: "r1_tutorial" },
    { id: "c3", type: "coin", tileX: 24, tileY: 11, roomId: "r1_tutorial" },
    { id: "c4", type: "coin", tileX: 46, tileY: 11, roomId: "r2_comments" },
    { id: "c5", type: "coin", tileX: 74, tileY: 9, roomId: "r3_scaffold" },
    { id: "c6", type: "coin", tileX: 81, tileY: 8, roomId: "r3_scaffold" },
    { id: "c7", type: "coin", tileX: 92, tileY: 9, roomId: "r3_scaffold" },
    { id: "c8", type: "coin", tileX: 114, tileY: 10, roomId: "r4_gallery" },
    { id: "c9", type: "coin", tileX: 142, tileY: 11, roomId: "r5_armory" },
    { id: "c10", type: "coin", tileX: 150, tileY: 11, roomId: "r5_armory" },
    { id: "c11", type: "coin", tileX: 167, tileY: 6, roomId: "r6_split" },
    { id: "c12", type: "coin", tileX: 176, tileY: 12, roomId: "r6_split" },
    { id: "c13", type: "coin", tileX: 202, tileY: 11, roomId: "r7_spire" },
    { id: "c14", type: "coin", tileX: 208, tileY: 7, roomId: "r7_spire" },
    { id: "c15", type: "coin", tileX: 211, tileY: 3, roomId: "r7_spire" },
    { id: "h1", type: "health", tileX: 98, tileY: 12, value: 40, roomId: "r3_scaffold" },
    { id: "h2", type: "health", tileX: 156, tileY: 13, value: 40, roomId: "r5_armory" },
    { id: "h3", type: "health", tileX: 215, tileY: 3, value: 50, roomId: "r7_spire" },
    { id: "h4", type: "health", tileX: 193, tileY: 15, value: 40, roomId: "r6_split" },
    { id: "fc1", type: "fact_check", tileX: 130, tileY: 13, roomId: "r4_gallery" },
    { id: "a1", type: "ammo", tileX: 228, tileY: 7, roomId: "r8_boss" },
  ],
  interactables: [
    {
      id: "crate_shotgun",
      type: "weapon_crate",
      tileX: 58,
      tileY: 15,
      roomId: "r2_comments",
      requiredPlayer: null,
      label: "Context Shotgun",
    },
    {
      id: "crate_launcher",
      type: "weapon_crate",
      tileX: 146,
      tileY: 9,
      roomId: "r5_armory",
      requiredPlayer: null,
      label: "Nuance Launcher",
    },
    {
      id: "sw_upper",
      type: "switch",
      tileX: 172,
      tileY: 9,
      roomId: "r6_split",
      requiredPlayer: "p1",
      label: "User: Upper Switch",
    },
    {
      id: "sw_lower",
      type: "switch",
      tileX: 192,
      tileY: 15,
      roomId: "r6_split",
      requiredPlayer: "p2",
      label: "JEV: Lower Switch",
    },
    {
      id: "sw_boss_l",
      type: "switch",
      tileX: 224,
      tileY: 11,
      roomId: "r8_boss",
      requiredPlayer: "p1",
      label: "User: Overload L",
    },
    {
      id: "sw_boss_r",
      type: "switch",
      tileX: 237,
      tileY: 11,
      roomId: "r8_boss",
      requiredPlayer: "p2",
      label: "JEV: Overload R",
    },
    {
      id: "exit",
      type: "exit",
      tileX: 238,
      tileY: 10,
      roomId: "r8_boss",
      requiredPlayer: null,
      label: "Consensus Engine Core",
      wTiles: 1,
      hTiles: 2,
    },
  ],
};
