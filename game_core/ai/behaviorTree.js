const {
  ACTION_DODGE,
  ACTION_MOVE,
  ACTION_SHOOT,
  CONFIG,
  TILE_COVER,
  TILE_WALL,
  DIRECTIONS,
} = require('../constants');
const { findShortestPath } = require('./pathfinding');

function distanceSq(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function normalize(x, y) {
  const length = Math.sqrt(x * x + y * y) || 1;
  return { x: x / length, y: y / length };
}

function hasLineOfSight(map, from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy)) * 8;
  if (steps === 0) return true;

  for (let i = 1; i <= steps; i += 1) {
    const x = from.x + (dx * i) / steps;
    const y = from.y + (dy * i) / steps;
    const tileX = Math.round(x);
    const tileY = Math.round(y);
    if (map[tileY] && (map[tileY][tileX] === TILE_WALL || map[tileY][tileX] === TILE_COVER)) {
      return false;
    }
  }
  return true;
}

/**
 * AI 行为树 - 带寻路 + 防卡住版
 */
function tickBehaviorTree(aiState, playerState, bullets, map) {
  // 闪避优先（可选，暂时保留）
  // const threat = predictIncomingBullet(aiState, bullets);
  // if (threat) { ... }

  const canSeePlayer = hasLineOfSight(map, aiState, playerState);
  const lowHp = aiState.hp <= aiState.maxHp * 0.35;
  const ammoLow = aiState.ammo <= 2;

  // 射击决策
  if (canSeePlayer && aiState.ammo > 0) {
    const distance = Math.sqrt(distanceSq(aiState, playerState));
    if (distance < 10) {
      const attackVector = normalize(playerState.x - aiState.x, playerState.y - aiState.y);
      return {
        type: ACTION_SHOOT,
        moveX: attackVector.x * 0.4,
        moveY: attackVector.y * 0.4,
        shoot: true,
        target: playerState,
      };
    }
  }

  // ==================== 使用寻路 ====================
  let targetCell = lowHp || ammoLow 
    ? { x: Math.round(playerState.x), y: Math.round(playerState.y) }  // 简化，先直接追玩家
    : { x: Math.round(playerState.x), y: Math.round(playerState.y) };

  const path = findShortestPath(map, aiState, targetCell);

  let moveX = 0;
  let moveY = 0;

  if (path && path.length > 0) {
    const nextStep = path[0];
    const dx = nextStep.x - aiState.x;
    const dy = nextStep.y - aiState.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 0.1) {
      const vector = normalize(dx, dy);
      moveX = vector.x * Math.max(1.0, dist * 1.1);   // 保证有足够力度
      moveY = vector.y * Math.max(1.0, dist * 1.1);
    }
  }

  // 如果寻路失败或移动向量太小，直接朝玩家走
  if (Math.abs(moveX) < 0.4 && Math.abs(moveY) < 0.4) {
    const direct = normalize(playerState.x - aiState.x, playerState.y - aiState.y);
    moveX = direct.x * 1.15;
    moveY = direct.y * 1.15;
  }

  return {
    type: ACTION_MOVE,
    moveX: moveX,
    moveY: moveY,
    shoot: canSeePlayer && aiState.ammo > 0,
    target: playerState,
  };
}

module.exports = {
  tickBehaviorTree,
  hasLineOfSight,
};