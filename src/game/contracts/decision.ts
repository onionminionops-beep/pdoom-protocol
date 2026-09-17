import { z } from "zod";
import { GameObservationV1Schema } from "./observation";
import { PlayerInputV1Schema } from "./input";

const Probabilities = z.record(z.string(), z.number());

const ChoiceAnswerSchema = z.object({
  choice: z.string(),
  probabilities: Probabilities,
  confidence: z.number().min(0).max(1),
});

export const DecisionRequestSchema = z.object({
  sessionToken: z.string().min(16).max(512),
  observation: GameObservationV1Schema,
});
export type DecisionRequest = z.infer<typeof DecisionRequestSchema>;

/** Wire format returned by POST /api/jev/decision. */
export const DecisionResponseSchema = z.object({
  requestId: z.string(),
  episodeId: z.string(),
  basedOnTick: z.number().int().nonnegative(),
  input: PlayerInputV1Schema,
  answers: z.object({
    horizontal_input: ChoiceAnswerSchema,
    vertical_action: ChoiceAnswerSchema,
    shoot_input: ChoiceAnswerSchema,
    dash_input: ChoiceAnswerSchema,
    interaction_input: ChoiceAnswerSchema,
    input_duration: ChoiceAnswerSchema,
  }),
  /** Per-axis: true when confidence fell below threshold and the axis was neutralised. */
  gated: z.object({
    horizontal: z.boolean(),
    vertical: z.boolean(),
    shoot: z.boolean(),
    dash: z.boolean(),
    interact: z.boolean(),
  }),
  latencyMs: z.number().nonnegative(),
  model: z.string(),
  usage: z
    .object({ input_tokens: z.number().optional(), output_tokens: z.number().optional() })
    .optional(),
});
export type DecisionResponse = z.infer<typeof DecisionResponseSchema>;

export const SessionResponseSchema = z.object({
  sessionToken: z.string(),
  expiresAt: z.number(),
  requestBudget: z.number().int(),
  minDecisionIntervalMs: z.number().int().positive().optional(),
});
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

export const ApiErrorSchema = z.object({
  error: z.enum([
    "invalid_request",
    "forbidden_origin",
    "payload_too_large",
    "invalid_session",
    "session_budget_exhausted",
    "rate_limited",
    "global_budget_exhausted",
    "upstream_unavailable",
    "upstream_timeout",
    "misconfigured",
  ]),
  message: z.string(),
  retryAfterMs: z.number().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
