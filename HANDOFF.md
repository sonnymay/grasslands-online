# HANDOFF.md — Grasslands Online

> **READ TOP-TO-BOTTOM BEFORE TOUCHING CODE.** Single source of truth between
> coding sessions. Last refresh: 2026-05-18 (post session 34,
> player walk animation no longer spins through south-facing fallback frames.
> Code-only, RO-style directional walking readability fix).
>
> **ALSO READ `project-grasslands/CLAUDE.md`** — short behavioral guidelines
> (think before coding, simplicity first, surgical changes, goal-driven
> execution). It carries the project's authoring rules; this file carries
> the project's state.

---

## 1. Project overview

**Grasslands Online** — browser-based 2D MMORPG inspired by Ragnarok Online.
Original name, original art, original code, copyright-safe.

- **Owner:** Sonny (GitHub: `sonnymay`)
- **Repo:** https://github.com/sonnymay/grasslands-online (public)
- **Live prod:** https://grasslands-online.vercel.app
- **Local repo root:** `/Users/santipapmay/Documents/Grasslands Online`
- **Playable subfolder (Vercel `outputDirectory`):** `project-grasslands/`
- **Engine:** Phaser 3.70 from CDN
- **Language:** plain JavaScript + HTML, **no build step, no npm packages**
- **Art:** ChatGPT image-gen, anime 2D, no pixel art

### Run locally

```bash
cd "/Users/santipapmay/Documents/Grasslands Online/project-grasslands"
python3 -m http.server 8000
# open http://localhost:8000
```

Claude Code preview server: `mcp__Claude_Preview__preview_start` name
`grasslands` (port 8001; configured in
`/Users/santipapmay/Documents/Grasslands Online/.claude/launch.json` with
`--directory project-grasslands`).

### Deployment

- Vercel auto-deploys on every push to `main` via the GitHub integration.
- `vercel.json` at repo root sets `outputDirectory: project-grasslands`,
  no build/install command, and these cache headers:
  - `index.html` + `game.js` → `max-age=0, must-revalidate`
  - `assets/(.*)` → `max-age=31536000, immutable`
- `.github/workflows/ci.yml` runs `node -c` on `game.js` and a smoke fetch
  on each push.
- `.github/workflows/vercel-deploy.yml` is a **manual** fallback workflow.
- `DEPLOY.md` at repo root has the production URL, project IDs, and
  step-by-step Vercel setup notes.

### Controls

- Click ground → A* path → walk.
- Click a monster → walk into range + auto-attack until target dies. No
  re-clicks needed.
- `Tab` → target nearest live monster.
- `Shift+R` → wipe localStorage save and reload.
- **No WASD, no arrow keys, no skill hotkeys, no camera shake.** All
  intentionally removed at user request.

---

## 2. Current state — what works right now

### Movement
- 32 px logical cell grid (`CELL_SIZE = 32`, `GRID_COLS/ROWS = 100`) over the
  3200×3200 world. 128 px display tiles draw on top via `buildMap`.
- 8-direction A* (`findPath`, octile heuristic, diagonal-squeeze guard) with
  `MAX_PATH_LEN = 256` and an 8 000-iteration cap.
- Player position lerps cell-to-cell at `MS_PER_CELL = 170`. Sprite Y is
  offset by a full-sine bob (`BOB_AMPLITUDE = 3`) plus a 10% vertical squash
  for foot-fall feel.
- Animation cycles **4 walk frames per direction** when all walk3/walk4
  textures load. `_pickWalkFrame()` auto-detects, falls back to 2-frame.
  Frame cadence ≈ `WALK_FRAME_MS = 120` per frame.
- 8-direction sprite art for N/S/E/SE/NE. SW/NW/W = horizontally-flipped
  versions of E/SE/NE via `DIR_TEXTURE` map.
- Click marker (fading green ring) shows the target spot on every move.
- Hit stun: 200 ms of frozen movement after being damaged.

### Combat (fully auto)
- Click monster → A* to a cell adjacent to it, attack on cooldown until dead.
- Player ATK 10 (+ level scaling). ±20 % damage variance per swing.
- 3 % critical hit (×2, yellow `-N!`, big text, rich SFX).
- 5 % player whiff, 10 % monster whiff → `MISS` floats.
- DEF reduces incoming dmg, min 1.
- Tab cycles target. Persistent red ellipse ring sits under the current
  target.
- Auto-attack is range-aware: when target steps out of range player repaths
  to an adjacent cell; when in range the path is cleared so the player
  plants and swings.

### Player progression
- HP regen: 2 % maxHP every 3 s, paused while stunned.
- EXP threshold = `level × 100`. On level-up: +20 maxHP, +3 ATK, +1 DEF,
  full heal, jingle, `LEVEL UP!` text.
- Death: lose 5 % of `expNeeded()`, respawn at spawn cell after 3 s with
  full HP.

### Monsters (`MONSTER_TYPES` table)
Each entry now has a `zones: [...]` whitelist; `spawnMonster()` rejects
spawns outside the listed zones.

| Type | HP | ATK | EXP | Speed | Count | Zone(s) | Notes |
|---|---|---|---|---|---|---|---|
| `blobling` | 50 | 5 | 10 | 80 | 30 | grasslands | Pink slime |
| `mooham` | 80 | 8 | 18 | 70 | 20 | grasslands, ruins | Pig |
| `moowaan` | 60 | 6 | 14 | 90 | 15 | forest, riverside | scaleMult 0.9 |
| `cactling` | 70 | 7 | 16 | 85 | 12 | desert | Real green cactus sprite (replaced tinted Dune Blob in session 6) |
| `boss_mooham` | 240 | 16 | 90 | 55 | 1 | desert | Far-zone challenge, scaleMult 1.9 |
| `bigfoot` | 900 | 220 | 500 | 45 | 1 | forest | **Forest boss**, fixed level 50, no scaling, aggressive (520 px aggro), one-shots players below lv 50. Uses `aggroKey/chaseKey/attackKey/idleKey` extra textures. `minSpawnDistance: 2400` keeps him on the far edge so new players don't walk into a one-shot. |

All monsters are **passive**. They only chase + attack the player after
being hit (`provoked` flag, drops after 5 s of no damage). Monster level
1–3 rolled per spawn (weighted 65/27/8); HP / ATK / EXP scale with level.
On death: 1.5 s dead pose → despawn → respawn 5 s later via
`spawnMonster(typeId)`, with a white "puff" ring effect.

### Loot
- Every monster drop: zeny coin (60–160 % of EXP reward), bounces in,
  pulses to be visible.
- 15 % chance: extra green healing herb (+20–35 HP).
- Pickup radius 28 px; auto-collected when walking over.
- Soft ground shadow under every monster / loot for grounding.

### UI
- Phaser now uses `Scale.RESIZE` with `GAME_W/GAME_H` derived from the
  browser viewport. The game canvas fills the available browser surface
  instead of letterboxing a fixed 16:9 frame.
- Phaser `resolution` is capped to device pixel ratio (max 2), and HUD text
  objects use high-resolution text rendering to reduce blur.
- `#game` and `#game canvas` are fixed to `100vw/100vh`; no flex centering.
  HUD screen coordinates now map to browser edges.
- Bottom status band: dark olive full-width backing with framed HP, EXP,
  Lv, and Zeny panels. HP anchors left, Lv/Zeny anchors right, and EXP fills
  the space between them.
- Chat box, bottom-left, last 10 messages, padded with stronger backing and
  larger outlined text.
- Mini-map, top-right, 160×160 px: white = player, red = Blobling,
  orange = MooHam, green = MooWaan, large yellow = Boss MooHam,
  small yellow = loot. Faint dirt path drawn under markers.
- Right toolbar is grouped into Navigation / Settings / Actions, with one
  shared olive button style and color reserved for state / call-to-action.
- The `+1 Level` cheat button is visible in the normal right-side Actions
  stack by request. `+10 Levels` and `-1 Level` remain debug-only.
- Floating damage numbers: white (to player), red (to enemy), yellow
  bigger+`!` (crit), grey (`MISS`).
- Player HP bar above sprite, hidden at full HP.
- Monster nameplates are larger bold world-space labels with high-resolution
  text and thick black outline. No black backing boxes.

### Day/night
- Cosine-driven darkness overlay, 2-minute loop, max alpha 0.45.
- Implemented as a `scrollFactor 0` fullscreen rect at depth 9000.

### Persistence
- `localStorage[grasslands_save_v2]` auto-saves every 3 s and on level-up.
  Bumped from `v1` when the world doubled — old saves had cells in a
  100×100 grid and would land in the wrong zone in the 200×200 world.
- Saves: `level, exp, hp, maxHP, atk, def, zeny, kills, cellCol, cellRow`.
- On load: position falls back to spawn if the saved cell is now blocked
  by decorations.
- `Shift+R` wipes the save and reloads.

### Audio
- **WebAudio synthesised SFX**, no asset files: footstep scuff, melee hit
  (noise + descending square thud), critical (noise sweep + bell stack +
  bass), miss, player-hit, level-up jingle, pickup, death.
- **Background music**: `assets/audio/bgm.mp3` (4 MB). Preloaded by Phaser,
  built with `sound.add('bgm', { loop: true, volume: 0.35 })`. Tries to
  play on scene create; falls back to first pointerdown / keydown if the
  browser blocks autoplay.

### Map
- **6400×6400 world, 50×50 tile grid, 200×200 cell grid.** 4× the original
  Phase-1 footprint. A* iteration cap raised to 32 000.
- **5 themed zones** (`getZone(r, c)`) carved around a central grasslands
  core (~9 tiles either side of map center):
  - **grasslands** (center) — original mix, no tint, all standard deco
  - **forest** (N) — heavy trees, dark bushes, green tint `0x6b8a5a`
  - **desert** (S) — sparse rocks, yellow tint `0xe8c878`
  - **ruins** (W) — heavy rocks + dead bushes, grey tint `0xb0a890`
  - **riverside** (E) — ponds + flowers + trees, blue-green tint `0xa8c8b0`
- **Desert is the first real per-biome tileset:** `sand_tileset.png` is
  wired in `buildMap` as of session 6 — desert cells draw sand tiles
  with no tint. Forest / ruins / riverside still recolor `grass_tileset`
  via `setTint` until their own tilesets land.
- Mini-map gets a sampled zone backdrop so all 5 biomes read at a glance.
- Centre cross dirt path (horizontal + vertical mid-row / mid-col).
  Path tiles also tint to blend with biome. Plain grass tiles use
  GRASS / THICK_GRASS, random flipX/flipY to break the 128 px grid.
- Decoration scatter overlay (`buildDecorations`):
  - 220 tall-grass clumps
  - 110 flower clusters
  - 90 mushrooms
  - 70 bushes (cell-blocking radius 1)
  - 35 trees (cell-blocking radius 2)
  - 3 ponds (cell-blocking radius 3)
  - Rock PNGs are loaded but **commented out** of placement.
- Spawn cell + a 3×3 area around it always forced walkable post-scatter so
  the player never starts inside a tree.
- Source PNGs lack alpha → `keyOutWhite()` strips near-white pixels at
  runtime via canvas. Skipped silently if a texture is missing.

---

## 3. What we did in session 34 (latest)

Cache now at **`?v=126`**. Sonny reported that the character body kept
spinning while walking; goal was Ragnarok Online-style directional walking.

1. **Root cause.** Class sprites only have `walk_<dir>` and `idle_<dir>`
   frames, while `_pickWalkFrame()` was asking for `walk2` / `walk3`
   variants. `pickPlayerTextureKey()` then fell back to `walk_south`, so a
   north/east/diagonal step briefly showed a south-facing body. That read as
   spinning.
2. **Directional frame guard.** `PlayerController._hasDirectionalTexture()`
   now checks whether the chosen walk frame exists for the active direction
   and class/tier prefix. If `walk2` / `walk3` is missing but `walk_<dir>`
   exists, the animation uses that directional walk frame instead of the
   south fallback. If no directional walk exists, it falls back to directional
   idle.
3. **Rookie 4-frame animation preserved.** Rookie sprites still use their
   existing `walk2` / `walk3` / `walk4` directional frames because they
   exist on disk.
4. **Verification.** `node -c project-grasslands/game.js` exited 0.
5. **Cache bump.** `?v=125` → `?v=126`.

