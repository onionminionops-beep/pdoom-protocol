# Jev integration

Track A implements the TypeSafe boundary and the live controller. The simulation,
physics, weapons, hitboxes, observation contract and directives remain shared with
the human controller.

## Environment

Use Node 22 and `npm ci`. Copy `.env.example` to `.env.local` for Next.js, or set
these variables in the hosting environment. All variables below are server-only;
do not prefix them with `NEXT_PUBLIC_`.

| Variable                     | Default / meaning                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TYPESAFE_API_KEY`           | Required for live inference. TypeSafe API key.                                                                                                          |
| `JEV_SESSION_SECRET`         | Required for sessions, at least 32 bytes. Generate with `openssl rand -hex 32`. Keep consistent across instances; rotation invalidates existing tokens. |
| `UPSTASH_REDIS_REST_URL`     | Required in production and deployed runtimes, together with its token. Optional for local development and unit tests.                                   |
| `UPSTASH_REDIS_REST_TOKEN`   | Upstash REST token with read/write/script access.                                                                                                       |
| `JEV_ALLOWED_ORIGINS`        | Comma-separated exact browser origins, e.g. `https://game.example,http://localhost:3000`. Configure production and preview origins explicitly.          |
| `JEV_SESSION_REQUEST_BUDGET` | `1200` inference attempts per session.                                                                                                                  |
| `JEV_IP_REQUESTS_PER_MINUTE` | `120` decision requests per IP, sliding window.                                                                                                         |
| `JEV_IP_SESSIONS_PER_MINUTE` | `10` session creations per IP, separate sliding window.                                                                                                 |
| `JEV_GLOBAL_DAILY_BUDGET`    | `20000` inference attempts across all sessions, UTC day.                                                                                                |
| `JEV_REQUEST_TIMEOUT_MS`     | `1500` for the TypeSafe request, including reading its response.                                                                                        |

Vercel Marketplace's Upstash integration supplies `KV_REST_API_URL` and
`KV_REST_API_TOKEN`. These are accepted together when no explicit
`UPSTASH_REDIS_REST_*` values are configured. Explicit Upstash credentials take
precedence; incomplete pairs are rejected rather than mixed across providers.
All four names are server-only.

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

### Temporary Preview bypass

Set the server-only `JEV_DISABLE_LIMITS=1` on the intended Vercel Preview deployment
to temporarily skip IP decision, session issuance, global daily and per-session
budget gates. It is effective only when `VERCEL_ENV` is exactly `preview`;
production, development and unknown environments retain their limits even with
the flag set. Redis remains required on Preview.

Unlimited session responses advertise `requestBudget: null` and
`minDecisionIntervalMs: 100`. Signed tokens still contain the normal positive
session budget. Registration, atomic monotonic tick/episode/expiry checks, HMAC,
origin/host and payload validation remain enforced. Session usage still increments;
IP/issuance/daily limiter calls are skipped. The client keeps one request in flight,
adaptive pacing, selected 100–250 ms holds and the 750 ms/45-tick freshness caps.
The advertised 100 ms is a minimum, not a promised request frequency.

To restore limits, remove `JEV_DISABLE_LIMITS` from the Preview environment and
redeploy. New sessions advertise the normal budget and pacing. Previously issued
tokens gain no permanent exemption: normal limits apply immediately in the restored
runtime, including the stored session usage. Start a new game to refresh the
client's advertised pacing. Existing deployments retain their own environment
configuration until replaced.

## Request flow

1. `POST /api/jev/session` accepts `{ "episodeId": "..." }`. It validates origin,
   host, JSON and the session issuance budget. It registers a random session ID and
   issues a 30-minute HMAC-SHA256 token containing version, ID, episode, expiry and
   request budget. The response is the existing `SessionResponseSchema`:
   `{ sessionToken, expiresAt, requestBudget, minDecisionIntervalMs }`.
   The advertised interval is advisory client pacing; all server budget checks
   still apply to every request unless the temporary Preview bypass is effective.
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

| `QuestionId`        | Choices                            | Threshold / fallback |
| ------------------- | ---------------------------------- | -------------------- |
| `horizontal_input`  | `left`, `neutral`, `right`         | `0.20` / `neutral`   |
| `vertical_action`   | `none`, `jump`, `drop`             | `0.20` / `none`      |
| `shoot_input`       | `"true"`, `"false"`                | `0.50` / `false`     |
| `dash_input`        | `"true"`, `"false"`                | `0.55` / `false`     |
| `interaction_input` | `"true"`, `"false"`                | `0.50` / `false`     |
| `input_duration`    | `"100"`, `"150"`, `"200"`, `"250"` | `0.10` / `100` ms    |

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
  Additive optional fields `minDecisionIntervalMs` and `lastRoundTripMs` expose
  the server pacing floor and total browser request/response time.
- `JevLastDecision`: `DecisionResponse` plus the `observation` sent.

Construct in browser lifecycle code and dispose on unmount or controller change:

