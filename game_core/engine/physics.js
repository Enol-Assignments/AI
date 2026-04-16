const {
  ACTION_IDLE,
  CONFIG,
  TILE_COVER,
  TILE_WALL,
} = require('../constants');

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

function buildBullet(owner, target) {
  const vector = normalize(target.x - owner.x, target.y - owner.y);
  return {
    ownerId: owner.id,
    ownerTeam: owner.team,
    x: owner.x + vector.x * (owner.radius + 0.18),
    y: owner.y + vector.y * (owner.radius + 0.18),
    vx: vector.x * CONFIG.bulletSpeed,
    vy: vector.y * CONFIG.bulletSpeed,
    damage: owner.atk,
    radius: CONFIG.bulletRadius,
  };
}

function tryShoot(entity, command, bullets, fallbackTarget) {
  if (!command.shoot || entity.fireCooldown > 0 || entity.ammo <= 0) {
    return;
  }

  const target = command.target || fallbackTarget;
  if (!target) {
    return;
  }

  bullets.push(buildBullet(entity, target));
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
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;

    const tileX = Math.round(bullet.x);
    const tileY = Math.round(bullet.y);
    const tile = state.map[tileY] && state.map[tileY][tileX];
    if (tile === TILE_WALL) {
      return;
    }

    if (tile === TILE_COVER) {
      state.map[tileY][tileX] = 0;
      return;
    }

    const targets = [state.entities.player, state.entities.enemy];
    for (let i = 0; i < targets.length; i += 1) {
      const target = targets[i];
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

  tryShoot(player, playerCommand, state.bullets, enemy);
  tryShoot(enemy, enemyCommand, state.bullets, player);

  updateBullets(state, dt);
}

module.exports = {
  updateWorld,
};
