import sharp from "sharp";
import { PIPELINE_SEED, type AssetSpec } from "./catalog";
import { Pixels, seeded } from "./pixels";

function person(key: string): Pixels {
  const p = new Pixels(32, 48);
  const jev = key === "jev" || key === "portrait_jev";
  const user = key === "user" || key === "portrait_user";
  const coat = user
    ? 27
    : jev
      ? 6
      : key === "catastrophe_prophet"
        ? 18
        : key === "datacenter_blockader"
          ? 23
          : 16;
  p.rect(9, 24, 15, 15, 0);
  p.rect(10, 33, 5, 10, 3);
  p.rect(19, 33, 5, 10, 4);
  p.rect(8, 42, 8, 3, 0);
  p.rect(19, 42, 8, 3, 0);
  p.rect(10, 42, 5, 1, 12);
  p.rect(21, 42, 5, 1, 6);
  p.rect(8, 17, 18, 18, 0);
  p.rect(10, 18, 14, 15, coat);
  p.rect(10, 20, 3, 11, user ? 26 : 4);
  p.rect(19, 20, 4, 10, jev ? 8 : coat);
  p.rect(11, 30, 14, 3, 3);
  p.rect(17, 30, 3, 3, 27);
  p.rect(10, 5, 15, 15, 0);
  p.rect(12, 7, 12, 10, jev ? 4 : 26);
  p.rect(14, 8, 10, 7, jev ? 13 : 28);
  p.rect(21, 11, 2, 2, 0);
  p.rect(10, 4, 14, 5, jev ? 4 : 2);
  p.rect(8, 7, 7, 6, 2);
  if (jev) {
    p.rect(11, 6, 2, 3, 18);
    p.rect(14, 10, 9, 2, 14);
  }
  if (user || jev) {
    p.rect(9, 17, 15, 3, jev ? 18 : 13);
    p.rect(5, 19, 6, 9, jev ? 17 : 11);
    p.rect(19, 22, 8, 5, 0);
    p.rect(20, 23, 7, 3, coat);
    p.rect(24, 21, 7, 4, 5);
    p.rect(28, 22, 3, 2, 13);
  } else if (key === "doom_prophet") {
    p.rect(9, 4, 16, 5, 15);
    p.rect(8, 8, 5, 12, 16);
    p.rect(12, 9, 11, 6, 0);
    p.rect(18, 11, 4, 2, 27);
    p.rect(7, 29, 19, 12, 16);
    p.rect(25, 14, 2, 24, 25);
    p.rect(23, 9, 8, 9, 6);
  } else if (key === "catastrophe_prophet") {
    p.rect(8, 2, 15, 5, 8);
    p.rect(7, 5, 4, 7, 7);
    p.rect(22, 22, 9, 9, 0);
    p.rect(23, 23, 7, 7, 10);
    p.rect(25, 24, 2, 4, 30);
  } else if (key === "datacenter_blockader") {
    p.rect(8, 4, 18, 6, 27);
    p.rect(6, 9, 23, 3, 28);
    p.rect(21, 23, 10, 18, 0);
    p.rect(22, 24, 8, 16, 5);
    p.rect(23, 25, 2, 14, 23);
  } else {
    p.rect(5, 17, 8, 15, 7);
    p.rect(19, 19, 12, 19, 8);
    p.rect(21, 21, 8, 15, 16);
    p.rect(22, 22, 2, 12, 18);
    p.rect(12, 7, 13, 9, 7);
    p.rect(14, 10, 11, 3, 18);
  }
  return p;
}

function machine(key: string): Pixels {
  const p = new Pixels(
    key === "consensus_engine" ? 120 : 32,
    key === "consensus_engine" ? 140 : 32,
  );
  if (key === "consensus_engine") {
    p.rect(13, 23, 94, 92, 0);
    p.rect(17, 27, 86, 84, 3);
    for (const x of [9, 83]) {
      p.rect(x, 14, 28, 112, 0);
      p.rect(x + 3, 17, 22, 106, 4);
      for (let y = 22; y < 116; y += 14) {
        p.rect(x + 5, y, 18, 8, 1);
        p.rect(x + 6, y + 1, 3, 5, 13);
        p.rect(x + 12, y + 2, 8, 2, 6);
      }
    }
    p.ellipse(60, 60, 32, 29, 0);
    p.ellipse(60, 60, 28, 25, 16);
    p.ellipse(60, 60, 23, 19, 18);
    p.ellipse(60, 60, 13, 18, 0);
    p.rect(59, 45, 6, 28, 13);
    p.rect(60, 46, 3, 8, 8);
    p.rect(46, 92, 28, 26, 0);
    p.rect(50, 96, 20, 17, 23);
    p.rect(55, 99, 10, 10, 8);
    p.rect(37, 126, 47, 4, 11);
    p.rect(43, 132, 35, 3, 13);
  } else {
    const drone = key === "hall_monitor";
    p.rect(5, 7, 22, 17, 0);
    p.rect(7, 9, 18, 12, drone ? 4 : 22);
    p.rect(10, 12, 14, 7, 0);
    p.rect(12, 14, 10, 3, drone ? 13 : 23);
    p.rect(19, 14, 3, 3, 8);
    p.rect(5, 24, 5, 4, drone ? 27 : 3);
    p.rect(22, 24, 5, 4, drone ? 27 : 3);
    p.rect(8, 4, 2, 5, 6);
    p.rect(7, 3, 4, 2, 18);
    if (!drone) {
      p.rect(2, 20, 4, 4, 17);
      p.rect(0, 17, 2, 5, 18);
    }
  }
  return p;
}

