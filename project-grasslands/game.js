// Grasslands Online — Phase 1 (single-player MVP)
// Phaser 3.70 — no build tools.

const GAME_W = 1024;
const GAME_H = 768;
const WORLD_W = 6400;
const WORLD_H = 6400;
const TILE_SIZE = 128;
const MAP_COLS = Math.ceil(WORLD_W / TILE_SIZE); // 25
const MAP_ROWS = Math.ceil(WORLD_H / TILE_SIZE);

// RO-style tile-grid movement. Cells are finer than tiles so paths feel smooth.
const CELL_SIZE = 32;
const GRID_COLS = Math.floor(WORLD_W / CELL_SIZE);
const GRID_ROWS = Math.floor(WORLD_H / CELL_SIZE);
const MS_PER_CELL = 170; // RO-like: slower cell steps make footfalls readable.
const MAX_PATH_LEN = 256;
const HIT_STUN_MS = 200;
const HP_REGEN_INTERVAL_MS = 3000;  // tick every 3s
const HP_REGEN_PCT = 0.02;          // 2% of maxHP per tick
// Source PNGs are ~1254px tall; we display the player ~96px and bloblings ~64px.
const PLAYER_DISPLAY_H = 96;
const BLOBLING_DISPLAY_H = 64;
const PLAYER_ATTACK_COOLDOWN = 1000;
const SPECIAL_COOLDOWN_MS = 10000; // class auto-skill charges every 10s
// Combat randomness — RO-style feel.
const DAMAGE_VARIANCE = 0.2;       // ±20% on every hit
const PLAYER_CRIT_CHANCE = 0.03;   // rare 3% crit
const CRIT_MULTIPLIER = 2;
const PLAYER_MISS_CHANCE = 0.05;   // 5% whiff
const MONSTER_MISS_CHANCE = 0.10;  // 10% monsters miss player
const LOOT_PICKUP_RADIUS = 28;
const LOOT_MAGNET_RADIUS = 320; // auto-collect: loot drifts toward player when within this range
const LOOT_MAGNET_SPEED  = 700; // px/s pull velocity
const BLOBLING_ATTACK_COOLDOWN = 1500;
const BLOBLING_AGGRO_RANGE = 200;
const BLOBLING_ATTACK_RANGE = 80;
const BLOBLING_COUNT = 30;
const MOOHAM_COUNT = 20;
const MOOWAAN_COUNT = 15;
const DUNE_BLOB_COUNT = 12;
const BIGFOOT_COUNT = 1;

// Monster type catalog. Add new monsters here; spawn loop reads `count`.
const MONSTER_TYPES = {
  blobling: {
    name: 'Blobling',
    idleKey: 'blobling_idle', hitKey: 'blobling_hit', deadKey: 'blobling_dead',
    maxHP: 50, atk: 5, expReward: 10, speed: 80,
    nameColor: '#ffcccc', count: BLOBLING_COUNT,
    zones: ['grasslands'],
  },
  mooham: {
    name: 'MooHam',
    idleKey: 'mooham_idle', hitKey: 'mooham_hit', deadKey: 'mooham_dead',
    maxHP: 80, atk: 8, expReward: 18, speed: 70,
    nameColor: '#ffd9a8', count: MOOHAM_COUNT,
    zones: ['grasslands', 'ruins'],
  },
  moowaan: {
    name: 'MooWaan',
    idleKey: 'moowaan_idle', hitKey: 'moowaan_hit', deadKey: 'moowaan_dead',
    maxHP: 60, atk: 6, expReward: 14, speed: 90,
    nameColor: '#d6ffd0', count: MOOWAAN_COUNT, scaleMult: 0.9,
    zones: ['forest', 'riverside'],
  },
  cactling: {
    name: 'Cactling',
    idleKey: 'cactling_idle', hitKey: 'cactling_hit', deadKey: 'cactling_dead',
    maxHP: 70, atk: 7, expReward: 16, speed: 85,
    nameColor: '#bce86a', count: DUNE_BLOB_COUNT, scaleMult: 1.0,
    zones: ['desert'],
  },
  // Rare "shiny" variants — same sprite, gold/emerald tint, +50% HP. Not
  // spawned by the standard count loop (count: 0); the spawnMonster reroll
  // below converts a regular mooham/moowaan spawn into one of these at 1%.
  rare_mooham: {
    name: 'Golden MooHam',
    idleKey: 'mooham_idle', hitKey: 'mooham_hit', deadKey: 'mooham_dead',
    maxHP: 120, atk: 10, expReward: 0, speed: 60,
    nameColor: '#ffe066', tint: 0xffe066, scaleMult: 1.15,
    zones: ['grasslands', 'ruins'], count: 0,
    levelsAward: 5,
    rare: true,
  },
  rare_moowaan: {
    name: 'Emerald MooWaan',
    idleKey: 'moowaan_idle', hitKey: 'moowaan_hit', deadKey: 'moowaan_dead',
    maxHP: 90, atk: 8, expReward: 0, speed: 100,
    nameColor: '#7cffb0', tint: 0x7cffb0, scaleMult: 1.05,
    zones: ['forest', 'riverside'], count: 0,
    levelsAward: 5,
    rare: true,
  },
  boss_mooham: {
    name: 'Boss MooHam',
    idleKey: 'mooham_idle', hitKey: 'mooham_hit', deadKey: 'mooham_dead',
    maxHP: 240, atk: 16, expReward: 90, speed: 55,
    nameColor: '#ff9933', count: 1, scaleMult: 1.9,
    zones: ['desert'],
  },
  bigfoot: {
    name: 'Bigfoot',
    idleKey: 'bigfoot_idle', hitKey: 'bigfoot_hit', deadKey: 'bigfoot_dead',
    aggroKey: 'bigfoot_aggro', chaseKey: 'bigfoot_chase', attackKey: 'bigfoot_attack',
    maxHP: 900, atk: 220, expReward: 500, speed: 45,
    nameColor: '#ff4444', count: BIGFOOT_COUNT, scaleMult: 2.2,
    fixedLevel: 50, noLevelScaling: true, aggressive: true, aggroRange: 520, oneShotBelowLevel: 50,
    zones: ['forest'],
    minSpawnDistance: 2400, // keep him in far forest so new players don't walk into a one-shot
  },
};

// Zones partition the world into themed regions. Each zone gets its own tile
// tint, decoration mix, and monster pool. Center stays grasslands so the spawn
// area is unchanged for returning players.
// Class progression. Tier 1 unlocked by picking at Lv 10. Subsequent tiers
// auto-upgrade at 30/60/100. `tint` is a placeholder until real class sprites
// arrive — applyRookieTexture still draws rookie keys and sets this tint.
// `sprite` prefix is the future per-class sprite key prefix; if those textures
// don't exist yet we fall back to `rookie_`.
const CLASS_DEFS = {
  swordsman: {
    flavor: 'The blade never lies',
    cardImage: 'swordsman_card',
    spritePrefix: 'swordsman_',
    tint: 0xff8866,
    nameColor: '#ff9966',
    tierNames: ['Swordsman', 'Knight', 'Lord Knight', 'Dragon Sovereign'],
  },
  mage: {
    flavor: 'The arcane calls you',
    cardImage: 'mage_card',
    spritePrefix: 'mage_',
    tint: 0x99aaff,
    nameColor: '#aabbff',
    tierNames: ['Mage', 'Wizard', 'Archmage', 'Void Sorcerer'],
  },
  archer: {
    flavor: 'Swift and true',
    cardImage: 'archer_card',
    spritePrefix: 'archer_',
    tint: 0x88ee88,
    nameColor: '#99ee99',
    tierNames: ['Archer', 'Hunter', 'Ranger', 'Phantom Striker'],
  },
};
// Stat bonuses applied once when crossing each tier threshold.
const CLASS_TIER_THRESHOLDS = [
  { level: 10,  tier: 1, dHP:   0, dAtk:  0 }, // tier 1 just unlocks selection
  { level: 30,  tier: 2, dHP:  50, dAtk: 15 },
  { level: 60,  tier: 3, dHP: 100, dAtk: 30 },
  { level: 100, tier: 4, dHP: 200, dAtk: 60 },
];

const ZONE_TINTS = {
  grasslands: 0xffffff,
  forest:     0x6b8a5a,
  desert:     0xe8c878,
  ruins:      0xb0a890,
  riverside:  0xa8c8b0,
};
const ANIM_FRAME_MS = 180;
const WALK_FRAME_MS = 120;
const BOB_AMPLITUDE = 3;     // subtle lift; too much reads as bounce, not walking
const STEP_SQUASH = 0.04;    // tiny squash so feet stay visually planted
const ATTACK_RANGE = 100; // melee click-attack range
const RESPAWN_MS = 5000;
const PLAYER_RESPAWN_MS = 3000;

// Tile indices in a 4x4 tileset (0..15), left→right, top→bottom
const TILE = {
  GRASS: 0,
  THICK_GRASS: 1,
  FLOWER: 2,
  FLOWERS_COLOR: 3,
  ROCKS_SPARSE: 4,
  ROCKS_DENSE: 5,
  DIRT_PATCH: 6,
  DIRT_HEAVY: 7,
  DIRT_H: 8,
  DIRT_H2: 9,
  DIRT_V: 10,
  DIRT_V2: 11,
  DIRT_CORNER: 12,
  DIRT_WIDE: 13,
  DIRT_OPEN: 14,
  TALL_GRASS: 15,
};

// ---------- Phaser config ----------
const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#3a6b35',
  pixelArt: false,
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: 0 }, debug: false },
  },
  scene: { preload, create, update },
};

const game = new Phaser.Game(config);

// Globals carried by scene (kept on `this` where possible)
let player;
let bloblings = [];
let loots = [];
let dayNightOverlay = null;
let targetRing = null;
const DAY_NIGHT_CYCLE_MS = 120000; // 2-minute day/night loop
let lastSaveAt = 0;
const SAVE_KEY = 'grasslands_save_v2';
const SAVE_INTERVAL_MS = 3000;
let ui;
let autopilotOn = false;
let autopilotLastScan = 0;
let classSelectOpen = false;
let currentZone = null;
const ZONE_LABELS = {
  grasslands: 'Grasslands',
  forest:     'Dark Forest',
  desert:     'Sun-bleached Desert',
  ruins:      'Ancient Ruins',
  riverside:  'Riverside',
};
let lastPlayerAttack = 0;
let tileSliceW = 0;
let tileSliceH = 0;
let walkable = null;   // [row][col] bool — true if a player can stand on it
let clickMarker = null;

