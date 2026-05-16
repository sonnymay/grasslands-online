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
// Source PNGs are ~1254px tall; we display the player ~96px and bloblings ~64px.
const PLAYER_DISPLAY_H = 96;
const BLOBLING_DISPLAY_H = 64;
const PLAYER_ATTACK_COOLDOWN = 1000;
const BLOBLING_ATTACK_COOLDOWN = 1500;
const BLOBLING_AGGRO_RANGE = 200;
const BLOBLING_ATTACK_RANGE = 80;
const BLOBLING_COUNT = 5;
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
  this.load.image('rookie_attack', 'assets/sprites/rookie_attack.png');
  this.load.image('rookie_dead', 'assets/sprites/rookie_dead.png');
  this.load.image('blobling_idle', 'assets/sprites/blobling_idle.png');
  this.load.image('blobling_hit', 'assets/sprites/blobling_hit.png');
  this.load.image('blobling_dead', 'assets/sprites/blobling_dead.png');
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
    'rookie_attack','rookie_dead',
    'blobling_idle','blobling_hit','blobling_dead',
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
  walkable = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    walkable.push(new Array(GRID_COLS).fill(true));
  }

  // Ground click marker (small green ring) — appears at the target cell.
  clickMarker = scene.add.graphics();
  clickMarker.setDepth(-500);
  clickMarker.setVisible(false);

  // Player
  player = new PlayerController(scene, WORLD_W / 2, WORLD_H / 2);

  // Bloblings
  for (let i = 0; i < BLOBLING_COUNT; i++) {
    spawnBlobling(scene);
  }

  // Camera follow
  scene.cameras.main.startFollow(player.sprite, true, 0.1, 0.1);

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

  // UI
  ui = new UIManager(scene);
  ui.message('Welcome to Grasslands Online!');
  ui.message('Click Bloblings to attack. WASD/Arrows to move.');
}

