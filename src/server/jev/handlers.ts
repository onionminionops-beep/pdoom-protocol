import "server-only";
import { z } from "zod";
import { DecisionRequestSchema, SessionResponseSchema } from "@/game/contracts/decision";
import { AI_CONFIG } from "@/game/config/ai";
import { getJevConfig } from "./config";
import { errorResponse, JevApiError } from "./errors";
import { clientIpKey, readJson, validateOrigin } from "./http";
import { getJevLimits } from "./limits";
import { issueSession, verifySession } from "./session";
import { requestDecision } from "./typesafe";

const SessionRequestSchema = z.object({ episodeId: z.string().min(1).max(64) }).strict();

export async function handleSession(request: Request): Promise<Response> {
  try {
    const config = getJevConfig();
    validateOrigin(request, config.allowedOrigins);
    const body = await readJson(request, SessionRequestSchema, 1024);
    const limits = getJevLimits(config);
    await limits.limitIp(clientIpKey(request, config), true);
    const { token, claims } = issueSession(body.episodeId, config);
    await limits.register(claims);
    return Response.json(SessionResponseSchema.parse({
      sessionToken: token, expiresAt: claims.expiresAt, requestBudget: claims.budget,
      minDecisionIntervalMs: Math.ceil(Math.max(
        AI_CONFIG.minIntervalMs, 60000 / config.ipPerMinute,
      ) * 11 / 10),
    }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleDecision(request: Request): Promise<Response> {
  try {
    const config = getJevConfig();
    validateOrigin(request, config.allowedOrigins);
    const body = await readJson(request, DecisionRequestSchema);
    const claims = verifySession(body.sessionToken, config.secret);
    if (claims.episodeId !== body.observation.episodeId) {
      throw new JevApiError("invalid_session", 401, "Observation belongs to a different episode.");
    }
    if (!process.env.TYPESAFE_API_KEY) {
      throw new JevApiError("misconfigured", 503, "Jev is not configured.");
    }
    const limits = getJevLimits(config);
    await limits.limitIp(clientIpKey(request, config), false);
    await limits.claim(claims, body.observation.tick);
    const decision = await requestDecision(body.observation, config.timeoutMs);
    return Response.json(decision, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