// ---------- Preload ----------
function preload() {
  // Loader UI driven from the HTML overlay so the user sees progress instead of
  // a blank green canvas while the heavy PNG batch downloads on first visit.
  const fill = document.getElementById('loader-fill');
  const pct  = document.getElementById('loader-pct');
  this.load.on('progress', (p) => {
    const v = Math.round(p * 100);
    if (fill) fill.style.width = v + '%';
    if (pct)  pct.textContent = 'Loading ' + v + '%';
  });
  this.load.on('complete', () => {
    const overlay = document.getElementById('loader');
    if (overlay) {
      overlay.classList.add('hidden');
      setTimeout(() => overlay.remove(), 400);
    }
  });

  this.load.image('rookie_idle_south', 'assets/sprites/rookie_idle_south.png');
  this.load.image('rookie_walk_south', 'assets/sprites/rookie_walk_south.png');
  this.load.image('rookie_idle_north', 'assets/sprites/rookie_idle_north.png');
  this.load.image('rookie_walk_north', 'assets/sprites/rookie_walk_north.png');
  this.load.image('rookie_idle_east', 'assets/sprites/rookie_idle_east.png');
  this.load.image('rookie_walk_east', 'assets/sprites/rookie_walk_east.png');
  this.load.image('rookie_walk2_south', 'assets/sprites/rookie_walk2_south.png');
  this.load.image('rookie_walk2_north', 'assets/sprites/rookie_walk2_north.png');
  this.load.image('rookie_walk2_east', 'assets/sprites/rookie_walk2_east.png');
  // Optional 4-frame stride — silently skipped if files don't exist.
  this.load.on('loaderror', (file) => {
    if (file && file.key && /^rookie_(walk3|walk4)_/.test(file.key)) {
      // expected when art hasn't been generated yet — no-op
    }
  });
  for (const d of ['south', 'north', 'east', 'southeast', 'northeast']) {
    for (const n of ['walk3', 'walk4']) {
      this.load.image(`rookie_${n}_${d}`, `assets/sprites/rookie_${n}_${d}.png`);
    }
  }
  this.load.image('rookie_idle_southeast', 'assets/sprites/rookie_idle_southeast.png');
  this.load.image('rookie_walk_southeast', 'assets/sprites/rookie_walk_southeast.png');
  this.load.image('rookie_walk2_southeast', 'assets/sprites/rookie_walk2_southeast.png');
  this.load.image('rookie_idle_northeast', 'assets/sprites/rookie_idle_northeast.png');
  this.load.image('rookie_walk_northeast', 'assets/sprites/rookie_walk_northeast.png');
  this.load.image('rookie_walk2_northeast', 'assets/sprites/rookie_walk2_northeast.png');
  this.load.image('rookie_attack', 'assets/sprites/rookie_attack.png');
  this.load.image('rookie_dead', 'assets/sprites/rookie_dead.png');
  this.load.image('blobling_idle', 'assets/sprites/blobling_idle.png');
  this.load.image('blobling_hit', 'assets/sprites/blobling_hit.png');
  this.load.image('blobling_dead', 'assets/sprites/blobling_dead.png');
  this.load.image('mooham_idle', 'assets/sprites/mooham_idle.png');
  this.load.image('mooham_hit', 'assets/sprites/mooham_hit.png');
  this.load.image('mooham_dead', 'assets/sprites/mooham_dead.png');
  this.load.image('moowaan_idle', 'assets/sprites/moowaan_idle.png');
  this.load.image('moowaan_hit', 'assets/sprites/moowaan_hit.png');
  this.load.image('moowaan_dead', 'assets/sprites/moowaan_dead.png');
  this.load.image('bigfoot_idle', 'assets/sprites/bigfoot_idle.png');
  this.load.image('bigfoot_aggro', 'assets/sprites/bigfoot_aggro.png');
  this.load.image('bigfoot_chase', 'assets/sprites/bigfoot_chase.png');
  this.load.image('bigfoot_attack', 'assets/sprites/bigfoot_attack.png');
  this.load.image('bigfoot_hit', 'assets/sprites/bigfoot_hit.png');
  this.load.image('bigfoot_dead', 'assets/sprites/bigfoot_dead.png');
  // Class selection card art.
  this.load.image('swordsman_card', 'assets/sprites/swordsman_card.png');
  this.load.image('mage_card',      'assets/sprites/mage_card.png');
  this.load.image('archer_card',    'assets/sprites/archer_card.png');
  // Class tier-1 player sprites (south-only for now; other directions fall
  // back to rookie + class tint via applyRookieTexture).
  this.load.image('swordsman_idle_south', 'assets/sprites/swordsman_idle_south.png');
  this.load.image('swordsman_walk_south', 'assets/sprites/swordsman_walk_south.png');
  this.load.image('mage_idle_south',      'assets/sprites/mage_idle_south.png');
  this.load.image('mage_walk_south',      'assets/sprites/mage_walk_south.png');
  this.load.image('archer_idle_south',    'assets/sprites/archer_idle_south.png');
  this.load.image('archer_walk_south',    'assets/sprites/archer_walk_south.png');
  // Desert biome — Cactling monster + sand tileset + cactus / dune deco.
  this.load.image('cactling_idle', 'assets/sprites/cactling_idle.png');
  this.load.image('cactling_hit', 'assets/sprites/cactling_hit.png');
  this.load.image('cactling_dead', 'assets/sprites/cactling_dead.png');
  this.load.image('sand_tileset', 'assets/tiles/sand_tileset.png');
  this.load.image('cactus_set', 'assets/decorations/cactus_set.png');
  this.load.image('deco_sand_dune', 'assets/decorations/deco_sand_dune.png');
  // Decorations
  for (let i = 1; i <= 4; i++) this.load.image(`deco_flower_cluster_0${i}`, `assets/decorations/deco_flower_cluster_0${i}.png`);
  for (let i = 1; i <= 3; i++) this.load.image(`deco_rock_0${i}`, `assets/decorations/deco_rock_0${i}.png`);
  for (let i = 1; i <= 3; i++) this.load.image(`deco_tallgrass_0${i}`, `assets/decorations/deco_tallgrass_0${i}.png`);
  // Larger props
  this.load.image('tree_oak_01',   'assets/decorations/tree_oak_01.png');
  this.load.image('tree_pine_02',  'assets/decorations/tree_pine_02.png');
  this.load.image('tree_round_03', 'assets/decorations/tree_round_03.png');
  this.load.image('bush_01', 'assets/decorations/bush_01.png');
  this.load.image('bush_02', 'assets/decorations/bush_02.png');
  this.load.image('mushroom_red_01',   'assets/decorations/mushroom_red_01.png');
  this.load.image('mushroom_brown_02', 'assets/decorations/mushroom_brown_02.png');
  this.load.image('pond_01', 'assets/decorations/pond_01.png');
  this.load.image('grass_tileset', 'assets/tiles/grass_tileset.png');

  // Background music — optional. Loader tolerates missing file (silent if absent).
  // Try mp3 first; ogg fallback for Firefox-only setups.
  this.load.audio('bgm', ['assets/audio/bgm.mp3', 'assets/audio/bgm.ogg']);
}

// ---------- Create ----------
function create() {
  const scene = this;

  // Background music: loop quietly. Browsers require a user gesture before
  // playing audio, so attach a one-shot pointer/key listener that resumes the
  // audio context and starts the track. After that it just loops.
  if (scene.cache.audio.exists('bgm')) {
    const bgm = scene.sound.add('bgm', { loop: true, volume: 0.35 });
    scene.bgm = bgm; // expose for the mute toggle in UIManager
    const start = () => {
      try {
        if (scene.sound.context && scene.sound.context.state === 'suspended') {
          scene.sound.context.resume();
        }
        if (!bgm.isPlaying) bgm.play();
      } catch (e) { /* ignore */ }
    };
    // Try immediately (works if user already interacted on the page).
    start();
    // And on the very first input afterward as a fallback.
    scene.input.once('pointerdown', start);
    scene.input.keyboard.once('keydown', start);
  }

  // Source PNGs lack alpha; key out near-white pixels to fake transparency.
  const spriteKeys = [
    'rookie_idle_south','rookie_walk_south','rookie_walk2_south',
    'rookie_idle_north','rookie_walk_north','rookie_walk2_north',
    'rookie_idle_east','rookie_walk_east','rookie_walk2_east',
    'rookie_idle_southeast','rookie_walk_southeast','rookie_walk2_southeast',
    'rookie_idle_northeast','rookie_walk_northeast','rookie_walk2_northeast',
    'rookie_walk3_south','rookie_walk4_south',
    'rookie_walk3_north','rookie_walk4_north',
    'rookie_walk3_east','rookie_walk4_east',
    'rookie_walk3_southeast','rookie_walk4_southeast',
    'rookie_walk3_northeast','rookie_walk4_northeast',
    'rookie_attack','rookie_dead',
    'blobling_idle','blobling_hit','blobling_dead',
    'mooham_idle','mooham_hit','mooham_dead',
    'moowaan_idle','moowaan_hit','moowaan_dead',
    'bigfoot_idle','bigfoot_aggro','bigfoot_chase','bigfoot_attack','bigfoot_hit','bigfoot_dead',
    'cactling_idle','cactling_hit','cactling_dead',
    'cactus_set','deco_sand_dune',
    'swordsman_idle_south','swordsman_walk_south',
    'mage_idle_south','mage_walk_south',
    'archer_idle_south','archer_walk_south',
    'deco_flower_cluster_01','deco_flower_cluster_02','deco_flower_cluster_03','deco_flower_cluster_04',
    'deco_rock_01','deco_rock_02','deco_rock_03',
    'deco_tallgrass_01','deco_tallgrass_02','deco_tallgrass_03',
    'tree_oak_01','tree_pine_02','tree_round_03',
    'bush_01','bush_02',
    'mushroom_red_01','mushroom_brown_02',
    'pond_01',
  ];
  for (const k of spriteKeys) keyOutWhite(scene, k);

  // Slice every 4x4 tileset into 16 frames named `tile_0`..`tile_15` on that
  // texture key. buildMap picks which tileset key to draw from per zone.
  // Grass tileset has a baked white separator → 4% inset crops it. Sand
  // tileset is flush, so inset=0 to avoid revealing the canvas behind.
  const TILESET_INSET_PCT = { grass_tileset: 0.04, sand_tileset: 0 };
  const sliceTileset = (texKey) => {
    if (!scene.textures.exists(texKey)) return;
    const img = scene.textures.get(texKey).getSourceImage();
    const sw = Math.floor(img.width / 4);
    const sh = Math.floor(img.height / 4);
    const inset = Math.floor(sw * (TILESET_INSET_PCT[texKey] ?? 0.04));
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const idx = r * 4 + c;
        scene.textures.get(texKey).add(
          `tile_${idx}`, 0,
          c * sw + inset, r * sh + inset,
          sw - inset * 2, sh - inset * 2
        );
      }
    }
    // Cache slice dims off the first tileset for any legacy reads.
    tileSliceW = sw;
    tileSliceH = sh;
  };
  sliceTileset('grass_tileset');
  sliceTileset('sand_tileset');

  // World bounds + camera
  scene.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
  scene.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);

  // Build procedural map + walkable grid (every cell walkable for now).
  buildMap(scene);
  walkable = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    walkable.push(new Array(GRID_COLS).fill(true));
  }
  // Now that walkable exists, scatter decorations (some block cells).
  buildDecorations(scene);

  // Ground click marker (small green ring) — appears at the target cell.
  clickMarker = scene.add.graphics();
  clickMarker.setDepth(-500);
  clickMarker.setVisible(false);

  // Persistent ring around the current attack target.
  targetRing = scene.add.graphics();
  targetRing.setDepth(-100);
  targetRing.setVisible(false);

  // Player
  player = new PlayerController(scene, WORLD_W / 2, WORLD_H / 2);

  // Bloblings
  for (const typeId of Object.keys(MONSTER_TYPES)) {
    const cfg = MONSTER_TYPES[typeId];
    for (let i = 0; i < cfg.count; i++) spawnMonster(scene, typeId);
  }

  // Camera follow
  scene.cameras.main.startFollow(player.sprite, true, 0.1, 0.1);
  // RO camera reveals ~12-15 tiles wide — zoom out a touch.
  scene.cameras.main.setZoom(0.85);

  // Tab cycles to the nearest live monster as the new attack target.
  scene.input.keyboard.on('keydown-TAB', (e) => {
    if (e.preventDefault) e.preventDefault();
    if (!player || player.dead) return;
    let best = null, bestDist = Infinity;
    for (const m of bloblings) {
      if (!m.alive || m === player.attackTarget) continue;
      const d = Math.hypot(m.sprite.x - player.sprite.x, m.sprite.y - player.sprite.y);
      if (d < bestDist) { bestDist = d; best = m; }
    }
    if (best) {
      player.startAttacking(best);
      ui.message(`Target: ${best.cfg.name} Lv.${best.level}`);
    }
  });

  // Shift+R wipes localStorage save and reloads (for testing / new run).
  scene.input.keyboard.on('keydown-R', (e) => {
    if (e.shiftKey) {
      localStorage.removeItem(SAVE_KEY);
      ui.message('Save wiped. Reloading...');
      setTimeout(() => location.reload(), 400);
    }
  });

  // Hover cursor: crosshair when over a monster, default otherwise.
  scene.input.on('pointermove', (pointer) => {
    const wx = pointer.worldX, wy = pointer.worldY;
    let over = false;
    for (const b of bloblings) {
      if (!b.alive) continue;
      if (Math.hypot(wx - b.sprite.x, wy - b.sprite.y) < 40) { over = true; break; }
    }
    scene.input.setDefaultCursor(over ? 'crosshair' : 'default');
  });

  // Pointer: click a Blobling to fight it; click ground to walk there.
  scene.input.on('pointerdown', (pointer) => {
    // Block world clicks while the class overlay is up.
    if (classSelectOpen) return;
    // Ignore clicks that landed on a UI button (mute / autopilot / return /
    // class cards). Phaser's scene-level pointerdown fires regardless of
    // which interactive object was hit, so we check the hit list ourselves.
    const hits = scene.input.hitTestPointer(pointer);
    if (hits && hits.length > 0) return;
    const wx = pointer.worldX;
    const wy = pointer.worldY;

    let clicked = null;
    for (const b of bloblings) {
      if (!b.alive) continue;
      if (Math.hypot(wx - b.sprite.x, wy - b.sprite.y) < 50) { clicked = b; break; }
    }

    if (clicked) {
      player.startAttacking(clicked);
    } else {
      player.walkTo(wx, wy);
      showClickMarker(scene, wx, wy);
    }
  });

  // Day/night overlay (drawn over the world, under UI).
  dayNightOverlay = scene.add.rectangle(0, 0, GAME_W, GAME_H, 0x0a1a44, 0)
    .setOrigin(0, 0).setScrollFactor(0).setDepth(9000);

  // UI
  ui = new UIManager(scene);
  // Apply saved progress (level / exp / zeny / position) if present.
  const loaded = applySave();
  if (loaded) {
    ui.message(`Welcome back — Lv.${player.level}, ${player.zeny} zeny.`);
  } else {
    ui.message('Welcome to Grasslands Online!');
  }
  ui.message('Click monsters to attack. Click ground to walk.');
  ui.message('Click monsters to auto-fight. Tab targets nearest. Shift+R resets save.');
}

