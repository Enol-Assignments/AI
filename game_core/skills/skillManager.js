const {
  SKILL_ALGORITHMIC_DAMAGE,
  SKILL_TIME_TRAVEL,
  SKILL_PING_PONG,
  SKILL_BOOLEAN_MOTION,
  CONFIG,
} = require('../constants');

// 导入各个技能的实现
const algorithmicDamageSkill = require('./algorithmicDamage');
const pingPongSkill = require('./pingPong');
const booleanMotionSkill = require('./booleanMotion');

// 技能实现映射
const skillImplementations = {
  [SKILL_ALGORITHMIC_DAMAGE]: algorithmicDamageSkill,
  [SKILL_PING_PONG]: pingPongSkill,
  [SKILL_BOOLEAN_MOTION]: booleanMotionSkill,
};

/**
 * 初始化实体的技能系统
 * @param {EntityState} entity
 */
function initSkills(entity) {
  entity.activeSkill = null;
  entity.skillCooldown = 0;
  entity.skillData = {};
  entity.timeTravelClone = null;
}

/**
 * 更新技能状态
 * @param {EntityState} entity
 * @param {number} dt
 */
function updateSkills(entity, dt) {
  // 更新技能冷却
  if (entity.skillCooldown > 0) {
    entity.skillCooldown = Math.max(0, entity.skillCooldown - dt);
  }

  // 如果有激活的技能，更新技能状态
  if (entity.activeSkill && skillImplementations[entity.activeSkill]) {
    const skillImpl = skillImplementations[entity.activeSkill];
    if (skillImpl.update) {
      skillImpl.update(entity, dt);
    }
  }


}

/**
 * 触发技能
 * @param {EntityState} entity
 * @param {string} skillType
 * @param {GameState} gameState
 * @param {Object} target
 * @returns {boolean} 是否成功触发
 */
function activateSkill(entity, skillType, gameState, target) {
  // 检查技能是否存在
  if (!skillImplementations[skillType]) {
    return false;
  }

  // 检查技能冷却
  if (entity.skillCooldown > 0) {
    return false;
  }

  // 检查是否已经有激活的技能
  if (entity.activeSkill && entity.activeSkill !== skillType) {
    return false;
  }

  const skillImpl = skillImplementations[skillType];
  const skillConfig = CONFIG.skills[skillType];

  // 触发技能
  if (skillImpl.activate(entity, gameState, target)) {
    entity.activeSkill = skillType;
    entity.skillCooldown = skillConfig.cooldown;
    return true;
  }

  return false;
}

/**
 * 处理技能相关的子弹逻辑
 * @param {EntityState} entity
 * @param {Object} bullet
 * @param {GameState} gameState
 */
function processSkillBullet(entity, bullet, gameState) {
  if (entity.activeSkill && skillImplementations[entity.activeSkill]) {
    const skillImpl = skillImplementations[entity.activeSkill];
    if (skillImpl.processBullet) {
      skillImpl.processBullet(entity, bullet, gameState);
    }
  }
}

/**
 * 重置技能状态
 * @param {EntityState} entity
 */
function resetSkills(entity) {
  initSkills(entity);
}

module.exports = {
  initSkills,
  updateSkills,
  activateSkill,
  processSkillBullet,
  resetSkills,
};
