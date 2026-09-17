import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import manifestJson from "../../public/art/manifest.json";
import { ArtManifestSchema } from "@/game/art/schema";
import { RGB_PALETTE } from "@/game/art/palette";
import { ENEMY_DEFS } from "@/game/config/enemies";
import { assetCatalog } from "../../scripts/art/catalog";
import { fallbackPose } from "../../scripts/art/fallback";
import { packAsset, processGeneration, removeChroma } from "../../scripts/art/process";
import { Pixels } from "../../scripts/art/pixels";
import { availableModels, generateImage } from "../../scripts/art/openai";
import { runPipeline } from "../../scripts/art/generate";

const publicDir = path.resolve("public/art");
const catalog = assetCatalog();
const hash = (data: Buffer) => createHash("sha256").update(data).digest("hex");

describe("shipped art", () => {
  it("validates the manifest and rejects broken contracts", () => {
    expect(ArtManifestSchema.safeParse(manifestJson).success).toBe(true);
    expect(ArtManifestSchema.safeParse({ ...manifestJson, enemies: {} }).success).toBe(false);
    const bad = structuredClone(manifestJson);
    bad.characters.user.anims[0].row = 2;
    expect(ArtManifestSchema.safeParse(bad).success).toBe(false);
    bad.characters.user.file = "../escape.png";
    expect(ArtManifestSchema.safeParse(bad).success).toBe(false);
  });

  it.each(catalog)("ships $key with exact dimensions and shared palette", async (spec) => {
    const manifest = ArtManifestSchema.parse(manifestJson);
    const definition = spec.sheet
      ? { ...manifest.characters, ...manifest.enemies, ...manifest.props }[
          spec.key as keyof typeof manifest.props
        ]
      : null;
    const filename =
      definition?.file ??
      (spec.key === "tiles"
        ? manifest.tileset.file
        : spec.key === "billboards"
          ? manifest.billboards.file
          : spec.key === "portrait_user"
            ? manifest.ui.portraitUser
            : spec.key === "portrait_jev"
              ? manifest.ui.portraitJev
              : spec.key === "logo"
                ? manifest.ui.logo
                : manifest.backdrops[spec.key as keyof typeof manifest.backdrops].file);
    const { data, info } = await sharp(await readFile(path.join(publicDir, filename)))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const width = spec.sheet
      ? spec.width * 4
      : spec.kind === "tiles"
        ? 256
        : spec.kind === "billboards"
          ? 576
          : spec.width;
    const height = spec.sheet ? spec.height * spec.sheet.anims.length : spec.height;
    expect([info.width, info.height]).toEqual([width, height]);
    const colors = new Set(RGB_PALETTE.map((rgb) => rgb.join(",")));
    let visible = 0,
      outsidePalette = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (!data[i + 3]) continue;
      visible++;
      if (data[i + 3] !== 255 || !colors.has(`${data[i]},${data[i + 1]},${data[i + 2]}`))
        outsidePalette++;
    }
    expect(visible).toBeGreaterThan(0);
    expect(outsidePalette).toBe(0);
    if (spec.sheet)
      for (const anim of spec.sheet.anims)
        for (let frame = 0; frame < anim.frames; frame++) {
          let pixels = 0;
          for (let y = anim.row * spec.height; y < (anim.row + 1) * spec.height; y++) {
            for (let x = frame * spec.width; x < (frame + 1) * spec.width; x++)
              pixels += data[(y * info.width + x) * 4 + 3] > 0 ? 1 : 0;
          }
          expect(pixels).toBeGreaterThan(4);
        }
  });

  it("matches enemy configuration and stays within the asset budget", async () => {
    const manifest = ArtManifestSchema.parse(manifestJson);
    for (const enemy of Object.values(ENEMY_DEFS)) {
      expect([
        manifest.enemies[enemy.type].frameWidth,
        manifest.enemies[enemy.type].frameHeight,
      ]).toEqual([enemy.width, enemy.height]);
    }
    const files = (await readdir(publicDir)).filter((f) => f.endsWith(".png"));
    const bytes = await Promise.all(
      files.map(async (f) => (await stat(path.join(publicDir, f))).size),
    );
    expect(bytes.reduce((a, b) => a + b, 0)).toBeLessThan(6 * 1024 * 1024);
  });
});

describe("art pipeline", () => {
  it.each(catalog)("generates $key byte-for-byte deterministically offline", async (spec) => {
    const a = await packAsset(await fallbackPose(spec), spec).png();
    const b = await packAsset(await fallbackPose(spec), spec).png();
    expect(hash(a)).toBe(hash(b));
  });

  it("keys chroma blue, preserves foreground, crops and quantizes", async () => {
    const p = new Pixels(16, 16);
    for (let i = 0; i < p.data.length; i += 4) {
      p.data[i + 2] = 255;
      p.data[i + 3] = 255;
    }
    p.rect(5, 3, 6, 10, 27);
    expect(removeChroma(p).data[3]).toBe(0);
    const result = await processGeneration(await p.png(), catalog[0], true);
    expect([result.width, result.height]).toEqual([32, 48]);
    expect(result.data[3]).toBe(0);
    expect(result.data[(24 * 32 + 16) * 4 + 3]).toBe(255);
  });

  it("discovers preferred models and falls back to gpt-image-1 when absent", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ data: [{ id: "gpt-image-1" }] })));
    expect(await availableModels("test-key", request)).toEqual(["gpt-image-1"]);
    request.mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "gpt-image-1" }, { id: "gpt-image-2" }] })),
    );
    expect(await availableModels("test-key", request)).toEqual(["gpt-image-2", "gpt-image-1"]);
  });

  it("reuses raw generations without re-spending", async () => {
    await mkdir("scripts/art/cache", { recursive: true });
    const dir = await mkdtemp("scripts/art/cache/test-");
    try {
      const raw = await (await fallbackPose(catalog[0])).png();
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(JSON.stringify({ data: [{ b64_json: raw.toString("base64") }] })),
        );
      const a = await generateImage(catalog[0], "gpt-image-2", "test-key", dir, "1", request);
      const b = await generateImage(catalog[0], "gpt-image-2", "test-key", dir, "1", request);
      expect(a.raw).toEqual(b.raw);
      expect(request).toHaveBeenCalledOnce();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("retries unsupported transparency on chroma", async () => {
    await mkdir("scripts/art/cache", { recursive: true });
    const dir = await mkdtemp("scripts/art/cache/test-");
    try {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response("Unsupported background", { status: 400 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ b64_json: "aW1hZ2U=" }] })));
      const result = await generateImage(catalog[0], "gpt-image-2", "test-key", dir, "1", request);
      expect(result.chroma).toBe(true);
      expect(request).toHaveBeenCalledTimes(2);
      expect(JSON.parse(String(request.mock.calls[1][1]?.body)).background).toBe("opaque");
      expect(
        (await generateImage(catalog[0], "gpt-image-2", "test-key", dir, "1", request)).raw,
      ).toEqual(result.raw);
      expect(request).toHaveBeenCalledTimes(2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("runs --dry-run with zero network calls even if a key is supplied", async () => {
    await mkdir("scripts/art/cache", { recursive: true });
    const dir = await mkdtemp("scripts/art/cache/test-");
    const request = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", request);
    try {
      const { manifest } = await runPipeline({
        outputDir: dir,
        cacheDir: dir,
        dryRun: true,
        apiKey: "test-key",
      });
      expect(manifest.generatedBy).toBe("programmatic");
      expect(ArtManifestSchema.safeParse(manifest).success).toBe(true);
      expect(request).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
