# HANDOFF.md — Grasslands Online

> **READ THIS FIRST.** Single source of truth between coding sessions. If you
> just opened a fresh Claude Code session, read this top-to-bottom and follow
> the **How to continue** section at the bottom.
>
> Last updated: 2026-05-16

---

## 1. Project overview

**Grasslands Online** is a browser-based 2D MMORPG inspired by Ragnarok
Online. Everything is original (name, art, code) so it's copyright-safe.

- **Owner:** Sonny (GitHub: `sonnymay`)
- **Repo root:** `/Users/santipapmay/Documents/Grasslands Online`
- **Playable subfolder:** `project-grasslands/`
- **Engine:** Phaser 3.70 (loaded from CDN, no build tools)
- **Language:** plain JavaScript + HTML
- **Planned backend (later phases):** FastAPI + WebSockets, Supabase, Vercel,
  Railway
- **Art generation:** ChatGPT image gen, smooth anime 2D — NO pixel art

### How to run locally

```bash
cd "/Users/santipapmay/Documents/Grasslands Online/project-grasslands"
python3 -m http.server 8000
# open http://localhost:8000
```

Claude Code preview server is registered via
`/Users/santipapmay/Documents/Grasslands Online/.claude/launch.json` as
**`grasslands`** on port **8001** (uses `--directory project-grasslands`).

### Controls

- Click ground → walk there (A* path through cells, ~160 ms per cell).
- Click a Blobling → walk into range and auto-attack until it dies.
- No keyboard movement (RO is mouse-only).

---

## 2. Current state — what is fully working right now

Phase 1 single-player MVP is **live and playable**.

- 25×25 procedural grass map, 3200×3200 world, 128 px tiles. Dirt path
  crosses the center. Flowers, rocks, tall grass scattered. Tile seams hidden
  by 4% inset crop + 2 px overdraw.
- Rookie player spawns at world center with a white "Rookie" name tag.
- 8-directional movement (200 px/s), WASD + arrows + click-to-move.
- Walk animation cycles `walk → walk2 → walk → walk2` synced to a step-phase
  accumulator. Body bobs ~3 px each step with a slight vertical squash —
  reads as actual walking, not sliding.
- Direction → texture: north / south / east + horizontal flip for west.
  Diagonals snap to nearest cardinal.
- Camera smoothly follows player with `startFollow(..., 0.1, 0.1)`.
- 5 Bloblings spawn ≥300 px from player. Wander (1.5–3 s random walks) →
  aggro within 200 px → chase → attack within 80 px every 1.5 s. Red HP bar
  + "Blobling" name tag above each.
- Click a Blobling within 100 px to attack (1 s cooldown). Click farther
  away auto-walks closer. Player swings `rookie_attack.png` for 250 ms on hit.
- Blobling hit feedback: swaps to `blobling_hit.png` for ~120 ms, plus a red
  damage number floats up.
- Blobling death: shows `blobling_dead.png` for 1.5 s, despawns, +10 EXP
  awarded, new Blobling spawns 5 s later. Chat box logs the kill.
- Level-up at `level × 100` EXP: +1 level, +20 max HP, +3 ATK, full heal,
  floating "LEVEL UP!" text + chat message.
- Player death: switches to `rookie_dead.png`, chat shows "You died.",
  respawns at world center 3 s later with full HP.
- UI: bottom 60 px bar with red HP bar, purple EXP bar, "Lv.X". Chat box
  above bar (welcome / kill / level-up / death). Floating damage numbers
  (white for damage to player, red for damage to enemies).
- Y-sorting: every sprite's depth = its world y each frame.

### Asset transparency workaround

Source PNGs are 1254×1254 with **no alpha channel** (ChatGPT exports). At
runtime `keyOutWhite()` (in `game.js`) reads each sprite into a `<canvas>`
and sets pixels where R/G/B > 235 to `alpha = 0`. Works for current art but
will damage any future sprite that intentionally has large pure-white areas.

---

## 3. What we just did this session (latest first)

### Session 2 — RO-style movement
- Researched RO movement (Ragnarok Research Lab, iRO Wiki): tile grid,
  ~150 ms per cell, click-only, server-authoritative path.
- Added a 32 px cell grid (`CELL_SIZE`, `GRID_COLS`, `GRID_ROWS`) sitting on
  top of the existing 128 px tile map. 100×100 cells over the 3200×3200
  world. Every cell currently walkable.
- Implemented 8-direction A* (`findPath`) with octile heuristic and
  diagonal-squeeze guard, plus a helper (`findAdjacentReachableCell`) that
  picks the cell next to a clicked Blobling.
- Rewrote `PlayerController` for tile-grid traversal. Player no longer uses
  Arcade Physics — sprite position is lerped between cell centres at
  `MS_PER_CELL = 160` ms per cell. Walk/walk2 alternates once per cell
  (true footfall), bob and squash run one full cycle per cell.
- Click ground → A* path → walk. Click a Blobling → walk into range,
  auto-attack on cooldown until target dies (no need to click again).
- Removed WASD and arrow keys. RO is mouse-only and the keyboard branch
  was fighting the path queue.