// ---------- Update loop ----------
function update(time, delta) {
  if (!player) return;
  player.update(time, delta);
  for (const b of bloblings) b.update(time, delta);

  // Zone change banner — fades in/out when crossing a biome boundary.
  if (player && !player.dead) {
    const tile_c = Math.floor(player.sprite.x / TILE_SIZE);
    const tile_r = Math.floor(player.sprite.y / TILE_SIZE);
    const z = getZone(tile_r, tile_c);
    if (z !== currentZone) {
      currentZone = z;
      showZoneBanner(player.scene, ZONE_LABELS[z] || z);
    }
  }

  // Autopilot: when on, pick the nearest safe live monster as attack target.
  // "Safe" = not aggressive, not boss-tier reward, maxHP not >1.5x player.
  if (autopilotOn && !player.dead &&
      (!player.attackTarget || !player.attackTarget.alive) &&
      time - autopilotLastScan > 400) {
    autopilotLastScan = time;
    let best = null, bestD = Infinity;
    const safeCap = player.maxHP * 1.5;
    for (const m of bloblings) {
      if (!m.alive) continue;
      const cfg = m.cfg || {};
      if (cfg.aggressive) continue;
      if (cfg.expReward >= 90) continue;
      if (m.maxHP > safeCap) continue;
      const d = Math.hypot(m.sprite.x - player.sprite.x, m.sprite.y - player.sprite.y);
      if (d < bestD) { bestD = d; best = m; }
    }
    if (best) player.startAttacking(best);
  }

  // Loot magnet + pickup: coins drift toward player, then auto-collect.
  if (player && !player.dead) {
    for (const l of loots) l.tickMagnet(player.sprite.x, player.sprite.y, delta);
    for (const l of loots) {
      if (l.tryPickup(player.sprite.x, player.sprite.y)) {
        if (l.kind === 'heal') {
          player.hp = Math.min(player.maxHP, player.hp + l.amount);
          ui.message(`Healed +${l.amount} HP.`);
        } else {
          player.zeny += l.amount;
          ui.message(`Picked up ${l.amount} zeny.`);
        }
        sfxPickup();
      }
    }
  }
  loots = loots.filter(l => l.alive);

  // Target ring follows current attack target.
  if (targetRing) {
    if (player && !player.dead && player.attackTarget && player.attackTarget.alive) {
      const t = player.attackTarget;
      targetRing.clear();
      targetRing.lineStyle(2, 0xff5555, 0.9);
      targetRing.strokeEllipse(t.sprite.x, t.sprite.y + 8, t.sprite.displayWidth * 1.1, t.sprite.displayHeight * 0.45);
      targetRing.setVisible(true);
    } else {
      targetRing.setVisible(false);
    }
  }

  // Day/night: cosine-driven darkness peaking at midnight.
  if (dayNightOverlay) {
    const t = (time % DAY_NIGHT_CYCLE_MS) / DAY_NIGHT_CYCLE_MS;
    const darkness = (1 - Math.cos(t * Math.PI * 2)) / 2; // 0..1..0
    dayNightOverlay.alpha = darkness * 0.45;
  }

  // Auto-save progress every few seconds.
  if (time - lastSaveAt > SAVE_INTERVAL_MS) {
    saveGame();
    lastSaveAt = time;
  }
  ui.update();

  // Y-sort: depth follows y position
  if (player.shadow) player.shadow.setDepth(player.groundY - 2);
  player.sprite.setDepth(player.sprite.y);
  for (const b of bloblings) {
    if (b.shadow) b.shadow.setDepth(b.sprite.y - 2);
    if (b.sprite) b.sprite.setDepth(b.sprite.y);
  }
}

// Replace near-white pixels with alpha=0 so sprites read as transparent.
function keyOutWhite(scene, key) {
  if (!scene.textures.exists(key)) return; // file not present — skip silently
  const src = scene.textures.get(key).getSourceImage();
  if (!src) return;
  const canvas = document.createElement('canvas');
  canvas.width = src.width;
  canvas.height = src.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(src, 0, 0);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235) d[i + 3] = 0;
  }
  ctx.putImageData(imgData, 0, 0);
  scene.textures.remove(key);
  scene.textures.addCanvas(key, canvas);
}

// ---------- Map ----------
// Center cross path. Everything else is plain grass; decorations scatter on top.
function getCellType(r, c) {
  const midRow = Math.floor(MAP_ROWS / 2);
  const midCol = Math.floor(MAP_COLS / 2);
  if (r === midRow && c === midCol) return 'path_cross';
  if (r === midRow) return 'path_h';
  if (c === midCol) return 'path_v';
  return 'grass';
}

// Zone layout: keep a central grasslands square around spawn, partition the
// outer ring into compass-aligned biomes. Tile coords (r, c) are 0..MAP_ROWS-1.
function getZone(r, c) {
  const midRow = Math.floor(MAP_ROWS / 2);
  const midCol = Math.floor(MAP_COLS / 2);
  const dr = r - midRow;
  const dc = c - midCol;
  const coreHalf = Math.floor(MAP_COLS * 0.18); // ~9 tiles either side of center
  if (Math.abs(dr) <= coreHalf && Math.abs(dc) <= coreHalf) return 'grasslands';
  // Outside the core: pick biome by dominant axis.
  if (Math.abs(dr) >= Math.abs(dc)) {
    return dr < 0 ? 'forest' : 'desert';
  } else {
    return dc < 0 ? 'ruins' : 'riverside';
  }
}

function buildMap(scene) {
  for (let r = 0; r < MAP_ROWS; r++) {
    for (let c = 0; c < MAP_COLS; c++) {
      const type = getCellType(r, c);
      const zone = getZone(r, c);
      let idx;
      if (type === 'path_cross') idx = TILE.DIRT_OPEN;
      else if (type === 'path_h') idx = TILE.DIRT_H;
      else if (type === 'path_v') idx = TILE.DIRT_V;
      else {
        // Plain grass base. Only two variants for low contrast.
        idx = (Math.random() < 0.5) ? TILE.GRASS : TILE.THICK_GRASS;
      }

      // Pick tileset key by zone. Desert uses real sand tiles; other biomes
      // still tint grass until per-biome tilesets ship.
      const tilesetKey = (zone === 'desert' && scene.textures.exists('sand_tileset'))
        ? 'sand_tileset' : 'grass_tileset';

      const img = scene.add.image(
        c * TILE_SIZE + TILE_SIZE / 2,
        r * TILE_SIZE + TILE_SIZE / 2,
        tilesetKey, `tile_${idx}`
      );
      img.setDisplaySize(TILE_SIZE + 2, TILE_SIZE + 2);
      // Random flip + 180° rotation break grid repetition for free.
      if (type === 'grass') {
        if (Math.random() < 0.5) img.setFlipX(true);
        if (Math.random() < 0.5) img.setFlipY(true);
      }
      // Zone tint only when we're still drawing the grass tileset for a
      // non-grasslands biome. Real desert tiles are already the right palette.
      if (tilesetKey === 'grass_tileset') {
        const tint = ZONE_TINTS[zone];
        if (tint && tint !== 0xffffff) img.setTint(tint);
      }
      img.setDepth(-1000);
    }
  }
}

// Scatter deco sprites at sub-cell offsets so vegetation reads organic, not grid.
function buildDecorations(scene) {
  const flowerKeys = ['deco_flower_cluster_01','deco_flower_cluster_02','deco_flower_cluster_03','deco_flower_cluster_04'];
  const grassKeys  = ['deco_tallgrass_01','deco_tallgrass_02','deco_tallgrass_03'];
  const bushKeys   = ['bush_01','bush_02'];
  const mushroomKeys = ['mushroom_red_01','mushroom_brown_02'];
  const treeKeys   = ['tree_oak_01','tree_pine_02','tree_round_03'];

  // Block a disk of cells around (worldX, worldY) so A* routes around it.
  const blockCells = (worldX, worldY, cellRadius) => {
    if (!walkable) return;
    const cx = Math.floor(worldX / CELL_SIZE);
    const cy = Math.floor(worldY / CELL_SIZE);
    for (let dy = -cellRadius; dy <= cellRadius; dy++) {
      for (let dx = -cellRadius; dx <= cellRadius; dx++) {
        if (Math.hypot(dx, dy) > cellRadius + 0.3) continue;
        const r = cy + dy, c = cx + dx;
        if (r >= 0 && r < GRID_ROWS && c >= 0 && c < GRID_COLS) walkable[r][c] = false;
      }
    }
  };

  // Generic scatter. By default decorations are flat overlays under entities.
  // `alignBottom` lets us anchor the base of a sprite (trees/bushes/pond) so the
  // depth-sort plays nicely with the player and the visual sits on the ground.
  // `zoneFilter` restricts placement to one zone (string or array of zones).
  const place = (key, displayH, opts = {}) => {
    const tile_r = Phaser.Math.Between(0, MAP_ROWS - 1);
    const tile_c = Phaser.Math.Between(0, MAP_COLS - 1);
    if (getCellType(tile_r, tile_c) !== 'grass') return null;
    if (opts.zoneFilter) {
      const zone = getZone(tile_r, tile_c);
      const allowed = Array.isArray(opts.zoneFilter) ? opts.zoneFilter : [opts.zoneFilter];
      if (!allowed.includes(zone)) return null;
    }
    const jitterX = Phaser.Math.Between(-TILE_SIZE / 2 + 12, TILE_SIZE / 2 - 12);
    const jitterY = Phaser.Math.Between(-TILE_SIZE / 2 + 12, TILE_SIZE / 2 - 12);
    const x = tile_c * TILE_SIZE + TILE_SIZE / 2 + jitterX;
    const y = tile_r * TILE_SIZE + TILE_SIZE / 2 + jitterY;

    // Skip if the spot is already blocked (e.g. another tree).
    const cx = Math.floor(x / CELL_SIZE);
    const cy = Math.floor(y / CELL_SIZE);
    if (walkable && walkable[cy] && walkable[cy][cx] === false) return null;

    const img = scene.add.image(x, y, key);
    const baseScale = displayH / img.height;
    const scaleJitter = opts.noJitter ? 1 : Phaser.Math.FloatBetween(0.85, 1.15);
    img.setScale(baseScale * scaleJitter);
    if (opts.allowFlip !== false && Math.random() < 0.5) img.setFlipX(true);
    img.setAngle(opts.maxAngle ? Phaser.Math.Between(-opts.maxAngle, opts.maxAngle) : 0);

    if (opts.alignBottom) {
      img.setOrigin(0.5, 0.95);
      // Y-sort: the base of the sprite is what we sort against.
      img.setDepth(y);
    } else {
      img.setDepth(opts.depth ?? -500);
    }
    img.setAlpha(opts.alpha ?? 1);
    if (opts.tint) img.setTint(opts.tint);

    if (opts.blockRadius) blockCells(x, y, opts.blockRadius);
    return img;
  };

  const rockKeys = ['deco_rock_01','deco_rock_02','deco_rock_03'];

  // Grasslands (center) — original density, scaled up for the bigger core.
  for (let i = 0; i < 350; i++) place(Phaser.Utils.Array.GetRandom(grassKeys),     52, { alpha: 0.95, maxAngle: 18, zoneFilter: 'grasslands' });
  for (let i = 0; i < 180; i++) place(Phaser.Utils.Array.GetRandom(flowerKeys),    60, { maxAngle: 15, zoneFilter: 'grasslands' });
  for (let i = 0; i < 140; i++) place(Phaser.Utils.Array.GetRandom(mushroomKeys),  44, { maxAngle: 10, zoneFilter: 'grasslands' });
  for (let i = 0; i < 110; i++) place(Phaser.Utils.Array.GetRandom(bushKeys),      72, { maxAngle:  8, alignBottom: true, blockRadius: 1, zoneFilter: 'grasslands' });
  for (let i = 0; i <  60; i++) place(Phaser.Utils.Array.GetRandom(treeKeys),     180, { maxAngle:  4, alignBottom: true, blockRadius: 2, zoneFilter: 'grasslands' });
  for (let i = 0; i <   4; i++) place('pond_01',                                  220, { maxAngle:  0, alignBottom: true, blockRadius: 6, allowFlip: false, zoneFilter: 'grasslands' });

  // Forest (north) — heavy trees, dark bushes, mushrooms. Tinted darker green.
  const forestTint = 0x9bbf86;
  for (let i = 0; i < 320; i++) place(Phaser.Utils.Array.GetRandom(treeKeys),     200, { maxAngle:  4, alignBottom: true, blockRadius: 2, zoneFilter: 'forest', tint: forestTint });
  for (let i = 0; i < 180; i++) place(Phaser.Utils.Array.GetRandom(bushKeys),      78, { maxAngle:  8, alignBottom: true, blockRadius: 1, zoneFilter: 'forest', tint: forestTint });
  for (let i = 0; i < 220; i++) place(Phaser.Utils.Array.GetRandom(mushroomKeys),  48, { maxAngle: 10, zoneFilter: 'forest' });
  for (let i = 0; i < 200; i++) place(Phaser.Utils.Array.GetRandom(grassKeys),     54, { alpha: 0.9, maxAngle: 18, zoneFilter: 'forest', tint: forestTint });

  // Desert (south) — real sand tiles below, scatter cacti + dunes + sun-bleached rocks.
  const desertRockTint = 0xd9c08a;
  for (let i = 0; i < 200; i++) place(Phaser.Utils.Array.GetRandom(rockKeys),      54, { maxAngle: 12, alignBottom: true, blockRadius: 1, zoneFilter: 'desert', tint: desertRockTint });
  for (let i = 0; i < 140; i++) place('cactus_set',                                90, { maxAngle:  6, alignBottom: true, blockRadius: 1, zoneFilter: 'desert' });
  for (let i = 0; i <  60; i++) place('deco_sand_dune',                           120, { maxAngle:  0, alpha: 0.85, zoneFilter: 'desert', allowFlip: false });
  for (let i = 0; i <  40; i++) place(Phaser.Utils.Array.GetRandom(grassKeys),     32, { alpha: 0.4, maxAngle: 20, zoneFilter: 'desert', tint: 0xd6c178 });

  // Ruins (west) — heavy rocks, occasional dead bush. Greyish.
  const ruinTint = 0xc8c0b0;
  for (let i = 0; i < 300; i++) place(Phaser.Utils.Array.GetRandom(rockKeys),      58, { maxAngle: 14, alignBottom: true, blockRadius: 1, zoneFilter: 'ruins', tint: ruinTint });
  for (let i = 0; i <  80; i++) place(Phaser.Utils.Array.GetRandom(bushKeys),      66, { maxAngle:  6, alignBottom: true, blockRadius: 1, zoneFilter: 'ruins', tint: 0xa89878 });
  for (let i = 0; i < 120; i++) place(Phaser.Utils.Array.GetRandom(grassKeys),     46, { alpha: 0.7, maxAngle: 18, zoneFilter: 'ruins', tint: ruinTint });

  // Riverside (east) — ponds, tall grass, flowers, occasional tree.
  for (let i = 0; i <  18; i++) place('pond_01',                                  240, { maxAngle:  0, alignBottom: true, blockRadius: 7, allowFlip: false, zoneFilter: 'riverside' });
  for (let i = 0; i < 280; i++) place(Phaser.Utils.Array.GetRandom(grassKeys),     56, { alpha: 0.95, maxAngle: 18, zoneFilter: 'riverside' });
  for (let i = 0; i < 200; i++) place(Phaser.Utils.Array.GetRandom(flowerKeys),    60, { maxAngle: 15, zoneFilter: 'riverside' });
  for (let i = 0; i <  70; i++) place(Phaser.Utils.Array.GetRandom(treeKeys),     180, { maxAngle:  4, alignBottom: true, blockRadius: 2, zoneFilter: 'riverside' });

  // Always keep the player spawn cell + Healer cell walkable.
  const protect = (wx, wy) => {
    const cx = Math.floor(wx / CELL_SIZE), cy = Math.floor(wy / CELL_SIZE);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const r = cy + dy, c = cx + dx;
      if (r >= 0 && r < GRID_ROWS && c >= 0 && c < GRID_COLS) walkable[r][c] = true;
    }
  };
  protect(WORLD_W / 2, WORLD_H / 2);                  // spawn
}

