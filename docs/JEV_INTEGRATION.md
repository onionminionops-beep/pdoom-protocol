# Jev integration

Track A implements the TypeSafe boundary and the live controller. The simulation,
physics, weapons, hitboxes, observation contract and directives remain shared with
the human controller.

## Environment

Use Node 22 and `npm ci`. Copy `.env.example` to `.env.local` for Next.js, or set
these variables in the hosting environment. All variables below are server-only;
do not prefix them with `NEXT_PUBLIC_`.

| Variable | Default / meaning |
| --- | --- |
| `TYPESAFE_API_KEY` | Required for live inference. TypeSafe API key. |
| `JEV_SESSION_SECRET` | Required for sessions, at least 32 bytes. Generate with `openssl rand -hex 32`. Keep consistent across instances; rotation invalidates existing tokens. |
| `UPSTASH_REDIS_REST_URL` | Required in production and deployed runtimes, together with its token. Optional for local development and unit tests. |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash REST token with read/write/script access. |
| `JEV_ALLOWED_ORIGINS` | Comma-separated exact browser origins, e.g. `https://game.example,http://localhost:3000`. Configure production and preview origins explicitly. |
| `JEV_SESSION_REQUEST_BUDGET` | `1200` inference attempts per session. |
| `JEV_IP_REQUESTS_PER_MINUTE` | `120` decision requests per IP, sliding window. |
| `JEV_IP_SESSIONS_PER_MINUTE` | `10` session creations per IP, separate sliding window. |
| `JEV_GLOBAL_DAILY_BUDGET` | `20000` inference attempts across all sessions, UTC day. |
| `JEV_REQUEST_TIMEOUT_MS` | `1500` for the TypeSafe request, including reading its response. |

Origin must match the Host header. Missing/null origins and cross-site browser
requests are rejected. With no explicit origin allowlist, the request URL host must
also match. No cross-origin CORS access is enabled. On Vercel, the IP identity uses
`x-vercel-forwarded-for`; elsewhere the trusted reverse proxy must overwrite
`x-forwarded-for`. Missing/invalid IPs share one budget bucket. Only an HMAC of the
IP is stored.

When both Upstash variables are absent, a process-local limiter is available only
for local development and unit tests (`NODE_ENV=development` or `test`), with one
warning in development. Its counters disappear on restart.
Production, unset/unknown runtime modes and deployed Vercel runtimes require both
Upstash variables. `VERCEL=1` or `VERCEL_ENV=production|preview` prohibits local
fallback even with a development/test `NODE_ENV`. Both routes return a typed
`misconfigured` 503 before issuing tokens or calling TypeSafe when storage is
missing. Configuration and limiter selection both enforce this, including before
returning a cached limiter. Partial Redis configuration also fails closed, as do
Redis errors and rate limiter timeouts; storage failures never switch a configured
deployment to memory.

## Request flow

1. `POST /api/jev/session` accepts `{ "episodeId": "..." }`. It validates origin,
   host, JSON and the session issuance budget. It registers a random session ID and
   issues a 30-minute HMAC-SHA256 token containing version, ID, episode, expiry and
   request budget. The response is the existing `SessionResponseSchema`:
   `{ sessionToken, expiresAt, requestBudget }`.
2. `POST /api/jev/decision` accepts the existing `DecisionRequestSchema`:
   `{ sessionToken, observation }`. The body is capped at 32 KiB even when
   Content-Length is missing; the session body cap is 1 KiB.
3. The handler validates the observation through `GameObservationV1Schema`, checks
   the token's signature and expiry, and matches its episode to the observation.
   An unregistered session is rejected. Redis atomically checks stored episode,
   expiry, budget and `observation.tick > lastTick`, then reserves the attempt.
   Duplicate or older ticks return 409 before inference. Tick history is scoped
   to the session, not shared across unrelated sessions.
4. The IP and global limits guard inference. Accepted attempts count even if the
   model times out or returns invalid output. The Redis session claim precedes the
   global check, so a globally denied request still spends a session attempt.
   There are no refunds or automatic SDK retries.
5. One `TypeSafeClient.systemOne` call asks all six questions using `jev-latest`.
   `state` is `serializeObservation(validatedObservation)`. No world state, hidden
   entities, or free-form action prompt is added.
