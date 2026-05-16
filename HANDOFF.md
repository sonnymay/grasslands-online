# HANDOFF.md — Grasslands Online

> **READ THIS FIRST.** Single source of truth between coding sessions. If you
> just opened a fresh Claude Code session, read top-to-bottom and follow §9
> ("How to continue") at the bottom.
>
> Last updated: 2026-05-16 (session 6)

---

## 1. Project overview

**Grasslands Online** — browser-based 2D MMORPG inspired by Ragnarok Online.
Everything is original (name, art, code), copyright-safe by design.

- **Owner:** Sonny (GitHub: `sonnymay`)
- **Repo:** https://github.com/sonnymay/grasslands-online (public)
- **Local root:** `/Users/santipapmay/Documents/Grasslands Online`
- **Playable subfolder:** `project-grasslands/`
- **Engine:** Phaser 3.70 (loaded from CDN, no build tools)
- **Language:** plain JavaScript + HTML
- **Art:** ChatGPT image-gen, anime 2D, no pixel art

### Run

```bash
cd "/Users/santipapmay/Documents/Grasslands Online/project-grasslands"
python3 -m http.server 8000
# open http://localhost:8000
```

Or use Claude Code preview: `mcp__Claude_Preview__preview_start` name `grasslands` (port 8001, configured in `/Users/santipapmay/Documents/Grasslands Online/.claude/launch.json` with `--directory project-grasslands`).

### Controls

- Click ground → A* path → walk
- Click monster → walk into range + auto-attack until dead
- `Tab` → target nearest live monster
- `Shift+R` → wipe save and reload
- No WASD/arrows. RO is mouse-only.
- No manual skill hotkeys right now. Combat is automatic after clicking a monster.

---

## 2. Current state — what works right now

### Movement
- 32 px cell grid (100×100) over the 3200×3200 world.
- 8-direction A* pathfinding (`findPath`) with octile heuristic + diagonal squeeze guard.
- Player position lerps cell-to-cell at `MS_PER_CELL = 170` ms. The slower cadence makes each footfall readable instead of sliding.
- Walk animation uses direction-specific timer-driven cycles. South/north avoid the wrong-facing `walk` frames and use `walk2 → idle → walk3 → idle`; east/west/diagonals use `walk → idle → walk2 → idle`. `walk4` assets remain loaded but unused because some have dark/spotlight backgrounds.
- Step-phase bob is subtle (3 px) with tiny squash (4%) so the character stays grounded.
- 8-direction sprite art (`north/south/east/southeast/northeast`, plus mirrored `west/southwest/northwest`). No more head-spin on diagonals.
- Hit stun (200 ms freeze) when damaged.
- Camera follows with smoothing; `setZoom(0.85)` for wider RO-like FOV.

### Combat
- Click monster → walks adjacent → auto-attacks every 1 s until dead.
- ±20% damage variance every hit.
- 3% crit (2× dmg, yellow bigger floating text with `!`).
- 5% player miss / 10% monster miss → `MISS` floats up.
- Player ATK starts at 10. No manual skill keys right now.
- No camera shake on hit (removed because user disliked it).
- Hover cursor changes to `crosshair` over monsters.

### Player stats + progression
- HP regen: 2% maxHP every 3 s (paused for 200 ms after a hit via `stunUntil`).
- EXP scales `level × 100`. Level-up: +20 HP / +3 ATK / +1 DEF, full HP, plays jingle.
- DEF subtracts from incoming damage (min 1).
- Death: lose 5% of current EXP requirement, respawn at world centre after 3 s.

### Monsters
- 25 total — 15 Blobling + 10 MooHam — configured in `MONSTER_TYPES`.
- **Passive AI:** monsters only chase + attack the player after being hit (`provoked` flag, 5 s aggro lapse).
- Random level 1–3 per monster (weighted toward 1). `hp ×1+0.5(L-1)`, `atk ×1+0.3(L-1)`, `exp × L`.
- Name tag shows `Blobling Lv.2` etc.
- Death → 1.5 s dead pose → despawn → respawn 5 s later via `spawnMonster` (with white puff effect).
- Drop a yellow zeny coin (60–160 % of EXP reward). 15 % bonus chance of a green healing herb (+20–35 HP). Walk over to pick up.

