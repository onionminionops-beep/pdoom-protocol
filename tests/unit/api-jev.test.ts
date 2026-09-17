import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiErrorSchema, SessionResponseSchema, type DecisionResponse } from "@/game/contracts/decision";
import { neutralInput } from "@/game/contracts/input";
import { CONSENSUS_HEIGHTS } from "@/game/levels/consensusHeights";
import { buildObservation } from "@/game/observation/build";
import { createWorld } from "@/game/sim/world";
import { getJevConfig } from "@/server/jev/config";
import { issueSession, verifySession } from "@/server/jev/session";
import { POST as sessionPost, runtime as sessionRuntime } from "@/app/api/jev/session/route";
import { POST as decisionPost, runtime as decisionRuntime } from "@/app/api/jev/decision/route";
import { MemoryJevLimits } from "@/server/jev/limits";
import { JevApiError } from "@/server/jev/errors";
import { clientIpKey } from "@/server/jev/http";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ requestDecision: vi.fn(), getJevLimits: vi.fn() }));
vi.mock("@/server/jev/typesafe", () => ({ requestDecision: mocks.requestDecision }));
vi.mock("@/server/jev/limits", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/jev/limits")>(), getJevLimits: mocks.getJevLimits,
}));

function observation() {
  return buildObservation(createWorld({
    level: CONSENSUS_HEIGHTS, seed: 42, episodeId: "ep-test", directive: "SPEEDRUNNER",
    slots: { p1: "HUMAN", p2: "JEV" },
  }), "p2", 0);
}

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://game.example/api/jev/decision", {
    method: "POST", headers: {
      origin: "https://game.example", host: "game.example", "content-type": "application/json", ...headers,
    }, body: JSON.stringify(body),
  });
}

async function session() {
  const response = await sessionPost(request({ episodeId: "ep-test" }));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  return SessionResponseSchema.parse(await response.json());
}

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(ApiErrorSchema.parse(await response.json()).error).toBe(code);
  expect(response.headers.get("cache-control")).toBe("no-store");
}

beforeEach(() => {
  vi.stubEnv("JEV_SESSION_SECRET", "test-session-secret-with-at-least-32-bytes");
  vi.stubEnv("TYPESAFE_API_KEY", "test-only");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  vi.stubEnv("JEV_ALLOWED_ORIGINS", "https://game.example");
  vi.stubEnv("JEV_SESSION_REQUEST_BUDGET", "2");
  vi.stubEnv("JEV_IP_REQUESTS_PER_MINUTE", "5");
  vi.stubEnv("JEV_IP_SESSIONS_PER_MINUTE", "2");
  vi.stubEnv("JEV_GLOBAL_DAILY_BUDGET", "3");
  vi.stubEnv("JEV_REQUEST_TIMEOUT_MS", "1500");
  mocks.requestDecision.mockReset();
  mocks.getJevLimits.mockReset().mockReturnValue(new MemoryJevLimits(getJevConfig()));
});
afterEach(() => vi.unstubAllEnvs());