6. The server validates upstream answers and maps them into `PlayerInputV1`, tagged
   with the observation's episode and tick. It returns `DecisionResponseSchema`:
   `requestId`, `episodeId`, `basedOnTick`, **`input`**, `answers`, `gated`,
   `latencyMs`, `model`, and optional `usage`. `input` is the applied input field
   in the shared contract; no `appliedInput` alias was added.

Both routes explicitly use the Node runtime and set `Cache-Control: no-store`.
Errors use `ApiErrorSchema`, including safe messages, status codes and optional
`retryAfterMs`/`Retry-After`. API keys, tokens, observations, upstream error bodies
and stack traces are not logged by the production handlers. The SDK log level is
off. An upstream request ID is preserved when available; otherwise a UUID is used.

These anonymous sessions bound usage; they do not authenticate a player or prove
that a submitted observation came from an authoritative server simulation.
Episode IDs are supplied by the game client. A new session does not revoke a
previous session; the controller discards and cancels responses from its old
episode. A token cannot be used with another episode.

## Questions, directives and confidence

| `QuestionId` | Choices | Threshold / fallback |
| --- | --- | --- |
| `horizontal_input` | `left`, `neutral`, `right` | `0.40` / `neutral` |
| `vertical_action` | `none`, `jump`, `drop` | `0.45` / `none` |
| `shoot_input` | `"true"`, `"false"` | `0.50` / `false` |
| `dash_input` | `"true"`, `"false"` | `0.55` / `false` |
| `interaction_input` | `"true"`, `"false"` | `0.50` / `false` |
| `input_duration` | `"100"`, `"150"`, `"200"`, `"250"` | `0.40` / `100` ms |

Each question combines a base instruction with
`DIRECTIVES[obs.directive.id].instructionOverrides[questionId]`. Overrides are
appended to the base instruction; the validated ID is the only lookup source.
The observation's directive description remains context, never a replacement
instruction. All six choices are independent judgments in the same API call.
Jev cannot see the other choices before answering one.

Thresholds live in `src/game/config/ai.ts`. Confidence strictly below a threshold
neutralizes that axis; equality is accepted. Raw `choice`, `probabilities` and
`confidence` remain available in `answers` even when gated. The existing `gated`
object covers the five action axes. Duration gating is visible by comparing
`answers.input_duration` to `input.holdForMs`.

Boolean choices are TypeSafe string labels, converted to booleans only after
validation. Duration strings are converted to the input contract's numeric
literals. Confidence and probabilities must be within `[0, 1]`; probability keys
must be valid choices, include the selected choice, and sum to approximately one.
No aiming, facing, cooldown or physics adjustment accompanies conversion.

## Client integration

Exports from `src/game/controllers/jev.ts`:

- `JevController`, implementing `PlayerController`.
- `JevControllerOptions`: existing `fetch` and `onStatus`, plus optional
  `episodeId` and monotonic `now` for initialization/testing.
- `JevStatus`: existing modes `connecting`, `live`, `waiting`, `fallback_mock`,
  `error`, plus latency, request ID/count, consecutive failures and error code.
- `JevLastDecision`: `DecisionResponse` plus the `observation` sent.

Construct in browser lifecycle code and dispose on unmount or controller change:

```ts
const controller = new JevController({
  episodeId: world.episodeId,
  onStatus: (status) => updateHud(status),
});
// Each fixed simulation tick:
const input = controller.update({
  world, playerId: "p2", episodeId: world.episodeId,
  tick: world.tick, nowMs: performance.now(),
});
// Pass input to the existing stepWorld input map.
// On unmount/controller replacement:
controller.dispose();
```

Passing `episodeId` avoids a provisional constructor session. Omitting it is
supported: the first update cancels the provisional request and connects for the
actual episode. `getStatus()` returns a copy. `getLastDecision()` returns a deep
copy or `null`; it contains the last successfully accepted result and observation,
not a failed or discarded response.

The controller polls from `update`, never from a separate simulation clock. It
keeps exactly one session/decision request in flight, with a 2-second browser
timeout. It schedules the next decision from the previous request start using
`max(minIntervalMs, holdForMs, measuredLatency * 1.2)`. The minimum is 100 ms.
The previous input continues while awaiting a response, but becomes neutral once
its observation is older than 400 ms or 45 ticks. A response must match its sent
episode and tick and satisfy both age limits. No world fields are read directly:
all decisions use `buildObservation`.

