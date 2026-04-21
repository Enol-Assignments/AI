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
} = require('../constants');
const { findShortestPath } = require('./pathfinding');

const MODE_APPROACH = 'approach';
const MODE_HOLD = 'hold';
const MODE_RETREAT = 'retreat';
const MODE_DODGE = 'dodge';

const MODE_LOCK_TIME = 0.18;
const REPATH_INTERVAL = 0.22;
const TARGET_EPSILON = 0.32;
const CELL_EPSILON = 0.18;

function distanceSq(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function normalize(x, y) {
  const length = Math.sqrt(x * x + y * y) || 1;
  return { x: x / length, y: y / length };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

function isNear(a, b, epsilon) {
  return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;
}

function sameCell(a, b) {
  return Boolean(a && b && a.x === b.x && a.y === b.y);
}

function ensureAiMemory(aiState) {
  if (!aiState.aiMemory) {
    aiState.aiMemory = {
      mode: MODE_APPROACH,
      lockTimer: 0,
      repathTimer: 0,
      targetCell: null,
      path: [],
      dodgeVector: { x: 0, y: 0 },
      strafeSign: Math.random() > 0.5 ? 1 : -1,
    };
  }
  return aiState.aiMemory;
}

function updateMemoryTimers(memory) {
  const dt = CONFIG.tickMs / 1000;
  memory.lockTimer = Math.max(0, (memory.lockTimer || 0) - dt);
  memory.repathTimer = Math.max(0, (memory.repathTimer || 0) - dt);
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

function getSkillProfile(aiState) {
  switch (aiState.activeSkill) {
    case SKILL_PING_PONG:
      return { idealMin: 4.5, idealMax: 8.5 };
    case SKILL_BOOLEAN_MOTION:
      return { idealMin: 3.5, idealMax: 7.2 };
    case SKILL_ALGORITHMIC_DAMAGE:
      return { idealMin: 3.2, idealMax: 6.8 };
    default:
      return { idealMin: 3.8, idealMax: 7.5 };
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
      const blockedBonus = hasLineOfSight(map, cell, playerState) ? 0 : 6;
      const moveCost = Math.sqrt(distanceSq(cell, aiState)) * 0.18;
      const score = farScore + blockedBonus - moveCost;

      if (score > bestScore) {
        bestScore = score;
        bestCell = cell;
      }
    }
  }

  return bestCell;
}

function findApproachCell(map, aiState, playerState, skillProfile) {
  let bestCell = toGrid(aiState);
  let bestScore = -Infinity;

  for (let y = 1; y < map.length - 1; y += 1) {
    for (let x = 1; x < map[0].length - 1; x += 1) {
      if (!isWalkable(map, x, y)) {
        continue;
      }

      const cell = { x, y };
      const distance = Math.sqrt(distanceSq(cell, playerState));
      const losBonus = hasLineOfSight(map, cell, playerState) ? 7 : 0;
      const rangePenalty = Math.abs(distance - skillProfile.idealMax);
      const moveCost = Math.sqrt(distanceSq(cell, aiState)) * 0.12;
      const score = losBonus - rangePenalty - moveCost;

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
  let closestScore = Infinity;

  for (let i = 0; i < bullets.length; i += 1) {
    const bullet = bullets[i];
    if (bullet.ownerId === aiState.id) {
      continue;
    }

    const toAiX = aiState.x - bullet.x;
    const toAiY = aiState.y - bullet.y;
    const bulletSpeedSq = bullet.vx * bullet.vx + bullet.vy * bullet.vy;
    if (bulletSpeedSq <= 0.0001) {
      continue;
    }

    const projection = (toAiX * bullet.vx + toAiY * bullet.vy) / bulletSpeedSq;
    if (projection < 0 || projection > 0.45) {
      continue;
    }

    const closestPoint = {
      x: bullet.x + bullet.vx * projection,
      y: bullet.y + bullet.vy * projection,
    };
    const nearDistanceSq = distanceSq(aiState, closestPoint);
    const bulletRadius = bullet.radius || CONFIG.bulletRadius;
    const hitRadius = aiState.radius + bulletRadius + 0.18;
    if (nearDistanceSq > hitRadius * hitRadius) {
      continue;
    }

    if (projection < closestScore) {
      closestScore = projection;
      closestThreat = bullet;
    }
  }

  return closestThreat;
}

function chooseMode(aiState, playerState, map, bullets, memory) {
  const skillProfile = getSkillProfile(aiState);
  const threat = predictIncomingBullet(aiState, bullets);
  if (threat) {
    return { mode: MODE_DODGE, threat, skillProfile };
  }

  const canSeePlayer = hasLineOfSight(map, aiState, playerState);
  const distance = Math.sqrt(distanceSq(aiState, playerState));
  const lowHp = aiState.hp <= aiState.maxHp * 0.3;
  const lowAmmo = aiState.ammo <= 1;

  if (memory.lockTimer > 0 && memory.mode !== MODE_DODGE) {
    return { mode: memory.mode, canSeePlayer, distance, skillProfile, lowHp, lowAmmo };
  }

  if (lowHp || lowAmmo || distance < skillProfile.idealMin - 0.5) {
    return { mode: MODE_RETREAT, canSeePlayer, distance, skillProfile, lowHp, lowAmmo };
  }

  if (canSeePlayer && distance <= skillProfile.idealMax + 0.3) {
    return { mode: MODE_HOLD, canSeePlayer, distance, skillProfile, lowHp, lowAmmo };
  }

  return { mode: MODE_APPROACH, canSeePlayer, distance, skillProfile, lowHp, lowAmmo };
}

function chooseDodgeVector(aiState, playerState, threat, map, memory) {
  const lateralOptions = [
    normalize(-threat.vy, threat.vx),
    normalize(threat.vy, -threat.vx),
  ];
  let bestVector = lateralOptions[0];
  let bestScore = -Infinity;

  lateralOptions.forEach((vector) => {
    const probe = {
      x: aiState.x + vector.x * 1.2,
      y: aiState.y + vector.y * 1.2,
    };
    const probeCell = toGrid(probe);
    if (!isWalkable(map, probeCell.x, probeCell.y)) {
      return;
    }

    const coverBonus = hasLineOfSight(map, probe, playerState) ? 0 : 4;
    const spacingBonus = Math.sqrt(distanceSq(probe, playerState));
    const score = coverBonus + spacingBonus;
    if (score > bestScore) {
      bestScore = score;
      bestVector = vector;
    }
  });

  memory.dodgeVector = bestVector;
  memory.mode = MODE_DODGE;
  memory.lockTimer = 0.12;
  return bestVector;
}

function updatePathIfNeeded(map, aiState, targetCell, memory) {
  if (!targetCell) {
    memory.targetCell = null;
    memory.path = [];
    return;
  }

  const currentCell = toGrid(aiState);
  const needsNewPath = !sameCell(memory.targetCell, targetCell)
    || memory.repathTimer <= 0
    || !memory.path
    || memory.path.length === 0;

  if (!needsNewPath) {
    return;
  }

  memory.targetCell = targetCell;
  memory.path = findShortestPath(map, currentCell, targetCell);
  memory.repathTimer = REPATH_INTERVAL;
}

function consumeReachedSteps(aiState, memory) {
  while (memory.path && memory.path.length > 0 && isNear(aiState, memory.path[0], CELL_EPSILON)) {
    memory.path.shift();
  }
}

function buildMoveCommand(mode, moveVector, target, memory) {
  memory.mode = mode;
  memory.lockTimer = MODE_LOCK_TIME;
  return {
    type: ACTION_MOVE,
    moveX: moveVector.x,
    moveY: moveVector.y,
    shoot: false,
    target,
  };
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
  const memory = ensureAiMemory(aiState);
  updateMemoryTimers(memory);

  const decision = chooseMode(aiState, playerState, map, bullets, memory);
  const canShoot = aiState.ammo > 0 && aiState.fireCooldown <= 0;

  if (decision.mode === MODE_DODGE) {
    const dodgeVector = chooseDodgeVector(aiState, playerState, decision.threat, map, memory);
    return {
      type: ACTION_DODGE,
      moveX: clamp(dodgeVector.x, -1, 1),
      moveY: clamp(dodgeVector.y, -1, 1),
      shoot: false,
      target: { x: playerState.x, y: playerState.y },
    };
  }

  if (decision.mode === MODE_HOLD) {
    memory.path = [];
    memory.targetCell = null;
    memory.mode = MODE_HOLD;
    memory.lockTimer = MODE_LOCK_TIME;

    const attackVector = normalize(playerState.x - aiState.x, playerState.y - aiState.y);
    const strafeVector = {
      x: -attackVector.y * memory.strafeSign * 0.12,
      y: attackVector.x * memory.strafeSign * 0.12,
    };
    const probe = { x: aiState.x + strafeVector.x, y: aiState.y + strafeVector.y };
    const probeCell = toGrid(probe);
    const canStrafe = isWalkable(map, probeCell.x, probeCell.y);

    return {
      type: canShoot ? ACTION_SHOOT : ACTION_IDLE,
      moveX: canStrafe ? strafeVector.x : 0,
      moveY: canStrafe ? strafeVector.y : 0,
      shoot: canShoot,
      target: { x: playerState.x, y: playerState.y },
    };
  }

  const targetCell = decision.mode === MODE_RETREAT
    ? findSafestCell(map, aiState, playerState)
    : findApproachCell(map, aiState, playerState, decision.skillProfile);

  updatePathIfNeeded(map, aiState, targetCell, memory);
  consumeReachedSteps(aiState, memory);

  const nextStep = memory.path && memory.path[0];
  if (nextStep && !isNear(aiState, nextStep, TARGET_EPSILON)) {
    const moveVector = normalize(nextStep.x - aiState.x, nextStep.y - aiState.y);
    return buildMoveCommand(
      decision.mode,
      moveVector,
      { x: playerState.x, y: playerState.y },
      memory
    );
  }

  memory.path = [];
  memory.targetCell = null;
  memory.mode = decision.mode;
  memory.lockTimer = MODE_LOCK_TIME;
  return {
    type: ACTION_IDLE,
    moveX: 0,
    moveY: 0,
    shoot: canShoot && Boolean(decision.canSeePlayer),
    target: { x: playerState.x, y: playerState.y },
  };
}

module.exports = {
  tickBehaviorTree,
  hasLineOfSight,
};
