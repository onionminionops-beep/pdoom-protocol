import "server-only";
import { AI_CONFIG } from "@/game/config/ai";
import { JevApiError } from "./errors";

export function jevLimitsDisabled(): boolean {
  return process.env.JEV_DISABLE_LIMITS === "1" && process.env.VERCEL_ENV === "preview";
}

function positiveInteger(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new JevApiError("misconfigured", 503, "Jev configuration is invalid.");
  }
  return parsed;
}

export function validateJevStorage(
  redisUrl: string | undefined,
  redisToken: string | undefined,
): void {
  const local = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
  const deployed =
    process.env.VERCEL === "1" ||
    process.env.VERCEL_ENV === "production" ||
    process.env.VERCEL_ENV === "preview";
  if (Boolean(redisUrl) !== Boolean(redisToken) || (!redisUrl && (!local || deployed))) {
    throw new JevApiError("misconfigured", 503, "Jev storage is not configured.");
  }
}

export function getJevConfig() {
  const secret = process.env.JEV_SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new JevApiError("misconfigured", 503, "Jev sessions are not configured.");
  }
  const customRedis = Boolean(
    process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_TOKEN,
  );
  const redisUrl = customRedis ? process.env.UPSTASH_REDIS_REST_URL : process.env.KV_REST_API_URL;
  const redisToken = customRedis
    ? process.env.UPSTASH_REDIS_REST_TOKEN
    : process.env.KV_REST_API_TOKEN;
  validateJevStorage(redisUrl, redisToken);
  return {
    secret,
    sessionTtlMs: 30 * 60 * 1000,
    sessionBudget: positiveInteger("JEV_SESSION_REQUEST_BUDGET", 1200),
    ipPerMinute: positiveInteger("JEV_IP_REQUESTS_PER_MINUTE", 120),
    sessionsPerMinute: positiveInteger("JEV_IP_SESSIONS_PER_MINUTE", 10),
    dailyBudget: positiveInteger("JEV_GLOBAL_DAILY_BUDGET", 20000),
    timeoutMs: positiveInteger("JEV_REQUEST_TIMEOUT_MS", AI_CONFIG.requestTimeoutMs),
    allowedOrigins:
      process.env.JEV_ALLOWED_ORIGINS?.split(",")
        .map((s) => s.trim())
        .filter(Boolean) ?? [],
    redisUrl,
    redisToken,
  };
}

export type JevConfig = ReturnType<typeof getJevConfig>;