## 3.1. What we did in session 33

Cache now at **`?v=125`**. Continued Sonny's "beautiful like Ragnarok
Online" map pass with no new art and no atmospheric darkening.

1. **Per-biome weighted terrain tile rolls.** `buildMap()` now uses distinct
   non-path ground probabilities by zone:
   - Forest favors `THICK_GRASS`, `TALL_GRASS`, and flowers for lush floor.
   - Desert favors `ROCKS_SPARSE`, `DIRT_PATCH`, `DIRT_HEAVY`, and
     `ROCKS_DENSE` so sand areas read rockier and drier.
   - Ruins favors `DIRT_PATCH`, `ROCKS_DENSE`, `ROCKS_SPARSE`, and
     `DIRT_HEAVY` for broken-stone personality.
   - Riverside favors grass, tall grass, flowers, and colored flowers for a
     wetter meadow feel.
   - Grasslands keeps the session-31 balanced baseline.
2. **Boundary rolls are biome-aware too.** Zone-edge cells still get richer
   transition texture, but now use the destination biome's visual vocabulary
   instead of one shared flower/dirt recipe.
3. **Bright-world rule preserved.** No overlays, no halos, no spotlights, no
   lighting changes. Day/night cap untouched.
4. **Verification.** `node -c project-grasslands/game.js` exited 0.
5. **Cache bump.** `?v=124` → `?v=125`.

## 3.2. What we did in session 32

Cache now at **`?v=124`**. Sonny: "make it beautiful like Ragnarok
Online." No new art yet — push the existing decoration set as far as it
goes via density + cluster patches.

1. **Decoration density ~2.5×.** Counts re-tuned for the 19200² world.
   Grasslands grass 350 → 700, flowers 180 → 360, mushrooms 140 → 220,
   bushes 110 → 180, trees 60 → 110, ponds 4 → 10. Forest trees 320 →
   620, bushes 180 → 340, mushrooms 220 → 420, grass 200 → 380. Desert
   rocks 200 → 380, cacti 140 → 280, dunes 60 → 120, dry grass 40 → 80.
   Ruins rocks 300 → 600, bushes 80 → 160, grass 120 → 240. Riverside
   ponds 18 → 40, grass 280 → 560, flowers 200 → 400, trees 70 → 140.
2. **Cluster spawner — RO thicket feel.** New `placeCluster()` helper
   plants N copies of a key within ±1.4 tiles of one anchor, so ground
   cover reads as *patches* (grass thickets, flower beds, mushroom
   rings, rock piles, cactus oases) not even scatter. Wired in for
   grasslands grass + flowers, forest mushroom rings, desert cactus
   clusters, ruins rock piles, riverside flower patches by water.
3. **Sway tween budget guarded.** Cluster passes only sway 40 % of
   their members so total tween count stays in Phaser's manager budget
   even with the larger scatter.
4. **Verification.** `node -c project-grasslands/game.js` exited 0.
5. **Cache bump.** `?v=124` → `?v=124`.

## 3.3. What we did in session 31

Cache now at **`?v=124`**. Pure-code map polish ahead of new art landing.

1. **Tile variety pass.** `buildMap()` was only using 4 of the 16 frames
   in `grass_tileset.png` for grass cells; the other six valid frames
   (FLOWERS_COLOR, ROCKS_SPARSE, ROCKS_DENSE, DIRT_H2, DIRT_V2,
   TALL_GRASS) were dead code. They're now in a weighted roll —
   GRASS 32 % / THICK_GRASS 26 % / TALL_GRASS 14 % / FLOWER 10 % /
   FLOWERS_COLOR 6 % / ROCKS_SPARSE 6 % / ROCKS_DENSE 3 % / DIRT_PATCH 3 %
   — so the field stops reading as the same two tiles repeated across
   100×100 cells. Boundary cells get a separate richer roll
   (FLOWER / FLOWERS_COLOR / DIRT_PATCH / TALL_GRASS).
2. **Path variety.** Horizontal and vertical dirt path tiles now
   alternate 55/45 between their primary and alt frames (DIRT_H/H2 and
   DIRT_V/V2), breaking the monoline look of the roads.
3. **Verification.** `node -c project-grasslands/game.js` exited 0.
4. **Cache bump.** `?v=122` → `?v=124`.

## 3.0. What we did in session 30

Cache stays at **`?v=122`** — no `game.js` change. Tier 0 of the post-29
map-art upgrade arc is a prompt/spec deliverable, not a code change.

1. **`ASSET_PLAN.md` created at repo root.** Single doc with the exact
   ChatGPT image-gen prompts + filenames + paths for:
   - Tier 0a: forest / ruins / riverside tilesets (768×768, 3×3 grid,
     mirror the existing grass + sand sets so `sliceTileset` works as-is).
   - Tier 0b: 5 biome-defining decorations per missing biome (forest /
     ruins / riverside), 256×256, near-white background.
   - Tier 0c: one hero landmark prop per biome (spawn signpost, forest
     shrine, desert obelisk, ruins well, riverside bridge).
2. **Bright-world rule enforced in every prompt.** No deep shadows, no
   fog, no night palette — locks in Sonny's reject of the session 29
   atmospheric pass.
3. **Wiring order documented.** Each asset class lists the exact game.js
   touch points (preload line, buildMap branch at game.js:1229, scatter
   table append, cache bump) so the swap is one small commit per biome.
4. **No code touched.** `node -c project-grasslands/game.js` not re-run
   because no `.js` changed; `index.html` still references `game.js?v=122`.

Commit on `main`: `(see latest push)`.

## 3.1. What we did in session 29 (in order)

Cache now at **`?v=112`**. Sonny opened with "HUD text is small and blurry —
make it crisp, screen-space, edge-anchored, responsive." Several rounds of
iterative feedback followed: first an overcorrection (HUD too big and noisy),
then a cleanup pass (remove specific buttons, chat, duplicate HP bar), then a
wheel-zoom feature. All HUD work landed; gameplay logic untouched.

1. **Root cause of "blurry HUD" — found and fixed.** The main camera's
   `setZoom(0.65)` (sessions 27) silently shrank every `setScrollFactor(0)` UI
   object to 65 % of its authored size and softened its antialiased text. We
   added a dedicated UI camera at zoom 1 in `create()`. New objects are auto-
   sorted: anything with `scrollFactorX === 0` is `mainCam.ignore`'d, otherwise
   `uiCam.ignore`'d. Sorting runs on the `POSTUPDATE` event so chained
   `.setScrollFactor(0)` calls have a chance to execute first. `scene.scale.on
   ('resize')` keeps the UI camera's viewport pinned to the browser size.
2. **HUD pass 1 — bigger panels.** Bottom HP/EXP/Lv/Zeny bar grew to 96 px,
   fonts to 18–26 px; quest/gear/streak/discovery widened and bolded; chat
   widened; minimap and toolbar buttons enlarged. Crisp again but visually
   loud — Sonny called it "messy and intrusive, covers too much of the world."
3. **HUD pass 2 — clean redesign.** Bottom bar shrunk to 56 px with slim
   16 px HP/EXP bars and a compact Lv/Zeny chip on the right. Upper-left
   stack uses `UL_X=12`, `UL_PAD=6`, and one shared `panelW` so quest (56h)
   → gear (40h) → boss ticker (26h) → streak (26h) → discovery (24h) line
   up as a single column. Boss bar shrank to 360–480 px wide × 18 px tall,
   centered. Toolbar buttons shrank to `miniW - 8` × 26 px with 12 px bold
   text. `relayout(w, h)` now recomputes every edge-anchored element on
   browser resize, and shifts the toolbar column by the delta when the
   right edge moves.
4. **HUD pass 3 — surgical removals.** Sonny asked us to delete three
   toolbar buttons (`Map 1x`, `⚔ Hard: ON/OFF`, `HUD: Full/Compact`), the
   entire chat / combat-log panel, and the duplicate HP bar that lived
   under the minimap. Creation blocks were removed; `hardMode` and
   `hudCompact` still default to `false` so the rest of the codebase that
   reads them keeps working. `ui.message(...)` is now a no-op on screen
   (still buffers internally in `this.messages`) and `applyCompactHud()`
   collapsed to an empty method. The mini HP under the minimap is gone;
   `toolbarY` now starts `miniHpY + 12` instead of `+22` so the toolbar
   tucks straight under the map.
5. **Mouse-wheel zoom.** Added a `scene.input.on('wheel', ...)` listener
   right after `setZoom(0.65)`. Wheel up multiplies camera zoom by 1.12;
   wheel down divides by 1.12. Clamped to `[0.4, 1.6]`. Only the main
   camera is touched, so the UI camera stays at zoom 1 and the HUD remains
   crisp at its authored size. `startFollow(player.sprite)` keeps the
   world centered on the player while zooming.
6. **Cache bumps.** `?v=109` → `?v=110` → `?v=111` → `?v=112` as the four
   passes shipped.
7. **Bottom-right Lv/Zeny separator.** Lv and Zeny were colliding because
   both shared the same center-anchored origin inside a 170 px panel. The
   panel grew to 210 px, the Lv now anchors at the left edge (`origin (0,
   0.5)`) and Zeny at the right edge (`origin (1, 0.5)`), with a thin
   gold vertical divider at 42 % of the panel width. Relayout updated to
   match.
8. **Change Class button stopped flickering.** `update()` was calling
   `setColor` + `setFontSize` every single frame, and the dynamic font
   size flipped between 10 px and 12 px each frame when the label width
   straddled the threshold — both forced re-renders. Color is now cached
   in `_clLastColor` and only re-applied when it changes; font size is
   fixed at 12 px.
9. **Music: ON/OFF.** The 5-step volume cycle (0/25/50/75/100 %) was
   replaced with a clean binary toggle at a fixed 50 % BGM volume. Label
   reads `♪ Music: ON` / `♪ Music: OFF`. New storage key
   `grasslands_music_v3` (`'0'` / `'1'`), default ON. Tooltip updated.
10. **Upper-left consolidation.** The boss-ticker, hot-streak, and
   discovery panels are now permanently hidden — they were redundant
   (boss bar at top center already reports boss state, streak fires as
   float text over the player, discovery now lives inline on the gear
   line as `★ N/5`). The UL column is just quest (when active) + gear,
   matching Sonny's "fewer, cleaner boxes."
11. **Player nameplate readability.** `nameTag` grew from 14 px regular
   to 17 px bold, stroke 3 → 5, with a 2 px drop shadow + resolution 2.
   `titleTag` went 11 → 13 bold with matching shadow. Title offset moved
   from `-14` to `-18` so the two lines don't kiss with the bigger type.
   Reads cleanly on grass, sand, and ruins backdrops.
12. **Cache bump.** `?v=112` → `?v=113`.
13. **Bigfoot 3× bigger.** `MONSTER_TYPES.bigfoot.scaleMult` 2.2 → 6.6 to
    match Sonny's "make him 3× bigger" feedback. Lore/stats untouched.
14. **Cache bump.** `?v=113` → `?v=114`.
15. **"Ghost monster that follows the camera + can't be clicked" — root
    cause + fix.** Adding the UI camera in session 29 broke pointer-to-
    world conversion. Phaser's `pointer.worldX` / `pointer.worldY` is
    resolved against whichever camera the input manager has selected; the
    UI camera (added last, full-viewport) became the top camera, so
    `worldX/Y` started returning *screen* coordinates. The monster click
    test compares `Math.hypot(wx - sprite.x, wy - sprite.y) < 80` against
    *world* coords, so every click missed. To the player it looked like a
    sprite hovered near the cursor that couldn't be targeted. Fix: both
    pointer paths (`pointermove` cursor + `pointerdown` click) now call
    `pointer.positionToCamera(scene.cameras.main)` to get world coords
    from the main camera explicitly. Added null-safety guards on
    `b.sprite` / `b.sprite.scene` so stale references after death/cleanup
    can't throw.
16. **Cache bump.** `?v=114` → `?v=115`.
17. **Ranged Archer + Mage.** Added a `playerAttackRange()` helper:
    Archer = 560 px, Mage = 380 px, Swordsman / no-class = 100 px (the
    old `ATTACK_RANGE`). The two range checks (update loop + the
    `attemptPlayerAttack` swing gate) both call the helper instead of the
    constant. `_repathToTarget` now early-returns when the target is
    already inside the class's range — ranged classes don't chase, they
    fire from where they stand. The existing `spawnClassAttackFx` already
    tweens an orb/arrow from the player to the target, so the visual
    works at any distance with no asset changes.
