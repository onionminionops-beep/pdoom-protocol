# Shared contracts

The runtime source of truth is the Zod schemas in `src/game/contracts/`.
Controllers produce `PlayerInputV1`; `stepWorld` consumes it without controller-specific
movement, hitboxes or weapon rules. `GameObservationV1` is the complete model state.
Public function signatures remain listed in [ARCHITECTURE.md](ARCHITECTURE.md).

## Coordinates and visibility

One tile is 32 world pixels. Velocities use pixels/second, times use milliseconds,
and positive y points down. `self.position` is absolute; entity positions are
relative to the controlled player's center. The v1 `self.character` and
`teammate.character` labels are fixed to `jev` and `user`, even when a Mock controller
drives p1. Use `self.id` for the actual slot.

The observation uses the controlled player's room, not the leading player's room.
Visible entities must share that room and be within 480 horizontal and 270 vertical
pixels. Hostile projectiles also have a 520-pixel radial observation cutoff.
The complete tile map, RNG state, future attacks, enemy internals and hidden entities
are absent. Teammate state and aggregate game score remain available across rooms.
Only switches assigned to this slot or to either slot are returned.

Enemies sort by estimated contact time (unknown last), distance, then ID.
Projectiles sort approaching first, closest-approach time, distance, then ID.
Pickups and interactables sort by distance, then ID. Limits apply after sorting.
Terrain and shot hints are estimates: they never change collision, facing or aim.

`serializeObservation` sorts object keys recursively and rounds noninteger numbers
to two decimal places. It preserves array order; integers need no decimal suffix.
Supply a deterministic timestamp when comparing serialized observations.

## Input lifecycle

`horizontal` is the only input that changes facing. `shoot` fires along that facing;
there is no aim vector. A held jump sustains a full jump; `drop` ignores one-way
platforms briefly. `holdForMs` is a controller decision duration, not a simulation
time step: the simulation always advances by 1/60 second.

An absent input, disabled slot or mismatched episode becomes neutral.
The simulation does not validate every input with Zod or enforce tick age; the live
controller and server enforce response freshness. Callers must validate untrusted
inputs at their boundary. Episode IDs invalidate inputs and requests; RNG
initialization uses `seed >>> 0`, independently of the episode ID.

## Decision API

The server implementation is documented in [JEV_INTEGRATION.md](JEV_INTEGRATION.md)
and its deployment boundaries in [SECURITY.md](SECURITY.md).

- `POST /api/jev/session`: JSON `{ "episodeId": "..." }`; returns
  `SessionResponseSchema`. `expiresAt` is an absolute expiry timestamp in milliseconds.
- `POST /api/jev/decision`: `DecisionRequestSchema`; returns `DecisionResponseSchema`.
  The applied action field is **`input`**.
- Errors follow `ApiErrorSchema`; handlers may add `Retry-After`.
  Both routes return `Cache-Control: no-store`.

The six `answers` keys are `horizontal_input`, `vertical_action`, `shoot_input`,
`dash_input`, `interaction_input`, and `input_duration`. Each answer contains
`choice: string`, `probabilities: Record<string, number>`, and `confidence: number`
in [0, 1]. Choice labels map to the input enums; boolean and duration labels are
strings before conversion. `gated` contains the five boolean action-axis flags
`horizontal`, `vertical`, `shoot`, `dash`, and `interact`. Duration gating is visible
through `input.holdForMs`. Optional `usage` contains optional numeric `input_tokens`
and `output_tokens`.

The shared answer schema is intentionally generic. The server adapter additionally
validates the allowed choices and probability distribution for each question.
Directive overrides use the validated directive ID; the description text does not
replace server instructions. The thresholds and scheduling rules live in
`src/game/config/ai.ts` and the server/controller implementation.

## Keeping this document synchronized

The following tables are generated from `z.toJSONSchema`, including nested fields
in input, observation and decision records. A nested field's required flag applies
when its containing object is present.

After changing a schema, regenerate and check the documentation:

```bash
UPDATE_CONTRACTS=1 npm test -- tests/unit/contracts.test.ts
npm test -- tests/unit/contracts.test.ts
npm run format:check
```

The ordinary test reads the document and fails on schema drift. It writes only
when regeneration is explicitly requested with `UPDATE_CONTRACTS=1`.

