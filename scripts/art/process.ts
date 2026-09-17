import sharp from "sharp";
import { RGB_PALETTE } from "../../src/game/art/palette";
import { BILLBOARD_SLOGANS, type AssetSpec } from "./catalog";
import { Pixels, text } from "./pixels";

export function quantize(p: Pixels): Pixels {
  const out = new Pixels(p.width, p.height);
  for (let i = 0; i < p.data.length; i += 4) {
    if (p.data[i + 3] < 128) continue;
    let best = 0, distance = Infinity;
    for (let c = 0; c < RGB_PALETTE.length; c++) {
      const rgb = RGB_PALETTE[c];
      const d = (p.data[i] - rgb[0]) ** 2 + (p.data[i + 1] - rgb[1]) ** 2 + (p.data[i + 2] - rgb[2]) ** 2;
      if (d < distance) { best = c; distance = d; }
    }
    out.dot((i / 4) % p.width, Math.floor(i / 4 / p.width), best);
  }
  return out;
}

export function removeChroma(p: Pixels): Pixels {
  const out = new Pixels(p.width, p.height, p.data);
  for (let i = 0; i < out.data.length; i += 4) {
    const r = out.data[i], g = out.data[i + 1], b = out.data[i + 2];
    if (b > 120 && b > r * 1.7 && b > g * 1.7) out.data.fill(0, i, i + 4);
  }
  return out;
}

export async function processGeneration(raw: Buffer, spec: AssetSpec, chroma: boolean): Promise<Pixels> {
  const { data, info } = await sharp(raw).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let p = new Pixels(info.width, info.height, data);
  if (chroma) p = removeChroma(p);
  let left = p.width, top = p.height, right = -1, bottom = -1;
  if (spec.transparent && spec.kind !== "backdrop") {
    for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
      if (p.data[(y * p.width + x) * 4 + 3] < 128) continue;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    if (right < left) throw new Error("Empty foreground");
  } else { left = 0; top = 0; right = p.width - 1; bottom = p.height - 1; }
  const margin = spec.kind === "sheet" ? Math.max(1, Math.round(spec.height / 24)) : 0;
  const resized = await sharp(p.data, { raw: { width: p.width, height: p.height, channels: 4 } })
    .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
    .resize(spec.width - margin * 2, spec.height - margin * 2, {
      kernel: "nearest", fit: spec.transparent && spec.kind !== "backdrop" ? "contain" : "fill",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    }).raw().toBuffer();
  p = new Pixels(spec.width, spec.height);
  p.blit(new Pixels(spec.width - margin * 2, spec.height - margin * 2, resized), margin, margin);
  return quantize(p);
}

function frame(pose: Pixels, name: string, index: number): Pixels {
  const w = pose.width, h = pose.height;
  const p = new Pixels(w, h);
  const bob = [0, -1, 0, 1][index];
  const fallen = ["downed", "death", "dying"].includes(name);
  const crouch = ["land", "skid", "recover", "revive"].includes(name);
  const squash = fallen ? 0.35 : crouch ? 0.78 + index * 0.04 : name === "dash" ? 0.7 : 1;
  const bottom = h - 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const from = (y * w + x) * 4;
    if (!pose.data[from + 3]) continue;
    let dx = x, dy = Math.round(bottom - (bottom - y) * squash);
    if (name === "run" || name === "move") {
      dx += y > h * 0.65 ? Math.round(Math.sin(index * Math.PI / 2) * (x < w / 2 ? -2 : 2)) : 0;
      dy += bob;
    } else if (name === "shoot" || name === "attack") dx += index === 1 ? -1 : 0;
    else if (name === "hurt" || name === "telegraph") dx += index % 2 === 0 ? -1 : 1;
    else if (!fallen) dy += bob;
    if (dx >= 0 && dy >= 0 && dx < w && dy < h) pose.data.copy(p.data, (dy * w + dx) * 4, from, from + 4);
  }
  if (["hurt", "telegraph", "special", "being_revived", "victory"].includes(name) && index % 2) {
    const color = name === "hurt" ? 30 : name === "telegraph" ? 27 : 13;
    p.rect(1, 1 + index, 2, 2, color);
    p.rect(w - 3, 4 - index, 2, 2, color);
  }
  return p;
}

