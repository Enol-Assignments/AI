/**
 * 布尔运动技能
 * 发射小球随机运动，直到攻击到对手，不可反弹
 */

/**
 * 激活技能
 * @param {EntityState} entity
 * @param {GameState} gameState
 * @param {Object} target
 * @returns {boolean} 是否成功激活
 */
function activate(entity, gameState, target) {
  // 存储技能数据
  entity.skillData.booleanMotion = {
    active: true
  };

  console.log('布尔运动技能激活');
  return true;
}

/**
 * 更新技能状态
 * @param {EntityState} entity
 * @param {number} dt
 */
function update(entity, dt) {
  // 布尔运动技能主要通过processBullet和updateBullet函数处理
}

/**
 * 处理子弹逻辑
 * @param {EntityState} entity
 * @param {Object} bullet
 * @param {GameState} gameState
 */
function processBullet(entity, bullet, gameState) {
  // 标记子弹为布尔运动
  bullet.skillEffect = 'boolean_motion';
  
  // 直接朝向对方角色发射
  const target = entity.team === 'player' ? gameState.entities.enemy : gameState.entities.player;
  if (target) {
    const dx = target.x - bullet.x;
    const dy = target.y - bullet.y;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
    const speed = Math.sqrt(bullet.vx * bullet.vx + bullet.vy * bullet.vy);
    bullet.vx = (dx / distance) * speed;
    bullet.vy = (dy / distance) * speed;
  }

  console.log('布尔运动技能生效，发射穿墙子弹直接朝向对手');
}

/**
 * 更新布尔运动子弹
 * @param {Object} bullet
 * @param {number} dt
 * @param {GameState} gameState
 */
function updateBullet(bullet, dt, gameState) {
  if (bullet.skillEffect !== 'boolean_motion') {
    return;
  }

  // 持续朝向对方角色移动
  const target = bullet.ownerTeam === 'player' ? gameState.entities.enemy : gameState.entities.player;
  if (target) {
    const dx = target.x - bullet.x;
    const dy = target.y - bullet.y;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
    const speed = Math.sqrt(bullet.vx * bullet.vx + bullet.vy * bullet.vy);
    bullet.vx = (dx / distance) * speed;
    bullet.vy = (dy / distance) * speed;
  }
}

module.exports = {
  activate,
  update,
  processBullet,
  updateBullet
};
