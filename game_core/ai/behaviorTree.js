const {
  ACTION_DODGE,
  ACTION_IDLE,
  ACTION_MOVE,
  ACTION_SHOOT,
  CONFIG,
  SKILL_ALGORITHMIC_DAMAGE,
  SKILL_BOOLEAN_MOTION,
  SKILL_PING_PONG,
  TILE_COVER,
  TILE_WALL,
  DIRECTIONS,
} = require('../constants');
const { findShortestPath } = require('./pathfinding');

const REPATH_INTERVAL = 0.12;
const PATH_STEP_EPSILON = 0.2;

function distanceSq(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function normalize(x, y) {
  const length = Math.sqrt(x * x + y * y) || 1;
  return { x: x / length, y: y / length };
}

function toGrid(position) {
  return {
    x: Math.round(position.x),
    y: Math.round(position.y),
  };
}

function isWalkable(map, x, y) {
  return map[y] && map[y][x] !== undefined && map[y][x] !== TILE_WALL && map[y][x] !== TILE_COVER;
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

function findCoverOnSightLine(map, from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy)) * 8;
  if (steps === 0) {
    return null;
  }

  for (let i = 1; i <= steps; i += 1) {
    const x = from.x + (dx * i) / steps;
    const y = from.y + (dy * i) / steps;
    const tileX = Math.round(x);
    const tileY = Math.round(y);
    const tile = map[tileY] && map[tileY][tileX];
    if (tile === TILE_COVER) {
      return { x: tileX, y: tileY };
    }
    if (tile === TILE_WALL) {
      return null;
    }
  }

  return null;
}

function ensureAiMemory(aiState) {
  if (!aiState.aiMemory) {
    aiState.aiMemory = {
      repathTimer: 0,
      targetCell: null,
      path: [],
      strafeSign: Math.random() > 0.5 ? 1 : -1,
    };
  }
  return aiState.aiMemory;
}

function getSkillProfile(aiState) {
  switch (aiState.activeSkill) {
    case SKILL_PING_PONG:
      return { preferredMin: 4.8, preferredMax: 9.5, shootRange: 10.5 };
    case SKILL_BOOLEAN_MOTION:
      return { preferredMin: 3.4, preferredMax: 7.4, shootRange: 11.5 };
    case SKILL_ALGORITHMIC_DAMAGE:
      return { preferredMin: 2.8, preferredMax: 6.2, shootRange: 9.2 };
    default:
      return { preferredMin: 3.2, preferredMax: 7.8, shootRange: 10 };
  }
}

function findSafestCell(map, aiState, playerState) {
  let bestCell = toGrid(aiState);
  let bestScore = -Infinity;

  for (let y = 1; y < map.length - 1; y += 1) {
    for (let x = 1; x < map[0].length - 1; x += 1) {
      if (!isWalkable(map, x, y)) {
        continue;
      }

      const cell = { x, y };
      const farScore = Math.abs(playerState.x - x) + Math.abs(playerState.y - y);
      const blockedBonus = hasLineOfSight(map, cell, playerState) ? 0 : 8;
      const movePenalty = Math.sqrt(distanceSq(cell, aiState)) * 0.15;
      const score = farScore + blockedBonus - movePenalty;
      if (score > bestScore) {
        bestScore = score;
        bestCell = cell;
      }
    }
  }

  return bestCell;
}

function findPressureCell(map, aiState, playerState, profile) {
  const playerGrid = toGrid(playerState);
  let bestCell = playerGrid;
  let bestScore = -Infinity;

  for (let y = Math.max(1, playerGrid.y - 7); y <= Math.min(map.length - 2, playerGrid.y + 7); y += 1) {
    for (let x = Math.max(1, playerGrid.x - 7); x <= Math.min(map[0].length - 2, playerGrid.x + 7); x += 1) {
      if (!isWalkable(map, x, y)) {
        continue;
      }

      const cell = { x, y };
      const distance = Math.sqrt(distanceSq(cell, playerState));
      const rangePenalty = Math.abs(distance - profile.preferredMax);
      const losBonus = hasLineOfSight(map, cell, playerState) ? 10 : 0;
      const coverBonus = hasAdjacentCover(map, cell) ? 2.5 : 0;
      const movePenalty = Math.sqrt(distanceSq(cell, aiState)) * 0.1;
      const score = losBonus + coverBonus - rangePenalty - movePenalty;
      if (score > bestScore) {
        bestScore = score;
        bestCell = cell;
      }
    }
  }

  return bestCell;
}

