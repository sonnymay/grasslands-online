// Grasslands Online — Phase 1 (single-player MVP)
// Phaser 3.70 — no build tools.

const GAME_W = 1024;
const GAME_H = 768;
const WORLD_W = 3200;
const WORLD_H = 3200;
const TILE_SIZE = 128;
const MAP_COLS = Math.ceil(WORLD_W / TILE_SIZE); // 25
const MAP_ROWS = Math.ceil(WORLD_H / TILE_SIZE);

// RO-style tile-grid movement. Cells are finer than tiles so paths feel smooth.
const CELL_SIZE = 32;
const GRID_COLS = Math.floor(WORLD_W / CELL_SIZE);
const GRID_ROWS = Math.floor(WORLD_H / CELL_SIZE);
const MS_PER_CELL = 160; // RO baseline is ~150ms per cell.
const MAX_PATH_LEN = 256;
const HIT_STUN_MS = 200;
const HP_REGEN_INTERVAL_MS = 3000;  // tick every 3s
const HP_REGEN_PCT = 0.02;          // 2% of maxHP per tick
const SP_REGEN_INTERVAL_MS = 3000;
const SP_REGEN_PCT = 0.04;          // SP regens faster than HP
const POWER_STRIKE_SP_COST = 10;
const POWER_STRIKE_MULT = 1.7;
const POWER_STRIKE_COOLDOWN = 1500;
const SELF_HEAL_SP_COST = 15;
const SELF_HEAL_AMOUNT_BASE = 30;
const SELF_HEAL_COOLDOWN = 3000;
// Source PNGs are ~1254px tall; we display the player ~96px and bloblings ~64px.
const PLAYER_DISPLAY_H = 96;
const BLOBLING_DISPLAY_H = 64;
const PLAYER_ATTACK_COOLDOWN = 1000;
// Combat randomness — RO-style feel.
const DAMAGE_VARIANCE = 0.2;       // ±20% on every hit
const PLAYER_CRIT_CHANCE = 0.08;   // 8% crit
const CRIT_MULTIPLIER = 2;
const PLAYER_MISS_CHANCE = 0.05;   // 5% whiff
const MONSTER_MISS_CHANCE = 0.10;  // 10% monsters miss player
const LOOT_PICKUP_RADIUS = 28;
const BLOBLING_ATTACK_COOLDOWN = 1500;
const BLOBLING_AGGRO_RANGE = 200;
const BLOBLING_ATTACK_RANGE = 80;
const BLOBLING_COUNT = 15;
const MOOHAM_COUNT = 10;

// Monster type catalog. Add new monsters here; spawn loop reads `count`.
const MONSTER_TYPES = {
  blobling: {
    name: 'Blobling',
    idleKey: 'blobling_idle', hitKey: 'blobling_hit', deadKey: 'blobling_dead',
    maxHP: 50, atk: 5, expReward: 10, speed: 80,
    nameColor: '#ffcccc', count: BLOBLING_COUNT,
  },
  mooham: {
    name: 'MooHam',
    idleKey: 'mooham_idle', hitKey: 'mooham_hit', deadKey: 'mooham_dead',
    maxHP: 80, atk: 8, expReward: 18, speed: 70,
    nameColor: '#ffd9a8', count: MOOHAM_COUNT,
  },
  boss_mooham: {
    name: 'Boss MooHam',
    idleKey: 'mooham_idle', hitKey: 'mooham_hit', deadKey: 'mooham_dead',
    maxHP: 240, atk: 16, expReward: 90, speed: 55,
    nameColor: '#ff9933', count: 1, scaleMult: 1.9,
  },
};
const ANIM_FRAME_MS = 180;
const BOB_AMPLITUDE = 3;     // px the body lifts on each step
const BOB_FREQ = 0.012;      // step phase per ms
const STEP_SQUASH = 0.06;    // horizontal squash on foot-down
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
let healer = null;
const DAY_NIGHT_CYCLE_MS = 120000; // 2-minute day/night loop
let lastSaveAt = 0;
const SAVE_KEY = 'grasslands_save_v1';
const SAVE_INTERVAL_MS = 3000;
let ui;
let lastPlayerAttack = 0;
let tileSliceW = 0;
let tileSliceH = 0;
let walkable = null;   // [row][col] bool — true if a player can stand on it
let clickMarker = null;

