import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getJevConfig } from "@/server/jev/config";

vi.mock("server-only", () => ({}));

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("JEV_SESSION_SECRET", "test-session-secret-with-at-least-32-bytes");
  for (const name of [
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
  ]) {
    vi.stubEnv(name, undefined);
  }
});
afterEach(() => vi.unstubAllEnvs());

it("accepts the REST credentials provisioned by Vercel Marketplace", () => {
  vi.stubEnv("KV_REST_API_URL", "https://marketplace.example.com");
  vi.stubEnv("KV_REST_API_TOKEN", "test-marketplace-token");
  expect(getJevConfig()).toMatchObject({
    redisUrl: "https://marketplace.example.com",
    redisToken: "test-marketplace-token",
    sessionBudget: 1200,
    ipPerMinute: 120,
    dailyBudget: 20000,
  });
});

it("prefers an explicit Upstash pair without mixing provider credentials", () => {
  vi.stubEnv("KV_REST_API_URL", "https://marketplace.example.com");
  vi.stubEnv("KV_REST_API_TOKEN", "test-marketplace-token");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://custom.example.com");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-custom-token");
  expect(getJevConfig()).toMatchObject({
    redisUrl: "https://custom.example.com",
    redisToken: "test-custom-token",
  });
});

it.each(["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"])(
  "rejects an incomplete custom pair even with Marketplace configured: %s",
  (name) => {
    vi.stubEnv("KV_REST_API_URL", "https://marketplace.example.com");
    vi.stubEnv("KV_REST_API_TOKEN", "test-marketplace-token");
    vi.stubEnv(name, "partial-config");
    expect(() => getJevConfig()).toThrow("Jev storage is not configured.");
  },
);

it.each(["KV_REST_API_URL", "KV_REST_API_TOKEN"])(
  "fails closed with an incomplete Marketplace pair: %s",
  (name) => {
    vi.stubEnv(name, "partial-config");
    expect(() => getJevConfig()).toThrow("Jev storage is not configured.");
  },
);

it("fails closed with no Redis credentials in a deployed runtime", () => {
  expect(() => getJevConfig()).toThrow("Jev storage is not configured.");
});
