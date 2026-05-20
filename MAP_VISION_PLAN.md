# MAP_VISION_PLAN.md — Grasslands Online

> Target: bring the world from current state (`?v=177`, May 19 2026)
> to a hand-painted Ragnarok Online-style scene matching Sonny's
> reference screenshot (forest camp with mossy ruins, layered tree
> canopy, dirt path, tents + campfire + cart NPC, wood fence, pink
> slime cluster, archer with title, soft directional light).
>
> **Read this end-to-end before executing any phase.** Every asset
> request is one-image-at-a-time. Each phase is its own cache bump +
> commit. Do not pre-create assets that block on earlier ones.

---

## 1. What the target image actually shows

Surveying the screenshot pixel-by-pixel, the visual ingredients are:

1. **Painterly ground** — green grass with no visible tile grid,
   feathered dirt paths in multiple shades (light tan / mid brown /
   dark scuff at edges), soft moss patches, scattered flower-and-
   mushroom flecks.
2. **Layered foliage canopy** — at least 10 distinct tree silhouettes,
   foreground trees larger and saturated, background trees smaller
   and slightly desaturated. Some trees have lighter "sun side" tops.
3. **Mossy boulders** — rounded grey rocks with bright moss caps and
   small vines hanging from their tops.
4. **Ruined stone wall** — broken column + crumbled wall, vines
   wrapped, moss highlights.
5. **Camp scene** — two canvas tents (front + side angles), wooden
   cart on wheels with crates and barrel, **campfire** with stones
   and orange glow, **NPC** standing beside it.
6. **Wood log fence** — horizontal logs on vertical posts, partially
   broken on right side, with a ladder leaning against it.
7. **Pink slime cluster** — 4 Bloblings grouped together at right.
   We already have this art; it just needs grouping/spawn behavior.
8. **Player character** — detailed archer with bow, gold title text
   `« Veteran »` above class label `Phantom Striker Lv.200`.
9. **HUD bar** — HP bar (red), tiny EXP slim purple bar, Lv and zeny
   in a side panel. We're already close on this.
10. **Soft directional lighting** — every object has a faint left-
    side highlight and right-side shadow, consistent across props,
    suggesting a low sun in the upper-left.
11. **Subtle ambient particles** — small white sparkle motes drifting
    near the boss text ("King Blobling is roaming") banner.

---

## 2. Current state vs target — gap analysis

| Element | Target | Current `?v=177` | Gap |
|---|---|---|---|
| Ground tile grid | Invisible, organic | Uniform grass, biome blob washes | OK structurally, needs painterly tile art |
| Dirt path | Feathered multi-shade | Hard 128 px DIRT frames | Tile art upgrade needed |
| Tree variety | 10+ silhouettes | 3 keys (oak / pine / round) | Need 6-8 new tree PNGs + scaling/tinting |
| Mossy boulder | Bright moss + vines | Plain `deco_rock_01..03` | New mossy rock variants |
| Ruined stone wall | Broken arch + vines | Only `ruins_pillar_broken_01` | Need wall, arch, broken column variants |
| Tents | Two angles, canvas | Not present | New asset |
| Wooden cart | Full prop with wheels | Not present | New asset |
| Campfire | Stones + animated flame | Not present | New asset + Phaser flame tween |
| NPC | Standing villager | Not present | New sprite + clickable hub behavior |
| Log fence + ladder | Painted | Not present | New asset |
| Slime cluster | 4 grouped | Already random scatter | Cluster spawn density tweak |
| Player class | Archer / Phantom Striker | Archer exists, title system exists | Visual parity already close |
| HUD | Dark rim + bars | Dark rim + bars (session 78) | OK |
| Lighting | Soft directional | None | Add a single soft directional shadow to props |
| Particles | Sparkle motes near banners | Toast only, no motes | Sparkle particles on toasts |

