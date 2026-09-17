# Art and audio

## Generate

Use Node 22 and `npm ci`. `tsx` and `sharp` are development dependencies.

```sh
# Offline; does not call the API, even with a key in the environment.
npx tsx scripts/art/generate.ts --dry-run --output scripts/art/cache/offline

# Reads OPENAI_API_KEY from the environment. Never put the key in an argument.
npx tsx scripts/art/generate.ts

# After a full run in the same output directory, revise selected subjects.
npx tsx scripts/art/generate.ts --only user,jev --revision 2

npm run lint
npm run typecheck
npm test
```

Omitting `--output` writes into `public/art`, including in dry-run mode. Keep the
offline output separate when preserving the shipped AI assets. No generation
occurs during application builds or at runtime; deploying the game needs no
OpenAI key.

`GET /v1/models` discovers available models; the pipeline prefers `gpt-image-2`,
then tries `gpt-image-1`, then paints a deterministic fallback for that asset.
Requests use one 1024x1024 PNG at medium quality. Transparent assets request
native alpha. A rejected transparency request retries with an explicitly flat
chroma-blue background. `processGeneration` removes chroma, crops the subject,
resizes with nearest-neighbor, thresholds alpha and quantizes to the shared
32-color palette in `src/game/art/palette.ts`. Backdrops retain the full canvas
so the layers align vertically.

Raw PNGs are cached in the gitignored `scripts/art/cache/` under a SHA-256 of the
complete request body. Identical requests reuse those bytes. `--revision` changes
the prompt and cache key intentionally. Run provenance is also cached there,
keyed by the absolute output directory; it records prompts, model, transparency
path, revision, fallback seed and final PNG hashes. Selective reruns require that
run record. Only final PNGs and `manifest.json` go into `public/art`.

The API accepts no reproducible image seed in this pipeline: its seed is **none**,
and an exact AI reproduction requires the cached bytes. Every fallback uses
seed **42017**; fallback generation and all post-processing are deterministic
for the locked dependencies. `manifest.generatedBy` describes the key-pose
sources: one model, `programmatic`, or `mixed` when sources differ. Deterministic
animation, lettering and tile variants are post-processing, including when the
key poses all came from a model.

## Prompt record

The shipped 26 key poses were generated with **gpt-image-2**, confirmed in the
model list on 2026-09-17. All transparent subjects used native alpha; the far
skyline and concrete source tile used opaque backgrounds. No programmatic
fallbacks were needed for this release. The 26 final PNGs total **216,592 bytes**.
Each source has API seed **none**, and the fallback seed listed below is for
offline reproduction.

The common prefix is:

> Original 16-bit pixel art for USER + JEV: P(DOOM) PROTOCOL. Dark neon city, cyan,
> magenta, acid green, amber, indigo. Strong readable silhouettes, hard pixel
> clusters, no gradients, no antialiasing. No real people, logos, political
> symbols. No text or lettering. One isolated subject, no shadow, no ground
> plane, no border.

`scripts/art/catalog.ts` is the exact prompt source. Each subject below is
followed by its intended resolution, a transparent-background instruction when
applicable, and an instruction to generate one complete key pose for sheets.
The request ends with `Art direction revision: N.`; opaque retries additionally
require a uniform pure `#0000ff` background and exclude that blue from the
subject. Billboard lettering is drawn by the deterministic bitmap font; the
model only paints the blank sign. The logo is a text-free original crest.

| Asset                | Subject / distinguishing prompt                                                                                                                                                                                                    | Revision | Fallback seed |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------- |
| user                 | Human runner facing right; amber jacket, short cyan scarf, slate trousers, swept hair, tiny blaster at chest. Chibi, head one third of height, broad torso, thick limbs, planted feet, narrow silhouette, at most 12 solid colors. | 2        | 42017         |
| jev                  | Friendly robot facing right; large cyan visor, slate shell, short magenta scarf, white chest, thick legs, tiny blaster at chest. Same chibi proportions and simplicity as User.                                                    | 2        | 42017         |
| doom_prophet         | Thin hooded preacher facing right, ragged indigo robe, hunched shoulders, amber eyes, blank placard.                                                                                                                               | 1        | 42017         |
| catastrophe_prophet  | Angular alarmist facing right, wild white hair, magenta coat, screen with abstract red descending graph.                                                                                                                           | 1        | 42017         |
| datacenter_blockader | Stout barricade builder facing right, acid green vest, hard hat, boots, dark barrier plate.                                                                                                                                        | 1        | 42017         |
| purity_enforcer      | Heavy robot facing right, ivory/violet armor, magenta visor, rectangular forearm shield.                                                                                                                                           | 1        | 42017         |
| hall_monitor         | Hovering rectangular indigo drone facing right, cyan eye, amber thrusters, antenna.                                                                                                                                                | 1        | 42017         |
| reply_horde          | Tiny scuttling robot facing right, acid green angry screen face, little legs, magenta cable tail.                                                                                                                                  | 1        | 42017         |
| consensus_engine     | Symmetrical industrial computer idol, indigo server towers, huge magenta mechanical eye, cyan conduits, green reactor, armored clamps.                                                                                             | 1        | 42017         |
| coin                 | Chunky amber token, square circuit inset, side view.                                                                                                                                                                               | 1        | 42017         |
| health               | Cyan medical canister with green capsule inset; no cross symbol.                                                                                                                                                                   | 1        | 42017         |
| ammo                 | Open indigo ammunition box with three amber energy cells.                                                                                                                                                                          | 1        | 42017         |
| fact_check           | Cyan crystalline diamond with white check-shaped geometric spark.                                                                                                                                                                  | 1        | 42017         |
| weapon_crate         | Violet armored supply crate, amber clasps, cyan barrel icon.                                                                                                                                                                       | 1        | 42017         |
| switch               | Wall lever with indigo housing, amber handle, green lamp.                                                                                                                                                                          | 1        | 42017         |
| exit                 | Industrial doorway, luminous cyan frame, indigo interior, amber corner plates.                                                                                                                                                     | 1        | 42017         |
| projectiles          | Horizontal cyan bolt pointing right, white center, short angular trail.                                                                                                                                                            | 1        | 42017         |
| fx                   | Angular eight-pointed amber/cyan impact spark, no glow blur.                                                                                                                                                                       | 1        | 42017         |
| tiles                | Seamless orthographic dark concrete tile, indigo seams, bolts, restrained cyan highlights, edge-to-edge.                                                                                                                           | 1        | 42017         |
| bg_far               | Distant indigo skyscrapers and spires, dim cyan windows, dark night sky, empty upper half.                                                                                                                                         | 1        | 42017         |
| bg_mid               | Industrial rooftops, ducts, magenta windows, cyan antennas, empty transparent upper half.                                                                                                                                          | 1        | 42017         |
| bg_near              | Dark foreground pipes, railings and amber hazard lamps, empty transparent upper half.                                                                                                                                              | 1        | 42017         |
| billboards           | Worn indigo metal sign, amber border, blank central panel.                                                                                                                                                                         | 1        | 42017         |
| portrait_user        | Amber jacket runner bust, cyan scarf, swept dark hair, determined, facing right.                                                                                                                                                   | 1        | 42017         |
| portrait_jev         | Friendly indigo robot bust, cyan visor, magenta scarf, white armor.                                                                                                                                                                | 1        | 42017         |
| logo                 | Linked cyan/amber circuit brackets protecting a magenta diamond reactor; no letters.                                                                                                                                               | 1        | 42017         |

