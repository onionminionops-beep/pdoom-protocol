import Phaser from "phaser";
import { ART_MANIFEST_URL, type SpriteSheetDef } from "@/game/art/manifest";
import { ENEMY_DEFS } from "@/game/config/enemies";
import { MOVEMENT, TILE } from "@/game/config/movement";
import { FACT_CHECK_PULSE } from "@/game/config/weapons";
import { REVIVE_HOLD_MS } from "@/game/sim/step";
import type { PlayerState, SimEvent } from "@/game/sim/types";
import {
  animationFrame,
  parseRenderManifest,
  pixelDisplayScale,
  sheetEntries,
  spritePlacement,
  type RenderManifest,
} from "./art";
import { fitCamera } from "./camera";
import type { ClientSession } from "./session";

interface Effect {
  x: number;
  y: number;
  radius: number;
  startedAt: number;
  duration: number;
  anim: "impact" | "explosion" | "pulse" | "dash";
  flip?: boolean;
}

export class ProtocolScene extends Phaser.Scene {
  private backdrop!: Phaser.GameObjects.Graphics;
  private backdropLayers: Phaser.GameObjects.Graphics[] = [];
  private drawing!: Phaser.GameObjects.Graphics;
  private overlay!: Phaser.GameObjects.Graphics;
  private texts: Phaser.GameObjects.Text[] = [];
  private textCount = 0;
  private images: Phaser.GameObjects.Image[] = [];
  private imageCount = 0;
  private manifest: RenderManifest = {};
  private sheets = new Map<string, SpriteSheetDef>();
  private itemStates = new Map<string, { activated: boolean; since: number }>();
  private effects: Effect[] = [];
  private lastRoom = "";
  private bannerUntil = 0;

  constructor(private readonly session: ClientSession) {
    super("protocol");
  }

  preload(): void {
    this.load.json("art-manifest", ART_MANIFEST_URL);
  }