<!-- generated-contracts:start -->

### PlayerInputV1Schema

| Field            | Required | Type / constraints                     |
| ---------------- | -------- | -------------------------------------- |
| `schemaVersion`  | yes      | `"1.0"`                                |
| `episodeId`      | yes      | `string; minLength=1; maxLength=64`    |
| `basedOnTick`    | yes      | `integer; min=0; max=9007199254740991` |
| `horizontal`     | yes      | `"left", "neutral", "right"`           |
| `verticalAction` | yes      | `"none", "jump", "drop"`               |
| `shoot`          | yes      | `boolean`                              |
| `dash`           | yes      | `boolean`                              |
| `interact`       | yes      | `boolean`                              |
| `holdForMs`      | yes      | `100 or 150 or 200 or 250`             |

### GameObservationV1Schema

| Field                                                   | Required | Type / constraints                                                                                                                    |
| ------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion`                                         | yes      | `"1.0"`                                                                                                                               |
| `episodeId`                                             | yes      | `string; minLength=1; maxLength=64`                                                                                                   |
| `tick`                                                  | yes      | `integer; min=0; max=9007199254740991`                                                                                                |
| `timestampMs`                                           | yes      | `number; min=0`                                                                                                                       |
| `directive`                                             | yes      | `object`                                                                                                                              |
| `directive.id`                                          | yes      | `"SPEEDRUNNER", "COLLECTOR", "SCORE_HUNTER", "GUARDIAN"`                                                                              |
| `directive.description`                                 | yes      | `string; maxLength=400`                                                                                                               |
| `objective`                                             | yes      | `object`                                                                                                                              |
| `objective.type`                                        | yes      | `"traverse", "survive", "defeat_enemies", "revive_teammate", "interact", "reach_exit"`                                                |
| `objective.description`                                 | yes      | `string; maxLength=200`                                                                                                               |
| `self`                                                  | yes      | `object`                                                                                                                              |
| `self.id`                                               | yes      | `string`                                                                                                                              |
| `self.character`                                        | yes      | `"jev"`                                                                                                                               |
| `self.position`                                         | yes      | `object`                                                                                                                              |
| `self.position.x`                                       | yes      | `number`                                                                                                                              |
| `self.position.y`                                       | yes      | `number`                                                                                                                              |
| `self.velocity`                                         | yes      | `object`                                                                                                                              |
| `self.velocity.x`                                       | yes      | `number`                                                                                                                              |
| `self.velocity.y`                                       | yes      | `number`                                                                                                                              |
| `self.facing`                                           | yes      | `"left", "right"`                                                                                                                     |
| `self.grounded`                                         | yes      | `boolean`                                                                                                                             |
| `self.onOneWayPlatform`                                 | yes      | `boolean`                                                                                                                             |
| `self.nearLeftEdge`                                     | yes      | `boolean`                                                                                                                             |
| `self.nearRightEdge`                                    | yes      | `boolean`                                                                                                                             |
| `self.health`                                           | yes      | `number`                                                                                                                              |
| `self.maxHealth`                                        | yes      | `number`                                                                                                                              |
| `self.alive`                                            | yes      | `boolean`                                                                                                                             |
| `self.downed`                                           | yes      | `boolean`                                                                                                                             |
| `self.weapon`                                           | yes      | `"blaster", "shotgun", "launcher"`                                                                                                    |
| `self.ammunition`                                       | yes      | `number,null`                                                                                                                         |
| `self.canShoot`                                         | yes      | `boolean`                                                                                                                             |
| `self.canJump`                                          | yes      | `boolean`                                                                                                                             |
| `self.canDash`                                          | yes      | `boolean`                                                                                                                             |
| `self.dashCooldownMs`                                   | yes      | `number`                                                                                                                              |
| `self.canInteract`                                      | yes      | `boolean`                                                                                                                             |
| `teammate`                                              | yes      | `object`                                                                                                                              |
| `teammate.id`                                           | yes      | `string`                                                                                                                              |
| `teammate.character`                                    | yes      | `"user"`                                                                                                                              |
| `teammate.relativePosition`                             | yes      | `object`                                                                                                                              |
| `teammate.relativePosition.x`                           | yes      | `number`                                                                                                                              |
| `teammate.relativePosition.y`                           | yes      | `number`                                                                                                                              |
| `teammate.velocity`                                     | yes      | `object`                                                                                                                              |
| `teammate.velocity.x`                                   | yes      | `number`                                                                                                                              |
| `teammate.velocity.y`                                   | yes      | `number`                                                                                                                              |
| `teammate.healthFraction`                               | yes      | `number`                                                                                                                              |
| `teammate.alive`                                        | yes      | `boolean`                                                                                                                             |
| `teammate.downed`                                       | yes      | `boolean`                                                                                                                             |
| `teammate.surrounded`                                   | yes      | `boolean`                                                                                                                             |
| `teammate.imminentDanger`                               | yes      | `boolean`                                                                                                                             |
| `terrain`                                               | yes      | `object`                                                                                                                              |
| `terrain.groundDistanceBelow`                           | yes      | `number,null`                                                                                                                         |
| `terrain.ceilingDistanceAbove`                          | yes      | `number,null`                                                                                                                         |
| `terrain.leftWallDistance`                              | yes      | `number,null`                                                                                                                         |
| `terrain.rightWallDistance`                             | yes      | `number,null`                                                                                                                         |
| `terrain.safeLandingLeft`                               | yes      | `boolean`                                                                                                                             |
| `terrain.safeLandingRight`                              | yes      | `boolean`                                                                                                                             |
| `terrain.jumpWouldReachPlatform`                        | yes      | `boolean`                                                                                                                             |
| `terrain.dropIsSafe`                                    | yes      | `boolean`                                                                                                                             |
| `enemies`                                               | yes      | `array<object>; maxItems=8`                                                                                                           |
| `enemies[].id`                                          | yes      | `string`                                                                                                                              |
| `enemies[].type`                                        | yes      | `"doom_prophet", "catastrophe_prophet", "datacenter_blockader", "purity_enforcer", "hall_monitor", "reply_horde", "consensus_engine"` |
| `enemies[].relativePosition`                            | yes      | `object`                                                                                                                              |
| `enemies[].relativePosition.x`                          | yes      | `number`                                                                                                                              |
| `enemies[].relativePosition.y`                          | yes      | `number`                                                                                                                              |
| `enemies[].relativeVelocity`                            | yes      | `object`                                                                                                                              |
| `enemies[].relativeVelocity.x`                          | yes      | `number`                                                                                                                              |
| `enemies[].relativeVelocity.y`                          | yes      | `number`                                                                                                                              |
| `enemies[].horizontalSide`                              | yes      | `"left", "right", "overlapping"`                                                                                                      |
| `enemies[].distance`                                    | yes      | `number`                                                                                                                              |
| `enemies[].verticalAlignment`                           | yes      | `"aligned", "slightly_above", "slightly_below", "far_above", "far_below"`                                                             |
| `enemies[].lineOfFireClear`                             | yes      | `boolean`                                                                                                                             |
| `enemies[].withinWeaponRange`                           | yes      | `boolean`                                                                                                                             |
| `enemies[].facingSelf`                                  | yes      | `boolean`                                                                                                                             |
| `enemies[].healthFraction`                              | yes      | `number`                                                                                                                              |
| `enemies[].attacking`                                   | yes      | `boolean`                                                                                                                             |
| `enemies[].telegraphing`                                | yes      | `boolean`                                                                                                                             |
| `enemies[].estimatedTimeToContactMs`                    | yes      | `number,null`                                                                                                                         |
| `hostileProjectiles`                                    | yes      | `array<object>; maxItems=8`                                                                                                           |
| `hostileProjectiles[].id`                               | yes      | `string`                                                                                                                              |
| `hostileProjectiles[].relativePosition`                 | yes      | `object`                                                                                                                              |
| `hostileProjectiles[].relativePosition.x`               | yes      | `number`                                                                                                                              |
| `hostileProjectiles[].relativePosition.y`               | yes      | `number`                                                                                                                              |
| `hostileProjectiles[].relativeVelocity`                 | yes      | `object`                                                                                                                              |
| `hostileProjectiles[].relativeVelocity.x`               | yes      | `number`                                                                                                                              |
| `hostileProjectiles[].relativeVelocity.y`               | yes      | `number`                                                                                                                              |
| `hostileProjectiles[].approaching`                      | yes      | `boolean`                                                                                                                             |
| `hostileProjectiles[].estimatedTimeToClosestApproachMs` | yes      | `number,null`                                                                                                                         |
| `hostileProjectiles[].estimatedMissDistance`            | yes      | `number,null`                                                                                                                         |
| `hostileProjectiles[].canJumpOver`                      | yes      | `boolean`                                                                                                                             |
| `hostileProjectiles[].canDropUnder`                     | yes      | `boolean`                                                                                                                             |
| `pickups`                                               | yes      | `array<object>; maxItems=3`                                                                                                           |
| `pickups[].id`                                          | yes      | `string`                                                                                                                              |
| `pickups[].type`                                        | yes      | `"health", "shotgun", "launcher", "ammo", "fact_check", "coin"`                                                                       |
| `pickups[].value`                                       | yes      | `number`                                                                                                                              |
| `pickups[].relativePosition`                            | yes      | `object`                                                                                                                              |
| `pickups[].relativePosition.x`                          | yes      | `number`                                                                                                                              |
| `pickups[].relativePosition.y`                          | yes      | `number`                                                                                                                              |
| `pickups[].distance`                                    | yes      | `number`                                                                                                                              |
| `pickups[].pathAppearsSafe`                             | yes      | `boolean`                                                                                                                             |
| `interactables`                                         | yes      | `array<object>; maxItems=4`                                                                                                           |
| `interactables[].id`                                    | yes      | `string`                                                                                                                              |
| `interactables[].type`                                  | yes      | `"switch", "door", "weapon_crate", "revive_teammate", "exit"`                                                                         |
| `interactables[].relativePosition`                      | yes      | `object`                                                                                                                              |
| `interactables[].relativePosition.x`                    | yes      | `number`                                                                                                                              |
| `interactables[].relativePosition.y`                    | yes      | `number`                                                                                                                              |
| `interactables[].inRange`                               | yes      | `boolean`                                                                                                                             |
| `interactables[].activated`                             | yes      | `boolean`                                                                                                                             |
| `tactical`                                              | yes      | `object`                                                                                                                              |
| `tactical.dangerLevel`                                  | yes      | `"low", "medium", "high", "critical"`                                                                                                 |
| `tactical.enemyCount`                                   | yes      | `integer; min=-9007199254740991; max=9007199254740991`                                                                                |
| `tactical.imminentProjectileCount`                      | yes      | `integer; min=-9007199254740991; max=9007199254740991`                                                                                |
| `tactical.clearShotExistsLeft`                          | yes      | `boolean`                                                                                                                             |
| `tactical.clearShotExistsRight`                         | yes      | `boolean`                                                                                                                             |
| `tactical.teammateNeedsRevive`                          | yes      | `boolean`                                                                                                                             |
| `game`                                                  | yes      | `object`                                                                                                                              |
| `game.levelId`                                          | yes      | `string`                                                                                                                              |
| `game.roomId`                                           | yes      | `string`                                                                                                                              |
| `game.score`                                            | yes      | `number`                                                                                                                              |
| `game.coins`                                            | yes      | `integer; min=-9007199254740991; max=9007199254740991`                                                                                |
| `game.scoreBreakdown`                                   | yes      | `object`                                                                                                                              |
| `game.scoreBreakdown.kills`                             | yes      | `number`                                                                                                                              |
| `game.scoreBreakdown.coins`                             | yes      | `number`                                                                                                                              |
| `game.scoreBreakdown.timeBonus`                         | yes      | `number`                                                                                                                              |
| `game.scoreBreakdown.damageTakenPenalty`                | yes      | `number`                                                                                                                              |
| `game.scoreBreakdown.reviveBonus`                       | yes      | `number`                                                                                                                              |
| `game.elapsedMs`                                        | yes      | `number`                                                                                                                              |
| `game.status`                                           | yes      | `"playing", "won", "lost"`                                                                                                            |

### DecisionRequestSchema

| Field                                                               | Required | Type / constraints                                                                                                                    |
| ------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `sessionToken`                                                      | yes      | `string; minLength=16; maxLength=512`                                                                                                 |
| `observation`                                                       | yes      | `object`                                                                                                                              |
| `observation.schemaVersion`                                         | yes      | `"1.0"`                                                                                                                               |
| `observation.episodeId`                                             | yes      | `string; minLength=1; maxLength=64`                                                                                                   |
| `observation.tick`                                                  | yes      | `integer; min=0; max=9007199254740991`                                                                                                |
| `observation.timestampMs`                                           | yes      | `number; min=0`                                                                                                                       |
| `observation.directive`                                             | yes      | `object`                                                                                                                              |
| `observation.directive.id`                                          | yes      | `"SPEEDRUNNER", "COLLECTOR", "SCORE_HUNTER", "GUARDIAN"`                                                                              |
| `observation.directive.description`                                 | yes      | `string; maxLength=400`                                                                                                               |
| `observation.objective`                                             | yes      | `object`                                                                                                                              |
| `observation.objective.type`                                        | yes      | `"traverse", "survive", "defeat_enemies", "revive_teammate", "interact", "reach_exit"`                                                |
| `observation.objective.description`                                 | yes      | `string; maxLength=200`                                                                                                               |
| `observation.self`                                                  | yes      | `object`                                                                                                                              |
| `observation.self.id`                                               | yes      | `string`                                                                                                                              |
| `observation.self.character`                                        | yes      | `"jev"`                                                                                                                               |
| `observation.self.position`                                         | yes      | `object`                                                                                                                              |
| `observation.self.position.x`                                       | yes      | `number`                                                                                                                              |
| `observation.self.position.y`                                       | yes      | `number`                                                                                                                              |
| `observation.self.velocity`                                         | yes      | `object`                                                                                                                              |
| `observation.self.velocity.x`                                       | yes      | `number`                                                                                                                              |
| `observation.self.velocity.y`                                       | yes      | `number`                                                                                                                              |
| `observation.self.facing`                                           | yes      | `"left", "right"`                                                                                                                     |
| `observation.self.grounded`                                         | yes      | `boolean`                                                                                                                             |
| `observation.self.onOneWayPlatform`                                 | yes      | `boolean`                                                                                                                             |
| `observation.self.nearLeftEdge`                                     | yes      | `boolean`                                                                                                                             |
| `observation.self.nearRightEdge`                                    | yes      | `boolean`                                                                                                                             |
| `observation.self.health`                                           | yes      | `number`                                                                                                                              |
| `observation.self.maxHealth`                                        | yes      | `number`                                                                                                                              |
| `observation.self.alive`                                            | yes      | `boolean`                                                                                                                             |
| `observation.self.downed`                                           | yes      | `boolean`                                                                                                                             |
| `observation.self.weapon`                                           | yes      | `"blaster", "shotgun", "launcher"`                                                                                                    |
| `observation.self.ammunition`                                       | yes      | `number,null`                                                                                                                         |
| `observation.self.canShoot`                                         | yes      | `boolean`                                                                                                                             |
| `observation.self.canJump`                                          | yes      | `boolean`                                                                                                                             |
| `observation.self.canDash`                                          | yes      | `boolean`                                                                                                                             |
| `observation.self.dashCooldownMs`                                   | yes      | `number`                                                                                                                              |
| `observation.self.canInteract`                                      | yes      | `boolean`                                                                                                                             |
| `observation.teammate`                                              | yes      | `object`                                                                                                                              |
| `observation.teammate.id`                                           | yes      | `string`                                                                                                                              |
| `observation.teammate.character`                                    | yes      | `"user"`                                                                                                                              |
| `observation.teammate.relativePosition`                             | yes      | `object`                                                                                                                              |
| `observation.teammate.relativePosition.x`                           | yes      | `number`                                                                                                                              |
| `observation.teammate.relativePosition.y`                           | yes      | `number`                                                                                                                              |
| `observation.teammate.velocity`                                     | yes      | `object`                                                                                                                              |
| `observation.teammate.velocity.x`                                   | yes      | `number`                                                                                                                              |
| `observation.teammate.velocity.y`                                   | yes      | `number`                                                                                                                              |
| `observation.teammate.healthFraction`                               | yes      | `number`                                                                                                                              |
| `observation.teammate.alive`                                        | yes      | `boolean`                                                                                                                             |
| `observation.teammate.downed`                                       | yes      | `boolean`                                                                                                                             |
| `observation.teammate.surrounded`                                   | yes      | `boolean`                                                                                                                             |
| `observation.teammate.imminentDanger`                               | yes      | `boolean`                                                                                                                             |
| `observation.terrain`                                               | yes      | `object`                                                                                                                              |
| `observation.terrain.groundDistanceBelow`                           | yes      | `number,null`                                                                                                                         |
| `observation.terrain.ceilingDistanceAbove`                          | yes      | `number,null`                                                                                                                         |
| `observation.terrain.leftWallDistance`                              | yes      | `number,null`                                                                                                                         |
| `observation.terrain.rightWallDistance`                             | yes      | `number,null`                                                                                                                         |
| `observation.terrain.safeLandingLeft`                               | yes      | `boolean`                                                                                                                             |
| `observation.terrain.safeLandingRight`                              | yes      | `boolean`                                                                                                                             |
| `observation.terrain.jumpWouldReachPlatform`                        | yes      | `boolean`                                                                                                                             |
| `observation.terrain.dropIsSafe`                                    | yes      | `boolean`                                                                                                                             |
| `observation.enemies`                                               | yes      | `array<object>; maxItems=8`                                                                                                           |
| `observation.enemies[].id`                                          | yes      | `string`                                                                                                                              |
| `observation.enemies[].type`                                        | yes      | `"doom_prophet", "catastrophe_prophet", "datacenter_blockader", "purity_enforcer", "hall_monitor", "reply_horde", "consensus_engine"` |
| `observation.enemies[].relativePosition`                            | yes      | `object`                                                                                                                              |
| `observation.enemies[].relativePosition.x`                          | yes      | `number`                                                                                                                              |
| `observation.enemies[].relativePosition.y`                          | yes      | `number`                                                                                                                              |
| `observation.enemies[].relativeVelocity`                            | yes      | `object`                                                                                                                              |
| `observation.enemies[].relativeVelocity.x`                          | yes      | `number`                                                                                                                              |
| `observation.enemies[].relativeVelocity.y`                          | yes      | `number`                                                                                                                              |
| `observation.enemies[].horizontalSide`                              | yes      | `"left", "right", "overlapping"`                                                                                                      |
| `observation.enemies[].distance`                                    | yes      | `number`                                                                                                                              |
| `observation.enemies[].verticalAlignment`                           | yes      | `"aligned", "slightly_above", "slightly_below", "far_above", "far_below"`                                                             |
| `observation.enemies[].lineOfFireClear`                             | yes      | `boolean`                                                                                                                             |
| `observation.enemies[].withinWeaponRange`                           | yes      | `boolean`                                                                                                                             |
| `observation.enemies[].facingSelf`                                  | yes      | `boolean`                                                                                                                             |
| `observation.enemies[].healthFraction`                              | yes      | `number`                                                                                                                              |
| `observation.enemies[].attacking`                                   | yes      | `boolean`                                                                                                                             |
| `observation.enemies[].telegraphing`                                | yes      | `boolean`                                                                                                                             |
| `observation.enemies[].estimatedTimeToContactMs`                    | yes      | `number,null`                                                                                                                         |
| `observation.hostileProjectiles`                                    | yes      | `array<object>; maxItems=8`                                                                                                           |
| `observation.hostileProjectiles[].id`                               | yes      | `string`                                                                                                                              |
| `observation.hostileProjectiles[].relativePosition`                 | yes      | `object`                                                                                                                              |
| `observation.hostileProjectiles[].relativePosition.x`               | yes      | `number`                                                                                                                              |
| `observation.hostileProjectiles[].relativePosition.y`               | yes      | `number`                                                                                                                              |
| `observation.hostileProjectiles[].relativeVelocity`                 | yes      | `object`                                                                                                                              |
| `observation.hostileProjectiles[].relativeVelocity.x`               | yes      | `number`                                                                                                                              |
| `observation.hostileProjectiles[].relativeVelocity.y`               | yes      | `number`                                                                                                                              |
| `observation.hostileProjectiles[].approaching`                      | yes      | `boolean`                                                                                                                             |
| `observation.hostileProjectiles[].estimatedTimeToClosestApproachMs` | yes      | `number,null`                                                                                                                         |
| `observation.hostileProjectiles[].estimatedMissDistance`            | yes      | `number,null`                                                                                                                         |
| `observation.hostileProjectiles[].canJumpOver`                      | yes      | `boolean`                                                                                                                             |
| `observation.hostileProjectiles[].canDropUnder`                     | yes      | `boolean`                                                                                                                             |
| `observation.pickups`                                               | yes      | `array<object>; maxItems=3`                                                                                                           |
| `observation.pickups[].id`                                          | yes      | `string`                                                                                                                              |
| `observation.pickups[].type`                                        | yes      | `"health", "shotgun", "launcher", "ammo", "fact_check", "coin"`                                                                       |
| `observation.pickups[].value`                                       | yes      | `number`                                                                                                                              |
| `observation.pickups[].relativePosition`                            | yes      | `object`                                                                                                                              |
| `observation.pickups[].relativePosition.x`                          | yes      | `number`                                                                                                                              |
| `observation.pickups[].relativePosition.y`                          | yes      | `number`                                                                                                                              |
| `observation.pickups[].distance`                                    | yes      | `number`                                                                                                                              |
| `observation.pickups[].pathAppearsSafe`                             | yes      | `boolean`                                                                                                                             |
| `observation.interactables`                                         | yes      | `array<object>; maxItems=4`                                                                                                           |
| `observation.interactables[].id`                                    | yes      | `string`                                                                                                                              |
| `observation.interactables[].type`                                  | yes      | `"switch", "door", "weapon_crate", "revive_teammate", "exit"`                                                                         |
| `observation.interactables[].relativePosition`                      | yes      | `object`                                                                                                                              |
| `observation.interactables[].relativePosition.x`                    | yes      | `number`                                                                                                                              |
| `observation.interactables[].relativePosition.y`                    | yes      | `number`                                                                                                                              |
| `observation.interactables[].inRange`                               | yes      | `boolean`                                                                                                                             |
| `observation.interactables[].activated`                             | yes      | `boolean`                                                                                                                             |
| `observation.tactical`                                              | yes      | `object`                                                                                                                              |
| `observation.tactical.dangerLevel`                                  | yes      | `"low", "medium", "high", "critical"`                                                                                                 |
| `observation.tactical.enemyCount`                                   | yes      | `integer; min=-9007199254740991; max=9007199254740991`                                                                                |
| `observation.tactical.imminentProjectileCount`                      | yes      | `integer; min=-9007199254740991; max=9007199254740991`                                                                                |
| `observation.tactical.clearShotExistsLeft`                          | yes      | `boolean`                                                                                                                             |
| `observation.tactical.clearShotExistsRight`                         | yes      | `boolean`                                                                                                                             |
| `observation.tactical.teammateNeedsRevive`                          | yes      | `boolean`                                                                                                                             |
| `observation.game`                                                  | yes      | `object`                                                                                                                              |
| `observation.game.levelId`                                          | yes      | `string`                                                                                                                              |
| `observation.game.roomId`                                           | yes      | `string`                                                                                                                              |
| `observation.game.score`                                            | yes      | `number`                                                                                                                              |
| `observation.game.coins`                                            | yes      | `integer; min=-9007199254740991; max=9007199254740991`                                                                                |
| `observation.game.scoreBreakdown`                                   | yes      | `object`                                                                                                                              |
| `observation.game.scoreBreakdown.kills`                             | yes      | `number`                                                                                                                              |
| `observation.game.scoreBreakdown.coins`                             | yes      | `number`                                                                                                                              |
| `observation.game.scoreBreakdown.timeBonus`                         | yes      | `number`                                                                                                                              |
| `observation.game.scoreBreakdown.damageTakenPenalty`                | yes      | `number`                                                                                                                              |
| `observation.game.scoreBreakdown.reviveBonus`                       | yes      | `number`                                                                                                                              |
| `observation.game.elapsedMs`                                        | yes      | `number`                                                                                                                              |
| `observation.game.status`                                           | yes      | `"playing", "won", "lost"`                                                                                                            |

### DecisionResponseSchema

| Field                                     | Required | Type / constraints                     |
| ----------------------------------------- | -------- | -------------------------------------- |
| `requestId`                               | yes      | `string`                               |
| `episodeId`                               | yes      | `string`                               |
| `basedOnTick`                             | yes      | `integer; min=0; max=9007199254740991` |
| `input`                                   | yes      | `object`                               |
| `input.schemaVersion`                     | yes      | `"1.0"`                                |
| `input.episodeId`                         | yes      | `string; minLength=1; maxLength=64`    |
| `input.basedOnTick`                       | yes      | `integer; min=0; max=9007199254740991` |
| `input.horizontal`                        | yes      | `"left", "neutral", "right"`           |
| `input.verticalAction`                    | yes      | `"none", "jump", "drop"`               |
| `input.shoot`                             | yes      | `boolean`                              |
| `input.dash`                              | yes      | `boolean`                              |
| `input.interact`                          | yes      | `boolean`                              |
| `input.holdForMs`                         | yes      | `100 or 150 or 200 or 250`             |
| `answers`                                 | yes      | `object`                               |
| `answers.horizontal_input`                | yes      | `object`                               |
| `answers.horizontal_input.choice`         | yes      | `string`                               |
| `answers.horizontal_input.probabilities`  | yes      | `record<string, number>`               |
| `answers.horizontal_input.confidence`     | yes      | `number; min=0; max=1`                 |
| `answers.vertical_action`                 | yes      | `object`                               |
| `answers.vertical_action.choice`          | yes      | `string`                               |
| `answers.vertical_action.probabilities`   | yes      | `record<string, number>`               |
| `answers.vertical_action.confidence`      | yes      | `number; min=0; max=1`                 |
| `answers.shoot_input`                     | yes      | `object`                               |
| `answers.shoot_input.choice`              | yes      | `string`                               |
| `answers.shoot_input.probabilities`       | yes      | `record<string, number>`               |
| `answers.shoot_input.confidence`          | yes      | `number; min=0; max=1`                 |
| `answers.dash_input`                      | yes      | `object`                               |
| `answers.dash_input.choice`               | yes      | `string`                               |
| `answers.dash_input.probabilities`        | yes      | `record<string, number>`               |
| `answers.dash_input.confidence`           | yes      | `number; min=0; max=1`                 |
| `answers.interaction_input`               | yes      | `object`                               |
| `answers.interaction_input.choice`        | yes      | `string`                               |
| `answers.interaction_input.probabilities` | yes      | `record<string, number>`               |
| `answers.interaction_input.confidence`    | yes      | `number; min=0; max=1`                 |
| `answers.input_duration`                  | yes      | `object`                               |
| `answers.input_duration.choice`           | yes      | `string`                               |
| `answers.input_duration.probabilities`    | yes      | `record<string, number>`               |
| `answers.input_duration.confidence`       | yes      | `number; min=0; max=1`                 |
| `gated`                                   | yes      | `object`                               |
| `gated.horizontal`                        | yes      | `boolean`                              |
| `gated.vertical`                          | yes      | `boolean`                              |
| `gated.shoot`                             | yes      | `boolean`                              |
| `gated.dash`                              | yes      | `boolean`                              |
| `gated.interact`                          | yes      | `boolean`                              |
| `latencyMs`                               | yes      | `number; min=0`                        |
| `model`                                   | yes      | `string`                               |
| `usage`                                   | no       | `object`                               |
| `usage.input_tokens`                      | no       | `number`                               |
| `usage.output_tokens`                     | no       | `number`                               |

### SessionResponseSchema

| Field                   | Required | Type / constraints                                     |
| ----------------------- | -------- | ------------------------------------------------------ |
| `sessionToken`          | yes      | `string`                                               |
| `expiresAt`             | yes      | `number`                                               |
| `requestBudget`         | yes      | `integer; min=-9007199254740991; max=9007199254740991` |
| `minDecisionIntervalMs` | no       | `integer; max=9007199254740991`                        |

### ApiErrorSchema

| Field          | Required | Type / constraints                                                                                                                                                                                                  |
| -------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `error`        | yes      | `"invalid_request", "forbidden_origin", "payload_too_large", "invalid_session", "session_budget_exhausted", "rate_limited", "global_budget_exhausted", "upstream_unavailable", "upstream_timeout", "misconfigured"` |
| `message`      | yes      | `string`                                                                                                                                                                                                            |
| `retryAfterMs` | no       | `number`                                                                                                                                                                                                            |

<!-- generated-contracts:end -->