function hasAdjacentCover(map, position) {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }

      const x = position.x + dx;
      const y = position.y + dy;
      if (map[y] && (map[y][x] === TILE_WALL || map[y][x] === TILE_COVER)) {
        return true;
      }
    }
  }
  return false;
}

function predictIncomingBullet(aiState, bullets) {
  let closestThreat = null;
  let closestDistance = Infinity;

  for (let i = 0; i < bullets.length; i += 1) {
    const bullet = bullets[i];
    if (bullet.ownerId === aiState.id) {
      continue;
    }

    const futureX = bullet.x + bullet.vx * 0.35;
    const futureY = bullet.y + bullet.vy * 0.35;
    const nearNow = distanceSq(aiState, bullet) < 2.2;
    const nearSoon = distanceSq(aiState, { x: futureX, y: futureY }) < 1.2;
    const distance = Math.min(distanceSq(aiState, bullet), distanceSq(aiState, { x: futureX, y: futureY }));

    if ((nearNow || nearSoon) && distance < closestDistance) {
      closestThreat = bullet;
      closestDistance = distance;
    }
  }

  return closestThreat;
}

function chooseDodgeVector(aiState, playerState, threat, map, memory) {
  const candidates = [
    normalize(-threat.vy, threat.vx),
    normalize(threat.vy, -threat.vx),
  ];

  let bestVector = candidates[0];
  let bestScore = -Infinity;

  candidates.forEach((vector) => {
    const probe = { x: aiState.x + vector.x * 1.4, y: aiState.y + vector.y * 1.4 };
    const probeGrid = toGrid(probe);
    if (!isWalkable(map, probeGrid.x, probeGrid.y)) {
      return;
    }

    const coverBonus = hasLineOfSight(map, probe, playerState) ? 0 : 5;
    const spacingBonus = Math.sqrt(distanceSq(probe, playerState));
    const score = coverBonus + spacingBonus;
    if (score > bestScore) {
      bestScore = score;
      bestVector = vector;
    }
  });

  memory.strafeSign *= -1;
  return bestVector;
}

function updatePath(memory, map, aiState, targetCell) {
  memory.repathTimer = Math.max(0, memory.repathTimer - CONFIG.tickMs / 1000);

  const currentCell = toGrid(aiState);
  const shouldRepath = !memory.targetCell
    || memory.targetCell.x !== targetCell.x
    || memory.targetCell.y !== targetCell.y
    || memory.repathTimer <= 0
    || !memory.path
    || memory.path.length === 0;

  if (shouldRepath) {
    memory.targetCell = targetCell;
    memory.path = findShortestPath(map, currentCell, targetCell);
    memory.repathTimer = REPATH_INTERVAL;
  }

  while (memory.path && memory.path.length > 0) {
    const next = memory.path[0];
    if (Math.abs(aiState.x - next.x) <= PATH_STEP_EPSILON && Math.abs(aiState.y - next.y) <= PATH_STEP_EPSILON) {
      memory.path.shift();
    } else {
      break;
    }
  }

  return memory.path && memory.path[0];
}

function getFallbackPath(memory, map, aiState, playerState, lowHp) {
  const directTarget = lowHp ? findSafestCell(map, aiState, playerState) : toGrid(playerState);
  memory.targetCell = directTarget;
  memory.path = findShortestPath(map, toGrid(aiState), directTarget);
  memory.repathTimer = REPATH_INTERVAL;
  return memory.path && memory.path[0];
}

function buildMoveCommand(moveVector, playerState) {
  return {
    type: ACTION_MOVE,
    moveX: moveVector.x,
    moveY: moveVector.y,
    shoot: false,
    target: { x: playerState.x, y: playerState.y },
  };
}