export function packAsset(pose: Pixels, spec: AssetSpec): Pixels {
  if (spec.sheet) {
    const s = spec.sheet;
    const p = new Pixels(s.frameWidth * Math.max(...s.anims.map((a) => a.frames)), s.frameHeight * s.anims.length);
    for (const anim of s.anims) for (let i = 0; i < anim.frames; i++) {
      let rendered = frame(pose, anim.name, i);
      if (spec.key === "coin") {
        rendered = new Pixels(pose.width, pose.height);
        const scale = [1, 0.65, 0.3, 0.65][i];
        for (let y = 0; y < pose.height; y++) for (let x = 0; x < pose.width; x++) {
          const from = (y * pose.width + x) * 4;
          if (pose.data[from + 3]) pose.data.copy(rendered.data, (y * pose.width + Math.round(pose.width / 2 + (x - pose.width / 2) * scale)) * 4, from, from + 4);
        }
      }
      if (spec.key === "switch" && anim.name === "on") rendered.rect(3, spec.height - 6, 4, 3, 23);
      if (spec.key === "projectiles") {
        const color = [13, 27, 30, 23, 18, 31, 18][anim.row];
        for (let y = 0; y < rendered.height; y++) for (let x = 0; x < rendered.width; x++) {
          if (rendered.data[(y * rendered.width + x) * 4 + 3]) rendered.dot(x, y, color);
        }
        rendered.rect(spec.width - 8, 7, 4, 2, 8);
      }
      p.blit(rendered, i * s.frameWidth, anim.row * s.frameHeight);
    }
    return p;
  }
  if (spec.kind === "tiles") {
    const p = new Pixels(256, 32);
    for (let i = 0; i < 8; i++) {
      const tile = new Pixels(32, 32);
      if (i === 1) { tile.rect(0, 0, 32, 6, 4); tile.rect(0, 0, 32, 2, 13); }
      else if (i === 2) {
        tile.rect(0, 26, 32, 6, 3);
        for (let x = 0; x < 32; x += 8) for (let y = 0; y < 12; y++) tile.rect(x + 4 - Math.floor(y / 3), 14 + y, 1 + Math.floor(y / 3) * 2, 1, 30);
      } else if (i === 3) {
        tile.rect(0, 0, 32, 32, 1);
        for (let x = 3; x < 32; x += 8) { tile.rect(x, 0, 4, 32, 4); tile.rect(x, 0, 1, 32, 18); }
      } else {
        tile.blit(pose, 0, 0);
        if (i === 4) tile.rect(0, 0, 32, 3, 12);
        if (i === 5) tile.rect(0, 0, 3, 32, 11);
        if (i === 6) tile.rect(29, 0, 3, 32, 11);
      }
      p.blit(tile, i * 32, 0);
    }
    return p;
  }
  if (spec.kind === "billboards") {
    const p = new Pixels(spec.width * 3, spec.height);
    BILLBOARD_SLOGANS.forEach((slogan, i) => {
      const panel = new Pixels(spec.width, spec.height, pose.data);
      panel.rect(8, 10, 176, 57, 4);
      panel.rect(10, 12, 172, 53, 27);
      panel.rect(12, 14, 168, 49, 1);
      const lines = slogan === "PAUSE EVERYTHING" ? ["PAUSE", "EVERYTHING"] : slogan === "NO DATACENTERS" ? ["NO", "DATACENTERS"] : [slogan];
      lines.forEach((line, j) => text(panel, line, Math.floor((panel.width - (line.length * 6 - 1) * 2) / 2), lines.length === 1 ? 31 : 20 + j * 22, i === 0 ? 18 : i === 1 ? 27 : 23, 2));
      p.blit(panel, spec.width * i, 0);
    });
    return p;
  }
  return pose;
}
