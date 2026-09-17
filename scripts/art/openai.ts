import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { AssetSpec } from "./catalog";

export type ImageModel = "gpt-image-2" | "gpt-image-1";
const Models = z.object({ data: z.array(z.object({ id: z.string() })) });
const ImageResponse = z.object({ data: z.array(z.object({ b64_json: z.string().min(1) })).min(1) });

export async function availableModels(
  key: string,
  request: typeof fetch = fetch,
): Promise<ImageModel[]> {
  const response = await request("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Model discovery HTTP ${response.status}`);
  const ids = new Set(Models.parse(await response.json()).data.map((m) => m.id));
  return (["gpt-image-2", "gpt-image-1"] as const).filter((id) => ids.has(id));
}

export interface Generation {
  raw: Buffer;
  model: ImageModel;
  chroma: boolean;
  cacheKey: string;
  prompt: string;
}

export async function generateImage(
  spec: AssetSpec,
  model: ImageModel,
  key: string,
  cacheDir: string,
  revision: string,
  request: typeof fetch = fetch,
): Promise<Generation> {
  const candidates = (
    spec.transparent ? (["transparent", "opaque"] as const) : (["opaque"] as const)
  ).map((background) => {
    const chroma = background === "opaque" && spec.transparent;
    const prompt = `${spec.prompt} Art direction revision: ${revision}.${chroma ? " Render the entire background as uniform pure #0000ff, fully opaque; do not use that color within the subject." : ""}`;
    const body = {
      model,
      prompt,
      n: 1,
      size: "1024x1024",
      quality: "medium",
      output_format: "png",
      background,
    };
    const cacheKey = createHash("sha256").update(JSON.stringify(body)).digest("hex");
    const filename = path.join(cacheDir, `${spec.key}-${cacheKey}.png`);
    return { body, filename, metadata: { model, chroma, cacheKey, prompt } };
  });
  for (const { filename, metadata } of candidates) {
    try {
      return { ...metadata, raw: await readFile(filename) };
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
  }
  for (const { body, filename, metadata } of candidates) {
    const response = await request("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok) {
      if (body.background === "transparent" && response.status === 400) continue;
      throw new Error(`Image generation HTTP ${response.status}`);
    }
    const result = ImageResponse.parse(await response.json());
    const raw = Buffer.from(result.data[0].b64_json, "base64");
    await mkdir(cacheDir, { recursive: true });
    await writeFile(filename, raw);
    return { ...metadata, raw };
  }
  throw new Error("Image background unsupported");
}
