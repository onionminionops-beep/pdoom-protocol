import { expect, it, vi } from "vitest";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { DecisionResponseSchema } from "@/game/contracts/decision";
import { CONSENSUS_HEIGHTS } from "@/game/levels/consensusHeights";
import { buildObservation } from "@/game/observation/build";
import { createWorld } from "@/game/sim/world";
import { requestDecision } from "@/server/jev/typesafe";

vi.mock("server-only", () => ({}));

it.runIf(process.env.JEV_LIVE_TEST === "1")(
  "verifies one real TypeSafe decision",
  async () => {
    if (!process.env.TYPESAFE_API_KEY)
      throw new Error("Live verification requires a server API key.");
    const obs = buildObservation(
      createWorld({
        level: CONSENSUS_HEIGHTS,
        seed: 42,
        episodeId: "live-verification",
        directive: "SPEEDRUNNER",
        slots: { p1: "HUMAN", p2: "JEV" },
      }),
      "p2",
      0,
    );
    const client = new TypeSafeClient({
      apiKey: process.env.TYPESAFE_API_KEY,
      baseURL: "https://api.typesafe.ai",
      retry: { maxRetries: 0 },
      logLevel: "off",
      fetch: async (url, init) => {
        const response = await fetch(url, init);
        if (response.ok)
          process.stdout.write(
            `TypeSafe response: ${JSON.stringify(await response.clone().json())}\n`,
          );
        else process.stdout.write(`TypeSafe status: ${response.status}\n`);
        return response;
      },
    });
    const decision = await requestDecision(obs, 10000, client);
    expect(DecisionResponseSchema.safeParse(decision).success).toBe(true);
    process.stdout.write(`Jev latency (ms): ${decision.latencyMs}\n`);
  },
  15000,
);