### UI
- Bottom bar: HP bar (red) on left; EXP bar (purple) centre; Lv + Zeny stacked right.
- Chat box bottom-left (10 latest messages).
- Mini-map top-right (160×160, semi-transparent, shows player white, monsters red/orange dots, loot yellow dots, faint path cross).
- Player HP bar above head when wounded.
- Floating damage numbers (white player / red enemy / yellow crit / grey MISS).
- Green click-ring marker at every walk-target.

### Persistence
- Auto-saves to `localStorage[grasslands_save_v1]` every 3 s and on level-up.
- Restored on page load (level / exp / HP / maxHP / ATK / DEF / zeny / kills / cell position).
- `Shift+R` wipes save and reloads for a fresh run.

### Audio
- Synthesised WebAudio SFX — no asset files. Tones for hit / crit / miss / player-hit / level-up / pickup / death.

### Map
- 25×25 procedural tilemap. Center cross dirt path (horizontal + vertical) for readability. Everything else = plain grass with random flipX/flipY to break the grid.
- Scatter-decoration layer (`buildDecorations`) sprinkles tall-grass clumps (220) and flower clusters (110) at random sub-cell offsets with random rotation/scale/flip. Rocks are commented out (looked off).
- Source PNGs have no alpha → runtime `keyOutWhite()` keys near-white pixels to transparent. Applied to every character + decoration on preload.

---

## 3. What we just did this session (latest first)

### Session 6 — RO-reference walk timing pass
1. **Looked up Ragnarok Online animation behavior** because the user explicitly asked to Google if needed. Ragnarok Research Lab documents RO sprite animations as timer/state-machine based rather than tied to movement distance, with ACT frame timing based around short fixed intervals.
2. **Changed Rookie walk from cell-progress driven to time-driven.** `_pickWalkFrame()` now uses `Math.floor(time / WALK_FRAME_MS)` instead of switching based on `stepT` inside each 32 px path cell.
3. **Added `WALK_FRAME_MS = 120`** so walking poses change at a readable animation cadence independent of `MS_PER_CELL=170`.
4. **Inserted idle/pass frames between foot poses** to avoid the puppet-like snapping from alternating only extreme foot frames:
   - `south/north`: `walk2`, `idle`, `walk3`, `idle`
   - `east/west/diagonals`: `walk`, `idle`, `walk2`, `idle`
5. **Kept direction-specific filtering** from Session 5 so bad/wrong-facing frames still stay out of the active walk cycle.
6. **Updated cache bust**: `index.html` changed from `game.js?v=37` → `game.js?v=38`.
7. **Verified in the in-app browser** after reload with horizontal and diagonal/northward walk samples. The first screenshot after reload can briefly show a green loading background while assets stream, then the game renders normally.
8. **Verified no game console errors** in the in-app browser. `node -c project-grasslands/game.js` and `git diff --check` passed.
9. **Remaining visual limitation**: this is now more RO-like in timing, but still only as good as generated art. True polish needs a single consistent sprite sheet where every frame shares feet baseline, scale, lighting, direction, and transparent alpha.

### Session 5 — Direction-specific walk frame fix
1. **Tested in the in-app browser** at `http://localhost:8000/?verify=walk36` after the user said the walk still looked strange.
2. **Observed the actual visual bug**: the player was not just sliding; it was snapping between wrong-facing body poses while moving. South/north movement could briefly show side/opposite-facing art, making the character look like it was twisting.
3. **Root cause**: the previous global 2-frame cycle still used `walk`/`walk2` for every direction. In the generated art set, `rookie_walk_south.png` and `rookie_walk_north.png` are not visually compatible with the correct forward/back walk cycle.
4. **Changed `_pickWalkFrame(t, dir)`** to choose frame pairs by direction:
   - `south`: `walk2`, `walk3`
   - `north`: `walk2`, `walk3`
   - `east/west`: `walk`, `walk2`
   - diagonals: `walk`, `walk2`