describe("signed Jev sessions", () => {
  it.each([
    { budget: 1200, perMinute: 120, interval: 550 },
    { budget: 12000, perMinute: 60, interval: 1100 },
    { budget: 600, perMinute: 120, interval: 550 },
  ])("advertises pacing for $budget requests and $perMinute/minute without changing signed budgets", async ({ budget, perMinute, interval }) => {
    vi.stubEnv("JEV_SESSION_REQUEST_BUDGET", String(budget));
    vi.stubEnv("JEV_IP_REQUESTS_PER_MINUTE", String(perMinute));
    const result = await session();
    expect(result.minDecisionIntervalMs).toBe(interval);
    expect(result.requestBudget).toBe(budget);
    const config = getJevConfig();
    expect(verifySession(result.sessionToken, config.secret).budget).toBe(budget);
    expect(config.ipPerMinute).toBe(perMinute);
  });

  it("binds claims to the signature and expires after 30 minutes", () => {
    const config = getJevConfig();
    const { token, claims } = issueSession("ep-test", config, 100);
    expect(claims.expiresAt).toBe(1800100);
    expect(verifySession(token, config.secret, 101)).toEqual(claims);
    expect(() => verifySession(token, config.secret, claims.expiresAt)).toThrow(JevApiError);
    expect(() => verifySession(token, "another-secret", 101)).toThrow(JevApiError);
    const [, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...claims, budget: 10000 })).toString("base64url");
    expect(() => verifySession(`${forged}.${signature}`, config.secret, 101)).toThrow(JevApiError);
    for (const invalid of ["", token + ".extra", "x".repeat(513), "invalid.signature"]) {
      expect(() => verifySession(invalid, config.secret, 101)).toThrow(JevApiError);
    }
  });

  it("runs both routes on Node and limits session issuance", async () => {
    expect([sessionRuntime, decisionRuntime]).toEqual(["nodejs", "nodejs"]);
    await session();
    await session();
    const denied = await sessionPost(request({ episodeId: "ep-test" }));
    expect(denied.headers.get("retry-after")).toBeTruthy();
    await expectError(denied, 429, "rate_limited");
  });

  it.each<Record<string, string>>([
    { origin: "https://evil.example" },
    { origin: "null" },
    { origin: "" },
    { host: "evil.example" },
    { "sec-fetch-site": "cross-site" },
  ])("rejects untrusted Origin/Host %j", async (headers) => {
    await expectError(await sessionPost(request({ episodeId: "ep-test" }, headers)), 403, "forbidden_origin");
  });

  it("checks the request URL host when no explicit allowlist is configured", async () => {
    vi.stubEnv("JEV_ALLOWED_ORIGINS", "");
    await expectError(await sessionPost(request({ episodeId: "ep-test" }, {
      origin: "https://evil.example", host: "evil.example",
    })), 403, "forbidden_origin");
  });

  it("hashes the platform-verified IP rather than the spoofable forwarded header", () => {
    const config = getJevConfig();
    vi.stubEnv("VERCEL", "1");
    const first = clientIpKey(request({}, {
      "x-vercel-forwarded-for": "192.0.2.1", "x-forwarded-for": "198.51.100.1",
    }), config);
    const second = clientIpKey(request({}, {
      "x-vercel-forwarded-for": "192.0.2.1", "x-forwarded-for": "198.51.100.2",
    }), config);
    expect(first).toBe(second);
    expect(first).not.toContain("192.0.2.1");
  });
});

