import sharp from "sharp";
import { RGB_PALETTE } from "../../src/game/art/palette";

export class Pixels {
  readonly data: Buffer;
  constructor(readonly width: number, readonly height: number, data?: Buffer) {
    this.data = data ? Buffer.from(data) : Buffer.alloc(width * height * 4);
  }

  dot(x: number, y: number, color: number): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    const rgb = RGB_PALETTE[color];
    this.data[i] = rgb[0];
    this.data[i + 1] = rgb[1];
    this.data[i + 2] = rgb[2];
    this.data[i + 3] = 255;
  }

  rect(x: number, y: number, w: number, h: number, color: number): void {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) this.dot(x + dx, y + dy, color);
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, color: number): void {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) this.dot(x, y, color);
      }
    }
  }

  blit(source: Pixels, x: number, y: number): void {
    for (let sy = 0; sy < source.height; sy++) for (let sx = 0; sx < source.width; sx++) {
      const dx = sx + x, dy = sy + y;
      if (dx < 0 || dy < 0 || dx >= this.width || dy >= this.height) continue;
      const from = (sy * source.width + sx) * 4;
      if (source.data[from + 3]) source.data.copy(this.data, (dy * this.width + dx) * 4, from, from + 4);
    }
  }

  png(): Promise<Buffer> {
    return sharp(this.data, { raw: { width: this.width, height: this.height, channels: 4 } })
      .png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer();
  }
}

const GLYPHS: Record<string, string> = {
  A: "01110/10001/10001/11111/10001/10001/10001", B: "11110/10001/10001/11110/10001/10001/11110",
  C: "01111/10000/10000/10000/10000/10000/01111", D: "11110/10001/10001/10001/10001/10001/11110",
  E: "11111/10000/10000/11110/10000/10000/11111", F: "11111/10000/10000/11110/10000/10000/10000",
  G: "01111/10000/10000/10111/10001/10001/01111", H: "10001/10001/10001/11111/10001/10001/10001",
  I: "11111/00100/00100/00100/00100/00100/11111", J: "00111/00010/00010/00010/10010/10010/01100",
  K: "10001/10010/10100/11000/10100/10010/10001", L: "10000/10000/10000/10000/10000/10000/11111",
  M: "10001/11011/10101/10101/10001/10001/10001", N: "10001/11001/10101/10011/10001/10001/10001",
  O: "01110/10001/10001/10001/10001/10001/01110", P: "11110/10001/10001/11110/10000/10000/10000",
  Q: "01110/10001/10001/10001/10101/10010/01101", R: "11110/10001/10001/11110/10100/10010/10001",
  S: "01111/10000/10000/01110/00001/00001/11110", T: "11111/00100/00100/00100/00100/00100/00100",
  U: "10001/10001/10001/10001/10001/10001/01110", V: "10001/10001/10001/10001/10001/01010/00100",
  W: "10001/10001/10001/10101/10101/11011/10001", X: "10001/10001/01010/00100/01010/10001/10001",
  Y: "10001/10001/01010/00100/00100/00100/00100", Z: "11111/00001/00010/00100/01000/10000/11111",
  "0": "01110/10001/10011/10101/11001/10001/01110", "1": "00100/01100/00100/00100/00100/00100/01110",
  "2": "01110/10001/00001/00010/00100/01000/11111", "3": "11110/00001/00001/01110/00001/00001/11110",
  "4": "00010/00110/01010/10010/11111/00010/00010", "5": "11111/10000/10000/11110/00001/00001/11110",
  "6": "01111/10000/10000/11110/10001/10001/01110", "7": "11111/00001/00010/00100/01000/01000/01000",
  "8": "01110/10001/10001/01110/10001/10001/01110", "9": "01110/10001/10001/01111/00001/00001/11110",
  "(": "00010/00100/01000/01000/01000/00100/00010", ")": "01000/00100/00010/00010/00010/00100/01000",
  "=": "00000/00000/11111/00000/11111/00000/00000", "%": "11001/11010/00100/00100/01000/10110/00110",
  "-": "00000/00000/00000/11111/00000/00000/00000", "_": "00000/00000/00000/00000/00000/00000/11111",
  "+": "00000/00100/00100/11111/00100/00100/00000", ":": "00000/00100/00100/00000/00100/00100/00000",
};

export function text(p: Pixels, value: string, x: number, y: number, color: number, scale = 1): void {
  [...value.toUpperCase()].forEach((char, i) => {
    GLYPHS[char]?.split("/").forEach((row, dy) => [...row].forEach((v, dx) => {
      if (v === "1") p.rect(x + (i * 6 + dx) * scale, y + dy * scale, scale, scale, color);
    }));
  });
}

export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
