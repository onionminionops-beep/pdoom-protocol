# USER + JEV: P(DOOM) PROTOCOL

A 2D cooperative pixel-art platform shooter in Consensus Heights. You and TypeSafe's
Jev model fight doom prophets, platform across coolant, operate split-path switches,
and overload the Consensus Engine. JEV uses the same movement and weapon controls
as the human player and can visibly miss or mistime.

Next.js 16 App Router, React, TypeScript strict, Phaser 3, Zod, Vitest and Playwright.
All game art is original; no real people, logos or political symbols.

## Run

Use **Node 22** and the committed npm lockfile:

```bash
npm ci
npm run dev
```

Open `http://localhost:3000` in an integrated client/server checkout. The simulation
and headless tests work independently of the browser and live API tracks.
Choose `MOCK_AI` for offline play without credentials or model requests. Choosing
`JEV` needs the server configuration below; repeated live failures fall back to Mock.

Default controls: A/D or arrows move, W/up/Space jumps, S/down drops through
platforms, J/left click fires, K/Shift dashes, and E interacts or holds a revive.
Both active slots are needed for the assigned cooperative switches.

## How Jev plays fair

Both slots use one `MOVEMENT` configuration, the same 20 × 40 pixel body and one
`PlayerInputV1` contract. Only horizontal input changes facing. Bullets leave a
fixed muzzle in that facing direction; there is no mouse aiming, auto-aim, homing,
target snapping, enlarged hitbox or character-specific cooldown.

JEV and Mock see a bounded `GameObservationV1` with terrain hints, visible threats,
teammate state and score. They do not receive the full map, RNG state or hidden
enemies. Decisions advance the ordinary 60 Hz simulation. Late or old-episode
inputs never gain special movement or timing privileges.

## Directives

| Directive    | Priority                                    |
| ------------ | ------------------------------------------- |
| SPEEDRUNNER  | Forward progress and safe dashes.           |
| COLLECTOR    | Coins and optional ledges.                  |
| SCORE_HUNTER | Visible enemies and opportunities to score. |
| GUARDIAN     | Staying close and reviving the teammate.    |

Live directives change observation text and server question instructions. Mock
implements the same priorities using local heuristics. Neither changes physics,
weapon numbers or hitboxes. See [GAMEPLAY.md](docs/GAMEPLAY.md) for the walkthrough,
enemy tells, balance and the limits of directive comparison tests.

## Architecture

`src/game/sim` owns plain, deterministic state; Phaser renders that state.
Controllers emit inputs, `buildObservation` bounds model visibility, and Zod schemas
define the client/server boundary. Same seed plus the same inputs produces the same
simulation even with fresh episode IDs.

- [Architecture and public APIs](docs/ARCHITECTURE.md)
- [Generated input, observation and decision contracts](docs/CONTRACTS.md)
- [Live JEV configuration and lifecycle](docs/JEV_INTEGRATION.md)
- [Public endpoint threat model and budgets](docs/SECURITY.md)

Read `AGENTS.md` and the installed Next.js documentation before changing App Router
code; this project uses a newer Next.js version than many examples.

## Environment

In the integrated server checkout, copy `.env.example` to `.env.local` and fill
server-only values. Never prefix these with `NEXT_PUBLIC_` or commit real secrets.

| Variable                     | Purpose / default                                                  |
| ---------------------------- | ------------------------------------------------------------------ |
| `TYPESAFE_API_KEY`           | TypeSafe live inference key.                                       |
| `JEV_SESSION_SECRET`         | Dedicated session signing secret, at least 32 bytes.               |
| `UPSTASH_REDIS_REST_URL`     | Shared storage; required for production and Vercel previews.       |
| `UPSTASH_REDIS_REST_TOKEN`   | Matching Upstash REST token.                                       |
| `JEV_ALLOWED_ORIGINS`        | Exact comma-separated origins, including scheme and optional port. |
| `JEV_SESSION_REQUEST_BUDGET` | 1,200 inference attempts per session.                              |
| `JEV_IP_REQUESTS_PER_MINUTE` | 120 decisions per IP.                                              |
| `JEV_IP_SESSIONS_PER_MINUTE` | 10 session creations per IP.                                       |
| `JEV_GLOBAL_DAILY_BUDGET`    | 20,000 inference attempts per UTC day.                             |
| `JEV_REQUEST_TIMEOUT_MS`     | 1,500 ms upstream timeout.                                         |

Local development/test can use an in-memory limiter when both Redis variables are
absent. Production and deployed runtimes fail closed without shared storage.
Ordinary headless tests require no API credentials; do not enable live tests in CI.

## Verify

```bash
npm run lint
npm run typecheck
npm test
npm run format:check
npm run build
```

The unit suite includes full-level scripted and dual-Mock wins through real inputs,
32 randomized fairness sequences, 5,000-tick determinism, stale episodes, observation
limits, hazards, revives, score accounting and strict 3,000-tick directive comparisons.
The contract documentation test fails when its generated Zod reference drifts.

Once the integrated client supplies `tests/e2e`, run:

```bash
npx playwright install --with-deps chromium
npm run test:e2e
```

CI uses Node 22, the lockfile, all checks above, and conditionally installs Chromium
and runs Playwright when the E2E directory exists. Run `npm run format` to format
source; regenerate contract tables with
`UPDATE_CONTRACTS=1 npm test -- tests/unit/contracts.test.ts`.

## Deploy

Build and serve a production Node process with:

```bash
npm run build
npm start
```

For Vercel, import the repository, select the Next.js preset and Node 22, and use
`npm ci` / `npm run build`. Configure the server variables separately for Preview and
Production before enabling live JEV. Both environments require Upstash, TypeSafe
credentials and matching allowed origins. Deploy a preview, validate the integrated
game/API, then promote after review. Mock mode is available without model access.

## Screenshots

Capture these from the integrated client before release:

- Title screen and directive selection.
- Split Path with both cooperative routes.
- Consensus Engine overload phase.
- Decision panel showing observation, probabilities and applied input.

These are placeholders for actual gameplay captures.