5. **Kept `MS_PER_CELL=170`, subtle 3 px bob, and 4% squash** from Session 4.
6. **Updated cache bust**: `index.html` changed from `game.js?v=36` → `game.js?v=37`.
7. **Verified** with `node -c project-grasslands/game.js`, `git diff --check`, and live in-app browser walk tests for horizontal, north, and south movement.
8. **Remaining visual limitation**: walk is less strange now, but true RO-quality walking still needs regenerated, consistent 4-frame walk art with matched feet baseline, scale, direction, and real alpha.

### Session 4 — Walk feel fix after Claude Code limit
1. **Reviewed live walk motion in Chrome** at `http://localhost:8000` after starting `python3 -m http.server 8000` from `project-grasslands/`.
2. **Confirmed current cache-bust state**: `index.html` was already at `game.js?v=35` before edits, despite older handoff text saying `?v=28`.
3. **Identified the sliding cause**: movement itself worked, but `MS_PER_CELL=130` plus `_pickWalkFrame()` cycling `['walk','walk2','walk3','walk4']` inside one short 32 px cell made the legs flicker too fast to read.
4. **Audited walk art contact sheet** and found `walk3`/`walk4` are not production-ready: several frames have mismatched facing/pose/lighting, and some have dark background/spotlight artifacts. Using them made the player look less grounded.
5. **Changed movement cadence**: `MS_PER_CELL` from `130` → `170` so grid steps feel closer to old MMO footfall timing.
6. **Reduced body tweening**: `BOB_AMPLITUDE` from `6` → `3`, `STEP_SQUASH` from `0.10` → `0.04`, keeping the walk grounded instead of bouncy.
7. **Disabled the bad 4-frame stride in code**: `_pickWalkFrame()` now intentionally uses only `['walk','walk2']` and holds each pose for roughly half a cell. `walk3`/`walk4` remain loaded assets but are not used until regenerated cleanly.
8. **Updated cache bust**: `index.html` changed from `game.js?v=35` → `game.js?v=36`.
9. **Removed stale code comment** that still mentioned Power Strike hotkeys even though combat is auto-click only.
10. **Verified** with `node -c project-grasslands/game.js` and live browser click-to-walk on `http://localhost:8000/?verify=walk36`.
11. **Observed verification caveat**: Chrome console showed MetaMask extension warnings/errors, not game errors. Game loaded and walk worked.

### Session 3 — RO feel pass
> Historical note: several session 3 experiments were later removed after user feedback (manual skill hotkeys, SP UI, healer/stat panel, camera shake). §2 above is current truth.

1. **Tile-grid + A* pathfinding** replacing free velocity (`MS_PER_CELL=160`, cell-to-cell lerp, walk/walk2 alternation per cell, RO-style cadence).
2. **8-direction sprites** wired (NE/SE generated; SW/NW are mirrored). `pickDirection` returns 8 sectors.
3. **Click marker** (green fading ring) on every move click.
4. **Hit stun + HP regen + SP regen**.
5. **Passive monster AI** — provoked only after being hit.
6. **MooHam monster type** introduced via `MONSTER_TYPES` config; spawn loop reads `count` per type.
7. **Monster levels 1–3** with stat scaling, name tag shows `Lv.X`.
8. **Damage variance + crit (8%) + miss (5%/10%)** with distinct floating-text styling.
9. **Loot system**: zeny coin drops + 15 % chance of healing herb. Walk-over pickup, bouncy spawn + pulse tween.
10. **Mini-map** in top-right corner, ~30 lines of `Graphics`.
11. **Player HP bar** above sprite (only when wounded).
12. **Spawn puff** ring when a monster respawns.
13. **Hover cursor** crosshair over monsters.
14. **Camera zoom 0.85** for wider RO-like FOV.
15. **Camera shake** on every player hit (90 ms, 0.004).
16. **localStorage save/load** every 3 s and on level-up; `Shift+R` wipes save.
17. **WebAudio synthesised SFX** (hit, crit, miss, player-hit, level-up, pickup, death). No asset files.
18. **SP stat + Power Strike skill** (`Q` or `1`, 10 SP, 1.7× damage, blue flash, "Power Strike!" float).
19. **Death EXP penalty** (5 % of `expNeeded()` on death).
20. **Organic map**: plain-grass base + random tile flips + decoration overlay layer.
21. **Self-Heal skill** (`2`/`W`, 15 SP, +30 HP base scaling +5/level, 3 s cooldown, green flash).
22. **Tab targeting** + persistent red ring around current attack target.
23. **HealerNPC** near spawn — blue circle with `+`, full HP/SP restore on contact (5 s cooldown).
24. **Day/night cycle** — cosine-driven darkness overlay, 2-minute loop, max alpha 0.45.
25. **Boss MooHam** — rare 1-of variant (240 HP, 16 ATK, 90 EXP, 1.9× scale).
26. **EXP gain float text** + respawn restores SP.
27. **Skill cooldown HUD** above EXP bar showing `[Q] Power Strike` / `[W] Self-Heal` and remaining seconds.
28. **Character stat panel** (`C`) — overlay with Lv / EXP / HP / SP / ATK / DEF / Zeny / Kills.
29. **Persistent kill counter** saved to localStorage.
30. **Mini-map markers** — healer cyan dot, boss MooHam large yellow dot.

