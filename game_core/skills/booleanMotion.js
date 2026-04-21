/**
 * 布尔运动技能 - 防穿墙最终版
 * 加强墙壁检测 + 稳定追踪
 */

const { TILE_WALL, TILE_COVER } = require('../constants');
const { CONFIG } = require('../constants');

function activate(entity, gameState, target) {
  entity.skillData.booleanMotion = { active: true };
  console.log('布尔运动技能激活');
  return true;
}

function update(entity, dt) { }

/**
 * 发射时初始朝向敌人
 */
function processBullet(entity, bullet, gameState) {
  bullet.skillEffect = 'boolean_motion';

  const target = entity.team === 'player' 
    ? gameState.entities.enemy 
    : gameState.entities.player;

  if (target) {
    const dx = target.x - bullet.x;
    const dy = target.y - bullet.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const speed = CONFIG.bulletSpeed || 7.5;

    bullet.vx = (dx / dist) * speed;
    bullet.vy = (dy / dist) * speed;
  }

  console.log('发射布尔运动追踪子弹');
}

/**
 * 每帧更新 - 加强防穿墙 + 稳定追踪
 */
function updateBullet(bullet, dt, gameState) {
  if (bullet.skillEffect !== 'boolean_motion') return;

  const map = gameState.map;
  const target = bullet.ownerTeam === 'player' 
    ? gameState.entities.enemy 
    : gameState.entities.player;

  if (!target || target.hp <= 0) return;

  // ==================== 加强版墙壁/箱子检测（在改变方向前检查） ====================
  const checkPoints = [
    { x: bullet.x, y: bullet.y },                    // 当前位置
    { x: bullet.x + bullet.vx * 0.08, y: bullet.y + bullet.vy * 0.08 }, // 下一帧预测
    { x: bullet.x + bullet.vx * 0.16, y: bullet.y + bullet.vy * 0.16 }
  ];

  for (let point of checkPoints) {
    const tx = Math.floor(point.x);
    const ty = Math.floor(point.y);

    if (map[ty] && map[ty][tx] !== undefined) {
      const tile = map[ty][tx];
      if (tile === TILE_WALL || tile === TILE_COVER) {
        if (tile === TILE_COVER) {
          map[ty][tx] = 0;   // 破坏箱子
        }
        console.log('布尔运动子弹命中墙/箱子，立即消失');
        bullet.lifetime = 0;   // 强制生命周期结束
        return;
      }
    }
  }

  // ==================== 稳定追踪逻辑 ====================
  let dx = target.x - bullet.x;
  let dy = target.y - bullet.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;

  const desiredSpeed = CONFIG.bulletSpeed || 7.5;

  // 轻微随机扰动
  dx += (Math.random() - 0.5) * 1.1;
  dy += (Math.random() - 0.5) * 1.1;

  const newDist = Math.sqrt(dx * dx + dy * dy) || 1;

  bullet.vx = (dx / newDist) * desiredSpeed * 0.94;
  bullet.vy = (dy / newDist) * desiredSpeed * 0.94;
}

module.exports = {
  activate,
  update,
  processBullet,
  updateBullet
};