// ---------- Update loop ----------
function update(time, delta) {
  if (!player) return;
  player.update(time, delta);
  for (const b of bloblings) b.update(time, delta);
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
function buildMap(scene) {
  // Path through center: horizontal across mid row, vertical down mid col
  const midRow = Math.floor(MAP_ROWS / 2);
  const midCol = Math.floor(MAP_COLS / 2);

  for (let r = 0; r < MAP_ROWS; r++) {
    for (let c = 0; c < MAP_COLS; c++) {
      let idx;
      const onEdge = (r <= 1 || r >= MAP_ROWS - 2 || c <= 1 || c >= MAP_COLS - 2);
      const onPathH = (r === midRow);
      const onPathV = (c === midCol);

      if (onPathH && onPathV) idx = TILE.DIRT_OPEN;
      else if (onPathH) idx = TILE.DIRT_H;
      else if (onPathV) idx = TILE.DIRT_V;
      else if (onEdge && Math.random() < 0.35) idx = (Math.random() < 0.5 ? TILE.ROCKS_SPARSE : TILE.ROCKS_DENSE);
      else {
        const roll = Math.random();
        if (roll < 0.06) idx = TILE.FLOWERS_COLOR;
        else if (roll < 0.14) idx = TILE.FLOWER;
        else if (roll < 0.20) idx = TILE.TALL_GRASS;
        else if (roll < 0.55) idx = TILE.THICK_GRASS;
        else idx = TILE.GRASS;
      }

      const img = scene.add.image(c * TILE_SIZE + TILE_SIZE / 2, r * TILE_SIZE + TILE_SIZE / 2, 'grass_tileset', `tile_${idx}`);
      // Slight overdraw to hide subpixel seams between neighbors.
      img.setDisplaySize(TILE_SIZE + 2, TILE_SIZE + 2);
      img.setDepth(-1000);
    }
  }
}

// ---------- PlayerController ----------
class PlayerController {
  constructor(scene, x, y) {
    this.scene = scene;
    this.maxHP = 100;
    this.hp = 100;
    this.atk = 10;
    this.exp = 0;
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
      } else if (!moving) {
        const d = Math.hypot(
          this.attackTarget.sprite.x - this.sprite.x,
          this.attackTarget.sprite.y - this.sprite.y
        );
        if (d <= ATTACK_RANGE) {
          // Face the target while attacking.
          this.dir = pickDirection(
            this.attackTarget.sprite.x - this.sprite.x,
            this.attackTarget.sprite.y - this.sprite.y
          );
          attemptPlayerAttack(this.scene, this.attackTarget);
        } else {
          this._repathToTarget();
        }
      }
    }

    this.nameTag.setPosition(this.sprite.x, this.sprite.y - this.sprite.displayHeight / 2);
  }

  takeDamage(amount) {
    if (this.dead) return;
    this.hp -= amount;
    this.stunUntil = this.scene.time.now + HIT_STUN_MS;
    spawnDamageNumber(this.scene, this.sprite.x, this.sprite.y - 20, amount, 0xffffff);
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
    ui.message('You died.');
    this.scene.time.delayedCall(PLAYER_RESPAWN_MS, () => {
      const cx = Math.floor(GRID_COLS / 2);
      const cy = Math.floor(GRID_ROWS / 2);
      this.cellCol = cx;
      this.cellRow = cy;
      this.sprite.setPosition(cellCenterX(cx), cellCenterY(cy));
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
    this.hp = this.maxHP;
    ui.message(`LEVEL UP! Now Lv.${this.level}`);
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

function pickDirection(vx, vy) {
  // Nearest cardinal from a velocity vector
  if (Math.abs(vx) > Math.abs(vy)) {
    return vx > 0 ? 'east' : 'west';
  } else {
    return vy > 0 ? 'south' : 'north';
  }
}

function applyRookieTexture(sprite, dir, frame) {
  // West = flipped east. Each direction has idle + walk + walk2 frames.
  const base = (dir === 'north') ? 'north'
            : (dir === 'south') ? 'south'
            : 'east';
  let key;
  if (frame === 'walk') key = `rookie_walk_${base}`;
  else if (frame === 'walk2') key = `rookie_walk2_${base}`;
  else key = `rookie_idle_${base}`;

  sprite.setTexture(key);
  sprite.setFlipX(dir === 'west');
}

// ---------- BloblingController ----------
class BloblingController {
  constructor(scene, x, y) {
    this.scene = scene;
    this.maxHP = 50;
    this.hp = 50;
    this.atk = 5;
    this.expReward = 10;
    this.alive = true;
    this.lastAttack = 0;
    this.wanderUntil = 0;
    this.wanderVx = 0;
    this.wanderVy = 0;

    this.sprite = scene.physics.add.sprite(x, y, 'blobling_idle');
    const bScale = BLOBLING_DISPLAY_H / this.sprite.height;
    this.sprite.setScale(bScale);
    this.sprite.setCollideWorldBounds(true);

    this.nameTag = scene.add.text(x, y, 'Blobling', {
      fontSize: '12px',
      color: '#ffcccc',
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

    const playerAlive = !player.dead;
    if (playerAlive && dist < BLOBLING_AGGRO_RANGE) {
      if (dist > BLOBLING_ATTACK_RANGE) {
        // Chase
        const speed = 80;
        this.sprite.setVelocity((dx / dist) * speed, (dy / dist) * speed);
      } else {
        this.sprite.setVelocity(0, 0);
        if (time - this.lastAttack > BLOBLING_ATTACK_COOLDOWN) {
          this.lastAttack = time;
          player.takeDamage(this.atk);
        }
      }
    } else {
      // Wander
      if (time > this.wanderUntil) {
        this.wanderUntil = time + 1500 + Math.random() * 1500;
        if (Math.random() < 0.4) {
          this.wanderVx = 0;
          this.wanderVy = 0;
        } else {
          const ang = Math.random() * Math.PI * 2;
          this.wanderVx = Math.cos(ang) * 40;
          this.wanderVy = Math.sin(ang) * 40;
        }
      }
      this.sprite.setVelocity(this.wanderVx, this.wanderVy);
    }

    // Update UI elements
    const topY = this.sprite.y - this.sprite.displayHeight / 2;
    this.nameTag.setPosition(this.sprite.x, topY - 6);
    this.hpBarBg.setPosition(this.sprite.x, topY + 2);
    this.hpBar.setPosition(this.sprite.x - 20, topY + 2);
    this.hpBar.width = 40 * Math.max(0, this.hp / this.maxHP);
  }

  takeDamage(amount) {
    if (!this.alive) return;
    this.hp -= amount;
    spawnDamageNumber(this.scene, this.sprite.x, this.sprite.y - 20, amount, 0xff5555);
    // Hit flash via swap texture briefly
    this.sprite.setTexture('blobling_hit');
    this.scene.time.delayedCall(120, () => {
      if (this.alive) this.sprite.setTexture('blobling_idle');
    });
    if (this.hp <= 0) this.die();
  }

  die() {
    this.alive = false;
    this.sprite.setVelocity(0, 0);
    this.sprite.setTexture('blobling_dead');
    this.hpBar.setVisible(false);
    this.hpBarBg.setVisible(false);
    this.nameTag.setVisible(false);
    player.gainExp(this.expReward);
    ui.message(`Killed Blobling (+${this.expReward} EXP)`);

    this.scene.time.delayedCall(1500, () => {
      this.sprite.destroy();
      this.nameTag.destroy();
      this.hpBar.destroy();
      this.hpBarBg.destroy();
      const idx = bloblings.indexOf(this);
      if (idx >= 0) bloblings.splice(idx, 1);
    });

    // Respawn new one after delay
    this.scene.time.delayedCall(RESPAWN_MS, () => spawnBlobling(this.scene));
  }
}

function spawnBlobling(scene) {
  // Spawn at random spot at least 300px from player
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
  bloblings.push(new BloblingController(scene, x, y));
}

function attemptPlayerAttack(scene, target) {
  if (player.dead) return;
  const now = scene.time.now;
  if (now - lastPlayerAttack < PLAYER_ATTACK_COOLDOWN) return;
  const d = Math.hypot(target.sprite.x - player.sprite.x, target.sprite.y - player.sprite.y);
  if (d > ATTACK_RANGE) return; // too far; player will walk closer
  lastPlayerAttack = now;
  player.attackPoseUntil = now + 250;
  target.takeDamage(player.atk);
}

function spawnDamageNumber(scene, x, y, amount, color) {
  const hex = '#' + color.toString(16).padStart(6, '0');
  const txt = scene.add.text(x, y, `-${amount}`, {
    fontSize: '16px',
    color: hex,
    stroke: '#000000',
    strokeThickness: 3,
  }).setOrigin(0.5);
  txt.setDepth(99999);
  scene.tweens.add({
    targets: txt,
    y: y - 30,
    alpha: 0,
    duration: 800,
    onComplete: () => txt.destroy(),
  });
}

// ---------- UIManager ----------
class UIManager {
  constructor(scene) {
    this.scene = scene;
    this.messages = [];

    // Bottom bar
    this.bar = scene.add.rectangle(0, GAME_H - 60, GAME_W, 60, 0x000000, 0.6)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(10000);

    // HP bar (left)
    this.hpBg = scene.add.rectangle(20, GAME_H - 40, 200, 20, 0x333333)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(10001);
    this.hpFill = scene.add.rectangle(20, GAME_H - 40, 200, 20, 0xcc2222)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(10002);
    this.hpText = scene.add.text(120, GAME_H - 40, '', {
      fontSize: '14px', color: '#ffffff', stroke: '#000', strokeThickness: 3,
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
    this.lvlText = scene.add.text(GAME_W - 20, GAME_H - 40, 'Lv.1', {
      fontSize: '20px', color: '#ffff88', stroke: '#000', strokeThickness: 3,
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(10003);

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
  }
}