The **structural** approach (neutral grass + feathered blob washes
for biome identity) is already correct — that's exactly how the
reference image is composed. The gap is **art quantity and quality**
plus a handful of new world objects (camp + NPC).

---

## 3. Asset plan (one image at a time)

Every prompt below ends with the standard suffix:

> *"top-down anime / Ragnarok Online style, soft painterly shading,
> feathered alpha edges, no hard outlines, no text, transparent
> background PNG, original art."*

Generate one PNG per request, drop into `~/Downloads`, the wiring
session does `sips --resampleHeightWidthMax <px>` to the listed size
and `mv` into the listed folder. Order is impact-descending.

### Tier 1 — Forest camp scene (highest impact, unlocks the reference)

Wire each as it lands. One commit per asset.

1. **`tent_canvas_front_01.png` (320×320)** — Tan canvas tent facing
   camera, slight opening flap, wood pole at center, soft drop
   shadow baked in at base.
2. **`tent_canvas_side_01.png` (360×280)** — Same tent style, side
   view, longer footprint.
3. **`campfire_01.png` (192×192)** — Ring of grey stones, orange
   flame in middle. Flame will be animated in code (3-frame yoyo
   alpha + scale).
4. **`wooden_cart_01.png` (420×260)** — Open-bed cart, two spoked
   wheels, wood crates and a barrel piled inside.
5. **`log_fence_horizontal_01.png` (320×120)** — Two horizontal
   logs across vertical posts, tileable along x.
6. **`log_fence_broken_01.png` (320×120)** — Same fence with the
   right post snapped, log hanging.
7. **`ladder_wooden_01.png` (120×260)** — Leaned wood ladder, both
   side rails visible.
8. **`npc_villager_idle_01.png` (160×220)** — Standing villager,
   tunic + apron, neutral pose, faces south by default. Single
   frame; idle bob via tween.

**After Tier 1 lands**, place a camp scene at one of the existing
secondary plazas (e.g. **Forest Edge** at midRow-half, midCol). New
helper `placeCamp(scene, cx, cy)` drops two tents + cart + campfire +
fence section + NPC + ladder around a center point.

### Tier 2 — Mossy boulders + ruins variants (depth + texture)

9. **`boulder_mossy_01.png` (192×192)** — Round grey boulder with
   bright green moss cap and 2-3 vines hanging from top.
10. **`boulder_mossy_02.png` (224×192)** — Wider boulder, two moss
    patches, no vines.
11. **`ruins_wall_broken_01.png` (320×220)** — Crumbled stone wall
    section with vines wrapping the standing edge.
12. **`ruins_arch_broken_01.png` (260×320)** — Stone arch missing
    its keystone, vines on left column.
13. **`ruins_column_fallen_01.png` (320×120)** — Toppled column
    laying on its side, moss on top.

### Tier 3 — Tree variety (canopy density)

14. **`tree_oak_large_01.png` (320×420)** — Big oak with broad
    canopy, gnarled visible roots, mossy base.
15. **`tree_birch_01.png` (180×360)** — Tall thin birch, white
    trunk with dark stripes.
16. **`tree_dark_pine_01.png` (200×400)** — Tall dark conifer.
17. **`tree_bush_round_01.png` (160×180)** — Foreground big bush.
18. **`tree_sapling_01.png` (120×200)** — Small young tree for
    background tinting.

### Tier 4 — Path + ground texture upgrades

19. **`floor_dirt_path_soft_01.png` (512×512)** — Painted dirt path
    blob with feathered alpha edge, tileable by overlap. Replaces
    hard 128 px DIRT tile frames at path cells.
20. **`floor_moss_patch_soft_01.png` (256×256)** — Small bright
    moss patch with feathered edge.
21. **`floor_grass_clump_soft_01.png` (256×256)** — Mid-green
    grass clump painted with visible blade hint, feathered.
22. **`deco_lily_pad_01.png` (96×96)** — Round lily pad for pond
    surfaces.