18. **"Endless" map (4× area).** `WORLD_W` / `WORLD_H` bumped 6400 →
    12800. All derived values (`MAP_COLS`, `MAP_ROWS`, `GRID_COLS`,
    `GRID_ROWS`) scale automatically. Camera bounds, physics bounds, and
    spawn jitter are all defined off the same constants so they expand
    together. This is "feels endless" not literally infinite — true
    infinite scrolling would need a chunked terrain refactor (deferred).
19. **Cache bump.** `?v=115` → `?v=116`.
20. **Map even larger.** `WORLD_W` / `WORLD_H` 12800 → 19200 (3× linear,
    9× area vs the original 6400). 150×150 = 22 500 pre-built tile
    images. Beyond this the first-load cost gets noticeable and GPU
    memory tightens on low-end devices.
21. **Cache bump.** `?v=116` → `?v=117`.
22. **Monster density rescale.** Per-type counts ×5 to match the 9× world
    area (Blobling 30 → 150, Mooham 20 → 100, Moowaan 15 → 75, Dune
    Blob 12 → 60). Bosses still rare (count 1).
23. **Minimap player marker.** Outer yellow ring + larger white dot so
    the player stays visible on the bigger world (`r 4` → `r 5` plus an
    `r 9` outline ring).
24. **Cache bump.** `?v=117` → `?v=118`.
25. **Biome tint rebalance.** `ZONE_TINTS` pushed toward richer hues so
    each biome reads as a distinct mood (forest 0x6b8a5a →
    0x88b070 mossy green, ruins 0xb0a890 → 0xc2b89e warm stone,
    riverside 0xa8c8b0 → 0xb8d8c8 cool mint). Kills the muddy-olive
    look noted in §17.
26. **Cinematic vignette.** Four MULTIPLY-blend dark quads anchored to
    the viewport corners frame the camera without dimming the centre.
    Lives on the UI camera (`scrollFactor 0`) so it stays fixed. Resize
    handler repositions corners on browser resize.
27. **Warm player halo.** Soft additive light circle under the player
    (`scene.__playerHalo`) creates a focal lantern and pulls the eye on
    busy backdrops. Alpha breathes slightly per frame.
28. **Cache bump.** `?v=118` → `?v=119`.
29. **Sky tint per time of day.** The day/night overlay used a fixed
    midnight-blue. It now interpolates noon → dusk-orange → midnight-blue
    → dawn-pink based on the cycle phase, so the screen actually reads
    as time-of-day. Alpha still tracks `worldDarkness`.
30. **Drifting cloud shadows.** Eight translucent ellipses scroll the
    world at varying speeds, wrapping at the edges. Cheap, no asset,
    instant atmospheric depth.
31. **Halo falloff at night.** The player halo shrinks ~45 % at midnight
    so nights feel like a tight lantern instead of an even glow.
32. **Cache bump.** `?v=119` → `?v=120`.
33. **Wind sway + pond shimmer.** `place()` gained `sway` and `shimmer`
    options. Grass tufts and flower clusters now oscillate ±2–3° on a
    1.6–3.2 s yoyo with randomized start delay so the field breathes
    instead of swaying in lock-step. Ponds breathe scale 1.0 ↔ 1.04 +
    a subtle alpha dip so the water catches light. ~1300 sway tweens +
    22 shimmer tweens, well within Phaser's tween manager budget.
34. **Cache bump.** `?v=120` → `?v=121`.
35. **Reverted the atmospheric lighting pass.** User flagged the
    vignette corners as "giant rectangular dark areas," the player halo
    as "a bright vertical strip / spotlight," and the world overall as
    too dark and harder to see. All three overlays (corner vignette,
    warm player halo, drifting cloud shadows) are removed. Day/night
    overlay alpha capped at 0.18 (was 0.50) so nights tint without
    dimming. Future atmosphere work must stay subtle and start *after*
    the actual map art (tilesets / props / landmarks) is upgraded.
36. **Cache bump.** `?v=121` → `?v=122`.
7. **Verification.** `node -c project-grasslands/game.js` exited 0 after
   every edit. Browser preview was intentionally skipped — Sonny asked us
   to save tokens once the live wedge from rapid `location.reload()` cycles
   showed up again (audio decoder hang documented in session 26).

### (legacy) session 28

Cache previously at **`?v=108`**. Continued from Sonny's UI/HUD polish queue,
then responded to direct feedback that the game needed true fullscreen and the
text was too small / hard to read. Follow-up feedback specifically called out
monster names as too blurry/small, then requested a sharper screen-space HUD,
the cheat button restored, no monster-name boxes, and HUD anchored to the
browser edges. Pre-existing sprite asset changes were left untouched.

1. **Right-side toolbar unified.** Replaced the one-off stack of differently
   colored buttons with a shared toolbar button factory and three labeled
   sections: Navigation, Settings, and Actions. Buttons now share the same
   olive backing, border weight, font size, and text treatment.
2. **Color semantics tightened.** Gold is reserved for action buttons
   (Travel / Change Class / Shop), muted green-grey for passive toggles, and
   red only for warning/debug state (Hard Mode on, hidden debug level buttons
   when `debug=1`).
3. **Navigation order clarified.** Map Zoom, Return Home, and Travel sit
   together; Music / Auto / Hard / HUD sit together; class and shop actions
   sit together. Existing click handlers, tooltips, persisted settings, and
   debug gating were preserved.
4. **True viewport fullscreen.** Replaced fixed-canvas `Phaser.Scale.FIT`
   with `Phaser.Scale.RESIZE`, and derive `GAME_W/GAME_H` from the browser
   viewport at load. This fills the available browser surface without faking
   it by zooming the camera in or cropping HUD corners.
5. **HUD readability pass.** Bottom HP / EXP / Lv / Zeny were consolidated
   into framed dark-olive panels; chat got padding, opacity, outline, and
   larger text; top-left quest/gear/streak/discovery cards now share backing,
   border weight, padding, and larger type.
6. **Toolbar readability pass.** Toolbar labels and buttons were enlarged,
   section headers got stronger stroke, and hidden debug buttons no longer
   reserve empty vertical space for normal players.
7. **Monster nameplate readability.** Monster labels were 12px world-space
   text, which effectively shrank under the 0.65 camera zoom. They now render
   as larger bold high-resolution text with a thick outline plus a dark
   outline; boss labels use a slightly larger font. The dark backing rectangle
   was removed after user feedback.
8. **Crisper screen-space HUD.** Phaser now renders the canvas at device-pixel
   resolution (capped at 2), and HUD text objects are explicitly set to
   high-resolution rendering. Quest, gear, boss ticker, streak, discovery, and
   chat panels were widened and their text enlarged so they read as browser
   edge UI instead of tiny scaled game labels.
9. **Cheat button restored.** `⇧ +1 Level` is visible in the normal Actions
   stack. The heavier `+10 Levels` and `-1 Level` controls still require
   `debug=1` or `grasslands_debug_v1`.
10. **HUD edge anchoring.** `#game` / `#game canvas` now use fixed
    `100vw/100vh` CSS instead of flex centering. Bottom HUD now anchors HP
    left, Lv/Zeny right, and EXP fills the available middle width.
11. **Cache bump.** `project-grasslands/index.html` now loads
   `game.js?v=108`.
12. **Verification:**
   - `node -c project-grasslands/game.js` exited 0.
   - `rg` confirmed `index.html` references `game.js?v=108`.
   - Browser preview was intentionally skipped after the user said not to
     spend more time/tokens on preview reloads.
13. **Dirty asset caveat.** Before this session began, the working tree already
   had eight modified `knight_*.png` files and ten untracked
   `wizard_*.png` files. This session left those asset changes untouched.

### (legacy) session 27

Cache now at **`?v=102`**. Focus shifted from feature queue to player-facing
polish based on Sonny's feedback (`UI/HUD 5/10`, `game feels too small`,
`character sprite size flickers`). Sonny is handing the next session off to
Codex — read this whole file plus `project-grasslands/CLAUDE.md` first.

1. **Player sprite size flicker — FIXED.** `applyRookieTexture` swapped
   player textures without recomputing scale; source PNGs differ in pixel
   height (rookie 96 vs knight 512 vs gap-fill substitutes), so the on-
   screen sprite jumped each animation frame. New
   `PlayerController._setPlayerTexture(dir, frame)` mirrors
   `MonsterController._setTex`: after the swap it recomputes
   `basePScale = PLAYER_DISPLAY_H / sprite.height` and preserves the
   walk-bob squash ratio so the bob isn't wiped. All four player-side call
   sites (dead pose, attack pose, idle/walk, class swap) route through it.
   Commit `31ebe4f`.
