// Grasslands Online — Phase 1 (single-player MVP)
// Phaser 3.70 — no build tools.

const GAME_W = Math.max(1, Math.floor(window.innerWidth || 1280));
const GAME_H = Math.max(1, Math.floor(window.innerHeight || 720));
const UI_TEXT_RESOLUTION = Math.max(2, Math.min(3, window.devicePixelRatio || 2));
// World dimensions. Bumped from 6400 → 19200 (3× linear, 9× area). The
// tile renderer pre-builds one image per tile (MAP_COLS × MAP_ROWS), so
// going beyond this risks first-load lag and GPU memory pressure on
// low-end devices. True infinite scrolling would need chunk streaming
// (build/destroy tiles around the camera as the player moves).
const WORLD_W = 19200;
const WORLD_H = 19200;
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
// Monster population scales with world area. Original counts were tuned
// for a 6400×6400 map; the world is now 19200×19200 (9× area), so the
// per-type populations are scaled ~5× to keep encounter density similar
// without rebuilding the world every frame. Bosses stay rare (count 1).
const BLOBLING_COUNT = 150;
const MOOHAM_COUNT = 100;
const MOOWAAN_COUNT = 75;
const MOODENG_COUNT = 55;
const DUNE_BLOB_COUNT = 60;
const BIGFOOT_COUNT = 1;
const BIOME_BOSS_COUNT = 1;

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
  moodeng: {
    name: 'MooDeng',
    idleKey: 'moodeng_idle', hitKey: 'moodeng_hit', deadKey: 'moodeng_dead',
    maxHP: 95, atk: 7, expReward: 20, speed: 65,
    nameColor: '#ffc0dd', count: MOODENG_COUNT, scaleMult: 1.05,
    zones: ['riverside'],
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
    maxHP: 260, atk: 16, expReward: 110, speed: 55,
    nameColor: '#ff9933', count: 1, scaleMult: 1.9,
    zones: ['desert'], boss: true,
  },
  king_blobling: {
    name: 'King Blobling',
    idleKey: 'blobling_idle', hitKey: 'blobling_hit', deadKey: 'blobling_dead',
    maxHP: 160, atk: 10, expReward: 90, speed: 62,
    nameColor: '#ff99dd', count: BIOME_BOSS_COUNT, scaleMult: 1.7,
    tint: 0xff88cc, zones: ['grasslands'], minSpawnDistance: 1200, boss: true,
  },
  ruin_golem: {
    name: 'Ruin Golem',
    idleKey: 'mooham_idle', hitKey: 'mooham_hit', deadKey: 'mooham_dead',
    maxHP: 340, atk: 26, expReward: 170, speed: 42,
    nameColor: '#c8c0aa', count: BIOME_BOSS_COUNT, scaleMult: 2.0,
    tint: 0xaaa088, zones: ['ruins'], minSpawnDistance: 1600, boss: true,
  },
  river_warden: {
    name: 'River Warden',
    idleKey: 'moowaan_idle', hitKey: 'moowaan_hit', deadKey: 'moowaan_dead',
    maxHP: 300, atk: 22, expReward: 155, speed: 58,
    nameColor: '#88ddff', count: BIOME_BOSS_COUNT, scaleMult: 1.8,
    tint: 0x77ccff, zones: ['riverside'], minSpawnDistance: 1400, boss: true,
  },
  bigfoot: {
    name: 'Bigfoot',
    idleKey: 'bigfoot_idle', hitKey: 'bigfoot_hit', deadKey: 'bigfoot_dead',
    aggroKey: 'bigfoot_aggro', chaseKey: 'bigfoot_chase', attackKey: 'bigfoot_attack',
    maxHP: 900, atk: 220, expReward: 500, speed: 45,
    nameColor: '#ff4444', count: BIGFOOT_COUNT, scaleMult: 6.6,
    fixedLevel: 50, noLevelScaling: true, aggressive: true, aggroRange: 520, oneShotBelowLevel: 50,
    zones: ['forest'],
    minSpawnDistance: 2400, // keep him in far forest so new players don't walk into a one-shot
    boss: true,
  },
  trex: {
    name: 'T-Rex',
    idleKey: 'trex_idle', hitKey: 'trex_hit', deadKey: 'trex_dead',
    aggroKey: 'trex_aggro', chaseKey: 'trex_chase', attackKey: 'trex_attack',
    maxHP: 880, atk: 190, expReward: 520, speed: 50,
    nameColor: '#8ee06a', count: 1, scaleMult: 6.6,
    fixedLevel: 50, noLevelScaling: true, aggressive: true, aggroRange: 560, oneShotBelowLevel: 50,
    zones: ['desert'],
    minSpawnDistance: 2600,
    boss: true,
  },
  kaiju_titan: {
    name: 'Kaiju Titan',
    idleKey: 'kaiju_titan_idle', hitKey: 'kaiju_titan_hit', deadKey: 'kaiju_titan_dead',
    aggroKey: 'kaiju_titan_aggro', chaseKey: 'kaiju_titan_chase', attackKey: 'kaiju_titan_attack',
    maxHP: 1100, atk: 240, expReward: 650, speed: 42,
    nameColor: '#66ddff', count: 1, scaleMult: 6.6,
    fixedLevel: 50, noLevelScaling: true, aggressive: true, aggroRange: 600, oneShotBelowLevel: 50,
    zones: ['ruins'],
    minSpawnDistance: 2600,
    boss: true,
  },
};

const EQUIPMENT_DROPS = {
  king_blobling: { slot: 'armor', name: 'Gelatin Buckler', def: 4 },
  boss_mooham:  { slot: 'weapon', name: 'Ham Hammer', atk: 5 },
  ruin_golem:   { slot: 'armor', name: 'Ruin Plate', def: 8 },
  river_warden: { slot: 'weapon', name: 'Reed Spear', atk: 8 },
  bigfoot:      { slot: 'armor', name: 'Fur Guard', def: 10 },
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
    role: 'Melee tank — big slash, +HP',
    cardImage: 'swordsman_card',
    spritePrefix: 'swordsman_',
    tierSpritePrefixes: { 2: 'knight_' },
    tint: 0xff8866,
    nameColor: '#ff9966',
    tierNames: ['Swordsman', 'Knight', 'Lord Knight', 'Dragon Sovereign'],
  },
  mage: {
    flavor: 'The arcane calls you',
    role: 'Caster — fireball + meteor special',
    cardImage: 'mage_card',
    spritePrefix: 'mage_',
    tint: 0x99aaff,
    nameColor: '#aabbff',
    tierNames: ['Mage', 'Wizard', 'Archmage', 'Void Sorcerer'],
  },
  archer: {
    flavor: 'Swift and true',
    role: 'Ranged DPS — arrow + triple shot',
    cardImage: 'archer_card',
    spritePrefix: 'archer_',
    tierSpritePrefixes: { 2: 'hunter_' },
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

// Biome tints multiply the grass tileset for non-desert zones. Older
// values read as muddy/olive when grass green was multiplied by a
// desaturated colour. These are pushed toward richer, more saturated
// hues so each biome reads as a distinct mood at a glance.
const ZONE_TINTS = {
  grasslands: 0xf0f6d8,
  forest:     0x88b070, // mossy green, warmer than the old olive
  desert:     0xe8c878,
  ruins:      0xc2b89e, // warm sun-bleached stone instead of grey-mud
  riverside:  0xb8d8c8, // cool teal-mint rather than washed grey
};
const FLOOR_TILE_TINTS = {
  grasslands: 0xf2f7d8,
  forest:     0xd8e6bf,
  desert:     0xf2d28c,
  ruins:      0xd6cbb2,
  riverside:  0xd8ead6,
};
const ANIM_FRAME_MS = 180;
const WALK_FRAME_MS = 120;
const BOB_AMPLITUDE = 3;     // subtle lift; too much reads as bounce, not walking
const STEP_SQUASH = 0.04;    // tiny squash so feet stay visually planted
const ATTACK_RANGE = 100; // melee click-attack range (swordsman/no-class)
// Ranged classes attack from a distance without closing in. Archer outranges
// Mage. Used by playerAttackRange() below.
const MAGE_ATTACK_RANGE = 380;
const ARCHER_ATTACK_RANGE = 560;
function playerAttackRange() {
  if (!player || !player.classId) return ATTACK_RANGE;
  if (player.classId === 'archer') return ARCHER_ATTACK_RANGE;
  if (player.classId === 'mage') return MAGE_ATTACK_RANGE;
  return ATTACK_RANGE;
}
const RESPAWN_MS = 5000;
const BOSS_RESPAWN_MS = 60000;
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
  resolution: Math.max(1, Math.min(2, window.devicePixelRatio || 1)),
  scale: {
    // RESIZE makes the canvas match the browser viewport instead of scaling a
    // fixed 16:9 frame into letterbox bars. Camera zoom stays independent.
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
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
let worldDarkness = 0;      // 0 = high noon, 1 = midnight
let _nightAnnounced = false; // once-per-cycle "Night falls" announce
let targetRing = null;
const DAY_NIGHT_CYCLE_MS = 120000; // 2-minute day/night loop
let lastSaveAt = 0;
const SAVE_KEY = 'grasslands_save_v2';
const SAVE_INTERVAL_MS = 3000;
let ui;
let autopilotOn = false;
let autopilotLastScan = 0;
let lastSwayCull = 0; // throttles off-screen sway tween pause/resume sweep
let classSelectOpen = false;
let shopOpen = false;
let travelOpen = false;
let trophyOpen = false;
let hardMode = false; // doubles monster damage, EXP, and zeny drops
let hudCompact = false;
let minimapZoom = 1;
let activeQuests = []; // [{ monsterTypeId, monsterName, target, count, reward }]
let questChain = 0;
let bossRespawns = {};

const QUEST_MONSTER_POOL = ['blobling', 'mooham', 'moowaan', 'cactling'];
const QUEST_BOSS_POOL = ['king_blobling', 'boss_mooham', 'ruin_golem', 'river_warden'];
const QUEST_ZONE_POOL = ['grasslands', 'riverside', 'desert', 'ruins'];
const TROPHY_MILESTONES = [
  { total: 3,  label: 'Boss Hunter',  atk: 2 },
  { total: 10, label: 'Boss Breaker', def: 2 },
  { total: 25, label: 'MVP Soul',     maxHP: 30 },
];

// Compact thousands-separator. Used wherever zeny is printed.
function fmt(n) { return Math.floor(n).toLocaleString('en-US'); }
function colorValue(color, fallback = 0xffffff) {
  if (typeof color === 'number') return color;
  const parsed = parseInt(String(color).replace('#', ''), 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isBossCfg(cfg) { return !!(cfg && (cfg.boss || cfg.aggressive || cfg.expReward >= 90)); }

function scaledMonsterExp(monster) {
  const cfg = monster.cfg || {};
  if (isBossCfg(cfg) || cfg.levelsAward) return monster.expReward;
  const typicalLevel = monster.level || 1;
  const levelsOver = Math.max(0, player.level - typicalLevel);
  const mult = Math.max(0.3, Math.pow(0.7, levelsOver));
  return Math.max(1, Math.round(monster.expReward * mult));
}

// Cosmetic milestone title shown above the class/level nameTag. Pure
// derived state from existing player counters — no save schema bump.
// Highest-priority match wins (single title at a time).
function pickPlayerTitle(p) {
  if (!p) return null;
  const trophyN = p.bossTrophies ? Object.keys(p.bossTrophies).length : 0;
  const landmarkN = p.visitedLandmarks ? Object.keys(p.visitedLandmarks).length : 0;
  const totalLandmarks = (typeof landmarkTiles === 'function') ? landmarkTiles().length : 5;
  if (p.level >= 40) return { label: 'Veteran', color: '#ffd1ff' };
  if (trophyN >= 5)  return { label: 'Boss Hunter', color: '#ff8866' };
  if ((p.bestStreak || 0) >= 25) return { label: 'Streak Master', color: '#ffd24a' };
  if ((p.zeny || 0) >= 100000) return { label: 'Tycoon', color: '#ffe066' };
  if (landmarkN >= totalLandmarks) return { label: 'Plaza Wanderer', color: '#88c8ff' };
  if (p.classSwitches >= 3) return { label: 'Wayfarer', color: '#a0e8c8' };
  return null;
}

function awardHotStreak(monster, earnedExp) {
  if (!player || player.dead) return;
  player.hotStreak = (player.hotStreak || 0) + 1;
  if (player.hotStreak > (player.bestStreak || 0)) player.bestStreak = player.hotStreak;
  if (player.hotStreak % 5 !== 0) return;
  const tier = (player.hotStreak % 10 === 0) ? 10 : 5;
  const bonus = Math.max(25, Math.round(earnedExp * tier * 1.2));
  player.zeny += bonus;
  const label = `HOT STREAK x${player.hotStreak}! +${fmt(bonus)}z`;
  spawnFloatText(monster.scene, player.sprite.x, player.sprite.y - 58, label, 0xffd24a, { fontSize: tier === 10 ? '24px' : '20px' });
  const banner = monster.scene.add.text(GAME_W / 2, 170, label, {
    fontSize: tier === 10 ? '34px' : '28px',
    fontStyle: 'bold',
    color: '#ffe066',
    stroke: '#5a3a00',
    strokeThickness: 5,
  }).setOrigin(0.5).setScrollFactor(0).setDepth(19000).setAlpha(0);
  monster.scene.tweens.add({
    targets: banner,
    alpha: 1,
    duration: 220,
    yoyo: true,
    hold: tier === 10 ? 1150 : 850,
    onComplete: () => banner.destroy(),
  });
  if (tier === 10) sfxLevelUp(); else sfxPickup();
}

function rollNewQuest() {
  const canBossQuest = player && player.level >= 10 && !activeQuests.some(q => q.kind === 'boss');
  const zoneQuest = player && player.level >= 4 && !activeQuests.some(q => q.kind === 'zone') && Math.random() < 0.25;
  const bossQuest = !zoneQuest && canBossQuest && Math.random() < 0.25;
  const bornAt = Date.now();
  if (zoneQuest) {
    const zoneKey = QUEST_ZONE_POOL[Math.floor(Math.random() * QUEST_ZONE_POOL.length)];
    const target = 8;
    const reward = zoneKey === 'grasslands' ? 120 : 180;
    activeQuests.push({ kind: 'zone', zoneKey, zoneName: ZONE_LABELS[zoneKey] || zoneKey, target, count: 0, reward, baseReward: reward, bornAt, pityTier: 0 });
    if (typeof ui !== 'undefined' && ui) ui.message(`New quest: clear ${target} in ${ZONE_LABELS[zoneKey] || zoneKey} (${fmt(reward)} zeny).`);
    saveGame();
    return;
  }
  const pool = bossQuest ? QUEST_BOSS_POOL : QUEST_MONSTER_POOL;
  const id = pool[Math.floor(Math.random() * pool.length)];
  const cfg = MONSTER_TYPES[id];
  const target = bossQuest ? 1 : 10;
  const reward = bossQuest ? Math.round((cfg.expReward || 80) * 5) : Math.round((cfg.expReward || 10) * target * 1.5);
  activeQuests.push({ kind: bossQuest ? 'boss' : 'slay', monsterTypeId: id, monsterName: cfg.name, target, count: 0, reward, baseReward: reward, bornAt, pityTier: 0 });
  if (typeof ui !== 'undefined' && ui) {
    ui.message(`New quest: ${bossQuest ? 'hunt' : 'slay'} ${target} ${cfg.name} (${fmt(reward)} zeny).`);
  }
  saveGame();
}

// Quest pity timer: every 2 minutes past the 3-minute mark, bump the
// quest's reward by 25% of its base, capped at 3 tiers (+75%). Stops the
// player from being stuck farming a rare quest mob with no payoff bump.
function tickQuestPity() {
  if (!activeQuests.length) return;
  const now = Date.now();
  for (const q of activeQuests) {
    if (!q.bornAt) { q.bornAt = now; q.baseReward = q.baseReward || q.reward; q.pityTier = q.pityTier || 0; }
    const ageMs = now - q.bornAt;
    const ageMin = ageMs / 60000;
    let desiredTier = 0;
    if (ageMin >= 3) desiredTier = 1;
    if (ageMin >= 5) desiredTier = 2;
    if (ageMin >= 7) desiredTier = 3;
    if (desiredTier <= (q.pityTier || 0)) continue;
    q.pityTier = desiredTier;
    const base = q.baseReward || q.reward;
    q.reward = Math.round(base * (1 + 0.25 * desiredTier));
    const name = q.kind === 'zone' ? q.zoneName : q.monsterName;
    if (typeof ui !== 'undefined' && ui) {
      ui.message(`⌛ Quest reward bumped (+${25 * desiredTier}%): ${name} → ${fmt(q.reward)}z`);
    }
  }
}

function onMonsterKilledForQuest(monsterOrTypeId) {
  if (!activeQuests.length) return;
  const monster = typeof monsterOrTypeId === 'object' ? monsterOrTypeId : null;
  const typeId = monster ? monster.typeId : monsterOrTypeId;
  let killedZone = null;
  if (monster && monster.sprite) {
    killedZone = getZone(Math.floor(monster.sprite.y / TILE_SIZE), Math.floor(monster.sprite.x / TILE_SIZE));
  }
  let completed = false;
  for (const q of activeQuests) {
    if (q.kind === 'zone') {
      if (q.zoneKey !== killedZone) continue;
    } else if (q.monsterTypeId !== typeId) {
      continue;
    }
    q.count += 1;
    if (q.count < q.target) continue;
    const reward = q.reward;
    const name = q.kind === 'zone' ? q.zoneName : q.monsterName;
    player.zeny += reward;
    questChain += 1;
    ui.message(`✓ Quest complete! ${q.kind === 'zone' ? 'Cleared' : 'Slayed'} ${q.target} ${name} (+${fmt(reward)} zeny)`);
    spawnFloatText(player.scene, player.sprite.x, player.sprite.y - 42, `+${fmt(reward)}z`, 0xffd24a, { fontSize: '18px' });
    if (questChain % 3 === 0) {
      const chainBonus = Math.max(75, Math.round(reward * 0.75));
      player.zeny += chainBonus;
      const label = `QUEST STREAK x${questChain}! +${fmt(chainBonus)}z`;
      spawnFloatText(player.scene, player.sprite.x, player.sprite.y - 72, label, 0xffe066, { fontSize: '22px' });
      const banner = player.scene.add.text(GAME_W / 2, 145, label, {
        fontSize: '30px', fontStyle: 'bold', color: '#ffe066',
        stroke: '#5a3a00', strokeThickness: 5,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(19000).setAlpha(0);
      player.scene.tweens.add({ targets: banner, alpha: 1, duration: 220, yoyo: true,
        hold: 1100, onComplete: () => banner.destroy() });
    }
    sfxLevelUp();
    completed = true;
    q.done = true;
  }
  if (!completed) return;
  activeQuests = activeQuests.filter(q => !q.done).slice(0, 2);
  while (activeQuests.length < 2) rollNewQuest();
}

function ensureQuestSlots() {
  while (activeQuests.length < 2) rollNewQuest();
}

function tryEquipDrop(monster) {
  const item = EQUIPMENT_DROPS[monster.typeId];
  if (!item || !player || player.dead) return;
  const current = player.equipment[item.slot];
  const stat = item.atk ? 'atk' : 'def';
  const value = item[stat] || 0;
  const currentValue = current ? (current[stat] || 0) : 0;
  if (current && currentValue >= value) {
    spawnFloatText(monster.scene, monster.sprite.x, monster.sprite.y - 58, `${item.name} dropped`, 0xcccccc, { fontSize: '13px' });
    ui.message(`${item.name} dropped, but your ${current.name} is better.`);
    return;
  }
  if (current) player[stat] -= currentValue;
  player[stat] += value;
  player.equipment[item.slot] = item;
  spawnFloatText(monster.scene, player.sprite.x, player.sprite.y - 86, `Equipped ${item.name}`, 0x88ddff, { fontSize: '18px' });
  ui.message(`Equipped ${item.name} (+${value} ${stat.toUpperCase()}).`);
  sfxLevelUp();
  saveGame();
}

function recordBossTrophy(monster) {
  if (!isBossCfg(monster.cfg) || !player || player.dead) return;
  player.bossTrophies[monster.typeId] = (player.bossTrophies[monster.typeId] || 0) + 1;
  const total = Object.values(player.bossTrophies).reduce((sum, n) => sum + n, 0);
  spawnFloatText(monster.scene, player.sprite.x, player.sprite.y - 110, `Trophy +1 (${total})`, 0xffe066, { fontSize: '16px' });
  player.trophyMilestones = player.trophyMilestones || {};
  for (const m of TROPHY_MILESTONES) {
    if (total < m.total || player.trophyMilestones[m.total]) continue;
    player.trophyMilestones[m.total] = true;
    if (m.atk) player.atk += m.atk;
    if (m.def) player.def += m.def;
    if (m.maxHP) {
      player.maxHP += m.maxHP;
      player.hp = Math.min(player.maxHP, player.hp + m.maxHP);
    }
    const gains = [];
    if (m.atk) gains.push(`+${m.atk} ATK`);
    if (m.def) gains.push(`+${m.def} DEF`);
    if (m.maxHP) gains.push(`+${m.maxHP} HP`);
    const label = `${m.label}! ${gains.join(' ')}`;
    spawnFloatText(monster.scene, player.sprite.x, player.sprite.y - 138, label, 0xffe066, { fontSize: '18px' });
    ui.message(`Trophy milestone: ${label}`);
    sfxLevelUp();
  }
}

function gearSummary() {
  const short = (name) => name.length > 11 ? `${name.slice(0, 10)}…` : name;
  const item = (slot, empty) => {
    const it = player.equipment[slot];
    if (!it) return empty;
    const stat = it.atk ? `+${it.atk} ATK` : `+${it.def || 0} DEF`;
    return `${short(it.name)} ${stat}`;
  };
  const w = item('weapon', 'No weapon');
  const a = item('armor', 'No armor');
  const trophies = Object.values(player.bossTrophies || {}).reduce((sum, n) => sum + n, 0);
  const next = TROPHY_MILESTONES.find(m => trophies < m.total);
  return `Gear: ${w} / ${a}\nTrophies: ${trophies}${next ? `  Next: ${next.total}` : '  Max bonus'}`;
}

function bossTrophyRows() {
  return Object.entries(MONSTER_TYPES)
    .filter(([, cfg]) => isBossCfg(cfg))
    .map(([id, cfg]) => ({ id, cfg, count: (player.bossTrophies && player.bossTrophies[id]) || 0 }))
    .sort((a, b) => {
      const az = (a.cfg.zones && a.cfg.zones[0]) || '';
      const bz = (b.cfg.zones && b.cfg.zones[0]) || '';
      return az.localeCompare(bz) || a.cfg.name.localeCompare(b.cfg.name);
    });
}

// Auto-safety: when HP drops below PANIC_HP_PCT, spend PANIC_COST zeny on a
// full heal. Cooldown prevents thrashing if the player keeps getting hit.
const PANIC_HP_PCT     = 0.25;
const PANIC_COST       = 50;
const PANIC_COOLDOWN_MS = 6000;
// First time the player stands on any landmark plaza they earn this bonus.
const DISCOVERY_ZENY = 250;
const DISCOVERY_EXP  = 75;

// Shop items. price = base * 1.5^bought.
const SHOP_ITEMS = [
  { id: 'hp',  label: '+20 Max HP',  base:  80, apply: (p) => { p.maxHP += 20; p.hp = p.maxHP; } },
  { id: 'atk', label: '+5 ATK',      base: 150, apply: (p) => { p.atk += 5; } },
  { id: 'def', label: '+1 DEF',      base: 200, apply: (p) => { p.def += 1; } },
  { id: 'pot', label: 'Full Heal',   base:  50, flat: true, apply: (p) => { p.hp = p.maxHP; } },
];
let currentZone = null;
const ZONE_LABELS = {
  grasslands: 'Grasslands',
  forest:     'Dark Forest',
  desert:     'Sun-bleached Desert',
  ruins:      'Ancient Ruins',
  riverside:  'Riverside',
};
const ZONE_DIFFICULTY = {
  grasslands: { tag: 'Easy',    color: '#88ff88' },
  riverside:  { tag: 'Easy',    color: '#88ddff' },
  desert:     { tag: 'Medium',  color: '#ffd24a' },
  ruins:      { tag: 'Medium',  color: '#cccccc' },
  forest:     { tag: 'DANGER',  color: '#ff5555' },
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
  // Optional sprite sets — silently skipped if files don't exist.
  this.load.on('loaderror', (file) => {
    if (file && file.key && (/^rookie_(walk3|walk4)_/.test(file.key) || /^knight_/.test(file.key))) {
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
  this.load.image('moodeng_idle', 'assets/sprites/moodeng_idle.png');
  this.load.image('moodeng_hit', 'assets/sprites/moodeng_hit.png');
  this.load.image('moodeng_dead', 'assets/sprites/moodeng_dead.png');
  this.load.image('bigfoot_idle', 'assets/sprites/bigfoot_idle.png');
  this.load.image('bigfoot_aggro', 'assets/sprites/bigfoot_aggro.png');
  this.load.image('bigfoot_chase', 'assets/sprites/bigfoot_chase.png');
  this.load.image('bigfoot_attack', 'assets/sprites/bigfoot_attack.png');
  this.load.image('bigfoot_hit', 'assets/sprites/bigfoot_hit.png');
  this.load.image('bigfoot_dead', 'assets/sprites/bigfoot_dead.png');
  for (const prefix of ['trex', 'kaiju_titan']) {
    for (const state of ['idle', 'aggro', 'chase', 'attack', 'hit', 'dead']) {
      this.load.image(`${prefix}_${state}`, `assets/sprites/${prefix}_${state}.png`);
    }
  }
  // Class selection card art.
  this.load.image('swordsman_card', 'assets/sprites/swordsman_card.png');
  this.load.image('mage_card',      'assets/sprites/mage_card.png');
  this.load.image('archer_card',    'assets/sprites/archer_card.png');
  // Class tier-1 player sprites (south-only for now; other directions fall
  // back to rookie + class tint via applyRookieTexture).
  // Swordsman + Tier-2 Knight: all 5 base directions (west / sw / nw mirror
  // east / se / ne).
  for (const prefix of ['swordsman', 'knight']) {
    for (const d of ['south','north','east','southeast','northeast']) {
      this.load.image(`${prefix}_idle_${d}`, `assets/sprites/${prefix}_idle_${d}.png`);
      this.load.image(`${prefix}_walk_${d}`, `assets/sprites/${prefix}_walk_${d}.png`);
    }
  }
  // Mage: all 5 base directions.
  for (const d of ['south','north','east','southeast','northeast']) {
    this.load.image(`mage_idle_${d}`, `assets/sprites/mage_idle_${d}.png`);
    this.load.image(`mage_walk_${d}`, `assets/sprites/mage_walk_${d}.png`);
  }
  // Archer: all 5 base directions.
  for (const d of ['south','north','east','southeast','northeast']) {
    this.load.image(`archer_idle_${d}`, `assets/sprites/archer_idle_${d}.png`);
    this.load.image(`archer_walk_${d}`, `assets/sprites/archer_walk_${d}.png`);
  }
  // Tier-2 Hunter art: south/north landed first; other directions fall back to Archer.
  for (const d of ['south','north']) {
    this.load.image(`hunter_idle_${d}`, `assets/sprites/hunter_idle_${d}.png`);
    this.load.image(`hunter_walk_${d}`, `assets/sprites/hunter_walk_${d}.png`);
  }
  // Desert biome — Cactling monster + sand tileset + cactus / dune deco.
  this.load.image('cactling_idle', 'assets/sprites/cactling_idle.png');
  this.load.image('cactling_hit', 'assets/sprites/cactling_hit.png');
  this.load.image('cactling_dead', 'assets/sprites/cactling_dead.png');
  this.load.image('sand_tileset', 'assets/tiles/sand_tileset.png');
  this.load.image('forest_tileset', 'assets/tiles/forest_tileset.png');
  this.load.image('ruins_tileset', 'assets/tiles/ruins_tileset.png');
  this.load.image('riverside_tileset', 'assets/tiles/riverside_tileset.png');
  this.load.image('cactus_set', 'assets/decorations/cactus_set.png');
  this.load.image('deco_sand_dune', 'assets/decorations/deco_sand_dune.png');
  this.load.image('forest_fern_01', 'assets/decorations/forest_fern_01.png');
  this.load.image('ruins_pillar_broken_01', 'assets/decorations/ruins_pillar_broken_01.png');
  this.load.image('riverside_cattail_01', 'assets/decorations/riverside_cattail_01.png');
  this.load.image('deco_sand_scuff_soft_01', 'assets/decorations/deco_sand_scuff_soft_01.png');
  this.load.image('deco_stone_dust_soft_01', 'assets/decorations/deco_stone_dust_soft_01.png');
  this.load.image('deco_cracked_earth_01', 'assets/decorations/deco_cracked_earth_01.png');
  this.load.image('deco_pebble_cluster_01', 'assets/decorations/deco_pebble_cluster_01.png');
  this.load.image('deco_dry_grass_tuft_01', 'assets/decorations/deco_dry_grass_tuft_01.png');
  this.load.image('floor_grass_blob_soft_01', 'assets/decorations/floor_grass_blob_soft_01.png');
  this.load.image('floor_forest_moss_soft_01', 'assets/decorations/floor_forest_moss_soft_01.png');
  this.load.image('floor_wet_mud_soft_01', 'assets/decorations/floor_wet_mud_soft_01.png');
  this.load.image('floor_sand_wash_soft_01', 'assets/decorations/floor_sand_wash_soft_01.png');
  this.load.image('floor_stone_dust_soft_01', 'assets/decorations/floor_stone_dust_soft_01.png');
  this.load.image('landmark_spawn_signpost', 'assets/decorations/landmark_spawn_signpost.png');
  this.load.image('landmark_forest_shrine', 'assets/decorations/landmark_forest_shrine.png');
  this.load.image('landmark_desert_obelisk', 'assets/decorations/landmark_desert_obelisk.png');
  this.load.image('landmark_ruins_well', 'assets/decorations/landmark_ruins_well.png');
  this.load.image('landmark_riverside_bridge', 'assets/decorations/landmark_riverside_bridge.png');
  this.load.image('campfire_01', 'assets/decorations/campfire_01.png');
  this.load.image('tent_canvas_front_01', 'assets/decorations/tent_canvas_front_01.png');
  this.load.image('tent_canvas_side_01', 'assets/decorations/tent_canvas_side_01.png');
  this.load.image('wooden_cart_01', 'assets/decorations/wooden_cart_01.png?v=199');
  this.load.image('log_fence_horizontal_01', 'assets/decorations/log_fence_horizontal_01.png?v=200');
  this.load.image('log_fence_broken_01', 'assets/decorations/log_fence_broken_01.png?v=201');
  this.load.image('ladder_wooden_01', 'assets/decorations/ladder_wooden_01.png?v=202');
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
  // Biome blob washes — 1254×1254 PNGs that shipped with a baked
  // transparency-checker background. keyOutCheckerboard() strips it at
  // runtime in create() so the silhouettes feather over the grass base.
  this.load.image('biome_forest_blob',    'assets/decorations/biome_forest_blob.png');
  this.load.image('biome_desert_blob',    'assets/decorations/biome_desert_blob.png');
  this.load.image('biome_ruins_blob',     'assets/decorations/biome_ruins_blob.png');
  this.load.image('biome_riverside_blob', 'assets/decorations/biome_riverside_blob.png');
  this.load.image('grass_tileset', 'assets/tiles/grass_tileset_v2.png');

  // Background music — optional. Loader tolerates missing file (silent if absent).
  // Try mp3 first; ogg fallback for Firefox-only setups.
  this.load.audio('bgm', ['assets/audio/bgm.mp3', 'assets/audio/bgm.ogg']);
  this.load.audio('hitthemonster',  'assets/audio/hitthemonster.mp3');
  this.load.audio('hitthemonster2', 'assets/audio/hitting sound2.mp3');
  this.load.audio('hitthemonster3', 'assets/audio/hitting sound3.mp3');
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
    'moodeng_idle','moodeng_hit','moodeng_dead',
    'bigfoot_idle','bigfoot_aggro','bigfoot_chase','bigfoot_attack','bigfoot_hit','bigfoot_dead',
    'trex_idle','trex_aggro','trex_chase','trex_attack','trex_hit','trex_dead',
    'kaiju_titan_idle','kaiju_titan_aggro','kaiju_titan_chase','kaiju_titan_attack','kaiju_titan_hit','kaiju_titan_dead',
    'cactling_idle','cactling_hit','cactling_dead',
    'cactus_set','deco_sand_dune',
    'forest_fern_01','ruins_pillar_broken_01','riverside_cattail_01',
    'landmark_spawn_signpost','landmark_forest_shrine','landmark_desert_obelisk',
    'landmark_ruins_well','landmark_riverside_bridge',
    'swordsman_idle_south','swordsman_walk_south',
    'swordsman_idle_north','swordsman_walk_north',
    'swordsman_idle_east','swordsman_walk_east',
    'swordsman_idle_southeast','swordsman_walk_southeast',
    'swordsman_idle_northeast','swordsman_walk_northeast',
    'knight_idle_south','knight_walk_south',
    'knight_idle_north','knight_walk_north',
    'knight_idle_east','knight_walk_east',
    'knight_idle_southeast','knight_walk_southeast',
    'knight_idle_northeast','knight_walk_northeast',
    'mage_idle_north','mage_walk_north',
    'mage_idle_east','mage_walk_east',
    'mage_idle_southeast','mage_walk_southeast',
    'mage_idle_northeast','mage_walk_northeast',
    'archer_idle_north','archer_walk_north',
    'archer_idle_east','archer_walk_east',
    'archer_idle_southeast','archer_walk_southeast',
    'archer_idle_northeast','archer_walk_northeast',
    'mage_idle_south','mage_walk_south',
    'archer_idle_south','archer_walk_south',
    'hunter_idle_south','hunter_walk_south',
    'hunter_idle_north','hunter_walk_north',
    'deco_flower_cluster_01','deco_flower_cluster_02','deco_flower_cluster_03','deco_flower_cluster_04',
    'deco_rock_01','deco_rock_02','deco_rock_03',
    'deco_tallgrass_01','deco_tallgrass_02','deco_tallgrass_03',
    'deco_sand_scuff_soft_01','deco_stone_dust_soft_01',
    'deco_cracked_earth_01','deco_pebble_cluster_01','deco_dry_grass_tuft_01',
    'floor_grass_blob_soft_01','floor_forest_moss_soft_01',
    'floor_wet_mud_soft_01','floor_sand_wash_soft_01','floor_stone_dust_soft_01',
    'tree_oak_01','tree_pine_02','tree_round_03',
    'bush_01','bush_02',
    'mushroom_red_01','mushroom_brown_02',
    'pond_01',
  ];
  for (const k of spriteKeys) keyOutWhite(scene, k);
  // Biome blob PNGs use Photoshop transparency checker as background —
  // strip it to real alpha so they paint cleanly over the grass base.
  for (const k of ['biome_forest_blob', 'biome_desert_blob', 'biome_ruins_blob', 'biome_riverside_blob']) {
    keyOutCheckerboard(scene, k);
  }

  // Slice every 4x4 tileset into 16 frames named `tile_0`..`tile_15` on that
  // texture key. buildMap picks which tileset key to draw from per zone.
  // Grass tileset has a baked white separator → 4% inset crops it. Generated
  // biome tilesets are 3×3 sheets, so we map their 9 cells onto our 16 tile
  // frame names below.
  const TILESET_INSET_PCT = {
    grass_tileset: 0,
    sand_tileset: 0,
    forest_tileset: 0,
    ruins_tileset: 0,
    riverside_tileset: 0,
  };
  const TILESET_GRID = { grass_tileset: 3, forest_tileset: 3, ruins_tileset: 3, riverside_tileset: 3 };
  const TILESET_TILE_MAP_3X3 = {
    [TILE.GRASS]: 0,
    [TILE.THICK_GRASS]: 1,
    [TILE.FLOWER]: 4,
    [TILE.FLOWERS_COLOR]: 2,
    [TILE.ROCKS_SPARSE]: 6,
    [TILE.ROCKS_DENSE]: 8,
    [TILE.DIRT_PATCH]: 3,
    [TILE.DIRT_HEAVY]: 7,
    [TILE.DIRT_H]: 3,
    [TILE.DIRT_H2]: 7,
    [TILE.DIRT_V]: 3,
    [TILE.DIRT_V2]: 7,
    [TILE.DIRT_CORNER]: 3,
    [TILE.DIRT_WIDE]: 7,
    [TILE.DIRT_OPEN]: 3,
    [TILE.TALL_GRASS]: 5,
  };
  // grass_tileset_v2 has very dark top-row cells and very bright bottom-row
  // cells. Using all 9 cells as base terrain creates a checkerboard of value
  // blocks, so grasslands use the cohesive mid row for the ground and leave
  // stronger variation to decoration sprites.
  const GRASS_TILESET_TILE_MAP_3X3 = {
    [TILE.GRASS]: 4,
    [TILE.THICK_GRASS]: 4,
    [TILE.FLOWER]: 4,
    [TILE.FLOWERS_COLOR]: 5,
    [TILE.ROCKS_SPARSE]: 3,
    [TILE.ROCKS_DENSE]: 3,
    [TILE.DIRT_PATCH]: 4,
    [TILE.DIRT_HEAVY]: 3,
    [TILE.DIRT_H]: 3,
    [TILE.DIRT_H2]: 4,
    [TILE.DIRT_V]: 3,
    [TILE.DIRT_V2]: 4,
    [TILE.DIRT_CORNER]: 3,
    [TILE.DIRT_WIDE]: 4,
    [TILE.DIRT_OPEN]: 4,
    [TILE.TALL_GRASS]: 5,
  };
  const sliceTileset = (texKey) => {
    if (!scene.textures.exists(texKey)) return;
    const img = scene.textures.get(texKey).getSourceImage();
    const grid = TILESET_GRID[texKey] || 4;
    const sw = Math.floor(img.width / grid);
    const sh = Math.floor(img.height / grid);
    const inset = Math.floor(sw * (TILESET_INSET_PCT[texKey] ?? 0.04));
    const tileMap = texKey === 'grass_tileset'
      ? GRASS_TILESET_TILE_MAP_3X3
      : TILESET_TILE_MAP_3X3;
    for (let idx = 0; idx < 16; idx++) {
      const srcIdx = grid === 3 ? tileMap[idx] : idx;
      const r = Math.floor(srcIdx / grid);
      const c = srcIdx % grid;
      scene.textures.get(texKey).add(
        `tile_${idx}`, 0,
        c * sw + inset, r * sh + inset,
        sw - inset * 2, sh - inset * 2
      );
    }
    // Cache slice dims off the first tileset for any legacy reads.
    tileSliceW = sw;
    tileSliceH = sh;
  };
  sliceTileset('grass_tileset');
  sliceTileset('sand_tileset');
  sliceTileset('forest_tileset');
  sliceTileset('ruins_tileset');
  sliceTileset('riverside_tileset');
  createGrassFieldTexture(scene);

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
  spawnShowcaseMobPod(scene);

  // Camera follow
  scene.cameras.main.startFollow(player.followTarget, true, 0.1, 0.1);
  // RO camera reveals ~12-15 tiles wide — zoom out a touch.
  scene.cameras.main.setZoom(0.85);

  // ------- Mouse-wheel zoom -------
  // Wheel up zooms in, wheel down zooms out. The main camera follows the
  // player (set above with startFollow), so the world stays centered on the
  // player as zoom changes. The UI camera (created below) has its own zoom
  // and is unaffected, so the HUD stays crisp at its authored size.
  const ZOOM_MIN = 0.4;
  const ZOOM_MAX = 1.6;
  const ZOOM_STEP = 1.12;
  scene.input.on('wheel', (_pointer, _objs, _dx, dy) => {
    const cam = scene.cameras.main;
    const factor = dy < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    cam.zoom = Phaser.Math.Clamp(cam.zoom * factor, ZOOM_MIN, ZOOM_MAX);
  });

  // ------- Screen-space UI camera -------
  // The main world camera has zoom 0.65, which silently shrinks every
  // setScrollFactor(0) HUD object to 65% of its authored size and softens
  // the antialiased text. To keep the HUD crisp and at its real size, we
  // render it on a second camera that never zooms. The main camera ignores
  // every UI Game Object; the UI camera ignores everything else.
  //
  // Sorting is automatic via the ADDED_TO_SCENE event. Because the scroll
  // factor isn't set yet at the moment the event fires (chained `.setScrollFactor(0)`
  // runs after), we queue new objects and classify them on POSTUPDATE.
  const uiCam = scene.cameras.add(0, 0, scene.scale.width, scene.scale.height);
  uiCam.setName('ui').setScroll(0, 0);
  scene.__uiCam = uiCam;
  const newlyAdded = [];
  scene.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, (obj) => {
    newlyAdded.push(obj);
  });
  const classify = (obj) => {
    if (!obj || !obj.scene) return;
    // Some objects (graphics, containers) report undefined scrollFactor;
    // treat anything explicitly zeroed as UI.
    const isUI = obj.scrollFactorX === 0 && obj.scrollFactorY === 0;
    if (isUI) {
      scene.cameras.main.ignore(obj);
    } else {
      uiCam.ignore(obj);
    }
  };
  scene.events.on(Phaser.Scenes.Events.POSTUPDATE, () => {
    if (!newlyAdded.length) return;
    while (newlyAdded.length) classify(newlyAdded.shift());
  });
  // First-pass sort of everything already in the scene before UIManager runs.
  scene.events.once(Phaser.Scenes.Events.UPDATE, () => {
    for (const obj of scene.children.list) classify(obj);
  });
  // Keep the UI camera matching the browser viewport on resize.
  scene.scale.on('resize', (gameSize) => {
    uiCam.setSize(gameSize.width, gameSize.height);
    if (ui && typeof ui.relayout === 'function') ui.relayout(gameSize.width, gameSize.height);
  });

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
    // Pointer.worldX/Y is computed against whichever camera the input
    // manager picked. Since we added a screen-space UI camera in front,
    // those properties now resolve in screen coords instead of world
    // coords — every monster click missed. Resolve world coords from the
    // main (world) camera explicitly so hit tests stay correct.
    const wp = pointer.positionToCamera(scene.cameras.main);
    const wx = wp.x, wy = wp.y;
    let over = false;
    for (const b of bloblings) {
      if (!b.alive || !b.sprite || !b.sprite.scene) continue;
      // Scale hit test to the sprite's actual display size so giant bosses
      // (scaleMult 6.6) register over their whole body. Floor at 70 px so
      // tiny slimes stay easy to hover.
      const halfW = Math.max(70, b.sprite.displayWidth / 2);
      const halfH = Math.max(70, b.sprite.displayHeight / 2);
      if (Math.abs(wx - b.sprite.x) < halfW && Math.abs(wy - b.sprite.y) < halfH) { over = true; break; }
    }
    scene.input.setDefaultCursor(over ? 'crosshair' : 'default');
  });

  // Pointer: click a Blobling to fight it; click ground to walk there.
  scene.input.on('pointerdown', (pointer) => {
    // Block world clicks while any modal overlay is up.
    if (classSelectOpen || shopOpen || travelOpen || trophyOpen) return;
    // Ignore clicks that landed on a UI button (mute / autopilot / return /
    // class cards). Phaser's scene-level pointerdown fires regardless of
    // which interactive object was hit, so we check the hit list ourselves.
    const hits = scene.input.hitTestPointer(pointer);
    if (hits && hits.length > 0) return;
    // See note above: resolve world coords from the main camera so the UI
    // camera doesn't intercept pointer-to-world conversion.
    const wp = pointer.positionToCamera(scene.cameras.main);
    const wx = wp.x;
    const wy = wp.y;

    let clicked = null;
    for (const b of bloblings) {
      if (!b.alive || !b.sprite || !b.sprite.scene) continue;
      // Scale click hit-test to sprite's actual display size — bosses with
      // scaleMult 6.6 (Bigfoot, T-Rex, Kaiju Titan) cover much more than
      // 80 px so clicks anywhere on the visible body register. Floor at
      // 80 so small mobs keep the original generous tap target.
      const halfW = Math.max(80, b.sprite.displayWidth / 2);
      const halfH = Math.max(80, b.sprite.displayHeight / 2);
      if (Math.abs(wx - b.sprite.x) < halfW && Math.abs(wy - b.sprite.y) < halfH) { clicked = b; break; }
    }

    // Spawn signpost is clickable — opens Travel panel as a world-anchored
    // way-finder. Coords match the grasslands landmark hero placement in
    // buildDecorations(): center tile + (TILE_SIZE/2, TILE_SIZE/2 + 8).
    if (!clicked) {
      const { midRow: _smr, midCol: _smc } = mapCenter();
      const signX = _smc * TILE_SIZE + TILE_SIZE / 2;
      const signY = _smr * TILE_SIZE + TILE_SIZE / 2 + 8;
      if (Math.hypot(wx - signX, wy - signY) < 80) {
        showTravel(scene);
        return;
      }
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

  // Vignette / player halo / cloud-shadow overlays were removed at user
  // request — they read as broken-lighting rectangles + a spotlight
  // around the player instead of subtle atmosphere. Keep the world
  // bright and readable; revisit only as a very subtle pass later.

  // UI
  ui = new UIManager(scene);
  // Apply saved progress (level / exp / zeny / position) if present.
  const loaded = applySave();
  if (loaded) {
    ui.message(`Welcome back — Lv.${player.level}, ${fmt(player.zeny)} zeny.`);
  } else {
    // First-session tutorial only. Returning players don't need the hints.
    ui.message('Welcome to Grasslands Online!');
    ui.message('Click monsters to attack. Click ground to walk.');
    ui.message('Click monsters to auto-fight. Tab targets nearest. Shift+R resets save.');
  }
  // Daily login bonus — once per calendar day. Persists in localStorage.
  try {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const last = localStorage.getItem('grasslands_last_login_v1');
    if (last !== today) {
      localStorage.setItem('grasslands_last_login_v1', today);
      const bonus = 500;
      player.zeny += bonus;
      ui.message(`🌟 Daily login bonus: +${fmt(bonus)} zeny!`);
      if (typeof sfxLevelUp === 'function') sfxLevelUp();
    }
  } catch (e) { /* ignore */ }
  ensureQuestSlots();
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
      showZoneBanner(player.scene, ZONE_LABELS[z] || z, z);
      showBossZoneHint(player.scene, z);
    }
  }

  // Road sparkles + biome ambience particles. Pure feel, no rules.
  if (player && !player.dead) {
    tickRoadSparkles(player.scene, time);
    tickAmbience(player.scene, time, delta);
  }

  // Off-screen sway tween cull. ~1.3k sway tweens drive grass/flowers; only
  // the few hundred near the player are visible. Every 300ms, pause tweens
  // beyond ~1400 px of the player and resume those near. Big tween-manager
  // win on the 19200² world.
  if (player && !player.dead && player.scene && player.scene.__swayProps &&
      time - lastSwayCull > 300) {
    lastSwayCull = time;
    const list = player.scene.__swayProps;
    const cx = player.sprite.x, cy = player.sprite.y;
    const R = 1400, R2 = R * R;
    for (const e of list) {
      if (!e.img || !e.tween) continue;
      const dx = e.img.x - cx, dy = e.img.y - cy;
      const far = (dx * dx + dy * dy) > R2;
      if (far && !e.tween.isPaused()) e.tween.pause();
      else if (!far && e.tween.isPaused()) e.tween.resume();
    }
  }

  // Autopilot: when on, pick the nearest safe live monster as attack target.
  // "Safe" = not aggressive, not boss-tier reward, maxHP not >1.5x player.
  if (autopilotOn && !player.dead &&
      (!player.attackTarget || !player.attackTarget.alive) &&
      time - autopilotLastScan > 400) {
    autopilotLastScan = time;
    // Score = (distance penalty) - (density bonus). Lower wins.
    // Density bonus counts safe live monsters within 400 px of the candidate,
    // so autopilot prefers clusters over lone stragglers across the map.
    let best = null, bestScore = Infinity;
    const safeCap = player.maxHP * 1.5;
    const safe = (m) => {
      if (!m.alive) return false;
      const cfg = m.cfg || {};
      if (cfg.aggressive) return false;
      if (isBossCfg(cfg)) return false;
      if (m.maxHP > safeCap) return false;
      return true;
    };
    // Perf: pre-bucket safe monsters by 400-px cells. Density count becomes
    // O(N) instead of O(N²) — was 440² = 193k ops/scan at full spawn density.
    const safeMon = [];
    const bucket = new Map();
    for (const m of bloblings) {
      if (!safe(m)) continue;
      safeMon.push(m);
      const bk = (Math.floor(m.sprite.x / 400) << 16) | (Math.floor(m.sprite.y / 400) & 0xffff);
      bucket.set(bk, (bucket.get(bk) || 0) + 1);
    }
    for (const m of safeMon) {
      const d = Math.hypot(m.sprite.x - player.sprite.x, m.sprite.y - player.sprite.y);
      // Prefer the active quest target — gives autopilot a real goal.
      const mz = getZone(Math.floor(m.sprite.y / TILE_SIZE), Math.floor(m.sprite.x / TILE_SIZE));
      const isQuestTarget = activeQuests.some(q => q.kind === 'zone' ? q.zoneKey === mz : q.monsterTypeId === m.typeId);
      // Density = sum of safe monsters in this and 8 neighboring 400-px
      // cells (covers ~3-cell radius around candidate). Subtract self once.
      const bx = Math.floor(m.sprite.x / 400), by = Math.floor(m.sprite.y / 400);
      let neighbors = -1;
      for (let dxk = -1; dxk <= 1; dxk++) {
        for (let dyk = -1; dyk <= 1; dyk++) {
          const k = ((bx + dxk) << 16) | ((by + dyk) & 0xffff);
          neighbors += bucket.get(k) || 0;
        }
      }
      if (neighbors < 0) neighbors = 0;
      const score = d - neighbors * 120 - (isQuestTarget ? 800 : 0);
      if (score < bestScore) { bestScore = score; best = m; }
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
          spawnFloatText(player.scene, player.sprite.x, player.sprite.y - 14, `+${l.amount} HP`, 0x66ff88);
        } else {
          player.zeny += l.amount;
          spawnFloatText(player.scene, player.sprite.x, player.sprite.y - 14, `+${fmt(l.amount)}z`, 0xffd24a);
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

  // Day/night: cosine-driven darkness peaking at midnight. Kept very
  // subtle (max 0.18 alpha) so nights still read as a tint, not a dim
  // overlay — user wants the world bright and readable.
  if (dayNightOverlay) {
    const t = (time % DAY_NIGHT_CYCLE_MS) / DAY_NIGHT_CYCLE_MS;
    const darkness = (1 - Math.cos(t * Math.PI * 2)) / 2; // 0..1..0
    worldDarkness = darkness;
    dayNightOverlay.alpha = darkness * 0.18;
    // Once-per-cycle chat callouts at the dusk + dawn thresholds.
    if (!_nightAnnounced && darkness > 0.65) {
      _nightAnnounced = true;
      if (typeof ui !== 'undefined' && ui) ui.message('🌙 Night falls. Fireflies stir.');
    } else if (_nightAnnounced && darkness < 0.15) {
      _nightAnnounced = false;
      if (typeof ui !== 'undefined' && ui) ui.message('🌅 Dawn breaks.');
    }
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

// Convert Photoshop-style transparency checkerboard (greys ~204/255) into
// real alpha for source PNGs that shipped without an alpha channel. Strips
// near-greyscale + high-value pixels, with a partial-fade band so soft
// edges between the blob and checker don't read as a hard outline.
function keyOutCheckerboard(scene, key) {
  if (!scene.textures.exists(key)) return;
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
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    const val = (r + g + b) / 3;
    if (val >= 195 && sat < 12) {
      d[i + 3] = 0; // pure checker pixel → transparent
    } else if (val >= 180 && sat < 22) {
      // Anti-aliased edge between blob and checker — fade proportional to
      // how colored the pixel is. Keeps the silhouette feathered.
      d[i + 3] = Math.floor(d[i + 3] * (sat / 22));
    }
  }
  ctx.putImageData(imgData, 0, 0);
  scene.textures.remove(key);
  scene.textures.addCanvas(key, canvas);
}

// ---------- Map ----------
function mapCenter() {
  const midRow = Math.floor(MAP_ROWS / 2);
  const midCol = Math.floor(MAP_COLS / 2);
  return { midRow, midCol, coreHalf: Math.floor(MAP_COLS * 0.18) };
}

function landmarkTiles() {
  const { midRow, midCol, coreHalf } = mapCenter();
  const half = Math.floor((coreHalf + 8) / 2);
  // 5 primary plazas (full halo + ring + hero prop) + 8 secondary mini
  // plazas (halo + smaller ring + warm lantern) so the world has more
  // discoverable destinations without growing physical dimensions.
  return [
    { r: midRow, c: midCol, radius: 1, name: 'Spawn Plaza', primary: true },
    { r: midRow - coreHalf - 8, c: midCol, radius: 1, name: 'Forest Heart', primary: true },
    { r: midRow + coreHalf + 8, c: midCol, radius: 1, name: 'Desert Heart', primary: true },
    { r: midRow, c: midCol - coreHalf - 8, radius: 1, name: 'Ruins Plaza', primary: true },
    { r: midRow, c: midCol + coreHalf + 8, radius: 1, name: 'Riverside Plaza', primary: true },
    // Mid-cardinal secondaries — way-stations between center and primary biome.
    { r: midRow - half, c: midCol, radius: 0, name: 'Forest Edge' },
    { r: midRow + half, c: midCol, radius: 0, name: 'Desert Edge' },
    { r: midRow, c: midCol - half, radius: 0, name: 'Ruins Crossing' },
    { r: midRow, c: midCol + half, radius: 0, name: 'Riverside Bend' },
    // Diagonals — biome corners, less-traveled.
    { r: midRow - coreHalf, c: midCol - coreHalf, radius: 0, name: 'Mistgrove' },
    { r: midRow - coreHalf, c: midCol + coreHalf, radius: 0, name: 'Sunfall Grove' },
    { r: midRow + coreHalf, c: midCol - coreHalf, radius: 0, name: 'Old Ford' },
    { r: midRow + coreHalf, c: midCol + coreHalf, radius: 0, name: 'Reedmoor' },
  ];
}

function nearLandmark(r, c) {
  return landmarkTiles().some(p => Math.abs(r - p.r) <= p.radius && Math.abs(c - p.c) <= p.radius);
}

// Roads make the world legible: a spawn cross, a loop around grasslands,
// diagonal feeders into far biomes, and small landmark plazas.
function getCellType(r, c) {
  const { midRow, midCol, coreHalf } = mapCenter();
  const dr = r - midRow;
  const dc = c - midCol;
  const ring = coreHalf + 1;
  if (nearLandmark(r, c)) return 'path_open';
  if (r === midRow && c === midCol) return 'path_cross';
  if (r === midRow) return 'path_h';
  if (c === midCol) return 'path_v';
  if ((Math.abs(dr) === ring && Math.abs(dc) <= ring) ||
      (Math.abs(dc) === ring && Math.abs(dr) <= ring)) return 'path_loop';
  if (Math.abs(Math.abs(dr) - Math.abs(dc)) <= 1 &&
      Math.abs(dr) > ring && Math.abs(dc) > ring) return 'path_diag';
  return 'grass';
}

// Zone layout: keep a central grasslands square around spawn, partition the
// outer ring into compass-aligned biomes. Tile coords (r, c) are 0..MAP_ROWS-1.
function getZone(r, c) {
  const { midRow, midCol, coreHalf } = mapCenter();
  const dr = r - midRow;
  const dc = c - midCol;
  if (Math.abs(dr) <= coreHalf && Math.abs(dc) <= coreHalf) return 'grasslands';
  // Outside the core: pick biome by dominant axis, but warp the diagonal
  // boundary so biomes stop meeting in perfect rectangular/diamond cuts.
  const boundaryWarp = Math.round((smoothTileNoise(Math.floor(r / 3), Math.floor(c / 3), 701) - 0.5) * 8);
  if (Math.abs(dr) + boundaryWarp >= Math.abs(dc)) {
    return dr < 0 ? 'forest' : 'desert';
  } else {
    return dc < 0 ? 'ruins' : 'riverside';
  }
}

function nearZoneBoundary(r, c) {
  const z = getZone(r, c);
  return [[1,0],[-1,0],[0,1],[0,-1]].some(([dr, dc]) => {
    const nr = Phaser.Math.Clamp(r + dr, 0, MAP_ROWS - 1);
    const nc = Phaser.Math.Clamp(c + dc, 0, MAP_COLS - 1);
    return getZone(nr, nc) !== z;
  });
}

function tileNoise(r, c, salt = 0) {
  let n = (r * 374761393 + c * 668265263 + salt * 2147483647) | 0;
  n = (n ^ (n >>> 13)) | 0;
  n = Math.imul(n, 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function smoothTileNoise(r, c, salt = 0) {
  let total = 0;
  let weight = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const w = dx === 0 && dy === 0 ? 4 : (dx === 0 || dy === 0 ? 2 : 1);
      total += tileNoise(Math.floor((r + dy) / 2), Math.floor((c + dx) / 2), salt) * w;
      weight += w;
    }
  }
  return total / weight;
}

function neighborZones(r, c) {
  const zones = new Set();
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nr = Phaser.Math.Clamp(r + dy, 0, MAP_ROWS - 1);
      const nc = Phaser.Math.Clamp(c + dx, 0, MAP_COLS - 1);
      zones.add(getZone(nr, nc));
    }
  }
  return zones;
}

function terrainBlendAsset(zone, neighborZone = zone) {
  if (zone === 'desert' || neighborZone === 'desert') return 'floor_sand_wash_soft_01';
  if (zone === 'ruins' || neighborZone === 'ruins') return 'floor_stone_dust_soft_01';
  if (zone === 'riverside' || neighborZone === 'riverside') return 'floor_wet_mud_soft_01';
  if (zone === 'forest' || neighborZone === 'forest') return 'floor_forest_moss_soft_01';
  return 'floor_grass_blob_soft_01';
}

function terrainBlendTint(zone, neighborZone = zone) {
  if (zone === 'desert' || neighborZone === 'desert') return 0xd8bd78;
  if (zone === 'ruins' || neighborZone === 'ruins') return 0xbfb6a2;
  if (zone === 'riverside' || neighborZone === 'riverside') return 0xbfd8c8;
  if (zone === 'forest' || neighborZone === 'forest') return 0xb8d8a0;
  return 0xd8e0b8;
}

function terrainTransitionBaseTint() {
  return 0xf0f6d8;
}

function terrainBoundaryInfo(r, c, radius = 3) {
  const zone = getZone(r, c);
  const zones = new Set([zone]);
  let distance = Infinity;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nr = Phaser.Math.Clamp(r + dy, 0, MAP_ROWS - 1);
      const nc = Phaser.Math.Clamp(c + dx, 0, MAP_COLS - 1);
      const neighborZone = getZone(nr, nc);
      zones.add(neighborZone);
      if (neighborZone !== zone) distance = Math.min(distance, Math.abs(dx) + Math.abs(dy));
    }
  }
  return { zone, zones, distance: Number.isFinite(distance) ? distance : null };
}

function transitionGroundTile(zone, zones, r, c) {
  const detail = smoothTileNoise(r, c, 771);
  if (zones.has('desert')) {
    return detail < 0.42 ? TILE.GRASS : (detail < 0.76 ? TILE.TALL_GRASS : TILE.THICK_GRASS);
  }
  if (zones.has('ruins')) {
    return detail < 0.45 ? TILE.GRASS : (detail < 0.78 ? TILE.THICK_GRASS : TILE.TALL_GRASS);
  }
  if (zones.has('riverside')) {
    return detail < 0.38 ? TILE.GRASS : (detail < 0.72 ? TILE.THICK_GRASS : TILE.TALL_GRASS);
  }
  if (zones.has('forest')) {
    return detail < 0.46 ? TILE.GRASS : (detail < 0.78 ? TILE.THICK_GRASS : TILE.TALL_GRASS);
  }
  return detail < 0.5 ? TILE.GRASS : TILE.THICK_GRASS;
}

function pickNaturalGroundTile(zone, r, c, type) {
  if (type === 'path_cross' || type === 'path_open') return TILE.DIRT_OPEN;
  if (type === 'path_h') return tileNoise(r, c, 101) < 0.55 ? TILE.DIRT_H : TILE.DIRT_H2;
  if (type === 'path_v') return tileNoise(r, c, 102) < 0.55 ? TILE.DIRT_V : TILE.DIRT_V2;
  if (type === 'path_loop') return tileNoise(r, c, 103) < 0.5 ? TILE.DIRT_WIDE : TILE.DIRT_PATCH;
  if (type === 'path_diag') return tileNoise(r, c, 104) < 0.5 ? TILE.DIRT_CORNER : TILE.DIRT_HEAVY;

  const boundaryZones = neighborZones(r, c);
  const boundary = boundaryZones.size > 1;
  const detail = tileNoise(r, c, 17);
  const stonePatch = smoothTileNoise(r, c, 31);
  const dryPatch = smoothTileNoise(r, c, 47);
  const lushPatch = smoothTileNoise(r, c, 59);

  if (boundary) {
    if (boundaryZones.has('desert') && zone !== 'desert' && dryPatch > 0.45) {
      return detail < 0.52 ? TILE.DIRT_PATCH : (detail < 0.80 ? TILE.DIRT_HEAVY : TILE.ROCKS_SPARSE);
    }
    if (boundaryZones.has('ruins') && zone !== 'ruins' && stonePatch > 0.43) {
      return detail < 0.48 ? TILE.DIRT_PATCH : (detail < 0.76 ? TILE.ROCKS_SPARSE : TILE.ROCKS_DENSE);
    }
    if ((zone === 'desert' || zone === 'ruins') && lushPatch > 0.52) {
      return detail < 0.42 ? TILE.THICK_GRASS : (detail < 0.72 ? TILE.TALL_GRASS : TILE.DIRT_PATCH);
    }
  }

  if (zone === 'desert') {
    if (stonePatch > 0.64) return detail < 0.62 ? TILE.ROCKS_SPARSE : TILE.ROCKS_DENSE;
    if (dryPatch > 0.58) return detail < 0.70 ? TILE.DIRT_HEAVY : TILE.DIRT_PATCH;
    if (lushPatch > 0.70) return detail < 0.72 ? TILE.DIRT_PATCH : TILE.TALL_GRASS;
    return detail < 0.72 ? TILE.DIRT_PATCH : (detail < 0.92 ? TILE.DIRT_HEAVY : TILE.ROCKS_SPARSE);
  }

  if (zone === 'ruins') {
    if (stonePatch > 0.56) return detail < 0.55 ? TILE.ROCKS_DENSE : TILE.ROCKS_SPARSE;
    if (dryPatch > 0.52) return detail < 0.58 ? TILE.DIRT_HEAVY : TILE.DIRT_PATCH;
    if (lushPatch > 0.66) return detail < 0.66 ? TILE.TALL_GRASS : TILE.THICK_GRASS;
    return detail < 0.46 ? TILE.DIRT_PATCH : (detail < 0.74 ? TILE.ROCKS_SPARSE : TILE.DIRT_HEAVY);
  }

  if (zone === 'forest') {
    if (stonePatch > 0.70) return detail < 0.64 ? TILE.DIRT_PATCH : TILE.ROCKS_SPARSE;
    if (lushPatch > 0.54) return detail < 0.48 ? TILE.THICK_GRASS : (detail < 0.82 ? TILE.TALL_GRASS : TILE.FLOWER);
    return detail < 0.40 ? TILE.THICK_GRASS : (detail < 0.68 ? TILE.GRASS : (detail < 0.88 ? TILE.TALL_GRASS : TILE.FLOWER));
  }

  if (zone === 'riverside') {
    if (dryPatch > 0.72) return detail < 0.70 ? TILE.DIRT_PATCH : TILE.ROCKS_SPARSE;
    if (lushPatch > 0.48) return detail < 0.36 ? TILE.THICK_GRASS : (detail < 0.72 ? TILE.TALL_GRASS : TILE.FLOWERS_COLOR);
    return detail < 0.36 ? TILE.GRASS : (detail < 0.62 ? TILE.THICK_GRASS : (detail < 0.82 ? TILE.FLOWER : TILE.DIRT_PATCH));
  }

  if (stonePatch > 0.73) return detail < 0.65 ? TILE.DIRT_PATCH : TILE.ROCKS_SPARSE;
  if (dryPatch > 0.76) return detail < 0.70 ? TILE.DIRT_PATCH : TILE.DIRT_HEAVY;
  if (lushPatch > 0.58) return detail < 0.42 ? TILE.THICK_GRASS : (detail < 0.78 ? TILE.TALL_GRASS : TILE.FLOWER);
  return detail < 0.42 ? TILE.GRASS : (detail < 0.66 ? TILE.THICK_GRASS : (detail < 0.82 ? TILE.TALL_GRASS : TILE.FLOWER));
}

function buildMap(scene) {
  // Continuous grass base: do not draw a repeated grass image per cell.
  // Even a uniform tile still exposes a rhombus grid at this camera angle.
  // Paths remain cell-based, while the open field is one painterly canvas.
  if (scene.textures.exists('grass_field_texture')) {
    scene.add.tileSprite(0, 0, WORLD_W, WORLD_H, 'grass_field_texture')
      .setOrigin(0, 0)
      .setDepth(-1010);
    scene.add.tileSprite(0, 0, WORLD_W, WORLD_H, 'grass_field_texture')
      .setOrigin(0, 0)
      .setDepth(-1009.8)
      .setAlpha(0.34)
      .setTilePosition(713, 389)
      .setTileScale(1.37, 1.19);
    scene.add.tileSprite(0, 0, WORLD_W, WORLD_H, 'grass_field_texture')
      .setOrigin(0, 0)
      .setDepth(-1009.7)
      .setAlpha(0.18)
      .setTilePosition(231, 947)
      .setTileScale(0.73, 0.91);
  } else {
    scene.add.rectangle(0, 0, WORLD_W, WORLD_H, 0x79a94e, 1)
      .setOrigin(0, 0)
      .setDepth(-1010);
  }
  addPathWashes(scene);
  addBiomeWash(scene);
  addTerrainRelief(scene);
  addShorelineBanks(scene);
  addGrassTones(scene);
}

function createGrassFieldTexture(scene) {
  if (scene.textures.exists('grass_field_texture')) return;
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const fract = (n) => n - Math.floor(n);
  const smooth = (t) => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;
  const hash = (x, y, seed = 0) => {
    const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
    return fract(n);
  };
  const tileNoise2d = (x, y, cells, seed = 0) => {
    const gx = (x / size) * cells;
    const gy = (y / size) * cells;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const tx = smooth(gx - x0);
    const ty = smooth(gy - y0);
    const wrap = (v) => ((v % cells) + cells) % cells;
    const a = hash(wrap(x0), wrap(y0), seed);
    const b = hash(wrap(x0 + 1), wrap(y0), seed);
    const c = hash(wrap(x0), wrap(y0 + 1), seed);
    const d = hash(wrap(x0 + 1), wrap(y0 + 1), seed);
    return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
  };
  const wrapped = (x, y, margin, draw) => {
    const xs = [0];
    const ys = [0];
    if (x - margin < 0) xs.push(size);
    if (x + margin > size) xs.push(-size);
    if (y - margin < 0) ys.push(size);
    if (y + margin > size) ys.push(-size);
    for (const ox of xs) for (const oy of ys) draw(x + ox, y + oy);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const small = tileNoise2d(x, y, 320, 2);
      const medium = tileNoise2d(x, y, 142, 7);
      const micro = hash(Math.floor(x / 3), Math.floor(y / 3), 23);
      const nx = (x / size) * Math.PI * 2;
      const ny = (y / size) * Math.PI * 2;
      const blade = Math.sin(nx * 45 + Math.cos(ny * 21) * 1.4) * 0.5 + 0.5;
      const shade = -17 + small * 15 + medium * 8 + micro * 10 + blade * 5;
      data[i] = Phaser.Math.Clamp(80 + shade, 54, 118);
      data[i + 1] = Phaser.Math.Clamp(135 + shade * 0.92, 96, 176);
      data[i + 2] = Phaser.Math.Clamp(59 + shade * 0.58, 38, 96);
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 720; i++) {
    const x = hash(i, 9, 1) * size;
    const y = hash(i, 17, 2) * size;
    const rx = 6 + hash(i, 21, 3) * 18;
    const ry = 4 + hash(i, 29, 4) * 12;
    const margin = Math.max(rx, ry);
    wrapped(x, y, margin, (wx, wy) => {
      const g = ctx.createRadialGradient(wx, wy, 0, wx, wy, margin);
      g.addColorStop(0, `rgba(150, 188, 92, ${0.018 + hash(i, 35, 5) * 0.018})`);
      g.addColorStop(1, 'rgba(150, 188, 92, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(wx, wy, rx, ry, hash(i, 43, 6) * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.lineCap = 'round';
  for (let i = 0; i < 12500; i++) {
    const x = hash(i, 53, 7) * size;
    const y = hash(i, 61, 8) * size;
    const len = 5 + hash(i, 67, 9) * 18;
    const angle = -0.8 + hash(i, 71, 10) * 1.6;
    const light = hash(i, 79, 11) > 0.55;
    ctx.strokeStyle = light ? 'rgba(176, 207, 108, 0.09)' : 'rgba(29, 72, 34, 0.14)';
    ctx.lineWidth = 1;
    wrapped(x, y, len + 2, (wx, wy) => {
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.lineTo(wx + Math.cos(angle) * len, wy + Math.sin(angle) * len);
      ctx.stroke();
    });
  }
  scene.textures.addCanvas('grass_field_texture', canvas);
}

function addGrassWorldWashes(scene) {
  const rand = (i, seed) => {
    const n = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453123;
    return n - Math.floor(n);
  };
  const g = scene.add.graphics().setDepth(-1009);
  for (let i = 0; i < 320; i++) {
    const x = rand(i, 1201) * WORLD_W;
    const y = rand(i, 1202) * WORLD_H;
    const w = 180 + rand(i, 1203) * 540;
    const h = 90 + rand(i, 1204) * 280;
    const light = rand(i, 1205) > 0.48;
    g.fillStyle(light ? 0x89aa55 : 0x345f31, light ? 0.012 : 0.018);
    g.fillEllipse(x, y, w, h);
  }
  for (let i = 0; i < 1300; i++) {
    const x = rand(i, 1301) * WORLD_W;
    const y = rand(i, 1302) * WORLD_H;
    const w = 34 + rand(i, 1303) * 100;
    const h = 14 + rand(i, 1304) * 52;
    g.fillStyle(0x7fa854, 0.014);
    g.fillEllipse(x, y, w, h);
  }
}

function addPathWashes(scene) {
  const g = scene.add.graphics().setDepth(-1002);
  const isPath = (r, c) => r >= 0 && c >= 0 && r < MAP_ROWS && c < MAP_COLS
    && getCellType(r, c) !== 'grass';
  const pathPoint = (r, c) => {
    const type = getCellType(r, c);
    const wide = type === 'path_cross' || type === 'path_open';
    const jitter = wide ? 10 : 22;
    return {
      x: c * TILE_SIZE + TILE_SIZE / 2 + (tileNoise(r, c, 1411) - 0.5) * jitter,
      y: r * TILE_SIZE + TILE_SIZE / 2 + (tileNoise(r, c, 1412) - 0.5) * jitter,
      wide,
    };
  };
  const addPathEdgeFleck = (x, y, color, alpha, longAxis, side) => {
    const w = Phaser.Math.Between(7, 24);
    const h = Phaser.Math.Between(3, 9);
    g.fillStyle(color, alpha);
    if (Phaser.Math.Between(0, 2) === 0) {
      g.fillTriangle(
        x - longAxis.x * w * 0.55, y - longAxis.y * w * 0.55,
        x + longAxis.x * w * 0.55, y + longAxis.y * w * 0.55,
        x + side.x * h, y + side.y * h,
      );
    } else {
      g.fillRect(x - w * 0.5, y - h * 0.5, w, h);
    }
  };
  const roadSegment = (a, b) => {
    const wide = a.wide || b.wide;
    const outer = wide ? 122 : 102;
    const mid = wide ? 84 : 70;
    const inner = wide ? 42 : 34;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const bend = Phaser.Math.FloatBetween(-34, 34);
    const cx = (a.x + b.x) / 2 + nx * bend;
    const cy = (a.y + b.y) / 2 + ny * bend * 0.55;
    const stroke = (width, color, alpha) => {
      g.lineStyle(width, color, alpha);
      g.lineBetween(a.x, a.y, cx, cy);
      g.lineBetween(cx, cy, b.x, b.y);
    };
    stroke(outer, 0x6f5a34, 0.075);
    stroke(mid, 0x94723f, 0.105);
    stroke(inner, 0xb1894f, 0.058);
    const pointAt = (t) => {
      if (t < 0.5) {
        const u = t * 2;
        return { x: Phaser.Math.Linear(a.x, cx, u), y: Phaser.Math.Linear(a.y, cy, u) };
      }
      const u = (t - 0.5) * 2;
      return { x: Phaser.Math.Linear(cx, b.x, u), y: Phaser.Math.Linear(cy, b.y, u) };
    };
    const tx = dx / len;
    const ty = dy / len;
    const tangent = { x: tx, y: ty };
    const normal = { x: nx, y: ny };
    const flecks = Math.max(6, Math.floor(len / 20));
    for (let i = 0; i < flecks; i++) {
      const t = Phaser.Math.Clamp((i + Phaser.Math.FloatBetween(0.08, 0.92)) / flecks, 0.03, 0.97);
      const p = pointAt(t);
      for (const sign of [-1, 1]) {
        if (Phaser.Math.Between(0, wide ? 4 : 5) === 0) continue;
        const edge = outer * 0.48 + Phaser.Math.Between(-16, 22);
        const side = { x: normal.x * sign, y: normal.y * sign };
        const x = p.x + side.x * edge + Phaser.Math.Between(-7, 7);
        const y = p.y + side.y * edge + Phaser.Math.Between(-5, 5);
        const dirt = Phaser.Math.Between(0, 9) > 2;
        addPathEdgeFleck(
          x, y,
          dirt ? Phaser.Utils.Array.GetRandom([0x7a5d36, 0xa9824c, 0x5f4c31]) : Phaser.Utils.Array.GetRandom([0x567642, 0x739452]),
          dirt ? Phaser.Math.FloatBetween(0.24, 0.40) : Phaser.Math.FloatBetween(0.18, 0.30),
          tangent,
          side,
        );
      }
    }
    const stitchCount = Math.max(3, Math.floor(len / 42));
    for (const sign of [-1, 1]) {
      for (let i = 0; i < stitchCount; i++) {
        if (Phaser.Math.Between(0, 4) === 0) continue;
        const t0 = Phaser.Math.Clamp((i + Phaser.Math.FloatBetween(0.04, 0.32)) / stitchCount, 0.02, 0.96);
        const t1 = Phaser.Math.Clamp(t0 + Phaser.Math.FloatBetween(0.035, 0.085), 0.04, 0.98);
        const p0 = pointAt(t0);
        const p1 = pointAt(t1);
        const edge = outer * 0.48 + Phaser.Math.Between(-12, 18);
        const side = { x: normal.x * sign, y: normal.y * sign };
        g.lineStyle(Phaser.Math.Between(1, 3), Phaser.Utils.Array.GetRandom([0x5b4a30, 0x8a683c, 0x587240]), Phaser.Math.FloatBetween(0.20, 0.34));
        g.lineBetween(
          p0.x + side.x * edge + Phaser.Math.Between(-5, 5),
          p0.y + side.y * edge + Phaser.Math.Between(-4, 4),
          p1.x + side.x * edge + Phaser.Math.Between(-5, 5),
          p1.y + side.y * edge + Phaser.Math.Between(-4, 4),
        );
      }
    }
  };
  const roadNode = (r, c) => {
    const p = pathPoint(r, c);
    const radius = p.wide ? 72 : 58;
    const blob = (cx, cy, rx, ry, color, alpha, salt) => {
      g.fillStyle(color, alpha);
      g.beginPath();
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        const n = 0.76 + tileNoise(r + i, c + salt, 1470 + i) * 0.34;
        const x = cx + Math.cos(a) * rx * n;
        const y = cy + Math.sin(a) * ry * n;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      g.fillPath();
    };
    blob(p.x, p.y, radius, radius * 0.72, 0x80613a, p.wide ? 0.15 : 0.13, 1);
    blob(
      p.x + (tileNoise(r, c, 1421) - 0.5) * 24,
      p.y + (tileNoise(r, c, 1422) - 0.5) * 18,
      radius * 0.54,
      radius * 0.38,
      0xa17a43,
      0.10,
      2,
    );
    for (let i = 0; i < 3; i++) {
      if (tileNoise(r, c, 1430 + i) < 0.46) continue;
      const a = tileNoise(r, c, 1440 + i) * Math.PI * 2;
      const dist = radius * Phaser.Math.FloatBetween(0.65, 1.12);
      const x = p.x + Math.cos(a) * dist + Phaser.Math.Between(-10, 10);
      const y = p.y + Math.sin(a) * dist * 0.72 + Phaser.Math.Between(-8, 8);
      g.fillStyle(i % 2 === 0 ? 0x5f7f47 : 0x6b5734, i % 2 === 0 ? 0.035 : 0.062);
      g.fillEllipse(x, y, Phaser.Math.Between(28, 74), Phaser.Math.Between(12, 32));
    }
    for (let i = 0; i < 12; i++) {
      if (tileNoise(r, c, 1450 + i) < 0.28) continue;
      const a = tileNoise(r, c, 1460 + i) * Math.PI * 2;
      const dist = radius * Phaser.Math.FloatBetween(0.78, 1.18);
      const x = p.x + Math.cos(a) * dist + Phaser.Math.Between(-12, 12);
      const y = p.y + Math.sin(a) * dist * 0.78 + Phaser.Math.Between(-8, 8);
      const tangent = { x: Math.cos(a + Math.PI / 2), y: Math.sin(a + Math.PI / 2) * 0.55 };
      const side = { x: Math.cos(a), y: Math.sin(a) };
      addPathEdgeFleck(
        x, y,
        Phaser.Utils.Array.GetRandom([0x6b5433, 0x8a6a3d, 0x658347]),
        Phaser.Math.FloatBetween(0.18, 0.34),
        tangent,
        side,
      );
    }
  };

  for (let r = 0; r < MAP_ROWS; r++) {
    for (let c = 0; c < MAP_COLS; c++) {
      if (!isPath(r, c)) continue;
      const a = pathPoint(r, c);
      const type = getCellType(r, c);
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        if (!isPath(r + dr, c + dc)) continue;
        const neighborType = getCellType(r + dr, c + dc);
        if (dr !== 0 && dc !== 0 && type !== 'path_diag' && neighborType !== 'path_diag') continue;
        roadSegment(a, pathPoint(r + dr, c + dc));
      }
    }
  }
  for (let r = 0; r < MAP_ROWS; r++) {
    for (let c = 0; c < MAP_COLS; c++) {
      if (isPath(r, c)) roadNode(r, c);
    }
  }
}

function addShorelineBanks(scene) {
  const g = scene.add.graphics().setDepth(-946);
  const dirs = [
    { dr: -1, dc: 0 }, { dr: 1, dc: 0 },
    { dr: 0, dc: -1 }, { dr: 0, dc: 1 },
  ];
  let bankCount = 0;
  for (let r = 1; r < MAP_ROWS - 1; r++) {
    for (let c = 1; c < MAP_COLS - 1; c++) {
      if (bankCount >= 520 || getZone(r, c) !== 'riverside' || getCellType(r, c) !== 'grass') continue;
      const edge = dirs.find(({ dr, dc }) => getZone(r + dr, c + dc) !== 'riverside');
      if (!edge || tileNoise(r, c, 1811) < 0.36) continue;
      const x = c * TILE_SIZE + TILE_SIZE / 2 + Phaser.Math.Between(-34, 34);
      const y = r * TILE_SIZE + TILE_SIZE / 2 + Phaser.Math.Between(-24, 24);
      const tangentX = edge.dr !== 0 ? 1 : 0;
      const tangentY = edge.dc !== 0 ? 1 : 0;
      const len = Phaser.Math.Between(54, 132);
      const sandAlpha = Phaser.Math.FloatBetween(0.055, 0.095);
      g.fillStyle(0xb99d6a, sandAlpha);
      g.fillEllipse(x, y, len, Phaser.Math.Between(18, 34));
      g.lineStyle(2, 0x6a5b3c, Phaser.Math.FloatBetween(0.08, 0.14));
      g.lineBetween(x - tangentX * len * 0.46, y - tangentY * len * 0.46 + 3,
        x + tangentX * len * 0.46, y + tangentY * len * 0.46 + 3);
      if (tileNoise(r, c, 1812) > 0.72) {
        g.fillStyle(0xd0c08f, 0.10);
        g.fillEllipse(x + Phaser.Math.Between(-18, 18), y + Phaser.Math.Between(-10, 10), 24, 10);
      }
      bankCount++;
    }
  }
}

// Biome identity = large irregular feathered blobs painted on the neutral
// grass base, like the pond. Each non-grasslands zone gets clusters of
// overlapping radial-alpha circles. This is a graphics-only proof until
// proper biome_*_blob.png art ships (see asset list in HANDOFF.md).
function addBiomeWash(scene) {
  const biomes = {
    forest:    { textureKey: 'biome_forest_blob',    color: 0x4d7a3e, peakAlpha: 0.36, stamps: 8 },
    desert:    { textureKey: 'biome_desert_blob',    color: 0xd9aa5c, peakAlpha: 0.46, stamps: 8 },
    ruins:     { textureKey: 'biome_ruins_blob',     color: 0x9b8e72, peakAlpha: 0.32, stamps: 6 },
    riverside: { textureKey: 'biome_riverside_blob', color: 0x6db5cc, peakAlpha: 0.32, stamps: 7 },
  };
  Object.keys(biomes).forEach((zone) => {
    const { textureKey, color, peakAlpha, stamps } = biomes[zone];
    const useImage = textureKey && scene.textures.exists(textureKey);
    // Shared graphics object for the fallback path (no image asset).
    const g = !useImage ? scene.add.graphics().setDepth(-980) : null;
    let placed = 0;
    let attempts = 0;
    while (placed < stamps && attempts < 1200) {
      attempts++;
      const r = Phaser.Math.Between(0, MAP_ROWS - 1);
      const c = Phaser.Math.Between(0, MAP_COLS - 1);
      if (getZone(r, c) !== zone) continue;
      placed++;
      const cx = c * TILE_SIZE + TILE_SIZE / 2;
      const cy = r * TILE_SIZE + TILE_SIZE / 2;
      if (useImage) {
        // Pond-style: one large feathered PNG stamped on the grass.
        // Two overlapping placements per stamp for irregular silhouette
        // and full zone coverage.
        for (let k = 0; k < 2; k++) {
          const ox = Phaser.Math.Between(-260, 260);
          const oy = Phaser.Math.Between(-260, 260);
          const img = scene.add.image(cx + ox, cy + oy, textureKey);
          const widthPx = Phaser.Math.Between(1400, 2200);
          img.setScale(widthPx / img.width);
          img.setAlpha(Phaser.Math.FloatBetween(0.65, 0.85));
          img.setAngle(Phaser.Math.Between(0, 359));
          if (Math.random() < 0.5) img.setFlipX(true);
          if (Math.random() < 0.5) img.setFlipY(true);
          img.setDepth(-980);
        }
      } else {
        // Fallback: graphics-only feathered radial-alpha blob clusters.
        for (let k = 0; k < 4; k++) {
          const ox = Phaser.Math.Between(-280, 280);
          const oy = Phaser.Math.Between(-280, 280);
          const radius = Phaser.Math.Between(420, 720);
          const layers = 9;
          for (let j = 0; j < layers; j++) {
            const t = j / (layers - 1);
            const a = peakAlpha * (1 - t * t);
            g.fillStyle(color, a);
            g.fillCircle(cx + ox, cy + oy, radius * (1 - t * 0.9));
          }
        }
      }
    }
  });
}

// Pseudo-2.5D terrain cues. RO's real depth comes from 3D terrain; this pass
// fakes a little of that with hand-painted ridge/bank strokes on the ground
// layer instead of prop shadows or tile-height changes.
function addTerrainRelief(scene) {
  const g = scene.add.graphics().setDepth(-958);
  const pathDir = (r, c) => {
    const dirs = [
      { dr: -1, dc: 0 }, { dr: 1, dc: 0 },
      { dr: 0, dc: -1 }, { dr: 0, dc: 1 },
    ];
    return dirs.find(({ dr, dc }) => {
      const nr = Phaser.Math.Clamp(r + dr, 0, MAP_ROWS - 1);
      const nc = Phaser.Math.Clamp(c + dc, 0, MAP_COLS - 1);
      return getCellType(nr, nc) !== 'grass';
    });
  };
  const boundaryDir = (r, c) => {
    const z = getZone(r, c);
    const dirs = [
      { dr: -1, dc: 0 }, { dr: 1, dc: 0 },
      { dr: 0, dc: -1 }, { dr: 0, dc: 1 },
    ];
    return dirs.find(({ dr, dc }) => {
      const nr = Phaser.Math.Clamp(r + dr, 0, MAP_ROWS - 1);
      const nc = Phaser.Math.Clamp(c + dc, 0, MAP_COLS - 1);
      return getZone(nr, nc) !== z;
    });
  };
  const reliefTint = (zone) => ({
    grasslands: { hi: 0xcfe2a2, lo: 0x375f2f },
    forest:     { hi: 0xaec995, lo: 0x243f24 },
    desert:     { hi: 0xf0cd83, lo: 0x8a6638 },
    ruins:      { hi: 0xd4c9ae, lo: 0x5a5548 },
    riverside:  { hi: 0xb9dfc9, lo: 0x32686d },
  }[zone] || { hi: 0xd5e2ad, lo: 0x365f31 });
  const stroke = (x, y, dir, zone, salt, strength = 1) => {
    const tangentX = dir.dr !== 0 ? 1 : 0;
    const tangentY = dir.dc !== 0 ? 1 : 0;
    const len = 34 + tileNoise(Math.floor(y / TILE_SIZE), Math.floor(x / TILE_SIZE), salt) * 72;
    const wobble = (tileNoise(Math.floor(y / TILE_SIZE), Math.floor(x / TILE_SIZE), salt + 1) - 0.5) * 18;
    const ox = tangentY ? wobble : 0;
    const oy = tangentX ? wobble : 0;
    const tint = reliefTint(zone);
    g.lineStyle(3, tint.lo, 0.08 * strength);
    g.lineBetween(x - tangentX * len * 0.5 + ox, y - tangentY * len * 0.5 + oy + 5,
      x + tangentX * len * 0.5 + ox, y + tangentY * len * 0.5 + oy + 5);
    g.lineStyle(1, tint.hi, 0.11 * strength);
    g.lineBetween(x - tangentX * len * 0.45 + ox, y - tangentY * len * 0.45 + oy - 3,
      x + tangentX * len * 0.45 + ox, y + tangentY * len * 0.45 + oy - 3);
  };

  let count = 0;
  for (let r = 1; r < MAP_ROWS - 1; r++) {
    for (let c = 1; c < MAP_COLS - 1; c++) {
      if (getCellType(r, c) !== 'grass' || count >= 680) continue;
      const zone = getZone(r, c);
      const road = pathDir(r, c);
      const edge = boundaryDir(r, c);
      const n = tileNoise(r, c, road ? 1701 : 1702);
      if (road && n > 0.58) {
        stroke(c * TILE_SIZE + TILE_SIZE / 2 + Phaser.Math.Between(-44, 44),
          r * TILE_SIZE + TILE_SIZE / 2 + Phaser.Math.Between(-28, 28), road, zone, 1711, zone === 'grasslands' ? 0.75 : 1);
        count++;
      } else if (edge && n > 0.72) {
        stroke(c * TILE_SIZE + TILE_SIZE / 2 + Phaser.Math.Between(-52, 52),
          r * TILE_SIZE + TILE_SIZE / 2 + Phaser.Math.Between(-34, 34), edge, zone, 1721, zone === 'riverside' ? 1.2 : 0.9);
        count++;
      } else if (n > (zone === 'grasslands' ? 0.955 : 0.978)) {
        const dir = tileNoise(r, c, 1703) > 0.5 ? { dr: 1, dc: 0 } : { dr: 0, dc: 1 };
        stroke(c * TILE_SIZE + TILE_SIZE / 2 + Phaser.Math.Between(-58, 58),
          r * TILE_SIZE + TILE_SIZE / 2 + Phaser.Math.Between(-36, 36), dir, zone, 1731, zone === 'grasslands' ? 0.58 : 0.72);
        count++;
      }
    }
  }
}

// Grass texture marks — tiny blade-like strokes and pin specks across the
// grasslands floor. Circular tone stamps read like bokeh/lawn spots at this
// zoom, so keep each mark small and directional.
function addGrassTones(scene) {
  const tones = [
    { color: 0x2f582b, alphaRange: [0.16, 0.24], stamps: 1400, length: [8, 22] },
    { color: 0x8fb86a, alphaRange: [0.10, 0.18], stamps: 1000, length: [6, 18] },
    { color: 0x5f8444, alphaRange: [0.12, 0.20], stamps: 1200, length: [7, 20] },
  ];
  tones.forEach(({ color, alphaRange, stamps, length }) => {
    const g = scene.add.graphics().setDepth(-960);
    let placed = 0, attempts = 0;
    while (placed < stamps && attempts < stamps * 6) {
      attempts++;
      const r = Phaser.Math.Between(0, MAP_ROWS - 1);
      const c = Phaser.Math.Between(0, MAP_COLS - 1);
      if (getZone(r, c) !== 'grasslands') continue;
      if (getCellType(r, c) !== 'grass') continue;
      placed++;
      const cx = c * TILE_SIZE + Phaser.Math.Between(0, TILE_SIZE);
      const cy = r * TILE_SIZE + Phaser.Math.Between(0, TILE_SIZE);
      const len = Phaser.Math.Between(length[0], length[1]);
      const a = Phaser.Math.FloatBetween(alphaRange[0], alphaRange[1]);
      const angle = Phaser.Math.FloatBetween(-0.95, 0.95);
      const dx = Math.cos(angle) * len;
      const dy = Math.sin(angle) * len * 0.42;
      g.lineStyle(1, color, a);
      g.lineBetween(cx - dx * 0.5, cy - dy * 0.5, cx + dx * 0.5, cy + dy * 0.5);
      if (Phaser.Math.Between(0, 4) === 0) {
        g.fillStyle(color, a * 0.55);
        g.fillRect(cx, cy, 2, 2);
      }
    }
  });
  const patchColors = [0x294f2c, 0x4d6e35, 0x78984f, 0x9b965e, 0xc3b06f];
  const g = scene.add.graphics().setDepth(-959);
  let patches = 0, attempts = 0;
  while (patches < 520 && attempts < 5200) {
    attempts++;
    const r = Phaser.Math.Between(0, MAP_ROWS - 1);
    const c = Phaser.Math.Between(0, MAP_COLS - 1);
    if (getZone(r, c) !== 'grasslands' || getCellType(r, c) !== 'grass') continue;
    if (tileNoise(r, c, 2231) < 0.43) continue;
    patches++;
    const cx = c * TILE_SIZE + Phaser.Math.Between(8, TILE_SIZE - 8);
    const cy = r * TILE_SIZE + Phaser.Math.Between(8, TILE_SIZE - 8);
    const marks = Phaser.Math.Between(5, 13);
    const spreadX = Phaser.Math.Between(18, 68);
    const spreadY = Phaser.Math.Between(10, 34);
    for (let i = 0; i < marks; i++) {
      const x = cx + Phaser.Math.Between(-spreadX, spreadX);
      const y = cy + Phaser.Math.Between(-spreadY, spreadY);
      const len = Phaser.Math.Between(5, 26);
      const angle = Phaser.Math.FloatBetween(-1.1, 1.1);
      const dx = Math.cos(angle) * len;
      const dy = Math.sin(angle) * len * 0.42;
      const color = Phaser.Utils.Array.GetRandom(patchColors);
      const alpha = color === 0xc3b06f ? Phaser.Math.FloatBetween(0.07, 0.13) : Phaser.Math.FloatBetween(0.08, 0.18);
      g.lineStyle(1, color, alpha);
      g.lineBetween(x - dx * 0.5, y - dy * 0.5, x + dx * 0.5, y + dy * 0.5);
      if (Phaser.Math.Between(0, 5) === 0) {
        g.fillStyle(0xb8b08a, 0.08);
        g.fillRect(x + Phaser.Math.Between(-4, 4), y + Phaser.Math.Between(-4, 4), 2, 2);
      }
    }
  }
}

function addTerrainSeamBlends(scene) {
  let blendCount = 0;

  const addOrganicBlend = (r, c, zone, zones, distance) => {
    const neighborZone = zones.find((z) => z !== zone) || zone;
    const key = terrainBlendAsset(zone, neighborZone);
    if (!scene.textures.exists(key)) return;
    const closeness = Phaser.Math.Clamp(4 - (distance || 3), 1, 3);
    const x = c * TILE_SIZE + TILE_SIZE / 2 + Phaser.Math.Between(-72, 72);
    const y = r * TILE_SIZE + TILE_SIZE / 2 + Phaser.Math.Between(-64, 64);
    const img = scene.add.image(x, y, key);
    img.setScale(Phaser.Math.Between(620, 1180) / img.height);
    img.setAngle(Phaser.Math.Between(0, 359));
    img.setAlpha(Phaser.Math.FloatBetween(0.055, 0.115) * closeness);
    img.setTint(terrainBlendTint(zone, neighborZone));
    img.setDepth(-948 + closeness);
    blendCount++;
  };

  for (let r = 1; r < MAP_ROWS - 1; r++) {
    for (let c = 1; c < MAP_COLS - 1; c++) {
      if (getCellType(r, c) !== 'grass') continue;
      const zone = getZone(r, c);
      const boundaryInfo = terrainBoundaryInfo(r, c, 3);
      if (boundaryInfo.distance === null) continue;
      const boundaryZones = [...boundaryInfo.zones];
      const threshold = boundaryInfo.distance === 1 ? 0.28 : (boundaryInfo.distance === 2 ? 0.54 : 0.76);
      if (blendCount < 460 && tileNoise(r, c, 751) > threshold) {
        addOrganicBlend(r, c, zone, boundaryZones, boundaryInfo.distance);
      }
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
  const forestFernKeys = scene.textures.exists('forest_fern_01') ? ['forest_fern_01'] : grassKeys;
  const ruinsPillarKeys = scene.textures.exists('ruins_pillar_broken_01') ? ['ruins_pillar_broken_01'] : [];
  const riversideCattailKeys = scene.textures.exists('riverside_cattail_01') ? ['riverside_cattail_01'] : grassKeys;

  const addCanvasTexture = (key, width, height, draw) => {
    if (scene.textures.exists(key)) return;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    draw(ctx, width, height);
    scene.textures.addCanvas(key, canvas);
  };

  const ensureStructureTextures = () => {
    addCanvasTexture('camp_tent_canvas', 180, 150, (ctx) => {
      ctx.clearRect(0, 0, 180, 150);
      ctx.fillStyle = 'rgba(66, 50, 32, 0.22)';
      ctx.beginPath();
      ctx.ellipse(90, 126, 70, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#b95f43';
      ctx.beginPath();
      ctx.moveTo(28, 118);
      ctx.lineTo(92, 28);
      ctx.lineTo(154, 118);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#e0b274';
      ctx.beginPath();
      ctx.moveTo(40, 114);
      ctx.lineTo(92, 36);
      ctx.lineTo(95, 118);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#5a372b';
      ctx.beginPath();
      ctx.moveTo(94, 118);
      ctx.lineTo(122, 82);
      ctx.lineTo(146, 118);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#3c2a22';
      ctx.lineWidth = 5;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.strokeStyle = '#ead2a0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(24, 121);
      ctx.lineTo(12, 134);
      ctx.moveTo(158, 121);
      ctx.lineTo(170, 134);
      ctx.stroke();
    });

    addCanvasTexture('camp_fire_canvas', 120, 100, (ctx) => {
      ctx.clearRect(0, 0, 120, 100);
      ctx.fillStyle = 'rgba(62, 42, 28, 0.18)';
      ctx.beginPath();
      ctx.ellipse(60, 78, 42, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#6a4226';
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(30, 78);
      ctx.lineTo(90, 62);
      ctx.moveTo(32, 62);
      ctx.lineTo(88, 80);
      ctx.stroke();
      ctx.fillStyle = '#ffcc55';
      ctx.beginPath();
      ctx.moveTo(60, 20);
      ctx.quadraticCurveTo(34, 58, 58, 72);
      ctx.quadraticCurveTo(86, 54, 60, 20);
      ctx.fill();
      ctx.fillStyle = '#ff7440';
      ctx.beginPath();
      ctx.moveTo(60, 34);
      ctx.quadraticCurveTo(46, 58, 60, 69);
      ctx.quadraticCurveTo(76, 56, 60, 34);
      ctx.fill();
    });

    addCanvasTexture('camp_fence_canvas', 160, 80, (ctx) => {
      ctx.clearRect(0, 0, 160, 80);
      ctx.strokeStyle = '#7a522e';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(18, 38);
      ctx.lineTo(142, 26);
      ctx.moveTo(18, 58);
      ctx.lineTo(142, 46);
      ctx.stroke();
      ctx.strokeStyle = '#4b301f';
      ctx.lineWidth = 10;
      for (const x of [32, 76, 120]) {
        ctx.beginPath();
        ctx.moveTo(x, 20);
        ctx.lineTo(x - 6, 64);
        ctx.stroke();
      }
    });

    addCanvasTexture('camp_wagon_canvas', 210, 130, (ctx) => {
      ctx.clearRect(0, 0, 210, 130);
      ctx.fillStyle = '#8a5a2f';
      ctx.strokeStyle = '#3c291c';
      ctx.lineWidth = 5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(42, 72);
      ctx.lineTo(144, 50);
      ctx.lineTo(170, 76);
      ctx.lineTo(65, 102);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#d0a060';
      ctx.lineWidth = 4;
      for (const off of [0, 28, 56]) {
        ctx.beginPath();
        ctx.moveTo(58 + off, 70 - off * 0.18);
        ctx.lineTo(80 + off, 94 - off * 0.18);
        ctx.stroke();
      }
      ctx.strokeStyle = '#604020';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(142, 62);
      ctx.lineTo(196, 38);
      ctx.stroke();
      for (const wheel of [{ x: 72, y: 100 }, { x: 154, y: 80 }]) {
        ctx.fillStyle = '#2b2118';
        ctx.beginPath();
        ctx.ellipse(wheel.x, wheel.y, 18, 14, -0.18, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#b8874a';
        ctx.lineWidth = 4;
        ctx.stroke();
      }
    });

    addCanvasTexture('camp_logbench_canvas', 170, 72, (ctx) => {
      ctx.clearRect(0, 0, 170, 72);
      ctx.lineCap = 'round';
      for (const row of [
        { y: 30, color: '#8a5428', light: '#d39b58' },
        { y: 44, color: '#67411f', light: '#b87a3d' },
      ]) {
        ctx.strokeStyle = '#2e2017';
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.moveTo(28, row.y + 5);
        ctx.lineTo(140, row.y - 9);
        ctx.stroke();
        ctx.strokeStyle = row.color;
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(28, row.y + 5);
        ctx.lineTo(140, row.y - 9);
        ctx.stroke();
        ctx.strokeStyle = row.light;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(36, row.y + 1);
        ctx.lineTo(132, row.y - 11);
        ctx.stroke();
      }
    });

    addCanvasTexture('camp_pot_canvas', 90, 92, (ctx) => {
      ctx.clearRect(0, 0, 90, 92);
      ctx.strokeStyle = '#3a3029';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(22, 58);
      ctx.quadraticCurveTo(45, 18, 68, 58);
      ctx.stroke();
      ctx.fillStyle = '#332a27';
      ctx.beginPath();
      ctx.ellipse(45, 62, 27, 19, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5a5046';
      ctx.beginPath();
      ctx.ellipse(45, 52, 25, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 244, 170, 0.55)';
      ctx.beginPath();
      ctx.ellipse(45, 49, 14, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    addCanvasTexture('ruin_base_canvas', 300, 210, (ctx) => {
      ctx.clearRect(0, 0, 300, 210);
      ctx.fillStyle = 'rgba(94, 84, 68, 0.18)';
      ctx.beginPath();
      ctx.ellipse(150, 154, 120, 30, -0.05, 0, Math.PI * 2);
      ctx.fill();
      const stonePoly = (points, fill, stroke = '#57513f') => {
        ctx.fillStyle = fill;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 4;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (const p of points.slice(1)) ctx.lineTo(p[0], p[1]);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(230, 224, 190, 0.20)';
        ctx.beginPath();
        ctx.ellipse(points[0][0] + 20, points[0][1] + 8, 22, 4, -0.16, 0, Math.PI * 2);
        ctx.fill();
      };
      const stones = [
        [[54, 128], [114, 116], [133, 144], [63, 154]],
        [[126, 112], [186, 103], [202, 129], [134, 145]],
        [[194, 124], [244, 116], [266, 139], [210, 154]],
        [[84, 157], [142, 146], [159, 169], [91, 181]],
        [[153, 148], [218, 143], [231, 168], [166, 179]],
        [[48, 171], [92, 164], [103, 185], [57, 190]],
      ];
      stones.forEach((points, i) => stonePoly(points, i % 2 ? '#8f927d' : '#a6a18a'));
      ctx.strokeStyle = '#6e644d';
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(70, 122);
      ctx.lineTo(91, 82);
      ctx.lineTo(113, 118);
      ctx.moveTo(215, 120);
      ctx.lineTo(232, 78);
      ctx.lineTo(251, 117);
      ctx.moveTo(118, 98);
      ctx.lineTo(149, 72);
      ctx.lineTo(181, 101);
      ctx.stroke();
    });

    addCanvasTexture('boulder_anchor_canvas', 260, 180, (ctx) => {
      ctx.clearRect(0, 0, 260, 180);
      const rocks = [
        [86, 106, 66, 44, '#8f9484'], [136, 90, 78, 58, '#a4a18d'],
        [176, 122, 64, 42, '#77796d'], [92, 135, 96, 36, '#6e7468'],
      ];
      for (const [x, y, w, h, color] of rocks) {
        ctx.fillStyle = color;
        ctx.strokeStyle = '#45483d';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.ellipse(x, y, w / 2, h / 2, -0.12, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(238, 235, 204, 0.22)';
        ctx.beginPath();
        ctx.ellipse(x - w * 0.12, y - h * 0.16, w * 0.22, h * 0.08, -0.1, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  };
  ensureStructureTextures();

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

  // Decoration shadows make props look like they are hovering on this
  // flattened field art. Keep this helper a no-op; player/monster shadows
  // use separate code paths and still ground moving characters.
  const addPropShadow = (_img, _x, _y, _opts = {}) => null;
  const addStructureContact = (img, x, y, opts = {}) => {
    if (!opts.contact) return;
    const cfg = opts.contact === true ? {} : opts.contact;
    const width = cfg.width ?? Math.max(44, img.displayWidth * 0.82);
    const height = cfg.height ?? Math.max(14, Math.min(54, img.displayHeight * 0.18));
    const angle = Phaser.Math.DegToRad(cfg.angle ?? opts.angle ?? img.angle ?? 0);
    const cx = x + (cfg.xOffset ?? 0);
    const cy = y + (cfg.yOffset ?? (opts.alignBottom ? -height * 0.18 : height * 0.16));
    const depth = cfg.depth ?? (opts.alignBottom ? y - 0.65 : (opts.depth ?? -560) - 0.35);
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const vx = -Math.sin(angle);
    const vy = Math.cos(angle);
    const g = scene.add.graphics().setDepth(depth);
    for (let layer = 0; layer < 2; layer++) {
      const rx = width * (layer === 0 ? 0.52 : 0.38);
      const ry = height * (layer === 0 ? 0.52 : 0.36);
      const alpha = (cfg.alpha ?? 0.11) * (layer === 0 ? 1 : 0.72);
      g.fillStyle(layer === 0 ? 0x2b2117 : 0x6b5331, alpha);
      g.beginPath();
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const n = Phaser.Math.FloatBetween(0.78, 1.10);
        const lx = Math.cos(a) * rx * n;
        const ly = Math.sin(a) * ry * n;
        const px = cx + ux * lx + vx * ly;
        const py = cy + uy * lx + vy * ly;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      g.fillPath();
    }
    for (let i = 0; i < (cfg.scuffs ?? 9); i++) {
      const lx = Phaser.Math.FloatBetween(-width * 0.44, width * 0.44);
      const ly = Phaser.Math.FloatBetween(-height * 0.38, height * 0.38);
      const len = Phaser.Math.Between(6, 24);
      const px = cx + ux * lx + vx * ly;
      const py = cy + uy * lx + vy * ly;
      g.lineStyle(1, Phaser.Utils.Array.GetRandom([0x1d160f, 0x59472b, 0x758342]), Phaser.Math.FloatBetween(0.07, 0.16));
      g.lineBetween(px - ux * len * 0.5, py - uy * len * 0.5, px + ux * len * 0.5, py + uy * len * 0.5);
    }
  };
  const addBaseOverlapCluster = (x, y, opts = {}, countRange = [1, 3]) => {
    const baseClusterChance = opts.baseCluster ?? 0;
    if (!baseClusterChance || !opts.alignBottom || Math.random() >= baseClusterChance) return;
    const count = Phaser.Math.Between(countRange[0], countRange[1]);
    for (let i = 0; i < count; i++) {
      const underKey = Phaser.Utils.Array.GetRandom(
        i === 0 ? grassKeys : [...grassKeys, ...flowerKeys, ...mushroomKeys]
      );
      if (!scene.textures.exists(underKey)) continue;
      const spr = scene.add.image(
        x + Phaser.Math.Between(-36, 36),
        y + Phaser.Math.Between(8, 32),
        underKey
      );
      const h = Phaser.Math.Between(34, 56);
      spr.setScale((h / spr.height) * Phaser.Math.FloatBetween(0.82, 1.18));
      spr.setAngle(Phaser.Math.Between(-18, 18));
      if (Math.random() < 0.5) spr.setFlipX(true);
      spr.setAlpha(Phaser.Math.FloatBetween(0.82, 0.96));
      if (opts.tint && Math.random() < 0.5) spr.setTint(opts.tint);
      spr.setDepth(y + 0.15 + i * 0.01);
    }
  };

  // Generic scatter. By default decorations are flat overlays under entities.
  // `alignBottom` anchors true standing props at their base so the depth-sort
  // uses the exact point where the sprite touches the ground.
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
      img.setOrigin(0.5, 1);
      // Y-sort: the base of the sprite is what we sort against.
      img.setDepth(y);
    } else {
      img.setDepth(opts.depth ?? -500);
    }
    img.setAlpha(opts.alpha ?? 1);
    if (opts.tint) img.setTint(opts.tint);
    if (opts.shadow) addPropShadow(img, x, y, opts);
    const baseClusterChance = opts.baseCluster ?? (opts.alignBottom && !opts.shimmer ? 0.34 : 0);
    if (baseClusterChance && opts.alignBottom && Math.random() < baseClusterChance) {
      const count = Phaser.Math.Between(2, 4);
      for (let i = 0; i < count; i++) {
        const underKey = Phaser.Utils.Array.GetRandom(
          i === 0 ? grassKeys : [...grassKeys, ...flowerKeys, ...mushroomKeys]
        );
        if (!scene.textures.exists(underKey)) continue;
        const ox = Phaser.Math.Between(-34, 34);
        const oy = Phaser.Math.Between(6, 30);
        const spr = scene.add.image(x + ox, y + oy, underKey);
        const h = Phaser.Math.Between(36, 56);
        spr.setScale((h / spr.height) * Phaser.Math.FloatBetween(0.82, 1.18));
        spr.setAngle(Phaser.Math.Between(-18, 18));
        if (Math.random() < 0.5) spr.setFlipX(true);
        spr.setAlpha(Phaser.Math.FloatBetween(0.82, 0.96));
        if (opts.tint && Math.random() < 0.55) spr.setTint(opts.tint);
        spr.setDepth(y + 0.15 + i * 0.01);
      }
    }

    if (opts.blockRadius) blockCells(x, y, opts.blockRadius);

    // Wind sway: small angle oscillation makes grass/flower tufts feel
    // alive without animating sprites. Random duration + offset prevents
    // every tuft swaying in lock-step.
    if (opts.sway) {
      const base = img.angle;
      const amp = opts.swayAmp ?? 3;
      const dur = Phaser.Math.Between(1600, 3200);
      const tw = scene.tweens.add({
        targets: img,
        angle: base + amp,
        duration: dur,
        delay: Phaser.Math.Between(0, dur),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      (scene.__swayProps || (scene.__swayProps = [])).push({ img, tween: tw });
    }
    // Water shimmer: pond decorations breathe between two near-identical
    // scales so the surface looks like it's catching light.
    if (opts.shimmer) {
      const base = img.scaleX;
      // Slow breathing — pond surface catching light.
      scene.tweens.add({
        targets: img,
        scaleX: base * 1.06,
        scaleY: base * 1.06,
        alpha: (opts.alpha ?? 1) * 0.86,
        duration: Phaser.Math.Between(1400, 2000),
        delay: Phaser.Math.Between(0, 1400),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      // Subtle rotation drift suggests gentle current.
      scene.tweens.add({
        targets: img,
        angle: img.angle + Phaser.Math.Between(-3, 3),
        duration: Phaser.Math.Between(2200, 3400),
        delay: Phaser.Math.Between(0, 1200),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      // Overlay sparkle dot — tiny white circle that drifts on top of the
      // pond and fades, repeating, so water glints visibly even at rest.
      const sparkle = scene.add.circle(img.x, img.y - 8, 3, 0xffffff, 0.0).setDepth(img.depth + 1);
      scene.tweens.add({
        targets: sparkle,
        alpha: { from: 0, to: 0.85 },
        x: img.x + Phaser.Math.Between(-30, 30),
        y: img.y + Phaser.Math.Between(-18, 8),
        duration: Phaser.Math.Between(1400, 2200),
        delay: Phaser.Math.Between(0, 1800),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
    return img;
  };

  // Cluster scatter — drops N copies of a key near one center point.
  // Real RO maps read as rich because ground cover comes in *patches*
  // (a small thicket of grass tufts, a cluster of flowers around a tree)
  // not as evenly-spaced sprites. This helper plants 4-8 instances
  // within a tile or two of one anchor cell so the eye reads "thicket"
  // instead of "scatter."
  const placeCluster = (key, displayH, count, opts = {}) => {
    const anchorR = Phaser.Math.Between(0, MAP_ROWS - 1);
    const anchorC = Phaser.Math.Between(0, MAP_COLS - 1);
    if (getCellType(anchorR, anchorC) !== 'grass') return;
    if (opts.zoneFilter) {
      const zone = getZone(anchorR, anchorC);
      const allowed = Array.isArray(opts.zoneFilter) ? opts.zoneFilter : [opts.zoneFilter];
      if (!allowed.includes(zone)) return;
    }
    const ax = anchorC * TILE_SIZE + TILE_SIZE / 2;
    const ay = anchorR * TILE_SIZE + TILE_SIZE / 2;
    const spread = opts.spread ?? TILE_SIZE * 1.4;
    for (let i = 0; i < count; i++) {
      const dx = Phaser.Math.Between(-spread, spread);
      const dy = Phaser.Math.Between(-spread, spread);
      const x = ax + dx;
      const y = ay + dy;
      if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) continue;
      const cx = Math.floor(x / CELL_SIZE);
      const cy = Math.floor(y / CELL_SIZE);
      if (walkable && walkable[cy] && walkable[cy][cx] === false) continue;
      const img = scene.add.image(x, y, key);
      const baseScale = (displayH / img.height) * Phaser.Math.FloatBetween(0.85, 1.15);
      img.setScale(baseScale);
      if (opts.allowFlip !== false && Math.random() < 0.5) img.setFlipX(true);
      img.setAngle(opts.maxAngle ? Phaser.Math.Between(-opts.maxAngle, opts.maxAngle) : 0);
      if (opts.alignBottom) {
        img.setOrigin(0.5, 1);
        img.setDepth(y);
      } else {
        img.setDepth(opts.depth ?? -500);
      }
      img.setAlpha(opts.alpha ?? 1);
      if (opts.tint) img.setTint(opts.tint);
      if (opts.shadow) addPropShadow(img, x, y, opts);
      const clusterChance = opts.baseCluster ?? (opts.alignBottom ? 0.24 : 0);
      if (clusterChance && opts.alignBottom && Math.random() < clusterChance) {
        const underKey = Phaser.Utils.Array.GetRandom([...grassKeys, ...flowerKeys, ...mushroomKeys]);
        if (scene.textures.exists(underKey)) {
          const spr = scene.add.image(x + Phaser.Math.Between(-30, 30), y + Phaser.Math.Between(8, 30), underKey);
          const h = Phaser.Math.Between(34, 54);
          spr.setScale((h / spr.height) * Phaser.Math.FloatBetween(0.82, 1.18));
          spr.setAngle(Phaser.Math.Between(-18, 18));
          if (Math.random() < 0.5) spr.setFlipX(true);
          spr.setAlpha(Phaser.Math.FloatBetween(0.82, 0.95));
          if (opts.tint && Math.random() < 0.55) spr.setTint(opts.tint);
          spr.setDepth(y + 0.12);
        }
      }
      // Sway 40% of clustered tufts — keeps total tween count sane
      // while still giving the patch a hint of motion.
      if (opts.sway && Math.random() < 0.4) {
        const base = img.angle;
        const amp = opts.swayAmp ?? 3;
        const dur = Phaser.Math.Between(1600, 3200);
        const tw = scene.tweens.add({
          targets: img, angle: base + amp, duration: dur,
          delay: Phaser.Math.Between(0, dur), yoyo: true, repeat: -1,
          ease: 'Sine.easeInOut',
        });
        (scene.__swayProps || (scene.__swayProps = [])).push({ img, tween: tw });
      }
    }
  };

  const rockKeys = ['deco_rock_01','deco_rock_02','deco_rock_03'];
  const forestTint = 0x9bbf86;
  const desertRockTint = 0xd9c08a;
  const ruinTint = 0xc8c0b0;
  const addLandmarkHalo = (tile_r, tile_c, color) => {
    const x = tile_c * TILE_SIZE + TILE_SIZE / 2;
    const y = tile_r * TILE_SIZE + TILE_SIZE / 2;
    const halo = scene.add.ellipse(x, y + 6, 118, 36, color, 0.012)
      .setStrokeStyle(1, color, 0.035)
      .setDepth(-620);
    scene.tweens.add({
      targets: halo,
      alpha: 0.028,
      scaleX: 1.04,
      scaleY: 1.06,
      duration: 1600,
      yoyo: true,
      repeat: -1,
    });
  };
  for (const p of landmarkTiles()) {
    const z = getZone(p.r, p.c);
    const color = {
      grasslands: 0xffe066,
      forest: 0x77bb66,
      desert: 0xd8aa52,
      ruins: 0xb8b0a0,
      riverside: 0x77ccff,
    }[z] || 0xffffff;
    addLandmarkHalo(p.r, p.c, color);
  }

  const placeLandmarkDeco = (key, x, y, displayH, opts = {}) => {
    if (!scene.textures.exists(key)) return null;
    const img = scene.add.image(x, y, key);
    const baseScale = displayH / img.height;
    img.setScale(baseScale * (opts.scale ?? Phaser.Math.FloatBetween(0.9, 1.12)));
    if (opts.allowFlip !== false && Math.random() < 0.5) img.setFlipX(true);
    img.setAngle(opts.angle ?? Phaser.Math.Between(-(opts.maxAngle ?? 10), opts.maxAngle ?? 10));
    if (opts.alignBottom) {
      img.setOrigin(0.5, 1);
      img.setDepth(y);
    } else {
      img.setDepth(opts.depth ?? -560);
    }
    img.setAlpha(opts.alpha ?? 1);
    if (opts.tint) img.setTint(opts.tint);
    if (opts.shadow) addPropShadow(img, x, y, opts);
    addStructureContact(img, x, y, opts);
    addBaseOverlapCluster(x, y, opts, [1, 3]);
    if (opts.blockRadius) blockCells(x, y, opts.blockRadius);
    if (opts.sway) {
      const base = img.angle;
      const amp = opts.swayAmp ?? 2;
      const dur = Phaser.Math.Between(1800, 3200);
      const tw = scene.tweens.add({
        targets: img,
        angle: base + amp,
        duration: dur,
        delay: Phaser.Math.Between(0, dur),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      (scene.__swayProps || (scene.__swayProps = [])).push({ img, tween: tw });
    }
    return img;
  };

  const placeTileAccent = (tile_r, tile_c, key, displayH, opts = {}) => {
    if (!scene.textures.exists(key)) return null;
    const x = tile_c * TILE_SIZE + TILE_SIZE / 2 + Phaser.Math.Between(-42, 42);
    const y = tile_r * TILE_SIZE + TILE_SIZE / 2 + Phaser.Math.Between(-36, 36);
    return placeLandmarkDeco(key, x, y, displayH, {
      depth: -540,
      alpha: opts.alpha ?? 0.88,
      maxAngle: opts.maxAngle ?? 18,
      tint: opts.tint,
      alignBottom: opts.alignBottom,
      shadow: opts.shadow,
      shadowAlpha: opts.shadowAlpha ?? 0.24,
      allowFlip: opts.allowFlip,
    });
  };

  const addPondEdgeDressing = (pond, zone = 'grasslands') => {
    if (!pond) return;
    const clumpCount = zone === 'riverside' ? 5 : 4;
    const rx = Math.max(92, pond.displayWidth * 0.44);
    const ry = Math.max(50, pond.displayHeight * 0.40);
    for (let clump = 0; clump < clumpCount; clump++) {
      const centerA = (clump / clumpCount) * Math.PI * 2
        + Phaser.Math.FloatBetween(-0.38, 0.38)
        + tileNoise(Math.floor(pond.y / TILE_SIZE), clump, 1751) * 0.42;
      const items = Phaser.Math.Between(zone === 'riverside' ? 5 : 4, zone === 'riverside' ? 8 : 6);
      for (let i = 0; i < items; i++) {
        const a = centerA + Phaser.Math.FloatBetween(-0.34, 0.34);
        const x = pond.x + Math.cos(a) * rx + Phaser.Math.Between(-16, 16);
        const y = pond.y + Math.sin(a) * ry + Phaser.Math.Between(-10, 12);
        const wetSide = Math.sin(a) > -0.35;
        let key;
        let h;
        let opts = { maxAngle: 12, sway: true, swayAmp: 1.2 };
        if ((zone === 'riverside' || wetSide) && tileNoise(i + clump * 11, Math.floor(pond.x / TILE_SIZE), 1752) > 0.22) {
          key = Phaser.Utils.Array.GetRandom(riversideCattailKeys);
          h = Phaser.Math.Between(56, zone === 'riverside' ? 82 : 68);
          opts = { alignBottom: true, maxAngle: 8, sway: true, swayAmp: 1.2 };
        } else if (tileNoise(i, Math.floor(pond.y / TILE_SIZE), 1753) > 0.48) {
          key = Phaser.Utils.Array.GetRandom(flowerKeys);
          h = Phaser.Math.Between(44, 60);
        } else {
          key = Phaser.Utils.Array.GetRandom(grassKeys);
          h = Phaser.Math.Between(42, 58);
          opts.alpha = 0.88;
          opts.maxAngle = 16;
        }
        placeLandmarkDeco(key, x, y, h, opts);
      }
    }
  };

  const edgeAccentForZone = (zone, nearPath) => {
    if (zone === 'forest') {
      if (Math.random() < 0.45) return { key: Phaser.Utils.Array.GetRandom(forestFernKeys), h: 48, opts: { tint: forestTint } };
      if (Math.random() < 0.72) return { key: Phaser.Utils.Array.GetRandom(grassKeys), h: 46, opts: { tint: forestTint, alpha: 0.78 } };
      return { key: Phaser.Utils.Array.GetRandom(mushroomKeys), h: 40, opts: { alpha: 0.9, maxAngle: 8 } };
    }
    if (zone === 'desert') {
      if (Math.random() < 0.58 || nearPath) return { key: Phaser.Utils.Array.GetRandom(rockKeys), h: 44, opts: { tint: desertRockTint, alignBottom: true, shadow: true, maxAngle: 12 } };
      if (Math.random() < 0.80) return { key: Phaser.Utils.Array.GetRandom(grassKeys), h: 30, opts: { tint: 0xd6c178, alpha: 0.48 } };
      return { key: 'cactus_set', h: 62, opts: { alignBottom: true, shadow: true, maxAngle: 5 } };
    }
    if (zone === 'ruins') {
      if (ruinsPillarKeys.length && Math.random() < 0.16) return { key: Phaser.Utils.Array.GetRandom(ruinsPillarKeys), h: 82, opts: { alignBottom: true, shadow: true, maxAngle: 5 } };
      if (Math.random() < 0.72 || nearPath) return { key: Phaser.Utils.Array.GetRandom(rockKeys), h: 46, opts: { tint: ruinTint, alignBottom: true, shadow: true, maxAngle: 14 } };
      return { key: Phaser.Utils.Array.GetRandom(bushKeys), h: 54, opts: { tint: 0xa89878, alignBottom: true, shadow: true, maxAngle: 6 } };
    }
    if (zone === 'riverside') {
      if (Math.random() < 0.18) return { key: Phaser.Utils.Array.GetRandom(riversideCattailKeys), h: 60, opts: { alignBottom: true, maxAngle: 9 } };
      if (Math.random() < 0.70) return { key: Phaser.Utils.Array.GetRandom(flowerKeys), h: 48, opts: { alpha: 0.86, maxAngle: 14 } };
      return { key: Phaser.Utils.Array.GetRandom(grassKeys), h: 48, opts: { alpha: 0.82, maxAngle: 18 } };
    }
    if (Math.random() < 0.56 || nearPath) return { key: Phaser.Utils.Array.GetRandom(flowerKeys), h: 48, opts: { alpha: 0.88, maxAngle: 14 } };
    return { key: Phaser.Utils.Array.GetRandom(grassKeys), h: 46, opts: { alpha: 0.82, maxAngle: 18 } };
  };

  const adjacentPathDir = (r, c) => {
    for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      if (getCellType(r + dr, c + dc) !== 'grass') return { dr, dc };
    }
    return null;
  };

  let boundaryAccentCount = 0;
  let pathShoulderCount = 0;
  for (let r = 1; r < MAP_ROWS - 1; r++) {
    for (let c = 1; c < MAP_COLS - 1; c++) {
      if (getCellType(r, c) !== 'grass') continue;
      const zone = getZone(r, c);
      const nearBoundary = nearZoneBoundary(r, c);
      const nearPath = [[1,0],[-1,0],[0,1],[0,-1]].some(([dr, dc]) =>
        getCellType(r + dr, c + dc) !== 'grass'
      );
      if (nearBoundary && boundaryAccentCount < 520 && Math.random() < 0.34) {
        const accent = edgeAccentForZone(zone, false);
        placeTileAccent(r, c, accent.key, accent.h, accent.opts);
        boundaryAccentCount++;
      }
      if (nearPath && pathShoulderCount < 380 && Math.random() < 0.22) {
        const accent = edgeAccentForZone(zone, true);
        placeTileAccent(r, c, accent.key, accent.h, accent.opts);
        pathShoulderCount++;
      }
    }
  }

  // Roadside meadows: grouped shoulder patches along dirt routes. These keep
  // paths from feeling like empty strips while avoiding uniform scatter.
  let roadsideMeadowCount = 0;
  for (let r = 2; r < MAP_ROWS - 2; r++) {
    for (let c = 2; c < MAP_COLS - 2; c++) {
      if (roadsideMeadowCount >= 145) break;
      if (getCellType(r, c) !== 'grass' || !adjacentPathDir(r, c)) continue;
      const zone = getZone(r, c);
      const threshold = zone === 'grasslands' ? 0.80 : 0.88;
      if (tileNoise(r, c, 1941) < threshold) continue;
      const items = Phaser.Math.Between(4, 8);
      for (let i = 0; i < items; i++) {
        const rr = Phaser.Math.Clamp(r + Phaser.Math.Between(-1, 1), 1, MAP_ROWS - 2);
        const cc = Phaser.Math.Clamp(c + Phaser.Math.Between(-1, 1), 1, MAP_COLS - 2);
        if (getCellType(rr, cc) !== 'grass') continue;
        const flowerBias = tileNoise(rr, cc, 1942 + i) > 0.36;
        const accent = flowerBias
          ? { key: Phaser.Utils.Array.GetRandom(flowerKeys), h: Phaser.Math.Between(46, 62), opts: { alpha: 0.9, maxAngle: 14, sway: true, swayAmp: 1.8 } }
          : edgeAccentForZone(zone, true);
        placeTileAccent(rr, cc, accent.key, accent.h, accent.opts);
      }
      roadsideMeadowCount++;
    }
  }

  // Open-field pockets: small authored clusters in the empty grass between
  // roads and boundaries. This breaks up "test level" stretches without
  // blocking movement or bringing back terrain grid artifacts.
  let fieldPocketCount = 0;
  for (let r = 2; r < MAP_ROWS - 2; r++) {
    for (let c = 2; c < MAP_COLS - 2; c++) {
      if (fieldPocketCount >= 420) break;
      if (getCellType(r, c) !== 'grass') continue;
      const nearPath = [[1,0],[-1,0],[0,1],[0,-1]].some(([dr, dc]) =>
        getCellType(r + dr, c + dc) !== 'grass'
      );
      const zone = getZone(r, c);
      const threshold = zone === 'grasslands' ? 0.978 : 0.986;
      if (nearPath || nearZoneBoundary(r, c) || tileNoise(r, c, 917) < threshold) continue;
      const items = Phaser.Math.Between(4, 7);
      for (let i = 0; i < items; i++) {
        const rr = Phaser.Math.Clamp(r + Phaser.Math.Between(-1, 1), 1, MAP_ROWS - 2);
        const cc = Phaser.Math.Clamp(c + Phaser.Math.Between(-1, 1), 1, MAP_COLS - 2);
        if (getCellType(rr, cc) !== 'grass') continue;
        const accent = edgeAccentForZone(zone, false);
        placeTileAccent(rr, cc, accent.key, accent.h, accent.opts);
      }
      fieldPocketCount++;
    }
  }

  const addLandmarkRing = (tile_r, tile_c, zone) => {
    const x = tile_c * TILE_SIZE + TILE_SIZE / 2;
    const y = tile_r * TILE_SIZE + TILE_SIZE / 2;
    const ring = (items, radius = 126) => {
      items.forEach((item, i) => {
        const a = (Math.PI * 2 * i / items.length) + (item.offset ?? 0);
        const rx = radius * (item.rx ?? 1) + Phaser.Math.Between(-10, 10);
        const ry = radius * 0.52 * (item.ry ?? 1) + Phaser.Math.Between(-6, 6);
        placeLandmarkDeco(item.key, x + Math.cos(a) * rx, y + Math.sin(a) * ry,
          item.h, item.opts || {});
      });
    };
    if (zone === 'forest') {
      ring([
        ...Array.from({ length: 8 }, () => ({ key: Phaser.Utils.Array.GetRandom(mushroomKeys), h: 44, opts: { maxAngle: 8 } })),
        ...Array.from({ length: 6 }, () => ({ key: Phaser.Utils.Array.GetRandom(grassKeys), h: 48, opts: { alpha: 0.9, maxAngle: 16, tint: forestTint, sway: true, swayAmp: 2 } })),
      ], 122);
      ring(Array.from({ length: 3 }, () => ({ key: Phaser.Utils.Array.GetRandom(treeKeys), h: 150, opts: { alignBottom: true, shadow: true, tint: forestTint, maxAngle: 3, baseCluster: 0.42 } })), 178);
    } else if (zone === 'desert') {
      ring([
        ...Array.from({ length: 7 }, () => ({ key: Phaser.Utils.Array.GetRandom(rockKeys), h: 52, opts: { alignBottom: true, shadow: true, tint: desertRockTint, maxAngle: 12 } })),
        ...Array.from({ length: 5 }, () => ({ key: 'cactus_set', h: 82, opts: { alignBottom: true, shadow: true, maxAngle: 5 } })),
      ], 132);
    } else if (zone === 'ruins') {
      ring([
        ...Array.from({ length: 8 }, () => ({ key: Phaser.Utils.Array.GetRandom(rockKeys), h: 56, opts: { alignBottom: true, shadow: true, tint: ruinTint, maxAngle: 14 } })),
        ...Array.from({ length: 4 }, () => ({ key: Phaser.Utils.Array.GetRandom(bushKeys), h: 62, opts: { alignBottom: true, shadow: true, tint: 0xa89878, maxAngle: 6 } })),
      ], 130);
    } else if (zone === 'riverside') {
      ring([
        ...Array.from({ length: 8 }, () => ({ key: Phaser.Utils.Array.GetRandom(flowerKeys), h: 58, opts: { maxAngle: 14, sway: true, swayAmp: 2 } })),
        ...Array.from({ length: 7 }, () => ({ key: Phaser.Utils.Array.GetRandom(grassKeys), h: 52, opts: { alpha: 0.95, maxAngle: 18, sway: true, swayAmp: 2.5 } })),
      ], 126);
    } else {
      ring([
        ...Array.from({ length: 8 }, () => ({ key: Phaser.Utils.Array.GetRandom(flowerKeys), h: 58, opts: { maxAngle: 14, sway: true, swayAmp: 2 } })),
        ...Array.from({ length: 6 }, () => ({ key: Phaser.Utils.Array.GetRandom(grassKeys), h: 50, opts: { alpha: 0.95, maxAngle: 18, sway: true, swayAmp: 2.5 } })),
      ], 126);
      ring(Array.from({ length: 2 }, () => ({ key: Phaser.Utils.Array.GetRandom(treeKeys), h: 145, opts: { alignBottom: true, shadow: true, maxAngle: 3, baseCluster: 0.40 } })), 178);
    }
  };

  const addLandmarkHero = (tile_r, tile_c, zone) => {
    const x = tile_c * TILE_SIZE + TILE_SIZE / 2;
    const y = tile_r * TILE_SIZE + TILE_SIZE / 2 + 8;
    const hero = {
      grasslands: { key: 'landmark_spawn_signpost', h: 112, opts: { alignBottom: true, shadow: true, maxAngle: 2, baseCluster: 0.24 } },
      forest: { key: 'landmark_forest_shrine', h: 128, opts: { alignBottom: true, shadow: true, maxAngle: 2, tint: 0xf0ffe0, baseCluster: 0.30 } },
      desert: { key: 'landmark_desert_obelisk', h: 154, opts: { alignBottom: true, shadow: true, maxAngle: 1 } },
      ruins: { key: 'landmark_ruins_well', h: 128, opts: { alignBottom: true, shadow: true, maxAngle: 2 } },
      riverside: { key: 'landmark_riverside_bridge', h: 130, opts: { alignBottom: true, shadow: true, maxAngle: 0, allowFlip: false } },
    }[zone];
    if (!hero) return;
    placeLandmarkDeco(hero.key, x, y, hero.h, hero.opts);
  };

  // Secondary plaza: small biome-themed deco ring + 1 warm lantern.
  // Pure cosmetic, no hero prop, fits inside one tile so A* stays clean.
  const addSecondaryPlaza = (tile_r, tile_c, zone) => {
    const cx = tile_c * TILE_SIZE + TILE_SIZE / 2;
    const cy = tile_r * TILE_SIZE + TILE_SIZE / 2;
    // 6 props in a ring at radius 70.
    const pick = () => {
      if (zone === 'forest') return Phaser.Utils.Array.GetRandom(mushroomKeys);
      if (zone === 'desert') return Phaser.Utils.Array.GetRandom(rockKeys);
      if (zone === 'ruins') return Phaser.Utils.Array.GetRandom(rockKeys);
      if (zone === 'riverside') return Phaser.Utils.Array.GetRandom(flowerKeys);
      return Phaser.Utils.Array.GetRandom(flowerKeys);
    };
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const px = cx + Math.cos(a) * 70;
      const py = cy + Math.sin(a) * 70;
      placeLandmarkDeco(pick(), px, py, 48, { maxAngle: 12, sway: zone !== 'desert' && zone !== 'ruins', swayAmp: 2 });
    }
    // Warm lantern centerpiece (reuse spawn-lantern style, single).
    const glow = scene.add.ellipse(cx, cy + 4, 42, 18, 0xc58d34, 0.055)
      .setDepth(-620);
    scene.tweens.add({ targets: glow, alpha: 0.09, scaleX: 1.05, scaleY: 1.05,
      duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    const core = scene.add.ellipse(cx, cy - 4, 9, 9, 0xfff2a8, 0.68)
      .setDepth(cy);
    scene.tweens.add({ targets: core, alpha: 0.42, scaleX: 1.12, scaleY: 1.12,
      duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  };

  for (const p of landmarkTiles()) {
    const z = getZone(p.r, p.c);
    if (p.primary) {
      addLandmarkRing(p.r, p.c, z);
      addLandmarkHero(p.r, p.c, z);
    } else {
      addSecondaryPlaza(p.r, p.c, z);
    }
  }

  // Spawn plaza warm lanterns — 3 pulsing gold ellipses around the spawn
  // signpost so the center plaza reads as a town hub. Pure cosmetic.
  const { midRow: _mr, midCol: _mc } = mapCenter();
  const spX = _mc * TILE_SIZE + TILE_SIZE / 2;
  const spY = _mr * TILE_SIZE + TILE_SIZE / 2 + 8;
  const spawnCampX = spX - 420;
  const spawnCampY = spY + 260;
  const lanternOffsets = [
    { dx: -150, dy:  10 },
    { dx:  150, dy:  10 },
    { dx:    0, dy: 150 },
  ];
  for (const off of lanternOffsets) {
    const lx = spX + off.dx, ly = spY + off.dy;
    // Warm glow disc (under feet depth).
    const glow = scene.add.ellipse(lx, ly + 4, 46, 20, 0xc58d34, 0.06)
      .setDepth(-620);
    scene.tweens.add({ targets: glow, alpha: 0.10, scaleX: 1.05, scaleY: 1.05,
      duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    // Small bright core.
    const core = scene.add.ellipse(lx, ly - 6, 10, 10, 0xfff2a8, 0.66)
      .setDepth(ly);
    scene.tweens.add({ targets: core, alpha: 0.42, scaleX: 1.12, scaleY: 1.12,
      duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }

  const addSpawnHubDressing = () => {
    const groundKey = scene.textures.exists('deco_sand_scuff_soft_01')
      ? 'deco_sand_scuff_soft_01' : Phaser.Utils.Array.GetRandom(grassKeys);
    const pebbleKey = scene.textures.exists('deco_pebble_cluster_01')
      ? 'deco_pebble_cluster_01' : Phaser.Utils.Array.GetRandom(rockKeys);
    const placeGround = (x, y, key, h, tint, alpha = 0.12) => {
      if (!scene.textures.exists(key)) return;
      const img = scene.add.image(x, y, key);
      img.setScale(h / img.height);
      img.setAlpha(alpha);
      img.setAngle(Phaser.Math.Between(0, 359));
      img.setDepth(-782);
      img.setTint(tint);
    };
    const approach = (dx, dy) => {
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      for (const dist of [105, 190, 280, 370]) {
        const cx = spX + dx * dist;
        const cy = spY + dy * dist;
        placeGround(cx, cy, groundKey, Phaser.Math.Between(86, 145), 0xd8e0b8, 0.035);
        for (const side of [-1, 1]) {
          const px = cx + nx * side * Phaser.Math.Between(44, 62);
          const py = cy + ny * side * Phaser.Math.Between(24, 38);
          const flower = Phaser.Utils.Array.GetRandom(flowerKeys);
          placeLandmarkDeco(flower, px, py, Phaser.Math.Between(42, 58), {
            maxAngle: 14,
            alpha: 0.92,
          });
          if (dist > 160 && tileNoise(Math.floor(py / TILE_SIZE), Math.floor(px / TILE_SIZE), 501) > 0.62) {
            placeLandmarkDeco(Phaser.Utils.Array.GetRandom(grassKeys), px + nx * side * 18, py + ny * side * 10, 44, {
              maxAngle: 18,
              alpha: 0.82,
            });
          }
        }
        if (tileNoise(Math.floor(cy / TILE_SIZE), Math.floor(cx / TILE_SIZE), 502) > 0.70) {
          placeGround(cx + nx * 18, cy + ny * 10, pebbleKey, Phaser.Math.Between(38, 64), 0xc8c0a8, 0.10);
        }
      }
    };
    approach(1, 0);
    approach(-1, 0);
    approach(0, 1);
    approach(0, -1);

    const cornerClusters = [
      { dx: -245, dy: -170 },
      { dx:  245, dy: -170 },
      { dx: -245, dy:  175 },
      { dx:  245, dy:  175 },
    ];
    for (const p of cornerClusters) {
      placeGround(spX + p.dx, spY + p.dy, groundKey, 125, 0xd8e0b8, 0.04);
      placeLandmarkDeco(Phaser.Utils.Array.GetRandom(bushKeys), spX + p.dx, spY + p.dy + 8, 64, {
        alignBottom: true,
        shadow: true,
        maxAngle: 5,
        baseCluster: 0.42,
      });
      placeLandmarkDeco(Phaser.Utils.Array.GetRandom(flowerKeys), spX + p.dx + 42, spY + p.dy + 16, 46, {
        maxAngle: 14,
      });
      placeLandmarkDeco(Phaser.Utils.Array.GetRandom(grassKeys), spX + p.dx - 38, spY + p.dy - 8, 44, {
        alpha: 0.86,
        maxAngle: 18,
      });
    }
  };

  const addOcclusionTestGrove = () => {
    const groveTrees = [
      { dx: -132, dy: -132, key: treeKeys[0], h: 172, scale: 1.00, angle: -1 },
      { dx:  -52, dy: -170, key: treeKeys[2], h: 158, scale: 0.96, angle:  2 },
      { dx:   34, dy: -126, key: treeKeys[1], h: 184, scale: 1.02, angle: -2 },
      { dx:  108, dy:  -84, key: treeKeys[2], h: 146, scale: 0.94, angle:  1 },
    ];
    const floorTufts = [
      { dx: -170, dy:  -64, key: grassKeys[0], h: 48, angle: -13 },
      { dx:  -92, dy:  -44, key: flowerKeys[1], h: 48, angle:  11 },
      { dx:  -18, dy:  -58, key: grassKeys[2], h: 44, angle:  15 },
      { dx:   70, dy:  -34, key: flowerKeys[2], h: 44, angle: -9 },
      { dx:  146, dy:  -42, key: grassKeys[1], h: 46, angle:   8 },
    ];

    // Visual-only stress grove near spawn. These trees deliberately avoid
    // collision blockers so walking behind/in front of their bases verifies
    // depth sorting without turning the grove into a wall.
    for (const tree of groveTrees) {
      placeLandmarkDeco(tree.key, spX + tree.dx, spY + tree.dy, tree.h, {
        alignBottom: true,
        allowFlip: false,
        angle: tree.angle,
        scale: tree.scale,
        baseCluster: 0.36,
      });
    }
    for (const tuft of floorTufts) {
      placeLandmarkDeco(tuft.key, spX + tuft.dx, spY + tuft.dy, tuft.h, {
        alpha: 0.88,
        allowFlip: false,
        angle: tuft.angle,
      });
    }
  };
  const addSpawnCamp = () => {
    const campX = spawnCampX;
    const campY = spawnCampY;
    const ground = scene.add.ellipse(campX, campY + 26, 440, 190, 0x8f7845, 0.065)
      .setDepth(-781);
    scene.add.ellipse(campX + 18, campY + 20, 260, 110, 0xd6c08a, 0.045)
      .setDepth(-780);
    const frontTentKey = scene.textures.exists('tent_canvas_front_01') ? 'tent_canvas_front_01' : 'camp_tent_canvas';
    const sideTentKey = scene.textures.exists('tent_canvas_side_01') ? 'tent_canvas_side_01' : 'camp_tent_canvas';
    const tents = [
      { dx: -128, dy: -28, angle: -7, key: frontTentKey, h: frontTentKey === 'tent_canvas_front_01' ? 136 : 112 },
      { dx:   36, dy: -60, angle:  4, key: sideTentKey, h: sideTentKey === 'tent_canvas_side_01' ? 132 : 112 },
      { dx:  150, dy:  38, angle:  8, key: frontTentKey, h: frontTentKey === 'tent_canvas_front_01' ? 132 : 112 },
    ];
    for (const tent of tents) {
      const x = campX + tent.dx;
      const y = campY + tent.dy;
      placeLandmarkDeco(tent.key, x, y, tent.h, {
        alignBottom: true,
        allowFlip: false,
        angle: tent.angle,
        baseCluster: 0,
        contact: { width: tent.key === sideTentKey ? 150 : 104, height: 28, yOffset: -8, alpha: 0.075, angle: tent.angle },
      });
      blockCells(x, y, 2);
    }
    const fireKey = scene.textures.exists('campfire_01') ? 'campfire_01' : 'camp_fire_canvas';
    const fire = placeLandmarkDeco(fireKey, campX - 16, campY + 38, fireKey === 'campfire_01' ? 92 : 74, {
      alignBottom: true,
      allowFlip: false,
      angle: 0,
      baseCluster: 0,
    });
    if (fire) {
      const glow = scene.add.ellipse(fire.x, fire.y + 2, 124, 44, 0xffaa44, 0.12).setDepth(-618);
      scene.tweens.add({
        targets: fire,
        alpha: 0.88,
        scaleX: fire.scaleX * 1.055,
        scaleY: fire.scaleY * 1.075,
        duration: 150,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
      scene.tweens.add({
        targets: glow,
        alpha: 0.20,
        scaleX: 1.10,
        scaleY: 1.18,
        duration: 980,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
    }
    const fences = [
      { dx: -210, dy:  70, angle: -6 },
      { dx:   80, dy: 118, angle:  5 },
      { dx:  215, dy: -14, angle: 74, broken: true },
    ];
    const straightFenceKey = scene.textures.exists('log_fence_horizontal_01') ? 'log_fence_horizontal_01' : 'camp_fence_canvas';
    const brokenFenceKey = scene.textures.exists('log_fence_broken_01') ? 'log_fence_broken_01' : straightFenceKey;
    for (const f of fences) {
      const fenceKey = f.broken ? brokenFenceKey : straightFenceKey;
      const isRealFence = fenceKey === 'log_fence_horizontal_01' || fenceKey === 'log_fence_broken_01';
      placeLandmarkDeco(fenceKey, campX + f.dx, campY + f.dy, isRealFence ? 82 : 76, {
        alignBottom: true,
        allowFlip: false,
        angle: f.angle,
        baseCluster: 0,
        contact: { width: isRealFence ? 168 : 112, height: 16, yOffset: -6, alpha: 0.08, angle: f.angle, scuffs: 5 },
      });
    }
    if (scene.textures.exists('ladder_wooden_01')) {
      placeLandmarkDeco('ladder_wooden_01', campX + 238, campY + 44, 116, {
        alignBottom: true,
        allowFlip: false,
        angle: -7,
        baseCluster: 0,
        contact: { width: 44, height: 18, yOffset: -5, alpha: 0.075, angle: -7, scuffs: 4 },
      });
    }
    const cartKey = scene.textures.exists('wooden_cart_01') ? 'wooden_cart_01' : 'camp_wagon_canvas';
    const campDetails = [
      { key: cartKey, dx: 278, dy: 4, h: cartKey === 'wooden_cart_01' ? 150 : 136, angle: cartKey === 'wooden_cart_01' ? -2 : -7, block: 1 },
      { key: 'camp_logbench_canvas', dx: -92, dy: 120, h: 76, angle: -5, block: 0 },
      { key: 'camp_logbench_canvas', dx: 92, dy: 98, h: 68, angle: 7, block: 0 },
      { key: 'camp_pot_canvas', dx: -4, dy: 62, h: 62, angle: 0, block: 0 },
    ];
    for (const item of campDetails) {
      const x = campX + item.dx;
      const y = campY + item.dy;
      placeLandmarkDeco(item.key, x, y, item.h, {
        alignBottom: true,
        allowFlip: false,
        angle: item.angle,
        baseCluster: 0,
        contact: {
          width: item.key === cartKey ? 178 : (item.key === 'camp_pot_canvas' ? 44 : 116),
          height: item.key === cartKey ? 42 : (item.key === 'camp_pot_canvas' ? 18 : 20),
          yOffset: item.key === cartKey ? -16 : -5,
          alpha: item.key === cartKey ? 0.085 : 0.07,
          angle: item.angle,
          scuffs: item.key === cartKey ? 12 : 5,
        },
      });
      if (item.block) blockCells(x, y, item.block);
    }
    const npcs = [
      { key: 'rookie_idle_south', dx: -76, dy: 64, name: 'Guide' },
      { key: scene.textures.exists('mage_idle_south') ? 'mage_idle_south' : 'rookie_idle_south', dx: 78, dy: 48, name: 'Forager' },
    ];
    for (const npc of npcs) {
      const x = campX + npc.dx;
      const y = campY + npc.dy;
      const img = placeLandmarkDeco(npc.key, x, y, 86, {
        alignBottom: true,
        allowFlip: false,
        angle: 0,
        baseCluster: 0,
      });
      if (!img) continue;
      scene.add.text(x, y - 86, npc.name, {
        fontFamily: '"Trebuchet MS", Arial, sans-serif',
        fontSize: '13px',
        color: '#fff3c4',
        stroke: '#2a1c12',
        strokeThickness: 4,
      }).setOrigin(0.5, 1).setDepth(y + 1).setResolution(UI_TEXT_RESOLUTION);
    }
  };

  const addPromptInspiredLandmarks = () => {
    const ruinX = spX - 760;
    const ruinY = spY - 215;
    placeLandmarkDeco('ruin_base_canvas', ruinX, ruinY + 48, 210, {
      depth: -772,
      allowFlip: false,
      angle: -3,
      alpha: 0.94,
      contact: { width: 230, height: 58, yOffset: 30, alpha: 0.105, angle: -3, depth: -773, scuffs: 12 },
    });
    const ancientTree = placeLandmarkDeco('tree_oak_01', ruinX + 16, ruinY + 34, 326, {
      alignBottom: true,
      allowFlip: false,
      maxAngle: 2,
      baseCluster: 0.82,
    });
    if (ancientTree) blockCells(ruinX + 16, ruinY + 34, 3);
    for (const p of [
      { dx: -132, dy: 72, h: 96, angle: -8 },
      { dx:  128, dy: 50, h: 112, angle: 5 },
    ]) {
      if (!ruinsPillarKeys.length) continue;
      const x = ruinX + p.dx;
      const y = ruinY + p.dy;
      placeLandmarkDeco(Phaser.Utils.Array.GetRandom(ruinsPillarKeys), x, y, p.h, {
        alignBottom: true,
        allowFlip: false,
        angle: p.angle,
        tint: 0xd4ccb2,
        baseCluster: 0.18,
        contact: { width: 48, height: 18, yOffset: -5, alpha: 0.10, angle: p.angle, scuffs: 4 },
      });
      blockCells(x, y, 1);
    }
    for (let i = 0; i < 9; i++) {
      const a = -2.7 + i * 0.46 + Phaser.Math.FloatBetween(-0.12, 0.12);
      const x = ruinX + Math.cos(a) * Phaser.Math.Between(118, 196);
      const y = ruinY + 66 + Math.sin(a) * Phaser.Math.Between(44, 82);
      const key = i % 3 === 0 ? Phaser.Utils.Array.GetRandom(mushroomKeys) : Phaser.Utils.Array.GetRandom(flowerKeys);
      placeLandmarkDeco(key, x, y, Phaser.Math.Between(42, 60), {
        alpha: 0.90,
        maxAngle: 16,
        sway: i % 3 !== 0,
        swayAmp: 1.6,
      });
    }

    const rockX = spX + 610;
    const rockY = spY - 325;
    placeLandmarkDeco('boulder_anchor_canvas', rockX, rockY, 190, {
      alignBottom: true,
      allowFlip: false,
      angle: 4,
      baseCluster: 0.55,
      contact: { width: 150, height: 42, yOffset: -12, alpha: 0.09, angle: 4, scuffs: 10 },
    });
    blockCells(rockX, rockY, 2);
    for (const p of [
      { dx: -96, dy: 62, key: Phaser.Utils.Array.GetRandom(bushKeys), h: 74 },
      { dx:  94, dy: 56, key: Phaser.Utils.Array.GetRandom(grassKeys), h: 58 },
      { dx:  24, dy: 88, key: Phaser.Utils.Array.GetRandom(flowerKeys), h: 56 },
      { dx: -28, dy: 98, key: Phaser.Utils.Array.GetRandom(mushroomKeys), h: 44 },
    ]) {
      placeLandmarkDeco(p.key, rockX + p.dx, rockY + p.dy, p.h, {
        alignBottom: bushKeys.includes(p.key),
        maxAngle: 16,
        alpha: 0.92,
        baseCluster: bushKeys.includes(p.key) ? 0.36 : 0,
      });
    }
  };

  const addGrasslandsChokeLines = () => {
    const lerp = (a, b, t) => a + (b - a) * t;
    const lines = [
      { from: [-820, -460], to: [-250, -330], count: 6 },
      { from: [ 260, -335], to: [ 860, -470], count: 6 },
      { from: [-820,  480], to: [-270,  360], count: 6 },
      { from: [ 280,  350], to: [ 880,  500], count: 6 },
      { from: [-720, -230], to: [-680,  270], count: 5 },
      { from: [ 720, -260], to: [ 690,  250], count: 5 },
    ];
    let placed = 0;
    for (const line of lines) {
      for (let i = 0; i < line.count; i++) {
        const t = line.count === 1 ? 0 : i / (line.count - 1);
        const x = spX + lerp(line.from[0], line.to[0], t) + Phaser.Math.Between(-34, 34);
        const y = spY + lerp(line.from[1], line.to[1], t) + Phaser.Math.Between(-24, 24);
        if (Math.abs(x - spawnCampX) < 390 && Math.abs(y - spawnCampY) < 245) continue;
        const r = Math.floor(y / TILE_SIZE);
        const c = Math.floor(x / TILE_SIZE);
        if (getZone(r, c) !== 'grasslands' || getCellType(r, c) !== 'grass') continue;
        const tree = placeLandmarkDeco(Phaser.Utils.Array.GetRandom(treeKeys), x, y, Phaser.Math.Between(205, 260), {
          alignBottom: true,
          maxAngle: 3,
          baseCluster: 0.58,
        });
        if (!tree) continue;
        blockCells(x, y, 2);
        placed++;
        if (placed % 2 === 0) {
          placeLandmarkDeco(Phaser.Utils.Array.GetRandom(bushKeys), x + Phaser.Math.Between(-70, 70), y + Phaser.Math.Between(12, 48), 72, {
            alignBottom: true,
            maxAngle: 7,
            baseCluster: 0.42,
          });
        }
        if (placed % 3 !== 0) {
          placeLandmarkDeco(Phaser.Utils.Array.GetRandom(grassKeys), x + Phaser.Math.Between(-82, 82), y + Phaser.Math.Between(24, 58), 52, {
            alpha: 0.88,
            maxAngle: 18,
            sway: true,
            swayAmp: 2,
          });
        }
      }
    }
  };
  addSpawnHubDressing();
  addOcclusionTestGrove();
  addSpawnCamp();
  addPromptInspiredLandmarks();
  addGrasslandsChokeLines();

  const addAnchorCompositions = () => {
    const groundKey = scene.textures.exists('deco_sand_scuff_soft_01')
      ? 'deco_sand_scuff_soft_01' : Phaser.Utils.Array.GetRandom(grassKeys);
    const stoneKey = scene.textures.exists('deco_stone_dust_soft_01')
      ? 'deco_stone_dust_soft_01' : groundKey;
    const pebbleKey = scene.textures.exists('deco_pebble_cluster_01')
      ? 'deco_pebble_cluster_01' : Phaser.Utils.Array.GetRandom(rockKeys);
    const placeGround = (x, y, key, h, tint, alpha) => {
      placeLandmarkDeco(key, x, y, h, {
        depth: -784,
        alpha,
        angle: Phaser.Math.Between(0, 359),
        tint,
        allowFlip: false,
      });
    };
    const support = (x, y, zone, radius, count, variant) => {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + variant * 0.31 + Phaser.Math.FloatBetween(-0.22, 0.22);
        const px = x + Math.cos(a) * Phaser.Math.Between(radius * 0.54, radius);
        const py = y + Math.sin(a) * Phaser.Math.Between(radius * 0.28, radius * 0.56);
        let key = Phaser.Utils.Array.GetRandom(grassKeys);
        let h = Phaser.Math.Between(44, 58);
        let opts = { alpha: 0.9, maxAngle: 18, sway: true, swayAmp: 2 };
        if (zone === 'forest') {
          key = i % 3 === 0 ? Phaser.Utils.Array.GetRandom(mushroomKeys) : Phaser.Utils.Array.GetRandom(forestFernKeys);
          h = i % 3 === 0 ? Phaser.Math.Between(42, 52) : Phaser.Math.Between(50, 66);
          opts = { tint: i % 3 === 0 ? null : forestTint, alpha: 0.92, maxAngle: 14, sway: i % 3 !== 0, swayAmp: 1.8 };
        } else if (zone === 'desert') {
          key = i % 4 === 0 ? 'cactus_set' : Phaser.Utils.Array.GetRandom(rockKeys);
          h = i % 4 === 0 ? Phaser.Math.Between(70, 92) : Phaser.Math.Between(46, 64);
          opts = { alignBottom: true, tint: i % 4 === 0 ? null : desertRockTint, maxAngle: i % 4 === 0 ? 5 : 12 };
        } else if (zone === 'ruins') {
          key = i % 3 === 0 && ruinsPillarKeys.length ? Phaser.Utils.Array.GetRandom(ruinsPillarKeys) : Phaser.Utils.Array.GetRandom(rockKeys);
          h = i % 3 === 0 && ruinsPillarKeys.length ? Phaser.Math.Between(86, 116) : Phaser.Math.Between(50, 68);
          opts = { alignBottom: true, tint: i % 3 === 0 ? null : ruinTint, maxAngle: 8 };
        } else if (zone === 'riverside') {
          key = i % 2 === 0 ? Phaser.Utils.Array.GetRandom(riversideCattailKeys) : Phaser.Utils.Array.GetRandom(flowerKeys);
          h = i % 2 === 0 ? Phaser.Math.Between(60, 82) : Phaser.Math.Between(48, 62);
          opts = i % 2 === 0
            ? { alignBottom: true, maxAngle: 8, sway: true, swayAmp: 1.2 }
            : { alpha: 0.9, maxAngle: 14, sway: true, swayAmp: 1.6 };
        } else if (i % 3 !== 0) {
          key = Phaser.Utils.Array.GetRandom(flowerKeys);
          h = Phaser.Math.Between(48, 64);
          opts = { alpha: 0.92, maxAngle: 14, sway: true, swayAmp: 1.8 };
        }
        placeLandmarkDeco(key, px, py, h, opts);
      }
    };
    const addAnchor = (tile_r, tile_c, zone, variant = 0) => {
      const x = tile_c * TILE_SIZE + TILE_SIZE / 2 + Phaser.Math.Between(-36, 36);
      const y = tile_r * TILE_SIZE + TILE_SIZE / 2 + Phaser.Math.Between(-24, 24);
      const dry = zone === 'desert' || zone === 'ruins';
      placeGround(x, y + 14, dry ? stoneKey : groundKey, Phaser.Math.Between(220, 340),
        dry ? 0xc6b58f : (zone === 'riverside' ? 0xb4d3bf : 0xc4d9a0), dry ? 0.12 : 0.06);
      if (tileNoise(tile_r, tile_c, 1901) > 0.36) {
        placeGround(x + Phaser.Math.Between(-44, 44), y + Phaser.Math.Between(-22, 28),
          pebbleKey, Phaser.Math.Between(60, 92), dry ? 0xb8aa8c : 0xb0bf93, dry ? 0.18 : 0.10);
      }
      const anchor = {
        grasslands: { key: Phaser.Utils.Array.GetRandom(treeKeys), h: Phaser.Math.Between(230, 292), opts: { alignBottom: true, maxAngle: 2, blockRadius: 2 } },
        forest: { key: Phaser.Utils.Array.GetRandom(treeKeys), h: Phaser.Math.Between(260, 330), opts: { alignBottom: true, tint: forestTint, maxAngle: 2, blockRadius: 2 } },
        desert: { key: 'cactus_set', h: Phaser.Math.Between(130, 172), opts: { alignBottom: true, maxAngle: 4, blockRadius: 1 } },
        ruins: { key: ruinsPillarKeys.length ? Phaser.Utils.Array.GetRandom(ruinsPillarKeys) : Phaser.Utils.Array.GetRandom(rockKeys), h: Phaser.Math.Between(136, 176), opts: { alignBottom: true, tint: ruinsPillarKeys.length ? null : ruinTint, maxAngle: 3, blockRadius: 1 } },
        riverside: { key: Phaser.Utils.Array.GetRandom(treeKeys), h: Phaser.Math.Between(220, 276), opts: { alignBottom: true, maxAngle: 2, blockRadius: 2 } },
      }[zone] || { key: Phaser.Utils.Array.GetRandom(treeKeys), h: 240, opts: { alignBottom: true, maxAngle: 2, blockRadius: 2 } };
      placeLandmarkDeco(anchor.key, x, y, anchor.h, anchor.opts);
      support(x, y + 12, zone, zone === 'desert' || zone === 'ruins' ? 126 : 152, Phaser.Math.Between(9, 14), variant);
    };

    const sites = [];
    for (const lm of landmarkTiles()) {
      const zone = getZone(lm.r, lm.c);
      const offsets = lm.primary
        ? [[-3, -2], [3, 2]]
        : [[tileNoise(lm.r, lm.c, 1902) > 0.5 ? -2 : 2, tileNoise(lm.r, lm.c, 1903) > 0.5 ? -2 : 2]];
      offsets.forEach(([dr, dc]) => sites.push({ r: lm.r + dr, c: lm.c + dc, zone }));
    }
    let placed = 0;
    for (const site of sites) {
      if (placed >= 18) break;
      if (site.r <= 2 || site.c <= 2 || site.r >= MAP_ROWS - 3 || site.c >= MAP_COLS - 3) continue;
      if (getCellType(site.r, site.c) !== 'grass') continue;
      addAnchor(site.r, site.c, site.zone, placed);
      placed++;
    }
  };
  addAnchorCompositions();

  // Grasslands (center) — dense ground cover + scattered focal trees.
  // Keep a light singleton pass, then let dense patches and anchors do the
  // heavy lifting so flowers/bushes no longer read as pepper-shaker scatter.
  for (let i = 0; i < 900; i++) place(Phaser.Utils.Array.GetRandom(grassKeys),    52, { alpha: 0.9, maxAngle: 18, zoneFilter: 'grasslands', sway: true, swayAmp: 3 });
  for (let i = 0; i < 240; i++) place(Phaser.Utils.Array.GetRandom(flowerKeys),   60, { maxAngle: 15, zoneFilter: 'grasslands', sway: true, swayAmp: 2 });
  for (let i = 0; i < 140; i++) place(Phaser.Utils.Array.GetRandom(mushroomKeys), 44, { maxAngle: 10, zoneFilter: 'grasslands' });
  for (let i = 0; i < 130; i++) place(Phaser.Utils.Array.GetRandom(bushKeys),     72, { maxAngle:  8, alignBottom: true, blockRadius: 1, zoneFilter: 'grasslands' });
  for (let i = 0; i < 160; i++) place(Phaser.Utils.Array.GetRandom(treeKeys),    180, { maxAngle:  4, alignBottom: true, blockRadius: 2, zoneFilter: 'grasslands' });
  for (let i = 0; i <  14; i++) {
    const pond = place('pond_01', 220, { maxAngle:  0, alignBottom: true, blockRadius: 6, allowFlip: false, zoneFilter: 'grasslands', shimmer: true });
    addPondEdgeDressing(pond, 'grasslands');
  }
  // Grasslands clusters: grass-tuft thickets + flower patches.
  for (let i = 0; i < 260; i++) placeCluster(Phaser.Utils.Array.GetRandom(grassKeys),  52, Phaser.Math.Between(6, 11), { alpha: 0.95, maxAngle: 18, zoneFilter: 'grasslands', sway: true, swayAmp: 3, spread: TILE_SIZE * 1.1 });
  for (let i = 0; i < 210; i++) placeCluster(Phaser.Utils.Array.GetRandom(flowerKeys), 58, Phaser.Math.Between(5, 9), { maxAngle: 14, zoneFilter: 'grasslands', sway: true, swayAmp: 2, spread: TILE_SIZE * 0.92 });
  for (let i = 0; i <  95; i++) placeCluster(Phaser.Utils.Array.GetRandom(mushroomKeys), 44, Phaser.Math.Between(4, 7), { maxAngle: 10, zoneFilter: 'grasslands', spread: TILE_SIZE * 0.72 });
  for (let i = 0; i <  85; i++) placeCluster(Phaser.Utils.Array.GetRandom(bushKeys), 72, Phaser.Math.Between(3, 5), { maxAngle: 8, alignBottom: true, zoneFilter: 'grasslands', spread: TILE_SIZE * 1.2 });
  for (let i = 0; i <  46; i++) placeCluster(Phaser.Utils.Array.GetRandom(treeKeys), 166, Phaser.Math.Between(2, 4), { maxAngle: 4, alignBottom: true, zoneFilter: 'grasslands', spread: TILE_SIZE * 1.5 });

  // Forest (north) — heavy trees, dark bushes, mushrooms. Tinted darker green.
  for (let i = 0; i < 760; i++) place(Phaser.Utils.Array.GetRandom(treeKeys),     200, { maxAngle:  4, alignBottom: true, blockRadius: 2, zoneFilter: 'forest', tint: forestTint, shadow: true });
  for (let i = 0; i < 420; i++) place(Phaser.Utils.Array.GetRandom(bushKeys),      78, { maxAngle:  8, alignBottom: true, blockRadius: 1, zoneFilter: 'forest', tint: forestTint, shadow: true });
  for (let i = 0; i < 520; i++) place(Phaser.Utils.Array.GetRandom(mushroomKeys),  48, { maxAngle: 10, zoneFilter: 'forest' });
  for (let i = 0; i < 340; i++) place(Phaser.Utils.Array.GetRandom(forestFernKeys), 52, { alpha: 0.95, maxAngle: 16, zoneFilter: 'forest', shadow: true });
  for (let i = 0; i < 500; i++) place(Phaser.Utils.Array.GetRandom(grassKeys),     54, { alpha: 0.9, maxAngle: 18, zoneFilter: 'forest', tint: forestTint, sway: true, swayAmp: 2.5 });
  // Forest mushroom rings — classic RO-y woodland touch.
  for (let i = 0; i <  40; i++) placeCluster(Phaser.Utils.Array.GetRandom(mushroomKeys), 46, Phaser.Math.Between(4, 8), { maxAngle: 10, zoneFilter: 'forest', spread: TILE_SIZE });

  // Desert (south) — real sand tiles below, scatter cacti + dunes + sun-bleached rocks.
  for (let i = 0; i < 460; i++) place(Phaser.Utils.Array.GetRandom(rockKeys),      54, { maxAngle: 12, alignBottom: true, blockRadius: 1, zoneFilter: 'desert', tint: desertRockTint, shadow: true });
  for (let i = 0; i < 340; i++) place('cactus_set',                                90, { maxAngle:  6, alignBottom: true, blockRadius: 1, zoneFilter: 'desert', shadow: true });
  for (let i = 0; i < 150; i++) place('deco_sand_dune',                           120, { maxAngle:  0, alpha: 0.85, zoneFilter: 'desert', allowFlip: false });
  for (let i = 0; i <  90; i++) place(Phaser.Utils.Array.GetRandom(grassKeys),     32, { alpha: 0.4, maxAngle: 20, zoneFilter: 'desert', tint: 0xd6c178 });
  // Desert cactus clusters — oases of vegetation.
  for (let i = 0; i <  26; i++) placeCluster('cactus_set', 88, Phaser.Math.Between(3, 6), { maxAngle: 6, alignBottom: true, blockRadius: 1, zoneFilter: 'desert', spread: TILE_SIZE, shadow: true });

  // Ruins (west) — heavy rocks, occasional dead bush. Greyish.
  for (let i = 0; i < 740; i++) place(Phaser.Utils.Array.GetRandom(rockKeys),      58, { maxAngle: 14, alignBottom: true, blockRadius: 1, zoneFilter: 'ruins', tint: ruinTint, shadow: true });
  for (let i = 0; i < 200; i++) place(Phaser.Utils.Array.GetRandom(bushKeys),      66, { maxAngle:  6, alignBottom: true, blockRadius: 1, zoneFilter: 'ruins', tint: 0xa89878, shadow: true });
  for (let i = 0; i < 120; i++) place(Phaser.Utils.Array.GetRandom(ruinsPillarKeys), 118, { maxAngle:  6, alignBottom: true, blockRadius: 1, zoneFilter: 'ruins', shadow: true });
  for (let i = 0; i < 290; i++) place(Phaser.Utils.Array.GetRandom(grassKeys),     46, { alpha: 0.7, maxAngle: 18, zoneFilter: 'ruins', tint: ruinTint, sway: true, swayAmp: 2 });
  // Rock piles — broken architecture feeling without new art.
  for (let i = 0; i <  32; i++) placeCluster(Phaser.Utils.Array.GetRandom(rockKeys), 56, Phaser.Math.Between(4, 7), { maxAngle: 14, alignBottom: true, blockRadius: 1, zoneFilter: 'ruins', tint: ruinTint, spread: TILE_SIZE * 0.9, shadow: true });

  // Riverside (east) — ponds, tall grass, flowers, occasional tree.
  for (let i = 0; i <  30; i++) {
    const pond = place('pond_01', 240, { maxAngle:  0, alignBottom: true, blockRadius: 7, allowFlip: false, zoneFilter: 'riverside', shimmer: true });
    addPondEdgeDressing(pond, 'riverside');
  }
  for (let i = 0; i < 700; i++) place(Phaser.Utils.Array.GetRandom(grassKeys),     56, { alpha: 0.95, maxAngle: 18, zoneFilter: 'riverside', sway: true, swayAmp: 3 });
  for (let i = 0; i < 500; i++) place(Phaser.Utils.Array.GetRandom(flowerKeys),    60, { maxAngle: 15, zoneFilter: 'riverside', sway: true, swayAmp: 2 });
  for (let i = 0; i < 360; i++) place(Phaser.Utils.Array.GetRandom(riversideCattailKeys), 68, { maxAngle: 10, alignBottom: true, zoneFilter: 'riverside', shadow: true, sway: true, swayAmp: 1.5 });
  for (let i = 0; i < 180; i++) place(Phaser.Utils.Array.GetRandom(treeKeys),     180, { maxAngle:  4, alignBottom: true, blockRadius: 2, zoneFilter: 'riverside', shadow: true });
  // Riverside flower patches by the water.
  for (let i = 0; i <  54; i++) placeCluster(Phaser.Utils.Array.GetRandom(flowerKeys), 58, Phaser.Math.Between(5, 9), { maxAngle: 14, zoneFilter: 'riverside', sway: true, swayAmp: 2 });

  // Always keep spawn, plazas, and roads walkable after blocking decorations.
  const protect = (wx, wy) => {
    const cx = Math.floor(wx / CELL_SIZE), cy = Math.floor(wy / CELL_SIZE);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const r = cy + dy, c = cx + dx;
      if (r >= 0 && r < GRID_ROWS && c >= 0 && c < GRID_COLS) walkable[r][c] = true;
    }
  };
  protect(WORLD_W / 2, WORLD_H / 2);                  // spawn
  for (let r = 0; r < MAP_ROWS; r++) {
    for (let c = 0; c < MAP_COLS; c++) {
      if (getCellType(r, c) === 'grass') continue;
      protect(c * TILE_SIZE + TILE_SIZE / 2, r * TILE_SIZE + TILE_SIZE / 2);
    }
  }

  const firstExisting = (keys) => keys.find((key) => scene.textures.exists(key));
  const groundOverlayKey = (zone, large = false) => {
    if (zone === 'desert') {
      return firstExisting([
        'floor_sand_wash_soft_01',
        'deco_sand_scuff_soft_01',
        large ? 'deco_sand_dune' : 'deco_dry_grass_tuft_01',
        'deco_sand_dune',
        Phaser.Utils.Array.GetRandom(grassKeys),
      ]);
    }
    if (zone === 'ruins') {
      return firstExisting([
        'floor_stone_dust_soft_01',
        'deco_stone_dust_soft_01',
        large ? 'deco_pebble_cluster_01' : 'deco_cracked_earth_01',
        Phaser.Utils.Array.GetRandom(rockKeys),
        Phaser.Utils.Array.GetRandom(grassKeys),
      ]);
    }
    if (zone === 'forest') return firstExisting(['floor_forest_moss_soft_01', 'floor_grass_blob_soft_01', Phaser.Utils.Array.GetRandom(forestFernKeys), Phaser.Utils.Array.GetRandom(grassKeys)]);
    if (zone === 'riverside') return firstExisting(['floor_wet_mud_soft_01', 'floor_grass_blob_soft_01', Phaser.Utils.Array.GetRandom(riversideCattailKeys), Phaser.Utils.Array.GetRandom(grassKeys)]);
    return firstExisting(['floor_grass_blob_soft_01', ...flowerKeys, ...grassKeys]);
  };
  const groundOverlayTint = (zone, large = false) => ({
    desert: large ? 0xe0c07a : 0xd8bd78,
    ruins: large ? 0xcbbfa8 : 0xd0c5ad,
    forest: large ? 0x9fbf86 : 0xb6d49a,
    riverside: large ? 0xb7d8c6 : 0xd0e8d0,
    grasslands: large ? 0xd5e2ad : 0xe0edbf,
  }[zone] || 0xffffff);

  const transitionOverlayKey = (zone, neighborZone = zone, pathShoulder = false) => {
    if (zone === 'desert' || neighborZone === 'desert') {
      return firstExisting(['floor_sand_wash_soft_01', 'deco_sand_scuff_soft_01', 'deco_dry_grass_tuft_01', 'deco_cracked_earth_01']);
    }
    if (zone === 'ruins' || neighborZone === 'ruins') {
      return firstExisting(['floor_stone_dust_soft_01', 'deco_stone_dust_soft_01', 'deco_pebble_cluster_01', 'deco_cracked_earth_01']);
    }
    if (pathShoulder) {
      return firstExisting(['floor_grass_blob_soft_01', 'deco_pebble_cluster_01', 'deco_sand_scuff_soft_01', Phaser.Utils.Array.GetRandom(grassKeys)]);
    }
    if (zone === 'riverside' || neighborZone === 'riverside') {
      return firstExisting(['floor_wet_mud_soft_01', 'deco_stone_dust_soft_01', Phaser.Utils.Array.GetRandom(riversideCattailKeys), Phaser.Utils.Array.GetRandom(grassKeys)]);
    }
    if (zone === 'forest' || neighborZone === 'forest') {
      return firstExisting(['floor_forest_moss_soft_01', 'deco_dry_grass_tuft_01', Phaser.Utils.Array.GetRandom(forestFernKeys), Phaser.Utils.Array.GetRandom(grassKeys)]);
    }
    return firstExisting(['floor_grass_blob_soft_01', 'deco_pebble_cluster_01', Phaser.Utils.Array.GetRandom(flowerKeys), Phaser.Utils.Array.GetRandom(grassKeys)]);
  };

  const blendTint = (zone, neighborZone) => {
    if (zone === 'desert' || neighborZone === 'desert') return 0xd8bf80;
    if (zone === 'ruins' || neighborZone === 'ruins') return 0xbfb6a2;
    if (zone === 'riverside' || neighborZone === 'riverside') return 0xbfd8c8;
    if (zone === 'forest' || neighborZone === 'forest') return 0xa8c898;
    return 0xd8e0b8;
  };

  const floorWashKey = (zone) => {
    if (zone === 'desert') return firstExisting(['floor_sand_wash_soft_01', 'deco_sand_scuff_soft_01', 'deco_dry_grass_tuft_01']);
    if (zone === 'ruins') return firstExisting(['floor_stone_dust_soft_01', 'deco_stone_dust_soft_01', 'deco_pebble_cluster_01']);
    if (zone === 'riverside') return firstExisting(['floor_wet_mud_soft_01', 'deco_stone_dust_soft_01', 'deco_sand_scuff_soft_01']);
    if (zone === 'forest') return firstExisting(['floor_forest_moss_soft_01', 'floor_grass_blob_soft_01', 'deco_sand_scuff_soft_01']);
    return firstExisting(['floor_grass_blob_soft_01', 'deco_sand_scuff_soft_01', Phaser.Utils.Array.GetRandom(grassKeys)]);
  };

  const placeGroundTransition = (r, c, key, opts = {}) => {
    if (!key || !scene.textures.exists(key)) return null;
    const dir = opts.dir || { dr: 0, dc: 0 };
    const x = c * TILE_SIZE + TILE_SIZE / 2
      + dir.dc * (opts.edgeOffset ?? 34)
      + Phaser.Math.Between(-(opts.jitterX ?? 30), opts.jitterX ?? 30);
    const y = r * TILE_SIZE + TILE_SIZE / 2
      + dir.dr * (opts.edgeOffset ?? 30)
      + Phaser.Math.Between(-(opts.jitterY ?? 26), opts.jitterY ?? 26);
    const img = scene.add.image(x, y, key);
    img.setScale((opts.h ?? Phaser.Math.Between(96, 190)) / img.height);
    img.setAlpha(opts.alpha ?? Phaser.Math.FloatBetween(0.10, 0.18));
    img.setAngle(Phaser.Math.Between(0, 359));
    img.setDepth(opts.depth ?? -785);
    if (opts.tint) img.setTint(opts.tint);
    return img;
  };

  const placeSceneGround = (x, y, key, h, opts = {}) => {
    if (!key || !scene.textures.exists(key)) return null;
    const img = scene.add.image(x, y, key);
    img.setScale(h / img.height);
    img.setAlpha(opts.alpha ?? 0.14);
    img.setAngle(opts.angle ?? Phaser.Math.Between(0, 359));
    img.setDepth(opts.depth ?? -782);
    if (opts.tint) img.setTint(opts.tint);
    return img;
  };

  const placeSceneItem = (cx, cy, dx, dy, key, h, opts = {}) => {
    if (!key || !scene.textures.exists(key)) return null;
    return placeLandmarkDeco(key, cx + dx, cy + dy, h, {
      maxAngle: opts.maxAngle ?? 10,
      alpha: opts.alpha ?? 1,
      tint: opts.tint,
      alignBottom: opts.alignBottom,
      shadow: opts.shadow,
      shadowAlpha: opts.shadowAlpha ?? 0.24,
      sway: opts.sway,
      swayAmp: opts.swayAmp,
      allowFlip: opts.allowFlip,
      depth: opts.depth,
    });
  };

  const placeFloorWash = (tile_r, tile_c, zone, size, alpha, depth = -825) => {
    const key = floorWashKey(zone);
    if (!key || !scene.textures.exists(key)) return null;
    const x = tile_c * TILE_SIZE + TILE_SIZE / 2 + Phaser.Math.Between(-44, 44);
    const y = tile_r * TILE_SIZE + TILE_SIZE / 2 + Phaser.Math.Between(-38, 38);
    const img = scene.add.image(x, y, key);
    img.setScale(size / img.height);
    img.setAlpha(alpha);
    img.setAngle(Phaser.Math.Between(0, 359));
    img.setDepth(depth);
    img.setTint(groundOverlayTint(zone, true));
    return img;
  };

  const addMicroScene = (tile_r, tile_c, zone, variant = 0) => {
    if (getCellType(tile_r, tile_c) !== 'grass') return;
    const cx = tile_c * TILE_SIZE + TILE_SIZE / 2 + Phaser.Math.Between(-18, 18);
    const cy = tile_r * TILE_SIZE + TILE_SIZE / 2 + Phaser.Math.Between(-14, 14);
    const rot = (variant % 4) * Math.PI / 2;
    const pt = (x, y) => ({
      x: Math.round(x * Math.cos(rot) - y * Math.sin(rot)),
      y: Math.round(x * Math.sin(rot) + y * Math.cos(rot)),
    });
    const add = (x, y, key, h, opts = {}) => {
      const p = pt(x, y);
      placeSceneItem(cx, cy, p.x, p.y, key, h, opts);
    };
    const ground = (x, y, key, h, opts = {}) => {
      const p = pt(x, y);
      placeSceneGround(cx + p.x, cy + p.y, key, h, opts);
    };

    if (zone === 'desert') {
      ground(0, 0, 'deco_sand_scuff_soft_01', 190, { tint: 0xd8bf80, alpha: 0.18 });
      ground(-22, 18, 'deco_cracked_earth_01', 82, { tint: 0xd2b26e, alpha: 0.18 });
      add(-34, 14, Phaser.Utils.Array.GetRandom(rockKeys), 46, { tint: desertRockTint, alignBottom: true, shadow: true });
      add(28, -18, 'deco_dry_grass_tuft_01', 58, { tint: 0xd6c178, alpha: 0.72, maxAngle: 16 });
      if (tileNoise(tile_r, tile_c, 421) > 0.52) add(42, 28, 'cactus_set', 72, { alignBottom: true, shadow: true, maxAngle: 5 });
      return;
    }
    if (zone === 'ruins') {
      ground(0, 0, 'deco_stone_dust_soft_01', 190, { tint: 0xbfb6a2, alpha: 0.16 });
      ground(22, -10, 'deco_pebble_cluster_01', 76, { tint: ruinTint, alpha: 0.18 });
      add(-38, 18, Phaser.Utils.Array.GetRandom(rockKeys), 52, { tint: ruinTint, alignBottom: true, shadow: true });
      add(34, 28, 'deco_cracked_earth_01', 66, { tint: 0xb8ad96, alpha: 0.78, maxAngle: 18 });
      if (ruinsPillarKeys.length && tileNoise(tile_r, tile_c, 431) > 0.58) add(0, -32, Phaser.Utils.Array.GetRandom(ruinsPillarKeys), 92, { alignBottom: true, shadow: true, maxAngle: 4 });
      return;
    }
    if (zone === 'forest') {
      ground(0, 0, 'deco_stone_dust_soft_01', 150, { tint: 0xa8c898, alpha: 0.08 });
      add(-36, 8, Phaser.Utils.Array.GetRandom(forestFernKeys), 54, { tint: forestTint, alpha: 0.92, maxAngle: 14, sway: true, swayAmp: 2 });
      add(24, -14, Phaser.Utils.Array.GetRandom(mushroomKeys), 42, { maxAngle: 8 });
      add(42, 24, Phaser.Utils.Array.GetRandom(grassKeys), 46, { tint: forestTint, alpha: 0.78, maxAngle: 16, sway: true, swayAmp: 2 });
      if (tileNoise(tile_r, tile_c, 441) > 0.62) add(-8, -38, Phaser.Utils.Array.GetRandom(treeKeys), 128, { tint: forestTint, alignBottom: true, shadow: true, maxAngle: 3 });
      return;
    }
    if (zone === 'riverside') {
      ground(0, 0, 'deco_stone_dust_soft_01', 160, { tint: 0xbfd8c8, alpha: 0.10 });
      ground(-20, 18, 'deco_pebble_cluster_01', 68, { tint: 0xb8d8c8, alpha: 0.16 });
      add(-36, -4, Phaser.Utils.Array.GetRandom(riversideCattailKeys), 62, { alignBottom: true, shadow: true, maxAngle: 9, sway: true, swayAmp: 1.5 });
      add(28, 18, Phaser.Utils.Array.GetRandom(flowerKeys), 48, { maxAngle: 14, sway: true, swayAmp: 2 });
      add(42, -24, Phaser.Utils.Array.GetRandom(grassKeys), 48, { alpha: 0.86, maxAngle: 16, sway: true, swayAmp: 2 });
      return;
    }

    ground(0, 0, 'deco_sand_scuff_soft_01', 112, { tint: 0xd8e0b8, alpha: 0.035 });
    add(-36, 12, Phaser.Utils.Array.GetRandom(flowerKeys), 50, { maxAngle: 14, sway: true, swayAmp: 2 });
    add(24, -18, Phaser.Utils.Array.GetRandom(grassKeys), 50, { alpha: 0.88, maxAngle: 16, sway: true, swayAmp: 2 });
    add(42, 22, Phaser.Utils.Array.GetRandom(mushroomKeys), 38, { maxAngle: 8 });
    if (tileNoise(tile_r, tile_c, 451) > 0.66) add(-4, -38, Phaser.Utils.Array.GetRandom(bushKeys), 58, { alignBottom: true, shadow: true, maxAngle: 6 });
  };

  const addIdentitySetPiece = (tile_r, tile_c, zone, variant = 0) => {
    if (getCellType(tile_r, tile_c) !== 'grass') return;
    const cx = tile_c * TILE_SIZE + TILE_SIZE / 2 + Phaser.Math.Between(-20, 20);
    const cy = tile_r * TILE_SIZE + TILE_SIZE / 2 + Phaser.Math.Between(-18, 18);
    const flip = variant % 2 === 1 ? -1 : 1;
    const ground = (dx, dy, key, h, tint, alpha = 0.14) =>
      placeSceneGround(cx + dx * flip, cy + dy, key, h, { tint, alpha });
    const item = (dx, dy, key, h, opts = {}) =>
      placeSceneItem(cx, cy, dx * flip, dy, key, h, opts);

    if (zone === 'desert') {
      ground(0, 0, 'deco_sand_scuff_soft_01', 250, 0xd8bf80, 0.18);
      ground(-42, 24, 'deco_cracked_earth_01', 104, 0xd2b26e, 0.18);
      item(-58, 28, Phaser.Utils.Array.GetRandom(rockKeys), 64, { tint: desertRockTint, alignBottom: true, shadow: true, maxAngle: 10 });
      item(18, -18, 'cactus_set', 110, { alignBottom: true, shadow: true, maxAngle: 4 });
      item(58, 34, 'deco_dry_grass_tuft_01', 72, { tint: 0xd6c178, alpha: 0.76, maxAngle: 16 });
      return;
    }
    if (zone === 'ruins') {
      ground(0, 0, 'deco_stone_dust_soft_01', 250, 0xbfb6a2, 0.17);
      ground(42, 24, 'deco_pebble_cluster_01', 94, ruinTint, 0.20);
      if (ruinsPillarKeys.length) item(-24, -24, Phaser.Utils.Array.GetRandom(ruinsPillarKeys), 128, { alignBottom: true, shadow: true, maxAngle: 4 });
      item(-70, 34, Phaser.Utils.Array.GetRandom(rockKeys), 64, { tint: ruinTint, alignBottom: true, shadow: true, maxAngle: 12 });
      item(58, -10, 'deco_cracked_earth_01', 86, { tint: 0xb8ad96, alpha: 0.82, maxAngle: 14 });
      return;
    }
    if (zone === 'forest') {
      ground(0, 0, 'deco_stone_dust_soft_01', 210, 0xa8c898, 0.08);
      item(-42, 12, Phaser.Utils.Array.GetRandom(treeKeys), 158, { tint: forestTint, alignBottom: true, shadow: true, maxAngle: 3 });
      item(38, -16, Phaser.Utils.Array.GetRandom(forestFernKeys), 66, { tint: forestTint, alpha: 0.94, maxAngle: 12 });
      item(70, 34, Phaser.Utils.Array.GetRandom(mushroomKeys), 48, { maxAngle: 8 });
      item(-78, 46, Phaser.Utils.Array.GetRandom(grassKeys), 54, { tint: forestTint, alpha: 0.82, maxAngle: 16, sway: true, swayAmp: 2 });
      return;
    }
    if (zone === 'riverside') {
      ground(0, 0, 'deco_stone_dust_soft_01', 220, 0xbfd8c8, 0.12);
      ground(-48, 28, 'deco_pebble_cluster_01', 94, 0xb8d8c8, 0.18);
      item(-54, -8, Phaser.Utils.Array.GetRandom(riversideCattailKeys), 82, { alignBottom: true, shadow: true, maxAngle: 8, sway: true, swayAmp: 1.5 });
      item(34, 20, Phaser.Utils.Array.GetRandom(flowerKeys), 62, { maxAngle: 14, sway: true, swayAmp: 2 });
      item(72, -24, Phaser.Utils.Array.GetRandom(grassKeys), 60, { alpha: 0.86, maxAngle: 16, sway: true, swayAmp: 2 });
      return;
    }

    ground(0, 0, 'deco_sand_scuff_soft_01', 138, 0xd8e0b8, 0.04);
    item(-54, 14, Phaser.Utils.Array.GetRandom(flowerKeys), 64, { maxAngle: 14, sway: true, swayAmp: 2 });
    item(34, -22, Phaser.Utils.Array.GetRandom(bushKeys), 72, { alignBottom: true, shadow: true, maxAngle: 6 });
    item(78, 28, Phaser.Utils.Array.GetRandom(mushroomKeys), 44, { maxAngle: 8 });
    item(-86, 46, Phaser.Utils.Array.GetRandom(grassKeys), 56, { alpha: 0.86, maxAngle: 16, sway: true, swayAmp: 2 });
  };

  const addShorelineScene = (tile_r, tile_c, variant = 0) => {
    if (getCellType(tile_r, tile_c) !== 'grass' || getZone(tile_r, tile_c) !== 'riverside') return;
    const dir = adjacentPathDir(tile_r, tile_c) || { dr: 0, dc: -1 };
    const cx = tile_c * TILE_SIZE + TILE_SIZE / 2 + dir.dc * 18 + Phaser.Math.Between(-12, 12);
    const cy = tile_r * TILE_SIZE + TILE_SIZE / 2 + dir.dr * 16 + Phaser.Math.Between(-10, 10);
    const flip = variant % 2 === 1 ? -1 : 1;
    const sideX = dir.dr ? flip : -dir.dc || flip;
    const sideY = dir.dc ? flip : -dir.dr || flip;
    const ground = (dx, dy, key, h, tint, alpha) =>
      placeSceneGround(cx + dx * sideX, cy + dy * sideY, key, h, { tint, alpha });
    const item = (dx, dy, key, h, opts = {}) =>
      placeSceneItem(cx, cy, dx * sideX, dy * sideY, key, h, opts);

    ground(0, 0, 'deco_stone_dust_soft_01', 190, 0xbfd8c8, 0.12);
    ground(-34, 18, 'deco_pebble_cluster_01', 82, 0xb8d8c8, 0.18);
    ground(32, -18, 'deco_sand_scuff_soft_01', 140, 0xc8e8d8, 0.08);
    item(-48, -4, Phaser.Utils.Array.GetRandom(riversideCattailKeys), 74, { alignBottom: true, shadow: true, maxAngle: 8, sway: true, swayAmp: 1.4 });
    item(-18, 24, Phaser.Utils.Array.GetRandom(riversideCattailKeys), 58, { alignBottom: true, shadow: true, maxAngle: 8, sway: true, swayAmp: 1.2 });
    item(34, 20, Phaser.Utils.Array.GetRandom(flowerKeys), 52, { maxAngle: 14, sway: true, swayAmp: 1.8 });
    if (tileNoise(tile_r, tile_c, 531) > 0.46) {
      item(54, -18, Phaser.Utils.Array.GetRandom(grassKeys), 52, { alpha: 0.84, maxAngle: 16, sway: true, swayAmp: 1.8 });
    }
  };

  const addForestGroveScene = (tile_r, tile_c, variant = 0) => {
    if (getCellType(tile_r, tile_c) !== 'grass' || getZone(tile_r, tile_c) !== 'forest') return;
    const cx = tile_c * TILE_SIZE + TILE_SIZE / 2 + Phaser.Math.Between(-16, 16);
    const cy = tile_r * TILE_SIZE + TILE_SIZE / 2 + Phaser.Math.Between(-14, 14);
    const flip = variant % 2 === 1 ? -1 : 1;
    const ground = (dx, dy, key, h, tint, alpha) =>
      placeSceneGround(cx + dx * flip, cy + dy, key, h, { tint, alpha });
    const item = (dx, dy, key, h, opts = {}) =>
      placeSceneItem(cx, cy, dx * flip, dy, key, h, opts);

    ground(0, 0, 'deco_stone_dust_soft_01', 210, 0xa8c898, 0.09);
    ground(-34, 22, 'deco_sand_scuff_soft_01', 150, 0xb8d8a0, 0.07);
    item(-48, 8, Phaser.Utils.Array.GetRandom(forestFernKeys), 68, { tint: forestTint, alpha: 0.94, maxAngle: 12, sway: true, swayAmp: 1.8 });
    item(36, -20, Phaser.Utils.Array.GetRandom(mushroomKeys), 48, { maxAngle: 8 });
    item(58, 26, Phaser.Utils.Array.GetRandom(grassKeys), 54, { tint: forestTint, alpha: 0.84, maxAngle: 16, sway: true, swayAmp: 1.8 });
    if (tileNoise(tile_r, tile_c, 561) > 0.38) {
      item(-8, -42, Phaser.Utils.Array.GetRandom(treeKeys), 146, { tint: forestTint, alignBottom: true, shadow: true, maxAngle: 3 });
    }
    if (tileNoise(tile_r, tile_c, 562) > 0.54) {
      item(74, 42, Phaser.Utils.Array.GetRandom(mushroomKeys), 42, { maxAngle: 8 });
    }
  };

  const addRuinsWallScene = (tile_r, tile_c, variant = 0) => {
    if (getCellType(tile_r, tile_c) !== 'grass' || getZone(tile_r, tile_c) !== 'ruins') return;
    const cx = tile_c * TILE_SIZE + TILE_SIZE / 2 + Phaser.Math.Between(-18, 18);
    const cy = tile_r * TILE_SIZE + TILE_SIZE / 2 + Phaser.Math.Between(-16, 16);
    const flip = variant % 2 === 1 ? -1 : 1;
    const ground = (dx, dy, key, h, tint, alpha) =>
      placeSceneGround(cx + dx * flip, cy + dy, key, h, { tint, alpha });
    const item = (dx, dy, key, h, opts = {}) =>
      placeSceneItem(cx, cy, dx * flip, dy, key, h, opts);

    ground(0, 0, 'deco_stone_dust_soft_01', 240, 0xbfb6a2, 0.16);
    ground(-42, 22, 'deco_pebble_cluster_01', 100, ruinTint, 0.20);
    ground(40, -20, 'deco_cracked_earth_01', 96, 0xb8ad96, 0.18);
    if (ruinsPillarKeys.length) {
      item(-34, -28, Phaser.Utils.Array.GetRandom(ruinsPillarKeys), 132, { alignBottom: true, shadow: true, maxAngle: 4 });
    }
    item(34, 24, Phaser.Utils.Array.GetRandom(rockKeys), 66, { tint: ruinTint, alignBottom: true, shadow: true, maxAngle: 12 });
    item(74, -10, Phaser.Utils.Array.GetRandom(rockKeys), 52, { tint: ruinTint, alignBottom: true, shadow: true, maxAngle: 12 });
    if (tileNoise(tile_r, tile_c, 592) > 0.52) {
      item(-78, 38, Phaser.Utils.Array.GetRandom(bushKeys), 58, { tint: 0xa89878, alignBottom: true, shadow: true, maxAngle: 6 });
    }
  };

  const identityTiles = [];
  const identityCounts = { grasslands: 0, forest: 0, desert: 0, ruins: 0, riverside: 0 };
  const queueIdentity = (r, c, zoneHint = null) => {
    if (r <= 1 || c <= 1 || r >= MAP_ROWS - 2 || c >= MAP_COLS - 2) return;
    if (getCellType(r, c) !== 'grass') return;
    const zone = zoneHint || getZone(r, c);
    if (identityCounts[zone] >= 5) return;
    identityCounts[zone]++;
    identityTiles.push({ r, c, zone });
  };
  for (const lm of landmarkTiles().filter((p) => p.primary)) {
    const zone = getZone(lm.r, lm.c);
    queueIdentity(lm.r - 3, lm.c + 1, zone);
    queueIdentity(lm.r + 3, lm.c - 1, zone);
  }
  for (let r = 2; r < MAP_ROWS - 2; r++) {
    for (let c = 2; c < MAP_COLS - 2; c++) {
      const zone = getZone(r, c);
      if (identityCounts[zone] >= 5) continue;
      if (getCellType(r, c) !== 'grass' || !adjacentPathDir(r, c)) continue;
      if (tileNoise(r, c, 481) > 0.994) queueIdentity(r, c, zone);
    }
  }
  const usedIdentityTiles = new Set();
  for (const s of identityTiles) {
    const key = `${s.r},${s.c}`;
    if (usedIdentityTiles.has(key)) continue;
    usedIdentityTiles.add(key);
    addIdentitySetPiece(s.r, s.c, s.zone, Math.floor(tileNoise(s.r, s.c, 491) * 4));
  }

  const shorelineTiles = [];
  const queueShoreline = (r, c) => {
    if (r <= 1 || c <= 1 || r >= MAP_ROWS - 2 || c >= MAP_COLS - 2) return;
    if (shorelineTiles.length >= 18) return;
    if (getCellType(r, c) !== 'grass' || getZone(r, c) !== 'riverside') return;
    if (!adjacentPathDir(r, c) && !nearZoneBoundary(r, c)) return;
    shorelineTiles.push({ r, c });
  };
  for (const lm of landmarkTiles().filter((p) => getZone(p.r, p.c) === 'riverside')) {
    queueShoreline(lm.r - 1, lm.c - 2);
    queueShoreline(lm.r + 1, lm.c - 2);
    queueShoreline(lm.r - 2, lm.c - 1);
    queueShoreline(lm.r + 2, lm.c - 1);
  }
  for (let r = 2; r < MAP_ROWS - 2 && shorelineTiles.length < 18; r++) {
    for (let c = 2; c < MAP_COLS - 2 && shorelineTiles.length < 18; c++) {
      if (tileNoise(r, c, 521) > 0.992) queueShoreline(r, c);
    }
  }
  const usedShorelineTiles = new Set();
  for (const s of shorelineTiles) {
    const key = `${s.r},${s.c}`;
    if (usedShorelineTiles.has(key)) continue;
    usedShorelineTiles.add(key);
    addShorelineScene(s.r, s.c, Math.floor(tileNoise(s.r, s.c, 541) * 4));
  }

  const forestGroveTiles = [];
  const queueForestGrove = (r, c) => {
    if (r <= 1 || c <= 1 || r >= MAP_ROWS - 2 || c >= MAP_COLS - 2) return;
    if (forestGroveTiles.length >= 16) return;
    if (getCellType(r, c) !== 'grass' || getZone(r, c) !== 'forest') return;
    if (!adjacentPathDir(r, c) && !nearZoneBoundary(r, c)) return;
    forestGroveTiles.push({ r, c });
  };
  for (const lm of landmarkTiles().filter((p) => getZone(p.r, p.c) === 'forest')) {
    queueForestGrove(lm.r - 2, lm.c - 1);
    queueForestGrove(lm.r - 2, lm.c + 1);
    queueForestGrove(lm.r + 1, lm.c - 2);
    queueForestGrove(lm.r + 1, lm.c + 2);
  }
  for (let r = 2; r < MAP_ROWS - 2 && forestGroveTiles.length < 16; r++) {
    for (let c = 2; c < MAP_COLS - 2 && forestGroveTiles.length < 16; c++) {
      if (tileNoise(r, c, 551) > 0.992) queueForestGrove(r, c);
    }
  }
  const usedForestGroveTiles = new Set();
  for (const s of forestGroveTiles) {
    const key = `${s.r},${s.c}`;
    if (usedForestGroveTiles.has(key)) continue;
    usedForestGroveTiles.add(key);
    addForestGroveScene(s.r, s.c, Math.floor(tileNoise(s.r, s.c, 571) * 4));
  }

  const ruinsWallTiles = [];
  const queueRuinsWall = (r, c) => {
    if (r <= 1 || c <= 1 || r >= MAP_ROWS - 2 || c >= MAP_COLS - 2) return;
    if (ruinsWallTiles.length >= 16) return;
    if (getCellType(r, c) !== 'grass' || getZone(r, c) !== 'ruins') return;
    if (!adjacentPathDir(r, c) && !nearZoneBoundary(r, c)) return;
    ruinsWallTiles.push({ r, c });
  };
  for (const lm of landmarkTiles().filter((p) => getZone(p.r, p.c) === 'ruins')) {
    queueRuinsWall(lm.r - 2, lm.c - 1);
    queueRuinsWall(lm.r + 2, lm.c - 1);
    queueRuinsWall(lm.r - 1, lm.c + 2);
    queueRuinsWall(lm.r + 1, lm.c + 2);
  }
  for (let r = 2; r < MAP_ROWS - 2 && ruinsWallTiles.length < 16; r++) {
    for (let c = 2; c < MAP_COLS - 2 && ruinsWallTiles.length < 16; c++) {
      if (tileNoise(r, c, 581) > 0.992) queueRuinsWall(r, c);
    }
  }
  const usedRuinsWallTiles = new Set();
  for (const s of ruinsWallTiles) {
    const key = `${s.r},${s.c}`;
    if (usedRuinsWallTiles.has(key)) continue;
    usedRuinsWallTiles.add(key);
    addRuinsWallScene(s.r, s.c, Math.floor(tileNoise(s.r, s.c, 591) * 4));
  }

  let floorWashCount = 0;
  for (let r = 1; r < MAP_ROWS - 1; r++) {
    for (let c = 1; c < MAP_COLS - 1; c++) {
      if (getCellType(r, c) !== 'grass' || floorWashCount >= 150) continue;
      const zone = getZone(r, c);
      const nearRoad = !!adjacentPathDir(r, c);
      const nearEdge = nearZoneBoundary(r, c);
      const noise = tileNoise(r, c, nearRoad ? 611 : 612);
      if ((nearRoad && noise > 0.70) || (nearEdge && noise > 0.74) || noise > 0.988) {
        const dry = zone === 'desert' || zone === 'ruins';
        placeFloorWash(
          r,
          c,
          zone,
          zone === 'grasslands'
            ? Phaser.Math.Between(170, 300)
            : (dry ? Phaser.Math.Between(240, 420) : Phaser.Math.Between(300, 520)),
          zone === 'grasslands'
            ? Phaser.Math.FloatBetween(0.022, 0.045)
            : (dry ? Phaser.Math.FloatBetween(0.045, 0.09) : Phaser.Math.FloatBetween(0.05, 0.10))
        );
        floorWashCount++;
      }
    }
  }

  let roadBlendCount = 0;
  let biomeBlendCount = 0;
  for (let r = 1; r < MAP_ROWS - 1; r++) {
    for (let c = 1; c < MAP_COLS - 1; c++) {
      if (getCellType(r, c) !== 'grass') continue;
      const zone = getZone(r, c);
      const pathDir = adjacentPathDir(r, c);
      if (pathDir && roadBlendCount < 700 && tileNoise(r, c, 301) > 0.24) {
        const key = transitionOverlayKey(zone, zone, true);
        placeGroundTransition(r, c, key, {
          dir: pathDir,
          edgeOffset: 42,
          h: Phaser.Math.Between(120, 230),
          alpha: zone === 'grasslands' ? Phaser.Math.FloatBetween(0.07, 0.14) : Phaser.Math.FloatBetween(0.16, 0.28),
          tint: blendTint(zone, zone),
          depth: -790,
        });
        if (tileNoise(r, c, 302) > 0.86) {
          placeGroundTransition(r, c, transitionOverlayKey(zone, zone, true), {
            dir: pathDir,
            edgeOffset: 18,
            h: Phaser.Math.Between(38, 74),
            alpha: zone === 'grasslands' ? Phaser.Math.FloatBetween(0.05, 0.10) : Phaser.Math.FloatBetween(0.12, 0.22),
            tint: blendTint(zone, zone),
            depth: -775,
          });
        }
        roadBlendCount++;
      }

      const zones = [...neighborZones(r, c)].filter((z) => z !== zone);
      const neighborZone = zones[0];
      if (neighborZone && biomeBlendCount < 420 && tileNoise(r, c, 311) > 0.28) {
        const key = transitionOverlayKey(zone, neighborZone, false);
        placeGroundTransition(r, c, key, {
          h: Phaser.Math.Between(150, 280),
          alpha: Phaser.Math.FloatBetween(0.10, 0.20),
          tint: blendTint(zone, neighborZone),
          depth: -795,
        });
        biomeBlendCount++;
      }
    }
  }

  // Authored micro-scenes — small composed patches near landmarks and roads.
  // These give the world "map designer touched this" moments without changing
  // movement or combat rules; every prop here is non-blocking.
  const sceneTiles = [];
  const sceneZoneCaps = { grasslands: 56, forest: 34, desert: 34, ruins: 34, riverside: 34 };
  const sceneZoneCounts = { grasslands: 0, forest: 0, desert: 0, ruins: 0, riverside: 0 };
  const queueScene = (r, c, zoneHint = null) => {
    if (r <= 0 || c <= 0 || r >= MAP_ROWS - 1 || c >= MAP_COLS - 1) return;
    if (getCellType(r, c) !== 'grass') return;
    const zone = zoneHint || getZone(r, c);
    if ((sceneZoneCounts[zone] || 0) >= (sceneZoneCaps[zone] || 24)) return;
    sceneZoneCounts[zone] = (sceneZoneCounts[zone] || 0) + 1;
    sceneTiles.push({ r, c, zone });
  };
  for (const lm of landmarkTiles()) {
    const zone = getZone(lm.r, lm.c);
    queueScene(lm.r - 2, lm.c, zone);
    queueScene(lm.r + 2, lm.c, zone);
    queueScene(lm.r, lm.c - 2, zone);
    queueScene(lm.r, lm.c + 2, zone);
  }
  for (let r = 2; r < MAP_ROWS - 2 && sceneTiles.length < 86; r++) {
    for (let c = 2; c < MAP_COLS - 2 && sceneTiles.length < 86; c++) {
      if (getCellType(r, c) !== 'grass' || !adjacentPathDir(r, c)) continue;
      if (tileNoise(r, c, 461) > 0.990) queueScene(r, c);
    }
  }
  for (let r = 3; r < MAP_ROWS - 3 && sceneTiles.length < 142; r++) {
    for (let c = 3; c < MAP_COLS - 3 && sceneTiles.length < 142; c++) {
      if (getCellType(r, c) !== 'grass') continue;
      if (adjacentPathDir(r, c) || nearZoneBoundary(r, c)) continue;
      const zone = getZone(r, c);
      const threshold = zone === 'grasslands' ? 0.985 : 0.992;
      if (tileNoise(r, c, 462) > threshold) queueScene(r, c, zone);
    }
  }
  const usedSceneTiles = new Set();
  for (const s of sceneTiles) {
    const key = `${s.r},${s.c}`;
    if (usedSceneTiles.has(key)) continue;
    usedSceneTiles.add(key);
    addMicroScene(s.r, s.c, s.zone, Math.floor(tileNoise(s.r, s.c, 471) * 4));
  }

  // Soft ground overlay pass — breaks the 128 px tile grid visually by
  // scattering translucent sprites at sub-tile offsets. Depth -800 sits
  // between map tiles (-1000) and props (-500/-620), so these blend terrain
  // without hiding monsters, labels, roads, or interactable props.
  const softKeys = [...flowerKeys, ...grassKeys];
  // Mid-size overlay layer — sparse and low-alpha so it adds organic
  // variation without drawing attention as another large patch pattern.
  const softCount = 720;
  for (let i = 0; i < softCount; i++) {
    const x = Phaser.Math.Between(0, WORLD_W);
    const y = Phaser.Math.Between(0, WORLD_H);
    const tile_r = Math.floor(y / TILE_SIZE), tile_c = Math.floor(x / TILE_SIZE);
    const z = getZone(tile_r, tile_c);
    if (getCellType(tile_r, tile_c) !== 'grass') continue;
    // Grasslands: skip the tinted-overlay scatter. After the uniform
    // grass + biome-blob refactor, the pale-green soft overlays read as
    // bleach patches on the uniform green base. Other biomes still get
    // them since they layer over the biome blob, not bare grass.
    if (z === 'grasslands') continue;
    const key = groundOverlayKey(z, false) || Phaser.Utils.Array.GetRandom(softKeys);
    if (!scene.textures.exists(key)) continue;
    const img = scene.add.image(x, y, key);
    const dry = z === 'desert' || z === 'ruins';
    const floorKey = key.startsWith('floor_');
    const baseH = floorKey
      ? Phaser.Math.Between(280, 520)
      : (dry ? Phaser.Math.Between(150, 260) : Phaser.Math.Between(210, 340));
    img.setScale(baseH / img.height);
    img.setAlpha(floorKey
      ? Phaser.Math.FloatBetween(0.12, 0.22)
      : (dry ? Phaser.Math.FloatBetween(0.06, 0.11) : Phaser.Math.FloatBetween(0.09, 0.16)));
    img.setAngle(Phaser.Math.Between(0, 359));
    img.setDepth(-800);
    img.setTint(groundOverlayTint(z, false));
  }

  // Macro-blob layer — larger, fainter sprites that span multiple tiles,
  // adding broad value variance and breaking long axis-aligned tile rows.
  const macroCount = 220;
  for (let i = 0; i < macroCount; i++) {
    const x = Phaser.Math.Between(0, WORLD_W);
    const y = Phaser.Math.Between(0, WORLD_H);
    const tile_r = Math.floor(y / TILE_SIZE), tile_c = Math.floor(x / TILE_SIZE);
    const z = getZone(tile_r, tile_c);
    if (getCellType(tile_r, tile_c) !== 'grass') continue;
    // Same skip as soft layer — pale yellow-green macro blobs were
    // reading as bleach patches on uniform grasslands grass.
    if (z === 'grasslands') continue;
    const key = groundOverlayKey(z, true) || Phaser.Utils.Array.GetRandom(softKeys);
    if (!scene.textures.exists(key)) continue;
    const img = scene.add.image(x, y, key);
    const dry = z === 'desert' || z === 'ruins';
    const floorKey = key.startsWith('floor_');
    const baseH = floorKey
      ? Phaser.Math.Between(560, 980)
      : (dry ? Phaser.Math.Between(300, 520) : Phaser.Math.Between(440, 720));
    img.setScale(baseH / img.height);
    img.setAlpha(floorKey
      ? Phaser.Math.FloatBetween(0.08, 0.16)
      : (dry ? Phaser.Math.FloatBetween(0.04, 0.08) : Phaser.Math.FloatBetween(0.055, 0.11)));
    img.setAngle(Phaser.Math.Between(0, 359));
    img.setDepth(-820);
    img.setTint(groundOverlayTint(z, true));
  }

  // Small ground accents — low-contrast pebble/crack/tuft details below
  // props. These make dry and rocky regions feel authored without adding
  // blockers or visual noise around combat readability.
  const accentCount = 300;
  for (let i = 0; i < accentCount; i++) {
    const x = Phaser.Math.Between(0, WORLD_W);
    const y = Phaser.Math.Between(0, WORLD_H);
    const tile_r = Math.floor(y / TILE_SIZE), tile_c = Math.floor(x / TILE_SIZE);
    const z = getZone(tile_r, tile_c);
    if (getCellType(tile_r, tile_c) !== 'grass') continue;
    let key;
    let h;
    let alpha;
    if (z === 'desert') {
      key = firstExisting(['deco_cracked_earth_01', 'deco_dry_grass_tuft_01', 'deco_sand_dune', Phaser.Utils.Array.GetRandom(grassKeys)]);
      h = Phaser.Math.Between(34, 82);
      alpha = Phaser.Math.FloatBetween(0.10, 0.18);
    } else if (z === 'ruins') {
      key = firstExisting(['deco_pebble_cluster_01', 'deco_cracked_earth_01', Phaser.Utils.Array.GetRandom(rockKeys)]);
      h = Phaser.Math.Between(30, 68);
      alpha = Phaser.Math.FloatBetween(0.09, 0.16);
    } else if (nearZoneBoundary(tile_r, tile_c) && tileNoise(tile_r, tile_c, 211) > 0.44) {
      key = firstExisting(['deco_pebble_cluster_01', Phaser.Utils.Array.GetRandom(grassKeys), Phaser.Utils.Array.GetRandom(flowerKeys)]);
      h = Phaser.Math.Between(34, 72);
      alpha = Phaser.Math.FloatBetween(0.10, 0.18);
    } else {
      continue;
    }
    if (!key || !scene.textures.exists(key)) continue;
    const img = scene.add.image(x, y, key);
    img.setScale(h / img.height);
    img.setAlpha(alpha);
    img.setAngle(Phaser.Math.Between(0, 359));
    img.setDepth(-780);
    img.setTint(groundOverlayTint(z, false));
  }
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
    this.hotStreak = 0;
    this.equipment = { weapon: null, armor: null };
    this.bossTrophies = {};
    this.trophyMilestones = {};
    this.classId = null;   // 'swordsman' | 'mage' | 'archer'
    this.classTier = 0;    // 0 = unselected, 1..4 once chosen
    this.classSwitches = 0; // count of paid swaps; first class pick is free
    this._titleCheckAt = 0; // ms; throttled cosmetic title re-evaluation
    this.shopBought = { hp: 0, atk: 0, def: 0, pot: 0 };
    this.visitedLandmarks = {}; // '<r>,<c>' -> true
    this._lastPanicAt = 0;
    this.level = 1;
    this.dead = false;
    this.dir = 'south';
    this.frame = 'idle';
    this.attackPoseUntil = 0;
    this._specialReady = false;
    this._specialChargeAt = 0; // ms; charge complete after SPECIAL_COOLDOWN
    this._specialRing = null;
    this._specialGlow = null;
    this.stunUntil = 0;
    this.lastRegen = 0;
    // RO-style sit-to-regen: track how long player has stood still (no path,
    // no target, no stun). After 1.5s idle, regen jumps from 2% / 3s to
    // 5% / 1.5s. No new key — auto-detect.
    this.idleSince = 0;
    this.restGlyph = null;

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
    // Texture-swap helper: source PNGs vary in pixel height (rookie 96 vs
    // knight 512 etc), so we recompute scale each swap to keep on-screen
    // size locked at PLAYER_DISPLAY_H — same trick MonsterController uses.
    // Preserves the current squash ratio (walk-bob sets scaleY < scaleX) so
    // the bob isn't wiped by the texture swap that happens later in update.
    this._setPlayerTexture = (dir, frame) => {
      const squashRatio = this.basePScale ? this.sprite.scaleY / this.basePScale : 1;
      applyRookieTexture(this.sprite, dir, frame);
      const h = this.sprite.height || 1;
      this.basePScale = PLAYER_DISPLAY_H / h;
      this.sprite.scaleX = this.basePScale;
      this.sprite.scaleY = this.basePScale * squashRatio;
    };
    this.groundY = y;
    this.followTarget = scene.add.zone(x, y, 1, 1).setVisible(false);
    this.shadow = scene.add.ellipse(
      x,
      y + this.sprite.displayHeight * 0.36,
      this.sprite.displayWidth * 0.54,
      Math.max(6, this.sprite.displayHeight * 0.09),
      0x000000,
      0.40
    ).setOrigin(0.5);

    // Player name/level — slightly larger with a heavier outline and a
    // subtle drop shadow so it reads cleanly against any biome backdrop
    // (grass green, desert sand, ruins grey).
    this.nameTag = scene.add.text(x, y, `Rookie Lv.${this.level}`, {
      fontSize: '17px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 5,
    }).setOrigin(0.5, 1);
    this.nameTag.setShadow(0, 2, '#000000', 3, false, true);
    if (this.nameTag.setResolution) this.nameTag.setResolution(2);
    // Cosmetic milestone title (e.g. "« Boss Hunter »"). Sits above the
    // class/level tag. Hidden until the player earns at least one title.
    this.titleTag = scene.add.text(x, y, '', {
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#ffe066',
      stroke: '#000',
      strokeThickness: 4,
    }).setOrigin(0.5, 1).setVisible(false);
    this.titleTag.setShadow(0, 2, '#000000', 3, false, true);
    if (this.titleTag.setResolution) this.titleTag.setResolution(2);
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
      const cosmetic = pickPlayerTitle(this);
      const prev = this._lastTitleLabel;
      if (cosmetic) {
        this.titleTag.setText(`« ${cosmetic.label} »`);
        this.titleTag.setColor(cosmetic.color);
        this.titleTag.setVisible(true);
        // Pulse + chat callout on first earn (or on upgrade to a new title).
        // Skip the very first refresh after spawn/load so titles already in
        // the save don't fire a stale pulse.
        if (this._titleInit && prev !== cosmetic.label) {
          if (typeof ui !== 'undefined' && ui) {
            ui.message(`✨ Title earned: ${cosmetic.label}`);
          }
          if (this.scene && this.scene.tweens) {
            this.titleTag.setScale(1.6).setAlpha(1);
            this.scene.tweens.add({
              targets: this.titleTag, scale: 1, duration: 380, ease: 'Back.easeOut',
            });
            spawnFloatText(this.scene, this.sprite.x, this.sprite.y - 86,
              `✨ ${cosmetic.label} ✨`, parseInt(cosmetic.color.slice(1), 16),
              { fontSize: '20px' });
          }
        }
        this._lastTitleLabel = cosmetic.label;
      } else {
        this.titleTag.setVisible(false);
        this._lastTitleLabel = null;
      }
      this._titleInit = true;
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
    // If the target is already inside our class's attack range, don't move
    // at all — ranged classes (Archer / Mage) shoot from where they stand.
    const dxNow = this.attackTarget.sprite.x - this.sprite.x;
    const dyNow = this.attackTarget.sprite.y - this.sprite.y;
    if (Math.hypot(dxNow, dyNow) <= playerAttackRange()) {
      this.path = [];
      return;
    }
    // Walk to a cell adjacent to the target so we end up inside attack range.
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
    spawnFootstepDust(this.scene, this.stepFromX, this.stepFromY, this.cellCol, this.cellRow);
  }

  _hasDirectionalTexture(dir, frame) {
    const info = DIR_TEXTURE[dir] || DIR_TEXTURE.south;
    const frameSeg =
        (frame === 'walk')  ? 'walk_'
      : (frame === 'walk2') ? 'walk2_'
      : (frame === 'walk3') ? 'walk3_'
      : (frame === 'walk4') ? 'walk4_'
      : 'idle_';
    const classDef = (this.classId && CLASS_DEFS[this.classId]) ? CLASS_DEFS[this.classId] : null;
    const exists = (k) => this.scene.textures.exists(k);
    if (classDef) {
      const tierPrefix = classDef.tierSpritePrefixes
        ? classDef.tierSpritePrefixes[this.classTier]
        : null;
      const prefixes = tierPrefix ? [tierPrefix, classDef.spritePrefix] : [classDef.spritePrefix];
      return prefixes.some(prefix => exists(prefix + frameSeg + info.base));
    }
    return exists('rookie_' + frameSeg + info.base);
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
    const frame = cycle[idx];
    if (this._hasDirectionalTexture(dir, frame)) return frame;
    if (frame !== 'idle' && this._hasDirectionalTexture(dir, 'walk')) return 'walk';
    return 'idle';
  }

  _syncShadow() {
    this.shadow.setPosition(this.sprite.x, this.groundY + this.sprite.displayHeight * 0.36);
    this.shadow.setDisplaySize(this.sprite.displayWidth * 0.54, Math.max(6, this.sprite.displayHeight * 0.09));
  }

  _syncFollowTarget() {
    this.followTarget.setPosition(this.sprite.x, this.groundY);
  }

  update(time, delta) {
    if (this.dead) {
      this._setPlayerTexture(this.dir, 'dead');
      this.sprite.setFlipX(false);
      this.sprite.setOrigin(0.5, 0.5);
      this.sprite.scaleY = this.basePScale;
      this._syncShadow();
      this._syncFollowTarget();
      const deadTop = this.sprite.y - this.sprite.displayHeight / 2;
      this.nameTag.setPosition(this.sprite.x, deadTop);
      if (this.titleTag.visible) this.titleTag.setPosition(this.sprite.x, deadTop - 18);
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
      if (!this._specialGlow) {
        this._specialGlow = this.scene.add.circle(this.sprite.x, this.sprite.y + 10, 44, 0xffe066, 0.16)
          .setDepth(this.sprite.y - 8);
        this._specialGlow.setBlendMode(Phaser.BlendModes.ADD);
      }
      this._specialRing.setVisible(true);
      this._specialGlow.setVisible(true);
    }
    if (this._specialRing && this._specialRing.visible) {
      this._specialRing.setPosition(this.sprite.x, this.sprite.y + 10);
      this._specialRing.setDepth(this.sprite.y - 5);
      const pulse = 1 + Math.sin(time / 120) * 0.08;
      this._specialRing.setScale(pulse);
      if (this._specialGlow) {
        this._specialGlow.setPosition(this.sprite.x, this.sprite.y + 10);
        this._specialGlow.setDepth(this.sprite.y - 8);
        this._specialGlow.setScale(1 + Math.sin(time / 160) * 0.12);
        this._specialGlow.setAlpha(0.12 + Math.sin(time / 180) * 0.04);
      }
    }

    // Auto-safety panic-heal: very low HP + can afford pot + off cooldown.
    if (this.hp > 0 && this.hp / this.maxHP < PANIC_HP_PCT &&
        this.zeny >= PANIC_COST &&
        time - this._lastPanicAt > PANIC_COOLDOWN_MS) {
      this.zeny -= PANIC_COST;
      const healed = this.maxHP - this.hp;
      this.hp = this.maxHP;
      this._lastPanicAt = time;
      spawnFloatText(this.scene, this.sprite.x, this.sprite.y - 32,
        `💚 PANIC HEAL +${healed}`, 0x66ff88, { fontSize: '18px' });
      if (typeof sfxHeal === 'function') sfxHeal();
      if (typeof ui !== 'undefined' && ui) {
        ui.message(`Panic heal used (−${fmt(PANIC_COST)}z, +${healed} HP).`);
      }
    }

    // Landmark discovery — first time the player's cell sits on a plaza.
    if (typeof landmarkTiles === 'function') {
      const cr = this.cellRow, cc = this.cellCol;
      for (const lm of landmarkTiles()) {
        // Plazas are defined in tile coords; convert to cell.
        const lmCellR = lm.r * Math.floor(TILE_SIZE / CELL_SIZE);
        const lmCellC = lm.c * Math.floor(TILE_SIZE / CELL_SIZE);
        const reach = (lm.radius + 1) * Math.floor(TILE_SIZE / CELL_SIZE);
        if (Math.abs(cr - lmCellR) <= reach && Math.abs(cc - lmCellC) <= reach) {
          const key = `${lm.r},${lm.c}`;
          if (!this.visitedLandmarks[key]) {
            this.visitedLandmarks[key] = true;
            this.zeny += DISCOVERY_ZENY;
            this.gainExp(DISCOVERY_EXP);
            const banner = this.scene.add.text(GAME_W / 2, 180,
              `★ Discovered new landmark! +${fmt(DISCOVERY_ZENY)}z, +${DISCOVERY_EXP} EXP`, {
              fontSize: '22px', fontStyle: 'bold', color: '#ffe066',
              stroke: '#000', strokeThickness: 4,
            }).setOrigin(0.5).setScrollFactor(0).setDepth(15000).setAlpha(0);
            this.scene.tweens.add({ targets: banner, alpha: 1, duration: 300,
              yoyo: true, hold: 1400, onComplete: () => banner.destroy() });
            if (typeof sfxLevelUp === 'function') sfxLevelUp();
          }
          break;
        }
      }
    }

    // RO-style sit-to-regen idle detection. Idle = no stun, finished step,
    // no path, no live attack target. Idle ≥1.5s → 2.5× regen.
    const fullyIdle = !stunned && this.stepT >= 1 && this.path.length === 0 &&
      (!this.attackTarget || !this.attackTarget.alive);
    if (fullyIdle) {
      if (!this.idleSince) this.idleSince = time;
    } else {
      this.idleSince = 0;
    }
    const resting = fullyIdle && this.idleSince && (time - this.idleSince) > 1500;
    // Show/hide little "💤" glyph above head while resting.
    if (resting) {
      if (!this.restGlyph) {
        this.restGlyph = this.scene.add.text(this.sprite.x, this.sprite.y - 56, '💤', {
          fontSize: '18px', stroke: '#000', strokeThickness: 3, resolution: 2,
        }).setOrigin(0.5).setDepth(this.sprite.y + 1);
        this.scene.tweens.add({ targets: this.restGlyph, y: this.sprite.y - 64,
          alpha: 0.7, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      }
      this.restGlyph.x = this.sprite.x;
    } else if (this.restGlyph) {
      this.restGlyph.destroy();
      this.restGlyph = null;
    }
    // Slow passive HP regen. Pauses while stunned (in combat hit recently).
    const regenInterval = resting ? 1500 : HP_REGEN_INTERVAL_MS;
    const regenPct = resting ? 0.05 : HP_REGEN_PCT;
    if (!stunned && this.hp < this.maxHP && time - this.lastRegen >= regenInterval) {
      this.lastRegen = time;
      const amount = Math.max(1, Math.floor(this.maxHP * regenPct));
      this.hp = Math.min(this.maxHP, this.hp + amount);
      // Tactile feedback for sit-regen: green "+N HP" float on rest ticks.
      if (resting && typeof spawnFloatText === 'function') {
        spawnFloatText(this.scene, this.sprite.x, this.sprite.y - 28,
          `+${amount} HP`, 0x88ff99, { fontSize: '13px' });
      }
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
    this._syncFollowTarget();

    if (showingAttack) {
      this._setPlayerTexture(this.dir, 'attack');
      // For the (classless) rookie attack pose only, mirror for west — the
      // single rookie_attack PNG faces east. When a class is chosen we trust
      // applyRookieTexture's flip choice (south fallback faces forward).
      if (!this.classId) this.sprite.setFlipX(this.dir === 'west');
    } else {
      this._setPlayerTexture(this.dir, this.frame);
    }

    // Pursue / auto-attack a clicked target.
    if (this.attackTarget) {
      if (!this.attackTarget.alive) {
        this.attackTarget = null;
      } else {
        const dx = this.attackTarget.sprite.x - this.sprite.x;
        const dy = this.attackTarget.sprite.y - this.sprite.y;
        const d = Math.hypot(dx, dy);
        if (d <= playerAttackRange()) {
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
    // Re-evaluate cosmetic title once per second so milestone unlocks (boss
    // kills, landmark discovery, zeny crossings) surface without callsites.
    if (time >= this._titleCheckAt) {
      this._refreshNameTag();
      this._titleCheckAt = time + 1000;
    }
    if (this.titleTag.visible) this.titleTag.setPosition(this.sprite.x, topY - 18);
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
    this.hotStreak = 0;
    if (this._specialRing) this._specialRing.setVisible(false);
    if (this._specialGlow) this._specialGlow.setVisible(false);
    if (this.restGlyph) { this.restGlyph.destroy(); this.restGlyph = null; }
    this.idleSince = 0;
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
    // Death animation: fade + slight scale-down so it reads as KO.
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.add({ targets: this.sprite, alpha: 0.25, duration: 500, ease: 'Quad.out' });
    // Center-screen "YOU DIED" + respawn countdown text.
    const cdSecs = Math.round(PLAYER_RESPAWN_MS / 1000);
    const youDied = this.scene.add.text(GAME_W / 2, GAME_H / 2 - 30, 'YOU DIED', {
      fontSize: '46px', fontStyle: 'bold', color: '#ff4444',
      stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(15000);
    const countdown = this.scene.add.text(GAME_W / 2, GAME_H / 2 + 30, `Respawning in ${cdSecs}…`, {
      fontSize: '20px', color: '#ffffff', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(15000);
    let left = cdSecs;
    const tick = this.scene.time.addEvent({
      delay: 1000, repeat: cdSecs - 1,
      callback: () => { left -= 1; if (left > 0) countdown.setText(`Respawning in ${left}…`); },
    });
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
      this.scene.tweens.killTweensOf(this.sprite);
      this.sprite.setAlpha(1);
      youDied.destroy();
      countdown.destroy();
      tick.remove();
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
      kills: player.kills, hotStreak: player.hotStreak, bestStreak: player.bestStreak,
      classId: player.classId, classTier: player.classTier,
      classSwitches: player.classSwitches,
      shopBought: player.shopBought,
      visitedLandmarks: player.visitedLandmarks,
      activeQuests: activeQuests, activeQuest: activeQuests[0] || null,
      questChain: questChain,
      equipment: player.equipment,
      bossTrophies: player.bossTrophies,
      trophyMilestones: player.trophyMilestones,
      cellCol: player.cellCol, cellRow: player.cellRow,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    if (ui && typeof ui.pulseSaveIndicator === 'function') ui.pulseSaveIndicator();
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
  player.hotStreak = save.hotStreak ?? 0;
  player.bestStreak = save.bestStreak ?? 0;
  player.equipment = Object.assign({ weapon: null, armor: null }, save.equipment || {});
  player.bossTrophies = Object.assign({}, save.bossTrophies || {});
  player.trophyMilestones = Object.assign({}, save.trophyMilestones || {});
  player.classId   = save.classId   ?? null;
  player.classTier = save.classTier ?? 0;
  player.classSwitches = save.classSwitches ?? 0;
  player.shopBought = Object.assign({ hp:0, atk:0, def:0, pot:0 }, save.shopBought || {});
  player.visitedLandmarks = save.visitedLandmarks || {};
  activeQuests = Array.isArray(save.activeQuests) ? save.activeQuests.slice(0, 2) : (save.activeQuest ? [save.activeQuest] : []);
  questChain = save.questChain ?? 0;
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

// Resolve any frame name ('idle' | 'walk' | 'walk2..4' | 'attack' | 'dead')
// + direction to the best texture key. Once a class is chosen we NEVER fall
// back to rookie art — missing directions/frames use the class south idle
// sprite so the player never visually reverts.
function pickPlayerTextureKey(sprite, dir, frame) {
  const info = DIR_TEXTURE[dir] || DIR_TEXTURE.south;
  const directional = !(frame === 'attack' || frame === 'dead');
  const frameSeg =
      (frame === 'walk')  ? 'walk_'
    : (frame === 'walk2') ? 'walk2_'
    : (frame === 'walk3') ? 'walk3_'
    : (frame === 'walk4') ? 'walk4_'
    : (frame === 'attack')? 'attack'
    : (frame === 'dead')  ? 'dead'
    : 'idle_';
  const dirSuffix = directional ? info.base : '';
  const classDef = (player && player.classId) ? CLASS_DEFS[player.classId] : null;
  const exists = (k) => sprite.scene.textures.exists(k);

  if (classDef) {
    const tierPrefix = classDef.tierSpritePrefixes && player
      ? classDef.tierSpritePrefixes[player.classTier]
      : null;
    const prefixes = tierPrefix ? [tierPrefix, classDef.spritePrefix] : [classDef.spritePrefix];
    for (const prefix of prefixes) {
      // 1. Exact class/tier + frame + direction.
      const exact = prefix + frameSeg + dirSuffix;
      if (exists(exact)) return { key: exact, info, classDef, isClassKey: true, flip: info.flip };
      // 2. Same frame, south fallback (cancels flip).
      const sameFrameSouth = prefix + frameSeg + 'south';
      if (exists(sameFrameSouth)) return { key: sameFrameSouth, info, classDef, isClassKey: true, flip: false };
      // 3. For walk variants (walk2/3/4) fall to plain walk south.
      if (frame !== 'idle' && frame !== 'attack' && frame !== 'dead') {
        const walkSouth = prefix + 'walk_south';
        if (exists(walkSouth)) return { key: walkSouth, info, classDef, isClassKey: true, flip: false };
      }
      // 4. Final for this prefix: idle south.
      const idleSouth = prefix + 'idle_south';
      if (exists(idleSouth)) return { key: idleSouth, info, classDef, isClassKey: true, flip: false };
    }
    // If somehow even the base class idle_south is missing, fall through to
    // rookie below so the player isn't invisible.
  }
  // No class chosen → original rookie path.
  const key = 'rookie_' + frameSeg + dirSuffix;
  return { key, info, classDef, isClassKey: false, flip: info.flip };
}

function applyRookieTexture(sprite, dir, frame) {
  const { key, info, classDef, isClassKey, flip } = pickPlayerTextureKey(sprite, dir, frame);
  sprite.setTexture(key);
  sprite.setFlipX(flip);
  // Real class art carries its own palette; clear tint so the sprite isn't
  // double-colored. When a class is chosen but we fell back through the
  // chain, the key is still a class key, so still clear tint.
  if (classDef) {
    if (isClassKey) sprite.clearTint();
    else sprite.setTint(classDef.tint);
  } else {
    sprite.clearTint();
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
    this.telegraphing = false;
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
      if (typeof ui !== 'undefined' && ui) {
        ui.announce(`Rare ${cfg.name} appeared`, { tone: 'rare', duration: 1700 });
      }
      sfxLevelUp();
    }
    this.sprite.setCollideWorldBounds(true);
    this.shadow = scene.add.ellipse(
      x,
      y + this.sprite.displayHeight * 0.34,
      this.sprite.displayWidth * 0.62,
      Math.max(6, this.sprite.displayHeight * 0.10),
      0x000000,
      0.38
    ).setOrigin(0.5);

    this._labelImportant = isBossCfg(cfg) || !!cfg.rare;
    this._hpBarW = isBossCfg(cfg) ? 52 : (cfg.rare ? 44 : 34);
    const nameFontSize = isBossCfg(cfg) ? '21px' : (cfg.rare ? '16px' : '13px');
    this.nameTag = scene.add.text(x, y, `${cfg.name} Lv.${this.level}`, {
      fontSize: nameFontSize,
      fontStyle: 'bold',
      color: cfg.nameColor,
      stroke: '#000000',
      strokeThickness: isBossCfg(cfg) ? 6 : (cfg.rare ? 4 : 3),
      resolution: 2,
    }).setOrigin(0.5, 1).setAlpha(this._labelImportant ? 1 : 0.74);

    this.hpBarBg = scene.add.rectangle(x, y, this._hpBarW, 4, 0x000000, this._labelImportant ? 0.82 : 0.62).setOrigin(0.5);
    this.hpBar = scene.add.rectangle(x, y, this._hpBarW, 4, 0xff3333, this._labelImportant ? 0.95 : 0.74).setOrigin(0, 0.5);
  }

  _syncShadow() {
    this.shadow.setPosition(this.sprite.x, this.sprite.y + this.sprite.displayHeight * 0.34);
    if (this.auraRing) this.auraRing.setPosition(this.sprite.x, this.sprite.y + 8);
    this.shadow.setDisplaySize(this.sprite.displayWidth * 0.62, Math.max(6, this.sprite.displayHeight * 0.10));
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
        if (time - this.lastAttack > BLOBLING_ATTACK_COOLDOWN && !this.telegraphing) {
          this.lastAttack = time;
          if (isBossCfg(this.cfg)) {
            this.telegraphing = true;
            spawnBossTelegraph(this.scene, player.sprite.x, player.sprite.y, this.cfg.nameColor || '#ff5555');
            this.scene.time.delayedCall(450, () => {
              this.telegraphing = false;
              if (!this.alive || player.dead || !this.provoked) return;
              const ddx = player.sprite.x - this.sprite.x;
              const ddy = player.sprite.y - this.sprite.y;
              if (Math.hypot(ddx, ddy) > BLOBLING_ATTACK_RANGE + 18) return;
              this._swingAtPlayer();
            });
          } else {
            this._swingAtPlayer();
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
    const nameY = topY + 3;
    const labelDepth = this.sprite.y + 90;
    const showDetail = this._labelImportant || this.provoked || dist < 520;
    const labelAlpha = this._labelImportant ? 1 : Phaser.Math.Clamp(1 - ((dist - 160) / 520), 0.28, 0.74);
    this.nameTag.setVisible(showDetail).setAlpha(labelAlpha);
    this.hpBarBg.setVisible(showDetail);
    this.hpBar.setVisible(showDetail);
    this.nameTag.setPosition(this.sprite.x, nameY);
    this.nameTag.setDepth(labelDepth);
    this.hpBarBg.setPosition(this.sprite.x, topY + 16);
    this.hpBar.setPosition(this.sprite.x - this._hpBarW / 2, topY + 16);
    this.hpBarBg.setDepth(labelDepth - 2);
    this.hpBar.setDepth(labelDepth - 1);
    this.hpBar.width = this._hpBarW * Math.max(0, this.hp / this.maxHP);
  }

  takeDamage(amount, opts = {}) {
    if (!this.alive) return;
    this.hp -= amount;
    // Getting hit provokes the monster for 5s.
    this.provoked = true;
    this.provokedUntil = this.scene.time.now + 5000;
    const color = opts.crit ? 0xffe14a : (opts.variance >= 1.12 ? 0xff9b3d : opts.variance <= 0.88 ? 0xffffff : 0xff5555);
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
    spawnDeathBurst(this.scene, this.sprite.x, this.sprite.y + 8, colorValue(this.cfg.tint || this.cfg.nameColor, 0xffffff));
    // Rare variant: grant N levels worth of EXP in one shot + huge fanfare.
    let earnedExp = this.cfg.levelsAward ? this.expReward : scaledMonsterExp(this);
    if (hardMode && !this.cfg.levelsAward) earnedExp = Math.round(earnedExp * 2);
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
      player.gainExp(earnedExp);
    }
    if (this.auraRing) { this.scene.tweens.killTweensOf(this.auraRing); this.auraRing.destroy(); this.auraRing = null; }
    player.kills += 1;
    awardHotStreak(this, earnedExp);
    recordBossTrophy(this);
    tryEquipDrop(this);
    onMonsterKilledForQuest(this);
    // Center-screen banner when a boss-tier monster (or aggressive) dies.
    const cfg = this.cfg || {};
    if (isBossCfg(cfg)) {
      const banner = this.scene.add.text(GAME_W / 2, 200, `${cfg.name} slain!`, {
        fontSize: '40px', fontStyle: 'bold', color: '#ffe066',
        stroke: '#5a3a00', strokeThickness: 6,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(19000).setAlpha(0);
      this.scene.tweens.add({ targets: banner, alpha: 1, duration: 300, yoyo: true,
        hold: 1500, onComplete: () => banner.destroy() });
      sfxLevelUp();
    }
    // Heal on kill: 8% of maxHP, scaled up for bosses (expReward >= 90)
    // and rare kills (always full heal).
    const healPct = this.cfg.levelsAward ? 1.0 : (isBossCfg(this.cfg) ? 0.30 : 0.08);
    const healAmt = Math.max(1, Math.round(player.maxHP * healPct));
    if (!player.dead && player.hp < player.maxHP) {
      player.hp = Math.min(player.maxHP, player.hp + healAmt);
      spawnFloatText(this.scene, player.sprite.x, player.sprite.y - 20, `+${fmt(healAmt)} HP`, 0x66ff88);
      sfxHeal();
    }
    ui.message(`Killed ${this.cfg.name} (+${earnedExp} EXP, +${healAmt} HP)`);
    spawnFloatText(this.scene, this.sprite.x, this.sprite.y - 30, `+${fmt(earnedExp)} EXP`, 0x66ff66, { fontSize: '14px' });

    // Drop a small zeny pile — scaled to monster reward. Hard mode doubles.
    let zenyDrop = Math.max(1, Math.round(this.expReward * Phaser.Math.FloatBetween(0.6, 1.6)));
    if (hardMode) zenyDrop = Math.round(zenyDrop * 2);
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

    const respawnDelay = isBossCfg(this.cfg) ? BOSS_RESPAWN_MS : RESPAWN_MS;
    if (isBossCfg(this.cfg)) bossRespawns[this.typeId] = this.scene.time.now + respawnDelay;
    this.scene.time.delayedCall(respawnDelay, () => spawnMonster(this.scene, this.typeId));
  }

  _swingAtPlayer() {
    const hit = rollMonsterHit(this.atk);
    if (hit.miss) {
      spawnFloatText(this.scene, player.sprite.x, player.sprite.y - 20, 'MISS', 0xcccccc);
      sfxMiss();
      return;
    }
    if (this.cfg.attackKey) this._setTex(this.cfg.attackKey);
    if (this.cfg.oneShotBelowLevel && player.level < this.cfg.oneShotBelowLevel) {
      hit.amount = player.hp + player.def;
    }
    player.takeDamage(hit.amount);
    sfxPlayerHit();
  }
}

// ---------- LootDrop ----------
// ---------- Road sparkles ----------
// Periodically drops a tiny zeny glint on a road tile near the player so
// following the roads feels rewarding. Capped so it never floods the map.
let _lastSparkleAt = 0;
const SPARKLE_INTERVAL_MS = 8000;
const SPARKLE_MAX_ALIVE   = 6;
const SPARKLE_NEAR_PX     = 900;

function tickRoadSparkles(scene, time) {
  if (time - _lastSparkleAt < SPARKLE_INTERVAL_MS) return;
  _lastSparkleAt = time;
  // Count current sparkles (zeny loots <= 30 are treated as sparkles).
  const aliveSparkles = loots.filter(l => l.alive && l.kind === 'zeny' && l.amount <= 30).length;
  if (aliveSparkles >= SPARKLE_MAX_ALIVE) return;
  // Sample 30 random tiles, pick the first walkable road tile near player.
  for (let tries = 0; tries < 30; tries++) {
    const tc = Math.floor(Math.random() * MAP_COLS);
    const tr = Math.floor(Math.random() * MAP_ROWS);
    const type = getCellType(tr, tc);
    if (!type || type === 'grass') continue;
    const wx = tc * TILE_SIZE + TILE_SIZE / 2;
    const wy = tr * TILE_SIZE + TILE_SIZE / 2;
    if (Math.hypot(wx - player.sprite.x, wy - player.sprite.y) > SPARKLE_NEAR_PX) continue;
    const zone = getZone(tr, tc);
    const tintByZone = {
      grasslands: 0xfff0a8, forest: 0x88ee88, desert: 0xffd28a,
      ruins: 0xcccccc, riverside: 0x99ddff,
    };
    loots.push(new LootDrop(scene, wx, wy, Phaser.Math.Between(5, 25), 'zeny', {
      sparkleColor: tintByZone[zone] || 0xffd24a,
    }));
    return;
  }
}

// ---------- Biome ambience particles ----------
// Cheap, infrequent particles tinted per biome. No physics, just fade tweens.
const AMBIENCE_RATE_PER_SEC = {
  grasslands: 0.6,
  forest:     2.0,
  desert:     1.2,
  ruins:      0.8,
  riverside:  1.4,
};
const AMBIENCE_STYLE = {
  grasslands: { color: 0xfff0a8, drift: { x: 0, y: -10 }, shape: 'dot',  size: 3 },
  forest:     { color: 0x88cc66, drift: { x: 12, y: 30 }, shape: 'leaf', size: 4 },
  desert:     { color: 0xffd28a, drift: { x: -6, y: -20 }, shape: 'dot', size: 2 },
  ruins:      { color: 0xcccccc, drift: { x: 0, y: -8 },  shape: 'dot', size: 2 },
  riverside:  { color: 0x99ddff, drift: { x: 8, y: -14 }, shape: 'dot', size: 3 },
};
const WEATHER_INTERVAL_MS = 60000;  // events more often
const WEATHER_JITTER_MS = 12000;
const WEATHER_DURATION_MS = 16000;  // each burst lasts longer
const WEATHER_STYLE = {
  // Rates pushed 3-4x so weather has visible presence on screen.
  grasslands: { name: 'petal storm', color: 0xffb7d5, rate: 38 },
  forest:     { name: 'low mist',    color: 0xbde8d1, rate: 22 },
  desert:     { name: 'sand swirl',  color: 0xffd28a, rate: 42 },
  ruins:      { name: 'dust devils', color: 0xd7c8aa, rate: 28 },
  riverside:  { name: 'rain burst',  color: 0x88ccff, rate: 60 },
};
let _nextWeatherAt = 0;
let _weatherEvent = null;

function scheduleNextWeather(time) {
  _nextWeatherAt = time + WEATHER_INTERVAL_MS + Phaser.Math.Between(-WEATHER_JITTER_MS, WEATHER_JITTER_MS);
}

function startWeatherBurst(scene, time, zone) {
  const style = WEATHER_STYLE[zone];
  if (!style) {
    scheduleNextWeather(time);
    return;
  }
  _weatherEvent = { zone, style, endsAt: time + WEATHER_DURATION_MS };
  scheduleNextWeather(time);
  if (ui) ui.message(`Weather: ${style.name} moves through ${ZONE_LABELS[zone] || zone}.`);
}

function tickWeatherBurst(scene, time, delta) {
  if (!_weatherEvent) {
    if (!_nextWeatherAt) scheduleNextWeather(time);
    if (time >= _nextWeatherAt && currentZone) startWeatherBurst(scene, time, currentZone);
    return;
  }
  if (time >= _weatherEvent.endsAt || _weatherEvent.zone !== currentZone) {
    _weatherEvent = null;
    return;
  }

  const { zone, style } = _weatherEvent;
  const cam = scene.cameras.main;
  const nightBoost = zone === 'forest' ? (1 + worldDarkness * 1.2) : 1;
  const burstRate = style.rate * nightBoost;
  const expected = burstRate * delta / 1000;
  let count = Math.floor(expected);
  if (Math.random() < expected - count) count += 1;
  for (let i = 0; i < count; i++) {
    const x = cam.scrollX + Math.random() * cam.width;
    const y = cam.scrollY + Math.random() * cam.height;
    let obj;
    if (zone === 'riverside') {
      obj = scene.add.rectangle(x, y, 2, 18, style.color, 0.7).setAngle(12);
      scene.tweens.add({ targets: obj, x: x + 28, y: y + 150, alpha: 0, duration: 520, onComplete: () => obj.destroy() });
    } else if (zone === 'desert') {
      obj = scene.add.circle(x, y, Phaser.Math.Between(2, 4), style.color, 0.55);
      scene.tweens.add({ targets: obj, x: x + Phaser.Math.Between(-80, 90), y: y + Phaser.Math.Between(-35, 30),
        alpha: 0, scale: 2.2, duration: 900, onComplete: () => obj.destroy() });
    } else if (zone === 'forest') {
      obj = scene.add.ellipse(x, y, Phaser.Math.Between(28, 60), Phaser.Math.Between(8, 18), style.color, 0.12 + worldDarkness * 0.16);
      scene.tweens.add({ targets: obj, x: x + Phaser.Math.Between(-18, 18), alpha: 0, scaleX: 1.8,
        duration: 1700, onComplete: () => obj.destroy() });
    } else if (zone === 'ruins') {
      obj = scene.add.rectangle(x, y, 4, 4, style.color, 0.45).setAngle(Math.random() * 360);
      scene.tweens.add({ targets: obj, x: x + Phaser.Math.Between(-45, 45), y: y - Phaser.Math.Between(40, 95),
        angle: obj.angle + 540, alpha: 0, duration: 1200, onComplete: () => obj.destroy() });
    } else {
      obj = scene.add.ellipse(x, y, 8, 4, style.color, 0.72).setAngle(Math.random() * 360);
      scene.tweens.add({ targets: obj, x: x + Phaser.Math.Between(-30, 30), y: y + Phaser.Math.Between(55, 110),
        angle: obj.angle + Phaser.Math.Between(120, 300), alpha: 0, duration: 1500, onComplete: () => obj.destroy() });
    }
    obj.setDepth(15450);
  }
}

function tickAmbience(scene, time, delta) {
  const zone = currentZone;
  if (!zone) return;
  tickWeatherBurst(scene, time, delta);
  // Base zone particle.
  const rate = AMBIENCE_RATE_PER_SEC[zone] || 0.5;
  // Night doubles the spawn rate + halves alpha for "darker air" feel.
  const nightBoost = 1 + worldDarkness * 1.5;
  if (Math.random() <= rate * nightBoost * (delta / 1000)) {
    const style = AMBIENCE_STYLE[zone];
    const cam = scene.cameras.main;
    const x = cam.scrollX + Math.random() * cam.width;
    const y = cam.scrollY + Math.random() * cam.height;
    const obj = (style.shape === 'leaf')
      ? scene.add.rectangle(x, y, style.size + 2, style.size, style.color, 0.7)
          .setAngle(Math.random() * 360)
      : scene.add.circle(x, y, style.size, style.color, 0.7);
    obj.setDepth(15500);
    scene.tweens.add({
      targets: obj,
      x: x + style.drift.x + (Math.random() * 20 - 10),
      y: y + style.drift.y + (Math.random() * 10),
      alpha: 0,
      angle: (style.shape === 'leaf') ? (Math.random() * 360 - 180) : 0,
      duration: 1800 + Math.random() * 800,
      onComplete: () => obj.destroy(),
    });
  }
  // Night fireflies — spawn on top of any biome when darkness > 0.4.
  if (worldDarkness > 0.4 && Math.random() < (worldDarkness - 0.3) * (delta / 1000) * 3) {
    const cam = scene.cameras.main;
    const x = cam.scrollX + Math.random() * cam.width;
    const y = cam.scrollY + Math.random() * cam.height;
    const fly = scene.add.circle(x, y, 2, 0xfff2a0, 0.95).setDepth(15600);
    scene.tweens.add({
      targets: fly,
      x: x + (Math.random() * 60 - 30),
      y: y + (Math.random() * 40 - 20),
      alpha: 0, scale: 1.6,
      duration: 1500 + Math.random() * 1500,
      onComplete: () => fly.destroy(),
    });
  }
}

class LootDrop {
  constructor(scene, x, y, amount, kind = 'zeny', opts = {}) {
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
    if (opts.sparkleColor) {
      this.sparkleHalo = scene.add.circle(x, y - 10, 9, opts.sparkleColor, 0.5)
        .setStrokeStyle(2, opts.sparkleColor, 0.85)
        .setDepth(y - 1);
      scene.tweens.add({
        targets: this.sparkleHalo,
        scale: 2.2,
        alpha: 0.18,
        duration: 700,
        yoyo: true,
        repeat: -1,
      });
    }
    // Drop bounce.
    scene.tweens.add({
      targets: this.sparkleHalo ? [this.coin, this.sparkleHalo] : this.coin,
      y,
      duration: 250,
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
    if (this.sparkleHalo) {
      this.sparkleHalo.x = this.x;
      this.sparkleHalo.y = this.y;
      this.sparkleHalo.setDepth(this.y - 1);
    }
  }

  tryPickup(px, py) {
    if (!this.alive) return false;
    // Brief grace so it doesn't snap into pickup mid-bounce.
    if (this.scene.time.now - this.bornAt < 250) return false;
    if (Math.hypot(this.x - px, this.y - py) <= LOOT_PICKUP_RADIUS) {
      this.alive = false;
      this.scene.tweens.killTweensOf(this.coin);
      if (this.sparkleHalo) this.scene.tweens.killTweensOf(this.sparkleHalo);
      this.scene.tweens.add({
        targets: this.coin, alpha: 0, y: this.y - 20, duration: 200,
        onComplete: () => this.coin.destroy(),
      });
      if (this.sparkleHalo) {
        this.scene.tweens.add({
          targets: this.sparkleHalo, alpha: 0, scale: 2.8, duration: 220,
          onComplete: () => this.sparkleHalo.destroy(),
        });
      }
      return true;
    }
    return false;
  }
}

function showZoneBanner(scene, label, zoneKey) {
  if (!scene || !label) return;
  const diff = ZONE_DIFFICULTY[zoneKey];
  const text = diff ? `Entering ${label} - ${diff.tag}` : `Entering ${label}`;
  if (typeof ui !== 'undefined' && ui) {
    ui.announce(text, { tone: zoneKey === 'desert' || zoneKey === 'ruins' ? 'danger' : 'zone', duration: 1400 });
  }
}

function showBossZoneHint(scene, zoneKey) {
  if (!scene || !zoneKey) return;
  const typeId = Object.keys(MONSTER_TYPES).find(id => {
    const cfg = MONSTER_TYPES[id];
    return isBossCfg(cfg) && cfg.zones && cfg.zones.includes(zoneKey);
  });
  if (!typeId) return;
  const cfg = MONSTER_TYPES[typeId];
  const alive = bloblings.some(m => m.alive && m.typeId === typeId);
  const respawnAt = bossRespawns[typeId];
  let label = null;
  if (alive) {
    label = `${cfg.name} is roaming`;
  } else if (respawnAt) {
    const secs = Math.max(0, Math.ceil((respawnAt - scene.time.now) / 1000));
    label = `${cfg.name} returns in ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  }
  if (!label) return;
  if (typeof ui !== 'undefined' && ui) {
    ui.announce(label, { tone: 'danger', duration: 1400 });
  }
}

// ---------- Class selection overlay ----------
// First class pick is free. Each later swap costs escalating zeny so the
// choice carries weight without locking the player out for long.
function classSwitchCost() {
  if (!player || !player.classId) return 0;
  const n = player.classSwitches || 0;
  return Math.min(80000, 5000 * Math.pow(2, n));
}

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
  // Larger cards + wider gap = easier targets and breathing room.
  const cardW = 250, cardH = 360;
  const gap = 44;
  const hitPad = 18; // extra invisible margin so near-misses still register
  const totalW = ids.length * cardW + (ids.length - 1) * gap;
  const startX = (GAME_W - totalW) / 2;
  const baseY = 150;
  // Swordsman is the new-player recommended pick — gets a gold ribbon.
  const RECOMMENDED_ID = 'swordsman';

  ids.forEach((id, i) => {
    const cdef = CLASS_DEFS[id];
    const cx = startX + i * (cardW + gap);
    const cy = baseY;

    const accent = colorValue(cdef.tint, 0xffffff);
    const cardGroup = scene.add.container(cx + cardW / 2, cy + cardH / 2);
    const paintCard = (hovered = false) => {
      frame.clear();
      frame.fillStyle(0x000000, hovered ? 0.36 : 0.28);
      frame.fillRoundedRect(-cardW / 2 + 6, -cardH / 2 + 8, cardW, cardH, 14);
      frame.fillStyle(accent, hovered ? 0.96 : 0.9);
      frame.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 12);
      frame.lineStyle(hovered ? 5 : 3, hovered ? 0xffe066 : 0xffffff, 1);
      frame.strokeRoundedRect(-cardW / 2 + 1.5, -cardH / 2 + 1.5, cardW - 3, cardH - 3, 12);
      frame.fillStyle(0x120f0a, 0.2);
      frame.fillRoundedRect(-cardW / 2 + 13, -cardH / 2 + 13, cardW - 26, cardH - 26, 8);
      frame.fillStyle(0xf8f0d8, 0.96);
      frame.fillRoundedRect(-cardW / 2 + 24, -cardH / 2 + 30, cardW - 48, 188, 5);
      frame.lineStyle(2, 0xffffff, 0.7);
      frame.strokeRoundedRect(-cardW / 2 + 24, -cardH / 2 + 30, cardW - 48, 188, 5);
      frame.fillStyle(0x000000, 0.18);
      frame.fillRoundedRect(-cardW / 2 + 14, cardH / 2 - 96, cardW - 28, 82, 8);
      frame.fillStyle(0x000000, 0.2);
      frame.fillRoundedRect(-78, cardH / 2 - 42, 156, 28, 12);
      frame.lineStyle(2, hovered ? 0xfff1a6 : 0xffffff, hovered ? 1 : 0.75);
      frame.strokeRoundedRect(-78, cardH / 2 - 42, 156, 28, 12);
    };
    const frame = scene.add.graphics();
    paintCard(false);

    // The whole card, including its art and text, is one large button.
    // Hit area extends `hitPad` past the card edge so near-misses register.
    cardGroup.setInteractive(
      new Phaser.Geom.Rectangle(-cardW / 2 - hitPad, -cardH / 2 - hitPad,
                                cardW + hitPad * 2, cardH + hitPad * 2),
      Phaser.Geom.Rectangle.Contains
    );
    cardGroup.input.cursor = 'pointer';
    cardGroup.setScrollFactor(0);

    // Optional real card image if it was preloaded.
    let img = null;
    if (scene.textures.exists(cdef.cardImage)) {
      img = scene.add.image(0, -52, cdef.cardImage);
      const scale = Math.min((cardW - 68) / img.width, 174 / img.height);
      img.setScale(scale);
    }

    const nameText = scene.add.text(0, 96, cdef.tierNames[0], {
      fontSize: '28px', fontStyle: 'bold', color: '#ffffff',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5);
    const flavor = scene.add.text(0, 128, `"${cdef.flavor}"`, {
      fontSize: '14px', color: '#f4f4f4', fontStyle: 'italic',
      stroke: '#000', strokeThickness: 3, align: 'center', wordWrap: { width: cardW - 36 },
    }).setOrigin(0.5);
    const role = scene.add.text(0, 156, cdef.role || '', {
      fontSize: '12px', color: '#ffe066',
      stroke: '#000', strokeThickness: 3, align: 'center', wordWrap: { width: cardW - 34 },
    }).setOrigin(0.5);
    const chooseText = scene.add.text(0, cardH / 2 - 28, player.classId ? 'SWAP CLASS' : 'CHOOSE', {
      fontSize: '15px', fontStyle: 'bold', color: '#fff4ba',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);

    cardGroup.add(frame);
    if (img) cardGroup.add(img);
    cardGroup.add([nameText, flavor, role, chooseText]);

    // Recommended ribbon — gold pill on top-right of swordsman card to
    // guide new players toward the easiest starting class.
    if (id === RECOMMENDED_ID) {
      const ribX = cardW / 2 - 14, ribY = -cardH / 2 + 14;
      const ribbon = scene.add.graphics();
      ribbon.fillStyle(0x000000, 0.35);
      ribbon.fillRoundedRect(ribX - 110, ribY - 12 + 2, 108, 24, 10);
      ribbon.fillStyle(0xffd24a, 1);
      ribbon.fillRoundedRect(ribX - 110, ribY - 12, 108, 24, 10);
      ribbon.lineStyle(2, 0xffffff, 0.85);
      ribbon.strokeRoundedRect(ribX - 110, ribY - 12, 108, 24, 10);
      const ribbonText = scene.add.text(ribX - 56, ribY, '★ RECOMMENDED', {
        fontSize: '11px', fontStyle: 'bold', color: '#3a2400',
      }).setOrigin(0.5);
      cardGroup.add([ribbon, ribbonText]);
    }
    cont.add(cardGroup);

    // Hover lift + glow. CTA text brightens to make the click target read.
    const lift = () => {
      scene.tweens.killTweensOf(cardGroup);
      scene.tweens.add({ targets: cardGroup, y: cy + cardH / 2 - 10, scale: 1.03, duration: 120 });
      chooseText.setColor('#ffffff');
      chooseText.setStroke('#5a3a00', 4);
      paintCard(true);
    };
    const drop = () => {
      scene.tweens.killTweensOf(cardGroup);
      scene.tweens.add({ targets: cardGroup, y: cy + cardH / 2, scale: 1, duration: 120 });
      chooseText.setColor('#fff4ba');
      chooseText.setStroke('#000', 3);
      paintCard(false);
    };
    cardGroup.on('pointerover', lift);
    cardGroup.on('pointerout', drop);
    cardGroup.on('pointerdown', () => {
      // Quick press-down tactile feedback before swap fires.
      scene.tweens.killTweensOf(cardGroup);
      scene.tweens.add({
        targets: cardGroup, scale: 0.96, duration: 70, yoyo: true,
        onComplete: () => selectClass(scene, id, cont),
      });
    });
  });
}

function selectClass(scene, id, container) {
  const cdef = CLASS_DEFS[id];
  if (!cdef) return;
  const isSwap = !!player.classId;
  // Block & refund-click if the swap can't be paid for. Gate again here in
  // case the player accumulated/spent zeny between opening the panel and
  // picking a card.
  if (isSwap) {
    const cost = classSwitchCost();
    if (player.classId === id) {
      ui.message('Already on that class — no swap needed.');
      return;
    }
    if (player.zeny < cost) {
      ui.message(`Need ${fmt(cost)}z to swap class. (Have ${fmt(player.zeny)}z)`);
      return;
    }
    player.zeny -= cost;
    player.classSwitches = (player.classSwitches || 0) + 1;
  }
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
  // Apply tint as a fallback color for directions without class art, then
  // immediately re-resolve the texture so south swaps to the real class
  // sprite right now (applyRookieTexture clears the tint when it lands on
  // a real class key).
  player.sprite.setTint(cdef.tint);
  player._setPlayerTexture(player.dir || 'south', player.frame || 'idle');
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

function shopItemPrice(item, bought) {
  if (item.flat) return item.base;
  return Math.round(item.base * Math.pow(1.5, bought));
}

// Map landmark plaza coords to friendly biome names based on offset from
// center. The 5 plazas are: spawn (0,0), N forest, S desert, W ruins, E riverside.
function landmarkLabel(lm) {
  if (lm && lm.name) return lm.name;
  const { midRow, midCol } = mapCenter();
  if (lm.r === midRow && lm.c === midCol) return 'Spawn Plaza';
  if (lm.r < midRow) return 'Forest Heart';
  if (lm.r > midRow) return 'Desert Heart';
  if (lm.c < midCol) return 'Ruins Plaza';
  if (lm.c > midCol) return 'Riverside Plaza';
  return 'Plaza';
}

function showTravel(scene) {
  if (travelOpen) return;
  travelOpen = true;
  const cont = scene.add.container(0, 0).setScrollFactor(0).setDepth(20000);

  const bg = scene.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.78)
    .setOrigin(0, 0).setScrollFactor(0).setInteractive();
  bg.on('pointerdown', (p, lx, ly, ev) => { ev && ev.stopPropagation && ev.stopPropagation(); });
  cont.add(bg);

  const title = scene.add.text(GAME_W / 2, 60, '🧭 FAST TRAVEL', {
    fontSize: '34px', fontStyle: 'bold', color: '#aaddff',
    stroke: '#001a33', strokeThickness: 5,
  }).setOrigin(0.5).setScrollFactor(0);
  cont.add(title);

  const subtitle = scene.add.text(GAME_W / 2, 100, 'Visit a landmark plaza once to unlock fast travel to it.', {
    fontSize: '14px', color: '#cccccc', stroke: '#000', strokeThickness: 2,
  }).setOrigin(0.5).setScrollFactor(0);
  cont.add(subtitle);

  // Close X.
  const closeBtn = scene.add.text(GAME_W - 40, 30, '✕', {
    fontSize: '32px', fontStyle: 'bold', color: '#ffffff',
    stroke: '#000', strokeThickness: 4,
  }).setOrigin(0.5).setScrollFactor(0);
  closeBtn.setInteractive(
    new Phaser.Geom.Rectangle(-22, -22, 44, 44),
    Phaser.Geom.Rectangle.Contains
  );
  closeBtn.input.cursor = 'pointer';
  closeBtn.on('pointerover', () => closeBtn.setColor('#ffe066'));
  closeBtn.on('pointerout',  () => closeBtn.setColor('#ffffff'));
  closeBtn.on('pointerdown', () => { cont.destroy(); travelOpen = false; });
  cont.add(closeBtn);

  // Spawn plaza is auto-unlocked because the player starts there.
  const { midRow, midCol } = mapCenter();
  const spawnKey = `${midRow},${midCol}`;
  if (player) {
    player.visitedLandmarks = player.visitedLandmarks || {};
    player.visitedLandmarks[spawnKey] = true;
  }

  // Two-column layout since the list grew to 13 plazas (5 primary + 8
  // secondary). Wider modal works better than a too-tall single column.
  const rowW = 380, rowH = 44;
  const startY = 140;
  const colGap = 24;
  const tiles = landmarkTiles();
  const rowsPerCol = Math.ceil(tiles.length / 2);
  const totalW = rowW * 2 + colGap;
  tiles.forEach((lm, i) => {
    const col = Math.floor(i / rowsPerCol);
    const rowIdx = i % rowsPerCol;
    const ry = startY + rowIdx * (rowH + 8);
    const rx = (GAME_W - totalW) / 2 + col * (rowW + colGap);
    const key = `${lm.r},${lm.c}`;
    const visited = !!(player && player.visitedLandmarks && player.visitedLandmarks[key]);
    const fill = visited ? 0x1c3a5e : 0x222222;
    const card = scene.add.rectangle(rx + rowW/2, ry + rowH/2, rowW, rowH, fill, 0.94)
      .setStrokeStyle(2, visited ? 0x88ddff : 0x555555, 0.9).setScrollFactor(0);
    if (visited) {
      card.setInteractive(
        new Phaser.Geom.Rectangle(-rowW/2, -rowH/2, rowW, rowH),
        Phaser.Geom.Rectangle.Contains
      );
      card.input.cursor = 'pointer';
    }
    const name = scene.add.text(rx + 20, ry + rowH/2,
      visited ? `${landmarkLabel(lm)}` : `??? (undiscovered)`, {
      fontSize: '18px', fontStyle: 'bold',
      color: visited ? '#ffffff' : '#666666',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0, 0.5).setScrollFactor(0);
    const hint = scene.add.text(rx + rowW - 20, ry + rowH/2,
      visited ? 'Travel →' : 'Locked', {
      fontSize: '14px',
      color: visited ? '#aaddff' : '#999999',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(1, 0.5).setScrollFactor(0);
    cont.add([card, name, hint]);
    if (visited) {
      card.on('pointerover', () => card.setStrokeStyle(3, 0xffffff, 1));
      card.on('pointerout',  () => card.setStrokeStyle(2, 0x88ddff, 0.9));
      card.on('pointerdown', () => {
        // Convert tile coords to cell + warp.
        const tileToCell = Math.floor(TILE_SIZE / CELL_SIZE);
        const cx = lm.c * tileToCell + Math.floor(tileToCell / 2);
        const cy = lm.r * tileToCell + Math.floor(tileToCell / 2);
        player.attackTarget = null;
        player.path = [];
        player.cellCol = cx;
        player.cellRow = cy;
        const wx = cellCenterX(cx), wy = cellCenterY(cy);
        player.sprite.setPosition(wx, wy);
        player.groundY = wy;
        player.stepFromX = player.stepToX = wx;
        player.stepFromY = player.stepToY = wy;
        ui.message(`🧭 Warped to ${landmarkLabel(lm)}.`);
        sfxPickup();
        cont.destroy();
        travelOpen = false;
      });
    }
  });
}

function showTrophyInspector(scene) {
  if (trophyOpen) return;
  trophyOpen = true;
  const cont = scene.add.container(0, 0).setScrollFactor(0).setDepth(20000);
  const close = () => { cont.destroy(); trophyOpen = false; };

  const bg = scene.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.78)
    .setOrigin(0, 0).setScrollFactor(0).setInteractive();
  bg.on('pointerdown', (p, lx, ly, ev) => { ev && ev.stopPropagation && ev.stopPropagation(); });
  cont.add(bg);

  const title = scene.add.text(GAME_W / 2, 58, '🏆 BOSS TROPHIES', {
    fontSize: '34px', fontStyle: 'bold', color: '#ffe066',
    stroke: '#5a3a00', strokeThickness: 5,
  }).setOrigin(0.5).setScrollFactor(0);
  cont.add(title);

  const total = Object.values(player.bossTrophies || {}).reduce((sum, n) => sum + n, 0);
  const next = TROPHY_MILESTONES.find(m => total < m.total);
  const nextText = next
    ? `Total ${total} / ${next.total} — next: ${next.label}`
    : `Total ${total} — all milestone bonuses claimed`;
  const subtitle = scene.add.text(GAME_W / 2, 98, nextText, {
    fontSize: '16px', fontStyle: 'bold', color: next ? '#ffffff' : '#bce86a',
    stroke: '#000', strokeThickness: 3,
  }).setOrigin(0.5).setScrollFactor(0);
  cont.add(subtitle);

  const closeBtn = scene.add.text(GAME_W - 40, 30, '✕', {
    fontSize: '32px', fontStyle: 'bold', color: '#ffffff',
    stroke: '#000', strokeThickness: 4,
  }).setOrigin(0.5).setScrollFactor(0);
  closeBtn.setInteractive(
    new Phaser.Geom.Rectangle(-22, -22, 44, 44),
    Phaser.Geom.Rectangle.Contains
  );
  closeBtn.input.cursor = 'pointer';
  closeBtn.on('pointerover', () => closeBtn.setColor('#ffe066'));
  closeBtn.on('pointerout',  () => closeBtn.setColor('#ffffff'));
  closeBtn.on('pointerdown', close);
  cont.add(closeBtn);

  const rowW = 620, rowH = 58;
  const startY = 136;
  const rows = bossTrophyRows();
  rows.forEach((row, i) => {
    const rx = (GAME_W - rowW) / 2;
    const ry = startY + i * (rowH + 10);
    const color = colorValue(row.cfg.nameColor, 0xffe066);
    const fill = row.count > 0 ? 0x332711 : 0x1d1d1d;
    const card = scene.add.rectangle(rx + rowW / 2, ry + rowH / 2, rowW, rowH, fill, 0.94)
      .setStrokeStyle(2, row.count > 0 ? color : 0x555555, 0.9)
      .setScrollFactor(0);
    card.setInteractive(
      new Phaser.Geom.Rectangle(-rowW / 2, -rowH / 2, rowW, rowH),
      Phaser.Geom.Rectangle.Contains
    );
    card.input.cursor = 'pointer';

    const zone = row.cfg.zones && row.cfg.zones[0] ? (ZONE_LABELS[row.cfg.zones[0]] || row.cfg.zones[0]) : 'Unknown';
    const drop = EQUIPMENT_DROPS[row.id];
    const reward = drop ? `${drop.name} ${drop.atk ? `+${drop.atk} ATK` : `+${drop.def || 0} DEF`}` : 'Trophy only';
    const icon = row.count > 0 ? '🏆' : '□';
    const name = scene.add.text(rx + 18, ry + 13, `${icon} ${row.cfg.name}`, {
      fontSize: '18px', fontStyle: 'bold', color: row.count > 0 ? '#ffffff' : '#b8b8b8',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0, 0).setScrollFactor(0);
    const meta = scene.add.text(rx + 18, ry + 35, `${zone}  •  ${reward}`, {
      fontSize: '12px', color: '#cccccc', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0, 0).setScrollFactor(0);
    const count = scene.add.text(rx + rowW - 24, ry + rowH / 2, `×${row.count}`, {
      fontSize: '26px', fontStyle: 'bold', color: row.count > 0 ? '#ffe066' : '#777777',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(1, 0.5).setScrollFactor(0);
    cont.add([card, name, meta, count]);
    card.on('pointerover', () => card.setStrokeStyle(3, row.count > 0 ? 0xffffff : 0x999999, 1));
    card.on('pointerout',  () => card.setStrokeStyle(2, row.count > 0 ? color : 0x555555, 0.9));
    card.on('pointerdown', () => {
      ui.message(`${row.cfg.name}: ${row.count} trophies. ${next ? `${Math.max(0, next.total - total)} more total to ${next.label}.` : 'Milestone track complete.'}`);
    });
  });

  const footerY = startY + rows.length * (rowH + 10) + 8;
  const claimed = TROPHY_MILESTONES
    .map(m => `${total >= m.total ? '✓' : '○'} ${m.total}: ${m.label}`)
    .join('   ');
  const footer = scene.add.text(GAME_W / 2, footerY, claimed, {
    fontSize: '13px', color: '#d8f7ff', stroke: '#000', strokeThickness: 2,
  }).setOrigin(0.5).setScrollFactor(0);
  cont.add(footer);
}

function showShop(scene) {
  if (shopOpen) return;
  shopOpen = true;
  const cont = scene.add.container(0, 0).setScrollFactor(0).setDepth(20000);

  const bg = scene.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.78)
    .setOrigin(0, 0).setScrollFactor(0).setInteractive();
  bg.on('pointerdown', (p, lx, ly, ev) => { ev && ev.stopPropagation && ev.stopPropagation(); });
  cont.add(bg);

  const title = scene.add.text(GAME_W / 2, 60, '⚒ TRADER', {
    fontSize: '36px', fontStyle: 'bold', color: '#ffe066',
    stroke: '#5a3a00', strokeThickness: 5,
  }).setOrigin(0.5).setScrollFactor(0);
  cont.add(title);

  // Live zeny display.
  const zenyTxt = scene.add.text(GAME_W / 2, 110, `Zeny: ${fmt(player.zeny)}`, {
    fontSize: '20px', color: '#ffd24a', stroke: '#000', strokeThickness: 4,
  }).setOrigin(0.5).setScrollFactor(0);
  cont.add(zenyTxt);

  // Close X.
  const closeBtn = scene.add.text(GAME_W - 40, 30, '✕', {
    fontSize: '32px', fontStyle: 'bold', color: '#ffffff',
    stroke: '#000', strokeThickness: 4,
  }).setOrigin(0.5).setScrollFactor(0);
  closeBtn.setInteractive(
    new Phaser.Geom.Rectangle(-22, -22, 44, 44),
    Phaser.Geom.Rectangle.Contains
  );
  closeBtn.input.cursor = 'pointer';
  closeBtn.on('pointerover', () => closeBtn.setColor('#ffe066'));
  closeBtn.on('pointerout',  () => closeBtn.setColor('#ffffff'));
  closeBtn.on('pointerdown', () => { cont.destroy(); shopOpen = false; });
  cont.add(closeBtn);

  const rowH = 60;
  const rowW = 460;
  const startY = 160;
  const rows = [];
  SHOP_ITEMS.forEach((item, i) => {
    const ry = startY + i * (rowH + 12);
    const rx = (GAME_W - rowW) / 2;
    const card = scene.add.rectangle(rx + rowW/2, ry + rowH/2, rowW, rowH, 0x442200, 0.92)
      .setStrokeStyle(2, 0xffe066, 0.9).setScrollFactor(0);
    card.setInteractive(
      new Phaser.Geom.Rectangle(-rowW/2, -rowH/2, rowW, rowH),
      Phaser.Geom.Rectangle.Contains
    );
    card.input.cursor = 'pointer';

    const bought = player.shopBought[item.id] || 0;
    const price = shopItemPrice(item, bought);
    const labelText = scene.add.text(rx + 20, ry + rowH/2, item.label, {
      fontSize: '18px', fontStyle: 'bold', color: '#ffffff',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0, 0.5).setScrollFactor(0);
    const priceText = scene.add.text(rx + rowW - 20, ry + rowH/2,
      `${fmt(price)} zeny${item.flat ? '' : `   (bought ${bought})`}`, {
      fontSize: '16px', color: '#ffd24a',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(1, 0.5).setScrollFactor(0);

    cont.add([card, labelText, priceText]);
    rows.push({ card, labelText, priceText, item });

    card.on('pointerover', () => card.setStrokeStyle(3, 0xffffff, 1));
    card.on('pointerout',  () => card.setStrokeStyle(2, 0xffe066, 0.9));
    card.on('pointerdown', () => {
      const cur = player.shopBought[item.id] || 0;
      const cost = shopItemPrice(item, cur);
      if (player.zeny < cost) {
        ui.message(`Not enough zeny (need ${fmt(cost)}, have ${fmt(player.zeny)}).`);
        sfxMiss();
        return;
      }
      player.zeny -= cost;
      item.apply(player);
      player.shopBought[item.id] = cur + 1;
      sfxLevelUp();
      ui.message(`Bought ${item.label} for ${fmt(cost)} zeny.`);
      // Refresh prices + zeny on the open panel.
      zenyTxt.setText(`Zeny: ${fmt(player.zeny)}`);
      const nb = player.shopBought[item.id];
      const np = shopItemPrice(item, nb);
      priceText.setText(`${fmt(np)} zeny${item.flat ? '' : `   (bought ${nb})`}`);
      saveGame();
    });
  });

  // Auto-buy footer: pick the cheapest affordable non-potion upgrade and buy
  // it. Repeat-click to chain. Saves clicking through rows during fast farms.
  const ay = startY + SHOP_ITEMS.length * (rowH + 12) + 8;
  const aw = 220, ah = 34;
  const ax = (GAME_W - aw) / 2;
  const autoCard = scene.add.rectangle(ax + aw/2, ay + ah/2, aw, ah, 0x224422, 0.95)
    .setStrokeStyle(2, 0x99ff99, 0.9).setScrollFactor(0);
  autoCard.setInteractive(
    new Phaser.Geom.Rectangle(-aw/2, -ah/2, aw, ah),
    Phaser.Geom.Rectangle.Contains
  );
  autoCard.input.cursor = 'pointer';
  const autoText = scene.add.text(ax + aw/2, ay + ah/2, '⚡ Auto-buy cheapest', {
    fontSize: '14px', fontStyle: 'bold', color: '#ddffdd',
    stroke: '#000', strokeThickness: 2,
  }).setOrigin(0.5).setScrollFactor(0);
  cont.add([autoCard, autoText]);
  autoCard.on('pointerdown', () => {
    // Skip the potion row (item.flat true) — auto-buy is for permanent stats.
    let best = null, bestCost = Infinity;
    for (let i = 0; i < SHOP_ITEMS.length; i++) {
      const it = SHOP_ITEMS[i];
      if (it.flat) continue;
      const cost = shopItemPrice(it, player.shopBought[it.id] || 0);
      if (cost <= player.zeny && cost < bestCost) { best = { it, cost, i }; bestCost = cost; }
    }
    if (!best) {
      ui.message(`Not enough zeny for any upgrade (have ${fmt(player.zeny)}z).`);
      sfxMiss();
      return;
    }
    player.zeny -= best.cost;
    best.it.apply(player);
    player.shopBought[best.it.id] = (player.shopBought[best.it.id] || 0) + 1;
    sfxLevelUp();
    ui.message(`Auto-bought ${best.it.label} for ${fmt(best.cost)} zeny.`);
    // Refresh the matching row in-place.
    const row = rows[best.i];
    if (row) {
      const nb = player.shopBought[best.it.id];
      const np = shopItemPrice(best.it, nb);
      row.priceText.setText(`${fmt(np)} zeny${best.it.flat ? '' : `   (bought ${nb})`}`);
    }
    zenyTxt.setText(`Zeny: ${fmt(player.zeny)}`);
    saveGame();
  });
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

function spawnMonster(scene, typeId, opts = {}) {
  if (!opts.noRare && RARE_VARIANTS[typeId] && Math.random() < RARE_SPAWN_CHANCE) {
    typeId = RARE_VARIANTS[typeId];
  }
  const cfg = MONSTER_TYPES[typeId];
  if (cfg.count === 1 && bloblings.some(m => m.typeId === typeId && m.alive)) return;
  const allowedZones = cfg && cfg.zones;
  let x = opts.x;
  let y = opts.y;
  let tries = 0;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
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
  }
  bloblings.push(new MonsterController(scene, x, y, typeId));
  delete bossRespawns[typeId];
  if (!opts.skipPuff) spawnPuff(scene, x, y);
  // Boss respawn callout: when a boss-tier monster appears, broadcast a
  // top-screen toast + chime so the player knows the world just refilled.
  if (isBossCfg(cfg) && !cfg.rare && typeof ui !== 'undefined' && ui) {
    ui.message(`☠ ${cfg.name} has returned to the ${cfg.zones ? (ZONE_LABELS[cfg.zones[0]] || cfg.zones[0]) : 'wilds'}!`);
    const toast = scene.add.text(GAME_W / 2, 240, `☠ ${cfg.name} has returned`, {
      fontSize: '24px', fontStyle: 'bold', color: '#ffcc99',
      stroke: '#3a0000', strokeThickness: 5,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(15000).setAlpha(0);
    scene.tweens.add({ targets: toast, alpha: 1, duration: 250, yoyo: true,
      hold: 1300, onComplete: () => toast.destroy() });
    if (typeof sfxLevelUp === 'function') sfxLevelUp();
  }
}

function spawnShowcaseMobPod(scene) {
  if (!player) return;
  const baseX = WORLD_W / 2 + 540;
  const baseY = WORLD_H / 2 + 180;
  const pod = [
    { type: 'blobling', dx: -72, dy: -18 },
    { type: 'blobling', dx:  12, dy: -58 },
    { type: 'blobling', dx:  86, dy:  10 },
    { type: 'mooham',   dx: -18, dy:  58 },
  ];
  for (const p of pod) {
    const x = baseX + p.dx + Phaser.Math.Between(-10, 10);
    const y = baseY + p.dy + Phaser.Math.Between(-8, 8);
    const tile_c = Math.floor(x / TILE_SIZE);
    const tile_r = Math.floor(y / TILE_SIZE);
    if (getZone(tile_r, tile_c) !== 'grasslands' || getCellType(tile_r, tile_c) !== 'grass') continue;
    spawnMonster(scene, p.type, { x, y, noRare: true, skipPuff: true });
  }
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

function spawnFootstepDust(scene, x, y, cellCol, cellRow) {
  const zone = getZone(Math.floor((cellRow * CELL_SIZE) / TILE_SIZE), Math.floor((cellCol * CELL_SIZE) / TILE_SIZE));
  const color = (zone === 'desert' || zone === 'ruins') ? 0x886644 : 0xa8d088;
  const dust = scene.add.circle(x, y + 12, Phaser.Math.Between(3, 5), color, 0.38);
  dust.setDepth(y - 2);
  scene.tweens.add({
    targets: dust,
    x: x + Phaser.Math.Between(-6, 6),
    y: y + 16,
    scale: 1.8,
    alpha: 0,
    duration: 320,
    ease: 'Quad.out',
    onComplete: () => dust.destroy(),
  });
}

function spawnDeathBurst(scene, x, y, color) {
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI * 2 * i) / 10 + Phaser.Math.FloatBetween(-0.18, 0.18);
    const dist = Phaser.Math.Between(18, 42);
    const dot = scene.add.circle(x, y, Phaser.Math.Between(3, 6), color, 0.75);
    dot.setDepth(y + 20);
    scene.tweens.add({
      targets: dot,
      x: x + Math.cos(angle) * dist,
      y: y + Math.sin(angle) * dist,
      scale: 0.2,
      alpha: 0,
      duration: 420,
      ease: 'Quad.out',
      onComplete: () => dot.destroy(),
    });
  }
}

function spawnBossTelegraph(scene, x, y, color) {
  const c = colorValue(color, 0xff3333);
  const ring = scene.add.circle(x, y + 8, 44)
    .setStrokeStyle(4, c, 0.95)
    .setFillStyle(0xff0000, 0.12)
    .setDepth(y + 50);
  scene.tweens.add({
    targets: ring,
    scale: 1.25,
    alpha: 0.15,
    duration: 430,
    ease: 'Quad.in',
    onComplete: () => ring.destroy(),
  });
}

function attemptPlayerAttack(scene, target) {
  if (player.dead) return;
  const now = scene.time.now;
  if (now - lastPlayerAttack < PLAYER_ATTACK_COOLDOWN) return;
  const d = Math.hypot(target.sprite.x - player.sprite.x, target.sprite.y - player.sprite.y);
  if (d > playerAttackRange()) return;
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
    if (player._specialGlow) player._specialGlow.setVisible(false);
  }
  spawnClassAttackFx(scene, player, target, special);
  target.takeDamage(dmg, { crit, variance });
  if (crit) sfxCrit(); else sfxHit();
  // Sonny's custom hit SFX — pick one of three uniformly at random per
  // landed hit so the sound has variety. Only one fires per hit.
  try {
    const hitKey = Phaser.Utils.Array.GetRandom(['hitthemonster', 'hitthemonster2', 'hitthemonster3']);
    scene.sound.play(hitKey, { volume: 0.7 });
  } catch (e) { /* ignore */ }
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
  let amount = Math.max(1, Math.round(monsterAtk * variance));
  if (hardMode) amount = Math.max(1, Math.round(amount * 2));
  return { miss: false, amount };
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
    this.toastQueue = [];
    this.toastActive = false;
    const PANEL_FILL = 0x21160e;
    const PANEL_STROKE = 0x8f6130;
    const PANEL_GOLD = 0xc69a52;
    const crisp = (text) => {
      if (text && text.setResolution) text.setResolution(UI_TEXT_RESOLUTION);
      return text;
    };

    // Bottom status band — slim full-width player HUD bar.
    this.bottomH = 76;
    this.bar = scene.add.rectangle(0, GAME_H - this.bottomH, GAME_W, this.bottomH, 0x17100a, 0.90)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(10000)
      .setStrokeStyle(2, PANEL_STROKE, 0.95);
    this.barTopTrim = scene.add.rectangle(0, GAME_H - this.bottomH + 3, GAME_W, 1, PANEL_GOLD, 0.34)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(10001);
    this.hpBarW = Math.max(220, Math.min(320, GAME_W * 0.22));
    const bottomY = GAME_H - this.bottomH;
    const hpX = 20;
    const hpY = bottomY + this.bottomH / 2;
    const statusW = 290;
    const statusX = GAME_W - statusW - 20;
    const expX = hpX + this.hpBarW + 28;
    this.expBarW = Math.max(220, statusX - expX - 28);
    const expY = hpY;
    const panelH = 40;
    const barH = 24;

    this.hpPanel = scene.add.rectangle(hpX - 8, hpY - panelH / 2, this.hpBarW + 16, panelH, PANEL_FILL, 0.72)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(10001)
      .setStrokeStyle(1, PANEL_GOLD, 0.56);
    this.hpBg = scene.add.rectangle(hpX, hpY, this.hpBarW, barH, 0x2c302a)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(10002);
    this.hpFill = scene.add.rectangle(hpX, hpY, this.hpBarW, barH, 0xcc3333)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(10003);
    this.hpText = scene.add.text(hpX + this.hpBarW / 2, hpY, '', {
      fontSize: '20px', fontStyle: 'bold', color: '#fff7ef', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10004);

    this.expPanel = scene.add.rectangle(expX - 8, expY - panelH / 2, this.expBarW + 16, panelH, PANEL_FILL, 0.72)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(10001)
      .setStrokeStyle(1, PANEL_GOLD, 0.56);
    this.expBg = scene.add.rectangle(expX, expY, this.expBarW, barH, 0x2c302a)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(10002);
    this.expFill = scene.add.rectangle(expX, expY, this.expBarW, barH, 0x8e50d6)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(10003);
    this.expText = scene.add.text(expX + this.expBarW / 2, expY, '', {
      fontSize: '20px', fontStyle: 'bold', color: '#fff7ef', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10004);

    // Bottom-right status panel: Lv on the left edge, Zeny on the right
    // edge, with a thin vertical divider so the two values can never run
    // into each other regardless of width.
    this.statusPanel = scene.add.rectangle(statusX, bottomY + (this.bottomH - 48) / 2, statusW, 48, PANEL_FILL, 0.78)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(10001)
      .setStrokeStyle(1, PANEL_GOLD, 0.75);
    this.statusDivider = scene.add.rectangle(statusX + Math.floor(statusW * 0.42), bottomY + (this.bottomH - 30) / 2, 1, 30, 0xffe066, 0.45)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(10002);
    this.lvlText = scene.add.text(statusX + 18, hpY, 'Lv.1', {
      fontSize: '24px', fontStyle: 'bold', color: '#ffff88', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(10004);
    this.zenyText = scene.add.text(statusX + statusW - 14, hpY, '0z', {
      fontSize: '19px', fontStyle: 'bold', color: '#ffd24a', stroke: '#000', strokeThickness: 4,
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(10004);

    // Auto-save indicator — dim idle glyph that pulses whenever saveGame()
    // writes successfully.
    this.saveGlyph = scene.add.text(354, 20, '💾', {
      fontSize: '18px', color: '#d8f7ff', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10008).setAlpha(0.32);

    // One-at-a-time notification toast. This replaces stacked zone/rare/boss
    // banners so the playfield stays readable.
    this.toastBg = scene.add.rectangle(GAME_W / 2, 74, 420, 34, PANEL_FILL, 0.92)
      .setOrigin(0.5).setScrollFactor(0).setDepth(12500)
      .setStrokeStyle(2, PANEL_GOLD, 0.95)
      .setVisible(false);
    this.toastText = scene.add.text(GAME_W / 2, 74, '', {
      fontSize: '15px', fontStyle: 'bold', color: '#fff4d6',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(12501).setVisible(false);

    // Mini-map top-right — anchored to viewport right edge.
    this.miniW = Math.max(132, Math.min(160, Math.floor(GAME_W * 0.12)));
    this.miniH = this.miniW;
    this.miniX = GAME_W - this.miniW - 12;
    this.miniY = 12;
    this.miniBg = scene.add.rectangle(this.miniX, this.miniY, this.miniW, this.miniH, PANEL_FILL, 0.72)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(10010);
    this.miniBorder = scene.add.rectangle(this.miniX, this.miniY, this.miniW, this.miniH)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(10012)
      .setStrokeStyle(2, PANEL_GOLD, 0.88).setFillStyle();
    this.miniInnerBorder = scene.add.rectangle(this.miniX + 4, this.miniY + 4, this.miniW - 8, this.miniH - 8)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(10012)
      .setStrokeStyle(1, 0xf0c66c, 0.32).setFillStyle();
    this.miniGfx = scene.add.graphics().setScrollFactor(0).setDepth(10011);
    // Duplicate HP bar under the minimap was removed — the player HUD at the
    // bottom of the screen is the single source of truth for HP.
    const miniHpY = this.miniY + this.miniH;

    this.tipBg = scene.add.rectangle(0, 0, 10, 22, 0x000000, 0.86)
      .setOrigin(1, 0.5).setScrollFactor(0).setDepth(12000)
      .setStrokeStyle(1, 0xffe066, 0.9).setVisible(false);
    this.tipText = scene.add.text(0, 0, '', {
      fontSize: '12px', color: '#fff4bb', stroke: '#000', strokeThickness: 2,
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(12001).setVisible(false);
    const addTip = (target, label, x, y) => {
      target.on('pointerover', () => {
        this.tipText.setText(label);
        this.tipText.setPosition(x - 8, y);
        this.tipBg.setPosition(x - 4, y);
        this.tipBg.width = this.tipText.width + 14;
        this.tipBg.height = 24;
        this.tipBg.setVisible(true);
        this.tipText.setVisible(true);
      });
      target.on('pointerout', () => {
        this.tipBg.setVisible(false);
        this.tipText.setVisible(false);
      });
    };

    const btnW = this.miniW - 8, btnH = 26;
    const btnX = this.miniX + 4;
    let toolbarY = miniHpY + 12;
    const TOOLBAR_FILL = 0x24180f;
    const TOOLBAR_STROKE = PANEL_GOLD;
    const TOOLBAR_TEXT = '#fff4d6';
    const TOOLBAR_MUTED = '#c7d2b0';
    const TOOLBAR_GOLD = '#ffe066';
    const TOOLBAR_RED = '#ff9999';
    const addSection = (label) => {
      crisp(scene.add.text(btnX, toolbarY, label, {
        fontSize: '10px', fontStyle: 'bold', color: '#d8e7bd',
        stroke: '#000', strokeThickness: 2,
      }).setOrigin(0, 0).setScrollFactor(0).setDepth(10011));
      scene.add.rectangle(btnX, toolbarY + 12, btnW, 1, PANEL_GOLD, 0.28)
        .setOrigin(0, 0).setScrollFactor(0).setDepth(10010);
      toolbarY += 14;
    };
    const addToolbarButton = (label, role = 'passive') => {
      const y = toolbarY;
      const isAction = role === 'action';
      const isWarning = role === 'warning';
      const bg = scene.add.rectangle(btnX, y, btnW, btnH, isWarning ? 0x382018 : TOOLBAR_FILL, 0.90)
        .setOrigin(0, 0).setScrollFactor(0).setDepth(10010)
        .setStrokeStyle(1, isAction ? 0xffe066 : isWarning ? 0xff7777 : TOOLBAR_STROKE, isAction ? 1 : 0.78)
        .setInteractive({ useHandCursor: true });
      const text = crisp(scene.add.text(btnX + btnW / 2, y + btnH / 2, label, {
        fontSize: '12px', fontStyle: 'bold',
        color: isAction ? TOOLBAR_GOLD : isWarning ? TOOLBAR_RED : role === 'toggle' ? TOOLBAR_MUTED : TOOLBAR_TEXT,
        stroke: '#000',
        strokeThickness: 2,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(10011));
      scene.add.rectangle(btnX + 3, y + 2, btnW - 6, 1, 0xf0c66c, isAction ? 0.40 : 0.24)
        .setOrigin(0, 0).setScrollFactor(0).setDepth(10011);
      scene.add.rectangle(btnX + 3, y + btnH - 3, btnW - 6, 1, 0x000000, 0.32)
        .setOrigin(0, 0).setScrollFactor(0).setDepth(10011);
      toolbarY += btnH + 4;
      return { bg, text, y };
    };

    addSection('NAVIGATION');
    // Mini-map zoom button was removed from the HUD. minimapZoom stays at its
    // default (1) so the mini-map renders the whole world.

    // Return-to-spawn (Kafra warp). Instant teleport, no cost yet.
    let row = addToolbarButton('⌂ Return Home', 'passive');
    this.rsBg = row.bg;
    this.rsText = row.text;
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
    addTip(this.rsBg, 'Warp back to spawn', btnX, row.y + btnH / 2);

    // Fast Travel button — opens overlay listing discovered plazas.
    row = addToolbarButton('🧭 Travel', 'action');
    this.tvBg = row.bg;
    this.tvText = row.text;
    this.tvBg.on('pointerdown', () => {
      if (!player || player.dead) return;
      showTravel(scene);
    });
    addTip(this.tvBg, 'Fast travel to discovered plazas', btnX, row.y + btnH / 2);

    toolbarY += 4;
    addSection('SETTINGS');

    // Music ON/OFF — binary toggle at a fixed 50% volume. Per user
    // request the 5-step volume cycle was replaced with a clean ON/OFF.
    // Persisted as 0 (off) / 1 (on); default ON.
    const MUSIC_KEY = 'grasslands_music_v3';
    const MUSIC_VOLUME = 0.5; // 50% of the BGM's natural volume (0.35).
    let musicOn = true;
    try { const s = localStorage.getItem(MUSIC_KEY); if (s !== null) musicOn = s !== '0'; } catch (e) { /* ignore */ }
    const applyVol = () => {
      const bgm = scene.bgm; if (!bgm) return;
      bgm.setVolume(musicOn ? 0.35 * MUSIC_VOLUME : 0);
      bgm.setMute(!musicOn);
    };
    applyVol();
    const volLabel = () => musicOn ? '♪ Music: ON' : '♪ Music: OFF';
    row = addToolbarButton(volLabel(), 'toggle');
    this.muteBg = row.bg;
    this.muteText = row.text;
    this.muteBg.on('pointerdown', () => {
      const bgm = scene.bgm; if (!bgm) return;
      musicOn = !musicOn;
      applyVol();
      // If we just unmuted and BGM never started (autoplay block), kick it off.
      if (musicOn && !bgm.isPlaying) {
        try {
          if (scene.sound.context && scene.sound.context.state === 'suspended') {
            scene.sound.context.resume();
          }
          bgm.play();
        } catch (e) { /* ignore */ }
      }
      this.muteText.setText(volLabel());
      try { localStorage.setItem(MUSIC_KEY, musicOn ? '1' : '0'); } catch (e) { /* ignore */ }
    });
    addTip(this.muteBg, 'Toggle music on/off', btnX, row.y + btnH / 2);

    // Autopilot toggle — auto-targets nearest safe monster, avoids bosses
    // and overleveled enemies. Sits right below the mute button.
    const AP_KEY = 'grasslands_autopilot_v1';
    try { autopilotOn = localStorage.getItem(AP_KEY) === '1'; } catch (e) { autopilotOn = false; }
    row = addToolbarButton(autopilotOn ? '⚙ Autopilot: ON' : '⚙ Autopilot: OFF', 'toggle');
    this.apBg = row.bg;
    this.apText = row.text;
    this.apBg.setFillStyle(autopilotOn ? 0x264c2d : TOOLBAR_FILL, 0.88);
    this.apBg.setStrokeStyle(2, autopilotOn ? 0x8ee894 : TOOLBAR_STROKE, autopilotOn ? 0.95 : 0.82);
    this.apText.setColor(autopilotOn ? '#ddffdd' : TOOLBAR_MUTED);
    this.apBg.on('pointerdown', () => {
      autopilotOn = !autopilotOn;
      autopilotLastScan = 0; // force immediate scan on next update tick
      this.apText.setText(autopilotOn ? '⚙ Autopilot: ON' : '⚙ Autopilot: OFF');
      this.apText.setColor(autopilotOn ? '#ddffdd' : TOOLBAR_MUTED);
      this.apBg.setFillStyle(autopilotOn ? 0x264c2d : TOOLBAR_FILL, 0.88);
      this.apBg.setStrokeStyle(2, autopilotOn ? 0x8ee894 : TOOLBAR_STROKE, autopilotOn ? 0.95 : 0.82);
      try { localStorage.setItem(AP_KEY, autopilotOn ? '1' : '0'); } catch (e) { /* ignore */ }
      ui.message(autopilotOn ? 'Autopilot ON — avoiding bosses + strong monsters.' : 'Autopilot OFF.');
    });
    addTip(this.apBg, 'Auto-target safe quest monsters', btnX, row.y + btnH / 2);

    // Hard Mode toggle was removed from the HUD. hardMode stays at its
    // default (false) so the rest of the codebase still reads it safely.

    toolbarY += 4;
    addSection('ACTIONS');

    // Change Class button — always visible. Below Lv 10 it just tells the
    // player to keep leveling. At Lv 10+ it opens the class chooser
    // (re-pickable at any time). Sits below Hard Mode toggle.
    row = addToolbarButton('✦ Change Class', 'action');
    this.clBg = row.bg;
    this.clText = row.text;
    this.clBg.on('pointerdown', () => {
      if (!player) return;
      if (player.level < 10) {
        ui.message(`Reach Lv.10 to choose a class. (Currently Lv.${player.level})`);
        return;
      }
      const cost = classSwitchCost();
      if (cost > 0 && player.zeny < cost) {
        ui.message(`Need ${fmt(cost)}z to swap class. (Have ${fmt(player.zeny)}z)`);
        return;
      }
      showClassSelect(scene);
    });
    addTip(this.clBg, 'Choose or change class', btnX, row.y + btnH / 2);

    let debugUi = false;
    try {
      debugUi = new URLSearchParams(window.location.search).get('debug') === '1' ||
        localStorage.getItem('grasslands_debug_v1') === '1';
    } catch (e) { debugUi = false; }

    // Cheat button — visible by request. It manually bumps level by 1 and
    // triggers normal levelUp() so tier upgrades + class select prompts fire.
    row = addToolbarButton('⇧ +1 Level', 'warning');
    this.lvBg = row.bg;
    this.lvText = row.text;
    this.lvBg.on('pointerdown', () => {
      if (!player || player.dead) return;
      player.levelUp();
    });
    addTip(this.lvBg, 'Cheat: gain 1 level', btnX, row.y + btnH / 2);

    if (debugUi) {
      // +10 Levels cheat — bulk up for testing tier thresholds.
      row = addToolbarButton('⇧ +10 Levels', 'warning');
      this.lv10Bg = row.bg;
      this.lv10Text = row.text;
      this.lv10Bg.on('pointerdown', () => {
        if (!player || player.dead) return;
        for (let i = 0; i < 10; i++) player.levelUp();
      });
      addTip(this.lv10Bg, 'Debug: gain 10 levels', btnX, row.y + btnH / 2);

      // -1 Level cheat — reverses one level's per-level stat grant (20 HP /
      // 3 ATK / 1 DEF). Tier bonuses are NOT refunded (they're permanent).
      row = addToolbarButton('⇩ -1 Level', 'warning');
      this.lvMBg = row.bg;
      this.lvMText = row.text;
      this.lvMBg.on('pointerdown', () => {
        if (!player || player.dead || player.level <= 1) return;
        player.level -= 1;
        player.maxHP = Math.max(1, player.maxHP - 20);
        player.atk  = Math.max(1, player.atk  - 3);
        player.def  = Math.max(0, player.def  - 1);
        player.hp = Math.min(player.hp, player.maxHP);
        player.exp = 0;
        player._refreshNameTag();
        ui.message(`Level down. Now Lv.${player.level}.`);
        saveGame();
      });
      addTip(this.lvMBg, 'Debug: lower level by 1', btnX, row.y + btnH / 2);
    }

    // Shop button — spend zeny on permanent upgrades + full-heal potion.
    row = addToolbarButton('⚒ Shop', 'action');
    this.shBg = row.bg;
    this.shText = row.text;
    this.shBg.on('pointerdown', () => {
      if (!player || player.dead) return;
      showShop(scene);
    });
    addTip(this.shBg, 'Spend zeny on upgrades', btnX, row.y + btnH / 2);

    // Compact-HUD button was removed. hudCompact stays false so the HUD
    // always renders in its single "clean" layout.

    // Quest tracker — top-left badge anchored to viewport left edge.
    // Stack: quest (12,12) → gear (+pad) → boss ticker → streak → discovery.
    // Margins/pads are consistent so the column reads as one unit.
    const UL_X = 12;
    const UL_PAD = 6;
    this.panelW = Math.max(300, Math.min(380, Math.floor(GAME_W * 0.24)));
    let ulY = 12;
    this.questBg = scene.add.rectangle(UL_X, ulY, this.panelW, 56, PANEL_FILL, 0.86)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(10005)
      .setStrokeStyle(2, PANEL_GOLD, 0.85);
    this.questText = scene.add.text(UL_X + 12, ulY + 9, '', {
      fontSize: '14px', fontStyle: 'bold', color: '#ffffff', stroke: '#000', strokeThickness: 3,
      lineSpacing: 2, wordWrap: { width: this.panelW - 24 },
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(10006);
    this.questBg.setVisible(false);
    this.questText.setVisible(false);
    ulY += 56 + UL_PAD;
    this.gearBg = scene.add.rectangle(UL_X, ulY, this.panelW, 40, PANEL_FILL, 0.84)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(10005)
      .setStrokeStyle(2, PANEL_GOLD, 0.72)
      .setInteractive({ useHandCursor: true });
    this.gearBg.on('pointerdown', () => {
      const w = player.equipment.weapon;
      const a = player.equipment.armor;
      const wDesc = w ? `${w.name} (+${w.atk || 0} ATK)` : 'none';
      const aDesc = a ? `${a.name} (+${a.def || 0} DEF)` : 'none';
      const trophies = bossTrophyRows()
        .filter(row => row.count > 0)
        .map(row => `${row.cfg.name}×${row.count}`)
        .join(', ') || 'none';
      ui.message(`Weapon: ${wDesc}.  Armor: ${aDesc}.  Trophies: ${trophies}.`);
      showTrophyInspector(scene);
    });
    this.gearText = scene.add.text(UL_X + 12, ulY + 8, '', {
      fontSize: '13px', color: '#d8f7ff', stroke: '#000', strokeThickness: 2,
      lineSpacing: 2, wordWrap: { width: this.panelW - 24 },
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(10006);
    ulY += 40 + UL_PAD;
    // Boss ticker.
    this.bossTickerBg = scene.add.rectangle(UL_X, ulY, this.panelW, 26, PANEL_FILL, 0.84)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(10005)
      .setStrokeStyle(2, 0xb96943, 0.82);
    this.bossTickerText = scene.add.text(UL_X + 12, ulY + 5, '', {
      fontSize: '13px', color: '#ffcc99', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(10006);
    this.bossTickerBg.setVisible(false);
    this.bossTickerText.setVisible(false);
    ulY += 26 + UL_PAD;
    // Hot-streak indicator — only visible when streak > 0.
    this.streakBg = scene.add.rectangle(UL_X, ulY, this.panelW, 26, PANEL_FILL, 0.84)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(10005)
      .setStrokeStyle(2, PANEL_GOLD, 0.78);
    this.streakText = scene.add.text(UL_X + 12, ulY + 5, '', {
      fontSize: '13px', color: '#ffcc66',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(10006);
    this.streakBg.setVisible(false);
    this.streakText.setVisible(false);
    ulY += 26 + UL_PAD;
    // Discovery progress — least important, smallest type.
    this.discoveryBg = scene.add.rectangle(UL_X, ulY, this.panelW, 24, PANEL_FILL, 0.80)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(10005)
      .setStrokeStyle(1, PANEL_GOLD, 0.62);
    this.discoveryText = scene.add.text(UL_X + 12, ulY + 4, '', {
      fontSize: '12px', color: '#aaffcc', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(10006);

    // Boss HP bar — top center, primary hierarchy.
    const bbW = Math.max(360, Math.min(480, Math.floor(GAME_W * 0.34)));
    const bbH = 18;
    const bbX = (GAME_W - bbW) / 2;
    const bbY = 12;
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
    this.bossTimerText = scene.add.text(GAME_W / 2, bbY + bbH + 14, '', {
      fontSize: '12px', color: '#ffe066', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10007).setVisible(false);

    // Chat/combat log panel was removed at user request. The internal
    // `messages` array still exists so calls like `ui.message(...)` are
    // harmless no-ops on the screen.

    for (const text of [
      this.hpText, this.expText, this.lvlText, this.zenyText, this.saveGlyph,
      this.toastText,
      this.tipText, this.rsText,
      this.tvText, this.muteText, this.apText, this.clText,
      this.lvText, this.lv10Text, this.lvMText, this.shText,
      this.questText, this.gearText, this.bossTickerText, this.discoveryText,
      this.streakText, this.bossText, this.bossTimerText,
    ]) { if (text) crisp(text); }
  }

  announce(msg, opts = {}) {
    this._enqueueToast(msg, opts);
  }

  _enqueueToast(msg, opts = {}) {
    if (!msg || !this.toastBg || !this.toastText) return;
    this.toastQueue.push({
      msg: String(msg),
      tone: opts.tone || 'info',
      duration: opts.duration || 1500,
    });
    while (this.toastQueue.length > 5) this.toastQueue.shift();
    this._showNextToast();
  }

  _showNextToast() {
    if (this.toastActive || !this.toastQueue.length) return;
    const item = this.toastQueue.shift();
    const tones = {
      info:   { fill: 0x21160e, stroke: 0xc69a52, color: '#fff4d6' },
      zone:   { fill: 0x1f2110, stroke: 0xd8b85e, color: '#fff1a8' },
      rare:   { fill: 0x2b2109, stroke: 0xffd45a, color: '#fff2a0' },
      danger: { fill: 0x2a130f, stroke: 0xd56b4a, color: '#ffd6c8' },
    };
    const tone = tones[item.tone] || tones.info;
    this.toastActive = true;
    this.toastText.setText(item.msg);
    if (this.toastText.setWordWrapWidth) this.toastText.setWordWrapWidth(Math.max(320, Math.floor(GAME_W * 0.52)));
    this.toastText.setColor(tone.color);
    const width = Math.min(Math.max(360, Math.floor(GAME_W * 0.58)), Math.max(340, this.toastText.width + 42));
    const height = Math.max(36, this.toastText.height + 16);
    this.toastBg.setSize(width, height);
    this.toastBg.setDisplaySize(width, height);
    this.toastBg
      .setFillStyle(tone.fill, 0.93)
      .setStrokeStyle(2, tone.stroke, 0.95)
      .setAlpha(0)
      .setVisible(true);
    this.toastText.setAlpha(0).setVisible(true);
    this.scene.tweens.add({
      targets: [this.toastBg, this.toastText],
      alpha: 1,
      duration: 160,
      onComplete: () => {
        this.scene.time.delayedCall(item.duration, () => {
          this.scene.tweens.add({
            targets: [this.toastBg, this.toastText],
            alpha: 0,
            duration: 260,
            onComplete: () => {
              this.toastBg.setVisible(false);
              this.toastText.setVisible(false);
              this.toastActive = false;
              this._showNextToast();
            },
          });
        });
      },
    });
  }

  message(msg, opts = {}) {
    this.messages.push(msg);
    if (this.messages.length > 10) this.messages.shift();
    this._enqueueToast(msg, opts);
  }

  visibleMessages() {
    return this.messages.slice(hudCompact ? -6 : -10);
  }

  pulseSaveIndicator() {
    if (!this.saveGlyph) return;
    this.scene.tweens.killTweensOf(this.saveGlyph);
    this.saveGlyph.setAlpha(1).setScale(1.22);
    this.scene.tweens.add({
      targets: this.saveGlyph,
      alpha: 0.32,
      scale: 1,
      duration: 520,
      ease: 'Quad.out',
    });
  }

  // Reposition edge-anchored HUD when the browser viewport changes size.
  // Toolbar buttons stay where they were authored (right side, near minimap)
  // and shift by the delta in viewport width; everything else is recomputed.
  relayout(w, h) {
    if (!w || !h) return;
    const prevMiniX = this.miniX;
    // Bottom band — spans full width, sits flush against viewport bottom.
    const bottomY = h - this.bottomH;
    this.bar.setSize(w, this.bottomH);
    this.bar.x = 0;
    this.bar.y = bottomY;
    if (this.barTopTrim) {
      this.barTopTrim.setSize(w, 1);
      this.barTopTrim.x = 0;
      this.barTopTrim.y = bottomY + 3;
    }
    // Bottom-bar items.
    const hpX = 20;
    const statusW = 290;
    const statusX = w - statusW - 20;
    const expX = hpX + this.hpBarW + 28;
    this.expBarW = Math.max(220, statusX - expX - 28);
    const barH = 16;
    const panelH = 30;
    const midY = bottomY + this.bottomH / 2;
    this.hpPanel.x = hpX - 8; this.hpPanel.y = midY - panelH / 2;
    this.hpBg.x = hpX; this.hpBg.y = midY;
    this.hpFill.x = hpX; this.hpFill.y = midY;
    this.hpText.x = hpX + this.hpBarW / 2; this.hpText.y = midY;
    this.expPanel.x = expX - 8; this.expPanel.y = midY - panelH / 2;
    this.expPanel.width = this.expBarW + 16; this.expPanel.displayWidth = this.expBarW + 16;
    this.expBg.x = expX; this.expBg.y = midY;
    this.expBg.width = this.expBarW; this.expBg.displayWidth = this.expBarW;
    this.expFill.x = expX; this.expFill.y = midY;
    this.expText.x = expX + this.expBarW / 2; this.expText.y = midY;
    this.statusPanel.x = statusX; this.statusPanel.y = bottomY + (this.bottomH - 48) / 2;
    if (this.statusDivider) {
      this.statusDivider.x = statusX + Math.floor(statusW * 0.42);
      this.statusDivider.y = bottomY + (this.bottomH - 30) / 2;
    }
    this.lvlText.x = statusX + 18; this.lvlText.y = midY;
    this.zenyText.x = statusX + statusW - 14; this.zenyText.y = midY;
    // Minimap — anchor to right edge.
    this.miniX = w - this.miniW - 12;
    this.miniBg.x = this.miniX;
    this.miniBorder.x = this.miniX;
    // Toolbar — every button under the minimap shifts by the same delta so
    // the whole stack stays glued to the viewport's right side.
    const dx = this.miniX - prevMiniX;
    if (dx !== 0) {
      for (const obj of this.scene.children.list) {
        if (!obj || obj.scrollFactorX !== 0) continue;
        if (obj === this.bar || obj === this.miniBg || obj === this.miniBorder) continue;
        if (obj === this.miniGfx) continue;
        // Heuristic: any HUD object whose x lands within the old toolbar
        // column (roughly minimap area or to its right) gets shifted with it.
        if (obj.x >= prevMiniX - 4) obj.x += dx;
      }
    }
    // Boss bar — recenter horizontally.
    if (this.bossBg) {
      const bbW = this.bossBg.width;
      this.bossBg.x = (w - bbW) / 2;
      this.bossFill.x = (w - bbW) / 2;
      this.bossText.x = w / 2;
      this.bossTimerText.x = w / 2;
    }
  }

  applyCompactHud() {
    // Compact-HUD toggle was removed. The single layout is the only one,
    // so this method intentionally does nothing. Kept as a no-op so the
    // ~10 sites that still call it don't need touching.
  }

  update() {
    const hpPct = Math.max(0, player.hp / player.maxHP);
    this.hpFill.width = this.hpBarW * hpPct;
    this.hpText.setText(`HP ${player.hp}/${player.maxHP}`);

    const expPct = Math.max(0, Math.min(1, player.exp / player.expNeeded()));
    this.expFill.width = this.expBarW * expPct;
    this.expText.setText(`EXP ${player.exp}/${player.expNeeded()}`);

    this.lvlText.setText(`Lv.${player.level}`);
    this.zenyText.setText(`${fmt(player.zeny)}z`);

    // Label flips between Choose / Change based on whether a class is set.
    // Show escalating swap cost so the player can plan zeny spend.
    let wantedLbl;
    if (!player.classId) {
      wantedLbl = '✦ Choose Class';
    } else {
      const cost = classSwitchCost();
      wantedLbl = `✦ Change Class (${fmt(cost)}z)`;
    }
    if (this.clText.text !== wantedLbl) this.clText.setText(wantedLbl);
    // Dim button red when player can't afford the next swap. Cache the
    // color and skip setColor on no-change frames — every setColor call
    // forces a re-render, which earlier ran every frame and read as a
    // visible flicker. Font size is fixed (was dynamic, which oscillated
    // when label width straddled the threshold).
    const swapCost = player.classId ? classSwitchCost() : 0;
    const canAfford = player.zeny >= swapCost;
    const wantedColor = canAfford ? '#ffe066' : '#ff9999';
    if (this._clLastColor !== wantedColor) {
      this.clText.setColor(wantedColor);
      this._clLastColor = wantedColor;
    }

    // Quest tracker badge — color-coded per kind via tint hint in label.
    tickQuestPity();
    if (activeQuests.length) {
      const colorFor = (k) => k === 'boss' ? '#ff8866' : k === 'zone' ? '#88c8ff' : '#bce86a';
      const tagFor   = (k) => k === 'boss' ? 'BOSS' : k === 'zone' ? 'CLEAR' : 'SLAY';
      // Phaser Text doesn't render per-line color out of the box; emulate by
      // showing a small colored chip glyph at the start of each line.
      const txt = activeQuests.map((q) => {
        const target = q.kind === 'zone' ? q.zoneName : q.monsterName;
        const pity = q.pityTier ? ` ⌛+${25 * q.pityTier}%` : '';
        return `■ ${tagFor(q.kind)}  ${q.count}/${q.target}  ${target}${pity}`;
      }).join('\n');
      if (this.questText.text !== txt) this.questText.setText(txt);
      // Color the whole block by the highest-priority quest (boss > zone > slay).
      const top = activeQuests.find(q => q.kind === 'boss')
              || activeQuests.find(q => q.kind === 'zone')
              || activeQuests[0];
      this.questText.setColor(colorFor(top.kind));
      this.questBg.setVisible(true);
      this.questText.setVisible(true);
    } else {
      this.questBg.setVisible(false);
      this.questText.setVisible(false);
    }
    // Fold the biome / discovery count into the gear line so the upper-left
    // column reads as one compact "loadout + progress" panel instead of two.
    const discN = Object.keys(player.visitedLandmarks || {}).length;
    const discMax = (typeof landmarkTiles === 'function') ? landmarkTiles().length : 5;
    const gearTxt = `${gearSummary()}   ★ ${discN}/${discMax}`;
    if (this.gearText.text !== gearTxt) this.gearText.setText(gearTxt);
    // Promote gear bar border to gold once both slots are filled — visible
    // sign of full kit without opening the inspector.
    const fullyGeared = player.equipment.weapon && player.equipment.armor;
    const wantBorder = fullyGeared ? 0xffe066 : 0x88ddff;
    if (this.gearBg._lastBorder !== wantBorder) {
      this.gearBg.setStrokeStyle(fullyGeared ? 2 : 1, wantBorder, 0.85);
      this.gearBg._lastBorder = wantBorder;
    }

    // Boss ticker / streak / discovery panels were retired from the
    // upper-left column as part of the HUD declutter. Boss state still
    // shows in the top-center boss bar; streak feedback fires as float
    // text over the player; discovery now lives inline on the gear line.
    this.bossTickerBg.setVisible(false);
    this.bossTickerText.setVisible(false);
    this.streakBg.setVisible(false);
    this.streakText.setVisible(false);
    this.discoveryBg.setVisible(false);
    this.discoveryText.setVisible(false);

    // Boss bar — show whenever any aggressive / boss-tier monster is alive
    // anywhere in the world. Picks the closest one when several are around.
    let boss = null, bossD = Infinity;
    for (const m of bloblings) {
      if (!m.alive) continue;
      const cfg = m.cfg || {};
      if (!isBossCfg(cfg)) continue;
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
      this.bossTimerText.setVisible(false);
    } else {
      this.bossBg.setVisible(false);
      this.bossFill.setVisible(false);
      this.bossText.setVisible(false);
      let nextId = null, nextAt = Infinity;
      for (const [typeId, at] of Object.entries(bossRespawns)) {
        if (at < nextAt) { nextAt = at; nextId = typeId; }
      }
      if (nextId) {
        const secs = Math.max(0, Math.ceil((nextAt - this.scene.time.now) / 1000));
        this.bossTimerText.setText(`${MONSTER_TYPES[nextId].name} respawns in ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);
        this.bossTimerText.setVisible(true);
      } else {
        this.bossTimerText.setVisible(false);
      }
    }

    this.drawMinimap();
  }

  drawMinimap() {
    // Perf: throttle to ~10 Hz. The minimap scans 150×150 = 22 500 tiles
    // for road cells; at 60 fps that was 1.35M getCellType() calls/sec
    // and the biggest single per-frame cost in the game.
    const now = (player && player.scene) ? player.scene.time.now : 0;
    if (this._miniLastDraw && now - this._miniLastDraw < 100) return;
    this._miniLastDraw = now;
    const g = this.miniGfx;
    g.clear();
    const zoom = minimapZoom || 1;
    const viewW = WORLD_W / zoom;
    const viewH = WORLD_H / zoom;
    const maxLeft = Math.max(0, WORLD_W - viewW);
    const maxTop = Math.max(0, WORLD_H - viewH);
    const left = Math.max(0, Math.min(maxLeft, player.sprite.x - viewW / 2));
    const top = Math.max(0, Math.min(maxTop, player.sprite.y - viewH / 2));
    const sx = this.miniW / viewW;
    const sy = this.miniH / viewH;
    const toMini = (wx, wy) => ({
      x: this.miniX + (wx - left) * sx,
      y: this.miniY + (wy - top) * sy,
    });
    const inMini = (p, pad = 0) =>
      p.x >= this.miniX - pad && p.x <= this.miniX + this.miniW + pad &&
      p.y >= this.miniY - pad && p.y <= this.miniY + this.miniH + pad;
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
        const wx = left + ((sc + 0.5) / samples) * viewW;
        const wy = top + ((sr + 0.5) / samples) * viewH;
        const tile_r = Math.floor(wy / TILE_SIZE);
        const tile_c = Math.floor(wx / TILE_SIZE);
        const z = getZone(tile_r, tile_c);
        g.fillStyle(zoneColor[z] || 0x555555, 0.38);
        g.fillRect(this.miniX + sc * cellW, this.miniY + sr * cellH, cellW + 1, cellH + 1);
      }
    }
    // Road network: center cross, grasslands loop, diagonal biome feeders,
    // and plazas. Cache non-grass cells once — map is static after gen.
    if (!UIManager._roadCells) {
      const cells = [];
      for (let r = 0; r < MAP_ROWS; r++) {
        for (let c = 0; c < MAP_COLS; c++) {
          if (getCellType(r, c) !== 'grass') cells.push((r << 16) | c);
        }
      }
      UIManager._roadCells = cells;
    }
    g.fillStyle(0xd0a35a, 0.54);
    for (const rc of UIManager._roadCells) {
      const r = rc >>> 16;
      const c = rc & 0xffff;
      const p = toMini(c * TILE_SIZE, r * TILE_SIZE);
      const q = toMini((c + 1) * TILE_SIZE, (r + 1) * TILE_SIZE);
      if (q.x < this.miniX || p.x > this.miniX + this.miniW || q.y < this.miniY || p.y > this.miniY + this.miniH) continue;
      const x = Math.max(this.miniX, p.x);
      const y = Math.max(this.miniY, p.y);
      const w = Math.max(2, Math.min(this.miniX + this.miniW, q.x) - x);
      const h = Math.max(2, Math.min(this.miniY + this.miniH, q.y) - y);
      g.fillRect(x, y, w + 0.5, h + 0.5);
    }
    g.lineStyle(1, 0xffe0a0, 0.58);
    for (const p of landmarkTiles()) {
      const pos = toMini((p.c + 0.5) * TILE_SIZE, (p.r + 0.5) * TILE_SIZE);
      if (inMini(pos, 5)) g.strokeCircle(pos.x, pos.y, 4);
    }
    // Monsters: cap normal dots so the minimap is a readable navigation aid,
    // not confetti. Bosses/rares stay visible; normal mobs are nearest-only.
    const monsterDots = bloblings
      .filter(m => m.alive)
      .map(m => {
        const dx = m.sprite.x - player.sprite.x;
        const dy = m.sprite.y - player.sprite.y;
        const dist = Math.hypot(dx, dy);
        const priority = (isBossCfg(m.cfg) || m.cfg.rare) ? 0 : dist;
        return { m, dist, priority };
      })
      .filter(row => row.priority === 0 || row.dist < 1300)
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 20);
    for (const row of monsterDots) {
      const m = row.m;
      let color = 0xff5555;
      let r = 1.6;
      let outline = null;
      if (m.typeId === 'mooham') color = 0xffaa55;
      else if (m.typeId === 'moowaan') color = 0x55ff88;
      else if (m.typeId === 'moodeng') color = 0xff9fcf;
      else if (m.typeId === 'cactling') color = 0xbce86a;
      else if (m.typeId === 'rare_mooham') { color = 0xffe066; r = 4; outline = 0xffffff; }
      else if (['bigfoot', 'trex', 'kaiju_titan'].includes(m.typeId)) { color = 0xff2222; r = 5; outline = 0x000000; }
      else if (m.typeId === 'rare_moowaan') { color = 0x7cffb0; r = 4; outline = 0xffffff; }
      else if (isBossCfg(m.cfg)) { color = m.cfg.tint || 0xffff44; r = 4; outline = 0x000000; }
      const pos = toMini(m.sprite.x, m.sprite.y);
      if (!inMini(pos, r + 3)) continue;
      g.fillStyle(color, outline === null ? 0.48 : 0.96);
      g.fillCircle(pos.x, pos.y, r);
      if (outline !== null) {
        g.lineStyle(2, outline, 1);
        g.strokeCircle(pos.x, pos.y, r + 2);
      }
    }
    // Loot.
    g.fillStyle(0xffd24a, 0.76);
    for (const l of loots) {
      const pos = toMini(l.x, l.y);
      if (inMini(pos, 2)) g.fillCircle(pos.x, pos.y, 2);
    }
    // Player on top. A second outer ring + larger dot makes the player
    // easy to spot now that the minimap covers a 9× larger world.
    const playerPos = toMini(player.sprite.x, player.sprite.y);
    g.lineStyle(2, 0xffff66, 0.82);
    g.strokeCircle(playerPos.x, playerPos.y, 8);
    g.lineStyle(2, 0x000000, 1);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(playerPos.x, playerPos.y, 4);
    g.strokeCircle(playerPos.x, playerPos.y, 4);
  }
}
