import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { ArtManifestSchema } from "../../src/game/art/schema";
import { assetCatalog, createManifest, PIPELINE_SEED } from "./catalog";
import { fallbackPose } from "./fallback";
import { availableModels, generateImage, type ImageModel } from "./openai";
import { packAsset, processGeneration } from "./process";
import { Pixels, text } from "./pixels";

interface Provenance {
  key: string;
  source: ImageModel | "programmatic";
  prompt: string;
  seed: number | null;
  revision: string;
  cacheKey?: string;
  sha256: string;
  note?: string;
}

export async function runPipeline(options: {
  outputDir: string;
  cacheDir: string;
  dryRun?: boolean;
  apiKey?: string;
  only?: string[];
  revision?: string;
}) {
  const manifest = createManifest();
  const catalog = assetCatalog(manifest);
  if (options.only?.some((key) => !catalog.some((spec) => spec.key === key)))
    throw new Error("Unknown --only asset");
  const outputKey = createHash("sha256")
    .update(path.resolve(options.outputDir))
    .digest("hex")
    .slice(0, 16);
  const provenanceFile = path.join(options.cacheDir, `provenance-${outputKey}.json`);
  const provenance: Provenance[] = [];
  if (options.only?.length) {
    const previous = JSON.parse(await readFile(provenanceFile, "utf8")) as Provenance[];
    provenance.push(...previous.filter((p) => !options.only?.includes(p.key)));
  }
  let models: ImageModel[] = [];
  if (!options.dryRun && options.apiKey) {
    try {
      models = await availableModels(options.apiKey);
    } catch {
      console.warn("Model discovery unavailable; generating deterministic fallbacks.");
    }
  }
  await mkdir(options.outputDir, { recursive: true });
  await mkdir(options.cacheDir, { recursive: true });
  const revision = options.revision ?? "1";
  const selected = catalog.filter((s) => !options.only?.length || options.only.includes(s.key));
  const generate = async (spec: (typeof catalog)[number]) => {
    let pose = await fallbackPose(spec);
    let meta: Omit<Provenance, "sha256"> = {
      key: spec.key,
      source: "programmatic",
      prompt: spec.prompt,
      seed: PIPELINE_SEED,
      revision,
      note: options.dryRun ? "Offline dry run" : "No successful API generation",
    };
    for (const model of models) {
      try {
        const result = await generateImage(
          spec,
          model,
          options.apiKey!,
          options.cacheDir,
          revision,
        );
        pose = await processGeneration(result.raw, spec, result.chroma);
        meta = {
          key: spec.key,
          source: model,
          prompt: result.prompt,
          seed: null,
          revision,
          cacheKey: result.cacheKey,
          note: `${result.chroma ? "Chroma blue removed" : "Native background"}; single key pose with deterministic derived frames`,
        };
        break;
      } catch {
        console.warn(`${spec.key}: ${model} unavailable; trying next source.`);
      }
    }
    const png = await packAsset(pose, spec).png();
    await writeFile(path.join(options.outputDir, `${spec.key}.png`), png);
    provenance.push({ ...meta, sha256: createHash("sha256").update(png).digest("hex") });
    console.log(`${spec.key}: ${meta.source}`);
  };
  for (let i = 0; i < selected.length; i += 3) {
    await Promise.all(selected.slice(i, i + 3).map(generate));
  }
  const sources = new Set(provenance.map((p) => p.source));
  manifest.generatedBy = sources.size === 1 ? provenance[0].source : "mixed";
  ArtManifestSchema.parse(manifest);
  provenance.sort((a, b) => a.key.localeCompare(b.key));
  await writeFile(
    path.join(options.outputDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await writeFile(provenanceFile, `${JSON.stringify(provenance, null, 2)}\n`);
  return { manifest, provenance };
}

export async function contactSheet(outputDir: string, filename: string): Promise<void> {
  const specs = assetCatalog();
  const p = new Pixels(1000, Math.ceil(specs.length / 4) * 200 + 64);
  p.rect(0, 0, p.width, p.height, 1);
  text(p, "USER + JEV: P(DOOM) PROTOCOL", 24, 16, 13, 2);
  text(p, "ART CATALOG - SINGLE KEY POSES + DERIVED ANIMATIONS", 24, 42, 7);
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    const x = (i % 4) * 250,
      y = Math.floor(i / 4) * 200 + 64;
    p.rect(x + 8, y + 8, 234, 184, 2);
    text(p, spec.key, x + 16, y + 17, 8);
    let image = sharp(await readFile(path.join(outputDir, `${spec.key}.png`)));
    if (spec.sheet || spec.kind === "billboards" || spec.kind === "tiles") {
      image = image.extract({ left: 0, top: 0, width: spec.width, height: spec.height });
    }
    const scale = Math.min(4, Math.floor(Math.min(210 / spec.width, 140 / spec.height)));
    const w = scale >= 1 ? spec.width * scale : 210;
    const h = scale >= 1 ? spec.height * scale : Math.round((spec.height * 210) / spec.width);
    const { data, info } = await image
      .resize(w, h, { kernel: "nearest", fit: "inside" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    p.blit(
      new Pixels(info.width, info.height, data),
      x + Math.floor((250 - info.width) / 2),
      y + 36 + Math.floor((145 - info.height) / 2),
    );
  }
  await writeFile(filename, await p.png());
}

async function main() {
  const args = process.argv.slice(2);
  const value = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const outputDir = path.resolve(value("--output") ?? path.join(root, "public/art"));
  const cacheDir = path.join(root, "scripts/art/cache");
  await runPipeline({
    outputDir,
    cacheDir,
    dryRun: args.includes("--dry-run"),
    apiKey: process.env.OPENAI_API_KEY,
    only: value("--only")?.split(","),
    revision: value("--revision"),
  });
  await mkdir(path.join(root, "scripts/art/review"), { recursive: true });
  await contactSheet(outputDir, path.join(root, "scripts/art/review/contact-sheet.png"));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error("Art pipeline failed. Check output permissions and command arguments.");
    process.exitCode = 1;
  });
}