// ---------- PlayerController ----------
class PlayerController {
  constructor(scene, x, y) {
    this.scene = scene;
    this.maxHP = 100;
    this.hp = 100;
    this.atk = 10;
    this.def = 0;
    this.exp = 0;
    this.zeny = 0;
    this.kills = 0;
    this.classId = null;   // 'swordsman' | 'mage' | 'archer'
    this.classTier = 0;    // 0 = unselected, 1..4 once chosen
    this.level = 1;
    this.dead = false;
    this.dir = 'south';
    this.frame = 'idle';
    this.attackPoseUntil = 0;
    this._specialReady = false;
    this._specialChargeAt = 0; // ms; charge complete after SPECIAL_COOLDOWN
    this._specialRing = null;
    this.stunUntil = 0;
    this.lastRegen = 0;

    // Tile-grid movement state.
    this.cellCol = Math.floor(x / CELL_SIZE);
    this.cellRow = Math.floor(y / CELL_SIZE);
    this.path = [];          // queue of {col,row}
    this.stepFromX = x;
    this.stepFromY = y;
    this.stepToX = x;
    this.stepToY = y;
    this.stepT = 1;          // 0..1, 1 = arrived
    this.stepIndex = 0;      // alternates walk/walk2 across cells
    this.attackTarget = null; // Blobling we're chasing

    this.sprite = scene.add.sprite(x, y, 'rookie_idle_south');
    this.basePScale = PLAYER_DISPLAY_H / this.sprite.height;
    this.sprite.setScale(this.basePScale);
    this.groundY = y;
    this.shadow = scene.add.ellipse(
      x,
      y + this.sprite.displayHeight * 0.36,
      this.sprite.displayWidth * 0.58,
      Math.max(8, this.sprite.displayHeight * 0.12),
      0x000000,
      0.24
    ).setOrigin(0.5);

    this.nameTag = scene.add.text(x, y, `Rookie Lv.${this.level}`, {
      fontSize: '14px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 1);
    this._refreshNameTag = () => {
      let title = 'Rookie';
      let color = '#ffffff';
      if (this.classId && CLASS_DEFS[this.classId]) {
        const cdef = CLASS_DEFS[this.classId];
        const tierIdx = Math.max(0, Math.min(cdef.tierNames.length - 1, this.classTier - 1));
        title = cdef.tierNames[tierIdx];
        color = cdef.nameColor;
      }
      this.nameTag.setText(`${title} Lv.${this.level}`);
      this.nameTag.setColor(color);
    };

    // HP bar above the player (matches monster bars; only shows when wounded).
    this.hpBarBg = scene.add.rectangle(x, y, 44, 5, 0x000000).setOrigin(0.5);
    this.hpBar = scene.add.rectangle(x, y, 44, 5, 0x44ff66).setOrigin(0, 0.5);
    this.hpBarBg.setVisible(false);
    this.hpBar.setVisible(false);
  }

  expNeeded() { return this.level * 100; }

  walkTo(worldX, worldY) {
    if (this.dead) return;
    this.attackTarget = null;
    const goalCol = clampCell(Math.floor(worldX / CELL_SIZE), GRID_COLS);
    const goalRow = clampCell(Math.floor(worldY / CELL_SIZE), GRID_ROWS);
    this._setPathTo(goalCol, goalRow);
  }

  startAttacking(target) {
    if (this.dead) return;
    this.attackTarget = target;
    this._repathToTarget();
  }

  _repathToTarget() {
    if (!this.attackTarget || !this.attackTarget.alive) return;
    // Walk to a cell adjacent to the target so we end up inside ATTACK_RANGE.
    const tCol = Math.floor(this.attackTarget.sprite.x / CELL_SIZE);
    const tRow = Math.floor(this.attackTarget.sprite.y / CELL_SIZE);
    const adj = findAdjacentReachableCell(this.cellCol, this.cellRow, tCol, tRow);
    if (adj) this._setPathTo(adj.col, adj.row);
  }

  _setPathTo(goalCol, goalRow) {
    const path = findPath(this.cellCol, this.cellRow, goalCol, goalRow);
    if (!path || path.length === 0) {
      this.path = [];
      return;
    }
    // Drop the first node (current cell) if present.
    if (path[0].col === this.cellCol && path[0].row === this.cellRow) path.shift();
    this.path = path.slice(0, MAX_PATH_LEN);
    // Kick off the first step from current position if we're not already moving.
    if (this.stepT >= 1) this._beginNextStep();
  }

  _beginNextStep() {
    if (this.path.length === 0) return;
    const next = this.path.shift();
    this.stepFromX = cellCenterX(this.cellCol);
    this.stepFromY = cellCenterY(this.cellRow);
    this.stepToX = cellCenterX(next.col);
    this.stepToY = cellCenterY(next.row);
    this.cellCol = next.col;
    this.cellRow = next.row;
    this.stepT = 0;
    this.stepIndex += 1;
    this.dir = pickDirection(this.stepToX - this.stepFromX, this.stepToY - this.stepFromY);
    sfxFootstep();
  }

  // Pick which walk frame to show for the current step progress t∈[0,1].
  // The generated frame sets are inconsistent by direction, so choose only the
  // two frames that face the correct way for each direction.
  _pickWalkFrame(time, dir) {
    const cycleByDir = {
      south: ['walk2', 'idle', 'walk2', 'idle'],
      north: ['walk2', 'idle', 'walk3', 'idle'],
      east: ['walk', 'idle', 'walk2', 'idle'],
      west: ['walk', 'idle', 'walk2', 'idle'],
      southeast: ['walk', 'idle', 'walk2', 'idle'],
      southwest: ['walk', 'idle', 'walk2', 'idle'],
      northeast: ['walk', 'idle', 'walk2', 'idle'],
      northwest: ['walk', 'idle', 'walk2', 'idle'],
    };
    const cycle = cycleByDir[dir] || cycleByDir.south;
    // RO-like sprites use a timer-driven animation state. Keep animation timing
    // independent of the 32px path cell, with idle as a pass pose between feet.
    const idx = Math.floor(time / WALK_FRAME_MS) % cycle.length;
    return cycle[idx];
  }

  _syncShadow() {
    this.shadow.setPosition(this.sprite.x, this.groundY + this.sprite.displayHeight * 0.36);
    this.shadow.setDisplaySize(this.sprite.displayWidth * 0.58, Math.max(8, this.sprite.displayHeight * 0.12));
  }

  update(time, delta) {
    if (this.dead) {
      this.sprite.setTexture('rookie_dead');
      this.sprite.setFlipX(false);
      this.sprite.setOrigin(0.5, 0.5);
      this.sprite.scaleY = this.basePScale;
      this._syncShadow();
      this.nameTag.setPosition(this.sprite.x, this.sprite.y - this.sprite.displayHeight / 2);
      return;
    }

    const stunned = time < this.stunUntil;

    // Auto-skill charge: once SPECIAL_COOLDOWN_MS passes, the next attack
    // gets a 2x damage buff with an upgraded class visual. Only kicks in
    // after a class has been chosen.
    if (this.classId && !this._specialReady &&
        time - this._specialChargeAt >= SPECIAL_COOLDOWN_MS) {
      this._specialReady = true;
      if (!this._specialRing) {
        this._specialRing = this.scene.add.circle(this.sprite.x, this.sprite.y, 26)
          .setStrokeStyle(3, 0xffe066, 0.9).setFillStyle().setDepth(this.sprite.y - 5);
      }
      this._specialRing.setVisible(true);
    }
    if (this._specialRing && this._specialRing.visible) {
      this._specialRing.setPosition(this.sprite.x, this.sprite.y + 10);
      this._specialRing.setDepth(this.sprite.y - 5);
      const pulse = 1 + Math.sin(time / 120) * 0.08;
      this._specialRing.setScale(pulse);
    }

    // Slow passive HP regen. Pauses while stunned (in combat hit recently).
    if (!stunned && this.hp < this.maxHP && time - this.lastRegen >= HP_REGEN_INTERVAL_MS) {
      this.lastRegen = time;
      const amount = Math.max(1, Math.floor(this.maxHP * HP_REGEN_PCT));
      this.hp = Math.min(this.maxHP, this.hp + amount);
    }

    // Advance the current step.
    if (!stunned && this.stepT < 1) {
      this.stepT = Math.min(1, this.stepT + delta / MS_PER_CELL);
      const t = this.stepT;
      const baseX = this.stepFromX + (this.stepToX - this.stepFromX) * t;
      const baseY = this.stepFromY + (this.stepToY - this.stepFromY) * t;
      this.sprite.x = baseX;
      this.groundY = baseY;

      // Full sine wave per step. Keep it subtle: RO-like walking should feel
      // grounded, not like a hopping tween.
      // Y-position bob (not origin shift) so the body genuinely lifts.
      const phase = t * Math.PI * 2;
      const lift = Math.abs(Math.sin(phase));
      this.sprite.y = baseY - lift * BOB_AMPLITUDE;
      this.sprite.setOrigin(0.5, 0.5);
      this.sprite.scaleY = this.basePScale * (1 - lift * STEP_SQUASH);

      // Frame cycle — direction-specific to avoid mixing front/back/side art.
      this.frame = this._pickWalkFrame(time, this.dir);

      if (this.stepT >= 1) {
        this.sprite.x = this.stepToX;
        this.sprite.y = this.stepToY;
        this.groundY = this.stepToY;
        this.sprite.scaleY = this.basePScale;
        // Start the next queued step if we have one.
        if (this.path.length > 0) this._beginNextStep();
      }
    }

    const moving = this.stepT < 1;
    const showingAttack = time < this.attackPoseUntil;

    if (!moving) this.frame = 'idle';

    if (showingAttack) {
      this.sprite.setTexture('rookie_attack');
      this.sprite.setFlipX(this.dir === 'west');
    } else {
      applyRookieTexture(this.sprite, this.dir, this.frame);
    }

    // Pursue / auto-attack a clicked target.
    if (this.attackTarget) {
      if (!this.attackTarget.alive) {
        this.attackTarget = null;
      } else {
        const dx = this.attackTarget.sprite.x - this.sprite.x;
        const dy = this.attackTarget.sprite.y - this.sprite.y;
        const d = Math.hypot(dx, dy);
        if (d <= ATTACK_RANGE) {
          // In range: stop walking, face target, swing on cooldown.
          this.path = [];
          if (this.stepT < 1) {
            // Snap to current step's destination so we settle on a cell.
            this.sprite.x = this.stepToX;
            this.sprite.y = this.stepToY;
            this.groundY = this.stepToY;
            this.stepT = 1;
            this.sprite.setOrigin(0.5, 0.5);
            this.sprite.scaleY = this.basePScale;
          }
          this.dir = pickDirection(dx, dy);
          attemptPlayerAttack(this.scene, this.attackTarget);
        } else if (this.stepT >= 1) {
          // Out of range, idle → repath toward target.
          this._repathToTarget();
        }
      }
    }

    this._syncShadow();
    const topY = this.sprite.y - this.sprite.displayHeight / 2;
    this.nameTag.setPosition(this.sprite.x, topY);
    // HP bar above player, only when not full.
    const wounded = this.hp < this.maxHP;
    this.hpBarBg.setVisible(wounded);
    this.hpBar.setVisible(wounded);
    if (wounded) {
      this.hpBarBg.setPosition(this.sprite.x, topY + 6);
      this.hpBar.setPosition(this.sprite.x - 22, topY + 6);
      this.hpBar.width = 44 * Math.max(0, this.hp / this.maxHP);
    }
  }

  takeDamage(amount) {
    if (this.dead) return;
    // Defense scales with level — min 1 dmg so combat never stalls.
    const dmg = Math.max(1, amount - this.def);
    this.hp -= dmg;
    this.stunUntil = this.scene.time.now + HIT_STUN_MS;
    spawnDamageNumber(this.scene, this.sprite.x, this.sprite.y - 20, dmg, 0xffffff);
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 0.3,
      duration: 80,
      yoyo: true,
    });
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
    }
  }

  die() {
    this.dead = true;
    this.path = [];
    this.stepT = 1;
    this.attackTarget = null;
    this.sprite.setOrigin(0.5, 0.5);
    this.sprite.scaleY = this.basePScale;
    // Death penalty: lose 5% of current level's EXP requirement.
    const penalty = Math.floor(this.expNeeded() * 0.05);
    this.exp = Math.max(0, this.exp - penalty);
    ui.message(`You died. Lost ${penalty} EXP.`);
    sfxDeath();
    this.scene.time.delayedCall(PLAYER_RESPAWN_MS, () => {
      const cx = Math.floor(GRID_COLS / 2);
      const cy = Math.floor(GRID_ROWS / 2);
      this.cellCol = cx;
      this.cellRow = cy;
      this.sprite.setPosition(cellCenterX(cx), cellCenterY(cy));
      this.groundY = this.sprite.y;
      this.stepFromX = this.stepToX = this.sprite.x;
      this.stepFromY = this.stepToY = this.sprite.y;
      this.hp = this.maxHP;
      this.dead = false;
    });
  }

  gainExp(amount) {
    if (this.dead) return;
    this.exp += amount;
    while (this.exp >= this.expNeeded()) {
      this.exp -= this.expNeeded();
      this.levelUp();
    }
  }

  levelUp() {
    this.level += 1;
    this.maxHP += 20;
    this.atk += 3;
    this.def += 1;
    this.hp = this.maxHP;
    ui.message(`LEVEL UP! Now Lv.${this.level} (+ATK +DEF)`);
    this._refreshNameTag();
    sfxLevelUp();
    // Class system: open chooser at Lv 10 the first time, otherwise check tier.
    if (this.level >= 10 && !this.classId && !classSelectOpen) {
      showClassSelect(this.scene);
    } else if (this.classId) {
      checkClassTierUpgrade(this);
    }
    saveGame();
    const txt = this.scene.add.text(this.sprite.x, this.sprite.y - 40, 'LEVEL UP!', {
      fontSize: '20px',
      color: '#ffff66',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);
    txt.setDepth(99999);
    this.scene.tweens.add({
      targets: txt,
      y: txt.y - 40,
      alpha: 0,
      duration: 1200,
      onComplete: () => txt.destroy(),
    });
  }
}