## Layout and review

All sprite sheets have four frames per row, ordered exactly as `manifest.ts`
specifies. Player frames are 32x48. Enemy frame sizes come directly from
`ENEMY_DEFS`; visuals do not change collision bounds. One generated pose supplies
every row, with deterministic bob, leg offsets, recoil, squash and accent
effects. This preserves identity across animations rather than relying on the
model to invent consistent frames. These are deliberately simple derived
animations, not separately drawn poses.

Props define their row names in the manifest: projectiles use the simulation's
projectile kinds; FX use `impact`, `explosion`, `pulse`, `dash`; switches use
`off`/`on`. Tile indices are explicitly mapped to collision/decor types in the
manifest. Billboards are three 192x80 frames, with exact slogans `P(DOOM)=99%`,
`PAUSE EVERYTHING`, `NO DATACENTERS`. Backdrops are 640x360, portraits 96x96, and
the logo 384x128. Resolve relative PNG references against `/art/`.

Every CLI run writes `scripts/art/review/contact-sheet.png` (gitignored).
Inspect that overview and open every complete sheet against a dark background:
check alpha edges, silhouette, consistent proportions, row boundaries, readable
signs and palette. Revise the subject/revision and rerun `--only` for a rejected
asset. The first User/Jev generation had overly thin bodies and long extended
arms/scarves, so revision 2 requests broad chibi proportions and compact poses.
All 26 final PNGs, including every animation row, were opened and reviewed.
Billboard text received a solid inset frame for contrast against the decorative
generated sign. The contact sheet attached to the PR records the final review.

Unit tests validate the shipped manifest using `ArtManifestSchema`, every
referenced PNG's dimensions/palette/nonempty frames, enemy sizes, the 6 MiB
budget, cache reuse, chroma processing, dry-run network isolation, and identical
fallback bytes across two runs for every asset.

## Audio integration

```ts
import { createAudioEngine } from "@/game/audio/engine";

const audio = createAudioEngine();
audio.startMusic("title");
// In a user gesture handler:
await audio.unlock();
// Once for each batch of new simulation events:
audio.handleEvents(events, listenerX);
// On game teardown:
audio.dispose();
```

The return type is the existing `AudioEngine`. `WebAudioEngine` and
`AudioEngineOptions` are also exported; tests may inject `createContext`.
Construction is inert on the server. `unlock()` creates/resumes the context
lazily and may reject if the browser refuses a gesture; callers can retry.
Request music before unlocking if desired. Available tracks are `title`,
`level`, `boss`, `victory`, and `defeat`; boss/win/loss events select the matching
track automatically after unlock. Stop or reset music explicitly between runs.

`setMasterVolume`, `setMusicVolume`, `setSfxVolume` clamp to [0,1]; mute preserves
the saved levels. Pass new events once, not the accumulated event log. Positional
events pan by `(event.pos.x - listenerX) / 480`, clamped to [-1,1]; events without
a position are centered. Both co-op shots in the same tick remain audible.
Cooldown-blocked shots, projectile expiry, revive progress and repeated revive
interaction are silent; no-ammo clicks are throttled separately per player.
All other event kinds have synthesized cues. The engine uses 64 bounded voices,
short gain envelopes, deterministic noise, and a single look-ahead music timer.
`dispose()` cancels voices/timers and closes the context idempotently.

No Phaser or React wiring is included in this track. Mocked WebAudio tests
exercise all event kinds, weapons, stereo pan, volumes, unlock/retry, scheduling,
voice limits and cleanup. Listening in the integrated browser remains a client
integration check.