23. **`deco_log_fallen_01.png` (220×80)** — Mossy fallen log.

### Tier 5 — Polish

24. **`particle_sparkle_01.png` (32×32)** — Soft white star/sparkle
    for boss-banner motes and rare-mob aura.
25. **`fx_flame_glow_01.png` (96×96)** — Soft orange radial glow
    for the campfire light.

---

## 4. Code/system changes (per phase)

### Phase A — `placeCamp()` helper

Lives in `buildDecorations()` scope. Signature:

```js
const placeCamp = (cx, cy, opts = {}) => {
  // Drop two tents + cart + campfire + fence + ladder + NPC at sub-
  // tile offsets around (cx, cy). Each prop uses placeLandmarkDeco
  // so blockRadius / shadow / scale are consistent with the rest of
  // the map. NPC is added as an interactive sprite (see Phase D).
};
```

Called once for **Forest Edge** secondary plaza after Tier 1 assets
land. Camp props get `setDepth(y)` for proper y-sort.

### Phase B — Animated campfire flame

After `campfire_01.png` lands, add a 3-frame tween on the flame
sub-sprite (alpha 0.85 ↔ 1.0, scale 0.95 ↔ 1.08, ~140 ms cycle).
Add a soft orange ellipse (`fx_flame_glow_01.png` if present, else
graphics circle) underneath that breathes slowly.

### Phase C — Directional prop shadow

User explicitly disabled the old elliptical shadows (they were the
bleach ovals). Replace with a single light-direction shadow:

```js
const addDirShadow = (img, opts = {}) => {
  // Skewed dark silhouette of the prop, offset down-right (low sun
  // in upper-left). Alpha 0.18, drawn as the same texture key at
  // 1.0 width × 0.4 height scale, tinted 0x000000, depth = img.y - 1.
};
```

Apply selectively to large props (trees, tents, cart, boulders, NPC).
Skip small ground decorations.

### Phase D — NPC system

New `NpcController` class (mirroring `MonsterController` but
non-combat). Properties:
- `id`, `displayName`, `dialogueLines[]`, `sprite`, `cellRow/Col`
- `setInteractive()` with bigger-than-sprite hit rectangle
- On click within 80 px → open simple dialogue panel (reuses showTravel
  modal pattern: dark backdrop + parchment box + line cycling).

First NPC: **Camp Villager** at Forest Edge. Lines:
- "Welcome, traveler!"
- "The forest grows thicker the further north you walk."
- "Watch out for the boss in the deep woods."

Phaser scene-level `npcs[]` collection iterates in `update()` for
hover cursor change (same logic as monsters).

### Phase E — Path tile replacement

After `floor_dirt_path_soft_01.png` lands, replace the `buildMap()`
path-tile branch with feathered overlay stamps instead of 128 px
DIRT frames:

- Path cells still draw `TILE.GRASS` as base.
- A separate `addPathOverlay()` pass walks every path cell, stamps
  the soft dirt blob at slight offsets with random rotation, alpha
  0.85, depth -940.

Result: path silhouette stays a connected line, but its edges feather
into grass instead of showing 128 px squares.

### Phase F — Slime cluster spawn behavior

Currently Bloblings scatter randomly via spawn logic. Add a
post-spawn pass that picks 6-8 forest tiles and "clumps" 3-4
Bloblings within ±64 px of each, creating cluster groups like the
reference. No new art needed.

### Phase G — Sparkle particles on boss toast

When `ui.message()` triggers a boss-banner toast, fire 5-8 sparkle
sprites (`particle_sparkle_01`) drifting upward from the banner with
alpha 1 → 0 over 1.4 s. Already have `spawnFloatText` style float
helpers — reuse same pattern.

### Phase H — Background tree tint

Existing trees all render at the same saturation. Add subtle
"distance fade" by tinting trees that fall outside the camera's near
view (~600 px past the player) with a 0xc8d8a8 wash so far trees
feel atmospheric. Cheap, no per-frame cost (set once at placement).

