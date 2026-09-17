import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";
import type { JevConfig } from "./config";
import { JevApiError } from "./errors";

export function validateOrigin(request: Request, allowedOrigins: string[]): void {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const target = new URL(request.url);
  let valid = false;
  try {
    const parsed = new URL(origin ?? "");
    valid = parsed.origin === origin && ["http:", "https:"].includes(parsed.protocol) &&
      parsed.host === host && (!allowedOrigins.length || allowedOrigins.includes(parsed.origin));
    if (!allowedOrigins.length) valid = valid && parsed.host === target.host;
  } catch {}
  if (!valid || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new JevApiError("forbidden_origin", 403, "A same-origin request is required.");
  }
}

export function clientIpKey(request: Request, config: JevConfig): string {
  // Vercel overwrites this header; self-hosts must sanitize forwarded headers.
  const header = process.env.VERCEL === "1" ? "x-vercel-forwarded-for" : "x-forwarded-for";
  const ip = request.headers.get(header)?.split(",")[0].trim();
  const identity = ip && isIP(ip) ? ip : "unknown";
  return createHmac("sha256", config.secret).update(identity).digest("hex");
}

export async function readJson<T>(request: Request, schema: z.ZodType<T>, maxBytes = 32 * 1024): Promise<T> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new JevApiError("invalid_request", 400, "A JSON request body is required.");
  }
  const length = request.headers.get("content-length");
  if (length && Number(length) > maxBytes) {
    throw new JevApiError("payload_too_large", 413, "Request body is too large.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new JevApiError("invalid_request", 400, "Request body is missing.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        void reader.cancel().catch(() => {});
        throw new JevApiError("payload_too_large", 413, "Request body is too large.");
      }
      chunks.push(value);
    }
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new Error();
    return parsed.data;
  } catch (error) {
    if (error instanceof JevApiError) throw error;
    throw new JevApiError("invalid_request", 400, "Request body is invalid.");
  } finally {
    reader.releaseLock();
  }
}
