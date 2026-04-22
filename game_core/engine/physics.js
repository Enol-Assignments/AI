const {
  ACTION_IDLE,
  CONFIG,
  TILE_COVER,
  TILE_WALL,
  TILE_EMPTY,
} = require('../constants');

const { processSkillBullet } = require('../skills/skillManager');
const { handleBounce, reflectAttack } = require('../skills/pingPong');
const { updateBullet } = require('../skills/booleanMotion');

const TILE_HALF_SIZE = 0.5;
const MOVE_STEP = 0.08;
const COLLISION_EPSILON = 1e-6;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalize(x, y) {
  const length = Math.sqrt(x * x + y * y) || 1;
  return { x: x / length, y: y / length };
}

function updateFacing(entity, command) {
  if (!command) {
    return;
  }

  const moveMagnitude = Math.sqrt((command.moveX || 0) * (command.moveX || 0) + (command.moveY || 0) * (command.moveY || 0));
  if (moveMagnitude > 0.08) {
    const vector = normalize(command.moveX, command.moveY);
    entity.facingX = vector.x;
    entity.facingY = vector.y;
    return;
  }

  if (command.shootVector) {
    const vector = normalize(command.shootVector.x, command.shootVector.y);
    entity.facingX = vector.x;
    entity.facingY = vector.y;
    return;
  }

  if (command.target) {
    const vector = normalize(command.target.x - entity.x, command.target.y - entity.y);
    entity.facingX = vector.x;
    entity.facingY = vector.y;
  }
}

function isSolidTile(map, tileX, tileY) {
  return Boolean(
    map[tileY]
      && (map[tileY][tileX] === TILE_WALL || map[tileY][tileX] === TILE_COVER)
  );
}

function getTileBounds(tileX, tileY) {
  return {
    left: tileX - TILE_HALF_SIZE,
    right: tileX + TILE_HALF_SIZE,
    top: tileY - TILE_HALF_SIZE,
    bottom: tileY + TILE_HALF_SIZE,
  };
}

function getNearbyTileRange(map, x, y, radius) {
  return {
    minTileX: Math.max(0, Math.floor(x - radius - TILE_HALF_SIZE)),
    maxTileX: Math.min(map[0].length - 1, Math.ceil(x + radius + TILE_HALF_SIZE)),
    minTileY: Math.max(0, Math.floor(y - radius - TILE_HALF_SIZE)),
    maxTileY: Math.min(map.length - 1, Math.ceil(y + radius + TILE_HALF_SIZE)),
  };
}

function getSeparationVector(x, y, radius, tileX, tileY) {
  const bounds = getTileBounds(tileX, tileY);
  const closestX = clamp(x, bounds.left, bounds.right);
  const closestY = clamp(y, bounds.top, bounds.bottom);
  const dx = x - closestX;
  const dy = y - closestY;
  const distanceSq = dx * dx + dy * dy;

  if (distanceSq >= radius * radius) {
    return null;
  }

  if (distanceSq > COLLISION_EPSILON) {
    const distance = Math.sqrt(distanceSq);
    const overlap = radius - distance;
    return {
      x: (dx / distance) * overlap,
      y: (dy / distance) * overlap,
    };
  }

  const options = [
    { x: (bounds.left - radius) - x, y: 0 },
    { x: (bounds.right + radius) - x, y: 0 },
    { x: 0, y: (bounds.top - radius) - y },
    { x: 0, y: (bounds.bottom + radius) - y },
  ];

  options.sort((a, b) => (Math.abs(a.x) + Math.abs(a.y)) - (Math.abs(b.x) + Math.abs(b.y)));
  return options[0];
}

function preferAxis(push, axis) {
  if (!axis) {
    return push;
  }

  if (axis === 'x' && Math.abs(push.x) > COLLISION_EPSILON) {
    return { x: push.x, y: 0 };
  }

  if (axis === 'y' && Math.abs(push.y) > COLLISION_EPSILON) {
    return { x: 0, y: push.y };
  }

  return push;
}