### Session 2 — RO movement foundation
- Researched RO movement; added tile grid + A* + click-only + diagonal sprites pipeline.

### Session 1 — Phase 1 MVP
- Built `index.html` + `game.js` from scratch (Phaser 3).
- Fixed silent hang from missing arcade physics config.
- `keyOutWhite()` runtime alpha keying for source PNGs.
- Tile inset crop + overdraw to hide tileset seams.
- 2-frame walk cycle (`walk` + `walk2`).
- `rookie_attack.png` + `rookie_dead.png` poses wired.
- GitHub repo initialized, made public.

---

## 4. Next steps — pick any

1. **Regenerate clean 4-frame Rookie walk art** if user wants smoother RO-like walking. Prompt must require: same character, same direction, same scale, same feet baseline, transparent background PNG with alpha channel, no lighting/background changes. Replace `walk3`/`walk4`, then re-enable a 4-frame loop only after browser verification.
2. **Add subtle ground shadow under Rookie** so foot contact reads better while walking.
3. **Map variety pass.** Add biome patches/forest clusters using current tiles + decorations. Keep spawn/walkable protection intact.
4. **Fantasy UI skin pass.** Replace debug black rectangles with warm brown/gold framed RO-inspired panels.
5. **More monsters.** Add a third original monster via `MONSTER_TYPES`. Requires 3 new sprites.
6. **Quest stub** — kill 5 Bloblings, get reward zeny. Tracker in chat box.
7. **Inventory/equipment UI** only after user approves scope; keep game simple for now.
8. **Multiplayer (Phase 2)** — big jump: FastAPI WebSocket server + Vercel/Railway. Confirm scope first.

**Recommendation:** #1 only if new art is generated. Otherwise do #2 ground shadow + #4 UI skin next because look matters most.

---

## 5. Known issues

- `keyOutWhite()` strips any pure-white pixel — will damage future art with intentional whites. Regenerate with real alpha then remove this hack.
- Rookie walk frames are inconsistent across directions. Code now works around this with direction-specific timer-driven cycles and idle/pass frames, but true RO-quality walking needs regenerated 4-frame art with consistent direction, scale, feet baseline, lighting, and transparent PNG alpha. `walk4` remains unused.
- Tile seams: mitigated by 4 % inset crop + 2 px overdraw. Acceptable but visible at certain camera positions.
- No world collisions beyond `setCollideWorldBounds`. Player walks through bloblings/moohams.
- A* runs every repath; fine at 100×100 grid. Becomes expensive if grid grows. (max 8 000 iterations cap inside `findPath`).
- Mini-map redraws every frame — cheap but allocates one graphics command list each tick.
- Phaser banner spams the console on every reload. Cosmetic.
- `?v=N` cache-bust in `index.html` — bump on every `game.js` change. Current: `?v=38`.

---

## 6. File structure

