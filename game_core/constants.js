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

const CONFIG = {
  mapWidth: 21,
  mapHeight: 21,
  breakRate: 0.18,
  rageTimeLimit: 60,
  rageDamagePerSecond: 3,
  tickMs: 16,
  bulletSpeed: 9.5,
  bulletRadius: 0.12,
  fireCooldown: 0.38,
  reloadDuration: 1.2,
  maxAmmo: 6,
  playerSpeed: 3.2,
  aiSpeed: 2.9,
  entityRadius: 0.28,
  coverHp: 2,
};

const DIRECTIONS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/**
 * @typedef {0 | 1 | 2} TileType
 */

/**
 * @typedef {TileType[][]} MapGrid
 */

/**
 * @typedef {{x: number, y: number}} GridPosition
 */

/**
 * @typedef {Object} EntityState
 * @property {string} id
 * @property {string} team
 * @property {number} x
 * @property {number} y
 * @property {number} hp
 * @property {number} maxHp
 * @property {number} atk
 * @property {number} def
 * @property {number} ammo
 * @property {number} speed
 * @property {number} fireCooldown
 * @property {number} reloadTimer
 * @property {number} radius
 * @property {string} action
 * @property {string} color
 */

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
  CONFIG,
  DIRECTIONS,
};
