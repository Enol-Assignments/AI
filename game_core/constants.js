const TILE_EMPTY = 0;
const TILE_WALL = 1;
const TILE_COVER = 2;

const TEAM_PLAYER = 'player';
const TEAM_ENEMY = 'enemy';

const ACTION_IDLE = 'idle';
const ACTION_MOVE = 'move';
const ACTION_SHOOT = 'shoot';
const ACTION_DODGE = 'dodge';

const GAME_STATUS_READY = 'ready';
const GAME_STATUS_RUNNING = 'running';
const GAME_STATUS_FINISHED = 'finished';

// 技能类型
const SKILL_ALGORITHMIC_DAMAGE = 'algorithmic_damage';
const SKILL_PING_PONG = 'ping_pong';
const SKILL_BOOLEAN_MOTION = 'boolean_motion';   // 与你原来一致

const DIRECTIONS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/**
 * @typedef {0 | 1 | 2} TileType
 * @typedef {TileType[][]} MapGrid
 * @typedef {{x: number, y: number}} GridPosition
 */

// ====================== 新增：圆形碰撞支持（最小改动） ======================

/** 
 * 每个格子的像素大小（从 index.js 的 cellSize 计算得出）
 * 在 physics.js 中用于把比例半径转为像素进行碰撞检测
 */
const GRID_SIZE = 30;   // ← 你可以根据实际绘制效果微调（20~40 之间较好）

/** 实体碰撞半径（格子比例） - 用于碰撞检测，不影响绘制大小 */
const ENTITY_RADIUS_RATIO = 0.35;   // 与你原来 entityRadius 一致

/** 子弹碰撞半径（格子比例） - 用于碰撞检测 */
const BULLET_RADIUS_RATIO = 0.18;   // 与你原来 bulletRadius 一致

/** 墙壁碰撞厚度（像素） */
const WALL_THICKNESS = GRID_SIZE;

/** 可破坏掩体碰撞厚度（像素） */
const COVER_THICKNESS = GRID_SIZE;

/**
 * @typedef {Object} EntityState
 * @property {string} id
 * @property {string} team
 * @property {number} x                    // 中心点坐标（格子比例，0~mapWidth）
 * @property {number} y
 * @property {number} radius               // 半径（格子比例，例如 0.35）
 * @property {number} hp
 * @property {number} maxHp
 * @property {number} atk
 * @property {number} def
 * @property {number} ammo
 * @property {number} speed                // 移动速度（格子/秒）
 * @property {number} vx                   // 当前速度分量（可选）
 * @property {number} vy
 * @property {number} fireCooldown
 * @property {number} reloadTimer
 * @property {string} action
 * @property {string} color
 * @property {string|null} activeSkill
 * @property {number} skillCooldown
 * @property {Object} skillData
 * @property {Object|null} timeTravelClone
 */

const CONFIG = {
  mapWidth: 21,
  mapHeight: 21,
  breakRate: 0.18,
  rageTimeLimit: 60,
  rageDamagePerSecond: 3,
  tickMs: 16,
  bulletSpeed: 7.5,           // 保持你原来的风格（格子/秒）
  bulletLifetime: 10,
  fireCooldown: 0.38,
  reloadDuration: 1.2,
  maxAmmo: 6,
  playerSpeed: 4.5,           // 保持你原来的风格
  aiSpeed: 4.2,
  
  // 重要：使用比例半径（不改变你当前绘制的大小）
  entityRadius: ENTITY_RADIUS_RATIO,
  bulletRadius: BULLET_RADIUS_RATIO,
  gridSize: GRID_SIZE,        // 新增，供 physics.js 使用

  coverHp: 2,

  // 技能配置（完全保留你原来的）
  skills: {
    [SKILL_ALGORITHMIC_DAMAGE]: {
      cooldown: 10,
      name: '算法伤害',
      description: '随机抽取三个0-9的数字进行乘法运算，结果为下一发子弹的攻击力'
    },
    [SKILL_PING_PONG]: {
      cooldown: 8,
      fireCooldown: 1.5,
      name: '乒乓球手',
      description: '发射乒乓球，可以一直反弹，但发射间隔长，在发射期间可以反弹对面的攻击'
    },
    [SKILL_BOOLEAN_MOTION]: {
      cooldown: 12,
      name: '布尔运动',
      description: '发射小球随机运动，直到攻击到对手，不可反弹'
    }
  }
};

module.exports = {
  TILE_EMPTY,
  TILE_WALL,
  TILE_COVER,

  TEAM_PLAYER,
  TEAM_ENEMY,

  ACTION_IDLE,
  ACTION_MOVE,
  ACTION_SHOOT,
  ACTION_DODGE,

  GAME_STATUS_READY,
  GAME_STATUS_RUNNING,
  GAME_STATUS_FINISHED,

  SKILL_ALGORITHMIC_DAMAGE,
  SKILL_PING_PONG,
  SKILL_BOOLEAN_MOTION,

  CONFIG,
  DIRECTIONS,

  // 新增导出（供 physics.js 使用）
  GRID_SIZE,
  ENTITY_RADIUS_RATIO,
  BULLET_RADIUS_RATIO,
  WALL_THICKNESS,
  COVER_THICKNESS,
};