function prop(key: string): Pixels {
  const p = new Pixels(32, 32);
  if (key === "coin" || key === "fact_check") {
    p.ellipse(16, 16, 11, 13, 0);
    p.ellipse(16, 16, 9, 11, key === "coin" ? 26 : 11);
    p.ellipse(16, 16, 7, 9, key === "coin" ? 28 : 13);
    p.rect(13, 10, 6, 12, key === "coin" ? 26 : 8);
    p.rect(14, 11, 3, 9, key === "coin" ? 27 : 14);
  } else if (key === "projectiles") {
    p.rect(2, 13, 23, 6, 11);
    p.rect(8, 14, 20, 4, 13);
    p.rect(18, 15, 11, 2, 8);
  } else if (key === "fx") {
    for (let i = 0; i < 12; i++) {
      p.rect(15, 4 + i, 3, 24 - 2 * i, 27);
      p.rect(4 + i, 15, 24 - 2 * i, 3, 27);
      p.dot(7 + i, 7 + i, 13);
      p.dot(24 - i, 7 + i, 13);
    }
    p.ellipse(16, 16, 4, 4, 8);
  } else if (key === "exit") {
    p.rect(3, 1, 26, 31, 0);
    p.rect(5, 3, 22, 29, 5);
    p.rect(7, 5, 18, 27, 13);
    p.rect(10, 7, 12, 25, 1);
    p.rect(12, 10, 2, 19, 10);
    p.rect(20, 14, 3, 3, 27);
  } else {
    p.rect(4, 8, 24, 21, 0);
    p.rect(6, 10, 20, 17, 4);
    p.rect(7, 11, 18, 2, 7);
    if (key === "switch") {
      p.rect(10, 15, 12, 9, 0);
      p.rect(15, 9, 4, 13, 27);
      p.rect(12, 8, 10, 4, 28);
      p.rect(8, 23, 3, 2, 23);
    } else if (key === "health") {
      p.rect(10, 4, 12, 7, 6);
      p.rect(11, 13, 10, 11, 11);
      p.rect(14, 14, 4, 9, 23);
    } else {
      for (let x = 9; x < 24; x += 6) {
        p.rect(x, 16, 3, 7, 27);
        p.rect(x, 15, 3, 2, 28);
      }
      if (key === "weapon_crate") {
        p.rect(6, 14, 20, 3, 16);
        p.rect(8, 14, 3, 12, 27);
        p.rect(22, 14, 3, 12, 27);
      }
    }
  }
  return p;
}

export async function fallbackPose(spec: AssetSpec, seed = PIPELINE_SEED): Promise<Pixels> {
  let p: Pixels;
  if (spec.kind === "backdrop") {
    p = new Pixels(spec.width, spec.height);
    const random = seeded(seed + spec.key.length + spec.key.charCodeAt(3));
    if (spec.key === "bg_far") p.rect(0, 0, p.width, p.height, 0);
    const depth = spec.key === "bg_far" ? 1 : spec.key === "bg_mid" ? 2 : 3;
    for (let x = 0; x < p.width; x += 34) {
      const h = 60 + Math.floor(random() * (230 - depth * 30));
      const y = p.height - h;
      p.rect(x, y, 30 + Math.floor(random() * 10), h, depth === 3 ? 0 : depth + 1);
      p.rect(x + 10, y - 13, 2, 13, depth + 2);
      for (let wy = y + 8; wy < p.height - 12; wy += 12)
        for (let wx = x + 5; wx < x + 29; wx += 8) {
          if (random() > 0.6) p.rect(wx, wy, 3, 4, depth === 1 ? 10 : depth === 2 ? 17 : 25);
        }
    }
  } else if (spec.kind === "tiles") {
    p = new Pixels(32, 32);
    p.rect(0, 0, 32, 32, 3);
    for (let y = 0; y < 32; y += 8) {
      p.rect(0, y, 32, 1, 1);
      for (let x = y % 16 === 0 ? 0 : 8; x < 32; x += 16) {
        p.rect(x, y, 1, 8, 1);
        p.rect(x + 2, y + 2, 10, 1, 4);
      }
    }
  } else if (spec.kind === "billboards") {
    p = new Pixels(192, 80);
    p.rect(2, 2, 188, 76, 0);
    p.rect(4, 4, 184, 70, 27);
    p.rect(7, 7, 178, 64, 3);
    p.rect(10, 10, 172, 58, 1);
    for (const x of [6, 184]) for (const y of [6, 69]) p.rect(x, y, 2, 2, 8);
  } else if (spec.key === "logo") {
    p = new Pixels(192, 64);
    p.rect(16, 12, 45, 6, 13);
    p.rect(16, 12, 6, 40, 13);
    p.rect(16, 46, 45, 6, 13);
    p.rect(130, 12, 45, 6, 27);
    p.rect(169, 12, 6, 40, 27);
    p.rect(130, 46, 45, 6, 27);
    for (let y = 9; y < 55; y++) {
      const w = 23 - Math.abs(32 - y);
      p.rect(96 - w, y, w * 2, 1, 18);
    }
    p.rect(89, 25, 14, 14, 0);
    p.rect(93, 29, 6, 6, 8);
  } else if (["hall_monitor", "reply_horde", "consensus_engine"].includes(spec.key))
    p = machine(spec.key);
  else if (spec.sheet?.anims[0].name === "idle" || spec.key.startsWith("portrait")) {
    p = person(spec.key);
    if (spec.key.startsWith("portrait")) {
      const cropped = new Pixels(28, 28);
      cropped.blit(p, -3, -2);
      p = cropped;
    }
  } else p = prop(spec.key);
  const data = await sharp(p.data, { raw: { width: p.width, height: p.height, channels: 4 } })
    .resize(spec.width, spec.height, { fit: "fill", kernel: "nearest" })
    .raw()
    .toBuffer();
  return new Pixels(spec.width, spec.height, data);
}
