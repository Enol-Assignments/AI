/**
 * 时间穿越技能
 * 开局召唤一个随机血量的无敌分身，当本体血量掉到与分身一样时则本体消失
 */

/**
 * 激活技能
 * @param {EntityState} entity
 * @param {GameState} gameState
 * @param {Object} target
 * @returns {boolean} 是否成功激活
 */
function activate(entity, gameState, target) {
  // 生成随机血量（50-100之间）
  const cloneHp = 50 + Math.floor(Math.random() * 51);

  // 创建分身
  entity.timeTravelClone = {
    x: entity.x,
    y: entity.y,
    hp: cloneHp,
    maxHp: cloneHp,
    radius: entity.radius,
    color: entity.color + '80', // 半透明效果
    invincible: true,
    active: true
  };

  // 存储技能数据
  entity.skillData.timeTravel = {
    cloneHp: cloneHp,
    active: true
  };

  console.log(`时间穿越技能激活，召唤血量为 ${cloneHp} 的分身`);
  return true;
}

/**
 * 更新技能状态
 * @param {EntityState} entity
 * @param {number} dt
 */
function update(entity, dt) {
  // 时间穿越技能主要通过updateClone函数处理
}

/**
 * 更新分身状态
 * @param {EntityState} entity
 */
function updateClone(entity) {
  if (!entity.timeTravelClone || !entity.skillData.timeTravel) {
    return;
  }

  // 检查本体血量是否低于或等于分身血量
  if (entity.hp <= entity.timeTravelClone.hp) {
    // 本体消失，切换到分身
    entity.hp = entity.timeTravelClone.hp;
    entity.timeTravelClone = null;
    entity.activeSkill = null;

    console.log('时间穿越技能生效，本体消失，切换到分身');
  }
}

/**
 * 处理子弹逻辑
 * @param {EntityState} entity
 * @param {Object} bullet
 * @param {GameState} gameState
 */
function processBullet(entity, bullet, gameState) {
  // 时间穿越技能不直接影响子弹
}

module.exports = {
  activate,
  update,
  updateClone,
  processBullet
};