// ---------- Preload ----------
function preload() {
  this.load.image('rookie_idle_south', 'assets/sprites/rookie_idle_south.png');
  this.load.image('rookie_walk_south', 'assets/sprites/rookie_walk_south.png');
  this.load.image('rookie_idle_north', 'assets/sprites/rookie_idle_north.png');
  this.load.image('rookie_walk_north', 'assets/sprites/rookie_walk_north.png');
  this.load.image('rookie_idle_east', 'assets/sprites/rookie_idle_east.png');
  this.load.image('rookie_walk_east', 'assets/sprites/rookie_walk_east.png');
  this.load.image('rookie_walk2_south', 'assets/sprites/rookie_walk2_south.png');
  this.load.image('rookie_walk2_north', 'assets/sprites/rookie_walk2_north.png');
  this.load.image('rookie_walk2_east', 'assets/sprites/rookie_walk2_east.png');
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
  // Decorations
  for (let i = 1; i <= 4; i++) this.load.image(`deco_flower_cluster_0${i}`, `assets/decorations/deco_flower_cluster_0${i}.png`);
  for (let i = 1; i <= 3; i++) this.load.image(`deco_rock_0${i}`, `assets/decorations/deco_rock_0${i}.png`);
  for (let i = 1; i <= 3; i++) this.load.image(`deco_tallgrass_0${i}`, `assets/decorations/deco_tallgrass_0${i}.png`);
  this.load.image('grass_tileset', 'assets/tiles/grass_tileset.png');
}

// ---------- Create ----------
function create() {
  const scene = this;

  // Source PNGs lack alpha; key out near-white pixels to fake transparency.
  const spriteKeys = [
    'rookie_idle_south','rookie_walk_south','rookie_walk2_south',
    'rookie_idle_north','rookie_walk_north','rookie_walk2_north',
    'rookie_idle_east','rookie_walk_east','rookie_walk2_east',
    'rookie_idle_southeast','rookie_walk_southeast','rookie_walk2_southeast',
    'rookie_idle_northeast','rookie_walk_northeast','rookie_walk2_northeast',
    'rookie_attack','rookie_dead',
    'blobling_idle','blobling_hit','blobling_dead',
    'mooham_idle','mooham_hit','mooham_dead',
    'deco_flower_cluster_01','deco_flower_cluster_02','deco_flower_cluster_03','deco_flower_cluster_04',
    'deco_rock_01','deco_rock_02','deco_rock_03',
    'deco_tallgrass_01','deco_tallgrass_02','deco_tallgrass_03',
  ];
  for (const k of spriteKeys) keyOutWhite(scene, k);

  // Slice tileset into 16 frames (4x4) using actual image dimensions
  const tilesetImg = scene.textures.get('grass_tileset').getSourceImage();
  tileSliceW = Math.floor(tilesetImg.width / 4);
  tileSliceH = Math.floor(tilesetImg.height / 4);
  // Inset crop trims the thin white separator the source tileset bakes between tiles.
  const tileInset = Math.floor(tileSliceW * 0.04);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const idx = r * 4 + c;
      scene.textures.get('grass_tileset').add(
        `tile_${idx}`, 0,
        c * tileSliceW + tileInset, r * tileSliceH + tileInset,
        tileSliceW - tileInset * 2, tileSliceH - tileInset * 2
      );
    }
  }

  // World bounds + camera
  scene.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
  scene.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);

  // Build procedural map + walkable grid (every cell walkable for now).
  buildMap(scene);
  buildDecorations(scene);
  walkable = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    walkable.push(new Array(GRID_COLS).fill(true));
  }

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

  // Skill hotkey: 1 or Q → Power Strike on current attack target.
  scene.input.keyboard.on('keydown-ONE', () => player && player.powerStrike());
  scene.input.keyboard.on('keydown-Q',   () => player && player.powerStrike());
  scene.input.keyboard.on('keydown-TWO', () => player && player.selfHeal());
  scene.input.keyboard.on('keydown-W',   () => player && player.selfHeal());

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

  // Healer NPC slightly NW of spawn so it's visible right away.
  healer = new HealerNPC(scene, WORLD_W / 2 - 180, WORLD_H / 2 - 120);

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
  ui.message('Skills: 1/Q=Power Strike, 2/W=Self-Heal. Tab=target nearest. Shift+R=reset save.');
}