```
Grasslands Online/                    ← git repo root
├── .gitignore                        ← ignores .DS_Store, .claude/, node_modules, *.log
├── HANDOFF.md                        ← this file
└── project-grasslands/               ← the playable web app
    ├── CLAUDE.md                     ← per-project coding rules
    ├── index.html                    ← Phaser CDN + game.js?v=N
    ├── game.js                       ← entire game
    └── assets/
        ├── sprites/                  ← character + monster PNGs
        ├── decorations/              ← scatter overlay PNGs
        └── tiles/grass_tileset.png
```

### `game.js` map (~1 100 lines)

- Constants → world / cell / combat / regen / save / loot.
- `MONSTER_TYPES` table.
- Globals → `player`, `bloblings`, `loots`, `walkable`, `clickMarker`, etc.
- `config + new Phaser.Game(config)` (arcade physics on).
- `preload()` — every PNG.
- `create()` — alpha-key, tileset slicing, map + decorations, player, monsters, input wiring, UI, save load.
- `update()` — player + monster ticks, loot pickup, auto-save, y-sort.
- Persistence: `saveGame / loadGameSave / applySave`.
- WebAudio: `_tone` + `sfx*` helpers.
- A*: `findPath / heuristic / findAdjacentReachableCell`.
- `pickDirection` (8 sectors) + `DIR_TEXTURE` map + `applyRookieTexture`.
- `PlayerController`: tile-grid walking, attack target pursuit, `powerStrike`, level-up, death.
- `MonsterController`: passive AI, level scaling, takeDamage, die with loot drop, respawn.
- `LootDrop` (zeny or heal kind).
- `attemptPlayerAttack / rollMonsterHit` combat math.
- `spawnFloatText / spawnDamageNumber` floating text.
- `buildMap / buildDecorations / getCellType` map gen.
- `UIManager`: bars, chat, mini-map.

---

## 7. Assets

### Sprites — `assets/sprites/`
| File | Role |
|---|---|
| rookie_idle/walk/walk2_{south,north,east,southeast,northeast}.png | 8-dir player art (15 files) |
| rookie_attack.png | 250 ms swing pose |
| rookie_dead.png | Death pose |
| blobling_idle/hit/dead.png | Blobling monster |
| mooham_idle/hit/dead.png | MooHam (pig) monster |

### Decorations — `assets/decorations/`
| File | Role |
|---|---|
| deco_flower_cluster_01..04.png | Random scatter on grass |
| deco_tallgrass_01..03.png | Random scatter on grass |
| deco_rock_01..03.png | Loaded but **commented out** in `buildDecorations` |

### Tiles
- `grass_tileset.png` — 1254×1254, 4×4 grid (16 tiles), sliced with 4 % inset crop, drawn `TILE_SIZE+2` to hide seams.

### ChatGPT prompts
Stored in §9 of the older `~/Downloads/HANDOFF.md` and repeated for diagonals in chat. Always request "transparent background PNG with alpha channel".

---

## 8. GitHub workflow (enforced)

- Commit **after every meaningful change**.
- Conventional prefixes only: `feat:`, `fix:`, `asset:`, `refactor:`, `docs:`, `chore:`, `tweak:`.
- Subject ≤ 72 chars, present tense, no trailing period.
- Never end a session with uncommitted changes. Final action: `git status` clean, HANDOFF.md updated, both pushed.

---

## 9. How to continue (run this first in a new session)

1. **Read this file in full.** No skimming.
2. `git status` and `git log --oneline -10` from repo root.
3. Start preview server:
   - `cd project-grasslands && python3 -m http.server 8000`, or
   - `mcp__Claude_Preview__preview_start` name `grasslands` (port 8001).
4. Open in browser, walk around, click a monster to auto-fight, pick up loot/herb, and confirm HP regen plus §2 still holds.
5. Pick a task from §4 (or whatever the user asks for).
6. **Every meaningful change:**
   - Edit code.
   - Bump `?v=N` in `index.html` (next: `?v=39`).
   - Reload preview, verify visually.
   - `git add` exact files, conventional-prefix commit, push.
7. **End of session:**
   - Update §3 ("What we just did"), §4 ("Next steps"), §5 ("Known issues"), §7 ("Assets") here.
   - Bump §2 if behaviour changed.
   - Commit HANDOFF.md, push. **Then** stop.