- Added a fading green click-ring marker at the cursor target.
- Added hit-stun: 200 ms freeze on player when damaged (`stunUntil`).
- Bumped `index.html` cache buster to `?v=4`.

### Session 1 — Phase 1 MVP

1. Built `index.html` + `game.js` from scratch (Phaser 3 MVP).
2. Found and fixed silent hang: missing `physics.arcade` config in
   `Phaser.Game`. Without it `scene.physics.world.setBounds` throws and
   `create()` aborts before adding any objects.
3. Switched sprite sizing from `setScale(fixed)` to display-height-based
   scale (`PLAYER_DISPLAY_H / sprite.height`) — source PNGs are 1254 px, so
   fixed 0.5 scale filled the screen with one Rookie.
4. Added `keyOutWhite()` runtime alpha keying for white-background PNGs.
5. Added 4% inset crop on tileset frames + 2 px tile overdraw to hide
   baked-in white separator lines in `grass_tileset.png`.
6. Upgraded walk feel to RO-style: introduced `stepPhase`, foot-fall bob,
   step squash, and `walk`/`walk2` alternation.
7. Wired in 5 new sprites: `rookie_walk2_{south,north,east}.png`,
   `rookie_attack.png`, `rookie_dead.png`. Attack pose flashes on swing;
   dead pose replaces the red death tint.
8. Initialized git repo, wrote `.gitignore`, committed initial state, and
   pushed to GitHub as **`sonnymay/grasslands-online`** (private).
9. Wrote this HANDOFF.md as the project's canonical handoff document.

---

## 4. Next steps — exact next task

**Pick one of these.** The first one is recommended.

1. **Add more monster variety.** Generate `slime_idle.png` /
   `slime_hit.png` / `slime_dead.png` (different colour from Blobling, e.g.
   green) and parameterize `BloblingController` into a `MonsterController`
   that takes a config (`{name, idleKey, hitKey, deadKey, hp, atk, exp,
   speed, aggroRange}`). Spawn 3 of each. Touches `game.js` only.
2. **Add diagonal walk sprites.** Generate
   `rookie_{idle,walk,walk2}_{southeast,southwest,northeast,northwest}.png`,
   then drop the "nearest cardinal" snap in `pickDirection()` and pick from
   the actual 8 directions in `applyRookieTexture()`.
3. **Tile-based collision.** Mark some tile indices (`ROCKS_DENSE`,
   `ROCKS_SPARSE`) as blocking. Build a simple bool grid in `buildMap()`
   and check it in `PlayerController.update()` before applying velocity.
4. **Begin Phase 2 multiplayer.** Stand up a FastAPI WebSocket server and
   sync player positions. This is a much bigger change — confirm scope
   before starting.

---

## 5. Known issues / bugs

