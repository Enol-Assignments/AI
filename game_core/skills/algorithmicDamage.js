/**
 * 算法伤害技能
 * 随机抽取三个0-9的数字进行乘法运算，结果为下一发子弹的攻击力
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
  entity.skillData.algorithmicDamage = {
    active: true
  };

  // 清除之前的伤害数值显示
  entity.algorithmicDamageValue = null;
  entity.algorithmicDamageNumbers = null;

  console.log('算法伤害技能激活，每次发射都会生成新的伤害数值');
  return true;
}

/**
 * 更新技能状态
 * @param {EntityState} entity
 * @param {number} dt
 */
function update(entity, dt) {
  // 算法伤害技能是一次性的，不需要持续更新
}

/**
 * 处理子弹逻辑
 * @param {EntityState} entity
 * @param {Object} bullet
 * @param {GameState} gameState
 */
function processBullet(entity, bullet, gameState) {
  const skillData = entity.skillData.algorithmicDamage;
  if (skillData && skillData.active) {
    // 每次发射都生成新的三个0-9的随机数
    const num1 = Math.floor(Math.random() * 10);
    const num2 = Math.floor(Math.random() * 10);
    const num3 = Math.floor(Math.random() * 10);

    // 计算乘积
    const damage = num1 * num2 * num3;

    // 修改子弹伤害
    bullet.damage = damage;
    bullet.skillEffect = 'algorithmic_damage';

    // 存储伤害数值到实体，以便UI显示攻击后的值
    entity.algorithmicDamageValue = damage;
    entity.algorithmicDamageNumbers = [num1, num2, num3];

    console.log(`算法伤害技能生效，子弹伤害: ${damage} (${num1} × ${num2} × ${num3})`);
  }
}

module.exports = {
  activate,
  update,
  processBullet
};
