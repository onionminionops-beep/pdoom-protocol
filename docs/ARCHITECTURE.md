# Architecture & integration contracts

Read this before touching `src/game`. The shared contracts are the integration
boundary between parallel workstreams; change them only with a matching test.

## Layers

```
src/game/contracts/   Zod schemas shared by client + server (input, observation, decision, directives)
src/game/config/      Tunables: movement (shared by User AND JEV), weapons, enemies, ai loop
src/game/sim/         Authoritative deterministic simulation. Plain data, no Phaser, no DOM.
src/game/observation/ buildObservation(world, playerId, now) -> GameObservationV1 (what JEV sees)
src/game/controllers/ Human / Mock / Disabled (Jev lives in controllers/jev.ts) -> PlayerInputV1 only
src/game/levels/      Level data (tile rows + rooms + spawns)
src/game/client/      Phaser scenes + renderers (browser only, dynamic import, ssr:false)
src/server/           Route handler helpers: TypeSafe client, session tokens, rate limits
src/app/api/jev/      POST /api/jev/session, POST /api/jev/decision
src/app/play/         Game page (client component)
src/components/       React HUD, menus, dev panel
```

## Hard rules

1. **Controllers output `PlayerInputV1` and nothing else.** They receive a
   read-only `WorldState` (Mock/Jev must go through `buildObservation`; never
   read `world` fields directly in the Jev controller). They must not mutate
   the world, spawn projectiles, set facing without horizontal input, pick
   targets, or touch cooldowns.
2. **Facing only changes on `horizontal: left|right`.** Projectiles travel in
   `player.facing`. There is no aim assist, target snapping, or per-character
   hitbox difference. `MOVEMENT` is one object used by both players.
3. **`stepWorld(world, inputs)` is the only way to advance time.** 60 Hz fixed
   tick (`TICK_MS`). Inputs with a stale `episodeId` are neutralised.
4. **Determinism.** All randomness goes through `world.rngState` via `sim/rng.ts`.
   `WorldState` is plain JSON (`structuredClone`-able).
5. **Secrets stay server-side.** Only `src/server/**` and route handlers may read
   `TYPESAFE_API_KEY`, `JEV_SESSION_SECRET`, Upstash vars.

## Key APIs

```ts
createWorld({ level, seed, episodeId, directive, slots }) -> WorldState
stepWorld(world, { p1, p2 }) -> SimEvent[]           // mutates world
buildObservation(world, "p2", nowMs) -> GameObservationV1
serializeObservation(obs) -> string                  // stable key order, 2dp floats
```

Player slots: `p1` = User (human by default), `p2` = JEV.

## Level format

`LevelData.rows`: `#` solid, `-` one-way, `.` empty, `H` hazard, `G` gate
(solid until the room is cleared / its switches are hit). 1 tile = 32 px.

## Directives

`DIRECTIVES[id].instructionOverrides` are merged into the TypeSafe question
instructions on the server. The simulation never branches on directive.

## Testing

`npm test` (vitest, `tests/unit`), `npm run test:e2e` (Playwright),
`npm run typecheck`, `npm run lint`.