- **Diagonal motion uses nearest-cardinal sprite.** Looks correct but reads
  as "sliding sideways" when moving northeast/southeast etc. Fix = generate
  diagonal sprites (see Next step #2).
- **Click-to-attack only works inside 100 px reach.** Clicking a Blobling
  farther away walks toward it but does **not** automatically attack on
  arrival — user has to click again. Logic lives in the pointerdown handler
  in `create()` (`game.js`, search for `attemptPlayerAttack`).
- **`keyOutWhite()` is destructive on white areas.** Any future asset with
  intentional pure-white pixels (e.g. eyes, tunic trim) will lose them.
  Regenerate art with real alpha and remove this hack when possible.
- **No collision with the world** beyond `setCollideWorldBounds`. Player
  walks through rocks, paths, and Bloblings.
- **No sound effects.** Out of MVP scope.
- **Phaser banner spams the console on every page reload.** Cosmetic.
- **`game.js` cache busting via `?v=N` in `index.html`.** Currently `?v=3`.
  Bump this when you change `game.js` and want the preview to reload fresh.

---

## 6. File structure

```
Grasslands Online/                  ← git repo root
├── .gitignore                      ← ignores .DS_Store, .claude/, node_modules, *.log
├── HANDOFF.md                      ← this file (read first each session)
└── project-grasslands/             ← the playable web app
    ├── CLAUDE.md                   ← per-project coding guidelines (think before, simplicity, surgical, goal-driven)
    ├── index.html                  ← loads Phaser 3.70 from CDN + game.js?v=N
    ├── game.js                     ← entire game: config, preload, create, update, classes
    └── assets/
        ├── sprites/                ← all character sprites (see §7)
        └── tiles/
            └── grass_tileset.png   ← 1254x1254, 4×4 grid, tiles ~313 px each before inset crop
```

### `game.js` map (one file, ~450 lines)

- Constants block — world size, tile size, speeds, animation timings.
- `TILE` object — tile index lookup for the 4×4 tileset.
- `config` + `new Phaser.Game(config)` — physics arcade enabled, scene
  `{ preload, create, update }`.
- `preload()` — loads every image listed in §7.
- `create()` — runs `keyOutWhite` on all character sprites, slices tileset
  into 16 frames, sets world / camera bounds, calls `buildMap`, spawns
  player + 5 Bloblings, wires keyboard (`cursors`, `wasd`), wires pointer
  click handler (attack-or-move), constructs `UIManager`.
- `update()` — calls `player.update`, every blobling's `update`, the UI's
  `update`, and sets each sprite's depth = its y for y-sort.
- `keyOutWhite(scene, key)` — alpha-keys near-white pixels for a texture.
- `buildMap(scene)` — procedurally lays the 25×25 map.
- `PlayerController` — stats, movement, walk cadence, attack pose flash,
  death, level-up. Stores `basePScale`, `stepPhase`, `attackPoseUntil`.
- `pickDirection(vx, vy)` — nearest cardinal from a velocity vector.
- `applyRookieTexture(sprite, dir, frame)` — picks
  `rookie_{idle,walk,walk2}_{north,south,east}.png` and flips X for west.
- `BloblingController` — stats, wander/aggro/attack AI, HP bar, death,
  scheduled respawn.
- `spawnBlobling(scene)` — random spawn ≥300 px from player.
- `attemptPlayerAttack(scene, target)` — cooldown + range check, triggers
  damage + attack pose.
- `spawnDamageNumber(scene, x, y, amount, color)` — floats a damage number.
- `UIManager` — bottom HP/EXP/Lv bar, chat box, per-frame redraw.

---

## 7. Assets

### Sprites in use (under `project-grasslands/assets/sprites/`)

| File                       | Role                                        | Status |
|----------------------------|---------------------------------------------|--------|
| rookie_idle_south.png      | Idle facing camera                          | ✅ |
| rookie_walk_south.png      | Walk frame 1 facing camera                  | ✅ |
| rookie_walk2_south.png     | Walk frame 2 facing camera                  | ✅ |
| rookie_idle_north.png      | Idle facing away                            | ✅ |
| rookie_walk_north.png      | Walk frame 1 facing away                    | ✅ |
| rookie_walk2_north.png     | Walk frame 2 facing away                    | ✅ |
| rookie_idle_east.png       | Idle facing right (mirrored for west)       | ✅ |
| rookie_walk_east.png       | Walk frame 1 right (mirrored for west)      | ✅ |
| rookie_walk2_east.png      | Walk frame 2 right (mirrored for west)      | ✅ |
| rookie_attack.png          | Plays for 250 ms on every player swing      | ✅ |
| rookie_dead.png            | Replaces sprite while player is dead        | ✅ |
| blobling_idle.png          | Default Blobling pose                       | ✅ |
| blobling_hit.png           | Flashes for ~120 ms when hit                | ✅ |
| blobling_dead.png          | Shown for 1.5 s after death                 | ✅ |

### Tiles (under `project-grasslands/assets/tiles/`)

| File              | Role                                                   |
|-------------------|--------------------------------------------------------|
| grass_tileset.png | 1254×1254 PNG, sliced 4×4 → 16 tiles, all referenced via the `TILE` constant in `game.js`. |

### Missing / nice-to-have

- Diagonal walk frames for 8-direction movement (see Next step #2).
- More monster types (slime, plant, etc.) for variety.
- `item_drop.png` for future loot drops.
- Sound effects (out of MVP scope).

### Source PNG generation prompts

Stored in the earlier `~/Downloads/HANDOFF.md` (templates for Rookie /
Blobling poses). Always include "transparent background" + request the
file as PNG with alpha — the `keyOutWhite()` runtime hack is a fallback
only.

---

## 8. GitHub workflow (enforced from now on)

- **Remote:** https://github.com/sonnymay/grasslands-online (private)
- Commit **after every meaningful change** — new feature, bug fix, sprite
  wired in. Don't batch unrelated work.
- Conventional commit prefixes only: `feat:`, `fix:`, `asset:`,
  `refactor:`, `docs:`, `chore:`.
- Subject line ≤ 72 chars, present tense, no period.
- Never end a session with uncommitted changes. Last action before signing
  off: `git status` clean, HANDOFF.md updated, both committed and pushed.

---

## 9. How to continue (do this first in a new session)

1. **Read this file in full.** Do not skim.
2. Run `git status` and `git log --oneline -10` from the repo root to
   confirm the working tree is clean and to see the most recent work.
3. Start the preview server:
   - Either `python3 -m http.server 8000` from `project-grasslands/` and
     open http://localhost:8000, OR
   - Use the Claude Code preview tool `mcp__Claude_Preview__preview_start`
     with name `"grasslands"` (port 8001).
4. Open http://localhost:PORT, walk around, kill a Blobling, level up.
   Confirm everything in §2 still works.
5. Pick a task from §4 ("Next steps") or whatever the user asks.
6. After **every** meaningful change:
   - Bump `?v=N` in `index.html` if you touched `game.js` and want the
     preview to reload fresh.
   - Verify in the browser.
   - `git add` the changed files only, then commit with a conventional
     prefix and push.
7. At end of session, update §3 ("What we just did"), §4 ("Next steps"),
   §5 ("Known issues"), and §7 ("Assets") in this file. Commit and push
   HANDOFF.md. **Then** stop.