function buildShootCommand(target, moveX, moveY) {
  return {
    type: ACTION_SHOOT,
    moveX,
    moveY,
    shoot: true,
    target,
  };
}

/**
 * 更偏进攻型的 AI：看不到玩家就追踪，近距离才撤，保留少量技能适配。
 * @param {import('../constants').EntityState} aiState
 * @param {import('../constants').EntityState} playerState
 * @param {Array<{x:number,y:number,vx:number,vy:number,ownerId:string}>} bullets
 * @param {import('../constants').MapGrid} map
 * @returns {{type:string, moveX:number, moveY:number, shoot:boolean, target?:{x:number,y:number}}}
 */
function tickBehaviorTree(aiState, playerState, bullets, map) {
  const memory = ensureAiMemory(aiState);
  const profile = getSkillProfile(aiState);
  const threat = predictIncomingBullet(aiState, bullets);
  if (threat) {
    const dodgeVector = chooseDodgeVector(aiState, playerState, threat, map, memory);
    return {
      type: ACTION_DODGE,
      moveX: dodgeVector.x,
      moveY: dodgeVector.y,
      shoot: false,
      target: { x: playerState.x, y: playerState.y },
    };
  }

  const canSeePlayer = hasLineOfSight(map, aiState, playerState);
  const coverTarget = canSeePlayer ? null : findCoverOnSightLine(map, aiState, playerState);
  const distance = Math.sqrt(distanceSq(aiState, playerState));
  const lowHp = aiState.hp <= aiState.maxHp * 0.28;
  const lowAmmo = aiState.ammo <= 1;
  const canShoot = aiState.ammo > 0 && aiState.fireCooldown <= 0;

  if (canSeePlayer && canShoot && distance <= profile.shootRange) {
    const towardPlayer = normalize(playerState.x - aiState.x, playerState.y - aiState.y);
    let moveX = towardPlayer.x * 0.18;
    let moveY = towardPlayer.y * 0.18;

    if (distance < profile.preferredMin) {
      moveX = -towardPlayer.x * 0.28;
      moveY = -towardPlayer.y * 0.28;
    } else if (distance >= profile.preferredMax - 0.8) {
      moveX = towardPlayer.x * 0.3;
      moveY = towardPlayer.y * 0.3;
    } else {
      moveX = -towardPlayer.y * memory.strafeSign * 0.22;
      moveY = towardPlayer.x * memory.strafeSign * 0.22;
    }

    return buildShootCommand({ x: playerState.x, y: playerState.y }, moveX, moveY);
  }

  if (coverTarget && canShoot && distance <= profile.shootRange + 1.5) {
    const towardCover = normalize(coverTarget.x - aiState.x, coverTarget.y - aiState.y);
    return buildShootCommand(
      { x: coverTarget.x, y: coverTarget.y },
      towardCover.x * 0.18,
      towardCover.y * 0.18
    );
  }

  let targetCell;
  if (lowHp || (lowAmmo && distance < profile.preferredMax + 1.5)) {
    targetCell = findSafestCell(map, aiState, playerState);
  } else if (!canSeePlayer) {
    targetCell = toGrid(playerState);
  } else if (distance < profile.preferredMin) {
    targetCell = findSafestCell(map, aiState, playerState);
  } else {
    targetCell = findPressureCell(map, aiState, playerState, profile);
  }

  let nextStep = updatePath(memory, map, aiState, targetCell);
  if (!nextStep) {
    nextStep = getFallbackPath(memory, map, aiState, playerState, lowHp);
  }
  if (nextStep) {
    const moveVector = normalize(nextStep.x - aiState.x, nextStep.y - aiState.y);
    return buildMoveCommand(moveVector, playerState);
  }

  const fallback = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
  return {
    type: ACTION_IDLE,
    moveX: fallback.x * 0.15,
    moveY: fallback.y * 0.15,
    shoot: false,
    target: { x: playerState.x, y: playerState.y },
  };
}

module.exports = {
  tickBehaviorTree,
  hasLineOfSight,
};
