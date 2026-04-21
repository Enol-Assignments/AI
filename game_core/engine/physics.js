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

// ====================== 工具函数 ======================

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalize(x, y) {
  const length = Math.sqrt(x * x + y * y) || 1;
  return { x: x / length, y: y / length };
}

function isBlocked(map, x, y) {
  const tileX = Math.round(x);
  const tileY = Math.round(y);
  return !map[tileY]
    || map[tileY][tileX] === undefined
    || map[tileY][tileX] === TILE_WALL
    || map[tileY][tileX] === TILE_COVER;
}

// 多点采样检测 + 破坏掩体
function handleBulletWallAndCover(bullet, map) {
  const samples = 10;
  const prevX = bullet.x - bullet.vx * 0.025;
  const prevY = bullet.y - bullet.vy * 0.025;

  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const checkX = prevX + (bullet.x - prevX) * t;
    const checkY = prevY + (bullet.y - prevY) * t;

    const tx = Math.floor(checkX);
    const ty = Math.floor(checkY);

    if (!map[ty] || map[ty][tx] === undefined) continue;

    const tile = map[ty][tx];

    if (tile === TILE_WALL) {
      if (bullet.skillEffect !== 'ping_pong' && bullet.skillEffect !== 'boolean_motion') {
        return false;
      }
      if (bullet.skillEffect === 'boolean_motion') {
        return false;
      }
    }

    if (tile === TILE_COVER) {
      map[ty][tx] = TILE_EMPTY;

      if (bullet.skillEffect === 'ping_pong' || bullet.skillEffect === 'boolean_motion') {
        return false;
      }
      return false;
    }
  }
  return true;
}

function tryMove(entity, map, moveX, moveY, dt) {
  if (!moveX && !moveY) {
    return;
  }

  const vector = normalize(moveX, moveY);
  const distance = entity.speed * dt;
  const targetX = entity.x + vector.x * distance;
  const targetY = entity.y + vector.y * distance;

  if (!isBlocked(map, targetX, entity.y)) {
    entity.x = clamp(targetX, 1, map[0].length - 2);
  }

  if (!isBlocked(map, entity.x, targetY)) {
    entity.y = clamp(targetY, 1, map.length - 2);
  }
}

// ====================== 子弹更新 ======================

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

    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;

    if (!handleBulletWallAndCover(bullet, state.map)) {
      continue;
    }

    if (bullet.skillEffect === 'boolean_motion' && typeof updateBullet === 'function') {
      updateBullet(bullet, dt, state);
    }

    if (bullet.skillEffect === 'ping_pong' && typeof handleBounce === 'function') {
      if (!handleBounce(bullet, state)) {
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

function buildBullet(owner, target, shootDirection) {
  let vx = 1;
  let vy = 0;

  if (owner.team === 'player' && shootDirection) {
    switch (shootDirection) {
      case 'up':
        vx = 0;
        vy = -1;
        break;
      case 'down':
        vx = 0;
        vy = 1;
        break;
      case 'left':
        vx = -1;
        vy = 0;
        break;
      case 'right':
        vx = 1;
        vy = 0;
        break;
      default:
        break;
    }
  } else {
    const dx = target.x - owner.x;
    const dy = target.y - owner.y;
    const vector = normalize(dx, dy);
    vx = vector.x;
    vy = vector.y;
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

  const target = command.target || fallbackTarget;
  if (!target) {
    return;
  }

  const bullet = buildBullet(entity, target, command.shootDirection);
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

  tryMove(player, state.map, playerCommand.moveX, playerCommand.moveY, dt);
  tryMove(enemy, state.map, enemyCommand.moveX, enemyCommand.moveY, dt);

  tryShoot(player, playerCommand, state.bullets, enemy, state);
  tryShoot(enemy, enemyCommand, state.bullets, player, state);

  updateBullets(state, dt);
}

module.exports = {
  updateWorld,
};
