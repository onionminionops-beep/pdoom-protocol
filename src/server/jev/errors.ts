import "server-only";
import { ApiErrorSchema, type ApiError } from "@/game/contracts/decision";

export class JevApiError extends Error {
  constructor(
    readonly code: ApiError["error"],
    readonly status: number,
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

export function errorResponse(error: unknown): Response {
  const safe =
    error instanceof JevApiError
      ? error
      : new JevApiError("upstream_unavailable", 503, "Jev is temporarily unavailable.");
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (safe.retryAfterMs !== undefined) {
    headers["Retry-After"] = String(Math.ceil(safe.retryAfterMs / 1000));
  }
  return Response.json(
    ApiErrorSchema.parse({
      error: safe.code,
      message: safe.message,
      retryAfterMs: safe.retryAfterMs,
    }),
    { status: safe.status, headers },
  );
}
