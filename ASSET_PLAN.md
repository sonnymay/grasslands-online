# ASSET_PLAN.md — Map Art Upgrade

> Tier 0 prompt manifest for the map-art upgrade arc (post session 29).
> Generate via ChatGPT image-gen. Anime 2D, bright daytime, no pixel art,
> no text, no watermark, no border. PNG with near-white background
> (existing `keyOutWhite()` strips it at runtime). After saving, drop into
> the listed path. No code change needed for like-for-like swaps; new
> tilesets need 2 lines in `preload()` + 1 branch in `buildMap()` + a
> sliceTileset call (~5 lines total per biome).

Reference scale:
- Tileset PNGs: **768 × 768**, 8-bit RGB, no alpha. 3 × 3 grid of 256 px
  source tiles (game slices via `sliceTileset` with `TILESET_INSET_PCT`).
- Decoration PNGs: **256 × 256** square, single subject, anchored center-bottom,
  near-white background.

Bright-world rule: every prompt forbids deep shadows, night palette,
moody lighting, fog. Sonny rejected the atmospheric darkening pass.

---

## Tier 0a — Biome tilesets (3 missing)

Today only `grass_tileset.png` and `sand_tileset.png` are real art. Forest,
ruins, and riverside still tint the grass set. Generate one new tileset per
biome, same 768×768 / 3×3 layout as the existing two so the slicer just works.

### `forest_tileset.png` → `project-grasslands/assets/tiles/forest_tileset.png`

```
2D anime top-down ground tileset, 768x768, 3 by 3 grid of 256 px square
tiles, mossy forest floor. Tiles: 1 deep emerald grass, 2 grass with fallen
yellow leaves, 3 grass with small ferns, 4 mossy dirt, 5 grass with white
flowers, 6 grass with brown pine needles, 7 mossy stone patch, 8 grass with
clover, 9 grass with mushroom caps. Bright daytime. Saturated greens. No
shadows, no fog, no text, no border. Edges of each tile blend seamlessly so
they tile in any combination.
```

### `ruins_tileset.png` → `project-grasslands/assets/tiles/ruins_tileset.png`

```
2D anime top-down ground tileset, 768x768, 3 by 3 grid of 256 px square
tiles, weathered stone plaza, warm sun-bleached palette. Tiles: 1 cracked
flagstone, 2 dust over flagstone, 3 flagstone with grass tufts in the
cracks, 4 packed sand floor, 5 flagstone with small rubble chips, 6 mosaic
floor with faded geometric pattern, 7 stone with moss in cracks, 8 dry
earth with thin grass, 9 broken tile fragments scattered on stone. Bright
midday sun. Warm khaki and cream tones, no deep shadow. No text, no
border. Edges tile seamlessly.
```

### `riverside_tileset.png` → `project-grasslands/assets/tiles/riverside_tileset.png`

```
2D anime top-down ground tileset, 768x768, 3 by 3 grid of 256 px square
tiles, lush wet meadow next to a clear river, fresh mint and aqua palette.
Tiles: 1 bright green wet grass, 2 grass with blue forget-me-not flowers,
3 grass with white daisies, 4 shallow water with sand bottom, 5 muddy bank
with pebbles, 6 grass with small reeds, 7 grass with lily pads at edge,
8 wet sand with shell flecks, 9 grass with ripples of dew. Bright daylight,
saturated cool greens and clear blues. No deep shadows, no fog, no text,
no border. Edges tile seamlessly.
```

---

## Tier 0b — Biome-defining decorations

`assets/decorations/` already has grasslands + desert coverage. Forest,
ruins, riverside need their own deco set so each biome reads at a glance
even before tilesets land.

All 256×256, single subject, foot of object near bottom center, near-white
background, no shadow under the foot (game adds a soft ellipse at draw time).

### Forest

- `tree_pine_dense_01.png` — tall narrow pine, deep emerald needles, thick brown trunk visible at base
- `tree_oak_giant_01.png` — wide oak with round canopy, lighter olive green, gnarled brown trunk
- `forest_fern_01.png` — clump of 3 ferns, fresh green, no flower
- `forest_log_mossy_01.png` — fallen log lying on its side, bright moss on top, ends face left and right
- `forest_stump_01.png` — flat-topped tree stump, rings visible, small mushroom on top

### Ruins

- `ruins_pillar_broken_01.png` — single fluted stone column snapped at two-thirds height, cream stone, faint moss at base
- `ruins_pillar_intact_01.png` — full standing column with simple capital, sun-warmed stone
- `ruins_arch_fragment_01.png` — half of a broken stone arch leaning right, a few vines on it
- `ruins_rubble_pile_01.png` — pile of broken stone blocks, varied sizes, dust at base
- `ruins_statue_headless_01.png` — armless headless robed statue on a small plinth, weathered cream stone

### Riverside

- `riverside_cattail_01.png` — clump of 4 cattails, brown seed heads, slim green stalks
- `riverside_lilypad_01.png` — three lily pads floating, one with a white lotus flower
- `riverside_reed_clump_01.png` — tall thin reeds, light green tips, slight forward lean
- `riverside_driftwood_01.png` — pale grey driftwood log, weathered smooth, lying flat
- `riverside_stone_wet_01.png` — three smooth river stones in a small cluster, glossy from water

---

## Tier 0c — Landmark anchors (one per biome)

Plazas already exist as ground halos (session 15). Each needs one hero prop
so the landmark reads as a destination, not just a tinted disc. 256×256
unless noted.

- `landmark_spawn_signpost.png` — wooden signpost with two blank planks, friendly carved arrows (no text), at small grass mound. Grasslands.
- `landmark_forest_shrine.png` — small stone shrine with a moss roof, one lit lantern (warm light, NOT dim), offerings of acorns at base. Forest.
- `landmark_desert_obelisk.png` — single sand-colored obelisk, gold cap, faint geometric carving, small step base. Desert.
- `landmark_ruins_well.png` — circular stone well, cream stones, wooden bucket hanging on rope, ivy on one side. Ruins.
- `landmark_riverside_bridge.png` — **384×256** small wooden arched footbridge spanning a strip of water, no railing posts taller than the deck. Riverside.

Each saved under `project-grasslands/assets/decorations/`.

---

## Wiring order (after assets land)

1. Drop a tileset PNG → add 2 lines in `preload()` and 1 branch in
   `buildMap()` at game.js:1229 (mirror the desert branch). Run
   `node -c project-grasslands/game.js`. Bump `?v=N`.
2. Drop a deco PNG → add a `this.load.image('key', path)` in `preload()`
   and append the key to the relevant biome scatter table in
   `buildDecorations`. Bump `?v=N`.
3. Landmark hero props attach to existing landmark plaza cells via a new
   `LANDMARK_HEROES` map keyed by plaza id; place on top of the existing
   halo, depth above ground, below player. Bump `?v=N`.

Process one biome end-to-end before starting the next so the swap is
reviewable in a single commit.