### Phase I — Class title bigger

Target reference shows `« Veteran »` as a clear gold tag. We already
have a `pickPlayerTitle()` system. Bump:
- `titleTag` font 13 → 18 px bold.
- Add a thin gold underline rect 2 px below the text.
- Offset titleTag from -18 → -28 to clear the nameTag.

---

## 5. Phased roadmap

Each phase is one or more sessions. Cache bumps shown.

| Phase | Description | Assets needed | Cache target |
|---|---|---|---|
| **0** | Plan (this doc) | none | no bump |
| **1** | Wire campfire + animated flame + glow + sparkles | 3, 25, 24 | v=178 |
| **2** | Wire tents + cart + log fence + ladder + NPC + placeCamp | 1, 2, 4, 5, 6, 7, 8 | v=179 |
| **3** | NpcController + dialogue panel + first villager wired at Forest Edge | code-only after Phase 2 | v=180 |
| **4** | Mossy boulders + ruins variants in ruins/forest scatter passes | 9–13 | v=181 |
| **5** | Tree variety pack wired into forest/grasslands placement | 14–18 | v=182 |
| **6** | Dirt path soft blob overlay; deprecate DIRT_* tile frames at path cells | 19 | v=183 |
| **7** | Moss patches, grass clumps, lily pads, fallen logs into existing scatter | 20–23 | v=184 |
| **8** | Directional prop shadow + background tree tint + class-title polish | code-only | v=185 |
| **9** | Slime cluster spawn behavior + boss-toast sparkle motes | code-only | v=186 |

Total expected cache bumps: **9** (v=178 → v=186). Each phase fits
in one focused session with `node -c` + preview screenshot + commit
+ HANDOFF entry per existing workflow.

---

## 6. Risks + non-goals

**Risks**
- Asset weight grows. Currently ~38 MB; full Tier 1-5 adds maybe 25
  more MB. Vercel caches assets `immutable` so repeat visits stay
  fast, but first load gets longer. Mitigate with `sips` to spec
  sizes, optional `pngquant` if installed.
- Sprite count climbs. Each new prop type adds 100-300 placements
  per zone. Phaser scene graph handles ~10k sprites comfortably; we
  should stay under that with the off-screen sway-tween cull
  already in place (session 43).
- Generated art quality varies. If a prompt returns a hard-edged or
  off-style image, regen — don't paper over with code hacks.