describe("decision route", () => {
  it.each([
    { name: "production", nodeEnv: "production", vercel: "", vercelEnv: "" },
    { name: "Vercel with development NODE_ENV", nodeEnv: "development", vercel: "1", vercelEnv: "" },
    { name: "Vercel preview", nodeEnv: "test", vercel: "", vercelEnv: "preview" },
    { name: "Vercel production", nodeEnv: "development", vercel: "", vercelEnv: "production" },
    { name: "unset NODE_ENV", nodeEnv: undefined, vercel: "", vercelEnv: "" },
  ])("fails closed for both routes without Redis in $name", async ({ nodeEnv, vercel, vercelEnv }) => {
    const { sessionToken } = await session();
    mocks.getJevLimits.mockClear();
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("VERCEL", vercel);
    vi.stubEnv("VERCEL_ENV", vercelEnv);
    await expectError(await sessionPost(request({ episodeId: "ep-test" })), 503, "misconfigured");
    await expectError(await decisionPost(request({ sessionToken, observation: observation() })), 503, "misconfigured");
    expect(mocks.getJevLimits).not.toHaveBeenCalled();
    expect(mocks.requestDecision).not.toHaveBeenCalled();
  });

  it("accepts fully configured Upstash in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-only");
    expect(getJevConfig()).toMatchObject({
      redisUrl: "https://redis.example", redisToken: "test-only",
    });
  });

  it.each(["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"])("rejects partial Redis configuration with only %s", async (name) => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv(name, "test-only");
    await expectError(await sessionPost(request({ episodeId: "ep-test" })), 503, "misconfigured");
    expect(mocks.requestDecision).not.toHaveBeenCalled();
  });

  it.each([
    { tick: -1 }, { schemaVersion: "2.0" }, { self: { character: "user" } },
    { directive: { id: "EVIL", description: "" } }, { hostileProjectiles: Array(9).fill({}) },
  ])("rejects malformed observations before inference %j", async (patch) => {
    const { sessionToken } = await session();
    await expectError(await decisionPost(request({ sessionToken, observation: { ...observation(), ...patch } })), 400, "invalid_request");
    expect(mocks.requestDecision).not.toHaveBeenCalled();
  });

  it("caps JSON payloads with and without a Content-Length header", async () => {
    const { sessionToken } = await session();
    const headersList: Record<string, string>[] = [{}, { "content-length": "40000" }];
    for (const headers of headersList) {
      await expectError(await decisionPost(request({
        sessionToken, observation: observation(), padding: "a".repeat(33000),
      }, headers)), 413, "payload_too_large");
    }
    expect(mocks.requestDecision).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and unsupported content types", async () => {
    const malformed = new Request(request({}), { body: "{" });
    await expectError(await decisionPost(malformed), 400, "invalid_request");
    await expectError(await decisionPost(request({}, { "content-type": "text/plain" })), 400, "invalid_request");
  });

  it("rejects unknown sessions and mismatched episodes without calling TypeSafe", async () => {
    const config = getJevConfig();
    const unknown = issueSession("ep-test", config);
    await expectError(await decisionPost(request({ sessionToken: unknown.token, observation: observation() })), 401, "invalid_session");
    const { sessionToken } = await session();
    await expectError(await decisionPost(request({
      sessionToken, observation: { ...observation(), episodeId: "old-episode" },
    })), 401, "invalid_session");
    expect(mocks.requestDecision).not.toHaveBeenCalled();
  });

  it("allows only one concurrent claim of a tick and enforces the session budget", async () => {
    const { sessionToken } = await session();
    const obs = observation();
    const input = neutralInput(obs.episodeId, obs.tick);
    mocks.requestDecision.mockResolvedValue({ input } satisfies Partial<DecisionResponse>);
    const responses = await Promise.all([1, 2].map(() => decisionPost(request({ sessionToken, observation: obs }))));
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(mocks.requestDecision).toHaveBeenCalledTimes(1);
    expect(mocks.requestDecision).toHaveBeenCalledWith(obs, 1500);
    const fresh = await decisionPost(request({ sessionToken, observation: { ...obs, tick: 1 } }));
    expect(fresh.status).toBe(200);
    await expectError(await decisionPost(request({ sessionToken, observation: { ...obs, tick: 2 } })), 429, "session_budget_exhausted");
    expect(mocks.requestDecision).toHaveBeenCalledTimes(2);
  });

  it("sanitizes unexpected and upstream timeout errors", async () => {
    const { sessionToken } = await session();
    mocks.requestDecision.mockRejectedValueOnce(new Error("sensitive stack and key"));
    const response = await decisionPost(request({ sessionToken, observation: observation() }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "upstream_unavailable", message: "Jev is temporarily unavailable.",
    });
    mocks.requestDecision.mockRejectedValueOnce(new JevApiError("upstream_timeout", 504, "Jev took too long to respond."));
    await expectError(await decisionPost(request({
      sessionToken, observation: { ...observation(), tick: 1 },
    })), 504, "upstream_timeout");
  });

  it("rejects incomplete server configuration", async () => {
    vi.stubEnv("JEV_SESSION_SECRET", "");
    await expectError(await sessionPost(request({ episodeId: "ep-test" })), 503, "misconfigured");
  });
});

it("keeps secret identifiers out of client code", () => {
  const roots = ["src/game", "src/app/play", "src/components"];
  for (const root of roots.filter(existsSync)) {
    const files = readdirSync(root, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile());
    for (const file of files) {
      const name = path.join(file.parentPath, file.name);
      expect(readFileSync(name, "utf8"), name).not.toMatch(/TYPESAFE_API_KEY|JEV_SESSION_SECRET/);
    }
  }
});
