import "server-only";
import { AI_CONFIG } from "@/game/config/ai";
import { JevApiError } from "./errors";

function positiveInteger(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new JevApiError("misconfigured", 503, "Jev configuration is invalid.");
  }
  return parsed;
}

export function getJevConfig() {
  const secret = process.env.JEV_SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new JevApiError("misconfigured", 503, "Jev sessions are not configured.");
  }
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (Boolean(redisUrl) !== Boolean(redisToken)) {
    throw new JevApiError("misconfigured", 503, "Jev storage is not configured.");
  }
  return {
    secret,
    sessionTtlMs: 30 * 60 * 1000,
    sessionBudget: positiveInteger("JEV_SESSION_REQUEST_BUDGET", 1200),
    ipPerMinute: positiveInteger("JEV_IP_REQUESTS_PER_MINUTE", 120),
    sessionsPerMinute: positiveInteger("JEV_IP_SESSIONS_PER_MINUTE", 10),
    dailyBudget: positiveInteger("JEV_GLOBAL_DAILY_BUDGET", 20000),
    timeoutMs: positiveInteger("JEV_REQUEST_TIMEOUT_MS", AI_CONFIG.requestTimeoutMs),
    allowedOrigins: process.env.JEV_ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [],
    redisUrl,
    redisToken,
  };
}

export type JevConfig = ReturnType<typeof getJevConfig>;
