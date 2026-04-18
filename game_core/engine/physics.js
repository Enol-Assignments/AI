const {
  ACTION_IDLE,
  CONFIG,
  TILE_COVER,
  TILE_WALL,
} = require('../constants');
const { processSkillBullet } = require('../skills/skillManager');
const { handleBounce, reflectAttack } = require('../skills/pingPong');
const { updateBullet } = require('../skills/booleanMotion');

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
  let vector;
  if (owner.team === 'player' && shootDirection) {
    // 根据射击方向发射子弹
    switch (shootDirection) {
      case 'up':
        vector = { x: 0, y: -1 };
        break;
      case 'down':
        vector = { x: 0, y: 1 };
        break;
      case 'left':
        vector = { x: -1, y: 0 };
        break;
      case 'right':
      default:
        vector = { x: 1, y: 0 };
        break;
    }
  } else {
    // AI子弹或无方向时朝向目标
    vector = normalize(target.x - owner.x, target.y - owner.y);
  }
  return {
    ownerId: owner.id,
    ownerTeam: owner.team,
    x: owner.x + vector.x * (owner.radius + 0.18),
    y: owner.y + vector.y * (owner.radius + 0.18),
    vx: vector.x * CONFIG.bulletSpeed,
    vy: vector.y * CONFIG.bulletSpeed,
    damage: owner.atk,
    radius: CONFIG.bulletRadius,
    lifetime: CONFIG.bulletLifetime,
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

  // 处理技能子弹
  processSkillBullet(entity, bullet, state);

  entity.ammo -= 1;
  entity.fireCooldown = CONFIG.fireCooldown;
  entity.action = 'shoot';
}

function applyDamage(target, damage) {
  const reduced = Math.max(1, damage - target.def);
  target.hp = Math.max(0, target.hp - reduced);
}

function updateBullets(state, dt) {
  const survivors = [];

  state.bullets.forEach((bullet) => {
    // 更新子弹生命周期
    if (bullet.skillEffect !== 'ping_pong') {
      bullet.lifetime -= dt;
      if (bullet.lifetime <= 0) {
        return;
      }
    }

    // 更新布尔运动子弹
    updateBullet(bullet, dt, state);

    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;

    // 确保子弹不离开显示区域
    const mapWidth = state.map[0].length;
    const mapHeight = state.map.length;

    // 对于布尔运动子弹，确保在显示区域内
    if (bullet.skillEffect === 'boolean_motion') {
      bullet.x = clamp(bullet.x, 0.5, mapWidth - 1.5);
      bullet.y = clamp(bullet.y, 0.5, mapHeight - 1.5);
    }

    const tileX = Math.round(bullet.x);
    const tileY = Math.round(bullet.y);
    const tile = state.map[tileY] && state.map[tileY][tileX];

    // 处理乒乓球反弹
    if (!handleBounce(bullet, state)) {
      return;
    }

    if (tile === TILE_WALL) {
      // 非乒乓球和非布尔运动子弹碰到墙壁消失
      if (bullet.skillEffect !== 'ping_pong' && bullet.skillEffect !== 'boolean_motion') {
        return;
      }
    }

    if (tile === TILE_COVER) {
      state.map[tileY][tileX] = 0;
      // 非乒乓球和非布尔运动子弹碰到掩体消失
      if (bullet.skillEffect !== 'ping_pong' && bullet.skillEffect !== 'boolean_motion') {
        return;
      }
    }

    const targets = [state.entities.player, state.entities.enemy];
    for (let i = 0; i < targets.length; i += 1) {
      const target = targets[i];

      // 处理乒乓球手的反弹攻击
      if (target.id !== bullet.ownerId && reflectAttack(target, bullet)) {
        survivors.push(bullet);
        return;
      }

      if (target.id === bullet.ownerId || target.hp <= 0) {
        continue;
      }

      const dx = target.x - bullet.x;
      const dy = target.y - bullet.y;
      const distanceSq = dx * dx + dy * dy;
      const hitRadius = target.radius + bullet.radius;
      if (distanceSq <= hitRadius * hitRadius) {
        applyDamage(target, bullet.damage);
        target.action = ACTION_IDLE;
        return;
      }
    }

    survivors.push(bullet);
  });

  state.bullets = survivors;
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
