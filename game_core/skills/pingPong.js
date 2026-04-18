/**
 * 乒乓球手技能
 * 发射乒乓球，可以一直反弹，但发射间隔长，在发射期间可以反弹对面的攻击
 */

const { CONFIG, TILE_WALL } = require('../constants');

/**
 * 激活技能
 * @param {EntityState} entity
 * @param {GameState} gameState
 * @param {Object} target
 * @returns {boolean} 是否成功激活
 */
function activate(entity, gameState, target) {
  // 存储技能数据
  entity.skillData.pingPong = {
    active: true,
    reflecting: false,
    reflectDuration: 2.0, // 反弹持续时间
    reflectTimer: 0
  };

  // 延长发射间隔
  entity.fireCooldown = CONFIG.skills.ping_pong.fireCooldown;

  console.log('乒乓球手技能激活');
  return true;
}

/**
 * 更新技能状态
 * @param {EntityState} entity
 * @param {number} dt
 */
function update(entity, dt) {
  const skillData = entity.skillData.pingPong;
  if (!skillData) {
    return;
  }

  // 更新反弹状态
  if (skillData.reflecting) {
    skillData.reflectTimer -= dt;
    if (skillData.reflectTimer <= 0) {
      skillData.reflecting = false;
    }
  }
}

/**
 * 处理子弹逻辑
 * @param {EntityState} entity
 * @param {Object} bullet
 * @param {GameState} gameState
 */
function processBullet(entity, bullet, gameState) {
  const skillData = entity.skillData.pingPong;
  if (!skillData || !skillData.active) {
    return;
  }

  // 标记子弹为乒乓球
  bullet.skillEffect = 'ping_pong';
  bullet.bounceCount = 0;
  bullet.maxBounces = 10; // 最大反弹次数

  // 开始反弹状态
  skillData.reflecting = true;
  skillData.reflectTimer = skillData.reflectDuration;

  console.log('乒乓球手技能生效，发射乒乓球');
}

/**
 * 处理子弹反弹
 * @param {Object} bullet
 * @param {GameState} gameState
 * @returns {boolean} 是否继续存在
 */
function handleBounce(bullet, gameState) {
  if (bullet.skillEffect !== 'ping_pong') {
    return true;
  }

  // 检查是否碰到墙壁
  const tileX = Math.round(bullet.x);
  const tileY = Math.round(bullet.y);
  const tile = gameState.map[tileY] && gameState.map[tileY][tileX];

  if (tile === TILE_WALL) {
    // 计算当前方向的反方向
    const currentDirection = { x: bullet.vx, y: bullet.vy };
    const speed = Math.sqrt(currentDirection.x * currentDirection.x + currentDirection.y * currentDirection.y);
    currentDirection.x /= speed;
    currentDirection.y /= speed;
    const oppositeDirection = { x: -currentDirection.x, y: -currentDirection.y };

    // 选择一个新的方向，避免再次碰到墙，且不选择反方向
    const possibleDirections = [];
    const nonOppositeDirections = [];

    // 检查四个方向是否有墙
    const directions = [
      { x: 1, y: 0 },   // 右
      { x: -1, y: 0 },  // 左
      { x: 0, y: 1 },   // 下
      { x: 0, y: -1 }   // 上
    ];

    for (const dir of directions) {
      const newTileX = tileX + dir.x;
      const newTileY = tileY + dir.y;
      const newTile = gameState.map[newTileY] && gameState.map[newTileY][newTileX];
      if (newTile !== TILE_WALL) {
        possibleDirections.push(dir);
        // 检查是否不是反方向
        if (!(dir.x === oppositeDirection.x && dir.y === oppositeDirection.y)) {
          nonOppositeDirections.push(dir);
        }
      }
    }

    // 如果有可用方向，优先选择非反方向
    let selectedDirection;
    if (nonOppositeDirections.length > 0) {
      selectedDirection = nonOppositeDirections[Math.floor(Math.random() * nonOppositeDirections.length)];
    } else if (possibleDirections.length > 0) {
      // 如果只有反方向可用
      selectedDirection = possibleDirections[Math.floor(Math.random() * possibleDirections.length)];
    } else {
      // 如果所有方向都有墙，简单反弹
      const dx = bullet.x - tileX;
      const dy = bullet.y - tileY;

      if (Math.abs(dx) > Math.abs(dy)) {
        bullet.vx = -bullet.vx;
      } else {
        bullet.vy = -bullet.vy;
      }
    }

    // 设置新方向
    if (selectedDirection) {
      bullet.vx = selectedDirection.x * speed;
      bullet.vy = selectedDirection.y * speed;
    }

    // 增加反弹次数
    bullet.bounceCount = (bullet.bounceCount || 0) + 1;

    // 检查是否达到最大反弹次数（10次）
    if (bullet.bounceCount >= 10) {
      return false;
    }
  }

  return true;
}

/**
 * 处理反弹敌人的攻击
 * @param {EntityState} entity
 * @param {Object} bullet
 * @returns {boolean} 是否反弹
 */
function reflectAttack(entity, bullet) {
  const skillData = entity.skillData.pingPong;
  if (!skillData || !skillData.reflecting) {
    return false;
  }

  // 反弹子弹
  bullet.ownerId = entity.id;
  bullet.ownerTeam = entity.team;
  bullet.vx = -bullet.vx;
  bullet.vy = -bullet.vy;
  bullet.skillEffect = 'ping_pong_reflected';

  console.log('乒乓球手技能反弹敌人攻击');
  return true;
}

module.exports = {
  activate,
  update,
  processBullet,
  handleBounce,
  reflectAttack
};
