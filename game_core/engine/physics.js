const {
  ACTION_IDLE,
  CONFIG,
  TILE_COVER,
  TILE_WALL,
  TILE_EMPTY,
  GRID_SIZE,
} = require('../constants');

const { processSkillBullet } = require('../skills/skillManager');
const { handleBounce, reflectAttack } = require('../skills/pingPong');
const { updateBullet } = require('../skills/booleanMotion');

// ====================== 工具函数 ======================

function toPixels(val) {
  return val * GRID_SIZE;
}

function isWallOrCover(map, x, y) {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (!map[ty] || map[ty][tx] === undefined) return true;
  const tile = map[ty][tx];
  return tile === TILE_WALL || tile === TILE_COVER;
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

// ====================== 实体碰撞 - 修复边缘透明墙问题 ======================

function resolveEntityCollisions(entity, map) {
  const radius = toPixels(entity.radius || CONFIG.entityRadius);
  const ex = toPixels(entity.x);
  const ey = toPixels(entity.y);
  const mapWidth = map[0].length;
  const mapHeight = map.length;

  for (let y = 0; y < mapHeight; y++) {
    for (let x = 0; x < mapWidth; x++) {
      if (map[y][x] !== TILE_WALL && map[y][x] !== TILE_COVER) continue;

      const rx = x * GRID_SIZE;
      const ry = y * GRID_SIZE;
      const rw = GRID_SIZE;
      const rh = GRID_SIZE;

      const closestX = Math.max(rx, Math.min(ex, rx + rw));
      const closestY = Math.max(ry, Math.min(ey, ry + rh));

      const dx = ex - closestX;
      const dy = ey - closestY;
      const distSq = dx * dx + dy * dy;

      if (distSq < radius * radius && distSq > 0.0001) {
        const dist = Math.sqrt(distSq) || 0.001;

        // 对地图最边缘的墙，推开力度减弱，避免“透明墙”感觉
        const isEdgeWall = (x === 0 || x === mapWidth - 1 || y === 0 || y === mapHeight - 1);
        const pushFactor = isEdgeWall ? 0.6 : 1.0;   // 边缘墙推开力度减小

        entity.x += (dx / dist) * (radius - dist + 2) * pushFactor / GRID_SIZE;
        entity.y += (dy / dist) * (radius - dist + 2) * pushFactor / GRID_SIZE;
      }
    }
  }
}

function tryMove(entity, map, moveX, moveY, dt) {
  if (!moveX && !moveY) return;

  const len = Math.sqrt(moveX * moveX + moveY * moveY) || 1;
  const vx = moveX / len;
  const vy = moveY / len;

  const distance = entity.speed * dt;
  const steps = 8;
  const step = distance / steps;

  for (let i = 0; i < steps; i++) {
    entity.x += vx * step;
    entity.y += vy * step;

    // 放宽边界限制，允许更靠近边缘
    entity.x = Math.max(0.5, Math.min(entity.x, map[0].length - 0.5));
    entity.y = Math.max(0.5, Math.min(entity.y, map.length - 0.5));

    resolveEntityCollisions(entity, map);
  }
}

// ====================== 子弹更新 ======================

function updateBullets(state, dt) {
  const survivors = [];

  for (let i = 0; i < state.bullets.length; i++) {
    const bullet = state.bullets[i];

    if (bullet.skillEffect !== 'ping_pong') {
      bullet.lifetime = (bullet.lifetime || CONFIG.bulletLifetime) - dt;
      if (bullet.lifetime <= 0) continue;
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

    for (let target of targets) {
      if (target.id === bullet.ownerId || target.hp <= 0) continue;

      const dx = target.x - bullet.x;
      const dy = target.y - bullet.y;
      const distSq = dx*dx + dy*dy;
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

// ====================== 其余函数保持不变 ======================

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
  let vx = 1, vy = 0;
  if (owner.team === 'player' && shootDirection) {
    switch (shootDirection) {
      case 'up':    vx=0; vy=-1; break;
      case 'down':  vx=0; vy=1; break;
      case 'left':  vx=-1; vy=0; break;
      case 'right': vx=1; vy=0; break;
    }
  } else {
    const dx = target.x - owner.x;
    const dy = target.y - owner.y;
    const len = Math.sqrt(dx*dx + dy*dy) || 1;
    vx = dx / len; vy = dy / len;
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
  if (!command.shoot || entity.fireCooldown > 0 || entity.ammo <= 0) return;
  const target = command.target || fallbackTarget;
  if (!target) return;

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