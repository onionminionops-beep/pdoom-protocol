import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Redis } from "@upstash/redis";
import type { JevConfig } from "@/server/jev/config";
import { getJevLimits, MemoryJevLimits, RedisJevLimits } from "@/server/jev/limits";
import { issueSession } from "@/server/jev/session";

vi.mock("server-only", () => ({}));
const windows = vi.hoisted(() => ({ ip: vi.fn(), issuance: vi.fn(), daily: vi.fn() }));
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow = vi.fn();
    static fixedWindow = vi.fn();
    limit: typeof windows.ip;
    constructor({ prefix }: { prefix: string }) {
      this.limit = prefix === "jev:daily" ? windows.daily : prefix === "jev:issuance" ? windows.issuance : windows.ip;
    }
  },
}));

const config: JevConfig = {
  secret: "test-session-secret-with-at-least-32-bytes", sessionTtlMs: 1800000,
  sessionBudget: 2, ipPerMinute: 2, sessionsPerMinute: 1, dailyBudget: 3,
  timeoutMs: 1500, allowedOrigins: [], redisUrl: undefined, redisToken: undefined,
};

beforeEach(() => {
  for (const limiter of Object.values(windows)) limiter.mockReset().mockResolvedValue({
    success: true, reset: Date.now() + 60000, pending: Promise.resolve(),
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("in-memory budgets", () => {
  it("uses a sliding IP window with a separate issuance limit", async () => {
    let now = 1000;
    const limits = new MemoryJevLimits(config, () => now);
    await limits.limitIp("a", false);
    now += 100;
    await limits.limitIp("a", false);
    await expect(limits.limitIp("a", false)).rejects.toMatchObject({ code: "rate_limited", retryAfterMs: 59900 });
    await limits.limitIp("a", true);
    await expect(limits.limitIp("a", true)).rejects.toMatchObject({ code: "rate_limited" });
    await limits.limitIp("b", false);
    now = 61000;
    await limits.limitIp("a", false);
    await expect(limits.limitIp("a", false)).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("shares the daily budget across sessions and resets at UTC midnight", async () => {
    let now = 86390000;
    const limits = new MemoryJevLimits(config, () => now);
    const first = issueSession("episode-a", config, now).claims;
    const second = issueSession("episode-b", config, now).claims;
    await limits.register(first);
    await limits.register(second);
    await limits.claim(first, 0);
    await limits.claim(first, 1);
    await limits.claim(second, 0);
    await expect(limits.claim(second, 1)).rejects.toMatchObject({ code: "global_budget_exhausted", retryAfterMs: 10000 });
    now = 86400000;
    await limits.claim(second, 1);
    await expect(limits.claim(first, 2)).rejects.toMatchObject({ code: "session_budget_exhausted" });
  });

  it("rejects expired, unknown, mismatched, duplicate and older observations", async () => {
    let now = 1000;
    const limits = new MemoryJevLimits(config, () => now);
    const claims = issueSession("episode-a", config, now).claims;
    await expect(limits.claim(claims, 0)).rejects.toMatchObject({ code: "invalid_session" });
    await limits.register(claims);
    await expect(limits.claim({ ...claims, episodeId: "other" }, 0)).rejects.toMatchObject({ code: "invalid_session" });
    await limits.claim(claims, 5);
    for (const tick of [5, 4]) await expect(limits.claim(claims, tick)).rejects.toMatchObject({ code: "invalid_request" });
    now = claims.expiresAt;
    await expect(limits.claim(claims, 6)).rejects.toMatchObject({ code: "invalid_session" });
  });

  it("warns only once in development and reuses the process-local limiter", () => {
    vi.stubEnv("NODE_ENV", "development");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const first = getJevLimits(config);
    expect(getJevLimits(config)).toBe(first);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("Redis-backed budgets", () => {
  it("rejects cached local limits when production requires Redis", () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(getJevLimits(config)).toBeInstanceOf(MemoryJevLimits);
    vi.stubEnv("NODE_ENV", "production");
    expect(() => getJevLimits(config)).toThrow(expect.objectContaining({ code: "misconfigured", status: 503 }));
  });

  it("replaces cached memory limits with Redis when storage is configured", () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(getJevLimits(config)).toBeInstanceOf(MemoryJevLimits);
    vi.stubEnv("NODE_ENV", "production");
    expect(getJevLimits({ ...config, redisUrl: "https://redis.example", redisToken: "test-only" })).toBeInstanceOf(RedisJevLimits);
  });

  function backend() {
    const redis = new Redis({ url: "https://redis.example", token: "test-only", retry: false, enableAutoPipelining: false });
    const evalScript = vi.spyOn(redis, "eval").mockResolvedValue(1);
    return { limits: new RedisJevLimits(config, redis), evalScript };
  }

  it("honors per-IP and session issuance denial", async () => {
    const { limits } = backend();
    windows.ip.mockResolvedValue({ success: false, reset: Date.now() + 1000, pending: Promise.resolve() });
    await expect(limits.limitIp("ip-hash", false)).rejects.toMatchObject({ code: "rate_limited", status: 429 });
    expect(windows.ip).toHaveBeenCalledWith("ip-hash");
    windows.issuance.mockResolvedValue({ success: false, reset: Date.now() + 1000, pending: Promise.resolve() });
    await expect(limits.limitIp("ip-hash", true)).rejects.toMatchObject({ code: "rate_limited", status: 429 });
  });

  it("fails closed when Upstash returns a timeout success", async () => {
    const { limits } = backend();
    windows.ip.mockResolvedValue({ success: true, reason: "timeout", pending: Promise.resolve() });
    await expect(limits.limitIp("ip-hash", false)).rejects.toMatchObject({ code: "upstream_unavailable", status: 503 });
  });

  it.each([
    [-1, "invalid_session"], [-2, "invalid_request"], [-3, "session_budget_exhausted"], [0, "upstream_unavailable"],
  ])("rejects Redis session claim result %s", async (result, code) => {
    const { limits, evalScript } = backend();
    evalScript.mockResolvedValue(result);
    await expect(limits.claim(issueSession("ep-test", config).claims, 5)).rejects.toMatchObject({ code });
    expect(windows.daily).not.toHaveBeenCalled();
  });

  it("denies the global budget after a valid session claim", async () => {
    const { limits, evalScript } = backend();
    const session = issueSession("ep-test", config).claims;
    windows.daily.mockResolvedValue({ success: false, reset: Date.now() + 5000, pending: Promise.resolve() });
    await expect(limits.claim(session, 5)).rejects.toMatchObject({ code: "global_budget_exhausted", status: 429 });
    expect(evalScript).toHaveBeenCalledWith(expect.any(String), [`jev:session:${session.id}`], [
      session.episodeId, 5, expect.any(Number), session.budget,
    ]);
    expect(windows.daily).toHaveBeenCalledWith("all");
  });

  it("propagates Redis failures rather than switching to memory", async () => {
    const { limits, evalScript } = backend();
    evalScript.mockRejectedValue(new Error("storage down"));
    await expect(limits.claim(issueSession("ep-test", config).claims, 5)).rejects.toThrow("storage down");
    expect(windows.daily).not.toHaveBeenCalled();
  });
});
