# HANDOFF.md — Grasslands Online

> **READ TOP-TO-BOTTOM BEFORE TOUCHING CODE.** Single source of truth between
> coding sessions. Last refresh: 2026-05-17 1:05am CDT (post session 6).

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
- Bottom bar: red HP bar (left), purple EXP bar (centre), Lv + Zeny (right).
- Chat box, bottom-left, last 10 messages.
- Mini-map, top-right, 160×160 px: white = player, red = Blobling,
  orange = MooHam, green = MooWaan, large yellow = Boss MooHam,
  small yellow = loot. Faint dirt path drawn under markers.
- Floating damage numbers: white (to player), red (to enemy), yellow
  bigger+`!` (crit), grey (`MISS`).
- Player HP bar above sprite, hidden at full HP.

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

## 3. What we did in session 6 (latest, in order)

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

## 4. Next steps (pick any)

1. **Slice `desert_props.png` by hand.** The sheet has 7 props in a
   non-uniform layout. Open it in Preview, read pixel coords for each
   prop, then add named frames in `preload()` similar to the tileset
   slicer but with manual `{x, y, w, h}` per frame. Place them in the
   desert scatter pass.
2. **Forest tileset.** Same workflow as desert: generate a 4×4 forest
   tileset (dark grass + moss + dirt path variants), load it, branch
   `buildMap` for `zone === 'forest'` to draw from it, drop the
   forest tint. Ruins and riverside next.
3. **Boss feedback when Bigfoot aggros.** Currently he just walks at
   you — add a chat message ("A Bigfoot has noticed you!") + screen
   pulse + bass hit so low-level players have a chance to retreat.

## 5. What we did in session 5 (in order)

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

## 6. Known issues / quirks

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
  change. Current: **`?v=43`**. Next change should use `?v=44`.
- `.vercel/` is gitignored. `node_modules/`, `*.log`, `.claude/`, and
  `.DS_Store` are also ignored.

---

## 7. File structure

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

## 8. Assets

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

## 9. GitHub + Vercel workflow (enforced)

- Commit **after every meaningful change**.
- Conventional prefixes only: `feat:`, `fix:`, `refactor:`, `tweak:`,
  `docs:`, `chore:`, `asset:`.
- Subject ≤ 72 chars, present tense, no trailing period.
- Bump `?v=N` in `index.html` whenever `game.js` changes. Current `?v=43`.
- Run `node -c project-grasslands/game.js` before pushing.
- Never end a session with uncommitted changes. Final action: clean
  `git status`, HANDOFF.md refreshed, both pushed.
- Vercel re-deploys automatically on `main`.

---

## 10. How to continue (do this first in a new session)

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

## 11. Constraints (do NOT re-add)

The user has explicitly cut these features. Re-adding them is regressive:

- WASD / arrow-key movement.
- Skill hotkeys (Power Strike, Self-Heal).
- SP stat + SP bar.
- HealerNPC (the blue `+` circle near spawn).
- Camera shake on hit.
- Toggleable stat panel overlay (`C` key).

Combat is intentionally **fully automatic** after a single click on a
monster.
