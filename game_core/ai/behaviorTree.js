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
  for (let i = 0; i < bullets.length; i += 1) {
    const bullet = bullets[i];
    if (bullet.ownerId === aiState.id) {
      continue;
    }

    const futureX = bullet.x + bullet.vx * 0.35;
    const futureY = bullet.y + bullet.vy * 0.35;
    const nearNow = distanceSq(aiState, bullet) < 2.4;
    const nearSoon = distanceSq(aiState, { x: futureX, y: futureY }) < 1.3;
    if (nearNow || nearSoon) {
      return bullet;
    }
  }
  return null;
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
    const dodgeVector = normalize(-threat.vy, threat.vx);
    return {
      type: ACTION_DODGE,
      moveX: dodgeVector.x,
      moveY: dodgeVector.y,
      shoot: false,
    };
  }

  const canSeePlayer = hasLineOfSight(map, aiState, playerState);
  const lowHp = aiState.hp <= aiState.maxHp * 0.35;

  if (canSeePlayer && aiState.ammo > 0) {
    const attackVector = normalize(playerState.x - aiState.x, playerState.y - aiState.y);
    return {
      type: ACTION_SHOOT,
      moveX: attackVector.x * 0.35,
      moveY: attackVector.y * 0.35,
      shoot: true,
      target: { x: playerState.x, y: playerState.y },
    };
  }

  const targetCell = lowHp ? findSafestCell(map, aiState, playerState) : {
    x: Math.round(playerState.x),
    y: Math.round(playerState.y),
  };
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

  const fallback = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
  return {
    type: ACTION_IDLE,
    moveX: fallback.x * 0.1,
    moveY: fallback.y * 0.1,
    shoot: false,
  };
}

module.exports = {
  tickBehaviorTree,
  hasLineOfSight,
};
