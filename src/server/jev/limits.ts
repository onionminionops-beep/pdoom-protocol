import "server-only";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import type { JevConfig } from "./config";
import { JevApiError } from "./errors";
import type { SessionClaims } from "./session";

export interface JevLimits {
  limitIp(ip: string, issuingSession: boolean): Promise<void>;
  register(session: SessionClaims): Promise<void>;
  claim(session: SessionClaims, tick: number): Promise<void>;
}

const DAY_MS = 86400000;

function denied(code: "rate_limited" | "session_budget_exhausted" | "global_budget_exhausted", retryAfterMs?: number): never {
  throw new JevApiError(code, 429, "Jev request budget reached.", retryAfterMs);
}

function invalidSession(): never {
  throw new JevApiError("invalid_session", 401, "Session is unknown or expired.");
}

function staleTick(): never {
  throw new JevApiError("invalid_request", 409, "Observation tick is stale.");
}

export class MemoryJevLimits implements JevLimits {
  private sessions = new Map<string, { session: SessionClaims; tick: number; used: number }>();
  private windows = new Map<string, number[]>();
  private day = -1;
  private dailyUsed = 0;

  constructor(private readonly config: JevConfig, private readonly now = Date.now) {}

  async limitIp(ip: string, issuingSession: boolean): Promise<void> {
    const now = this.now();
    for (const [id, entry] of this.sessions) {
      if (entry.session.expiresAt <= now) this.sessions.delete(id);
    }
    for (const [id, window] of this.windows) {
      if (!window.length || window[window.length - 1] <= now - 60000) this.windows.delete(id);
    }
    const key = `${issuingSession ? "session" : "decision"}:${ip}`;
    const window = (this.windows.get(key) ?? []).filter((t) => t > now - 60000);
    const limit = issuingSession ? this.config.sessionsPerMinute : this.config.ipPerMinute;
    if (window.length >= limit) denied("rate_limited", window[0] + 60000 - now);
    window.push(now);
    this.windows.set(key, window);
  }

  async register(session: SessionClaims): Promise<void> {
    this.sessions.set(session.id, { session, tick: -1, used: 0 });
  }

  async claim(session: SessionClaims, tick: number): Promise<void> {
    const now = this.now();
    const entry = this.sessions.get(session.id);
    if (!entry || entry.session.episodeId !== session.episodeId || entry.session.expiresAt <= now) invalidSession();
    if (tick <= entry.tick) staleTick();
    if (entry.used >= Math.min(session.budget, entry.session.budget)) denied("session_budget_exhausted");
    const day = Math.floor(now / DAY_MS);
    if (this.day !== day) {
      this.day = day;
      this.dailyUsed = 0;
    }
    if (this.dailyUsed >= this.config.dailyBudget) denied("global_budget_exhausted", (day + 1) * DAY_MS - now);
    entry.tick = tick;
    entry.used++;
    this.dailyUsed++;
  }
}

const CLAIM_SCRIPT = `
if redis.call("EXISTS", KEYS[1]) == 0 then return -1 end
local data = redis.call("HMGET", KEYS[1], "episode", "expires", "tick", "used", "budget")
if data[1] ~= ARGV[1] or tonumber(data[2]) <= tonumber(ARGV[3]) then return -1 end
if tonumber(ARGV[2]) <= tonumber(data[3]) then return -2 end
if tonumber(data[4]) >= math.min(tonumber(data[5]), tonumber(ARGV[4])) then return -3 end
redis.call("HSET", KEYS[1], "tick", ARGV[2])
redis.call("HINCRBY", KEYS[1], "used", 1)
return 1
`;

export class RedisJevLimits implements JevLimits {
  private readonly ip: Ratelimit;
  private readonly issuance: Ratelimit;
  private readonly daily: Ratelimit;

  constructor(private readonly config: JevConfig, private readonly redis: Redis) {
    const common = { redis, analytics: false, ephemeralCache: false as const, timeout: 2000 };
    this.ip = new Ratelimit({ ...common, prefix: "jev:ip", limiter: Ratelimit.slidingWindow(config.ipPerMinute, "1 m") });
    this.issuance = new Ratelimit({ ...common, prefix: "jev:issuance", limiter: Ratelimit.slidingWindow(config.sessionsPerMinute, "1 m") });
    this.daily = new Ratelimit({ ...common, prefix: "jev:daily", limiter: Ratelimit.fixedWindow(config.dailyBudget, "1 d") });
  }

  private async check(limiter: Ratelimit, key: string, code: "rate_limited" | "global_budget_exhausted") {
    const result = await limiter.limit(key);
    await result.pending;
    if (result.reason === "timeout") {
      throw new JevApiError("upstream_unavailable", 503, "Jev storage is unavailable.");
    }
    if (!result.success) denied(code, Math.max(0, result.reset - Date.now()));
  }

  async limitIp(ip: string, issuingSession: boolean): Promise<void> {
    await this.check(issuingSession ? this.issuance : this.ip, ip, "rate_limited");
  }

  async register(session: SessionClaims): Promise<void> {
    const key = `jev:session:${session.id}`;
    const transaction = this.redis.multi();
    transaction.hset(key, { episode: session.episodeId, expires: session.expiresAt, tick: -1, used: 0, budget: session.budget });
    transaction.pexpireat(key, session.expiresAt);
    await transaction.exec();
  }

  async claim(session: SessionClaims, tick: number): Promise<void> {
    const result = await this.redis.eval<(string | number)[], number>(CLAIM_SCRIPT, [`jev:session:${session.id}`], [
      session.episodeId, tick, Date.now(), session.budget,
    ]);
    if (result === -1) invalidSession();
    if (result === -2) staleTick();
    if (result === -3) denied("session_budget_exhausted");
    if (result !== 1) throw new JevApiError("upstream_unavailable", 503, "Jev storage is unavailable.");
    await this.check(this.daily, "all", "global_budget_exhausted");
  }
}

let limits: JevLimits | undefined;
let warned = false;

export function getJevLimits(config: JevConfig): JevLimits {
  if (limits) return limits;
  if (config.redisUrl && config.redisToken) {
    limits = new RedisJevLimits(config, new Redis({
      url: config.redisUrl, token: config.redisToken, retry: false,
      signal: () => AbortSignal.timeout(2000),
    }));
  } else {
    limits = new MemoryJevLimits(config);
    if (process.env.NODE_ENV === "development" && !warned) {
      warned = true;
      console.warn("Jev is using process-local budgets; configure Upstash for shared limits.");
    }
  }
  return limits;
}