// ---------- Update loop ----------
function update(time, delta) {
  if (!player) return;
  player.update(time, delta);
  for (const b of bloblings) b.update(time, delta);
  if (healer) healer.update(time);

  // Loot pickup: walk over a coin to grab it.
  if (player && !player.dead) {
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
  player.sprite.setDepth(player.sprite.y);
  for (const b of bloblings) {
    if (b.sprite) b.sprite.setDepth(b.sprite.y);
  }
}

// Replace near-white pixels with alpha=0 so sprites read as transparent.
function keyOutWhite(scene, key) {
  const src = scene.textures.get(key).getSourceImage();
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

function buildMap(scene) {
  for (let r = 0; r < MAP_ROWS; r++) {
    for (let c = 0; c < MAP_COLS; c++) {
      const type = getCellType(r, c);
      let idx;
      if (type === 'path_cross') idx = TILE.DIRT_OPEN;
      else if (type === 'path_h') idx = TILE.DIRT_H;
      else if (type === 'path_v') idx = TILE.DIRT_V;
      else {
        // Plain grass base. Only two variants for low contrast.
        idx = (Math.random() < 0.5) ? TILE.GRASS : TILE.THICK_GRASS;
      }

      const img = scene.add.image(
        c * TILE_SIZE + TILE_SIZE / 2,
        r * TILE_SIZE + TILE_SIZE / 2,
        'grass_tileset', `tile_${idx}`
      );
      img.setDisplaySize(TILE_SIZE + 2, TILE_SIZE + 2);
      // Random flip + 180° rotation break grid repetition for free.
      if (type === 'grass') {
        if (Math.random() < 0.5) img.setFlipX(true);
        if (Math.random() < 0.5) img.setFlipY(true);
      }
      img.setDepth(-1000);
    }
  }
}

// Scatter deco sprites at sub-cell offsets so vegetation reads organic, not grid.
function buildDecorations(scene) {
  const flowerKeys = ['deco_flower_cluster_01','deco_flower_cluster_02','deco_flower_cluster_03','deco_flower_cluster_04'];
  const rockKeys = ['deco_rock_01','deco_rock_02','deco_rock_03'];
  const grassKeys = ['deco_tallgrass_01','deco_tallgrass_02','deco_tallgrass_03'];

  const place = (key, displayW, opts = {}) => {
    const tile_r = Phaser.Math.Between(0, MAP_ROWS - 1);
    const tile_c = Phaser.Math.Between(0, MAP_COLS - 1);
    const type = getCellType(tile_r, tile_c);
    // Skip paths so they stay readable.
    if (type !== 'grass') return;
    const jitterX = Phaser.Math.Between(-TILE_SIZE / 2 + 12, TILE_SIZE / 2 - 12);
    const jitterY = Phaser.Math.Between(-TILE_SIZE / 2 + 12, TILE_SIZE / 2 - 12);
    const x = tile_c * TILE_SIZE + TILE_SIZE / 2 + jitterX;
    const y = tile_r * TILE_SIZE + TILE_SIZE / 2 + jitterY;
    const img = scene.add.image(x, y, key);
    const baseScale = displayW / img.width;
    const scaleJitter = Phaser.Math.FloatBetween(0.8, 1.25);
    img.setScale(baseScale * scaleJitter);
    if (Math.random() < 0.5) img.setFlipX(true);
    img.setAngle(Phaser.Math.Between(-15, 15));
    // Below entities, above ground tiles.
    img.setDepth(opts.depth ?? -500);
    img.setAlpha(opts.alpha ?? 1);
  };

  // Density tuned for 25x25 map. Bump these to add more.
  for (let i = 0; i < 220; i++) place(Phaser.Utils.Array.GetRandom(grassKeys), 56, { alpha: 0.95 });
  for (let i = 0; i < 110; i++) place(Phaser.Utils.Array.GetRandom(flowerKeys), 64);
  // Rocks removed for now (looked out of place).
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
    this.maxSP = 50;
    this.sp = 50;
    this.lastSpRegen = 0;
    this.lastPowerStrike = 0;
    this.lastSelfHeal = 0;
    this.level = 1;
    this.dead = false;
    this.dir = 'south';
    this.frame = 'idle';
    this.attackPoseUntil = 0;
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

    this.nameTag = scene.add.text(x, y, 'Rookie', {
      fontSize: '14px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 1);

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
  }

  update(time, delta) {
    if (this.dead) {
      this.sprite.setTexture('rookie_dead');
      this.sprite.setFlipX(false);
      this.sprite.setOrigin(0.5, 0.5);
      this.sprite.scaleY = this.basePScale;
      this.nameTag.setPosition(this.sprite.x, this.sprite.y - this.sprite.displayHeight / 2);
      return;
    }

    const stunned = time < this.stunUntil;

    // Slow passive HP regen. Pauses while stunned (in combat hit recently).
    if (!stunned && this.hp < this.maxHP && time - this.lastRegen >= HP_REGEN_INTERVAL_MS) {
      this.lastRegen = time;
      const amount = Math.max(1, Math.floor(this.maxHP * HP_REGEN_PCT));
      this.hp = Math.min(this.maxHP, this.hp + amount);
    }
    // SP regen — same rule, slightly faster %.
    if (!stunned && this.sp < this.maxSP && time - this.lastSpRegen >= SP_REGEN_INTERVAL_MS) {
      this.lastSpRegen = time;
      const amount = Math.max(1, Math.floor(this.maxSP * SP_REGEN_PCT));
      this.sp = Math.min(this.maxSP, this.sp + amount);
    }

    // Advance the current step.
    if (!stunned && this.stepT < 1) {
      this.stepT = Math.min(1, this.stepT + delta / MS_PER_CELL);
      const t = this.stepT;
      this.sprite.x = this.stepFromX + (this.stepToX - this.stepFromX) * t;
      this.sprite.y = this.stepFromY + (this.stepToY - this.stepFromY) * t;

      // Foot-fall bob + squash, one cycle per cell.
      const phase = t * Math.PI;
      const bob = Math.sin(phase) * BOB_AMPLITUDE;
      this.sprite.setOrigin(0.5, 0.5 + bob / this.sprite.displayHeight);
      this.sprite.scaleY = this.basePScale * (1 - Math.sin(phase) * STEP_SQUASH);
      this.frame = (this.stepIndex % 2 === 0) ? 'walk' : 'walk2';

      if (this.stepT >= 1) {
        this.sprite.x = this.stepToX;
        this.sprite.y = this.stepToY;
        // Snap origin / scale back so idle / attack pose draws upright.
        this.sprite.setOrigin(0.5, 0.5);
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
    this.scene.cameras.main.shake(90, 0.004);
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
      this.stepFromX = this.stepToX = this.sprite.x;
      this.stepFromY = this.stepToY = this.sprite.y;
      this.hp = this.maxHP;
      this.sp = this.maxSP;
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

  powerStrike() {
    if (this.dead) return;
    if (!this.attackTarget || !this.attackTarget.alive) {
      ui.message('No target.');
      return;
    }
    if (this.sp < POWER_STRIKE_SP_COST) {
      ui.message('Not enough SP.');
      sfxMiss();
      return;
    }
    const now = this.scene.time.now;
    if (now - this.lastPowerStrike < POWER_STRIKE_COOLDOWN) return;
    const t = this.attackTarget;
    const dx = t.sprite.x - this.sprite.x;
    const dy = t.sprite.y - this.sprite.y;
    if (Math.hypot(dx, dy) > ATTACK_RANGE) {
      ui.message('Too far.');
      return;
    }
    this.lastPowerStrike = now;
    this.sp -= POWER_STRIKE_SP_COST;
    this.attackPoseUntil = now + 350;
    this.dir = pickDirection(dx, dy);

    // Always hits; can still crit.
    const crit = Math.random() < PLAYER_CRIT_CHANCE;
    const variance = 1 + (Math.random() * 2 - 1) * DAMAGE_VARIANCE;
    const dmg = Math.max(1, Math.round(this.atk * POWER_STRIKE_MULT * variance * (crit ? CRIT_MULTIPLIER : 1)));
    t.takeDamage(dmg, { crit });
    if (crit) sfxCrit(); else sfxHit();
    spawnFloatText(this.scene, this.sprite.x, this.sprite.y - 50, 'Power Strike!', 0x88ccff, { fontSize: '14px' });
    // Tiny blue flash on player.
    this.scene.tweens.add({ targets: this.sprite, tint: 0x88ccff, duration: 80, yoyo: true,
      onComplete: () => this.sprite.clearTint() });
  }

  selfHeal() {
    if (this.dead) return;
    if (this.sp < SELF_HEAL_SP_COST) {
      ui.message('Not enough SP.');
      sfxMiss();
      return;
    }
    const now = this.scene.time.now;
    if (now - this.lastSelfHeal < SELF_HEAL_COOLDOWN) return;
    if (this.hp >= this.maxHP) {
      ui.message('Already at full HP.');
      return;
    }
    this.lastSelfHeal = now;
    this.sp -= SELF_HEAL_SP_COST;
    // Scales slightly with level.
    const amt = SELF_HEAL_AMOUNT_BASE + (this.level - 1) * 5;
    this.hp = Math.min(this.maxHP, this.hp + amt);
    spawnFloatText(this.scene, this.sprite.x, this.sprite.y - 50, `+${amt}`, 0x66ffaa, { fontSize: '16px' });
    sfxPickup();
    // Green flash on player.
    this.scene.tweens.add({ targets: this.sprite, tint: 0x66ffaa, duration: 120, yoyo: true,
      onComplete: () => this.sprite.clearTint() });
  }

  levelUp() {
    this.level += 1;
    this.maxHP += 20;
    this.maxSP += 5;
    this.atk += 3;
    this.def += 1;
    this.hp = this.maxHP;
    this.sp = this.maxSP;
    ui.message(`LEVEL UP! Now Lv.${this.level} (+ATK +DEF)`);
    sfxLevelUp();
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
  const maxIterations = 8000;
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
      sp: player.sp, maxSP: player.maxSP,
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
  player.maxSP  = save.maxSP  ?? player.maxSP;
  player.sp     = Math.min(save.sp ?? player.maxSP, player.maxSP);
  if (Number.isInteger(save.cellCol) && Number.isInteger(save.cellRow)) {
    player.cellCol = save.cellCol;
    player.cellRow = save.cellRow;
    player.sprite.setPosition(cellCenterX(player.cellCol), cellCenterY(player.cellRow));
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
function _tone(freq, dur, type = 'sine', vol = 0.07, startOffset = 0) {
  try {
    const ctx = audio();
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime + startOffset;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur);
  } catch (e) { /* audio not available */ }
}
function sfxHit()      { _tone(280, 0.08, 'square', 0.08); }
function sfxCrit()     { _tone(540, 0.12, 'square', 0.1); _tone(800, 0.1, 'square', 0.08, 0.05); }
function sfxMiss()     { _tone(180, 0.06, 'sawtooth', 0.04); }
function sfxLevelUp()  { _tone(523, 0.12, 'triangle', 0.1); _tone(659, 0.12, 'triangle', 0.1, 0.12); _tone(784, 0.2, 'triangle', 0.1, 0.24); }
function sfxPickup()   { _tone(880, 0.06, 'sine', 0.08); _tone(1320, 0.08, 'sine', 0.08, 0.06); }
function sfxPlayerHit(){ _tone(180, 0.12, 'sawtooth', 0.07); }
function sfxDeath()    { _tone(196, 0.4, 'sawtooth', 0.1); _tone(98, 0.5, 'sawtooth', 0.08, 0.2); }

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
  const prefix = (frame === 'walk') ? 'rookie_walk_'
              : (frame === 'walk2') ? 'rookie_walk2_'
              : 'rookie_idle_';
  sprite.setTexture(prefix + info.base);
  sprite.setFlipX(info.flip);
}

// ---------- MonsterController ----------
// Passive AI: monsters only chase + attack the player after being hit
// (provoked). Aggro lapses ~5s after the last damage tick.
class MonsterController {
  constructor(scene, x, y, typeId) {
    this.scene = scene;
    this.typeId = typeId;
    const cfg = MONSTER_TYPES[typeId];
    this.cfg = cfg;
    // Random level 1-3, weighted toward 1.
    const lr = Math.random();
    this.level = lr < 0.65 ? 1 : (lr < 0.92 ? 2 : 3);
    const hpMult = 1 + 0.5 * (this.level - 1);
    const atkMult = 1 + 0.3 * (this.level - 1);
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
    const bScale = (BLOBLING_DISPLAY_H / this.sprite.height) * (cfg.scaleMult || 1);
    this.sprite.setScale(bScale);
    this.sprite.setCollideWorldBounds(true);

    this.nameTag = scene.add.text(x, y, `${cfg.name} Lv.${this.level}`, {
      fontSize: '12px',
      color: cfg.nameColor,
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 1);

    this.hpBarBg = scene.add.rectangle(x, y, 40, 5, 0x000000).setOrigin(0.5);
    this.hpBar = scene.add.rectangle(x, y, 40, 5, 0xff3333).setOrigin(0, 0.5);
  }

  update(time, delta) {
    if (!this.alive) return;

    const dx = player.sprite.x - this.sprite.x;
    const dy = player.sprite.y - this.sprite.y;
    const dist = Math.hypot(dx, dy);

    // Drop aggro after the cool-off window.
    if (this.provoked && time > this.provokedUntil) this.provoked = false;

    const playerAlive = !player.dead;
    if (playerAlive && this.provoked) {
      if (dist > BLOBLING_ATTACK_RANGE) {
        this.sprite.setVelocity((dx / dist) * this.speed, (dy / dist) * this.speed);
      } else {
        this.sprite.setVelocity(0, 0);
        if (time - this.lastAttack > BLOBLING_ATTACK_COOLDOWN) {
          this.lastAttack = time;
          const hit = rollMonsterHit(this.atk);
          if (hit.miss) {
            spawnFloatText(this.scene, player.sprite.x, player.sprite.y - 20, 'MISS', 0xcccccc);
            sfxMiss();
          } else {
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
    }

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
    this.sprite.setTexture(this.cfg.hitKey);
    this.scene.time.delayedCall(120, () => {
      if (this.alive) this.sprite.setTexture(this.cfg.idleKey);
    });
    if (this.hp <= 0) this.die();
  }

  die() {
    this.alive = false;
    this.sprite.setVelocity(0, 0);
    this.sprite.setTexture(this.cfg.deadKey);
    this.hpBar.setVisible(false);
    this.hpBarBg.setVisible(false);
    this.nameTag.setVisible(false);
    player.gainExp(this.expReward);
    ui.message(`Killed ${this.cfg.name} (+${this.expReward} EXP)`);
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
      this.nameTag.destroy();
      this.hpBar.destroy();
      this.hpBarBg.destroy();
      const idx = bloblings.indexOf(this);
      if (idx >= 0) bloblings.splice(idx, 1);
    });

    this.scene.time.delayedCall(RESPAWN_MS, () => spawnMonster(this.scene, this.typeId));
  }
}

// ---------- HealerNPC ----------
// Static friendly NPC near spawn. Walk close to fully restore HP + SP.
class HealerNPC {
  constructor(scene, x, y) {
    this.scene = scene;
    this.x = x; this.y = y;
    this.lastHeal = 0;
    this.body = scene.add.circle(x, y, 18, 0x4488ff).setStrokeStyle(3, 0xffffff);
    this.body.setDepth(y);
    this.cross = scene.add.text(x, y, '+', { fontSize: '24px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    this.cross.setDepth(y + 1);
    this.label = scene.add.text(x, y - 28, 'Healer', {
      fontSize: '12px', color: '#cce4ff', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);
    this.label.setDepth(y + 2);
  }

  update(time) {
    if (!player || player.dead) return;
    if (time - this.lastHeal < 5000) return;
    if (player.hp >= player.maxHP && player.sp >= player.maxSP) return;
    const d = Math.hypot(player.sprite.x - this.x, player.sprite.y - this.y);
    if (d < 50) {
      this.lastHeal = time;
      player.hp = player.maxHP;
      player.sp = player.maxSP;
      spawnFloatText(this.scene, player.sprite.x, player.sprite.y - 40, 'Restored!', 0x88ffaa, { fontSize: '14px' });
      ui.message('Healer restored your strength.');
      sfxLevelUp();
    }
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

function spawnMonster(scene, typeId) {
  let x, y, tries = 0;
  do {
    x = 200 + Math.random() * (WORLD_W - 400);
    y = 200 + Math.random() * (WORLD_H - 400);
    tries++;
  } while (
    player &&
    Math.hypot(x - player.sprite.x, y - player.sprite.y) < 300 &&
    tries < 20
  );
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
  target.takeDamage(dmg, { crit });
  if (crit) sfxCrit(); else sfxHit();
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

    // SP bar (left bottom, under HP)
    this.spBg = scene.add.rectangle(20, GAME_H - 28, 200, 14, 0x333333)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(10001);
    this.spFill = scene.add.rectangle(20, GAME_H - 28, 200, 14, 0x3388ff)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(10002);
    this.spText = scene.add.text(120, GAME_H - 28, '', {
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

    // Skill cooldown chips above EXP bar.
    const skillStyle = { fontSize: '12px', color: '#ffffff', stroke: '#000', strokeThickness: 3 };
    this.qSkillText = scene.add.text(GAME_W / 2 - 80, GAME_H - 64, '', skillStyle)
      .setOrigin(0.5).setScrollFactor(0).setDepth(10003);
    this.wSkillText = scene.add.text(GAME_W / 2 + 80, GAME_H - 64, '', skillStyle)
      .setOrigin(0.5).setScrollFactor(0).setDepth(10003);

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

    const spPct = Math.max(0, player.sp / player.maxSP);
    this.spFill.width = 200 * spPct;
    this.spText.setText(`SP ${player.sp}/${player.maxSP}`);

    const expPct = Math.max(0, Math.min(1, player.exp / player.expNeeded()));
    this.expFill.width = 300 * expPct;
    this.expText.setText(`EXP ${player.exp}/${player.expNeeded()}`);

    this.lvlText.setText(`Lv.${player.level}`);
    this.zenyText.setText(`Zeny: ${player.zeny}`);

    // Skill cooldown chips.
    const now = this.scene.time.now;
    const qLeft = Math.max(0, POWER_STRIKE_COOLDOWN - (now - player.lastPowerStrike));
    const wLeft = Math.max(0, SELF_HEAL_COOLDOWN    - (now - player.lastSelfHeal));
    this.qSkillText.setText(qLeft > 0 ? `[Q] ${(qLeft / 1000).toFixed(1)}s` : `[Q] Power Strike  ${POWER_STRIKE_SP_COST} SP`);
    this.qSkillText.setColor(player.sp < POWER_STRIKE_SP_COST ? '#888888' : (qLeft > 0 ? '#cccc66' : '#ffffff'));
    this.wSkillText.setText(wLeft > 0 ? `[W] ${(wLeft / 1000).toFixed(1)}s` : `[W] Self-Heal  ${SELF_HEAL_SP_COST} SP`);
    this.wSkillText.setColor(player.sp < SELF_HEAL_SP_COST ? '#888888' : (wLeft > 0 ? '#cccc66' : '#ffffff'));

    this.drawMinimap();
  }

  drawMinimap() {
    const g = this.miniGfx;
    g.clear();
    const sx = this.miniW / WORLD_W;
    const sy = this.miniH / WORLD_H;
    // Path cross (rough).
    g.fillStyle(0xb38a4a, 0.6);
    g.fillRect(this.miniX, this.miniY + this.miniH / 2 - 2, this.miniW, 4);
    g.fillRect(this.miniX + this.miniW / 2 - 2, this.miniY, 4, this.miniH);
    // Monsters.
    for (const m of bloblings) {
      if (!m.alive) continue;
      const color = m.typeId === 'mooham' ? 0xffaa55 : 0xff5555;
      g.fillStyle(color, 1);
      g.fillCircle(this.miniX + m.sprite.x * sx, this.miniY + m.sprite.y * sy, 2);
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