// ---------- Cell grid helpers ----------
function clampCell(v, max) { return Math.max(0, Math.min(max - 1, v)); }
function cellCenterX(col) { return col * CELL_SIZE + CELL_SIZE / 2; }
function cellCenterY(row) { return row * CELL_SIZE + CELL_SIZE / 2; }
function isWalkable(col, row) {
  if (col < 0 || row < 0 || col >= GRID_COLS || row >= GRID_ROWS) return false;
  return walkable[row][col];
}

// 8-direction A* from (sCol,sRow) → (gCol,gRow). Returns [{col,row}] including goal.
function findPath(sCol, sRow, gCol, gRow) {
  if (!isWalkable(gCol, gRow)) return null;
  if (sCol === gCol && sRow === gRow) return [{ col: sCol, row: sRow }];

  const key = (c, r) => r * GRID_COLS + c;
  const open = new Map();   // key → node
  const closed = new Set();
  const start = { col: sCol, row: sRow, g: 0, f: heuristic(sCol, sRow, gCol, gRow), parent: null };
  open.set(key(sCol, sRow), start);

  const dirs = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
  ];

  let iterations = 0;
  const maxIterations = 32000;
  while (open.size > 0 && iterations++ < maxIterations) {
    // Pop the node with the lowest f.
    let bestKey = null, bestNode = null;
    for (const [k, n] of open) {
      if (!bestNode || n.f < bestNode.f) { bestKey = k; bestNode = n; }
    }
    open.delete(bestKey);
    closed.add(bestKey);

    if (bestNode.col === gCol && bestNode.row === gRow) {
      // Reconstruct.
      const path = [];
      let cur = bestNode;
      while (cur) { path.unshift({ col: cur.col, row: cur.row }); cur = cur.parent; }
      return path;
    }

    for (const [dc, dr, cost] of dirs) {
      const nc = bestNode.col + dc;
      const nr = bestNode.row + dr;
      if (!isWalkable(nc, nr)) continue;
      // Block diagonal squeezes when both orthogonal neighbours are blocked.
      if (dc !== 0 && dr !== 0) {
        if (!isWalkable(bestNode.col + dc, bestNode.row) && !isWalkable(bestNode.col, bestNode.row + dr)) continue;
      }
      const k = key(nc, nr);
      if (closed.has(k)) continue;
      const g = bestNode.g + cost;
      const existing = open.get(k);
      if (!existing || g < existing.g) {
        open.set(k, {
          col: nc, row: nr,
          g, f: g + heuristic(nc, nr, gCol, gRow),
          parent: bestNode,
        });
      }
    }
  }
  return null;
}

function heuristic(c1, r1, c2, r2) {
  // Octile distance — admissible for 8-direction grids.
  const dc = Math.abs(c1 - c2);
  const dr = Math.abs(r1 - r2);
  return (dc + dr) + (Math.SQRT2 - 2) * Math.min(dc, dr);
}

// Pick a cell adjacent to (tCol,tRow) that's walkable; prefer the one closest to start.
function findAdjacentReachableCell(sCol, sRow, tCol, tRow) {
  const offsets = [[0,0],[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  let best = null, bestDist = Infinity;
  for (const [dc, dr] of offsets) {
    const c = tCol + dc, r = tRow + dr;
    if (!isWalkable(c, r)) continue;
    const d = Math.hypot(c - sCol, r - sRow);
    if (d < bestDist) { bestDist = d; best = { col: c, row: r }; }
  }
  return best;
}

function showClickMarker(scene, wx, wy) {
  if (!clickMarker) return;
  clickMarker.clear();
  clickMarker.lineStyle(3, 0x66ff66, 1);
  clickMarker.strokeCircle(wx, wy, 12);
  clickMarker.setAlpha(1);
  clickMarker.setVisible(true);
  scene.tweens.killTweensOf(clickMarker);
  scene.tweens.add({
    targets: clickMarker,
    alpha: 0,
    duration: 500,
    onComplete: () => clickMarker.setVisible(false),
  });
}

// ---------- Persistence (localStorage) ----------
function saveGame() {
  if (!player || player.dead) return;
  try {
    const data = {
      level: player.level, exp: player.exp,
      hp: player.hp, maxHP: player.maxHP,
      atk: player.atk, def: player.def, zeny: player.zeny,
      kills: player.kills,
      classId: player.classId, classTier: player.classTier,
      cellCol: player.cellCol, cellRow: player.cellRow,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) { /* localStorage full or disabled — ignore */ }
}

function loadGameSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function applySave() {
  const save = loadGameSave();
  if (!save) return false;
  player.level  = save.level  ?? player.level;
  player.exp    = save.exp    ?? 0;
  player.maxHP  = save.maxHP  ?? player.maxHP;
  player.hp     = Math.min(save.hp ?? player.maxHP, player.maxHP);
  player.atk    = save.atk    ?? player.atk;
  player.def    = save.def    ?? player.def;
  player.zeny   = save.zeny   ?? 0;
  player.kills  = save.kills  ?? 0;
  player.classId   = save.classId   ?? null;
  player.classTier = save.classTier ?? 0;
  // Reapply class tint on sprite + refresh name tag color/title.
  if (player.classId && CLASS_DEFS[player.classId]) {
    player.sprite.setTint(CLASS_DEFS[player.classId].tint);
  } else {
    player.sprite.clearTint();
  }
  if (player._refreshNameTag) player._refreshNameTag();
  if (Number.isInteger(save.cellCol) && Number.isInteger(save.cellRow)) {
    let col = save.cellCol, row = save.cellRow;
    // If the saved cell got blocked by new decorations, fall back to spawn.
    if (walkable && walkable[row] && walkable[row][col] === false) {
      col = Math.floor(GRID_COLS / 2);
      row = Math.floor(GRID_ROWS / 2);
    }
    player.cellCol = col;
    player.cellRow = row;
    player.sprite.setPosition(cellCenterX(col), cellCenterY(row));
    player.groundY = player.sprite.y;
    player.stepFromX = player.stepToX = player.sprite.x;
    player.stepFromY = player.stepToY = player.sprite.y;
  }
  return true;
}

// ---------- WebAudio SFX (no audio assets) ----------
let _audioCtx = null;
function audio() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}
function _tone(freq, dur, type = 'sine', vol = 0.07, startOffset = 0, endFreq = null) {
  try {
    const ctx = audio();
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime + startOffset;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq !== null) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur);
  } catch (e) { /* audio not available */ }
}

// Short filtered noise burst for thump/swing texture.
function _noise(dur, vol = 0.08, startOffset = 0, filterFreq = 1500) {
  try {
    const ctx = audio();
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime + startOffset;
    const bufSize = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(t0);
    src.stop(t0 + dur);
  } catch (e) { /* audio not available */ }
}

// Crunchy melee thwack: low thud + mid click + brief filtered noise burst.
function sfxHit() {
  _noise(0.06, 0.09, 0, 2200);
  _tone(180, 0.07, 'square', 0.09, 0, 90);   // descending thud
  _tone(420, 0.05, 'triangle', 0.06, 0.005);  // click overtone
}

// Satisfying critical: bright bell stack + power swoosh + bass impact.
function sfxCrit() {
  // Wide noise sweep
  _noise(0.18, 0.11, 0, 4000);
  // Bell-like upper harmonics
  _tone(1320, 0.35, 'triangle', 0.09, 0);
  _tone(1760, 0.32, 'triangle', 0.06, 0.01);
  _tone(880,  0.4,  'sine',     0.08, 0);
  _tone(659,  0.45, 'sine',     0.07, 0.02);
  // Deep impact bass
  _tone(110, 0.18, 'square', 0.1, 0, 55);
  // Sparkle tail
  _tone(2640, 0.22, 'sine', 0.04, 0.08);
}

function sfxMiss()     { _tone(180, 0.06, 'sawtooth', 0.04); }
function sfxLevelUp()  { _tone(523, 0.12, 'triangle', 0.1); _tone(659, 0.12, 'triangle', 0.1, 0.12); _tone(784, 0.2, 'triangle', 0.1, 0.24); }
function sfxPickup()   { _tone(880, 0.06, 'sine', 0.08); _tone(1320, 0.08, 'sine', 0.08, 0.06); }
function sfxHeal()     { _tone(660, 0.08, 'sine', 0.07); _tone(990, 0.1, 'sine', 0.06, 0.05); _tone(1320, 0.14, 'triangle', 0.05, 0.1); }
function sfxPlayerHit(){ _noise(0.08, 0.08, 0, 800); _tone(140, 0.12, 'sawtooth', 0.08); }
function sfxDeath()    { _tone(196, 0.4, 'sawtooth', 0.1, 0, 60); _tone(98, 0.5, 'sawtooth', 0.08, 0.2); }
// Subtle grass scuff per cell — adds groundedness.
function sfxFootstep() { _noise(0.04, 0.025, 0, 600); }

// 8-direction sector picker. East = 0°, South = 90°, West = ±180°, North = -90°.
function pickDirection(vx, vy) {
  if (vx === 0 && vy === 0) return 'south';
  const deg = Math.atan2(vy, vx) * 180 / Math.PI;
  if (deg >= -22.5 && deg < 22.5)  return 'east';
  if (deg >=  22.5 && deg < 67.5)  return 'southeast';
  if (deg >=  67.5 && deg < 112.5) return 'south';
  if (deg >= 112.5 && deg < 157.5) return 'southwest';
  if (deg >= 157.5 || deg < -157.5) return 'west';
  if (deg >= -157.5 && deg < -112.5) return 'northwest';
  if (deg >= -112.5 && deg < -67.5)  return 'north';
  return 'northeast';
}

// Map 8 directions → texture key + horizontal flip. West/SW/NW reuse E/SE/NE flipped.
const DIR_TEXTURE = {
  north:     { base: 'north',     flip: false },
  south:     { base: 'south',     flip: false },
  east:      { base: 'east',      flip: false },
  west:      { base: 'east',      flip: true  },
  southeast: { base: 'southeast', flip: false },
  southwest: { base: 'southeast', flip: true  },
  northeast: { base: 'northeast', flip: false },
  northwest: { base: 'northeast', flip: true  },
};

function applyRookieTexture(sprite, dir, frame) {
  const info = DIR_TEXTURE[dir] || DIR_TEXTURE.south;
  const frameSeg = (frame === 'walk')  ? 'walk_'
                : (frame === 'walk2') ? 'walk2_'
                : (frame === 'walk3') ? 'walk3_'
                : (frame === 'walk4') ? 'walk4_'
                : 'idle_';
  const classDef = (player && player.classId) ? CLASS_DEFS[player.classId] : null;
  let key = null;
  // Try the class-specific texture first; fall back to rookie if missing.
  if (classDef) {
    const candidate = classDef.spritePrefix + frameSeg + info.base;
    if (sprite.scene.textures.exists(candidate)) key = candidate;
  }
  if (!key) key = 'rookie_' + frameSeg + info.base;
  sprite.setTexture(key);
  sprite.setFlipX(info.flip);
  // Clear tint when drawing real class art (palette already correct);
  // keep the class tint on rookie fallbacks so they still read as the class.
  if (classDef) {
    if (key.indexOf(classDef.spritePrefix) === 0) sprite.clearTint();
    else sprite.setTint(classDef.tint);
  }
}

