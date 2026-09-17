# Decision endpoint security

The browser owns the local game simulation and submits a bounded observation for
one model decision. The public API protects inference spending and server secrets.
It does not authenticate players or attest scores. A forged observation can be
schema-valid; do not use this endpoint as an authoritative multiplayer or leaderboard
service.

This reference describes the server implementation introduced by
[the Jev API track](https://github.com/onionminionops-beep/pdoom-protocol/pull/1).
See [JEV_INTEGRATION.md](JEV_INTEGRATION.md) for configuration and controller details,
and [CONTRACTS.md](CONTRACTS.md) for generated wire fields.

## Threat model and boundaries

| Threat                                   | Enforcement                                                                                                                                 | Remaining limitation                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Cross-site browser spending              | Exact origin/host validation, configured origin allowlist, rejection of missing/null origins and cross-site requests; no cross-origin CORS. | A non-browser client can construct headers. Origin checks are not user authentication.                |
| Oversized or malformed requests          | JSON checks, streamed body caps and Zod validation before inference.                                                                        | Valid observations can contain invented state.                                                        |
| Forged, expired or reused session claims | HMAC-SHA256 tokens, registered sessions, expiry/episode checks and atomic monotonic-tick reservations.                                      | A stolen unexpired bearer token may consume its remaining budget.                                     |
| Concurrent requests or distributed spend | Shared Redis session/IP/global budgets; accepted attempts are reserved atomically.                                                          | Many IPs or credentials can still create demand within the configured global cap.                     |
| Provider or storage failures             | Bounded timeouts, typed errors and no automatic inference retries. Redis errors fail closed.                                                | Availability depends on TypeSafe and Upstash; Mock fallback is the offline path.                      |
| Manipulated model output                 | Per-question allowed labels, confidence/probability checks and legal-input conversion.                                                      | Legal decisions can still be poor gameplay choices.                                                   |
| Client injection of instructions         | Server builds instructions from the validated directive ID and sends only serialized observation as state.                                  | Descriptive observation strings remain untrusted model context. They grant no extra tools or actions. |

## Session token design

`POST /api/jev/session` issues a 30-minute HMAC-SHA256 bearer token with version,
random session ID, episode ID, expiry and request budget. `JEV_SESSION_SECRET`
must contain at least 32 bytes, remain consistent across instances, and never
reach the client. Generate a dedicated value with `openssl rand -hex 32`.
Rotating it invalidates existing signatures.

Decision requests must match the token's episode and a registered session. Redis
checks stored episode, expiry, remaining budget and `tick > lastTick`, then
reserves the attempt atomically. Duplicate or older ticks return 409 before
inference. Tick history is session-local. Creating a new session does not revoke
the old one; the client cancels and discards responses when changing episodes.

Tokens are signed claims, not encrypted secrets. Keep the token out of logs,
URLs and saved gameplay exports. The browser necessarily receives its session
token; it must never receive the signing key.

## Budgets and timeouts

| Control                      | Default                                                   |
| ---------------------------- | --------------------------------------------------------- |
| Session body cap             | 1 KiB                                                     |
| Decision body cap            | 32 KiB, including chunked requests without Content-Length |
| Session lifetime             | 30 minutes                                                |
| `JEV_SESSION_REQUEST_BUDGET` | 1,200 inference attempts per session                      |
| `JEV_IP_REQUESTS_PER_MINUTE` | 120 decisions per IP sliding window                       |
| `JEV_IP_SESSIONS_PER_MINUTE` | 10 session creations per IP sliding window                |
| `JEV_GLOBAL_DAILY_BUDGET`    | 20,000 inference attempts per UTC day                     |
| `JEV_REQUEST_TIMEOUT_MS`     | 1,500 ms, including reading the TypeSafe response         |

Accepted attempts count even when inference times out or output validation fails.
There are no refunds or automatic SDK retries. Session reservation precedes the
global check, so a request denied globally still spends a session attempt.
The configured quotas count **requests**, not provider input/output tokens or
currency. Observation limits and body caps bound input size; `usage` is telemetry,
not a separate token-spend budget.

The default IP quota permits less traffic than the controller's 100 ms minimum
decision interval. Rate denials cause backoff and may cause Mock fallback. Budget
changes must be considered with cadence and cost, not presented as unlimited live
play. Server timeout, browser timeout and response freshness are distinct controls.
The client accepts observations no older than 400 ms and 45 ticks; four consecutive
failures activate Mock fallback, with live retries every 15 seconds.

## Storage and network configuration

Set both `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for production and
deployed runtimes. Partial configuration, Redis errors and limiter timeouts fail
closed. Production, unknown/unset modes, `VERCEL=1`, or
`VERCEL_ENV=production|preview` reject missing shared storage with a typed
`misconfigured` 503 before issuing tokens or contacting TypeSafe.

Only local `NODE_ENV=development|test` with both Redis variables absent may use
the process-local limiter. It resets on restart and cannot enforce quotas across
instances. A configured deployment never falls back to it after a Redis error.

Configure `JEV_ALLOWED_ORIGINS` with exact scheme, host and optional port for each
production/preview origin. Origin must match Host. Without an explicit allowlist,
the request URL host must also match. On Vercel the IP identity comes from
`x-vercel-forwarded-for`; another deployment must use a trusted reverse proxy that
overwrites `x-forwarded-for`. Missing/invalid IPs share a budget bucket. Stored IP
identity is HMAC-derived rather than plaintext.

## Secret and data handling

These variables are server-only and must never use a `NEXT_PUBLIC_` prefix:
`TYPESAFE_API_KEY`, `JEV_SESSION_SECRET`, `UPSTASH_REDIS_REST_URL`,
`UPSTASH_REDIS_REST_TOKEN`, the allowlist and all budget settings.

Only the serialized, validated `GameObservationV1` goes to TypeSafe as state.
Full world state, hidden entities and RNG state are not added to the model request.
The model supplies six typed choices; it receives no file, network, shell or
simulation-mutation tools. The browser receives applied input, probabilities,
confidence, gating, request metadata and optional usage, not provider credentials.

Production handlers do not log keys, session tokens, observations, upstream error
bodies or stack traces. SDK logging is off; responses use safe typed errors and
`Cache-Control: no-store`. Keep diagnostic exports free of bearer tokens and secrets.
Git ignores local environment files; commit only placeholder environment examples.

## Verification and deployment limits

Server-track tests cover token forgery/expiry, registration, duplicate/concurrent
ticks, body caps, origin validation, quotas, mocked Redis outages, model conversion,
freshness and fallback. Simulation tests cover shared physics, hidden-state bounds
and deterministic input application. A passing simulation suite does not establish
that real Upstash, live inference cadence or deployed origin/proxy settings work;
verify those in the integrated deployment before relying on its spend controls.
