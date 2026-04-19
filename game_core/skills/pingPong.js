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

/**
 * 核心碰撞处理
 */
function handleBounce(bullet, gameState) {
  if (bullet.skillEffect !== 'ping_pong') return true;

  const map = gameState.map;
  const samples = 6;   // 增加采样，提高检测准确率

  const prevX = bullet.x - bullet.vx * 0.02;
  const prevY = bullet.y - bullet.vy * 0.02;

  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const checkX = prevX + (bullet.x - prevX) * t;
    const checkY = prevY + (bullet.y - prevY) * t;

    const tx = Math.floor(checkX);
    const ty = Math.floor(checkY);

    if (!map[ty] || map[ty][tx] === undefined) continue;

    const tile = map[ty][tx];

    // ==================== 命中箱子（最重要修复） ====================
    if (tile === TILE_COVER) {
      map[ty][tx] = 0;        // 销毁箱子
      console.log('乒乓球击中箱子，子弹和箱子同时消失');
      return false;           // ←←← 关键：返回 false，让子弹立即消失
    }

    // ==================== 命中墙壁 ====================
    if (tile === TILE_WALL) {
      if (bullet.bounceCount >= bullet.maxBounces) {
        return false;         // 已反弹1次，再次碰到墙也消失
      }

      // 物理反弹（接近原路径返回）
      const dx = checkX - (tx + 0.5);
      const dy = checkY - (ty + 0.5);

      let normalX = 0, normalY = 0;
      if (Math.abs(dx) > Math.abs(dy)) {
        normalX = Math.sign(dx);
      } else {
        normalY = Math.sign(dy);
      }

      const dot = bullet.vx * normalX + bullet.vy * normalY;
      bullet.vx -= 2 * dot * normalX;
      bullet.vy -= 2 * dot * normalY;

      bullet.x += normalX * 0.15;
      bullet.y += normalY * 0.15;

      bullet.bounceCount += 1;
      return true;              // 第一次反弹后继续
    }
  }

  return true;
}

function reflectAttack(entity, bullet) {
  const skillData = entity.skillData.pingPong;
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