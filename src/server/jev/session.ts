import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { JevApiError } from "./errors";
import type { JevConfig } from "./config";

const SessionClaimsSchema = z.object({
  v: z.literal(1),
  id: z.uuid(),
  episodeId: z.string().min(1).max(64),
  expiresAt: z.number().int().positive(),
  budget: z.number().int().positive(),
}).strict();

export type SessionClaims = z.infer<typeof SessionClaimsSchema>;

export function issueSession(episodeId: string, config: JevConfig, now = Date.now()) {
  const claims = SessionClaimsSchema.parse({
    v: 1,
    id: randomUUID(),
    episodeId,
    expiresAt: now + config.sessionTtlMs,
    budget: config.sessionBudget,
  });
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", config.secret).update(payload).digest("base64url");
  return { claims, token: `${payload}.${signature}` };
}

export function verifySession(token: string, secret: string, now = Date.now()): SessionClaims {
  try {
    if (token.length > 512) throw new Error();
    const parts = token.split(".");
    if (parts.length !== 2 || !parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p))) throw new Error();
    const [payload, signature] = parts;
    const expected = createHmac("sha256", secret).update(payload).digest();
    const received = Buffer.from(signature, "base64url");
    if (received.toString("base64url") !== signature ||
        received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error();
    const claims = SessionClaimsSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    if (claims.expiresAt <= now) throw new Error();
    return claims;
  } catch {
    throw new JevApiError("invalid_session", 401, "Session is invalid or expired.");
  }
}
