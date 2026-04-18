const {
  ACTION_DODGE,
  ACTION_IDLE,
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
  if (steps === 0) {
    return true;
  }

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

function findSafestCell(map, aiState, playerState) {
  let bestCell = { x: Math.round(aiState.x), y: Math.round(aiState.y) };
  let bestScore = -Infinity;

  for (let y = 1; y < map.length - 1; y += 1) {
    for (let x = 1; x < map[0].length - 1; x += 1) {
      if (map[y][x] === TILE_WALL || map[y][x] === TILE_COVER) {
        continue;
      }

      const cell = { x, y };
      const farScore = Math.abs(playerState.x - x) + Math.abs(playerState.y - y);
      const blockedBonus = hasLineOfSight(map, cell, playerState) ? 0 : 6;
      const score = farScore + blockedBonus;
      if (score > bestScore) {
        bestScore = score;
        bestCell = cell;
      }
    }
  }

  return bestCell;
}

function predictIncomingBullet(aiState, bullets) {
  let closestThreat = null;
  let closestDistance = Infinity;

  for (let i = 0; i < bullets.length; i += 1) {
    const bullet = bullets[i];
    if (bullet.ownerId === aiState.id) {
      continue;
    }

    // 更精确的子弹轨迹预测
    const predictionTime = 0.4;
    const futureX = bullet.x + bullet.vx * predictionTime;
    const futureY = bullet.y + bullet.vy * predictionTime;

    // 计算子弹到AI的距离
    const distance = distanceSq(aiState, { x: futureX, y: futureY });

    // 检查子弹是否在AI的移动路径上
    const dx = futureX - aiState.x;
    const dy = futureY - aiState.y;
    const bulletSpeed = Math.sqrt(bullet.vx * bullet.vx + bullet.vy * bullet.vy);
    const aiToBulletDist = Math.sqrt(dx * dx + dy * dy);
    const timeToImpact = aiToBulletDist / bulletSpeed;

    // 只考虑即将击中的子弹
    if (timeToImpact < 0.5 && distance < closestDistance) {
      closestThreat = bullet;
      closestDistance = distance;
    }
  }
  return closestThreat;
}

/**
 * 结合视线检测、闪避和寻路，产出 AI 当前帧指令。
 * @param {import('../constants').EntityState} aiState
 * @param {import('../constants').EntityState} playerState
 * @param {Array<{x:number,y:number,vx:number,vy:number,ownerId:string}>} bullets
 * @param {import('../constants').MapGrid} map
 * @returns {{type:string, moveX:number, moveY:number, shoot:boolean, target?:{x:number,y:number}}}
 */
function tickBehaviorTree(aiState, playerState, bullets, map) {
  const threat = predictIncomingBullet(aiState, bullets);
  if (threat) {
    // 更智能的闪避方向，考虑移动到掩体后面
    const dodgeVector = normalize(-threat.vy, threat.vx);

    // 尝试找到掩体方向
    let bestDodge = dodgeVector;
    let bestCoverScore = -Infinity;

    DIRECTIONS.forEach(dir => {
      const testX = aiState.x + dir.x * 2;
      const testY = aiState.y + dir.y * 2;
      const tileX = Math.round(testX);
      const tileY = Math.round(testY);

      if (map[tileY] && (map[tileY][tileX] === TILE_COVER || map[tileY][tileX] === TILE_WALL)) {
        const coverScore = 10 - distanceSq({ x: testX, y: testY }, playerState);
        if (coverScore > bestCoverScore) {
          bestCoverScore = coverScore;
          bestDodge = dir;
        }
      }
    });

    return {
      type: ACTION_DODGE,
      moveX: bestDodge.x,
      moveY: bestDodge.y,
      shoot: false,
    };
  }

  const canSeePlayer = hasLineOfSight(map, aiState, playerState);
  const lowHp = aiState.hp <= aiState.maxHp * 0.35;
  const ammoLow = aiState.ammo <= 2;

  // 智能射击决策
  if (canSeePlayer && aiState.ammo > 0) {
    // 计算与玩家的距离
    const distance = Math.sqrt(distanceSq(aiState, playerState));

    // 近距离优先射击
    if (distance < 8 || (!ammoLow && distance < 15)) {
      const attackVector = normalize(playerState.x - aiState.x, playerState.y - aiState.y);
      return {
        type: ACTION_SHOOT,
        moveX: attackVector.x * 0.35,
        moveY: attackVector.y * 0.35,
        shoot: true,
        target: { x: playerState.x, y: playerState.y },
      };
    }
  }

  // 计算与玩家的距离
  const distanceToPlayer = Math.sqrt(distanceSq(aiState, playerState));
  const safeDistance = 5; // 保持5个子弹的距离，离玩家更远一些

  // 智能移动策略
  let targetCell;
  if (lowHp) {
    // 低血量时寻找掩体
    targetCell = findSafestCell(map, aiState, playerState);
  } else if (ammoLow) {
    // 低弹药时寻找安全位置，等待 reload
    targetCell = findSafestCell(map, aiState, playerState);
  } else if (!canSeePlayer) {
    // 看不到玩家时，向玩家位置移动
    targetCell = {
      x: Math.round(playerState.x),
      y: Math.round(playerState.y),
    };
  } else if (distanceToPlayer < safeDistance) {
    // 距离玩家太近时，寻找安全位置保持距离
    targetCell = findSafestCell(map, aiState, playerState);
  } else {
    // 能看到玩家且距离合适时，寻找更好的射击位置
    targetCell = findOptimalShootingPosition(map, aiState, playerState);
  }

  const path = findShortestPath(map, aiState, targetCell);
  const nextStep = path[0];

  if (nextStep) {
    const moveVector = normalize(nextStep.x - aiState.x, nextStep.y - aiState.y);
    return {
      type: ACTION_MOVE,
      moveX: moveVector.x,
      moveY: moveVector.y,
      shoot: canSeePlayer && aiState.ammo > 0,
      target: nextStep,
    };
  }

  // 随机移动作为 fallback
  const fallback = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
  return {
    type: ACTION_IDLE,
    moveX: fallback.x * 0.1,
    moveY: fallback.y * 0.1,
    shoot: false,
  };
}

/**
 * 寻找最佳射击位置
 * @param {MapGrid} map
 * @param {EntityState} aiState
 * @param {EntityState} playerState
 * @returns {GridPosition}
 */
function findOptimalShootingPosition(map, aiState, playerState) {
  let bestCell = { x: Math.round(aiState.x), y: Math.round(aiState.y) };
  let bestScore = -Infinity;

  for (let y = 1; y < map.length - 1; y += 1) {
    for (let x = 1; x < map[0].length - 1; x += 1) {
      if (map[y][x] === TILE_WALL || map[y][x] === TILE_COVER) {
        continue;
      }

      const cell = { x, y };
      const hasLOS = hasLineOfSight(map, cell, playerState);
      const distance = Math.sqrt(distanceSq(cell, playerState));
      const distanceScore = Math.max(0, 10 - distance); // 中等距离最佳
      const coverBonus = hasCoverNearby(map, cell) ? 5 : 0;
      const score = (hasLOS ? 10 : 0) + distanceScore + coverBonus;

      if (score > bestScore) {
        bestScore = score;
        bestCell = cell;
      }
    }
  }

  return bestCell;
}

/**
 * 检查附近是否有掩体
 * @param {MapGrid} map
 * @param {GridPosition} position
 * @returns {boolean}
 */
function hasCoverNearby(map, position) {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;

      const tileX = Math.round(position.x + dx);
      const tileY = Math.round(position.y + dy);
      if (map[tileY] && (map[tileY][tileX] === TILE_COVER || map[tileY][tileX] === TILE_WALL)) {
        return true;
      }
    }
  }
  return false;
}

module.exports = {
  tickBehaviorTree,
  hasLineOfSight,
};