2. **Fullscreen-by-default viewport.** Base resolution bumped from
   `1024×768` (4:3) to `1280×720` (16:9). `#game` now sets `width:100vw;
   height:100vh` so Phaser's parent truly spans the viewport. `body`
   background painted `#3a6b35` (game's earthy green) so any residual
   letterbox on aspect-mismatched viewports blends with the world. Scale
   mode stays `Phaser.Scale.FIT` — ENVELOP was tried (commit reverted) but
   crops HUD corners on portrait / ultrawide viewports. Commit `516f6b4`.
3. **Camera zoom out + drop the manual fullscreen button.** Sonny said the
   1280×720 viewport felt too zoomed in and didn't want to click a button
   to feel full-screen. `cameras.main.setZoom(0.85 → 0.65)` shows roughly
   30% more world per frame. The right-column `⛶ Fullscreen` button and
   its scale event listeners were removed. Commit `18eaa74`.
4. **Memory written for cross-session continuity.** Three new memories:
   the HANDOFF↔CLAUDE.md cross-ref rule, fullscreen preference, and the
   prioritized UI polish list (toolbar grouping → bottom HUD bar → chat
   padding). Codex won't see these — they live in Claude Code's memory
   store, not the repo. Sonny's intent is captured in §4 below instead.
5. **Player feedback recorded for next session.** Sonny scored the game:
   Visual 7/10, UI 5/10, World 6/10, Atmosphere 6/10, Overall 6/10. The
   biggest lift is UI (toolbar feels like debug stack, fonts plain).
   §4 below ranks the polish work toward each axis.

Commits in chronological order this session: `f072fb7` (class-switch
zeny), `147c1b2` (handoff doc), `1f401e8` (cosmetic title), `ed5744c`
(handoff doc), `b36e1d2` (pity timer + title pulse), `31ebe4f` (sprite
flicker + fullscreen button — button was later removed), `516f6b4` (16:9
viewport), `18eaa74` (zoom out + remove button).

---

### (legacy session-26 entries — same calendar day, kept for trail)

Cache previously at **`?v=99`**. Picked five items from §4 queue.

7. **Quest pity timer** (item #4) — every quest stamps `bornAt` +
   `baseReward` at roll. `tickQuestPity()` runs each frame from
   `UIManager.update` and bumps the reward by +25/+50/+75% of base at
   3/5/7 minutes, capped. HUD shows `⌛+50%` on the bumped line; chat
   surfaces a one-time message per tier. Browser-verified: backdated
   bornAt to 8 min ago → tier 3 fired, rewards went 270→473z + 775→1356z.
8. **Title earn pulse** — `_refreshNameTag` now tracks `_lastTitleLabel`
   + `_titleInit` so the first refresh after load doesn't spoof an
   earn event. Subsequent title changes fire chat callout
   (`✨ Title earned: ...`), Back.easeOut scale on the titleTag, and a
   sparkle float over the player.

Commit: `b36e1d2`.

---

Cache previously at **`?v=99`**. Picked three items from §4 queue.

6. **Cosmetic milestone title above name** (item #2) — added `titleTag`
   text 14px above the existing class/level `nameTag`. Hidden until the
   player qualifies for one of the milestones. `pickPlayerTitle(p)`
   priority: Veteran (Lv40+) → Boss Hunter (5+ unique bosses) → Streak
   Master (best streak ≥25) → Tycoon (100k zeny) → Plaza Wanderer (all
   landmarks) → Wayfarer (3+ class swaps). Re-evaluated once per second
   in `player.update()` so any counter unlock surfaces automatically
   without callsite plumbing. Browser-verified: seeded Lv25 Knight with
   bestStreak 30 → `« Streak Master »` rendered above `Knight Lv.25`.
   Commit `1f401e8`.

---

Cache previously at **`?v=97`**. Picked two items from §4 queue.

1. **Class-switch zeny cost** (item #3) — `classSwitchCost()` returns 0 for
   the first class pick and `min(80000, 5000 * 2^n)` for swaps (5k → 10k →
   20k → 40k → 80k cap). `selectClass` deducts zeny on every swap and bumps
   `player.classSwitches`. Both the Change Class click handler and the card
   `pointerdown` re-check affordability so the player can't bypass by spending
   between the menu open and the card click.
2. **Change Class HUD readout** — button label now reads
   `✦ Change Class (10,000z)` once a class is set, and the text turns red
   (`#ff9999`) when the player can't cover the next swap.
3. **Hot-streak label clarity** (bug from §17) — `🔥 ×N   next +M` →
   `🔥 ×N   next in M`. M is kills until the next bonus tier, so the prior
   wording read like a flat bonus amount. Cosmetic only.
4. **Save schema** — added `classSwitches` to `saveGame()` / `applySave()`.
5. **Browser verify attempt** — Phaser loader wedged at 32/111 across
   reloads (audio decoder hang from rapid back-to-back `location.reload`).
   Logic-only change passed `node -c`; the wedge is independent of these
   edits. Cleanly close + reopen the preview tab to verify next session.

Commit: `f072fb7` (pushed to main; Vercel auto-deploy).

### (legacy) session 25

Verification-only follow-up for the Tier-2 Knight work. No cache bump or code
change.

1. **Browser runtime verified** — used Playwright against the local preview
   to seed a Lv30 Swordsman save (`classId: swordsman`, `classTier: 2`) and
   reload `index.html?debug=1`.
2. **Runtime state confirmed**:
   - `classId: "swordsman"`
   - `classTier: 2`
   - `level: 30`
   - name tag/title: `Knight Lv.30`
   - active texture key: `knight_idle_south`
   - `knight_idle_south` and `knight_walk_northeast` both exist in Phaser's
     texture manager.
3. **Visual screenshot captured** — `/private/tmp/grasslands-knight-tier2.png`
   shows the Knight sprite in-game at spawn with title `Knight Lv.30`.
4. **Browser errors** — none captured from console/pageerror during the
   verification run.

### (legacy) session 24

Follow-up to session 23. Cache now at **`?v=96`**.

1. **Knight assets imported** — copied the available Knight PNGs from
   `/Users/santipapmay/Downloads` into
   `project-grasslands/assets/sprites/` and compressed them to 512×512
   via `sips`.
2. **All expected Knight keys now exist locally**:
   `knight_{idle,walk}_{south,north,east,southeast,northeast}.png`.
3. **Two source gaps filled with nearest available art** — Downloads did
   not contain `knight_idle_east.png` or `knight_walk_northeast.png`, so
   `knight_idle_east.png` was filled from `knight_walk_east.png`, and
   `knight_walk_northeast.png` was filled from `knight_idle_northeast.png`.
   Replace those later if exact art arrives.
4. **Cache bump** — `project-grasslands/index.html` now loads
   `game.js?v=96` so browsers re-run the preload after earlier 404s.
5. **Verification**:
   - `node -c project-grasslands/game.js` exited 0.
   - `sips -g pixelWidth -g pixelHeight -g hasAlpha` confirmed sampled
     Knight files are 512×512 and have no alpha, so existing `keyOutWhite()`
     remains necessary.
   - Escalated local server on `127.0.0.1:8000` answered `HTTP/1.0 200 OK`.
   - Served `index.html` references `game.js?v=96`.
   - `assets/sprites/knight_idle_south.png` now returns `HTTP/1.0 200 OK`.

### (legacy) session 23

User asked to wire Knight sprites for Swordsman Tier 2. Cache now at
**`?v=95`**.

1. **Tier-specific player sprite prefixes** — `CLASS_DEFS.swordsman` now
   supports `tierSpritePrefixes: { 2: 'knight_' }`.
2. **Knight preload + alpha-key hooks** — `preload()` now requests
   `knight_{idle,walk}_{south,north,east,southeast,northeast}.png`, and
   `keyOutWhite()` includes those keys.
3. **Tier-aware texture picker** — `pickPlayerTextureKey()` now tries the
   current tier prefix first, then falls back to the base class prefix. For
   Swordsman Tier 2, Knight art is preferred; if a Knight frame is missing,
   Swordsman art remains the fallback so the player never reverts to rookie
   art or goes invisible.
4. **Local asset caveat** — current local checkout still has no
   `knight_*` files under `project-grasslands/assets/sprites/`
   (`find ... -iname '*knight*'` returned nothing). Code is wired for the
   expected filenames, but visual Knight art requires those PNGs to be added
   and committed.
5. **Cache bump** — `project-grasslands/index.html` now loads
   `game.js?v=95`.
6. **Verification**:
   - `node -c project-grasslands/game.js` exited 0.
   - Escalated local server on `127.0.0.1:8000` answered `HTTP/1.0 200 OK`.
   - Served `index.html` references `game.js?v=95`.
   - `assets/sprites/knight_idle_south.png` returned `HTTP/1.0 404 File not found`
     in this checkout, confirming the local asset caveat above.

### (legacy) session 22

Continued from §4 quick polish. Cache now at **`?v=94`**.

1. **Road sparkle halo follows the coin** — road sparkle zeny now creates
   a biome-tinted halo attached to the `LootDrop`, instead of a detached
   one-shot birth ring.
2. **Pickup cohesion** — the halo shares the coin bounce, follows magnet
   movement during auto-pickup, and fades out with the coin on collection.
   This makes the sparkle, magnet, and `+Nz` pickup float read as one event.
3. **Cache bump** — `project-grasslands/index.html` now loads
   `game.js?v=94`.
4. **Verification**:
   - `node -c project-grasslands/game.js` exited 0.
   - Escalated local server on `127.0.0.1:8000` answered `HTTP/1.0 200 OK`.
   - Served `index.html` references `game.js?v=94`.

### (legacy) session 21

Continued from §4 quick polish. Cache now at **`?v=93`**.

1. **Auto-save indicator pulse** — added a small dim `💾` glyph near the
   top-left HUD. It pulses brighter/larger whenever `saveGame()` writes
   successfully.
2. **Low-risk save hook** — `saveGame()` now calls
   `ui.pulseSaveIndicator()` only after `localStorage.setItem(...)`
   succeeds. Save data shape is unchanged.
3. **Cache bump** — `project-grasslands/index.html` now loads
   `game.js?v=93`.
4. **Verification**:
   - `node -c project-grasslands/game.js` exited 0.
   - Escalated local server on `127.0.0.1:8000` answered `HTTP/1.0 200 OK`.
   - Served `index.html` references `game.js?v=93`.

### (legacy) session 20

Continued from §4 quick polish. Cache now at **`?v=92`**.

1. **Mini-map zoom toggle** — new `Map 1x` button under the mini HP bar
   cycles `1x / 2x / 3x` and persists via
   `grasslands_minimap_zoom_v1`.
2. **Player-centered local map view** — `drawMinimap()` now uses a
   world-window transform. `1x` shows the full world like before; `2x` and
   `3x` zoom into a player-centered region, clamped at world edges.
3. **Zoom-aware minimap drawing** — zone backdrop, roads, landmarks,
   monsters, loot, and the player all render through the same transform.
   Off-window markers are skipped so the zoomed map stays readable.
4. **Cache bump** — `project-grasslands/index.html` now loads
   `game.js?v=92`.
5. **Verification**:
   - `node -c project-grasslands/game.js` exited 0.
   - Escalated local server on `127.0.0.1:8000` answered `HTTP/1.0 200 OK`.
   - Served `index.html` references `game.js?v=92`.

### (legacy) session 19

Continued from §4 quick polish. Cache now at **`?v=91`**.

1. **HUD compact-mode toggle** — new `HUD: Full` / `HUD: Compact` button
   in the right-side UI stack, persisted via
   `grasslands_hud_compact_v1`.
2. **Compact HUD behavior** — compact mode hides the non-essential top-left
   chips: boss ticker, hot-streak chip, and discovery badge. Quest tracker,
   gear summary, minimap, HP/EXP, and boss HP bar stay visible.
3. **Shorter chat box** — compact mode keeps chat anchored above the bottom
   HUD but shrinks it from 150px to 92px and shows the last 6 messages
   instead of 10.
4. **Cache bump** — `project-grasslands/index.html` now loads
   `game.js?v=91`.
5. **Verification**:
   - `node -c project-grasslands/game.js` exited 0.
   - Escalated local server on `127.0.0.1:8000` answered `HTTP/1.0 200 OK`.
   - Served `index.html` references `game.js?v=91`.

### (legacy) session 18

Continued from the recommended §4 order. Cache now at **`?v=90`**.

1. **Per-zone weather bursts** — `tickAmbience` now drives a lightweight
   weather scheduler: about every 90s (with jitter), the current zone gets
   a 10s no-rules particle burst.
2. **Zone-specific weather identity**:
   - Grasslands: pink petal storm.
   - Forest: low mist patches.
   - Desert: sand swirl.
   - Ruins: dust devils.
   - Riverside: short rain streaks.
3. **Night-aware weather** — forest mist reuses `worldDarkness` for denser,
   more visible night fog while keeping the effect cheap.
4. **Cache bump** — `project-grasslands/index.html` now loads
   `game.js?v=90`.
5. **Verification**:
   - `node -c project-grasslands/game.js` exited 0.
   - Escalated local server on `127.0.0.1:8000` answered `HTTP/1.0 200 OK`.
   - Served `index.html` references `game.js?v=90`.

### (legacy) session 17

Focused Codex pickup from §4. Cache now at **`?v=89`**.

1. **Boss trophy inspector modal** — clicking the gear summary chip still
   prints weapon / armor / trophy details to chat, and now also opens a fixed
   overlay listing every boss, current trophy count, zone, associated gear
   reward, and next total trophy milestone target.
2. **Modal input safety** — new `trophyOpen` flag blocks world clicks while
   the trophy panel is up. The overlay follows the `showShop` /
   `showTravel` pattern: fullscreen interactive backdrop, explicit
   `Phaser.Geom.Rectangle` hit areas, and per-child `setScrollFactor(0)`.
3. **Cache bump** — `project-grasslands/index.html` now loads
   `game.js?v=89`.
4. **Verification**:
   - `node -c project-grasslands/game.js` exited 0.
   - Escalated local server on `127.0.0.1:8000` answered `HTTP/1.0 200 OK`.
   - Served `index.html` references `game.js?v=89`.

### (legacy) session 16

Big QoL + content batch on top of Codex's session 15. Cache now at
**`?v=88`**. All commit hashes are on `main` and pushed.

**Auto-safety + exploration:**
1. **Panic-heal** — when `player.hp / player.maxHP < 0.25`, the player
   auto-spends `PANIC_COST` (50z) for a full heal, gated by a 6s
   `PANIC_COOLDOWN_MS`. Green `💚 PANIC HEAL +N` float + heal chime +
   chat line. Constants live near the top of `game.js`.
2. **Landmark discovery rewards** — first time the player's cell
   touches one of the 5 plaza tiles (`landmarkTiles()`), they earn
   `DISCOVERY_ZENY` (250z) + `DISCOVERY_EXP` (75 EXP) with a
   center-screen banner + chime. Tracked per-plaza in
   `player.visitedLandmarks` (saved). Spawn plaza auto-unlocks when
   the player first stands on it; the Travel overlay below also
   auto-marks it visited so the warp panel is usable immediately.
3. **Fast-travel system** — new 🧭 Travel button in the right UI
   stack opens `showTravel(scene)`, listing all 5 landmark plazas
   with friendly biome names (`landmarkLabel`). Unvisited rows show
   `??? (undiscovered) — Locked`; visited rows are clickable and
   warp the player instantly to that plaza's cell. Same modal
   pattern as the shop / class chooser (explicit Phaser hit areas,
   per-child `setScrollFactor(0)`, blocks world clicks via
   `travelOpen` flag).

**Ambient world feel:**
4. **Road sparkles** — `tickRoadSparkles` drops a small 5–25z zeny
   coin on a random road / path / landmark tile within 900 px of
   the player every 8s, capped at 6 alive. Auto-magnet picks them
   up. Birth flash tinted by zone (gold grasslands / green forest /
   sandy desert / grey ruins / cyan riverside).
5. **Biome ambience particles** — `tickAmbience` spawns small
   per-zone particles tinted/styled by `AMBIENCE_STYLE` (forest =
   falling leaves, riverside = blue motes, desert = heat specks,
   ruins = dust, grasslands = warm fireflies). Spawn rates in
   `AMBIENCE_RATE_PER_SEC`.
6. **Day/night-aware ambience** — `worldDarkness` (0..1) is exposed
   from the day/night cycle. Particle rate scales up to 2.5× at
   midnight, plus warm fireflies drift on top of any biome once
   darkness > 0.4. Chat once per cycle: `🌙 Night falls. Fireflies
   stir.` at 0.65, `🌅 Dawn breaks.` at 0.15.

**HUD + UI polish:**
7. **Persistent boss ticker** — small top-left line under the gear
   bar shows the current biome's boss state: `☠ Bigfoot: roaming`
   or `☠ Bigfoot: returns in 1:23`, updated each tick from
   `bossRespawns[]`. Hidden in zones without a boss.
8. **Boss respawn toast** — `spawnMonster` broadcasts a top-screen
   `☠ [Name] has returned to the [Biome]!` toast + chat line +
   level-up chime when a non-rare boss respawns (initial spawn at
   scene create is silent because `ui` isn't built yet).
9. **Quest tracker color-coded** — Slay rows render green
   (`#bce86a`), Clear (zone) rows blue (`#88c8ff`), Boss rows
   red-orange (`#ff8866`). Each row prefixed with `SLAY/CLEAR/BOSS`
   tag. Whole block colored by the highest-priority quest.
10. **Hot-streak HUD chip** — `🔥 ×N   next +M   best ×B` under
    the boss ticker, hidden when streak is 0. `player.bestStreak`
    is now persisted in the save so the personal best survives
    reloads.
11. **Discovery badge** — `★ Biomes N/5` chip in the HUD stack
    tracks `landmarkTiles().length` so it auto-adjusts if more
    landmarks are added.
12. **Gear bar inspector** — click the gear summary chip in the HUD
    to print full equipment details in chat (weapon name + ATK
    bonus, armor name + DEF bonus, per-boss trophy breakdown).
    Border flips from blue to gold once both weapon + armor slots
    are filled.

**Options + cheats:**
13. **Volume cycler** — the old binary mute button is now a 5-step
    cycle `0 / 25 / 50 / 75 / 100 %` (multiplies the BGM base
    volume 0.35). Index persisted to localStorage
    `grasslands_volume_v2` (legacy `_v1` mute bool is ignored).
14. **Hard Mode toggle** — new ⚔ Hard button between Travel and
    Change Class. When ON: `rollMonsterHit` doubles outgoing damage
    and `MonsterController.die()` doubles `earnedExp` + `zenyDrop`.
    Rare-kill 5-level grants are NOT doubled. Persisted in
    `grasslands_hardmode_v1`.
15. **Shop auto-buy footer** — `⚡ Auto-buy cheapest` button inside
    `showShop` picks the cheapest affordable non-potion upgrade and
    purchases it, refreshing the row in place. Repeat-click chains.
16. **Daily login bonus** — on `create()` after the save loads,
    check `grasslands_last_login_v1` against today's ISO date. If
    different (or first ever), grant +500 zeny + chat callout +
    chime.

**Player art (huge milestone):**
17. **All three classes have full 5-direction art** —
    `swordsman_/mage_/archer_{idle,walk}_{south,north,east,
    southeast,northeast}.png` all loaded, in keyOutWhite, and
    compressed via sips (~9–13 MB → ~2.5 MB per class). West / SW /
    NW still mirror east / SE / NE via the existing `DIR_TEXTURE`
    flip map. `pickPlayerTextureKey` auto-uses them; on a missing
    direction it still falls back to the class south sprite (never
    to rookie) per the strict class-only chain shipped earlier.

**Cache + version bumps:** `?v=75` → `?v=88` over this session.

**Commit trail (newest first):**
- `057f646` Archer dirs + daily login
- `0e7f4b5` Hard Mode toggle
- `faf3eb5` Fast-travel
- `567d136` Mage dirs + best-streak
- `a5b8588` Boss respawn toast + gold gear border
- `793668a` Discovery badge + auto-buy
- `76ad1e1` Volume cycler + click gear inspect
- `e883bab` Day/night ambience + dusk/dawn callouts + fireflies
- `66f5bd1` Swordsman dirs + streak HUD + sparkle flash
- `f5aebd8` Boss ticker + color-coded quests
- `51887b7` Road sparkles + biome ambience
- `b9bb4eb` Panic-heal + landmark discovery
- `c5ee2de` Codex session 15 (roads/plazas/mini-map fidelity)

## 4. Next steps for Codex (suggested)

Sonny's first-impression scoring (2026-05-17):

| Axis             | Score | Notes                                             |
|------------------|-------|---------------------------------------------------|
| Visual / art     | 7/10  | Consistent, charming, aura is nice.              |
| **UI / HUD**     | **5/10** | Right panel = stack of debug buttons. Plain font. |
| World            | 6/10  | Grass reads clearly, but flat / empty.           |
| Atmosphere       | 6/10  | Weather + day/night flavor lines punch above weight.|
| Overall          | 6/10  | Solid bones, fixable gaps.                       |

UI/HUD is the biggest lift. Work the polish queue below in order. Each
item is sized to fit ~1 hour and leaves the game stable.

### Polish queue (UI/HUD — push 5→9)

1. **Unify the right-side toolbar.** Today it's nine standalone buttons
   (Map / Music / Auto / Return Home / Travel / Hard / Change Class /
   Shop / HUD) each with a different fill color (gold, blue, brown,
   green). Group into three vertical sections (Navigation / Settings /
   Actions), share one stroke style, and reserve color for state (gold
   = interactive call-to-action, gray = passive toggle, red = warning).
2. **Bottom HUD bar — consolidate.** HP and EXP currently sit in
   separate strips (HP overlaps the chat log, EXP in its own dark band,
   Lv / Zeny floating right). Merge into one cohesive bar that runs the
   full width with consistent backing. Recolor backing to a dark
   olive/green that matches the world, not pure black/brown.
3. **Quest / Gear / Streak / Discovery panels** (top-left) — unify to
   one HUD-card style: same border weight, same opacity, same 10px
   inner padding. Today each uses different markers + borders.
4. **Chat / combat log** — text runs to the edge. Add 10–12px inner
   padding and bump backing opacity from 0.55 → 0.75 so it doesn't
   visually overlap monsters behind it.
5. **Minimap frame.** Wrap with a 4–6px pixel-art border so it feels
   intentional, not overlaid.
6. **Typography pass.** Bump base text from 13–14px to 15–16px on HUD
   labels. Add a 2px text shadow / outline for contrast on grass.

### Polish queue (visuals — push 7→9)

7. **Per-biome tilesets.** `sand_tileset.png` is already preloaded but
   unwired. Replace the tinted-grass desert with the real sand tileset
   first; forest/dungeon variants can follow.
8. **Decoration variety.** Add 2–3 more deco variants per biome
   (broken cart, signpost, campfire, ruins).

### Polish queue (world & atmosphere — push 6→9)

9. **Ambient props at spawn plaza** — campfires, signposts, mailbox.
   Anchor environmental storytelling.
10. **Weather particles.** Petal storm currently shows only a chat
    message. Add a Phaser particle emitter (10–20 sprites drifting
    across screen) tied to the existing weather rotation.
11. **Idle wildlife.** Butterflies / birds spawning + flying randomly
    in low-density zones. Pure visual, no combat.
12. **Ambient SFX.** Footstep tick on cell change, wind loop on outdoor
    biomes, owl hoot at night. Tie to existing volume cycler.

### Gameplay backlog (paused while polish ships)

- **Pet companion** — small sprite (reuse blobling tinted with class
  color) trailing the player by 1 cell. Cosmetic. 5000z one-time buy.
- **Trophy room** — corner of spawn plaza with boss statues + kill counts.
- **Cosmetic equipment slot** — hat/cape, no stats.
- **PvP practice arena** — fenced area with AI class clones.
- **NPC merchant sprite** at spawn (Sonny previously declined — confirm
  before building).

### Known small bugs / nits

- `nearLandmark` / `landmarkTiles` use tile coords; panic-heal landmark
  check converts via `TILE_SIZE / CELL_SIZE = 4`. If that ratio ever
  changes the conversion breaks — block uses
  `Math.floor(TILE_SIZE / CELL_SIZE)` to stay safe.
- Boss respawn toast suppresses on initial spawn only because `ui` is
  undefined at that point. If `create()` order ever changes to build
  `ui` first, the initial 5 boss spawns will toast at once.
- Asset weight still ~34 MB PNGs. `pngquant` could cut another 40–60%.
- Knight PNG substitutes (`knight_idle_east` ← `knight_walk_east`,
  `knight_walk_northeast` ← `knight_idle_northeast`) — replace if exact
  art arrives.
- Wizard sprites (untracked in `assets/sprites/wizard_*.png` × 10) are
  on disk but not yet committed and not yet wired into CLASS_DEFS.

## 5. (legacy) What we did in session 15 (in order)

Goal: improve the map's look and satisfaction without adding controls or
complexity. Cache now at **`?v=76`**.

1. **Road network upgraded.** The map now has:
   - the original center cross road,
   - a loop road around the grasslands core,
   - diagonal feeder paths into far biome corners,
   - small open plazas/landmarks at spawn and in each major biome.
2. **Biome edges improved.** Tiles near biome boundaries now use subtle flower
   / dirt-patch variation so zone transitions feel less like flat tint cuts.
3. **Landmark halos added.** Each plaza gets a soft pulsing ground halo tinted
   to its biome. This gives players visible places to discover without adding
   NPCs, menus, or extra rules.
4. **Movement friction reduced.** After decoration scatter, all roads and
   plazas are re-cleared in the walkable grid so trees/ponds/rocks don't make
   the main routes feel snaggy.
5. **Mini-map road fidelity improved.** Mini-map roads now draw from the same
   tile classification as the world map, including the loop, diagonal paths,
   and landmark rings.
6. **Cache bust bumped** in `project-grasslands/index.html` from `?v=75`
   to `?v=76`.
7. **Verification**:
   - `node -c project-grasslands/game.js` exited 0.
   - Escalated local server on `127.0.0.1:8000` answered `HTTP/1.0 200 OK`.
   - Served `index.html` references `game.js?v=76`.
   - In-app Browser visual check attempted, but the current Browser plugin
     still reports its local trust-path issue; served static verification was
     used instead.

(Session-15 suggestions are all shipped — see §3 above.)

## 6. (legacy) What we did in session 14 (in order)

Goal: make the game more satisfying, simpler to read, less annoying, and more
automatic without adding NPCs or extra controls. Cache now at **`?v=75`**.

1. **Normal-player UI decluttered.** The visible +1/+10/-1 level debug
   buttons are now hidden unless `?debug=1` or
   `localStorage.grasslands_debug_v1 = "1"` is set. The shop moves up into
   that space, so the right-side UI is shorter and less noisy.
2. **Zone-clear quests added.** At Lv 4+, one quest slot can roll
   `clear 8 in [zone]` for grasslands/riverside/desert/ruins. Autopilot now
   understands zone quests and prefers safe monsters inside the active quest
   zone.
3. **Automatic boss trophy milestones added.** Total boss trophies at 3/10/25
   grant permanent bonuses automatically:
   - 3 trophies: `Boss Hunter` (+2 ATK)
   - 10 trophies: `Boss Breaker` (+2 DEF)
   - 25 trophies: `MVP Soul` (+30 Max HP)
   Milestone claims persist in save data.
4. **Equipment visibility upgraded.** The gear HUD now shows weapon/armor
   stat bonuses and the next trophy milestone target, not just item names.
5. **Boss zone stingers added.** On zone entry, the game tells the player
   whether that zone's boss is roaming or when it will return.
6. **Boss balance pass.** New biome bosses are a bit less cheap and more
   rewarding:
   - King Blobling spawns farther from the player, hits softer, and pays more.
   - Boss MooHam, Ruin Golem, and River Warden pay more EXP.
   - Ruin Golem / River Warden ATK reduced slightly.
   - Bigfoot's high-danger identity was left intact.
7. **Cache bust bumped** in `project-grasslands/index.html` from `?v=74`
   to `?v=75`.
8. **Verification so far**:
   - `node -c project-grasslands/game.js` exited 0.
   - Escalated local server on `127.0.0.1:8000` answered `HTTP/1.0 200 OK`.
   - Served `index.html` references `game.js?v=75`.

## 6. Previous suggestions

NPC merchant remains skipped per user request.

Recommended next batch:

1. **Auto-safety polish** — add a simple panic-heal behavior when HP is very
   low and the player has enough zeny, with a cooldown so it feels helpful
   rather than invincible.
2. **Reward chest moments** — every 10th normal kill drops a small bonus coin
   burst so streaks feel tactile even before the banner.
3. **Quest UI clarity pass** — add tiny color accents for Slay / Clear / Boss
   objectives so players understand goals at a glance.
4. **Boss trophy collection panel** — compact list of each boss trophy count,
   opened from the existing gear HUD or shop, no NPC needed.
5. **Biome identity polish** — more unique boss stinger colors and minimap
   boss markers per zone.

## 7. (legacy) What we did in session 13 (in order)

Goal: make players feel visible progress and have one-more-run goals without
adding NPCs or broad new systems. Cache now at **`?v=74`**.

1. **Boss respawns lengthened** from 5 seconds to `BOSS_RESPAWN_MS = 60000`
   while normal monsters still use the 5-second `RESPAWN_MS`. This makes
   boss kills feel less disposable and gives the respawn timer a reason to
   exist.
2. **Boss-hunt quests** added to the 2-slot quest system. At Lv 10+, one
   quest slot can roll a `hunt 1 [Boss]` objective from King Blobling,
   Boss MooHam, Ruin Golem, or River Warden. Boss quests pay larger zeny
   rewards and are labelled `Boss:` in the quest tracker.
3. **Gear/trophy HUD line** added under the quest tracker. It shows current
   weapon, armor, and total boss trophies so boss drops are no longer hidden
   in chat only.
4. **Boss trophy counter** added. Every boss kill records
   `player.bossTrophies[typeId] += 1`, floats `Trophy +1`, persists in save,
   and feeds the new HUD total.
5. **Cache bust bumped** in `project-grasslands/index.html` from `?v=73`
   to `?v=74`.
6. **Verification**:
   - `node -c project-grasslands/game.js` exited 0.
   - Escalated local server on `127.0.0.1:8000` answered `HTTP/1.0 200 OK`.
   - Served `index.html` references `game.js?v=74`.

## 8. Previous suggestions

NPC merchant remains skipped per user request.

Recommended next batch:

1. **Boss balance pass** — tune the 5 bosses now that respawns are longer.
   Check early deaths, zeny/EXP pace, and whether gear rewards feel worth it.
2. **Equipment visibility upgrade** — add a compact character panel or shop
   panel section with weapon/armor stat bonuses and boss trophy counts by boss.
3. **Quest variety v2** — add zone quests ("Clear 6 riverside monsters") and
   mixed quests ("Slay 3 Cactlings + hunt Boss MooHam").
4. **Boss intro stingers** — when entering a boss zone, show a short hint
   if that boss is alive, or the respawn timer if defeated.
5. **Long-term collection goals** — trophy milestones at 3/10/25 boss kills
   grant titles or small stat bonuses.

## 9. (legacy) What we did in session 12 (in order)

User said to do all non-NPC suggestions. Cache now at **`?v=73`**.

1. **Boss respawn timer broadcast** added. When a boss-tier monster dies,
   `bossRespawns[typeId]` records the next spawn time. UI shows a top
   message like `Bigfoot respawns in 0:05` when no nearby boss HP bar is
   active.
2. **Boss danger telegraph** added. Boss-tier monsters show a red ground
   warning ring and delay their swing by ~450 ms. If the player leaves
   melee range during the windup, the hit whiffs by positioning.
3. **Multiple simultaneous quests** shipped. `activeQuest` migrated to
   `activeQuests` (2 slots), with save compatibility for old single-quest
   saves. Quest UI now lists both active objectives, and autopilot treats
   either quest target as preferred.
4. **Quest completion chain bonus** added. Every 3 completed quests grants
   bonus zeny plus a `QUEST STREAK xN!` float/banner.
5. **Equipment-lite boss drops** added. Boss drops auto-equip if stronger:
   - King Blobling → `Gelatin Buckler` (+4 DEF)
   - Boss MooHam → `Ham Hammer` (+5 ATK)
   - Ruin Golem → `Ruin Plate` (+8 DEF)
   - River Warden → `Reed Spear` (+8 ATK)
   - Bigfoot → `Fur Guard` (+10 DEF)
   Equipment persists in save and replaces weaker gear by subtracting the
   old bonus and applying the new one.
6. **Biome boss roster** added using existing art/tints, no new assets:
   - `king_blobling` in grasslands (pink Blobling boss)
   - `ruin_golem` in ruins (grey MooHam reuse)
   - `river_warden` in riverside (blue MooWaan reuse)
   Desert already has Boss MooHam and forest already has Bigfoot.
7. **Boss classification helper** `isBossCfg(cfg)` now drives boss EXP
   scaling exemption, autopilot avoidance, boss HP bar, kill banner,
   heal multiplier, minimap outline, respawn timer, and telegraph behavior.
8. **Cache bust bumped** in `project-grasslands/index.html` from `?v=72`
   to `?v=73`.
9. **Verification**:
   - `node -c project-grasslands/game.js` exited 0.
   - Escalated local server on `127.0.0.1:8000` answered `HTTP/1.0 200 OK`.
   - Served `index.html` references `game.js?v=73`.

## 10. Previous suggestions

NPC merchant is intentionally skipped per user request.

Recommended next batch:

1. **Boss balance pass** — with 5 bosses now live, tune HP/ATK/EXP/gear
   rewards after a short play loop. Highest value before adding more systems.
2. **Quest target variety** — add boss-slay or zone-specific quest variants
   now that `activeQuests[]` exists.
3. **Equipment HUD line** — show current weapon/armor in a small character
   readout or shop panel so boss drops feel less hidden.
4. **Biome identity polish** — unique recolored minimap icons/banners for
   each boss and zone.
5. **Boss respawn longer cadence** — if 5 seconds feels too arcade, move
   bosses to 60-180 seconds and keep normal mobs at 5 seconds.

## 11. (legacy) What we did in session 11 (in order)

Followed the suggested next ROI order. Cache now at **`?v=72`**.

1. **Special-ready light bloom** added around the player when the
   automatic class special is charged. It reuses the existing ring timing,
   adds a subtle additive gold glow under the player, follows position/depth,
   pulses while ready, and hides on special use or death.
2. **Hot-streak kill counter** added:
   - `player.hotStreak` increments on every kill and resets on player death.
   - Every 5th kill grants bonus zeny, floats `HOT STREAK xN! +Nz`
     above the player, and shows a center banner.
   - Every 10th kill uses a larger banner and level-up chime.
   - `hotStreak` persists in the save alongside lifetime `kills`.
3. **Cache bust bumped** in `project-grasslands/index.html` from `?v=71`
   to `?v=72`.
4. **Verification**:
   - `node -c project-grasslands/game.js` exited 0.
   - Escalated local server on `127.0.0.1:8000` answered `HTTP/1.0 200 OK`.
   - Served `index.html` references `game.js?v=72`.

## 12. Previous suggestions

Recommended next batch:

1. **NPC merchant at spawn** — best next "big leap" because shop already
   exists. A visible merchant makes the spawn feel like a town hub and
   gives the shop a world object instead of only a UI button.
2. **Boss respawn timer broadcast** — strong RO-feel, medium risk because
   respawn scheduling already exists but needs global timer UI state.
3. **Multiple simultaneous quests** — more agency, but touches quest save
   shape, quest UI, and autopilot target scoring.
4. **Equipment drops** — biggest gameplay upside, but touches saves,
   loot, UI, balance, and shop design. Do after merchant or boss timer.
5. **Mini-boss per biome** — strong content expansion, but needs either
   new art or careful recolor/reuse choices to avoid feeling cheap.

## 13. (legacy) What we did in session 10 (in order)

Follow-up from the user's ranked ROI list. Cache now at **`?v=71`**.

1. **Damage variance colors**: non-crit damage now reflects roll quality.
   Low rolls (`variance <= 0.88`) float white, high rolls
   (`variance >= 1.12`) float orange, normal rolls stay red, crits
   stay yellow and large.
2. **EXP scaling vs player level**: normal monsters now award scaled EXP
   when the player outlevels their rolled monster level. Formula:
   `max(0.3, 0.7 ** levelsOver)` so low-tier mobs retain a 30% floor.
   Boss-tier / aggressive monsters and rare level-award kills are not
   scaled down.
3. **Always-visible mini HP bar** added directly under the mini-map.
   This keeps player HP visible without looking down at the bottom HUD or
   waiting for the above-sprite wounded bar.
4. **Hover tooltips** added to the right-side UI buttons:
   music, autopilot, return home, change class, +1, +10, -1, and shop.
   Uses one shared tooltip text/box so UI stays light.
5. **Cache bust bumped** in `project-grasslands/index.html` from `?v=70`
   to `?v=71`.
6. **Verification**:
   - `node -c project-grasslands/game.js` exited 0.
   - Escalated local server on `127.0.0.1:8000` answered `HTTP/1.0 200 OK`.
   - Served `index.html` references `game.js?v=71`.

## 14. Previous suggestions

Recommended next batch:

1. **Light bloom around special-ready player** — the ring already tells
   the truth; a subtle glow will make the power spike feel better without
   changing rules.
2. **Hot-streak kill counter** — simple x5/x10 kill cadence with bonus
   zeny and a center `HOT STREAK!` popup. High feedback, low risk.
3. **NPC merchant at spawn** — best next "big leap" because shop already
   exists. A visible merchant gives the world a town anchor without needing
   inventory/equipment yet.
4. **Boss respawn timer broadcast** — strong RO-feel, medium risk because
   respawn scheduling already exists but needs UI state.
5. **Equipment drops** — biggest gameplay upside, but touches saves,
   loot, UI, balance, and shop design. Do after merchant or streak.

## 11. (legacy) What we did in session 9 (in order)

Quick follow-up to the session 8 RO-polish batch. Cache now at **`?v=70`**.

1. **Footstep dust particles** added in `PlayerController._beginNextStep()`.
   Each cell-step now emits a small fading ground puff at the step origin.
   Dust color is zone-aware: desert / ruins use brown (`0x886644`), all
   other zones use soft green (`0xa8d088`).
2. **Monster-death particles** added in `MonsterController.die()`.
   Death now emits a 10-dot radial burst tinted from `cfg.tint` or
   `cfg.nameColor`, so rare monsters and themed enemies pop more clearly.
3. **Comma float text audit pass**:
   - Quest completion now floats `+N z` above the player with `fmt(...)`.
   - Kill-heal float now says `+N HP` with `fmt(...)`.
   - Monster EXP float now uses `fmt(...)` for large values.
4. **Cache bust bumped** in `project-grasslands/index.html` from `?v=69`
   to `?v=70`.
5. **Verification**:
   - `node -c project-grasslands/game.js` exited 0.
   - Local preview server required escalated permission because sandbox bind
     hit `PermissionError: [Errno 1] Operation not permitted`.
   - Escalated local server on `127.0.0.1:8000` answered `HTTP/1.0 200 OK`,
     and served `index.html` references `game.js?v=70`.
   - In-app Browser plugin was attempted for visual verification but rejected
     the bundled `browser-client` path as untrusted, so no screenshot was
     captured in this session.

## 12. Next steps (remaining older list)

The user invited Codex to continue this batch. Quick wins #1, #2, and #5
from the previous list are now done.

**Quick polish (5–15 min each):**
1. **Hover tooltips** on the UI buttons (mute / auto / return /
   shop / class / cheats). Phaser tooltips = a Text the button
   shows on `pointerover` and hides on `pointerout`.
2. **EXP scaling vs player level** — at higher levels low-tier
   monsters give pennies. Try `effectiveExp = expReward *
   max(0.3, 1 - 0.05 * max(0, playerLevel - monsterTypicalLevel))`
   inside the `gainExp` call in `MonsterController.die()`.
3. **Per-class attack visual for `attack`/`dead` poses** — once
   per-class attack/dead sprites exist, `pickPlayerTextureKey`
   already tries the class key first.

**Gameplay (15–30 min):**
4. **Multiple simultaneous quests** — convert `activeQuest`
   global to `activeQuests: Quest[]`. UI lists each.
5. **Hot-streak kill counter** — every Nth kill in a row grants
   bonus zeny (`HOT STREAK x5! +120z`).
6. **Sell loot back at the shop** — herb stacks → zeny.
7. **Mini-boss per biome** — currently only forest has Bigfoot.
   Add a unique boss to desert/ruins/riverside (sand-mooham,
   rock golem, water blob). Same wiring as Bigfoot.

**Bigger features (1–2 hours):**
8. **NPC merchant** sprite at spawn cell. Clicking it (within
   range) opens the shop. Visual town-feel.
9. **Equipment drops** — Boss MooHam drops a weapon (+5 ATK),
   Bigfoot drops armor (+10 DEF), etc. Slot system in
   `player.equipment = { weapon, armor }`.
10. **Boss respawn timer broadcast** at top of screen
    ("Bigfoot in 2:30").
11. **Multi-stage first-time tutorial** with arrows pointing at
    UI elements.

**Asset / art TODOs (when Codex generates more art):**
12. Per-class **walk2/3/4 south frames** + non-south directions
    (north / east / southeast / northeast) for each of swordsman /
    mage / archer.
13. Per-class **attack** and **dead** sprites.
14. Real **forest tileset** + **ruins tileset** + **riverside
    tileset** to replace the tinted-grass placeholders. Wire same
    as `sand_tileset` (preload, branch in `buildMap`, skip the tint
    pass for that zone).
15. Hand-slice `desert_props.png` (skull / bones / signpost). Sheet
    is 512 × 512 with 7 irregular props. Needs manual frame coords
    per prop, then a placement pass in the desert decoration block.

## 13. (legacy) What we did in session 8 (in order)

Big push focused on user feedback + RO-feel polish. Cache now at
**`?v=69`**.

1. **Tier-1 class sprites wired** (`swordsman/mage/archer
   _{idle,walk}_south.png`). New helper `pickPlayerTextureKey`
   resolves the best texture per (class, dir, frame) with a strict
   class-first chain — once a class is chosen, missing directions
   fall back to the **class south sprite**, never to rookie art.
   Final rookie fallback only if class has zero art (shouldn't
   happen). Hardcoded `rookie_attack` / `rookie_dead` `setTexture`
   calls replaced with `applyRookieTexture(..., 'attack'|'dead')`.
   `selectClass` immediately re-applies texture so the swap is
   instant. Class card art (`*_card.png`) preloaded + rendered on
   the chooser.
2. **Class chooser overhauled**:
   - Card hit areas fixed (Phaser bug: default hit area ignores
     origin → centered objects were unclickable). Now uses explicit
     `Phaser.Geom.Rectangle.Contains` with `(-w/2, -h/2, w, h)`.
   - Container.setScrollFactor(0) does NOT propagate to children for
     input — each card + close X now calls `setScrollFactor(0)`
     individually so hit-test maps to screen coords correctly.
   - Closable via ✕ button or by Change-Class re-pick. classTier is
     recomputed from level on swap; per-level stats never re-grant.
   - Cards now show a yellow one-line role hint
     (`Melee tank — big slash, +HP` etc).
3. **Always-visible ✦ Change Class button** in the right UI stack.
   Clicking it below Lv 10 prints a "Reach Lv.10" chat hint;
   otherwise opens the chooser. Auto-pop at Lv 10 stays as a nudge.
4. **Cheat row** under Change Class: ⇧ +1 Level, ⇧ +10 Levels,
   ⇩ -1 Level. +N uses the real `levelUp()` so tier upgrades + class
   prompt fire normally. -1 reverses the per-level stat grant
   (20 HP / 3 ATK / 1 DEF) but leaves any tier bonuses applied.
5. **Rare monsters added**: `rare_mooham` (Golden, grasslands/ruins)
   and `rare_moowaan` (Emerald, forest/riverside). 1 % chance every
   regular `mooham` / `moowaan` spawn re-rolls into the rare via
   `RARE_VARIANTS`. Rare entries have `count: 0` so they never
   spawn directly. Persistent pulsing aura ring on spawn + screen
   flash + center banner + chime. On kill: grants enough exp for
   `cfg.levelsAward` (5) levels + full heal + giant `★ +5 LEVELS!
   ★` banner.
6. **Zeny shop** (⚒ Shop button, opens 4-row overlay):
   `+20 Max HP / +5 ATK / +1 DEF` each scale price 1.5× per buy;
   `Full Heal` flat 50z. `player.shopBought` saved to localStorage.
   Same overlay pattern as class chooser (explicit hit areas +
   scrollFactor 0).
7. **Quest stub**: one active quest, "Slay 10 [random non-boss
   monster]" rewarding `expReward × 10 × 1.5` zeny. Counter ticks
   in `MonsterController.die()`. Top-left badge in UI shows
   `Quest: N/10 [Name]`. On complete: reward + chime + auto-roll a
   new quest. Persists in `activeQuest` save field.
8. **Autopilot** ON-toggle now resets `autopilotLastScan = 0` so
   the first scan fires immediately. Scoring overhauled: each
   candidate gets `score = distance - 120 × safeNeighbors400px -
   (isQuestTarget ? 800 : 0)`. Effect: autopilot heads to dense
   clusters and prefers the current quest mob.
9. **Death animation**: sprite fades to 25 % alpha, center
   `YOU DIED` red text + `Respawning in N…` countdown, then full
   alpha restored on respawn.
10. **Zone banner difficulty tag** below the name: Grasslands /
    Riverside = green Easy, Desert / Ruins = yellow Medium, Forest
    = red DANGER. `showZoneBanner(scene, label, zoneKey)`.
11. **Boss kill announce** — center `[Name] slain!` banner + chime
    when any aggressive / `expReward >= 90` monster dies.
12. **Loot magnet → float popups** — `+N HP` (green) or `+Nz`
    (gold) floats above player on pickup, replacing the chat-only
    log. Magnet itself shipped in session 7 (320 px radius,
    700 px/s pull) along with the autopilot toggle.
13. **Currency formatter** `fmt(n)` — every zeny display now uses
    `1,234` thousands separators.
14. **Bug fixes from feedback round**:
    - Tutorial chat lines only print on first session (no save),
      stopping 3× spam on reload.
    - Monster click hitbox 50 → 80 px; hover hitbox 40 → 70 px.
    - Phaser `scale: { mode: FIT, autoCenter: CENTER_BOTH }` so the
      canvas centers in the viewport.
    - Scene `pointerdown` early-returns when `classSelectOpen` or
      `shopOpen`, and `scene.input.hitTestPointer(pointer)` is used
      to skip world-clicks that landed on a UI button.
    - Pond `blockRadius` 3 → 6/7 so A* routes around the full
      visual footprint.
    - Bigfoot `minSpawnDistance: 2400` keeps the forest boss far
      from spawn.
    - Monster `_setTex(key)` helper recomputes scale per texture so
      Bigfoot no longer shrinks when swapping chase / attack sprites
      (idle is 1254 px, others 512 px after sips downscale).
    - Mute preference + autopilot toggle persist in localStorage
      (`grasslands_mute_v1`, `grasslands_autopilot_v1`).
    - Tier 2 / 3 / 4 class upgrades grant +50/+15, +100/+30,
      +200/+60 HP/ATK on hitting Lv 30 / 60 / 100. Tier 4 floats
      `LEGENDARY CLASS!` above the player.

## 14. (legacy) What we did in session 7 (in order)

1. **Class selection system added.** New `CLASS_DEFS` table for
   `swordsman` / `mage` / `archer`, each with a 4-tier name ladder, tint
   color, name color, and future per-class sprite prefix. Tier
   thresholds (`CLASS_TIER_THRESHOLDS`): tier 1 at Lv 10 (choose),
   tier 2 at Lv 30 (+50 HP / +15 ATK), tier 3 at Lv 60 (+100 HP /
   +30 ATK), tier 4 at Lv 100 (+200 HP / +60 ATK + "LEGENDARY CLASS!"
   on-screen text).
2. `showClassSelect(scene)` opens a depth-20000 overlay at Lv 10 with
   a gold glowing "CHOOSE YOUR PATH" title and three centered cards
   (220×320 each, hover lift, flavor text). Cards use a colored
   placeholder until real `*_card.png` images ship. Click → flash,
   tint, save, `ui.message('You became a [class]!')`. Cannot close
   without picking.
3. `checkClassTierUpgrade(player)` runs after every level-up and
   applies any tier whose threshold the player just crossed.
4. **Save format additions:** `classId` (string|null), `classTier`
   (0..4). `applySave()` reapplies tint + refreshes name tag color.
5. **`_refreshNameTag` now uses class tier title** instead of "Rookie"
   once a class is chosen, and tints the floating name with the
   class's `nameColor`.
6. **Sprite art:** real per-class sprites not yet generated. We still
   draw rookie textures and apply the class tint via `sprite.setTint`.
   When real art arrives, `applyRookieTexture` will need a class-aware
   prefix lookup (the `spritePrefix` field is already there).
7. **Loot auto-collect magnet + autopilot toggle** shipped earlier in
   the session — see commits `f6e595b` and the mute/heal commits.
8. **Class card art wired** — `swordsman_card.png` / `mage_card.png` /
   `archer_card.png` preloaded; `showClassSelect` was already gated on
   `scene.textures.exists` so cards rendered the moment they shipped.
9. **Class-flavored attack visuals** (`spawnClassAttackFx`): swordsman
   white slash arc, mage blue fireball + burst, archer yellow arrow
   streak. Procs every player hit; falls back to a generic impact when
   no class is chosen yet.
10. **Auto-skill every 10s** (`SPECIAL_COOLDOWN_MS`). While charged a
    pulsing gold ring sits under the player. Next attack consumes it:
    2x damage + upgraded visual ("BASH!" / "METEOR!" / "TRIPLE SHOT!").
    No hotkey — fully automatic per the simple+automatic direction.
11. **Boss HP bar** at top of screen — shows whenever any aggressive or
    boss-tier monster (`expReward >= 90`) is within 1200 px. Tracks the
    nearest. Hides automatically when out of range or dead.
12. **Zone-entry banner** — fades in/out when crossing a biome
    boundary ("Entering Sun-bleached Desert" etc).
13. **Return Home button** under the autopilot toggle — instant warp
    back to spawn, clears path/target.
14. Cache bumped to **`?v=52`**.

## 15. (legacy) What we did in session 6 (in order)

1. **Wired real desert art** — `sand_tileset.png` loaded + sliced
   identically to grass tileset; `buildMap` picks `sand_tileset` for
   desert zone and skips the tint pass for it.
2. **Cactling replaces tinted Dune Blob.** New `cactling` entry in
   `MONSTER_TYPES` with dedicated `cactling_idle/hit/dead` textures,
   no runtime tint. Mini-map marker recoloured.
3. **Desert decoration overhaul** — added cactus + sand-dune scatter
   passes, kept rocks (lighter density), `cactus_set.png` and
   `deco_sand_dune.png` placed via the existing `place()` helper.
4. **Per-tileset inset map** (`TILESET_INSET_PCT`) — grass keeps the
   4 % crop for its baked white separator; sand uses 0 % since its
   edges are flush, killing the faint grid seams the inset exposed.
5. **Bigfoot relocated to far forest edge.** New `cfg.minSpawnDistance`
   knob (defaults to 300, Bigfoot uses 2400) so new players don't get
   one-shot when they first cross north into the trees.
6. **Cache bumped to `?v=45`.**
7. `desert_props.png` (skull/bones/skeleton/rocks/signpost on a single
   512×512 sheet) is **still untracked-wired** — layout is irregular,
   needs hand-tuned per-prop frame coords. Noted in §4.

## 16. (legacy) What we did in session 5 (in order)

1. **World doubled** to 6400×6400 (200×200 cells, 50×50 tiles). A* iter
   cap 8 000 → 32 000.
2. **5-zone biome system** added via `getZone(r, c)` — central grasslands
   core, outer ring partitioned by compass direction into forest (N),
   desert (S), ruins (W), riverside (E).
3. **Per-zone tile tinting**: `ZONE_TINTS` map applied via `setTint` in
   `buildMap` so existing grass tileset visually differentiates biomes.
4. **Per-zone decoration scatter**: `buildDecorations` accepts a
   `zoneFilter` opts param and runs separate placement passes per biome
   (trees-heavy forest, rocky desert + ruins, ponds + flowers riverside).
   The `deco_rock_01..03` PNGs now actually get placed.
5. **Dune Blob monster** added — recoloured Blobling sprite via
   `tint: 0xe8c878` on the MonsterController, desert-only.
6. **Bigfoot forest boss** added (Codex change, committed in same wave):
   fixed lv 50, 900 HP, 220 ATK, aggressive aggro, one-shots players
   below lv 50, uses extra textures (`aggro/chase/attack`).
7. **Mini-map zone backdrop** — 16×16 sample grid colours every cell by
   `getZone()`, plus Bigfoot gets a black-outlined red marker so the
   boss is visible from anywhere on the map.
8. **Save key bumped to v2** so 100×100-coord saves don't land players in
   the wrong zone in the 200×200 world.
9. **Asset compression via `sips --resampleHeightWidthMax`** — every PNG
   downscaled (tilesets cap 768, sprites + decorations cap 512). Total
   assets dropped from **~96 MB → ~34 MB** (≈65 % cut). Lossless visual
   quality at current display sizes (96–240 px). pngquant not used —
   `brew install` blocked, sips was sufficient.
10. **New desert art generated but not yet wired:** `sand_tileset.png`,
    `desert_props.png`, `cactus_set.png`, `deco_sand_dune.png`,
    `cactling_idle.png`/`hit`/`dead`. Compressed but still untracked.
    See §4 #1.
11. Cache buster bumped to **`?v=43`** (`v=42` shipped the zone system,
    `v=43` ships the compressed assets).
12. **`.claude/launch.json` switched** to `/opt/homebrew/bin/python3.13`
    because the bundled Python 3.9 hits `PermissionError: getcwd()` in
    the sandbox. Absolute path to project dir baked into args.

---

## 17. Known issues / quirks

- **Asset weight** — now **~34 MB** of PNGs (down from 96 MB after
  sips downscale in session 5). Acceptable on broadband; mobile / slow
  links still see a multi-second load. Vercel caches assets `immutable`
  so repeat visitors are instant. Loading bar shows progress.
  `pngquant` would cut another 40–60 % when the user installs it.
- **Tinted-tile biomes look muddy.** Multiplying `0xe8c878` over the
  saturated green tileset gives olive, not sand. The right fix is real
  per-biome tilesets — `sand_tileset.png` is already on disk waiting to
  be wired (§4 #1).
- **Bigfoot one-shots low-level players.** Forest is the closest biome
  to spawn (player walks N from grasslands core). Until levelling
  catches players up to 50, the forest is effectively a death zone.
  Consider either (a) gating Bigfoot spawn behind a kill-count flag, or
  (b) moving Bigfoot to the far edge of the forest.
- `keyOutWhite()` strips any near-white pixel — will damage future art
  with intentional whites. Prefer art with real alpha and remove the hack
  one day.
- Tile seams: mitigated by 4 % inset crop + 2 px overdraw. Still faintly
  visible at some camera positions.
- No world collisions beyond `setCollideWorldBounds` for monsters. Player
  uses cell-based A* and respects the `walkable` grid.
- A* recomputes every repath; fine at 100×100 with the iteration cap.
- Mini-map redraws every frame.
- Phaser banner spams the console on every reload. Cosmetic.
- `?v=N` cache-bust lives in `index.html`. Bump on every `game.js`
  change. Current: **`?v=124`**. Next change should use `?v=125`.
- `.vercel/` is gitignored. `node_modules/`, `*.log`, `.claude/`, and
  `.DS_Store` are also ignored.

---

## 18. File structure

```
Grasslands Online/                                  ← git repo root
├── .github/workflows/
│   ├── ci.yml                  ← node -c + smoke fetch on push
│   └── vercel-deploy.yml       ← manual deploy fallback (needs secrets)
├── .gitignore                  ← .DS_Store, .claude/, .vercel/, node_modules, *.log
├── DEPLOY.md                   ← prod URL + Vercel setup
├── HANDOFF.md                  ← this file
├── vercel.json                 ← outputDirectory + cache headers
└── project-grasslands/         ← the static web app (Vercel root)
    ├── CLAUDE.md               ← per-project coding rules
    ├── index.html              ← Phaser CDN + game.js?v=N + loader overlay
    ├── game.js                 ← entire game (~1700 lines)
    └── assets/
        ├── audio/
        │   └── bgm.mp3         ← background music (4 MB, loops)
        ├── decorations/        ← scatter PNGs (flowers, grass, mushrooms,
        │                          bushes, trees, pond; rocks loaded but
        │                          not placed)
        ├── sprites/            ← Rookie (8-dir + idle/walk/walk2/walk3/
        │                          walk4 + attack + dead) + monsters
        │                          (blobling/mooham/moowaan idle/hit/dead)
        └── tiles/grass_tileset.png
```

### `game.js` map (~1 700 lines)

- Constants block (world, cell, movement, regen, combat, save).
- `MONSTER_TYPES` config table.
- Globals: `player`, `bloblings` (all monsters), `loots`, `walkable`,
  `clickMarker`, `targetRing`, `dayNightOverlay`, `lastSaveAt`.
- `config + new Phaser.Game(config)` — arcade physics on.
- `preload()` — every PNG, BGM audio, loader-overlay progress hooks.
- `create()` — alpha-key, tileset slicing, map + walkable + decorations,
  target ring, monster spawn loop, click marker, day/night overlay,
  pointer + Tab + Shift+R input, UI, save apply, BGM start.
- `update(time, delta)` — player tick, monster ticks, loot pickup,
  target ring draw, day/night alpha update, auto-save, y-sort.
- `applyRookieTexture(sprite, dir, frame)` + `DIR_TEXTURE` map for the
  8-direction × {idle, walk, walk2, walk3, walk4} sprite picker.
- A*: `findPath / heuristic / findAdjacentReachableCell`.
- `PlayerController`: tile-grid walking, attack target pursuit, level-up,
  death. Hosts `_pickWalkFrame(t)` with the 2/4-frame auto-detect.
- `MonsterController`: passive AI (only chase when provoked), random
  level, takeDamage, die with loot drop, scheduled respawn.
- `LootDrop` (zeny or heal kind).
- `attemptPlayerAttack / rollMonsterHit` damage math.
- `spawnFloatText / spawnDamageNumber` floating combat text.
- `buildMap / buildDecorations / getCellType` map gen + scatter +
  cell blocking.
- WebAudio: `_tone / _noise + sfxHit / sfxCrit / sfxMiss / sfxLevelUp /
  sfxPickup / sfxPlayerHit / sfxDeath / sfxFootstep`.
- Persistence: `saveGame / loadGameSave / applySave`.
- `UIManager`: HP / EXP / Lv / Zeny + chat box + mini-map.

---

## 19. Assets

### Sprites — `project-grasslands/assets/sprites/`

| File pattern | Files | Role |
|---|---|---|
| `rookie_idle_{south,north,east,southeast,northeast}.png` | 5 | Player idle, 8-dir base |
| `rookie_walk{,2,3,4}_<dir>.png` | 5 × 4 = 20 | 4-frame walk cycle, 8-dir via flip |
| `rookie_attack.png` | 1 | 250 ms swing flash |
| `rookie_dead.png` | 1 | Death pose |
| `blobling_{idle,hit,dead}.png` | 3 | Pink slime, also retinted for Dune Blob |
| `mooham_{idle,hit,dead}.png` | 3 | Pig, also reused for Boss MooHam |
| `moowaan_{idle,hit,dead}.png` | 3 | Green-ish, forest/riverside |
| `bigfoot_{idle,aggro,chase,attack,hit,dead}.png` | 6 | Forest boss, lv 50 |
| `cactling_{idle,hit,dead}.png` | 3 | **Untracked, not yet wired.** Replacement for tinted Dune Blob in desert. |

### Decorations — `project-grasslands/assets/decorations/`

| File pattern | Files | Role |
|---|---|---|
| `deco_flower_cluster_01..04.png` | 4 | Random scatter on grass |
| `deco_tallgrass_01..03.png` | 3 | Random scatter on grass |
| `deco_rock_01..03.png` | 3 | Now placed in desert + ruins zones |
| `cactus_set.png` | 1 | **Untracked, not yet wired.** Multi-cactus PNG for desert. |
| `deco_sand_dune.png` | 1 | **Untracked, not yet wired.** Sandy mound deco. |
| `desert_props.png` | 1 | **Untracked, not yet wired.** Multi-prop sheet (rocks/bones/signpost) — needs slicing like the tileset. |
| `mushroom_red_01.png`, `mushroom_brown_02.png` | 2 | Decoration only |
| `bush_01.png`, `bush_02.png` | 2 | Block radius 1 |
| `tree_oak_01.png`, `tree_pine_02.png`, `tree_round_03.png` | 3 | Block radius 2 |
| `pond_01.png` | 1 | Block radius 3 |

### Tiles — `project-grasslands/assets/tiles/`

- `grass_tileset.png` — 4×4 grid (16 tiles), sliced with a 4 % inset
  crop, drawn `TILE_SIZE + 2` to hide subpixel seams. Downscaled to
  768 px longest side in session 5.
- `sand_tileset.png` — **Untracked, not yet wired.** Companion to
  `grass_tileset.png`; same 4×4 layout but desert palette. Wire as a
  second key in `preload()` and branch in `buildMap()` per zone.

### Audio — `project-grasslands/assets/audio/`

- `bgm.mp3` 4 MB — loop background music (volume 0.35).
- Folder also contains `.gitkeep` for cases where the mp3 is removed.

### ChatGPT prompts

Always include `transparent background PNG with alpha channel`. The
`keyOutWhite()` runtime hack is a fallback for art without real alpha.

---

## 20. GitHub + Vercel workflow (enforced)

- Commit **after every meaningful change**.
- Conventional prefixes only: `feat:`, `fix:`, `refactor:`, `tweak:`,
  `docs:`, `chore:`, `asset:`.
- Subject ≤ 72 chars, present tense, no trailing period.
- Bump `?v=N` in `index.html` whenever `game.js` changes. Current `?v=124`.
- Run `node -c project-grasslands/game.js` before pushing.
- Never end a session with uncommitted changes. Final action: clean
  `git status`, HANDOFF.md refreshed, both pushed.
- Vercel re-deploys automatically on `main`.

---

## 21. How to continue (do this first in a new session)

1. **Read this file in full.** No skimming.
2. From repo root run `git status` and `git log --oneline -10` to confirm
   tree clean and see recent work.
3. Boot preview:
   - `cd project-grasslands && python3 -m http.server 8000`, **or**
   - `mcp__Claude_Preview__preview_start` name `grasslands` (port 8001).
4. Visit the preview, walk around, kill a Blobling, check HP regen,
   confirm the loader overlay appears + hides cleanly. Confirm music
   plays after the first click. Test by visiting prod
   https://grasslands-online.vercel.app.
5. Pick a task from §4 or whatever the user asks.
6. **Per change:** edit → bump `?v=N` → `node -c` parse → reload →
   conventional commit → push. Vercel re-deploys automatically.
7. **End of session:** update §3, §4, §5, §7 in this file. Commit
   `HANDOFF.md`, push. Then stop.

---

## 22. Constraints (do NOT re-add)

The user has explicitly cut these features. Re-adding them is regressive:

- WASD / arrow-key movement.
- Skill hotkeys (Power Strike, Self-Heal).
- SP stat + SP bar.
- HealerNPC (the blue `+` circle near spawn).
- Camera shake on hit.
- Toggleable stat panel overlay (`C` key).

Combat is intentionally **fully automatic** after a single click on a
monster.