```ts
const controller = new JevController({
  episodeId: world.episodeId,
  onStatus: (status) => updateHud(status),
});
// Each fixed simulation tick:
const input = controller.update({
  world,
  playerId: "p2",
  episodeId: world.episodeId,
  tick: world.tick,
  nowMs: performance.now(),
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
timeout. After the initial session connection, the first decision can start at
100 ms. Subsequent decisions use a start-to-start interval of
`max(minIntervalMs, session.minDecisionIntervalMs, holdForMs, roundTripMs * 1.2)`.
The server pacing floor is reserved before sending, so failures and stale
responses cannot trigger earlier retries. Server `retryAfterMs` and failure
backoff can lengthen the wait. The optional session field preserves rolling
compatibility: an older server without it retains the controller's previous
100 ms floor. Deploy the new controller and session handler together.

A response must match its sent episode and tick and arrive within **750 ms and
45 ticks** of the observation. Receipt never resets these hard observation-age
caps. A received input expires after its requested 100–250 ms hold, capped by
`staleMs` (400 ms since receipt) and the remaining observation lifetime.
The previous input can continue while awaiting another response only within
those bounds. Otherwise the controller emits neutral input, preserving the
original `basedOnTick` for accepted actions. There is no prediction, tick
retagging, automatic aiming or mock input inserted into successful live gaps.
No world fields are read directly: all decisions use `buildObservation`.

Four consecutive failures activate `MockAIController`. Live retries occur every
15 seconds while mock input continues. A valid fresh response restores live mode.
Earlier failures use exponential backoff; a server `retryAfterMs` can extend
either backoff. Invalid sessions trigger a new session request. A locally
exhausted session stays in mock mode until expiry rather than continually
requesting new tokens. Session and decision attempts never overlap, including
episode changes and disposal.

### Cadence assessment

The old 100–250 ms cadence could consume the default IP allowance in about
12–30 seconds at low latency. This follows from the code's request interval and
120/minute budget; it is not a deployed load-test result.

With limits enabled, each session advertises:

```text
ceil(1.10 * max(
  100 ms,
  60,000 ms / per-IP requests per minute
))
```

Defaults remain 120/minute per IP, 1,200/session, a 30-minute TTL and 20,000/day
globally. The default **550 ms** spacing provides 10% time headroom over the
500 ms IP floor, or about 109 requests/minute. The target game slice is 6–10
minutes, so pacing is not stretched to consume the full 30-minute token TTL.
At this cadence the session budget lasts roughly 11 minutes of continuous
requests. Exhausting it switches to the visible mock fallback until the session
expires; the controller does not acquire replacement tokens to bypass the cap.

A fake-clock test spans ten minutes with 150 ms responses: 1,091 requests, at
most 110 in any sliding minute, no overlap and no premature budget exhaustion.
Tests also cover a stricter IP budget, failures, slow responses, short holds,
session exhaustion and independent wall-clock/tick cutoffs. These are deterministic
controller tests, not deployment measurements.

This deliberately produces visible neutral gaps: at steady 550 ms cadence and
equal response latency, the 100–250 ms holds leave 300–450 ms gaps. Slower
responses and freshness cutoffs can lengthen them. Extending an action to cover
the gap would change the requested behavior. `live` means live API mode, not
that an input remains active. Multiple clients sharing an IP or the global daily
allowance can still receive 429 responses. Pacing is advisory and does not
reserve a share of those common budgets.

The recorded TypeSafe request below measures adapter inference latency only.
Parent integration separately reported a 174 ms local TypeSafe call. Neither
measurement includes deployed Upstash and browser/Vercel transit.
The new 750 ms acceptance window aligns with the existing 45-tick ceiling at
60 Hz; its adequacy for production latency is a hypothesis pending deployed
measurements. `lastRoundTripMs` includes storage, transit, inference and response
parsing; `lastLatencyMs` remains server inference time. Round-trip measurements
are published even when a parsed response is rejected as stale, so the HUD/dev
panel can expose the gap.

Increasing the server timeout alone cannot make the client accept older
observations. Client network timeout/freshness settings live in `AI_CONFIG`;
all security budgets and their enforcement remain unchanged.

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
      "type": "choice",
      "choice": "right",
      "confidence": 0.73,
      "probabilities": { "neutral": 0.18, "right": 0.8099999999999999, "left": 0.01 }
    },
    "vertical_action": {
      "type": "choice",
      "choice": "none",
      "confidence": 0.5,
      "probabilities": { "drop": 0.08, "none": 0.67, "jump": 0.25 }
    },
    "shoot_input": {
      "type": "choice",
      "choice": "true",
      "confidence": 1,
      "probabilities": { "true": 1, "false": 0 }
    },
    "dash_input": {
      "type": "choice",
      "choice": "true",
      "confidence": 0.03,
      "probabilities": { "true": 0.52, "false": 0.48 }
    },
    "interaction_input": {
      "type": "choice",
      "choice": "false",
      "confidence": 1,
      "probabilities": { "true": 0, "false": 1 }
    },
    "input_duration": {
      "type": "choice",
      "choice": "250",
      "confidence": 0.12,
      "probabilities": { "100": 0.26, "150": 0.17, "200": 0.23, "250": 0.34 }
    }
  },
  "usage": { "input_tokens": 1630, "output_tokens": 215 }
}
```

The original verification applied `right` / `none`, shoot `true`, dash `false`,
interact `false`, hold `100` ms. With the calibrated duration threshold of `0.10`,
the same sample's `0.12` confidence now accepts its selected `250` ms hold.
The low-confidence dash remains gated.

## Parent-track follow-ups

Wire the controller and HUD/dev panel into the client track, supplying the world
episode ID at construction. Keep `input` as the wire response field. The session
contract adds optional `minDecisionIntervalMs` and nullable `requestBudget`.
Deploy the session handler and null-aware controller together for the Preview bypass.
`AI_CONFIG.confidenceThresholds.duration` and `maxResponseAgeMs` are additive.
The only dependency addition is `server-only@0.0.1`; reconcile lockfile changes
when integrating other tracks. The placeholder-only `.env.example` is explicitly
tracked despite the starter's `.env*` ignore rule.

Configure production secrets and Upstash plus allowed origins before rollout.
Redis behavior is unit-tested with mocks; a real Upstash deployment and browser
gameplay have not been exercised in this track. Parent owns provisioning and
client integration. Measure deployed round-trip latency before further freshness
tuning. The normal pacing update does not raise any budget; the temporary Preview
flag explicitly bypasses budget gates only on the deployments where it is enabled.