**Non-goals**
- True elevation / terrain height system. Visual shadow hints only.
- Indoor / dungeon interior zone (Sonny's #8 critique). Separate
  multi-session epic — not in this plan.
- Replacing the player or monster sprites. Sonny called the
  character sprite a 7/10 standalone; leave it.
- Re-skinning the HUD beyond the session-78 bump and Phase 8 polish
  — current dark-rim bars match the reference already.
- Touching the **knight `*.png`** mods or **wizard `*.png`**
  untracked files in `assets/sprites/`. Pre-existing dirt.

---

## 7. Quick-glance "what to do next"

1. Generate **`campfire_01.png`** (Tier 1, item 3) first. Single
   image, highest morale boost, unlocks Phase 1.
2. Drop in `~/Downloads`, say "campfire ready", the wiring session
   moves it + wires preload + adds animated flame tween + commits +
   bumps cache to v=178 + updates HANDOFF.md.
3. Then continue Tier 1 in any order (`tent_canvas_*` next is
   recommended).

---

**Owner:** Sonny — review and adjust order/scope before any wiring.
Each phase is independent enough to defer or skip without breaking
the others.

---

## 8. Addendum — Focus Grove cozy aesthetic overlay

> Added 2026-05-19. Sonny: "I want my game to have beautiful and
> cute background like the game called Focus Grove." Focus Grove is
> a cozy productivity / forest-grove app with a soft pastel painterly
> style. This addendum captures how to bring that vibe to a top-down
> MMORPG **without** rebuilding the existing scene — it layers on top
> of the Tier 1–5 plan above.

### 8.1 What Focus Grove gets right

| Element | Focus Grove signature |
|---|---|
| **Palette** | Pastel — warm peach, soft pink, sage green, lavender. Low saturation. No pure black, no pure white. |
| **Lighting** | Diffuse, golden-hour-ish, no harsh shadows. Everything reads "warm late afternoon." |
| **Ambient motion** | Always-on drifting particles (petals, leaves, dust motes, tiny sparkles). Never busy, always gentle. |
| **Cute props** | Round, soft silhouettes. Mushrooms with caps bigger than expected, chubby lanterns, friendly little critters. |
| **Negative space** | Generous breathing room, never overcrowded. |
| **Music sync** | Visuals breathe with the soundtrack — gentle scale tweens on hero props. |

### 8.2 How each element maps to a top-down 2D MMORPG

Grasslands Online has no sky (camera looks down), so "background"
here means the **ground plane + ambient particle layer + UI vignette**.
Six concrete changes:

1. **Pastel palette shift on the grass base.** Today the uniform
   `TILE.GRASS` reads as a saturated fantasy green. Apply a single
   global tint to the grass tile pass (`~0xfff3d6` warm cream wash
   at alpha 0.18) so the field reads as "warm afternoon meadow"
   instead of "saturated forest floor." This is the single biggest
   vibe shift; one tint line in `buildMap()`.
2. **Warm vignette at viewport edges.** Soft peach corners
   (`~0xffd4a8`, alpha 0.08) on the UI camera so the visible map
   frame feels held by warm light instead of meeting raw black edges.
   Mirrors Focus Grove's screen-edge glow.
3. **Always-on ambient petals.** Existing `tickWeatherBurst` only
   fires during named weather events. Add a passive `tickCozyAmbient`
   that drips 1–2 sprites/sec of soft pink petals + tiny dust motes
   across the camera at all times, regardless of weather. Caps at
   ~24 alive concurrent. Independent of weather rate bumps in
   session 83.
4. **Soft glow under every interactive prop.** Spawn signpost, NPC,
   campfire, plaza lanterns — each gets a slow 4-second alpha
   breath glow (16 px wider than prop, warm yellow at 0.12 → 0.22).
   Reuses the spawn-plaza lantern pattern from session 42.
5. **Music breath on hero props.** Trees and tents already have
   sway tweens. Add the same 1.8 s breath tween to any prop with
   `cozy: true` flag in `placeLandmarkDeco`. Cheap, gives the world
   a heartbeat.
6. **Cute critter wanderers (cosmetic).** 1 small painted creature
   (e.g. round chick, soft bunny) wanders within ±200 px of the
   spawn plaza, follows a slow random-walk. No combat, no clickable.
   Just pure ambient cuteness. Reuses `MonsterController` skeleton
   with combat stripped.

### 8.3 Cozy asset list (one image at a time)

Generate after Phase 2 camp props are done (the camp is the cozy
visual anchor — these decorate around it). Standard prompt suffix
**plus** `"warm pastel palette, peach / sage / lavender, very
soft golden-hour light, low saturation, cute and friendly silhouette,
Focus Grove cozy app aesthetic, anime / Ragnarok Online cross."`

26. **`prop_lantern_post_warm_01.png` (160×260)** — Single tall
    wooden lantern post with paper lantern glowing warm yellow,
    soft halo baked in.
27. **`prop_paper_lantern_string_01.png` (320×120)** — A horizontal
    string of small paper lanterns hung between two invisible
    points. Tileable.
28. **`prop_garden_flowerbed_01.png` (240×160)** — Low wooden border
    with a soft cluster of pastel flowers (pink, peach, lavender).
29. **`prop_mushroom_round_big_01.png` (180×180)** — Big round
    chubby red-cap mushroom, deliberately oversized, white spots.
30. **`prop_picnic_blanket_01.png` (260×220)** — Checked picnic
    blanket spread on grass, basket on top, two pieces of fruit.
31. **`critter_chick_idle_01.png` (96×96)** — Tiny round yellow
    chick, idle pose, looking left. South-facing default.
32. **`critter_chick_walk_01.png` (96×96)** — Same chick, mid-step,
    one foot lifted.
33. **`critter_bunny_idle_01.png` (96×96)** — Tiny round soft bunny,
    pale cream, idle pose facing south.
34. **`critter_bunny_hop_01.png` (96×96)** — Same bunny, mid-hop.
35. **`fx_petal_pink_soft_01.png` (32×32)** — Single soft pink
    cherry-blossom petal, feathered alpha edge.
36. **`fx_dust_mote_soft_01.png` (24×24)** — Tiny warm dust mote
    with a soft halo.

### 8.4 Code-only changes (no new art needed)

Ship these as their own session **before** assets land — they're the
fastest visible payoff:

**A. Pastel grass tint.** In `buildMap()` grass branch, add
`img.setTint(0xfff3d6)` on every grass cell after the existing
flip variance. Single line. Existing `addGrassTones` stipple shows
through and reads as warm meadow instead of saturated forest.

**B. Warm vignette.** In `create()` after the UI camera is built,
add four corner ellipses (`scene.add.ellipse`) at the four viewport
corners, color `0xffd4a8`, alpha 0.08, blend mode ADD if available.
Resize handler keeps them anchored to corners.

**C. `tickCozyAmbient(scene, time, delta)`** — new lifecycle hook
added to the existing per-frame `update()`. Spawns up to 24 ambient
sprites total. Each sprite chooses randomly:
- 60% petal (alpha 0.55, scale 0.6–1.0, drift down-right ~60 px/s,
  rotate slowly, fade out over 6 s)
- 40% dust mote (alpha 0.35, smaller, drift up-left, fade over 4 s)

Until `fx_petal_pink_soft_01.png` / `fx_dust_mote_soft_01.png` land,
use Phaser graphics circles tinted `0xffb7d5` and `0xfff0c8` as
placeholder geometry.

**D. Cozy breath on hero props.** Tag `placeLandmarkDeco(... , { cozy:
true })` adds a slow scale 1.0 ↔ 1.025 yoyo tween (1.8 s) so plaza
hero props (signpost, shrine, well, bridge, obelisk) gently breathe.

**E. Class-title gold pill.** Already partly planned in §4 Phase I.
Bump priority — Focus Grove makes player labels feel like soft
chips, not text.

### 8.5 Slot into roadmap

Add as **Phase 10 (cozy palette + ambient)** after Phase 9. Two
sub-phases:

| Phase | Description | Assets | Cache |
|---|---|---|---|
| **10a** | Pastel grass tint + warm vignette + ambient petals/motes (placeholder graphics) + cozy breath tween | code-only | v=195 (next bump after current v=194) |
| **10b** | Wire `fx_petal_pink_soft_01.png` and `fx_dust_mote_soft_01.png` real art into ambient emitter | 35, 36 | v=196 |
| **10c** | Lantern post + paper lantern string + flowerbed + chubby mushroom + picnic blanket placed around spawn plaza | 26–30 | v=197 |
| **10d** | Chick + bunny critter wanderers near spawn (idle + walk frames) | 31–34 | v=198 |

**Recommendation:** ship 10a first. Single session, no asset
dependency, biggest single-step vibe shift. Sonny sees the change
immediately, then decides whether to keep going.

### 8.6 Non-goals (cozy edition)

- No sky / cloud parallax. Game is top-down — sky would feel wrong.
- No day-night palette override. Existing day/night overlay capped
  at alpha 0.18 stays as-is.
- No reskinning of combat (damage numbers, boss bars). Cozy applies
  only to world layer.
- Don't tint monsters — pink slime + giant boss bosses stay vivid.