function resolveSolidCollisions(entity, map, preferredAxis) {
  const radius = entity.radius || CONFIG.entityRadius;

  for (let pass = 0; pass < 4; pass += 1) {
    let resolved = false;
    const range = getNearbyTileRange(map, entity.x, entity.y, radius);

    for (let tileY = range.minTileY; tileY <= range.maxTileY; tileY += 1) {
      for (let tileX = range.minTileX; tileX <= range.maxTileX; tileX += 1) {
        if (!isSolidTile(map, tileX, tileY)) {
          continue;
        }

        const push = getSeparationVector(entity.x, entity.y, radius, tileX, tileY);
        if (!push) {
          continue;
        }

        const offset = preferAxis(push, preferredAxis);
        entity.x += offset.x;
        entity.y += offset.y;
        resolved = true;
      }
    }

    if (!resolved) {
      break;
    }
  }
}

function clampEntityPosition(entity, map) {
  const radius = entity.radius || CONFIG.entityRadius;
  entity.x = clamp(entity.x, TILE_HALF_SIZE + radius, map[0].length - 1 - TILE_HALF_SIZE - radius);
  entity.y = clamp(entity.y, TILE_HALF_SIZE + radius, map.length - 1 - TILE_HALF_SIZE - radius);
}

function moveAlongAxis(entity, map, axis, delta) {
  if (!delta) {
    return;
  }

  entity[axis] += delta;
  clampEntityPosition(entity, map);
  resolveSolidCollisions(entity, map, axis);
  clampEntityPosition(entity, map);
}

function getTileCollisionAt(map, x, y, radius) {
  const range = getNearbyTileRange(map, x, y, radius);

  for (let tileY = range.minTileY; tileY <= range.maxTileY; tileY += 1) {
    for (let tileX = range.minTileX; tileX <= range.maxTileX; tileX += 1) {
      const tile = map[tileY] && map[tileY][tileX];
      if (tile !== TILE_WALL && tile !== TILE_COVER) {
        continue;
      }

      if (getSeparationVector(x, y, radius, tileX, tileY)) {
        return { tile, tileX, tileY, hitX: x, hitY: y };
      }
    }
  }

  return null;
}

function traceTileCollision(map, fromX, fromY, toX, toY, radius) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const samples = Math.max(6, Math.ceil(distance / 0.05));

  for (let i = 1; i <= samples; i += 1) {
    const t = i / samples;
    const x = fromX + dx * t;
    const y = fromY + dy * t;
    const collision = getTileCollisionAt(map, x, y, radius);
    if (collision) {
      return collision;
    }
  }

  return null;
}

function handleBulletWallAndCover(bullet, map, prevX, prevY) {
  const collision = traceTileCollision(
    map,
    prevX,
    prevY,
    bullet.x,
    bullet.y,
    bullet.radius || CONFIG.bulletRadius
  );

  if (!collision) {
    return { keep: true, collision: null };
  }

  if (collision.tile === TILE_WALL) {
    if (bullet.skillEffect === 'ping_pong') {
      return { keep: true, collision };
    }
    return { keep: false, collision };
  }

  map[collision.tileY][collision.tileX] = TILE_EMPTY;
  return { keep: false, collision };
}

function tryMove(entity, map, moveX, moveY, dt) {
  if (!moveX && !moveY) {
    return;
  }

  const vector = normalize(moveX, moveY);
  const distance = entity.speed * dt;
  const totalX = vector.x * distance;
  const totalY = vector.y * distance;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(totalX), Math.abs(totalY)) / MOVE_STEP));
  const stepX = totalX / steps;
  const stepY = totalY / steps;

  for (let i = 0; i < steps; i += 1) {
    moveAlongAxis(entity, map, 'x', stepX);
    moveAlongAxis(entity, map, 'y', stepY);
  }
}

