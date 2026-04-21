/**
 * 乒乓球手技能 - 箱子+子弹同时消失最终版
 * 要求：
 *   - 撞墙：物理反弹，最多反弹1次
 *   - 打到箱子：子弹和箱子**同时立即消失**（无论是否已反弹）
 */

const { CONFIG, TILE_WALL, TILE_COVER } = require('../constants');

function activate(entity, gameState, target) {
  entity.skillData.pingPong = {
    active: true,
    reflecting: false,
    reflectDuration: 2.0,
    reflectTimer: 0
  };

  entity.fireCooldown = CONFIG.skills.ping_pong?.fireCooldown || 1.5;
  console.log('乒乓球手技能激活');
  return true;
}

function update(entity, dt) {
  const skillData = entity.skillData.pingPong;
  if (!skillData) return;

  if (skillData.reflecting) {
    skillData.reflectTimer -= dt;
    if (skillData.reflectTimer <= 0) {
      skillData.reflecting = false;
    }
  }
}

function processBullet(entity, bullet, gameState) {
  const skillData = entity.skillData.pingPong;
  if (!skillData || !skillData.active) return;

  bullet.skillEffect = 'ping_pong';
  bullet.bounceCount = 0;
  bullet.maxBounces = 1;          // 最多反弹1次

  skillData.reflecting = true;
  skillData.reflectTimer = skillData.reflectDuration;

  console.log('发射乒乓球（最多反弹1次，打箱子立即消失）');
}

function handleBounce(bullet, gameState, collision) {
  if (bullet.skillEffect !== 'ping_pong') return true;
  if (!collision) return true;

  if (collision.tile === TILE_COVER) {
    gameState.map[collision.tileY][collision.tileX] = 0;
    console.log('乒乓球击中箱子，子弹和箱子同时消失');
    return false;
  }

  if (collision.tile !== TILE_WALL) {
    return true;
  }

  if (bullet.bounceCount >= bullet.maxBounces) {
    return false;
  }

  const dx = collision.hitX - collision.tileX;
  const dy = collision.hitY - collision.tileY;
  let normalX = 0;
  let normalY = 0;

  if (Math.abs(dx) >= Math.abs(dy)) {
    normalX = Math.sign(dx) || 1;
  } else {
    normalY = Math.sign(dy) || 1;
  }

  const dot = bullet.vx * normalX + bullet.vy * normalY;
  bullet.vx -= 2 * dot * normalX;
  bullet.vy -= 2 * dot * normalY;
  bullet.x += normalX * 0.18;
  bullet.y += normalY * 0.18;
  bullet.bounceCount += 1;
  return true;
}

function reflectAttack(entity, bullet) {
  const skillData = entity.skillData && entity.skillData.pingPong;
  if (!skillData || !skillData.reflecting) return false;

  bullet.ownerId = entity.id;
  bullet.ownerTeam = entity.team;
  bullet.vx = -bullet.vx;
  bullet.vy = -bullet.vy;
  bullet.skillEffect = 'ping_pong_reflected';
  return true;
}

module.exports = {
  activate,
  update,
  processBullet,
  handleBounce,
  reflectAttack
};
