# Consensus Heights gameplay

USER + JEV: P(DOOM) PROTOCOL is a cooperative platform shooter about fighting the
Consensus Engine and its doom-preaching followers. The level is 240 × 18 tiles:
7,680 × 576 pixels across eight rooms. Both active slots are needed for the assigned
switches; choose a human, live JEV or Mock controller for each.

## Controls and movement

Default human bindings: A/D or left/right arrows move; W/up/Space jumps; S/down
drops through a one-way platform; J or left mouse fires; K/Shift dashes; E interacts
and revives. Mouse position does not aim the weapon.

Both characters use a 20 × 40 pixel body, 200 px/s running speed, 1,700 px/s²
gravity, a -650 px/s jump and 620 px/s fall cap. Hold jump for height; early release
cuts ascent after a 60 ms minimum. Coyote time is 90 ms; jump buffering is 110 ms.
A dash travels at 520 px/s for 140 ms with a 650 ms cooldown.

Continuous jump estimates give `650² / (2 × 1700) ≈ 124 px` of rise and
`200 × (2 × 650 / 1700) ≈ 153 px` of travel at equal elevation. Required steps rise
at most three tiles (96 px), and the revised route avoids mandatory jumps across
the full eight-tile coolant trench. Acceleration, collision, jump cuts and input
timing reduce ideal reach; full fixed-tick traversal tests are the practical proof.

`#` is solid, `-` supports landing from above, `H` hurts, and `G` stays solid until
its room condition is met. Coolant costs 25 health per accepted hit. Hits grant
500 ms of invulnerability equally to both characters. Restricted zones slow
horizontal velocity while active and expire; they do not deal damage.

## Room walkthrough

Tile intervals below are half-open: the right endpoint belongs to the next room.

| Room               | Tiles   | Route and objective                                                                                                                                                                                                                                                                                                          |
| ------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tutorial Alley     | 0–30    | Learn the two-tile step and one-way ledge. Explore the raised coins rather than dashing straight along the floor.                                                                                                                                                                                                            |
| Comment Section    | 30–62   | Clear both Doom Prophets and the two Reply Hordes. Jump the low cover to line up shots; clear every living room enemy before gate 61 opens. Interact with the Context Shotgun crate near the exit.                                                                                                                           |
| Scaffolding        | 62–100  | Climb the two-tile steps at 66, 69 and 72 instead of trying to jump the entire coolant trench. Cross the upper ledges, then the second stair and platform run. The Hall Monitor is optional combat; health waits near tile 98.                                                                                               |
| Prediction Gallery | 100–134 | Climb to the elevated Catastrophe Prophets and the Reply Horde, and clear the Blockader below. Use the low support steps to return to firing height. All four enemies must die before gate 133 opens. The Fact Check pickup is near tile 130.                                                                                |
| Armory Ledge       | 134–160 | Follow the low bridge over coolant or climb for the optional Nuance Launcher at tile 146. Coins reward the side ledges. Watch the Hall Monitor and recover health after the crossing.                                                                                                                                        |
| Split Path         | 160–196 | User/p1 climbs the 14/12/10-row steps and activates the upper switch at tile 172. JEV/p2 follows the lower route past the Purity Enforcer, across the coolant platform, to the switch at tile 192. Both assigned switches are necessary; gate 195 does not open from kills. A health pickup supports the lower-route player. |
| Alignment Spire    | 196–222 | Climb six two-tile rises, dealing with the Hall Monitor and Reply Horde when aligned. Collect optional upper coins, recover health on the summit and drop right into the arena.                                                                                                                                              |
| Consensus Engine   | 222–240 | Fight from either side of the boss, use the assigned overload switches in phase 3, then interact with the core at tile 238 after the boss dies.                                                                                                                                                                              |

An enemy activates only when at least one live, standing player sees it within the
same room and a 480 × 270 pixel half-viewport. Ranged targeting and damage also
require source visibility from the victim. Crossing a room boundary cannot expose
a trailing teammate to unseen ranged damage. The client camera should use this
same visibility envelope; changing camera dimensions requires a simulation review.

## Enemy roster

| Enemy                  | HP  | Contact | Tell and counter                                                                                                     | Kill score |
| ---------------------- | --- | ------- | -------------------------------------------------------------------------------------------------------------------- | ---------- |
| Doom Prophet           | 40  | 10      | Slow approach and periodic composing pause. Keep horizontal distance; composing takes 1.5× damage.                   | 100        |
| Catastrophe Prophet    | 50  | 8       | 650 ms telegraph before a 12-damage chart projectile. Jump the chart and reach its platform before firing.           | 150        |
| Datacenter Blockader   | 70  | 10      | 900 ms bubble telegraph; 10-damage projectile. Attack during the composing pause for 1.5× damage.                    | 200        |
| Purity Enforcer        | 120 | 14      | 1,000 ms ground windup, then a 16-damage shockwave. Jump it and attack during recovery; avoid contact.               | 350        |
| Algorithm Hall Monitor | 45  | 8       | Hovers and marks a restricted column. Leave the column, wait for it to expire, and shoot from a matching ledge.      | 175        |
| Reply Horde            | 12  | 5       | Fast chase and jumps. One Blaster hit is enough, but its small body sits below a standing muzzle; elevation matters. | 40         |
| Consensus Engine       | 900 | 16      | 900 ms telegraphs; 14-damage attacks. See phases below.                                                              | 2,500      |