function updateBullets(state, dt) {
  const survivors = [];

  for (let i = 0; i < state.bullets.length; i += 1) {
    const bullet = state.bullets[i];

    if (bullet.skillEffect !== 'ping_pong') {
      bullet.lifetime = (bullet.lifetime || CONFIG.bulletLifetime) - dt;
      if (bullet.lifetime <= 0) {
        continue;
      }
    }

    const prevX = bullet.x;
    const prevY = bullet.y;
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;

    const wallResult = handleBulletWallAndCover(bullet, state.map, prevX, prevY);
    if (!wallResult.keep) {
      continue;
    }

    if (bullet.skillEffect === 'boolean_motion' && typeof updateBullet === 'function') {
      updateBullet(bullet, dt, state);
      if (bullet.lifetime <= 0) {
        continue;
      }
    }

    if (bullet.skillEffect === 'ping_pong' && typeof handleBounce === 'function') {
      if (!handleBounce(bullet, state, wallResult.collision)) {
        continue;
      }
    }

    let hit = false;
    const targets = [state.entities.player, state.entities.enemy];

    for (let j = 0; j < targets.length; j += 1) {
      const target = targets[j];
      if (target.id === bullet.ownerId || target.hp <= 0) {
        continue;
      }

      const dx = target.x - bullet.x;
      const dy = target.y - bullet.y;
      const distSq = dx * dx + dy * dy;
      const hitR = (target.radius || CONFIG.entityRadius) + (bullet.radius || CONFIG.bulletRadius);

      if (distSq <= hitR * hitR) {
        const reduced = Math.max(1, bullet.damage - target.def);
        target.hp = Math.max(0, target.hp - reduced);
        target.action = ACTION_IDLE;
        hit = true;
        break;
      }

      if (typeof reflectAttack === 'function' && reflectAttack(target, bullet)) {
        hit = true;
        break;
      }
    }

    if (!hit) {
      survivors.push(bullet);
    }
  }

  state.bullets = survivors;
}

function updateAmmo(entity, dt) {
  entity.fireCooldown = Math.max(0, entity.fireCooldown - dt);
  if (entity.ammo > 0) {
    entity.reloadTimer = 0;
    return;
  }

  entity.reloadTimer += dt;
  if (entity.reloadTimer >= CONFIG.reloadDuration) {
    entity.ammo = CONFIG.maxAmmo;
    entity.reloadTimer = 0;
  }
}

function buildBullet(owner, command, fallbackTarget) {
  let vx = owner.facingX || 1;
  let vy = owner.facingY || 0;

  if (command.shootVector) {
    const vector = normalize(command.shootVector.x, command.shootVector.y);
    vx = vector.x;
    vy = vector.y;
  } else {
    const target = command.target || fallbackTarget;
    if (target) {
      const dx = target.x - owner.x;
      const dy = target.y - owner.y;
      const vector = normalize(dx, dy);
      vx = vector.x;
      vy = vector.y;
    }
  }

  return {
    ownerId: owner.id,
    ownerTeam: owner.team,
    x: owner.x + vx * (owner.radius + 0.3),
    y: owner.y + vy * (owner.radius + 0.3),
    vx: vx * CONFIG.bulletSpeed,
    vy: vy * CONFIG.bulletSpeed,
    damage: owner.atk,
    radius: CONFIG.bulletRadius,
    lifetime: CONFIG.bulletLifetime,
    skillEffect: owner.activeSkill || null,
  };
}

function tryShoot(entity, command, bullets, fallbackTarget, state) {
  if (!command.shoot || entity.fireCooldown > 0 || entity.ammo <= 0) {
    return;
  }

  if (!command.shootVector && !command.target && !fallbackTarget) {
    return;
  }

  const bullet = buildBullet(entity, command, fallbackTarget);
  bullets.push(bullet);
  processSkillBullet(entity, bullet, state);

  entity.ammo -= 1;
  entity.fireCooldown = CONFIG.fireCooldown;
  entity.action = 'shoot';
}

function updateWorld(state, commands, dt) {
  const player = state.entities.player;
  const enemy = state.entities.enemy;

  updateAmmo(player, dt);
  updateAmmo(enemy, dt);

  const playerCommand = commands.player || { type: ACTION_IDLE, moveX: 0, moveY: 0, shoot: false };
  const enemyCommand = commands.enemy || { type: ACTION_IDLE, moveX: 0, moveY: 0, shoot: false };

  player.action = playerCommand.type;
  enemy.action = enemyCommand.type;
  updateFacing(player, playerCommand);
  updateFacing(enemy, enemyCommand);

  tryMove(player, state.map, playerCommand.moveX, playerCommand.moveY, dt);
  tryMove(enemy, state.map, enemyCommand.moveX, enemyCommand.moveY, dt);

  tryShoot(player, playerCommand, state.bullets, enemy, state);
  tryShoot(enemy, enemyCommand, state.bullets, player, state);

  updateBullets(state, dt);
}

module.exports = {
  updateWorld,
};