Four consecutive failures activate `MockAIController`. Live retries occur every
15 seconds while mock input continues. A valid fresh response restores live mode.
Earlier failures use exponential backoff; a server `retryAfterMs` can extend
either backoff. Invalid sessions trigger a new session request. A locally
exhausted session stays in mock mode until expiry rather than continually
requesting new tokens. Session and decision attempts never overlap, including
episode changes and disposal.

The default 120/minute IP budget intentionally permits less traffic than the
100 ms minimum cadence. Tune the budget for desired live play and API spend;
rate denials cause backoff. Increasing only the server timeout cannot make the
client accept older observations: freshness limits are independent. Client
network timeout/cadence/freshness settings live in `AI_CONFIG`, not environment
variables.

## Mock-only use

Select the existing `MOCK_AI` slot or construct `MockAIController` directly.
This requires no secrets or HTTP calls. If the UI selects `JEV` without server
credentials, the live controller eventually falls back after configuration errors;
use `MOCK_AI` explicitly when the goal is no network traffic.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Unit tests cover observation validation, JSON caps, token forgery/expiry, unknown
sessions and old episodes, duplicate/concurrent ticks, IP/session/global budgets,
mocked Redis denials and outages, TypeSafe request shape/timeout/conversion,
confidence thresholds, client concurrency/freshness/fallback/recovery, and client
secret boundaries. `server-only` is mocked only inside server unit tests; Next.js
enforces the boundary in application builds.

The opt-in live verification test sends one sample observation through the same
server adapter. Ordinary `npm test` skips it, even when an API key is present.
With `TYPESAFE_API_KEY` already supplied securely in the shell:

```bash
JEV_LIVE_TEST=1 npm test -- tests/unit/jev-live.test.ts --disableConsoleIntercept --reporter=verbose
```

Next.js loads `.env.local`; a standalone Vitest command needs the key explicitly
in its environment. The live test uses a 10-second verification timeout and prints
only the successful response body and measured latency, never credentials.

### Observed real response

Verified on 2026-09-17 using `@typesafe-ai/sdk` 0.6.0, the seeded initial Consensus
Heights observation (seed 42, slot p2, SPEEDRUNNER), and `jev-latest`. The resolved
model was `jev-1.13.0`; adapter latency for the recorded request was 258.19 ms.
This is one observation, not a gameplay benchmark. The actual response was:

```json
{
  "model": "jev-1.13.0",
  "answers": {
    "horizontal_input": {
      "type": "choice", "choice": "right", "confidence": 0.73,
      "probabilities": { "neutral": 0.18, "right": 0.8099999999999999, "left": 0.01 }
    },
    "vertical_action": {
      "type": "choice", "choice": "none", "confidence": 0.5,
      "probabilities": { "drop": 0.08, "none": 0.67, "jump": 0.25 }
    },
    "shoot_input": {
      "type": "choice", "choice": "true", "confidence": 1,
      "probabilities": { "true": 1, "false": 0 }
    },
    "dash_input": {
      "type": "choice", "choice": "true", "confidence": 0.03,
      "probabilities": { "true": 0.52, "false": 0.48 }
    },
    "interaction_input": {
      "type": "choice", "choice": "false", "confidence": 1,
      "probabilities": { "true": 0, "false": 1 }
    },
    "input_duration": {
      "type": "choice", "choice": "250", "confidence": 0.12,
      "probabilities": { "100": 0.26, "150": 0.17, "200": 0.23, "250": 0.34 }
    }
  },
  "usage": { "input_tokens": 1630, "output_tokens": 215 }
}
```

The applied input was `right` / `none`, shoot `true`, dash `false`, interact
`false`, hold `100` ms. The low-confidence dash and duration were gated.

## Parent-track follow-ups

Wire the controller and HUD/dev panel into the client track, supplying the world
episode ID at construction. Keep `input` as the wire response field. No shared
contract shape was changed. `AI_CONFIG.confidenceThresholds.duration` is additive.
The only dependency addition is `server-only@0.0.1`; reconcile lockfile changes
when integrating other tracks. The placeholder-only `.env.example` is explicitly
tracked despite the starter's `.env*` ignore rule.

Configure production secrets and Upstash plus allowed origins before rollout.
Redis behavior is unit-tested with mocks; a real Upstash deployment and browser
gameplay have not been exercised in this track. Tune request budgets, cadence and
confidence thresholds against gameplay after the client track is integrated.