// ---------- MonsterController ----------
// Most monsters only chase after being hit. Aggressive monsters can open combat.
class MonsterController {
  constructor(scene, x, y, typeId) {
    this.scene = scene;
    this.typeId = typeId;
    const cfg = MONSTER_TYPES[typeId];
    this.cfg = cfg;
    // Random level 1-3, weighted toward 1 unless a monster defines a fixed level.
    const lr = Math.random();
    this.level = cfg.fixedLevel || (lr < 0.65 ? 1 : (lr < 0.92 ? 2 : 3));
    const statLevel = cfg.noLevelScaling ? 1 : this.level;
    const hpMult = 1 + 0.5 * (statLevel - 1);
    const atkMult = 1 + 0.3 * (statLevel - 1);
    this.maxHP = Math.round(cfg.maxHP * hpMult);
    this.hp = this.maxHP;
    this.atk = Math.round(cfg.atk * atkMult);
    this.expReward = Math.round(cfg.expReward * this.level);
    this.speed = cfg.speed;
    this.alive = true;
    this.provoked = false;
    this.provokedUntil = 0;
    this.lastAttack = 0;
    this.wanderUntil = 0;
    this.wanderVx = 0;
    this.wanderVy = 0;

    this.sprite = scene.physics.add.sprite(x, y, cfg.idleKey);
    // Target on-screen height; setTexture across differently-sized source
    // PNGs (e.g. Bigfoot idle 1254px vs chase 512px) must recompute scale
    // from this, otherwise the sprite shrinks/grows when textures swap.
    this.targetDisplayH = BLOBLING_DISPLAY_H * (cfg.scaleMult || 1);
    const bScale = this.targetDisplayH / this.sprite.height;
    this.sprite.setScale(bScale);

    // Texture swap helper: keeps on-screen size constant when source PNGs
    // have different pixel heights (e.g. Bigfoot idle 1254 vs chase 512).
    this._setTex = (key) => {
      this.sprite.setTexture(key);
      const h = this.sprite.height || 1;
      this.sprite.setScale(this.targetDisplayH / h);
    };
    if (cfg.tint) this.sprite.setTint(cfg.tint);
    // Rare variants get a persistent pulsing aura ring under the sprite.
    if (cfg.rare) {
      this.auraRing = scene.add.circle(x, y + 8, 26)
        .setStrokeStyle(3, cfg.tint || 0xffe066, 0.9).setFillStyle();
      scene.tweens.add({
        targets: this.auraRing,
        scale: 1.4, alpha: 0.5,
        duration: 700, yoyo: true, repeat: -1,
      });
      // Big chat callout the first time the player gets one in view.
      if (typeof ui !== 'undefined' && ui) {
        ui.message(`★ A ${cfg.name} appeared!`);
      }
    }
    this.sprite.setCollideWorldBounds(true);
    this.shadow = scene.add.ellipse(
      x,
      y + this.sprite.displayHeight * 0.34,
      this.sprite.displayWidth * 0.78,
      Math.max(7, this.sprite.displayHeight * 0.14),
      0x000000,
      0.22
    ).setOrigin(0.5);

    this.nameTag = scene.add.text(x, y, `${cfg.name} Lv.${this.level}`, {
      fontSize: '12px',
      color: cfg.nameColor,
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 1);

    this.hpBarBg = scene.add.rectangle(x, y, 40, 5, 0x000000).setOrigin(0.5);
    this.hpBar = scene.add.rectangle(x, y, 40, 5, 0xff3333).setOrigin(0, 0.5);
  }

  _syncShadow() {
    this.shadow.setPosition(this.sprite.x, this.sprite.y + this.sprite.displayHeight * 0.34);
    if (this.auraRing) this.auraRing.setPosition(this.sprite.x, this.sprite.y + 8);
    this.shadow.setDisplaySize(this.sprite.displayWidth * 0.78, Math.max(7, this.sprite.displayHeight * 0.14));
  }

  update(time, delta) {
    if (!this.alive) return;

    const dx = player.sprite.x - this.sprite.x;
    const dy = player.sprite.y - this.sprite.y;
    const dist = Math.hypot(dx, dy);
    const playerAlive = !player.dead;

    if (this.cfg.aggressive && playerAlive && dist <= (this.cfg.aggroRange || BLOBLING_AGGRO_RANGE)) {
      this.provoked = true;
      this.provokedUntil = time + 500;
    }

    // Drop aggro after the cool-off window.
    if (this.provoked && time > this.provokedUntil) this.provoked = false;

    if (playerAlive && this.provoked) {
      if (dist > BLOBLING_ATTACK_RANGE) {
        this.sprite.setVelocity((dx / dist) * this.speed, (dy / dist) * this.speed);
        if (this.cfg.chaseKey) this._setTex(this.cfg.chaseKey);
      } else {
        this.sprite.setVelocity(0, 0);
        if (this.cfg.aggroKey) this._setTex(this.cfg.aggroKey);
        if (time - this.lastAttack > BLOBLING_ATTACK_COOLDOWN) {
          this.lastAttack = time;
          const hit = rollMonsterHit(this.atk);
          if (hit.miss) {
            spawnFloatText(this.scene, player.sprite.x, player.sprite.y - 20, 'MISS', 0xcccccc);
            sfxMiss();
          } else {
            if (this.cfg.attackKey) this._setTex(this.cfg.attackKey);
            if (this.cfg.oneShotBelowLevel && player.level < this.cfg.oneShotBelowLevel) {
              hit.amount = player.hp + player.def;
            }
            player.takeDamage(hit.amount);
            sfxPlayerHit();
          }
        }
      }
    } else {
      // Passive wander.
      if (time > this.wanderUntil) {
        this.wanderUntil = time + 1500 + Math.random() * 1500;
        if (Math.random() < 0.4) {
          this.wanderVx = 0; this.wanderVy = 0;
        } else {
          const ang = Math.random() * Math.PI * 2;
          this.wanderVx = Math.cos(ang) * 40;
          this.wanderVy = Math.sin(ang) * 40;
        }
      }
      this.sprite.setVelocity(this.wanderVx, this.wanderVy);
      if (this.cfg.idleKey) this._setTex(this.cfg.idleKey);
    }

    this._syncShadow();
    const topY = this.sprite.y - this.sprite.displayHeight / 2;
    this.nameTag.setPosition(this.sprite.x, topY - 6);
    this.hpBarBg.setPosition(this.sprite.x, topY + 2);
    this.hpBar.setPosition(this.sprite.x - 20, topY + 2);
    this.hpBar.width = 40 * Math.max(0, this.hp / this.maxHP);
  }

  takeDamage(amount, opts = {}) {
    if (!this.alive) return;
    this.hp -= amount;
    // Getting hit provokes the monster for 5s.
    this.provoked = true;
    this.provokedUntil = this.scene.time.now + 5000;
    const color = opts.crit ? 0xffe14a : 0xff5555;
    spawnFloatText(this.scene, this.sprite.x, this.sprite.y - 20, amount, color, { crit: !!opts.crit });
    this._setTex(this.cfg.hitKey);
    this.scene.time.delayedCall(120, () => {
      if (this.alive) this._setTex(this.cfg.idleKey);
    });
    if (this.hp <= 0) this.die();
  }

  die() {
    this.alive = false;
    this.sprite.setVelocity(0, 0);
    this._setTex(this.cfg.deadKey);
    this._syncShadow();
    this.hpBar.setVisible(false);
    this.hpBarBg.setVisible(false);
    this.nameTag.setVisible(false);
    // Rare variant: grant N levels worth of EXP in one shot + huge fanfare.
    if (this.cfg.levelsAward) {
      const want = this.cfg.levelsAward;
      let total = 0;
      for (let i = 0; i < want; i++) total += (player.level + i) * 100;
      player.gainExp(total);
      ui.message(`★★ RARE KILL! +${want} LEVELS from ${this.cfg.name}! ★★`);
      const banner = this.scene.add.text(GAME_W / 2, GAME_H / 2, `★ +${want} LEVELS! ★`, {
        fontSize: '44px', fontStyle: 'bold', color: '#ffe066',
        stroke: '#5a3a00', strokeThickness: 6,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(99999);
      this.scene.tweens.add({
        targets: banner, alpha: 0, scale: 1.3, duration: 1800,
        onComplete: () => banner.destroy(),
      });
    } else {
      player.gainExp(this.expReward);
    }
    if (this.auraRing) { this.scene.tweens.killTweensOf(this.auraRing); this.auraRing.destroy(); this.auraRing = null; }
    player.kills += 1;
    // Heal on kill: 8% of maxHP, scaled up for bosses (expReward >= 90)
    // and rare kills (always full heal).
    const healPct = this.cfg.levelsAward ? 1.0 : (this.expReward >= 90 ? 0.30 : 0.08);
    const healAmt = Math.max(1, Math.round(player.maxHP * healPct));
    if (!player.dead && player.hp < player.maxHP) {
      player.hp = Math.min(player.maxHP, player.hp + healAmt);
      spawnFloatText(this.scene, player.sprite.x, player.sprite.y - 20, `+${healAmt}`, 0x66ff88);
      sfxHeal();
    }
    ui.message(`Killed ${this.cfg.name} (+${this.expReward} EXP, +${healAmt} HP)`);
    spawnFloatText(this.scene, this.sprite.x, this.sprite.y - 30, `+${this.expReward} EXP`, 0x66ff66, { fontSize: '14px' });

    // Drop a small zeny pile — scaled to monster reward.
    const zenyDrop = Math.max(1, Math.round(this.expReward * Phaser.Math.FloatBetween(0.6, 1.6)));
    loots.push(new LootDrop(this.scene, this.sprite.x, this.sprite.y + 10, zenyDrop, 'zeny'));
    // 15% chance of a green healing herb on top of zeny.
    if (Math.random() < 0.15) {
      const healAmt = 20 + Math.floor(Math.random() * 15);
      loots.push(new LootDrop(this.scene, this.sprite.x - 18, this.sprite.y + 14, healAmt, 'heal'));
    }

    this.scene.time.delayedCall(1500, () => {
      this.sprite.destroy();
      this.shadow.destroy();
      this.nameTag.destroy();
      this.hpBar.destroy();
      this.hpBarBg.destroy();
      const idx = bloblings.indexOf(this);
      if (idx >= 0) bloblings.splice(idx, 1);
    });

    this.scene.time.delayedCall(RESPAWN_MS, () => spawnMonster(this.scene, this.typeId));
  }
}

// ---------- LootDrop ----------
class LootDrop {
  constructor(scene, x, y, amount, kind = 'zeny') {
    this.scene = scene;
    this.x = x; this.y = y;
    this.amount = amount;
    this.kind = kind; // 'zeny' | 'heal'
    this.alive = true;
    this.bornAt = scene.time.now;
    const fill = kind === 'heal' ? 0x55dd55 : 0xffd24a;
    const rim  = kind === 'heal' ? 0x1b6b1b : 0x7a5a00;
    this.coin = scene.add.circle(x, y - 10, 8, fill).setStrokeStyle(2, rim);
    this.coin.setDepth(y);
    // Drop bounce.
    scene.tweens.add({
      targets: this.coin, y: y, duration: 250,
      ease: 'Bounce.easeOut',
    });
    // Subtle pulse so it's visible in grass.
    scene.tweens.add({
      targets: this.coin, scale: 1.15,
      duration: 600, yoyo: true, repeat: -1,
    });
  }

  tickMagnet(px, py, delta) {
    if (!this.alive) return;
    // Wait for bounce to settle before pulling.
    if (this.scene.time.now - this.bornAt < 250) return;
    const dx = px - this.x, dy = py - this.y;
    const d = Math.hypot(dx, dy);
    if (d > LOOT_MAGNET_RADIUS || d < 1) return;
    const step = LOOT_MAGNET_SPEED * (delta / 1000);
    const k = Math.min(step / d, 1);
    this.x += dx * k;
    this.y += dy * k;
    this.coin.x = this.x;
    this.coin.y = this.y;
    this.coin.setDepth(this.y);
  }

  tryPickup(px, py) {
    if (!this.alive) return false;
    // Brief grace so it doesn't snap into pickup mid-bounce.
    if (this.scene.time.now - this.bornAt < 250) return false;
    if (Math.hypot(this.x - px, this.y - py) <= LOOT_PICKUP_RADIUS) {
      this.alive = false;
      this.scene.tweens.killTweensOf(this.coin);
      this.scene.tweens.add({
        targets: this.coin, alpha: 0, y: this.y - 20, duration: 200,
        onComplete: () => this.coin.destroy(),
      });
      return true;
    }
    return false;
  }
}

function showZoneBanner(scene, label) {
  if (!scene || !label) return;
  const txt = scene.add.text(GAME_W / 2, 120, `Entering ${label}`, {
    fontSize: '32px', fontStyle: 'bold', color: '#ffe066',
    stroke: '#000', strokeThickness: 5,
  }).setOrigin(0.5).setScrollFactor(0).setDepth(10500).setAlpha(0);
  scene.tweens.add({
    targets: txt, alpha: 1, duration: 350,
    yoyo: true, hold: 1200,
    onComplete: () => txt.destroy(),
  });
}

// ---------- Class selection overlay ----------
// Renders 3 cards centered on screen at GAME_W x GAME_H. Cards use cardImage
// keys if loaded, otherwise a tinted colored panel placeholder.
function showClassSelect(scene) {
  if (classSelectOpen) return;
  classSelectOpen = true;
  const cont = scene.add.container(0, 0).setScrollFactor(0).setDepth(20000);
  const closeOverlay = () => {
    if (!classSelectOpen) return;
    cont.destroy();
    classSelectOpen = false;
  };
  // Dark overlay catches input below the cards so the world freezes.
  const bg = scene.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.78)
    .setOrigin(0, 0).setScrollFactor(0).setInteractive();
  bg.on('pointerdown', (p, lx, ly, ev) => { ev && ev.stopPropagation && ev.stopPropagation(); });
  cont.add(bg);

  // Close (X) button top-right of the overlay — stay novice / change mind later.
  const closeBtn = scene.add.text(GAME_W - 40, 30, '✕', {
    fontSize: '32px', fontStyle: 'bold', color: '#ffffff',
    stroke: '#000', strokeThickness: 4,
  }).setOrigin(0.5);
  // Explicit hit area: Phaser's default hit-area generator ignores origin,
  // so origin-centered objects need a hand-supplied Geom.Rectangle.
  closeBtn.setInteractive(
    new Phaser.Geom.Rectangle(-22, -22, 44, 44),
    Phaser.Geom.Rectangle.Contains
  );
  closeBtn.input.cursor = 'pointer';
  closeBtn.setScrollFactor(0); // container scrollFactor doesn't propagate to children for input
  closeBtn.on('pointerover', () => closeBtn.setColor('#ffe066'));
  closeBtn.on('pointerout',  () => closeBtn.setColor('#ffffff'));
  closeBtn.on('pointerdown', () => { closeOverlay(); ui.message('Stayed as a Rookie. Open the Class button anytime.'); });
  cont.add(closeBtn);

  // Title — gold with a soft glow via stacked text strokes.
  const titleShadow = scene.add.text(GAME_W / 2, 80, 'CHOOSE YOUR PATH', {
    fontSize: '40px', fontStyle: 'bold', color: '#ffcc33',
    stroke: '#3b2400', strokeThickness: 8,
  }).setOrigin(0.5).setAlpha(0.45);
  const title = scene.add.text(GAME_W / 2, 80, 'CHOOSE YOUR PATH', {
    fontSize: '40px', fontStyle: 'bold', color: '#ffe066',
    stroke: '#5a3a00', strokeThickness: 4,
  }).setOrigin(0.5);
  scene.tweens.add({ targets: titleShadow, scale: 1.06, alpha: 0.7, duration: 900, yoyo: true, repeat: -1 });
  cont.add([titleShadow, title]);

  const ids = ['swordsman', 'mage', 'archer'];
  const cardW = 220, cardH = 320;
  const gap = 40;
  const totalW = ids.length * cardW + (ids.length - 1) * gap;
  const startX = (GAME_W - totalW) / 2;
  const baseY = 150;

  ids.forEach((id, i) => {
    const cdef = CLASS_DEFS[id];
    const cx = startX + i * (cardW + gap);
    const cy = baseY;

    // Card body — placeholder colored panel until real card images ship.
    const card = scene.add.rectangle(cx + cardW / 2, cy + cardH / 2, cardW, cardH, cdef.tint, 0.85)
      .setStrokeStyle(3, 0xffffff, 0.9);
    // Explicit hit area centered on the rectangle's origin (0.5, 0.5).
    card.setInteractive(
      new Phaser.Geom.Rectangle(-cardW / 2, -cardH / 2, cardW, cardH),
      Phaser.Geom.Rectangle.Contains
    );
    card.input.cursor = 'pointer';
    card.setScrollFactor(0);

    // Optional real card image if it was preloaded.
    let img = null;
    if (scene.textures.exists(cdef.cardImage)) {
      img = scene.add.image(cx + cardW / 2, cy + cardH / 2 - 30, cdef.cardImage);
      const scale = Math.min((cardW - 30) / img.width, (cardH - 120) / img.height);
      img.setScale(scale);
    }

    const nameText = scene.add.text(cx + cardW / 2, cy + cardH - 60, cdef.tierNames[0], {
      fontSize: '24px', fontStyle: 'bold', color: '#ffffff',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5);
    const flavor = scene.add.text(cx + cardW / 2, cy + cardH - 28, `"${cdef.flavor}"`, {
      fontSize: '13px', color: '#f4f4f4', fontStyle: 'italic',
      stroke: '#000', strokeThickness: 3, align: 'center', wordWrap: { width: cardW - 20 },
    }).setOrigin(0.5);

    cont.add(card);
    if (img) cont.add(img);
    cont.add([nameText, flavor]);

    // Hover lift + glow.
    const lift = () => {
      scene.tweens.add({ targets: [card, nameText, flavor, img].filter(Boolean),
        y: '-=10', duration: 120 });
      card.setStrokeStyle(4, 0xffe066, 1);
    };
    const drop = () => {
      scene.tweens.add({ targets: [card, nameText, flavor, img].filter(Boolean),
        y: '+=10', duration: 120 });
      card.setStrokeStyle(3, 0xffffff, 0.9);
    };
    card.on('pointerover', lift);
    card.on('pointerout', drop);
    card.on('pointerdown', () => {
      selectClass(scene, id, cont);
    });
  });
}

function selectClass(scene, id, container) {
  const cdef = CLASS_DEFS[id];
  if (!cdef) return;
  const isSwap = !!player.classId;
  player.classId = id;
  // First-time: set tier from current level's threshold (1 baseline, plus
  // any higher tier the player already qualifies for). On swap, recompute
  // the tier the same way so the title matches the player's level —
  // stats are NOT re-granted (tier bonuses are one-time per level).
  let tier = 1;
  for (const t of CLASS_TIER_THRESHOLDS) {
    if (player.level >= t.level) tier = Math.max(tier, t.tier);
  }
  player.classTier = tier;
  player.sprite.setTint(cdef.tint);
  player._refreshNameTag();

  // Dramatic full-screen flash.
  const flash = scene.add.rectangle(0, 0, GAME_W, GAME_H, 0xffffff, 1)
    .setOrigin(0, 0).setScrollFactor(0).setDepth(20100);
  scene.tweens.add({
    targets: flash, alpha: 0, duration: 450,
    onComplete: () => flash.destroy(),
  });

  container.destroy();
  classSelectOpen = false;
  const tierTitle = cdef.tierNames[tier - 1];
  ui.message(isSwap ? `You changed to ${tierTitle}!` : `You became a ${tierTitle}!`);
  sfxLevelUp();
  saveGame();
}

function checkClassTierUpgrade(player) {
  if (!player.classId) return;
  const cdef = CLASS_DEFS[player.classId];
  if (!cdef) return;
  // Walk thresholds in order; apply any whose level <= player and tier > current.
  for (const t of CLASS_TIER_THRESHOLDS) {
    if (t.tier <= player.classTier) continue;
    if (player.level < t.level) break;
    player.classTier = t.tier;
    player.maxHP += t.dHP;
    player.atk   += t.dAtk;
    player.hp = player.maxHP;
    const newTitle = cdef.tierNames[t.tier - 1];
    ui.message(`You ascend to ${newTitle}! (+${t.dHP} HP, +${t.dAtk} ATK)`);
    if (t.tier === 4) {
      const txt = player.scene.add.text(player.sprite.x, player.sprite.y - 60, 'LEGENDARY CLASS!', {
        fontSize: '22px', fontStyle: 'bold', color: '#ffe066',
        stroke: '#5a3a00', strokeThickness: 5,
      }).setOrigin(0.5).setDepth(99999);
      player.scene.tweens.add({
        targets: txt, y: '-=40', alpha: 0, duration: 1800,
        onComplete: () => txt.destroy(),
      });
    }
    player._refreshNameTag();
    sfxLevelUp();
  }
}

// 1% reroll: a regular mooham/moowaan spawn becomes its rare variant.
const RARE_VARIANTS = { mooham: 'rare_mooham', moowaan: 'rare_moowaan' };
const RARE_SPAWN_CHANCE = 0.01;

function spawnMonster(scene, typeId) {
  if (RARE_VARIANTS[typeId] && Math.random() < RARE_SPAWN_CHANCE) {
    typeId = RARE_VARIANTS[typeId];
  }
  const cfg = MONSTER_TYPES[typeId];
  if (cfg.count === 1 && bloblings.some(m => m.typeId === typeId && m.alive)) return;
  const allowedZones = cfg && cfg.zones;
  let x, y, tries = 0;
  let ok = false;
  while (!ok && tries++ < 60) {
    x = 200 + Math.random() * (WORLD_W - 400);
    y = 200 + Math.random() * (WORLD_H - 400);
    const minDist = cfg.minSpawnDistance || 300;
    if (player && Math.hypot(x - player.sprite.x, y - player.sprite.y) < minDist) continue;
    if (allowedZones) {
      const tile_c = Math.floor(x / TILE_SIZE);
      const tile_r = Math.floor(y / TILE_SIZE);
      if (!allowedZones.includes(getZone(tile_r, tile_c))) continue;
    }
    ok = true;
  }
  bloblings.push(new MonsterController(scene, x, y, typeId));
  spawnPuff(scene, x, y);
}

// Brief expanding white ring — used on monster respawn.
function spawnPuff(scene, x, y) {
  const c = scene.add.circle(x, y, 20, 0xffffff, 0.6);
  c.setDepth(y);
  scene.tweens.add({
    targets: c,
    scale: 2.2,
    alpha: 0,
    duration: 450,
    onComplete: () => c.destroy(),
  });
}

function attemptPlayerAttack(scene, target) {
  if (player.dead) return;
  const now = scene.time.now;
  if (now - lastPlayerAttack < PLAYER_ATTACK_COOLDOWN) return;
  const d = Math.hypot(target.sprite.x - player.sprite.x, target.sprite.y - player.sprite.y);
  if (d > ATTACK_RANGE) return;
  lastPlayerAttack = now;
  player.attackPoseUntil = now + 250;

  // Roll: miss → crit → normal.
  if (Math.random() < PLAYER_MISS_CHANCE) {
    spawnFloatText(scene, target.sprite.x, target.sprite.y - 20, 'MISS', 0xcccccc);
    sfxMiss();
    return;
  }
  const crit = Math.random() < PLAYER_CRIT_CHANCE;
  const variance = 1 + (Math.random() * 2 - 1) * DAMAGE_VARIANCE;
  let dmg = Math.max(1, Math.round(player.atk * variance * (crit ? CRIT_MULTIPLIER : 1)));
  const special = !!player._specialReady;
  if (special) {
    dmg *= 2;
    player._specialReady = false;
    player._specialChargeAt = now;
    if (player._specialRing) player._specialRing.setVisible(false);
  }
  spawnClassAttackFx(scene, player, target, special);
  target.takeDamage(dmg, { crit });
  if (crit) sfxCrit(); else sfxHit();
}

// Class-flavored attack visual. Cheap shapes, no art assets needed. Falls
// back to a small white impact when no class is chosen yet.
function spawnClassAttackFx(scene, pl, target, special = false) {
  const px = pl.sprite.x, py = pl.sprite.y - 12;
  const tx = target.sprite.x, ty = target.sprite.y - 10;
  const id = pl.classId;
  const mult = special ? 1.8 : 1;

  if (special) {
    spawnFloatText(scene, tx, ty - 36,
      id === 'swordsman' ? 'BASH!' : id === 'mage' ? 'METEOR!' : 'TRIPLE SHOT!',
      0xffe066, { fontSize: '22px' });
  }

  if (id === 'swordsman') {
    const arc = scene.add.graphics().setDepth(ty + 50);
    arc.lineStyle(6 * mult, special ? 0xffe066 : 0xffffff, 1);
    const rad = 36 * mult;
    arc.beginPath();
    arc.arc(tx, ty, rad, Math.PI * 0.85, Math.PI * 1.55, false);
    arc.strokePath();
    scene.tweens.add({
      targets: arc, alpha: 0, scale: 1.25, duration: 250,
      onComplete: () => arc.destroy(),
    });
  } else if (id === 'mage') {
    const orb = scene.add.circle(px, py, 9 * mult, special ? 0xff6633 : 0x66aaff, 0.95)
      .setStrokeStyle(2, special ? 0xffcc66 : 0xaaddff, 1).setDepth(ty + 50);
    scene.tweens.add({
      targets: orb, x: tx, y: ty, duration: 140,
      onComplete: () => {
        const burst = scene.add.circle(tx, ty, 12 * mult, special ? 0xff6633 : 0x66aaff, 0.7).setDepth(ty + 50);
        scene.tweens.add({ targets: burst, radius: 30 * mult, alpha: 0, duration: 240,
          onComplete: () => burst.destroy() });
        orb.destroy();
      },
    });
  } else if (id === 'archer') {
    // Triple arrows on special, single on normal.
    const shots = special ? 3 : 1;
    for (let i = 0; i < shots; i++) {
      const dy = (i - (shots - 1) / 2) * 12;
      const line = scene.add.graphics().setDepth(ty + 50);
      line.lineStyle(3, special ? 0xffaa33 : 0xffee66, 1);
      line.lineBetween(px, py + dy, tx, ty + dy);
      const tip = scene.add.circle(tx, ty + dy, 5, special ? 0xffaa33 : 0xffee66, 1).setDepth(ty + 50);
      scene.tweens.add({
        targets: [line, tip], alpha: 0, duration: 220,
        onComplete: () => { line.destroy(); tip.destroy(); },
      });
    }
  } else {
    const dot = scene.add.circle(tx, ty, 8, 0xffffff, 0.7).setDepth(ty + 50);
    scene.tweens.add({ targets: dot, scale: 2, alpha: 0, duration: 200,
      onComplete: () => dot.destroy() });
  }
}

// Roll monster damage on the player. No crits for monsters, only variance + miss.
function rollMonsterHit(monsterAtk) {
  if (Math.random() < MONSTER_MISS_CHANCE) return { miss: true, amount: 0 };
  const variance = 1 + (Math.random() * 2 - 1) * DAMAGE_VARIANCE;
  return { miss: false, amount: Math.max(1, Math.round(monsterAtk * variance)) };
}

// Generic floating text. Accepts a number or string. Crit bumps size + adds "!".
function spawnFloatText(scene, x, y, text, color, opts = {}) {
  const hex = '#' + color.toString(16).padStart(6, '0');
  const fontSize = opts.crit ? '22px' : (opts.fontSize || '16px');
  const display = (typeof text === 'number') ? `-${text}${opts.crit ? '!' : ''}` : text;
  const txt = scene.add.text(x, y, display, {
    fontSize,
    color: hex,
    stroke: '#000000',
    strokeThickness: opts.crit ? 4 : 3,
    fontStyle: opts.crit ? 'bold' : 'normal',
  }).setOrigin(0.5);
  txt.setDepth(99999);
  scene.tweens.add({
    targets: txt,
    y: y - (opts.crit ? 40 : 30),
    alpha: 0,
    duration: opts.crit ? 1000 : 800,
    onComplete: () => txt.destroy(),
  });
}

// Back-compat wrapper used by older call sites.
function spawnDamageNumber(scene, x, y, amount, color) {
  spawnFloatText(scene, x, y, amount, color);
}

// ---------- UIManager ----------
class UIManager {
  constructor(scene) {
    this.scene = scene;
    this.messages = [];

    // Bottom bar
    this.bar = scene.add.rectangle(0, GAME_H - 60, GAME_W, 60, 0x000000, 0.6)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(10000);

    // HP bar (left top)
    this.hpBg = scene.add.rectangle(20, GAME_H - 46, 200, 14, 0x333333)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(10001);
    this.hpFill = scene.add.rectangle(20, GAME_H - 46, 200, 14, 0xcc2222)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(10002);
    this.hpText = scene.add.text(120, GAME_H - 46, '', {
      fontSize: '12px', color: '#ffffff', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10003);

    // EXP bar (center)
    this.expBg = scene.add.rectangle(GAME_W / 2 - 150, GAME_H - 40, 300, 20, 0x333333)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(10001);
    this.expFill = scene.add.rectangle(GAME_W / 2 - 150, GAME_H - 40, 300, 20, 0x9933cc)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(10002);
    this.expText = scene.add.text(GAME_W / 2, GAME_H - 40, '', {
      fontSize: '14px', color: '#ffffff', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10003);

    // Level (right)
    this.lvlText = scene.add.text(GAME_W - 20, GAME_H - 28, 'Lv.1', {
      fontSize: '18px', color: '#ffff88', stroke: '#000', strokeThickness: 3,
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(10003);

    // Zeny (right, under level)
    this.zenyText = scene.add.text(GAME_W - 20, GAME_H - 8, 'Zeny: 0', {
      fontSize: '14px', color: '#ffd24a', stroke: '#000', strokeThickness: 3,
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(10003);

    // Mini-map top-right.
    this.miniW = 160;
    this.miniH = 160;
    this.miniX = GAME_W - this.miniW - 10;
    this.miniY = 10;
    this.miniBg = scene.add.rectangle(this.miniX, this.miniY, this.miniW, this.miniH, 0x000000, 0.55)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(10010);
    this.miniBorder = scene.add.rectangle(this.miniX, this.miniY, this.miniW, this.miniH)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(10012)
      .setStrokeStyle(2, 0xffffff, 0.9).setFillStyle();
    this.miniGfx = scene.add.graphics().setScrollFactor(0).setDepth(10011);

    // Music mute toggle — small button under the minimap.
    const btnW = 90, btnH = 26;
    const btnX = this.miniX + this.miniW - btnW;
    const btnY = this.miniY + this.miniH + 6;
    this.muteBg = scene.add.rectangle(btnX, btnY, btnW, btnH, 0x000000, 0.7)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(10010)
      .setStrokeStyle(2, 0xffffff, 0.8)
      .setInteractive({ useHandCursor: true });
    // Restore mute preference from localStorage.
    const MUTE_KEY = 'grasslands_mute_v1';
    let savedMute = false;
    try { savedMute = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { /* ignore */ }
    if (savedMute && scene.bgm) scene.bgm.setMute(true);
    this.muteText = scene.add.text(btnX + btnW / 2, btnY + btnH / 2,
      savedMute ? '♪ Music: OFF' : '♪ Music: ON', {
      fontSize: '13px', color: '#ffffff', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10011);
    this.muteBg.on('pointerdown', () => {
      const bgm = scene.bgm;
      if (!bgm) return;
      bgm.setMute(!bgm.mute);
      // If unmuting and not yet started (autoplay block), kick it off here.
      if (!bgm.mute && !bgm.isPlaying) {
        try {
          if (scene.sound.context && scene.sound.context.state === 'suspended') {
            scene.sound.context.resume();
          }
          bgm.play();
        } catch (e) { /* ignore */ }
      }
      this.muteText.setText(bgm.mute ? '♪ Music: OFF' : '♪ Music: ON');
      try { localStorage.setItem(MUTE_KEY, bgm.mute ? '1' : '0'); } catch (e) { /* ignore */ }
    });

    // Autopilot toggle — auto-targets nearest safe monster, avoids bosses
    // and overleveled enemies. Sits right below the mute button.
    const apY = btnY + btnH + 6;
    const AP_KEY = 'grasslands_autopilot_v1';
    try { autopilotOn = localStorage.getItem(AP_KEY) === '1'; } catch (e) { autopilotOn = false; }
    this.apBg = scene.add.rectangle(btnX, apY, btnW, btnH, autopilotOn ? 0x1f6b3a : 0x000000, 0.75)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(10010)
      .setStrokeStyle(2, 0xffffff, 0.8)
      .setInteractive({ useHandCursor: true });
    this.apText = scene.add.text(btnX + btnW / 2, apY + btnH / 2,
      autopilotOn ? '⚙ Auto: ON' : '⚙ Auto: OFF', {
      fontSize: '13px', color: '#ffffff', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10011);
    this.apBg.on('pointerdown', () => {
      autopilotOn = !autopilotOn;
      this.apText.setText(autopilotOn ? '⚙ Auto: ON' : '⚙ Auto: OFF');
      this.apBg.setFillStyle(autopilotOn ? 0x1f6b3a : 0x000000, 0.75);
      try { localStorage.setItem(AP_KEY, autopilotOn ? '1' : '0'); } catch (e) { /* ignore */ }
      ui.message(autopilotOn ? 'Autopilot ON — avoiding bosses + strong monsters.' : 'Autopilot OFF.');
    });

    // Return-to-spawn (Kafra warp). Instant teleport, no cost yet.
    const rsY = apY + btnH + 6;
    this.rsBg = scene.add.rectangle(btnX, rsY, btnW, btnH, 0x223366, 0.85)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(10010)
      .setStrokeStyle(2, 0xffffff, 0.8)
      .setInteractive({ useHandCursor: true });
    this.rsText = scene.add.text(btnX + btnW / 2, rsY + btnH / 2, '⌂ Return Home', {
      fontSize: '13px', color: '#ffffff', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10011);
    this.rsBg.on('pointerdown', () => {
      if (!player || player.dead) return;
      const cx = Math.floor(GRID_COLS / 2);
      const cy = Math.floor(GRID_ROWS / 2);
      player.attackTarget = null;
      player.path = [];
      player.cellCol = cx;
      player.cellRow = cy;
      const wx = cellCenterX(cx), wy = cellCenterY(cy);
      player.sprite.setPosition(wx, wy);
      player.groundY = wy;
      player.stepFromX = player.stepToX = wx;
      player.stepFromY = player.stepToY = wy;
      ui.message('Warped home.');
      sfxPickup();
    });

    // Change Class button — always visible. Below Lv 10 it just tells the
    // player to keep leveling. At Lv 10+ it opens the class chooser
    // (re-pickable at any time).
    const clY = rsY + btnH + 6;
    this.clBg = scene.add.rectangle(btnX, clY, btnW, btnH, 0x664422, 0.9)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(10010)
      .setStrokeStyle(2, 0xffe066, 1)
      .setInteractive({ useHandCursor: true });
    this.clText = scene.add.text(btnX + btnW / 2, clY + btnH / 2, '✦ Change Class', {
      fontSize: '13px', color: '#ffe066', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10011);
    this.clBg.on('pointerdown', () => {
      if (!player) return;
      if (player.level < 10) {
        ui.message(`Reach Lv.10 to choose a class. (Currently Lv.${player.level})`);
        return;
      }
      showClassSelect(scene);
    });

    // Cheat button — manually bump level by 1. Triggers normal levelUp() so
    // tier upgrades + class select prompt fire as if earned organically.
    const lvY = clY + btnH + 6;
    this.lvBg = scene.add.rectangle(btnX, lvY, btnW, btnH, 0x444444, 0.85)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(10010)
      .setStrokeStyle(2, 0xffffff, 0.7)
      .setInteractive({ useHandCursor: true });
    this.lvText = scene.add.text(btnX + btnW / 2, lvY + btnH / 2, '⇧ +1 Level', {
      fontSize: '13px', color: '#ffffff', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10011);
    this.lvBg.on('pointerdown', () => {
      if (!player || player.dead) return;
      player.levelUp();
    });

    // Boss HP bar (top of screen, hidden until a boss is engaged).
    const bbW = 520, bbH = 22;
    const bbX = (GAME_W - bbW) / 2;
    const bbY = 14;
    this.bossBg = scene.add.rectangle(bbX, bbY, bbW, bbH, 0x110000, 0.85)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(10005)
      .setStrokeStyle(2, 0xff5555, 1);
    this.bossFill = scene.add.rectangle(bbX, bbY, bbW, bbH, 0xff2222)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(10006);
    this.bossText = scene.add.text(bbX + bbW / 2, bbY + bbH / 2, '', {
      fontSize: '14px', fontStyle: 'bold', color: '#ffffff',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10007);
    this.bossBg.setVisible(false);
    this.bossFill.setVisible(false);
    this.bossText.setVisible(false);

    // Chat box
    this.chatBg = scene.add.rectangle(10, GAME_H - 220, 320, 150, 0x000000, 0.5)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(10000);
    this.chatText = scene.add.text(18, GAME_H - 215, '', {
      fontSize: '12px', color: '#ffffff', wordWrap: { width: 300 },
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(10001);
  }

  message(msg) {
    this.messages.push(msg);
    if (this.messages.length > 10) this.messages.shift();
    this.chatText.setText(this.messages.join('\n'));
  }

  update() {
    const hpPct = Math.max(0, player.hp / player.maxHP);
    this.hpFill.width = 200 * hpPct;
    this.hpText.setText(`HP ${player.hp}/${player.maxHP}`);

    const expPct = Math.max(0, Math.min(1, player.exp / player.expNeeded()));
    this.expFill.width = 300 * expPct;
    this.expText.setText(`EXP ${player.exp}/${player.expNeeded()}`);

    this.lvlText.setText(`Lv.${player.level}`);
    this.zenyText.setText(`Zeny: ${player.zeny}`);

    // Label flips between Choose / Change based on whether a class is set.
    // Always visible; the click handler gates by level.
    const wantedLbl = player.classId ? '✦ Change Class' : '✦ Choose Class';
    if (this.clText.text !== wantedLbl) this.clText.setText(wantedLbl);

    // Boss bar — show whenever any aggressive / boss-tier monster is alive
    // anywhere in the world. Picks the closest one when several are around.
    let boss = null, bossD = Infinity;
    for (const m of bloblings) {
      if (!m.alive) continue;
      const cfg = m.cfg || {};
      if (!cfg.aggressive && cfg.expReward < 90) continue;
      const d = Math.hypot(m.sprite.x - player.sprite.x, m.sprite.y - player.sprite.y);
      if (d < bossD) { bossD = d; boss = m; }
    }
    if (boss && bossD < 1200) {
      const bbW = 520;
      const pct = Math.max(0, boss.hp / boss.maxHP);
      this.bossFill.width = bbW * pct;
      this.bossText.setText(`${boss.cfg.name} Lv.${boss.level}   ${boss.hp} / ${boss.maxHP}`);
      this.bossBg.setVisible(true);
      this.bossFill.setVisible(true);
      this.bossText.setVisible(true);
    } else {
      this.bossBg.setVisible(false);
      this.bossFill.setVisible(false);
      this.bossText.setVisible(false);
    }

    this.drawMinimap();
  }

  drawMinimap() {
    const g = this.miniGfx;
    g.clear();
    const sx = this.miniW / WORLD_W;
    const sy = this.miniH / WORLD_H;
    // Zone backdrop — 5×5 sample grid blended with the dark bg so biomes read
    // at a glance without dominating the map.
    const samples = 16;
    const cellW = this.miniW / samples;
    const cellH = this.miniH / samples;
    const zoneColor = {
      grasslands: 0x6fa84a,
      forest:     0x355028,
      desert:     0xc8a85a,
      ruins:      0x807868,
      riverside:  0x4a8c9a,
    };
    for (let sr = 0; sr < samples; sr++) {
      for (let sc = 0; sc < samples; sc++) {
        const tile_r = Math.floor((sr + 0.5) / samples * MAP_ROWS);
        const tile_c = Math.floor((sc + 0.5) / samples * MAP_COLS);
        const z = getZone(tile_r, tile_c);
        g.fillStyle(zoneColor[z] || 0x555555, 0.55);
        g.fillRect(this.miniX + sc * cellW, this.miniY + sr * cellH, cellW + 1, cellH + 1);
      }
    }
    // Path cross (rough).
    g.fillStyle(0xb38a4a, 0.6);
    g.fillRect(this.miniX, this.miniY + this.miniH / 2 - 2, this.miniW, 4);
    g.fillRect(this.miniX + this.miniW / 2 - 2, this.miniY, 4, this.miniH);
    // Monsters.
    for (const m of bloblings) {
      if (!m.alive) continue;
      let color = 0xff5555;
      let r = 2;
      let outline = null;
      if (m.typeId === 'mooham') color = 0xffaa55;
      else if (m.typeId === 'moowaan') color = 0x55ff88;
      else if (m.typeId === 'cactling') color = 0xbce86a;
      else if (m.typeId === 'rare_mooham') { color = 0xffe066; r = 4; outline = 0xffffff; }
      else if (m.typeId === 'rare_moowaan') { color = 0x7cffb0; r = 4; outline = 0xffffff; }
      else if (m.typeId === 'boss_mooham') { color = 0xffff44; r = 4; }
      else if (m.typeId === 'bigfoot') { color = 0xff2222; r = 5; outline = 0x000000; }
      g.fillStyle(color, 1);
      g.fillCircle(this.miniX + m.sprite.x * sx, this.miniY + m.sprite.y * sy, r);
      if (outline !== null) {
        g.lineStyle(2, outline, 1);
        g.strokeCircle(this.miniX + m.sprite.x * sx, this.miniY + m.sprite.y * sy, r + 2);
      }
    }
    // Loot.
    g.fillStyle(0xffd24a, 1);
    for (const l of loots) {
      g.fillCircle(this.miniX + l.x * sx, this.miniY + l.y * sy, 2);
    }
    // Player on top.
    g.lineStyle(2, 0x000000, 1);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(this.miniX + player.sprite.x * sx, this.miniY + player.sprite.y * sy, 4);
    g.strokeCircle(this.miniX + player.sprite.x * sx, this.miniY + player.sprite.y * sy, 4);
  }
}