  create(): void {
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.setBackgroundColor("#07101d");
    this.backdrop = this.add.graphics().setScrollFactor(0).setDepth(-10);
    this.backdropLayers = [0, 1, 2].map((layer) =>
      this.add
        .graphics()
        .setScrollFactor(0)
        .setDepth(-8 + layer),
    );
    this.drawing = this.add.graphics().setDepth(0);
    this.overlay = this.add.graphics().setDepth(4);
    this.manifest = parseRenderManifest(this.cache.json.get("art-manifest"));
    this.sheets = new Map(sheetEntries(this.manifest));
    for (const [key, definition] of this.sheets) {
      this.load.spritesheet(`art:${key}`, `/art/${definition.file}`, {
        frameWidth: definition.frameWidth,
        frameHeight: definition.frameHeight,
      });
    }
    if (this.manifest.tileset)
      this.load.spritesheet("art:tiles", `/art/${this.manifest.tileset.file}`, {
        frameWidth: TILE,
        frameHeight: TILE,
      });
    for (const [key, definition] of Object.entries(this.manifest.backdrops ?? {})) {
      this.load.image(`art:${key}`, `/art/${definition.file}`);
    }
    if (this.manifest.billboards) {
      const { file, frameWidth, frameHeight } = this.manifest.billboards;
      this.load.spritesheet("art:billboards", `/art/${file}`, { frameWidth, frameHeight });
    }
    this.load.start();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fitCanvas, this);
    const parent = this.game.canvas.parentElement;
    const observer = new ResizeObserver(() => this.fitCanvas());
    if (parent) observer.observe(parent);
    const cleanup = () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.fitCanvas, this);
      observer.disconnect();
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup);
      this.events.off(Phaser.Scenes.Events.DESTROY, cleanup);
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
    this.fitCanvas();
    const canvas = this.game.canvas;
    canvas.setAttribute(
      "aria-label",
      "Consensus Heights game canvas. Use the keyboard controls below.",
    );
    canvas.setAttribute("role", "img");
    canvas.tabIndex = 0;
    canvas.focus();
    this.session.publish();
  }

  update(_time: number, delta: number): void {
    const events = this.session.advance(delta, performance.now());
    const world = this.session.world;
    const camera = fitCamera(world);
    if (this.scale.width !== camera.width || this.scale.height !== camera.height)
      this.scale.setGameSize(camera.width, camera.height);
    this.cameras.main.setScroll(camera.x, camera.y);
    this.cameras.main.setZoom(1);
    this.consumeEvents(events);
    this.drawing.clear();
    this.overlay.clear();
    this.textCount = 0;
    this.imageCount = 0;
    this.drawBackdrop(camera.x, camera.width, camera.height);
    const x0 = Math.max(0, Math.floor(camera.x / TILE));
    const x1 = Math.min(world.level.widthTiles, Math.ceil((camera.x + camera.width) / TILE));
    for (let y = 0; y < world.level.heightTiles; y++) {
      for (let x = x0; x < x1; x++) this.drawTile(world.level.rows[y][x], x, y);
    }
    for (const [index, room] of world.level.rooms.entries()) {
      const x = room.bounds[0] * TILE + 240;
      if (x < camera.x - 400 || x > camera.x + camera.width) continue;
      if (this.manifest.billboards && this.textures.exists("art:billboards")) {
        this.image("art:billboards", x + 112, 261, index % this.manifest.billboards.count, -1);
      } else {
        this.rect(x, 225, 225, 76, 0x101529);
        this.drawing.lineStyle(2, 0x343b58).strokeRect(x, 225, 225, 76);
        this.label(x + 112, 243, room.billboards[0] ?? "", "#aab6cb", 14);
      }
      this.label(x + 112, 312, "CONSENSUS HEIGHTS / PUBLIC SIGNAL", "#76829b", 7);
      this.rect(x + 32, 301, 6, 210, 0x142239);
      this.rect(x + 188, 301, 6, 210, 0x142239);
    }
    for (const zone of world.restrictedZones) {
      this.drawing.fillStyle(0xffb347, 0.12).fillRect(zone.x, zone.y, zone.w, zone.h);
      this.drawing.lineStyle(2, 0xffb347, 0.8).strokeRect(zone.x, zone.y, zone.w, zone.h);
      this.label(zone.x + zone.w / 2, zone.y + 8, "RESTRICTED", "#ffc36a", 10);
    }
    for (const pickup of world.pickups) {
      if (pickup.collected) continue;
      const { x, y } = pickup.pos;
      const key =
        pickup.type === "shotgun" || pickup.type === "launcher" ? "weapon_crate" : pickup.type;
      const bob = this.session.settings.reducedFlashing
        ? 0
        : Math.round(Math.sin(world.elapsedMs / 220 + x) * 3);
      if (!this.sprite(key, x, y + bob, "spin", world.elapsedMs)) {
        if (pickup.type === "coin") {
          this.rect(x - 7, y - 9 + bob, 14, 18, 0xd59f36);
          this.rect(x - 4, y - 7 + bob, 8, 14, 0xffdb72);
          this.rect(x - 1, y - 4 + bob, 2, 8, 0xb97533);
        } else {
          this.rect(x - 11, y - 10, 22, 20, 0x1a3444);
          this.label(
            x,
            y - 7,
            pickup.type === "health" ? "+" : pickup.type === "fact_check" ? "F" : "A",
            "#adffd5",
            15,
          );
        }
      }
    }
    for (const item of world.interactables) {
      const color = item.activated ? 0xc7ed63 : 0xf3b65d;
      let state = this.itemStates.get(item.id);
      if (!state || state.activated !== item.activated) {
        state = { activated: item.activated, since: world.elapsedMs };
        this.itemStates.set(item.id, state);
      }
      const anim = item.type === "switch" ? (item.activated ? "on" : "off") : "spin";
      if (
        !this.sprite(
          item.type,
          item.pos.x,
          item.pos.y,
          anim,
          world.elapsedMs - state.since,
          false,
          0xffffff,
          1,
          item.h,
        )
      ) {
        this.rect(item.pos.x - item.w / 2, item.pos.y - item.h / 2, item.w, item.h, 0x152a35);
        this.drawing
          .lineStyle(2, color)
          .strokeRect(item.pos.x - item.w / 2, item.pos.y - item.h / 2, item.w, item.h);
        this.label(
          item.pos.x,
          item.pos.y - 6,
          item.type === "exit" ? "EXIT" : item.activated ? "ON" : "E",
          `#${color.toString(16)}`,
          12,
        );
      }
      const frameHeight = this.sheets.get(item.type)?.frameHeight ?? item.h;
      this.label(item.pos.x, item.pos.y + item.h / 2 - frameHeight - 17, item.label, "#ffe09a", 9);
    }
    for (const enemy of world.enemies) {
      if (enemy.pos.x < camera.x - 100 || enemy.pos.x > camera.x + camera.width + 100) continue;
      const config = ENEMY_DEFS[enemy.type];
      const telegraph = enemy.phase === "telegraph";
      const vulnerable = enemy.phase === "special" && config.vulnerableWhileSpecial;
      const hurt = enemy.hurtMs > 0 && enemy.phase !== "dying";
      const color = telegraph ? 0xf3b65d : vulnerable ? 0xc7ed63 : 0xed5ab2;
      const alpha = enemy.phase === "dying" ? 0.35 : 1;
      const tint = telegraph ? 0xffe09a : vulnerable ? 0xc7ed63 : 0xffffff;
      if (
        !this.sprite(
          enemy.type,
          enemy.pos.x,
          enemy.pos.y,
          hurt ? "hurt" : enemy.phase,
          hurt ? 180 - enemy.hurtMs : enemy.phaseMs,
          enemy.facing === "left",
          tint,
          alpha,
          enemy.h,
          hurt,
        )
      ) {
        this.drawing
          .fillStyle(color, alpha)
          .fillRect(enemy.pos.x - enemy.w / 2, enemy.pos.y - enemy.h / 2, enemy.w, enemy.h);
        this.rect(
          enemy.pos.x - enemy.w / 2 + 3,
          enemy.pos.y - enemy.h / 2 + 10,
          enemy.w - 6,
          5,
          0x182035,
        );
        this.rect(
          enemy.pos.x - enemy.w / 2 + 4,
          enemy.pos.y + 6,
          enemy.w - 8,
          Math.max(3, enemy.h / 2 - 10),
          0x332b46,
        );
      }
      if (enemy.health > 0) {
        this.overlay
          .fillStyle(0x382050)
          .fillRect(Math.round(enemy.pos.x - 15), Math.round(enemy.pos.y - enemy.h / 2 - 7), 30, 3);
        this.overlay
          .fillStyle(color)
          .fillRect(
            Math.round(enemy.pos.x - 15),
            Math.round(enemy.pos.y - enemy.h / 2 - 7),
            Math.round((30 * enemy.health) / enemy.maxHealth),
            3,
          );
      }
      if (telegraph || vulnerable)
        this.label(
          enemy.pos.x,
          enemy.pos.y - enemy.h / 2 - 28,
          telegraph ? "! ATTACK" : "VULNERABLE",
          telegraph ? "#ffbf67" : "#a6ffad",
          10,
        );
      if (enemy.bubble && enemy.bubbleMs > 0)
        this.label(enemy.pos.x, enemy.pos.y - enemy.h / 2 - 50, enemy.bubble, "#f6e5d6", 11, true);
      if (this.session.hitboxes)
        this.overlay
          .lineStyle(1, 0xef6262)
          .strokeRect(enemy.pos.x - enemy.w / 2, enemy.pos.y - enemy.h / 2, enemy.w, enemy.h);
    }
    for (const player of Object.values(world.players)) {
      if (world.slots[player.id] !== "DISABLED") this.drawPlayer(player);
    }
    for (const projectile of world.projectiles) {
      const color =
        projectile.ownerKind === "enemy"
          ? 0xffb074
          : projectile.ownerId === "p1"
            ? 0x6bf0ec
            : this.session.settings.colorblind
              ? 0xffc15e
              : 0xf987d5;
      if (
        !this.sprite(
          "projectiles",
          projectile.pos.x,
          projectile.pos.y,
          projectile.weapon,
          projectile.ageMs,
          projectile.vel.x < 0,
          0xffffff,
        )
      ) {
        this.rect(
          projectile.pos.x - projectile.radius * 2,
          projectile.pos.y - projectile.radius / 2,
          projectile.radius * 4,
          projectile.radius,
          color,
        );
        this.rect(projectile.pos.x - 2, projectile.pos.y - 1, 4, 2, 0xffffff);
      }
      this.overlay
        .lineStyle(1, color, 0.8)
        .strokeCircle(projectile.pos.x, projectile.pos.y, projectile.radius);
      if (this.session.hitboxes)
        this.overlay
          .lineStyle(1, 0xffffff)
          .strokeCircle(projectile.pos.x, projectile.pos.y, projectile.radius);
    }
    for (const effect of this.effects) {
      const elapsed = world.elapsedMs - effect.startedAt;
      if (elapsed >= effect.duration) continue;
      const alpha = 1 - elapsed / effect.duration;
      if (!this.session.settings.reducedFlashing)
        this.sprite("fx", effect.x, effect.y, effect.anim, elapsed, effect.flip, 0xffffff, alpha);
      this.overlay
        .lineStyle(2, 0xf3b65d, alpha * 0.7)
        .strokeCircle(effect.x, effect.y, (effect.radius * elapsed) / effect.duration);
    }
    this.effects = this.effects.filter(
      (effect) => world.elapsedMs - effect.startedAt < effect.duration,
    );
    if (world.currentRoomId !== this.lastRoom) {
      this.lastRoom = world.currentRoomId;
      this.bannerUntil = world.elapsedMs + 2800;
    }
    if (world.elapsedMs < this.bannerUntil) {
      const index = world.level.rooms.findIndex((room) => room.id === world.currentRoomId);
      this.label(
        camera.x + camera.width / 2,
        camera.y + 45,
        `${world.level.name.toUpperCase()} / SECTOR ${String(index + 1).padStart(2, "0")}`,
        "#b8d4e2",
        14,
        true,
      );
    }
    for (let i = this.textCount; i < this.texts.length; i++) this.texts[i].setVisible(false);
    for (let i = this.imageCount; i < this.images.length; i++) this.images[i].setVisible(false);
  }

  private rect(x: number, y: number, width: number, height: number, color: number): void {
    this.drawing
      .fillStyle(color)
      .fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
  }

  private label(
    x: number,
    y: number,
    text: string,
    color: string,
    size: number,
    bubble = false,
  ): void {
    let label = this.texts[this.textCount++];
    if (!label) {
      label = this.add.text(0, 0, "").setOrigin(0.5, 0).setDepth(5);
      this.texts.push(label);
    }
    label
      .setVisible(true)
      .setPosition(Math.round(x), Math.round(y))
      .setText(text)
      .setStyle({
        fontFamily: this.manifest.ui?.font ?? "monospace",
        fontSize: `${size}px`,
        color,
        backgroundColor: bubble ? "#142133" : undefined,
        padding: bubble ? { x: 9, y: 6 } : { x: 0, y: 0 },
      });
  }

  private image(
    key: string,
    x: number,
    y: number,
    frame: number,
    depth = 1,
  ): Phaser.GameObjects.Image {
    let image = this.images[this.imageCount++];
    if (!image) {
      image = this.add.image(0, 0, key);
      this.images.push(image);
    }
    return image
      .setTexture(key, frame)
      .setVisible(true)
      .setPosition(Math.round(x), Math.round(y))
      .setOrigin(0.5)
      .setDepth(depth)
      .setScrollFactor(1)
      .setScale(1)
      .setFlipX(false)
      .setAlpha(1)
      .clearTint();
  }

  private fitCanvas(): void {
    const canvas = this.game.canvas;
    const parent = canvas.parentElement;
    if (!parent) return;
    const scale = pixelDisplayScale(
      this.scale.width,
      this.scale.height,
      parent.clientWidth,
      parent.clientHeight,
    );
    canvas.style.width = `${this.scale.width * scale}px`;
    canvas.style.height = `${this.scale.height * scale}px`;
  }

  private sprite(
    key: string,
    x: number,
    y: number,
    anim: string,
    elapsed: number,
    flip = false,
    tint = 0xffffff,
    alpha = 1,
    bodyHeight?: number,
    flash = false,
  ): boolean {
    const definition = this.sheets.get(key);
    if (!definition || !this.textures.exists(`art:${key}`)) return false;
    const texture = this.textures.get(`art:${key}`);
    const columns = Math.max(1, Math.floor(texture.getSourceImage().width / definition.frameWidth));
    const frame = animationFrame(
      definition,
      anim,
      this.session.settings.reducedFlashing ? 0 : elapsed,
      columns,
    );
    const placement = spritePlacement(definition, x, y, flip, bodyHeight);
    const image = this.image(
      `art:${key}`,
      placement.x,
      placement.y,
      texture.has(String(frame)) ? frame : 0,
      key === "fx" ? 3 : 1,
    )
      .setOrigin(0.5, placement.originY)
      .setFlipX(flip)
      .setTint(tint)
      .setAlpha(alpha);
    if (flash && !this.session.settings.reducedFlashing) image.setTintFill(0xe5f6ef);
    return true;
  }

  private drawTile(tile: string, x: number, y: number): void {
    if (tile === ".") return;
    const px = x * TILE;
    const py = y * TILE;
    const rows = this.session.world.level.rows;
    const kind =
      tile === "#"
        ? rows[y - 1]?.[x] !== "#"
          ? "solid_top"
          : rows[y]?.[x - 1] !== "#"
            ? "solid_left"
            : rows[y]?.[x + 1] !== "#"
              ? "solid_right"
              : "solid_inner"
        : tile === "-"
          ? "oneway"
          : tile === "H"
            ? "hazard"
            : "gate";
    const frames = this.manifest.tileset?.tiles[kind] ?? this.manifest.tileset?.tiles.solid;
    if (frames?.length && this.textures.exists("art:tiles")) {
      this.image("art:tiles", px + TILE / 2, py + TILE / 2, frames[(x + y) % frames.length], -1);
      return;
    }
    if (tile === "#") {
      this.rect(px, py, TILE, TILE, (x + y) % 3 === 0 ? 0x252b49 : 0x191e39);
      this.rect(px + 1, py + 1, TILE - 2, 2, kind === "solid_top" ? 0x12aec0 : 0x343b58);
      this.rect(px + TILE - 2, py + 3, 2, TILE - 3, 0x101529);
      if ((x + y) % 4 === 0) this.rect(px + 7, py + 12, 12, 2, 0x343b58);
    } else if (tile === "-") {
      this.rect(px, py, TILE, 5, 0x8297a1);
      this.rect(px + 3, py + 5, 3, 8, 0x32495a);
      this.rect(px + 26, py + 5, 3, 8, 0x32495a);
    } else if (tile === "H") {
      this.rect(px, py + 5, TILE, TILE - 5, 0x254d46);
      this.rect(px, py + 5, TILE, 3, 0xa1d984);
      this.label(px + 16, py + 12, "!", "#d7ef96", 13);
    } else if (tile === "G") {
      this.rect(px, py, TILE, TILE, 0x302c38);
      for (let i = 3; i < TILE; i += 9) this.rect(px + i, py, 3, TILE, 0xd09360);
    }
  }

  private drawPlayer(player: PlayerState): void {
    const x = Math.round(player.pos.x);
    const y = Math.round(player.pos.y);
    const color =
      player.id === "p1" ? 0x60e6ed : this.session.settings.colorblind ? 0xffbe65 : 0xee7bcd;
    const facing = player.facing === "left" ? -1 : 1;
    const hurt = player.anim === "hurt" && !this.session.settings.reducedFlashing;
    const down = player.downed || !player.alive;
    const anim = !player.alive
      ? "death"
      : this.session.world.status === "won"
        ? "victory"
        : player.anim;
    if (
      !this.sprite(
        player.character,
        x,
        y,
        anim,
        player.animMs,
        facing < 0,
        0xffffff,
        player.alive ? 1 : 0.4,
        MOVEMENT.bodyHeight,
        hurt,
      )
    ) {
      const stride = player.anim === "run" ? (Math.floor(player.animMs / 90) % 2) * 4 : 0;
      this.rect(x - 14, y + 18, 28, 3, 0x090f1b);
      if (down) {
        this.rect(x - 18, y + 8, 32, 12, color);
        this.rect(x + facing * 12 - 4, y + 4, 8, 12, 0xc9e4dd);
      } else {
        if (player.anim === "dash") {
          this.drawing.fillStyle(color, 0.25).fillRect(x - facing * 28 - 9, y - 8, 18, 24);
        }
        this.rect(x - 8, y - 7, 16, 22, hurt ? 0xffffff : color);
        this.rect(x - 6, y - 19, 14, 13, color);
        this.rect(x - 8, y - 20, 16, 5, 0x293a53);
        this.rect(x + (facing > 0 ? 0 : -7), y - 13, 9, 3, 0x0c243b);
        this.rect(x - 8, y + 10, 7, 10 - stride, 0x32475e);
        this.rect(x + 2, y + 10, 7, 6 + stride, 0x32475e);
        this.rect(x + facing * 11 - 7, y - 2, 17, 6, 0xd2dae1);
        this.rect(x + facing * 16 - 3, y - 1, 6, 4, 0x41536b);
        if (player.anim === "shoot" && !this.session.settings.reducedFlashing)
          this.rect(x + facing * 23 - 3, y - 3, 6, 8, 0xffe2a3);
      }
    }
    this.label(
      x,
      y - 38,
      `${player.id === "p1" ? "01 USER" : "02 JEV"}${down ? " / DOWN" : ""}`,
      `#${color.toString(16)}`,
      10,
    );
    if (player.downed) {
      const other = this.session.world.players[player.id === "p1" ? "p2" : "p1"];
      this.overlay.lineStyle(2, color, 0.4).strokeCircle(x, y, 30);
      this.overlay
        .lineStyle(4, color)
        .beginPath()
        .arc(
          x,
          y,
          30,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * Math.min(1, other.reviveProgressMs / REVIVE_HOLD_MS),
          false,
        )
        .strokePath();
    }
    if (this.session.hitboxes)
      this.overlay
        .lineStyle(1, 0xffffff)
        .strokeRect(
          x - MOVEMENT.bodyWidth / 2,
          y - MOVEMENT.bodyHeight / 2,
          MOVEMENT.bodyWidth,
          MOVEMENT.bodyHeight,
        );
  }

  private drawBackdrop(scrollX: number, width: number, height: number): void {
    const g = this.backdrop.clear();
    g.fillStyle(0x090b18).fillRect(0, 0, width, height);
    g.fillStyle(0x191e39).fillCircle(width * 0.73, height * 0.24, 48);
    g.fillStyle(0x76829b, 0.25).fillCircle(width * 0.73, height * 0.24, 32);
    for (let layer = 0; layer < 3; layer++) {
      const g = this.backdropLayers[layer].clear();
      const spacing = 93 + layer * 27;
      const parallax = 0.08 + layer * 0.12;
      const offset = (scrollX * parallax) % spacing;
      const base = height * (0.7 + layer * 0.11);
      const color = [0x111f35, 0x17293e, 0x1a2f42][layer];
      const artKey = ["bg_far", "bg_mid", "bg_near"][layer] as "bg_far" | "bg_mid" | "bg_near";
      const definition = this.manifest.backdrops?.[artKey];
      if (definition && this.textures.exists(`art:${artKey}`)) {
        const scale = Math.max(1, Math.ceil(height / definition.height));
        const tileWidth = definition.width * scale;
        const artOffset = (((scrollX * definition.parallax) % tileWidth) + tileWidth) % tileWidth;
        for (let x = -artOffset; x < width; x += tileWidth) {
          this.image(`art:${artKey}`, x, height - definition.height * scale, 0, -8 + layer)
            .setOrigin(0)
            .setScrollFactor(0)
            .setScale(scale);
        }
        continue;
      }
      for (let i = -1; i < width / spacing + 1; i++) {
        const x = Math.round(i * spacing - offset);
        const h = 80 + (((i + 100 + layer * 7) * 53) % 160);
        g.fillStyle(color).fillRect(x, base - h, spacing - 10, h + height);
        g.fillStyle(0x274253).fillRect(x + 14, base - h - 13, spacing - 36, 13);
        for (let row = 0; row < h / 23; row++) {
          for (let col = 0; col < 4; col++) {
            if ((row + col + i) % 3 === 0) continue;
            g.fillStyle((row + i) % 4 === 0 ? 0x556154 : 0x305368, 0.5).fillRect(
              x + 10 + col * 16,
              base - h + 14 + row * 23,
              4,
              6,
            );
          }
        }
      }
    }
  }

  private consumeEvents(events: SimEvent[]): void {
    const world = this.session.world;
    const startedAt = world.elapsedMs;
    for (const event of events) {
      if (event.type === "explosion" || event.type === "projectile_hit") {
        this.effects.push({
          ...event.pos,
          radius: event.type === "explosion" ? event.radius : 14,
          anim: event.type === "explosion" ? "explosion" : "impact",
          duration: 500,
          startedAt,
        });
      } else if (event.type === "fact_check_pulse") {
        this.effects.push({
          ...event.pos,
          radius: FACT_CHECK_PULSE.radius,
          anim: "pulse",
          duration: 500,
          startedAt,
        });
      } else if (event.type === "dash") {
        const player = world.players[event.playerId];
        this.effects.push({
          x: player.pos.x + (event.facing === "left" ? 16 : -16),
          y: player.pos.y,
          radius: 20,
          anim: "dash",
          flip: event.facing === "left",
          duration: 500,
          startedAt,
        });
      }
      if (
        (event.type === "player_hurt" || event.type === "explosion") &&
        this.session.settings.screenShake &&
        !this.session.settings.reducedFlashing
      ) {
        this.cameras.main.shake(100, 0.003);
      }
    }
    this.effects = this.effects.slice(-128);
  }
}