These are fictional enemies; original art must avoid real people, logos and
political symbols.

### Boss phases

1. Above 66% health: falling prediction charts appear around the visible target.
   Keep moving horizontally during the telegraph.
2. Above 33% health: horizontal sweeps fire to both sides. Jump or drop between
   firing lanes; moving the mouse never changes a shot's height.
3. At or below 33%: damage is blocked until both arena switches are activated.
   User/p1 owns the left switch; JEV/p2 owns the right. Coordinate the crossing,
   then shoot during the six-second overload. Reactivate both if the window closes.

Only arena switches reset on phase 3; Split Path switches stay completed.
Zero health immediately clears the active-boss flag, while its death animation may
continue. The exit cannot be activated while a living boss remains.

## Weapons and pickups

| Weapon          | Damage | Cooldown | Speed / range     | Ammunition             | Tradeoff                                                                                                                       |
| --------------- | ------ | -------- | ----------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Signal Blaster  | 12     | 220 ms   | 620 px/s / 420 px | Unlimited              | Reliable horizontal baseline; light 30 px/s recoil.                                                                            |
| Context Shotgun | 5 × 9  | 720 ms   | 700 px/s / 190 px | 24; +8 per ammo pickup | Fixed symmetric vertical spread up to 55 px/s, 210 px/s recoil. Closing distance improves pellet coverage but risks contact.   |
| Nuance Launcher | 45     | 1,100 ms | 300 px/s / 520 px | 6; +3 per ammo pickup  | 64 px blast radius, 120 px/s recoil; the firing player takes 50% blast damage if too close. Teammates take no friendly damage. |

Shots originate 16 pixels forward of the player's center and four pixels above it.
Projectile velocities, radii and spread are fixed by weapon configuration. No
target-specific muzzle shifts, homing, auto-facing or hitbox changes occur.

Health pickups clamp to the shared maximum of 100. Ammo replenishes both finite
weapon reserves. Weapon crates equip and refill their weapon. The Fact Check pickup
lasts 30 seconds: interacting can emit a 110 px knockback pulse with a nine-second
cooldown and five damage. It uses the same input and timing rules for either slot.

## Revives, failure and scoring

A downed player stays revivable for 20 seconds. Stand within the revive reach
(less than 60 pixels between centers with the current body allowance) and hold
interact continuously for 1,500 ms. Releasing or leaving range resets progress.
A revive restores 50 health, grants one second of protection, and awards 300 points.
One active player can continue while the other is downed or dead. Loss occurs when
no enabled player remains able to act and perform a revive.

Coins increment the shared coin count and award 50 points per value unit.
Kills award the roster values. Finalization on win or loss computes:

```text
timeBonus = max(0, round((480000 - elapsedMs) / 1000) * 10)
damagePenalty = round((p1.damageTaken + p2.damageTaken) * 2)
score = kills + coinPoints + reviveBonus + timeBonus - damagePenalty
```

Eight minutes is the scoring par, not a forced level duration. The automated route
is much faster; it proves reachability rather than estimating a first-time human
completion time. Live JEV latency and human playtesting are needed to calibrate par.

## Directive behavior

The simulation never branches on a directive. Live JEV receives the directive text
and server question overrides; confidence gating still applies independently.

| Directive    | Mock behavior                                                                                   |
| ------------ | ----------------------------------------------------------------------------------------------- |
| SPEEDRUNNER  | Progresses right, dashes across safe stretches, fights when a gate requires it.                 |
| COLLECTOR    | Pursues visible nearby coins and climbable side ledges, while responding to threats and health. |
| SCORE_HUNTER | Pursues visible enemies, reevaluates every 100 ms and waits for a plausible clear shot.         |
| GUARDIAN     | Tries to remain within 48 horizontal pixels of the teammate and prioritizes revives.            |

Other Mock decisions generally hold for 150 ms. Observations are local and bounded;
it can overlook a pickup, fire at the wrong height, mistime a jump, or stall on a
route. Short movement reversals set facing through normal horizontal input.
There is no complete map or planner inside the Mock.

The strict 3,000-tick directive regression uses the same purpose-built arena and
seed for each run: an elevated stationary teammate, enemies on both sides and two
tiers of optional coins isolate the four priorities. It does **not** claim that a
directive wins every metric on Consensus Heights. The separate full-level tests
win with a scripted cooperative driver and with two SPEEDRUNNER Mock controllers.

## Balance rationale and evidence

The -650 jump creates clearance above the mandatory 96 px rises; widened landings
and support steps make those jumps possible with shared acceleration and collision.
Optional coins reward taking elevation instead of a straight dash route.
The lower Split Path health pickup supports recovery before the spire and boss.

Purity Enforcer HP/contact damage are 120/14, and boss contact damage is 16.
The boss's 900 ms tell and 2,100 ms base attack cadence allow switch crossings;
phase cadence subtracts 250 ms per phase, bounded at 900 ms. Weapon values retain
distinct tradeoffs: 12-damage unlimited baseline, 45 total close-range pellets,
and a scarce 45-damage splash shot that can punish the shooter.

Tests exercise real `stepWorld` ticks: no teleports, invincibility, forced gates,
or boss-health edits are used to claim level completion. Focused mechanics tests
construct fixtures separately to isolate hazards, revive timing, visibility,
restricted-zone expiry, scoring, physics parity and 5,000-tick replay determinism.
